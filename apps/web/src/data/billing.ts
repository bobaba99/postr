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
