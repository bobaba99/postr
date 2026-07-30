/**
 * Poster canvas capture + upload.
 *
 * Two capture paths share one DOM body (capturePosterJpeg):
 *   - captureThumbnail — 400px JPEG for the dashboard preview, runs
 *     after autosave (fire-and-forget, never blocks editing).
 *   - captureReviewImage — 2048px-long-edge JPEG + 600s signed URL
 *     for the presentation checker's critique call (D11).
 *
 * Both generate a JPEG of #poster-canvas via html-to-image and upload
 * it to the poster-assets Storage bucket.
 */
import { toCanvas } from 'html-to-image';
import { supabase } from '@/lib/supabase';

const BUCKET = 'poster-assets';
const THUMB_WIDTH = 400; // px target width
const JPEG_QUALITY = 0.7;
const SIGNED_URL_TTL = 3600; // 1 hour

const REVIEW_LONG_EDGE_PX = 2048; // matches the vision ceiling (imageImport.ts downscaleForVision)
const REVIEW_JPEG_QUALITY = 0.85;
const REVIEW_SIGNED_URL_TTL = 600; // 10 minutes — the critique call re-fetches within this window

/** In-flight guard — only one canvas capture at a time (the clone +
 *  html-to-image pass is heavy; autosave thumbs and review captures
 *  must not interleave). Held by the two public entry points. */
let capturing = false;

/** html-to-image pixelRatio that lands the capture width on targetWidthPx. */
export function pixelRatioFor(canvasWidthPx: number, targetWidthPx: number): number {
  return targetWidthPx / canvasWidthPx;
}

/**
 * Capture #poster-canvas to a JPEG blob at the given width/quality.
 * Returns null on any failure (non-blocking). Does NOT take the
 * in-flight guard — the guarded public entry points below do.
 */
export async function capturePosterJpeg(opts: {
  targetWidthPx: number;
  quality: number;
}): Promise<Blob | null> {
  try {
    const el = document.getElementById('poster-canvas');
    if (!el) return null;

    // Clone the element so the live DOM is never visually disrupted
    // (the previous approach mutated the live element's transform,
    // causing visible flicker during autosave).
    //
    // Hiding strategy: wrap the clone in a fixed-position 0×0 div
    // with overflow:hidden. The clone keeps its natural layout
    // coordinates (top-left at 0,0 within the wrapper), so when
    // html-to-image inlines computed styles into its <foreignObject>
    // SVG the children render inside the SVG viewport. Earlier
    // versions used `position: absolute; left: -9999px` which got
    // inlined verbatim and pushed every child outside the SVG
    // viewport — captured output was a blank white image.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';

    // Strip editor-only chrome from the clone so the captured
    // image looks like the printed poster, not the live edit
    // surface. Without this, a selected block would appear in the
    // capture with its resize handles, move/delete pills,
    // and accent border baked in.
    //
    // Selectors mirror the data attributes set by:
    //   - resizeHandles.tsx → [data-postr-resize-handle]
    //   - blocks.tsx top handle row, GroupFrame, SelectionRect,
    //     FigureSizeOverlay → [data-postr-selection-ui]
    //   - the grid / ruler overlays → [data-postr-overlay]
    clone
      .querySelectorAll(
        '[data-postr-resize-handle], [data-postr-selection-ui], [data-postr-overlay]',
      )
      .forEach((el) => el.remove());

    // Reset the selected-block border back to its unselected state
    // (1px transparent matches the inline style on non-selected
    // blocks). The block frame is tagged when selected via
    // data-postr-selected so we can find it without re-deriving the
    // selection from React state.
    clone
      .querySelectorAll<HTMLElement>('[data-postr-selected="true"]')
      .forEach((el) => {
        el.style.border = '1px solid transparent';
      });

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: hidden; pointer-events: none; opacity: 0;';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const canvasWidth = clone.offsetWidth;
    if (canvasWidth === 0) { document.body.removeChild(wrapper); return null; }
    const pixelRatio = pixelRatioFor(canvasWidth, opts.targetWidthPx);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(clone, {
        pixelRatio,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });
    } finally {
      document.body.removeChild(wrapper);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', opts.quality);
    });

    return blob;
  } catch {
    return null;
  }
}

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
    const blob = await capturePosterJpeg({ targetWidthPx: THUMB_WIDTH, quality: JPEG_QUALITY });
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
 * Capture the poster at critique resolution and upload it for the
 * presentation checker (D11): 2048px long edge, JPEG q0.85, 600s
 * signed URL. Returns the storage path + signed URL, or null on
 * failure. The poster must be open in the editor (#poster-canvas
 * mounted).
 */
export async function captureReviewImage(
  userId: string,
  posterId: string,
): Promise<{ path: string; signedUrl: string; blob: Blob } | null> {
  if (capturing) return null;
  capturing = true;

  try {
    // capturePosterJpeg scales by WIDTH. offsetWidth/offsetHeight are
    // layout sizes — unaffected by the editor's zoom transform — so
    // the live element's aspect ratio matches the clone's. Shrink the
    // width target on portrait posters so the LONG edge lands at
    // 2048px.
    const el = document.getElementById('poster-canvas');
    if (!el) return null;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return null;
    const targetWidthPx =
      w >= h ? REVIEW_LONG_EDGE_PX : Math.round((REVIEW_LONG_EDGE_PX * w) / h);

    const blob = await capturePosterJpeg({ targetWidthPx, quality: REVIEW_JPEG_QUALITY });
    if (!blob) return null;

    const path = `${userId}/${posterId}/review-capture.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) return null;

    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, REVIEW_SIGNED_URL_TTL);
    if (signErr || !data) return null;

    return { path, signedUrl: data.signedUrl, blob };
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
