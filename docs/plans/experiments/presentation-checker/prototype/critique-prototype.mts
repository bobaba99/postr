/**
 * Phase-0 throwaway prototype (spec §7.1): rubric + one forced-tool-use
 * vision call per poster. No ingest, no DB, no UI.
 *
 *   ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts [--only bio-01,cs-04] [--limit 3]
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_RUBRIC } from '../../../../../apps/api/src/review/rubric/index.ts';

// ---- Throwaway copy of the output contract (production: Task 9) ---------
const FindingSchema = z.object({
  dimension: z.enum(['narrative', 'design', 'content']),
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(CURRENT_RUBRIC.issueCategories),
  anchor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('block'), blockId: z.string().min(1) }),
    z.object({
      kind: z.literal('region'),
      page: z.number().int().min(1),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
    z.object({ kind: z.literal('slide'), page: z.number().int().min(1) }),
  ]),
  action: z.enum(['cut', 'demote-to-appendix', 'show-visually', 'condense', 'keep-as-primary', 'add']),
  problem: z.string().min(1),
  fix: z.string().min(1),
  example: z.string().min(1),
  tradeoff: z.string().optional(),
});
const CritiqueSchema = z.object({
  dimensionScores: z.object({
    narrative: z.number().int().min(1).max(5),
    design: z.number().int().min(1).max(5),
    content: z.number().int().min(1).max(5),
  }),
  attentionSummary: z.string().min(1),
  prioritization: z.string().optional(),
  findings: z.array(FindingSchema),
});

// ---- Prompt composed FROM the rubric (§2.0) ------------------------------
function rules(rules: { id: string; text: string }[]): string {
  return rules.map((r) => `- [${r.id}] ${r.text}`).join('\n');
}

const SYSTEM = `You are an expert reviewer of research posters and conference talks. You critique the artifact in TWO ORDERED STAGES. The ordering matters: perceive first, then judge against intent.

STAGE 1 — Perceptual-attention pass (free-viewing simulation).
Before any judgment, describe how a first-time viewer's eye would actually move across the artifact: the entry point, salience hotspots, any faces/photos that hijack gaze, the emphasis load, and the predicted reading path. Ground every prediction in these perception rules:
${rules(CURRENT_RUBRIC.perceptionRules)}

STAGE 2 — Judge the predicted flow against the intended message.
Using your Stage-1 prediction, judge: does the eye land on the KEY RESULT early, or does something decorative hijack it? Is the narrative (hook → question → method → result → takeaway) recoverable from the scan path? Does each figure connect to its explaining text? Is the content right for the audience (jargon, claims vs evidence, section balance, readability at distance)?

BOTH stages are governed by the ECONOMY principle — your default posture is "what can be removed or shown instead of told", never "what is missing":
${rules(CURRENT_RUBRIC.economyRules)}

Score each dimension 1–5 using these anchors:
${CURRENT_RUBRIC.dimensions.map((d) => `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`).join('\n')}

OUTPUT RULES:
- Emit via the emit_critique tool ONLY.
- Every finding needs a category from the issue taxonomy, an anchor (slide index; or region with a normalized [x, y, width, height] bbox in fractions of the page, 0–1), and an action. Actions are dominated by cut / demote-to-appendix / show-visually / condense; "add" is the RARE case — use it only when something essential is truly absent.
- "example" is required and must be PERSONALIZED to the artifact: the actual rewritten line, the exact rows to gray, the specific point to circle — drawn from THEIR content, never a template.
- attentionSummary is your Stage-1 prediction in prose. When two elements compete as primary, prioritization must say which one wins and where the other goes.
- 4–10 findings, highest value first.`;

const TOOL = {
  name: 'emit_critique',
  description: 'Emit the structured poster/presentation critique as JSON.',
  input_schema: {
    type: 'object',
    required: ['dimensionScores', 'attentionSummary', 'findings'],
    additionalProperties: false,
    properties: {
      dimensionScores: {
        type: 'object',
        required: ['narrative', 'design', 'content'],
        additionalProperties: false,
        properties: {
          narrative: { type: 'integer', minimum: 1, maximum: 5 },
          design: { type: 'integer', minimum: 1, maximum: 5 },
          content: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
      attentionSummary: { type: 'string' },
      prioritization: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['dimension', 'severity', 'category', 'anchor', 'action', 'problem', 'fix', 'example'],
          additionalProperties: false,
          properties: {
            dimension: { type: 'string', enum: ['narrative', 'design', 'content'] },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            category: { type: 'string', enum: [...CURRENT_RUBRIC.issueCategories] },
            anchor: {
              type: 'object',
              required: ['kind'],
              properties: {
                kind: { type: 'string', enum: ['block', 'region', 'slide'] },
                blockId: { type: 'string' },
                page: { type: 'integer', minimum: 1 },
                bbox: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
              },
            },
            action: { type: 'string', enum: ['cut', 'demote-to-appendix', 'show-visually', 'condense', 'keep-as-primary', 'add'] },
            problem: { type: 'string' },
            fix: { type: 'string' },
            example: { type: 'string' },
            tradeoff: { type: 'string' },
          },
        },
      },
    },
  },
} satisfies Anthropic.Tool;

// ---- Cost accounting (CONFIRM current pricing before pricing the pack) --
const COST_PER_MTOK = { input: 3.0, output: 15.0 }; // Sonnet 4.5 list, 2026-07: verify

// ---- Runner ---------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;

const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; pages: string[] }>;
};

const anthropic = new Anthropic();
mkdirSync(join(root, 'results'), { recursive: true });

function mediaType(p: string): 'image/png' | 'image/jpeg' {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported page image ${p}`);
}

let items = manifest.items;
if (only) items = items.filter((i) => only.includes(i.id));
if (limit !== null) items = items.slice(0, limit);

for (const item of items) {
  const content: Anthropic.MessageParam['content'] = item.pages.map((p) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: mediaType(p),
      data: readFileSync(join(root, 'corpus', p)).toString('base64'),
    },
  }));
  content.push({
    type: 'text',
    text: `Artifact: ${item.pages.length} page(s). Pages are in reading order. Produce the two-stage critique now.`,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'emit_critique' },
    messages: [{ role: 'user', content }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error(`${item.id}: no tool_use in response`);
  const critique = CritiqueSchema.parse(toolUse.input); // throws on contract violation — that's a finding, keep the raw file
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  const estCostUsd =
    (usage.inputTokens / 1e6) * COST_PER_MTOK.input + (usage.outputTokens / 1e6) * COST_PER_MTOK.output;

  writeFileSync(
    join(root, 'results', `${item.id}.json`),
    JSON.stringify({ posterId: item.id, critique, usage }, null, 2) + '\n',
  );
  appendFileSync(
    join(root, 'results', 'costs.jsonl'),
    JSON.stringify({ posterId: item.id, ...usage, estCostUsd: Number(estCostUsd.toFixed(4)) }) + '\n',
  );
  console.log(`${item.id}: ${critique.findings.length} findings, ${usage.inputTokens}+${usage.outputTokens} tokens, ~$${estCostUsd.toFixed(3)}`);
}
