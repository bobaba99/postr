/**
 * Postr mark — the single source of truth for the logo's geometry.
 *
 * The mark is two crossing curves ("two functions") with a dot at their
 * intersection, drawn in a 64-unit square coordinate space. Historically
 * this geometry was copy-pasted into a dozen places (favicon, brand SVGs,
 * PublicHeader, Auth, Home, Sidebar, ackMark, the rasterizer …), each with
 * slightly different numbers — so the mark looked like a rectangle in the
 * frame and drifted in shape between sizes.
 *
 * Everything that draws the mark now imports from here. Change the geometry
 * once and every surface follows.
 *
 * ── The geometry (approved 2026-08-06) ──────────────────────────────
 * The curves fill a TRUE 40×40 square drawing area, centered in the 64×64
 * viewBox (x: 12→52, y: 12→52), symmetric — so the artwork is square, not a
 * wide rectangle, and the intersection dot sits dead-centre at (32, 32).
 */

/** The fixed coordinate space every consumer renders into. */
export const MARK_VIEWBOX = 64;

/** Rising curve (bottom-left → top-right). The "strong" stroke. */
export const MARK_PATH_RISE = 'M12 52 C30 52, 34 12, 52 12';

/** Falling curve (top-left → bottom-right). The "light" stroke. */
export const MARK_PATH_FALL = 'M12 12 C30 12, 34 52, 52 52';

/**
 * Intersection dot — centre of the viewBox. Radius 6 (diameter 12) is
 * deliberately larger than the 5.5 stroke, so the dot reads as a solid
 * cap over the crossing curves rather than letting the light curve show
 * through behind it — most visible on the white-background variant.
 */
export const MARK_DOT = { cx: 32, cy: 32, r: 6 } as const;

/** Default stroke weight at the 64-unit scale. */
export const MARK_STROKE_WIDTH = 5.5;

/** Brand palette for the mark. */
export const MARK_COLORS = {
  /** Primary purple — rising curve, dot, on-white marks. */
  strong: '#7c6aed',
  /** Light purple — falling curve, the "second function". */
  light: '#b9a9ff',
  /** Muted grey — the acknowledgement/colophon treatment (never coloured). */
  muted: '#6b7280',
  /** White — marks on a purple/dark field. */
  onDark: '#ffffff',
} as const;

export type MarkTone = 'brand' | 'mono';

/**
 * The two paths + dot as an SVG inner string (no wrapping `<svg>`), so
 * callers can nest it inside their own document, symbol, or composed SVG.
 *
 * `brand` tone: strong + light purples (the coloured logo).
 * `mono` tone: a single colour for both curves + dot — used by the
 * acknowledgement colophon, which is deliberately monochrome and muted so
 * it reads as a credit, not a vendor sticker (see attribution.ts).
 *
 * @param opts.color   single colour when tone is 'mono' (defaults to muted grey)
 * @param opts.strokeWidth override stroke weight (defaults to MARK_STROKE_WIDTH)
 */
export function markInnerSvg(
  tone: MarkTone = 'brand',
  opts: { color?: string; strokeWidth?: number } = {},
): string {
  const sw = opts.strokeWidth ?? MARK_STROKE_WIDTH;
  const rise = tone === 'brand' ? MARK_COLORS.strong : opts.color ?? MARK_COLORS.muted;
  const fall = tone === 'brand' ? MARK_COLORS.light : opts.color ?? MARK_COLORS.muted;
  const dot = tone === 'brand' ? MARK_COLORS.strong : opts.color ?? MARK_COLORS.muted;
  return [
    `<path d="${MARK_PATH_RISE}" stroke="${rise}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`,
    `<path d="${MARK_PATH_FALL}" stroke="${fall}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`,
    `<circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}" fill="${dot}"/>`,
  ].join('');
}

export type MarkBackground = 'transparent' | 'white' | 'purple';

/**
 * The mark as a complete standalone `<svg>` document string.
 *
 * @param size   rendered side length in px (viewBox stays 64 so it scales cleanly)
 * @param opts.background  transparent (default), white rounded tile, or purple tile
 * @param opts.tone        'brand' (default) or 'mono'
 * @param opts.color       mono colour override
 * @param opts.rounded     corner radius for white/purple tiles (default 15 @ 64u)
 */
export function markSvg(
  size: number,
  opts: {
    background?: MarkBackground;
    tone?: MarkTone;
    color?: string;
    rounded?: number;
  } = {},
): string {
  const bg = opts.background ?? 'transparent';
  const rx = opts.rounded ?? 15;
  // On a purple field the mark is white; otherwise honour the tone.
  const inner =
    bg === 'purple'
      ? markInnerSvg('mono', { color: MARK_COLORS.onDark })
      : markInnerSvg(opts.tone ?? 'brand', { color: opts.color });
  const field =
    bg === 'white'
      ? `<rect x="2" y="2" width="60" height="60" rx="${rx}" fill="#ffffff" stroke="${MARK_COLORS.strong}" stroke-width="3"/>`
      : bg === 'purple'
        ? `<rect width="64" height="64" rx="${rx}" fill="${MARK_COLORS.strong}"/>`
        : '';
  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Postr">`,
    field,
    inner,
    '</svg>',
  ].join('');
}
