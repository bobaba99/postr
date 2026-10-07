/**
 * Paywall behavior for the editable exports.
 *
 * Editable exports (PowerPoint; the LaTeX export is hidden, fix 25) are
 * the paid line. A user with no active term and no credits sees the
 * upgrade prompt and a disabled button; a paid user sees it enabled and
 * no prompt. These pin that gate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { EditableExportButtons } from '../sidebar/EditableExportButtons';
import { usePosterStore } from '@/stores/posterStore';

// The plan is swapped per-test via this mutable holder.
const planState = {
  value: {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => planState.value,
}));
vi.mock('@/data/billing', () => ({
  createCheckout: vi.fn(),
  consumeExportCredit: vi.fn(),
  openBillingPortal: vi.fn(),
}));
vi.mock('@/export/posterContent', () => ({ safeFileBaseName: () => 'poster' }));

/** Render inside a router — the component uses useNavigate for guest routing. */
function renderInRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

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
  planState.value = { loading: false, hasActiveTerm: false, credits: 0, canExport: false, isGuest: false, subscriptionStatus: null };
});

describe('EditableExportButtons — paywall', () => {
  it('free user (no term, no credits) sees the upgrade prompt and a disabled button', () => {
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.getByText(/Keep editing in PowerPoint/i)).toBeTruthy();
    expect(screen.getByText(/Get the term/i)).toBeTruthy();
    expect(screen.getByText(/Get the pack/i)).toBeTruthy();
    // The export button is disabled (the LaTeX one is not rendered: fix 25).
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(true);
  });

  it('term holder sees enabled buttons and NO upgrade prompt', () => {
    planState.value = { loading: false, hasActiveTerm: true, credits: 0, canExport: true, isGuest: false, subscriptionStatus: "active" };
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint/i)).toBeNull();
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(false);
  });

  it('pack holder sees the remaining-credit count and enabled buttons', () => {
    planState.value = { loading: false, hasActiveTerm: false, credits: 2, canExport: true, isGuest: false, subscriptionStatus: null };
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint/i)).toBeNull();
    expect(screen.getByText(/2 exports left in your pack/i)).toBeTruthy();
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(false);
  });

  it('while the plan is loading, the prompt does not flash', () => {
    planState.value = { loading: true, hasActiveTerm: false, credits: 0, canExport: false, isGuest: false, subscriptionStatus: null };
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.queryByText(/Keep editing in PowerPoint/i)).toBeNull();
  });
});
