/**
 * Account client — the authed API route that ends an account.
 *
 * Deletion goes through the API rather than the `delete_own_account`
 * RPC because billing lives outside the database: the server must cancel
 * any live Stripe subscription and delete the Stripe customer, remove
 * the user's storage objects, and only then delete the auth user (which
 * cascades through the user-owned tables). The RPC alone orphaned a live
 * subscription that kept billing a deleted account
 * (docs/plans/2026-09-10 lifecycle audit, P0-3).
 *
 * Contract (apps/api/src/account.ts):
 *   POST /account/delete  — Bearer session, permanent or anonymous
 *   200 { ok: true, cancelledSubscriptions: number, deletedCustomer: boolean }
 *   4xx/5xx ApiError with code:
 *     'cancel_failed'          Stripe refused to cancel a live subscription
 *     'customer_delete_failed' subscriptions cancelled, customer delete failed
 *     'storage_cleanup_failed' billing wound down, storage removal failed
 *     'delete_failed'          everything above done, auth delete failed
 *   In every failure case nothing has been deleted that would strand the
 *   user: the account still exists and the caller must show the error.
 */
import { postJson } from '@/lib/apiClient';

export interface DeleteAccountResult {
  ok: true;
  cancelledSubscriptions: number;
  deletedCustomer: boolean;
}

/** Cancel billing, remove storage, delete the account. Throws ApiError. */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  return postJson<DeleteAccountResult>('/account/delete', {}, { auth: true });
}
