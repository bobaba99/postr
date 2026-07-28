/**
 * Billing fulfillment — the core webhook logic that turns a completed
 * Stripe checkout into a plan/credit grant. Tests the domain function
 * directly with a fake Supabase + fake Stripe so no network or DB is needed.
 *
 * The security that a client can't grant itself a plan lives in the DB
 * trigger (tested in supabase/tests/billing_plan_test.sql); this file
 * covers the webhook's own correctness: term = subscription (derives the
 * expiry from the subscription's item-level period end), pack = one-time
 * credits (paid-only + idempotent), and the guards.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  fulfillCheckout,
  subscriptionPeriodEnd,
  handleInvoicePaid,
  handleSubscriptionChange,
} from '../billing.js';

/**
 * A fake Supabase that records `.update(...)` payloads and serves canned
 * reads. Enough surface for fulfillCheckout: users update, users select
 * (the pack credit read + the term forward-only expiry read), and the
 * billing_fulfilled_sessions select/insert idempotency path.
 */
function fakeSupabase(opts: {
  currentCredits?: number;
  currentExpiry?: string | null;
  alreadyFulfilled?: boolean;
  /** The user id the reconciliation lookup should resolve to (by sub/customer). */
  lookupUserId?: string | null;
} = {}) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        select(cols?: string) {
          const selectingId = cols === 'id';
          return {
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { export_credits: opts.currentCredits ?? 0 },
                  error: null,
                }),
              maybeSingle: () =>
                Promise.resolve({
                  data: selectingId
                    ? // reconciliation lookup by sub/customer id
                      opts.lookupUserId
                      ? { id: opts.lookupUserId }
                      : null
                    : table === 'billing_fulfilled_sessions'
                      ? opts.alreadyFulfilled
                        ? { session_id: 's' }
                        : null
                      : { plan_expires_at: opts.currentExpiry ?? null },
                  error: null,
                }),
            }),
          };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: (opts.currentCredits ?? 0) + 3, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, updates, inserts, rpcs };
}

/** Build a fake Stripe.Subscription with an item-level period end. */
function fakeSub(overrides: Partial<Stripe.Subscription> & { periodEndSec?: number } = {}): Stripe.Subscription {
  const periodEndSec = overrides.periodEndSec ?? unixDaysFromNow(120);
  return {
    id: overrides.id ?? 'sub_1',
    status: overrides.status ?? 'active',
    customer: overrides.customer ?? 'cus_1',
    metadata: overrides.metadata ?? { user_id: 'user-1' },
    items: { data: [{ current_period_end: periodEndSec }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

/** Unix seconds for a date N days from now. */
function unixDaysFromNow(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

/**
 * A fake Stripe whose subscriptions.retrieve returns a subscription with an
 * item-level current_period_end (the Basil-era location).
 */
function fakeStripe(sub: Partial<Stripe.Subscription> & { periodEndSec?: number }) {
  const periodEndSec = sub.periodEndSec ?? unixDaysFromNow(120);
  const subscription = {
    id: sub.id ?? 'sub_1',
    status: sub.status ?? 'active',
    customer: sub.customer ?? 'cus_1',
    items: { data: [{ current_period_end: periodEndSec }] },
    ...sub,
  } as unknown as Stripe.Subscription;
  return {
    subscriptions: {
      retrieve: () => Promise.resolve(subscription),
    },
  } as unknown as Stripe;
}

function session(overrides: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    client_reference_id: 'user-1',
    status: 'complete',
    payment_status: 'paid',
    mode: 'subscription',
    subscription: 'sub_1',
    customer: 'cus_1',
    metadata: { user_id: 'user-1', sku: 'term' },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe('subscriptionPeriodEnd', () => {
  it('reads the item-level current_period_end', () => {
    const end = unixDaysFromNow(90);
    const sub = { id: 'sub_x', items: { data: [{ current_period_end: end }] } } as unknown as Stripe.Subscription;
    expect(subscriptionPeriodEnd(sub)).toBe(end);
  });

  it('fails hard when the item-level period end is absent (never returns a bad value)', () => {
    // Simulate a naive read of the removed top-level field: items empty.
    const sub = { id: 'sub_x', items: { data: [] } } as unknown as Stripe.Subscription;
    expect(() => subscriptionPeriodEnd(sub)).toThrow(/current_period_end/);
  });
});

describe('fulfillCheckout — term (subscription)', () => {
  it('sets plan=term, expiry from the subscription period end, status, sub id, customer', async () => {
    const fake = fakeSupabase();
    const periodEnd = unixDaysFromNow(120);
    await fulfillCheckout(
      fake.client,
      fakeStripe({ id: 'sub_1', status: 'active', periodEndSec: periodEnd }),
      session({ metadata: { user_id: 'user-1', sku: 'term' } }),
    );

    expect(fake.updates).toHaveLength(1);
    const { table, payload } = fake.updates[0]!;
    expect(table).toBe('users');
    expect(payload.plan).toBe('term');
    expect(payload.subscription_status).toBe('active');
    expect(payload.stripe_subscription_id).toBe('sub_1');
    expect(payload.stripe_customer_id).toBe('cus_1');
    // expiry equals the subscription's item-level period end (not +4mo math)
    expect(payload.plan_expires_at).toBe(new Date(periodEnd * 1000).toISOString());
  });

  it('is forward-only: a stale (earlier) period end does not move expiry backward', async () => {
    const laterIso = new Date(unixDaysFromNow(200) * 1000).toISOString();
    const fake = fakeSupabase({ currentExpiry: laterIso });
    await fulfillCheckout(
      fake.client,
      fakeStripe({ periodEndSec: unixDaysFromNow(50) }), // earlier than stored
      session({}),
    );
    const { payload } = fake.updates[0]!;
    // keeps the later stored expiry, does not regress it
    expect(payload.plan_expires_at).toBe(laterIso);
  });

  it('throws (→ retry) when the subscription has no item-level period end', async () => {
    const fake = fakeSupabase();
    const badStripe = {
      subscriptions: {
        retrieve: () =>
          Promise.resolve({ id: 'sub_1', status: 'active', customer: 'cus_1', items: { data: [] } } as unknown as Stripe.Subscription),
      },
    } as unknown as Stripe;
    await expect(fulfillCheckout(fake.client, badStripe, session({}))).rejects.toThrow(
      /current_period_end/,
    );
  });

  it('does nothing for an incomplete subscription session', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ status: 'open', payment_status: 'unpaid' }),
    );
    expect(fake.updates).toHaveLength(0);
  });
});

describe('fulfillCheckout — pack (one-time)', () => {
  it('grants 3 export credits atomically via the RPC', async () => {
    const fake = fakeSupabase({ currentCredits: 2 });
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, metadata: { user_id: 'user-1', sku: 'pack' } }),
    );
    const grant = fake.rpcs.find((r) => r.fn === 'grant_export_credits');
    expect(grant).toBeTruthy();
    expect(grant?.args).toEqual({ p_user_id: 'user-1', p_amount: 3 });
    expect(fake.inserts.some((i) => i.table === 'billing_fulfilled_sessions')).toBe(true);
  });

  it('is idempotent — an already-fulfilled session grants nothing', async () => {
    const fake = fakeSupabase({ currentCredits: 2, alreadyFulfilled: true });
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, metadata: { user_id: 'user-1', sku: 'pack' } }),
    );
    expect(fake.rpcs).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it('does nothing for an unpaid pack session', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, payment_status: 'unpaid', metadata: { user_id: 'user-1', sku: 'pack' } }),
    );
    expect(fake.updates).toHaveLength(0);
    expect(fake.rpcs).toHaveLength(0);
  });
});

describe('fulfillCheckout — guards', () => {
  it('throws when user_id / sku metadata is missing', async () => {
    const fake = fakeSupabase();
    await expect(
      fulfillCheckout(
        fake.client,
        fakeStripe({}),
        session({ client_reference_id: null, metadata: {} }),
      ),
    ).rejects.toThrow(/user_id \/ sku/);
  });
});

describe('handleInvoicePaid — renewal', () => {
  it('extends plan_expires_at to the new period end and keeps plan=term', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    const newEnd = unixDaysFromNow(120);
    const stripe = {
      subscriptions: { retrieve: () => Promise.resolve(fakeSub({ id: 'sub_1', status: 'active', periodEndSec: newEnd })) },
    } as unknown as Stripe;
    const invoice = { subscription: 'sub_1', customer: 'cus_1' } as unknown as Stripe.Invoice;
    await handleInvoicePaid(fake.client, stripe, invoice);

    const { payload } = fake.updates[0]!;
    expect(payload.plan).toBe('term');
    expect(payload.subscription_status).toBe('active');
    expect(payload.plan_expires_at).toBe(new Date(newEnd * 1000).toISOString());
  });

  it('ignores an invoice with no subscription (a one-time pack invoice)', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    const stripe = { subscriptions: { retrieve: () => Promise.reject(new Error('should not be called')) } } as unknown as Stripe;
    await handleInvoicePaid(fake.client, stripe, { customer: 'cus_1' } as unknown as Stripe.Invoice);
    expect(fake.updates).toHaveLength(0);
  });
});

describe('handleSubscriptionChange — status transitions', () => {
  it('cancel-at-period-end (status active) KEEPS term access', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(
      fake.client,
      fakeSub({ status: 'active', cancel_at_period_end: true } as Partial<Stripe.Subscription>),
    );
    const { payload } = fake.updates[0]!;
    expect(payload.plan).toBe('term'); // still entitled until the period lapses
  });

  it('past_due KEEPS access (dunning window — do not revoke early)', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(fake.client, fakeSub({ status: 'past_due' }));
    const { payload } = fake.updates[0]!;
    expect(payload.plan).toBe('term');
    expect(payload.subscription_status).toBe('past_due');
  });

  it('deleted / canceled REVOKES access, keeping plan and expiry consistent', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(fake.client, fakeSub({ status: 'canceled' }));
    const { payload } = fake.updates[0]!;
    expect(payload.plan).toBe('free');
    expect(payload.subscription_status).toBe('canceled');
    // expiry set to now (past) so no code path grants access
    expect(new Date(payload.plan_expires_at as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('unpaid (terminal) also revokes', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(fake.client, fakeSub({ status: 'unpaid' }));
    expect(fake.updates[0]!.payload.plan).toBe('free');
  });

  it('reconciles the user by subscription id (lookup resolves)', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-42' });
    await handleSubscriptionChange(fake.client, fakeSub({ id: 'sub_9', status: 'canceled', metadata: {} }));
    // it updated a row (found the user); no throw
    expect(fake.updates).toHaveLength(1);
  });

  it('throws when the user cannot be reconciled (→ 500 → Stripe retry)', async () => {
    const fake = fakeSupabase({ lookupUserId: null });
    await expect(
      handleSubscriptionChange(fake.client, fakeSub({ id: 'sub_x', status: 'canceled', customer: null as unknown as string, metadata: {} })),
    ).rejects.toThrow(/no user for subscription/);
  });
});
