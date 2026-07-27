import { describe, expect, it } from 'vitest';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';
import { buildChartSpec, captionFor, CHART_MAX_SPEC_BYTES } from '../buildSpec';
import {
  needsEmphasisQuestion,
  recommend,
  groupingCandidates,
  measureCandidates,
} from '../recommend';
import { sampleDatasets } from '../sampleData';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

/** Rows of repeated observations per group — box-plot territory. */
function repeatedObservations(): RawTable {
  const rows: RawTable['rows'] = [];
  const groups: Array<[string, number]> = [
    ['Control', 480],
    ['Low dose', 445],
    ['High dose', 410],
  ];
  groups.forEach(([group, base], g) => {
    for (let i = 0; i < 10; i++) {
      rows.push([group, String(base + ((i * 37 + g * 11) % 60) - 30)]);
    }
  });
  return raw(['Condition', 'Reaction time (ms)'], rows);
}

describe('recommend — seeded fixtures (one per data-shape row)', () => {
  // The generators double as the recommender's test fixtures: each
  // one's expectTopForm is the ranking-table row it exercises.
  for (const dataset of sampleDatasets()) {
    it(`ranks ${dataset.expectTopForm} first for ${dataset.key}`, () => {
      const recs = recommend(inferTable(dataset.table));
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0]?.form).toBe(dataset.expectTopForm);
    });

    it(`builds a valid spec for ${dataset.key}`, () => {
      const table = inferTable(dataset.table);
      const top = recommend(table)[0]!;
      const spec = buildChartSpec(table, top);
      expect(spec).not.toBeNull();
      expect(spec!.version).toBe(1);
      expect(spec!.form).toBe(dataset.expectTopForm);
      expect(spec!.data.rows.length).toBeGreaterThan(0);
      expect(spec!.data.columns.length).toBeGreaterThan(0);
      for (const row of spec!.data.rows) {
        expect(row).toHaveLength(spec!.data.columns.length);
      }
      expect(JSON.stringify(spec).length).toBeLessThanOrEqual(CHART_MAX_SPEC_BYTES);
    });

    it(`writes a caption for ${dataset.key}`, () => {
      const table = inferTable(dataset.table);
      const top = recommend(table)[0]!;
      const caption = captionFor(table, top);
      expect(caption.length).toBeGreaterThan(10);
      // Methods voice, not marketing voice.
      expect(caption).not.toMatch(/great|beautiful|awesome|!$/i);
    });
  }
});

describe('recommend — ranking details', () => {
  it('aggregates bars and surfaces box plots when groups repeat', () => {
    const table = inferTable(repeatedObservations());
    const recs = recommend(table);
    expect(recs[0]?.form).toBe('bar');
    expect(recs[0]?.aggregate).toBe(true);
    expect(recs.map((r) => r.form)).toContain('box');
  });

  it('lets the spread emphasis flip repeated observations to a box plot', () => {
    const table = inferTable(repeatedObservations());
    const recs = recommend(table, { emphasis: 'spread' });
    expect(recs[0]?.form).toBe('box');
  });

  it('keeps single-row-per-group bars on the fast path (no emphasis question)', () => {
    const grouped = sampleDatasets().find((d) => d.key === 'grouped-means')!;
    expect(needsEmphasisQuestion(inferTable(grouped.table))).toBe(false);
  });

  it('asks the emphasis question when bar and box genuinely tie', () => {
    expect(needsEmphasisQuestion(inferTable(repeatedObservations()))).toBe(true);
  });

  it('flips bars horizontal for long category labels', () => {
    const table = inferTable(raw(['Intervention arm', 'Mean score'], [
      ['Cognitive behavioural therapy plus medication', '4.2'],
      ['Medication only', '5.1'],
      ['Waitlist control condition', '6.0'],
    ]));
    const recs = recommend(table);
    expect(recs[0]?.form).toBe('bar');
    expect(recs[0]?.horizontal).toBe(true);
  });

  it('prefers a heatmap over a scatter for dense two-numeric data', () => {
    const rows: RawTable['rows'] = [];
    for (let i = 0; i < 500; i++) {
      rows.push([String((i % 91) / 10), String(((i * 7) % 83) / 2)]);
    }
    const table = inferTable(raw(['x', 'y'], rows));
    expect(recommend(table)[0]?.form).toBe('heatmap');
  });

  it('respects an explicit "no grouping" answer', () => {
    const table = inferTable(raw(['Group', 'Score'], [
      ['A', '1'],
      ['B', '2'],
      ['A', '3'],
      ['B', '4'],
    ]));
    const recs = recommend(table, { groupings: [] });
    expect(recs[0]?.form).toBe('histogram');
  });

  it('respects an explicit measure choice', () => {
    const table = inferTable(raw(['Group', 'Age', 'Score'], [
      ['A', '34', '61'],
      ['B', '29', '75'],
      ['C', '41', '58'],
    ]));
    const recs = recommend(table, { measure: 'Score', groupings: ['Group'] });
    const spec = buildChartSpec(table, recs[0]!);
    expect(spec?.encoding.y).toBe('Score');
    expect(spec?.encoding.x).toBe('Group');
  });

  it('returns nothing for tables with no numeric measure', () => {
    const table = inferTable(raw(['Name', 'Site'], [
      ['John Smith', 'Acme State University'],
      ['Jane Doe', 'Sample Research Institute'],
    ]));
    expect(recommend(table)).toHaveLength(0);
  });
});

describe('buildChartSpec — guardrails', () => {
  it('folds > 8 line series into "Other (mean)"', () => {
    const rows: RawTable['rows'] = [];
    for (let month = 1; month <= 6; month++) {
      for (let s = 0; s < 12; s++) {
        rows.push([String(month), `Site ${String.fromCharCode(65 + s)}`, String(10 + s + month)]);
      }
    }
    const table = inferTable(raw(['Month', 'Site', 'Count'], rows));
    // With 12 series the crowding guardrail ranks the heatmap first…
    expect(recommend(table)[0]?.form).toBe('heatmap');
    // …but a user emphasizing trend still gets a line — folded.
    const top = recommend(table, { emphasis: 'trend' })[0]!;
    expect(top.form).toBe('line');
    const spec = buildChartSpec(table, top)!;
    const series = new Set(spec.data.rows.map((r) => r[1]));
    expect(series.size).toBeLessThanOrEqual(8);
    expect(series.has('Other (mean)')).toBe(true);
  });

  it('never puts a legend on a single series', () => {
    const trend = sampleDatasets().find((d) => d.key === 'time-series')!;
    const table = inferTable(trend.table);
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    expect(spec.options.legend).toBe(false);
  });

  it('puts a legend on multi-series charts', () => {
    const multi = sampleDatasets().find((d) => d.key === 'multi-series')!;
    const table = inferTable(multi.table);
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    expect(spec.options.legend).toBe(true);
  });

  it('aggregates repeated groups to means in bar specs', () => {
    const table = inferTable(repeatedObservations());
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    // 30 raw rows → 3 aggregated rows, one per condition.
    expect(spec.data.rows).toHaveLength(3);
  });

  it('orders Likert levels from disagreement to agreement', () => {
    const likert = sampleDatasets().find((d) => d.key === 'likert')!;
    const table = inferTable(likert.table);
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    const levels = spec.data.rows.map((r) => String(r[1]));
    const firstAgree = levels.indexOf('Agree');
    const lastDisagree = levels.lastIndexOf('Strongly disagree');
    expect(lastDisagree).toBeLessThan(firstAgree);
  });

  it('uses palette slots, never hex colors', () => {
    for (const dataset of sampleDatasets()) {
      const table = inferTable(dataset.table);
      const spec = buildChartSpec(table, recommend(table)[0]!);
      expect(spec).not.toBeNull();
      for (const slot of spec!.paletteSlots) {
        expect(slot).not.toMatch(/^#/);
      }
      expect(spec!.paletteSlots.length).toBeGreaterThan(0);
    }
  });
});

describe('ladder candidate helpers', () => {
  it('excludes ordered columns from measure candidates', () => {
    const trend = sampleDatasets().find((d) => d.key === 'time-series')!;
    const table = inferTable(trend.table);
    expect(measureCandidates(table).map((c) => c.name)).toEqual(['Symptom severity (0–10)']);
    expect(groupingCandidates(table).map((c) => c.name)).toEqual(['Week']);
  });

  it('excludes high-cardinality text columns from grouping candidates', () => {
    const rows: RawTable['rows'] = Array.from({ length: 40 }, (_, i) => [
      `Participant ${i}`,
      String(i),
    ]);
    const table = inferTable(raw(['ID', 'Score'], rows));
    expect(groupingCandidates(table)).toHaveLength(0);
  });
});
