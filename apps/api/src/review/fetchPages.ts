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
import { REVIEW_IMAGE_MAX_BYTES } from './config.js';

export interface FetchedPage {
  mediaType: 'image/jpeg' | 'image/png';
  imageData: string;
}

function parsePageMediaType(
  contentType: string,
): FetchedPage['mediaType'] | null {
  if (contentType.includes('jpeg')) {
    return 'image/jpeg';
  }
  if (contentType.includes('png')) {
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

    const buf = Buffer.from(await response.arrayBuffer());
    // Raw bytes BEFORE base64 (which inflates 4/3): a clean typed error
    // beats an opaque upstream rejection (import.ts:544-551).
    if (buf.byteLength > maxBytes) {
      throw new PageFetchError(
        'too_large',
        `page ${page.pageNumber}: ${buf.byteLength} bytes exceeds ${maxBytes}`,
        page.pageNumber,
      );
    }

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
