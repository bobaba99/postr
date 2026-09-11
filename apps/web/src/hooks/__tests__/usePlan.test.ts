/**
 * usePlan — review entitlements derived from the server-owned users
 * columns. Mirrors D4 exactly:
 *
 *   canReview = (hasReviewAddon && hasActiveTerm) || reviewCredits > 0
 *
 * The add-on alone unlocks nothing without an active term; credits
 * stand alone and never expire. The supabase client is module-mocked
 * (the data/__tests__/posters.test.ts convention) — no network.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

let fakeUser: { id: string; is_anonymous?: boolean } | null = { id: 'user-1' };
let nextRow: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: fakeUser }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: nextRow, error: null })),
    })),
  },
}));

import { usePlan } from '../usePlan';

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    plan: null,
    plan_expires_at: null,
    export_credits: 0,
    subscription_status: null,
    review_credits: 0,
    review_addon: false,
    ...overrides,
  };
}

beforeEach(() => {
  fakeUser = { id: 'user-1' };
  nextRow = null;
});

describe('usePlan — review entitlements', () => {
  it('review credits alone unlock canReview (no term, no add-on)', async () => {
    nextRow = row({ review_credits: 2 });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(2);
    expect(result.current.hasReviewAddon).toBe(false);
    expect(result.current.canReview).toBe(true);
  });

  it('the add-on alone is NOT enough — the term must be active (D4)', async () => {
    nextRow = row({ review_addon: true });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasReviewAddon).toBe(true);
    expect(result.current.hasActiveTerm).toBe(false);
    expect(result.current.canReview).toBe(false);
  });

  it('add-on + active term unlocks canReview with zero credits', async () => {
    nextRow = row({
      plan: 'term',
      plan_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      subscription_status: 'active',
      review_addon: true,
    });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(0);
    expect(result.current.canReview).toBe(true);
  });

  it('no credits and no add-on means no review', async () => {
    nextRow = row({});
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(0);
    expect(result.current.hasReviewAddon).toBe(false);
    expect(result.current.canReview).toBe(false);
  });

  it('an expired term with the add-on falls back to credits only', async () => {
    nextRow = row({
      plan: 'term',
      plan_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      subscription_status: 'canceled',
      review_addon: true,
      review_credits: 1,
    });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasActiveTerm).toBe(false);
    expect(result.current.canReview).toBe(true); // via the credit, not the add-on
  });

  it('no session at all is a guest who cannot review', async () => {
    fakeUser = null;
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isGuest).toBe(true);
    expect(result.current.canReview).toBe(false);
  });
});

/**
 * H-8 — the Export tab must not keep a stale credit balance after a
 * credit is spent. `applyCredits` folds the server's returned balance
 * into plan state (re-deriving canExport) and `refresh` re-reads the
 * row on demand.
 */
describe('usePlan — refresh and applyCredits (H-8)', () => {
  it('applyCredits lowers the balance and flips canExport off at zero', async () => {
    nextRow = row({ export_credits: 1 });
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.credits).toBe(1);
    expect(result.current.canExport).toBe(true);

    act(() => result.current.applyCredits(0));

    expect(result.current.credits).toBe(0);
    expect(result.current.canExport).toBe(false);
  });

  it('applyCredits never goes negative and keeps canExport for a term holder', async () => {
    nextRow = row({
      plan: 'term',
      plan_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      subscription_status: 'active',
    });
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.applyCredits(-3));

    expect(result.current.credits).toBe(0);
    expect(result.current.hasActiveTerm).toBe(true);
    expect(result.current.canExport).toBe(true);
  });

  it('refresh re-reads the billing row', async () => {
    nextRow = row({ export_credits: 3 });
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.credits).toBe(3));

    nextRow = row({ export_credits: 2 });
    let snapshot: Awaited<ReturnType<typeof result.current.refresh>> | undefined;
    await act(async () => {
      snapshot = await result.current.refresh();
    });

    expect(result.current.credits).toBe(2);
    expect(result.current.canExport).toBe(true);
    // Resolves with the fresh data too, so a handler holding a stale
    // `plan` in its closure can decide on the new state immediately.
    expect(snapshot).toMatchObject({ credits: 2, canExport: true, loading: false });
  });

  it('refresh and applyCredits are stable across renders', async () => {
    nextRow = row({ export_credits: 1 });
    const { result, rerender } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { refresh, applyCredits } = result.current;

    rerender();

    expect(result.current.refresh).toBe(refresh);
    expect(result.current.applyCredits).toBe(applyCredits);
  });
});
