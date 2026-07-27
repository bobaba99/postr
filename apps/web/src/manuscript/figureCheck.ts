/**
 * Figure legibility gate for the standalone pipeline —
 * docs/plans/2026-07-27-manuscript-pipeline.md §4 non-negotiable #1:
 * every emitted figure either passes the readability check or is
 * flagged in the UI at download time. Because the user may never open
 * the editor, an unflagged illegible figure ships to a print shop.
 *
 * Why not `poster/readability.ts`? That engine parses ggplot2 /
 * matplotlib SOURCE CODE to recover font sizes, and this pipeline
 * never has the plotting code — a .docx yields a raster image and
 * nothing else. For a raster placed at a known physical size, the
 * measurable legibility property is effective print resolution: a
 * 400 px screenshot blown up to 12 inches wide renders at 33 DPI, and
 * its axis labels are mush at any font size.
 *
 * So this module answers the question the plan actually cares about —
 * "will this figure survive being printed at this physical size?" —
 * using the one signal a bare image gives us. When the plotting code
 * IS available (editor Check tab), `computeReadability` remains the
 * sharper instrument; the two are complementary, not duplicates.
 */

/**
 * Print resolution thresholds in DPI, for a poster read at ~3 feet.
 *
 * 300 DPI is the print-industry reference for photographic detail. Large-
 * format posters are viewed further away than a page, so 150 DPI is the
 * widely-cited floor for acceptable large-format output, and below 100
 * DPI upscaling artifacts are visible to the naked eye at any distance.
 */
export const FIGURE_DPI_PASS = 150;
export const FIGURE_DPI_WARN = 100;

export type FigureCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface FigureCheck {
  /** Block id of the checked image block. */
  blockId: string;
  /** Effective print resolution in DPI, null when pixels are unknown. */
  effectiveDpi: number | null;
  status: FigureCheckStatus;
  /** User-facing sentence. Generic, actionable, no jargon. */
  message: string;
}

/** Intrinsic pixel dimensions of a decoded image. */
export interface ImagePixelSize {
  width: number;
  height: number;
}

/**
 * Compute the effective print DPI of an image placed in a block.
 *
 * Mirrors `object-fit: contain`: the image scales to the constraining
 * dimension, so the printed size is set by whichever axis runs out of
 * room first. That axis is the one whose DPI we report.
 */
export function computeFigureDpi(
  pixels: ImagePixelSize,
  blockWidthIn: number,
  blockHeightIn: number,
): number | null {
  if (
    pixels.width <= 0 ||
    pixels.height <= 0 ||
    blockWidthIn <= 0 ||
    blockHeightIn <= 0
  ) {
    return null;
  }
  // `contain` scale factor in inches-per-pixel terms: the image is
  // drawn as large as fits, so printed DPI is the LARGER of the two
  // per-axis ratios (the constraining axis leaves the other slack).
  const dpiIfWidthBound = pixels.width / blockWidthIn;
  const dpiIfHeightBound = pixels.height / blockHeightIn;
  return Math.round(Math.max(dpiIfWidthBound, dpiIfHeightBound));
}

export function statusForDpi(dpi: number | null): FigureCheckStatus {
  if (dpi === null) return 'unknown';
  if (dpi >= FIGURE_DPI_PASS) return 'pass';
  if (dpi >= FIGURE_DPI_WARN) return 'warn';
  return 'fail';
}

function messageFor(status: FigureCheckStatus, dpi: number | null): string {
  switch (status) {
    case 'pass':
      return 'Your figure is sharp enough to print at this size.';
    case 'warn':
      return `Your figure prints at about ${dpi} DPI at this size — readable, but soft up close. Export it larger from your plotting software for a crisper result.`;
    case 'fail':
      return `Your figure prints at about ${dpi} DPI at this size, which will look blurry and its axis labels may be unreadable. Export it at a higher resolution and swap it in the editor.`;
    default:
      return 'We could not measure your figure’s resolution — check it looks sharp before printing.';
  }
}

/**
 * Build the user-facing check result for one figure.
 */
export function checkFigure(
  blockId: string,
  pixels: ImagePixelSize | null,
  blockWidthIn: number,
  blockHeightIn: number,
): FigureCheck {
  const effectiveDpi = pixels
    ? computeFigureDpi(pixels, blockWidthIn, blockHeightIn)
    : null;
  const status = statusForDpi(effectiveDpi);
  return { blockId, effectiveDpi, status, message: messageFor(status, effectiveDpi) };
}

/**
 * How long to wait for an image to report its dimensions before giving
 * up and reporting `unknown`. A decode that never fires either event
 * would otherwise leave the download-time warning permanently absent —
 * silence the user would read as "no problems found".
 */
export const MEASURE_TIMEOUT_MS = 4000;

/**
 * Read an image source's intrinsic pixel size.
 *
 * Always settles: resolves to null on empty input, decode error, or
 * timeout rather than rejecting or hanging. An unmeasurable figure is
 * reported as `unknown` and still surfaced to the user, which is the
 * honest outcome. Never throws.
 */
export function measureImage(
  src: string,
  timeoutMs: number = MEASURE_TIMEOUT_MS,
): Promise<ImagePixelSize | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: ImagePixelSize | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    const img = new Image();
    img.onload = () => {
      finish(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      );
    };
    img.onerror = () => finish(null);
    img.src = src;
  });
}
