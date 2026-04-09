import express, { type Express } from 'express';
import cors from 'cors';

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

  return app;
}
