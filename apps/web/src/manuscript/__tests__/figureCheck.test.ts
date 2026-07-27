/**
 * Figure legibility gate — plan §4 non-negotiable #1. Because the
 * standalone route emits a printable file with no editor step, an
 * illegible figure that ships unflagged is the pipeline's worst
 * failure. These tests pin the thresholds and the flagging behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  FIGURE_DPI_PASS,
  FIGURE_DPI_WARN,
  checkFigure,
  computeFigureDpi,
  measureImage,
  statusForDpi,
} from '../figureCheck';

describe('computeFigureDpi', () => {
  it('reports DPI from the constraining axis (object-fit: contain)', () => {
    // A 1200x600 image in a 12in x 12in block is width-bound: it prints
    // 12in wide and 6in tall, so 100 DPI on both axes.
    expect(computeFigureDpi({ width: 1200, height: 600 }, 12, 12)).toBe(100);
  });

  it('is height-bound when the block is wider than the image aspect', () => {
    // 600x1200 in a 12x6 block prints 3in x 6in → 200 DPI.
    expect(computeFigureDpi({ width: 600, height: 1200 }, 12, 6)).toBe(200);
  });

  it('a high-resolution export in a modest block passes comfortably', () => {
    expect(computeFigureDpi({ width: 3000, height: 2400 }, 10, 8)).toBe(300);
  });

  it('returns null for degenerate inputs rather than Infinity or NaN', () => {
    expect(computeFigureDpi({ width: 0, height: 100 }, 10, 10)).toBeNull();
    expect(computeFigureDpi({ width: 100, height: 100 }, 0, 10)).toBeNull();
    expect(computeFigureDpi({ width: 100, height: 100 }, 10, 0)).toBeNull();
  });
});

describe('statusForDpi', () => {
  it('passes at or above the print floor', () => {
    expect(statusForDpi(FIGURE_DPI_PASS)).toBe('pass');
    expect(statusForDpi(300)).toBe('pass');
  });

  it('warns between the two thresholds', () => {
    expect(statusForDpi(FIGURE_DPI_WARN)).toBe('warn');
    expect(statusForDpi(FIGURE_DPI_PASS - 1)).toBe('warn');
  });

  it('fails below the warn threshold', () => {
    expect(statusForDpi(FIGURE_DPI_WARN - 1)).toBe('fail');
    expect(statusForDpi(33)).toBe('fail');
  });

  it('reports unknown when pixels could not be measured', () => {
    expect(statusForDpi(null)).toBe('unknown');
  });
});

describe('checkFigure', () => {
  it('flags a screenshot blown up across a poster column', () => {
    // 400px wide screenshot stretched to a 12-inch column → 33 DPI.
    const check = checkFigure('block-1', { width: 400, height: 300 }, 12, 9);
    expect(check.status).toBe('fail');
    expect(check.effectiveDpi).toBe(33);
    expect(check.blockId).toBe('block-1');
    expect(check.message).toMatch(/blurry/i);
  });

  it('stays quiet for a properly exported figure', () => {
    const check = checkFigure('block-2', { width: 3000, height: 2400 }, 10, 8);
    expect(check.status).toBe('pass');
    expect(check.message).toMatch(/sharp enough/i);
  });

  it('reports unknown without throwing when pixels are unavailable', () => {
    const check = checkFigure('block-3', null, 10, 8);
    expect(check.status).toBe('unknown');
    expect(check.effectiveDpi).toBeNull();
    expect(check.message).toMatch(/could not measure/i);
  });

  it('never surfaces raw numbers as the only explanation', () => {
    const check = checkFigure('block-4', { width: 400, height: 300 }, 12, 9);
    // The message must tell the user what to DO, not just a number.
    expect(check.message).toMatch(/higher resolution/i);
  });
});

describe('measureImage', () => {
  it('resolves null for an empty source instead of hanging', async () => {
    await expect(measureImage('')).resolves.toBeNull();
  });

  it('resolves null rather than hanging when no decode event fires', async () => {
    // jsdom never decodes images, so neither onload nor onerror fires —
    // the same stall a malformed data: URI can cause in a real browser.
    // Without the timeout guard the download-time warning would simply
    // never appear, which a user reads as "no problems found".
    await expect(
      measureImage('data:image/png;base64,not-a-png', 20),
    ).resolves.toBeNull();
  });
});
