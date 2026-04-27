import { describe, it, expect } from 'vitest';
import { autoLayout } from '../autoLayout';
import { DEFAULT_STYLES } from '../constants';
import type { Block } from '@postr/shared';

const block = (overrides: Partial<Block>): Block => ({
  id: 'b',
  type: 'text',
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  content: '',
  imageSrc: null,
  imageFit: 'contain',
  tableData: null,
  ...overrides,
});

describe('autoLayout', () => {
  it('returns the input unchanged when there are no body blocks', () => {
    const blocks = [block({ id: 't', type: 'title' }), block({ id: 'a', type: 'authors' })];
    const result = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    expect(result.blocks).toEqual(blocks);
  });

  it('pins title at M and stacks authors directly under it', () => {
    const blocks = [
      block({ id: 't', type: 'title', x: 999, y: 999, h: 45 }),
      block({ id: 'a', type: 'authors', x: 999, y: 999 }),
      block({ id: 'b1', type: 'text', x: 50, y: 200 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const title = result.find((b) => b.id === 't')!;
    const authors = result.find((b) => b.id === 'a')!;
    expect(title.x).toBe(10);
    expect(title.y).toBe(10);
    expect(authors.x).toBe(10);
    expect(authors.y).toBe(55);
  });

  it('pushes authors further down when the title has grown', () => {
    const blocks = [
      block({ id: 't', type: 'title', x: 999, y: 999, h: 80 }),
      block({ id: 'a', type: 'authors', x: 999, y: 999 }),
      block({ id: 'b1', type: 'text', x: 50, y: 200 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const authors = result.find((b) => b.id === 'a')!;
    expect(authors.y).toBe(90);
  });

  it('detects column structure by clustering body block x positions', () => {
    const blocks = [
      block({ id: 't', type: 'title' }),
      block({ id: 'a', type: 'authors' }),
      block({ id: 'b1', type: 'text', x: 10, y: 100 }),
      block({ id: 'b2', type: 'text', x: 170, y: 100 }),
      block({ id: 'b3', type: 'text', x: 330, y: 100 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const body = result.filter((b) => b.id.startsWith('b'));
    const xs = [...new Set(body.map((b) => b.x))].sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
  });

  it('preserves Y order within each column', () => {
    const blocks = [
      block({ id: 't', type: 'title' }),
      block({ id: 'a', type: 'authors' }),
      block({ id: 'b3', type: 'text', x: 10, y: 300 }),
      block({ id: 'b1', type: 'text', x: 10, y: 100 }),
      block({ id: 'b2', type: 'text', x: 10, y: 200 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const col = result.filter((b) => b.id.startsWith('b')).sort((a, b) => a.y - b.y);
    expect(col.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('does not mutate the input', () => {
    const blocks = [
      block({ id: 'b1', type: 'text', x: 50, y: 100 }),
    ];
    const before = JSON.stringify(blocks);
    autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    expect(JSON.stringify(blocks)).toBe(before);
  });

  it('balances column heights via shortest-column-first packing', () => {
    // 4 imported blocks, ALL clustered in source column 0 (x=10), but
    // tall — naive "preserve source column" would stack all 4 in col 0
    // leaving col 1 empty. Shortest-first should split them ~2/2.
    const blocks = [
      block({ id: 'b1', type: 'text', x: 10, y: 100, h: 80 }),
      block({ id: 'b2', type: 'text', x: 10, y: 200, h: 80 }),
      block({ id: 'b3', type: 'text', x: 10, y: 300, h: 80 }),
      block({ id: 'b4', type: 'text', x: 10, y: 400, h: 80 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const body = result.filter((b) => b.id.startsWith('b'));
    const xs = [...new Set(body.map((b) => b.x))];
    // Either 2 or 4 cols, but never just 1 (would leave huge whitespace).
    expect(xs.length).toBeGreaterThan(1);
    // Each column should hold at least one block.
    for (const x of xs) {
      const colMembers = body.filter((b) => b.x === x);
      expect(colMembers.length).toBeGreaterThan(0);
    }
  });

  it('keeps a heading and the next block in the same column', () => {
    const blocks = [
      block({ id: 'h1', type: 'heading', x: 10, y: 100, h: 30 }),
      block({ id: 'b1', type: 'text', x: 10, y: 130, h: 100 }),
      block({ id: 'h2', type: 'heading', x: 10, y: 240, h: 30 }),
      block({ id: 'b2', type: 'text', x: 10, y: 270, h: 60 }),
    ];
    const { blocks: result } = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const h1 = result.find((b) => b.id === 'h1')!;
    const b1 = result.find((b) => b.id === 'b1')!;
    const h2 = result.find((b) => b.id === 'h2')!;
    const b2 = result.find((b) => b.id === 'b2')!;
    expect(b1.x).toBe(h1.x); // h1 → b1 stay together
    expect(b2.x).toBe(h2.x); // h2 → b2 stay together
  });
});
