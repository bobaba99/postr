import { describe, it, expect } from 'vitest';
import type { Palette } from '@postr/shared';
import {
  simulateCB,
  perceptualDistance,
  auditPaletteCB,
  CB_MIN_DISTANCE,
} from '../colorblind';

describe('simulateCB', () => {
  it('leaves achromatic colors essentially unchanged', () => {
    // Pure grays project to themselves under every deficiency.
    for (const type of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      const out = simulateCB('#808080', type);
      expect(perceptualDistance(out, '#808080')).toBeLessThan(2);
    }
  });

  it('collapses red toward yellow-brown under deuteranopia', () => {
    // Classic deutan simulation of pure red: the L and M cones share
    // a channel, so red loses its chromatic punch and drifts toward
    // a desaturated yellow/olive. It must NOT look red anymore.
    const out = simulateCB('#FF0000', 'deuteranopia');
    expect(perceptualDistance(out, '#FF0000')).toBeGreaterThan(30);
  });

  it('makes red and green converge under deuteranopia', () => {
    const redSim = simulateCB('#E53935', 'deuteranopia');
    const greenSim = simulateCB('#43A047', 'deuteranopia');
    // In trichromatic vision these are obviously different (~100).
    expect(perceptualDistance('#E53935', '#43A047')).toBeGreaterThan(40);
    // Under deutan they collapse toward each other.
    expect(perceptualDistance(redSim, greenSim)).toBeLessThan(25);
  });

  it('is idempotent for white and black', () => {
    expect(simulateCB('#FFFFFF', 'deuteranopia')).toBe('#FFFFFF');
    expect(simulateCB('#000000', 'protanopia')).toBe('#000000');
  });
});

describe('perceptualDistance', () => {
  it('returns 0 for identical colors', () => {
    expect(perceptualDistance('#123456', '#123456')).toBeCloseTo(0, 3);
  });

  it('is symmetric', () => {
    const d1 = perceptualDistance('#FF0000', '#00FF00');
    const d2 = perceptualDistance('#00FF00', '#FF0000');
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('grows with perceived difference', () => {
    const near = perceptualDistance('#112233', '#113344');
    const far = perceptualDistance('#112233', '#FFEEAA');
    expect(far).toBeGreaterThan(near);
  });
});

describe('auditPaletteCB', () => {
  const SAFE: Palette = {
    // Blue/orange is the canonical CB-safe academic pair.
    bg: '#FFFFFF',
    primary: '#1A1A1A',
    accent: '#1F6FEB',       // strong blue
    accent2: '#E07B00',      // strong orange
    muted: '#8A8A8A',
    headerBg: '#1F6FEB',
    headerFg: '#FFFFFF',
  };

  const UNSAFE: Palette = {
    // Red/green accents collapse under deuteranopia.
    bg: '#FFFFFF',
    primary: '#1A1A1A',
    accent: '#E53935',
    accent2: '#43A047',
    muted: '#8A8A8A',
    headerBg: '#E53935',
    headerFg: '#FFFFFF',
  };

  it('passes a blue/orange palette', () => {
    const r = auditPaletteCB(SAFE);
    expect(r.safe).toBe(true);
    expect(r.minDistance).toBeGreaterThanOrEqual(CB_MIN_DISTANCE);
  });

  it('fails a red/green palette and flags the accent pair', () => {
    const r = auditPaletteCB(UNSAFE);
    expect(r.safe).toBe(false);
    expect(r.minDistance).toBeLessThan(CB_MIN_DISTANCE);
    // Worst pair must be one of the accent-vs-accent2 family under a
    // red-green deficiency (deutan or protan).
    const pair = [r.worstPair.a, r.worstPair.b].sort().join(',');
    expect(pair).toBe('accent,accent2');
    expect(['deuteranopia', 'protanopia']).toContain(r.worstPair.type);
  });
});
