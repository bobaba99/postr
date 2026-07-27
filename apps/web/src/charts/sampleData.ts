/**
 * Seeded sample-data generators for the plot picker's "I don't have
 * data yet" branch.
 *
 * Values are deterministically generated — same shape always yields
 * the same numbers, so previews are stable across renders and
 * screenshots don't churn. Values are tuned to look like real
 * research output: effect sizes that are visible but not cartoonish,
 * believable n, sensible units.
 *
 * Labels are bogus by policy (feedback_sample_names): John Smith /
 * Jane Doe for people, Acme State University / Sample Research
 * Institute for institutions. Never a real researcher or institution.
 *
 * Because the recommender is a hardcoded lookup, these generators
 * double as its test fixtures — one generator per row of the
 * data-shape table exercises the ranking logic end-to-end.
 */
import type { ChartForm } from '@postr/shared';
import { classifyColumns, type ClassifiedColumn } from './designShape';
import type { InferredColumn, InferredTable } from './inferColumns';
import type { RawTable } from './parseData';

/**
 * The one string that must appear anywhere synthesised values are
 * shown. Exported so the UI, the caption builder and the tests all
 * assert against the same literal — a label that drifts is a label a
 * user can mistake for their own results.
 */
export const SAMPLE_DATA_LABEL = 'Sample data — not your results';

/**
 * Caption prefix for a figure built from synthesised values. Survives
 * into the chart block's caption field on insert, so the warning
 * travels with the figure rather than living only in the picker.
 */
export const SAMPLE_CAPTION_PREFIX = 'Sample data, not real results.';

export type SampleKey =
  | 'grouped-means'
  | 'time-series'
  | 'multi-series'
  | 'two-numeric'
  | 'single-numeric'
  | 'two-category'
  | 'shares'
  | 'likert'
  | 'pre-post'
  | 'from-columns';

export interface SampleDataset {
  key: SampleKey;
  /** Plain-language label shown on the synthetic-path chips. */
  label: string;
  table: RawTable;
  /** Form the recommender is expected to rank first for this shape. */
  expectTopForm: ChartForm;
  /**
   * True when the VALUES were synthesised from detected columns
   * rather than chosen as a worked example. Drives the unmissable
   * sample-data label in the UI and the caption prefix.
   */
  synthetic?: boolean;
  /** Detected column names the sample was generated for. */
  columnNames?: string[];
}

/**
 * mulberry32 — tiny, deterministic, good-enough PRNG. Each generator
 * owns a fixed seed so generators are independent of call order.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** 1 category (6 levels) + 1 number → bar. */
export function makeGroupedMeans(): SampleDataset {
  const rand = mulberry32(101);
  const conditions = ['Control', 'Placebo', 'Low dose', 'High dose', 'Combined', 'Waitlist'];
  const base = [512, 498, 461, 428, 415, 520];
  const rows = conditions.map((condition, i) => [
    condition,
    String(Math.round((base[i] ?? 480) + rand() * 18 - 9)),
  ]);
  return {
    key: 'grouped-means',
    label: 'One number per group',
    table: { header: ['Condition', 'Mean reaction time (ms)'], rows },
    expectTopForm: 'bar',
  };
}

/** ordered + 1 number, single series → line. */
export function makeTimeSeries(): SampleDataset {
  const rand = mulberry32(202);
  const rows: RawTable['rows'] = [];
  let score = 7.4;
  for (let week = 1; week <= 12; week++) {
    rows.push([String(week), String(round(score, 1))]);
    score = Math.max(2.1, score - 0.38 + rand() * 0.3 - 0.1);
  }
  return {
    key: 'time-series',
    label: 'Change over time',
    table: { header: ['Week', 'Symptom severity (0–10)'], rows },
    expectTopForm: 'line',
  };
}

/** ordered + number + category (3 series) → multi-line. */
export function makeMultiSeries(): SampleDataset {
  const rand = mulberry32(303);
  const sites = ['Acme State University', 'Sample Research Institute', 'Acme Community Clinic'];
  const start = [24, 18, 11];
  const growth = [3.1, 2.2, 1.4];
  const rows: RawTable['rows'] = [];
  for (let month = 1; month <= 8; month++) {
    sites.forEach((site, s) => {
      const value = (start[s] ?? 15) + (growth[s] ?? 2) * (month - 1) + rand() * 3 - 1.5;
      rows.push([String(month), site, String(Math.max(0, Math.round(value)))]);
    });
  }
  return {
    key: 'multi-series',
    label: 'Change over time, several groups',
    table: { header: ['Month', 'Site', 'Participants enrolled'], rows },
    expectTopForm: 'line',
  };
}

/** 2 numbers → scatter. */
export function makeTwoNumeric(): SampleDataset {
  const rand = mulberry32(404);
  const rows: RawTable['rows'] = [];
  for (let i = 0; i < 40; i++) {
    const sleep = round(4.5 + rand() * 4.5, 1);
    const recall = round(38 + sleep * 5.2 + rand() * 14 - 7, 0);
    rows.push([String(sleep), String(recall)]);
  }
  return {
    key: 'two-numeric',
    label: 'Two measures per participant',
    table: { header: ['Sleep duration (h)', 'Recall accuracy (%)'], rows },
    expectTopForm: 'scatter',
  };
}

/** 1 number only → histogram. */
export function makeSingleNumeric(): SampleDataset {
  const rand = mulberry32(505);
  const rows: RawTable['rows'] = [];
  for (let i = 0; i < 120; i++) {
    // Sum of three uniforms ≈ normal-ish; right tail from a floor.
    const rt = 320 + (rand() + rand() + rand()) * 140;
    rows.push([String(Math.round(rt))]);
  }
  return {
    key: 'single-numeric',
    label: 'One measure, many observations',
    table: { header: ['Response time (ms)'], rows },
    expectTopForm: 'histogram',
  };
}

/** number + 2 categories → grouped bar. */
export function makeTwoCategory(): SampleDataset {
  const rand = mulberry32(606);
  const conditions = ['Control', 'Low dose', 'High dose'];
  const timepoints = ['Baseline', 'Week 6'];
  const base: Record<string, [number, number]> = {
    Control: [6.8, 6.5],
    'Low dose': [6.9, 5.4],
    'High dose': [7.0, 4.1],
  };
  const rows: RawTable['rows'] = [];
  conditions.forEach((condition) => {
    timepoints.forEach((tp, t) => {
      const b = base[condition] ?? [6.5, 5.5];
      rows.push([condition, tp, String(round((b[t] ?? 6) + rand() * 0.4 - 0.2, 1))]);
    });
  });
  return {
    key: 'two-category',
    label: 'One number across two groupings',
    table: { header: ['Condition', 'Timepoint', 'Mean anxiety score'], rows },
    expectTopForm: 'bar-grouped',
  };
}

/** shares summing to a whole → stacked bar. */
export function makeShares(): SampleDataset {
  const categories = ['Direct care', 'Documentation', 'Coordination', 'Training', 'Other'];
  const shares = [41, 27, 17, 9, 6];
  const rows = categories.map((category, i) => [category, `${shares[i] ?? 5}%`]);
  return {
    key: 'shares',
    label: 'Parts of a whole',
    table: { header: ['Activity', 'Share of shift'], rows },
    expectTopForm: 'bar-stacked',
  };
}

/** Likert / agree–disagree → diverging stacked bar. */
export function makeLikert(): SampleDataset {
  const statements = [
    'The intervention was easy to follow',
    'I would recommend it to others',
    'The sessions fit my schedule',
    'The materials were clear',
  ];
  const levels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
  const dist: number[][] = [
    [4, 9, 15, 44, 28],
    [6, 11, 22, 38, 23],
    [12, 21, 18, 33, 16],
    [3, 7, 12, 47, 31],
  ];
  const rows: RawTable['rows'] = [];
  statements.forEach((statement, s) => {
    levels.forEach((level, l) => {
      rows.push([statement, level, String(dist[s]?.[l] ?? 10)]);
    });
  });
  return {
    key: 'likert',
    label: 'Agreement ratings',
    table: { header: ['Statement', 'Response', 'Respondents (%)'], rows },
    expectTopForm: 'bar-diverging',
  };
}

/** before/after per item → dumbbell. */
export function makePrePost(): SampleDataset {
  const rand = mulberry32(808);
  const outcomes = ['Anxiety', 'Depression', 'Sleep quality', 'Fatigue', 'Pain interference'];
  const baseline = [62, 58, 44, 66, 51];
  const drop = [14, 11, -9, 12, 8]; // sleep quality goes UP (reverse-scored)
  const rows = outcomes.map((outcome, i) => [
    outcome,
    String(Math.round((baseline[i] ?? 55) + rand() * 4 - 2)),
    String(Math.round((baseline[i] ?? 55) - (drop[i] ?? 10) + rand() * 4 - 2)),
  ]);
  return {
    key: 'pre-post',
    label: 'Before and after',
    table: { header: ['Outcome', 'Baseline (T-score)', 'Follow-up (T-score)'], rows },
    expectTopForm: 'dumbbell',
  };
}

// ────────────────────────────────────────────────────────────────────
// Column-derived samples (B2)
//
// When the user has COLUMNS but no usable values — a header-only
// paste, an extraction that recovered names and nothing else — we
// still generate a figure, from values synthesised for the columns
// actually detected. The result is explicitly labelled sample data
// everywhere it appears.
//
// Values are deliberately unremarkable: no dramatic effect, no
// suspiciously round p-value-shaped numbers, nothing a reader could
// mistake for a finding. Bogus labels only, per the house rule.
// ────────────────────────────────────────────────────────────────────

/** Bogus category levels, per feedback_sample_names. Never real. */
const BOGUS_LEVELS = [
  'Group A',
  'Group B',
  'Group C',
  'Group D',
  'Group E',
  'Group F',
];

const BOGUS_SITES = [
  'Acme State University',
  'Sample Research Institute',
  'Acme Community Clinic',
];

const BOGUS_PEOPLE = ['John Smith', 'Jane Doe'];

const SITE_NAME = /\b(site|centre|center|institution|university|clinic|hospital|lab)\b/i;
const PERSON_NAME = /\b(name|participant|subject|patient|respondent|student|rater)\b/i;

/** Rows to synthesise. Enough to look like data, small enough to scan. */
const SYNTHESISED_ROWS = 24;

/** How many levels a detected categorical column gets when unknown. */
const DEFAULT_LEVELS = 4;

function levelsFor(col: ClassifiedColumn): string[] {
  // An already-populated column keeps its real level names — those
  // are the user's own labels, not invented ones.
  const observed = [
    ...new Set(
      col.column.values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
    ),
  ];
  if (observed.length >= 2) return observed.slice(0, 6);

  if (SITE_NAME.test(col.name)) return BOGUS_SITES;
  if (PERSON_NAME.test(col.name)) return BOGUS_PEOPLE;
  const count = Math.min(6, Math.max(2, col.levels >= 2 ? col.levels : DEFAULT_LEVELS));
  return BOGUS_LEVELS.slice(0, count);
}

/**
 * Plausible-but-flat value range for a synthesised measure. Named
 * units nudge the scale so "Age (years)" is not generated in the
 * hundreds, but nothing here encodes a result.
 */
function rangeFor(name: string): { base: number; spread: number; dp: number } {
  if (/\b(percent|percentage|%|share|proportion|accuracy)\b/i.test(name)) {
    return { base: 50, spread: 20, dp: 0 };
  }
  if (/\b(ms|millisecond|latency|rt|reaction|response ?time)\b/i.test(name)) {
    return { base: 450, spread: 90, dp: 0 };
  }
  if (/\b(age|years?)\b/i.test(name)) return { base: 40, spread: 14, dp: 0 };
  if (/\b(score|rating|severity|index)\b/i.test(name)) return { base: 5, spread: 2.5, dp: 1 };
  if (/\b(count|n|total|participants?|enrolled)\b/i.test(name)) {
    return { base: 30, spread: 12, dp: 0 };
  }
  return { base: 20, spread: 8, dp: 1 };
}

/**
 * Stable seed derived from the column names, so the same detected
 * header always yields the same sample values. Screenshots and
 * previews do not churn between renders.
 */
function seedFromNames(names: string[]): number {
  let h = 2166136261;
  for (const ch of names.join(' ')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** True when a column has no usable values to chart. */
function isEmptyColumn(col: InferredColumn): boolean {
  return col.values.every((v) => v === null);
}

/**
 * True when the table has columns but not enough real values behind
 * them to build a figure — the trigger for the synthesised path.
 * A table is "partial" when it has no rows at all, or when every
 * numeric column it detected is empty.
 */
export function needsSyntheticValues(table: InferredTable): boolean {
  if (table.columns.length === 0) return false;
  if (table.rowCount === 0) return true;
  // An empty column infers as `category` (there is nothing to parse),
  // so ask the classifier — which falls back to the column NAME —
  // rather than the raw inferred kind. Otherwise a table whose only
  // measure came back blank looks like an all-categorical table and
  // never reaches the generator.
  const measures = classifyColumns(table).filter((c) => c.role === 'dependent');
  if (measures.length === 0) return false;
  return measures.every((c) => isEmptyColumn(c.column));
}

/**
 * Generate sample values for the columns actually detected.
 *
 * Every column in `table` is reproduced by name and inferred type;
 * only the VALUES are invented. The returned dataset is flagged
 * `synthetic` so every downstream surface — preview, caption, insert
 * — can label it.
 */
export function makeFromColumns(table: InferredTable): SampleDataset {
  const classified = classifyColumns(table);
  const rand = mulberry32(seedFromNames(classified.map((c) => c.name)));

  // Level pools for the categorical/temporal columns, resolved once
  // so every row draws from the same set.
  const pools = new Map<string, string[]>();
  for (const col of classified) {
    if (col.type === 'categorical' || col.type === 'identifier') {
      pools.set(col.name, levelsFor(col));
    }
  }

  const rows: RawTable['rows'] = [];
  for (let i = 0; i < SYNTHESISED_ROWS; i++) {
    const row: RawTable['rows'][number] = classified.map((col) => {
      if (col.type === 'temporal') {
        // Repeat the ordered axis across groups so a trend exists.
        return String((i % 8) + 1);
      }
      if (col.type === 'continuous') {
        const { base, spread, dp } = rangeFor(col.name);
        return String(round(base + (rand() - 0.5) * spread * 2, dp));
      }
      const pool = pools.get(col.name) ?? BOGUS_LEVELS;
      return pool[i % pool.length] ?? BOGUS_LEVELS[0]!;
    });
    rows.push(row);
  }

  return {
    key: 'from-columns',
    label: 'Sample values for your columns',
    table: { header: classified.map((c) => c.name), rows },
    expectTopForm: 'bar',
    synthetic: true,
    /** Named so captions can say which columns the sample covers. */
    columnNames: classified.map((c) => c.name),
  };
}

/** Every generator, in data-shape-table order. */
export function sampleDatasets(): SampleDataset[] {
  return [
    makeGroupedMeans(),
    makeTimeSeries(),
    makeMultiSeries(),
    makeTwoNumeric(),
    makeSingleNumeric(),
    makeTwoCategory(),
    makeShares(),
    makeLikert(),
    makePrePost(),
  ];
}
