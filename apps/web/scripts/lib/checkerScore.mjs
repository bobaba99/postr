/**
 * checkerScore.mjs — the scoring half of scripts/checker-truth-check.mjs
 * (plan item 13; record docs/fixes/13-checker-reads-its-own-fix.md): every
 * claim, every control and the GATE line, computed from what the harness
 * collected (the page's tables and copied code, OUT_DIR/runs) and from the
 * real renders scripts/truth/mpl_truth.py made of every original and
 * corrected script. It drives no page and runs no Python: the harness passes
 * all of that in, so this file is scoring and the report lines only.
 *
 *   scoreRuns({ recs, missing, selftest, truthOrig, truthFixed, truthInline,
 *     manifest, ids, scriptHash, instrumentHash, scope }) → { summary, rows, editor, exit }
 *   printReport(summary, exit, resultsPath): the report, on stderr
 *   SHOWS: a corrected page script matching it is also run under the
 *     inline backend by the harness (SHOWSAVE)
 *
 * VERDICTS: real print pt = real source pt × min(print W / real canvas W,
 * print H / real canvas H), object-fit contain, the rule the page states;
 * pass ≥ min, warn ≥ 0.85 × min, with the minimums PINNED here (MIN: plot
 * title 18, axis titles 18, tick labels 14, legend text 14, caption 12 pt,
 * the page's values on main), never read from the page under test: a page
 * whose Min column shows anything else is an instrument error (exit 2).
 * An element is scored only where the real figure draws it.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   W1  the re-check of the checker's OWN corrected code disagrees with the
 *       real render of that code (any drawn element's verdict differs).
 *       Also reported: re-check verdicts identical to the first check;
 *       re-check all ✓ against the real render all-pass.
 *   W1p the user's view of W1: the corrected code passes every element in
 *       real matplotlib, yet the re-check page does not say "All elements
 *       pass" (any row ⚠/✗, including rows for elements the figure does
 *       not draw — claim P — which the user sees just the same).
 *   W2  a size set by a per-element rcParams key (axes.labelsize,
 *       axes.titlesize, x/ytick.labelsize, legend.fontsize; numbers or
 *       names like 'x-small') is not read: the checker's source pt differs
 *       from the drawn size. Severity: false PASS (checker ✓, real ✗/⚠).
 *   SA  the rcParams alias (`mpl.rcParams[...]`, `from matplotlib import
 *       rcParams`) is not read.
 *   SR  plt.rc('font', size=) / plt.rc('axes'|'xtick'|'ytick', ...) is not read.
 *   SK  a fontsize= keyword outside the four the parser reads
 *       (plt.xlabel/ylabel/title/xticks/yticks/legend, ax.legend,
 *       set_xticklabels, plt.setp) is not read.
 *   G   Postr's own Make-a-figure Python (charts/codegen/toPython.ts,
 *       generated live through the app's module) sets sizes and the canvas
 *       through variables, which are not read (G: elements; G-scale: the
 *       canvas, so the scale).
 *   T   tick labels that inherit font.size are scored at a size matplotlib
 *       does not draw (the 0.83 × font.size model; real is 1.0 ×).
 *   F   the corrected code, run in real matplotlib, leaves an element the
 *       panel told the user to raise below its minimum (or does not run).
 *   W1e the editor entry: the re-check of the corrected code reports a
 *       source size, for an element the fix raised, that real matplotlib
 *       does not draw.
 *   CANVAS the script's canvas is not a literal figsize=(w, h) (a bare
 *       plt.subplots(), rcParams['figure.figsize'], fig.set_size_inches,
 *       seaborn's default figure), and the checker's scale differs from
 *       the real one by more than 0.005.
 *   SK2 further keyword idioms the parser does not read: size= (the
 *       fontsize alias), fontdict={'fontsize': n}, a named size in
 *       fontsize= / labelsize= ('x-small'), legend(prop={'size': n}), and
 *       Text.set_fontsize() in a loop over tick labels.
 *   READTIME rcParams changed AFTER the figure exists: matplotlib reads
 *       some keys when the Axes is created (axis labels, tick labels) and
 *       others when the call runs (set_title, legend), and the checker's
 *       source size differs from what is drawn.
 *   L   lowering: a class the figure draws (rows or not) is smaller at
 *       print after the corrected code than before it (by > 0.005 pt).
 *   RUN the corrected code raises in real matplotlib (type recorded).
 *   NOROW a class of the checker's domain (plot title, axis titles, tick
 *       labels, legend text, caption) that the real figure draws has no row,
 *       at the first check or the re-check: the user is told nothing about
 *       it. Scoring walks these classes, not the page's rows, and counts
 *       NOROW into fp / rcfp. A table the harness cannot score is not
 *       skipped but an instrument error (exit 2): a row or fix-list item
 *       with an unknown or repeated name or an unreadable number or glyph,
 *       a Min other than the pinned one, or a fix offered with a list that
 *       is empty or does not name exactly the table's ⚠/✗ rows.
 *   INFO, not counted in the exit code (other items, or consequences):
 *   P   the table gives ⚠/✗ to an element the figure does not draw (a
 *       phantom row the fix may be unable to clear).
 *   R2  copying the corrected code a second time stacks another
 *       rcParams.update block (more blocks than after the first copy).
 *   AXTEXT text the table has no row for is below the minimum in the
 *       figure the user ends with (the corrected code's, or the
 *       original's when no fix is offered): a legend title against the
 *       page's Legend text minimum, an Axes text (ax.text, annotate,
 *       bar_label) against the smallest minimum the page shows.
 *   TIGHT / TIGHT-fix the script (TIGHT: the original, at the first check;
 *       TIGHT-fix: the corrected code, at the re-check) saves with
 *       bbox_inches='tight', and the checker's scale differs by more than
 *       0.005 from the real scale of the image savefig writes.
 *   SHOWSAVE the corrected code calls show(), and under the Jupyter
 *       inline backend (show() displays and closes every figure) its
 *       savefig writes an empty figure (0 Axes).
 *   Which element feeds which claim is set per script in
 *   fixtures/checker-corpus/manifest.json (never inferred from the checker).
 *
 * GATE line (whole corpus, page entry) starts `GATE fp= rcfp= L= run=`, the
 *   four numbers a fix commit is compared with main on: fp = first-check
 *   drawn elements passed while real is ✗/⚠, plus drawn classes with no
 *   row; rcfp = the same at the re-check of the corrected code; L = lowered
 *   element-runs; run = runs whose corrected code raises. Then the false
 *   alarms, ffw = first-check elements shown ⚠/✗ while real passes and
 *   rcffw = the same at the re-check; the bases (pageRuns, firstDrawn,
 *   fixOffered, rechecks, Lcompared); F; redNoFix (runs showing a ⚠/✗ row
 *   with no fix offered); fp's and rcfp's parts; the instrument hash
 *   (harness, lib, runner, corpus) and the scope (scripts and sizes
 *   scored): numbers compare only at the same hash and the same scope.
 *   The first four alone CAN look better for the wrong reason (a commit
 *   that stops offering fixes, or fails what it cannot read): ffw/rcffw,
 *   the bases, F and redNoFix show it, so compare them too.
 *
 * CONTROLS (a failure means the instrument is not trustworthy: exit 2)
 *   K-truth  mpl_truth.py --selftest: known sizes read back exactly, each
 *            smallest one where a partial reader would miss it (y axis,
 *            left title, figure legend; legend titles and Axes texts too);
 *            axis('off') hides axis labels and ticks; show() keeps the
 *            current figure; reported sizes match the painted ink within
 *            3 %; a tight save writes a known canvas to the pixel; under
 *            the inline backend a save after show() is empty, before it not.
 *   C        elements whose size comes from what the checker is meant to
 *            read (plt.rcParams['font.size'] in either form, ax.set_xlabel/
 *            set_ylabel/set_title(fontsize=), ax.tick_params(labelsize=)),
 *            except inherited tick labels (claim T): the checker's source
 *            pt equals the drawn size (±0.05) and its verdict the real
 *            verdict; on every run the checker's scale equals the real one
 *            (±0.005, the page shows two decimals). Where a script's canvas
 *            is itself under test (manifest `scaleClaim`: G, CANVAS; '-'
 *            = not scored), its control elements compare source sizes only.
 *   K-known  known answers (manifest `expect`), scored by the claim's own
 *            comparison but kept out of its k of n: 0 CANVAS on ctl-default
 *            (cv-default-canvas with a literal figsize), 0 RUN on
 *            ctl-oo-figure-import (run-oo-figure plus the pyplot import),
 *            0 L on ctl-raise-only (every text below its minimum at every
 *            size), and 0 W2 / SA / SR / SK / SK2 / READTIME / AXTEXT /
 *            TIGHT, TIGHT-fix / SHOWSAVE on ctl-w2-agree / ctl-sa-agree /
 *            ctl-sr-agree / ctl-sk-agree / ctl-sk2-agree / ctl-rt-agree /
 *            ctl-axtext-large / ctl-tight-full / ctl-save-then-show (the
 *            idiom present, set so the answer is known from the script; a
 *            checker that shows ⚠/✗ for an idiom it cannot read fails
 *            its twin wherever the real size passes).
 *   K-page   every check renders a table and says "Detected: Python";
 *            the copied code equals the code shown on screen; every
 *            corpus script runs in real matplotlib.
 *
 * EXIT (returned by scoreRuns) 0 no claim observed · 1 a claim observed and
 *      every control held · 2 the self-test or a control failed, a table
 *      could not be scored, a run is missing, or the truth runner failed.
 */
import { log } from './editorHarness.mjs';

const KEY = { 'Plot title': 'plotTitle', 'Axis titles': 'axisTitle', 'Tick labels': 'axisText', 'Legend text': 'legendText', Caption: 'caption' };
const GLYPH = { '✓': 'pass', '⚠': 'warn', '✗': 'fail' };
const verdict = (pt, min) => (pt >= min - 1e-9 ? 'pass' : pt >= 0.85 * min - 1e-9 ? 'warn' : 'fail');
/**
 * The minimums every verdict is judged against, PINNED in the instrument
 * (the page's values on main: readability.ts PY_ELEMENTS). Never read from
 * the page under test, whose Min column must show exactly these (exit 2).
 */
const MIN = { plotTitle: 18, axisTitle: 18, axisText: 14, legendText: 14, caption: 12 };
const r2 = (v) => Math.round(v * 100) / 100;
/** Object-fit contain: the print scale of a canvas {w, h} in a print size. */
const scaleOf = (size, c) => Math.min(size.w / c.w, size.h / c.h);
/** Reported, not counted in the exit code. */
const INFO = new Set(['P', 'R2', 'AXTEXT', 'TIGHT', 'TIGHT-fix', 'SHOWSAVE']);
/** Claims counted per run (or per check); every other claim counts element-runs. */
const UNIT = {
  W1: 'runs with a fix', W1p: 'runs whose corrected code passes in real matplotlib', F: 'runs with a fix', P: 'runs',
  R2: 'runs with a fix', W1e: 'editor runs with a fix', 'G-scale': 'runs', CANVAS: 'runs whose canvas is not a literal figsize',
  RUN: 'runs with a fix', L: 'drawn element-runs whose corrected code runs', AXTEXT: 'runs whose final figure draws a legend title or Axes text',
  TIGHT: 'first checks of a script saved with bbox_inches=tight', 'TIGHT-fix': 're-checks of corrected code saved with bbox_inches=tight',
  SHOWSAVE: 'runs with a fix whose corrected code calls show()', NOROW: 'drawn element-checks (first checks and re-checks)' };
/** A corrected script that calls show() is also run under the inline backend (SHOWSAVE). */
export const SHOWS = /\.show\s*\(/;

/**
 * The page's rows and fix list must name the checker's classes, each once,
 * with readable numbers and glyphs, and each row must show the pinned
 * minimum. A table that offers a fix must list exactly its ⚠/✗ rows (a
 * non-empty list). Anything else means the harness cannot score what it
 * read: an instrument error (exit 2), never a row it may skip.
 */
function tableProblems(rep, where) {
  const names = rep.rows.map((x) => x.name);
  const fix = (rep.fixList ?? []).map((f) => f.name ?? null);
  const dup = (list) => list.filter((n, i) => n !== null && list.indexOf(n) !== i);
  const red = rep.rows.filter((x) => x.glyph !== '✓').map((x) => x.name);
  const listed = rep.hasCopy ? [...(fix.length ? [] : ['a fix is offered with an empty fix list']),
    ...red.filter((n) => !fix.includes(n)).map((n) => `row "${n}" is ⚠/✗ but not in the fix list`),
    ...fix.filter((n) => n !== null && KEY[n] && !red.includes(n)).map((n) => `fix-list item "${n}" is not a ⚠/✗ row`)] : [];
  return [...names.filter((n) => !KEY[n]).map((n) => `unknown row "${n}"`), ...dup(names).map((n) => `duplicate row "${n}"`),
    ...rep.rows.filter((x) => !GLYPH[x.glyph] || [x.sourcePt, x.printPt, x.minPt].some(Number.isNaN)).map((x) => `unreadable row "${x.name}"`),
    ...rep.rows.filter((x) => KEY[x.name] && !Number.isNaN(x.minPt) && x.minPt !== MIN[KEY[x.name]])
      .map((x) => `row "${x.name}" shows a minimum of ${x.minPt} pt, not the pinned ${MIN[KEY[x.name]]} pt`),
    ...fix.filter((n) => n === null).map(() => 'unparsed fix-list item'), ...fix.filter((n) => n !== null && !KEY[n]).map((n) => `unknown fix-list item "${n}"`),
    ...dup(fix).map((n) => `duplicate fix-list item "${n}"`), ...listed].map((b) => `${where}: ${b}`);
}

/**
 * Every class of the checker's domain (KEY) that has a row or that the real
 * figure draws, in row order. `drawn: false` where the figure has no such
 * text; `noRow: true` where the figure draws it and the table has no row
 * (claim NOROW). The real verdict uses the pinned minimum (MIN). `realSrcRaw`
 * is unrounded, for the ±0.05 pt source comparison (the page rounds to 0.1).
 */
function compare(rep, fig, size) {
  const realScale = scaleOf(size, fig);
  return Object.entries(KEY).flatMap(([name, key]) => {
    const row = rep.rows.find((x) => x.name === name);
    const realSrc = fig.sizes[key] ?? null;
    if (!row && realSrc == null) return [];
    const base = row ? { key, name, checkerSrc: row.sourcePt, checkerPrint: row.printPt, min: MIN[key], checker: GLYPH[row.glyph] }
      : { key, name, noRow: true, min: MIN[key] };
    if (realSrc == null) return [{ ...base, drawn: false }];
    const realPrint = realSrc * realScale;
    return [{ ...base, drawn: true, realSrc: r2(realSrc), realSrcRaw: realSrc, realPrint: r2(realPrint), real: verdict(realPrint, base.min) }];
  });
}
const lastFig = (t) => (t?.json?.figures?.length ? t.json.figures[t.json.figures.length - 1] : null);

/** Every claim and control, from the collected runs and the real renders (see the header). */
export function scoreRuns({ recs, missing, selftest: st, truthOrig, truthFixed, truthInline, manifest: MANIFEST, ids, scriptHash, instrumentHash, scope }) {
  // K-truth: the instrument's own controls, run by the harness before anything else.
  const kTruth = { ok: st.code === 0 && st.json?.ok === true, matplotlib: st.json?.matplotlib ?? null,
    checks: (st.json?.checks ?? []).map((c) => ({ name: c.name, ok: c.ok, expected: c.name.startsWith('known') ? undefined : c.expected, got: c.name.startsWith('known') ? undefined : c.got })),
    stderr: st.code === 0 ? undefined : st.stderr };

  const claims = {};
  // `weight` orders the examples, worst first: a false PASS by how far the
  // checker over-reports, otherwise by how many elements disagree.
  const bump = (c, observed, ex, weight = 0) => {
    claims[c] ??= { observed: 0, of: 0, unit: UNIT[c] ?? 'element-runs', examples: [],
      ...(UNIT[c] ? {} : { srcDiffers: 0, wrongVerdict: 0, falsePass: 0, falseFailWarn: 0 }) };
    claims[c].of += 1;
    if (observed) { claims[c].observed += 1; if (ex) claims[c].examples.push({ ex, weight }); }
  };
  // A known-answer script (manifest `expect`) is scored by the same
  // comparison, but kept out of that claim's k of n: its answer is checked
  // as a control (K-known) instead.
  const known = {};
  const expectOf = (id, c) => MANIFEST[id].expect?.[c];
  const tally = (id, c, observed, ex, weight = 0) => {
    if (!expectOf(id, c)) return bump(c, observed, ex, weight);
    const k = ((known[id] ??= {})[c] ??= { observed: 0, of: 0, examples: [] });
    k.of += 1;
    if (observed) { k.observed += 1; if (ex) k.examples.push(ex); }
  };
  // The whole corpus, page entry, every script: the GATE line's numbers.
  const firstCheck = { runs: 0, drawn: 0, noRow: 0, wrong: 0, falsePass: 0, falseFailWarn: 0, runsWithFalsePass: 0 };
  const gate = { L: 0, run: 0, fixOffered: 0, redNoFix: 0, Lcompared: 0 };
  const lRuns = { runs: 0, lowered: 0, elements: 0, worseVerdict: 0 };
  const runTypes = {};
  const controlFails = [];
  const instrument = [];
  const w1 = { runs: 0, disagree: 0, identicalToFirst: 0, recheckAllPass: 0, realAllPass: 0, elements: 0, elementsDisagree: 0, raisedElements: 0, raisedDisagree: 0, recheckFalsePass: 0, recheckFalseFailWarn: 0, recheckNoRow: 0 };
  let controlElements = 0;
  let controlScales = 0;
  const w2 = { elements: 0, srcMismatch: 0, falsePass: 0, falseFailWarn: 0 };
  // Across claims: the page says "All elements pass" while the real figure
  // draws an element below its minimum (no fix is offered in that case).
  const banner = { shown: 0, realFails: 0, examples: [] };
  const rows = [];

  /**
   * The editor's Figure tab scores at its own default block, whose size the
   * harness does not set, so only SOURCE sizes are compared there (they do
   * not depend on the block): the control elements (C), and W1e — the
   * re-check of the corrected code reads the sizes real matplotlib draws
   * for every element the fix raised.
   */
  const editor = [];
  const noRowEditor = (r, rep, f, which) => {
    for (const [name, key] of Object.entries(KEY)) {
      if (f.sizes[key] == null) continue;
      const miss = !rep.rows.some((x) => x.name === name);
      tally(r.id, 'NOROW', miss, miss ? `${r.key} ${which}: ${name} drawn at ${r2(f.sizes[key])} pt, no row` : null);
    }
  };
  function scoreEditor(r, fig, man) {
    const row = { key: r.key, id: r.id, entry: 'editor', checkerScale: r.first.scale, first: [] };
    noRowEditor(r, r.first, fig, 'first check');
    for (const x of r.first.rows) {
      const key = KEY[x.name];
      const realSrc = fig.sizes[key];
      if (realSrc == null) continue;
      row.first.push({ name: x.name, checkerSrc: x.sourcePt, realSrc: r2(realSrc) });
      if ((man[key] ?? '-') === 'C') {
        controlElements += 1;
        if (Math.abs(x.sourcePt - realSrc) > 0.05 + 1e-6) controlFails.push(`${r.key} ${x.name}: checker ${x.sourcePt} pt, real ${r2(realSrc)} pt`);
      }
    }
    if (r.first.hasCopy && r.unchanged) bump('W1e', true, `${r.key}: "Copy corrected code" returned the script unchanged`);
    if (r.first.hasCopy && !r.unchanged) {
      // As on the page: the script raising is the checker's; any other failure is the instrument's.
      const tf = truthFixed[r.key];
      const ffig = lastFig(tf);
      const ran = tf && tf.code === 0 && !!ffig;
      const raised = new Set(r.first.fixList.map((f) => KEY[f.name]));
      if (!ran && tf?.json?.ok !== false) instrument.push(`${r.key}: the truth runner failed on the corrected script (exit ${tf?.code ?? 'none'}${tf?.stderr ? `: ${tf.stderr}` : ''})`);
      if (!ran) {
        bump('W1e', true, `${r.key}: the corrected script does not run (${tf?.json?.error ?? 'no output'})`);
      } else {
        noRowEditor(r, r.recheck, ffig, 're-check');
        const off = r.recheck.rows.filter((x) => raised.has(KEY[x.name]) && ffig.sizes[KEY[x.name]] != null
          && Math.abs(x.sourcePt - ffig.sizes[KEY[x.name]]) > 0.05 + 1e-6);
        row.recheck = r.recheck.rows.map((x) => ({ name: x.name, checkerSrc: x.sourcePt, realSrc: ffig.sizes[KEY[x.name]] ?? null }));
        bump('W1e', off.length > 0, off.length && `${r.key}: re-check ${off.map((x) => `${x.name} ${x.sourcePt} pt vs real ${r2(ffig.sizes[KEY[x.name]])} pt`).join('; ')}`, off.length);
      }
    }
    editor.push(row);
  }

  for (const r of recs) {
    if (r.errors?.length) { instrument.push(`${r.key}: ${r.errors.join('; ')}`); continue; }
    const tOrig = truthOrig[r.id];
    const fig = lastFig(tOrig);
    if (!fig || tOrig.code !== 0) { instrument.push(`${r.key}: the original script did not run in real matplotlib (${tOrig?.json?.error ?? tOrig?.stderr})`); continue; }
    const man = MANIFEST[r.id].elements;
    if (r.codeHash && r.codeHash !== scriptHash(r.id)) instrument.push(`${r.key}: the script scored is not the script checked`);
    const bad = [...tableProblems(r.first, `${r.key} first check`), ...(r.recheck ? tableProblems(r.recheck, `${r.key} re-check`) : [])];
    if (bad.length) { instrument.push(...bad); continue; }
    if (r.entry === 'editor') { scoreEditor(r, fig, man); continue; }
    const realScale = scaleOf(r.size, fig);
    const scaleOk = Math.abs(r.first.scale - realScale) <= 0.005 + 1e-9;
    const scaleEx = `${r.key}: checker scale ${r.first.scale} vs real ${r2(realScale)} (canvas ${r2(fig.w)} × ${r2(fig.h)} in)`;
    const scaleOwner = MANIFEST[r.id].scaleClaim ?? 'C';
    if (scaleOwner === 'C') {
      controlScales += 1;
      if (!scaleOk) controlFails.push(scaleEx);
    } else if (scaleOwner !== '-') {
      tally(r.id, scaleOwner === 'G' ? 'G-scale' : scaleOwner, !scaleOk, scaleOk ? null : scaleEx, Math.abs(r.first.scale / realScale - 1));
    }
    // K-known: the literal-figsize twin of a CANVAS script, by the same comparison.
    if (expectOf(r.id, 'CANVAS') && scaleOwner !== 'CANVAS') tally(r.id, 'CANVAS', !scaleOk, scaleOk ? null : scaleEx);
    // TIGHT (INFO): the image savefig writes is cropped, so its scale is not the canvas's.
    const tightCheck = (claim, checkerScale, f) => {
      const sv = f.saved;
      if (sv?.error) instrument.push(`${r.key}: the saved canvas was not measured (${sv.error})`);
      if (!sv?.tight || sv.error) return;
      const t = scaleOf(r.size, sv);
      const off = Math.abs(checkerScale - t) > 0.005 + 1e-9;
      tally(r.id, claim, off, off ? `${r.key}: checker scale ${checkerScale}; real ${r2(scaleOf(r.size, f))} on the ${r2(f.w)} × ${r2(f.h)} in canvas, ${r2(t)} on the ${r2(sv.w)} × ${r2(sv.h)} in image savefig writes` : null,
        Math.abs(checkerScale / t - 1));
    };
    tightCheck('TIGHT', r.first.scale, fig);
    const els = compare(r.first, fig, r.size);
    const row = { key: r.key, id: r.id, size: r.size, checkerScale: r.first.scale, realScale: r2(realScale), saved: fig.saved ?? null, first: els };

    firstCheck.runs += 1;
    if (r.first.hasCopy) gate.fixOffered += 1;
    else if (r.first.rows.some((x) => x.glyph !== '✓')) gate.redNoFix += 1;
    if (els.some((e) => e.drawn && (e.noRow || (e.checker === 'pass' && e.real !== 'pass')))) firstCheck.runsWithFalsePass += 1;
    for (const e of els.filter((x) => x.drawn)) {
      firstCheck.drawn += 1;
      // NOROW: the figure draws it and the table says nothing (counted in fp).
      tally(r.id, 'NOROW', !!e.noRow, e.noRow ? `${r.key} first check: ${e.name} drawn at ${e.realSrc} pt → ${e.realPrint} pt${e.real ? ` ${e.real}` : ''}, no row` : null);
      if (e.noRow) { firstCheck.noRow += 1; continue; }
      if (e.checker !== e.real) firstCheck.wrong += 1;
      if (e.checker === 'pass' && e.real !== 'pass') firstCheck.falsePass += 1;
      if (e.checker !== 'pass' && e.real === 'pass') firstCheck.falseFailWarn += 1;
      const owner = man[e.key] ?? '-';
      const srcMismatch = Math.abs(e.checkerSrc - e.realSrcRaw) > 0.05 + 1e-6;
      const wrong = e.checker !== e.real;
      const ex = `${r.key} ${e.name}: checker ${e.checkerSrc} pt → ${e.checkerPrint} pt ${e.checker}, real ${e.realSrc} pt → ${e.realPrint} pt ${e.real}`;
      if (owner === 'C') {
        // Where the canvas is not a control (scaleClaim), the verdict carries
        // that claim's scale error, so a control element compares its source only.
        controlElements += 1;
        if (srcMismatch || (scaleOwner === 'C' && wrong)) controlFails.push(ex);
      } else if (owner !== '-') {
        const falsePass = e.checker === 'pass' && e.real !== 'pass';
        tally(r.id, owner, srcMismatch || wrong, ex, (falsePass ? 1000 : 0) + (wrong ? 100 : 0) + Math.abs(e.checkerPrint / e.realPrint - 1));
        const c = expectOf(r.id, owner) ? {} : claims[owner];
        if (srcMismatch) c.srcDiffers += 1;
        if (wrong) c.wrongVerdict += 1;
        if (falsePass) c.falsePass += 1;
        if (e.checker !== 'pass' && e.real === 'pass') c.falseFailWarn += 1;
        if (owner === 'W2') {
          w2.elements += 1;
          if (srcMismatch) w2.srcMismatch += 1;
          if (e.checker === 'pass' && e.real !== 'pass') w2.falsePass += 1;
          if (e.checker !== 'pass' && e.real === 'pass') w2.falseFailWarn += 1;
        }
      }
    }
    if (r.first.allPassBanner) {
      banner.shown += 1;
      const low = els.filter((e) => e.drawn && e.real && e.real !== 'pass');
      if (low.length) {
        banner.realFails += 1;
        banner.examples.push(`${r.key}: ${low.map((e) => `${e.name} ${e.noRow ? 'with no row' : `shown ${e.checkerPrint} pt`}, real ${e.realPrint} pt ${e.real}`).join(', ')}`);
      }
    }
    // P (INFO): a warning or failure on an element the figure does not draw.
    const phantom = els.filter((e) => !e.drawn && e.checker !== 'pass');
    bump('P', phantom.length > 0, phantom.length ? `${r.key}: ${phantom.map((e) => `${e.name} ${e.checkerPrint} pt ${e.checker}`).join(', ')}` : null);

    if (r.first.hasCopy && r.unchanged) {
      bump('F', true, `${r.key}: "Copy corrected code" returned the script unchanged`);
    } else if (r.first.hasCopy) {
      const tf = truthFixed[r.key];
      const ffig = lastFig(tf);
      const ran = tf && tf.code === 0 && !!ffig;
      // RUN: the script raised (the runner's exit 1). Anything else that is
      // not a clean run is the instrument's failure, never the script's.
      const raised = tf?.json?.ok === false;
      if (!ran && !raised) instrument.push(`${r.key}: the truth runner failed on the corrected script (exit ${tf?.code ?? 'none'}${tf?.stderr ? `: ${tf.stderr}` : ''})`);
      tally(r.id, 'RUN', raised, raised ? `${r.key}: ${String(tf.json.error).slice(0, 160)}` : null);
      const type = raised ? String(tf.json.error).split(':')[0] : null;
      if (raised) { gate.run += 1; runTypes[type] = (runTypes[type] ?? 0) + 1; }
      row.fixRan = ran;
      row.fixError = raised ? tf.json.error : null;
      row.fixList = r.first.fixList;
      row.copied = r.copied;
      if (!ran) {
        bump('F', true, `${r.key}: the corrected script does not run (${tf?.json?.error ?? tf?.stderr ?? 'no output'})`);
      } else {
        // L: any class the truth measures, at print, before and after the fix.
        const afterScale = scaleOf(r.size, ffig);
        // Where the class has a row, whether the lowering also costs it its verdict (the pinned minimum).
        let lowered = 0;
        let worse = 0;
        for (const k of Object.keys(fig.sizes)) {
          if (fig.sizes[k] == null || ffig.sizes[k] == null) continue;
          gate.Lcompared += 1;
          const before = fig.sizes[k] * realScale;
          const after = ffig.sizes[k] * afterScale;
          const low = after < before - 0.005;
          const min = MIN[k];
          const lost = low && min != null && verdict(after, min) !== verdict(before, min);
          if (low) { lowered += 1; (row.lowered ??= []).push({ cls: k, before: r2(before), after: r2(after) }); }
          if (lost) worse += 1;
          tally(r.id, 'L', low, low ? `${r.key} ${k}: real ${fig.sizes[k]} pt → ${r2(before)} pt before the fix, ${ffig.sizes[k]} pt → ${r2(after)} pt after${min != null ? ` (${verdict(before, min)} → ${verdict(after, min)} against ${min} pt)` : ''}` : null,
            (lost ? 1000 : 0) + before - after);
        }
        gate.L += lowered;
        if (!expectOf(r.id, 'L')) {
          lRuns.runs += 1; lRuns.lowered += lowered ? 1 : 0; lRuns.elements += lowered; lRuns.worseVerdict += worse;
        }
        tightCheck('TIGHT-fix', r.recheck.scale, ffig);
        row.savedFix = ffig.saved ?? null;
        // SHOWSAVE (INFO): the inline backend's show() closes the figure the
        // corrected code then saves.
        if (SHOWS.test(r.copied)) {
          const ti = truthInline[r.key];
          if (!ti?.json) instrument.push(`${r.key}: the inline-backend run gave no result (${ti?.stderr ?? 'no output'})`);
          const saves = (ti?.json?.figures ?? []).filter((f) => f.saved);
          const blank = saves.length > 0 && saves[saves.length - 1].axes === 0;
          row.inlineBlank = blank;
          tally(r.id, 'SHOWSAVE', blank, blank ? `${r.key}: under the inline backend its savefig writes a figure with 0 Axes (${ffig.axes} under Agg): show() closed the figure first` : null);
        }
        const raised = new Set(r.first.fixList.map((f) => KEY[f.name]).filter(Boolean));
        const fixedEls = compare(r.recheck, ffig, r.size);
        row.recheck = fixedEls;
        // F: every element the panel said to raise, drawn, passes in the real render.
        const stillLow = fixedEls.filter((e) => e.drawn && raised.has(e.key) && e.real && e.real !== 'pass');
        bump('F', stillLow.length > 0, stillLow.length ? `${r.key}: after the fix, real ${stillLow.map((e) => `${e.name} ${e.realSrc} pt → ${e.realPrint} pt ${e.real}`).join(', ')}` : null, stillLow.length);
        // W1: the re-check agrees with the real render of the same code. A
        // drawn class with no row is a disagreement of its own (NOROW, in rcfp).
        const hidden = fixedEls.filter((e) => e.drawn && e.noRow);
        for (const e of fixedEls.filter((x) => x.drawn)) tally(r.id, 'NOROW', !!e.noRow, e.noRow ? `${r.key} re-check: ${e.name} drawn at ${e.realSrc} pt → ${e.realPrint} pt${e.real ? ` ${e.real}` : ''}, no row` : null);
        const drawn = fixedEls.filter((e) => e.drawn && !e.noRow);
        const dis = drawn.filter((e) => e.checker !== e.real);
        w1.runs += 1;
        w1.recheckNoRow += hidden.length;
        w1.elements += drawn.length + hidden.length;
        w1.elementsDisagree += dis.length + hidden.length;
        w1.raisedElements += drawn.filter((e) => raised.has(e.key)).length;
        w1.raisedDisagree += dis.filter((e) => raised.has(e.key)).length;
        // The dangerous direction: the re-check says ✓ where the real render is below the minimum.
        w1.recheckFalsePass += dis.filter((e) => e.checker === 'pass').length;
        w1.recheckFalseFailWarn += dis.filter((e) => e.real === 'pass').length;
        const sameAsFirst = JSON.stringify(r.recheck.rows.map((x) => [x.name, x.sourcePt, x.glyph])) === JSON.stringify(r.first.rows.map((x) => [x.name, x.sourcePt, x.glyph]));
        if (sameAsFirst) w1.identicalToFirst += 1;
        if (drawn.every((e) => e.checker === 'pass') && !hidden.length) w1.recheckAllPass += 1;
        if ([...drawn, ...hidden].every((e) => e.real === 'pass')) w1.realAllPass += 1;
        if (dis.length || hidden.length) w1.disagree += 1;
        // W1p, the user's view: the corrected code passes in real matplotlib,
        // so the page should now say "All elements pass". Rows for elements
        // the figure does not draw count here, since the user sees them.
        if ([...drawn, ...hidden].every((e) => e.real === 'pass')) {
          const red = fixedEls.filter((e) => !e.noRow && e.checker !== 'pass');
          bump('W1p', !r.recheck.allPassBanner, r.recheck.allPassBanner ? null
            : `${r.key}: re-check shows ${red.map((e) => `${e.name} ${e.checkerPrint} pt ${e.checker}${e.drawn ? '' : ' (not drawn)'}`).join(', ')}`, red.length);
        }
        bump('W1', dis.length + hidden.length > 0, (dis.length || hidden.length) && `${r.key}: re-check ${[...dis.map((e) => `${e.name} ${e.checkerSrc} pt ${e.checker} vs real ${e.realSrc} pt → ${e.realPrint} pt ${e.real}`),
          ...hidden.map((e) => `${e.name} no row vs real ${e.realPrint} pt`)].join('; ')}`, dis.length + hidden.length);
        // R2: the second copy stacks another block on the first copy's (a
        // script may bring its own rcParams.update, so count, don't threshold).
        const nBlocks = (c) => (c.match(/rcParams\.update\(/g) ?? []).length;
        const [once, twice] = [nBlocks(r.copied), r.copied2 ? nBlocks(r.copied2) : null];
        row.updateBlocksAfterSecondCopy = twice;
        bump('R2', twice !== null && twice > once, twice !== null && twice > once ? `${r.key}: ${once} → ${twice} rcParams.update blocks from the first copy to the second` : null);
      }
    }
    // AXTEXT (INFO): text with no row, in the figure the user ends with.
    // Minimums are the pinned ones: Legend text's for a legend title, the
    // smallest of all for an Axes text.
    const endFig = !r.first.hasCopy ? fig : row.fixRan ? lastFig(truthFixed[r.key]) : null;
    if (endFig) {
      const noRow = [['legendTitle', 'Legend title', MIN.legendText], ['axesText', 'Axes text', Math.min(...Object.values(MIN))]]
        .filter(([k, , min]) => endFig.sizes[k] != null && min !== undefined);
      if (noRow.length) {
        const s = scaleOf(r.size, endFig);
        const low = noRow.filter(([k, , min]) => endFig.sizes[k] * s < min - 1e-9);
        row.noRowText = noRow.map(([k, , min]) => ({ cls: k, pt: endFig.sizes[k], print: r2(endFig.sizes[k] * s), min }));
        tally(r.id, 'AXTEXT', low.length > 0, low.length ? `${r.key}${r.first.hasCopy ? ' after the fix' : ' (no fix offered)'}: ${low.map(([k, n, min]) => `${n} ${endFig.sizes[k]} pt → ${r2(endFig.sizes[k] * s)} pt, minimum ${min} pt`).join(', ')}` : null, low.length);
      }
    }
    rows.push(row);
  }

  // K-known: each known answer holds, and was exercised at least as often as stated.
  const knownAnswers = [];
  for (const id of ids.filter((x) => recs.some((r) => r.id === x && r.entry !== 'editor'))) {
    for (const [c, want] of Object.entries(MANIFEST[id].expect ?? {})) {
      const got = known[id]?.[c] ?? { observed: 0, of: 0, examples: [] };
      const ok = got.observed === want.observed && got.of >= want.ofAtLeast;
      knownAnswers.push({ id, claim: c, observed: got.observed, of: got.of, expected: want, ok, examples: got.examples.slice(0, 3) });
      if (!ok) controlFails.push(`K-known ${id}: ${c} observed ${got.observed} of ${got.of}, expected ${want.observed} of at least ${want.ofAtLeast}${got.examples.length ? ` (${got.examples[0]})` : ''}`);
    }
  }
  const origRan = Object.values(truthOrig).filter((t) => t.code === 0 && lastFig(t)).length;

  // The editor's default block is not set by the harness. If its tables
  // equal the page's at 10 × 7 in, row for row (print sizes included), the
  // editor entry behaves as the page does at that size (INFO).
  const sameRows = (a, b) => JSON.stringify((a?.rows ?? []).map((x) => [x.name, x.sourcePt, x.printPt, x.glyph]))
    === JSON.stringify((b?.rows ?? []).map((x) => [x.name, x.sourcePt, x.printPt, x.glyph]));
  const edVsPage = recs.filter((r) => r.entry === 'editor').map((r) => {
    const p = recs.find((q) => q.entry !== 'editor' && q.id === r.id && q.size.w === 10 && q.size.h === 7);
    return { key: r.key, same: !!p && sameRows(r.first, p.first) && sameRows(r.recheck, p.recheck) && (r.copied ?? null) === (p.copied ?? null) };
  });

  const summary = {
    git: recs[0].git, src: recs[0].src, mutant: recs[0].mutant, instrument: instrumentHash, scope, matplotlib: kTruth.matplotlib, runs: recs.length,
    missingRuns: missing, kTruth: { ok: kTruth.ok, checks: kTruth.checks },
    control: { ok: controlFails.length === 0, elementRuns: controlElements, scales: controlScales, failures: controlFails },
    knownAnswers,
    kPage: { checks: recs.length, checksWithErrors: recs.filter((r) => r.errors?.length).length, originalsRun: origRan, originals: Object.keys(truthOrig).length },
    instrumentErrors: instrument,
    claims: Object.fromEntries(Object.entries(claims).map(([c, v]) => [c, {
      ...v, examples: [...v.examples].sort((a, b) => b.weight - a.weight).slice(0, 8).map((x) => x.ex) }])),
    w1, w2, allPassBanner: banner, firstCheck, loweredRuns: lRuns, runErrorTypes: runTypes,
    gate: { fp: firstCheck.falsePass + firstCheck.noRow, rcfp: w1.recheckFalsePass + w1.recheckNoRow, L: gate.L, run: gate.run,
      ffw: firstCheck.falseFailWarn, rcffw: w1.recheckFalseFailWarn,
      bases: { pageRuns: firstCheck.runs, firstDrawn: firstCheck.drawn, fixOffered: gate.fixOffered, rechecks: w1.runs, Lcompared: gate.Lcompared },
      F: { observed: claims.F?.observed ?? 0, of: claims.F?.of ?? 0 }, redNoFix: gate.redNoFix,
      parts: { fpFalsePass: firstCheck.falsePass, fpNoRow: firstCheck.noRow, rcfpFalsePass: w1.recheckFalsePass, rcfpNoRow: w1.recheckNoRow } },
    editorEqualsPage10x7: { same: edVsPage.filter((x) => x.same).length, of: edVsPage.length, differ: edVsPage.filter((x) => !x.same).map((x) => x.key) },
  };
  const exit = (!kTruth.ok || controlFails.length || instrument.length || missing.length) ? 2
    : Object.entries(summary.claims).some(([c, v]) => !INFO.has(c) && v.observed > 0) ? 1 : 0;
  return { summary, rows, editor, exit };
}

/** The report, on stderr, from the summary alone (results.json carries the same numbers). */
export function printReport(summary, exit, resultsPath) {
  const { kTruth, control, knownAnswers, kPage, instrumentErrors: instrument, missingRuns: missing, w1, w2, allPassBanner: banner, firstCheck } = summary;
  const show = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
  log(`[harness] ${summary.runs} runs on ${summary.git}${summary.mutant ? ` MUTANT ${summary.mutant}` : ''} (src ${summary.src}), matplotlib ${summary.matplotlib}`);
  log(`[K-truth] ${kTruth.ok ? 'OK' : 'FAIL'} ${kTruth.checks.map((c) => `${c.name}: ${c.ok ? 'ok' : 'FAIL'}${c.expected !== undefined ? ` (${show(c.got)} vs ${show(c.expected)})` : ''}`).join(' · ')}`);
  log(`[control C] ${control.failures.length ? `FAIL ${control.failures.length}: ${control.failures.slice(0, 6).join(' | ')}` : `OK: ${control.elementRuns} control element-runs and ${control.scales} scales match the real render`}`);
  log(`[control K-known] ${knownAnswers.every((k) => k.ok) ? 'OK' : 'FAIL'}: ${knownAnswers.map((k) => `${k.id} ${k.claim} ${k.observed} of ${k.of}${k.ok ? '' : ' FAIL'}`).join(' · ')}`);
  log(`[control K-page] ${kPage.checks - kPage.checksWithErrors} of ${kPage.checks} checks rendered a Python table and copied what was shown; ${kPage.originalsRun} of ${kPage.originals} original scripts run`);
  if (instrument.length) log(`[instrument] ${instrument.length} run(s) errored: ${instrument.slice(0, 6).join(' | ')}`);
  if (missing.length) log(`[harness] ${missing.length} run(s) not collected: ${missing.join(', ')}`);
  for (const [c, v] of Object.entries(summary.claims)) {
    const d = v.srcDiffers === undefined ? '' : ` (source differs ${v.srcDiffers}, wrong verdict ${v.wrongVerdict}, false PASS ${v.falsePass}, false FAIL/WARN ${v.falseFailWarn})`;
    log(`[${INFO.has(c) ? 'INFO ' : ''}${v.observed ? 'OBSERVED' : 'not observed'}] ${c} ${v.observed} of ${v.of} ${v.unit}${d}${v.examples.length ? `; worst: ${v.examples.slice(0, 3).join(' | ')}` : ''}`);
  }
  log(`[W1] ${w1.disagree} of ${w1.runs} re-checks disagree with the real render (elements ${w1.elementsDisagree} of ${w1.elements}; raised by the fix ${w1.raisedDisagree} of ${w1.raisedElements}); ` +
    `re-check ✓ where real is below the minimum ${w1.recheckFalsePass}, re-check ✗/⚠ where real passes ${w1.recheckFalseFailWarn}; ` +
    `re-check identical to the first check ${w1.identicalToFirst} of ${w1.runs}; re-check all ✓ ${w1.recheckAllPass} of ${w1.runs}; real render all-pass ${w1.realAllPass} of ${w1.runs}`);
  log(`[W2] elements ${w2.elements}: source differs ${w2.srcMismatch}, false PASS ${w2.falsePass}, false FAIL/WARN ${w2.falseFailWarn}`);
  if (summary.editorEqualsPage10x7.of) log(`[INFO editor] the Figure tab's first check, corrected code and re-check equal the page's at 10 × 7 in for ${summary.editorEqualsPage10x7.same} of ${summary.editorEqualsPage10x7.of} scripts`);
  log(`[all-pass banner] shown on ${banner.shown} run(s); the real figure draws an element below its minimum on ${banner.realFails} of them${banner.examples.length ? `; e.g. ${banner.examples.slice(0, 3).join(' | ')}` : ''}`);
  log(`[first check] ${firstCheck.wrong} of ${firstCheck.drawn} drawn-element verdicts wrong: false PASS ${firstCheck.falsePass}, drawn with no row ${firstCheck.noRow} (in ${firstCheck.runsWithFalsePass} of ${firstCheck.runs} runs), false FAIL/WARN ${firstCheck.falseFailWarn}`);
  log(`[L] runs with a lowered element: ${summary.loweredRuns.lowered} of ${summary.loweredRuns.runs} runs whose corrected code runs; of the ${summary.loweredRuns.elements} lowered element-runs, ${summary.loweredRuns.worseVerdict} lose their verdict (the pinned minimum) · [RUN] exception types: ${Object.entries(summary.runErrorTypes).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);
  const g = summary.gate;
  log(`GATE fp=${g.fp} rcfp=${g.rcfp} L=${g.L} run=${g.run} ffw=${g.ffw} rcffw=${g.rcffw} | bases pageRuns=${g.bases.pageRuns} firstDrawn=${g.bases.firstDrawn} ` +
    `fixOffered=${g.bases.fixOffered} rechecks=${g.bases.rechecks} Lcompared=${g.bases.Lcompared} | F=${g.F.observed}/${g.F.of} redNoFix=${g.redNoFix} | ` +
    `fp=${g.parts.fpFalsePass}+${g.parts.fpNoRow} noRow, rcfp=${g.parts.rcfpFalsePass}+${g.parts.rcfpNoRow} noRow | instrument ${summary.instrument}, ${summary.scope.scripts}/${summary.scope.of} scripts × ${summary.scope.sizes.length} sizes` +
    `${exit === 2 ? ' | INVALID: this run exits 2' : ''}`);
  log(`[harness] exit=${exit} wrote ${resultsPath}`);
}
