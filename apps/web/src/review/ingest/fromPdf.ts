/**
 * PDF ingest (spec §3): pdf.js renders EVERY page to a canvas at
 * scale 2 → downscale to the vision ceiling → blank check → JPEG →
 * upload. Client-side, zero backend.
 *
 * This layer deliberately lifts the single-page restriction of the
 * Tier-0 poster import (pdfImport.ts:144-149 rejects numPages > 1):
 * a talk PDF is SUPPOSED to be multi-page, and the checker accepts up
 * to INGEST_MAX_PAGES. It does NOT reuse extractFromPdf — that path
 * clusters a text layer into PosterDoc blocks; the checker only needs
 * page images. The page cap is asserted from pdf.numPages BEFORE any
 * page renders (never silently truncate, spec §1).
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the `?url` import shape is provided by Vite at build time.
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
import { removeReviewPages, uploadReviewPage } from './uploadReviewPage';

// pdfjs needs a worker URL. Vite resolves this with `?url`; the vitest
// alias maps it to a stub (vite.config.ts test.alias). Same setup as
// pdfImport.ts:49-56 — harmless if that module already set it.
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

const RENDER_SCALE = 2; // same rasterize idiom as imageImport.ts:623-631
const JPEG_QUALITY = 0.85;
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

export async function fromPdf(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, ['application/pdf']);

  const buf = await file.arrayBuffer();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  const pages: PageImage[] = [];
  try {
    // Page cap BEFORE rendering a single page.
    assertPageCap(pdf.numPages);

    for (let n = 1; n <= pdf.numPages; n++) {
      let canvas: HTMLCanvasElement | undefined;
      let scaled: HTMLCanvasElement | undefined;
      try {
        // Allocate before page work so every get/render/downscale exit
        // crosses the same release boundary.
        canvas = document.createElement('canvas');
        const pdfPage = await pdf.getPage(n);
        const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderCtx = canvas.getContext('2d');
        if (!renderCtx) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }
        await pdfPage.render({ canvasContext: renderCtx, viewport }).promise;

        scaled = downscaleForVision(canvas);
        const scaledCtx = scaled.getContext('2d');
        if (!scaledCtx) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }
        if (isCanvasBlank(scaledCtx.getImageData(0, 0, scaled.width, scaled.height))) {
          throw new IngestError(
            `Page ${n} of that PDF looks blank — the checker needs something to read. Check the file and try again.`,
            'blank-render',
          );
        }

        const dims = { widthPx: scaled.width, heightPx: scaled.height };
        const blob = await canvasToBlob(scaled, 'image/jpeg', JPEG_QUALITY);
        if (!blob) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }

        pages.push(await uploadReviewPage(ctx.userId, ctx.sessionId, n, blob, dims));
      } catch (err) {
        if (err instanceof IngestError) throw err;
        throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
      } finally {
        if (canvas) releaseCanvas(canvas);
        if (scaled && scaled !== canvas) releaseCanvas(scaled);
      }
    }

    return {
      pages,
      meta: {
        sourceKind: 'pdf',
        filename: file.name,
        pageCount: pdf.numPages,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (pages.length > 0) {
      await removeReviewPages(pages.map((page) => page.storagePath)).catch(() => undefined);
    }
    throw err;
  } finally {
    // Always release the worker-side document — otherwise each ingest
    // leaks its transport + page buffers until the tab reloads.
    try {
      await pdf.destroy();
    } catch {
      // Teardown is best-effort and must not replace the ingest result.
    }
  }
}
