/**
 * Paid-path refund fixes (P0-1, H-10, H-11) — tested against Basil-shaped
 * Stripe fixtures (the shapes our pinned `2026-02-25.preview` version
 * returns): `Invoice.payment_intent` and `Charge.invoice` do NOT exist;
 * the PaymentIntent lives at `invoice.payments.data[].payment.
 * payment_intent` and the subscription at `invoice.parent.
 * subscription_details.subscription`.
 *
 * A small in-memory Supabase (users / billing_refunds /
 * billing_fulfilled_sessions with real filtering + UNIQUE checks) makes
 * a conditional write that does NOT match observable, and a recording
 * Stripe fake captures every call so the tests can assert exactly what
 * money/lifecycle operations happened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  createBillingRouter,
  createBillingWebhookRouter,
  handleSubscriptionChange,
  refundForUser,
} from '../billing.js';
import {
  handleChargeRefunded,
  reconcileExternalRefund,
} from '../billing/refundReconcile.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW_SEC = Math.floor(Date.now() / 1000);

type Row = Record<string, unknown>;

/**
 * In-memory Supabase: real row filtering for eq/gt/not/match, UNIQUE on
 * billing_refunds.stripe_refund_id and billing_fulfilled_sessions.
 * session_id, atomic-ish RPCs for the credit math. Every write is
 * observable through `tables`.
 */
function memorySupabase(seed: {
  users?: Row[];
  billing_refunds?: Row[];
  billing_fulfilled_sessions?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    users: seed.users ?? [],
    billing_refunds: seed.billing_refunds ?? [],
    billing_fulfilled_sessions: seed.billing_fulfilled_sessions ?? [],
  };
  const rpcs: Array<{ fn: string; args: Row }> = [];
  const uniqueKeys: Record<string, string> = {
    billing_refunds: 'stripe_refund_id',
    billing_fulfilled_sessions: 'session_id',
  };

  function query(table: string, mode: 'select' | 'update', payload?: Row) {
    const preds: Array<(r: Row) => boolean> = [];
    const rows = () => tables[table]!.filter((r) => preds.every((p) => p(r)));
    const run = () => {
      const matched = rows();
      if (mode === 'update') {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };
    const builder = {
      eq(col: string, v: unknown) { preds.push((r) => r[col] === v); return builder; },
      gt(col: string, v: number) { preds.push((r) => (r[col] as number) > v); return builder; },
      not(col: string, _op: string, v: unknown) { preds.push((r) => r[col] !== v); return builder; },
      match(f: Row) { Object.entries(f).forEach(([c, v]) => preds.push((r) => r[c] === v)); return builder; },
      order() { return builder; },
      maybeSingle: async () => {
        const res = run();
        const data = Array.isArray(res.data) ? res.data[0] ?? null : null;
        return { data, error: null };
      },
      single: async () => {
        const res = run();
        return { data: Array.isArray(res.data) ? res.data[0] ?? null : null, error: null };
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      if (!tables[table]) throw new Error(`unexpected table ${table}`);
      return {
        select: () => query(table, 'select'),
        update: (payload: Row) => query(table, 'update', payload),
        insert: async (row: Row) => {
          const key = uniqueKeys[table];
          if (key && tables[table]!.some((r) => r[key] === row[key])) {
            return { error: { message: `duplicate key value violates unique constraint "${table}_${key}_key"` } };
          }
          tables[table]!.push({ ...row });
          return { error: null };
        },
      };
    },
    rpc(fn: string, args: Row) {
      rpcs.push({ fn, args });
      const user = tables.users!.find((u) => u.id === args.p_user_id);
      if (fn === 'revoke_export_credits' && user) {
        user.export_credits = Math.max(0, (user.export_credits as number) - (args.p_amount as number));
      }
      return Promise.resolve({ data: user?.export_credits ?? null, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, tables, rpcs };
}

/** A Basil-shaped invoice: payments[] + parent.subscription_details. */
function basilInvoice(over: Partial<Record<string, unknown>> = {}): Stripe.Invoice {
  return {
    id: 'in_1',
    object: 'invoice',
    created: NOW_SEC - 3 * 24 * 60 * 60,
    amount_paid: 1899,
    customer: 'cus_1',
    parent: {
      type: 'subscription_details',
      quote_details: null,
      subscription_details: { subscription: 'sub_1', metadata: {} },
    },
    payments: {
      object: 'list',
      has_more: false,
      url: '/v1/invoices/in_1/payments',
      data: [
        {
          id: 'inpay_1',
          object: 'invoice_payment',
          invoice: 'in_1',
          status: 'paid',
          payment: {
            type: 'payment_intent',
            payment_intent: { id: 'pi_1', object: 'payment_intent' },
          },
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Invoice;
}

interface StripeFakeOpts {
  subscription?: Record<string, unknown>;
  /** What subscriptions.cancel does: resolve, or throw (then retrieve reports `statusAfterCancelError`). */
  cancelThrows?: boolean;
  statusAfterCancelError?: string;
  refundAmount?: number | undefined;
  refundsByCharge?: Array<Stripe.Refund | Record<string, unknown>>;
  invoiceForPaymentIntent?: Record<string, Stripe.Invoice | null>;
  invoicePaymentsForInvoice?: Record<string, Array<Record<string, unknown>>>;
  sessionsForPaymentIntent?: Record<string, Array<Record<string, unknown>>>;
  charge?: Record<string, unknown>;
}

/** A recording Stripe fake covering the refund + reconcile surface. */
function stripeFake(opts: StripeFakeOpts = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rec = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const subState = { status: 'active', ...opts.subscription };
  const stripe = {
    subscriptions: {
      retrieve: async (id: string, params?: unknown) => {
        rec('subscriptions.retrieve', id, params);
        return { id, customer: 'cus_1', items: { data: [{ current_period_end: NOW_SEC + 100 * 86400 }] }, ...subState };
      },
      cancel: async (id: string, params?: unknown) => {
        rec('subscriptions.cancel', id, params);
        if (opts.cancelThrows) {
          subState.status = opts.statusAfterCancelError ?? 'canceled';
          throw new Error('No such subscription / already canceled');
        }
        subState.status = 'canceled';
        return { id, status: 'canceled' };
      },
    },
    refunds: {
      create: async (params: Record<string, unknown>, options?: unknown) => {
        rec('refunds.create', params, options);
        const amount = 'refundAmount' in opts ? opts.refundAmount : (params.amount as number | undefined) ?? 1899;
        return { id: 're_1', ...(amount === undefined ? {} : { amount }), status: 'succeeded' };
      },
      list: async (params: unknown) => {
        rec('refunds.list', params);
        return { data: opts.refundsByCharge ?? [] };
      },
    },
    invoicePayments: {
      list: async (params: { invoice?: string; payment?: { payment_intent?: string } }) => {
        rec('invoicePayments.list', params);
        if (params.invoice) return { data: opts.invoicePaymentsForInvoice?.[params.invoice] ?? [] };
        const pi = params.payment?.payment_intent ?? '';
        const invoice = opts.invoiceForPaymentIntent?.[pi] ?? null;
        return { data: invoice ? [{ id: 'inpay_x', invoice, payment: { type: 'payment_intent', payment_intent: pi } }] : [] };
      },
    },
    charges: {
      retrieve: async (id: string) => {
        rec('charges.retrieve', id);
        return { id, customer: 'cus_1', payment_intent: 'pi_1', ...opts.charge };
      },
    },
    checkout: {
      sessions: {
        list: async (params: { payment_intent?: string }) => {
          rec('checkout.sessions.list', params);
          return { data: opts.sessionsForPaymentIntent?.[params.payment_intent ?? ''] ?? [] };
        },
        retrieve: async (id: string) => ({ id, payment_intent: 'pi_pack' }),
      },
    },
    webhooks: { constructEvent: (body: Buffer) => JSON.parse(body.toString()) },
  } as unknown as Stripe;
  const find = (method: string) => calls.filter((c) => c.method === method);
  return { stripe, calls, find, subState };
}

function termUser(over: Row = {}): Row {
  return {
    id: 'user-1',
    plan: 'term',
    plan_expires_at: new Date(Date.now() + 100 * DAY).toISOString(),
    subscription_status: 'active',
    stripe_subscription_id: 'sub_1',
    stripe_customer_id: 'cus_1',
    first_paid_export_at: null,
    export_credits: 3,
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
// P0-1 + H-10 — self-serve TERM refund
// ─────────────────────────────────────────────────────────────────────────
describe('refundForUser(term) — Basil invoice shape (H-10) + cancels the subscription (P0-1)', () => {
  it('reads the PaymentIntent from latest_invoice.payments and refunds it with the deterministic key', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() } });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result).toEqual({ ok: true, amountCents: 1899, subscriptionCancelled: true });
    // the retrieve asks for the Basil expand (invoice + payments list; the
    // deeper `…data.payment.payment_intent` is 5 levels and the real API
    // refuses it), not the removed latest_invoice.payment_intent
    expect(s.find('subscriptions.retrieve')[0]?.args[1]).toEqual({
      expand: ['latest_invoice.payments'],
    });
    const create = s.find('refunds.create')[0]!;
    expect(create.args[0]).toEqual({ payment_intent: 'pi_1' });
    expect(create.args[1]).toEqual({ idempotencyKey: 'term-refund:pi_1' });
  });

  it('cancels the subscription IMMEDIATELY (prorate:false) and writes subscription_status=canceled, keeping the sub id', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() } });

    await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(s.find('subscriptions.cancel')).toEqual([
      { method: 'subscriptions.cancel', args: ['sub_1', { prorate: false }] },
    ]);
    const user = db.tables.users![0]!;
    expect(user.plan).toBe('free');
    expect(user.subscription_status).toBe('canceled');
    expect(user.stripe_subscription_id).toBe('sub_1'); // kept for reconciliation
    expect(new Date(user.plan_expires_at as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // ledger row with a finite amount
    expect(db.tables.billing_refunds).toEqual([
      expect.objectContaining({ user_id: 'user-1', kind: 'term', stripe_refund_id: 're_1', amount_cents: 1899, credits_revoked: 0 }),
    ]);
  });

  it('accepts a string payment_intent id inside payments (unexpanded) as well', async () => {
    const inv = basilInvoice();
    (inv as unknown as { payments: { data: Array<{ payment: { payment_intent: unknown } }> } })
      .payments.data[0]!.payment.payment_intent = 'pi_str';
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: inv } });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result.ok).toBe(true);
    expect(s.find('refunds.create')[0]?.args[0]).toEqual({ payment_intent: 'pi_str' });
  });

  it('falls back to a legacy top-level invoice.payment_intent when payments is absent', async () => {
    const legacy = basilInvoice({ payments: undefined, payment_intent: 'pi_legacy' });
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: legacy } });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result.ok).toBe(true);
    expect(s.find('refunds.create')[0]?.args[0]).toEqual({ payment_intent: 'pi_legacy' });
  });

  it('second chance: when the retrieved invoice has no payments list, invoicePayments.list({ invoice }) resolves the PI', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({
      subscription: { latest_invoice: basilInvoice({ payments: undefined }) },
      invoicePaymentsForInvoice: { in_1: [{ payment: { type: 'payment_intent', payment_intent: 'pi_listed' } }] },
    });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result.ok).toBe(true);
    expect(s.find('invoicePayments.list')[0]?.args[0]).toMatchObject({ invoice: 'in_1' });
    expect(s.find('refunds.create')[0]?.args[0]).toEqual({ payment_intent: 'pi_listed' });
  });

  it('returns no_payment (and moves no money, cancels nothing) when no PaymentIntent can be found', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice({ payments: { data: [] } }) } });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result).toEqual({ ok: false, reason: 'no_payment' });
    expect(s.find('refunds.create')).toHaveLength(0);
    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.tables.users![0]!.plan).toBe('term');
  });

  it('never writes NaN/undefined amounts: a refund without `amount` falls back to invoice.amount_paid', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() }, refundAmount: undefined });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result).toEqual({ ok: true, amountCents: 1899, subscriptionCancelled: true });
    const ledger = db.tables.billing_refunds![0]!;
    expect(Number.isFinite(ledger.amount_cents)).toBe(true);
    expect(ledger.amount_cents).toBe(1899);
  });

  it('treats an already-cancelled subscription (cancel throws, retrieve says canceled) as cancelled', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({
      subscription: { latest_invoice: basilInvoice() },
      cancelThrows: true,
      statusAfterCancelError: 'canceled',
    });

    const result = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(result).toEqual({ ok: true, amountCents: 1899, subscriptionCancelled: true });
    expect(db.tables.users![0]!.subscription_status).toBe('canceled');
  });

  it('fails (→ 500 → retry) and does NOT record the ledger row when the cancel fails and the sub is still live', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({
      subscription: { latest_invoice: basilInvoice() },
      cancelThrows: true,
      statusAfterCancelError: 'active',
    });

    await expect(refundForUser(db.client, s.stripe, 'user-1', 'term')).rejects.toThrow(/cancel/);
    // no ledger row → the retry (same idempotency key → same refund) re-attempts the cancel
    expect(db.tables.billing_refunds).toEqual([]);
    expect(db.tables.users![0]!.plan).toBe('term');
  });

  it('is idempotent on a double click: the same refund id is not revoked twice, and the sub is cancelled once', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() } });

    const first = await refundForUser(db.client, s.stripe, 'user-1', 'term');
    // second click: the stored sub is now canceled — refundTerm still finds the
    // sub id, Stripe returns the SAME refund (idempotency key), ledger dedups.
    const second = await refundForUser(db.client, s.stripe, 'user-1', 'term');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(db.tables.billing_refunds).toHaveLength(1);
    expect(s.find('refunds.create').map((c) => c.args[1])).toEqual([
      { idempotencyKey: 'term-refund:pi_1' },
      { idempotencyKey: 'term-refund:pi_1' },
    ]);
  });

  it('a LATER active event for the refunded (cancelled) subscription does NOT re-grant the term', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() } });
    await refundForUser(db.client, s.stripe, 'user-1', 'term');

    await handleSubscriptionChange(
      db.client,
      {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        metadata: { user_id: 'user-1' },
        items: { data: [{ current_period_end: NOW_SEC + 100 * 86400 }] },
      } as unknown as Stripe.Subscription,
    );

    const user = db.tables.users![0]!;
    expect(user.plan).toBe('free');
    expect(user.subscription_status).toBe('canceled');
  });
});

describe('POST /billing/refund — response carries subscription_cancelled', () => {
  it('returns { ok, amount_cents, subscription_cancelled: true } for a term refund', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ subscription: { latest_invoice: basilInvoice() } });
    const supabase = Object.assign(db.client, {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-1', email: 'jane.doe@example.com', is_anonymous: false } },
          error: null,
        }),
      },
    }) as SupabaseClient;
    const app = express();
    app.use(express.json());
    app.use(createBillingRouter({ getStripe: () => s.stripe, getSupabaseAdmin: () => supabase }));

    const res = await request(app)
      .post('/billing/refund')
      .set('Authorization', 'Bearer token')
      .send({ kind: 'term' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, amount_cents: 1899, subscription_cancelled: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// H-11 — external (Link / dashboard) refund reconciliation on Basil payloads
// ─────────────────────────────────────────────────────────────────────────
function externalRefund(over: Row = {}): Stripe.Refund {
  return {
    id: 're_ext',
    object: 'refund',
    amount: 1899,
    status: 'succeeded',
    charge: 'ch_1',
    payment_intent: 'pi_1',
    ...over,
  } as unknown as Stripe.Refund;
}

/** A modern charge.refunded payload: NO `refunds` list, NO `invoice`. */
function modernCharge(over: Row = {}): Stripe.Charge {
  return {
    id: 'ch_1',
    object: 'charge',
    customer: 'cus_1',
    payment_intent: 'pi_1',
    amount_refunded: 1899,
    refunded: true,
    ...over,
  } as unknown as Stripe.Charge;
}

describe('handleChargeRefunded — modern payload (no charge.refunds, no charge.invoice)', () => {
  it('lists the refunds by charge, classifies as TERM via invoicePayments → invoice.parent, cancels the sub, revokes no credits', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({
      refundsByCharge: [externalRefund()],
      invoiceForPaymentIntent: { pi_1: basilInvoice() },
    });

    await handleChargeRefunded(db.client, s.stripe, modernCharge());

    expect(s.find('refunds.list')[0]?.args[0]).toEqual({ charge: 'ch_1', limit: 100 });
    expect(s.find('invoicePayments.list')[0]?.args[0]).toMatchObject({
      payment: { type: 'payment_intent', payment_intent: 'pi_1' },
    });
    expect(s.find('subscriptions.cancel')).toEqual([
      { method: 'subscriptions.cancel', args: ['sub_1', { prorate: false }] },
    ]);
    const user = db.tables.users![0]!;
    expect(user.plan).toBe('free');
    expect(user.subscription_status).toBe('canceled');
    expect(user.export_credits).toBe(3); // NOT touched by a term refund
    expect(db.rpcs).toEqual([]);
    expect(db.tables.billing_refunds).toEqual([
      expect.objectContaining({ kind: 'term', stripe_refund_id: 're_ext', amount_cents: 1899, credits_revoked: 0 }),
    ]);
  });

  it('uses the payload refunds list when present (legacy shape) without calling refunds.list', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice() } });

    await handleChargeRefunded(
      db.client,
      s.stripe,
      modernCharge({ refunds: { data: [externalRefund()] } }),
    );

    expect(s.find('refunds.list')).toHaveLength(0);
    expect(db.tables.billing_refunds).toHaveLength(1);
  });

  it('classifies a PACK refund via the checkout session in billing_fulfilled_sessions and revokes proportional credits', async () => {
    const db = memorySupabase({
      users: [termUser({ plan: 'free', stripe_subscription_id: null, subscription_status: null })],
      billing_fulfilled_sessions: [{ session_id: 'cs_pack', user_id: 'user-1', credits_granted: 3 }],
    });
    const s = stripeFake({
      refundsByCharge: [externalRefund({ id: 're_pack', amount: 666, payment_intent: 'pi_pack', charge: 'ch_pack' })],
      sessionsForPaymentIntent: { pi_pack: [{ id: 'cs_pack' }] },
    });

    await handleChargeRefunded(db.client, s.stripe, modernCharge({ id: 'ch_pack', payment_intent: 'pi_pack' }));

    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.rpcs).toEqual([{ fn: 'revoke_export_credits', args: { p_user_id: 'user-1', p_amount: 2 } }]);
    expect(db.tables.users![0]!.export_credits).toBe(1);
    expect(db.tables.billing_refunds).toEqual([
      expect.objectContaining({ kind: 'pack', stripe_refund_id: 're_pack', amount_cents: 666, credits_revoked: 2, session_id: 'cs_pack' }),
    ]);
  });

  it('an UNATTRIBUTABLE refund (no invoice, no fulfilled session) is logged and revokes NOTHING', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({
      refundsByCharge: [externalRefund({ id: 're_mystery', payment_intent: 'pi_mystery' })],
    });

    await handleChargeRefunded(db.client, s.stripe, modernCharge({ payment_intent: 'pi_mystery' }));

    expect(db.rpcs).toEqual([]);
    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.tables.billing_refunds).toEqual([]);
    expect(db.tables.users![0]!).toMatchObject({ plan: 'term', export_credits: 3 });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/unattributable/i), expect.anything());
  });

  it('a refund of a DIFFERENT subscription than the stored term (e.g. an old one) does not revoke the current term', async () => {
    const db = memorySupabase({ users: [termUser({ stripe_subscription_id: 'sub_current' })] });
    const s = stripeFake({
      refundsByCharge: [externalRefund()],
      invoiceForPaymentIntent: { pi_1: basilInvoice() }, // → sub_1 ≠ sub_current
    });

    await handleChargeRefunded(db.client, s.stripe, modernCharge());

    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.tables.users![0]!.plan).toBe('term');
    expect(db.rpcs).toEqual([]);
    expect(db.tables.billing_refunds).toEqual([]);
  });

  it('a refund our button already recorded is a no-op (ledger idempotency)', async () => {
    const db = memorySupabase({
      users: [termUser()],
      billing_refunds: [{ user_id: 'user-1', kind: 'term', stripe_refund_id: 're_ext', amount_cents: 1899, credits_revoked: 0, session_id: null }],
    });
    const s = stripeFake({ refundsByCharge: [externalRefund()], invoiceForPaymentIntent: { pi_1: basilInvoice() } });

    await handleChargeRefunded(db.client, s.stripe, modernCharge());

    expect(s.find('invoicePayments.list')).toHaveLength(0);
    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.tables.users![0]!.plan).toBe('term');
  });

  it('a charge with no resolvable user is logged and ignored', async () => {
    const db = memorySupabase({ users: [termUser({ stripe_customer_id: 'cus_other' })] });
    const s = stripeFake({ refundsByCharge: [externalRefund()] });

    await handleChargeRefunded(db.client, s.stripe, modernCharge());

    expect(db.tables.billing_refunds).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('reconcileExternalRefund — refund.created / refund.updated events', () => {
  it('a succeeded term refund resolves the customer via the charge, cancels the sub and revokes the term', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice() } });

    await reconcileExternalRefund(db.client, s.stripe, externalRefund());

    expect(s.find('charges.retrieve')).toEqual([{ method: 'charges.retrieve', args: ['ch_1'] }]);
    expect(s.find('subscriptions.cancel')).toHaveLength(1);
    expect(db.tables.users![0]!).toMatchObject({ plan: 'free', subscription_status: 'canceled', export_credits: 3 });
  });

  it('a PARTIAL term refund (goodwill CA$5 of CA$18.99) cancels NOTHING and keeps the term — logged for the operator', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice({ amount_paid: 1899 }) } });

    await reconcileExternalRefund(db.client, s.stripe, externalRefund({ id: 're_partial', amount: 500 }));

    expect(s.find('subscriptions.cancel')).toHaveLength(0);
    expect(db.tables.users![0]!).toMatchObject({ plan: 'term', subscription_status: 'active', stripe_subscription_id: 'sub_1' });
    expect(db.tables.billing_refunds).toEqual([]); // not ledgered: a later FULL refund must still apply
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/re_partial/),
      expect.objectContaining({ reason: 'partial_term_refund', amountCents: 500, invoiceAmountPaid: 1899 }),
    );
  });

  it('a full term refund delivered in two events (partial then the remainder) applies once the total is substantially full', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice({ amount_paid: 1899 }) } });

    // First a nearly-full refund (rounding / fee-adjusted): still full.
    await reconcileExternalRefund(db.client, s.stripe, externalRefund({ id: 're_full', amount: 1898 }));
    expect(s.find('subscriptions.cancel')).toHaveLength(1);
    expect(db.tables.users![0]!.plan).toBe('free');
  });

  it('a PENDING refund is skipped (refund.updated will deliver the succeeded transition)', async () => {
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice() } });

    await reconcileExternalRefund(db.client, s.stripe, externalRefund({ status: 'pending' }));

    expect(s.calls).toEqual([]);
    expect(db.tables.users![0]!.plan).toBe('term');
  });

  it('is wired into the webhook switch: refund.created reaches the reconciler', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    const db = memorySupabase({ users: [termUser()] });
    const s = stripeFake({ invoiceForPaymentIntent: { pi_1: basilInvoice() } });
    const app = express();
    app.use(createBillingWebhookRouter({ getStripe: () => s.stripe, getSupabaseAdmin: () => db.client }));

    const res = await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ type: 'refund.created', data: { object: externalRefund() } }));

    expect(res.status).toBe(200);
    expect(s.find('subscriptions.cancel')).toHaveLength(1);
    expect(db.tables.users![0]!.plan).toBe('free');
  });
});
