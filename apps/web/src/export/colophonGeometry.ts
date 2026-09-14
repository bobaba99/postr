/**
 * colophonGeometry — where the print/PDF acknowledgement line sits, and
 * how big it is, for a poster of any size.
 *
 * ── Why this is adaptive, and why it is clamped ───────────────────
 * The colophon used to be a fixed set of pixel values. That is wrong in
 * both directions: the same absolute mark is a billboard on a 24×36
 * poster and a speck on an A0, and neither reading is the one intended.
 *
 * So every dimension scales with the poster — but scaling alone is also
 * wrong, because an unbounded relative size grows without limit. The
 * owner's constraint (2026-09-13) is the right shape:
 *
 *   "it should be on a relative location ... but with fixed min height
 *    and width of the coordinates and fixed max dimensions, so it's
 *    adaptive but also won't go over the size and blocks the text"
 *
 * Hence: offsets get a floor (never on the trim edge, where a
 * large-format printer would cut it off), sizes get a ceiling (never
 * big enough to read as content), and both are clamped again against
 * the margin band so the result is provably inside it.
 *
 * `insideMarginBand` is a real invariant but a PARTIAL one, and it must
 * not be read as "cannot overlap content". Three of the four shipped
 * content templates place blocks inside the band and past the sheet
 * bottom (see `acknowledgementPrintCss`), so band-membership is
 * necessary and not sufficient. The stress harness therefore measures
 * actual block intersection as its gate, not this flag.
 *
 * ── Units ─────────────────────────────────────────────────────────
 * Everything here is in POSTER UNITS: 1 unit = 1 CSS px in the print
 * stylesheet = 0.1 inch = 7.2 pt, because `printDocument` applies
 * `zoom: 96 / PX` to the whole print root. Mixing that up is what made
 * the pre-2026-09-13 colophon print at 50.4 pt while its comment
 * claimed 7 pt. `POINTS_PER_UNIT` is imported rather than re-derived so
 * there is one definition of the conversion.
 *
 * ── The scaling basis ─────────────────────────────────────────────
 * Size scales with `min(widthIn, heightIn)`, the poster's SHORT side,
 * not its width, height, area or diagonal. Reasons, in order:
 *   - The margin band the colophon lives in is a fixed 1 inch (`M`)
 *     regardless of poster size, so the space available to it does not
 *     grow. Scaling off the long side would outgrow that band on a
 *     portrait poster while under-filling it on a landscape one.
 *   - The short side is what a reader's viewing distance tracks in
 *     practice — a 24×36 is read close up, an A0 from further back.
 *   - It makes the two orientations of the same sheet (36×48 and
 *     48×36, A0L and A0P) produce an IDENTICAL colophon, which is what
 *     a reader who sees both would expect. Width- or area-based
 *     scaling would not.
 */
import { M, POINTS_PER_UNIT } from '@/poster/constants';

/**
 * The product's own readability floors, from `readability.ts`'s element
 * tables. Imported as numbers rather than re-derived so the colophon is
 * measured against the SAME thresholds the checker applies to a user's
 * figure — if those move, this moves with them.
 */
const CAPTION_FLOOR_PT = 12;
const AXIS_TITLE_FLOOR_PT = 18;

// ── Tunables ─────────────────────────────────────────────────────────
//
// The reference point is the 48×36 poster (short side 36in), which must
// keep the 12.6 pt the owner approved on 2026-09-13. Every constant
// below is derived from that anchor rather than picked freely.

/** Font size in poster units per inch of short side. 1.75 / 36. */
const FONT_UNITS_PER_INCH = 1.75 / 36;

/**
 * Floor and ceiling on the text size, in poster units. Both are DERIVED
 * from the readability floors rather than picked, so neither is a magic
 * number and both move if the product's thresholds move.
 *
 * Floor = the caption floor exactly (12 pt = 1.667 u). Legibility is
 * absolute — it does not scale with the sheet — so a smaller poster must
 * not get a credit smaller than a reader can read at the same distance.
 * This fires on the three smallest sizes; that is the design working.
 *
 * Ceiling = 80% of the axis-title floor (14.4 pt = 2.0 u). This is the
 * load-bearing clamp: it is what stops the mark growing until it reads
 * as content. 80% keeps a deliberate 3.6 pt of headroom below the
 * smallest text the product considers real content.
 */
const MIN_FONT_UNITS = CAPTION_FLOOR_PT / POINTS_PER_UNIT;
const MAX_FONT_UNITS = (0.8 * AXIS_TITLE_FLOOR_PT) / POINTS_PER_UNIT;

/**
 * Mark side relative to font size. 9/7 preserves the ratio the
 * hand-tuned 2026-08-06 colophon used (a 9 px mark beside 7 px text),
 * which sizes the mark to roughly the text's cap height so it reads as
 * part of the line rather than as a badge stuck next to it.
 */
const MARK_TO_FONT = 9 / 7;

/** Gap between mark and text, relative to font size. Was 1px at 1.75px. */
const GAP_TO_FONT = 1 / 1.75;

/**
 * Edge offset in poster units per inch of short side, anchored so a
 * 36 in short side gives 3.9 u (0.39 in) — the value the band-centred
 * version produced, and the one the reference sheet was reviewed at.
 */
const OFFSET_UNITS_PER_INCH = 3.9 / 36;

/**
 * Floor and ceiling on the edge offsets, in poster units.
 *
 * The floor is the load-bearing one: large-format printers routinely
 * trim 0.25–0.5 in, so 2.5 units (0.25 in) is the minimum at which the
 * line reliably survives the cut. The ceiling stops the mark drifting
 * away from the corner on a large sheet.
 */
const MIN_OFFSET_UNITS = 2.5;
const MAX_OFFSET_UNITS = 4.5;

/**
 * Clearance kept between the top of the mark and the top of the margin
 * band, in poster units. Pure paranoia margin: it means a rounding
 * difference in a print engine still cannot push the mark into content.
 */
const BAND_CLEARANCE_UNITS = 0.5;

function clamp(lo: number, value: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Round to 2dp so the emitted CSS is stable and diff-friendly. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ColophonGeometry {
  /** Text size, poster units. */
  fontUnits: number;
  /** Mark side, poster units. Square. */
  markUnits: number;
  /** Gap between mark and text, poster units. */
  gapUnits: number;
  /** Distance from the sheet's right edge, poster units. */
  rightUnits: number;
  /** Distance from the sheet's bottom edge, poster units. */
  bottomUnits: number;
  /**
   * Printed text size in points — what a reader actually sees. Exactly
   * `fontUnits * POINTS_PER_UNIT`, so it can never drift from the size
   * the stylesheet actually carries.
   */
  printedPt: number;
  /**
   * True when the whole box provably sits inside the `M` margin band.
   * Computed, not asserted: `bottomUnits + markUnits <= M`. The public
   * field exists so tests can check the invariant at every poster size
   * rather than trusting the clamp order.
   */
  insideMarginBand: boolean;
}

/**
 * Geometry for a poster of `widthIn` × `heightIn`.
 *
 * Pure. Total ordering of the clamps matters and is deliberate:
 *   1. size from the short side, clamped to [MIN, MAX]
 *   2. offset from the short side, clamped to [MIN, MAX]
 *   3. offset clamped AGAIN so `offset + mark` fits inside the band
 *
 * Step 3 runs last because the band is a hard physical constraint and
 * the preference expressed by steps 1-2 is not.
 *
 * BUT: with today's constants step 3 is a BACKSTOP, not a live clamp —
 * it cannot bind for any input, and saying otherwise was wrong.
 *
 *     preferredOffset  <= MAX_OFFSET_UNITS                 = 4.50 u
 *     maxOffsetInBand  >= M - MAX_FONT*9/7 - CLEARANCE     = 6.93 u
 *     headroom                                               2.43 u
 *
 * Deleting line-for-line leaves every colophon test green, which is how
 * this was found. It is kept as cheap insurance: raise
 * MAX_OFFSET_UNITS above ~6.93, or grow the mark relative to the font,
 * and it starts doing real work. `colophonGeometry.test.ts` pins that
 * headroom so the day it goes live is not a surprise.
 */
export function colophonGeometry(widthIn: number, heightIn: number): ColophonGeometry {
  const shortSideIn = Math.min(widthIn, heightIn);

  const fontUnits = clamp(
    MIN_FONT_UNITS,
    shortSideIn * FONT_UNITS_PER_INCH,
    MAX_FONT_UNITS,
  );
  const markUnits = fontUnits * MARK_TO_FONT;
  const gapUnits = fontUnits * GAP_TO_FONT;

  // ONE offset, used for both edges, scaled off the same short side as
  // the size. Two consequences, both deliberate:
  //
  //   - The mark sits the SAME distance from the bottom and right edges,
  //     so it reads as seated in the corner. `right` used to be pinned
  //     at M (1 in) to align with the content column, which left it
  //     hugging the bottom while sitting an inch off the side — and,
  //     being absolute, it did not move at all when the poster did.
  //   - It scales. A fixed offset is proportionally huge on a 24x36 and
  //     tight on an A0; this keeps the optical distance to the corner
  //     roughly constant across the catalog.
  //
  // The band clamp still runs LAST, because the band is a hard physical
  // constraint and the preference above is not.
  const preferredOffset = clamp(
    MIN_OFFSET_UNITS,
    shortSideIn * OFFSET_UNITS_PER_INCH,
    MAX_OFFSET_UNITS,
  );
  const maxOffsetInBand = M - markUnits - BAND_CLEARANCE_UNITS;
  const bottomUnits = Math.min(preferredOffset, maxOffsetInBand);

  // Round FIRST, then derive everything reported from the rounded
  // values. The CSS carries the rounded numbers, so those are what
  // actually print — deriving `printedPt` from the unrounded font size
  // would report a size the reader never sees. Small difference, but
  // reporting a number that is not the one in the stylesheet is the
  // same class of mistake as the 7px/"7pt" comment this module
  // replaced, so it is worth being exact about.
  const fontRounded = round2(fontUnits);
  const markRounded = round2(markUnits);
  const offsetRounded = round2(bottomUnits);

  return {
    fontUnits: fontRounded,
    markUnits: markRounded,
    gapUnits: round2(gapUnits),
    // Same value as `bottom`: equal distance from both edges is what
    // makes it read as seated in the corner rather than floated near it.
    rightUnits: offsetRounded,
    bottomUnits: offsetRounded,
    // NOT rounded: unlike the fields above it is never emitted into
    // CSS, so there is nothing to keep diff-stable — and rounding it
    // would make it disagree with the very font size it describes.
    printedPt: fontRounded * POINTS_PER_UNIT,
    insideMarginBand: offsetRounded + markRounded <= M,
  };
}
