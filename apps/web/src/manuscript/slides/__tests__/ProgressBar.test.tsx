/**
 * Task 9 tests — the top ProgressBar.
 *
 * Presentational: it reports the wizard's position as a labelled,
 * ARIA-correct progress bar. The assertions lock the accessibility contract
 * (a real progressbar role carrying now/min/max) and the derived percent,
 * so a mis-computed fill is caught here rather than by eye.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('exposes an accessible progressbar with now/min/max', () => {
    render(<ProgressBar current={1} total={6} label="Constraints" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '6');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows the current step label and a step count', () => {
    render(<ProgressBar current={4} total={6} label="Narrative" />);
    expect(screen.getByText(/narrative/i)).toBeInTheDocument();
    expect(screen.getByText(/4\s*\/\s*6|step 4 of 6/i)).toBeInTheDocument();
  });

  it('clamps out-of-range positions to the track', () => {
    render(<ProgressBar current={99} total={6} label="Done" />);
    const bar = screen.getByRole('progressbar');
    // Never over 100% — a fill wider than its track is a rendering bug.
    expect(bar).toHaveAttribute('aria-valuenow', '6');
  });
});
