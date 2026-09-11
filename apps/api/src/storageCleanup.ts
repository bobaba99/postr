/**
 * Storage cleanup for account deletion.
 *
 * Supabase documents that an auth user who still owns Storage objects
 * cannot be deleted, and nothing else in the product garbage-collects a
 * user's files (the lifecycle audit's H-12). Every user-scoped bucket
 * keys its objects under `{user_id}/…`:
 *
 *   poster-assets/{uid}/{poster_id}/…       figures, thumbnail.jpg,
 *                                            review-capture.jpg
 *   poster-assets/{uid}/review-temp/{batch}/ rendered review pages
 *   user-logos/{uid}/{logo_id}.{ext}         the logo library
 *   gallery/{uid}/…                          gallery uploads
 *
 * (apps/web/src/data/thumbnails.ts, posterImages.ts, userLogos.ts,
 * gallery.ts.) Storage `list` is one level deep and returns folders as
 * entries with a null id, so the walk recurses folder by folder and
 * removes files in batches. Runs with the service_role client — the
 * caller has already verified the session belongs to `userId`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Buckets that hold user-owned objects under a `{user_id}/` prefix. */
export const USER_STORAGE_BUCKETS = ['poster-assets', 'user-logos', 'gallery'] as const;

/** Page size for `list` — Storage defaults to 100; larger is allowed. */
const LIST_PAGE_SIZE = 1000;
/** Paths per `remove` call — keeps each request comfortably bounded. */
const REMOVE_BATCH_SIZE = 100;
/** Folder depth guard: the deepest real path is uid/review-temp/batch/file. */
const MAX_DEPTH = 8;

export class StorageCleanupError extends Error {
  constructor(
    readonly bucket: string,
    readonly operation: 'list' | 'remove',
    message: string,
  ) {
    super(`[${bucket}] ${operation}: ${message}`);
    this.name = 'StorageCleanupError';
  }
}

interface ListedEntry {
  name: string;
  id: string | null;
}

/**
 * Remove every object the user owns across USER_STORAGE_BUCKETS.
 * Returns the number of objects removed. Throws StorageCleanupError on
 * the first failed Storage call — the caller treats that as "do not
 * delete the auth user yet".
 */
export async function removeUserStorageObjects(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  let removed = 0;
  for (const bucket of USER_STORAGE_BUCKETS) {
    const paths = await collectFilePaths(supabase, bucket, userId, 0);
    removed += await removeInBatches(supabase, bucket, paths);
  }
  return removed;
}

/** Recursively list every file path under `prefix` in `bucket`. */
async function collectFilePaths(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
  depth: number,
): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const entries = await listAll(supabase, bucket, prefix);
  const files = entries
    .filter((entry) => entry.id !== null)
    .map((entry) => `${prefix}/${entry.name}`);
  const folders = entries.filter((entry) => entry.id === null);
  const nested = await Promise.all(
    folders.map((folder) =>
      collectFilePaths(supabase, bucket, `${prefix}/${folder.name}`, depth + 1),
    ),
  );
  return [...files, ...nested.flat()];
}

/** Page through `list` until a short page comes back. */
async function listAll(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<ListedEntry[]> {
  const pages: ListedEntry[][] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new StorageCleanupError(bucket, 'list', error.message);
    const page = (data ?? []) as ListedEntry[];
    pages.push(page);
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return pages.flat();
}

/** Remove `paths` from `bucket` in bounded batches; returns the count. */
async function removeInBatches(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new StorageCleanupError(bucket, 'remove', error.message);
    removed += batch.length;
  }
  return removed;
}
