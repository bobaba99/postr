/**
 * Auto-Arrange's measurements, taken from the sheet as the editor draws it
 * (record docs/fixes/28-auto-arrange.md).
 *
 * A block's height at a width is the height of a copy of its own drawn
 * frame laid out at that width, next to the frames on the sheet, so it
 * wraps text with the sheet's fonts, sizes, numbers and captions exactly as
 * the block will: text and headings wrap at their fixed font size, a table
 * wraps its cells, and a figure keeps its shape (its image area scales with
 * the width; its caption wraps). A figure's height is what its caption and
 * note add, as drawn, plus its image area at the width, exactly: the drawn
 * image area is read, not taken from the stored height, which the engine
 * draws snapped to its layout unit (1/64 px in Chromium). Taken from the
 * stored height, a second press measured a figure up to 0.0014 in apart
 * from the first and chose other widths (record 28 §9, B-R7). A frame of
 * fixed height (a figure with no caption or note, a chart) is drawn at its
 * stored height: its image area at the width.
 *
 * Without a layout engine (a unit test's jsdom draws nothing, so every frame
 * measures 0) the stored heights stand in, a figure's scaled to the width.
 */
import type { Block, PosterDoc } from '@postr/shared';
import { FONTS } from './constants';
import { autoArrange, keepsShape, shapeHeight, type ArrangeResult } from './autoLayout';

const key = (wIn: number) => wIn.toFixed(3);

function makeHost(canvas: HTMLElement): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-postr-measure', '');
  host.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;contain:layout style';
  canvas.appendChild(host);
  return host;
}

/** A copy of a drawn frame, at `w` units wide, inert. */
function copyAt(frame: HTMLElement, w: number): HTMLElement {
  const c = frame.cloneNode(true) as HTMLElement;
  // Kept as an attribute (the sheet's list styles select on it) but empty,
  // so nothing that maps frames to blocks reads a copy as a block.
  c.setAttribute('data-block-id', '');
  for (const n of c.querySelectorAll('[id]')) n.removeAttribute('id');
  for (const img of c.querySelectorAll('img')) {
    img.removeAttribute('src');
    img.removeAttribute('srcset');
  }
  c.style.left = '0px';
  c.style.top = '0px';
  c.style.width = `${w}px`;
  c.style.transform = 'none';
  c.style.animation = 'none';
  c.style.transition = 'none';
  return c;
}

/** A laid-out element's height in px (units), fractional, before transforms. */
function heightOf(el: HTMLElement): number {
  const h = parseFloat(getComputedStyle(el).height);
  return Number.isFinite(h) ? h : el.offsetHeight;
}

/**
 * Block i's height in inches at a width in inches, for each block in
 * `blocks`: measured for every width in `widthsIn` at once, and for any
 * other width when it is first asked for.
 */
export function measureHeights(
  canvas: HTMLElement,
  blocks: readonly Block[],
  widthsIn: readonly number[],
): (i: number, wIn: number) => number {
  const drawn = new Map<string, HTMLElement>();
  for (const el of canvas.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const id = el.getAttribute('data-block-id');
    if (id) drawn.set(id, el);
  }
  const frames = blocks.map((b) => drawn.get(b.id) ?? null);
  const table = new Map<string, Float64Array>();
  // A block with no frame on the sheet, or a sheet with no layout engine.
  const stored = (b: Block, w: number) => (keepsShape(b) ? shapeHeight(b, w) : b.h);
  const laidOut = hasLayout(canvas, frames, blocks);

  const measure = (wsIn: readonly number[]) => {
    if (!laidOut) {
      for (const wIn of wsIn) table.set(key(wIn), Float64Array.from(blocks, (b) => stored(b, wIn * 10) / 10));
      return;
    }
    // One copy per block, re-laid out at each width: far cheaper than a copy
    // per block and width (WebKit 59-75 ms against 250-330 ms for the same
    // heights, record 28 §8), because only the copy's width changes.
    const host = makeHost(canvas);
    try {
      const rows = wsIn.map(() => new Float64Array(blocks.length));
      frames.forEach((f, i) => {
        const b = blocks[i]!;
        const copy = f ? host.appendChild(copyAt(f, b.w)) : null;
        wsIn.forEach((wIn, j) => {
          const w = wIn * 10;
          if (!copy) {
            rows[j]![i] = stored(b, w) / 10;
            return;
          }
          copy.style.width = `${w}px`;
          rows[j]![i] = (keepsShape(b) ? figureChrome(copy, b) + shapeHeight(b, w) : heightOf(copy)) / 10;
        });
      });
      wsIn.forEach((wIn, j) => table.set(key(wIn), rows[j]!));
    } finally {
      host.remove();
    }
  };

  measure(widthsIn);
  return (i, wIn) => {
    if (!table.has(key(wIn))) measure([wIn]);
    return table.get(key(wIn))![i]!;
  };
}

/**
 * What a figure's frame adds to its image area (caption, note, border), as
 * drawn: the frame less its image area as drawn (`data-postr-figure-area`,
 * blocks.tsx), or nothing for a frame of fixed height. Without the marker
 * (an older frame) the stored height stands in for the area.
 */
function figureChrome(copy: HTMLElement, b: Block): number {
  if (copy.style.height && copy.style.height !== 'auto') return 0;
  const area = copy.querySelector<HTMLElement>('[data-postr-figure-area]');
  return heightOf(copy) - (area ? heightOf(area) : b.h);
}

/** Is there a layout engine? Without one (jsdom) every copy's box is 0 tall. */
function hasLayout(canvas: HTMLElement, frames: ReadonlyArray<HTMLElement | null>, blocks: readonly Block[]): boolean {
  const host = makeHost(canvas);
  try {
    return frames.some((f, i) => f !== null && host.appendChild(copyAt(f, blocks[i]!.w)).offsetHeight > 0);
  } finally {
    host.remove();
  }
}

/** Text widths (units) in the sheet's fonts, measured together. */
function textWidths(canvas: HTMLElement, items: Array<{ text: string; font: string }>): number[] {
  const host = makeHost(canvas);
  try {
    const spans = items.map(({ text, font }) => {
      const s = document.createElement('span');
      s.style.cssText = `display:inline-block;white-space:nowrap;font:${font}`;
      s.textContent = text;
      return host.appendChild(s);
    });
    return spans.map((s) => {
      const w = parseFloat(getComputedStyle(s).width);
      return Number.isFinite(w) ? w : 0;
    });
  } finally {
    host.remove();
  }
}

/** The CSS `font` shorthand for a weight, a size in units (px) and a family. */
export const cssFont = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

/**
 * The width (units) a body line holds 40 characters at: 40 average
 * characters of the prototype's sample, "participants reported higher"
 * (28 characters), in the body font. Text blocks have no side padding.
 */
export function lineMinWidth(canvas: HTMLElement, bodyFont: string): number {
  const [w] = textWidths(canvas, [{ text: 'participants reported higher', font: bodyFont }]);
  return (40 * (w ?? 0)) / 28;
}

const plain = (html: string) =>
  html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * A table's minimum width (units): the width at which no word in a cell has
 * to break, given each column's share of the table. A cell adds 8 px of
 * padding and up to 1.5 px of rule; the table's frame adds 4 px.
 */
export function tableMinWidth(canvas: HTMLElement, b: Block, family: string, size: number): number {
  const t = b.tableData;
  if (!t || t.cols <= 0) return 0;
  const shares = t.colWidths ?? Array<number>(t.cols).fill(100 / t.cols);
  const items: Array<{ text: string; font: string; c: number }> = [];
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) {
      for (const word of plain(t.cells[r * t.cols + c] ?? '').split(/\s+/).filter(Boolean)) {
        items.push({ text: word, font: cssFont(r === 0 ? 700 : 400, size, family), c });
      }
    }
  }
  const widths = textWidths(canvas, items);
  let need = 0;
  items.forEach((it, i) => {
    need = Math.max(need, (widths[i]! + 8 + 1.5) / ((shares[it.c] ?? 100 / t.cols) / 100));
  });
  return need > 0 ? need + 4 : 0;
}

/**
 * Auto-Arrange on the sheet as drawn: `canvas` is the sheet's element,
 * `canvasWidth` × `canvasHeight` its size in units, `titleOverflow` the
 * grown title's push. Returns the new block list; the caller stores it.
 */
export function arrangeSheet(
  canvas: HTMLElement,
  doc: PosterDoc,
  canvasWidth: number,
  canvasHeight: number,
  titleOverflow: number,
): ArrangeResult {
  const family = FONTS[doc.fontFamily]?.css ?? doc.fontFamily;
  const body = doc.styles.body;
  const drawn = new Map<string, number>();
  for (const el of canvas.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const id = el.getAttribute('data-block-id');
    const h = parseFloat(getComputedStyle(el).height);
    if (id && Number.isFinite(h)) drawn.set(id, h);
  }
  return autoArrange({
    blocks: doc.blocks,
    canvasWidth,
    canvasHeight,
    titleOverflow,
    drawnHeight: (b) => drawn.get(b.id) ?? b.h,
    measure: (blocks, widthsIn) => measureHeights(canvas, blocks, widthsIn),
    lineMin: lineMinWidth(canvas, cssFont(body.weight, body.size, family)),
    tableMin: (b) => tableMinWidth(canvas, b, family, body.size),
  });
}
