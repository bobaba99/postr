/**
 * Deterministic pre-model guards (spec §3). Pure + synchronous; every
 * rejection is a typed IngestError so the UI can show the matching
 * message and no credit is consumed. User-facing copy names the
 * workflow ("the checker"), never "AI" (D15).
 */
import {
  IngestError,
  INGEST_ALLOWED_MIME,
  INGEST_MAX_FILE_BYTES,
  INGEST_MAX_PAGES,
} from './types';

/** Page cap — checked BEFORE rendering or uploading anything. */
export function assertPageCap(pageCount: number): void {
  if (pageCount > INGEST_MAX_PAGES) {
    throw new IngestError(
      `That file has ${pageCount} pages — the checker reads up to ${INGEST_MAX_PAGES}. Trim it and try again.`,
      'too-many-pages',
    );
  }
}

/** Size + MIME allowlist — checked before reading the file's bytes. */
export function assertFileAllowed(
  file: { size: number; type: string },
  allowedMime: readonly string[] = INGEST_ALLOWED_MIME,
): void {
  if (file.size > INGEST_MAX_FILE_BYTES) {
    throw new IngestError(
      'That file is over 50 MB — the checker can read files up to 50 MB. Export a smaller copy and try again.',
      'file-too-large',
    );
  }
  if (!allowedMime.includes(file.type)) {
    throw new IngestError(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
      'unsupported-mime',
    );
  }
}

/** Channel range under which a sampled render counts as near-uniform
 *  (blank). 8/255 tolerates JPEG noise on an empty white page. */
const BLANK_CHANNEL_RANGE = 8;
/** Max pixels sampled per blank check — keeps the loop O(1) on 24MP renders. */
const BLANK_SAMPLE_COUNT = 1024;

/**
 * True when the render is near-uniform (all-white, all-black, flat
 * gray, a solid brand color) — nothing for the checker to read.
 * Samples up to 1024 pixels evenly across the image and compares the
 * min→max range PER CHANNEL: a single global range misses a
 * single-channel-uniform page (solid red has a 0→255 global range but
 * zero per-channel variation). Structural input: works with ImageData
 * or any { data } RGBA buffer.
 */
export function isCanvasBlank(imageData: { data: Uint8ClampedArray }): boolean {
  const { data } = imageData;
  const totalPixels = Math.floor(data.length / 4);
  if (totalPixels === 0) return true;
  // ceil, not floor: floor undershoots the stride and can sample every
  // pixel on large renders (the sample count is the O(1) guarantee).
  const stride = Math.max(1, Math.ceil(totalPixels / BLANK_SAMPLE_COUNT));
  const minimumChannels: [number, number, number] = [255, 255, 255];
  const maximumChannels: [number, number, number] = [0, 0, 0];
  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]!;
      if (v < minimumChannels[c]!) minimumChannels[c] = v;
      if (v > maximumChannels[c]!) maximumChannels[c] = v;
    }
  }
  return minimumChannels.every(
    (minimum, channel) => maximumChannels[channel]! - minimum <= BLANK_CHANNEL_RANGE,
  );
}
