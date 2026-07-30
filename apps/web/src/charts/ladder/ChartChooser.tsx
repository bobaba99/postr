/**
 * ChartChooser — the auto-scrolling questionnaire ladder.
 *
 * One vertically scrolling column of steps. Answering a step locks
 * it into a compact summary, reveals the next step, and
 * smooth-scrolls it into view (guarded by prefers-reduced-motion;
 * never on page load — only in response to a user answer). Focus
 * moves with the scroll. Re-opening a step invalidates everything
 * below it.
 *
 * The same component serves both surfaces: the Figure sidebar panel
 * (stacked previews, insert action) and the standalone /chart-chooser
 * page (3-up previews, download actions) — only layout and the
 * action list differ.
 */
import { useMemo, useRef, useState } from 'react';
import type { Palette } from '@postr/shared';
import type { DeclaredVariable } from '../declaredVariables';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';
import { groupingCandidates } from '../recommend';
import { SAMPLE_DATA_LABEL } from '../sampleData';
import {
  EMPHASIS_OPTIONS,
  SHAPE_OPTIONS,
  planLadder,
  type DataSource,
  type LadderAnswers,
  type StepId,
} from './steps';
import { ChipRow } from './ChipRow';
import { DataStep, type PosterTableRef } from './DataStep';
import { VariablesStep } from './VariablesStep';
import { PreviewStep, type PreviewAction, type SelectedFigure } from './PreviewStep';
import { StepSection } from './StepSection';

export type { PreviewAction, SelectedFigure };

export interface ChartChooserProps {
  layout: 'panel' | 'page';
  palette: Palette;
  /** Poster surface font (CSS family string) for previews/captions. */
  fontFamily: string;
  posterTables?: PosterTableRef[];
  /** Result actions rendered under each preview panel. */
  actions: PreviewAction[];
  /** Confirmation line after the primary action runs. */
  confirmation?: string;
}

const VARS_OPTIONS = [
  { value: '0' as const, label: 'Just the measure' },
  { value: '1' as const, label: 'One grouping variable' },
  { value: '2' as const, label: 'Two grouping variables' },
];

/** Which answer keys belong to each ladder rung (both branches). */
const RUNG_KEYS: Record<Exclude<StepId, 'data' | 'preview'>, Array<keyof LadderAnswers>> = {
  measure: ['shape', 'measure'],
  grouping: ['vars', 'groupings'],
  emphasis: ['emphasis'],
};

const RUNG_ORDER: Array<keyof typeof RUNG_KEYS> = ['measure', 'grouping', 'emphasis'];

export function ChartChooser({
  layout,
  palette,
  fontFamily,
  posterTables = [],
  actions,
  confirmation,
}: ChartChooserProps) {
  const [source, setSource] = useState<DataSource | null>(null);
  const [answers, setAnswers] = useState<LadderAnswers>({});
  const [dataSummary, setDataSummary] = useState('');
  const [pendingGroups, setPendingGroups] = useState<string[]>([]);
  /**
   * True while step 1 shows the declare-your-variables form instead of
   * the paste/upload affordances. Local to step 1 — once variables are
   * declared the source carries them and this returns to false.
   */
  const [listingVariables, setListingVariables] = useState(false);
  const hasInteracted = useRef(false);

  const plan = useMemo(() => planLadder(source, answers), [source, answers]);

  const answer = (rung: keyof typeof RUNG_KEYS, patch: Partial<LadderAnswers>) => {
    hasInteracted.current = true;
    setAnswers((prev) => {
      const keep: LadderAnswers = {};
      for (const earlier of RUNG_ORDER.slice(0, RUNG_ORDER.indexOf(rung))) {
        for (const key of RUNG_KEYS[earlier]) {
          const value = prev[key];
          if (value !== undefined) Object.assign(keep, { [key]: value });
        }
      }
      return { ...keep, ...patch };
    });
  };

  const reopen = (rung: keyof typeof RUNG_KEYS) => {
    hasInteracted.current = true;
    setPendingGroups(answers.groupings ?? []);
    setAnswers((prev) => {
      const keep: LadderAnswers = {};
      for (const earlier of RUNG_ORDER.slice(0, RUNG_ORDER.indexOf(rung))) {
        for (const key of RUNG_KEYS[earlier]) {
          const value = prev[key];
          if (value !== undefined) Object.assign(keep, { [key]: value });
        }
      }
      return keep;
    });
  };

  const onTable = (table: RawTable, summary: string) => {
    hasInteracted.current = true;
    setSource({ kind: 'table', table: inferTable(table) });
    setAnswers({});
    setPendingGroups([]);
    setListingVariables(false);
    setDataSummary(summary);
  };

  const onSynthetic = () => {
    hasInteracted.current = true;
    setSource({ kind: 'synthetic' });
    setAnswers({});
    setPendingGroups([]);
    setListingVariables(false);
    setDataSummary('Worked example — swap in your numbers after inserting');
  };

  const onDeclare = (variables: readonly DeclaredVariable[], summary: string) => {
    hasInteracted.current = true;
    setSource({ kind: 'variables', variables });
    setAnswers({});
    setPendingGroups([]);
    setListingVariables(false);
    setDataSummary(summary);
  };

  const resetData = () => {
    hasInteracted.current = true;
    setSource(null);
    setAnswers({});
    setPendingGroups([]);
    setListingVariables(false);
    setDataSummary('');
  };

  const synthetic = source?.kind === 'synthetic';
  const activeIndex = plan.steps.indexOf(plan.active);
  const visibleSteps = plan.steps.slice(0, activeIndex + 1);

  const groupingChips =
    !synthetic && plan.table
      ? groupingCandidates(plan.table)
          .filter((c) => c.name !== answers.measure)
          .map((c) => ({ value: c.name, label: c.name }))
      : [];

  const summaryFor = (step: StepId): string => {
    switch (step) {
      case 'data':
        // The collapsed step-1 summary is the only trace of the data
        // source once the ladder scrolls past it, so the sample-data
        // warning has to appear here too — not just on the previews.
        return !synthetic && plan.syntheticValues
          ? `${dataSummary} — ${SAMPLE_DATA_LABEL}`
          : dataSummary;
      case 'measure':
        return synthetic
          ? SHAPE_OPTIONS.find((o) => o.value === answers.shape)?.label ?? ''
          : answers.measure ?? '';
      case 'grouping':
        if (synthetic) return VARS_OPTIONS.find((o) => o.value === String(answers.vars))?.label ?? '';
        return answers.groupings && answers.groupings.length > 0
          ? answers.groupings.join(', ')
          : 'None';
      case 'emphasis':
        return EMPHASIS_OPTIONS.find((o) => o.value === answers.emphasis)?.label ?? '';
      case 'preview':
        return '';
    }
  };

  const titleFor = (step: StepId): string => {
    switch (step) {
      case 'data':
        return 'Your data';
      case 'measure':
        return synthetic ? 'What are you showing?' : 'What did you measure?';
      case 'grouping':
        return synthetic ? 'How many variables?' : 'Compare across which columns?';
      case 'emphasis':
        return 'What should the figure emphasise?';
      case 'preview':
        return 'Pick your figure';
    }
  };

  /**
   * Plain-language helper under each active step's title. The step
   * titles are terse questions; without a helper, "Compare across which
   * columns?" left users unsure what a "grouping column" even is. The
   * synthetic branch asks its own self-explanatory questions, so it
   * gets no hints.
   */
  const hintFor = (step: StepId): string | undefined => {
    if (synthetic) return undefined;
    switch (step) {
      case 'measure':
        return 'Your numeric result — the values you recorded, like score, latency, or concentration.';
      case 'grouping':
        return 'Columns that split your data into groups to compare — like treatment vs. control, sex, or timepoint. Pick up to two, or none.';
      default:
        return undefined;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {visibleSteps.map((step, i) => {
        const state = step === plan.active ? 'active' : 'answered';
        const hint = hintFor(step);
        const common = {
          index: i + 1,
          title: titleFor(step),
          state,
          shouldFocusOnMount: hasInteracted.current,
          ...(hint !== undefined ? { hint } : {}),
        } as const;

        if (step === 'data') {
          return state === 'answered' ? (
            <StepSection key={step} {...common} summary={summaryFor(step)} onReopen={resetData} />
          ) : (
            <StepSection key={step} {...common}>
              {listingVariables ? (
                <VariablesStep
                  onDeclare={onDeclare}
                  onCancel={() => setListingVariables(false)}
                />
              ) : (
                <DataStep
                  posterTables={posterTables}
                  onTable={onTable}
                  onSynthetic={onSynthetic}
                  onListVariables={() => {
                    hasInteracted.current = true;
                    setListingVariables(true);
                  }}
                />
              )}
            </StepSection>
          );
        }

        if (step === 'preview') {
          return (
            <StepSection key={step} {...common}>
              {plan.table && (
                <PreviewStep
                  table={plan.table}
                  choice={plan.choice}
                  palette={palette}
                  fontFamily={fontFamily}
                  layout={layout}
                  actions={actions}
                  sample={plan.syntheticValues}
                  {...(confirmation !== undefined ? { confirmation } : {})}
                />
              )}
            </StepSection>
          );
        }

        if (state === 'answered') {
          return (
            <StepSection
              key={step}
              {...common}
              summary={summaryFor(step)}
              onReopen={() => reopen(step)}
            />
          );
        }

        if (step === 'measure') {
          return (
            <StepSection key={step} {...common}>
              {synthetic ? (
                <ChipRow
                  label="What are you showing?"
                  options={SHAPE_OPTIONS}
                  selected={answers.shape ?? null}
                  onPick={(v) => answer('measure', { shape: v })}
                />
              ) : (
                <ChipRow
                  label="Pick the outcome column"
                  options={
                    plan.table
                      ? plan.table.columns
                          .filter((c) => c.kind === 'number' && !c.ordered)
                          .map((c) => ({ value: c.name, label: c.name }))
                      : []
                  }
                  selected={answers.measure ?? null}
                  onPick={(v) => answer('measure', { measure: v })}
                />
              )}
            </StepSection>
          );
        }

        if (step === 'grouping') {
          return (
            <StepSection key={step} {...common}>
              {synthetic ? (
                <ChipRow
                  label="How many variables?"
                  options={VARS_OPTIONS}
                  selected={answers.vars === undefined ? null : String(answers.vars) as '0' | '1' | '2'}
                  onPick={(v) => answer('grouping', { vars: Number(v) as 0 | 1 | 2 })}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ChipRow
                    label="Pick up to two columns to compare across"
                    options={groupingChips}
                    selected={pendingGroups}
                    multi
                    onPick={(name) =>
                      setPendingGroups((prev) =>
                        prev.includes(name)
                          ? prev.filter((n) => n !== name)
                          : [...prev, name].slice(-2),
                      )
                    }
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => answer('grouping', { groupings: pendingGroups })}
                      disabled={pendingGroups.length === 0}
                      style={{
                        border: 'none',
                        background: pendingGroups.length > 0 ? '#7c6aed' : '#2a2a3a',
                        color: pendingGroups.length > 0 ? '#ffffff' : '#6b6b76',
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: pendingGroups.length > 0 ? 'pointer' : 'default',
                      }}
                    >
                      Use these
                    </button>
                    <button
                      type="button"
                      onClick={() => answer('grouping', { groupings: [] })}
                      style={{
                        border: '1px solid #2a2a3a',
                        background: 'transparent',
                        color: '#c8cad0',
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Don’t split
                    </button>
                  </div>
                </div>
              )}
            </StepSection>
          );
        }

        // emphasis
        return (
          <StepSection key={step} {...common}>
            <ChipRow
              label="What do you want people to take away?"
              options={EMPHASIS_OPTIONS}
              selected={answers.emphasis ?? null}
              onPick={(v) => answer('emphasis', { emphasis: v })}
            />
          </StepSection>
        );
      })}
    </div>
  );
}
