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
  mockRemoveReviewPages,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockDownscale: vi.fn(),
  mockCanvasToBlob: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockUploadReviewPage: vi.fn(),
  mockRemoveReviewPages: vi.fn(),
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
  removeReviewPages: mockRemoveReviewPages,
}));

import { fromPdf } from '../fromPdf';
import type { PageImage } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

/** jsdom's File omits the standards-based arrayBuffer() method. */
function pdfFile(name: string): File {
  return Object.assign(new File(['pdf-bytes'], name, { type: 'application/pdf' }), {
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  });
}

interface FakePage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: ReturnType<typeof vi.fn>;
}

/** A fake pdfjs page: 612×792pt (letter) at scale 1; render resolves immediately. */
function fakePdfPage(): FakePage {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 612 * scale,
      height: 792 * scale,
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
  // fromPdf creates its render targets via document.createElement —
  // hand out the fake canvases in page order.
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
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c); // identity
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockRemoveReviewPages.mockResolvedValue(undefined);
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
    const file = pdfFile('talk.pdf');

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
    const file = pdfFile('blank.pdf');

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('removes already-uploaded pages when a later page fails', async () => {
    const pages = [fakePdfPage(), fakePdfPage()];
    const doc = fakePdfDoc(2, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK), fakeCanvas(ALL_WHITE)];

    await expect(fromPdf(pdfFile('partial.pdf'), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });

    expect(mockUploadReviewPage).toHaveBeenCalledTimes(1);
    expect(mockRemoveReviewPages).toHaveBeenCalledWith([
      'u1/review-temp/sess-1/page-1.jpg',
    ]);
  });

  it('maps a render failure to unreadable-file and releases its canvas', async () => {
    const page = fakePdfPage();
    page.render.mockReturnValue({ promise: Promise.reject(new Error('render failed')) });
    const doc = fakePdfDoc(1, [page]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const canvas = fakeCanvas(NON_BLANK);
    canvases = [canvas];

    await expect(fromPdf(pdfFile('broken.pdf'), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });

    expect(mockReleaseCanvas).toHaveBeenCalledWith(canvas);
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(mockRemoveReviewPages).not.toHaveBeenCalled();
  });

  it('does not settle until pdf.destroy completes', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage()]);
    let resolveDestroy!: () => void;
    doc.destroy.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDestroy = resolve;
      }),
    );
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK)];

    const pending = fromPdf(pdfFile('await-destroy.pdf'), CTX);
    await vi.waitFor(() => expect(doc.destroy).toHaveBeenCalledTimes(1));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDestroy();
    await expect(pending).resolves.toMatchObject({
      meta: { sourceKind: 'pdf', pageCount: 1 },
    });
  });

  it('does not let a destroy rejection replace a successful ingest', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage()]);
    doc.destroy.mockRejectedValue(new Error('destroy failed'));
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK)];

    await expect(fromPdf(pdfFile('destroy-fails.pdf'), CTX)).resolves.toMatchObject({
      meta: { sourceKind: 'pdf', pageCount: 1 },
    });
  });

  it('normalizes a 2-page PDF in reading order', async () => {
    const pages = [fakePdfPage(), fakePdfPage()];
    const doc = fakePdfDoc(2, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK), fakeCanvas(NON_BLANK)];
    const file = pdfFile('poster.pdf');

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
});
