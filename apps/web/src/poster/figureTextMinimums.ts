/**
 * The canonical minimums for figure text on a poster, in printed points,
 * and the band that counts as a warning (plan item 13 part 2, the lead's
 * decision 1 of 2026-10-06: the code check's set).
 *
 * One set for every surface that judges or draws figure text:
 *   - the code check: R_ELEMENTS and PY_ELEMENTS (`readabilityTypes.ts`
 *     since fix 13b) take their minPt from here, and `readability.ts`
 *     judges each row with `figureTextStatus` (the merge of 13c into 13b;
 *     it had a literal 0.85, review Q-R8);
 *   - the image scan, `ReadabilityPanel.tsx` ("Scan image");
 *   - Postr's own inserted charts, `charts/plotOptions.ts`: the floor their
 *     text never goes below.
 * Before, the image scan judged against 24/24/18 with a 25% warning band
 * and the charts claimed 18/24 as "the checker's" minimums, while the code
 * check and the public page used these.
 *
 * The public plot checker page promises these numbers in English and
 * French (`i18n/figureReadability.ts`, `seo/routes.json`);
 * `__tests__/figureTextMinimums.test.tsx` holds that copy to them.
 *
 * Not these: the poster's own text (the Guidelines panel's per-conference
 * body and caption sizes) and the attribution colophon's floor
 * (`export/colophonGeometry.ts`) are poster text, a different thing, and
 * stay as they are (the same decision).
 */

/** Each kind of figure text the minimums cover (readability.ts's element keys). */
export type FigureTextElement =
  | 'plotTitle'
  | 'axisTitle'
  | 'axisText'
  | 'legendText'
  | 'legendTitle'
  | 'stripText'
  | 'caption';

/**
 * Titles and axis titles 18 pt; tick labels (`axisText`), legend text,
 * legend titles and facet strips 14 pt; captions 12 pt.
 */
export const FIGURE_TEXT_MIN_PT: Readonly<Record<FigureTextElement, number>> = {
  plotTitle: 18,
  axisTitle: 18,
  axisText: 14,
  legendText: 14,
  legendTitle: 14,
  stripText: 14,
  caption: 12,
};

/**
 * A size at or above this share of its minimum, but under the minimum, is a
 * warning (⚠); below it, a failure (✗). The panel's legend says "Up to 15%
 * below the minimum" (i18n/readability.ts `warnLead`).
 */
export const FIGURE_TEXT_WARN_RATIO = 0.85;

/** pass, warn or fail for a printed size against its minimum. */
export function figureTextStatus(pt: number, minPt: number): 'pass' | 'warn' | 'fail' {
  if (pt >= minPt) return 'pass';
  if (pt >= minPt * FIGURE_TEXT_WARN_RATIO) return 'warn';
  return 'fail';
}
