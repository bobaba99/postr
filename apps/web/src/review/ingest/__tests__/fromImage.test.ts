/**
 * fromImage: validate → rasterize → downscale → blank check → upload.
 * Canvas + storage seams are module mocks (jsdom has no 2D canvas);
 * the guards themselves are covered in guards.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRasterizeImage,
  mockDownscale,
  mockCanvasToBlob,
  mockReleaseCanvas,
  mockUploadReviewPage,
} = vi.hoisted(() => ({
  mockRasterizeImage: vi.fn(),
  mockDownscale: vi.fn(),
  mockCanvasToBlob: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockUploadReviewPage: vi.fn(),
}));

vi.mock('@/import/imageImport', () => ({
  rasterizeImage: mockRasterizeImage,
  downscaleForVision: mockDownscale,
  canvasToBlob: mockCanvasToBlob,
  releaseCanvas: mockReleaseCanvas,
}));

vi.mock('../uploadReviewPage', () => ({
  uploadReviewPage: mockUploadReviewPage,
}));

import { fromImage } from '../fromImage';
import { IngestError, type PageImage } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

/** Fake canvas feeding `data` to getImageData — plain object, since
 *  jsdom's HTMLCanvasElement has no working 2D context. */
function fakeCanvas(data: Uint8ClampedArray, widthPx = 100, heightPx = 50): HTMLCanvasElement {
  return {
    width: widthPx,
    height: heightPx,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

const NON_BLANK = new Uint8ClampedArray([
  255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
]); // 2×2, one dark pixel
const ALL_WHITE = new Uint8ClampedArray(2 * 2 * 4).fill(255);

function uploadedPage(pageNumber: number): PageImage {
  return {
    pageNumber,
    storagePath: `u1/review-temp/sess-1/page-${pageNumber}.jpg`,
    signedUrl: `https://signed/page-${pageNumber}`,
    widthPx: 100,
    heightPx: 50,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c); // identity
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockUploadReviewPage.mockImplementation(
    async (_u: string, _s: string, pageNumber: number) => uploadedPage(pageNumber),
  );
});

describe('fromImage', () => {
  it('normalizes a PNG to a single-page artifact', async () => {
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(NON_BLANK),
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    const file = new File(['png-bytes'], 'poster.png', { type: 'image/png' });

    const artifact = await fromImage(file, CTX);

    expect(artifact.pages).toEqual([uploadedPage(1)]);
    expect(artifact.posterDoc).toBeUndefined();
    expect(artifact.meta).toMatchObject({
      sourceKind: 'image',
      filename: 'poster.png',
      pageCount: 1,
    });
    expect(typeof artifact.meta.ingestedAt).toBe('string');
    expect(mockRasterizeImage).toHaveBeenCalledWith(file, {
      maxDimension: 2048,
      maxSourcePixels: 40_000_000,
    });
    expect(mockUploadReviewPage).toHaveBeenCalledWith(
      'u1',
      'sess-1',
      1,
      expect.any(Blob),
      { widthPx: 100, heightPx: 50 },
    );
  });

  it('rejects a non-image MIME type before reading bytes', async () => {
    const file = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unsupported-mime',
    });
    expect(mockRasterizeImage).not.toHaveBeenCalled();
  });

  it('maps a corrupt image to unreadable-file with the D15 copy', async () => {
    mockRasterizeImage.mockRejectedValue(new Error('Image has no dimensions'));
    const file = new File(['garbage'], 'broken.png', { type: 'image/png' });

    let caught: unknown;
    try {
      await fromImage(file, CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('unreadable-file');
    expect((caught as IngestError).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('rejects a blank render without uploading', async () => {
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(ALL_WHITE),
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    const file = new File(['png-bytes'], 'blank.png', { type: 'image/png' });

    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
  });
});
