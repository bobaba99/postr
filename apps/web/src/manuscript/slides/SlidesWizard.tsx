/**
 * SlidesWizard — the /paper-to-slides shell (spec §2, the one surface).
 *
 * Assembles the already-built pieces into the v2 layout: a foldable left
 * step spine (StepBar) beside a main column whose stack is
 *
 *     ProgressBar → step body / SlideViewer → ExportDrawer
 *
 * The drawer sits at the bottom and expands UPWARD. The shell owns all
 * wizard state — the active step, which cards are folded open, the collected
 * constraints, the extracted findings, the built deck, the selected slide,
 * and whether the export drawer is open — and hands each piece exactly the
 * props it needs.
 *
 * PHASE-1 PIPELINE (Task 12) — the REAL path, end to end:
 *   Constraints (paste / .docx) → extractRankedFindings(resultsText)
 *   → pick the star → deriveDeckInput → buildDeck → SlideViewer + export.
 *
 * What is REAL: manuscript ingest, ranked-findings extraction, the star
 * pick, the deterministic deck build, PPTX export, and the free-PDF print.
 * What is STUBBED (Phase 2, noted at each site): the narrative branch UI
 * (gap/resolution are DERIVED, not asked), the figures step, the visuals &
 * notes step, and the tweaks step — each renders a short "handled
 * automatically / coming next" note so the flow stays honest.
 *
 * Copy contracts (verified against code, no AI framing — spec §1, §2, §9):
 *   • the Turn-1 tip — "PDF export is free. PowerPoint (.pptx) export is
 *     paid." — stated up front, before any effort is invested;
 *   • the privacy line — "Your manuscript is never stored on our servers,
 *     and is never used to train AI." — quiet and persistent.
 */
import { useMemo, useRef, useState } from 'react';
import { buildDeck } from '../deck/buildDeck';
import {
  deriveDeckInput,
  resultsTextForExtraction,
} from '../deck/deriveDeckInput';
import { extractRankedFindings } from '../deck/extractFindings';
import type { RankedFinding } from '../deck/extractFindings';
import type { SlideDeck } from '../deck/types';
import type { DocumentModel } from '@postr/shared';
import { exportDeckPptx } from '@/export/pptx/deckWriter';
import { parseConstraints, type ConstraintsValue } from './ConstraintsStep';
import { ExportDrawer } from './ExportDrawer';
import { ProgressBar } from './ProgressBar';
import { StepBar, type StepInputRow } from './StepBar';
import { WizardStepBody } from './WizardStepBody';
import { downloadBytes, placeholderDeck } from './wizardHelpers';
import { useWizardMotion } from './useWizardMotion';
import {
  STEP_LABELS,
  STEP_TOTAL,
  WIZARD_STEPS,
  type StepId,
} from './stepConfig';

/**
 * Injectable clients for the end-to-end wiring (Task 12). The e2e test feeds
 * a fake `extractClient` so no network is touched; in production the wizard
 * falls back to the real `extractRankedFindings`. The client takes the
 * results text and returns the same `{ findings }` shape as the API.
 */
export interface SlidesWizardTestHooks {
  extractClient?: (resultsText: string) => Promise<{ findings: RankedFinding[] }>;
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

const DEFAULT_CONSTRAINTS: ConstraintsValue = {
  manuscriptText: '',
  durationMinutes: 10,
  format: 'pptx',
};

export function SlidesWizard({ testHooks }: SlidesWizardProps = {}) {
  const [reducedMotion] = useState(prefersReducedMotion);

  const [activeStep, setActiveStep] = useState<StepId>('constraints');
  const [openSteps, setOpenSteps] = useState<StepId[]>([]);

  // Collected input, extraction results, and the built deck. The deck is
  // null until the star is chosen; the viewer shows the placeholder meanwhile.
  const [constraints, setConstraints] = useState<ConstraintsValue>(DEFAULT_CONSTRAINTS);
  const [docModel, setDocModel] = useState<DocumentModel | null>(null);
  const [findings, setFindings] = useState<RankedFinding[]>([]);
  const [starIndex, setStarIndex] = useState(0);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState(false);
  const [builtDeck, setBuiltDeck] = useState<SlideDeck | null>(null);

  const [placeholder] = useState<SlideDeck>(placeholderDeck);
  const deck = builtDeck ?? placeholder;
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  useWizardMotion(rootRef, { reducedMotion, activeStep, exportOpen });

  const toggleStep = (id: StepId) => {
    setOpenSteps((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const goToStep = (id: StepId) => {
    setActiveStep(id);
    setOpenSteps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // Constraints changes come from the paste box, the duration, or the format.
  // Any manuscript-text edit invalidates a previously cached .docx model so
  // the next extraction re-parses the text the user is actually looking at.
  const handleConstraintsChange = (next: ConstraintsValue) => {
    setConstraints((prev) => {
      if (next.manuscriptText !== prev.manuscriptText) setDocModel(null);
      return next;
    });
  };

  // ── Step 1 → 2: parse the manuscript and extract ranked findings ──────
  const runExtraction = async () => {
    const text = constraints.manuscriptText.trim();
    if (!text) return;
    setExtractLoading(true);
    setExtractError(false);
    goToStep('starFinding');
    try {
      // .docx already parsed into a model; otherwise parse the paste box.
      const model = docModel ?? parseConstraints(text);
      setDocModel(model);
      const resultsText = resultsTextForExtraction(model) || text;
      const client = testHooks?.extractClient;
      const result = client
        ? await client(resultsText)
        : { findings: await extractRankedFindings(resultsText) };
      setFindings(result.findings);
      setStarIndex(0);
    } catch {
      // Generic — the ExtractFindingsError kind never reaches the UI.
      setExtractError(true);
      setFindings([]);
    } finally {
      setExtractLoading(false);
    }
  };

  // ── Step 2 → 3: promote the star, derive input, build the real deck ───
  const buildFromFindings = () => {
    if (!docModel || findings.length === 0) return;
    // Star leads; the rest keep their extracted order. Drop `rank` — the
    // deck builder ranks by position now.
    const ordered = [
      findings[starIndex]!,
      ...findings.filter((_, i) => i !== starIndex),
    ].map((f) => ({
      text: f.text,
      sourceQuote: f.sourceQuote,
      sourceSection: f.sourceSection,
    }));
    const input = deriveDeckInput({
      model: docModel,
      durationMinutes: constraints.durationMinutes,
      rankedFindings: ordered,
    });
    setBuiltDeck(buildDeck(input));
    setActiveSlideIndex(0);
    goToStep('narrative');
  };

  // The step cards document what the user has told the wizard so far.
  const inputSummary = useMemo<Partial<Record<StepId, StepInputRow[]>>>(() => {
    const summary: Partial<Record<StepId, StepInputRow[]>> = {};
    if (constraints.manuscriptText.trim()) {
      summary.constraints = [
        { k: 'Length', v: `${constraints.durationMinutes} minutes` },
        { k: 'Format', v: constraints.format === 'pptx' ? 'PowerPoint' : 'PDF' },
        { k: 'Manuscript', v: `${constraints.manuscriptText.trim().length} characters` },
      ];
    }
    if (builtDeck && findings[starIndex]) {
      summary.starFinding = [{ k: 'Star', v: findings[starIndex]!.text }];
    }
    return summary;
  }, [constraints, builtDeck, findings, starIndex]);

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

  // PDF is the free print flow. The full deck-print window is Phase 2; the
  // browser print dialog is a correct, free Phase-1 stand-in.
  const handleExportPdf = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <div
      ref={rootRef}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(200px,260px)_1fr]"
    >
      <StepBar
        activeStep={activeStep}
        openSteps={openSteps}
        onToggle={(id) => {
          setActiveStep(id);
          toggleStep(id);
        }}
        inputSummary={inputSummary}
      />

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
            <span className="font-semibold text-white">PDF export is free.</span>{' '}
            PowerPoint (.pptx) export is paid.
          </p>

          {/* Privacy line — quiet, persistent, precise (spec §1). */}
          <p className="mt-2 text-[11px] leading-relaxed text-[#6b7280]">
            Your manuscript is never stored on our servers, and is never used to
            train AI.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <WizardStepBody
            activeStep={activeStep}
            constraints={constraints}
            onConstraintsChange={handleConstraintsChange}
            onDocxParsed={(model, plainText) => {
              setDocModel(model);
              setConstraints((c) => ({ ...c, manuscriptText: plainText }));
            }}
            onRunExtraction={() => void runExtraction()}
            extractLoading={extractLoading}
            extractError={extractError}
            findings={findings}
            starIndex={starIndex}
            onPickStar={setStarIndex}
            onBuildDeck={buildFromFindings}
            deck={deck}
            activeSlideIndex={activeSlideIndex}
            onSelectSlide={setActiveSlideIndex}
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
