/**
 * PNG/JPG ingest (spec §3): validate → rasterize → downscale to the
 * vision ceiling → blank check → audit-floor rescale → upload. Single
 * page, client-side, zero backend. Reuses the Tier-1 import raster
 * helpers (imageImport.ts) — rasterizeImage rejects corrupt/0-dimension
 * images, downscaleForVision caps the long edge at 2048px (the
 * resolution-ceiling guard). The audit floor then lifts tiny sources:
 * anything under the 1024px short-edge minimum is upscaled (white-
 * padded to center) so the critique call never sees a sub-legibility
 * render.
 */
import {
  canvasToBlob,
  downscaleForVision,
  rasterizeImage,
  releaseCanvas,
} from '@/import/imageImport';
import { assertFileAllowed, isCanvasBlank } from './guards';
import { IngestError, type IngestContext, type NormalizedArtifact } from './types';
import { uploadReviewPage } from './uploadReviewPage';

const IMAGE_MIME = ['image/png', 'image/jpeg'] as const;
const JPEG_QUALITY = 0.85;
const MIN_AUDIT_DIMENSION_PX = 1024; // spec audit floor on both axes
const MAX_AUDIT_DIMENSION_PX = 2048; // matches the vision ceiling (downscaleForVision)
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";
const BLANK_IMAGE_COPY =
  'That image looks blank — the checker needs something to read. Check the file and try again.';

/**
 * Rescale a raster into the audit envelope: short edge ≥ 1024 AND long
 * edge ≤ 2048. Sources inside the envelope pass through untouched;
 * oversized sources shrink to the ceiling, tiny sources upscale to the
 * floor, and an extreme aspect that can't satisfy both lands on the
 * floor (white-padded to center) since legibility is the binding
 * constraint. Returns the source canvas unchanged when no rescale is
 * needed.
 */
function ensureAuditDimensions(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const shortEdge = Math.min(sourceCanvas.width, sourceCanvas.height);
  const longEdge = Math.max(sourceCanvas.width, sourceCanvas.height);
  if (
    shortEdge >= MIN_AUDIT_DIMENSION_PX &&
    longEdge <= MAX_AUDIT_DIMENSION_PX
  ) {
    return sourceCanvas;
  }

  const scale =
    longEdge > MAX_AUDIT_DIMENSION_PX
      ? MAX_AUDIT_DIMENSION_PX / longEdge
      : Math.min(
          MAX_AUDIT_DIMENSION_PX / longEdge,
          MIN_AUDIT_DIMENSION_PX / shortEdge,
        );
  const drawWidth = Math.round(sourceCanvas.width * scale);
  const drawHeight = Math.round(sourceCanvas.height * scale);
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(MIN_AUDIT_DIMENSION_PX, drawWidth);
  outputCanvas.height = Math.max(MIN_AUDIT_DIMENSION_PX, drawHeight);

  try {
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(
      sourceCanvas,
      Math.round((outputCanvas.width - drawWidth) / 2),
      Math.round((outputCanvas.height - drawHeight) / 2),
      drawWidth,
      drawHeight,
    );
    return outputCanvas;
  } catch (error) {
    releaseCanvas(outputCanvas);
    throw error;
  }
}

export async function fromImage(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, IMAGE_MIME);

  let sourceCanvas: HTMLCanvasElement;
  try {
    ({ canvas: sourceCanvas } = await rasterizeImage(file));
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  let cappedCanvas = sourceCanvas;
  let reviewCanvas = sourceCanvas;
  try {
    cappedCanvas = downscaleForVision(sourceCanvas);
    reviewCanvas = cappedCanvas;
    const ctx2d = cappedCanvas.getContext('2d');
    if (!ctx2d) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    const imageData = ctx2d.getImageData(
      0,
      0,
      cappedCanvas.width,
      cappedCanvas.height,
    );
    if (isCanvasBlank(imageData)) {
      throw new IngestError(BLANK_IMAGE_COPY, 'blank-render');
    }

    reviewCanvas = ensureAuditDimensions(cappedCanvas);
    const dims = { widthPx: reviewCanvas.width, heightPx: reviewCanvas.height };
    const blob = await canvasToBlob(reviewCanvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }

    const page = await uploadReviewPage(ctx.userId, ctx.sessionId, 1, blob, dims);
    return {
      pages: [page],
      meta: {
        sourceKind: 'image',
        filename: file.name,
        pageCount: 1,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof IngestError) {
      throw error;
    }
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  } finally {
    releaseCanvas(sourceCanvas);
    if (cappedCanvas !== sourceCanvas) {
      releaseCanvas(cappedCanvas);
    }
    if (reviewCanvas !== sourceCanvas && reviewCanvas !== cappedCanvas) {
      releaseCanvas(reviewCanvas);
    }
  }
}
