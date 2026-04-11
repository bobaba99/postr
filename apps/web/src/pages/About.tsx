/**
 * About page — a feature tour told as a vertical "roadtrip".
 *
 * A dotted SVG path runs top to bottom; feature waypoints sit along
 * the road, alternating left and right. The design is deliberately
 * abstract — no photos, no illustrations beyond geometric primitives.
 *
 * Also serves as a second home for the feedback feature: the final
 * card ("Shape what ships next") routes the user straight to the
 * feedback modal.
 */
import { Link } from 'react-router-dom';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';

interface Milestone {
  id: string;
  chapter: string;
  title: string;
  body: string;
}

const MILESTONES: Milestone[] = [
  {
    id: 'anonymous',
    chapter: 'Feature 01',
    title: 'Start anywhere, save nothing',
    body:
      "Anonymous session on first click — no sign-up wall. Every keystroke autosaves from before you've even named the poster. When you sign up later, your drafts follow you across devices without a single \"export and re-import\".",
  },
  {
    id: 'templates',
    chapter: 'Feature 02',
    title: 'Templates tuned for conferences',
    body:
      'Five layouts — three-column classic, billboard, sidebar + focus, and more. Discipline-appropriate palettes instead of freeform color pickers. APA, SfN, and ECNP size presets ship built-in so your dimensions are never a guess.',
  },
  {
    id: 'writing',
    chapter: 'Feature 03',
    title: 'Writing guidance, not a blank page',
    body:
      'Each section comes with concrete prompts, word-count targets, and a built-in checklist from intro to conclusion. Rich text for emphasis, Greek-symbol shortcuts for STEM, and a reference manager with citation-style support.',
  },
  {
    id: 'readability',
    chapter: 'Feature 04',
    title: 'Figures readable from three feet',
    body:
      'Paste your R or Python plotting code and Postr checks whether axis labels will actually be legible at print size. Out-of-bounds warnings catch layout slips. No more discovering typography problems at the FedEx counter.',
  },
  {
    id: 'ship',
    chapter: 'Feature 05',
    title: 'Share, iterate, print',
    body:
      "Read-only share links for advisors and co-authors. Undo and redo through the entire session. Asset uploads with per-user storage. Browser print-to-PDF turns a finished draft into a conference-ready sheet — everything you need between \"first draft\" and \"it's on the wall\".",
  },
];

export default function About() {
  const openFeedback = useFeedbackStore((s) => s.open);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-8 pt-20 pb-12 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          What Postr does
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          Everything you need<br />
          <span className="text-[#7c6aed]">to ship a great poster.</span>
        </h1>
        <p className="mt-6 text-base text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          Postr is an opinionated poster editor built around one idea: constraint is
          a feature. Every default is tuned to produce something print-ready — you
          just fill in the science.
        </p>
      </section>

      {/* Sun + horizon marker above the road */}
      <div className="relative mx-auto flex max-w-3xl items-center justify-center">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <circle cx="36" cy="36" r="14" fill="#7c6aed" opacity="0.9" />
          <circle cx="36" cy="36" r="22" stroke="#7c6aed" strokeWidth="1" opacity="0.35" />
          <circle cx="36" cy="36" r="30" stroke="#7c6aed" strokeWidth="1" opacity="0.2" />
          <line x1="2" y1="36" x2="14" y2="36" stroke="#7c6aed" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="58" y1="36" x2="70" y2="36" stroke="#7c6aed" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="36" y1="2" x2="36" y2="14" stroke="#7c6aed" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      </div>

      {/* Timeline */}
      <section className="relative mx-auto max-w-4xl px-8 pb-20 pt-8">
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
          {MILESTONES.map((m, i) => (
            <TimelineRow key={m.id} milestone={m} side={i % 2 === 0 ? 'left' : 'right'} index={i} />
          ))}
        </div>

        {/* Mountain silhouette — decorative only. Peaks mirror around
            center x=140, valleys mirror too, so the ridgeline is exactly
            symmetric under horizontal flip. */}
        <div className="pointer-events-none mt-8 flex justify-center opacity-40">
          <svg width="280" height="70" viewBox="0 0 280 70" fill="none" aria-hidden="true">
            <path
              d="M0 65 L40 30 L70 48 L100 20 L140 6 L180 20 L210 48 L240 30 L280 65 Z"
              fill="#7c6aed"
              opacity="0.08"
            />
            <path
              d="M0 65 L40 30 L70 48 L100 20 L140 6 L180 20 L210 48 L240 30 L280 65"
              fill="none"
              stroke="#7c6aed"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* Final stop — feedback CTA */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-8 pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-[#2a2a3a] bg-[#111118] p-10">
          {/* Decorative route squiggle in the background */}
          <svg
            className="pointer-events-none absolute -right-8 -top-8 opacity-30"
            width="220"
            height="220"
            viewBox="0 0 220 220"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 110 C 60 40, 160 40, 200 110 S 60 180, 20 110"
              stroke="#7c6aed"
              strokeWidth="2"
              strokeDasharray="4 8"
              strokeLinecap="round"
            />
            <circle cx="20" cy="110" r="5" fill="#7c6aed" />
            <circle cx="200" cy="110" r="5" fill="#7c6aed" opacity="0.5" />
          </svg>

          <div className="relative">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
              Shape what ships next
            </div>
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
              Tell us what's missing.
            </h2>
            <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-[#9ca3af]">
              Every bug report and feature request lands in the developer's queue.
              The loudest feedback wins the most attention — so if something's
              broken, missing, or could be better, say so.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => openFeedback('bug')}
                className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white transition-colors"
              >
                Report a bug
              </button>
              <button
                onClick={() => openFeedback('feature')}
                className="rounded-lg bg-[#7c6aed] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6c5ce7] transition-colors"
              >
                Suggest a feature
              </button>
              <button
                onClick={() => openFeedback('other')}
                className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-5 py-2.5 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white transition-colors"
              >
                Just say hi
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
    <div className="relative grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
      {/* Left card (only when side === left) */}
      <div className={`${isLeft ? 'sm:block' : 'hidden sm:block'}`}>
        {isLeft ? <Card milestone={milestone} align="right" /> : null}
      </div>

      {/* Waypoint marker — sits on top of the dotted road */}
      <div className="relative flex items-center justify-center">
        <svg
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
        {!isLeft ? <Card milestone={milestone} align="left" /> : null}
      </div>

      {/* Mobile fallback — always show the card below the marker */}
      <div className="sm:hidden">
        <Card milestone={milestone} align="left" />
      </div>
    </div>
  );
}

function Card({ milestone, align }: { milestone: Milestone; align: 'left' | 'right' }) {
  return (
    <div
      className={`relative rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 ${
        align === 'right' ? 'sm:text-right' : 'sm:text-left'
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#7c6aed]">
        {milestone.chapter}
      </div>
      <h3 className="mb-2 text-lg font-bold text-[#e2e2e8]">{milestone.title}</h3>
      <p className="text-[13px] leading-relaxed text-[#9ca3af]">{milestone.body}</p>
    </div>
  );
}
