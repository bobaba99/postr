/**
 * Poster repository — Supabase reads/writes for the `posters` table.
 *
 * Scope:
 *   - loadPoster / loadMostRecentPoster — single-row reads
 *   - createPoster / loadOrCreateMostRecentPoster — editor landing path
 *   - upsertPoster — autosave target (Task 4.2)
 *   - listPosters — Home page grid (Task 4.3)
 *   - duplicatePoster / deletePoster — Home page row actions
 *
 * Every function converts a Supabase `error` into a thrown `Error` with
 * a descriptive message. Callers never have to inspect `{ data, error }`
 * tuples themselves.
 */
import { supabase } from '@/lib/supabase';
import { isStaleJwtError } from '@/lib/auth';
import type { Database, Json, PosterDoc } from '@postr/shared';

type PosterUpdateRow = Database['public']['Tables']['posters']['Update'];

/**
 * Wipes the local session and bootstraps a fresh anonymous one.
 * Used when a Supabase call fails with "User from sub claim in JWT
 * does not exist" — typically after a `supabase db reset` on a tab
 * that still holds the old JWT in localStorage.
 */
async function reboostrapAnonymous(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore — nothing to sign out of is fine
  }
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Anonymous re-sign-in failed: ${error.message}`);
  }
}

export interface PosterRow {
  id: string;
  user_id: string;
  title: string;
  width_in: number;
  height_in: number;
  data: PosterDoc;
  thumbnail_path: string | null;
  share_slug: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** Fields that autosave + rename flows are allowed to write. */
export interface PosterUpdate {
  title?: string;
  widthIn?: number;
  heightIn?: number;
  data?: PosterDoc;
  thumbnailPath?: string | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Load a single poster by id. Returns null if the row doesn't exist
 * or the current user can't read it (RLS).
 */
export async function loadPoster(id: string): Promise<PosterRow | null> {
  const { data, error } = await supabase
    .from('posters')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load poster: ${error.message}`);
  }
  if (!data) return null;
  return data as unknown as PosterRow;
}

/**
 * Returns the most recently updated poster for the current user.
 * Used by the Editor route when the URL contains `/p/new` or any
 * other id we couldn't resolve.
 */
export async function loadMostRecentPoster(): Promise<PosterRow | null> {
  const { data, error } = await supabase
    .from('posters')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load most recent poster: ${error.message}`);
  }
  if (!data) return null;
  return data as unknown as PosterRow;
}

/**
 * Lists every poster the current user can see, newest first.
 * RLS scopes the result set server-side — no need to filter by
 * user_id on the client.
 */
export async function listPosters(): Promise<PosterRow[]> {
  const { data, error } = await supabase
    .from('posters')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list posters: ${error.message}`);
  }
  return (data ?? []) as unknown as PosterRow[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Inserts a new poster row for the current user. The database has
 * a default value for `data` (a seeded empty PosterDoc), so the only
 * required field is `user_id`. We read it from the session rather
 * than trusting the caller.
 *
 * Used as a self-healing fallback when the editor expected an
 * Untitled Poster but none was found (e.g. after a local Supabase
 * reset that wiped auth.users while the browser still held a JWT),
 * and as the "+ New poster" button handler on the Home page.
 */
export async function createPoster(): Promise<PosterRow> {
  // One self-healing retry: if the cached JWT is for a user that no
  // longer exists (post `supabase db reset`), wipe + re-bootstrap
  // and try again once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && isStaleJwtError(authError.message)) {
      await reboostrapAnonymous();
      continue;
    }

    if (authError || !user) {
      throw new Error(
        `Cannot create poster — no active user: ${authError?.message ?? 'unknown'}`,
      );
    }

    const { data, error } = await supabase
      .from('posters')
      .insert({ user_id: user.id })
      .select('*')
      .single();

    if (error && isStaleJwtError(error.message)) {
      await reboostrapAnonymous();
      continue;
    }

    if (error) {
      throw new Error(`Failed to create poster: ${error.message}`);
    }
    return data as unknown as PosterRow;
  }

  throw new Error('Failed to create poster after re-authenticating');
}

/**
 * Loads the user's most recent poster, or creates one if none exists.
 * This is the happy-path entry point the Editor route uses to guarantee
 * the user always lands on a real, editable document.
 */
export async function loadOrCreateMostRecentPoster(): Promise<PosterRow> {
  const existing = await loadMostRecentPoster();
  if (existing) return existing;
  return createPoster();
}

/**
 * Patches a poster row. Used by:
 *   - the autosave hook (passes `data`)
 *   - the rename action (passes `title`)
 *   - size-change actions (passes `widthIn` / `heightIn`)
 *   - thumbnail capture (passes `thumbnailPath`)
 *
 * Always bumps `updated_at` so the Home page ordering reflects the
 * most recent edit.
 */
export async function upsertPoster(id: string, update: PosterUpdate): Promise<PosterRow> {
  const payload: PosterUpdateRow = {
    updated_at: new Date().toISOString(),
  };
  if (update.title !== undefined) payload.title = update.title;
  if (update.widthIn !== undefined) payload.width_in = update.widthIn;
  if (update.heightIn !== undefined) payload.height_in = update.heightIn;
  if (update.data !== undefined) payload.data = update.data as unknown as Json;
  if (update.thumbnailPath !== undefined) payload.thumbnail_path = update.thumbnailPath;

  const { data, error } = await supabase
    .from('posters')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save poster: ${error.message}`);
  }
  return data as unknown as PosterRow;
}

/**
 * Clones an existing poster into a new row owned by the same user.
 * The copy gets "(copy)" appended to the title, inherits the `data`
 * snapshot verbatim, and starts with `share_slug = null` /
 * `is_public = false` so duplicates are never accidentally public.
 */
export async function duplicatePoster(id: string): Promise<PosterRow> {
  const source = await loadPoster(id);
  if (!source) {
    throw new Error(`Cannot duplicate poster ${id}: not found`);
  }

  const { data, error } = await supabase
    .from('posters')
    .insert({
      user_id: source.user_id,
      title: `${source.title} (copy)`,
      width_in: source.width_in,
      height_in: source.height_in,
      data: source.data as unknown as Json,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to duplicate poster: ${error.message}`);
  }
  return data as unknown as PosterRow;
}

/**
 * Hard-deletes a poster row. The `assets` and `presets` tables
 * cascade through foreign keys, so the row deletion is sufficient
 * to drop the entire poster + its related rows.
 *
 * Orphaned storage objects are swept by the nightly cron (Task 10.2).
 */
export async function deletePoster(id: string): Promise<void> {
  const { error } = await supabase.from('posters').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete poster: ${error.message}`);
  }
}
