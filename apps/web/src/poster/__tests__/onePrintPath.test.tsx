/**
 * Record 30 — one print path (docs/fixes/30-one-print-path.md; the MVP
 * design doc §3.10 and §5.1 blockers 4 and 7).
 *
 * Every way the editor offers to print calls one function and writes the
 * same document: the Export tab's "⎙ Save PDF", the top bar's "Save PDF",
 * Preview's "Print / Save PDF" and ⌘P / Ctrl+P. The selection is cleared
 * first; a blocked window shows today's alert and changes nothing else.
 *
 * Entry points are the user's: the buttons and the keys. jsdom lays nothing
 * out, so the browser's part is played here: the title's frame is 120 units
 * tall when shown (60 more than stored: a long title wrapped), 0 when an
 * ancestor is `display: none` (Preview hides the editor that way), one more
 * while selected (its 1.5 px border); and the ResizeObserver reports the
 * title's new size when the test says the browser would. What layout itself
 * gives (every block's box and line in print against the editor) is measured
 * in the browser by scripts/print-path-check.mjs.
 *
 * Re-run: npx vitest run src/poster/__tests__/onePrintPath.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosterDoc } from '@postr/shared';

vi.mock('@/lib/supabase', () => {
  const chain = {
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: () => ({ select: () => chain }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    },
  };
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
// The thumbnail's drawing step: what it is handed is the copy it would draw
// (review round 2, R2-F1's sibling: autosave copies the sheet while editing).
const drawn: string[] = [];
vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(async (node: HTMLElement) => {
    drawn.push(node.outerHTML);
    throw new Error('not drawn in jsdom');
  }),
}));

type Kit = typeof import('./editorKit');
type Rtl = typeof import('@testing-library/react');
let k: Kit;
let rtl: Rtl;
let view: { unmount: () => void } | null = null;

const TITLE_STORED = 60;
const TITLE_SHOWN = 120;
const SHIFT = TITLE_SHOWN - TITLE_STORED;
const ALERT = 'Popup blocked. Please allow popups for this site to use "Save PDF".';

// ── The browser's layout, played ─────────────────────────────────────
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
function playTitleLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.getAttribute('data-block-type') !== 'title') return 0;
      for (let n: HTMLElement | null = this; n; n = n.parentElement) if (n.style.display === 'none') return 0;
      return TITLE_SHOWN + (this.getAttribute('data-postr-selected') === 'true' ? 1 : 0);
    },
  });
}
const observers: Array<{ cb: ResizeObserverCallback; els: Set<Element>; self: unknown }> = [];
class PlayedObserver {
  private entry: { cb: ResizeObserverCallback; els: Set<Element>; self: unknown };
  constructor(cb: ResizeObserverCallback) {
    this.entry = { cb, els: new Set(), self: this };
    observers.push(this.entry);
  }
  observe(el: Element) { this.entry.els.add(el); }
  unobserve(el: Element) { this.entry.els.delete(el); }
  disconnect() { this.entry.els.clear(); }
}
/** The browser reports the title frame's size (after it was hidden, shown, selected). */
async function titleResized() {
  const el = frame('t1');
  await rtl.act(async () => {
    for (const o of observers) {
      if (!o.els.has(el)) continue;
      const h = el.offsetHeight;
      const box = { width: 440, height: h, x: 0, y: 0, top: 0, left: 0, right: 440, bottom: h, toJSON: () => ({}) };
      o.cb([{ target: el, contentRect: box, borderBoxSize: [{ inlineSize: 440, blockSize: h }], contentBoxSize: [{ inlineSize: 440, blockSize: h }], devicePixelContentBoxSize: [] }] as unknown as ResizeObserverEntry[], o.self as ResizeObserver);
    }
  });
}

// ── The print window, stubbed: what each window is written ───────────
let windows: string[] = [];
let openSpy: ReturnType<typeof vi.fn>;
function stubWindows({ blocked = false } = {}) {
  windows = [];
  openSpy = vi.fn(() => {
    if (blocked) return null;
    const i = windows.push('') - 1;
    return { document: { open: vi.fn(), write: (s: string) => { windows[i] += s; }, close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
  });
  vi.stubGlobal('open', openSpy);
}
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const topIn = (html: string, id: string) => parse(html).querySelector<HTMLElement>(`[data-block-id="${id}"]`)!.style.top;
/** The sheet the window was written, its markup (the toolbar and the rest are the same function's). */
const sheetOf = (html: string) => parse(html).getElementById('poster-canvas')!.outerHTML;
/** The written document's `@page` size. */
const pageSizeOf = (html: string) => /@page\s*{\s*size:\s*([^;]+);/.exec(html)?.[1];

/** A 3 × 3 table block, `tb1`, under the second text column (review round 2, R2-F1). */
const TABLE = {
  id: 'tb1', type: 'table', x: 250, y: 240, w: 210, h: 80, content: '', imageSrc: null, imageFit: 'contain',
  tableData: { rows: 3, cols: 3, colWidths: null, borderPreset: 'apa', cells: ['Group', 'n', 'Mean', 'A', '12', '4.1', 'B', '14', '3.8'] },
};

async function openPoster({ mac = false, table = false }: { mac?: boolean; table?: boolean } = {}) {
  view?.unmount();
  view = null;
  Object.defineProperty(navigator, 'platform', { configurable: true, value: mac ? 'MacIntel' : 'Win32' });
  vi.resetModules();
  k = await import('./editorKit');
  rtl = await import('@testing-library/react');
  const { usePosterStore } = await import('@/stores/posterStore');
  const made = k.makeDoc() as PosterDoc;
  const doc = (table ? { ...made, blocks: [...made.blocks, TABLE] } : made) as PosterDoc;
  usePosterStore.getState().setPoster('fixture-1', doc, k.NAME);
  view = k.renderEditor();
  await k.nextTask();
}
const frame = (id: string) => k.q<HTMLElement>(`#poster-canvas [data-block-id="${id}"]`);
const selected = () => document.querySelectorAll('#poster-canvas [data-postr-selected="true"]').length;
const previewOpen = () => document.querySelector('[data-postr-preview]') !== null;
const button = (name: RegExp) => [...document.querySelectorAll('button')].find((b) => name.test((b.textContent ?? '').trim()));

async function exportSavePdf() {
  k.openTab(/^export$/i);
  await k.nextTask();
  await k.click(button(/^⎙ Save PDF$/), 'Export › ⎙ Save PDF');
}
async function topBarSavePdf() {
  await k.click(document.querySelector('[data-postr-editor-topbar] [data-postr-topbar-print]'), 'the top bar’s Save PDF');
}
async function openPreview() {
  k.openTab(/^export$/i);
  await k.nextTask();
  await k.click(button(/Preview poster/), 'Export › Preview poster');
}
async function previewPrint() {
  await k.click(button(/^Print \/ Save PDF$/), 'Preview › Print / Save PDF');
}
/** ⌘P or Ctrl+P pressed with the focus on `on`; returns whether the default was prevented. */
async function pressP(on: Element, mods: Partial<KeyboardEventInit>) {
  let notPrevented = true;
  await rtl.act(async () => {
    notPrevented = rtl.fireEvent.keyDown(on, { key: 'p', code: 'KeyP', ...mods });
  });
  await k.nextTask();
  return !notPrevented;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', PlayedObserver);
  playTitleLayout();
});
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
});

describe('record 30, cause A — Preview prints, and draws, the title’s shift (OF-07)', () => {
  it('Print / Save PDF from Preview writes the blocks under a wrapped title where Save PDF does', async () => {
    stubWindows();
    await openPoster();
    await titleResized();
    expect(frame('b1').style.top, 'precondition: the editor pushes the body down by the title’s overflow').toBe(`${140 + SHIFT}px`);
    await exportSavePdf();
    expect(topIn(windows[0]!, 'b1')).toBe(`${140 + SHIFT}px`);

    await openPreview();
    // Hidden, the title measures 0, and the browser says so.
    await titleResized();
    const overlayFrame = document.querySelector<HTMLElement>('[data-postr-preview] [data-block-id="b1"]')!;
    expect(overlayFrame.style.top, 'Preview draws the body under the title, as the editor does').toBe(`${140 + SHIFT}px`);
    await previewPrint();
    expect(windows).toHaveLength(2);
    expect(topIn(windows[1]!, 'b1'), 'printed from Preview: the body under the title').toBe(`${140 + SHIFT}px`);
    expect(sheetOf(windows[1]!)).toBe(sheetOf(windows[0]!));
    expect(previewOpen(), 'printing leaves Preview').toBe(false);
  });
});

describe('record 30, cause C — the selection is cleared before the sheet is copied', () => {
  it('a selected title prints the unselected title’s shift, and the editor keeps no selection', async () => {
    stubWindows();
    await openPoster();
    await titleResized();
    await exportSavePdf();
    const unselected = windows[0]!;
    await rtl.act(async () => {
      rtl.fireEvent.click(frame('t1'));
    });
    await k.nextTask();
    expect(selected(), 'precondition: the title is selected').toBe(1);
    // Selected, its border is half a unit wider each side: a unit taller.
    await titleResized();
    expect(frame('b1').style.top).toBe(`${140 + SHIFT + 1}px`);
    await exportSavePdf();
    expect(selected(), 'the editor has nothing selected after printing').toBe(0);
    const printed = parse(windows[1]!);
    expect(printed.querySelectorAll('[data-postr-selected="true"]').length, 'no selected frame in the print').toBe(0);
    expect(topIn(windows[1]!, 'b1')).toBe(`${140 + SHIFT}px`);
    // Printed a moment after the click: the selection's pop (a scale from
    // 1.04 to 1 over 0.22 s) is still running here (jsdom's clock barely
    // moves), and the copy must not carry it.
    const title = printed.querySelector<HTMLElement>('[data-block-id="t1"]')!;
    const scales = [...title.style.transform.matchAll(/scale\(([^,)]+)/g)].map((m) => Number(m[1]));
    expect(scales.every((v) => v === 1), `the title's transform "${title.style.transform}"`).toBe(true);
    expect(parse(unselected).querySelector<HTMLElement>('[data-block-id="t1"]')!.style.transform).toBe('');
  });
});

describe('record 30, cause D — one print function from every entry', () => {
  it('the top bar’s Save PDF writes the Export tab’s document', async () => {
    stubWindows();
    await openPoster();
    await titleResized();
    await exportSavePdf();
    await topBarSavePdf();
    expect(windows).toHaveLength(2);
    expect(windows[1]).toBe(windows[0]);
  });

  it('Ctrl+P (not a Mac), with the caret in a block’s text, writes the same document and stops the browser’s own print', async () => {
    stubWindows();
    await openPoster();
    await titleResized();
    await exportSavePdf();
    const text = frame('b1').querySelector('[contenteditable]')!;
    expect(await pressP(text, { ctrlKey: true })).toBe(true);
    expect(windows).toHaveLength(2);
    expect(windows[1]).toBe(windows[0]);
  });

  it('on a Mac ⌘P prints and Ctrl+P is left to the system (it moves the caret in text)', async () => {
    stubWindows();
    await openPoster({ mac: true });
    await titleResized();
    const text = frame('b1').querySelector('[contenteditable]')!;
    expect(await pressP(text, { ctrlKey: true }), 'Ctrl+P on a Mac: not ours').toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(await pressP(document.body, { metaKey: true })).toBe(true);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('Shift or Alt with it is the browser’s; a held key prints once; in a composition or with a dialog open nothing prints', async () => {
    stubWindows();
    await openPoster();
    expect(await pressP(document.body, { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(await pressP(document.body, { ctrlKey: true, altKey: true })).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(await pressP(document.body, { ctrlKey: true, repeat: true }), 'a repeat is still kept from the browser').toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    // Inside an input method's composition nothing prints, and the browser's
    // own print of the editor page is still kept away (review round 2,
    // R2-F3: the key's default was left to run there; Chromium delivers it
    // with isComposing set, measured by print-path-check.mjs key+composing).
    expect(await pressP(document.body, { ctrlKey: true, isComposing: true }), 'the browser does not print the editor').toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    // A dialog: Layout › a size preset asks "Change poster to …?".
    k.openTab(/^layout$/i);
    await k.nextTask();
    await k.choosePreset('36×48');
    expect(k.dialog(/Change poster to/), 'precondition: a dialog asks').not.toBeNull();
    expect(await pressP(document.body, { ctrlKey: true }), 'the browser does not print the editor either').toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('after Layout › 36×48 › Change size, Ctrl+P prints the new size, also while the answered dialog fades out', async () => {
    // Review round 1 (R1-F1, R1-F6): the key must call the print function
    // of the poster as it is now, not of the first render (a stale one
    // wrote a 48 × 36 in page for a 36 × 48 in poster in the browser), and
    // a dialog already answered (fading out, data-state="closing") must
    // not hold the key.
    stubWindows();
    await openPoster();
    k.openTab(/^layout$/i);
    await k.nextTask();
    await k.choosePreset('36×48');
    const box = k.dialog(/Change poster to/);
    expect(box, 'precondition: a dialog asks').not.toBeNull();
    // The dialog's 140 ms fade held on a fake clock, so the key lands in it
    // however slow the machine is.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      rtl.act(() => {
        rtl.fireEvent.click(k.confirmButton(box!)!);
      });
      expect([k.doc().widthIn, k.doc().heightIn], 'precondition: the poster is 36 × 48 in').toEqual([36, 48]);
      expect(document.querySelector('[data-postr-modal-content][data-state="closing"]'), 'precondition: the dialog is fading out').not.toBeNull();
      let notPrevented = true;
      rtl.act(() => {
        notPrevented = rtl.fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP', ctrlKey: true });
      });
      expect(notPrevented, 'the browser’s own print is kept away').toBe(false);
      expect(windows).toHaveLength(1);
      expect(pageSizeOf(windows[0]!)).toBe('36in 48in');
      rtl.act(() => {
        vi.advanceTimersByTime(200);
      });
    } finally {
      vi.useRealTimers();
    }
    await k.nextTask();
    // And once the dialog has gone.
    expect(document.querySelector('[data-postr-modal-content]'), 'precondition: the dialog has gone').toBeNull();
    expect(await pressP(document.body, { ctrlKey: true })).toBe(true);
    expect(windows).toHaveLength(2);
    expect(pageSizeOf(windows[1]!)).toBe('36in 48in');
  });

  it('a key handler inside the editor that stops the key does not stop Ctrl+P', async () => {
    // Review round 1 (R1-F6): the shortcut listens at the window in the
    // capture phase, before any handler on the page. No handler in the
    // editor stops a key today (grep, record 30 §9); this guards one added
    // later, which would otherwise hand ⌘P back to the browser's own print.
    stubWindows();
    await openPoster();
    const text = frame('b1').querySelector('[contenteditable]')!;
    text.addEventListener('keydown', (e) => e.stopPropagation());
    expect(await pressP(text, { ctrlKey: true })).toBe(true);
    expect(windows).toHaveLength(1);
  });

  it('Ctrl+P in Preview prints the same document and leaves Preview', async () => {
    stubWindows();
    await openPoster();
    await titleResized();
    await exportSavePdf();
    await openPreview();
    await titleResized();
    expect(await pressP(document.body, { ctrlKey: true })).toBe(true);
    expect(windows).toHaveLength(2);
    expect(sheetOf(windows[1]!)).toBe(sheetOf(windows[0]!));
    expect(previewOpen()).toBe(false);
  });
});

describe('record 30, review round 2 (R2-F1) — the table’s own controls are not printed', () => {
  /** The table's controls in a written document: its buttons, role="button" strips and titled grips. */
  const tableControlsIn = (html: string) =>
    [...parse(html).querySelectorAll('[data-block-id="tb1"] :is(button, [role="button"], [title])')].map(
      (el) => el.getAttribute('title') || el.getAttribute('aria-label') || el.tagName,
    );
  /** The active cell's grey row and column bands (#9ca3af at 9 %) in a sheet. */
  const bandsIn = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLElement>('[data-block-id="tb1"] div')].filter((el) => /9ca3af18|156, 163, 175, 0\.09/.test(el.getAttribute('style') ?? '')).length;

  it('⌘P with the caret in the last cell and the pointer resting on it prints no "+" bar, strip, grip or band', async () => {
    // The user clicks into the table's last cell, the pointer stays on it
    // (its "Add row" and "Add column" bars show, the active cell's bands
    // too) and presses the key: the only entry that copies the sheet with
    // the pointer still on the table.
    stubWindows();
    await openPoster({ table: true });
    const cells = [...frame('tb1').querySelectorAll('td')];
    const last = cells[8]!;
    const editable = last.querySelector('[contenteditable]')!;
    await rtl.act(async () => {
      rtl.fireEvent.click(editable);
      rtl.fireEvent.focus(editable);
      rtl.fireEvent.mouseEnter(last);
    });
    await k.nextTask();
    expect(selected(), 'precondition: the table is selected').toBe(1);
    expect(frame('tb1').querySelector('button[title="Add column"]'), 'precondition: the editor shows the "Add column" bar').not.toBeNull();
    expect(frame('tb1').querySelector('button[title="Add row"]'), 'precondition: the editor shows the "Add row" bar').not.toBeNull();
    expect(bandsIn(document), 'precondition: the active cell’s bands show').toBe(2);
    expect(await pressP(editable, { ctrlKey: true })).toBe(true);
    expect(windows).toHaveLength(1);
    expect(tableControlsIn(windows[0]!)).toEqual([]);
    expect(bandsIn(parse(windows[0]!))).toBe(0);
    expect(parse(windows[0]!).querySelectorAll('[data-block-id="tb1"] td').length, 'the table itself is printed').toBe(9);
  });

  it('⌘P with the pointer on a row strip prints no tinted strip', async () => {
    stubWindows();
    await openPoster({ table: true });
    const editable = frame('tb1').querySelectorAll('td [contenteditable]')[4]!;
    await rtl.act(async () => {
      rtl.fireEvent.click(editable);
    });
    await k.nextTask();
    const strip = frame('tb1').querySelector<HTMLElement>('[role="button"][aria-label="Select row 2"]')!;
    await rtl.act(async () => {
      rtl.fireEvent.mouseEnter(strip);
    });
    expect(strip.style.backgroundColor, 'precondition: the strip is tinted under the pointer').not.toBe('transparent');
    expect(await pressP(document.body, { ctrlKey: true })).toBe(true);
    expect(tableControlsIn(windows[0]!)).toEqual([]);
  });

  it('Save PDF with the table not selected prints none of its controls either', async () => {
    stubWindows();
    await openPoster({ table: true });
    await exportSavePdf();
    expect(tableControlsIn(windows[0]!)).toEqual([]);
  });

  it('the dashboard thumbnail, taken while the caret is in a cell, draws none of them either', async () => {
    // Autosave captures the thumbnail from a copy of the sheet as it is,
    // the selection and the caret kept (data/thumbnails.ts): the same
    // copy-cleaning as the print, with the active cell's bands still on.
    await openPoster({ table: true });
    const cells = [...frame('tb1').querySelectorAll('td')];
    const editable = cells[8]!.querySelector('[contenteditable]')!;
    await rtl.act(async () => {
      rtl.fireEvent.click(editable);
      rtl.fireEvent.focus(editable);
      rtl.fireEvent.mouseEnter(cells[8]!);
    });
    await k.nextTask();
    expect(bandsIn(document), 'precondition: the active cell’s bands show').toBe(2);
    const { capturePosterJpeg } = await vi.importActual<typeof import('@/data/thumbnails')>('@/data/thumbnails');
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.id === 'poster-canvas' ? 480 : 0; } });
    drawn.length = 0;
    try {
      await capturePosterJpeg({ targetWidthPx: 400, quality: 0.8 });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    }
    expect(drawn, 'the copy reached the drawing step').toHaveLength(1);
    expect(tableControlsIn(drawn[0]!)).toEqual([]);
    expect(bandsIn(parse(drawn[0]!))).toBe(0);
  });
});

describe('record 30 — a blocked window: today’s alert, and nothing else changes', () => {
  it('shows the alert word for word from every entry, keeping Preview and the selection', async () => {
    stubWindows({ blocked: true });
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    await openPoster();
    await exportSavePdf();
    await topBarSavePdf();
    await rtl.act(async () => {
      rtl.fireEvent.click(frame('b1'));
    });
    await k.nextTask();
    expect(await pressP(document.body, { ctrlKey: true })).toBe(true);
    expect(selected(), 'the selection stays when nothing printed').toBe(1);
    await openPreview();
    await previewPrint();
    expect(previewOpen(), 'Preview stays open when nothing printed').toBe(true);
    expect(alertSpy.mock.calls.map((c) => c[0])).toEqual([ALERT, ALERT, ALERT, ALERT]);
  });
});

describe('record 30 — the Export tab says one line; the print window holds the steps', () => {
  it('the Export tab has the one line and no list of dialog steps', async () => {
    await openPoster();
    k.openTab(/^export$/i);
    await k.nextTask();
    const save = button(/^⎙ Save PDF$/)!;
    const next = save.nextElementSibling as HTMLElement;
    expect(next.textContent?.trim()).toBe('Your browser’s print window opens. Choose Save as PDF.');
    let panel: HTMLElement | null = save.parentElement;
    while (panel && !/Editable formats/.test(panel.textContent ?? '')) panel = panel.parentElement;
    expect(panel?.textContent ?? '').not.toMatch(/Background graphics|Margins|Destination/);
    expect(panel?.querySelectorAll('ol').length ?? 0).toBe(0);
  });
});
