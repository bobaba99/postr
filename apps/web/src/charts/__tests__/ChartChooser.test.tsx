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

/** The real primary path: ⌘V into the textarea. */
function pasteTable(text: string) {
  fireEvent.paste(screen.getByLabelText('Paste your table'), {
    clipboardData: { getData: () => text },
  });
}

/** The typed path: characters land in the draft, then blur commits. */
function typeTable(text: string) {
  const box = screen.getByLabelText('Paste your table');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
}

describe('ChartChooser ladder', () => {
  it('starts at the data step and never auto-scrolls on load', () => {
    renderChooser();
    expect(screen.getByText('Your data')).toBeInTheDocument();
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
  });

  it('fast path: pasting a simple table renders zero questions', async () => {
    renderChooser();
    pasteTable(TSV);
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
    pasteTable(TSV);
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

  it('skips the variable-count question for shapes it cannot change', async () => {
    renderChooser();
    fireEvent.click(screen.getByText('I don’t have data yet'));
    fireEvent.click(await screen.findByText('The relationship between two measures'));
    // vars is a dead rung for 'relationship' — straight to emphasis.
    expect(await screen.findByText('What should the figure emphasise?')).toBeInTheDocument();
    expect(screen.queryByText('How many variables?')).not.toBeInTheDocument();
  });

  it('typing a table character by character never advances the ladder', () => {
    renderChooser();
    const box = screen.getByLabelText('Paste your table');
    // The exact reproduction from review: "A," parsed as a 1×2 table
    // and unmounted the textarea under the cursor.
    for (const value of ['A', 'A,', 'A,B', 'A,B\n', 'A,B\n1', 'A,B\n1,', 'A,B\n1,2']) {
      fireEvent.change(box, { target: { value } });
      expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
      // Typed text persists — the textarea is controlled.
      expect((screen.getByLabelText('Paste your table') as HTMLTextAreaElement).value).toBe(value);
    }
  });

  it('commits a typed table on blur once it has a data row', async () => {
    renderChooser();
    typeTable('Condition,Score\nControl,4\nDrug,7');
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
  });

  it('stays silent while a half-typed row sits in the box', () => {
    renderChooser();
    typeTable('Condition,Score');
    // Not an error yet — the user is still typing. Blur must not
    // scold them, and must not advance the ladder either.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
  });

  it('rejects a single line on explicit commit rather than inventing columns', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), {
      target: { value: 'Condition,Score' },
    });
    fireEvent.click(screen.getByText('Use this table'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn’t find any rows/i);
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
  });

  it('commits a typed table from the explicit button', async () => {
    renderChooser();
    fireEvent.change(screen.getByLabelText('Paste your table'), {
      target: { value: 'Condition,Score\nControl,4\nDrug,7' },
    });
    fireEvent.click(screen.getByText('Use this table'));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
  });

  it('withholds the success confirmation when the action fails', async () => {
    render(
      <ChartChooser
        layout="panel"
        palette={palette}
        fontFamily="Georgia, serif"
        actions={[
          {
            label: 'Download SVG',
            primary: true,
            run: () => Promise.reject(new Error('render failed')),
          },
        ]}
        confirmation="Saved — vector SVG scales to any print size"
      />,
    );
    pasteTable(TSV);
    const download = (await screen.findAllByText('Download SVG'))[0]!;
    fireEvent.click(download);
    await waitFor(() => {
      expect(screen.queryByText(/Saved — vector SVG/)).not.toBeInTheDocument();
    });
  });

  it('confirms only after an async action resolves', async () => {
    render(
      <ChartChooser
        layout="panel"
        palette={palette}
        fontFamily="Georgia, serif"
        actions={[{ label: 'Download SVG', primary: true, run: () => Promise.resolve() }]}
        confirmation="Saved — vector SVG scales to any print size"
      />,
    );
    pasteTable(TSV);
    const download = (await screen.findAllByText('Download SVG'))[0]!;
    fireEvent.click(download);
    expect(await screen.findByText(/Saved — vector SVG/)).toBeInTheDocument();
  });

  it('refuses oversized pastes and truncates only on explicit consent', async () => {
    renderChooser();
    const big = ['x\ty', ...Array.from({ length: CHART_MAX_ROWS + 10 }, (_, i) => `g${i}\t${i}`)].join('\n');
    pasteTable(big);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/2,000/);
    fireEvent.click(screen.getByText(/Use the first 2,000 rows/));
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect(screen.getByText(/first 2,000 rows/)).toBeInTheDocument();
  });

  it('shows a friendly message for prose pastes', async () => {
    renderChooser();
    pasteTable('just a sentence\nand another sentence\nno table here');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/paste cells/i);
  });

  it('reopening the data step invalidates everything below it', async () => {
    renderChooser();
    pasteTable(TSV);
    await screen.findByText('Pick your figure');
    fireEvent.click(screen.getByText('▸ change'));
    expect(screen.queryByText('Pick your figure')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Paste your table')).toBeInTheDocument();
  });

  it('asks the measure question when several numeric columns exist', async () => {
    renderChooser();
    pasteTable('Group\tAge\tScore\nA\t31\t55\nB\t29\t61\nC\t35\t48');
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
    pasteTable(TSV);
    await screen.findByText('Pick your figure');
    await waitFor(() => {
      expect(document.querySelector('figure svg')).not.toBeNull();
    });
  });
});
