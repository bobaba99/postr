/**
 * Reconcile an EXTERNAL refund (Link / Stripe dashboard — Managed
 * Payments makes Stripe the merchant of record, so a customer can be
 * refunded without our button) into our DB (H-11).
 *
 * Works on modern (Basil) payloads:
 *   - `charge.refunded` no longer embeds `charge.refunds` → list them
 *     with `stripe.refunds.list({ charge })`.
 *   - `refund.created` / `refund.updated` carry the Refund itself.
 *   - `Charge.invoice` is gone → classify term vs pack by resolving the
 *     PaymentIntent's invoice through the InvoicePayment resource and
 *     comparing the invoice's subscription with the user's stored
 *     stripe_subscription_id; a pack is attributed through its Checkout
 *     Session in billing_fulfilled_sessions.
 *
 * Conservative by construction: a refund that cannot be attributed to
 * the user's term OR to one of their fulfilled pack sessions is logged
 * for the operator and revokes NOTHING. A substantially FULL term refund
 * cancels the subscription exactly as the self-serve path does (P0-1); a
 * PARTIAL one (a goodwill CA$5 issued from the Stripe dashboard or by
 * Link — Stripe is the merchant of record and can refund any amount
 * without our button) is logged and leaves the term untouched: Stripe
 * cancellation is irreversible, and the customer is still in credit.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { finiteCents, isSubstantiallyFullRefund, packCreditsForRefundAmount } from './constants.js';
import { findInvoiceForPaymentIntent, subscriptionIdFromInvoice } from './invoicePayments.js';
import { recordRefundAndRevoke } from './refundLedger.js';
import { cancelSubscriptionImmediately } from './termCancel.js';

interface UserBillingRow {
  id: string;
  stripe_subscription_id: string | null;
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  const id = (value as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : null;
}

function logUnattributable(refundId: string, detail: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(
    `[billing] unattributable external refund ${refundId} — nothing revoked; reconcile manually`,
    detail,
  );
}

/**
 * `charge.refunded` — reconcile every refund on the charge. The payload's
 * `refunds` list is used when present (legacy endpoint versions); on a
 * modern endpoint it is absent and we list them. The ledger dedups, so
 * processing all of them (not just the newest) is safe and also catches
 * an earlier refund a previous delivery missed.
 */
export async function handleChargeRefunded(
  supabase: SupabaseClient,
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<void> {
  const embedded = charge.refunds?.data;
  const refunds = embedded && embedded.length > 0
    ? embedded
    : (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data;
  for (const refund of refunds) {
    await reconcileExternalRefund(supabase, stripe, refund, charge);
  }
}

/**
 * Reconcile one Refund object (from `refund.created` / `refund.updated`,
 * or from handleChargeRefunded). Acts only on a SUCCEEDED refund — a
 * pending one may still fail (`refund.failed`), and `refund.updated`
 * delivers the succeeded transition later.
 */
export async function reconcileExternalRefund(
  supabase: SupabaseClient,
  stripe: Stripe,
  refund: Stripe.Refund,
  chargeHint?: Stripe.Charge,
): Promise<void> {
  if (refund.status && refund.status !== 'succeeded') return;

  // Already in the ledger (our button, or an earlier delivery)? Done.
  const { data: existing } = await supabase
    .from('billing_refunds')
    .select('stripe_refund_id')
    .eq('stripe_refund_id', refund.id)
    .maybeSingle();
  if (existing) return;

  // The charge gives us the customer (a Refund carries none).
  const chargeId = idOf(refund.charge);
  const charge =
    chargeHint && (!chargeId || chargeHint.id === chargeId)
      ? chargeHint
      : chargeId
        ? await stripe.charges.retrieve(chargeId)
        : null;
  const customerId = idOf(charge?.customer);
  if (!customerId) {
    logUnattributable(refund.id, { reason: 'no_customer', chargeId });
    return;
  }

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  // More than one users row for this customer id (maybeSingle → PGRST116)
  // is a data fault: refuse loudly rather than attribute the refund to
  // whichever row came back (→ 500 → Stripe redelivers once fixed).
  if (userErr) {
    throw new Error(`ambiguous customer ${customerId} for refund ${refund.id}: ${userErr.message}`);
  }
  const user = userRow as UserBillingRow | null;
  if (!user?.id) {
    logUnattributable(refund.id, { reason: 'no_user_for_customer', customerId });
    return;
  }

  const paymentIntentId = idOf(refund.payment_intent) ?? idOf(charge?.payment_intent);
  if (!paymentIntentId) {
    logUnattributable(refund.id, { reason: 'no_payment_intent', userId: user.id });
    return;
  }
  const amountCents = finiteCents(refund.amount);

  // TERM? The PaymentIntent paid an invoice whose subscription is the
  // user's stored term subscription.
  const invoice = await findInvoiceForPaymentIntent(stripe, paymentIntentId);
  const invoiceSubscriptionId = subscriptionIdFromInvoice(invoice);
  if (invoiceSubscriptionId) {
    if (invoiceSubscriptionId !== user.stripe_subscription_id) {
      logUnattributable(refund.id, {
        reason: 'subscription_mismatch',
        userId: user.id,
        invoiceSubscriptionId,
        storedSubscriptionId: user.stripe_subscription_id,
      });
      return;
    }
    // A partial refund of the term invoice revokes nothing and is NOT
    // ledgered, so a later corrective full refund still applies.
    const invoiceAmountPaid = finiteCents(invoice?.amount_paid);
    if (!isSubstantiallyFullRefund(amountCents, invoiceAmountPaid)) {
      logUnattributable(refund.id, {
        reason: 'partial_term_refund',
        userId: user.id,
        amountCents,
        invoiceAmountPaid,
        subscriptionId: invoiceSubscriptionId,
      });
      return;
    }
    // Cancel BEFORE the ledger write: if the cancel fails we throw (→ 500
    // → retry) without having recorded the refund, so the retry cancels.
    await cancelSubscriptionImmediately(stripe, invoiceSubscriptionId);
    await recordRefundAndRevoke(supabase, {
      userId: user.id,
      kind: 'term',
      refundId: refund.id,
      amountCents,
      creditsRevoked: 0,
      sessionId: null,
    });
    return;
  }

  // PACK? The PaymentIntent belongs to a Checkout Session we fulfilled
  // for THIS user with export credits.
  const sessionId = await findFulfilledPackSession(supabase, stripe, user.id, paymentIntentId);
  if (!sessionId) {
    logUnattributable(refund.id, { reason: 'no_invoice_no_pack_session', userId: user.id, paymentIntentId });
    return;
  }
  await recordRefundAndRevoke(supabase, {
    userId: user.id,
    kind: 'pack',
    refundId: refund.id,
    amountCents,
    creditsRevoked: packCreditsForRefundAmount(amountCents),
    sessionId,
  });
}

/**
 * The fulfilled pack session (credits_granted > 0, this user) whose
 * Checkout Session was paid by `paymentIntentId`, or null.
 */
async function findFulfilledPackSession(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  paymentIntentId: string,
): Promise<string | null> {
  const { data: sessions } = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 10,
  });
  for (const session of sessions) {
    const { data } = await supabase
      .from('billing_fulfilled_sessions')
      .select('session_id')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .gt('credits_granted', 0)
      .maybeSingle();
    if (data) return session.id;
  }
  return null;
}
