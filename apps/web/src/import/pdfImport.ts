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
import { ptToIn, ptToUnits } from '../poster/constants';
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
  extractFromRasterizedPage,
  splitMultiLogo,
} from './imageImport';

// pdfjs needs a worker URL. Vite resolves this with `?url`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the `?url` import shape is provided by Vite at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

export class PdfImportError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'multi-page'
      | 'no-text-layer'
      | 'parse-failed'
      | 'unknown',
  ) {
    super(message);
    this.name = 'PdfImportError';
  }
}

/** Threshold below which a PDF is considered "no usable text layer"
 *  and the user is routed to the Tier 1 image-OCR path. */
const MIN_CHAR_DENSITY_PER_IN2 = 1;
const MIN_CHARS_TOTAL = 200;

export interface ExtractFromPdfOptions {
  /**
   * Default false. When true, ship each small / logo-shaped image
   * block to Claude Vision for a single classify-region call.
   * Decoration verdicts are dropped, logo verdicts are promoted from
   * image → logo type. Adds ~$0.005 per import + 5-15s of latency.
   *
   * Off by default because the user pays the wait every time it
   * runs; surface as an opt-in checkbox in the import modal where
   * the cost trade-off is explicit.
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
  const roled = assignRoles(clusters, pageHeightPt);
  // Split overlong heading clusters that swallowed bullet content.
  const split = splitHeadingClusters(roled);
  const ordered = sortReadingOrder(split, pageWidthPt);

  // ── Stream 2: figures ──────────────────────────────────────────
  onProgress({ stage: 'uploading-figures', ratio: 0 });
  const figureBlocks = await extractFigures(
    page,
    pageWidthPt,
    pageHeightPt,
    posterId,
    userId,
    onProgress,
    options.verifyDecorations !== false, // default ON
  );

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

/** Below this fraction of the page area, a bbox is treated as
 *  decoration regardless of its absolute size. 0.05% of a 36×42 page
 *  is 0.756 in² — a 0.85" × 0.85" icon. */
const MIN_AREA_PAGE_FRACTION = 0.0005;

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
async function extractFigures(
  page: PDFPageProxy,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
  verifyDecorations: boolean,
): Promise<PartialBlock[]> {
  const onItemDone = (done: number, total: number): void => {
    onProgress({
      stage: 'uploading-figures',
      ratio: total === 0 ? 1 : done / total,
      detail: `${done}/${total}`,
    });
  };
  // Render the page at 2x scale for crisp figure crops.
  const RENDER_SCALE = 2;
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

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
  for (const bbox of merged) {
    const cropCanvas = document.createElement('canvas');
    allocatedCanvases.push(cropCanvas);
    cropCanvas.width = Math.round(bbox.w * RENDER_SCALE);
    cropCanvas.height = Math.round(bbox.h * RENDER_SCALE);
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) {
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
      done++;
      onItemDone(done, total);
      continue;
    }
    const blockId = nanoid(8);
    const file = new File([blob], `${blockId}.png`, { type: 'image/png' });
    const storageSrc = await uploadPosterImage(userId, posterId, blockId, file);
    if (!storageSrc) {
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

    done++;
    onItemDone(done, total);
  }

  // ── LLM decoration verifier ───────────────────────────────────
  // Pure-pixel heuristics can't tell a "magnifier with chart" icon
  // from a small scatter plot. A single Claude Vision call per
  // suspect block fixes that — but the calls have to run in parallel
  // and on a strict total-time budget, otherwise a slow API freezes
  // the import (the bug the user reported).
  if (verifyDecorations) {
    const targets: { blockIdx: number; bbox: FigureBBox }[] = [];
    for (let i = 0; i < smallBlockIndexes.length; i++) {
      const blockIdx = smallBlockIndexes[i]!;
      if (blockIdx < 0) continue;
      targets.push({ blockIdx, bbox: smallBlockBBoxes[i]! });
    }

    if (targets.length > 0) {
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
      const splitCandidates: { blockIdx: number; bbox: FigureBBox }[] = [];
      verdicts.forEach((verdict, i) => {
        if (!verdict) return;
        const blockIdx = targets[i]!.blockIdx;
        const bbox = targets[i]!.bbox;

        // Strict-evidence guard: a "figure" verdict without observed
        // axes (or numeric data) is downgraded to "decoration". The
        // backend prompt forces the model to commit to evidence
        // before classifying, but we double-check here so a model
        // that returns inconsistent JSON still doesn't pollute the
        // poster.
        let kind = verdict.kind;
        const ev = verdict.evidence;
        if (kind === 'figure' && ev) {
          const looksReal =
            ev.hasAxes &&
            (ev.hasTrendLinesOrDataPoints || ev.hasNumericData);
          if (!looksReal) kind = 'decoration';
        }
        if (kind === 'table' && ev) {
          const looksReal = ev.hasGridRowsAndCols && ev.hasNumericData;
          if (!looksReal) kind = 'decoration';
        }
        if (kind === 'logo' && ev?.hasOrnamentalShapesOnly) {
          kind = 'decoration';
        }

        if (kind === 'decoration' && verdict.confidence >= 0.5) {
          dropIndexes.add(blockIdx);
          return;
        }
        if (kind !== 'logo' || verdict.confidence < 0.5) return;
        promotions.set(blockIdx, 'logo');
        // Wide / tall "logo" bboxes are LLM-splittable now — queue
        // for a second pass that asks the model to return per-logo
        // sub-bboxes inside the merged image.
        const maxDim = Math.max(bbox.w, bbox.h);
        const minDim = Math.min(bbox.w, bbox.h);
        if (maxDim / Math.max(1, minDim) > 2.0) {
          splitCandidates.push({ blockIdx, bbox });
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

      // ── Multi-logo split pass ─────────────────────────────────
      // For every wide/tall block the verifier classified as "logo",
      // ask the model to return per-logo sub-bboxes. If the model
      // finds 2+ logos, we crop each region out of the page raster,
      // upload separately, and replace the merged block with N split
      // blocks. The McGill / Douglas / ADNI banner case.
      if (splitCandidates.length > 0) {
        onProgress({
          stage: 'llm-call',
          detail: `Splitting ${splitCandidates.length} multi-logo block${splitCandidates.length === 1 ? '' : 's'}…`,
        });
        for (const cand of splitCandidates) {
          // Find current block (its index may have shifted after
          // the drop pass). Match on imageSrc which is stable.
          const original = blocks.find(
            (b) =>
              b.type === 'logo' &&
              ptToUnits(cand.bbox.w) === Math.abs(b.w) - 0 &&
              false, // explicit comparison too brittle; do a simple key below
          );
          const src = original?.imageSrc;
          void src;
          // Easier: re-derive the block by matching on bbox-derived
          // unit dims; but the simplest path is to crop+upload from
          // the page canvas regardless and just remove any block
          // whose bbox sits inside the candidate region.
          const split = await splitMultiLogo(
            canvas,
            cand.bbox,
            pageWidthPt,
            pageHeightPt,
            posterId,
            userId,
            2,
          );
          if (!split || split.isSingleLogo || split.logos.length < 2) continue;

          // Remove the merged block. Identify by bbox proximity in
          // poster-unit space (within 1 unit).
          const mergedX = ptToUnits(cand.bbox.x);
          const mergedY = ptToUnits(cand.bbox.y);
          const mergedW = ptToUnits(cand.bbox.w);
          const mergedH = ptToUnits(cand.bbox.h);
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i]!;
            if (
              b.type === 'logo' &&
              Math.abs(b.x - mergedX) < 1 &&
              Math.abs(b.y - mergedY) < 1 &&
              Math.abs(b.w - mergedW) < 1 &&
              Math.abs(b.h - mergedH) < 1
            ) {
              blocks.splice(i, 1);
              break;
            }
          }

          // For each sub-logo bbox returned by the LLM (in pixel
          // coords of the cropped image), translate back to page-pt
          // coords, crop from the page canvas, upload, push a new
          // logo block.
          const RENDER_SCALE_FOR_SPLIT = 2;
          for (const logo of split.logos) {
            // Sub-bbox is in pixel space of the cropped image. The
            // crop was rendered at RENDER_SCALE_FOR_SPLIT × bbox-pt.
            const subPtX = cand.bbox.x + logo.bbox.x / RENDER_SCALE_FOR_SPLIT;
            const subPtY = cand.bbox.y + logo.bbox.y / RENDER_SCALE_FOR_SPLIT;
            const subPtW = logo.bbox.w / RENDER_SCALE_FOR_SPLIT;
            const subPtH = logo.bbox.h / RENDER_SCALE_FOR_SPLIT;
            if (subPtW < 1 || subPtH < 1) continue;

            const sub = document.createElement('canvas');
            allocatedCanvases.push(sub);
            sub.width = Math.round(subPtW * RENDER_SCALE_FOR_SPLIT);
            sub.height = Math.round(subPtH * RENDER_SCALE_FOR_SPLIT);
            const sctx = sub.getContext('2d');
            if (!sctx) continue;
            sctx.drawImage(
              canvas,
              Math.round(subPtX * RENDER_SCALE_FOR_SPLIT),
              Math.round(subPtY * RENDER_SCALE_FOR_SPLIT),
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
              x: ptToUnits(subPtX),
              y: ptToUnits(subPtY),
              w: ptToUnits(subPtW),
              h: ptToUnits(subPtH),
              content: '',
              imageSrc: subSrc,
              imageFit: 'contain',
              tableData: null,
            });
            void saveLogoToLibrary(subSrc);
          }
        }
      }

      // Save promoted logos that were NOT split (single-logo blocks)
      // into the user library. Multi-logo splits already saved above.
      for (const idx of promotions.keys()) {
        const wasSplit = splitCandidates.some((c) => c.blockIdx === idx);
        if (wasSplit) continue;
        const src = blocks[idx]?.imageSrc;
        if (src) void saveLogoToLibrary(src);
      }
    }
  }

  // Release every allocated canvas immediately. With 25 figures at 2×
  // we hold ~100 MB before GC otherwise.
  for (const c of allocatedCanvases) {
    c.width = 0;
    c.height = 0;
  }

  return blocks;
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
