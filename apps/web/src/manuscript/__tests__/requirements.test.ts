/**
 * Q6 derivation — one minute per slide, both directions, arithmetic
 * shown rather than hidden.
 */
import { describe, it, expect } from 'vitest';
import {
  describeRequirements,
  durationFromSlides,
  NO_REQUIREMENTS,
  parseRequirementText,
  requirementsFromDuration,
  requirementsFromSlides,
  slidesFromDuration,
} from '../requirements';

describe('the one-minute-per-slide guideline', () => {
  it('derives slides from minutes', () => {
    expect(slidesFromDuration(10)).toBe(10);
    expect(slidesFromDuration(3)).toBe(3);
  });

  it('derives minutes from slides', () => {
    expect(durationFromSlides(12)).toBe(12);
  });

  it('rounds fractional input to whole units', () => {
    expect(slidesFromDuration(7.4)).toBe(7);
    expect(slidesFromDuration(7.6)).toBe(8);
  });

  it('clamps nonsense into a usable range', () => {
    expect(slidesFromDuration(0.1)).toBe(1);
    expect(slidesFromDuration(9999)).toBe(120);
  });
});

describe('building the requirement record', () => {
  it('fills in the derived side from a duration', () => {
    expect(requirementsFromDuration(10)).toEqual({
      statedAs: 'duration',
      durationMinutes: 10,
      slideCount: 10,
    });
  });

  it('fills in the derived side from a slide count', () => {
    expect(requirementsFromSlides(6)).toEqual({
      statedAs: 'slides',
      slideCount: 6,
      durationMinutes: 6,
    });
  });

  it('never leaves the derived side null — the user must see both', () => {
    const fromDuration = requirementsFromDuration(5);
    expect(fromDuration.slideCount).not.toBeNull();
    const fromSlides = requirementsFromSlides(5);
    expect(fromSlides.durationMinutes).not.toBeNull();
  });
});

describe('parseRequirementText', () => {
  it('reads an explicit slide count', () => {
    expect(parseRequirementText('about 12 slides')).toEqual({
      statedAs: 'slides',
      slideCount: 12,
      durationMinutes: 12,
    });
  });

  it('reads a duration', () => {
    expect(parseRequirementText('10 minutes')?.statedAs).toBe('duration');
    expect(parseRequirementText('a 15 min slot')?.durationMinutes).toBe(15);
  });

  it('reads a bare number as minutes — that is what programmes hand out', () => {
    expect(parseRequirementText('15')).toEqual({
      statedAs: 'duration',
      durationMinutes: 15,
      slideCount: 15,
    });
  });

  it('handles the singular', () => {
    expect(parseRequirementText('1 slide')?.statedAs).toBe('slides');
  });

  it('returns null when there is no number', () => {
    expect(parseRequirementText('not sure yet')).toBeNull();
    expect(parseRequirementText('')).toBeNull();
  });

  it('returns null for a zero or negative constraint', () => {
    expect(parseRequirementText('0 slides')).toBeNull();
  });
});

describe('describeRequirements — the arithmetic is shown', () => {
  it('explains a duration in terms of slides', () => {
    const text = describeRequirements(requirementsFromDuration(10));
    expect(text).toMatch(/10 minutes is about 10 slides/i);
    expect(text).toMatch(/a minute each/i);
  });

  it('explains a slide count in terms of minutes', () => {
    const text = describeRequirements(requirementsFromSlides(12));
    expect(text).toMatch(/12 slides is about 12 minutes/i);
  });

  it('uses the singular where it should', () => {
    expect(describeRequirements(requirementsFromSlides(1))).toMatch(
      /1 slide is about 1 minute\b/i,
    );
  });

  it('says plainly when there is no limit', () => {
    expect(describeRequirements(NO_REQUIREMENTS)).toMatch(/no limit/i);
  });
});
