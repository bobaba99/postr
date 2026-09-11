/**
 * POST /account/delete — account deletion that does not orphan billing.
 *
 * The order is the contract (apps/web/src/data/account.ts): cancel every
 * live Stripe subscription → delete the Stripe customer → remove the
 * user's Storage objects → write the audit row → delete the auth user.
 * The irreversible auth delete is LAST, so every failure leaves the
 * account in place for a retry. Stripe + Supabase are faked; each fake
 * appends to one shared `calls` log so the order itself is assertable.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createAccountRouter } from '../account.js';
import { removeUserStorageObjects, StorageCleanupError } from '../storageCleanup.js';

const USER_ID = '0d000000-0000-4000-a000-000000000001';

interface FakeSub {
  id: string;
  status: Stripe.Subscription.Status;
}

interface StripeFakeOptions {
  subscriptions?: FakeSub[];
  cancelError?: Error;
  deleteError?: Error;
}

/** A Stripe error the way stripe-node raises it (`code` on the instance). */
function stripeError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code, type: 'StripeInvalidRequestError' });
}

function fakeStripe(calls: string[], opts: StripeFakeOptions = {}) {
  const cancelled: Array<{ id: string; params: unknown }> = [];
  const stripe = {
    subscriptions: {
      list: vi.fn(async (params: Stripe.SubscriptionListParams) => {
        calls.push(`stripe.subscriptions.list:${params.customer}`);
        return { data: opts.subscriptions ?? [] };
      }),
      retrieve: vi.fn(async (id: string) => {
        calls.push(`stripe.subscriptions.retrieve:${id}`);
        const found = (opts.subscriptions ?? []).find((s) => s.id === id);
        if (!found) throw stripeError('resource_missing', `No such subscription: ${id}`);
        return found;
      }),
      cancel: vi.fn(async (id: string, params: unknown) => {
        calls.push(`stripe.subscriptions.cancel:${id}`);
        if (opts.cancelError) throw opts.cancelError;
        cancelled.push({ id, params });
        return { id, status: 'canceled' };
      }),
    },
    customers: {
      del: vi.fn(async (id: string) => {
        calls.push(`stripe.customers.del:${id}`);
        if (opts.deleteError) throw opts.deleteError;
        return { id, object: 'customer', deleted: true };
      }),
    },
  };
  return { stripe: stripe as unknown as Stripe, cancelled, raw: stripe };
}

interface SupabaseFakeOptions {
  isAnonymous?: boolean;
  usersRow?: Record<string, unknown> | null;
  /** bucket → prefix → entries (folders have id null). */
  storage?: Record<string, Record<string, Array<{ name: string; id: string | null }>>>;
  storageListError?: boolean;
  storageRemoveError?: boolean;
  deleteUserError?: { message: string } | null;
  auditInsertError?: { message: string } | null;
}

function fakeSupabase(calls: string[], opts: SupabaseFakeOptions = {}) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const deleteUser = vi.fn(async (id: string) => {
    calls.push(`supabase.auth.admin.deleteUser:${id}`);
    return { data: { user: null }, error: opts.deleteUserError ?? null };
  });

  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: USER_ID,
            email: opts.isAnonymous ? undefined : 'jane.doe@example.com',
            is_anonymous: opts.isAnonymous ?? false,
          },
        },
        error: null,
      }),
      admin: { deleteUser },
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.usersRow === undefined ? null : opts.usersRow,
              error: null,
            }),
          }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          calls.push(`supabase.insert:${table}`);
          inserts.push({ table, payload });
          return { error: opts.auditInsertError ?? null };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          list: async (prefix?: string) => {
            calls.push(`storage.list:${bucket}/${prefix ?? ''}`);
            if (opts.storageListError) {
              return { data: null, error: new Error('list boom') };
            }
            const entries = opts.storage?.[bucket]?.[prefix ?? ''] ?? [];
            return { data: entries, error: null };
          },
          remove: async (paths: string[]) => {
            calls.push(`storage.remove:${bucket}:${paths.length}`);
            if (opts.storageRemoveError) {
              return { data: null, error: new Error('remove boom') };
            }
            removed.push({ bucket, paths });
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, removed, inserts, deleteUser };
}

/** poster-assets/{uid}/{poster}/thumbnail.jpg + user-logos/{uid}/logo.png */
function userStorage(uid: string) {
  return {
    'poster-assets': {
      [uid]: [{ name: 'poster-1', id: null }],
      [`${uid}/poster-1`]: [
        { name: 'thumbnail.jpg', id: 'f1' },
        { name: 'review-capture.jpg', id: 'f2' },
      ],
    },
    'user-logos': {
      [uid]: [{ name: 'logo-1.png', id: 'f3' }],
    },
  };
}

function buildApp(stripe: Stripe, supabase: SupabaseClient) {
  const app = express();
  app.use(express.json());
  app.use(
    createAccountRouter({
      getStripe: () => stripe,
      getSupabaseAdmin: () => supabase,
    }),
  );
  return app;
}

function del(app: express.Express) {
  return request(app).post('/account/delete').set('Authorization', 'Bearer token').send({});
}

describe('POST /account/delete — happy path', () => {
  it('cancels every live subscription, deletes the customer, cleans storage, then deletes the user', async () => {
    const calls: string[] = [];
    const { stripe, cancelled } = fakeStripe(calls, {
      subscriptions: [
        { id: 'sub_term', status: 'active' },
        { id: 'sub_addon', status: 'past_due' },
        { id: 'sub_old', status: 'canceled' },
      ],
    });
    const { client, removed, inserts, deleteUser } = fakeSupabase(calls, {
      usersRow: {
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_term',
        review_addon_subscription_id: 'sub_addon',
      },
      storage: userStorage(USER_ID),
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelledSubscriptions: 2, deletedCustomer: true });

    // Immediate, un-prorated cancels — the terminal sub is left alone.
    expect(cancelled).toEqual([
      { id: 'sub_term', params: { prorate: false } },
      { id: 'sub_addon', params: { prorate: false } },
    ]);

    // Order: Stripe list → cancels → customer delete → storage → audit → auth delete.
    const stripeCalls = calls.filter((c) => c.startsWith('stripe.'));
    expect(stripeCalls).toEqual([
      'stripe.subscriptions.list:cus_1',
      'stripe.subscriptions.cancel:sub_term',
      'stripe.subscriptions.cancel:sub_addon',
      'stripe.customers.del:cus_1',
    ]);
    const lastStripe = calls.lastIndexOf('stripe.customers.del:cus_1');
    const firstStorage = calls.findIndex((c) => c.startsWith('storage.'));
    const audit = calls.indexOf('supabase.insert:account_deletions');
    const authDelete = calls.indexOf(`supabase.auth.admin.deleteUser:${USER_ID}`);
    expect(lastStripe).toBeLessThan(firstStorage);
    expect(firstStorage).toBeLessThan(audit);
    expect(audit).toBeLessThan(authDelete);
    expect(authDelete).toBe(calls.length - 1);

    // Storage: the nested poster folder was walked, both buckets emptied.
    expect(removed).toEqual([
      { bucket: 'poster-assets', paths: [`${USER_ID}/poster-1/thumbnail.jpg`, `${USER_ID}/poster-1/review-capture.jpg`] },
      { bucket: 'user-logos', paths: [`${USER_ID}/logo-1.png`] },
    ]);

    // Audit row — service-role insert with what was wound down.
    expect(inserts).toEqual([
      {
        table: 'account_deletions',
        payload: {
          user_id: USER_ID,
          stripe_customer_id: 'cus_1',
          cancelled_subscription_ids: ['sub_term', 'sub_addon'],
          storage_objects_removed: 3,
        },
      },
    ]);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('skips Stripe entirely when the user has no customer id', async () => {
    const calls: string[] = [];
    const { stripe, raw } = fakeStripe(calls);
    const { client, deleteUser, inserts } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: null, stripe_subscription_id: null, review_addon_subscription_id: null },
      storage: userStorage(USER_ID),
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    expect(raw.subscriptions.list).not.toHaveBeenCalled();
    expect(raw.customers.del).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(inserts[0]?.payload).toMatchObject({
      stripe_customer_id: null,
      cancelled_subscription_ids: [],
      storage_objects_removed: 3,
    });
  });

  it('lets an anonymous (guest) session delete itself', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls);
    const { client, deleteUser } = fakeSupabase(calls, { isAnonymous: true, usersRow: null });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('treats an already-deleted Stripe customer as wound down (retry after a partial failure)', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls, {
      deleteError: stripeError('resource_missing', 'No such customer: cus_1'),
    });
    const { client, deleteUser } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: 'cus_1' },
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelledSubscriptions: 0, deletedCustomer: false });
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('cancels a stored subscription id the customer listing did not return', async () => {
    const calls: string[] = [];
    const { stripe, cancelled } = fakeStripe(calls, {
      subscriptions: [{ id: 'sub_stray', status: 'active' }],
    });
    // The listing fake only returns subs for the customer; the stray id is
    // "known" to retrieve but absent from the listing (simulated by the
    // fake returning it from retrieve only).
    const raw = stripe as unknown as { subscriptions: { list: ReturnType<typeof vi.fn> } };
    raw.subscriptions.list.mockResolvedValueOnce({ data: [] });
    const { client } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_stray' },
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(200);
    expect(res.body.cancelledSubscriptions).toBe(1);
    expect(cancelled.map((c) => c.id)).toEqual(['sub_stray']);
  });
});

describe('POST /account/delete — every failure leaves the auth user in place', () => {
  it('502 cancel_failed when Stripe refuses a cancel; customer + user untouched', async () => {
    const calls: string[] = [];
    const { stripe, raw } = fakeStripe(calls, {
      subscriptions: [{ id: 'sub_term', status: 'active' }],
      cancelError: new Error('stripe down'),
    });
    const { client, deleteUser, removed } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: 'cus_1' },
      storage: userStorage(USER_ID),
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'cancel_failed' });
    expect(raw.customers.del).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('502 customer_delete_failed after the subs are cancelled; user untouched', async () => {
    const calls: string[] = [];
    const { stripe, cancelled } = fakeStripe(calls, {
      subscriptions: [
        { id: 'sub_term', status: 'active' },
        { id: 'sub_addon', status: 'trialing' },
      ],
      deleteError: new Error('stripe down'),
    });
    const { client, deleteUser, removed } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: 'cus_1' },
      storage: userStorage(USER_ID),
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'customer_delete_failed' });
    // Billing still stopped: the explicit cancels ran before the delete.
    expect(cancelled.map((c) => c.id)).toEqual(['sub_term', 'sub_addon']);
    expect(removed).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 storage_cleanup_failed when a Storage call fails; user untouched', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls);
    const { client, deleteUser, inserts } = fakeSupabase(calls, {
      usersRow: { stripe_customer_id: null },
      storage: userStorage(USER_ID),
      storageRemoveError: true,
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'storage_cleanup_failed' });
    expect(inserts).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 delete_failed when the auth delete itself fails', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls);
    const { client, deleteUser } = fakeSupabase(calls, {
      usersRow: null,
      deleteUserError: { message: 'auth down' },
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'delete_failed' });
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('500 delete_failed when the audit row cannot be written; user untouched', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls);
    const { client, deleteUser } = fakeSupabase(calls, {
      usersRow: null,
      auditInsertError: { message: 'db down' },
    });

    const res = await del(buildApp(stripe, client));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'delete_failed' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('401 without a bearer token', async () => {
    const calls: string[] = [];
    const { stripe } = fakeStripe(calls);
    const { client, deleteUser } = fakeSupabase(calls);

    const res = await request(buildApp(stripe, client)).post('/account/delete').send({});

    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 account_not_configured when Stripe or Supabase is missing', async () => {
    const calls: string[] = [];
    const { client } = fakeSupabase(calls);
    const app = express();
    app.use(express.json());
    app.use(createAccountRouter({ getStripe: () => null, getSupabaseAdmin: () => client }));

    const res = await del(app);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'account_not_configured' });
  });
});

describe('removeUserStorageObjects', () => {
  it('walks nested folders across the user buckets and returns the removed count', async () => {
    const calls: string[] = [];
    const { client, removed } = fakeSupabase(calls, {
      storage: {
        'poster-assets': {
          [USER_ID]: [
            { name: 'poster-1', id: null },
            { name: 'review-temp', id: null },
          ],
          [`${USER_ID}/poster-1`]: [{ name: 'thumbnail.jpg', id: 'f1' }],
          [`${USER_ID}/review-temp`]: [{ name: 'batch-1', id: null }],
          [`${USER_ID}/review-temp/batch-1`]: [
            { name: 'page-1.jpg', id: 'f2' },
            { name: 'page-2.jpg', id: 'f3' },
          ],
        },
        gallery: { [USER_ID]: [{ name: 'upload.png', id: 'f4' }] },
      },
    });

    const count = await removeUserStorageObjects(client, USER_ID);

    expect(count).toBe(4);
    expect(removed).toEqual([
      {
        bucket: 'poster-assets',
        paths: [
          `${USER_ID}/poster-1/thumbnail.jpg`,
          `${USER_ID}/review-temp/batch-1/page-1.jpg`,
          `${USER_ID}/review-temp/batch-1/page-2.jpg`,
        ],
      },
      { bucket: 'gallery', paths: [`${USER_ID}/upload.png`] },
    ]);
  });

  it('is a no-op for a user with nothing stored', async () => {
    const calls: string[] = [];
    const { client, removed } = fakeSupabase(calls, { storage: {} });

    expect(await removeUserStorageObjects(client, USER_ID)).toBe(0);
    expect(removed).toEqual([]);
  });

  it('throws StorageCleanupError when a list call fails', async () => {
    const calls: string[] = [];
    const { client } = fakeSupabase(calls, { storageListError: true });

    await expect(removeUserStorageObjects(client, USER_ID)).rejects.toBeInstanceOf(StorageCleanupError);
  });
});
