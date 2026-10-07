/**
 * Fix 13b, review round 2 (record docs/fixes/13b-checker-sizes.md section 9):
 * the reviewer's scenarios that found a defect, entered where a visitor
 * enters (/tools/figure-readability: a print size typed, the script pasted,
 * ▶ Check, the table read, the edited script read and checked again). Each
 * script is also in the gates' corpora (scripts/fixtures/checker-corpus/r2-*,
 * checker-corpus-r/r2-*), which run the original and the edited script in
 * matplotlib 3.10.8 / seaborn 0.13.2 and ggplot2 4.0.3 (cowplot 1.2.0,
 * gridExtra 2.3.1): the sizes expected here are the ones those renderers draw.
 *
 * Re-run: npx vitest run src/pages/__tests__/figureReadabilityReview2.test.tsx
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

const R_PLOTS = (b1: number, b2: number) => `library(ggplot2)
p1 <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(x = "Weight (1000 lb)", y = "Miles per gallon") +
  theme_bw(base_size = ${b1})
p2 <- ggplot(mtcars, aes(factor(cyl), hp)) + geom_boxplot() +
  labs(x = "Cylinders", y = "Horsepower") +
  theme_bw(base_size = ${b2})
`;

describe('P13B-R2-01: a combined figure (cowplot, gridExtra) is themed in each plot it combines', () => {
  it('gridExtra: the theme goes into each plot before arrangeGrob(), never onto the gtable ggsave() saves', () => {
    renderPage();
    typeSize(10, 7);
    check(`library(gridExtra)\n${R_PLOTS(9, 9)}g <- arrangeGrob(p1, p2, ncol = 2)\nggsave("figure3.png", g, width = 10, height = 4, dpi = 300)\n`);
    expect(row('Axis titles')).toEqual({ source: '9pt', print: '9pt', glyph: '✗' });
    const fixed = editedCode();
    // `g + theme()` is NULL for a gtable: ggsave() then writes a blank image.
    expect(fixed).toContain('ggsave("figure3.png", g, width = 10, height = 4, dpi = 300)');
    expect(fixed).not.toMatch(/\bg \+/);
    expect(fixed).toMatch(/# Postr: text sizes for this print size, in each plot the figure combines\np1 <- p1 \+\n {2}theme\(\n {2}plot\.title = element_text\(size = 18\),\n {2}axis\.title = element_text\(size = 18\),\n {2}axis\.text = element_text\(size = 14\)/);
    expect(fixed).toMatch(/\np2 <- p2 \+\n {2}theme\(/);
    expect(fixed.indexOf('p2 <- p2 +')).toBeLessThan(fixed.indexOf('g <- arrangeGrob(p1, p2, ncol = 2)'));
    check(fixed);
    expect(row('Axis titles')).toEqual({ source: '18pt', print: '18pt', glyph: '✓' });
    expect(row('Tick labels')).toEqual({ source: '14pt', print: '14pt', glyph: '✓' });
  });

  it('cowplot: the theme goes into each plot before plot_grid(), not onto its canvas', () => {
    renderPage();
    typeSize(10, 7);
    check(`library(cowplot)\n${R_PLOTS(9, 9)}combined <- plot_grid(p1, p2, labels = c("A", "B"), label_size = 14, ncol = 2)\nggsave("figure2.png", combined, width = 10, height = 4.5, dpi = 300)\n`);
    const fixed = editedCode();
    expect(fixed).toContain('ggsave("figure2.png", combined, width = 10, height = 4.5, dpi = 300)');
    expect(fixed).not.toMatch(/combined \+/);
    expect(fixed.indexOf('p1 <- p1 +')).toBeLessThan(fixed.indexOf('combined <- plot_grid('));
    // One number cannot fix two plots' themes.
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });

  it('the plots it combines are each read: the smaller one decides the row, whichever is written last', () => {
    renderPage();
    typeSize(10, 7);
    check(`library(cowplot)\n${R_PLOTS(9, 20)}combined <- plot_grid(p1, p2, ncol = 2)\nggsave("figure2.png", combined, width = 10, height = 4.5, dpi = 300)\n`);
    expect(row('Axis titles')).toEqual({ source: '9pt', print: '9pt', glyph: '✗' });
    expect(row('Tick labels').source).toBe('7.2pt');
  });

  it('plots the check cannot name (made inside the call) are not themed, and their rows stay marked', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\nlibrary(cowplot)\ncombined <- plot_grid(ggplot(mtcars, aes(wt, mpg)) + geom_point() + theme_bw(base_size = 9), ncol = 1)\nggsave("figure2.png", combined, width = 10, height = 4.5, dpi = 300)\n');
    expect(row('Axis titles').source).toMatch(/\*$/);
    expect(row('Axis titles').glyph).not.toBe('✓');
    expect(editedCode()).not.toMatch(/combined \+/);
    expect(screen.getByText(/combines plots the check cannot find/)).toBeInTheDocument();
  });
});

describe('P13B-R2-02: a panel letter set with set_title(loc="left") is a title of its own', () => {
  const panels = "import numpy as np\nimport matplotlib.pyplot as plt\n\nrng = np.random.default_rng(7)\nfig, (ax_a, ax_b) = plt.subplots(1, 2, figsize=(10, 4))\nax_a.hist(rng.normal(size=300), bins=25)\nax_a.set_title('Baseline distribution', fontsize=9)\nax_a.set_title('A', loc='left', fontweight='bold', fontsize=20)\nax_b.scatter(rng.normal(size=80), rng.normal(size=80), s=12)\nax_b.set_title('Pre vs post', fontsize=9)\nax_b.set_title('B', loc='left', fontweight='bold', fontsize=20)\nfor ax in (ax_a, ax_b):\n    ax.set_xlabel('Value', fontsize=14)\n    ax.set_ylabel('Count', fontsize=14)\n    ax.tick_params(labelsize=12)\nfig.tight_layout()\nfig.savefig('panels.png', dpi=300)\n";

  it('the 9 pt centre titles decide the row, and the fix raises each where it is written, leaving the letters', () => {
    renderPage();
    typeSize(14, 10);
    check(panels);
    expect(row('Plot title')).toEqual({ source: '9pt', print: '12.6pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toContain("ax_a.set_title('Baseline distribution', fontsize=13)");
    expect(fixed).toContain("ax_b.set_title('Pre vs post', fontsize=13)");
    expect(fixed).toContain("ax_a.set_title('A', loc='left', fontweight='bold', fontsize=20)");
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '13pt', print: '18.2pt', glyph: '✓' });
  });

  it('P20: a size set in a loop over a subplots array (`for ax in axs.flat`) is set on each of its Axes', () => {
    renderPage();
    typeSize(10, 7);
    check("import matplotlib.pyplot as plt\nfig, axs = plt.subplots(2, 2, figsize=(10, 7))\nfor ax in axs.flat:\n    ax.plot([0, 1], [0, 1])\n    ax.tick_params(labelsize=18)\nfig.savefig('grid.png', dpi=300)\n");
    expect(row('Tick labels')).toEqual({ source: '18pt', print: '18pt', glyph: '✓' });
  });

  it('a loop over Axes the check cannot name (fig.axes) keeps its size as a text of its own: the smaller wins', () => {
    renderPage();
    typeSize(10, 7);
    check("import matplotlib.pyplot as plt\nfig, axs = plt.subplots(1, 2, figsize=(10, 7))\nfor ax in fig.axes:\n    ax.tick_params(labelsize=7)\nfig.savefig('grid.png', dpi=300)\n");
    expect(row('Tick labels')).toEqual({ source: '7pt', print: '7pt', glyph: '✗' });
  });

  it('P13B-R2-13: tick sizes set in a loop over the unpacked Axes are read for each of them', () => {
    renderPage();
    typeSize(10, 7);
    check(panels);
    expect(row('Tick labels')).toEqual({ source: '12pt', print: '12pt', glyph: '⚠' });
    expect(screen.queryByText(/No font size found for some text/)).toBeNull();
  });
});

describe('P13B-R2-03: a size the code sets but the check cannot read is never lowered', () => {
  const config = "import numpy as np\nimport matplotlib.pyplot as plt\n\nCONFIG = {'font_size': 20, 'figsize': (8, 6), 'dpi': 300}\n\nplt.rcParams['font.size'] = CONFIG['font_size']\nrng = np.random.default_rng(15)\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot(rng.normal(size=30).cumsum(), label='Treatment')\nax.plot(rng.normal(size=30).cumsum(), label='Placebo')\nax.set_xlabel('Week')\nax.set_ylabel('Symptom score')\nax.set_title('Trial outcome')\nax.legend()\nfig.tight_layout()\nfig.savefig('trial.png', dpi=CONFIG['dpi'])\n";

  it('Python: rows resting on an unread font.size are not pinned at the default; one that falls short floors font.size where it is written', () => {
    renderPage();
    typeSize(14, 10);
    check(config);
    expect(row('Axis titles').source).toBe('10pt*');
    expect(screen.getByText(/Not read from your code\./)).toBeInTheDocument();
    const fixed = editedCode();
    // float(): matplotlib takes a string font.size, which max() cannot compare (review round 3, P13B-R3-02).
    expect(fixed).toContain("plt.rcParams['font.size'] = max(11, float(CONFIG['font_size']))");
    expect(fixed).not.toMatch(/'(?:axes\.titlesize|axes\.labelsize|xtick\.labelsize|ytick\.labelsize|legend\.fontsize)': \d/);
  });

  it('Python: a size written in a way the check cannot read, that falls short, is floored where it is written', () => {
    renderPage();
    typeSize(10, 7);
    check("import matplotlib.pyplot as plt\nSIZES = {'label': 8}\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot([0, 1], [0, 1])\nax.set_xlabel('Week', fontsize=SIZES['label'])\nax.set_ylabel('Score', fontsize=SIZES['label'])\nfig.savefig('f.png', dpi=300)\n");
    const fixed = editedCode();
    expect(fixed).toContain("ax.set_xlabel('Week', fontsize=max(16, FontProperties(size=SIZES['label']).get_size_in_points()))");
    expect(fixed).toContain('from matplotlib.font_manager import FontProperties');
    // The floor is read back as at least its number (P21), unmarked, and a second fix keeps it.
    check(fixed);
    expect(row('Axis titles')).toEqual({ source: '16pt', print: '18.7pt', glyph: '✓' });
    typeSize(14, 10);
    check(fixed.replace(/figsize=\(8, 6\)/, 'figsize=(16, 12)'));
    expect(editedCode()).toContain("fontsize=max(22, FontProperties(size=SIZES['label']).get_size_in_points())");
  });

  it('Python: a named size (\'large\') on a font.size the check cannot read is unread too, and floored where it is written', () => {
    renderPage();
    typeSize(10, 7);
    check("import matplotlib.pyplot as plt\nCFG = {'fs': 9}\nplt.rcParams['font.size'] = CFG['fs']\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot([0, 1], [0, 1])\nax.set_title('Trend', fontsize='large')\nfig.savefig('f.png', dpi=300)\n");
    expect(row('Plot title').source).toBe('12pt*');
    expect(editedCode()).toContain("ax.set_title('Trend', fontsize=max(16, FontProperties(size='large').get_size_in_points()))");
  });

  it('R: rows resting on an unread base_size are set with a floor at what ggplot2 draws, never a smaller constant', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\n\ncfg <- list(base = 20, width = 7, height = 5)\n\np <- ggplot(ToothGrowth, aes(factor(dose), len, fill = supp)) +\n  geom_boxplot() +\n  labs(title = "Tooth growth", x = "Dose (mg/day)", y = "Length", fill = "Supplement") +\n  theme_classic(base_size = cfg$base)\nggsave("teeth.png", p, width = 7, height = 5, dpi = 300)\n');
    expect(row('Axis titles').source).toBe('11pt*');
    const fixed = editedCode();
    expect(fixed).toContain('axis.title.x = element_text(size = max(13, calc_element("axis.title.x", complete_theme(p$theme))$size))');
    expect(fixed).not.toMatch(/(?<!max\()\b(?:axis\.title|plot\.title|legend\.text) = element_text\(size = \d/);
    expect(fixed).not.toContain('text = element_text(size = 11)');
  });
});

describe('P13B-R2-04: an R name followed by a comment is read', () => {
  it('base_size from `base_fs <- 22  # ...`', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\nbase_fs <- 22  # base font size for the poster\ntick_fs <- 8   # tick labels\np <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) +\n  geom_point() +\n  labs(title = "Fuel use", x = "Weight", y = "MPG", colour = "Cyl") +\n  theme_bw(base_size = base_fs) +\n  theme(axis.text = element_text(size = tick_fs))\nggsave("fig.png", p, width = 7, height = 5)\n');
    expect(row('Axis titles')).toEqual({ source: '22pt', print: '30.8pt', glyph: '✓' });
    expect(row('Tick labels')).toEqual({ source: '8pt', print: '11.2pt', glyph: '✗' });
    expect(screen.queryByText(/base_size is set from a variable/)).toBeNull();
  });

  it('a ggsave() width and height from `fig_w <- 18   # cm`', () => {
    renderPage();
    typeSize(14, 10);
    check('library(ggplot2)\n\nfig_w <- 18   # cm, two-column width\nfig_h <- 12   # cm\n\np <- ggplot(economics, aes(date, unemploy / 1000)) +\n  geom_line() +\n  labs(title = "US unemployment", x = NULL, y = "Unemployed (millions)") +\n  theme_light(base_size = 9)\nggsave("unemployment.pdf", p, width = fig_w, height = fig_h, units = "cm")\n');
    expect(scaleLine()).toMatch(/^Scale factor: 1\.98x(?!\*)/);
    expect(row('Plot title')).toEqual({ source: '10.8pt', print: '21.3pt', glyph: '✓' });
    expect(screen.queryByText(/could not read its width\/height/)).toBeNull();
  });
});

describe('P13B-R2-05: PdfPages.savefig(fig, ...) is a save of fig', () => {
  it('the fit block measures the figure, never the PdfPages object', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport matplotlib.pyplot as plt\nfrom matplotlib.backends.backend_pdf import PdfPages\n\nplt.rcParams['font.size'] = 9\nrng = np.random.default_rng(13)\nwith PdfPages('figure_report.pdf') as pdf:\n    fig, ax = plt.subplots(figsize=(6, 4))\n    ax.plot(rng.normal(size=40).cumsum(), label='Run 1')\n    ax.set_xlabel('Iteration')\n    ax.set_title('Training loss')\n    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))\n    pdf.savefig(fig, bbox_inches='tight')\n    plt.close(fig)\n");
    const fixed = editedCode();
    expect(fixed).toContain('    poster_fig = fig\n');
    expect(fixed).not.toContain('poster_fig = pdf');
    expect(fixed).toContain("pdf.savefig(fig, bbox_inches=poster_box)");
  });
});

describe('P13B-R2-06: a colorbar seaborn or pandas makes is read', () => {
  it('sns.heatmap: its colorbar ticks and label are rows of their own', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport pandas as pd\nimport seaborn as sns\nimport matplotlib.pyplot as plt\n\nsns.set_theme(style='white')\nrng = np.random.default_rng(3)\ndf = pd.DataFrame(rng.normal(size=(40, 6)), columns=['IL6', 'TNF', 'CRP', 'IL10', 'IFNg', 'IL1b'])\ncorr = df.corr()\n\nfig, ax = plt.subplots(figsize=(7, 6))\nsns.heatmap(corr, annot=True, fmt='.2f', cmap='vlag', vmin=-1, vmax=1, square=True,\n            cbar_kws={'label': 'Pearson r', 'shrink': 0.8}, ax=ax)\nax.set_title('Cytokine correlations', fontsize=20)\nax.tick_params(labelsize=16)\nfig.tight_layout()\nfig.savefig('heatmap.png', dpi=300)\n");
    expect(row('Tick labels')).toEqual({ source: '11pt', print: '12.8pt', glyph: '⚠' });
    expect(row('Axis titles')).toEqual({ source: '12pt', print: '14pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toMatch(/'ytick\.labelsize': 12/);
    expect(fixed).toMatch(/'axes\.labelsize': 16/);
    check(fixed);
    expect(row('Tick labels').glyph).toBe('✓');
    expect(row('Axis titles').glyph).toBe('✓');
  });

  it('a colorbar named by `cbar = ax.collections[0].colorbar` takes its own sizes, and plt.xticks() sizes the plot, not the colorbar', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport seaborn as sns\nimport matplotlib.pyplot as plt\n\nfig, ax = plt.subplots(figsize=(7, 6))\nsns.heatmap(np.eye(4), ax=ax)\nplt.xticks(fontsize=16)\nplt.yticks(fontsize=16)\ncbar = ax.collections[0].colorbar\ncbar.ax.tick_params(labelsize=16)\nfig.savefig('heatmap.png', dpi=300)\n");
    expect(row('Tick labels')).toEqual({ source: '16pt', print: '18.7pt', glyph: '✓' });
  });

  it('pandas plot.scatter(c=column): its colorbar label is an axis title at axes.labelsize', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\nrng = np.random.default_rng(14)\ndf = pd.DataFrame({'depth': rng.uniform(0, 100, 80), 'temp': rng.normal(12, 3, 80), 'oxygen': rng.uniform(2, 9, 80)})\nfig, ax = plt.subplots(figsize=(7, 5))\ndf.plot.scatter(x='depth', y='temp', c='oxygen', colormap='viridis', ax=ax, s=25)\nax.set_xlabel('Depth (m)', fontsize=16)\nax.set_ylabel('Temperature (°C)', fontsize=16)\nax.tick_params(labelsize=14)\nax.set_title('Profile', fontsize=18)\nfig.tight_layout()\nfig.savefig('profile.png', dpi=300)\n");
    expect(row('Axis titles')).toEqual({ source: '10pt*', print: '14pt', glyph: '✗' });
    expect(editedCode()).toMatch(/'axes\.labelsize': 13/);
  });
});

describe('P13B-R2-07: fig.supxlabel() and fig.supylabel() are axis titles', () => {
  it('a 9 pt shared label decides the row, and the fix raises it where it is written', () => {
    renderPage();
    typeSize(14, 10);
    check("import numpy as np\nimport matplotlib.pyplot as plt\n\nplt.rcParams['font.size'] = 16\nrng = np.random.default_rng(0)\nfig, axes = plt.subplots(2, 3, figsize=(12, 7), sharex=True, sharey=True)\nfor i, ax in enumerate(axes.flat):\n    ax.plot(rng.normal(size=50).cumsum())\n    ax.set_title(f'Site {i + 1}')\nfig.supxlabel('Time (h)', fontsize=9)\nfig.supylabel('Signal (a.u.)', fontsize=9)\nfig.suptitle('Signal across sites')\nfig.tight_layout()\nfig.savefig('sites.png', dpi=300)\n");
    expect(row('Axis titles')).toEqual({ source: '9pt', print: '10.5pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toContain("fig.supxlabel('Time (h)', fontsize=16)");
    expect(fixed).toContain("fig.supylabel('Signal (a.u.)', fontsize=16)");
  });

  it('with no size given they follow figure.labelsize, which the fix sets', () => {
    renderPage();
    typeSize(6, 4.5);
    check("import matplotlib.pyplot as plt\nfig, axes = plt.subplots(1, 2, figsize=(8, 6))\nfig.supxlabel('Time (h)')\nfig.savefig('f.png', dpi=300)\n");
    expect(row('Axis titles').source).toBe('12pt*');
    expect(editedCode()).toMatch(/'figure\.labelsize': 24/);
  });
});

describe('P13B-R2-08: an R legend sized by its own guide is read and raised there', () => {
  const head = 'library(ggplot2)\n\np <- ggplot(mpg, aes(displ, hwy, colour = drv)) +\n  geom_point() +\n  labs(x = "Displacement (L)", y = "Highway mpg", colour = "Drive") +\n';
  it('guide_legend(theme = theme(...)) (ggplot2 3.5 and later)', () => {
    renderPage();
    typeSize(10, 7);
    check(`${head}  guides(colour = guide_legend(theme = theme(legend.text = element_text(size = 7),\n                                              legend.title = element_text(size = 8)))) +\n  theme_bw(base_size = 18)\nggsave("drive.png", p, width = 7, height = 5, dpi = 300)\n`);
    expect(row('Legend text')).toEqual({ source: '7pt', print: '9.8pt', glyph: '✗' });
    expect(row('Legend title')).toEqual({ source: '8pt', print: '11.2pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toContain('guide_legend(theme = theme(legend.text = element_text(size = 10),');
    expect(fixed).toContain('legend.title = element_text(size = 10))))');
    check(fixed);
    expect(row('Legend text').glyph).toBe('✓');
  });

  it('label.theme and title.theme (the earlier idiom, still drawn by ggplot2 4.0.3)', () => {
    renderPage();
    typeSize(10, 7);
    check(`${head}  guides(colour = guide_legend(label.theme = element_text(size = 7),\n                               title.theme = element_text(size = 8))) +\n  theme_bw(base_size = 18)\nggsave("drive.png", p, width = 7, height = 5, dpi = 300)\n`);
    expect(row('Legend text').glyph).toBe('✗');
    const fixed = editedCode();
    expect(fixed).toContain('label.theme = element_text(size = 10)');
    expect(fixed).toContain('title.theme = element_text(size = 10)');
  });
});

describe('P13B-R2-09: an R script that draws to png() and print()s the plot', () => {
  it('the device\'s size is the canvas, and the theme goes into the plot it prints, so the user\'s own file is fixed', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\n\np <- ggplot(iris, aes(Sepal.Length, Petal.Length, colour = Species)) +\n  geom_point(size = 2) +\n  labs(title = "Iris morphology", x = "Sepal length (cm)", y = "Petal length (cm)") +\n  theme_classic(base_size = 10)\n\npng("figure1.png", width = 8, height = 6, units = "in", res = 300)\nprint(p)\ndev.off()\n');
    expect(scaleLine()).toMatch(/^Scale factor: 1\.17x(?!\*)/);
    expect(row('Plot title')).toEqual({ source: '12pt', print: '14pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toContain('print(p +\n  theme(');
    expect(fixed).not.toContain('poster_figure.png');
  });

  it('a device size the check cannot read is set to the size checked, in inches, with a resolution', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\np <- ggplot(iris, aes(Sepal.Length, Petal.Length)) + geom_point() + theme_classic(base_size = 10)\npng("figure1.png", width = fig_w(), height = 6)\nprint(p)\ndev.off()\n');
    expect(screen.getByText(/Found png\(\) but could not read its width\/height/)).toBeInTheDocument();
    expect(editedCode()).toContain('png("figure1.png", width = 10, height = 7, units = "in", res = 300)');
  });
});

describe('P13B-R2-10: the one-number advice is offered only where doing it changes drawn text', () => {
  it('Python: a script whose failing drawn text is all sized directly gets no advice (the legend row is not drawn)', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport matplotlib.pyplot as plt\n\ngenes = ['BRCA1', 'TP53', 'EGFR', 'MYC']\nfold = np.array([1.8, -2.1, 3.2, 0.7])\nplt.figure(figsize=(9, 5))\nplt.bar(genes, fold)\nplt.xticks(rotation=45, ha='right', fontsize=8)\nplt.yticks(fontsize=8)\nplt.ylabel('log2 fold change', fontsize=12)\nplt.title('Differential expression', fontsize=14)\nplt.tight_layout()\nplt.savefig('genes.png', dpi=300)\n");
    expect(row('Tick labels').glyph).toBe('✗');
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });

  it('Python: a plot title the script never draws does not drive the advice', () => {
    renderPage();
    typeSize(10, 7);
    check("import numpy as np\nimport matplotlib.pyplot as plt\nmonths = np.arange(1, 13)\nfig, ax1 = plt.subplots(figsize=(7, 4.5))\nax1.plot(months, months, label='Temperature')\nax1.set_xlabel('Month', fontsize=14)\nax1.set_ylabel('Temperature', fontsize=14)\nax1.tick_params(axis='both', labelsize=12)\nfig.legend(loc='upper left', fontsize=11)\nfig.tight_layout()\nfig.savefig('climate.png', dpi=300)\n");
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });
});

describe('P13B-R2-11: `%+replace%` replaces the element, so a title without a size takes the title size', () => {
  it('plot.title replaced with no size is drawn at base_size, not 1.2 ×', () => {
    renderPage();
    typeSize(10, 7);
    check('library(ggplot2)\n\np <- ggplot(mpg, aes(displ, hwy)) +\n  geom_point(alpha = 0.6) +\n  labs(title = "Engine size and efficiency", x = "Displacement (L)", y = "Highway mpg") +\n  theme_bw(base_size = 12) %+replace%\n  theme(plot.title = element_text(face = "bold", hjust = 0))\nggsave("mpg.png", p, width = 7, height = 5, dpi = 300)\n');
    expect(row('Plot title')).toEqual({ source: '12pt', print: '16.8pt', glyph: '⚠' });
    const fixed = editedCode();
    expect(fixed).toContain('plot.title = element_text(size = 13)');
  });
});

describe('P13B-R2-12: the page says a crop keeps what fits', () => {
  it('the copy under the edited script qualifies "keeps everything its crop kept"', () => {
    renderPage();
    typeSize(10, 7);
    check("import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 9\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot([0, 1], [0, 1], label='a')\nax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))\nfig.savefig('f.png', dpi=300, bbox_inches='tight')\n");
    expect(screen.getByText(/keeps what its crop kept when that fits the canvas at the sizes needed/)).toBeInTheDocument();
  });
});
