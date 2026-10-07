/**
 * Fix 26 — a purchase started from a French page opens Stripe Checkout in
 * French and comes back to the French result pages.
 *
 * The web app's /auth/fr sends `lang: 'fr'` with the plan
 * (apps/web/src/data/billing.ts createCheckout). The session then carries
 * Stripe's Canadian French locale and the /fr result pages; anything else
 * (no lang, 'en', a value the API does not know) keeps today's session: no
 * locale (Stripe picks one from the browser) and the English pages.
 *
 * Entered where the browser enters: POST /billing/create-checkout, through
 * the router's auth and the duplicate-term guard, with a fake Stripe that
 * records what it is asked to create.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createBillingRouter } from '../billing.js';

function permanentUserSupabase(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { plan: 'free', plan_expires_at: null, subscription_status: null, stripe_customer_id: null },
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', email: 'jean.tremblay@example.com', is_anonymous: false } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
}

function buildApp() {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          created.push(params);
          return { url: 'https://checkout.stripe.test/session' };
        },
      },
    },
  } as unknown as Stripe;
  const app = express();
  app.use(express.json());
  app.use(createBillingRouter({ getStripe: () => stripe, getSupabaseAdmin: permanentUserSupabase }));
  return { app, created };
}

function checkout(app: express.Express, body: Record<string, unknown>) {
  return request(app)
    .post('/billing/create-checkout')
    .set('Authorization', 'Bearer token')
    .send(body);
}

describe('POST /billing/create-checkout — the page language', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'https://www.postr.sh');
    vi.stubEnv('STRIPE_PRICE_TERM', 'price_term');
    vi.stubEnv('STRIPE_PRICE_PACK', 'price_pack');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['term', 'pack'])('opens %s checkout in Canadian French and returns to the French pages for lang fr', async (sku) => {
    const { app, created } = buildApp();

    const res = await checkout(app, { sku, lang: 'fr' });

    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]?.locale).toBe('fr-CA');
    expect(created[0]?.success_url).toBe('https://www.postr.sh/billing/success/fr');
    expect(created[0]?.cancel_url).toBe('https://www.postr.sh/billing/cancel/fr');
  });

  it.each([
    ['no lang', {}],
    ['lang en', { lang: 'en' }],
    ['a language the API does not serve', { lang: 'de' }],
    ['a value that is not a string', { lang: ['fr'] }],
    ['a near miss', { lang: 'FR-ca' }],
  ])('keeps the English session for %s', async (_label, extra) => {
    const { app, created } = buildApp();

    const res = await checkout(app, { sku: 'term', ...extra });

    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty('locale');
    expect(created[0]?.success_url).toBe('https://www.postr.sh/billing/success');
    expect(created[0]?.cancel_url).toBe('https://www.postr.sh/billing/cancel');
  });
});
