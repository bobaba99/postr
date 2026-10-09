/**
 * The layout grid of checker-shape-check.mts (fix 13): at each print size,
 * the original script, the corrected one, and three controls, each measured
 * at every save by truth/layout_truth.py.
 *
 *   ideal        the ORIGINAL script with the needed sizes of the LISTED
 *                classes applied at their source (truth/ideal_source.py):
 *                what the script's own layout does with that text already at
 *                its size. Not derived from the fix: legend titles, sup
 *                labels and other unlisted text keep the script's own sizes
 *                (v6.1; v6 raised legend titles as the fix does).
 *   fresh        (v6.2) the ideal with the script's own last tight_layout
 *                call (its arguments) and the subplots_adjust calls after it
 *                run again right before every save (truth/fresh_source.py):
 *                the script's own layout once it is current for the text the
 *                figure has at the save. No Postr code. Used by the stale
 *                rule; printed for every script.
 *   raised first the original with the listed sizes set as rcParams before
 *                anything is drawn (round 4); printed as a secondary row, not
 *                judged.
 *
 * Judgements, each a DEFECT beyond its tolerance (round 6; v6.1; v6.2):
 *   grid    text outside the image the save writes (Axes text: clip; every
 *           text, legends and figure texts too: cut, fix 13b review round
 *           1), over another panel, under a figure legend or suptitle, or
 *           Axes over each other: more than
 *           max(original, ideal) + LAYOUT_SLACK_IN2. The only judgement of
 *           the Axes laid out on a grid (a subplotspec, in the layout): the
 *           fix's replay may move them, and that is judged by what it does
 *           to the text (clip, cross) and the Axes (overlap), not by distance.
 *   moved   (v6.2, the relative rule) an Axes PLACED BY HAND in the original
 *           run (layout_truth.py's `placed` kinds "free": no subplotspec,
 *           add_axes, plt.axes, a cax= colorbar's Axes; "out": taken out of
 *           the layout by set_position, which in matplotlib 3.10 keeps the
 *           subplotspec and sets in_layout False; "child": an inset), judged
 *           by where it sits RELATIVE TO EVERY OTHER Axes of the figure:
 *           for each other Axes j and each edge (x0, y0, x1, y1), how far
 *           (edge of k − edge of j) in the fixed script is from the same
 *           difference in a reference run, in inches; the largest of these is
 *           the Axes' distance from that reference. A DEFECT when it is more
 *           than HAND_SLACK_IN from BOTH the original and the ideal. A fixed
 *           script that draws a different number of Axes than the original is
 *           a defect here too. Why relative: a hand-placed Axes is placed in
 *           relation to the figure's other Axes (a colorbar beside its panel,
 *           an inset over it). v6.1 measured its absolute position against
 *           the original, so (independent check of v6.1, finding 1) a cax
 *           placed from a panel's position that the replay leaves behind
 *           when it moves the panel (a01) and a zoom inset placed from its
 *           panel that ends up poking out of it (a02) passed, while an Axes
 *           set_position put back at its own grid place, which moves with the
 *           grid exactly as in the ideal (f21), was flagged. Why both
 *           references: the original is where the script put it; the ideal is
 *           where the script's own code puts it with the text at its size
 *           (a01's cax follows the ideal's panel). Why HAND_SLACK_IN = 0.05 in:
 *           MEASURED on the round 7 shape (fix13-wt, readability.ts
 *           426feb348346) with this rule, over the 18 hand-placed Axes × print
 *           sizes of the grid (9 scripts), every one that is not a01's or
 *           a02's is at most 0.006 in from the nearer reference (k39 at 4 × 3
 *           in; the other 13 are 0.000), and a01 and a02 are at least 0.222 in
 *           from both (a02 at 4 × 3 in; fix13-out/harness-v6-2 notes);
 *           and a rounding bound: layout_truth.py rounds each box edge to
 *           0.001 in, and the distance combines four rounded edges, so
 *           rounding alone moves it at most 4 × 0.0005 = 0.002 in. 0.05 in is
 *           8 × the largest value measured where nothing moved and under a
 *           quarter of the smallest one where something did.
 *           Blind: an Axes placed by hand that is the figure's ONLY Axes has
 *           no other Axes to be relative to, so this rule cannot see it move
 *           (no fixture has one). The absolute move from the original is
 *           printed beside it, not judged.
 *   stale   (v6.1, the criterion measured, not a list; the bound v6.2) a
 *           save whose figure, in the ORIGINAL run, changed after its own
 *           last tight_layout call (the script's, or a library's it calls):
 *           resized, or a title, axis label, legend text or title, suptitle,
 *           sup label or figure text added, removed or changed (in its text
 *           or size), at the save or per animation frame (layout_truth.py's
 *           `stale`; tick labels, which follow the data, aside; a layout
 *           engine runs again at every draw and is never stale). There the
 *           fix must not clip or cross more than max(original, fresh) +
 *           LAYOUT_SLACK_IN2, per metric (clip_in2, cross_in2) and per save:
 *           the fix may bring the stale layout up to date (round 6, R6C-05),
 *           and the fresh control is what the script's own layout costs once
 *           it is current; more than both is the fix's own doing. The ideal is
 *           no measure here: it keeps the stale layout. (v6.1's bound,
 *           original + slack whatever the controls do, could not always be
 *           met: k32 and k24 at 4 × 3 in equal the fresh control; the
 *           independent check of v6.1, finding 2.)
 *   ticks   tick labels of one Axis over each other (ink): more than
 *           max(original, ideal) + TICK_SLACK_IN2, at each save and for each
 *           figure left open after the script, displayed or saved again in
 *           the same Python (R6M-03, R6M-04)
 *   saves   (v6.1) the fixed script reaches Figure.savefig fewer times than
 *           the original: the save-by-save comparison above would otherwise
 *           miss what went missing (the shape check compares the files by
 *           name and their pages, v6.2)
 * Printed, not judged: IDEAL SHORT, a listed text of the ideal control below
 * its need at a save (the control's own limit, see ideal_source.py).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Found } from './known.mts';
import { runProcess, runTruth } from './python.mts';

export const LAYOUT_SLACK_IN2 = 0.05;
/** How far an Axes placed by hand may sit, relative to the other Axes, from the nearer reference (v6.2; see the header). */
export const HAND_SLACK_IN = 0.05;
export const TICK_SLACK_IN2 = 0.005;
const METRICS = ['clip_in2', 'cut_in2', 'cross_in2', 'figleg_in2', 'overlap_in2'] as const;
const STALE_METRICS = ['clip_in2', 'cross_in2'] as const;
const HAND = new Set(['out', 'free', 'child']);

/** [kind, x0, y0, x1, y1] in inches; a child adds [parent, fx0, fy0, fx1, fy1, parent w, parent h]. */
type Placed = [string, ...number[]];
type Save = Record<(typeof METRICS)[number], number> & {
  tick_in2: number; tick_box_in2: number; axes: number[][]; sizes: Record<string, number>;
  placed: Placed[]; stale: boolean; stale_why: string | null;
};
type After = Save & { fig: number; how: 'display' | 'resave' };
type Layout = { error: string | null; saves: Save[]; after: After[]; after_error: string | null };
export type Page = { fix: string; need: Record<string, number> };

const NONE: Save = { clip_in2: 0, cut_in2: 0, cross_in2: 0, figleg_in2: 0, overlap_in2: 0, tick_in2: 0, tick_box_in2: 0, axes: [], sizes: {}, placed: [], stale: false, stale_why: null };
const EDGES = [1, 2, 3, 4] as const;

/**
 * How far the fixed script moved Axes `k` in absolute terms, placed by hand
 * in the original (`o`), in inches: its box for "free" and "out", its box in
 * the parent's Axes fraction times the original parent's size for a "child".
 * Printed only (v6.2: the relative rule judges).
 */
function handMove(o: Placed, f: Placed): number {
  if (o[0] !== 'child' || f[0] !== 'child') return Math.max(...EDGES.map((c) => Math.abs((o[c] as number) - (f[c] as number))));
  const [w, h] = [o[10] as number, o[11] as number];
  return Math.max(...[6, 8].map((c) => Math.abs((o[c] as number) - (f[c] as number)) * w), ...[7, 9].map((c) => Math.abs((o[c] as number) - (f[c] as number)) * h));
}

/**
 * Where Axes `k` sits relative to every other Axes in `got`, against the same
 * in `ref` (same Axes count), in inches: the largest, over the other Axes j
 * and the four edges, of |(got[k] − got[j]) − (ref[k] − ref[j])|. 0 when the
 * figure has no other Axes (blind, see the header).
 */
export function relMove(got: Placed[], ref: Placed[], k: number): number {
  return Math.max(0, ...got.map((q, j) => (j === k ? 0 : Math.max(...EDGES.map((c) =>
    Math.abs(((got[k]![c] as number) - (q[c] as number)) - ((ref[k]![c] as number) - (ref[j]![c] as number))))))));
}

const row = (l: Layout) => l.saves.map((s) => `${s.clip_in2} · ${s.cut_in2} · ${s.cross_in2} · ${s.figleg_in2} · ${s.overlap_in2} · ${s.tick_in2}`).join(' | ');

export type LayoutPaths = { layoutTruth: string; idealSource: string; freshSource: string; out: string };

export type LayoutResult = { id: string; found: Found[]; lines: string[]; skipped?: string };

/** One script at one print size, through the grid. `fail` ends the run as an instrument error. */
export async function checkLayout(file: string, outDir: string, got: Page, paths: LayoutPaths,
  fail: (why: string) => never): Promise<LayoutResult> {
  const id = path.basename(file, '.py');
  const code = fs.readFileSync(file, 'utf8');
  const { fix, need } = got;
  if (fix === code) return { id, found: [], lines: [], skipped: 'no fix offered' };
  const fixedPath = path.join(outDir, `${id}.layout.py`);
  fs.writeFileSync(fixedPath, fix);
  // The raise-first control (round 4): the sizes as rcParams before anything is drawn.
  const rc: Record<string, number> = {};
  if (need.plotTitle) rc['axes.titlesize'] = need.plotTitle;
  if (need.axisTitle) rc['axes.labelsize'] = need.axisTitle;
  if (need.axisText) Object.assign(rc, { 'xtick.labelsize': need.axisText, 'ytick.labelsize': need.axisText });
  if (need.legendText) rc['legend.fontsize'] = need.legendText;
  const controlPath = path.join(outDir, `${id}.control.py`);
  fs.writeFileSync(controlPath, `import matplotlib as _control_mpl\n_control_mpl.rcParams.update(${JSON.stringify(rc)})\n${code}`);
  const idealPath = path.join(outDir, `${id}.ideal.py`);
  const made = await runProcess([paths.idealSource, file, JSON.stringify(need), idealPath], paths.out);
  if (made.code !== 0) fail(`the ideal control of ${id} could not be written: ${made.stderr.trim().split('\n').pop()}`);
  // The fresh-layout control (v6.2): the ideal, its own layout run again at every save.
  const freshPath = path.join(outDir, `${id}.fresh.py`);
  const madeFresh = await runProcess([paths.freshSource, idealPath, freshPath], paths.out);
  if (madeFresh.code !== 0) fail(`the fresh-layout control of ${id} could not be written: ${madeFresh.stderr.trim().split('\n').pop()}`);
  const [orig, fixed, control, ideal, fresh] = await Promise.all([file, fixedPath, controlPath, idealPath, freshPath]
    .map((p) => runTruth<Layout>([paths.layoutTruth, p], paths.out)));
  if (!orig || orig.error) fail(`the original ${id} does not run under the layout grid: ${orig?.error ?? 'no output'}`);
  if (!fixed || fixed.error) {
    return { id, found: [{ judgement: 'crash', tag: 'CRASH', text: `CRASH ${fixed?.error ?? 'no output'}` }], lines: [] };
  }
  if (!control || control.error) fail(`the raise-first control of ${id} does not run: ${control?.error ?? 'no output'}`);
  if (!ideal || ideal.error) fail(`the ideal control of ${id} does not run: ${ideal?.error ?? 'no output'}`);
  if (!fresh || fresh.error) fail(`the fresh-layout control of ${id} does not run: ${fresh?.error ?? 'no output'}`);
  const found: Found[] = [];
  const shifts: string[] = [];
  const short: string[] = [];
  ideal.saves.forEach((s, i) => {
    for (const [cls, pt] of Object.entries(need)) {
      const got = s.sizes[cls];
      if (got !== undefined && got < pt - 1e-6) short.push(`save${i}:${cls} ${got} < ${pt}`);
    }
  });
  if (fixed.saves.length < orig.saves.length) {
    found.push({ judgement: 'saves', tag: 'SAVES layout', value: orig.saves.length - fixed.saves.length,
      text: `the fixed script reaches Figure.savefig ${fixed.saves.length} time(s), the original ${orig.saves.length}` });
  }
  const staleAt: string[] = [];
  fixed.saves.forEach((s, i) => {
    // A save the original never makes is the one the fix adds to a script
    // that saves nothing through Figure.savefig: nothing to compare it with.
    if (i >= orig.saves.length) return;
    const o = orig.saves[i]!;
    const d = ideal.saves[i] ?? NONE;
    const c = control.saves[i] ?? NONE;
    const r = fresh.saves[i] ?? NONE;
    for (const k of METRICS) {
      if (s[k] > Math.max(o[k], d[k]) + LAYOUT_SLACK_IN2) {
        found.push({ judgement: 'grid', tag: `save${i} ${k}`, value: s[k], text: `save${i} ${k} original ${o[k]}, ideal ${d[k]} (raised first ${c[k]}) -> ${s[k]}` });
      }
    }
    if (o.stale) {
      staleAt.push(`save${i} (${o.stale_why})`);
      for (const k of STALE_METRICS) {
        if (s[k] > Math.max(o[k], r[k]) + LAYOUT_SLACK_IN2) {
          found.push({ judgement: 'stale', tag: `save${i} stale ${k}`, value: s[k],
            text: `save${i} stale layout (${o.stale_why}): ${k} original ${o[k]}, fresh ${r[k]} -> ${s[k]} (ideal ${d[k]}, raised first ${c[k]})` });
        }
      }
    }
    if (s.tick_in2 > Math.max(o.tick_in2, d.tick_in2) + TICK_SLACK_IN2) {
      found.push({ judgement: 'ticks', tag: `save${i} tick_in2`, value: s.tick_in2, text: `save${i} tick labels overlap ${s.tick_in2} in² (original ${o.tick_in2}, ideal ${d.tick_in2})` });
    }
    // Axes placed by hand: where they sit relative to the other Axes (v6.2). Grid Axes: grid only.
    if (s.placed.length !== o.placed.length) {
      shifts.push(`save${i} Axes ${o.placed.length} -> ${s.placed.length}`);
      found.push({ judgement: 'moved', tag: `save${i} Axes count`, text: `save${i} the fixed script draws ${s.placed.length} Axes, the original ${o.placed.length}` });
      return;
    }
    const hand = o.placed.map((p, k) => (HAND.has(p[0]) ? k : -1)).filter((k) => k >= 0);
    const gridMoved = Math.max(0, ...o.placed.map((p, k) => (HAND.has(p[0]) ? 0 : Math.max(...EDGES.map((e) => Math.abs((p[e] as number) - (s.placed[k]![e] as number)))))));
    const sameCount = d.placed.length === o.placed.length;
    const moves = hand.map((k) => {
      const rel = relMove(s.placed, o.placed, k);
      const relIdeal = sameCount ? relMove(s.placed, d.placed, k) : Infinity;
      return { k, kind: o.placed[k]![0], abs: handMove(o.placed[k]!, s.placed[k]!), rel, relIdeal, by: Math.min(rel, relIdeal) };
    });
    shifts.push(`save${i} grid ${gridMoved.toFixed(2)}`
      + (moves.length ? `, by hand ${moves.map((m) => `${m.k}:${m.kind} abs ${m.abs.toFixed(3)} rel original ${m.rel.toFixed(3)} ideal ${Number.isFinite(m.relIdeal) ? m.relIdeal.toFixed(3) : '-'}`).join(' ')}` : ''));
    for (const m of moves) {
      if (m.by > HAND_SLACK_IN) {
        found.push({ judgement: 'moved', tag: `save${i} moved`, value: Math.round(m.by * 1000) / 1000,
          text: `save${i} Axes ${m.k} (${m.kind}, placed by hand) relative to the other Axes: ${m.rel.toFixed(3)} in off the original, ${Number.isFinite(m.relIdeal) ? `${m.relIdeal.toFixed(3)} in` : 'no Axes match'} off the ideal (absolute move ${m.abs.toFixed(3)} in)` });
      }
    }
  });
  // The figures left open after the script, displayed or saved again (R6M-03).
  const afterRows: string[] = [];
  for (const a of fixed.after) {
    const match = (l: Layout) => l.after.find((x) => x.fig === a.fig && x.how === a.how);
    const o = match(orig) ?? NONE;
    const d = match(ideal) ?? NONE;
    afterRows.push(`fig${a.fig} ${a.how} ${o.tick_in2}/${d.tick_in2}/${a.tick_in2}`);
    if (a.tick_in2 > Math.max(o.tick_in2, d.tick_in2) + TICK_SLACK_IN2) {
      found.push({ judgement: 'ticks-after', tag: `after fig${a.fig} ${a.how} tick_in2`, value: a.tick_in2,
        text: `after the script, fig ${a.fig} ${a.how === 'display' ? 'displayed' : 'saved again'}: tick labels overlap ${a.tick_in2} in² (original ${o.tick_in2}, ideal ${d.tick_in2})` });
    }
  }
  const lines = [
    `original ${row(orig)}; ideal ${row(ideal)}; fresh ${row(fresh)}; raised first ${row(control)}; fixed ${row(fixed)} (in²: clip · cut · cross · figleg · overlap · ticks); Axes moved from the original ${shifts.join(' | ')} in`
      + (afterRows.length ? `; after the end (ticks original/ideal/fixed) ${afterRows.join(', ')}` : ''),
  ];
  if (fresh.saves.length !== orig.saves.length) lines.push(`FRESH SAVES ${fresh.saves.length}, the original ${orig.saves.length} (a missing fresh save bounds the stale rule by the original alone)`);
  if (staleAt.length) lines.push(`STALE LAYOUT in the original at ${staleAt.join(', ')}`);
  if (short.length) lines.push(`IDEAL SHORT ${short.join('; ')} (the ideal control's own limit)`);
  if (fixed.after_error) lines.push(`after the end: ${fixed.after_error}`);
  return { id, found, lines };
}
