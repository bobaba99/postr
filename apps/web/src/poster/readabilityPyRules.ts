/**
 * The plot checker's Python rule table (fix 13b, the owner's design of
 * 2026-10-07): a bounded, explicit set of regex rules over the settings that
 * decide printed text size, each match kept with its character position.
 * readabilityPyModel.ts orders them by position (the last one that applies
 * wins) and readabilityPyFix.ts edits the winning occurrence in place.
 *
 * | rule | idiom (any alias: plt., mpl., matplotlib., bare)                 | sets                         | overrides / notes |
 * |------|-------------------------------------------------------------------|------------------------------|-------------------|
 * | P1   | rcParams['key'] = v                                               | key                          | earlier writes of key |
 * | P2   | rcParams.update({...}), update(dict(...)), update(NAME), update(**d) | each key in the dict      | same |
 * | P3   | rc('font', size=), rc('font', **font), rc('axes'|'xtick'|'ytick'|'legend'|'figure'|'savefig', ...) | the matching keys | same |
 * | P4   | rc_context({...}) / rc_context(rc={...})                          | each key, from its position  | read as an update; the end of its with-block is not tracked (out of scope) |
 * | P5   | sns.set_theme / sns.set / sns.set_context (context, font_scale, rc; positional as seaborn 0.13.2 orders them) | every font key, absolute | resets every per-element size set before it |
 * | P6   | rcdefaults() (plt, mpl, matplotlib; sns.reset_defaults)           | every key to its default     | resets everything before it |
 * | P7   | style.use(name) / style.context(name): matplotlib's built-in sheets | the sheet's keys (table below) | a sheet the check does not know: every row assumed |
 * | P8   | figure made: subplots, figure, subplot, subplot_mosaic, axes, Figure(), add_subplot, add_axes, twinx/twiny, colorbar, implicit pyplot/seaborn/pandas plotting; a colorbar seaborn or pandas makes (sns.heatmap unless cbar=False, histplot/kdeplot(cbar=True), df.plot.scatter(c='column'), df.plot.hexbin), named by `NAME = ....colorbar` (review round 2) | Axes made here read axes.labelsize and x/ytick.labelsize | figsize= on the call |
 * | P9   | set_size_inches(w, h)                                             | the canvas                   | the figure's figsize and figure.figsize |
 * | P10  | seaborn figure-level grids: relplot, catplot, lmplot, displot, jointplot, pairplot, FacetGrid, PairGrid, JointGrid | the canvas (height, aspect) when no facets or legend size it; Axes, facet titles and a legend made here | g.savefig crops with bbox_inches='tight' unless told otherwise |
 * | P11  | savefig(bbox_inches=), rcParams['savefig.bbox']; a notebook's show() (%matplotlib inline, get_ipython); PdfPages' pdf.savefig(fig) saves fig (review round 2) | whether the saved image is the canvas | 'tight' makes the printed scale unknown |
 * | P12  | title text: set_title, title, suptitle, ax.set(title=), g.set_titles, OO ax.title.set_fontsize | plot title (fontsize=, size=, a ** dict holding one, fontdict= inline or in a name); one title per loc= (center, left, right: a panel letter is a title of its own, review round 2) | an explicit size beats rcParams; titles read axes.titlesize (figure.titlesize) at the call |
 * | P13  | axis titles: set_xlabel/set_ylabel, xlabel/ylabel, ax.set(xlabel=), g.set_axis_labels, colorbar set_label, colorbar(label=), a colorbar label seaborn or pandas draws (cbar_kws={'label': ...}, scatter's c= column), OO ax.xaxis.label.set_fontsize; fig.supxlabel/supylabel (review round 2: listed before, not read) | axis titles | an explicit size beats rcParams; the size rcParams gives is read when the Axes is made; a sup-label reads figure.labelsize at the call |
 * | P14  | tick labels: tick_params / set_tick_params(labelsize=, or in a ** dict), xticks/yticks(fontsize=), set_xticklabels(fontsize=), set_xticks(labels=, fontsize=), setp(get_*ticklabels(), fontsize=), `for t in ...ticklabels(): t.set_fontsize(n)` | tick labels | an explicit size beats rcParams, read when the Axes is made |
 * | P15  | legend: legend, figlegend, fig.legend (fontsize=, prop= a dict or a FontProperties, inline or in a name; review round 3: a FontProperties called by an alias, `as FP`), seaborn hue legends, g.add_legend, sns.move_legend | legend text | an explicit size beats rcParams; a prop with no size takes legend.fontsize; read at the call |
 * | P16  | caption: fig.text / figtext (fontsize=, size=)                    | caption                      | read font.size at the call |
 * | P17  | NAME = number / arithmetic / 'named size' / {dict} / (w, h)       | a value names refer to       | its last assignment before the use |
 * | P18  | Postr's earlier fix (fix 13): _POSTR_NEED = {...} with _postr_raise_text | each named class raised to at least the size at save | read so a script fixed before still checks |
 * | P19  | Postr's fit block: set_size_inches(max(W / 10, f.get_figwidth() * W / poster_box.width), ...) and a save with bbox_inches=poster_box | the canvas: the save writes W × H | the printed scale is then known |
 * | P20  | a loop over Axes: `for V in (a, b)` / `[a, b]` / `X.flat` / `X.ravel()` / `X.flatten()` / `X` (X a subplots array), also through enumerate() and zip() (review round 2) | a size set on V is set on each Axes it names | otherwise V names no Axes: its size is a text of its own |
 * | P21  | Postr's floor on a size it cannot read (review round 2): `max(N, FontProperties(size=EXPR).get_size_in_points())`, or `max(N, float(EXPR))` for font.size (review round 3: a string from a config) | the size, at least N | read as N; a later fix raises N and keeps EXPR |
 *
 * Declared unreadable (the row marked, the size left as written): a
 * FontProperties with no size, a ** or a fontdict=/prop= value that is not
 * a dict or FontProperties the table can see (a call's result, a
 * parameter); a fontdict= of that kind still takes a fontsize= keyword.
 * A size written as an expression the table cannot evaluate (a config
 * value, `CONFIG['font_size']`) is unread: its row is marked, and the fix
 * writes the P21 floor where it is written, read when the script runs, so
 * never below what the code sets (review round 2, P13B-R2-03: pinning it at
 * the default the check assumed lowered it), whether or not it falls short at
 * the size assumed (review round 3, P13B-R3-03).
 *
 * Out of scope (the owner's rule: working code with only wrong sizes):
 * loops beyond the tick-label loop idiom, rc_context scoping, sizes set in
 * functions called later, threads, notebooks with many figures. Those are
 * read as their regex sees them, in source order (record 13b, section 10).
 */
import {
  argOf, calls, dictEntries, evalNumber, statementEnd, statementStart, stringAt, valueOf,
  type Arg, type Call, type Source,
} from './readabilityCalls';
import type { ElementKey } from './readabilityTypes';

export type RcKey =
  | 'font.size' | 'axes.titlesize' | 'axes.labelsize' | 'xtick.labelsize' | 'ytick.labelsize'
  | 'legend.fontsize' | 'figure.titlesize' | 'figure.labelsize' | 'figure.figsize' | 'savefig.bbox';

export type Span = readonly [number, number];

/**
 * A value as written: a size in points, a named size ('x-small'), a canvas
 * (w, h), a bbox, or one the check cannot read. `span` is where it is written
 * (null: set by a library, not editable in place); `origin` 'default' is the
 * library's own value, nothing in the code.
 */
export type PyValue =
  /** `floor`: Postr's P21 floor, `max(pt, floor)`: the size is at least pt, and `floor` is the expression it keeps. */
  | { kind: 'pt'; pt: number; span: Span | null; origin: 'code' | 'default'; floor?: string }
  | { kind: 'named'; name: string; span: Span | null; origin: 'code' | 'default' }
  | { kind: 'pair'; w: number; h: number; span: Span | null; origin: 'code' | 'default' }
  | { kind: 'bbox'; tight: boolean; span: Span | null; origin: 'code' | 'default' }
  /**
   * A size the check cannot read. With a span it is replaced there; with
   * none it is left as written (a FontProperties, a ** it cannot resolve)
   * and its row stays marked, unless `kw`: a keyword fontsize= on the call
   * wins over it (a fontdict= it cannot read).
   */
  | { kind: 'unread'; span: Span | null; origin: 'code'; kw?: boolean };

/** One rule's effect on rcParams, at the position it takes effect. */
export interface RcEvent {
  at: number;
  /** End of the statement it is in (where a setting after it can go). */
  end: number;
  rule: string;
  /** rcdefaults(): every key back to matplotlib's default first. */
  resetAll: boolean;
  set: Partial<Record<RcKey, PyValue>>;
}

/** A figure or Axes being made (P8, P10). */
export interface Creation {
  at: number;
  /** Start of its statement: where settings go so the figure is made with them. */
  stmt: number;
  kind: 'subplots' | 'figure' | 'axes' | 'twin' | 'colorbar' | 'grid' | 'implicit';
  /** A colorbar's label, drawn when it is made (colorbar(label=), cbar_kws={'label': ...}, a pandas c= column). */
  label?: boolean;
  /** Axes it makes (subplots(2, 2) makes 4; figure() none; a grid with facets 1, its count unknown). */
  axes: number;
  /** Names it binds (`fig, ax = ...` binds both). */
  names: string[];
  figsize: PyValue | null;
  /** The call itself (for adding figsize=). */
  call: Call;
  grid?: GridInfo;
}

export interface GridInfo {
  fn: string;
  /** The canvas when the call states it (no facets, no legend outside), else null. */
  canvas: { w: number; h: number } | null;
  facets: boolean;
  legend: boolean;
}

export type DrawCls = 'plotTitle' | 'suptitle' | 'axisTitle' | 'supLabel' | 'axisText' | 'legendText' | 'caption';

/** A text the code draws or sizes (P12-P16), at the position it happens. */
export interface Draw {
  cls: DrawCls;
  /** 'x' | 'y' ('z' for a 3D axis title) for axis titles and ticks; null for both or for other classes. */
  axis: 'x' | 'y' | 'z' | null;
  at: number;
  receiver: string;
  /** The size given at the call, or null (rcParams decides). */
  size: PyValue | null;
  /** True for a call that draws the text (a title, a legend); false for one that only sizes it (OO setters, tick sizes). */
  draws: boolean;
  /** Where `, fontsize=N` goes when the call gives no size. */
  addAt: number | null;
  rule: string;
  /** A title's loc= ('center' when not given): matplotlib draws one title per loc (P12). */
  loc?: string;
}

export interface SaveInfo {
  at: number;
  call: Call | null;
  /** The bbox_inches argument written on the call, if any. */
  bboxArg: Arg | null;
  tight: boolean;
  /** g.savefig: seaborn's grids crop with bbox_inches='tight' by default. */
  grid: boolean;
  /**
   * The figure a save writes when the receiver is not one (PdfPages'
   * pdf.savefig(fig)): its figure argument, else the current figure
   * (P13B-R2-05: the fit block took the PdfPages object for the figure).
   */
  figExpr?: string;
}

export interface PyScan {
  src: Source;
  rc: RcEvent[];
  creations: Creation[];
  draws: Draw[];
  /** P9, P19: set_size_inches() calls; `fit` for Postr's fit block, whose crop writes `value`. */
  sizes: Array<{ at: number; receiver: string; value: PyValue; rule: string; fit?: boolean }>;
  saves: SaveInfo[];
  /** show() calls (a notebook displays the figure there). */
  shows: number[];
  notebook: boolean;
  /** A style sheet the check does not know: every row is assumed. */
  unknownStyle: string | null;
  /** P18: Postr's earlier fix, the sizes it raises each class to. */
  earlierFix: Array<{ cls: ElementKey; pt: number; span: Span }>;
  /** The pyplot alias (`plt`), and how rcParams is reached for an inserted setting. */
  pyplot: string | null;
  rcParamsName: string | null;
}

/** matplotlib's named sizes (font_manager.font_scalings, 3.10.8). */
export const FONT_SCALINGS: Record<string, number> = {
  'xx-small': 0.579, 'x-small': 0.694, small: 0.833, medium: 1.0, large: 1.2, 'x-large': 1.44, 'xx-large': 1.728,
  larger: 1.2, smaller: 0.833,
};

/** matplotlib 3.10.8's defaults for the keys the rules read. */
export const RC_DEFAULTS: Record<RcKey, PyValue> = {
  'font.size': { kind: 'pt', pt: 10, span: null, origin: 'default' },
  'axes.titlesize': { kind: 'named', name: 'large', span: null, origin: 'default' },
  'axes.labelsize': { kind: 'named', name: 'medium', span: null, origin: 'default' },
  'xtick.labelsize': { kind: 'named', name: 'medium', span: null, origin: 'default' },
  'ytick.labelsize': { kind: 'named', name: 'medium', span: null, origin: 'default' },
  'legend.fontsize': { kind: 'named', name: 'medium', span: null, origin: 'default' },
  'figure.titlesize': { kind: 'named', name: 'large', span: null, origin: 'default' },
  'figure.labelsize': { kind: 'named', name: 'large', span: null, origin: 'default' },
  'figure.figsize': { kind: 'pair', w: 6.4, h: 4.8, span: null, origin: 'default' },
  'savefig.bbox': { kind: 'bbox', tight: false, span: null, origin: 'default' },
};

const RC_KEYS = Object.keys(RC_DEFAULTS) as RcKey[];
const FONT_KEYS: RcKey[] = ['font.size', 'axes.titlesize', 'axes.labelsize', 'xtick.labelsize', 'ytick.labelsize', 'legend.fontsize'];

/** P3: rc(group, kw=) → key. */
const RC_GROUPS: Record<string, Record<string, RcKey>> = {
  font: { size: 'font.size' },
  axes: { titlesize: 'axes.titlesize', labelsize: 'axes.labelsize' },
  xtick: { labelsize: 'xtick.labelsize' },
  ytick: { labelsize: 'ytick.labelsize' },
  legend: { fontsize: 'legend.fontsize' },
  figure: { titlesize: 'figure.titlesize', labelsize: 'figure.labelsize', figsize: 'figure.figsize' },
  savefig: { bbox: 'savefig.bbox' },
};

/** P7: matplotlib 3.10.8's built-in style sheets that set a key the rules read (stylelib/*.mplstyle). */
const STYLE_SHEETS: Record<string, Partial<Record<RcKey, number | string | [number, number]>>> = {
  Solarize_Light2: { 'axes.titlesize': 16, 'axes.labelsize': 12 },
  _mpl_gallery: { 'figure.figsize': [2, 2] },
  '_mpl-gallery': { 'figure.figsize': [2, 2] },
  '_mpl-gallery-nogrid': { 'figure.figsize': [2, 2] },
  bmh: { 'axes.titlesize': 'x-large', 'axes.labelsize': 'large' },
  classic: { 'font.size': 12, 'axes.titlesize': 'large', 'axes.labelsize': 'medium', 'xtick.labelsize': 'medium', 'ytick.labelsize': 'medium', 'legend.fontsize': 'large', 'figure.titlesize': 'medium', 'figure.labelsize': 'medium', 'figure.figsize': [8, 6] },
  fivethirtyeight: { 'font.size': 14, 'axes.titlesize': 'x-large', 'axes.labelsize': 'large' },
  ggplot: { 'font.size': 10, 'axes.titlesize': 'x-large', 'axes.labelsize': 'large' },
  'seaborn-v0_8': { 'axes.titlesize': 12, 'axes.labelsize': 11, 'xtick.labelsize': 10, 'ytick.labelsize': 10, 'legend.fontsize': 10, 'figure.figsize': [8, 5.5] },
  'seaborn-v0_8-notebook': { 'axes.titlesize': 12, 'axes.labelsize': 11, 'xtick.labelsize': 10, 'ytick.labelsize': 10, 'legend.fontsize': 10, 'figure.figsize': [8, 5.5] },
  'seaborn-v0_8-paper': { 'axes.titlesize': 9.6, 'axes.labelsize': 8.8, 'xtick.labelsize': 8, 'ytick.labelsize': 8, 'legend.fontsize': 8, 'figure.figsize': [6.4, 4.4] },
  'seaborn-v0_8-talk': { 'axes.titlesize': 15.6, 'axes.labelsize': 14.3, 'xtick.labelsize': 13, 'ytick.labelsize': 13, 'legend.fontsize': 13, 'figure.figsize': [10.4, 7.15] },
  'seaborn-v0_8-poster': { 'axes.titlesize': 19.2, 'axes.labelsize': 17.6, 'xtick.labelsize': 16, 'ytick.labelsize': 16, 'legend.fontsize': 16, 'figure.figsize': [12.8, 8.8] },
};
/** Built-in sheets that set none of these keys (colours, grids): known, nothing to read. */
const STYLE_NO_SIZES = /^(?:dark_background|fast|grayscale|tableau-colorblind10|petroff10|seaborn-v0_8-(?:bright|colorblind|dark|dark-palette|darkgrid|deep|muted|pastel|ticks|white|whitegrid))$/;

/** P5: seaborn's notebook context (rcmod.plotting_context, 0.13.2), scaled by the context and font_scale. */
const SEABORN_BASE: Partial<Record<RcKey, number>> = {
  'font.size': 12, 'axes.labelsize': 12, 'axes.titlesize': 12, 'xtick.labelsize': 11, 'ytick.labelsize': 11, 'legend.fontsize': 11,
};
const SEABORN_SCALING: Record<string, number> = { paper: 0.8, notebook: 1, talk: 1.5, poster: 2 };

// ── P17: names ──────────────────────────────────────────────────────

type Assigned = { at: number; text: string; start: number; end: number };

/**
 * Top-level `NAME = value` statements, by name, in source order (P17), and
 * tuple assignments (`fig_w, fig_h, dpi = 8, 5.6, 300`, the line Postr's own
 * Make-a-figure code writes), one value per name.
 */
function assignments(src: Source): Map<string, Assigned[]> {
  const byName = new Map<string, Assigned[]>();
  const add = (name: string, at: number, start: number, end: number) => {
    let e = end;
    while (e > start && /\s/.test(src.masked[e - 1]!)) e--;
    let a = start;
    while (a < e && /\s/.test(src.masked[a]!)) a++;
    const list = byName.get(name) ?? [];
    list.push({ at, text: src.code.slice(a, e), start: a, end: e });
    byName.set(name, list);
  };
  const re = /^[ \t]*([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]*=(?!=)[ \t]*/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src.masked)) !== null) {
    if (src.depth[m.index] !== 0) continue;
    const start = m.index + m[0].length;
    const end = statementEnd(src, start);
    const targets = m[1]!.split(',').map((t) => t.trim());
    if (targets.length === 1) { add(targets[0]!, m.index, start, end); continue; }
    // Split the right side at its top-level commas.
    const parts: Array<[number, number]> = [];
    let from = start;
    for (let i = start; i <= end; i++) {
      if (i === end || (src.masked[i] === ',' && src.depth[i] === src.depth[start])) { parts.push([from, i]); from = i + 1; }
    }
    if (parts.length === targets.length) targets.forEach((t, k) => add(t, m!.index, parts[k]![0], parts[k]![1]));
  }
  return byName;
}

export interface Names {
  /** The number a name holds at `at` (its last assignment before it), or null. */
  number(name: string, at: number): number | null;
  /** The assignment a name holds at `at`. */
  get(name: string, at: number): Assigned | null;
}

function names(src: Source): Names {
  const byName = assignments(src);
  const get = (name: string, at: number): Assigned | null => {
    const before = (byName.get(name) ?? []).filter((a) => a.at < at);
    return before.length ? before[before.length - 1]! : null;
  };
  const number = (name: string, at: number, depth = 0): number | null => {
    const a = get(name, at);
    if (!a || depth > 8) return null;
    return evalNumber(a.text, (n) => number(n, a.at, depth + 1));
  };
  return { number: (n, at) => number(n, at), get };
}

/** A size as written at start..end (P17 resolves names, P1-P16 call it). */
export function sizeValue(src: Source, nm: Names, start: number, end: number): PyValue {
  const span: Span = [start, end];
  const raw = src.code.slice(start, end).trim();
  // P21: Postr's floor, max(N, EXPR): at least N, EXPR kept for a later fix.
  const floor = /^max\(\s*(\d+(?:\.\d+)?)\s*,\s*([\s\S]+)\)$/.exec(raw);
  if (floor) return { kind: 'pt', pt: Number(floor[1]), span, origin: 'code', floor: floor[2]!.trim() };
  const named = stringAt(src, start, end);
  if (named !== null) {
    return FONT_SCALINGS[named] !== undefined ? { kind: 'named', name: named, span, origin: 'code' } : { kind: 'unread', span, origin: 'code' };
  }
  if (/^[A-Za-z_]\w*$/.test(raw)) {
    const a = nm.get(raw, start);
    const s = a ? stringAt(src, a.start, a.end) : null;
    if (s !== null && FONT_SCALINGS[s] !== undefined) return { kind: 'named', name: s, span, origin: 'code' };
  }
  const n = evalNumber(raw, (x) => nm.number(x, start));
  return n !== null && n > 0 ? { kind: 'pt', pt: n, span, origin: 'code' } : { kind: 'unread', span, origin: 'code' };
}

/** A (w, h) pair written at start..end: a tuple of numbers, names or arithmetic, or a name holding one. */
function pairValue(src: Source, nm: Names, start: number, end: number): PyValue {
  const span: Span = [start, end];
  let open = start;
  while (open < end && /\s/.test(src.masked[open]!)) open++;
  const raw = src.code.slice(start, end).trim();
  if (/^[A-Za-z_]\w*$/.test(raw)) {
    const a = nm.get(raw, start);
    if (a) {
      const inner = pairValue(src, nm, a.start, a.end);
      return inner.kind === 'pair' ? { ...inner, span } : { kind: 'unread', span, origin: 'code' };
    }
    return { kind: 'unread', span, origin: 'code' };
  }
  // A bare tuple: `figure.figsize = 4, 3`.
  if (src.masked[open] !== '(' && src.masked[open] !== '[') {
    const comma = (() => { for (let i = open; i < end; i++) if (src.masked[i] === ',' && src.depth[i] === src.depth[open]) return i; return -1; })();
    if (comma < 0) return { kind: 'unread', span, origin: 'code' };
    const w = evalNumber(src.code.slice(open, comma), (x) => nm.number(x, start));
    const h = evalNumber(src.code.slice(comma + 1, end), (x) => nm.number(x, start));
    return w != null && h != null && w > 0 && h > 0 ? { kind: 'pair', w, h, span, origin: 'code' } : { kind: 'unread', span, origin: 'code' };
  }
  const parts = splitTop(src, open);
  if (parts.length !== 2) return { kind: 'unread', span, origin: 'code' };
  const [w, h] = parts.map(([a, b]) => evalNumber(src.code.slice(a, b), (x) => nm.number(x, start)));
  return w != null && h != null && w > 0 && h > 0 ? { kind: 'pair', w, h, span, origin: 'code' } : { kind: 'unread', span, origin: 'code' };
}

function splitTop(src: Source, open: number): Array<[number, number]> {
  const close = src.close[open]!;
  const out: Array<[number, number]> = [];
  let from = open + 1;
  for (let i = open + 1; i <= close; i++) {
    if (i === close || (src.masked[i] === ',' && src.depth[i] === src.depth[open + 1])) {
      if (src.code.slice(from, i).trim()) out.push([from, i]);
      from = i + 1;
    }
  }
  return out;
}

function bboxValue(src: Source, start: number, end: number): PyValue {
  const s = stringAt(src, start, end);
  if (s !== null) return { kind: 'bbox', tight: s === 'tight', span: [start, end], origin: 'code' };
  return { kind: 'bbox', tight: false, span: [start, end], origin: 'code' };
}

/** The value of `key` written at start..end, by the key's kind. */
function rcValue(src: Source, nm: Names, key: RcKey, start: number, end: number): PyValue {
  if (key === 'figure.figsize') return pairValue(src, nm, start, end);
  if (key === 'savefig.bbox') return bboxValue(src, start, end);
  return sizeValue(src, nm, start, end);
}

// ── P1-P7: rcParams ────────────────────────────────────────────────

/**
 * The dict at an argument: a literal `{...}`, `dict(...)`, or a name holding
 * either (P17); its key/value spans, editable in place. `**NAME` and
 * `**{...}` arguments read the same way (P13B-R1-11: `matplotlib.rc('font',
 * **font)`, the widely copied idiom, was not read and the fix lowered every
 * size it set). Null when the value is none of these (a call's result, a
 * parameter): the check cannot know what it holds.
 */
export function dictAt(src: Source, nm: Names, arg: Arg): Array<{ key: string; start: number; end: number }> | null {
  const out: Array<{ key: string; start: number; end: number }> = [];
  let open = arg.start;
  const raw = src.code.slice(arg.start, arg.end).trim();
  if (/^[A-Za-z_]\w*$/.test(raw)) {
    const a = nm.get(raw, arg.start);
    if (!a) return null;
    open = a.start;
  }
  if (src.masked[open] === '{') {
    for (const e of dictEntries(src, open)) if (e.key) out.push({ key: e.key, start: e.start, end: e.end });
    return out;
  }
  if (/^dict\s*\(/.test(src.masked.slice(open, open + 8))) {
    const paren = src.masked.indexOf('(', open);
    const call = calls(src, /dict/).find((c) => c.open === paren);
    for (const a of call?.args ?? []) if (a.name) out.push({ key: a.name, start: a.start, end: a.end });
    return out;
  }
  return null;
}

function rcEvent(src: Source, at: number, rule: string, set: Partial<Record<RcKey, PyValue>>, resetAll = false): RcEvent {
  return { at, end: statementEnd(src, at), rule, resetAll, set };
}

function rcRules(src: Source, nm: Names, out: PyScan): void {
  // P1: rcParams['key'] = v
  const item = /\brcParams\s*\[\s*(['"])([\w.]+)\1\s*\]\s*=(?!=)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = item.exec(src.text)) !== null) {
    if (src.masked[m.index] !== src.code[m.index]) continue;
    const key = m[2] as RcKey;
    if (!RC_KEYS.includes(key)) continue;
    const start = m.index + m[0].length;
    let end = statementEnd(src, start);
    while (end > start && /\s/.test(src.masked[end - 1]!)) end--;
    out.rc.push(rcEvent(src, m.index, 'P1', { [key]: rcValue(src, nm, key, start, end) }));
  }
  // P2: rcParams.update(...)   P4: rc_context(...)
  for (const c of calls(src, /update|rc_context/)) {
    if (c.name === 'update' && !/rcParams$/.test(c.receiver)) continue;
    const arg = c.name === 'rc_context' ? (argOf(c, 'rc', 0) ?? null) : (c.args.find((a) => a.name === null && !a.star) ?? c.args.find((a) => a.star === 2) ?? null);
    if (!arg) continue;
    const set: Partial<Record<RcKey, PyValue>> = {};
    const dicts = [arg, ...c.args.filter((a) => a.star === 2 && a !== arg)].flatMap((a) => dictAt(src, nm, a) ?? []);
    for (const e of dicts) if (RC_KEYS.includes(e.key as RcKey)) set[e.key as RcKey] = rcValue(src, nm, e.key as RcKey, e.start, e.end);
    if (c.name === 'update') for (const a of c.args) if (a.name && RC_KEYS.includes(a.name.replace(/_/g, '.') as RcKey)) set[a.name.replace(/_/g, '.') as RcKey] = rcValue(src, nm, a.name.replace(/_/g, '.') as RcKey, a.start, a.end);
    out.rc.push(rcEvent(src, c.start, c.name === 'update' ? 'P2' : 'P4', set));
  }
  // P3: rc('group', kw=v)
  for (const c of calls(src, /rc/)) {
    if (c.receiver && !/^(?:plt|pyplot|mpl|matplotlib|pylab|\w+)$/.test(c.receiver)) continue;
    const group = c.args[0] ? stringAt(src, c.args[0].start, c.args[0].end) : null;
    const keys = group ? RC_GROUPS[group] : undefined;
    if (!keys) continue;
    const set: Partial<Record<RcKey, PyValue>> = {};
    for (const a of c.args.slice(1)) if (a.name && keys[a.name]) set[keys[a.name]!] = rcValue(src, nm, keys[a.name]!, a.start, a.end);
    // rc('font', **font): the dict's entries, each editable where it is written.
    for (const a of c.args.filter((x) => x.star === 2)) for (const e of dictAt(src, nm, a) ?? []) if (keys[e.key]) set[keys[e.key]!] = rcValue(src, nm, keys[e.key]!, e.start, e.end);
    out.rc.push(rcEvent(src, c.start, 'P3', set));
  }
  // P5: seaborn
  for (const c of calls(src, /set_theme|set|set_context|reset_defaults|reset_orig/)) {
    if (!/^(?:sns|seaborn)$/.test(c.receiver)) continue;
    if (c.name === 'reset_defaults' || c.name === 'reset_orig') { out.rc.push(rcEvent(src, c.start, 'P6', {}, true)); continue; }
    const ctxArg = argOf(c, 'context', 0);
    const ctx = ctxArg ? stringAt(src, ctxArg.start, ctxArg.end) : c.name === 'set_context' ? null : 'notebook';
    // seaborn 0.13.2: set_theme(context, style, palette, font, font_scale, color_codes, rc)
    // (set is its alias); set_context(context, font_scale, rc). P13B-R1-12: position 5 read color_codes.
    const scaleArg = argOf(c, 'font_scale', c.name === 'set_context' ? 1 : 4);
    const scale = scaleArg ? evalNumber(valueOf(src, scaleArg), (x) => nm.number(x, c.start)) : 1;
    const set: Partial<Record<RcKey, PyValue>> = {};
    if (ctx !== null && SEABORN_SCALING[ctx] !== undefined && scale !== null) {
      for (const k of FONT_KEYS) set[k] = { kind: 'pt', pt: SEABORN_BASE[k]! * SEABORN_SCALING[ctx]! * scale, span: null, origin: 'code' };
    } else if (ctxArg || (scaleArg && scale === null)) {
      for (const k of FONT_KEYS) set[k] = { kind: 'unread', span: null, origin: 'code' };
    }
    const rcArg = argOf(c, 'rc', c.name === 'set_context' ? 2 : 6);
    if (rcArg) for (const e of dictAt(src, nm, rcArg) ?? []) if (RC_KEYS.includes(e.key as RcKey)) set[e.key as RcKey] = rcValue(src, nm, e.key as RcKey, e.start, e.end);
    out.rc.push(rcEvent(src, c.start, 'P5', set));
  }
  // P6: rcdefaults
  for (const c of calls(src, /rcdefaults/)) out.rc.push(rcEvent(src, c.start, 'P6', {}, true));
  // P7: style sheets
  for (const c of calls(src, /use|context/)) {
    if (!/(?:^|\.)style$/.test(c.receiver)) continue;
    const arg = c.args[0];
    const names = arg ? (src.masked[arg.start] === '[' ? splitTop(src, arg.start).map(([a, b]) => stringAt(src, a, b)) : [stringAt(src, arg.start, arg.end)]) : [];
    for (const name of names) {
      if (name === 'default') { out.rc.push(rcEvent(src, c.start, 'P7', {}, true)); continue; }
      const sheet = name !== null ? STYLE_SHEETS[name] : undefined;
      if (sheet) {
        const set: Partial<Record<RcKey, PyValue>> = {};
        for (const [k, v] of Object.entries(sheet) as Array<[RcKey, number | string | [number, number]]>) {
          set[k] = Array.isArray(v) ? { kind: 'pair', w: v[0], h: v[1], span: null, origin: 'code' }
            : typeof v === 'number' ? { kind: 'pt', pt: v, span: null, origin: 'code' } : { kind: 'named', name: v, span: null, origin: 'code' };
        }
        out.rc.push(rcEvent(src, c.start, 'P7', set));
      } else if (name === null || !STYLE_NO_SIZES.test(name)) {
        out.unknownStyle = name ?? src.code.slice(arg!.start, arg!.end);
      }
    }
  }
  out.rc.sort((a, b) => a.at - b.at);
}

// ── P8-P11: figures, canvas, saves ─────────────────────────────────

const PYPLOT_PLOTS = 'plot|bar|barh|scatter|hist|hist2d|errorbar|boxplot|violinplot|imshow|pie|fill_between|fill_betweenx|step|stem|contour|contourf|pcolormesh|pcolor|hexbin|matshow|loglog|semilogx|semilogy|stackplot|polar|eventplot';
const SNS_AXES = 'lineplot|scatterplot|barplot|boxplot|violinplot|boxenplot|histplot|kdeplot|countplot|pointplot|stripplot|swarmplot|heatmap|regplot|ecdfplot|rugplot|residplot';
const SNS_GRIDS = 'relplot|catplot|lmplot|displot|jointplot|pairplot|FacetGrid|PairGrid|JointGrid|clustermap';
/** A colour name or spec matplotlib takes for c= (its base colours, CSS4 names, C0-C9, tab:, xkcd:, hex, a grey level): not a column. */
const COLOUR = /^(?:[bgrcmykw]|C\d|tab:\w+|xkcd:.*|#[0-9A-Fa-f]{3,8}|0?\.\d+|1(?:\.0*)?|0|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)$/i;

/** The names `name = call(...)` / `a, b = call(...)` binds, for a call starting at `at`. */
function boundNames(src: Source, at: number): string[] {
  const line = statementStart(src, at);
  const head = src.masked.slice(line, at);
  const m = head.match(/^[ \t]*(?:with\s.*\bas\s+)?([\w\s,()[\]]+?)\s*=(?!=)\s*$/) ?? head.match(/\bas\s+(\w+)\s*$/);
  if (!m) return [];
  return m[1]!.split(/[,()[\]\s]+/).filter((n) => /^[A-Za-z_]\w*$/.test(n));
}

function gridInfo(src: Source, nm: Names, c: Call): GridInfo {
  const num = (name: string, pos: number | undefined, dflt: number) => {
    const a = argOf(c, name, pos);
    return a ? evalNumber(valueOf(src, a), (x) => nm.number(x, c.start)) : dflt;
  };
  const has = (n: string) => !!argOf(c, n);
  const legendOff = (() => { const a = argOf(c, 'legend'); return a ? /^False$/.test(valueOf(src, a)) : false; })();
  const facets = has('col') || has('row');
  const legend = has('hue') && !legendOff;
  let canvas: { w: number; h: number } | null = null;
  if (c.name === 'jointplot' || c.name === 'JointGrid') {
    const h = num('height', undefined, 6);
    if (h !== null) canvas = { w: h, h };
  } else if (c.name !== 'pairplot' && c.name !== 'PairGrid' && c.name !== 'clustermap' && !facets && !legend) {
    const h = num('height', undefined, c.name === 'FacetGrid' ? 3 : 5);
    const asp = num('aspect', undefined, 1);
    if (h !== null && asp !== null) canvas = { w: h * asp, h };
  }
  return { fn: c.name, canvas, facets, legend };
}

function figureRules(src: Source, nm: Names, out: PyScan): void {
  const made: Creation[] = [];
  const add = (c: Call, kind: Creation['kind'], axes: number, extra: Partial<Creation> = {}) => {
    const fs = argOf(c, 'figsize');
    made.push({ at: c.start, stmt: statementStart(src, c.start), kind, axes, names: boundNames(src, c.start),
      figsize: fs ? pairValue(src, nm, fs.start, fs.end) : null, call: c, ...extra });
  };
  for (const c of calls(src, /subplots|figure|subplot|subplot_mosaic|axes|Figure|add_subplot|add_axes|inset_axes|twinx|twiny|colorbar/)) {
    const r = c.receiver;
    if (c.name === 'subplots' || c.name === 'subplot_mosaic') {
      const rows = argOf(c, 'nrows', 0);
      const cols = argOf(c, 'ncols', 1);
      const n = (a: Arg | undefined) => (a ? evalNumber(valueOf(src, a), (x) => nm.number(x, c.start)) ?? 1 : 1);
      add(c, 'subplots', c.name === 'subplot_mosaic' ? 2 : Math.max(1, n(rows) * n(cols)));
    } else if (c.name === 'figure' && (r === '' || /^(?:plt|pyplot|pylab)$/.test(r))) add(c, 'figure', 0);
    else if (c.name === 'Figure') add(c, 'figure', 0);
    else if (c.name === 'subplot' || c.name === 'add_subplot' || c.name === 'add_axes' || c.name === 'inset_axes' || (c.name === 'axes' && /^(?:plt|pyplot)$/.test(r))) add(c, 'axes', 1);
    else if (c.name === 'twinx' || c.name === 'twiny') add(c, 'twin', 1);
    else if (c.name === 'colorbar') add(c, 'colorbar', 1, { label: !!argOf(c, 'label') });
  }
  // A colorbar seaborn or pandas makes on its own (P13B-R2-06: its tick
  // labels and label printed short under a ✓). Its own Axes, named by
  // nothing the call returns (sns.heatmap returns the plot's Axes).
  const isFalse = (a: Arg | undefined) => !!a && /^False$/.test(valueOf(src, a));
  const isTrue = (a: Arg | undefined) => !!a && /^True$/.test(valueOf(src, a));
  const kwLabel = (a: Arg | undefined) => !!a && (dictAt(src, nm, a) ?? []).some((e) => e.key === 'label');
  for (const c of calls(src, /heatmap|histplot|kdeplot|scatter|hexbin|plot/)) {
    const seaborn = /^(?:sns|seaborn)$/.test(c.receiver);
    if (seaborn && c.name === 'heatmap' && !isFalse(argOf(c, 'cbar'))) add(c, 'colorbar', 1, { names: [], label: kwLabel(argOf(c, 'cbar_kws')) });
    else if (seaborn && (c.name === 'histplot' || c.name === 'kdeplot') && isTrue(argOf(c, 'cbar'))) add(c, 'colorbar', 1, { names: [], label: kwLabel(argOf(c, 'cbar_kws')) });
    else if (!seaborn && !isFalse(argOf(c, 'colorbar'))) {
      // df.plot.scatter(c='column') (or df.plot(kind='scatter', c=...)) labels its colorbar with
      // the column; df.plot.hexbin() draws one unlabelled. A c= that names a colour draws none.
      const kindArg = c.name === 'plot' && c.receiver ? argOf(c, 'kind') : undefined;
      const kind = kindArg ? stringAt(src, kindArg.start, kindArg.end) : /\.plot$/.test(c.receiver) ? c.name : null;
      const col = argOf(c, 'c');
      const named = col ? stringAt(src, col.start, col.end) : null;
      if (kind === 'scatter' && named !== null && !COLOUR.test(named)) add(c, 'colorbar', 1, { names: [], label: true });
      else if (kind === 'hexbin') add(c, 'colorbar', 1, { names: [] });
    }
  }
  for (const c of calls(src, new RegExp(SNS_GRIDS))) {
    if (!/^(?:sns|seaborn)$/.test(c.receiver)) continue;
    add(c, 'grid', 1, { grid: gridInfo(src, nm, c) });
  }
  // Implicit: a pyplot, seaborn axes-level or pandas plot with no figure yet.
  for (const c of calls(src, new RegExp(`${PYPLOT_PLOTS}|${SNS_AXES}`))) {
    const pyplot = /^(?:plt|pyplot|pylab)$/.test(c.receiver);
    const sns = /^(?:sns|seaborn)$/.test(c.receiver) && new RegExp(`^(?:${SNS_AXES})$`).test(c.name) && !argOf(c, 'ax');
    const pandas = c.name === 'plot' && c.receiver !== '' && !pyplot && !/^(?:ax\w*|axs?\[.*\]|axes.*)$/.test(c.receiver) && !argOf(c, 'ax');
    if (pyplot || sns || pandas) add(c, 'implicit', 1);
  }
  made.sort((a, b) => a.at - b.at);
  // An implicit one makes an Axes only when none exists yet (plt.figure()
  // then plt.plot(): the Axes is made at the plot, and reads rcParams there).
  out.creations = [];
  for (const m of made) {
    if (m.kind === 'implicit' && out.creations.some((p) => p.axes > 0 && p.kind !== 'colorbar')) continue;
    out.creations.push(m);
  }
  // `cbar = ax.collections[0].colorbar` names the colorbar a library made, the last one before it.
  const attr = /^[ \t]*([A-Za-z_]\w*)[ \t]*=[ \t]*[\w.[\]()]+\.colorbar[ \t]*$/gm;
  for (let a = attr.exec(src.masked); a; a = attr.exec(src.masked)) {
    const cb = out.creations.filter((m) => m.kind === 'colorbar' && !m.names.length && m.at < a!.index).pop();
    if (cb) cb.names = [a[1]!];
  }

  // P9: set_size_inches(w, h), ((w, h)), (w=, h=), (size), with more arguments after or not.
  for (const c of calls(src, /set_size_inches/)) {
    const w = argOf(c, 'w', 0);
    if (!w) continue;
    const h = argOf(c, 'h', 1);
    // The whole arguments, keywords included: an unreadable `w=W, h=H` is replaced by plain `10, 7`.
    const span: Span = [w.argStart, (h ?? w).argEnd];
    // P19: Postr's fit block (readabilityPyFix.ts), `set_size_inches(max(W / 10, f.get_figwidth() * W / poster_box.width), ...)`.
    const fitW = /get_figwidth\(\)\s*\*\s*(\d+(?:\.\d+)?)\s*\/\s*poster_box\.width\b/.exec(valueOf(src, w));
    const fitH = h ? /get_figheight\(\)\s*\*\s*(\d+(?:\.\d+)?)\s*\/\s*poster_box\.height\b/.exec(valueOf(src, h)) : null;
    if (fitW && fitH) {
      out.sizes.push({ at: c.start, receiver: c.receiver, value: { kind: 'pair', w: Number(fitW[1]), h: Number(fitH[1]), span, origin: 'code' }, rule: 'P19', fit: true });
      continue;
    }
    let v: PyValue;
    if (!h) v = { ...pairValue(src, nm, w.start, w.end), span };
    else {
      const wn = evalNumber(valueOf(src, w), (x) => nm.number(x, c.start));
      const hn = evalNumber(valueOf(src, h), (x) => nm.number(x, c.start));
      v = wn && hn && wn > 0 && hn > 0 ? { kind: 'pair', w: wn, h: hn, span, origin: 'code' } : { kind: 'unread', span, origin: 'code' };
    }
    out.sizes.push({ at: c.start, receiver: c.receiver, value: v, rule: 'P9' });
  }
  // PdfPages objects (`with PdfPages(...) as pdf`, `pdf = PdfPages(...)`): pdf.savefig(fig) saves fig.
  const pages = new Set(calls(src, /PdfPages/).flatMap((c) => [
    ...boundNames(src, c.start),
    ...(/^\s*as\s+([A-Za-z_]\w*)/.exec(src.masked.slice(c.close + 1, c.close + 80))?.slice(1, 2) ?? []),
  ]));
  for (const c of calls(src, /savefig/)) {
    const bboxArg = argOf(c, 'bbox_inches') ?? null;
    const grid = !/^(?:plt|pyplot|pylab)$/.test(c.receiver) && out.creations.some((m) => m.kind === 'grid' && m.names.includes(c.receiver));
    const tight = bboxArg ? stringAt(src, bboxArg.start, bboxArg.end) === 'tight' : false;
    const figArg = pages.has(c.receiver) ? argOf(c, 'figure', 0) : undefined;
    const figExpr = pages.has(c.receiver) ? (figArg ? valueOf(src, figArg).trim() : `${aliasOf(src) ?? 'plt'}.gcf()`) : undefined;
    out.saves.push({ at: c.start, call: c, bboxArg, tight, grid, ...(figExpr ? { figExpr } : {}) });
  }
  out.shows = calls(src, /show/).filter((c) => c.receiver === '' || /^(?:plt|pyplot|pylab)$/.test(c.receiver)).map((c) => c.start);
  out.notebook = /^[ \t]*%matplotlib\b|\bget_ipython\s*\(/m.test(src.masked);
}

/** The pyplot alias a script imports (`plt`), or null. */
function aliasOf(src: Source): string | null {
  return src.masked.match(/^[ \t]*import[ \t]+matplotlib\.pyplot[ \t]+as[ \t]+(\w+)/m)?.[1] ?? null;
}

export { FONT_KEYS, RC_KEYS, SNS_AXES, figureRules, names, rcRules };
