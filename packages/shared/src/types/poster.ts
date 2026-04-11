/**
 * Core poster data model. Mirrors PRD §Data Model.
 *
 * A `PosterDoc` is the full self-contained snapshot persisted in
 * `posters.data` (jsonb). Asset binaries live in Supabase Storage;
 * only storage paths (not base64) are stored here once Phase 5 ships.
 */

export type BlockType =
  | 'title'
  | 'authors'
  | 'heading'
  | 'text'
  | 'image'
  | 'logo'
  | 'table'
  | 'references';

export type ImageFit = 'contain' | 'cover' | 'fill';

export interface TableData {
  rows: number;
  cols: number;
  /** Flat array, row-major: cells[row * cols + col] */
  cells: string[];
  /** Percentage widths per column, null = equal */
  colWidths: number[] | null;
  /** Key into TB_PRESETS */
  borderPreset: string;
}

export interface Block {
  id: string;
  type: BlockType;
  /** Left position in poster coordinate units (1 unit = 1/10 inch) */
  x: number;
  y: number;
  w: number;
  /** Height (ignored for headings — auto-sized) */
  h: number;
  /** Text content (title, heading, text) */
  content: string;
  /** Storage path (post Phase 5) or base64 data URL (during prototype port) */
  imageSrc: string | null;
  imageFit: ImageFit;
  tableData: TableData | null;
  /**
   * Rotation in degrees, clockwise, around the block's center.
   * Optional — undefined or 0 means axis-aligned (the default for
   * every block created before this field existed). Applied as a
   * CSS `transform: rotate()` on the BlockFrame and does NOT change
   * the block's (x, y, w, h) bounding box in poster coordinates.
   * Resize handles transform the screen-space pointer delta into
   * the block's local rotated frame so drag math stays intuitive.
   */
  rotation?: number;
  /**
   * Caption/title text shown alongside image and table blocks. The
   * number prefix ("Figure 1.", "Table 2.") is auto-computed from
   * reading order (top-to-bottom, left-to-right) and prepended at
   * render time, so the user only stores the descriptive text.
   * Empty string / undefined = no caption rendered.
   */
  caption?: string;
  /**
   * Where the caption renders relative to the block frame.
   * - `bottom` (default) — classic figure caption placement
   * - `top` — placement above the block
   * - `left` / `right` — side captions for portrait figures
   * - `none` — hide the caption + number entirely
   */
  captionPosition?: 'top' | 'bottom' | 'left' | 'right' | 'none';
}

export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800;

export interface TypeStyle {
  /** Font size in poster coordinate units */
  size: number;
  weight: FontWeight;
  italic: boolean;
  /** CSS line-height multiplier (1.0–3.0) */
  lineHeight: number;
  /** Hex color override, null = use palette */
  color: string | null;
  /** Background highlight color, null = none */
  highlight: string | null;
}

export type StyleLevel = 'title' | 'heading' | 'authors' | 'body';

export type Styles = Record<StyleLevel, TypeStyle>;

export interface Palette {
  bg: string;
  primary: string;
  accent: string;
  accent2: string;
  muted: string;
  headerBg: string;
  headerFg: string;
}

export type HeadingBorder = 'none' | 'bottom' | 'left' | 'box' | 'thick';
export type HeadingAlign = 'left' | 'center';

export interface HeadingStyle {
  border: HeadingBorder;
  fill: boolean;
  align: HeadingAlign;
}

export interface Institution {
  id: string;
  name: string;
  dept?: string;
  location?: string;
}

export interface Author {
  id: string;
  name: string;
  /** References to Institution.id values (multi-affiliation supported) */
  affiliationIds: string[];
  isCorresponding: boolean;
  equalContrib: boolean;
}

export interface Reference {
  id: string;
  authors: string[];
  year?: string;
  title?: string;
  journal?: string;
  doi?: string;
  /**
   * Pre-formatted citation string — set when the user pasted a
   * fully-formatted reference block from a manuscript. When this
   * is present, citation formatters render it verbatim instead of
   * composing fields, so the user's existing APA / Vancouver /
   * custom format stays intact.
   */
  rawText?: string;
}

/** Snapshot persisted in `posters.data` — self-contained. */
export interface PosterDoc {
  /** Document schema version — bump on breaking changes */
  version: 1;
  widthIn: number;
  heightIn: number;
  blocks: Block[];
  fontFamily: string;
  palette: Palette;
  styles: Styles;
  headingStyle: HeadingStyle;
  institutions: Institution[];
  authors: Author[];
  references: Reference[];
}
