/**
 * PNG/JPG ingest (spec §3): validate → rasterize → downscale to the
 * vision ceiling → blank check → upload. Single page, client-side,
 * zero backend. Reuses the Tier-1 import raster helpers
 * (imageImport.ts) — rasterizeImage rejects corrupt/0-dimension
 * images, downscaleForVision caps the long edge at 2048px (the
 * resolution-ceiling guard).
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
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

export async function fromImage(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, IMAGE_MIME);

  let canvas: HTMLCanvasElement;
  try {
    ({ canvas } = await rasterizeImage(file));
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  const scaled = downscaleForVision(canvas);
  try {
    const ctx2d = scaled.getContext('2d');
    if (!ctx2d) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    if (isCanvasBlank(ctx2d.getImageData(0, 0, scaled.width, scaled.height))) {
      throw new IngestError(
        'That image looks blank — the checker needs something to read. Check the file and try again.',
        'blank-render',
      );
    }

    const dims = { widthPx: scaled.width, heightPx: scaled.height };
    const blob = await canvasToBlob(scaled, 'image/jpeg', JPEG_QUALITY);
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
  } finally {
    releaseCanvas(canvas);
    if (scaled !== canvas) releaseCanvas(scaled);
  }
}
