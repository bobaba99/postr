/**
 * Poster image upload — saves image files to Supabase Storage instead
 * of embedding base64 in the JSONB document.
 *
 * Storage path convention: {userId}/{posterId}/{blockId}.{ext}
 * The block's imageSrc stores "storage://{path}" as the discriminator.
 */
import { supabase } from '@/lib/supabase';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL = 3600; // 1 hour
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Prefix that marks an imageSrc as a Storage path (not base64/URL). */
export const STORAGE_PREFIX = 'storage://';

/** Check if an imageSrc value is a storage path. */
export function isStoragePath(src: string | null): boolean {
  return !!src && src.startsWith(STORAGE_PREFIX);
}

/** Extract the raw storage path from a prefixed imageSrc. */
export function extractStoragePath(src: string): string {
  return src.slice(STORAGE_PREFIX.length);
}

/**
 * Upload an image File to poster-assets and return the storage
 * imageSrc value ("storage://{path}"). Returns null on failure.
 */
export async function uploadPosterImage(
  userId: string,
  posterId: string,
  blockId: string,
  file: File,
): Promise<string | null> {
  if (file.size > MAX_IMAGE_BYTES) return null;
  if (!file.type.startsWith('image/')) return null;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/${posterId}/${blockId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

  if (error) return null;
  return `${STORAGE_PREFIX}${path}`;
}

/**
 * Upload a base64 data URL to Storage (for migrating existing posters).
 * Returns the storage imageSrc value or null on failure.
 */
export async function uploadBase64Image(
  userId: string,
  posterId: string,
  blockId: string,
  dataUrl: string,
): Promise<string | null> {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  if (!match) return null;

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]!;
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: `image/${ext}` });

  const path = `${userId}/${posterId}/${blockId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: `image/${ext}`,
      upsert: true,
    });

  if (error) return null;
  return `${STORAGE_PREFIX}${path}`;
}

// ── Signed URL cache ─────────────────────────────────────────────────

interface CachedUrl {
  url: string;
  expiresAt: number;
}

/** Module-level signed URL cache — survives re-renders. */
const urlCache = new Map<string, CachedUrl>();
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (URLs expire at 60)

/** In-flight resolution guard to prevent duplicate sign requests. */
const inflightSigns = new Map<string, Promise<string | null>>();

/**
 * Resolve a storage path to a signed URL. Cached for 50 minutes.
 * Returns null if the path is invalid or signing fails.
 */
export async function resolveStorageUrl(storageSrc: string): Promise<string | null> {
  if (!isStoragePath(storageSrc)) return storageSrc; // pass through non-storage URLs

  const path = extractStoragePath(storageSrc);
  const cached = urlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // Dedup concurrent sign requests
  const existing = inflightSigns.get(path);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data) return null;
    urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return data.signedUrl;
  })();

  inflightSigns.set(path, promise);
  promise.finally(() => inflightSigns.delete(path));
  return promise;
}

/**
 * Batch-resolve all storage:// URLs in a set of blocks.
 * Returns a Map from storage path → signed URL.
 */
export async function resolveAllStorageUrls(
  blocks: Array<{ imageSrc: string | null }>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toResolve = blocks
    .filter((b) => b.imageSrc && isStoragePath(b.imageSrc))
    .map((b) => b.imageSrc!);

  const unique = [...new Set(toResolve)];
  await Promise.all(
    unique.map(async (src) => {
      const url = await resolveStorageUrl(src);
      if (url) results.set(src, url);
    }),
  );

  return results;
}
