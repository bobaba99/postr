/**
 * Fix 13b, review round 3 (record docs/fixes/13b-checker-sizes.md section 9):
 * the parts of the corrections the page's entry tests
 * (src/pages/__tests__/figureReadabilityReview3.test.tsx) do not reach: the
 * import's place and binding (P13B-R3-02), what R15 follows and what it
 * leaves in source order (P13B-R3-01), the floor on a passing unread size
 * (P13B-R3-03), and the plot a device draws (P13B-R3-04). The sizes expected
 * are what matplotlib 3.10.8 and ggplot2 4.0.3 draw (each R idiom measured
 * with scripts/truth/gg_truth.R).
 *
 * Re-run: npx vitest run src/poster/__tests__/readabilityReview3.test.ts
 */
import { describe, expect, it } from 'vitest';
import { computeReadability, parsePythonCode, parseRCode } from '../readability';
import { generateTargetedFullFix } from '../readabilityFullFix';

function run(code: string, lang: 'r' | 'python', w = 10, h = 7) {
  const opts = { defaultWidthIn: w, defaultHeightIn: h };
  const p = lang === 'r' ? parseRCode(code, opts) : parsePythonCode(code, opts);
  const result = computeReadability(p, h, w);
  return { result, fixed: generateTargetedFullFix(code, p, result, opts), row: (name: string) => result.elements.find((e) => e.name === name)! };
}

const IMPORT = 'from matplotlib.font_manager import FontProperties\n';
const UNREAD = "SIZES = cfg()\nfig, ax = plt.subplots(figsize=(8, 6))\nax.set_xlabel('x', fontsize=SIZES['x'])\nfig.savefig('f.png', dpi=300)\n";

describe('P13B-R3-02: FontProperties is imported by its own name, where an import may go', () => {
  it('after a module docstring and `from __future__`, before the first other statement', () => {
    const { fixed } = run(`#!/usr/bin/env python\n"""A figure.\n\nTwo lines."""\nfrom __future__ import annotations\n\nimport json\ndef main():\n    import matplotlib.pyplot as plt\n    ${UNREAD.replace(/\n(?=.)/g, '\n    ')}`, 'python');
    expect(fixed).toContain(`from __future__ import annotations\n\n${IMPORT}import json\n`);
  });

  it('after a top-level matplotlib import, past its closing bracket', () => {
    const { fixed } = run(`from matplotlib import (\n    pyplot as plt,\n)\n${UNREAD}`, 'python');
    expect(fixed.startsWith(`from matplotlib import (\n    pyplot as plt,\n)\n${IMPORT}`)).toBe(true);
  });

  it('bound by a bracketed import list or a star import: not added again', () => {
    for (const imp of ['from matplotlib.font_manager import (\n    findfont,\n    FontProperties,\n)\n', 'from matplotlib.font_manager import *\n']) {
      const { fixed } = run(`import matplotlib.pyplot as plt\n${imp}${UNREAD}`, 'python');
      expect(fixed, imp).toContain('FontProperties(size=');
      expect(fixed.split(IMPORT).length, imp).toBe(1);
    }
  });

  it('not bound by `as FP`, nor by an import inside a function', () => {
    for (const imp of ['from matplotlib.font_manager import FontProperties as FP\n', 'def f():\n    from matplotlib.font_manager import FontProperties\n']) {
      const { fixed } = run(`import matplotlib.pyplot as plt\n${imp}${UNREAD}`, 'python');
      expect(fixed, imp).toContain(`import matplotlib.pyplot as plt\n${IMPORT}`);
    }
  });
});

describe('P13B-R3-03: a passing size the check cannot read', () => {
  it('Python: written in a call, it is floored at the size needed and read back unmarked', () => {
    const { fixed, row } = run("import matplotlib.pyplot as plt\nSIZES = cfg()\nfig, ax = plt.subplots(figsize=(8, 6))\nax.set_xlabel('x', fontsize=SIZES['x'])\nfig.savefig('f.png', dpi=300)\n", 'python', 16, 12);
    // At 16 × 12 in the assumed 10 pt prints at 20: it passes there, and is floored anyway.
    expect(row('Axis titles')).toMatchObject({ sourcePt: 10, status: 'pass', assumed: true, kept: false });
    expect(fixed).toContain("ax.set_xlabel('x', fontsize=max(9, FontProperties(size=SIZES['x']).get_size_in_points()))");
  });

  it('Python: a legend title floored beside its legend text reads its own size first (the gate\'s r3-sns-unread-scale: 7.68 pt lowered to 7.04)', () => {
    const { fixed } = run("import json\nimport seaborn as sns\nimport matplotlib.pyplot as plt\ncfg = json.loads('{\"scale\": 0.8}')\nsns.set_theme(context='paper', font_scale=cfg['scale'])\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\nsns.lineplot(x=[0, 1, 2, 3], y=[1, 0, 1, 0], hue=['A', 'A', 'B', 'B'], ax=ax)\nfig.savefig('f.png', dpi=150)\n", 'python', 14, 10);
    expect(fixed).toContain("'legend.title_fontsize': max(7, FontProperties(size=plt.rcParams['legend.title_fontsize'] or plt.rcParams['legend.fontsize']).get_size_in_points())");
  });

  it('Python: a fontdict= it cannot see into takes no fontsize= where it passes, and its row says to check it', () => {
    const { fixed, row } = run("import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(8, 6))\nax.set_xlabel('x', fontdict=style())\nax.set_ylabel('y', fontsize=20)\nax.tick_params(labelsize=20)\nax.set_title('t', fontsize=30)\nfig.savefig('f.png', dpi=300)\n", 'python', 16, 12);
    expect(row('Axis titles')).toMatchObject({ status: 'pass', assumed: true, unread: true, kept: true });
    expect(fixed).not.toContain('fontdict=style(), fontsize=');
  });
});

const R_PLOT = 'p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +\n  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG") +\n';

describe('P13B-R3-01: R15, a name holding a theme', () => {
  it('a complete theme held in a name and added after an element theme replaces it (ggplot2: 16 pt ticks)', () => {
    const { row } = run(`library(ggplot2)\ntheme_big <- theme_bw(base_size = 20)\n${R_PLOT}  theme(axis.text = element_text(size = 6)) + theme_big\nggsave("figure.png", p, width = 7, height = 5)\n`, 'r');
    expect(row('Tick labels').sourcePt).toBe(16);
  });

  it('a plot assigned again inside a block is read in source order, the block\'s theme last (ggplot2: 16)', () => {
    const { row } = run(`library(ggplot2)\nposter <- TRUE\n${R_PLOT}  theme_bw(base_size = 9)\nif (poster) {\n  p <- p + theme_bw(base_size = 16)\n}\nggsave("figure.png", p, width = 7, height = 5)\n`, 'r');
    expect(row('Axis titles').sourcePt).toBe(16);
  });

  it('three deep: a theme object built from another, added by a function that builds each panel (ggplot2: 16)', () => {
    const { row, fixed } = run('library(ggplot2)\nlibrary(cowplot)\nt1 <- theme_bw(base_size = 16)\nt2 <- t1 + theme(legend.position = "bottom")\nmake <- function(d, xv) ggplot(d, aes(.data[[xv]], mpg)) + geom_point() + labs(title = xv) + t2\np1 <- make(mtcars, "wt")\np2 <- make(mtcars, "hp")\nfig <- plot_grid(p1, p2, ncol = 2)\nggsave("figure.png", fig, width = 10, height = 4)\n', 'r', 14, 10);
    expect(row('Axis titles')).toMatchObject({ sourcePt: 16, assumed: false });
    expect(fixed).toBe('');
  });

  it('the edited script\'s `p1 <- p1 + theme(...)` takes none of the three levels: the re-check still reads base 16 (the gate\'s r3-three-deep)', () => {
    const code = 'library(ggplot2)\nlibrary(cowplot)\nt1 <- theme_bw(base_size = 16)\nt2 <- t1 + theme(legend.position = "bottom")\nmake <- function(d, xv) ggplot(d, aes(.data[[xv]], mpg)) + geom_point() + labs(title = xv) + t2\np1 <- make(mtcars, "wt")\np2 <- make(mtcars, "hp")\nfig <- plot_grid(p1, p2, ncol = 2)\nggsave("figure.png", fig, width = 10, height = 4)\n';
    const { fixed } = run(code, 'r');
    expect(fixed).toContain('p1 <- p1 +');
    expect(run(fixed, 'r').row('Plot title')).toMatchObject({ sourcePt: 19.2, status: 'pass' });
  });

  it('reads a long function body full of `name = value` lines in linear time (16,003 lines well under 2 s; 3.9 s before)', () => {
    const body = Array.from({ length: 16000 }, (_, k) => `  v${k % 50} = ${k} + 1`).join('\n');
    const t0 = performance.now();
    const { row } = run(`library(ggplot2)\nmake <- function(d) {\n${body}\n  ggplot(d, aes(x, y)) + geom_point() + theme_bw(base_size = 9)\n}\np <- make(df)\nggsave("f.png", p, width = 7, height = 5)\n`, 'r');
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(row('Axis titles').sourcePt).toBe(9);
  });

  it('`p$theme` (Postr\'s own floor) is a part of p, not p added again', () => {
    const { result } = run(`library(ggplot2)\ncfg <- list(base = 7)\n${R_PLOT}  theme_bw(base_size = cfg$base)\nggsave("figure.png", p +\n  theme(\n  plot.title = element_text(size = max(13, calc_element("plot.title", complete_theme(p$theme))$size))\n), width = 7, height = 5)\n`, 'r');
    expect(result.elements.find((e) => e.name === 'Plot title')).toMatchObject({ sourcePt: 13, assumed: false });
  });
});

describe('P13B-R3-04: the plot a device draws', () => {
  const head = `library(ggplot2)\n${R_PLOT}  theme_classic(base_size = 10)\n`;

  it('a print() after dev.off() draws on no device: the device\'s own plot is themed', () => {
    const { fixed } = run(`${head}q <- p\npng("a.png", width = 8, height = 6, units = "in", res = 300)\nprint(p)\ndev.off()\nprint(q)\n`, 'r');
    expect(fixed).toContain('print(p +\n  theme(');
    expect(fixed).toContain('dev.off()\nprint(q)\n');
  });

  it('ragg\'s agg_tiff() in pixels at its res', () => {
    const { result } = run(`${head}agg_tiff("a.tiff", width = 2400, height = 1800, res = 300)\nprint(p)\ndev.off()\n`, 'r');
    expect(result.scale).toBeCloseTo(7 / 6, 6);
  });

  it('grid.arrange() inside ggsave() is a figure that combines plots: each is themed before it', () => {
    const { fixed } = run('library(ggplot2)\nlibrary(gridExtra)\np1 <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + labs(x = "Weight", y = "MPG") + theme_bw(base_size = 9)\np2 <- ggplot(mtcars, aes(hp, mpg)) + geom_point() + labs(x = "Power", y = "MPG") + theme_bw(base_size = 9)\nggsave("figure.png", grid.arrange(p1, p2, ncol = 2), width = 10, height = 4)\n', 'r');
    expect(fixed).toMatch(/\np1 <- p1 \+\n {2}theme\(/);
    expect(fixed).toContain('ggsave("figure.png", grid.arrange(p1, p2, ncol = 2), width = 10, height = 4)');
  });
});
