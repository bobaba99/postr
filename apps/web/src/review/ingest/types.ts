/**
 * Presentation Checker ingest contracts (spec §3).
 *
 * Every input (Postr poster / PDF / PPTX / image) normalizes to the
 * same artifact: an ordered array of uploaded page images plus an
 * optional PosterDoc (Postr-native only). Ingest failures throw
 * IngestError with a machine-readable `kind` — the UI maps kinds to
 * user-facing copy, and NO credit is ever consumed on an ingest
 * failure (Global Constraints).
 */
import type { PosterDoc, ReviewSourceKind } from '@postr/shared';

/** One uploaded, signed page image ready for the critique call. */
export interface PageImage {
  pageNumber: number; // 1-based, reading order
  storagePath: string; // poster-assets path ('' for server-owned PPTX pages)
  signedUrl: string;
  widthPx: number;
  heightPx: number;
}

export interface IngestMeta {
  sourceKind: ReviewSourceKind;
  filename?: string;
  pageCount: number;
  ingestedAt: string; // ISO 8601
}

export interface NormalizedArtifact {
  pages: PageImage[];
  posterDoc?: PosterDoc;
  meta: IngestMeta;
}

export type IngestErrorKind =
  | 'too-many-pages'
  | 'unsupported-mime'
  | 'file-too-large'
  | 'unreadable-file'
  | 'blank-render'
  | 'upload-failed'
  | 'server-render-failed';

export class IngestError extends Error {
  constructor(
    message: string,
    public readonly kind: IngestErrorKind,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/** Hard page cap (spec §1) — never silently truncate; over → typed error. */
export const INGEST_MAX_PAGES = 24;

/** Largest accepted input — the raw .pptx. Matches the server's REVIEW_PPTX_MAX_BYTES. */
export const INGEST_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export const INGEST_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Per-ingest-run context: who is uploading + which review session's
 *  review-temp/ folder the pages land in. */
export interface IngestContext {
  userId: string;
  sessionId: string;
}
