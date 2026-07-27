import { describe, expect, it } from 'vitest';
import type { Palette } from '@postr/shared';
import { inferTable } from '../inferColumns';
import { buildChartSpec } from '../buildSpec';
import { recommend } from '../recommend';
import { buildPlotOptions, type ChartTheme, type PlotLike } from '../plotOptions';
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

interface RecordedCall {
  mark: string;
  args: unknown[];
}

/** Fake Plot module that records mark constructor calls. */
function recordingPlot(): { plot: PlotLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const plot = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        (...args: unknown[]) => {
          calls.push({ mark: prop, args });
          return { mark: prop };
        },
    },
  ) as PlotLike;
  return { plot, calls };
}

function specFor(key: string) {
  const dataset = sampleDatasets().find((d) => d.key === key)!;
  const table = inferTable(dataset.table);
  return buildChartSpec(table, recommend(table)[0]!)!;
}

describe('buildPlotOptions', () => {
  it('enforces the print-size minimums from the readability checker', () => {
    const { plot } = recordingPlot();
    const build = buildPlotOptions(specFor('grouped-means'), theme, plot);
    // 18 pt ticks and 24 pt axis titles at PX = 10 → 25 px / 33.3 px.
    expect(build.tickPx).toBeCloseTo(25, 0);
    expect(build.labelPx).toBeCloseTo(33.3, 0);
    const style = build.options['style'] as Record<string, string>;
    expect(style['fontSize']).toBe('25px');
    expect(style['fontFamily']).toBe('Georgia, serif');
  });

  it('direct-labels multi-series lines instead of using a legend', () => {
    const { plot, calls } = recordingPlot();
    const build = buildPlotOptions(specFor('multi-series'), theme, plot);
    expect(build.legendEntries).toHaveLength(0);
    expect(calls.some((c) => c.mark === 'text')).toBe(true);
  });

  it('produces legend entries for grouped bars', () => {
    const { plot } = recordingPlot();
    const build = buildPlotOptions(specFor('two-category'), theme, plot);
    expect(build.legendEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of build.legendEntries) {
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('signs Likert disagreement negative and splits neutral', () => {
    const { plot, calls } = recordingPlot();
    buildPlotOptions(specFor('likert'), theme, plot);
    const barX = calls.find((c) => c.mark === 'barX');
    expect(barX).toBeDefined();
    const rows = barX!.args[0] as Array<Record<string, unknown>>;
    const negatives = rows.filter((r) => Number(r['__value']) < 0);
    const positives = rows.filter((r) => Number(r['__value']) > 0);
    expect(negatives.length).toBeGreaterThan(0);
    expect(positives.length).toBeGreaterThan(0);
    // Neutral rows appear twice: once per side of the zero line.
    const neutrals = rows.filter((r) => String(r['__level']) === 'Neutral');
    expect(neutrals).toHaveLength(2 * 4); // 4 statements
  });

  it('renders dumbbells as link + paired dots sorted by follow-up', () => {
    const { plot, calls } = recordingPlot();
    buildPlotOptions(specFor('pre-post'), theme, plot);
    expect(calls.filter((c) => c.mark === 'dot')).toHaveLength(2);
    expect(calls.some((c) => c.mark === 'link')).toBe(true);
  });

  it('resolves palette slots to poster colors', () => {
    const { plot, calls } = recordingPlot();
    buildPlotOptions(specFor('grouped-means'), theme, plot);
    const bar = calls.find((c) => c.mark === 'barY' || c.mark === 'barX');
    const options = bar!.args[1] as Record<string, unknown>;
    expect(options['fill']).toBe(palette.accent);
  });
});
