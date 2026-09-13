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

describe('colophonGeometry — invariants at every poster size', () => {
  it('covers every size the product offers', () => {
    // Guards against a new POSTER_SIZES entry silently skipping this sweep.
    expect(SIZES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(SIZES)('$key: sits entirely inside the $M-unit bottom margin band', ({ w, h }) => {
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

  it.each(SIZES)('$key: prints below the axis-title floor so it never reads as content', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    expect(g.printedPt).toBeLessThan(AXIS_TITLE_FLOOR_PT);
  });

  it.each(SIZES)('$key: prints large enough to be legible', ({ w, h }) => {
    const g = colophonGeometry(w, h);
    // The smallest sheet lands slightly under the 12pt caption floor by
    // design — it is read at close range — but never below 10pt.
    expect(g.printedPt).toBeGreaterThanOrEqual(10);
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
    expect(tiny.fontUnits).toBe(1.4);
    expect(tiny.printedPt).toBeCloseTo(10.08, 2);
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
    // The band does NOT grow with the poster — it is a fixed 1 inch —
    // so the ceiling and the band clamp have to compose. This is the
    // case where getting the clamp order wrong would show up.
    const huge = colophonGeometry(200, 120);
    expect(huge.bottomUnits + huge.markUnits).toBeLessThanOrEqual(M);
    expect(huge.insideMarginBand).toBe(true);
  });

  it('is pure — same input, same output, no shared mutable state', () => {
    const a = colophonGeometry(48, 36);
    const b = colophonGeometry(48, 36);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('caps the printed caption floor comparison honestly', () => {
    // Documenting the one place the design knowingly dips below a
    // readability floor, so it is a decision on the record rather than
    // an accident someone "fixes" later.
    const smallest = colophonGeometry(24, 36);
    expect(smallest.printedPt).toBeLessThan(CAPTION_FLOOR_PT);
    expect(smallest.printedPt).toBeGreaterThanOrEqual(10);
  });
});
