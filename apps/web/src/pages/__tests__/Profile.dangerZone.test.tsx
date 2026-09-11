/**
 * Profile — Danger Zone account deletion (P0-3, client).
 *
 * Deletion goes through the API (data/account.deleteAccount) so the
 * server can cancel a live Stripe subscription before the auth user is
 * removed — never the bare `delete_own_account` RPC, which orphaned a
 * subscription that kept billing a deleted account. NOTHING is deleted
 * client-side first: the server removes storage and the auth delete
 * cascades the posters, so a failed API call really does leave
 * everything in place (the copy promises "Nothing was removed"). The
 * typed confirmation stays. On an ApiError the user stays signed in with
 * a generic message; no sign-out, no storage wipe.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiError } from '@/lib/apiClient';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  supabase: { auth, rpc, from: vi.fn() },
}));
const posters = vi.hoisted(() => ({
  listPosters: vi.fn(async () => [{ id: 'p1' }, { id: 'p2' }]),
  deletePoster: vi.fn(async () => {}),
}));
vi.mock('@/data/posters', () => posters);
vi.mock('@/data/consent', () => ({
  getConsent: vi.fn(async () => ({ research: false, marketing: false })),
  writeConsent: vi.fn(async () => true),
}));
vi.mock('@/data/feedback', () => ({ listMyFeedback: vi.fn(async () => []) }));
vi.mock('@/data/gallery', () => ({
  listMyGallery: vi.fn(async () => []),
  retractGalleryEntry: vi.fn(),
  labelForField: (f: string) => f,
}));
vi.mock('@/data/billing', () => ({
  openBillingPortal: vi.fn(),
  requestRefund: vi.fn(),
}));
const account = vi.hoisted(() => ({ deleteAccount: vi.fn() }));
vi.mock('@/data/account', () => account);
const planState = { hasActiveTerm: false };
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false,
    hasActiveTerm: planState.hasActiveTerm,
    credits: 0,
    reviewCredits: 0,
    hasReviewAddon: false,
    canReview: false,
    canExport: planState.hasActiveTerm,
    isGuest: false,
    subscriptionStatus: planState.hasActiveTerm ? 'active' : null,
    refresh: vi.fn(),
    applyCredits: vi.fn(),
  }),
}));
vi.mock('@/poster/GuidelinesPanel', () => ({
  getAllTemplates: () => [],
  saveCustomTemplates: vi.fn(),
}));
vi.mock('@/components/OnboardingTour', () => ({ resetOnboarding: vi.fn() }));
vi.mock('@/components/PresetEditModal', () => ({ PresetEditModal: () => null }));
vi.mock('@/components/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/seo/useDocumentMeta', () => ({ useDocumentMeta: () => {} }));

import Profile from '../Profile';

const permanentUser = {
  id: 'user-1',
  is_anonymous: false,
  email: 'jane@example.com',
  created_at: '2026-09-01T00:00:00Z',
};

const TERM_LINE = /This also cancels your CA\$18\.99 term and any add-on immediately/i;

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/auth" element={<div>auth page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openDeleteAndConfirm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
  const input = await screen.findByLabelText(/Type I confirm the deletion of my account/i);
  fireEvent.change(input, { target: { value: 'I confirm the deletion of my account' } });
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  planState.hasActiveTerm = false;
  auth.getUser.mockResolvedValue({ data: { user: permanentUser }, error: null });
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1', is_anonymous: false } } },
  });
  localStorage.setItem('postr.profile', JSON.stringify({ displayName: 'Jane' }));
});

describe('Profile — Danger Zone (P0-3)', () => {
  it('names the term cancellation only when a term is active', async () => {
    planState.hasActiveTerm = true;
    renderProfile();
    await screen.findByRole('button', { name: 'Delete account' });
    expect(screen.getAllByText(TERM_LINE).length).toBeGreaterThan(0);
  });

  it('does not mention a term for a free user', async () => {
    renderProfile();
    await screen.findByRole('button', { name: 'Delete account' });
    expect(screen.queryByText(TERM_LINE)).toBeNull();
  });

  it('calls the API route (never the RPC, never a client-side poster delete), then signs out', async () => {
    account.deleteAccount.mockResolvedValue({
      ok: true,
      cancelledSubscriptions: 1,
      deletedCustomer: true,
    });
    renderProfile();

    await openDeleteAndConfirm();

    await waitFor(() => expect(account.deleteAccount).toHaveBeenCalledTimes(1));
    expect(posters.deletePoster).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('delete_own_account');
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' }));
    expect(await screen.findByText('auth page')).toBeInTheDocument();
    expect(localStorage.getItem('postr.profile')).toBeNull();
  });

  it('on an ApiError shows a generic message and keeps the user signed in', async () => {
    account.deleteAccount.mockRejectedValue(
      new ApiError('cancel_failed', 502, { error: 'cancel_failed' }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();

    await openDeleteAndConfirm();

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/cancel_failed/)).toBeNull();
    // "Nothing was removed" must be TRUE: no poster was deleted before the
    // API refused, so the retry the copy invites still has everything.
    expect(screen.getByText(/Nothing was removed/i)).toBeInTheDocument();
    expect(posters.deletePoster).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('auth page')).toBeNull();
    expect(localStorage.getItem('postr.profile')).not.toBeNull();
    consoleError.mockRestore();
  });
});
