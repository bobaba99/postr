/**
 * The ONE Stripe client factory — billing.ts (checkout, webhook, refunds)
 * and account.ts (account deletion) both import it, so the checkout path
 * and the delete path can never drift onto different API versions.
 *
 * Managed Payments requires this preview API version (or later). Set
 * explicitly — NOT left to the SDK default, which would target the
 * account's pinned stable version and reject the `managed_payments`
 * param. (The audit flagged that `.preview` is a preview release
 * channel; moving to a GA version is a separate, sandbox-verified change
 * — do not bump it here.)
 */
import Stripe from 'stripe';

/** Managed Payments preview version. */
export const STRIPE_API_VERSION = '2026-02-25.preview';

/** Default Stripe client, or null when STRIPE_SECRET_KEY is unset. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
}
