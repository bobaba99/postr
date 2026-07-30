/**
 * Series palette tests.
 *
 * The point of a tested palette is the RELATIONSHIP between its
 * colours, so these tests guard the properties that make the set
 * usable rather than pinning individual hexes for their own sake:
 * declared sizes, no duplicate colours within a set, luminance spread
 * wide enough to survive greyscale, and stable ids.
 */
import { describe, expect, it } from 'vitest';
import {
  SERIES_PALETTES,
  SERIES_PALETTES_2,
  SERIES_PALETTES_3,
  SERIES_PALETTES_4,
  SERIES_PALETTES_6,
  SERIES_PALETTES_8,
  findSeriesPalette,
  seriesPalettesFor,
} from '../seriesPalettes';

const HEX = /^#[0-9a-f]{6}$/;

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const channels = [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

describe('series palettes', () => {
  it('declares the sizes it claims', () => {
    for (const [size, set] of [
      [2, SERIES_PALETTES_2],
      [3, SERIES_PALETTES_3],
      [4, SERIES_PALETTES_4],
      [6, SERIES_PALETTES_6],
      [8, SERIES_PALETTES_8],
    ] as const) {
      for (const p of set) {
        expect(p.colors, `${p.id} should have ${size} colours`).toHaveLength(size);
      }
    }
  });

  it('uses well-formed lowercase hex throughout', () => {
    for (const p of SERIES_PALETTES) {
      for (const c of p.colors) {
        expect(c, `${p.id} colour ${c}`).toMatch(HEX);
      }
    }
  });

  it('has no repeated colour inside a palette', () => {
    // A repeat means two series draw identically — the figure is
    // unreadable regardless of how good the other colours are.
    for (const p of SERIES_PALETTES) {
      expect(new Set(p.colors).size, `${p.id} has a duplicate colour`).toBe(
        p.colors.length,
      );
    }
  });

  it('gives every palette ids that are unique and stable-looking', () => {
    const ids = SERIES_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('spreads luminance so sets survive greyscale printing', () => {
    // Hue alone disappears in mono and under severe CVD. Every palette
    // here should span a real luminance range, not just rotate hue at
    // one brightness.
    for (const p of SERIES_PALETTES) {
      const l = p.colors.map(luminance);
      const spread = Math.max(...l) - Math.min(...l);
      expect(spread, `${p.id} luminance spread ${spread.toFixed(3)}`).toBeGreaterThan(0.15);
    }
  });

  it('orders sequential and grayscale ramps monotonically', () => {
    // An ordered palette whose luminance wanders is not ordered — the
    // reader cannot tell which end is "more".
    const ramps = SERIES_PALETTES.filter(
      (p) => p.kind === 'sequential' || p.kind === 'grayscale',
    );
    expect(ramps.length).toBeGreaterThan(0);
    for (const p of ramps) {
      const l = p.colors.map(luminance);
      const ascending = l.every((v, i) => i === 0 || v >= (l[i - 1] ?? 0));
      const descending = l.every((v, i) => i === 0 || v <= (l[i - 1] ?? 1));
      expect(ascending || descending, `${p.id} luminance is not monotonic`).toBe(true);
    }
  });
});

describe('findSeriesPalette', () => {
  it('finds a known palette', () => {
    expect(findSeriesPalette('grayscale-6')?.colors).toHaveLength(6);
  });

  it('returns null for an unknown id rather than a silent fallback', () => {
    // A stale id should surface, not redraw the chart in colours the
    // author never chose.
    expect(findSeriesPalette('no-such-palette')).toBeNull();
  });
});

describe('seriesPalettesFor', () => {
  it('puts exact-size matches first', () => {
    const three = seriesPalettesFor(3);
    expect(three[0]?.colors).toHaveLength(3);
  });

  it('offers only palettes wide enough for the series count', () => {
    for (const p of seriesPalettesFor(6)) {
      expect(p.colors.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('falls back to the widest sets when nothing fits', () => {
    // 12 series exceeds every palette; the caller still needs colours
    // to cycle rather than an empty list.
    const many = seriesPalettesFor(12);
    expect(many.length).toBeGreaterThan(0);
    expect(many.every((p) => p.colors.length === 6)).toBe(true);
  });

  it('returns everything for a non-positive count', () => {
    expect(seriesPalettesFor(0)).toHaveLength(SERIES_PALETTES.length);
  });
});
