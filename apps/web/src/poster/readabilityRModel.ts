/**
 * The plot checker's R rule table and model (fix 13b, the owner's design of
 * 2026-10-07): regex rules over the settings that decide printed text size
 * in ggplot2, each match kept with its position, ordered by position (the
 * last one that applies wins).
 *
 * | rule | idiom                                                   | sets                          | overrides / notes |
 * |------|---------------------------------------------------------|-------------------------------|-------------------|
 * | R1   | theme_<name>(base_size = v) or theme_<name>(v)          | a complete theme and its base | every theme() before it (a complete theme replaces the theme) |
 * | R2   | theme(elem = element_text(size = v or rel(r)))          | that element; text, title and every scored element and its .x/.y children | a later theme() for the same element; a child's own size beats its parent's |
 * | R3   | theme_set(T)                                            | the global theme              | replaced by a complete theme the plot adds |
 * | R4   | theme_update(...)                                       | global theme elements, in order, after the last theme_set() | the plot's own theme() calls apply after it, wherever they are written (ggplot2 builds get_theme() + the plot's theme) |
 * | R5   | ggsave(filename, plot, device, path, scale, width, height, units, dpi) | the canvas: width × scale by height × scale, in units | the last ggsave(); arguments matched as R matches them (exact, partial, then position) |
 * | R6   | element_blank()                                         | the element is not drawn      | its row is left out, and the fix never draws it back |
 * | R7   | facet_wrap / facet_grid(rows, cols)                     | which strips are drawn (x on top, y at the side) | |
 * | R8   | name <- v, name = v                                     | a value names refer to        | its last assignment before the use (a comment after it ignored: review round 2) |
 * | R9   | geom_text, geom_label, annotate("text"), stat_summary(geom = "text") size (mm) | in-panel text: a warning, not a row | |
 * | R10  | Postr's floor: element_text(size = max(N, calc_element(leaf, complete_theme(p$theme))$size)) | that element, at least N | read as N; written under a theme that is not ggplot2's, or a base_size the check cannot read (review round 2) |
 * | R11  | png / jpeg / tiff / bmp / pdf / svg / cairo_pdf / ragg's agg_png, agg_jpeg, agg_tiff(...) then print(p) or the plot on a line of its own (autoprint, review round 3), with no ggsave() (review round 2; readabilityROutput.ts) | the canvas, and the plot drawn | a device whose plot is not found: said, and a ggsave() added |
 * | R12  | a plot combining others: plot_grid, ggdraw + draw_plot, ggarrange, arrangeGrob, grid.arrange, wrap_plots, patchwork operators (review round 2; readabilityROutput.ts) | each combined plot is read on its own, the smallest size wins | the fix themes each plot before it is combined; plots the check cannot name: rows marked, nothing written |
 * | R13  | guide_legend(theme = theme(legend.text = , legend.title = )), guide_legend(label.theme = , title.theme = ) and the colour-bar guides (review round 2) | that guide's legend text and title | applied after the plot's theme, never reset by a complete theme; raised where they are written |
 * | R14  | `T %+replace% theme(elem = element_text(...))` (review round 2) | the element replaced whole | a size it leaves out comes from the parent, not the complete theme's rel() |
 * | R15  | a name holding a theme: a theme object, a function that builds a plot, a plot another is built from (review round 3; readabilityRNames.ts) | its themes, where the name is used | P13B-R3-01: a combined figure read each plot from its own lines only; a theme() in a name was read where written |
 *
 * ggplot2 4.0.3's inheritance, which every complete theme of ggplot2's
 * shares: text is base_size; title, axis.title(.x/.y), legend.title and
 * plot.subtitle inherit; axis.text, legend.text and strip.text are rel(0.8)
 * of text; plot.title rel(1.2) and plot.caption rel(0.8) of title; .x/.y
 * children inherit. rel() resolves against the parent's size when drawn.
 * theme_void() blanks axis.title and axis.text (P13B-R1-06). A complete
 * theme that is not ggplot2's (theme_cowplot()) may draw other sizes: every
 * size that rests on it is marked as assumed, the fix never writes the root
 * text size from ggplot2's 11 (P13B-R1-05), a row of it that falls short is
 * set with a floor at the size the theme draws (R10, read at run time with
 * ggplot2's calc_element(), so never lower) and the one-number advice is
 * withheld. A base_size the check cannot read is treated the same way
 * (P13B-R2-03: the fix wrote constants below what ggplot2 drew). Since review
 * round 3 every drawn size resting on either is floored, short or not at the
 * size assumed (P13B-R3-03), and both are "Not read from your code".
 */
import { argOf, calls, evalNumber, source, statementEnd, stringAt, valueOf, type Arg, type Call, type Source } from './readabilityCalls';
import { assignmentsOf, combinedOf, deviceCanvas, outputOf, type Combined, type ROutput } from './readabilityROutput';
import { namesOf, themeOrder } from './readabilityRNames';
import { R_DEFAULTS, R_ELEMENTS, DEFAULT_SIZE_LABEL, type ElementKey, type FigureParams, type ParseOptions, type RChild } from './readabilityTypes';

export { GGSAVE_FORMALS } from './readabilityROutput';

/** ggplot2's own complete themes. */
const GG_THEMES = /^theme_(?:grey|gray|bw|linedraw|light|dark|minimal|classic|void|test)$/;
const NOT_COMPLETE = /^theme_(?:set|update|get|replace)$/;
/** R13: guides that take a theme of their own (ggplot2 3.5 and later; label.theme and title.theme before). */
const GUIDES = /guide_legend|guide_colourbar|guide_colorbar|guide_coloursteps|guide_colorsteps|guide_bins/;

type Size = { abs: number } | { rel: number } | null;
/** `replaced`: set by `%+replace%`, so a size it leaves out is not the complete theme's (R14). */
interface Spec { size: Size; blank: boolean; user: boolean; replaced?: boolean; span?: [number, number] }

/** Each selector's parent (ggplot2 4.0.3 inheritance). */
const PARENT: Record<string, string | null> = {
  text: null, title: 'text',
  'axis.title': 'title', 'axis.title.x': 'axis.title', 'axis.title.y': 'axis.title',
  'axis.text': 'text', 'axis.text.x': 'axis.text', 'axis.text.y': 'axis.text',
  'axis.text.x.bottom': 'axis.text.x', 'axis.text.y.left': 'axis.text.y',
  'legend.text': 'text', 'legend.title': 'title',
  'strip.text': 'text', 'strip.text.x': 'strip.text', 'strip.text.y': 'strip.text',
  'strip.text.x.top': 'strip.text.x', 'strip.text.y.right': 'strip.text.y',
  'plot.title': 'title', 'plot.caption': 'title',
};
/** The sizes a complete theme gives each selector. */
const THEME_DEFAULT: Record<string, Size> = {
  'axis.text': { rel: 0.8 }, 'legend.text': { rel: 0.8 }, 'strip.text': { rel: 0.8 }, 'plot.title': { rel: 1.2 }, 'plot.caption': { rel: 0.8 },
};
/** The text elements a ggplot2 complete theme blanks (ggplot2 4.0.3, read with calc_element()). */
const THEME_BLANK: Record<string, string[]> = { theme_void: ['axis.title', 'axis.text'] };

/** The selectors each row is drawn with, per facet layout. */
const DRAWN: Record<ElementKey, string[]> = {
  plotTitle: ['plot.title'], axisTitle: ['axis.title.x', 'axis.title.y'], axisText: ['axis.text.x.bottom', 'axis.text.y.left'],
  legendText: ['legend.text'], legendTitle: ['legend.title'], stripText: ['strip.text.x.top'], caption: ['plot.caption'],
};

interface Value { n: number | null; text: string }

/** R13: a size a guide gives its own legend, where it is written (null: no size to edit there). */
export interface GuideSize { key: 'legendText' | 'legendTitle'; pt: number; span: [number, number] | null }

/** One plot's sizes: the plot the script writes, or each plot it combines (R12). */
export interface PlotRead {
  /** The plot's name for a combined plot, else null. */
  name: string | null;
  sizes: Partial<Record<ElementKey, number>>;
  children: Partial<Record<ElementKey, RChild[]>>;
  pinned: Partial<Record<ElementKey, string[]>>;
  slope: Partial<Record<ElementKey, number>>;
  hidden: Partial<Record<ElementKey, boolean>>;
  /** No base_size and no text size in the code: ggplot2's default base is assumed. */
  baseAssumed: boolean;
  base: number;
  baseTheme: string;
  baseUnread: boolean;
  /** A base_size written somewhere this plot does not use. */
  otherBase: boolean;
  unknownTheme: string | null;
  /** Classes a drawn selector of which rests on a complete theme that is not ggplot2's: marked as assumed. */
  themeDependent: Partial<Record<ElementKey, boolean>>;
  guides: GuideSize[];
}

export interface RModel extends Omit<PlotRead, 'name' | 'guides'> {
  src: Source;
  /** Each plot read: one, or one per plot a combined figure combines. */
  reads: PlotRead[];
  /** The one-number advice has a single base_size to name (false: one written where the plot does not use it, or several plots). */
  baseEditable: boolean;
  output: ROutput;
  combined: Combined | null;
  canvas: { w: number; h: number };
  /** Why the canvas is assumed: no ggsave(), or a width or height it cannot read. */
  canvasWhy: 'none' | 'unread' | null;
  warnings: string[];
}

/** R8: `name <- value` / `name = value` at the start of a line, the last before `at`. */
function rNumber(src: Source, name: string, at: number, depth = 0): number | null {
  if (depth > 8) return null;
  const re = new RegExp(`^[ \\t]*${name.replace(/\./g, '\\.')}[ \\t]*(?:<-|=(?!=))[ \\t]*`, 'gm');
  let found: { start: number; at: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src.masked)) !== null && m.index < at) found = { start: m.index + m[0].length, at: m.index };
  if (!found) return null;
  // The value ends at its last character in the masked copy, where a comment
  // after it is blanks (P13B-R2-04: `base_fs <- 22  # base size` kept the
  // comment, read as no number).
  let end = statementEnd(src, found.start);
  while (end > found.start && /\s/.test(src.masked[end - 1]!)) end--;
  const text = src.code.slice(found.start, end).trim();
  return evalNumber(text, (n) => rNumber(src, n, found!.at, depth + 1));
}

function value(src: Source, start: number, end: number): Value {
  const text = src.code.slice(start, end).trim();
  return { n: evalNumber(text, (n) => rNumber(src, n, start)), text };
}

/**
 * Every element_text() call of a source, by where it starts: found once per
 * source (P13B-R1-16: a scan per theme() argument made the reader quadratic,
 * 27 s at 8003 lines).
 */
const ELEMENT_TEXT = new WeakMap<Source, Map<number, Call>>();
function elementTextAt(src: Source, at: number): Call | undefined {
  let byStart = ELEMENT_TEXT.get(src);
  if (!byStart) {
    byStart = new Map(calls(src, /element_text/).map((c) => [c.start, c]));
    ELEMENT_TEXT.set(src, byStart);
  }
  return byStart.get(at);
}

/** An element_text()'s size as written: a number or a name (abs), rel(r), or R10's floor (abs N); its span. */
function textSize(src: Source, et: Call | undefined): { size: Size; span: [number, number] | null } {
  const sz = et?.args.find((x) => x.name === 'size');
  if (!sz) return { size: null, span: null };
  const raw = valueOf(src, sz);
  const span: [number, number] = [sz.start, sz.end];
  // R10: Postr's floor, max(N, calc_element(...)$size): at least N.
  const floor = raw.match(/^max\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*calc_element\s*\(/);
  if (floor) return { size: { abs: Number(floor[1]) }, span };
  const rel = raw.match(/^rel\s*\(\s*(.+)\s*\)$/);
  const n = rel ? evalNumber(rel[1]!, (x) => rNumber(src, x, sz.start)) : value(src, sz.start, sz.end).n;
  return { size: n === null ? null : rel ? { rel: n } : { abs: n }, span };
}

/** R2/R4/R14: the element settings of a theme() or theme_update() call. */
function elements(src: Source, c: Call): Array<{ sel: string; spec: Spec }> {
  const out: Array<{ sel: string; spec: Spec }> = [];
  const replaced = /%\+replace%\s*$/.test(src.masked.slice(Math.max(0, c.start - 40), c.start));
  for (const a of c.args) {
    if (!a.name) continue;
    const sel = a.name;
    const v = src.masked.slice(a.start, a.end);
    if (/^element_blank\s*\(/.test(v)) { out.push({ sel, spec: { size: null, blank: true, user: true } }); continue; }
    if (!/^element_text\s*\(/.test(v)) continue;
    const { size, span } = textSize(src, elementTextAt(src, a.start));
    out.push({ sel, spec: { size, blank: false, user: size !== null, replaced, ...(span ? { span } : {}) } });
  }
  return out;
}

interface Complete { at: number; name: string; base: Value | null }

function completeThemes(src: Source): Complete[] {
  return calls(src, /theme_\w+/).filter((c) => !NOT_COMPLETE.test(c.name)).map((c) => {
    const a = c.args.find((x) => x.name === 'base_size') ?? c.args.filter((x) => x.name === null)[0];
    return { at: c.start, name: c.name, base: a ? value(src, a.start, a.end) : null };
  });
}

/** In-panel text (R9): not theme elements, so not in the table; main's warning, unchanged. */
function inPanelWarnings(src: Source, baseSize: number, warnings: string[]): void {
  const MM_TO_PT = 72.27 / 25.4;
  const DEFAULT_LABEL_MM = baseSize / MM_TO_PT;
  const found: Array<{ fn: string; mm: number; explicit: boolean }> = [];
  const TEXT_GEOMS = ['geom_text', 'geom_label', 'geom_text_repel', 'geom_label_repel'];
  for (const c of calls(src, /geom_text|geom_label|geom_text_repel|geom_label_repel|annotate|stat_summary/)) {
    if (!TEXT_GEOMS.includes(c.name)) {
      const geom = argOf(c, 'geom', 0);
      const g = geom ? stringAt(src, geom.start, geom.end) : null;
      if (g !== 'text' && g !== 'label') continue;
    }
    const sz = c.args.find((a) => a.name === 'size');
    const unit = c.args.find((a) => a.name === 'size.unit');
    const raw = sz ? Number(valueOf(src, sz)) : DEFAULT_LABEL_MM;
    if (!Number.isFinite(raw)) continue;
    const u = unit ? stringAt(src, unit.start, unit.end) : null;
    const mm = !sz || !u ? raw : u === 'pt' ? raw / MM_TO_PT : u === 'cm' ? raw * 10 : u === 'in' ? raw * 25.4 : raw;
    found.push({ fn: c.name, mm, explicit: !!sz });
  }
  if (!found.length) return;
  const worst = found.reduce((a, b) => (b.mm < a.mm ? b : a));
  const pt = Math.round(worst.mm * MM_TO_PT * 10) / 10;
  const how = worst.explicit
    ? `sets in-panel text at size ${Math.round(worst.mm * 100) / 100}`
    : `draws in-panel text at the theme's default size (base_size ${baseSize})`;
  warnings.push(`${worst.fn}() ${how} (${pt}pt — ggplot sizes these in mm). In-panel labels are not theme elements, so they are not in the table below; check them yourself.`);
}

const KNOWN_UNITS = new Set(['in', 'cm', 'mm', 'px']);

function canvasOf(src: Source, out: ROutput, options: ParseOptions, warnings: string[]): Pick<RModel, 'canvas' | 'canvasWhy'> {
  const fallback = { w: options.defaultWidthIn ?? R_DEFAULTS.width, h: options.defaultHeightIn ?? R_DEFAULTS.height };
  const num = (a: Arg | undefined) => (a ? value(src, a.start, a.end).n : null);
  if (out.kind === 'device') {
    // P13B-R3-04: say so, rather than "no ggsave()" over a script that has a device.
    if (!out.plot) warnings.push(`Found ${out.call!.name}() but not the plot it draws (print(p), or the plot on a line of its own) — the edited script saves the plot with ggsave() as poster_figure.png.`);
    const c = deviceCanvas(src, out, num);
    if (c) return { canvas: c, canvasWhy: null };
    warnings.push(`Found ${out.call!.name}() but could not read its width/height — using ${fallback.w.toFixed(1)}"×${fallback.h.toFixed(1)}" instead. Check the call.`);
    return { canvas: fallback, canvasWhy: 'unread' };
  }
  if (out.kind === 'none') {
    warnings.push(options.defaultWidthIn !== undefined
      ? `No ggsave() found — using ${options.defaultSizeLabel ?? DEFAULT_SIZE_LABEL} ${fallback.w.toFixed(1)}"×${fallback.h.toFixed(1)}" as the source canvas.`
      : `No canvas size found — assuming R default ${R_DEFAULTS.width}"×${R_DEFAULTS.height}" (ggsave).`);
    return { canvas: fallback, canvasWhy: 'none' };
  }
  const args = out.args;
  const w = num(args.get('width'));
  const h = num(args.get('height'));
  const unitsArg = args.get('units');
  let units = unitsArg ? stringAt(src, unitsArg.start, unitsArg.end) ?? 'in' : 'in';
  const dpiArg = args.get('dpi');
  const dpiText = dpiArg ? stringAt(src, dpiArg.start, dpiArg.end) : null;
  const dpi = dpiText ? ({ retina: 320, print: 300, screen: 72 } as Record<string, number>)[dpiText] ?? 300 : dpiArg ? value(src, dpiArg.start, dpiArg.end).n ?? 300 : 300;
  const scale = num(args.get('scale')) ?? 1;
  if (w === null || h === null || w <= 0 || h <= 0) {
    warnings.push(`Found ggsave() but could not read its width/height — using ${fallback.w.toFixed(1)}"×${fallback.h.toFixed(1)}" instead. Check the call.`);
    return { canvas: fallback, canvasWhy: 'unread' };
  }
  if (!KNOWN_UNITS.has(units)) {
    warnings.push(`Unrecognised units = "${units}" in ggsave() — treating the canvas as inches.`);
    units = 'in';
  }
  const per = units === 'cm' ? 2.54 : units === 'mm' ? 25.4 : units === 'px' ? dpi : 1;
  return { canvas: { w: (w * scale) / per, h: (h * scale) / per }, canvasWhy: null };
}

/**
 * The model of the last script read: the page reads it, scores it and edits
 * it in one check (rParams, fixRScript), so it is built once.
 */
let memo: { key: string; model: RModel } | null = null;

export function runRModel(code: string, options: ParseOptions = {}): RModel {
  const key = `${JSON.stringify(options)}\u0000${code}`;
  if (memo?.key === key) return memo.model;
  const model = buildRModel(code, options);
  memo = { key, model };
  return model;
}

/** What every plot's reading shares: the script's theme calls up to the end of what it writes. */
interface Ctx {
  src: Source;
  sets: Call[];
  completes: Complete[];
  themeCalls: Call[];
  updates: Call[];
  guides: Call[];
  strips: string[];
  /** R15: each theme call's place across the whole script (for the global theme theme_set() gives). */
  ordAll: Order;
}

/** R15: a theme call's place in the order ggplot2 applies it to the plot read, or null when it does not reach it. */
type Order = (at: number) => number | null;

/** Items in the order ggplot2 applies them, each with its place; those that do not reach the plot left out. */
function ranked<T>(xs: T[], at: (x: T) => number, ord: Order): Array<{ x: T; e: number }> {
  return xs.flatMap((x) => { const e = ord(at(x)); return e === null ? [] : [{ x, e }]; }).sort((a, b) => a.e - b.e);
}

/** R7: facet_wrap draws strips on top; facet_grid on top for its columns and at the side for its rows. */
function stripsOf(src: Source): string[] {
  const grid = calls(src, /facet_grid/)[0];
  if (!grid || calls(src, /facet_wrap/).length) return ['strip.text.x.top'];
  const formula = grid.args[0] && !grid.args[0].name ? valueOf(src, grid.args[0]) : '';
  const [lhs, rhs] = formula.includes('~') ? formula.split('~').map((x) => x.trim()) : ['', ''];
  const rows = !!argOf(grid, 'rows') || (!!lhs && lhs !== '.');
  const cols = !!argOf(grid, 'cols') || (!!rhs && rhs !== '.');
  const strips = [...(cols ? ['strip.text.x.top'] : []), ...(rows ? ['strip.text.y.right'] : [])];
  return strips.length ? strips : ['strip.text.x.top'];
}

/** One plot's sizes, from the theme calls that reach it (`ord`, R15) and the global theme. */
function readPlot(ctx: Ctx, ord: Order, name: string | null): PlotRead {
  const { src, sets } = ctx;
  const mine = (at: number) => ord(at) !== null;
  const inSet = (e: number) => sets.some((c) => e > c.open && e < c.close);
  // Which complete theme the plot uses, and the theme() calls after it, in the order ggplot2 adds them.
  const themeCalls = ranked(ctx.themeCalls, (c) => c.start, ord);
  const plotTheme = ranked(ctx.completes, (t) => t.at, ord).filter((t) => !inSet(t.e)).pop();
  const lastSet = sets[sets.length - 1];
  let complete: Complete | null;
  let mods: Call[];
  if (plotTheme) {
    complete = plotTheme.x;
    mods = themeCalls.filter((c) => !inSet(c.e) && c.e > plotTheme.e).map((c) => c.x);
  } else {
    // The global theme: what theme_set() is given, read across the script (a theme held in a name too, R15).
    const inLast = (e: number) => !!lastSet && e > lastSet.open && e < lastSet.close;
    const set = ranked(ctx.completes, (t) => t.at, ctx.ordAll).filter((t) => inLast(t.e)).pop();
    complete = set?.x ?? null;
    const fromSet = ranked(ctx.themeCalls, (c) => c.start, ctx.ordAll).filter((c) => inLast(c.e) && c.e > (set?.e ?? -1)).map((c) => c.x);
    const afterSet = ctx.updates.filter((c) => !lastSet || c.start > lastSet.close);
    // The global theme first (theme_set's, then each theme_update() in order),
    // then the plot's own theme() calls on top: ggplot2 builds get_theme() +
    // the plot's theme, whatever order they are written in (P13B-R1-04: a
    // theme_update() written after the plot's theme() read as winning).
    mods = [...fromSet, ...afterSet, ...themeCalls.filter((c) => !inSet(c.e)).map((c) => c.x)];
  }
  const unknownTheme = complete && !GG_THEMES.test(complete.name) ? complete.name : null;
  const baseUnread = !!complete?.base && complete.base.n === null;
  const base = complete?.base?.n ?? R_DEFAULTS.baseSize;
  const specs = new Map<string, Spec>();
  for (const c of mods) for (const { sel, spec } of elements(src, c)) {
    const prev = specs.get(sel);
    // R14: `%+replace%` replaces the element whole; `+` merges a size it leaves out from before.
    specs.set(sel, spec.blank || spec.replaced ? spec : { size: spec.size ?? (prev?.blank ? null : prev?.size ?? null), blank: false, user: spec.user || !!prev?.user, ...(prev?.replaced ? { replaced: true } : {}) });
  }
  const textSet = !!specs.get('text')?.size;
  const baseAssumed = !complete?.base && !textSet;
  const otherBase = ctx.completes.some((t) => t !== complete && t.base !== null && (inSet(ctx.ordAll(t.at) ?? -1) || mine(t.at)));

  /**
   * A selector's size and its slope per point of base_size, and whether it is
   * blank. A child the user gave an element_text() of its own is drawn even
   * under a blank parent (ggplot2: its inherit.blank is FALSE); one the
   * complete theme gives follows its parent's blank.
   */
  // `theme`: the size rests on the complete theme's own sizes (its base or one of its rel()s), not only on the user's.
  const themeBlank = new Set(complete ? THEME_BLANK[complete.name] ?? [] : []);
  const resolve = (sel: string): { pt: number; slope: number; blank: boolean; theme: boolean } => {
    const own2 = specs.get(sel);
    const size = own2?.size ?? (own2?.replaced ? null : THEME_DEFAULT[sel] ?? null);
    const fromTheme = !own2?.size && !own2?.replaced && !!THEME_DEFAULT[sel];
    if (sel === 'text') {
      const blank = !!own2?.blank;
      if (size && 'abs' in size) return { pt: size.abs, slope: 0, blank, theme: false };
      if (size && 'rel' in size) return { pt: size.rel * base, slope: size.rel, blank, theme: true };
      return { pt: base, slope: 1, blank, theme: true };
    }
    const up = resolve(PARENT[sel]!);
    const blank = own2 ? own2.blank : themeBlank.has(sel) || up.blank;
    if (size && 'abs' in size) return { pt: size.abs, slope: 0, blank, theme: false };
    if (size && 'rel' in size) return { pt: size.rel * up.pt, slope: size.rel * up.slope, blank, theme: fromTheme || up.theme };
    return { pt: up.pt, slope: up.slope, blank, theme: up.theme };
  };

  // R13: a guide's own legend sizes, on top of the plot's (never reset by a complete theme).
  const guides: GuideSize[] = [];
  for (const g of ctx.guides.filter((x) => mine(x.start))) {
    const add = (key: GuideSize['key'], parent: string, size: Size, span: [number, number] | null) => {
      if (!size) return;
      guides.push({ key, pt: 'abs' in size ? size.abs : size.rel * resolve(parent).pt, span });
    };
    const th = argOf(g, 'theme');
    const call = th && /^theme\s*\(/.test(src.masked.slice(th.start, th.end)) ? calls(src, /theme/).find((c) => c.start === th.start) : undefined;
    for (const { sel, spec } of call ? elements(src, call) : []) {
      if (sel === 'legend.text') add('legendText', 'text', spec.size, spec.span ?? null);
      if (sel === 'legend.title') add('legendTitle', 'title', spec.size, spec.span ?? null);
    }
    for (const [arg, key, parent] of [['label.theme', 'legendText', 'text'], ['title.theme', 'legendTitle', 'title']] as const) {
      const a = argOf(g, arg);
      if (!a || !/^element_text\s*\(/.test(src.masked.slice(a.start, a.end))) continue;
      const { size, span } = textSize(src, elementTextAt(src, a.start));
      add(key, parent, size, span);
    }
  }

  const sizes: PlotRead['sizes'] = {};
  const children: PlotRead['children'] = {};
  const pinned: PlotRead['pinned'] = {};
  const slope: PlotRead['slope'] = {};
  const hidden: PlotRead['hidden'] = {};
  const themeDependent: PlotRead['themeDependent'] = {};
  for (const spec of R_ELEMENTS) {
    const drawn = spec.key === 'stripText' ? ctx.strips : DRAWN[spec.key];
    const got = drawn.map((sel) => ({ sel, ...resolve(sel) })).filter((x) => !x.blank);
    if (!got.length) { hidden[spec.key] = true; continue; }
    const min = got.reduce((a, b) => (b.pt < a.pt ? b : a));
    const guided = guides.filter((x) => x.key === spec.key);
    const gmin = guided.length ? Math.min(...guided.map((x) => x.pt)) : Infinity;
    sizes[spec.key] = Math.min(min.pt, gmin);
    slope[spec.key] = gmin < min.pt ? 0 : min.slope;
    if (unknownTheme && got.some((x) => x.theme)) themeDependent[spec.key] = true;
    // The fix names a child the user sized (or below it), else the child itself.
    const short = (sel: string) => {
      const s = sel.replace(/\.(?:bottom|left|top|right)$/, '');
      return specs.get(sel)?.user ? sel : s;
    };
    children[spec.key] = got.map((x) => ({
      selector: short(x.sel), pt: x.pt, leaf: x.sel, theme: !!unknownTheme && x.theme, unread: baseUnread && x.slope > 0,
    }));
    pinned[spec.key] = got.map((x) => x.sel).filter((sel) => specs.get(sel)?.user || specs.get(sel.replace(/\.(?:bottom|left|top|right)$/, ''))?.user);
  }
  return {
    name, sizes, children, pinned, slope, hidden, baseAssumed, base, baseTheme: complete?.name ?? 'theme_grey', baseUnread,
    otherBase, unknownTheme, themeDependent, guides,
  };
}

/** The rows of a figure that combines plots: each class at the smallest of its plots. */
function mergeReads(reads: PlotRead[]): Omit<PlotRead, 'name' | 'guides'> {
  const first = reads[0]!;
  if (reads.length === 1) return first;
  const out: Omit<PlotRead, 'name' | 'guides'> = {
    ...first, sizes: {}, children: {}, pinned: {}, slope: {}, hidden: {}, themeDependent: {},
    baseAssumed: reads.some((r) => r.baseAssumed), baseUnread: reads.some((r) => r.baseUnread), otherBase: true,
    unknownTheme: reads.find((r) => r.unknownTheme)?.unknownTheme ?? null,
  };
  for (const spec of R_ELEMENTS) {
    const k = spec.key;
    const drawn = reads.filter((r) => !r.hidden[k]);
    if (!drawn.length) { out.hidden[k] = true; continue; }
    const min = drawn.reduce((a, b) => (b.sizes[k]! < a.sizes[k]! ? b : a));
    out.sizes[k] = min.sizes[k];
    out.slope[k] = min.slope[k];
    out.children[k] = drawn.flatMap((r) => r.children[k] ?? []);
    out.pinned[k] = drawn.flatMap((r) => r.pinned[k] ?? []);
    if (drawn.some((r) => r.themeDependent[k])) out.themeDependent[k] = true;
  }
  return out;
}

function buildRModel(code: string, options: ParseOptions): RModel {
  const src = source(code);
  const warnings: string[] = [];
  // What the script writes: its last ggsave(), or a device it prints a plot to.
  // Everything up to its end is read, since its plot argument may add a theme
  // of its own (the fix puts its theme() there).
  const output = outputOf(src);
  const until = output.end;
  const sets = calls(src, /theme_set/).filter((c) => c.start < until);
  // A guide's theme() is the guide's own (R13), not the plot's.
  const guides = calls(src, GUIDES).filter((c) => c.start < until);
  const inGuide = (at: number) => guides.some((g) => at > g.open && at < g.close);
  const completes = completeThemes(src).filter((t) => t.at < until && !inGuide(t.at));
  const themeCalls = calls(src, /theme/).filter((c) => c.start < until && !inGuide(c.start));
  // R15: a theme held in a name (an object, a function, a plot another is built from) applies where the name is used.
  const names = namesOf(src, [...completes.map((t) => t.at), ...themeCalls.map((c) => c.start), ...guides.map((g) => g.start)]);
  const ordAll = themeOrder(names, [[0, until]], [], until);
  const ctx: Ctx = {
    src, sets, guides, strips: stripsOf(src), completes, themeCalls, ordAll,
    updates: calls(src, /theme_update/).filter((c) => c.start < until),
  };
  // R12: a figure that combines plots reads each of them on its own: the
  // theme calls in that plot's own assignments, before it is combined, and
  // those of the names they use (R15, P13B-R3-01: a theme object or a
  // function building the panel was dropped, and base 11 assumed).
  const combined = combinedOf(src, output);
  const reads = combined?.components
    ? combined.components.map((n) => {
      const spans = assignmentsOf(src, n, combined.stmt).map(([s, , e]) => [s, e] as [number, number]);
      return readPlot(ctx, themeOrder(names, spans, spans, combined.stmt), n);
    })
    : [readPlot(ctx, ordAll, null)];
  const merged = mergeReads(reads);

  if (merged.baseAssumed) warnings.push(`No base_size found — assuming ggplot2 default base_size = ${R_DEFAULTS.baseSize}pt.`);
  else if (merged.baseUnread) warnings.push(`base_size is set from a variable, not a number — scoring against the ggplot2 default ${R_DEFAULTS.baseSize}pt instead. Put the real value in to check it.`);
  if (merged.unknownTheme) warnings.push(`${merged.unknownTheme}() is not one of ggplot2's themes — its sizes are assumed to follow ggplot2's.`);
  inPanelWarnings(src, merged.base, warnings);
  const cv = canvasOf(src, output, options, warnings);
  if (combined && !combined.components) {
    warnings.push(`${combined.fn}() combines plots the check cannot find by name — the sizes below are read from the whole script and marked *, and the edited script does not set them: give each plot a name (p1 <- ggplot(...)) and combine the names.`);
  }
  return {
    ...merged, src, reads, output, combined,
    // No single base_size to name: one from a variable, one where the plot does not use it, a theme that is not ggplot2's, or several plots.
    baseEditable: !merged.baseUnread && !(merged.baseAssumed && merged.otherBase) && !merged.unknownTheme && !combined,
    ...cv, warnings,
  };
}

/** The FigureParams the scorer takes, from the R model. */
export function rParams(code: string, options: ParseOptions = {}): FigureParams {
  const m = runRModel(code, options);
  const assumed: FigureParams['assumed'] = {};
  const unread: FigureParams['unread'] = {};
  const kept: FigureParams['assumedKept'] = {};
  const overrides: FigureParams['overrides'] = {};
  const declined = !!m.combined && !m.combined.components;
  for (const spec of R_ELEMENTS) {
    if (m.hidden[spec.key]) continue;
    if ((m.slope[spec.key]! > 0 && (m.baseAssumed || m.baseUnread)) || m.themeDependent[spec.key]) assumed[spec.key] = true;
    // Review round 3: a size resting on a theme that is not ggplot2's is set in the code, in a
    // way the check cannot read, like a base_size from a variable; the fix floors both (R10).
    if ((m.slope[spec.key]! > 0 && m.baseUnread) || m.themeDependent[spec.key]) unread[spec.key] = true;
    // R12: plots the check cannot name: every row marked, and the script sets none of them.
    if (declined) { assumed[spec.key] = true; kept[spec.key] = true; }
    if (m.slope[spec.key] === 0) overrides[spec.key] = m.sizes[spec.key]!;
  }
  // Recorded for reporting only (main's reading): never applied to the scale.
  const fwrap = m.src.masked.match(/facet_wrap\s*\([^)]*nrow\s*=\s*(\d+)/);
  const fwrapCols = m.src.masked.match(/facet_wrap\s*\([^)]*ncol\s*=\s*(\d+)/);
  return {
    language: 'r',
    baseSize: m.base,
    canvasWidth: m.canvas.w,
    canvasHeight: m.canvas.h,
    effectiveCanvasWidth: m.canvas.w,
    effectiveCanvasHeight: m.canvas.h,
    overrides,
    overrideCoversAll: Object.fromEntries(Object.keys(overrides).map((k) => [k, true])),
    // The snippet's bare parent reaches the children only when none is sized on its own.
    overrideViaBareSelector: Object.fromEntries(R_ELEMENTS.map((e) => [e.key, !(m.pinned[e.key] ?? []).length])),
    sizes: m.sizes,
    assumed,
    assumedKept: kept,
    unread,
    canvasAssumed: m.canvasWhy !== null,
    scaleUnknown: m.canvasWhy === 'unread',
    hidden: m.hidden,
    baseSlope: m.slope,
    ownBase: m.baseEditable ? m.base : null,
    baseTheme: m.baseTheme,
    rChildren: m.children,
    facetRows: fwrap ? parseInt(fwrap[1]!, 10) : 1,
    facetCols: fwrapCols ? parseInt(fwrapCols[1]!, 10) : 1,
    warnings: m.warnings,
  };
}
