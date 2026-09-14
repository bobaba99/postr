/**
 * `generateFullFix` — the "full edited code" the readability check
 * hands back. The appended save call MUST carry the canvas the check
 * was scored against: on the public page that canvas is the typed
 * print size, and a hardcoded 10 × 7 would render the script at a
 * size unrelated to the base_size it recommends.
 */
import { describe, expect, it } from 'vitest';
import { generateFullFix } from '../readabilityFullFix';
import { parsePythonCode, parseRCode } from '../readability';

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
    const params = parsePythonCode(PY_NO_SAVE, { defaultWidthIn: 24, defaultHeightIn: 18 });
    const fixed = generateFullFix(PY_NO_SAVE, params, 18);
    expect(fixed).toContain("plt.rcParams['font.size'] = 18");
    expect(fixed).toContain("plt.rcParams['figure.figsize'] = (24, 18)");
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
