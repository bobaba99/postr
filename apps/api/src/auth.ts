/**
 * Auth middleware factory for routes that require a real Supabase user
 * session. Verifies the Bearer JWT against `auth.getUser`, attaches
 * the resolved user to `res.locals.user`, and rejects with 401
 * otherwise.
 *
 * Anonymous Supabase sessions (`is_anonymous = true`) are accepted by
 * default — a guest is still a real user from RLS's perspective. Pass
 * `{ requirePermanent: true }` to gate features behind a converted
 * account.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface RequireAuthOptions {
  requirePermanent?: boolean;
}

export interface AuthLocals {
  user: User;
}

export function requireAuth(
  getSupabaseAdmin: () => SupabaseClient | null,
  options: RequireAuthOptions = {},
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') || req.header('Authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ error: 'missing_bearer_token' });
      return;
    }
    const token = header.slice('bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'missing_bearer_token' });
      return;
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      res.status(500).json({
        error: 'supabase_not_configured',
        message:
          'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for auth.',
      });
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({
        error: 'invalid_session',
        message: error?.message ?? 'token_unrecognized',
      });
      return;
    }

    if (options.requirePermanent && data.user.is_anonymous) {
      res.status(403).json({ error: 'permanent_account_required' });
      return;
    }

    (res.locals as AuthLocals).user = data.user;
    next();
  };
}
