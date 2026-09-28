#!/usr/bin/env node
/**
 * mutation-check.mjs — does the test suite notice when a fix is taken away?
 *
 * A fix's tests are only evidence if they fail without the fix. Reverting a
 * whole commit shows that for the fix as a whole; this checks each PART of
 * it. A spec file lists "mutants" — small text edits that each undo one part
 * of the fix — and for every mutant the named test files run against the
 * mutated source. A mutant that no test notices ("survived") marks a part of
 * the fix nothing protects.
 *
 * The repo is never written. Mutated sources are served to vitest through a
 * Vite `load` hook, one child process per mutant so no module state leaks
 * between runs. The unmutated code runs first as the control: if it is not
 * all green, nothing else means anything and the run stops.
 *
 * SPEC (JSON; paths relative to apps/web)
 *   {
 *     "tests": ["src/poster/__tests__/sidebarHistory.test.tsx"],
 *     "mutants": {
 *       "no-undo-burst-reset": {
 *         "undoes": "F2 — undo/redo end the edit in progress",
 *         "edits": [["src/stores/posterStore.ts", "exact text", "replacement", 2]]
 *       }
 *     }
 *   }
 *   Each edit's `exact text` must occur exactly as many times as the optional
 *   4th element says (default 1), or the run stops: a pattern that silently
 *   matches nothing would report a mutant as "survived" for the wrong reason.
 *
 * RUN (from apps/web)
 *   node scripts/mutation-check.mjs ../../docs/fixes/01-sidebar-undo-history.mutants.json
 *   node scripts/mutation-check.mjs <spec> --only no-undo-burst-reset,no-noop-skip
 *
 * EXIT  0 every mutant killed · 1 at least one survived · 2 control failed or bad spec
 *
 * Side effect: loading the Vite config rewrites apps/web/public/version.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const REPO = path.resolve(WEB, '../..');

const args = process.argv.slice(2);
const childIdx = args.indexOf('--child');

function loadSpec(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!Array.isArray(spec.tests) || spec.tests.length === 0) throw new Error('spec.tests must list test files');
  if (!spec.mutants || typeof spec.mutants !== 'object') throw new Error('spec.mutants is required');
  return spec;
}

/** Apply a mutant's edits in memory. Returns Map<absPath, mutatedSource>. */
function mutate(mutant) {
  const byFile = new Map();
  for (const [rel, from, to, times = 1] of mutant.edits) {
    const abs = path.join(WEB, rel);
    const src = byFile.get(abs) ?? fs.readFileSync(abs, 'utf8');
    const found = src.split(from).length - 1;
    if (found !== times) {
      throw new Error(`pattern found ${found}× (expected ${times}) in ${rel}: ${JSON.stringify(from.slice(0, 80))}`);
    }
    byFile.set(abs, src.split(from).join(to));
  }
  return byFile;
}

// ---------------------------------------------------------------- child
if (childIdx !== -1) {
  const [, name, specPath, outFile] = args.slice(childIdx);
  const spec = loadSpec(specPath);
  const byFile = name === '(control)' ? new Map() : mutate(spec.mutants[name]);
  const { startVitest } = await import(pathToFileURL(path.join(REPO, 'node_modules/vitest/dist/node.js')).href);
  const plugin = {
    name: 'mutation-check-loader',
    enforce: 'pre',
    load(id) {
      return byFile.get(id.split('?')[0]) ?? null;
    },
  };
  const vitest = await startVitest(
    'test',
    spec.tests,
    { root: WEB, run: true, watch: false, silent: true, reporters: [['json', { outputFile: outFile }]] },
    { plugins: [plugin] },
  );
  await vitest?.close();
  process.exit(0);
}

// ---------------------------------------------------------------- parent
const specArg = args.find((a) => !a.startsWith('--'));
if (!specArg) {
  process.stderr.write('usage: node scripts/mutation-check.mjs <spec.json> [--only a,b]\n');
  process.exit(2);
}
const specPath = path.resolve(specArg);
const spec = loadSpec(specPath);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',')
  : null;
const names = Object.keys(spec.mutants).filter((n) => !only || only.includes(n));

// Validate every pattern before spending minutes on test runs.
for (const n of names) {
  try {
    mutate(spec.mutants[n]);
  } catch (e) {
    process.stderr.write(`bad spec, mutant "${n}": ${e.message}\n`);
    process.exit(2);
  }
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-check-'));
function run(name) {
  const outFile = path.join(outDir, `${name.replace(/[^a-z0-9-]/gi, '_')}.json`);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', name, specPath, outFile], {
    cwd: WEB,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (!fs.existsSync(outFile)) {
    return { error: (child.stderr || child.stdout || 'no output').split('\n').slice(-15).join('\n') };
  }
  const res = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const failed = [];
  for (const f of res.testResults) {
    for (const t of f.assertionResults) if (t.status !== 'passed') failed.push(t.fullName);
  }
  return { total: res.numTotalTests, failed };
}

const control = run('(control)');
if (control.error || control.failed.length > 0 || control.total === 0) {
  process.stderr.write(
    `CONTROL FAILED — the unmutated code is not green, so no mutant result is meaningful.\n${
      control.error ?? control.failed.join('\n')
    }\n`,
  );
  process.exit(2);
}
console.log(`control: ${control.total}/${control.total} pass`);

let survived = 0;
for (const n of names) {
  const r = run(n);
  if (r.error) {
    console.log(`ERROR     ${n}\n${r.error}`);
    process.exit(2);
  }
  const killed = r.failed.length > 0;
  if (!killed) survived += 1;
  console.log(
    `${killed ? 'killed  ' : 'SURVIVED'}  ${n.padEnd(28)} ${String(r.failed.length).padStart(2)}/${r.total} fail  — undoes: ${spec.mutants[n].undoes}`,
  );
  for (const t of r.failed.slice(0, 4)) console.log(`            · ${t}`);
  if (r.failed.length > 4) console.log(`            · … ${r.failed.length - 4} more`);
}
console.log(`\n${names.length - survived}/${names.length} mutants killed${survived ? `, ${survived} SURVIVED` : ''}`);
process.exit(survived ? 1 : 0);
