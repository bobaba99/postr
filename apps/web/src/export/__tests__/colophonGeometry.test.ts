/**
 * The colophon's adaptive geometry.
 *
 * These tests are written as INVARIANTS SWEPT OVER EVERY POSTER SIZE
 * rather than as a handful of pinned numbers, because the property the
 * owner asked for is a property of the whole family:
 *
 *   "adaptive but also won't go over the size and blocks the text"
 *
 * A test that pins 48×36 only would have passed the bug this module
 * fixes — the old fixed geometry was fine at 48×36 and wrong everywhere
 * else, and its `bottom: M` sat outside the margin band at *all* sizes
 * while the code comment claimed otherwise.
 */
import { describe, expect, it } from 'vitest';
import { colophonGeometry } from '../colophonGeometry';
import { M, POINTS_PER_UNIT } from '@/poster/constants';
import { POSTER_SIZES } from '@/poster/constants';

const SIZES = Object.entries(POSTER_SIZES).map(([key, s]) => ({ key, w: s.w, h: s.h }));

/** readability.ts's own floors — the credit is measured against them. */
const AXIS_TITLE_FLOOR_PT = 18;
const CAPTION_FLOOR_PT = 12;

/**
 * Mirrored from colophonGeometry.ts. Deliberately NOT imported: these
 * tests exist to notice when those constants move, and importing them
 * would make the assertions move silently along with the code.
 */
const MIN_OFFSET_UNITS = 2.5;
const MAX_OFFSET_UNITS = 4.5;
const OFFSET_UNITS_PER_INCH = 3.9 / 36;
const BAND_CLEARANCE_UNITS = 0.5;

describe('colophonGeometry — invariants at every poster size', () => {
  it('covers every size the product offers', () => {
    // Guards against a new POSTER_SIZES entry silently skipping this sweep.
    expect(SIZES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(SIZES)('$key: sits entirely inside the bottom margin band', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // The mark is the tallest item on the line, so it governs the fit.
    expect(g.bottomUnits + g.markUnits).toBeLessThanOrEqual(M);
    expect(g.insideMarginBand).toBe(true);
  });

  it.each(SIZES)('$key: clears the printer trim on both edges', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // Large-format printers trim 0.25-0.5in; 2.5 units = 0.25in is the
    // floor at which the line reliably survives the cut.
    expect(g.bottomUnits).toBeGreaterThanOrEqual(2.5);
    expect(g.rightUnits).toBeGreaterThanOrEqual(2.5);
  });

  it.each(SIZES)('$key: the offset scales with the poster, not fixed', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    const shortSide = Math.min(w, h);
    // Inside the clamps the offset tracks the short side; at the clamps
    // it pins. Either way it is never the old fixed 10u.
    expect(g.bottomUnits).toBeLessThan(M);
    expect(g.bottomUnits).toBeGreaterThanOrEqual(2.5);
    if (shortSide * (3.9 / 36) > 2.5 && shortSide * (3.9 / 36) < 4.5) {
      expect(g.bottomUnits).toBeCloseTo(shortSide * (3.9 / 36), 1);
    }
  });

  it.each(SIZES)('$key: prints below the axis-title floor so it never reads as content', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    expect(g.printedPt).toBeLessThan(AXIS_TITLE_FLOOR_PT);
  });

  it.each(SIZES)('$key: never prints below the caption floor', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // Legibility is absolute — it does not scale with the sheet — so the
    // floor is the product's own caption minimum, not a smaller number
    // chosen to keep small posters tidy.
    expect(g.printedPt).toBeGreaterThanOrEqual(CAPTION_FLOOR_PT);
  });

  it.each(SIZES)('$key: sits the same distance from both edges', ({ w, h }) => {
    // Equal offsets are what make it read as seated in the CORNER.
    // `right` was previously pinned at M (1in) to align with the content
    // column, which left it hugging the bottom while an inch off the
    // side — and, being absolute, it did not move when the poster did.
    const g = colophonGeometry(w, h);
    expect(g.rightUnits).toBe(g.bottomUnits);
  });

  it.each(SIZES)('$key: stays close to the corner at every size', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // Never further than 0.45in from either edge, on any poster.
    expect(g.rightUnits).toBeLessThanOrEqual(4.5);
    expect(g.bottomUnits).toBeLessThanOrEqual(4.5);
  });

  it.each(SIZES)('$key: box width stays well clear of the opposite margin', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // Rough upper bound on the rendered line: mark + gap + ~22 units of
    // text at the reference size, scaled. Measured at 21.6u on the
    // reference sheet; the assertion is that it cannot approach W - 2M
    // even on the narrowest poster.
    const approxWidthUnits = g.markUnits + g.gapUnits + 22 * (g.fontUnits / 1.75);
    expect(approxWidthUnits).toBeLessThan(w * 10 - 2 * M);
  });

  it.each(SIZES)('$key: printedPt is the honest conversion of fontUnits', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // The unit confusion this guards against is the exact bug that made
    // the old colophon print at 50.4pt while claiming 7pt.
    expect(g.printedPt).toBeCloseTo(g.fontUnits * POINTS_PER_UNIT, 5);
  });
});

describe('colophonGeometry — the adaptive behaviour itself', () => {
  it('keeps the 48x36 reference at the owner-approved 12.6pt', () => {
    const g = colophonGeometry(48, 36);
    expect(g.fontUnits).toBe(1.75);
    expect(g.markUnits).toBe(2.25);
    expect(g.printedPt).toBeCloseTo(12.6, 2);
  });

  it('moves the corner offset when the poster size changes', () => {
    // The complaint that prompted this: the mark stayed at the same spot
    // when the poster changed size.
    const small = colophonGeometry(24, 36);
    const mid = colophonGeometry(48, 36);
    const large = colophonGeometry(42, 42);
    expect(small.bottomUnits).toBeLessThan(mid.bottomUnits);
    expect(large.bottomUnits).toBeGreaterThan(mid.bottomUnits);
    expect(small.rightUnits).toBeLessThan(large.rightUnits);
  });

  it('is larger on a bigger poster and smaller on a smaller one', () => {
    const small = colophonGeometry(24, 36);
    const mid = colophonGeometry(48, 36);
    const large = colophonGeometry(42, 42);
    expect(small.fontUnits).toBeLessThan(mid.fontUnits);
    expect(large.fontUnits).toBeGreaterThan(mid.fontUnits);
  });

  it('scales off the SHORT side, so both orientations of a sheet match', () => {
    // A reader who sees the portrait and landscape versions of the same
    // poster should not see two different colophons.
    expect(colophonGeometry(48, 36)).toEqual(colophonGeometry(36, 48));
    expect(colophonGeometry(42, 36)).toEqual(colophonGeometry(36, 42));
    expect(colophonGeometry(46.8, 33.1)).toEqual(colophonGeometry(33.1, 46.8));
  });

  it('clamps the floor so a tiny poster still gets a legible credit', () => {
    // Unclamped, a 10in short side would give 0.49 units = 3.5pt.
    const tiny = colophonGeometry(10, 10);
    expect(tiny.printedPt).toBeCloseTo(CAPTION_FLOOR_PT, 1);
  });

  it('clamps the ceiling so a huge poster cannot grow a billboard', () => {
    // Unclamped, a 120in short side would give 5.83 units = 42pt —
    // larger than most posters' body text, which is the failure mode
    // the whole acknowledgement framing exists to avoid.
    const huge = colophonGeometry(200, 120);
    expect(huge.fontUnits).toBe(2.0);
    expect(huge.printedPt).toBeCloseTo(14.4, 2);
    expect(huge.printedPt).toBeLessThan(AXIS_TITLE_FLOOR_PT);
  });

  it('keeps a huge poster inside the band even at the size ceiling', () => {
    // The band does NOT grow with the poster — it is a fixed 1 inch — so
    // the ceiling and the band clamp have to compose.
    const huge = colophonGeometry(200, 120);
    expect(huge.bottomUnits + huge.markUnits).toBeLessThanOrEqual(M);
    expect(huge.insideMarginBand).toBe(true);
  });

  // This test used to be described as "the case where getting the clamp
  // order wrong would show up". It is not: deleting the band clamp
  // outright leaves all 98 tests in this file green. The clamp cannot
  // bind for any input the product can produce, so the honest thing to
  // assert is the HEADROOM — which is what would actually change.
  it.each(SIZES)('$key: the band clamp is a backstop and does not bind', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // The offset the size-based preference asks for, before any band clamp.
    const preferred = Math.max(
      MIN_OFFSET_UNITS,
      Math.min(MAX_OFFSET_UNITS, Math.min(w, h) * OFFSET_UNITS_PER_INCH),
    );
    // Equal => step 3 did nothing. If this ever fails the clamp has gone
    // live, which is allowed — but colophonGeometry's JSDoc calls it a
    // backstop, and that sentence would then be wrong.
    expect(g.bottomUnits).toBeCloseTo(Math.round(preferred * 100) / 100, 2);
  });

  it('states the headroom by which the band clamp is dead', () => {
    // Ceiling on what the preference can ask for...
    const maxPreferred = MAX_OFFSET_UNITS;
    // ...versus the tightest the band can ever be (largest mark).
    const maxFontUnits = (0.8 * AXIS_TITLE_FLOOR_PT) / POINTS_PER_UNIT;
    const tightestBand = M - maxFontUnits * (9 / 7) - BAND_CLEARANCE_UNITS;
    expect(tightestBand).toBeGreaterThan(maxPreferred);
    // 2.43u today. Raising MAX_OFFSET_UNITS past ~6.93 makes the clamp live.
    expect(tightestBand - maxPreferred).toBeCloseTo(2.43, 2);
  });

  it('is pure — same input, same output, no shared mutable state', () => {
    const a = colophonGeometry(48, 36);
    const b = colophonGeometry(48, 36);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('fires the floor on the smaller sheets rather than shrinking with them', () => {
    // The three smallest catalog sizes all land on the floor. That is
    // the point: a 24x36 read at arm's length needs the same absolute
    // legibility as an A0 read from two metres.
    for (const [w, h] of [[24, 36], [46.8, 33.1], [33.1, 46.8]] as const) {
      expect(colophonGeometry(w, h).printedPt).toBeCloseTo(CAPTION_FLOOR_PT, 1);
    }
    // While the reference sheet is comfortably above it.
    expect(colophonGeometry(48, 36).printedPt).toBeGreaterThan(CAPTION_FLOOR_PT);
  });
});
