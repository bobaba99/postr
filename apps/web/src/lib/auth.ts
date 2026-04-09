/**
 * Anonymous-first auth bootstrap.
 *
 * On first visit, the editor must mount with a real Supabase session
 * already in place — this is the foundation of the zero-friction
 * principle (PRD §17). ensureSession() is the single entry point:
 *
 *   - Reuses any existing session IF its user still exists server-side.
 *   - Otherwise calls signInAnonymously() exactly once, even under
 *     concurrent invocations (in-flight promise is shared).
 *   - Self-heals stale JWTs: after a local `supabase db reset` the
 *     browser still holds a token for a user that no longer exists.
 *     We detect the "User from sub claim in JWT does not exist" error,
 *     sign out to wipe localStorage, and re-bootstrap a fresh
 *     anonymous session.
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
 * Matches the Supabase error string returned when a JWT references
 * an auth.users row that no longer exists. This happens after a local
 * `supabase db reset` wipes the database while the browser still has
 * the old session cached in localStorage.
 */
export function isStaleJwtError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes('User from sub claim in JWT does not exist') ||
    message.includes('user_not_found') ||
    message.includes('JWT expired') // extra safety — treat expired JWTs the same
  );
}

/**
 * Signs out locally (wipes localStorage) and bootstraps a fresh
 * anonymous session. Used by the stale-JWT recovery path.
 */
async function reboostrapAnonymous(client: SupabaseClient): Promise<Session | null> {
  // scope: 'local' wipes the current tab's session without calling
  // the server (which would fail anyway with the stale JWT).
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // Ignore — signOut can throw if there's nothing to sign out of.
  }

  const result = await client.auth.signInAnonymously();
  if (result.error) {
    throw new Error(`Anonymous sign-in failed: ${result.error.message}`);
  }
  return result.data.session;
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
      // Validate that the cached session still refers to a real user.
      // getUser() hits the server — this is the only way to detect a
      // stale JWT after a `supabase db reset`.
      const { error: userError } = await client.auth.getUser();
      if (userError && isStaleJwtError(userError.message)) {
        // Wipe + re-bootstrap.
        return reboostrapAnonymous(client);
      }
      if (userError) {
        throw new Error(`Failed to validate Supabase session: ${userError.message}`);
      }
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
