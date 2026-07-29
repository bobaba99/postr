/**
 * Provider-agnostic theme generation — Arm T of the Phase-2 §3.1
 * experiment (docs/superpowers/plans/2026-07-29-paper-to-slides-phase2.md):
 * a cheap LLM call that produces a field-appropriate THEME (palette +
 * type scale) plus 4 palette variations. This is the normalize/parameter
 * layer that feeds the deterministic `applyTheme` recolor step
 * (apps/web/src/manuscript/deck/applyTheme.ts, fbc58c0) — a "vibe"
 * re-run only re-invokes this arm, never the deterministic layer.
 *
 * This is ADDITIVE and server-side. It does not touch the deterministic
 * poster path (coreRelevance.ts / mapper.ts) or the other narrative LLM
 * steps (condense.ts / extractFindings.ts / styleDeck.ts) — it only
 * produces a theme for a topic that already exists.
 *
 * MIRRORS styleDeck.ts / extractFindings.ts deliberately: one provider
 * per vendor behind a small interface, a forced function call over an
 * injected `fetch` (so tests never hit the real API), zod-validated tool
 * arguments, and a ThemeUpstreamError whose machine-readable `code` the
 * route maps to a status while raw provider text stays server-side.
 *
 * The OpenAI adapter sends `reasoning_effort:'none'` for the same reason
 * condense.ts / extractFindings.ts / styleDeck.ts do: gpt-5.6-terra
 * rejects forced function tools on /chat/completions unless it is set
 * (HTTP 400 invalid_request_error). Theme generation is a structured
 * palette/type-scale selection task, not a reasoning one, so 'none' is
 * correct.
 *
 * THE PALETTES-LENGTH-4 GUARD (enforced inside RawThemeSchema, not as a
 * separate coercion step) is the load-bearing invariant: the palette
 * slide + re-vibe UI expects exactly 4 variations, so a reply with 3 or
 * 5 is a provider failure (bad_tool_json), not something to pad or trim
 * silently — unlike the device vocabulary gate in styleDeck.ts, a wrong
 * palette count has no safe deterministic fallback to coerce to.
 *
 * NOTE on the Theme shape: `apps/web/src/manuscript/deck/styledTypes.ts`
 * (Task 1) is the canonical `Theme` contract. The API cannot import web
 * code, so the shape is REDEFINED here — kept identical by hand. The web
 * adapter (Task 5) maps this module's `RawThemeOutput` response onto the
 * web `Theme` type.
 */
import { z } from 'zod';
import { THEME_MAX_TOKENS, CONDENSER_TIMEOUT_MS } from './config.js';

/** A generated theme. Mirrors `Theme` in styledTypes.ts: a palette of
 *  hex colors, a three-tier type scale (points), a short prose note on
 *  how to apply accent color, and a rationale explaining the choice. */
export interface RawTheme {
  palette: string[];
  typeScale: {
    heading: number;
    body: number;
    label: number;
  };
  accentTreatment: string;
  rationale: string;
}

export interface RawThemeOutput {
  theme: RawTheme;
  /** Exactly 4 field-appropriate palette variations, for the palette
   *  slide + re-vibe UI. Each variation is itself a palette (>=3 hex
   *  colors). */
  palettes: string[][];
}

export interface ThemeGenInput {
  /** The paper's topic/field, used to pick a field-appropriate palette
   *  (e.g. muted clinical tones for medicine, warmer tones for social
   *  science). */
  topic: string;
  /** Optional steering text — when present, the palette/type scale
   *  should lean toward this vibe while staying restrained and legible.
   *  A "vibe" re-run passes this to re-invoke Arm T alone. */
  vibe?: string;
}

export interface ThemeProvider {
  id: string;
  generateTheme(input: ThemeGenInput): Promise<RawThemeOutput>;
}

/** Upstream failure with enough shape for the route's status mapping.
 *  Mirrors StyleUpstreamError/ExtractUpstreamError — same codes, same
 *  intent: the `code` is machine-readable; raw provider text never
 *  leaves the server. */
export class ThemeUpstreamError extends Error {
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
    this.name = 'ThemeUpstreamError';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Prompt + tool schema
// ─────────────────────────────────────────────────────────────────────

/**
 * System prompt. Encodes the restrained, field-matched design brief:
 * a calm, legible academic-presentation palette drawn from the paper's
 * field, never a distraction from the content, plus 4 field-appropriate
 * variations for the palette slide / re-vibe UI. When a vibe is present,
 * it steers the palette/type choices while staying within the same
 * restrained, legible register.
 */
export const THEME_SYSTEM_PROMPT = `You are a restrained academic-presentation designer choosing a color palette and type scale for a research talk deck.

You will receive a TOPIC (the paper's subject/field) and optionally a VIBE (a short steering note for the palette/type feel).

Design ONE applied theme, matched to the paper's field:
- "palette": an ordered list of AT LEAST 3 hex colors. Include a light neutral background, a high-contrast dark text color, and at least one restrained accent. Choose tones that suit the field (e.g. calm clinical blues/greens for medicine, warmer earth tones for social science, cool slate for physical sciences) — never garish, saturated, or distracting.
- "typeScale": three font sizes in points — "heading", "body", "label" — sized for a 16:9 slide read from across a room. heading > body > label.
- "accentTreatment": one or two sentences on how to use the accent color(s) sparingly (e.g. for headings, key stats, or callouts) — restraint is the rule, not decoration for its own sake.
- "rationale": one or two sentences explaining why this palette and scale suit the paper's field and keep the deck calm and legible.

When a VIBE is present, let it steer the palette hue/warmth and the type scale's weight or size WITHOUT abandoning restraint, legibility, or field-appropriateness — a vibe changes the feel, not the fundamentals.

Then produce "palettes": EXACTLY FOUR field-appropriate palette variations (each an array of at least 3 hex colors, in the same light-background/dark-text/accent shape as the applied theme's palette). These are alternatives for a palette-picker UI, not near-duplicates — vary the hue or warmth meaningfully across the four while keeping every one calm, legible, and suited to the field.

Hard rules:
- The applied theme's palette MUST have at least 3 colors.
- "palettes" MUST contain EXACTLY 4 entries, each with at least 3 colors — never 3, never 5.
- Every color is a hex string (e.g. "#1F2933").
- Keep every palette restrained and legible: no neon, no low-contrast text-on-background pairs, no more than a small accent footprint.
- Do not invent content about the paper — you are only choosing colors and type sizes for the field/topic given.`;

/**
 * Build the user message. TOPIC and VIBE are quoted as DATA, never as
 * instructions — both are untrusted user-supplied text, not a command
 * to the model.
 */
export function buildThemeUserMessage(input: ThemeGenInput): string {
  const parts: string[] = [];
  parts.push('TOPIC');
  parts.push(input.topic);
  if (input.vibe?.trim()) {
    parts.push('');
    parts.push('VIBE');
    parts.push(input.vibe.trim());
  }
  return parts.join('\n');
}

const TYPE_SCALE_SCHEMA = {
  type: 'object',
  required: ['heading', 'body', 'label'],
  additionalProperties: false,
  properties: {
    heading: { type: 'number', description: 'Heading font size in points.' },
    body: { type: 'number', description: 'Body font size in points.' },
    label: { type: 'number', description: 'Label font size in points.' },
  },
} as const;

const THEME_SCHEMA = {
  type: 'object',
  required: ['palette', 'typeScale', 'accentTreatment', 'rationale'],
  additionalProperties: false,
  properties: {
    palette: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ordered hex colors, at least 3: background, text, accent(s).',
    },
    typeScale: TYPE_SCALE_SCHEMA,
    accentTreatment: {
      type: 'string',
      description: 'How to use the accent color(s) sparingly.',
    },
    rationale: {
      type: 'string',
      description: 'Why this palette/scale suits the field, in 1-2 sentences.',
    },
  },
} as const;

/** Forced tool-use output schema. The route validates the reply against
 *  this and returns it directly to the client — the palettes-length-4
 *  guard lives in the zod schema below, not as a post-hoc coercion. */
export const THEME_TOOL_SCHEMA = {
  type: 'object',
  required: ['theme', 'palettes'],
  additionalProperties: false,
  properties: {
    theme: THEME_SCHEMA,
    palettes: {
      type: 'array',
      description: 'EXACTLY 4 field-appropriate palette variations.',
      items: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
//  Validation (pure)
// ─────────────────────────────────────────────────────────────────────

const RawThemeShapeSchema = z.object({
  palette: z.array(z.string().min(1)).min(3),
  typeScale: z.object({
    heading: z.number(),
    body: z.number(),
    label: z.number(),
  }),
  accentTreatment: z.string().min(1),
  rationale: z.string().min(1),
});

/** Schema for the model's tool-call arguments. Anything outside this
 *  shape is a provider failure, not user error — mapped to
 *  bad_tool_json by parseThemeOutput. The `.length(4)` on `palettes` IS
 *  the palettes-length-4 guard: a reply with 3 or 5 variations fails
 *  parsing outright, since there is no safe deterministic count to
 *  coerce to (unlike the device vocabulary gate in styleDeck.ts). */
const RawThemeOutputSchema = z.object({
  theme: RawThemeShapeSchema,
  palettes: z.array(z.array(z.string().min(1)).min(3)).length(4),
});

/**
 * Validate the parsed tool arguments into a RawThemeOutput. Throws
 * ThemeUpstreamError('bad_tool_json') on any mismatch, so the route
 * maps it to the same status a malformed condense/extract/style reply
 * gets.
 */
export function parseThemeOutput(payload: unknown): RawThemeOutput {
  const validated = RawThemeOutputSchema.safeParse(payload);
  if (!validated.success) {
    throw new ThemeUpstreamError('bad_tool_json');
  }
  return validated.data as RawThemeOutput;
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

export function createOpenAiThemeProvider(
  options: OpenAiProviderOptions,
): ThemeProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  return {
    id: 'openai',
    async generateTheme(input: ThemeGenInput): Promise<RawThemeOutput> {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          // Shared with condense/extract/style: all are single
          // forced-tool-use requests against the same vendor, so a
          // single timeout keeps the LLM steps consistent.
          signal: AbortSignal.timeout(CONDENSER_TIMEOUT_MS),
          body: JSON.stringify({
            model: options.model,
            // REQUIRED. gpt-5.6-terra 400s on forced function tools over
            // /chat/completions unless reasoning_effort is 'none' (same
            // prod bug fixed in condense.ts / extractFindings.ts /
            // styleDeck.ts). Theme generation is structured
            // palette/type-scale selection, not reasoning, so 'none' is
            // correct.
            reasoning_effort: 'none',
            max_completion_tokens: THEME_MAX_TOKENS,
            messages: [
              { role: 'system', content: THEME_SYSTEM_PROMPT },
              { role: 'user', content: buildThemeUserMessage(input) },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'generate_theme',
                  description:
                    'Emit the applied theme (palette + typeScale) and exactly 4 field-appropriate palette variations.',
                  parameters: THEME_TOOL_SCHEMA,
                },
              },
            ],
            tool_choice: {
              type: 'function',
              function: { name: 'generate_theme' },
            },
          }),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new ThemeUpstreamError('timeout');
        }
        throw err;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new ThemeUpstreamError(
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
        throw new ThemeUpstreamError('no_tool_call');
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        throw new ThemeUpstreamError('bad_tool_json');
      }
      return parseThemeOutput(parsedArgs);
    },
  };
}
