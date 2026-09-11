/**
 * Billing — Stripe Managed Payments (a Merchant of Record).
 *
 * Four paid products:
 *   - Term:  $18.99, a recurring subscription (4-month cadence), unlocks
 *     unlimited editable exports.
 *   - Pack:  $9.99 one-time, grants 3 export credits (consumable).
 *   - Review pack:  one-time, grants REVIEW_PACK_CREDITS presentation-
 *     review credits (consumable, never expire).
 *   - Review add-on:  a recurring add-on subscription granting a weekly
 *     presentation-review quota (the 7-day window is enforced in
 *     review.ts, not here).
 * The two review SKUs are DORMANT while the Presentation Checker is
 * deactivated: create-checkout refuses them unless FEATURE_REVIEW is on
 * (features.ts), regardless of the STRIPE_PRICE_REVIEW_* env. Their
 * webhook fulfilment branches below are NOT gated, so anything sold
 * before the switch keeps reconciling.
 * Review-SKU refunds are handled MANUALLY via the Stripe dashboard
 * (deferred — Presentation Checker plan D8); the self-serve
 * /billing/refund route covers term and export pack only.
 *
 * Managed Payments makes Stripe the merchant of record, so Stripe files
 * and remits tax worldwide. That requires:
 *   - an eligible product tax_code on each product,
 *   - `managed_payments[enabled] = true` on the Checkout Session,
 *   - the `2026-02-25.preview` (or later) Stripe API version header.
 *
 * The plan/credits columns on public.users are SERVER-OWNED (a DB
 * trigger rejects any non-service_role write — see
 * 20260728120000_billing_plan.sql and the review-column migration). This
 * webhook, running with the service_role key, is the ONLY writer. A
 * client can start a checkout but can never grant itself a plan.
 *
 * Provider swap note: this is wired for the Stripe SANDBOX for testing;
 * flipping to production is only an env-var change (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, the price ids) — no code change.
 */
import express, { type Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, type AuthLocals } from './auth.js';
import { getStripe as defaultGetStripe } from './stripeClient.js';
import { getSupabaseAdmin as defaultGetSupabaseAdmin } from './supabaseAdmin.js';
import { createRateLimiter } from './rateLimit.js';
import { isSkuSellable, readFeatureFlags, type FeatureFlags } from './features.js';
import {
  PACK_EXPORT_CREDITS,
  finiteCents,
  type RefundKind,
  type RefundResult,
} from './billing/constants.js';
import {
  TERM_ACTIVE_STATUSES,
  canRevokeTerm,
  hasActiveTerm,
  termAdvanceDecision,
  type TermRow,
} from './billing/subscriptionGuard.js';
import { readTermRow } from './billing/termRow.js';
import { cancelSubscriptionImmediately } from './billing/termCancel.js';
import {
  LATEST_INVOICE_PAYMENT_INTENT_EXPAND,
  findPaymentIntentIdForInvoice,
  subscriptionIdFromInvoice,
} from './billing/invoicePayments.js';
import { recordRefundAndRevoke } from './billing/refundLedger.js';
import { refundPack } from './billing/packRefund.js';
import {
  handleChargeRefunded,
  reconcileExternalRefund,
} from './billing/refundReconcile.js';

export type { RefundKind, RefundResult } from './billing/constants.js';

// The Stripe client (and its Managed Payments API-version pin) lives in
// stripeClient.ts, shared with account.ts; the service_role Supabase
// client in supabaseAdmin.ts.

/** The SKUs the client can ask to buy. */
export type BillingSku = 'term' | 'pack' | 'review_pack' | 'review_addon';

/** How many review credits a review-pack purchase grants. Placeholder —
 * repriced from Phase-0 token-cost numbers in Task 28. */
const REVIEW_PACK_CREDITS = 3;
/** Buyer's-remorse refund window for the term (days). 14 = EU/UK legal floor. */
const TERM_REFUND_WINDOW_DAYS = 14;
// The term's 4-month cadence now lives in the Stripe recurring price
// (interval_count=4 months), not here — Stripe drives the billing period
// and the webhook derives plan_expires_at from the subscription.

interface BillingDeps {
  getStripe?: () => Stripe | null;
  getSupabaseAdmin?: () => SupabaseClient | null;
  /** Feature switches (features.ts); read from the env when omitted. */
  features?: FeatureFlags;
}

/**
 * The webhook router — mounted BEFORE express.json() so the Stripe
 * signature can be verified against the raw request bytes. It applies
 * its own express.raw() to the one webhook route.
 */
export function createBillingWebhookRouter(deps: BillingDeps = {}): Router {
  const getStripe = deps.getStripe ?? defaultGetStripe;
  const getSupabaseAdmin = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const router = express.Router();

  router.post(
    '/billing/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const supabase = getSupabaseAdmin();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!stripe || !supabase || !webhookSecret) {
        // Misconfiguration — 500 so Stripe retries once the env is set,
        // rather than a 2xx that would drop the event silently.
        return res.status(500).json({ error: 'billing_not_configured' });
      }

      const signature = req.header('stripe-signature');
      if (!signature) {
        return res.status(400).json({ error: 'missing_signature' });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          signature,
          webhookSecret,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'bad_signature';
        // eslint-disable-next-line no-console
        console.error('[billing] webhook signature verification failed:', message);
        return res.status(400).json({ error: 'invalid_signature' });
      }

      try {
        // Fulfill on a completed checkout AND on a delayed-settlement
        // success. For synchronous (card) payments `checkout.session.
        // completed` already arrives with payment_status = 'paid'. For an
        // async method (e.g. a bank debit that Managed Payments may offer),
        // `completed` can arrive UNPAID and the money confirms later via
        // `async_payment_succeeded` — without handling that event those
        // orders would never fulfill. fulfillCheckout guards on
        // payment_status === 'paid' and is idempotent, so handling both is
        // safe: the unpaid `completed` is a no-op, the later success grants.
        if (
          event.type === 'checkout.session.completed' ||
          event.type === 'checkout.session.async_payment_succeeded'
        ) {
          await fulfillCheckout(
            supabase,
            stripe,
            event.data.object as Stripe.Checkout.Session,
          );
        } else if (event.type === 'invoice.paid') {
          // A term renewal (fires on the first invoice AND every 4-month
          // renewal). Extend the user's access to the new period end.
          await handleInvoicePaid(
            supabase,
            stripe,
            event.data.object as Stripe.Invoice,
          );
        } else if (
          event.type === 'customer.subscription.updated' ||
          event.type === 'customer.subscription.deleted'
        ) {
          // Status change: cancel-at-period-end, past_due, reactivation,
          // and final deletion all flow through here. The event object IS
          // the subscription (no retrieve needed).
          await handleSubscriptionChange(
            supabase,
            event.data.object as Stripe.Subscription,
          );
        } else if (event.type === 'charge.refunded') {
          // A refund happened — possibly via OUR button, possibly via Link
          // (Managed Payments = Stripe is MoR, so a customer can be refunded
          // directly by Link). Reconcile it into our DB so a Link-side
          // refund also revokes entitlement. Idempotent on stripe_refund_id,
          // so a refund our button already recorded is a no-op here.
          // (billing/refundReconcile.ts — Basil-shaped payloads.)
          await handleChargeRefunded(
            supabase,
            stripe,
            event.data.object as Stripe.Charge,
          );
        } else if (
          event.type === 'refund.created' ||
          event.type === 'refund.updated'
        ) {
          // The modern refund events carry the Refund itself (charge.
          // refunded no longer embeds the refunds list). Same reconciler,
          // same ledger idempotency — whichever event arrives first wins,
          // the rest are no-ops.
          await reconcileExternalRefund(
            supabase,
            stripe,
            event.data.object as Stripe.Refund,
          );
        }
        // Every other event type (including async_payment_failed) is
        // acknowledged (2xx) so Stripe stops retrying — we act only on the
        // events handled above.
        return res.json({ received: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'fulfillment_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] fulfillment failed:', message);
        // 500 → Stripe retries; fulfillCheckout is idempotent so a retry
        // after a partial failure is safe.
        return res.status(500).json({ error: 'fulfillment_failed' });
      }
    },
  );

  return router;
}

/**
 * The authed billing routes — mounted AFTER express.json() so create-
 * checkout can read the parsed JSON body.
 */
export function createBillingRouter(deps: BillingDeps = {}): Router {
  const getStripe = deps.getStripe ?? defaultGetStripe;
  const getSupabaseAdmin = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const features = deps.features ?? readFeatureFlags();
  const router = express.Router();

  // Per-user rate limits on the authed billing routes, matching the
  // import/narrative stack. No money moves here (that's Stripe's hosted
  // page) and credits are server-owned, so this only bounds session-spam
  // and RPC hammering — modest limits are enough. The webhook is
  // deliberately NOT limited: it's signature-gated, not per-user.
  const checkoutLimiter = createRateLimiter({ maxPerWindow: 10, maxPerDay: 40 });
  const consumeLimiter = createRateLimiter({ maxPerWindow: 30, maxPerDay: 200 });

  // ── Create a checkout session for the signed-in user.
  router.post(
    '/billing/create-checkout',
    requireAuth(getSupabaseAdmin, { requirePermanent: true }),
    checkoutLimiter,
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const supabase = getSupabaseAdmin();
      if (!stripe || !supabase) {
        return res.status(500).json({ error: 'billing_not_configured' });
      }

      const sku = req.body?.sku as BillingSku | undefined;
      // A hidden SKU (the review pair while FEATURE_REVIEW is off) is
      // refused exactly like an unknown one — before the price lookup,
      // so a configured STRIPE_PRICE_REVIEW_* id cannot sell it.
      const priceId =
        sku && isSkuSellable(sku, features) ? priceIdForSku(sku) : null;
      if (!sku || !priceId) {
        return res.status(400).json({
          error: 'invalid_sku',
          message:
            'sku must be one of the plans currently on sale ("term" or "pack"), and its price id env var must be set.',
        });
      }

      const user = (res.locals as AuthLocals).user;
      const successUrl = billingUrl('success');
      const cancelUrl = billingUrl('cancel');

      // The caller's billing row: the duplicate-term guard and the Stripe
      // customer to reuse. Read errors fail CLOSED (a second term must
      // never be sold on a guess), with the generic checkout_failed code.
      const { data: billingRow, error: rowErr } = await supabase
        .from('users')
        .select('plan, plan_expires_at, subscription_status, stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      if (rowErr) {
        // eslint-disable-next-line no-console
        console.error('[billing] create-checkout plan read failed:', rowErr.message);
        return res.status(500).json({ error: 'checkout_failed' });
      }
      const row = billingRow as (TermRow & { stripe_customer_id?: string | null }) | null;

      // One live term per user: a term holder (plan columns live OR a
      // non-terminal subscription status) cannot start a second term
      // checkout — it would create a second subscription Stripe bills in
      // parallel and the webhook could only track one.
      if (sku === 'term' && hasActiveTerm(row)) {
        return res.status(409).json({ error: 'already_subscribed' });
      }
      const existingCustomerId = row?.stripe_customer_id ?? null;

      try {
        // Shared params. The SKUs differ ONLY in mode:
        //   - term / review_addon = recurring subscriptions → mode
        //     'subscription'.
        //   - pack / review_pack = one-time purchases → mode 'payment'.
        // A single mode is wrong: mode 'payment' with a recurring price is
        // rejected by Stripe ("passed a recurring price").
        const params: Stripe.Checkout.SessionCreateParams = {
          mode: sku === 'term' || sku === 'review_addon' ? 'subscription' : 'payment',
          line_items: [{ price: priceId, quantity: 1 }],
          // Managed Payments — Stripe becomes the merchant of record and
          // handles tax filing/remittance worldwide. Composes with both
          // payment and subscription mode.
          managed_payments: { enabled: true },
          // NOTE: no `custom_text` (the refund rule above the pay button) —
          // Stripe refuses it together with managed_payments
          // ("You cannot use custom_text with Managed Payments.", sandbox
          // 2026-09-11), and sending it would fail every checkout. The
          // refund rule is put in front of the buyer on the client surfaces
          // BEFORE checkout instead (apps/web/src/data/refundCopy.ts).
          // `consent_collection.terms_of_service` is likewise absent: Stripe
          // refuses it until a Terms URL is set in the Dashboard's public
          // business details (with or without managed_payments).
          // Bind the session to our user so the webhook can reconcile it
          // even before a Stripe customer exists. NOTE: client_reference_id
          // exists ONLY on the checkout.session — later subscription
          // lifecycle events (invoice.paid, customer.subscription.*) do not
          // carry it, which is why the subscription SKUs also stamp the
          // user id into subscription_data.metadata below.
          client_reference_id: user.id,
          // Reuse the Stripe customer we already hold for this user so a
          // repeat purchase lands on ONE customer (portal, receipts and
          // the customer-id reconciliation all key on it). Only when none
          // is stored does Checkout create one from the email.
          ...(existingCustomerId
            ? { customer: existingCustomerId }
            : { customer_email: user.email ?? undefined }),
          // Carried onto the completed event so the webhook knows the SKU.
          metadata: { user_id: user.id, sku },
          success_url: successUrl,
          cancel_url: cancelUrl,
        };

        if (sku === 'term' || sku === 'review_addon') {
          // Copy the user id AND the sku onto the Subscription object so
          // later lifecycle events (which lack client_reference_id) can
          // still be reconciled to this user — and so
          // handleSubscriptionChange / handleInvoicePaid can tell a review
          // add-on (weekly-quota flag only) apart from the term (plan
          // columns). No client-side expiry — Stripe drives the billing
          // period from the recurring price.
          params.subscription_data = {
            metadata: { user_id: user.id, sku },
          };
        }

        const session = await stripe.checkout.sessions.create(params);

        return res.json({ url: session.url });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'checkout_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] create-checkout failed:', message);
        return res.status(500).json({ error: 'checkout_failed' });
      }
    },
  );

  // ── Spend one export credit for the signed-in user.
  //    Called by the client AFTER a successful credit-based export (a
  //    term holder never calls this — their exports are unlimited). The
  //    decrement is server-side because export_credits is server-owned:
  //    a client cannot decrement (or top up) its own credits.
  router.post(
    '/billing/consume-credit',
    requireAuth(getSupabaseAdmin, { requirePermanent: true }),
    consumeLimiter,
    async (_req: Request, res: Response) => {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return res.status(500).json({ error: 'billing_not_configured' });
      }
      const user = (res.locals as AuthLocals).user;
      try {
        const result = await consumeExportCredit(supabase, user.id);
        if (!result.ok) {
          return res.status(409).json({ error: 'no_credit', credits: 0 });
        }
        return res.json({ ok: true, credits: result.remaining });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'consume_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] consume-credit failed:', message);
        return res.status(500).json({ error: 'consume_failed' });
      }
    },
  );

  // ── Mark that a TERM holder took a paid export.
  //    A term holder's exports are unlimited (they never spend a credit),
  //    so nothing else records that they exported. This stamps
  //    first_paid_export_at once, which the refund eligibility check reads
  //    ("no export since the charge"). Best-effort from the client's view —
  //    the write is server-side (the column is guarded), and a failure must
  //    never make a completed export look failed.
  router.post(
    '/billing/mark-export',
    requireAuth(getSupabaseAdmin, { requirePermanent: true }),
    consumeLimiter,
    async (_req: Request, res: Response) => {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return res.status(500).json({ error: 'billing_not_configured' });
      }
      const user = (res.locals as AuthLocals).user;
      try {
        const { error } = await supabase.rpc(
          'mark_first_paid_export' as never,
          { p_user_id: user.id } as never,
        );
        if (error) throw new Error(error.message);
        return res.json({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'mark_export_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] mark-export failed:', message);
        return res.status(500).json({ error: 'mark_export_failed' });
      }
    },
  );

  // ── Self-serve refund for the signed-in user.
  //    Eligibility is computed SERVER-SIDE against server-owned state (a
  //    client can't assert its own eligibility). See refundForUser().
  //    Race-safe against Link's own refund path via the billing_refunds
  //    ledger (stripe_refund_id UNIQUE) and the charge.refunded webhook.
  router.post(
    '/billing/refund',
    requireAuth(getSupabaseAdmin, { requirePermanent: true }),
    checkoutLimiter,
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const supabase = getSupabaseAdmin();
      if (!stripe || !supabase) {
        return res.status(500).json({ error: 'billing_not_configured' });
      }
      const user = (res.locals as AuthLocals).user;
      const kind = req.body?.kind as RefundKind | undefined;
      if (kind !== 'term' && kind !== 'pack') {
        return res.status(400).json({ error: 'invalid_kind' });
      }
      try {
        const result = await refundForUser(supabase, stripe, user.id, kind);
        if (!result.ok) {
          return res.status(409).json({ error: result.reason });
        }
        // subscription_cancelled: a term refund also ends the subscription
        // immediately (P0-1); the client says so. Additive — existing
        // clients read only ok / amount_cents.
        return res.json({
          ok: true,
          amount_cents: result.amountCents,
          subscription_cancelled: result.subscriptionCancelled ?? false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'refund_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] refund failed:', message);
        return res.status(500).json({ error: 'refund_failed' });
      }
    },
  );

  // ── Deep-link the signed-in user to manage THEIR subscription.
  //    Creates a Stripe Billing customer-portal session bound to their
  //    stripe_customer_id and returns its URL, so they land straight on
  //    their own subscription (cancel, update card, receipts) rather than
  //    the generic link.com homepage.
  //
  //    Managed Payments makes Link the merchant of record, and Stripe's
  //    docs say a merchant "can offer additional subscription management
  //    using the Customer Portal" — but whether billingPortal composes
  //    with MoR (and whether a portal configuration exists) is not
  //    guaranteed. So this fails SOFT: on any Stripe error it returns
  //    503 portal_unavailable and the client falls back to link.com,
  //    never a dead end.
  router.post(
    '/billing/portal',
    requireAuth(getSupabaseAdmin, { requirePermanent: true }),
    checkoutLimiter,
    async (_req: Request, res: Response) => {
      const stripe = getStripe();
      const supabase = getSupabaseAdmin();
      if (!stripe || !supabase) {
        return res.status(500).json({ error: 'billing_not_configured' });
      }
      const user = (res.locals as AuthLocals).user;

      // Look up the user's Stripe customer id (service_role read).
      const { data, error } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[billing] portal customer lookup failed:', error.message);
        return res.status(500).json({ error: 'portal_lookup_failed' });
      }
      const customerId = (data as { stripe_customer_id?: string | null } | null)
        ?.stripe_customer_id;
      if (!customerId) {
        // Never purchased — nothing to manage.
        return res.status(409).json({ error: 'no_customer' });
      }

      try {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/profile`,
        });
        return res.json({ url: portal.url });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'portal_failed';
        // eslint-disable-next-line no-console
        console.error('[billing] portal session create failed:', message);
        // Soft failure → client falls back to link.com.
        return res.status(503).json({ error: 'portal_unavailable' });
      }
    },
  );

  return router;
}

/**
 * Atomically spend one export credit. Returns the new balance, or
 * `{ ok: false }` when the user has none. Exported for tests.
 *
 * Delegates to the `consume_export_credit` RPC, which runs a single
 * conditional `UPDATE ... SET export_credits = export_credits - 1 WHERE
 * export_credits > 0 RETURNING export_credits`. That one statement is
 * atomic, so two concurrent exports cannot drive the balance negative —
 * the second matches zero rows and returns null. PostgREST's `.update()`
 * cannot express `col = col - 1`, which is why this is an RPC.
 */
export async function consumeExportCredit(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; remaining: number } | { ok: false }> {
  const { data, error } = await supabase.rpc(
    'consume_export_credit' as never,
    { p_user_id: userId } as never,
  );
  if (error) throw new Error(`consume rpc: ${error.message}`);
  const remaining = data as number | null;
  if (remaining === null || remaining === undefined) return { ok: false };
  return { ok: true, remaining };
}

/**
 * Read a subscription's current-period-end (Unix seconds).
 *
 * BREAKING CHANGE (Stripe Basil, live on our pinned 2026-02-25.preview):
 * the top-level `current_period_end` was REMOVED from the Subscription
 * object — it now lives on each item: `items.data[0].current_period_end`.
 * A naive `sub.current_period_end` read returns undefined and would write
 * a null/NaN expiry, silently revoking a paying user. So we read the
 * item-level field and FAIL HARD if it's missing (→ throw → 500 → Stripe
 * retries) rather than write a bad expiry. Exported for tests.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): number {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  const periodEnd = item?.current_period_end;
  if (typeof periodEnd !== 'number' || !Number.isFinite(periodEnd)) {
    throw new Error(
      `subscription ${sub.id} has no item-level current_period_end`,
    );
  }
  return periodEnd;
}

/**
 * Apply a completed checkout to the user's billing state. Idempotent:
 * safe to run twice for the same session (a webhook can fire more than
 * once) — the credit grants are guarded by a per-session marker, and the
 * term / add-on paths write absolute values derived from the retrieved
 * subscription.
 *
 * The `stripe` client is needed for the subscription paths (term and
 * review_addon): a subscription-mode session carries only the
 * subscription id, so we retrieve the subscription to read its status
 * and period end. The pack paths ignore it.
 *
 * Exported for tests.
 */
export async function fulfillCheckout(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  const sku = session.metadata?.sku as BillingSku | undefined;
  if (!userId || !sku) {
    throw new Error('checkout session missing user_id / sku metadata');
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : null;

  if (sku === 'term') {
    // Subscription mode: the completion signal is session.status ===
    // 'complete', NOT payment_status (which can be 'no_payment_required').
    // An incomplete session is a no-op the webhook will re-fire on.
    const paid =
      session.status === 'complete' ||
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    if (!paid) return;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      throw new Error('term checkout session missing subscription id');
    }

    // Retrieve the subscription for its status + item-level period end.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEndSec = subscriptionPeriodEnd(sub); // fails hard if absent
    const expiresAtIso = new Date(periodEndSec * 1000).toISOString();

    // Forward-only expiry: never move plan_expires_at backward on the term
    // path (guards against an out-of-order webhook redelivery regressing a
    // paying user's access). Only advance it.
    await advanceTermAccess(supabase, userId, {
      expiresAtIso,
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId: customerId ?? (typeof sub.customer === 'string' ? sub.customer : null),
    });
    return;
  }

  if (sku === 'review_addon') {
    // The weekly-quota add-on is a subscription, so it uses the term's
    // completion semantics (status 'complete', not payment_status) — but
    // it grants ONLY the review_addon flag. plan / plan_expires_at /
    // subscription_status belong to the term and are never written here.
    const paid =
      session.status === 'complete' ||
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    if (!paid) return;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      throw new Error('review_addon checkout session missing subscription id');
    }

    // Retrieve so the stored id is Stripe's real object (a replayed or
    // malformed session without a live subscription throws → 500 → retry).
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    // Absolute-value write = naturally idempotent (like the term), so no
    // billing_fulfilled_sessions marker is needed. stripe_customer_id is
    // recorded alongside (not part of the entitlement) so later add-on
    // lifecycle events can also reconcile by customer id. The conditional
    // match makes the activation forward-only: a row whose flag is
    // already set (by THIS or a NEWER add-on subscription) is left
    // untouched, so a redelivered/stale checkout cannot clobber it.
    const { error } = await supabase
      .from('users')
      .update({
        review_addon: true,
        review_addon_subscription_id: sub.id,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      })
      .match({ id: userId, review_addon: false });
    if (error) throw new Error(`review_addon grant update: ${error.message}`);
    return;
  }

  // review_pack — grant review credits. Mirrors the pack branch exactly:
  // paid-only, idempotent via billing_fulfilled_sessions, atomic RPC grant.
  if (sku === 'review_pack') {
    if (session.payment_status !== 'paid') return;

    // Idempotency: record fulfilled session ids so a retry can't double-grant.
    const alreadyFulfilled = await sessionAlreadyFulfilled(supabase, session.id);
    if (alreadyFulfilled) return;

    // Grant credits atomically (SET review_credits = review_credits + N in
    // one statement, via the Task-8 RPC) so two distinct concurrent
    // fulfillments can't lose a grant on a stale read. service_role can
    // run it; the billing-column guard permits the write.
    const { error: grantErr } = await supabase.rpc(
      'grant_review_credits' as never,
      { p_user_id: userId, p_amount: REVIEW_PACK_CREDITS } as never,
    );
    if (grantErr) throw new Error(`review_pack credit grant: ${grantErr.message}`);

    // Record the Stripe customer id separately (not part of the atomic
    // credit math). Guarded write, service_role.
    if (customerId) {
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // Record 0 (not REVIEW_PACK_CREDITS): the export-pack refund flow
    // picks the newest fulfilled session with credits_granted > 0, so a
    // nonzero marker here would let a review purchase be mistaken for an
    // export pack — refunding the wrong charge and revoking export
    // credits. Review-SKU refunds are manual via the dashboard (D8), so
    // this row must stay out of that selection; it exists ONLY for
    // idempotency.
    await markSessionFulfilled(supabase, session.id, userId, 0);
    return;
  }

  // pack — grant credits. Only fulfill paid sessions.
  if (session.payment_status !== 'paid') return;

  // Idempotency: record fulfilled session ids so a retry can't double-grant.
  const alreadyFulfilled = await sessionAlreadyFulfilled(supabase, session.id);
  if (alreadyFulfilled) return;

  // Grant credits atomically (SET export_credits = export_credits + N in
  // one statement, via the RPC) so two distinct concurrent pack
  // fulfillments can't lose a grant on a stale read. service_role can run
  // it; the billing-column guard permits the write.
  const { error: grantErr } = await supabase.rpc(
    'grant_export_credits' as never,
    { p_user_id: userId, p_amount: PACK_EXPORT_CREDITS } as never,
  );
  if (grantErr) throw new Error(`pack credit grant: ${grantErr.message}`);

  // Record the Stripe customer id separately (not part of the atomic
  // credit math). Guarded write, service_role.
  if (customerId) {
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  await markSessionFulfilled(supabase, session.id, userId, PACK_EXPORT_CREDITS);
}

/**
 * Grant / refresh a user's term access from a subscription's current state,
 * writing plan_expires_at FORWARD-ONLY.
 *
 * Subscription lifecycle events can be redelivered out of order (Stripe
 * retries failed deliveries with backoff, so a stale event can land after a
 * fresher one). Every write here derives from an absolute value on the
 * event, so re-delivery is safe — but a STALE event carries an OLDER
 * period end, and blindly writing it would move a paying user's expiry
 * backward. So we only advance plan_expires_at; we never retreat it here.
 * (Losing access on cancel/past_due is a separate, explicit path added with
 * the lifecycle handlers — not this function.)
 *
 * Subscription-id scoped (billing/subscriptionGuard.ts): a late "active"
 * for a subscription whose stored status is terminal (refunded/cancelled)
 * is refused — it must never re-grant; an "active" for a DIFFERENT
 * subscription while the stored one is live is a duplicate term — refused
 * and logged for the operator (the checkout 409 guard should make this
 * unreachable). A missing users row is acknowledged when the account was
 * deleted through POST /account/delete, and throws otherwise (P0-3).
 *
 * service_role write; the billing-column guard permits it.
 */
async function advanceTermAccess(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    expiresAtIso: string;
    subscriptionStatus: string;
    subscriptionId: string;
    customerId: string | null;
  },
): Promise<void> {
  // Read the current row: the forward-only expiry AND the stored
  // subscription id/status the guard decides on.
  const current = await readTermRow(supabase, userId, 'advanceTermAccess');
  if (!current) return; // account deleted via POST /account/delete — acknowledged, nothing to grant
  const decision = termAdvanceDecision(current, opts.subscriptionId);
  if (decision === 'skip_terminal') {
    // Cancelled / refunded sub — never re-grant. Logged so a genuine
    // recovery that lands here (it should not: `unpaid` is recoverable
    // and is not a terminal status) is operator-visible, not silent.
    // eslint-disable-next-line no-console
    console.error(
      `[billing] refusing to re-activate subscription ${opts.subscriptionId} for user ${userId}: its stored status is ${current.subscription_status} (terminal — a late event, or a refunded sub Stripe still reports ${opts.subscriptionStatus})`,
      { userId, eventSubscriptionId: opts.subscriptionId, eventStatus: opts.subscriptionStatus, stored: current },
    );
    return;
  }
  if (decision === 'skip_other_live') {
    // eslint-disable-next-line no-console
    console.error(
      `[billing] refusing to record subscription ${opts.subscriptionId} for user ${userId}: stored subscription ${current.stripe_subscription_id} is still ${current.subscription_status} (duplicate term — reconcile manually)`,
      { userId, eventSubscriptionId: opts.subscriptionId, stored: current },
    );
    return;
  }

  const currentIso = current.plan_expires_at;
  const nextIso =
    currentIso && new Date(currentIso).getTime() >= new Date(opts.expiresAtIso).getTime()
      ? currentIso // stored expiry is already the same or later — keep it
      : opts.expiresAtIso;

  const { error } = await supabase
    .from('users')
    .update({
      plan: 'term',
      plan_expires_at: nextIso,
      subscription_status: opts.subscriptionStatus,
      stripe_subscription_id: opts.subscriptionId,
      ...(opts.customerId ? { stripe_customer_id: opts.customerId } : {}),
    })
    .eq('id', userId);
  if (error) throw new Error(`term access update: ${error.message}`);
}

// TERM_ACTIVE_STATUSES (active / trialing / past_due — past_due keeps
// access through Stripe's dunning window) now lives in
// billing/subscriptionGuard.ts alongside the terminal set and the guards.

/**
 * A term renewal — `invoice.paid` fires on the first invoice AND every
 * 4-month renewal. Review add-on invoices return early below. Extend the
 * user's access to the subscription's new period end. Absolute-value +
 * forward-only write, so redelivery is safe.
 */
export async function handleInvoicePaid(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  // Basil moved the invoice's subscription to
  // `parent.subscription_details.subscription`; the reader falls back to
  // the legacy top-level `subscription` (billing/invoicePayments.ts).
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  // A one-time pack produces no subscription invoice we act on — guard.
  if (!subscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  // A review add-on invoice is NOT a term renewal: the add-on's weekly
  // quota needs no period-end write, and routing it through
  // advanceTermAccess would grant plan='term' to a user who never bought
  // it (and clobber stripe_subscription_id with the add-on's id).
  if (sub.metadata?.sku === 'review_addon') return;

  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : null;

  const userId = await findUserIdForSubscriptionEvent(supabase, {
    subscriptionId,
    customerId,
    metadataUserId: sub.metadata?.user_id ?? null,
  });

  const periodEndSec = subscriptionPeriodEnd(sub);
  await advanceTermAccess(supabase, userId, {
    expiresAtIso: new Date(periodEndSec * 1000).toISOString(),
    subscriptionStatus: sub.status,
    subscriptionId: sub.id,
    customerId,
  });
}

/**
 * A subscription status change — `customer.subscription.updated` (cancel-
 * at-period-end, past_due, reactivation) and `.deleted` (final cancel).
 * The event object IS the subscription; no retrieve needed.
 *
 * Access rule (single source of truth, mirrored in usePlan):
 *   - status in {active, trialing, past_due} → keep plan='term'; expiry
 *     stays the period end (advanced forward-only). cancel-at-period-end
 *     is status 'active' with a flag, so the user keeps access UNTIL the
 *     period lapses — correct.
 *   - any other status (canceled / unpaid / incomplete_expired / …) → set
 *     plan='free' AND plan_expires_at=now() so the two signals never
 *     contradict (no code path can grant a canceled user access).
 *     `unpaid` revokes but is NOT irreversible: when the customer pays
 *     the open invoice Stripe reports the SAME subscription `active`
 *     again and advanceTermAccess re-grants it (subscriptionGuard.ts).
 */
export async function handleSubscriptionChange(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  // Review add-on subscriptions are not the term: they only flip the
  // weekly-quota flag. Checked FIRST so an add-on event can never rewrite
  // plan / plan_expires_at / subscription_status. The user resolves via
  // the metadata user_id stamped at checkout (or the shared customer id)
  // — findUserIdForSubscriptionEvent needs no change for add-on subs.
  if (sub.metadata?.sku === 'review_addon') {
    const addOnCustomerId =
      typeof sub.customer === 'string' ? sub.customer : null;
    const addOnUserId = await findUserIdForSubscriptionEvent(supabase, {
      subscriptionId: sub.id,
      customerId: addOnCustomerId,
      metadataUserId: sub.metadata?.user_id ?? null,
    });

    if (TERM_ACTIVE_STATUSES.has(sub.status)) {
      // Still entitled — (re)set the flag and record WHICH subscription
      // grants it (absolute values, so redelivery is safe). The
      // conditional match keeps activation forward-only: an add-on row
      // already granted (by this or a newer subscription) is not
      // re-pointed by a stale event.
      const { error } = await supabase
        .from('users')
        .update({
          review_addon: true,
          review_addon_subscription_id: sub.id,
        })
        .match({ id: addOnUserId, review_addon: false });
      if (error) throw new Error(`review_addon update: ${error.message}`);
      return;
    }

    // Terminal (canceled / unpaid / incomplete_expired) — clear the flag,
    // but ONLY if this subscription is the one currently granting it:
    // a stale terminal event for an OLD add-on subscription must not
    // revoke access granted by a NEWER one.
    // review_addon_subscription_id is KEPT (not nulled) so a late-arriving
    // event for this same subscription can still reconcile the user.
    const { error } = await supabase
      .from('users')
      .update({ review_addon: false })
      .match({
        id: addOnUserId,
        review_addon: true,
        review_addon_subscription_id: sub.id,
      });
    if (error) throw new Error(`review_addon revoke update: ${error.message}`);
    return;
  }

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : null;
  const userId = await findUserIdForSubscriptionEvent(supabase, {
    subscriptionId: sub.id,
    customerId,
    metadataUserId: sub.metadata?.user_id ?? null,
  });

  if (TERM_ACTIVE_STATUSES.has(sub.status)) {
    // Still entitled — advance access to the (item-level) period end.
    // advanceTermAccess applies the subscription-id guard (and throws on
    // a missing users row).
    const periodEndSec = subscriptionPeriodEnd(sub);
    await advanceTermAccess(supabase, userId, {
      expiresAtIso: new Date(periodEndSec * 1000).toISOString(),
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  // Not live (canceled / unpaid / incomplete_expired / paused…) — revoke
  // access, keeping plan and expiry consistent, but ONLY if this
  // subscription is the one currently granting the term (mirrors the
  // add-on guard above): a stale terminal event for an OLD subscription
  // must not revoke a NEWER term. The row read acknowledges an account
  // deleted through POST /account/delete (null → nothing to revoke) and
  // turns a genuine orphan (no row, no deletion record) into an
  // operator-visible error (P0-3).
  const stored = await readTermRow(supabase, userId, 'handleSubscriptionChange');
  if (!stored || !canRevokeTerm(stored, sub.id)) return;
  const { error } = await supabase
    .from('users')
    .update({
      plan: 'free',
      plan_expires_at: new Date().toISOString(),
      subscription_status: sub.status,
    })
    .match({ id: userId, stripe_subscription_id: sub.id });
  if (error) throw new Error(`subscription revoke update: ${error.message}`);
}

/**
 * Resolve a subscription-lifecycle event back to the Postr user id.
 *
 * `client_reference_id` exists ONLY on the checkout.session — later events
 * (invoice.paid, customer.subscription.*) don't carry it. So we look up by
 * the stamped subscription id, then the customer id, then the user id we
 * copied into subscription_data.metadata at checkout. Throwing on a total
 * miss → 500 → Stripe retries, which covers the race where a subscription
 * event beats the checkout event that first stored these ids.
 */
async function findUserIdForSubscriptionEvent(
  supabase: SupabaseClient,
  ids: { subscriptionId: string; customerId: string | null; metadataUserId: string | null },
): Promise<string> {
  const bySub = await supabase
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', ids.subscriptionId)
    .maybeSingle();
  if (bySub.data?.id) return bySub.data.id as string;

  if (ids.customerId) {
    const byCust = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', ids.customerId)
      .maybeSingle();
    // maybeSingle errors when MORE than one row carries this customer id
    // (PGRST116). That is a data fault — two accounts naming one Stripe
    // customer — and must not fall through to the metadata uuid and
    // fulfil whichever account the payload names: refuse (→ 500, in the
    // delivery log) until the rows are reconciled. The partial unique
    // index on users.stripe_customer_id (20260911000100) prevents it.
    if (byCust.error) {
      throw new Error(
        `ambiguous customer ${ids.customerId} for subscription ${ids.subscriptionId}: ${byCust.error.message}`,
      );
    }
    if (byCust.data?.id) return byCust.data.id as string;
  }

  if (ids.metadataUserId) return ids.metadataUserId;

  throw new Error(
    `no user for subscription ${ids.subscriptionId} / customer ${ids.customerId ?? 'none'}`,
  );
}

// handleChargeRefunded now lives in billing/refundReconcile.ts (Basil-
// shaped payloads: refunds listed by charge, term/pack classified via the
// InvoicePayment resource, unattributable refunds revoke nothing).

/**
 * Pure eligibility test for a TERM refund. Exported for tests.
 * Eligible iff within the 14-day window AND no paid export was taken since
 * the charge (firstExportMs null or strictly before the charge).
 */
export function termRefundEligible(args: {
  chargedAtMs: number;
  firstExportMs: number | null;
  nowMs: number;
}): { ok: true } | { ok: false; reason: string } {
  const windowMs = TERM_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (args.nowMs - args.chargedAtMs > windowMs) {
    return { ok: false, reason: 'window_expired' };
  }
  if (args.firstExportMs !== null && args.firstExportMs >= args.chargedAtMs) {
    return { ok: false, reason: 'already_used' };
  }
  return { ok: true };
}

/**
 * Issue a self-serve refund for a user, computing eligibility SERVER-SIDE.
 *
 * Policy (owner's rule, 2026-09-11): a refund is possible ONLY if the buyer
 * has not taken a single paid export with what they bought — for BOTH SKUs.
 *   - TERM: full refund of the last charge, only within 14 days (the Terms
 *     state the window) AND only if the user took NO paid export since that
 *     charge (first_paid_export_at is null or predates the charge).
 *     Cancelling is separate and keeps access to period end — not here.
 *   - PACK: the most recent unrefunded pack refunded in FULL, only while
 *     NO credit has been consumed from the buyer's packs (export_credits
 *     still covers every credit granted). One export → no refund at all;
 *     there is no per-credit proration (billing/packRefund.ts).
 *
 * Race-safe against Link's own refund path and double-clicks: each
 * stripe.refunds.create passes a DETERMINISTIC idempotency key (term keyed
 * on the payment intent, pack on the session id), so a retried/raced call
 * returns the SAME Stripe refund rather than minting a second one. The
 * billing_refunds ledger then records stripe_refund_id UNIQUE, so a refund
 * already recorded (by the button OR the charge.refunded webhook) is not
 * double-revoked.
 */
export async function refundForUser(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  kind: RefundKind,
): Promise<RefundResult> {
  if (kind === 'term') return refundTerm(supabase, stripe, userId);
  return refundPack(supabase, stripe, userId);
}

async function refundTerm(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
): Promise<RefundResult> {
  const { data } = await supabase
    .from('users')
    .select('plan, stripe_subscription_id, first_paid_export_at')
    .eq('id', userId)
    .maybeSingle();
  const row = data as
    | { plan?: string | null; stripe_subscription_id?: string | null; first_paid_export_at?: string | null }
    | null;
  const subscriptionId = row?.stripe_subscription_id;
  if (!subscriptionId) return { ok: false, reason: 'no_subscription' };

  // The most recent invoice's charge is what we refund. Retrieve the sub's
  // latest invoice with its payments list expanded (Basil: the PI id is
  // at `latest_invoice.payments.data[].payment.payment_intent` — the old
  // `latest_invoice.payment_intent` no longer exists), and the invoice's
  // created time (the "last charge" the 14-day window is measured from).
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: [LATEST_INVOICE_PAYMENT_INTENT_EXPAND],
  });
  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === 'string') {
    return { ok: false, reason: 'no_invoice' };
  }
  const paymentIntentId = await findPaymentIntentIdForInvoice(stripe, invoice);
  if (!paymentIntentId) return { ok: false, reason: 'no_payment' };

  // Eligibility: within the 14-day window AND no paid export since the
  // charge (pure, unit-tested logic).
  const chargedAtMs = invoice.created * 1000;
  const firstExportMs = row?.first_paid_export_at
    ? new Date(row.first_paid_export_at).getTime()
    : null;
  const eligible = termRefundEligible({ chargedAtMs, firstExportMs, nowMs: Date.now() });
  if (!eligible.ok) return eligible;

  // Idempotency: a deterministic key so a double-click or a button-vs-
  // webhook race returns the SAME Stripe refund object instead of minting a
  // second real refund. Stripe does NOT dedup refunds by payment_intent, so
  // this key is what makes the money movement idempotent; the ledger's
  // UNIQUE(stripe_refund_id) then dedups the revoke.
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `term-refund:${paymentIntentId}` },
  );
  // Never a NaN/null amount in the ledger: the refund's amount, else what
  // the invoice collected, else 0.
  const amountCents = finiteCents(refund.amount, invoice.amount_paid);

  // The money is back → the subscription ends NOW (immediate cancel,
  // prorate:false). Done BEFORE the ledger write: if the cancel fails we
  // throw (→ 500 refund_failed) without recording the refund, so the
  // retry (same idempotency key → same refund) re-attempts the cancel
  // instead of leaving a refunded-but-still-billing subscription.
  const subscriptionCancelled = await cancelSubscriptionImmediately(stripe, subscriptionId);

  await recordRefundAndRevoke(supabase, {
    userId,
    kind: 'term',
    refundId: refund.id,
    amountCents,
    creditsRevoked: 0,
    sessionId: null,
  });
  return { ok: true, amountCents, subscriptionCancelled };
}

// refundPack lives in billing/packRefund.ts (all-or-nothing: the most
// recent unrefunded pack in full, only while no credit has been consumed).

// recordRefundAndRevoke now lives in billing/refundLedger.ts (the ledger's
// UNIQUE(stripe_refund_id) is the idempotency gate; the term revoke also
// writes subscription_status='canceled').

/**
 * Idempotency ledger for pack purchases — a session id that has already
 * granted credits must not grant again. Uses a dedicated table so a
 * webhook retry (or a duplicate delivery) is a no-op. The term path is
 * naturally idempotent (absolute expiry) and does not need this.
 */
async function sessionAlreadyFulfilled(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('billing_fulfilled_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  return !!data;
}

async function markSessionFulfilled(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  creditsGranted: number,
): Promise<void> {
  const { error } = await supabase
    .from('billing_fulfilled_sessions')
    .insert({ session_id: sessionId, user_id: userId, credits_granted: creditsGranted });
  // A unique-violation here means a concurrent retry already recorded it
  // — benign, so it's not re-thrown.
  if (error && !/duplicate key|unique/i.test(error.message)) {
    throw new Error(`mark fulfilled: ${error.message}`);
  }
}

/** Map a SKU to its configured Stripe price id (env-driven). */
function priceIdForSku(sku: BillingSku | undefined): string | null {
  if (sku === 'term') return process.env.STRIPE_PRICE_TERM ?? null;
  if (sku === 'pack') return process.env.STRIPE_PRICE_PACK ?? null;
  if (sku === 'review_pack') return process.env.STRIPE_PRICE_REVIEW_PACK ?? null;
  if (sku === 'review_addon') return process.env.STRIPE_PRICE_REVIEW_ADDON ?? null;
  return null;
}

/** Build a success/cancel redirect URL from the configured app origin. */
function billingUrl(outcome: 'success' | 'cancel'): string {
  const base = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  return `${base}/billing/${outcome}`;
}

