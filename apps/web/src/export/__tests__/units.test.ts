/**
 * Units / coordinate conversion layer — exactness tests.
 *
 * The plan (§1) leans on EMU per unit being an exact integer, so
 * these assert equality, NOT closeness. Any drift here corrupts
 * every exported file's geometry.
 */
import { describe, expect, it } from 'vitest';
import {
  EMU_PER_INCH,
  EMU_PER_UNIT,
  PPTX_MAX_DIMENSION_IN,
  PptxSizeLimitError,
  inchesToEmu,
  planPptxScale,
  unitsToEmu,
  unitsToInches,
  unitsToPoints,
} from '../units';

describe('unit conversions', () => {
  it('EMU_PER_UNIT is the exact integer 91440', () => {
    expect(EMU_PER_UNIT).toBe(91440);
    expect(Number.isInteger(EMU_PER_UNIT)).toBe(true);
  });

  it('converts integer units to exact integer EMU', () => {
    expect(unitsToEmu(1)).toBe(91440);
    expect(unitsToEmu(0)).toBe(0);
    expect(unitsToEmu(10)).toBe(914400); // 1 inch
    expect(unitsToEmu(480)).toBe(43891200); // 48 in — full poster width
    expect(unitsToEmu(720)).toBe(65836800); // 72 in — SfN board width
  });

  it('converts inches to exact EMU', () => {
    expect(inchesToEmu(48)).toBe(48 * EMU_PER_INCH);
    expect(inchesToEmu(36)).toBe(32918400);
    expect(inchesToEmu(24)).toBe(21945600);
  });

  it('converts units to inches (1 unit = 1/10 in)', () => {
    expect(unitsToInches(480)).toBe(48);
    expect(unitsToInches(5)).toBe(0.5);
  });

  it('converts units to points (1 unit = 7.2 pt)', () => {
    expect(unitsToPoints(10)).toBe(72);
    expect(unitsToPoints(5)).toBe(36);
    expect(unitsToPoints(14)).toBeCloseTo(100.8, 10);
  });
});

describe('planPptxScale — the 56-inch ceiling', () => {
  it('keeps a 48×36 poster unscaled', () => {
    const plan = planPptxScale(48, 36);
    expect(plan).toEqual({
      scale: 1,
      scaled: false,
      slideWidthIn: 48,
      slideHeightIn: 36,
      note: null,
    });
  });

  it('keeps exactly-56-inch dimensions unscaled (boundary)', () => {
    const plan = planPptxScale(56, 56);
    expect(plan.scale).toBe(1);
    expect(plan.scaled).toBe(false);
    expect(plan.note).toBeNull();
  });

  it('halves a 72×48 SfN poster to a 36×24 slide', () => {
    const plan = planPptxScale(72, 48);
    expect(plan.scale).toBe(0.5);
    expect(plan.scaled).toBe(true);
    expect(plan.slideWidthIn).toBe(36);
    expect(plan.slideHeightIn).toBe(24);
  });

  it('halves when only ONE dimension exceeds the ceiling', () => {
    const plan = planPptxScale(60, 40);
    expect(plan.scale).toBe(0.5);
    expect(plan.slideWidthIn).toBe(30);
    expect(plan.slideHeightIn).toBe(20);
  });

  it('scales just past the boundary', () => {
    const plan = planPptxScale(56.1, 40);
    expect(plan.scale).toBe(0.5);
  });

  it('never scales by anything but exactly 0.5', () => {
    for (const [w, h] of [[57, 40], [72, 48], [100, 56], [112, 112]] as const) {
      const plan = planPptxScale(w, h);
      expect(plan.scale).toBe(0.5);
      expect(plan.slideWidthIn).toBe(w / 2);
      expect(plan.slideHeightIn).toBe(h / 2);
    }
  });

  it('writes the mandatory user-facing note when scaled', () => {
    const plan = planPptxScale(72, 48);
    expect(plan.note).toContain('72×48');
    expect(plan.note).toContain(`${PPTX_MAX_DIMENSION_IN} in`);
    expect(plan.note).toContain('half size');
    expect(plan.note).toContain('200%');
  });

  it('refuses (not clips, not rescales) when half size still exceeds the ceiling', () => {
    expect(() => planPptxScale(120, 48)).toThrow(PptxSizeLimitError);
    expect(() => planPptxScale(48, 113)).toThrow(PptxSizeLimitError);
    try {
      planPptxScale(120, 48);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PptxSizeLimitError);
      expect((err as PptxSizeLimitError).userMessage).toContain('LaTeX');
    }
  });

  it('accepts exactly 112 in (half = exactly 56)', () => {
    const plan = planPptxScale(112, 48);
    expect(plan.scale).toBe(0.5);
    expect(plan.slideWidthIn).toBe(56);
  });

  it('rejects nonsense dimensions', () => {
    expect(() => planPptxScale(0, 36)).toThrow();
    expect(() => planPptxScale(48, -1)).toThrow();
    expect(() => planPptxScale(Number.NaN, 36)).toThrow();
  });
});
