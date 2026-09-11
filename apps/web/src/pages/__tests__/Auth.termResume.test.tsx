/**
 * /auth?plan=term resume — duplicate-term guard (P0-2, client).
 *
 * A signed-in permanent user landing here with a term intent used to be
 * handed straight to Stripe, even when they already held an active term
 * (a second subscription). Now: when usePlan says hasActiveTerm the
 * auto-checkout is skipped and the banner says so; and if the API still
 * answers 409 already_subscribed the message is the friendly one, not
 * "We couldn't start checkout".
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlreadySubscribedError } from '@/data/billing';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));

const checkout = vi.hoisted(() => ({
  startCheckoutForPlan: vi.fn(),
  stashCheckoutIntent: vi.fn(),
  clearCheckoutIntent: vi.fn(),
}));
vi.mock('@/data/checkoutIntent', () => ({
  resolveCheckoutPlan: (value: string | null) =>
    value === 'term' || value === 'pack' ? value : null,
  parseCheckoutPlan: (value: string | null) =>
    value === 'term' || value === 'pack' ? value : null,
  ...checkout,
}));

vi.mock('@/data/consent', () => ({
  writeConsent: vi.fn(),
  stashSignupConsent: vi.fn(),
  readStashedSignupConsent: vi.fn(() => ({ research: false, marketing: false })),
  clearStashedSignupConsent: vi.fn(),
}));

const planState = {
  value: { loading: false, hasActiveTerm: false, isGuest: false },
  /** What `refresh()` resolves with — the server's fresh view of the row. */
  refreshed: { loading: false, hasActiveTerm: false, isGuest: false },
};
const refreshMock = vi.fn(async () => planState.refreshed);
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    ...planState.value,
    refresh: refreshMock,
    applyCredits: vi.fn(),
  }),
}));

import Auth from '../Auth';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Auth />
    </MemoryRouter>,
  );
}

const permanentSession = {
  data: { session: { user: { id: 'u1', is_anonymous: false } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  authSpies.getSession.mockResolvedValue(permanentSession);
  planState.value = { loading: false, hasActiveTerm: false, isGuest: false };
  planState.refreshed = { loading: false, hasActiveTerm: false, isGuest: false };
});

describe('/auth?plan=term resume (P0-2)', () => {
  it('starts checkout for a signed-in user without a term', async () => {
    checkout.startCheckoutForPlan.mockResolvedValue(undefined);
    renderAt('/auth?plan=term');

    await waitFor(() => expect(checkout.startCheckoutForPlan).toHaveBeenCalledWith('term'));
    expect(checkout.startCheckoutForPlan).toHaveBeenCalledTimes(1);
  });

  it('skips checkout and explains when the term is already active', async () => {
    planState.value = { loading: false, hasActiveTerm: true, isGuest: false };
    renderAt('/auth?plan=term');

    expect(await screen.findByText(/You already have an active term/i)).toBeInTheDocument();
    // Give any stray effect a tick — checkout must never have started.
    await new Promise((r) => setTimeout(r, 0));
    expect(checkout.startCheckoutForPlan).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /go to your profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('waits for the plan before deciding (no premature checkout while loading)', async () => {
    planState.value = { loading: true, hasActiveTerm: false, isGuest: false };
    renderAt('/auth?plan=term');

    await new Promise((r) => setTimeout(r, 0));
    expect(checkout.startCheckoutForPlan).not.toHaveBeenCalled();
  });

  it('a pack intent is unaffected by an active term', async () => {
    planState.value = { loading: false, hasActiveTerm: true, isGuest: false };
    checkout.startCheckoutForPlan.mockResolvedValue(undefined);
    renderAt('/auth?plan=pack');

    await waitFor(() => expect(checkout.startCheckoutForPlan).toHaveBeenCalledWith('pack'));
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
  });

  it('maps a 409 already_subscribed to the friendly message once a fresh plan read confirms the term', async () => {
    checkout.startCheckoutForPlan.mockRejectedValue(new AlreadySubscribedError());
    planState.refreshed = { loading: false, hasActiveTerm: true, isGuest: false };
    renderAt('/auth?plan=term');

    expect(await screen.findByText(/You already have an active term/i)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByText(/couldn’t start checkout/i)).toBeNull();
  });

  it('a 409 the fresh plan read CONTRADICTS falls back to the generic message (never "you own a term" the app cannot see)', async () => {
    checkout.startCheckoutForPlan.mockRejectedValue(new AlreadySubscribedError());
    planState.refreshed = { loading: false, hasActiveTerm: false, isGuest: false };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/auth?plan=term');

    expect(await screen.findByText(/couldn’t start checkout/i)).toBeInTheDocument();
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
    consoleError.mockRestore();
  });

  it('keeps the generic message for any other checkout failure', async () => {
    checkout.startCheckoutForPlan.mockRejectedValue(new Error('stripe exploded'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/auth?plan=term');

    expect(await screen.findByText(/couldn’t start checkout/i)).toBeInTheDocument();
    expect(screen.queryByText(/stripe exploded/i)).toBeNull();
    consoleError.mockRestore();
  });
});
