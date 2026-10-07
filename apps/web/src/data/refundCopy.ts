/**
 * The refund rule, as shown to a buyer BEFORE purchase (owner rule,
 * 2026-09-11): a pack is refundable in full only while no export credit
 * has been used (then nothing, not even in part); a term is refundable
 * within 14 days of a charge only if no paid export was taken in that
 * period.
 *
 * Pack wording names the CREDIT, not "the first export": credits are one
 * pooled counter (users.export_credits), so the server refuses a pack
 * refund once ANY credit is spent (apps/api/src/billing/packRefund.ts
 * packRefundEligible), and a term holder's exports never spend a credit
 * (billing.ts /billing/mark-export), so a term export does not end a pack
 * refund. "Until your first export" was wrong in both directions.
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
 *
 * In English and in French (fix 26): the French /pricing/fr cards and
 * /auth/fr show `REFUND_LINES.fr`, with the French Terms' conditions and
 * terms (TermsFr.tsx §7.2: « remboursement intégral », « facturation »,
 * « crédit d’exportation »), not its sentences. The editor's paywall is
 * English for now.
 */
import type { Bilingual, Lang } from '@/i18n/lang';

/** One line per self-serve plan. A free PDF export never counts. */
export const REFUND_LINES: Bilingual<{ readonly term: string; readonly pack: string }> = {
  en: {
    term: 'Full refund within 14 days of a charge if you haven’t taken a paid export.',
    pack: 'Full refund until you use an export credit. No refund after, even in part.',
  },
  fr: {
    term: 'Remboursement intégral dans les 14\u00a0jours suivant une facturation si vous n’avez fait aucune exportation payante.',
    pack: 'Remboursement intégral jusqu’à ce que vous utilisiez un crédit d’exportation. Aucun remboursement ensuite, même partiel.',
  },
};

/** The English lines (the editor's paywall, and callers that predate the French pages). */
export const REFUND_LINE = REFUND_LINES.en;

export type RefundLinePlan = keyof typeof REFUND_LINE;

/**
 * One line covering both plans, for a surface that offers both CTAs at
 * once (the in-editor paywall).
 */
export const REFUND_LINE_BOTH =
  'Term: full refund within 14 days of a charge if you haven’t taken a paid export. Pack: full refund until you use an export credit, none after, even in part.';

/** Where the full rule lives (Terms §7.2 anchor; TermsFr.tsx has the same id). */
export const REFUND_TERMS_PATH = '/terms#refunds';

/**
 * The refund line for a checkout plan, or null for a plan with no
 * self-serve refund rule (the dormant review SKUs are refunded manually).
 */
export function refundLineFor(plan: string, lang: Lang = 'en'): string | null {
  return plan === 'term' || plan === 'pack' ? REFUND_LINES[lang][plan] : null;
}
