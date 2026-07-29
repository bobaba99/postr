/**
 * Generates one blank rating sheet per corpus item from the SHARED rubric
 * taxonomy (§2.0 single source of truth) so the human checklist and the
 * checker's Finding categories can never drift. Run:
 *   npx tsx docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string }>;
};

const outDir = join(root, 'ratings', 'gavin');
mkdirSync(outDir, { recursive: true });

for (const item of manifest.items) {
  const sheet = {
    posterId: item.id,
    dimensionScores: { narrative: null, design: null, content: null },
    checklist: Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, false])),
    comments: '',
  };
  writeFileSync(join(outDir, `${item.id}.json`), JSON.stringify(sheet, null, 2) + '\n');
}
console.log(`wrote ${manifest.items.length} blank rating sheets to ratings/gavin/`);
