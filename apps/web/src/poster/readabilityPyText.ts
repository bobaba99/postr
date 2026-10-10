/**
 * The plot checker's Python rule table, rows P12-P16, P18 and P20 (fix 13b;
 * P20, loops over Axes, from review round 2): the calls that draw or size a
 * text element, each kept with its position, its receiver and the size it
 * gives (readabilityPyRules.ts holds the table and rows P1-P11, P17, P19 and
 * P21). `scanPython` runs every row over a script.
 */
import { argOf, calls, dictEntries, source, statementEnd, stringAt, type Arg, type Call, type Source } from './readabilityCalls';
import {
  dictAt, figureRules, names, rcRules, sizeValue, SNS_AXES,
  type Draw, type DrawCls, type Names, type PyScan, type PyValue, type Span,
} from './readabilityPyRules';
import type { ElementKey } from './readabilityTypes';

const PYPLOT = /^(?:plt|pyplot|pylab|matplotlib\.pyplot)?$/;

/** `plt`, `pyplot` and a bare call all act on the current Axes or figure; `cb.ax` is the colorbar's own Axes. */
function who(receiver: string): string {
  return PYPLOT.test(receiver) ? 'plt' : receiver.replace(/\s+/g, '').replace(/\.ax$/, '');
}

/**
 * The names FontProperties is called by: its own, and one an import gives
 * it (`from matplotlib.font_manager import FontProperties as FP`; review
 * round 3, a sibling of P13B-R3-02: `FP(size=14)` was read as no size, the
 * legend row at the default 10, and the fix listed a size it could not set).
 */
const FONT_PROPS = new WeakMap<Source, RegExp>();
function fontPropsName(src: Source): RegExp {
  let re = FONT_PROPS.get(src);
  if (!re) {
    const aliases = [...src.masked.matchAll(/^[ \t]*from[ \t]+matplotlib\.font_manager[ \t]+import\b/gm)]
      .flatMap((m) => [...src.masked.slice(m.index, statementEnd(src, m.index)).matchAll(/\bFontProperties\s+as\s+([A-Za-z_]\w*)/g)].map((x) => x[1]!));
    re = new RegExp(['FontProperties', ...aliases].join('|'));
    FONT_PROPS.set(src, re);
  }
  return re;
}

/** A `FontProperties(...)` call (any module prefix, or an alias) starting at `at`, or null. */
function fontPropsAt(src: Source, at: number): Call | null {
  return calls(src, fontPropsName(src)).find((x) => x.start === at) ?? null;
}

/**
 * The size a `fontdict=` or `prop=` value gives: a dict (inline, `dict()`,
 * or a name holding one) or a FontProperties (inline or in a name), read
 * where its size is written so the fix edits it there. A dict with no size
 * sets none (matplotlib then uses rcParams: a Text's own size, a legend's
 * legend.fontsize), so null. Anything else is unread with no span: never
 * overwritten (P13B-R1-02: `fontdict=font` became `fontdict=16` and the
 * script raised), the row marked; a fontdict= still takes a fontsize=
 * keyword, which matplotlib applies after it.
 */
function propSize(src: Source, nm: Names, a: Arg, inner: readonly string[], kw: boolean): PyValue | null {
  const raw = src.code.slice(a.start, a.end).trim();
  const held = /^[A-Za-z_]\w*$/.test(raw) ? nm.get(raw, a.start) : null;
  const at = held ? held.start : a.start;
  const fp = fontPropsAt(src, at);
  if (fp) {
    const sz = argOf(fp, 'size', 5);
    return sz ? sizeValue(src, nm, sz.start, sz.end) : { kind: 'unread', span: null, origin: 'code' };
  }
  const entries = dictAt(src, nm, { ...a, start: at, end: held ? held.end : a.end });
  if (entries) {
    const e = entries.find((x) => inner.includes(x.key));
    return e ? sizeValue(src, nm, e.start, e.end) : null;
  }
  return { kind: 'unread', span: null, origin: 'code', kw };
}

/**
 * The size a call gives its text: fontsize= or size=; then a `**NAME` or
 * `**{...}` holding one (P13B-R1-08: `**label_kw` was read as no size, and
 * after the fix the row showed ✓ over 8 pt text), which the fix raises in
 * that dict; then fontdict={'fontsize'|'size': n}, prop={'size': n} or a
 * FontProperties. A `**` the check cannot resolve may hold a size: unread,
 * left as written (a fontsize= added beside it could repeat a keyword).
 */
function sizeKw(src: Source, nm: Names, c: Call, extra: string[] = []): PyValue | null {
  for (const k of ['fontsize', 'size', ...extra]) {
    const a = argOf(c, k);
    if (a) return sizeValue(src, nm, a.start, a.end);
  }
  for (const a of c.args.filter((x) => x.star === 2)) {
    const entries = dictAt(src, nm, a);
    if (!entries) return { kind: 'unread', span: null, origin: 'code' };
    const e = entries.find((x) => x.key === 'fontsize' || x.key === 'size');
    if (e) return sizeValue(src, nm, e.start, e.end);
  }
  for (const [k, inner] of [['fontdict', ['fontsize', 'size']], ['prop', ['size']]] as const) {
    const a = argOf(c, k);
    if (a) return propSize(src, nm, a, inner, k === 'fontdict');
  }
  return null;
}

/** Where `, fontsize=N` goes in a call: just before its closing bracket. */
const addAt = (c: Call) => c.close;

function draw(cls: DrawCls, axis: Draw['axis'], c: Call, receiver: string, size: PyValue | null, draws: boolean, rule: string): Draw {
  return { cls, axis, at: c.start, receiver, size, draws, addAt: draws ? addAt(c) : null, rule };
}

/** A title's loc= (its third argument): matplotlib draws the centre, left and right titles as three texts (P13B-R2-02). */
function titleLoc(src: Source, c: Call): string {
  const a = argOf(c, 'loc', 2);
  return (a ? stringAt(src, a.start, a.end) : null) ?? 'center';
}

/** The receiver of a get_xticklabels() / get_yticklabels() / get_ticklabels() inside start..end, and its axis. */
function tickLabelsIn(src: Source, start: number, end: number): Array<{ receiver: string; axis: 'x' | 'y' | null }> {
  return calls(src, /get_xticklabels|get_yticklabels|get_ticklabels|get_xmajorticklabels|get_ymajorticklabels/)
    .filter((c) => c.start >= start && c.close <= end)
    .map((c) => {
      const axisRecv = c.receiver.match(/^(.*?)\.?([xy])axis$/);
      const axis = c.name.includes('x') && c.name !== 'get_ticklabels' ? 'x' : c.name.includes('y') && c.name !== 'get_ticklabels' ? 'y' : axisRecv ? axisRecv[2] as 'x' | 'y' : null;
      return { receiver: who(axisRecv ? axisRecv[1]! : c.receiver), axis };
    });
}

function textRules(src: Source, nm: Names, out: PyScan): void {
  const d = out.draws;
  const figNames = new Set<string>(out.creations.filter((m) => m.kind === 'figure' || m.kind === 'subplots').map((m) => m.names[0]!).filter(Boolean));
  const gridNames = new Set<string>(out.creations.filter((m) => m.kind === 'grid').flatMap((m) => m.names));
  const cbNames = new Set<string>(out.creations.filter((m) => m.kind === 'colorbar').flatMap((m) => m.names));
  const isFig = (r: string) => figNames.has(r) || /(?:^|\.)(?:fig|figure)$/.test(r) || /gcf\(\)$/.test(r) || /^f$/.test(r);
  // P12, P13: titles and axis titles
  for (const c of calls(src, /set_title|title|suptitle|set_xlabel|set_ylabel|set_zlabel|xlabel|ylabel|supxlabel|supylabel|set_titles|set_axis_labels|set_label|set/)) {
    const r = who(c.receiver);
    switch (c.name) {
      case 'set_title': d.push({ ...draw('plotTitle', null, c, r, sizeKw(src, nm, c), true, 'P12'), loc: titleLoc(src, c) }); break;
      case 'title': if (r === 'plt') d.push({ ...draw('plotTitle', null, c, r, sizeKw(src, nm, c), true, 'P12'), loc: titleLoc(src, c) }); break;
      // fig.supxlabel / fig.supylabel (P13B-R2-07): the figure's own axis titles, at figure.labelsize.
      case 'supxlabel': case 'supylabel': if (r === 'plt' || isFig(r)) d.push(draw('supLabel', c.name === 'supxlabel' ? 'x' : 'y', c, r, sizeKw(src, nm, c), true, 'P13')); break;
      case 'suptitle': d.push(draw('suptitle', null, c, r, sizeKw(src, nm, c), true, 'P12')); break;
      case 'set_titles': if (gridNames.has(r)) d.push(draw('plotTitle', null, c, r, sizeKw(src, nm, c), true, 'P12')); break;
      case 'set_xlabel': case 'xlabel': if (c.name === 'set_xlabel' || r === 'plt') d.push(draw('axisTitle', 'x', c, r, sizeKw(src, nm, c), true, 'P13')); break;
      case 'set_ylabel': case 'ylabel': if (c.name === 'set_ylabel' || r === 'plt') d.push(draw('axisTitle', 'y', c, r, sizeKw(src, nm, c), true, 'P13')); break;
      // A 3D Axes' z label: an axis title like the others (its own key).
      case 'set_zlabel': d.push(draw('axisTitle', 'z', c, r, sizeKw(src, nm, c), true, 'P13')); break;
      case 'set_axis_labels': {
        const size = sizeKw(src, nm, c);
        d.push(draw('axisTitle', 'x', c, r, size, true, 'P13'), draw('axisTitle', 'y', c, r, size, true, 'P13'));
        break;
      }
      case 'set_label': if (cbNames.has(r)) d.push(draw('axisTitle', 'y', c, r, sizeKw(src, nm, c), true, 'P13')); break;
      case 'set': {
        if (r === 'plt' || /^(?:sns|seaborn)$/.test(r)) break;
        if (argOf(c, 'title')) d.push(draw('plotTitle', null, c, r, null, true, 'P12'));
        if (argOf(c, 'xlabel')) d.push(draw('axisTitle', 'x', c, r, null, true, 'P13'));
        if (argOf(c, 'ylabel')) d.push(draw('axisTitle', 'y', c, r, null, true, 'P13'));
        break;
      }
      default: break;
    }
  }
  // P12, P13 (OO): ax.title.set_fontsize(n), ax.xaxis.label.set_size(n); P14: a tick-label loop
  for (const c of calls(src, /set_fontsize|set_size/)) {
    const a = c.args[0];
    if (!a) continue;
    const size = sizeValue(src, nm, a.start, a.end);
    const t = c.receiver.match(/^(.*)\.title$/);
    const l = c.receiver.match(/^(.*)\.([xy])axis\.label$/);
    if (t) d.push(draw('plotTitle', null, c, who(t[1]!), size, false, 'P12'));
    else if (l) d.push(draw('axisTitle', l[2] as 'x' | 'y', c, who(l[1]!), size, false, 'P13'));
    else if (/^[A-Za-z_]\w*$/.test(c.receiver)) {
      // `for lab in ax.get_xticklabels() + ax.get_yticklabels(): lab.set_fontsize(7)`
      const head = new RegExp(`for\\s+${c.receiver}\\s+in\\s+([^\\n]*?):`, 'g');
      let m: RegExpExecArray | null;
      let found: RegExpExecArray | null = null;
      while ((m = head.exec(src.masked)) !== null && m.index < c.start) found = m;
      if (!found) continue;
      const from = found.index;
      for (const tl of tickLabelsIn(src, from, from + found[0].length)) d.push({ cls: 'axisText', axis: tl.axis, at: c.start, receiver: tl.receiver, size, draws: false, addAt: null, rule: 'P14' });
    }
  }
  // P14: tick labels
  for (const c of calls(src, /tick_params|set_tick_params|xticks|yticks|set_xticklabels|set_yticklabels|set_xticks|set_yticks|setp/)) {
    const r = who(c.receiver);
    if (c.name === 'tick_params' || c.name === 'set_tick_params') {
      // labelsize=, or in a ** dict (a sibling of P13B-R1-08: tick_params(**tick_kw)).
      const a = argOf(c, 'labelsize') ?? c.args.filter((x) => x.star === 2).flatMap((x) => dictAt(src, nm, x) ?? []).find((e) => e.key === 'labelsize');
      if (!a) continue;
      const axisRecv = c.receiver.match(/^(.*?)\.?([xy])axis$/);
      const axisArg = argOf(c, 'axis');
      const scope = axisRecv ? axisRecv[2]! : axisArg ? stringAt(src, axisArg.start, axisArg.end) ?? 'both' : 'both';
      const axis = scope === 'x' || scope === 'y' || scope === 'z' ? scope : null;
      d.push({ cls: 'axisText', axis, at: c.start, receiver: axisRecv ? who(axisRecv[1]!) : r, size: sizeValue(src, nm, a.start, a.end), draws: false, addAt: null, rule: 'P14' });
    } else if (c.name === 'setp') {
      const target = c.args[0];
      const size = sizeKw(src, nm, c);
      if (!target || !size) continue;
      for (const tl of tickLabelsIn(src, target.start, target.end)) d.push({ cls: 'axisText', axis: tl.axis, at: c.start, receiver: tl.receiver, size, draws: false, addAt: null, rule: 'P14' });
    } else {
      if ((c.name === 'xticks' || c.name === 'yticks') && r !== 'plt') continue;
      const size = sizeKw(src, nm, c);
      if (!size) continue;
      d.push({ cls: 'axisText', axis: c.name.includes('x') ? 'x' : 'y', at: c.start, receiver: r, size, draws: false, addAt: null, rule: 'P14' });
    }
  }
  // P14: pandas' df.plot(fontsize=n) sizes its tick labels.
  for (const c of calls(src, /plot/)) {
    if (PYPLOT.test(c.receiver) || /^(?:sns|seaborn)$/.test(c.receiver) || /^ax\w*$|^axs?\[|^axes/.test(c.receiver)) continue;
    const a = argOf(c, 'fontsize');
    if (a) d.push({ cls: 'axisText', axis: null, at: c.start, receiver: 'plt', size: sizeValue(src, nm, a.start, a.end), draws: false, addAt: null, rule: 'P14' });
  }
  // P15: legends
  for (const c of calls(src, /legend|figlegend|add_legend|move_legend/)) {
    const r = who(c.receiver);
    if (c.name === 'move_legend') {
      if (!/^(?:sns|seaborn)$/.test(r) || !c.args[0]) continue;
      d.push(draw('legendText', null, c, who(src.masked.slice(c.args[0].start, c.args[0].end)), sizeKw(src, nm, c), true, 'P15'));
      continue;
    }
    if (c.name === 'legend' && /^(?:sns|seaborn)$/.test(r)) continue;
    d.push(draw('legendText', null, c, c.name === 'figlegend' ? 'plt.gcf()' : r, sizeKw(src, nm, c), true, 'P15'));
  }
  // P13, P15: seaborn's axes-level plots label their Axes and draw a legend for hue=.
  for (const c of calls(src, new RegExp(SNS_AXES))) {
    if (!/^(?:sns|seaborn)$/.test(c.receiver)) continue;
    const ax = argOf(c, 'ax');
    const r = ax ? who(src.masked.slice(ax.start, ax.end)) : 'plt';
    if (c.name !== 'heatmap') d.push(draw('axisTitle', 'x', c, r, null, true, 'P13'), draw('axisTitle', 'y', c, r, null, true, 'P13'));
    const legend = argOf(c, 'legend');
    if (argOf(c, 'hue') && !(legend && /^False$/.test(src.code.slice(legend.start, legend.end).trim()))) d.push({ ...draw('legendText', null, c, r, null, true, 'P15'), addAt: null });
  }
  // P13: colorbar(..., label=), cbar_kws={'label': ...} or a pandas c= column labels the colorbar's Axes when it is made.
  for (const m of out.creations.filter((x) => x.kind === 'colorbar' && x.label)) {
    d.push({ ...draw('axisTitle', 'y', m.call, m.names[0] ?? `<colorbar@${m.at}>`, null, true, 'P13'), addAt: null });
  }
  // P10: a seaborn grid labels its Axes, titles its facets and draws its legend at the call.
  for (const m of out.creations.filter((x) => x.kind === 'grid')) {
    const r = m.names[0] ?? `<${m.grid!.fn}>`;
    d.push({ ...draw('axisTitle', 'x', m.call, r, null, true, 'P10'), addAt: null }, { ...draw('axisTitle', 'y', m.call, r, null, true, 'P10'), addAt: null });
    if (m.grid!.facets) d.push({ ...draw('plotTitle', null, m.call, r, null, true, 'P10'), addAt: null });
    if (m.grid!.legend) d.push({ ...draw('legendText', null, m.call, `${r}.figure`, null, true, 'P10'), addAt: null });
  }
  // P16: captions
  for (const c of calls(src, /text|figtext/)) {
    const r = who(c.receiver);
    if (c.name === 'figtext' ? r !== 'plt' : !isFig(r)) continue;
    d.push(draw('caption', null, c, r, sizeKw(src, nm, c), true, 'P16'));
  }
  d.sort((a, b) => a.at - b.at);
  out.draws = loops(src, d);
}

/**
 * P20: a size set on a loop's variable is set on each Axes the loop goes
 * over (P13B-R2-13: `for ax in (ax_a, ax_b): ax.tick_params(labelsize=12)`
 * was read as no Axes, and each Axes kept matplotlib's default). The loop
 * goes over names (`(a, b)`, `[a, b]`): one draw per name; or over a
 * subplots array (`X`, `X.flat`, `X.ravel()`, `X.flatten()`): one draw on
 * `X[*]`, which the model gives to each Axes of that array. enumerate() and
 * zip() are followed to the variable's own iterable. A loop over anything
 * else names no Axes, as before.
 */
function loops(src: Source, draws: Draw[]): Draw[] {
  const heads: Array<{ vars: string[]; iter: string; indent: number; body: number; end: number }> = [];
  const re = /^([ \t]*)for[ \t]+([^\n]+?)[ \t]+in[ \t]+([^\n]+?):[ \t]*$/gm;
  for (let m = re.exec(src.masked); m; m = re.exec(src.masked)) {
    const indent = m[1]!.length;
    const body = m.index + m[0].length + 1;
    // The body: the lines after the head indented deeper (blank lines included).
    let end = body;
    const line = /^([ \t]*)(\S?)[^\n]*(?:\n|$)/gmy;
    line.lastIndex = body;
    for (let l = line.exec(src.masked); l && l[0].length; l = line.exec(src.masked)) {
      if (l[2] && l[1]!.length <= indent) break;
      end = l.index + l[0].length;
    }
    heads.push({ vars: m[2]!.replace(/[()]/g, '').split(',').map((v) => v.trim()), iter: m[3]!.trim(), indent, body, end });
  }
  if (!heads.length) return draws;
  const targets = (h: (typeof heads)[number], v: string): string[] | null => {
    let k = h.vars.indexOf(v);
    let iter = h.iter;
    const wrap = /^(enumerate|zip)\(([\s\S]*)\)$/.exec(iter);
    if (wrap) {
      const parts = splitTopLevel(wrap[2]!);
      if (wrap[1] === 'enumerate') { if (k !== 1) return null; iter = parts[0] ?? ''; k = 0; } else { iter = parts[k] ?? ''; k = 0; }
    } else if (h.vars.length > 1) return null;
    if (k !== 0) return null;
    const list = /^[([]([\s\S]*)[)\]]$/.exec(iter);
    if (list) {
      const names = splitTopLevel(list[1]!);
      return names.length && names.every((n) => /^[A-Za-z_]\w*(?:\[[^\]]*\])?$/.test(n)) ? names : null;
    }
    const arr = /^([A-Za-z_]\w*)(?:\.flat|\.ravel\(\)|\.flatten\(\))?$/.exec(iter);
    return arr ? [`${arr[1]}[*]`] : null;
  };
  return draws.flatMap((d) => {
    const h = heads.filter((x) => d.at >= x.body && d.at < x.end && x.vars.includes(d.receiver)).pop();
    const to = h ? targets(h, d.receiver) : null;
    return to ? to.map((r) => ({ ...d, receiver: r.replace(/\s+/g, '') })) : [d];
  });
}

/** The top-level comma-separated parts of a text (brackets respected). */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { out.push(text.slice(from, i).trim()); from = i + 1; }
  }
  const last = text.slice(from).trim();
  if (last) out.push(last);
  return out;
}

/** P18: Postr's earlier fix (fix 13): `_POSTR_NEED = {...}`, live when a `_postr_raise_text(` call is. */
function earlierFix(src: Source): Array<{ cls: ElementKey; pt: number; span: Span }> {
  const live = calls(src, /_postr_raise_text/).length > 0;
  const m = /^[ \t]*_POSTR_NEED[ \t]*=[ \t]*\{/m.exec(src.masked);
  if (!live || !m) return [];
  const open = m.index + m[0].length - 1;
  return dictEntries(src, open).flatMap((e) => {
    const pt = Number(src.code.slice(e.start, e.end).trim());
    return e.key && Number.isFinite(pt) ? [{ cls: e.key as ElementKey, pt, span: [e.start, e.end] as Span }] : [];
  });
}

/** How the script reaches pyplot and rcParams, for a setting the fix inserts. */
function aliases(src: Source): { pyplot: string | null; rcParamsName: string | null } {
  const t = src.masked;
  const py = t.match(/^[ \t]*import[ \t]+matplotlib\.pyplot[ \t]+as[ \t]+(\w+)/m)?.[1]
    ?? t.match(/^[ \t]*from[ \t]+matplotlib[ \t]+import[ \t]+(?:[^\n]*,[ \t]*)?pyplot[ \t]+as[ \t]+(\w+)/m)?.[1]
    ?? (/^[ \t]*import[ \t]+matplotlib\.pyplot[ \t]*$/m.test(t) ? 'matplotlib.pyplot' : null);
  const mpl = t.match(/^[ \t]*import[ \t]+matplotlib[ \t]+as[ \t]+(\w+)/m)?.[1] ?? (/^[ \t]*import[ \t]+matplotlib[ \t]*$/m.test(t) ? 'matplotlib' : null);
  const bare = /^[ \t]*from[ \t]+matplotlib[ \t]+import[ \t]+[^\n]*\brcParams\b/m.test(t) ? 'rcParams' : null;
  return { pyplot: py, rcParamsName: py ? `${py}.rcParams` : mpl ? `${mpl}.rcParams` : bare };
}

/** Every rule of the table over `code`. */
export function scanPython(code: string): PyScan {
  const src = source(code);
  const nm = names(src);
  const out: PyScan = {
    src, rc: [], creations: [], draws: [], sizes: [], saves: [], shows: [], notebook: false, unknownStyle: null,
    earlierFix: earlierFix(src), ...aliases(src),
  };
  rcRules(src, nm, out);
  figureRules(src, nm, out);
  textRules(src, nm, out);
  return out;
}
