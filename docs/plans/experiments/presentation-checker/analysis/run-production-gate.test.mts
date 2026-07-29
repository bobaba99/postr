import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { runProductionGate } from './run-production-gate.mts';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'run-production-gate.mts');

function runGate(args: string[], apiKey?: string) {
  const env = { ...process.env };
  if (apiKey === undefined) delete env.ANTHROPIC_API_KEY;
  else env.ANTHROPIC_API_KEY = apiKey;
  return spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: join(here, '../../../../..'),
    env,
    encoding: 'utf8',
  });
}

test('runner preserves the no-key preflight without creating output', () => {
  const result = runGate([]);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /ANTHROPIC_API_KEY must be set \(Preflight P3\) — the gate calls the live model\./,
  );
});

test('runner rejects unknown arguments before reading or writing gate output', () => {
  const result = runGate(['--wat'], 'not-a-real-key');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown argument --wat/);
});

test('runner rejects zero limits before reading or writing gate output', () => {
  const result = runGate(['--limit', '0'], 'not-a-real-key');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--limit must be a positive integer/);
});

test('runner rejects an unfrozen injected corpus without touching real gate output', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'postr-production-gate-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const corpusDir = join(root, 'corpus');
  mkdirSync(corpusDir);
  writeFileSync(
    join(corpusDir, 'manifest.json'),
    `${JSON.stringify({ version: 1, frozenAt: null, items: [] })}\n`,
  );

  await assert.rejects(
    runProductionGate({
      args: [],
      apiKey: 'not-a-real-key',
      root,
    }),
    /manifest frozenAt must be set/,
  );
  assert.equal(existsSync(join(root, 'results-production')), false);
});
