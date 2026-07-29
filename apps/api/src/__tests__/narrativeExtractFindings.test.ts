/**
 * /api/narrative/extract-findings — auth, validation, provider-agnostic
 * dispatch, forced-tool-call parsing of the OpenAI reply, the verbatim
 * fidelity gate + contiguous re-ranking, and generic client-facing
 * errors. Mirrors narrativeCondense.test.ts: the OpenAI wire format is
 * mocked at the fetch layer, so no real API is ever hit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNarrativeRouter } from '../narrative.js';
import { createOpenAiExtractionProvider } from '../narrative/extractFindings.js';

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
                  name: 'extract_findings',
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
  // '2mb' })). The default 100kb would 413 the oversized-input test
  // before the zod cap could reject it — a test artifact, not real
  // behaviour, since production accepts up to 2mb.
  app.use(express.json({ limit: '2mb' }));
  app.use(
    createNarrativeRouter({
      getSupabaseAdmin: () => fakeSupabase(),
      getExtractionProviders: () => ({
        openai: createOpenAiExtractionProvider({
          apiKey: 'test-key',
          model: 'test-model',
          fetchFn,
        }),
      }),
    }),
  );
  return app;
}

const RESULTS_TEXT =
  'Spacing raised delayed recall by 34% (p = .002). The effect held ' +
  'across every age band. A secondary analysis found no interaction.';

const VALID_BODY = {
  resultsText: RESULTS_TEXT,
  context: 'A classroom memory study.',
};

// A reply where every quote is verbatim in RESULTS_TEXT.
const FULL_REPLY = {
  findings: [
    {
      text: 'The gain held across ages.',
      sourceQuote: 'The effect held across every age band',
      sourceSection: 'Results',
      rank: 3,
    },
    {
      text: 'Spacing raised recall by 34%.',
      sourceQuote: 'Spacing raised delayed recall by 34%',
      sourceSection: 'Results',
      rank: 1,
    },
  ],
};

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/narrative/extract-findings')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/narrative/extract-findings — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await request(app)
      .post('/api/narrative/extract-findings')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing resultsText', { context: 'x' }],
    ['empty resultsText', { resultsText: '' }],
    ['whitespace-only resultsText', { resultsText: '   \n  ' }],
    ['non-string resultsText', { resultsText: 42 }],
    ['oversized resultsText', { resultsText: 'x'.repeat(200_001) }],
    ['over-long context', { resultsText: RESULTS_TEXT, context: 'x'.repeat(2001) }],
  ])('rejects %s with 400 before any upstream call', async (_label, body) => {
    const fetchFn = vi.fn();
    const app = buildApp(fetchFn as unknown as typeof fetch);
    const res = await post(app, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails with 500 when no extraction provider is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createNarrativeRouter({
        getSupabaseAdmin: () => fakeSupabase(),
        getExtractionProviders: () => ({}),
      }),
    );
    const res = await post(app as ReturnType<typeof buildApp>, VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('provider_not_configured');
  });
});

describe('POST /api/narrative/extract-findings — happy path', () => {
  it('returns findings sorted by rank, contiguously re-ranked from 1', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openAiToolReply(FULL_REPLY));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual([
      {
        text: 'Spacing raised recall by 34%.',
        sourceQuote: 'Spacing raised delayed recall by 34%',
        sourceSection: 'Results',
        rank: 1,
      },
      {
        text: 'The gain held across ages.',
        sourceQuote: 'The effect held across every age band',
        sourceSection: 'Results',
        rank: 2,
      },
    ]);
  });

  it('drops findings whose quote is not verbatim in the text (fidelity gate)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({
        findings: [
          {
            text: 'Real.',
            sourceQuote: 'Spacing raised delayed recall by 34%',
            sourceSection: 'Results',
            rank: 1,
          },
          {
            text: 'Fabricated.',
            sourceQuote: 'a claim never present in the paper',
            sourceSection: 'Results',
            rank: 2,
          },
        ],
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.findings).toHaveLength(1);
    expect(res.body.findings[0].text).toBe('Real.');
    expect(res.body.findings[0].rank).toBe(1);
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
      function: { name: 'extract_findings' },
    });
    expect(sent.messages[1].content).toContain('Spacing raised delayed recall');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });

  it('returns an empty findings array when every quote fails the gate', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      openAiToolReply({
        findings: [
          {
            text: 'Invented.',
            sourceQuote: 'nothing like this appears anywhere',
            sourceSection: 'Results',
            rank: 1,
          },
        ],
      }),
    );
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual([]);
  });
});

describe('POST /api/narrative/extract-findings — provider failures stay generic', () => {
  it('maps an upstream 500 to a generic 502 without leaking provider text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('secret internal provider detail', { status: 500 }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('extract_failed');
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
    expect(res.body.error).toBe('extract_failed');
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
      .mockResolvedValue(openAiToolReply({ findings: [{ text: 'no quote', rank: 1 }] }));
    const app = buildApp(fetchFn as unknown as typeof fetch);

    const res = await post(app, VALID_BODY);
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('bad_tool_json');
  });
});
