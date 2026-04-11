/**
 * Cron endpoints — scheduled jobs invoked by GitHub Actions.
 *
 * Each job lives behind a shared-secret check via the `Authorization:
 * Bearer ${CRON_SECRET}` header. The secret is generated once with
 * `openssl rand -hex 32`, stored as an env var on Render (API) and as
 * a GitHub Actions repo secret, and never checked into source.
 *
 * Jobs currently registered:
 *   POST /cron/cleanup-anonymous-users — delete stale guest accounts
 *
 * Deliberately minimal framework: no cron scheduler in-process, no
 * queue. GitHub Actions is the scheduler; Express just exposes the
 * handler. Keeps the API stateless and Render-friendly.
 */
import type { Request, Response, Router } from 'express';
import express from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Stale guests older than this are candidates for deletion. Chosen
// deliberately long — 14 days gives someone who started a poster on
// Monday time to come back two weekends later without losing work.
const STALE_GUEST_DAYS = 14;

// Safety cap — never delete more than this many users in a single
// run. Protects against mass-delete bugs and makes the job easier to
// observe (we'd notice "deleted 200" but ignore "deleted 3").
const MAX_DELETIONS_PER_RUN = 500;

/**
 * Build the cron router. Takes a factory instead of a module-level
 * client so app.ts can unit-test this without the real Supabase
 * connection.
 */
export function createCronRouter(
  getSupabaseAdmin: () => SupabaseClient | null = defaultGetSupabaseAdmin,
): Router {
  const router = express.Router();

  router.post('/cron/cleanup-anonymous-users', async (req, res) => {
    if (!isAuthorizedCron(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(500).json({
        error: 'supabase_not_configured',
        message:
          'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for cron jobs.',
      });
    }

    try {
      const result = await cleanupAnonymousUsers(supabase);
      return res.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      // eslint-disable-next-line no-console
      console.error('[cron] cleanup-anonymous-users failed:', message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}

/**
 * Core cleanup logic. Exported for tests.
 *
 * Pages through `auth.admin.listUsers`, filters to `is_anonymous=true`
 * guests whose `last_sign_in_at` is older than STALE_GUEST_DAYS, and
 * deletes them via `auth.admin.deleteUser`. ON DELETE CASCADE foreign
 * keys handle removing their posters / feedback / gallery entries.
 */
export async function cleanupAnonymousUsers(
  supabase: SupabaseClient,
): Promise<{
  scanned: number;
  staleGuests: number;
  deleted: number;
  failed: number;
  cappedAt: number | null;
}> {
  const cutoff = new Date(
    Date.now() - STALE_GUEST_DAYS * 24 * 60 * 60 * 1000,
  );

  let page = 1;
  const perPage = 200;
  let scanned = 0;
  let staleGuests = 0;
  let deleted = 0;
  let failed = 0;
  let cappedAt: number | null = null;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(`listUsers page ${page}: ${error.message}`);
    }
    if (!data.users || data.users.length === 0) break;

    for (const user of data.users) {
      scanned++;
      // Defensive: only touch anonymous users. Never delete a
      // permanent account, even by accident.
      if (!user.is_anonymous) continue;

      const lastSeen = user.last_sign_in_at
        ? new Date(user.last_sign_in_at)
        : user.created_at
          ? new Date(user.created_at)
          : null;
      if (!lastSeen || lastSeen > cutoff) continue;

      staleGuests++;

      if (deleted + failed >= MAX_DELETIONS_PER_RUN) {
        cappedAt = MAX_DELETIONS_PER_RUN;
        break;
      }

      const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
      if (delErr) {
        failed++;
        // eslint-disable-next-line no-console
        console.error(
          `[cron] failed to delete guest ${user.id}: ${delErr.message}`,
        );
      } else {
        deleted++;
      }
    }

    if (cappedAt !== null) break;
    if (data.users.length < perPage) break;
    page++;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[cron] cleanup-anonymous-users scanned=${scanned} stale=${staleGuests} deleted=${deleted} failed=${failed} cappedAt=${cappedAt}`,
  );

  return { scanned, staleGuests, deleted, failed, cappedAt };
}

// ── Helpers ────────────────────────────────────────────────────────

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret = lock everything
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  const token = header.slice(prefix.length).trim();
  // Constant-time comparison to avoid timing attacks. Node's native
  // `timingSafeEqual` requires equal-length inputs; short-circuit on
  // length mismatch first so we don't throw.
  if (token.length !== secret.length) return false;
  return timingSafeEqual(token, secret);
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Expose a response type alias for tests that import this file.
export type CronResponse = Response;
