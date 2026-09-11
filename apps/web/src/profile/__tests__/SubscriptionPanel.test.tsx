/**
 * SubscriptionPanel — refund outcome must match the row the server just
 * wrote (P0-1 client half).
 *
 * POST /billing/refund on a term cancels the Stripe subscription
 * immediately and drops the user to the free plan, answering
 * `subscription_cancelled: true`. The panel must (a) say so — the money
 * line alone hides that export is locked again — and (b) `plan.refresh()`
 * so it re-renders into the free state instead of still offering
 * "Request refund" on a cancelled term (a second click would re-run the
 * refund route and report "Refunded" again). A pack refund refreshes too,
 * so the balance and the refund button update at once.
 *
 * Owner's rule (2026-09-11): a pack is refunded in FULL and only while no
 * credit has been consumed — the button is "Refund export pack" (never a
 * per-credit amount) and the server's `already_used` gets pack wording.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PlanState } from '@/hooks/usePlan';
import { ApiError } from '@/lib/apiClient';

const billing = vi.hoisted(() => ({
  openBillingPortal: vi.fn(async () => 'https://link.com'),
  requestRefund: vi.fn(),
}));
vi.mock('@/data/billing', () => billing);

import { SubscriptionPanel } from '../SubscriptionPanel';

function plan(over: Partial<PlanState> = {}): PlanState {
  return {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    reviewCredits: 0,
    hasReviewAddon: false,
    canReview: false,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active',
    refresh: vi.fn(async () => ({}) as never),
    applyCredits: vi.fn(),
    ...over,
  };
}

function renderPanel(p: PlanState) {
  return render(
    <MemoryRouter>
      <SubscriptionPanel plan={p} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubscriptionPanel — term refund', () => {
  it('says the term is cancelled and export is locked, then refreshes the plan', async () => {
    billing.requestRefund.mockResolvedValue({ amountCents: 1899, subscriptionCancelled: true });
    const p = plan();
    renderPanel(p);

    fireEvent.click(screen.getByRole('button', { name: /request refund/i }));

    expect(await screen.findByText(/Refunded CA\$18\.99/)).toBeInTheDocument();
    expect(screen.getByText(/term has been cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/PowerPoint\/LaTeX export is locked again/i)).toBeInTheDocument();
    expect(billing.requestRefund).toHaveBeenCalledWith('term');
    await waitFor(() => expect(p.refresh).toHaveBeenCalledTimes(1));
  });

  it('maps a known eligibility reason and never shows raw error text', async () => {
    billing.requestRefund.mockRejectedValue(
      new ApiError('already_used', 409, { error: 'already_used' }),
    );
    const p = plan();
    renderPanel(p);

    fireEvent.click(screen.getByRole('button', { name: /request refund/i }));

    expect(await screen.findByText(/isn’t refundable once you’ve taken a paid export/i)).toBeInTheDocument();
    expect(screen.queryByText(/already_used/)).toBeNull();
    expect(p.refresh).not.toHaveBeenCalled();
  });
});

describe('SubscriptionPanel — pack refund', () => {
  it('reports the amount without a cancellation line and refreshes the balance', async () => {
    billing.requestRefund.mockResolvedValue({ amountCents: 999, subscriptionCancelled: false });
    const p = plan({ hasActiveTerm: false, credits: 3, canExport: true, subscriptionStatus: null });
    renderPanel(p);

    fireEvent.click(screen.getByRole('button', { name: /refund export pack/i }));

    expect(await screen.findByText(/Refunded CA\$9\.99/)).toBeInTheDocument();
    expect(screen.queryByText(/term has been cancelled/i)).toBeNull();
    expect(billing.requestRefund).toHaveBeenCalledWith('pack');
    await waitFor(() => expect(p.refresh).toHaveBeenCalledTimes(1));
  });

  it('states the all-or-nothing rule next to the button — never a per-credit amount', () => {
    renderPanel(plan({ hasActiveTerm: false, credits: 2, canExport: true, subscriptionStatus: null }));

    expect(screen.getByRole('button', { name: /refund export pack/i })).toBeInTheDocument();
    expect(screen.getByText(/refundable in full \(CA\$9\.99\) only if you haven’t taken a paid export/i)).toBeInTheDocument();
    expect(screen.queryByText(/unused credit/i)).toBeNull();
    expect(screen.queryByText(/3\.33/)).toBeNull();
  });

  it('maps already_used to pack wording (a consumed credit blocks the whole refund) and never shows raw error text', async () => {
    billing.requestRefund.mockRejectedValue(
      new ApiError('already_used', 409, { error: 'already_used' }),
    );
    const p = plan({ hasActiveTerm: false, credits: 2, canExport: true, subscriptionStatus: null });
    renderPanel(p);

    fireEvent.click(screen.getByRole('button', { name: /refund export pack/i }));

    expect(await screen.findByText(/This pack isn’t refundable once you’ve taken a paid export — not even in part/i)).toBeInTheDocument();
    expect(screen.queryByText(/This term isn’t refundable/i)).toBeNull();
    expect(screen.queryByText(/already_used/)).toBeNull();
    expect(p.refresh).not.toHaveBeenCalled();
  });
});
