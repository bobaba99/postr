/**
 * The plot checker's Python model (fix 13b): the rule table's matches
 * (readabilityPyRules.ts, readabilityPyText.ts) ordered by position, the
 * last one that applies winning, with the few override rules the owner's
 * design writes down:
 * - a seaborn set_theme/set_context, rcdefaults() or a style sheet resets
 *   the per-element sizes set before it (they are events in the same order);
 * - an explicit size on a call beats rcParams for that text;
 * - axis titles and tick labels take rcParams when their Axes is made,
 *   titles, legends and captions when their call runs (matplotlib 3.10.8);
 * - one title per loc= on each Axes; a sup-label reads figure.labelsize; a
 *   colorbar's Axes is never the current one; a draw on `X[*]` (a loop over
 *   a subplots array, P20) is a draw on each of X's Axes (review round 2).
 * Every drawn text is an instance with its size and the occurrence that
 * decides it (the winner), which readabilityPyFix.ts edits in place or,
 * when the code does not set it, sets explicitly.
 */
import { scanPython } from './readabilityPyText';
import { FONT_SCALINGS, RC_DEFAULTS, type Creation, type Draw, type PyScan, type PyValue, type RcKey, type SaveInfo, type Span } from './readabilityPyRules';
import { PY_DEFAULTS, PY_ELEMENTS, type ElementKey, type FigureParams, type ParseOptions } from './readabilityTypes';

/**
 * What decides an instance's size: a value written in the code, a key to
 * set, a call to give a size, or nothing the fix may edit (a size the check
 * cannot read and must not overwrite: its row stays marked).
 */
export type Winner =
  /** `floor`: the span holds Postr's P21 floor `max(N, floor)`: an edit raises N and keeps it. */
  | { kind: 'span'; span: Span; floor?: string }
  | { kind: 'insert'; key: RcKey; after: number }
  | { kind: 'kwarg'; at: number }
  | { kind: 'none' };

export interface Instance {
  cls: ElementKey;
  pt: number;
  /** 'default': nothing in the code sets it; 'unread': set by something the check cannot read. */
  origin: 'code' | 'default' | 'unread';
  winner: Winner;
  /** Points per point of font.size (0: absolute). */
  slope: number;
  /** The font.size write it follows (-1: matplotlib's default), when slope > 0. */
  fontFrom: number | null;
  explicit: boolean;
  /** False for the row of a class the code does not draw (scored at the size rcParams gives it). */
  drawn: boolean;
}

export type CanvasWhy = 'default' | 'unread' | 'grid' | 'tight' | 'notebook';

export interface PyModel {
  scan: PyScan;
  instances: Instance[];
  canvas: { w: number; h: number };
  /** Why the printed scale is assumed, or null when the code fixes it. */
  canvasWhy: CanvasWhy | null;
  /** Where the canvas is written when it cannot be read (to set it in place). */
  canvasSpan: Span | null;
  /** True when that span is set_size_inches()'s arguments (`10, 7`), false for a figsize value (`(10, 7)`). */
  canvasArgs: boolean;
  /** The figure the save writes, when it is a seaborn grid (its name). */
  gridName: string | null;
  firstCreation: Creation | null;
  /**
   * The save a fit block goes before (readabilityPyFix.ts): the image is
   * cropped with bbox_inches="tight" and no fit block (P19) sizes the figure
   * so the crop writes the canvas; null otherwise.
   */
  tightSave: SaveInfo | null;
  /** Whether a save writes a cropped image (bbox_inches="tight", a grid's g.savefig, rcParams['savefig.bbox']). */
  cropped: (s: SaveInfo) => boolean;
}

type Resolved = { pt: number; origin: Instance['origin']; winner: Winner; slope: number; fontFrom: number | null };

const END = Number.MAX_SAFE_INTEGER;

function rcState(scan: PyScan, at: number): { values: Record<RcKey, PyValue>; setAt: Record<RcKey, number>; fontFrom: number } {
  const values = { ...RC_DEFAULTS };
  const setAt = Object.fromEntries(Object.keys(RC_DEFAULTS).map((k) => [k, -1])) as Record<RcKey, number>;
  let fontFrom = -1;
  scan.rc.forEach((e, i) => {
    if (e.at >= at) return;
    if (e.resetAll) {
      for (const k of Object.keys(RC_DEFAULTS) as RcKey[]) { values[k] = { ...RC_DEFAULTS[k], origin: 'code' } as PyValue; setAt[k] = e.end; }
      fontFrom = -2 - i;
    }
    for (const [k, v] of Object.entries(e.set) as Array<[RcKey, PyValue]>) {
      values[k] = v;
      setAt[k] = e.end;
      if (k === 'font.size') fontFrom = v.span ? v.span[0] : -2 - i;
    }
  });
  return { values, setAt, fontFrom };
}

/** The winner at a value's span, carrying a P21 floor's kept expression. */
function spanWinner(v: PyValue): Winner {
  return { kind: 'span', span: v.span!, ...(v.kind === 'pt' && v.floor ? { floor: v.floor } : {}) };
}

/** The size rcParams `key` gives a text made at `at`. */
function fromRc(scan: PyScan, key: RcKey, at: number): Resolved {
  const { values, setAt, fontFrom } = rcState(scan, at);
  const v = values[key];
  const fs = values['font.size'];
  const fsPt = fs.kind === 'pt' ? fs.pt : PY_DEFAULTS.baseSize;
  const winner: Winner = v.span ? spanWinner(v) : { kind: 'insert', key, after: setAt[key] };
  if (v.kind === 'pt') return { pt: v.pt, origin: v.origin, winner, slope: key === 'font.size' ? 1 : 0, fontFrom: key === 'font.size' ? fontFrom : null };
  if (v.kind === 'named') {
    const origin = fs.kind === 'unread' ? 'unread' : v.origin === 'default' && fs.origin === 'default' ? 'default' : 'code';
    return { pt: FONT_SCALINGS[v.name]! * fsPt, origin, winner, slope: FONT_SCALINGS[v.name]!, fontFrom };
  }
  const dflt = RC_DEFAULTS[key];
  const scale = dflt.kind === 'named' ? FONT_SCALINGS[dflt.name]! : 1;
  return { pt: scale * PY_DEFAULTS.baseSize, origin: 'unread', winner, slope: 0, fontFrom: null };
}

/**
 * The size a call gives its text, at `at`. `addAt`: where the call takes a
 * fontsize= keyword, for a value it cannot read that a keyword beats.
 */
function fromValue(scan: PyScan, v: PyValue, fallbackKey: RcKey, at: number, addAt: number | null = null): Resolved {
  const winner: Winner = v.span ? spanWinner(v)
    : v.kind === 'unread' && v.kw && addAt !== null ? { kind: 'kwarg', at: addAt } : { kind: 'none' };
  if (v.kind === 'pt') return { pt: v.pt, origin: 'code', winner, slope: 0, fontFrom: null };
  if (v.kind === 'named') {
    // A named size ('large') on an unread font.size is unread too (a sibling of P13B-R2-03).
    const fs = rcState(scan, at).values['font.size'];
    return { pt: FONT_SCALINGS[v.name]! * (fs.kind === 'pt' ? fs.pt : PY_DEFAULTS.baseSize), origin: fs.kind === 'unread' ? 'unread' : 'code', winner, slope: 0, fontFrom: null };
  }
  return { ...fromRc(scan, fallbackKey, at), origin: 'unread', winner, slope: 0, fontFrom: null };
}

function instance(cls: ElementKey, r: Resolved, explicit: boolean, drawn = true): Instance {
  return { cls, ...r, explicit, drawn };
}

/** Axes slots: one per Axes a creation makes, with the receivers that name it and the axes it shows. */
interface Slot { creation: Creation; receivers: Set<string>; axes: Array<'x' | 'y'> }

/** A colorbar's Axes: a slot of its own, never the current Axes (plt) nor "the only Axes". */
const isBar = (s: Slot) => s.creation.kind === 'colorbar';

function slots(scan: PyScan, draws: Draw[]): Slot[] {
  const out: Slot[] = [];
  // No figure made in the code (a snippet, a figure from a function of the
  // user's): one Axes, made just before the first text call.
  if (!scan.creations.some((c) => c.axes > 0) && draws.length) {
    const at = Math.max(0, draws[0]!.at - 1);
    const call = { name: 'subplots', receiver: 'plt', start: at, open: at, close: at, args: [] };
    out.push({ creation: { at, stmt: at, kind: 'implicit', axes: 1, names: [], figsize: null, call }, receivers: new Set(), axes: ['x', 'y'] });
  }
  for (const c of scan.creations) {
    if (c.axes === 0) continue;
    const own = c.kind === 'subplots' ? c.names.slice(1) : c.kind === 'figure' ? [] : c.kind === 'colorbar' && !c.names.length ? [`<colorbar@${c.at}>`] : c.names;
    const axes: Array<'x' | 'y'> = c.kind === 'twin' ? [c.call.name === 'twiny' ? 'x' : 'y'] : c.kind === 'colorbar' ? ['y'] : ['x', 'y'];
    if (c.axes === 1) { out.push({ creation: c, receivers: new Set(own), axes }); continue; }
    // `fig, (ax1, ax2) = plt.subplots(1, 2)`: one name per Axes, in order
    // (P13B-R1-13: each Axes kept a default tick instance, and the row failed).
    if (own.length === c.axes) { own.forEach((n) => out.push({ creation: c, receivers: new Set([n]), axes })); continue; }
    // subplots(2, 2): `axs[0]`, `axs[1, 0]`... in the order the code first names them; each is
    // also `axs[#k]`, which a loop over the array (P20, `axs[*]`) reaches.
    const arr = own[0];
    const named = arr ? [...new Set(draws.filter((d) => d.receiver.startsWith(`${arr}[`) && !/\[[*#]/.test(d.receiver)).map((d) => d.receiver))] : [];
    for (let k = 0; k < c.axes; k++) out.push({ creation: c, receivers: new Set([...(named[k] ? [named[k]!] : []), ...(arr ? [`${arr}[#${k}]`] : [])]), axes });
  }
  // The only Axes, named by nothing that made it: the first receiver the
  // code uses is its name; another (a colorbar the code never made) is not.
  const plots = out.filter((s) => !isBar(s));
  if (plots.length === 1 && !plots[0]!.receivers.size) {
    const first = draws.find((d) => d.receiver !== 'plt' && !/^</.test(d.receiver) && !/(?:^|\.)(?:fig|figure)$|gcf\(\)$/.test(d.receiver)
      && !out.some((s) => isBar(s) && s.receivers.has(d.receiver)));
    if (first) plots[0]!.receivers.add(first.receiver);
  }
  return out;
}

/** P20: a draw on `X[*]` (a loop over the subplots array X) is a draw on each of X's Axes. */
function expandArrays(draws: Draw[], all: Slot[]): Draw[] {
  return draws.flatMap((d) => {
    const m = /^(.*)\[\*\]$/.exec(d.receiver);
    if (!m) return [d];
    const each = all.flatMap((s) => [...s.receivers].filter((r) => r.startsWith(`${m[1]}[#`)));
    return each.length ? each.map((r) => ({ ...d, receiver: r })) : [{ ...d, receiver: m[1]! }];
  });
}

/** The slot a receiver names at `at`: its own name, `plt` for the current Axes, the only one there is. */
function slotOf(all: Slot[], receiver: string, at: number): Slot | null {
  const named = all.find((s) => s.receivers.has(receiver));
  if (named) return named;
  const plots = all.filter((s) => !isBar(s));
  if (plots.length === 1 && (receiver === 'plt' || (!plots[0]!.receivers.size && !receiver.startsWith('<')))) return plots[0]!;
  if (receiver === 'plt') {
    const before = plots.filter((s) => s.creation.at < at);
    return before.length ? before[before.length - 1]! : plots[0] ?? null;
  }
  return null;
}

function buildInstances(scan: PyScan): Instance[] {
  const out: Instance[] = [];
  const allSlots = slots(scan, scan.draws);
  const draws = expandArrays(scan.draws, allSlots);
  const key = (d: Draw) => {
    const s = slotOf(allSlots, d.receiver, d.at);
    return s ? `slot${allSlots.indexOf(s)}` : d.receiver;
  };
  const creationAt = (d: Draw) => slotOf(allSlots, d.receiver, d.at)?.creation.at ?? scan.creations.find((c) => c.at < d.at)?.at ?? d.at;
  // Titles and legends: per receiver (and per title loc, per sup-label axis), the last call that draws or sizes it.
  const fold = (cls: Draw['cls'], rcKey: RcKey, outCls: ElementKey) => {
    const state = new Map<string, Instance>();
    for (const d of draws.filter((x) => x.cls === cls)) {
      const k = cls === 'legendText' && /figure$|gcf\(\)$|^fig/.test(d.receiver) ? `fig@${d.at}` : `${key(d)}:${d.loc ?? 'center'}:${cls === 'supLabel' ? d.axis : ''}`;
      if (d.draws) state.set(k, d.size ? instance(outCls, fromValue(scan, d.size, rcKey, d.at, d.addAt), true) : instance(outCls, fromRc(scan, rcKey, d.at), false));
      else if (state.has(k) && d.size) state.set(k, instance(outCls, fromValue(scan, d.size, rcKey, d.at, d.addAt), true));
    }
    out.push(...state.values());
  };
  fold('plotTitle', 'axes.titlesize', 'plotTitle');
  fold('suptitle', 'figure.titlesize', 'plotTitle');
  fold('legendText', 'legend.fontsize', 'legendText');
  fold('supLabel', 'figure.labelsize', 'axisTitle');
  // Axis titles: the size rcParams gave when the Axes was made, unless a call sets one.
  const labels = new Map<string, Instance>();
  for (const d of draws.filter((x) => x.cls === 'axisTitle')) {
    for (const axis of d.axis ? [d.axis] : ['x', 'y'] as const) {
      const k = `${key(d)}:${axis}`;
      if (d.size) labels.set(k, instance('axisTitle', fromValue(scan, d.size, 'axes.labelsize', d.at, d.addAt), true));
      else if (d.draws && !labels.has(k)) labels.set(k, instance('axisTitle', fromRc(scan, 'axes.labelsize', creationAt(d)), false));
    }
  }
  out.push(...labels.values());
  // Tick labels: every Axes shows them; rcParams when it is made, unless a call sets them.
  for (const s of allSlots) {
    for (const axis of s.axes) {
      const rcKey: RcKey = axis === 'x' ? 'xtick.labelsize' : 'ytick.labelsize';
      let inst = instance('axisText', fromRc(scan, rcKey, s.creation.at), false);
      // At or after the Axes is made (pandas' df.plot(fontsize=) makes and sizes it in one call).
      for (const d of draws.filter((x) => x.cls === 'axisText' && x.at >= s.creation.at && (x.axis === null || x.axis === axis))) {
        if (slotOf(allSlots, d.receiver, d.at) === s && d.size) inst = instance('axisText', fromValue(scan, d.size, rcKey, d.at), true);
      }
      out.push(inst);
    }
  }
  // A size set on Axes the check cannot name (a loop's variable, an inset)
  // is a tick label of its own, with the size it sets: the smaller one wins
  // and the fix raises it where it is written.
  const unnamed = new Map<string, Instance>();
  for (const d of draws.filter((x) => x.cls === 'axisText' && x.size && (x.axis === 'z' || !slotOf(allSlots, x.receiver, x.at)))) {
    for (const axis of d.axis ? [d.axis] : ['x', 'y'] as const) {
      unnamed.set(`${d.receiver}:${axis}`, instance('axisText', fromValue(scan, d.size!, axis === 'y' ? 'ytick.labelsize' : 'xtick.labelsize', d.at), true));
    }
  }
  out.push(...unnamed.values());
  // Captions: font.size at the call; the fix gives the call its own size.
  for (const d of draws.filter((x) => x.cls === 'caption')) {
    const r = d.size ? fromValue(scan, d.size, 'font.size', d.at, d.addAt) : { ...fromRc(scan, 'font.size', d.at), winner: { kind: 'kwarg', at: d.addAt! } as Winner };
    out.push(instance('caption', r, !!d.size));
  }
  // P18: Postr's earlier fix raises each named class at save.
  for (const f of scan.earlierFix) {
    for (const i of out) if (i.cls === f.cls && i.pt < f.pt) Object.assign(i, { pt: f.pt, origin: 'code', winner: { kind: 'span', span: f.span }, slope: 0, fontFrom: null });
  }
  // A row for a class the code does not draw: the size rcParams gives at the end (caption: no row).
  const undrawn: Array<[ElementKey, RcKey]> = [['plotTitle', 'axes.titlesize'], ['axisTitle', 'axes.labelsize'], ['axisText', 'xtick.labelsize'], ['legendText', 'legend.fontsize']];
  for (const [cls, k] of undrawn) {
    if (!out.some((i) => i.cls === cls)) out.push(instance(cls, fromRc(scan, k, END), false, false));
  }
  return out;
}

type Canvas = Omit<PyModel, 'scan' | 'instances' | 'canvasArgs' | 'tightSave' | 'cropped'> & { canvasArgs?: boolean };

/** Whether `s` writes a cropped image: bbox_inches="tight" on the call, a grid's g.savefig, or rcParams['savefig.bbox']. */
function cropped(scan: PyScan, s: SaveInfo): boolean {
  if (s.bboxArg) return s.tight;
  if (s.grid) return true;
  const rcBbox = rcState(scan, s.at).values['savefig.bbox'];
  return rcBbox.kind === 'bbox' && rcBbox.tight;
}

function canvasOf(scan: PyScan, options: ParseOptions): Canvas & { tightSave: SaveInfo | null } {
  const typed = options.defaultWidthIn !== undefined && options.defaultHeightIn !== undefined
    ? { w: options.defaultWidthIn, h: options.defaultHeightIn } : { w: PY_DEFAULTS.width, h: PY_DEFAULTS.height };
  const first = scan.creations.find((c) => c.kind !== 'twin' && c.kind !== 'colorbar') ?? null;
  const save = scan.saves[scan.saves.length - 1] ?? null;
  const gridName = first?.kind === 'grid' ? first.names[0] ?? null : null;
  const savedTight = save ? cropped(scan, save) : (() => {
    const rcBbox = rcState(scan, END).values['savefig.bbox'];
    return rcBbox.kind === 'bbox' && rcBbox.tight;
  })();
  const resized = scan.sizes[scan.sizes.length - 1];
  // P19: the fit block before the save, which writes its box (bbox_inches=poster_box): the image is W × H.
  const fitted = !!resized?.fit && !!save?.bboxArg && scan.src.code.slice(save.bboxArg.start, save.bboxArg.end).trim() === 'poster_box';
  // The fit block goes before the first cropped save once the figure is made (a PNG and a PDF of it both fit).
  const tightSave = savedTight && save
    ? scan.saves.find((s) => s.at > (first?.at ?? -1) && cropped(scan, s)) ?? save : null;
  // A crop or a notebook's display decides the printed scale before any default canvas does
  // (P13B-R1-09: a tight save on matplotlib's default canvas was offered the one-number advice).
  const why = (w: CanvasWhy | null): CanvasWhy | null => (savedTight ? 'tight' : !save && scan.notebook && scan.shows.length ? 'notebook' : w);
  const pick = (c: Canvas): Canvas & { tightSave: SaveInfo | null } => ({ ...c, tightSave });
  if (resized) {
    // P19: Postr's fit block: the crop writes W × H.
    if (resized.value.kind === 'pair' && (!resized.fit || fitted)) return pick({ canvas: { w: resized.value.w, h: resized.value.h }, canvasWhy: why(null), canvasSpan: null, gridName, firstCreation: first });
    return pick({ canvas: typed, canvasWhy: 'unread', canvasSpan: resized.value.span, canvasArgs: true, gridName, firstCreation: first });
  }
  if (first?.kind === 'grid') {
    const g = first.grid!;
    return pick(g.canvas ? { canvas: g.canvas, canvasWhy: why(null), canvasSpan: null, gridName, firstCreation: first } : { canvas: typed, canvasWhy: 'grid', canvasSpan: null, gridName, firstCreation: first });
  }
  if (first?.figsize) {
    if (first.figsize.kind === 'pair') return pick({ canvas: { w: first.figsize.w, h: first.figsize.h }, canvasWhy: why(null), canvasSpan: null, gridName, firstCreation: first });
    return pick({ canvas: typed, canvasWhy: 'unread', canvasSpan: first.figsize.span, gridName, firstCreation: first });
  }
  const rc = rcState(scan, first?.at ?? END).values['figure.figsize'];
  if (rc.kind === 'pair') return pick({ canvas: { w: rc.w, h: rc.h }, canvasWhy: why(rc.origin === 'default' ? 'default' : null), canvasSpan: null, gridName, firstCreation: first });
  return pick({ canvas: typed, canvasWhy: 'unread', canvasSpan: rc.span, gridName, firstCreation: first });
}

export function runPythonModel(code: string, options: ParseOptions = {}): PyModel {
  const scan = scanPython(code);
  const c = canvasOf(scan, options);
  return { scan, instances: buildInstances(scan), ...c, canvasArgs: !!c.canvasArgs, cropped: (s: SaveInfo) => cropped(scan, s) };
}

const inches = (n: number) => `${n.toFixed(1)}"`;

/** The warnings the page shows for a Python script (English; i18n/readabilityWarnings.ts gives French). */
function warningsOf(m: PyModel, options: ParseOptions): string[] {
  const out: string[] = [];
  const drawn = m.instances.filter((i) => i.drawn);
  if (drawn.some((i) => i.origin === 'default')) out.push('No font size found for some text — matplotlib’s defaults are assumed (marked *); the edited script sets them.');
  if (drawn.some((i) => i.origin === 'unread')) out.push('A text size in your code could not be read — the rows marked * assume matplotlib’s default; the edited script raises each one it can reach to at least the size needed, never below what your code sets.');
  if (m.scan.unknownStyle !== null) out.push(`A style sheet the check does not know (${m.scan.unknownStyle}) may set text sizes — the sizes below are what matplotlib draws without it.`);
  const size = `${inches(m.canvas.w)}×${inches(m.canvas.h)}`;
  const typed = options.defaultSizeLabel ?? 'the print size';
  switch (m.canvasWhy) {
    case 'default': out.push(`No canvas size found — assuming matplotlib default ${size}; the edited script sets it.`); break;
    case 'unread': out.push(`Could not read the figure size in your code — assuming ${typed} ${size}; the edited script sets it.`); break;
    case 'grid': out.push(`seaborn sizes this grid from its facets and legend, which the code does not give — assuming ${typed} ${size}; the edited script sets the figure to it.`); break;
    case 'tight': out.push(`Saved with bbox_inches="tight", which crops the image to another size than the ${size} figure, so the print sizes below may be off; the edited script saves at the figure’s size.`); break;
    case 'notebook': out.push(`Shown in a notebook, which crops the image to another size than the ${size} figure, so the print sizes below may be off; the edited script saves at the figure’s size.`); break;
    default: break;
  }
  return out;
}

/** The FigureParams the scorer takes, from the model. */
export function pythonParams(code: string, options: ParseOptions = {}): FigureParams {
  const m = runPythonModel(code, options);
  const sizes: FigureParams['sizes'] = {};
  const assumed: FigureParams['assumed'] = {};
  const assumedKept: FigureParams['assumedKept'] = {};
  const unread: FigureParams['unread'] = {};
  const floorWhenShort: FigureParams['floorWhenShort'] = {};
  const undrawn: FigureParams['undrawn'] = {};
  const baseSlope: FigureParams['baseSlope'] = {};
  const overrides: FigureParams['overrides'] = {};
  const overrideCoversAll: FigureParams['overrideCoversAll'] = {};
  const raisedByFix: FigureParams['raisedByFix'] = {};
  const hidden: FigureParams['hidden'] = {};
  const sources = new Set<number>();
  for (const spec of PY_ELEMENTS) {
    const all = m.instances.filter((i) => i.cls === spec.key);
    if (!all.length) { hidden[spec.key] = true; continue; }
    const min = all.reduce((a, b) => (b.pt < a.pt ? b : a));
    sizes[spec.key] = min.pt;
    if (min.drawn && min.origin !== 'code') assumed[spec.key] = true;
    if (min.drawn && min.origin === 'unread') unread[spec.key] = true;
    if (!min.drawn) undrawn[spec.key] = true;
    if (all.some((i) => i.drawn && i.origin !== 'code' && i.winner.kind === 'none')) assumedKept[spec.key] = true;
    // A fontdict= the check cannot see into is raised only where it falls short (readabilityPyFix.ts).
    if (all.some((i) => i.drawn && i.origin === 'unread' && i.winner.kind === 'kwarg')) floorWhenShort[spec.key] = true;
    if (m.scan.unknownStyle !== null && min.drawn && !min.explicit) assumed[spec.key] = true;
    baseSlope[spec.key] = min.slope;
    if (min.slope > 0 && min.fontFrom !== null) sources.add(min.fontFrom);
    if (min.explicit) { overrides[spec.key] = min.pt; overrideCoversAll[spec.key] = true; }
    if (m.scan.earlierFix.some((f) => f.cls === spec.key && f.pt === min.pt)) raisedByFix[spec.key] = true;
  }
  // The one-number advice edits ONE font.size: the user's own literal, or
  // matplotlib's default when the code sets none. Classes that follow
  // another setting (a seaborn context, a later font.size) withhold it.
  let ownBase: number | null = null;
  if (sources.size === 1) {
    const from = [...sources][0]!;
    if (from === -1) ownBase = PY_DEFAULTS.baseSize;
    else if (from >= 0) {
      const ev = m.scan.rc.find((e) => e.set['font.size']?.span?.[0] === from);
      const v = ev?.set['font.size'];
      ownBase = v?.kind === 'pt' ? v.pt : null;
    }
  }
  // Recorded for reporting only (main's reading): never applied to the scale.
  const subplots = m.scan.src.masked.match(/subplots\s*\(\s*(\d+)\s*,\s*(\d+)/);
  return {
    language: 'python',
    baseSize: ownBase ?? PY_DEFAULTS.baseSize,
    canvasWidth: m.canvas.w,
    canvasHeight: m.canvas.h,
    effectiveCanvasWidth: m.canvas.w,
    effectiveCanvasHeight: m.canvas.h,
    overrides,
    overrideCoversAll,
    raisedByFix,
    sizes,
    assumed,
    assumedKept,
    floorWhenShort,
    unread,
    undrawn,
    canvasAssumed: m.canvasWhy !== null,
    scaleUnknown: m.canvasWhy !== null && m.canvasWhy !== 'default',
    hidden,
    baseSlope,
    ownBase,
    facetRows: subplots ? parseInt(subplots[1]!, 10) : 1,
    facetCols: subplots ? parseInt(subplots[2]!, 10) : 1,
    warnings: warningsOf(m, options),
  };
}
