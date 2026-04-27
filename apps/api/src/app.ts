import express, { type Express } from 'express';
import cors from 'cors';
import { createCronRouter } from './cron.js';
import { createImportRouter } from './import.js';

export function createApp(): Express {
  const app = express();

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
  app.use(express.json({ limit: '2mb' }));

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

  return app;
}
