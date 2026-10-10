/**
 * Fix 13b — the edited script (readabilityPyFix.ts, readabilityRFix.ts): the
 * user's own script with plain edits, which the page asks them to use in
 * place of theirs (the owner's design of 2026-10-07). Each case runs the
 * page's own sequence (read, score, edit) at a print size and checks the
 * edit where it lands; the expected sizes are what matplotlib 3.10.8 and
 * ggplot2 4.0.3 draw for such scripts (scripts/checker-truth-check.mjs and
 * checker-r-truth-check.mjs run the same edits in the real renderers).
 *
 * Re-run: npx vitest run src/poster/__tests__/readabilityScript.test.ts
 */
import { describe, expect, it } from 'vitest';
import { computeReadability, parsePythonCode, parseRCode } from '../readability';
import { generateTargetedFullFix } from '../readabilityFullFix';

function fix(code: string, lang: 'r' | 'python', w = 10, h = 7): string {
  const opts = { defaultWidthIn: w, defaultHeightIn: h };
  const p = lang === 'r' ? parseRCode(code, opts) : parsePythonCode(code, opts);
  return generateTargetedFullFix(code, p, computeReadability(p, h, w), opts);
}
/** The re-check of the edited script: every row, and the warnings. */
function recheck(code: string, lang: 'r' | 'python', w = 10, h = 7) {
  const opts = { defaultWidthIn: w, defaultHeightIn: h };
  const p = lang === 'r' ? parseRCode(code, opts) : parsePythonCode(code, opts);
  return computeReadability(p, h, w);
}

const PY = 'import matplotlib.pyplot as plt\n';
const FIG = 'fig, ax = plt.subplots(figsize=(10, 7))\n';
const SAVE = "fig.savefig('f.png', dpi=300)\n";

describe('Python: a size the code writes is replaced where it is written', () => {
  it('a keyword size, a named size and a name at the call', () => {
    const code = `${PY}LABEL = 8\nplt.rcParams['font.size'] = 20\n${FIG}ax.set_title('T', fontsize=9)\nax.set_xlabel('x', fontsize=LABEL)\nax.set_ylabel('y', fontsize=LABEL)\nax.tick_params(labelsize='x-small')\nax.legend(prop={'size': 7})\n${SAVE}`;
    const out = fix(code, 'python');
    expect(out).toContain("ax.set_title('T', fontsize=18)");
    expect(out).toContain("ax.set_xlabel('x', fontsize=18)\nax.set_ylabel('y', fontsize=18)");
    expect(out).toContain('LABEL = 8\n');
    expect(out).toContain("ax.tick_params(labelsize=14)");
    expect(out).toContain("ax.legend(prop={'size': 14})");
    expect(recheck(out, 'python').elements.every((e) => e.status === 'pass')).toBe(true);
  });

  it('an rcParams value in each form: item, update(), rc(), a dict held in a name, rc_context()', () => {
    const forms = [
      ["plt.rcParams['xtick.labelsize'] = 8\nplt.rcParams['ytick.labelsize'] = 8", "plt.rcParams['xtick.labelsize'] = 14\nplt.rcParams['ytick.labelsize'] = 14"],
      ["plt.rcParams.update({'xtick.labelsize': 8, 'ytick.labelsize': 8})", "plt.rcParams.update({'xtick.labelsize': 14, 'ytick.labelsize': 14})"],
      ["plt.rc('xtick', labelsize=8)\nplt.rc('ytick', labelsize=8)", "plt.rc('xtick', labelsize=14)\nplt.rc('ytick', labelsize=14)"],
      ["params = {'xtick.labelsize': 8, 'ytick.labelsize': 8}\nplt.rcParams.update(params)", "params = {'xtick.labelsize': 14, 'ytick.labelsize': 14}"],
    ];
    for (const [form, want] of forms) {
      const out = fix(`${PY}plt.rcParams['font.size'] = 20\n${form}\n${FIG}${SAVE}`, 'python');
      expect(out, form).toContain(want);
      // Every size it needs was written in the code: nothing is added.
      expect(out, form).not.toContain('# Postr:');
    }
    const ctx = fix(`${PY}with plt.rc_context({'xtick.labelsize': 8, 'ytick.labelsize': 8, 'font.size': 20}):\n    ${FIG}    ${SAVE}`, 'python');
    expect(ctx).toContain("with plt.rc_context({'xtick.labelsize': 14, 'ytick.labelsize': 14, 'font.size': 20}):");
  });

  it('a tick-label loop and plt.setp() are raised in place', () => {
    const loop = fix(`${PY}plt.rcParams['font.size'] = 20\n${FIG}for t in ax.get_xticklabels() + ax.get_yticklabels():\n    t.set_fontsize(7)\n${SAVE}`, 'python');
    expect(loop).toContain('    t.set_fontsize(14)\n');
    const setp = fix(`${PY}plt.rcParams['font.size'] = 20\n${FIG}plt.setp(ax.get_xticklabels(), fontsize=7)\nplt.setp(ax.get_yticklabels(), fontsize=7)\n${SAVE}`, 'python');
    expect(setp).toContain('plt.setp(ax.get_xticklabels(), fontsize=14)\nplt.setp(ax.get_yticklabels(), fontsize=14)');
  });

  it('a size in a comment or a string is never edited', () => {
    const code = `${PY}${FIG}ax.set_xlabel('fontsize=8 here', fontsize=8)  # was fontsize=8\n${SAVE}`;
    const out = fix(code, 'python');
    expect(out).toContain("ax.set_xlabel('fontsize=8 here', fontsize=18)  # was fontsize=8");
  });
});

describe('Python: a size the code does not set is set, before the figure is made', () => {
  it('one block before the figure, keeping the script\'s other lines as written', () => {
    const code = `${PY}import numpy as np\nx = np.arange(3)\n${FIG}ax.plot(x, x, label='a')\nax.set_title('T')\nax.set_xlabel('x')\nax.legend()\n${SAVE}`;
    const out = fix(code, 'python', 6, 4.5);
    expect(out).toContain("x = np.arange(3)\n# Postr: text sizes and canvas for this print size\nplt.rcParams.update({");
    expect(out).toContain("})\nfig, ax = plt.subplots(figsize=(10, 7))\n");
    expect(out.replace(/# Postr:.*\nplt\.rcParams\.update\(\{.*\}\)\n/, '')).toBe(code);
  });

  it('after a seaborn reset, which would undo a setting made before it', () => {
    const code = `${PY}import seaborn as sns\nplt.rcParams['font.size'] = 20\nsns.set_theme(style='whitegrid')\n${FIG}ax.set_title('T')\nax.set_xlabel('x')\n${SAVE}`;
    const out = fix(code, 'python');
    // seaborn draws titles and labels at 12 and ticks at 11 whatever font.size says.
    expect(out).toContain("sns.set_theme(style='whitegrid')\n# Postr: text sizes and canvas for this print size\nplt.rcParams.update({'axes.titlesize': 18, 'axes.labelsize': 18");
    expect(out).toContain("plt.rcParams['font.size'] = 20\n");
  });

  it('a reset after the figure is made and before the title: the title\'s size goes after it', () => {
    const code = `${PY}${FIG}import seaborn as sns\nsns.set_theme()\nax.set_title('T')\n${SAVE}`;
    const out = fix(code, 'python');
    expect(out).toContain("sns.set_theme()\n# Postr: text sizes and canvas for this print size\nplt.rcParams.update({'axes.titlesize': 18");
  });

  it('a caption gets its own fontsize=', () => {
    const out = fix(`${PY}${FIG}fig.text(0.01, 0.01, 'n = 12')\n${SAVE}`, 'python');
    expect(out).toContain("fig.text(0.01, 0.01, 'n = 12', fontsize=12)");
  });

  it('never lowers a text the same setting decides: the larger size is kept', () => {
    // Two Axes made at different font sizes read the same tick key: the twin
    // made later, its y ticks at 30 pt, is not set down to the 14 the first
    // Axes needs (its x ticks need only 14).
    const code = `${PY}${FIG}plt.rcParams['font.size'] = 30\nax2 = ax.twinx()\n${SAVE}`;
    const out = fix(code, 'python');
    expect(out).toMatch(/'xtick\.labelsize': 14, 'ytick\.labelsize': 30/);
  });

  it('a second fix that needs a size the first did not set adds it to that block', () => {
    // At 10 × 7 only the titles fall short (font.size 14); at 5 × 3.5 the tick
    // labels do too, and their keys go into the block the first fix wrote.
    const code = `${PY}plt.rcParams['font.size'] = 14\n${FIG}ax.set_title('T')\nax.set_xlabel('x')\n${SAVE}`;
    const once = fix(code, 'python', 10, 7);
    expect(once).not.toContain("'xtick.labelsize'");
    const twice = fix(once, 'python', 5, 3.5);
    expect(twice.match(/rcParams\.update\(/g)).toHaveLength(1);
    expect(twice).toContain("plt.rcParams.update({'axes.titlesize': 36, 'axes.labelsize': 36, 'xtick.labelsize': 28, 'ytick.labelsize': 28");
  });

  it('a second fix at a smaller size edits the block it wrote, and adds no second block', () => {
    const code = `${PY}${FIG}ax.set_title('T')\nax.set_xlabel('x')\n${SAVE}`;
    const once = fix(code, 'python', 10, 7);
    const twice = fix(once, 'python', 5, 3.5);
    expect(twice.match(/rcParams\.update\(/g)).toHaveLength(1);
    expect(recheck(twice, 'python', 5, 3.5).elements.every((e) => e.status === 'pass')).toBe(true);
  });
});

describe('Python: the canvas the check scored is the one that prints', () => {
  it('a figure size the code leaves out is set to matplotlib\'s default', () => {
    const out = fix(`${PY}fig, ax = plt.subplots()\nax.set_title('T', fontsize=30)\n${SAVE}`, 'python');
    expect(out).toContain("'figure.figsize': (6.4, 4.8)");
  });

  it('a figure size the check cannot read is replaced by the print size it assumed', () => {
    const out = fix(`${PY}fig, ax = plt.subplots(figsize=size_for(poster))\nax.set_title('T', fontsize=30)\n${SAVE}`, 'python');
    expect(out).toContain('fig, ax = plt.subplots(figsize=(10, 7))');
  });

  it('a tight save: the figure is sized so what it draws fits the canvas, and the save writes that box; so does a tight rcParams', () => {
    // Review round 1, P13B-R1-01: removing the crop cut out what the script draws outside the plots.
    const out = fix(`${PY}${FIG}ax.set_title('T', fontsize=30)\nfig.savefig('f.png', dpi=300, bbox_inches='tight')\n`, 'python');
    expect(out).toContain([
      '# Postr: the saved image at 10 × 7 in, with the text outside the plots kept in it',
      'from matplotlib.transforms import Bbox',
      'poster_fig = fig', 'poster_dpi = poster_fig.dpi', 'poster_fig.set_dpi(300)', 'for _ in range(8):',
      '    poster_fig.draw_without_rendering()',
      "    poster_box = poster_fig.get_tightbbox().padded(plt.rcParams['savefig.pad_inches'])",
      '    poster_fig.set_size_inches(max(10 / 10, poster_fig.get_figwidth() * 10 / poster_box.width), max(7 / 10, poster_fig.get_figheight() * 7 / poster_box.height))',
      'poster_fig.draw_without_rendering()',
      "poster_box = poster_fig.get_tightbbox().padded(plt.rcParams['savefig.pad_inches'])",
      'poster_box = Bbox.from_bounds(poster_box.x0 - (10 - poster_box.width) / 2, poster_box.y0 - (7 - poster_box.height) / 2, 10, 7)',
      'poster_fig.set_dpi(poster_dpi)', "fig.savefig('f.png', dpi=300, bbox_inches=poster_box)\n",
    ].join('\n'));
    expect(recheck(out, 'python').canvasAssumed).toBe(false);
    const rc = fix(`${PY}plt.rcParams['savefig.bbox'] = 'tight'\n${FIG}ax.set_title('T', fontsize=30)\nfig.savefig('f.png')\nfig.savefig('f.pdf')\n`, 'python');
    expect(rc).toContain("plt.rcParams['savefig.bbox'] = 'tight'");
    expect(rc).toContain("poster_fig.set_dpi(poster_dpi if plt.rcParams['savefig.dpi'] == 'figure' else plt.rcParams['savefig.dpi'])");
    // Both saves of the figure write the box.
    expect(rc).toContain("poster_fig.set_dpi(poster_dpi)\nfig.savefig('f.png', bbox_inches=poster_box)\nfig.savefig('f.pdf', bbox_inches=poster_box)\n");
    expect(recheck(rc, 'python').canvasAssumed).toBe(false);
  });

  it('the fit block uses the save\'s own pad_inches, and a second fix adds no second block', () => {
    const out = fix(`${PY}${FIG}ax.set_title('T', fontsize=30)\nfig.savefig('f.png', dpi=200, bbox_inches='tight', pad_inches=0.3)\n`, 'python');
    expect(out).toContain('poster_fig.set_dpi(200)');
    expect(out).toContain('poster_box = poster_fig.get_tightbbox().padded(0.3)');
    const twice = fix(out, 'python', 5, 3.5);
    expect(twice.match(/# Postr: the saved image/g)).toHaveLength(1);
  });

  it('a seaborn grid is set to the print size before its save, which writes the whole figure', () => {
    const code = "import seaborn as sns\ng = sns.relplot(data=df, x='a', y='b', col='c', height=4)\ng.savefig('g.png', dpi=300)\n";
    const out = fix(code, 'python', 8, 6);
    expect(out).toContain("poster_fig = g.figure\nposter_fig.set_size_inches(8, 6)\n");
    expect(out).toContain("poster_fig.tight_layout(rect=(0, 0, 1 - (legend_in + 0.1) / 8, 1))\ng.savefig('g.png', dpi=300, bbox_inches=None)");
  });
});

const R_HEAD = 'library(ggplot2)\np <- ggplot(df, aes(x, y, colour = g)) + geom_point() +\n  labs(title = "T", x = "X", y = "Y", colour = "G")';

describe('R: one theme() in the plot ggsave() saves, after every theme of the user\'s', () => {
  it('a named or positional plot argument; none means last_plot()', () => {
    const named = fix(`${R_HEAD} + theme_bw(base_size = 8)\nggsave("f.png", plot = p, width = 10, height = 7)`, 'r');
    expect(named).toContain('ggsave("f.png", plot = p +\n  theme(\n');
    const none = fix(`${R_HEAD} + theme_bw(base_size = 8)\nprint(p)\nggsave("f.png", width = 10, height = 7)`, 'r');
    expect(none).toContain('ggsave("f.png", plot = last_plot() +\n  theme(\n');
    expect(recheck(none, 'r').elements.every((e) => e.status === 'pass')).toBe(true);
  });

  it('a plot written as an expression is put in brackets, so the theme reaches all of it', () => {
    const out = fix(`${R_HEAD} + theme_bw(base_size = 8)\nggsave("f.png", p | p, width = 10, height = 7)`, 'r');
    expect(out).toContain('ggsave("f.png", (p | p) +\n  theme(');
  });

  it('only the child below its minimum is named, at the size it needs', () => {
    const out = fix(`${R_HEAD} + theme_bw(base_size = 22) + theme(axis.text.y = element_text(size = 7))\nggsave("f.png", p, width = 10, height = 7)`, 'r');
    expect(out).toContain('axis.text.y = element_text(size = 14)');
    expect(out).not.toMatch(/axis\.text(\.x)? = element_text\(size = 14\)/);
  });

  it('a blanked element has no row and is never drawn back', () => {
    const code = `${R_HEAD} + theme_bw(base_size = 6) + theme(axis.text = element_blank())\nggsave("f.png", p, width = 10, height = 7)`;
    expect(recheck(code, 'r').elements.some((e) => e.name === 'Tick labels')).toBe(false);
    expect(fix(code, 'r')).not.toContain('axis.text = element_text');
  });

  it('no base_size in the code: the base the check assumed is set at the root', () => {
    const out = fix(`${R_HEAD} + theme_bw()\nggsave("f.png", p, width = 10, height = 7)`, 'r');
    expect(out).toContain('theme(\n  text = element_text(size = 11)');
  });

  it('a ggsave() size the check cannot read is replaced by the print size it assumed', () => {
    const out = fix(`${R_HEAD} + theme_bw(base_size = 16)\nggsave("f.png", p, width = w_poster, height = 7, units = "cm")`, 'r', 12, 9);
    expect(out).toContain('width = 12, height = 9, units = "in"');
  });
});

describe('review round 1: what the script leaves as written, and the parts no test reached (P13B-R1-02, -08, -14, -16)', () => {
  it('a prop= or ** the check cannot resolve is left as written and its row stays marked; a fontdict= it cannot read takes a fontsize=', () => {
    const prop = `${PY}${FIG}ax.plot([0, 1], label='a')\nax.legend(prop=make_font())\n${SAVE}`;
    const outProp = fix(prop, 'python');
    expect(outProp).toContain('ax.legend(prop=make_font())');
    expect(recheck(outProp, 'python').elements.find((e) => e.name === 'Legend text')).toMatchObject({ assumed: true, kept: true });
    const star = `${PY}opts = get_opts()\n${FIG}ax.set_title('T', **opts)\n${SAVE}`;
    const outStar = fix(star, 'python');
    expect(outStar).toContain("ax.set_title('T', **opts)\n");
    expect(recheck(outStar, 'python').elements.find((e) => e.name === 'Plot title')).toMatchObject({ assumed: true, kept: true });
    const fd = fix(`${PY}${FIG}ax.set_title('T', fontdict=get_font())\n${SAVE}`, 'python');
    expect(fd).toContain("ax.set_title('T', fontdict=get_font(), fontsize=18)");
  });

  it('a notebook that only shows its figure gets a save of the canvas with everything the display kept (the gate\'s CUT, c-nb-inline)', () => {
    const code = `%matplotlib inline\n${PY}${FIG}ax.plot([0, 1], label='a')\nax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))\nplt.show()\n`;
    const out = fix(code, 'python');
    expect(out).toContain('poster_fig = plt.gcf()\n');
    expect(out).toContain('plt.savefig("poster_figure.png", dpi=300, bbox_inches=poster_box)\nplt.show()');
    expect(recheck(out, 'python').canvasAssumed).toBe(false);
  });

  it('a seaborn grid saved with an explicit bbox_inches=\'tight\' is told None (g.savefig crops when it is not given)', () => {
    const code = "import seaborn as sns\ng = sns.relplot(data=df, x='a', y='b', hue='h', col='c', height=4)\ng.savefig('g.png', dpi=300, bbox_inches='tight')\n";
    const out = fix(code, 'python');
    expect(out).toContain("g.savefig('g.png', dpi=300, bbox_inches=None)");
    expect(recheck(out, 'python').canvasAssumed).toBe(false);
  });

  it('a labelsize in a dict passed to tick_params(**) is read and raised in the dict (a sibling of P13B-R1-08)', () => {
    const out = fix(`${PY}tick_kw = {'labelsize': 7, 'direction': 'in'}\n${FIG}ax.tick_params(**tick_kw)\nax.set_title('T', fontsize=20)\n${SAVE}`, 'python');
    expect(out).toContain("tick_kw = {'labelsize': 14, 'direction': 'in'}");
    expect(recheck(out, 'python').elements.find((e) => e.name === 'Tick labels')).toMatchObject({ sourcePt: 14, status: 'pass', assumed: false });
  });

  it('a caption call that ends with a comma gets fontsize= without a second comma', () => {
    const out = fix(`${PY}${FIG}fig.text(0.01, 0.01, 'n = 12',)\n${SAVE}`, 'python');
    expect(out).toContain("fig.text(0.01, 0.01, 'n = 12', fontsize=12)");
  });

  it('a second fix adds only the keys its block lacks, each once', () => {
    const code = `${PY}plt.rcParams['font.size'] = 14\n${FIG}ax.set_title('T')\nax.set_xlabel('x')\n${SAVE}`;
    const twice = fix(fix(code, 'python', 10, 7), 'python', 5, 3.5);
    for (const k of ['axes.titlesize', 'axes.labelsize', 'xtick.labelsize']) expect(twice.match(new RegExp(`'${k}'`, 'g')), k).toHaveLength(1);
  });

  it('cb.ax is the colorbar\'s own Axes: its tick size is read there, and no default is set for it', () => {
    // No font.size: a colorbar tick size left at the default would be marked and set (ytick.labelsize).
    const code = `${PY}${FIG}im = ax.imshow([[0, 1], [1, 0]])\ncb = fig.colorbar(im)\nax.tick_params(labelsize=16)\ncb.ax.tick_params(labelsize=6)\nax.set_title('T', fontsize=20)\n${SAVE}`;
    expect(recheck(code, 'python').elements.find((e) => e.name === 'Tick labels')?.sourcePt).toBe(6);
    const out = fix(code, 'python');
    expect(out).toContain('cb.ax.tick_params(labelsize=14)');
    expect(out).not.toContain("'ytick.labelsize'");
  });

  it('two figure legends are two legends: the smaller one is the row', () => {
    const code = `${PY}${FIG}ax.plot([0, 1], label='a')\nfig.legend(fontsize=8)\nfig.legend(loc='lower left', fontsize=20)\n${SAVE}`;
    expect(recheck(code, 'python').elements.find((e) => e.name === 'Legend text')?.sourcePt).toBe(8);
  });

  it('a seaborn grid\'s g.savefig crops by default: the scale is marked and the crop is kept at the size checked', () => {
    const code = "import seaborn as sns\ng = sns.relplot(data=df, x='a', y='b', height=4, aspect=1.5)\ng.set_axis_labels('a', 'b')\ng.savefig('g.png', dpi=300)\n";
    expect(recheck(code, 'python').canvasAssumed).toBe(true);
    const out = fix(code, 'python');
    expect(out).toContain('poster_fig = g.figure\n');
    expect(out).toContain('max(6 / 10, poster_fig.get_figwidth() * 6 / poster_box.width), max(4 / 10, poster_fig.get_figheight() * 4 / poster_box.height)');
    expect(out).toContain("g.savefig('g.png', dpi=300, bbox_inches=poster_box)\n");
    expect(recheck(out, 'python').canvasAssumed).toBe(false);
  });
});

describe('review round 1, R: theme_set() wipes an earlier theme_update(), ggsave()\'s units and scale (P13B-R1-14)', () => {
  it('a theme_update() before theme_set() changes nothing', () => {
    const code = 'library(ggplot2)\ntheme_update(text = element_text(size = 7))\ntheme_set(theme_gray(base_size = 16))\np <- ggplot(df, aes(x, y)) + geom_point()\nggsave("f.png", p, width = 10, height = 7)';
    expect(recheck(code, 'r').elements.find((e) => e.name === 'Axis titles')?.sourcePt).toBe(16);
  });

  it('pixels are divided by the call\'s own dpi', () => {
    const code = `${R_HEAD} + theme_bw(base_size = 20)\nggsave("f.png", p, width = 2100, height = 1500, units = "px", dpi = 150)`;
    expect(recheck(code, 'r', 7, 5).scale).toBeCloseTo(0.5, 6);
  });

  it('a ggsave() size it cannot read is replaced with scale 1, and a partial name (w =) is read as width', () => {
    const out = fix(`${R_HEAD} + theme_bw(base_size = 16)\nggsave("f.png", p, width = w_poster, height = 7, scale = 2)`, 'r', 12, 9);
    expect(out).toContain('width = 12, height = 9, scale = 1)');
    expect(recheck(`${R_HEAD} + theme_bw(base_size = 16)\nggsave("f.png", p, w = 14, h = 10)`, 'r', 7, 5).scale).toBeCloseTo(0.5, 6);
  });

  it('reads and edits a long script in linear time (8003 lines well under a second; 27 s before)', () => {
    const lines = Array.from({ length: 8000 }, (_, k) => `p <- p + theme(axis.text = element_text(size = ${6 + (k % 3)}))`);
    const code = `library(ggplot2)\np <- ggplot(df, aes(x, y)) + geom_point()\n${lines.join('\n')}\nggsave("f.png", p, width = 7, height = 5)`;
    const t0 = performance.now();
    const out = fix(code, 'r', 7, 5);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(out).toContain('axis.text = element_text(size = 14)');
  });
});
