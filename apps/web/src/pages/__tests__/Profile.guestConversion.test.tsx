/**
 * Profile — guest → permanent conversion (P0-4, H-6).
 *
 * Mirrors lib/__tests__/convertGuest.test.ts at the page level: the
 * "Sign up with Google" button on the guest card must link the identity
 * IN PLACE (linkIdentity) and NEVER signInWithOAuth — the latter mints a
 * new user and orphans the guest's posters while the card copy promises
 * linking. The email path must report "check your inbox" while the
 * account is still anonymous, never a false "Account created!".
 * Supabase errors are mapped to guidance, never shown raw.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth, rpc: vi.fn(), from: vi.fn() },
}));
vi.mock('@/data/posters', () => ({
  listPosters: vi.fn(async () => []),
  deletePoster: vi.fn(),
}));
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
vi.mock('@/data/account', () => ({ deleteAccount: vi.fn() }));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 0,
    hasReviewAddon: false,
    canReview: false,
    canExport: false,
    isGuest: true,
    subscriptionStatus: null,
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

const guestUser = {
  id: 'guest-1',
  is_anonymous: true,
  email: null,
  created_at: '2026-09-01T00:00:00Z',
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Profile />
    </MemoryRouter>,
  );
}

async function guestCard() {
  return screen.findByRole('button', { name: /sign up with google/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: guestUser }, error: null });
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'guest-1', is_anonymous: true } } },
  });
});

describe('Profile — Google conversion (P0-4)', () => {
  it('links the Google identity in place and never calls signInWithOAuth', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    renderProfile();

    fireEvent.click(await guestCard());

    await waitFor(() => expect(auth.linkIdentity).toHaveBeenCalledTimes(1));
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('maps "identity already linked" to guidance, never the raw text', async () => {
    const raw = 'Identity is already linked to another user';
    auth.linkIdentity.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(raw), { code: 'identity_already_exists' }),
    });
    renderProfile();

    fireEvent.click(await guestCard());

    expect(
      await screen.findByText(/already linked to another Postr account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(raw)).toBeNull();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('maps "manual linking disabled" to guidance, never the raw text', async () => {
    const raw = 'Manual linking is disabled';
    auth.linkIdentity.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(raw), { code: 'manual_linking_disabled' }),
    });
    renderProfile();

    fireEvent.click(await guestCard());

    expect(
      await screen.findByText(/isn’t available right now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(raw)).toBeNull();
  });

  it('any other failure shows the generic message, not the raw text', async () => {
    auth.linkIdentity.mockResolvedValue({ data: null, error: new Error('kaboom 500') });
    renderProfile();

    fireEvent.click(await guestCard());

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/kaboom/)).toBeNull();
  });
});

describe('Profile — email conversion (H-6)', () => {
  it('reports "check your inbox" while confirmation is pending — never "Account created!"', async () => {
    auth.updateUser.mockResolvedValue({
      data: { user: { ...guestUser, new_email: 'jane@example.com' } },
      error: null,
    });
    renderProfile();
    await guestCard();

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Create password'), {
      target: { value: 'Str0ng-passw0rd!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    expect(
      await screen.findByText(/Check your inbox to confirm your email — your posters stay on this account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Account created!/i)).toBeNull();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'jane@example.com', password: 'Str0ng-passw0rd!' },
      { emailRedirectTo: `${window.location.origin}/profile` },
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('surfaces a pending new_email as "Confirmation pending"', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { ...guestUser, new_email: 'jane@example.com' } },
      error: null,
    });
    renderProfile();
    await guestCard();

    const pending = await screen.findAllByText(/Confirmation pending/i);
    expect(pending.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/jane@example\.com/).length).toBeGreaterThan(0);
  });
});
