/**
 * Poster image upload — saves image files to Supabase Storage instead
 * of embedding base64 in the JSONB document.
 *
 * Storage path convention: {userId}/{posterId}/{blockId}-{random}.{ext}
 * The block's imageSrc stores "storage://{path}" as the discriminator.
 *
 * Every upload writes a NEW file name, and a pasted or cloned image block
 * gets its own copy of its original's file (`copyPosterImage`), so no two
 * blocks share a file by accident and nothing overwrites a file a block, an
 * undo step or a saved version still points at (record 35,
 * docs/fixes/35-block-copy.md; bounded-designs.md §3.3 D). Until record 35
 * an upload wrote {userId}/{posterId}/{blockId}.{ext} with `upsert`: a
 * Replace with a file of the same type overwrote the picture a ⌘D clone,
 * one ⌘Z and a duplicated poster still showed. Those older paths keep
 * working, and are copied like the new ones (`isPosterAssetSrc`). Nothing
 * deletes a superseded file (the orphan-files fix, Later), so a clone whose
 * copy cannot be made may keep its original's file (PosterEditor
 * `duplicateBlock`): files can still be shared by several blocks (older ⌘D
 * clones, a dashboard Duplicate, saved versions), which that fix must count.
 */
import { nanoid } from 'nanoid';
import { supabase } from '@/lib/supabase';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL = 3600; // 1 hour
/** The largest image file a poster takes (before encoding): the image block's upload, a paste, a drop (poster/imageFile.ts). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

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
 * The shape of a poster-assets file this app wrote: {folder}/{folder}/{name}.{ext}
 * (no "..", no further folder, no other bucket). New names are
 * {block}-{random}.{ext} with a plain extension; older ones (before record 35)
 * are {block}.{ext} whose extension the old rule took from the file's own name
 * (`split('.').pop().toLowerCase()`), so it can be any character a storage key
 * allows but a dot: `im1.plot_final`, `im1.jpg_large` (review round 1, R1-3:
 * the strict shape emptied ⌘D's clone and a pasted copy of such a file). Never
 * a "/", "?", "#", "%", a backslash, a control character, an upper-case letter, or a
 * space at either end of the extension.
 */
const EXT_CHAR = "a-z0-9_!*'()&$@=;:+,\\-";
const ASSET_PATH = new RegExp(
  `^[A-Za-z0-9-]{1,64}/[A-Za-z0-9-]{1,64}/[A-Za-z0-9_-]{1,100}\\.[${EXT_CHAR}](?:[${EXT_CHAR} ]{0,62}[${EXT_CHAR}])?$`,
);

/**
 * Whether `src` is a `storage://` path of a file in this app's poster-assets
 * bucket: the only image source a copy is made from (a pasted block, ⌘D's
 * clone, record 35). The source only ever reaches storage's copy, under the
 * bucket's row-level security (the user's own folder); a block keeps the new
 * path of the copy, never the source.
 */
export function isPosterAssetSrc(src: unknown): src is string {
  return typeof src === 'string' && src.startsWith(STORAGE_PREFIX) && ASSET_PATH.test(extractStoragePath(src));
}

/**
 * Whether `src` is a poster-assets file in user `userId`'s own folder: the
 * user's own picture, which a pasted image shows while its own copy is made
 * (record 35, review round 2, R2-1). A file of another folder is never shown
 * from its source (the bucket's row-level security would refuse it anyway).
 */
export function isOwnFile(src: unknown, userId: string | null | undefined): src is string {
  return !!userId && isPosterAssetSrc(src) && extractStoragePath(src).startsWith(`${userId}/`);
}

/** The extension of a copy's new name: the source's when it is a plain one, else "png" (an older name's extension, R1-3; storage keeps the file's type). */
export function copiedExt(from: string): string {
  const ext = from.split('.').pop() ?? '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'png';
}

/** A file's extension for its storage name: its own when it is a plain one, else its type's ("svg+xml" → "svg"), else "png". */
export function imageExt(file: Pick<File, 'name' | 'type'>): string {
  const own = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (/^[a-z0-9]{1,8}$/.test(own)) return own;
  const sub = /^image\/([a-z0-9]{1,8})/.exec(file.type.toLowerCase())?.[1];
  return sub ?? 'png';
}

/** A new file path for block `blockId`'s image: a name no other file has ({blockId}-{random}.{ext}, record 35). */
export function newImagePath(userId: string, posterId: string, blockId: string, ext: string): string {
  return `${userId}/${posterId}/${blockId}-${nanoid(8)}.${ext}`;
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

  // A new name for every upload (record 35): a Replace never overwrites the
  // file the block held before, which its undo step still points at.
  const path = newImagePath(userId, posterId, blockId, imageExt(file));

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
 * What a storage copy gave (record 35): the copy's own path, or null;
 * `missing` when storage said the source, a file of this account's own
 * folder, does not exist: a 404 / not_found answered to the first try
 * (`isMissingObjectError`). Only then is a pasted image or a ⌘D clone
 * emptied (`heldAfterCopy`; the lead's rule on the final check's F35-FC-2,
 * correction 5). Any other failure leaves the source there as far as anyone
 * knows: a refusal that is not about the file (row-level security's 403, an
 * expired token's InvalidJWT, a 409), storage busy on every try (a 5xx, a
 * timeout, a network failure: review round 3, R3-1), a 404 after a busy try
 * (storage was not answering plainly then: 503 then 404 while the file was
 * there, F35-FC-2), a 404 that is not storage's word about the file. For a
 * file of another folder storage answers 404 whether or not it exists (the
 * bucket's row-level security hides it), so it is never `missing`.
 */
export interface CopyResult { path: string | null; missing: boolean }

/**
 * Storage's answer that the file asked for does not exist: statusCode 404
 * (storage's body, sent with HTTP 400, or the HTTP status) with storage's
 * own words for it ("Object not found"; older storage "The resource was not
 * found"). Not a 404 page that is not storage's answer about the object (a
 * gateway's or a router's page: storage-js then reports "HTTP 404 error" or
 * the status text), nor "Bucket not found".
 */
export function isMissingObjectError(err: { message?: string; statusCode?: string | number }): boolean {
  return Number(err.statusCode) === 404 && /\b(object|resource)\b.*\bnot found\b/i.test(err.message ?? '');
}

/**
 * What a pasted image or a ⌘D clone holds once its copy has answered: its
 * own copy; else what it showed while copying (`shown`: a pasted image's
 * source when that is this account's own file, else nothing; a clone's
 * original's file), unless storage said that file does not exist.
 */
export function heldAfterCopy(shown: string | null, { path, missing }: CopyResult): string | null {
  return path ?? (missing ? null : shown);
}

/**
 * Give block `blockId` of poster `posterId` its own copy of the file `src`
 * points at (a pasted or cloned image block, record 35): a storage copy into
 * the user's folder of that poster under a new name. No path when `src` is
 * not a poster-assets file, when no owner is known, or when the copy fails;
 * `missing` only as `CopyResult` says. Retried like an upload on a transient
 * error (`attempts`; ⌘D makes one, since its clone can keep its original's
 * file instead, R1-3), each try under a new name (F35-FC-1).
 */
export async function copyPosterImage(
  src: string,
  userId: string | null | undefined,
  posterId: string | null | undefined,
  blockId: string,
  { attempts = 3 }: { attempts?: number } = {},
): Promise<CopyResult> {
  if (!userId || !posterId || !isPosterAssetSrc(src)) return { path: null, missing: false };
  const from = extractStoragePath(src);
  const own = isOwnFile(src, userId);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // A new name for each try: a try whose answer was lost (a gateway's 504,
    // a network failure) may still have made its copy, and storage refuses a
    // destination that exists, so a retry under the same name took that copy
    // for a refusal and the block was emptied (the final check of record 35,
    // F35-FC-1). A copy made by such a try is left unused, as a Replace's
    // old file is.
    const to = newImagePath(userId, posterId, blockId, copiedExt(from));
    const { error } = await supabase.storage.from(BUCKET).copy(from, to);
    if (!error) return { path: `${STORAGE_PREFIX}${to}`, missing: false };
    if (!isTransientStorageError(error) || attempt === attempts) {
      // Missing only when the first answer says so: after a busy try a 404 is not a plain answer (F35-FC-2).
      return { path: null, missing: own && attempt === 1 && isMissingObjectError(error) };
    }
    await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 4000));
  }
  return { path: null, missing: false };
}

/**
 * Upload a base64 data URL to Storage (for migrating existing posters).
 * Returns the storage imageSrc value or null on failure. A new file name, as
 * every upload (record 35).
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

  const path = newImagePath(userId, posterId, blockId, ext);

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
 * Sign these stored images again now, whatever the cache holds. The editor
 * keeps its poster's images signed while it is open, so a URL signed for the
 * owner is at hand when the poster closes on a change of account, when the
 * account signed in can no longer sign them (fix 23, step 9 round 3).
 * A path the session cannot sign keeps its cached URL.
 */
export async function renewStorageUrls(srcs: Iterable<string | null>): Promise<void> {
  const paths = new Set<string>();
  for (const src of srcs) if (src && isStoragePath(src)) paths.add(extractStoragePath(src));
  await Promise.all([...paths].map(async (path) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (!error && data) urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  }));
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
