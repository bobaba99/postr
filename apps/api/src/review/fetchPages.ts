/**
 * Server-side re-fetch of review page images, SSRF-guarded. The signed
 * URLs the client uploads stay internal: the API fetches the bytes itself
 * and forwards base64 to the model (the import.ts:525-528 rationale — the
 * bucket stays private and arbitrary internal-only URLs keep working).
 *
 * Per page, modeled on import.ts:494-558: checkImageUrl allowlist →
 * fetch with redirect:'error' → ok check → byte cap BEFORE base64 →
 * content-type → mediaType. Two deliberate tightenings over import.ts:
 *   - the body is STREAMED with a mid-read abort at the byte cap (never
 *     buffered whole via arrayBuffer), and a declared oversized
 *     content-length is rejected before a single byte is read;
 *   - the media type is parsed STRICTLY (the exact mime, parameters
 *     stripped) — an unknown content-type is `unsupported_media`, not a
 *     substring match or png fallback: a "page" that isn't a jpeg/png is
 *     an ingest bug, and failing typed beats confusing the vision pass.
 */
import type { ReviewPageRef } from '@postr/shared';
import { checkImageUrl } from '../imageUrlGuard.js';
import { REVIEW_IMAGE_MAX_BYTES } from './config.js';

export interface FetchedPage {
  mediaType: 'image/jpeg' | 'image/png';
  imageData: string;
}

/** Strict mime parse: the exact type/subtype, parameters stripped. */
function parsePageMediaType(
  contentType: string,
): FetchedPage['mediaType'] | null {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType === 'image/jpeg') {
    return 'image/jpeg';
  }
  if (mediaType === 'image/png') {
    return 'image/png';
  }
  return null;
}

/**
 * Typed failure the route maps to a status (url_not_allowed→400,
 * unsupported_media→400, too_large→413, fetch_failed→502). `pageNumber`
 * names the offending page; `status` carries the upstream HTTP status
 * for fetch_failed. Class shape mirrors CondenseUpstreamError.
 */
export class PageFetchError extends Error {
  constructor(
    public readonly code:
      | 'url_not_allowed'
      | 'fetch_failed'
      | 'too_large'
      | 'unsupported_media',
    detail?: string,
    public readonly pageNumber?: number,
    public readonly status?: number,
  ) {
    super(detail ?? code);
    this.name = 'PageFetchError';
  }
}

function createTooLargeError(
  pageNumber: number,
  byteLength: number,
  maxBytes: number,
): PageFetchError {
  return new PageFetchError(
    'too_large',
    `page ${pageNumber}: ${byteLength} bytes exceeds ${maxBytes}`,
    pageNumber,
  );
}

function parseContentLength(response: Response): number | null {
  const headerValue = response.headers.get('content-length');
  if (!headerValue) {
    return null;
  }

  const byteLength = Number(headerValue);
  return Number.isSafeInteger(byteLength) && byteLength >= 0
    ? byteLength
    : null;
}

/**
 * Read a page body with the byte cap enforced AS IT STREAMS. A declared
 * oversized content-length is refused before a single byte is read; a
 * deceptive (small or absent) one is caught mid-stream and the read
 * aborted — the raw-byte cap precedes base64 (which inflates 4/3) so the
 * caller gets a clean typed error instead of an opaque upstream
 * rejection (import.ts:544-551 precedent), without ever buffering the
 * whole body past the cap.
 */
async function readPageBody(
  response: Response,
  pageNumber: number,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = parseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw createTooLargeError(pageNumber, contentLength, maxBytes);
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw createTooLargeError(pageNumber, byteLength, maxBytes);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PageFetchError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'unknown';
    throw new PageFetchError(
      'fetch_failed',
      `page ${pageNumber}: ${message}`,
      pageNumber,
    );
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, byteLength);
}

/**
 * Fetch every page in order. Any failure aborts the whole batch — a
 * critique over a partial page set would silently miss content (the
 * "never silently truncate" rule applies to dropped pages too).
 *
 * `opts.supabaseUrl` defaults to process.env.SUPABASE_URL; when it is
 * missing the guard fails closed as url_not_allowed (the detail string
 * records 'allowlist_not_configured' for logs). `opts.maxBytes` defaults
 * to REVIEW_IMAGE_MAX_BYTES and exists so tests don't allocate 5MB.
 */
export async function fetchReviewPages(
  pages: ReviewPageRef[],
  opts: {
    supabaseUrl?: string;
    fetchFn?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<FetchedPage[]> {
  const supabaseUrl = opts.supabaseUrl ?? process.env.SUPABASE_URL;
  const fetchFn = opts.fetchFn ?? fetch;
  const maxBytes = opts.maxBytes ?? REVIEW_IMAGE_MAX_BYTES;

  const out: FetchedPage[] = [];
  for (const page of pages) {
    const check = checkImageUrl(page.url, supabaseUrl);
    if (!check.ok) {
      throw new PageFetchError(
        'url_not_allowed',
        `page ${page.pageNumber}: ${check.reason}`,
        page.pageNumber,
      );
    }

    let response: Response;
    try {
      response = await fetchFn(page.url, {
        signal: AbortSignal.timeout(15_000),
        // The host allowlist is worthless if the allowed host can 302
        // elsewhere — refuse redirects outright (import.ts:534-537).
        redirect: 'error',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      throw new PageFetchError(
        'fetch_failed',
        `page ${page.pageNumber}: ${message}`,
        page.pageNumber,
      );
    }
    if (!response.ok) {
      throw new PageFetchError(
        'fetch_failed',
        `page ${page.pageNumber}: upstream HTTP ${response.status}`,
        page.pageNumber,
        response.status,
      );
    }

    const buf = await readPageBody(response, page.pageNumber, maxBytes);

    const contentType = response.headers.get('content-type') ?? '';
    const mediaType = parsePageMediaType(contentType);
    if (!mediaType) {
      throw new PageFetchError(
        'unsupported_media',
        `page ${page.pageNumber}: content-type "${contentType || 'missing'}" is not image/jpeg or image/png`,
        page.pageNumber,
      );
    }

    out.push({ mediaType, imageData: buf.toString('base64') });
  }
  return out;
}
