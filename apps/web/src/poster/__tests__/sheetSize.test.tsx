/**
 * Fix 02, cause A — a poster whose size is not a preset must be drawn, laid
 * out and checked at its OWN size. Engineering record:
 * docs/fixes/02-poster-size.md.
 *
 *   A      The editor takes the sheet size from the nearest PRESET
 *          (findSizeKey, which falls back to 48×36), not from the poster's
 *          own widthIn/heightIn.
 *   A-alt  The canvas is drawn at the right size and only the zoom makes it
 *          look like 48×36.
 *
 * Each test asserts the correct behaviour, so the unfixed code fails it.
 * Re-run: npx vitest run src/poster/__tests__/sheetSize.test.tsx --reporter=verbose
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { makeBlocks } from '../templates';
import {
  NoopResizeObserver,
  choosePreset,
  click,
  confirmButton,
  dialog,
  doc,
  findButton,
  insideSheet,
  load,
  makeDoc,
  openTab,
  q,
  renderEditor,
  sizeMenu,
  userBlocks,
} from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('A — a custom-size poster is drawn, laid out and checked at its own size', () => {
  it('control: a preset poster is drawn at its size', () => {
    load(makeDoc(36, 48));
    renderEditor();
    const canvas = q<HTMLElement>('#poster-canvas');
    expect([canvas.style.width, canvas.style.height]).toEqual(['360px', '480px']);
  });

  it('a 30×40 poster is drawn at 300×400 units', () => {
    load(makeDoc(30, 40));
    renderEditor();
    const canvas = q<HTMLElement>('#poster-canvas');
    expect([canvas.style.width, canvas.style.height]).toEqual(['300px', '400px']);
  });

  it('the size menu says Custom Size', () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/layout/i);
    expect(sizeMenu().value).toBe('custom');
  });

  it('control: the size menu names a preset poster', () => {
    load(makeDoc(36, 48));
    renderEditor();
    openTab(/layout/i);
    expect(sizeMenu().value).toBe('36×48');
  });

  it('a template lays out inside a 30×40 sheet', async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/layout/i);
    await click(findButton('3-Column Classic'), 'template');
    const box = dialog(/template/i);
    if (box) await click(confirmButton(box), 'confirm template');
    const outside = userBlocks().filter((b) => !insideSheet(b)).map((b) => `${b.id}@${b.x + b.w},${b.y + b.h}`);
    expect(outside, 'blocks past the 300×400 sheet').toEqual([]);
  });

  it('Auto-Arrange lays out inside a 30×40 sheet', async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/layout/i);
    await click(findButton('Auto-Arrange'), 'auto-arrange');
    const outside = userBlocks().filter((b) => !insideSheet(b)).map((b) => `${b.id}@${b.x + b.w},${b.y + b.h}`);
    expect(outside, 'blocks past the 300×400 sheet').toEqual([]);
  });

  it('the preview names a custom size as custom', async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    expect(document.body.textContent ?? '').toContain('30"×40" Custom');
  });

  it('control: the preview names a preset size', async () => {
    load(makeDoc(36, 48));
    renderEditor();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    expect(document.body.textContent ?? '').toContain('36"×48" Portrait');
  });

  it('a new text block lands on a 30×20 sheet', async () => {
    // The 3-column layout for this sheet fills it; where the NEXT block goes
    // depends on which sheet the free-slot search believes it has.
    load({ ...makeDoc(30, 20), blocks: makeBlocks('3col', 30, 20) } as PosterDoc);
    renderEditor();
    openTab(/insert/i);
    const before = new Set(doc().blocks.map((b) => b.id));
    await click(findButton('Text'), '+ Text');
    const added = doc().blocks.find((b) => !before.has(b.id));
    expect(added, 'a block was added').toBeDefined();
    expect(insideSheet(added!), `new block at ${added!.x}..${added!.x + added!.w} × ${added!.y}..${added!.y + added!.h}`).toBe(true);
  });

  it('control: ISSUES flags a block past the right edge of a 48×36 sheet', () => {
    const d = makeDoc(48, 36);
    // b2 now ends at x = 500, 20 units past a 48-inch sheet.
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b2' ? { ...b, x: 290 } : b)) });
    renderEditor();
    openTab(/issues/i);
    expect(document.body.textContent ?? '').toMatch(/extends past the right edge|completely outside the poster/);
  });

  it('ISSUES flags a block past the right edge of a 30×40 sheet', () => {
    const d = makeDoc(30, 40);
    // b2 ends at x = 460: inside a 48-inch sheet, 160 units past a 30-inch one.
    load(d);
    renderEditor();
    openTab(/issues/i);
    expect(document.body.textContent ?? '').toMatch(/extends past the right edge|completely outside the poster/);
  });
});


/**
 * What a browser would report for the editor's scroll area. useZoom fits the
 * poster into this box; jsdom does no layout, so the box is stubbed and the
 * app's own fit arithmetic does the rest.
 */
function stubWorkspace(width: number, height: number) {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-postr-canvas-outer')) {
      return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
    }
    return real.call(this);
  });
}
const zoomNow = () => Number(/scale\(([\d.]+)\)/.exec(q<HTMLElement>('#poster-canvas').style.transform)![1]);
/**
 * The fit useZoom promises: the tighter ratio, less the 64 px gutter on each
 * side (fix 03, docs/fixes/03-fit-whole-sheet.md).
 */
const fit = (boxW: number, boxH: number, wIn: number, hIn: number) =>
  Math.min((boxW - 128) / (wIn * 10), (boxH - 128) / (hIn * 10));

describe('A — zoom-to-fit uses the poster\'s own size', () => {
  it('a 30×40 poster fits its own size into the workspace', () => {
    stubWorkspace(1060, 520);
    load(makeDoc(30, 40));
    renderEditor();
    expect(zoomNow()).toBeCloseTo(fit(1060, 520, 30, 40), 3);
  });

  it('control: a 48×36 preset fits its size', () => {
    stubWorkspace(1060, 520);
    load(makeDoc(48, 36));
    renderEditor();
    expect(zoomNow()).toBeCloseTo(fit(1060, 520, 48, 36), 3);
  });

  it('a wide, short workspace fits a tall poster by its height', () => {
    // Swapping width and height in the fit would pick the wrong ratio here.
    stubWorkspace(1600, 520);
    load(makeDoc(30, 60));
    renderEditor();
    expect(zoomNow()).toBeCloseTo(fit(1600, 520, 30, 60), 3);
  });

  it('zoom refits when the size changes', async () => {
    stubWorkspace(1060, 520);
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to/);
    if (box) await click(confirmButton(box), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([36, 48]);
    expect(zoomNow()).toBeCloseTo(fit(1060, 520, 36, 48), 3);
  });
});

describe('A — each edge is measured against the poster\'s own sheet, width and height alike', () => {
  const oob = (id: string) => q(`[data-block-id="${id}"]`)?.getAttribute('data-postr-oob') ?? null;

  it('ISSUES on 30×40: a block past the right edge is flagged; a block low on the sheet is not', () => {
    const d = makeDoc(30, 40);
    const base = d.blocks[2]!;
    load({
      ...d,
      blocks: [
        // Ends at x = 320: past a 300-unit sheet, inside a 400 one.
        { ...base, id: 'pastRight', x: 220, y: 100, w: 100, h: 20 },
        // Spans y 370–390: inside a 400-unit sheet, past a 360 one.
        { ...base, id: 'low', x: 20, y: 370, w: 100, h: 20 },
      ],
    } as PosterDoc);
    renderEditor();
    expect(oob('pastRight'), 'past the real right edge').toBe('true');
    expect(oob('low'), 'on the sheet, low down').toBeNull();
  });

  it('a template on a 48×30 sheet stays inside its height', async () => {
    load(makeDoc(48, 30));
    renderEditor();
    openTab(/layout/i);
    await click(findButton('3-Column Classic'), 'template');
    const box = dialog(/template/i);
    if (box) await click(confirmButton(box), 'confirm');
    const bottom = Math.max(...userBlocks().map((b) => b.y + b.h));
    expect(bottom, 'lowest template block').toBeLessThanOrEqual(300);
  });

  it('Auto-Arrange on a crowded 48×24 sheet shrinks text to fit its height', async () => {
    const d = makeDoc(48, 24);
    const base = d.blocks[2]!;
    const many = Array.from({ length: 24 }, (_, i) => ({
      ...base,
      id: `t${i}`,
      x: 20,
      y: 20 + i * 8,
      w: 100,
      h: 8,
      content: `Paragraph ${i} of the results section.`,
    }));
    load({ ...d, blocks: many } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    const size0 = doc().styles.body.size;
    await click(findButton('Auto-Arrange'), 'auto-arrange');
    expect(doc().styles.body.size, 'body text size after arranging').toBeLessThan(size0);
  });
});

describe('A — a size is named as a preset only when it is that preset', () => {
  it('47.8×36 is a custom size, not "48×36"', async () => {
    load(makeDoc(47.8, 36));
    renderEditor();
    openTab(/layout/i);
    expect(sizeMenu().value).toBe('custom');
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    expect(document.body.textContent ?? '').toContain('47.8"×36" Custom');
  });

  it('control: A0 landscape (46.8×33.1) is named A0', () => {
    load(makeDoc(46.8, 33.1));
    renderEditor();
    openTab(/layout/i);
    expect(sizeMenu().value).toBe('A0L');
  });
});

describe('A — a poster saved without a usable size is drawn and arranged safely', () => {
  // The old preset lookup hid these: any unusable size fell back to 48×36.
  // Drawing the size as stored made them NaN, and Auto-Arrange then deleted
  // every body block (docs/fixes/02-poster-size.md, review of cause A).
  const withWidth = (w: unknown) => ({ ...makeDoc(48, 36), widthIn: w }) as unknown as PosterDoc;

  it.each([
    ['missing', undefined],
    ['not a number', 'abc'],
    ['zero', 0],
    ['negative', -30],
    ['absurdly large', 5000],
  ])('a width that is %s is drawn at the default 48 in', (_label, w) => {
    load(withWidth(w));
    renderEditor();
    expect(q<HTMLElement>('#poster-canvas').style.width).toBe('480px');
  });

  it('Auto-Arrange keeps every block when the saved width is missing', async () => {
    load(withWidth(undefined));
    renderEditor();
    openTab(/layout/i);
    const ids = userBlocks().map((b) => b.id).sort();
    await click(findButton('Auto-Arrange'), 'auto-arrange');
    expect(userBlocks().map((b) => b.id).sort()).toEqual(ids);
    const bad = userBlocks().filter((b) => ![b.x, b.y, b.w, b.h].every(Number.isFinite));
    expect(bad.map((b) => b.id), 'blocks with non-finite geometry').toEqual([]);
  });

  it('a new block lands at a finite position when the saved width is missing', async () => {
    load(withWidth(undefined));
    renderEditor();
    openTab(/insert/i);
    const before = new Set(doc().blocks.map((b) => b.id));
    await click(findButton('Text'), '+ Text');
    const added = doc().blocks.find((b) => !before.has(b.id))!;
    expect([added.x, added.y].every(Number.isFinite), `new block at ${added.x},${added.y}`).toBe(true);
  });

  it('the preview label never reads NaN', async () => {
    load(withWidth('abc'));
    renderEditor();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    expect(document.body.textContent ?? '').not.toContain('NaN');
  });
});

describe('A — the drawable range is pinned', () => {
  // A one-constant change to the bounds would bring cause A back for every
  // poster outside them (review of the cause-A re-check, RA1).
  it.each([
    [72, '720px'],
    [1000, '10000px'],
    [3, '30px'],
  ])('a %s-inch-wide poster is drawn at its own width', (w, px) => {
    load(makeDoc(w, 36));
    renderEditor();
    expect(q<HTMLElement>('#poster-canvas').style.width).toBe(px);
  });

  it.each([
    [2.9, 'below 3 in, where 1-inch margins leave no column for Auto-Arrange'],
    [1000.1, 'above 1000 in'],
  ])('a width of %s is unusable (%s) and falls back to 48 in', (w) => {
    load(makeDoc(w as number, 36));
    renderEditor();
    expect(q<HTMLElement>('#poster-canvas').style.width).toBe('480px');
  });
});

describe('A — preset naming is exact in both dimensions', () => {
  it.each([
    [36, 42, '36×42'],
    [42, 42, '42×42'],
    [33.1, 46.8, 'A0P'],
    [33.11, 46.81, 'A0P'],
    [47.9, 36, 'custom'],
  ])('%s × %s is named %s', (w, h, key) => {
    load(makeDoc(w, h));
    renderEditor();
    openTab(/layout/i);
    expect(sizeMenu().value).toBe(key);
  });

  it('A0 portrait is drawn at its exact size, not a rounded one', () => {
    load(makeDoc(33.1, 46.8));
    renderEditor();
    const c = q<HTMLElement>('#poster-canvas');
    expect([c.style.width, c.style.height]).toEqual(['331px', '468px']);
  });
});
