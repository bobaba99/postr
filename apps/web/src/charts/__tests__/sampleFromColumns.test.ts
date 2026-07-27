/**
 * Generated sample plots from detected columns (B2).
 *
 * When the user has columns but no usable values, we generate the
 * plot from values derived from those columns — and label it as
 * sample data everywhere it can be seen. The labelling assertions
 * here are the important ones: a sample a user mistakes for their
 * results is worse than no sample at all.
 */
import { describe, expect, it } from 'vitest';
import { buildChartSpec, captionFor } from '../buildSpec';
import { inferTable } from '../inferColumns';
import { planLadder } from '../ladder/steps';
import type { RawTable } from '../parseData';
import { recommend } from '../recommend';
import {
  makeFromColumns,
  needsSyntheticValues,
  SAMPLE_CAPTION_PREFIX,
  SAMPLE_DATA_LABEL,
} from '../sampleData';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

/** Columns detected, values missing — the trigger case. */
function headerOnly(header: string[]): RawTable {
  return raw(header, []);
}

describe('needsSyntheticValues — when to generate', () => {
  it('is true for a header-only table', () => {
    expect(needsSyntheticValues(inferTable(headerOnly(['Condition', 'Score'])))).toBe(true);
  });

  it('is true when every numeric column came back empty', () => {
    const table = inferTable(
      raw(
        ['Condition', 'Score'],
        [
          ['Control', ''],
          ['Drug', ''],
        ],
      ),
    );
    expect(needsSyntheticValues(table)).toBe(true);
  });

  it('is false when the user supplied real values', () => {
    const table = inferTable(
      raw(
        ['Condition', 'Score'],
        [
          ['Control', '4.2'],
          ['Drug', '5.6'],
        ],
      ),
    );
    expect(needsSyntheticValues(table)).toBe(false);
  });

  it('is false for a table with no columns at all', () => {
    expect(needsSyntheticValues(inferTable(raw([], [])))).toBe(false);
  });
});

describe('makeFromColumns — values generated for the detected columns', () => {
  it('reproduces every detected column by name, in order', () => {
    const detected = headerOnly(['Condition', 'Timepoint', 'Mean anxiety score']);
    const sample = makeFromColumns(inferTable(detected));
    expect(sample.table.header).toEqual(['Condition', 'Timepoint', 'Mean anxiety score']);
    expect(sample.columnNames).toEqual(['Condition', 'Timepoint', 'Mean anxiety score']);
  });

  it('flags itself as synthetic', () => {
    const sample = makeFromColumns(inferTable(headerOnly(['Group', 'Score'])));
    expect(sample.synthetic).toBe(true);
    expect(sample.key).toBe('from-columns');
  });

  it('produces rows the recommender can actually chart', () => {
    const sample = makeFromColumns(inferTable(headerOnly(['Condition', 'Reaction time (ms)'])));
    const table = inferTable(sample.table);
    const recs = recommend(table);
    expect(recs.length).toBeGreaterThan(0);
    expect(buildChartSpec(table, recs[0]!)).not.toBeNull();
  });

  it('is deterministic — same columns always yield the same values', () => {
    const detected = inferTable(headerOnly(['Condition', 'Score']));
    expect(makeFromColumns(detected).table).toEqual(makeFromColumns(detected).table);
  });

  it('gives different columns different values (the seed tracks the names)', () => {
    const a = makeFromColumns(inferTable(headerOnly(['Condition', 'Score'])));
    const b = makeFromColumns(inferTable(headerOnly(['Arm', 'Latency'])));
    expect(a.table.rows).not.toEqual(b.table.rows);
  });

  it('uses bogus labels only — never a real person or institution', () => {
    const sample = makeFromColumns(inferTable(headerOnly(['Site', 'Name', 'Score'])));
    const text = sample.table.rows.flat().join(' ');
    // Every generated label comes from the sanctioned bogus set.
    for (const cell of sample.table.rows.map((r) => String(r[0]))) {
      expect(cell).toMatch(/Acme|Sample Research Institute/);
    }
    for (const cell of sample.table.rows.map((r) => String(r[1]))) {
      expect(cell).toMatch(/John Smith|Jane Doe/);
    }
    // Word-bounded: an unanchored /MIT/i matches the "Smit" in
    // "John Smith", which is a sanctioned bogus name.
    expect(text).not.toMatch(/\b(Gavin|Zihao|Harvard|Stanford|MIT|Yale|Oxford)\b/i);
  });

  it('keeps the user’s own category labels when they exist', () => {
    // Values present for the factor, missing for the measure — the
    // real level names are the user's, not ours to replace.
    const table = inferTable(
      raw(
        ['Condition', 'Score'],
        [
          ['Control', ''],
          ['Low dose', ''],
          ['High dose', ''],
        ],
      ),
    );
    const sample = makeFromColumns(table);
    const levels = new Set(sample.table.rows.map((r) => String(r[0])));
    expect(levels).toContain('Control');
    expect(levels).toContain('High dose');
  });

  it('scales generated values to the column name, not to a finding', () => {
    const sample = makeFromColumns(inferTable(headerOnly(['Group', 'Age (years)'])));
    const ages = sample.table.rows.map((r) => Number(r[1]));
    for (const age of ages) {
      expect(age).toBeGreaterThan(15);
      expect(age).toBeLessThan(70);
    }
  });
});

describe('sample-data labelling — the label must be unmissable', () => {
  it('prefixes the caption whenever values were synthesised', () => {
    const sample = makeFromColumns(inferTable(headerOnly(['Condition', 'Score'])));
    const table = inferTable(sample.table);
    const rec = recommend(table)[0]!;
    const caption = captionFor(table, rec, { sample: true });
    expect(caption.startsWith(SAMPLE_CAPTION_PREFIX)).toBe(true);
    expect(caption).toMatch(/not real results/i);
  });

  it('leaves a real-data caption untouched', () => {
    const table = inferTable(
      raw(
        ['Condition', 'Mean score'],
        [
          ['Control', '4.2'],
          ['Drug', '5.6'],
        ],
      ),
    );
    const caption = captionFor(table, recommend(table)[0]!);
    expect(caption).not.toMatch(/sample data/i);
    expect(caption.startsWith(SAMPLE_CAPTION_PREFIX)).toBe(false);
  });

  it('carries the sample prefix into the caption the block is seeded with', () => {
    // The caption is the value handed to the chart block on insert,
    // so the warning has to be inside the string, not beside it.
    const sample = makeFromColumns(inferTable(headerOnly(['Week', 'Symptom severity'])));
    const table = inferTable(sample.table);
    const caption = captionFor(table, recommend(table)[0]!, { sample: true });
    expect(caption).toContain(SAMPLE_CAPTION_PREFIX);
    // …and still says something useful about the figure itself.
    expect(caption.length).toBeGreaterThan(SAMPLE_CAPTION_PREFIX.length + 10);
  });

  it('exposes one canonical label string for the UI to render', () => {
    expect(SAMPLE_DATA_LABEL).toMatch(/sample data/i);
    expect(SAMPLE_DATA_LABEL).toMatch(/not your results/i);
  });
});

describe('planLadder — routes column-only tables to generated values', () => {
  it('flags syntheticValues and attaches the generated sample', () => {
    const plan = planLadder(
      { kind: 'table', table: inferTable(headerOnly(['Condition', 'Score'])) },
      {},
    );
    expect(plan.syntheticValues).toBe(true);
    expect(plan.sample?.key).toBe('from-columns');
    // The previewed table is the generated one, so figures render.
    expect(plan.table?.rowCount).toBeGreaterThan(0);
  });

  it('does not flag a table the user supplied values for', () => {
    const plan = planLadder(
      {
        kind: 'table',
        table: inferTable(
          raw(
            ['Condition', 'Score'],
            [
              ['Control', '4.2'],
              ['Drug', '5.6'],
            ],
          ),
        ),
      },
      {},
    );
    expect(plan.syntheticValues).toBe(false);
    expect(plan.sample).toBeNull();
  });

  it('treats the whole "no data yet" branch as sample data', () => {
    const plan = planLadder({ kind: 'synthetic' }, { shape: 'groups', vars: 1 });
    expect(plan.syntheticValues).toBe(true);
  });

  it('flags nothing before any data has arrived', () => {
    expect(planLadder(null, {}).syntheticValues).toBe(false);
  });
});
