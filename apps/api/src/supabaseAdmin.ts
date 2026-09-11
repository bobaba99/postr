/**
 * Shared Supabase admin (service_role) client factory — the only billing
 * / account writer. Used by billing.ts and account.ts (the routers that
 * move money or end accounts); returns null when the env is unset so the
 * routes answer a generic "not configured" instead of throwing at boot.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
