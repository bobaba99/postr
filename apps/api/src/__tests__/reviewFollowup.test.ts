/**
 * POST /api/review/critique — FOLLOW-UP flow (spec §5.2): one follow-up
 * per review, a DIFF against the stored initial findings, then the
 * review closes for good. Included in the initial credit — no second
 * entitlement check, no second consume, no second weekly slot (D6).
 * `closed` is terminal and enforced by the route, not hidden in UI.
 *
 * Ownership is checked manually in the route because the service_role
 * client bypasses the table's owner-SELECT RLS (D3) — the
 * not_review_owner test is what keeps another user's review safe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/review-capture.jpg?token=abc`;
const REVIEW_ID = '11111111-1111-4111-8111-111111111111';

const VALID_CRITIQUE = {
  dimensionScores: { narrative: 4, design: 3, content: 4 },
  attentionSummary: 'The key-result figure now earns the first fixation.',
  findings: [
    {
      dimension: 'design',
      severity: 'medium',
      category: 'over-emphasis',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.3, 0.25, 0.4] },
      action: 'condense',
      problem: 'Six bolded phrases still compete in the methods column.',
      fix: 'Keep bold only on the sampling-rate number.',
      example: 'Unbold "novel", "first", and "significantly" in the second paragraph.',
    },
  ],
};

/** The stored review the follow-up runs against (stage 'initial'). */
const REVIEW_ROW = {
  id: REVIEW_ID,
  user_id: 'user-1',
  status: 'complete',
  stage: 'initial',
  initial_findings: {
    dimensionScores: { narrative: 2, design: 2, content: 3 },
    attentionSummary: 'First pass: the key result is hard to find.',
    findings: [
      {
        dimension: 'narrative',
        severity: 'high',
        category: 'buried-key-result',
        anchor: { kind: 'region', page: 1, bbox: [0.55, 0.7, 0.4, 0.25] },
        action: 'keep-as-primary',
        problem: 'The key result is buried in the bottom-right corner.',
        fix: 'Make the key-result figure the entry point of the poster.',
        example: 'Move Figure 3 ("72% reduction in error") to the top-left column.',
      },
    ],
  },
};

interface FakeSupabaseOpts {
  reviewRow?: Record<string, unknown> | null;
  beforeReviewLoad?: () => Promise<void>;
}

function fakeSupabase(opts: FakeSupabaseOpts = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{
    table: string;
    payload: Record<string, unknown>;
    eqVal: unknown;
    filters: Array<{ col: string; val: unknown }>;
  }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const reviewState = opts.reviewRow == null ? null : { ...opts.reviewRow };
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
            maybeSingle: async () => {
              if (table === 'poster_reviews') {
                await opts.beforeReviewLoad?.();
              }
              return {
                data: table === 'poster_reviews' && reviewState ? { ...reviewState } : null,
                error: null,
              };
            },
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: (_cols?: string) => ({
              single: () => Promise.resolve({ data: { id: 'review-new-1' }, error: null }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const filters: Array<{ col: string; val: unknown }> = [];
          let result: { data: { id: unknown } | null; error: null } | undefined;
          const execute = () => {
            if (result) return result;
            const matches =
              table === 'poster_reviews' &&
              reviewState !== null &&
              filters.every(({ col, val }) => String(reviewState[col]) === String(val));
            updates.push({
              table,
              payload,
              eqVal: filters[0]?.val,
              filters: [...filters],
            });
            if (!matches) {
              result = { data: null, error: null };
              return result;
            }
            Object.assign(reviewState, payload);
            result = { data: { id: reviewState.id }, error: null };
            return result;
          };
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            select: (_cols?: string) => ({
              maybeSingle: async () => execute(),
            }),
            then(onFulfilled?: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
              return Promise.resolve({ error: execute().error }).then(onFulfilled, onRejected);
            },
          };
          return chain;
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: 1, error: null });
    },
    storage: {
      from: (_bucket: string) => ({ remove }),
    },
  } as unknown as SupabaseClient;
  return { client, inserts, updates, rpcs, remove, reviewState };
}

function fakeAnthropic(critique: unknown = VALID_CRITIQUE) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input: critique }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 140, output_tokens: 90 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function imageResponse(): Response {
  return new Response(new Uint8Array(1024), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function buildApp(deps: { supabase: SupabaseClient; anthropic?: Anthropic; fetchFn: typeof fetch }) {
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
    reviewId: REVIEW_ID,
    ...overrides,
  };
}

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app).post('/api/review/critique').set('Authorization', 'Bearer test-token').send(body);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/critique — follow-up (§5.2)', () => {
  it('atomically admits one of two concurrent follow-ups before either model call', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const firstModelStarted = deferred<void>();
    const releaseModel = deferred<void>();
    const bothLoadsReady = deferred<void>();
    let reviewLoads = 0;
    anthropic.create.mockImplementation(async () => {
      firstModelStarted.resolve();
      await releaseModel.promise;
      return {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_test',
            name: 'emit_critique',
            input: VALID_CRITIQUE,
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 140, output_tokens: 90 },
      };
    });
    const { client, reviewState } = fakeSupabase({
      reviewRow: REVIEW_ROW,
      beforeReviewLoad: async () => {
        reviewLoads += 1;
        if (reviewLoads === 2) bothLoadsReady.resolve();
        await bothLoadsReady.promise;
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const responses: Array<Awaited<ReturnType<typeof post>>> = [];
    const firstPromise = Promise.resolve(post(app, validBody())).then((response) => {
      responses.push(response);
      return response;
    });
    const secondPromise = Promise.resolve(post(app, validBody())).then((response) => {
      responses.push(response);
      return response;
    });

    await firstModelStarted.promise;
    await vi.waitFor(() => {
      expect(responses.length > 0 || anthropic.create.mock.calls.length >= 2).toBe(true);
    });
    releaseModel.resolve();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(reviewState).toMatchObject({
      stage: 'closed',
      followup_findings: VALID_CRITIQUE,
    });
  });

  it('conditionally rolls an admitted follow-up back to initial when the model fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    anthropic.create.mockRejectedValue(new Error('upstream unavailable'));
    const { client, updates, reviewState } = fakeSupabase({
      reviewRow: REVIEW_ROW,
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(502);
    expect(reviewState).toMatchObject({ stage: 'initial' });
    expect(updates.map(({ payload }) => payload.stage)).toEqual(['followup', 'initial']);
    expect(updates[0]!.filters).toEqual(
      expect.arrayContaining([
        { col: 'id', val: REVIEW_ID },
        { col: 'user_id', val: 'user-1' },
        { col: 'status', val: 'complete' },
        { col: 'stage', val: 'initial' },
      ]),
    );
    expect(updates[1]!.filters).toEqual(
      expect.arrayContaining([
        { col: 'id', val: REVIEW_ID },
        { col: 'stage', val: 'followup' },
      ]),
    );
  });

  it('runs the follow-up against the initial findings and closes the review without charging', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, inserts, updates, rpcs } = fakeSupabase({ reviewRow: REVIEW_ROW });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reviewId: REVIEW_ID, stage: 'closed' });
    expect(res.body.critique.findings).toHaveLength(1);

    // The follow-up is a diff, not a fresh review: the model received
    // the initial findings' problem text in its user message.
    const createArg = anthropic.create.mock.calls[0]![0];
    expect(JSON.stringify(createArg)).toContain('buried in the bottom-right corner');

    // The first conditional write claims the one included follow-up before
    // model work; the second stores findings and terminally closes it.
    expect(updates).toHaveLength(2);
    expect(updates[0]!.table).toBe('poster_reviews');
    expect(updates[0]!.eqVal).toBe(REVIEW_ID);
    expect(updates[0]!.payload.stage).toBe('followup');
    expect(updates[0]!.filters).toContainEqual({
      col: 'stage',
      val: 'initial',
    });
    expect(updates[1]!.table).toBe('poster_reviews');
    expect(updates[1]!.eqVal).toBe(REVIEW_ID);
    expect(updates[1]!.payload.stage).toBe('closed');
    expect(updates[1]!.payload.followup_findings).toBeDefined();
    expect(updates[1]!.filters).toContainEqual({
      col: 'stage',
      val: 'followup',
    });
    expect(typeof updates[1]!.payload.updated_at).toBe('string');

    // No new review row, and NO credit consume — the follow-up is
    // included in the initial credit (D6).
    expect(inserts).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  it('removes revised review-temp pages before replying', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, remove } = fakeSupabase({ reviewRow: REVIEW_ROW });
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
            storagePath: 'user-1/review-temp/revised/page-1.jpg',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith([
      'user-1/review-temp/revised/page-1.jpg',
    ]);
  });

  it('rejects a third critique on a closed review with 409 review_closed', async () => {
    const anthropic = fakeAnthropic();
    const { client, updates, remove } = fakeSupabase({
      reviewRow: { ...REVIEW_ROW, stage: 'closed' },
    });
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
            storagePath: 'user-1/review-temp/closed/page-1.jpg',
          },
        ],
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('review_closed');
    expect(remove).toHaveBeenCalledWith([
      'user-1/review-temp/closed/page-1.jpg',
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("rejects a follow-up on another user's review with 403 not_review_owner", async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ reviewRow: { ...REVIEW_ROW, user_id: 'user-2' } });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_review_owner');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('rejects a missing review with 404 review_not_found', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ reviewRow: null });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('review_not_found');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('rejects a review whose initial critique never completed with 409 review_not_complete', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({
      reviewRow: { ...REVIEW_ROW, status: 'pending', initial_findings: null },
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('review_not_complete');
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});
