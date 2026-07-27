/**
 * Loading feedback for the chart chooser's data step.
 *
 * The parse path is async (CSV reads the File; .xlsx additionally
 * lazy-loads `read-excel-file`, so the first upload pays a chunk
 * fetch). These tests pin the contract that the user sees something
 * immediately and hears about it, rather than clicking into silence.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DataStep } from '../ladder/DataStep';

/**
 * A File whose text() we resolve by hand, so the "in flight" window
 * stays open long enough to assert on.
 */
function gatedCsvFile() {
  let release!: (text: string) => void;
  const gate = new Promise<string>((resolve) => {
    release = resolve;
  });
  const file = new File(['placeholder'], 'results.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => gate });
  return { file, release: () => release('Group,Score\nA,4\nB,7') };
}

function dropFile(file: File) {
  const zone = screen.getByLabelText('Paste your table').parentElement!;
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

describe('DataStep loading feedback', () => {
  it('shows an immediate, worded indicator while a file is being read', async () => {
    const { file, release } = gatedCsvFile();
    render(<DataStep posterTables={[]} onTable={vi.fn()} onSynthetic={vi.fn()} />);

    dropFile(file);

    // Words, not just a spinner — and announced politely.
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reading your file…');
    expect(status.getAttribute('aria-live')).toBe('polite');

    release();
    await waitFor(() => {
      expect(screen.queryByText('Reading your file…')).not.toBeInTheDocument();
    });
  });

  it('marks the step busy so assistive tech knows it is mid-update', async () => {
    const { file, release } = gatedCsvFile();
    const { container } = render(
      <DataStep posterTables={[]} onTable={vi.fn()} onSynthetic={vi.fn()} />,
    );

    dropFile(file);
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    release();
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('disables the upload controls while a read is in flight', async () => {
    const { file, release } = gatedCsvFile();
    render(<DataStep posterTables={[]} onTable={vi.fn()} onSynthetic={vi.fn()} />);

    dropFile(file);
    await waitFor(() => {
      expect((screen.getByText('Upload CSV or Excel') as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
    expect((screen.getByText('I don’t have data yet') as HTMLButtonElement).disabled).toBe(
      true,
    );

    release();
    await waitFor(() => {
      expect((screen.getByText('Upload CSV or Excel') as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
  });

  it('clears the indicator even when the read fails', async () => {
    const file = new File(['x'], 'broken.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', {
      value: () => Promise.reject(new Error('unreadable')),
    });
    render(<DataStep posterTables={[]} onTable={vi.fn()} onSynthetic={vi.fn()} />);

    dropFile(file);

    // The failure message replaces the busy state — never both, and
    // never a stuck indicator.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/something went wrong/i);
    expect(screen.queryByText('Reading your file…')).not.toBeInTheDocument();
  });
});
