/**
 * /api/narrative/theme — auth, validation, provider-agnostic dispatch,
 * forced-tool-call parsing of the OpenAI reply, and generic client-facing
 * errors. Mirrors narrativeStyleDeck.test.ts: the OpenAI wire format is
 * mocked at the fetch layer, so no real API is ever hit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNarrativeRouter } from '../narrative.js';
import { createOpenAiThemeProvider } from '../narrative/themeGen.js';

function fakeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: true } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
}

function openAiToolReply(args: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'generate_theme',
                  arguments: JSON.stringify(args),
                },
              },
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function buildApp(fetchFn: typeof fetch) {
  const app = express();
  // Mirror the production body limit (app.ts uses express.json({ limit:
  // '2mb' })).
  app.use(express.json({ limit: '2mb' }));
  app.use(
    createNarrativeRouter({
      getSupabaseAdmin: () => fakeSupabase(),
      getThemeProviders: () => ({
        openai: createOpenAiThemeProvider({
          apiKey: 'test-key',
          model: 'test-model',
          fetchFn,
        }),
      }),
    }),
  );
  return app;
}

const VALID_BODY = { topic: 'gut microbiome and obesity' };

const FULL_REPLY = {
  theme: {
    palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
    typeScale: { heading: 30, body: 18, label: 13 },
    accentTreatment: 'Use muted slate blue as the primary structural accent.',
    rationale: 'A restrained palette suited to a biomedical audience.',
  },
  palettes: [
    ['#F7F8FA', '#1F2933', '#3E5C76'],
    ['#FDF6EC', '#2B2118', '#8A5A34'],
    ['#F2F7F5', '#16302B', '#3E7C6B'],
    ['#F5F5F7', '#1D1D1F', '#5E5CE6'],
  ],
};

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/narrative/theme')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/narrative/theme — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/narrative/theme').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing topic', {}],
    ['empty topic', { topic: '' }],
    ['non-string topic', { topic: 42 }],
    ['vibe over 2000 chars', { topic: 'x', vibe: 'a'.repeat(2001) }],
  ])('rejects %s with 400 before any upstream call', async (_label, body) => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, body as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails with 500 when no theme provider is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createNarrativeRouter({
        getSupabaseAdmin: () => fakeSupabase(),
        getThemeProviders: () => ({}),
      }),
    );
    const res = await post(app as ReturnType<typeof buildApp>, VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('provider_not_configured');
  });
});

describe('POST /api/narrative/theme — happy path', () => {
  it('returns a theme and 4 palette variations', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.theme).toEqual(FULL_REPLY.theme);
    expect(res.body.palettes).toHaveLength(4);
  });

  it('accepts an optional vibe and forwards it to the provider', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, { topic: 'gut microbiome and obesity', vibe: 'bold and playful' });

    expect(res.status).toBe(200);
    const [, init] = fetchFn.mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.messages[1].content).toContain('bold and playful');
  });

  it('sends a forced function call with reasoning_effort:none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    await post(app, VALID_BODY);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe('test-model');
    expect(sent.reasoning_effort).toBe('none');
    expect(sent.tool_choice).toEqual({
      type: 'function',
      function: { name: 'generate_theme' },
    });
    expect(sent.messages[1].content).toContain('gut microbiome and obesity');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });
});

describe('POST /api/narrative/theme — provider failures stay generic', () => {
  it('maps an upstream 500 to a generic 502 without leaking provider text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal provider detail', { status: 500 }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('theme_failed');
    expect(JSON.stringify(res.body)).not.toContain('secret internal');
  });

  it('passes through a 429 so the client can back off', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('theme_failed');
  });

  it('maps a reply with no tool call to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'prose' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('no_tool_call');
  });

  it('maps a malformed tool payload to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValue(openAiToolReply({ theme: { palette: ['#FFF', '#000'] } }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('bad_tool_json');
  });

  it('maps a reply with only 3 palette variations to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({ theme: FULL_REPLY.theme, palettes: FULL_REPLY.palettes.slice(0, 3) }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('bad_tool_json');
  });
});
