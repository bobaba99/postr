import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
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

export async function fromPdf(
  file: File,
  ingestContext: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, PDF_MIME_TYPES);

  const fileBuffer = await readFileBuffer(file);
  let pdfDocument: PDFDocumentProxy;
  try {
    pdfDocument = await pdfjs.getDocument({ data: fileBuffer }).promise;
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  try {
    assertPageCap(pdfDocument.numPages);
    const pages: PageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = viewport.width;
      sourceCanvas.height = viewport.height;
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) {
        throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
      }

      await page.render({ canvasContext: sourceContext, viewport }).promise;
      const reviewCanvas = downscaleForVision(sourceCanvas);

      try {
        const reviewContext = reviewCanvas.getContext('2d');
        if (!reviewContext) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }

        const imageData = reviewContext.getImageData(
          0,
          0,
          reviewCanvas.width,
          reviewCanvas.height,
        );
        if (isCanvasBlank(imageData)) {
          throw new IngestError(
            `Page ${pageNumber} of that PDF looks blank — the checker needs something to read. Check the file and try again.`,
            'blank-render',
          );
        }

        const dimensions = {
          widthPx: reviewCanvas.width,
          heightPx: reviewCanvas.height,
        };
        const blob = await canvasToBlob(reviewCanvas, 'image/jpeg', JPEG_QUALITY);
        if (!blob) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }

        pages.push(
          await uploadReviewPage(
            ingestContext.userId,
            ingestContext.sessionId,
            pageNumber,
            blob,
            dimensions,
          ),
        );
      } finally {
        releaseCanvas(sourceCanvas);
        if (reviewCanvas !== sourceCanvas) {
          releaseCanvas(reviewCanvas);
        }
      }
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
  } finally {
    void pdfDocument.destroy();
  }
}
