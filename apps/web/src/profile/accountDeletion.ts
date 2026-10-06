/**
 * Account deletion flow (P0-3, client).
 *
 * The server is the single deletion authority. POST /account/delete
 * cancels any live Stripe subscription, deletes the Stripe customer,
 * removes every Storage object the user owns (poster figures, thumbnails,
 * logos, gallery files — storageCleanup.ts), then deletes the auth user,
 * whose FK cascade removes the posters and every other user-owned row.
 * The bare `delete_own_account` RPC is NOT used: it orphaned a
 * subscription that kept billing a deleted account.
 *
 * Nothing is deleted client-side first. An earlier version hard-deleted
 * every poster here BEFORE calling the API, so a Stripe outage (502
 * cancel_failed) left the user with no posters, a live subscription and
 * a message saying nothing was removed. The API is built so every
 * failure before its final step is retryable with the account intact;
 * that guarantee only holds if the client destroys nothing on its own.
 *
 * Only on success: clear local data and sign out everywhere. On any
 * failure the user stays signed in with everything intact — the caller
 * shows a generic message and they can retry.
 *
 * Local data is every Postr entry this browser keeps, in localStorage and
 * in sessionStorage: every key named postr.… or postr-…, which is how each
 * entry in the Cookies Policy's table is named. One exception: another
 * account's welcome-poster marker (`postr.welcome-seeded:<account id>`)
 * stays, because it is not this account's data and removing it would seed
 * that account's welcome poster again. Record 24 first added the four
 * localStorage kinds the claims audit found left behind; its review round
 * 1 found the tab's sessionStorage entries left too, which the Privacy
 * Policy says deletion clears. Clearing by name rather than by a list
 * means a key added later goes with the account without being listed
 * here; pages/__tests__/Profile.dangerZone.test.tsx seeds every key in the
 * policy's inventory (pages/__tests__/storageWriters.ts) and checks.
 */
import { supabase } from '@/lib/supabase';
import { deleteAccount } from '@/data/account';
import { clearStoredFigureScripts } from '@/poster/figureScriptDraft';

/** Every Postr entry's key starts with this (postr.… or postr-…). */
const POSTR_KEY = /^postr[.-]/;
/** data/seedWelcomePoster.ts: `postr.welcome-seeded:<account id>`. */
const WELCOME_SEEDED_PREFIX = 'postr.welcome-seeded:';

export type DeletionOutcome = { ok: true } | { ok: false };

/** Another account's welcome-poster marker: not this account's data. */
function isOtherAccountsMarker(key: string, userId: string | null): boolean {
  return key.startsWith(WELCOME_SEEDED_PREFIX) && key !== `${WELCOME_SEEDED_PREFIX}${userId}`;
}

/** Removes every Postr entry from one storage area, but another account's marker. */
function clearArea(area: () => Storage, userId: string | null): void {
  try {
    const storage = area();
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && POSTR_KEY.test(key) && !isOtherAccountsMarker(key, userId)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage unavailable — nothing stored to clear.
  }
}

function clearLocalData(userId: string | null): void {
  clearArea(() => localStorage, userId);
  clearArea(() => sessionStorage, userId);
  // The plot scripts kept per poster (postr.figure-script.<poster id>):
  // their keys went above; this also drops the copies too long to store,
  // which the figure check holds in memory, and tells it they are gone.
  clearStoredFigureScripts();
}

/** The account being deleted, read before the server deletes it. */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function runAccountDeletion(): Promise<DeletionOutcome> {
  const userId = await currentUserId();
  try {
    await deleteAccount();
  } catch (err) {
    // Operator-facing detail stays in the console; the user sees a
    // generic message and remains signed in.
    console.error('[account] delete failed:', err);
    return { ok: false };
  }
  clearLocalData(userId);
  await supabase.auth.signOut({ scope: 'global' });
  return { ok: true };
}
