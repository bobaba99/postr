/**
 * Landing page — public, no auth required.
 * Explains what Postr is and directs to /auth.
 *
 * If a user with an existing session lands here (typically by
 * clicking the Postr logo on a public page like /gallery), we
 * silently redirect them to /dashboard. The marketing page is for
 * unauthenticated visitors only — anyone already signed in should
 * skip past it. Without this redirect, the user can click "Try as
 * guest" again and accidentally create a duplicate anonymous
 * account that orphans their existing posters.
 */
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '@/lib/supabase';
import { landingEntrance } from '@/motion/timelines/landingEntrance';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { RotatingWord } from '@/components/RotatingWord';
import { SITE_ORIGIN, STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

/**
 * Describes the product itself. `WebApplication` is the accurate type
 * for a browser-based editor.
 *
 * No price or `isAccessibleForFree` claim: the page no longer pitches
 * on price (owner decision, 2026-07-27), and structured data that
 * says "free" would outlive that decision the moment a paid tier
 * ships. Schema.org treats `offers` as optional — omitting it says
 * nothing, which is accurate, rather than asserting something that
 * will age badly.
 */
const LANDING_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Postr',
  url: `${SITE_ORIGIN}/`,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any (web browser)',
  description:
    'A web app for making academic conference posters, built for researchers and students.',
} as const;

/**
 * The hero's rotating slot. These are FRICTIONS REMOVED, not features
 * — the pitch is that the fiddly parts are handled, so each phrase
 * names something the reader has personally lost an evening to.
 *
 * Kept to noun phrases so the sentence reads as prose at every step:
 * "A poster editor that handles X so you can work on the science."
 *
 * NO LENGTH BUDGET ANY MORE. These once had to render at near-equal
 * pixel widths, because the phrase sat inline and the words after it
 * moved when it changed. The line is now vertical — nothing follows
 * the phrase — so a long one just takes the room it needs, and on a
 * narrow screen it wraps rather than clipping.
 *
 * Keep them short enough to read in one glance, but do not count
 * characters. That constraint is gone.
 */
const HERO_FRICTIONS = [
  'the fiddly block nudging',
  'the text reflowing on you',
  'the BibTeX citation styles',
  'the conference size specs',
  'the authors and affiliations',
  'the unreadable tiny figures',
] as const;

export default function Landing() {
  useDocumentMeta(STATIC_ROUTE_META['/'] ?? null, LANDING_JSON_LD);
  const navigate = useNavigate();
  const scopeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate('/dashboard', { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /*
    Entrance + scroll reveals. `mm.revert()` on unmount undoes every
    tween, ScrollTrigger, and inline style the timelines created — so
    navigating away and back cannot leave a card stuck at opacity 0,
    and Strict Mode's double-mount is a no-op rather than a leak.

    useEffect rather than useLayoutEffect: the initial states are set
    inside the timeline, and running after paint is what lets the
    hero's first frame land as fully-painted markup. A layout effect
    would hide the headline before the browser ever showed it, which
    is the LCP regression this page cannot afford.
  */
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const mm = landingEntrance(scope);
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

      <section className="mx-auto max-w-3xl px-8 py-24 text-center">
        <span
          data-postr-hero-item
          className="inline-block rounded-full border border-[#7c6aed]/40 bg-[#7c6aed]/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-[#b8a9ff]"
        >
          Built for researchers
        </span>
        <h1
          data-postr-hero-item
          className="mt-5 text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-6xl"
        >
          Academic posters,<br />
          <span className="text-[#7c6aed]">without the hassle.</span>
        </h1>
        {/*
          The typed phrase sits on its OWN LINE rather than inline in
          the sentence. Inline, its rendered width had to be reconciled
          with the words after it — which produced a reflowing sentence,
          then a character budget, then a pixel budget, and phrases that
          still clipped. On its own line nothing follows it, so length
          simply stops being a constraint.

          GSAP animates the PARAGRAPH, never the typed line itself:
          stacking an opacity tween on an element already running its
          own animation is the "third simultaneous effect" the house
          style warns about.
        */}
        <div
          data-postr-hero-item
          className="mx-auto mt-7 max-w-[46ch] text-xl leading-relaxed text-[#a3a7b3] sm:text-2xl"
        >
          <p>A poster editor that handles</p>
          <RotatingWord
            phrases={HERO_FRICTIONS}
            className="font-medium text-[#c8b6ff]"
          />
          <p>so you can work on the science.</p>
        </div>
        <div data-postr-hero-item className="mt-10 flex items-center justify-center gap-4">
          <Link
            to="/auth"
            className="rounded-lg bg-[#7c6aed] px-8 py-3 text-base font-semibold text-white no-underline hover:bg-[#6c5ce7] transition-colors"
          >
            Get started
          </Link>
          <Link
            to="/auth?guest=1"
            className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-8 py-3 text-base font-semibold text-[#c8cad0] no-underline hover:border-[#7c6aed] transition-colors"
          >
            Try as guest
          </Link>
        </div>

        {/*
          Small-screen notice. The editor is a fixed-canvas drag surface
          with a sidebar — usable on a phone only in the sense that it
          renders. Saying so here, before someone signs up, is cheaper
          for them than discovering it in the editor. Mirrors the
          dashboard notice in Home.tsx; both go when the editor is
          genuinely responsive.
        */}
        <p
          role="note"
          className="postr-rise-in mx-auto mt-8 max-w-[46ch] rounded-lg border border-[#2a2a3a] bg-[#111118] px-4 py-3 text-sm leading-relaxed text-[#8b8f99] sm:hidden"
        >
          <strong className="font-semibold text-[#c8cad0]">Best on a laptop.</strong>{' '}
          The editor needs a bigger screen to drag blocks and see your poster at
          full size. The plot picker and figure checker work fine on a phone.
        </p>
      </section>

      <section className="mx-auto w-full max-w-4xl flex-1 px-8 pb-24">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">📐</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">Smart templates</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              5 conference-ready layouts with discipline-specific palettes.
              APA, SfN, ECNP size presets built in.
            </p>
          </div>
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">📊</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">Figure readability</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              Paste your R or Python code. See if axis labels will be readable
              at print size. Get a copy-ready fix.
            </p>
          </div>
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">✍️</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">Writing guide</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              Section-by-section tips, word count targets, and a checklist
              to follow from intro to conclusion.
            </p>
          </div>
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">🎞️</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">PowerPoint, both ways</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              Open an existing .pptx poster and keep editing it here, or
              export one back out with every block still editable.
            </p>
          </div>
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">📐</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">LaTeX source</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              Download a compilable poster.tex with your figures and a
              references.bib — keep working in Overleaf if you prefer.
            </p>
          </div>
          <div
            data-postr-reveal
            className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#2a2a3a]"
          >
            <div className="text-2xl mb-3">🎨</div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8] mb-2">Copy a design</h3>
            <p className="text-sm text-[#8b8f99] leading-relaxed">
              Upload a poster you admire and apply its colours and type to
              yours. Copies the look, never the content.
            </p>
          </div>
        </div>
      </section>

      {/*
        Standalone tools. Both shipped with nothing linking to them, so
        they were reachable only by typing the URL. Each runs without
        an account and stands on its own — hence "no account needed"
        rather than a signup CTA.

        Claims here are deliberately narrow: paper-to-poster produces a
        poster draft (PDF or .postr). It does not make slides.
      */}
      <section className="mx-auto w-full max-w-4xl px-8 pb-24">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.01em] text-[#e2e2e8]">
          Tools you can use on their own
        </h2>
        <p className="mx-auto mt-3 max-w-[52ch] text-center text-sm leading-relaxed text-[#8b8f99]">
          Two parts of the poster workflow that work without an account,
          and without opening the editor.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ToolCard
            to="/paper-to-poster"
            icon="📄"
            title="Paper to poster"
            body="Paste your manuscript or upload a .docx, answer a few short questions about what to emphasise, and download a poster draft as a PDF."
            cta="Start from a paper"
          />
          <ToolCard
            to="/chart-chooser"
            icon="📊"
            title="Plot picker"
            body="Paste a table or answer three short questions, and get ranked chart suggestions drawn as journal-style panels. Download any panel as SVG or PNG."
            cta="Find your figure"
          />
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

function ToolCard({
  to,
  icon,
  title,
  body,
  cta,
}: {
  to: string;
  icon: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      to={to}
      data-postr-reveal
      className="group flex flex-col rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 no-underline transition-colors duration-base ease-smooth [@media(hover:hover)]:hover:border-[#7c6aed]"
    >
      <div className="mb-3 text-2xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold tracking-[-0.01em] text-[#e2e2e8]">
        {title}
      </h3>
      <p className="flex-1 text-sm leading-relaxed text-[#8b8f99]">{body}</p>
      <span className="mt-4 text-sm font-semibold text-[#7c6aed]">
        {cta} →
      </span>
    </Link>
  );
}
