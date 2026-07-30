/**
 * PDF ingest (spec §3): pdf.js renders EVERY page at the audit
 * resolution (short edge ≥ 1024px, long edge ≤ 2048px) → vision-ceiling
 * cap → blank check → white-pad up to the floor → JPEG → upload.
 * Client-side, zero backend.
 *
 * This layer deliberately lifts the single-page restriction of the
 * Tier-0 poster import (pdfImport.ts:144-149 rejects numPages > 1):
 * a talk PDF is SUPPOSED to be multi-page, and the checker accepts up
 * to INGEST_MAX_PAGES. It does NOT reuse extractFromPdf — that path
 * clusters a text layer into PosterDoc blocks; the checker only needs
 * page images. The page cap is asserted from pdf.numPages BEFORE any
 * page renders (never silently truncate, spec §1).
 *
 * Partial-failure hygiene: pages upload as they render, so when page N
 * fails, pages 1..N-1 are already in the bucket. Those orphans are
 * removed (best-effort, after pdf.destroy) before the PRIMARY error
 * rethrows — a failed ingest must not strand temp objects nor let
 * cleanup failures clobber the error the user needs to see.
 */
import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the `?url` import shape is provided by Vite at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  canvasToBlob,
  downscaleForVision,
  releaseCanvas,
} from '@/import/imageImport';
import { supabase } from '@/lib/supabase';
import { assertFileAllowed, assertPageCap, isCanvasBlank } from './guards';
import {
  IngestError,
  type IngestContext,
  type NormalizedArtifact,
  type PageImage,
} from './types';
import { uploadReviewPage } from './uploadReviewPage';

// pdfjs needs a worker URL. Vite resolves this with `?url`; the vitest
// alias maps it to a stub (vite.config.ts test.alias). Same setup as
// pdfImport.ts:49-56 — harmless if that module already set it.
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

const PDF_MIME_TYPES = ['application/pdf'] as const;
const BUCKET = 'poster-assets';
const RENDER_SCALE = 2; // same rasterize idiom as imageImport.ts:623-631
const JPEG_QUALITY = 0.85;
const MIN_AUDIT_DIMENSION_PX = 1024; // spec audit floor on both axes
const MAX_AUDIT_DIMENSION_PX = 2048; // matches the vision ceiling (downscaleForVision)
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

/**
 * Render scale for one page: at least the legacy 2× rasterize, enough
 * to lift the short edge to the 1024px audit floor, never past the
 * 2048px long-edge ceiling.
 */
function calculateRenderScale(widthPt: number, heightPt: number): number {
  const shortEdge = Math.min(widthPt, heightPt);
  const longEdge = Math.max(widthPt, heightPt);
  return Math.min(
    MAX_AUDIT_DIMENSION_PX / longEdge,
    Math.max(RENDER_SCALE, MIN_AUDIT_DIMENSION_PX / shortEdge),
  );
}

/**
 * White-pad a rendered page up to the audit floor. The render scale
 * already lands the long edge ≤ 2048, so this only ever PADS the short
 * edge (centered on white, matching the PDF's own page background) —
 * it never scales. Returns the source canvas unchanged when the floor
 * is already met.
 */
function ensureAuditDimensions(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  if (Math.min(sourceCanvas.width, sourceCanvas.height) >= MIN_AUDIT_DIMENSION_PX) {
    return sourceCanvas;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(MIN_AUDIT_DIMENSION_PX, sourceCanvas.width);
  outputCanvas.height = Math.max(MIN_AUDIT_DIMENSION_PX, sourceCanvas.height);
  try {
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
  } catch (error) {
    releaseCanvas(outputCanvas);
    throw error;
  }
}

/** Render → cap → blank check → floor-pad → JPEG → upload, one page. */
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

/** Best-effort delete of already-uploaded pages after a later page
 *  fails — failures here must never clobber the primary error. */
async function removeUploadedPages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) {
    return;
  }

  try {
    const { error } = await supabase.storage.from(BUCKET).remove(storagePaths);
    if (error) {
      console.error('Failed to remove partially ingested PDF pages:', error);
    }
  } catch (error) {
    console.error('Failed to remove partially ingested PDF pages:', error);
  }
}

export async function fromPdf(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, PDF_MIME_TYPES);

  const buf = await file.arrayBuffer();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  let artifact: NormalizedArtifact | undefined;
  let ingestError: IngestError | undefined;
  const uploadedStoragePaths: string[] = [];
  try {
    // Page cap BEFORE rendering a single page.
    assertPageCap(pdf.numPages);
    const pages: PageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const normalizedPage = await normalizePdfPage(page, pageNumber, ctx);
      pages.push(normalizedPage);
      uploadedStoragePaths.push(normalizedPage.storagePath);
    }

    artifact = {
      pages,
      meta: {
        sourceKind: 'pdf',
        filename: file.name,
        pageCount: pdf.numPages,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    ingestError =
      error instanceof IngestError
        ? error
        : new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  try {
    // Always release the worker-side document — otherwise each ingest
    // leaks its transport + page buffers until the tab reloads.
    await pdf.destroy();
  } catch (error) {
    if (artifact) {
      // destroy is hygiene, not ingest failure: a worker-cleanup hiccup
      // must not discard a fully built artifact (or its uploaded pages)
      // behind a "couldn't read that file" error.
      console.warn('PDF worker cleanup failed after a successful ingest:', error);
    } else {
      // Fail-closed on the primary-error path: with no artifact, a
      // destroy failure only fills an error-less hole — it never
      // clobbers the primary ingest error.
      ingestError ??= new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
  }

  if (ingestError || !artifact) {
    await removeUploadedPages(uploadedStoragePaths);
    throw ingestError ?? new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }
  return artifact;
}
