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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchReviewPages', () => {
  it('uses environment, global fetch, and byte-limit defaults', async () => {
    vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(3));
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchReviewPages([page(1)])).resolves.toEqual([
      {
        mediaType: 'image/png',
        imageData: Buffer.from(new Uint8Array(3)).toString('base64'),
      },
    ]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('gives PageFetchError a stable default detail', () => {
    expect(new PageFetchError('fetch_failed').message).toBe('fetch_failed');
  });

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

  it('rejects a batch whose aggregate raw bytes exceed the request budget', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse(700))
      .mockResolvedValueOnce(imageResponse(700));

    await expect(
      fetchReviewPages(
        [page(1), page(2)],
        deps(fetchFn, { maxBytes: 1024, maxTotalBytes: 1024 }),
      ),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 2 });
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

  it('rejects a negative aggregate budget before reading a body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1));
    await expect(
      fetchReviewPages(
        [page(1)],
        deps(fetchFn, { maxBytes: 1024, maxTotalBytes: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
  });

  it('rejects a declared oversize page before reading its body', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('the declared-oversize body must not be read');
        },
        cancel,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '1025',
        },
      },
    );
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('reports a declared aggregate-budget overflow separately from the page cap', async () => {
    const first = imageResponse(700);
    const second = new Response(new Uint8Array(700), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '700',
      },
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    await expect(
      fetchReviewPages(
        [page(1), page(2)],
        deps(fetchFn, { maxBytes: 1024, maxTotalBytes: 1000 }),
      ),
    ).rejects.toMatchObject({
      code: 'too_large',
      message: expect.stringContaining('request budget'),
    });
  });

  it('keeps the typed size failure when cancelling a declared body rejects', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cancel failed'));
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/png',
        'content-length': '1025',
      }),
      body: { cancel },
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a chunked page as soon as its running byte count exceeds the cap', async () => {
    const cancel = vi.fn();
    const releaseLock = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: new Uint8Array(700),
      })
      .mockResolvedValueOnce({
        done: false,
        value: new Uint8Array(400),
      });
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: {
        getReader: () => ({
          read,
          cancel,
          releaseLock,
        }),
      },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1100)),
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed size failure when chunk-reader cancellation rejects', async () => {
    const releaseLock = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({
            done: false,
            value: new Uint8Array(1025),
          }),
          cancel: vi.fn().mockRejectedValue(new Error('cancel failed')),
          releaseLock,
        }),
      },
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large' });
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('skips empty chunks before retaining later image bytes', async () => {
    const releaseLock = vi.fn();
    const reads = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(0) })
      .mockResolvedValueOnce({
        done: false,
        value: new Uint8Array([1, 2, 3]),
      })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const streamed = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: {
        getReader: () => ({
          read: reads,
          cancel: vi.fn(),
          releaseLock,
        }),
      },
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(streamed);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).resolves.toEqual([
      {
        mediaType: 'image/png',
        imageData: Buffer.from([1, 2, 3]).toString('base64'),
      },
    ]);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('rejects a bodyless image response before provider work', async () => {
    const bodyless = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      body: null,
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(bodyless);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({
      code: 'fetch_failed',
      pageNumber: 1,
      message: expect.stringContaining('empty body'),
    });
  });

  it('rejects a streamed image that completes with zero bytes', async () => {
    const releaseLock = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array(0),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
          releaseLock,
        }),
      },
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({
      code: 'fetch_failed',
      pageNumber: 1,
      message: expect.stringContaining('empty body'),
    });
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('maps a non-Error stream rejection to fetch_failed', async () => {
    const releaseLock = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: {
        getReader: () => ({
          read: vi.fn().mockRejectedValue('stream exploded'),
          cancel: vi.fn(),
          releaseLock,
        }),
      },
    } as unknown as Response;
    const fetchFn = vi.fn().mockResolvedValue(response);

    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({
      code: 'fetch_failed',
      message: 'page 1: unknown',
    });
    expect(releaseLock).toHaveBeenCalledOnce();
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

  it('names a missing content type in the unsupported-media error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(1), { status: 200 }));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({
      code: 'unsupported_media',
      message: expect.stringContaining('content-type "missing"'),
    });
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

  it('maps a non-Error fetch rejection to a stable unknown detail', async () => {
    const fetchFn = vi.fn().mockRejectedValue('refused');
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({
      code: 'fetch_failed',
      message: 'page 1: unknown',
    });
  });
});
