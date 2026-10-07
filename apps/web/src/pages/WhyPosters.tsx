/**
 * WhyPosters — the "what a poster session actually teaches you" page.
 *
 * Sits under the footer's Learn column alongside About. Where About is
 * a feature tour, this page is about the *activity*: what presenting a
 * poster does for the person presenting it, and which of those skills
 * keep paying off after the conference badge comes off.
 *
 * Deliberately not a feature pitch. Postr appears once, at the end, as
 * a way to act on the advice — naming the workflow, never a capability
 * claim. Nothing here asserts an outcome the product delivers.
 *
 * In English at /why-posters and in French at /why-posters/fr (fix 26):
 * the copy is in i18n/whyPosters.ts.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { WHY_POSTERS_COPY } from '@/i18n/whyPosters';
import { localizedPath, useLang } from '@/i18n/lang';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function WhyPosters() {
  const lang = useLang();
  const c = WHY_POSTERS_COPY[lang];
  useDocumentMeta(STATIC_ROUTE_META[localizedPath('/why-posters', lang)] ?? null);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-8 pb-12 pt-20 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          {c.eyebrow}
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          {c.titleLead}
          <br />
          <span className="text-[#7c6aed]">{c.titleAccent}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[14pt] leading-relaxed text-[#9ca3af]">
          {c.intro}
        </p>
      </section>

      {/* Skills */}
      <section className="mx-auto w-full max-w-4xl px-8 pb-8">
        <ul className="flex list-none flex-col gap-6 p-0">
          {c.skills.map((skill, i) => (
            <li
              key={skill.id}
              className="rounded-2xl border border-[#2a2a3a] bg-[#111118] p-8"
            >
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[11px] font-semibold tabular-nums tracking-[0.2em] text-[#7c6aed]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  {skill.title}
                </h2>
              </div>
              <p className="text-[13pt] leading-relaxed text-[#9ca3af]">
                {skill.atTheSession}
              </p>
              {/*
                A real heading + paragraph rather than a span, a <br />,
                and body text: the label names the paragraph under it, so
                the relationship should be in the markup and not only in
                the styling. Body colour is #9ca3af (7.4:1 on this card)
                — #6b7280 measured 3.89:1 at this size, under the 4.5:1
                AA floor, and 16px is too small for the large-text
                exemption. The left border carries the de-emphasis.
              */}
              <div className="mt-4 border-l-2 border-[#2a2a3a] pl-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c6aed]">
                  {c.laterOnHeading}
                </h3>
                <p className="mt-1 text-[12pt] leading-relaxed text-[#9ca3af]">
                  {skill.laterOn}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Practical note */}
      <section className="mx-auto w-full max-w-3xl px-8 py-12">
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#0f0f18] p-8">
          <h2 className="mb-4 text-2xl font-bold text-white">
            {c.tipsTitle}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0 text-[13pt] leading-relaxed text-[#9ca3af]">
            {c.tips.map((tip) => (
              <li key={tip.lead}>
                <strong className="text-[#c8cad0]">{tip.lead}</strong>{' '}
                {tip.body}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Close */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-8 pb-24">
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#111118] p-10">
          <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
            {c.closeTitle}
          </h2>
          <p className="mb-6 text-[13pt] leading-relaxed text-[#9ca3af]">
            {c.closeBody}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={localizedPath('/', lang)}
              className="rounded-md bg-[#5641b8] px-5 py-2.5 text-[14pt] font-semibold text-white no-underline hover:bg-[#4c39a6]"
            >
              {c.startPoster}
            </Link>
            <Link
              to={localizedPath('/about', lang)}
              className="rounded-md border border-[#2a2a3a] px-5 py-2.5 text-[14pt] font-semibold text-[#c8cad0] no-underline hover:border-[#7c6aed] hover:text-white"
            >
              {c.seeHow}
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
