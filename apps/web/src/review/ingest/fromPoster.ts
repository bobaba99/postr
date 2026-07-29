/**
 * Postr-native ingest (spec §3): re-capture the open poster at
 * critique resolution (D11) and ship the PosterDoc alongside the page
 * image — the doc powers block-anchored findings and the
 * deterministic grounding signals downstream (§4.4).
 */
import type { PosterDoc } from '@postr/shared';
import { captureReviewImage } from '@/data/thumbnails';
import { IngestError, type NormalizedArtifact, type PageImage } from './types';

/** Long-edge target matching captureReviewImage (D11). */
const REVIEW_LONG_EDGE_PX = 2048;
/** Spec audit minimum on both axes — same floor as reviewTargetWidthPx. */
const REVIEW_SHORT_EDGE_PX = 1024;

/**
 * Pixel dims of the captured review image, derived from the doc's
 * aspect ratio. Solves for long edge >= 2048 AND short edge >= 1024
 * (the audit minimum), matching captureReviewImage's dual-floor
 * targeting so reported dims agree with the actual JPEG.
 */
export function reviewPixelDims(doc: {
  widthIn: number;
  heightIn: number;
}): { widthPx: number; heightPx: number } {
  const longEdge = Math.max(doc.widthIn, doc.heightIn);
  const shortEdge = Math.min(doc.widthIn, doc.heightIn);
  const scale = Math.max(
    REVIEW_LONG_EDGE_PX / longEdge,
    REVIEW_SHORT_EDGE_PX / shortEdge,
  );
  // ceil, not round: a floor that rounding can undershoot is not a floor.
  return {
    widthPx: Math.ceil(doc.widthIn * scale),
    heightPx: Math.ceil(doc.heightIn * scale),
  };
}

export async function fromPoster(
  doc: PosterDoc,
  ctx: { userId: string; posterId: string },
): Promise<NormalizedArtifact> {
  const capture = await captureReviewImage(ctx.userId, ctx.posterId);
  if (!capture) {
    throw new IngestError(
      "We couldn't capture the poster — reopen it in the editor and try again.",
      'unreadable-file',
    );
  }

  const page: PageImage = {
    pageNumber: 1,
    storagePath: capture.path,
    signedUrl: capture.signedUrl,
    ...reviewPixelDims(doc),
  };
  return {
    pages: [page],
    posterDoc: doc,
    meta: {
      sourceKind: 'postr',
      pageCount: 1,
      ingestedAt: new Date().toISOString(),
    },
  };
}
