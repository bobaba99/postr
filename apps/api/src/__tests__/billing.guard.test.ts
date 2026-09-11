/**
 * Paid-path lifecycle guards (P0-2, P0-3):
 *   - POST /billing/create-checkout refuses a second term (409
 *     already_subscribed) and reuses the stored Stripe customer.
 *   - handleSubscriptionChange revokes ONLY the stored subscription and
 *     advances only the stored / a successor subscription — a stale
 *     terminal event for an OLD sub id cannot revoke a NEWER term, and a
 *     late "active" for a cancelled sub cannot re-grant it.
 *   - A webhook that resolves a user id with no users row (deleted
 *     account) is an operator-visible 500, never a silent 200.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  createBillingRouter,
  createBillingWebhookRouter,
  handleInvoicePaid,
  handleSubscriptionChange,
} from '../billing.js';
import {
  hasActiveTerm,
  termAdvanceDecision,
} from '../billing/subscriptionGuard.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW_SEC = Math.floor(Date.now() / 1000);
type Row = Record<string, unknown>;

/**
 * Single-user in-memory `users` table with real eq/match filtering, plus
 * an `account_deletions` audit table (`opts.deletedUserIds`) the webhook
 * consults when a resolved user has no row.
 */
function usersFake(
  initial: Row | null,
  opts: { selectError?: string; deletedUserIds?: string[] } = {},
) {
  const state: Row | null = initial ? { ...initial } : null;
  const matches = (f: Row) => !!state && Object.entries(f).every(([c, v]) => state[c] === v);
  const updates: Array<{ payload: Row; filters: Row; matched: boolean }> = [];
  const deletionReads: string[] = [];
  const client = {
    from(table: string) {
      if (table === 'account_deletions') {
        return {
          select: () => ({
            eq: (_col: string, v: unknown) => ({
              maybeSingle: async () => {
                deletionReads.push(String(v));
                const hit = (opts.deletedUserIds ?? []).includes(String(v));
                return { data: hit ? { id: 'del_1', deleted_at: '2026-09-11T00:00:00.000Z' } : null, error: null };
              },
            }),
          }),
        };
      }
      if (table !== 'users') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string, v: unknown) => ({
            maybeSingle: async () => {
              if (opts.selectError) return { data: null, error: { message: opts.selectError } };
              return { data: matches({ [col]: v }) ? { ...state } : null, error: null };
            },
          }),
        }),
        update: (payload: Row) => {
          const apply = async (filters: Row) => {
            const matched = matches(filters);
            if (matched && state) Object.assign(state, payload);
            updates.push({ payload, filters, matched });
            return { data: null, error: null };
          };
          return { eq: (c: string, v: unknown) => apply({ [c]: v }), match: apply };
        },
      };
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', email: 'jane.doe@example.com', is_anonymous: false } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
  return { client, state: () => state, updates, deletionReads };
}

function sub(over: Row = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { user_id: 'user-1' },
    items: { data: [{ current_period_end: NOW_SEC + 120 * 86400 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

function termRow(over: Row = {}): Row {
  return {
    id: 'user-1',
    plan: 'term',
    plan_expires_at: new Date(Date.now() + 100 * DAY).toISOString(),
    subscription_status: 'active',
    stripe_subscription_id: 'sub_1',
    stripe_customer_id: 'cus_1',
    ...over,
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────
// Pure guards
// ─────────────────────────────────────────────────────────────────────────
describe('hasActiveTerm', () => {
  const future = new Date(Date.now() + DAY).toISOString();
  const past = new Date(Date.now() - DAY).toISOString();
  it('true for plan=term with a future expiry', () => {
    expect(hasActiveTerm({ plan: 'term', plan_expires_at: future, subscription_status: null })).toBe(true);
  });
  it('true for a non-terminal subscription status even if the plan columns lag', () => {
    expect(hasActiveTerm({ plan: 'free', plan_expires_at: null, subscription_status: 'past_due' })).toBe(true);
    expect(hasActiveTerm({ plan: 'free', plan_expires_at: null, subscription_status: 'trialing' })).toBe(true);
  });
  it('false for an expired term with a terminal status, or no row', () => {
    expect(hasActiveTerm({ plan: 'term', plan_expires_at: past, subscription_status: 'canceled' })).toBe(false);
    expect(hasActiveTerm(null)).toBe(false);
  });
  it('false — and operator-logged — when the status is live but the expiry has lapsed (stuck status agrees with usePlan)', () => {
    expect(hasActiveTerm({ plan: 'free', plan_expires_at: past, subscription_status: 'active' })).toBe(false);
    expect(hasActiveTerm({ plan: 'term', plan_expires_at: past, subscription_status: 'past_due' })).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/stuck|lapsed/i), expect.anything());
  });
  it('unpaid (dunning exhausted, recoverable) is not a live status', () => {
    expect(hasActiveTerm({ plan: 'free', plan_expires_at: future, subscription_status: 'unpaid' })).toBe(false);
  });
});

describe('termAdvanceDecision', () => {
  it('advances when nothing is stored, or the same live subscription, or the stored one is terminal', () => {
    expect(termAdvanceDecision({ stripe_subscription_id: null, subscription_status: null }, 'sub_1')).toBe('advance');
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'active' }, 'sub_1')).toBe('advance');
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_old', subscription_status: 'canceled' }, 'sub_new')).toBe('advance');
  });
  it('refuses to re-activate a subscription whose stored status is irreversibly terminal', () => {
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'canceled' }, 'sub_1')).toBe('skip_terminal');
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'incomplete_expired' }, 'sub_1')).toBe('skip_terminal');
  });
  it('unpaid is recoverable: paying the dunning invoice moves Stripe back to active and the SAME sub may re-grant', () => {
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'unpaid' }, 'sub_1')).toBe('advance');
    // …but while it is unpaid a DIFFERENT sub is still a duplicate term.
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'unpaid' }, 'sub_2')).toBe('skip_other_live');
  });
  it('refuses a DIFFERENT subscription while the stored one is still live (duplicate term)', () => {
    expect(termAdvanceDecision({ stripe_subscription_id: 'sub_1', subscription_status: 'active' }, 'sub_2')).toBe('skip_other_live');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// P0-2 — create-checkout
// ─────────────────────────────────────────────────────────────────────────
describe('POST /billing/create-checkout — duplicate-term guard + customer reuse (P0-2)', () => {
  function buildApp(row: Row | null, opts: { selectError?: string } = {}) {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams) => {
            created.push(params);
            return { url: 'https://checkout.stripe.test/session' };
          },
        },
      },
    } as unknown as Stripe;
    const db = usersFake(row, opts);
    const app = express();
    app.use(express.json());
    app.use(createBillingRouter({ getStripe: () => stripe, getSupabaseAdmin: () => db.client }));
    return { app, created };
  }
  const post = (app: express.Express, sku: string) =>
    request(app).post('/billing/create-checkout').set('Authorization', 'Bearer token').send({ sku });

  beforeEach(() => {
    vi.stubEnv('STRIPE_PRICE_TERM', 'price_term');
    vi.stubEnv('STRIPE_PRICE_PACK', 'price_pack');
  });

  it('refuses a term for an active term holder with 409 already_subscribed and creates no session', async () => {
    const { app, created } = buildApp(termRow());
    const res = await post(app, 'term');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'already_subscribed' });
    expect(created).toEqual([]);
  });

  it('refuses when only the subscription status is live (past_due dunning) even if the plan columns lag', async () => {
    const { app, created } = buildApp(termRow({ plan: 'free', plan_expires_at: null, subscription_status: 'past_due' }));
    const res = await post(app, 'term');
    expect(res.status).toBe(409);
    expect(created).toEqual([]);
  });

  it('sells a term again once the previous one is expired AND terminal', async () => {
    const { app, created } = buildApp(
      termRow({ plan_expires_at: new Date(Date.now() - DAY).toISOString(), subscription_status: 'canceled' }),
    );
    const res = await post(app, 'term');
    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
  });

  it('sells a term again when the stored status is stuck live but the expiry lapsed (missed terminal webhook)', async () => {
    const { app, created } = buildApp(
      termRow({ plan: 'free', plan_expires_at: new Date(Date.now() - 40 * DAY).toISOString(), subscription_status: 'active' }),
    );
    const res = await post(app, 'term');
    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
  });

  it('still sells a PACK to an active term holder (the guard is term-only)', async () => {
    const { app, created } = buildApp(termRow());
    const res = await post(app, 'pack');
    expect(res.status).toBe(200);
    expect(created[0]?.mode).toBe('payment');
  });

  it('reuses the stored Stripe customer (customer, no customer_email) and keeps managed_payments', async () => {
    const { app, created } = buildApp(termRow({ plan: 'free', plan_expires_at: null, subscription_status: null }));
    const res = await post(app, 'term');
    expect(res.status).toBe(200);
    expect(created[0]).toMatchObject({ customer: 'cus_1', managed_payments: { enabled: true } });
    expect(created[0]).not.toHaveProperty('customer_email');
  });

  it('falls back to customer_email when no Stripe customer is stored', async () => {
    const { app, created } = buildApp(termRow({ plan: 'free', plan_expires_at: null, subscription_status: null, stripe_customer_id: null }));
    const res = await post(app, 'pack');
    expect(res.status).toBe(200);
    expect(created[0]?.customer_email).toBe('jane.doe@example.com');
    expect(created[0]).not.toHaveProperty('customer');
  });

  it('a user with no users row yet is sold normally by email', async () => {
    const { app, created } = buildApp(null);
    const res = await post(app, 'term');
    expect(res.status).toBe(200);
    expect(created[0]?.customer_email).toBe('jane.doe@example.com');
  });

  it('fails closed (500 checkout_failed, generic) when the plan read errors', async () => {
    const { app, created } = buildApp(termRow(), { selectError: 'connection reset' });
    const res = await post(app, 'term');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'checkout_failed' });
    expect(created).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// P0-2 (c) — subscription-id-scoped revoke / advance
// ─────────────────────────────────────────────────────────────────────────
describe('handleSubscriptionChange — subscription-id scoping', () => {
  it('a stale terminal event for an OLD sub id leaves the NEWER term intact', async () => {
    const db = usersFake(termRow({ stripe_subscription_id: 'sub_new' }));
    await handleSubscriptionChange(db.client, sub({ id: 'sub_old', status: 'canceled' }));
    expect(db.state()).toMatchObject({ plan: 'term', subscription_status: 'active', stripe_subscription_id: 'sub_new' });
    expect(db.updates.filter((u) => u.matched)).toEqual([]);
  });

  it('a terminal event for the STORED sub revokes (conditional match on the sub id)', async () => {
    const db = usersFake(termRow());
    await handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'canceled' }));
    expect(db.state()).toMatchObject({ plan: 'free', subscription_status: 'canceled', stripe_subscription_id: 'sub_1' });
    expect(db.updates[0]?.filters).toEqual({ id: 'user-1', stripe_subscription_id: 'sub_1' });
  });

  it('a late "active" for a CANCELLED stored sub does not re-grant — and says so in the log', async () => {
    const db = usersFake(termRow({ plan: 'free', subscription_status: 'canceled', plan_expires_at: new Date(Date.now() - DAY).toISOString() }));
    await handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'active' }));
    expect(db.state()).toMatchObject({ plan: 'free', subscription_status: 'canceled' });
    expect(db.updates).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/sub_1.*canceled/), expect.anything());
  });

  it('dunning → recovery: unpaid revokes access, then the SAME sub paying its invoice re-grants it', async () => {
    const db = usersFake(termRow());
    await handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'unpaid' }));
    expect(db.state()).toMatchObject({ plan: 'free', subscription_status: 'unpaid', stripe_subscription_id: 'sub_1' });

    const newEnd = NOW_SEC + 120 * 86400;
    await handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'active', items: { data: [{ current_period_end: newEnd }] } }));
    expect(db.state()).toMatchObject({
      plan: 'term',
      subscription_status: 'active',
      stripe_subscription_id: 'sub_1',
      plan_expires_at: new Date(newEnd * 1000).toISOString(),
    });
  });

  it('an "active" for a SUCCESSOR sub advances when the stored one is terminal', async () => {
    const db = usersFake(termRow({ plan: 'free', stripe_subscription_id: 'sub_old', subscription_status: 'canceled' }));
    await handleSubscriptionChange(db.client, sub({ id: 'sub_new', status: 'active' }));
    expect(db.state()).toMatchObject({ plan: 'term', subscription_status: 'active', stripe_subscription_id: 'sub_new' });
  });

  it('an "active" for a DIFFERENT sub while the stored one is live is refused and logged (duplicate term)', async () => {
    const db = usersFake(termRow({ stripe_subscription_id: 'sub_1' }));
    await handleSubscriptionChange(db.client, sub({ id: 'sub_2', status: 'active' }));
    expect(db.state()).toMatchObject({ stripe_subscription_id: 'sub_1' });
    expect(db.updates).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/sub_2/), expect.anything());
  });
});

describe('handleInvoicePaid — Basil invoice.parent.subscription_details', () => {
  it('reads the subscription id from parent.subscription_details and advances the term', async () => {
    const db = usersFake(termRow());
    const newEnd = NOW_SEC + 240 * 86400;
    const stripe = {
      subscriptions: {
        retrieve: async () => sub({ id: 'sub_1', items: { data: [{ current_period_end: newEnd }] } }),
      },
    } as unknown as Stripe;
    const invoice = {
      customer: 'cus_1',
      parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
    } as unknown as Stripe.Invoice;

    await handleInvoicePaid(db.client, stripe, invoice);

    expect(db.state()?.plan_expires_at).toBe(new Date(newEnd * 1000).toISOString());
  });
});

// ─────────────────────────────────────────────────────────────────────────
// P0-3 (webhook part) — resolved user id with no users row
// ─────────────────────────────────────────────────────────────────────────
describe('webhook — a resolved user id whose users row is gone', () => {
  function webhookApp(db: ReturnType<typeof usersFake>) {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    const stripe = {
      webhooks: { constructEvent: (body: Buffer) => JSON.parse(body.toString()) },
    } as unknown as Stripe;
    const app = express();
    app.use(createBillingWebhookRouter({ getStripe: () => stripe, getSupabaseAdmin: () => db.client }));
    return app;
  }
  const deliver = (app: express.Express, object: unknown) =>
    request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ type: 'customer.subscription.updated', data: { object } }));

  describe('with NO account_deletions record (a genuine orphan — P0-3)', () => {
    it('handleSubscriptionChange throws an operator-visible error instead of a 0-row update', async () => {
      // No row at all: the sub/customer lookups miss and the id comes from
      // subscription metadata — exactly the orphan trace.
      const db = usersFake(null);
      await expect(
        handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'active', metadata: { user_id: 'user-gone' } })),
      ).rejects.toThrow(/user-gone.*no users row/);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/no users row/), expect.anything());
      expect(db.deletionReads).toEqual(['user-gone']);
    });

    it('the webhook answers 500 (Stripe retries; the operator sees it), never a silent 200', async () => {
      const db = usersFake(null);
      const res = await deliver(webhookApp(db), sub({ id: 'sub_1', status: 'canceled', metadata: { user_id: 'user-gone' } }));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'fulfillment_failed' });
      expect(db.updates).toEqual([]);
    });
  });

  describe('with an account_deletions record (POST /account/delete ran — the sub is already cancelled)', () => {
    it('the terminal event for the cancelled sub is acknowledged with 200 and no write (no 3-day retry loop)', async () => {
      const db = usersFake(null, { deletedUserIds: ['user-gone'] });
      const res = await deliver(webhookApp(db), sub({ id: 'sub_1', status: 'canceled', metadata: { user_id: 'user-gone' } }));
      expect(res.status).toBe(200);
      expect(db.updates).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/deleted/i), expect.anything());
    });

    it('an "active" event for a deleted account is acknowledged too (advanceTermAccess path)', async () => {
      const db = usersFake(null, { deletedUserIds: ['user-gone'] });
      await expect(
        handleSubscriptionChange(db.client, sub({ id: 'sub_1', status: 'active', metadata: { user_id: 'user-gone' } })),
      ).resolves.toBeUndefined();
      expect(db.updates).toEqual([]);
    });

    it('a renewal invoice for a deleted account is acknowledged (handleInvoicePaid path)', async () => {
      const db = usersFake(null, { deletedUserIds: ['user-gone'] });
      const stripe = {
        subscriptions: { retrieve: async () => sub({ id: 'sub_1', metadata: { user_id: 'user-gone' } }) },
      } as unknown as Stripe;
      const invoice = {
        customer: 'cus_1',
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
      } as unknown as Stripe.Invoice;
      await expect(handleInvoicePaid(db.client, stripe, invoice)).resolves.toBeUndefined();
      expect(db.updates).toEqual([]);
    });
  });
});
