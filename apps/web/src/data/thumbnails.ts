/**
 * Poster thumbnail capture + upload.
 *
 * Generates a small JPEG thumbnail of #poster-canvas via html-to-image,
 * uploads it to the poster-assets Storage bucket, and returns the
 * storage path for writing to posters.thumbnail_path.
 *
 * Runs after autosave succeeds — fire-and-forget, never blocks editing.
 */
import { toCanvas } from 'html-to-image';
import { supabase } from '@/lib/supabase';

const BUCKET = 'poster-assets';
const THUMB_WIDTH = 400; // px target width
const JPEG_QUALITY = 0.7;
const SIGNED_URL_TTL = 3600; // 1 hour

/** In-flight guard — only one thumbnail capture at a time. */
let capturing = false;

/**
 * Capture the poster canvas and upload a thumbnail.
 * Returns the storage path on success, null on failure (non-blocking).
 */
export async function captureThumbnail(
  userId: string,
  posterId: string,
): Promise<string | null> {
  if (capturing) return null;
  capturing = true;

  try {
    const el = document.getElementById('poster-canvas');
    if (!el) return null;

    // Clone the element off-screen for capture so the live DOM is
    // never visually disrupted. Previous approach mutated the live
    // element's transform, causing visible flicker during autosave.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '-9999px';
    document.body.appendChild(clone);

    const canvasWidth = clone.offsetWidth;
    if (canvasWidth === 0) { document.body.removeChild(clone); return null; }
    const pixelRatio = THUMB_WIDTH / canvasWidth;

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(clone, {
        pixelRatio,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });
    } finally {
      document.body.removeChild(clone);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return null;

    const path = `${userId}/${posterId}/thumbnail.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      return null;
    }

    return path;
  } catch {
    return null;
  } finally {
    capturing = false;
  }
}

/**
 * Get a signed URL for a thumbnail path. Returns null if the path
 * is null or the signed URL fails to generate.
 */
export async function getThumbnailUrl(
  thumbnailPath: string | null,
): Promise<string | null> {
  if (!thumbnailPath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(thumbnailPath, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}
