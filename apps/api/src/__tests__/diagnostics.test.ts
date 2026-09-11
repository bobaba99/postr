import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDiagnosticsRouter } from '../diagnostics.js';
import { createLogger } from '../logger.js';
import type { DiagnosticEvent } from '@postr/shared';

const USER = { id: 'user-1', is_anonymous: true };

function stubSupabase(user: unknown = USER): () => SupabaseClient | null {
  return () =>
    ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    }) as unknown as SupabaseClient;
}

interface Harness {
  app: express.Express;
  records: () => Array<Record<string, unknown>>;
  setNow: (ms: number) => void;
}

function harness(
  opts: { dedupMs?: number; maxPerUserPerHour?: number } = {},
): Harness {
  const lines: string[] = [];
  let nowMs = 1_000_000;
  const app = express();
  app.use(express.json());
  app.use(
    createDiagnosticsRouter({
      getSupabaseAdmin: stubSupabase(),
      logger: createLogger({
        level: 'debug',
        write: (l) => lines.push(l),
        now: () => nowMs,
      }),
      now: () => nowMs,
      // The route mounts a real limiter in production; tests exercise the
      // dedup/budget logic, so a pass-through keeps them focused.
      rateLimiter: (_req, _res, next) => next(),
      ...opts,
    }),
  );
  return {
    app,
    records: () => lines.map((l) => JSON.parse(l)),
    setNow: (ms) => {
      nowMs = ms;
    },
  };
}

const fitEvent = (hiddenRightPx = 18): DiagnosticEvent => ({
  signal: {
    kind: 'fit_overflow',
    viewportW: 1728,
    canvasW: 911,
    posterW: 816,
    hiddenRightPx,
    overflowXPx: 132,
  },
  surface: 'poster-editor',
  at: 1_000_000,
});

const post = (app: express.Express, events: DiagnosticEvent[]) =>
  request(app)
    .post('/v1/diagnostics/ui')
    .set('authorization', 'Bearer token')
    .send({ events, appVersion: 'test-build' });

describe('POST /v1/diagnostics/ui', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = harness();
    const res = await request(app)
      .post('/v1/diagnostics/ui')
      .send({ events: [fitEvent()] });
    expect(res.status).toBe(401);
  });

  it('logs one line per accepted signal, tagged ui.<kind>', async () => {
    const h = harness();
    const res = await post(h.app, [fitEvent()]);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logged: 1, deduped: 0, dropped: 0 });

    const [rec] = h.records();
    expect(rec).toMatchObject({
      event: 'ui.fit_overflow',
      level: 'warn',
      userId: 'user-1',
      anonymous: true,
      surface: 'poster-editor',
      appVersion: 'test-build',
      hiddenRightPx: 18,
      overflowXPx: 132,
    });
  });

  it('counts an unknown signal kind as invalid instead of logging it', async () => {
    const h = harness();
    const res = await request(h.app)
      .post('/v1/diagnostics/ui')
      .set('authorization', 'Bearer token')
      .send({
        events: [{ signal: { kind: 'made_up' }, surface: 'other', at: 1 }],
      });

    expect(res.body).toMatchObject({ logged: 0, invalid: 1 });
    expect(
      h.records().some((r) => String(r.event).startsWith('ui.made_up')),
    ).toBe(false);
  });

  it('keeps valid events when a sibling in the batch is malformed', async () => {
    const h = harness();
    // Regression: an all-or-nothing batch parse discarded every event when
    // one was bad — losing exactly the signals worth having.
    const res = await post(h.app, [
      { signal: { kind: 'fit_overflow' } } as unknown as DiagnosticEvent,
      fitEvent(),
    ]);

    expect(res.body).toMatchObject({ logged: 1, invalid: 1 });
    expect(h.records().some((r) => r.event === 'ui.fit_overflow')).toBe(true);
  });

  it('carries a suppressed count forward when dedupMs is shorter than the prune interval', async () => {
    // Regression: the flush lived only in prune(), which runs at most once
    // per PRUNE_INTERVAL_MS (60s). With a shorter dedup window the entry
    // was overwritten and its count silently destroyed.
    const h = harness({ dedupMs: 30_000 });
    await post(h.app, [fitEvent(), fitEvent(), fitEvent()]); // 1 logged, 2 suppressed

    h.setNow(1_000_000 + 30_001); // dedup window closed; prune has NOT run
    await post(h.app, [fitEvent()]);

    const fits = h.records().filter((r) => r.event === 'ui.fit_overflow');
    expect(fits).toHaveLength(2);
    expect(fits[1]!.suppressedSincePrevious).toBe(2);
  });

  it('emits ui.budget_exceeded at most once per hour per user', async () => {
    // Regression: one warn line per over-budget batch, itself exempt from
    // the budget — at a 5s flush cadence that is 720 lines/hour, six times
    // the ceiling it was reporting on.
    const h = harness({ dedupMs: 0, maxPerUserPerHour: 1 });

    for (let i = 0; i < 6; i += 1) {
      h.setNow(1_000_000 + i * 5_000);
      await post(h.app, [fitEvent(i), fitEvent(i + 100)]);
    }

    expect(
      h.records().filter((r) => r.event === 'ui.budget_exceeded'),
    ).toHaveLength(1);
  });

  it('does not let a signal field shadow server-derived context', async () => {
    const h = harness();
    await post(h.app, [{ ...fitEvent(), surface: 'export' }]);
    const rec = h.records().find((r) => r.event === 'ui.fit_overflow');
    // surface comes from the validated envelope, never from the signal body.
    expect(rec!.surface).toBe('export');
    expect(rec!.userId).toBe('user-1');
  });

  it('collapses repeats of the same signature within the dedup window', async () => {
    const h = harness({ dedupMs: 60_000 });

    // A resize loop firing the same signal many times must not produce
    // many lines — this is the "not redundant" guarantee.
    await post(h.app, [fitEvent(18), fitEvent(19), fitEvent(20)]);
    const res = await post(h.app, [fitEvent(21)]);

    expect(res.body).toMatchObject({ logged: 0, deduped: 1 });
    expect(
      h.records().filter((r) => r.event === 'ui.fit_overflow'),
    ).toHaveLength(1);
  });

  it('flushes the suppressed count when the window closes, never losing it', async () => {
    const h = harness({ dedupMs: 60_000 });
    await post(h.app, [fitEvent(), fitEvent(), fitEvent()]); // 1 logged, 2 suppressed

    h.setNow(1_000_000 + 60_001); // window expires, prune flushes
    await post(h.app, [fitEvent()]);

    const flush = h.records().find((r) => r.event === 'ui.repeats_suppressed');
    expect(flush).toMatchObject({ signal: 'ui.fit_overflow', suppressed: 2 });
    // The count must be reported exactly once, not re-emitted afterwards.
    expect(
      h.records().filter((r) => r.event === 'ui.repeats_suppressed'),
    ).toHaveLength(1);
  });

  it('does not collapse two different defects into one signature', async () => {
    const h = harness({ dedupMs: 60_000 });
    const layout = (
      defect: 'text_overflow' | 'block_collision',
    ): DiagnosticEvent => ({
      signal: {
        kind: 'layout_defect',
        defect,
        count: 1,
        worstPx: 30,
        atExport: false,
      },
      surface: 'poster-editor',
      at: 1,
    });

    const res = await post(h.app, [
      layout('text_overflow'),
      layout('block_collision'),
    ]);
    expect(res.body).toMatchObject({ logged: 2, deduped: 0 });
  });

  it('caps how many lines one user can produce per hour and says so', async () => {
    const h = harness({ dedupMs: 0, maxPerUserPerHour: 2 });

    const res = await post(h.app, [
      fitEvent(1),
      fitEvent(2),
      fitEvent(3),
      fitEvent(4),
    ]);

    expect(res.body).toMatchObject({ logged: 2, dropped: 2 });
    // Silent truncation would read as success, so it is logged explicitly.
    expect(h.records().some((r) => r.event === 'ui.budget_exceeded')).toBe(
      true,
    );
  });

  it('rejects a batch larger than the shared maximum', async () => {
    const h = harness();
    const res = await post(
      h.app,
      Array.from({ length: 21 }, () => fitEvent()),
    );
    expect(res.status).toBe(400);
  });

  it('never echoes unvalidated fields into the log', async () => {
    const h = harness();
    await request(h.app)
      .post('/v1/diagnostics/ui')
      .set('authorization', 'Bearer token')
      .send({
        events: [
          {
            signal: {
              kind: 'duplicate_tab',
              state: 'detected',
              posterBody: 'SECRET TEXT',
            },
            surface: 'poster-editor',
            at: 1,
          },
        ],
      });

    expect(
      h.records().some((r) => JSON.stringify(r).includes('SECRET TEXT')),
    ).toBe(false);
  });
});
