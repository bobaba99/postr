/**
 * Record 28 — Auto-Arrange and the poster's numbers, from the user's entry:
 * the Layout tab's Auto-Arrange button, the top bar's Undo, the Issues tab
 * and Export › Preview poster (docs/fixes/28-auto-arrange.md).
 *
 * jsdom lays nothing out, so here every block is measured at its stored
 * height (a figure's scaled to its width): these tests hold what Auto-Arrange
 * may change and the numbers it must keep; the real measurements and the
 * prototype comparison are in scripts/auto-arrange-check.mjs. Each test
 * asserts the new behaviour, so today's Auto-Arrange (it shrank text in three
 * undo steps, re-sorted the array and renumbered) and today's preview (no
 * figure or table numbers) fail it.
 * Re-run: npx vitest run src/poster/__tests__/autoArrangeEditor.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, PosterDoc } from '@postr/shared';

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

import { act } from '@testing-library/react';
import { makeBlocks } from '../templates';
import { usePosterStore } from '@/stores/posterStore';
import { NoopResizeObserver, click, doc, findButton, load, makeDoc, openTab, q, renderEditor, userBlocks } from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const words = (n: number) => 'participants reported higher scores '.repeat(Math.ceil(n / 4)).trim();

/** The 3-column template with text in its text blocks. */
function threeColumn(textHeight = 60): PosterDoc {
  const blocks = makeBlocks('3col', 48, 36).map((b) => (b.type === 'text' ? { ...b, content: words(40), h: textHeight } : b));
  return { ...makeDoc(48, 36), blocks };
}

const geometry = () => userBlocks().map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
const arrange = () => click(findButton('Auto-Arrange'), 'Auto-Arrange');
const undoButton = () => q<HTMLButtonElement>('button[aria-label="Undo"]');

/** "N." on each heading frame, and "Figure N." / "Table N." on each figure and table, as drawn. */
function drawnNumbers(root: ParentNode = q('#poster-canvas')): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of root.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const text = el.textContent ?? '';
    const n = el.dataset.blockType === 'heading' ? text.match(/^\s*(\d+)\./)?.[0] : text.match(/(Figure|Table) \d+\./)?.[0];
    if (n) out[el.dataset.blockId!] = n.trim();
  }
  return out;
}

describe('Auto-Arrange changes where blocks are, nothing else', () => {
  it('never changes a font size, even when the poster cannot fit', async () => {
    const crowded = threeColumn(260);
    load(crowded);
    renderEditor();
    openTab(/layout/i);
    const styles = structuredClone(doc().styles);
    await arrange();
    expect(geometry()).not.toEqual(crowded.blocks.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })));
    expect(doc().styles).toEqual(styles);
  });

  it('one press of Undo puts every block back', async () => {
    load(threeColumn(260));
    renderEditor();
    openTab(/layout/i);
    const before = geometry();
    const styles = structuredClone(doc().styles);
    await arrange();
    expect(geometry()).not.toEqual(before);
    await click(undoButton(), 'Undo');
    expect(geometry()).toEqual(before);
    expect(doc().styles).toEqual(styles);
  });

  it('keeps the number of columns and the reading order', async () => {
    load(threeColumn());
    renderEditor();
    openTab(/layout/i);
    const lefts = () => new Set(userBlocks().filter((b) => b.type !== 'title' && b.type !== 'authors').map((b) => Math.round(b.x))).size;
    await arrange();
    expect(lefts()).toBe(3);
  });

  it('a second press moves nothing and adds no undo step', async () => {
    load(threeColumn());
    renderEditor();
    openTab(/layout/i);
    await arrange();
    const once = geometry();
    await arrange();
    expect(geometry()).toEqual(once);
    await click(undoButton(), 'Undo');
    expect(undoButton().disabled).toBe(true);
  });

  it('leaves the title and the authors block where they are', async () => {
    const d = threeColumn();
    load(d);
    renderEditor();
    openTab(/layout/i);
    await arrange();
    for (const b of d.blocks.filter((x) => x.type === 'title' || x.type === 'authors')) {
      expect(doc().blocks.find((x) => x.id === b.id)).toMatchObject({ x: b.x, y: b.y, w: b.w, h: b.h });
    }
  });
});

describe('the numbers on the poster', () => {
  it('heading, figure and table numbers are the same after Auto-Arrange', async () => {
    load(threeColumn());
    renderEditor();
    openTab(/layout/i);
    const before = drawnNumbers();
    expect(Object.keys(before)).toHaveLength(7);
    await arrange();
    expect(drawnNumbers()).toEqual(before);
  });

  it('figures are numbered down the columns, not across them', () => {
    const img = (id: string, x: number, y: number): Block => ({
      id, type: 'image', x, y, w: 140, h: 60, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
    });
    load({ ...makeDoc(48, 36), blocks: [...makeDoc(48, 36).blocks.slice(0, 1), img('col1Low', 20, 260), img('col2Top', 250, 100)] });
    renderEditor();
    expect(drawnNumbers()).toMatchObject({ col1Low: 'Figure 1.', col2Top: 'Figure 2.' });
  });

  it('a heading pasted into a column takes its number from where it sits', () => {
    const d = threeColumn();
    const methods = d.blocks.find((b) => b.content === 'Methods')!;
    load({ ...d, blocks: [...d.blocks, { ...methods, id: 'pasted', content: 'Procedure', y: methods.y + 100 }] });
    renderEditor();
    expect(drawnNumbers()['pasted']).toBe('4.');
  });

  it('the preview shows the same figure and table numbers as the canvas', async () => {
    load(threeColumn());
    renderEditor();
    const onCanvas = drawnNumbers();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'Preview poster');
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-block-type="image"], [data-block-type="table"]'));
    const inPreview = all.filter((el) => !el.closest('#poster-canvas'));
    expect(inPreview).toHaveLength(2);
    for (const el of inPreview) expect(el.textContent).toContain(onCanvas[el.dataset.blockId!]!);
  });
});

describe('Issues', () => {
  it('says how many in² are past the bottom margin when the poster cannot fit', async () => {
    // Figures without a caption are drawn at their stored height in jsdom too.
    const fig = (i: number): Block => ({
      id: `f${i}`, type: 'image', x: 10 + (i % 2) * 235, y: 90 + Math.floor(i / 2) * 10, w: 225, h: 160,
      content: '', imageSrc: 'data:image/png;base64,iVBORw0KGgo=', imageFit: 'contain', tableData: null, captionPosition: 'none',
    });
    load({ ...makeDoc(48, 36), blocks: [makeDoc(48, 36).blocks[0]!, ...Array.from({ length: 6 }, (_, i) => fig(i))] });
    const view = renderEditor();
    openTab(/layout/i);
    await arrange();
    // jsdom has no ResizeObserver to re-read the drawn heights after the
    // blocks change size; a fresh editor reads them, as the observer would.
    view.unmount();
    renderEditor();
    openTab(/issues/i);
    const row = Array.from(document.querySelectorAll('button')).find((b) => /past the bottom margin/.test(b.textContent ?? ''));
    expect(row?.textContent).toMatch(/The columns run \d+(\.\d)? in² past the bottom margin, 1 in from the bottom edge\./);
  });

  it('control: says nothing of the margin when everything fits', async () => {
    load(threeColumn());
    renderEditor();
    openTab(/layout/i);
    await arrange();
    openTab(/issues/i);
    expect(document.body.textContent).not.toMatch(/in² past the bottom margin/);
  });
});

describe('review round 1 (record 28 §9)', () => {
  const body = () => userBlocks().filter((b) => b.type !== 'title' && b.type !== 'authors');

  it('B-R1: with the authors block along the foot, the body is laid out above it, on the sheet', async () => {
    const d = threeColumn();
    const foot = d.blocks.map((b) => (b.type === 'authors' ? { ...b, y: 360 - 10 - b.h } : b));
    const authors = foot.find((b) => b.type === 'authors')!;
    load({ ...d, blocks: foot });
    renderEditor();
    openTab(/layout/i);
    await arrange();
    expect(doc().blocks.find((b) => b.id === authors.id)).toMatchObject({ x: authors.x, y: authors.y, w: authors.w, h: authors.h });
    expect(body().filter((b) => b.y + b.h > authors.y - 6 + 0.01).map((b) => b.id)).toEqual([]);
    expect(Math.min(...body().map((b) => b.y))).toBeLessThan(100);
  });

  it('B-R2: a block dragged part-way across its column leaves the poster with three columns', async () => {
    const d = threeColumn();
    const stray = d.blocks.filter((b) => b.type === 'text')[1]!;
    load({ ...d, blocks: d.blocks.map((b) => (b.id === stray.id ? { ...b, x: b.x + 50, y: b.y + 20 } : b)) });
    renderEditor();
    openTab(/layout/i);
    expect(new Set(body().map((b) => Math.round(b.x))).size).toBe(4);
    await arrange();
    expect(new Set(body().map((b) => Math.round(b.x))).size).toBe(3);
  });

  it('B-R7: a second press that would move a block 0.01 in or less adds no undo step', async () => {
    load(threeColumn());
    renderEditor();
    openTab(/layout/i);
    const before = geometry();
    await arrange();
    // A second press can measure a block a hair different from the first (a
    // drawn border, a rounding); stand in for that with an arranged block
    // 0.04 units (0.004 in) off where the press puts it.
    const blocks = doc().blocks;
    const t = blocks.find((b) => b.type === 'text')!;
    act(() => usePosterStore.getState().setBlocksSilent(blocks.map((b) => (b.id === t.id ? { ...b, y: b.y + 0.04 } : b))));
    await arrange();
    await click(undoButton(), 'Undo');
    expect(geometry()).toEqual(before);
  });
});

describe('record 29’s grey prompts (the merge of main, record 30, into record 29)', () => {
  it('Auto-Arrange measures on the sheet, where the prompts are drawn', async () => {
    // An empty block's prompt is drawn only inside #poster-canvas (index.css,
    // record 29 review round 1, R1-01) and sets its height there. Auto-Arrange
    // measures copies of the frames laid out in a host it adds to the element
    // it is given: given the workspace around the sheet, the copies drew no
    // prompt, so on a fresh template each empty block was placed at its
    // height without one and the block under it overlapped it
    // (auto-arrange-check G3, G11, G13; MEASURED in Chromium: every copy's
    // ::before "none", the 3-Column template's text blocks placed 12 units
    // tall and drawn 17.5 to 25.25). jsdom lays nothing out, so this reads
    // where the hosts go: inside the sheet.
    load({ ...makeDoc(48, 36), blocks: makeBlocks('3col', 48, 36) });
    renderEditor();
    openTab(/layout/i);
    const sheet = q('#poster-canvas');
    const records: MutationRecord[] = [];
    const seen = new MutationObserver((rs) => records.push(...rs));
    seen.observe(document.body, { childList: true, subtree: true });
    await arrange();
    records.push(...seen.takeRecords());
    seen.disconnect();
    const hosts = records.flatMap((r) => [...r.addedNodes].map((n) => ({ n, parent: r.target })))
      .filter(({ n }) => n instanceof HTMLElement && n.hasAttribute('data-postr-measure'));
    expect(hosts.length, 'Auto-Arrange measured in a host').toBeGreaterThan(0);
    expect(hosts.filter(({ parent }) => !(parent instanceof Element && (parent === sheet || sheet.contains(parent)))).length, 'every host inside #poster-canvas').toBe(0);
  });
});
