/**
 * PPTX ingest (spec §3, D10): the browser has no faithful PPTX
 * renderer, so the raw .pptx round-trips through Storage to the
 * server route /api/review/render-pptx (LibreOffice → PDF → page
 * JPEGs). The route returns short-lived signed page URLs; the raw
 * upload is removed best-effort afterwards (same temp-cleanup idiom
 * as imageImport.ts:365). The route enforces the page cap server-side
 * and reports it as { error: 'too_many_pages' } — mapped to the
 * ingest layer's typed error here.
 */
import type { ReviewPageRef } from '@postr/shared';
import { supabase } from '@/lib/supabase';
import { ApiError, postJson } from '@/lib/apiClient';
import { assertFileAllowed } from './guards';
import {
  IngestError,
  INGEST_MAX_PAGES,
  type IngestContext,
  type NormalizedArtifact,
  type PageImage,
} from './types';

const BUCKET = 'poster-assets';
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SIGNED_URL_TTL_SEC = 600;

export async function fromPptx(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, [PPTX_MIME]);

  const rawPath = `${ctx.userId}/review-temp/${ctx.sessionId}/source.pptx`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(rawPath, file, { contentType: PPTX_MIME, upsert: true });
  if (error) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(rawPath, SIGNED_URL_TTL_SEC);
  if (signErr || !data?.signedUrl) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  try {
    const { pages } = await postJson<{ pages: ReviewPageRef[] }>(
      '/api/review/render-pptx',
      { fileUrl: data.signedUrl },
      { auth: true },
    );
    const pageImages: PageImage[] = pages.map((p) => ({
      pageNumber: p.pageNumber,
      // The route's server-owned review-temp path — the caller deletes
      // these with cleanupReviewTemp when the review is done.
      storagePath: p.storagePath ?? '',
      signedUrl: p.url,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    }));
    return {
      pages: pageImages,
      meta: {
        sourceKind: 'pptx',
        filename: file.name,
        pageCount: pageImages.length,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      const code = (err.body as { error?: string } | null)?.error;
      if (code === 'too_many_pages') {
        throw new IngestError(
          `That deck has too many slides — the checker reads up to ${INGEST_MAX_PAGES}. Trim it and try again.`,
          'too-many-pages',
        );
      }
      throw new IngestError(
        "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
        'server-render-failed',
      );
    }
    throw err;
  } finally {
    // Best-effort: the raw .pptx has round-tripped — RLS protects
    // against cross-user deletes; failure is fine.
    void supabase.storage.from(BUCKET).remove([rawPath]);
  }
}
