import { supabase } from '@/lib/supabase';
import { IngestError, type PageImage } from './types';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL_SECONDS = 600;
const UPLOAD_FAILED_COPY =
  "The upload didn't complete — check your connection and try again.";

export async function uploadReviewPage(
  userId: string,
  sessionId: string,
  pageNumber: number,
  blob: Blob,
  dimensions: { widthPx: number; heightPx: number },
): Promise<PageImage> {
  const storagePath = `${userId}/review-temp/${sessionId}/page-${pageNumber}.jpg`;
  try {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
    }
  } catch (error) {
    if (error instanceof IngestError) {
      throw error;
    }
    throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
  }

  try {
    const { data, error: signingError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signingError || !data?.signedUrl) {
      throw new IngestError(UPLOAD_FAILED_COPY, 'upload-failed');
    }

    return {
      pageNumber,
      storagePath,
      signedUrl: data.signedUrl,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
    };
  } catch (error) {
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
