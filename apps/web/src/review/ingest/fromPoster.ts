/**
 * Postr-native ingest (spec §3): re-capture the open poster at
 * critique resolution (D11) and ship the PosterDoc alongside the page
 * image — the doc powers block-anchored findings and the
 * deterministic grounding signals downstream (§4.4).
 */
import type { PosterDoc } from '@postr/shared';
import { captureReviewImage } from '@/data/thumbnails';
import { createLocalPreviewUrl } from './localPreview';
import { IngestError, type NormalizedArtifact, type PageImage } from './types';

/** captureReviewImage lands the long edge at 2048px (D11). */
const REVIEW_LONG_EDGE_PX = 2048;

/** Pixel dims of the captured review image, derived from the doc's
 *  aspect ratio — matches captureReviewImage's long-edge targeting. */
export function reviewPixelDims(doc: {
  widthIn: number;
  heightIn: number;
}): { widthPx: number; heightPx: number } {
  const scale = REVIEW_LONG_EDGE_PX / Math.max(doc.widthIn, doc.heightIn);
  return {
    widthPx: Math.round(doc.widthIn * scale),
    heightPx: Math.round(doc.heightIn * scale),
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

  const previewUrl = createLocalPreviewUrl(capture.blob);
  const page: PageImage = {
    pageNumber: 1,
    storagePath: capture.path,
    signedUrl: capture.signedUrl,
    ...(previewUrl ? { previewUrl } : {}),
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
