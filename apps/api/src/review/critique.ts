/**
 * Anthropic critique provider — the forced tool-use call behind the
 * Presentation Checker's two-stage review. Mirrors the import.ts:897-959
 * adapter skeleton (tool const, messages.create with tool_choice forced,
 * response.content.find(tool_use)) with two deliberate differences: the
 * model id and token cap come from review/config.ts (never inlined), and
 * the raw tool payload goes through schema.ts — a contract violation is
 * a `bad_tool_json` provider failure, not a parse crash.
 *
 * No streaming (Global Constraints). Token usage is logged on every call
 * under the [review.critique] tag — the day-one cost instrumentation the
 * pack price and weekly quota are set from (spec §6.2).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { CritiqueResult } from '@postr/shared';
import { REVIEW_MODEL, REVIEW_MAX_TOKENS, REVIEW_TIMEOUT_MS } from './config.js';
import { CRITIQUE_TOOL_INPUT_SCHEMA } from './prompt.js';
import { validateCritique } from './schema.js';
import type { FetchedPage } from './fetchPages.js';

export interface CritiqueCallCtx {
  systemPrompt: string;
  userMessage: string;
  pages: FetchedPage[];
}

export interface CritiqueCallResult {
  critique: CritiqueResult;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Upstream failure with enough shape for the route's status mapping
 * (the route passes 401/429/529 through, everything else 502 — the
 * imageUrlGuard-era convention). The `code` is machine-readable; raw
 * provider text stays server-side. Class shape mirrors
 * CondenseUpstreamError.
 */
export class CritiqueUpstreamError extends Error {
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
    this.name = 'CritiqueUpstreamError';
  }
}

export async function callAnthropicCritique(
  anthropic: Anthropic,
  ctx: CritiqueCallCtx,
): Promise<CritiqueCallResult> {
  const tool = {
    name: 'emit_critique',
    description:
      'Emit the structured poster/presentation critique as JSON.',
    input_schema:
      CRITIQUE_TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  // Pages first (stable, large), the instruction text last — the order
  // import.ts:924-942 and the Phase-0 prototype both use. (SDK 0.30 has
  // no ContentBlockParam union; MessageParam['content'] is the type.)
  const content: Anthropic.MessageParam['content'] = [
    ...ctx.pages.map((p) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: p.mediaType,
        data: p.imageData,
      },
    })),
    { type: 'text' as const, text: ctx.userMessage },
  ];

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: REVIEW_MODEL,
        max_tokens: REVIEW_MAX_TOKENS,
        system: ctx.systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'emit_critique' },
        messages: [{ role: 'user', content }],
      },
      // Bounded provider work: explicit deadline per call, and no SDK
      // retries — a retried review call would silently multiply the
      // per-credit bill (the route already maps a timeout to a clean 502).
      { timeout: REVIEW_TIMEOUT_MS, maxRetries: 0 },
    );
  } catch (err) {
    // instanceof first (the SDK's real timeout class — its `name` is not
    // reliably 'APIConnectionTimeoutError' across SDK versions), then the
    // name duck-type so tests can reject with a plain Error.
    if (
      err instanceof Anthropic.APIConnectionTimeoutError ||
      (err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'APIConnectionTimeoutError'))
    ) {
      throw new CritiqueUpstreamError('timeout');
    }
    // The SDK's APIError carries a numeric `status`; duck-typed so tests
    // can reject with a plain Error + status (the SDK is mocked at the
    // layer, so a real APIError cannot be constructed in tests).
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      const detail = err instanceof Error ? err.message : undefined;
      throw new CritiqueUpstreamError('http_error', status, detail?.slice(0, 500));
    }
    throw err;
  }

  // Match OUR tool by name, not first-found: with forced tool_choice the
  // block is always emit_critique, but a contract drift (or a stray
  // earlier block) must fail typed, never parse the wrong payload.
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'emit_critique',
  );
  // Day-one cost instrumentation + max-tokens truncation spotting —
  // the import.ts:952-957 logging pattern.
  // eslint-disable-next-line no-console
  console.log('[review.critique] anthropic done', {
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    toolInputKeys: toolUse?.input ? Object.keys(toolUse.input) : null,
  });
  if (!toolUse) throw new CritiqueUpstreamError('no_tool_call');

  const critique = validateCritique(toolUse.input);
  if (!critique) throw new CritiqueUpstreamError('bad_tool_json');

  return {
    critique,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
