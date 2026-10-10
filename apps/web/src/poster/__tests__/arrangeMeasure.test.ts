/**
 * Record 28 — Auto-Arrange's measurements (arrangeMeasure.ts), against a
 * stand-in layout engine: jsdom lays nothing out, so here a box's height is
 * its own fixed height or its text wrapped at its width (2.4 px a character
 * on 8 px lines), summed down its children, and a span's width is 2.4 px a
 * character (700 weight: 3 px). The real engine is measured in the browser
 * (scripts/auto-arrange-check.mjs, G11: within 0.5 units of the heights
 * drawn after Auto-Arrange).
 * Re-run: npx vitest run src/poster/__tests__/arrangeMeasure.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@postr/shared';
import { lineMinWidth, measureHeights, tableMinWidth } from '../arrangeMeasure';

/** The box's width in px: its own style, else its parent's. */
function widthOf(el: HTMLElement): number {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const w = parseFloat(n.style.width);
    if (Number.isFinite(w)) return w;
  }
  return 0;
}
/** Stand-in layout: fixed height, or children stacked, or text wrapped; a frame adds its 1 px borders. */
function heightOf(el: HTMLElement): number {
  const fixed = parseFloat(el.style.height);
  if (Number.isFinite(fixed)) return fixed;
  const frame = el.dataset.blockId !== undefined ? 2 : 0;
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length) return kids.reduce((a, k) => a + heightOf(k), 0) + frame;
  const text = el.textContent ?? '';
  return (text ? Math.ceil((text.length * 2.4) / widthOf(el)) * 8 : 0) + frame;
}

let layout = true;
beforeEach(() => {
  layout = true;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const e = el as HTMLElement;
    const w = e.tagName === 'SPAN' ? (e.textContent ?? '').length * (/700/.test(e.style.font) ? 3 : 2.4) : widthOf(e);
    return { height: layout ? `${heightOf(e)}px` : 'auto', width: layout ? `${w}px` : 'auto' } as CSSStyleDeclaration;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return layout ? heightOf(this) : 0;
  });
});
afterEach(() => vi.restoreAllMocks());

const block = (o: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({
  x: 0, y: 0, w: 150, h: 40, content: '', imageSrc: null, imageFit: 'contain', tableData: null, ...o,
});

/** A sheet with a text block (120 characters) and a figure (100 tall, a 60-character caption). */
function sheet() {
  const canvas = document.createElement('div');
  canvas.innerHTML = `
    <div data-block-id="t" style="width:150px">${'x'.repeat(120)}</div>
    <div data-block-id="f" style="width:150px"><div style="height:100px"></div><div>${'c'.repeat(60)}</div></div>`;
  document.body.appendChild(canvas);
  const blocks = [block({ id: 't', type: 'text', h: 30 }), block({ id: 'f', type: 'image', h: 100 })];
  return { canvas, blocks };
}

describe('a block’s height at a width', () => {
  it('text is laid out at the width asked, not its own', () => {
    const { canvas, blocks } = sheet();
    const at = measureHeights(canvas, blocks, [10, 24]);
    // 120 × 2.4 = 288 px of text: 2 lines at 150 px wide, 3 at 100, 2 at 240; +2 for the frame's border.
    expect(at(0, 10)).toBeCloseTo((3 * 8 + 2) / 10, 6);
    expect(at(0, 24)).toBeCloseTo((2 * 8 + 2) / 10, 6);
  });

  it('a figure keeps its shape and adds its caption wrapped at the width', () => {
    const { canvas, blocks } = sheet();
    const at = measureHeights(canvas, blocks, [10, 30]);
    // Image area 100 × 150 scales with the width; the caption (144 px of text) wraps.
    expect(at(1, 10)).toBeCloseTo((100 * (100 / 150) + 2 * 8 + 2) / 10, 6);
    expect(at(1, 30)).toBeCloseTo((300 * (100 / 150) + 1 * 8 + 2) / 10, 6);
  });

  it('a figure’s image area is read as drawn, not from its stored height (review finding B-R7)', () => {
    // The engine draws a stored 100.004 px area at its layout unit: 100 px here.
    const canvas = document.createElement('div');
    canvas.innerHTML = `
      <div data-block-id="f" style="width:150px"><div data-postr-figure-area="" style="height:100px"></div><div>${'c'.repeat(60)}</div></div>
      <div data-block-id="g" style="width:150px;height:80px"><div></div></div>`;
    document.body.appendChild(canvas);
    const blocks = [block({ id: 'f', type: 'image', h: 100.004 }), block({ id: 'g', type: 'chart', h: 80.004 })];
    const at = measureHeights(canvas, blocks, [30]);
    // Caption 1 line at 300 px and the frame's 2 px, plus the area at the width, exactly.
    expect(at(0, 30)).toBeCloseTo((8 + 2 + 300 * (100.004 / 150)) / 10, 9);
    // A frame of fixed height is drawn at its stored height: the area at the width.
    expect(at(1, 30)).toBeCloseTo((300 * (80.004 / 150)) / 10, 9);
  });

  it('a width not measured up front is measured when asked', () => {
    const { canvas, blocks } = sheet();
    const at = measureHeights(canvas, blocks, []);
    expect(at(0, 10)).toBeCloseTo(2.6, 6);
  });

  it('leaves nothing on the sheet and moves no frame', () => {
    const { canvas, blocks } = sheet();
    const before = canvas.innerHTML;
    measureHeights(canvas, blocks, [10, 15, 20]);
    expect(canvas.innerHTML).toBe(before);
  });

  it('without a layout engine, the stored heights stand in (a figure’s scaled to the width)', () => {
    layout = false;
    const { canvas, blocks } = sheet();
    const at = measureHeights(canvas, blocks, [30]);
    expect(at(0, 30)).toBe(3);
    expect(at(1, 30)).toBeCloseTo(20, 6);
  });
});

describe('the widths that bound a column', () => {
  it('a body line of 40 characters: 40 average characters of the sample', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    // "participants reported higher" is 28 characters at 2.4 px each.
    expect(lineMinWidth(canvas, '400 5px serif')).toBeCloseTo(96, 6);
  });

  it('a table: no word in a cell breaks, given each column’s share', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    const t = block({
      id: 'tb', type: 'table',
      tableData: { rows: 2, cols: 2, cells: ['Measure', 'p', 'Reaction', '<b>0.01</b>'], colWidths: [75, 25], borderPreset: 'apa' },
    });
    // Column 1: "Reaction" 8 × 2.4 = 19.2 px (header "Measure" bold 7 × 3 = 21) over 75 %;
    // column 2: "0.01" 4 × 2.4 = 9.6 px over 25 %. Each word adds 9.5 px of cell; the frame 4.
    expect(tableMinWidth(canvas, t, 'serif', 5)).toBeCloseTo(Math.max((21 + 9.5) / 0.75, (9.6 + 9.5) / 0.25) + 4, 6);
  });
});
