import { describe, it, expect } from 'vitest';
import type { ChartSpec, ChartForm } from '@postr/shared';
import { chartSpecToR } from '../toR';
import { chartSpecToPython } from '../toPython';

function specFor(form: ChartForm): ChartSpec {
  return {
    version: 1,
    form,
    data: {
      columns: [
        { name: 'Condition', kind: 'category' },
        { name: 'Response', kind: 'number' },
        { name: 'Phase', kind: 'category' },
      ],
      rows: [
        ['Control', 42, 'Pre'],
        ['Drug A', 51, 'Pre'],
        ['Drug B', 63, 'Post'],
      ],
    },
    encoding: { x: 'Condition', y: 'Response', series: 'Phase' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' },
    paletteSlots: ['accent', 'accent2'],
    title: 'My "great" chart',
    xLabel: 'Condition',
    yLabel: 'Response',
  };
}

const ALL_FORMS: ChartForm[] = [
  'bar', 'bar-grouped', 'bar-stacked', 'bar-diverging',
  'line', 'area', 'scatter', 'histogram', 'box', 'heatmap', 'dumbbell',
];

describe('R codegen', () => {
  it.each(ALL_FORMS)('generates runnable ggplot for form %s', (form) => {
    const code = chartSpecToR(specFor(form), 'mine');
    expect(code).toContain('library(ggplot2)');
    expect(code).toContain('df <- data.frame(');
    expect(code).toContain('ggplot(df)');
    // the CSV loader is present and commented
    expect(code).toContain('# df <- read.csv("your-data.csv"');
    // fine-tune knobs are surfaced
    expect(code).toContain('plot_padding <-');
    expect(code).toContain('bar_width');
    expect(code).toContain('plot_title <-');
  });

  it('escapes quotes in labels', () => {
    const code = chartSpecToR(specFor('bar'), 'mine');
    expect(code).toContain('My \\"great\\" chart');
  });

  it('embeds the real data in mine mode and synthetic in sample mode', () => {
    const mine = chartSpecToR(specFor('bar'), 'mine');
    const sample = chartSpecToR(specFor('bar'), 'sample');
    expect(mine).toContain('"Control"'); // real category
    expect(mine).toContain('42'); // real value
    expect(sample).toContain('SAMPLE data');
    expect(sample).not.toContain('"Control"'); // real values not leaked
    expect(sample).toContain('"Condition"'); // real column NAME kept
  });
});

describe('Python codegen', () => {
  it.each(ALL_FORMS)('generates runnable matplotlib for form %s', (form) => {
    const code = chartSpecToPython(specFor(form), 'mine');
    expect(code).toContain('import matplotlib.pyplot as plt');
    expect(code).toContain('df = pd.DataFrame(');
    expect(code).toContain('fig, ax = plt.subplots');
    expect(code).toContain('# df = pd.read_csv("your-data.csv")');
    expect(code).toContain('pad_left');
    expect(code).toContain('bar_width');
    expect(code).toContain('plot_title =');
  });

  it('embeds real vs synthetic data by mode, keeping column names', () => {
    const mine = chartSpecToPython(specFor('line'), 'mine');
    const sample = chartSpecToPython(specFor('line'), 'sample');
    expect(mine).toContain('"Control"');
    expect(sample).not.toContain('"Control"');
    expect(sample).toContain('"Condition"');
  });
});

describe('backslash-bearing values are escaped (my-data mode)', () => {
  function backslashSpec(): ChartSpec {
    return {
      version: 1,
      form: 'bar',
      data: {
        columns: [
          { name: 'Path', kind: 'category' },
          { name: 'N', kind: 'number' },
        ],
        rows: [
          ['C:\\new', 3], // \n would corrupt if unescaped
          ['ends-with\\', 5], // trailing backslash would escape the quote
        ],
      },
      encoding: { x: 'Path', y: 'N' },
      options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' },
      paletteSlots: ['accent'],
    };
  }

  it('R doubles backslashes so no literal is corrupted or unterminated', () => {
    const code = chartSpecToR(backslashSpec(), 'mine');
    expect(code).toContain('"C:\\\\new"');
    expect(code).toContain('"ends-with\\\\"');
    // never the raw (corrupting) forms
    expect(code).not.toContain('"C:\\new"');
  });

  it('Python doubles backslashes identically', () => {
    const code = chartSpecToPython(backslashSpec(), 'mine');
    expect(code).toContain('"C:\\\\new"');
    expect(code).toContain('"ends-with\\\\"');
  });
});
