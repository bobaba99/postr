/**
 * Ladder planning — which questionnaire steps render, in what order,
 * and which is active. Pure functions; the React ladder is a thin
 * shell over this.
 *
 * The design rule (v2 plan §0): the questionnaire is a fallback that
 * self-destructs, not a gate. A question the recommender can answer
 * from the data is never rendered — not pre-filled and skipped,
 * never shown. Typical question counts: 0 (data pasted), 1 (data
 * pasted, ambiguous intent), 3–4 (no data at all).
 */
import type { InferredTable } from '../inferColumns';
import { inferTable } from '../inferColumns';
import {
  groupingCandidates,
  measureCandidates,
  needsEmphasisQuestion,
  type Emphasis,
  type RoleChoice,
} from '../recommend';
import {
  makeFromColumns,
  makeGroupedMeans,
  makeLikert,
  makeMultiSeries,
  makePrePost,
  makeShares,
  makeSingleNumeric,
  makeTimeSeries,
  makeTwoCategory,
  makeTwoNumeric,
  needsSyntheticValues,
  type SampleDataset,
} from '../sampleData';

export type StepId = 'data' | 'measure' | 'grouping' | 'emphasis' | 'preview';

/** Step 2 of the synthetic branch: what data are you showing? */
export type SyntheticShape =
  | 'groups'
  | 'time'
  | 'relationship'
  | 'whole'
  | 'agreement'
  | 'prepost'
  | 'spread';

export type DataSource =
  | { kind: 'table'; table: InferredTable }
  | { kind: 'synthetic' };

export interface LadderAnswers {
  /** Synthetic branch: chosen data shape (step 2). */
  shape?: SyntheticShape;
  /** Synthetic branch: number of grouping variables (step 3). */
  vars?: 0 | 1 | 2;
  /** Data branch: chosen outcome column (step 2). */
  measure?: string;
  /** Data branch: chosen grouping columns (step 3). */
  groupings?: string[];
  /** Step 4 — what should the figure emphasize. */
  emphasis?: Emphasis;
}

export interface StepPlan {
  /** Steps that render, in ladder order. */
  steps: StepId[];
  /** First unanswered step ('preview' when everything is settled). */
  active: StepId;
  /** The table the recommender should rank (synthetic resolved). */
  table: InferredTable | null;
  /** Assembled recommender input. */
  choice: RoleChoice;
  /** Synthetic dataset backing the previews, when applicable. */
  sample: SampleDataset | null;
  /**
   * True when the previewed VALUES were synthesised — either the
   * "no data yet" branch or a column-only table whose values we
   * generated. Drives the sample-data label; never true for a table
   * the user actually supplied values for.
   */
  syntheticValues: boolean;
}

/** Map the synthetic answers to a seeded dataset. */
export function pickSample(shape: SyntheticShape, vars: 0 | 1 | 2 | undefined): SampleDataset {
  switch (shape) {
    case 'groups':
      if (vars === 0) return makeSingleNumeric();
      if (vars === 2) return makeTwoCategory();
      return makeGroupedMeans();
    case 'time':
      return vars === undefined || vars === 0 ? makeTimeSeries() : makeMultiSeries();
    case 'relationship':
      return makeTwoNumeric();
    case 'whole':
      return makeShares();
    case 'agreement':
      return makeLikert();
    case 'prepost':
      return makePrePost();
    case 'spread':
      return makeSingleNumeric();
  }
}

/**
 * Shapes where the variable-count answer actually selects a different
 * dataset. For every other shape `pickSample` ignores `vars`, so asking
 * would be a dead rung — and the governing rule (§0) is that a question
 * which cannot change the output is never rendered.
 */
export const VARS_SENSITIVE_SHAPES: ReadonlySet<SyntheticShape> = new Set<SyntheticShape>([
  'groups',
  'time',
]);

const inferCache = new WeakMap<SampleDataset['table'], InferredTable>();

function inferSample(sample: SampleDataset): InferredTable {
  const cached = inferCache.get(sample.table);
  if (cached) return cached;
  const inferred = inferTable(sample.table);
  inferCache.set(sample.table, inferred);
  return inferred;
}

function planSynthetic(answers: LadderAnswers): StepPlan {
  // With no data there is nothing to infer the shape from, so the
  // shape question always renders. The variable-count question renders
  // only for the shapes whose sample it actually changes.
  const needVars = answers.shape !== undefined && VARS_SENSITIVE_SHAPES.has(answers.shape);
  const steps: StepId[] = [
    'data',
    'measure',
    ...(needVars ? (['grouping'] as const) : []),
    'emphasis',
    'preview',
  ];
  const sample = answers.shape ? pickSample(answers.shape, answers.vars) : null;
  const table = sample ? inferSample(sample) : null;

  const varsAnswered = !needVars || answers.vars !== undefined;

  const active: StepId =
    answers.shape === undefined
      ? 'measure'
      : !varsAnswered
        ? 'grouping'
        : answers.emphasis === undefined
          ? 'emphasis'
          : 'preview';

  return {
    steps,
    active,
    table,
    choice: { emphasis: answers.emphasis ?? null },
    sample,
    // The whole branch is worked examples, so every preview here is
    // sample data by definition.
    syntheticValues: true,
  };
}

function planFromTable(supplied: InferredTable, answers: LadderAnswers): StepPlan {
  // Columns detected but no usable values behind them (header-only
  // paste, partial extraction). Rather than showing an empty figure,
  // generate values FOR THOSE COLUMNS and label the result as sample
  // data everywhere it surfaces.
  const syntheticValues = needsSyntheticValues(supplied);
  const generated = syntheticValues ? makeFromColumns(supplied) : null;
  const table = generated ? inferSample(generated) : supplied;

  const steps: StepId[] = ['data'];

  const measures = measureCandidates(table);
  const needMeasure = measures.length > 1;
  if (needMeasure) steps.push('measure');
  const measureAnswered = !needMeasure || answers.measure !== undefined;

  const choiceSoFar: RoleChoice = {
    ...(answers.measure !== undefined ? { measure: answers.measure } : {}),
  };

  // Grouping is ambiguous when there are more plausible grouping
  // columns than the recommender can use — it will otherwise take
  // the first two, which may be the wrong two.
  const groupings = groupingCandidates(table).filter((c) => c.name !== answers.measure);
  const needGrouping = groupings.length > 2;
  if (needGrouping) steps.push('grouping');
  const groupingAnswered = !needGrouping || answers.groupings !== undefined;

  if (answers.groupings !== undefined) choiceSoFar.groupings = answers.groupings;

  // The emphasis question renders only when two forms from different
  // rhetorical families genuinely tie — and only once the earlier
  // answers are in, since they can settle the tie by themselves.
  const needEmphasis =
    measureAnswered && groupingAnswered && needsEmphasisQuestion(table, choiceSoFar);
  if (needEmphasis) steps.push('emphasis');
  const emphasisAnswered = !needEmphasis || answers.emphasis !== undefined;

  steps.push('preview');

  const active: StepId = !measureAnswered
    ? 'measure'
    : !groupingAnswered
      ? 'grouping'
      : !emphasisAnswered
        ? 'emphasis'
        : 'preview';

  return {
    steps,
    active,
    table,
    choice: {
      ...choiceSoFar,
      emphasis: answers.emphasis ?? null,
    },
    sample: generated,
    syntheticValues,
  };
}

/**
 * Plan the ladder for the current source + answers. A null source
 * means step 1 is still waiting for input.
 */
export function planLadder(source: DataSource | null, answers: LadderAnswers): StepPlan {
  if (source === null) {
    return {
      steps: ['data'],
      active: 'data',
      table: null,
      choice: {},
      sample: null,
      syntheticValues: false,
    };
  }
  if (source.kind === 'synthetic') return planSynthetic(answers);
  return planFromTable(source.table, answers);
}

export const EMPHASIS_OPTIONS: Array<{ value: Emphasis; label: string }> = [
  { value: 'difference', label: 'Difference between groups' },
  { value: 'trend', label: 'Change over time' },
  { value: 'spread', label: 'Spread / variability' },
  { value: 'relationship', label: 'Relationship between two measures' },
  { value: 'share', label: 'Share of a whole' },
];

export const SHAPE_OPTIONS: Array<{ value: SyntheticShape; label: string }> = [
  { value: 'groups', label: 'A number compared across groups' },
  { value: 'time', label: 'A measure tracked over time' },
  { value: 'relationship', label: 'The relationship between two measures' },
  { value: 'whole', label: 'Parts of a whole' },
  { value: 'agreement', label: 'Ratings on an agreement scale' },
  { value: 'prepost', label: 'Before-and-after values' },
  { value: 'spread', label: 'The spread of one measure' },
];
