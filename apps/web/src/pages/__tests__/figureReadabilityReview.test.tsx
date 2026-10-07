/**
 * Fix 13b, review round 1 (record docs/fixes/13b-checker-sizes.md section 9):
 * the reviewer's scenarios, entered where a visitor enters
 * (/tools/figure-readability: a print size typed, the script pasted, ▶ Check,
 * the table read, the edited script read and checked again). Each script is
 * also in the gates' corpora (scripts/fixtures/checker-corpus/r1-*,
 * checker-corpus-r/r1-*), which run the original and the edited script in
 * matplotlib 3.10.8 / seaborn 0.13.2 and ggplot2 4.0.3: the sizes expected
 * here are the ones those renderers draw.
 *
 * Re-run: npx vitest run src/pages/__tests__/figureReadabilityReview.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));
vi.mock('@/lib/apiClient', () => ({ postJson: vi.fn(), ApiError: class extends Error {} }));

import type { Block } from '@postr/shared';
import { FigureTab } from '../../poster/sidebar/FigureTab';
import { ALL_PASS, check, editedCode, findRow, renderPage, row, scaleLine, typeSize } from './checkerPageDriver';

beforeEach(() => {
  sessionStorage.clear();
});

const PY = 'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 10, 50)\n';
const AX = "ax.plot(x, np.sin(x), label='sin')\nax.plot(x, np.cos(x), label='cos')\n";

describe('P13B-R1-01: a tight save keeps what the script draws outside the plots', () => {
  const outside = `${PY}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_xlabel('Dose')\nax.set_ylabel('Effect')\nax.set_title('Dose and effect')\nax.legend(bbox_to_anchor=(1.02, 1), loc='upper left')\nfig.savefig('outside.png', dpi=300, bbox_inches='tight')\n`;

  it('the figure is sized so what it draws fits the canvas checked, and the save writes that box; the re-check knows the scale', () => {
    renderPage();
    typeSize(10, 7);
    check(outside);
    expect(scaleLine()).toMatch(/\*/);
    const fixed = editedCode();
    // The block before the save fits the legend and the plots into 8 × 6 in, the canvas scored...
    expect(fixed).toContain('# Postr: the saved image at 8 × 6 in, with the text outside the plots kept in it\nfrom matplotlib.transforms import Bbox\nposter_fig = fig\n');
    expect(fixed).toContain('max(8 / 10, poster_fig.get_figwidth() * 8 / poster_box.width), max(6 / 10, poster_fig.get_figheight() * 6 / poster_box.height)');
    // ...and the save writes exactly that box, with everything drawn in it.
    expect(fixed).toContain("poster_box = Bbox.from_bounds(poster_box.x0 - (8 - poster_box.width) / 2, poster_box.y0 - (6 - poster_box.height) / 2, 8, 6)");
    expect(fixed).toContain("fig.savefig('outside.png', dpi=300, bbox_inches=poster_box)");
    check(fixed);
    expect(scaleLine()).toMatch(/^Scale factor: 1\.17x(?!\*)/);
    expect(screen.queryByText(/Saved with bbox_inches="tight"/)).toBeNull();
  });
});

describe('P13B-R1-02: a fontdict= or prop= value is never overwritten with a number', () => {
  it('a dict held in a name is read, and its size raised where it is written', () => {
    renderPage();
    typeSize(10, 7);
    const code = `${PY}font = {'family': 'serif', 'size': 8}\nfig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_title('Response over time', fontdict=font)\nax.set_xlabel('Time (s)', fontdict=font)\nax.set_ylabel('Signal', fontdict=font)\nax.legend()\nfig.tight_layout()\nfig.savefig('fig.png', dpi=300)\n`;
    check(code);
    expect(row('Plot title').source).toBe('8pt');
    expect(row('Plot title').glyph).toBe('✗');
    const fixed = editedCode();
    expect(fixed).toContain("font = {'family': 'serif', 'size': 16}");
    expect(fixed).not.toMatch(/fontdict=\d/);
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '16pt', print: '18.7pt', glyph: '✓' });
    expect(row('Axis titles').glyph).toBe('✓');
  });

  it('a fontdict with no size and a legend prop with no size leave the size to rcParams', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}fig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_title('T', fontdict={'fontweight': 'bold'})\nax.set_xlabel('x')\nax.legend(prop={'family': 'serif'})\nfig.savefig('fig.png', dpi=300)\n`);
    expect(row('Plot title').source).toBe('12pt*');
    const fixed = editedCode();
    expect(fixed).toContain("ax.set_title('T', fontdict={'fontweight': 'bold'})");
    expect(fixed).toContain("ax.legend(prop={'family': 'serif'})");
    expect(fixed).toMatch(/'axes\.titlesize': 16/);
    expect(fixed).toMatch(/'legend\.fontsize': 12/);
  });

  it('a FontProperties held in a name is read and raised in place', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}from matplotlib.font_manager import FontProperties\nfp = FontProperties(family='serif', size=8)\nfig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_xlabel('x', fontsize=20)\nax.set_ylabel('y', fontsize=20)\nax.legend(prop=fp)\nfig.savefig('fig.png', dpi=300)\n`);
    expect(row('Legend text').source).toBe('8pt');
    const fixed = editedCode();
    expect(fixed).toContain("fp = FontProperties(family='serif', size=12)");
    expect(fixed).not.toMatch(/prop=\d/);
  });
});

describe('P13B-R1-03: a seaborn grid that is only shown is set to the print size before the save the script gets', () => {
  it('the grid block comes before the added save', () => {
    renderPage();
    typeSize(10, 7);
    check("import seaborn as sns\nimport matplotlib.pyplot as plt\nimport pandas as pd\ndf = pd.read_csv('d.csv')\ng = sns.relplot(data=df, x='Dose', y='Effect', hue='Group', col='Site', kind='line', height=4, aspect=1.2)\ng.set_axis_labels('Dose', 'Effect')\nplt.show()\n");
    const fixed = editedCode();
    expect(fixed).toContain('poster_fig = g.figure\nposter_fig.set_size_inches(10, 7)\n');
    expect(fixed.indexOf('poster_fig.set_size_inches(10, 7)')).toBeLessThan(fixed.indexOf('plt.savefig("poster_figure.png", dpi=300)\nplt.show()'));
  });
});

describe('P13B-R1-08, -11: sizes passed through ** are read', () => {
  it('fontsize= in a dict passed as **kwargs is read, and raised in that dict', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}label_kw = {'fontsize': 8}\nfig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_title('Response over time', **label_kw)\nax.set_xlabel('Time (s)', **label_kw)\nax.set_ylabel('Signal', **label_kw)\nax.legend()\nfig.savefig('fig.png', dpi=300)\n`);
    expect(row('Plot title').source).toBe('8pt');
    const fixed = editedCode();
    expect(fixed).toContain("label_kw = {'fontsize': 16}");
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '16pt', print: '18.7pt', glyph: '✓' });
  });

  it('matplotlib.rc(\'font\', **font) is read, so nothing it sets is lowered', () => {
    renderPage();
    typeSize(10, 7);
    check(`import numpy as np\nimport matplotlib\nimport matplotlib.pyplot as plt\n\nfont = {'family': 'sans-serif', 'weight': 'normal', 'size': 22}\nmatplotlib.rc('font', **font)\nx = np.linspace(0, 10, 50)\nfig, ax = plt.subplots(figsize=(8, 6))\n${AX}ax.set_title('Response over time')\nax.set_xlabel('Time (s)')\nax.set_ylabel('Signal')\nax.legend()\nfig.tight_layout()\nfig.savefig('fig.png', dpi=300)\n`);
    expect(row('Plot title')).toEqual({ source: '26.4pt', print: '30.8pt', glyph: '✓' });
    expect(row('Tick labels').source).toBe('22pt');
    expect(screen.getByText(ALL_PASS)).toBeInTheDocument();
    expect(editedCode()).toBe('');
  });
});

describe('P13B-R1-09: a tight save on matplotlib\'s default canvas withholds the one-number advice', () => {
  it('the scale is marked and the advice is not offered', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}plt.rcParams['font.size'] = 9\nfig, ax = plt.subplots()\n${AX}ax.set_title('Response over time')\nax.set_xlabel('Time (s)')\nax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))\nfig.savefig('fig.png', dpi=300, bbox_inches='tight')\n`);
    expect(scaleLine()).toMatch(/\*/);
    expect(screen.getByText(/Saved with bbox_inches="tight"/)).toBeInTheDocument();
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });
});

describe('P13B-R1-10: the settings never land between an if-body and its else:', () => {
  it('they go after the whole if/else, so the script still parses and they always run', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}import seaborn as sns\nPOSTER = False\nfig, ax = plt.subplots(figsize=(8, 6))\nif POSTER:\n    sns.set_theme(context='paper')\nelse:\n    pass\nax.plot(x, np.sin(x))\nax.set_title('Response over time')\nfig.savefig('fig.png', dpi=300)\n`);
    const fixed = editedCode();
    expect(fixed).toContain("if POSTER:\n    sns.set_theme(context='paper')\nelse:\n    pass\n# Postr: text sizes and canvas for this print size\n");
  });
});

describe('P13B-R1-12, -13: seaborn\'s positional font_scale and Axes unpacked from a tuple', () => {
  it('set_theme(context, style, palette, font, font_scale) reads font_scale from its fifth argument', () => {
    renderPage();
    typeSize(14, 10);
    check("import seaborn as sns\nimport matplotlib.pyplot as plt\nsns.set_theme('notebook', 'whitegrid', 'deep', 'sans-serif', 0.8)\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot([0, 1], [0, 1])\nax.set_title('Trend')\nfig.savefig('fig.png', dpi=300)\n");
    expect(row('Plot title').source).toBe('9.6pt');
    expect(row('Plot title').glyph).not.toBe('✓');
  });

  it('fig, (ax1, ax2) = plt.subplots(1, 2): each name is its own Axes', () => {
    renderPage();
    typeSize(10, 7);
    check(`${PY}fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))\nax1.plot(x, np.sin(x))\nax2.plot(x, np.cos(x))\nax1.set_xlabel('t', fontsize=20)\nax2.set_xlabel('t', fontsize=20)\nax1.set_ylabel('s', fontsize=20)\nax2.set_ylabel('s', fontsize=20)\nax1.tick_params(labelsize=18)\nax2.tick_params(labelsize=18)\nfig.savefig('fig.png', dpi=300)\n`);
    expect(row('Tick labels')).toEqual({ source: '18pt', print: '18pt', glyph: '✓' });
  });
});

const R_HEAD = 'library(ggplot2)\ndf <- data.frame(x = 1:10, y = (1:10)^1.5, g = rep(c("Control", "Treated"), 5))\np <- ggplot(df, aes(x, y, colour = g)) +\n  geom_point() +\n  labs(title = "Response", x = "Dose", y = "Effect", colour = "Group") +\n';

describe('P13B-R1-04: the plot\'s own theme() is applied after theme_update(), whatever the order written', () => {
  it('theme_update() written after the plot\'s theme() does not win', () => {
    renderPage();
    typeSize(10, 7);
    check(`${R_HEAD}  theme(axis.text = element_text(size = 6))\ntheme_update(axis.text = element_text(size = 30))\nggsave("fig.png", p, width = 7, height = 5)\n`);
    expect(row('Tick labels').source).toBe('6pt');
    expect(row('Tick labels').glyph).toBe('✗');
    const fixed = editedCode();
    expect(fixed).toContain('axis.text = element_text(size = 10)');
    check(fixed);
    expect(row('Tick labels').glyph).toBe('✓');
  });
});

describe('P13B-R1-05: a complete theme that is not ggplot2\'s', () => {
  it('its sizes stay marked, the root text size is never written, and no one-number advice is given', () => {
    renderPage();
    typeSize(10, 7);
    check(`library(ggplot2)\nlibrary(cowplot)\n${R_HEAD.split('\n').slice(1).join('\n')}  theme_cowplot()\nggsave("fig.png", p, width = 7, height = 5)\n`);
    expect(row('Plot title').source).toBe('13.2pt*');
    expect(screen.queryByText(/Or change one number/)).toBeNull();
    const fixed = editedCode();
    expect(fixed).not.toContain('text = element_text(size = 11)');
    // A row that falls short is set to at least the size the theme draws, read when the script runs.
    expect(fixed).toContain('axis.title.x = element_text(size = max(13, calc_element("axis.title.x", complete_theme(p$theme))$size))');
    expect(fixed).toContain('axis.text.x.bottom = element_text(size = max(10, calc_element("axis.text.x.bottom", complete_theme(p$theme))$size))');
    // Review round 3 (P13B-R3-03): the title passes at the size assumed and is floored too, so
    // the re-check is true whatever the theme draws; the legend says the code sets it unreadably.
    expect(fixed).toContain('plot.title = element_text(size = max(13, calc_element("plot.title", complete_theme(p$theme))$size))');
    expect(screen.getByText(/Not read from your code\./)).toBeInTheDocument();
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '13pt', print: '18.2pt', glyph: '✓' });
    // Read back as at least the size it needs, unmarked.
    expect(row('Axis titles')).toEqual({ source: '13pt', print: '18.2pt', glyph: '✓' });
  });

  it('with nothing short, every size resting on the theme is still floored (review round 3, P13B-R3-03), and the page asks to replace the code', () => {
    renderPage();
    typeSize(14, 10);
    check(`library(ggplot2)\nlibrary(cowplot)\n${R_HEAD.split('\n').slice(1).join('\n')}  theme_cowplot()\nggsave("fig.png", p, width = 7, height = 5)\n`);
    const fixed = editedCode();
    expect(fixed).toContain('axis.title.x = element_text(size = max(9, calc_element("axis.title.x", complete_theme(p$theme))$size))');
    expect(fixed).not.toContain('text = element_text(size = 11)');
    expect(screen.getByText('Every element in the table meets its minimum, with the sizes marked * assumed. Replace your code with the version below so the figure prints this way.')).toBeInTheDocument();
  });
});

describe('P13B-R1-06: theme_void() draws no axis text, and the fix never draws it back', () => {
  it('no axis rows, and no axis element in the edited script', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${R_HEAD}  theme_void()\nggsave("fig.png", p, width = 7, height = 5)\n`);
    expect(findRow('Axis titles')).toBeNull();
    expect(findRow('Tick labels')).toBeNull();
    const fixed = editedCode();
    expect(fixed).toContain('plot.title = element_text(size = 21)');
    expect(fixed).not.toMatch(/axis\.(title|text)/);
  });
});

describe('P13B-R1-07: a ggsave() whose filename is named still gets the theme in its plot', () => {
  it('filename = and file = (a partial name): the first unnamed argument is the plot', () => {
    renderPage();
    typeSize(10, 7);
    for (const name of ['filename', 'file']) {
      check(`${R_HEAD}  theme_bw(base_size = 9)\nggsave(${name} = "fig.png", p, width = 7, height = 5)\n`);
      const fixed = editedCode();
      expect(fixed, name).toContain(`ggsave(${name} = "fig.png", p +\n  theme(`);
      expect(fixed, name).not.toContain('last_plot()');
    }
  });
});

describe('P13B-R1-14: the parts of the change no test reached', () => {
  it('a table that passes with sizes assumed titles the script "Set the sizes your code leaves out"', () => {
    renderPage();
    typeSize(14, 10);
    check(`${PY}fig, ax = plt.subplots(figsize=(6.4, 4.8))\n${AX}ax.set_title('T')\nax.set_xlabel('x')\nax.legend()\nfig.savefig('f.png', dpi=300)\n`);
    expect(screen.getByText('Set the sizes your code leaves out')).toBeInTheDocument();
  });

  it('the one-number advice is offered on matplotlib\'s default canvas, which the check knows', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${PY}plt.rcParams['font.size'] = 12\nfig, ax = plt.subplots()\n${AX}ax.set_title('T')\nax.set_xlabel('x')\nax.legend()\nfig.savefig('f.png', dpi=300)\n`);
    expect(screen.getByText('Or change one number: font.size = 20')).toBeInTheDocument();
  });

  const imageBlock = (captionPosition: Block['captionPosition'], captionGap = 0): Block => ({
    id: 'img-1', type: 'image', x: 10, y: 60, w: 80, h: 60, content: '', imageSrc: null, imageFit: 'contain',
    tableData: null, caption: 'Sample figure.', captionPosition, captionGap,
  });
  const openCheck = (block: Block) => {
    render(
      <FigureTab mode="check" onChangeMode={() => {}} selectedImageBlock={block} defaultFigureWidthIn={10} defaultFigureHeightIn={7}
        palette={{ bg: '#fff', primary: '#111', accent: '#222', accent2: '#333', muted: '#666', headerBg: '#111', headerFg: '#fff' }}
        fontFamily="Georgia, serif" posterTables={[]} onInsertChart={() => {}} selectedChartBlock={null} onUpdateChartSpec={() => {}} />,
    );
    check(`${PY}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\n${AX}ax.set_title('T')\nfig.savefig('f.png', dpi=300)\n`);
  };

  it('a side caption\'s gap comes out of the picture\'s width: 78 × 0.65 − 10 = 40.7 units', () => {
    openCheck(imageBlock('right', 10));
    // 4.07 / 6.4 = 0.64.
    expect(screen.getByText(/Scale factor: 0\.64x/)).toBeInTheDocument();
  });

  it('with no caption the frame takes a unit from the height too: 7.8 × 5.8 in', () => {
    openCheck(imageBlock('none'));
    // min(7.8 / 6.4, 5.8 / 4.8) = 1.21 (1.22 with the frame left in the height).
    expect(screen.getByText(/Scale factor: 1\.21x/)).toBeInTheDocument();
  });
});
