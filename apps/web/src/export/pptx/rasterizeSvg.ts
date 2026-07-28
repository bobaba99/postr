/**
 * SVG → PNG rasterization for the PPTX writer.
 *
 * ── Why this exists ──────────────────────────────────────────────
 * pptxgenjs embeds images by feeding a `data:` URI to an in-browser
 * `<img>` and reading it back through a canvas. That path CANNOT load
 * SVG: the image fires `onerror`, pptxgenjs throws
 * `ERROR! Unable to load image (image.onerror): image/svg+xml;base64,…`,
 * and the whole `pptx.write()` rejects. There is no PowerPoint-side
 * SVG raster fallback the way there is for a browser `<img>`.
 *
 * This bit any poster carrying an SVG image block. The most common
 * one is the seeded acknowledgement mark (`ackMark.ts`), which is an
 * SVG data URI and is auto-placed on sparser posters — so "export a
 * simple poster to .pptx" failed with the generic "Something went
 * wrong", because the throw landed in the export button's catch.
 *
 * LaTeX is unaffected: a `.tex` toolchain embeds SVG directly, so the
 * shared `resolveAssets` still hands SVG through untouched. This
 * conversion is deliberately PPTX-only and lives beside the writer.
 *
 * ── DOM boundary ─────────────────────────────────────────────────
 * The writer is otherwise pure `PosterDoc → bytes` with no DOM. This
 * function is the one place a canvas is needed, so it is injected into
 * the writer as `opts.rasterizeSvg` and defaults to the browser
 * implementation below. Tests and any future server pipeline pass
 * their own (or omit it, which is fine — a doc with no SVG asset never
 * calls it).
 */

/**
 * Rasterize SVG bytes to PNG bytes. Returns null on any failure so the
 * caller can fall back rather than abort the export.
 *
 * `widthPx`/`heightPx` are a FALLBACK size, used only when the SVG
 * declares no intrinsic dimensions. An SVG with a `width`/`height` (the
 * ack mark is 64×64) rasters at its own resolution and ignores these.
 */
export type SvgRasterizer = (
  svgBytes: Uint8Array,
  widthPx: number,
  heightPx: number,
) => Promise<Uint8Array | null>;

/**
 * Browser rasterizer: SVG bytes → PNG bytes via an `<img>` + canvas.
 *
 * Follows the chart-download path (`charts/download.ts`): blob-URL the
 * SVG, load it into an `Image`, draw to a canvas, read PNG bytes back.
 * The blob URL is always revoked, including on error.
 *
 * DELIBERATELY does NOT paint a white background first, unlike the
 * chart path. The chart fills white because a chart is opaque and
 * transparency renders black in some viewers; the ack mark is
 * `fill="none"` grey strokes meant to sit transparently over the poster
 * background, so a white fill would box it in an ugly square. Do not
 * "fix" this to match charts.
 *
 * Returns null (never throws) when the DOM APIs are absent (SSR/tests
 * with no canvas), the SVG fails to decode, or PNG encoding fails —
 * the writer then keeps the export alive with a placeholder box, which
 * is strictly better than the whole file failing to open.
 */
export const browserRasterizeSvg: SvgRasterizer = async (
  svgBytes,
  widthPx,
  heightPx,
) => {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  // A poster block can be sized in fractional or absurd values; clamp to
  // a sane raster so a stray dimension can't allocate a giant canvas.
  const w = Math.max(1, Math.min(4096, Math.round(widthPx) || 0));
  const h = Math.max(1, Math.min(4096, Math.round(heightPx) || 0));

  // `svgBytes.buffer` is typed `ArrayBufferLike` (could be a
  // SharedArrayBuffer), which the DOM lib's `BlobPart` rejects. Copying
  // into a fresh view yields a plain ArrayBuffer the type accepts; the
  // payload is tiny (~450 B for the ack mark) so the copy is free.
  const buf = svgBytes.slice().buffer as ArrayBuffer;
  const blob = new Blob([buf], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('svg image failed to load'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || w;
    canvas.height = image.naturalHeight || h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};
