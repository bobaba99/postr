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
