/**
 * The acknowledgement mark — the small square logo block.
 *
 * ── Why this is not the brand icon verbatim ──────────────────────
 * `apps/web/brand/icon-square.svg` is the master mark: a #7c6aed
 * purple field with a white monogram. On a poster that competes with
 * the real institutional logos beside it — a saturated purple square
 * is the most colourful thing in a row of navy and grey university
 * crests, which is exactly the "vendor sticker" failure the whole
 * acknowledgement framing exists to avoid.
 *
 * So the geometry here is the brand mark's, traced from
 * `brand/icon-square.svg` (same 64-unit viewBox, same two crossing
 * curves and centre dot, same 0.62 scale), but rendered MONOCHROME
 * and MUTED: no fill behind it, strokes in the same grey the print
 * colophon uses. Beside a real logo it reads as a small secondary
 * affiliation, which is what an acknowledgement should look like.
 *
 * Do not swap this for the coloured brand icon. The restraint is the
 * point, and it is the reason this mark is welcome on the poster.
 */

import { markInnerSvg, MARK_COLORS } from '@/brand/markGeometry';

/** Stroke/fill colour — matches the print colophon's muted grey. */
const MARK_COLOR = MARK_COLORS.muted;

/**
 * The mark's drawing commands alone, in a 64-unit coordinate space
 * and with NO wrapping `<svg>` element.
 *
 * Geometry comes from the single source `@/brand/markGeometry` (the new
 * square mark). Rendered MONOCHROME and MUTED here — no purple — because
 * this is the acknowledgement colophon, which must read as a credit beside
 * real institutional crests, not as a coloured vendor sticker. That
 * restraint is the whole point (see the module note); do NOT swap in the
 * brand-coloured mark.
 *
 * Exported separately so the PPTX writer can nest it inside the
 * composed slide-background SVG without parsing a full document out
 * of a string.
 */
export function ackMarkSvgInner(): string {
  // scale(0.62) keeps the acknowledgement's deliberately small footprint
  // within the 64-unit box, matching the master brand tile's safe-zone scale.
  return [
    '<g transform="translate(32 32) scale(0.62) translate(-32 -32)">',
    markInnerSvg('mono', { color: MARK_COLOR }),
    '</g>',
  ].join('');
}

/**
 * The mark as a standalone SVG document string.
 *
 * @param size rendered side length in px/poster units. The viewBox is
 *   fixed at 64 so the mark scales cleanly to any size the placement
 *   module picks when matching a logo row.
 */
export function ackMarkSvg(size: number): string {
  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Poster made with postr.sh">`,
    ackMarkSvgInner(),
    '</svg>',
  ].join('');
}

/**
 * The mark as a `data:` URI, for the block's `imageSrc` and for the
 * PPTX flattening path.
 *
 * base64 rather than percent-encoded UTF-8: PowerPoint's image
 * ingest and the html2canvas thumbnail path both handle base64
 * data URIs reliably, and the payload is small enough (~450 bytes)
 * that the encoding overhead does not matter.
 */
export function ackMarkDataUri(size: number = 64): string {
  const svg = ackMarkSvg(size);
  // btoa is ASCII-only; the SVG above is deliberately ASCII-only too.
  const encoded =
    typeof btoa === 'function'
      ? btoa(svg)
      : Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}
