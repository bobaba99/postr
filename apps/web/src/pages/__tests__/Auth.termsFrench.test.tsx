/**
 * Where a user accepts the Terms on /auth — signing in or creating an
 * account, by email or with Google, including the account a buyer creates
 * on the way to checkout — the line that says so is there, links the
 * French Terms and Privacy Policy beside the English ones (owner decision
 * 2026-10-06, Bill 96; record 24), and sits next to "Continue with Google".
 *
 * Terms §1 makes creating an account, and signing in, acceptance. "Continue
 * with Google" creates an account for a Google user Postr has never seen,
 * whatever mode the page is in (Auth.tsx handleGoogle; Supabase creates the
 * user while sign-ups are enabled), and the page opens in sign-in mode. So
 * the line is checked on the default view too, and its place is checked:
 * review round 2 of record 24 found it only in sign-up mode, under the
 * email form, 279 px below the Google button. Entered at the page; modes
 * switched by the user's own click. The line is found by its French link,
 * not by a test id, so the check does not depend on how the line is named.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(() => new Promise<never>(() => {})),
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
vi.mock('@/data/checkoutIntent', () => ({
  resolveCheckoutPlan: (value: string | null) => (value === 'term' || value === 'pack' ? value : null),
  parseCheckoutPlan: (value: string | null) => (value === 'term' || value === 'pack' ? value : null),
  stashCheckoutIntent: vi.fn(),
  clearCheckoutIntent: vi.fn(),
  startCheckoutForPlan: vi.fn(),
}));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({ loading: false, hasActiveTerm: false, isGuest: true, refresh: vi.fn(), applyCredits: vi.fn() }),
}));
vi.mock('@/data/consent', () => ({
  writeConsent: vi.fn(),
  stashSignupConsent: vi.fn(),
  readStashedSignupConsent: vi.fn(() => ({ research: false, marketing: false })),
  clearStashedSignupConsent: vi.fn(),
}));

import Auth from '../Auth';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Auth />
    </MemoryRouter>,
  );
}

/** The Terms lines on the page: each paragraph that links the French Terms. */
function termsLines(): HTMLElement[] {
  return screen
    .queryAllByRole('link', { name: 'Conditions d’utilisation' })
    .map((link) => link.closest('p'))
    .filter((p): p is HTMLParagraphElement => p !== null);
}

function expectOneLineInBothLanguages(): HTMLElement {
  const lines = termsLines();
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  const hrefs = [...line.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual(expect.arrayContaining(['/terms', '/terms/fr', '/privacy', '/privacy/fr']));
  // Mode-neutral: it is read before signing in or before creating an account.
  expect(line.textContent).toMatch(/By continuing, you agree to the Terms of Service\./);
  expect(line.textContent).toMatch(/Conditions d’utilisation/);
  // The Terms are accepted; the Privacy Policy is information, not a term
  // the user consents to (Law 25 s. 14 asks for consent separately from
  // other information; record 24, review round 1).
  expect(line.textContent).not.toMatch(/agree to[^.]*Privacy Policy/i);
  expect(line.textContent).toMatch(/The Privacy Policy explains how we handle your information\./);
  return line;
}

/** The line comes right after "Continue with Google", before the email form. */
function expectNextToGoogle(line: HTMLElement) {
  const google = screen.getByRole('button', { name: /Continue with Google/ });
  expect(google.nextElementSibling).toBe(line);
  const email = screen.getByRole('textbox', { name: 'Email address' });
  expect(line.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

beforeEach(() => vi.clearAllMocks());

describe('/auth — accepting the Terms, in English and French', () => {
  it('shows the line on the default view, where Continue with Google can create an account', () => {
    renderAt('/auth');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expectNextToGoogle(expectOneLineInBothLanguages());
  });

  it('keeps one line, next to Continue with Google, once the user switches to sign-up', () => {
    renderAt('/auth');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expectNextToGoogle(expectOneLineInBothLanguages());
  });

  it('shows it when a buyer creates an account on the way to checkout', () => {
    renderAt('/auth?plan=term');
    expectNextToGoogle(expectOneLineInBothLanguages());
  });
});
