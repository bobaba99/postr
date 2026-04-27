/**
 * In-memory per-user rate limiting + daily-cap middleware.
 *
 * Suitable for a single-instance Render API. When traffic justifies
 * horizontal scaling, swap the maps for a Redis-backed store; the
 * factory shape stays the same.
 *
 * Two layers:
 *   - Sliding-window short burst limit (default 5 req / 60s)
 *   - Daily total cap per user (default 20 req / 24h)
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import type { AuthLocals } from './auth.js';

export interface RateLimitOptions {
  /** Burst window in milliseconds. */
  windowMs?: number;
  /** Max requests in the burst window per user. */
  maxPerWindow?: number;
  /** Daily cap window (default 24h). */
  dailyMs?: number;
  /** Max requests in the daily window per user. */
  maxPerDay?: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

interface UserBucket {
  windowEvents: number[];
  dailyEvents: number[];
}

export function createRateLimiter(
  options: RateLimitOptions = {},
): RequestHandler {
  const windowMs = options.windowMs ?? 60_000;
  const maxPerWindow = options.maxPerWindow ?? 5;
  const dailyMs = options.dailyMs ?? 24 * 60 * 60 * 1000;
  const maxPerDay = options.maxPerDay ?? 20;
  const now = options.now ?? Date.now;

  const buckets = new Map<string, UserBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (res.locals as AuthLocals).user as User | undefined;
    if (!user) {
      // requireAuth must run first; without a user we have nothing to
      // rate-limit on. Fail closed.
      res.status(401).json({ error: 'rate_limit_no_user' });
      return;
    }

    const t = now();
    let bucket = buckets.get(user.id);
    if (!bucket) {
      bucket = { windowEvents: [], dailyEvents: [] };
      buckets.set(user.id, bucket);
    }

    bucket.windowEvents = bucket.windowEvents.filter(
      (ts) => t - ts < windowMs,
    );
    bucket.dailyEvents = bucket.dailyEvents.filter(
      (ts) => t - ts < dailyMs,
    );

    if (bucket.windowEvents.length >= maxPerWindow) {
      const retryAfter = Math.ceil(
        (windowMs - (t - bucket.windowEvents[0]!)) / 1000,
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'rate_limited',
        message: `Too many requests — wait ${retryAfter}s.`,
      });
      return;
    }
    if (bucket.dailyEvents.length >= maxPerDay) {
      const retryAfter = Math.ceil(
        (dailyMs - (t - bucket.dailyEvents[0]!)) / 1000,
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'daily_limit_exceeded',
        message: `Daily import limit (${maxPerDay}) reached.`,
      });
      return;
    }

    bucket.windowEvents.push(t);
    bucket.dailyEvents.push(t);
    next();
  };
}
