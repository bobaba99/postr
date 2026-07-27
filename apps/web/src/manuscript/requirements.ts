/**
 * Q6 — presentation requirements. Deterministic derivation, shown to
 * the user rather than hidden.
 *
 * The guideline is ONE MINUTE PER SLIDE. State a duration and we derive
 * a slide count; state a slide count and we derive a duration. Either
 * way the arithmetic is surfaced ("A 10-minute talk is about 10
 * slides") because a number that appears without explanation is a
 * number the user cannot argue with.
 *
 * Honest scope note: today's output is a POSTER, and a slide count does
 * not change a poster's layout. The answer is captured and persisted
 * anyway — the poster-to-deck path in a later phase needs exactly this,
 * and asking again later is worse than storing it now. What it DOES
 * feed today is the rubric's content budget: a hard slot limit is a
 * signal the author has to be brief, which tightens the poster's own
 * word budgets.
 */
import type { PresentationRequirements } from '@postr/shared';

/** The stated guideline. One slide per minute of talking. */
export const MINUTES_PER_SLIDE = 1;

/** Sane bounds. Below 1 is nonsense; above 120 is not a poster session. */
const MIN_UNITS = 1;
const MAX_UNITS = 120;

export const NO_REQUIREMENTS: PresentationRequirements = {
  statedAs: 'none',
  slideCount: null,
  durationMinutes: null,
};

function clamp(value: number): number {
  return Math.min(MAX_UNITS, Math.max(MIN_UNITS, Math.round(value)));
}

/** Slides implied by a duration, at the stated guideline. */
export function slidesFromDuration(minutes: number): number {
  return clamp(minutes / MINUTES_PER_SLIDE);
}

/** Duration implied by a slide count, at the stated guideline. */
export function durationFromSlides(slides: number): number {
  return clamp(slides * MINUTES_PER_SLIDE);
}

/**
 * Build the requirement record from whichever side the user stated.
 * The derived side is always filled in, never left null — the whole
 * point is that the user sees both numbers.
 */
export function requirementsFromDuration(minutes: number): PresentationRequirements {
  const durationMinutes = clamp(minutes);
  return {
    statedAs: 'duration',
    durationMinutes,
    slideCount: slidesFromDuration(durationMinutes),
  };
}

export function requirementsFromSlides(slides: number): PresentationRequirements {
  const slideCount = clamp(slides);
  return {
    statedAs: 'slides',
    slideCount,
    durationMinutes: durationFromSlides(slideCount),
  };
}

/**
 * Parse a free-text answer like "10 minutes", "about 12 slides", "15".
 * Deterministic: the unit word decides, and a bare number is read as
 * MINUTES because that is what conference programmes hand out.
 * Returns null when there is no number to work with.
 */
export function parseRequirementText(text: string): PresentationRequirements | null {
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return /\bslides?\b/i.test(text)
    ? requirementsFromSlides(value)
    : requirementsFromDuration(value);
}

/**
 * The derivation, in the user's words. Shown in the transcript so the
 * arithmetic is visible rather than implied.
 */
export function describeRequirements(req: PresentationRequirements): string {
  if (req.statedAs === 'none' || req.slideCount === null || req.durationMinutes === null) {
    return 'No limit noted — I will aim for a standard poster.';
  }
  const slides = `${req.slideCount} slide${req.slideCount === 1 ? '' : 's'}`;
  const minutes = `${req.durationMinutes} minute${req.durationMinutes === 1 ? '' : 's'}`;
  return req.statedAs === 'duration'
    ? `${minutes} is about ${slides}, at a minute each. I will keep the poster to that much content.`
    : `${slides} is about ${minutes}, at a minute each. I will keep the poster to that much content.`;
}
