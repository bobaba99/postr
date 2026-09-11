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
 */
import { supabase } from '@/lib/supabase';
import { deleteAccount } from '@/data/account';

const LOCAL_KEYS = [
  'postr.style-presets',
  'postr.scratch-pad',
  'postr.scratch-note',
  'postr.checklist-templates',
  'postr.profile',
  'postr.onboarding-done',
] as const;

export type DeletionOutcome = { ok: true } | { ok: false };

function clearLocalData(): void {
  for (const key of LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable — nothing to clear.
    }
  }
}

export async function runAccountDeletion(): Promise<DeletionOutcome> {
  try {
    await deleteAccount();
  } catch (err) {
    // Operator-facing detail stays in the console; the user sees a
    // generic message and remains signed in.
    console.error('[account] delete failed:', err);
    return { ok: false };
  }
  clearLocalData();
  await supabase.auth.signOut({ scope: 'global' });
  return { ok: true };
}
