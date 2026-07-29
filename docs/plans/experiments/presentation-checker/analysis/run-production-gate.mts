/**
 * §7.1 pre-ship gate: runs the frozen 20 through the PRODUCTION critique
 * pipeline — prompt.ts → critique.ts → enforce.ts, the same modules the
 * API route uses — NOT the Task-5 throwaway prototype. Output lands in
 * results-production/ in the exact shape analysis/analyze.mts reads, so
 * the Task-6 analyzer produces the gate report unchanged:
 *
 *   ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts [--only bio-01,cs-04] [--limit 3]
 *   cd docs/plans/experiments/presentation-checker && npx tsx analysis/analyze.mts --results results-production --out analysis/gate-report.md
 *
 * Corpus items have no PosterDoc, so deterministic signals are absent:
 * the gate passes posterDocPresent: false with no signals, and enforce
 * runs without a block-id set — the same shape an image/PDF upload takes
 * through the route. Page images are read straight from the corpus (the
 * prototype's convention): the gate measures prompt + model + enforce,
 * not signed-URL re-fetch.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeReviewSystemPrompt,
  buildInitialUserMessage,
} from '../../../../../apps/api/src/review/prompt.ts';
import { callAnthropicCritique } from '../../../../../apps/api/src/review/critique.ts';
import { enforceFindings } from '../../../../../apps/api/src/review/enforce.ts';
import { computeReviewSignals } from '../../../../../apps/api/src/review/signals.ts';
import type { FetchedPage } from '../../../../../apps/api/src/review/fetchPages.ts';

// Same pricing caveat as the prototype: CONFIRM current Sonnet 4.5 list
// prices before using these for pack pricing.
const COST_PER_MTOK = { input: 3.0, output: 15.0 };

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY must be set (Preflight P3) — the gate calls the live model.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;

const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; pages: string[] }>;
};

// Wiring assertion: the gate measures the PRODUCTION modules — signals
// included. Corpus posters carry no PosterDoc, so their deterministic-
// grounding block is empty; this pins the zero-signals baseline the
// prompt renders for uploads.
console.log('[gate] zero-signals baseline:', computeReviewSignals([]));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const systemPrompt = composeReviewSystemPrompt();
const outDir = join(root, 'results-production');
mkdirSync(outDir, { recursive: true });

const costsPath = join(outDir, 'costs.jsonl');
if (!only && limit === null && existsSync(costsPath)) {
  // Full re-run: start the cost log fresh so p50/p95 stay honest.
  rmSync(costsPath);
}

function mediaType(p: string): FetchedPage['mediaType'] {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported page image ${p}`);
}

let items = manifest.items;
if (only) items = items.filter((i) => only.includes(i.id));
if (limit !== null) items = items.slice(0, limit);

for (const item of items) {
  const pages: FetchedPage[] = item.pages.map((p) => ({
    mediaType: mediaType(p),
    imageData: readFileSync(join(root, 'corpus', p)).toString('base64'),
  }));

  const userMessage = buildInitialUserMessage({
    pageCount: item.pages.length,
    // Every corpus page is rendered from the exported PDF
    // (corpus/README step 5), so 'pdf' is the truthful source kind.
    sourceKind: 'pdf',
    posterDocPresent: false,
  });

  const { critique, usage } = await callAnthropicCritique(anthropic, {
    systemPrompt,
    userMessage,
    pages,
  });

  // The same enforce pass the route runs: no PosterDoc → no block ids;
  // page-range + bbox clamps still apply (D18).
  const findings = enforceFindings(critique.findings, { pageCount: item.pages.length });
  const result = { ...critique, findings };

  const estCostUsd =
    (usage.inputTokens / 1e6) * COST_PER_MTOK.input +
    (usage.outputTokens / 1e6) * COST_PER_MTOK.output;

  writeFileSync(
    join(outDir, `${item.id}.json`),
    JSON.stringify({ posterId: item.id, critique: result, usage }, null, 2) + '\n',
  );
  appendFileSync(
    costsPath,
    JSON.stringify({ posterId: item.id, ...usage, estCostUsd: Number(estCostUsd.toFixed(4)) }) + '\n',
  );
  console.log(
    `${item.id}: ${findings.length} findings, ${usage.inputTokens}+${usage.outputTokens} tokens, ~$${estCostUsd.toFixed(3)}`,
  );
}

console.log(`[gate] wrote ${items.length} production result(s) to results-production/`);
