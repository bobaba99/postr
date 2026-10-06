#!/usr/bin/env node
/**
 * checker-truth-check.mjs — the plot checker (/tools/figure-readability)
 * against REAL matplotlib, for Python scripts (plan item 13; record
 * docs/fixes/13-checker-reads-its-own-fix.md).
 *
 * ENTRY POINT: exactly the user's. For every corpus script × print size, a
 * fresh check on the public page: type the width and height into "Printed
 * figure size" (Enter commits), paste the script into the code box, press
 * "▶ Check", read the table the page renders (source pt, print pt, min,
 * verdict per element), the scale line and the "Raise these text elements"
 * list. If the page offers "Copy edited code", press it and read what
 * it wrote to the clipboard, paste that back and press Check again, then
 * copy again if a second fix is offered. Nothing in the app is called
 * directly; the backend is faked at the network layer (lib/editorHarness.mjs).
 * A second entry point, the editor's Figure tab › "Check a figure" (the same
 * panel), runs six of the scripts at the editor's default block; its size is
 * not set by the harness, so there only source sizes are compared (W1e, C).
 *
 * TRUTH: scripts/truth/mpl_truth.py runs the ORIGINAL script and every
 * CORRECTED script in real matplotlib (Agg) and reads back the size of
 * every text element drawn, and the canvas. It also measures the legend
 * title and Axes texts (no row), the image each savefig really writes
 * (TIGHT), and, with --inline, the Jupyter inline backend (SHOWSAVE). How
 * print sizes and verdicts are derived from it: lib/checkerScore.mjs.
 *
 * SCORING: lib/checkerScore.mjs holds every claim, every control and the
 * GATE line; its header lists them. This file collects the runs (the page
 * and the editor), runs the truth (mpl_truth.py: its self-test, every
 * original, every corrected script, and the inline-backend runs SHOWSAVE
 * needs), hands both to scoreRuns() with the instrument hash (this file,
 * lib/checkerScore.mjs, lib/editorHarness.mjs, lib/mutants.mjs,
 * truth/mpl_truth.py and every file of fixtures/checker-corpus), writes
 * OUT_DIR/results.json and prints the report.
 *
 * RUN (from apps/web; 45 scripts × 4 sizes + 6 editor runs: a full collect
 * took 24-88 s and a score 9-19 s on an M4 Max, shared; --only collects in parts)
 *   node scripts/checker-truth-check.mjs                     # collect + score
 *   node scripts/checker-truth-check.mjs --phase collect --fresh --only ctl-fontsize,w2-rc-ticks
 *   node scripts/checker-truth-check.mjs --phase collect --only ...   # adds to OUT_DIR/runs
 *   node scripts/checker-truth-check.mjs --phase score
 *   options: --only id,id  --sizes 6x4.5,8x6,10x7,14x10 (default)  --fresh  --no-editor
 *   env PORT (default 5391), OUT_DIR (default <tmp>/postr-checker-truth-check),
 *       PYTHON (default python3), POSTR_REPO, POSTR_MUTANT (lib/editorHarness.mjs)
 *   Needs Python >= 3.10 (the runner uses TemporaryDirectory's
 *   ignore_cleanup_errors; 3.10.8 measured) with matplotlib (3.10.8
 *   measured), numpy, pandas (the generated script imports it), seaborn
 *   (0.13.2) and matplotlib_inline with IPython (the inline backend).
 *   Installs nothing.
 *
 * EXIT 0 no claim observed · 1 a claim observed (and every control held) ·
 *      2 a control failed, a table could not be scored, runs from
 *      different sources were mixed, python could not be run, or the
 *      harness failed: a module that does not load, a malformed manifest,
 *      an uncaught error or rejection (the exit code is 2 from the first
 *      line until scoring has finished; the modules load after that).
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json
 * (the build stamp). collect puts the file's bytes back when it ends, and so
 * does an instrument error during it; after a killed run (SIGKILL, a
 * timeout), restore it with git checkout -- apps/web/public/version.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
/** Set while collect() runs: puts version.json back (fail() calls it too). */
let restoreStamp = () => {};
/** The instrument failed: never let that read as "claim observed" (exit 1). */
const fail = (e) => {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 400)}`);
  try { restoreStamp(); } catch { /* the error above is the one to report */ }
  process.exit(2);
};
// Until score() returns its own code, any way out of this process is exit 2.
// Set BEFORE the modules and the manifest load (static imports would run
// first), so a broken import or a malformed manifest cannot exit 1 either.
process.exitCode = 2;
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(HERE, 'fixtures/checker-corpus');
let WEB, installMocks, openEditor, startHarness, SHOWS, printReport, scoreRuns, MANIFEST;
try {
  ({ WEB, installMocks, openEditor, startHarness } = await import('./lib/editorHarness.mjs'));
  ({ SHOWS, printReport, scoreRuns } = await import('./lib/checkerScore.mjs'));
  MANIFEST = JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8')).scripts;
  if (!MANIFEST || typeof MANIFEST !== 'object' || Object.values(MANIFEST).some((m) => !m?.elements)) {
    throw new Error('fixtures/checker-corpus/manifest.json: no "scripts" object, or a script without "elements"');
  }
} catch (e) {
  fail(e);
}
const TRUTH = path.join(HERE, 'truth/mpl_truth.py');
const PYTHON = process.env.PYTHON ?? 'python3';
const PORT = Number(process.env.PORT ?? 5391);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-checker-truth-check'));
process.env.OUT_DIR = OUT; // startHarness puts its Vite cache in the same folder
const RUNS = path.join(OUT, 'runs');

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.findIndex((a) => a === k || a.startsWith(`${k}=`));
  if (i < 0) return null;
  return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
};
const PHASE = opt('--phase') ?? 'all';
const ONLY = opt('--only')?.split(',').filter(Boolean) ?? null;
const SIZES = (opt('--sizes') ?? '6x4.5,8x6,10x7,14x10').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h };
});
const FRESH = argv.includes('--fresh');
/** Scripts also checked in the editor's Figure tab (--no-editor skips them). */
const EDITOR_IDS = argv.includes('--no-editor') ? [] : ['ctl-fontsize', 'ctl-explicit', 'w2-rc-ticks', 'w2-rc-fixblock', 's-alias-mpl', 's-kw-pyplot'];

const ids = Object.keys(MANIFEST).filter((id) => !ONLY || ONLY.includes(id));
if (ONLY && ids.length !== ONLY.length) fail(`unknown --only id: ${ONLY.filter((id) => !MANIFEST[id])}`);
if (!['collect', 'score', 'all'].includes(PHASE)) fail(`--phase is collect | score | all, not ${PHASE}`);
// A `generated` script is produced at collect time by the app's own module
// (so it always matches the shipped generator) and kept in OUT_DIR.
const GENERATED = path.join(OUT, 'generated');
const scriptPath = (id) => (MANIFEST[id].generated ? path.join(GENERATED, `${id}.py`) : path.join(CORPUS, `${id}.py`));
for (const id of ids) if (!MANIFEST[id].generated && !fs.existsSync(scriptPath(id))) fail(`missing fixture ${scriptPath(id)}`);

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
/** What the page is built from: runs from different sources must not be scored together. */
function sourceHash() {
  const files = ['src/poster/readability.ts', 'src/poster/readabilityFullFix.ts', 'src/poster/ReadabilityPanel.tsx',
    'src/poster/ReadabilityCodeView.tsx', 'src/pages/FigureReadability.tsx', 'src/poster/PrintSizeFields.tsx'];
  return sha(files.map((f) => fs.readFileSync(path.join(WEB, f), 'utf8')).join('\u0000'));
}
/**
 * What the INSTRUMENT is built from: this file, its lib modules, the truth
 * runner and the whole corpus (scripts and manifest). Gate numbers are only
 * comparable between runs with the same instrument hash.
 */
function instrumentHash() {
  const corpus = fs.readdirSync(CORPUS, { recursive: true })
    .filter((f) => !/(^|[\\/])(__pycache__|\.DS_Store)/.test(f) && fs.statSync(path.join(CORPUS, f)).isFile())
    .map((f) => path.join('fixtures/checker-corpus', f)).sort();
  const h = createHash('sha256');
  for (const f of ['checker-truth-check.mjs', 'lib/checkerScore.mjs', 'lib/editorHarness.mjs', 'lib/mutants.mjs', 'truth/mpl_truth.py', ...corpus]) {
    h.update(`${f}\u0000`).update(fs.readFileSync(path.join(HERE, f))).update('\u0000');
  }
  return h.digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- the page
async function setSize(page, { w, h }) {
  for (const [label, v] of [['Width', w], ['Height', h]]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(String(v));
    await input.press('Enter');
  }
}

/** Everything the result area shows, read from the DOM of the FRESH table. */
function readReport(page) {
  return page.evaluate(() => {
    const leaf = (re) => [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && re.test(d.textContent.trim()));
    const table = [...document.querySelectorAll('table')].find((t) => !t.dataset.zqOld && /Element/.test(t.querySelector('thead')?.textContent ?? ''));
    const detected = leaf(/^(Detected: .*|Auto-detect waiting for code…|Can’t tell R from Python\. Pick one above\.)$/)?.textContent.trim() ?? null;
    if (!table) return { detected, table: false, rows: [] };
    const panel = table.parentElement;
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
      const td = [...tr.querySelectorAll('td')].map((c) => c.textContent.trim());
      return { name: td[0], sourcePt: parseFloat(td[1]), printPt: parseFloat(td[2]), minPt: parseFloat(td[3]), glyph: td[4] };
    });
    const scaleEl = [...panel.querySelectorAll('div')].find((d) => /^Scale factor:/.test(d.textContent.trim()));
    const scale = scaleEl ? parseFloat(scaleEl.textContent.trim().replace(/^Scale factor:\s*/, '')) : null;
    const warnings = [...panel.children].filter((c) => c.textContent.trim().startsWith('⚠')).map((c) => c.textContent.trim().slice(1).trim());
    const copyBtn = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy edited code');
    let fixShown = null;
    let fixList = [];
    if (copyBtn) {
      const block = copyBtn.parentElement.parentElement; // the "Raise these text elements" column
      fixShown = block.querySelector('pre')?.textContent ?? null;
      fixList = [...block.querySelectorAll('li')].map((li) => {
        const m = li.textContent.match(/^(.+?):\s*([\d.]+)pt\s*→\s*([\d.]+)pt/);
        return m
          ? { name: m[1], currentPt: parseFloat(m[2]), neededPt: parseFloat(m[3]), youSetThis: /\(you set this\)/.test(li.textContent) }
          : { raw: li.textContent };
      });
    }
    const allPassBanner = [...panel.querySelectorAll('div')].some((d) => d.textContent.trim() === 'Every element in the table meets its minimum at this poster size.');
    return { detected, table: true, rows, scale, warnings, hasCopy: !!copyBtn, fixShown, fixList, allPassBanner };
  });
}

async function check(page, code) {
  // Mark the tables on screen, so the read below can only see the one this
  // Check renders (the panel is keyed on the checked code and remounts).
  await page.evaluate(() => document.querySelectorAll('table').forEach((t) => { t.dataset.zqOld = '1'; }));
  await page.getByLabel('Your R or Python plotting code').fill(code);
  await page.getByRole('button', { name: '▶ Check' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('table')].some((t) => !t.dataset.zqOld && /Element/.test(t.textContent)),
    null, { timeout: 5000 },
  ).catch(() => {});
  return readReport(page);
}

/** Press "Copy edited code" and return what the page put on the clipboard. */
async function copyCorrected(page) {
  const SENTINEL = '__ZQ_CLIPBOARD_EMPTY__';
  await page.evaluate((s) => navigator.clipboard.writeText(s), SENTINEL);
  await page.getByRole('button', { name: 'Copy edited code' }).click();
  const got = await page.waitForFunction(
    async (s) => { const t = await navigator.clipboard.readText(); return t !== s ? t : null; },
    SENTINEL, { timeout: 3000, polling: 50 },
  ).then((hnd) => hnd.jsonValue()).catch(() => null);
  return got;
}

/** One check of `code`, then the corrected code copied, pasted back and checked. */
async function checkAndRecheck(page, code, rec) {
  rec.first = await check(page, code);
  if (!rec.first.table) rec.errors.push('no table after Check');
  if (rec.first.detected !== 'Detected: Python / matplotlib') rec.errors.push(`detected: ${rec.first.detected}`);
  if (!rec.first.hasCopy) return;
  rec.copied = await copyCorrected(page);
  if (rec.copied === null) rec.errors.push('Copy edited code wrote nothing to the clipboard');
  else if (rec.copied !== rec.first.fixShown) rec.errors.push('copied code differs from the code shown');
  if (rec.copied !== null && rec.copied === code) rec.unchanged = true;
  if (rec.copied !== null && !rec.unchanged) {
    rec.recheck = await check(page, rec.copied);
    if (!rec.recheck.table) rec.errors.push('no table after re-check');
    if (rec.recheck.hasCopy) rec.copied2 = await copyCorrected(page);
  }
}

/** Loading vite.config.ts rewrites public/version.json: put the bytes back, whatever happens. */
async function collect() {
  const stampFile = path.join(WEB, 'public/version.json');
  const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile) : null;
  restoreStamp = () => { if (stamp !== null) fs.writeFileSync(stampFile, stamp); };
  try {
    return await collectRuns();
  } finally {
    restoreStamp();
    restoreStamp = () => {};
  }
}

async function collectRuns() {
  if (FRESH) fs.rmSync(RUNS, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  const src = sourceHash();
  const h = await startHarness({ name: 'checker-truth-check', port: PORT });
  let errors = 0;
  let n = 0;
  const record = async (page, key, id, size, entry) => {
    const rec = { key, id, size, entry, git: h.git, mutant: h.mutant, src, at: new Date().toISOString(), errors: [] };
    try {
      const code = fs.readFileSync(scriptPath(id), 'utf8');
      rec.codeHash = sha(code);
      await checkAndRecheck(page, code, rec);
    } catch (e) {
      rec.errors.push(`exception: ${String(e).slice(0, 200)}`);
    }
    n += 1;
    if (rec.errors.length) errors += 1;
    fs.writeFileSync(path.join(RUNS, `${key}.json`), JSON.stringify(rec, null, 1));
    const g = (r) => (r?.rows ?? []).map((x) => x.glyph).join('');
    log(`${key}: ${g(rec.first)} scale=${rec.first?.scale} fix=${rec.first?.hasCopy ? 'yes' : 'no'} recheck=${g(rec.recheck) || '-'}${rec.errors.length ? ` ERRORS ${rec.errors.join('; ')}` : ''}`);
  };
  try {
    // The public page: a size typed per run.
    const context = await h.browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.base });
    const state = { userId: 'zq-checker-user', row: null, saves: [], aborted: [], errors: [] };
    await installMocks(context, state, h.base);
    const page = await context.newPage();
    page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 200)));
    await page.goto(`${h.base}/tools/figure-readability`);
    await page.getByLabel('Your R or Python plotting code').waitFor({ timeout: 90000 });
    fs.mkdirSync(GENERATED, { recursive: true });
    for (const id of ids.filter((x) => MANIFEST[x].generated)) {
      const g = MANIFEST[id].generated;
      const code = await page.evaluate(async ({ module, exp, spec, mode }) => (await import(module))[exp](spec, mode),
        { module: g.module, exp: g.export, spec: g.spec, mode: g.mode });
      fs.writeFileSync(scriptPath(id), code);
    }
    for (const id of ids) {
      for (const size of SIZES) {
        await setSize(page, size);
        await record(page, `${id}@${size.w}x${size.h}`, id, size, 'page');
      }
    }
    if (state.errors.length) log(`[harness] page errors: ${state.errors.join(' | ')}`);
    await context.close();

    // The editor's Figure tab › Check a figure: the same panel, at the
    // editor's default block (the panel's own "(default block size)").
    const edIds = EDITOR_IDS.filter((id) => ids.includes(id));
    if (edIds.length) {
      const ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 } });
      try {
        await ed.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.base });
        await ed.page.locator('button[data-postr-tab]', { hasText: /^figure$/ }).click();
        await ed.page.getByRole('button', { name: 'Check a figure' }).click();
        await ed.page.getByLabel('Your R or Python plotting code').waitFor({ timeout: 10000 });
        for (const id of edIds) await record(ed.page, `editor~${id}`, id, null, 'editor');
        if (ed.state.errors.length) log(`[harness] editor page errors: ${ed.state.errors.join(' | ')}`);
      } finally {
        await ed.context.close();
      }
    }
  } finally {
    await h.stop();
  }
  log(`[harness] collected ${n} run(s) into ${RUNS}; ${errors} with errors`);
  return errors;
}

// ---------------------------------------------------------------- the truth
function runPython(args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const p = spawn(PYTHON, [TRUTH, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    // A spawn failure (no python, say) is a result with no JSON: the caller
    // reports it as an instrument error, never as a claim.
    p.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: null, json: null, stderr: `could not run ${PYTHON}: ${e.message}` });
    });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out); } catch { /* reported below */ }
      resolve({ code, json, stderr: err.slice(-400) });
    });
  });
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------------------------------------------------------------- scoring (lib/checkerScore.mjs)
async function score() {
  if (!fs.existsSync(RUNS)) fail(`no runs in ${RUNS}: run --phase collect first`);
  const recs = fs.readdirSync(RUNS).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')))
    .filter((r) => ids.includes(r.id) && (r.entry === 'editor'
      ? EDITOR_IDS.includes(r.id)
      : SIZES.some((s) => s.w === r.size.w && s.h === r.size.h)))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (!recs.length) fail(`no runs in ${RUNS} match --only / --sizes`);
  const sources = [...new Set(recs.map((r) => `${r.git}|${r.src}|${r.mutant ?? ''}`))];
  if (sources.length > 1) fail(`runs from ${sources.length} different sources in ${RUNS} (${sources.join(', ')}): collect again with --fresh`);
  const missing = [...ids.flatMap((id) => SIZES.map((s) => `${id}@${s.w}x${s.h}`)),
    ...EDITOR_IDS.filter((id) => ids.includes(id)).map((id) => `editor~${id}`)].filter((k) => !recs.some((r) => r.key === k));

  // K-truth: the instrument's own controls, before anything is scored with it.
  const st = await runPython(['--selftest']);

  // Real renders: every original, every corrected script, and (SHOWSAVE)
  // every corrected page script that calls show() under the inline backend.
  const FIXED = path.join(OUT, 'fixed');
  fs.rmSync(FIXED, { recursive: true, force: true });
  fs.mkdirSync(FIXED, { recursive: true });
  const jobs = [...new Set(recs.map((r) => r.id))].map((id) => ({ kind: 'orig', id, file: scriptPath(id) }));
  for (const r of recs) {
    if (r.copied && !r.unchanged) {
      const file = path.join(FIXED, `${r.key}.py`);
      fs.writeFileSync(file, r.copied);
      jobs.push({ kind: 'fixed', key: r.key, file });
      if (r.entry !== 'editor' && SHOWS.test(r.copied)) jobs.push({ kind: 'inline', key: r.key, file });
    }
  }
  const results = await pool(jobs, 6, (j) => runPython(j.kind === 'inline' ? ['--inline', j.file] : [j.file]));
  const truthOrig = {};
  const truthFixed = {};
  const truthInline = {};
  jobs.forEach((j, k) => {
    if (j.kind === 'orig') truthOrig[j.id] = results[k];
    else (j.kind === 'inline' ? truthInline : truthFixed)[j.key] = results[k];
  });

  const result = scoreRuns({ recs, missing, selftest: st, truthOrig, truthFixed, truthInline, manifest: MANIFEST, ids,
    scriptHash: (id) => sha(fs.readFileSync(scriptPath(id), 'utf8')), instrumentHash: instrumentHash(),
    scope: { scripts: ids.length, of: Object.keys(MANIFEST).length, sizes: SIZES.map((x) => `${x.w}x${x.h}`) } });
  const resultsPath = path.join(OUT, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({ summary: result.summary, rows: result.rows, editor: result.editor }, null, 1));
  printReport(result.summary, result.exit, resultsPath);
  return result.exit;
}

// ---------------------------------------------------------------- main
try {
  if (PHASE !== 'score') {
    const errs = await collect();
    if (PHASE === 'collect') process.exit(errs ? 2 : 0);
  }
  process.exit(await score());
} catch (e) {
  fail(e);
}
