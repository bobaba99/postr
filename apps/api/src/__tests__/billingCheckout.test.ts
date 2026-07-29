import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  createBillingRouter,
  createBillingWebhookRouter,
} from '../billing.js';

function fakeSupabase(reviewAddon: boolean): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'user-1',
            email: 'member@example.com',
            is_anonymous: false,
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { review_addon: reviewAddon },
            error: null,
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function fakeStripe() {
  const create = vi.fn(async (
    _params?: Stripe.Checkout.SessionCreateParams,
    _options?: Stripe.RequestOptions,
  ) => ({
    url: 'https://checkout.stripe.test/session',
  }));
  return {
    stripe: {
      checkout: { sessions: { create } },
    } as unknown as Stripe,
    create,
  };
}

beforeEach(() => {
  process.env.STRIPE_PRICE_REVIEW_ADDON = 'price_review_addon';
});

afterEach(() => {
  delete process.env.STRIPE_PRICE_REVIEW_ADDON;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe('POST /billing/webhook — delayed review add-on payment', () => {
  it('leaves completed+unpaid inactive, then async-payment success activates it', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const updates: Array<Record<string, unknown>> = [];
    let active = false;
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                review_addon: active,
                review_addon_subscription_id: active
                  ? 'sub_addon_1'
                  : null,
              },
              error: null,
            })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => ({
          match: vi.fn(async (filters: Record<string, unknown>) => {
            if (filters.review_addon === false && !active) {
              active = true;
              updates.push(payload);
            }
            return { error: null };
          }),
        })),
      })),
    } as unknown as SupabaseClient;
    const baseSession = {
      id: 'cs_async_addon',
      client_reference_id: 'user-1',
      status: 'complete',
      payment_status: 'unpaid',
      mode: 'subscription',
      subscription: 'sub_addon_1',
      customer: 'cus_1',
      metadata: { user_id: 'user-1', sku: 'review_addon' },
    } as unknown as Stripe.Checkout.Session;
    let event = {
      type: 'checkout.session.completed',
      data: { object: baseSession },
    } as unknown as Stripe.Event;
    const retrieve = vi.fn(async () => ({
      id: 'sub_addon_1',
      status: 'active',
      customer: 'cus_1',
      metadata: { user_id: 'user-1', sku: 'review_addon' },
    }));
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => event),
      },
      subscriptions: { retrieve },
    } as unknown as Stripe;
    const app = express();
    app.use(
      createBillingWebhookRouter({
        getSupabaseAdmin: () => supabase,
        getStripe: () => stripe,
      }),
    );

    const completed = await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test-signature')
      .set('content-type', 'application/json')
      .send('{}');
    expect(completed.status).toBe(200);
    expect(active).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();

    event = {
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: { ...baseSession, payment_status: 'paid' },
      },
    } as unknown as Stripe.Event;
    const settled = await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test-signature')
      .set('content-type', 'application/json')
      .send('{}');

    expect(settled.status).toBe(200);
    expect(active).toBe(true);
    expect(updates).toEqual([
      expect.objectContaining({
        review_addon: true,
        review_addon_subscription_id: 'sub_addon_1',
      }),
    ]);
  });
});

describe('POST /billing/create-checkout — review add-on', () => {
  it('returns a clear conflict before Stripe when the add-on is already active', async () => {
    const supabase = fakeSupabase(true);
    const stripe = fakeStripe();
    const app = express();
    app.use(express.json());
    app.use(
      createBillingRouter({
        getSupabaseAdmin: () => supabase,
        getStripe: () => stripe.stripe,
      }),
    );

    const response = await request(app)
      .post('/billing/create-checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ sku: 'review_addon' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'review_addon_already_active',
      message: 'Your weekly review add-on is already active.',
    });
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('uses one stable Stripe idempotency key for concurrent add-on requests', async () => {
    const supabase = fakeSupabase(false);
    const stripe = fakeStripe();
    const app = express();
    app.use(express.json());
    app.use(
      createBillingRouter({
        getSupabaseAdmin: () => supabase,
        getStripe: () => stripe.stripe,
      }),
    );

    const send = () =>
      request(app)
        .post('/billing/create-checkout')
        .set('Authorization', 'Bearer test-token')
        .send({ sku: 'review_addon' });
    const [first, second] = await Promise.all([send(), send()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(stripe.create).toHaveBeenCalledTimes(2);
    const keys = stripe.create.mock.calls.map(
      ([, options]) => options?.idempotencyKey,
    );
    expect(keys[0]).toMatch(/^postr:review-addon:user-1:/);
    expect(new Set(keys)).toEqual(
      new Set(['postr:review-addon:user-1:price_review_addon']),
    );
  });
});
