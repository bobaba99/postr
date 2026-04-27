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
  const manifest: PostrBundleManifest = {
    schemaVersion: 1,
    app: 'postr',
    appVersion: options.appVersion ?? APP_VERSION,
    exportedAt: new Date().toISOString(),
    hash,
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
export async function importPostr(
  file: File,
  posterId: string,
  userId: string,
): Promise<ImportPostrResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    throw new Error('Could not read .postr bundle — file may be corrupted.');
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

  doc.blocks = await Promise.all(
    doc.blocks.map((b) => unpackBlock(b, assetMap, posterId, userId)),
  );

  return { doc, title: extractTitle(doc), hashMatch };
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
  if (!bytes) return b; // skip on fetch failure — block keeps the original src
  files[`assets/${path}`] = bytes;
  return { ...b, imageSrc: `${BUNDLE_PREFIX}${path}` };
}

async function unpackBlock(
  b: Block,
  assets: Map<string, Uint8Array>,
  posterId: string,
  userId: string,
): Promise<Block> {
  if (!b.imageSrc?.startsWith(BUNDLE_PREFIX)) return b;
  const path = b.imageSrc.slice(BUNDLE_PREFIX.length);
  const bytes = assets.get(path);
  if (!bytes) return { ...b, imageSrc: null };
  const ext = path.split('.').pop() ?? 'png';
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeFromExt(ext) });
  // Use a fresh blockId for the upload to avoid collisions with the
  // existing storage object; rewrite the block to the new src + id so
  // RLS/cleanup can find it via the standard pattern.
  const newBlockId = nanoid(8);
  const file = new File([blob], `${newBlockId}.${ext}`, {
    type: mimeFromExt(ext),
  });
  const storageSrc = await uploadPosterImage(userId, posterId, newBlockId, file);
  return {
    ...b,
    id: newBlockId,
    imageSrc: storageSrc ?? null,
  };
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
