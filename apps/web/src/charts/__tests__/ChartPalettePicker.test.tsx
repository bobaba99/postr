import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChartSpec } from '@postr/shared';
import { ChartPalettePicker } from '../ChartPalettePicker';

function specWithSeries(n: number, seriesPaletteId?: string): ChartSpec {
  const rows = Array.from({ length: n }, (_, i) => [`Group ${i}`, i + 1]);
  return {
    version: 1,
    form: 'bar',
    data: {
      columns: [
        { name: 'grp', kind: 'category' },
        { name: 'val', kind: 'number' },
      ],
      rows,
    },
    encoding: { x: 'grp', y: 'val', series: 'grp' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' },
    paletteSlots: ['accent', 'accent2'],
    ...(seriesPaletteId ? { seriesPaletteId } : {}),
  } as ChartSpec;
}

describe('ChartPalettePicker', () => {
  it('renders the "Poster theme (default)" reset option, selected when no id', () => {
    render(<ChartPalettePicker spec={specWithSeries(3)} onChange={() => {}} />);
    const reset = screen.getByRole('button', { name: /poster theme \(default\)/i });
    expect(reset.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers exact-size palettes for the series count', () => {
    render(<ChartPalettePicker spec={specWithSeries(3)} onChange={() => {}} />);
    // A known 3-colour Simplified Science set should be present.
    expect(screen.getByRole('button', { name: /blue . orange . gray/i })).toBeTruthy();
  });

  it('calls onChange with the id when a palette is picked', () => {
    const onChange = vi.fn();
    render(<ChartPalettePicker spec={specWithSeries(6)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /contrasting six/i }));
    expect(onChange).toHaveBeenCalledWith('qualitative-6');
  });

  it('calls onChange with undefined when the reset option is picked', () => {
    const onChange = vi.fn();
    render(<ChartPalettePicker spec={specWithSeries(6, 'qualitative-6')} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /poster theme \(default\)/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows a stale-id note and selects the reset option', () => {
    render(<ChartPalettePicker spec={specWithSeries(6, 'no-such-palette')} onChange={() => {}} />);
    expect(screen.getByText(/no longer available/i)).toBeTruthy();
    const reset = screen.getByRole('button', { name: /poster theme \(default\)/i });
    expect(reset.getAttribute('aria-pressed')).toBe('true');
  });
});
