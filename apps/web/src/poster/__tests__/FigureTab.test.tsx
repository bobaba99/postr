import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Palette } from '@postr/shared';
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

function Harness({
  initialMode = 'make',
  onInsertChart = vi.fn(),
}: {
  initialMode?: FigureMode;
  onInsertChart?: (spec: unknown, caption: string) => void;
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

  it('keeps ladder progress across a mode round-trip', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: TSV } });
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check a figure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make a figure' }));
    // Both modes stay mounted, so the previews are still there.
    expect(screen.getByText('Pick your figure')).toBeVisible();
  });

  it('inserting passes spec + caption up and confirms legibility', async () => {
    const onInsertChart = vi.fn();
    render(<Harness onInsertChart={onInsertChart} />);
    fireEvent.change(screen.getByLabelText('Paste your table'), { target: { value: TSV } });
    const insert = (await screen.findAllByText('Insert this figure'))[0]!;
    fireEvent.click(insert);
    expect(onInsertChart).toHaveBeenCalledTimes(1);
    const [spec, caption] = onInsertChart.mock.calls[0]! as [
      { form: string; version: number },
      string,
    ];
    expect(spec.form).toBe('bar');
    expect(spec.version).toBe(1);
    expect(caption.length).toBeGreaterThan(10);
    expect(
      await screen.findByText(/Inserted — legible at print size/),
    ).toBeInTheDocument();
  });
});
