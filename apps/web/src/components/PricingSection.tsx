/**
 * PricingSection — the three-tier pricing comparison.
 *
 * Lives on the standalone /pricing page (pages/Pricing.tsx), and is a
 * separate component so the same comparison can be reused in an in-app
 * upgrade modal later without duplication. The page owns the hero H1;
 * this section leads with an H2 so the heading order stays valid.
 *
 * Free · Deck pack · Term. Decided 2026-07-28
 * (docs/plans/2026-07-28-pricing-and-market-strategy.md):
 *   - Term $18.99 / 4 months = $4.75/mo, under the ~$5 student ceiling.
 *   - Deck pack $9.99 / 3 exports — priced to clear the payment-fee trap
 *     ($4.99 kept only 82% after fees; $9.99 keeps 88%) while staying a
 *     cheap entry that recruits price-sensitive users rather than
 *     cannibalising the term.
 *   - The TERM is marked "Recommended". Research (Chernev choice-overload
 *     meta-analysis, NN/g wizards) ruled OUT a plan-selector quiz for a
 *     3-tier / one-variable choice — a comparison table + a "recommended"
 *     highlight + a one-line "which should I pick?" helper delivers the
 *     same guidance with none of the friction. This component is that.
 *
 * Copy names the workflow, never a capability, and makes no AI claim
 * (feedback_marketing_no_ai_framing). Every line is checked against what
 * the product actually does: editing + watermarked PDF are free today;
 * PPTX/LaTeX export and talk export are the paid line.
 *
 * NOTE: no checkout is wired yet — the CTAs route to signup. Billing is
 * Sequence 1 (docs/plans/2026-07-28-payment-and-paywall.md); this section
 * ships the pricing story ahead of it so the free/paid line is on the
 * home page and export is never a surprise.
 */
import { Link } from 'react-router';

interface Tier {
  id: string;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  /** Rendered as the primary (recommended) column. */
  featured?: boolean;
  /**
   * Talk generation/export isn't built yet (docs/plans/2026-07-28-
   * paper-to-talk.md, NOT BUILT). A coming-soon tier advertises the
   * planned price and collects a waitlist instead of a live purchase, so
   * the page never sells an artifact the product can't produce.
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
    ctaTo: '/auth?guest=1',
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
    price: '$18.99',
    cadence: 'for 4 months',
    tagline: 'The full workflow, all term. About $4.75 a month.',
    featured: true,
    cta: 'Get the term',
    ctaTo: '/auth',
    forWho: 'Presenting through the term, or making several posters.',
    // Only shipped features. "Turn a paper into a talk" is deliberately
    // NOT listed here — it isn't built, and the term must advertise only
    // what a buyer gets today (PPTX + LaTeX export both ship). The talk
    // feature lives in the coming-soon pack below.
    features: [
      'Everything in Free — no watermark',
      'Export to PowerPoint & LaTeX',
      'Keep editing your poster anywhere',
      'One payment, no renewal — it just ends',
    ],
  },
  {
    id: 'pack',
    name: 'Deck pack',
    price: '$9.99',
    cadence: 'one-time · 3 talks',
    tagline: 'Turn a paper into a conference talk. Landing soon.',
    comingSoon: true,
    cta: 'Join the waitlist',
    ctaTo: '/auth',
    forWho: 'A one-off talk, without committing to a term.',
    features: [
      'Turn a paper into a slide deck',
      'Export 3 talks — PowerPoint & PDF',
      'No subscription, no term',
      'Waitlist members get their first deck free',
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
        Just printing a poster? Free covers it. Presenting all term or making several? The term
        pays for itself after two exports. Talks are coming soon.
      </p>
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
