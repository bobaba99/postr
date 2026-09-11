import express, { type Express } from 'express';
import cors from 'cors';
import { createCronRouter } from './cron.js';
import { createImportRouter } from './import.js';
import { createNarrativeRouter } from './narrative.js';
import { createReviewRouter } from './review.js';
import { createBillingRouter, createBillingWebhookRouter } from './billing.js';
import { createAccountRouter } from './account.js';
import { readFeatureFlags } from './features.js';

export function createApp(): Express {
  const app = express();
  // Read once per app — see features.ts for what each flag gates.
  const features = readFeatureFlags();

  // Vite picks the next free port (5174, 5175, …) when 5173 is
  // already in use, which happens routinely in dev when an old
  // server didn't shut down cleanly. Default-allow the common
  // localhost dev ports so a port collision doesn't silently 502
  // every figure-import call. Production sets CORS_ORIGINS
  // explicitly so this default never applies there.
  const origins = (
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:5174,http://localhost:5175'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(cors({ origin: origins }));

  // The Stripe webhook is mounted BEFORE express.json(): signature
  // verification needs the RAW request bytes, so this router applies its
  // own express.raw() to the webhook route. It must see the body before
  // any JSON parser consumes it.
  app.use(createBillingWebhookRouter());

  app.use(express.json({ limit: '2mb' }));

  // The authed billing routes (create-checkout) read a parsed JSON body,
  // so they mount AFTER express.json(). The flags decide whether the
  // review SKUs are sellable; the term + pack always are.
  app.use(createBillingRouter({ features }));

  // Account deletion (POST /account/delete) — cancels Stripe billing and
  // removes Storage objects BEFORE the auth delete, so a paying user can
  // never be deleted into an orphaned subscription (account.ts).
  app.use(createAccountRouter());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Scheduled jobs (invoked by GitHub Actions cron). Auth lives
  // inside the router via CRON_SECRET bearer check.
  app.use(createCronRouter());

  // Vision-based poster import. Each route inside enforces its own
  // auth + rate-limit. ANTHROPIC_API_KEY required at request time;
  // missing key returns 500 only when the route fires.
  app.use(createImportRouter());

  // Manuscript narrative endpoints (condense for paper-to-poster;
  // extract-findings / style-deck / theme for paper-to-slides). Their
  // UI is deactivated (apps/web/src/routes.tsx header), so the router
  // is mounted only behind FEATURE_MANUSCRIPT — otherwise every
  // /api/narrative/* call is a plain 404. OPENAI_API_KEY required at
  // request time; missing key returns 500 only when a route fires.
  if (features.manuscript) {
    app.use(createNarrativeRouter());
  }

  // Presentation Checker — poster/talk critique. Deactivated with its
  // UI (the /presentation-checker page and the editor review tab), so
  // it mounts only behind FEATURE_REVIEW. ANTHROPIC_API_KEY + Supabase
  // service key required at request time; missing config returns 500
  // only when a route fires.
  if (features.review) {
    app.use(createReviewRouter());
  }

  return app;
}
