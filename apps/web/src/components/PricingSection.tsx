/**
 * PricingSection — the three-tier pricing comparison.
 *
 * Lives on the standalone /pricing page (pages/Pricing.tsx), and is a
 * separate component so the same comparison can be reused in an in-app
 * upgrade modal later without duplication. The page owns the hero H1;
 * this section leads with an H2 so the heading order stays valid.
 *
 * Free · Export pack · Term. Decided 2026-07-28
 * (docs/plans/2026-07-28-pricing-and-market-strategy.md):
 *   - Term CA$18.99 every 4 months — a RECURRING subscription (auto-
 *     renews, cancel anytime), ~CA$4.75/mo, under the ~$5 student ceiling.
 *   - Export pack CA$9.99 / 3 exports — a ONE-TIME purchase whose credits
 *     never expire; priced to clear the payment-fee trap ($4.99 kept only
 *     82% after fees; $9.99 keeps 88%) while staying a cheap entry that
 *     recruits price-sensitive users rather than cannibalising the term.
 *   - The TERM is marked "Recommended". Research (Chernev choice-overload
 *     meta-analysis, NN/g wizards) ruled OUT a plan-selector quiz for a
 *     3-tier / one-variable choice — a comparison table + a "recommended"
 *     highlight + a one-line "which should I pick?" helper delivers the
 *     same guidance with none of the friction. This component is that.
 *
 * Copy names the workflow, never a capability, and makes no AI claim
 * (feedback_marketing_no_ai_framing). Every line is checked against what
 * the product actually does: editing + watermarked PDF are free today;
 * PPTX/LaTeX export is the paid line.
 *
 * The paid tier CTAs route to /auth?plan=<sku> — the account-first
 * checkout flow: a signed-out user creates a REAL account (never guest,
 * for a paid plan) and is then handed straight to Stripe for the plan
 * they chose (Auth.tsx resolves the intent). A signed-in user skips the
 * form and goes straight to checkout. The free tier goes to /p/new (the
 * no-auth editor — EnsureSession mints the guest session there). The
 * in-editor export paywall (EditableExportButtons) also starts checkout,
 * for users who hit the wall mid-export.
 *
 * Refund rule in front of the buyer BEFORE purchase (owner rule,
 * 2026-09-11): each paid card carries its plan-specific refund line right
 * under the CTA, and the fine print under the grid links to Terms §7.2.
 * Wording is shared with the paywall and /auth via data/refundCopy.ts.
 *
 * Duplicate-term guard (P0-2): the term is a recurring subscription, so a
 * signed-in holder of an ACTIVE term must not be offered a second one.
 * The term card swaps its CTA for a "You already have an active term"
 * notice once usePlan reports hasActiveTerm (never while loading — no
 * flash). The pack stays purchasable: credits stack on top of a term.
 *
 * <TalkWaitlistCallout /> (the paper-to-talk launch list) is no longer
 * rendered under the grid: deactivated — see routes.tsx header. The
 * component, data/talkWaitlist.ts and the talk_waitlist table remain.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '@/lib/supabase';
import { isOnTalkWaitlist, joinTalkWaitlist } from '@/data/talkWaitlist';
import { usePlan } from '@/hooks/usePlan';
import { REFUND_LINE, REFUND_TERMS_PATH } from '@/data/refundCopy';

export interface PricingTier {
  readonly id: string;
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  /** Rendered as the primary (recommended) column. */
  readonly featured?: boolean;
  readonly cta: string;
  readonly ctaTo: string;
  /** Plain-language "who is this for". */
  readonly forWho: string;
  /** Essential purchase condition that must remain visible. */
  readonly condition: string;
  /** The two core capabilities; secondary details stay out of the card. */
  readonly features: readonly [string, string];
  /** The plan's refund rule, shown right under the CTA (paid tiers only). */
  readonly refund?: string;
}

export const PRICING_TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'always',
    cta: 'Start free',
    ctaTo: '/p/new',
    forWho: 'For one poster you can print or present.',
    condition: 'Includes a small Postr mark.',
    features: [
      'Unlimited editing and every design tool.',
      'Print-ready PDF export.',
    ],
  },
  {
    id: 'term',
    name: 'Term',
    price: 'CA$18.99',
    cadence: 'every 4 months',
    featured: true,
    cta: 'Get the term',
    ctaTo: '/auth?plan=term',
    forWho: 'For repeated posters and editable exports all term.',
    condition: 'Renews every four months. Cancel anytime.',
    features: [
      'PowerPoint and LaTeX exports with no watermark.',
      'Keep editing your posters anywhere.',
    ],
    refund: REFUND_LINE.term,
  },
  {
    id: 'pack',
    name: 'Export pack',
    price: 'CA$9.99',
    cadence: 'one-time · 3 exports',
    cta: 'Get the pack',
    ctaTo: '/auth?plan=pack',
    forWho: 'For a few editable exports without a subscription.',
    condition: 'One-time purchase. Credits never expire.',
    features: [
      'Three PowerPoint or LaTeX exports.',
      'Purchased exports have no watermark.',
    ],
    refund: REFUND_LINE.pack,
  },
] as const satisfies readonly PricingTier[];

export function PricingSection() {
  const plan = usePlan();
  const termActive = !plan.loading && plan.hasActiveTerm;
  return (
    <section className="mx-auto w-full max-w-5xl px-8 pb-24" aria-labelledby="pricing-heading">
      <div className="text-center">
        <h2
          id="pricing-heading"
          className="text-2xl font-semibold tracking-[-0.01em] text-[#e2e2e8] sm:text-3xl"
        >
          Choose your export access
        </h2>
      </div>

      <div
        data-pricing-grid
        className="mt-10 grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3"
      >
        {PRICING_TIERS.map((tier) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            alreadyOwned={tier.id === 'term' && termActive}
          />
        ))}
      </div>

      {/* The refund rule, in one place for the whole section, linking to
          the full Terms wording — every buyer passes this before a CTA. */}
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-[#a3a7b3]">
        A term is refundable in full within 14 days of a charge, a pack until
        its first export; taking a paid export ends either refund. Full details
        in the{' '}
        <Link
          to={REFUND_TERMS_PATH}
          className="font-medium text-[#b4a9f5] underline-offset-4 hover:underline"
        >
          refund terms
        </Link>
        .
      </p>

      {/* <TalkWaitlistCallout /> — deactivated, not deleted; see routes.tsx header. */}
    </section>
  );
}

function PricingCard({
  tier,
  alreadyOwned,
}: {
  tier: PricingTier;
  /** The signed-in user already holds this plan — show a notice, not a CTA. */
  alreadyOwned: boolean;
}) {
  const base = tier.featured
    ? 'relative rounded-2xl border-2 border-[#7c6aed] bg-[#14121e] p-6 shadow-[0_0_0_1px_rgba(124,106,237,0.15),0_18px_50px_-12px_rgba(124,106,237,0.35)] lg:-mt-3 lg:mb-3'
    : 'relative rounded-2xl border border-[#1f1f2e] bg-[#111118] p-6';

  return (
    <div className={base}>
      {tier.featured && (
        // #5641b8 (not #7c6aed): white on the brand violet is only 4.08:1
        // — below AA. The darker step is 7.38:1. Border/accents keep the
        // brighter brand; only the white-text surfaces darken.
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#5641b8] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
          Recommended
        </span>
      )}
      <h3 className="text-lg font-semibold text-[#e2e2e8]">{tier.name}</h3>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-3xl font-bold tracking-tight text-white">{tier.price}</span>
        <span className="text-sm text-[#8b8f99]">{tier.cadence}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#a3a7b3]">{tier.forWho}</p>
      <p className="mt-3 text-sm font-medium leading-relaxed text-[#c8cad0]">
        {tier.condition}
      </p>

      {alreadyOwned ? (
        <div
          role="status"
          className="mt-5 rounded-lg border border-[#7c6aed]/40 bg-[#1a1a26] px-5 py-2.5 text-center text-sm text-[#c8cad0]"
        >
          You already have an active term.{' '}
          <Link to="/profile" className="font-semibold text-[#b4a9f5] underline-offset-4 hover:underline">
            Manage it
          </Link>
        </div>
      ) : (
        <Link
          to={tier.ctaTo}
          className={
            tier.featured
              ? 'mt-5 block rounded-lg bg-[#5641b8] px-5 py-2.5 text-center text-sm font-semibold text-white no-underline transition-colors hover:bg-[#4c39a6]'
              : 'mt-5 block rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-center text-sm font-semibold text-[#c8cad0] no-underline transition-colors hover:border-[#7c6aed]'
          }
        >
          {tier.cta}
        </Link>
      )}
      {tier.refund && (
        <p className="mt-2.5 text-center text-xs leading-relaxed text-[#a3a7b3]">
          {tier.refund}
        </p>
      )}

      <details className="mt-4 rounded-lg border border-[#2a2a3a] px-3 py-2 sm:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-[#c8cad0]">
          What’s included
        </summary>
        <FeatureList features={tier.features} className="mt-3 flex flex-col gap-2.5" />
      </details>
      <FeatureList
        features={tier.features}
        className="mt-4 hidden flex-col gap-2.5 sm:flex"
      />
    </div>
  );
}

function FeatureList({
  features,
  className,
}: {
  features: PricingTier['features'];
  className: string;
}) {
  return (
    <ul className={className}>
      {features.map((feature) => (
        <li
          key={feature}
          className="flex items-start gap-2.5 text-sm leading-snug text-[#a3a7b3]"
        >
          <svg
            className="mt-0.5 shrink-0 text-[#7c6aed]"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Paper-to-talk waitlist callout.
 *
 * DEACTIVATED — not rendered anywhere (see routes.tsx header); exported
 * so it stays a reachable, type-checked module rather than dead local
 * code. Re-mount it under the tier grid to bring the launch list back.
 *
 * The talk feature is deferred (docs/plans/2026-07-28-paper-to-talk.md).
 * This captures interest so there's a list to notify on launch. A
 * signed-in user joins in place; a signed-out one is sent to sign in and
 * lands back here to join. State: checking → (signed-out | can-join |
 * joined). The talk feature is never advertised as buyable — only as
 * "coming, want to know?".
 */
export function TalkWaitlistCallout() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const isIn = !!data.session && data.session.user.is_anonymous !== true;
      if (cancelled) return;
      setSignedIn(isIn);
      if (isIn) setJoined(await isOnTalkWaitlist());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleJoin() {
    if (signedIn === false) {
      // Send them to sign in, returning here to finish joining.
      navigate('/auth?next=/pricing');
      return;
    }
    setBusy(true);
    const ok = await joinTalkWaitlist();
    setBusy(false);
    if (ok) setJoined(true);
  }

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col items-start justify-between gap-4 rounded-xl border border-[#2a2a3a] bg-[#0f0f18] p-4 text-left sm:flex-row sm:items-center">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7c6aed]">
          Coming soon
        </div>
        <h3 className="mt-1 text-base font-semibold text-[#e2e2e8]">
          Paper-to-talk is next
        </h3>
        <p className="mt-1 text-sm text-[#9ca3af]">Join the launch list.</p>
      </div>
      {joined ? (
        <p className="text-sm font-medium text-[#4cc48c]">
          ✓ You&apos;re on the list.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleJoin}
          disabled={busy || signedIn === null}
          className="shrink-0 rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2.5 text-sm font-semibold text-[#c8cad0] transition-colors hover:border-[#7c6aed] disabled:opacity-60"
        >
          {busy ? 'Joining…' : signedIn === false ? 'Sign in to join the waitlist' : 'Join the waitlist'}
        </button>
      )}
    </div>
  );
}
