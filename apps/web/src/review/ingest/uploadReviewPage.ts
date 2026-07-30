/**
 * Upload one rendered review page to the poster-assets bucket and
 * mint the short-lived signed URL the critique call re-fetches
 * through. Mirrors the posterImages.ts storage conventions (upsert +
 * contentType, supabase-js error objects) but throws the ingest
 * layer's typed IngestError instead of returning null — spec §3:
 * ingest failures are typed errors, never silent nulls.
 *
 * Pages live under {userId}/review-temp/{sessionId}/ so concurrent
 * ingests never collide; the UI deletes the folder after the critique
 * completes (Milestone 5).
 */
import { supabase } from '@/lib/supabase';
import { createLocalPreviewUrl } from './localPreview';
import { IngestError, type PageImage } from './types';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL_SEC = 600; // 10 minutes — the critique call fetches within this window

/** Best-effort rollback for pages that cannot be used by a review. */
export async function removeReviewPages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(storagePaths);
  } catch {
    // Cleanup must never replace the ingest result or its primary error.
  }
}

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

  try {
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
    if (signErr || !data?.signedUrl) {
      throw new Error('signing failed');
    }

    const previewUrl = createLocalPreviewUrl(blob);
    return {
      pageNumber,
      storagePath,
      signedUrl: data.signedUrl,
      ...(previewUrl ? { previewUrl } : {}),
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
    };
  } catch {
    await removeReviewPages([storagePath]);
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }
}
