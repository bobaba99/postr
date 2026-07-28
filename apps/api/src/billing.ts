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
/** The term's length. Kept here so the webhook and the docs agree. */
const TERM_MONTHS = 4;

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
            event.data.object as Stripe.Checkout.Session,
          );
        }
        // Every other event type (including async_payment_failed) is
        // acknowledged (2xx) so Stripe stops retrying — we act only on the
        // two fulfillment-worthy checkout events above.
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
        const session = await stripe.checkout.sessions.create({
          mode: 'payment', // one-time; the term is a term, not a sub
          line_items: [{ price: priceId, quantity: 1 }],
          // Managed Payments — Stripe becomes the merchant of record and
          // handles tax filing/remittance worldwide.
          managed_payments: { enabled: true },
          // Bind the session to our user so the webhook can reconcile it
          // even before a Stripe customer exists.
          client_reference_id: user.id,
          customer_email: user.email ?? undefined,
          // Carried onto the completed event so the webhook knows the SKU.
          metadata: { user_id: user.id, sku },
          success_url: successUrl,
          cancel_url: cancelUrl,
        } as Stripe.Checkout.SessionCreateParams);

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
 * Apply a completed checkout to the user's billing state. Idempotent:
 * safe to run twice for the same session (a webhook can fire more than
 * once), because the term is set to an absolute expiry and the pack
 * grant is guarded by a per-session marker.
 *
 * Exported for tests.
 */
export async function fulfillCheckout(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  const sku = session.metadata?.sku as BillingSku | undefined;
  if (!userId || !sku) {
    throw new Error('checkout session missing user_id / sku metadata');
  }
  if (session.payment_status !== 'paid') {
    // Only fulfill paid sessions; an incomplete session is a no-op.
    return;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : null;

  if (sku === 'term') {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + TERM_MONTHS);
    const { error } = await supabase
      .from('users')
      .update({
        plan: 'term',
        plan_expires_at: expiresAt.toISOString(),
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      })
      .eq('id', userId);
    if (error) throw new Error(`term fulfillment update: ${error.message}`);
    return;
  }

  // pack — grant credits. Idempotency: record fulfilled session ids so a
  // retry can't double-grant. We check-then-insert on a dedicated table.
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
