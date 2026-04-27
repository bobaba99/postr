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
 * In-flight dedup cache — prevents React 18 StrictMode double-mount
 * from firing two identical network requests for the same poster.
 * The promise is cached while in-flight and cleared on resolve/reject.
 */
const inflightLoads = new Map<string, Promise<PosterRow | null>>();

/**
 * Load a single poster by id. Returns null if the row doesn't exist
 * or the current user can't read it (RLS). Deduplicates concurrent
 * requests for the same id.
 */
export function loadPoster(id: string): Promise<PosterRow | null> {
  const existing = inflightLoads.get(id);
  if (existing) return existing;

  const promise = (async (): Promise<PosterRow | null> => {
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
  })();

  inflightLoads.set(id, promise);
  // Clean up the cache when the request settles. The .catch(noop)
  // prevents an unhandled rejection from the .finally() chain — the
  // caller's own .catch() handles the real error.
  promise.finally(() => inflightLoads.delete(id)).catch(() => {});
  return promise;
}

/**
 * Load a publicly-shared poster by its `share_slug`. Returns null
 * when the slug doesn't resolve or the poster isn't public. RLS does
 * the heavy lifting — any anonymous session can read rows where
 * `is_public = true`.
 */
export async function loadPosterBySlug(slug: string): Promise<PosterRow | null> {
  const { data, error } = await supabase
    .from('posters')
    .select('*')
    .eq('share_slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load shared poster: ${error.message}`);
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

/** Lightweight poster row for dashboard listing — no `data` column. */
export type PosterListRow = Omit<PosterRow, 'data'>;

/**
 * Lists posters owned by the current user, newest first.
 *
 * Excludes the heavy `data` JSONB column (which contains base64
 * images) to keep the response small and fast (~10ms vs ~900ms+).
 *
 * The explicit `user_id` filter matters: RLS now also exposes any
 * `is_public = true` row to every authenticated user (for the share
 * viewer), so a bare select would surface other users' published
 * posters in the dashboard. The filter pins the dashboard back to
 * "my posters only".
 */
export async function listPosters(): Promise<PosterListRow[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(
      `Cannot list posters — no active user: ${authError?.message ?? 'unknown'}`,
    );
  }

  const { data, error } = await supabase
    .from('posters')
    .select('id,user_id,title,width_in,height_in,thumbnail_path,share_slug,is_public,created_at,updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list posters: ${error.message}`);
  }
  return (data ?? []) as unknown as PosterListRow[];
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
 * Clones an existing poster into a new row owned by the **current**
 * authenticated user. The copy gets "(copy)" appended to the title,
 * inherits the `data` snapshot verbatim, and starts with
 * `share_slug = null` / `is_public = false` so duplicates are never
 * accidentally public.
 *
 * Always uses `auth.uid()` for the new row's `user_id` rather than
 * `source.user_id`. The `posters_insert_own` RLS policy enforces
 * `auth.uid() = user_id` WITH CHECK, so copying a public poster
 * owned by another user would otherwise fail with "new row violates
 * row-level security policy". With this rule the duplicate is always
 * the current user's, regardless of the source's owner.
 */
export async function duplicatePoster(id: string): Promise<PosterRow> {
  const source = await loadPoster(id);
  if (!source) {
    throw new Error(`Cannot duplicate poster ${id}: not found`);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(
      `Cannot duplicate poster — no active user: ${authError?.message ?? 'unknown'}`,
    );
  }

  const { data, error } = await supabase
    .from('posters')
    .insert({
      user_id: user.id,
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

  const copy = data as unknown as PosterRow;

  // Best-effort: copy the source's thumbnail into the new user's
  // storage folder so the dashboard preview shows up immediately.
  //
  // Without this, the duplicate carries `thumbnail_path = null` and
  // the only path that ever populates a thumbnail is the autosave's
  // post-write capture — which never fires unless the user actually
  // edits the doc. Opening + closing a fresh duplicate would leave a
  // permanently blank card.
  //
  // Failures here (cross-user RLS denial when forking a public
  // poster, storage hiccup, etc.) are intentionally swallowed — the
  // duplicate is still usable and the thumbnail will be regenerated
  // on the next autosave.
  if (source.thumbnail_path) {
    try {
      const newThumbPath = `${user.id}/${copy.id}/thumbnail.jpg`;
      const { error: copyError } = await supabase.storage
        .from('poster-assets')
        .copy(source.thumbnail_path, newThumbPath);
      if (!copyError) {
        await supabase
          .from('posters')
          .update({ thumbnail_path: newThumbPath })
          .eq('id', copy.id);
        copy.thumbnail_path = newThumbPath;
      }
    } catch {
      // Swallowed — see comment above.
    }
  }

  return copy;
}

/**
 * Make a poster publicly readable and mint a URL slug if one doesn't
 * already exist. Returns the slug so the caller can build a full
 * `/s/:slug` URL for the clipboard.
 *
 * The slug is a base36 random string — 10 chars is ~50 bits of entropy,
 * which is far more than enough to keep share URLs unguessable for an
 * academic-review tool. On the (very rare) unique-index collision we
 * simply try a fresh slug; three retries covers any realistic clash.
 */
export async function ensureShareLink(posterId: string): Promise<string> {
  const existing = await loadPoster(posterId);
  if (!existing) throw new Error(`Poster ${posterId} not found`);
  if (existing.share_slug && existing.is_public) return existing.share_slug;

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug =
      existing.share_slug ??
      Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 10);

    const { data, error } = await supabase
      .from('posters')
      .update({ share_slug: slug, is_public: true })
      .eq('id', posterId)
      .select('share_slug')
      .single();

    // Unique violation (23505) → new slug, try again.
    if (error && /duplicate key|23505/i.test(error.message)) continue;
    if (error) throw new Error(`Failed to publish share link: ${error.message}`);
    return (data as { share_slug: string }).share_slug;
  }

  throw new Error('Could not mint a unique share link after 3 tries');
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
