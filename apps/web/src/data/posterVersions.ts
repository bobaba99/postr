/**
 * Poster versions repository — Supabase reads/writes for the
 * `poster_versions` table.
 *
 * A version is a full PosterDoc snapshot the user explicitly saves (a
 * "Save As" checkpoint), distinct from autosave. The editor's Versions
 * sidebar tab lists them newest-first, restores any snapshot, and
 * auto-saves the current state as a version before restoring so the
 * action is never destructive.
 *
 * Every function converts a Supabase `error` into a thrown `Error` with
 * a descriptive message, matching the posters repository.
 */
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PosterDoc } from '@postr/shared';

// `poster_versions` isn't in the generated Database type until
// `npm run db:types` regenerates against the applied migration. Use an
// untyped alias here (same pattern as the comments repository) and keep
// callers honest via PosterVersion.
const db = supabase as unknown as SupabaseClient;

export interface PosterVersion {
  id: string;
  poster_id: string;
  user_id: string;
  name: string;
  data: PosterDoc;
  created_at: string;
}

/** Metadata-only row for the history list — omits the heavy `data`
 *  JSONB (which can carry base64 images) so listing stays fast. */
export type PosterVersionSummary = Omit<PosterVersion, 'data'>;

/**
 * Soft cap enforced client-side: manual "Save Version" is blocked once
 * a poster has this many versions. The database backstops at 30, which
 * leaves headroom for the automatic "Before restore" snapshot.
 */
export const MAX_VERSIONS_PER_POSTER = 20;

/** Show a "running low on version slots" warning at/above this count. */
export const VERSION_WARNING_THRESHOLD = 15;

/**
 * List a poster's versions, newest first. Excludes the `data` column
 * so the sidebar can render the list without pulling every snapshot's
 * full document.
 */
export async function listVersions(posterId: string): Promise<PosterVersionSummary[]> {
  const { data, error } = await db
    .from('poster_versions')
    .select('id,poster_id,user_id,name,created_at')
    .eq('poster_id', posterId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list versions: ${error.message}`);
  return (data ?? []) as PosterVersionSummary[];
}

/**
 * Save a version snapshot of `data` for `posterId`. Reads `user_id`
 * from the session rather than trusting the caller — RLS requires
 * `user_id = auth.uid()` anyway.
 */
export async function saveVersion(
  posterId: string,
  name: string,
  data: PosterDoc,
): Promise<PosterVersion> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(
      `Cannot save version — no active user: ${authError?.message ?? 'unknown'}`,
    );
  }

  const { data: row, error } = await db
    .from('poster_versions')
    .insert({ poster_id: posterId, user_id: user.id, name, data })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save version: ${error.message}`);
  return row as PosterVersion;
}

/** Delete a single version. RLS restricts this to the owner. */
export async function deleteVersion(versionId: string): Promise<void> {
  const { error } = await db.from('poster_versions').delete().eq('id', versionId);
  if (error) throw new Error(`Failed to delete version: ${error.message}`);
}

/**
 * Load a version's full PosterDoc for restore. Returns null when the
 * version doesn't exist or RLS hides it.
 */
export async function loadVersion(versionId: string): Promise<PosterDoc | null> {
  const { data, error } = await db
    .from('poster_versions')
    .select('data')
    .eq('id', versionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load version: ${error.message}`);
  if (!data) return null;
  return (data as { data: PosterDoc }).data;
}
