/**
 * Import pipeline types — shared between the client `import/` modules
 * and the (future Tier 1) backend `/api/import/extract` endpoint.
 *
 * `ExtractedBlock` is the wire format the LLM tool-use response
 * produces. `ImportResult` is the in-memory shape the client modules
 * pass to `synthesizeDoc()` to build a real PosterDoc.
 */
import type { Block, Palette } from './poster';

/** Page-pt bounding box (PDF user space). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A block as returned by the vision LLM (no id assigned yet). */
export interface ExtractedBlock {
  type: 'title' | 'heading' | 'authors' | 'text' | 'table';
  text: string;
  bbox: BBox;
  fontSizePt?: number;
  /** 0–1 confidence score (LLM self-reported). Tier 0 deterministic
   *  paths emit 1.0 across the board. */
  confidence: number;
}

/** Block-shaped data ready for client-side post-processing.
 *  `id` is assigned by the synthesizer, not the extractor. */
export type PartialBlock = Omit<Block, 'id'>;

/**
 * Wire-format response from `/api/import/extract` (Tier 1).
 * Figure pixel data is NOT in the response — the client crops figures
 * from its own rasterized canvas using `figureBBoxes`.
 */
export interface ExtractResponse {
  blocks: ExtractedBlock[];
  figureBBoxes: BBox[];
  detectedPalette?: Palette;
  warnings: string[];
}

/**
 * Final in-memory shape consumed by `synthesizeDoc()`. Both the PDF
 * and image extractors converge on this.
 */
export interface ImportResult {
  /** Pre-id blocks ready for the synthesizer to assign ids and snap. */
  blocks: PartialBlock[];
  /** Page width in inches (for sizing the poster doc). */
  pageWidthIn: number;
  /** Page height in inches. */
  pageHeightIn: number;
  detectedPalette?: Palette;
  /** User-facing warning strings shown in the preview modal. */
  warnings: string[];
  /** Source font names encountered (informational only — never applied). */
  sourceFonts?: string[];
}

/**
 * Progress events emitted by every extractor. The modal renders an
 * animated step list driven by `stage`; `ratio` (0–1) is only set
 * for the figure-upload step where a real percentage exists.
 */
export type ImportProgressStage =
  | 'reading'
  | 'clustering'
  | 'uploading-figures'
  | 'llm-call'
  | 'building-preview'
  | 'ready'
  | 'error';

export interface ImportProgress {
  stage: ImportProgressStage;
  ratio?: number;
  detail?: string;
}

export type ImportProgressCallback = (p: ImportProgress) => void;

/**
 * `.postr` bundle manifest — schema version + integrity hash. Bumped
 * whenever the bundle structure changes in a non-backward-compatible
 * way.
 */
export interface PostrBundleManifest {
  schemaVersion: 1;
  app: 'postr';
  appVersion: string;
  exportedAt: string;
  /** sha256 of the canonicalized PosterDoc JSON. */
  hash: string;
}

/** imageSrc prefix used inside a `.postr` bundle so the JSON is
 *  decoupled from any specific Storage path. Rewritten back to
 *  `storage://` on import. */
export const BUNDLE_PREFIX = 'bundle://';
