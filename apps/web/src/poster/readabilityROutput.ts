/**
 * What an R script writes, for the plot checker's R rule table (fix 13b,
 * review round 2; readabilityRModel.ts holds the table): the canvas and the
 * plot it draws there, and whether that plot combines other plots.
 *
 * | rule | idiom | gives | notes |
 * |------|-------|-------|-------|
 * | R5   | ggsave(filename, plot, device, path, scale, width, height, units, dpi) | the canvas and the plot saved (last_plot() without one) | the last ggsave(); arguments matched as R matches them |
 * | R11  | png / jpeg / tiff / bmp(filename, width, height, units, ..., res), ragg's agg_png / agg_jpeg / agg_tiff (review round 3), pdf / svg / cairo_pdf(file, width, height), then before its dev.off() print(p) or (review round 3) a statement R prints: a name, a name and operators, a ggplot() chain, a call that combines plots | the canvas and the plot drawn | with no ggsave() (P13B-R2-09: the fix wrote poster_figure.png and left the user's own file unfixed; P13B-R3-04: so it did for `p` on its own line); a device whose plot is not found is said |
 * | R12  | a plot made by plot_grid, ggdraw (with draw_plot), ggarrange, arrangeGrob, grid.arrange (matched by its full name since review round 3), marrangeGrob, wrap_plots, or patchwork's `|` `/` `+` on plot names | the plots it combines, by name, and where it first combines them | P13B-R2-01: a theme added to the combined object is NULL (gridExtra) or themes cowplot's canvas, never the plots: the fix themes each plot before it is combined; a plot the check cannot name is declined |
 *
 * R statements continue over a line that ends in an operator or a comma
 * (`p <- ggplot(d) +` then the next line), which `statementEnd` (a newline
 * outside brackets) does not know: `rStatementEnd` and `rStatementStart`
 * follow them.
 */
import { argOf, calls, matchR, statementEnd, statementStart, stringAt, valueOf, type Arg, type Call, type Source } from './readabilityCalls';

/** ggsave()'s formals before its `...` (ggplot2 4.0.3), for matchR(). */
export const GGSAVE_FORMALS = ['filename', 'plot', 'device', 'path', 'scale', 'width', 'height', 'units', 'dpi', 'limitsize', 'bg', 'create.dir'] as const;

/** R 4.x graphics devices: their formals before `...`, and whether width and height are pixels by default. */
const DEVICES: Record<string, { formals: readonly string[]; px: boolean }> = {
  png: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'bg', 'res'], px: true },
  bmp: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'bg', 'res'], px: true },
  jpeg: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'quality', 'bg', 'res'], px: true },
  tiff: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'compression', 'bg', 'res'], px: true },
  pdf: { formals: ['file', 'width', 'height', 'onefile', 'family', 'title', 'fonts', 'version', 'paper'], px: false },
  svg: { formals: ['filename', 'width', 'height', 'pointsize', 'onefile', 'family', 'bg'], px: false },
  cairo_pdf: { formals: ['filename', 'width', 'height', 'pointsize', 'onefile', 'family', 'bg'], px: false },
  // ragg 1.x (review round 3, P13B-R3-04): pixels at res = 72 by default, as png().
  agg_png: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'background', 'res', 'scaling', 'snap_rect', 'bitsize', 'bg'], px: true },
  agg_jpeg: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'background', 'res', 'scaling', 'snap_rect', 'quality', 'smoothing', 'method', 'bg'], px: true },
  agg_tiff: { formals: ['filename', 'width', 'height', 'units', 'pointsize', 'background', 'res', 'scaling', 'snap_rect', 'compression', 'bitsize', 'bg'], px: true },
};

const CONTINUES = /(?:[-+*/^|&,=~<>(]|%[^%\n]*%)[ \t]*$/;

/** End of the R statement holding `at`: past every line that ends in an operator or a comma. */
export function rStatementEnd(src: Source, at: number): number {
  let i = at;
  for (;;) {
    const end = statementEnd(src, i);
    if (end >= src.masked.length) return end;
    const line = src.masked.slice(src.masked.lastIndexOf('\n', end - 1) + 1, end);
    if (!CONTINUES.test(line)) return end;
    i = end + 1;
  }
}

/** Start of the line on which the R statement holding `at` begins. */
export function rStatementStart(src: Source, at: number): number {
  let start = statementStart(src, at);
  while (start > 0) {
    const prev = src.masked.slice(src.masked.lastIndexOf('\n', start - 2) + 1, start - 1);
    if (!CONTINUES.test(prev)) break;
    start = statementStart(src, start - 1);
  }
  return start;
}

/** Every top-level `name <- value` / `name = value` statement before `before`: [start, value start, end]. */
export function assignmentsOf(src: Source, name: string, before: number): Array<[number, number, number]> {
  const re = new RegExp(`^[ \\t]*${name.replace(/\./g, '\\.')}[ \\t]*(?:<-|=(?!=))[ \\t]*`, 'gm');
  const out: Array<[number, number, number]> = [];
  for (let m = re.exec(src.masked); m && m.index < before; m = re.exec(src.masked)) {
    if (src.depth[m.index] !== 0) continue;
    out.push([m.index, m.index + m[0].length, rStatementEnd(src, m.index)]);
  }
  return out;
}

export interface ROutput {
  kind: 'ggsave' | 'device' | 'none';
  /** The ggsave() or the device call. */
  call: Call | null;
  /** Its arguments, matched to its formals as R matches them. */
  args: Map<string, Arg>;
  /**
   * The plot argument: ggsave()'s plot, what print() is given, or the plot a
   * device draws on a line of its own; null for ggsave()'s last_plot(), and
   * for a device whose plot the check cannot find.
   */
  plot: Arg | null;
  /** The plot is a statement of its own, which R prints when it runs the script (autoprint). */
  bare: boolean;
  /** The start of the statement that saves or draws the plot. */
  stmt: number;
  /** The end of the call whose plot argument may add a theme: the reader reads every theme up to it. */
  end: number;
  /** A device's own default canvas unit: pixels (png and kin) or inches. */
  px: boolean;
}

const END = Number.MAX_SAFE_INTEGER;

/**
 * A statement R prints when it runs a script, drawing it on the open device:
 * a name (`p`), a name and operators (`p + theme(...)`, `p1 | p2`), a
 * ggplot() chain, or a call that combines plots (grid.arrange draws its own).
 */
const DRAWS = /^(?:[A-Za-z.][\w.]*(?![\w.(])\s*(?:[+|/][\s\S]*)?|ggplot\s*\([\s\S]*|(?:grid\.arrange|plot_grid|ggarrange|wrap_plots|ggdraw|marrangeGrob)\s*\([\s\S]*)$/;

/**
 * R11: what a device draws before its dev.off(): the last print(x), or the
 * last statement of its own that R prints (P13B-R3-04: `png(...); p;
 * dev.off()`, a ggplot() chain or grid.arrange() was not read, and the fix
 * saved another file, leaving the user's unfixed).
 */
function drawnOn(src: Source, d: Call): Pick<ROutput, 'plot' | 'bare' | 'stmt' | 'end'> | null {
  const off = /\bdev\.off\s*\(/g;
  off.lastIndex = d.close;
  const stop = off.exec(src.masked)?.index ?? src.masked.length;
  const p = calls(src, /print/).filter((c) => c.start > d.close && c.start < stop && !c.receiver && c.args[0] && !c.args[0].name).pop();
  let best: Pick<ROutput, 'plot' | 'bare' | 'stmt' | 'end'> | null = p ? { plot: p.args[0]!, bare: false, stmt: rStatementStart(src, p.start), end: p.close } : null;
  for (let at = rStatementEnd(src, d.start) + 1; at < stop;) {
    const end = Math.min(rStatementEnd(src, at), stop);
    const text = src.masked.slice(at, end);
    const s = at + text.length - text.trimStart().length;
    const body = text.trim();
    if (body && src.depth[s] === 0 && DRAWS.test(body) && (!best || s > best.stmt)) {
      const e = s + body.length;
      best = { plot: { name: null, start: s, end: e, argStart: s, argEnd: e }, bare: true, stmt: s, end: e };
    }
    at = end + 1;
  }
  return best;
}

/** R5, R11: the last ggsave(); with none, the last device, and the plot it draws. */
export function outputOf(src: Source): ROutput {
  const g = calls(src, /ggsave/).pop();
  if (g) {
    const args = matchR(g, GGSAVE_FORMALS);
    return { kind: 'ggsave', call: g, args, plot: args.get('plot') ?? null, bare: false, stmt: g.start, end: g.close, px: false };
  }
  const d = calls(src, new RegExp(Object.keys(DEVICES).join('|'))).filter((c) => !c.receiver).pop();
  if (d) {
    const spec = DEVICES[d.name]!;
    const drawn = drawnOn(src, d) ?? { plot: null, bare: false, stmt: rStatementStart(src, d.start), end: END };
    return { kind: 'device', call: d, args: matchR(d, spec.formals), ...drawn, px: spec.px };
  }
  return { kind: 'none', call: null, args: new Map(), plot: null, bare: false, stmt: END, end: END, px: false };
}

/** R12: functions that combine plots into one figure, by their full name. */
const COMBINERS = /^(?:plot_grid|ggdraw|ggarrange|arrangeGrob|grid\.arrange|marrangeGrob|wrap_plots)$/;
/**
 * `grid.arrange(` is found as `arrange` called on `grid` (the scanner reads a
 * dotted name as a method call): R12 never read it until review round 3
 * (P13B-R3-04), so it is matched by its full name.
 */
const fullName = (c: Call) => (c.receiver ? `${c.receiver}.${c.name}` : c.name);

export interface Combined {
  fn: string;
  /** The plots it combines, by name; null when one is not a name the check can find (a plot made inside the call). */
  components: string[] | null;
  /** Where settings for each plot go: the start of the first statement that combines them. */
  stmt: number;
}

/** The names of the plots a combining call and the statement it heads take (positional, plotlist =, grobs =, draw_plot()). */
function componentsOf(src: Source, value: [number, number], head: Call): string[] | null {
  const out: string[] = [];
  const bare = (a: Arg) => /^[A-Za-z.][\w.]*$/.test(valueOf(src, a).trim());
  const list = (a: Arg | undefined): boolean => {
    if (!a) return true;
    const inner = calls(src, /list/).find((c) => c.start === a.start);
    if (!inner || !inner.args.every((x) => !x.name && bare(x))) return false;
    out.push(...inner.args.map((x) => valueOf(src, x).trim()));
    return true;
  };
  const positional = head.args.filter((a) => a.name === null && !a.star);
  for (const a of positional) {
    if (!bare(a)) return null;
    out.push(valueOf(src, a).trim());
  }
  if (!list(argOf(head, 'plotlist')) || !list(argOf(head, 'grobs'))) return null;
  for (const dp of calls(src, /draw_plot|draw_grob/).filter((c) => c.start > value[0] && c.start < value[1])) {
    const a = argOf(dp, 'plot', 0);
    if (!a || !bare(a)) return null;
    out.push(valueOf(src, a).trim());
  }
  return out.length ? [...new Set(out)] : null;
}

/**
 * R12: the plot the script writes, when it combines other plots. Each
 * combined plot that is itself a combination is followed down (two levels
 * of plot_grid), so settings go before the first one.
 */
export function combinedOf(src: Source, out: ROutput): Combined | null {
  if (out.kind === 'none' || !out.plot) return null;
  const patchwork = /^[ \t]*(?:library|require)\s*\(\s*patchwork\s*\)/m.test(src.masked);
  const expand = (start: number, end: number, stmt: number, depth: number): Combined | null => {
    const text = src.masked.slice(start, end).trim();
    const lead = text.length ? src.masked.indexOf(text[0]!, start) : start;
    const head = calls(src, /plot_grid|ggdraw|ggarrange|arrangeGrob|arrange|marrangeGrob|wrap_plots/).find((c) => c.start === lead && COMBINERS.test(fullName(c)));
    let fn: string;
    let names: string[] | null;
    if (head) {
      fn = fullName(head);
      names = componentsOf(src, [start, end], head);
    } else if (patchwork && /^[\s()]*[A-Za-z.][\w.]*(?:[\s()]*[|/+][\s()]*[A-Za-z.][\w.]*)+[\s()]*$/.test(text)) {
      fn = 'patchwork';
      names = text.match(/[A-Za-z.][\w.]*/g) ?? null;
    } else if (/^[A-Za-z.][\w.]*$/.test(text) && depth < 3) {
      // A name: what it was last assigned.
      const a = assignmentsOf(src, text, start).pop();
      return a ? expand(a[1], a[2], a[0], depth + 1) : null;
    } else return null;
    if (!names) return { fn, components: null, stmt };
    // A combined plot that combines others: its plots, set before it is made.
    const leaves: string[] = [];
    let first = stmt;
    for (const n of names) {
      const a = assignmentsOf(src, n, stmt).pop();
      if (!a) return { fn, components: null, stmt };
      const inner = depth < 3 ? expand(a[1], a[2], a[0], depth + 1) : null;
      if (inner && !inner.components) return { fn, components: null, stmt };
      if (inner) { leaves.push(...inner.components!); first = Math.min(first, inner.stmt); } else leaves.push(n);
    }
    return { fn, components: [...new Set(leaves)], stmt: first };
  };
  return expand(out.plot.start, out.plot.end, rStatementStart(src, out.stmt), 0);
}

/** R11: a device's canvas in inches, or null when its width or height cannot be read. */
export function deviceCanvas(src: Source, out: ROutput, num: (a: Arg | undefined) => number | null): { w: number; h: number } | null {
  const w = out.args.get('width');
  const h = out.args.get('height');
  const unitsArg = out.args.get('units');
  const units = out.px ? (unitsArg ? stringAt(src, unitsArg.start, unitsArg.end) : 'px') : 'in';
  const res = out.args.get('res');
  const ppi = res ? num(res) : 72;
  const wn = w ? num(w) : out.px ? 480 : 7;
  const hn = h ? num(h) : out.px ? 480 : 7;
  if (wn === null || hn === null || wn <= 0 || hn <= 0 || ppi === null || ppi <= 0) return null;
  const per = units === 'in' ? 1 : units === 'cm' ? 2.54 : units === 'mm' ? 25.4 : units === 'px' ? ppi : null;
  return per === null ? null : { w: wn / per, h: hn / per };
}
