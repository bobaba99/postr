/**
 * review/critique.ts — the Anthropic adapter contract. The SDK is mocked
 * at the layer (importExtract.test.ts:32-46 pattern): a `{ messages:
 * { create } }` plain object cast to Anthropic — no vi.mock, no network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { APIConnectionTimeoutError } from '@anthropic-ai/sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type { CritiqueResult } from '@postr/shared';
import {
  callAnthropicCritique,
  CritiqueUpstreamError,
  type CritiqueCallCtx,
} from '../review/critique.js';
import { REVIEW_MODEL, REVIEW_MAX_TOKENS, REVIEW_TIMEOUT_MS } from '../review/config.js';

const VALID_CRITIQUE: CritiqueResult = {
  dimensionScores: { narrative: 4, design: 2, content: 3 },
  attentionSummary: 'The eye lands on the decorative header band first.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'over-emphasis',
      anchor: { kind: 'block', blockId: 'blk_intro' },
      action: 'cut',
      problem: 'Nine bolded phrases compete across the intro column.',
      fix: 'Keep bold on the one result phrase; unbold the rest.',
      example: 'Keep "87% recovery at 6 weeks" bold; unbold "novel", "first", "robust".',
    },
  ],
};

const CTX: CritiqueCallCtx = {
  systemPrompt: 'SYS',
  userMessage: 'Produce the two-stage critique now.',
  pages: [
    { mediaType: 'image/png', imageData: 'QUJD' },
    { mediaType: 'image/jpeg', imageData: 'REVG' },
  ],
};

function fakeAnthropic(create: ReturnType<typeof vi.fn>) {
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function createReturningToolUse(input: unknown) {
  return vi.fn().mockResolvedValue({
    content: [
      { type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1234, output_tokens: 567 },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callAnthropicCritique — success', () => {
  it('returns the validated critique + token usage', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    const out = await callAnthropicCritique(anthropic.client, CTX);
    expect(out.critique).toEqual(VALID_CRITIQUE);
    expect(out.usage).toEqual({ inputTokens: 1234, outputTokens: 567 });
  });

  it('forces the emit_critique tool with the config model + token cap', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    expect(anthropic.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: REVIEW_MODEL,
        max_tokens: REVIEW_MAX_TOKENS,
        system: 'SYS',
        tool_choice: { type: 'tool', name: 'emit_critique' },
      }),
      // Bounded provider work: an explicit per-call deadline, and no SDK
      // retries multiplying the per-review bill.
      { timeout: REVIEW_TIMEOUT_MS, maxRetries: 0 },
    );
  });

  it('sends pages as image blocks, then the user message as the text closer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    const content =
      anthropic.create.mock.calls[0]![0].messages[0].content;
    expect(content).toHaveLength(3);
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
    });
    expect(content[1]).toMatchObject({
      type: 'image',
      source: { media_type: 'image/jpeg', data: 'REVG' },
    });
    expect(content[2]).toEqual({
      type: 'text',
      text: 'Produce the two-stage critique now.',
    });
  });

  it('logs token usage with the [review.critique] tag', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    expect(log).toHaveBeenCalledWith(
      '[review.critique] anthropic done',
      expect.objectContaining({
        stopReason: 'tool_use',
        inputTokens: 1234,
        outputTokens: 567,
      }),
    );
  });
});

describe('callAnthropicCritique — failure mapping', () => {
  it('no tool_use in the response → no_tool_call', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'here is my critique' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({
      name: 'CritiqueUpstreamError',
      code: 'no_tool_call',
    });
  });

  it('contract-violating tool payload → bad_tool_json', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(VALID_CRITIQUE));
    delete broken.findings[0].example;
    const anthropic = fakeAnthropic(createReturningToolUse(broken));
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'bad_tool_json' });
  });

  it('a tool_use block for a DIFFERENT tool → no_tool_call (matched by name, not first-found)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_test',
          name: 'wrong_tool',
          input: VALID_CRITIQUE,
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'no_tool_call' });
  });

  it('SDK http error → http_error with the upstream status', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('rate limited'), { status: 429 }),
      );
    const anthropic = fakeAnthropic(create);
    const err = await callAnthropicCritique(anthropic.client, CTX).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(CritiqueUpstreamError);
    expect(err).toMatchObject({ code: 'http_error', status: 429 });
  });

  it('SDK timeout → timeout', async () => {
    const timeoutErr = new Error('request timed out');
    timeoutErr.name = 'APIConnectionTimeoutError';
    const create = vi.fn().mockRejectedValue(timeoutErr);
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('real SDK APIConnectionTimeoutError instance → timeout (instanceof, not just the name)', async () => {
    const timeoutError = new APIConnectionTimeoutError({
      message: 'request timed out',
    });
    const create = vi.fn().mockRejectedValue(timeoutError);
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('non-SDK errors propagate untouched', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toThrow('boom');
  });
});
