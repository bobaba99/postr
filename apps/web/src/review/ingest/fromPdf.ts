import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite provides the `?url` import shape at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  canvasToBlob,
  downscaleForVision,
  releaseCanvas,
} from '@/import/imageImport';
import { assertFileAllowed, assertPageCap, isCanvasBlank } from './guards';
import {
  IngestError,
  type IngestContext,
  type NormalizedArtifact,
  type PageImage,
} from './types';
import { uploadReviewPage } from './uploadReviewPage';

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

const PDF_MIME_TYPES = ['application/pdf'] as const;
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.85;
const MIN_AUDIT_DIMENSION_PX = 1024;
const MAX_AUDIT_DIMENSION_PX = 2048;
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('FileReader returned a non-binary result.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function calculateRenderScale(widthPt: number, heightPt: number): number {
  const shortEdge = Math.min(widthPt, heightPt);
  const longEdge = Math.max(widthPt, heightPt);
  return Math.min(
    MAX_AUDIT_DIMENSION_PX / longEdge,
    Math.max(RENDER_SCALE, MIN_AUDIT_DIMENSION_PX / shortEdge),
  );
}

function ensureAuditDimensions(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  if (Math.min(sourceCanvas.width, sourceCanvas.height) >= MIN_AUDIT_DIMENSION_PX) {
    return sourceCanvas;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(MIN_AUDIT_DIMENSION_PX, sourceCanvas.width);
  outputCanvas.height = Math.max(MIN_AUDIT_DIMENSION_PX, sourceCanvas.height);
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(
    sourceCanvas,
    Math.round((outputCanvas.width - sourceCanvas.width) / 2),
    Math.round((outputCanvas.height - sourceCanvas.height) / 2),
  );
  return outputCanvas;
}

async function normalizePdfPage(
  page: PDFPageProxy,
  pageNumber: number,
  ingestContext: IngestContext,
): Promise<PageImage> {
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: calculateRenderScale(baseViewport.width, baseViewport.height),
  });
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.ceil(viewport.width);
  sourceCanvas.height = Math.ceil(viewport.height);
  let cappedCanvas = sourceCanvas;
  let reviewCanvas = sourceCanvas;

  try {
    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    await page.render({ canvasContext: sourceContext, viewport }).promise;
    cappedCanvas = downscaleForVision(sourceCanvas);
    reviewCanvas = cappedCanvas;

    const reviewContext = cappedCanvas.getContext('2d');
    if (!reviewContext) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    const imageData = reviewContext.getImageData(
      0,
      0,
      cappedCanvas.width,
      cappedCanvas.height,
    );
    if (isCanvasBlank(imageData)) {
      throw new IngestError(
        `Page ${pageNumber} of that PDF looks blank — the checker needs something to read. Check the file and try again.`,
        'blank-render',
      );
    }

    reviewCanvas = ensureAuditDimensions(cappedCanvas);
    const blob = await canvasToBlob(reviewCanvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    return uploadReviewPage(
      ingestContext.userId,
      ingestContext.sessionId,
      pageNumber,
      blob,
      { widthPx: reviewCanvas.width, heightPx: reviewCanvas.height },
    );
  } finally {
    releaseCanvas(sourceCanvas);
    if (cappedCanvas !== sourceCanvas) {
      releaseCanvas(cappedCanvas);
    }
    if (reviewCanvas !== sourceCanvas && reviewCanvas !== cappedCanvas) {
      releaseCanvas(reviewCanvas);
    }
  }
}

export async function fromPdf(
  file: File,
  ingestContext: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, PDF_MIME_TYPES);

  let pdfDocument: PDFDocumentProxy;
  try {
    const fileBuffer = await readFileBuffer(file);
    pdfDocument = await pdfjs.getDocument({ data: fileBuffer }).promise;
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  try {
    assertPageCap(pdfDocument.numPages);
    const pages: PageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      pages.push(await normalizePdfPage(page, pageNumber, ingestContext));
    }

    return {
      pages,
      meta: {
        sourceKind: 'pdf',
        filename: file.name,
        pageCount: pdfDocument.numPages,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof IngestError) {
      throw error;
    }
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  } finally {
    try {
      await pdfDocument.destroy();
    } catch {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
  }
}
