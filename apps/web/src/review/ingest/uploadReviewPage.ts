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
 * unmount and on "start a new review" (Milestone 5). If the page
 * uploads but signing fails, the orphaned object is removed here
 * (best-effort) — nothing else knows it exists — and the ORIGINAL
 * error is rethrown so the caller keeps its failure context.
 */
import { supabase } from '@/lib/supabase';
import { IngestError, type PageImage } from './types';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL_SEC = 600; // 10 minutes — the critique call fetches within this window
const UPLOAD_FAILED_COPY =
  "The upload didn't complete — check your connection and try again.";

export async function uploadReviewPage(
  userId: string,
  sessionId: string,
  pageNumber: number,
  blob: Blob,
  dims: { widthPx: number; heightPx: number },
): Promise<PageImage> {
  const storagePath = `${userId}/review-temp/${sessionId}/page-${pageNumber}.jpg`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
    }
  } catch (error) {
    if (error instanceof IngestError) {
      throw error;
    }
    throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
  }

  try {
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
    if (signErr || !data?.signedUrl) {
      throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
    }

    return {
      pageNumber,
      storagePath,
      signedUrl: data.signedUrl,
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
    };
  } catch (error) {
    // The object is already in the bucket — remove it (best-effort)
    // before rethrowing the ORIGINAL error, or a failed ingest strands
    // one orphan per attempted page until the sweep runs.
    try {
      const { error: removalError } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);
      if (removalError) {
        console.error('Failed to remove unsigned review page:', removalError);
      }
    } catch (removalError) {
      console.error('Failed to remove unsigned review page:', removalError);
    }
    throw error;
  }
}
