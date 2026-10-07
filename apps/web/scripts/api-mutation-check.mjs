#!/usr/bin/env node
/**
 * api-mutation-check.mjs — mutation-check.mjs for the API (apps/api).
 *
 * mutation-check.mjs serves mutants to the web app's vitest through a Vite
 * hook; the API's tests run under their own vitest config, so this copies
 * apps/api (and the base tsconfig it extends) into a scratch folder, writes
 * each mutant's edits into the copy, and runs the spec's API test files
 * there. The repo is never written. The control (no mutant) runs first; if
 * it is not all green, nothing else means anything and the run stops.
 *
 * SPEC (JSON; paths relative to apps/api; named *.api-mutants.json so the
 * web suite's spec check, scripts/__tests__/mutantSpecs.test.mjs, which
 * reads paths relative to apps/web, leaves it alone)
 *   { "tests": ["src/__tests__/billing.locale.test.ts"],
 *     "mutants": { "name": { "undoes": "…", "edits": [["src/billing.ts", "exact text", "replacement"]] } } }
 *
 * RUN (from apps/web)
 *   node scripts/api-mutation-check.mjs ../../docs/fixes/26-french-public-pages.api-mutants.json
 *
 * EXIT  0 every mutant killed · 1 at least one survived · 2 control failed or bad spec
 *
 * First written for fix 26 (the French Stripe Checkout, apps/api/src/billing.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSpec, mutate } from './lib/mutants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const API = path.join(REPO, 'apps/api');

const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node scripts/api-mutation-check.mjs <spec.api-mutants.json>');
  process.exit(2);
}
const spec = loadSpec(path.resolve(specPath));

/** A fresh copy of the API laid out as in the repo (apps/api beside the base tsconfig). */
function copyApi() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postr-api-mutant-'));
  const api = path.join(root, 'apps/api');
  fs.cpSync(API, api, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}dist`) });
  fs.copyFileSync(path.join(REPO, 'tsconfig.base.json'), path.join(root, 'tsconfig.base.json'));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'));
  return { root, api };
}

/** Run the spec's tests in a copy, with `byFile` written over it. Returns [failed, total]. */
function run(byFile) {
  const { root, api } = copyApi();
  try {
    for (const [abs, text] of byFile) fs.writeFileSync(path.join(api, path.relative(API, abs)), text);
    const out = spawnSync('npx', ['vitest', 'run', '--reporter=json', ...spec.tests], { cwd: api, encoding: 'utf8' });
    const json = out.stdout.slice(out.stdout.indexOf('{'));
    const report = JSON.parse(json);
    // A file that does not even load (a syntax error) fails no test but its suite: count it once.
    const failed = report.numFailedTests > 0 ? report.numFailedTests : report.numFailedTestSuites > 0 ? 1 : 0;
    return [failed, report.numTotalTests];
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const [controlFailed, total] = run(new Map());
console.log(`control: ${total - controlFailed}/${total} pass`);
if (controlFailed > 0 || total === 0) process.exit(2);

let survived = 0;
for (const [name, mutant] of Object.entries(spec.mutants)) {
  let byFile;
  try {
    byFile = mutate(API, mutant);
  } catch (e) {
    console.error(`bad spec: ${name}: ${e.message}`);
    process.exit(2);
  }
  const [failed] = run(byFile);
  if (failed === 0) survived += 1;
  console.log(`${failed > 0 ? 'killed  ' : 'SURVIVED'}  ${name.padEnd(28)} ${failed}/${total} fail  — undoes: ${mutant.undoes}`);
}
process.exit(survived > 0 ? 1 : 0);
