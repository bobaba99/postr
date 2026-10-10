/**
 * Fix 02, causes B–D — changing the poster's size, or applying a template,
 * must not throw the user's work away. Cause A (the sheet size itself) is
 * tested in sheetSize.test.tsx. Engineering record: docs/fixes/02-poster-size.md.
 *
 * Each describe block tests ONE stated hypothesis and asserts the behaviour
 * the owner approved, so on the unfixed code these fail and the failure
 * pattern is the evidence. Everything enters where a user enters: the real
 * Layout controls, real clicks and keystrokes, ⌘Z on the page.
 *
 *   B  Choosing a size preset rebuilds the blocks from the 3-column template,
 *      without asking.
 *   C  Applying a template replaces the blocks without asking, while the
 *      panel says content is kept.
 *   D  The custom width/height fields apply every keystroke as a sheet size
 *      and accept values below their own minimum.
 *
 * Owner decisions (docs/stress-test/PLAN.md): a size change asks first, then
 * moves every block to the same relative position on the new sheet, as one
 * undo step; a typed custom size does the same when the field is committed
 * (Enter or leaving it); a template asks first and says it replaces.
 *
 * Re-run: npx vitest run src/poster/__tests__/posterSize.test.tsx --reporter=verbose
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the sidebar's Duplicate (config/features.ts EDITOR_EXTRAS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  EDITOR_EXTRAS_ENABLED: true,
}));
import { fireEvent } from '@testing-library/react';
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
  duplicatePoster: vi.fn(async () => ({ id: 'copy-1', title: 'Lab meeting draft v3 (copy)' })),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { usePosterStore } from '@/stores/posterStore';
import { makeBlocks } from '../templates';
import { ACK_BLOCK_ID } from '@/export/ackBlock';
import {
  NAME,
  NoopResizeObserver,
  cancelButton,
  choosePreset,
  click,
  confirmButton,
  dialog,
  doc,
  expectMovedProportionally,
  findButton,
  heightField,
  insideSheet,
  load,
  makeDoc,
  mark,
  nextTask,
  openTab,
  pressEnter,
  q,
  renderEditor,
  sizeMenu,
  typeKeystrokes,
  undoKey,
  userBlocks,
  widthField,
} from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('B — choosing a size preset asks first, then moves every block onto the new sheet', () => {
  it('asks before changing anything', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const before = JSON.stringify(doc());
    await choosePreset('36×48');
    expect(dialog(/Change poster to 36 × 48 in/), 'a confirmation dialog').not.toBeNull();
    expect(
      document.querySelector('[role="dialog"][aria-modal="true"]')?.getAttribute('aria-labelledby'),
      'announced as a dialog, named by its title',
    ).toBeTruthy();
    expect(JSON.stringify(doc()), 'nothing changed while it asks').toBe(before);
  });

  it('Cancel leaves the poster and the history exactly as they were', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const before = JSON.stringify(doc());
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    expect(box).not.toBeNull();
    await click(cancelButton(box!), 'cancel');
    expect(JSON.stringify(doc())).toBe(before);
    expect(usePosterStore.getState().canUndo).toBe(false);
    expect(sizeMenu().value, 'the menu goes back to the current size').toBe('48×36');
  });

  // The dialog itself is the first test's job; this one measures what happens
  // to the blocks, so it also tells "replaced" from "kept but moved" (B-alt).
  it('after the change, every block keeps its content, at the same relative position', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const before = userBlocks();
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    if (box) await click(confirmButton(box), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([36, 48]);
    expectMovedProportionally(before, [48, 36], [36, 48]);
  });

  it('text sizes are not changed', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const styles = JSON.stringify(doc().styles);
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    if (box) await click(confirmButton(box), 'confirm');
    expect(JSON.stringify(doc().styles)).toBe(styles);
  });

  it('the credit mark is placed again, on the new sheet', async () => {
    load(makeDoc(48, 36), { seedAcknowledgement: true });
    expect(mark(), 'premise: the poster starts with the mark').toBeDefined();
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    if (box) await click(confirmButton(box), 'confirm');
    expect(mark(), 'the mark is still there').toBeDefined();
    expect(insideSheet(mark()!), `mark at ${mark()!.x},${mark()!.y}`).toBe(true);
    expect([mark()!.w, mark()!.h], 'a logo keeps its size').toEqual([12, 12]);
  });

  it('one ⌘Z puts the size and every block back', async () => {
    const original = makeDoc(48, 36);
    load(original);
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    if (box) await click(confirmButton(box), 'confirm');
    await undoKey();
    expect([doc().widthIn, doc().heightIn]).toEqual([48, 36]);
    expect(JSON.stringify(userBlocks())).toBe(JSON.stringify(original.blocks));
  });
});

describe('C — a template asks first, and its copy says what it does', () => {
  it('the Templates copy does not promise that content is kept', () => {
    load(makeDoc());
    renderEditor();
    openTab(/layout/i);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/without losing their content/);
  });

  it('asks before replacing, and Cancel changes nothing', async () => {
    load(makeDoc());
    renderEditor();
    openTab(/layout/i);
    const before = JSON.stringify(doc());
    await click(findButton('3-Column Classic'), 'template');
    const box = dialog(/template/i);
    expect(box, 'a confirmation dialog').not.toBeNull();
    expect(JSON.stringify(doc()), 'nothing changed while it asks').toBe(before);
    await click(cancelButton(box!), 'cancel');
    expect(JSON.stringify(doc())).toBe(before);
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  // Replacing is the approved behaviour; the dialog is the previous test's job.
  it('applying a template replaces the blocks, and one ⌘Z brings them back', async () => {
    const original = makeDoc();
    load(original);
    renderEditor();
    openTab(/layout/i);
    await click(findButton('3-Column Classic'), 'template');
    const box = dialog(/template/i);
    if (box) await click(confirmButton(box), 'confirm');
    expect(userBlocks().some((b) => b.content === 'Our own words, not a placeholder.')).toBe(false);
    await undoKey();
    expect(JSON.stringify(userBlocks())).toBe(JSON.stringify(original.blocks));
  });
});

describe('D — a typed custom size applies when the field is committed, asks first, moves blocks', () => {
  it('typing "2", "24" does not resize the sheet on each keystroke', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['2', '24']);
    expect(doc().heightIn, 'nothing applied before Enter').toBe(36);
    expect(dialog(/Change poster to/), 'nothing asks while typing').toBeNull();
  });

  it('Escape puts the field back without asking', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['3', '30']);
    fireEvent.keyDown(heightField(), { key: 'Escape' });
    await nextTask();
    expect(heightField().value).toBe('36');
    fireEvent.blur(heightField());
    await nextTask();
    expect(dialog(/Change poster to/), 'leaving the field afterwards asks nothing').toBeNull();
    expect(doc().heightIn).toBe(36);
  });

  it('Enter asks first, then moves every block onto the new sheet', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const before = userBlocks();
    await typeKeystrokes(heightField(), ['2', '24']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to 48 × 24 in/);
    expect(box, 'a confirmation dialog').not.toBeNull();
    await click(confirmButton(box!), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([48, 24]);
    expectMovedProportionally(before, [48, 36], [48, 24]);
  });

  it('leaving the field commits too', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['4', '40']);
    fireEvent.blur(widthField());
    await nextTask();
    expect(dialog(/Change poster to 40 × 36 in/), 'a confirmation dialog').not.toBeNull();
  });

  it('a value below the minimum is not applied', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['5']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to/);
    if (box) await click(confirmButton(box), 'confirm');
    expect(doc().heightIn).toBe(36);
  });

  it('Cancel puts the field back and changes nothing', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const before = JSON.stringify(doc());
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to 48 × 30 in/);
    expect(box).not.toBeNull();
    await click(cancelButton(box!), 'cancel');
    expect(JSON.stringify(doc())).toBe(before);
    expect(heightField().value).toBe('36');
  });

  it('typing "2", "24" keeps the credit mark', async () => {
    load(makeDoc(48, 36), { seedAcknowledgement: true });
    expect(mark(), 'premise: the poster starts with the mark').toBeDefined();
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['2', '24']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to 48 × 24 in/);
    if (box) await click(confirmButton(box), 'confirm');
    expect(mark(), 'the mark is still there').toBeDefined();
    expect(insideSheet(mark()!), `mark at ${mark()!.x},${mark()!.y}`).toBe(true);
  });

  it('on a wider sheet the credit mark moves with the poster and keeps its size', async () => {
    // The mark starts on the left margin; a WIDER sheet keeps its moved
    // position legal, so nothing re-places it — this is where a scaled logo
    // would show. (A narrower sheet moves it inside the margin and it is
    // placed again at its standard size.)
    load(makeDoc(48, 36), { seedAcknowledgement: true });
    const m0 = mark();
    expect(m0, 'premise: the poster starts with the mark').toBeDefined();
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['6', '60']);
    await pressEnter(widthField());
    const box = dialog(/Change poster to 60 × 36 in/);
    expect(box).not.toBeNull();
    await click(confirmButton(box!), 'confirm');
    expect([mark()!.w, mark()!.h], 'a logo keeps its size').toEqual([m0!.w, m0!.h]);
    expect(Math.abs(mark()!.x - m0!.x * 60 / 48), 'and moves with the sheet').toBeLessThanOrEqual(0.5);
  });

  it('after leaving the field, one ⌘Z puts the size and every block back', async () => {
    // In a browser the dialog gives focus back to the height field, and ⌘Z
    // pressed IN a field is the browser's own text undo, not the poster's
    // (plan item 12; measured in Chromium by the final review, RF-1). So
    // this test leaves the field first, as a user must today. jsdom loses
    // focus while the field is typed in, so it cannot show the first part.
    const original = makeDoc(48, 36);
    load(original);
    renderEditor();
    openTab(/layout/i);
    heightField().focus();
    await typeKeystrokes(heightField(), ['2', '24']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to 48 × 24 in/);
    if (box) await click(confirmButton(box), 'confirm');
    heightField().blur();
    await undoKey();
    expect([doc().widthIn, doc().heightIn]).toEqual([48, 36]);
    expect(JSON.stringify(userBlocks())).toBe(JSON.stringify(original.blocks));
  });
});

/** The dialog open now, if any (a dialog that is fading out does not count). */
const openDialogs = () => Array.from(document.querySelectorAll('[data-postr-modal-content][data-state="open"]'));

describe('B — the size menu by keyboard asks only when you have chosen', () => {
  // A closed <select> fires `change` on every type-ahead key, so asking on each
  // one opened a dialog for a preset nobody chose, and the next key (a space in
  // "A0 P") pressed its button (review of fix 02, BD-BR-4).
  it('keys on the menu change the choice without asking', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    await nextTask();
    expect(openDialogs(), 'nothing asks yet').toHaveLength(0);
    expect(sizeMenu().value, 'the menu shows the choice').toBe('36×48');
    expect([doc().widthIn, doc().heightIn]).toEqual([48, 36]);
  });

  it('Enter on the menu asks about the chosen preset', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.keyDown(sizeMenu(), { key: 'Enter' });
    await nextTask();
    expect(dialog(/Change poster to 36 × 48 in/)).not.toBeNull();
  });

  it('leaving the menu asks too, and Escape puts it back without asking', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: 'A' });
    fireEvent.change(sizeMenu(), { target: { value: 'A0L' } });
    fireEvent.keyDown(sizeMenu(), { key: 'Escape' });
    await nextTask();
    expect(sizeMenu().value).toBe('48×36');
    fireEvent.blur(sizeMenu());
    await nextTask();
    expect(openDialogs(), 'nothing to ask after Escape').toHaveLength(0);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.blur(sizeMenu());
    await nextTask();
    expect(dialog(/Change poster to 36 × 48 in/)).not.toBeNull();
  });
});

describe('B/C — while a dialog asks, nothing else changes the poster', () => {
  it('editor shortcuts do nothing behind the dialog, and Cancel leaves the poster as it was', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await click(q('[data-block-id="b1"]'), 'select b1');
    openTab(/layout/i);
    const before = JSON.stringify(doc());
    await choosePreset('36×48');
    expect(openDialogs()).toHaveLength(1);
    for (const key of ['Backspace', 'Delete', 'ArrowRight', 'ArrowDown']) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
    await nextTask();
    expect(JSON.stringify(doc()), 'nothing changed behind the dialog').toBe(before);
    await click(cancelButton(dialog(/Change poster to 36 × 48 in/)!), 'cancel');
    expect(JSON.stringify(doc())).toBe(before);
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('a second request does not open a second dialog or change what the first asks', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    await click(findButton('3-Column Classic'), 'template');
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    expect(openDialogs(), 'one dialog at a time').toHaveLength(1);
    expect(dialog(/Change poster to 36 × 48 in/), 'still asking about 36 × 48').not.toBeNull();
    await click(confirmButton(dialog(/Change poster to 36 × 48 in/)!), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([36, 48]);
  });
});

describe('C — the template you pick is the template you get', () => {
  it('Billboard: the dialog names it and confirming applies it', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await click(findButton('Billboard'), 'Billboard');
    const box = dialog(/Billboard/);
    expect(box, 'the dialog names Billboard').not.toBeNull();
    await click(confirmButton(box!), 'confirm');
    expect(userBlocks().map((b) => b.type)).toEqual(makeBlocks('billboard', 48, 36).map((b) => b.type));
  });
});

describe('B — geometry details of moving onto a new sheet', () => {
  it('a block flush with the right edge stays flush, and is not flagged', async () => {
    const d = makeDoc(48, 36);
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b2' ? { ...b, x: 5, w: 475 } : b)) } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await choosePreset('42×36');
    await click(confirmButton(dialog(/Change poster to 42 × 36 in/)!), 'confirm');
    const b2 = doc().blocks.find((b) => b.id === 'b2')!;
    expect(b2.x + b2.w, 'right edge').toBeLessThanOrEqual(420);
    expect(b2.x + b2.w).toBeGreaterThan(419.9);
    expect(q('[data-block-id="b2"]')?.getAttribute('data-postr-oob') ?? null).toBeNull();
  });

  it('a side label rotated 90° keeps its place and its length relative to the sheet', async () => {
    const d = makeDoc(48, 36);
    // On screen: 40 wide by 300 tall, x 430..470, y 30..330 on a 480 × 360 sheet.
    const label = { ...d.blocks[2]!, id: 'side', x: 300, y: 160, w: 300, h: 40, rotation: 90 };
    load({ ...d, blocks: [label] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    await click(confirmButton(dialog(/Change poster to 36 × 48 in/)!), 'confirm');
    const b = doc().blocks.find((x) => x.id === 'side')!;
    // What the user sees for a 90° block: w and h swap about the centre.
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const [vw, vh] = [b.h, b.w];
    expect(cx - vw / 2, 'left edge on screen').toBeGreaterThanOrEqual(0);
    expect(cx + vw / 2, 'right edge on screen').toBeLessThanOrEqual(360);
    expect(vh / 480, 'share of the sheet height').toBeCloseTo(300 / 360, 2);
    expect(cx / 360, 'across').toBeCloseTo(450 / 480, 2);
    expect(cy / 480, 'down').toBeCloseTo(180 / 360, 2);
  });

  it('the credit mark in the top margin is kept when the new sheet has room for it', async () => {
    const d = makeDoc(48, 36);
    const body = { ...d.blocks[2]!, id: 'body', x: 10, y: 44, w: 460, h: 306 };
    const credit = { ...d.blocks[2]!, id: ACK_BLOCK_ID, type: 'logo', content: '', x: 10, y: 10, w: 12, h: 12, locked: true };
    load({ ...d, blocks: [body, credit] } as unknown as PosterDoc, { seedAcknowledgement: true });
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['1', '18']);
    await pressEnter(heightField());
    await click(confirmButton(dialog(/Change poster to 48 × 18 in/)!), 'confirm');
    expect(mark(), 'the mark is kept: the top-margin row is free').toBeDefined();
    expect(insideSheet(mark()!)).toBe(true);
  });

  it('text sizes do not change when the sheet area does', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    const styles = JSON.stringify(doc().styles);
    await choosePreset('24×36');
    await click(confirmButton(dialog(/Change poster to 24 × 36 in/)!), 'confirm');
    expect(JSON.stringify(doc().styles)).toBe(styles);
  });

  it('on a taller sheet the credit mark moves down with it', async () => {
    load(makeDoc(48, 36), { seedAcknowledgement: true });
    const y0 = mark()!.y;
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['6', '60']);
    await pressEnter(heightField());
    await click(confirmButton(dialog(/Change poster to 48 × 60 in/)!), 'confirm');
    expect(Math.abs(mark()!.y - (y0 * 60) / 36)).toBeLessThanOrEqual(0.5);
  });
});

describe('D — what the size fields say and accept', () => {
  it('a value below 10 is rejected with a message', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['5']);
    await pressEnter(heightField());
    expect(openDialogs()).toHaveLength(0);
    expect(document.body.textContent ?? '').toMatch(/between 10 and 100 in/);
    expect(heightField().getAttribute('aria-invalid')).toBe('true');
  });

  it('a value above 100 is rejected', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['1', '10', '101']);
    await pressEnter(widthField());
    expect(openDialogs()).toHaveLength(0);
    expect(doc().widthIn).toBe(48);
  });

  it('a fractional size is asked about exactly, with the approved message', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['3', '30', '30.', '30.5']);
    await pressEnter(heightField());
    const box = dialog(/Change poster to 48 × 30\.5 in\?/);
    expect(box).not.toBeNull();
    expect(box!.textContent ?? '').toContain('Your blocks will move onto the new sheet. You can undo this.');
  });

  it('a size change clears the selection', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await click(q('[data-block-id="b1"]'), 'select b1');
    expect(q('[data-postr-selected="true"]')).not.toBeNull();
    openTab(/layout/i);
    await choosePreset('36×48');
    await click(confirmButton(dialog(/Change poster to 36 × 48 in/)!), 'confirm');
    expect(q('[data-postr-selected="true"]')).toBeNull();
  });
});

describe('D — a size field can be cleared and retyped', () => {
  // The old fields ignored an empty or "0" value, React put the old value
  // back, and the next digit was appended: clearing "30" and typing "24" gave
  // "3024" (cause-A re-check, RA2).
  it('clearing the height and typing 24 asks about 24', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['', '2', '24']);
    await pressEnter(heightField());
    expect(dialog(/Change poster to 48 × 24 in/)).not.toBeNull();
  });

  it('typing 1189 (an A0 height in millimetres) is rejected, not drawn as 48', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['1', '11', '118', '1189']);
    await pressEnter(widthField());
    expect(openDialogs()).toHaveLength(0);
    expect(doc().widthIn).toBe(48);
  });
});

/**
 * Re-check of the B–D fixes (docs/fixes/02-poster-size.md, section 9):
 *   BG-1  a block at 15°–75° grew on every there-and-back size change
 *         (45°: +17% per side per round trip);
 *   BG-4  a 180° block flush with the edge landed 0.01 past it;
 *   BG-2  ISSUES checked a rotated block's stored box, not the box it draws;
 *   BK-8  width, Tab, height, Enter asked about the width alone;
 *   BK-7  a keyboard choice on the menu survived a mouse pick;
 *   BT-2..4  behaviour no test read (see each test).
 */
function rotated(rotation: number, box = { x: 300, y: 150, w: 120, h: 40 }): PosterDoc {
  const d = makeDoc(48, 36);
  return { ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', content: 'DRAFT', ...box, rotation }] } as PosterDoc;
}
const tilt = () => doc().blocks.find((b) => b.id === 'tilt')!;
async function changeTo(key: string, title: RegExp) {
  await choosePreset(key);
  await click(confirmButton(dialog(title)!), 'confirm');
}
/** The box a rotated block covers on screen (its axis-aligned bounds). */
function drawnBox(b: { x: number; y: number; w: number; h: number; rotation?: number }) {
  const t = ((b.rotation ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
  const [hw, hh] = [(b.w * c + b.h * s) / 2, (b.w * s + b.h * c) / 2];
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
}
const flagged = (id: string) => q(`[data-block-id="${id}"]`)?.getAttribute('data-postr-oob') ?? null;

/**
 * ISSUES checks a block at its RENDERED height, which the editor measures on
 * the block's frame. jsdom has no layout: it reports 0, or "auto", which
 * makes every rotated block 0 thick to ISSUES. This makes the frames of the
 * blocks in `heights` measure as a browser does: computed style gives the
 * height with its fraction ("248.25px"), and offsetHeight rounds it to whole
 * pixels (248). A height can be a function (an image renders at its current
 * stored height). Returns the undo.
 */
function measureAs(heights: Record<string, number | (() => number)>) {
  const of = (el: Element) => {
    const id = el.getAttribute('data-block-id');
    if (id === null || !(id in heights)) return null;
    const h = heights[id]!;
    return typeof h === 'function' ? h() : h;
  };
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const h = of(this);
      return h === null ? original.get!.call(this) : Math.round(h);
    },
  });
  const realStyle = window.getComputedStyle.bind(window);
  const style = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const cs = realStyle(el, pseudo);
    const h = of(el);
    if (h === null) return cs;
    return new Proxy(cs, {
      get: (target, key) => (key === 'height' ? `${h}px` : Reflect.get(target, key)),
    });
  });
  return () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original);
    style.mockRestore();
  };
}
/**
 * The editor re-measures a block when its ResizeObserver fires. The shared
 * stub never fires, so a height that changes stays stale in jsdom; this one
 * fires when told to, as a browser does after a block's size changes.
 */
class FiringResizeObserver {
  static all: FiringResizeObserver[] = [];
  constructor(private cb: ResizeObserverCallback) {
    FiringResizeObserver.all.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  static async fire() {
    for (const o of FiringResizeObserver.all) o.cb([], o as unknown as ResizeObserver);
    await new Promise((r) => setTimeout(r, 50)); // the editor reads on the next frame
  }
}
let unmeasure = () => {};
afterEach(() => {
  unmeasure();
  unmeasure = () => {};
});

describe('B — a rotated block survives a size change and its reverse', () => {
  it.each([15, 30, 45, 60, 75, 135, -30])('at %s°, three round trips give the block back', async (deg) => {
    load(rotated(deg));
    renderEditor();
    openTab(/layout/i);
    for (let i = 0; i < 3; i++) {
      await changeTo('36×48', /Change poster to 36 × 48 in/);
      await changeTo('48×36', /Change poster to 48 × 36 in/);
    }
    const b = tilt();
    expect([b.x, b.y, b.w, b.h].map((v) => Math.round(v * 10) / 10)).toEqual([300, 150, 120, 40]);
  });

  it.each([270, -90])('a side label at %s° keeps its place and length, inside the sheet', async (deg) => {
    load(rotated(deg, { x: 300, y: 160, w: 300, h: 40 }));
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    const box = drawnBox(tilt());
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(360);
    expect((box.bottom - box.top) / 480, 'share of the sheet height').toBeCloseTo(300 / 360, 2);
    expect(tilt().w, 'its length').toBeGreaterThan(0);
  });

  it('a 180° block flush with the right edge stays inside, and is not flagged', async () => {
    unmeasure = measureAs({ tilt: 60 });
    load(rotated(180, { x: 5, y: 250, w: 475, h: 60 }));
    renderEditor();
    openTab(/layout/i);
    await changeTo('42×36', /Change poster to 42 × 36 in/);
    expect(drawnBox(tilt()).right).toBeLessThanOrEqual(420);
    expect(flagged('tilt')).toBeNull();
  });

  it('a 90° label flush with the bottom-right corner is not rounded past it', async () => {
    // Drawn 40 wide and 200 tall in the corner of 480 × 360. Rounded as it
    // stood, the move to 36 × 48 drew it to 360.005 and 480.005: 136 of 336
    // such flush moves between presets overshot (measured, record section 9).
    unmeasure = measureAs({ tilt: 30 });
    load(rotated(90, { x: 360, y: 240, w: 200, h: 40 }));
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    const box = drawnBox(tilt());
    expect(box.right, 'right edge').toBeLessThanOrEqual(360);
    expect(box.bottom, 'bottom edge').toBeLessThanOrEqual(480);
    expect(flagged('tilt')).toBeNull();
  });

  it('a 90° label flush with the bottom stays inside after the change', async () => {
    // Drawn 40 wide and 300 tall, from y 60 down to the sheet's bottom edge.
    unmeasure = measureAs({ tilt: 40 });
    load(rotated(90, { x: 90, y: 190, w: 300, h: 40 }));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['2', '24']);
    await pressEnter(heightField());
    await click(confirmButton(dialog(/Change poster to 48 × 24 in/)!), 'confirm');
    expect(drawnBox(tilt()).bottom).toBeLessThanOrEqual(240);
    expect(flagged('tilt')).toBeNull();
  });
});

describe('B — ISSUES checks the box a rotated block draws', () => {
  it('a 90° label drawn inside the sheet is not flagged after a size change', async () => {
    // After the change it is stored 400 × 30 at x -20, and rendered 30 tall.
    unmeasure = measureAs({ tilt: 30 });
    load(rotated(90, { x: 90, y: 160, w: 300, h: 40 }));
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    const box = drawnBox(tilt());
    expect([box.left >= 0, box.right <= 360, box.top >= 0, box.bottom <= 480], 'drawn inside').toEqual([true, true, true, true]);
    expect(flagged('tilt')).toBeNull();
  });

  it('a 90° label drawn past the top and bottom is flagged, though its stored box fits', () => {
    // Stored 380 × 40 at x 50..430 (inside 480); drawn 40 × 380, y -10..370 on 360.
    unmeasure = measureAs({ tilt: 40 });
    load(rotated(90, { x: 50, y: 160, w: 380, h: 40 }));
    renderEditor();
    expect(flagged('tilt')).not.toBeNull();
  });

  it('a 90° label flush with the left edge is not flagged', () => {
    // Drawn 40 wide from x 0 to 40. In floating point cos 90° is 6e-17, which
    // puts its drawn left edge at -1.07e-14 unless the angle is snapped.
    unmeasure = measureAs({ tilt: 40 });
    load(rotated(90, { x: -130, y: 160, w: 300, h: 40 }));
    renderEditor();
    expect(flagged('tilt')).toBeNull();
  });

  it('control: the same label upright is not flagged', () => {
    unmeasure = measureAs({ tilt: 40 });
    load(rotated(0, { x: 50, y: 160, w: 380, h: 40 }));
    renderEditor();
    expect(flagged('tilt')).toBeNull();
  });
});

describe('D — width and height typed together are one change', () => {
  it('width 40, Tab, height 30, Enter asks about 40 × 30', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['4', '40']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    heightField().focus();
    await nextTask();
    expect(openDialogs(), 'nothing asks while moving to the height').toHaveLength(0);
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    await click(confirmButton(dialog(/Change poster to 40 × 30 in/)!), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([40, 30]);
  });

  it('leaving both fields asks about what they hold', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['4', '40']);
    fireEvent.blur(widthField(), { relatedTarget: null });
    await nextTask();
    expect(dialog(/Change poster to 40 × 36 in/)).not.toBeNull();
  });

  it('exactly 100 in is accepted', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['1', '10', '100']);
    await pressEnter(widthField());
    expect(dialog(/Change poster to 100 × 36 in/)).not.toBeNull();
  });

  it('after a rejection the field shows the poster\'s size again, and Escape clears the message', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['5']);
    await pressEnter(heightField());
    expect(heightField().value).toBe('36');
    fireEvent.keyDown(heightField(), { key: 'Escape' });
    await nextTask();
    expect(document.body.textContent ?? '').not.toMatch(/between 10 and 100 in/);
  });
});

describe('B — the size menu forgets a keyboard choice once the mouse picks', () => {
  it('a mouse pick of the current size after a key leaves nothing to ask', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.mouseDown(sizeMenu());
    fireEvent.change(sizeMenu(), { target: { value: '48×36' } });
    await nextTask();
    expect(sizeMenu().value).toBe('48×36');
    fireEvent.blur(sizeMenu());
    await nextTask();
    expect(openDialogs()).toHaveLength(0);
  });

  it('opening the menu with the mouse after a key asks nothing, even if the picker takes focus', async () => {
    // Chromium's in-page picker, and pickers on some platforms, blur the menu
    // when they open. The keyboard choice is dropped at the mouse press, so
    // that blur has nothing to commit (Chromium re-run of the B–D re-check).
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.mouseDown(sizeMenu());
    fireEvent.blur(sizeMenu());
    await nextTask();
    expect(openDialogs()).toHaveLength(0);
    expect(sizeMenu().value).toBe('48×36');
  });

  it('a mouse pick after a key asks about the picked size', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.mouseDown(sizeMenu());
    fireEvent.change(sizeMenu(), { target: { value: '24×36' } });
    await nextTask();
    expect(dialog(/Change poster to 24 × 36 in/)).not.toBeNull();
  });

  it('Enter, then Cancel: the menu shows the poster\'s size', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.keyDown(sizeMenu(), { key: '3' });
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    fireEvent.keyDown(sizeMenu(), { key: 'Enter' });
    await nextTask();
    await click(cancelButton(dialog(/Change poster to 36 × 48 in/)!), 'cancel');
    expect(sizeMenu().value).toBe('48×36');
  });
});

describe('B/C — what the dialogs say', () => {
  it('the template dialog says it replaces the blocks', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await click(findButton('3-Column Classic'), 'template');
    const text = dialog(/3-Column Classic/)!.textContent ?? '';
    expect(text).toMatch(/replaces every block/);
    expect(text).not.toMatch(/kept|keeps/);
  });

  it('the dialog is named by its title', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = document.querySelector('[role="dialog"]')!;
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toBe('Change poster to 36 × 48 in?');
  });

  it('after Cancel, the next request is asked about in its own words', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await choosePreset('36×48');
    await click(cancelButton(dialog(/Change poster to 36 × 48 in/)!), 'cancel');
    await choosePreset('24×36');
    expect(dialog(/Change poster to 24 × 36 in/)).not.toBeNull();
    await click(confirmButton(dialog(/Change poster to 24 × 36 in/)!), 'confirm');
    expect([doc().widthIn, doc().heightIn]).toEqual([24, 36]);
  });
});

describe('B/C — undo waits behind a dialog (re-check BT-2)', () => {
  // The old test pressed ⌘Z on a fresh poster, where there was nothing to undo.
  async function nudgeB1() {
    await click(q('[data-block-id="b1"]'), 'select b1');
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await nextTask();
    return doc().blocks.find((b) => b.id === 'b1')!.y;
  }

  it('⌘Z behind the size dialog does not undo, and Cancel leaves the nudge', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    const y = await nudgeB1();
    expect(y, 'the nudge moved b1').not.toBe(140);
    openTab(/layout/i);
    await choosePreset('36×48');
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    await nextTask();
    await click(cancelButton(dialog(/Change poster to 36 × 48 in/)!), 'cancel');
    expect(doc().blocks.find((b) => b.id === 'b1')!.y).toBe(y);
  });

  it('keys behind another modal dialog (the logo picker) do not change the poster', async () => {
    // ConfirmModal stops keys itself; other modal dialogs rely on the
    // editor's own guard.
    const d = makeDoc(48, 36);
    const logo = { ...d.blocks[2]!, id: 'lg', type: 'logo', content: '', x: 300, y: 250, w: 60, h: 40 };
    load({ ...d, blocks: [...d.blocks, logo] } as PosterDoc);
    renderEditor();
    await nudgeB1();
    const plus = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('+ Logo'));
    await click(plus, '+ Logo');
    expect(document.querySelector('[role="dialog"][aria-modal="true"]'), 'the logo picker is open').not.toBeNull();
    const before = JSON.stringify(doc());
    for (const key of ['Backspace', 'ArrowDown']) fireEvent.keyDown(document.body, { key });
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    await nextTask();
    expect(JSON.stringify(doc()), 'nothing changed behind the picker').toBe(before);
  });

  it('⌘Z behind the poster preview does not undo', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    const y = await nudgeB1();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    expect(document.querySelector('[role="dialog"][aria-modal="true"]'), 'the preview is a modal dialog').not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    await nextTask();
    expect(doc().blocks.find((b) => b.id === 'b1')!.y).toBe(y);
  });
});

/**
 * Final review of fix 02 (record, section 9, "Final review"). Tests for what
 * that review measured, each red before its change, and for behaviour of the
 * new code no test had read (RF-6).
 */
describe('the async "Duplicated" prompt does not put focus on its action (F2)', () => {
  it('it opens with focus on "Stay here", so a space typed as it arrives does not navigate', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await click(q('[title="Duplicate this poster"]'), 'Duplicate');
    // Found by its title: this prompt's cancel reads "Stay here", not "Cancel".
    await vi.waitFor(() => expect(q('[role="dialog"] h3')?.textContent).toBe('Duplicated'));
    expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Stay here');
  });
});

describe('D — one side out of range does not throw away the other (F3)', () => {
  it('width 5, Tab, height 30, Enter: the width is rejected and the height 30 is kept', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['5']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    expect(document.body.textContent ?? '').toMatch(/width must be between 10 and 100 in/);
    expect(heightField().value, 'the typed height').toBe('30');
    await pressEnter(heightField());
    expect(dialog(/Change poster to 48 × 30 in/)).not.toBeNull();
  });

  it('typing again clears the rejection message', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['5']);
    await pressEnter(heightField());
    expect(document.body.textContent ?? '').toMatch(/between 10 and 100 in/);
    await typeKeystrokes(heightField(), ['3']);
    expect(document.body.textContent ?? '').not.toMatch(/between 10 and 100 in/);
  });

  it('Escape in the height field keeps the width typed in the other', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['4', '40']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    await typeKeystrokes(heightField(), ['3']);
    fireEvent.keyDown(heightField(), { key: 'Escape' });
    await nextTask();
    expect([widthField().value, heightField().value]).toEqual(['40', '36']);
  });

  it('leaving the width for any other field (the poster name) asks', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['4', '40']);
    fireEvent.blur(widthField(), { relatedTarget: q('input[aria-label="Poster name"]') });
    await nextTask();
    expect(dialog(/Change poster to 40 × 36 in/)).not.toBeNull();
  });
});

describe('B — turned blocks at an edge, and ISSUES at any angle (F7, RF-6)', () => {
  it('a 90° image spanning the whole height stays on the sheet after the change', async () => {
    // Drawn 150 wide and 300 tall, flush top and bottom of a 20 × 30 sheet.
    // An image with no caption (captionPosition 'none': no "Figure 1."
    // label) renders at its stored height, and a browser's offsetHeight
    // rounds that to whole pixels: 248.25 reads 248, which put the drawn box
    // 0.12 past the edge (last-round verification, F2). With the default
    // caption label the frame is taller than stored, and a flag is right
    // (round-7 audit, A7-2).
    unmeasure = measureAs({ tilt: () => tilt().h });
    vi.stubGlobal('ResizeObserver', FiringResizeObserver);
    FiringResizeObserver.all = [];
    const d = makeDoc(20, 30);
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', type: 'image', content: '', captionPosition: 'none', x: -74, y: 75, w: 300, h: 150, rotation: 90 }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('A0P', /Change poster to 33\.1 × 46\.8 in/);
    await FiringResizeObserver.fire();
    expect(tilt().h, 'the image is now rendered 248.25 tall').toBe(248.25);
    expect(flagged('tilt')).toBeNull();
  });

  it('a 90° label flush with the left edge of a portrait sheet stays inside', async () => {
    unmeasure = measureAs({ tilt: 41.3 });
    const d = makeDoc(36, 48);
    // Drawn 41.3 wide from x 0, 301.7 tall.
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', x: -130.2, y: 150, w: 301.7, h: 41.3, rotation: 90 }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('A0L', /Change poster to 46\.8 × 33\.1 in/);
    const box = drawnBox(tilt());
    // This helper does not snap cos 90°, so allow its floating-point noise.
    expect(box.left, 'left edge').toBeGreaterThanOrEqual(-1e-9);
    expect(box.top, 'top edge').toBeGreaterThanOrEqual(-1e-9);
    expect(flagged('tilt')).toBeNull();
  });

  it('a 90° label flush in the top-left corner stays flush in the corner', async () => {
    // Rounded without the move back, its top lands at -0.01 on the new sheet
    // (77 such flush top-left moves between presets overshoot); with cos 90°
    // unsnapped, the move back would nudge it 0.01 off the edge instead.
    const d = makeDoc(48, 36);
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', x: -111.01, y: 111.01, w: 263.33, h: 41.3, rotation: 90 }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×42', /Change poster to 36 × 42 in/);
    const box = drawnBox(tilt());
    expect(box.top, 'top: not past the edge').toBeGreaterThanOrEqual(-1e-9);
    expect(box.left, 'left: not past the edge').toBeGreaterThanOrEqual(-1e-9);
    expect(box.top, 'top: still on the edge').toBeLessThanOrEqual(0.005);
    expect(box.left, 'left: still on the edge').toBeLessThanOrEqual(0.005);
  });

  it('a 90° label flush with the left edge is not nudged off it by floating-point noise', async () => {
    // cos 90° is 6e-17 in floating point. Unsnapped, this label's drawn left
    // edge after the move is -8.9e-15, and the move back inside would push it
    // 0.01 off the edge (538 of 2,016 flush quarter-turn moves between
    // presets, measured).
    const d = makeDoc(48, 36);
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', x: -98.5, y: 98.5, w: 237, h: 40, rotation: 90 }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    expect(drawnBox(tilt()).left).toBeLessThanOrEqual(0.005);
  });

  it('a turned block flush with the bottom of a portrait sheet stays inside', async () => {
    unmeasure = measureAs({ tilt: 60 });
    const d = makeDoc(36, 48);
    // 30°, drawn flush with the bottom of 480.
    const b = { x: 100, w: 200, h: 60, rotation: 30 };
    const hh = (b.w * Math.sin(Math.PI / 6) + b.h * Math.cos(Math.PI / 6)) / 2;
    const y = Math.round((480 - hh - b.h / 2) * 100) / 100;
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', ...b, y }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('48×36', /Change poster to 48 × 36 in/);
    expect(drawnBox(tilt()).bottom).toBeLessThanOrEqual(360);
  });

  it('a turned block the user hung off the edge keeps its place: it is not pulled in', async () => {
    const d = makeDoc(48, 36);
    // 30°, drawn about 40 units past the right edge.
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', x: 330, y: 150, w: 200, h: 60, rotation: 30 }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    const cx = (330 + 100) / 480;
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    const b = tilt();
    expect((b.x + b.w / 2) / 360, 'its centre, across').toBeCloseTo(cx, 3);
  });

  it('at -30°, ISSUES flags a block drawn just past the edge', () => {
    // Drawn 101.6 either side of its centre at x 390: to 491.6 on 480. With
    // a signed sine the box would be 71.6 wide each side and look inside.
    unmeasure = measureAs({ near: 60 });
    const d = makeDoc(48, 36);
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'near', x: 290, y: 150, w: 200, h: 60, rotation: -30 }] } as PosterDoc);
    renderEditor();
    expect(flagged('near')).toBe('true');
  });

  it.each([135, -30, -150])('at %s°, ISSUES flags a block drawn past the edge and not one drawn inside', (deg) => {
    unmeasure = measureAs({ inside: 60, past: 60 });
    const d = makeDoc(48, 36);
    const base = { ...d.blocks[2]!, w: 200, h: 60, rotation: deg };
    load({ ...d, blocks: [{ ...base, id: 'inside', x: 140, y: 150 }, { ...base, id: 'past', x: 330, y: 150 }] } as PosterDoc);
    renderEditor();
    expect([flagged('inside'), flagged('past')]).toEqual([null, 'true']);
  });

  it('a 90° label drawn wholly off the sheet is called "completely outside"', async () => {
    unmeasure = measureAs({ tilt: 40 });
    // Stored 300 × 40 at x 400 (its stored box starts inside 480); drawn
    // 40 wide at x 530..570, all past the right edge.
    load(rotated(90, { x: 400, y: 160, w: 300, h: 40 }));
    renderEditor();
    openTab(/issues/i);
    await nextTask();
    expect(document.body.textContent ?? '').toMatch(/completely outside the poster/);
  });
});

describe('ISSUES overlaps use the box each block is drawn in (final review, logic F4)', () => {
  it('a 90° label is not reported over a block drawn beside it, and is reported over one drawn on it', async () => {
    // The label is drawn at x 220..260, y 30..330; the text block starts 10
    // units to its right; the image is drawn inside the label.
    unmeasure = measureAs({ label: 40, beside: 160, on: 70 });
    const d = makeDoc(48, 36);
    const base = d.blocks[2]!;
    load({
      ...d,
      blocks: [
        { ...base, id: 'label', type: 'heading', x: 90, y: 160, w: 300, h: 40, rotation: 90 },
        { ...base, id: 'beside', x: 270, y: 40, w: 200, h: 160 },
        { ...base, id: 'on', type: 'image', content: '', x: 225, y: 250, w: 30, h: 70 },
      ],
    } as PosterDoc);
    renderEditor();
    openTab(/issues/i);
    await nextTask();
    const text = document.body.textContent ?? '';
    expect(text, 'drawn 10 units apart').not.toMatch(/heading overlaps text/);
    expect(text, 'drawn on top of each other').toMatch(/heading overlaps image/);
  });
});

/**
 * Last-round verification of fix 02 (record, section 9). Each red before
 * its change unless marked.
 */
describe('D — the size fields after a rejection (L-1)', () => {
  it('leaving both fields after a rejected width puts both back to the poster\'s size', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['5']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    await typeKeystrokes(heightField(), ['3', '30']);
    fireEvent.blur(heightField(), { relatedTarget: null });
    await nextTask();
    expect(openDialogs()).toHaveLength(0);
    expect([widthField().value, heightField().value]).toEqual(['48', '36']);
  });

  it('a size change from the menu clears a kept draft and the message', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['5']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    expect(heightField().value, 'the height is kept while the change is in progress').toBe('30');
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    expect([widthField().value, heightField().value]).toEqual(['36', '48']);
    expect(document.body.textContent ?? '').not.toMatch(/must be between 10 and 100 in/);
  });
});

describe('ISSUES overlaps are exact for turned blocks (last-round F1, F3)', () => {
  function overlaps(blocks: Array<Record<string, unknown>>) {
    const d = makeDoc(48, 36);
    const base = { ...d.blocks[2]!, type: 'image', content: '' };
    unmeasure = measureAs(Object.fromEntries(blocks.map((b) => [b.id as string, b.h as number])));
    load({ ...d, blocks: blocks.map((b) => ({ ...base, ...b })) } as PosterDoc);
    renderEditor();
  }
  async function overlapText() {
    openTab(/issues/i);
    await nextTask();
    return document.body.textContent ?? '';
  }

  it('a 30° image drawn 11.66 units from an upright one is not reported', async () => {
    overlaps([{ id: 'tilted', x: 180, y: 80, w: 240, h: 40, rotation: 30 }, { id: 'upright', x: 330, y: 20, w: 120, h: 60 }]);
    expect(await overlapText()).not.toMatch(/image overlaps image/);
  });

  it('two parallel 45° images about 6 in apart are not reported', async () => {
    overlaps([{ id: 'a', x: 100, y: 200, w: 300, h: 20, rotation: 45 }, { id: 'b', x: 156.57, y: 143.43, w: 300, h: 20, rotation: 45 }]);
    expect(await overlapText()).not.toMatch(/image overlaps image/);
  });

  it('control: a 30° image drawn across an upright one is reported', async () => {
    overlaps([{ id: 'tilted', x: 180, y: 80, w: 240, h: 40, rotation: 30 }, { id: 'upright', x: 280, y: 80, w: 60, h: 60 }]);
    expect(await overlapText()).toMatch(/image overlaps image/);
  });

  it('the turned block may come second in the pair', async () => {
    overlaps([{ id: 'on', x: 225, y: 250, w: 30, h: 70 }, { id: 'label', x: 90, y: 160, w: 300, h: 40, rotation: 90 }]);
    expect(await overlapText()).toMatch(/image overlaps image/);
  });

  it('a block whose saved rotation is not a number is treated as upright', async () => {
    overlaps([
      { id: 'odd', x: 20, y: 20, w: 100, h: 60, rotation: 'abc' },
      { id: 'far1', x: 300, y: 20, w: 100, h: 60 },
      { id: 'far2', x: 20, y: 250, w: 100, h: 60 },
    ]);
    expect(await overlapText()).not.toMatch(/overlaps/);
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    const odd = doc().blocks.find((b) => b.id === 'odd')!;
    expect([odd.x, odd.y, odd.w, odd.h].every(Number.isFinite), 'finite after a size change').toBe(true);
  });
});

describe('ISSUES edge tolerance, side by side (last-round F4)', () => {
  // A 90° label 300 × 40 drawn 40 wide; shifted so its drawn edge sits
  // `past` units beyond the sheet on one side.
  function label(side: 'left' | 'top' | 'right', past: number) {
    unmeasure = measureAs({ tilt: 40 });
    // Drawn box: x from cx - 20 to cx + 20, y from cy - 150 to cy + 150.
    const cx = side === 'left' ? 20 - past : side === 'right' ? 460 + past : 240;
    const cy = side === 'top' ? 150 - past : 180;
    load(rotated(90, { x: cx - 150, y: cy - 20, w: 300, h: 40 }));
    renderEditor();
  }
  it.each([
    ['left', 0.004, null],
    ['top', 0.004, null],
    ['right', 0.004, null],
    ['left', 0.01, 'true'],
    ['top', 0.01, 'true'],
    ['right', 0.01, 'true'],
  ] as const)('a label %s by %s units past the edge is flagged: %s', (side, past, want) => {
    label(side, past);
    expect(flagged('tilt')).toBe(want);
  });

  it('a turned block flush with the right edge to within 0.001 is moved back inside after a size change', async () => {
    const d = makeDoc(48, 36);
    // 30°, drawn to 480.0008 on 480 (rounded, as a stored position is).
    const b = { y: 150, w: 200, h: 60, rotation: 30 };
    const hw = (b.w * Math.cos(Math.PI / 6) + b.h * Math.sin(Math.PI / 6)) / 2;
    const x = Math.round((480 - hw - b.w / 2) * 100) / 100;
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'tilt', ...b, x }] } as PosterDoc);
    renderEditor();
    openTab(/layout/i);
    await changeTo('36×48', /Change poster to 36 × 48 in/);
    expect(drawnBox(tilt()).right).toBeLessThanOrEqual(360);
  });
});

/** Round-7 audit of fix 02 (record, section 9). */
describe('ISSUES and turned blocks, round-7 audit', () => {
  it('a rotation saved as a numeric string is checked as drawn (turned)', () => {
    // The canvas draws rotate("30"deg) turned; ISSUES treated "30" as upright.
    // Upright this block ends at y 350 on 360; turned 30° it is drawn to 396.
    unmeasure = measureAs({ near: 60 });
    const d = makeDoc(48, 36);
    load({ ...d, blocks: [{ ...d.blocks[2]!, id: 'near', x: 140, y: 290, w: 200, h: 60, rotation: '30' }] } as unknown as PosterDoc);
    renderEditor();
    expect(flagged('near')).toBe('true');
  });

  it('an upright block listed first is not reported over a tilted one drawn apart', async () => {
    const d = makeDoc(48, 36);
    const base = { ...d.blocks[2]!, type: 'image', content: '' };
    unmeasure = measureAs({ upright: 60, tilted: 40 });
    load({ ...d, blocks: [{ ...base, id: 'upright', x: 330, y: 20, w: 120, h: 60 }, { ...base, id: 'tilted', x: 180, y: 80, w: 240, h: 40, rotation: 30 }] } as PosterDoc);
    renderEditor();
    openTab(/issues/i);
    await nextTask();
    expect(document.body.textContent ?? '').not.toMatch(/image overlaps image/);
  });

  it('two upright blocks overlapping by exactly the 2-unit tolerance are not reported, as before', async () => {
    // The pair the audit measured: on the hundredths grid the x-overlap is
    // exactly 2.00; computed from centres it came out 2.000000000000057.
    const d = makeDoc(48, 36);
    const base = d.blocks[2]!;
    unmeasure = measureAs({ a: 99.75, b: 126.42 });
    load({ ...d, blocks: [{ ...base, id: 'a', x: 369.32, y: 11, w: 26.95, h: 99.75 }, { ...base, id: 'b', x: 394.27, y: 47.45, w: 140.69, h: 126.42 }] } as PosterDoc);
    renderEditor();
    openTab(/issues/i);
    await nextTask();
    expect(document.body.textContent ?? '').not.toMatch(/text overlaps text/);
  });
});

describe('D — a second Enter that succeeds clears the message (round-7 audit)', () => {
  it('width 5, Tab, height 30, Enter, Enter: the dialog asks about 48 × 30 and the message is gone', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    await typeKeystrokes(widthField(), ['5']);
    fireEvent.blur(widthField(), { relatedTarget: heightField() });
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    expect(document.body.textContent ?? '').toMatch(/width must be between 10 and 100 in/);
    await pressEnter(heightField());
    expect(dialog(/Change poster to 48 × 30 in/)).not.toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(/must be between 10 and 100 in/);
  });
});
