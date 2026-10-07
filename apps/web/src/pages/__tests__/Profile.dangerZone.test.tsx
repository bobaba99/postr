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
 * a generic message; no sign-out, no storage wipe. The plot scripts the
 * figure check keeps per poster in this browser go with the account
 * (plan item 7, docs/fixes/07-figure-script-kept.md), and so does every
 * other Postr entry in localStorage: the palettes, the colour-blind
 * preference, this account's welcome-poster marker (its key holds the
 * account id) and the two-tab markers (their keys hold poster ids)
 * (record 24). Another account's welcome-poster marker in the same
 * browser stays: it is not this account's data, and removing it would
 * seed that account's welcome poster again. The entries kept for the open
 * tab (sessionStorage) go too: the Privacy Policy says deletion clears
 * every entry the Cookies Policy lists, and the last test seeds each one
 * from the inventory that policy is checked against (storageWriters.ts;
 * record 24, review round 1: four were left).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiError } from '@/lib/apiClient';
import {
  MAX_SCRIPT_CHARS,
  posterScriptSlot,
  readScriptDraft,
  writeScriptDraft,
} from '@/poster/figureScriptDraft';
import { saveCustomPalettes } from '@/poster/customPalettes';
import { UNREACHABLE_WRITERS, WRITERS } from './storageWriters';

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

const TERM_LINE = /This also cancels your term and any add-on immediately/i;

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
  localStorage.clear();
  sessionStorage.clear();
  planState.hasActiveTerm = false;
  auth.getUser.mockResolvedValue({ data: { user: permanentUser }, error: null });
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1', is_anonymous: false } } },
  });
  // As the real client does, signing out leaves no session to read.
  auth.signOut.mockImplementation(async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } } as never);
    return { error: null };
  });
  localStorage.setItem('postr.profile', JSON.stringify({ displayName: 'Jane' }));
  // A script left in each poster's figure check, as the editor writes it.
  for (const id of ['p1', 'p2']) {
    writeScriptDraft(posterScriptSlot(id), { code: `# ${id}\nlibrary(ggplot2)`, lang: 'r', checked: null });
  }
  // The four entries deletion used to leave, as their writers store them:
  // customPalettes.ts, PaletteDesigner.tsx (CB_PREF_KEY),
  // seedWelcomePoster.ts (SEEDED_FLAG_PREFIX + user id) and
  // useTwoTabGuard.ts (the poster id, or "new").
  saveCustomPalettes([{ name: 'Lab colours', colors: ['#112233', '#445566'] } as never]);
  localStorage.setItem('postr.cb-random-pref', 'true');
  localStorage.setItem('postr.welcome-seeded:user-1', '1');
  localStorage.setItem('postr.welcome-seeded:user-2', '1');
  localStorage.setItem('postr.active-editor.p1', JSON.stringify({ tabId: 't1', ts: Date.now() }));
  localStorage.setItem('postr.active-editor.new', JSON.stringify({ tabId: 't1', ts: Date.now() }));
});

const postrEntries = () => Object.keys(localStorage).filter((key) => key.startsWith('postr.')).sort();

/** Every Postr entry in a storage area: the policy's keys are postr.… or postr-…. */
const postrKeysIn = (area: Storage) => Object.keys(area).filter((key) => /^postr[.-]/.test(key)).sort();

/**
 * Seeds every key the app writes (storageWriters.ts), in its own area, the
 * way its writer names it: a key that ends in a separator gets this
 * account's id (the welcome marker) or a poster id. Entries already seeded
 * with real values are left as they are.
 */
function seedEveryWrittenKey() {
  for (const { stored, area } of [...WRITERS, ...UNREACHABLE_WRITERS]) {
    const store = area === 'localStorage' ? localStorage : sessionStorage;
    const key = /[.:]$/.test(stored) ? `${stored}${stored.endsWith(':') ? 'user-1' : 'p9'}` : stored;
    if (store.getItem(key) === null) store.setItem(key, '1');
  }
}

const storedScripts = () =>
  Object.keys(localStorage).filter((key) => key.startsWith('postr.figure-script.')).sort();

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
    expect(storedScripts()).toEqual([]);
  });

  it('leaves no Postr entry in localStorage once the account is deleted', async () => {
    account.deleteAccount.mockResolvedValue({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    expect(postrEntries()).toEqual(
      expect.arrayContaining([
        'postr.active-editor.new',
        'postr.active-editor.p1',
        'postr.cb-random-pref',
        'postr.custom-palettes',
        'postr.welcome-seeded:user-1',
      ]),
    );
    renderProfile();

    await openDeleteAndConfirm();

    expect(await screen.findByText('auth page')).toBeInTheDocument();
    expect(postrEntries()).toEqual(['postr.welcome-seeded:user-2']);
  });

  it('leaves no entry the Cookies Policy lists, in either storage area, once the account is deleted', async () => {
    account.deleteAccount.mockResolvedValue({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    seedEveryWrittenKey();
    expect(postrKeysIn(sessionStorage).length).toBeGreaterThanOrEqual(8);
    renderProfile();

    await openDeleteAndConfirm();

    expect(await screen.findByText('auth page')).toBeInTheDocument();
    expect({ local: postrKeysIn(localStorage), session: postrKeysIn(sessionStorage) }).toEqual({
      local: ['postr.welcome-seeded:user-2'],
      session: [],
    });
  });

  it('also drops a plot script too long to store, which the figure check holds only in memory', async () => {
    account.deleteAccount.mockResolvedValue({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    const long = `# p3\n${'x <- 1\n'.repeat(Math.ceil(MAX_SCRIPT_CHARS / 7) + 1)}`;
    writeScriptDraft(posterScriptSlot('p3'), { code: long, lang: 'r', checked: null });
    expect(localStorage.getItem('postr.figure-script.p3')).toBeNull();
    expect(readScriptDraft(posterScriptSlot('p3')).code).toBe(long);
    renderProfile();

    await openDeleteAndConfirm();

    expect(await screen.findByText('auth page')).toBeInTheDocument();
    expect(readScriptDraft(posterScriptSlot('p3')).code).toBe('');
  });

  it('on an ApiError shows a generic message and keeps the user signed in', async () => {
    account.deleteAccount.mockRejectedValue(
      new ApiError('cancel_failed', 502, { error: 'cancel_failed' }),
    );
    sessionStorage.setItem('postr.checkoutIntent', 'term');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();

    await openDeleteAndConfirm();

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/cancel_failed/)).toBeNull();
    // The copy no longer says "Nothing was removed": the API cancels billing
    // and removes Storage files before deleting the user, so a late failure
    // leaves some steps done. It says so, and invites the retry, which still
    // works because the client deletes no poster on its own.
    expect(screen.getByText(/Some steps may have finished/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was removed/i)).toBeNull();
    expect(posters.deletePoster).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('auth page')).toBeNull();
    expect(localStorage.getItem('postr.profile')).not.toBeNull();
    expect(storedScripts()).toEqual(['postr.figure-script.p1', 'postr.figure-script.p2']);
    expect(postrEntries()).toEqual(
      expect.arrayContaining(['postr.custom-palettes', 'postr.welcome-seeded:user-1', 'postr.active-editor.p1']),
    );
    expect(sessionStorage.getItem('postr.checkoutIntent')).toBe('term');
    consoleError.mockRestore();
  });
});
