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
import { uploadPosterImage } from '@/data/posterImages';
import { ptToIn, ptToUnits } from '../poster/constants';
import {
  assignRoles,
  clusterTextItems,
  sortReadingOrder,
  type RawTextItem,
} from './clusterText';
import { synthesizeDoc, type SynthOutput } from './synthDoc';

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

/**
 * Main entry point. Extracts a single-page text-layer PDF into a
 * `SynthOutput` ready for the preview modal.
 */
export async function extractFromPdf(
  file: File,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
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
    throw new PdfImportError(
      'This PDF has no selectable text. Image OCR ships in the next release.',
      'no-text-layer',
    );
  }

  const clusters = clusterTextItems(items);
  const roled = assignRoles(clusters, pageHeightPt);
  const ordered = sortReadingOrder(roled, pageWidthPt);

  // ── Stream 2: figures ──────────────────────────────────────────
  onProgress({ stage: 'uploading-figures', ratio: 0 });
  const figureBlocks = await extractFigures(
    page,
    pageWidthPt,
    pageHeightPt,
    posterId,
    userId,
    (done, total) => {
      onProgress({
        stage: 'uploading-figures',
        ratio: total === 0 ? 1 : done / total,
        detail: `${done}/${total}`,
      });
    },
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

// Tuning constants — bias toward suppression. Users can always insert
// missing figures manually; can NOT easily delete 25 spurious ones.

/** Pixels-per-inch in PDF user space. */
const PT_PER_INCH = 72;

/** Skip image XObjects below this size in BOTH dimensions. Anything
 *  smaller than ~1" tall AND ~1" wide is almost certainly decoration
 *  (the "leaf" placeholder icons we saw in EW_INS, table dividers,
 *  bullet shapes). The min-of-dims rule keeps narrow tall figures and
 *  wide short figures, both of which can be legitimate. */
const MIN_FIGURE_INCHES = 1.0;

/** Reject very thin/tall slivers below this aspect ratio (min/max).
 *  At 1/15 a 0.3" tall × 6" wide horizontal rule passes through, but
 *  a 0.1" × 5" hairline does not. */
const MIN_ASPECT = 1 / 15;

/** Merge two image bboxes into one when the gap between them is below
 *  this. Catches the "plot rendered as several adjacent XObjects"
 *  case (axes / data area / title emitted as separate paints). */
const MERGE_GAP_INCHES = 0.4;

/** Image bboxes whose top edge lies in the upper N% of the page get
 *  considered for `logo` classification. */
const LOGO_TOP_FRACTION = 0.18;

/** Largest dim that can still count as a logo (in inches). Tall hero
 *  figures in the masthead area would exceed this and stay `image`. */
const LOGO_MAX_INCHES = 4.0;

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
  onItemDone: (done: number, total: number) => void,
): Promise<PartialBlock[]> {
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

  // Stage 1+2+3: dedup → filter → merge.
  const filtered = filterDecorationBBoxes(rawBBoxes);
  const merged = mergeAdjacentBBoxes(filtered, MERGE_GAP_INCHES * PT_PER_INCH);

  const total = merged.length;
  let done = 0;
  onItemDone(done, total);

  const blocks: PartialBlock[] = [];
  for (const bbox of merged) {
    const cropCanvas = document.createElement('canvas');
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

    const isLogo = classifyAsLogo(tightBBox, pageHeightPt);
    blocks.push({
      type: isLogo ? 'logo' : 'image',
      // x/y/w/h in poster units BEFORE scale-to-poster-size. The
      // synthesizer applies the final scale.
      x: ptToUnits(tightBBox.x),
      y: ptToUnits(tightBBox.y),
      w: ptToUnits(tightBBox.w),
      h: ptToUnits(tightBBox.h),
      content: '',
      imageSrc: storageSrc,
      imageFit: 'contain',
      tableData: null,
    });

    done++;
    onItemDone(done, total);
  }

  return blocks;
}

/**
 * Scan a cropped figure canvas and return a smaller canvas containing
 * just the non-white content rectangle (plus a small padding ring).
 * Returns `null` when the canvas is entirely blank — the caller can
 * skip the block.
 *
 * "Non-white" is any pixel with at least one channel below 240 (so a
 * faint #f0f0f0 background still counts as content) AND alpha > 0.
 *
 * Scans every pixel — at 2× render scale a typical poster figure is
 * ~600 × 800 = 480k pixels which costs ~5 ms in a typed loop. Fine
 * for an offline import path.
 */
function tightenCanvasToContent(
  source: HTMLCanvasElement,
): {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
} | null {
  const w = source.width;
  const h = source.height;
  if (w === 0 || h === 0) return null;
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, w, h).data;

  const WHITE_THRESHOLD = 240; // any channel below this counts as content
  const PAD_PX = 4; // small ring so anti-aliased edges aren't clipped

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

  if (maxX < 0) return null; // entirely blank

  minX = Math.max(0, minX - PAD_PX);
  minY = Math.max(0, minY - PAD_PX);
  maxX = Math.min(w - 1, maxX + PAD_PX);
  maxY = Math.min(h - 1, maxY + PAD_PX);

  const tightW = maxX - minX + 1;
  const tightH = maxY - minY + 1;

  // Skip the rebuild if the tighten saves less than ~3% in either axis
  // — not worth a second canvas allocation for a barely-changed bbox.
  if (tightW > w * 0.97 && tightH > h * 0.97) return null;

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
 * Drop bboxes that are clearly decoration: tiny in both dimensions, or
 * extreme aspect ratios (hairlines, dividers).
 *
 * Exported for unit testing.
 */
export function filterDecorationBBoxes(boxes: FigureBBox[]): FigureBBox[] {
  const minPt = MIN_FIGURE_INCHES * PT_PER_INCH;
  return boxes.filter((b) => {
    // At least one dimension must be ≥ MIN_FIGURE_INCHES. Real plots
    // and screenshots always satisfy this; decorative icons don't.
    if (b.w < minPt && b.h < minPt) return false;
    const minDim = Math.min(b.w, b.h);
    const maxDim = Math.max(b.w, b.h);
    if (minDim / maxDim < MIN_ASPECT) return false;
    return true;
  });
}

/**
 * Union-find merge of bboxes that lie within `gapPt` of each other.
 * The merged bbox is the union of cluster members.
 *
 * Exported for unit testing.
 */
export function mergeAdjacentBBoxes(
  boxes: FigureBBox[],
  gapPt: number,
): FigureBBox[] {
  if (boxes.length === 0) return [];
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
      if (bboxGap(boxes[i]!, boxes[j]!) <= gapPt) union(i, j);
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
): boolean {
  const topZone = pageHeightPt * LOGO_TOP_FRACTION;
  const inUpper = bbox.y + bbox.h <= topZone;
  const maxDim = Math.max(bbox.w, bbox.h);
  const isSmall = maxDim <= LOGO_MAX_INCHES * PT_PER_INCH;
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
