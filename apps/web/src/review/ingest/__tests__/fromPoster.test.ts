/**
 * fromPoster: captureReviewImage (Task 19) → single-page artifact with
 * the PosterDoc attached. The DOM capture itself is manual-verified
 * (thumbnails.test.ts header); this pins the artifact mapping + the
 * long-edge pixel math.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const {
  mockCaptureReviewImage,
  mockRasterizeImage,
  mockReleaseCanvas,
  mockRemoveReviewPages,
} = vi.hoisted(() => ({
  mockCaptureReviewImage: vi.fn(),
  mockRasterizeImage: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockRemoveReviewPages: vi.fn(),
}));

vi.mock('@/data/thumbnails', () => ({
  captureReviewImage: mockCaptureReviewImage,
}));

vi.mock('@/import/imageImport', () => ({
  rasterizeImage: mockRasterizeImage,
  releaseCanvas: mockReleaseCanvas,
}));

vi.mock('../uploadReviewPage', () => ({
  removeReviewPages: mockRemoveReviewPages,
}));

import { fromPoster, reviewPixelDims } from '../fromPoster';

const CTX = { userId: 'u1', posterId: 'p1' };

/** Minimal PosterDoc stand-in — fromPoster only reads widthIn/heightIn
 *  and passes the doc through. */
function fakeDoc(widthIn: number, heightIn: number): PosterDoc {
  return { widthIn, heightIn } as PosterDoc;
}

function fakeCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  return {
    width: 2,
    height: 2,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

const NON_BLANK = new Uint8ClampedArray([
  255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
]);
const ALL_WHITE = new Uint8ClampedArray(2 * 2 * 4).fill(255);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue(
    'blob:https://postr.test/poster-capture',
  );
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  mockRasterizeImage.mockResolvedValue({
    canvas: fakeCanvas(NON_BLANK),
    pageWidthPt: 1,
    pageHeightPt: 1,
  });
  mockRemoveReviewPages.mockResolvedValue(undefined);
  mockCaptureReviewImage.mockResolvedValue({
    path: 'u1/p1/review-capture.jpg',
    signedUrl: 'https://signed/review-capture',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reviewPixelDims', () => {
  it('lands the long edge at 2048px for landscape posters', () => {
    expect(reviewPixelDims({ widthIn: 48, heightIn: 36 })).toEqual({
      widthPx: 2048,
      heightPx: 1536,
    });
  });

  it('lands the long edge at 2048px for portrait posters', () => {
    expect(reviewPixelDims({ widthIn: 36, heightIn: 48 })).toEqual({
      widthPx: 1536,
      heightPx: 2048,
    });
  });

  it('handles square posters', () => {
    expect(reviewPixelDims({ widthIn: 40, heightIn: 40 })).toEqual({
      widthPx: 2048,
      heightPx: 2048,
    });
  });
});

describe('fromPoster', () => {
  it('normalizes the capture to a single-page artifact with the PosterDoc', async () => {
    const doc = fakeDoc(48, 36);

    const artifact = await fromPoster(doc, CTX);

    expect(mockCaptureReviewImage).toHaveBeenCalledWith('u1', 'p1');
    expect(mockRasterizeImage).toHaveBeenCalledWith(expect.any(File), {
      maxDimension: 2048,
      maxSourcePixels: 40_000_000,
    });
    expect(mockReleaseCanvas).toHaveBeenCalledTimes(1);
    expect(artifact.pages).toEqual([
      {
        pageNumber: 1,
        storagePath: 'u1/p1/review-capture.jpg',
        signedUrl: 'https://signed/review-capture',
        previewUrl: expect.stringMatching(/^blob:/),
        widthPx: 2048,
        heightPx: 1536,
      },
    ]);
    expect(artifact.posterDoc).toBe(doc);
    expect(artifact.meta).toMatchObject({ sourceKind: 'postr', pageCount: 1 });
    expect(typeof artifact.meta.ingestedAt).toBe('string');
  });

  it('throws unreadable-file when the capture fails', async () => {
    mockCaptureReviewImage.mockResolvedValue(null);
    await expect(fromPoster(fakeDoc(48, 36), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
  });

  it('rejects a blank capture and removes its uploaded image and local preview', async () => {
    const canvas = fakeCanvas(ALL_WHITE);
    mockRasterizeImage.mockResolvedValue({
      canvas,
      pageWidthPt: 1,
      pageHeightPt: 1,
    });

    let caught: unknown;
    try {
      await fromPoster(fakeDoc(48, 36), CTX);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect((caught as Error).message).toMatch(/poster.*blank/i);
    expect(mockReleaseCanvas).toHaveBeenCalledWith(canvas);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:https://postr.test/poster-capture',
    );
    expect(mockRemoveReviewPages).toHaveBeenCalledWith([
      'u1/p1/review-capture.jpg',
    ]);
  });

  it('maps a malformed capture to unreadable-file and removes its artifacts', async () => {
    mockRasterizeImage.mockRejectedValue(new Error('decode failed'));

    let caught: unknown;
    try {
      await fromPoster(fakeDoc(48, 36), CTX);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
    expect((caught as Error).message).toMatch(/couldn't capture the poster/i);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:https://postr.test/poster-capture',
    );
    expect(mockRemoveReviewPages).toHaveBeenCalledWith([
      'u1/p1/review-capture.jpg',
    ]);
  });
});
