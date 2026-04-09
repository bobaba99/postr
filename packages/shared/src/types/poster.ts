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
