/**
 * Durable follow-up idempotency contract.
 *
 * A browser-generated followupRequestId identifies one logical follow-up.
 * The database leases provider work, fences completion/release with the
 * exact request + token pair, and replays the stored terminal response
 * after an ambiguous transport failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL =
  `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/user-1/review-temp/revised.jpg?token=abc`;
const REVIEW_ID = '11111111-1111-4111-8111-111111111111';
const FOLLOWUP_REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEASE_TOKEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const INITIAL_CRITIQUE = {
  dimensionScores: { narrative: 2, design: 2, content: 3 },
  attentionSummary: 'The key result is hard to find.',
  findings: [
    {
      dimension: 'narrative',
      severity: 'high',
      category: 'buried-key-result',
      anchor: { kind: 'region', page: 1, bbox: [0.55, 0.7, 0.4, 0.25] },
      action: 'keep-as-primary',
      problem: 'The key result is buried in the bottom-right corner.',
      fix: 'Make the key-result figure the entry point.',
      example: 'Move Figure 3 to the top-left column.',
    },
  ],
};

const FOLLOWUP_CRITIQUE = {
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
      example: 'Return the secondary labels to regular weight.',
    },
  ],
};

type RpcResult = { data: unknown; error: { message: string } | null };

interface FakeSupabaseOptions {
  claim?: (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
  complete?: (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
  release?: (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
}

function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const tableQueries: string[] = [];
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  let state: 'initial' | 'followup' | 'closed' = 'initial';
  let activeRequestId: string | null = null;

  const defaultClaim = (args: Record<string, unknown>): RpcResult => {
    const requestId = String(args.p_request_id);
    if (state === 'initial') {
      state = 'followup';
      activeRequestId = requestId;
      return {
        data: {
          outcome: 'claimed',
          leaseToken: LEASE_TOKEN,
          expiresAt: '2026-07-29T12:10:00.000Z',
          initialCritique: INITIAL_CRITIQUE,
        },
        error: null,
      };
    }
    if (state === 'followup') {
      return { data: { outcome: 'in_progress' }, error: null };
    }
    if (activeRequestId === requestId) {
      return {
        data: {
          outcome: 'replay',
          reviewId: REVIEW_ID,
          stage: 'closed',
          critique: FOLLOWUP_CRITIQUE,
        },
        error: null,
      };
    }
    return { data: { outcome: 'closed' }, error: null };
  };

  const defaultComplete = (args: Record<string, unknown>): RpcResult => {
    if (
      state !== 'followup' ||
      args.p_request_id !== activeRequestId ||
      args.p_lease_token !== LEASE_TOKEN
    ) {
      return { data: { outcome: 'claim_missing' }, error: null };
    }
    state = 'closed';
    return {
      data: {
        outcome: 'complete',
        reviewId: REVIEW_ID,
        stage: 'closed',
        critique: args.p_followup_findings,
      },
      error: null,
    };
  };

  const defaultRelease = (args: Record<string, unknown>): RpcResult => {
    const released =
      state === 'followup' &&
      args.p_request_id === activeRequestId &&
      args.p_lease_token === LEASE_TOKEN;
    if (released) {
      state = 'initial';
      activeRequestId = null;
    }
    return { data: released, error: null };
  };

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      tableQueries.push(table);
      return {
        select: (_columns?: string) => ({
          eq: (_column: string, _value: unknown) => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === 'claim_review_followup') {
        return (options.claim ?? defaultClaim)(args);
      }
      if (fn === 'complete_review_followup') {
        return (options.complete ?? defaultComplete)(args);
      }
      if (fn === 'release_review_followup') {
        return (options.release ?? defaultRelease)(args);
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    storage: {
      from: (_bucket: string) => ({ remove }),
    },
  } as unknown as SupabaseClient;

  return {
    client,
    rpcs,
    tableQueries,
    remove,
    get state() {
      return state;
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
        input: FOLLOWUP_CRITIQUE,
      },
    ],
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function buildApp(deps: {
  supabase: SupabaseClient;
  anthropic?: Anthropic | null;
  fetchFn?: typeof fetch;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic === undefined
        ? fakeAnthropic().client
        : deps.anthropic,
      fetchFn: deps.fetchFn ?? (vi.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch),
    }),
  );
  return app;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: 'pdf',
    pages: [
      {
        pageNumber: 1,
        url: PAGE_URL,
        widthPx: 2048,
        heightPx: 1152,
        storagePath: 'user-1/review-temp/revised/page-1.jpg',
      },
    ],
    reviewId: REVIEW_ID,
    followupRequestId: FOLLOWUP_REQUEST_ID,
    ...overrides,
  };
}

function post(app: ReturnType<typeof buildApp>, body = validBody()) {
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

describe('POST /api/review/critique — durable follow-up lease', () => {
  it('admits only one concurrent request ID before provider work and defers loser cleanup', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase();
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
            input: FOLLOWUP_CRITIQUE,
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 140, output_tokens: 90 },
      };
    });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const firstPromise = Promise.resolve(post(app));
    await modelStarted.promise;
    const loser = await post(app);

    expect(loser.status).toBe(409);
    expect(loser.body.error).toBe('review_in_progress');
    expect(supabase.remove).not.toHaveBeenCalled();

    releaseModel.resolve();
    const winner = await firstPromise;

    expect(winner.status).toBe(200);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(supabase.remove).toHaveBeenCalledTimes(1);
  });

  it('replays a stored response for the same request without pages, provider, or cleanup dependency', async () => {
    const supabase = fakeSupabase({
      claim: () => ({
        data: {
          outcome: 'replay',
          reviewId: REVIEW_ID,
          stage: 'closed',
          critique: FOLLOWUP_CRITIQUE,
        },
        error: null,
      }),
    });
    const anthropic = fakeAnthropic();
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const response = await post(app);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reviewId: REVIEW_ID,
      stage: 'closed',
      critique: FOLLOWUP_CRITIQUE,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(supabase.rpcs.map(({ fn }) => fn)).toEqual(['claim_review_followup']);
  });

  it('rejects a different request after terminal close', async () => {
    const supabase = fakeSupabase({
      claim: () => ({ data: { outcome: 'closed' }, error: null }),
    });
    const anthropic = fakeAnthropic();
    const response = await post(buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
    }), validBody({ followupRequestId: OTHER_REQUEST_ID }));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('review_closed');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('releases a failed provider call with the exact request and lease token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic();
    anthropic.create.mockRejectedValue(new Error('upstream unavailable'));
    const app = buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
    });

    const response = await post(app);

    expect(response.status).toBe(502);
    expect(supabase.rpcs.at(-1)).toEqual({
      fn: 'release_review_followup',
      args: {
        p_user_id: 'user-1',
        p_review_id: REVIEW_ID,
        p_request_id: FOLLOWUP_REQUEST_ID,
        p_lease_token: LEASE_TOKEN,
      },
    });
    expect(supabase.state).toBe('initial');
  });

  it('completes with the exact request and lease token without entitlement or credit RPCs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic();
    const response = await post(buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
    }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      reviewId: REVIEW_ID,
      stage: 'closed',
      critique: FOLLOWUP_CRITIQUE,
    });
    expect(JSON.stringify(anthropic.create.mock.calls[0]![0])).toContain(
      'buried in the bottom-right corner',
    );
    expect(supabase.rpcs).toEqual([
      {
        fn: 'claim_review_followup',
        args: {
          p_user_id: 'user-1',
          p_review_id: REVIEW_ID,
          p_request_id: FOLLOWUP_REQUEST_ID,
        },
      },
      {
        fn: 'complete_review_followup',
        args: {
          p_user_id: 'user-1',
          p_review_id: REVIEW_ID,
          p_request_id: FOLLOWUP_REQUEST_ID,
          p_lease_token: LEASE_TOKEN,
          p_followup_findings: FOLLOWUP_CRITIQUE,
        },
      },
    ]);
  });

  it('releases a page-fetch failure with the exact request and lease token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase();
    const fetchFn = vi.fn().mockRejectedValue(new Error('network failed'));
    const response = await post(buildApp({
      supabase: supabase.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    }));

    expect(response.status).toBe(400);
    expect(supabase.rpcs.at(-1)).toMatchObject({
      fn: 'release_review_followup',
      args: {
        p_request_id: FOLLOWUP_REQUEST_ID,
        p_lease_token: LEASE_TOKEN,
      },
    });
  });

  it.each([
    ['not_found', 404, 'review_not_found'],
    ['not_owner', 403, 'not_review_owner'],
    ['not_complete', 409, 'review_not_complete'],
  ])('maps claim outcome %s to %i %s', async (outcome, status, error) => {
    const supabase = fakeSupabase({
      claim: () => ({ data: { outcome }, error: null }),
    });
    const anthropic = fakeAnthropic();
    const response = await post(buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
    }));

    expect(response.status).toBe(status);
    expect(response.body.error).toBe(error);
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it.each([
    ['claim RPC error', { data: null, error: { message: 'db unavailable' } }],
    ['malformed claim response', { data: { outcome: 'claimed' }, error: null }],
  ])('fails closed on %s', async (_label, claimResult) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ claim: () => claimResult });
    const anthropic = fakeAnthropic();
    const response = await post(buildApp({
      supabase: supabase.client,
      anthropic: anthropic.client,
    }));

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('review_internal');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it.each([
    ['completion RPC error', { data: null, error: { message: 'db unavailable' } }],
    ['malformed completion response', { data: { outcome: 'complete' }, error: null }],
  ])('fails closed on %s and attempts exact release', async (_label, completeResult) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase({ complete: () => completeResult });
    const response = await post(buildApp({ supabase: supabase.client }));

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('review_internal');
    expect(supabase.rpcs.at(-1)).toMatchObject({
      fn: 'release_review_followup',
      args: {
        p_request_id: FOLLOWUP_REQUEST_ID,
        p_lease_token: LEASE_TOKEN,
      },
    });
  });

  it('generates one UUID request ID for legacy clients and reuses it through completion', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = fakeSupabase();
    const response = await post(
      buildApp({ supabase: supabase.client }),
      validBody({ followupRequestId: undefined }),
    );

    expect(response.status).toBe(200);
    const [claim, complete] = supabase.rpcs;
    expect(claim!.args.p_request_id).toEqual(expect.any(String));
    expect(claim!.args.p_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(complete!.args.p_request_id).toBe(claim!.args.p_request_id);
  });
});
