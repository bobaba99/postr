/**
 * fromPptx: raw upload → signed URL → /api/review/render-pptx → pages.
 * Supabase and the API client are mocked; the real ApiError class is
 * kept (importOriginal) so the instanceof error mapping is exercised
 * for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPostJson, mockUpload, mockCreateSignedUrl, mockRemove } = vi.hoisted(() => ({
  mockPostJson: vi.fn(),
  mockUpload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postJson: mockPostJson,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      }),
    },
  },
}));

import { ApiError } from '@/lib/apiClient';
import { fromPptx } from '../fromPptx';

const CTX = { userId: 'u1', sessionId: 'sess-1' };
const RAW_PATH = 'u1/review-temp/sess-1/source.pptx';
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const VALID_RENDERED_PAGE = {
  pageNumber: 1,
  storagePath: 'u1/review-temp/rendered/page-1.jpg',
  url: 'https://signed/p1',
  widthPx: 1280,
  heightPx: 720,
};

function pptxFile(name = 'deck.pptx'): File {
  return new File(['pptx-bytes'], name, { type: PPTX_MIME });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed/raw-pptx' },
    error: null,
  });
  mockRemove.mockResolvedValue({ data: null, error: null });
});

describe('fromPptx', () => {
  it('round-trips the raw file and normalizes rendered pages with server paths when available', async () => {
    mockPostJson.mockResolvedValue({
      pages: [
        VALID_RENDERED_PAGE,
        {
          pageNumber: 2,
          storagePath: 'u1/review-temp/rendered/page-2.jpg',
          url: 'https://signed/p2',
          widthPx: 1280,
          heightPx: 720,
        },
      ],
    });

    const fetchFn = vi.fn().mockImplementation(async () =>
      new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const createObjectUrl = vi
      .fn()
      .mockReturnValueOnce('blob:https://postr.test/pptx-page-1')
      .mockReturnValueOnce('blob:https://postr.test/pptx-page-2');
    const artifact = await fromPptx(pptxFile(), CTX, {
      fetchFn: fetchFn as unknown as typeof fetch,
      createObjectUrl,
    });

    expect(mockUpload).toHaveBeenCalledWith(
      RAW_PATH,
      expect.any(File),
      { contentType: PPTX_MIME, upsert: true },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(RAW_PATH, 600);
    expect(mockPostJson).toHaveBeenCalledWith(
      '/api/review/render-pptx',
      { fileUrl: 'https://signed/raw-pptx' },
      { auth: true },
    );
    expect(artifact.pages).toEqual([
      {
        pageNumber: 1,
        storagePath: 'u1/review-temp/rendered/page-1.jpg',
        signedUrl: 'https://signed/p1',
        previewUrl: 'blob:https://postr.test/pptx-page-1',
        widthPx: 1280,
        heightPx: 720,
      },
      {
        pageNumber: 2,
        storagePath: 'u1/review-temp/rendered/page-2.jpg',
        signedUrl: 'https://signed/p2',
        previewUrl: 'blob:https://postr.test/pptx-page-2',
        widthPx: 1280,
        heightPx: 720,
      },
    ]);
    expect(artifact.meta).toMatchObject({
      sourceKind: 'pptx',
      filename: 'deck.pptx',
      pageCount: 2,
    });
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });

  it('downloads browser-local previews before critique cleanup removes rendered pages', async () => {
    mockPostJson.mockResolvedValue({ pages: [VALID_RENDERED_PAGE] });
    const previewBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(previewBlob, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const createObjectUrl = vi
      .fn()
      .mockReturnValue('blob:https://postr.test/pptx-page-1');

    const artifact = await fromPptx(pptxFile(), CTX, {
      fetchFn: fetchFn as unknown as typeof fetch,
      createObjectUrl,
    });

    expect(fetchFn).toHaveBeenCalledWith('https://signed/p1', {
      credentials: 'omit',
      redirect: 'error',
    });
    expect(createObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/jpeg' }),
    );
    expect(artifact.pages[0]!.previewUrl).toBe(
      'blob:https://postr.test/pptx-page-1',
    );
  });

  it("maps the route's too_many_pages body to too-many-pages", async () => {
    mockPostJson.mockRejectedValue(
      new ApiError('too_many_pages', 400, { error: 'too_many_pages' }),
    );

    let caught: unknown;
    try {
      await fromPptx(pptxFile(), CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'too-many-pages' });
    expect((caught as Error).message).toBe(
      'That deck has too many slides — the checker reads up to 24. Trim it and try again.',
    );
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });

  it('maps any other ApiError to server-render-failed with the D15 copy', async () => {
    mockPostJson.mockRejectedValue(
      new ApiError('render_failed', 502, { error: 'render_failed' }),
    );

    let caught: unknown;
    try {
      await fromPptx(pptxFile(), CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'server-render-failed' });
    expect((caught as Error).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('rethrows non-ApiError rejections untouched', async () => {
    const boom = new TypeError('network down');
    mockPostJson.mockRejectedValue(boom);
    await expect(fromPptx(pptxFile(), CTX)).rejects.toBe(boom);
  });

  it('rejects a non-PPTX MIME type before uploading', async () => {
    const file = new File(['x'], 'poster.pdf', { type: 'application/pdf' });
    await expect(fromPptx(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unsupported-mime',
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('throws upload-failed when the raw upload errors', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'gateway 504' } });
    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'upload-failed',
    });
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('removes the raw path and maps a rejected upload to upload-failed', async () => {
    mockUpload.mockRejectedValue(new TypeError('network down'));

    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'upload-failed',
    });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });

  it('removes the raw upload when signing returns an error', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'signing unavailable' },
    });

    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'upload-failed',
    });
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });

  it('removes the raw upload on a rejected signing request without exposing cleanup failure', async () => {
    mockCreateSignedUrl.mockRejectedValue(new Error('signing unavailable'));
    mockRemove.mockRejectedValue(new Error('cleanup unavailable'));

    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'upload-failed',
    });
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });

  it.each([
    ['a missing pages field', {}],
    ['an empty pages array', { pages: [] }],
    [
      'more than 24 pages',
      {
        pages: Array.from({ length: 25 }, (_, index) => ({
          ...VALID_RENDERED_PAGE,
          pageNumber: index + 1,
          storagePath: `u1/review-temp/rendered/page-${index + 1}.jpg`,
        })),
      },
    ],
    ['an invalid page URL', { pages: [{ ...VALID_RENDERED_PAGE, url: 'not-a-url' }] }],
    ['a zero page number', { pages: [{ ...VALID_RENDERED_PAGE, pageNumber: 0 }] }],
    ['a fractional page number', { pages: [{ ...VALID_RENDERED_PAGE, pageNumber: 1.5 }] }],
    ['a zero width', { pages: [{ ...VALID_RENDERED_PAGE, widthPx: 0 }] }],
    ['a fractional width', { pages: [{ ...VALID_RENDERED_PAGE, widthPx: 1279.5 }] }],
    ['a zero height', { pages: [{ ...VALID_RENDERED_PAGE, heightPx: 0 }] }],
    ['a fractional height', { pages: [{ ...VALID_RENDERED_PAGE, heightPx: 719.5 }] }],
    [
      'a missing storage path',
      {
        pages: [
          {
            pageNumber: 1,
            url: 'https://signed/p1',
            widthPx: 1280,
            heightPx: 720,
          },
        ],
      },
    ],
    ['an empty storage path', { pages: [{ ...VALID_RENDERED_PAGE, storagePath: '' }] }],
    [
      "another user's storage path",
      {
        pages: [
          {
            ...VALID_RENDERED_PAGE,
            storagePath: 'other-user/review-temp/rendered/page-1.jpg',
          },
        ],
      },
    ],
    [
      'a path outside review-temp',
      {
        pages: [
          {
            ...VALID_RENDERED_PAGE,
            storagePath: 'u1/posters/rendered/page-1.jpg',
          },
        ],
      },
    ],
    [
      'an empty path segment',
      {
        pages: [
          {
            ...VALID_RENDERED_PAGE,
            storagePath: 'u1/review-temp//page-1.jpg',
          },
        ],
      },
    ],
    [
      'a dot path segment',
      {
        pages: [
          {
            ...VALID_RENDERED_PAGE,
            storagePath: 'u1/review-temp/./page-1.jpg',
          },
        ],
      },
    ],
    [
      'a dot-dot path segment',
      {
        pages: [
          {
            ...VALID_RENDERED_PAGE,
            storagePath: 'u1/review-temp/../page-1.jpg',
          },
        ],
      },
    ],
  ])('maps a successful response with %s to server-render-failed', async (_label, response) => {
    mockPostJson.mockResolvedValue(response);

    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'server-render-failed',
    });
    expect(mockRemove).toHaveBeenCalledWith([RAW_PATH]);
  });
});
