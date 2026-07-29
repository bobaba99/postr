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
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeReviewSystemPrompt,
  buildInitialUserMessage,
  CRITIQUE_TOOL_INPUT_SCHEMA,
} from '../../../../../apps/api/src/review/prompt.ts';
import { callAnthropicCritique } from '../../../../../apps/api/src/review/critique.ts';
import { enforceFindings } from '../../../../../apps/api/src/review/enforce.ts';
import { computeReviewSignals } from '../../../../../apps/api/src/review/signals.ts';
import type { FetchedPage } from '../../../../../apps/api/src/review/fetchPages.ts';
import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MAX_PAGES,
  REVIEW_MAX_TOKENS,
  REVIEW_MODEL,
} from '../../../../../apps/api/src/review/config.ts';
import { CURRENT_RUBRIC_VERSION } from '../../../../../apps/api/src/review/rubric/index.ts';
import {
  assertCompatibleGateRun,
  parseGateArgs,
  prepareGateOutputs,
  selectGateItems,
  validateGateManifest,
  writeGateRunMetadata,
} from './production-gate-support.mts';

// Same pricing caveat as the prototype: CONFIRM current Sonnet 4.5 list
// prices before using these for pack pricing.
const COST_PER_MTOK = { input: 3.0, output: 15.0 };

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, '..');

function mediaType(p: string): FetchedPage['mediaType'] {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported page image ${p}`);
}

function addFingerprintPart(
  hash: ReturnType<typeof createHash>,
  label: string,
  value: string | Buffer,
): void {
  hash.update(label);
  hash.update('\0');
  hash.update(
    String(
      typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength,
    ),
  );
  hash.update('\0');
  hash.update(value);
  hash.update('\0');
}

function buildGateIdentity(input: {
  root: string;
  corpusDir: string;
  manifestText: string;
  manifestItems: Array<{ id: string; pages: string[] }>;
  systemPrompt: string;
}): { fingerprint: string; pageBytes: Map<string, Buffer> } {
  const hash = createHash('sha256');
  const repositoryRoot = resolve(input.root, '../../../..');
  const pipelineSources = [
    'apps/api/src/review/config.ts',
    'apps/api/src/review/prompt.ts',
    'apps/api/src/review/critique.ts',
    'apps/api/src/review/schema.ts',
    'apps/api/src/review/enforce.ts',
    'apps/api/src/review/signals.ts',
    'apps/api/src/review/rubric/index.ts',
    'apps/api/src/review/rubric/v1.ts',
  ];

  addFingerprintPart(hash, 'manifest', input.manifestText);
  addFingerprintPart(hash, 'model', REVIEW_MODEL);
  addFingerprintPart(hash, 'maxTokens', String(REVIEW_MAX_TOKENS));
  addFingerprintPart(hash, 'maxPages', String(REVIEW_MAX_PAGES));
  addFingerprintPart(hash, 'maxImageBytes', String(REVIEW_IMAGE_MAX_BYTES));
  addFingerprintPart(hash, 'rubricVersion', CURRENT_RUBRIC_VERSION);
  addFingerprintPart(hash, 'systemPrompt', input.systemPrompt);
  addFingerprintPart(
    hash,
    'toolInputSchema',
    JSON.stringify(CRITIQUE_TOOL_INPUT_SCHEMA),
  );
  for (const relativePath of pipelineSources) {
    addFingerprintPart(
      hash,
      `source:${relativePath}`,
      readFileSync(join(repositoryRoot, relativePath)),
    );
  }
  for (const filename of [
    'run-production-gate.mts',
    'production-gate-support.mts',
  ]) {
    addFingerprintPart(
      hash,
      `gateSource:${filename}`,
      readFileSync(join(here, filename)),
    );
  }

  const pageBytes = new Map<string, Buffer>();
  for (const item of input.manifestItems) {
    for (const page of item.pages) {
      const pagePath = join(input.corpusDir, page);
      const bytes = readFileSync(pagePath);
      pageBytes.set(pagePath, bytes);
      addFingerprintPart(hash, `page:${item.id}:${page}`, bytes);
    }
  }
  return { fingerprint: hash.digest('hex'), pageBytes };
}

export interface GateRunOptions {
  args?: string[];
  apiKey?: string;
  root?: string;
}

export async function runProductionGate(
  options: GateRunOptions = {},
): Promise<void> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY must be set (Preflight P3) — the gate calls the live model.',
    );
  }

  const root = options.root ?? defaultRoot;
  const args = parseGateArgs(options.args ?? process.argv.slice(2));
  const corpusDir = join(root, 'corpus');
  const manifestText = readFileSync(join(corpusDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const manifestItems = validateGateManifest(manifest, corpusDir, {
    maxPages: REVIEW_MAX_PAGES,
    maxImageBytes: REVIEW_IMAGE_MAX_BYTES,
  });
  const items = selectGateItems(manifestItems, args);

  // Wiring assertion: the gate measures the PRODUCTION modules — signals
  // included. Corpus posters carry no PosterDoc, so their deterministic-
  // grounding block is empty; this pins the zero-signals baseline the
  // prompt renders for uploads.
  console.log('[gate] zero-signals baseline:', computeReviewSignals([]));

  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = composeReviewSystemPrompt();
  const { fingerprint, pageBytes } = buildGateIdentity({
    root,
    corpusDir,
    manifestText,
    manifestItems,
    systemPrompt,
  });
  const outDir = join(root, 'results-production');
  const costsPath = join(outDir, 'costs.jsonl');
  const fullRun = args.only === null && args.limit === null;

  // This is deliberately the first output mutation. Every argument,
  // manifest, selection, page, prompt, and client preflight above must
  // succeed before stale artifacts are removed.
  assertCompatibleGateRun(outDir, fingerprint, fullRun);
  prepareGateOutputs(
    outDir,
    items.map((item) => item.id),
    fullRun,
  );
  writeGateRunMetadata(outDir, {
    fingerprint,
    frozenAt: manifest.frozenAt,
    model: REVIEW_MODEL,
    rubricVersion: CURRENT_RUBRIC_VERSION,
  });

  for (const item of items) {
    const pages: FetchedPage[] = item.pages.map((p) => ({
      mediaType: mediaType(p),
      imageData: pageBytes.get(join(corpusDir, p))!.toString('base64'),
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
}

async function main(): Promise<void> {
  try {
    await runProductionGate();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      message.startsWith('ANTHROPIC_API_KEY must be set')
        ? message
        : `[gate] ${message}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
