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

import { pixelRatioFor } from '../thumbnails';

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
