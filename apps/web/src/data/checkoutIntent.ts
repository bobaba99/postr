/**
 * Checkout intent — carries a chosen paid plan from the pricing page
 * through account creation and on to Stripe Checkout.
 *
 * Why this exists: a signed-out user who picks a paid plan must first get
 * a REAL account (never guest — a paid entitlement can't hang off a
 * throwaway anonymous session that the cleanup cron may delete), and the
 * plan they chose has to survive that detour. The intent rides in the URL
 * (`/auth?plan=term`) for the normal case, and is mirrored to
 * sessionStorage so it also survives the Google OAuth round-trip, which
 * bounces through Google and back and does not preserve our query string.
 *
 * The account-before-payment ordering is the industry norm for gated SaaS
 * (Stripe binds the session to our user via client_reference_id, so
 * fulfillment and export-gating are unambiguous). See
 * docs/plans/2026-07-28-payment-and-paywall.md.
 */
import { createCheckout, type BillingSku } from '@/data/billing';

/** The paid plans a pricing CTA can pre-select. Mirrors BillingSku. */
export type CheckoutPlan = BillingSku;

const STORAGE_KEY = 'postr.checkoutIntent';
const VALID: readonly CheckoutPlan[] = ['term', 'pack'];

/** Narrow an untrusted string (query param / storage) to a valid plan. */
export function parseCheckoutPlan(value: string | null | undefined): CheckoutPlan | null {
  return value && (VALID as readonly string[]).includes(value)
    ? (value as CheckoutPlan)
    : null;
}

/**
 * Remember the chosen plan across an auth detour. Called right before a
 * redirect that would drop the URL (notably OAuth). Best-effort: private
 * mode or a disabled storage just means we fall back to the URL param.
 */
export function stashCheckoutIntent(plan: CheckoutPlan): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, plan);
  } catch {
    // Storage unavailable — the ?plan= URL param remains the primary path.
  }
}

/** Read a previously-stashed intent (the OAuth-return fallback). */
export function readStashedCheckoutIntent(): CheckoutPlan | null {
  try {
    return parseCheckoutPlan(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Clear the stashed intent once it has been consumed (or abandoned). */
export function clearCheckoutIntent(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Resolve the effective plan for the current auth attempt: an explicit
 * URL param wins, otherwise fall back to whatever was stashed before an
 * OAuth round-trip.
 */
export function resolveCheckoutPlan(planParam: string | null): CheckoutPlan | null {
  return parseCheckoutPlan(planParam) ?? readStashedCheckoutIntent();
}

/**
 * Start checkout for the given plan and hand off to Stripe's hosted page.
 * The caller must already be signed in with a permanent account — the
 * create-checkout route requires it. Clears the stashed intent so a
 * back-navigation doesn't re-trigger. Throws on failure so the caller can
 * surface an error (the user is still on our page at that point).
 */
export async function startCheckoutForPlan(plan: CheckoutPlan): Promise<void> {
  const url = await createCheckout(plan);
  clearCheckoutIntent();
  // Full navigation (not the SPA router) — Stripe's checkout is off-origin.
  window.location.assign(url);
}
