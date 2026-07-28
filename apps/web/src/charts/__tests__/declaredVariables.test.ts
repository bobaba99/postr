/**
 * Declared-variable entry — synthesis and, above all, EQUIVALENCE.
 *
 * The architectural promise of this feature is that declaring a design
 * and pasting a table of that design are two doors into one
 * recommender. The equivalence block below is the test that actually
 * holds that promise: if a declared design and a hand-written table of
 * the same shape ever rank differently, the mobile path has quietly
 * grown a second opinion and this suite fails.
 *
 * The synthesis tests exist mostly to protect that equivalence. Each
 * one pins a property of the generated values that inference depends
 * on — decimals on continuous columns, text levels on categorical
 * ones — and each is a real bug that broke equivalence while this was
 * being written, not a hypothetical.
 */
import { describe, expect, it } from 'vitest';
import { classifyColumns } from '../designShape';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';
import { recommend, recommendFigures } from '../recommend';
import {
  hasUsableOutcome,
  inferFromVariables,
  levelCount,
  tableFromVariables,
  type DeclaredVariable,
} from '../declaredVariables';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

/** Terse builder — the id is noise in every assertion below. */
function v(
  name: string,
  role: DeclaredVariable['role'],
  type: DeclaredVariable['type'],
  levels?: DeclaredVariable['levels'],
): DeclaredVariable {
  return { id: name, name, role, type, ...(levels ? { levels } : {}) };
}

describe('tableFromVariables — synthesis', () => {
  it('names columns after the declared variables', () => {
    const table = tableFromVariables([
      v('Reaction time (ms)', 'outcome', 'continuous'),
      v('Caffeine dose', 'factor', 'categorical', 'few'),
    ]);
    expect(table.header).toEqual(['Reaction time (ms)', 'Caffeine dose']);
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it('gives a categorical factor exactly the declared number of levels', () => {
    for (const [band, expected] of [
      ['two', 2],
      ['few', 4],
      ['many', 9],
    ] as const) {
      const table = inferFromVariables([
        v('Score', 'outcome', 'continuous'),
        v('Arm', 'factor', 'categorical', band),
      ]);
      const arm = table.columns.find((c) => c.name === 'Arm');
      expect(arm?.distinct).toBe(expected);
    }
  });

  it('reads a continuous outcome back as a number, not a group code', () => {
    // isNumericFactor reclassifies an all-integer column with few
    // repeating levels as a factor. A declared outcome that came back
    // as a factor would leave the table with nothing to measure.
    const table = inferFromVariables([
      v('Recall accuracy', 'outcome', 'continuous'),
      v('Condition', 'factor', 'categorical', 'two'),
    ]);
    const outcome = table.columns.find((c) => c.name === 'Recall accuracy');
    expect(outcome?.kind).toBe('number');
    expect(outcome?.ordered).toBe(false);

    const classified = classifyColumns(table);
    expect(classified.find((c) => c.name === 'Recall accuracy')?.role).toBe('dependent');
    expect(classified.find((c) => c.name === 'Condition')?.role).toBe('independent');
  });

  it('writes continuous values as non-integers, whatever the row plan', () => {
    // The guarantee behind the test above. isNumericFactor only spares
    // an INTEGER outcome when its distinct-value ratio clears 0.5, and
    // the row plan currently lands exactly on that boundary — so the
    // classification is one ROWS_PER_CELL tweak away from flipping.
    // A non-integer fails the whole-number check outright, so pin the
    // decimal itself rather than the downstream symptom.
    for (const band of ['two', 'few', 'many'] as const) {
      const table = tableFromVariables([
        v('Score', 'outcome', 'continuous'),
        v('Arm', 'factor', 'categorical', band),
      ]);
      for (const row of table.rows) {
        expect(Number.isInteger(Number(row[0]))).toBe(false);
      }
    }
  });

  it('reads a declared ordered factor back as a trend axis', () => {
    const table = inferFromVariables([
      v('Symptom severity', 'outcome', 'continuous'),
      v('Week', 'factor', 'ordered'),
    ]);
    const week = table.columns.find((c) => c.name === 'Week');
    expect(week?.ordered).toBe(true);
    expect(classifyColumns(table).find((c) => c.name === 'Week')?.role).toBe('temporal');
  });

  it('generates repeated observations per cell so spread forms stay available', () => {
    // One row per group would silently drop box plots from the
    // ranking, which a real table of the same design would offer.
    const table = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ]);
    const arm = table.columns.find((c) => c.name === 'Arm')!;
    expect(table.rowCount).toBeGreaterThan(arm.distinct);
  });

  it('crosses two factors so every combination appears', () => {
    const table = inferFromVariables([
      v('Anxiety', 'outcome', 'continuous'),
      v('Condition', 'factor', 'categorical', 'few'),
      v('Timepoint', 'factor', 'categorical', 'two'),
    ]);
    expect(table.columns.find((c) => c.name === 'Condition')?.distinct).toBe(4);
    expect(table.columns.find((c) => c.name === 'Timepoint')?.distinct).toBe(2);
  });

  it('is deterministic — the same declaration yields the same table', () => {
    const declaration = [
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ];
    expect(tableFromVariables(declaration)).toEqual(tableFromVariables(declaration));
  });

  it('falls back to a usable name for an unlabelled variable', () => {
    const table = inferFromVariables([
      v('', 'outcome', 'continuous'),
      v('', 'factor', 'categorical', 'few'),
    ]);
    // The fallback must not read as an outcome, or the unnamed FACTOR
    // would be reclassified as a second measured variable.
    const classified = classifyColumns(table);
    expect(classified.filter((c) => c.role === 'dependent')).toHaveLength(1);
    expect(classified.filter((c) => c.role === 'independent')).toHaveLength(1);
  });

  it('de-duplicates repeated names so column lookup stays unambiguous', () => {
    // resolveRoles finds columns BY NAME; two "Score" columns would
    // make the user's own measure choice ambiguous.
    const table = tableFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Score', 'outcome', 'continuous'),
    ]);
    expect(new Set(table.header).size).toBe(2);
  });

  it('caps synthesis so a wide declaration stays cheap', () => {
    const table = tableFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('A', 'factor', 'categorical', 'many'),
      v('B', 'factor', 'categorical', 'many'),
    ]);
    expect(table.rows.length).toBeLessThanOrEqual(240);
  });
});

describe('hasUsableOutcome', () => {
  it('requires a non-categorical outcome the recommender can measure', () => {
    expect(hasUsableOutcome([v('Score', 'outcome', 'continuous')])).toBe(true);
    expect(hasUsableOutcome([v('Week', 'outcome', 'ordered')])).toBe(true);
    expect(hasUsableOutcome([v('Arm', 'factor', 'categorical', 'few')])).toBe(false);
    expect(hasUsableOutcome([v('Colour', 'outcome', 'categorical', 'few')])).toBe(false);
    expect(hasUsableOutcome([])).toBe(false);
  });
});

describe('levelCount', () => {
  it('maps each band to a representative count', () => {
    expect(levelCount(v('a', 'factor', 'categorical', 'two'))).toBe(2);
    expect(levelCount(v('a', 'factor', 'categorical', 'few'))).toBe(4);
    expect(levelCount(v('a', 'factor', 'categorical', 'many'))).toBe(9);
    // An unspecified band is the middle one, never a crash.
    expect(levelCount(v('a', 'factor', 'categorical'))).toBe(4);
  });
});

// ────────────────────────────────────────────────────────────────────
// The equivalence suite — the reason this feature is built this way.
//
// Each case pairs a DECLARED design with a hand-written table of the
// same design. Both go through the same recommender; the top form must
// match. A failure here means the mobile path and the paste path have
// diverged, which is the one outcome the architecture exists to
// prevent.
// ────────────────────────────────────────────────────────────────────

/** A pasted table: continuous outcome across `levels` text groups. */
function pastedGroups(levels: number, perGroup: number): RawTable {
  const rows: RawTable['rows'] = [];
  for (let g = 0; g < levels; g++) {
    for (let i = 0; i < perGroup; i++) {
      rows.push([`Group ${String.fromCharCode(65 + g)}`, (50 + g * 2 + i * 0.7).toFixed(1)]);
    }
  }
  return raw(['Arm', 'Score'], rows);
}

describe('equivalence — declared design vs pasted table', () => {
  it('matches for 1 continuous outcome by 1 categorical factor (3–5 levels)', () => {
    const declared = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ]);
    const pasted = inferTable(pastedGroups(4, 6));

    expect(recommend(declared)[0]?.form).toBe(recommend(pasted)[0]?.form);
    // Not merely equal — equal to the form this design should get.
    expect(recommend(declared)[0]?.form).toBe('bar');
  });

  it('matches for 1 continuous outcome by a 2-level factor', () => {
    const declared = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'two'),
    ]);
    const pasted = inferTable(pastedGroups(2, 6));
    expect(recommend(declared)[0]?.form).toBe(recommend(pasted)[0]?.form);
  });

  it('matches for 1 continuous outcome over an ordered axis', () => {
    const declared = inferFromVariables([
      v('Symptom severity', 'outcome', 'continuous'),
      v('Week', 'factor', 'ordered'),
    ]);
    const rows: RawTable['rows'] = [];
    for (let week = 1; week <= 6; week++) {
      for (let i = 0; i < 6; i++) rows.push([String(week), (50 - week * 1.5 + i * 0.4).toFixed(1)]);
    }
    const pasted = inferTable(raw(['Week', 'Symptom severity'], rows));

    expect(recommend(declared)[0]?.form).toBe(recommend(pasted)[0]?.form);
    expect(recommend(declared)[0]?.form).toBe('line');
  });

  it('matches for 1 continuous outcome across two categorical factors', () => {
    const declared = inferFromVariables([
      v('Anxiety', 'outcome', 'continuous'),
      v('Condition', 'factor', 'categorical', 'few'),
      v('Timepoint', 'factor', 'categorical', 'two'),
    ]);
    const rows: RawTable['rows'] = [];
    for (let c = 0; c < 4; c++) {
      for (const tp of ['Baseline', 'Week 6']) {
        for (let i = 0; i < 6; i++) {
          rows.push([`Group ${String.fromCharCode(65 + c)}`, tp, (50 + c + i * 0.5).toFixed(1)]);
        }
      }
    }
    const pasted = inferTable(raw(['Condition', 'Timepoint', 'Anxiety'], rows));
    expect(recommend(declared)[0]?.form).toBe(recommend(pasted)[0]?.form);
  });

  it('matches for a single continuous outcome with no factor', () => {
    const declared = inferFromVariables([v('Response time', 'outcome', 'continuous')]);
    const rows: RawTable['rows'] = [];
    for (let i = 0; i < 36; i++) rows.push([(50 + (i % 7) * 1.5).toFixed(1)]);
    const pasted = inferTable(raw(['Response time'], rows));

    expect(recommend(declared)[0]?.form).toBe(recommend(pasted)[0]?.form);
    expect(recommend(declared)[0]?.form).toBe('histogram');
  });

  it('matches for two continuous outcomes (relationship)', () => {
    const declared = inferFromVariables([
      v('Sleep duration', 'outcome', 'continuous'),
      v('Recall accuracy', 'outcome', 'continuous'),
    ]);
    expect(recommend(declared)[0]?.form).toBe('scatter');
  });

  it('agrees on the resolved design shape, not just the top form', () => {
    // The shape readback is what the user checks before trusting the
    // chart, so it has to match too — a declared design that ranks the
    // same form for a different stated reason is still a divergence.
    const declared = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ]);
    const pasted = inferTable(pastedGroups(4, 6));

    const a = recommendFigures(declared).shape;
    const b = recommendFigures(pasted).shape;
    expect(a.label).toBe(b.label);
    expect(a.treatment).toBe(b.treatment);
  });

  it('agrees on the full ranked list, not only the winner', () => {
    const declared = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ]);
    const pasted = inferTable(pastedGroups(4, 6));
    expect(recommend(declared).map((r) => r.form)).toEqual(recommend(pasted).map((r) => r.form));
  });

  it('honours an emphasis answer identically on both paths', () => {
    const declared = inferFromVariables([
      v('Score', 'outcome', 'continuous'),
      v('Arm', 'factor', 'categorical', 'few'),
    ]);
    const pasted = inferTable(pastedGroups(4, 6));
    const choice = { emphasis: 'spread' as const };
    expect(recommend(declared, choice)[0]?.form).toBe(recommend(pasted, choice)[0]?.form);
  });

  it('produces a rankable figure set for every single-factor declaration', () => {
    // A declaration the user can express must never dead-end in an
    // empty result — that is the mobile path failing silently.
    for (const band of ['two', 'few', 'many'] as const) {
      for (const type of ['categorical', 'ordered'] as const) {
        const table = inferFromVariables([
          v('Score', 'outcome', 'continuous'),
          v(type === 'ordered' ? 'Week' : 'Arm', 'factor', type, band),
        ]);
        const advice = recommendFigures(table);
        expect(advice.recommendations.length).toBeGreaterThan(0);
      }
    }
  });
});
