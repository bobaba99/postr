/**
 * Fix 26 — the plot checker engine's English, in French on the French page.
 *
 * Every warning shape poster/readability.ts writes (its `warnings.push`
 * sites, ten shapes) is produced here through the engine itself, on a
 * script that triggers it, and must come back in French: no shape may fall
 * through to English. And every row name the engine gives has a French name.
 *
 * Re-run: npx vitest run src/i18n/__tests__/readabilityWarnings.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeReadability, parsePythonCode, parseRCode } from '@/poster/readability';
import { ENGINE_ELEMENT_NAMES, elementName, engineWarning } from '../readabilityWarnings';

const PAGE_LABEL = 'the print size you entered,';

/** [what it triggers, the engine's warnings for a script that triggers it]. */
const CASES: Array<[string, string[]]> = [
  ['no base_size', parseRCode('ggplot(df, aes(x, y)) + geom_point()').warnings],
  ['base_size from a variable', parseRCode('s <- 20\nggplot(df) + theme_minimal(base_size = s)').warnings],
  ['in-panel text at a set size', parseRCode('ggplot(df) + geom_text(aes(label = n), size = 2) + theme_bw(base_size = 12)').warnings],
  ['in-panel text at the default size', parseRCode('ggplot(df) + geom_text(aes(label = n)) + theme_bw(base_size = 12)').warnings],
  ['ggsave with no width', parseRCode('ggplot(df) + theme_bw(base_size = 12)\nggsave("f.png")').warnings],
  ['ggsave with unknown units', parseRCode('ggplot(df) + theme_bw(base_size = 12)\nggsave("f.png", width = 5, height = 4, units = "ft")').warnings],
  [
    'no ggsave, the page’s size',
    parseRCode('ggplot(df) + theme_bw(base_size = 12)', { defaultWidthIn: 10, defaultHeightIn: 7, defaultSizeLabel: PAGE_LABEL }).warnings,
  ],
  ['no ggsave, the preview’s size', parseRCode('ggplot(df) + theme_bw(base_size = 12)', { defaultWidthIn: 10, defaultHeightIn: 7 }).warnings],
  ['no canvas in R', parseRCode('ggplot(df) + theme_bw(base_size = 12)').warnings],
  ['no font.size, no figsize', parsePythonCode('import matplotlib.pyplot as plt\nplt.plot([1, 2])').warnings],
];

const all = CASES.flatMap(([, w]) => w);

describe('every engine warning has a French sentence', () => {
  it.each(CASES)('%s', (_label, warnings) => {
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      const fr = engineWarning(w, 'fr');
      expect(fr, w).not.toBe(w);
      expect(fr, w).not.toMatch(/\b(found|assuming|using|instead|treating|yourself|default)\b/);
      expect(fr, w).not.toMatch(/\d\.\d/);
    }
  });

  it('the cases cover every shape the engine writes (its warnings.push sites)', () => {
    const source = readFileSync(join(process.cwd(), 'src/poster/readability.ts'), 'utf8');
    const sites = source.match(/warnings\.push\(/g)?.length ?? 0;
    // The in-panel site writes two shapes (a set size, the theme's default).
    const shapes = new Set(all.map((w) => w.replace(/[\d.]+/g, '#').replace(/"[^"]*"/g, '"…"').slice(0, 40)));
    expect(sites).toBe(9);
    expect(shapes.size).toBeGreaterThanOrEqual(sites + 1);
  });

  it('leaves the English page’s warnings as the engine wrote them', () => {
    for (const w of all) expect(engineWarning(w, 'en')).toBe(w);
  });

  it('names the page’s own canvas in French', () => {
    const [w] = parseRCode('ggplot(df) + theme_bw(base_size = 12)', {
      defaultWidthIn: 10,
      defaultHeightIn: 7,
      defaultSizeLabel: PAGE_LABEL,
    }).warnings;
    expect(engineWarning(w!, 'fr')).toBe(
      'Aucun ggsave() trouvé — la taille d’impression que vous avez saisie, 10,0\u00a0po × 7,0\u00a0po, sert de canevas source.',
    );
  });
});

describe('every row name the engine gives has a French name', () => {
  it('R and Python, every element', () => {
    const r = computeReadability(parseRCode('ggplot(df) + theme_bw(base_size = 6)'), 7, 10);
    const py = computeReadability(parsePythonCode('import matplotlib.pyplot as plt\nplt.plot([1])'), 7, 10);
    const names = new Set([...r.elements, ...py.elements].map((e) => e.name));
    expect([...names].sort()).toEqual([...ENGINE_ELEMENT_NAMES].sort());
    for (const name of names) {
      expect(elementName(name, 'fr')).not.toBe(name);
      expect(elementName(name, 'en')).toBe(name);
    }
  });
});
