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
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { aboutRoadtrip } from '@/motion/timelines/aboutRoadtrip';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

interface Milestone {
  id: string;
  title: string;
  body: string;
}

const MILESTONES: Milestone[] = [
  {
    id: 'anonymous',
    title: 'Start anywhere, save nothing',
    body:
      "Anonymous session on first click — no sign-up wall. Every keystroke autosaves from before you've even named the poster. When you sign up later, your drafts follow you across devices without a single \"export and re-import\".",
  },
  {
    // Layouts: poster/templates.ts LAYOUT_TEMPLATES (the fifth is Blank).
    // Palettes: poster/constants.ts PALETTES (8, six named by discipline)
    // plus the custom palette designer (components/PaletteDesigner.tsx).
    // Board sizes: poster/GuidelinesPanel.tsx GUIDELINES lists seven
    // meetings but does not set the sheet; the size menu has no conference
    // presets, and custom sizes run SHEET_MIN_IN..SHEET_MAX_IN
    // (poster/resizeSheet.ts).
    id: 'templates',
    title: 'Templates built for conference posters',
    body:
      'Five layouts: three-column classic, two-column wide figure, billboard, sidebar + focus, and a blank start. Eight palettes, six of them named for a discipline, or build your own. The poster guidelines panel lists board sizes for APA, SfN, ECNP and four more meetings, and the sheet takes any size from 10 to 100 inches.',
  },
  {
    // Prompts: the placeholder text in poster/templates.ts. Word targets:
    // the built-in "Standard Poster" checklist in poster/GuidelinesPanel.tsx
    // (BUILT_IN_TEMPLATES[0], loaded by default).
    id: 'writing',
    title: 'Writing guidance, not a blank page',
    body:
      'Template sections open with short prompts, and a built-in checklist runs from the title to the final proofread, with word targets for the introduction, methods and conclusions. Rich text for emphasis, Greek-symbol shortcuts for STEM, and a reference manager with citation-style support.',
  },
  {
    // The check compares each label's printed point size with the
    // minimums in poster/readability.ts. It runs when the user runs it.
    id: 'readability',
    title: 'Figure text checked at print size',
    body:
      'Paste your R or Python plotting code and Postr checks whether axis labels will actually be legible at print size. Out-of-bounds warnings catch layout slips. Run the check before you print, while small labels are still easy to fix.',
  },
  {
    // The manuscript sentence this card used to open with was removed:
    // paper-to-poster is deactivated — see routes.tsx header. The id is
    // kept so the timeline outline and its tests stay stable.
    //
    // Every import is auto-arranged into columns after it lands
    // (ImportPosterModal.tsx sets postr.autoArrangeOnLoad; PosterEditor
    // runs onAutoLayout), so blocks do not keep their original places.
    // Image imports, and PDFs with no text layer (pdfImport.ts
    // rasterizes those), are text-only (import/imageImport.ts). A text-layer
    // PDF brings only embedded raster images (paintImageXObject), and a
    // PowerPoint import skips native charts (import/pptx/shapes.ts
    // unsupportedLabel), so the card says charts stay behind.
    id: 'start-from-work',
    title: 'Start from the poster you already have',
    body:
      'Already have a poster in PowerPoint, as a PDF, or as an image? Import it and keep editing. The title, headings and body text come in as blocks you can move and rewrite, and Postr arranges them into columns. Imports from PowerPoint and text-based PDFs also bring in images. Charts built in PowerPoint, and charts a PDF draws as vector graphics, stay behind. From an image or a scanned PDF, you add figures yourself.',
  },
  {
    // Describes the editor's Figure tab. The same ladder used to have a
    // standalone page (/chart-chooser) this copy also covered; that page
    // is deactivated — see routes.tsx header — so the sentence no longer
    // promises downloads outside the editor.
    id: 'figures',
    title: 'The right figure, drawn for print',
    body:
      'Paste a table or answer three questions in the Figure tab and Postr ranks the chart forms that actually fit your data, drawn as journal-style panels with captions in methods voice. Pick several at once and insert them straight onto the poster.',
  },
  {
    // Only a palette and one of the curated fonts come back
    // (apps/api/src/extractStyle.ts schema); clampPrintSafe
    // (poster/styleExtraction.ts) lifts very dark backgrounds and caps
    // saturation. It does not check contrast, so the card does not
    // promise legibility.
    id: 'design',
    title: 'Borrow a look you like',
    body:
      'Upload a poster you admire and Postr applies its colours and the closest built-in font to yours. It copies no text or images. Very dark backgrounds are lifted slightly and neon colours are toned down for print.',
  },
  {
    // Share links are deactivated with comments (config/features.ts), so the
    // card no longer offers them (fix 23).
    //
    // Undo keeps UNDO_HISTORY_LIMIT (100) steps (stores/posterStore.ts;
    // fix 12, docs/fixes/12-one-undo-history.md). PowerPoint
    // and LaTeX need a term or a pack credit (usePlan canExport). The PPTX
    // and LaTeX writers have no case for chart blocks, so the card names
    // what they do carry. references.bib ships only when the poster has
    // references (export/latex/bib.ts); the .tex targets XeLaTeX/LuaLaTeX.
    id: 'ship',
    title: 'Iterate, export, print',
    body:
      'Undo and redo up to 100 steps. Save a PDF for free. PowerPoint and LaTeX exports are paid: PowerPoint keeps text, images and tables editable, and LaTeX gives you a poster.tex for XeLaTeX with your images, plus a references.bib when the poster has references. Charts made in Postr are not included.',
  },
];

export default function About() {
  useDocumentMeta(STATIC_ROUTE_META['/about'] ?? null);

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
          Postr by Resila
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          Everything you need<br />
          <span className="text-[#7c6aed]">to ship a great poster.</span>
        </h1>
        <p className="mt-6 text-[14pt] text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          Postr is an opinionated poster editor built around one idea: constraint is
          a feature. The defaults are set for print. A new poster starts on a 48 ×
          36 inch sheet with 36 pt body text, and you fill in the science.
        </p>
        <p className="mt-4 text-[12pt] text-[#8b8f99] leading-relaxed max-w-xl mx-auto">
          Built and maintained by{' '}
          <span className="font-semibold text-[#c8cad0]">Resila Technologies Inc.</span>{' '}
          in Quebec, Canada. Questions or bug reports land at{' '}
          <a
            className="text-[#7c6aed] underline"
            href="mailto:support@resila.ai"
          >
            support@resila.ai
          </a>
          .
        </p>
      </section>

      {/* Timeline */}
      <section className="relative mx-auto max-w-4xl px-8 pb-20 pt-8">
        <h2 className="sr-only">Postr milestones</h2>

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
              Shape what ships next
            </div>
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
              Tell us what's missing.
            </h2>
            <p className="mb-8 max-w-xl text-[14pt] leading-relaxed text-[#9ca3af]">
              Every bug report and feature request lands in the developer's queue.
              If something's broken, missing, or could be better, say so.
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
                className="rounded-lg bg-[#5641b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4c39a6] transition-colors"
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
