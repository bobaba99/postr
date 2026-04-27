import { describe, expect, it } from 'vitest';
import {
  assignRoles,
  clusterTextItems,
  sortReadingOrder,
  type RawTextItem,
} from '../clusterText';

function item(
  str: string,
  x: number,
  y: number,
  width: number,
  height: number,
): RawTextItem {
  return { str, x, y, width, height };
}

describe('clusterTextItems', () => {
  it('groups co-located lines into one cluster', () => {
    const items = [
      item('Hello', 10, 10, 50, 12),
      item('World', 65, 10, 50, 12),
      item('next line', 10, 25, 80, 12),
    ];
    const clusters = clusterTextItems(items);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.text).toContain('Hello');
    expect(clusters[0]!.text).toContain('World');
    expect(clusters[0]!.text).toContain('next line');
  });

  it('separates clusters that are far apart', () => {
    const items = [
      item('cluster A', 10, 10, 80, 12),
      item('cluster B', 10, 200, 80, 12),
    ];
    const clusters = clusterTextItems(items);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  it('produces a font-size median for each cluster', () => {
    const items = [
      item('Big title', 10, 10, 200, 40),
      item('also title', 10, 55, 200, 40),
    ];
    const clusters = clusterTextItems(items, { eps: 50 });
    expect(clusters[0]!.fontSizePt).toBe(40);
  });

  it('discards empty / whitespace-only clusters', () => {
    const items = [item('   ', 10, 10, 30, 12)];
    expect(clusterTextItems(items)).toEqual([]);
  });
});

describe('assignRoles', () => {
  it('marks the largest top-cluster as title', () => {
    const items = [
      item('My Poster', 50, 20, 300, 40),
      item('Body text here', 50, 200, 200, 12),
    ];
    const clusters = clusterTextItems(items);
    const roled = assignRoles(clusters, 800);
    const title = roled.find((c) => c.role === 'title');
    expect(title?.text).toBe('My Poster');
  });

  it('marks the cluster directly below the title as authors', () => {
    const items = [
      item('Title Text', 50, 20, 300, 40),
      item('Authors: A, B, C', 50, 70, 300, 14),
      item('Body block', 50, 300, 200, 12),
    ];
    const clusters = clusterTextItems(items);
    const roled = assignRoles(clusters, 800);
    expect(roled.find((c) => c.role === 'authors')?.text).toContain('Authors');
  });

  it('does not assign a title when all content is below the upper third', () => {
    const items = [
      item('Body line 1', 50, 400, 200, 12),
      item('Body line 2', 50, 500, 200, 12),
    ];
    const clusters = clusterTextItems(items);
    const roled = assignRoles(clusters, 800);
    expect(roled.every((c) => c.role !== 'title')).toBe(true);
  });
});

describe('sortReadingOrder', () => {
  it('puts header roles first, then sorts body by column', () => {
    const items = [
      item('Title', 50, 20, 300, 40),
      item('Right column block', 400, 200, 150, 12),
      item('Left column block', 50, 200, 150, 12),
      item('Right col 2nd', 400, 250, 150, 12),
    ];
    const clusters = clusterTextItems(items);
    const roled = assignRoles(clusters, 800);
    const ordered = sortReadingOrder(roled, 600);
    const texts = ordered.map((c) => c.text);
    // Title first.
    expect(texts[0]).toBe('Title');
    // Left column body before right column body.
    const leftIdx = texts.indexOf('Left column block');
    const rightIdx = texts.indexOf('Right column block');
    expect(leftIdx).toBeLessThan(rightIdx);
    // Within right column, top-to-bottom.
    const right1 = texts.indexOf('Right column block');
    const right2 = texts.indexOf('Right col 2nd');
    expect(right1).toBeLessThan(right2);
  });
});
