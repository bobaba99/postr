/**
 * A chart block in the PowerPoint file (record docs/fixes/31-exports-charts.md):
 * a picture of the chart as the editor draws it, at the box it is drawn in,
 * and its caption and note as ordinary text boxes, by the image blocks'
 * rules ("Figure N." from the reading order, small muted italic text).
 *
 * The picture and the boxes come from `ChartPicture` (chartPicture.ts reads
 * them off the editor's sheet); this emitter only places them, at the
 * export's scale (half for a poster over 56 in). A chart with no picture
 * (it could not be drawn) is left out with a warning, its caption and note
 * kept, placed by the image blocks' layout. Native, editable PowerPoint
 * charts are a Later option (record 31 §10).
 */
import type PptxGenJS from 'pptxgenjs';
import type { Block } from '@postr/shared';
import { unitsToInches } from '../units';
import { parseRichText, richTextToPlain } from '../richText';
import {
  addMutedText,
  bytesToBase64,
  captionSplit,
  captionText,
  normalizeRotation,
  paragraphsToTextProps,
  type Ctx,
  type SubBox,
} from './shapeKit';

/** A box in poster units on the sheet: its size before any turn, centred where it is drawn. */
export interface UnitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A chart as the editor draws it: the picture, and where it and its caption and note are. */
export interface ChartPicture {
  /** The chart drawn to a PNG (transparent where the chart is). */
  png: Uint8Array;
  box: UnitBox;
  caption: UnitBox | null;
  note: UnitBox | null;
  /** The page had the poster's web font, and it could not be put in the picture. */
  fontMissing?: boolean;
}

export const CHART_LEFT_OUT = 'A chart could not be drawn, so the PowerPoint file leaves it out.';
export const CHART_FONT_MISSING = 'A chart’s font could not be loaded for its picture, so the picture draws its text in another font.';

const inches = (box: UnitBox, s: number): SubBox => ({
  x: unitsToInches(box.x) * s,
  y: unitsToInches(box.y) * s,
  w: unitsToInches(box.w) * s,
  h: unitsToInches(box.h) * s,
});

export function addChart(slide: PptxGenJS.Slide, b: Block, ctx: Ctx, picture: ChartPicture | undefined): void {
  const rotate = normalizeRotation(b.rotation);
  const fallback = captionSplit(b, ctx);
  if (picture) {
    if (picture.fontMissing) ctx.warnings.push(CHART_FONT_MISSING);
    const n = ctx.captionNumbers[b.id];
    const caption = richTextToPlain(parseRichText(b.caption ?? '')).trim();
    slide.addImage({
      data: `image/png;base64,${bytesToBase64(picture.png)}`,
      ...inches(picture.box, ctx.scale),
      rotate,
      altText: n !== undefined ? `Figure ${n}. ${caption}`.trim() : caption || 'Chart',
    });
  } else {
    ctx.warnings.push(CHART_LEFT_OUT);
  }
  if (fallback.caption) {
    const at = picture?.caption ? inches(picture.caption, ctx.scale) : fallback.caption;
    addMutedText(slide, captionText(b, ctx, 'Figure'), at, ctx, rotate);
  }
  if (fallback.note) {
    const at = picture?.note ? inches(picture.note, ctx.scale) : fallback.note;
    addMutedText(slide, paragraphsToTextProps(parseRichText(b.note ?? '')), at, ctx, rotate);
  }
}
