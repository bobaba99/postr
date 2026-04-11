/**
 * About page — a timeline narrative of how Postr came to be.
 *
 * Visual motif: a vertical "roadtrip" down the page. A dotted SVG path
 * runs from top to bottom; milestones sit along the road, alternating
 * left and right. The design is deliberately abstract — no photos,
 * no illustrations beyond geometric SVG primitives.
 *
 * Also serves as a second home for the feedback feature: the final
 * waypoint ("The road ahead") invites users to shape future stops.
 */
import { Link } from 'react-router-dom';
import { useFeedbackStore } from '@/stores/feedbackStore';

interface Milestone {
  id: string;
  chapter: string;
  title: string;
  body: string;
}

const MILESTONES: Milestone[] = [
  {
    id: 'origin',
    chapter: 'Chapter 01',
    title: 'The blank-page problem',
    body:
      'Every conference season, students stare down a blank slide and ask the same questions: what font size? which palette? how much text is too much? Good posters exist, but the tools don\'t teach. PowerPoint gives you 400 fonts and zero guidance.',
  },
  {
    id: 'sketch',
    chapter: 'Chapter 02',
    title: 'A single-file prototype',
    body:
      'The first version was a 600-line React component that fit in one file. Crude, but it proved the thesis: constraint is a feature. Six fonts, five layouts, and discipline-appropriate palettes already produce better posters than most published ones.',
  },
  {
    id: 'stack',
    chapter: 'Chapter 03',
    title: 'Anonymous-first, autosave-always',
    body:
      'Sign-up walls kill curiosity. Postr creates an anonymous session on first visit — you\'re editing before you know you\'ve started. Every keystroke autosaves. When you\'re ready to sign up, your work follows you in without a single click on "save".',
  },
  {
    id: 'scan',
    chapter: 'Chapter 04',
    title: 'Figures that are actually readable',
    body:
      'The #1 poster sin: a matplotlib chart with 8pt labels scaled to cover a third of an A0 sheet. Postr reads your R or Python plotting code and tells you — before you print — whether axis labels will be legible from three feet away.',
  },
  {
    id: 'prelaunch',
    chapter: 'Chapter 05',
    title: 'Pre-launch',
    body:
      'The editor, the data model, the anonymous-to-permanent auth flow, undo/redo, rich text, asset uploads, and reference management are all in place. What\'s left is polish — the hundred small details that separate a prototype from a product.',
  },
];

export default function About() {
  const openFeedback = useFeedbackStore((s) => s.open);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-8 pt-20 pb-12 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          A roadtrip, not a roadmap
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          How we got here,<br />
          <span className="text-[#7c6aed]">and where we're headed next.</span>
        </h1>
        <p className="mt-6 text-base text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          Postr started as a frustration and turned into a weekend project that refused
          to stop. This is the short version of the road so far — and an invitation to
          help choose the next turn.
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

        {/* Mountain silhouette — decorative only. */}
        <div className="pointer-events-none mt-8 flex justify-center opacity-40">
          <svg width="240" height="64" viewBox="0 0 240 64" fill="none" aria-hidden="true">
            <path
              d="M0 60 L38 22 L62 42 L92 10 L128 48 L158 24 L196 52 L240 30 L240 60 Z"
              fill="none"
              stroke="#7c6aed"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M0 60 L38 22 L62 42 L92 10 L128 48 L158 24 L196 52 L240 30"
              fill="#7c6aed"
              opacity="0.08"
            />
          </svg>
        </div>
      </section>

      {/* Final stop — feedback CTA */}
      <section className="mx-auto max-w-3xl px-8 pb-24">
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
              Chapter 06 — unwritten
            </div>
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
              The road ahead is yours.
            </h2>
            <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-[#9ca3af]">
              Postr is being built in public, one waypoint at a time. The loudest
              feedback wins the most attention — so if something's broken, missing, or
              could be better, say so. Everything goes to the developer's queue.
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

      <footer className="border-t border-[#1f1f2e] px-8 py-6 text-center text-sm text-[#555]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link to="/" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            Home
          </Link>
          <Link to="/about" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            About
          </Link>
          <Link to="/auth" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => openFeedback('other')}
            className="cursor-pointer border-0 bg-transparent p-0 text-[#6b7280] hover:text-[#c8cad0]"
          >
            Feedback
          </button>
        </div>
      </footer>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <span className="text-xl font-bold text-[#c8cad0]">Postr</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]"
        >
          Home
        </Link>
        <Link
          to="/auth"
          className="rounded-lg border border-[#7c6aed] px-5 py-2 text-sm font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </div>
    </header>
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
