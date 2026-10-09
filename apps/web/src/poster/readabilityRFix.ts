/**
 * The R script the plot checker hands back (fix 13b, the owner's design):
 * the user's own script with one final `+ theme(...)` after every theme of
 * theirs, and a ggsave() with the size the check scored, which the page asks
 * them to use in place of theirs.
 *
 * The theme() goes into the plot the script writes: `ggsave("f.png", p, ...)`
 * becomes `ggsave("f.png", p +\n  theme(...), ...)`, and a device's
 * `print(p)` becomes `print(p +\n  theme(...))` (review round 2, P13B-R2-09:
 * a ggsave() of its own wrote another file and left the user's unfixed), and
 * so does a plot the device draws on a line of its own, `p` or a ggplot()
 * chain, which R prints only when it runs the script with Rscript (review
 * round 3, P13B-R3-04). A device whose plot the check cannot find gets a
 * ggsave() of poster_figure.png, which the page names.
 * That is after every theme of the user's, whatever order they are written
 * in, so ggplot2 applies it last; it is never inside a string (the call is
 * found in code with strings blanked) and never on theme_update(), whose
 * value is discarded. A ggsave() with no plot argument saves last_plot(),
 * which the fix names.
 *
 * A figure that combines plots (plot_grid, arrangeGrob, ...; R12) is themed
 * in each plot it combines, `p1 <- p1 + theme(...)` before the plots are
 * combined: a theme added to the combined object is NULL for a gtable, so
 * ggsave() wrote a blank image, or themes cowplot's canvas and leaves the
 * plots' text as it was (P13B-R2-01). Plots the check cannot name are not
 * themed (their rows stay marked).
 *
 * It names only the elements below their minimum, each at the size it needs
 * (so never below what ggplot2 draws now): a per-axis child (axis.text.x)
 * when the user sized one or only one axis falls short, the parent
 * (axis.text) when every axis does and none is sized on its own. When the
 * code sets no base_size, the root text size the check assumed is set too,
 * unless the complete theme is not ggplot2's: its base is unknown, and
 * ggplot2's 11 would lower what it draws (P13B-R1-05). A size resting on a
 * theme that is not ggplot2's or on a base_size the check cannot read gets
 * the R10 floor (P13B-R2-03). A size a guide gives its own legend (R13) is
 * raised where it is written: a plot-level theme() does not reach it.
 * The plot argument is found as R matches ggsave()'s arguments (P13B-R1-07:
 * with the filename named, `p` was missed and the fix bound it to device).
 */
import { indentAt } from './readabilityCalls';
import { runRModel, type PlotRead } from './readabilityRModel';
import { R_ELEMENTS, type ElementKey, type ParseOptions } from './readabilityTypes';

export interface RNeed { key: ElementKey; neededPt: number }

const num = (n: number) => String(Math.round(n * 100) / 100);
const PER_AXIS = new Set<ElementKey>(['axisTitle', 'axisText', 'stripText']);
const MARK = '# Postr: text sizes for this print size, in each plot the figure combines';

/**
 * The theme() arguments for one plot: every element below its minimum, at
 * the size it needs. A drawn selector whose size rests on a complete theme
 * that is not ggplot2's, or on a base_size the check cannot read, is set, by
 * its own name, to the larger of that size and the one ggplot2 draws, read at
 * run time (R10; ggplot2's complete_theme() and calc_element()): the check
 * cannot know it, and a constant could lower it (P13B-R1-05: theme_cowplot()
 * draws 14, not 11; P13B-R2-03: base_size = cfg$base drew 20). Every such
 * selector is floored, short or not at the size the check assumed (review
 * round 3, P13B-R3-03: base_size = cfg$base drew 7, the plot title passed at
 * the assumed 13.2 and was left, and the re-check showed ✓ over 11.76 pt).
 */
function themeArgs(r: PlotRead, plot: string, needs: RNeed[], floors: RNeed[]): string[] {
  const args: string[] = [];
  if (r.baseAssumed && !r.unknownTheme) args.push(`text = element_text(size = ${num(r.base)})`);
  for (const spec of R_ELEMENTS) {
    if (r.hidden[spec.key] || !spec.selector) continue;
    const need = needs.find((n) => n.key === spec.key);
    const all = r.children[spec.key] ?? [];
    const floored = (c: (typeof all)[number]) => !!(c.theme || c.unread);
    const at = need ?? floors.find((n) => n.key === spec.key);
    for (const c of at ? all.filter((x) => floored(x) && x.leaf) : []) {
      args.push(`${c.leaf} = element_text(size = max(${num(at!.neededPt)}, calc_element("${c.leaf}", complete_theme(${plot}$theme))$size))`);
    }
    if (!need) continue;
    const short = all.filter((c) => c.pt < need.neededPt - 1e-9);
    const children = all.filter((c) => !floored(c));
    const failing = short.filter((c) => !floored(c));
    if (!failing.length) continue;
    const bare = !PER_AXIS.has(spec.key) || (failing.length === children.length && !(r.pinned[spec.key] ?? []).length);
    const selectors = bare ? [spec.selector] : [...new Set(failing.map((c) => c.selector))];
    for (const sel of selectors) args.push(`${sel} = element_text(size = ${num(need.neededPt)})`);
  }
  return args;
}

/**
 * `p` stays `p`; an expression is bracketed, `p + q` becoming `(p + q)`, so
 * `+ theme()` adds to the whole of it. A combined figure never gets here: its
 * plots are themed one by one (R12).
 */
function wrap(expr: string): string {
  const t = expr.trim();
  return /^[A-Za-z_.][\w.]*$/.test(t) || /^[A-Za-z_.][\w.]*\s*\((?:[^()]|\([^()]*\))*\)$/s.test(t) ? t : `(${t})`;
}

interface Edit { at: number; end: number; text: string }

const themeText = (args: string[], i = '') => `theme(\n${i}  ${args.join(`,\n${i}  `)}\n${i})`;

export function fixRScript(code: string, needs: RNeed[], options: ParseOptions, floors: RNeed[] = needs): string {
  const m = runRModel(code, options);
  const W = num(m.canvas.w);
  const H = num(m.canvas.h);
  const out = m.output;
  const edits: Edit[] = [];
  // R13: a guide's own legend sizes, raised where they are written.
  for (const r of m.reads) {
    for (const g of r.guides) {
      const need = needs.find((n) => n.key === g.key);
      if (need && g.span && g.pt < need.neededPt - 1e-9) edits.push({ at: g.span[0], end: g.span[1], text: num(need.neededPt) });
    }
  }
  if (m.combined) {
    // R12: each plot it combines, before it is combined; none for plots the check cannot name.
    if (m.combined.components) {
      const i = indentAt(code, m.combined.stmt);
      const blocks = m.reads.map((r) => {
        const args = themeArgs(r, r.name!, needs, floors);
        return args.length ? `${i}${r.name} <- ${r.name} +\n${i}  ${themeText(args, i)}\n` : '';
      }).join('');
      if (blocks) edits.push({ at: m.combined.stmt, end: m.combined.stmt, text: `${i}${MARK}\n${blocks}` });
    }
  } else if (out.kind === 'ggsave' || out.plot) {
    const plotText = out.plot ? code.slice(out.plot.start, out.plot.end).trim() : 'last_plot()';
    const args = themeArgs(m.reads[0]!, /^[A-Za-z_.][\w.]*$|^last_plot\(\)$/.test(plotText) ? plotText : `(${plotText})`, needs, floors);
    if (args.length) {
      const theme = themeText(args);
      const themed = out.plot ? `${wrap(code.slice(out.plot.start, out.plot.end))} +\n  ${theme}` : '';
      // A plot drawn on a line of its own is printed: R prints it under Rscript, not under source() (P13B-R3-04).
      if (out.plot) edits.push({ at: out.plot.start, end: out.plot.end, text: out.bare ? `print(${themed})` : themed });
      else {
        const g = out.call!;
        const first = g.args[0];
        const at = first ? first.argEnd : g.open + 1;
        edits.push({ at, end: at, text: `${first ? ', ' : ''}plot = last_plot() +\n  ${theme}` });
      }
    }
  }
  if (m.canvasWhy === 'unread' && out.call) {
    const g = out.call;
    // Arguments the call lacks are appended together, in this order, before its bracket.
    let tail = '';
    const set = (name: string, value: string) => {
      const a = out.args.get(name);
      if (a) edits.push({ at: a.start, end: a.end, text: value });
      else tail += `, ${name} = ${value}`;
    };
    set('width', W);
    set('height', H);
    // pdf(), svg() and cairo_pdf() take inches and no units; png() and its kin take units, and a resolution with them.
    const units = out.args.get('units');
    if (units || (out.kind === 'device' && out.px)) set('units', '"in"');
    if (out.kind === 'device' && out.px && !out.args.get('res')) set('res', '300');
    if (tail) edits.push({ at: g.close, end: g.close, text: tail });
    const scale = out.args.get('scale');
    if (scale) edits.push({ at: scale.start, end: scale.end, text: '1' });
  }
  edits.sort((a, b) => b.at - a.at);
  let result = code;
  for (const e of edits) result = result.slice(0, e.at) + e.text + result.slice(e.end);
  if (out.kind === 'ggsave' || out.plot || m.combined) return result;
  // No ggsave() and no plot drawn to a device (none, or one whose plot the check cannot find):
  // one is added at the size checked, saving poster_figure.png.
  const args = themeArgs(m.reads[0]!, 'last_plot()', needs, floors);
  const plot = args.length ? `last_plot() +\n  ${themeText(args)}` : 'last_plot()';
  return `${result.trimEnd()}\n\nggsave("poster_figure.png", plot = ${plot}, width = ${W}, height = ${H}, dpi = 300)\n`;
}
