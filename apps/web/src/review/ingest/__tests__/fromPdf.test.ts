/**
 * fromPdf: the multi-page PDF path. Deliberately lifts the single-page
 * restriction of pdfImport.ts:144-149 — the checker renders EVERY
 * page (capped at INGEST_MAX_PAGES, asserted BEFORE any page renders,
 * never silently truncated).
 *
 * pdfjs, the canvas helpers, and the upload helper are module mocks —
 * jsdom has no 2D canvas, and the house pattern covers real render
 * paths manually (see pdfImport.test.ts header).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockGetDocument,
  mockDownscale,
  mockCanvasToBlob,
  mockReleaseCanvas,
  mockUploadReviewPage,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockDownscale: vi.fn(),
  mockCanvasToBlob: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockUploadReviewPage: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mockGetDocument,
}));

vi.mock('@/import/imageImport', () => ({
  downscaleForVision: mockDownscale,
  canvasToBlob: mockCanvasToBlob,
  releaseCanvas: mockReleaseCanvas,
}));

vi.mock('../uploadReviewPage', () => ({
  uploadReviewPage: mockUploadReviewPage,
}));

import { fromPdf } from '../fromPdf';
import type { PageImage } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

interface FakePage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: ReturnType<typeof vi.fn>;
}

/** A fake pdfjs page, letter-sized by default; render resolves immediately. */
function fakePdfPage(widthPt = 612, heightPt = 792): FakePage {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: widthPt * scale,
      height: heightPt * scale,
    }),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  };
}

function fakePdfDoc(numPages: number, pages: FakePage[]) {
  return {
    numPages,
    getPage: vi.fn(async (n: number) => pages[n - 1]!),
    destroy: vi.fn(async () => {}),
  };
}

/** Fake canvas; getContext returns a 2d-ish object feeding `data` to getImageData. */
function fakeCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

const NON_BLANK = new Uint8ClampedArray([
  255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
]);
const ALL_WHITE = new Uint8ClampedArray(2 * 2 * 4).fill(255);

let canvases: HTMLCanvasElement[];
let createElementSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  canvases = [];
  const realCreateElement = document.createElement.bind(document);
  createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        const c = canvases.shift();
        if (!c) throw new Error('test ran out of fake canvases');
        return c;
      }
      return realCreateElement(tagName, options);
    }) as typeof document.createElement);
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c);
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockUploadReviewPage.mockImplementation(
    async (
      u: string,
      s: string,
      pageNumber: number,
      _b: Blob,
      dims: { widthPx: number; heightPx: number },
    ): Promise<PageImage> => ({
      pageNumber,
      storagePath: `${u}/review-temp/${s}/page-${pageNumber}.jpg`,
      signedUrl: `https://signed/page-${pageNumber}`,
      ...dims,
    }),
  );
});

afterEach(() => {
  createElementSpy.mockRestore();
});

describe('fromPdf', () => {
  it('rejects a 30-page PDF before rendering any page', async () => {
    const pages = Array.from({ length: 30 }, () => fakePdfPage());
    const doc = fakePdfDoc(30, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const file = new File(['pdf-bytes'], 'talk.pdf', { type: 'application/pdf' });

    let caught: unknown;
    try {
      await fromPdf(file, CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'too-many-pages' });
    expect((caught as Error).message).toBe(
      'That file has 30 pages — the checker reads up to 24. Trim it and try again.',
    );
    expect(doc.getPage).not.toHaveBeenCalled();
    for (const p of pages) expect(p.render).not.toHaveBeenCalled();
    expect(mockCanvasToBlob).not.toHaveBeenCalled();
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a page that renders blank', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage()]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(ALL_WHITE)];
    const file = new File(['pdf-bytes'], 'blank.pdf', { type: 'application/pdf' });

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('normalizes a 2-page PDF in reading order', async () => {
    const pages = [fakePdfPage(), fakePdfPage()];
    const doc = fakePdfDoc(2, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK), fakeCanvas(NON_BLANK)];
    const file = new File(['pdf-bytes'], 'poster.pdf', { type: 'application/pdf' });

    const artifact = await fromPdf(file, CTX);

    expect(artifact.meta).toMatchObject({
      sourceKind: 'pdf',
      filename: 'poster.pdf',
      pageCount: 2,
    });
    expect(artifact.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(artifact.pages.map((p) => p.storagePath)).toEqual([
      'u1/review-temp/sess-1/page-1.jpg',
      'u1/review-temp/sess-1/page-2.jpg',
    ]);
    expect(pages[0]!.render).toHaveBeenCalledTimes(1);
    expect(pages[1]!.render).toHaveBeenCalledTimes(1);
    expect(mockUploadReviewPage).toHaveBeenCalledTimes(2);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('renders small PDF pages at the audit resolution floor', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage(400, 300)]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK)];
    const file = new File(['pdf-bytes'], 'small.pdf', { type: 'application/pdf' });

    const artifact = await fromPdf(file, CTX);

    expect(artifact.pages[0]!.widthPx).toBeGreaterThanOrEqual(1024);
    expect(artifact.pages[0]!.heightPx).toBeGreaterThanOrEqual(1024);
    expect(artifact.pages[0]!.widthPx).toBeLessThanOrEqual(2048);
    expect(artifact.pages[0]!.heightPx).toBeLessThanOrEqual(2048);
  });

  it('maps render failures to unreadable-file and releases the page canvas', async () => {
    const page = fakePdfPage();
    page.render.mockImplementation(() => ({
      promise: Promise.reject(new Error('render failed')),
    }));
    const doc = fakePdfDoc(1, [page]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const sourceCanvas = fakeCanvas(NON_BLANK);
    canvases = [sourceCanvas];
    const file = new File(['pdf-bytes'], 'broken.pdf', { type: 'application/pdf' });

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
    expect(mockReleaseCanvas).toHaveBeenCalledWith(sourceCanvas);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('releases a padded audit canvas when drawing into it fails', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage(3000, 300)]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const sourceCanvas = fakeCanvas(NON_BLANK);
    const auditCanvas = fakeCanvas(NON_BLANK);
    auditCanvas.getContext = () => null;
    canvases = [sourceCanvas, auditCanvas];
    const file = new File(['pdf-bytes'], 'wide.pdf', { type: 'application/pdf' });

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
    expect(mockReleaseCanvas).toHaveBeenCalledWith(auditCanvas);
  });

  it('preserves a primary ingest error when PDF cleanup fails', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage()]);
    doc.destroy.mockRejectedValue(new Error('worker cleanup failed'));
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(ALL_WHITE)];
    const file = new File(['pdf-bytes'], 'blank.pdf', { type: 'application/pdf' });

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
  });
});
