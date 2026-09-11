/**
 * Cancel a term subscription immediately after a refund (P0-1 / H-11).
 *
 * Refunds and cancellation are independent in Stripe: refunding the
 * PaymentIntent does nothing to the subscription, which would bill again
 * next cycle and keep emitting "active" events. So every term refund —
 * ours (refundTerm) or an external one reconciled from a refund event —
 * ends the subscription NOW with `DELETE /v1/subscriptions/:id`
 * (prorate:false — the money already went back; nothing to prorate).
 * Not cancel_at_period_end: access ends with the refund.
 */
import type Stripe from 'stripe';

/**
 * Cancel `subscriptionId` immediately. Idempotent: if Stripe refuses
 * because the subscription is already cancelled (a Link-side cancel, or
 * our own earlier attempt), that counts as done. Any other failure is
 * re-thrown so the caller does NOT record the refund as applied and a
 * retry re-attempts the cancel.
 *
 * Returns true when the subscription is in a cancelled state afterwards.
 */
export async function cancelSubscriptionImmediately(
  stripe: Stripe,
  subscriptionId: string,
): Promise<boolean> {
  try {
    const sub = await stripe.subscriptions.cancel(subscriptionId, { prorate: false });
    return sub.status === 'canceled';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = await stripe.subscriptions
      .retrieve(subscriptionId)
      .catch(() => null);
    if (current?.status === 'canceled') return true;
    throw new Error(
      `subscription cancel failed for ${subscriptionId} (status ${current?.status ?? 'unknown'}): ${message}`,
    );
  }
}
