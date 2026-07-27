/**
 * Design-shape recognition (B1).
 *
 * One case per row of the deterministic treatment table, asserting
 * the suggested figure set — not just that something came back.
 * The owner's two worked examples ("3+ IVs, 1 DV" and "5 DVs + 20
 * IVs") must land on genuinely different treatments; that is the
 * point of the whole layer.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyColumns,
  detectDesignShape,
  facetFactors,
  isUnchartable,
  smallMultipleMeasures,
} from '../designShape';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';
import { recommendFigures } from '../recommend';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

/** Build a table with `ivs` categorical factors and `dvs` measures. */
function wideTable(ivs: number, dvs: number, rowCount = 12): RawTable {
  const header = [
    ...Array.from({ length: ivs }, (_, i) => `Factor ${i + 1}`),
    ...Array.from({ length: dvs }, (_, i) => `Outcome ${i + 1}`),
  ];
  const rows: RawTable['rows'] = [];
  for (let r = 0; r < rowCount; r++) {
    rows.push([
      ...Array.from({ length: ivs }, (_, i) => `L${(r + i) % 3}`),
      ...Array.from({ length: dvs }, (_, i) => String(10 + ((r * 7 + i * 3) % 40))),
    ]);
  }
  return raw(header, rows);
}

const shapeOf = (table: RawTable) => detectDesignShape(inferTable(table));

describe('classifyColumns — statistical type and design role', () => {
  it('separates outcomes, factors, temporal axes and identifiers', () => {
    const table = inferTable(
      raw(
        ['Participant ID', 'Week', 'Condition', 'Reaction time (ms)'],
        [
          ['P001', '1', 'Control', '480'],
          ['P002', '2', 'Drug', '455'],
          ['P003', '3', 'Control', '470'],
          ['P004', '4', 'Drug', '441'],
        ],
      ),
    );
    const byName = new Map(classifyColumns(table).map((c) => [c.name, c]));

    expect(byName.get('Participant ID')?.role).toBe('identifier');
    expect(byName.get('Week')?.type).toBe('temporal');
    expect(byName.get('Week')?.role).toBe('temporal');
    expect(byName.get('Condition')?.type).toBe('categorical');
    expect(byName.get('Condition')?.role).toBe('independent');
    expect(byName.get('Reaction time (ms)')?.type).toBe('continuous');
    expect(byName.get('Reaction time (ms)')?.role).toBe('dependent');
  });

  it('treats a constant column as carrying no information', () => {
    const table = inferTable(
      raw(
        ['Site', 'Score'],
        [
          ['Acme State University', '4'],
          ['Acme State University', '6'],
          ['Acme State University', '5'],
        ],
      ),
    );
    const site = classifyColumns(table).find((c) => c.name === 'Site');
    expect(site?.role).toBe('constant');
  });

  it('reads a high-cardinality text column as an identifier, not a factor', () => {
    const rows: RawTable['rows'] = Array.from({ length: 40 }, (_, i) => [
      `Free text response ${i}`,
      String(i),
    ]);
    const table = inferTable(raw(['Comment', 'Score'], rows));
    expect(classifyColumns(table).find((c) => c.name === 'Comment')?.role).toBe('identifier');
  });
});

describe('design shape → treatment (the deterministic table)', () => {
  it('1 IV / 1 DV — a single chart carries it', () => {
    const shape = shapeOf(
      raw(
        ['Condition', 'Mean score'],
        [
          ['Control', '4.2'],
          ['Low dose', '5.1'],
          ['High dose', '6.0'],
        ],
      ),
    );
    expect(shape.dvCount).toBe(1);
    expect(shape.ivCount).toBe(1);
    expect(shape.treatment).toBe('single-chart');
    expect(shape.label).toBe('1 outcome × 1 factor');
    expect(isUnchartable(shape)).toBe(false);
  });

  it('0 IV / 1 DV — still a single chart (a distribution)', () => {
    const rows: RawTable['rows'] = Array.from({ length: 30 }, (_, i) => [String(400 + i * 3)]);
    const shape = shapeOf(raw(['Response time (ms)'], rows));
    expect(shape.ivCount).toBe(0);
    expect(shape.treatment).toBe('single-chart');
  });

  it('3 IVs / 1 DV — the owner’s first example: facets, not one chart', () => {
    const shape = shapeOf(wideTable(3, 1));
    expect(shape.dvCount).toBe(1);
    expect(shape.ivCount).toBe(3);
    expect(shape.treatment).toBe('faceted');
    // The two strongest factors stay in the figure; the rest facet.
    expect(facetFactors(shape)).toEqual(['Factor 3']);
  });

  it('4 IVs / 1 DV — still faceted, with two factors spun out', () => {
    const shape = shapeOf(wideTable(4, 1));
    expect(shape.treatment).toBe('faceted');
    expect(facetFactors(shape)).toEqual(['Factor 3', 'Factor 4']);
  });

  it('1 IV / 4 DVs — one small-multiple panel per outcome', () => {
    const shape = shapeOf(wideTable(1, 4));
    expect(shape.dvCount).toBe(4);
    expect(shape.treatment).toBe('small-multiples');
    expect(smallMultipleMeasures(shape)).toEqual([
      'Outcome 1',
      'Outcome 2',
      'Outcome 3',
      'Outcome 4',
    ]);
  });

  it('5 DVs / 20 IVs — the owner’s second example: no single chart fits', () => {
    const shape = shapeOf(wideTable(20, 5));
    expect(shape.dvCount).toBe(5);
    expect(shape.ivCount).toBe(20);
    expect(shape.treatment).toBe('no-single-chart');
    expect(isUnchartable(shape)).toBe(true);
    // The honest answer explains itself rather than forcing a figure.
    expect(shape.rationale).toMatch(/wider than any single figure/i);
    expect(shape.rationale).toMatch(/summary table/i);
  });

  it('maps the owner’s two examples to genuinely different treatments', () => {
    expect(shapeOf(wideTable(3, 1)).treatment).not.toBe(shapeOf(wideTable(20, 5)).treatment);
  });

  it('all-categorical — a summary table, not a chart', () => {
    const shape = shapeOf(
      raw(
        ['Condition', 'Sex', 'Site'],
        [
          ['Control', 'F', 'Acme State University'],
          ['Drug', 'M', 'Sample Research Institute'],
          ['Control', 'M', 'Acme State University'],
        ],
      ),
    );
    expect(shape.dvCount).toBe(0);
    expect(shape.treatment).toBe('summary-table');
    expect(shape.rationale).toMatch(/table, not a chart/i);
  });

  it('a single column of numbers is chartable on its own', () => {
    const rows: RawTable['rows'] = Array.from({ length: 20 }, (_, i) => [String(50 + i)]);
    const shape = shapeOf(raw(['Score'], rows));
    expect(shape.dvCount).toBe(1);
    expect(shape.ivCount).toBe(0);
    expect(shape.treatment).toBe('single-chart');
  });

  it('an empty table has nothing to plot', () => {
    const shape = shapeOf(raw([], []));
    expect(shape.treatment).toBe('nothing-to-plot');
    expect(isUnchartable(shape)).toBe(true);
  });

  it('a temporal factor is recognised and reported', () => {
    const rows: RawTable['rows'] = [];
    for (let week = 1; week <= 8; week++) rows.push([String(week), String(7 - week * 0.4)]);
    const shape = shapeOf(raw(['Week', 'Symptom severity'], rows));
    expect(shape.hasTemporal).toBe(true);
    expect(shape.ivNames).toEqual(['Week']);
    expect(shape.treatment).toBe('single-chart');
  });

  it('facets when crossing two factors explodes the cell count', () => {
    // 12 sites x 12 timepoints = 144 cells: legal shape, unreadable
    // as one figure.
    const rows: RawTable['rows'] = [];
    for (let s = 0; s < 12; s++) {
      for (let t = 0; t < 12; t++) {
        rows.push([`Site ${String.fromCharCode(65 + s)}`, `T${t}`, String(10 + s + t)]);
      }
    }
    const shape = shapeOf(raw(['Site', 'Timepoint', 'Score'], rows));
    expect(shape.cells).toBe(144);
    expect(shape.treatment).toBe('faceted');
  });

  it('is deterministic — the same table always yields the same shape', () => {
    const table = wideTable(3, 2);
    expect(shapeOf(table)).toEqual(shapeOf(table));
  });
});

describe('recommendFigures — treatment gates the figure set', () => {
  it('returns ranked figures and no note for a single-chart shape', () => {
    const advice = recommendFigures(
      inferTable(
        raw(
          ['Condition', 'Mean score'],
          [
            ['Control', '4.2'],
            ['Low dose', '5.1'],
            ['High dose', '6.0'],
          ],
        ),
      ),
    );
    expect(advice.recommendations.length).toBeGreaterThan(0);
    expect(advice.recommendations[0]?.form).toBe('bar');
    expect(advice.note).toBeNull();
    expect(advice.shape.treatment).toBe('single-chart');
  });

  it('ranks nothing and explains why when no single chart fits', () => {
    const advice = recommendFigures(inferTable(wideTable(20, 5)));
    expect(advice.recommendations).toEqual([]);
    expect(advice.note).not.toBeNull();
    expect(advice.note).toMatch(/wider than any single figure/i);
  });

  it('still ranks forms for a faceted shape, but carries the note', () => {
    const advice = recommendFigures(inferTable(wideTable(3, 1)));
    expect(advice.recommendations.length).toBeGreaterThan(0);
    expect(advice.note).toMatch(/panels/i);
  });

  it('lists per-outcome panels for a small-multiples shape', () => {
    const advice = recommendFigures(inferTable(wideTable(1, 4)));
    expect(advice.panels).toEqual(['Outcome 1', 'Outcome 2', 'Outcome 3', 'Outcome 4']);
    expect(advice.note).toMatch(/one small panel per outcome|one panel per outcome/i);
  });

  it('says there is nothing to plot for an all-categorical table', () => {
    const advice = recommendFigures(
      inferTable(
        raw(
          ['Condition', 'Sex'],
          [
            ['Control', 'F'],
            ['Drug', 'M'],
          ],
        ),
      ),
    );
    expect(advice.recommendations).toEqual([]);
    expect(advice.note).toMatch(/table, not a chart/i);
  });
});
