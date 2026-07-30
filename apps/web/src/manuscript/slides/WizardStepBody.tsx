/**
 * WizardStepBody — the main column's step switch (spec §2, turns 1–6).
 *
 * Extracted from SlidesWizard so the shell stays focused on state and the
 * body stays focused on rendering. Constraints and star-finding drive the
 * pipeline; every later step is Phase-2 STUBBED with an honest note and keeps
 * the live deck preview visible below so the user watches the deck take shape.
 *
 * Purely presentational — every action is a callback the shell owns. No
 * pipeline call, no local pipeline state.
 */
import {
  ConstraintsStep,
  type ConstraintsValue,
} from './ConstraintsStep';
import { SlideViewer } from './SlideViewer';
import { StarFindingStep } from './StarFindingStep';
import type { RankedFinding } from '../deck/extractFindings';
import type { SlideDeck } from '../deck/types';
import type { StyledSlideDeck } from '../deck/styledTypes';
import type { DocumentModel } from '@postr/shared';
import type { StepId } from './stepConfig';

export interface WizardStepBodyProps {
  activeStep: StepId;
  constraints: ConstraintsValue;
  onConstraintsChange: (next: ConstraintsValue) => void;
  onDocxParsed: (model: DocumentModel, plainText: string) => void;
  onRunExtraction: () => void;
  extractLoading: boolean;
  extractError: boolean;
  findings: RankedFinding[];
  starIndex: number;
  onPickStar: (index: number) => void;
  onBuildDeck: () => void;
  deck: SlideDeck;
  activeSlideIndex: number;
  onSelectSlide: (index: number) => void;
  /** Task 10 — the auto-styled + themed deck, and its loading/error/vibe
   *  wiring. Passed straight through to `SlideViewer`. */
  styledDeck?: StyledSlideDeck | null;
  designLoading?: boolean;
  designError?: boolean;
  vibe?: string;
  onVibeChange?: (value: string) => void;
  onVibeSubmit?: (vibe: string) => void;
}

/** Phase-2 stub notes, one per not-yet-wired step (spec §2 turns 3–6). */
const STUB_NOTE: Partial<Record<StepId, string>> = {
  narrative:
    'The narrative arc is derived from your paper automatically. Editing the gap and resolution comes next.',
  figures: 'Figure and table selection is coming next.',
  visualsNotes:
    'Speaker notes are drawn from your paper. Visual styling comes next.',
  tweaks: 'Per-slide tweaks are coming next.',
};

export function WizardStepBody({
  activeStep,
  constraints,
  onConstraintsChange,
  onDocxParsed,
  onRunExtraction,
  extractLoading,
  extractError,
  findings,
  starIndex,
  onPickStar,
  onBuildDeck,
  deck,
  activeSlideIndex,
  onSelectSlide,
  styledDeck,
  designLoading,
  designError,
  vibe,
  onVibeChange,
  onVibeSubmit,
}: WizardStepBodyProps) {
  if (activeStep === 'constraints') {
    return (
      <div className="flex flex-col gap-4">
        <ConstraintsStep
          value={constraints}
          onChange={onConstraintsChange}
          onDocxParsed={onDocxParsed}
          disabled={extractLoading}
        />
        <button
          type="button"
          onClick={onRunExtraction}
          disabled={!constraints.manuscriptText.trim() || extractLoading}
          className="inline-flex min-h-11 w-fit items-center rounded-md bg-[#5641b8] px-5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
        >
          Find the key findings
        </button>
      </div>
    );
  }

  if (activeStep === 'starFinding') {
    return (
      <div className="flex flex-col gap-4">
        <StarFindingStep
          loading={extractLoading}
          error={extractError}
          findings={findings}
          starIndex={starIndex}
          onPickStar={onPickStar}
          onRetry={onRunExtraction}
        />
        {findings.length > 0 && !extractLoading && (
          <button
            type="button"
            onClick={onBuildDeck}
            className="inline-flex min-h-11 w-fit items-center rounded-md bg-[#5641b8] px-5 text-sm font-semibold text-white hover:brightness-110"
          >
            Build the deck
          </button>
        )}
      </div>
    );
  }

  // Steps 3–6: honest Phase-2 stub note above the live deck preview.
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {STUB_NOTE[activeStep] && (
        <p className="shrink-0 rounded-md border border-[#2a2a3a] bg-[#0f0f16] px-3 py-2 text-xs text-[#8b8fa3]">
          {STUB_NOTE[activeStep]}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <SlideViewer
          deck={deck}
          activeIndex={activeSlideIndex}
          onSelect={onSelectSlide}
          styledDeck={styledDeck}
          designLoading={designLoading}
          designError={designError}
          vibe={vibe}
          onVibeChange={onVibeChange}
          onVibeSubmit={onVibeSubmit}
        />
      </div>
    </div>
  );
}
