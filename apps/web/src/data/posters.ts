/**
 * Poster repository — Supabase reads/writes for the `posters` table.
 *
 * Phase 3 only needs `loadPoster` + `loadMostRecentPoster` so the
 * Editor route can mount immediately. Phase 4 layers `upsertPoster`,
 * `listPosters`, `duplicatePoster`, `deletePoster` on top.
 */
import { supabase } from '@/lib/supabase';
import type { PosterDoc } from '@postr/shared';

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
 * Inserts a new poster row for the current user. The database has
 * a default value for `data` (a seeded empty PosterDoc), so the only
 * required field is `user_id`. We read it from the session rather
 * than trusting the caller.
 *
 * Used as a self-healing fallback when the editor expected an
 * Untitled Poster but none was found (e.g. after a local Supabase
 * reset that wiped auth.users while the browser still held a JWT).
 */
export async function createPoster(): Promise<PosterRow> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(`Cannot create poster — no active user: ${authError?.message ?? 'unknown'}`);
  }

  const { data, error } = await supabase
    .from('posters')
    .insert({ user_id: user.id })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create poster: ${error.message}`);
  }
  return data as unknown as PosterRow;
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
