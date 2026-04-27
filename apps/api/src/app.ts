import express, { type Express } from 'express';
import cors from 'cors';
import { createCronRouter } from './cron.js';
import { createImportRouter } from './import.js';

export function createApp(): Express {
  const app = express();

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
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
