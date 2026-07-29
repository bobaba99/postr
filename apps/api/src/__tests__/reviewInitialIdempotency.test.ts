/**
 * Initial paid-review idempotency contract.
 *
 * A browser-generated requestKey identifies one logical initial review:
 * a completed key replays its stored critique, while a concurrent request
 * for a claimed key is rejected before page fetch / provider work. Pack
 * finalization is represented by one RPC so credit spend + review insert
 * share a transaction boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL =
  `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/review.jpg?token=abc`;
const REQUEST_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_POSTER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CRITIQUE = {
  dimensionScores: { narrative: 4, design: 3, content: 4 },
  attentionSummary: 'The results figure earns the first fixation.',
  findings: [
    {
      dimension: 'design',
      severity: 'medium',
      category: 'over-emphasis',
      anchor: { kind: 'region', page: 1, bbox: [0.1, 0.2, 0.3, 0.4] },
      action: 'demote-to-appendix',
      problem: 'Several secondary labels compete with the result.',
      fix: 'Demote the secondary labels to one neutral weight.',
      example: 'Keep “72% reduction” bold and return the other labels to regular weight.',
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeSupabase(initialCredits = 2) {
  let reviewCredits = initialCredits;
  let reviewSequence = 0;
  let claimSequence = 0;
  const claims = new Map<string, string>();
  const reviews = new Map<
    string,
    {
      reviewId: string;
      stage: 'initial' | 'closed';
      initialCritique: unknown;
      followupCritique?: unknown;
    }
  >();
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });

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
          eq: (_col: string, _value: unknown) => ({
            single: async () => ({
              data:
                table === 'users'
                  ? {
                      review_credits: reviewCredits,
                      review_addon: false,
                      plan: null,
                      plan_expires_at: null,
                      subscription_status: null,
                    }
                  : null,
              error: null,
            }),
          }),
        }),
        insert(payload: Record<string, unknown>) {
          inserts.push(payload);
          reviewCredits -= 0;
          reviewSequence += 1;
          const reviewId =
            `11111111-1111-4111-8111-${String(reviewSequence).padStart(12, '0')}`;
          return {
            select: (_cols?: string) => ({
              single: async () => ({ data: { id: reviewId }, error: null }),
            }),
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      const requestKey = String(args.p_request_key ?? '');

      if (fn === 'claim_initial_review') {
        const existing = reviews.get(requestKey);
        if (existing) {
          return {
            data: {
              outcome: 'replay',
              reviewId: existing.reviewId,
              stage: 'initial',
              critique: existing.initialCritique,
            },
            error: null,
          };
        }
        if (claims.has(requestKey)) {
          return { data: { outcome: 'in_progress' }, error: null };
        }
        claimSequence += 1;
        const claimToken =
          `bbbbbbbb-bbbb-4bbb-8bbb-${String(claimSequence).padStart(12, '0')}`;
        claims.set(requestKey, claimToken);
        return {
          data: {
            outcome: 'claimed',
            claimToken,
            expiresAt: '2026-07-29T12:10:00.000Z',
          },
          error: null,
        };
      }

      if (fn === 'release_initial_review') {
        const matches = claims.get(requestKey) === args.p_claim_token;
        return {
          data: matches ? claims.delete(requestKey) : false,
          error: null,
        };
      }

      if (fn === 'finalize_initial_review') {
        const existing = reviews.get(requestKey);
        if (existing) {
          return {
            data: {
              outcome: 'replay',
              reviewId: existing.reviewId,
              stage: 'initial',
              critique: existing.initialCritique,
            },
            error: null,
          };
        }
        if (claims.get(requestKey) !== args.p_claim_token) {
          return { data: { outcome: 'claim_missing' }, error: null };
        }
        if (args.p_poster_id === FOREIGN_POSTER_ID) {
          claims.delete(requestKey);
          return { data: { outcome: 'poster_not_owned' }, error: null };
        }
        if (args.p_credit_source === 'pack') {
          if (reviewCredits <= 0) {
            claims.delete(requestKey);
            return { data: { outcome: 'no_credit' }, error: null };
          }
          reviewCredits -= 1;
        }
        reviewSequence += 1;
        const stored = {
          reviewId:
            `11111111-1111-4111-8111-${String(reviewSequence).padStart(12, '0')}`,
          stage: 'initial' as const,
          initialCritique: args.p_initial_findings,
        };
        reviews.set(requestKey, stored);
        claims.delete(requestKey);
        return {
          data: {
            outcome: 'complete',
            reviewId: stored.reviewId,
            stage: stored.stage,
            critique: stored.initialCritique,
          },
          error: null,
        };
      }

      // Compatibility with the pre-fix handler: this makes the regression
      // fail on duplicate provider/spend, not because the fake is incomplete.
      if (fn === 'consume_review_credit') {
        if (reviewCredits <= 0) return { data: null, error: null };
        reviewCredits -= 1;
        return { data: reviewCredits, error: null };
      }

      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    storage: {
      from: (_bucket: string) => ({ remove }),
    },
  } as unknown as SupabaseClient;

  return {
    client,
    claims,
    inserts,
    reviews,
    rpcs,
    remove,
    get reviewCredits() {
      return reviewCredits;
    },
    closeReview(requestKey: string, followupCritique: unknown) {
      const stored = reviews.get(requestKey);
      if (!stored) throw new Error('review not found');
      stored.stage = 'closed';
      stored.followupCritique = followupCritique;
    },
  };
}

function fakeAnthropic() {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: 'emit_critique',
        input: CRITIQUE,
      },
    ],
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

function buildApp(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  fetchFn: typeof fetch,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => supabase,
      getAnthropic: () => anthropic,
      fetchFn,
    }),
  );
  return app;
}

function body() {
  return {
    requestKey: REQUEST_KEY,
    sourceKind: 'image',
    pages: [
      {
        pageNumber: 1,
        url: PAGE_URL,
        widthPx: 1600,
        heightPx: 1000,
      },
    ],
  };
}

function post(app: ReturnType<typeof buildApp>) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body());
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/critique — initial request idempotency', () => {
  it('replays a completed request key without another model call or credit spend', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase(1);
    const anthropic = fakeAnthropic();
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp(
      supabase.client,
      anthropic.client,
      fetchFn as unknown as typeof fetch,
    );

    const first = await post(app);
    const replay = await post(app);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(supabase.reviewCredits).toBe(0);
    expect(supabase.reviews.size).toBe(1);
    expect(
      supabase.rpcs.find((rpc) => rpc.fn === 'finalize_initial_review')?.args
        .p_claim_token,
    ).toBe('bbbbbbbb-bbbb-4bbb-8bbb-000000000001');
  });

  it('deduplicates two concurrent requests with the same key before provider work', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase(2);
    const anthropic = fakeAnthropic();
    const modelStarted = deferred<void>();
    const releaseModel = deferred<void>();
    anthropic.create.mockImplementation(async () => {
      modelStarted.resolve();
      await releaseModel.promise;
      return {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_test',
            name: 'emit_critique',
            input: CRITIQUE,
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 120, output_tokens: 80 },
      };
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp(
      supabase.client,
      anthropic.client,
      fetchFn as unknown as typeof fetch,
    );

    const firstPromise = Promise.resolve(post(app));
    await modelStarted.promise;
    const secondPromise = Promise.resolve(post(app));

    let second:
      | Awaited<ReturnType<typeof post>>
      | undefined;
    const observedSecond = secondPromise.then((response) => {
      second = response;
      return response;
    });
    await vi.waitFor(() => {
      expect(
        second !== undefined || anthropic.create.mock.calls.length >= 2,
      ).toBe(true);
    });
    releaseModel.resolve();

    const [first, concurrent] = await Promise.all([
      firstPromise,
      observedSecond,
    ]);

    expect([first.status, concurrent.status].sort()).toEqual([200, 409]);
    expect(concurrent.body.error).toBe('review_in_progress');
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(supabase.reviewCredits).toBe(1);
    expect(supabase.reviews.size).toBe(1);

    const replay = await post(app);
    expect(replay.status).toBe(200);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(supabase.reviewCredits).toBe(1);
  });

  it('does not delete pages owned by an in-progress request-key retry', async () => {
    const supabase = fakeSupabase(1);
    supabase.claims.set(
      REQUEST_KEY,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    const app = buildApp(
      supabase.client,
      fakeAnthropic().client,
      vi.fn() as unknown as typeof fetch,
    );

    const response = await request(app)
      .post('/api/review/critique')
      .set('Authorization', 'Bearer test-token')
      .send({
        ...body(),
        pages: [
          {
            ...body().pages[0],
            storagePath: 'user-1/review-temp/session-1/page-1.jpg',
          },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('review_in_progress');
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it('replays the original initial result after the review later closes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase(2);
    const anthropic = fakeAnthropic();
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp(
      supabase.client,
      anthropic.client,
      fetchFn as unknown as typeof fetch,
    );

    const initial = await post(app);
    supabase.closeReview(REQUEST_KEY, {
      ...CRITIQUE,
      attentionSummary: 'This is the follow-up and must not be replayed.',
    });
    const replay = await post(app);

    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(initial.body);
    expect(replay.body.stage).toBe('initial');
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(supabase.reviewCredits).toBe(1);
  });

  it('releases a failed provider call with the exact claim token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase(2);
    const anthropic = fakeAnthropic();
    anthropic.create.mockRejectedValue(new Error('network failed'));
    const app = buildApp(
      supabase.client,
      anthropic.client,
      vi.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch,
    );

    const failed = await post(app);

    expect(failed.status).toBe(502);
    const release = supabase.rpcs.find(
      (rpc) => rpc.fn === 'release_initial_review',
    );
    expect(release?.args.p_claim_token).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
    );
  });

  it('rejects a foreign poster without spending credit or inserting a review', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase(1);
    const anthropic = fakeAnthropic();
    const app = buildApp(
      supabase.client,
      anthropic.client,
      vi.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch,
    );

    const response = await request(app)
      .post('/api/review/critique')
      .set('Authorization', 'Bearer test-token')
      .send({ ...body(), posterId: FOREIGN_POSTER_ID });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'not_poster_owner' });
    expect(supabase.reviewCredits).toBe(1);
    expect(supabase.reviews.size).toBe(0);
    expect(supabase.claims.has(REQUEST_KEY)).toBe(false);
  });
});
