import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingResult from '../BillingResult';

const planState = vi.hoisted(() => ({
  value: {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 3,
    hasReviewAddon: false,
    canReview: true,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null as string | null,
  },
}));

const refreshSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => planState.value,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: refreshSessionMock,
    },
  },
}));

describe('BillingResult review checkout confirmation', () => {
  beforeEach(() => {
    refreshSessionMock.mockReset();
    Object.assign(planState.value, {
      hasActiveTerm: false,
      credits: 0,
      reviewCredits: 3,
      hasReviewAddon: false,
      canReview: true,
      canExport: false,
    });
  });

  it('recognizes a fulfilled review pack instead of saying access is still processing', () => {
    render(
      <MemoryRouter>
        <BillingResult outcome="success" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        'Your review pack is ready — 3 reviews to use whenever. Review credits never expire.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/finalizing your account/i)).not.toBeInTheDocument();
  });

  it('names the weekly review add-on when it is fulfilled on an active term', () => {
    Object.assign(planState.value, {
      hasActiveTerm: true,
      reviewCredits: 0,
      hasReviewAddon: true,
      canExport: true,
    });

    render(
      <MemoryRouter>
        <BillingResult outcome="success" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        'Your weekly review add-on is active. Your review quota refreshes every week while your term stays active.',
      ),
    ).toBeInTheDocument();
  });
});
