import { rasterizeImage, releaseCanvas } from '@/import/imageImport';
import { isCanvasBlank } from './guards';
import { IngestError } from './types';

const REVIEW_LONG_EDGE_PX = 2048;
const REVIEW_MAX_SOURCE_PIXELS = 40_000_000;

/** Decode a review page at bounded resolution and reject flat renders. */
export async function assertReviewPageBlobNotBlank(
  blob: Blob,
  blankMessage: string,
): Promise<void> {
  let canvas: HTMLCanvasElement | undefined;
  try {
    const file = new File([blob], 'review-page.jpg', {
      type: blob.type || 'image/jpeg',
    });
    ({ canvas } = await rasterizeImage(file, {
      maxDimension: REVIEW_LONG_EDGE_PX,
      maxSourcePixels: REVIEW_MAX_SOURCE_PIXELS,
    }));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D context available.');
    if (
      isCanvasBlank(
        context.getImageData(0, 0, canvas.width, canvas.height),
      )
    ) {
      throw new IngestError(blankMessage, 'blank-render');
    }
  } finally {
    if (canvas) releaseCanvas(canvas);
  }
}
