/**
 * CopyDesignModal — plan §6 component coverage:
 *   - the toggle matrix applies EXACTLY the selected subsets
 *   - apply is a single undo step
 *   - low confidence pre-selects colours only and says so
 *   - a failed vision call still offers colours-only
 *
 * The extraction pipeline is mocked; the store is the real Zustand
 * store so undo behaviour is exercised end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import type { StyleImportResult } from '@/import/styleImport';
import { CopyDesignModal } from '../CopyDesignModal';

vi.mock('@/import/styleImport', async () => {
  const actual =
    await vi.importActual<typeof import('@/import/styleImport')>(
      '@/import/styleImport',
    );
  return {
    ...actual,
    extractStyleFromFile: vi.fn(),
  };
});

import { extractStyleFromFile } from '@/import/styleImport';

const mockExtract = vi.mocked(extractStyleFromFile);

const ORIGINAL_PALETTE = {
  bg: '#FFFFFF',
  primary: '#1A1A2E',
  accent: '#0F4C75',
  accent2: '#3282B8',
  muted: '#6C757D',
  headerBg: '#0F4C75',
  headerFg: '#FFFFFF',
};

const COPIED_PALETTE = {
  bg: '#FAFDF7',
  primary: '#1B3A2D',
  accent: '#2D6A4F',
  accent2: '#52B788',
  muted: '#5A6E5F',
  headerBg: '#2D6A4F',
  headerFg: '#FFFFFF',
};

function makeDoc(): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [
      {
        id: 'b1',
        type: 'title',
        x: 20,
        y: 10,
        w: 440,
        h: 30,
        content: 'Sample poster title',
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
    ],
    fontFamily: 'Source Sans 3',
    palette: { ...ORIGINAL_PALETTE },
    styles: {
      title: { size: 14, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
      heading: { size: 8, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
      authors: { size: 5, weight: 400, italic: false, lineHeight: 1.15, color: null, highlight: null },
      body: { size: 5, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
  };
}

function successResult(
  overrides: Partial<StyleImportResult> = {},
): StyleImportResult {
  return {
    extracted: {
      version: 1,
      fontFamily: 'Lora',
      palette: { ...COPIED_PALETTE },
      confidence: 0.9,
    },
    palette: { ...COPIED_PALETTE },
    coloursOnly: false,
    visionError: null,
    ...overrides,
  };
}

async function openAndDrop(result: StyleImportResult) {
  mockExtract.mockResolvedValue(result);
  render(<CopyDesignModal open onClose={() => {}} />);

  const dropzone = screen.getByText(/drop a poster here/i).parentElement!;
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [new File(['x'], 'poster.png', { type: 'image/png' })] },
  });

  await waitFor(() =>
    expect(screen.getByText('With copied style')).toBeInTheDocument(),
  );
}

function applyButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /apply/i,
  }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  usePosterStore.getState().setPoster('poster-1', makeDoc());
});

describe('CopyDesignModal', () => {
  it('applies colours + font as ONE undo step', async () => {
    await openAndDrop(successResult());

    fireEvent.click(applyButton());

    const applied = usePosterStore.getState();
    expect(applied.doc?.palette).toEqual(COPIED_PALETTE);
    expect(applied.doc?.fontFamily).toBe('Lora');
    expect(applied.canUndo).toBe(true);

    usePosterStore.getState().undo();
    const reverted = usePosterStore.getState();
    expect(reverted.doc?.palette).toEqual(ORIGINAL_PALETTE);
    expect(reverted.doc?.fontFamily).toBe('Source Sans 3');
    expect(reverted.canUndo).toBe(false);
  });

  it('applies ONLY colours when the font toggle is off', async () => {
    await openAndDrop(successResult());

    fireEvent.click(screen.getByRole('checkbox', { name: /font/i }));
    fireEvent.click(applyButton());

    const applied = usePosterStore.getState();
    expect(applied.doc?.palette).toEqual(COPIED_PALETTE);
    expect(applied.doc?.fontFamily).toBe('Source Sans 3');
  });

  it('applies ONLY the font when the colours toggle is off', async () => {
    await openAndDrop(successResult());

    fireEvent.click(screen.getByRole('checkbox', { name: /colours/i }));
    fireEvent.click(applyButton());

    const applied = usePosterStore.getState();
    expect(applied.doc?.palette).toEqual(ORIGINAL_PALETTE);
    expect(applied.doc?.fontFamily).toBe('Lora');
  });

  it('disables Apply when nothing is selected', async () => {
    await openAndDrop(successResult());

    fireEvent.click(screen.getByRole('checkbox', { name: /colours/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /font/i }));

    expect(applyButton()).toBeDisabled();
  });

  it('pre-selects colours only and says so on low confidence', async () => {
    await openAndDrop(
      successResult({
        extracted: {
          version: 1,
          fontFamily: 'Lora',
          palette: { ...COPIED_PALETTE },
          confidence: 0.3,
        },
      }),
    );

    expect(screen.getByText(/we weren't sure about this one/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /colours/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /font/i })).not.toBeChecked();
  });

  it('offers colours-only when the vision call failed', async () => {
    await openAndDrop(
      successResult({
        extracted: null,
        coloursOnly: true,
        visionError: new Error('vision_call_failed'),
      }),
    );

    expect(
      screen.getByText(/something went wrong reading the full design/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send feedback/i }),
    ).toBeInTheDocument();

    const fontToggle = screen.getByRole('checkbox', { name: /font/i });
    expect(fontToggle).toBeDisabled();

    fireEvent.click(applyButton());
    const applied = usePosterStore.getState();
    expect(applied.doc?.palette).toEqual(COPIED_PALETTE);
    expect(applied.doc?.fontFamily).toBe('Source Sans 3');
  });

  it('shows the user-actionable message for unreadable files', async () => {
    const { StyleImportError } = await vi.importActual<
      typeof import('@/import/styleImport')
    >('@/import/styleImport');
    mockExtract.mockRejectedValue(
      new StyleImportError(
        'rasterize_failed',
        "That doesn't look like a poster — try a photo or PDF of the whole thing.",
      ),
    );
    render(<CopyDesignModal open onClose={() => {}} />);

    const dropzone = screen.getByText(/drop a poster here/i).parentElement!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    await waitFor(() =>
      expect(
        screen.getByText(/doesn't look like a poster/i),
      ).toBeInTheDocument(),
    );
    // Back on the pick phase, not an error dialog.
    expect(screen.getByText(/drop a poster here/i)).toBeInTheDocument();
  });
});
