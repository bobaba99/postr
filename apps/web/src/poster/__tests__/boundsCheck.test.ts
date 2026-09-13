import { describe, it, expect } from 'vitest';
import type { Block } from '@postr/shared';
import { checkBounds, checkCollisions } from '../boundsCheck';

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    type: 'text',
    x: 10,
    y: 10,
    w: 100,
    h: 50,
    content: '',
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
    ...overrides,
  };
}

describe('checkBounds', () => {
  const CW = 480; // 48" × 10
  const CH = 360; // 36" × 10

  it('returns empty for blocks fully inside the canvas', () => {
    const b = block({ x: 10, y: 10, w: 100, h: 50 });
    expect(checkBounds([b], CW, CH)).toEqual([]);
  });

  it('detects block extending past the right edge', () => {
    const b = block({ x: 400, w: 100 }); // 400 + 100 = 500 > 480
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('partial');
    expect(warnings[0]!.edges).toContain('right');
  });

  it('detects block extending past the bottom edge', () => {
    const b = block({ y: 320, h: 50 }); // 320 + 50 = 370 > 360
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.edges).toContain('bottom');
  });

  it('detects block extending past the left edge', () => {
    const b = block({ x: -20 });
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.edges).toContain('left');
  });

  it('detects block extending past the top edge', () => {
    const b = block({ y: -5 });
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.edges).toContain('top');
  });

  it('detects multiple edges at once (corner overflow)', () => {
    const b = block({ x: 450, y: 340, w: 50, h: 30 }); // right + bottom
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.edges).toContain('right');
    expect(warnings[0]!.edges).toContain('bottom');
    expect(warnings[0]!.severity).toBe('partial');
  });

  it('marks fully outside block as severity=full', () => {
    const b = block({ x: 500, y: 10 }); // entirely past right edge
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('full');
    expect(warnings[0]!.message).toContain('completely outside');
  });

  it('marks block fully above canvas as full', () => {
    const b = block({ y: -100, h: 50 }); // -100 + 50 = -50, entirely above
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('full');
  });

  it('returns warnings for multiple blocks', () => {
    const blocks = [
      block({ id: 'ok', x: 10, y: 10, w: 50, h: 50 }),
      block({ id: 'oob1', x: 470, w: 20, type: 'image' }),  // right overflow
      block({ id: 'oob2', x: 600, type: 'table' }),          // fully outside
    ];
    const warnings = checkBounds(blocks, CW, CH);
    expect(warnings).toHaveLength(2);
    expect(warnings.find(w => w.blockId === 'oob1')!.severity).toBe('partial');
    expect(warnings.find(w => w.blockId === 'oob2')!.severity).toBe('full');
  });

  it('exact edge alignment is not OOB', () => {
    const b = block({ x: 380, w: 100 }); // 380 + 100 = 480 === CW
    expect(checkBounds([b], CW, CH)).toEqual([]);
  });

  it('one pixel past is OOB', () => {
    const b = block({ x: 381, w: 100 }); // 381 + 100 = 481 > 480
    const warnings = checkBounds([b], CW, CH);
    expect(warnings).toHaveLength(1);
  });

  it('block at origin with zero-overflow is fine', () => {
    const b = block({ x: 0, y: 0, w: CW, h: CH });
    expect(checkBounds([b], CW, CH)).toEqual([]);
  });

  it('message includes block type', () => {
    const b = block({ x: 500, type: 'image' });
    const w = checkBounds([b], CW, CH);
    expect(w[0]!.message).toContain('image');
    expect(w[0]!.blockType).toBe('image');
  });
});

describe('measured heights — F8', () => {
  const blk = (id: string, y: number, h: number, x = 10, w = 200): Block =>
    ({ id, type: 'text', x, y, w, h, content: '', imageSrc: null, imageFit: 'contain', tableData: null }) as Block;

  it('checkBounds prefers a measured height over the stored one', () => {
    // Text blocks render `height: auto`; stored h never updates. A block
    // grown clear off the canvas produced ZERO warnings — the ISSUES
    // panel's only geometry check, blind to exactly the blocks most
    // likely to need it. Measured drift on a real render: 100 -> 185.44.
    const blocks = [blk('a', 200, 100)];
    expect(checkBounds(blocks, 480, 360)).toHaveLength(0);

    const measured = new Map([['a', 200]]); // rendered: 200..400, off a 360 canvas
    const warned = checkBounds(blocks, 480, 360, measured);
    expect(warned).toHaveLength(1);
    expect(warned[0]!.edges).toContain('bottom');
  });

  it('falls back to the stored height when nothing was measured', () => {
    const blocks = [blk('a', 200, 300)];
    expect(checkBounds(blocks, 480, 360, new Map())).toHaveLength(1);
  });

  it('checkCollisions finds the overlap F8 actually measured', () => {
    // The repro: paste into Introduction, it lands on the Hypotheses
    // heading. Stored geometry says they are 20 units apart.
    const intro = blk('intro', 120, 100);
    const hypo = blk('hypo', 240, 14);
    expect(checkCollisions([intro, hypo])).toHaveLength(0);

    const measured = new Map([['intro', 185.44]]); // the measured render
    const hits = checkCollisions([intro, hypo], measured);
    expect(hits).toHaveLength(1);
    expect([hits[0]!.aId, hits[0]!.bId].sort()).toEqual(['hypo', 'intro']);
  });

  it('tolerates the 1-2px kiss that snapping produces', () => {
    const a = blk('a', 100, 50);
    const b = blk('b', 149, 50); // 1 unit of overlap
    expect(checkCollisions([a, b])).toHaveLength(0);
  });

  it('does not report a pair twice, or a block against itself', () => {
    const measured = new Map([['a', 200]]);
    const hits = checkCollisions([blk('a', 100, 50), blk('b', 150, 50)], measured);
    expect(hits).toHaveLength(1);
  });

  it('ignores blocks that do not overlap horizontally', () => {
    const measured = new Map([['a', 300]]);
    const hits = checkCollisions(
      [blk('a', 100, 50, 10, 100), blk('b', 150, 50, 300, 100)],
      measured,
    );
    expect(hits).toHaveLength(0);
  });
});
