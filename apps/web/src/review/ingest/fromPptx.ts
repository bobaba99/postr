/**
 * PPTX ingest (spec §3, D10): the browser has no faithful PPTX
 * renderer, so the raw .pptx round-trips through Storage to the
 * server route /api/review/render-pptx (LibreOffice → PDF → page
 * JPEGs). The route returns short-lived signed page URLs; the raw
 * upload is removed best-effort afterwards. The route enforces the
 * page cap server-side and reports it as { error: 'too_many_pages' }
 * — mapped to the ingest layer's typed error here.
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
import {
  downloadLocalPreviewUrl,
  revokePagePreviews,
} from './localPreview';
import { removeReviewPages } from './uploadReviewPage';

const BUCKET = 'poster-assets';
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SIGNED_URL_TTL_SEC = 600;
const UPLOAD_FAILED_MESSAGE =
  "The upload didn't complete — check your connection and try again.";
const SERVER_RENDER_FAILED_MESSAGE =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

/** Rendered pages are temporary objects that the critique flow must
 * be able to remove, so the route response must include their paths. */
type RenderedReviewPageRef = ReviewPageRef & { storagePath: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isOwnedReviewTempPath(path: string, userId: string): boolean {
  const segments = path.split('/');
  return (
    segments.length >= 4 &&
    segments[0] === userId &&
    segments[1] === 'review-temp' &&
    segments.every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    )
  );
}

function isRenderedReviewPage(
  value: unknown,
  userId: string,
): value is RenderedReviewPageRef {
  return (
    isRecord(value) &&
    isPositiveInteger(value.pageNumber) &&
    isUrl(value.url) &&
    isPositiveInteger(value.widthPx) &&
    isPositiveInteger(value.heightPx) &&
    typeof value.storagePath === 'string' &&
    isOwnedReviewTempPath(value.storagePath, userId)
  );
}

function parseRenderedPages(
  response: unknown,
  userId: string,
): RenderedReviewPageRef[] {
  if (
    !isRecord(response) ||
    !Array.isArray(response.pages) ||
    response.pages.length < 1 ||
    response.pages.length > INGEST_MAX_PAGES ||
    !response.pages.every((page) => isRenderedReviewPage(page, userId))
  ) {
    throw new IngestError(SERVER_RENDER_FAILED_MESSAGE, 'server-render-failed');
  }
  return response.pages as RenderedReviewPageRef[];
}

async function removeRawUpload(rawPath: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([rawPath]);
  } catch {
    // Cleanup is best-effort and must not replace the ingest result.
  }
}

export async function fromPptx(
  file: File,
  ctx: IngestContext,
  previewOpts: {
    fetchFn?: typeof fetch;
    createObjectUrl?: (blob: Blob) => string;
  } = {},
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, [PPTX_MIME]);

  const rawPath = `${ctx.userId}/review-temp/${ctx.sessionId}/source.pptx`;
  let error: unknown;
  try {
    ({ error } = await supabase.storage
      .from(BUCKET)
      .upload(rawPath, file, { contentType: PPTX_MIME, upsert: true }));
  } catch {
    await removeRawUpload(rawPath);
    throw new IngestError(UPLOAD_FAILED_MESSAGE, 'upload-failed');
  }
  if (error) {
    throw new IngestError(UPLOAD_FAILED_MESSAGE, 'upload-failed');
  }

  let signedUrl: string;
  try {
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(rawPath, SIGNED_URL_TTL_SEC);
    if (signErr || !data?.signedUrl) {
      throw new Error('signing failed');
    }
    signedUrl = data.signedUrl;
  } catch {
    await removeRawUpload(rawPath);
    throw new IngestError(UPLOAD_FAILED_MESSAGE, 'upload-failed');
  }

  try {
    const response = await postJson<unknown>(
      '/api/review/render-pptx',
      { fileUrl: signedUrl },
      { auth: true },
    );
    const pages = parseRenderedPages(response, ctx.userId);
    const pageImages: PageImage[] = [];
    try {
      for (const page of pages) {
        const previewUrl = await downloadLocalPreviewUrl(page.url, previewOpts);
        pageImages.push({
          pageNumber: page.pageNumber,
          storagePath: page.storagePath,
          signedUrl: page.url,
          ...(previewUrl ? { previewUrl } : {}),
          widthPx: page.widthPx,
          heightPx: page.heightPx,
        });
      }
    } catch {
      revokePagePreviews(pageImages);
      await removeReviewPages(pages.map((page) => page.storagePath));
      throw new IngestError(
        SERVER_RENDER_FAILED_MESSAGE,
        'server-render-failed',
      );
    }
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
        SERVER_RENDER_FAILED_MESSAGE,
        'server-render-failed',
      );
    }
    throw err;
  } finally {
    await removeRawUpload(rawPath);
  }
}
