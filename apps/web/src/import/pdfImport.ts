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

/**
 * Walk the page operator list and pull every embedded raster image.
 * Each image becomes an `image` block with its bbox in poster-pt
 * coordinates (ready to be scaled + snapped by `synthesizeDoc`).
 *
 * pdfjs renders images through `OPS.paintImageXObject` ops which take
 * a name argument; the actual pixel data lives in `page.objs` /
 * `page.commonObjs`. We render the page to a hidden canvas and crop
 * each image's transformed bbox back out — this is far more reliable
 * than trying to decode the raw bitmap (PDF supports many color
 * spaces and decoders that pdfjs handles internally during render).
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

  // Walk the operator list to find image bboxes.
  // OPS.paintImageXObject = 85; OPS.paintImageXObjectRepeat = 88. We
  // use the numeric values via pdfjs.OPS to stay in sync with the lib.
  const opList = await page.getOperatorList();
  const ops = pdfjs.OPS;
  const figures: { transform: number[]; name: string }[] = [];

  // The transformation matrix at the time of the paint op is the
  // current transform — pdfjs emits OPS.transform / OPS.save / OPS.restore
  // in the same fnArray. We track the CTM stack as we walk.
  const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
  const top = (): number[] => ctmStack[ctmStack.length - 1]!;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] ?? [];
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

  // De-dupe by name + transform — repeated logos hit the same XObject.
  const uniq = dedupeFigures(figures);
  const total = uniq.length;
  let done = 0;
  onItemDone(done, total);

  const blocks: PartialBlock[] = [];
  for (const { transform } of uniq) {
    // The unit square (0,0)-(1,1) in image space is mapped to pt
    // coords by `transform`. The four corners give us a bbox.
    const [x0, y0] = applyTransform(transform, 0, 0);
    const [x1, y1] = applyTransform(transform, 1, 1);
    const minX = Math.min(x0, x1);
    const minY = Math.min(y0, y1);
    const maxX = Math.max(x0, x1);
    const maxY = Math.max(y0, y1);

    const widthPt = maxX - minX;
    const heightPt = maxY - minY;

    // PDF coords are bottom-up; canvas coords are top-down. Flip y.
    const topPt = pageHeightPt - maxY;

    // Skip degenerate / off-page images.
    if (widthPt <= 1 || heightPt <= 1) {
      done++;
      onItemDone(done, total);
      continue;
    }
    if (
      minX < -1 ||
      topPt < -1 ||
      minX + widthPt > pageWidthPt + 1 ||
      topPt + heightPt > pageHeightPt + 1
    ) {
      // Off-page (clipped header decoration etc.) — drop.
      done++;
      onItemDone(done, total);
      continue;
    }

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.round(widthPt * RENDER_SCALE);
    cropCanvas.height = Math.round(heightPt * RENDER_SCALE);
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) {
      done++;
      onItemDone(done, total);
      continue;
    }
    cropCtx.drawImage(
      canvas,
      Math.round(minX * RENDER_SCALE),
      Math.round(topPt * RENDER_SCALE),
      cropCanvas.width,
      cropCanvas.height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );

    const blob = await canvasToBlob(cropCanvas, 'image/png');
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

    blocks.push({
      type: 'image',
      // x/y/w/h in poster units BEFORE scale-to-poster-size. The
      // synthesizer applies the final scale.
      x: ptToUnits(minX),
      y: ptToUnits(topPt),
      w: ptToUnits(widthPt),
      h: ptToUnits(heightPt),
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
