/**
 * /api/narrative/condense — auth, validation, provider-agnostic
 * dispatch, forced-tool-call parsing of the OpenAI reply, deterministic
 * budget enforcement, and generic client-facing errors. The OpenAI
 * wire format is mocked at the fetch layer, exactly like the import
 * router's tests mock Anthropic at the SDK layer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNarrativeRouter } from '../narrative.js';
import { createOpenAiProvider } from '../narrative/condense.js';

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
              { function: { name: 'emit_narrative', arguments: JSON.stringify(args) } },
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
  app.use(express.json());
  app.use(
    createNarrativeRouter({
      getSupabaseAdmin: () => fakeSupabase(),
      getProviders: () => ({
        openai: createOpenAiProvider({
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
  roles: [
    { role: 'question', budgetWords: 60, sourceText: 'We asked whether X.' },
    { role: 'takeaway', budgetWords: 60, sourceText: 'X matters.' },
  ],
  pinned: [
    {
      id: 'sec12345',
      heading: 'Limitations',
      budgetWords: 60,
      sourceText: 'Single-site sample.',
    },
  ],
  emphasis: {
    takeaway: 'X changes everything.',
    audience: 'general',
    purpose: 'feedback',
    rankedFindings: ['X increased Y by 12% (p = .01).'],
  },
};

const FULL_REPLY = {
  roles: [
    { role: 'question', text: 'Does X change Y?' },
    { role: 'takeaway', text: 'X matters for Y.' },
  ],
  pinned: [{ id: 'sec12345', text: 'Sample was single-site.' }],
};

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/narrative/condense')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/narrative/condense — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await request(app)
      .post('/api/narrative/condense')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['empty roles', { ...VALID_BODY, roles: [] }],
    [
      'unknown role',
      {
        ...VALID_BODY,
        roles: [{ role: 'summary', budgetWords: 40, sourceText: 'x' }],
      },
    ],
    [
      'duplicate roles',
      {
        ...VALID_BODY,
        roles: [
          { role: 'takeaway', budgetWords: 60, sourceText: 'a' },
          { role: 'takeaway', budgetWords: 60, sourceText: 'b' },
        ],
      },
    ],
    [
      'budget over cap',
      {
        ...VALID_BODY,
        roles: [{ role: 'takeaway', budgetWords: 5000, sourceText: 'a' }],
      },
    ],
    [
      'oversized source text',
      {
        ...VALID_BODY,
        roles: [
          { role: 'takeaway', budgetWords: 60, sourceText: 'x'.repeat(20_001) },
        ],
      },
    ],
    [
      'malicious pinned id',
      {
        ...VALID_BODY,
        pinned: [
          {
            id: '../../etc',
            heading: 'X',
            budgetWords: 60,
            sourceText: 'y',
          },
        ],
      },
    ],
    ['bad audience', { ...VALID_BODY, emphasis: { ...VALID_BODY.emphasis, audience: 'everyone' } }],
    ['bad purpose', { ...VALID_BODY, emphasis: { ...VALID_BODY.emphasis, purpose: 'vibes' } }],
    // The retired values must not linger as accepted input.
    ['retired audience', { ...VALID_BODY, emphasis: { ...VALID_BODY.emphasis, audience: 'adjacent' } }],
    [
      'over-long custom audience',
      {
        ...VALID_BODY,
        emphasis: {
          ...VALID_BODY.emphasis,
          audience: 'custom',
          audienceCustom: 'x'.repeat(201),
        },
      },
    ],
  ])('rejects %s with 400 before any upstream call', async (_label, body) => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // The wire schema, the shared union, and prompt.ts's description maps
  // must agree. A value the questionnaire can produce but the schema
  // rejects is a 400 on a perfectly good answer — so every option the
  // user can pick is asserted to get through.
  it.each([
    'specialists',
    'general',
    'clinicians',
    'public',
    'adolescents',
    'children',
    'undergraduates',
    'policymakers',
    'industry',
  ])('accepts the %s audience', async (audience) => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, {
      ...VALID_BODY,
      emphasis: { ...VALID_BODY.emphasis, audience },
    });
    expect(res.status).toBe(200);
  });

  it.each([
    'requirement',
    'one-time',
    'committee',
    'lab-meeting',
    'feedback',
    'collaborators',
    'job-market',
  ])('accepts the %s purpose', async (purpose) => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, {
      ...VALID_BODY,
      emphasis: { ...VALID_BODY.emphasis, purpose },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a custom audience with its free text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, {
      ...VALID_BODY,
      emphasis: {
        ...VALID_BODY.emphasis,
        audience: 'custom',
        audienceCustom: 'museum curators',
      },
    });
    expect(res.status).toBe(200);
    // And the words reach the upstream prompt verbatim.
    const body = JSON.parse(
      (fetchFn.mock.calls[0]![1] as { body: string }).body,
    );
    expect(JSON.stringify(body)).toContain('museum curators');
  });

  it('fails with 500 when no provider is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createNarrativeRouter({
        getSupabaseAdmin: () => fakeSupabase(),
        getProviders: () => ({}),
      }),
    );
    const res = await post(app as ReturnType<typeof buildApp>, VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('provider_not_configured');
  });
});

describe('POST /api/narrative/condense — happy path', () => {
  it('returns per-panel text with budgets already enforced', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual([
      { role: 'question', text: 'Does X change Y?', truncated: false },
      { role: 'takeaway', text: 'X matters for Y.', truncated: false },
    ]);
    expect(res.body.pinned).toEqual([
      {
        id: 'sec12345',
        heading: 'Limitations',
        text: 'Sample was single-site.',
        truncated: false,
      },
    ]);
  });

  it('sends a forced function call to the OpenAI endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    await post(app, VALID_BODY);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe('test-model');
    expect(sent.tool_choice).toEqual({
      type: 'function',
      function: { name: 'emit_narrative' },
    });
    // Budgets ride into the prompt as data.
    expect(sent.messages[1].content).toContain('budget=60 words');
    // The user's stated takeaway is forwarded verbatim.
    expect(sent.messages[1].content).toContain('X changes everything.');
    // The API key stays in the Authorization header, not the body.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });

  it('hard-truncates an over-budget reply and reports it', async () => {
    const longText = Array(100).fill('word').join(' ');
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({
        roles: [
          { role: 'question', text: 'Does X change Y?' },
          { role: 'takeaway', text: longText },
        ],
        pinned: [{ id: 'sec12345', text: 'ok.' }],
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    const takeaway = res.body.roles.find(
      (r: { role: string }) => r.role === 'takeaway',
    );
    expect(takeaway.truncated).toBe(true);
    expect(takeaway.text.split(/\s+/).length).toBeLessThanOrEqual(60);
  });
});

describe('POST /api/narrative/condense — provider failures stay generic', () => {
  it('maps an upstream 500 to a generic 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('secret internal provider detail', { status: 500 }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('condense_failed');
    // Raw provider text must never reach the client.
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
    expect(res.body.error).toBe('condense_failed');
  });

  it('rejects a reply missing a requested panel with 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({
        roles: [{ role: 'question', text: 'Only one panel.' }],
        pinned: [],
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('incomplete_reply');
  });

  it('rejects a reply with no tool call with 502', async () => {
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
});
