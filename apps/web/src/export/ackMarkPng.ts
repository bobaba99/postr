/**
 * The unified acknowledgement mark, pre-rasterized to a frozen PNG.
 *
 * ── Why PNG, and why frozen ──────────────────────────────────────
 * The PPTX writer and the PDF/print path are RASTER-ONLY. pptxgenjs
 * embeds images by feeding a `data:` URI to an in-browser `<img>` and
 * reading it back through a canvas; an SVG data URI fires `onerror`,
 * pptxgenjs throws, and the whole `pptx.write()` rejects — which is
 * exactly the export regression documented in
 * docs/bugs/2026-07-28-pptx-export-svg-ack-mark.md. So the ack mark
 * that reaches an export must already be a PNG.
 *
 * The SVG ack mark (`ackMark.ts`) is still fine for on-screen and for
 * the LaTeX toolchain (which embeds SVG directly). This module is the
 * one unified PNG rendition — the muted-grey icon plus the "Made by
 * Postr.sh" wordmark — for the PDF/print and PPTX paths. (spec §6)
 *
 * The base64 is a FROZEN CONSTANT, not rasterized at call time, so this
 * module is DOM-free: it can be imported by the headless PPTX writer,
 * by tests, and by any future server pipeline without needing a canvas.
 *
 * ── How to regenerate the real asset ─────────────────────────────
 * The constant below is a placeholder raster (a small muted-grey block
 * standing in for the mark). To replace it with the REAL unified mark
 * (icon + "Made by Postr.sh" wordmark), do this once, at author time,
 * in a browser context and paste the resulting base64 back here:
 *
 *   1. Compose the mark as an SVG string: take the monochrome geometry
 *      from `ackMarkSvgInner()` in `ackMark.ts` (traced from
 *      `apps/web/brand/icon-square.svg`, MARK_COLOR `#6b7280`) and set
 *      the "Made by Postr.sh" wordmark beside it as a `<text>` element
 *      in the same grey. Keep the viewBox tight to the composed mark.
 *   2. Rasterize that SVG to PNG bytes with the existing browser
 *      rasterizer `browserRasterizeSvg` from
 *      `export/pptx/rasterizeSvg.ts` (SVG bytes → PNG bytes via
 *      `<img>` + canvas; it deliberately does NOT paint a white
 *      background, so the mark stays transparent).
 *   3. Base64-encode the PNG bytes and replace ACK_MARK_PNG_BASE64
 *      below. Keep it ASCII and keep the module DOM-free — do not
 *      import the rasterizer here; the rasterization happens once,
 *      out of band, and only the frozen result is committed.
 *
 * Do not swap this for the coloured brand icon. The restraint (muted
 * grey, no purple field) is the point — see the header of `ackMark.ts`.
 */

/**
 * Frozen, pre-rasterized PNG of the acknowledgement mark.
 *
 * PLACEHOLDER: a valid 8×8 RGBA PNG with a small `#6b7280` block on a
 * transparent field. It is a genuine, decodable PNG (8-byte signature,
 * IHDR/IDAT/IEND chunks) so every raster consumer — pptxgenjs, the
 * print path — accepts it without an SVG ever entering the pipeline.
 * Regenerate the real icon-plus-wordmark asset per the header comment.
 */
const ACK_MARK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGNgoBrILmr4j4wHQgHZAABq1SXBNT7cXgAAAABJRU5ErkJggg==';

/**
 * The unified ack mark as a PNG `data:` URI.
 *
 * base64, not percent-encoded: PowerPoint's image ingest and the print
 * path both handle base64 data URIs reliably, and the payload is small.
 */
export function ackMarkPngDataUri(): string {
  return `data:image/png;base64,${ACK_MARK_PNG_BASE64}`;
}
