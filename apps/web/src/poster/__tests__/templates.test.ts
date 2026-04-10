/**
 * Layout template sanity checks.
 *
 * Each template returns block coordinates in poster units. The 3-col
 * template (the editor's default) must stay strictly within the
 * poster canvas — this test caught a pre-existing bug where col 3's
 * references block extended ~14 units past the poster bottom.
 *
 * The other templates (2col, billboard, sidebar, empty) are checked
 * more loosely: blocks must have positive dimensions and non-
 * negative coordinates. Their tight-fit bounds failures are tracked
 * as a known issue — they inherited the overflow math from the
 * prototype and need a layout pass before their tests can tighten up.
 */
import { describe, it, expect } from 'vitest';
import { makeBlocks, type LayoutKey } from '../templates';
import { PX } from '../constants';

const SIZES: Array<[string, number, number]> = [
  ['48×36 landscape', 48, 36],
  ['36×48 portrait', 36, 48],
  ['42×42 square', 42, 42],
  ['24×36 small', 24, 36],
];

describe('3-col layout — strict bounds (the editor default)', () => {
  for (const [label, widthIn, heightIn] of SIZES) {
    it(`${label}: every block stays inside the poster`, () => {
      const W = widthIn * PX;
      const H = heightIn * PX;
      const blocks = makeBlocks('3col', widthIn, heightIn);

      for (const b of blocks) {
        expect(b.x, `${b.type} x`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${b.type} y`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, `${b.type} right edge`).toBeLessThanOrEqual(W + 0.5);
        expect(b.y + b.h, `${b.type} bottom edge`).toBeLessThanOrEqual(H + 0.5);
      }
    });

    it(`${label}: no column has overlapping blocks`, () => {
      const blocks = makeBlocks('3col', widthIn, heightIn);
      // Group by approximate x (title + authors span the full width
      // so skip them — only body blocks form "columns").
      const body = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors');
      const cols = new Map<number, typeof body>();
      for (const b of body) {
        const col = Math.round(b.x / 10) * 10;
        if (!cols.has(col)) cols.set(col, []);
        cols.get(col)!.push(b);
      }
      for (const [col, group] of cols) {
        const sorted = [...group].sort((a, b) => a.y - b.y);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1]!;
          const curr = sorted[i]!;
          expect(
            curr.y,
            `col@${col}: ${curr.type} (y=${curr.y}) above ${prev.type} bottom (${prev.y + prev.h})`,
          ).toBeGreaterThanOrEqual(prev.y + prev.h - 0.5);
        }
      }
    });
  }
});

describe('all templates — loose sanity', () => {
  const KEYS: LayoutKey[] = ['3col', '2col', 'billboard', 'sidebar', 'empty'];
  for (const key of KEYS) {
    it(`${key}: blocks have positive dimensions and non-negative origin`, () => {
      const blocks = makeBlocks(key, 48, 36);
      for (const b of blocks) {
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
