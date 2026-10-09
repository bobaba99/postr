/**
 * Fix 13b, review round 3 (record docs/fixes/13b-checker-sizes.md section 9):
 * the reviewer's scenarios that found a defect, and the siblings the
 * correction found, entered where a visitor enters (/tools/figure-readability:
 * a print size typed, the script pasted, ▶ Check, the table read, the edited
 * script read and checked again). Each script is also in the gates' corpora
 * (scripts/fixtures/checker-corpus/r3-*, checker-corpus-r/r3-*), which run the
 * original and the edited script in matplotlib 3.10.8 / seaborn 0.13.2 and
 * ggplot2 4.0.3 (cowplot, gridExtra, ragg): the sizes expected here are the
 * ones those renderers draw.
 *
 * Re-run: npx vitest run src/pages/__tests__/figureReadabilityReview3.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));
vi.mock('@/lib/apiClient', () => ({ postJson: vi.fn(), ApiError: class extends Error {} }));

import { check, editedCode, renderPage, row, scaleLine, typeSize } from './checkerPageDriver';

beforeEach(() => {
  sessionStorage.clear();
});

const LABS = (title: string) => `labs(title = "${title}", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders")`;
const SHARED_THEME = `library(ggplot2)
library(gridExtra)

theme_fig <- theme_bw(base_size = 16) + theme(legend.position = "bottom")
p1 <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  ${LABS('Weight')} + theme_fig
p2 <- ggplot(mtcars, aes(hp, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  ${LABS('Power')} + theme_fig
g <- arrangeGrob(p1, p2, ncol = 2)
ggsave("figure.png", g, width = 10, height = 4.5)
`;
const FUNCTION_PANELS = `library(ggplot2)
library(cowplot)

make_panel <- function(d, xlab) {
  ggplot(d, aes(x, y, colour = g)) + geom_point(size = 2) +
    labs(x = xlab, y = "Response", title = "Panel", colour = "Group") +
    theme_bw(base_size = 16)
}
set.seed(1)
d <- data.frame(x = 1:20, y = rnorm(20), g = rep(c("a", "b"), 10))
p1 <- make_panel(d, "Dose (mg)")
p2 <- make_panel(d, "Time (h)")
fig <- plot_grid(p1, p2, ncol = 2)
ggsave("figure.png", fig, width = 10, height = 4)
`;

describe('P13B-R3-01: a theme held in a name applies where the name is used', () => {
  it('a shared theme object (theme_fig) is read in each plot a figure combines: base 16, nothing to set at 14 × 10 in', () => {
    renderPage();
    typeSize(14, 10);
    check(SHARED_THEME);
    expect(row('Axis titles')).toEqual({ source: '16pt', print: '22.4pt', glyph: '✓' });
    expect(row('Tick labels')).toEqual({ source: '12.8pt', print: '17.9pt', glyph: '✓' });
    expect(screen.queryByText(/No base_size found/)).toBeNull();
    expect(editedCode()).toBe('');
  });

  it('at 10 × 7 in the edited script raises only what falls short, and sets no size below the one ggplot2 draws', () => {
    renderPage();
    typeSize(10, 7);
    check(SHARED_THEME);
    expect(row('Plot title')).toEqual({ source: '19.2pt', print: '19.2pt', glyph: '✓' });
    expect(row('Axis titles')).toEqual({ source: '16pt', print: '16pt', glyph: '⚠' });
    const fixed = editedCode();
    // ggplot2 draws the titles at 19.2 and the legend title at 16: never written smaller.
    expect(fixed).not.toContain('text = element_text(size = 11)');
    expect(fixed).not.toMatch(/plot\.title = element_text\(size = \d/);
    expect(fixed).not.toMatch(/legend\.title = element_text\(size = \d/);
    expect(fixed).toMatch(/p1 <- p1 \+\n {2}theme\(\n {2}axis\.title = element_text\(size = 18\),\n {2}axis\.text = element_text\(size = 14\)/);
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '19.2pt', print: '19.2pt', glyph: '✓' });
    expect(row('Axis titles')).toEqual({ source: '18pt', print: '18pt', glyph: '✓' });
  });

  it('a function that builds each panel (make_panel) is read where it is called: base 16', () => {
    renderPage();
    typeSize(14, 10);
    check(FUNCTION_PANELS);
    expect(row('Axis titles')).toEqual({ source: '16pt', print: '22.4pt', glyph: '✓' });
    expect(editedCode()).toBe('');
  });

  it('a plot built from another plot (p2 <- p1 + ...) takes the theme p1 was given', () => {
    renderPage();
    typeSize(14, 10);
    check(`library(ggplot2)\nlibrary(cowplot)\n\np1 <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +\n  ${LABS('Weight')} +\n  theme_bw(base_size = 16)\np2 <- p1 + aes(x = hp) + labs(title = "Power", x = "Horsepower")\nfig <- plot_grid(p1, p2, ncol = 2)\nggsave("figure.png", fig, width = 10, height = 4)\n`);
    expect(row('Axis titles')).toEqual({ source: '16pt', print: '22.4pt', glyph: '✓' });
    expect(editedCode()).toBe('');
  });

  it('one plot: a theme() held in a name and added after the complete theme wins, so the fix never lowers it', () => {
    renderPage();
    typeSize(10, 7);
    check(`library(ggplot2)\n\ntheme_ticks <- theme(axis.text = element_text(size = 20))\np <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +\n  ${LABS('Weight and economy')} +\n  theme_bw(base_size = 9) + theme_ticks\nggsave("figure.png", p, width = 7, height = 5)\n`);
    expect(row('Tick labels')).toEqual({ source: '20pt', print: '28pt', glyph: '✓' });
    expect(row('Axis titles')).toEqual({ source: '9pt', print: '12.6pt', glyph: '✗' });
    // The script's own theme_ticks line stays; the theme() the fix adds sets no tick size.
    expect(editedCode()).not.toMatch(/\n {2}axis\.text = element_text/);
  });

  it('one plot: a theme() that previews another version of the plot is not read for the plot ggsave() saves', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\n\np <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +\n  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG") +\n  theme_bw(base_size = 9)\nprint(p + theme(axis.text = element_text(size = 30)))\nggsave("figure.png", p, width = 7, height = 5)\n');
    expect(row('Tick labels')).toEqual({ source: '7.2pt', print: '10.1pt', glyph: '✗' });
  });
});

describe('P13B-R3-02: the floor on a size the check cannot read runs', () => {
  const head = 'import configparser\n\nimport numpy as np\nimport matplotlib.pyplot as plt\n\ncfg = configparser.ConfigParser()\ncfg.read_string("[plot]\\nfont_size = 9\\n")\n';
  const body = "\nx = np.linspace(0, 10, 50)\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\nax.plot(x, np.sin(x), label='signal')\nax.set_title('Response over time')\nax.set_xlabel('Time (s)')\nax.set_ylabel('Amplitude')\nax.legend()\nfig.savefig('fig.png', dpi=150)\n";

  it('font.size held as a string (configparser) is floored as a number: max(N, float(EXPR))', () => {
    renderPage();
    typeSize(10, 7);
    check(`${head}plt.rcParams['font.size'] = cfg['plot']['font_size']\n${body}`);
    const fixed = editedCode();
    expect(fixed).toContain("plt.rcParams['font.size'] = max(13, float(cfg['plot']['font_size']))");
    check(fixed);
    expect(row('Axis titles')).toEqual({ source: '13pt', print: '19pt', glyph: '✓' });
  });

  it('the same in rcParams.update() and in plt.rc(\'font\', size=...)', () => {
    renderPage();
    typeSize(10, 7);
    check(`${head}plt.rcParams.update({'font.size': cfg.get('plot', 'font_size')})\n${body}`);
    expect(editedCode()).toContain("plt.rcParams.update({'font.size': max(13, float(cfg.get('plot', 'font_size')))})");
    check(`${head}plt.rc('font', size=cfg.get('plot', 'font_size'))\n${body}`);
    expect(editedCode()).toContain("plt.rc('font', size=max(13, float(cfg.get('plot', 'font_size'))))");
  });

  const future = "from __future__ import annotations\n\nfrom types import SimpleNamespace\n\nSIZES = SimpleNamespace(title=9, label=9)\n\n\ndef main() -> None:\n    import numpy as np\n    import matplotlib\n    matplotlib.use('Agg')\n    import matplotlib.pyplot as plt\n\n    x = np.linspace(0, 10, 50)\n    fig, ax = plt.subplots(figsize=(6.4, 4.8))\n    ax.plot(x, np.exp(-x / 4) * np.cos(x))\n    ax.set_title('Damped response', fontsize=SIZES.title)\n    ax.set_xlabel('Time (s)', fontsize=SIZES.label)\n    ax.set_ylabel('Amplitude', fontsize=SIZES.label)\n    fig.savefig('damped.png', dpi=150)\n\n\nif __name__ == '__main__':\n    main()\n";

  it('the FontProperties import goes after `from __future__` (a SyntaxError above it)', () => {
    renderPage();
    typeSize(10, 7);
    check(future);
    const fixed = editedCode();
    expect(fixed.startsWith('from __future__ import annotations\n')).toBe(true);
    expect(fixed).toMatch(/^from matplotlib\.font_manager import FontProperties$/m);
    expect(fixed).toContain("ax.set_title('Damped response', fontsize=max(13, FontProperties(size=SIZES.title).get_size_in_points()))");
  });

  it('a FontProperties imported under another name (as FP) does not bind FontProperties: the import is added', () => {
    renderPage();
    typeSize(10, 7);
    check("from types import SimpleNamespace\n\nimport numpy as np\nimport matplotlib.pyplot as plt\nfrom matplotlib.font_manager import FontProperties as FP\n\nSIZES = SimpleNamespace(title=9, label=9)\nlegend_font = FP(family='sans-serif', size=14)\n\nx = np.linspace(0, 10, 50)\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\nax.plot(x, np.sin(x), label='sin')\nax.set_title('Wave', fontsize=SIZES.title)\nax.set_xlabel('Phase', fontsize=SIZES.label)\nax.set_ylabel('Value', fontsize=SIZES.label)\nax.legend(prop=legend_font)\nfig.savefig('wave.png', dpi=150)\n");
    expect(editedCode()).toMatch(/^from matplotlib\.font_manager import FontProperties$/m);
    // The reader knows the alias too (the gate's r3-fp-alias: Legend text read at the default 10, real 14).
    expect(row('Legend text')).toEqual({ source: '14pt', print: '20.4pt', glyph: '✓' });
  });
});

describe('P13B-R3-03: every drawn size resting on a value the check cannot read is floored, not only the short ones', () => {
  it('Python: a seaborn font_scale from a config: ticks and legend pass at the assumed size and are floored too', () => {
    renderPage();
    typeSize(10, 7);
    check("import json\n\nimport numpy as np\nimport pandas as pd\nimport seaborn as sns\nimport matplotlib.pyplot as plt\n\ncfg = json.loads('{\"scale\": 0.8}')\nsns.set_theme(context='paper', style='ticks', font_scale=cfg['scale'])\n\nrng = np.random.default_rng(9)\ndf = pd.DataFrame({'t': np.tile(np.arange(20), 2), 'y': rng.normal(size=40).cumsum(), 'arm': np.repeat(['A', 'B'], 20)})\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\nsns.lineplot(data=df, x='t', y='y', hue='arm', ax=ax)\nax.set_title('Trajectories')\nax.set_xlabel('Day')\nax.set_ylabel('Score')\nfig.savefig('traj.png', dpi=150)\n");
    expect(row('Tick labels')).toEqual({ source: '10pt*', print: '14.6pt', glyph: '✓' });
    const fixed = editedCode();
    expect(fixed).toContain("'xtick.labelsize': max(10, FontProperties(size=plt.rcParams['xtick.labelsize']).get_size_in_points())");
    expect(fixed).toContain("'legend.fontsize': max(10, FontProperties(size=plt.rcParams['legend.fontsize']).get_size_in_points())");
    check(fixed);
    expect(row('Tick labels')).toEqual({ source: '10pt', print: '14.6pt', glyph: '✓' });
    expect(row('Legend text')).toEqual({ source: '10pt', print: '14.6pt', glyph: '✓' });
  });

  const rUnread = 'library(ggplot2)\n\ncfg <- list(base = 7, width = 7, height = 5)\np <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +\n  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders") +\n  theme_bw(base_size = cfg$base)\nggsave("figure.png", p, width = 7, height = 5)\n';

  it('R: a base_size from a list: the plot title and legend title pass at the assumed 11 and are floored too', () => {
    renderPage();
    typeSize(10, 7);
    check(rUnread);
    expect(row('Plot title')).toEqual({ source: '13.2pt*', print: '18.5pt', glyph: '✓' });
    const fixed = editedCode();
    expect(fixed).toContain('plot.title = element_text(size = max(13, calc_element("plot.title", complete_theme(p$theme))$size))');
    expect(fixed).toContain('legend.title = element_text(size = max(10, calc_element("legend.title", complete_theme(p$theme))$size))');
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '13pt', print: '18.2pt', glyph: '✓' });
    expect(row('Legend title')).toEqual({ source: '10pt', print: '14pt', glyph: '✓' });
  });

  it('the legend says the edited script raises such a size to at least the size needed, with no "left as written"', () => {
    renderPage();
    typeSize(10, 7);
    check(rUnread);
    expect(screen.getByText(/The edited script raises it to at least the size needed, read when the script runs/)).toBeInTheDocument();
    expect(screen.queryByText(/where it passes, the size is left as written/)).toBeNull();
    expect(screen.queryByText(/can be left as written/)).toBeNull();
  });

  it('a fontdict= the check cannot see into is the one size left as written where it passes: the legend says so', () => {
    renderPage();
    typeSize(16, 12);
    check("import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(8, 6))\nax.set_xlabel('x', fontdict=style())\nax.set_ylabel('y', fontsize=20)\nax.tick_params(labelsize=20)\nax.set_title('t', fontsize=30)\nfig.savefig('f.png', dpi=300)\n");
    expect(row('Axis titles')).toEqual({ source: '10pt*', print: '20pt', glyph: '✓' });
    expect(screen.getByText(/a fontdict= it cannot see into, can be left as written: check that one yourself/)).toBeInTheDocument();
    // Nothing the script may set: no script (it would be the user's own), and the all-pass line says to check by hand.
    expect(editedCode()).toBe('');
    expect(screen.getByText('Every element in the table meets its minimum, with the sizes marked * assumed: check those yourself.')).toBeInTheDocument();
  });

  const declined = (save: string) => `library(ggplot2)\nlibrary(cowplot)\nfig <- plot_grid(ggplot(mtcars, aes(wt, mpg)) + geom_point() + theme_bw(base_size = 9), ncol = 1)\n${save}\n`;

  it('the one size the script cannot set is in a plot the check cannot find by name: the legend says so, with and without a script', () => {
    renderPage();
    typeSize(10, 7);
    check(declined('ggsave("f.png", fig, width = 7, height = 5)'));
    expect(editedCode()).toBe('');
    expect(screen.getByText(/It is in a plot the check cannot find by name, such as one made inside the call that combines plots, so the edited script cannot set it: check it yourself\./)).toBeInTheDocument();
    // A width it cannot read is replaced, so a script is offered; the marked sizes are still left.
    check(declined('ggsave("f.png", fig, width = w_fig, height = 5)'));
    expect(editedCode()).toContain('width = 10, height = 7');
    expect(screen.getByText(/The edited script below sets it, except a size in a plot the check cannot find by name/)).toBeInTheDocument();
  });
});

describe('P13B-R3-04: the plot a device draws, however it is drawn', () => {
  const plot = 'library(ggplot2)\n\np <- ggplot(iris, aes(Sepal.Length, Petal.Length, colour = Species)) +\n  geom_point(size = 2) +\n  labs(title = "Iris morphology", x = "Sepal length (cm)", y = "Petal length (cm)") +\n  theme_classic(base_size = 10)\n\n';

  it('png() then the plot on a line of its own (autoprint): the device is the canvas and the edited script prints the themed plot', () => {
    renderPage();
    typeSize(10, 7);
    check(`${plot}png("figure1.png", width = 8, height = 6, units = "in", res = 300)\np\ndev.off()\n`);
    expect(scaleLine()).toMatch(/^Scale factor: 1\.17x(?!\*)/);
    expect(screen.queryByText(/No ggsave\(\) found/)).toBeNull();
    const fixed = editedCode();
    expect(fixed).toContain('png("figure1.png", width = 8, height = 6, units = "in", res = 300)\nprint(p +\n  theme(');
    expect(fixed).not.toContain('poster_figure.png');
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '16pt', print: '18.7pt', glyph: '✓' });
  });

  it('pdf() then a ggplot() chain on its own: the chain is printed with the theme', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\n\npdf("figure2.pdf", width = 7, height = 5)\nggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) +\n  geom_point(size = 2) +\n  labs(title = "Fuel economy", x = "Weight (1000 lb)", y = "Miles per gallon", colour = "Cylinders") +\n  theme_bw(base_size = 9)\ndev.off()\n');
    expect(scaleLine()).toMatch(/^Scale factor: 1\.40x(?!\*)/);
    const fixed = editedCode();
    expect(fixed).toMatch(/pdf\("figure2\.pdf", width = 7, height = 5\)\nprint\(\(ggplot\(mtcars/);
    expect(fixed).not.toContain('poster_figure.png');
  });

  it('png() then grid.arrange(p1, p2): each plot is themed before it is arranged', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\nlibrary(gridExtra)\n\np1 <- ggplot(airquality, aes(Temp, Ozone)) + geom_point(na.rm = TRUE) +\n  labs(x = "Temperature (F)", y = "Ozone (ppb)") + theme_minimal(base_size = 9)\np2 <- ggplot(airquality, aes(factor(Month), Ozone)) + geom_boxplot(na.rm = TRUE) +\n  labs(x = "Month", y = "Ozone (ppb)") + theme_minimal(base_size = 9)\n\npng("figure3.png", width = 10, height = 4, units = "in", res = 300)\ngrid.arrange(p1, p2, ncol = 2)\ndev.off()\n');
    expect(scaleLine()).toMatch(/^Scale factor: 1\.00x(?!\*)/);
    const fixed = editedCode();
    expect(fixed.indexOf('p2 <- p2 +')).toBeGreaterThan(0);
    expect(fixed.indexOf('p2 <- p2 +')).toBeLessThan(fixed.indexOf('grid.arrange(p1, p2, ncol = 2)'));
    expect(fixed).not.toContain('poster_figure.png');
    check(fixed);
    expect(row('Axis titles')).toEqual({ source: '18pt', print: '18pt', glyph: '✓' });
  });

  it("ragg's agg_png() is a device too", () => {
    renderPage();
    typeSize(10, 7);
    check(`${plot}library(ragg)\nagg_png("figure1.png", width = 8, height = 6, units = "in", res = 300)\nprint(p)\ndev.off()\n`);
    expect(scaleLine()).toMatch(/^Scale factor: 1\.17x(?!\*)/);
    expect(editedCode()).toContain('print(p +\n  theme(');
  });

  it('a device whose plot the check cannot find is said, and the copy does not claim there is no device', () => {
    renderPage();
    typeSize(10, 7);
    check(`${plot}png("figure1.png", width = 8, height = 6, units = "in", res = 300)\nplot(p)\ndev.off()\n`);
    expect(screen.getByText(/Found png\(\) but not the plot it draws/)).toBeInTheDocument();
    expect(editedCode()).toContain('ggsave("poster_figure.png"');
    expect(screen.queryByText(/Without a ggsave\(\) or a device/)).toBeNull();
  });
});
