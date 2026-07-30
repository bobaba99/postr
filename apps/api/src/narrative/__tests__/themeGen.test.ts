/**
 * Unit tests for the theme-generation module (Arm T).
 *
 * Covers the pure pieces the route depends on:
 *   - parseThemeOutput: zod validation of the tool-call arguments
 *     (a theme with a >=3-color palette + typeScale, plus 4 palette
 *     variations), mapped to bad_tool_json on any mismatch.
 *   - the palettes-length-4 guard: exactly 4 palette variations, no
 *     more, no fewer — a provider failure, not something to paper over.
 *   - the OpenAI provider: forced function call over an injected fetch,
 *     reasoning_effort:'none' in the body, error mapping. No real API is
 *     ever hit — fetchFn is a vi.fn().
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ThemeUpstreamError,
  createOpenAiThemeProvider,
  parseThemeOutput,
} from '../themeGen.js';

const VALID_THEME = {
  palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
  typeScale: { heading: 30, body: 18, label: 13 },
  accentTreatment: 'Use muted slate blue as the primary structural accent.',
  rationale: 'This restrained palette supports a calm, legible deck.',
};

const FOUR_PALETTES = [
  ['#F7F8FA', '#1F2933', '#3E5C76'],
  ['#FDF6EC', '#2B2118', '#8A5A34'],
  ['#F2F7F5', '#16302B', '#3E7C6B'],
  ['#F5F5F7', '#1D1D1F', '#5E5CE6'],
];

// ─────────────────────────────────────────────────────────────────────
describe('parseThemeOutput', () => {
  it('parses a valid theme + 4 palette variations', () => {
    const out = parseThemeOutput({ theme: VALID_THEME, palettes: FOUR_PALETTES });
    expect(out.theme.palette).toHaveLength(6);
    expect(out.theme.typeScale).toEqual({ heading: 30, body: 18, label: 13 });
    expect(out.palettes).toHaveLength(4);
  });

  it('throws ThemeUpstreamError(bad_tool_json) when the palette has fewer than 3 colors', () => {
    expect(() =>
      parseThemeOutput({
        theme: { ...VALID_THEME, palette: ['#FFFFFF', '#000000'] },
        palettes: FOUR_PALETTES,
      }),
    ).toThrow(ThemeUpstreamError);
    try {
      parseThemeOutput({
        theme: { ...VALID_THEME, palette: ['#FFFFFF', '#000000'] },
        palettes: FOUR_PALETTES,
      });
    } catch (err) {
      expect((err as ThemeUpstreamError).code).toBe('bad_tool_json');
    }
  });

  it('throws bad_tool_json when typeScale is missing a field', () => {
    const badTheme = { ...VALID_THEME, typeScale: { heading: 30, body: 18 } };
    expect(() =>
      parseThemeOutput({ theme: badTheme, palettes: FOUR_PALETTES }),
    ).toThrow(ThemeUpstreamError);
  });

  it('throws bad_tool_json when theme is missing entirely', () => {
    expect(() => parseThemeOutput({ palettes: FOUR_PALETTES })).toThrow(
      ThemeUpstreamError,
    );
  });

  it('throws bad_tool_json when palettes is not an array of arrays', () => {
    expect(() =>
      parseThemeOutput({ theme: VALID_THEME, palettes: ['#FFFFFF', '#000000'] }),
    ).toThrow(ThemeUpstreamError);
  });

  it('throws bad_tool_json when a palette variation has fewer than 3 colors', () => {
    expect(() =>
      parseThemeOutput({
        theme: VALID_THEME,
        palettes: [...FOUR_PALETTES.slice(0, 3), ['#FFFFFF', '#000000']],
      }),
    ).toThrow(ThemeUpstreamError);
  });

  // THE PALETTES-LENGTH-4 GUARD. Not 3, not 5 — exactly 4 variations for
  // the palette slide + re-vibe UI, which expects a fixed grid.
  it('throws bad_tool_json when palettes has fewer than 4 entries', () => {
    expect(() =>
      parseThemeOutput({ theme: VALID_THEME, palettes: FOUR_PALETTES.slice(0, 3) }),
    ).toThrow(ThemeUpstreamError);
    try {
      parseThemeOutput({ theme: VALID_THEME, palettes: FOUR_PALETTES.slice(0, 3) });
    } catch (err) {
      expect((err as ThemeUpstreamError).code).toBe('bad_tool_json');
    }
  });

  it('throws bad_tool_json when palettes has more than 4 entries', () => {
    expect(() =>
      parseThemeOutput({
        theme: VALID_THEME,
        palettes: [...FOUR_PALETTES, ['#111111', '#222222', '#333333']],
      }),
    ).toThrow(ThemeUpstreamError);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('createOpenAiThemeProvider', () => {
  function toolReply(args: unknown): Response {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'generate_theme', arguments: JSON.stringify(args) } },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const HAPPY = { theme: VALID_THEME, palettes: FOUR_PALETTES };

  it('POSTs a forced function call with reasoning_effort:none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(toolReply(HAPPY));
    const provider = createOpenAiThemeProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const out = await provider.generateTheme({ topic: 'gut microbiome and obesity' });

    expect(out.theme.palette).toHaveLength(6);
    expect(out.palettes).toHaveLength(4);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    // The prod-bug guard: forced tools 400 on /chat/completions without this.
    expect(body.reasoning_effort).toBe('none');
    expect(body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'generate_theme' },
    });
    // The topic rides into the user message.
    expect(body.messages[1].content).toContain('gut microbiome and obesity');
    // The key stays in the header, never the body.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect((init as RequestInit).body).not.toContain('test-key');
  });

  it('includes the vibe in the user message when present', async () => {
    const fetchFn = vi.fn().mockResolvedValue(toolReply(HAPPY));
    const provider = createOpenAiThemeProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await provider.generateTheme({ topic: 'gut microbiome and obesity', vibe: 'bold and playful' });

    const [, init] = fetchFn.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[1].content).toContain('bold and playful');
  });

  it('maps an upstream non-2xx to http_error with the status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal detail', { status: 500 }));
    const provider = createOpenAiThemeProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.generateTheme({ topic: 'x' }),
    ).rejects.toMatchObject({ code: 'http_error', status: 500 });
  });

  it('maps a reply with no tool call to no_tool_call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'prose' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createOpenAiThemeProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.generateTheme({ topic: 'x' }),
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
    const provider = createOpenAiThemeProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.generateTheme({ topic: 'x' }),
    ).rejects.toMatchObject({ code: 'bad_tool_json' });
  });

  it('maps an AbortSignal timeout to timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );
    const provider = createOpenAiThemeProvider({
      apiKey: 'k',
      model: 'm',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      provider.generateTheme({ topic: 'x' }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});
