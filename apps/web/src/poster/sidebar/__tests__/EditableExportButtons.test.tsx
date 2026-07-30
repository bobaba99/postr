/**
 * Anonymous export gate.
 *
 * Editable exports must not run for a guest — clicking an export button
 * opens the SecureWorkModal (reason "export") and the writer job never
 * fires, so the poster is secured to a real account before any file is
 * produced. A permanent user with an entitlement is unaffected: the
 * writer runs exactly as before and no modal appears. That second case
 * pins the "same editor" invariant — the logged-in export path is
 * unchanged.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { EditableExportButtons } from '../EditableExportButtons';
import { usePosterStore } from '@/stores/posterStore';

// The PPTX writer job — the assertion is that it is NOT called for a
// guest, and IS called for a permanent user. A resolved value keeps the
// permanent-user path from throwing when it does run.
const exportPptxMock = vi.fn(async () => ({
  bytes: new Uint8Array([1, 2, 3]),
  note: null,
  warnings: [] as string[],
}));
vi.mock('@/export/pptx/writer', () => ({
  exportPosterPptx: (...args: unknown[]) => exportPptxMock(...(args as [])),
}));
vi.mock('@/export/posterContent', () => ({ safeFileBaseName: () => 'poster' }));

// The billing client must never be reached in either case here.
vi.mock('@/data/billing', () => ({
  createCheckout: vi.fn(),
  consumeExportCredit: vi.fn(),
  markPaidExport: vi.fn(),
}));

// The plan is swapped per-test via this mutable holder.
const planState = {
  value: {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active' as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => planState.value,
}));

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

describe('EditableExportButtons — anonymous export gate', () => {
  beforeEach(() => {
    exportPptxMock.mockClear();
    seedPoster();
    // jsdom has no real download plumbing.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true, value: () => 'blob:test',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true, writable: true, value: () => {},
    });
  });

  it('guest → clicking export opens the secure-work modal and does NOT run the export', async () => {
    // A REAL guest: no term, no credits (canExport false). The export
    // button is still clickable for a guest — the click is what trips the
    // secure-work modal (their gate is account creation, not the paywall).
    planState.value = {
      loading: false, hasActiveTerm: false, credits: 0,
      canExport: false, isGuest: true, subscriptionStatus: null,
    };
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    const pptxBtn = screen.getByText('▤ PowerPoint (.pptx)').closest('button')!;
    // The button must be enabled for a guest, or the click can't reach the gate.
    expect(pptxBtn.disabled).toBe(false);
    // And the payment/upgrade block is not shown to a guest.
    expect(screen.queryByText(/Keep editing in PowerPoint or Overleaf/i)).toBeNull();

    fireEvent.click(pptxBtn);

    expect(
      screen.getByRole('dialog', { name: /create an account to export/i }),
    ).toBeInTheDocument();
    // The writer job never fired — nothing was produced.
    expect(exportPptxMock).not.toHaveBeenCalled();
  });

  it('permanent user → export runs and no modal appears (same editor invariant)', async () => {
    planState.value = {
      loading: false, hasActiveTerm: true, credits: 0,
      canExport: true, isGuest: false, subscriptionStatus: 'active',
    };
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    await waitFor(() => expect(exportPptxMock).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', { name: /create an account to export/i }),
    ).toBeNull();
  });
});
