/**
 * PPTX-only palette-swap utility slide (Phase 2 — Task 7).
 *
 * Appends ONE slide with a labeled row of swatches per curated palette
 * so a user can repaint the deck by hand inside PowerPoint after
 * export, without leaving the file. It is a genuinely PPTX-only
 * artifact: nothing here renders in the PDF export path, and it is
 * appended directly to a `pptxgenjs` instance rather than going through
 * `StyledSlideDeck` (see `deckWriter.ts` for how the styled slides get
 * appended in the pptx path only).
 *
 * ── The importer contract ────────────────────────────────────────────
 *
 * Same mechanism as `templateSlides.ts`: the slide is named with
 * `TEMPLATE_SLIDE_PREFIX`, which `import/pptx/parsePptx.ts` reads to
 * avoid warning that a slide was "skipped" when re-importing a file
 * Postr itself produced.
 *
 * Swatches are real `rect` shapes with a solid fill — never a
 * rasterized image — so they stay editable (recolor a shape, or lift
 * the hex from its fill) inside PowerPoint.
 */
import type PptxGenJS from 'pptxgenjs';
import { TEMPLATE_SLIDE_PREFIX } from '../pptx/templateMarker';

/** The slide's own `<p:cSld name>`, distinct from the layout-template names. */
export const PALETTE_SLIDE_NAME = `${TEMPLATE_SLIDE_PREFIX}Palette swatches`;

/** Everything the palette slide needs to match the deck's own type/voice. */
export interface PaletteSlideStyle {
  font: string;
  headingPt: number;
  bodyPt: number;
  labelPt: number;
  /** Hex (with or without '#') for heading/body/label text. */
  textColor: string;
}

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;

const HEADING_TEXT = 'Swap the deck’s palette';
const BODY_TEXT =
  'Pick a row below, then select each shape in the deck and repaint it with ' +
  'these colors (Format Shape → Fill / Font Color). Delete this slide when you’re done.';

/**
 * pptxgenjs exposes no public setter for a slide's `<p:cSld name>` — see
 * `templateSlides.ts` `nameSlide` for the full rationale. Duplicated
 * here (rather than imported) because it is a tiny, self-contained cast
 * and the two modules should not develop a coupling over a one-liner.
 */
function nameSlide(slide: PptxGenJS.Slide, name: string): void {
  (slide as PptxGenJS.Slide & { _name?: string })._name = name;
}

/** Strip a leading '#' so pptxgenjs gets the hex6 it expects. */
function toHex6(color: string, fallback: string): string {
  const stripped = color.startsWith('#') ? color.slice(1) : color;
  return stripped.length > 0 ? stripped : fallback;
}

const ROW_LABEL_W_IN = 1.6;
const SWATCH_GAP_IN = 0.08;
const ROW_TOP_IN = 2.15;
const ROW_HEIGHT_IN = 1.05;
const ROW_GAP_IN = 0.15;
const MARGIN_IN = SLIDE_WIDTH_IN * 0.06;

/** One labeled row: "Palette N" + one swatch rect per hex in the row. */
function addPaletteRow(
  slide: PptxGenJS.Slide,
  rowIndex: number,
  colors: readonly string[],
  style: PaletteSlideStyle,
): void {
  const y = ROW_TOP_IN + rowIndex * (ROW_HEIGHT_IN + ROW_GAP_IN);
  const textColor = toHex6(style.textColor, '111111');

  slide.addText(`Palette ${rowIndex + 1}`, {
    x: MARGIN_IN,
    y,
    w: ROW_LABEL_W_IN,
    h: ROW_HEIGHT_IN,
    fontFace: style.font,
    fontSize: style.bodyPt,
    bold: true,
    color: textColor,
    align: 'left',
    valign: 'middle',
  });

  const swatchAreaX = MARGIN_IN + ROW_LABEL_W_IN + 0.2;
  const swatchAreaW = SLIDE_WIDTH_IN - MARGIN_IN - swatchAreaX;
  const swatchCount = Math.max(colors.length, 1);
  const swatchW = (swatchAreaW - SWATCH_GAP_IN * (swatchCount - 1)) / swatchCount;

  colors.forEach((color, i) => {
    const x = swatchAreaX + i * (swatchW + SWATCH_GAP_IN);
    slide.addShape('rect', {
      x,
      y,
      w: swatchW,
      h: ROW_HEIGHT_IN,
      fill: { color: toHex6(color, 'CCCCCC') },
      line: { color: textColor, width: 0.5 },
    });
    slide.addText(`#${toHex6(color, 'CCCCCC')}`, {
      x,
      y: y + ROW_HEIGHT_IN - 0.28,
      w: swatchW,
      h: 0.26,
      fontFace: style.font,
      fontSize: Math.max(style.labelPt - 2, 6),
      color: readableLabelColor(color),
      align: 'center',
      valign: 'bottom',
    });
  });
}

/**
 * Pick black or white so the hex label stays legible on its own
 * swatch, using the standard relative-luminance heuristic (WCAG-ish,
 * not exact — good enough for a small caption over a flat fill).
 */
function readableLabelColor(color: string): string {
  const hex6 = toHex6(color, 'CCCCCC').padEnd(6, '0');
  const r = parseInt(hex6.slice(0, 2), 16) || 0;
  const g = parseInt(hex6.slice(2, 4), 16) || 0;
  const b = parseInt(hex6.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '111111' : 'FFFFFF';
}

/**
 * Append one utility slide with a labeled swatch row per palette in
 * `palettes` (expects exactly 4 rows in normal use — the brief's
 * curated set — but renders whatever it is given).
 */
export function addPaletteSlide(
  pptx: PptxGenJS,
  palettes: readonly (readonly string[])[],
  style: PaletteSlideStyle,
): void {
  const slide = pptx.addSlide();
  nameSlide(slide, PALETTE_SLIDE_NAME);
  slide.background = { color: 'FFFFFF' };

  const textColor = toHex6(style.textColor, '111111');
  slide.addText(HEADING_TEXT, {
    x: MARGIN_IN,
    y: SLIDE_HEIGHT_IN * 0.06,
    w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
    h: 0.6,
    fontFace: style.font,
    fontSize: style.headingPt,
    bold: true,
    color: textColor,
    align: 'left',
    valign: 'top',
  });
  slide.addText(BODY_TEXT, {
    x: MARGIN_IN,
    y: SLIDE_HEIGHT_IN * 0.06 + 0.55,
    w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
    h: 0.6,
    fontFace: style.font,
    fontSize: style.bodyPt,
    color: textColor,
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: 1.2,
  });

  palettes.forEach((colors, i) => addPaletteRow(slide, i, colors, style));
}
