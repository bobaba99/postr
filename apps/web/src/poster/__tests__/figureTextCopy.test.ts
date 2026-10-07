/**
 * Plan item 13 part 2, stream Q — the public plot checker page states the
 * minimums for figure text in English and French (the lede and "How the
 * check works", on the page and in its routes.json crawler records). Every
 * number it states is the shared module's (poster/figureTextMinimums.ts),
 * and the groupings it states hold there: one number for titles and axis
 * titles, one for tick labels, legends and strips. Record:
 * docs/fixes/13c-chart-text-minimums.md.
 *
 * A guard, not a red test: the copy and the code check already agreed on
 * main; the image scan and the charts did not, and those are tested in
 * figureTextMinimums.test.tsx. This keeps the copy true if the module moves.
 *
 * Re-run: npx vitest run src/poster/__tests__/figureTextCopy.test.ts
 */
import { describe, expect, it } from 'vitest';
import { FIGURE_TEXT_MIN_PT as MIN } from '../figureTextMinimums';
import { FIGURE_READABILITY_COPY as COPY } from '@/i18n/figureReadability';
import routesJson from '@/seo/routes.json';

const routes = routesJson.static as Record<string, { copy: string[] }>;
/** French puts a no-break space before "pt"; compare words, not space kinds. */
const plain = (s: string) => s.replace(/ /g, ' ');

const EN_LEDE = `minimums of ${MIN.axisTitle} pt for axis titles, ${MIN.axisText} pt for tick labels and ${MIN.caption} pt for captions`;
const EN_HOW = `${MIN.plotTitle} pt for titles and axis titles, ${MIN.axisText} pt for tick labels, legends and strips, ${MIN.caption} pt for captions`;
const FR_LEDE = `minimums de ${MIN.axisTitle} pt pour les titres d’axes, de ${MIN.axisText} pt pour les étiquettes de graduation et de ${MIN.caption} pt pour les notes`;
const FR_HOW = `${MIN.plotTitle} pt pour les titres et les titres d’axes, ${MIN.axisText} pt pour les étiquettes de graduation, les légendes et les bandeaux, ${MIN.caption} pt pour les notes`;

describe('the checker page’s minimums are the shared module’s', () => {
  it('the groupings the copy states hold in the module', () => {
    expect(MIN.plotTitle).toBe(MIN.axisTitle);
    expect(MIN.legendText).toBe(MIN.axisText);
    expect(MIN.stripText).toBe(MIN.axisText);
  });

  it('English: the lede and "How the check works", on the page and for crawlers', () => {
    expect(COPY.en.lede).toContain(EN_LEDE);
    expect(COPY.en.howCanvas).toContain(EN_HOW);
    const record = routes['/tools/figure-readability']!.copy.map(plain);
    expect(record.some((c) => c.includes(EN_LEDE))).toBe(true);
    expect(record.some((c) => c.includes(EN_HOW))).toBe(true);
  });

  it('French: the same numbers, on the page and for crawlers', () => {
    expect(plain(COPY.fr.lede)).toContain(FR_LEDE);
    expect(plain(COPY.fr.howCanvas)).toContain(FR_HOW);
    const record = routes['/tools/figure-readability/fr']!.copy.map(plain);
    expect(record.some((c) => c.includes(FR_LEDE))).toBe(true);
    expect(record.some((c) => c.includes(FR_HOW))).toBe(true);
  });

  it('no other point size is stated beside a figure-text element in the page copy', () => {
    const minimums = new Set(Object.values(MIN).map(String));
    const stated = [COPY.en.lede, COPY.en.howCanvas, COPY.fr.lede, COPY.fr.howCanvas]
      .flatMap((s) => [...plain(s).matchAll(/(\d+(?:[.,]\d+)?) pt\b/g)].map((m) => m[1]!.replace(',', '.')));
    expect(stated.length).toBeGreaterThanOrEqual(12);
    for (const n of stated) expect(minimums.has(n)).toBe(true);
  });
});
