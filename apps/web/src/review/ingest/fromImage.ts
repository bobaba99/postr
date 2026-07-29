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
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";
const BLANK_IMAGE_COPY =
  'That image looks blank — the checker needs something to read. Check the file and try again.';

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

  const reviewCanvas = downscaleForVision(sourceCanvas);
  try {
    const reviewContext = reviewCanvas.getContext('2d');
    if (!reviewContext) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }

    const imageData = reviewContext.getImageData(
      0,
      0,
      reviewCanvas.width,
      reviewCanvas.height,
    );
    if (isCanvasBlank(imageData)) {
      throw new IngestError(BLANK_IMAGE_COPY, 'blank-render');
    }

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
    if (reviewCanvas !== sourceCanvas) {
      releaseCanvas(reviewCanvas);
    }
  }
}
