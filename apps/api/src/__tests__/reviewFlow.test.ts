/**
 * /api/review flow — the executable §5.2 state-machine gate (D13):
 *   initial critique (1 credit) → follow-up (INCLUDED — no second
 *   credit, no second weekly slot, §5.3) → closed → third critique 409s.
 * Plus the billing invariants that protect the moat:
 *   - no credit consumed and no poster_reviews row on model failure
 *     (D6/D16 — §5.3 "no credit consumed on ingest or model failure");
 *   - add-on weekly-window accounting: initials consume slots, the
 *     follow-up does not, quota exhaustion 402s, and sliding the
 *     injected clock past 7 days re-opens the window (D5/D17).
 * Supabase is ONE stateful in-memory fake (poster_reviews store + users
 * billing row + atomic finalize_initial_review semantics); Anthropic is mocked at the SDK
 * layer (the importExtract.test.ts pattern); page bytes come from an
 * injected fetchFn, exactly like the import router tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';
import { REVIEW_ADDON_WEEKLY_QUOTA } from '../review/config.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const USER_ID = 'user-1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One signed-URL page ref on the allowlisted host (checkImageUrl). */
const ONE_PAGE = [
  {
    pageNumber: 1,
    url: `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/temp/review/page-1.png?token=test`,
    widthPx: 2048,
    heightPx: 1152,
  },
];

// ---- Stateful fake Supabase ----------------------------------------------

interface FakeUserRow {
  id: string;
  plan: 'free' | 'term';
  plan_expires_at: string | null;
  subscription_status: string | null;
  review_credits: number;
  review_addon: boolean;
}

interface FakeReviewRow {
  id: string;
  user_id: string;
  poster_id: string | null;
  source_kind: string;
  source_meta: Record<string, unknown>;
  status: string;
  stage: string;
  initial_findings: unknown | null;
  followup_findings: unknown | null;
  credit_source: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface EqFilter {
  col: string;
  val: unknown;
}

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: EqFilter[]): T[] {
  return rows.filter((row) => filters.every((f) => String(row[f.col]) === String(f.val)));
}

/**
 * Serves the chains the review router uses: insert(...).select().single(),
 * select(...).eq(...).single()/maybeSingle(), update(...).eq(...), rpc(...).
 * Awaiting an insert/update directly resolves `{ error: null }`.
 */
function fakeReviewSupabase(
  userOverrides: Partial<FakeUserRow> = {},
  now: () => number = Date.now,
) {
  const users: FakeUserRow = {
    id: USER_ID,
    plan: 'free',
    plan_expires_at: null,
    subscription_status: null,
    review_credits: 0,
    review_addon: false,
    ...userOverrides,
  };
  const reviews = new Map<string, FakeReviewRow>();
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const claims = new Map<string, string>();
  const reservations = new Set<string>();
  const addonUsage: number[] = [];
  let reviewSeq = 0;
  let claimSeq = 0;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select: (_cols?: string) => {
            const filters: EqFilter[] = [];
            const chain = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return chain;
              },
              single: async () => {
                const hit = applyFilters([users as unknown as Record<string, unknown>], filters)[0];
                return hit
                  ? { data: { ...hit }, error: null }
                  : { data: null, error: { code: 'PGRST116', message: '0 rows' } };
              },
              maybeSingle: async () => {
                const hit = applyFilters([users as unknown as Record<string, unknown>], filters)[0];
                return { data: hit ? { ...hit } : null, error: null };
              },
            };
            return chain;
          },
        };
      }
      if (table === 'poster_reviews') {
        return {
          insert(payload: Record<string, unknown>) {
            reviewSeq += 1;
            const now = new Date().toISOString();
            const row = {
              // Production validates reviewId as a UUID before the
              // follow-up branch; keep generated ids deterministic and
              // schema-valid so this fake reaches the state machine.
              id: `11111111-1111-4111-8111-${String(reviewSeq).padStart(12, '0')}`,
              user_id: USER_ID,
              poster_id: null,
              source_kind: 'image',
              source_meta: {},
              status: 'complete',
              stage: 'initial',
              initial_findings: null,
              followup_findings: null,
              credit_source: null,
              created_at: now,
              updated_at: now,
              ...payload,
            } as FakeReviewRow;
            reviews.set(row.id, row);
            return {
              select: (_cols?: string) => ({
                single: async () => ({ data: { ...row }, error: null }),
              }),
              then(onFulfilled?: (v: { error: null }) => unknown) {
                return Promise.resolve({ error: null }).then(onFulfilled);
              },
            };
          },
          select: (_cols?: string) => {
            const filters: EqFilter[] = [];
            const chain = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return chain;
              },
              single: async () => {
                const hit = applyFilters([...reviews.values()], filters)[0];
                return hit
                  ? { data: { ...hit }, error: null }
                  : { data: null, error: { code: 'PGRST116', message: '0 rows' } };
              },
              maybeSingle: async () => {
                const hit = applyFilters([...reviews.values()], filters)[0];
                return { data: hit ? { ...hit } : null, error: null };
              },
            };
            return chain;
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            const filters: EqFilter[] = [];
            let result: { data: { id: string } | null; error: null } | undefined;
            const execute = () => {
              if (result) return result;
              const hit = applyFilters([...reviews.values()], filters)[0];
              if (!hit) {
                result = { data: null, error: null };
                return result;
              }
              Object.assign(hit, payload);
              result = { data: { id: hit.id }, error: null };
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
              then(onFulfilled?: (v: { error: null }) => unknown) {
                return Promise.resolve({ error: execute().error }).then(onFulfilled);
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`fake supabase: unexpected table "${table}"`);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      const requestKey = String(args.p_request_key ?? '');
      if (fn === 'claim_initial_review') {
        const existing = [...reviews.values()].find(
          (review) => review.request_key === requestKey,
        );
        if (existing) {
          return Promise.resolve({
            data: {
              outcome: 'replay',
              reviewId: existing.id,
              stage: 'initial',
              critique: existing.initial_findings,
            },
            error: null,
          });
        }
        if (claims.has(requestKey)) {
          return Promise.resolve({
            data: { outcome: 'in_progress' },
            error: null,
          });
        }
        claimSeq += 1;
        const claimToken =
          `bbbbbbbb-bbbb-4bbb-8bbb-${String(claimSeq).padStart(12, '0')}`;
        claims.set(requestKey, claimToken);
        return Promise.resolve({
          data: {
            outcome: 'claimed',
            claimToken,
            expiresAt: '2099-01-01T00:10:00.000Z',
          },
          error: null,
        });
      }
      if (fn === 'release_initial_review') {
        const matches = claims.get(requestKey) === args.p_claim_token;
        if (matches && reservations.delete(requestKey)) {
          users.review_credits += 1;
        }
        return Promise.resolve({
          data: matches ? claims.delete(requestKey) : false,
          error: null,
        });
      }
      if (fn === 'reserve_initial_review_credit') {
        if (claims.get(requestKey) !== args.p_claim_token) {
          return Promise.resolve({ data: false, error: null });
        }
        if (reservations.has(requestKey)) {
          return Promise.resolve({ data: true, error: null });
        }
        if (users.review_credits <= 0) {
          return Promise.resolve({ data: false, error: null });
        }
        users.review_credits -= 1;
        reservations.add(requestKey);
        return Promise.resolve({ data: true, error: null });
      }
      if (fn === 'claim_review_followup') {
        const review = reviews.get(String(args.p_review_id));
        if (!review) {
          return Promise.resolve({
            data: { outcome: 'not_found' },
            error: null,
          });
        }
        if (review.user_id !== args.p_user_id) {
          return Promise.resolve({
            data: { outcome: 'not_owner' },
            error: null,
          });
        }
        if (review.status !== 'complete' || !review.initial_findings) {
          return Promise.resolve({
            data: { outcome: 'not_complete' },
            error: null,
          });
        }
        const followupRequestId = String(args.p_request_id);
        if (review.stage === 'closed') {
          return Promise.resolve({
            data:
              review.followup_request_id === followupRequestId
                ? {
                    outcome: 'replay',
                    reviewId: review.id,
                    stage: 'closed',
                    critique: review.followup_findings,
                  }
                : { outcome: 'closed' },
            error: null,
          });
        }
        if (review.stage === 'followup') {
          return Promise.resolve({
            data: { outcome: 'in_progress' },
            error: null,
          });
        }
        const leaseToken = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        Object.assign(review, {
          stage: 'followup',
          followup_request_id: followupRequestId,
          followup_lease_token: leaseToken,
          followup_lease_expires_at: '2099-01-01T00:10:00.000Z',
        });
        return Promise.resolve({
          data: {
            outcome: 'claimed',
            leaseToken,
            expiresAt: review.followup_lease_expires_at,
            initialCritique: review.initial_findings,
          },
          error: null,
        });
      }
      if (fn === 'complete_review_followup') {
        const review = reviews.get(String(args.p_review_id));
        if (!review) {
          return Promise.resolve({
            data: { outcome: 'not_found' },
            error: null,
          });
        }
        if (review.user_id !== args.p_user_id) {
          return Promise.resolve({
            data: { outcome: 'not_owner' },
            error: null,
          });
        }
        if (review.status !== 'complete' || !review.initial_findings) {
          return Promise.resolve({
            data: { outcome: 'not_complete' },
            error: null,
          });
        }
        const followupRequestId = String(args.p_request_id);
        if (review.stage === 'closed') {
          return Promise.resolve({
            data:
              review.followup_request_id === followupRequestId
                ? {
                    outcome: 'replay',
                    reviewId: review.id,
                    stage: 'closed',
                    critique: review.followup_findings,
                  }
                : { outcome: 'closed' },
            error: null,
          });
        }
        if (
          review.stage !== 'followup' ||
          review.followup_request_id !== followupRequestId ||
          review.followup_lease_token !== args.p_lease_token
        ) {
          return Promise.resolve({
            data: { outcome: 'claim_missing' },
            error: null,
          });
        }
        Object.assign(review, {
          stage: 'closed',
          followup_findings: args.p_followup_findings,
          followup_lease_token: null,
          followup_lease_expires_at: null,
        });
        return Promise.resolve({
          data: {
            outcome: 'complete',
            reviewId: review.id,
            stage: 'closed',
            critique: review.followup_findings,
          },
          error: null,
        });
      }
      if (fn === 'release_review_followup') {
        const review = reviews.get(String(args.p_review_id));
        const released =
          review?.stage === 'followup' &&
          review.user_id === args.p_user_id &&
          review.followup_request_id === args.p_request_id &&
          review.followup_lease_token === args.p_lease_token;
        if (released) {
          Object.assign(review, {
            stage: 'initial',
            followup_request_id: null,
            followup_lease_token: null,
            followup_lease_expires_at: null,
          });
        }
        return Promise.resolve({ data: released, error: null });
      }
      if (fn === 'consume_review_addon_slot') {
        const quota = Number(args.p_quota);
        const nowMs = now();
        const cutoff = nowMs - WEEK_MS;
        while (addonUsage.length > 0 && addonUsage[0]! <= cutoff) {
          addonUsage.shift();
        }
        if (addonUsage.length >= quota) {
          return Promise.resolve({
            data: {
              allowed: false,
              retryAfterSec: Math.ceil(
                (addonUsage[0]! + WEEK_MS - nowMs) / 1000,
              ),
            },
            error: null,
          });
        }
        addonUsage.push(nowMs);
        return Promise.resolve({
          data: { allowed: true },
          error: null,
        });
      }
      if (fn !== 'finalize_initial_review') {
        return Promise.resolve({
          data: null,
          error: { message: `unknown rpc ${fn}` },
        });
      }
      if (claims.get(requestKey) !== args.p_claim_token) {
        return Promise.resolve({
          data: { outcome: 'claim_missing' },
          error: null,
        });
      }
      if (args.p_credit_source === 'pack') {
        if (!reservations.has(requestKey)) {
          claims.delete(requestKey);
          return Promise.resolve({
            data: { outcome: 'no_credit' },
            error: null,
          });
        }
      }
      reviewSeq += 1;
      const timestamp = new Date().toISOString();
      const row = {
        id: `11111111-1111-4111-8111-${String(reviewSeq).padStart(12, '0')}`,
        user_id: USER_ID,
        request_key: requestKey,
        poster_id: (args.p_poster_id as string | null) ?? null,
        source_kind: String(args.p_source_kind),
        source_meta: args.p_source_meta as Record<string, unknown>,
        status: 'complete',
        stage: 'initial',
        initial_findings: args.p_initial_findings,
        followup_findings: null,
        credit_source: String(args.p_credit_source),
        created_at: timestamp,
        updated_at: timestamp,
      } as FakeReviewRow;
      reviews.set(row.id, row);
      reservations.delete(requestKey);
      claims.delete(requestKey);
      return Promise.resolve({
        data: {
          outcome: 'complete',
          reviewId: row.id,
          stage: 'initial',
          critique: row.initial_findings,
        },
        error: null,
      });
    },
  } as unknown as SupabaseClient;

  return { client, users, reviews, rpcs, updates, addonUsage };
}

// ---- Anthropic SDK-layer fake + contract-valid fixtures -------------------

function fakeAnthropic() {
  const create = vi.fn();
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function toolReply(input: unknown) {
  return {
    content: [
      { type: 'tool_use', id: 'toolu_review', name: 'emit_critique', input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1200, output_tokens: 480 },
  };
}

const INITIAL_CRITIQUE = {
  dimensionScores: { narrative: 2, design: 3, content: 4 },
  attentionSummary:
    'The eye lands on the decorative banner photo first; the key-result figure sits third in the predicted scan path.',
  prioritization:
    'The results chart wins primary; the methods table moves to supplementary.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.04, 0.9, 0.2] },
      action: 'cut',
      problem:
        'The full-width lab photo at the top is the first fixation but carries no result.',
      fix: 'Remove the banner photo and let the main results figure take the top slot.',
      example:
        'Delete the top banner; move "Figure 2 — 38% reduction" into the upper-left entry position.',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'buried-key-result',
      anchor: { kind: 'slide', page: 1 },
      action: 'condense',
      problem: 'The headline result appears only in the final column.',
      fix: 'State the key result in the title bar and the first figure caption.',
      example: 'Retitle to "X reduces Y by 38%" and lead the results column with Figure 2.',
    },
  ],
};

const FOLLOWUP_CRITIQUE = {
  dimensionScores: { narrative: 4, design: 4, content: 4 },
  attentionSummary:
    'The eye now lands on the results figure first; the predicted path is title → key figure → supporting plots.',
  findings: [
    {
      dimension: 'narrative',
      severity: 'low',
      category: 'redundant-text',
      anchor: { kind: 'slide', page: 1 },
      action: 'cut',
      problem: 'The results paragraph still narrates Figure 2 sentence by sentence.',
      fix: 'Cut the paragraph to one sentence that names what the figure cannot show.',
      example: 'Keep only: "The effect holds across all three cohorts (n = 412)."',
    },
  ],
};

// ---- App plumbing ----------------------------------------------------------

function pngFetch() {
  // Tiny stand-in bytes — the route forwards them to the model untouched.
  // A Response body is single-use, so each page re-fetch needs a fresh
  // instance during initial/follow-up/retry flows.
  return vi.fn().mockImplementation(async () => (
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
  ));
}

function buildApp(deps: {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  now?: () => number;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic,
      fetchFn: pngFetch() as unknown as typeof fetch,
      ...(deps.now ? { now: deps.now } : {}),
    }),
  );
  return app;
}

function postCritique(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

beforeEach(() => {
  // checkImageUrl allowlists exactly this host for the page re-fetch.
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---- The flow --------------------------------------------------------------

describe('POST /api/review/critique — §5.2 state machine', () => {
  it('initial → follow-up (included) → closed → third 409s; exactly one credit spent', async () => {
    // Two credits so the third-critique 409 cannot be confused with a 402
    // — this test pins STAGE enforcement, not balance enforcement.
    const sb = fakeReviewSupabase({ review_credits: 2 });
    const { create, client: anthropic } = fakeAnthropic();
    create
      .mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE))
      .mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic });

    // 1. Initial critique — spends the one credit, writes the row (D16).
    const initial = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(initial.status).toBe(200);
    expect(initial.body.stage).toBe('initial');
    expect(typeof initial.body.reviewId).toBe('string');
    expect(initial.body.critique.dimensionScores).toEqual(INITIAL_CRITIQUE.dimensionScores);
    expect(initial.body.critique.findings).toHaveLength(2);
    const reviewId = initial.body.reviewId as string;

    const row = sb.reviews.get(reviewId)!;
    expect(row).toMatchObject({
      user_id: USER_ID,
      status: 'complete',
      stage: 'initial',
      credit_source: 'pack',
    });
    expect(row.initial_findings).toBeTruthy();
    expect(
      sb.rpcs.filter(
        (r) =>
          r.fn === 'finalize_initial_review' &&
          r.args.p_credit_source === 'pack',
      ),
    ).toHaveLength(1);
    expect(sb.users.review_credits).toBe(1);

    // 2. Follow-up — included in the initial credit: NO second decrement (§5.3).
    const followup = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(followup.status).toBe(200);
    expect(followup.body.reviewId).toBe(reviewId);
    expect(followup.body.stage).toBe('closed');
    expect(followup.body.critique.dimensionScores).toEqual(FOLLOWUP_CRITIQUE.dimensionScores);
    expect(
      sb.rpcs.filter(
        (r) =>
          r.fn === 'finalize_initial_review' &&
          r.args.p_credit_source === 'pack',
      ),
    ).toHaveLength(1); // still one
    expect(sb.users.review_credits).toBe(1);
    expect(sb.reviews.get(reviewId)).toMatchObject({ status: 'complete', stage: 'closed' });
    expect(sb.reviews.get(reviewId)!.followup_findings).toBeTruthy();
    expect(sb.reviews.get(reviewId)!.initial_findings).toBeTruthy(); // initial preserved

    // 3. Third critique on the closed review — closed is terminal,
    // enforced server-side (§5.2); the model never runs.
    const third = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(third.status).toBe(409);
    expect(third.body.error).toBe('review_closed');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/review/critique — no charge on model failure (D6)', () => {
  it('a failed initial consumes no credit and writes no row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = fakeReviewSupabase({ review_credits: 1 });
    const { create, client: anthropic } = fakeAnthropic();
    create.mockRejectedValueOnce(new Error('upstream 529: overloaded'));
    const app = buildApp({ supabase: sb.client, anthropic });

    const failed = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(failed.status).toBe(502);
    // The 502 contract is a union; which member maps to an SDK throw is
    // the router's choice (Tasks 15/16) — either satisfies D6.
    expect(['review_upstream', 'bad_model_output']).toContain(failed.body.error);
    expect(
      sb.rpcs.filter((r) => r.fn === 'finalize_initial_review'),
    ).toHaveLength(0);
    expect(sb.users.review_credits).toBe(1);
    expect(sb.reviews.size).toBe(0); // no poster_reviews row on failure (D16)

    // Retry succeeds and spends exactly one credit.
    create.mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE));
    const ok = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(ok.status).toBe(200);
    expect(sb.users.review_credits).toBe(0);
    expect(sb.reviews.size).toBe(1);
  });

  it('a failed follow-up writes nothing and leaves the review open for retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = fakeReviewSupabase({ review_credits: 1 });
    const { create, client: anthropic } = fakeAnthropic();
    create.mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic });

    const initial = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    const reviewId = initial.body.reviewId as string;

    create.mockRejectedValueOnce(new Error('upstream 500'));
    const failed = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(failed.status).toBe(502);
    expect(sb.reviews.get(reviewId)).toMatchObject({
      status: 'complete',
      stage: 'initial', // still open — the included follow-up is not forfeit
      followup_findings: null,
    });
    expect(
      sb.rpcs.filter(
        (r) =>
          r.fn === 'finalize_initial_review' &&
          r.args.p_credit_source === 'pack',
      ),
    ).toHaveLength(1);

    create.mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const retried = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(retried.status).toBe(200);
    expect(retried.body.stage).toBe('closed');
    expect(
      sb.rpcs.filter(
        (r) =>
          r.fn === 'finalize_initial_review' &&
          r.args.p_credit_source === 'pack',
      ),
    ).toHaveLength(1);
  });
});

describe('POST /api/review/critique — add-on weekly window (D5/D17)', () => {
  it('initials consume weekly slots, the follow-up does not, exhaustion 402s, reset re-opens', async () => {
    let nowMs = 1_800_000_000_000; // fixed fake clock, injected everywhere
    const sb = fakeReviewSupabase({
      plan: 'term',
      // Term-active per D4 (plan + future expiry + non-terminal status).
      plan_expires_at: new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_status: 'active',
      review_addon: true,
      review_credits: 0,
    }, () => nowMs);
    const { create, client: anthropic } = fakeAnthropic();
    create.mockResolvedValue(toolReply(INITIAL_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic, now: () => nowMs });

    // Slot 1 — an initial critique.
    const first = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(first.status).toBe(200);
    expect(first.body.stage).toBe('initial');
    expect([...sb.reviews.values()][0]).toMatchObject({ credit_source: 'subscription_addon' });

    // The follow-up is included — NO second weekly slot (§5.3).
    create.mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const followup = await postCritique(app, {
      sourceKind: 'image',
      pages: ONE_PAGE,
      reviewId: first.body.reviewId,
    });
    expect(followup.status).toBe(200);
    expect(followup.body.stage).toBe('closed');
    expect(
      sb.rpcs.filter((rpc) => rpc.fn === 'consume_review_addon_slot'),
    ).toHaveLength(1);

    // Slots 2..N — one per initial, all inside the same window.
    for (let i = 2; i <= REVIEW_ADDON_WEEKLY_QUOTA; i++) {
      const res = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
      expect(res.status).toBe(200);
    }

    // Slot N+1 — quota exhausted → 402 weekly_quota_exceeded (contract).
    const over = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(over.status).toBe(402);
    expect(over.body.error).toBe('review_payment_required');
    expect(over.body.reason).toBe('weekly_quota_exceeded');
    expect(typeof over.body.retryAfterSec).toBe('number');
    expect(over.headers['retry-after']).toBe(String(over.body.retryAfterSec));

    // The add-on path never decrements pack credits (D4).
    expect(
      sb.rpcs.filter(
        (r) =>
          r.fn === 'finalize_initial_review' &&
          r.args.p_credit_source === 'pack',
      ),
    ).toHaveLength(0);
    expect(sb.users.review_credits).toBe(0);

    // Slide the injected clock past the 7-day window — quota re-opens.
    nowMs += WEEK_MS + 1_000;
    const afterReset = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(afterReset.status).toBe(200);
    expect(afterReset.body.stage).toBe('initial');
  });

  it('falls back to one pack credit after add-on quota exhaustion and replays the same key without a second spend', async () => {
    const nowMs = 1_800_000_000_000;
    const sb = fakeReviewSupabase({
      plan: 'term',
      plan_expires_at: new Date(
        nowMs + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      subscription_status: 'active',
      review_addon: true,
      review_credits: 1,
    }, () => nowMs);
    const { create, client: anthropic } = fakeAnthropic();
    create.mockResolvedValue(toolReply(INITIAL_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic, now: () => nowMs });

    for (let i = 0; i < REVIEW_ADDON_WEEKLY_QUOTA; i++) {
      const response = await postCritique(app, {
        sourceKind: 'image',
        pages: ONE_PAGE,
      });
      expect(response.status).toBe(200);
    }
    expect(sb.users.review_credits).toBe(1);

    const requestKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fallback = await postCritique(app, {
      sourceKind: 'image',
      pages: ONE_PAGE,
      requestKey,
    });

    expect(fallback.status).toBe(200);
    expect(sb.reviews.get(fallback.body.reviewId)).toMatchObject({
      credit_source: 'pack',
    });
    expect(sb.users.review_credits).toBe(0);

    const replay = await postCritique(app, {
      sourceKind: 'image',
      pages: ONE_PAGE,
      requestKey,
    });
    expect(replay.status).toBe(200);
    expect(replay.body.reviewId).toBe(fallback.body.reviewId);
    expect(sb.users.review_credits).toBe(0);
    expect(
      sb.rpcs.filter((rpc) => rpc.fn === 'reserve_initial_review_credit'),
    ).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(REVIEW_ADDON_WEEKLY_QUOTA + 1);
  });
});
