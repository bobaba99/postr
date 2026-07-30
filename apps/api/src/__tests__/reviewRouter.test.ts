/**
 * POST /api/review/critique — initial critique flow: zod validation,
 * the 24-page hard cap (§1: typed error, never silent truncation),
 * server-side entitlement resolution (D4: term-active add-on → weekly
 * window → pack credits → 402), SSRF-guarded page fetch, upstream
 * error mapping, and transactional credit spend + success-only
 * poster_reviews insert AFTER success (D6/D16).
 *
 * Anthropic is mocked at the SDK layer (the importExtract.test.ts
 * pattern); Supabase is a stateful fake serving the users row and
 * recording RPC finalization calls (the billing.test.ts pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';
import { CURRENT_RUBRIC_VERSION } from '../review/rubric/index.js';
import { REVIEW_ADDON_WEEKLY_QUOTA, REVIEW_MODEL } from '../review/config.js';

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
  removeError?: boolean;
  addonSlotResult?: {
    data: unknown;
    error: { message: string } | null;
  };
  addonSlotThrows?: boolean;
  claimResult?: unknown;
  claimThrows?: boolean;
  entitlementThrows?: boolean;
  finalizeThrows?: boolean;
}

function fakeSupabase(opts: FakeSupabaseOpts = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const remove = vi.fn(async (_paths: string[]) => ({
    data: [],
    error: opts.removeError ? { message: 'cleanup failed' } : null,
  }));
  const createSignedUrl = vi.fn(async (path: string, _ttlSec: number) => ({
    data: {
      signedUrl:
        `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/${path}?token=refreshed`,
    },
    error: null,
  }));
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
              opts.entitlementThrows && table === 'users'
                ? Promise.reject(new Error('entitlement lookup crashed'))
                : Promise.resolve({
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
      if (fn === 'claim_initial_review') {
        if (opts.claimThrows) {
          return Promise.reject(new Error('claim rpc crashed'));
        }
        return Promise.resolve({
          data:
            opts.claimResult ??
            {
              outcome: 'claimed',
              claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              expiresAt: '2099-01-01T00:10:00.000Z',
            },
          error: null,
        });
      }
      if (fn === 'consume_review_addon_slot') {
        if (opts.addonSlotThrows) {
          return Promise.reject(new Error('quota rpc crashed'));
        }
        return Promise.resolve(
          opts.addonSlotResult ?? { data: { allowed: true }, error: null },
        );
      }
      if (fn === 'release_initial_review') {
        return Promise.resolve({ data: true, error: null });
      }
      if (fn === 'reserve_initial_review_credit') {
        return Promise.resolve({
          data: opts.consumeResult !== null,
          error: null,
        });
      }
      if (fn === 'finalize_initial_review') {
        if (opts.finalizeThrows) {
          return Promise.reject(new Error('finalize rpc crashed'));
        }
        if (
          args.p_credit_source === 'pack' &&
          opts.consumeResult === null
        ) {
          return Promise.resolve({
            data: { outcome: 'no_credit' },
            error: null,
          });
        }
        inserts.push({
          table: 'poster_reviews',
          payload: {
            user_id: args.p_user_id,
            request_key: args.p_request_key,
            poster_id: args.p_poster_id,
            source_kind: args.p_source_kind,
            source_meta: args.p_source_meta,
            status: 'complete',
            stage: 'initial',
            initial_findings: args.p_initial_findings,
            credit_source: args.p_credit_source,
          },
        });
        return Promise.resolve({
          data: {
            outcome: 'complete',
            reviewId: opts.insertedId ?? 'review-new-1',
            stage: 'initial',
            critique: args.p_initial_findings,
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { message: `unexpected rpc ${fn}` },
      });
    },
    storage: {
      from: (_bucket: string) => ({ remove, createSignedUrl }),
    },
  } as unknown as SupabaseClient;
  return { client, inserts, rpcs, remove, createSignedUrl };
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
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic ?? fakeAnthropic().client,
      fetchFn: deps.fetchFn,
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
    const { client, rpcs, inserts, remove } = fakeSupabase({ userRow: BROKE_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(
      app,
      validBody({
        pages: [
          {
            pageNumber: 1,
            url: PAGE_URL,
            widthPx: 2048,
            heightPx: 1152,
            storagePath: 'user-1/review-temp/no-credit/page-1.jpg',
          },
        ],
      }),
    );
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'review_payment_required', reason: 'no_credit' });
    expect(remove).toHaveBeenCalledWith([
      'user-1/review-temp/no-credit/page-1.jpg',
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'release_initial_review',
    ]);
    expect(inserts).toHaveLength(0);
  });

  it('maps quota denial with no pack credits to 402 with matching Retry-After header and body', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs } = fakeSupabase({
      userRow: { ...ADDON_USER, review_credits: 0 },
      addonSlotResult: {
        data: { allowed: false, retryAfterSec: 3600 },
        error: null,
      },
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.headers['retry-after']).toBe('3600');
    expect(res.body).toMatchObject({
      error: 'review_payment_required',
      reason: 'weekly_quota_exceeded',
      retryAfterSec: 3600,
    });
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'consume_review_addon_slot',
      'release_initial_review',
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('ignores the add-on when the term is not active (D4 term-active rule)', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs } = fakeSupabase({
      userRow: {
        ...ADDON_USER,
        review_credits: 1,
        plan_expires_at: '2000-01-01T00:00:00.000Z',
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(200);
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'reserve_initial_review_credit',
      'finalize_initial_review',
    ]);
    expect(rpcs[2]!.args.p_credit_source).toBe('pack');
  });

  it.each([
    {
      name: 'RPC error',
      opts: {
        addonSlotResult: {
          data: null,
          error: { message: 'database unavailable' },
        },
      },
    },
    {
      name: 'thrown RPC error',
      opts: { addonSlotThrows: true },
    },
    {
      name: 'malformed allowed response',
      opts: {
        addonSlotResult: {
          data: { allowed: 'yes' },
          error: null,
        },
      },
    },
    {
      name: 'malformed denied response',
      opts: {
        addonSlotResult: {
          data: { allowed: false, retryAfterSec: 0.5 },
          error: null,
        },
      },
    },
  ])('fails closed before fetch/model on $name', async ({ opts }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs } = fakeSupabase({
      userRow: ADDON_USER,
      ...opts,
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'review_internal' });
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'consume_review_addon_slot',
      'release_initial_review',
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('replays a completed request key before entitlement and quota work', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs } = fakeSupabase({
      userRow: ADDON_USER,
      claimResult: {
        outcome: 'replay',
        reviewId: '11111111-1111-4111-8111-111111111111',
        stage: 'initial',
        critique: VALID_CRITIQUE,
      },
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(rpcs.map((rpc) => rpc.fn)).toEqual(['claim_initial_review']);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/review/critique — initial critique', () => {
  it.each([
    {
      name: 'claim',
      opts: { claimThrows: true },
      expectedRpcs: ['claim_initial_review'],
    },
    {
      name: 'entitlement',
      opts: { entitlementThrows: true },
      expectedRpcs: [
        'claim_initial_review',
        'release_initial_review',
      ],
    },
    {
      name: 'finalizer',
      opts: { finalizeThrows: true },
      expectedRpcs: [
        'claim_initial_review',
        'reserve_initial_review_credit',
        'finalize_initial_review',
        'release_initial_review',
      ],
    },
  ])(
    'turns a rejected $name SDK/RPC promise into a bounded 500 response',
    async ({ opts, expectedRpcs }) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const anthropic = fakeAnthropic();
      const { client, rpcs } = fakeSupabase({
        userRow: PACK_USER,
        ...opts,
      });
      const app = buildApp({
        supabase: client,
        anthropic: anthropic.client,
        fetchFn: vi
          .fn()
          .mockResolvedValue(imageResponse()) as unknown as typeof fetch,
      });

      const res = await post(app, validBody());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'review_internal' });
      expect(rpcs.map(({ fn }) => fn)).toEqual(expectedRpcs);
    },
  );

  it('refreshes an owned storage path before fetching a possibly expired signed URL', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, createSignedUrl } = fakeSupabase({
      userRow: PACK_USER,
    });
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('token=refreshed');
      return imageResponse();
    });
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(
      app,
      validBody({
        pages: [
          {
            pageNumber: 1,
            url: `${PAGE_URL}&token=expired`,
            widthPx: 2048,
            heightPx: 1152,
            storagePath:
              'user-1/review-temp/session-1/page-1.jpg',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      'user-1/review-temp/session-1/page-1.jpg',
      600,
    );
  });

  it('runs the pack path and transactionally finalizes AFTER success', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockImplementation(async () => imageResponse());
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

    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'reserve_initial_review_credit',
      'finalize_initial_review',
    ]);
    expect(rpcs[2]!.args).toMatchObject({
      p_user_id: 'user-1',
      p_claim_token: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_credit_source: 'pack',
    });
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

  it('rejects foreign storage metadata but removes only the owned temp page', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, remove } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockImplementation(async () => imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const pages = [
      {
        pageNumber: 1,
        url: PAGE_URL,
        widthPx: 2048,
        heightPx: 1152,
        storagePath: 'user-1/review-temp/session-1/page-1.jpg',
      },
      {
        pageNumber: 2,
        url: PAGE_URL,
        widthPx: 2048,
        heightPx: 1152,
        storagePath: 'user-1/poster-1/review-capture.jpg',
      },
      {
        pageNumber: 3,
        url: PAGE_URL,
        widthPx: 2048,
        heightPx: 1152,
        storagePath: 'user-2/review-temp/session-2/page-3.jpg',
      },
    ];

    const res = await post(app, validBody({ pages }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_storage_path' });
    expect(remove).toHaveBeenCalledWith([
      'user-1/review-temp/session-1/page-1.jpg',
    ]);
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('continues the critique when best-effort temp cleanup fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, remove } = fakeSupabase({
      userRow: PACK_USER,
      removeError: true,
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(
      app,
      validBody({
        pages: [
          {
            pageNumber: 1,
            url: PAGE_URL,
            widthPx: 2048,
            heightPx: 1152,
            storagePath: 'user-1/review-temp/session-1/page-1.jpg',
          },
        ],
      }),
    );

    expect(remove).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(anthropic.create).toHaveBeenCalledOnce();
  });

  it('consumes a persistent add-on slot after claiming and before provider work', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'consume_review_addon_slot',
      'finalize_initial_review',
    ]);
    expect(rpcs[1]!.args).toEqual({
      p_user_id: 'user-1',
      p_quota: REVIEW_ADDON_WEEKLY_QUOTA,
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.payload.credit_source).toBe('subscription_addon');
  });

  it('keeps an add-on slot consumed when provider work fails (D17)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    anthropic.create.mockRejectedValue(new Error('provider unavailable'));
    const { client, rpcs, inserts } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(502);
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'consume_review_addon_slot',
      'release_initial_review',
    ]);
    expect(inserts).toHaveLength(0);
  });

  it('maps a failed page fetch to 502 and refunds the reserved pack claim', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs } = fakeSupabase({ userRow: PACK_USER });
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: vi
        .fn()
        .mockRejectedValue(new Error('signed URL expired')) as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'fetch_failed' });
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs.map(({ fn }) => fn)).toEqual([
      'claim_initial_review',
      'reserve_initial_review_credit',
      'release_initial_review',
    ]);
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
    expect(rpcs.map((rpc) => rpc.fn)).toEqual([
      'claim_initial_review',
      'reserve_initial_review_credit',
      'release_initial_review',
    ]);
    expect(inserts).toHaveLength(0);
  });
});
