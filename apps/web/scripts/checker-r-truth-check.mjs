#!/usr/bin/env node
/**
 * checker-r-truth-check.mjs — the plot checker (/tools/figure-readability)
 * against REAL ggplot2, for R scripts (plan item 13 part 2, sub-item B;
 * record docs/fixes/13-checker-reads-its-own-fix.md section 10). The R
 * companion of checker-truth-check.mjs (Python), reading the page with the
 * same code (lib/checkerPage.mjs).
 *
 * ENTRY POINT: the user's. For every corpus script × print size, a fresh
 * check on the public page: type the width and height, paste the script,
 * press "▶ Check" (language Auto), read the table, the warnings and the fix
 * list; if a fix is offered, press "Copy edited code", paste it back and
 * check again. The backend is faked at the network layer.
 *
 * TRUTH: scripts/truth/gg_truth.R runs the original and every corrected
 * script in real ggplot2 and reads every text grob ggplot2 builds to draw
 * the plot ggsave() is given, and ggsave's canvas. Real print pt = real pt ×
 * min(print W / canvas W, print H / canvas H), the rule the page states.
 *
 * VERDICTS: pass ≥ min, warn ≥ 0.85 × min, minimums PINNED here (plot title
 * 18, axis titles 18, tick labels 14, legend text 14, legend title 14,
 * strip text 14, caption 12 pt: readability.ts R_ELEMENTS on main); a page
 * Min column with anything else is an instrument error (exit 2). An element
 * is scored only where the plot draws it.
 *
 * CLAIMS (observed = the defect is present)
 *   TEXT, TITLE, POS, RCAP  per element-run, by the manifest's owner: the
 *       checker's source pt differs from the drawn size (also counted: wrong
 *       verdict, false PASS, false FAIL/WARN).
 *   F   the corrected script leaves an element the page listed below its
 *       minimum in real ggplot2 (or does not run).
 *   W1  the re-check shows ✓ for a drawn element the corrected plot prints
 *       below its minimum (rcfp), or a wrong verdict at the re-check.
 *   L   a class is smaller at print after the corrected code than before.
 *   GEOMTEXT  the plot draws in-panel text (geom_text, geom_label,
 *       annotate) and no warning about in-panel text is shown.
 *   Fix 13b (record docs/fixes/13b-checker-sizes.md; the confirmer's
 *   partition, ids rc-*): the manifest's families own their scripts'
 *   classes (R-ORDER, R-POS, R-TEXT, R-STRIP, R-CANVAS, R-FIXPLACE,
 *   D-LOWER); `scaleClaim` makes a script's scale comparison a claim of its
 *   own instead of the C control (a ggsave() size the checker must read).
 *   WARNED: a row marked as assumed ("*" in its Source cell, a size the code
 *   does not set) or a run whose scale is marked ("*": no ggsave() size)
 *   carries a missing-setting warning: fpU and rcfpU leave those out.
 *   SNIPLOW the page's "Or change one number: base_size = N" offers N below
 *       the base_size of the complete theme the plot uses (manifest `base`).
 *   SNIPNOOP the script with its one literal base_size changed to N, run in
 *       ggplot2: no class below its minimum before the edit meets it after
 *       (scripts with no single literal base_size are not edited).
 *   Review round 1 of fix 13b (ids r1-*): owners R1-UPDATE, R1-UNKNOWN,
 *   R1-VOID, R1-GGSAVE; the truth runner calls the real ggsave() with the
 *   arguments as bound, so a corrected script that binds a plot to device
 *   does not run (F).
 *   Review round 3 (ids r3-*): owners R3-NAMES (a theme held in a name, a
 *   function or another plot), R3-UNREAD, R3-DEVICE (a plot a device draws
 *   on a line of its own, grid.arrange(), ragg; also their `scaleClaim`),
 *   R3-COMBINE; the truth runner runs a script as Rscript does (autoprint,
 *   gg_truth.R self-test F).
 * CONTROLS (exit 2 when one fails)
 *   K-truth  gg_truth.R --selftest (known sizes, ggplot2's own multipliers,
 *            geom_text's mm).
 *   C        elements whose size comes from base_size = N or a theme() size
 *            for a table element: source within 0.05 pt and the same verdict;
 *            the scale within 0.005 on every run.
 *   K-page   every check renders a table and says "Detected: R"; the copied
 *            code equals the code shown; every original runs.
 * GATE-R line (review round 2 adds Lsrc: of L, a size written below what
 *   ggplot2 drew, and Llost: a verdict lost; the rest of L is text printed
 *   smaller only because the edited script sets a canvas it could not read):
 *   fp (first-check ✓ over a real ✗/⚠), rcfp (the same at the
 *   re-check), F, L, ffw (first-check ✗/⚠ over a real ✓), bases.
 *
 * RUN (from apps/web; 61 scripts × 4 sizes, about 6 min): node scripts/checker-r-truth-check.mjs [--only id,id]
 *   [--sizes 6x4.5,8x6,10x7,14x10] ; env PORT (default 5392), OUT_DIR
 *   (default <tmp>/postr-checker-r-truth-check), RSCRIPT (default Rscript).
 *   Needs R with ggplot2 (4.0.3 measured), jsonlite, cowplot, gridExtra and ragg. Installs nothing.
 * EXIT 0 no claim observed · 1 a claim observed, every control held · 2 a
 *   control failed or the instrument errored.
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json;
 *   collect puts its bytes back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
let restoreStamp = () => {};
const fail = (e) => {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 400)}`);
  try { restoreStamp(); } catch { /* reported above */ }
  process.exit(2);
};
process.exitCode = 2;
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(HERE, 'fixtures/checker-corpus-r');
const TRUTH = path.join(HERE, 'truth/gg_truth.R');
const RSCRIPT = process.env.RSCRIPT ?? 'Rscript';
const PORT = Number(process.env.PORT ?? 5392);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-checker-r-truth-check'));
process.env.OUT_DIR = OUT;
const { WEB, installMocks, startHarness } = await import('./lib/editorHarness.mjs');
const { setSize, check, copyCorrected, allowClipboard } = await import('./lib/checkerPage.mjs');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8')).scripts;

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
const ONLY = opt('--only')?.split(',') ?? null;
const SIZES = (opt('--sizes') ?? '6x4.5,8x6,10x7,14x10').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
const ids = Object.keys(MANIFEST).filter((id) => !ONLY || ONLY.includes(id));
if (ONLY && ids.length !== ONLY.length) fail(`unknown --only id: ${ONLY.filter((id) => !MANIFEST[id])}`);

const KEY = { 'Plot title': 'plotTitle', 'Axis titles': 'axisTitle', 'Tick labels': 'axisText', 'Legend text': 'legendText',
  'Legend title': 'legendTitle', 'Strip text': 'stripText', Caption: 'caption' };
const MIN = { plotTitle: 18, axisTitle: 18, axisText: 14, legendText: 14, legendTitle: 14, stripText: 14, caption: 12 };
const GLYPH = { '✓': 'pass', '⚠': 'warn', '✗': 'fail' };
const verdict = (pt, min) => (pt >= min - 1e-9 ? 'pass' : pt >= 0.85 * min - 1e-9 ? 'warn' : 'fail');
const scaleOf = (size, c) => Math.min(size.w / c.w, size.h / c.h);
const r2 = (v) => Math.round(v * 100) / 100;
/** The page's in-panel warning (readability.ts parseRCode). */
const IN_PANEL = /In-panel labels are not theme elements/;

/**
 * The user's edit for "Or change one number: base_size = N": the script's one
 * literal base_size (named, or a complete theme's first positional
 * argument) replaced by N. `code` is null unless there is exactly one.
 */
function snippetEditR(code, n) {
  const forms = [/(\bbase_size\s*=\s*)(\d+(?:\.\d*)?)/g, /(\btheme_(?!set\b|update\b|get\b|replace\b)\w+\s*\(\s*)(\d+(?:\.\d*)?)(?=\s*[,)])/g];
  const hits = forms.flatMap((re) => [...code.matchAll(re)]);
  if (hits.length !== 1) return { sets: hits.length, code: null };
  const h = hits[0];
  const at = h.index + h[1].length;
  return { sets: 1, code: code.slice(0, at) + n + code.slice(at + h[2].length) };
}

// ---------------------------------------------------------------- collect
async function collect() {
  const stampFile = path.join(WEB, 'public/version.json');
  const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile) : null;
  restoreStamp = () => { if (stamp !== null) fs.writeFileSync(stampFile, stamp); };
  const recs = [];
  const h = await startHarness({ name: 'checker-r-truth-check', port: PORT });
  try {
    const context = await h.browser.newContext({ viewport: { width: 1280, height: 900 } });
    await allowClipboard(context, h.base, h.engine);
    const state = { userId: 'zq-checker-user', row: null, saves: [], aborted: [], errors: [] };
    await installMocks(context, state, h.base);
    const page = await context.newPage();
    await page.goto(`${h.base}/tools/figure-readability`);
    await page.getByLabel('Your R or Python plotting code').waitFor({ timeout: 90000 });
    for (const id of ids) {
      const code = fs.readFileSync(path.join(CORPUS, `${id}.R`), 'utf8');
      for (const size of SIZES) {
        const rec = { key: `${id}@${size.w}x${size.h}`, id, size, git: h.git, errors: [] };
        try {
          await setSize(page, size);
          rec.first = await check(page, code);
          if (!rec.first.table) rec.errors.push('no table after Check');
          if (!/^Detected: R\b/.test(rec.first.detected ?? '')) rec.errors.push(`detected: ${rec.first.detected}`);
          if (rec.first.hasCopy) {
            rec.copied = await copyCorrected(page);
            if (rec.copied === null) rec.errors.push('Copy edited code wrote nothing');
            else if (rec.copied !== rec.first.fixShown) rec.errors.push('copied code differs from the code shown');
            if (rec.copied) rec.recheck = await check(page, rec.copied);
          }
        } catch (e) { rec.errors.push(`exception: ${String(e).slice(0, 200)}`); }
        const g = (r) => (r?.rows ?? []).map((x) => x.glyph).join('');
        log(`${rec.key}: ${g(rec.first)} scale=${rec.first?.scale} fix=${rec.first?.hasCopy ? 'yes' : 'no'} recheck=${g(rec.recheck) || '-'}${rec.errors.length ? ` ERRORS ${rec.errors.join('; ')}` : ''}`);
        recs.push(rec);
      }
    }
    await context.close();
  } finally {
    await h.stop();
    restoreStamp();
    restoreStamp = () => {};
  }
  return recs;
}

// ---------------------------------------------------------------- truth
function runR(args) {
  return new Promise((resolve) => {
    const p = spawn(RSCRIPT, [TRUTH, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 90000);
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: null, json: null, stderr: e.message }); });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out); } catch { /* reported by the caller */ }
      resolve({ code, json, stderr: err.slice(-400) });
    });
  });
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// ---------------------------------------------------------------- score
function compare(rep, t, size) {
  const s = scaleOf(size, t);
  return Object.entries(KEY).flatMap(([name, key]) => {
    const row = rep.rows.find((x) => x.name === name);
    const real = t.sizes?.[key] ?? null;
    if (real == null) return row ? [{ key, name, drawn: false, checker: GLYPH[row.glyph], checkerPrint: row.printPt }] : [];
    const realPrint = real * s;
    return [row
      ? { key, name, drawn: true, checkerSrc: row.sourcePt, checkerPrint: row.printPt, checker: GLYPH[row.glyph], realSrc: real, realPrint: r2(realPrint), real: verdict(realPrint, MIN[key]) }
      : { key, name, drawn: true, noRow: true, realSrc: real, realPrint: r2(realPrint), real: verdict(realPrint, MIN[key]) }];
  });
}

async function score(recs) {
  const st = await runR(['--selftest']);
  const FIXED = path.join(OUT, 'fixed');
  fs.rmSync(FIXED, { recursive: true, force: true });
  fs.mkdirSync(FIXED, { recursive: true });
  const jobs = ids.map((id) => ({ kind: 'orig', id, file: path.join(CORPUS, `${id}.R`) }));
  for (const r of recs) if (r.copied) { const f = path.join(FIXED, `${r.key}.R`); fs.writeFileSync(f, r.copied); jobs.push({ kind: 'fixed', key: r.key, file: f }); }
  // SNIPLOW / SNIPNOOP: the one-number advice, done as it says.
  const snipEdits = {};
  for (const r of recs) {
    const m = r.first?.snippetSummary?.match(/base_size = (\d+(?:\.\d+)?)/);
    if (!m) continue;
    const edit = snippetEditR(fs.readFileSync(path.join(CORPUS, `${r.id}.R`), 'utf8'), m[1]);
    snipEdits[r.key] = { n: Number(m[1]), edited: edit.code !== null };
    if (edit.code === null) continue;
    const f = path.join(FIXED, `${r.key}.snip.R`);
    fs.writeFileSync(f, edit.code);
    jobs.push({ kind: 'snip', key: r.key, file: f });
  }
  const res = await pool(jobs, 6, (j) => runR([j.file]));
  const orig = {};
  const fixed = {};
  const snipped = {};
  jobs.forEach((j, k) => { if (j.kind === 'orig') orig[j.id] = res[k]; else if (j.kind === 'snip') snipped[j.key] = res[k]; else fixed[j.key] = res[k]; });

  const instrument = [];
  const controlFails = [];
  const claims = {};
  const bump = (c, observed, ex, extra = {}) => {
    claims[c] ??= { observed: 0, of: 0, srcDiffers: 0, wrongVerdict: 0, falsePass: 0, falseFailWarn: 0, examples: [] };
    claims[c].of += 1;
    for (const [k, v] of Object.entries(extra)) if (v) claims[c][k] += 1;
    if (observed) { claims[c].observed += 1; if (ex && claims[c].examples.length < 6) claims[c].examples.push(ex); }
  };
  const gate = { fp: 0, fpW: 0, ffw: 0, rcfp: 0, rcfpW: 0, rcffw: 0, F: 0, fixOffered: 0, L: 0, Lsrc: 0, Llost: 0, firstDrawn: 0, recheckDrawn: 0, pageRuns: 0 };
  const snip = { offered: 0, below: 0, edited: 0, noop: 0, lowered: 0 };
  const fpByOwner = {};
  const rows = [];
  let controlElements = 0;
  for (const r of recs) {
    if (r.errors.length) { instrument.push(`${r.key}: ${r.errors.join('; ')}`); continue; }
    const t = orig[r.id];
    if (!t?.json?.ok) { instrument.push(`${r.key}: the original did not run in ggplot2 (${t?.json?.error ?? t?.stderr})`); continue; }
    const bad = [...r.first.rows, ...(r.recheck?.rows ?? [])].filter((x) => !KEY[x.name] || !GLYPH[x.glyph] || x.minPt !== MIN[KEY[x.name]]);
    if (bad.length) { instrument.push(`${r.key}: rows the harness cannot score: ${bad.map((x) => `${x.name} ${x.glyph} min ${x.minPt}`).join(', ')}`); continue; }
    gate.pageRuns += 1;
    const man = MANIFEST[r.id].elements;
    const realScale = scaleOf(r.size, t.json);
    const scaleOk = Math.abs(r.first.scale - realScale) <= 0.005 + 1e-9;
    const scaleEx = `${r.key}: checker scale ${r.first.scale} vs real ${r2(realScale)}`;
    const scaleOwner = MANIFEST[r.id].scaleClaim ?? 'C';
    if (scaleOwner === 'C') { if (!scaleOk) controlFails.push(scaleEx); }
    else bump(scaleOwner === 'R-CANVAS' ? 'R-CANVAS-scale' : scaleOwner, !scaleOk, scaleOk ? null : scaleEx);
    const els = compare(r.first, t.json, r.size);
    const row = { key: r.key, id: r.id, size: r.size, scale: r.first.scale, first: els, warnings: r.first.warnings };
    for (const e of els.filter((x) => x.drawn)) {
      gate.firstDrawn += 1;
      if (e.noRow) { gate.fp += 1; bump('NOROW', true, `${r.key} ${e.name} drawn at ${e.realSrc} pt, no row`); continue; }
      const own = man[e.key] ?? '-';
      const srcOff = Math.abs(e.checkerSrc - e.realSrc) > 0.05 + 1e-6;
      const wrong = e.checker !== e.real;
      const fp = e.checker === 'pass' && e.real !== 'pass';
      const ffw = e.checker !== 'pass' && e.real === 'pass';
      const warned = !!(r.first.rows.find((x) => x.name === e.name)?.assumed || r.first.scaleAssumed);
      if (fp) { gate.fp += 1; if (warned) gate.fpW += 1; fpByOwner[own] = (fpByOwner[own] ?? 0) + 1; }
      if (ffw) gate.ffw += 1;
      const ex = `${r.key} ${e.name}: checker ${e.checkerSrc} pt → ${e.checkerPrint} pt ${e.checker}, real ${e.realSrc} pt → ${e.realPrint} pt ${e.real}`;
      // Where the scale is itself under test (scaleClaim), a control compares its source only.
      if (own === 'C') { controlElements += 1; if (srcOff || (scaleOwner === 'C' && wrong)) controlFails.push(ex); }
      else if (own !== '-') bump(own, srcOff || wrong, ex, { srcDiffers: srcOff, wrongVerdict: wrong, falsePass: fp, falseFailWarn: ffw });
    }
    // GEOMTEXT: in-panel text drawn, and the page says so (a warning).
    if (t.json.sizes?.inPanel != null) {
      const w = (r.first.warnings ?? []).find((x) => IN_PANEL.test(x)) ?? null;
      row.inPanel = { realPt: t.json.sizes.inPanel, warning: w };
      bump('GEOMTEXT', !w, !w ? `${r.key}: in-panel text drawn at ${r2(t.json.sizes.inPanel)} pt, no warning shown` : null);
    }
    if (r.first.hasCopy) {
      gate.fixOffered += 1;
      const tf = fixed[r.key];
      const listed = new Set(r.first.fixList.map((f) => KEY[f.name]));
      if (!tf?.json?.ok) {
        bump('F', true, `${r.key}: the corrected script does not run (${tf?.json?.error ?? tf?.stderr})`);
        gate.F += 1;
      } else {
        const fEls = compare(r.recheck, tf.json, r.size);
        row.recheck = fEls;
        row.fixList = r.first.fixList;
        const still = fEls.filter((e) => e.drawn && listed.has(e.key) && e.real !== 'pass');
        bump('F', still.length > 0, still.length ? `${r.key}: after the fix, real ${still.map((e) => `${e.name} ${e.realSrc} pt → ${e.realPrint} pt ${e.real}`).join(', ')}` : null);
        if (still.length) gate.F += 1;
        const dis = fEls.filter((e) => e.drawn && !e.noRow && e.checker !== e.real);
        for (const e of fEls.filter((x) => x.drawn && !x.noRow)) {
          gate.recheckDrawn += 1;
          if (e.checker === 'pass' && e.real !== 'pass') {
            gate.rcfp += 1;
            if (r.recheck.rows.find((x) => x.name === e.name)?.assumed || r.recheck.scaleAssumed) gate.rcfpW += 1;
          }
          if (e.checker !== 'pass' && e.real === 'pass') gate.rcffw += 1;
        }
        bump('W1', dis.length > 0, dis.length ? `${r.key}: re-check ${dis.map((e) => `${e.name} ${e.checkerSrc} pt ${e.checker} vs real ${r2(e.realSrc)} pt → ${e.realPrint} pt ${e.real}`).join('; ')}` : null);
        const fScale = scaleOf(r.size, tf.json);
        for (const k of Object.keys(MIN)) {
          const b = t.json.sizes?.[k];
          const a = tf.json.sizes?.[k];
          if (b == null || a == null) continue;
          const low = a * fScale < b * realScale - 0.005;
          if (low) gate.L += 1;
          // Review round 2: of those, a size written below what ggplot2 drew (Lsrc), and a verdict lost
          // (Llost); the rest are lowered at print only because the edited script fixes the canvas.
          if (low && a < b - 0.005) gate.Lsrc += 1;
          if (low && verdict(a * fScale, MIN[k]) !== verdict(b * realScale, MIN[k])) gate.Llost += 1;
          bump('L', low, low ? `${r.key} ${k}: ${b} pt → ${r2(b * realScale)} pt at print before the fix, ${a} pt → ${r2(a * fScale)} pt after` : null);
        }
      }
    }
    // SNIPLOW / SNIPNOOP: the one-number base_size advice.
    const se = snipEdits[r.key];
    if (se) {
      snip.offered += 1;
      const own = MANIFEST[r.id].base;
      const below = own != null && se.n < own - 1e-9;
      if (below) snip.below += 1;
      bump('SNIPLOW', below, below ? `${r.key}: "Or change one number: base_size = ${se.n}" where the plot's base_size is ${own}` : null);
      row.snippet = { n: se.n, base: own, edited: se.edited };
      const ts = snipped[r.key];
      if (se.edited) {
        if (!ts?.json?.ok) instrument.push(`${r.key}: the base_size-edited script did not run (${ts?.json?.error ?? ts?.stderr})`);
        else {
          snip.edited += 1;
          const sScale = scaleOf(r.size, ts.json);
          let wasBelow = 0;
          let lifted = 0;
          for (const k of Object.keys(MIN)) {
            const b = t.json.sizes?.[k];
            const a = ts.json.sizes?.[k];
            if (b == null || a == null) continue;
            if (a * sScale < b * realScale - 0.005) snip.lowered += 1;
            if (verdict(b * realScale, MIN[k]) !== 'pass') { wasBelow += 1; if (verdict(a * sScale, MIN[k]) === 'pass') lifted += 1; }
          }
          const noop = wasBelow > 0 && lifted === 0;
          if (noop) snip.noop += 1;
          bump('SNIPNOOP', noop, noop ? `${r.key}: base_size ${own} → ${se.n} lifts none of the ${wasBelow} classes below their minimum` : null);
        }
      }
    }
    rows.push(row);
  }
  const kTruth = st.code === 0 && st.json?.ok === true;
  const origRan = Object.values(orig).filter((t) => t?.json?.ok).length;
  const summary = { git: recs[0]?.git, ggplot2: st.json?.ggplot2, kTruth: { ok: kTruth, checks: (st.json?.checks ?? []).map((c) => `${c.name}: ${c.ok ? 'ok' : 'FAIL'}`) },
    control: { ok: !controlFails.length, elementRuns: controlElements, failures: controlFails }, kPage: { checks: recs.length, errors: recs.filter((r) => r.errors.length).length, originalsRun: origRan, originals: ids.length },
    instrument, claims, gate, fpByOwner, snippet: snip };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, rows, recs }, null, 1));
  log(`[harness] ${recs.length} runs on ${summary.git}, ggplot2 ${summary.ggplot2}`);
  log(`[K-truth] ${kTruth ? 'OK' : 'FAIL'} ${summary.kTruth.checks.join(' · ')}`);
  log(`[control C] ${controlFails.length ? `FAIL ${controlFails.length}: ${controlFails.slice(0, 6).join(' | ')}` : `OK: ${controlElements} control element-runs and every scale match`}`);
  log(`[control K-page] ${recs.length - summary.kPage.errors} of ${recs.length} checks rendered an R table; ${origRan} of ${ids.length} originals run`);
  if (instrument.length) log(`[instrument] ${instrument.slice(0, 6).join(' | ')}`);
  for (const [c, v] of Object.entries(claims)) {
    log(`[${v.observed ? 'OBSERVED' : 'not observed'}] ${c} ${v.observed} of ${v.of} (source differs ${v.srcDiffers}, wrong verdict ${v.wrongVerdict}, false PASS ${v.falsePass}, false FAIL/WARN ${v.falseFailWarn})${v.examples.length ? `; e.g. ${v.examples.slice(0, 3).join(' | ')}` : ''}`);
  }
  log(`[part 2, R] first-check false PASS by owner: ${Object.entries(fpByOwner).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  log(`[part 2, R] "Or change one number: base_size = N": offered on ${snip.offered} runs; N below the plot's base_size on ${snip.below}; edited and run ${snip.edited}; no class lifted (SNIPNOOP) on ${snip.noop}; element-runs lowered by the edit ${snip.lowered}`);
  log(`GATE-R fp=${gate.fp} rcfp=${gate.rcfp} F=${gate.F}/${gate.fixOffered} L=${gate.L} ffw=${gate.ffw} rcffw=${gate.rcffw} | unwarned fpU=${gate.fp - gate.fpW} rcfpU=${gate.rcfp - gate.rcfpW} | L: source lowered Lsrc=${gate.Lsrc}, verdict lost Llost=${gate.Llost} | bases pageRuns=${gate.pageRuns} firstDrawn=${gate.firstDrawn} recheckDrawn=${gate.recheckDrawn} | ${ids.length} scripts × ${SIZES.length} sizes`);
  const exit = (!kTruth || controlFails.length || instrument.length) ? 2 : Object.values(claims).some((v) => v.observed) ? 1 : 0;
  log(`[harness] exit=${exit} wrote ${path.join(OUT, 'results.json')}`);
  return exit;
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  const recs = await collect();
  process.exit(await score(recs));
} catch (e) {
  fail(e);
}
