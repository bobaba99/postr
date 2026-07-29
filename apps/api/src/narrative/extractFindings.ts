/**
 * Provider-agnostic findings extraction — the talk path's LLM step.
 *
 * This is the LLM extraction arm (B) that the §3.1 experiment selected
 * (docs/plans/2026-07-29-paper-to-slides.md): the talk needs *ranked
 * findings with a verbatim supporting quote each* for the star-finding
 * cards, and the LLM arm beat the deterministic one ~8× on star-hit.
 *
 * It is ADDITIVE and server-side. It does NOT touch the deterministic
 * poster path (coreRelevance.ts / mapper.ts) — those still decide the
 * poster's structure. This module only produces ranked cards for the
 * talk deck.
 *
 * MIRRORS condense.ts deliberately: one provider per vendor behind a
 * small interface, a forced function call over an injected `fetch`
 * (so tests never hit the real API), zod-validated tool arguments, and
 * an ExtractUpstreamError whose machine-readable `code` the route maps
 * to a status while raw provider text stays server-side. The Phase-2
 * bake-off slots in as another registry entry, never a rewrite.
 *
 * The OpenAI adapter sends `reasoning_effort:'none'` for the same
 * reason condense.ts does: gpt-5.6-terra rejects forced function tools
 * on /chat/completions unless it is set (HTTP 400
 * invalid_request_error). Extraction is a structured-reading task, not
 * a reasoning one, so 'none' is correct.
 *
 * THE FIDELITY GATE (rankAndGate) is the load-bearing invariant: a
 * finding survives only if its `sourceQuote` is a verbatim substring of
 * the results text (after whitespace normalization). No quote in the
 * text, no finding — this is what keeps the star-finding cards honest.
 */
import { z } from 'zod';
import { EXTRACTION_MAX_TOKENS, CONDENSER_TIMEOUT_MS } from './config.js';

/** One extracted finding. `rank` is the model's importance order (1 =
 *  most important); the route re-ranks contiguously after gating. */
export interface RawFinding {
  text: string;
  sourceQuote: string;
  sourceSection: string;
  rank: number;
}

export interface ExtractInput {
  /** The results / findings passage to mine. */
  resultsText: string;
  /** Optional short framing (title, one-line summary) to orient ranking. */
  context?: string;
}

export interface RawExtractionOutput {
  findings: RawFinding[];
}

export interface ExtractionProvider {
  id: string;
  extract(input: ExtractInput): Promise<RawExtractionOutput>;
}

/** Upstream failure with enough shape for the route's status mapping.
 *  Mirrors CondenseUpstreamError — same codes, same intent: the `code`
 *  is machine-readable; raw provider text never leaves the server. */
export class ExtractUpstreamError extends Error {
  constructor(
    public readonly code:
      | 'http_error'
      | 'no_tool_call'
      | 'bad_tool_json'
      | 'timeout',
    public readonly status?: number,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'ExtractUpstreamError';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Prompt + tool schema
//
//  Kept in this module (not in narrative/prompt.ts) on purpose:
//  prompt.ts is the owner-audited home for CONDENSER prompt text only
//  and says so at the top. Extraction is a separate LLM job with its
//  own contract, so its prompt lives with its provider.
// ─────────────────────────────────────────────────────────────────────

/**
 * System prompt. The rules encode the fidelity contract the gate later
 * ENFORCES deterministically: every finding must carry a VERBATIM
 * supporting sentence copied from the text, never a paraphrase, and a
 * finding with no supporting sentence must be omitted rather than
 * invented. The model ranks by importance; the route re-ranks after
 * gating.
 */
export const EXTRACT_SYSTEM_PROMPT = `You extract the key scientific findings from a research paper's results, for use as talk-slide "star finding" cards.

You will receive the RESULTS text of a paper, and optionally a short CONTEXT line (its title or one-sentence summary) to help you judge which finding matters most.

Return a ranked list of findings. For EACH finding:
1. "text": a single, self-contained assertion stating the finding in plain scientific language. One sentence. Keep every number — p-values, percentages, effect sizes, sample sizes — exactly as written; do not round or restate them.
2. "sourceQuote": the exact sentence (or clause) from the RESULTS text that supports this finding, copied VERBATIM — character for character. Do NOT paraphrase, summarize, correct, or shorten it. This is a copy, not a rewrite. Copy from the text you were given, nothing else.
3. "sourceSection": the section the quote came from (e.g. "Results", "Discussion"). If unclear, use "Results".
4. "rank": the finding's importance, 1 = the single most important ("star") finding, then 2, 3, and so on. Rank by scientific significance, not order of appearance.

Hard rules:
- NEVER invent a finding. If a claim has no supporting sentence in the RESULTS text, OMIT it entirely. A missing finding is fine; a fabricated one is a failure.
- The "sourceQuote" MUST appear verbatim in the RESULTS text. If you cannot copy an exact supporting sentence, do not emit that finding.
- Rank the findings; do not return ties. Most important first.
- Do not add commentary, headings, or findings not grounded in the text.`;

/**
 * Build the user message. CONTEXT (small, volatile) goes LAST so the
 * large RESULTS block stays a stable cacheable prefix across re-runs on
 * the same paper — the same prompt-cache ordering discipline as the
 * condenser (panels-then-emphasis). The results text is quoted as DATA,
 * never as instructions.
 */
export function buildExtractionUserMessage(input: ExtractInput): string {
  const parts: string[] = [];
  parts.push('RESULTS');
  parts.push(input.resultsText);
  if (input.context?.trim()) {
    parts.push('');
    parts.push('CONTEXT');
    parts.push(input.context.trim());
  }
  return parts.join('\n');
}

/** Forced tool-use output schema. The route validates the reply against
 *  this; the fidelity gate + re-ranking happen afterwards. */
export const EXTRACT_TOOL_SCHEMA = {
  type: 'object',
  required: ['findings'],
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'sourceQuote', 'sourceSection', 'rank'],
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            description:
              'A single self-contained assertion stating the finding, numbers kept verbatim.',
          },
          sourceQuote: {
            type: 'string',
            description:
              'The exact supporting sentence copied VERBATIM from the results text.',
          },
          sourceSection: {
            type: 'string',
            description: 'The section the quote came from, e.g. "Results".',
          },
          rank: {
            type: 'integer',
            description: 'Importance rank, 1 = most important.',
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
//  Validation + fidelity gate (pure)
// ─────────────────────────────────────────────────────────────────────

/** Schema for the model's tool-call arguments. Anything outside this
 *  shape is a provider failure, not user error — mapped to
 *  bad_tool_json by parseExtractionOutput. */
const RawExtractionSchema = z.object({
  findings: z.array(
    z.object({
      text: z.string().min(1),
      sourceQuote: z.string().min(1),
      sourceSection: z.string().min(1),
      rank: z.number().int(),
    }),
  ),
});

/**
 * Validate the parsed tool arguments into a RawExtractionOutput. Throws
 * ExtractUpstreamError('bad_tool_json') on any mismatch, so the route
 * maps it to the same status a malformed condense reply gets.
 */
export function parseExtractionOutput(payload: unknown): RawExtractionOutput {
  const validated = RawExtractionSchema.safeParse(payload);
  if (!validated.success) {
    throw new ExtractUpstreamError('bad_tool_json');
  }
  return validated.data;
}

/** Collapse all whitespace runs to a single space and trim, so a quote
 *  that spans a line break in the source still matches a one-line copy.
 *  Case is preserved — a verbatim quote should match case too. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * THE FIDELITY GATE. Drops any finding whose `sourceQuote` is not a
 * verbatim substring of `resultsText` (after whitespace normalization),
 * sorts the survivors by `rank` ascending, and re-ranks them
 * contiguously from 1. Pure — never mutates its input.
 *
 * No quote in the text, no finding: this is what keeps the star-finding
 * cards from carrying a fabricated or altered sentence to the slide.
 */
export function rankAndGate(
  findings: RawFinding[],
  resultsText: string,
): RawFinding[] {
  const haystack = normalizeWhitespace(resultsText);
  const kept = findings.filter((f) => {
    const needle = normalizeWhitespace(f.sourceQuote);
    return needle.length > 0 && haystack.includes(needle);
  });
  return [...kept]
    .sort((a, b) => a.rank - b.rank)
    .map((f, i) => ({ ...f, rank: i + 1 }));
}

// ─────────────────────────────────────────────────────────────────────
//  OpenAI provider
// ─────────────────────────────────────────────────────────────────────

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

export function createOpenAiExtractionProvider(
  options: OpenAiProviderOptions,
): ExtractionProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  return {
    id: 'openai',
    async extract(input: ExtractInput): Promise<RawExtractionOutput> {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          signal: AbortSignal.timeout(CONDENSER_TIMEOUT_MS),
          body: JSON.stringify({
            model: options.model,
            // REQUIRED. gpt-5.6-terra 400s on forced function tools over
            // /chat/completions unless reasoning_effort is 'none' (same
            // prod bug fixed in condense.ts). Extraction is structured
            // reading, not reasoning, so 'none' is correct.
            reasoning_effort: 'none',
            max_completion_tokens: EXTRACTION_MAX_TOKENS,
            messages: [
              { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
              { role: 'user', content: buildExtractionUserMessage(input) },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'extract_findings',
                  description:
                    'Emit the ranked scientific findings, each with a verbatim supporting quote.',
                  parameters: EXTRACT_TOOL_SCHEMA,
                },
              },
            ],
            tool_choice: {
              type: 'function',
              function: { name: 'extract_findings' },
            },
          }),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new ExtractUpstreamError('timeout');
        }
        throw err;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new ExtractUpstreamError(
          'http_error',
          response.status,
          bodyText.slice(0, 500),
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ function?: { arguments?: string } }>;
          };
        }>;
      };
      const args =
        payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        throw new ExtractUpstreamError('no_tool_call');
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        throw new ExtractUpstreamError('bad_tool_json');
      }
      return parseExtractionOutput(parsedArgs);
    },
  };
}
