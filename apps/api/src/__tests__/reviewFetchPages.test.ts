/**
 * review/fetchPages.ts — SSRF guard + byte cap + media-type allowlist.
 * fetchFn is stubbed with `new Response(...)` (the importExtract.test.ts
 * convention); no network, no vi.mock.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReviewPageRef } from '@postr/shared';
import {
  fetchReviewPages,
  PageFetchError,
} from '../review/fetchPages.js';

const SUPABASE_URL = 'https://testref.supabase.co';

function page(n: number, url?: string): ReviewPageRef {
  return {
    pageNumber: n,
    url:
      url ??
      `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/page-${n}.png?token=abc`,
    widthPx: 2048,
    heightPx: 1152,
  };
}

function imageResponse(byteLength: number, contentType = 'image/png'): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

const deps = (fetchFn: ReturnType<typeof vi.fn>, extra?: object) => ({
  supabaseUrl: SUPABASE_URL,
  fetchFn: fetchFn as unknown as typeof fetch,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchReviewPages', () => {
  it('fetches an allowlisted page and returns base64 + media type', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1024));
    const out = await fetchReviewPages([page(1)], deps(fetchFn));
    expect(out).toEqual([
      {
        mediaType: 'image/png',
        imageData: Buffer.from(new Uint8Array(1024)).toString('base64'),
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      page(1).url,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('keeps page order and per-page media types for multi-page artifacts', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse(10))
      .mockResolvedValueOnce(imageResponse(20, 'image/jpeg'));
    const out = await fetchReviewPages([page(1), page(2)], deps(fetchFn));
    expect(out.map((p) => p.mediaType)).toEqual(['image/png', 'image/jpeg']);
    expect(out[0]!.imageData).toBe(
      Buffer.from(new Uint8Array(10)).toString('base64'),
    );
    expect(out[1]!.imageData).toBe(
      Buffer.from(new Uint8Array(20)).toString('base64'),
    );
  });

  it('rejects a foreign host with url_not_allowed BEFORE any fetch', async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchReviewPages([page(1, 'https://evil.com/p.png')], deps(fetchFn)),
    ).rejects.toMatchObject({
      name: 'PageFetchError',
      code: 'url_not_allowed',
      pageNumber: 1,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed as url_not_allowed when the allowlist is not configured', async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchReviewPages([page(1)], {
        supabaseUrl: '',
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'url_not_allowed' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an oversize page with too_large (byte cap is injectable)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1025));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
  });

  it('accepts a page at exactly the byte cap', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1024));
    const out = await fetchReviewPages(
      [page(1)],
      deps(fetchFn, { maxBytes: 1024 }),
    );
    expect(out).toHaveLength(1);
  });

  it('rejects a non-image content-type with unsupported_media', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(100, 'text/html'));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({ code: 'unsupported_media', pageNumber: 1 });
  });

  it('rejects deceptive media types that only contain an image subtype', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(imageResponse(100, 'application/notjpeg'));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({ code: 'unsupported_media', pageNumber: 1 });
  });

  it('rejects an oversized content-length before reading the body', async () => {
    const response = new Response(new Uint8Array(1025), {
      status: 200,
      headers: {
        'content-length': '1025',
        'content-type': 'image/png',
      },
    });
    const arrayBufferSpy = vi.spyOn(response, 'arrayBuffer');
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it('aborts mid-stream when the body grows past the byte cap', async () => {
    // A deceptive (small/absent) content-length must not help: the stream
    // itself is capped as it is read.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
  });

  it('maps a response body read failure to fetch_failed', async () => {
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('stream failed'));
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(failedBody, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    const err = await fetchReviewPages([page(1)], deps(fetchFn)).catch(
      (error) => error,
    );
    expect(err).toBeInstanceOf(PageFetchError);
    expect(err).toMatchObject({ code: 'fetch_failed', pageNumber: 1 });
  });

  it('rejects a failed upstream response with fetch_failed + status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('gone', { status: 404 }));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({ code: 'fetch_failed', status: 404 });
  });

  it('maps a rejected fetch (e.g. a refused redirect) to fetch_failed', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: unexpected redirect'));
    const err = await fetchReviewPages([page(1)], deps(fetchFn)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(PageFetchError);
    expect(err).toMatchObject({ code: 'fetch_failed' });
  });
});
