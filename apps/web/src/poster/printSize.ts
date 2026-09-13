/**
 * Printed figure size — the pure half of the public figure-readability
 * page's size inputs (pages/FigureReadability.tsx → PrintSizeFields).
 *
 * The editor's Check tab sizes against a draggable overlay on the
 * canvas; the public page has no canvas, so the user types the size the
 * figure will fill on the printed poster. Everything about parsing,
 * clamping and the preset chips lives here so the component stays a
 * thin controlled input and the numbers are testable without the DOM.
 */
import { POSTER_SIZES } from './constants';

export interface PrintSize {
  /** Width in inches. */
  readonly w: number;
  /** Height in inches. */
  readonly h: number;
}

export interface PrintSizePreset extends PrintSize {
  readonly id: string;
  readonly label: string;
}

/** Below an inch the check is meaningless; above 96" nothing prints. */
export const PRINT_SIZE_MIN_IN = 1;
export const PRINT_SIZE_MAX_IN = 96;

/**
 * Must equal the ReadabilityPanel defaults (`defaultFigureWidthIn = 10`,
 * `defaultFigureHeightIn = 7`) so the public page and the editor agree
 * on what "no size chosen yet" means. Pinned by printSize.test.ts.
 */
export const DEFAULT_PRINT_SIZE: PrintSize = { w: 10, h: 7 };

/** Round to a tenth of an inch — finer than any ruler at the print shop. */
function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Floor to a tenth (with a float-noise nudge: 16.55 × 10 is
 * 165.50000000000003). Used for the derived quarter presets so a
 * half-poster never claims a hair more room than it has — and so the
 * A0 quarter reads 23.4 × 16.5, as the spec says, not 16.6.
 */
function floorTenth(n: number): number {
  return Math.floor(n * 10 + 1e-9) / 10;
}

/**
 * Parse what the user typed. Accepts a comma decimal ("7,5") because a
 * good share of the audience types in a locale that uses one. Returns
 * null for anything empty, non-numeric or non-positive so the caller
 * can revert to the last committed value rather than commit garbage.
 */
export function parseInches(raw: string): number | null {
  const normalised = raw.trim().replace(',', '.');
  if (normalised === '') return null;
  const n = Number(normalised);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Clamp into [1, 96] and round to 0.1". */
export function clampInches(n: number): number {
  const bounded = Math.min(PRINT_SIZE_MAX_IN, Math.max(PRINT_SIZE_MIN_IN, n));
  return roundTenth(bounded);
}

function quarterOf(key: keyof typeof POSTER_SIZES): PrintSize {
  const size = POSTER_SIZES[key]!;
  return { w: clampInches(floorTenth(size.w / 2)), h: clampInches(floorTenth(size.h / 2)) };
}

function labelled(id: string, prefix: string, size: PrintSize): PrintSizePreset {
  return { id, label: `${prefix} — ${size.w} × ${size.h}`, ...size };
}

const QUARTER_48x36 = quarterOf('48×36');
const QUARTER_A0_LANDSCAPE = quarterOf('A0L');
/**
 * One column of a three-column 36" × 48" portrait: 36/3 = 12" minus
 * gutters ≈ 11" wide; 8" tall is a typical single figure in that
 * column. A judgment call — kept here so it is changed in one place.
 */
const COLUMN_36x48: PrintSize = { w: 11, h: 8 };

/**
 * Preset chips, in display order. The two "quarter" presets derive from
 * `POSTER_SIZES` so they track the editor's canonical poster sizes.
 */
export const PRINT_SIZE_PRESETS: ReadonlyArray<PrintSizePreset> = [
  labelled('small', 'Small figure', DEFAULT_PRINT_SIZE),
  labelled('quarter-48x36', 'Quarter of a 48 × 36 poster', QUARTER_48x36),
  labelled('quarter-a0-landscape', 'Quarter of an A0 landscape', QUARTER_A0_LANDSCAPE),
  labelled('column-36x48', 'One column of a 36 × 48 portrait', COLUMN_36x48),
];

/** Tolerance for treating a typed size as "this preset" (aria-pressed). */
const PRESET_TOLERANCE_IN = 0.05;

/** The preset id the given size matches, or null if none is within tolerance. */
export function matchingPresetId(w: number, h: number): string | null {
  const match = PRINT_SIZE_PRESETS.find(
    (preset) =>
      Math.abs(preset.w - w) <= PRESET_TOLERANCE_IN &&
      Math.abs(preset.h - h) <= PRESET_TOLERANCE_IN,
  );
  return match?.id ?? null;
}
