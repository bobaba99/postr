/**
 * REVIEW PROMPT — composed FROM the versioned rubric, never inlined
 * (spec §2.0). The criteria live in ./rubric/ as typed data; this module
 * only renders them. Adding an expert-derived criterion is a rubric
 * entry, not a prompt edit.
 *
 * The structure mirrors the Phase-0 prototype's SYSTEM (Task 5, validated
 * on the frozen corpus): Stage 1 renders the perception rules, Stage 2 is
 * fixed judge framing, the ECONOMY section renders the economy rules
 * (they govern BOTH stages), scoring renders the dimension anchors. The
 * system prompt stays static per rubric version (cacheable); everything
 * artifact-specific goes into the user message.
 */
import type { CritiqueResult, ReviewSourceKind } from '@postr/shared';
import { CURRENT_RUBRIC, type Rubric } from './rubric/index.js';
import type { ReviewSignals } from './signals.js';

/** Rule ids render as [id] so findings can be traced back to rubric
 *  rules during §7 disagreement triage. */
function renderRules(rules: Rubric['perceptionRules']): string {
  return rules.map((r) => `- [${r.id}] ${r.text}`).join('\n');
}

function renderDimensions(rubric: Rubric): string {
  return rubric.dimensions
    .map(
      (d) =>
        `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`,
    )
    .join('\n');
}

/**
 * The critique system prompt for a rubric (default: CURRENT_RUBRIC).
 * Passing a rubric is how the §7 harness A/B-tests criterion changes
 * without editing this file.
 */
export function composeReviewSystemPrompt(
  rubric: Rubric = CURRENT_RUBRIC,
): string {
  return `You are an expert reviewer of research posters and conference talks. You critique the artifact in TWO ORDERED STAGES. The ordering matters: perceive first, then judge against intent.

STAGE 1 — Perceptual-attention pass (free-viewing simulation).
Before any judgment, describe how a first-time viewer's eye would actually move across the artifact: the entry point, salience hotspots, any faces/photos that hijack gaze, the emphasis load, and the predicted reading path. Ground every prediction in these perception rules:
${renderRules(rubric.perceptionRules)}

STAGE 2 — Judge the predicted flow against the intended message.
Using your Stage-1 prediction, judge: does the eye land on the KEY RESULT early, or does something decorative hijack it? Is the narrative (hook → question → method → result → takeaway) recoverable from the scan path? Does each figure connect to its explaining text? Is the content right for the audience (jargon, claims vs evidence, section balance, readability at distance)?

BOTH stages are governed by the ECONOMY principle — your default posture is "what can be removed or shown instead of told", never "what is missing":
${renderRules(rubric.economyRules)}

Score each dimension 1–5 using these anchors:
${renderDimensions(rubric)}

FINDING ANCHORS — three kinds:
- block: the id of a block in the artifact's structured document. Use ONLY when the user message says a structured document is provided.
- region: a page number plus a normalized [x, y, width, height] bbox in fractions of the page, each 0–1.
- slide: a page number only, for whole-page issues.

OUTPUT RULES:
- Emit via the emit_critique tool ONLY.
- Every finding needs a category from the issue taxonomy, an anchor, and an action. Actions are dominated by cut / demote-to-appendix / show-visually / condense; "add" is the RARE case — use it only when something essential is truly absent.
- "example" is required and must be PERSONALIZED to the artifact: the actual rewritten line, the exact rows to gray, the specific point to circle — drawn from THEIR content, never a template.
- attentionSummary is your Stage-1 prediction in prose. When two elements compete as primary, prioritization must say which one wins and where the other goes.
- 4–10 findings, highest value first.`;
}

function renderSignals(signals: ReviewSignals): string {
  return [
    'Deterministic signals measured from the structured document (trust these numbers over your own estimate):',
    `- Emphasis runs: ${signals.emphasisRunCount} total (bold ${signals.boldRuns}, italic ${signals.italicRuns}, highlight ${signals.highlightRuns})`,
    `- Blocks: ${signals.figureBlockCount} figure, ${signals.tableBlockCount} table, ${signals.textBlockCount} text`,
    `- Total words: ${signals.totalWordCount}`,
    `- Figure-to-text ratio: ${signals.figureToTextRatio.toFixed(2)}`,
  ].join('\n');
}

/**
 * Initial critique user message: artifact facts first, the closing
 * instruction last — the order the Phase-0 prototype's runs validated.
 */
export function buildInitialUserMessage(input: {
  pageCount: number;
  sourceKind: ReviewSourceKind;
  signals?: ReviewSignals;
  posterDocPresent: boolean;
}): string {
  const parts: string[] = [];
  parts.push(
    `Artifact: ${input.pageCount} page(s), in reading order, provided as the images above. Source kind: ${input.sourceKind}.`,
  );
  parts.push(
    input.posterDocPresent
      ? 'A structured poster document (PosterDoc) accompanies the images: block anchors ARE available — prefer { kind: "block", blockId } whenever a finding is about a specific text or figure block.'
      : 'No structured document exists for this source: block anchors are NOT available — anchor every finding by region (page + normalized bbox) or slide (page).',
  );
  parts.push(
    input.signals
      ? renderSignals(input.signals)
      : 'No deterministic signals are available for this source — judge emphasis load and figure-to-text balance visually.',
  );
  parts.push('Produce the two-stage critique now.');
  return parts.join('\n');
}

/**
 * Follow-up user message (spec §5.2): a diff against the initial
 * critique, not a fresh review — the "mentor tracking your improvement"
 * framing. The initial findings arrive as JSON; the judge questions are
 * fixed framing; the emit instruction reframes the output as the state
 * of the REVISED artifact.
 */
export function buildFollowupUserMessage(input: {
  initialFindings: CritiqueResult;
  pageCount: number;
  sourceKind: ReviewSourceKind;
  signals?: ReviewSignals;
}): string {
  const parts: string[] = [];
  parts.push(
    `This is a FOLLOW-UP review. The author revised their ${input.pageCount}-page ${input.sourceKind} artifact after your initial critique; the revised pages are the images above.`,
  );
  parts.push('');
  parts.push('INITIAL CRITIQUE (JSON):');
  parts.push(JSON.stringify(input.initialFindings));
  parts.push('');
  parts.push('Judge the revision against those initial findings:');
  parts.push(
    '1. Did they address these? Go finding by finding — addressed, partially addressed, or not addressed — citing what you see on the revised pages.',
  );
  parts.push(
    '2. What is still open? Carry every unaddressed or partially-addressed item into your findings.',
  );
  parts.push(
    '3. New issues introduced by the revision, if any are real — do not manufacture problems to justify the follow-up.',
  );
  if (input.signals) {
    parts.push('');
    parts.push(renderSignals(input.signals));
  }
  parts.push('');
  parts.push(
    'Emit a critique of the REVISED artifact: attentionSummary is the new Stage-1 prediction; findings are what still needs fixing (carried-forward open items plus genuine new ones), not a repeat of what is now fixed.',
  );
  return parts.join('\n');
}

/**
 * Anthropic rejects top-level input-schema unions, so the strict anchor
 * union lives under its property, where nested `anyOf` is supported.
 */
export const CRITIQUE_TOOL_INPUT_SCHEMA = {
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
        required: [
          'dimension',
          'severity',
          'category',
          'anchor',
          'action',
          'problem',
          'fix',
          'example',
        ],
        additionalProperties: false,
        properties: {
          dimension: {
            type: 'string',
            enum: ['narrative', 'design', 'content'],
          },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: {
            type: 'string',
            enum: [...CURRENT_RUBRIC.issueCategories],
          },
          anchor: {
            anyOf: [
              {
                type: 'object',
                required: ['kind', 'blockId'],
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', enum: ['block'] },
                  blockId: { type: 'string', minLength: 1 },
                },
              },
              {
                type: 'object',
                required: ['kind', 'page', 'bbox'],
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', enum: ['region'] },
                  page: { type: 'integer', minimum: 1 },
                  bbox: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 4,
                    maxItems: 4,
                  },
                },
              },
              {
                type: 'object',
                required: ['kind', 'page'],
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', enum: ['slide'] },
                  page: { type: 'integer', minimum: 1 },
                },
              },
            ],
          },
          action: {
            type: 'string',
            enum: [
              'cut',
              'demote-to-appendix',
              'show-visually',
              'condense',
              'keep-as-primary',
              'add',
            ],
          },
          problem: { type: 'string' },
          fix: { type: 'string' },
          example: { type: 'string' },
          tradeoff: { type: 'string' },
        },
      },
    },
  },
} as const;
