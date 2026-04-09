/**
 * Poster constants — extracted from prototype.js.
 *
 * These are the curated, opinionated defaults that drive the entire
 * editor: poster sizes, font families, color palettes, default
 * typography, table border presets, layout margins.
 *
 * Constraint as feature (PRD overview): every value here is a
 * deliberate choice — students should not need to pick from 400
 * fonts or invent a palette.
 */
import type { Palette, Styles, HeadingStyle, FontWeight } from '@postr/shared';

/** Internal coordinate scale: 1 unit = 1/10 inch. */
export const PX = 10;

/** Margin (poster units) used by all layout templates. */
export const M = 10;

/** Gap between columns / blocks (poster units). */
export const GAP = 6;

/** Snap grid (poster units) — half-inch granularity. */
export const SNAP_GRID = 5;

/** Snap threshold (poster units). */
export const SNAP_THRESHOLD = 3;

/** Visual grid spacing (SVG overlay only — does not affect snapping). */
export const VISUAL_GRID = 40;

// =========================================================================
// Poster sizes
// =========================================================================

export interface PosterSize {
  /** Width in inches */
  w: number;
  /** Height in inches */
  h: number;
  label: string;
}

export const POSTER_SIZES: Record<string, PosterSize> = {
  '48×36': { w: 48, h: 36, label: '48"×36" Landscape' },
  '36×48': { w: 36, h: 48, label: '36"×48" Portrait' },
  '42×36': { w: 42, h: 36, label: '42"×36" Landscape' },
  '36×42': { w: 36, h: 42, label: '36"×42" Portrait' },
  '42×42': { w: 42, h: 42, label: '42"×42" Square' },
  '24×36': { w: 24, h: 36, label: '24"×36" Small' },
  A0L: { w: 46.8, h: 33.1, label: 'A0 Landscape' },
  A0P: { w: 33.1, h: 46.8, label: 'A0 Portrait' },
};

export type PosterSizeKey = keyof typeof POSTER_SIZES;

export const DEFAULT_POSTER_SIZE_KEY: PosterSizeKey = '48×36';

// =========================================================================
// Fonts (10 curated families, all loaded via Google Fonts)
// =========================================================================

export interface FontFamily {
  /** CSS font-family value, including fallbacks */
  css: string;
  cat: 'sans' | 'serif';
}

export const FONTS: Record<string, FontFamily> = {
  'Source Sans 3': { css: "'Source Sans 3',sans-serif", cat: 'sans' },
  'DM Sans': { css: "'DM Sans',sans-serif", cat: 'sans' },
  'IBM Plex Sans': { css: "'IBM Plex Sans',sans-serif", cat: 'sans' },
  'Fira Sans': { css: "'Fira Sans',sans-serif", cat: 'sans' },
  'Libre Franklin': { css: "'Libre Franklin',sans-serif", cat: 'sans' },
  Outfit: { css: "'Outfit',sans-serif", cat: 'sans' },
  Charter: { css: "'Charter','Palatino',serif", cat: 'serif' },
  Literata: { css: "'Literata',serif", cat: 'serif' },
  'Source Serif 4': { css: "'Source Serif 4',serif", cat: 'serif' },
  Lora: { css: "'Lora',serif", cat: 'serif' },
};

/** All curated font names — used by the scan endpoint as the enum
 *  constraint when extracting a font from a poster image. */
export const FONT_NAMES = Object.keys(FONTS);

// =========================================================================
// Palettes (8 print-safe academic palettes)
// =========================================================================

export interface NamedPalette extends Palette {
  name: string;
}

export const PALETTES: NamedPalette[] = [
  { name: 'Classic Academic', bg: '#FFFFFF', primary: '#1a1a2e', accent: '#0f4c75', accent2: '#3282b8', muted: '#6c757d', headerBg: '#0f4c75', headerFg: '#fff' },
  { name: 'Nature / Biology', bg: '#FAFDF7', primary: '#1b3a2d', accent: '#2d6a4f', accent2: '#52b788', muted: '#5a6e5f', headerBg: '#2d6a4f', headerFg: '#fff' },
  { name: 'Medical / Clinical', bg: '#F8FAFF', primary: '#0d1b2a', accent: '#1b4965', accent2: '#62b6cb', muted: '#5c6b7a', headerBg: '#1b4965', headerFg: '#fff' },
  { name: 'Engineering', bg: '#FAFAFA', primary: '#212529', accent: '#c1121f', accent2: '#e36414', muted: '#6c757d', headerBg: '#c1121f', headerFg: '#fff' },
  { name: 'Psychology / Neuro', bg: '#FAF8FF', primary: '#1a1030', accent: '#5b3a8c', accent2: '#9b72cf', muted: '#6e6480', headerBg: '#5b3a8c', headerFg: '#fff' },
  { name: 'Humanities / Arts', bg: '#FDF8F3', primary: '#2b2118', accent: '#7b2d26', accent2: '#c07a52', muted: '#7a6b5d', headerBg: '#7b2d26', headerFg: '#fff' },
  { name: 'Earth Sciences', bg: '#F8F6F0', primary: '#2c2416', accent: '#8B6914', accent2: '#b8860b', muted: '#7a7060', headerBg: '#5c4a10', headerFg: '#fff' },
  { name: 'Clean Minimal', bg: '#FFFFFF', primary: '#111111', accent: '#333333', accent2: '#666666', muted: '#999999', headerBg: '#111111', headerFg: '#fff' },
];

// =========================================================================
// Default typography
// =========================================================================

export const DEFAULT_STYLES: Styles = {
  title: { size: 24, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
  authors: { size: 11, weight: 400, italic: false, lineHeight: 1.5, color: null, highlight: null },
  heading: { size: 13, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
  body: { size: 9, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
};

export const DEFAULT_HEADING_STYLE: HeadingStyle = {
  border: 'bottom',
  fill: false,
  align: 'left',
};

/** All allowed font weights (used by sidebar weight selector). */
export const FONT_WEIGHTS: FontWeight[] = [300, 400, 500, 600, 700, 800];

/** Highlight color presets for text/heading blocks. null = clear. */
export const HIGHLIGHT_PRESETS: (string | null)[] = [
  null,
  '#FFEB3B44',
  '#4CAF5033',
  '#2196F333',
  '#FF572233',
  '#E040FB33',
];

// =========================================================================
// Table border presets
// =========================================================================

export interface TableBorderPreset {
  name: string;
  /** Horizontal lines between body rows */
  horizontalLines: boolean;
  /** Vertical lines between columns */
  verticalLines: boolean;
  /** Outer border around the entire table */
  outerBorder: boolean;
  /** Header separator line */
  headerLine: boolean;
  /** Top border line */
  topLine: boolean;
  /** Bottom border line */
  bottomLine: boolean;
  /** Header box (encloses just the header row) */
  headerBox: boolean;
}

export const TABLE_BORDER_PRESETS: Record<string, TableBorderPreset> = {
  none: { name: 'None', horizontalLines: false, verticalLines: false, outerBorder: false, headerLine: false, topLine: false, bottomLine: false, headerBox: false },
  apa: { name: 'APA 3-Line', horizontalLines: false, verticalLines: false, outerBorder: false, headerLine: true, topLine: true, bottomLine: true, headerBox: false },
  all: { name: 'All Lines', horizontalLines: true, verticalLines: true, outerBorder: true, headerLine: true, topLine: false, bottomLine: false, headerBox: false },
  honly: { name: 'H-Lines', horizontalLines: true, verticalLines: false, outerBorder: false, headerLine: true, topLine: false, bottomLine: false, headerBox: false },
  hbox: { name: 'Header Box', horizontalLines: false, verticalLines: false, outerBorder: false, headerLine: true, topLine: false, bottomLine: false, headerBox: true },
};

export type TableBorderPresetKey = keyof typeof TABLE_BORDER_PRESETS;

// =========================================================================
// Default font family
// =========================================================================

export const DEFAULT_FONT_FAMILY = 'Source Sans 3';

/** Default palette by name (Classic Academic). */
export const DEFAULT_PALETTE: Palette = (() => {
  const p = PALETTES[0]!;
  // Strip the `name` field — Palette doesn't have it.
  const { name: _name, ...rest } = p;
  return rest;
})();
