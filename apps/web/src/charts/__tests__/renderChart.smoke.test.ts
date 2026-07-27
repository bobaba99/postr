import { describe, expect, it } from 'vitest';
import type { Palette } from '@postr/shared';
import { inferTable } from '../inferColumns';
import { buildChartSpec } from '../buildSpec';
import { recommend } from '../recommend';
import { renderChart } from '../renderChart';
import type { ChartTheme } from '../plotOptions';
import { sampleDatasets } from '../sampleData';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};

const theme: ChartTheme = {
  palette,
  fontFamily: 'Georgia, serif',
  widthPx: 800,
  heightPx: 560,
  pxPerPt: 10 / 7.2,
};

describe('renderChart (jsdom smoke)', () => {
  // Real Observable Plot render for every seeded fixture — proves the
  // whole pipeline (parse → infer → recommend → spec → svg) end to end.
  for (const dataset of sampleDatasets()) {
    it(`renders ${dataset.key} to an svg`, async () => {
      const table = inferTable(dataset.table);
      const top = recommend(table)[0]!;
      const spec = buildChartSpec(table, top)!;
      const svg = await renderChart(spec, theme);
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('viewBox')).toBeTruthy();
      expect(svg.querySelectorAll('*').length).toBeGreaterThan(5);
    });
  }

  it('paints an in-svg legend for multi-series bar charts', async () => {
    const dataset = sampleDatasets().find((d) => d.key === 'two-category')!;
    const table = inferTable(dataset.table);
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    expect(spec.options.legend).toBe(true);
    const svg = await renderChart(spec, theme);
    const legend = svg.querySelector('[aria-label="legend"]');
    expect(legend).not.toBeNull();
    expect(legend!.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an empty spec', async () => {
    const dataset = sampleDatasets()[0]!;
    const table = inferTable(dataset.table);
    const spec = buildChartSpec(table, recommend(table)[0]!)!;
    const empty = { ...spec, data: { ...spec.data, rows: [] } };
    await expect(renderChart(empty, theme)).rejects.toThrow();
  });
});
