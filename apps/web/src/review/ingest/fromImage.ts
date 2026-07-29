import {
  canvasToBlob,
  downscaleForVision,
  rasterizeImage,
  releaseCanvas,
} from '@/import/imageImport';
import { assertFileAllowed, isCanvasBlank } from './guards';
import { IngestError, type IngestContext, type NormalizedArtifact } from './types';
import { uploadReviewPage } from './uploadReviewPage';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
const JPEG_QUALITY = 0.85;
const MIN_AUDIT_DIMENSION_PX = 1024;
const MAX_AUDIT_DIMENSION_PX = 2048;
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";
const BLANK_IMAGE_COPY =
  'That image looks blank — the checker needs something to read. Check the file and try again.';

function ensureAuditDimensions(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const shortEdge = Math.min(sourceCanvas.width, sourceCanvas.height);
  if (shortEdge >= MIN_AUDIT_DIMENSION_PX) {
    return sourceCanvas;
  }

  const longEdge = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale = Math.min(
    MAX_AUDIT_DIMENSION_PX / longEdge,
    MIN_AUDIT_DIMENSION_PX / shortEdge,
  );
  const drawWidth = Math.round(sourceCanvas.width * scale);
  const drawHeight = Math.round(sourceCanvas.height * scale);
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(MIN_AUDIT_DIMENSION_PX, drawWidth);
  outputCanvas.height = Math.max(MIN_AUDIT_DIMENSION_PX, drawHeight);

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
}

export async function fromImage(
  file: File,
  ingestContext: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, IMAGE_MIME_TYPES);

  let sourceCanvas: HTMLCanvasElement;
  try {
    ({ canvas: sourceCanvas } = await rasterizeImage(file));
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  const cappedCanvas = downscaleForVision(sourceCanvas);
  let reviewCanvas = cappedCanvas;
  try {
    const reviewContext = cappedCanvas.getContext('2d');
    if (!reviewContext) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }

    const imageData = reviewContext.getImageData(
      0,
      0,
      cappedCanvas.width,
      cappedCanvas.height,
    );
    if (isCanvasBlank(imageData)) {
      throw new IngestError(BLANK_IMAGE_COPY, 'blank-render');
    }

    reviewCanvas = ensureAuditDimensions(cappedCanvas);
    const dimensions = {
      widthPx: reviewCanvas.width,
      heightPx: reviewCanvas.height,
    };
    const blob = await canvasToBlob(reviewCanvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }

    const page = await uploadReviewPage(
      ingestContext.userId,
      ingestContext.sessionId,
      1,
      blob,
      dimensions,
    );
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
    releaseCanvas(sourceCanvas);
    if (cappedCanvas !== sourceCanvas) {
      releaseCanvas(cappedCanvas);
    }
    if (reviewCanvas !== sourceCanvas && reviewCanvas !== cappedCanvas) {
      releaseCanvas(reviewCanvas);
    }
  }
}
