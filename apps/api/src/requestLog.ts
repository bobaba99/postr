/**
 * One structured line per API request, emitted on response finish.
 *
 * Why one line and not several: a request already produces a log line
 * from whatever handler ran. An access log that also narrated start,
 * auth and finish would triple the volume without adding a fact you
 * could not get from the single outcome line. So this logs once, at the
 * end, with the duration.
 *
 * Level carries the signal, so the log is filterable without parsing:
 *   5xx            → error
 *   4xx, or slow   → warn
 *   everything else→ info
 *
 * `/health` is skipped entirely — Render polls it continuously and those
 * lines would drown everything else.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { logger as defaultLogger, type Logger } from './logger.js';

export interface RequestLogOptions {
  /** Requests at or above this duration are logged at warn. Default 2000ms. */
  slowMs?: number;
  /** Paths that never produce a line. Default ['/health']. */
  skip?: string[];
  /**
   * Paths that produce a line only when something went wrong (status >=
   * 400). For routes that already log their own structured outcome, a 2xx
   * access line is a second, content-free record of the same event — but
   * their failures still need to be visible.
   */
  skipOnSuccess?: string[];
  logger?: Logger;
  now?: () => number;
}

export function createRequestLogger(
  options: RequestLogOptions = {},
): RequestHandler {
  const slowMs = options.slowMs ?? 2000;
  const skip = new Set(options.skip ?? ['/health']);
  // The diagnostics route logs its own outcome on success; its auth and
  // rate-limit rejections never reach that handler, so they are kept.
  const skipOnSuccess = new Set(
    options.skipOnSuccess ?? ['/v1/diagnostics/ui'],
  );
  const log = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip.has(req.path)) {
      next();
      return;
    }

    const startedAt = now();

    res.on('finish', () => {
      try {
        const ms = now() - startedAt;
        const status = res.statusCode;
        if (status < 400 && skipOnSuccess.has(req.path)) return;
        // res.locals.user is set by requireAuth when the route is authed;
        // absent for public and webhook routes, which is why it is optional.
        const user = (res.locals as { user?: User }).user;

        const level =
          status >= 500
            ? 'error'
            : status >= 400 || ms >= slowMs
              ? 'warn'
              : 'info';

        log[level]('http.request', {
          method: req.method,
          // req.route?.path keeps parameterised routes groupable (one
          // bucket for /v1/x/:id rather than one per id). Falls back to the
          // concrete path when no route matched, e.g. a 404.
          path: (req.route?.path as string | undefined) ?? req.path,
          status,
          ms,
          userId: user?.id,
          anonymous: user ? user.is_anonymous === true : undefined,
          slow: ms >= slowMs ? true : undefined,
        });
      } catch {
        // An uncaught throw in an EventEmitter listener exits the process.
        // Nothing about access logging is worth that.
      }
    });

    next();
  };
}
