/**
 * The hardcoded chart recommender.
 *
 * Data shape → ranked forms, implemented as a plain lookup with
 * explicit guardrails, per docs/plans/2026-07-23-plot-picker-design.md
 * §3 and confirmed in the v2 plan: no LLM anywhere in the create
 * path. Deterministic: same table + same answers → same ranking.
 *
 * Guardrails are baked into ranking, not warnings after the fact:
 * many-series lines are demoted in favor of heatmaps, single series
 * never get a legend, long labels flip bars horizontal, and dual axes
 * simply cannot be produced.
 */
import type { ChartForm } from '@postr/shared';
import { detectDesignShape, isUnchartable, type DesignShape } from './designShape';
import type { InferredColumn, InferredTable } from './inferColumns';

export type Emphasis = 'difference' | 'trend' | 'spread' | 'relationship' | 'share';

/** User answers from the ladder. All optional — inference fills gaps. */
export interface RoleChoice {
  /** Outcome column name (ladder step 2). */
  measure?: string | null;
  /** Grouping column names, 0–2 (ladder step 3). */
  groupings?: string[] | null;
  /** What the figure should emphasize (ladder step 4). */
  emphasis?: Emphasis | null;
}

export interface Recommendation {
  form: ChartForm;
  /** Display name, e.g. "Bar chart". */
  name: string;
  /** Methods-voice justification — defensible if a PI asks. */
  why: string;
  score: number;
  /** Resolved column roles the spec builder needs. */
  roles: ResolvedRoles;
  /** True when values are aggregated to means at render time. */
  aggregate: boolean;
  /** Bars rotated horizontal (long labels / many levels). */
  horizontal: boolean;
}

export interface ResolvedRoles {
  /** Primary continuous measure. */
  measure: InferredColumn | null;
  /** Second continuous measure (scatter / dumbbell). */
  measure2: InferredColumn | null;
  /** Ordered axis (dates, years, weeks). */
  time: InferredColumn | null;
  /** Primary categorical grouping. */
  cat1: InferredColumn | null;
  /** Secondary categorical grouping. */
  cat2: InferredColumn | null;
  shape: ShapeKind;
}

export type ShapeKind =
  | 'pre-post'
  | 'likert'
  | 'shares'
  | 'trend-multi'
  | 'trend'
  | 'two-numeric'
  | 'category-value'
  | 'two-category'
  | 'distribution'
  | 'unknown';

const MAX_GROUP_LEVELS = 30;

const LIKERT_VOCAB = new Set([
  'strongly disagree',
  'disagree',
  'somewhat disagree',
  'neither agree nor disagree',
  'neutral',
  'somewhat agree',
  'agree',
  'strongly agree',
]);

export const FORM_NAMES: Record<ChartForm, string> = {
  bar: 'Bar chart',
  'bar-grouped': 'Grouped bar chart',
  'bar-stacked': 'Stacked bar chart',
  'bar-diverging': 'Diverging stacked bar',
  line: 'Line chart',
  area: 'Area chart',
  scatter: 'Scatter plot',
  histogram: 'Histogram',
  box: 'Box plot',
  heatmap: 'Heatmap',
  dumbbell: 'Dumbbell plot',
};

/** Emphasis family per form — used for tie detection and boosts. */
export const FORM_FAMILY: Record<ChartForm, Emphasis> = {
  bar: 'difference',
  'bar-grouped': 'difference',
  dumbbell: 'difference',
  line: 'trend',
  area: 'trend',
  histogram: 'spread',
  box: 'spread',
  scatter: 'relationship',
  heatmap: 'relationship',
  'bar-stacked': 'share',
  'bar-diverging': 'share',
};

// ────────────────────────────────────────────────────────────────────
// Candidate columns — used by the ladder to decide which questions
// even render.
// ────────────────────────────────────────────────────────────────────

/** Columns that could plausibly be the outcome measure. */
export function measureCandidates(table: InferredTable): InferredColumn[] {
  return table.columns.filter((c) => c.kind === 'number' && !c.ordered);
}

/** Columns that could plausibly group the measure. */
export function groupingCandidates(table: InferredTable): InferredColumn[] {
  return table.columns.filter(
    (c) =>
      c.kind === 'date' ||
      (c.kind === 'number' && c.ordered) ||
      (c.kind === 'category' && c.distinct >= 2 && c.distinct <= MAX_GROUP_LEVELS),
  );
}

// ────────────────────────────────────────────────────────────────────
// Shape detection
// ────────────────────────────────────────────────────────────────────

function byName(table: InferredTable, name: string): InferredColumn | null {
  return table.columns.find((c) => c.name === name) ?? null;
}

function isLikertColumn(col: InferredColumn): boolean {
  if (col.kind !== 'category') return false;
  const values = new Set(
    col.values
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toLowerCase().trim()),
  );
  if (values.size < 3) return false;
  let matched = 0;
  for (const v of values) {
    if (LIKERT_VOCAB.has(v)) matched++;
  }
  return matched >= 3 && matched === values.size;
}

const PRE_NAME = /\b(pre|before|baseline|t0|t1|time ?1)\b/i;
const POST_NAME = /\b(post|after|follow[- ]?up|t2|time ?2|end(point)?)\b/i;

function looksSharesWhole(measure: InferredColumn): boolean {
  const nums = measure.values.filter((v): v is number => typeof v === 'number');
  if (nums.length < 2) return false;
  if (measure.percent) return true;
  const sum = nums.reduce((a, b) => a + b, 0);
  return (sum >= 96 && sum <= 104) || (sum >= 0.96 && sum <= 1.04);
}

/**
 * Resolve which column plays which role, honoring the user's ladder
 * answers where given and inferring the rest.
 */
export function resolveRoles(table: InferredTable, choice: RoleChoice = {}): ResolvedRoles {
  const empty: ResolvedRoles = {
    measure: null,
    measure2: null,
    time: null,
    cat1: null,
    cat2: null,
    shape: 'unknown',
  };

  const numerics = measureCandidates(table);
  const chosen = choice.measure ? byName(table, choice.measure) : null;
  const measure = chosen && chosen.kind === 'number' ? chosen : (numerics[0] ?? null);

  // Grouping pool: the user's picks verbatim when the grouping
  // question was answered (an explicit empty array means "no
  // grouping" and must NOT fall back to inference), else every
  // candidate column.
  const groupPool = (
    Array.isArray(choice.groupings)
      ? choice.groupings
          .map((name) => byName(table, name))
          .filter((c): c is InferredColumn => c !== null)
      : groupingCandidates(table)
  ).filter((c) => c !== measure);

  const time = groupPool.find((c) => c.kind === 'date' || (c.kind === 'number' && c.ordered)) ?? null;
  const cats = groupPool.filter((c) => c.kind === 'category');
  const likertCol = cats.find(isLikertColumn) ?? null;
  const cat1 = cats[0] ?? null;
  const cat2 = cats[1] ?? null;

  const secondNumeric = numerics.filter((c) => c !== measure)[0] ?? null;

  if (!measure) {
    // No numeric measure at all — nothing chartable in Phase 1 terms.
    return empty;
  }

  // Pre/post pair: two numerics named like a before/after pair, plus
  // an item column. User-chosen groupings don't override this — the
  // pair is in the measures, not the groupings.
  if (
    secondNumeric &&
    cat1 &&
    !likertCol &&
    ((PRE_NAME.test(measure.name) && POST_NAME.test(secondNumeric.name)) ||
      (POST_NAME.test(measure.name) && PRE_NAME.test(secondNumeric.name)))
  ) {
    const [pre, post] = PRE_NAME.test(measure.name)
      ? [measure, secondNumeric]
      : [secondNumeric, measure];
    return { ...empty, measure: pre, measure2: post, cat1, shape: 'pre-post' };
  }

  if (likertCol && cat1 && cats.length >= 2) {
    const statement = cats.find((c) => c !== likertCol) ?? null;
    if (statement) {
      return { ...empty, measure, cat1: statement, cat2: likertCol, shape: 'likert' };
    }
  }
  if (likertCol && cats.length === 1) {
    // Single Likert column + measure: levels ARE the x axis.
    return { ...empty, measure, cat1: likertCol, shape: 'likert' };
  }

  if (time) {
    if (cat1) return { ...empty, measure, time, cat1, shape: 'trend-multi' };
    return { ...empty, measure, time, shape: 'trend' };
  }

  if (cat1 && cat2) {
    return { ...empty, measure, cat1, cat2, shape: 'two-category' };
  }

  if (cat1) {
    if (looksSharesWhole(measure) && cat1.distinct >= 3 && cat1.distinct <= 12) {
      return { ...empty, measure, cat1, shape: 'shares' };
    }
    return { ...empty, measure, cat1, shape: 'category-value' };
  }

  // No grouping chosen or available. A second numeric column makes
  // this a relationship — true whether the user skipped the grouping
  // question or explicitly answered "none" (scatter needs no groups).
  if (secondNumeric) {
    return { ...empty, measure, measure2: secondNumeric, shape: 'two-numeric' };
  }

  return { ...empty, measure, shape: 'distribution' };
}

// ────────────────────────────────────────────────────────────────────
// Ranking
// ────────────────────────────────────────────────────────────────────

interface Candidate {
  form: ChartForm;
  score: number;
  aggregate?: boolean;
  horizontal?: boolean;
}

function longLabels(col: InferredColumn | null): boolean {
  if (!col) return false;
  const labels = col.values.filter((v): v is string => typeof v === 'string');
  return labels.some((l) => l.length > 12) || col.distinct > 8;
}

/** Rows-per-group > 1 means bars must aggregate and boxes make sense. */
function hasRepeats(measure: InferredColumn | null, group: InferredColumn | null, rowCount: number): boolean {
  if (!measure || !group) return false;
  return rowCount > group.distinct;
}

function shapeCandidates(table: InferredTable, roles: ResolvedRoles): Candidate[] {
  const { shape, measure, cat1, cat2 } = roles;
  const n = table.rowCount;

  switch (shape) {
    case 'pre-post':
      return [
        { form: 'dumbbell', score: 12, horizontal: true },
        { form: 'bar-grouped', score: 7 },
      ];
    case 'likert':
      return [
        { form: 'bar-diverging', score: 12, horizontal: true },
        { form: 'bar-stacked', score: 8, horizontal: true },
      ];
    case 'shares':
      return [
        { form: 'bar-stacked', score: 11, horizontal: true },
        { form: 'bar', score: 8, horizontal: longLabels(cat1) },
      ];
    case 'trend-multi': {
      const series = cat1?.distinct ?? 0;
      // > 8 series: a many-hued line chart is unreadable; the spec
      // builder folds the tail into "Other" and the heatmap becomes a
      // serious alternative rather than a curiosity.
      const crowded = series > 8;
      return [
        { form: 'line', score: crowded ? 9 : 12 },
        { form: 'heatmap', score: crowded ? 10 : 6 },
        { form: 'bar-grouped', score: series <= 4 ? 7 : 4, aggregate: true },
      ];
    }
    case 'trend':
      return [
        { form: 'line', score: 12 },
        { form: 'area', score: 9 },
        { form: 'bar', score: 5, aggregate: hasRepeats(measure, roles.time, n) },
      ];
    case 'two-numeric': {
      const dense = n > 400;
      return [
        { form: 'scatter', score: dense ? 9 : 12 },
        { form: 'heatmap', score: dense ? 11 : 6 },
      ];
    }
    case 'category-value': {
      const repeats = hasRepeats(measure, cat1, n);
      return [
        { form: 'bar', score: 12, aggregate: repeats, horizontal: longLabels(cat1) },
        { form: 'box', score: repeats ? 10 : 4, horizontal: false },
        { form: 'bar-stacked', score: 5, horizontal: true },
      ];
    }
    case 'two-category': {
      const cells = (cat1?.distinct ?? 1) * (cat2?.distinct ?? 1);
      const crowded = cells > 40;
      return [
        { form: 'bar-grouped', score: crowded ? 7 : 11, aggregate: true },
        { form: 'bar-stacked', score: 9, aggregate: true },
        { form: 'heatmap', score: crowded ? 12 : 7, aggregate: true },
      ];
    }
    case 'distribution':
      return [
        { form: 'histogram', score: 12 },
        { form: 'box', score: 8 },
      ];
    case 'unknown':
      return [];
  }
}

const EMPHASIS_BOOST = 3;

/**
 * Rank chart forms for a table + ladder answers. Returns the top 3,
 * highest first. Deterministic; ties broken by base order.
 */
export function recommend(table: InferredTable, choice: RoleChoice = {}): Recommendation[] {
  const roles = resolveRoles(table, choice);
  const candidates = shapeCandidates(table, roles);
  const emphasis = choice.emphasis ?? null;

  const scored = candidates.map((c, i) => {
    const boost = emphasis && FORM_FAMILY[c.form] === emphasis ? EMPHASIS_BOOST : 0;
    return { ...c, score: c.score + boost, order: i };
  });

  return scored
    .slice()
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 3)
    .map((c) => ({
      form: c.form,
      name: FORM_NAMES[c.form],
      why: whyText(c.form, table, roles, c.aggregate ?? false),
      score: c.score,
      roles,
      aggregate: c.aggregate ?? false,
      horizontal: c.horizontal ?? false,
    }));
}

/**
 * What the picker should render for a table: either a ranked figure
 * set, or an honest explanation that no single chart fits.
 *
 * `shape` is always present — the UI shows the design shape ("1
 * outcome × 3 factors") above the figures either way, because that
 * readback is what lets a user catch a misdetected column before they
 * trust the chart.
 */
export interface FigureAdvice {
  shape: DesignShape;
  /** Ranked forms. Empty when no single chart fits. */
  recommendations: Recommendation[];
  /**
   * Present when the design shape needs more than one figure, or no
   * figure at all. Shown verbatim — it is the "here is why".
   */
  note: string | null;
  /** Outcome columns to render as separate panels (small multiples). */
  panels: string[];
}

/**
 * The deterministic entry point the ladder should call.
 *
 * Design shape decides the TREATMENT (one chart, panels, facets, a
 * table, or nothing honest); the existing ranking then decides the
 * FORM within that treatment. Both halves are hardcoded lookups — no
 * model is consulted at any point.
 */
export function recommendFigures(table: InferredTable, choice: RoleChoice = {}): FigureAdvice {
  const shape = detectDesignShape(table);

  // Honest failure: say why, rank nothing. Forcing a chart here would
  // mean silently dropping most of the user's columns.
  if (isUnchartable(shape)) {
    return { shape, recommendations: [], note: shape.rationale, panels: [] };
  }

  const recommendations = recommend(table, choice);

  // A treatment beyond a single chart still ranks forms — the form is
  // what goes INSIDE each panel — but carries the rationale so the
  // user knows one figure is not the whole story.
  const needsNote = shape.treatment !== 'single-chart';

  return {
    shape,
    recommendations,
    note: needsNote ? shape.rationale : null,
    panels: shape.treatment === 'small-multiples' ? shape.dvNames : [],
  };
}

/**
 * True when the ladder should ask the emphasis question: the top two
 * forms are close AND make different rhetorical claims. A single
 * candidate or a runaway winner skips the question.
 */
export function needsEmphasisQuestion(table: InferredTable, choice: RoleChoice = {}): boolean {
  const recs = recommend(table, { ...choice, emphasis: null });
  if (recs.length < 2) return false;
  const [first, second] = recs;
  if (!first || !second) return false;
  if (FORM_FAMILY[first.form] === FORM_FAMILY[second.form]) return false;
  return first.score - second.score < 3;
}

// ────────────────────────────────────────────────────────────────────
// Methods-voice "why" lines. Perceptual justifications, not marketing.
// ────────────────────────────────────────────────────────────────────

function whyText(
  form: ChartForm,
  table: InferredTable,
  roles: ResolvedRoles,
  aggregate: boolean,
): string {
  const k = roles.cat1?.distinct ?? 0;
  switch (form) {
    case 'bar':
      return `One categorical variable (${k} levels) against one continuous measure — a bar chart maps magnitude to length, which is read more accurately than area or angle.`;
    case 'bar-grouped':
      return 'One measure across two categorical factors — grouping keeps the primary comparison adjacent within each cluster.';
    case 'bar-stacked':
      return 'Parts of a whole — stacked segments preserve the part-to-whole reading while keeping every share on a common scale.';
    case 'bar-diverging':
      return 'An ordered agreement scale — a diverging stack anchors the neutral point so agreement and disagreement read in opposite directions.';
    case 'line':
      return roles.cat1
        ? `An ordered axis with one measure per group — lines encode change as slope, and hue separates the ${k} series.`
        : 'An ordered axis with one continuous measure — a line encodes change between adjacent points as slope, the fastest-read cue for trend.';
    case 'area':
      return 'A single ordered series — filling under the line adds visual weight to cumulative magnitude without adding a second encoding.';
    case 'scatter':
      return `Two continuous measures per observation (n = ${table.rowCount}) — position on both axes shows the joint distribution and any association directly.`;
    case 'histogram':
      return `A single continuous measure (n = ${table.rowCount}) — binning shows the full distribution rather than a single summary statistic.`;
    case 'box':
      return aggregate || roles.cat1
        ? 'Repeated observations per group — boxes show median and spread, which a bar of means would hide.'
        : 'A compact distribution summary — median, quartiles, and outliers in one mark.';
    case 'heatmap':
      return 'A magnitude across two factors — a matrix of shaded cells stays legible where dozens of bars or lines would not.';
    case 'dumbbell':
      return 'Paired before/after values per item — a dumbbell shows each item’s change as a distance along a common scale, more accurate than paired bars.';
  }
}
