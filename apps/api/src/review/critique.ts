import type Anthropic from '@anthropic-ai/sdk';
import type { CritiqueResult } from '@postr/shared';
import { REVIEW_MAX_TOKENS, REVIEW_MODEL } from './config.js';
import type { FetchedPage } from './fetchPages.js';
import { CRITIQUE_TOOL_INPUT_SCHEMA } from './prompt.js';
import { validateCritique } from './schema.js';

export interface CritiqueCallCtx {
  systemPrompt: string;
  userMessage: string;
  pages: FetchedPage[];
}

export interface CritiqueCallResult {
  critique: CritiqueResult;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

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
    description: 'Emit the structured poster/presentation critique as JSON.',
    input_schema:
      CRITIQUE_TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const content: Anthropic.MessageParam['content'] = [
    ...ctx.pages.map((page) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: page.mediaType,
        data: page.imageData,
      },
    })),
    { type: 'text', text: ctx.userMessage },
  ];

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: REVIEW_MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      system: ctx.systemPrompt,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'emit_critique' },
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : '';
    if (
      errorName === 'TimeoutError' ||
      errorName === 'APIConnectionTimeoutError'
    ) {
      throw new CritiqueUpstreamError('timeout');
    }

    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      const detail = error instanceof Error ? error.message : undefined;
      throw new CritiqueUpstreamError(
        'http_error',
        status,
        detail?.slice(0, 500),
      );
    }

    throw error;
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  console.log('[review.critique] anthropic done', {
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    toolInputKeys: toolUse?.input ? Object.keys(toolUse.input) : null,
  });

  if (!toolUse) {
    throw new CritiqueUpstreamError('no_tool_call');
  }

  const critique = validateCritique(toolUse.input);
  if (!critique) {
    throw new CritiqueUpstreamError('bad_tool_json');
  }

  return {
    critique,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
