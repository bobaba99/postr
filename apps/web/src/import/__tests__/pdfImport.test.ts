/**
 * Tests for the pure helpers in pdfImport.ts that handle the
 * decoration-vs-figure classification problem. The pdfjs render path
 * itself is exercised by the manual e2e suite (browser-only).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyAsLogo,
  computeBBoxStats,
  computePixelSignaturePure,
  filterDecorationBBoxes,
  filterOrphanLabels,
  iconScore,
  medianBodyFontSize,
  mergeAdjacentBBoxes,
  splitLogoByWhitespacePure,
  type FigureBBox,
} from '../pdfImport';

/** Build a synthetic RGBA pixel array `w × h`. `paint` is called
 *  per pixel and should return [r, g, b, a]. White background by
 *  default; paint dark blocks where logos live. */
function makePixels(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number, number] = () => [
    255, 255, 255, 255,
  ],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

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

  it('drops icons smaller than 0.02% of page area', () => {
    // 0.5" × 0.5" = 0.25 in². Page area 1512 in². Fraction = 0.000165
    // < 0.0002 cutoff — dropped.
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
    // On a 12×18 letter poster (216 in²), 0.0002 × 216 = 0.043 in².
    // A 0.4" × 0.4" icon is 0.16 in² > 0.043 → kept here, but on a
    // 36×42 page (1512 in²), the same icon is below 0.0002 × 1512
    // = 0.302 in² → dropped. The same code handles both.
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
        cluster('Smith'),
        cluster('introduction', { items: { length: 1 } }),
      ],
      [],
    );
    expect(out.map((c) => c.text)).toEqual([
      'Methods',
      'Smith',
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
      [cluster('LABEL 1 2 3 X', { items: { length: 5 } })],
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
      // proximity gate (4 × 9pt = 36pt, floored at 24pt).
      [{ x: 100, y: 217, w: 200, h: 150 }],
    );
    expect(out).toHaveLength(0);
  });

  it('drops a "Figure N." caption sitting one blank line above a figure', () => {
    // Real-world layout: caption baseline 14pt above figure top.
    // proximity for 9pt text = 36pt, so 14pt gap is INSIDE the gate.
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
    const baseCaption = (_gap: number) =>
      cluster('Figure 1.', {
        bbox: { x: 100, y: 200, w: 60, h: 12 },
        fontSizePt: 9,
      });
    // Proximity for 9pt fontSize is max(9*4, 24) = 36pt.
    // Inside: figure starts 35pt below caption bottom (212 + 35 = 247).
    expect(
      filterOrphanLabels([baseCaption(35)], [{ x: 100, y: 247, w: 200, h: 150 }]),
    ).toHaveLength(0);
    // Outside: figure starts 40pt below caption bottom (212 + 40 = 252).
    expect(
      filterOrphanLabels([baseCaption(40)], [{ x: 100, y: 252, w: 200, h: 150 }]),
    ).toHaveLength(1);
  });

  it('keeps "Figure N." captions when no figure bbox is nearby', () => {
    const out = filterOrphanLabels(
      [cluster('Figure 1.', { bbox: { x: 100, y: 200, w: 60, h: 12 } })],
      // Figure bbox is 200pt away — well outside the new 36pt gate
      [{ x: 100, y: 450, w: 200, h: 150 }],
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

  it('signal 3: drops a tiny lowercase orphan when font is < 0.85× body median', () => {
    // Body median is 11pt; the orphan is 8pt → ratio 0.73 → DROP.
    const bodyMedian = 11;
    const out = filterOrphanLabels(
      [
        cluster('adni_mem', { fontSizePt: 8 }),
        cluster('var.1', { fontSizePt: 8 }),
        cluster('n=541', { fontSizePt: 8 }),
      ],
      [],
      bodyMedian,
    );
    expect(out).toHaveLength(0);
  });

  it('signal 3: keeps short body-size text (e.g. citations, stat notes)', () => {
    const out = filterOrphanLabels(
      [
        cluster('p < 0.05', { fontSizePt: 11 }), // body size — keep
        cluster('(Smith, 2023)', { fontSizePt: 11 }),
      ],
      [],
      11,
    );
    expect(out).toHaveLength(2);
  });

  it('signal 3: keeps multi-item paragraph clusters even if mean fontSize is small', () => {
    // A real body paragraph that pdfjs split into many items —
    // items.length > 3 means signal 3 won't fire.
    const out = filterOrphanLabels(
      [cluster('one two three', { fontSizePt: 8, items: { length: 12 } })],
      [],
      11,
    );
    expect(out).toHaveLength(1);
  });

  it('signal 3 is skipped when bodyFontSize is omitted', () => {
    const out = filterOrphanLabels(
      [cluster('adni_mem', { fontSizePt: 8 })],
      [],
      // no bodyFontSize → only signals 1+2 run; signal 1 needs uppercase
    );
    expect(out).toHaveLength(1);
  });
});

describe('medianBodyFontSize', () => {
  it('returns the item-weighted median', () => {
    // 1 small label (1 item @ 8pt) + 1 paragraph (50 items @ 11pt)
    // → weighted: 1×8 + 50×11 → median is 11.
    const out = medianBodyFontSize([
      { fontSizePt: 8, items: { length: 1 } },
      { fontSizePt: 11, items: { length: 50 } },
    ]);
    expect(out).toBe(11);
  });

  it('returns 0 for empty input', () => {
    expect(medianBodyFontSize([])).toBe(0);
  });

  it('ignores zero-fontSize clusters', () => {
    expect(
      medianBodyFontSize([
        { fontSizePt: 0, items: { length: 100 } },
        { fontSizePt: 11, items: { length: 5 } },
      ]),
    ).toBe(11);
  });

  it('caps single-cluster weight at 50 so one mega-paragraph doesn\'t dominate', () => {
    // Without the cap, a 1000-item 8pt cluster vs a 5-item 11pt
    // cluster would yield 8 (paragraph dominates). With the cap
    // at 50, 8pt contributes 50 weight, 11pt contributes 5 → median
    // is still 8 because 50 ≫ 5. The cap is a soft anti-dominance
    // guard, not a balancer; this test just locks behavior.
    expect(
      medianBodyFontSize([
        { fontSizePt: 8, items: { length: 1000 } },
        { fontSizePt: 11, items: { length: 5 } },
      ]),
    ).toBe(8);
  });
});

describe('splitLogoByWhitespacePure', () => {
  it('returns null for tiny canvases', () => {
    const data = makePixels(4, 4);
    expect(splitLogoByWhitespacePure(data, 4, 4)).toBeNull();
  });

  it('returns null below the SEGMENT_MIN_LONG_EDGE cutoff (cartoon size)', () => {
    // Synthetic 100×100 canvas with a clear horizontal whitespace
    // gap that WOULD split if larger. Long edge < 150 → guard
    // refuses. This is the people-icon profile from the benchmark.
    const data = makePixels(100, 100, (_x, y) => {
      const inGap = y >= 40 && y < 60;
      return inGap ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    expect(splitLogoByWhitespacePure(data, 100, 100)).toBeNull();
  });

  it('does split at the same gap pattern when long edge is ≥ 150', () => {
    // Same gap fraction as the cartoon test, but on a 200-tall
    // canvas. Long edge ≥ 150 → guard allows split.
    const data = makePixels(100, 200, (_x, y) => {
      const inGap = y >= 80 && y < 120;
      return inGap ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    expect(splitLogoByWhitespacePure(data, 100, 200)).not.toBeNull();
  });

  it('returns null for a single solid logo (no internal whitespace gap)', () => {
    // 100×100 mostly-dark canvas — no clear horizontal gap
    const data = makePixels(100, 100, () => [50, 50, 50, 255]);
    expect(splitLogoByWhitespacePure(data, 100, 100)).toBeNull();
  });

  it('splits two stacked logos with a clear horizontal whitespace band', () => {
    // 100w × 200h
    // - rows 0..79: dark logo A
    // - rows 80..119: pure white gap (20% of height — well over the
    //                                 6% MIN_GAP_FRACTION)
    // - rows 120..199: dark logo B
    const data = makePixels(100, 200, (_x, y) => {
      const inGap = y >= 80 && y < 120;
      return inGap ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    const subs = splitLogoByWhitespacePure(data, 100, 200);
    expect(subs).not.toBeNull();
    expect(subs!.length).toBe(2);
    // First sub-rect lives in the upper half; second in the lower
    expect(subs![0]!.y).toBeLessThan(80);
    expect(subs![1]!.y).toBeGreaterThanOrEqual(80);
  });

  it('splits three side-by-side logos with vertical whitespace columns', () => {
    // 300w × 100h
    // - cols 0..79: dark logo A
    // - cols 80..119: pure white gap
    // - cols 120..199: dark logo B
    // - cols 200..219: pure white gap
    // - cols 220..299: dark logo C
    const data = makePixels(300, 100, (x, _y) => {
      const inGap1 = x >= 80 && x < 120;
      const inGap2 = x >= 200 && x < 220;
      return inGap1 || inGap2 ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    const subs = splitLogoByWhitespacePure(data, 300, 100);
    expect(subs).not.toBeNull();
    expect(subs!.length).toBe(3);
  });

  it('does NOT split when the whitespace band is too thin', () => {
    // 100×200 with a 4px gap (2% of height < 6% MIN_GAP_FRACTION)
    const data = makePixels(100, 200, (_x, y) => {
      const inGap = y >= 98 && y < 102;
      return inGap ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    expect(splitLogoByWhitespacePure(data, 100, 200)).toBeNull();
  });

  it('ignores edge whitespace runs (padding around a single logo)', () => {
    // 100×200 with 30px white padding TOP and BOTTOM — not a gap
    // BETWEEN logos, just edge padding
    const data = makePixels(100, 200, (_x, y) => {
      const inEdge = y < 30 || y >= 170;
      return inEdge ? [255, 255, 255, 255] : [40, 40, 40, 255];
    });
    expect(splitLogoByWhitespacePure(data, 100, 200)).toBeNull();
  });

  it('treats fully-transparent pixels as whitespace', () => {
    // 100×200 with rows 80..119 fully transparent — same effect as
    // white pixels (logos exported with alpha channels)
    const data = makePixels(100, 200, (_x, y) => {
      const inGap = y >= 80 && y < 120;
      if (inGap) return [0, 0, 0, 0];
      return [40, 40, 40, 255];
    });
    const subs = splitLogoByWhitespacePure(data, 100, 200);
    expect(subs).not.toBeNull();
    expect(subs!.length).toBe(2);
  });

  it('tightens sub-rects to non-white content', () => {
    // 100×200, two stacked logos, each surrounded by some
    // whitespace within their own slice. Tightening should crop the
    // returned rect to just the dark content.
    const data = makePixels(100, 200, (_x, y) => {
      const inGap = y >= 80 && y < 120;
      if (inGap) return [255, 255, 255, 255];
      // Logo A occupies rows 10..70; logo B occupies rows 130..190
      const inA = y >= 10 && y < 70;
      const inB = y >= 130 && y < 190;
      return inA || inB ? [40, 40, 40, 255] : [255, 255, 255, 255];
    });
    const subs = splitLogoByWhitespacePure(data, 100, 200);
    expect(subs).not.toBeNull();
    expect(subs!.length).toBe(2);
    // Tightened first rect should start near y=10, not y=0
    expect(subs![0]!.y).toBeGreaterThanOrEqual(8);
    expect(subs![0]!.y).toBeLessThanOrEqual(12);
    // Second rect should start near y=130
    expect(subs![1]!.y).toBeGreaterThanOrEqual(128);
    expect(subs![1]!.y).toBeLessThanOrEqual(132);
  });
});

describe('computePixelSignaturePure + iconScore', () => {
  /** Build a synthetic canvas with N distinct colors painted in
   *  evenly-sized horizontal stripes. */
  function makeStripedCanvas(
    w: number,
    h: number,
    colors: Array<[number, number, number]>,
  ): Uint8ClampedArray {
    const stripe = Math.floor(h / colors.length);
    return makePixels(w, h, (_x, y) => {
      const idx = Math.min(colors.length - 1, Math.floor(y / stripe));
      const [r, g, b] = colors[idx]!;
      return [r, g, b, 255];
    });
  }

  /** Build a "text-bearing" canvas: alternating dark/light columns
   *  every 2px, simulating vertical strokes of letterforms. Low
   *  color count (2 dominant) BUT high edge density. */
  function makeTextLikeCanvas(w: number, h: number): Uint8ClampedArray {
    return makePixels(w, h, (x, _y) => {
      const dark = x % 4 < 2;
      return dark ? [20, 20, 20, 255] : [240, 240, 240, 255];
    });
  }

  it('cartoon profile (3 flat colors, smooth stripes) → high iconScore', () => {
    const data = makeStripedCanvas(80, 80, [
      [255, 255, 255],
      [40, 40, 40],
      [200, 200, 200],
    ]);
    const sig = computePixelSignaturePure(data, 80, 80);
    expect(sig.dominantColors).toBeLessThanOrEqual(4);
    expect(sig.edgeDensity).toBeLessThan(0.04);
    expect(iconScore(sig)).toBe(0.9);
  });

  it('text-bearing logo profile (few colors, MANY edges) → iconScore 0', () => {
    // Mimics a wordmark logo: 2 dominant colors, but vertical
    // strokes every 2px → edge density ≥ 25%
    const data = makeTextLikeCanvas(80, 80);
    const sig = computePixelSignaturePure(data, 80, 80);
    expect(sig.dominantColors).toBeLessThanOrEqual(4);
    expect(sig.edgeDensity).toBeGreaterThan(0.1);
    expect(iconScore(sig)).toBe(0); // saved by edge-density signal
  });

  it('chart profile (many colors) → iconScore 0', () => {
    // 30 distinct colors → > 6 buckets → never flagged
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 30; i++) {
      const v = Math.floor((i * 250) / 30);
      colors.push([v, v, v]);
    }
    const data = makeStripedCanvas(80, 80, colors);
    const sig = computePixelSignaturePure(data, 80, 80);
    expect(sig.dominantColors).toBeGreaterThan(6);
    expect(iconScore(sig)).toBe(0);
  });

  it('treats fully-transparent pixels as not-an-icon (no signal)', () => {
    const data = makePixels(60, 60, () => [0, 0, 0, 0]);
    const sig = computePixelSignaturePure(data, 60, 60);
    expect(sig.dominantColors).toBe(0);
    expect(iconScore(sig)).toBe(0);
  });

  it('ignores anti-aliasing noise (1px dot of a 4th color does not count)', () => {
    const data = makePixels(100, 100, (x, y) => {
      if (x === 0 && y === 0) return [10, 200, 50, 255]; // 1px noise
      const stripe = y < 33 ? 0 : y < 66 ? 1 : 2;
      const palette: Array<[number, number, number]> = [
        [255, 255, 255],
        [40, 40, 40],
        [200, 200, 200],
      ];
      const [r, g, b] = palette[stripe]!;
      return [r, g, b, 255];
    });
    const sig = computePixelSignaturePure(data, 100, 100);
    expect(sig.dominantColors).toBe(3);
    expect(iconScore(sig)).toBe(0.9);
  });

  it('handles empty input', () => {
    const sig = computePixelSignaturePure(new Uint8ClampedArray(0), 0, 0);
    expect(sig).toEqual({ dominantColors: 0, edgeDensity: 0 });
    expect(iconScore(sig)).toBe(0);
  });

  describe('iconScore tiers', () => {
    it('tier 0.6 — 5 colors, low edges', () => {
      expect(
        iconScore({ dominantColors: 5, edgeDensity: 0.05 }),
      ).toBe(0.6);
    });
    it('tier 0.3 — 6 colors, medium edges', () => {
      expect(
        iconScore({ dominantColors: 6, edgeDensity: 0.07 }),
      ).toBe(0.3);
    });
    it('zeroes out when edges climb above 8% (text content)', () => {
      expect(
        iconScore({ dominantColors: 3, edgeDensity: 0.1 }),
      ).toBe(0);
    });
  });
});
