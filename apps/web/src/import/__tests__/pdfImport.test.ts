/**
 * Tests for the pure helpers in pdfImport.ts that handle the
 * decoration-vs-figure classification problem. The pdfjs render path
 * itself is exercised by the manual e2e suite (browser-only).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyAsLogo,
  filterDecorationBBoxes,
  mergeAdjacentBBoxes,
  type FigureBBox,
} from '../pdfImport';

const PT = 72;

function bbox(xIn: number, yIn: number, wIn: number, hIn: number): FigureBBox {
  return { x: xIn * PT, y: yIn * PT, w: wIn * PT, h: hIn * PT };
}

describe('filterDecorationBBoxes', () => {
  it('keeps reasonably-sized figures', () => {
    const out = filterDecorationBBoxes([bbox(2, 2, 5, 4), bbox(10, 10, 3, 2)]);
    expect(out).toHaveLength(2);
  });

  it('drops icons smaller than 1" in both dimensions', () => {
    // 0.5" × 0.5" decorative icon — dropped.
    const out = filterDecorationBBoxes([bbox(2, 2, 0.5, 0.5)]);
    expect(out).toHaveLength(0);
  });

  it('keeps tall narrow figures and wide short figures', () => {
    // 0.5" × 4" tall sidebar marker — kept (one dim ≥ 1").
    // 4" × 0.5" wide caption strip — kept.
    const out = filterDecorationBBoxes([
      bbox(2, 2, 0.5, 4),
      bbox(2, 8, 4, 0.5),
    ]);
    expect(out).toHaveLength(2);
  });

  it('drops hairlines with extreme aspect ratios', () => {
    // 0.05" × 5" hairline divider — kept by min-size check (5 > 1) but
    // dropped by aspect filter.
    const out = filterDecorationBBoxes([bbox(2, 2, 5, 0.05)]);
    expect(out).toHaveLength(0);
  });
});

describe('mergeAdjacentBBoxes', () => {
  it('returns an empty array on empty input', () => {
    expect(mergeAdjacentBBoxes([], 30)).toEqual([]);
  });

  it('merges bboxes within gap distance into one union bbox', () => {
    // Two halves of a single plot, 0.2" apart horizontally.
    const out = mergeAdjacentBBoxes(
      [bbox(2, 2, 3, 3), bbox(5.2, 2, 3, 3)],
      0.4 * PT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBeCloseTo(2 * PT);
    expect(out[0]!.w).toBeCloseTo(6.2 * PT);
  });

  it('keeps bboxes apart when gap exceeds threshold', () => {
    // 2" apart horizontally — well above the 0.4" merge threshold.
    const out = mergeAdjacentBBoxes(
      [bbox(2, 2, 3, 3), bbox(7, 2, 3, 3)],
      0.4 * PT,
    );
    expect(out).toHaveLength(2);
  });

  it('chains transitively (a-b touch, b-c touch → all one cluster)', () => {
    const out = mergeAdjacentBBoxes(
      [bbox(0, 0, 2, 2), bbox(2.1, 0, 2, 2), bbox(4.2, 0, 2, 2)],
      0.3 * PT,
    );
    expect(out).toHaveLength(1);
  });
});

describe('classifyAsLogo', () => {
  // Page-pt height for a 36×48 portrait poster.
  const pageH = 48 * PT;

  it('classifies a small image in the upper area as a logo', () => {
    // 1" × 1" image at y=0.5", h=1" → top edge at 0.5", bottom at 1.5"
    // Upper-zone threshold: 48 × 0.18 ≈ 8.64". Both fit.
    expect(classifyAsLogo(bbox(2, 0.5, 1, 1), pageH)).toBe(true);
  });

  it('does NOT classify a large hero image in the upper area as a logo', () => {
    // 12" × 6" big top figure — too large to be a logo.
    expect(classifyAsLogo(bbox(2, 0.5, 12, 6), pageH)).toBe(false);
  });

  it('does NOT classify a small image in the body region as a logo', () => {
    // Same small size but at y=20" — well below the upper zone.
    expect(classifyAsLogo(bbox(2, 20, 1, 1), pageH)).toBe(false);
  });
});
