/**
 * Fix 13b — the plot checker reads the font and canvas settings with a
 * bounded rule table ordered by position, marks every one the code leaves
 * out, and hands back a script that sets them (record
 * docs/fixes/13b-checker-sizes.md; the owner's design of 2026-10-07).
 *
 * Entered where a visitor enters: /tools/figure-readability, a print size
 * typed into Width and Height (Enter commits), the script pasted, ▶ Check
 * pressed, the table read; "Copy edited code"'s code read from the fix box
 * and checked again. Each expected size is what the renderer draws for the
 * same script, measured in matplotlib 3.10.8 / seaborn 0.13.2 and ggplot2
 * 4.0.3 by scripts/checker-truth-check.mjs and checker-r-truth-check.mjs
 * (their corpora hold each script below).
 *
 * Re-run: npx vitest run src/pages/__tests__/figureReadabilitySizes.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));
vi.mock('@/lib/apiClient', () => ({ postJson: vi.fn(), ApiError: class extends Error {} }));

import type { Block } from '@postr/shared';
import FigureReadabilityPage from '../FigureReadability';
import { AppRoutes } from '../../routes';
import { FigureTab } from '../../poster/sidebar/FigureTab';

const ALL_PASS = 'Every element in the table meets its minimum at this poster size.';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tools/figure-readability']}>
      <FigureReadabilityPage />
    </MemoryRouter>,
  );
}

function typeSize(w: number, h: number) {
  for (const [label, v] of [['Width', w], ['Height', h]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: String(v) } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
}

function check(code: string) {
  fireEvent.change(screen.getByLabelText('Your R or Python plotting code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /check$/i }));
}

/** One row of the results table as the page shows it ("10pt*": a size the code does not set). */
function row(name: string): { source: string; print: string; glyph: string } {
  const tr = screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent === name);
  if (!tr) throw new Error(`no row ${name}`);
  const td = [...tr.querySelectorAll('td')].map((c) => c.textContent ?? '');
  return { source: td[1]!, print: td[2]!, glyph: td[4]! };
}

const rowsGlyphs = () => ['Plot title', 'Axis titles', 'Tick labels', 'Legend text', 'Caption']
  .map((n) => screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent === n))
  .filter(Boolean).map((r) => r!.querySelectorAll('td')[4]!.textContent);

/** The code "Copy edited code" copies: the fix box's own code view. */
function editedCode(): string {
  const button = screen.getByRole('button', { name: 'Copy edited code' });
  const box = button.parentElement!.parentElement!;
  return box.querySelector('pre')!.textContent ?? '';
}

/** The scale line ("Scale factor: 1.25x", with "*" when the canvas is assumed). */
const scaleLine = () => screen.getByText(/^Scale factor:/).textContent ?? '';

beforeEach(() => {
  sessionStorage.clear();
});

const PY_HEAD = 'import numpy as np\nimport matplotlib.pyplot as plt\nx = np.linspace(0, 10, 50)\n';
const PY_TAIL = "ax.plot(x, np.sin(x), label='sin')\nax.plot(x, np.cos(x), label='cos')\nax.set_xlabel('Phase (rad)')\nax.set_ylabel('Amplitude')\nax.set_title('Two waves')\nax.legend()\nfig.savefig('wave.png', dpi=300)\n";

describe('Python: sizes read the way matplotlib and seaborn resolve them', () => {
  it('a font.size set before seaborn\'s set_theme changes nothing seaborn sets (12 pt titles)', () => {
    renderPage();
    typeSize(7, 5);
    check([
      'import matplotlib.pyplot as plt', 'import seaborn as sns',
      "plt.rcParams['font.size'] = 20", 'sns.set_theme(style="whitegrid")',
      'fig, ax = plt.subplots(figsize=(6.4, 4.8))', 'ax.plot([0, 1], [0, 1], label="a")',
      'ax.set_title("Dose response")', 'ax.set_xlabel("Dose")', 'ax.set_ylabel("Response")', 'ax.legend()',
      'fig.savefig("dose.png", dpi=300)',
    ].join('\n'));
    expect(row('Plot title').source).toBe('12pt');
    expect(row('Plot title').glyph).not.toBe('✓');
    expect(row('Tick labels').source).toBe('11pt');
  });

  it('a figure made inside rc_context is sized by the context, not the font.size outside it', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams['font.size'] = 20\nwith plt.rc_context({'font.size': 7}):\n    fig, ax = plt.subplots(figsize=(8, 6))\n${PY_TAIL.split('\n').filter(Boolean).map((l) => `    ${l}`).join('\n')}\n`);
    expect(row('Plot title').source).toBe('8.4pt');
    expect(row('Plot title').glyph).toBe('✗');
    expect(screen.queryByText(ALL_PASS)).toBeNull();
  });

  it('a per-element rcParams key is read: ytick.labelsize 9 under font.size 20', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams.update({'font.size': 20, 'ytick.labelsize': 9})\nfig, ax = plt.subplots(figsize=(8, 6))\n${PY_TAIL}`);
    expect(row('Tick labels').source).toBe('9pt');
    expect(row('Tick labels').glyph).toBe('✗');
  });

  it('a label set on one Axes is that Axes\', not every Axes\'', () => {
    renderPage();
    typeSize(12, 9);
    check([
      'import matplotlib.pyplot as plt', 'fig, axs = plt.subplots(1, 2, figsize=(10, 4))',
      'axs[0].set_title("A", fontsize=24)', 'axs[0].set_xlabel("Concentration", fontsize=20)', 'axs[0].set_ylabel("Signal", fontsize=20)',
      'axs[0].tick_params(labelsize=18)', 'axs[1].set_title("B")', 'axs[1].set_xlabel("Concentration")', 'axs[1].set_ylabel("Signal")',
      'fig.savefig("panels.png", dpi=300)',
    ].join('\n'));
    // The second Axes' labels and title are matplotlib's defaults: nothing in the code sizes them.
    expect(row('Axis titles').source).toBe('10pt*');
    expect(row('Axis titles').glyph).toBe('✗');
    expect(row('Plot title').source).toBe('12pt*');
  });

  it('legend(prop=), a size held in a name, and an axis label made before font.size changes are read', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot(x, x, label='a')\nax.legend(prop={'size': 7})\nfig.savefig('p.png')`);
    expect(row('Legend text').source).toBe('7pt');

    check(`${PY_HEAD}TITLE_SIZE = 9\nplt.rcParams['font.size'] = 18\nfig, ax = plt.subplots(figsize=(8, 6))\nax.set_title('T', fontsize=TITLE_SIZE)\nfig.savefig('p.png')`);
    expect(row('Plot title').source).toBe('9pt');

    // Made before font.size changes, the axis labels keep matplotlib's default.
    check(`${PY_HEAD}fig, ax = plt.subplots(figsize=(8, 6))\nplt.rcParams['font.size'] = 20\n${PY_TAIL}`);
    expect(row('Axis titles').source).toBe('10pt*');
    expect(row('Plot title').source).toBe('24pt');
  });

  it('tick labels follow font.size at 1.0 ×, as matplotlib draws them', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams['font.size'] = 12\nfig, ax = plt.subplots(figsize=(8, 6))\n${PY_TAIL}`);
    expect(row('Tick labels').source).toBe('12pt');
    expect(row('Tick labels').glyph).toBe('✓');
  });

  it('a suptitle is a plot title', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\nax.plot(x, x, label='a')\nfig.suptitle('Saturation curve', fontsize=9)\nax.set_xlabel('Load')\nfig.savefig('s.png')`);
    expect(row('Plot title').source).toBe('9pt');
    expect(row('Plot title').glyph).toBe('✗');
  });

  it('a figure size written as arithmetic is read', () => {
    renderPage();
    typeSize(7, 5);
    check(`${PY_HEAD}plt.rcParams['font.size'] = 14\nfig, ax = plt.subplots(figsize=(250 / 25.4, 180 / 25.4))\n${PY_TAIL}`);
    expect(screen.getByText(/Scale factor: 0\.71x/)).toBeInTheDocument();
    expect(screen.queryByText(/No canvas size found/)).toBeNull();
  });
});

describe('Python: a setting the code leaves out is marked, and the edited script sets it', () => {
  it('no size anywhere: every drawn row is marked as the default, with no all-pass line, and the script sets each one', () => {
    renderPage();
    typeSize(14, 10);
    check(`${PY_HEAD}fig, ax = plt.subplots(figsize=(6.4, 4.8))\n${PY_TAIL}`);
    expect(row('Plot title')).toEqual({ source: '12pt*', print: '25pt', glyph: '✓' });
    expect(row('Tick labels').source).toBe('10pt*');
    expect(screen.getByText(/No font size found for some text — matplotlib’s defaults are assumed \(marked \*\)/)).toBeInTheDocument();
    expect(screen.queryByText(ALL_PASS)).toBeNull();
    const fixed = editedCode();
    expect(fixed).toContain("plt.rcParams.update({'axes.titlesize': 12, 'legend.fontsize': 10, 'legend.title_fontsize': 10, 'axes.labelsize': 10, 'xtick.labelsize': 10, 'ytick.labelsize': 10})\nfig, ax = plt.subplots(");
    check(fixed);
    expect(row('Plot title')).toEqual({ source: '12pt', print: '25pt', glyph: '✓' });
    expect(screen.getByText(ALL_PASS)).toBeInTheDocument();
  });

  it('a size set in a tick-label loop is read, and replaced where it is written', () => {
    renderPage();
    const loop = `${PY_HEAD}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(8, 6))\n${PY_TAIL.replace("fig.savefig('wave.png', dpi=300)\n", '')}for lab in ax.get_xticklabels() + ax.get_yticklabels():\n    lab.set_fontsize(7)\nfig.savefig('loop.png', dpi=300)\n`;
    check(loop);
    expect(row('Tick labels')).toEqual({ source: '7pt', print: '8.2pt', glyph: '✗' });
    const fixed = editedCode();
    expect(fixed).toContain('    lab.set_fontsize(12)\n');
    expect(fixed).not.toContain('set_fontsize(7)');
    check(fixed);
    expect(row('Tick labels')).toEqual({ source: '12pt', print: '14pt', glyph: '✓' });
  });

  it('a seaborn grid with columns: the scale is marked, and the script sets the figure to the print size and saves it whole', () => {
    renderPage();
    const grid = [
      'import seaborn as sns', 'import pandas as pd', 'df = pd.read_csv("d.csv")',
      "g = sns.relplot(data=df, x='Dose', y='Effect', hue='Group', col='Site', kind='line', height=4, aspect=1.2)",
      "g.savefig('relplot.png', dpi=300)",
    ].join('\n');
    check(grid);
    expect(scaleLine()).toMatch(/^Scale factor: 1\.00x\*/);
    expect(screen.getByText(/seaborn sizes this grid from its facets and legend/)).toBeInTheDocument();
    expect(screen.queryByText(ALL_PASS)).toBeNull();
    const fixed = editedCode();
    expect(fixed).toContain("poster_fig = g.figure\nposter_fig.set_size_inches(10, 7)\n");
    expect(fixed).toContain("g.savefig('relplot.png', dpi=300, bbox_inches=None)");
    check(fixed);
    expect(scaleLine()).toMatch(/^Scale factor: 1\.00x(?!\*)/);
  });

  it('a tight save: the scale is marked, and the script saves the canvas checked with everything drawn in it', () => {
    renderPage();
    check(`${PY_HEAD}plt.rcParams['font.size'] = 20\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot(x, x, label='a')\nax.set_xlabel('Dose')\nfig.legend(loc='center left', bbox_to_anchor=(1.0, 0.5))\nfig.savefig('f.png', dpi=300, bbox_inches='tight')`);
    expect(scaleLine()).toMatch(/\*/);
    expect(screen.getByText(/Saved with bbox_inches="tight", which crops the image/)).toBeInTheDocument();
    const fixed = editedCode();
    // The figure legend outside the plots stays in the image (review round 1, P13B-R1-01).
    expect(fixed).toContain('# Postr: the saved image at 8 × 6 in, with the text outside the plots kept in it\nfrom matplotlib.transforms import Bbox\nposter_fig = fig\n');
    expect(fixed).toContain("fig.savefig('f.png', dpi=300, bbox_inches=poster_box)");
    check(fixed);
    expect(scaleLine()).not.toMatch(/\*/);
  });

  it('a keyword size is raised in place, and no text the script sizes larger is lowered', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${PY_HEAD}plt.rcParams['font.size'] = 26\nfig, ax = plt.subplots(figsize=(8, 6))\nax.plot(x, x, label='a')\nax.set_xlabel('Phase', fontsize=10)\nax.set_ylabel('Amp', fontsize=10)\nax.set_title('T')\nax.legend()\nfig.savefig('w.png')`);
    const fixed = editedCode();
    expect(fixed).toContain("ax.set_xlabel('Phase', fontsize=24)");
    expect(fixed).toContain("ax.set_ylabel('Amp', fontsize=24)");
    expect(fixed).toContain("plt.rcParams['font.size'] = 26");
    check(fixed);
    expect(row('Axis titles').glyph).toBe('✓');
    expect(row('Plot title').source).toBe('31.2pt');
  });
});

describe('the one-number advice never lowers what the script sets', () => {
  it('is hidden when only rows the script sizes directly fail (font.size 26, axis titles 10)', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${PY_HEAD}plt.rcParams['font.size'] = 26\nfig, ax = plt.subplots()\nax.plot(x, x, label='a')\nax.set_xlabel('Phase', fontsize=10)\nax.set_ylabel('Amp', fontsize=10)\nax.set_title('T')\nax.legend()\nfig.savefig('w.png')`);
    expect(row('Axis titles').glyph).toBe('✗');
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });

  it('is offered above the script\'s own font.size when rows that follow it fail', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${PY_HEAD}plt.rcParams['font.size'] = 12\nfig, ax = plt.subplots(figsize=(8, 6))\n${PY_TAIL}`);
    expect(screen.getByText('Or change one number: font.size = 24')).toBeInTheDocument();
  });

  it('is hidden after seaborn\'s set_theme, which a font.size does not reach', () => {
    renderPage();
    typeSize(4, 3);
    check(['import matplotlib.pyplot as plt', 'import seaborn as sns', 'sns.set_theme()', 'fig, ax = plt.subplots()',
      'ax.set_title("T")', 'ax.set_xlabel("x")', 'fig.savefig("f.png")'].join('\n'));
    expect(row('Plot title').glyph).toBe('✗');
    expect(screen.queryByText(/Or change one number: font\.size/)).toBeNull();
  });
});

const R_HEAD = 'library(ggplot2)\ndf <- data.frame(dose = 1:12, effect = 1:12, group = rep(c("Control", "Treated"), 6))\np <- ggplot(df, aes(dose, effect, colour = group)) +\n  geom_line() +\n  labs(title = "Dose and effect", x = "Dose (mg)", y = "Effect", colour = "Group") +\n';

describe('R: sizes read the way ggplot2 resolves them', () => {
  it('theme(title =) sizes every title, theme(text =) every text, and base_size may come positionally', () => {
    renderPage();
    typeSize(6, 4.5);
    check(`${R_HEAD}  theme_classic(base_size = 20) +\n  theme(title = element_text(size = 8))\nggsave("t.png", p, width = 8, height = 6, dpi = 300)`);
    expect(row('Plot title').source).toBe('9.6pt');
    expect(row('Plot title').glyph).toBe('✗');
    expect(row('Tick labels').source).toBe('16pt');

    check(`${R_HEAD}  theme_bw(base_size = 14) +\n  theme(text = element_text(size = 6))\nggsave("t.png", p, width = 8, height = 6, dpi = 300)`);
    expect(row('Plot title').source).toBe('7.2pt');

    check(`${R_HEAD}  theme_bw(6)\nggsave("t.png", p, width = 8, height = 6, dpi = 300)`);
    expect(row('Axis titles').source).toBe('6pt');
  });

  it('a complete theme replaces theme_set() and an earlier theme(); theme_update(text =) reaches every text', () => {
    renderPage();
    typeSize(7, 5);
    // theme_bw() with no base_size: ggplot2's default 11 is assumed.
    check(`library(ggplot2)\ntheme_set(theme_classic(base_size = 20))\n${R_HEAD.split('\n').slice(1).join('\n')}  theme_bw()\nggsave("d.png", p, width = 7, height = 5)`);
    expect(row('Plot title').source).toBe('13.2pt*');
    expect(row('Plot title').glyph).toBe('✗');

    check(`${R_HEAD}  theme(axis.text = element_text(size = 20), plot.title = element_text(size = 26)) +\n  theme_classic(base_size = 6)\nggsave("d.png", p, width = 7, height = 5)`);
    expect(row('Plot title').source).toBe('7.2pt');

    check(`library(ggplot2)\ntheme_set(theme_gray(base_size = 16))\ntheme_update(text = element_text(size = 7))\n${R_HEAD.split('\n').slice(1).join('\n').replace(/ \+\n$/, '\n')}ggsave("w.png", p, width = 7, height = 5)`);
    expect(row('Axis titles').source).toBe('7pt');
  });

  it('a caption is drawn at 0.8 × base_size', () => {
    renderPage();
    check(`${R_HEAD}  labs(caption = "Made-up data") +\n  theme_minimal(base_size = 16)\nggsave("c.png", p, width = 8, height = 6, dpi = 300)`);
    expect(row('Caption').source).toBe('12.8pt');
  });

  it('ggsave()\'s scale and a size written as arithmetic are read', () => {
    renderPage();
    typeSize(9, 5);
    check(`${R_HEAD}  theme_bw(base_size = 14)\nggsave("s.png", p, width = 6, height = 4, scale = 2)`);
    expect(screen.getByText(/Scale factor: 0\.63x/)).toBeInTheDocument();

    typeSize(10, 7);
    check(`${R_HEAD}  theme_bw(base_size = 12)\nggsave("e.png", p, width = 180 / 25.4, height = 120 / 25.4)`);
    expect(screen.getByText(/Scale factor: 1\.41x/)).toBeInTheDocument();
  });
});

describe('R: the fix goes into the plot ggsave() saves, and never lowers a size', () => {
  it('after the user\'s own theme(), so the re-check passes what ggplot2 draws', () => {
    renderPage();
    typeSize(8, 6);
    check(`${R_HEAD}  theme_minimal(base_size = 16) +\n  theme(axis.text = element_text(size = 7), legend.text = element_text(size = 8))\nggsave("after.png", p, width = 8, height = 6, dpi = 300)`);
    const fixed = editedCode();
    expect(fixed).toContain('ggsave("after.png", p +\n  theme(\n');
    expect(fixed).toContain('  axis.text = element_text(size = 14),\n  legend.text = element_text(size = 14)');
    expect(fixed).toContain('), width = 8, height = 6, dpi = 300)');
    check(fixed);
    expect(row('Tick labels').glyph).toBe('✓');
    expect(row('Legend text').glyph).toBe('✓');
  });

  it('never inside a string that names a theme, nor on theme_update()', () => {
    renderPage();
    typeSize(7, 5);
    const inString = `library(ggplot2)\np <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +\n  theme_bw(base_size = 8) +\n  labs(title = "Fuel", caption = "Styled with theme_bw() at base size 8")\nggsave("fuel.png", p, width = 7, height = 5)`;
    check(inString);
    const fixed = editedCode();
    expect(fixed).toContain('caption = "Styled with theme_bw() at base size 8")');
    expect(fixed).toContain('ggsave("fuel.png", p +\n  theme(');

    check(`library(ggplot2)\ntheme_set(theme_gray(base_size = 16))\ntheme_update(axis.text = element_text(size = 6))\np <- ggplot(mtcars, aes(hp, mpg)) + geom_point()\nggsave("hp.png", p, width = 7, height = 5)`);
    const fixed2 = editedCode();
    expect(fixed2).toContain('theme_update(axis.text = element_text(size = 6))\np <-');
    check(fixed2);
    expect(row('Tick labels').glyph).toBe('✓');
  });

  it('names only the axis that is too small, so a larger one is not set lower', () => {
    renderPage();
    typeSize(8, 6);
    check(`${R_HEAD}  theme_bw(base_size = 18) +\n  theme(axis.text.x = element_text(size = 8, angle = 45, hjust = 1))\nggsave("x.png", p, width = 8, height = 6, dpi = 300)`);
    const fixed = editedCode();
    expect(fixed).toContain('axis.text.x = element_text(size = 14)');
    expect(fixed).not.toContain('axis.text.y');
    expect(fixed).not.toMatch(/\n\s*axis\.text = /);
  });

  it('the one-number advice is hidden when only a size set directly fails (base_size 24, axis.text 7)', () => {
    renderPage();
    typeSize(7, 5);
    check(`${R_HEAD}  theme_bw(base_size = 24) +\n  theme(axis.text = element_text(size = 7))\nggsave("c.png", p, width = 7, height = 5)`);
    expect(row('Tick labels').glyph).toBe('✗');
    expect(screen.queryByText(/Or change one number/)).toBeNull();
  });
});

describe('the French page says what it assumed, in French', () => {
  it('a tight save and a size the code leaves out', async () => {
    render(
      <MemoryRouter initialEntries={['/tools/figure-readability/fr']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Votre code de tracé R ou Python'), {
      target: { value: `${PY_HEAD}fig, ax = plt.subplots(figsize=(8, 6))\nax.plot(x, x)\nax.set_title('T')\nfig.savefig('l.png', bbox_inches='tight')` },
    });
    fireEvent.click(screen.getByRole('button', { name: /vérifier$/i }));
    // Testing Library folds the no-break spaces into spaces.
    expect(screen.getByText(/^Enregistrée avec bbox_inches="tight", qui rogne l’image à une autre taille que la figure de 8,0 po × 6,0 po : les tailles imprimées ci-dessous peuvent être fausses; le script modifié l’enregistre à la taille de la figure\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Aucune taille de police trouvée pour une partie du texte/)).toBeInTheDocument();
    expect(screen.getByText('Absente de votre code.')).toBeInTheDocument();
    expect(screen.getByText(/^Remplacez votre code par cette version/)).toBeInTheDocument();
  });
});

describe('the editor scores against the picture an image block prints, not the block', () => {
  const imageBlock = (captionPosition: Block['captionPosition']): Block => ({
    id: 'img-1', type: 'image', x: 10, y: 60, w: 80, h: 60, content: '', imageSrc: null, imageFit: 'contain',
    tableData: null, caption: 'Sample figure.', captionPosition,
  });
  const openCheck = (block: Block) => {
    render(
      <FigureTab mode="check" onChangeMode={() => {}} selectedImageBlock={block} defaultFigureWidthIn={10} defaultFigureHeightIn={7}
        palette={{ bg: '#fff', primary: '#111', accent: '#222', accent2: '#333', muted: '#666', headerBg: '#111', headerFg: '#fff' }}
        fontFamily="Georgia, serif" posterTables={[]} onInsertChart={() => {}} selectedChartBlock={null} onUpdateChartSpec={() => {}} />,
    );
    check(`${PY_HEAD}plt.rcParams['font.size'] = 16\nfig, ax = plt.subplots(figsize=(6.4, 4.8))\n${PY_TAIL}`);
  };

  it('a side caption takes 35% of the width: an 8 in block prints the figure 5.07 in wide', () => {
    openCheck(imageBlock('left'));
    // (80 - 2 frame units) × 0.65 = 50.7 units = 5.07 in; 5.07 / 6.4 = 0.79.
    expect(screen.getByText(/Scale factor: 0\.79x/)).toBeInTheDocument();
  });

  it('a caption above keeps the width, less the frame: 7.8 of 8 in', () => {
    openCheck(imageBlock('top'));
    // min(7.8 / 6.4, 6 / 4.8) = 1.22.
    expect(screen.getByText(/Scale factor: 1\.22x/)).toBeInTheDocument();
  });
});
