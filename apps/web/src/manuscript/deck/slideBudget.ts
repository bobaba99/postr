/**
 * Slide budgets for the talk deck — docs/plans/2026-07-29-paper-to-slides.md §1.
 *
 * Two deterministic gates, mirroring the poster rubric's "cut, don't shrink"
 * discipline (see manuscript/rubric.ts):
 *   - slide count derives from spoken duration at 1 minute per content slide;
 *   - each content slide is capped at 30 words, trimmed at a word boundary
 *     AFTER the LLM condense — never shrunk to fit.
 *
 * Title and reference slides are exempt and excluded from the speaking-time
 * budget, so they are not represented here.
 */

/** Hard word ceiling per content slide (spec §1). */
export const SLIDE_WORD_CAP = 30;

/** One content slide per spoken minute; title + refs are counted separately. */
export function contentSlideCount(durationMinutes: number): number {
  return Math.max(3, Math.floor(durationMinutes));
}

/** Hard word gate — cut at a word boundary, never shrink type, never mid-word. */
export function enforceSlideWordCap(text: string): { text: string; cut: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= SLIDE_WORD_CAP) return { text: text.trim(), cut: false };
  return { text: words.slice(0, SLIDE_WORD_CAP).join(' '), cut: true };
}
