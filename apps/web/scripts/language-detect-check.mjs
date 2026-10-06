#!/usr/bin/env node
/**
 * language-detect-check.mjs — what the plot checker does when it has to tell
 * R from Python (plan item 15, "Check does nothing when it can't tell R from
 * Python"; evidence W4, docs/stress-test/FIGURE-READABILITY.md PY-5/PY-6).
 *
 * ENTRY POINTS: exactly the user's. The public page /tools/figure-readability
 * (every script, a fresh page load each) and the editor's Figure tab › "Check
 * a figure" (the everyday corpus and six gate scripts, the panel remounted
 * between scripts by leaving the tab and coming back). For each script: Auto
 * is pressed (the default), the script is pasted into the code box, the label
 * beside "▶ Check" and the button's state are read, Check is pressed, and the
 * harness reads whether a fresh results table rendered, what it says, and
 * whether ANYTHING in the page changed (DOM mutations inside the panel, and
 * the page's visible text). When nothing rendered, it presses the script's
 * true language (R or Python) and Check again (H1's control), and it re-runs
 * the script after a good check of the control script, to see what happens to
 * a result already on screen. The backend is faked at the network layer
 * (lib/editorHarness.mjs). The app's own module is imported in the page for
 * the unit-level numbers (detectLanguage, and detectLanguage over
 * stripComments: the held-back commit 9ea9f38's input, computed from main's
 * functions, not served; since fix 15 detectLanguage masks comments itself,
 * so the two columns agree, and describePlotCode gives the system).
 *
 * CORPUS: fixtures/language-corpus (everyday R and Python plotting snippets
 * and, since fix 15, the confirmer's cause class and two other languages,
 * since its round 1 review the reviewer's out-of-sample scripts and the
 * names other systems share, and since round 2 that reviewer's R ggplot2
 * inside print(), ggsave() and a loop, and a D3 snippet, each labelled
 * with its true language, plotting system and whether the page supports
 * it: its manifest says how), fixtures/checker-corpus (the checker
 * gate's 45 Python scripts) and fixtures/checker-shapes (201 Python scripts).
 * Generated scripts come from the app's own codegen modules at run time.
 *
 * CLAIMS (exit 1 when any is observed and every control held):
 *   DEAD     code is in the box, Check is enabled, pressing it renders no
 *            table and changes nothing on the page (no DOM mutation in the
 *            panel, the page's visible text identical). The item's symptom.
 *   LABEL    the label beside Check says "Auto-detect waiting for code…"
 *            while the box holds code.
 *   WRONG    a table renders under the other language's label (a Python
 *            script scored as R or the reverse), or for text that is not code.
 *   NOANSWER Auto could not place the script (the label before Check names no
 *            language), Check rendered no table, and the label slot beside
 *            Check does not then say it could not tell R from Python and offer
 *            both choices ("R (ggplot2)", "Python (matplotlib)"): the owner's
 *            answer of 2026-10-06. Fix 15 added it.
 *   SYSTEM   a script in a plotting system the page does not support (base
 *            graphics, lattice, plotly, plotnine, altair) ends (after the hand
 *            pick of its true language, when one was made) with a results
 *            table, or with no visible text that names its system, says "not
 *            supported" and names what is (ggplot2 and matplotlib). Before fix
 *            15 it counted only with --with-systems and only on a table; it
 *            now always counts (the flag is accepted and does nothing).
 *   REFUSED  a script in a system the page supports (ggplot2, matplotlib,
 *            seaborn, pandas) is answered "not supported", at the first press
 *            or after the hand pick: the opposite of SYSTEM. Fix 15 added it
 *            when a mutant scoring the raw text answered "not supported:
 *            plotnine" for an R ggplot2 script and no claim saw it.
 *   SILENT   Check was pressed and no live region in the panel (role=status,
 *            role=alert or aria-live) that was there BEFORE the press holds
 *            a new announcement afterwards: a screen reader is told nothing,
 *            whatever the outcome. A region inserted together with its text
 *            does not count, since many screen readers do not speak one
 *            (fix 15's round 1 review: a mutant that mounted the region only
 *            with its answer reported 77/77 announced). Fix 15.
 *   VANISH   a good result on screen, then a script that cannot be checked
 *            (one that rendered no table on its own), then Check: the result is
 *            gone (the owner's answer: it stays, marked out of date). Before
 *            fix 15 this was reported only as "vanished with no message".
 *   REPEAT   an answer Check gave is put back into a live region of the panel
 *            with no press of Check: after the language is changed and changed
 *            back, after a character is typed and deleted, and on the page
 *            after the print size is changed and changed back (three scripts:
 *            one it cannot place, one it checks, one it does not support; the
 *            size step on the one it checks). A screen reader reads it out
 *            again. Fix 15's round 2 review.
 *   KEPT     in the same runs, an answer Check gave is still in the live region
 *            once the language or the code has changed (read after the other
 *            language is pressed, and after the character is typed): it no
 *            longer answers what the line beside Check now shows. Fix 15's
 *            round 2 correction drops it; a mutant that kept it was invisible
 *            to REPEAT, which reads only answers put back.
 *   RESIZE   on the page, a result on screen, then another print-size preset:
 *            the table is hidden and no live region that was there before says
 *            anything. Fix 15's round 2 review (the page hides the table by
 *            design, fix 13; that it is hidden goes without a word).
 * Reported, not claims: whether the kept result is marked out of date, the
 * per-system detection table (language, and the plotting system the app's
 * describePlotCode returns when the module has it), the stripComments variant,
 * which signals fired for each null and each wrong pick, and whether the
 * edited code the page offers ("Copy edited code"; "Copy corrected code"
 * before the claims audit of 2026-10) still parses in the script's own
 * language (R parse() / Python ast; parsing is not running: a fix that
 * parses can still change nothing).
 *
 * CONTROLS (exit 2 when one fails):
 *   K-ctl    r-gg-control.R renders a table under "Detected: R / ggplot2" and
 *            py-mpl-control.py under "Detected: Python / matplotlib", at both
 *            entry points (the reading of a table works).
 *   K-empty  with the box empty, Check is disabled (the guard that exists).
 *   K-agree  the label's language before Check equals what the app's own
 *            detectLanguage returns for that script, raw or comment-stripped
 *            (the label is driven by the function the numbers come from).
 *            A label that says it cannot tell R from Python reads as no
 *            language ("Can’t tell R from Python. Pick one above." since the
 *            claims audit of 2026-10).
 *   K-diag   the signal list read from readability.ts's source scores every
 *            script to the same verdict as detectLanguage (the per-signal
 *            breakdown describes the shipped scorer). When the module
 *            exports languageSignals (fix 15 on), the breakdown is the
 *            module's own and K-diag checks its verdicts against
 *            detectLanguage instead. Skipped, not failed, when neither
 *            exists.
 *   K-label  every R snippet parses in R (Rscript) and every Python snippet in
 *            Python (ast), unless its manifest gives a noParse reason; skipped
 *            with a note when R or Python cannot be run.
 *   K-sequence REPEAT's and RESIZE's runs happened at each entry point, and
 *            the size steps started from a table on screen.
 *   K-reset  in the editor the panel is empty (no code, no table) before each
 *            script.
 *   K-errors no uncaught page error.
 *
 * BLIND SPOTS: the rates are of this corpus, written for this item plus the
 * checker's Python fixtures, not of real traffic. A snippet that parses in
 * both languages is labelled by intent (the report splits accuracy by that).
 * DEAD reads mutations and text, not paint: a change drawn only by CSS (a
 * focus ring, a pseudo-element) is not seen, and a page whose text changes for
 * an unrelated reason is counted as "something changed" (conservative).
 * SYSTEM's and NOANSWER's "names it" are text matches; a message in other
 * words reads as silent. The label slot is the element before "▶ Check",
 * read without its `.sr-only` text (announcements for screen readers only).
 * SILENT reads whether a live region present before the press had its text
 * changed or one of its children replaced; whether a real screen reader
 * speaks it is not tested. REPEAT reads the text of each node added to a
 * live region between presses (a MutationObserver), not speech, and matches
 * it against the answers given at earlier presses; KEPT reads the region's
 * text midway through a step, after 100 ms.
 * In the editor the save status ("Saved · 10s ago") ticks by itself, so a
 * line of that shape is left out of the text comparison (AMBIENT).
 * The editor runs at its default block with no image selected (the image scan
 * path is not exercised). Whether a correctly detected script's numbers are
 * right is items 13, 14 and 16's job (checker-truth-check.mjs). Chromium by
 * default (POSTR_BROWSER picks another engine).
 *
 * RUN (from apps/web; 312 scripts on the page and 72 in the editor took
 * 533 s on an M4 Max, shared; 323 and 83 since fix 15's fixtures, 344 and
 * 104 since its round 1, 350 and 110 since round 2, about 10 minutes; --corpus everyday alone about 2 minutes in Chromium, about 10 in
 * Firefox or WebKit)
 *   node scripts/language-detect-check.mjs
 *   options: --corpus everyday,gate,shapes (default all three)
 *            --no-editor   --editor-all (every script in the editor too)
 *            --with-systems (accepted; SYSTEM always counts since fix 15)
 *   env PORT (default 5730), OUT_DIR (default <tmp>/postr-language-detect-check),
 *       PYTHON (default python3), RSCRIPT (default Rscript), POSTR_REPO,
 *       POSTR_BROWSER, POSTR_MUTANT (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed · 1 a claim observed (every control held) ·
 *      2 a control failed or the harness failed (2 from the first line until
 *      scoring has finished).
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json;
 * the bytes are put back when the browser phase ends. After a killed run:
 *   git checkout -- apps/web/public/version.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
let restoreStamp = () => {};
const fail = (e) => {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  try { restoreStamp(); } catch { /* the error above is the one to report */ }
  process.exit(2);
};
process.exitCode = 2;
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
let WEB, installMocks, openEditor, startHarness;
try {
  ({ WEB, installMocks, openEditor, startHarness } = await import('./lib/editorHarness.mjs'));
} catch (e) { fail(e); }

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.findIndex((a) => a === k || a.startsWith(`${k}=`));
  if (i < 0) return null;
  return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
};
const CORPORA = (opt('--corpus') ?? 'everyday,gate,shapes').split(',').filter(Boolean);
if (CORPORA.some((c) => !['everyday', 'gate', 'shapes'].includes(c))) fail(`--corpus is everyday,gate,shapes, not ${CORPORA}`);
const NO_EDITOR = argv.includes('--no-editor');
const EDITOR_ALL = argv.includes('--editor-all');
const PORT = Number(process.env.PORT ?? 5730);
const PYTHON = process.env.PYTHON ?? 'python3';
const RSCRIPT = process.env.RSCRIPT ?? 'Rscript';
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-language-detect-check'));
process.env.OUT_DIR = OUT;
const GATE_EDITOR = ['ctl-fontsize', 'ctl-explicit', 'w2-rc-ticks', 'w2-rc-fixblock', 's-alias-mpl', 's-kw-pyplot'];
/** REPEAT's scripts: one Auto cannot place, one it checks (the size steps), one it does not support. */
const SEQUENCE_SCRIPTS = ['py-pandas-plot-bare.py', 'r-gg-control.R', 'r-base-plot.R'];
const SYSTEM_WORDS = { base: /base graphics|base R/i, lattice: /lattice/i, plotly: /plotly/i, plotnine: /plotnine/i, altair: /altair/i };
/** The editor's save status ("Saved · 10s ago") ticks on its own: not a response to Check. */
const AMBIENT = /^Saved\b.*\bago$/;
const UNSUPPORTED_WORDS = /unsupported|not supported|can['’]t check|cannot check|can['’]t read|only (checks|reads)/i;
/** What the page does check, named in the unsupported answer. */
const SUPPORTED_NAMED = (t) => /ggplot2/.test(t) && /matplotlib/.test(t);
/** The owner's could-not-tell answer: says so, and offers both choices. */
const CANNOT_TELL = (t) => /tell R from Python/i.test(t) && /R \(ggplot2\)/.test(t) && /Python \(matplotlib\)/.test(t);

// ---------------------------------------------------------------- corpus
function loadCorpus() {
  const items = [];
  const gateManifest = JSON.parse(fs.readFileSync(path.join(FIX, 'checker-corpus/manifest.json'), 'utf8')).scripts;
  if (CORPORA.includes('everyday')) {
    const m = JSON.parse(fs.readFileSync(path.join(FIX, 'language-corpus/manifest.json'), 'utf8')).scripts;
    if (!m || !m['r-gg-control.R'] || !m['py-mpl-control.py']) throw new Error('language-corpus manifest lacks its two controls');
    for (const [id, e] of Object.entries(m)) {
      if (!('lang' in e) || !e.system || typeof e.supported !== 'boolean') throw new Error(`language-corpus/${id}: needs lang, system, supported`);
      let generated = null;
      if (e.generated) {
        const [, ref] = e.generated.specFrom.split('#');
        generated = { ...e.generated, spec: gateManifest[ref]?.generated?.spec };
        if (!generated.spec) throw new Error(`language-corpus/${id}: specFrom ${e.generated.specFrom} not found`);
      } else if (!fs.existsSync(path.join(FIX, 'language-corpus', id))) throw new Error(`missing fixture language-corpus/${id}`);
      items.push({ ...e, corpus: 'everyday', id, file: generated ? null : path.join(FIX, 'language-corpus', id), generated });
    }
  }
  if (CORPORA.includes('gate')) {
    for (const [id, e] of Object.entries(gateManifest)) {
      items.push({
        corpus: 'gate', id, lang: 'python', system: 'matplotlib', supported: true, what: e.what ?? '',
        file: e.generated ? null : path.join(FIX, 'checker-corpus', `${id}.py`), generated: e.generated ?? null,
      });
    }
  }
  if (CORPORA.includes('shapes')) {
    const root = path.join(FIX, 'checker-shapes');
    for (const f of fs.readdirSync(root, { recursive: true }).filter((x) => x.endsWith('.py')).sort()) {
      items.push({ corpus: 'shapes', id: f, lang: 'python', system: 'matplotlib', supported: true, what: '', file: path.join(root, f), generated: null });
    }
  }
  return items;
}

// ---------------------------------------------------------------- K-label: does each text parse in R / Python?
/** Each text parsed by R (Rscript, parse()) and by Python (ast.parse): { r, py } arrays of true/false, or null when not run. */
function parseTexts(texts, tag) {
  const dir = path.join(OUT, `parse-${tag}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = texts.map((t, k) => {
    const f = path.join(dir, `${k}.src`);
    fs.writeFileSync(f, t);
    return f;
  });
  if (!files.length) return { r: [], py: [], rNote: 'ran', pyNote: 'ran' };
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.error || r.status !== 0) return { ok: false, why: String(r.error?.message ?? r.stderr).slice(0, 200) };
    const map = new Map(r.stdout.trim().split('\n').filter(Boolean).map((l) => { const [f, v] = l.split('\t'); return [f, v === 'TRUE']; }));
    return { ok: map.size === files.length, map, why: map.size === files.length ? '' : `${map.size} of ${files.length} answered` };
  };
  const rRes = run(RSCRIPT, ['-e', 'for (f in commandArgs(TRUE)) { ok <- tryCatch({ parse(file = f); TRUE }, error = function(e) FALSE); cat(f, "\\t", if (ok) "TRUE" else "FALSE", "\\n", sep = "") }', ...files]);
  const pyRes = run(PYTHON, ['-c', 'import ast,sys\nfor f in sys.argv[1:]:\n    try:\n        ast.parse(open(f, encoding="utf-8").read()); v = "TRUE"\n    except SyntaxError:\n        v = "FALSE"\n    print(f + "\\t" + v)', ...files]);
  return {
    r: files.map((f) => (rRes.ok ? rRes.map.get(f) : null)), py: files.map((f) => (pyRes.ok ? pyRes.map.get(f) : null)),
    rNote: rRes.ok ? 'ran' : `skipped (${rRes.why})`, pyNote: pyRes.ok ? 'ran' : `skipped (${pyRes.why})`,
  };
}
function parseAll(items) {
  const res = parseTexts(items.map((it) => it.code), 'scripts');
  items.forEach((it, k) => { it.parsesR = res.r[k]; it.parsesPy = res.py[k]; });
  return { r: res.rNote, py: res.pyNote };
}
/** Does the edited code the page offered parse in the script's TRUE language? (reported, not a claim) */
function parseFixes(items, got) {
  const jobs = [];
  for (const it of items) {
    if (it.lang !== 'r' && it.lang !== 'python') continue;
    for (const entry of ['page', 'editor']) {
      const run = got[entry][`${it.corpus}/${it.id}`];
      if (run?.fixFull) jobs.push({ it, holder: run });
      if (run?.pick?.fixFull) jobs.push({ it, holder: run.pick });
    }
  }
  const res = parseTexts(jobs.map((j) => j.holder.fixFull), 'fixes');
  jobs.forEach((j, k) => { j.holder.fixParses = j.it.lang === 'r' ? res.r[k] : res.py[k]; });
}

// ---------------------------------------------------------------- K-diag: the scorer's signals, read from the source
function readSignals() {
  const src = fs.readFileSync(path.join(WEB, 'src/poster/readability.ts'), 'utf8');
  const start = src.indexOf('export function detectLanguage');
  if (start < 0) return null;
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const sigs = [...body.matchAll(/if \(\/(.+?)\/\.test\(\w+\)\) (rScore|pyScore) \+= (\d+);/g)]
    .map((m) => ({ re: new RegExp(m[1]), src: m[1], side: m[2] === 'rScore' ? 'r' : 'python', w: Number(m[3]) }));
  return sigs.length ? sigs : null;
}
function diagScore(sigs, code) {
  const fired = sigs.filter((s) => s.re.test(code));
  const r = fired.filter((s) => s.side === 'r').reduce((a, s) => a + s.w, 0);
  const py = fired.filter((s) => s.side === 'python').reduce((a, s) => a + s.w, 0);
  const verdict = r === 0 && py === 0 ? null : r > py ? 'r' : py > r ? 'python' : null;
  return { r, py, verdict, why: r === 0 && py === 0 ? 'no-signal' : r === py ? 'tie' : 'scored', fired: fired.map((s) => `${s.side === 'r' ? 'R' : 'Py'}+${s.w} /${s.src}/`) };
}

// ---------------------------------------------------------------- the panel, read from the DOM
const CODE_BOX = 'Your R or Python plotting code';
/**
 * The label beside Check (without its screen-reader-only text), the button,
 * the fresh table, the panel's live regions and the page's text.
 */
function readState(page) {
  return page.evaluate(() => {
    const ta = [...document.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Your R or Python plotting code');
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '▶ Check');
    const slot = btn?.previousElementSibling ?? null;
    let label = null;
    if (slot) {
      const copyOf = slot.cloneNode(true);
      copyOf.querySelectorAll('.sr-only').forEach((e) => e.remove());
      label = copyOf.textContent.trim();
    }
    let root = ta;
    while (root && !root.textContent.includes('Code Readability Check')) root = root.parentElement;
    const regions = root ? [...root.querySelectorAll('[aria-live], [role="status"], [role="alert"]')] : [];
    const live = regions.map((e) => e.textContent.trim()).filter(Boolean).join(' | ');
    // The regions marked before the last press (markLive): only they can
    // announce it.
    const liveOld = regions.filter((e) => e.dataset.zqRegion).map((e) => e.textContent.trim()).filter(Boolean).join(' | ');
    const table = [...document.querySelectorAll('table')].find((t) => !t.dataset.zqOld && /Element/.test(t.querySelector('thead')?.textContent ?? ''));
    const anyTable = [...document.querySelectorAll('table')].some((t) => /Element/.test(t.querySelector('thead')?.textContent ?? ''));
    const rows = table ? [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((c) => c.textContent.trim())) : [];
    const pressed = [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim());
    const pre = table ? [...table.parentElement.querySelectorAll('pre')].map((p) => p.textContent).join('\n').slice(0, 300) : '';
    // The edited script the page hands back (the block holding "Copy edited
    // code"; "Copy corrected code" before the claims audit).
    const copy = table ? [...table.parentElement.querySelectorAll('button')].find((b) => /^Copy (corrected|edited) code$/.test(b.textContent.trim())) : null;
    const fixFull = copy?.parentElement?.parentElement?.querySelector('pre')?.textContent ?? null;
    return {
      code: ta?.value ?? null, label, checkDisabled: btn ? btn.disabled : null, pressed, live, liveOld,
      outOfDate: /out of date/i.test(root?.innerText ?? ''),
      table: !!table, anyTable, rows, fix: pre, fixFull, text: document.body.innerText,
    };
  });
}
/**
 * Mark the panel's live regions, and every element inside them, so a child
 * replaced by Check (an announcement re-added with the same words) can be
 * told from one left alone, and a region that was there before the press
 * from one inserted with its text.
 */
const markLive = (page) => page.evaluate(() => {
  document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').forEach((r) => {
    r.dataset.zqRegion = '1';
    r.querySelectorAll('*').forEach((e) => { e.dataset.zqLive = '1'; });
  });
});
const liveReplaced = (page) => page.evaluate(() => {
  let root = [...document.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Your R or Python plotting code');
  while (root && !root.textContent.includes('Code Readability Check')) root = root.parentElement;
  return [...(root ?? document).querySelectorAll('[data-zq-region]')]
    .some((r) => [...r.querySelectorAll('*')].some((e) => !e.dataset.zqLive && e.textContent.trim()));
});
/** Watch the panel (the code box's ancestor that holds "Code Readability Check") for DOM changes. */
function watchPanel(page) {
  return page.evaluate(() => {
    let root = [...document.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Your R or Python plotting code');
    while (root && !root.textContent.includes('Code Readability Check')) root = root.parentElement;
    window.__zq = { n: 0, kinds: [] };
    window.__zqObs?.disconnect();
    window.__zqObs = new MutationObserver((ms) => {
      for (const m of ms) { window.__zq.n += 1; if (window.__zq.kinds.length < 5) window.__zq.kinds.push(`${m.type}:${m.target.nodeName}`); }
    });
    window.__zqObs.observe(root ?? document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    return !!root;
  });
}
const readWatch = (page) => page.evaluate(() => { window.__zqObs?.disconnect(); return window.__zq; });
/** Lines of visible text that are new after Check, the editor's save clock aside. */
const newLines = (before, after) => after.split('\n').filter((l) => l.trim() && !AMBIENT.test(l.trim()) && !before.includes(l));
const markOld = (page) => page.evaluate(() => document.querySelectorAll('table').forEach((t) => { t.dataset.zqOld = '1'; }));
const uiLang = (label) => {
  if (label == null) return undefined;
  if (/^Detected: R\b/.test(label)) return 'r';
  if (/^Detected: Python\b/.test(label)) return 'python';
  if (label === 'Auto-detect waiting for code…') return null;
  // "Can’t tell R from Python. Pick one above." (the claims audit's copy),
  // and the answer Check gives since fix 15.
  if (/tell R from Python/i.test(label)) return null;
  return `other:${label}`;
};

/** Press Check and read what changed. */
async function pressCheck(page) {
  const before = await readState(page);
  if (before.checkDisabled) return { before, after: before, clicked: false, mut: { n: 0, kinds: [] }, announced: false };
  await markOld(page);
  await markLive(page);
  const rooted = await watchPanel(page);
  await page.getByRole('button', { name: '▶ Check' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('table')].some((t) => !t.dataset.zqOld && /Element/.test(t.textContent)),
    null, { timeout: 1200 },
  ).catch(() => {});
  await page.waitForTimeout(150);
  const mut = await readWatch(page);
  const after = await readState(page);
  const announced = !!after.liveOld && (after.liveOld !== before.live || await liveReplaced(page));
  return { before, after, clicked: true, rooted, mut, announced };
}

/** One script: Auto, paste, read, Check, and (if nothing rendered) the true language pressed by hand. */
async function checkScript(page, it) {
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByLabel(CODE_BOX).fill(it.code);
  const run = await pressCheck(page);
  const rec = {
    labelBefore: run.before.label, uiLang: uiLang(run.before.label), checkDisabled: run.before.checkDisabled,
    clicked: run.clicked, table: run.after.table, labelAfter: run.after.label, rows: run.after.rows.map((r) => `${r[0]} ${r[4] ?? ''}`.trim()),
    fix: run.after.fix, fixFull: run.after.fixFull, mutations: run.mut.n, mutationKinds: run.mut.kinds, panelFound: run.rooted !== false,
    textChanged: newLines(run.before.text, run.after.text).length > 0,
    newText: newLines(run.before.text, run.after.text).slice(0, 5),
    live: run.after.live, announced: run.announced,
  };
  if (!rec.table && (it.lang === 'r' || it.lang === 'python')) {
    await page.getByRole('button', { name: it.lang === 'r' ? 'R' : 'Python', exact: true }).click();
    const pick = await pressCheck(page);
    rec.pick = {
      table: pick.after.table, label: pick.after.label, rows: pick.after.rows.length, fix: pick.after.fix.slice(0, 120), fixFull: pick.after.fixFull,
      newText: newLines(pick.before.text, pick.after.text).slice(0, 5), live: pick.after.live, announced: pick.announced,
    };
  }
  return rec;
}

/** A good result on screen first (the control script), then this script and Check. */
async function priorThenScript(page, controlCode, it) {
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByLabel(CODE_BOX).fill(controlCode);
  const first = await pressCheck(page);
  if (!first.after.table) throw new Error(`prior-result run: the control script rendered no table (${it.id})`);
  await page.getByLabel(CODE_BOX).fill(it.code);
  const typed = await readState(page);
  const run = await pressCheck(page);
  return {
    resultKeptWhileTyping: typed.anyTable, resultAfterCheck: run.after.anyTable,
    newText: newLines(run.before.text, run.after.text).slice(0, 5),
    vanished: typed.anyTable && !run.after.anyTable,
    vanishedSilently: typed.anyTable && !run.after.anyTable && !run.after.table && newLines(run.before.text, run.after.text).length === 0,
    keptMarkedOutOfDate: run.after.anyTable && !run.after.table && run.after.outOfDate,
    label: run.after.label,
  };
}

/** Record every text added to the panel's live regions from now on (nodes added, text changed). */
const watchLive = (page) => page.evaluate(() => {
  let root = [...document.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Your R or Python plotting code');
  while (root && !root.textContent.includes('Code Readability Check')) root = root.parentElement;
  window.__zqLive = [];
  window.__zqLiveObs?.disconnect();
  window.__zqLiveObs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') { window.__zqLive.push(m.target.textContent.trim()); continue; }
      for (const n of m.addedNodes) if (n.textContent.trim()) window.__zqLive.push(n.textContent.trim());
    }
  });
  for (const r of (root ?? document).querySelectorAll('[aria-live], [role="status"], [role="alert"]')) {
    window.__zqLiveObs.observe(r, { subtree: true, childList: true, characterData: true });
  }
});
const readLive = (page) => page.evaluate(() => { window.__zqLiveObs?.disconnect(); return window.__zqLive ?? []; });

/**
 * REPEAT and RESIZE: what the live region says when nothing is pressed but
 * the code, the language or the print size changes and changes back. Each
 * step records the texts added to the region; an earlier answer among them
 * was said again without a press.
 */
async function answerSequence(page, it, { sizes }) {
  const steps = [];
  const answers = [];
  const check = async () => {
    const run = await pressCheck(page);
    if (run.after.live) answers.push(run.after.live);
    return run;
  };
  /** The region's text now, if it still holds an answer given at an earlier press. */
  const kept = async () => {
    const live = (await readState(page)).live;
    return answers.some((a) => live.includes(a)) ? live : null;
  };
  const step = async (what, act) => {
    await watchLive(page);
    const midway = await act();
    await page.waitForTimeout(200);
    const added = await readLive(page);
    steps.push({ what, added, repeated: added.filter((t) => answers.includes(t)), kept: midway ?? null });
  };
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByLabel(CODE_BOX).fill(it.code);
  const first = await check();
  const other = it.lang === 'r' ? 'Python' : 'R';
  await step(`${other}, then Auto`, async () => {
    await page.getByRole('button', { name: other, exact: true }).click();
    await page.waitForTimeout(100);
    const midway = await kept();
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    return midway;
  });
  await check();
  await step('a character typed at the end and deleted', async () => {
    const box = page.getByLabel(CODE_BOX);
    await box.focus();
    // The caret at the end, as a click after the last character puts it.
    await box.evaluate((t) => t.setSelectionRange(t.value.length, t.value.length));
    await page.keyboard.type('x');
    await page.waitForTimeout(100);
    const midway = await kept();
    await page.keyboard.press('Backspace');
    return midway;
  });
  let resize = null;
  if (sizes) {
    await check();
    const presets = page.locator('[aria-label="Print size presets"] button');
    const back = await page.locator('[aria-label="Print size presets"] button[aria-pressed="true"]').first().textContent();
    const away = page.locator('[aria-label="Print size presets"] button[aria-pressed="false"]').first();
    const before = await readState(page);
    await markLive(page);
    await step('another print size', () => away.click());
    const after = await readState(page);
    resize = {
      tableBefore: before.anyTable, tableAfter: after.anyTable,
      said: !!after.liveOld && (after.liveOld !== before.live || await liveReplaced(page)), live: after.live, label: after.label,
    };
    await step('the print size it was checked at', () => presets.filter({ hasText: back }).first().click());
  }
  return { firstTable: first.after.table, answers, steps, resize };
}

// ---------------------------------------------------------------- collect
async function collect(items) {
  const stampFile = path.join(WEB, 'public/version.json');
  const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile) : null;
  restoreStamp = () => { if (stamp !== null) fs.writeFileSync(stampFile, stamp); };
  const h = await startHarness({ name: 'language-detect-check', port: PORT });
  const pageErrors = [];
  const out = { git: h.git, engine: h.engine, mutant: h.mutant, page: {}, editor: {}, prior: {}, editorPrior: {}, sequence: {}, module: {}, emptyDisabled: {} };
  try {
    const context = await h.browser.newContext({ viewport: { width: 1280, height: 900 } });
    const state = { userId: 'zq-lang-user', row: null, saves: [], aborted: [], errors: [] };
    await installMocks(context, state, h.base);
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`page: ${String(e).slice(0, 200)}`));
    const openPage = async () => {
      await page.goto(`${h.base}/tools/figure-readability`);
      await page.getByLabel(CODE_BOX).waitFor({ timeout: 90000 });
    };
    await openPage();
    // Generated scripts, through the app's own codegen modules.
    for (const it of items.filter((x) => x.generated)) {
      const g = it.generated;
      it.code = await page.evaluate(async ({ module, exp, spec, mode }) => (await import(module))[exp](spec, mode),
        { module: g.module, exp: g.export, spec: g.spec, mode: g.mode });
    }
    // Unit level, in the page, through the app's own module.
    const codes = items.map((it) => it.code);
    const mod = await page.evaluate(async (all) => {
      const m = await import('/src/poster/readability.ts');
      const strip = typeof m.stripComments === 'function' ? m.stripComments : null;
      // Fix 15 on: the plotting system and the scorer's own breakdown.
      const describe = typeof m.describePlotCode === 'function' ? m.describePlotCode : null;
      const explain = typeof m.languageSignals === 'function' ? m.languageSignals : null;
      return all.map((c) => ({
        raw: m.detectLanguage(c), stripped: strip ? m.detectLanguage(strip(c)) : undefined,
        system: describe ? describe(c).system : undefined, explain: explain ? explain(c) : null,
      }));
    }, codes);
    items.forEach((it, k) => { out.module[`${it.corpus}/${it.id}`] = mod[k]; });
    out.emptyDisabled.page = (await readState(page)).checkDisabled;
    const controls = Object.fromEntries(items.filter((x) => x.id === 'r-gg-control.R' || x.id === 'py-mpl-control.py').map((x) => [x.lang, x.code]));

    let n = 0;
    for (const it of items) {
      await openPage();
      out.page[`${it.corpus}/${it.id}`] = await checkScript(page, it);
      if (++n % 50 === 0) log(`[harness] page: ${n}/${items.length}`);
    }
    // Prior-result runs on the page, for every everyday script that rendered nothing.
    for (const it of items.filter((x) => x.corpus === 'everyday' && !out.page[`everyday/${x.id}`].table)) {
      if (!controls.r) break;
      await openPage();
      out.prior[`everyday/${it.id}`] = await priorThenScript(page, it.lang === 'python' ? controls.python : controls.r, it);
    }
    // REPEAT and RESIZE, on three scripts.
    for (const it of items.filter((x) => x.corpus === 'everyday' && SEQUENCE_SCRIPTS.includes(x.id))) {
      await openPage();
      out.sequence[`page ${it.id}`] = await answerSequence(page, it, { sizes: it.id === 'r-gg-control.R' });
    }
    await context.close();

    if (!NO_EDITOR) {
      const edItems = items.filter((x) => EDITOR_ALL || x.corpus === 'everyday' || (x.corpus === 'gate' && GATE_EDITOR.includes(x.id)));
      const ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 } });
      ed.page.on('pageerror', (e) => pageErrors.push(`editor: ${String(e).slice(0, 200)}`));
      const tabs = ed.page.locator('button[data-postr-tab]');
      const figureTab = tabs.filter({ hasText: /^figure$/i });
      const otherTab = tabs.filter({ hasNotText: /^figure$/i }).first();
      const openPanel = async () => {
        await otherTab.click();
        await figureTab.click();
        if (!(await ed.page.getByLabel(CODE_BOX).isVisible().catch(() => false))) {
          await ed.page.getByRole('button', { name: 'Check a figure' }).click();
        }
        await ed.page.getByLabel(CODE_BOX).waitFor({ timeout: 10000 });
        const s = await readState(ed.page);
        if (s.code !== '' || s.anyTable) throw new Error(`K-reset: the editor panel was not empty before a script (code ${JSON.stringify(s.code?.slice(0, 40))}, table ${s.anyTable})`);
        return s;
      };
      try {
        out.emptyDisabled.editor = (await openPanel()).checkDisabled;
        for (const it of edItems) {
          await openPanel();
          out.editor[`${it.corpus}/${it.id}`] = await checkScript(ed.page, it);
        }
        for (const it of edItems.filter((x) => x.corpus === 'everyday' && !out.editor[`everyday/${x.id}`].table)) {
          await openPanel();
          out.editorPrior[`everyday/${it.id}`] = await priorThenScript(ed.page, it.lang === 'python' ? controls.python : controls.r, it);
        }
        for (const it of edItems.filter((x) => x.corpus === 'everyday' && SEQUENCE_SCRIPTS.includes(x.id))) {
          await openPanel();
          out.sequence[`editor ${it.id}`] = await answerSequence(ed.page, it, { sizes: false });
        }
      } finally {
        await ed.context.close();
      }
    }
  } finally {
    await h.stop();
    restoreStamp();
    restoreStamp = () => {};
  }
  out.pageErrors = pageErrors;
  return out;
}

// ---------------------------------------------------------------- score
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
/** Does the visible label slot answer that the script's system is not supported? */
const saysUnsupported = (it, label) => !!label && !!SYSTEM_WORDS[it.system]?.test(label) && UNSUPPORTED_WORDS.test(label) && SUPPORTED_NAMED(label);
function classify(it, r) {
  if (!r) return null;
  if (r.table) {
    const l = uiLang(r.labelAfter);
    if (it.lang === null) return 'WRONG';
    return l === it.lang ? 'table' : 'WRONG';
  }
  if (!r.clicked) return 'disabled';
  if (r.mutations === 0 && !r.textChanged) return 'DEAD';
  if (CANNOT_TELL(r.labelAfter ?? '')) return 'cannot-tell';
  if (UNSUPPORTED_WORDS.test(r.labelAfter ?? '')) return 'unsupported';
  return 'message';
}

function score(items, got, parse, sigs) {
  const controls = [];
  const claims = { DEAD: [], LABEL: [], WRONG: [], NOANSWER: [], SYSTEM: [], REFUSED: [], SILENT: [], VANISH: [], REPEAT: [], KEPT: [], RESIZE: [] };
  const ctl = (name, ok, detail) => controls.push({ name, ok, detail });
  for (const entry of ['page', ...(NO_EDITOR ? [] : ['editor'])]) {
    const runs = got[entry];
    if (CORPORA.includes('everyday')) {
      for (const [id, want] of [['r-gg-control.R', 'r'], ['py-mpl-control.py', 'python']]) {
        const r = runs[`everyday/${id}`];
        ctl(`K-ctl ${entry} ${id}`, !!r && r.table && uiLang(r.labelAfter) === want, r ? `table ${r.table}, label ${r.labelAfter}` : 'not run');
      }
    }
    ctl(`K-empty ${entry}`, got.emptyDisabled[entry] === true, `Check disabled on an empty box: ${got.emptyDisabled[entry]}`);
  }
  let agreeRaw = 0;
  let agreeAny = 0;
  let agreeN = 0;
  const disagree = [];
  for (const it of items) {
    const key = `${it.corpus}/${it.id}`;
    const m = got.module[key];
    for (const entry of ['page', 'editor']) {
      const r = got[entry][key];
      if (!r || typeof r.uiLang === 'string' && r.uiLang.startsWith('other:') || r.uiLang === undefined) continue;
      agreeN += 1;
      if (r.uiLang === m.raw) agreeRaw += 1;
      if (r.uiLang === m.raw || r.uiLang === m.stripped) agreeAny += 1;
      else disagree.push(`${entry} ${key}: label ${r.uiLang}, module ${m.raw}/${m.stripped}`);
    }
  }
  ctl('K-agree', disagree.length === 0 && agreeN > 0, `${agreeAny}/${agreeN} labels match detectLanguage (raw ${agreeRaw}/${agreeN})${disagree.length ? `; ${disagree.slice(0, 3).join('; ')}` : ''}`);
  if (items.some((it) => got.module[`${it.corpus}/${it.id}`].explain)) {
    const bad = items.filter((it) => { const m = got.module[`${it.corpus}/${it.id}`]; return m.explain?.verdict !== m.raw; });
    ctl('K-diag', bad.length === 0, `${items.length - bad.length}/${items.length} scripts: the module's languageSignals verdict equals detectLanguage${bad.length ? `; first: ${bad[0].corpus}/${bad[0].id}` : ''}`);
  } else if (sigs) {
    const bad = items.filter((it) => diagScore(sigs, it.code).verdict !== got.module[`${it.corpus}/${it.id}`].raw);
    ctl('K-diag', bad.length === 0, `${items.length - bad.length}/${items.length} scripts scored alike by the ${sigs.length} source signals${bad.length ? `; first: ${bad[0].corpus}/${bad[0].id}` : ''}`);
  } else controls.push({ name: 'K-diag', ok: true, detail: 'skipped: detectLanguage no longer has the if (/re/.test(x)) score += n shape, and the module exports no languageSignals' });
  const labelBad = items.filter((it) => it.corpus === 'everyday' && !it.noParse && (
    (it.lang === 'r' && it.parsesR === false) || (it.lang === 'python' && it.parsesPy === false)));
  const labelOk = (it) => (it.lang === 'r' ? parse.r === 'ran' : it.lang === 'python' ? parse.py === 'ran' : true);
  ctl('K-label', labelBad.length === 0, `R ${parse.r}, Python ${parse.py}; ${labelBad.length} labelled snippet(s) fail to parse in their own language${labelBad.length ? `: ${labelBad.map((x) => x.id).join(', ')}` : ''}${items.some((it) => !labelOk(it)) ? ' (some labels by construction only)' : ''}`);
  ctl('K-errors', got.pageErrors.length === 0, got.pageErrors.slice(0, 3).join(' | ') || 'none');

  const rows = [];
  for (const it of items) {
    const key = `${it.corpus}/${it.id}`;
    const m = got.module[key];
    const d = sigs ? diagScore(sigs, it.code) : null;
    const row = {
      key, corpus: it.corpus, lang: it.lang, system: it.system, supported: it.supported,
      parsesR: it.parsesR, parsesPy: it.parsesPy, detect: m.raw, detectStripped: m.stripped, detectSystem: m.system,
      why: m.explain ? (m.explain.r === 0 && m.explain.py === 0 ? 'no-signal' : m.explain.r === m.explain.py ? 'tie' : 'scored') : d?.why,
      fired: m.explain ? m.explain.fired : d?.fired,
      page: classify(it, got.page[key]), editor: classify(it, got.editor[key]),
      pageRun: got.page[key], editorRun: got.editor[key], prior: got.prior[key], editorPrior: got.editorPrior[key],
    };
    rows.push(row);
    for (const entry of ['page', 'editor']) {
      const r = got[entry][key];
      if (!r) continue;
      if (row[entry] === 'DEAD') claims.DEAD.push(`${entry} ${key}`);
      if (row[entry] === 'WRONG') claims.WRONG.push(`${entry} ${key} (true ${it.lang}, shown ${r.labelAfter})`);
      if (r.labelBefore === 'Auto-detect waiting for code…' && it.code.trim()) claims.LABEL.push(`${entry} ${key}`);
      if (r.clicked && r.uiLang === null && !r.table && !CANNOT_TELL(r.labelAfter ?? '')) claims.NOANSWER.push(`${entry} ${key} (label after: ${r.labelAfter})`);
      if (r.clicked && !r.announced) claims.SILENT.push(`${entry} ${key}`);
      if (r.pick && !r.pick.announced) claims.SILENT.push(`${entry} ${key} (after the hand pick)`);
      if (!it.supported && SYSTEM_WORDS[it.system]) {
        const last = r.pick ?? { table: r.table, label: r.labelAfter };
        if (last.table || !saysUnsupported(it, last.label)) {
          claims.SYSTEM.push(`${entry} ${key} (${it.system}${r.pick ? ', after the hand pick' : ''}: ${last.table ? 'a table' : 'no table'}, label ${last.label})`);
        }
      }
      if (it.supported && (row[entry] === 'unsupported' || (r.pick && !r.pick.table && UNSUPPORTED_WORDS.test(r.pick.label ?? '')))) {
        claims.REFUSED.push(`${entry} ${key} (${it.system}: ${row[entry] === 'unsupported' ? r.labelAfter : `after the hand pick: ${r.pick.label}`})`);
      }
      const prior = entry === 'page' ? row.prior : row.editorPrior;
      if (prior?.vanished) claims.VANISH.push(`${entry} ${key}${prior.vanishedSilently ? ' (with no message)' : ''}`);
    }
  }
  if (CORPORA.includes('everyday')) {
    const want = SEQUENCE_SCRIPTS.flatMap((id) => ['page', ...(NO_EDITOR ? [] : ['editor'])].map((e) => `${e} ${id}`));
    const missing = want.filter((k) => !got.sequence[k]);
    ctl('K-sequence', missing.length === 0 && got.sequence[`page r-gg-control.R`]?.firstTable === true && got.sequence[`page r-gg-control.R`]?.resize?.tableBefore === true,
      missing.length ? `not run: ${missing.join(', ')}` : 'every sequence ran; the size steps started from a table');
    for (const [key, sq] of Object.entries(got.sequence)) {
      for (const st of sq.steps) if (st.repeated.length) claims.REPEAT.push(`${key}: ${st.what}: "${st.repeated[0].slice(0, 70)}"`);
      for (const st of sq.steps) if (st.kept) claims.KEPT.push(`${key}: ${st.what}: "${st.kept.slice(0, 70)}"`);
      if (sq.resize && sq.resize.tableBefore && !sq.resize.tableAfter && !sq.resize.said) claims.RESIZE.push(`${key}: the table hidden, the live region ${sq.resize.live ? `still "${sq.resize.live.slice(0, 50)}"` : 'empty'}, label "${sq.resize.label}"`);
    }
  }
  const controlsOk = controls.every((c) => c.ok);
  const observed = Object.values(claims).reduce((a, v) => a + v.length, 0);
  return { controls, claims, rows, exit: !controlsOk ? 2 : observed ? 1 : 0 };
}

function report(items, res, parse, got) {
  const p = (s = '') => process.stdout.write(`${s}\n`);
  p(`language-detect-check  git ${got.git}  engine ${got.engine}${got.mutant ? `  MUTANT ${got.mutant}` : ''}  corpora ${CORPORA.join(',')}  scripts ${items.length}`);
  p('\nCONTROLS');
  for (const c of res.controls) p(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  p('\nDETECTION (the app\'s detectLanguage, raw code | comment-stripped)');
  p('  corpus    lang    system      n   right  null  wrong |  right  null  wrong');
  const groups = new Map();
  for (const r of res.rows) {
    const k = `${r.corpus}|${r.lang}|${r.system}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const tally = (rs, f) => [rs.filter((r) => r[f] === r.lang && r.lang).length, rs.filter((r) => r[f] === null).length, rs.filter((r) => r[f] !== null && r[f] !== r.lang).length];
  for (const [k, rs] of groups) {
    const [c, l, s] = k.split('|');
    const a = tally(rs, 'detect');
    const b = tally(rs, 'detectStripped');
    p(`  ${c.padEnd(9)} ${String(l).padEnd(7)} ${s.padEnd(10)} ${String(rs.length).padStart(3)}  ${String(a[0]).padStart(5)} ${String(a[1]).padStart(5)} ${String(a[2]).padStart(6)} | ${String(b[0]).padStart(5)} ${String(b[1]).padStart(5)} ${String(b[2]).padStart(6)}`);
  }
  const all = tally(res.rows, 'detect');
  const allS = tally(res.rows, 'detectStripped');
  p(`  ALL ${res.rows.length}: raw right ${all[0]} null ${all[1]} wrong ${all[2]} | stripped right ${allS[0]} null ${allS[1]} wrong ${allS[2]}`);
  const ev = res.rows.filter((r) => r.corpus === 'everyday');
  if (ev.length) {
    const idf = ev.filter((r) => r.parsesR != null && r.parsesPy != null && r.parsesR !== r.parsesPy && r.lang);
    const amb = ev.filter((r) => r.parsesR === true && r.parsesPy === true && r.lang);
    const t1 = tally(idf, 'detect');
    const t2 = tally(amb, 'detect');
    p(`  everyday, parses in ONE language only (syntax decides): n ${idf.length}  right ${t1[0]} null ${t1[1]} wrong ${t1[2]}`);
    p(`  everyday, parses in BOTH languages (intent decides):    n ${amb.length}  right ${t2[0]} null ${t2[1]} wrong ${t2[2]}`);
    const sup = ev.filter((r) => r.supported);
    const ts = tally(sup, 'detect');
    p(`  everyday, systems the page supports: n ${sup.length}  right ${ts[0]} null ${ts[1]} wrong ${ts[2]}`);
  }
  if (ev.length) {
    // The app's plotting system (describePlotCode, fix 15 on); before it, the
    // system a language stood for: R meant ggplot2, Python matplotlib.
    const family = (s) => (s === 'seaborn' || s === 'pandas' ? 'matplotlib' : s);
    const implied = (r) => (r.detectSystem !== undefined ? r.detectSystem : r.detect === 'r' ? 'ggplot2' : r.detect === 'python' ? 'matplotlib' : null);
    p(`\nPLOTTING SYSTEM, everyday (${ev[0].detectSystem !== undefined ? "the module's describePlotCode" : 'implied by the language: R = ggplot2, Python = matplotlib'})`);
    p('  system      n   right  none  wrong');
    const bySys = new Map();
    for (const r of ev) { const k = r.system; if (!bySys.has(k)) bySys.set(k, []); bySys.get(k).push(r); }
    for (const [k, rs] of bySys) {
      const want = family(k) === 'none' ? null : family(k);
      const right = rs.filter((r) => implied(r) === want).length;
      const none = rs.filter((r) => implied(r) === null && want !== null).length;
      p(`  ${k.padEnd(10)} ${String(rs.length).padStart(3)}  ${String(right).padStart(5)} ${String(none).padStart(5)} ${String(rs.length - right - none).padStart(6)}`);
    }
  }
  p('\nWHAT THE USER SEES (outcome after pressing Check: table = right language, DEAD = nothing changed, WRONG, cannot-tell, unsupported, message, disabled)');
  for (const entry of ['page', 'editor']) {
    const rs = res.rows.filter((r) => r[entry]);
    if (!rs.length) continue;
    const by = {};
    for (const r of rs) by[r[entry]] = (by[r[entry]] ?? 0) + 1;
    p(`  ${entry.padEnd(6)} n ${rs.length}: ${Object.entries(by).map(([k, v]) => `${k} ${v} (${pct(v, rs.length)})`).join(', ')}`);
    const dead = rs.filter((r) => r[entry] === 'DEAD');
    const picks = dead.filter((r) => r[`${entry}Run`].pick);
    p(`         DEAD then the true language pressed by hand: ${picks.filter((r) => r[`${entry}Run`].pick.table).length}/${picks.length} render a table`);
    const pr = rs.filter((r) => r[entry === 'page' ? 'prior' : 'editorPrior']).map((r) => r[entry === 'page' ? 'prior' : 'editorPrior']);
    if (pr.length) {
      p(`         a good result on screen, then a script that rendered no table and Check: the result vanished in ${pr.filter((x) => x.vanished).length}/${pr.length}` +
        ` (with no message ${pr.filter((x) => x.vanishedSilently).length}); kept and marked out of date ${pr.filter((x) => x.keptMarkedOutOfDate).length}/${pr.length}`);
    }
    const sr = rs.filter((r) => r[`${entry}Run`]?.clicked);
    p(`         a live region announced the outcome of Check in ${sr.filter((r) => r[`${entry}Run`].announced).length}/${sr.length}`);
  }
  p('\nOUTCOME BY SYSTEM, everyday (the first press -> after the hand pick of the true language, when one was made)');
  for (const entry of ['page', 'editor']) {
    const rs = res.rows.filter((r) => r.corpus === 'everyday' && r[entry]);
    if (!rs.length) continue;
    const bySys = new Map();
    for (const r of rs) { if (!bySys.has(r.system)) bySys.set(r.system, []); bySys.get(r.system).push(r); }
    for (const [k, list] of bySys) {
      const tally = {};
      for (const r of list) {
        const pick = r[`${entry}Run`].pick;
        const after = pick ? (pick.table ? 'table' : UNSUPPORTED_WORDS.test(pick.label ?? '') ? 'unsupported' : 'no table') : null;
        const key = after ? `${r[entry]}->${after}` : r[entry];
        tally[key] = (tally[key] ?? 0) + 1;
      }
      p(`  ${entry.padEnd(6)} ${k.padEnd(10)} n ${String(list.length).padStart(2)}: ${Object.entries(tally).map(([t, v]) => `${t} ${v}`).join(', ')}`);
    }
  }
  p('\nTHE LIVE REGION BETWEEN PRESSES (texts added when nothing was pressed: an earlier answer among them is REPEAT; one still there midway is KEPT)');
  for (const [key, sq] of Object.entries(got.sequence)) {
    for (const st of sq.steps) p(`  ${key.padEnd(32)} ${st.what.padEnd(44)} added ${st.added.length}${st.added.length ? `: ${st.added.map((t) => JSON.stringify(t.slice(0, 50))).join(', ')}` : ''}${st.kept ? `; midway still "${st.kept.slice(0, 40)}"` : ''}`);
    if (sq.resize) p(`  ${key.padEnd(32)} ${'a new print size: table before/after'.padEnd(44)} ${sq.resize.tableBefore}/${sq.resize.tableAfter}, said ${sq.resize.said}${sq.resize.live ? ` ("${sq.resize.live.slice(0, 60)}")` : ''}`);
  }
  p('\nTHE EDITED CODE THE PAGE OFFERS, parsed in the script\'s own language (R parse() / Python ast)');
  for (const entry of ['page', 'editor']) {
    const rs = res.rows.filter((r) => r[`${entry}Run`]);
    if (!rs.length) continue;
    const line = (name, runs) => {
      const offered = runs.filter((x) => x && x.fixFull);
      const parsed = offered.filter((x) => x.fixParses === true).length;
      const broken = offered.filter((x) => x.fixParses === false).length;
      p(`  ${entry.padEnd(6)} ${name.padEnd(44)} offered ${String(offered.length).padStart(3)}  parses ${String(parsed).padStart(3)}  does not ${String(broken).padStart(3)}`);
    };
    line('right language, supported system', rs.filter((r) => r[entry] === 'table' && r.supported).map((r) => r[`${entry}Run`]));
    line('right language, unsupported system', rs.filter((r) => r[entry] === 'table' && !r.supported).map((r) => r[`${entry}Run`]));
    line('WRONG language', rs.filter((r) => r[entry] === 'WRONG').map((r) => r[`${entry}Run`]));
    line('DEAD, then the true language pressed by hand', rs.filter((r) => r[entry] === 'DEAD').map((r) => r[`${entry}Run`].pick));
  }
  p('\nCLAIMS');
  for (const [k, v] of Object.entries(res.claims)) {
    p(`  ${k.padEnd(8)} ${v.length}`);
    for (const x of v.slice(0, 40)) p(`         ${x}`);
    if (v.length > 40) p(`         … ${v.length - 40} more`);
  }
  p('\nNULLS AND WRONG PICKS (raw code), with the signals that fired');
  for (const r of res.rows.filter((x) => x.detect === null && x.lang || (x.detect !== null && x.detect !== x.lang))) {
    const yn = (v) => (v == null ? '?' : v ? 'y' : 'n');
    p(`  ${r.key.padEnd(48)} true ${String(r.lang).padEnd(6)} got ${String(r.detect).padEnd(6)} parses R:${yn(r.parsesR)} Py:${yn(r.parsesPy)}  ${String(r.why).padEnd(9)} ${(r.fired ?? []).join(' ')}`);
  }
}

// ---------------------------------------------------------------- main
try {
  if (path.resolve(process.cwd()) !== WEB) fail(`run from ${WEB}`);
  const items = loadCorpus();
  for (const it of items) if (it.file) it.code = fs.readFileSync(it.file, 'utf8');
  fs.mkdirSync(OUT, { recursive: true });
  const got = await collect(items);
  const parse = parseAll(items);
  parseFixes(items, got);
  const sigs = readSignals();
  const res = score(items, got, parse, sigs);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ controls: res.controls, claims: res.claims, rows: res.rows }, null, 1));
  report(items, res, parse, got);
  process.stdout.write(`\nresults: ${path.join(OUT, 'results.json')}\nEXIT ${res.exit} (${['no claim observed', 'a claim observed, every control held', 'a control failed'][res.exit]})\n`);
  process.exit(res.exit);
} catch (e) {
  fail(e);
}
