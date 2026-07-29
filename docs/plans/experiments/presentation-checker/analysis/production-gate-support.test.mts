import assert from 'node:assert/strict';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCompatibleGateRun,
  parseGateArgs,
  prepareGateOutputs,
  selectGateItems,
  validateGateManifest,
  writeGateRunMetadata,
} from './production-gate-support.mts';

function corpusFixture(t: test.TestContext) {
  const corpusDir = mkdtempSync(join(tmpdir(), 'postr-production-gate-'));
  t.after(() => rmSync(corpusDir, { recursive: true, force: true }));
  const items = Array.from({ length: 20 }, (_, index) => {
    const id = `poster-${String(index + 1).padStart(2, '0')}`;
    const page = `${id}.png`;
    writeFileSync(join(corpusDir, page), 'page');
    return { id, pages: [page] };
  });
  return {
    corpusDir,
    manifest: { frozenAt: '2026-07-29T00:00:00.000Z', items },
  };
}

test('parseGateArgs accepts positive limits and non-empty poster ids', () => {
  assert.deepEqual(parseGateArgs([]), { only: null, limit: null });
  assert.deepEqual(parseGateArgs(['--only', 'bio-01, cs-04', '--limit', '3']), {
    only: ['bio-01', 'cs-04'],
    limit: 3,
  });
});

test('parseGateArgs rejects unknown flags', () => {
  assert.throws(() => parseGateArgs(['--wat']), /unknown argument --wat/);
});

test('parseGateArgs rejects missing or empty --only values', () => {
  assert.throws(() => parseGateArgs(['--only']), /--only requires/);
  assert.throws(() => parseGateArgs(['--only', '--limit', '3']), /--only requires/);
  assert.throws(() => parseGateArgs(['--only', 'bio-01,']), /--only requires/);
});

test('parseGateArgs rejects missing, zero, negative, fractional, and non-numeric limits', () => {
  assert.throws(() => parseGateArgs(['--limit']), /--limit requires/);
  assert.throws(() => parseGateArgs(['--limit', '--only', 'bio-01']), /--limit requires/);
  for (const value of ['0', '-1', '1.5', 'nope']) {
    assert.throws(
      () => parseGateArgs(['--limit', value]),
      /--limit must be a positive integer/,
    );
  }
});

test('parseGateArgs rejects duplicate flags', () => {
  assert.throws(
    () => parseGateArgs(['--only', 'bio-01', '--only', 'cs-04']),
    /--only may only be provided once/,
  );
  assert.throws(
    () => parseGateArgs(['--limit', '1', '--limit', '2']),
    /--limit may only be provided once/,
  );
});

test('validateGateManifest accepts a frozen 20-item corpus with existing pages', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  assert.deepEqual(validateGateManifest(manifest, corpusDir), manifest.items);
});

test('validateGateManifest rejects an unfrozen corpus', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  assert.throws(
    () => validateGateManifest({ ...manifest, frozenAt: null }, corpusDir),
    /manifest frozenAt must be set/,
  );
});

test('validateGateManifest requires exactly 20 unique items', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  assert.throws(
    () => validateGateManifest({ ...manifest, items: manifest.items.slice(0, 19) }, corpusDir),
    /exactly 20 items/,
  );

  const duplicate = manifest.items.map((item) => ({ ...item }));
  duplicate[19]!.id = duplicate[0]!.id;
  assert.throws(
    () => validateGateManifest({ ...manifest, items: duplicate }, corpusDir),
    /item ids must be unique/,
  );

  const unsafe = manifest.items.map((item) => ({ ...item }));
  unsafe[0]!.id = '../outside';
  assert.throws(
    () => validateGateManifest({ ...manifest, items: unsafe }, corpusDir),
    /manifest item id is unsafe: \.\.\/outside/,
  );
});

test('validateGateManifest requires every item to have existing page files', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  const withoutPages = manifest.items.map((item) => ({ ...item }));
  withoutPages[0]!.pages = [];
  assert.throws(
    () => validateGateManifest({ ...manifest, items: withoutPages }, corpusDir),
    /poster-01 must reference at least one page/,
  );

  const missingPage = manifest.items.map((item) => ({ ...item, pages: [...item.pages] }));
  missingPage[0]!.pages = ['missing.png'];
  assert.throws(
    () => validateGateManifest({ ...manifest, items: missingPage }, corpusDir),
    /poster-01 page does not exist: missing.png/,
  );

  const unsupportedPage = manifest.items.map((item) => ({ ...item, pages: [...item.pages] }));
  unsupportedPage[0]!.pages = ['poster-01.gif'];
  writeFileSync(join(corpusDir, 'poster-01.gif'), 'page');
  assert.throws(
    () => validateGateManifest({ ...manifest, items: unsupportedPage }, corpusDir),
    /poster-01 page has unsupported image type: poster-01.gif/,
  );
});

test('validateGateManifest rejects lexical and symlink page escapes', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  const lexicalEscape = manifest.items.map((item) => ({
    ...item,
    pages: [...item.pages],
  }));
  lexicalEscape[0]!.pages = ['../outside.png'];
  assert.throws(
    () => validateGateManifest({ ...manifest, items: lexicalEscape }, corpusDir),
    /poster-01 page must stay inside the corpus: \.\.\/outside\.png/,
  );

  const outsideDir = mkdtempSync(join(tmpdir(), 'postr-production-gate-outside-'));
  t.after(() => rmSync(outsideDir, { recursive: true, force: true }));
  const outsidePage = join(outsideDir, 'private.png');
  writeFileSync(outsidePage, 'private');
  symlinkSync(outsidePage, join(corpusDir, 'linked.png'));
  const symlinkEscape = manifest.items.map((item) => ({
    ...item,
    pages: [...item.pages],
  }));
  symlinkEscape[0]!.pages = ['linked.png'];
  assert.throws(
    () => validateGateManifest({ ...manifest, items: symlinkEscape }, corpusDir),
    /poster-01 page must stay inside the corpus: linked\.png/,
  );
});

test('validateGateManifest enforces the production page and image byte limits', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  const tooManyPages = manifest.items.map((item) => ({
    ...item,
    pages: [...item.pages],
  }));
  tooManyPages[0]!.pages = Array.from({ length: 25 }, (_, index) => {
    const page = `poster-01-page-${index + 1}.png`;
    writeFileSync(join(corpusDir, page), 'page');
    return page;
  });
  assert.throws(
    () => validateGateManifest({ ...manifest, items: tooManyPages }, corpusDir),
    /poster-01 exceeds the production page limit of 24/,
  );

  const oversized = manifest.items.map((item) => ({
    ...item,
    pages: [...item.pages],
  }));
  truncateSync(join(corpusDir, oversized[0]!.pages[0]!), 5 * 1024 * 1024 + 1);
  assert.throws(
    () => validateGateManifest({ ...manifest, items: oversized }, corpusDir),
    /poster-01 page exceeds the production byte limit of 5242880/,
  );
});

test('selectGateItems filters in manifest order and then applies the limit', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  const items = validateGateManifest(manifest, corpusDir);
  assert.deepEqual(
    selectGateItems(items, { only: ['poster-03', 'poster-01'], limit: 1 }).map(
      (item) => item.id,
    ),
    ['poster-01'],
  );
});

test('selectGateItems rejects unknown and duplicate requested ids', (t) => {
  const { corpusDir, manifest } = corpusFixture(t);
  const items = validateGateManifest(manifest, corpusDir);
  assert.throws(
    () => selectGateItems(items, { only: ['unknown'], limit: null }),
    /unknown poster id: unknown/,
  );
  assert.throws(
    () => selectGateItems(items, { only: ['poster-01', 'poster-01'], limit: null }),
    /--only poster ids must be unique/,
  );
});

test('prepareGateOutputs removes stale gate artifacts before a full run', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'postr-production-results-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  writeFileSync(join(outDir, 'poster-01.json'), 'stale');
  writeFileSync(join(outDir, 'orphan.json'), 'stale');
  writeFileSync(join(outDir, 'costs.jsonl'), '{"posterId":"poster-01"}\n');
  writeFileSync(join(outDir, 'keep.md'), 'keep');
  mkdirSync(join(outDir, 'nested'));

  prepareGateOutputs(outDir, ['poster-01'], true);

  assert.equal(existsSync(join(outDir, 'poster-01.json')), false);
  assert.equal(existsSync(join(outDir, 'orphan.json')), false);
  assert.equal(existsSync(join(outDir, 'costs.jsonl')), false);
  assert.equal(readFileSync(join(outDir, 'keep.md'), 'utf8'), 'keep');
  assert.equal(existsSync(join(outDir, 'nested')), true);
});

test('prepareGateOutputs de-duplicates selected ids for a partial rerun', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'postr-production-results-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  writeFileSync(join(outDir, 'poster-01.json'), 'stale selected');
  writeFileSync(join(outDir, 'poster-02.json'), 'keep unselected');
  writeFileSync(
    join(outDir, 'costs.jsonl'),
    [
      '{"posterId":"poster-01","estCostUsd":1}',
      '{"posterId":"poster-02","estCostUsd":2}',
      '{"posterId":"poster-01","estCostUsd":3}',
      '',
    ].join('\n'),
  );

  prepareGateOutputs(outDir, ['poster-01'], false);
  appendFileSync(join(outDir, 'costs.jsonl'), '{"posterId":"poster-01","estCostUsd":4}\n');

  assert.equal(existsSync(join(outDir, 'poster-01.json')), false);
  assert.equal(readFileSync(join(outDir, 'poster-02.json'), 'utf8'), 'keep unselected');
  const rows = readFileSync(join(outDir, 'costs.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { posterId: string });
  assert.deepEqual(
    rows.map((row) => row.posterId),
    ['poster-02', 'poster-01'],
  );
});

test('prepareGateOutputs does not mutate results when the cost log is malformed', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'postr-production-results-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  writeFileSync(join(outDir, 'poster-01.json'), 'stale selected');
  writeFileSync(join(outDir, 'costs.jsonl'), 'not json\n');

  assert.throws(
    () => prepareGateOutputs(outDir, ['poster-01'], false),
    /invalid costs.jsonl row 1/,
  );
  assert.equal(readFileSync(join(outDir, 'poster-01.json'), 'utf8'), 'stale selected');
  assert.equal(readFileSync(join(outDir, 'costs.jsonl'), 'utf8'), 'not json\n');
});

test('prepareGateOutputs rejects selected ids that escape the output directory', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'postr-production-results-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  for (const fullRun of [false, true]) {
    assert.throws(
      () => prepareGateOutputs(outDir, ['../outside'], fullRun),
      /unsafe poster id/,
    );
  }
});

test('prepareGateOutputs rejects a symlinked output directory', (t) => {
  const parentDir = mkdtempSync(join(tmpdir(), 'postr-production-results-parent-'));
  t.after(() => rmSync(parentDir, { recursive: true, force: true }));
  const targetDir = join(parentDir, 'target');
  const linkedDir = join(parentDir, 'linked');
  mkdirSync(targetDir);
  writeFileSync(join(targetDir, 'unrelated.json'), 'keep');
  symlinkSync(targetDir, linkedDir);

  assert.throws(
    () => prepareGateOutputs(linkedDir, ['poster-01'], true),
    /output directory must not be a symbolic link/,
  );
  assert.equal(readFileSync(join(targetDir, 'unrelated.json'), 'utf8'), 'keep');
});

test('partial gate runs require matching run metadata before mutating artifacts', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'postr-production-results-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  writeFileSync(join(outDir, 'poster-01.json'), 'keep');

  assert.throws(
    () => assertCompatibleGateRun(outDir, 'fingerprint-a', false),
    /artifacts without run metadata/,
  );
  assert.equal(readFileSync(join(outDir, 'poster-01.json'), 'utf8'), 'keep');

  writeGateRunMetadata(outDir, {
    fingerprint: 'fingerprint-a',
    frozenAt: '2026-07-29T00:00:00.000Z',
    model: 'model-a',
    rubricVersion: 'rubric.v1',
  });
  assert.doesNotThrow(() =>
    assertCompatibleGateRun(outDir, 'fingerprint-a', false),
  );
  assert.throws(
    () => assertCompatibleGateRun(outDir, 'fingerprint-b', false),
    /does not match the existing corpus\/model\/prompt pipeline/,
  );
  assert.equal(readFileSync(join(outDir, 'poster-01.json'), 'utf8'), 'keep');
});
