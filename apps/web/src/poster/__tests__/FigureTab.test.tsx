import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Block, ChartSpec, Palette } from '@postr/shared';
import { FigureTab, type FigureMode } from '../sidebar/FigureTab';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};

const TSV = 'Condition\tMean reaction time (ms)\nControl\t512\nPlacebo\t498\nHigh dose\t428';

/** ⌘V into the ladder's textarea — typing deliberately does not parse. */
function pasteTable(text: string) {
  fireEvent.paste(screen.getByLabelText('Paste your table'), {
    clipboardData: { getData: () => text },
  });
}

/** A minimal chart block for the palette-picker path. */
function chartBlock(seriesPaletteId?: string): Block {
  const spec: ChartSpec = {
    version: 1,
    form: 'bar',
    data: {
      columns: [
        { name: 'grp', kind: 'category' },
        { name: 'val', kind: 'number' },
      ],
      rows: [
        ['A', 1],
        ['B', 2],
        ['C', 3],
      ],
    },
    encoding: { x: 'grp', y: 'val', series: 'grp' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' },
    paletteSlots: ['accent', 'accent2'],
    ...(seriesPaletteId ? { seriesPaletteId } : {}),
  };
  return {
    id: 'chart-1',
    type: 'chart',
    x: 0,
    y: 0,
    w: 100,
    h: 70,
    content: '',
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
    chartSpec: spec,
  };
}

function Harness({
  initialMode = 'make',
  onInsertChart = vi.fn(),
  selectedChartBlock = null,
  onUpdateChartSpec = vi.fn(),
}: {
  initialMode?: FigureMode;
  onInsertChart?: (spec: unknown, caption: string) => void;
  selectedChartBlock?: Block | null;
  onUpdateChartSpec?: (blockId: string, spec: ChartSpec) => void;
}) {
  const [mode, setMode] = useState<FigureMode>(initialMode);
  return (
    <FigureTab
      mode={mode}
      onChangeMode={setMode}
      selectedImageBlock={null}
      defaultFigureWidthIn={10}
      defaultFigureHeightIn={7}
      palette={palette}
      fontFamily="Georgia, serif"
      posterTables={[]}
      onInsertChart={onInsertChart}
      selectedChartBlock={selectedChartBlock}
      onUpdateChartSpec={onUpdateChartSpec}
    />
  );
}

describe('FigureTab', () => {
  it('shows the chooser in Make mode and hides the checker', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Make a figure' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Paste your table')).toBeVisible();
    expect(screen.getByText('Code Readability Check')).not.toBeVisible();
  });

  it('switches to the readability checker in Check mode', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Check a figure' }));
    expect(screen.getByText('Code Readability Check')).toBeVisible();
    expect(screen.getByLabelText('Paste your table')).not.toBeVisible();
  });

  it('keeps the canvas-overlay sizing copy in Check mode (editor layout)', () => {
    // The public /tools/figure-readability page reuses ReadabilityPanel
    // with layout="page" and different copy. The editor must keep the
    // default "panel" layout: its sizing note still points at the
    // draggable figure preview on the canvas.
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Check a figure' }));
    expect(screen.getByText(/drag or resize it/i)).toBeVisible();
    expect(screen.queryByText(/print size you entered/i)).toBeNull();
  });

  it('keeps ladder progress across a mode round-trip', async () => {
    render(<Harness />);
    pasteTable(TSV);
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check a figure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make a figure' }));
    // Both modes stay mounted, so the previews are still there.
    expect(screen.getByText('Pick your figure')).toBeVisible();
  });

  it('inserting passes spec + caption up and confirms legibility', async () => {
    const onInsertChart = vi.fn();
    render(<Harness onInsertChart={onInsertChart} />);
    pasteTable(TSV);
    fireEvent.click(await screen.findByText('Insert selected figures'));
    expect(onInsertChart).toHaveBeenCalledTimes(1);
    const [spec, caption] = onInsertChart.mock.calls[0]! as [
      { form: string; version: number },
      string,
    ];
    expect(spec.form).toBe('bar');
    expect(spec.version).toBe(1);
    expect(caption.length).toBeGreaterThan(10);
    expect(
      await screen.findByText(/Inserted on your poster/),
    ).toBeInTheDocument();
  });

  it('inserts one block per selected figure', async () => {
    const onInsertChart = vi.fn();
    render(<Harness onInsertChart={onInsertChart} />);
    pasteTable(TSV);
    await screen.findByText('Pick your figure');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[1]!);

    fireEvent.click(await screen.findByText('Insert selected figures (2)'));

    // Two selected figures become two separate chart blocks, in panel
    // order — not one block, and not a merged spec.
    expect(onInsertChart).toHaveBeenCalledTimes(2);
    const forms = onInsertChart.mock.calls.map(
      (call) => (call[0] as { form: string }).form,
    );
    expect(new Set(forms).size).toBe(2);
    expect(await screen.findByText(/2 figures — Inserted/)).toBeInTheDocument();
  });

  it('hides the palette picker when no chart block is selected', () => {
    render(<Harness />);
    expect(screen.queryByText('Chart colours')).not.toBeInTheDocument();
  });

  it('hides the palette picker for a single-series chart (nothing to recolour)', () => {
    // A chart with no `series` encoding fills from one slot, so the
    // picker would only persist a no-op seriesPaletteId.
    const single = chartBlock();
    single.chartSpec = { ...single.chartSpec!, encoding: { x: 'grp', y: 'val' } };
    render(<Harness selectedChartBlock={single} />);
    expect(screen.queryByText('Chart colours')).not.toBeInTheDocument();
  });

  it('shows the palette picker for a selected chart and persists a pick', () => {
    const onUpdateChartSpec = vi.fn();
    render(
      <Harness selectedChartBlock={chartBlock()} onUpdateChartSpec={onUpdateChartSpec} />,
    );
    expect(screen.getByText('Chart colours')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /blue . orange . gray/i }));
    expect(onUpdateChartSpec).toHaveBeenCalledTimes(1);
    const [blockId, spec] = onUpdateChartSpec.mock.calls[0]! as [string, ChartSpec];
    expect(blockId).toBe('chart-1');
    expect(spec.seriesPaletteId).toBe('blue-orange-gray');
  });

  // Fix 15, at the editor's entry point: Figure › Check a figure.
  describe('Check a figure, on code the check cannot place or read', () => {
    const codeBox = () => screen.getByLabelText('Your R or Python plotting code');
    const check = () => fireEvent.click(screen.getByRole('button', { name: /check$/i }));
    /** The line beside ▶ Check as a sighted user reads it. */
    const checkLabel = () => {
      const slot = screen.getByRole('button', { name: /check$/i }).previousElementSibling as HTMLElement;
      const copy = slot.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.sr-only').forEach((e) => e.remove());
      return copy.textContent?.trim() ?? '';
    };
    const announced = () => screen.queryAllByRole('status').map((e) => e.textContent ?? '').join(' | ');
    const openChecker = () => {
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Check a figure' }));
    };

    it('answers that it could not tell R from Python, and a screen reader hears it', () => {
      openChecker();
      fireEvent.change(codeBox(), { target: { value: 'df.plot(kind="bar", title="Counts by group", rot=0)' } });
      check();
      const answer = 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).';
      expect(checkLabel()).toBe(answer);
      expect(announced()).toContain(answer);
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('names an unsupported plotting system, with no table', () => {
      openChecker();
      fireEvent.change(codeBox(), { target: { value: 'library(lattice)\nbwplot(value ~ group, data = df)' } });
      check();
      expect(checkLabel()).toBe('Not supported yet: lattice. The check reads R (ggplot2) and Python (matplotlib).');
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('checks ggplot2 with a string in aes() as ggplot2, not plotnine (round 1)', () => {
      openChecker();
      fireEvent.change(codeBox(), {
        target: {
          value: [
            'library(ggplot2)',
            'ggplot(scores, aes(x = "", y = score)) +',
            '  geom_boxplot() +',
            '  theme_classic(base_size = 12)',
            'ggsave("box.png", width = 3, height = 5)',
          ].join('\n'),
        },
      });
      expect(checkLabel()).toBe('Detected: R / ggplot2');
      check();
      expect(screen.getByText('Tick labels')).toBeInTheDocument();
    });

    it('does not say an answer again when the language is changed and changed back (round 2)', () => {
      openChecker();
      fireEvent.change(codeBox(), { target: { value: 'df.plot(kind="bar", title="Counts by group", rot=0)' } });
      check();
      const answer = 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).';
      expect(announced()).toContain(answer);
      fireEvent.click(screen.getByRole('button', { name: /^python$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^auto$/i }));
      expect(announced()).not.toContain(answer);
      expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
    });

    it('keeps the last result, marked out of date, when the new code cannot be checked', () => {
      openChecker();
      fireEvent.change(codeBox(), {
        target: { value: 'library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point() + theme_minimal(base_size = 11)' },
      });
      check();
      expect(screen.getByText('Tick labels')).toBeInTheDocument();
      fireEvent.change(codeBox(), { target: { value: 'plot(x, y)' } });
      check();
      expect(screen.getByText('Tick labels')).toBeInTheDocument();
      expect(screen.getByText(/^Out of date: /)).toBeInTheDocument();
    });
  });

  it('clearing a chart palette drops seriesPaletteId from the spec', () => {
    const onUpdateChartSpec = vi.fn();
    render(
      <Harness
        selectedChartBlock={chartBlock('blue-orange-gray')}
        onUpdateChartSpec={onUpdateChartSpec}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /poster theme \(default\)/i }));
    const [, spec] = onUpdateChartSpec.mock.calls[0]! as [string, ChartSpec];
    expect('seriesPaletteId' in spec).toBe(false);
  });
});
