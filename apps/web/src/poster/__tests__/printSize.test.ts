import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_SIZE,
  PRINT_SIZE_MAX_IN,
  PRINT_SIZE_MIN_IN,
  PRINT_SIZE_PRESETS,
  clampInches,
  matchingPresetId,
  parseInches,
} from '../printSize';

describe('parseInches', () => {
  it('accepts a plain integer', () => {
    expect(parseInches('24')).toBe(24);
  });

  it('accepts a decimal and leaves rounding to clampInches', () => {
    expect(parseInches('24.75')).toBe(24.75);
    expect(clampInches(parseInches('24.75')!)).toBe(24.8);
  });

  it('accepts a comma decimal with surrounding whitespace', () => {
    expect(parseInches(' 7,5 ')).toBe(7.5);
  });

  it.each(['', '   ', 'abc', '0', '-3', 'NaN'])('rejects %j', (raw) => {
    expect(parseInches(raw)).toBeNull();
  });
});

describe('clampInches', () => {
  it('raises anything under the floor to the floor', () => {
    expect(clampInches(0.5)).toBe(PRINT_SIZE_MIN_IN);
    expect(clampInches(0.5)).toBe(1);
  });

  it('lowers anything over the ceiling to the ceiling', () => {
    expect(clampInches(500)).toBe(PRINT_SIZE_MAX_IN);
    expect(clampInches(500)).toBe(96);
  });

  it('rounds to a tenth of an inch', () => {
    expect(clampInches(7.44)).toBe(7.4);
    expect(clampInches(7.45)).toBe(7.5);
    expect(clampInches(10)).toBe(10);
  });
});

describe('PRINT_SIZE_PRESETS', () => {
  it('stay inside the accepted range', () => {
    for (const preset of PRINT_SIZE_PRESETS) {
      expect(preset.w).toBeGreaterThanOrEqual(PRINT_SIZE_MIN_IN);
      expect(preset.w).toBeLessThanOrEqual(PRINT_SIZE_MAX_IN);
      expect(preset.h).toBeGreaterThanOrEqual(PRINT_SIZE_MIN_IN);
      expect(preset.h).toBeLessThanOrEqual(PRINT_SIZE_MAX_IN);
    }
  });

  it('have unique ids and a label that names the size', () => {
    const ids = PRINT_SIZE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PRINT_SIZE_PRESETS) {
      expect(preset.label).toContain(`${preset.w} × ${preset.h}`);
    }
  });

  it('include the quarter-poster preset the blueprint names', () => {
    expect(PRINT_SIZE_PRESETS.some((p) => p.w === 24 && p.h === 18)).toBe(true);
  });

  it('derive the A0-landscape quarter as 23.4 × 16.5, as the blueprint specifies', () => {
    // 33.1 / 2 = 16.55 — rounding would print 16.6; the quarter presets
    // floor to a tenth so the chip reads exactly what the spec says.
    expect(PRINT_SIZE_PRESETS.find((p) => p.id === 'quarter-a0-landscape')).toMatchObject({
      w: 23.4,
      h: 16.5,
    });
  });
});

describe('DEFAULT_PRINT_SIZE', () => {
  it('matches the panel defaults the editor uses when no block is selected', () => {
    // ReadabilityPanel destructures defaultFigureWidthIn = 10 and
    // defaultFigureHeightIn = 7 — the public page must start at the
    // same size so the two surfaces never disagree about the default.
    expect(DEFAULT_PRINT_SIZE).toEqual({ w: 10, h: 7 });
  });

  it('is itself a preset, so the default chip reads as pressed', () => {
    expect(matchingPresetId(DEFAULT_PRINT_SIZE.w, DEFAULT_PRINT_SIZE.h)).not.toBeNull();
  });
});

describe('matchingPresetId', () => {
  it('finds the quarter-poster preset at 24 × 18', () => {
    const id = matchingPresetId(24, 18);
    expect(id).toBe('quarter-48x36');
  });

  it('tolerates a rounding-sized difference', () => {
    expect(matchingPresetId(24.04, 18)).toBe('quarter-48x36');
  });

  it('returns null when neither dimension is within tolerance', () => {
    expect(matchingPresetId(24.3, 18)).toBeNull();
    expect(matchingPresetId(24, 18.3)).toBeNull();
  });
});
