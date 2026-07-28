/**
 * Paywall behavior for the editable exports.
 *
 * Editable exports (PPTX/LaTeX) are the paid line. A user with no active
 * term and no credits sees the upgrade prompt and disabled buttons; a
 * paid user sees enabled buttons and no prompt. These pin that gate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditableExportButtons } from '../sidebar/EditableExportButtons';
import { usePosterStore } from '@/stores/posterStore';

// The plan is swapped per-test via this mutable holder.
const planState = {
  value: { loading: false, hasActiveTerm: false, credits: 0, canExport: false },
};
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => planState.value,
}));
vi.mock('@/data/billing', () => ({
  createCheckout: vi.fn(),
  consumeExportCredit: vi.fn(),
}));
vi.mock('@/export/posterContent', () => ({ safeFileBaseName: () => 'poster' }));

function seedPoster() {
  usePosterStore.setState({
    doc: {
      widthIn: 36,
      heightIn: 24,
      blocks: [],
      palette: {
        bg: '#fff', primary: '#000', accent: '#123456', accent2: '#654321',
        muted: '#888', headerBg: '#000', headerFg: '#fff',
      },
    },
    posterTitle: 'Test poster',
  } as never);
}

beforeEach(() => {
  seedPoster();
  planState.value = { loading: false, hasActiveTerm: false, credits: 0, canExport: false };
});

describe('EditableExportButtons — paywall', () => {
  it('free user (no term, no credits) sees the upgrade prompt and disabled buttons', () => {
    render(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.getByText(/Keep editing in PowerPoint or Overleaf/i)).toBeTruthy();
    expect(screen.getByText(/Get the term/i)).toBeTruthy();
    expect(screen.getByText(/Get the pack/i)).toBeTruthy();
    // Both export buttons are disabled.
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    const latex = document.querySelector('[data-postr-export-latex]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(true);
    expect(latex.disabled).toBe(true);
  });

  it('term holder sees enabled buttons and NO upgrade prompt', () => {
    planState.value = { loading: false, hasActiveTerm: true, credits: 0, canExport: true };
    render(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint or Overleaf/i)).toBeNull();
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(false);
  });

  it('pack holder sees the remaining-credit count and enabled buttons', () => {
    planState.value = { loading: false, hasActiveTerm: false, credits: 2, canExport: true };
    render(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint or Overleaf/i)).toBeNull();
    expect(screen.getByText(/2 exports left in your pack/i)).toBeTruthy();
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(false);
  });

  it('while the plan is loading, the prompt does not flash', () => {
    planState.value = { loading: true, hasActiveTerm: false, credits: 0, canExport: false };
    render(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint or Overleaf/i)).toBeNull();
  });
});
