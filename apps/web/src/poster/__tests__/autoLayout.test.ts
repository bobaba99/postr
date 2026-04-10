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
    expect(result).toEqual(blocks);
  });

  it('pins the title and authors blocks to the top', () => {
    const blocks = [
      block({ id: 't', type: 'title', x: 999, y: 999 }),
      block({ id: 'a', type: 'authors', x: 999, y: 999 }),
      block({ id: 'b1', type: 'text', x: 50, y: 200 }),
    ];
    const result = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
    const title = result.find((b) => b.id === 't')!;
    const authors = result.find((b) => b.id === 'a')!;
    expect(title.x).toBe(10);
    expect(title.y).toBe(10);
    expect(authors.x).toBe(10);
    expect(authors.y).toBe(55); // snapped from 57
  });

  it('detects column structure by clustering body block x positions', () => {
    // Three clusters: x≈10, x≈170, x≈330
    const blocks = [
      block({ id: 't', type: 'title' }),
      block({ id: 'a', type: 'authors' }),
      block({ id: 'b1', type: 'text', x: 10, y: 100 }),
      block({ id: 'b2', type: 'text', x: 170, y: 100 }),
      block({ id: 'b3', type: 'text', x: 330, y: 100 }),
    ];
    const result = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
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
    const result = autoLayout(blocks, 480, 360, DEFAULT_STYLES);
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
});
