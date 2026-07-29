/**
 * SlidesWizard — the /paper-to-slides shell (spec §2, the one surface).
 *
 * Assembles the already-built pieces into the v2 layout: a foldable left
 * step spine (StepBar) beside a main column whose stack is
 *
 *     ProgressBar → SlideViewer → ExportDrawer
 *
 * The drawer sits at the bottom and expands UPWARD (it is the last child; a
 * flex column with the viewer taking the spare room keeps the drawer pinned
 * low). The shell owns all wizard state — the active step, which cards are
 * folded open, the deck, the selected slide, and whether the export drawer
 * is open — and hands each piece exactly the props it needs.
 *
 * PHASE 1 SCOPE. One deliberate deferral:
 *   • The real extraction → buildDeck pipeline (Task 12) is NOT wired. A
 *     placeholder deck renders so the viewer and drawer have something to
 *     show. `testHooks` is accepted now (injectable clients for Task 12) but
 *     intentionally unused in Phase 1.
 *
 * Copy contracts (verified against code, no AI framing — spec §1, §2, §9):
 *   • the Turn-1 tip — "PDF export is free. PowerPoint (.pptx) export is
 *     paid." — stated up front, before any effort is invested;
 *   • the privacy line — "Your manuscript is never stored on our servers,
 *     and is never used to train AI." — quiet and persistent.
 */
import { useMemo, useRef, useState } from 'react';
import { buildDeck } from '../deck/buildDeck';
import type { SlideDeck } from '../deck/types';
import { exportDeckPptx } from '@/export/pptx/deckWriter';
import { ExportDrawer } from './ExportDrawer';
import { ProgressBar } from './ProgressBar';
import { SlideViewer } from './SlideViewer';
import { StepBar, type StepInputRow } from './StepBar';
import { useWizardMotion } from './useWizardMotion';
import {
  STEP_LABELS,
  STEP_TOTAL,
  WIZARD_STEPS,
  type StepId,
} from './stepConfig';

/**
 * Injectable clients for the end-to-end wiring (Task 12). Optional and
 * unused in Phase 1 — declared now so the shell's public shape does not
 * change when the pipeline lands.
 */
export interface SlidesWizardTestHooks {
  /** Ranked-findings extraction client (Task 12). */
  extractClient?: unknown;
}

interface SlidesWizardProps {
  testHooks?: SlidesWizardTestHooks;
}

/** Read the OS reduced-motion preference once, SSR/jsdom-safe. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A placeholder deck so the shell renders before the pipeline is wired
 * (Task 12). Built through the real `buildDeck` — not a hand-shaped literal
 * — so the preview reflects the true arc, and the sample content uses bogus
 * names/institutions (never real ones). Replaced wholesale once extraction
 * feeds `buildDeck` for real.
 */
function placeholderDeck(): SlideDeck {
  return buildDeck({
    title: 'Your talk will appear here',
    authors: [{ name: 'Jane Doe' }],
    durationMinutes: 10,
    rankedFindings: [],
    gap: 'Paste a manuscript to begin — the arc builds from your paper.',
    resolution: 'Answer a few short questions and the deck assembles itself.',
    methodsSummary: 'Methods, figures, and speaker notes come from your text.',
    references: [],
    introReferences: [],
    methodsReferences: [],
  });
}

export function SlidesWizard(_props: SlidesWizardProps = {}) {
  // Motion preference, read once and held, then handed to useWizardMotion
  // as the reduced-motion gate. All GSAP lives in that one scoped hook.
  const [reducedMotion] = useState(prefersReducedMotion);

  const [activeStep, setActiveStep] = useState<StepId>('constraints');
  const [openSteps, setOpenSteps] = useState<StepId[]>([]);
  const [deck] = useState<SlideDeck>(placeholderDeck);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);

  // The wizard root scopes every GSAP selector to this subtree — the hook's
  // first-mount stagger, active-card reveal, and drawer reveal all resolve
  // against elements inside it and never reach the rest of the page.
  const rootRef = useRef<HTMLDivElement>(null);
  useWizardMotion(rootRef, { reducedMotion, activeStep, exportOpen });

  // Fold state is a set toggle: clicking a step's header opens or closes
  // its documented-input card without disturbing the others.
  const toggleStep = (id: StepId) => {
    setOpenSteps((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  // Nothing is recorded yet in Phase 1 — the step cards populate as the
  // pipeline (Task 12) captures answers. An empty summary is honest today.
  const inputSummary = useMemo<Partial<Record<StepId, StepInputRow[]>>>(
    () => ({}),
    [],
  );

  const activeIndex = WIZARD_STEPS.indexOf(activeStep);

  // ── Exports (Phase 1 — display-only paywall, no Stripe) ──────────────
  const handleExportPptx = async () => {
    const bytes = await exportDeckPptx(deck);
    downloadBytes(
      bytes,
      'presentation.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  };

  // PDF is the print flow. Wiring the real deck-print window is Task 12;
  // the browser print dialog is a correct, free Phase-1 stand-in.
  const handleExportPdf = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <div
      ref={rootRef}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(200px,260px)_1fr]"
    >
      {/* Left spine — the foldable step bar. */}
      <StepBar
        activeStep={activeStep}
        openSteps={openSteps}
        onToggle={(id) => {
          setActiveStep(id);
          toggleStep(id);
        }}
        inputSummary={inputSummary}
      />

      {/* Main column: progress → viewer → export drawer (drawer pinned
          low, expanding upward as the last flex child). */}
      <section
        aria-label="Slide deck"
        className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#1f1f2e] bg-[#0d0d15]"
      >
        <div className="border-b border-[#1f1f2e] px-5 py-4">
          <ProgressBar
            current={activeIndex + 1}
            total={STEP_TOTAL}
            label={STEP_LABELS[activeStep]}
          />

          {/* Turn-1 tip — stated before any effort (spec §2). */}
          <p className="mt-3 rounded-md border border-[#2b2456] bg-[#16111f] px-3 py-2 text-xs leading-relaxed text-[#c8b6ff]">
            <span className="font-semibold text-white">
              PDF export is free.
            </span>{' '}
            PowerPoint (.pptx) export is paid.
          </p>

          {/* Privacy line — quiet, persistent, precise (spec §1). */}
          <p className="mt-2 text-[11px] leading-relaxed text-[#6b7280]">
            Your manuscript is never stored on our servers, and is never used
            to train AI.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <SlideViewer
            deck={deck}
            activeIndex={activeSlideIndex}
            onSelect={setActiveSlideIndex}
          />
        </div>

        <ExportDrawer
          open={exportOpen}
          onToggle={() => setExportOpen((o) => !o)}
          deck={deck}
          onExportPdf={handleExportPdf}
          onExportPptx={() => void handleExportPptx()}
        />
      </section>
    </div>
  );
}

/** Trigger a browser download of raw bytes as a named file. */
function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string) {
  // Re-wrap so the BlobPart is a Uint8Array<ArrayBuffer> — pptxgenjs types
  // the buffer as ArrayBufferLike, which the DOM Blob signature rejects.
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
