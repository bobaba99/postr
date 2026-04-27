/**
 * PDF import — Tier 0 entry point.
 *
 * Stream 1 (text): pdfjs.getTextContent() → cluster → role-assign →
 *                  reading-order sort → produce text/heading/title/
 *                  authors clusters.
 * Stream 2 (visual): pdfjs.getOperatorList() → enumerate paintImageXObject
 *                  → extract pixel data → upload via uploadPosterImage()
 *                  → produce image blocks pre-positioned in pt coords.
 *
 * Both streams converge on `synthesizeDoc()` which produces the final
 * `PosterDoc`.
 *
 * Multi-page PDFs are rejected (page 1 only — Tier 2 will lift this).
 * Low-text-density PDFs (Canva-flattened, etc.) are rejected with a
 * clear message pointing to the upcoming Tier 1 image-OCR path.
 */
import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';
import { nanoid } from 'nanoid';
import type {
  ImportProgressCallback,
  PartialBlock,
} from '@postr/shared';
import { uploadPosterImage, resolveStorageUrl } from '@/data/posterImages';
import { uploadUserLogo } from '@/data/userLogos';
import { ApiError, formatRetryAfter } from '@/lib/apiClient';
import { ptToIn, ptToUnits, unitsToPt } from '../poster/constants';
import {
  assignRoles,
  clusterTextItems,
  sortReadingOrder,
  splitHeadingClusters,
  type RawTextItem,
} from './clusterText';
import { synthesizeDoc, type SynthOutput } from './synthDoc';
import {
  classifyRegion,
  countFigures,
  extractFromRasterizedPage,
  splitMultiLogo,
  type CountFiguresResponse,
} from './imageImport';

// pdfjs needs a worker URL. Vite resolves this with `?url`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the `?url` import shape is provided by Vite at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

/** Dev-only trace logger. Gated behind `import.meta.env.DEV` so the
 *  ~3KB-per-import trace payload never lands in production console
 *  output. Same call shape as `console.debug` for grep-ability. */
function trace(tag: string, payload: unknown): void {
  if (!import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.debug(tag, payload);
}

export class PdfImportError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'multi-page'
      | 'no-text-layer'
      | 'parse-failed'
      | 'rate-limited'
      | 'unknown',
  ) {
    super(message);
    this.name = 'PdfImportError';
  }
}

/** Wrap a 429 ApiError into a user-facing PdfImportError. The
 *  rate-limit middleware uses two windows (per-minute burst + daily
 *  cap); the message in the body distinguishes them. */
function rateLimitToImportError(err: ApiError): PdfImportError {
  const wait = err.retryAfterSec
    ? ` Try again in ${formatRetryAfter(err.retryAfterSec)}.`
    : '';
  const isDaily =
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { error?: string }).error === 'daily_limit_exceeded';
  const lead = isDaily
    ? 'Daily AI import limit reached.'
    : 'Too many AI requests in the last minute.';
  return new PdfImportError(`${lead}${wait}`, 'rate-limited');
}

/** Threshold below which a PDF is considered "no usable text layer"
 *  and the user is routed to the Tier 1 image-OCR path. */
const MIN_CHAR_DENSITY_PER_IN2 = 1;
const MIN_CHARS_TOTAL = 200;

export interface ExtractFromPdfOptions {
  /**
   * Default **true**. Ships each medium-sized image block to Claude
   * Vision for a classify-region call. Decoration verdicts are
   * dropped, logo verdicts are promoted from image → logo type.
   * Small / logo-shaped bboxes are ALWAYS verified regardless of
   * this flag. Adds ~$0.005 per import + 5-15s of latency.
   *
   * Pass `false` to skip the medium-bbox pass (used by tests + the
   * rare caller that wants the fast path).
   */
  verifyDecorations?: boolean;
}

/**
 * Main entry point. Extracts a single-page text-layer PDF into a
 * `SynthOutput` ready for the preview modal.
 */
export async function extractFromPdf(
  file: File,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
  options: ExtractFromPdfOptions = {},
): Promise<SynthOutput> {
  onProgress({ stage: 'reading', detail: file.name });

  const buffer = await file.arrayBuffer();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: buffer }).promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF parse error';
    throw new PdfImportError(`Could not parse PDF: ${message}`, 'parse-failed');
  }

  if (pdf.numPages > 1) {
    throw new PdfImportError(
      `Multi-page PDFs are not yet supported — this file has ${pdf.numPages} pages.`,
      'multi-page',
    );
  }

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageWidthPt = viewport.width;
  const pageHeightPt = viewport.height;

  // ── Stream 1: text ─────────────────────────────────────────────
  onProgress({ stage: 'clustering' });
  const items = await collectTextItems(page, pageHeightPt);
  const totalChars = items.reduce((sum, it) => sum + it.str.length, 0);
  const pageAreaIn2 = ptToIn(pageWidthPt) * ptToIn(pageHeightPt);
  const charDensity = pageAreaIn2 > 0 ? totalChars / pageAreaIn2 : 0;

  if (totalChars < MIN_CHARS_TOTAL || charDensity < MIN_CHAR_DENSITY_PER_IN2) {
    // No usable text layer — rasterize the page and delegate to the
    // vision-based image OCR path. This covers Canva exports and
    // any PDF where the text was flattened to outlines.
    const SCALE = 2;
    const fallbackViewport = page.getViewport({ scale: SCALE });
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = fallbackViewport.width;
    fallbackCanvas.height = fallbackViewport.height;
    const fctx = fallbackCanvas.getContext('2d');
    if (!fctx) {
      throw new PdfImportError(
        'Could not rasterize page for vision fallback.',
        'parse-failed',
      );
    }
    await page.render({
      canvasContext: fctx,
      viewport: fallbackViewport,
    }).promise;
    return extractFromRasterizedPage(
      fallbackCanvas,
      pageWidthPt,
      pageHeightPt,
      posterId,
      userId,
      onProgress,
    );
  }

  const clusters = clusterTextItems(items);

  // ── Stream 2: figures ──────────────────────────────────────────
  // Extracted BEFORE text-role assignment so we can suppress text
  // clusters that fall inside a figure bbox (panel labels, citation
  // footers, axis tick text). pdfjs returns those as if they were
  // page text, but they belong to the figure pixels and re-appear
  // as orphan blocks after import otherwise.
  onProgress({ stage: 'uploading-figures', ratio: 0 });
  let figureResult: ExtractFiguresResult;
  try {
    figureResult = await extractFigures(
      page,
      pageWidthPt,
      pageHeightPt,
      posterId,
      userId,
      onProgress,
      options.verifyDecorations !== false, // default ON
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      throw rateLimitToImportError(err);
    }
    throw err;
  }
  const figureBlocks = figureResult.blocks;
  // Suppress in-figure text against ALL detected bboxes — including
  // bboxes whose pixel upload failed (504 etc.). Otherwise the figure
  // disappears from the page but its internal labels ("ADNI_MEM",
  // axis ticks) survive as orphan text blocks.
  const insideFiltered = filterClustersInsideFigures(
    clusters,
    figureResult.detectedBBoxes,
  );
  const bodyFontPt = medianBodyFontSize(insideFiltered);
  const filteredClusters = filterOrphanLabels(
    insideFiltered,
    figureResult.detectedBBoxes,
    bodyFontPt,
  );
  trace('[import.trace] text suppression', {
    inputClusters: clusters.length,
    afterInsideFigure: insideFiltered.length,
    afterOrphanLabel: filteredClusters.length,
    figureBBoxesUsed: figureResult.detectedBBoxes.length,
    droppedByInsideFigure: clusters
      .filter((c) => !insideFiltered.includes(c))
      .slice(0, 10)
      .map((c) => ({ text: c.text.slice(0, 40), font: Math.round(c.fontSizePt) })),
    droppedByOrphanLabel: insideFiltered
      .filter((c) => !filteredClusters.includes(c))
      .slice(0, 10)
      .map((c) => ({ text: c.text.slice(0, 40), font: Math.round(c.fontSizePt) })),
  });
  const roled = assignRoles(filteredClusters, pageHeightPt);
  // Split overlong heading clusters that swallowed bullet content.
  const split = splitHeadingClusters(roled);
  const ordered = sortReadingOrder(split, pageWidthPt);

  // ── Synthesize ─────────────────────────────────────────────────
  onProgress({ stage: 'building-preview' });
  const sourceFonts = [...new Set(items.map((i) => i.fontName).filter(Boolean) as string[])];
  const synth = synthesizeDoc({
    pageWidthPt,
    pageHeightPt,
    clusters: ordered,
    figureBlocks,
    sourceFonts,
    warnings: [
      'Reading order auto-detected from column layout — re-order via Auto-Arrange if needed.',
      sourceFonts.length > 0
        ? `Source fonts (${sourceFonts.slice(0, 3).join(', ')}${sourceFonts.length > 3 ? '…' : ''}) replaced with the editor default.`
        : '',
      figureResult.uploadFailures > 0
        ? `${figureResult.uploadFailures} figure${figureResult.uploadFailures === 1 ? '' : 's'} couldn't be uploaded (storage timeout). Drop the PDF again to retry the missing figures — your text has already been imported.`
        : '',
    ].filter(Boolean),
  });

  onProgress({ stage: 'ready' });
  return synth;
}

/** Pull every TextItem from a page, normalizing pdfjs's bottom-up
 *  coordinates to top-down so y=0 is the page top. */
async function collectTextItems(
  page: PDFPageProxy,
  pageHeightPt: number,
): Promise<RawTextItem[]> {
  const content = await page.getTextContent();
  const out: RawTextItem[] = [];
  for (const raw of content.items) {
    if (!isTextItem(raw)) continue;
    const it = raw as TextItem;
    const [a, , , d, e, f] = it.transform;
    const fontSize = Math.hypot(a ?? 0, d ?? 0);
    if (!it.str || fontSize <= 0) continue;
    out.push({
      str: it.str,
      x: e ?? 0,
      // Convert from bottom-up to top-down; pdfjs `f` is baseline y from
      // the bottom of the page.
      y: pageHeightPt - (f ?? 0) - fontSize,
      width: it.width ?? 0,
      height: fontSize,
      fontName: it.fontName,
    });
  }
  return out;
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item
  );
}

/** Bounding box in PDF page-pt coords with the y-axis flipped to
 *  top-down (y=0 = page top), so it's directly usable for canvas crop. */
export interface FigureBBox {
  /** Left edge, page-pt (top-down). */
  x: number;
  /** Top edge, page-pt (top-down). */
  y: number;
  w: number;
  h: number;
}

// Heuristics here are tuned per-poster from the actual size
// distribution of the extracted bboxes — what counts as "small" or
// "decoration" depends on whether the poster has 30 hero plots or 3
// pinky-nail icons. Hardcoded inch thresholds break on the long tail.

/** Pixels-per-inch in PDF user space. */
const PT_PER_INCH = 72;

/** Below this fraction of the page area, a bbox is dropped without
 *  classification. The cutoff has to be small enough that
 *  institutional logos survive — a Chrome-rendered 80×48 CSS-px
 *  logo lands at ~60×36 pt = 2160 pt² on a 36×24" page (~0.05%), so
 *  the previous 0.05% cutoff was right on the edge and the logos
 *  never reached the LLM verifier. 0.02% (~0.36 in² on a 36×24"
 *  page = a 0.6" × 0.6" thumbnail) lets logos through reliably; the
 *  LLM verifier + pixel-signature co-signal still drop genuine
 *  decoration cartoons in the same size range. */
const MIN_AREA_PAGE_FRACTION = 0.0002;

/** Reject slivers below this aspect ratio (min/max). At 1/15 a
 *  0.3" × 6" caption strip passes; a 0.1" × 5" hairline does not. */
const MIN_ASPECT = 1 / 15;

/** A bbox is "logo-like" when its max-dim is below this fraction of
 *  the median bbox max-dim on the page. So if the typical figure on a
 *  poster is 6", anything ≤ 60% × 6" = 3.6" max-dim counts as small.
 *  Two small bboxes never merge with each other — that's how we keep
 *  rows of logos / icon strips as separate blocks. */
const SMALL_BBOX_MEDIAN_FRACTION = 0.6;

/** Merge two image bboxes when the gap between them is below this
 *  fraction of the smaller of the two boxes' max-dims. So a 6"-wide
 *  plot will absorb fragments within ~0.3", but a 1" logo only
 *  absorbs neighbours within ~0.05" — the size of its own anti-alias
 *  ring, not adjacent siblings. */
const MERGE_GAP_FRACTION = 0.05;

/** Image bboxes whose top edge lies in the upper N% of the page get
 *  considered for `logo` classification. */
const LOGO_TOP_FRACTION = 0.18;

interface BBoxStats {
  /** Median max-dim across the supplied boxes (pt). */
  medianMaxDim: number;
  /** "Small" cutoff: maxDim ≤ smallCutoffPt → logo-like. */
  smallCutoffPt: number;
}

/** Compute per-poster size stats so downstream filters can adapt to
 *  the actual figure-size distribution on the page. Exported for
 *  tests. */
export function computeBBoxStats(boxes: FigureBBox[]): BBoxStats {
  if (boxes.length === 0) {
    return { medianMaxDim: 0, smallCutoffPt: 0 };
  }
  const dims = boxes.map((b) => Math.max(b.w, b.h)).sort((a, b) => a - b);
  const medianMaxDim = dims[Math.floor(dims.length / 2)] ?? 0;
  return {
    medianMaxDim,
    smallCutoffPt: medianMaxDim * SMALL_BBOX_MEDIAN_FRACTION,
  };
}

/**
 * Walk the page operator list and pull every embedded raster image.
 *
 * Three filtering stages before upload:
 *   1. Discard tiny / extreme-aspect images (decorative icons, hairlines)
 *   2. Merge bboxes whose gaps fall below `MERGE_GAP_INCHES` so plots
 *      rendered as multiple XObjects collapse into a single block
 *   3. Classify small upper-region images as `logo` instead of `image`
 *
 * Then render the page to a hidden canvas and crop each surviving
 * bbox into a PNG that gets uploaded to Storage.
 */
/** Result of the figure-extraction pass.
 *  - `blocks`: image / logo blocks that uploaded successfully.
 *  - `detectedBBoxes`: every bbox the pixel pipeline considered a
 *    figure, **regardless of upload outcome**. Used downstream to
 *    suppress in-figure text fragments — we want to drop "ADNI_MEM"
 *    even when the figure it belongs to failed to upload.
 *  - `uploadFailures`: count of bboxes whose pixel upload failed
 *    (504 / network). Surfaced as a warning to the user. */
interface ExtractFiguresResult {
  blocks: PartialBlock[];
  detectedBBoxes: FigureBBox[];
  uploadFailures: number;
}

async function extractFigures(
  page: PDFPageProxy,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
  verifyDecorations: boolean,
): Promise<ExtractFiguresResult> {
  const onItemDone = (done: number, total: number): void => {
    onProgress({
      stage: 'uploading-figures',
      ratio: total === 0 ? 1 : done / total,
    });
  };
  // Render the page at 2x scale for crisp figure crops.
  const RENDER_SCALE = 2;
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blocks: [], detectedBBoxes: [], uploadFailures: 0 };

  await page.render({ canvasContext: ctx, viewport }).promise;

  const rawBBoxes = collectImageBBoxes(
    await page.getOperatorList(),
    pageWidthPt,
    pageHeightPt,
  );

  // Stage 1+2+3: dedup → filter (page-area relative) → merge (per-poster
  // size-distribution relative).
  const filtered = filterDecorationBBoxes(
    rawBBoxes,
    pageWidthPt,
    pageHeightPt,
  );
  const stats = computeBBoxStats(filtered);
  const merged = mergeAdjacentBBoxes(filtered, stats);

  trace('[import.trace] bbox funnel', {
    raw: rawBBoxes.length,
    afterFilter: filtered.length,
    afterMerge: merged.length,
    medianMaxDimPt: Math.round(stats.medianMaxDim),
    smallCutoffPt: Math.round(stats.smallCutoffPt),
    mergedDims: merged.map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.w),
      h: Math.round(b.h),
    })),
  });

  /** Track every canvas we allocate so we can release them after the
   *  loop. The browser GC will eventually free them, but on a poster
   *  with 25 figures rendered at 2× we hold ~100 MB during extraction
   *  before that happens. */
  const allocatedCanvases: HTMLCanvasElement[] = [canvas];

  const total = merged.length;
  let done = 0;
  onItemDone(done, total);

  const blocks: PartialBlock[] = [];
  // Side arrays kept aligned to `blocks` for the LLM verifier pass:
  // smallBlockIndexes[i] is the block index for the i-th
  // bbox processed, or -1 when the bbox isn't classified as "small"
  // and shouldn't trigger an LLM call.
  const smallBlockIndexes: number[] = [];
  const smallBlockBBoxes: FigureBBox[] = [];
  // Pixel signature per emitted block — computed once during the
  // extraction loop, consumed later by the verifier as a co-signal
  // to confirm/refute LLM "decoration" verdicts. Indexed by block
  // index (matches `blocks.length - 1` at push time).
  const blockSignatures: (PixelSignature | null)[] = [];
  // Every bbox we try to extract — emitted regardless of whether the
  // crop / upload succeeds. The text-suppression pass uses this set
  // (not `blocks`) so figure-internal text fragments still get
  // dropped even when their parent figure failed to upload.
  const detectedBBoxes: FigureBBox[] = [];
  let uploadFailures = 0;
  // Per-bbox outcome trace for diagnosis: each entry records what
  // happened to this bbox so the user can see "5 detected, 3
  // uploaded, 1 blank, 1 upload-fail" at a glance. Logged once at
  // the end of the loop.
  const bboxOutcomes: { idx: number; w: number; h: number; outcome: string }[] = [];
  for (let bboxIdx = 0; bboxIdx < merged.length; bboxIdx++) {
    const bbox = merged[bboxIdx]!;
    // Push BEFORE any of the per-bbox `continue` paths below — we
    // want suppression to fire on bboxes that fail crop / are blank
    // / fail upload, not just on successfully-emitted blocks.
    detectedBBoxes.push(bbox);
    const traceRow = {
      idx: bboxIdx,
      w: Math.round(bbox.w),
      h: Math.round(bbox.h),
      outcome: '',
    };
    bboxOutcomes.push(traceRow);
    const cropCanvas = document.createElement('canvas');
    allocatedCanvases.push(cropCanvas);
    cropCanvas.width = Math.round(bbox.w * RENDER_SCALE);
    cropCanvas.height = Math.round(bbox.h * RENDER_SCALE);
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) {
      traceRow.outcome = 'no-crop-context';
      done++;
      onItemDone(done, total);
      continue;
    }
    cropCtx.drawImage(
      canvas,
      Math.round(bbox.x * RENDER_SCALE),
      Math.round(bbox.y * RENDER_SCALE),
      cropCanvas.width,
      cropCanvas.height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );

    // Tighten the crop to the bounding box of non-white content. The
    // PDF's image XObject often allocates whitespace padding around
    // the visible plot — without this pass, the editor draws an image
    // block much larger than the actual figure.
    const tight = tightenCanvasToContent(cropCanvas);
    if (tight === 'blank') {
      // Entirely-white canvas — skip the upload entirely, don't emit
      // an invisible image block.
      traceRow.outcome = 'blank';
      done++;
      onItemDone(done, total);
      continue;
    }
    if (tight) allocatedCanvases.push(tight.canvas);
    const finalCanvas = tight ? tight.canvas : cropCanvas;
    const offsetXPt = tight ? tight.offsetX / RENDER_SCALE : 0;
    const offsetYPt = tight ? tight.offsetY / RENDER_SCALE : 0;
    const finalWPt = tight ? tight.width / RENDER_SCALE : bbox.w;
    const finalHPt = tight ? tight.height / RENDER_SCALE : bbox.h;
    const tightBBox: FigureBBox = {
      x: bbox.x + offsetXPt,
      y: bbox.y + offsetYPt,
      w: finalWPt,
      h: finalHPt,
    };

    const blob = await canvasToBlob(finalCanvas, 'image/png');
    if (!blob) {
      traceRow.outcome = 'no-blob';
      done++;
      onItemDone(done, total);
      continue;
    }
    const blockId = nanoid(8);
    const file = new File([blob], `${blockId}.png`, { type: 'image/png' });
    const storageSrc = await uploadPosterImage(userId, posterId, blockId, file);
    if (!storageSrc) {
      traceRow.outcome = 'upload-failed';
      uploadFailures++;
      done++;
      onItemDone(done, total);
      continue;
    }

    // Verifier-trigger heuristic: anything "small" by per-poster
    // stats OR "logo-shaped" by absolute size warrants an LLM check.
    // The McGill / Douglas / ADNI pattern is small absolute (≤4")
    // but not below the median-relative cutoff on a figure-heavy
    // poster.
    const isSmall =
      (stats.smallCutoffPt > 0 &&
        Math.max(tightBBox.w, tightBBox.h) <= stats.smallCutoffPt) ||
      looksLikeLogo(tightBBox);
    const isLogo = classifyAsLogo(tightBBox, pageHeightPt, stats);
    traceRow.outcome = isLogo ? 'uploaded:logo' : isSmall ? 'uploaded:small-image' : 'uploaded:image';
    blocks.push({
      type: isLogo ? 'logo' : 'image',
      x: ptToUnits(tightBBox.x),
      y: ptToUnits(tightBBox.y),
      w: ptToUnits(tightBBox.w),
      h: ptToUnits(tightBBox.h),
      content: '',
      imageSrc: storageSrc,
      imageFit: 'contain',
      tableData: null,
    });
    smallBlockIndexes.push(isSmall ? blocks.length - 1 : -1);
    smallBlockBBoxes.push(tightBBox);
    // Compute the pixel signature only for small/logo-shaped blocks
    // (non-small bboxes are obvious figures, no verification cost).
    blockSignatures.push(isSmall ? computePixelSignature(finalCanvas) : null);

    done++;
    onItemDone(done, total);
  }

  trace('[import.trace] extraction outcomes', {
    total: bboxOutcomes.length,
    uploaded: bboxOutcomes.filter((o) => o.outcome.startsWith('uploaded')).length,
    blank: bboxOutcomes.filter((o) => o.outcome === 'blank').length,
    uploadFailed: bboxOutcomes.filter((o) => o.outcome === 'upload-failed').length,
    other: bboxOutcomes.filter((o) => !o.outcome.startsWith('uploaded') && o.outcome !== 'blank' && o.outcome !== 'upload-failed').length,
    rows: bboxOutcomes,
  });

  // Split candidates aggregated across the verifier + heuristic
  // passes. Multi-logo split runs UNCONDITIONALLY at the end,
  // regardless of whether the user opted into the LLM verifier —
  // McGill+Douglas merging is a high-impact case that should always
  // get one shot at being split.
  const splitCandidatesGlobal: {
    imageSrc: string;
    bbox: FigureBBox;
  }[] = [];

  // Heuristic-only candidates: any image block that's logo-shaped
  // (small + squarish per `looksLikeLogo`) gets queued for the split
  // pass — covers both horizontal banners (McGill+Douglas+ADNI side
  // by side) AND vertical stacks (McGill on top, Douglas below)
  // which have aspect ~1.4 and would slip past a 1.5 gate. The
  // split LLM call is a no-op when it sees only one logo, so the
  // false-positive cost is one extra ~$0.005 call per block.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'image' && b.type !== 'logo') continue;
    if (!b.imageSrc) continue;
    const bbox = smallBlockBBoxes[i];
    if (!bbox) continue;
    if (looksLikeLogo(bbox)) {
      splitCandidatesGlobal.push({ imageSrc: b.imageSrc, bbox });
    }
  }

  // ── LLM decoration verifier ───────────────────────────────────
  // Pure-pixel heuristics can't tell a "magnifier with chart" icon
  // from a small scatter plot. A single Claude Vision call per
  // suspect block fixes that — calls run in parallel with a 30s
  // total-time budget so a slow API can't freeze the import.
  //
  // Runs UNCONDITIONALLY on small / logo-shaped bboxes — the
  // `verifyDecorations` flag now only controls whether we ALSO
  // verify medium bboxes that pass the size filter. Decoration
  // icons are too damaging to user trust to gate behind a checkbox.
  const alwaysVerifySmall = true;
  if (alwaysVerifySmall || verifyDecorations) {
    const targets: { blockIdx: number; bbox: FigureBBox }[] = [];
    for (let i = 0; i < smallBlockIndexes.length; i++) {
      const blockIdx = smallBlockIndexes[i]!;
      if (blockIdx < 0) continue;
      targets.push({ blockIdx, bbox: smallBlockBBoxes[i]! });
    }

    if (targets.length > 0) {
      // Holistic pre-scan: ask the LLM to count expected figures,
      // tables, and logos for the WHOLE page in a single call. Used
      // as a CEILING on the per-bbox verdicts below — when the
      // per-bbox classifier over-shoots ("everything looks like a
      // figure"), we keep only the top-K verdicts by confidence.
      // Runs in parallel with the per-bbox calls so it adds no
      // latency to the critical path.
      const preScanPromise: Promise<CountFiguresResponse | null> =
        countFigures(canvas, pageWidthPt, pageHeightPt, posterId, userId).catch(
          () => null,
        );
      // eslint-disable-next-line no-console
      console.debug(
        `[import.verifier] running on ${targets.length} candidate bbox(es)`,
        targets.map((t) => ({
          maxDim: Math.max(t.bbox.w, t.bbox.h),
          minDim: Math.min(t.bbox.w, t.bbox.h),
          x: t.bbox.x,
          y: t.bbox.y,
        })),
      );
      onProgress({
        stage: 'llm-call',
        detail: `Verifying ${targets.length} small region${targets.length === 1 ? '' : 's'}…`,
      });
      const PER_CALL_TIMEOUT_MS = 8_000;
      const TOTAL_BUDGET_MS = Math.min(30_000, targets.length * 8_000);
      const deadline = Date.now() + TOTAL_BUDGET_MS;
      const RENDER_SCALE_FOR_CLASSIFY = 2;
      let done = 0;

      const verdicts = await Promise.all(
        targets.map(async (t) => {
          if (Date.now() >= deadline) return null;
          try {
            const result = await Promise.race([
              classifyRegion(
                canvas,
                t.bbox,
                pageWidthPt,
                pageHeightPt,
                posterId,
                userId,
                RENDER_SCALE_FOR_CLASSIFY,
              ),
              new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), PER_CALL_TIMEOUT_MS),
              ),
            ]);
            done++;
            onProgress({
              stage: 'llm-call',
              ratio: done / targets.length,
              detail: `Verifying figures ${done}/${targets.length}`,
            });
            return result;
          } catch {
            done++;
            return null;
          }
        }),
      );

      const dropIndexes = new Set<number>();
      const promotions = new Map<number, 'logo'>();
      const splitCandidates: {
        imageSrc: string;
        bbox: FigureBBox;
      }[] = [];
      // eslint-disable-next-line no-console
      console.debug(
        `[import.verifier] verdicts (${verdicts.filter(Boolean).length}/${verdicts.length} returned)`,
        verdicts.map((v, i) => ({
          target: i,
          maxDim: Math.max(targets[i]!.bbox.w, targets[i]!.bbox.h),
          kind: v?.kind,
          confidence: v?.confidence,
          representsData: v?.evidence?.representsQuantitativeData,
          isStylizedIcon: v?.evidence?.isStylizedIcon,
          axes: v?.evidence?.hasAxesWithTicks,
          marks: v?.evidence?.hasPlottedMarks,
        })),
      );

      // ── Step 1: cook each verdict with the strict-evidence guard ──
      // The model's overall `representsQuantitativeData` flag is not
      // enough — it has to be backed by AT LEAST ONE specific
      // encoding observation (axes-with-ticks / plotted-marks /
      // subplots / schematic-with-labels / grid-rows-and-cols).
      // Catches stylized icons the model rationalized as "data".
      type CookedVerdict = {
        blockIdx: number;
        bbox: FigureBBox;
        sourceImageSrc?: string;
        kind: 'figure' | 'table' | 'logo' | 'decoration';
        confidence: number;
      };
      const cooked: CookedVerdict[] = [];
      verdicts.forEach((verdict, i) => {
        if (!verdict) return;
        const blockIdx = targets[i]!.blockIdx;
        const bbox = targets[i]!.bbox;
        const sourceImageSrc = blocks[blockIdx]?.imageSrc ?? undefined;
        let kind: CookedVerdict['kind'] = verdict.kind;
        const ev = verdict.evidence;
        if (kind === 'figure' && ev) {
          const hasSpecificEncoding =
            ev.hasAxesWithTicks ||
            ev.hasPlottedMarks ||
            ev.hasMultipleSubplots ||
            ev.hasSchematicWithLabels ||
            ev.hasGridRowsAndCols;
          const looksReal =
            ev.representsQuantitativeData &&
            !ev.isStylizedIcon &&
            hasSpecificEncoding;
          if (!looksReal) {
            // eslint-disable-next-line no-console
            console.debug(
              '[import.verifier] downgrade figure→decoration (evidence guard)',
              {
                bbox,
                evidence: ev,
                originalKind: verdict.kind,
                confidence: verdict.confidence,
              },
            );
            kind = 'decoration';
          }
        }
        if (kind === 'table' && ev) {
          const looksReal =
            ev.hasGridRowsAndCols &&
            ev.hasNumericData &&
            !ev.isStylizedIcon;
          if (!looksReal) kind = 'decoration';
        }
        if (kind === 'logo' && ev?.isStylizedIcon) {
          kind = 'decoration';
        }

        // Pixel co-signal: when the LLM verdict is borderline AND
        // the pixel signature shows iconic structure (low color
        // count + low edge density), agree with the LLM toward
        // decoration. Two-of-two-must-agree gate prevents either
        // signal from being a sole decider — protects ADNI
        // (low colors, HIGH edge density from text strokes →
        // iconScore 0 → never demoted) AND catches cartoons that
        // the LLM mis-labeled as logos (low colors, low edges,
        // weak LLM confidence → both agree → drop).
        const sig = blockSignatures[blockIdx];
        const pixelIcon = sig ? iconScore(sig) : 0;
        const llmHedge =
          verdict.confidence < 0.7 ||
          (kind === 'logo' && ev && !ev.hasNumericData && !ev.hasGridRowsAndCols);
        if (
          (kind === 'logo' || kind === 'figure') &&
          pixelIcon >= 0.6 &&
          llmHedge
        ) {
          // eslint-disable-next-line no-console
          console.debug(
            '[import.verifier] downgrade via pixel-signature co-signal',
            {
              originalKind: kind,
              confidence: verdict.confidence,
              pixelIcon,
              signature: sig,
              evidence: ev,
            },
          );
          kind = 'decoration';
        }

        cooked.push({
          blockIdx,
          bbox,
          sourceImageSrc,
          kind,
          confidence: verdict.confidence,
        });
      });

      // ── Step 2: reconcile against the holistic pre-scan budget ──
      // The pre-scan returns the EXPECTED count of figures, tables,
      // and logos visible on the whole page. The per-bbox classifier
      // can over-shoot when noisy crops resemble plots; we sort by
      // confidence and demote the lowest-confidence over-shoot to
      // `decoration`. Trusted non-small image blocks (which never
      // went through the verifier) consume part of the figure budget
      // first — they're typically the real plots. Pre-scan failure
      // (network / API down) leaves the budget unenforced.
      // 20s ceiling on the pre-scan so a stalled vision call can't
      // freeze the import indefinitely. The classifyRegion loop above
      // has its own per-call + total deadline; this one is independent.
      const PRE_SCAN_TIMEOUT_MS = 20_000;
      const preScan = await Promise.race([
        preScanPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), PRE_SCAN_TIMEOUT_MS),
        ),
      ]);
      // eslint-disable-next-line no-console
      console.debug('[import.preScan] result', preScan);
      // Guard against an all-zeros pre-scan — the LLM occasionally
      // refuses or hallucinates "0 of everything", which would
      // wrongly demote every real figure on the page.
      const allZero =
        preScan !== null &&
        (preScan.expectedFigureCount ?? 0) === 0 &&
        (preScan.expectedTableCount ?? 0) === 0 &&
        (preScan.expectedLogoCount ?? 0) === 0;
      if (preScan && !allZero) {
        // The user thinks of "charts/tables" as one combined budget
        // ("4 charts/tables and 3 logos"). The LLM occasionally
        // mis-types a heatmap as a table or a stats grid as a figure;
        // a combined ceiling is robust to that confusion. Logos are
        // a separate axis (institutional marks vs data).
        const figureBudget =
          (preScan.expectedFigureCount ?? 0) +
          (preScan.expectedTableCount ?? 0);
        const logoBudget = preScan.expectedLogoCount ?? 0;

        // Trusted non-small blocks: image / logo blocks NOT in the
        // verifier targets. They bypassed the LLM verifier because
        // they were large enough to be obvious plots. Counted as
        // "figures" against the budget — derived from `blocks` and
        // `targets` directly so the count stays correct even if the
        // smallBlockIndexes mirror invariant ever drifts.
        const verifiedBlockIdx = new Set(targets.map((t) => t.blockIdx));
        let trustedNonSmallCount = 0;
        for (let i = 0; i < blocks.length; i++) {
          if (verifiedBlockIdx.has(i)) continue;
          const t = blocks[i]!.type;
          if (t === 'image' || t === 'logo') trustedNonSmallCount++;
        }

        const figureSlotsRemaining = Math.max(
          0,
          figureBudget - trustedNonSmallCount,
        );

        // Stable confidence sort, with bbox area DESC as a tiebreaker.
        // When three verdicts tie at 0.7 and the budget is 2, the
        // bigger bbox wins — real plots are almost always larger than
        // decoration icons, so this is the right structural signal.
        const byConfThenArea = (a: CookedVerdict, b: CookedVerdict): number =>
          b.confidence - a.confidence ||
          b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h;
        const figureLike = cooked
          .filter((c) => c.kind === 'figure' || c.kind === 'table')
          .sort(byConfThenArea);
        const logoLike = cooked
          .filter((c) => c.kind === 'logo')
          .sort(byConfThenArea);

        // Demote anything beyond the budget to `decoration` AND queue
        // for drop directly — bypassing the step-3 confidence floor
        // so a budget-demoted low-confidence verdict can't slip
        // through as the original `image` block.
        const demoted: { originalKind: CookedVerdict['kind']; confidence: number; bbox: FigureBBox }[] = [];
        for (let k = figureSlotsRemaining; k < figureLike.length; k++) {
          const c = figureLike[k]!;
          demoted.push({
            originalKind: c.kind,
            confidence: c.confidence,
            bbox: c.bbox,
          });
          c.kind = 'decoration';
          dropIndexes.add(c.blockIdx);
        }
        for (let k = logoBudget; k < logoLike.length; k++) {
          const c = logoLike[k]!;
          demoted.push({
            originalKind: c.kind,
            confidence: c.confidence,
            bbox: c.bbox,
          });
          c.kind = 'decoration';
          dropIndexes.add(c.blockIdx);
        }
        if (demoted.length > 0) {
          // eslint-disable-next-line no-console
          console.debug(
            `[import.budget] demoted ${demoted.length} verdict(s) past budget`,
            {
              figureBudget,
              logoBudget,
              trustedNonSmallCount,
              figureSlotsRemaining,
              demoted,
            },
          );
        }
      }

      // ── Step 3: apply drops / promotions / split candidates ──
      cooked.forEach((c) => {
        const { kind, blockIdx, bbox, sourceImageSrc, confidence } = c;
        if (kind === 'decoration' && confidence >= 0.5) {
          dropIndexes.add(blockIdx);
          return;
        }
        // Tiny "logo" verdicts get a tighter confidence floor (0.7
        // vs 0.5). Cartoon icons that survived both pixel-icon
        // pre-filter AND the strict-evidence guard usually came
        // back from the LLM as borderline-confidence logos
        // (~0.5–0.7); raising the floor catches that residual case
        // without hurting genuine brand marks (which the model
        // typically returns at ≥0.85 confidence).
        const isTiny = Math.max(bbox.w, bbox.h) <= 1.5 * PT_PER_INCH;
        const logoFloor = isTiny ? 0.7 : 0.5;
        if (kind === 'logo' && confidence >= logoFloor) {
          promotions.set(blockIdx, 'logo');
          if (sourceImageSrc) {
            splitCandidates.push({ imageSrc: sourceImageSrc, bbox });
          }
        } else if (kind === 'logo' && isTiny) {
          // Sub-floor tiny logo verdict — drop instead of promote.
          dropIndexes.add(blockIdx);
        } else if (kind === 'figure' && looksLikeLogo(bbox)) {
          // Borderline: small image the verifier called `figure` but
          // its dims are logo-shaped. Try the split pass anyway.
          if (sourceImageSrc) {
            splitCandidates.push({ imageSrc: sourceImageSrc, bbox });
          }
        }
      });

      if (dropIndexes.size > 0 || promotions.size > 0) {
        const filtered: PartialBlock[] = [];
        for (let i = 0; i < blocks.length; i++) {
          if (dropIndexes.has(i)) continue;
          const promoted = promotions.get(i);
          const b = blocks[i]!;
          filtered.push(promoted ? { ...b, type: promoted } : b);
        }
        blocks.length = 0;
        blocks.push(...filtered);
      }

      // Merge verifier-derived candidates into the global pool.
      for (const c of splitCandidates) {
        if (
          !splitCandidatesGlobal.some((g) => g.imageSrc === c.imageSrc)
        ) {
          splitCandidatesGlobal.push(c);
        }
      }

      // Save promoted single-logo blocks into the user's library.
      // Logos that get split below are saved per-sub-block by the
      // split pass — guard via `splitCandidatesGlobal` so we don't
      // double-save.
      for (const idx of promotions.keys()) {
        const src = blocks[idx]?.imageSrc;
        if (!src) continue;
        const willBeSplit = splitCandidatesGlobal.some(
          (c) => c.imageSrc === src,
        );
        if (willBeSplit) continue;
        void saveLogoToLibrary(src);
      }
    }
  }

  // ── Multi-logo split pass (unconditional) ──────────────────────
  // For every logo-shaped block, ask the model to return per-logo
  // sub-bboxes. If the model finds 2+ logos, crop each region out
  // of the page raster, upload separately, and replace the merged
  // block with N split blocks. The McGill / Douglas / ADNI banner
  // case. Runs even when the verifier is off because logo merging
  // is a high-impact bug — the user only needs an Anthropic key to
  // see the fix.
  if (splitCandidatesGlobal.length > 0) {
    onProgress({
      stage: 'llm-call',
      detail: `Splitting ${splitCandidatesGlobal.length} multi-logo block${splitCandidatesGlobal.length === 1 ? '' : 's'}…`,
    });
    const RENDER_SCALE_FOR_SPLIT = 2;
    trace('[import.trace] split-pass start', {
      candidateCount: splitCandidatesGlobal.length,
      candidates: splitCandidatesGlobal.map((c) => ({
        imageSrc: c.imageSrc,
        bboxW: Math.round(c.bbox.w),
        bboxH: Math.round(c.bbox.h),
        aspect: +(c.bbox.w / Math.max(1, c.bbox.h)).toFixed(2),
      })),
    });

    for (const cand of splitCandidatesGlobal) {
      // Render the candidate region into a parent canvas so both the
      // LLM splitter (via crop + upload inside splitMultiLogo) AND
      // the pixel-gap fallback can work from the same pixels.
      const parentCanvas = document.createElement('canvas');
      allocatedCanvases.push(parentCanvas);
      parentCanvas.width = Math.max(1, Math.round(cand.bbox.w * RENDER_SCALE_FOR_SPLIT));
      parentCanvas.height = Math.max(1, Math.round(cand.bbox.h * RENDER_SCALE_FOR_SPLIT));
      const pctx = parentCanvas.getContext('2d');
      if (pctx) {
        pctx.drawImage(
          canvas,
          Math.round(cand.bbox.x * RENDER_SCALE_FOR_SPLIT),
          Math.round(cand.bbox.y * RENDER_SCALE_FOR_SPLIT),
          parentCanvas.width,
          parentCanvas.height,
          0,
          0,
          parentCanvas.width,
          parentCanvas.height,
        );
      }

      // ── Attempt 1: LLM splitter ───────────────────────────────
      let llmSplit: Awaited<ReturnType<typeof splitMultiLogo>> = null;
      try {
        llmSplit = await splitMultiLogo(
          canvas,
          cand.bbox,
          pageWidthPt,
          pageHeightPt,
          posterId,
          userId,
          RENDER_SCALE_FOR_SPLIT,
        );
      } catch (err) {
        trace('[import.trace] split-pass llm error', {
          imageSrc: cand.imageSrc,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      const llmLogoCount = llmSplit?.logos?.length ?? 0;

      // ── Attempt 2 (fallback): pixel-gap segmenter ─────────────
      // Runs whenever the LLM returns < 2 logos. Catches the
      // McGill-on-top-of-Douglas case where the LLM sees the merged
      // image and either flags isSingleLogo or returns one bbox.
      let pixelSplit: LogoSubRect[] | null = null;
      const llmSayDontSplit =
        !llmSplit || llmSplit.isSingleLogo || llmLogoCount < 2;
      if (llmSayDontSplit) {
        pixelSplit = splitLogoByWhitespace(parentCanvas);
      }

      trace('[import.trace] split-pass result', {
        imageSrc: cand.imageSrc,
        bboxW: Math.round(cand.bbox.w),
        bboxH: Math.round(cand.bbox.h),
        canvasW: parentCanvas.width,
        canvasH: parentCanvas.height,
        llmIsSingle: llmSplit?.isSingleLogo ?? null,
        llmLogoCount,
        pixelSplitCount: pixelSplit?.length ?? 0,
        chosen: llmLogoCount >= 2 ? 'llm' : pixelSplit ? 'pixel-gap' : 'no-split',
      });

      // Pick whichever produced 2+ regions, preferring the LLM.
      let regions: { ptX: number; ptY: number; ptW: number; ptH: number }[] | null = null;
      if (llmLogoCount >= 2) {
        regions = llmSplit!.logos.map((l) => ({
          ptX: cand.bbox.x + l.bbox.x / RENDER_SCALE_FOR_SPLIT,
          ptY: cand.bbox.y + l.bbox.y / RENDER_SCALE_FOR_SPLIT,
          ptW: l.bbox.w / RENDER_SCALE_FOR_SPLIT,
          ptH: l.bbox.h / RENDER_SCALE_FOR_SPLIT,
        }));
      } else if (pixelSplit && pixelSplit.length >= 2) {
        regions = pixelSplit.map((r) => ({
          ptX: cand.bbox.x + r.x / RENDER_SCALE_FOR_SPLIT,
          ptY: cand.bbox.y + r.y / RENDER_SCALE_FOR_SPLIT,
          ptW: r.w / RENDER_SCALE_FOR_SPLIT,
          ptH: r.h / RENDER_SCALE_FOR_SPLIT,
        }));
      }
      if (!regions) continue;

      // Remove the merged block via its imageSrc (stable across
      // earlier drops/promotions; survives index shifts).
      const idx = blocks.findIndex((b) => b.imageSrc === cand.imageSrc);
      if (idx >= 0) blocks.splice(idx, 1);

      // Crop + upload + emit each sub-region.
      for (const region of regions) {
        if (region.ptW < 1 || region.ptH < 1) continue;
        const sub = document.createElement('canvas');
        allocatedCanvases.push(sub);
        sub.width = Math.round(region.ptW * RENDER_SCALE_FOR_SPLIT);
        sub.height = Math.round(region.ptH * RENDER_SCALE_FOR_SPLIT);
        const sctx = sub.getContext('2d');
        if (!sctx) continue;
        sctx.drawImage(
          canvas,
          Math.round(region.ptX * RENDER_SCALE_FOR_SPLIT),
          Math.round(region.ptY * RENDER_SCALE_FOR_SPLIT),
          sub.width,
          sub.height,
          0,
          0,
          sub.width,
          sub.height,
        );
        const subBlob = await canvasToBlob(sub, 'image/png');
        if (!subBlob) continue;
        const subId = nanoid(8);
        const subFile = new File([subBlob], `${subId}.png`, {
          type: 'image/png',
        });
        const subSrc = await uploadPosterImage(
          userId,
          posterId,
          subId,
          subFile,
        );
        if (!subSrc) continue;
        blocks.push({
          type: 'logo',
          x: ptToUnits(region.ptX),
          y: ptToUnits(region.ptY),
          w: ptToUnits(region.ptW),
          h: ptToUnits(region.ptH),
          content: '',
          imageSrc: subSrc,
          imageFit: 'contain',
          tableData: null,
        });
        void saveLogoToLibrary(subSrc);
      }
    }
  }

  // Release every allocated canvas immediately. With 25 figures at 2×
  // we hold ~100 MB before GC otherwise.
  for (const c of allocatedCanvases) {
    c.width = 0;
    c.height = 0;
  }

  return { blocks, detectedBBoxes, uploadFailures };
}

/**
 * Scan a cropped figure canvas and return a smaller canvas containing
 * just the non-white content rectangle (plus a small padding ring).
 * Returns `'blank'` when the canvas is entirely white/transparent so
 * the caller can skip the upload, or `null` when the savings are
 * below 3% in either axis (caller keeps the original canvas).
 *
 * "Non-white" is any pixel with at least one channel below 240 (so a
 * faint #f0f0f0 background still counts as content) AND alpha > 0.
 *
 * Scans every pixel — at 2× render scale a typical poster figure is
 * ~600 × 800 = 480k pixels which costs ~5 ms in a typed loop. Fine
 * for an offline import path.
 */
type TightenResult =
  | {
      canvas: HTMLCanvasElement;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
    }
  | null
  | 'blank';

/** Result of pixel-gap logo segmentation. Each entry is a tight
 *  pixel-space rectangle around one of the sub-logos found inside
 *  a parent canvas. Coords are relative to the parent canvas
 *  (origin top-left). */
export interface LogoSubRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Threshold + minimum-gap-fraction tuned for typical poster logo
 *  banners. WHITE_THRESHOLD: any channel ≥ this counts as whitespace.
 *  ROW_WHITE_FRACTION: rows with ≥ this fraction of white pixels are
 *  considered whitespace rows. MIN_GAP_FRACTION: a run of whitespace
 *  rows ≥ this fraction of the dimension counts as a real gap (not
 *  just inter-character padding). */
const SEGMENT_WHITE_THRESHOLD = 245;
const SEGMENT_ROW_WHITE_FRACTION = 0.985;
const SEGMENT_MIN_GAP_FRACTION = 0.06;

/**
 * Walk a logo canvas looking for a clear horizontal whitespace band
 * (multiple-logos-stacked-vertically case: McGill on top of Douglas,
 * with a thin-but-visible gap between them) AND a clear vertical
 * whitespace band (logos-side-by-side case: McGill ... Douglas ...
 * ADNI). Returns 2+ tight sub-rectangles when a split is possible,
 * or null when the image is a single logo.
 *
 * Deterministic; no LLM. Pairs with the LLM-driven precheck — the
 * LLM is the source of truth for "where are the logos" but it
 * sometimes returns a single bbox for two stacked logos. This
 * pixel-gap pass catches that case downstream.
 *
 * Exported for unit testing.
 */
export function splitLogoByWhitespace(
  source: HTMLCanvasElement,
): LogoSubRect[] | null {
  const w = source.width;
  const h = source.height;
  if (w < 8 || h < 8) return null;
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, w, h).data;
  return splitLogoByWhitespacePure(data, w, h);
}

/** Pixel signature of a region — used as a CO-SIGNAL alongside the
 *  LLM verifier. Two cheap signals:
 *    - dominantColors: distinct color buckets (4-bit-per-channel
 *      quantization) holding ≥0.5% of pixels each. Cartoon icons
 *      have 2–6, text-bearing logos and charts have many more.
 *    - edgeDensity: fraction of pixels where the local 4-neighbour
 *      max-channel-difference exceeds 50. Text and chart strokes
 *      produce many edges per area; cartoon flats produce few.
 *
 *  Decision lives in the caller — pure pixel data is too ambiguous
 *  to drop content unilaterally (a 3-color brand mark and a 3-color
 *  cartoon look identical to a color counter). The CALLER combines
 *  this with the LLM's verdict and only drops on agreement. */
export interface PixelSignature {
  dominantColors: number;
  edgeDensity: number;
}

const SIGNATURE_MIN_BUCKET_FRACTION = 0.005;
const SIGNATURE_EDGE_DELTA = 50;

/** Wraps the canvas to extract pixel data, then defers to the pure
 *  inner function. Returns null for degenerate canvases. */
export function computePixelSignature(
  source: HTMLCanvasElement,
): PixelSignature | null {
  const w = source.width;
  const h = source.height;
  if (w < 4 || h < 4) return null;
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, w, h).data;
  return computePixelSignaturePure(data, w, h);
}

/** Pure inner of computePixelSignature — exported for unit tests
 *  without needing a real Canvas2D context. */
export function computePixelSignaturePure(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): PixelSignature {
  const pixelCount = w * h;
  if (pixelCount === 0) return { dominantColors: 0, edgeDensity: 0 };

  // ── Dominant color count ────────────────────────────────────
  const buckets = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a === 0) continue;
    const r = (data[i]! >> 4) & 0xf;
    const g = (data[i + 1]! >> 4) & 0xf;
    const b = (data[i + 2]! >> 4) & 0xf;
    const key = (r << 8) | (g << 4) | b;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const minPx = Math.max(1, Math.floor(pixelCount * SIGNATURE_MIN_BUCKET_FRACTION));
  let dominantColors = 0;
  for (const v of buckets.values()) {
    if (v >= minPx) dominantColors++;
  }

  // ── Edge density (4-neighbour max-channel-difference) ───────
  // Sample every pixel; for performance on large canvases this
  // could be downsampled, but for sub-2" logo crops the canvas is
  // typically ≤ 300×300 px so the full pass is fine.
  let edgePixels = 0;
  let scannedPixels = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! === 0) continue;
      scannedPixels++;
      const r0 = data[i]!;
      const g0 = data[i + 1]!;
      const b0 = data[i + 2]!;
      // Right neighbour only — captures vertical strokes (which
      // dominate text). Cuts the inner loop cost in half versus a
      // full 4-neighbour scan with no measurable accuracy loss
      // for the icon-vs-text distinction.
      const ir = i + 4;
      const dr = Math.abs(r0 - data[ir]!);
      const dg = Math.abs(g0 - data[ir + 1]!);
      const db = Math.abs(b0 - data[ir + 2]!);
      if (Math.max(dr, dg, db) > SIGNATURE_EDGE_DELTA) {
        edgePixels++;
      }
    }
  }
  const edgeDensity = scannedPixels > 0 ? edgePixels / scannedPixels : 0;

  return { dominantColors, edgeDensity };
}

/** Heuristic confidence (0..1) that a region is a stock icon and
 *  NOT a text-bearing brand logo. Only meaningful in combination
 *  with the LLM verdict — the caller drops a region only when the
 *  LLM also says "decoration" (or low-confidence "logo").
 *
 *  Score climbs with low color count AND low edge density:
 *    - dominantColors ≤ 4 AND edgeDensity < 4%   → 0.9 (very iconic)
 *    - dominantColors ≤ 6 AND edgeDensity < 6%   → 0.6 (likely iconic)
 *    - dominantColors ≤ 6 AND edgeDensity < 8%   → 0.3 (borderline)
 *    - everything else                            → 0   (text/chart)
 *
 *  ADNI logo lands at edgeDensity ~10–15% (text strokes), so
 *  iconScore = 0 → never gets dropped regardless of color count. */
export function iconScore(sig: PixelSignature): number {
  const { dominantColors: dc, edgeDensity: ed } = sig;
  // No signal — fully-transparent / empty / unscannable region.
  // Returning a high score here would cause every empty crop to
  // get demoted as an icon.
  if (dc === 0) return 0;
  if (dc <= 4 && ed < 0.04) return 0.9;
  if (dc <= 6 && ed < 0.06) return 0.6;
  if (dc <= 6 && ed < 0.08) return 0.3;
  return 0;
}

/** Pure inner of splitLogoByWhitespace — takes raw RGBA pixel data
 *  and dimensions, returns sub-rect candidates. Exported for unit
 *  testing without needing a real Canvas2D context (jsdom lacks
 *  one). */
export function splitLogoByWhitespacePure(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): LogoSubRect[] | null {
  if (w < 8 || h < 8) return null;
  // ── Per-row whitespace detection ─────────────────────────────
  const rowIsWhite = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let whiteCount = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      // Treat fully transparent as whitespace.
      if (a === 0) {
        whiteCount++;
        continue;
      }
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (
        r >= SEGMENT_WHITE_THRESHOLD &&
        g >= SEGMENT_WHITE_THRESHOLD &&
        b >= SEGMENT_WHITE_THRESHOLD
      ) {
        whiteCount++;
      }
    }
    rowIsWhite[y] = whiteCount / w >= SEGMENT_ROW_WHITE_FRACTION ? 1 : 0;
  }
  const horizontalSplits = findSplitsAcrossRuns(rowIsWhite, h);

  // ── Per-column whitespace detection ──────────────────────────
  const colIsWhite = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let whiteCount = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      if (a === 0) {
        whiteCount++;
        continue;
      }
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (
        r >= SEGMENT_WHITE_THRESHOLD &&
        g >= SEGMENT_WHITE_THRESHOLD &&
        b >= SEGMENT_WHITE_THRESHOLD
      ) {
        whiteCount++;
      }
    }
    colIsWhite[x] = whiteCount / h >= SEGMENT_ROW_WHITE_FRACTION ? 1 : 0;
  }
  const verticalSplits = findSplitsAcrossRuns(colIsWhite, w);

  // Prefer the axis with MORE splits. If both axes split, take the
  // larger one — typical multi-logo banners are arranged on a
  // single primary axis and producing a 2D grid is usually wrong.
  const useHorizontal = horizontalSplits.length >= verticalSplits.length;
  const splits = useHorizontal ? horizontalSplits : verticalSplits;
  if (splits.length === 0) return null;

  // Convert split positions into rectangles. For horizontal splits,
  // each rect spans the full width and a vertical slice. For
  // vertical splits, each rect spans the full height and a
  // horizontal slice.
  const out: LogoSubRect[] = [];
  if (useHorizontal) {
    let prev = 0;
    for (const s of splits) {
      out.push({ x: 0, y: prev, w, h: s - prev });
      prev = s;
    }
    out.push({ x: 0, y: prev, w, h: h - prev });
  } else {
    let prev = 0;
    for (const s of splits) {
      out.push({ x: prev, y: 0, w: s - prev, h });
      prev = s;
    }
    out.push({ x: prev, y: 0, w: w - prev, h });
  }

  // Tighten each sub-rect to its non-white content (re-uses the
  // same single-channel scan as the parent crop but bounded to the
  // sub-rect). Drop sub-rects that are entirely white — they were
  // edge padding, not a real logo.
  const tightSubs: LogoSubRect[] = [];
  for (const sub of out) {
    const tight = tightenSubRect(data, w, sub);
    if (tight) tightSubs.push(tight);
  }
  return tightSubs.length >= 2 ? tightSubs : null;
}

/** Walk a per-row whitespace mask and return split coordinates —
 *  the midpoint of each whitespace run that is ≥ MIN_GAP_FRACTION
 *  of the dimension. Edge runs (starting at 0 or ending at length)
 *  are ignored — those are padding, not a gap between logos. */
function findSplitsAcrossRuns(mask: Uint8Array, length: number): number[] {
  const minGap = Math.max(3, Math.round(length * SEGMENT_MIN_GAP_FRACTION));
  const splits: number[] = [];
  let runStart: number | null = null;
  for (let i = 0; i <= length; i++) {
    const isWhite = i < length && mask[i] === 1;
    if (isWhite) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      const runLen = i - runStart;
      if (runLen >= minGap && runStart > 0 && i < length) {
        splits.push(Math.floor(runStart + runLen / 2));
      }
      runStart = null;
    }
  }
  return splits;
}

/** Tighten a sub-rect to its non-white content. Returns null when
 *  the rect is entirely white (edge padding from a split). */
function tightenSubRect(
  data: Uint8ClampedArray,
  parentW: number,
  rect: LogoSubRect,
): LogoSubRect | null {
  let minX = rect.w;
  let minY = rect.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = ((rect.y + y) * parentW + (rect.x + x)) * 4;
      const a = data[i + 3]!;
      if (a === 0) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (
        r < SEGMENT_WHITE_THRESHOLD ||
        g < SEGMENT_WHITE_THRESHOLD ||
        b < SEGMENT_WHITE_THRESHOLD
      ) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const PAD = 1;
  const tx = Math.max(0, minX - PAD);
  const ty = Math.max(0, minY - PAD);
  const tw = Math.min(rect.w - tx, maxX - minX + 1 + 2 * PAD);
  const th = Math.min(rect.h - ty, maxY - minY + 1 + 2 * PAD);
  return { x: rect.x + tx, y: rect.y + ty, w: tw, h: th };
}

function tightenCanvasToContent(source: HTMLCanvasElement): TightenResult {
  const w = source.width;
  const h = source.height;
  if (w === 0 || h === 0) return 'blank';
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, w, h).data;

  const WHITE_THRESHOLD = 245; // any channel below this counts as content
  const PAD_PX = 1; // tight padding so the block aspect-ratio matches the visible figure

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      if (a === 0) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (
        r < WHITE_THRESHOLD ||
        g < WHITE_THRESHOLD ||
        b < WHITE_THRESHOLD
      ) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return 'blank'; // entirely blank — caller skips upload

  minX = Math.max(0, minX - PAD_PX);
  minY = Math.max(0, minY - PAD_PX);
  maxX = Math.min(w - 1, maxX + PAD_PX);
  maxY = Math.min(h - 1, maxY + PAD_PX);

  const tightW = maxX - minX + 1;
  const tightH = maxY - minY + 1;

  // Skip the rebuild only when there is essentially nothing to tighten
  // — anything ≥1% savings is worth the second canvas allocation
  // because empty padding inside an image block is visually obvious
  // (the user's complaint).
  if (tightW > w * 0.99 && tightH > h * 0.99) return null;

  const out = document.createElement('canvas');
  out.width = tightW;
  out.height = tightH;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(source, -minX, -minY);

  return { canvas: out, offsetX: minX, offsetY: minY, width: tightW, height: tightH };
}

/**
 * Walk pdfjs's operator list, tracking the CTM stack, and emit every
 * image-paint op's bbox in top-down page-pt coords. Drops degenerate
 * (≤1pt) and off-page bboxes immediately so callers don't have to.
 *
 * Exported for unit testing.
 */
export function collectImageBBoxes(
  opList: { fnArray: number[]; argsArray: unknown[] },
  pageWidthPt: number,
  pageHeightPt: number,
): FigureBBox[] {
  const ops = pdfjs.OPS;
  const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
  const top = (): number[] => ctmStack[ctmStack.length - 1]!;

  const figures: { transform: number[]; name: string }[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = (opList.argsArray[i] as unknown[] | undefined) ?? [];
    if (fn === ops.save) {
      ctmStack.push([...top()]);
    } else if (fn === ops.restore) {
      if (ctmStack.length > 1) ctmStack.pop();
    } else if (fn === ops.transform) {
      ctmStack[ctmStack.length - 1] = multiplyTransform(
        top(),
        args as number[],
      );
    } else if (
      fn === ops.paintImageXObject ||
      fn === ops.paintInlineImageXObject ||
      fn === ops.paintImageXObjectRepeat
    ) {
      const name = (args[0] as string) ?? `inline-${i}`;
      figures.push({ transform: [...top()], name });
    }
  }

  const uniq = dedupeFigures(figures);
  const out: FigureBBox[] = [];
  for (const { transform } of uniq) {
    const [x0, y0] = applyTransform(transform, 0, 0);
    const [x1, y1] = applyTransform(transform, 1, 1);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const maxY = Math.max(y0, y1);
    const widthPt = maxX - minX;
    const heightPt = maxY - Math.min(y0, y1);
    const topPt = pageHeightPt - maxY;

    if (widthPt <= 1 || heightPt <= 1) continue;
    if (
      minX < -1 ||
      topPt < -1 ||
      minX + widthPt > pageWidthPt + 1 ||
      topPt + heightPt > pageHeightPt + 1
    ) {
      // Off-page (clipped header decoration etc.) — drop.
      continue;
    }
    out.push({ x: minX, y: topPt, w: widthPt, h: heightPt });
  }
  return out;
}

/**
 * Drop bboxes that are clearly decoration: too small a fraction of the
 * page area, or extreme aspect ratios (hairlines, dividers).
 *
 * The page-area fraction is dynamic — `MIN_AREA_PAGE_FRACTION` is a
 * percentage, not an absolute inch threshold. Same code path works
 * for a 24" letter poster and a 48" hero poster.
 *
 * Exported for unit testing.
 */
export function filterDecorationBBoxes(
  boxes: FigureBBox[],
  pageWidthPt: number,
  pageHeightPt: number,
): FigureBBox[] {
  const pageArea = pageWidthPt * pageHeightPt;
  const minArea = pageArea * MIN_AREA_PAGE_FRACTION;
  return boxes.filter((b) => {
    if (b.w * b.h < minArea) return false;
    const minDim = Math.min(b.w, b.h);
    const maxDim = Math.max(b.w, b.h);
    if (minDim / maxDim < MIN_ASPECT) return false;
    return true;
  });
}

/**
 * Largest max-dim (inches) for a bbox to be considered "small enough
 * that it might be a logo." Two small bboxes never merge with each
 * other — that's the McGill/Douglas/ADNI strip, where 3 logos sit in
 * a row with sub-0.4" gaps. Pure proximity-merging would collapse
 * them into a single 7"-wide block.
 *
 * Plot fragments (axis label + data area, etc.) usually involve at
 * least one large bbox, so small-↔-large merges still happen.
 */
/**
 * Union-find merge of bboxes whose gap is below a SIZE-RELATIVE
 * threshold derived from each pair's smaller bbox.
 *
 * Two adaptive rules, both keyed off the per-poster `stats`:
 *   1. Two "small" bboxes (max-dim ≤ stats.smallCutoffPt, i.e. below
 *      60% of the median bbox max-dim on this page) never merge with
 *      each other. Keeps rows of logos / icons separate without
 *      hardcoding what "small" means in absolute inches.
 *   2. Pairs only merge when their gap is < smaller-bbox-max-dim
 *      × MERGE_GAP_FRACTION. A 6" plot pulls in fragments within
 *      ~0.3"; a 1" logo only absorbs neighbours within ~0.05".
 *
 * Exported for unit testing.
 */
export function mergeAdjacentBBoxes(
  boxes: FigureBBox[],
  stats: BBoxStats,
): FigureBBox[] {
  if (boxes.length === 0) return [];
  const isSmall = (b: FigureBBox): boolean =>
    stats.smallCutoffPt > 0 &&
    Math.max(b.w, b.h) <= stats.smallCutoffPt;
  const pairGapThreshold = (a: FigureBBox, b: FigureBBox): number => {
    const smaller = Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h));
    return smaller * MERGE_GAP_FRACTION;
  };

  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (isSmall(a) && isSmall(b)) continue;
      // Don't merge two logo-shaped bboxes even if they're both
      // "large" by the per-poster median. A McGill + Douglas pair
      // sits ~3" apart (within the 5%-of-median gap on a poster
      // where median is 12"), but they're conceptually distinct.
      if (looksLikeLogo(a) && looksLikeLogo(b)) continue;
      if (bboxGap(a, b) > pairGapThreshold(a, b)) continue;
      union(i, j);
    }
  }

  const groups = new Map<number, FigureBBox[]>();
  for (let i = 0; i < boxes.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(boxes[i]!);
  }

  return [...groups.values()].map((g) => {
    const x = Math.min(...g.map((b) => b.x));
    const y = Math.min(...g.map((b) => b.y));
    const x2 = Math.max(...g.map((b) => b.x + b.w));
    const y2 = Math.max(...g.map((b) => b.y + b.h));
    return { x, y, w: x2 - x, h: y2 - y };
  });
}

/** Heuristic: bbox dimensions that suggest an institutional logo
 *  (McGill, ADNI, Douglas, etc) — squarish + small. Used by the
 *  merge step to prevent collapsing a horizontal logo strip into one
 *  multi-logo block, and by the LLM verifier as the "should I check
 *  this?" gate before spending an API call. */
function looksLikeLogo(bbox: FigureBBox): boolean {
  const maxDim = Math.max(bbox.w, bbox.h);
  const minDim = Math.min(bbox.w, bbox.h);
  if (maxDim === 0) return false;
  const aspect = minDim / maxDim;
  // 0.3..1.0 — squarish. Wider-than-3:1 (banners) and taller-than-3:1
  // (sidebar strips) aren't logo-shaped.
  if (aspect < 0.3) return false;
  // ≤ 4" max dim. Above this we're in chart / diagram territory.
  return maxDim <= 4 * PT_PER_INCH;
}

/** Convert a synthesized image block back to a page-pt bbox. Returns
 *  null for non-image blocks (text, etc.) which never have spatial
 *  coords in pt — safe to use with `.filter(Boolean)`.
 *
 *  IMPORTANT: must be called on figure blocks BEFORE `synthesizeDoc`'s
 *  snap-to-grid pass — otherwise the SNAP_GRID rounding shifts coords
 *  by up to half a unit (~3pt), which would misalign overlap math
 *  against pdfjs's pt-space text clusters. */
function bboxFromBlock(block: PartialBlock): FigureBBox | null {
  if (block.type !== 'image' && block.type !== 'logo') return null;
  if (
    typeof block.x !== 'number' ||
    typeof block.y !== 'number' ||
    typeof block.w !== 'number' ||
    typeof block.h !== 'number'
  )
    return null;
  return {
    x: unitsToPt(block.x),
    y: unitsToPt(block.y),
    w: unitsToPt(block.w),
    h: unitsToPt(block.h),
  };
}

/** Suppress text clusters whose bbox is mostly inside a figure
 *  bbox. pdfjs returns figure-internal text (panel labels like
 *  "ADNI_MEM", citation footers like "1,2,3", axis ticks) as if it
 *  were page text — those would otherwise show up as orphan text
 *  blocks floating around the imported poster. We keep clusters
 *  with ≥40% area inside a figure as figure-internal noise.
 *
 *  IMPORTANT: both `clusters[].bbox` and `figureBBoxes` MUST be in
 *  page-pt. Mixing units silently fails (the overlap area becomes
 *  ~50× too small and never crosses the threshold).
 *
 *  Figure bboxes get shrink-fit by `FIGURE_INSET_PT` before the
 *  overlap test so a caption rendered just below a figure (and
 *  therefore touching the figure's padded bbox edge) survives.
 *
 *  Exported for unit testing. */
const FIGURE_INSET_PT = 3;
export function filterClustersInsideFigures<
  T extends { bbox: { x: number; y: number; w: number; h: number } },
>(clusters: T[], figureBBoxes: FigureBBox[]): T[] {
  if (figureBBoxes.length === 0) return clusters;
  const OVERLAP_THRESHOLD = 0.4;
  // Shrink-fit each figure bbox so captions that sit a few pt
  // beyond the visible figure pixels (but within the bbox padding
  // from `tightenCanvasToContent` + RENDER_SCALE rounding) are not
  // wrongly classified as figure-internal text.
  const insetFigures = figureBBoxes
    .map((f) => ({
      x: f.x + FIGURE_INSET_PT,
      y: f.y + FIGURE_INSET_PT,
      w: Math.max(0, f.w - 2 * FIGURE_INSET_PT),
      h: Math.max(0, f.h - 2 * FIGURE_INSET_PT),
    }))
    .filter((f) => f.w > 0 && f.h > 0);
  return clusters.filter((c) => {
    const cArea = c.bbox.w * c.bbox.h;
    if (cArea <= 0) return true;
    for (const fig of insetFigures) {
      const ix = Math.max(0, Math.min(c.bbox.x + c.bbox.w, fig.x + fig.w) - Math.max(c.bbox.x, fig.x));
      const iy = Math.max(0, Math.min(c.bbox.y + c.bbox.h, fig.y + fig.h) - Math.max(c.bbox.y, fig.y));
      const overlap = ix * iy;
      if (overlap / cArea >= OVERLAP_THRESHOLD) return false;
    }
    return true;
  });
}

/** Pattern for label-style text: only uppercase letters, digits,
 *  and common label punctuation (underscore, comma, period, dash,
 *  whitespace). Catches "ADNI_MEM", "RC1", "1,2,3" while sparing
 *  body text ("Methods" — has lowercase) and most author names.
 *
 *  Known false-positive class: standalone single-item institution
 *  acronyms ("MIT", "MGH"). In practice author affiliations are
 *  multi-item (university name + city) so the items.length ≤ 2
 *  guard catches almost all real cases. Re-evaluate if users
 *  report missing affiliation tags. */
const LABEL_TEXT_PATTERN = /^[A-Z0-9_,.\-\s]+$/;

/** Common figure / table caption prefixes used in academic PDFs. */
const CAPTION_PATTERN = /^(Figure|Fig\.?|Table|Tab\.?)\s*\d+/i;

/** A cluster is dropped as an "orphan label" when ANY of these
 *  signals fire. The signals are independent so a misfiring one
 *  doesn't sink the rest.
 *
 *  Signal 1 (bbox-independent label pattern): tiny + uppercase/numeric
 *    only ("ADNI_MEM", "RC1", "1,2,3").
 *  Signal 2 (caption near a figure bbox): tiny "Figure N." / "Table N."
 *    within 2.5 × line-height of any detected figure bbox.
 *  Signal 3 (font smaller than body text): the most general signal —
 *    a tiny isolated cluster whose font is materially smaller than the
 *    page-median body text is almost always a label rather than
 *    content. Catches lowercase orphans and label patterns the
 *    uppercase regex misses ("adni_mem", "var.1", "n=541").
 *
 *  Exported for unit testing.
 */
export function filterOrphanLabels<
  T extends {
    text: string;
    items: { length: number };
    fontSizePt: number;
    bbox: { x: number; y: number; w: number; h: number };
  },
>(
  clusters: T[],
  figureBBoxes: FigureBBox[],
  /** When omitted, signal 3 is skipped — useful when the caller has
   *  already classified clusters into roles and doesn't want to risk
   *  the relative-size heuristic. */
  pageBodyFontSizePt?: number,
): T[] {
  return clusters.filter((c) => {
    const text = c.text.trim();
    const itemCount = c.items.length;

    // Signal 1 — bbox-independent label pattern.
    if (
      itemCount <= 2 &&
      text.length > 0 &&
      text.length <= 15 &&
      LABEL_TEXT_PATTERN.test(text)
    ) {
      return false;
    }

    // Signal 2 — caption near any detected figure bbox. Captions
    // routinely sit 2–4× fontSize from the figure baseline depending
    // on the source layout (extra spacing for figures with frames,
    // SVG-rasterized figures with internal padding, etc.), so the
    // proximity gate uses `4 × fontSize` with a 24pt floor — wide
    // enough to catch captions across all the templates the
    // benchmark exercises, narrow enough that adjacent body text
    // doesn't get caught by accident (body text usually doesn't
    // match the CAPTION_PATTERN regex anyway).
    if (
      itemCount <= 2 &&
      text.length <= 30 &&
      CAPTION_PATTERN.test(text) &&
      figureBBoxes.length > 0
    ) {
      const proximity = Math.max(c.fontSizePt * 4, 24);
      for (const fig of figureBBoxes) {
        const cx = c.bbox.x + c.bbox.w / 2;
        const cy = c.bbox.y + c.bbox.h / 2;
        const fx = fig.x + fig.w / 2;
        const fy = fig.y + fig.h / 2;
        const dx = Math.max(0, Math.abs(cx - fx) - (c.bbox.w + fig.w) / 2);
        const dy = Math.max(0, Math.abs(cy - fy) - (c.bbox.h + fig.h) / 2);
        if (Math.hypot(dx, dy) <= proximity) return false;
      }
    }

    // Signal 3 — fontSize materially below page-median body text.
    // Body text clusters tend to span many items (the whole
    // paragraph), so the items.length ≤ 3 guard prevents real body
    // paragraphs from getting nuked when their median fontSize is
    // anomalously low. The 0.85 ratio is the same threshold the
    // assignRoles pass uses to split heading-vs-body.
    if (
      pageBodyFontSizePt !== undefined &&
      pageBodyFontSizePt > 0 &&
      itemCount <= 3 &&
      text.length < 30 &&
      c.fontSizePt > 0 &&
      c.fontSizePt < pageBodyFontSizePt * 0.85
    ) {
      return false;
    }

    return true;
  });
}

/** Median fontSize across all clusters — the best single estimate
 *  of "this is the body text size on this page." Used by
 *  filterOrphanLabels signal 3.
 *
 *  Exported for unit testing. */
export function medianBodyFontSize(
  clusters: { fontSizePt: number; items: { length: number } }[],
): number {
  // Weight by item count so a 100-item paragraph contributes more
  // than a 1-item label. Without this, posters with many small
  // labels skew the median down.
  const sizes: number[] = [];
  for (const c of clusters) {
    if (c.fontSizePt <= 0) continue;
    const weight = Math.min(c.items.length, 50); // cap so one mega-paragraph doesn't dominate
    for (let i = 0; i < weight; i++) sizes.push(c.fontSizePt);
  }
  if (sizes.length === 0) return 0;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 0;
}

/** Best-effort: download a freshly-uploaded poster-asset image, then
 *  save it to the user's logo library so it shows up in the
 *  LogoPicker on future posters. Errors are swallowed — the figure
 *  block keeps the image either way. */
async function saveLogoToLibrary(storageSrc: string): Promise<void> {
  try {
    const url = await resolveStorageUrl(storageSrc);
    if (!url) return;
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const ext = blob.type.includes('jpeg') ? 'jpg' : 'png';
    const file = new File([blob], `imported-logo.${ext}`, { type: blob.type });
    await uploadUserLogo(file, 'Imported logo');
  } catch {
    // ignore — best-effort
  }
}

/** Edge-to-edge gap between two axis-aligned bboxes. 0 = overlapping. */
function bboxGap(a: FigureBBox, b: FigureBBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

/**
 * Classify a bbox as a logo if it sits in the upper region of the page
 * AND is small enough that "logo" is plausible. Lets the user override
 * via the standard block-type controls if we get it wrong.
 *
 * Exported for unit testing.
 */
export function classifyAsLogo(
  bbox: FigureBBox,
  pageHeightPt: number,
  stats: BBoxStats,
): boolean {
  const topZone = pageHeightPt * LOGO_TOP_FRACTION;
  const inUpper = bbox.y + bbox.h <= topZone;
  const maxDim = Math.max(bbox.w, bbox.h);
  // "Small" is keyed off the per-poster size distribution — same
  // adaptive threshold used by the merger.
  const isSmall =
    stats.smallCutoffPt > 0 && maxDim <= stats.smallCutoffPt;
  return inUpper && isSmall;
}

function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    (a[0] ?? 0) * (b[0] ?? 0) + (a[2] ?? 0) * (b[1] ?? 0),
    (a[1] ?? 0) * (b[0] ?? 0) + (a[3] ?? 0) * (b[1] ?? 0),
    (a[0] ?? 0) * (b[2] ?? 0) + (a[2] ?? 0) * (b[3] ?? 0),
    (a[1] ?? 0) * (b[2] ?? 0) + (a[3] ?? 0) * (b[3] ?? 0),
    (a[0] ?? 0) * (b[4] ?? 0) + (a[2] ?? 0) * (b[5] ?? 0) + (a[4] ?? 0),
    (a[1] ?? 0) * (b[4] ?? 0) + (a[3] ?? 0) * (b[5] ?? 0) + (a[5] ?? 0),
  ];
}

function applyTransform(m: number[], x: number, y: number): [number, number] {
  return [
    (m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0),
    (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0),
  ];
}

function dedupeFigures(
  figs: { transform: number[]; name: string }[],
): { transform: number[]; name: string }[] {
  const seen = new Set<string>();
  const out: { transform: number[]; name: string }[] = [];
  for (const f of figs) {
    const key = `${f.name}|${f.transform.map((n) => n.toFixed(2)).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.92);
  });
}
