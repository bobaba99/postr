/**
 * Unit / coordinate conversion layer shared by every editable-export
 * writer (LaTeX, PPTX).
 *
 * Postr stores geometry in poster units where 1 unit = 1/10 inch
 * (`PX` in poster/constants.ts). Both export targets are absolute
 * positioning systems, so every conversion here is exact:
 *
 *   1 unit = 0.1 in = 7.2 pt = 91,440 EMU
 *
 * EMU is an integer unit and 91,440 is an integer, so PPTX geometry
 * round-trips with zero floating-point drift.
 *
 * This module is pure — no DOM, no store, no network — because the
 * export writers must run on a `PosterDoc` that was never opened in
 * the editor (standalone pipeline constraint, plan §5).
 */
import { PX, POINTS_PER_UNIT } from '@/poster/constants';

/** English Metric Units per inch — the OOXML base unit. */
export const EMU_PER_INCH = 914400;

/** EMU per poster unit: 914400 / 10 = 91,440 (exact integer). */
export const EMU_PER_UNIT = EMU_PER_INCH / PX;

/** Poster units → inches (1 unit = 1/10 in). */
export const unitsToInches = (units: number): number => units / PX;

/** Poster units → printer's points (1 unit = 7.2 pt). */
export const unitsToPoints = (units: number): number => units * POINTS_PER_UNIT;

/** Poster units → EMU. Integer inputs produce exact integers. */
export const unitsToEmu = (units: number): number => Math.round(units * EMU_PER_UNIT);

/** Inches → EMU. */
export const inchesToEmu = (inches: number): number => Math.round(inches * EMU_PER_INCH);

// =========================================================================
// Inverse conversions — used by the .pptx IMPORTER (import/pptx/).
//
// Additive only: the exporter's constants above are untouched. These
// exist so the importer never re-derives 91,440 as a magic number —
// both directions share EMU_PER_UNIT, which is what makes the
// round-trip exact.
// =========================================================================

/** EMU → poster units. Exact for any EMU produced by `unitsToEmu`. */
export const emuToUnits = (emu: number): number => emu / EMU_PER_UNIT;

/** EMU → inches. */
export const emuToInches = (emu: number): number => emu / EMU_PER_INCH;

// =========================================================================
// PowerPoint's 56-inch slide ceiling (plan §2)
// =========================================================================

/** PowerPoint's hard maximum per slide dimension, in inches. */
export const PPTX_MAX_DIMENSION_IN = 56;

/**
 * The ONLY scale factor we ever apply. Arbitrary factors produce
 * non-round font sizes and make the "print at 200%" instruction
 * wrong — the plan forbids anything but 0.5.
 */
export const PPTX_HALF_SCALE = 0.5;

export interface PptxScalePlan {
  /** Multiplier applied to every geometry AND font size. */
  scale: 1 | 0.5;
  /** True when the poster exceeded the ceiling and was halved. */
  scaled: boolean;
  slideWidthIn: number;
  slideHeightIn: number;
  /**
   * User-facing note describing the halving — shown in the export
   * UI AND written into the file itself (core properties + an
   * off-slide text box) so it survives being emailed onward.
   * Null when the poster fits unscaled.
   */
  note: string | null;
}

/**
 * Thrown when even half scale cannot fit PowerPoint's ceiling
 * (poster dimension > 112 in). Carries designed user-facing copy —
 * the export UI steers the user to LaTeX / PDF, which have no such
 * limit. We refuse rather than scale by anything other than 0.5.
 */
export class PptxSizeLimitError extends Error {
  readonly userMessage: string;

  constructor(widthIn: number, heightIn: number) {
    const msg =
      `This poster is ${widthIn}×${heightIn} in. PowerPoint cannot represent it ` +
      `even at half size (its limit is ${PPTX_MAX_DIMENSION_IN} in per side). ` +
      'Export LaTeX or PDF instead — neither has a size limit.';
    super(msg);
    this.name = 'PptxSizeLimitError';
    this.userMessage = msg;
  }
}

/**
 * Decide how a poster maps onto a PPTX slide.
 *
 * - Both dimensions ≤ 56 in → 1:1, no note.
 * - Either dimension > 56 in → exactly half scale, with the
 *   mandatory user-facing note ("print at 200%").
 * - Either dimension > 112 in → PptxSizeLimitError (half scale
 *   would still exceed the ceiling; silent clipping is the worst
 *   failure mode and arbitrary factors are forbidden).
 */
export function planPptxScale(widthIn: number, heightIn: number): PptxScalePlan {
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    throw new Error(`Invalid poster dimensions: ${widthIn}×${heightIn} in`);
  }

  const fitsFullSize =
    widthIn <= PPTX_MAX_DIMENSION_IN && heightIn <= PPTX_MAX_DIMENSION_IN;
  if (fitsFullSize) {
    return {
      scale: 1,
      scaled: false,
      slideWidthIn: widthIn,
      slideHeightIn: heightIn,
      note: null,
    };
  }

  const halfW = widthIn * PPTX_HALF_SCALE;
  const halfH = heightIn * PPTX_HALF_SCALE;
  if (halfW > PPTX_MAX_DIMENSION_IN || halfH > PPTX_MAX_DIMENSION_IN) {
    throw new PptxSizeLimitError(widthIn, heightIn);
  }

  return {
    scale: PPTX_HALF_SCALE,
    scaled: true,
    slideWidthIn: halfW,
    slideHeightIn: halfH,
    note:
      `This poster is ${widthIn}×${heightIn} in. PowerPoint's limit is ` +
      `${PPTX_MAX_DIMENSION_IN} in per side, so this file is exactly half size ` +
      `(${halfW}×${halfH} in). Print at 200% to restore full size.`,
  };
}
