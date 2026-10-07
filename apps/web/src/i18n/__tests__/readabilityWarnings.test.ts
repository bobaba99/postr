/**
 * Fix 26 — the plot checker engine's English, in French on the French page.
 *
 * Every warning shape the engine writes (fix 13b: the R reader's
 * `warnings.push` sites in poster/readabilityRModel.ts, twelve shapes since
 * review round 3, and the Python reader's `out.push` sites in
 * readabilityPyModel.ts warningsOf, eight)
 * is produced here through the engine itself, on a script that triggers it,
 * and must come back in French: no shape may fall through to English. And
 * every row name the engine gives has a French name.
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
  ['a theme that is not ggplot2\'s', parseRCode('ggplot(df) + theme_pubr(base_size = 12)\nggsave("f.png", width = 5, height = 4)').warnings],
  // Review round 2: a device whose size cannot be read, and a figure that combines plots the check cannot name.
  ['a device with no readable size', parseRCode('p <- ggplot(df) + theme_bw(base_size = 12)\npng("f.png", width = w(), height = 4, units = "in", res = 300)\nprint(p)\ndev.off()').warnings],
  ['plots combined that the check cannot name', parseRCode('library(cowplot)\nfig <- plot_grid(ggplot(df) + theme_bw(base_size = 12), ncol = 1)\nggsave("f.png", fig, width = 5, height = 4)').warnings],
  // Review round 3: a device whose plot the check cannot find.
  ['a device whose plot it cannot find', parseRCode('p <- ggplot(df) + theme_bw(base_size = 12)\npng("f.png", width = 5, height = 4, units = "in", res = 300)\nplot(p)\ndev.off()').warnings],
  ['Python: no font size, no figsize', parsePythonCode('import matplotlib.pyplot as plt\nplt.plot([1, 2])\nplt.xlabel("x")').warnings],
  ['Python: a size it cannot read', parsePythonCode('import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(4, 3))\nax.set_xlabel("x", fontsize=f(2))').warnings],
  ['Python: a style sheet it does not know', parsePythonCode('import matplotlib.pyplot as plt\nplt.style.use("lab.mplstyle")\nfig, ax = plt.subplots(figsize=(4, 3))').warnings],
  ['Python: a figure size it cannot read', parsePythonCode('import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=size())', { defaultWidthIn: 10, defaultHeightIn: 7, defaultSizeLabel: PAGE_LABEL }).warnings],
  ['Python: a seaborn grid', parsePythonCode('import seaborn as sns\ng = sns.relplot(data=d, x="a", y="b", col="c")\ng.savefig("g.png")', { defaultWidthIn: 10, defaultHeightIn: 7, defaultSizeLabel: PAGE_LABEL }).warnings],
  ['Python: a tight save', parsePythonCode('import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(4, 3))\nfig.savefig("f.png", bbox_inches="tight")').warnings],
  ['Python: a notebook display', parsePythonCode('%matplotlib inline\nimport matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(4, 3))\nplt.show()').warnings],
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

  it('the cases cover every shape the engine writes (its push sites)', () => {
    const r = readFileSync(join(process.cwd(), 'src/poster/readabilityRModel.ts'), 'utf8');
    const py = readFileSync(join(process.cwd(), 'src/poster/readabilityPyModel.ts'), 'utf8');
    const warningsOf = py.slice(py.indexOf('function warningsOf'), py.indexOf('\n}\n', py.indexOf('function warningsOf')));
    const sites = (r.match(/warnings\.push\(/g)?.length ?? 0) + (warningsOf.match(/out\.push\(/g)?.length ?? 0);
    // Two sites write two shapes each: the in-panel text (a set size, the
    // theme's default) and R's missing ggsave() (the size the caller names,
    // R's own default).
    const shapes = new Set(all.map((w) => w.replace(/[\d.]+/g, '#').replace(/"[^"]*"/g, '"…"').replace(/\(.*?\)/g, '(…)').slice(0, 40)));
    expect(sites).toBe(18);
    expect(shapes.size).toBeGreaterThanOrEqual(sites + 2);
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
