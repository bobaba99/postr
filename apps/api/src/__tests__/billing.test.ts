/**
 * Billing fulfillment — the core webhook logic that turns a completed
 * Stripe checkout into a plan/credit grant. Tests the domain function
 * directly with a fake Supabase so no network or DB is needed.
 *
 * The security that a client can't grant itself a plan lives in the DB
 * trigger (tested in supabase/tests/billing_plan_test.sql); this file
 * covers the webhook's own correctness: right SKU → right grant, paid-
 * only, and pack idempotency.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { fulfillCheckout } from '../billing.js';

/**
 * A fake Supabase that records `.update(...)` payloads and serves canned
 * reads. Enough surface for fulfillCheckout: users update/select, and
 * the billing_fulfilled_sessions select/insert idempotency path.
 */
function fakeSupabase(opts: {
  currentCredits?: number;
  alreadyFulfilled?: boolean;
} = {}) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

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
        select() {
          return {
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { export_credits: opts.currentCredits ?? 0 },
                  error: null,
                }),
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.alreadyFulfilled ? { session_id: 's' } : null,
                  error: null,
                }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, updates, inserts };
}

function session(overrides: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    client_reference_id: 'user-1',
    payment_status: 'paid',
    customer: 'cus_1',
    metadata: { user_id: 'user-1', sku: 'term' },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe('fulfillCheckout — term', () => {
  it('sets plan=term with a ~4-month expiry and the customer id', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(fake.client, session({ metadata: { user_id: 'user-1', sku: 'term' } }));

    expect(fake.updates).toHaveLength(1);
    const { table, payload } = fake.updates[0]!;
    expect(table).toBe('users');
    expect(payload.plan).toBe('term');
    expect(payload.stripe_customer_id).toBe('cus_1');
    // expiry is ~4 months out
    const expires = new Date(payload.plan_expires_at as string);
    const months = (expires.getFullYear() - new Date().getFullYear()) * 12 +
      (expires.getMonth() - new Date().getMonth());
    expect(months).toBeGreaterThanOrEqual(3);
    expect(months).toBeLessThanOrEqual(4);
  });
});

describe('fulfillCheckout — pack', () => {
  it('adds 3 export credits to the current balance', async () => {
    const fake = fakeSupabase({ currentCredits: 2 });
    await fulfillCheckout(
      fake.client,
      session({ metadata: { user_id: 'user-1', sku: 'pack' } }),
    );
    const usersUpdate = fake.updates.find((u) => u.table === 'users');
    expect(usersUpdate?.payload.export_credits).toBe(5); // 2 + 3
    // records the session as fulfilled (idempotency)
    expect(fake.inserts.some((i) => i.table === 'billing_fulfilled_sessions')).toBe(true);
  });

  it('is idempotent — an already-fulfilled session grants nothing', async () => {
    const fake = fakeSupabase({ currentCredits: 2, alreadyFulfilled: true });
    await fulfillCheckout(
      fake.client,
      session({ metadata: { user_id: 'user-1', sku: 'pack' } }),
    );
    expect(fake.updates).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });
});

describe('fulfillCheckout — guards', () => {
  it('does nothing for an unpaid session', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(fake.client, session({ payment_status: 'unpaid' }));
    expect(fake.updates).toHaveLength(0);
  });

  it('throws when user_id / sku metadata is missing', async () => {
    const fake = fakeSupabase();
    await expect(
      fulfillCheckout(
        fake.client,
        session({ client_reference_id: null, metadata: {} }),
      ),
    ).rejects.toThrow(/user_id \/ sku/);
  });
});
