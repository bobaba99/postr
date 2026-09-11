/**
 * UI diagnostics ingest — `POST /v1/diagnostics/ui`.
 *
 * The browser does most of its work directly against Supabase, so the API
 * never sees the failures a user actually hits. This route is the narrow
 * channel that makes them observable: the client reports a small, fixed
 * set of anomaly signals (see `@postr/shared` → types/diagnostics) and
 * each accepted one becomes a single structured log line.
 *
 * Keeping the log readable
 * ────────────────────────
 * "Comprehensive but not redundant" is enforced here, not left to the
 * client:
 *
 * - **Dedup window.** The same (user, kind, poster, sub-type) signature is
 *   logged once per `dedupMs`. Repeats increment a counter that is
 *   reported either as `suppressedSincePrevious` on the next line for
 *   that signature, or as a standalone `ui.repeats_suppressed` line when
 *   the window closes first — so the count is never silently lost. A
 *   resize loop firing `fit_overflow` 60×/s yields one line.
 * - **Per-user ceiling.** A hard cap per rolling hour bounds how much one
 *   client can write, so a broken build cannot exhaust the log budget.
 * - **Validation before logging.** Unknown kinds and malformed payloads
 *   are rejected, so the log only ever contains the known taxonomy.
 *
 * Auth: anonymous Supabase sessions are accepted deliberately — guests are
 * the majority of editor users and the ones whose problems most need
 * surfacing.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DIAGNOSTIC_BATCH_MAX, diagnosticSignatureDetail } from '@postr/shared';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { logger as defaultLogger, type Logger } from './logger.js';

const surface = z.enum([
  'poster-editor',
  'dashboard',
  'share',
  'export',
  'import',
  'other',
]);

/**
 * Each signal is validated against its own shape rather than a permissive
 * passthrough, so a client bug cannot inject arbitrary keys into the log.
 */
const signal = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('autosave_failed'),
    status: z.number().int().min(0).max(599),
    attempt: z.number().int().min(1).max(1000),
    sinceFirstMs: z.number().int().min(0),
    reason: z.enum(['permission_denied', 'auth', 'network', 'other']),
  }),
  z.object({
    kind: z.literal('undo_exhausted'),
    stackDepth: z.number().int().min(0),
    consecutiveNoops: z.number().int().min(0),
    evictedStructural: z.boolean(),
  }),
  z.object({
    kind: z.literal('undo_noop'),
    action: z.enum([
      'group_move',
      'group_resize',
      'single_move',
      'text',
      'other',
    ]),
    stackDepth: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('redo_unavailable'),
    afterAction: z.enum(['text', 'move', 'resize', 'other']),
  }),
  z.object({
    kind: z.literal('layout_defect'),
    defect: z.enum(['text_overflow', 'block_collision', 'out_of_bounds']),
    count: z.number().int().min(0),
    worstPx: z.number().int().min(0),
    atExport: z.boolean(),
  }),
  z.object({
    kind: z.literal('fit_overflow'),
    viewportW: z.number().int().min(0),
    canvasW: z.number().int().min(0),
    posterW: z.number().int().min(0),
    hiddenRightPx: z.number().int(),
    overflowXPx: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('paste_normalized'),
    flavor: z.enum(['html', 'plain']),
    sourceBlocks: z.number().int().min(0),
    resultBreaks: z.number().int().min(0),
    separatorsLost: z.number().int(),
    charsIn: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('client_error'),
    name: z.string().max(80),
    message: z.string().max(300),
    where: z.string().max(80),
    deadEnd: z.boolean(),
  }),
  z.object({
    kind: z.literal('session_invalid'),
    reason: z.enum(['permission_denied', 'no_user', 'expired', 'other']),
    route: z.string().max(120),
    recovered: z.boolean(),
  }),
  z.object({
    kind: z.literal('duplicate_tab'),
    state: z.enum(['detected', 'cleared']),
  }),
]);

const event = z.object({
  signal,
  surface,
  at: z.number().int().min(0),
  posterId: z.string().uuid().optional(),
});

/**
 * The envelope is validated separately from the events it carries.
 *
 * A batch is a best-effort report from a client that may itself be
 * misbehaving. Rejecting all 20 events because one is malformed would
 * discard exactly the signals most worth having — so each event is parsed
 * on its own and the bad ones are counted, not fatal.
 */
const batch = z.object({
  events: z.array(z.unknown()).min(1).max(DIAGNOSTIC_BATCH_MAX),
  appVersion: z.string().max(60).optional(),
});

export interface DiagnosticsDeps {
  /** Window in which an identical signature is collapsed. Default 60s. */
  dedupMs?: number;
  /** Max lines one user can produce per hour. Default 120. */
  maxPerUserPerHour?: number;
  /** Clock injection for tests. */
  now?: () => number;
  /** Logger injection for tests. */
  logger?: Logger;
  /** Supabase admin factory; defaults to env-configured client. */
  getSupabaseAdmin?: () => SupabaseClient | null;
  /** Rate limiter override (tests mount a permissive one). */
  rateLimiter?: RequestHandler;
}

interface DedupEntry {
  firstAt: number;
  /** Repeats collapsed into the line already emitted for this signature. */
  suppressed: number;
  /** Kept so the flush line can name what was collapsed. */
  kind: string;
  userId: string;
}

const PRUNE_INTERVAL_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Signature for collapsing repeats. Deliberately includes the sub-type
 * (defect / action / reason) so two genuinely different problems are never
 * folded into one another, but excludes magnitudes so a value that drifts
 * by a pixel each frame does not defeat the dedup.
 */
export function signatureOf(userId: string, ev: z.infer<typeof event>): string {
  const detail = diagnosticSignatureDetail(ev.signal);
  return `${userId}|${ev.signal.kind}|${detail}|${ev.posterId ?? ''}`;
}

export function createDiagnosticsRouter(deps: DiagnosticsDeps = {}): Router {
  const router = Router();
  const dedupMs = deps.dedupMs ?? 60_000;
  const maxPerUserPerHour = deps.maxPerUserPerHour ?? 120;
  const now = deps.now ?? Date.now;
  const log = deps.logger ?? defaultLogger;
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;

  const seen = new Map<string, DedupEntry>();
  const perUserHour = new Map<string, number[]>();
  let nextPruneAt = 0;

  const prune = (t: number) => {
    if (t < nextPruneAt) return;
    for (const [key, entry] of seen) {
      if (t - entry.firstAt < dedupMs) continue;
      // Flush before dropping: a collapsed count that is never reported
      // is worse than the noise it saved, because the log would then
      // understate how often the problem fired.
      if (entry.suppressed > 0) {
        log.warn('ui.repeats_suppressed', {
          userId: entry.userId,
          signal: `ui.${entry.kind}`,
          suppressed: entry.suppressed,
          windowMs: dedupMs,
        });
      }
      seen.delete(key);
    }
    for (const [userId, stamps] of perUserHour) {
      const kept = stamps.filter((ts) => t - ts < HOUR_MS);
      if (kept.length === 0) perUserHour.delete(userId);
      else perUserHour.set(userId, kept);
    }
    nextPruneAt = t + PRUNE_INTERVAL_MS;
  };

  const handler: RequestHandler = (req, res) => {
    const { user } = res.locals as AuthLocals;
    const parsed = batch.safeParse(req.body);
    if (!parsed.success) {
      // A malformed envelope is a client bug worth seeing when
      // investigating, but must not be able to fill the log itself.
      log.debug('ui.batch_rejected', {
        userId: user.id,
        issue: parsed.error.issues[0]?.path.join('.') ?? 'unknown',
      });
      res.status(400).json({ error: 'invalid_batch' });
      return;
    }

    const t = now();
    prune(t);

    const recent = (perUserHour.get(user.id) ?? []).filter(
      (ts) => t - ts < HOUR_MS,
    );
    let budget = maxPerUserPerHour - recent.length;

    let logged = 0;
    let deduped = 0;
    let dropped = 0;
    let invalid = 0;

    for (const raw of parsed.data.events) {
      const one = event.safeParse(raw);
      if (!one.success) {
        // Counted, not fatal: one bad event must not discard its valid
        // siblings, which are usually the signals worth having.
        invalid += 1;
        continue;
      }
      const ev = one.data;
      const key = signatureOf(user.id, ev);
      const prior = seen.get(key);

      if (prior && t - prior.firstAt < dedupMs) {
        prior.suppressed += 1;
        deduped += 1;
        continue;
      }
      if (budget <= 0) {
        dropped += 1;
        continue;
      }

      // The previous window for this signature closed without `prune`
      // having flushed it (possible whenever dedupMs < PRUNE_INTERVAL_MS).
      // Carry the count onto this line so it is never lost.
      const carried = prior?.suppressed ?? 0;

      const { kind, ...detail } = ev.signal;
      // Signal fields first, server-derived context last: a future signal
      // field named `surface`/`posterId`/`userId` must never shadow the
      // value we derived ourselves. Every field is a validated scalar and
      // the logger clamps strings, so nothing unbounded reaches the sink.
      log.warn(`ui.${kind}`, {
        ...detail,
        userId: user.id,
        anonymous: user.is_anonymous === true,
        surface: ev.surface,
        posterId: ev.posterId,
        appVersion: parsed.data.appVersion,
        clientAt: ev.at,
        suppressedSincePrevious: carried || undefined,
      });

      seen.set(key, { firstAt: t, suppressed: 0, kind, userId: user.id });
      recent.push(t);
      budget -= 1;
      logged += 1;
    }

    perUserHour.set(user.id, recent);

    if (dropped > 0) {
      // Routed through the same dedup map so a client stuck over budget
      // cannot write one of these per flush — that would make the
      // over-budget warning itself the biggest consumer of the budget.
      const key = `${user.id}|__budget__`;
      const prior = seen.get(key);
      if (!prior || t - prior.firstAt >= HOUR_MS) {
        log.warn('ui.budget_exceeded', {
          userId: user.id,
          dropped,
          maxPerUserPerHour,
        });
        seen.set(key, {
          firstAt: t,
          suppressed: 0,
          kind: 'budget_exceeded',
          userId: user.id,
        });
      }
    }

    res.json({ ok: true, logged, deduped, dropped, invalid });
  };

  router.post(
    '/v1/diagnostics/ui',
    requireAuth(getSupabase),
    // Every other authed router mounts a limiter. Without one, request
    // rate is unbounded regardless of the log budget — and each request
    // costs a live supabase.auth.getUser() round-trip.
    deps.rateLimiter ?? createRateLimiter({ maxPerWindow: 12, maxPerDay: 500 }),
    handler,
  );

  return router;
}

// ─────────────────────────────────────────────────────────────────────
// Default factories
// ─────────────────────────────────────────────────────────────────────

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
