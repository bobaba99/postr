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
import type { RawTable } from './parseData';

export type SampleKey =
  | 'grouped-means'
  | 'time-series'
  | 'multi-series'
  | 'two-numeric'
  | 'single-numeric'
  | 'two-category'
  | 'shares'
  | 'likert'
  | 'pre-post';

export interface SampleDataset {
  key: SampleKey;
  /** Plain-language label shown on the synthetic-path chips. */
  label: string;
  table: RawTable;
  /** Form the recommender is expected to rank first for this shape. */
  expectTopForm: ChartForm;
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
