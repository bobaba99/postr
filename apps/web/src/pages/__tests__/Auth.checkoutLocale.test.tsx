/**
 * Fix 26 — a purchase started from a French page asks for a French Stripe
 * Checkout; one started from an English page asks exactly what it asked
 * before.
 *
 * Entered where the buyer enters: the router at /auth/fr?plan=term (where
 * the French pricing card sends a signed-in buyer), with a permanent
 * session, through the real checkout intent and billing client down to the
 * request body the API receives (the API side:
 * apps/api/src/__tests__/billing.locale.test.ts). Also the French sign-up
 * and Google paths: where Supabase is told to send the buyer back.
 *
 * Re-run: npx vitest run src/pages/__tests__/Auth.checkoutLocale.test.tsx
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInAnonymously: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(async (_args: unknown) => ({ data: { session: null, user: null }, error: null })),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));

const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock('@/lib/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apiClient')>()),
  postJson: api.postJson,
}));

vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false,
    hasActiveTerm: false,
    isGuest: false,
    credits: 0,
    refresh: vi.fn(),
    applyCredits: vi.fn(),
  }),
}));

import { AppRoutes } from '../../routes';

const assign = vi.fn();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

function signedIn() {
  authSpies.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1', is_anonymous: false } } },
  });
}

function signedOut() {
  authSpies.getSession.mockResolvedValue({ data: { session: null } });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  api.postJson.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign, origin: 'https://www.postr.sh' },
  });
});
afterEach(() => cleanup());

describe('the checkout a signed-in buyer is handed to', () => {
  it.each(['term', 'pack'])('from /auth/fr?plan=%s asks for French', async (plan) => {
    signedIn();
    renderAt(`/auth/fr?plan=${plan}`);
    await waitFor(() => expect(api.postJson).toHaveBeenCalledTimes(1));
    expect(api.postJson).toHaveBeenCalledWith('/billing/create-checkout', { sku: plan, lang: 'fr' }, { auth: true });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/session'));
  });

  it.each(['term', 'pack'])('from /auth?plan=%s asks what it asked before (no lang)', async (plan) => {
    signedIn();
    renderAt(`/auth?plan=${plan}`);
    await waitFor(() => expect(api.postJson).toHaveBeenCalledTimes(1));
    expect(api.postJson).toHaveBeenCalledWith('/billing/create-checkout', { sku: plan }, { auth: true });
  });
});

describe('where Supabase sends a new French account back', () => {
  it('a French sign-up by email comes back to /auth/fr, plan kept', async () => {
    signedOut();
    renderAt('/auth/fr?plan=term');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.change(screen.getByRole('textbox', { name: /courriel/i }), { target: { value: 'jean.tremblay@example.com' } });
    fireEvent.change(screen.getByLabelText(/mot de passe/i), { target: { value: 'Correct-Horse-9-Battery' } });
    fireEvent.submit(screen.getByLabelText(/mot de passe/i).closest('form')!);
    await waitFor(() => expect(authSpies.signUp).toHaveBeenCalledTimes(1));
    expect(authSpies.signUp.mock.calls[0]?.[0]).toMatchObject({
      options: { emailRedirectTo: 'https://www.postr.sh/auth/fr?plan=term' },
    });
  });

  it('a French Google sign-in with a plan comes back to /auth/fr, plan kept', async () => {
    signedOut();
    renderAt('/auth/fr?plan=pack');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Google/ }));
    await waitFor(() => expect(authSpies.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(authSpies.signInWithOAuth.mock.calls[0]?.[0]).toMatchObject({
      options: { redirectTo: 'https://www.postr.sh/auth/fr?plan=pack' },
    });
  });

  // Review round 1, R1-06: the record said a French Google sign-in comes
  // back to /auth/fr; with no plan it goes to /dashboard, as in English. A
  // guard of the corrected claim (the code did not change).
  it('a French Google sign-in with no plan goes to /dashboard, as the English one does', async () => {
    signedOut();
    renderAt('/auth/fr');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Google/ }));
    await waitFor(() => expect(authSpies.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(authSpies.signInWithOAuth.mock.calls[0]?.[0]).toMatchObject({
      options: { redirectTo: 'https://www.postr.sh/dashboard' },
    });
  });

  it('a French sign-up by email with no plan comes back to /auth/fr', async () => {
    signedOut();
    renderAt('/auth/fr');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'S’inscrire' }));
    fireEvent.change(screen.getByRole('textbox', { name: /courriel/i }), { target: { value: 'jean.tremblay@example.com' } });
    fireEvent.change(screen.getByLabelText(/mot de passe/i), { target: { value: 'Correct-Horse-9-Battery' } });
    fireEvent.submit(screen.getByLabelText(/mot de passe/i).closest('form')!);
    await waitFor(() => expect(authSpies.signUp).toHaveBeenCalledTimes(1));
    expect(authSpies.signUp.mock.calls[0]?.[0]).toMatchObject({
      options: { emailRedirectTo: 'https://www.postr.sh/auth/fr' },
    });
  });

  it('an English sign-up by email still comes back to /auth', async () => {
    signedOut();
    renderAt('/auth?plan=term');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'jane.doe@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Correct-Horse-9-Battery' } });
    fireEvent.submit(screen.getByLabelText(/password/i).closest('form')!);
    await waitFor(() => expect(authSpies.signUp).toHaveBeenCalledTimes(1));
    expect(authSpies.signUp.mock.calls[0]?.[0]).toMatchObject({
      options: { emailRedirectTo: 'https://www.postr.sh/auth?plan=term' },
    });
  });
});

describe('the French page’s errors stay generic, in French', () => {
  async function signInWith(path: string, error: { message: string; code?: string }) {
    signedOut();
    authSpies.signInWithPassword.mockResolvedValue({ data: {}, error });
    renderAt(path);
    await screen.findAllByRole('heading', { level: 1 });
    const form = document.querySelector('form')!;
    fireEvent.change(form.querySelector('input[type="email"]')!, { target: { value: 'jean.tremblay@example.com' } });
    fireEvent.change(form.querySelector('input[type="password"]')!, { target: { value: 'not-it' } });
    fireEvent.submit(form);
    await waitFor(() => expect(authSpies.signInWithPassword).toHaveBeenCalledTimes(1));
  }

  it('a code the French copy knows gets its French line, never Supabase’s English', async () => {
    await signInWith('/auth/fr', { message: 'Invalid login credentials', code: 'invalid_credentials' });
    expect(await screen.findByText('Adresse courriel ou mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
  });

  it('any other code gets the generic French line', async () => {
    await signInWith('/auth/fr', { message: 'Database error querying schema', code: 'unexpected_failure' });
    expect(await screen.findByText('Une erreur s’est produite. Veuillez réessayer.')).toBeInTheDocument();
    expect(screen.queryByText(/Database error/)).toBeNull();
  });

  it('the English page shows Supabase’s message, as before', async () => {
    await signInWith('/auth', { message: 'Invalid login credentials', code: 'invalid_credentials' });
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
  });
});
