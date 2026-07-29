import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from '../rateLimit.js';

function invoke(limiter: ReturnType<typeof createRateLimiter>, userId: string) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = {
    locals: { user: { id: userId } },
    setHeader: vi.fn(),
    status,
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  limiter({} as Request, res, next);

  return { json, next, status };
}

describe('createRateLimiter bucket lifecycle', () => {
  it('opportunistically drops an inactive user after all enabled windows expire', () => {
    let nowMs = 0;
    const limiter = createRateLimiter({
      windowMs: 1_000,
      maxPerWindow: 1,
      // This is how callers disable the daily layer. It must not keep a
      // bucket alive for hundreds of thousands of years.
      dailyMs: Number.MAX_SAFE_INTEGER,
      maxPerDay: Number.MAX_SAFE_INTEGER,
      now: () => nowMs,
    });

    expect(invoke(limiter, 'stale-user').next).toHaveBeenCalledOnce();

    // Another user's later request is the opportunistic sweep trigger.
    nowMs = 60_001;
    expect(invoke(limiter, 'active-user').next).toHaveBeenCalledOnce();

    // Rewind only to make bucket retention observable without a production
    // bucket-count/debug API. If stale-user was pruned, this is a fresh user;
    // if retained, its old event makes this request hit the 1-request cap.
    nowMs = 0;
    const afterSweep = invoke(limiter, 'stale-user');
    expect(afterSweep.next).toHaveBeenCalledOnce();
    expect(afterSweep.status).not.toHaveBeenCalled();
  });
});
