/**
 * POST /api/review/critique — initial critique flow: zod validation,
 * the 24-page hard cap (§1: typed error, never silent truncation),
 * server-side entitlement resolution (D4: term-active add-on → weekly
 * window → pack credits → 402), SSRF-guarded page fetch, upstream
 * error mapping, credit consume AFTER success (D6), and the
 * success-only poster_reviews write (D16).
 *
 * Anthropic is mocked at the SDK layer (the importExtract.test.ts
 * pattern); Supabase is a stateful fake serving the users row and
 * recording rpc/insert calls (the billing.test.ts pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import { createReviewRouter } from '../review.js';
import { CURRENT_RUBRIC_VERSION } from '../review/rubric/index.js';
import { REVIEW_MODEL } from '../review/config.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/review-capture.jpg?token=abc`;

const VALID_CRITIQUE = {
  dimensionScores: { narrative: 3, design: 2, content: 4 },
  attentionSummary: 'The eye lands on the decorative photo before the key-result figure.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.3, 0.05, 0.4, 0.25] },
      action: 'cut',
      problem: 'A decorative lab photo hijacks the first fixation.',
      fix: 'Remove the photo so the key-result figure becomes the entry point.',
      example: 'Delete the top-center lab group photo and move Figure 2 into that slot.',
    },
  ],
};

interface FakeSupabaseOpts {
  userRow?: Record<string, unknown> | null;
  consumeResult?: number | null;
  insertedId?: string;
}

function fakeSupabase(opts: FakeSupabaseOpts = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      return {
        select: (_cols?: string) => ({
          eq: (_col: string, _val: unknown) => ({
            single: () =>
              Promise.resolve({
                data: table === 'users' ? (opts.userRow ?? null) : null,
                error: null,
              }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: (_cols?: string) => ({
              single: () =>
                Promise.resolve({ data: { id: opts.insertedId ?? 'review-new-1' }, error: null }),
            }),
          };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({
        data: opts.consumeResult === undefined ? 1 : opts.consumeResult,
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  return { client, inserts, rpcs };
}

function fakeAnthropic(critique: unknown = VALID_CRITIQUE) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input: critique }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 120, output_tokens: 80 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function imageResponse(): Response {
  return new Response(new Uint8Array(1024), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

const PACK_USER = {
  review_credits: 2,
  review_addon: false,
  plan: null,
  plan_expires_at: null,
  subscription_status: null,
};

const ADDON_USER = {
  review_credits: 0,
  review_addon: true,
  plan: 'term',
  plan_expires_at: '2099-01-01T00:00:00.000Z',
  subscription_status: 'active',
};

const BROKE_USER = {
  review_credits: 0,
  review_addon: false,
  plan: null,
  plan_expires_at: null,
  subscription_status: null,
};

function buildApp(deps: {
  supabase: SupabaseClient;
  anthropic?: Anthropic;
  fetchFn: typeof fetch;
  weeklyLimiter?: RequestHandler;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic ?? fakeAnthropic().client,
      fetchFn: deps.fetchFn,
      weeklyLimiter: deps.weeklyLimiter,
    }),
  );
  return app;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: 'pdf',
    pages: [{ pageNumber: 1, url: PAGE_URL, widthPx: 2048, heightPx: 1152 }],
    ...overrides,
  };
}

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/critique — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({ supabase: client, fetchFn: fetchFn as unknown as typeof fetch });
    const res = await request(app).post('/api/review/critique').send(validBody());
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 bad_request', async () => {
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({ supabase: client, fetchFn: fetchFn as unknown as typeof fetch });
    const res = await post(app, { sourceKind: 'pdf', pages: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects more than 24 pages with 400 too_many_pages before any work', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const pages = Array.from({ length: 25 }, (_, i) => ({
      pageNumber: i + 1,
      url: PAGE_URL,
      widthPx: 2048,
      heightPx: 1152,
    }));
    const res = await post(app, validBody({ pages }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_many_pages');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('rejects a page URL on a foreign host with 400 before any fetch', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(
      app,
      validBody({
        pages: [{ pageNumber: 1, url: 'https://evil.example.com/x.png', widthPx: 100, heightPx: 100 }],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('url_not_allowed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/review/critique — entitlement (D4)', () => {
  it('rejects with 402 no_credit before the model call when the user has neither add-on nor credits', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: BROKE_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'review_payment_required', reason: 'no_credit' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('maps a weekly-window rejection to 402 weekly_quota_exceeded with retryAfterSec', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn();
    // Mirrors createRateLimiter's own rejection wire shape; the router
    // invokes it with a capturing response, never the real one.
    const weeklyLimiter: RequestHandler = (_req, res, _next) => {
      res.setHeader('Retry-After', '3600');
      res.status(429).json({ error: 'rate_limited' });
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      error: 'review_payment_required',
      reason: 'weekly_quota_exceeded',
      retryAfterSec: 3600,
    });
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('ignores the add-on when the term is not active (D4 term-active rule)', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({
      userRow: { ...ADDON_USER, plan_expires_at: '2000-01-01T00:00:00.000Z' },
    });
    const fetchFn = vi.fn();
    let weeklyCalls = 0;
    const weeklyLimiter: RequestHandler = (_req, _res, next) => {
      weeklyCalls++;
      next();
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'review_payment_required', reason: 'no_credit' });
    expect(weeklyCalls).toBe(0);
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/review/critique — initial critique', () => {
  it('runs the pack path and consumes the credit AFTER success', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody({ filename: 'poster.pdf' }));

    expect(res.status).toBe(200);
    expect(res.body.reviewId).toBe('review-new-1');
    expect(res.body.stage).toBe('initial');
    expect(res.body.critique.findings).toHaveLength(1);

    expect(rpcs).toEqual([{ fn: 'consume_review_credit', args: { p_user_id: 'user-1' } }]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe('poster_reviews');
    expect(inserts[0]!.payload).toMatchObject({
      user_id: 'user-1',
      source_kind: 'pdf',
      status: 'complete',
      stage: 'initial',
      credit_source: 'pack',
    });
    expect(inserts[0]!.payload.source_meta).toMatchObject({
      pageCount: 1,
      rubric_version: CURRENT_RUBRIC_VERSION,
      model: REVIEW_MODEL,
      input_tokens: 120,
      output_tokens: 80,
      filename: 'poster.pdf',
    });
  });

  it('runs the add-on path through the weekly limiter and never touches credits', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    let weeklyCalls = 0;
    const weeklyLimiter: RequestHandler = (_req, _res, next) => {
      weeklyCalls++;
      next();
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(weeklyCalls).toBe(1);
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.payload.credit_source).toBe('subscription_addon');
  });

  it('maps an invalid model payload to 502 bad_model_output and charges nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic({ dimensionScores: { narrative: 3 }, findings: 'not-an-array' });
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('bad_model_output');
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});
