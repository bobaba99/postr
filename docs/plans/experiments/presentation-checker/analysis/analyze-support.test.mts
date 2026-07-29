import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadAnalysisInputs,
  runAnalysis,
} from './analyze-support.mts';

const CATEGORIES = ['issue-a', 'issue-b'] as const;

function validRating(posterId: string) {
  return {
    posterId,
    dimensionScores: { narrative: 1, design: 3, content: 5 },
    checklist: { 'issue-a': true, 'issue-b': false },
    comments: `Notes for ${posterId}`,
  };
}

function validResult(posterId: string) {
  return {
    posterId,
    critique: {
      dimensionScores: { narrative: 2, design: 3, content: 4 },
      findings: [
        {
          category: 'issue-a',
          problem: `Problem for ${posterId}`,
          fix: `Fix for ${posterId}`,
          severity: 'high',
        },
      ],
    },
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function analysisFixture(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'postr-analysis-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ratingsDir = join(root, 'ratings', 'gavin');
  const resultsDir = join(root, 'results-production');
  mkdirSync(join(root, 'corpus'), { recursive: true });
  mkdirSync(ratingsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  const items = [
    { id: 'poster-01', seededIssue: 'issue-a' },
    { id: 'poster-02', seededIssue: null },
  ];
  writeJson(join(root, 'corpus', 'manifest.json'), {
    version: 1,
    frozenAt: '2026-07-29T00:00:00.000Z',
    items,
  });
  for (const item of items) {
    writeJson(join(ratingsDir, `${item.id}.json`), validRating(item.id));
    writeJson(join(resultsDir, `${item.id}.json`), validResult(item.id));
  }
  // Production gate output contains this non-poster JSON file. The analyzer
  // must ignore it while still rejecting duplicate poster result files.
  writeJson(join(resultsDir, 'run-metadata.json'), {
    fingerprint: 'fixture',
  });

  return {
    root,
    ratingsDir,
    resultsDir,
    outFile: join(root, 'analysis', 'gate-report.md'),
  };
}

test('valid inputs load in manifest order and preserve report behavior', (t) => {
  const fixture = analysisFixture(t);

  const loaded = loadAnalysisInputs({
    root: fixture.root,
    resultsDir: 'results-production',
    categories: CATEGORIES,
  });

  assert.deepEqual(
    loaded.gavin.map((rating) => rating.posterId),
    ['poster-01', 'poster-02'],
  );
  assert.deepEqual(
    loaded.checker.map((result) => result.posterId),
    ['poster-01', 'poster-02'],
  );

  runAnalysis({
    root: fixture.root,
    resultsDir: 'results-production',
    outFile: fixture.outFile,
    categories: CATEGORIES,
  });
  const report = readFileSync(fixture.outFile, 'utf8');
  assert.match(report, /# Presentation Checker — agreement report/);
  assert.match(report, /## 1\. Dimension scores/);
  assert.match(report, /## 2\. Issue checklist/);
  assert.match(report, /## 3\. Comments ↔ findings/);
});

test('rejects a rating whose posterId does not match its filename', (t) => {
  const fixture = analysisFixture(t);
  writeJson(
    join(fixture.ratingsDir, 'poster-01.json'),
    validRating('poster-other'),
  );

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /rating file poster-01\.json has posterId "poster-other"/,
  );
});

test('rejects a result whose posterId does not match its filename', (t) => {
  const fixture = analysisFixture(t);
  writeJson(
    join(fixture.resultsDir, 'poster-01.json'),
    validResult('poster-other'),
  );

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /result file poster-01\.json has posterId "poster-other"/,
  );
});

test('rejects non-integer rating scores', (t) => {
  const fixture = analysisFixture(t);
  const rating = validRating('poster-01');
  rating.dimensionScores.narrative = 2.5;
  writeJson(join(fixture.ratingsDir, 'poster-01.json'), rating);

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /rating poster-01 narrative score must be an integer from 1 to 5/,
  );
});

test('rejects out-of-range checker scores', (t) => {
  const fixture = analysisFixture(t);
  const result = validResult('poster-01');
  result.critique.dimensionScores.content = 6;
  writeJson(join(fixture.resultsDir, 'poster-01.json'), result);

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /result poster-01 content score must be an integer from 1 to 5/,
  );
});

test('rejects an unknown checklist key', (t) => {
  const fixture = analysisFixture(t);
  const rating = validRating('poster-01');
  const checklist = rating.checklist as Record<string, boolean>;
  checklist['issue-unknown'] = false;
  writeJson(join(fixture.ratingsDir, 'poster-01.json'), rating);

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /rating poster-01 checklist has unknown key "issue-unknown"/,
  );
});

test('rejects a missing checklist key', (t) => {
  const fixture = analysisFixture(t);
  const rating = validRating('poster-01');
  delete (rating.checklist as Partial<typeof rating.checklist>)['issue-b'];
  writeJson(join(fixture.ratingsDir, 'poster-01.json'), rating);

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /rating poster-01 checklist is missing key "issue-b"/,
  );
});

test('rejects a finding category outside the rubric taxonomy', (t) => {
  const fixture = analysisFixture(t);
  const result = validResult('poster-01');
  result.critique.findings[0]!.category = 'issue-unknown';
  writeJson(join(fixture.resultsDir, 'poster-01.json'), result);

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /result poster-01 finding 1 has unknown category "issue-unknown"/,
  );
});

test('rejects a missing rating file', (t) => {
  const fixture = analysisFixture(t);
  unlinkSync(join(fixture.ratingsDir, 'poster-02.json'));

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /missing rating file for poster-02/,
  );
});

test('rejects a missing result file', (t) => {
  const fixture = analysisFixture(t);
  unlinkSync(join(fixture.resultsDir, 'poster-02.json'));

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /missing result file for poster-02/,
  );
});

test('rejects duplicate rating files for one posterId', (t) => {
  const fixture = analysisFixture(t);
  writeJson(
    join(fixture.ratingsDir, 'poster-01-copy.json'),
    validRating('poster-01'),
  );

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /duplicate rating files for poster-01/,
  );
});

test('rejects duplicate result files for one posterId', (t) => {
  const fixture = analysisFixture(t);
  writeJson(
    join(fixture.resultsDir, 'poster-01-copy.json'),
    validResult('poster-01'),
  );

  assert.throws(
    () =>
      loadAnalysisInputs({
        root: fixture.root,
        resultsDir: 'results-production',
        categories: CATEGORIES,
      }),
    /duplicate result files for poster-01/,
  );
});

test('validation finishes before an existing report is overwritten', (t) => {
  const fixture = analysisFixture(t);
  mkdirSync(join(fixture.root, 'analysis'));
  writeFileSync(fixture.outFile, 'keep this report\n');
  unlinkSync(join(fixture.resultsDir, 'poster-02.json'));

  assert.throws(
    () =>
      runAnalysis({
        root: fixture.root,
        resultsDir: 'results-production',
        outFile: fixture.outFile,
        categories: CATEGORIES,
      }),
    /missing result file for poster-02/,
  );
  assert.equal(readFileSync(fixture.outFile, 'utf8'), 'keep this report\n');
});
