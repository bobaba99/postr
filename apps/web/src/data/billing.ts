/**
 * Billing client — thin wrappers over the authed API billing routes.
 *
 * Checkout runs through Stripe Managed Payments (an MoR); the server
 * creates the session and returns its hosted URL. Credit consumption is
 * server-side because export_credits is server-owned (a browser cannot
 * touch it). See apps/api/src/billing.ts and
 * docs/plans/2026-07-28-payment-and-paywall.md.
 */
import { ApiError, postJson } from '@/lib/apiClient';

export type BillingSku = 'term' | 'pack' | 'review_pack' | 'review_addon';

/**
 * The machine-readable code the API puts in `{ error }` on a failure —
 * null when the error isn't an ApiError or carries no code.
 */
export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: unknown } | null | undefined;
  return typeof body?.error === 'string' ? body.error : null;
}

/**
 * The caller already holds an active term — create-checkout refused a
 * second subscription (409 already_subscribed, P0-2). Surfaces as "You
 * already have an active term" on every checkout entry point.
 */
export class AlreadySubscribedError extends Error {
  constructor() {
    super('already_subscribed');
    this.name = 'AlreadySubscribedError';
  }
}

export function isAlreadySubscribedError(err: unknown): err is AlreadySubscribedError {
  return err instanceof AlreadySubscribedError;
}

/**
 * The credit balance was already zero when a credit-based export tried to
 * spend one (409 no_credit, H-8). The export bytes were already produced,
 * so the caller zeroes its local balance and raises the paywall rather
 * than failing the export.
 */
export class NoExportCreditError extends Error {
  constructor() {
    super('no_credit');
    this.name = 'NoExportCreditError';
  }
}

/** Create a checkout session and return its hosted Stripe URL. */
export async function createCheckout(sku: BillingSku): Promise<string> {
  let url: string | null;
  try {
    ({ url } = await postJson<{ url: string | null }>(
      '/billing/create-checkout',
      { sku },
      { auth: true },
    ));
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && apiErrorCode(err) === 'already_subscribed') {
      throw new AlreadySubscribedError();
    }
    throw err;
  }
  if (!url) throw new Error('checkout session returned no url');
  return url;
}

/**
 * Spend one export credit after a successful credit-based export.
 * Returns the remaining balance so the caller can apply it to plan state
 * (usePlan.applyCredits). Throws NoExportCreditError on 409 no_credit —
 * the balance was already zero. Best-effort for anything else: the export
 * already happened, so a failure is logged, not surfaced — it must never
 * make a completed export look failed.
 */
export async function consumeExportCredit(): Promise<number | null> {
  try {
    const { credits } = await postJson<{ ok: boolean; credits: number }>(
      '/billing/consume-credit',
      {},
      { auth: true },
    );
    return credits;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && apiErrorCode(err) === 'no_credit') {
      throw new NoExportCreditError();
    }
    throw err;
  }
}

/**
 * Mark that a term holder took a paid export (stamps first_paid_export_at
 * server-side, used by the refund eligibility check). Best-effort: the
 * export already happened, so a failure here is logged, not surfaced.
 */
export async function markPaidExport(): Promise<void> {
  await postJson('/billing/mark-export', {}, { auth: true });
}

export interface RefundResult {
  /** What Stripe returned to the card, in cents. */
  amountCents: number;
  /**
   * True when the refund ended the term: the server cancelled the Stripe
   * subscription immediately and dropped the row to the free plan (P0-1),
   * so PowerPoint/LaTeX export is locked again. Always false for a pack.
   */
  subscriptionCancelled: boolean;
}

/**
 * Request a self-serve refund. `kind` is 'term' (14-day, no-export) or
 * 'pack' (unused credits). The server computes eligibility; on success it
 * returns the refunded amount and whether the subscription was cancelled
 * with it. Throws on an ineligible/failed request so the caller can show
 * why. The caller must `plan.refresh()` afterwards — the server changed
 * the billing row.
 */
export async function requestRefund(kind: 'term' | 'pack'): Promise<RefundResult> {
  const { amount_cents, subscription_cancelled } = await postJson<{
    ok: boolean;
    amount_cents: number;
    subscription_cancelled?: boolean;
  }>('/billing/refund', { kind }, { auth: true });
  return {
    amountCents: amount_cents,
    subscriptionCancelled: subscription_cancelled === true,
  };
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
