/**
 * The refund rule, as shown to a buyer BEFORE purchase (owner rule,
 * 2026-09-11): a pack is refundable in full only until its first
 * PowerPoint/LaTeX export (then nothing, not even in part); a term is
 * refundable within 14 days of a charge only if no paid export was taken
 * in that period.
 *
 * The canonical wording is Terms §7.2 (pages/Terms.tsx) and the Profile
 * subscription panel (profile/SubscriptionPanel.tsx) — keep the numbers
 * and conditions here identical to those. Rendered on the /pricing cards
 * (components/PricingSection.tsx), the in-editor paywall
 * (poster/sidebar/EditableExportButtons.tsx) and the /auth?plan=
 * checkout-resume banner (pages/Auth.tsx). These client surfaces are the
 * ONLY place the rule can appear before payment: the Stripe-hosted page
 * cannot carry it — Stripe rejects `custom_text` together with Managed
 * Payments ("You cannot use custom_text with Managed Payments.", sandbox
 * 2026-09-11; see apps/api/src/billing.ts create-checkout). Plain
 * language, no capability claims, at most two short sentences per line.
 */

/** One line per self-serve plan. A free PDF export never counts. */
export const REFUND_LINE = {
  term: 'Full refund within 14 days of a charge if you haven’t taken a paid export.',
  pack: 'Full refund until your first export. No refund after, even in part.',
} as const;

export type RefundLinePlan = keyof typeof REFUND_LINE;

/**
 * One line covering both plans, for a surface that offers both CTAs at
 * once (the in-editor paywall).
 */
export const REFUND_LINE_BOTH =
  'Term: full refund within 14 days of a charge if you haven’t taken a paid export. Pack: full refund until your first export, none after — even in part.';

/** Where the full rule lives (Terms §7.2 anchor). */
export const REFUND_TERMS_PATH = '/terms#refunds';

/**
 * The refund line for a checkout plan, or null for a plan with no
 * self-serve refund rule (the dormant review SKUs are refunded manually).
 */
export function refundLineFor(plan: string): string | null {
  return plan === 'term' || plan === 'pack' ? REFUND_LINE[plan] : null;
}
