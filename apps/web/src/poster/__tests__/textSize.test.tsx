/**
 * Record 33 — text size, one control for the whole poster: [A−] Body 36 pt
 * [A+] in the editor's top bar (docs/fixes/33-text-size.md; the MVP design
 * doc docs/launch/mvp-editor/bounded-designs.md §3.7).
 *
 * Every test enters where the user does: a click on the top bar's
 * "Decrease text size" / "Increase text size", Enter or Space on them, the
 * top bar's Undo and Redo, the Style tab's size field, typing at the caret.
 * The store is read, never called. What layout gives (the sizes drawn on
 * the sheet, the print document, the PowerPoint file, the top bar at 1024
 * and 1280 px, the caret in three engines) is measured in the browser by
 * scripts/text-size-check.mjs.
 *
 * Re-run: npx vitest run src/poster/__tests__/textSize.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { PosterDoc, Styles } from '@postr/shared';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
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

import { usePosterStore } from '@/stores/posterStore';
import { DEFAULT_STYLES } from '../constants';
import { makeDoc, typeKeystrokes } from './editorKit';
import {
  NoopResizeObserver,
  canvasEditor,
  clickToEnd,
  installContentEditableShim,
  installExecCommandShim,
  leave,
  load,
  nextTask,
  openTab,
  press,
  pressButtonByKey,
  renderEditor,
  selectedBlocks,
  storedText,
  typeText,
} from './undoKit';

const PT = 7.2;
const state = () => usePosterStore.getState();
const styles = () => state().doc!.styles;
const pt = (k: keyof Styles) => styles()[k].size * PT;
const sizes = () => (['title', 'heading', 'authors', 'body'] as const).map((k) => styles()[k].size);

/** A poster whose levels are stored as the Style tab stores a size typed in points (pt ÷ 7.2); `null` keeps the default. */
function docWith(pts: Partial<Record<keyof Styles, number>> = {}): PosterDoc {
  const base = makeDoc();
  const st = Object.fromEntries(
    (Object.keys(DEFAULT_STYLES) as Array<keyof Styles>).map((k) => [k, { ...DEFAULT_STYLES[k], size: pts[k] !== undefined ? pts[k]! / PT : DEFAULT_STYLES[k].size }]),
  ) as Styles;
  return { ...base, styles: st };
}

const bar = () => document.querySelector<HTMLElement>('[data-postr-editor-topbar]')!;
const sizeButton = (name: 'Increase text size' | 'Decrease text size') =>
  bar().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const up = () => sizeButton('Increase text size')!;
const down = () => sizeButton('Decrease text size')!;
const isOff = (b: HTMLButtonElement) => b.disabled || b.getAttribute('aria-disabled') === 'true';
/** The text the user reads between A− and A+. */
function label(): string {
  const r = document.createRange();
  r.setStartAfter(down());
  r.setEndBefore(up());
  return (r.toString() ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A mouse press as a browser runs it: mousedown, whose default action moves
 * the focus to the button (Chromium and Firefox) unless the page prevents
 * it, then mouseup and a click with a click count of 1.
 */
async function mousePress(button: HTMLElement) {
  const notPrevented = fireEvent.mouseDown(button, { detail: 1 });
  if (notPrevented) button.focus();
  fireEvent.mouseUp(button, { detail: 1 });
  fireEvent.click(button, { detail: 1 });
  await nextTask();
}
const clickUp = () => mousePress(up());
const clickDown = () => mousePress(down());
const undoButton = () => screen.getByRole('button', { name: 'Undo' });
const redoButton = () => screen.getByRole('button', { name: 'Redo' });

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rule 1 — the top bar shows [A−] Body 36 pt [A+]', () => {
  it('between Redo and Save PDF, named, titled, with the body in whole pt', async () => {
    load(docWith());
    renderEditor();
    await nextTask();
    expect(sizeButton('Decrease text size'), 'A− in the top bar').not.toBeNull();
    expect(sizeButton('Increase text size'), 'A+ in the top bar').not.toBeNull();
    const names = [...bar().querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim());
    expect(names).toEqual(['Undo', 'Redo', 'Decrease text size', 'Increase text size', 'Save PDF']);
    expect(label()).toBe('Body 36 pt');
    expect(up().title).toMatch(/40 pt/);
    expect(down().title).toMatch(/32 pt/);
  });

  it('a body set by hand shows in whole pt, never "Custom"', async () => {
    load(docWith({ body: 34.4 }));
    renderEditor();
    await nextTask();
    expect(label()).toBe('Body 34 pt');
  });
});

describe('rule 2 — the body moves to the next of 28 · 32 · 36 · 40 · 44 · 48 pt', () => {
  it('A+ from 36 pt is 40 pt, A− from 36 pt is 32 pt (each press on a fresh poster)', async () => {
    load(docWith());
    const view = renderEditor();
    await clickUp();
    expect(pt('body')).toBeCloseTo(40, 9);
    expect(label()).toBe('Body 40 pt');
    view.unmount();
    load(docWith());
    renderEditor();
    await clickDown();
    expect(pt('body')).toBeCloseTo(32, 9);
    expect(label()).toBe('Body 32 pt');
  });

  it.each([
    [34, 36, 32],
    [30, 32, 28],
    [24, 28, null],
    [52, null, 48],
    [48, null, 44],
    [28, 32, null],
  ])('a body of %s pt: A+ → %s, A− → %s', async (start, above, below) => {
    for (const [press, want] of [[clickUp, above], [clickDown, below]] as const) {
      load(docWith({ body: start }));
      const view = renderEditor();
      const b = press === clickUp ? up() : down();
      if (want === null) {
        expect(isOff(b), 'disabled at the bound').toBe(true);
        expect(b.title).toMatch(press === clickUp ? /48 pt/ : /28 pt/);
        const before = sizes();
        await press();
        expect(sizes(), 'a disabled button changes nothing').toEqual(before);
        expect(state().canUndo, 'and adds no undo step').toBe(false);
      } else {
        expect(isOff(b)).toBe(false);
        await press();
        expect(pt('body')).toBeCloseTo(want, 9);
        expect(label()).toBe(`Body ${want} pt`);
      }
      view.unmount();
    }
  });
});

// A body that is not a size (0, which the Style tab's Body field stores
// when it is cleared; a negative number, null or a string, which only a
// stored poster holds) is below every size (rule 2): the label shows no
// number, A+ sets the body to 28 pt and leaves the other levels (there is
// no ratio to keep), A− is greyed. Review round 1, R1-F1.
describe('a body that is not a size (rule 2: below every size)', () => {
  const styleFields = () => [...document.querySelectorAll<HTMLInputElement>('input[type="number"][title="Font size (points)"]')];

  it('the Style tab’s Body field cleared: no number in the label, A+ says 28 pt and gives it, A− greyed and says why; one Undo restores', async () => {
    load(docWith());
    renderEditor();
    openTab(/^style$/i);
    await nextTask();
    const before = sizes();
    // Select all and Backspace: the number field's value is '' (stored as 0).
    await typeKeystrokes(styleFields()[3]!, ['']);
    expect(styles().body.size, 'the cleared field stores 0').toBe(0);
    expect(label()).toBe('Body – pt');
    expect(isOff(up()), 'A+ enabled').toBe(false);
    expect(up().title).toBe('Increase text size (body to 28 pt)');
    expect(isOff(down()), 'A− greyed').toBe(true);
    expect(down().title).toBe('No body size: A+ sets the body to 28 pt');
    const cleared = sizes();
    await clickDown();
    expect(sizes(), 'A− there changes nothing').toEqual(cleared);
    await clickUp();
    expect(pt('body')).toBeCloseTo(28, 9);
    expect(sizes().slice(0, 3), 'title, heading and authors as they were').toEqual(before.slice(0, 3));
    expect(label()).toBe('Body 28 pt');
    expect(styleFields()[3]!.value, 'the Style tab’s field follows').toBe('28');
    fireEvent.click(undoButton());
    await nextTask();
    expect(sizes(), 'one Undo: the cleared body again').toEqual(cleared);
  });

  it.each([
    ['null', null],
    ['a string', '5'],
    ['a negative number', -5],
  ])('a stored body of %s: the control shows, A+ sets 28 pt and leaves the other levels', async (_name, value) => {
    const d = docWith();
    load({ ...d, styles: { ...d.styles, body: { ...d.styles.body, size: value as unknown as number } } });
    renderEditor();
    await nextTask();
    expect(sizeButton('Increase text size'), 'A+ in the top bar').not.toBeNull();
    expect(label()).toBe('Body – pt');
    expect(up().title).toBe('Increase text size (body to 28 pt)');
    expect(isOff(down())).toBe(true);
    const before = sizes();
    await clickUp();
    expect(pt('body')).toBeCloseTo(28, 9);
    expect(sizes().slice(0, 3)).toEqual(before.slice(0, 3));
    expect(label()).toBe('Body 28 pt');
  });

  it('a stored level that is not a size (a title of null) is left as it is; the other levels move', async () => {
    const d = docWith();
    load({ ...d, styles: { ...d.styles, title: { ...d.styles.title, size: null as unknown as number } } });
    renderEditor();
    await clickUp();
    expect(styles().title.size, 'not written as 0').toBeNull();
    expect(pt('body')).toBeCloseTo(40, 9);
    expect(pt('heading')).toBeCloseTo((57.6 * 40) / 36, 9);
    await clickDown();
    await clickDown();
    expect(styles().title.size).toBeNull();
    expect(pt('body')).toBeCloseTo(32, 9);
    expect(pt('heading')).toBeCloseTo((57.6 * 32) / 36, 9);
  });
});

describe('rule 3 — the other levels keep their ratio to the body, and a round trip is exact', () => {
  it('title, heading and authors are multiplied by new body ÷ old body, not rounded; nothing else changes', async () => {
    load(docWith({ title: 101, heading: 58, authors: 33 }));
    renderEditor();
    const before = styles();
    await clickUp();
    expect(pt('title')).toBeCloseTo((101 * 40) / 36, 9);
    expect(pt('heading')).toBeCloseTo((58 * 40) / 36, 9);
    expect(pt('authors')).toBeCloseTo((33 * 40) / 36, 9);
    expect(pt('title') % 1, 'not rounded to a whole point').not.toBeCloseTo(0, 3);
    for (const k of ['title', 'heading', 'authors', 'body'] as const) {
      const { size: _a, ...rest } = styles()[k];
      const { size: _b, ...was } = before[k];
      expect(rest, `${k}: weight, italic, line height, colours untouched`).toEqual(was);
    }
  });

  // Every start: the default poster, a body on each size with the default
  // ratios, between sizes, outside them, the welcome poster's 146 pt title
  // and ratios set level by level. From each, A+ to the top, A− to the
  // bottom and A+ back: every size reached again holds exactly what it held.
  const STARTS: Array<[string, Partial<Record<keyof Styles, number>>]> = [
    ['default', {}],
    ...[28, 32, 40, 44, 48].map((b): [string, Partial<Record<keyof Styles, number>>] => [`body ${b}`, { body: b }]),
    ['body 34', { body: 34 }],
    ['body 24', { body: 24 }],
    ['body 52', { body: 52 }],
    ['welcome title 146', { title: 146 }],
    ['hand 90/64/28/40', { title: 90, heading: 64, authors: 28, body: 40 }],
    ['hand 101/58/33/30', { title: 101, heading: 58, authors: 33, body: 30 }],
  ];
  it.each(STARTS)('exact round trips from %s', async (_name, pts) => {
    load(docWith(pts));
    renderEditor();
    const seen = new Map<number, number[]>();
    const rung = () => Math.round(pt('body'));
    const visit = () => {
      const k = rung();
      if (seen.has(k)) expect(sizes(), `back at ${k} pt`).toEqual(seen.get(k));
      else seen.set(k, sizes());
    };
    const start = pt('body');
    if ([28, 32, 36, 40, 44, 48].some((s) => Math.abs(s - start) < 1e-9)) visit();
    let first: number | null = null;
    // Six sizes: a bound is reached within six presses (bounded, so a
    // press that moves nowhere fails instead of looping).
    for (let i = 0; i < 8 && !isOff(up()); i += 1) { await clickUp(); first ??= rung(); visit(); }
    expect(isOff(up()), 'A+ reaches the top within six presses').toBe(true);
    for (let i = 0; i < 8 && !isOff(down()); i += 1) { await clickDown(); first ??= rung(); visit(); }
    expect(isOff(down()), 'A− reaches the bottom within six presses').toBe(true);
    const home = seen.has(Math.round(start)) ? Math.round(start) : first!;
    for (let i = 0; i < 8 && rung() < home; i += 1) { await clickUp(); visit(); }
    expect(rung()).toBe(home);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('rule 4 — one press is one undo step', () => {
  it('one Undo (the top bar’s) puts all four levels back exactly; Redo re-applies them', async () => {
    load(docWith({ title: 101 }));
    renderEditor();
    const start = sizes();
    await clickUp();
    const after = sizes();
    expect(after).not.toEqual(start);
    fireEvent.click(undoButton());
    await nextTask();
    expect(sizes()).toEqual(start);
    expect(state().canUndo).toBe(false);
    fireEvent.click(redoButton());
    await nextTask();
    expect(sizes()).toEqual(after);
  });

  it('two quick presses are two undo steps, not one', async () => {
    load(docWith());
    renderEditor();
    const start = sizes();
    await clickUp();
    const once = sizes();
    await clickUp();
    expect(pt('body')).toBeCloseTo(44, 9);
    fireEvent.click(undoButton());
    await nextTask();
    expect(sizes(), 'one Undo: back to the first press').toEqual(once);
    fireEvent.click(undoButton());
    await nextTask();
    expect(sizes()).toEqual(start);
  });

  it('a mouse press with the caret in text keeps the caret there, and the typing steps whole', async () => {
    load(docWith());
    renderEditor();
    const ed = canvasEditor('b1');
    const was = storedText('b1');
    const start = sizes();
    await clickToEnd(ed);
    await typeText(ed, ' ZQab');
    await clickUp();
    expect(document.activeElement, 'the press did not take the focus from the text').toBe(canvasEditor('b1'));
    const raised = sizes();
    expect(raised).not.toEqual(start);
    await typeText(canvasEditor('b1'), 'cd');
    expect(storedText('b1')).toBe(`${was} ZQabcd`);
    fireEvent.click(undoButton());
    await nextTask();
    expect([storedText('b1'), sizes()], 'Undo 1: the letters after the press').toEqual([`${was} ZQab`, raised]);
    fireEvent.click(undoButton());
    await nextTask();
    expect([storedText('b1'), sizes()], 'Undo 2: the press').toEqual([`${was} ZQab`, start]);
    fireEvent.click(undoButton());
    await nextTask();
    // The word goes in one step; the space before it is a step of its own
    // (fix 12: a step per typed word).
    expect(storedText('b1'), 'Undo 3: the word typed before the press, whole').toBe(`${was} `);
    fireEvent.click(undoButton());
    await nextTask();
    expect(storedText('b1')).toBe(was);
  });

  it('pressed from the keyboard the focus stays on the button, and keys pressed there never reach a selected block', async () => {
    load(docWith());
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQ');
    await leave();
    expect(selectedBlocks(), 'b1 still selected, as after Tab from the text').toEqual(['b1']);
    const places = () => state().doc!.blocks.map((b) => `${b.id}@${b.x},${b.y}`).join(' ');
    const before = places();
    await pressButtonByKey(up(), 'Enter');
    expect(pt('body')).toBeCloseTo(40, 9);
    expect(document.activeElement).toBe(up());
    await pressButtonByKey(up(), ' ');
    expect(pt('body')).toBeCloseTo(44, 9);
    for (const init of [{ key: 'ArrowDown' }, { key: 'ArrowRight' }, { key: 'Backspace' }, { key: 'Delete' }, { key: 'd', metaKey: true }]) {
      await press(up(), init);
      await press(down(), init);
    }
    expect(places(), 'no block moved, removed or copied').toBe(before);
    expect(storedText('b1')).toMatch(/ ZQ$/);
  });
});

describe('rule 5 — the Style tab’s size field changes one level, and A± keeps its ratio', () => {
  it('title typed as 120 pt changes the title only; A+ then gives 120 × 40 ÷ 36', async () => {
    load(docWith());
    renderEditor();
    openTab(/^style$/i);
    await nextTask();
    const fields = [...document.querySelectorAll<HTMLInputElement>('input[type="number"][title="Font size (points)"]')];
    expect(fields).toHaveLength(4);
    const before = sizes();
    await typeKeystrokes(fields[0]!, ['1', '12', '120']);
    expect(pt('title')).toBeCloseTo(120, 9);
    expect(sizes().slice(1), 'heading, authors, body unchanged').toEqual(before.slice(1));
    await clickUp();
    expect(pt('title')).toBeCloseTo((120 * 40) / 36, 9);
    expect(pt('heading')).toBeCloseTo((57.6 * 40) / 36, 9);
    expect(pt('body')).toBeCloseTo(40, 9);
  });
});

describe('rule 6 — the Edit tab names the top bar’s control', () => {
  it('a text block’s note says A− / A+ in the top bar change every level, the Style tab one', async () => {
    load(docWith());
    renderEditor();
    await clickToEnd(canvasEditor('b1'));
    openTab(/^edit block$/i);
    await nextTask();
    const side = document.querySelector('[data-postr-sidebar]')!.textContent ?? '';
    expect(side).toMatch(/A− \/ A\+ in the top bar/);
    expect(side).toMatch(/Style tab, under Typography/);
  });
});

describe('rule 8 — the PDF follows the new sizes', () => {
  it('after A+, the top bar’s Save PDF writes the new sizes', async () => {
    const written: string[] = [];
    vi.stubGlobal('open', vi.fn(() => ({
      document: { open: vi.fn(), write: (s: string) => { written.push(s); }, close: vi.fn() },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(), addEventListener: vi.fn(),
    })));
    load(docWith());
    renderEditor();
    await clickUp();
    fireEvent.click(bar().querySelector('[data-postr-topbar-print]')!);
    await nextTask();
    const html = written.join('');
    const sheet = new DOMParser().parseFromString(html, 'text/html');
    const size = (type: string) => sheet.querySelector<HTMLElement>(`[data-block-type="${type}"] [contenteditable]`)?.style.fontSize;
    expect(parseFloat(size('title')!)).toBeCloseTo(styles().title.size, 9);
    expect(parseFloat(size('text')!)).toBeCloseTo(40 / PT, 9);
  });
});
