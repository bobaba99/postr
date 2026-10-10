/**
 * A chart block's picture for the PowerPoint file, made from the editor's
 * own drawing (record docs/fixes/31-exports-charts.md).
 *
 * The export runs in the editor (Export › PowerPoint), where every chart is
 * already drawn on the sheet, at the box it is laid out in, its text at the
 * sizes fix 13c set. So the picture is that svg, not a new drawing: copied,
 * given the poster's web font (chartFont.ts: an svg drawn as an image cannot
 * use the page's fonts), and drawn to a PNG at 300 px per printed inch
 * (fewer when that passes CHART_MAX_PIXELS, the most every engine's canvas
 * takes). Where it goes is read off the sheet too: the chart's host, its
 * caption and its note, each as its size before any turn, centred where it
 * is drawn, in poster units, so a turned chart is placed and turned as
 * PowerPoint turns a shape (about its centre).
 *
 * The one place the export reads the editor's page, as rasterizeSvg.ts is
 * the one place it draws: injected into the writer (`drawChart`), so the
 * writer stays `PosterDoc → bytes` for tests. Null when the chart is not on
 * the sheet or not drawn (it could not be drawn): the writer leaves it out
 * and says so. (A chart still drawing, or the sheet hidden by Preview, is
 * waited for before the export starts: charts/chartDrawing.ts.) A sheet
 * that is not shown (Preview) or not there (the editor left) cannot be
 * read at all: SheetNotShownError, and the writer writes nothing (review
 * round 2, R2-F1: read anyway, every chart read as "could not be drawn",
 * the file had none and the credit was spent).
 *
 * In two steps (record 31's review round 1, R1-F1): everything the page
 * says (the svg, copied, and every box) is read at once, with nothing
 * awaited in between, and the writer reads every chart before its first
 * await; only then are the pictures drawn (the font fetched, the canvas
 * step). Read after an await, a box moved with a scroll or a zoom made
 * meanwhile, measured against the sheet's place read before it: a caption
 * 5 in off in the file.
 */
import type { Block, PosterDoc } from '@postr/shared';
import { PX } from '@/poster/constants';
import type { ChartPicture, UnitBox } from './chartShape';
import type { SvgRasterizer } from './rasterizeSvg';
import { documentHasWebFont, embeddedFontCss } from './chartFont';
import { SheetNotShownError, editorSheet, sheetShown } from '@/charts/chartDrawing';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The editor's own marks inside a block (export/stripEditorChrome.ts). */
const EDITOR_UI = '[data-postr-selection-ui], [data-postr-resize-handle], [data-postr-editor-ui]';
/** Pixels per printed inch of a chart's picture (at the poster's full size). */
export const CHART_DPI = 300;
/** The most pixels a picture is drawn with: 4096², within every engine's canvas. */
export const CHART_MAX_PIXELS = 4096 * 4096;

/** Draws a chart's picture from what was read; null when it cannot. */
export type ChartDraw = (rasterize: SvgRasterizer) => Promise<ChartPicture | null>;
/**
 * Reads a chart block off the page now (synchronously) and answers how to
 * draw its picture later; null when the chart is not drawn there.
 */
export type ChartDrawer = (block: Block, doc: PosterDoc) => ChartDraw | null;

/** A picture's pixel size for a box `wIn` × `hIn` inches: 300 per inch, or fewer past the cap. */
export function picturePixels(wIn: number, hIn: number): { w: number; h: number } {
  const dpi = Math.min(CHART_DPI, Math.sqrt(CHART_MAX_PIXELS / Math.max(1e-6, wIn * hIn)));
  return { w: Math.max(1, Math.round(wIn * dpi)), h: Math.max(1, Math.round(hIn * dpi)) };
}

const cssPx = (v: string): number => (/^-?[\d.]+px$/.test(v.trim()) ? parseFloat(v) : NaN);

/**
 * `el`'s box on the sheet in poster units: its laid-out size (computed
 * width and height, before any transform; `fallback` where the page gives
 * none), centred on the middle of what is drawn (a turned box's bounding
 * rectangle has the box's centre).
 */
function boxOnSheet(el: Element, sheet: DOMRect, scale: number, fallback?: { w: number; h: number }): UnitBox | null {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  let w = cssPx(cs.width);
  let h = cssPx(cs.height);
  if (!(w > 0 && h > 0)) {
    if (!fallback) return null;
    ({ w, h } = fallback);
  }
  const cx = ((r.left + r.right) / 2 - sheet.left) / scale;
  const cy = ((r.top + r.bottom) / 2 - sheet.top) / scale;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The chart drawn on the editor's sheet, as a picture with its boxes. */
export const editorChartPicture: ChartDrawer = (block, doc) => {
  if (typeof document === 'undefined') return null;
  const sheetEl = editorSheet();
  // The poster must be shown to be read (review round 2, R2-F1).
  if (!sheetEl) throw new SheetNotShownError('gone');
  if (!sheetShown(sheetEl)) throw new SheetNotShownError('hidden');
  const frame = sheetEl.querySelector(`[data-block-id="${block.id.replace(/["\\]/g, '\\$&')}"]`);
  // The chart's own svg, not a selected frame's icons (its handle row's).
  const svg = frame
    ? [...frame.querySelectorAll<SVGSVGElement>('svg[viewBox]')].find((s) => !s.closest(EDITOR_UI) && !s.parentElement?.closest('svg'))
    : undefined;
  const host = svg?.parentElement;
  if (!frame || !svg || !host) return null;
  const sheet = sheetEl.getBoundingClientRect();
  const scale = sheet.width / (doc.widthIn * PX);
  if (!(scale > 0)) return null;
  // The chart is drawn at 10 render px per poster unit (ChartBlock): its
  // viewBox is the box it was drawn for, where the page reports no size.
  const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const box = boxOnSheet(host, sheet, scale, vb[2]! > 0 && vb[3]! > 0 ? { w: vb[2]! / PX, h: vb[3]! / PX } : undefined);
  if (!box) return null;
  const capEl = frame.querySelector('[data-postr-caption]');
  const noteEl = frame.querySelector('[data-postr-note]');
  const caption = capEl ? boxOnSheet(capEl, sheet, scale) : null;
  const note = noteEl ? boxOnSheet(noteEl, sheet, scale) : null;
  const text = svg.textContent ?? '';

  const px = picturePixels(box.w / PX, box.h / PX);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', SVG_NS);
  // The image's size: its width and height attributes (the copy's own
  // style still says width: 100%, which an svg image does not size by:
  // the same pictures without a style change in Chromium, Firefox and
  // WebKit, record 31 §8).
  copy.setAttribute('width', String(px.w));
  copy.setAttribute('height', String(px.h));
  const webFont = documentHasWebFont(doc.fontFamily);

  // Nothing above awaits: the page is read. Below, nothing reads it.
  return async (rasterize) => {
    let fontMissing = false;
    if (webFont) {
      const css = await embeddedFontCss(doc.fontFamily, text);
      if (css) {
        const style = document.createElementNS(SVG_NS, 'style');
        style.textContent = css;
        copy.insertBefore(style, copy.firstChild);
      } else {
        fontMissing = true;
      }
    }
    const png = await rasterize(new TextEncoder().encode(new XMLSerializer().serializeToString(copy)), px.w, px.h);
    if (!png || png.length === 0) return null;
    return { png, box, caption, note, ...(fontMissing ? { fontMissing } : {}) };
  };
};
