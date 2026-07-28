/**
 * VariablesStep — the mobile declaration form.
 *
 * This path exists because pasting a table on a phone is miserable, so
 * the mobile affordances are the feature, not a detail: every control
 * has to clear the 44px target floor and the one text field has to sit
 * at 16px or iOS Safari zooms the viewport on focus and throws the
 * user out of the ladder mid-declaration.
 *
 * jsdom does not lay out, so `minHeight` is the honest proxy for "at
 * least this tall"; real geometry is verified in Chromium via
 * apps/web/scripts/mobile-audit.mjs.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChartChooser } from '../ChartChooser';
import { VariablesStep, describeVariables } from '../VariablesStep';
import type { Palette } from '@postr/shared';
import type { DeclaredVariable } from '../../declaredVariables';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};

/** WCAG 2.5.5 / Apple HIG minimum target size, in CSS px. */
const TARGET_FLOOR = 44;

/** iOS Safari zooms a focused input below this. */
const NO_ZOOM_FONT = 16;

const heightOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).minHeight || '0');

describe('VariablesStep — mobile affordances', () => {
  it('keeps every control at or above the 44px target floor', () => {
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('textbox')];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(heightOf(control)).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }
  });

  it('keeps the name field at 16px so iOS does not zoom on focus', () => {
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);
    for (const field of screen.getAllByRole('textbox')) {
      expect(parseFloat(getComputedStyle(field).fontSize)).toBeGreaterThanOrEqual(NO_ZOOM_FONT);
    }
  });
});

describe('VariablesStep — declaring a design', () => {
  it('starts with one outcome and one factor already scaffolded', () => {
    // The commonest design is "one thing measured across one thing
    // compared", so the form opens ready to submit rather than empty.
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /show me the figure/i })).toBeEnabled();
  });

  it('hands the declared variables back on submit', () => {
    const onDeclare = vi.fn();
    render(<VariablesStep onDeclare={onDeclare} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Variable 1 name'), {
      target: { value: 'Reaction time' },
    });
    fireEvent.change(screen.getByLabelText('Variable 2 name'), {
      target: { value: 'Caffeine dose' },
    });
    fireEvent.click(screen.getByRole('button', { name: /show me the figure/i }));

    expect(onDeclare).toHaveBeenCalledTimes(1);
    const declared = onDeclare.mock.calls[0]![0] as readonly DeclaredVariable[];
    expect(declared.map((v) => v.name)).toEqual(['Reaction time', 'Caffeine dose']);
    expect(declared.map((v) => v.role)).toEqual(['outcome', 'factor']);
  });

  it('blocks submission when nothing numeric was measured', () => {
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);

    // Turn the only outcome into a factor — now there is nothing to plot.
    const roleGroups = screen.getAllByRole('group', { name: 'What is it?' });
    fireEvent.click(within(roleGroups[0]!).getByRole('button', { name: /compared/i }));

    expect(screen.getByRole('button', { name: /show me the figure/i })).toBeDisabled();
    // Under-specified is explained, never silently rejected.
    expect(screen.getByText(/at least one measured variable/i)).toBeInTheDocument();
  });

  it('shows the level question only for a categorical factor', () => {
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('group', { name: /how many groups/i })).toBeInTheDocument();

    // An ordered factor has no level count to ask about.
    const typeGroups = screen.getAllByRole('group', { name: 'Type' });
    fireEvent.click(within(typeGroups[1]!).getByRole('button', { name: /time \/ order/i }));
    expect(screen.queryByRole('group', { name: /how many groups/i })).not.toBeInTheDocument();
  });

  it('caps the number of declared variables', () => {
    render(<VariablesStep onDeclare={vi.fn()} onCancel={vi.fn()} />);
    // Two are scaffolded; adding two more reaches the cap and the add
    // affordances retire rather than accepting a declaration the
    // recommender would have to refuse.
    fireEvent.click(screen.getByRole('button', { name: /something compared/i }));
    fireEvent.click(screen.getByRole('button', { name: /something measured/i }));
    expect(screen.queryByRole('button', { name: /something compared/i })).not.toBeInTheDocument();
  });
});

describe('describeVariables', () => {
  it('reads back the design shape in the ladder summary', () => {
    const v = (role: DeclaredVariable['role']): DeclaredVariable => ({
      id: role,
      name: '',
      role,
      type: 'continuous',
    });
    expect(describeVariables([v('outcome'), v('factor')])).toBe('1 outcome × 1 factor');
    expect(describeVariables([v('outcome')])).toBe('1 outcome × 0 factors');
  });
});

describe('ChartChooser — the declared path end to end', () => {
  it('reaches a ranked figure from declared variables alone', async () => {
    render(
      <ChartChooser
        layout="page"
        palette={palette}
        fontFamily="serif"
        actions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /list my variables/i }));
    fireEvent.change(screen.getByLabelText('Variable 1 name'), {
      target: { value: 'Reaction time' },
    });
    fireEvent.change(screen.getByLabelText('Variable 2 name'), { target: { value: 'Dose' } });
    fireEvent.click(screen.getByRole('button', { name: /show me the figure/i }));

    // Repeated observations per group make bars and boxes tie, so the
    // ladder asks the emphasis question — exactly as it would for an
    // equivalent pasted table. Answering it is part of the real flow.
    fireEvent.click(await screen.findByText('Difference between groups'));

    // A recommendation actually appears — the whole point of the path.
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect(screen.getByText('Bar chart')).toBeInTheDocument();
    // And the invented numbers are labelled as such, so nobody mistakes
    // the preview for their own results.
    expect(screen.getAllByText(/sample data/i).length).toBeGreaterThan(0);
  });

  it('can back out of the form to the paste affordances', () => {
    render(
      <ChartChooser
        layout="page"
        palette={palette}
        fontFamily="serif"
        actions={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /list my variables/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByLabelText(/paste your table/i)).toBeInTheDocument();
  });
});
