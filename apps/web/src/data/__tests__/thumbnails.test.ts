/**
 * Pins the extracted pixelRatioFor math (the 400px thumb and the
 * 2048px review capture share it). The DOM capture path itself is
 * verified manually — house pattern for canvas/DOM capture, same
 * coverage class as the pdfjs render path (see pdfImport.test.ts
 * header).
 */
import { describe, it, expect, vi } from 'vitest';

// thumbnails.ts imports the supabase singleton, which throws at module
// load without env vars (lib/supabase.ts:14-18) — mock it even though
// these tests never touch storage.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
}));

import { pixelRatioFor, reviewTargetWidthPx } from '../thumbnails';

describe('pixelRatioFor', () => {
  it('scales down for the 400px thumbnail', () => {
    expect(pixelRatioFor(1000, 400)).toBeCloseTo(0.4, 10);
  });

  it('scales up for the 2048px review capture', () => {
    expect(pixelRatioFor(1024, 2048)).toBe(2);
  });

  it('is 1 when the canvas already matches the target', () => {
    expect(pixelRatioFor(2048, 2048)).toBe(1);
  });

  it('passes fractional ratios through unrounded', () => {
    expect(pixelRatioFor(1200, 2048)).toBeCloseTo(2048 / 1200, 10);
  });
});

describe('reviewTargetWidthPx', () => {
  it('keeps the short edge at the audit minimum for a 3:1 landscape poster', () => {
    const targetWidthPx = reviewTargetWidthPx(3000, 1000);

    expect(targetWidthPx).toBe(3072);
    expect((1000 * targetWidthPx) / 3000).toBeGreaterThanOrEqual(1024);
  });

  it('keeps the existing long-edge target at the 2:1 boundary', () => {
    expect(reviewTargetWidthPx(2000, 1000)).toBe(2048);
  });

  it('keeps the existing long-edge target below a 2:1 aspect ratio', () => {
    expect(reviewTargetWidthPx(1600, 1000)).toBe(2048);
  });

  it('keeps both audit dimensions for a 1:3 portrait poster', () => {
    const targetWidthPx = reviewTargetWidthPx(1000, 3000);

    expect(targetWidthPx).toBe(1024);
    expect((3000 * targetWidthPx) / 1000).toBe(3072);
  });
});
