/**
 * Provider-agnostic deck styling — Arm P of the Phase-2 §3.1 experiment
 * (docs/superpowers/plans/2026-07-29-paper-to-slides-phase2.md): an LLM
 * that turns each slide of a plain `SlideDeck` (Phase 1) into a
 * structured, EDITABLE layout — a device chosen from a fixed vocabulary
 * plus a handful of positioned elements — NEVER an image.
 *
 * This is ADDITIVE and server-side. It does not touch the deterministic
 * poster path (coreRelevance.ts / mapper.ts) or the talk-path extraction
 * arm (extractFindings.ts) — it only styles a deck that already exists.
 *
 * MIRRORS extractFindings.ts deliberately: one provider per vendor
 * behind a small interface, a forced function call over an injected
 * `fetch` (so tests never hit the real API), zod-validated tool
 * arguments, and a StyleUpstreamError whose machine-readable `code` the
 * route maps to a status while raw provider text stays server-side.
 *
 * The OpenAI adapter sends `reasoning_effort:'none'` for the same reason
 * condense.ts and extractFindings.ts do: gpt-5.6-terra rejects forced
 * function tools on /chat/completions unless it is set (HTTP 400
 * invalid_request_error). Styling is a structured layout-selection task,
 * not a reasoning one, so 'none' is correct.
 *
 * THE DEVICE VOCABULARY GATE (coerceDevices) is the load-bearing
 * invariant: the model is prompted to choose only from SUPPORTED_DEVICES,
 * but a model can still emit something outside it. Any device not in the
 * vocabulary is coerced to 'plain' — GRACEFUL DEGRADATION, never a
 * rejected response — because a styled slide with a fallback layout beats
 * no slide at all.
 *
 * NOTE on the device vocabulary: `apps/web/src/manuscript/deck/
 * styledTypes.ts` (Task 1) is the canonical `DeviceKind` +
 * `SUPPORTED_DEVICES` + `StyledElement`/`StyledSlide` contract. The API
 * cannot import web code, so the vocabulary and shapes are REDEFINED
 * here — kept identical by hand. The web adapter (Task 5) maps this
 * module's `RawStyledSlide` response onto the web `StyledSlide` type.
 */
import { z } from 'zod';
import { STYLE_MAX_TOKENS, CONDENSER_TIMEOUT_MS } from './config.js';

/** The fixed device vocabulary Arm P is prompted against. MUST stay
 *  identical to `DeviceKind`/`SUPPORTED_DEVICES` in
 *  apps/web/src/manuscript/deck/styledTypes.ts — that file is the
 *  canonical contract; this is the API's copy of it. */
export type DeviceKind =
  | 'plain'
  | 'quote-block'
  | 'progress-bar'
  | 'stat-emphasis'
  | 'callout';

export const SUPPORTED_DEVICES: readonly DeviceKind[] = [
  'plain',
  'quote-block',
  'progress-bar',
  'stat-emphasis',
  'callout',
];

/** A styled slide's positioned layout primitive. Mirrors `StyledElement`
 *  in styledTypes.ts: `kind` is a free-form label (e.g. "title",
 *  "callout-box", "accent-line"), `x`/`y` are inches on a 13.33x7.5in
 *  slide canvas. */
export interface RawStyledElement {
  kind: string;
  text?: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
}

/** One styled slide. `role` echoes the Phase-1 `SlideRole` the slide
 *  came from, so the web adapter can zip this back onto the plain deck
 *  by position/role. */
export interface RawStyledSlide {
  role: string;
  device: DeviceKind;
  elements: RawStyledElement[];
}

export interface RawStyleOutput {
  slides: RawStyledSlide[];
}

/** A minimal, structurally-typed view of the plain SlideDeck (Phase 1).
 *  Declared narrowly here (not imported from web) since the API cannot
 *  depend on web code — only the fields the prompt needs are required. */
export interface StyleDeckSlideInput {
  role: string;
  assertion: string;
  evidence: string | null;
  sourceQuote: string;
  speakerNotes: Array<{ text: string; provenance: string }>;
  references: string[];
  wordCapCut: boolean;
}

export interface StyleDeckInput {
  deck: {
    slides: StyleDeckSlideInput[];
    durationMinutes: number;
  };
}

export interface StyleProvider {
  id: string;
  style(input: StyleDeckInput): Promise<RawStyleOutput>;
}

/** Upstream failure with enough shape for the route's status mapping.
 *  Mirrors ExtractUpstreamError — same codes, same intent: the `code`
 *  is machine-readable; raw provider text never leaves the server. */
export class StyleUpstreamError extends Error {
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
    this.name = 'StyleUpstreamError';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Prompt + tool schema
// ─────────────────────────────────────────────────────────────────────

/**
 * System prompt. Encodes the structural contract the model must follow:
 * clean academic styling, devices drawn ONLY from SUPPORTED_DEVICES
 * (coerceDevices enforces this deterministically afterward), structured
 * positioned data rather than an image, and restraint — no distracting
 * ornamentation for its own sake.
 */
export const STYLE_SYSTEM_PROMPT = `You are a presentation designer styling a research talk deck for a clean, academic audience.

You will receive a DECK: an ordered list of slides, each with a role (title, hook, question, methods, result, takeaway, references), an assertion (the slide's main point), optional evidence text, and a verbatim source quote.

For EACH slide, choose ONE "device" — a layout strategy — and emit a list of positioned "elements" that render it.

The device MUST be exactly one of these five values, nothing else:
- "plain": a title/body layout with no special treatment. Use this for most slides, especially title/hook/question/methods/takeaway/references.
- "quote-block": a pulled-quote treatment for a slide built around a verbatim quote.
- "progress-bar": a horizontal progress/comparison track, for a slide about a proportion, rate, or stepped process.
- "stat-emphasis": a single large emphasized number or statistic as the visual anchor.
- "callout": a boxed callout treatment for a slide highlighting one key takeaway or caveat.

Each element in "elements" has:
- "kind": a short label for what the element is (e.g. "title", "section-label", "body", "stat", "callout-box", "accent-line", "footer"). Free text, but keep it short and descriptive.
- "text": the element's text content, if it has any (titles, labels, stats, body copy). Omit for purely decorative elements (rules, lines, boxes).
- "x", "y": position in INCHES on a 13.33 x 7.5 inch slide canvas (16:9). Keep a consistent left margin (~0.7in) and stay within the canvas bounds.
- "fontSize": optional, in points, for text elements.
- "color": optional hex color for the element.

Hard rules:
- Devices ONLY from the five listed above. Never invent a device name.
- This produces STRUCTURED, EDITABLE data — positions and element kinds — never an image or a rasterized description.
- Keep it clean and academic: no more than a handful of elements per slide, no decoration that does not serve the content, consistent positioning across slides.
- Do not alter the meaning of any assertion, evidence, or quote — you are styling the layout, not rewriting the content.
- Emit exactly one styled slide per input slide, in the same order.`;

/**
 * Build the user message. The deck is quoted as DATA, never as
 * instructions — each slide's assertion/evidence/quote is untrusted
 * manuscript-derived text, not a command to the model.
 */
export function buildStyleUserMessage(input: StyleDeckInput): string {
  const parts: string[] = [];
  parts.push('DECK');
  parts.push(JSON.stringify(input.deck, null, 2));
  return parts.join('\n');
}

/** Forced tool-use output schema. The route validates the reply against
 *  this, then runs coerceDevices before returning it to the client. */
export const STYLE_TOOL_SCHEMA = {
  type: 'object',
  required: ['slides'],
  additionalProperties: false,
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        required: ['role', 'device', 'elements'],
        additionalProperties: false,
        properties: {
          role: {
            type: 'string',
            description: 'Echoes the input slide role, e.g. "result".',
          },
          device: {
            type: 'string',
            enum: [...SUPPORTED_DEVICES],
            description: 'Layout strategy, one of the fixed vocabulary.',
          },
          elements: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'x', 'y'],
              additionalProperties: false,
              properties: {
                kind: { type: 'string', description: 'Short label for the element.' },
                text: { type: 'string', description: 'Text content, if any.' },
                x: { type: 'number', description: 'Position in inches, left edge.' },
                y: { type: 'number', description: 'Position in inches, top edge.' },
                fontSize: { type: 'number', description: 'Font size in points.' },
                color: { type: 'string', description: 'Hex color, e.g. "#17252A".' },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
//  Validation + vocabulary gate (pure)
// ─────────────────────────────────────────────────────────────────────

/** Schema for the model's tool-call arguments. Anything outside this
 *  shape is a provider failure, not user error — mapped to
 *  bad_tool_json by parseStyleOutput. Note `device` is NOT constrained
 *  to the vocabulary here — an out-of-vocabulary string is valid at the
 *  parse stage and handled by coerceDevices (graceful degradation),
 *  not rejected as malformed. */
const RawStyleSchema = z.object({
  slides: z.array(
    z.object({
      role: z.string().min(1),
      device: z.string().min(1),
      elements: z.array(
        z.object({
          kind: z.string().min(1),
          text: z.string().optional(),
          x: z.number(),
          y: z.number(),
          fontSize: z.number().optional(),
          color: z.string().optional(),
        }),
      ),
    }),
  ),
});

/**
 * Validate the parsed tool arguments into a RawStyleOutput. Throws
 * StyleUpstreamError('bad_tool_json') on any mismatch, so the route
 * maps it to the same status a malformed condense/extract reply gets.
 */
export function parseStyleOutput(payload: unknown): RawStyleOutput {
  const validated = RawStyleSchema.safeParse(payload);
  if (!validated.success) {
    throw new StyleUpstreamError('bad_tool_json');
  }
  return validated.data as RawStyleOutput;
}

function isSupportedDevice(device: string): device is DeviceKind {
  return (SUPPORTED_DEVICES as readonly string[]).includes(device);
}

/**
 * THE DEVICE VOCABULARY GATE. Any slide whose `device` is not one of
 * SUPPORTED_DEVICES is coerced to 'plain' — GRACEFUL DEGRADATION, never
 * a rejected response. Pure — never mutates its input; returns a new
 * object with new slide objects.
 */
export function coerceDevices(output: RawStyleOutput): RawStyleOutput {
  return {
    slides: output.slides.map((s) => ({
      ...s,
      device: isSupportedDevice(s.device) ? s.device : 'plain',
    })),
  };
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

export function createOpenAiStyleProvider(
  options: OpenAiProviderOptions,
): StyleProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  return {
    id: 'openai',
    async style(input: StyleDeckInput): Promise<RawStyleOutput> {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          // Shared with condense/extract: both are single forced-tool-use
          // requests against the same vendor, so a single timeout keeps
          // the LLM steps consistent.
          signal: AbortSignal.timeout(CONDENSER_TIMEOUT_MS),
          body: JSON.stringify({
            model: options.model,
            // REQUIRED. gpt-5.6-terra 400s on forced function tools over
            // /chat/completions unless reasoning_effort is 'none' (same
            // prod bug fixed in condense.ts / extractFindings.ts).
            // Styling is structured layout selection, not reasoning, so
            // 'none' is correct.
            reasoning_effort: 'none',
            max_completion_tokens: STYLE_MAX_TOKENS,
            messages: [
              { role: 'system', content: STYLE_SYSTEM_PROMPT },
              { role: 'user', content: buildStyleUserMessage(input) },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'style_deck',
                  description:
                    'Emit the styled slides: one device + positioned elements per input slide.',
                  parameters: STYLE_TOOL_SCHEMA,
                },
              },
            ],
            tool_choice: {
              type: 'function',
              function: { name: 'style_deck' },
            },
          }),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new StyleUpstreamError('timeout');
        }
        throw err;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new StyleUpstreamError(
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
        throw new StyleUpstreamError('no_tool_call');
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        throw new StyleUpstreamError('bad_tool_json');
      }
      return parseStyleOutput(parsedArgs);
    },
  };
}
