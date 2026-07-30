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
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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
  it('round-trips the raw file and normalizes the rendered pages', async () => {
    mockPostJson.mockResolvedValue({
      pages: [
        { pageNumber: 1, url: 'https://signed/p1', widthPx: 1280, heightPx: 720 },
        { pageNumber: 2, url: 'https://signed/p2', widthPx: 1280, heightPx: 720 },
      ],
    });

    const artifact = await fromPptx(pptxFile(), CTX);

    expect(mockUpload).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/source.pptx',
      expect.any(File),
      { contentType: PPTX_MIME, upsert: true },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/source.pptx',
      600,
    );
    expect(mockPostJson).toHaveBeenCalledWith(
      '/api/review/render-pptx',
      { fileUrl: 'https://signed/raw-pptx' },
      { auth: true },
    );
    expect(artifact.pages).toEqual([
      { pageNumber: 1, storagePath: '', signedUrl: 'https://signed/p1', widthPx: 1280, heightPx: 720 },
      { pageNumber: 2, storagePath: '', signedUrl: 'https://signed/p2', widthPx: 1280, heightPx: 720 },
    ]);
    expect(artifact.meta).toMatchObject({
      sourceKind: 'pptx',
      filename: 'deck.pptx',
      pageCount: 2,
    });
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/source.pptx']);
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
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/source.pptx']);
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
});
