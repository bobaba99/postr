/**
 * About page — a feature tour told as a vertical timeline.
 *
 * A dotted line runs top to bottom; feature waypoints sit along it,
 * alternating left and right. The design is deliberately abstract —
 * no photos and no illustrations.
 *
 * The decorative line drawings that used to bookend the timeline (a
 * sun/horizon mark, a mountain ridgeline, and a route squiggle behind
 * the closing card) were removed at the owner's request. The dotted
 * road stays: it is structural, not scenery — it is what makes the
 * alternating cards read as one sequence.
 *
 * Also serves as a second home for the feedback feature: the final
 * card ("Shape what ships next") routes the user straight to the
 * feedback modal.
 *
 * In English at /about and in French at /about/fr (fix 26): the copy,
 * and the code behind each milestone's claims, are in i18n/about.ts.
 */
import { useEffect, useRef } from 'react';
import { aboutRoadtrip } from '@/motion/timelines/aboutRoadtrip';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { ABOUT_COPY, type Milestone } from '@/i18n/about';
import { localizedPath, useLang } from '@/i18n/lang';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function About() {
  const lang = useLang();
  const c = ABOUT_COPY[lang];
  useDocumentMeta(STATIC_ROUTE_META[localizedPath('/about', lang)] ?? null);

  const openFeedback = useFeedbackStore((s) => s.open);
  const scopeRef = useRef<HTMLElement>(null);

  /*
    Scroll reveals for the roadtrip. `mm.revert()` kills every
    ScrollTrigger and clears the inline styles on unmount — without it
    the triggers would keep measuring detached nodes after navigating
    away, and a milestone card could be left invisible on return.
  */
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const mm = aboutRoadtrip(scope);
    return () => {
      mm.revert();
    };
  }, []);

  return (
    <main
      ref={scopeRef}
      className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]"
    >
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-8 pt-20 pb-12 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          {c.eyebrow}
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          {c.titleLead}<br />
          <span className="text-[#7c6aed]">{c.titleAccent}</span>
        </h1>
        <p className="mt-6 text-[14pt] text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          {c.intro}
        </p>
        <p className="mt-4 text-[12pt] text-[#8b8f99] leading-relaxed max-w-xl mx-auto">
          {c.makerLead}{' '}
          <span className="font-semibold text-[#c8cad0]">Resila Technologies Inc.</span>{' '}
          {c.makerMiddle}{' '}
          <a
            className="text-[#7c6aed] underline"
            href="mailto:support@resila.ai"
          >
            support@resila.ai
          </a>
          {c.makerTail}
        </p>
      </section>

      {/* Timeline */}
      <section className="relative mx-auto max-w-4xl px-8 pb-20 pt-8">
        <h2 className="sr-only">{c.milestonesHeading}</h2>

        {/* Dotted vertical road — SVG so the dash pattern stays crisp on any zoom. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, #7c6aed 0 6px, transparent 6px 14px)',
            opacity: 0.55,
          }}
        />

        <div className="relative flex flex-col gap-16 py-6">
          {c.milestones.map((m, i) => (
            <TimelineRow key={m.id} milestone={m} side={i % 2 === 0 ? 'left' : 'right'} index={i} />
          ))}
        </div>
      </section>

      {/* Final stop — feedback CTA */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-8 pb-24">
        {/* `relative overflow-hidden` and the inner `relative` wrapper
            went with the route squiggle: overflow-hidden existed only to
            clip it and would now only clip focus rings, and the wrapper
            only existed to stack content above it. */}
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#111118] p-10">
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
              {c.feedbackEyebrow}
            </div>
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
              {c.feedbackTitle}
            </h2>
            <p className="mb-8 max-w-xl text-[14pt] leading-relaxed text-[#9ca3af]">
              {c.feedbackBody}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => openFeedback('bug')}
                className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white transition-colors"
              >
                {c.reportBug}
              </button>
              <button
                onClick={() => openFeedback('feature')}
                className="rounded-lg bg-[#5641b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4c39a6] transition-colors"
              >
                {c.suggestFeature}
              </button>
              <button
                onClick={() => openFeedback('other')}
                className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white transition-colors"
              >
                {c.sayHi}
              </button>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

function TimelineRow({
  milestone,
  side,
  index,
}: {
  milestone: Milestone;
  side: 'left' | 'right';
  index: number;
}) {
  const isLeft = side === 'left';
  return (
    /*
      `data-postr-milestone` carries the SIDE, not just a flag: the
      scroll reveal slides each card in from its own side of the road,
      and reading the direction off the DOM keeps the motion and the
      layout deciding alternation from the same source. Deriving it
      again in the timeline would mean two places to keep in step.
    */
    <div
      data-postr-milestone={side}
      className="relative grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto_1fr]"
    >
      {/* Left card (only when side === left) */}
      <div className={`${isLeft ? 'sm:block' : 'hidden sm:block'}`}>
        {isLeft ? <Card milestone={milestone} align="right" animated /> : null}
      </div>

      {/* Waypoint marker — sits on top of the dotted road */}
      <div className="relative flex items-center justify-center">
        <svg
          data-postr-milestone-marker
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          className="relative z-10"
          aria-hidden="true"
        >
          <circle cx="28" cy="28" r="26" fill="#0a0a12" stroke="#2a2a3a" strokeWidth="1" />
          <circle cx="28" cy="28" r="20" fill="#111118" stroke="#7c6aed" strokeWidth="1.5" />
          <text
            x="28"
            y="33"
            textAnchor="middle"
            fill="#7c6aed"
            fontSize="14"
            fontWeight="700"
            fontFamily="ui-monospace, monospace"
          >
            {String(index + 1).padStart(2, '0')}
          </text>
        </svg>
      </div>

      {/* Right card (only when side === right) */}
      <div className={`${!isLeft ? 'sm:block' : 'hidden sm:block'}`}>
        {!isLeft ? <Card milestone={milestone} align="left" animated /> : null}
      </div>

      {/*
        Mobile fallback — always show the card below the marker.

        This renders a SECOND copy of the same card; the two are shown
        and hidden by breakpoint, never both at once. Only the desktop
        copy is marked `animated`, so the desktop timeline's selector
        cannot match two nodes for one milestone and slide the hidden
        one as well. The mobile branch targets the row and animates
        whichever card is actually visible.
      */}
      <div className="sm:hidden">
        <Card milestone={milestone} align="left" />
      </div>
    </div>
  );
}

function Card({
  milestone,
  align,
  animated = false,
}: {
  milestone: Milestone;
  align: 'left' | 'right';
  animated?: boolean;
}) {
  return (
    <div
      data-postr-milestone-card={animated ? '' : undefined}
      className={`relative rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 ${
        align === 'right' ? 'sm:text-right' : 'sm:text-left'
      }`}
    >
      <h3 className="mb-3 text-[18pt] font-semibold leading-tight text-[#7c6aed]">
        {milestone.title}
      </h3>
      <p className="text-[14pt] leading-relaxed text-white">{milestone.body}</p>
    </div>
  );
}
