/**
 * Loading feedback for the editable exports.
 *
 * Both writers are dynamic imports — the first PPTX click pays a
 * ~368 kB pptxgenjs chunk fetch before a single slide is written, so
 * "no feedback until the file lands" reads as a dead button.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditableExportButtons } from '../sidebar/EditableExportButtons';
import { usePosterStore } from '@/stores/posterStore';

const gate: { release?: () => void } = {};

vi.mock('@/export/pptx/writer', () => ({
  exportPosterPptx: () =>
    new Promise((resolve) => {
      gate.release = () =>
        resolve({ bytes: new Uint8Array([1, 2, 3]), note: null, warnings: [] });
    }),
}));

vi.mock('@/export/posterContent', () => ({
  safeFileBaseName: () => 'poster',
}));

function seedPoster() {
  usePosterStore.setState({
    doc: {
      widthIn: 36,
      heightIn: 24,
      blocks: [],
      palette: {
        bg: '#fff',
        primary: '#000',
        accent: '#123456',
        accent2: '#654321',
        muted: '#888',
        headerBg: '#000',
        headerFg: '#fff',
      },
    },
    posterTitle: 'Test poster',
  } as never);
}

describe('EditableExportButtons loading feedback', () => {
  beforeEach(() => {
    seedPoster();
    delete gate.release;
    // jsdom has no real download plumbing.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => 'blob:test',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  });

  it('shows a worded, animated indicator the moment PPTX export starts', async () => {
    render(<EditableExportButtons citationStyle="APA 7" />);
    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    // Immediate: the label appears before the chunk resolves.
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Building slides…');

    // The animated dot is the class the reduced-motion rules target.
    expect(document.querySelector('.postr-busy-dot')).not.toBeNull();
  });

  it('marks the export region busy while a writer runs', async () => {
    const { container } = render(<EditableExportButtons citationStyle="APA 7" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    await waitFor(() => expect(gate.release).toBeDefined());
    gate.release!();
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('disables both exports while one is in flight', async () => {
    render(<EditableExportButtons citationStyle="APA 7" />);
    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    await waitFor(() => {
      expect(
        (screen.getByText('⌨ LaTeX source (.zip)').closest('button') as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });
});
