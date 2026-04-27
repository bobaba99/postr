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

/**
 * Per-edge border toggles used by the "Custom" border preset.
 * Stored alongside TableData so the user's custom layout
 * persists independently of the named presets.
 *
 * Each outer edge AND each inner gap is an INDEPENDENT flag so
 * the user can toggle a single line without affecting the
 * others — matches the visual mockup where clicking any
 * specific gap should only toggle that one line.
 *
 * - `topLine` / `bottomLine` / `leftLine` / `rightLine` — the
 *   four outer edges.
 * - `headerLine` — the horizontal rule under the header row
 *   (row 0 / row 1 separator). Kept as its own flag because
 *   it's the single most common toggle and the bulk "all
 *   horizontal" preset should NOT turn it off.
 * - `innerH[i]` — horizontal rule between row `i` and row
 *   `i + 1`, for i in [1, rows - 2]. `innerH[0]` corresponds
 *   to the gap after the header row. Variable-length array so
 *   tables with 3 or 30 rows both work.
 * - `innerV[i]` — vertical rule between col `i` and col
 *   `i + 1`, for i in [0, cols - 2]. Variable-length.
 *
 * Missing / short arrays default to `true` (line ON) so adding
 * a row to an existing custom table doesn't silently drop
 * previously-visible rules. The TableEditor mockup pads/truncates
 * these to match the current `rows`/`cols` on every render.
 *
 * Named presets (APA, All Lines, etc.) still use a single
 * `outerBorder` boolean on `TableBorderPreset`; the custom
 * schema is richer.
 */
export interface CustomTableBorder {
  topLine: boolean;
  bottomLine: boolean;
  leftLine: boolean;
  rightLine: boolean;
  headerLine: boolean;
  headerBox: boolean;
  /**
   * Horizontal inner lines. `innerH[i]` is the rule below the
   * row with index `i + 1`, so index 0 = the gap below row 1
   * (under the header row in a header-bearing layout — but
   * note that the dedicated `headerLine` flag owns that gap
   * when the header row is row 0. The mockup and renderer
   * treat `innerH[0]` as the gap under row 1).
   */
  innerH: boolean[];
  /**
   * Vertical inner lines. `innerV[i]` is the rule to the
   * right of column `i`, for i in [0, cols - 2].
   */
  innerV: boolean[];
}

export interface TableData {
  rows: number;
  cols: number;
  /** Flat array, row-major: cells[row * cols + col] */
  cells: string[];
  /** Percentage widths per column, null = equal */
  colWidths: number[] | null;
  /** Key into TB_PRESETS or the literal string 'custom' */
  borderPreset: string;
  /**
   * Per-edge overrides used when `borderPreset === 'custom'`.
   * Ignored for named presets. Defaults to an APA-ish layout
   * when the user first switches to custom.
   */
  customBorder?: CustomTableBorder;
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
   * - `top` (default) — title-over-figure layout, the convention
   *   most academic poster designers reach for first
   * - `bottom` — classic figure caption placement
   * - `left` / `right` — side captions for portrait figures
   * - `none` — hide the caption + number entirely
   */
  captionPosition?: 'top' | 'bottom' | 'left' | 'right' | 'none';
  /**
   * Pixel gap between the caption and the block's content. Applied
   * as a flex `gap` on the CaptionWrapper so it works for all four
   * positions (top/bottom/left/right) with no extra math. Defaults
   * to 6 px; the editor slider clamps to 0–24.
   */
  captionGap?: number;
  /**
   * Optional footnote / note rendered below the block content for
   * figures and tables. Supports the academic-markdown dialect
   * (`**bold**`, `*italic*`, `^super^`, auto-superscript of `*†‡§¶#`
   * attached to a word) via the TableEditor / CaptionEditor Format
   * button. Stored as HTML so the renderer can pass it through
   * `dangerouslySetInnerHTML` without re-parsing on each frame.
   */
  note?: string;
  /**
   * Inline crop applied to image blocks via `clip-path: inset()`.
   * Each value is a percentage 0..50 (a 50% top crop hides the top
   * half of the image). The original `imageSrc` is preserved — undo
   * with one click by clearing this field.
   *
   * `imageFit` still controls how the cropped image fits inside the
   * block frame (contain / cover / fill).
   *
   * Ignored on non-image / non-logo blocks.
   */
  crop?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
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
