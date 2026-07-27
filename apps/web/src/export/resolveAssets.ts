/**
 * Shared asset resolution for editable exports — turns each image
 * block's `imageSrc` (storage:// path, data: URL, or plain URL)
 * into raw bytes plus a normalized extension/MIME pair.
 *
 * Both writers embed the same resolved bytes: the LaTeX zip copies
 * them into `figures/`, the PPTX writer base64-embeds them into
 * `ppt/media/`. Resolution failures never abort the export — the
 * block is reported in `missing` and the writers emit a visible
 * placeholder instead, so one expired signed URL doesn't take down
 * the whole poster.
 *
 * The fetcher is injectable so unit tests (and any future server
 * pipeline) can resolve assets without Supabase or network access.
 */
import type { PosterDoc } from '@postr/shared';
import { isStoragePath, resolveStorageUrl } from '@/data/posterImages';

export interface ResolvedAsset {
  bytes: Uint8Array;
  /** Normalized lowercase extension: png, jpg, gif, webp, svg. */
  ext: string;
  mime: string;
}

export type AssetFetcher = (src: string) => Promise<Uint8Array | null>;

export interface ResolvedAssets {
  /** Block id → resolved bytes for every image/logo block that resolved. */
  assets: Map<string, ResolvedAsset>;
  /** Block ids whose imageSrc could not be resolved. */
  missing: string[];
}

/**
 * Default fetcher: storage:// via a signed Supabase URL, data: URLs
 * decoded inline, anything else fetched directly.
 */
export const defaultAssetFetcher: AssetFetcher = async (src) => {
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      if (comma === -1) return null;
      const base64 = src.slice(comma + 1);
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    }
    let url = src;
    if (isStoragePath(src)) {
      const signed = await resolveStorageUrl(src);
      if (!signed) return null;
      url = signed;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

/** Resolve every image/logo block's asset in parallel. */
export async function resolvePosterAssets(
  doc: PosterDoc,
  fetcher: AssetFetcher = defaultAssetFetcher,
): Promise<ResolvedAssets> {
  const imageBlocks = doc.blocks.filter(
    (b) => (b.type === 'image' || b.type === 'logo') && b.imageSrc,
  );

  const results = await Promise.all(
    imageBlocks.map(async (b) => {
      const bytes = await fetcher(b.imageSrc!);
      return { id: b.id, src: b.imageSrc!, bytes };
    }),
  );

  const assets = new Map<string, ResolvedAsset>();
  const missing: string[] = [];
  for (const r of results) {
    if (!r.bytes || r.bytes.length === 0) {
      missing.push(r.id);
      continue;
    }
    const ext = sniffExt(r.bytes) ?? extFromSrc(r.src) ?? 'png';
    assets.set(r.id, { bytes: r.bytes, ext, mime: mimeFromExt(ext) });
  }
  return { assets, missing };
}

/** Detect the image format from magic bytes — more reliable than the
 *  path when signed URLs or data: URLs carry no useful extension. */
export function sniffExt(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  // `<svg` or `<?xm` — treat XML-looking payloads as SVG.
  const head = String.fromCharCode(...bytes.slice(0, 5)).toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'svg';
  return null;
}

function extFromSrc(src: string): string | null {
  if (src.startsWith('data:')) {
    const m = /^data:image\/([\w+]+);/.exec(src);
    if (!m) return null;
    return m[1] === 'jpeg' ? 'jpg' : (m[1] ?? null);
  }
  const withoutQuery = src.split(/[?#]/)[0] ?? src;
  const ext = withoutQuery.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{2,5}$/.test(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

export function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}
