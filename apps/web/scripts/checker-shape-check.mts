/**
 * checker-shape-check.mts — does the plot checker's Python fix run, and raise
 * what it lists, on scripts shaped to break it?
 * (fix 13, docs/fixes/13-checker-reads-its-own-fix.md, step 9 rounds 1–7;
 * harness v6.1 after the independent check of v6; v6.2 after the independent
 * check of v6.1.)
 *
 * The gate (checker-truth-check.mjs) scores the checker on a corpus of
 * ordinary plotting scripts through the page. This harness is its companion
 * for the fix's SHAPE: the step 9 reviewers' break sets, each script written
 * to catch one way of inserting code into someone else's script (one-line
 * bodies, saves in a function, line continuations, receivers with commas,
 * attributes that happen to be called `savefig` or `show`, seaborn grids,
 * notebooks' show-only cells, layouts made with arguments…).
 *
 * For each script, at each print size, exactly as ReadabilityPanel's check
 * runs: parsePythonCode → computeReadability → generateTargetedFullFix (the
 * copy button's code). Then, in real matplotlib (truth/shape_truth.py): the
 * original and the corrected script, each measured at every save. Then the
 * corrected code checked again, and fixed a second time at 4 × 3 in (the
 * print size changed), and that run too.
 *
 * A DEFECT (per script and size), each tagged with the judgement that found it:
 *   NOFIX    no fix offered while the check shows a row short of its size
 *   CRASH    the corrected script raises
 *   SHORT    a listed class is drawn below the size asked for at a save
 *   LOWERED  a text is smaller than in the original
 *   FALSE GREEN  a class is SHORT and the re-check no longer lists it
 *   SECOND   the second fix raises, or leaves a listed class short
 *   WARNED   the fix warned that it could not raise the text (it turns its
 *            own failures into a warning, so the save still happens)
 *   LAYOUT WARNING  a matplotlib warning about the layout the original
 *            script never gave (the fix's replay changed the layout); every
 *            distinct warning is kept (round 6: they were cut to eight), and
 *            kept when the script ends with sys.exit (v6.1)
 *   SAVES    (v6.1; v6.2) the fixed script does not write what the
 *            original writes: fewer calls reaching Figure.savefig, a file
 *            the original writes (by its path in the run's folder) that the
 *            fixed script does not, or a file whose page count differs (a
 *            PDF's pages, an animated image's frames). v6.1 compared counts
 *            only, so a save renamed or written elsewhere with the same count
 *            passed (the independent check of v6.1, finding 3). A file only
 *            the fixed script writes is printed, not judged: the fix adds a
 *            save to a script that saves nothing through Figure.savefig
 * Not a defect, printed: classes raised that were not listed (legend titles
 * follow legend text, minor ticks follow major ones: by design).
 *
 * --layout adds the layout grid (lib/checker-shape/layout.mts) at EVERY size
 * of --sizes: round 3's layout scripts and all of rounds 4, 5 and 6. The
 * corrected script is judged against an ideal control, the original with
 * the needed sizes of the LISTED classes applied at their source
 * (truth/ideal_source.py, not derived from the fix; legend titles and sup
 * labels keep the script's sizes): text outside the figure (left and right
 * titles included, v6.1), over another panel, under a figure legend, Axes
 * over each other, or tick labels over each other, beyond max(original,
 * ideal) + a tolerance. An Axes placed by hand (add_axes, set_position, an
 * inset, a cax= colorbar) that sits, RELATIVE TO EVERY OTHER Axes, more than
 * 0.05 in from where it sits in the original AND in the ideal (v6.2; v6.1
 * measured its absolute position against the original); grid Axes by the
 * grid only. The STALE rule, for a save whose figure changed after its own
 * tight_layout call in the original run (a resize, a title, label, legend or
 * figure text added or changed, per animation frame too; measured by
 * layout_truth.py, not a list): more clipped or crossed than max(original,
 * FRESH) + 0.05 in², per metric, where FRESH is the ideal with the script's
 * own last tight_layout and the subplots_adjust calls after it run again at
 * every save (truth/fresh_source.py, no Postr code; v6.2: v6.1 bounded by
 * the original alone, which a current layout cannot always meet). The
 * figures left open after the script, displayed or saved again in the same
 * Python (the tick labels only). Fewer saves than the original. The round-4
 * raise-first control is printed beside them. The rules and their numbers
 * are in lib/checker-shape/layout.mts.
 *
 * One Python, several scripts (lib/checker-shape/sameProcess.mts and
 * fixtures/checker-shapes/same-process): two fixed scripts saved each at its
 * own sizes whichever need is bigger, and matplotlib's defaults back after
 * them; then chains of scripts (a context lowering sizes after a figure, a
 * style, a decorator, a key set to exactly the need, an unfixed script
 * between two fixed ones, a falling need), judged against the same chain
 * unfixed, and each later script's printed sizes against the same script
 * fixed and run alone (v6.1: lower, or more than 1 pt higher).
 *
 * KNOWN (lib/checker-shape/known.mts): reported, not counted, each keyed by
 * script and size with the figure it had; one more than 1.5 × worse is a
 * DEFECT (KNOWN WORSE). Staleness per tag (v6.2): an entry none of whose
 * tags fires (known or worse) is STALE KNOWN, and a tag that no longer fires
 * in an entry where another still does is STALE TAG; either fails the run,
 * so the list cannot go stale. At the end, per judgement, the fixtures it
 * flagged.
 *
 * Blind spot, from the instrument: a figure printed through its canvas
 * (fig.canvas.print_figure) never reaches Figure.savefig, so shape_truth.py
 * measures it at the end of the run (n08). The re-check withholds its credit
 * for such a script, which this harness prints as "re-check still lists".
 *
 * RUN (from apps/web; python3 with matplotlib, numpy, pandas, seaborn)
 *   npx tsx scripts/checker-shape-check.mts
 *   npx tsx scripts/checker-shape-check.mts --sets round6 --sizes 6x4.5 --layout
 *   npx tsx scripts/checker-shape-check.mts --only n17_tight_pad_grid,b26_comma_in_receiver
 *   npx tsx scripts/checker-shape-check.mts --dir <a folder of other scripts> --layout
 *   --no-same-process skips the chains; --known-selftest halves every KNOWN
 *   figure, so each known failure with a figure must come out KNOWN WORSE
 *   (the ceiling's positive control)
 *   env CHECKER_SRC (the tree whose readability.ts and readabilityFullFix.ts
 *   are tested; POSTR_REPO is the same; default this one: the fixtures and
 *   instruments always come from this harness), PY (default python3),
 *   JOBS (Python runs at once; default CPUs − 2), OUT_DIR (default
 *   <tmp>/postr-checker-shape-check), POSTR_MUTANT=<spec>#<name> (that
 *   mutant of the checker's two modules), PY_TIMEOUT_MS (one Python run's
 *   limit; default 180000)
 * TEMPORARY FOLDERS (v6.1): every Python run gets TMPDIR = one folder of this
 *   run, <os tmp>/postr-shape-run-XXXXXX, removed at the end, on an
 *   instrument error and on SIGINT / SIGTERM; the instruments remove their
 *   own (postr_shape_truth_*, postr_layout_truth_*, postr_same_process_*) at
 *   exit. OUT_DIR is the run's output and stays.
 * EXIT 0 no defect beyond KNOWN · 1 a defect, a STALE KNOWN or a STALE TAG ·
 *      2 the instrument failed (an original script or a control does not run,
 *      python or a set is missing, or a Python run was killed at the
 *      timeout: TIMEOUT, never a CRASH defect)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KNOWN, KNOWN_CEILING, sortFound, type Found } from './lib/checker-shape/known.mts';
import { checkLayout, type LayoutResult } from './lib/checker-shape/layout.mts';
import { PY, cleanUp, onTimeout, runTruth } from './lib/checker-shape/python.mts';
import { checkScenario, loadScenarios, pyLiteral, type ScenarioResult } from './lib/checker-shape/sameProcess.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.CHECKER_SRC ?? process.env.POSTR_REPO ?? path.join(HERE, '../../..'));
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-checker-shape-check'));
const SETS_DIR = path.join(HERE, 'fixtures/checker-shapes');
const SAME_DIR = path.join(SETS_DIR, 'same-process');
const TRUTH = {
  shape: path.join(HERE, 'truth/shape_truth.py'),
  layout: path.join(HERE, 'truth/layout_truth.py'),
  ideal: path.join(HERE, 'truth/ideal_source.py'),
  fresh: path.join(HERE, 'truth/fresh_source.py'),
  same: path.join(HERE, 'truth/same_process_truth.py'),
};
const LAYOUT_SCRIPTS = ['n16_two_figs_mixed_layout', 'n17_tight_pad_grid', 'n18_adjust_then_tight', 'n29_tight_hpad_row',
  'n30_suptitle_tight_rect_grid', 'l01_tight_rect_fig_legend', 'l02_tight_then_adjust_suptitle'];
const LAYOUT_SETS = ['round4', 'round5', 'round6'];

function fail(why: string): never {
  console.error(`[shape-check] instrument error: ${why}`);
  cleanUp();
  process.exit(2);
}
onTimeout((what) => fail(`TIMEOUT ${what}`));
process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => fail(`stopped by ${signal}`));

const args = process.argv.slice(2);
const opt = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? null : args[at + 1] ?? fail(`--${name} needs a value`);
};
const SETS = (opt('sets') ?? 'round1,round2,round3,round4,round5,round6').split(',');
const SIZES = (opt('sizes') ?? '6x4.5,4x3').split(',').map((label) => {
  const [w, h] = label.split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) fail(`a size is W x H in inches, like 6x4.5; got "${label}"`);
  return { w: w!, h: h!, label };
});
const ONLY = opt('only')?.split(',') ?? [];
const LAYOUT = args.includes('--layout');
const SAME = !args.includes('--no-same-process');
const SELFTEST = args.includes('--known-selftest');
/** A folder of other scripts, checked instead of the sets (and, with --layout, laid out). */
const DIR = opt('dir');

if (spawnSync(PY, ['-c', 'import matplotlib, numpy, pandas, seaborn'], { encoding: 'utf8' }).status !== 0) {
  fail(`${PY} cannot import matplotlib, numpy, pandas and seaborn`);
}
if (SELFTEST) for (const k of Object.values(KNOWN)) for (const t of k.tags) if (t.figure !== null) t.figure /= 2;

const MODULES = ['readability.ts', 'readabilityFullFix.ts'];
/**
 * POSTR_MUTANT=<spec.json>#<name> (the mutants.json format): the checker's two
 * modules with that mutant's edits, written under OUT_DIR and imported from
 * there; the tree is never written. It falsifies the parts of the fix that
 * are Python, which the unit tests never run.
 */
function checkerSource(): string {
  const chosen = process.env.POSTR_MUTANT;
  if (!chosen) return REPO;
  const [specPath, name] = chosen.split('#');
  const spec = JSON.parse(fs.readFileSync(specPath!, 'utf8'));
  const mutant = spec.mutants?.[name!] ?? fail(`no mutant "${name}" in ${specPath}`);
  const texts = Object.fromEntries(MODULES.map((f) => [f, fs.readFileSync(path.join(REPO, 'apps/web/src/poster', f), 'utf8')]));
  for (const [file, from, to, times = 1] of mutant.edits as Array<[string, string, string, number?]>) {
    const f = file.replace(/^src\/poster\//, '');
    if (!MODULES.includes(f)) fail(`mutant "${name}" edits ${file}: only the checker's two modules can be served here`);
    const found = texts[f]!.split(from).length - 1;
    if (found !== times) fail(`mutant "${name}": its text is found ${found}× in ${file}, not ${times}×`);
    texts[f] = texts[f]!.split(from).join(to);
  }
  const root = path.join(OUT, `mutant-${name}`);
  fs.mkdirSync(path.join(root, 'apps/web/src/poster'), { recursive: true });
  for (const f of MODULES) fs.writeFileSync(path.join(root, 'apps/web/src/poster', f), texts[f]!);
  console.log(`[shape-check] mutant ${name}: ${mutant.undoes ?? ''}`);
  return root;
}
fs.mkdirSync(OUT, { recursive: true });
const SOURCE = checkerSource();
const moduleHash = MODULES.map((f) => `${f} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(SOURCE, 'apps/web/src/poster', f))).digest('hex').slice(0, 12)}`).join(', ');
const mod = await import(pathToFileURL(path.join(SOURCE, 'apps/web/src/poster/readability.ts')).href);
const full = await import(pathToFileURL(path.join(SOURCE, 'apps/web/src/poster/readabilityFullFix.ts')).href);
const KEY: Record<string, string> = { 'Plot title': 'plotTitle', 'Axis titles': 'axisTitle', 'Tick labels': 'axisText', 'Legend text': 'legendText', Caption: 'caption' };

type Truth = { ok: boolean; error?: string; figures: Array<{ sizes: Record<string, number[]> }>; warnings?: string[];
  saves?: number; saved?: Array<[string, number]> };
const truth = async (file: string): Promise<Truth> => (await runTruth<Truth>([TRUTH.shape, file], OUT)) ?? { ok: false, error: 'the instrument crashed', figures: [] };

/** What the panel hands over for `code` at a print size of w × h in. */
function page(code: string, w: number, h: number) {
  const params = mod.parsePythonCode(code, { defaultWidthIn: w, defaultHeightIn: h, defaultSizeLabel: 'print size' });
  const res = mod.computeReadability(params, h, w);
  const fix: string = res.fontSnippet ? full.generateTargetedFullFix(code, params, res.fontSnippet) : code;
  const need: Record<string, number> = {};
  for (const f of res.fontFixes) need[f.key ?? KEY[f.name]!] = f.neededPt;
  return { params, res, fix, need, scale: res.scale as number };
}
/** The copy button's code with a need handed over outright (as the panel's fontSnippet). */
function forced(code: string, need: Record<string, number>): string {
  const params = mod.parsePythonCode(code, { defaultWidthIn: 6, defaultHeightIn: 4.5, defaultSizeLabel: 'print size' });
  return full.generateTargetedFullFix(code, params, pyLiteral(need));
}

const min = (a: number[]) => (a.length ? Math.min(...a) : null);
function shortOf(t: Truth, need: Record<string, number>) {
  const out: Found[] = [];
  if (!t.ok) return out;
  t.figures.forEach((f, i) => {
    for (const [cls, sizes] of Object.entries(f.sizes)) {
      const m = min(sizes);
      if (need[cls] !== undefined && m !== null && m < need[cls]! - 1e-6) {
        out.push({ judgement: 'short', tag: `SHORT save${i}:${cls}`, value: need[cls]! - m, text: `save${i}:${cls} ${m} < ${need[cls]}` });
      }
    }
  });
  return out;
}

type ShapeResult = { id: string; found: Found[]; notes: string[] };
/** One script at one size: the defects found, and what is printed beside them. */
async function checkScript(file: string, w: number, h: number, outDir: string): Promise<ShapeResult> {
  const id = path.basename(file, '.py');
  const code = fs.readFileSync(file, 'utf8');
  const first = page(code, w, h);
  const tO = await truth(file);
  if (!tO.ok) fail(`the original ${id} does not run: ${tO.error}`);
  // No fix offered: right when every row passes, a defect when one does not.
  if (first.fix === code) {
    const failing = (first.res.elements as Array<{ status: string }>).some((e) => e.status !== 'pass');
    return { id, found: failing ? [{ judgement: 'nofix', tag: 'NOFIX', text: 'NOFIX' }] : [], notes: failing ? [] : ['every row passes: no fix needed'] };
  }
  const fixedPath = path.join(outDir, `${id}.fixed.py`);
  fs.writeFileSync(fixedPath, first.fix);
  const tF = await truth(fixedPath);
  if (!tF.ok) {
    const type = /^(\w+)/.exec(tF.error ?? '')?.[1] ?? 'Error';
    return { id, found: [{ judgement: 'crash', tag: `CRASH ${type}`, text: `CRASH ${tF.error}` }], notes: [] };
  }
  const found: Found[] = [];
  const notes: string[] = [];
  // The fix turns its own failures into a warning so that the save still
  // happens; the text it could not raise is then a defect.
  for (const w of (tF.warnings ?? []).filter((x) => /Postr could not/.test(x))) found.push({ judgement: 'warned', tag: 'WARNED', text: `WARNED ${w}` });
  // matplotlib warning about the layout that the original script never gave:
  // the fix's own layout replay changed it (R4-02). Every distinct one.
  for (const w of (tF.warnings ?? []).filter((x) => /layout/i.test(x) && !(tO.warnings ?? []).includes(x))) {
    found.push({ judgement: 'layout-warning', tag: `LAYOUT WARNING ${w}`, text: `LAYOUT WARNING ${w}` });
  }
  // What the fixed script writes against what the original writes: the
  // calls, the files by name, and each file's pages (v6.1; names v6.2).
  const savesO = tO.saves ?? 0;
  const savesF = tF.saves ?? 0;
  const filesO = new Map((tO.saved ?? []).map(([name, n]) => [name, n]));
  const filesF = new Map((tF.saved ?? []).map(([name, n]) => [name, n]));
  const missing = [...filesO.keys()].filter((name) => !filesF.has(name));
  const extra = [...filesF.keys()].filter((name) => !filesO.has(name));
  const lost: string[] = [];
  if (savesF < savesO) lost.push(`${savesF} call(s) reach Figure.savefig, the original ${savesO}`);
  if (missing.length) lost.push(`${missing.length} file(s) the original writes are not written: ${missing.join(', ')}${extra.length ? ` (the fixed script writes ${extra.join(', ')})` : ''}`);
  for (const [name, n] of filesO) {
    const got = filesF.get(name);
    if (got !== undefined && got !== n) lost.push(`${name} has ${got} page(s), the original ${n}`);
  }
  if (lost.length) found.push({ judgement: 'saves', tag: 'SAVES', value: Math.max(savesO - savesF, missing.length), text: `SAVES ${lost.join('; ')}` });
  else if (extra.length) notes.push(`writes a file the original does not (not judged): ${extra.join(', ')}`);
  const short = shortOf(tF, first.need);
  found.push(...short.map((s) => ({ ...s, text: `SHORT ${s.text}` })));
  tF.figures.forEach((fF, i) => {
    const fO = tO.figures[i];
    for (const [cls, sizes] of Object.entries(fF.sizes)) {
      const o: number[] = fO?.sizes?.[cls] ?? [];
      const drops = o.length === sizes.length ? sizes.map((s, j) => o[j]! - s) : [(min(o) ?? 0) - (min(sizes) ?? 0)];
      const drop = Math.max(0, ...drops);
      if (drop > 1e-6) found.push({ judgement: 'lowered', tag: `LOWERED save${i}:${cls}`, value: Math.round(drop * 1000) / 1000, text: `LOWERED save${i}:${cls} by ${Math.round(drop * 1000) / 1000} pt` });
      if (first.need[cls] === undefined && (min(sizes) ?? 0) > (min(o) ?? 0) + 1e-6) notes.push(`raised, not listed: save${i}:${cls} ${min(o)} -> ${min(sizes)}`);
    }
  });
  const recheck = page(first.fix, w, h);
  const falseGreen = [...new Set(short.map((s) => s.tag.split(':')[1]!))].filter((cls) => recheck.need[cls] === undefined);
  if (falseGreen.length) found.push({ judgement: 'false-green', tag: 'FALSE GREEN', text: `FALSE GREEN ${falseGreen.join(',')}` });
  if (Object.keys(recheck.need).length) notes.push(`re-check still lists ${JSON.stringify(recheck.need)}`);
  const second = page(first.fix, 4, 3);
  if (second.fix !== first.fix) {
    const f2Path = path.join(outDir, `${id}.fixed2.py`);
    fs.writeFileSync(f2Path, second.fix);
    const t2 = await truth(f2Path);
    const short2 = shortOf(t2, second.need);
    if (!t2.ok) found.push({ judgement: 'second', tag: 'SECOND crashes', text: `SECOND crashes: ${t2.error}` });
    else if (short2.length) found.push({ judgement: 'second', tag: 'SECOND short', text: `SECOND short: ${short2.map((s) => s.text).join('; ')}` });
  }
  return { id, found, notes };
}

// ── judging ──────────────────────────────────────────────────────────
let defects = 0;
let known = 0;
const knownRun = new Set<string>();
/** KNOWN key -> the indexes of its tags that fired (known or worse), v6.2. */
const knownFired = new Map<string, Set<number>>();
/** judgement -> the fixtures (id@size) it flagged; a known one marked so. */
const flagged = new Map<string, Set<string>>();
const flag = (judgement: string, where: string) => {
  if (!flagged.has(judgement)) flagged.set(judgement, new Set());
  flagged.get(judgement)!.add(where);
};
function judge(key: string, found: Found[], label: string, where: string) {
  const v = sortFound(key, found);
  if (KNOWN[key]) {
    knownRun.add(key);
    knownFired.set(key, new Set([...(knownFired.get(key) ?? []), ...v.fired]));
  }
  if (v.known.length) {
    known += 1;
    console.log(`  KNOWN   ${label} (${KNOWN[key]!.why}): ${v.known.map((f) => f.text).join('; ')}`);
    for (const f of v.known) flag(f.judgement, `${where} (known)`);
  }
  const counted = [...v.other, ...v.worse.map((f) => ({ ...f, judgement: 'known-ceiling', text: `KNOWN WORSE ${f.text} (recorded ${f.figure}, ceiling ${KNOWN_CEILING}×)` }))];
  if (counted.length) {
    defects += 1;
    console.log(`  DEFECT  ${label}: ${counted.map((f) => `[${f.judgement}] ${f.text}`).join('; ')}`);
    for (const f of counted) flag(f.judgement, where);
  }
}

// ── the shape check ──────────────────────────────────────────────────
const started = Date.now();
const runs = DIR ? [{ name: path.basename(path.resolve(DIR)), dir: path.resolve(DIR) }] : SETS.map((set) => ({ name: set, dir: path.join(SETS_DIR, set) }));
const shapeJobs = runs.flatMap(({ name: set, dir }) => {
  if (!fs.existsSync(dir)) fail(`no set ${set} at ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.py') && (!ONLY.length || ONLY.includes(f.slice(0, -3)))).sort();
  return SIZES.map(({ w, h, label }) => {
    const outDir = path.join(OUT, `${set}-${label}`);
    fs.mkdirSync(outDir, { recursive: true });
    return { set, label, w, h, files, results: Promise.all(files.map((f) => checkScript(path.join(dir, f), w, h, outDir))) };
  });
});

// ── one Python, several scripts ──────────────────────────────────────
async function exactPair(first: number, second: number) {
  const outDir = path.join(OUT, 'same-process', `exact-${first}-${second}`);
  fs.mkdirSync(outDir, { recursive: true });
  const code = fs.readFileSync(path.join(SAME_DIR, 'N_labels_small.py'), 'utf8');
  const files = [first, second].map((need, i) => {
    const file = path.join(outDir, `${i}-need${need}.py`);
    fs.writeFileSync(file, forced(code, { axisTitle: need }));
    return file;
  });
  const r = await runTruth<{ saves: number[][]; rc_after: Record<string, unknown> }>([TRUTH.same, ...files], OUT);
  return { first, second, r };
}
const sameJobs = SAME && !DIR ? {
  exact: Promise.all([exactPair(17, 25), exactPair(25, 17)]),
  chains: Promise.all(loadScenarios(SAME_DIR).map((sc) => checkScenario(sc, SAME_DIR, path.join(OUT, 'same-process'), OUT, TRUTH.same,
    { page: (code, w, h) => page(code, w, h), forced }, fail))),
} : null;

// ── the layout grid ──────────────────────────────────────────────────
const scriptsIn = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith('.py')).sort().map((f) => path.join(dir, f));
const layoutTargets = !LAYOUT ? [] : (DIR ? scriptsIn(path.resolve(DIR))
  : [...LAYOUT_SCRIPTS.map((id) => path.join(SETS_DIR, 'round3', `${id}.py`)), ...LAYOUT_SETS.flatMap((s) => scriptsIn(path.join(SETS_DIR, s)))])
  .filter((f) => !ONLY.length || ONLY.includes(path.basename(f, '.py')));
const layoutJobs = SIZES.map(({ w, h, label }) => {
  const outDir = path.join(OUT, `layout-${label}`);
  fs.mkdirSync(outDir, { recursive: true });
  return { label, w, h, results: Promise.all(layoutTargets.map((file) => checkLayout(file, outDir,
    page(fs.readFileSync(file, 'utf8'), w, h), { layoutTruth: TRUTH.layout, idealSource: TRUTH.ideal, freshSource: TRUTH.fresh, out: OUT }, fail))) };
});

// ── printing, in order ───────────────────────────────────────────────
for (const job of shapeJobs) {
  console.log(`${job.set} at ${job.w} × ${job.h} in (${job.files.length} scripts)`);
  let clean = 0;
  for (const r of await job.results) {
    judge(`${r.id}@${job.label}`, r.found, r.id, `${r.id}@${job.label}`);
    if (!r.found.length) clean += 1;
    for (const n of r.notes) console.log(`          ${r.id}: ${n}`);
  }
  console.log(`  ${clean} of ${job.files.length} clean`);
}
if (sameJobs) {
  const defaults = { 'axes.titlesize': 'large', 'axes.labelsize': 'medium', 'xtick.labelsize': 'medium', 'ytick.labelsize': 'medium', 'legend.fontsize': 'medium', 'legend.title_fontsize': null };
  for (const { first, second, r } of await sameJobs.exact) {
    if (!r) fail('same_process_truth.py gave no result');
    console.log(`same Python, two fixed scripts (need ${first}, then ${second}): axis titles at each save ${JSON.stringify(r.saves)}; rcParams after them ${JSON.stringify(r.rc_after)}`);
    const found: Found[] = [];
    if (JSON.stringify(r.saves) !== JSON.stringify([[first], [second]])) found.push({ judgement: 'same-process', tag: 'SAVED', text: `saved at ${JSON.stringify(r.saves)}` });
    // The scripts set no rcParams of their own: after them, matplotlib's defaults are back (R5-01).
    if (JSON.stringify(r.rc_after) !== JSON.stringify(defaults)) found.push({ judgement: 'same-process', tag: 'RC LEFT', text: `rcParams left at ${JSON.stringify(r.rc_after)}` });
    judge(`same-process@${first}-${second}`, found, `two fixed scripts in one Python (need ${first}, then ${second})`, `exact ${first}-${second}`);
  }
  for (const r of (await sameJobs.chains) as ScenarioResult[]) {
    console.log(`same Python, chain ${r.name}`);
    for (const line of r.lines) console.log(`          ${line}`);
    judge(`same-process:${r.name}`, r.found, `chain ${r.name}`, r.name);
  }
}
for (const job of layoutJobs) {
  console.log(`layout grid at ${job.w} × ${job.h} in`);
  for (const r of (await job.results) as LayoutResult[]) {
    if (r.skipped) {
      console.log(`          ${r.id}: ${r.skipped}`);
      continue;
    }
    for (const line of r.lines) console.log(`          ${r.id}: ${line}`);
    judge(`${r.id}@layout@${job.label}`, r.found, `${r.id} (layout ${job.label})`, `${r.id}@${job.label}`);
  }
}
// Staleness per tag (v6.2): an entry none of whose tags fired is stale; a tag
// that did not fire where another of its entry did is a stale tag.
const staleKnown = [...knownRun].filter((key) => !knownFired.get(key)?.size);
const staleTags = [...knownRun].filter((key) => knownFired.get(key)?.size).flatMap((key) => KNOWN[key]!.tags
  .map((t, i) => ({ key, t, i })).filter(({ i }) => !knownFired.get(key)!.has(i)));
for (const key of staleKnown) console.log(`  STALE KNOWN ${key}: none of its ${KNOWN[key]!.tags.length} tag(s) fires now; take it off the KNOWN list`);
for (const { key, t } of staleTags) console.log(`  STALE TAG ${key}: ${t.match} (recorded ${t.figure}) no longer fires; take it off the entry`);
console.log('flagged, per judgement:');
for (const [judgement, where] of [...flagged.entries()].sort()) console.log(`  ${judgement} (${where.size}): ${[...where].sort().join(', ')}`);
console.log(`[shape-check] ${defects} defect(s), ${known} known, ${staleKnown.length} stale known, ${staleTags.length} stale tag(s) · ${Math.round((Date.now() - started) / 1000)} s · checker ${SOURCE} (${moduleHash}) · out ${OUT}`);
process.exit(defects || staleKnown.length || staleTags.length ? 1 : 0);
