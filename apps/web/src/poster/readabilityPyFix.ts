/**
 * The Python script the plot checker hands back (fix 13b, the owner's
 * design): the user's own script with plain edits, which the page asks them
 * to use in place of theirs.
 * - A size the code writes and that decides a text below its minimum is
 *   replaced where it is written (fontsize=8 → fontsize=18, an rcParams
 *   value, a size in a dict, a name at the call that uses it).
 * - A size the code does not set (matplotlib's default, a seaborn context,
 *   a style sheet) is set explicitly: one `rcParams.update({...})` before
 *   the figure is made (after the last reset that would undo it), so the
 *   script's own layout calls lay out the bigger text; a caption gets its
 *   own fontsize=. Rows the check assumed are set at the size it assumed,
 *   so the result is the one checked whatever the user's defaults.
 * - The canvas is fixed: a figure size the code leaves out is set, one it
 *   writes in a way the check cannot read is replaced, a seaborn grid is
 *   set to the print size before the save (also before the save a script
 *   that only shows it gets, P13B-R1-03), so the scale the check computed
 *   is the scale that prints. A script with no save gets one, before its
 *   first show().
 * - A save cropped with bbox_inches="tight" keeps everything it kept: the
 *   legends, annotations and suptitles a script draws outside its plots
 *   stay in the image (P13B-R1-01: removing the crop cut them out, 16 of 16
 *   runs). The fit block before it sizes the figure so they fit the canvas
 *   checked and the save writes that box, `bbox_inches=poster_box` (P19
 *   reads both back).
 * No value is ever made smaller than the size the table shows: each written
 * value is the larger of the size needed and the size every text it decides
 * is drawn at now. A size the check cannot read and must not overwrite (a
 * FontProperties, a ** it cannot resolve) is left as written. A size the code
 * writes as an expression the check cannot evaluate (a config value) gets
 * Postr's floor (P21) where it is written, whether or not it falls short at
 * the size the check assumed (review round 3, P13B-R3-03: one left as written
 * there printed short under a ✓), at the size needed:
 * `max(N, FontProperties(size=EXPR).get_size_in_points())`, or
 * `max(N, float(EXPR))` for font.size (matplotlib takes a string there and
 * converts it; P13B-R3-02), read when the script runs: never below what the
 * code sets (review round 2, P13B-R2-03: pinning it at the default the check
 * assumed lowered it). FontProperties is imported by its own name, after
 * any `from __future__` import (P13B-R3-02).
 * Part 1's runtime helper (_postr_raise_text, which raised text at save) is
 * no longer written. Two blocks run code because no plain edit can know
 * what they need before the figure is drawn: the seaborn grid's re-layout
 * (the legend's width) and the fit block (the extent of what the crop
 * keeps).
 */
import { argOf, calls, indentAt, statementEnd, statementStart, stringAt, type Call, type Source } from './readabilityCalls';
import { runPythonModel, type Instance, type PyModel, type Winner } from './readabilityPyModel';
import type { PyScan, RcKey, SaveInfo, Span } from './readabilityPyRules';
import type { ElementKey, ParseOptions } from './readabilityTypes';

interface Edit { at: number; end: number; text: string }

/** "18", "14.4" — never "14.400000000000002". */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

const MARK = '# Postr: text sizes and canvas for this print size';

/** The first line start after the statement that ends at `end` (a newline). */
function lineAfter(code: string, end: number): number {
  return end >= code.length ? code.length : end + 1;
}

/**
 * The first line at or after `line` where a statement at indent `indent` or
 * less may go: never inside a deeper block (a setting made only when an if
 * runs), never before the `else:`, `elif`, `except` or `finally` that
 * continues the statement before it (P13B-R1-10: a block inserted at an
 * `else:` made the script a SyntaxError), never on a blank or comment line
 * inside a block.
 */
function safeLine(src: Source, line: number, indent: number): number {
  const code = src.code;
  let at = line;
  while (at < code.length) {
    const nl = code.indexOf('\n', at);
    const end = nl < 0 ? code.length : nl;
    const text = code.slice(at, end);
    const body = src.masked.slice(at, end).trim();
    const own = /^[ \t]*/.exec(text)![0].length;
    if (body && own <= indent && !/^(?:else|elif|except|finally)\b/.test(body)) return at;
    if (nl < 0) return code.length;
    at = statementEnd(src, at) + 1;
  }
  return code.length;
}

const PYPLOT = /^(?:plt|pyplot|pylab|matplotlib\.pyplot)?$/;

/** The line that imports pyplot as plt, when the script has no pyplot alias of its own. */
const pltImport = (scan: PyScan, indent: string) => (scan.pyplot ? '' : `${indent}import matplotlib.pyplot as plt\n`);

/** The seaborn grid at the print size, laid out again with room for its legend outside the plots. */
function gridBlock(m: PyModel, i: string, W: string, H: string): string {
  const target = m.gridName ? `${m.gridName}.figure` : `${m.scan.pyplot ?? 'plt'}.gcf()`;
  return [
    `${i}# Postr: the figure at the print size, laid out again with room for a legend outside the plots`,
    `${i}poster_fig = ${target}`,
    `${i}poster_fig.set_size_inches(${W}, ${H})`,
    `${i}legend_in = max((lg.get_window_extent().width for lg in poster_fig.legends), default=0) / poster_fig.dpi`,
    `${i}poster_fig.tight_layout(rect=(0, 0, 1 - (legend_in + 0.1) / ${W}, 1))`,
    '',
  ].join('\n');
}

/**
 * The fit block (P13B-R1-01): the figure resized until what it draws, with
 * the pad, fits W × H in (measured as savefig measures a tight crop: the
 * figure's tight bounding box at the save's dpi), then `poster_box`, a
 * W × H box centred on it, which the save writes instead of the tight crop:
 * the image is the canvas checked to the pixel (a crop alone stopped 0.03 in
 * short where tick labels change with the width) and nothing drawn outside
 * the plots is cut. Only the figure's size changes; text keeps its size in
 * points. The figure never goes below a tenth of the canvas: text outside
 * the plots wider than the canvas at the sizes needed cannot fit, and is
 * cut at both sides (record 13b section 10: three scripts at 4 × 3 in).
 * `save` is null for the save the fix adds itself.
 */
function fitBlock(m: PyModel, info: SaveInfo | null, i: string, W: string, H: string): string {
  const { scan } = m;
  const save = info?.call ?? null;
  const plt = scan.pyplot ?? 'plt';
  const rc = scan.rcParamsName ?? 'plt.rcParams';
  const r = save?.receiver ?? '';
  const grid = save && !PYPLOT.test(r) && scan.creations.some((c) => c.kind === 'grid' && c.names.includes(r));
  // PdfPages' pdf.savefig(fig) writes fig (P13B-R2-05: `poster_fig = pdf` raised AttributeError).
  const fig = info?.figExpr ?? (!save || PYPLOT.test(r) ? `${plt}.gcf()` : grid ? `${r}.figure` : r);
  // The save's own dpi (text extents differ by a few hundredths of an inch between 100 and 300 dpi).
  const dpi = save ? argOf(save, 'dpi') : null;
  const dpiExpr = !save ? '300' : dpi && stringAt(scan.src, dpi.start, dpi.end) === null ? scan.src.code.slice(dpi.start, dpi.end)
    : `poster_dpi if ${rc}['savefig.dpi'] == 'figure' else ${rc}['savefig.dpi']`;
  const pad = save ? argOf(save, 'pad_inches') : null;
  const padExpr = pad && stringAt(scan.src, pad.start, pad.end) === null ? scan.src.code.slice(pad.start, pad.end) : `${rc}['savefig.pad_inches']`;
  // The fix's own added save comes with the import already (pltImport).
  const usesPlt = !scan.pyplot && (fig.startsWith('plt.') || !scan.rcParamsName);
  const measure = [`${i}poster_fig.draw_without_rendering()`, `${i}poster_box = poster_fig.get_tightbbox().padded(${padExpr})`];
  return [
    `${i}# Postr: the saved image at ${W} × ${H} in, with the text outside the plots kept in it`,
    `${i}from matplotlib.transforms import Bbox`,
    ...(usesPlt && save ? [`${i}import matplotlib.pyplot as plt`] : []),
    `${i}poster_fig = ${fig}`,
    `${i}poster_dpi = poster_fig.dpi`,
    `${i}poster_fig.set_dpi(${dpiExpr})`,
    `${i}for _ in range(8):`,
    ...measure.map((l) => `    ${l}`),
    `${i}    poster_fig.set_size_inches(max(${W} / 10, poster_fig.get_figwidth() * ${W} / poster_box.width), max(${H} / 10, poster_fig.get_figheight() * ${H} / poster_box.height))`,
    ...measure,
    `${i}poster_box = Bbox.from_bounds(poster_box.x0 - (${W} - poster_box.width) / 2, poster_box.y0 - (${H} - poster_box.height) / 2, ${W}, ${H})`,
    `${i}poster_fig.set_dpi(poster_dpi)`,
    '',
  ].join('\n');
}

/** `, fontsize=N` before a call's closing bracket. */
function kwargEdit(code: string, call: { close: number }, at: number, name: string, value: string): Edit {
  let k = at - 1;
  while (k >= 0 && /\s/.test(code[k]!)) k--;
  const sep = code[k] === '(' || code[k] === ',' ? (code[k] === ',' ? ' ' : '') : ', ';
  void call;
  return { at, end: at, text: `${sep}${name}=${value}` };
}

/** Remove a keyword argument and its comma. */
function removeArg(code: string, call: Call, argStart: number, argEnd: number): Edit {
  let a = argStart;
  let b = argEnd;
  let k = a - 1;
  while (k > call.open && /\s/.test(code[k]!)) k--;
  if (code[k] === ',') a = k;
  else {
    let j = b;
    while (j < call.close && /\s/.test(code[j]!)) j++;
    if (code[j] === ',') { b = j + 1; while (b < call.close && /[ \t]/.test(code[b]!)) b++; }
  }
  return { at: a, end: b, text: '' };
}

/**
 * Whether a top-level import binds the name FontProperties itself, as P21's
 * floor writes it (P13B-R3-02: `import FontProperties as FP` binds FP only,
 * and the floor raised NameError in 2 of 2 runs).
 */
function bindsFontProperties(src: Source): boolean {
  const re = /^from[ \t]+matplotlib\.font_manager[ \t]+import\b/gm;
  for (let m = re.exec(src.masked); m; m = re.exec(src.masked)) {
    const names = src.code.slice(m.index + m[0].length, statementEnd(src, m.index)).replace(/[()\\]/g, ' ').split(',');
    if (names.some((x) => /^\s*(?:FontProperties|\*)\s*$/.test(x))) return true;
  }
  return false;
}

/**
 * Where an import goes: after the first top-level matplotlib import, else
 * before the first line that is not blank, a comment, a string (a module
 * docstring: in the masked copy every line of it is blank or its quotes) or
 * a `from __future__` import, which must come first (P13B-R3-02: an import
 * put at offset 0, above `from __future__`, was a SyntaxError in 2 of 2 runs).
 */
function importLine(src: Source): number {
  const imp = /^(?:import[ \t]+matplotlib|from[ \t]+matplotlib)\b/m.exec(src.masked);
  if (imp) return lineAfter(src.code, statementEnd(src, imp.index));
  const m = src.masked;
  let at = 0;
  while (at < m.length) {
    const nl = m.indexOf('\n', at);
    const body = m.slice(at, nl < 0 ? m.length : nl).trim();
    if (body && !/^[rRuU]?(["']).*\1$/.test(body) && !/^from[ \t]+__future__\b/.test(body)) return at;
    at = lineAfter(src.code, statementEnd(src, at));
  }
  return m.length;
}

export interface PyNeed { key: ElementKey; neededPt: number }

/**
 * The edited script: `needs` are the rows below their minimum and the size
 * each needs; `floors` the size every class needs at this print size (for
 * the floor on a size the check cannot read); `options` the print size (the
 * canvas assumed where the code cannot fix one).
 */
export function fixPythonScript(code: string, needs: PyNeed[], options: ParseOptions, floors: PyNeed[] = needs): string {
  const m = runPythonModel(code, options);
  const { scan } = m;
  const need = new Map(needs.map((n) => [n.key, n.neededPt]));
  const floorNeed = new Map(floors.map((n) => [n.key, n.neededPt]));
  // Instances to set: below the size needed, or assumed (set at the size checked). One the
  // code sets in a way the check cannot read: with a floor at the size needed, whether or not
  // it falls short at the size the check assumed (P13B-R3-03: one that passed there was left,
  // and the re-check showed ✓ over 10.27 pt ticks); a fontdict= the check cannot see into
  // only where it falls short (it takes a plain fontsize=, which could lower a larger size).
  const targets: Array<{ inst: Instance; pt: number; floor: boolean }> = [];
  for (const inst of m.instances) {
    const n = need.get(inst.cls);
    const short = n !== undefined && inst.pt < n;
    if (inst.origin === 'unread') {
      const f = n ?? floorNeed.get(inst.cls);
      if (f !== undefined && (short || (inst.drawn && inst.winner.kind !== 'kwarg'))) targets.push({ inst, pt: f, floor: true });
      continue;
    }
    if (short) targets.push({ inst, pt: n!, floor: false });
    else if (inst.drawn && inst.origin !== 'code') targets.push({ inst, pt: inst.pt, floor: false });
  }
  const rcName = scan.rcParamsName ?? 'plt.rcParams';
  let usesFontProperties = false;
  /** P21: the size in points an expression gives when the script runs (a number or a named size). */
  const atRun = (expr: string) => { usesFontProperties = true; return `FontProperties(size=${expr}).get_size_in_points()`; };
  /** A value written as N, or as Postr's floor max(N, expr): its N. */
  const nOf = (text: string | undefined) => Number(/^max\((\d+(?:\.\d+)?),/.exec(text ?? '')?.[1] ?? text ?? 0) || 0;
  const valueText = (n: number, floor?: string) => (floor ? `max(${num(n)}, ${floor})` : num(n));
  // font.size written as an expression the check cannot read, by where it is written: the floor each class following it needs.
  const fontFloors = new Map<number, { span: Span; f: number }>();
  const sameWinner = (a: Winner, b: Winner) =>
    a.kind === b.kind && (a.kind === 'span' ? a.span[0] === (b as typeof a).span[0]
      : a.kind === 'insert' ? a.key === (b as typeof a).key && a.after === (b as typeof a).after
        : a.kind === 'kwarg' ? a.at === (b as typeof a).at : false);
  // Never lower: each written value covers every text the same occurrence decides.
  const valueFor = (w: Winner, pt: number) => Math.max(pt, ...m.instances.filter((i) => sameWinner(i.winner, w)).map((i) => i.pt));

  const edits: Edit[] = [];
  const spans = new Map<number, Edit>();
  const inserts = new Map<number, Map<RcKey | 'legend.title_fontsize', string>>();
  const firstStmt = m.firstCreation ? m.firstCreation.stmt : null;
  // Settings go at the figure's own indent (0 at the top level), never deeper.
  const topIndent = firstStmt !== null ? indentAt(code, firstStmt).length : 0;
  const insertLine = (after: number): number => {
    const fallback = firstStmt ?? (scan.saves[0] ? statementStart(scan.src, scan.saves[0].at) : code.length);
    if (after < 0) return fallback;
    const line = safeLine(scan.src, lineAfter(code, statementEnd(scan.src, after)), topIndent);
    return firstStmt !== null && line <= firstStmt ? firstStmt : line;
  };
  const addInsert = (line: number, key: RcKey | 'legend.title_fontsize', value: string) => {
    const at = inserts.get(line) ?? new Map();
    at.set(key, value);
    inserts.set(line, at);
  };
  for (const { inst, pt, floor } of targets) {
    const w = inst.winner;
    const v = floor ? pt : valueFor(w, pt);
    if (floor && w.kind === 'insert' && inst.slope > 0 && inst.fontFrom !== null && inst.fontFrom >= 0) {
      // Follows a font.size the check cannot read, written at fontFrom: floor font.size there.
      const fs = scan.rc.map((e) => e.set['font.size']).find((x) => x?.span?.[0] === inst.fontFrom);
      if (fs?.kind === 'unread' && fs.span) {
        const f = Math.ceil(v / inst.slope - 1e-9);
        fontFloors.set(fs.span[0], { span: fs.span, f: Math.max(f, fontFloors.get(fs.span[0])?.f ?? 0) });
        continue;
      }
    }
    if (w.kind === 'span') {
      const prev = spans.get(w.span[0]);
      const val = Math.max(v, nOf(prev?.text));
      // An unread value keeps its expression inside the floor; a floor already written keeps its own.
      const kept = w.floor ?? (floor ? atRun(code.slice(w.span[0], w.span[1]).trim()) : undefined);
      spans.set(w.span[0], { at: w.span[0], end: w.span[1], text: valueText(val, kept) });
    } else if (w.kind === 'insert') {
      const line = insertLine(w.after);
      const prev = inserts.get(line)?.get(w.key);
      const val = Math.max(v, nOf(prev));
      const kept = floor || /^max\(/.test(prev ?? '') ? atRun(`${rcName}['${w.key}']`) : undefined;
      addInsert(line, w.key, valueText(val, kept));
      // A legend title follows its legend text, as it does in matplotlib
      // unless a seaborn context sized it on its own. A floor reads the title's
      // own size first (review round 3: one that read legend.fontsize set a
      // seaborn title of 7.68 pt to 7.04, r3-sns-unread-scale at 14 x 10 in).
      const title = `${rcName}['legend.title_fontsize'] or ${rcName}['legend.fontsize']`;
      if (w.key === 'legend.fontsize') addInsert(line, 'legend.title_fontsize', valueText(val, kept ? atRun(title) : undefined));
    } else if (w.kind === 'kwarg') {
      edits.push(kwargEdit(code, { close: w.at }, w.at, 'fontsize', num(v)));
    }
    // 'none': a size the check cannot read and must not overwrite: left as written, its row marked.
  }
  edits.push(...spans.values());
  // float(): matplotlib takes font.size as a string ('9' from a config file) and converts
  // it; max() cannot compare a string with a number (P13B-R3-02: TypeError, 6 of 6 runs).
  for (const { span, f } of fontFloors.values()) {
    edits.push({ at: span[0], end: span[1], text: `max(${num(f)}, float(${code.slice(span[0], span[1]).trim()}))` });
  }

  // The canvas.
  const W = num(m.canvas.w);
  const H = num(m.canvas.h);
  if (m.canvasWhy === 'default') addInsert(firstStmt ?? code.length, 'figure.figsize', `(${W}, ${H})`);
  if (m.canvasWhy === 'unread' && m.canvasSpan) {
    edits.push({ at: m.canvasSpan[0], end: m.canvasSpan[1], text: m.canvasArgs ? `${W}, ${H}` : `(${W}, ${H})` });
  }
  const lastSave = scan.saves[scan.saves.length - 1] ?? null;
  if (m.canvasWhy === 'grid' && lastSave) {
    // A seaborn grid at the print size, laid out again for it: the room its
    // legend takes outside the plots is kept (seaborn placed it for the
    // grid's own size, so at another size it would cover the plots). Its
    // save writes the whole figure, at that size.
    const line = statementStart(scan.src, lastSave.at);
    edits.push({ at: line, end: line, text: gridBlock(m, indentAt(code, line), W, H) });
    // A grid's g.savefig crops unless told bbox_inches=None (seaborn sets 'tight' when it is
    // not given): an explicit 'tight' there becomes None, not removed (the round's mutant check
    // found it: removed, the image was 9.95 × 6.90 in for 10 × 7, MEASURED).
    for (const s of scan.saves) {
      if (s.call && s.bboxArg && s.tight) edits.push(s.grid ? { at: s.bboxArg.start, end: s.bboxArg.end, text: 'None' } : removeArg(code, s.call, s.bboxArg.argStart, s.bboxArg.argEnd));
      else if (s.call && s.grid && !s.bboxArg) edits.push(kwargEdit(code, s.call, s.call.close, 'bbox_inches', 'None'));
    }
    for (const e of scan.rc) {
      const b = e.set['savefig.bbox'];
      if (b?.kind === 'bbox' && b.tight && b.span) edits.push({ at: b.span[0], end: b.span[1], text: 'None' });
    }
  } else if (m.tightSave?.call) {
    // A cropped save writes poster_box, the canvas checked with everything drawn in it.
    const line = statementStart(scan.src, m.tightSave.at);
    edits.push({ at: line, end: line, text: fitBlock(m, m.tightSave, indentAt(code, line), W, H) });
    for (const s of scan.saves.filter((x) => x.at >= m.tightSave!.at && x.call && m.cropped(x))) {
      if (s.bboxArg) edits.push({ at: s.bboxArg.start, end: s.bboxArg.end, text: 'poster_box' });
      else edits.push(kwargEdit(code, s.call!, s.call!.close, 'bbox_inches', 'poster_box'));
    }
  }
  // A script that never saves gets a save, before its first show(): a grid
  // at the print size first, and a crop (rcParams, a notebook) at the size checked.
  if (!scan.saves.length) {
    const show = scan.shows[0];
    const line = show !== undefined ? statementStart(scan.src, show) : code.length;
    const indent = show !== undefined ? indentAt(code, line) : '';
    const plt = scan.pyplot ?? 'plt';
    const lead = show === undefined && !code.endsWith('\n') ? '\n\n' : show === undefined ? '\n' : '';
    // A crop rcParams asks for, or a notebook's display (a tight crop, the image the user sees): the canvas with everything in it.
    const fit = m.canvasWhy === 'tight' || m.canvasWhy === 'notebook';
    const before = m.canvasWhy === 'grid' ? gridBlock(m, indent, W, H) : fit ? fitBlock(m, null, indent, W, H) : '';
    edits.push({ at: line, end: line, text: `${lead}${pltImport(scan, indent)}${before}${indent}${plt}.savefig("poster_figure.png", dpi=300${fit ? ', bbox_inches=poster_box' : ''})\n` });
  }

  // A block an earlier fix wrote, ending just before a place settings go,
  // takes the new keys itself: a second fix never stacks a second block
  // (its own values are edited in place above, like any setting).
  const blocks = calls(scan.src, /update/).filter((c) => /rcParams$/.test(c.receiver) && code.slice(statementStart(scan.src, c.start) - MARK.length - 1, statementStart(scan.src, c.start)).includes(MARK.slice(2)))
    .map((c) => ({ c, next: lineAfter(code, statementEnd(scan.src, c.start)) }));
  for (const [line, keys] of [...inserts]) {
    const b = blocks.find((x) => x.next === line);
    const brace = b ? scan.src.close[b.c.args[0]?.start ?? -1] ?? -1 : -1;
    if (!b || brace < 0) continue;
    const existing = new Set(Object.keys(Object.fromEntries([...code.slice(b.c.args[0]!.start, brace).matchAll(/'([\w.]+)'\s*:/g)].map((x) => [x[1], 1]))));
    const add = [...keys].filter(([k]) => !existing.has(k)).map(([k, v]) => `, '${k}': ${v}`).join('');
    if (add) edits.push({ at: brace, end: brace, text: add });
    inserts.delete(line);
  }

  // The explicit settings, one block per place they go.
  for (const [line, keys] of inserts) {
    const indent = indentAt(code, line);
    const imp = scan.rcParamsName ? '' : `${indent}import matplotlib.pyplot as plt\n`;
    const body = [...keys].map(([k, v]) => `'${k}': ${v}`).join(', ');
    const lead = line >= code.length && !code.endsWith('\n') ? '\n' : '';
    edits.push({ at: line, end: line, text: `${lead}${indent}${MARK}\n${imp}${indent}${rcName}.update({${body}})\n` });
  }

  // P21's floor reads a size with matplotlib's FontProperties: imported once, at the top level.
  if (usesFontProperties && !bindsFontProperties(scan.src)) {
    const at = importLine(scan.src);
    edits.push({ at, end: at, text: 'from matplotlib.font_manager import FontProperties\n' });
  }

  edits.sort((a, b) => b.at - a.at || b.end - a.end);
  let out = code;
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) continue; // overlapping edit: keep the later one
    out = out.slice(0, e.at) + e.text + out.slice(e.end);
    floor = e.at;
  }
  return out;
}
