/**
 * /api/narrative/style-deck — auth, validation, provider-agnostic
 * dispatch, forced-tool-call parsing of the OpenAI reply, the device
 * vocabulary gate, and generic client-facing errors. Mirrors
 * narrativeExtractFindings.test.ts: the OpenAI wire format is mocked at
 * the fetch layer, so no real API is ever hit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNarrativeRouter } from '../narrative.js';
import { createOpenAiStyleProvider } from '../narrative/styleDeck.js';

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
                  name: 'style_deck',
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
      getStyleProviders: () => ({
        openai: createOpenAiStyleProvider({
          apiKey: 'test-key',
          model: 'test-model',
          fetchFn,
        }),
      }),
    }),
  );
  return app;
}

const VALID_BODY = {
  deck: {
    durationMinutes: 10,
    slides: [
      {
        role: 'title',
        assertion: 'Spacing improves delayed recall.',
        evidence: null,
        sourceQuote: '',
        speakerNotes: [],
        references: [],
        wordCapCut: false,
      },
      {
        role: 'result',
        assertion: 'Spacing raised recall by 34%.',
        evidence: 'p = .002',
        sourceQuote: 'Spacing raised delayed recall by 34%',
        speakerNotes: [{ text: 'Emphasize the effect size.', provenance: 'author' }],
        references: [],
        wordCapCut: false,
      },
    ],
  },
};

const FULL_REPLY = {
  slides: [
    {
      role: 'title',
      device: 'plain',
      elements: [{ kind: 'title', text: 'Spacing improves delayed recall.', x: 0.72, y: 2 }],
    },
    {
      role: 'result',
      device: 'stat-emphasis',
      elements: [{ kind: 'stat', text: '34%', x: 0.72, y: 3, fontSize: 48 }],
    },
  ],
};

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/narrative/style-deck')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/narrative/style-deck — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await request(app).post('/api/narrative/style-deck').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing deck', {}],
    ['empty slides array', { deck: { slides: [], durationMinutes: 10 } }],
    [
      'missing durationMinutes',
      { deck: { slides: VALID_BODY.deck.slides } },
    ],
    [
      'slide missing assertion',
      {
        deck: {
          durationMinutes: 10,
          slides: [
            {
              role: 'title',
              evidence: null,
              sourceQuote: '',
              speakerNotes: [],
              references: [],
              wordCapCut: false,
            },
          ],
        },
      },
    ],
    [
      'non-boolean wordCapCut',
      {
        deck: {
          durationMinutes: 10,
          slides: [
            {
              role: 'title',
              assertion: 'x',
              evidence: null,
              sourceQuote: '',
              speakerNotes: [],
              references: [],
              wordCapCut: 'nope',
            },
          ],
        },
      },
    ],
  ])('rejects %s with 400 before any upstream call', async (_label, body) => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, body as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails with 500 when no style provider is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createNarrativeRouter({
        getSupabaseAdmin: () => fakeSupabase(),
        getStyleProviders: () => ({}),
      }),
    );
    const res = await post(app as ReturnType<typeof buildApp>, VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('provider_not_configured');
  });
});

describe('POST /api/narrative/style-deck — happy path', () => {
  it('returns styled slides with devices from the vocabulary', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.slides).toEqual(FULL_REPLY.slides);
  });

  it('coerces an out-of-vocabulary device to plain (graceful degradation)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({
        slides: [
          {
            role: 'result',
            device: 'holographic-3d',
            elements: [{ kind: 'title', text: 'x', x: 0.7, y: 1 }],
          },
        ],
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.slides[0].device).toBe('plain');
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
      function: { name: 'style_deck' },
    });
    expect(sent.messages[1].content).toContain('Spacing raised delayed recall');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });
});

describe('POST /api/narrative/style-deck — provider failures stay generic', () => {
  it('maps an upstream 500 to a generic 502 without leaking provider text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal provider detail', { status: 500 }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('style_failed');
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
    expect(res.body.error).toBe('style_failed');
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
      .mockResolvedValue(openAiToolReply({ slides: [{ role: 'result', elements: [] }] }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('bad_tool_json');
  });
});
