/**
 * Image / no-text-layer-PDF import — Tier 1 vision path.
 *
 * Rasterizes the input (or accepts the raster directly), uploads it
 * to a temp path in the user's poster-assets bucket, calls
 * `/api/import/extract` to get structured blocks back, then crops
 * each figure region from the local canvas (cheaper than round-
 * tripping pixel data through the LLM) and uploads each as an image
 * block.
 *
 * The same code path handles:
 *   - `.jpg` / `.png` drops on the dashboard
 *   - PDFs that fail the text-layer density check (Canva-flattened,
 *     scanned, etc.) — `pdfImport.ts` rasterizes the page and
 *     delegates here.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { nanoid } from 'nanoid';
import type {
  ImportProgressCallback,
  PartialBlock,
  Palette,
} from '@postr/shared';
import { uploadPosterImage } from '@/data/posterImages';
import { supabase } from '@/lib/supabase';
import { postJson, ApiError, formatRetryAfter } from '@/lib/apiClient';
import { ptToUnits, ptToIn } from '../poster/constants';
import { synthesizeDocFromResult, type SynthOutput } from './synthDoc';

interface ExtractRequestBody {
  imageUrl: string;
  pageWidthPt: number;
  pageHeightPt: number;
  mode:
    | 'full-extract'
    | 'classify-region'
    | 'split-multi-logo'
    | 'count-figures';
  model?: 'claude' | 'gpt' | 'ollama';
}

interface ExtractedBlock {
  type: 'title' | 'heading' | 'authors' | 'text' | 'table';
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  fontSizePt?: number;
  confidence: number;
}

interface ExtractFullResponse {
  blocks: ExtractedBlock[];
  figureBBoxes: { x: number; y: number; w: number; h: number }[];
  detectedPalette?: Palette;
  warnings?: string[];
}

export interface ClassifyRegionResponse {
  kind: 'figure' | 'table' | 'logo' | 'decoration';
  confidence: number;
  reason?: string;
  evidence?: {
    representsQuantitativeData: boolean;
    hasAxesWithTicks: boolean;
    hasPlottedMarks: boolean;
    hasMultipleSubplots: boolean;
    hasSchematicWithLabels: boolean;
    hasGridRowsAndCols: boolean;
    hasNumericData: boolean;
    isStylizedIcon: boolean;
  };
}

export interface SplitMultiLogoResponse {
  /** Sub-logo bboxes in image-pixel space (origin top-left). The
   *  client crops each one out of the source canvas and uploads them
   *  as separate logo blocks. */
  logos: Array<{
    bbox: { x: number; y: number; w: number; h: number };
    name?: string;
  }>;
  /** True when the LLM thinks the image actually contains exactly
   *  one logo and shouldn't be split. */
  isSingleLogo?: boolean;
}

export interface CountFiguresResponse {
  expectedFigureCount: number;
  expectedTableCount: number;
  expectedLogoCount: number;
  reasoning: string;
}

/** Bucket prefix used for ephemeral upload-then-fetch round trips.
 *  Lives under the user's existing poster-assets bucket so the same
 *  RLS policies apply. Cleaned up by the existing nightly cron once
 *  the orphan-poster sweep is wired (manual today; users can prune
 *  via the dashboard). */
const TEMP_PREFIX = 'temp';

export async function extractFromImage(
  file: File,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
): Promise<SynthOutput> {
  return runImageOcr(file, posterId, userId, onProgress);
}

/** Public entry for `pdfImport.ts` to delegate flattened PDFs. The
 *  caller passes the rasterized page canvas + page dims in pt. */
export async function extractFromRasterizedPage(
  pageCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
): Promise<SynthOutput> {
  const blob = await canvasToBlob(pageCanvas, 'image/png');
  if (!blob) throw new Error('Could not rasterize page.');
  const file = new File([blob], `${nanoid(8)}.png`, { type: 'image/png' });
  return runImageOcr(file, posterId, userId, onProgress, {
    pageCanvas,
    pageWidthPt,
    pageHeightPt,
  });
}

interface RasterContext {
  pageCanvas: HTMLCanvasElement;
  pageWidthPt: number;
  pageHeightPt: number;
}

async function runImageOcr(
  file: File,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
  raster?: RasterContext,
): Promise<SynthOutput> {
  onProgress({ stage: 'reading', detail: file.name });

  // Resolve dimensions: use provided raster context if PDF caller
  // already has them, else inspect the image.
  let pageWidthPt: number;
  let pageHeightPt: number;
  let pageCanvas: HTMLCanvasElement;
  let allocatedHere = false;

  if (raster) {
    pageWidthPt = raster.pageWidthPt;
    pageHeightPt = raster.pageHeightPt;
    pageCanvas = raster.pageCanvas;
  } else {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const r = await rasterizePdfFirstPage(file);
      pageCanvas = r.canvas;
      pageWidthPt = r.pageWidthPt;
      pageHeightPt = r.pageHeightPt;
      allocatedHere = true;
    } else {
      const r = await rasterizeImage(file);
      pageCanvas = r.canvas;
      pageWidthPt = r.pageWidthPt;
      pageHeightPt = r.pageHeightPt;
      allocatedHere = true;
    }
  }

  onProgress({ stage: 'llm-call', detail: 'Uploading…' });
  const tempPath = `${userId}/${TEMP_PREFIX}/${posterId}/${nanoid(8)}.png`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, file, {
      contentType: file.type || 'image/png',
      upsert: true,
    });
  if (uploadErr) {
    if (allocatedHere) releaseCanvas(pageCanvas);
    throw new Error(`Could not upload import: ${uploadErr.message}`);
  }
  const { data: signed, error: signErr } = await supabase.storage
    .from('poster-assets')
    .createSignedUrl(tempPath, 600);
  if (signErr || !signed?.signedUrl) {
    if (allocatedHere) releaseCanvas(pageCanvas);
    throw new Error('Could not sign upload URL for vision call.');
  }

  const body: ExtractRequestBody = {
    imageUrl: signed.signedUrl,
    pageWidthPt,
    pageHeightPt,
    mode: 'full-extract',
    model: 'claude',
  };

  onProgress({ stage: 'llm-call', detail: 'Calling Claude Vision…' });
  let response: ExtractFullResponse;
  try {
    response = await postJson<ExtractFullResponse>(
      '/api/import/extract',
      body,
      { auth: true },
    );
  } catch (err) {
    if (allocatedHere) releaseCanvas(pageCanvas);
    if (err instanceof ApiError && err.status === 429) {
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
      throw new Error(`${lead}${wait}`);
    }
    throw err instanceof Error ? err : new Error('Vision call failed.');
  }

  // Build PartialBlocks from the LLM output. Convert pt-coords to
  // poster units; figure bboxes get cropped + uploaded separately.
  onProgress({ stage: 'uploading-figures', ratio: 0 });
  const figureBlocks: PartialBlock[] = [];
  for (let i = 0; i < response.figureBBoxes.length; i++) {
    const bb = response.figureBBoxes[i]!;
    onProgress({
      stage: 'uploading-figures',
      ratio: i / response.figureBBoxes.length,
      detail: `${i + 1}/${response.figureBBoxes.length}`,
    });
    const block = await cropAndUploadRegion(
      pageCanvas,
      bb,
      pageWidthPt,
      pageHeightPt,
      posterId,
      userId,
    );
    if (block) figureBlocks.push(block);
  }

  onProgress({ stage: 'building-preview' });
  const blocks: PartialBlock[] = [
    ...response.blocks.map((b) => ({
      type: b.type,
      x: ptToUnits(b.bbox.x),
      y: ptToUnits(b.bbox.y),
      w: ptToUnits(b.bbox.w),
      h: ptToUnits(b.bbox.h),
      content: b.text,
      imageSrc: null,
      imageFit: 'contain' as const,
      tableData: null,
    })),
    ...figureBlocks,
  ];

  // Best-effort: clean up the temp upload now that the LLM is done.
  // RLS protects against cross-user deletes; failure is fine.
  void supabase.storage.from('poster-assets').remove([tempPath]);

  if (allocatedHere) releaseCanvas(pageCanvas);

  const synth = synthesizeDocFromResult({
    blocks,
    pageWidthIn: ptToIn(pageWidthPt),
    pageHeightIn: ptToIn(pageHeightPt),
    detectedPalette: response.detectedPalette,
    warnings: [
      ...(response.warnings ?? []),
      'Imported via vision model — verify accuracy of detected text and figures.',
    ],
  });

  onProgress({ stage: 'ready' });
  return synth;
}

/**
 * Asks the LLM to detect whether a given image contains MULTIPLE
 * logos (e.g. a McGill + Douglas + ADNI banner baked into a single
 * PDF image XObject) and to return their pixel-space bboxes. The
 * caller crops each sub-region from the source canvas and uploads
 * them as separate logo blocks.
 *
 * Returns null on failure or `isSingleLogo: true` so the caller
 * keeps the original block intact.
 */
export async function splitMultiLogo(
  pageCanvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  scale: number,
): Promise<SplitMultiLogoResponse | null> {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(bbox.w * scale);
  cropCanvas.height = Math.round(bbox.h * scale);
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(
    pageCanvas,
    Math.round(bbox.x * scale),
    Math.round(bbox.y * scale),
    cropCanvas.width,
    cropCanvas.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  const blob = await canvasToBlob(cropCanvas, 'image/png');
  releaseCanvas(cropCanvas);
  if (!blob) return null;

  const tempPath = `${userId}/${TEMP_PREFIX}/${posterId}/split-${nanoid(8)}.png`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, blob, { contentType: 'image/png', upsert: true });
  if (uploadErr) return null;

  const { data: signed } = await supabase.storage
    .from('poster-assets')
    .createSignedUrl(tempPath, 300);
  if (!signed?.signedUrl) return null;

  try {
    const response = await postJson<SplitMultiLogoResponse>(
      '/api/import/extract',
      {
        imageUrl: signed.signedUrl,
        pageWidthPt,
        pageHeightPt,
        mode: 'split-multi-logo',
      },
      { auth: true },
    );
    return response;
  } catch (err) {
    // Surface rate-limit failures so the caller can abort the
    // import with a useful message instead of silently degrading.
    if (err instanceof ApiError && err.status === 429) throw err;
    return null;
  } finally {
    void supabase.storage.from('poster-assets').remove([tempPath]);
  }
}

/**
 * One-shot region classifier for the figure pipeline. Crops a single
 * bbox from the page canvas, uploads it, and asks the LLM whether it
 * looks like a figure/table/logo/decoration.
 */
export async function classifyRegion(
  pageCanvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  scale: number,
): Promise<ClassifyRegionResponse | null> {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(bbox.w * scale);
  cropCanvas.height = Math.round(bbox.h * scale);
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(
    pageCanvas,
    Math.round(bbox.x * scale),
    Math.round(bbox.y * scale),
    cropCanvas.width,
    cropCanvas.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  const blob = await canvasToBlob(cropCanvas, 'image/png');
  releaseCanvas(cropCanvas);
  if (!blob) return null;

  const tempPath = `${userId}/${TEMP_PREFIX}/${posterId}/classify-${nanoid(8)}.png`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, blob, { contentType: 'image/png', upsert: true });
  if (uploadErr) return null;

  const { data: signed } = await supabase.storage
    .from('poster-assets')
    .createSignedUrl(tempPath, 300);
  if (!signed?.signedUrl) return null;

  try {
    const response = await postJson<ClassifyRegionResponse>(
      '/api/import/extract',
      {
        imageUrl: signed.signedUrl,
        pageWidthPt,
        pageHeightPt,
        mode: 'classify-region',
      },
      { auth: true },
    );
    return response;
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) throw err;
    return null;
  } finally {
    void supabase.storage.from('poster-assets').remove([tempPath]);
  }
}

/**
 * Holistic pre-scan: ships the whole rendered page raster to the LLM
 * and asks it to count expected figures / tables / logos. Used by
 * `pdfImport.ts` to set a CEILING for the per-bbox classifier — the
 * pixel-heuristic stream often over-shoots on noisy posters, and a
 * single full-page call is cheap (~$0.005) compared to running 10
 * extra per-bbox calls.
 *
 * Returns null on failure; the caller should fall back to per-bbox
 * verdicts without budget enforcement.
 */
export async function countFigures(
  pageCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
): Promise<CountFiguresResponse | null> {
  // Downscale to keep the payload under the API's 20 MB ceiling. A
  // 36×48" poster rendered at 2× is ~5 k × 7 k px — too big as PNG.
  // 2048 px on the long edge is plenty for counting; we're not OCRing.
  const MAX_DIM = 2048;
  const longEdge = Math.max(pageCanvas.width, pageCanvas.height);
  const scale = longEdge > MAX_DIM ? MAX_DIM / longEdge : 1;
  let workCanvas: HTMLCanvasElement = pageCanvas;
  let allocatedHere = false;
  if (scale < 1) {
    workCanvas = document.createElement('canvas');
    workCanvas.width = Math.round(pageCanvas.width * scale);
    workCanvas.height = Math.round(pageCanvas.height * scale);
    const ctx = workCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pageCanvas, 0, 0, workCanvas.width, workCanvas.height);
    allocatedHere = true;
  }

  const blob = await canvasToBlob(workCanvas, 'image/jpeg');
  if (allocatedHere) releaseCanvas(workCanvas);
  if (!blob) return null;

  const tempPath = `${userId}/${TEMP_PREFIX}/${posterId}/count-${nanoid(8)}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadErr) return null;

  const { data: signed } = await supabase.storage
    .from('poster-assets')
    .createSignedUrl(tempPath, 300);
  if (!signed?.signedUrl) {
    void supabase.storage.from('poster-assets').remove([tempPath]);
    return null;
  }

  try {
    const response = await postJson<CountFiguresResponse>(
      '/api/import/extract',
      {
        imageUrl: signed.signedUrl,
        pageWidthPt,
        pageHeightPt,
        mode: 'count-figures',
      },
      { auth: true },
    );
    return response;
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) throw err;
    return null;
  } finally {
    void supabase.storage.from('poster-assets').remove([tempPath]);
  }
}

// ── helpers ──────────────────────────────────────────────────────────

async function rasterizePdfFirstPage(
  file: File,
): Promise<{ canvas: HTMLCanvasElement; pageWidthPt: number; pageHeightPt: number }> {
  const buf = await file.arrayBuffer();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'parse error';
    throw new Error(`Could not parse PDF: ${msg}`);
  }
  if (pdf.numPages > 1) {
    throw new Error(
      `Multi-page PDFs are not yet supported — this file has ${pdf.numPages} pages.`,
    );
  }
  const page = await pdf.getPage(1);
  const SCALE = 2;
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context available.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return {
    canvas,
    pageWidthPt: page.getViewport({ scale: 1 }).width,
    pageHeightPt: page.getViewport({ scale: 1 }).height,
  };
}

async function rasterizeImage(
  file: File,
): Promise<{ canvas: HTMLCanvasElement; pageWidthPt: number; pageHeightPt: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context available.');
    ctx.drawImage(img, 0, 0);
    // Assume 300 dpi as a baseline — typical for poster JPGs. The
    // synthesizer snaps to the nearest curated poster size anyway.
    const DPI = 300;
    return {
      canvas,
      pageWidthPt: (img.naturalWidth / DPI) * 72,
      pageHeightPt: (img.naturalHeight / DPI) * 72,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cropAndUploadRegion(
  pageCanvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
): Promise<PartialBlock | null> {
  // Convert pt-coords to canvas pixel coords. PageCanvas was rendered
  // at SCALE × pt; we recover the scale from canvas / page-pt.
  const scaleX = pageCanvas.width / pageWidthPt;
  const scaleY = pageCanvas.height / pageHeightPt;
  const px = Math.max(0, Math.round(bbox.x * scaleX));
  const py = Math.max(0, Math.round(bbox.y * scaleY));
  const pw = Math.min(pageCanvas.width - px, Math.round(bbox.w * scaleX));
  const ph = Math.min(pageCanvas.height - py, Math.round(bbox.h * scaleY));
  if (pw <= 1 || ph <= 1) return null;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = pw;
  cropCanvas.height = ph;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(pageCanvas, px, py, pw, ph, 0, 0, pw, ph);

  const blob = await canvasToBlob(cropCanvas, 'image/png');
  releaseCanvas(cropCanvas);
  if (!blob) return null;

  const blockId = nanoid(8);
  const f = new File([blob], `${blockId}.png`, { type: 'image/png' });
  const storageSrc = await uploadPosterImage(userId, posterId, blockId, f);
  if (!storageSrc) return null;

  return {
    type: 'image',
    x: ptToUnits(bbox.x),
    y: ptToUnits(bbox.y),
    w: ptToUnits(bbox.w),
    h: ptToUnits(bbox.h),
    content: '',
    imageSrc: storageSrc,
    imageFit: 'contain',
    tableData: null,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.92);
  });
}

function releaseCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}
