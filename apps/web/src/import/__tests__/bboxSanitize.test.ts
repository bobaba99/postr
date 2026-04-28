/**
 * Tests for the vision-OCR bbox sanitizer.
 *
 * Each helper has its own block; `sanitizeFigureBBoxes` chains them
 * end-to-end and exercises the realistic case where the LLM
 * returned pixel coords + a few junk shapes + duplicates.
 */
import { describe, expect, it } from 'vitest';
import {
  bboxIoU,
  clampBBoxToPage,
  countCaptionMentions,
  dedupeOverlappingBBoxes,
  dropDecorativeBBoxes,
  inferPtScale,
  isFiniteBBox,
  sanitizeFigureBBoxes,
  scaleBBox,
} from '../bboxSanitize';

// 36×48" portrait poster — the sizes the test posters land on.
const PAGE_W = 36 * 72; // 2592 pt
const PAGE_H = 48 * 72; // 3456 pt

describe('isFiniteBBox', () => {
  it('accepts a normal bbox', () => {
    expect(isFiniteBBox({ x: 1, y: 2, w: 3, h: 4 })).toBe(true);
  });

  it('rejects nullish, missing, or NaN fields', () => {
    expect(isFiniteBBox(null)).toBe(false);
    expect(isFiniteBBox(undefined)).toBe(false);
    expect(isFiniteBBox({})).toBe(false);
    expect(isFiniteBBox({ x: 1, y: 2, w: 3 })).toBe(false);
    expect(isFiniteBBox({ x: NaN, y: 0, w: 1, h: 1 })).toBe(false);
    expect(isFiniteBBox({ x: Infinity, y: 0, w: 1, h: 1 })).toBe(false);
    expect(isFiniteBBox({ x: '1', y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe('inferPtScale', () => {
  it('returns 1 when boxes already fit in page-pt', () => {
    const boxes = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 1000, y: 1000, w: 500, h: 500 },
    ];
    expect(inferPtScale(boxes, PAGE_W, PAGE_H)).toBe(1);
  });

  it('detects pixel-space and returns the correction scale', () => {
    // LLM saw a 1536×2048 px downscaled image and reported in
    // pixels even though we asked for pt. Ratio max = 2048 / 3456 ≈ 0.59
    // — wait: pixel-space implies BIGGER coords than pt. Use a
    // 2× upscale: maxX=5184 (2× of 2592), maxY=6912 (2× of 3456).
    const boxes = [
      { x: 0, y: 0, w: 5184, h: 6912 },
    ];
    const scale = inferPtScale(boxes, PAGE_W, PAGE_H);
    // 2592 / 5184 = 0.5, 3456 / 6912 = 0.5 — both axes match,
    // result is 0.5.
    expect(scale).toBeCloseTo(0.5, 3);
  });

  it('returns 1 when boxes only marginally exceed the page (≤ 1.4×)', () => {
    // 1.2× over — likely just an off-by-ε bbox spilling past the
    // edge, not a coord-space mismatch.
    const boxes = [{ x: 0, y: 0, w: PAGE_W * 1.2, h: PAGE_H * 0.5 }];
    expect(inferPtScale(boxes, PAGE_W, PAGE_H)).toBe(1);
  });

  it('handles empty input', () => {
    expect(inferPtScale([], PAGE_W, PAGE_H)).toBe(1);
  });
});

describe('scaleBBox', () => {
  it('returns the same object when scale is 1', () => {
    const b = { x: 1, y: 2, w: 3, h: 4 };
    expect(scaleBBox(b, 1)).toBe(b);
  });

  it('multiplies all four fields when scaling', () => {
    expect(scaleBBox({ x: 10, y: 20, w: 30, h: 40 }, 0.5)).toEqual({
      x: 5,
      y: 10,
      w: 15,
      h: 20,
    });
  });
});

describe('clampBBoxToPage', () => {
  it('passes through an in-bounds bbox', () => {
    const b = { x: 100, y: 100, w: 500, h: 500 };
    expect(clampBBoxToPage(b, PAGE_W, PAGE_H)).toEqual(b);
  });

  it('clips a bbox that overhangs the right + bottom edges', () => {
    const b = { x: PAGE_W - 100, y: PAGE_H - 50, w: 300, h: 200 };
    expect(clampBBoxToPage(b, PAGE_W, PAGE_H)).toEqual({
      x: PAGE_W - 100,
      y: PAGE_H - 50,
      w: 100,
      h: 50,
    });
  });

  it('returns null for a bbox that is entirely off-page', () => {
    expect(
      clampBBoxToPage({ x: PAGE_W + 100, y: 0, w: 50, h: 50 }, PAGE_W, PAGE_H),
    ).toBeNull();
  });

  it('returns null for a zero-area bbox', () => {
    expect(
      clampBBoxToPage({ x: 0, y: 0, w: 0, h: 100 }, PAGE_W, PAGE_H),
    ).toBeNull();
    expect(
      clampBBoxToPage({ x: 100, y: 100, w: 100, h: 0.5 }, PAGE_W, PAGE_H),
    ).toBeNull();
  });

  it('normalizes negative widths and heights', () => {
    // (x2, y2) given as (x, y) with negative w/h — i.e. the LLM
    // returned a bbox going up-left instead of down-right.
    const b = { x: 200, y: 200, w: -100, h: -50 };
    expect(clampBBoxToPage(b, PAGE_W, PAGE_H)).toEqual({
      x: 100,
      y: 150,
      w: 100,
      h: 50,
    });
  });

  it('clips a negative-origin bbox to the page edge', () => {
    expect(
      clampBBoxToPage({ x: -50, y: -50, w: 200, h: 200 }, PAGE_W, PAGE_H),
    ).toEqual({ x: 0, y: 0, w: 150, h: 150 });
  });
});

describe('dropDecorativeBBoxes', () => {
  it('drops boxes smaller than 0.3% of page area', () => {
    // 0.2% area
    const tiny = { x: 0, y: 0, w: 50, h: 50 };
    expect(dropDecorativeBBoxes([tiny], PAGE_W, PAGE_H)).toEqual([]);
  });

  it('keeps boxes above the 0.3% threshold', () => {
    // 0.4% area
    const ok = { x: 0, y: 0, w: 200, h: 180 };
    expect(dropDecorativeBBoxes([ok], PAGE_W, PAGE_H)).toEqual([ok]);
  });

  it('drops underline-shaped boxes (aspect > 25:1)', () => {
    const rule = { x: 0, y: 0, w: 2000, h: 50 }; // 40:1
    expect(dropDecorativeBBoxes([rule], PAGE_W, PAGE_H)).toEqual([]);
  });

  it('keeps reasonable-aspect figure boxes', () => {
    const figure = { x: 0, y: 0, w: 1200, h: 800 }; // 1.5:1
    expect(dropDecorativeBBoxes([figure], PAGE_W, PAGE_H)).toEqual([figure]);
  });
});

describe('bboxIoU', () => {
  it('returns 0 for non-overlapping boxes', () => {
    expect(
      bboxIoU(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 200, y: 200, w: 100, h: 100 },
      ),
    ).toBe(0);
  });

  it('returns 1 for identical boxes', () => {
    const b = { x: 10, y: 10, w: 100, h: 100 };
    expect(bboxIoU(b, b)).toBe(1);
  });

  it('computes the standard IoU for overlapping boxes', () => {
    // a = 100×100 at (0,0); b = 100×100 at (50,50).
    // intersection = 50×50 = 2500
    // union = 10000 + 10000 - 2500 = 17500
    // IoU = 2500 / 17500 ≈ 0.1428
    const iou = bboxIoU(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 50, y: 50, w: 100, h: 100 },
    );
    expect(iou).toBeCloseTo(2500 / 17500, 3);
  });
});

describe('dedupeOverlappingBBoxes', () => {
  it('keeps non-overlapping boxes intact', () => {
    const boxes = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 500, y: 500, w: 100, h: 100 },
    ];
    expect(dedupeOverlappingBBoxes(boxes)).toEqual(boxes);
  });

  it('merges two near-identical boxes (IoU > 0.55) into their union', () => {
    const a = { x: 100, y: 100, w: 200, h: 200 };
    const b = { x: 110, y: 110, w: 200, h: 200 };
    const out = dedupeOverlappingBBoxes([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ x: 100, y: 100, w: 210, h: 210 });
  });

  it('keeps two boxes that overlap below the IoU threshold', () => {
    // ~14% IoU — figures sitting close together but not the same.
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 50, y: 50, w: 100, h: 100 };
    expect(dedupeOverlappingBBoxes([a, b])).toHaveLength(2);
  });
});

describe('sanitizeFigureBBoxes (end-to-end)', () => {
  it('drops invalid + decorative + duplicate inputs in one call', () => {
    const raw = [
      // valid figure
      { x: 100, y: 100, w: 800, h: 600 },
      // duplicate of the above (slightly shifted)
      { x: 110, y: 110, w: 800, h: 600 },
      // valid second figure
      { x: 1500, y: 100, w: 700, h: 500 },
      // tiny decoration (drop)
      { x: 0, y: 0, w: 30, h: 30 },
      // underline-shaped rule (drop)
      { x: 0, y: 1000, w: 2000, h: 30 },
      // out-of-bounds (drop)
      { x: 5000, y: 5000, w: 100, h: 100 },
      // malformed (drop)
      { x: NaN, y: 0, w: 100, h: 100 },
      null,
      'figure',
    ];
    const out = sanitizeFigureBBoxes(raw, PAGE_W, PAGE_H, 1);
    expect(out).toHaveLength(2);
    // Both surviving figures should have meaningful area
    out.forEach((b) => {
      expect(b.w * b.h).toBeGreaterThan(0.003 * PAGE_W * PAGE_H);
    });
  });

  it('applies the pixel-to-pt scale before clamping + dedup', () => {
    // LLM returned in 2× pixel coords. After scaling by 0.5,
    // both boxes fit in-page and dedupe to one.
    const raw = [
      { x: 200, y: 200, w: 1600, h: 1200 },
      { x: 220, y: 220, w: 1600, h: 1200 },
    ];
    const out = sanitizeFigureBBoxes(raw, PAGE_W, PAGE_H, 0.5);
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBeCloseTo(100, 0);
    expect(out[0]!.y).toBeCloseTo(100, 0);
  });

  it('returns [] for an all-junk input', () => {
    const raw = [null, undefined, { not: 'a bbox' }, { x: 0 }];
    expect(sanitizeFigureBBoxes(raw, PAGE_W, PAGE_H, 1)).toEqual([]);
  });
});

describe('countCaptionMentions', () => {
  it('counts unique Figure / Table mentions', () => {
    const blocks = [
      { text: 'Figure 1. Caption text.' },
      { text: 'See Figure 2 for details.' },
      { text: 'Table 3 shows the loadings.' },
    ];
    expect(countCaptionMentions(blocks)).toBe(3);
  });

  it('dedupes across blocks (Figure 1 mentioned twice = 1)', () => {
    const blocks = [
      { text: 'Figure 1. Caption.' },
      { text: 'As shown in Figure 1, ...' },
    ];
    expect(countCaptionMentions(blocks)).toBe(1);
  });

  it('matches Fig. and Tbl. abbreviations', () => {
    const blocks = [
      { text: 'See Fig. 4 and Tbl. 2.' },
    ];
    expect(countCaptionMentions(blocks)).toBe(2);
  });

  it('handles missing or non-string text safely', () => {
    expect(countCaptionMentions(undefined)).toBe(0);
    expect(countCaptionMentions([])).toBe(0);
    expect(countCaptionMentions([{}, { text: '' }])).toBe(0);
  });

  it('does not match unrelated digits', () => {
    expect(
      countCaptionMentions([{ text: 'p < .05, n = 200, beta = 0.42' }]),
    ).toBe(0);
  });
});
