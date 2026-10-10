/**
 * Record 28 — the poster's ONE reading order (readingOrder.ts), read by
 * heading, figure and table numbers in the editor and the exports and by
 * Auto-Arrange (docs/fixes/28-auto-arrange.md).
 *
 * Before it, headings followed the block array (also paint order), figures
 * and tables top edge then left edge. Each test asserts the reading order,
 * so the array-order and top-then-left rules fail it.
 * Re-run: npx vitest run src/poster/__tests__/readingOrder.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { Block } from '@postr/shared';
import { makeBlocks, type LayoutKey } from '../templates';
import { columnIndex, numberBlocks, readingOrder } from '../readingOrder';
import { computeCaptionNumbers, computeHeadingNumbers } from '@/export/posterContent';

const W48 = 480;
const block = (o: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({
  x: 0, y: 0, w: 100, h: 50, content: '', imageSrc: null, imageFit: 'contain', tableData: null, ...o,
});
const headingsInOrder = (blocks: Block[], w = W48) =>
  readingOrder(blocks, w).filter((b) => b.type === 'heading').map((b) => b.content);
const headingsInArray = (blocks: Block[]) => blocks.filter((b) => b.type === 'heading').map((b) => b.content);

function welcome(): { blocks: Block[]; widthIn: number } {
  const zip = unzipSync(fs.readFileSync(path.resolve(__dirname, '../../../public/seeds/welcome-cat-poster.postr')));
  return JSON.parse(strFromU8(zip['poster.json']!));
}

describe('the six layouts read in the order their authors wrote', () => {
  it.each(['3col', '2col', 'billboard', 'sidebar'] as LayoutKey[])('template %s (48 × 36)', (key) => {
    const blocks = makeBlocks(key, 48, 36);
    expect(headingsInOrder(blocks)).toEqual(headingsInArray(blocks));
  });

  it.each(['3col', '2col', 'billboard', 'sidebar'] as LayoutKey[])('template %s (36 × 48 portrait)', (key) => {
    const blocks = makeBlocks(key, 36, 48);
    expect(headingsInOrder(blocks, 360)).toEqual(headingsInArray(blocks));
  });

  it('the welcome poster', () => {
    const seed = welcome();
    expect(headingsInOrder(seed.blocks, seed.widthIn * 10)).toEqual(
      ['Introduction', 'Hypotheses', 'Methods', 'Results', 'Conclusions'],
    );
  });

  it('control: the blank template has nothing to read', () => {
    expect(readingOrder(makeBlocks('empty', 48, 36), W48)).toEqual([]);
  });
});

describe('columns, bands and what is read', () => {
  it('left edges within 3 in share a column; past 3 in start the next', () => {
    const col = columnIndex([
      block({ id: 'a', type: 'text', x: 10 }),
      block({ id: 'b', type: 'text', x: 39 }),
      block({ id: 'c', type: 'text', x: 41 }),
    ]);
    expect([col.get('a'), col.get('b'), col.get('c')]).toEqual([0, 0, 1]);
  });

  it('the 3-column poster reads down each column, then the next', () => {
    const blocks = makeBlocks('3col', 48, 36);
    const order = readingOrder(blocks, W48).map((b) => b.type === 'heading' ? b.content : b.type);
    expect(order).toEqual([
      'Introduction', 'text', 'Hypotheses', 'text',
      'Methods', 'text', 'image',
      'Results', 'table', 'Conclusions', 'text', 'references',
    ]);
  });

  it('a wide block is a band: the 2-column poster reads Key Results after both top columns', () => {
    expect(headingsInOrder(makeBlocks('2col', 48, 36))).toEqual(['Introduction', 'Methods', 'Key Results', 'Discussion']);
  });

  it('the title, the authors block and logos are not read', () => {
    const order = readingOrder([
      block({ id: 't', type: 'title', y: 10 }),
      block({ id: 'a', type: 'authors', y: 60 }),
      block({ id: 'l', type: 'logo', y: 10, x: 400, w: 30 }),
      block({ id: 'x', type: 'text', y: 100 }),
    ], W48);
    expect(order.map((b) => b.id)).toEqual(['x']);
  });
});

describe('numbers follow the reading order, not the array', () => {
  it('a heading pasted into column 2 takes its number from where it sits', () => {
    const blocks = makeBlocks('3col', 48, 36);
    const methods = blocks.find((b) => b.content === 'Methods')!;
    const pasted = { ...methods, id: 'pasted', content: 'Procedure', y: methods.y + 100 };
    const n = numberBlocks([...blocks, pasted], W48).headings;
    expect(n['pasted']).toBe(4);
    expect(n[blocks.find((b) => b.content === 'Results')!.id]).toBe(5);
  });

  it('moving a heading in the paint order (Bring Forward) renumbers nothing', () => {
    const blocks = makeBlocks('3col', 48, 36);
    const before = numberBlocks(blocks, W48).headings;
    const intro = blocks.find((b) => b.content === 'Introduction')!;
    const reordered = [...blocks.filter((b) => b.id !== intro.id), intro];
    expect(numberBlocks(reordered, W48).headings).toEqual(before);
  });

  it('figures are numbered down the columns, not across them', () => {
    const figs = [
      block({ id: 'col2Top', type: 'image', x: 170, y: 100 }),
      block({ id: 'col1Low', type: 'image', x: 10, y: 250 }),
      block({ id: 'col1Top', type: 'image', x: 10, y: 90 }),
    ];
    const n = numberBlocks(figs, W48).captions;
    expect([n['col1Top'], n['col1Low'], n['col2Top']]).toEqual([1, 2, 3]);
  });

  it('charts share the figures’ sequence; tables count on their own', () => {
    const n = numberBlocks([
      block({ id: 'img', type: 'image', x: 10, y: 90 }),
      block({ id: 'tbl', type: 'table', x: 10, y: 150 }),
      block({ id: 'chart', type: 'chart', x: 10, y: 200 }),
    ], W48).captions;
    expect([n['img'], n['chart'], n['tbl']]).toEqual([1, 2, 1]);
  });

  it('the exports read the same numbers as the canvas', () => {
    const blocks = makeBlocks('3col', 48, 36);
    const moved = blocks.map((b) => (b.content === 'Hypotheses' ? { ...b, x: 330 } : b));
    const n = numberBlocks(moved, W48);
    expect(computeHeadingNumbers(moved, W48)).toEqual(n.headings);
    expect(computeCaptionNumbers(moved, W48)).toEqual(n.captions);
  });
});
