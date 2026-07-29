/**
 * Provider-agnostic condense() interface.
 *
 * One `CondenseProvider` per LLM vendor; the route picks a provider by
 * id from a registry, so the Phase-2 bake-off (cheaper OpenAI AND
 * Anthropic models) slots in as additional registry entries + a config
 * change — never a rewrite. Building this from the start is what makes
 * the bake-off actually happen.
 *
 * The OpenAI adapter talks to the Chat Completions API over plain
 * fetch (injected for tests) with a forced function call, mirroring
 * the forced tool-use pattern the import router uses with Anthropic.
 */
import { z } from 'zod';
import type {
  CondenseEmphasis,
  CondensePinnedInput,
  CondenseRoleInput,
} from '@postr/shared';
import {
  CONDENSER_MAX_TOKENS,
  CONDENSER_TIMEOUT_MS,
} from './config.js';
import {
  CONDENSE_TOOL_SCHEMA,
  CONDENSER_SYSTEM_PROMPT,
  buildCondenserUserMessage,
} from './prompt.js';

export interface CondenseInput {
  roles: CondenseRoleInput[];
  pinned: CondensePinnedInput[];
  emphasis: CondenseEmphasis;
}

/** Raw provider output — budget enforcement happens in the route. */
export interface RawCondenseOutput {
  roles: Array<{ role: CondenseRoleInput['role']; text: string }>;
  pinned: Array<{ id: string; text: string }>;
}

export interface CondenseProvider {
  id: string;
  condense(input: CondenseInput): Promise<RawCondenseOutput>;
}

/** Upstream failure with enough shape for the route's status mapping.
 *  The `code` is machine-readable; raw provider text stays server-side. */
export class CondenseUpstreamError extends Error {
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
    this.name = 'CondenseUpstreamError';
  }
}

/** Schema for the model's tool-call arguments. Anything outside this
 *  shape is a provider failure, not user error. */
const RawOutputSchema = z.object({
  roles: z.array(
    z.object({
      role: z.enum(['hook', 'question', 'methods', 'keyResult', 'takeaway']),
      text: z.string(),
    }),
  ),
  pinned: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .default([]),
});

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

export function createOpenAiProvider(
  options: OpenAiProviderOptions,
): CondenseProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  return {
    id: 'openai',
    async condense(input: CondenseInput): Promise<RawCondenseOutput> {
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
            // gpt-5.6-terra rejects function tools on /chat/completions unless
            // reasoning_effort is 'none' (else HTTP 400 invalid_request_error:
            // "Function tools with reasoning_effort are not supported ... use
            // /v1/responses or set reasoning_effort to 'none'"). Reproduced live
            // against OpenAI 2026-07-29. Condensing is a summarisation task, not
            // a reasoning one, so 'none' is correct. The mocked-fetch test never
            // caught this because it asserts the request shape, not the API's
            // acceptance of it — see narrativeCondense.test.ts.
            reasoning_effort: 'none',
            max_completion_tokens: CONDENSER_MAX_TOKENS,
            messages: [
              { role: 'system', content: CONDENSER_SYSTEM_PROMPT },
              {
                role: 'user',
                content: buildCondenserUserMessage(
                  input.roles,
                  input.pinned,
                  input.emphasis,
                ),
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'emit_narrative',
                  description:
                    'Emit the condensed poster panel texts as structured JSON.',
                  parameters: CONDENSE_TOOL_SCHEMA,
                },
              },
            ],
            tool_choice: {
              type: 'function',
              function: { name: 'emit_narrative' },
            },
          }),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new CondenseUpstreamError('timeout');
        }
        throw err;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new CondenseUpstreamError(
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
        throw new CondenseUpstreamError('no_tool_call');
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        throw new CondenseUpstreamError('bad_tool_json');
      }
      const validated = RawOutputSchema.safeParse(parsedArgs);
      if (!validated.success) {
        throw new CondenseUpstreamError('bad_tool_json');
      }
      return validated.data;
    },
  };
}
