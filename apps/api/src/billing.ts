/**
 * Billing — Stripe Managed Payments (a Merchant of Record).
 *
 * Two paid products, both ONE-TIME (never subscriptions):
 *   - Term:  $18.99, unlocks unlimited editable exports for 4 months.
 *   - Pack:  $9.99, grants 3 export credits (consumable).
 *
 * Managed Payments makes Stripe the merchant of record, so Stripe files
 * and remits tax worldwide. That requires:
 *   - an eligible product tax_code on each product,
 *   - `managed_payments[enabled] = true` on the Checkout Session,
 *   - the `2026-02-25.preview` (or later) Stripe API version header.
 *
 * The plan/credits columns on public.users are SERVER-OWNED (a DB
 * trigger rejects any non-service_role write — see
 * 20260728120000_billing_plan.sql). This webhook, running with the
 * service_role key, is the ONLY writer. A client can start a checkout
 * but can never grant itself a plan.
 *
 * Provider swap note: this is wired for the Stripe SANDBOX for testing;
 * flipping to production is only an env-var change (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, the price ids) — no code change.
 */
import express, { type Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';

/**
 * Managed Payments requires this preview API version (or later). Set
 * explicitly per the blueprint — NOT left to the SDK default, which
 * would target the account's pinned stable version and reject the
 * `managed_payments` param.
 */
const STRIPE_API_VERSION = '2026-02-25.preview';

/** The two SKUs the client can ask to buy. */
export type BillingSku = 'term' | 'pack';

/** How many export credits a pack purchase grants. */
const PACK_EXPORT_CREDITS = 3;
// The term's 4-month cadence now lives in the Stripe recurring price
// (interval_count=4 months), not here — Stripe drives the billing period
// and the webhook derives plan_expires_at from the subscription.

interface BillingDeps {
  getStripe?: () => Stripe | null;
  getSupabaseAdmin?: () => SupabaseClient | null;
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
      const priceId = priceIdForSku(sku);
      if (!sku || !priceId) {
        return res.status(400).json({
          error: 'invalid_sku',
          message: 'sku must be "term" or "pack", and its price id env var must be set.',
        });
      }

      const user = (res.locals as AuthLocals).user;
      const successUrl = billingUrl('success');
      const cancelUrl = billingUrl('cancel');

      try {
        // Shared params. The term and the pack differ ONLY in mode:
        //   - term = a recurring subscription (billed every 4 months by the
        //     Stripe price; auto-renews) → mode 'subscription'.
        //   - pack = a one-time purchase of 3 export credits → mode 'payment'.
        // A single mode is wrong: mode 'payment' with a recurring price is
        // rejected by Stripe ("passed a recurring price").
        const params: Stripe.Checkout.SessionCreateParams = {
          mode: sku === 'term' ? 'subscription' : 'payment',
          line_items: [{ price: priceId, quantity: 1 }],
          // Managed Payments — Stripe becomes the merchant of record and
          // handles tax filing/remittance worldwide. Composes with both
          // payment and subscription mode.
          managed_payments: { enabled: true },
          // Bind the session to our user so the webhook can reconcile it
          // even before a Stripe customer exists. NOTE: client_reference_id
          // exists ONLY on the checkout.session — later subscription
          // lifecycle events (invoice.paid, customer.subscription.*) do not
          // carry it, which is why the term also stamps the user id into
          // subscription_data.metadata below.
          client_reference_id: user.id,
          customer_email: user.email ?? undefined,
          // Carried onto the completed event so the webhook knows the SKU.
          metadata: { user_id: user.id, sku },
          success_url: successUrl,
          cancel_url: cancelUrl,
        };

        if (sku === 'term') {
          // Copy the user id onto the Subscription object so later
          // lifecycle events (which lack client_reference_id) can still be
          // reconciled to this user. No client-side expiry — Stripe drives
          // the billing period from the recurring price.
          params.subscription_data = {
            metadata: { user_id: user.id, sku: 'term' },
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
 * once) — the pack grant is guarded by a per-session marker, and the term
 * writes absolute values derived from the retrieved subscription.
 *
 * The `stripe` client is needed for the term path: a subscription-mode
 * session carries only the subscription id, so we retrieve the
 * subscription to read its status and period end. The pack path ignores it.
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

  await markSessionFulfilled(supabase, session.id, userId);
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
  // Read the current expiry so we only move it forward.
  const { data: current } = await supabase
    .from('users')
    .select('plan_expires_at' as never)
    .eq('id', userId)
    .maybeSingle();
  const currentIso = (current as { plan_expires_at?: string | null } | null)
    ?.plan_expires_at;
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

/**
 * Subscription statuses under which the user KEEPS term access. Note
 * `past_due` is intentionally included: when a renewal card fails, Stripe
 * runs dunning retries for days — revoking access the instant the status
 * flips to past_due would slam the paywall shut on a paying user mid-work,
 * then flip back when a retry succeeds. Access is lost only on a TERMINAL
 * status (canceled / unpaid / incomplete_expired) or when the period
 * actually lapses (plan_expires_at in the past, enforced by usePlan).
 */
const TERM_ACTIVE_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
]);

/**
 * A term renewal — `invoice.paid` fires on the first invoice AND every
 * 4-month renewal. Extend the user's access to the subscription's new
 * period end. Absolute-value + forward-only write, so redelivery is safe.
 */
export async function handleInvoicePaid(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  // `invoice.subscription` is a string id when the invoice belongs to a
  // subscription. The SDK's Invoice type varies by API version, so read it
  // defensively via unknown rather than a direct field access.
  const rawSub = (invoice as unknown as { subscription?: unknown }).subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : undefined;
  // A one-time pack produces no subscription invoice we act on — guard.
  if (!subscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
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
 *   - any terminal status (canceled / unpaid / incomplete_expired) → set
 *     plan='free' AND plan_expires_at=now() so the two signals never
 *     contradict (no code path can grant a canceled user access).
 */
export async function handleSubscriptionChange(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : null;
  const userId = await findUserIdForSubscriptionEvent(supabase, {
    subscriptionId: sub.id,
    customerId,
    metadataUserId: sub.metadata?.user_id ?? null,
  });

  if (TERM_ACTIVE_STATUSES.has(sub.status)) {
    // Still entitled — advance access to the (item-level) period end.
    const periodEndSec = subscriptionPeriodEnd(sub);
    await advanceTermAccess(supabase, userId, {
      expiresAtIso: new Date(periodEndSec * 1000).toISOString(),
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  // Terminal — revoke access, keeping plan and expiry consistent.
  const { error } = await supabase
    .from('users')
    .update({
      plan: 'free',
      plan_expires_at: new Date().toISOString(),
      subscription_status: sub.status,
    })
    .eq('id', userId);
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
    if (byCust.data?.id) return byCust.data.id as string;
  }

  if (ids.metadataUserId) return ids.metadataUserId;

  throw new Error(
    `no user for subscription ${ids.subscriptionId} / customer ${ids.customerId ?? 'none'}`,
  );
}

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
): Promise<void> {
  const { error } = await supabase
    .from('billing_fulfilled_sessions')
    .insert({ session_id: sessionId, user_id: userId });
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
  return null;
}

/** Build a success/cancel redirect URL from the configured app origin. */
function billingUrl(outcome: 'success' | 'cancel'): string {
  const base = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  return `${base}/billing/${outcome}`;
}

/** Default Stripe client, pinned to the Managed Payments preview version. */
function defaultGetStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
}

/** Default Supabase admin (service_role) client — the only billing writer. */
function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
