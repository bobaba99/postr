/**
 * Singleton Supabase browser client.
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from import.meta.env.
 * Throws at module load time if either is missing — fail fast rather
 * than ship a half-configured client into the editor.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@postr/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in apps/web/.env',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
