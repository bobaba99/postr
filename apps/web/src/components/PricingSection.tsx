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
 * PPTX/LaTeX export is the paid line (talk export joins it when built).
 *
 * The paid tier CTAs route to /auth?plan=<sku> — the account-first
 * checkout flow: a signed-out user creates a REAL account (never guest,
 * for a paid plan) and is then handed straight to Stripe for the plan
 * they chose (Auth.tsx resolves the intent). A signed-in user skips the
 * form and goes straight to checkout. The free tier keeps ?guest=1. The
 * in-editor export paywall (EditableExportButtons) also starts checkout,
 * for users who hit the wall mid-export. The card at the bottom collects
 * paper-to-talk waitlist interest for the deferred feature.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '@/lib/supabase';
import { isOnTalkWaitlist, joinTalkWaitlist } from '@/data/talkWaitlist';

interface Tier {
  id: string;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  /** Rendered as the primary (recommended) column. */
  featured?: boolean;
  /**
   * Marks a tier as not-yet-purchasable (dashed border, "Coming soon"
   * badge, no live checkout). Currently unused — all three tiers sell
   * live products (the pack sells poster PPTX/LaTeX exports, which ship
   * today). Kept for when a genuinely-staged tier is needed again.
   */
  comingSoon?: boolean;
  cta: string;
  ctaTo: string;
  /** Plain-language "who is this for". */
  forWho: string;
  features: string[];
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'always',
    tagline: 'Everything you need to build and print a poster.',
    cta: 'Start free',
    ctaTo: '/p/new',
    forWho: 'Making a poster and printing or presenting it.',
    features: [
      'Unlimited editing, every tool',
      'PDF export — print-ready',
      'Paper to poster',
      'Plot picker & figure checker',
      'A small “made with postr.sh” mark on the PDF',
    ],
  },
  {
    id: 'term',
    name: 'Term',
    price: 'CA$18.99',
    cadence: 'every 4 months',
    tagline: 'The full workflow, all term. About CA$4.75 a month, cancel anytime.',
    featured: true,
    cta: 'Get the term',
    ctaTo: '/auth?plan=term',
    forWho: 'Presenting through the term, or making several posters.',
    // Only shipped features. "Turn a paper into a talk" is deliberately
    // NOT listed here — it isn't built, and the term must advertise only
    // what a buyer gets today (PPTX + LaTeX export both ship). The talk
    // feature lives in the coming-soon pack below.
    features: [
      'Everything in Free — no watermark',
      'Export to PowerPoint & LaTeX',
      'Keep editing your poster anywhere',
      'Renews every 4 months — cancel anytime',
    ],
  },
  {
    id: 'pack',
    name: 'Export pack',
    price: 'CA$9.99',
    cadence: 'one-time · 3 exports',
    tagline: 'Just need a couple of clean exports? Pay only for those — credits never expire.',
    cta: 'Get the pack',
    ctaTo: '/auth?plan=pack',
    forWho: 'A one-off export, without committing to a term.',
    features: [
      'Export 3 posters to PowerPoint or LaTeX',
      'No watermark on those exports',
      'Credits never expire — use them whenever',
      'No subscription, no term',
      'Talk export counts too, when it lands',
    ],
  },
];

export function PricingSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-8 pb-24" aria-labelledby="pricing-heading">
      <div className="text-center">
        <h2
          id="pricing-heading"
          className="text-2xl font-semibold tracking-[-0.01em] text-[#e2e2e8] sm:text-3xl"
        >
          Simple pricing, no surprises
        </h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-sm leading-relaxed text-[#8b8f99]">
          Editing and PDF export are <span className="text-[#c8cad0]">always free</span> — with a
          small “made with postr.sh” mark. You only pay to export to PowerPoint or LaTeX.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 items-start gap-5 md:grid-cols-3">
        {TIERS.map((tier) => (
          <PricingCard key={tier.id} tier={tier} />
        ))}
      </div>

      {/*
        The one-line "which should I pick?" helper — the research-backed
        replacement for a plan-selector quiz. Answers the single variable
        (one-off vs. repeated use) in a sentence, with no extra step.
      */}
      <p className="mx-auto mt-8 max-w-[60ch] text-center text-sm leading-relaxed text-[#8b8f99]">
        <span className="font-semibold text-[#c8cad0]">Which should I pick?</span>{' '}
        Just printing a poster? Free covers it. Need one or two clean exports? Grab the pack.
        Exporting through the term, or making several? The term pays for itself after two.
      </p>

      <TalkWaitlistCallout />
    </section>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  // Card background sets which "check" the features use; the coming-soon
  // tier is dimmed and its checks become a "planned" clock so it never
  // reads as already-available.
  const base = tier.featured
    ? 'relative rounded-2xl border-2 border-[#7c6aed] bg-[#14121e] p-6 shadow-[0_0_0_1px_rgba(124,106,237,0.15),0_18px_50px_-12px_rgba(124,106,237,0.35)] md:-mt-3 md:mb-3'
    : tier.comingSoon
      ? 'relative rounded-2xl border border-dashed border-[#33334a] bg-[#0e0e16] p-6'
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
      {tier.comingSoon && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[#33334a] bg-[#1a1a26] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#a3a7b3]">
          Coming soon
        </span>
      )}

      <h3 className="text-lg font-semibold text-[#e2e2e8]">{tier.name}</h3>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-white">{tier.price}</span>
        <span className="text-sm text-[#8b8f99]">{tier.cadence}</span>
      </div>
      <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-[#a3a7b3]">{tier.tagline}</p>

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

      {/* #8b8f99 (5.8:1), not #6b7280 (3.9:1 — below AA for this 12px text). */}
      <p className="mt-5 text-xs font-medium uppercase tracking-wider text-[#8b8f99]">
        {tier.forWho}
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm leading-snug text-[#a3a7b3]">
            <svg
              className={tier.comingSoon ? 'mt-0.5 shrink-0 text-[#6b6b85]' : 'mt-0.5 shrink-0 text-[#7c6aed]'}
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
              {tier.comingSoon ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </>
              ) : (
                <polyline points="20 6 9 17 4 12" />
              )}
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Paper-to-talk waitlist callout.
 *
 * The talk feature is deferred (docs/plans/2026-07-28-paper-to-talk.md).
 * This captures interest so there's a list to notify on launch. A
 * signed-in user joins in place; a signed-out one is sent to sign in and
 * lands back here to join. State: checking → (signed-out | can-join |
 * joined). The talk feature is never advertised as buyable — only as
 * "coming, want to know?".
 */
function TalkWaitlistCallout() {
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
    <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[#2a2a3a] bg-[#0f0f18] p-6 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7c6aed]">
        Coming soon
      </div>
      <h3 className="mt-2 text-lg font-semibold text-[#e2e2e8]">
        Turn a paper into a conference talk
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#9ca3af]">
        We&apos;re building paper-to-talk generation next. Want to know the moment
        it lands?
      </p>
      {joined ? (
        <p className="mt-4 text-sm font-medium text-[#4cc48c]">
          ✓ You&apos;re on the list — we&apos;ll email you when talks are ready.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleJoin}
          disabled={busy || signedIn === null}
          className="mt-4 rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-sm font-semibold text-[#c8cad0] transition-colors hover:border-[#7c6aed] disabled:opacity-60"
        >
          {busy ? 'Joining…' : signedIn === false ? 'Sign in to join the waitlist' : 'Join the waitlist'}
        </button>
      )}
    </div>
  );
}
