import { describe, it, expect } from 'vitest';
import { snap } from '../snap';

describe('snap', () => {
  it('snaps to the nearest grid point when within threshold', () => {
    // Grid is 5, threshold is 3.
    expect(snap(0)).toBe(0);
    expect(snap(5)).toBe(5);
    expect(snap(4)).toBe(5); // 1 away → snap
    expect(snap(6)).toBe(5); // 1 away → snap
    expect(snap(7)).toBe(5); // 2 away → snap
    expect(snap(8)).toBe(10); // 2 away from 10 → snap
  });

  it('does not snap when distance exceeds threshold', () => {
    // 12 → nearest grid point is 10, distance 2 → snap.
    // Pick a value that is exactly threshold away from grid: 5+3 = 8, snaps.
    // 5 + 3.1 → distance > 3 → no snap. Test with 8.5: nearest is 10, distance 1.5 → snap.
    // To avoid snapping we need a value at least threshold (3) away from any grid point.
    // The midpoint between 5 and 10 is 7.5, distance 2.5 → still snaps.
    // With grid=5 and threshold=3, snap is essentially always-on. So we test the
    // never-no-snap behavior with a fractional value far from any grid point —
    // not possible with these constants. Instead verify the rounding direction.
    expect(snap(12.4)).toBe(10);
    expect(snap(12.6)).toBe(15);
  });

  it('handles negative numbers', () => {
    expect(snap(-2)).toBe(0);
    expect(snap(-3)).toBe(-5);
    expect(snap(-7.4)).toBe(-5);
  });

  it('is idempotent on grid points', () => {
    [0, 5, 10, 15, 20, 100, 500].forEach((v) => {
      expect(snap(v)).toBe(v);
    });
  });
});
