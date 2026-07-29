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

const BUCKET_PRUNE_INTERVAL_MS = 60_000;

export function createRateLimiter(
  options: RateLimitOptions = {},
): RequestHandler {
  const windowMs = options.windowMs ?? 60_000;
  const maxPerWindow = options.maxPerWindow ?? 5;
  const dailyMs = options.dailyMs ?? 24 * 60 * 60 * 1000;
  const maxPerDay = options.maxPerDay ?? 20;
  const now = options.now ?? Date.now;
  const windowEnabled = maxPerWindow < Number.MAX_SAFE_INTEGER;
  const dailyEnabled = maxPerDay < Number.MAX_SAFE_INTEGER;

  const buckets = new Map<string, UserBucket>();
  let nextBucketPruneAt = 0;

  const pruneBucket = (bucket: UserBucket, t: number) => {
    bucket.windowEvents = windowEnabled
      ? bucket.windowEvents.filter((ts) => t - ts < windowMs)
      : [];
    bucket.dailyEvents = dailyEnabled
      ? bucket.dailyEvents.filter((ts) => t - ts < dailyMs)
      : [];
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (res.locals as AuthLocals).user as User | undefined;
    if (!user) {
      // requireAuth must run first; without a user we have nothing to
      // rate-limit on. Fail closed.
      res.status(401).json({ error: 'rate_limit_no_user' });
      return;
    }

    const t = now();
    if (t >= nextBucketPruneAt) {
      for (const [userId, candidate] of buckets) {
        pruneBucket(candidate, t);
        if (
          candidate.windowEvents.length === 0 &&
          candidate.dailyEvents.length === 0
        ) {
          buckets.delete(userId);
        }
      }
      nextBucketPruneAt = t + BUCKET_PRUNE_INTERVAL_MS;
    }

    let bucket = buckets.get(user.id);
    if (!bucket) {
      bucket = { windowEvents: [], dailyEvents: [] };
      buckets.set(user.id, bucket);
    }

    pruneBucket(bucket, t);

    if (windowEnabled && bucket.windowEvents.length >= maxPerWindow) {
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
    if (dailyEnabled && bucket.dailyEvents.length >= maxPerDay) {
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

    if (windowEnabled) bucket.windowEvents.push(t);
    if (dailyEnabled) bucket.dailyEvents.push(t);
    next();
  };
}
