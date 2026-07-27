/**
 * Copy-a-design extraction core (plan §3.1 + §6):
 *   - CIEDE2000 validated against Sharma, Wu & Dalal (2005) published
 *     test pairs — the reconciliation is only as good as the metric.
 *   - Palette reconciliation: roles from the model, values from the
 *     clustering; snap within threshold, keep the model hex beyond it.
 *   - Print-safe clamp: no pure black background, no neon.
 */
import { describe, it, expect } from 'vitest';
import type { Palette } from '@postr/shared';
import { ciede2000, ciede2000Lab } from '../colorDistance';
import {
  SNAP_THRESHOLD_DE2000,
  clampPrintSafe,
  reconcilePalette,
} from '../styleExtraction';
import { hexToHsl } from '../paletteTools';

// ─────────────────────────────────────────────────────────────────────
// CIEDE2000
// ─────────────────────────────────────────────────────────────────────

describe('ciede2000Lab — Sharma/Wu/Dalal reference pairs', () => {
  // Rows from the published CIEDE2000 test data (L, a, b) × 2 → ΔE00.
  // Covers the discontinuity-prone hue-average branches.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ] as Array<[[number, number, number], [number, number, number], number]>)(
    'lab %j vs %j → ΔE00 %f',
    (lab1, lab2, expected) => {
      expect(ciede2000Lab(lab1, lab2)).toBeCloseTo(expected, 4);
    },
  );

  it('is zero for identical inputs and symmetric', () => {
    expect(ciede2000Lab([50, 2.5, 0], [50, 2.5, 0])).toBe(0);
    const ab = ciede2000Lab([50, 2.5, 0], [73, 25, -18]);
    const ba = ciede2000Lab([73, 25, -18], [50, 2.5, 0]);
    expect(ab).toBeCloseTo(ba, 10);
  });
});

describe('ciede2000 (hex)', () => {
  it('is zero for identical colours', () => {
    expect(ciede2000('#2D6A4F', '#2D6A4F')).toBe(0);
  });

  it('reads near-identical colours as tiny and opposites as huge', () => {
    expect(ciede2000('#2D6A4F', '#2E6B50')).toBeLessThan(1.5);
    expect(ciede2000('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Palette reconciliation
// ─────────────────────────────────────────────────────────────────────

function modelPalette(overrides: Partial<Palette> = {}): Palette {
  return {
    bg: '#FBFDF8',
    primary: '#1C3B2E',
    accent: '#2E6B50',
    accent2: '#54B98A',
    muted: '#5B6F60',
    headerBg: '#2E6B50',
    headerFg: '#FEFEFE',
    ...overrides,
  };
}

describe('reconcilePalette', () => {
  it('takes roles from the model but snaps values to the clustered colours', () => {
    // The clustering found the EXACT on-page colours; the model
    // reported each one slightly off (typical vision behaviour).
    const clustered = [
      '#FAFDF7',
      '#1B3A2D',
      '#2D6A4F',
      '#52B788',
      '#5A6E5F',
      '#FFFFFF',
    ];
    const out = reconcilePalette(modelPalette(), clustered);

    expect(out.bg).toBe('#FAFDF7');
    expect(out.primary).toBe('#1B3A2D');
    expect(out.accent).toBe('#2D6A4F');
    expect(out.accent2).toBe('#52B788');
    expect(out.muted).toBe('#5A6E5F');
    expect(out.headerBg).toBe('#2D6A4F');
    expect(out.headerFg).toBe('#FFFFFF');
  });

  it('keeps the model hex when no cluster is within the snap threshold', () => {
    // Model says the accent is a deep red; clustering only surfaced
    // greens/whites (e.g. the red rule was too thin to survive
    // downsampling). ΔE00 between red and every cluster is far above
    // threshold, so the model value survives.
    const clustered = ['#FAFDF7', '#1B3A2D', '#2D6A4F'];
    const out = reconcilePalette(
      modelPalette({ accent2: '#C1121F' }),
      clustered,
    );
    expect(out.accent2).toBe('#C1121F');
  });

  it('snaps each role to its own nearest cluster, not a shared winner', () => {
    const clustered = ['#0F4C75', '#3282B8', '#FFFFFF'];
    const out = reconcilePalette(
      modelPalette({
        accent: '#104D77', // near the dark blue
        accent2: '#3384BA', // near the light blue
      }),
      clustered,
    );
    expect(out.accent).toBe('#0F4C75');
    expect(out.accent2).toBe('#3282B8');
  });

  it('normalises model hexes when the cluster list is empty', () => {
    const out = reconcilePalette(modelPalette({ accent: '#2e6b50' }), []);
    expect(out.accent).toBe('#2E6B50');
  });

  it('exposes a threshold in the "same colour, imprecisely reported" range', () => {
    // Guard against accidental order-of-magnitude edits: ΔE00 of a
    // JND is ~1-2; visibly different colours sit above ~10-12.
    expect(SNAP_THRESHOLD_DE2000).toBeGreaterThanOrEqual(5);
    expect(SNAP_THRESHOLD_DE2000).toBeLessThanOrEqual(15);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Print-safe clamp
// ─────────────────────────────────────────────────────────────────────

describe('clampPrintSafe', () => {
  it('lifts a pure black background to near-black', () => {
    const out = clampPrintSafe(modelPalette({ bg: '#000000' }));
    expect(out.bg).not.toBe('#000000');
    const [, , l] = hexToHsl(out.bg);
    expect(l).toBeGreaterThanOrEqual(10);
    expect(l).toBeLessThan(20); // still reads as a dark background
  });

  it('desaturates neon values on any role', () => {
    const out = clampPrintSafe(modelPalette({ accent: '#00FF00' }));
    const [, s] = hexToHsl(out.accent);
    expect(s).toBeLessThanOrEqual(92.5);
  });

  it('passes an already print-safe palette through unchanged', () => {
    const safe = modelPalette();
    expect(clampPrintSafe(safe)).toEqual(safe);
  });

  it('does not lift dark non-background roles', () => {
    const out = clampPrintSafe(modelPalette({ primary: '#000000' }));
    expect(out.primary).toBe('#000000');
  });
});
