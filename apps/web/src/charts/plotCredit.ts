/**
 * The plot-picker credit — "made by postr.sh" + the square brand logo.
 *
 * Chart-chooser exports (SVG / PNG / ZIP) carry a quiet credit; on-screen
 * previews do NOT (this is added at the DOWNLOAD seam in download.ts, not
 * in the shared renderChart, so charts inserted into a poster are never
 * double-marked — the poster has its own acknowledgement).
 *
 * Design (approved via visual companion, 2026-08-06):
 *   - 11px, flush RIGHT, purple ink (#7c6aed), zero padding — the least
 *     attention-grabbing treatment. Smaller and lighter than any real
 *     chart text (ticks ≥18pt, titles ≥24pt), so it can never read as data.
 *   - the small square mark (shared brand geometry) sits after the text.
 *   - it lives in ADDED canvas below the plot; the plot area (width, bars,
 *     ticks, labels) is untouched, so data readability cannot regress.
 */
import {
  MARK_PATH_RISE,
  MARK_PATH_FALL,
  MARK_DOT,
  MARK_COLORS,
} from '@/brand/markGeometry';

/** Height of the credit band added below the plot, in SVG user units. */
export const PLOT_CREDIT_BAND = 26;

const CREDIT_TEXT = 'made by postr.sh';
const FONT_PX = 11;
const LOGO = 15; // logo box side, in SVG user units
const RIGHT_PAD = 8;

/**
 * A `<g>` fragment placing the credit flush-right within a band of width
 * `width`, at vertical offset `top` (the y where the added band starts).
 * Inlines the logo as `<path>`s (a standalone exported SVG can't rely on a
 * document-level <symbol>).
 */
export function plotCreditSvg(width: number, top: number): string {
  const cy = top + PLOT_CREDIT_BAND / 2; // vertical centre of the band
  const logoX = width - RIGHT_PAD - LOGO;
  const textX = logoX - 5;
  const scale = LOGO / 64; // map the 64-unit mark into the LOGO box
  const logoY = cy - LOGO / 2;
  return [
    `<g aria-label="${CREDIT_TEXT}">`,
    `<text x="${textX}" y="${cy}" text-anchor="end" dominant-baseline="central" ` +
      `font-family="system-ui, -apple-system, sans-serif" font-size="${FONT_PX}" ` +
      `font-weight="600" fill="${MARK_COLORS.strong}">${CREDIT_TEXT}</text>`,
    `<g transform="translate(${logoX} ${logoY}) scale(${scale})">`,
    `<path d="${MARK_PATH_RISE}" stroke="${MARK_COLORS.strong}" stroke-width="5.5" stroke-linecap="round" fill="none"/>`,
    `<path d="${MARK_PATH_FALL}" stroke="${MARK_COLORS.light}" stroke-width="5.5" stroke-linecap="round" fill="none"/>`,
    `<circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}" fill="${MARK_COLORS.strong}"/>`,
    `</g>`,
    `</g>`,
  ].join('');
}
