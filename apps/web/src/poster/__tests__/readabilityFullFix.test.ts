/**
 * `generateFullFix` — the "full edited code" the readability check
 * hands back. The appended save call MUST carry the canvas the check
 * was scored against: on the public page that canvas is the typed
 * print size, and a hardcoded 10 × 7 would render the script at a
 * size unrelated to the base_size it recommends.
 */
import { describe, expect, it } from 'vitest';
import { generateFullFix, generateTargetedFullFix } from '../readabilityFullFix';
import { parsePythonCode, parseRCode } from '../readability';

const R = (c: string) => generateFullFix(c, parseRCode(c), 32);
const P = (c: string) => generateFullFix(c, parsePythonCode(c), 32);

const R_NO_SAVE = 'library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point()';
const PY_NO_SAVE = 'import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])';

describe('generateFullFix (R)', () => {
  it('appends a ggsave() at the canvas the check used when the code has none', () => {
    const params = parseRCode(R_NO_SAVE, { defaultWidthIn: 24, defaultHeightIn: 18 });
    const fixed = generateFullFix(R_NO_SAVE, params, 18);
    expect(fixed).toContain('theme_minimal(base_size = 18)');
    expect(fixed).toContain('ggsave("poster_figure.png", width = 24, height = 18, dpi = 300)');
    expect(fixed).not.toContain('width = 10, height = 7');
  });

  it('leaves an existing ggsave() alone', () => {
    const code = `${R_NO_SAVE}\nggsave("fig.png", width = 7, height = 5)`;
    const params = parseRCode(code, { defaultWidthIn: 24, defaultHeightIn: 18 });
    const fixed = generateFullFix(code, params, 18);
    expect(fixed.match(/ggsave/g)).toHaveLength(1);
    expect(fixed).toContain('width = 7, height = 5');
  });

  it('rewrites an existing base_size in place', () => {
    const code = 'ggplot(df, aes(x, y)) + geom_point() + theme_bw(base_size = 11)';
    const params = parseRCode(code, { defaultWidthIn: 10, defaultHeightIn: 7 });
    expect(generateFullFix(code, params, 20)).toContain('theme_bw(base_size = 20)');
  });
});

describe('generateFullFix (Python)', () => {
  it('sets the figure size to the canvas the check used when the code has no figsize', () => {
    // The check uses matplotlib's own default canvas for such a script, not
    // the print size (fix 13, claim CANVAS), and the fix pins that canvas.
    const params = parsePythonCode(PY_NO_SAVE, { defaultWidthIn: 24, defaultHeightIn: 18 });
    const fixed = generateFullFix(PY_NO_SAVE, params, 18);
    expect(fixed).toContain("plt.rcParams['font.size'] = 18");
    expect(fixed).toContain("plt.rcParams['figure.figsize'] = (6.4, 4.8)");
    expect(fixed).toContain('plt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")');
  });

  it('leaves an existing figsize alone', () => {
    const code = 'import matplotlib.pyplot as plt\nfig = plt.figure(figsize=(7, 5))\nplt.plot([1], [1])';
    const params = parsePythonCode(code, { defaultWidthIn: 24, defaultHeightIn: 18 });
    const fixed = generateFullFix(code, params, 18);
    expect(fixed).not.toContain("figure.figsize");
    expect(fixed).toContain('figsize=(7, 5)');
  });
});

describe('a setting the user already wrote is edited, never duplicated', () => {
  // The patterns matched only a numeric literal in one syntactic form, so
  // any other spelling read as "not set" and the generator fell through to
  // a branch that ADDED a second setting. Both outputs below were run
  // through the real interpreters: the Python sets font.size to 24.0, the
  // R renders without error.

  it('python: rcParams.update({...}) is edited in place', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams.update({'font.size': 8})\nfig, ax = plt.subplots(figsize=(9,6))";
    const out = generateFullFix(code, parsePythonCode(code), 24);
    expect((out.match(/font\.size/g) ?? []).length).toBe(1);
    expect(out).toContain("'font.size': 24");
  });

  it('python: the item-assignment form still works', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 8\nfig, ax = plt.subplots(figsize=(9,6))";
    const out = generateFullFix(code, parsePythonCode(code), 24);
    expect((out.match(/font\.size/g) ?? []).length).toBe(1);
    expect(out).toContain("plt.rcParams['font.size'] = 24");
  });

  it('python: a script with no font setting still gets one added', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(9,6))';
    const out = generateFullFix(code, parsePythonCode(code), 24);
    expect((out.match(/font\.size/g) ?? []).length).toBe(1);
  });

  it('R: a variable-bound base_size is replaced, not duplicated', () => {
    // theme_minimal(base_size = 24, base_size = bs) is an R error:
    // "formal argument matched by multiple actual arguments".
    const code = "bs <- 11\np <- ggplot(d, aes(x,y)) + geom_point() + theme_minimal(base_size = bs)\nggsave('f.png', width = 9, height = 6)";
    const out = generateFullFix(code, parseRCode(code), 24);
    expect((out.match(/base_size\s*=/g) ?? []).length).toBe(1);
    expect(out).toContain('theme_minimal(base_size = 24)');
  });

  it('R: a rel() base_size keeps its parens', () => {
    const code = "p <- ggplot(d) + theme_minimal(base_size = rel(1.1))\nggsave('f.png', width = 9, height = 6)";
    const out = generateFullFix(code, parseRCode(code), 24);
    expect(out).toContain('theme_minimal(base_size = 24)');
    expect(out).not.toContain('rel(1.1)');
    expect(out).not.toContain('))');
  });

  it('R: a theme call with no base_size gains exactly one', () => {
    const code = "p <- ggplot(d) + theme_minimal()\nggsave('f.png', width = 9, height = 6)";
    const out = generateFullFix(code, parseRCode(code), 24);
    expect((out.match(/base_size\s*=/g) ?? []).length).toBe(1);
  });

  it('R: a commented-out base_size does not count as already set', () => {
    const code = "# theme_minimal(base_size = 10)\np <- ggplot(d) + theme_minimal()\nggsave('f.png', width = 9, height = 6)";
    const out = generateFullFix(code, parseRCode(code), 24);
    expect(out).toContain('# theme_minimal(base_size = 10)');
    expect(out).toMatch(/\+ theme_minimal\(base_size = 24\)/);
    expect(out).not.toContain(', )');
  });
});

describe('the generated script must run, and do what was asked', () => {
  // Every case below was executed: R under Rscript 4.6.0 + ggplot2 4.0.3,
  // Python under matplotlib 3.10.8. "It looks right" is not a verdict —
  // the original R bug produced a script that ran cleanly and silently
  // changed nothing.
  it('C1 R: a string literal mentioning base_size is not truncated', () => {
    const c = 'library(ggplot2)\nmsg <- "set base_size = 30 for posters"\np <- ggplot(d) + theme_minimal(base_size = 11)\nggsave("f.png", width = 9, height = 6)';
    const out = R(c);
    expect(out, out).toContain('"set base_size = 30 for posters"');
  });
  it('C2 py: a string literal mentioning font.size is not truncated', () => {
    const c = 'import matplotlib.pyplot as plt\nnote = "try plt.rcParams[\'font.size\'] = 30 next time"\nfig, ax = plt.subplots(figsize=(9,6))';
    const out = P(c);
    expect(out, out).toContain('= 30 next time"');
  });
  it('C3 py: a second statement on the same line survives', () => {
    const c = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 8; plt.rcParams['axes.labelsize'] = 9\nfig, ax = plt.subplots(figsize=(9,6))";
    const out = P(c);
    expect(out, out).toContain("plt.rcParams['axes.labelsize'] = 9");
  });
  it('C4 py: a line continuation is not broken', () => {
    const c = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = \\\n    8\nfig, ax = plt.subplots(figsize=(9,6))";
    const out = P(c);
    expect(out.split('\n').some((l) => /^\s+8\s*$/.test(l)), out).toBe(false);
  });
  it('H1 R: an if/else base_size is replaced whole', () => {
    const c = 'p <- ggplot(d) + theme_minimal(base_size = if (big) 20 else 9)\nggsave("f.png", width = 9, height = 6)';
    const out = R(c);
    expect(out, out).toContain('theme_minimal(base_size = 32)');
  });
  it('H2 R: an arithmetic base_size is replaced whole, not left multiplied', () => {
    const c = 'p <- ggplot(d) + theme_minimal(base_size = max(bs, 8) * 1.2)\nggsave("f.png", width = 9, height = 6)';
    const out = R(c);
    expect(out, out).toContain('theme_minimal(base_size = 32)');
    expect(out, out).not.toContain('* 1.2');
  });
  it('M1 R: a trailing comment on the base_size line survives', () => {
    const c = 'p <- ggplot(d) + theme_minimal(\n    base_size = 11  # deliberately small\n)\nggsave("f.png", width = 9, height = 6)';
    const out = R(c);
    expect(out, out).toContain('# deliberately small');
  });
  it('M2 py: a comment inside rcParams.update survives', () => {
    const c = "import matplotlib.pyplot as plt\nplt.rcParams.update({\n    'axes.labelsize': 9,   # axis labels\n    'font.size': 8,\n})\nfig, ax = plt.subplots(figsize=(9,6))";
    const out = P(c);
    expect(out, out).toContain('# axis labels');
  });
  it('P1 R: the no-theme fallback must not append after ggsave()', () => {
    const c = 'library(ggplot2)\np <- ggplot(d, aes(x,y)) + geom_point()\nggsave("f.png", p, width = 9, height = 6)';
    const out = R(c);
    expect(out.split('\n').some((l) => /ggsave.*\+\s*$/.test(l)), out).toBe(false);
  });
});

describe('generateTargetedFullFix (Python)', () => {
  // Step 9 review of fix 13, round 2 (R2-04): the save was looked for after
  // the fix went in, as the word "savefig", which the fix's own helper text
  // contains, so a script that never saved got no save at all.
  it('a script that never saves gets a save, and the text it saves is raised', () => {
    const fixed = generateTargetedFullFix(PY_NO_SAVE, parsePythonCode(PY_NO_SAVE), "{'axisTitle': 17}");
    // Added as written; the block's wrap raises it when it runs.
    expect(fixed).toContain('\nplt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")\n');
    expect(fixed).toMatch(/^_postr_install\(\)$/m);
  });

  it('a save only mentioned in a comment or a string is not a save', () => {
    const code = `${PY_NO_SAVE}
# fig.savefig("later.png")
note = "call savefig when done"`;
    const fixed = generateTargetedFullFix(code, parsePythonCode(code), "{'axisTitle': 17}");
    expect(fixed).toContain('.savefig("poster_figure.png"');
  });
});
