/**
 * Declared-variable entry — the mobile path into the plot picker.
 *
 * Pasting a table on a phone is miserable, but a researcher who knows
 * their design ("reaction time by three caffeine doses") already holds
 * everything the recommender needs. This module turns that spoken
 * description into a small representative `RawTable`.
 *
 * The load-bearing decision: this file synthesises DATA, not a
 * ranking. It deliberately contains no chart-selection logic at all.
 * The declared table goes through the same `inferTable` → `recommend`
 * pipeline as a pasted one, so a user who declares "1 continuous
 * outcome by 1 categorical factor with 3 levels" and a user who pastes
 * a matching table converge on identical rankings by construction
 * rather than by two heuristics that have to be kept in sync.
 *
 * That convergence constrains the generated values more than it might
 * appear. Inference has to read the synthesised column back as the
 * type the user declared, so the generators here work AGAINST the
 * inference heuristics in `inferColumns`/`designShape`:
 *   - continuous values carry a decimal and vary per row, or
 *     `isNumericFactor` would reclassify them as group codes;
 *   - categorical levels are text, never integer codes;
 *   - ordered axes are named so `isYearLike` recognises them.
 *
 * Values are bogus and unremarkable by policy (feedback_sample_names):
 * nothing here should read as a finding, and no real person or
 * institution ever appears.
 */
import type { InferredTable } from './inferColumns';
import { inferTable } from './inferColumns';
import type { RawTable } from './parseData';

/** Which side of the design a declared variable sits on. */
export type VariableRoleChoice = 'outcome' | 'factor';

/**
 * Statistical type, in the three buckets a user can answer without
 * reading a stats textbook. Deliberately coarser than
 * `designShape.VariableType` — this is what someone can say about
 * their own variable on a phone, not a full taxonomy.
 */
export type VariableTypeChoice = 'continuous' | 'categorical' | 'ordered';

/**
 * Level-count bands for a categorical variable. Bands rather than a
 * number field: the recommender's thresholds are coarse (2 levels vs
 * 3–5 vs "many" is the whole of what it reacts to), and a band is one
 * tap where a number is a keyboard on a phone.
 */
export type LevelBand = 'two' | 'few' | 'many';

export interface DeclaredVariable {
  /** Stable key for React lists and immutable updates. */
  id: string;
  /** User's own label. Blank is allowed; a fallback name is used. */
  name: string;
  role: VariableRoleChoice;
  type: VariableTypeChoice;
  /** Only meaningful when `type` is 'categorical'. */
  levels?: LevelBand;
}

/**
 * Representative level counts per band. The midpoint of 3–5 is used
 * for 'few'; 'many' sits just above the recommender's 8-series
 * crowding threshold so the declared path surfaces the same
 * many-series demotion a real wide table would.
 */
const LEVELS_FOR_BAND: Record<LevelBand, number> = {
  two: 2,
  few: 4,
  many: 9,
};

/**
 * Observations per cell. Enough that repeated measurements exist —
 * `hasRepeats` needs rowCount > distinct before box plots become
 * candidates, and a design with one row per group would silently lose
 * the spread options a real dataset of the same shape would offer.
 */
const ROWS_PER_CELL = 6;

/** Total synthesised rows are capped so a wide declaration stays cheap. */
const MAX_ROWS = 240;

/** Points on a declared ordered axis (weeks, sessions, timepoints). */
const ORDERED_POINTS = 6;

/** Bogus category levels, per feedback_sample_names. Never real. */
const BOGUS_LEVELS = [
  'Group A',
  'Group B',
  'Group C',
  'Group D',
  'Group E',
  'Group F',
  'Group G',
  'Group H',
  'Group I',
];

/**
 * Fallback names. A declared variable with no label still has to be
 * chartable, and the name is what the axis will read.
 *
 * "Measure"/"Group" rather than anything outcome-flavoured: these flow
 * through `designShape`'s name-based heuristics, and a fallback that
 * matched OUTCOME_NAME would let an unnamed FACTOR be reclassified as
 * an outcome.
 */
const FALLBACK_OUTCOME = 'Measure';
const FALLBACK_FACTOR = 'Group';
const FALLBACK_ORDERED = 'Timepoint';

/**
 * mulberry32 — same deterministic PRNG the sample generators use, so
 * a given declaration always yields the same table and previews do not
 * churn between renders.
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

function seedFromNames(names: string[]): number {
  let h = 2166136261;
  for (const ch of names.join(' ')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Distinct levels a declared categorical variable should generate. */
export function levelCount(variable: DeclaredVariable): number {
  return LEVELS_FOR_BAND[variable.levels ?? 'few'];
}

/**
 * Resolve the column header for a declared variable. Names are
 * de-duplicated because `resolveRoles` looks columns up BY NAME — two
 * columns called "Score" would make the user's own measure choice
 * ambiguous.
 */
function resolveNames(variables: readonly DeclaredVariable[]): string[] {
  const used = new Set<string>();
  return variables.map((variable) => {
    const fallback =
      variable.role === 'outcome'
        ? FALLBACK_OUTCOME
        : variable.type === 'ordered'
          ? FALLBACK_ORDERED
          : FALLBACK_FACTOR;
    const base = variable.name.trim() || fallback;
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base} ${n}`;
      n += 1;
    }
    used.add(name);
    return name;
  });
}

/**
 * A continuous value, always written with a decimal.
 *
 * The decimal is not cosmetic. `isNumericFactor` reclassifies an
 * integer column as a grouping factor when its levels are few enough
 * AND repeat often enough, and a declared outcome that came back as a
 * factor would leave the design with nothing to measure. Integers here
 * happen to escape that test today only because the row plan puts the
 * distinct ratio exactly at the 0.5 boundary — far too tight to rely
 * on, since any change to ROWS_PER_CELL would tip it. A non-integer
 * value fails `isNumericFactor`'s whole-number check outright, which
 * is a guarantee rather than a coincidence.
 */
function continuousValue(rand: () => number, offset: number): string {
  const value = 50 + offset + (rand() - 0.5) * 12;
  // toFixed(1) alone is not enough: it happily emits "53.0", which
  // parses back to a whole number and satisfies isNumericFactor. Nudge
  // any value that rounds flat onto a non-zero tenth.
  const text = value.toFixed(1);
  return text.endsWith('.0') ? `${text.slice(0, -1)}5` : text;
}

/**
 * Build the level pool for a categorical variable, preferring the
 * user's own label to seed a readable prefix.
 */
function levelsFor(variable: DeclaredVariable): string[] {
  return BOGUS_LEVELS.slice(0, levelCount(variable));
}

/**
 * How many rows the crossing of the declared factors needs. Every
 * combination of levels appears `ROWS_PER_CELL` times so bars have
 * something to average and boxes have something to summarise.
 */
function planRowCount(variables: readonly DeclaredVariable[]): number {
  const cells = variables.reduce((product, variable) => {
    if (variable.role !== 'factor') return product;
    const levels = variable.type === 'ordered' ? ORDERED_POINTS : levelCount(variable);
    return product * levels;
  }, 1);
  return Math.min(MAX_ROWS, Math.max(ROWS_PER_CELL, cells * ROWS_PER_CELL));
}

/**
 * Synthesise a representative table from declared variables.
 *
 * Returns a `RawTable` of strings — deliberately the same currency the
 * paste and upload paths produce, so the caller runs it through the
 * identical `inferTable` and nothing downstream can distinguish a
 * declared design from a typed one.
 */
export function tableFromVariables(variables: readonly DeclaredVariable[]): RawTable {
  const names = resolveNames(variables);
  const rand = mulberry32(seedFromNames(names));
  const rowCount = planRowCount(variables);

  // Level pools resolved once so every row draws from the same set —
  // a pool rebuilt per row would inflate the distinct count.
  const pools = variables.map((variable) =>
    variable.role === 'factor' && variable.type === 'categorical' ? levelsFor(variable) : null,
  );

  // Each factor cycles at a different stride so the crossing is
  // balanced: the first factor changes fastest, later ones slower.
  const strides: number[] = [];
  let stride = 1;
  for (const variable of variables) {
    strides.push(stride);
    if (variable.role === 'factor') {
      const levels = variable.type === 'ordered' ? ORDERED_POINTS : levelCount(variable);
      stride *= levels;
    }
  }

  const rows: RawTable['rows'] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(
      variables.map((variable, v) => {
        if (variable.role === 'outcome') {
          if (variable.type === 'categorical') {
            const pool = levelsFor(variable);
            return pool[i % pool.length] ?? BOGUS_LEVELS[0]!;
          }
          // A small per-row offset keeps consecutive values from
          // repeating, which would depress the distinct count.
          return continuousValue(rand, (i % 5) * 1.5);
        }

        const step = strides[v] ?? 1;
        if (variable.type === 'ordered') {
          return String((Math.floor(i / step) % ORDERED_POINTS) + 1);
        }
        const pool = pools[v] ?? BOGUS_LEVELS;
        return pool[Math.floor(i / step) % pool.length] ?? BOGUS_LEVELS[0]!;
      }),
    );
  }

  return { header: names, rows };
}

/** The declared table, typed by the same inference the paste path uses. */
export function inferFromVariables(variables: readonly DeclaredVariable[]): InferredTable {
  return inferTable(tableFromVariables(variables));
}

// ────────────────────────────────────────────────────────────────────
// Validity — what counts as a declaration the recommender can use
// ────────────────────────────────────────────────────────────────────

/**
 * The recommender needs a continuous outcome: `measureCandidates`
 * filters for numeric columns, and with none, `resolveRoles` returns
 * the empty shape and ranks nothing. Rather than render an empty
 * result and let the user wonder, the UI gates on this.
 */
export function hasUsableOutcome(variables: readonly DeclaredVariable[]): boolean {
  return variables.some((v) => v.role === 'outcome' && v.type !== 'categorical');
}

/**
 * Factors beyond this many cannot appear in a single figure —
 * `designShape` starts faceting at 3 and gives up past 4. The entry
 * form caps the list rather than accepting a declaration it would then
 * have to refuse.
 */
export const MAX_DECLARED_FACTORS = 2;

/** Outcomes beyond this switch the treatment to small multiples. */
export const MAX_DECLARED_OUTCOMES = 2;

/** Total declared variables the form accepts. */
export const MAX_DECLARED_VARIABLES = MAX_DECLARED_FACTORS + MAX_DECLARED_OUTCOMES;
