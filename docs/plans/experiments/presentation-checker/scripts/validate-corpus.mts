/**
 * Validates the frozen §7.2 corpus: 20 posters, intentional quality spread,
 * every seeded issue drawn from the shared rubric taxonomy, all referenced
 * files on disk, page cap respected. Run:
 *   npx tsx docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', 'corpus');
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')) as {
  version: number;
  frozenAt: string | null;
  items: Array<{
    id: string;
    field: string;
    title: string;
    quality: 'strong' | 'seeded';
    seededIssue: string | null;
    pages: string[];
    pptx?: string | null;
    notes?: string;
  }>;
};

const errors: string[] = [];
const ids = new Set<string>();
const seededCategories = new Set<string>();
let strong = 0;

if (manifest.items.length !== 20) {
  errors.push(`expected 20 items, found ${manifest.items.length}`);
}

for (const item of manifest.items) {
  if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
  ids.add(item.id);
  if (!item.field || !item.title) errors.push(`${item.id}: field/title required`);
  if (item.quality !== 'strong' && item.quality !== 'seeded') {
    errors.push(`${item.id}: quality must be strong|seeded`);
  }
  if (item.quality === 'seeded') {
    if (!item.seededIssue) {
      errors.push(`${item.id}: seeded item must name seededIssue`);
    } else if (!(ISSUE_CATEGORIES as readonly string[]).includes(item.seededIssue)) {
      errors.push(`${item.id}: seededIssue "${item.seededIssue}" not in rubric taxonomy`);
    } else {
      seededCategories.add(item.seededIssue);
    }
  }
  if (item.quality === 'strong') {
    strong++;
    if (item.seededIssue !== null) errors.push(`${item.id}: strong item must have seededIssue null`);
  }
  if (!Array.isArray(item.pages) || item.pages.length < 1) {
    errors.push(`${item.id}: needs at least one page image`);
  } else {
    if (item.pages.length > 24) errors.push(`${item.id}: ${item.pages.length} pages exceeds the 24-page cap`);
    for (const p of item.pages) {
      if (!existsSync(join(corpusDir, p))) errors.push(`${item.id}: missing file ${p}`);
    }
  }
  if (item.pptx && !existsSync(join(corpusDir, item.pptx))) {
    errors.push(`${item.id}: missing file ${item.pptx}`);
  }
}

if (strong < 4) errors.push(`need ≥ 4 strong posters, found ${strong}`);
if (seededCategories.size < 7) {
  errors.push(`seeded items must cover ≥ 7 distinct issue categories, found ${seededCategories.size}`);
}

if (errors.length > 0) {
  console.error('corpus INVALID:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`corpus OK: ${manifest.items.length} items (${strong} strong, ${manifest.items.length - strong} seeded, ${seededCategories.size} categories)`);
