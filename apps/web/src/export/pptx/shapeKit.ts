/**
 * The pieces the PowerPoint writer's block emitters share (writer.ts, and
 * since record 31 chartShape.ts): the context, geometry and size
 * conversions, rich-text runs, and the caption and note text boxes of
 * figures and tables. Moved out of writer.ts unchanged (record 31) so the
 * chart's emitter can use them and writer.ts stays under 800 lines.
 *
 * Pure: no DOM, no store.
 */
import type PptxGenJS from 'pptxgenjs';
import type { Block, PosterDoc } from '@postr/shared';
import { unitsToInches, unitsToPoints } from '../units';
import { cssColorToHex6, parseRichText, type RichParagraph, type RichRun } from '../richText';
import type { ResolvedAsset } from '../resolveAssets';
import type { PptxExportOptions } from './writer';

export interface Ctx {
  doc: PosterDoc;
  /** `doc.fontFamily` restricted to the curated families. pptxgenjs
   *  writes font names into `typeface="…"` WITHOUT escaping, so an
   *  `&` or `<` in the name emits malformed XML that PowerPoint
   *  refuses to open. Names can arrive from an imported deck, so
   *  every emitter uses this rather than `doc.fontFamily` directly. */
  font: string;
  scale: number;
  captionNumbers: Record<string, number>;
  headingNumbers: Record<string, number>;
  assets: Map<string, ResolvedAsset>;
  options: PptxExportOptions;
  warnings: string[];
}

/** Block geometry → slide inches at the plan's scale. */
export const rect = (b: Block, s: number) => ({
  x: unitsToInches(b.x) * s,
  y: unitsToInches(b.y) * s,
  w: unitsToInches(b.w) * s,
  h: unitsToInches(b.h) * s,
});

export const pt = (sizeUnits: number, s: number): number =>
  Math.round(unitsToPoints(sizeUnits) * s * 100) / 100;

export const hex = (css: string | null | undefined, fallback: string): string =>
  cssColorToHex6(css ?? null) ?? fallback;

export function runOptions(run: RichRun): PptxGenJS.TextPropsOptions {
  const opts: PptxGenJS.TextPropsOptions = {};
  if (run.bold) opts.bold = true;
  if (run.italic) opts.italic = true;
  if (run.underline) opts.underline = { style: 'sng' };
  if (run.strike) opts.strike = 'sngStrike';
  if (run.sub) opts.subscript = true;
  if (run.sup) opts.superscript = true;
  const color = cssColorToHex6(run.color);
  if (color) opts.color = color;
  const highlight = cssColorToHex6(run.highlight);
  if (highlight) opts.highlight = highlight;
  return opts;
}

/** Guard: pptxgenjs needs at least one run per text shape. */
export const orEmptyRun = (runs: PptxGenJS.TextProps[]): PptxGenJS.TextProps[] =>
  runs.length > 0 ? runs : [{ text: '', options: {} }];

/** Paragraphs → pptxgenjs run array with breakLine + bullets. */
export function paragraphsToTextProps(
  paragraphs: readonly RichParagraph[],
): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((p, pi) => {
    const last = pi === paragraphs.length - 1;
    const bullet: PptxGenJS.TextPropsOptions['bullet'] =
      p.list === 'unordered' ? true : p.list === 'ordered' ? { type: 'number' } : undefined;
    if (p.runs.length === 0) {
      out.push({ text: '', options: { breakLine: !last } });
      return;
    }
    p.runs.forEach((run, ri) => {
      const opts = runOptions(run);
      if (bullet !== undefined && ri === 0) opts.bullet = bullet;
      opts.breakLine = ri === p.runs.length - 1 && !last;
      out.push({ text: run.text, options: opts });
    });
  });
  return out;
}

export interface SubBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Caption layout: returns caption + content + note boxes within the
 *  block frame, mirroring the canvas CaptionWrapper geometry. The
 *  note always sits directly under the content (canvas keeps body +
 *  note in one vertical sub-column regardless of caption side). */
export function captionSplit(
  b: Block,
  ctx: Ctx,
): { caption: SubBox | null; content: SubBox; note: SubBox | null } {
  const box = rect(b, ctx.scale);
  const position = b.captionPosition ?? 'top';
  const n = ctx.captionNumbers[b.id];
  const smallPt = pt(Math.round(ctx.doc.styles.body.size * 0.85), ctx.scale);
  const smallH = (smallPt / 72) * 1.6; // one small-text line + breathing room, inches
  const gap = 0.06 * ctx.scale;
  const noteUnder = (content: SubBox): SubBox | null =>
    b.note
      ? { x: content.x, y: content.y + content.h + gap, w: content.w, h: smallH }
      : null;
  if (position === 'none' || n === undefined) {
    return { caption: null, content: box, note: noteUnder(box) };
  }
  if (position === 'left' || position === 'right') {
    const capW = box.w * 0.35;
    const contentW = box.w - capW - gap;
    const capX = position === 'left' ? box.x : box.x + contentW + gap;
    const contentX = position === 'left' ? box.x + capW + gap : box.x;
    const content = { x: contentX, y: box.y, w: contentW, h: box.h };
    return {
      caption: { x: capX, y: box.y, w: capW, h: box.h },
      content,
      note: noteUnder(content),
    };
  }
  if (position === 'bottom') {
    const note = noteUnder(box);
    // Canvas order for bottom captions is content → note → caption,
    // so the caption drops below the note when one exists.
    const capY = note ? note.y + note.h + gap : box.y + box.h + gap;
    return {
      caption: { x: box.x, y: capY, w: box.w, h: smallH },
      content: box,
      note,
    };
  }
  // top (default): caption above, content keeps its declared frame
  // shifted below — same as the canvas where top captions grow the
  // block downward rather than squeezing the image.
  const content = { x: box.x, y: box.y + smallH + gap, w: box.w, h: box.h };
  return {
    caption: { x: box.x, y: box.y, w: box.w, h: smallH },
    content,
    note: noteUnder(content),
  };
}

export function captionText(b: Block, ctx: Ctx, label: 'Figure' | 'Table'): PptxGenJS.TextProps[] {
  const n = ctx.captionNumbers[b.id];
  const runs = paragraphsToTextProps(parseRichText(b.caption ?? ''));
  return [{ text: `${label} ${n}. `, options: { bold: true } }, ...runs];
}

/** Small muted italic text shape — captions and figure/table notes,
 *  matching the canvas CaptionWrapper styling (0.85 × body size). */
export function addMutedText(
  slide: PptxGenJS.Slide,
  runs: PptxGenJS.TextProps[],
  box: SubBox,
  ctx: Ctx,
  /** A turned chart's caption turns with it (record 31). */
  rotate?: number,
): void {
  slide.addText(orEmptyRun(runs), {
    ...box,
    ...(rotate ? { rotate } : {}),
    fontFace: ctx.font,
    fontSize: pt(Math.round(ctx.doc.styles.body.size * 0.85), ctx.scale),
    color: hex(ctx.doc.palette.muted, '6B7280'),
    italic: true,
    align: 'left',
    valign: 'top',
  });
}

// ── helpers ──────────────────────────────────────────────────────────

/** Ours: clockwise degrees, any sign. pptxgenjs: 0–359 clockwise. */
export function normalizeRotation(rotation: number | undefined): number | undefined {
  if (!rotation) return undefined;
  return ((Math.round(rotation) % 360) + 360) % 360 || undefined;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
