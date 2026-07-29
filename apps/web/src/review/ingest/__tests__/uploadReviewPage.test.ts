/**
 * uploadReviewPage: poster-assets upload + 600s signed URL, typed
 * IngestError on failure. Supabase is mocked (the singleton throws at
 * module load without env vars — lib/supabase.ts:14-18).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpload, mockCreateSignedUrl, mockRemove } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockRemove: vi.fn(),
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

import { uploadReviewPage } from '../uploadReviewPage';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed/page-3' },
    error: null,
  });
  mockRemove.mockResolvedValue({ error: null });
});

describe('uploadReviewPage', () => {
  it('uploads to the review-temp path and returns the signed PageImage', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });

    const page = await uploadReviewPage('u1', 'sess-1', 3, blob, {
      widthPx: 1755,
      heightPx: 2048,
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/page-3.jpg',
      blob,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/page-3.jpg',
      600,
    );
    expect(page).toEqual({
      pageNumber: 3,
      storagePath: 'u1/review-temp/sess-1/page-3.jpg',
      signedUrl: 'https://signed/page-3',
      previewUrl: expect.stringMatching(/^blob:/),
      widthPx: 1755,
      heightPx: 2048,
    });
  });

  it('throws upload-failed when the upload errors', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'gateway 504' } });
    await expect(
      uploadReviewPage('u1', 'sess-1', 1, new Blob(['x']), { widthPx: 1, heightPx: 1 }),
    ).rejects.toMatchObject({ name: 'IngestError', kind: 'upload-failed' });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('throws upload-failed when signing fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(
      uploadReviewPage('u1', 'sess-1', 1, new Blob(['x']), { widthPx: 1, heightPx: 1 }),
    ).rejects.toMatchObject({ name: 'IngestError', kind: 'upload-failed' });
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/page-1.jpg']);
  });

  it('rolls back a rejected signing request without exposing cleanup failure', async () => {
    mockCreateSignedUrl.mockRejectedValue(new Error('network down'));
    mockRemove.mockRejectedValue(new Error('cleanup down'));

    await expect(
      uploadReviewPage('u1', 'sess-1', 2, new Blob(['x']), { widthPx: 1, heightPx: 1 }),
    ).rejects.toMatchObject({ name: 'IngestError', kind: 'upload-failed' });
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/page-2.jpg']);
  });
});
