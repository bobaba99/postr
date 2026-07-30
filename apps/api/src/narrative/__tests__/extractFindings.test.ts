/**
 * Unit tests for the findings-extraction module.
 *
 * Covers the three pure pieces the route depends on:
 *   - parseExtractionOutput: zod validation of the tool-call arguments,
 *     mapped to bad_tool_json on any mismatch.
 *   - rankAndGate: THE FIDELITY GATE — drops findings whose sourceQuote
 *     is not a verbatim substring of the results text, sorts by rank,
 *     re-ranks contiguously.
 *   - the OpenAI provider: forced function call over an injected fetch,
 *     reasoning_effort:'none' in the body, error mapping. No real API is
 *     ever hit — fetchFn is a vi.fn().
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ExtractUpstreamError,
  createOpenAiExtractionProvider,
  parseExtractionOutput,
  rankAndGate,
  type RawFinding,
} from '../extractFindings.js';

// A results passage the quotes below are (or are not) drawn from.
const RESULTS_TEXT = `
Spacing raised delayed recall by 34% relative to massed practice
(p = .002). The effect held across every age band we tested. A
secondary analysis found no interaction with prior knowledge.
`;

function finding(partial: Partial<RawFinding>): RawFinding {
  return {
    text: 'A finding.',
    sourceQuote: 'Spacing raised delayed recall by 34%',
    sourceSection: 'Results',
    rank: 1,
    ...partial,
  };
}

// ─────────────────────────────────────────────────────────────────────
describe('parseExtractionOutput', () => {
  it('accepts a well-formed findings payload', () => {
    const out = parseExtractionOutput({
      findings: [
        {
          text: 'Spacing raised recall by 34%.',
          sourceQuote: 'Spacing raised delayed recall by 34%',
          sourceSection: 'Results',
          rank: 1,
        },
      ],
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.rank).toBe(1);
  });

  it('throws ExtractUpstreamError(bad_tool_json) on a shape mismatch', () => {
    expect(() =>
      parseExtractionOutput({ findings: [{ text: 'no quote', rank: 1 }] }),
    ).toThrow(ExtractUpstreamError);
    try {
      parseExtractionOutput({ findings: [{ text: 'no quote', rank: 1 }] });
    } catch (err) {
      expect((err as ExtractUpstreamError).code).toBe('bad_tool_json');
    }
  });

  it('throws bad_tool_json when findings is missing entirely', () => {
    expect(() => parseExtractionOutput({})).toThrow(ExtractUpstreamError);
  });

  it('throws bad_tool_json when rank is not an integer', () => {
    expect(() =>
      parseExtractionOutput({
        findings: [
          {
            text: 'x',
            sourceQuote: 'Spacing raised delayed recall by 34%',
            sourceSection: 'Results',
            rank: 1.5,
          },
        ],
      }),
    ).toThrow(ExtractUpstreamError);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('rankAndGate — the fidelity gate', () => {
  it('keeps findings whose sourceQuote is a verbatim substring', () => {
    const kept = rankAndGate(
      [finding({ sourceQuote: 'The effect held across every age band', rank: 1 })],
      RESULTS_TEXT,
    );
    expect(kept).toHaveLength(1);
  });

  it('drops a finding whose sourceQuote is NOT in the results text', () => {
    const kept = rankAndGate(
      [
        finding({ sourceQuote: 'Spacing raised delayed recall by 34%', rank: 1 }),
        finding({ text: 'Invented.', sourceQuote: 'a claim never written', rank: 2 }),
      ],
      RESULTS_TEXT,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.text).not.toBe('Invented.');
  });

  it('matches despite whitespace/newline differences (normalized)', () => {
    // The quote spans a line break in the source but arrives on one line.
    const kept = rankAndGate(
      [finding({ sourceQuote: 'The effect held across every age band we tested.', rank: 1 })],
      RESULTS_TEXT,
    );
    expect(kept).toHaveLength(1);
  });

  it('sorts by rank ascending and re-ranks contiguously from 1', () => {
    const kept = rankAndGate(
      [
        finding({ text: 'third', sourceQuote: 'no interaction with prior knowledge', rank: 9 }),
        finding({ text: 'first', sourceQuote: 'Spacing raised delayed recall by 34%', rank: 2 }),
        finding({ text: 'second', sourceQuote: 'held across every age band', rank: 5 }),
      ],
      RESULTS_TEXT,
    );
    expect(kept.map((f) => f.text)).toEqual(['first', 'second', 'third']);
    expect(kept.map((f) => f.rank)).toEqual([1, 2, 3]);
  });

  it('re-ranks contiguously even after gating drops a middle finding', () => {
    const kept = rankAndGate(
      [
        finding({ text: 'keep-a', sourceQuote: 'Spacing raised delayed recall by 34%', rank: 1 }),
        finding({ text: 'drop', sourceQuote: 'not present at all', rank: 2 }),
        finding({ text: 'keep-b', sourceQuote: 'held across every age band', rank: 3 }),
      ],
      RESULTS_TEXT,
    );
    expect(kept.map((f) => f.text)).toEqual(['keep-a', 'keep-b']);
    expect(kept.map((f) => f.rank)).toEqual([1, 2]);
  });

  it('returns an empty array when every quote fails the gate', () => {
    const kept = rankAndGate(
      [finding({ sourceQuote: 'entirely fabricated', rank: 1 })],
      RESULTS_TEXT,
    );
    expect(kept).toEqual([]);
  });

  it('does not mutate its input array', () => {
    const input = [
      finding({ text: 'b', sourceQuote: 'held across every age band', rank: 5 }),
      finding({ text: 'a', sourceQuote: 'Spacing raised delayed recall by 34%', rank: 1 }),
    ];
    const snapshot = input.map((f) => ({ ...f }));
    rankAndGate(input, RESULTS_TEXT);
    expect(input).toEqual(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('createOpenAiExtractionProvider', () => {
  function toolReply(args: unknown): Response {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'extract_findings', arguments: JSON.stringify(args) } },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const HAPPY = {
    findings: [
      {
        text: 'Spacing raised recall by 34%.',
        sourceQuote: 'Spacing raised delayed recall by 34%',
        sourceSection: 'Results',
        rank: 1,
      },
    ],
  };

  it('POSTs a forced function call with reasoning_effort:none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(toolReply(HAPPY));
    const provider = createOpenAiExtractionProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const out = await provider.extract({ resultsText: RESULTS_TEXT });

    expect(out.findings).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    // The prod-bug guard: forced tools 400 on /chat/completions without this.
    expect(body.reasoning_effort).toBe('none');
    expect(body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'extract_findings' },
    });
    // The results text rides into the user message.
    expect(body.messages[1].content).toContain('Spacing raised delayed recall');
    // The key stays in the header, never the body.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect((init as RequestInit).body).not.toContain('test-key');
  });

  it('passes optional context into the user message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(toolReply(HAPPY));
    const provider = createOpenAiExtractionProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await provider.extract({ resultsText: RESULTS_TEXT, context: 'A memory study.' });
    const body = JSON.parse(
      (fetchFn.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.messages[1].content).toContain('A memory study.');
  });

  it('maps an upstream non-2xx to http_error with the status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal detail', { status: 500 }));
    const provider = createOpenAiExtractionProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.extract({ resultsText: RESULTS_TEXT })).rejects.toMatchObject({
      code: 'http_error',
      status: 500,
    });
  });

  it('maps a reply with no tool call to no_tool_call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'prose' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createOpenAiExtractionProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.extract({ resultsText: RESULTS_TEXT })).rejects.toMatchObject({
      code: 'no_tool_call',
    });
  });

  it('maps invalid JSON tool arguments to bad_tool_json', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [{ function: { arguments: '{ not json' } }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createOpenAiExtractionProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.extract({ resultsText: RESULTS_TEXT })).rejects.toMatchObject({
      code: 'bad_tool_json',
    });
  });

  it('maps an AbortSignal timeout to timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );
    const provider = createOpenAiExtractionProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.extract({ resultsText: RESULTS_TEXT })).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});
