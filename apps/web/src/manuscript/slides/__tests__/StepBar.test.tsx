/**
 * Task 7 tests — the foldable step-bar (spec §2, left-bar design).
 *
 * The step-bar is the wizard's spine: one foldable card per step,
 * documenting the user's input as it accrues. These assertions lock the
 * two load-bearing behaviours — that every wizard step is present as a
 * clickable header, and that clicking a header asks the parent to toggle
 * exactly that step (navigation + fold state live in the parent).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StepBar } from '../StepBar';
import { WIZARD_STEPS } from '../stepConfig';

describe('StepBar', () => {
  it('renders every wizard step as a card header button', () => {
    render(
      <StepBar
        activeStep="narrative"
        onToggle={() => {}}
        openSteps={[]}
        inputSummary={{}}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(WIZARD_STEPS.length);
  });

  it('calls onToggle with the step id when a card header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <StepBar
        activeStep="constraints"
        onToggle={onToggle}
        openSteps={[]}
        inputSummary={{}}
      />,
    );
    fireEvent.click(screen.getByText(/constraints/i));
    expect(onToggle).toHaveBeenCalledWith('constraints');
  });
});
