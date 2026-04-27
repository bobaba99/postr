import { describe, expect, it } from 'vitest';
import { pickPosterSize, synthesizeDoc } from '../synthDoc';
import type { RoledCluster } from '../clusterText';

function cluster(
  text: string,
  role: RoledCluster['role'],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSizePt = 12,
): RoledCluster {
  return {
    text,
    role,
    bbox: { x, y, w, h },
    fontSizePt,
    fontNames: [],
    items: [],
  };
}

describe('pickPosterSize', () => {
  it('matches landscape source to a landscape size', () => {
    const { widthIn, heightIn } = pickPosterSize(48, 36);
    expect(widthIn).toBe(48);
    expect(heightIn).toBe(36);
  });

  it('matches portrait source to a portrait size', () => {
    const { widthIn, heightIn } = pickPosterSize(36, 48);
    expect(widthIn).toBe(36);
    expect(heightIn).toBe(48);
  });

  it('snaps to A0 when source is close to ISO dimensions', () => {
    const { widthIn, heightIn } = pickPosterSize(46.8, 33.1);
    expect(widthIn).toBeCloseTo(46.8);
    expect(heightIn).toBeCloseTo(33.1);
  });

  it('matches square sources to the square preset', () => {
    const { widthIn, heightIn } = pickPosterSize(42, 42);
    expect(widthIn).toBe(42);
    expect(heightIn).toBe(42);
  });
});

describe('synthesizeDoc', () => {
  it('produces a valid PosterDoc with version=1 and curated defaults', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      clusters: [cluster('My Title', 'title', 100, 50, 1000, 80, 36)],
      figureBlocks: [],
    });
    expect(result.doc.version).toBe(1);
    expect(result.doc.widthIn).toBe(48);
    expect(result.doc.heightIn).toBe(36);
    expect(result.doc.fontFamily).toBeTruthy();
    expect(result.doc.palette).toBeTruthy();
    expect(result.doc.styles).toBeTruthy();
    expect(result.title).toBe('My Title');
  });

  it('emits a block per cluster with the matching role', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      clusters: [
        cluster('Title', 'title', 100, 50, 1000, 80, 36),
        cluster('Heading A', 'heading', 100, 200, 400, 24, 16),
        cluster('Body 1', 'text', 100, 250, 400, 80, 10),
      ],
      figureBlocks: [],
    });
    const types = result.doc.blocks.map((b) => b.type);
    expect(types).toContain('title');
    expect(types).toContain('heading');
    expect(types).toContain('text');
  });

  it('falls back to a generic title when no title cluster is present', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      clusters: [cluster('Body only', 'text', 100, 200, 400, 80, 10)],
      figureBlocks: [],
    });
    expect(result.title).toBe('Imported poster');
  });

  it('skips clusters with empty text', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      clusters: [
        cluster('   ', 'text', 100, 50, 100, 12),
        cluster('Real content', 'text', 100, 200, 400, 80),
      ],
      figureBlocks: [],
    });
    expect(result.doc.blocks).toHaveLength(1);
    expect(result.doc.blocks[0]!.content).toBe('Real content');
  });

  it('preserves figure blocks and assigns ids', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      clusters: [],
      figureBlocks: [
        {
          type: 'image',
          x: 50,
          y: 100,
          w: 200,
          h: 150,
          content: '',
          imageSrc: 'storage://user/poster/abc.png',
          imageFit: 'contain',
          tableData: null,
        },
      ],
    });
    expect(result.doc.blocks).toHaveLength(1);
    expect(result.doc.blocks[0]!.type).toBe('image');
    expect(result.doc.blocks[0]!.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.doc.blocks[0]!.imageSrc).toBe('storage://user/poster/abc.png');
  });

  it('snaps coordinates to the 5-unit grid', () => {
    const result = synthesizeDoc({
      pageWidthPt: 48 * 72,
      pageHeightPt: 36 * 72,
      // bbox at 100pt → ptToUnits = 13.89 → snap to 15
      clusters: [cluster('snap test', 'text', 100, 100, 80, 30)],
      figureBlocks: [],
    });
    const block = result.doc.blocks[0]!;
    expect(block.x % 5).toBe(0);
    expect(block.y % 5).toBe(0);
    expect(block.w % 5).toBe(0);
    expect(block.h % 5).toBe(0);
  });
});
