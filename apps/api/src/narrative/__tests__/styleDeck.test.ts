/**
 * Unit tests for the deck-styling module (Arm P).
 *
 * Covers the three pure pieces the route depends on:
 *   - parseStyleOutput: zod validation of the tool-call arguments,
 *     mapped to bad_tool_json on any mismatch.
 *   - coerceDevices: THE VOCABULARY GATE — any device outside
 *     SUPPORTED_DEVICES becomes 'plain' (graceful degradation), never a
 *     rejected response.
 *   - the OpenAI provider: forced function call over an injected fetch,
 *     reasoning_effort:'none' in the body, error mapping. No real API is
 *     ever hit — fetchFn is a vi.fn().
 */
import { describe, it, expect, vi } from 'vitest';
import {
  StyleUpstreamError,
  createOpenAiStyleProvider,
  parseStyleOutput,
  coerceDevices,
  SUPPORTED_DEVICES,
  type RawStyledSlide,
} from '../styleDeck.js';

function slide(partial: Partial<RawStyledSlide>): RawStyledSlide {
  return {
    role: 'result',
    device: 'plain',
    elements: [{ kind: 'title', text: 'A finding', x: 0.7, y: 1 }],
    ...partial,
  };
}

// ─────────────────────────────────────────────────────────────────────
describe('parseStyleOutput', () => {
  it('parses a valid styled-slides payload', () => {
    const out = parseStyleOutput({
      slides: [
        {
          role: 'result',
          device: 'callout',
          elements: [{ kind: 'title', text: 'x', x: 0.7, y: 1 }],
        },
      ],
    });
    expect(out.slides).toHaveLength(1);
    expect(out.slides[0]!.device).toBe('callout');
  });

  it('accepts elements with the optional fontSize/color/text fields', () => {
    const out = parseStyleOutput({
      slides: [
        {
          role: 'title',
          device: 'stat-emphasis',
          elements: [
            { kind: 'stat', text: '34%', x: 1, y: 2, fontSize: 48, color: '#17252A' },
            { kind: 'accent-dot', x: 0.5, y: 0.5 },
          ],
        },
      ],
    });
    expect(out.slides[0]!.elements).toHaveLength(2);
    expect(out.slides[0]!.elements[0]!.fontSize).toBe(48);
  });

  it('throws StyleUpstreamError(bad_tool_json) on a shape mismatch', () => {
    expect(() =>
      parseStyleOutput({ slides: [{ role: 'result', elements: [] }] }),
    ).toThrow(StyleUpstreamError);
    try {
      parseStyleOutput({ slides: [{ role: 'result', elements: [] }] });
    } catch (err) {
      expect((err as StyleUpstreamError).code).toBe('bad_tool_json');
    }
  });

  it('throws bad_tool_json when slides is missing entirely', () => {
    expect(() => parseStyleOutput({})).toThrow(StyleUpstreamError);
  });

  it('throws bad_tool_json when an element is missing x/y', () => {
    expect(() =>
      parseStyleOutput({
        slides: [
          {
            role: 'result',
            device: 'plain',
            elements: [{ kind: 'title', text: 'x' }],
          },
        ],
      }),
    ).toThrow(StyleUpstreamError);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('coerceDevices — the vocabulary gate', () => {
  it('coerces an unknown device to plain (graceful degradation)', () => {
    const out = coerceDevices({
      slides: [slide({ device: 'holographic-3d' as RawStyledSlide['device'] })],
    });
    expect(out.slides[0]!.device).toBe('plain');
  });

  it('leaves a supported device untouched', () => {
    for (const device of SUPPORTED_DEVICES) {
      const out = coerceDevices({ slides: [slide({ device })] });
      expect(out.slides[0]!.device).toBe(device);
    }
  });

  it('does not mutate its input', () => {
    const input = { slides: [slide({ device: 'nonsense' as RawStyledSlide['device'] })] };
    const snapshot = JSON.parse(JSON.stringify(input));
    coerceDevices(input);
    expect(input).toEqual(snapshot);
  });

  it('coerces per-slide independently across a mixed deck', () => {
    const out = coerceDevices({
      slides: [
        slide({ device: 'callout' }),
        slide({ device: 'bogus-device' as RawStyledSlide['device'] }),
        slide({ device: 'progress-bar' }),
      ],
    });
    expect(out.slides.map((s) => s.device)).toEqual([
      'callout',
      'plain',
      'progress-bar',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('createOpenAiStyleProvider', () => {
  function toolReply(args: unknown): Response {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'style_deck', arguments: JSON.stringify(args) } },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const HAPPY = {
    slides: [
      {
        role: 'title',
        device: 'plain',
        elements: [{ kind: 'title', text: 'Does spacing help recall?', x: 0.72, y: 2 }],
      },
      {
        role: 'result',
        device: 'stat-emphasis',
        elements: [{ kind: 'stat', text: '34%', x: 0.72, y: 3, fontSize: 48 }],
      },
    ],
  };

  it('POSTs a forced function call with reasoning_effort:none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(toolReply(HAPPY));
    const provider = createOpenAiStyleProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const out = await provider.style({
      deck: {
        durationMinutes: 10,
        slides: [
          {
            role: 'title',
            assertion: 'Does spacing help recall?',
            evidence: null,
            sourceQuote: '',
            speakerNotes: [],
            references: [],
            wordCapCut: false,
          },
        ],
      },
    });

    expect(out.slides).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    // The prod-bug guard: forced tools 400 on /chat/completions without this.
    expect(body.reasoning_effort).toBe('none');
    expect(body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'style_deck' },
    });
    // The deck rides into the user message.
    expect(body.messages[1].content).toContain('Does spacing help recall?');
    // The key stays in the header, never the body.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect((init as RequestInit).body).not.toContain('test-key');
  });

  it('maps an upstream non-2xx to http_error with the status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal detail', { status: 500 }));
    const provider = createOpenAiStyleProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.style({
        deck: { durationMinutes: 1, slides: [] },
      }),
    ).rejects.toMatchObject({ code: 'http_error', status: 500 });
  });

  it('maps a reply with no tool call to no_tool_call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'prose' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createOpenAiStyleProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.style({ deck: { durationMinutes: 1, slides: [] } }),
    ).rejects.toMatchObject({ code: 'no_tool_call' });
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
    const provider = createOpenAiStyleProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.style({ deck: { durationMinutes: 1, slides: [] } }),
    ).rejects.toMatchObject({ code: 'bad_tool_json' });
  });

  it('maps an AbortSignal timeout to timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );
    const provider = createOpenAiStyleProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.style({ deck: { durationMinutes: 1, slides: [] } }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});
