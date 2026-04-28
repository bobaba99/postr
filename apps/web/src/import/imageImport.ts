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
import { supabase } from '@/lib/supabase';
import { postJson, ApiError, formatRetryAfter } from '@/lib/apiClient';
import { ptToUnits, ptToIn } from '../poster/constants';
import { synthesizeDocFromResult, type SynthOutput } from './synthDoc';
import {
  clampBBoxToPage,
  countCaptionMentions,
  inferPtScale,
  isFiniteBBox,
  scaleBBox,
} from './bboxSanitize';

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
  /** Pixel dimensions of the image the LLM saw — needed to scale
   *  `logoBBoxes` back to the page-pt coordinate system. */
  imagePixelWidth: number;
  imagePixelHeight: number;
  /** One bbox per logo the LLM identified, in pixel coords of the
   *  supplied image. The client crops these out of the page raster
   *  directly — replaces the per-bbox heuristic + multi-logo split
   *  pipeline for the logo case. */
  logoBBoxes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    name?: string;
  }>;
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
 *  caller passes the rasterized page canvas + page dims in pt.
 *  `runImageOcr` derives the upload payload directly from
 *  `pageCanvas` (downscaled), so we just need a placeholder File
 *  for naming + progress messaging. */
export async function extractFromRasterizedPage(
  pageCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
  onProgress: ImportProgressCallback,
): Promise<SynthOutput> {
  const placeholder = new File([], `${nanoid(8)}.jpg`, { type: 'image/jpeg' });
  return runImageOcr(placeholder, posterId, userId, onProgress, {
    pageCanvas,
    pageWidthPt,
    pageHeightPt,
  });
}

/** Cap the long edge at 2048 px so the JPEG-encoded payload stays
 *  comfortably under Anthropic's 5 MB-per-image practical sweet
 *  spot. Returns the input canvas when no scaling is needed so
 *  callers don't have to allocate. */
function downscaleForVision(src: HTMLCanvasElement): HTMLCanvasElement {
  const MAX_DIM = 2048;
  const longEdge = Math.max(src.width, src.height);
  if (longEdge <= MAX_DIM) return src;
  const scale = MAX_DIM / longEdge;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
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
  // Always derive the upload from the page canvas (downscaled
  // JPEG) — the user's original file may be a 30 MB phone-camera
  // photo or a 5k×7k high-DPI raster, both of which trip
  // Anthropic's 5 MB practical / 20 MB hard limit and 502 with
  // `vision_call_failed`. The full-resolution `pageCanvas` is
  // still used downstream for figure cropping, so fidelity of the
  // imported figures is preserved.
  const uploadCanvas = downscaleForVision(pageCanvas);
  const uploadBlob = await canvasToBlob(uploadCanvas, 'image/jpeg', 0.85);
  if (uploadCanvas !== pageCanvas) releaseCanvas(uploadCanvas);
  if (!uploadBlob) {
    if (allocatedHere) releaseCanvas(pageCanvas);
    throw new Error('Could not encode upload image.');
  }
  const tempPath = `${userId}/${TEMP_PREFIX}/${posterId}/${nanoid(8)}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, uploadBlob, {
      contentType: 'image/jpeg',
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
  // poster units. Figure cropping is intentionally skipped — vision
  // OCR of figure regions on flattened-content posters proved too
  // unreliable to ship as a default (LLM-returned bboxes were
  // missing real figures, hallucinating extras, and occasionally in
  // the wrong coord space). Until we have a more robust signal,
  // image-OCR imports text-only and surface a clear "add figures
  // manually" warning. Defensive `Array.isArray` guards keep the
  // pipeline alive when Anthropic's tool_use omits empty arrays.
  const rawResponseBlocks = Array.isArray(response.blocks)
    ? response.blocks
    : [];
  const rawFigureBBoxesCount = Array.isArray(response.figureBBoxes)
    ? response.figureBBoxes.length
    : 0;

  // The pt/px coord-space inference still runs on the text bboxes —
  // even text-only mode benefits from auto-correction when the LLM
  // returned image-pixel coords by accident.
  const allBoxesForCoordCheck = rawResponseBlocks
    .map((b) => b.bbox)
    .filter(isFiniteBBox);
  const ptScale = inferPtScale(
    allBoxesForCoordCheck,
    pageWidthPt,
    pageHeightPt,
  );

  // eslint-disable-next-line no-console
  console.debug('[import.fullExtract] text-only mode', {
    rawBlocks: rawResponseBlocks.length,
    rawFigureBBoxesIgnored: rawFigureBBoxesCount,
    ptScale,
  });

  onProgress({ stage: 'building-preview' });
  const sanitizedTextBlocks: PartialBlock[] = [];
  for (const b of rawResponseBlocks) {
    if (!b || !b.bbox || !isFiniteBBox(b.bbox)) continue;
    const bb = clampBBoxToPage(
      scaleBBox(b.bbox, ptScale),
      pageWidthPt,
      pageHeightPt,
    );
    if (!bb) continue;
    if (typeof b.text !== 'string') continue;
    if (b.text.trim().length === 0) continue;
    // Vision OCR can't reliably reconstruct cell structure for
    // tables — the LLM tags the region "table" but tableData stays
    // null, which would render as an empty grid in the editor.
    // Demote to plain text so the user sees the captured content
    // (caption + any cell text the LLM concatenated). They can
    // recreate as a real table via Insert > Table if needed.
    const blockType: PartialBlock['type'] =
      b.type === 'table' ? 'text' : b.type;
    sanitizedTextBlocks.push({
      type: blockType,
      x: ptToUnits(bb.x),
      y: ptToUnits(bb.y),
      w: ptToUnits(bb.w),
      h: ptToUnits(bb.h),
      content: b.text,
      imageSrc: null,
      imageFit: 'contain' as const,
      tableData: null,
    });
  }
  const blocks: PartialBlock[] = sanitizedTextBlocks;

  // Always lead the warning list with the text-only limitation so
  // the user knows up-front that figures + tables didn't come
  // along. When the page contained captions ("Figure N.", "Table
  // N."), include a count to make the gap concrete and actionable.
  const captionMatches = countCaptionMentions(rawResponseBlocks);
  const textOnlyWarnings: string[] = [
    captionMatches > 0
      ? `Text-only import — figures and tables were not captured. We detected ${captionMatches} figure/table caption${captionMatches === 1 ? '' : 's'} in the source; you'll need to re-add the visuals manually using the Insert tab.`
      : 'Text-only import — figures, tables, and other graphics were not captured. Use the Insert tab to add visuals manually.',
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
      ...textOnlyWarnings,
      ...(response.warnings ?? []),
      'Imported via vision model — verify the extracted text against the source.',
    ],
  });

  onProgress({ stage: 'ready' });
  return synth;
}

/**
 * Asks the LLM to detect whether a given image contains MULTIPLE
 * logos (e.g. a 3-logo institutional banner baked into a single
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


function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality = 0.92,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function releaseCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}

