import { describe, expect, it } from 'vitest';
import { inferTable } from '../inferColumns';
import { sampleDatasets } from '../sampleData';

describe('sampleDatasets', () => {
  it('is deterministic — two calls produce identical values', () => {
    expect(sampleDatasets()).toEqual(sampleDatasets());
  });

  it('covers every row of the data-shape table exactly once', () => {
    const keys = sampleDatasets().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(9);
  });

  it('produces parseable, chartable tables', () => {
    for (const dataset of sampleDatasets()) {
      const inferred = inferTable(dataset.table);
      expect(inferred.rowCount, dataset.key).toBeGreaterThan(0);
      const numeric = inferred.columns.filter((c) => c.kind === 'number');
      expect(numeric.length, dataset.key).toBeGreaterThan(0);
      // Every numeric cell must have coerced cleanly — a generator
      // emitting unparseable numbers would silently blank previews.
      for (const col of numeric) {
        expect(col.values.every((v) => v === null || Number.isFinite(v)), `${dataset.key}/${col.name}`).toBe(true);
        expect(col.values.some((v) => v !== null), `${dataset.key}/${col.name}`).toBe(true);
      }
    }
  });

  it('uses only bogus institution names', () => {
    // Per feedback_sample_names: placeholder content never names a
    // real researcher or institution. The allowlist is the exact set
    // of fake orgs the house style permits.
    const allowed = /acme|sample research/i;
    for (const dataset of sampleDatasets()) {
      for (const row of dataset.table.rows) {
        for (const cell of row) {
          const text = String(cell ?? '');
          if (/university|institute|college|hospital|clinic/i.test(text)) {
            expect(text, `${dataset.key}: ${text}`).toMatch(allowed);
          }
        }
      }
    }
  });

  it('keeps effect sizes visible but plausible in the grouped-means fixture', () => {
    const grouped = sampleDatasets().find((d) => d.key === 'grouped-means')!;
    const values = grouped.table.rows.map((r) => Number(r[1]));
    const max = Math.max(...values);
    const min = Math.min(...values);
    // Visible difference (> 10%) but not cartoonish (< 40%).
    expect((max - min) / max).toBeGreaterThan(0.1);
    expect((max - min) / max).toBeLessThan(0.4);
  });
});
