import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Palette } from '@postr/shared';
import { ChartChooser } from '../ladder/ChartChooser';
import { CHART_MAX_ROWS } from '../parseData';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};

function renderChooser(onPrimary = vi.fn()) {
  render(
    <ChartChooser
      layout="panel"
      palette={palette}
      fontFamily="Georgia, serif"
      actions={[{ label: 'Insert this figure', primary: true, run: onPrimary }]}
      confirmation="Inserted — legible at print size"
    />,
  );
  return onPrimary;
}

const TSV = 'Condition\tMean reaction time (ms)\nControl\t512\nPlacebo\t498\nHigh dose\t428';

describe('ChartChooser ladder', () => {
  it('starts at the data step and never auto-scrolls on load', () => {
    renderChooser();
    expect(screen.getByText('Your data')).toBeInTheDocument();
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
  });

  it('fast path: pasting a simple table renders zero questions', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), {
      target: { value: TSV },
    });
    // Straight to previews — no measure/grouping/emphasis steps.
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect(screen.queryByText('What did you measure?')).not.toBeInTheDocument();
    expect(screen.queryByText('What should the figure emphasise?')).not.toBeInTheDocument();
    expect(screen.getByText('Bar chart')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    // The data step collapsed to a summary.
    expect(screen.getByText('3 rows × 2 columns')).toBeInTheDocument();
  });

  it('inserting passes the spec and seeded caption to the action', async () => {
    const onPrimary = renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: TSV } });
    const insert = (await screen.findAllByText('Insert this figure'))[0]!;
    fireEvent.click(insert);
    expect(onPrimary).toHaveBeenCalledTimes(1);
    const [spec, caption] = onPrimary.mock.calls[0]!;
    expect(spec.form).toBe('bar');
    expect(spec.version).toBe(1);
    expect(String(caption)).toMatch(/condition/i);
    expect(await screen.findByText(/Inserted — legible at print size/)).toBeInTheDocument();
  });

  it('synthetic branch walks all three questions to previews', async () => {
    renderChooser();
    fireEvent.click(screen.getByText('I don’t have data yet'));
    fireEvent.click(await screen.findByText('A number compared across groups'));
    fireEvent.click(await screen.findByText('One grouping variable'));
    expect(screen.getByText('What should the figure emphasise?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Difference between groups'));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect(screen.getByText('Bar chart')).toBeInTheDocument();
  });

  it('refuses oversized pastes and truncates only on explicit consent', async () => {
    renderChooser();
    const big = ['x\ty', ...Array.from({ length: CHART_MAX_ROWS + 10 }, (_, i) => `g${i}\t${i}`)].join('\n');
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: big } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/2,000/);
    fireEvent.click(screen.getByText(/Use the first 2,000 rows/));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect(screen.getByText(/first 2,000 rows/)).toBeInTheDocument();
  });

  it('shows a friendly message for prose pastes', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), {
      target: { value: 'just a sentence\nand another sentence\nno table here' },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/paste cells/i);
  });

  it('reopening the data step invalidates everything below it', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: TSV } });
    await screen.findByText('Pick your figure');
    fireEvent.click(screen.getByText('▸ change'));
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Paste your table')).toBeInTheDocument();
  });

  it('asks the measure question when several numeric columns exist', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), {
      target: { value: 'Group\tAge\tScore\nA\t31\t55\nB\t29\t61\nC\t35\t48' },
    });
    expect(await screen.findByText('What did you measure?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Score'));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
  });

  it('offers poster tables as a zero-upload chip', async () => {
    render(
      <ChartChooser
        layout="panel"
        palette={palette}
        fontFamily="Georgia, serif"
        posterTables={[
          {
            blockId: 'b1',
            label: 'Table 1',
            tableData: {
              rows: 3,
              cols: 2,
              cells: ['Group', 'Mean', 'A', '4.2', 'B', '5.1'],
              colWidths: null,
              borderPreset: 'apa',
            },
          },
        ]}
        actions={[{ label: 'Insert this figure', primary: true, run: vi.fn() }]}
      />,
    );
    fireEvent.click(screen.getByText('Table 1'));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
  });

  it('renders live SVG previews', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: TSV } });
    await screen.findByText('Pick your figure');
    await waitFor(() => {
      expect(document.querySelector('figure svg')).not.toBeNull();
    });
  });
});
