/**
 * Credit bookkeeping + duplicate-term guard on the Export tab.
 *
 * H-8: after a credit-based export the balance the server returns is
 * applied to plan state, so the "N exports left" hint decrements and a
 * 1-credit holder cannot export twice on one tab visit. A 409 no_credit
 * zeroes the balance and raises the paywall — the file was already
 * produced, so the export is NOT shown as failed.
 *
 * P0-2 (client): the paywall's "Get the term" maps a 409
 * already_subscribed to "You already have an active term" instead of the
 * generic failure.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState, type ReactElement } from 'react';
import { EditableExportButtons } from '../EditableExportButtons';
import { usePosterStore } from '@/stores/posterStore';
import { AlreadySubscribedError, NoExportCreditError } from '@/data/billing';

vi.mock('@/export/pptx/writer', () => ({
  exportPosterPptx: async () => ({
    bytes: new Uint8Array([1, 2, 3]),
    note: null,
    warnings: [] as string[],
  }),
}));
vi.mock('@/export/posterContent', () => ({ safeFileBaseName: () => 'poster' }));

const billing = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  consumeExportCredit: vi.fn(),
  markPaidExport: vi.fn(),
}));
vi.mock('@/data/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/billing')>();
  return { ...actual, ...billing };
});

// A stateful stand-in for usePlan: applyCredits really updates the
// rendered balance, mirroring the hook's contract, so the hint and the
// paywall respond the way they do in the app.
const planSeed = {
  hasActiveTerm: false,
  credits: 0,
  isGuest: false,
  /** `hasActiveTerm` the server reports on a `refresh()` re-read. */
  refreshedHasActiveTerm: false,
};
const applyCreditsSpy = vi.fn();
const refreshSpy = vi.fn(async () => ({ hasActiveTerm: planSeed.refreshedHasActiveTerm }));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => {
    const [credits, setCredits] = useState(planSeed.credits);
    return {
      loading: false,
      hasActiveTerm: planSeed.hasActiveTerm,
      credits,
      reviewCredits: 0,
      hasReviewAddon: false,
      canReview: false,
      canExport: planSeed.hasActiveTerm || credits > 0,
      isGuest: planSeed.isGuest,
      subscriptionStatus: null,
      refresh: refreshSpy,
      applyCredits: (n: number) => {
        applyCreditsSpy(n);
        setCredits(Math.max(0, n));
      },
    };
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  seedPoster();
  planSeed.hasActiveTerm = false;
  planSeed.credits = 0;
  planSeed.isGuest = false;
  planSeed.refreshedHasActiveTerm = false;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true, writable: true, value: () => 'blob:test',
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true, writable: true, value: () => {},
  });
});

describe('EditableExportButtons — credit balance (H-8)', () => {
  it('applies the returned balance so the "exports left" hint decrements', async () => {
    planSeed.credits = 2;
    billing.consumeExportCredit.mockResolvedValue(1);
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(screen.getByText(/2 exports left in your pack/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    await waitFor(() => expect(applyCreditsSpy).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/1 export left in your pack/i)).toBeInTheDocument();
    expect(screen.queryByText(/Keep editing in PowerPoint or Overleaf/i)).toBeNull();
  });

  it('spending the last credit raises the paywall and disables the buttons', async () => {
    planSeed.credits = 1;
    billing.consumeExportCredit.mockResolvedValue(0);
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    expect(
      await screen.findByText(/Keep editing in PowerPoint or Overleaf/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/export left in your pack/i)).toBeNull();
    const pptx = document.querySelector('[data-postr-export-pptx]') as HTMLButtonElement;
    expect(pptx.disabled).toBe(true);
  });

  it('409 no_credit zeroes the balance and shows the paywall without failing the export', async () => {
    planSeed.credits = 1;
    billing.consumeExportCredit.mockRejectedValue(new NoExportCreditError());
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    await waitFor(() => expect(applyCreditsSpy).toHaveBeenCalledWith(0));
    expect(
      await screen.findByText(/Keep editing in PowerPoint or Overleaf/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a term holder never spends a credit', async () => {
    planSeed.hasActiveTerm = true;
    billing.markPaidExport.mockResolvedValue(undefined);
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByText('▤ PowerPoint (.pptx)'));

    await waitFor(() => expect(billing.markPaidExport).toHaveBeenCalledTimes(1));
    expect(billing.consumeExportCredit).not.toHaveBeenCalled();
    expect(applyCreditsSpy).not.toHaveBeenCalled();
  });
});

describe('EditableExportButtons — duplicate-term guard (P0-2)', () => {
  it('maps 409 already_subscribed to a friendly notice once a fresh plan read confirms the term', async () => {
    billing.createCheckout.mockRejectedValue(new AlreadySubscribedError());
    planSeed.refreshedHasActiveTerm = true;
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByLabelText(/I want access right away/i));
    fireEvent.click(screen.getByText('Get the term'));

    expect(
      await screen.findByText(/You already have an active term/i),
    ).toBeInTheDocument();
    expect(refreshSpy).toHaveBeenCalled();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });

  it('a 409 the fresh plan read contradicts shows the generic failure, not "you already have a term"', async () => {
    billing.createCheckout.mockRejectedValue(new AlreadySubscribedError());
    planSeed.refreshedHasActiveTerm = false;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByLabelText(/I want access right away/i));
    fireEvent.click(screen.getByText('Get the term'));

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
    consoleError.mockRestore();
  });

  it('any other checkout failure keeps the generic message', async () => {
    billing.createCheckout.mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    fireEvent.click(screen.getByLabelText(/I want access right away/i));
    fireEvent.click(screen.getByText('Get the pack'));

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
    expect(screen.queryByText('boom')).toBeNull();
    consoleError.mockRestore();
  });
});

// Owner rule (2026-09-11): the refund rule is in front of the buyer BEFORE
// purchase — one line covering both plans sits directly above the buy
// buttons, and only where the paywall (the buy surface) is shown.
describe('EditableExportButtons — refund rule before purchase (2026-09-11)', () => {
  it('states the term and pack refund rule directly above the buy buttons', () => {
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    const line = screen.getByText(/14 days/);
    expect(line.textContent).toMatch(/first export/i);
    expect(line.textContent).not.toMatch(/\bAI\b/i);
    // Reading order: the rule, then the buttons it governs.
    const termButton = screen.getByText('Get the term');
    expect(
      line.compareDocumentPosition(termButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(line.parentElement).toBe(termButton.closest('div')?.parentElement);
  });

  it('is absent for a credit holder, who sees no paywall', () => {
    planSeed.credits = 2;
    renderInRouter(<EditableExportButtons citationStyle="APA 7" />);

    expect(screen.queryByText(/14 days/)).toBeNull();
    expect(screen.queryByText('Get the pack')).toBeNull();
  });
});
