#!/usr/bin/env node
/**
 * blind-spot-check.mjs — does a browser harness notice when a part of a fix
 * that jsdom cannot see is taken away?
 *
 * mutation-check.mjs runs a spec's mutants against vitest. A mutant marked
 * `"expect": "survive"` is a blind spot of those tests (layout, scrolling,
 * focus rings). The process (docs/process/README.md, step 8) requires each
 * blind spot to be falsified in a browser instead. This does that: for
 * every blind spot, it serves the mutant through the browser harness
 * (POSTR_MUTANT, lib/editorHarness.mjs) and runs the scenarios the spec
 * names. The blind spot is GUARDED only if they go red (harness exit 1).
 *
 * SPEC: each blind spot names its browser check.
 *   "tour-no-scroll": {
 *     "expect": "survive", "why": "…",
 *     "browser": { "harness": "scripts/fit-check.mjs", "scenarios": ["tour-export-step-1440"] },
 *     "edits": [...]
 *   }
 * A "browser" entry may add "env" (for example {"POSTR_BROWSER": "webkit"})
 * when only one engine shows the part: the control and the mutant run both
 * get it (fix 13c).
 *
 * A blind spot with no "browser" entry is reported NOT GUARDED, unless it
 * says why no check can or needs to exist, in "unguarded" (with its evidence
 * label): it is then reported ACCEPTED, with the reason, for the claims
 * audit to judge. That is for defensive code no environment reaches, not for
 * a check nobody wrote.
 *
 * The same scenarios run first without any mutant, as the control: they must
 * pass (exit 0), or nothing else means anything and the run stops.
 *
 * RUN (from apps/web)
 *   node scripts/blind-spot-check.mjs ../../docs/fixes/03-fit-whole-sheet.panel.mutants.json [--only a,b]
 *
 * EXIT 0 every blind spot guarded · 1 at least one not guarded · 2 a control
 *      failed, a harness errored, or a bad spec
 *
 * Side effect: the harness rewrites apps/web/public/version.json; restore it
 * with `git checkout -- apps/web/public/version.json`.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSpec, mutate } from './lib/mutants.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const specArg = args.find((a) => !a.startsWith('--'));
if (!specArg) {
  process.stderr.write('usage: node scripts/blind-spot-check.mjs <spec.json> [--only a,b]\n');
  process.exit(2);
}
const specPath = path.resolve(specArg);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;

let spec;
try {
  spec = loadSpec(specPath);
} catch (e) {
  process.stderr.write(`bad spec: ${e.message}\n`);
  process.exit(2);
}
const blind = Object.entries(spec.mutants).filter(([n, m]) => m.expect === 'survive' && (!only || only.includes(n)));
for (const [n, m] of blind) {
  try {
    mutate(WEB, m);
  } catch (e) {
    process.stderr.write(`bad spec, blind spot "${n}": ${e.message}\n`);
    process.exit(2);
  }
}

/** Run one harness with the given scenarios; the mutant (if any) via env. */
function run(harness, scenarios, mutant, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (mutant) env.POSTR_MUTANT = `${specPath}#${mutant}`;
  else delete env.POSTR_MUTANT;
  const r = spawnSync(process.execPath, [harness, '--only', scenarios.join(',')], { cwd: WEB, env, encoding: 'utf8', timeout: 600_000 });
  const all = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n');
  const lines = all.filter((l) => /^\[(OBSERVED|not observed|ERROR|error)/i.test(l));
  // A scenario skipped because a switch hides its control on this tree
  // (lib/editorHarness.mjs SWITCH_OFF; the merge of main, record 30, into
  // record 29) measured nothing: its exit 0 is not "not guarded".
  const switchOff = all.filter((l) => /^\[skipped\]/.test(l) && l.includes('skipped (switch off)'));
  return { code: r.status ?? 2, lines: [...lines, ...switchOff], switchOff: switchOff.length };
}

const rows = [];
const controls = new Map(); // harness + scenarios → control result, run once each
for (const [name, m] of blind) {
  if (!m.browser?.harness || !m.browser?.scenarios?.length) {
    rows.push(m.unguarded
      ? { name, verdict: 'ACCEPTED', detail: `unguarded: ${m.unguarded}`, m }
      : { name, verdict: 'NOT GUARDED', detail: 'no "browser" check named in the spec', m });
    continue;
  }
  const harness = path.resolve(WEB, m.browser.harness);
  const extraEnv = m.browser.env ?? {};
  const key = `${harness} ${m.browser.scenarios.join(',')} ${JSON.stringify(extraEnv)}`;
  if (!controls.has(key)) {
    const c = run(harness, m.browser.scenarios, null, extraEnv);
    controls.set(key, c);
    if (c.code !== 0) {
      process.stdout.write(`CONTROL FAILED ${path.basename(harness)} --only ${m.browser.scenarios.join(',')} (exit ${c.code})\n  ${c.lines.join('\n  ')}\n`);
      process.exit(2);
    }
  }
  const r = run(harness, m.browser.scenarios, name, extraEnv);
  const verdict = r.code === 1 ? 'guarded' : r.code === 0 && r.switchOff >= m.browser.scenarios.length ? 'SWITCH OFF' : r.code === 0 ? 'NOT GUARDED' : 'HARNESS ERROR';
  const envNote = Object.keys(extraEnv).length ? ` (${Object.entries(extraEnv).map(([k, v]) => `${k}=${v}`).join(' ')})` : '';
  rows.push({ name, verdict, detail: `${path.basename(harness)} --only ${m.browser.scenarios.join(',')}${envNote} → exit ${r.code}`, lines: r.lines, m });
}

for (const r of rows) {
  process.stdout.write(`${r.verdict.padEnd(13)} ${r.name.padEnd(34)} — undoes: ${r.m.undoes}\n              ${r.detail}\n`);
  for (const l of r.lines ?? []) process.stdout.write(`              · ${l.slice(0, 200)}\n`);
}
const errored = rows.filter((r) => r.verdict === 'HARNESS ERROR').length;
const open = rows.filter((r) => r.verdict === 'NOT GUARDED').length;
const accepted = rows.filter((r) => r.verdict === 'ACCEPTED').length;
const switchedOff = rows.filter((r) => r.verdict === 'SWITCH OFF').length;
process.stdout.write(`\n${rows.length - open - errored - accepted - switchedOff}/${rows.length} blind spots guarded in the browser · ${accepted} accepted unguarded · ${switchedOff} skipped (switch off): their scenario's control is hidden on this tree · controls ${controls.size} passed\n`);
process.exit(errored ? 2 : open ? 1 : 0);
