/**
 * Pricing page — the standalone /pricing route.
 *
 * A dedicated page rather than a landing-page section: the home page is
 * reserved for the hero, tools, and (later) user reviews. Pricing gets
 * its own room so the free/paid comparison can breathe and be linked to
 * directly (from the nav, the footer, and the upgrade prompts once
 * billing ships).
 *
 * The tier cards live in PricingSection so the same comparison can be
 * reused elsewhere (e.g. an in-app upgrade modal) without duplication.
 * Decisions behind the tiers: docs/plans/2026-07-28-pricing-and-market-
 * strategy.md.
 *
 * In English at /pricing and in French at /pricing/fr (fix 26): the copy
 * is in i18n/pricing.ts; the French cards send a buyer to /auth/fr.
 */
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { PricingSection } from '@/components/PricingSection';
import { PRICING_COPY } from '@/i18n/pricing';
import { localizedPath, useLang } from '@/i18n/lang';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function Pricing() {
  const lang = useLang();
  const c = PRICING_COPY[lang];
  useDocumentMeta(STATIC_ROUTE_META[localizedPath('/pricing', lang)] ?? null);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-8 pb-8 pt-20 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          {c.eyebrow}
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          {c.titleLead}
          <br />
          <span className="text-[#7c6aed]">{c.titleAccent}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[14pt] leading-relaxed text-[#9ca3af]">
          {c.lead}
        </p>
      </section>

      <PricingSection lang={lang} />

      <PublicFooter />
    </main>
  );
}
