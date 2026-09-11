/**
 * Account — the authed route that ends an account without orphaning
 * billing (lifecycle audit P0-3).
 *
 * The old path was a one-statement RPC (`delete_own_account`: delete
 * from auth.users) that cascaded `public.users` — and with it the
 * `stripe_customer_id` / `stripe_subscription_id` — while Stripe kept
 * invoicing the live term every 4 months. Deletion now runs here, with
 * the service role, in an order where every failure leaves the account
 * in place for a retry and the irreversible auth delete is LAST:
 *
 *   1. load the user's billing columns (service-role read)
 *   2. Stripe: cancel every non-terminal subscription on the customer
 *      immediately (no proration), then delete the customer — Stripe
 *      documents that deleting a customer cancels its subscriptions,
 *      but the explicit cancels first mean a failed delete still stops
 *      billing
 *   3. Storage: remove the user's objects (a user who owns objects
 *      cannot be deleted — storageCleanup.ts)
 *   4. audit row in public.account_deletions (service-role only)
 *   5. auth.admin.deleteUser → cascades through the FK graph
 *
 * Client contract: apps/web/src/data/account.ts. Error codes map to
 * generic copy on the client; nothing raw reaches the user.
 * The RPC keeps existing for service_role but the migration revoked
 * EXECUTE from anon/authenticated, so this route is the only way in.
 */
import express, { type Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { getStripe as defaultGetStripe } from './stripeClient.js';
import { getSupabaseAdmin as defaultGetSupabaseAdmin } from './supabaseAdmin.js';
import { removeUserStorageObjects, StorageCleanupError } from './storageCleanup.js';

export type AccountDeleteErrorCode =
  | 'cancel_failed'
  | 'customer_delete_failed'
  | 'storage_cleanup_failed'
  | 'delete_failed';

/** A step failed; `status` is 502 for Stripe, 500 otherwise. */
export class AccountDeleteError extends Error {
  constructor(
    readonly code: AccountDeleteErrorCode,
    readonly status: 500 | 502,
    message: string,
  ) {
    super(message);
    this.name = 'AccountDeleteError';
  }
}

interface AccountDeps {
  getStripe?: () => Stripe | null;
  getSupabaseAdmin?: () => SupabaseClient | null;
}

export interface DeleteAccountOutcome {
  cancelledSubscriptions: number;
  deletedCustomer: boolean;
}

interface BillingRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  review_addon_subscription_id: string | null;
}

interface BillingWindDown {
  cancelledSubscriptionIds: string[];
  deletedCustomer: boolean;
}

/** Statuses Stripe will not let us cancel (and that no longer bill). */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['canceled', 'incomplete_expired']);

const EMPTY_BILLING_ROW: BillingRow = {
  stripe_customer_id: null,
  stripe_subscription_id: null,
  review_addon_subscription_id: null,
};

export function createAccountRouter(deps: AccountDeps = {}): Router {
  const getStripe = deps.getStripe ?? defaultGetStripe;
  const getSupabaseAdmin = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const router = express.Router();

  // Deletion is a one-shot per account; the limit only bounds retries of
  // a failing step (3/hour) and outright hammering (10/day).
  const deleteLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxPerWindow: 3,
    maxPerDay: 10,
  });

  // Guests may delete themselves too — no requirePermanent.
  router.post(
    '/account/delete',
    requireAuth(getSupabaseAdmin),
    deleteLimiter,
    async (_req: Request, res: Response) => {
      const stripe = getStripe();
      const supabase = getSupabaseAdmin();
      if (!stripe || !supabase) {
        return res.status(500).json({ error: 'account_not_configured' });
      }
      const user = (res.locals as AuthLocals).user;

      try {
        const outcome = await deleteAccountForUser({ stripe, supabase }, user.id);
        return res.json({ ok: true, ...outcome });
      } catch (err) {
        const failure = toAccountDeleteError(err);
        // eslint-disable-next-line no-console
        console.error(`[account] delete failed (${failure.code}) for ${user.id}:`, failure.message);
        return res.status(failure.status).json({ error: failure.code });
      }
    },
  );

  return router;
}

/**
 * Run the deletion steps in order. Throws AccountDeleteError naming the
 * step that failed; nothing irreversible has happened unless the throw
 * comes from the very last step.
 */
export async function deleteAccountForUser(
  clients: { stripe: Stripe; supabase: SupabaseClient },
  userId: string,
): Promise<DeleteAccountOutcome> {
  const { stripe, supabase } = clients;
  const row = await loadBillingRow(supabase, userId);
  const billing = await windDownBilling(stripe, row);
  const storageObjectsRemoved = await cleanupStorage(supabase, userId);
  await writeAuditRow(supabase, {
    user_id: userId,
    stripe_customer_id: row.stripe_customer_id,
    cancelled_subscription_ids: billing.cancelledSubscriptionIds,
    storage_objects_removed: storageObjectsRemoved,
  });
  await deleteAuthUser(supabase, userId);
  return {
    cancelledSubscriptions: billing.cancelledSubscriptionIds.length,
    deletedCustomer: billing.deletedCustomer,
  };
}

async function loadBillingRow(supabase: SupabaseClient, userId: string): Promise<BillingRow> {
  const { data, error } = await supabase
    .from('users')
    .select('stripe_customer_id, stripe_subscription_id, review_addon_subscription_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new AccountDeleteError('delete_failed', 500, `users lookup: ${error.message}`);
  }
  // A guest that never got a profile row has nothing to wind down.
  return { ...EMPTY_BILLING_ROW, ...((data as Partial<BillingRow> | null) ?? {}) };
}

/**
 * Cancel every live subscription, then delete the customer. Stored
 * subscription ids the customer listing did not return (a customer id
 * lost or never written) are checked individually so a stray live sub
 * still gets cancelled.
 */
async function windDownBilling(stripe: Stripe, row: BillingRow): Promise<BillingWindDown> {
  const customerId = row.stripe_customer_id;
  const listed = customerId ? await listSubscriptions(stripe, customerId) : [];
  const strays = await retrieveStrays(stripe, row, listed);
  const live = [...listed, ...strays].filter((sub) => !TERMINAL_STATUSES.has(sub.status));

  const cancelledSubscriptionIds: string[] = [];
  for (const sub of live) {
    if (await cancelSubscription(stripe, sub.id)) cancelledSubscriptionIds.push(sub.id);
  }

  const deletedCustomer = customerId ? await deleteCustomer(stripe, customerId) : false;
  return { cancelledSubscriptionIds, deletedCustomer };
}

async function listSubscriptions(stripe: Stripe, customerId: string): Promise<Stripe.Subscription[]> {
  try {
    const page = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    return page.data;
  } catch (err) {
    // A customer deleted by an earlier, partially failed attempt.
    if (isResourceMissing(err)) return [];
    throw new AccountDeleteError('cancel_failed', 502, `subscriptions.list: ${errorMessage(err)}`);
  }
}

async function retrieveStrays(
  stripe: Stripe,
  row: BillingRow,
  listed: Stripe.Subscription[],
): Promise<Stripe.Subscription[]> {
  const listedIds = new Set(listed.map((sub) => sub.id));
  const strayIds = [row.stripe_subscription_id, row.review_addon_subscription_id]
    .filter((id): id is string => Boolean(id))
    .filter((id) => !listedIds.has(id));
  const found = await Promise.all(strayIds.map((id) => retrieveSubscription(stripe, id)));
  return found.filter((sub): sub is Stripe.Subscription => sub !== null);
}

async function retrieveSubscription(stripe: Stripe, id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (err) {
    if (isResourceMissing(err)) return null;
    throw new AccountDeleteError('cancel_failed', 502, `subscriptions.retrieve ${id}: ${errorMessage(err)}`);
  }
}

/** Immediate cancel, no proration. Returns false when it was already gone. */
async function cancelSubscription(stripe: Stripe, id: string): Promise<boolean> {
  try {
    await stripe.subscriptions.cancel(id, { prorate: false });
    return true;
  } catch (err) {
    if (isResourceMissing(err)) return false;
    throw new AccountDeleteError('cancel_failed', 502, `subscriptions.cancel ${id}: ${errorMessage(err)}`);
  }
}

/** Returns true when Stripe confirmed the delete; false if already gone. */
async function deleteCustomer(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const result = await stripe.customers.del(customerId);
    return result.deleted === true;
  } catch (err) {
    if (isResourceMissing(err)) return false;
    throw new AccountDeleteError('customer_delete_failed', 502, `customers.del: ${errorMessage(err)}`);
  }
}

async function cleanupStorage(supabase: SupabaseClient, userId: string): Promise<number> {
  try {
    return await removeUserStorageObjects(supabase, userId);
  } catch (err) {
    const detail = err instanceof StorageCleanupError ? err.message : errorMessage(err);
    throw new AccountDeleteError('storage_cleanup_failed', 500, detail);
  }
}

async function writeAuditRow(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    stripe_customer_id: string | null;
    cancelled_subscription_ids: string[];
    storage_objects_removed: number;
  },
): Promise<void> {
  const { error } = await supabase.from('account_deletions').insert(row);
  if (error) {
    throw new AccountDeleteError('delete_failed', 500, `account_deletions insert: ${error.message}`);
  }
}

async function deleteAuthUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    throw new AccountDeleteError('delete_failed', 500, `auth.admin.deleteUser: ${error.message}`);
  }
}

function toAccountDeleteError(err: unknown): AccountDeleteError {
  if (err instanceof AccountDeleteError) return err;
  return new AccountDeleteError('delete_failed', 500, errorMessage(err));
}

/** stripe-node sets `code: 'resource_missing'` on a 404 for a known id shape. */
function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'resource_missing'
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
