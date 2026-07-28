/**
 * `.postr` bundle format — lossless round-trip for poster docs.
 *
 * Layout (zip via fflate, renamed to `.postr`):
 *   poster.json    — PosterDoc with imageSrc rewritten to "bundle://..."
 *   manifest.json  — { schemaVersion, app, appVersion, exportedAt, hash }
 *   assets/        — <blockId>.<ext> per image block
 *
 * The hash is sha256 of the canonicalized PosterDoc JSON. Recomputed
 * on import to assert the bundle wasn't tampered with.
 */
import { unzipSync, zipSync } from 'fflate';
import { nanoid } from 'nanoid';
import type {
  Block,
  PostrBundleManifest,
  PosterDoc,
} from '@postr/shared';
import { BUNDLE_PREFIX } from '@postr/shared';
import {
  STORAGE_PREFIX,
  isStoragePath,
  resolveStorageUrl,
  uploadPosterImage,
} from '@/data/posterImages';
import { sanitizeHtml } from '@/poster/sanitizeHtml';
import { attributionBundleGenerator } from '@/export/attribution';
import { ensureAckBlock } from '@/export/ackBlock';

const APP_VERSION = '0.0.0';

export interface ExportPostrOptions {
  /** Optional override for the manifest's appVersion. */
  appVersion?: string;
}

export interface ImportPostrResult {
  doc: PosterDoc;
  title?: string;
  /** Hash recomputed on the imported doc — exposed so callers can
   *  surface a "this bundle is intact" badge in the preview modal. */
  hashMatch: boolean;
}

/**
 * Serialize a poster + its image assets into a `.postr` Blob ready
 * for download.
 */
export async function exportPostr(
  doc: PosterDoc,
  options: ExportPostrOptions = {},
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const exportedDoc: PosterDoc = {
    ...doc,
    blocks: await Promise.all(doc.blocks.map((b) => packBlock(b, files))),
  };

  const docJson = canonicalJson(exportedDoc);
  const hash = await sha256Hex(docJson);
  // `generator` is metadata only — a `.postr` is a backup format, so
  // it gets NO visible mark, just a self-describing field. Safe to add
  // without a schemaVersion bump: the hash covers poster.json alone
  // (computed above from `docJson`), never the manifest, so an older
  // build importing a newer bundle still validates and simply ignores
  // the extra key.
  const manifest: PostrBundleManifest = {
    schemaVersion: 1,
    app: 'postr',
    appVersion: options.appVersion ?? APP_VERSION,
    exportedAt: new Date().toISOString(),
    hash,
    generator: attributionBundleGenerator(),
  };

  files['poster.json'] = textToBytes(docJson);
  files['manifest.json'] = textToBytes(canonicalJson(manifest));

  const zipped = zipSync(files, { level: 0 });
  // Slice into a fresh ArrayBuffer so the Blob constructor accepts it
  // regardless of whether the zip output sits on a SharedArrayBuffer.
  const buf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  return new Blob([buf as ArrayBuffer], { type: 'application/zip' });
}

/**
 * Read a `.postr` File and return a deserialized PosterDoc with assets
 * re-uploaded into the user's poster-assets bucket under `posterId`.
 */
/** Max accepted .postr file size BEFORE unzipping — first-line defense
 *  against an oversized upload. This bounds the compressed input; the
 *  decompressed total is checked separately below (a small compressed
 *  file can still expand enormously). The legitimate ceiling for a
 *  poster bundle is ~50 MB (a 4-page poster with 30 high-res figures).
 *  Images are near-incompressible, so a real bundle's decompressed
 *  size stays close to its compressed size. */
const MAX_POSTR_FILE_BYTES = 100 * 1024 * 1024;

/** Max accepted TOTAL decompressed size across all bundle entries.
 *  A zip bomb is small on disk but expands to gigabytes; refusing to
 *  process an expansion this large stops it from amplifying into
 *  base64 + upload work (and flags the tampered bundle) even when the
 *  compressed file slipped under MAX_POSTR_FILE_BYTES. */
const MAX_POSTR_DECOMPRESSED_BYTES = 200 * 1024 * 1024;

export async function importPostr(
  file: File,
  posterId: string,
  userId: string,
): Promise<ImportPostrResult> {
  if (file.size > MAX_POSTR_FILE_BYTES) {
    throw new Error(
      `.postr bundle is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max supported size is ${MAX_POSTR_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    throw new Error('Could not read .postr bundle — file may be corrupted.');
  }

  // Zip-bomb guard: reject when the decompressed total blows past the
  // ceiling. A crafted bundle can sit under the compressed cap yet
  // expand to gigabytes; without this the expansion would be re-encoded
  // to base64 and uploaded asset-by-asset.
  let decompressedBytes = 0;
  for (const bytes of Object.values(entries)) {
    decompressedBytes += bytes.byteLength;
  }
  if (decompressedBytes > MAX_POSTR_DECOMPRESSED_BYTES) {
    throw new Error(
      `.postr bundle expands to ${(decompressedBytes / 1024 / 1024).toFixed(1)} MB, over the ${MAX_POSTR_DECOMPRESSED_BYTES / 1024 / 1024} MB limit.`,
    );
  }

  const docBytes = entries['poster.json'];
  if (!docBytes) throw new Error('.postr bundle is missing poster.json.');
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('.postr bundle is missing manifest.json.');

  const docJson = bytesToText(docBytes);
  const manifest = JSON.parse(bytesToText(manifestBytes)) as PostrBundleManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `Unsupported .postr schema version ${manifest.schemaVersion}. Update the editor to import this file.`,
    );
  }

  const recomputedHash = await sha256Hex(docJson);
  const hashMatch = recomputedHash === manifest.hash;

  const doc = JSON.parse(docJson) as PosterDoc;

  // Re-upload every asset and rewrite imageSrc back to storage://.
  const assetEntries = Object.entries(entries).filter(([n]) =>
    n.startsWith('assets/'),
  );
  const assetMap = new Map<string, Uint8Array>(
    assetEntries.map(([n, b]) => [n.slice('assets/'.length), b]),
  );

  // Shared across blocks so two image blocks with the same id (a
  // hand-edited or malicious bundle) can't collide on the same storage
  // key — the second upload would otherwise overwrite the first's
  // pixels and leave two blocks with identical ids. `.map` runs each
  // callback synchronously up to its first `await`, so the set is
  // mutated sequentially before any upload resolves.
  const usedImageIds = new Set<string>();
  const unpacked = await Promise.all(
    doc.blocks.map((b) => unpackBlock(b, assetMap, posterId, userId, usedImageIds)),
  );

  // Re-inject the acknowledgement mark when a returned bundle lacks
  // it. `.postr` is the one export a user can edit outside Postr —
  // unzip it, delete the block from poster.json, re-zip — so the
  // in-editor lock is not sufficient on this path.
  //
  // The store's `setPoster` also seeds the mark, so this is belt and
  // braces; it is kept here because `importPostr` is a public
  // function whose returned doc is inspected (the preview modal reads
  // it before any store write), and that preview should show what the
  // user is actually about to get.
  //
  // Idempotent by construction: `ensureAckBlock` is a no-op when a
  // block with the sentinel id is already present, so repeated
  // export → import round-trips never accumulate a second mark, and
  // a valid bundle comes back byte-for-byte identical in its blocks.
  const restored = ensureAckBlock({ ...doc, blocks: unpacked });

  return { doc: restored, title: extractTitle(restored), hashMatch };
}

// ── packing helpers ──────────────────────────────────────────────────

async function packBlock(
  b: Block,
  files: Record<string, Uint8Array>,
): Promise<Block> {
  if (!b.imageSrc) return b;

  if (b.imageSrc.startsWith(BUNDLE_PREFIX)) {
    // Already a bundle reference — passthrough (e.g. a doc that's been
    // round-tripped without ever loading assets).
    return b;
  }

  const ext = guessExt(b.imageSrc);
  const path = `${b.id}.${ext}`;
  const bytes = await fetchAsBytes(b.imageSrc);
  if (!bytes) {
    // Fetch failed (expired signed URL, offline, transient error). We
    // can't bundle the bytes, so DON'T keep the original src: a
    // `storage://<ownerId>/...` path would ride into the bundle with no
    // asset behind it. On import that path is preserved verbatim (it's
    // not a `bundle://` ref), leaving the importer with a broken image
    // pointing at another user's storage — silent data loss plus a
    // leaked foreign path. Null it so the bundle is self-consistent.
    return { ...b, imageSrc: null };
  }
  files[`assets/${path}`] = bytes;
  return { ...b, imageSrc: `${BUNDLE_PREFIX}${path}` };
}

/**
 * Scrub the rich-text fields a `.postr` bundle controls but the render
 * layer injects via `dangerouslySetInnerHTML` WITHOUT re-sanitizing:
 * `note` (blocks.tsx), `caption` (blocks.tsx), and every `tableData`
 * cell (blocks.tsx). A bundle is fully attacker-controlled and passes
 * the integrity check (the hash is computed over the tampered JSON), so
 * without this an imported bundle carrying `note: "<img src=x
 * onerror=...>"` is stored XSS running in the importer's authenticated
 * session. `content` is intentionally left alone — RichTextEditor
 * re-sanitizes it on every render. Legitimate inline formatting
 * (bold / italic / sup / sub / highlight) survives sanitizeHtml's
 * allowlist, so a clean bundle round-trips unchanged.
 */
export function sanitizeImportedBlock(b: Block): Block {
  const next: Block = { ...b };
  if (typeof next.note === 'string') next.note = sanitizeHtml(next.note);
  if (typeof next.caption === 'string') next.caption = sanitizeHtml(next.caption);
  if (next.tableData) {
    next.tableData = {
      ...next.tableData,
      cells: next.tableData.cells.map((cell) =>
        typeof cell === 'string' ? sanitizeHtml(cell) : cell,
      ),
    };
  }
  return next;
}

async function unpackBlock(
  raw: Block,
  assets: Map<string, Uint8Array>,
  posterId: string,
  userId: string,
  usedImageIds: Set<string>,
): Promise<Block> {
  // Sanitize first so EVERY block is scrubbed — including text/table
  // blocks that carry no image and would otherwise return early below
  // with their untrusted note/caption/cells intact.
  const b = sanitizeImportedBlock(raw);

  if (!b.imageSrc?.startsWith(BUNDLE_PREFIX)) return b;
  const path = b.imageSrc.slice(BUNDLE_PREFIX.length);
  const bytes = assets.get(path);
  if (!bytes) return { ...b, imageSrc: null };
  // ext is derived from a user-controlled filename inside the bundle —
  // sanitize before it lands in a storage path or MIME header.
  const rawExt = path.split('.').pop() ?? 'png';
  const ext = sanitizeExt(rawExt);
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeFromExt(ext) });
  // Reuse the existing block id as the storage key — but ONLY after
  // sanitizing it. A malicious bundle could ship `id: "../../admin"`
  // which would otherwise flow through `uploadPosterImage` straight
  // into a storage path. `sanitizeBlockId` falls back to a fresh
  // nanoid when the id doesn't match the safe shape.
  let safeId = sanitizeBlockId(b.id);
  // Re-mint on collision so two image blocks can't share one storage
  // key (the second upload would overwrite the first's pixels).
  while (usedImageIds.has(safeId)) safeId = nanoid(8);
  usedImageIds.add(safeId);
  const file = new File([blob], `${safeId}.${ext}`, {
    type: mimeFromExt(ext),
  });
  const storageSrc = await uploadPosterImage(userId, posterId, safeId, file);
  return {
    ...b,
    id: safeId,
    imageSrc: storageSrc ?? null,
  };
}

/** Restrict block ids to the same shape nanoid emits so a malicious
 *  bundle can't sneak path separators into a storage key. */
function sanitizeBlockId(id: string): string {
  if (/^[A-Za-z0-9_-]{1,32}$/.test(id)) return id;
  // Fall back to a generated id rather than rejecting outright — the
  // bundle's other content is still usable.
  return nanoid(8);
}

/** Restrict to lowercase alphanumerics so a malicious filename can't
 *  inject path separators or MIME tricks. Falls back to "png" when the
 *  source is empty or invalid. */
function sanitizeExt(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned || cleaned.length > 6) return 'png';
  return cleaned;
}

async function fetchAsBytes(src: string): Promise<Uint8Array | null> {
  try {
    let url = src;
    if (isStoragePath(src)) {
      const signed = await resolveStorageUrl(src);
      if (!signed) return null;
      url = signed;
    } else if (src.startsWith('data:')) {
      const base64 = src.slice(src.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return bytes;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function guessExt(src: string): string {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:image\/([\w+]+);/);
    if (m) return m[1] === 'jpeg' ? 'jpg' : (m[1] ?? 'png');
    return 'png';
  }
  if (src.startsWith(STORAGE_PREFIX)) {
    const path = src.slice(STORAGE_PREFIX.length);
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }
  return 'png';
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function extractTitle(doc: PosterDoc): string | undefined {
  const title = doc.blocks.find((b) => b.type === 'title');
  return title?.content?.trim() || undefined;
}

// ── canonicalization + hashing ───────────────────────────────────────

/** Stable JSON: keys sorted at every nesting level. The hash compares
 *  doc content, not key order — round-tripping through any JSON parser
 *  must produce the same hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replaceCanonical(new WeakSet()));
}

function replaceCanonical(seen: WeakSet<object>) {
  return function replacer(_key: string, val: unknown): unknown {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val;
    if (seen.has(val)) return val;
    seen.add(val);
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = (val as Record<string, unknown>)[k];
    }
    return sorted;
  };
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToText(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}
