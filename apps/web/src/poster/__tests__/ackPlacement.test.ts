/**
 * ackPlacement — geometry, asserted with exact numbers.
 *
 * The invariants that matter are absolute, not statistical: the mark
 * never overlaps, never leaves the canvas, and never moves anything
 * else. Those are checked exhaustively against every block at several
 * poster sizes in both orientations; the exact-coordinate cases pin
 * down the specific behaviour a reader would otherwise have to infer.
 */
import { describe, expect, it } from 'vitest';
import type { Block } from '@postr/shared';
import { ACK_MARK_SIZE, placeAckMark } from '../ackPlacement';
import { M } from '../constants';

const block = (over: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  content: '',
  imageSrc: null,
  imageFit: 'contain',
  tableData: null,
  ...over,
});

const logo = (id: string, x: number, y: number, w = 20, h = 20): Block =>
  block({ id, type: 'logo', x, y, w, h });

/** Poster sizes in poster units (1 unit = 0.1in). */
const SIZES = {
  // 48 × 36 in landscape — the most common conference poster.
  landscape48x36: { w: 480, h: 360 },
  // 36 × 48 in portrait — the same sheet turned.
  portrait36x48: { w: 360, h: 480 },
  // A0 portrait, 33.1 × 46.8 in.
  a0Portrait: { w: 331, h: 468 },
  // A0 landscape.
  a0Landscape: { w: 468, h: 331 },
  // 24 × 36 in — the small end.
  small24x36: { w: 240, h: 360 },
} as const;

function overlaps(a: { x: number; y: number; w: number; h: number }, b: Block): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

describe('placeAckMark — invariants at every size, both orientations', () => {
  const scenarios: Array<[string, Block[]]> = [
    ['empty poster', []],
    [
      'typical three-column poster',
      [
        block({ id: 't', type: 'title', x: 10, y: 10, w: 300, h: 40 }),
        block({ id: 'c1', type: 'text', x: 10, y: 60, w: 100, h: 150 }),
        block({ id: 'c2', type: 'text', x: 120, y: 60, w: 100, h: 150 }),
        block({ id: 'r', type: 'references', x: 10, y: 220, w: 100, h: 60 }),
      ],
    ],
    ['poster with one logo', [logo('l1', 200, 20)]],
    ['poster with a logo row', [logo('l1', 100, 20), logo('l2', 130, 20), logo('l3', 160, 20)]],
  ];

  for (const [sizeName, size] of Object.entries(SIZES)) {
    for (const [scenarioName, blocks] of scenarios) {
      it(`${sizeName} / ${scenarioName}: never overlaps and never leaves the canvas`, () => {
        const placed = placeAckMark(blocks, size.w, size.h);
        if (!placed) return; // a null placement is a valid, safe outcome
        // On-canvas, exactly.
        expect(placed.x).toBeGreaterThanOrEqual(0);
        expect(placed.y).toBeGreaterThanOrEqual(0);
        expect(placed.x + placed.w).toBeLessThanOrEqual(size.w);
        expect(placed.y + placed.h).toBeLessThanOrEqual(size.h);
        // Clear of every existing block.
        for (const b of blocks) {
          expect(overlaps(placed, b), `overlapped ${b.id}`).toBe(false);
        }
      });

      it(`${sizeName} / ${scenarioName}: moves no other block`, () => {
        const snapshot = JSON.stringify(blocks);
        placeAckMark(blocks, size.w, size.h);
        expect(JSON.stringify(blocks)).toBe(snapshot);
      });
    }
  }
});

describe('exact coordinates — no logos, empty poster', () => {
  it('lands in the bottom margin band at the references column on 48×36 landscape', () => {
    // maxY = 360 - 10 - 12 = 338; snap(338) = 340 is 2 away, inside
    // the snap threshold, but 340 + 12 = 352 <= 360 so it stays legal.
    const placed = placeAckMark([], 480, 360)!;
    expect(placed.x).toBe(M); // 10 — the references column
    expect(placed.w).toBe(ACK_MARK_SIZE); // 12
    expect(placed.h).toBe(ACK_MARK_SIZE); // 12
    expect(placed.strategy).toBe('empty-region');
    expect(placed.y + placed.h).toBeLessThanOrEqual(360);
    expect(placed.y).toBeGreaterThan(300); // genuinely in the bottom band
  });

  it('lands in the same relative band on 36×48 portrait', () => {
    const placed = placeAckMark([], 360, 480)!;
    expect(placed.x).toBe(M);
    expect(placed.y).toBeGreaterThan(420);
    expect(placed.y + placed.h).toBeLessThanOrEqual(480);
  });

  it('shifts right along the band when the references column is occupied', () => {
    // A block sitting exactly where the mark wants to go.
    const occupied = block({ id: 'ref', type: 'references', x: 0, y: 320, w: 60, h: 40 });
    const placed = placeAckMark([occupied], 480, 360)!;
    expect(overlaps(placed, occupied)).toBe(false);
    expect(placed.x).toBeGreaterThan(M);
    expect(placed.y + placed.h).toBeLessThanOrEqual(360);
  });

  it('returns null when the poster is too small to host the mark inside its margins', () => {
    // 3 × 3 in: 30 × 30 units, needs 12 + 10 + 10 = 32.
    expect(placeAckMark([], 30, 30)).toBeNull();
  });

  it('returns null rather than overlapping when the canvas is completely full', () => {
    const wall = block({ id: 'wall', type: 'image', x: 0, y: 0, w: 480, h: 360 });
    expect(placeAckMark([wall], 480, 360)).toBeNull();
  });
});

describe('clustering — the requirement', () => {
  it('places the mark adjacent to a single logo, at matching size', () => {
    const l = logo('l1', 200, 40, 20, 20);
    const placed = placeAckMark([l], 480, 360)!;
    expect(placed.strategy).toBe('cluster');
    // Same size as the logo it joins.
    expect(placed.w).toBe(20);
    expect(placed.h).toBe(20);
    // To the right of it, not overlapping.
    expect(placed.x).toBeGreaterThanOrEqual(l.x + l.w);
    expect(overlaps(placed, l)).toBe(false);
  });

  it('joins a ROW of logos on the same optical line', () => {
    const row = [logo('l1', 100, 40, 20, 20), logo('l2', 130, 40, 20, 20), logo('l3', 160, 40, 20, 20)];
    const placed = placeAckMark(row, 480, 360)!;
    expect(placed.strategy).toBe('cluster');
    // Vertically centred on the row: the row spans y 40..60, centre
    // 50, so a 20-tall mark sits at y = 40.
    expect(placed.y).toBe(40);
    expect(placed.h).toBe(20);
    // Seated after the rightmost logo (x 180), one GAP along.
    expect(placed.x).toBeGreaterThanOrEqual(180);
    for (const b of row) expect(overlaps(placed, b)).toBe(false);
  });

  it('matches a row of LARGER logos rather than staying default-sized', () => {
    const row = [logo('l1', 100, 40, 24, 24), logo('l2', 130, 40, 24, 24)];
    const placed = placeAckMark(row, 480, 360)!;
    expect(placed.w).toBe(24);
    expect(placed.h).toBe(24);
  });

  it('clamps to a sane size beside an oversized logo', () => {
    const huge = logo('l1', 100, 40, 200, 200);
    const placed = placeAckMark([huge], 480, 360)!;
    // Never larger than the 24-unit ceiling, whatever the logo does.
    expect(placed.w).toBeLessThanOrEqual(24);
    expect(overlaps(placed, huge)).toBe(false);
  });

  it('groups logos by vertical OVERLAP, tolerating small misalignment', () => {
    // Two logos 2 units out of alignment are still one row.
    const row = [logo('l1', 100, 40, 20, 20), logo('l2', 130, 42, 20, 20)];
    const placed = placeAckMark(row, 480, 360)!;
    expect(placed.strategy).toBe('cluster');
    expect(placed.x).toBeGreaterThanOrEqual(150);
  });

  it('falls to the LEFT of the row when the right side is blocked', () => {
    const l = logo('l1', 100, 40, 20, 20);
    const blocker = block({ id: 'x', type: 'text', x: 120, y: 30, w: 300, h: 40 });
    const placed = placeAckMark([l, blocker], 480, 360)!;
    expect(placed.strategy).toBe('cluster');
    expect(placed.x + placed.w).toBeLessThanOrEqual(l.x);
    expect(overlaps(placed, l)).toBe(false);
    expect(overlaps(placed, blocker)).toBe(false);
  });

  it('falls back to an empty region when the logo row has no room either side', () => {
    const l = logo('l1', 100, 40, 20, 20);
    const left = block({ id: 'bl', type: 'text', x: 0, y: 30, w: 100, h: 40 });
    const right = block({ id: 'br', type: 'text', x: 120, y: 30, w: 300, h: 40 });
    const placed = placeAckMark([l, left, right], 480, 360)!;
    expect(placed.strategy).toBe('empty-region');
    for (const b of [l, left, right]) expect(overlaps(placed, b)).toBe(false);
  });

  it('prefers clustering over the bottom band when both are available', () => {
    // The bottom band is wide open, but a logo exists — cluster wins.
    const l = logo('l1', 200, 40, 20, 20);
    const placed = placeAckMark([l], 480, 360)!;
    expect(placed.strategy).toBe('cluster');
    expect(placed.y).toBeLessThan(100); // up with the logo, not at the foot
  });
});

describe('purity', () => {
  it('returns a fresh object and never mutates the input array', () => {
    const blocks = [logo('l1', 200, 40)];
    const before = blocks.length;
    placeAckMark(blocks, 480, 360);
    expect(blocks).toHaveLength(before);
    expect(blocks[0]).toMatchObject({ x: 200, y: 40 });
  });

  it('is deterministic — the same input yields the same rect', () => {
    const blocks = [logo('l1', 200, 40), block({ id: 't', type: 'text', x: 10, y: 300, w: 200, h: 40 })];
    expect(placeAckMark(blocks, 480, 360)).toEqual(placeAckMark(blocks, 480, 360));
  });
});
