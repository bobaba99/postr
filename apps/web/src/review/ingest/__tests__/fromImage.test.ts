/**
 * fromImage: validate → rasterize → downscale → blank check → upload.
 * Canvas + storage seams are module mocks (jsdom has no 2D canvas);
 * the guards themselves are covered in guards.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      fillRect: vi.fn(),
      drawImage: vi.fn(),
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

let createElementSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  const realCreateElement = document.createElement.bind(document);
  createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return fakeCanvas(NON_BLANK, 0, 0);
      }
      return realCreateElement(tagName, options);
    }) as typeof document.createElement);
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c);
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockUploadReviewPage.mockImplementation(
    async (_u: string, _s: string, pageNumber: number) => uploadedPage(pageNumber),
  );
});

afterEach(() => {
  createElementSpy.mockRestore();
});

describe('fromImage', () => {
  it('normalizes and upscales a PNG to the audit resolution floor', async () => {
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
    expect(mockUploadReviewPage).toHaveBeenCalledWith(
      'u1',
      'sess-1',
      1,
      expect.any(Blob),
      { widthPx: 2048, heightPx: 1024 },
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

  it('enforces the 2048px ceiling when the shared downscale falls back', async () => {
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(NON_BLANK, 4000, 3000),
      pageWidthPt: 960,
      pageHeightPt: 720,
    });
    const file = new File(['png-bytes'], 'oversized.png', { type: 'image/png' });

    await fromImage(file, CTX);

    expect(mockUploadReviewPage).toHaveBeenCalledWith(
      'u1',
      'sess-1',
      1,
      expect.any(Blob),
      { widthPx: 2048, heightPx: 1536 },
    );
  });

  it('maps scaling failures to unreadable-file and releases the source canvas', async () => {
    const sourceCanvas = fakeCanvas(NON_BLANK);
    mockRasterizeImage.mockResolvedValue({
      canvas: sourceCanvas,
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    mockDownscale.mockImplementation(() => {
      throw new Error('canvas allocation failed');
    });
    const file = new File(['png-bytes'], 'poster.png', { type: 'image/png' });

    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
    expect(mockReleaseCanvas).toHaveBeenCalledWith(sourceCanvas);
  });

  it('releases an audit canvas when drawing into it fails', async () => {
    const auditCanvas = fakeCanvas(NON_BLANK, 0, 0);
    auditCanvas.getContext = () => null;
    createElementSpy.mockReturnValueOnce(auditCanvas);
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(NON_BLANK),
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    const file = new File(['png-bytes'], 'poster.png', { type: 'image/png' });

    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
    expect(mockReleaseCanvas).toHaveBeenCalledWith(auditCanvas);
  });
});
