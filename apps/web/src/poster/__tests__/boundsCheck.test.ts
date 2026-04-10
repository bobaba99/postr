import { describe, it, expect } from 'vitest';
import type { Block } from '@postr/shared';
import { checkBounds } from '../boundsCheck';

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
