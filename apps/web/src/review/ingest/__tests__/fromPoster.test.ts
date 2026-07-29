/**
 * fromPoster: captureReviewImage (Task 19) → single-page artifact with
 * the PosterDoc attached. The DOM capture itself is manual-verified
 * (thumbnails.test.ts header); this pins the artifact mapping + the
 * long-edge pixel math.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockCaptureReviewImage } = vi.hoisted(() => ({
  mockCaptureReviewImage: vi.fn(),
}));

vi.mock('@/data/thumbnails', () => ({
  captureReviewImage: mockCaptureReviewImage,
}));

import { fromPoster, reviewPixelDims } from '../fromPoster';

const CTX = { userId: 'u1', posterId: 'p1' };

/** Minimal PosterDoc stand-in — fromPoster only reads widthIn/heightIn
 *  and passes the doc through. */
function fakeDoc(widthIn: number, heightIn: number): PosterDoc {
  return { widthIn, heightIn } as PosterDoc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCaptureReviewImage.mockResolvedValue({
    path: 'u1/p1/review-capture.jpg',
    signedUrl: 'https://signed/review-capture',
  });
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

  it('never undershoots the 1024px short-edge audit floor for extreme aspects', () => {
    expect(reviewPixelDims({ widthIn: 60, heightIn: 20 })).toEqual({
      widthPx: 3072,
      heightPx: 1024,
    });
  });
});

describe('fromPoster', () => {
  it('normalizes the capture to a single-page artifact with the PosterDoc', async () => {
    const doc = fakeDoc(48, 36);

    const artifact = await fromPoster(doc, CTX);

    expect(mockCaptureReviewImage).toHaveBeenCalledWith('u1', 'p1');
    expect(artifact.pages).toEqual([
      {
        pageNumber: 1,
        storagePath: 'u1/p1/review-capture.jpg',
        signedUrl: 'https://signed/review-capture',
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
});
