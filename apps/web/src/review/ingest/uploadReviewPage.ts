/**
 * Upload one rendered review page to the poster-assets bucket and
 * mint the short-lived signed URL the critique call re-fetches
 * through. Mirrors the posterImages.ts storage conventions (upsert +
 * contentType, supabase-js error objects) but throws the ingest
 * layer's typed IngestError instead of returning null — spec §3:
 * ingest failures are typed errors, never silent nulls.
 *
 * Pages live under {userId}/review-temp/{sessionId}/ so concurrent
 * ingests never collide; the UI deletes them via cleanupReviewTemp on
 * unmount and on "start a new review" (Milestone 5).
 */
import { supabase } from '@/lib/supabase';
import { IngestError, type PageImage } from './types';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL_SEC = 600; // 10 minutes — the critique call fetches within this window

export async function uploadReviewPage(
  userId: string,
  sessionId: string,
  pageNumber: number,
  blob: Blob,
  dims: { widthPx: number; heightPx: number },
): Promise<PageImage> {
  const storagePath = `${userId}/review-temp/${sessionId}/page-${pageNumber}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signErr || !data?.signedUrl) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  return {
    pageNumber,
    storagePath,
    signedUrl: data.signedUrl,
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
  };
}
