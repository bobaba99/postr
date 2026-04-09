/**
 * Anonymous-first auth bootstrap.
 *
 * On first visit, the editor must mount with a real Supabase session
 * already in place — this is the foundation of the zero-friction
 * principle (PRD §17). ensureSession() is the single entry point:
 *
 *   - Reuses any existing session.
 *   - Otherwise calls signInAnonymously() exactly once, even under
 *     concurrent invocations (in-flight promise is shared).
 *   - Surfaces underlying errors instead of swallowing them.
 *
 * The accompanying handle_new_user() Postgres trigger ensures every
 * brand-new auth user immediately gets a public.users profile row
 * AND an Untitled Poster, so /p/:id can navigate straight in.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';

let inFlight: Promise<Session | null> | null = null;

/** Test helper — clears the in-flight dedupe between test cases. */
export function __resetAuthBootstrapForTests(): void {
  inFlight = null;
}

/**
 * Returns a Supabase Session, creating an anonymous one if necessary.
 * Concurrent callers share a single signInAnonymously() request.
 */
export function ensureSession(client: SupabaseClient): Promise<Session | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw new Error(`Failed to read Supabase session: ${error.message}`);
    }
    if (data.session) {
      return data.session;
    }

    const result = await client.auth.signInAnonymously();
    if (result.error) {
      throw new Error(`Anonymous sign-in failed: ${result.error.message}`);
    }
    return result.data.session;
  })();

  // Reset on failure so a retry can try again; keep on success
  // so subsequent concurrent callers see the same resolved value.
  inFlight.catch(() => {
    inFlight = null;
  });

  return inFlight;
}
