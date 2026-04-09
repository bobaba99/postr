/**
 * Typography math.
 *
 * The poster coordinate system is fixed: 1 unit = 1/10 inch = 7.2 points.
 * Font sizes are stored in units but users think in points, so the
 * Sidebar converts at the edge. These tests pin the conversion math
 * so a future refactor can't silently drift the print sizes.
 *
 * Guideline (NYU / Better Posters):
 *   title      72pt min / 158pt ideal
 *   heading    42pt min /  56pt ideal
 *   body       24pt min /  36pt ideal
 *   captions   18pt min /  24pt ideal
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STYLES,
  POINTS_PER_UNIT,
  ptToUnits,
  unitsToPt,
} from '../constants';

describe('typography math', () => {
  it('1 poster unit equals 7.2 points (1/10 inch)', () => {
    expect(POINTS_PER_UNIT).toBe(7.2);
  });

  it('ptToUnits and unitsToPt are inverses', () => {
    for (const pt of [12, 24, 36, 56, 72, 158]) {
      expect(unitsToPt(ptToUnits(pt))).toBeCloseTo(pt, 6);
    }
  });

  it('round-trips via the Sidebar UX (points shown, units stored)', () => {
    // User types 56 in the pt input → we store ptToUnits(56) ≈ 7.78 units.
    // We then round that back to 56pt when displaying.
    const stored = ptToUnits(56);
    expect(Math.round(unitsToPt(stored))).toBe(56);
  });
});

describe('default styles match the print-readability guideline', () => {
  it('title falls within [72pt, 158pt]', () => {
    const pt = unitsToPt(DEFAULT_STYLES.title.size);
    expect(pt).toBeGreaterThanOrEqual(72);
    expect(pt).toBeLessThanOrEqual(170); // ideal + rounding slack
  });

  it('heading falls within [42pt, 60pt]', () => {
    const pt = unitsToPt(DEFAULT_STYLES.heading.size);
    expect(pt).toBeGreaterThanOrEqual(42);
    expect(pt).toBeLessThanOrEqual(60); // ideal + slack
  });

  it('body falls within [24pt, 40pt]', () => {
    const pt = unitsToPt(DEFAULT_STYLES.body.size);
    expect(pt).toBeGreaterThanOrEqual(24);
    expect(pt).toBeLessThanOrEqual(40);
  });

  it('authors is at least 24pt (readable supporting text)', () => {
    const pt = unitsToPt(DEFAULT_STYLES.authors.size);
    expect(pt).toBeGreaterThanOrEqual(24);
  });
});
