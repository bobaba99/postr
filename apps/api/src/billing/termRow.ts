/**
 * Read the term-related columns of a users row for a webhook (P0-3).
 *
 * A subscription event can resolve to a user id that no longer has a
 * users row (subscription metadata still carries the uuid). Two very
 * different situations look identical at the users table:
 *
 *   - POST /account/delete ran: it cancelled the subscription, deleted
 *     the Stripe customer and wrote `public.account_deletions` BEFORE the
 *     auth delete. Stripe's `customer.subscription.deleted` for that
 *     cancel then routinely arrives after the row is gone. That is a
 *     recognised terminal outcome — the caller acknowledges the event
 *     (200) and writes nothing. Answering 500 here would put every
 *     paying-account deletion into Stripe's multi-day retry loop and
 *     eventually get the endpoint disabled.
 *   - No deletion record: a live subscription is billing a non-existent
 *     account (the genuine orphan). A blind UPDATE would match 0 rows and
 *     the webhook would answer 200, hiding it. Reading first turns that
 *     into an operator-visible error → 500 → Stripe retries and the
 *     failure shows up in the endpoint's delivery log.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TermRow } from './subscriptionGuard.js';

export const TERM_ROW_COLUMNS =
  'plan, plan_expires_at, stripe_subscription_id, subscription_status';

export class UserRowMissingError extends Error {
  constructor(userId: string, context: string) {
    super(
      `[billing] ${context}: user ${userId} resolved but has no users row (deleted account?) — refusing a 0-row update`,
    );
    this.name = 'UserRowMissingError';
  }
}

/**
 * The stored term columns for `userId`, or null when the account was
 * deliberately deleted (an `account_deletions` audit row exists — the
 * caller acknowledges the event and stops). Throws UserRowMissingError
 * (after logging for the operator) when the row is missing AND no
 * deletion is recorded, and a plain Error on a read failure (→ 500 →
 * retry).
 */
export async function readTermRow(
  supabase: SupabaseClient,
  userId: string,
  context: string,
): Promise<TermRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select(TERM_ROW_COLUMNS as never)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`${context}: users read: ${error.message}`);
  if (data) return data as TermRow;

  const deletion = await readAccountDeletion(supabase, userId, context);
  if (deletion) {
    // eslint-disable-next-line no-console
    console.error(
      `[billing] ${context}: user ${userId} was deleted via POST /account/delete on ${deletion.deleted_at} — acknowledging the event, nothing to reconcile`,
      { userId, context, deletedAt: deletion.deleted_at },
    );
    return null;
  }

  const err = new UserRowMissingError(userId, context);
  // eslint-disable-next-line no-console
  console.error(err.message, { userId, context });
  throw err;
}

interface AccountDeletionRow {
  id: string;
  deleted_at: string;
}

/** The audit row POST /account/delete wrote for `userId`, if any. */
async function readAccountDeletion(
  supabase: SupabaseClient,
  userId: string,
  context: string,
): Promise<AccountDeletionRow | null> {
  const { data, error } = await supabase
    .from('account_deletions')
    .select('id, deleted_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`${context}: account_deletions read: ${error.message}`);
  return (data as AccountDeletionRow | null) ?? null;
}
