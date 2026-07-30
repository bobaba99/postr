/**
 * §7.4 agreement analysis: Gavin vs checker over the frozen 20.
 *   npx tsx docs/plans/experiments/presentation-checker/analysis/analyze.mts [--results results] [--out analysis/report.md]
 * Task 28 reuses this against the PRODUCTION pipeline's output (--results results-production).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';
import {
  weightedKappa,
  spearmanRho,
  checklistPrf,
  seededCatchRate,
  type ChecklistVerdict,
} from '../../../../../apps/api/src/review/agreement.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const resultsDir = args.includes('--results') ? args[args.indexOf('--results') + 1]! : 'results';
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1]! : join(here, 'report.md');

interface Rating {
  posterId: string;
  dimensionScores: { narrative: number; design: number; content: number };
  checklist: ChecklistVerdict;
  comments: string;
}
interface Result {
  posterId: string;
  critique: {
    dimensionScores: { narrative: number; design: number; content: number };
    findings: Array<{ category: string; problem: string; fix: string; severity: string }>;
  };
}
const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; seededIssue: string | null }>;
};

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const dims = ['narrative', 'design', 'content'] as const;
const lines: string[] = [];
const push = (s = '') => lines.push(s);

push('# Presentation Checker — agreement report (§7.4)');
push('');

const gavin: Rating[] = [];
const checker: Result[] = [];
for (const item of manifest.items) {
  gavin.push(readJson(join(root, 'ratings', 'gavin', `${item.id}.json`)));
  checker.push(readJson(join(root, resultsDir, `${item.id}.json`)));
}

// Lens 1 — scores: weighted kappa + spearman per dimension.
push('## 1. Dimension scores — do we rank the same?');
push('');
push('| dimension | weighted kappa | spearman rho |');
push('|---|---|---|');
for (const d of dims) {
  const g = gavin.map((r) => r.dimensionScores[d]);
  const c = checker.map((r) => r.critique.dimensionScores[d]);
  push(`| ${d} | ${weightedKappa(g, c, 5).toFixed(3)} | ${spearmanRho(g, c).toFixed(3)} |`);
}
push('');

// Lens 2 — checklist: micro PRF + seeded catch rate.
const checkerChecklists: ChecklistVerdict[] = checker.map((r) => {
  const v: ChecklistVerdict = {};
  for (const f of r.critique.findings) v[f.category] = true;
  return v;
});
const prf = checklistPrf(gavin.map((r) => r.checklist), checkerChecklists, ISSUE_CATEGORIES);
const catchRate = seededCatchRate(manifest.items.map((i) => i.seededIssue), checkerChecklists);
push('## 2. Issue checklist — same specific problems?');
push('');
push(`- micro precision ${prf.precision.toFixed(3)} · recall ${prf.recall.toFixed(3)} · F1 ${prf.f1.toFixed(3)} (tp ${prf.tp}, fp ${prf.fp}, fn ${prf.fn})`);
push(`- **seeded ground-truth caught: ${catchRate.caught}/${catchRate.total} (${(catchRate.rate * 100).toFixed(0)}%)**`);
push('');

// Lens 3 — comments vs findings, side by side for qualitative reconciliation.
push('## 3. Comments ↔ findings (qualitative reconciliation)');
push('');
for (let i = 0; i < manifest.items.length; i++) {
  push(`### ${manifest.items[i]!.id}${manifest.items[i]!.seededIssue ? ` (seeded: ${manifest.items[i]!.seededIssue})` : ' (strong)'}`);
  push('');
  push(`Gavin: ${gavin[i]!.comments || '_(no comment)_'}`);
  push('');
  push('Checker findings:');
  for (const f of checker[i]!.critique.findings) {
    push(`- [${f.severity}/${f.category}] ${f.problem} → ${f.fix}`);
  }
  push('');
}

writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`wrote ${outFile}`);
