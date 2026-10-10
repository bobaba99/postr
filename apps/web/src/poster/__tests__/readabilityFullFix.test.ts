/**
 * `generateTargetedFullFix` — the script the readability check hands back,
 * which the page asks the user to use in place of theirs (fix 13b). The
 * save it adds MUST carry the canvas the check was scored against: on the
 * public page that canvas is the typed print size, and a hardcoded 10 × 7
 * would render the script at a size unrelated to the sizes it sets.
 *
 * Part 1's base_size rewriter (generateFullFix) was unreachable from the
 * panel and is gone; its tests went with it. The concerns that still apply
 * to the new script (comments and strings are never edited, a save is added
 * only when the code has none, the canvas the check used) are kept here.
 */
import { describe, expect, it } from 'vitest';
import { generateTargetedFullFix, offersScript } from '../readabilityFullFix';
import { computeReadability, parsePythonCode, parseRCode } from '../readability';

const R_NO_SAVE = 'library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point()';
const PY_NO_SAVE = 'import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])\nplt.xlabel("x")';

/** The page's own sequence: read, score, edit, at a print size of w × h in. */
function fix(code: string, lang: 'r' | 'python', w = 10, h = 7) {
  const opts = { defaultWidthIn: w, defaultHeightIn: h };
  const p = lang === 'r' ? parseRCode(code, opts) : parsePythonCode(code, opts);
  const r = computeReadability(p, h, w);
  return { r, out: generateTargetedFullFix(code, p, r, opts) };
}

describe('when the script is offered', () => {
  it('a row below its minimum, or a size or canvas the code leaves out', () => {
    expect(offersScript(fix('theme_bw(base_size = 6)\nggsave("f.png", width = 10, height = 7)', 'r').r)).toBe(true);
    expect(offersScript(fix('ggplot(d) + geom_point()\nggsave("f.png", width = 10, height = 7)', 'r').r)).toBe(true);
  });

  it('nothing to set: every row passes with every size and the canvas read', () => {
    const { r, out } = fix('ggplot(d) + geom_point() + theme_bw(base_size = 24)\nggsave("f.png", width = 10, height = 7)', 'r');
    expect(offersScript(r)).toBe(false);
    expect(out).toBe('');
  });
});

describe('the R script', () => {
  it('appends a ggsave() at the canvas the check used when the code has none', () => {
    const { out } = fix(R_NO_SAVE, 'r', 24, 18);
    expect(out).toContain('ggsave("poster_figure.png", plot = last_plot() +\n  theme(');
    expect(out).toContain('width = 24, height = 18, dpi = 300)');
    expect(out).not.toContain('width = 10, height = 7');
  });

  it('leaves an existing ggsave()\'s size alone and puts the theme() in its plot', () => {
    const code = `${R_NO_SAVE.replace('ggplot(', 'p <- ggplot(')} + theme_bw(base_size = 8)\nggsave("fig.png", p, width = 7, height = 5)`;
    const { out } = fix(code, 'r', 7, 5);
    expect(out.match(/ggsave/g)).toHaveLength(1);
    expect(out).toContain('ggsave("fig.png", p +\n  theme(');
    expect(out).toContain('), width = 7, height = 5)');
  });

  it('a ggsave() mentioned only in a comment or a string is not a save', () => {
    const code = `${R_NO_SAVE}\n# ggsave("later.png")\nnote <- "ggsave() it later"`;
    const { out } = fix(code, 'r');
    expect(out).toContain('\nggsave("poster_figure.png", plot = last_plot()');
    expect(out).toContain('# ggsave("later.png")');
  });
});

describe('the Python script', () => {
  it('a script that never saves gets a save at the figure\'s size, before its first show()', () => {
    const shown = fix(`${PY_NO_SAVE}\nplt.show()`, 'python').out;
    expect(shown).toContain('\nplt.savefig("poster_figure.png", dpi=300)\nplt.show()');
    const bare = fix(PY_NO_SAVE, 'python').out;
    expect(bare.trimEnd().endsWith('plt.savefig("poster_figure.png", dpi=300)')).toBe(true);
  });

  it('a save only mentioned in a comment or a string is not a save', () => {
    const code = `${PY_NO_SAVE}\n# fig.savefig("later.png")\nnote = "call savefig when done"`;
    expect(fix(code, 'python').out).toContain('\nplt.savefig("poster_figure.png", dpi=300)');
  });

  it('a script that never binds plt gets the import with the save', () => {
    const code = 'import matplotlib.pyplot as pyplot\npyplot.plot([1, 2])\npyplot.xlabel("x")';
    const out = fix(code, 'python').out;
    expect(out).toContain('pyplot.savefig("poster_figure.png", dpi=300)');
    expect(out).toContain('pyplot.rcParams.update({');
  });
});
