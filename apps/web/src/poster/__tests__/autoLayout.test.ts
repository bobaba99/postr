/**
 * Record 28 — Auto-Arrange as a function (autoLayout.ts): the poster's body
 * cut into its columns in reading order, every block at its column's width
 * and its measured height there. The heights here come from a stand-in
 * measure (text wraps as area / width, figures keep their shape); the
 * browser harness measures real ones (scripts/auto-arrange-check.mjs).
 *
 * Today's Auto-Arrange (before record 28) changed the number of columns,
 * stacked headings, renumbered sections and shrank text; these tests fail it.
 * Re-run: npx vitest run src/poster/__tests__/autoLayout.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { Block } from '@postr/shared';
import { makeBlocks } from '../templates';
import {
  autoArrange, bodyBottom, changesLayout, headerBottom, pastMarginArea, posterColumns, STILL, type ArrangeInput,
} from '../autoLayout';
import { columnIndex, numberBlocks, readingOrder } from '../readingOrder';
import { ACK_BLOCK_ID } from '@/export/ackBlock';

/** Text: characters 2.4 units wide on 8-unit lines, wrapped at width w, plus 4 units of slack. */
const textHeight = (b: Block, w: number) => Math.ceil(((b.content?.length ?? 0) * 2.4) / w) * 8 + 4;
const drawnAt = (b: Block, w: number) =>
  b.type === 'image' || b.type === 'chart' ? (w * b.h) / b.w + 12 : b.type === 'heading' ? 16 : textHeight(b, w);

function input(blocks: Block[], W = 480, H = 360, extra: Partial<ArrangeInput> = {}): ArrangeInput {
  return {
    blocks, canvasWidth: W, canvasHeight: H, titleOverflow: 0,
    drawnHeight: (b) => drawnAt(b, b.w),
    measure: (body) => (i, wIn) => drawnAt(body[i]!, wIn * 10) / 10,
    lineMin: 90,
    tableMin: () => 0,
    ...extra,
  };
}

const words = (n: number) => 'research '.repeat(n).trim();
function poster(): Block[] {
  return makeBlocks('3col', 48, 36).map((b, i) => (b.type === 'text' ? { ...b, content: words(10 + 5 * i) } : b));
}

const rect = (b: Block) => ({ x: b.x, y: b.y, w: b.w, h: drawnAt(b, b.w) });
const overlap = (a: Block, b: Block) => {
  const A = rect(a);
  const B = rect(b);
  return Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 0.01 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 0.01;
};

describe('Auto-Arrange keeps the poster it was given', () => {
  const before = poster();
  const { blocks: after, plan } = autoArrange(input(before));

  it('keeps the number of columns', () => {
    const cols = (bs: Block[]) => new Set(columnIndex(readingOrder(bs, 480)).values()).size;
    expect(cols(after)).toBe(cols(before));
    expect(plan!.cols).toHaveLength(3);
  });

  it('keeps the reading order, so no heading, figure or table number changes', () => {
    expect(readingOrder(after, 480).map((b) => b.id)).toEqual(readingOrder(before, 480).map((b) => b.id));
    expect(numberBlocks(after, 480)).toEqual(numberBlocks(before, 480));
  });

  it('changes nothing but x, y, w and h, and leaves the title and authors where they were', () => {
    after.forEach((a, i) => {
      const { x: _x, y: _y, w: _w, h: _h, ...rest } = a;
      const { x: _bx, y: _by, w: _bw, h: _bh, ...was } = before[i]!;
      expect(rest).toEqual(was);
    });
    for (const id of before.filter((b) => b.type === 'title' || b.type === 'authors').map((b) => b.id)) {
      expect(after.find((b) => b.id === id)).toEqual(before.find((b) => b.id === id));
    }
  });

  it('gives every block its column’s width, 0.6 in apart, from under the header', () => {
    const top = headerBottom(before, 0, (b) => drawnAt(b, b.w), 360) + 6;
    plan!.cols.forEach((c) => {
      const inCol = readingOrder(after, 480).filter((_, i) => c.idx.includes(i));
      inCol.forEach((b, j) => {
        expect(b.w).toBeCloseTo(c.w * 10, 1);
        if (j === 0) expect(b.y).toBeCloseTo(top, 1);
        else expect(b.y - (inCol[j - 1]!.y + drawnAt(inCol[j - 1]!, inCol[j - 1]!.w))).toBeCloseTo(6, 1);
      });
    });
  });

  it('overlaps nothing', () => {
    const pairs = after.flatMap((a, i) => after.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.id}×${b.id}`));
    expect(pairs).toEqual([]);
  });

  it('a figure keeps its shape exactly (review finding B-R7: rounded, a second press measured it a hair different)', () => {
    const fig = before.find((b) => b.type === 'image')!;
    const now = after.find((b) => b.id === fig.id)!;
    expect(now.h / now.w).toBeCloseTo(fig.h / fig.w, 12);
  });
});

describe('what it reports and what it leaves alone', () => {
  it('reports the area past the bottom margin, and the sheet as drawn reads the same', () => {
    const crowded = makeBlocks('3col', 48, 36).map((b) => (b.type === 'text' ? { ...b, content: words(400) } : b));
    const res = autoArrange(input(crowded));
    expect(res.pastMargin).toBeGreaterThan(0);
    expect(res.pastMargin).toBeCloseTo(res.plan!.O, 9);
    expect(pastMarginArea(res.blocks, 360, 0, (b) => drawnAt(b, b.w))).toBeCloseTo(res.plan!.O, 1);
  });

  it('nothing past the margin when it fits', () => {
    const res = autoArrange(input(poster()));
    expect(res.pastMargin).toBe(0);
    expect(pastMarginArea(res.blocks, 360, 0, (b) => drawnAt(b, b.w))).toBe(0);
  });

  it('logos that start inside the header push the body down; logos below it do not', () => {
    const blocks = poster();
    const drawn = (b: Block) => (b.type === 'logo' ? b.h : drawnAt(b, b.w));
    const logo: Block = { id: 'lg', type: 'logo', x: 400, y: 20, w: 60, h: 80, content: '', imageSrc: null, imageFit: 'contain', tableData: null };
    expect(headerBottom([...blocks, logo], 0, drawn, 360)).toBe(100);
    expect(headerBottom([...blocks, { ...logo, y: 300 }], 0, drawn, 360)).toBe(headerBottom(blocks, 0, drawn, 360));
  });

  it('a poster with no body is returned as it is', () => {
    const blank = makeBlocks('empty', 48, 36);
    const res = autoArrange(input(blank));
    expect(res.blocks).toEqual(blank);
    expect(res.plan).toBeNull();
  });

  it('a grown title pushes the body down: stored y is the drawn y less the push', () => {
    const before = poster();
    const push = 12;
    const res = autoArrange(input(before, 480, 360, { titleOverflow: push }));
    // The authors block is drawn `push` lower, so the header's drawn bottom is too.
    const top = headerBottom(before, push, (b) => drawnAt(b, b.w), 360) + 6;
    const order = readingOrder(res.blocks, 480);
    for (const c of res.plan!.cols) expect(order[c.idx[0]!]!.y + push).toBeCloseTo(top, 6);
    expect(top).toBeCloseTo(headerBottom(before, 0, (b) => drawnAt(b, b.w), 360) + 6 + push, 6);
  });

  it('the credit mark moves aside when a block covers it, and stays put when nothing does', () => {
    const mark: Block = {
      id: ACK_BLOCK_ID, type: 'logo', x: 10, y: 338, w: 12, h: 12, content: '', imageSrc: null, imageFit: 'contain', tableData: null, locked: true,
    };
    const full = makeBlocks('3col', 48, 36).map((b) => (b.type === 'text' ? { ...b, content: words(120) } : b));
    const res = autoArrange(input([...full, mark], 480, 360, { drawnHeight: (b) => (b.type === 'logo' ? b.h : drawnAt(b, b.w)) }));
    const moved = res.blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    const covers = res.blocks.filter((b) => b.id !== ACK_BLOCK_ID && b.type !== 'title' && b.type !== 'authors').some((b) => overlap(b, moved));
    expect(covers).toBe(false);
    // A mark in the header row, on the title's box: only an arranged block moves it.
    const inHeader = autoArrange(input([...full, { ...mark, x: 458, y: 10 }], 480, 360, { drawnHeight: (b) => (b.type === 'logo' ? b.h : drawnAt(b, b.w)) })).blocks;
    expect(inHeader.find((b) => b.id === ACK_BLOCK_ID)).toMatchObject({ x: 458, y: 10 });
    const short = { ...full.find((b) => b.type === 'text')!, content: words(10) };
    const roomy = autoArrange(input([...makeBlocks('empty', 48, 36), short, { ...mark, x: 458 }])).blocks;
    expect(roomy.find((b) => b.id === ACK_BLOCK_ID)).toMatchObject({ x: 458, y: 338 });
  });
});

describe('review round 1 (record 28 §9)', () => {
  const drawn = (b: Block) => drawnAt(b, b.w);
  /** Blocks that differ in x, y, w or h by more than floating-point noise (1e-6 units). */
  const differ = (a: Block[], b: Block[]) =>
    a.filter((x, i) => (['x', 'y', 'w', 'h'] as const).some((k) => Math.abs(x[k] - b[i]![k]) > 1e-6)).map((x) => x.id);

  it('B-R1: an authors block along the foot stays there; the body runs from under the title to 0.6 in above it', () => {
    const before = poster().map((b) => (b.type === 'authors' ? { ...b, y: 328 } : b));
    const authors = before.find((b) => b.type === 'authors')!;
    const title = before.find((b) => b.type === 'title')!;
    const { blocks: after, plan } = autoArrange(input(before));
    expect(after.find((b) => b.id === authors.id)).toEqual(authors);
    const order = readingOrder(after, 480);
    for (const c of plan!.cols) if (c.idx.length) expect(order[c.idx[0]!]!.y).toBeCloseTo(title.y + drawn(title) + 6, 6);
    for (const b of order) expect(b.y + drawn(b), b.id).toBeLessThanOrEqual(328 - 6 + 1e-6);
    expect(plan!.O).toBe(0);
  });

  it('B-R1: a title or authors block in the top half is the header, in the bottom half along the foot', () => {
    const blocks = poster();
    const authors = blocks.find((b) => b.type === 'authors')!;
    const title = blocks.find((b) => b.type === 'title')!;
    const at = (y: number) => blocks.map((b) => (b.id === authors.id ? { ...b, y } : b));
    expect(headerBottom(at(170), 0, drawn, 360)).toBe(170 + drawn(authors));
    expect(bodyBottom(at(170), 360, 0)).toBe(350);
    expect(headerBottom(at(180), 0, drawn, 360)).toBe(title.y + drawn(title));
    expect(bodyBottom(at(180), 360, 0)).toBe(174);
    // A grown title pushes the authors block down with everything else.
    expect(bodyBottom(at(170), 360, 12)).toBe(176);
  });

  it('B-R2: one block dragged part-way across its column does not add a column', () => {
    const base = poster();
    const stray = base.filter((b) => b.type === 'text')[1]!;
    const before = base.map((b) => (b.id === stray.id ? { ...b, x: b.x + 50, y: b.y + 20 } : b));
    const body = readingOrder(before, 480);
    expect(new Set(columnIndex(body).values()).size).toBe(4);
    expect(new Set(posterColumns(body).values()).size).toBe(3);
    expect(posterColumns(body).get(stray.id)).toBe(posterColumns(body).get(base.find((b) => b.type === 'heading')!.id));
    const { blocks: after, plan } = autoArrange(input(before));
    expect(plan!.cols).toHaveLength(3);
    expect(readingOrder(after, 480).map((b) => b.id)).toEqual(body.map((b) => b.id));
  });

  it('B-R2 control: a column of one block that starts right of the column before it is a column', () => {
    const block = (id: string, x: number, y: number, w = 140): Block => ({
      id, type: 'text', x, y, w, h: 40, content: words(20), imageSrc: null, imageFit: 'contain', tableData: null,
    });
    // Three columns, the middle one holding a single (wide) block.
    const body = [block('a', 10, 60), block('b', 10, 110), block('c', 156, 60, 180), block('d', 342, 60), block('e', 342, 110)];
    expect(new Set(posterColumns(body).values()).size).toBe(3);
    // A figure two columns wide in the first column (2-Col Wide Figure)
    // does not swallow the column of one block beside its narrow blocks.
    expect(new Set(posterColumns([...body, block('wide', 10, 160, 326)]).values()).size).toBe(3);
    // The same block starting inside the first column is counted in it.
    expect(posterColumns([...body.slice(0, 2), { ...body[2]!, x: 100 }, ...body.slice(3)]).get('c')).toBe(0);
  });

  it('B-R7: a second press on the poster it arranged finds exactly the same layout', () => {
    const figs = [0, 1, 2, 3, 4].map((i): Block => ({
      id: `f${i}`, type: 'image', x: [10, 165, 320][i % 3]!, y: 120 + 10 * i, w: 149, h: 80, content: '',
      imageSrc: null, imageFit: 'contain', tableData: null,
    }));
    const once = autoArrange(input([...makeBlocks('3col', 48, 24).filter((b) => b.type !== 'text'), ...figs], 480, 240)).blocks;
    const twice = autoArrange(input(once, 480, 240)).blocks;
    expect(differ(once, twice)).toEqual([]);
  });

  it('B-R7: a second press finds the same layout after the first moved blocks to other columns', () => {
    // 20 posters, text lengths drawn from a fixed sequence: some come out
    // with blocks moved to another column, some past the margin.
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const changed: string[] = [];
    let movedSome = 0;
    for (let p = 0; p < 20; p++) {
      const blocks = makeBlocks('3col', 48, 36).map((b) => (b.type === 'text' ? { ...b, content: words(20 + Math.floor(next() * 260)) } : b));
      const once = autoArrange(input(blocks));
      if (once.plan!.moved > 0) movedSome++;
      const twice = autoArrange(input(once.blocks));
      if (differ(once.blocks, twice.blocks).length) changed.push(`poster ${p}`);
    }
    expect(movedSome).toBeGreaterThan(3);
    expect(changed).toEqual([]);
  }, 30_000);

  it('B-R7: a figure keeps its shape exactly at a width that is not a whole hundredth of a unit', () => {
    // A table wider than 1.6 × equal leaves equal widths only: 149.333 units.
    const before = poster();
    const fig = before.find((b) => b.type === 'image')!;
    const res = autoArrange(input(before, 480, 360, { tableMin: () => 300 }));
    expect(res.plan!.cols.map((c) => c.w)).toEqual([44.8 / 3, 44.8 / 3, 44.8 / 3]);
    const now = res.blocks.find((b) => b.id === fig.id)!;
    expect(now.w).toBe(149.33);
    expect(now.h / now.w).toBeCloseTo(fig.h / fig.w, 12);
  });

  it('B-R3: the widths are refined in 0.05 in steps, for less area past the margin than the ¼ in grid', () => {
    // Text in whole 1 in lines, 34 to the column. B (516.25 / w lines) is one
    // line over from 14.75 in to 15.18 in, two below; A (1030.2 / w) fits
    // from 30.3 in. The ¼ in grid has 30.5 + 14.9 (14.9 in² over) and
    // 30.75 + 14.65 (B two lines over); 0.05 in steps reach 30.65 + 14.75.
    const text = (id: string, x: number): Block => ({
      id, type: 'text', x, y: 10, w: 227, h: 100, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
    });
    const chars: Record<string, number> = { a: 1030.2, b: 516.25 };
    const res = autoArrange(input([text('a', 10), text('b', 243)], 480, 360, {
      measure: (body) => (i, wIn) => Math.ceil(chars[body[i]!.id]! / wIn),
    }));
    expect(res.plan!.cols.map((c) => c.w)).toEqual([30.65, 14.75]);
    expect(res.pastMargin).toBeCloseTo(14.75, 6);
  });

  it('B-R7: moves of 0.01 in or less are no change; anything further is', () => {
    const once = autoArrange(input(poster())).blocks;
    const nudge = (d: number) => once.map((b, i) => (i === 3 ? { ...b, y: b.y + d } : b));
    expect(changesLayout(once, nudge(STILL))).toBe(false);
    expect(changesLayout(once, nudge(0.04))).toBe(false);
    expect(changesLayout(once, nudge(0.11))).toBe(true);
    expect(changesLayout(once, once.slice(1))).toBe(true);
  });
});
