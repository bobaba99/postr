import { describe, expect, it } from 'vitest';
import type { Palette } from '@postr/shared';
import { resolveSeriesColors } from '../chartColors';
import { findSeriesPalette } from '../seriesPalettes';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};
const slots = ['accent', 'accent2', 'primary', 'muted'];

describe('resolveSeriesColors', () => {
  it('uses poster slots when no palette id is given', () => {
    const out = resolveSeriesColors(undefined, 2, slots, palette);
    expect(out[0]).toBe('#2f6f8f'); // accent
    expect(out[1]).toBe('#b0533a'); // accent2
  });

  it('uses the fixed science palette when the id resolves', () => {
    const p = findSeriesPalette('qualitative-6')!;
    const out = resolveSeriesColors('qualitative-6', 6, slots, palette);
    expect(out).toEqual([...p.colors]);
  });

  it('truncates a wider palette to the series count', () => {
    const p = findSeriesPalette('qualitative-6')!;
    const out = resolveSeriesColors('qualitative-6', 3, slots, palette);
    expect(out).toEqual(p.colors.slice(0, 3));
  });

  it('falls back to slots for a stale/unknown id', () => {
    const out = resolveSeriesColors('no-such-palette', 2, slots, palette);
    expect(out).toEqual(resolveSeriesColors(undefined, 2, slots, palette));
  });

  it('cycles with a white-mix when the series count exceeds the set', () => {
    // A 3-colour palette drawn for 4 series: 4th repeats colour 0,
    // lightened, never an exact duplicate of colour 0.
    const p = findSeriesPalette('blue-orange-gray')!; // 3 colours
    const out = resolveSeriesColors('blue-orange-gray', 4, slots, palette);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 3)).toEqual([...p.colors]);
    expect(out[3]).not.toBe(out[0]);
  });

  it('always returns exactly `count` colours', () => {
    expect(resolveSeriesColors('qualitative-6', 1, slots, palette)).toHaveLength(1);
    expect(resolveSeriesColors(undefined, 5, slots, palette)).toHaveLength(5);
  });
});
