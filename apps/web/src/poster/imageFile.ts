/**
 * An image file put into the poster: checked, measured and stored the same
 * way whichever way it came in — an image block's own "+ Upload figure" and
 * Replace, a paste, a drop (record 34, docs/fixes/34-paste-drop.md;
 * bounded-designs.md §3.3 "Image checks").
 *
 * - The checks are the upload's: an image type, under 10 MB, with the
 *   messages users already saw (they lived in blocks.tsx `readImageFile`).
 * - The file is stored through `uploadPosterImage`
 *   ({user}/{poster}/{block}-{random}.{ext}, a new name each time since
 *   record 35, `storage://`); with no owner known, or
 *   when the upload fails, it is kept in the poster as a data URL, as the
 *   image block's upload has always done.
 * - The block takes the image's shape: an image block's height is its
 *   width over the image's aspect (the rule ImageBlock's onLoad fit
 *   applies), and a new image block is Insert › Image's box with the
 *   image's shape.
 *
 * Every caller applies the result in ONE store update, so a paste, a drop
 * or an upload is one undo step. Before record 34 the image block's upload
 * stored a `blob:` preview address, then the storage path, then the fitted
 * height: three undo steps, the first of which put back a revoked preview
 * that draws nothing, and a `blob:` address reached the database while the
 * upload was out (record 34 section 4, UP-own and UP-own-slow).
 */
import { MAX_IMAGE_BYTES, uploadPosterImage } from '@/data/posterImages';

/** Why `file` cannot go into the poster (the message users see), or null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" doesn't look like an image (got ${file.type || 'unknown type'}).\n\n`
      + 'Upload PNG, JPEG, GIF, WebP, or SVG instead.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `"${file.name}" is ${mb} MB — too large.\n\n`
      + 'Images must be under 10 MB. Try compressing the PNG/JPEG in Preview (macOS) or an online tool.';
  }
  return null;
}

/** An image's size in pixels as the browser decodes it; null when it cannot be read or has no size (an SVG without one). */
export function readImageSize(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (size: { w: number; h: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** The file as a data URL; null (after telling the user, as before) when it cannot be read. */
export function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (ev) => resolve((ev.target?.result as string) ?? null);
    r.onerror = () => {
      window.alert(`Couldn't read "${file.name}". The file may be corrupted or unreadable.`);
      resolve(null);
    };
    r.readAsDataURL(file);
  });
}

/**
 * Store `file` as block `blockId`'s image: uploaded into the poster
 * owner's folder (`storage://…`), or kept as a data URL when there is no
 * owner or the upload fails. Null when the file could not be read.
 */
export async function storeImageFile(
  file: File,
  userId: string | null | undefined,
  posterId: string | null | undefined,
  blockId: string,
): Promise<string | null> {
  if (userId && posterId) {
    const src = await uploadPosterImage(userId, posterId, blockId, file);
    if (src) return src;
  }
  return readAsDataUrl(file);
}

/** An image block's height for width `w` and an image of `size` (ImageBlock's onLoad fit: the width over the aspect, rounded). */
export function fittedHeight(w: number, size: { w: number; h: number }): number {
  return Math.round(w / (size.w / size.h));
}

/**
 * A new image block's size: Insert › Image's box (`box`) with the image's
 * shape — a wide image keeps the box's width, a tall one its height (the
 * height then fitted from the rounded width, so the onLoad fit has nothing
 * to change). An image whose size is unknown takes the box.
 */
export function imageBlockSize(size: { w: number; h: number } | null, box: { w: number; h: number }): { w: number; h: number } {
  if (!size) return { ...box };
  const aspect = size.w / size.h;
  const w = aspect >= box.w / box.h ? box.w : Math.max(1, Math.round(box.h * aspect));
  return { w, h: fittedHeight(w, size) };
}

/** The event that hands an image block a file to put in through its own upload (ImageBlock listens; detail: { blockId, file }). */
export const IMAGE_FILE_EVENT = 'postr:image-file';

/** Give image block `blockId` the file `file`, through its own upload (a paste into the selected empty block, a drop on it). */
export function putFileIntoImageBlock(blockId: string, file: File) {
  window.dispatchEvent(new CustomEvent(IMAGE_FILE_EVENT, { detail: { blockId, file } }));
}
