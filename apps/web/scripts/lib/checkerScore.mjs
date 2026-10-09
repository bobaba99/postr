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
 *   Part 2 (record 13 section 10; corpus ids p2-*):
 *   VAR a size held in a name (font.size = NAME, fontsize=NAME) is not read.
 *   CTX a size set by plt.rc_context around the figure is not read (R5-13).
 *   SAVED a tight save (bbox_inches='tight') writes an image of another size
 *       than the canvas, and the poster prints that image: the verdict of
 *       each drawn element against the image savefig writes (truth `saved`),
 *       at the first check; the summary's part2.saved also gives the re-check
 *       of the corrected code against its own saved image.
 *   SNIPLOW the page's secondary advice "Or change one number: font.size = N"
 *       offers N below the font.size the figure is drawn with (matplotlib's
 *       rcParams at the save, truth `rcFontSize`).
 *   SNIPL the script with its own single literal font.size changed to N (the
 *       user doing what the advice says; the harness's snippetEdit), run in
 *       matplotlib: a class smaller at print than in the original. Scripts
 *       with no single literal font.size are not edited (counted).
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
 *   Fix 13b (record docs/fixes/13b-checker-sizes.md; the confirmer's
 *   partition, ids c-*): each of its families is a claim of its own, owning
 *   the drawn classes of its scripts (SNS-RESET, SNS-CTX, STYLE, RESET, OO,
 *   MULTI, SUPT, UNITS, NB, FIGLEVEL, TIGHT, CTL, D-LOWER), compared as W2 is.
 *   The suptitle is a plot title: the Plot title row is scored against the
 *   smallest of the Axes titles and the suptitle (truth `suptitle`).
 *   WARNED: a row the page marks as assumed (a size the code does not set,
 *   "*" in its Source cell) or a run whose scale the page marks as assumed
 *   (no canvas size, a tight save, a seaborn grid: "*" on the scale line)
 *   carries a missing-setting warning. Every false PASS is still counted (fp,
 *   rcfp); fpU and rcfpU count only those with no such warning, and NOROW is
 *   never warned. A fix may be offered with no ⚠/✗ row when a row or the
 *   scale is assumed (the script that sets what the code left out).
 *   SNIPNOOP the one-number advice is offered, the user does what it says,
 *       and no class below its minimum before the edit meets it after.
 *   CUT (fix 13b review round 1) a text more than half inside the original's
 *       image is more than half outside the corrected script's (truth
 *       `texts`), per run with a fix that runs, where the original's image is
 *       a crop (tight save, notebook display); from a canvas it is INFO,
 *       CUT-plain (text grown past a canvas with no layout call). Both on GATE.
 *   EDIMG the editor's Figure › Check against an image block holding the
 *       PNG the script saves (manifest `editorImage`), with each caption
 *       position: the real print is the saved image's size × the scale of
 *       the picture the block draws (its box read from the DOM, object-fit
 *       contain); a row ✓ whose real print is below its minimum, or the
 *       panel's scale off the drawn picture's by more than 0.005.
 *
 * GATE line (whole corpus, page entry) starts `GATE fp= rcfp= L= run=`, the
 *   four numbers a fix commit is compared with main on: fp = first-check
 *   drawn elements passed while real is ✗/⚠, plus drawn classes with no
 *   row; rcfp = the same at the re-check of the corrected code; L = lowered
 *   element-runs; run = runs whose corrected code raises; cut = runs whose
 *   corrected code's image cuts a text the original's cropped image holds
 *   (CUT, fix 13b review round 1; cutPlain the same from a canvas, INFO).
 *   Then the false
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
const INFO = new Set(['P', 'R2', 'AXTEXT', 'TIGHT', 'TIGHT-fix', 'SHOWSAVE', 'CUT-plain']);
/** Claims counted per run (or per check); every other claim counts element-runs. */
const UNIT = {
  W1: 'runs with a fix', W1p: 'runs whose corrected code passes in real matplotlib', F: 'runs with a fix', P: 'runs',
  R2: 'runs with a fix', W1e: 'editor runs with a fix', 'G-scale': 'runs', CANVAS: 'runs whose canvas is not a literal figsize',
  RUN: 'runs with a fix', L: 'drawn element-runs whose corrected code runs', AXTEXT: 'runs whose final figure draws a legend title or Axes text',
  TIGHT: 'first checks of a script saved with bbox_inches=tight', 'TIGHT-fix': 're-checks of corrected code saved with bbox_inches=tight',
  SHOWSAVE: 'runs with a fix whose corrected code calls show()', NOROW: 'drawn element-checks (first checks and re-checks)',
  SNIPLOW: 'runs offering "Or change one number: font.size"', SNIPL: 'drawn element-runs after the font.size edit',
  SNIPNOOP: 'runs whose font.size edit was run', EDIMG: 'editor checks against an image block',
  CUT: 'runs with a fix whose corrected code runs, the original\'s image a crop', 'CUT-plain': 'runs with a fix whose corrected code runs, the original\'s image its canvas' };
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
  // Fix 13b: with no ⚠/✗ row, a fix may still be offered when a row or the
  // scale is assumed: the script that sets what the code leaves out.
  const assumedAny = rep.scaleAssumed || rep.rows.some((x) => x.assumed);
  const listed = rep.hasCopy ? [...(fix.length || (!red.length && assumedAny) ? [] : ['a fix is offered with an empty fix list']),
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
    const base = row ? { key, name, checkerSrc: row.sourcePt, checkerPrint: row.printPt, min: MIN[key], checker: GLYPH[row.glyph], warned: !!(row.assumed || rep.scaleAssumed) }
      : { key, name, noRow: true, min: MIN[key] };
    if (realSrc == null) return [{ ...base, drawn: false }];
    const realPrint = realSrc * realScale;
    return [{ ...base, drawn: true, realSrc: r2(realSrc), realSrcRaw: realSrc, realPrint: r2(realPrint), real: verdict(realPrint, base.min) }];
  });
}
/**
 * The figure a truth result ends with, the suptitle folded into the plot
 * title (fix 13b). Its canvas is the image an uncropped save writes when that
 * differs from the figure by over a pixel (an explicit box: review round 1's
 * bbox_inches=poster_box); a tight save keeps the figure's (SAVED, TIGHT).
 */
const lastFig = (t) => {
  let f = t?.json?.figures?.length ? t.json.figures[t.json.figures.length - 1] : null;
  if (!f) return f;
  const sv = f.saved;
  if (sv && !sv.error && !sv.tight && (Math.abs(sv.w - f.w) > 1 / sv.dpi + 1e-9 || Math.abs(sv.h - f.h) > 1 / sv.dpi + 1e-9)) f = { ...f, w: sv.w, h: sv.h, figureCanvas: { w: f.w, h: f.h } };
  if (f.sizes?.suptitle == null) return f;
  const title = f.sizes.plotTitle == null ? f.sizes.suptitle : Math.min(f.sizes.plotTitle, f.sizes.suptitle);
  return { ...f, sizes: { ...f.sizes, plotTitle: title } };
};

/** Every claim and control, from the collected runs and the real renders (see the header). */
export function scoreRuns({ recs, missing, selftest: st, truthOrig, truthFixed, truthInline, truthSnip = {}, snipEdits = {}, manifest: MANIFEST, ids, scriptHash, instrumentHash, scope }) {
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
  const firstCheck = { runs: 0, drawn: 0, noRow: 0, wrong: 0, falsePass: 0, falsePassWarned: 0, falseFailWarn: 0, runsWithFalsePass: 0 };
  const gate = { L: 0, run: 0, fixOffered: 0, redNoFix: 0, Lcompared: 0 };
  const lRuns = { runs: 0, lowered: 0, elements: 0, worseVerdict: 0 };
  const runTypes = {};
  const controlFails = [];
  const instrument = [];
  const w1 = { runs: 0, disagree: 0, identicalToFirst: 0, recheckAllPass: 0, realAllPass: 0, elements: 0, elementsDisagree: 0, raisedElements: 0, raisedDisagree: 0, recheckFalsePass: 0, recheckFalsePassWarned: 0, recheckFalseFailWarn: 0, recheckNoRow: 0 };
  let controlElements = 0;
  let controlScales = 0;
  const w2 = { elements: 0, srcMismatch: 0, falsePass: 0, falseFailWarn: 0 };
  // Across claims: the page says "All elements pass" while the real figure
  // draws an element below its minimum (no fix is offered in that case).
  const banner = { shown: 0, realFails: 0, examples: [] };
  const rows = [];
  // Part 2: first-check false PASSes by the manifest owner of the element
  // (which cause), and against the image savefig writes (SAVED).
  const fpByOwner = {};
  const ffwByOwner = {};
  const savedGate = { drawn: 0, falsePass: 0, falsePassWarned: 0, falseFailWarn: 0, runsTight: 0, recheckDrawn: 0, recheckFalsePass: 0, recheckFalsePassWarned: 0, rechecksTight: 0 };
  const snip = { offered: 0, belowScript: 0, belowScriptSets: 0, edited: 0, notEdited: 0, lowered: 0, worse: 0, runsLowered: 0, stillBelow: 0, wasBelow: 0, noop: 0, examples: [] };
  const edImg = { runs: 0, drawn: 0, falsePass: 0, falsePassWarned: 0, falseFailWarn: 0, scaleOff: 0, examples: [] };

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
    if (r.first.hasCopy && r.unchanged) bump('W1e', true, `${r.key}: "Copy edited code" returned the script unchanged`);
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

  /**
   * EDIMG: the panel against an image block holding the script's own PNG.
   * Real print = real source pt × (drawn picture width / saved image width);
   * the picture keeps the image's aspect (object-fit contain), so the width
   * ratio is the scale.
   */
  function scoreEditorImage(r, fig) {
    const sv = fig.saved && !fig.saved.error ? fig.saved : { w: fig.w, h: fig.h };
    const realScale = r.drawnIn.w / sv.w;
    const off = Math.abs(r.first.scale - realScale) > 0.005 + 1e-9;
    edImg.runs += 1;
    if (off) edImg.scaleOff += 1;
    const els = compare(r.first, fig, { w: r.drawnIn.w * fig.w / sv.w, h: r.drawnIn.h * fig.h / sv.h });
    let fp = 0;
    for (const e of els.filter((x) => x.drawn && !x.noRow)) {
      edImg.drawn += 1;
      if (e.checker === 'pass' && e.real !== 'pass') { fp += 1; edImg.falsePass += 1; if (e.warned) edImg.falsePassWarned += 1; }
      if (e.checker !== 'pass' && e.real === 'pass') edImg.falseFailWarn += 1;
    }
    const bad = fp > 0 || off;
    bump('EDIMG', bad, bad ? `${r.key}: panel scale ${r.first.scale} vs the drawn picture's ${r2(realScale)} (${r2(r.drawnIn.w)} of ${r.block.w} in wide)${fp ? `; ${els.filter((e) => e.drawn && e.checker === 'pass' && e.real !== 'pass').map((e) => `${e.name} ✓ at ${e.checkerPrint} pt, real ${e.realPrint} pt`).join(', ')}` : ''}` : null, fp * 1000 + Math.abs(r.first.scale / realScale - 1));
    editor.push({ key: r.key, id: r.id, entry: 'editorImage', block: r.block, cap: r.cap, drawnIn: r.drawnIn, checkerScale: r.first.scale, realScale: r2(realScale), first: els });
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
    if (r.entry === 'editorImage') { scoreEditorImage(r, fig); continue; }
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
      if (e.checker === 'pass' && e.real !== 'pass') { firstCheck.falsePass += 1; if (e.warned) firstCheck.falsePassWarned += 1; }
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
    for (const e of els.filter((x) => x.drawn && !x.noRow)) {
      const own = man[e.key] ?? '-';
      if (e.checker === 'pass' && e.real !== 'pass') fpByOwner[own] = (fpByOwner[own] ?? 0) + 1;
      if (e.checker !== 'pass' && e.real === 'pass') ffwByOwner[own] = (ffwByOwner[own] ?? 0) + 1;
    }
    // SAVED (part 2, C): a tight save writes an image of another size than
    // the canvas; the poster prints that image, so its scale sets the print
    // size. The verdict against it, for every drawn element with a row.
    if (fig.saved?.tight && !fig.saved.error) {
      savedGate.runsTight += 1;
      const ss = scaleOf(r.size, fig.saved);
      row.savedScale = r2(ss);
      for (const e of els.filter((x) => x.drawn && !x.noRow)) {
        const p = e.realSrcRaw * ss;
        const v = verdict(p, e.min);
        e.savedPrint = r2(p);
        e.savedVerdict = v;
        savedGate.drawn += 1;
        const fpS = e.checker === 'pass' && v !== 'pass';
        if (fpS) { savedGate.falsePass += 1; if (e.warned) savedGate.falsePassWarned += 1; }
        if (e.checker !== 'pass' && v === 'pass') savedGate.falseFailWarn += 1;
        tally(r.id, 'SAVED', e.checker !== v, `${r.key} ${e.name}: checker ${e.checkerPrint} pt ${e.checker} (scale ${r.first.scale}), real ${e.realSrc} pt → ${r2(p)} pt ${v} on the ${r2(fig.saved.w)} × ${r2(fig.saved.h)} in image savefig writes (scale ${r2(ss)})`,
          (fpS ? 1000 : 0) + Math.abs(e.checkerPrint / p - 1));
        if (claims.SAVED && !expectOf(r.id, 'SAVED')) {
          claims.SAVED.srcDiffers ??= 0;
          if (e.checker !== v) claims.SAVED.wrongVerdict += 1;
          if (fpS) claims.SAVED.falsePass += 1;
          if (e.checker !== 'pass' && v === 'pass') claims.SAVED.falseFailWarn += 1;
        }
      }
    }
    // SNIPLOW / SNIPL (part 2, D): the secondary advice, "Or change one
    // number: font.size = N". SNIPLOW: N is below the font.size the figure is
    // drawn with (matplotlib's rcParams at the save). SNIPL: the script with
    // its own font.size number changed to N, run in matplotlib, against the
    // original, class by class at print (the pinned minimums for verdicts).
    const se = snipEdits[r.key];
    if (se) {
      snip.offered += 1;
      const below = fig.rcFontSize != null && se.n < fig.rcFontSize - 1e-9;
      if (below) { snip.belowScript += 1; if (se.sets) snip.belowScriptSets += 1; }
      row.snippet = { n: se.n, scriptFontSize: fig.rcFontSize, sets: se.sets, edited: se.edited };
      tally(r.id, 'SNIPLOW', below, below ? `${r.key}: "Or change one number: font.size = ${se.n}" where the figure is drawn at font.size ${fig.rcFontSize}${se.sets ? ' (set by the script)' : ' (the default)'}` : null, below ? fig.rcFontSize - se.n : 0);
      if (!se.edited) snip.notEdited += 1;
      else {
        const ts = truthSnip[r.key];
        const sfig = lastFig(ts);
        if (!sfig || ts.code !== 0) instrument.push(`${r.key}: the font.size-edited script did not run (${ts?.json?.error ?? ts?.stderr ?? 'no output'})`);
        else {
          snip.edited += 1;
          const sScale = scaleOf(r.size, sfig);
          let low = 0;
          let lifted = 0;
          let below = 0;
          for (const k of Object.keys(fig.sizes)) {
            if (fig.sizes[k] == null || sfig.sizes[k] == null) continue;
            const before = fig.sizes[k] * realScale;
            const after = sfig.sizes[k] * sScale;
            const lowered = after < before - 0.005;
            const min = MIN[k];
            const lost = lowered && min != null && verdict(after, min) !== verdict(before, min);
            if (lowered) { low += 1; snip.lowered += 1; (row.snippetLowered ??= []).push({ cls: k, before: r2(before), after: r2(after) }); }
            // A class below its minimum before the edit: does the edit lift it?
            if (min != null && verdict(before, min) !== 'pass') {
              snip.wasBelow += 1;
              below += 1;
              if (verdict(after, min) !== 'pass') { snip.stillBelow += 1; (row.snippetStillBelow ??= []).push({ cls: k, before: r2(before), after: r2(after) }); }
              else lifted += 1;
            }
            if (lost) snip.worse += 1;
            tally(r.id, 'SNIPL', lowered, lowered ? `${r.key} ${k}: font.size ${fig.rcFontSize} → ${se.n}: ${fig.sizes[k]} pt → ${r2(before)} pt at print, then ${sfig.sizes[k]} pt → ${r2(after)} pt${min != null ? ` (${verdict(before, min)} → ${verdict(after, min)} against ${min} pt)` : ''}` : null,
              (lost ? 1000 : 0) + before - after);
          }
          if (low) snip.runsLowered += 1;
          // SNIPNOOP: offered, done as it says, and nothing below its minimum is lifted.
          const noop = below > 0 && lifted === 0;
          if (noop) snip.noop += 1;
          tally(r.id, 'SNIPNOOP', noop, noop ? `${r.key}: font.size ${fig.rcFontSize} → ${se.n} lifts none of the ${below} classes below their minimum` : null);
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
      bump('F', true, `${r.key}: "Copy edited code" returned the script unchanged`);
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
        // CUT (crop) or CUT-plain (canvas): a text the original's image holds, cut from the corrected one's.
        const tkey = (t) => `${t[0]}\u0000${t[1]}`;
        const held = new Set((fig.texts ?? []).filter((t) => !t[2]).map(tkey));
        const lostTexts = (ffig.texts ?? []).filter((t) => t[2] && held.has(tkey(t)));
        if (lostTexts.length) row.cut = lostTexts.map((t) => `${t[0]} "${t[1]}"`);
        const claim = fig.saved?.tight ? 'CUT' : 'CUT-plain';
        tally(r.id, claim, lostTexts.length > 0, lostTexts.length ? `${r.key}: the corrected script's image cuts ${lostTexts.length} text(s) the original's holds: ${row.cut.slice(0, 4).join(', ')}` : null, lostTexts.length);
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
        // SAVED at the re-check: the corrected script's own saved image.
        if (ffig.saved?.tight && !ffig.saved.error) {
          savedGate.rechecksTight += 1;
          const fs2 = scaleOf(r.size, ffig.saved);
          for (const e of fixedEls.filter((x) => x.drawn && !x.noRow)) {
            const p = e.realSrcRaw * fs2;
            const v = verdict(p, e.min);
            e.savedPrint = r2(p);
            e.savedVerdict = v;
            savedGate.recheckDrawn += 1;
            if (e.checker === 'pass' && v !== 'pass') { savedGate.recheckFalsePass += 1; if (e.warned) savedGate.recheckFalsePassWarned += 1; }
          }
        }
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
        w1.recheckFalsePassWarned += dis.filter((e) => e.checker === 'pass' && e.warned).length;
        w1.recheckFalseFailWarn += dis.filter((e) => e.real === 'pass').length;
        const sameAsFirst = JSON.stringify(r.recheck.rows.map((x) => [x.name, x.sourcePt, x.glyph])) === JSON.stringify(r.first.rows.map((x) => [x.name, x.sourcePt, x.glyph]));
        if (sameAsFirst) w1.identicalToFirst += 1;
        if (drawn.every((e) => e.checker === 'pass') && !hidden.length) w1.recheckAllPass += 1;
        if ([...drawn, ...hidden].every((e) => e.real === 'pass')) w1.realAllPass += 1;
        if (dis.length || hidden.length) w1.disagree += 1;
        // W1p, the user's view: the corrected code passes in real matplotlib,
        // so the page should now say "Every element in the table meets its minimum". Rows for elements
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
  for (const id of ids.filter((x) => recs.some((r) => r.id === x && r.entry === 'page'))) {
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
    const p = recs.find((q) => q.entry === 'page' && q.id === r.id && q.size.w === 10 && q.size.h === 7);
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
    part2: { fpByOwner, ffwByOwner, saved: savedGate, snippet: snip, editorImage: edImg },
    gate: { fp: firstCheck.falsePass + firstCheck.noRow, rcfp: w1.recheckFalsePass + w1.recheckNoRow, L: gate.L, run: gate.run, cut: claims.CUT?.observed ?? 0, cutPlain: claims['CUT-plain']?.observed ?? 0,
      fpU: firstCheck.falsePass - firstCheck.falsePassWarned + firstCheck.noRow, rcfpU: w1.recheckFalsePass - w1.recheckFalsePassWarned + w1.recheckNoRow,
      savedFpU: savedGate.falsePass - savedGate.falsePassWarned, savedRcfp: savedGate.recheckFalsePass, savedRcfpU: savedGate.recheckFalsePass - savedGate.recheckFalsePassWarned,
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
  log(`GATE fp=${g.fp} rcfp=${g.rcfp} L=${g.L} run=${g.run} cut=${g.cut} cutPlain=${g.cutPlain} ffw=${g.ffw} rcffw=${g.rcffw} | unwarned fpU=${g.fpU} rcfpU=${g.rcfpU} | SAVED fpU=${g.savedFpU} rcfp=${g.savedRcfp} rcfpU=${g.savedRcfpU} | bases pageRuns=${g.bases.pageRuns} firstDrawn=${g.bases.firstDrawn} ` +
    `fixOffered=${g.bases.fixOffered} rechecks=${g.bases.rechecks} Lcompared=${g.bases.Lcompared} | F=${g.F.observed}/${g.F.of} redNoFix=${g.redNoFix} | ` +
    `fp=${g.parts.fpFalsePass}+${g.parts.fpNoRow} noRow, rcfp=${g.parts.rcfpFalsePass}+${g.parts.rcfpNoRow} noRow | instrument ${summary.instrument}, ${summary.scope.scripts}/${summary.scope.of} scripts × ${summary.scope.sizes.length} sizes` +
    `${exit === 2 ? ' | INVALID: this run exits 2' : ''}`);
  const p2 = summary.part2;
  if (p2) {
    log(`[part 2] first-check false PASS by cause (manifest owner): ${Object.entries(p2.fpByOwner).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} · false FAIL/WARN: ${Object.entries(p2.ffwByOwner).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    log(`[part 2] SAVED: ${p2.saved.runsTight} first checks of a tight save; against the image savefig writes, false PASS ${p2.saved.falsePass} and false FAIL/WARN ${p2.saved.falseFailWarn} of ${p2.saved.drawn} drawn elements; re-checks of a tight save ${p2.saved.rechecksTight}: re-check ✓ where the saved image prints below the minimum ${p2.saved.recheckFalsePass} of ${p2.saved.recheckDrawn}`);
    log(`[part 2] snippet "Or change one number: font.size = N": offered on ${p2.snippet.offered} runs; N below the drawn font.size on ${p2.snippet.belowScript} (${p2.snippet.belowScriptSets} where the script sets it); edited and run ${p2.snippet.edited} (not edited: ${p2.snippet.notEdited}, no single literal font.size); ${p2.snippet.runsLowered} runs lower text, ${p2.snippet.lowered} element-runs lowered, ${p2.snippet.worse} lose their verdict; of ${p2.snippet.wasBelow} element-runs below the minimum before the edit, ${p2.snippet.stillBelow} still are after it; no class lifted (SNIPNOOP) on ${p2.snippet.noop}`);
    const ei = p2.editorImage;
    if (ei?.runs) log(`[part 2] EDIMG: ${ei.runs} editor checks against an image block: panel scale off the drawn picture's on ${ei.scaleOff}; false PASS ${ei.falsePass} (warned ${ei.falsePassWarned}) and false FAIL/WARN ${ei.falseFailWarn} of ${ei.drawn} drawn elements`);
  }
  log(`[harness] exit=${exit} wrote ${resultsPath}`);
}
