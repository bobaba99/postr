/**
 * Server-side re-fetch of review page images, SSRF-guarded. The signed
 * URLs the client uploads stay internal: the API fetches the bytes itself
 * and forwards base64 to the model (the import.ts:525-528 rationale — the
 * bucket stays private and arbitrary internal-only URLs keep working).
 *
 * Per page, modeled on import.ts:494-558: checkImageUrl allowlist →
 * fetch with redirect:'error' → ok check → raw-byte cap BEFORE base64 →
 * content-type → mediaType. Stricter than import.ts in one place: an
 * unknown content-type is `unsupported_media`, not a png fallback — a
 * "page" that isn't a jpeg/png is an ingest bug, and failing typed beats
 * confusing the vision pass.
 */
import type { ReviewPageRef } from '@postr/shared';
import { checkImageUrl } from '../imageUrlGuard.js';
import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_PAGE_FETCH_TIMEOUT_MS,
  REVIEW_TOTAL_IMAGE_MAX_BYTES,
} from './config.js';

export interface FetchedPage {
  mediaType: 'image/jpeg' | 'image/png';
  imageData: string;
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

/**
 * Fetch every page in order. Any failure aborts the whole batch — a
 * critique over a partial page set would silently miss content (the
 * "never silently truncate" rule applies to dropped pages too).
 *
 * `opts.supabaseUrl` defaults to process.env.SUPABASE_URL; when it is
 * missing the guard fails closed as url_not_allowed (the detail string
 * records 'allowlist_not_configured' for logs). `opts.maxBytes` defaults
 * to REVIEW_IMAGE_MAX_BYTES and exists so tests don't allocate 5MB.
 * `opts.maxTotalBytes` bounds the raw bytes retained across every page.
 */
export async function fetchReviewPages(
  pages: ReviewPageRef[],
  opts: {
    supabaseUrl?: string;
    fetchFn?: typeof fetch;
    maxBytes?: number;
    maxTotalBytes?: number;
  } = {},
): Promise<FetchedPage[]> {
  const supabaseUrl = opts.supabaseUrl ?? process.env.SUPABASE_URL;
  const fetchFn = opts.fetchFn ?? fetch;
  const maxBytes = opts.maxBytes ?? REVIEW_IMAGE_MAX_BYTES;
  const maxTotalBytes =
    opts.maxTotalBytes ?? REVIEW_TOTAL_IMAGE_MAX_BYTES;

  const out: FetchedPage[] = [];
  let totalBytes = 0;
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
        signal: AbortSignal.timeout(REVIEW_PAGE_FETCH_TIMEOUT_MS),
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

    const contentType = response.headers.get('content-type') ?? '';
    const mediaType = contentType.includes('jpeg')
      ? ('image/jpeg' as const)
      : contentType.includes('png')
        ? ('image/png' as const)
        : null;
    if (!mediaType) {
      throw new PageFetchError(
        'unsupported_media',
        `page ${page.pageNumber}: content-type "${contentType || 'missing'}" is not image/jpeg or image/png`,
        page.pageNumber,
      );
    }

    const remainingTotal = maxTotalBytes - totalBytes;
    const allowedBytes = Math.min(maxBytes, remainingTotal);
    if (allowedBytes < 0) {
      throw new PageFetchError(
        'too_large',
        `page ${page.pageNumber}: request exceeds ${maxTotalBytes} total bytes`,
        page.pageNumber,
      );
    }

    const buf = await readBoundedPageBody(
      response,
      allowedBytes,
      page.pageNumber,
      maxBytes,
      maxTotalBytes,
      remainingTotal,
    );
    totalBytes += buf.byteLength;
    out.push({ mediaType, imageData: buf.toString('base64') });
  }
  return out;
}

async function readBoundedPageBody(
  response: Response,
  allowedBytes: number,
  pageNumber: number,
  maxBytes: number,
  maxTotalBytes: number,
  remainingTotal: number,
): Promise<Buffer> {
  const declared = response.headers.get('content-length')?.trim();
  if (declared && /^\d+$/.test(declared)) {
    const declaredBytes = BigInt(declared);
    if (declaredBytes > BigInt(allowedBytes)) {
      await cancelBody(response.body);
      const reason =
        declaredBytes > BigInt(maxBytes)
          ? `${declared} bytes exceeds ${maxBytes}`
          : `${declared} bytes exceeds the ${remainingTotal}-byte remainder of the ${maxTotalBytes}-byte request budget`;
      throw new PageFetchError(
        'too_large',
        `page ${pageNumber}: ${reason}`,
        pageNumber,
      );
    }
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const nextTotal = total + value.byteLength;
      if (nextTotal > allowedBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best effort: the typed size error remains authoritative.
        }
        const reason =
          nextTotal > maxBytes
            ? `${nextTotal} bytes exceeds ${maxBytes}`
            : `${nextTotal} bytes exceeds the ${remainingTotal}-byte remainder of the ${maxTotalBytes}-byte request budget`;
        throw new PageFetchError(
          'too_large',
          `page ${pageNumber}: ${reason}`,
          pageNumber,
        );
      }
      chunks.push(value);
      total = nextTotal;
    }
  } catch (error) {
    if (error instanceof PageFetchError) throw error;
    const message = error instanceof Error ? error.message : 'unknown';
    throw new PageFetchError(
      'fetch_failed',
      `page ${pageNumber}: ${message}`,
      pageNumber,
    );
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function cancelBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // Best effort: the typed size error remains authoritative.
  }
}
