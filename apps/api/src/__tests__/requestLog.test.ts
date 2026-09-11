import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequestLogger } from '../requestLog.js';
import { createLogger } from '../logger.js';

function harness(
  opts: { slowMs?: number; skip?: string[]; skipOnSuccess?: string[] } = {},
) {
  const lines: string[] = [];
  const app = express();
  app.use(
    createRequestLogger({
      ...opts,
      logger: createLogger({
        level: 'debug',
        write: (l) => lines.push(l),
        now: () => 1_700_000_000_000,
      }),
    }),
  );
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/v1/diagnostics/ui', (req, res) =>
    req.query.fail ? res.status(401).json({ e: 1 }) : res.json({ ok: true }),
  );
  app.get('/v1/thing/:id', (_req, res) => res.json({ ok: true }));
  app.get('/boom', (_req, res) => res.status(500).json({ e: 1 }));
  app.get('/nope', (_req, res) => res.status(403).json({ e: 1 }));
  return { app, records: () => lines.map((l) => JSON.parse(l)) };
}

describe('createRequestLogger', () => {
  it('emits exactly one line per request', async () => {
    const h = harness();
    await request(h.app).get('/v1/thing/abc');
    expect(h.records()).toHaveLength(1);
    expect(h.records()[0]).toMatchObject({
      event: 'http.request',
      method: 'GET',
      status: 200,
      level: 'info',
    });
  });

  it('groups parameterised routes into one bucket', async () => {
    const h = harness();
    await request(h.app).get('/v1/thing/abc');
    await request(h.app).get('/v1/thing/xyz');
    // One bucket, not one path per id — otherwise the log is unaggregatable.
    expect(h.records().map((r) => r.path)).toEqual([
      '/v1/thing/:id',
      '/v1/thing/:id',
    ]);
  });

  it('skips /health always and the diagnostics route only on success', async () => {
    const h = harness();
    await request(h.app).get('/health');
    await request(h.app).get('/v1/diagnostics/ui');
    // /health is polled continuously; a successful diagnostics batch
    // already logs its own structured outcome.
    expect(h.records()).toHaveLength(0);

    // But its rejections never reach that handler, so they must stay
    // visible or auth failures become invisible.
    await request(h.app).get('/v1/diagnostics/ui?fail=1');
    expect(h.records()).toHaveLength(1);
    expect(h.records()[0]).toMatchObject({ status: 401, level: 'warn' });
  });

  it('raises the level for 4xx and 5xx', async () => {
    const h = harness();
    await request(h.app).get('/nope');
    await request(h.app).get('/boom');
    expect(h.records().map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('flags slow requests at warn', async () => {
    const h = harness({ slowMs: 0 });
    await request(h.app).get('/v1/thing/abc');
    expect(h.records()[0]).toMatchObject({ level: 'warn', slow: true });
  });

  it('never lets a logging failure escape the finish listener', async () => {
    // An uncaught throw in a res.on('finish') listener exits the process,
    // so the logger must swallow its own failures.
    const app = express();
    app.use(
      createRequestLogger({
        logger: {
          level: 'debug',
          debug: () => {},
          info: () => {
            throw new Error('sink exploded');
          },
          warn: () => {},
          error: () => {},
        },
      }),
    );
    app.get('/ok', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
  });
});
