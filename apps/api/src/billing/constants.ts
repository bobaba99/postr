/**
 * Billing constants shared by billing.ts and the billing/ modules.
 * Kept in one place so the refund reconciler and the self-serve refund
 * path compute credits/amounts from the same numbers.
 */

/** How many export credits a pack purchase grants. */
export const PACK_EXPORT_CREDITS = 3;

/** The pack price in cents (CA$9.99) — the basis for the per-credit refund. */
export const PACK_PRICE_CENTS = 999;

/** What a user can ask to refund (and what the ledger's `kind` accepts). */
export type RefundKind = 'term' | 'pack';

/**
 * Credits to revoke for a refund of `amountCents` on a pack: the flat
 * per-credit rate (PACK_PRICE_CENTS / PACK_EXPORT_CREDITS), rounded,
 * capped at one pack and never negative. Pure; exported for tests.
 */
export function packCreditsForRefundAmount(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const perCredit = PACK_PRICE_CENTS / PACK_EXPORT_CREDITS;
  return Math.min(PACK_EXPORT_CREDITS, Math.round(amountCents / perCredit));
}

/**
 * First finite, non-negative integer-ish number among the candidates,
 * else 0. Stripe amounts are integers in the smallest unit; this keeps a
 * missing/NaN field from ever reaching the ledger (`amount_cents` has a
 * `>= 0` CHECK and would reject NaN/null with a 500 anyway).
 */
export function finiteCents(...candidates: Array<unknown>): number {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return Math.round(c);
  }
  return 0;
}

/**
 * A term refund counts as the WHOLE term only when it returns at least
 * this fraction of what the invoice collected (rounding / fee-adjusted
 * refunds of a few cents are still "full"). Anything smaller is a
 * goodwill partial: the customer keeps the term.
 */
export const TERM_FULL_REFUND_FRACTION = 0.95;

/**
 * Is a refund of `amountCents` a substantially full refund of an invoice
 * that collected `paidCents`? Unknown / zero `paidCents` (an invoice
 * shape without `amount_paid`) counts as full — that is the pre-existing
 * behaviour for a term refund and the self-serve path always refunds in
 * full. Pure; exported for tests.
 */
export function isSubstantiallyFullRefund(amountCents: number, paidCents: number): boolean {
  if (!Number.isFinite(paidCents) || paidCents <= 0) return true;
  return amountCents >= Math.floor(paidCents * TERM_FULL_REFUND_FRACTION);
}
