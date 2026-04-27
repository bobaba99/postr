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
 *
 * Retries up to 2 times on transient errors (504, 503, network)
 * with exponential backoff. The cloud Supabase Storage gateway
 * sometimes returns 504 under load — most retries succeed.
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

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: true,
      });

    if (!error) return `${STORAGE_PREFIX}${path}`;

    // Only retry on transient infra errors. Permanent errors (auth,
    // bucket-not-found, payload-too-large) bail immediately so we
    // don't burn 3 attempts on a guaranteed-fail.
    const transient = isTransientStorageError(error);
    if (!transient || attempt === MAX_ATTEMPTS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[poster-images] upload failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        error.message,
      );
      return null;
    }
    // Backoff: 1s, 4s — Supabase Storage gateway typically needs
    // 5–30s to recover, so the second wait is the load-bearing one.
    // ±20% jitter prevents 5 simultaneous figure uploads from
    // retrying in lockstep and re-overloading the gateway.
    const baseMs = attempt === 1 ? 1000 : 4000;
    const jitter = baseMs * (Math.random() * 0.4 - 0.2);
    await new Promise((r) => setTimeout(r, baseMs + jitter));
  }
  return null;
}

/** Storage gateway errors that warrant a retry. Prefer the typed
 *  `statusCode` on supabase-js StorageError; fall back to message
 *  inspection for fetch-level failures (typed differently per
 *  browser: Chrome "Failed to fetch", Safari "Load failed"). */
export function isTransientStorageError(err: {
  message?: string;
  statusCode?: string | number;
}): boolean {
  const status = Number(err.statusCode);
  if (Number.isFinite(status)) {
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status >= 400) return false; // 4xx is a permanent failure
  }
  const msg = (err.message ?? '').toLowerCase();
  return (
    msg.includes('504') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('gateway') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed')
  );
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
