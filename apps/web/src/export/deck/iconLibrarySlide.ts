/**
 * PPTX-only icon-library utility slide (Phase 2 — Task 7).
 *
 * Places a curated, theme-recolored set of academic/scientific icons
 * (see `iconSet.ts` for what they are and their CC0-equivalent
 * sourcing note) on ONE appended slide so a user can copy an icon into
 * their own slides inside PowerPoint after export. Genuinely PPTX-only:
 * appended straight to the pptxgenjs instance, never reachable from the
 * PDF export path.
 *
 * ── Why rasterize ─────────────────────────────────────────────────────
 *
 * pptxgenjs's image loader cannot load SVG at all — it feeds a
 * `data:` URI to an in-browser `<img>`, which fires `onerror` for SVG
 * and makes the whole `pptx.write()` reject (see `rasterizeSvg.ts`,
 * which the poster writer already works around the same way for the
 * seeded acknowledgement mark). So each icon's SVG source is converted
 * to a PNG via an injectable `SvgRasterizer` — defaulting to the same
 * `browserRasterizeSvg` the poster writer uses — before `addImage`.
 * Rasterization failures are dropped silently (that icon is skipped)
 * rather than thrown, matching the poster writer's graceful-degradation
 * contract; a partially-filled icon slide is strictly better than a
 * failed export.
 *
 * ── Recoloring ────────────────────────────────────────────────────────
 *
 * Every `CuratedIcon.svg` uses `stroke="currentColor"`. Recoloring to
 * the theme is one substitution: wrap the source in an outer `<svg
 * style="color:#hex">` so `currentColor` resolves to the theme's accent
 * before rasterizing — no per-icon string surgery.
 */
import type PptxGenJS from 'pptxgenjs';
import type { Theme } from '../../manuscript/deck/styledTypes';
import type { CuratedIcon } from './iconSet';
import { TEMPLATE_SLIDE_PREFIX } from '../pptx/templateMarker';
import { browserRasterizeSvg, type SvgRasterizer } from '../pptx/rasterizeSvg';

export const ICON_LIBRARY_SLIDE_NAME = `${TEMPLATE_SLIDE_PREFIX}Icon library`;

/** How many icons the slide places at most, per the brief's "~8-12". */
const MAX_ICONS = 12;

export interface IconLibrarySlideOptions {
  /** Injectable rasterizer (tests / headless). Defaults to the browser canvas path. */
  rasterizeSvg?: SvgRasterizer;
}

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;
const HEADING_TEXT = 'Icon library';
const BODY_TEXT =
  'Copy any icon below into your own slides. They already match the deck’s ' +
  'theme color. Delete this slide when you’re done.';

const GRID_COLUMNS = 6;
const CELL_W_IN = 1.9;
const CELL_H_IN = 1.55;
const ICON_SIZE_IN = 0.85;
const GRID_TOP_IN = 2.15;
const MARGIN_IN = SLIDE_WIDTH_IN * 0.06;

function nameSlide(slide: PptxGenJS.Slide, name: string): void {
  (slide as PptxGenJS.Slide & { _name?: string })._name = name;
}

/** Strip a leading '#' so pptxgenjs / SVG-color-string handling gets a bare hex6. */
function toHex6(color: string | undefined, fallback: string): string {
  const stripped = color?.startsWith('#') ? color.slice(1) : color;
  return stripped && stripped.length > 0 ? stripped : fallback;
}

/**
 * The theme's own accent: `palette[1]` (the SS1_theme.json sample's
 * second entry is the primary/text color, which reads fine as an icon
 * stroke too), falling back to `palette[0]` for a very short theme.
 */
function themeAccentHex(theme: Theme): string {
  const candidate = theme.palette[1] ?? theme.palette[0];
  return toHex6(candidate, '111111');
}

/**
 * Wrap an icon's `currentColor` source so it resolves to a concrete
 * hex before rasterizing — recoloring to the theme in one step.
 *
 * Depends on the icon starting with a literal `<svg ` (space after
 * the tag name, i.e. at least one attribute) — true for every
 * `CuratedIcon` today, since they all share `iconSet.ts`'s
 * `ICON_ATTRS` template. An icon added later with no leading
 * attribute (`<svg/>` or `<svg>`) or a byte-order-mark/whitespace
 * prefix would silently skip recoloring rather than throw — `svg` is
 * still valid SVG, just uncolored. If `CuratedIcon` ever stops
 * guaranteeing that shape, replace this with an anchored
 * `/^<svg\b/` regex and a hard failure (return null) instead of a
 * silent no-op.
 */
function recolorIconSvg(svg: string, hex6: string): string {
  return svg.replace('<svg ', `<svg style="color:#${hex6}" `);
}

/**
 * Rasterize and place one icon + its label. Resolves without adding
 * anything (never throws) if the rasterizer failed for this icon, so
 * the caller's loop simply moves on to the next one.
 */
async function addIconCell(
  slide: PptxGenJS.Slide,
  icon: CuratedIcon,
  cellIndex: number,
  accentHex6: string,
  labelHex6: string,
  rasterizeSvg: SvgRasterizer,
): Promise<void> {
  const col = cellIndex % GRID_COLUMNS;
  const row = Math.floor(cellIndex / GRID_COLUMNS);
  const cellX = MARGIN_IN + col * CELL_W_IN;
  const cellY = GRID_TOP_IN + row * CELL_H_IN;
  const iconX = cellX + (CELL_W_IN - ICON_SIZE_IN) / 2;

  const recolored = recolorIconSvg(icon.svg, accentHex6);
  const svgBytes = new TextEncoder().encode(recolored);
  const rasterPx = Math.round(ICON_SIZE_IN * 96); // fallback size only; icon SVG has no intrinsic size
  const png = await rasterizeSvg(svgBytes, rasterPx, rasterPx);
  if (!png || png.length === 0) return;

  const base64 = uint8ToBase64(png);
  slide.addImage({
    data: `image/png;base64,${base64}`,
    x: iconX,
    y: cellY,
    w: ICON_SIZE_IN,
    h: ICON_SIZE_IN,
  });

  slide.addText(icon.label, {
    x: cellX,
    y: cellY + ICON_SIZE_IN + 0.04,
    w: CELL_W_IN,
    h: 0.3,
    fontSize: 9,
    color: labelHex6,
    align: 'center',
    valign: 'top',
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // `btoa` is available in both the browser and jsdom test environment.
  return btoa(binary);
}

/**
 * Append one utility slide placing up to `MAX_ICONS` theme-recolored
 * icons in a grid, each rasterized to PNG (pptxgenjs cannot embed SVG).
 */
export async function addIconLibrarySlide(
  pptx: PptxGenJS,
  icons: readonly CuratedIcon[],
  theme: Theme,
  options: IconLibrarySlideOptions = {},
): Promise<void> {
  const rasterizeSvg = options.rasterizeSvg ?? browserRasterizeSvg;
  const accentHex6 = themeAccentHex(theme);
  const textHex6 = toHex6(theme.palette[1], '111111');
  // Last palette entry tends to be the muted/neutral swatch (see
  // SS1_theme.json); fall back to text color if the theme is short.
  const labelHex6 = toHex6(theme.palette.at(-1), textHex6);

  const slide = pptx.addSlide();
  nameSlide(slide, ICON_LIBRARY_SLIDE_NAME);
  slide.background = { color: toHex6(theme.palette[0], 'FFFFFF') };

  slide.addText(HEADING_TEXT, {
    x: MARGIN_IN,
    y: SLIDE_HEIGHT_IN * 0.06,
    w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
    h: 0.6,
    fontSize: 20,
    bold: true,
    color: textHex6,
    align: 'left',
    valign: 'top',
  });
  slide.addText(BODY_TEXT, {
    x: MARGIN_IN,
    y: SLIDE_HEIGHT_IN * 0.06 + 0.55,
    w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
    h: 0.5,
    fontSize: 12,
    color: textHex6,
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: 1.2,
  });

  const placed = icons.slice(0, MAX_ICONS);
  for (const [i, icon] of placed.entries()) {
    await addIconCell(slide, icon, i, accentHex6, labelHex6, rasterizeSvg);
  }
}
