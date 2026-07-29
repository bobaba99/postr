/**
 * §7.4 agreement analysis: Gavin vs checker over the frozen 20.
 *   npx tsx docs/plans/experiments/presentation-checker/analysis/analyze.mts [--results results] [--out analysis/report.md]
 * Task 28 reuses this against the PRODUCTION pipeline's output (--results results-production).
 *
 * All manually edited ratings and generated results are validated before
 * the report path is touched. The testable loader/report implementation
 * lives in analyze-support.mts; this file stays a thin CLI.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';
import { runAnalysis } from './analyze-support.mts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const resultsDir = args.includes('--results')
  ? args[args.indexOf('--results') + 1]!
  : 'results';
const outFile = args.includes('--out')
  ? args[args.indexOf('--out') + 1]!
  : join(here, 'report.md');

runAnalysis({
  root,
  resultsDir,
  outFile,
  categories: ISSUE_CATEGORIES,
});
console.log(`wrote ${outFile}`);
