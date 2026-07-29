import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createBillingRouter } from '../billing.js';

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
  const create = vi.fn(async () => ({
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
});
