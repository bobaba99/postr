/**
 * Variable-pattern recognition — the layer between column inference
 * and the recommender.
 *
 * `inferColumns` says what TYPE each column is. This module says what
 * ROLE each column plays in the study design: which columns are
 * dependent variables (the things measured) and which are independent
 * variables (the things varied or recorded alongside). The pair
 * (dvCount, ivCount) plus a handful of qualifiers is the "design
 * shape", and the design shape maps to a recommended treatment
 * through a DETERMINISTIC table — no LLM, no network call, ever.
 *
 * Why this is not just `resolveRoles`: `resolveRoles` picks the
 * single measure and up to two groupings the spec builder needs, and
 * silently ignores everything else. That is correct for building one
 * chart and wrong for advising the user. A table with 5 DVs and 20
 * IVs is not "a bar chart of the first DV by the first IV" — it is a
 * table that no single chart honestly summarises, and saying so is
 * more useful than rendering a chart that quietly drops 23 columns.
 *
 * The honest-failure case is a first-class outcome here, not an
 * error: `treatment: 'no-single-chart'` carries a reason the UI shows
 * verbatim.
 */
import type { InferredColumn, InferredTable } from './inferColumns';

/** Study-design role of a single column. */
export type VariableRole =
  | 'dependent'
  | 'independent'
  | 'temporal'
  | 'identifier'
  | 'constant';

/** Statistical type, finer-grained than ColumnKind. */
export type VariableType = 'continuous' | 'categorical' | 'ordinal' | 'temporal' | 'identifier';

export interface ClassifiedColumn {
  name: string;
  type: VariableType;
  role: VariableRole;
  /** Distinct non-null values. */
  levels: number;
  column: InferredColumn;
}

/**
 * How the figure set should be shaped for this design. Not a chart
 * form — a *treatment*, one level up.
 */
export type Treatment =
  | 'single-chart'
  | 'small-multiples'
  | 'faceted'
  | 'summary-table'
  | 'no-single-chart'
  | 'nothing-to-plot';

export interface DesignShape {
  columns: ClassifiedColumn[];
  /** Dependent variables — the measured outcomes. */
  dvCount: number;
  /** Independent variables — grouping factors, including temporal. */
  ivCount: number;
  /** Names, in table order, for captions and UI copy. */
  dvNames: string[];
  ivNames: string[];
  /** True when at least one IV is a time/ordered axis. */
  hasTemporal: boolean;
  /** Product of IV levels — the cell count a full crossing implies. */
  cells: number;
  treatment: Treatment;
  /** Terse, plain-language label, e.g. "1 outcome x 3 factors". */
  label: string;
  /**
   * Methods-voice explanation of the treatment. Always present; for
   * 'no-single-chart' it is the honest "here is why" the plan asks
   * for.
   */
  rationale: string;
}

// ────────────────────────────────────────────────────────────────────
// Thresholds. Every one is a hardcoded constant, deliberately — the
// governing principle is deterministic pattern matching, so the
// numbers live here where they can be read and argued with.
// ────────────────────────────────────────────────────────────────────

/** Above this many distinct values, a text column is an ID, not a factor. */
const MAX_FACTOR_LEVELS = 30;

/**
 * Above this many distinct values, an integer column is a measurement
 * rather than a numerically coded factor. Far tighter than
 * MAX_FACTOR_LEVELS because numbers carry no label to vouch for them:
 * "1, 2" is almost certainly control/treatment, but "1 … 25" is more
 * plausibly a count than a 25-arm design.
 */
const MAX_NUMERIC_FACTOR_LEVELS = 10;

/**
 * An integer column also has to REPEAT its levels before it reads as a
 * factor. At most this share of the filled cells may be distinct — a
 * column where every row is its own value is a measurement, however
 * few rows there are.
 */
const NUMERIC_FACTOR_REPETITION = 0.5;

/** A column whose values are nearly all distinct is an identifier. */
const IDENTIFIER_UNIQUENESS = 0.9;

/** More IVs than this and no single chart can carry them. */
const MAX_IVS_FOR_ONE_CHART = 2;

/** More IVs than this and even faceting stops being readable. */
const MAX_IVS_FOR_FACETS = 4;

/** More DVs than this and small multiples beat one chart. */
const MAX_DVS_FOR_ONE_CHART = 1;

/** Beyond this many DVs, per-DV panels stop fitting on a poster. */
const MAX_DVS_FOR_SMALL_MULTIPLES = 6;

/** Crossed IV levels beyond this make a single chart unreadable. */
const MAX_CELLS_FOR_ONE_CHART = 40;

const ID_NAME =
  /^(id|ids|uid|uuid|guid|key|code|record|row|index|no|num|number|participant|subject|patient|case|sample|specimen|respondent|student|name|email)\b/i;

/**
 * Names that read as an outcome even when the column could pass for a
 * factor. Deliberately narrow: a false positive here mislabels a
 * grouping column as an outcome.
 */
const OUTCOME_NAME =
  /\b(score|scores|mean|means|rating|ratings|accuracy|latency|rt|reaction|response ?time|duration|count|counts|n|total|value|values|level|index|rate|percent|percentage|share|proportion|severity|intensity|change|delta|diff|difference|improvement|gain|loss|error|errors|time|weight|height|bmi|age|dose|concentration|density|yield|temperature|pressure|volume|amplitude)\b/i;

/** Names that read as an ordered/time axis with no values to check. */
const TEMPORAL_NAME =
  /^(year|month|week|day|date|time|timepoint|session|visit|trial|wave|phase|period|block|round)s?\b/i;

// ────────────────────────────────────────────────────────────────────
// Column classification
// ────────────────────────────────────────────────────────────────────

function nonNullCount(col: InferredColumn): number {
  return col.values.filter((v) => v !== null).length;
}

/**
 * Type a column from its name alone. Only reachable when the column
 * has no values — a header-only paste or a partial extraction. The
 * order matters: identifiers first (so "Participant ID" never becomes
 * an outcome), then time axes, then outcome-sounding names, and
 * finally categorical as the safe default.
 */
function typeFromName(name: string): VariableType {
  if (ID_NAME.test(name)) return 'identifier';
  if (TEMPORAL_NAME.test(name)) return 'temporal';
  if (OUTCOME_NAME.test(name)) return 'continuous';
  return 'categorical';
}

/**
 * True when an integer column is a numerically coded grouping factor
 * rather than a measurement. This is the standard SPSS/Stata export
 * idiom — 1 = control, 2 = treatment — and without this check every
 * such factor is counted as an outcome, so a 2×3 factorial design
 * reads back as "3 outcomes × 0 factors".
 *
 * Three conditions, all required:
 *  - every value is a whole number (5.1 is a measurement, not a code);
 *  - few enough distinct levels to be a factor;
 *  - the levels actually repeat, so a short column of distinct
 *    integers stays a measurement.
 *
 * An outcome-sounding NAME overrides all of it: a 1–5 "Rating" or a
 * 0–10 "Score" is a measured outcome that happens to be integer, and
 * the name is stronger evidence than the value shape.
 */
function isNumericFactor(col: InferredColumn, filled: number): boolean {
  if (OUTCOME_NAME.test(col.name)) return false;
  if (col.distinct > MAX_NUMERIC_FACTOR_LEVELS) return false;
  if (filled === 0 || col.distinct / filled > NUMERIC_FACTOR_REPETITION) return false;
  return col.values.every((v) => v === null || (typeof v === 'number' && Number.isInteger(v)));
}

/**
 * Classify one column into a statistical type. Ordering matters:
 * identifiers are caught before anything else so a "Participant ID"
 * integer column never becomes an outcome.
 */
function classifyType(col: InferredColumn): VariableType {
  if (col.kind === 'date') return 'temporal';

  const filled = nonNullCount(col);

  // No values at all — a header-only paste or a partial extraction.
  // `inferTable` defaults an empty column to 'category', which would
  // make every column a factor and leave nothing to measure. The
  // NAME is the only evidence available, so use it.
  if (filled === 0) return typeFromName(col.name);

  const nearlyUnique = filled > 0 && col.distinct / filled >= IDENTIFIER_UNIQUENESS;

  if (ID_NAME.test(col.name) && (nearlyUnique || col.kind === 'category')) {
    return 'identifier';
  }

  if (col.kind === 'number') {
    // Year-like / explicitly time-named integers are the trend axis.
    if (col.ordered) return 'temporal';
    // Integer group codes (1 = control, 2 = treatment) are factors,
    // not the thing measured.
    if (isNumericFactor(col, filled)) return 'categorical';
    return 'continuous';
  }

  // Categorical text. Too many distinct values to be a factor means
  // it labels rows rather than grouping them.
  if (nearlyUnique && col.distinct > MAX_FACTOR_LEVELS) return 'identifier';
  if (col.distinct > MAX_FACTOR_LEVELS) return 'identifier';
  return 'categorical';
}

/**
 * Assign the design role from the statistical type. Continuous
 * columns are dependent variables by default — in the research tables
 * this tool sees, the numbers are what was measured. The exception is
 * an ordered/temporal column, which is the axis they were measured
 * against.
 */
function classifyRole(type: VariableType, col: InferredColumn): VariableRole {
  if (type === 'identifier') return 'identifier';
  if (type === 'temporal') return 'temporal';
  // A column with exactly one repeated value carries no information.
  // An EMPTY column is different: it has no values yet, but it is
  // still a declared variable, so it keeps its role.
  if (col.distinct <= 1 && nonNullCount(col) > 0) return 'constant';
  if (type === 'continuous') return 'dependent';
  return 'independent';
}

/**
 * Classify every column. Exported because the ladder shows the
 * classification back to the user before any chart exists.
 */
export function classifyColumns(table: InferredTable): ClassifiedColumn[] {
  return table.columns.map((column) => {
    const type = classifyType(column);
    return {
      name: column.name,
      type,
      role: classifyRole(type, column),
      levels: column.distinct,
      column,
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// The deterministic design-shape → treatment table
// ────────────────────────────────────────────────────────────────────

interface TreatmentVerdict {
  treatment: Treatment;
  rationale: string;
}

/**
 * The ruleset. Read top to bottom; the first matching row wins. Each
 * row is a plain predicate over the counts — no scoring, no model,
 * no ambiguity about why a given table got a given answer.
 */
function decideTreatment(
  dvCount: number,
  ivCount: number,
  cells: number,
  hasTemporal: boolean,
): TreatmentVerdict {
  // Row 0 — nothing measured.
  if (dvCount === 0) {
    return ivCount === 0
      ? {
          treatment: 'nothing-to-plot',
          rationale:
            'No columns of numbers were found, so there is nothing to plot. Add a column of measured values and try again.',
        }
      : {
          treatment: 'summary-table',
          rationale:
            'Every column is a label or a grouping factor, with no measured outcome. Counts of each combination belong in a table, not a chart.',
        };
  }

  // Row 1 — the common case: one outcome, at most two factors.
  if (dvCount <= MAX_DVS_FOR_ONE_CHART && ivCount <= MAX_IVS_FOR_ONE_CHART) {
    if (cells > MAX_CELLS_FOR_ONE_CHART) {
      return {
        treatment: 'faceted',
        rationale: `Crossing the factors gives ${cells} cells — too many for one set of bars or lines. Splitting into panels keeps each comparison legible.`,
      };
    }
    return {
      treatment: 'single-chart',
      rationale:
        ivCount === 0
          ? 'One measured outcome and no grouping factor — a single distribution figure carries the whole table.'
          : `One measured outcome against ${ivCount === 1 ? 'one factor' : 'two factors'} — a single figure carries this without dropping anything.`,
    };
  }

  // Row 2 — one outcome, three or four factors: facet the extras.
  if (dvCount <= MAX_DVS_FOR_ONE_CHART && ivCount <= MAX_IVS_FOR_FACETS) {
    return {
      treatment: 'faceted',
      rationale: `One outcome across ${ivCount} factors — two factors fit in a single figure, so the remaining ${ivCount - MAX_IVS_FOR_ONE_CHART} become panels rather than extra colours nobody can separate.`,
    };
  }

  // Row 3 — several outcomes, few factors: one panel per outcome.
  if (dvCount <= MAX_DVS_FOR_SMALL_MULTIPLES && ivCount <= MAX_IVS_FOR_ONE_CHART) {
    return {
      treatment: 'small-multiples',
      rationale: `${dvCount} outcomes share the same factor${ivCount === 1 ? '' : 's'}, but they are measured on different scales — one small panel per outcome compares them honestly, where a shared axis would not.`,
    };
  }

  // Row 4 — several outcomes AND several factors: still tractable if
  // both are small enough that a per-outcome facet grid fits.
  if (dvCount <= MAX_DVS_FOR_SMALL_MULTIPLES && ivCount <= MAX_IVS_FOR_FACETS) {
    return {
      treatment: 'small-multiples',
      rationale: `${dvCount} outcomes across ${ivCount} factors — one panel per outcome, with the two strongest factors inside each panel. Report the remaining factors in the text.`,
    };
  }

  // Row 5 — the honest failure. Wide data, many of both.
  return {
    treatment: 'no-single-chart',
    rationale: `${dvCount} outcomes across ${ivCount} factors is wider than any single figure can show honestly — a chart covering all of it would either drop most columns or overplot into noise. Pick the one or two outcomes your claim rests on and chart those${hasTemporal ? ', or plot the time course of a single outcome' : ''}; put the rest in a summary table.`,
  };
}

function shapeLabel(dvCount: number, ivCount: number): string {
  const dv = `${dvCount} outcome${dvCount === 1 ? '' : 's'}`;
  const iv = `${ivCount} factor${ivCount === 1 ? '' : 's'}`;
  return `${dv} × ${iv}`;
}

/**
 * Recognise the design shape of a parsed table. Pure and
 * deterministic: the same table always yields the same shape and the
 * same treatment.
 */
export function detectDesignShape(table: InferredTable): DesignShape {
  const columns = classifyColumns(table);

  const dvs = columns.filter((c) => c.role === 'dependent');
  const ivs = columns.filter((c) => c.role === 'independent' || c.role === 'temporal');
  const hasTemporal = columns.some((c) => c.role === 'temporal');

  // Crossed cell count. Temporal factors are counted by their level
  // count too — 12 weeks × 3 arms really is 36 cells to draw.
  const cells = ivs.reduce((product, c) => product * Math.max(1, c.levels), 1);

  const { treatment, rationale } = decideTreatment(dvs.length, ivs.length, cells, hasTemporal);

  return {
    columns,
    dvCount: dvs.length,
    ivCount: ivs.length,
    dvNames: dvs.map((c) => c.name),
    ivNames: ivs.map((c) => c.name),
    hasTemporal,
    cells,
    treatment,
    label: shapeLabel(dvs.length, ivs.length),
    rationale,
  };
}

/**
 * True when the honest answer is "no single chart fits". The ladder
 * shows the rationale instead of a ranked figure set.
 */
export function isUnchartable(shape: DesignShape): boolean {
  return shape.treatment === 'no-single-chart' || shape.treatment === 'nothing-to-plot';
}

/**
 * Outcome columns worth offering as separate panels, in table order.
 * Empty unless the treatment is small-multiples — the caller renders
 * one figure per name.
 */
export function smallMultipleMeasures(shape: DesignShape): string[] {
  return shape.treatment === 'small-multiples' ? shape.dvNames : [];
}

/**
 * Factors that a single figure cannot absorb and which therefore
 * become facets. Empty unless the treatment is faceted.
 */
export function facetFactors(shape: DesignShape): string[] {
  return shape.treatment === 'faceted' ? shape.ivNames.slice(MAX_IVS_FOR_ONE_CHART) : [];
}
