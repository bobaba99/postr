/**
 * Billing client — thin wrappers over the authed API billing routes.
 *
 * Checkout runs through Stripe Managed Payments (an MoR); the server
 * creates the session and returns its hosted URL. Credit consumption is
 * server-side because export_credits is server-owned (a browser cannot
 * touch it). See apps/api/src/billing.ts and
 * docs/plans/2026-07-28-payment-and-paywall.md.
 */
import { postJson } from '@/lib/apiClient';

export type BillingSku = 'term' | 'pack';

/** Create a checkout session and return its hosted Stripe URL. */
export async function createCheckout(sku: BillingSku): Promise<string> {
  const { url } = await postJson<{ url: string | null }>(
    '/billing/create-checkout',
    { sku },
    { auth: true },
  );
  if (!url) throw new Error('checkout session returned no url');
  return url;
}

/**
 * Spend one export credit after a successful credit-based export.
 * Returns the remaining balance. Best-effort: the export already
 * happened, so a failure here is logged, not surfaced — it must never
 * make a completed export look failed.
 */
export async function consumeExportCredit(): Promise<number | null> {
  const { credits } = await postJson<{ ok: boolean; credits: number }>(
    '/billing/consume-credit',
    {},
    { auth: true },
  );
  return credits;
}

/**
 * Mark that a term holder took a paid export (stamps first_paid_export_at
 * server-side, used by the refund eligibility check). Best-effort: the
 * export already happened, so a failure here is logged, not surfaced.
 */
export async function markPaidExport(): Promise<void> {
  await postJson('/billing/mark-export', {}, { auth: true });
}

/**
 * Request a self-serve refund. `kind` is 'term' (14-day, no-export) or
 * 'pack' (unused credits). The server computes eligibility; on success it
 * returns the refunded amount in cents. Throws on an ineligible/failed
 * request so the caller can show why.
 */
export async function requestRefund(
  kind: 'term' | 'pack',
): Promise<{ amountCents: number }> {
  const { amount_cents } = await postJson<{ ok: boolean; amount_cents: number }>(
    '/billing/refund',
    { kind },
    { auth: true },
  );
  return { amountCents: amount_cents };
}

/** Where a user manages their subscription when the portal isn't available. */
export const LINK_MANAGE_URL = 'https://link.com';

/**
 * Open the subscription-management surface for the signed-in user.
 *
 * Prefers a Stripe Billing customer-portal session (deep-links straight to
 * THEIR subscription — cancel, update card, receipts). Under Managed
 * Payments the portal may be unavailable (Link is the merchant of record),
 * so on any failure this falls back to the generic link.com — never a dead
 * end. Returns the URL it navigated to (or null if it couldn't).
 */
export async function openBillingPortal(): Promise<string> {
  try {
    const { url } = await postJson<{ url: string | null }>(
      '/billing/portal',
      {},
      { auth: true },
    );
    if (url) return url;
  } catch {
    // Portal unavailable/unconfigured under MoR, or no customer — fall
    // through to the Link homepage where the user can still find their
    // Postr subscription.
  }
  return LINK_MANAGE_URL;
}
