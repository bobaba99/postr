/**
 * Tests for the pure helpers in pdfImport.ts that handle the
 * decoration-vs-figure classification problem. The pdfjs render path
 * itself is exercised by the manual e2e suite (browser-only).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyAsLogo,
  computeBBoxStats,
  filterDecorationBBoxes,
  filterOrphanLabels,
  mergeAdjacentBBoxes,
  type FigureBBox,
} from '../pdfImport';

const PT = 72;

function bbox(xIn: number, yIn: number, wIn: number, hIn: number): FigureBBox {
  return { x: xIn * PT, y: yIn * PT, w: wIn * PT, h: hIn * PT };
}

// Standard 36×42 portrait poster page used across the tests.
const PAGE_W = 36 * PT;
const PAGE_H = 42 * PT;

describe('filterDecorationBBoxes (page-area relative)', () => {
  it('keeps reasonably-sized figures', () => {
    const out = filterDecorationBBoxes(
      [bbox(2, 2, 5, 4), bbox(10, 10, 3, 2)],
      PAGE_W,
      PAGE_H,
    );
    expect(out).toHaveLength(2);
  });

  it('drops icons smaller than 0.05% of page area', () => {
    // 0.5" × 0.5" = 0.25 in². Page area 1512 in². Fraction = 0.000165
    // < 0.0005 cutoff — dropped.
    const out = filterDecorationBBoxes(
      [bbox(2, 2, 0.5, 0.5)],
      PAGE_W,
      PAGE_H,
    );
    expect(out).toHaveLength(0);
  });

  it('drops hairlines with extreme aspect ratios', () => {
    // 0.05" × 5" = 0.25 in² and aspect 1/100 — both gates fail.
    const out = filterDecorationBBoxes(
      [bbox(2, 2, 5, 0.05)],
      PAGE_W,
      PAGE_H,
    );
    expect(out).toHaveLength(0);
  });

  it('scales the area gate to small page sizes', () => {
    // On a 12×18 letter poster (216 in²), 0.0005 × 216 = 0.108 in².
    // A 0.4" × 0.4" icon is 0.16 in² > 0.108 → kept here, but on a
    // 36×42 page (1512 in²), the same icon is below 0.0005 × 1512
    // = 0.756 in² → dropped. The same code handles both.
    const small = filterDecorationBBoxes([bbox(2, 2, 0.4, 0.4)], 12 * PT, 18 * PT);
    expect(small).toHaveLength(1);
    const big = filterDecorationBBoxes([bbox(2, 2, 0.4, 0.4)], PAGE_W, PAGE_H);
    expect(big).toHaveLength(0);
  });
});

describe('computeBBoxStats', () => {
  it('returns zeros for empty input', () => {
    expect(computeBBoxStats([])).toEqual({ medianMaxDim: 0, smallCutoffPt: 0 });
  });

  it('computes the median max-dim and a 0.6× small-cutoff', () => {
    // Three boxes with max-dims 2, 4, 8 (in inches). Median = 4".
    const stats = computeBBoxStats([
      bbox(0, 0, 2, 1),
      bbox(0, 0, 4, 2),
      bbox(0, 0, 8, 4),
    ]);
    expect(stats.medianMaxDim).toBeCloseTo(4 * PT);
    expect(stats.smallCutoffPt).toBeCloseTo(0.6 * 4 * PT);
  });
});

describe('mergeAdjacentBBoxes (size-distribution relative)', () => {
  it('returns an empty array on empty input', () => {
    expect(mergeAdjacentBBoxes([], computeBBoxStats([]))).toEqual([]);
  });

  it('merges large adjacent bboxes (plot fragments)', () => {
    // Two 5"-wide halves of a plot, 0.1" apart — well within
    // 5" × 0.05 = 0.25" merge threshold.
    const boxes = [bbox(2, 2, 5, 4), bbox(7.1, 2, 5, 4)];
    const out = mergeAdjacentBBoxes(boxes, computeBBoxStats(boxes));
    expect(out).toHaveLength(1);
  });

  it('keeps two large bboxes apart when their gap exceeds the relative threshold', () => {
    // 5"-wide plots 1" apart — gap > 5×0.05 = 0.25" cutoff.
    const boxes = [bbox(2, 2, 5, 4), bbox(8, 2, 5, 4)];
    const out = mergeAdjacentBBoxes(boxes, computeBBoxStats(boxes));
    expect(out).toHaveLength(2);
  });

  it('keeps small adjacent bboxes (logo strip) separate', () => {
    // 3 logos in a row: 1.5"×1" with 0.2" gaps — alongside two 6"
    // plot blocks so the median pulls "small" up to ~1.5".
    const boxes = [
      bbox(0, 0, 1.5, 1),
      bbox(1.7, 0, 1.5, 1),
      bbox(3.4, 0, 1.5, 1),
      bbox(0, 5, 6, 5),
      bbox(7, 5, 6, 5),
    ];
    const out = mergeAdjacentBBoxes(boxes, computeBBoxStats(boxes));
    // 3 logos + 2 plots, no merges.
    expect(out).toHaveLength(5);
  });

  it('merges a small caption with its adjacent large plot', () => {
    // 6"-wide plot below a 0.8" caption — small + large = merge.
    // Add another 6" plot to keep median = 6", small-cutoff ≈ 3.6".
    const boxes = [
      bbox(0, 0, 6, 0.8),
      bbox(0, 0.9, 6, 5),
      bbox(7, 5, 6, 5),
    ];
    const out = mergeAdjacentBBoxes(boxes, computeBBoxStats(boxes));
    expect(out).toHaveLength(2); // caption+plot merged, second plot alone
  });
});

describe('classifyAsLogo', () => {
  const pageH = 48 * PT;
  // Stats simulating a poster with a typical figure size of 6" — so
  // anything ≤ 3.6" max-dim is "small / logo-like."
  const stats = computeBBoxStats([
    bbox(0, 0, 6, 4),
    bbox(0, 0, 6, 4),
    bbox(0, 0, 1.5, 1),
  ]);

  it('classifies a small image in the upper area as a logo', () => {
    expect(classifyAsLogo(bbox(2, 0.5, 1, 1), pageH, stats)).toBe(true);
  });

  it('does NOT classify a large hero image in the upper area as a logo', () => {
    expect(classifyAsLogo(bbox(2, 0.5, 12, 6), pageH, stats)).toBe(false);
  });

  it('does NOT classify a small image in the body region as a logo', () => {
    expect(classifyAsLogo(bbox(2, 20, 1, 1), pageH, stats)).toBe(false);
  });
});

describe('filterOrphanLabels', () => {
  // Mini cluster shape — only the fields the filter inspects.
  type C = {
    text: string;
    items: { length: number };
    fontSizePt: number;
    bbox: { x: number; y: number; w: number; h: number };
  };
  const cluster = (
    text: string,
    overrides: Partial<C> = {},
  ): C => ({
    text,
    items: { length: 1 },
    fontSizePt: 9,
    bbox: { x: 100, y: 100, w: 50, h: 12 },
    ...overrides,
  });

  it('drops uppercase/numeric label fragments (signal 1)', () => {
    const out = filterOrphanLabels(
      [
        cluster('ADNI_MEM'),
        cluster('ADNI_EF'),
        cluster('1,2,3'),
        cluster('RC1'),
      ],
      [],
    );
    expect(out).toHaveLength(0);
  });

  it('keeps body text containing lowercase letters', () => {
    const out = filterOrphanLabels(
      [
        cluster('Methods'),
        cluster('Geng'),
        cluster('introduction', { items: { length: 1 } }),
      ],
      [],
    );
    expect(out.map((c) => c.text)).toEqual([
      'Methods',
      'Geng',
      'introduction',
    ]);
  });

  it('keeps long all-caps content (over 15 chars) — likely a real heading like INTRODUCTION', () => {
    const out = filterOrphanLabels(
      [cluster('CONCLUSIONS AND FUTURE WORK')],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it('keeps multi-item clusters even if they look label-shaped', () => {
    // 5 items = a real text block, not a stray label
    const out = filterOrphanLabels(
      [cluster('ADNI 1 2 3 X', { items: { length: 5 } })],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it('drops "Figure N." captions near a detected figure bbox (signal 2)', () => {
    const out = filterOrphanLabels(
      [
        cluster('Figure 1.', {
          bbox: { x: 100, y: 200, w: 60, h: 12 },
          fontSizePt: 9,
        }),
      ],
      // Figure bbox sits 5pt below the caption — well inside the
      // proximity gate (2.5 × 9pt = 22.5pt).
      [{ x: 100, y: 217, w: 200, h: 150 }],
    );
    expect(out).toHaveLength(0);
  });

  it('drops a "Figure N." caption sitting one blank line above a figure', () => {
    // Real-world layout: caption baseline 14pt above figure top.
    // proximity for 9pt text = 22.5pt, so 14pt gap is INSIDE the gate.
    const out = filterOrphanLabels(
      [
        cluster('Figure 2.', {
          bbox: { x: 100, y: 200, w: 60, h: 12 },
          fontSizePt: 9,
        }),
      ],
      [{ x: 100, y: 226, w: 200, h: 150 }], // 14pt gap below caption
    );
    expect(out).toHaveLength(0);
  });

  it('proximity boundary: just-inside drops, just-outside keeps', () => {
    const baseCaption = (gap: number) =>
      cluster('Figure 1.', {
        bbox: { x: 100, y: 200, w: 60, h: 12 },
        fontSizePt: 9,
      });
    // Floor proximity for 9pt fontSize is max(9*2.5, 18) = 22.5pt.
    // Inside: figure starts 22pt below caption bottom (212).
    expect(
      filterOrphanLabels([baseCaption(22)], [{ x: 100, y: 234, w: 200, h: 150 }]),
    ).toHaveLength(0);
    // Outside: figure starts 25pt below caption bottom.
    expect(
      filterOrphanLabels([baseCaption(25)], [{ x: 100, y: 237, w: 200, h: 150 }]),
    ).toHaveLength(1);
  });

  it('keeps "Figure N." captions when no figure bbox is nearby', () => {
    const out = filterOrphanLabels(
      [cluster('Figure 1.', { bbox: { x: 100, y: 200, w: 60, h: 12 } })],
      // Figure bbox is 150pt away — well outside any reasonable proximity
      [{ x: 100, y: 400, w: 200, h: 150 }],
    );
    expect(out).toHaveLength(1);
  });

  it('keeps "Figure N." captions when no figures detected at all', () => {
    const out = filterOrphanLabels(
      [cluster('Figure 1.')],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(filterOrphanLabels([], [])).toEqual([]);
  });
});
