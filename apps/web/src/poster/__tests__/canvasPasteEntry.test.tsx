/**
 * Record 34 — a paste on the canvas and a file dropped on it make the
 * blocks bounded-designs §3.3 says (table A row 3, table B orders 2 to 5,
 * "Drop", "Image checks"); each is one undo step. Engineering record:
 * docs/fixes/34-paste-drop.md.
 *
 * Entry is the user's: the paste event a browser fires at the focused
 * element (the page, a text, a field) carrying its clipboardData, a drop
 * event on the canvas carrying its files, ⌘Z. The store is read, never
 * called. Uploads go to a mocked `uploadPosterImage`; an image's size is
 * the size a stubbed Image reports (jsdom decodes no image and performs no
 * layout: where a block lands as drawn, and the drawing, are
 * scripts/canvas-paste-check.mjs's).
 *
 * Before the change nothing listened: a paste with nothing in edit mode
 * and a drop did nothing, and an image pasted into text did nothing
 * (MEASURED in three engines, record section 4); and an image block's own
 * upload took three undo steps, the first of which put back a revoked
 * blob: URL (MEASURED in Chromium).
 *
 * Re-run: npx vitest run src/poster/__tests__/canvasPasteEntry.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'owner' } } })),
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
// As uploadPosterImage does: a file over 10 MB or not an image is refused (null).
const uploads = vi.hoisted(() => ({
  image: vi.fn(async (userId: string, posterId: string, blockId: string, file: File) => (
    file.size > 10 * 1024 * 1024 || !file.type.startsWith('image/') ? null : `storage://${userId}/${posterId}/${blockId}.${file.name.split('.').pop()}`
  )),
}));
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  uploadPosterImage: uploads.image,
}));

import type { Block } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import { FeedbackModal } from '@/components/FeedbackModal';
import {
  KEYS, NAME, NoopResizeObserver, canvasEditor, clickEmptyWorkspace, clickToEnd, installContentEditableShim, installExecCommandShim,
  nextTask, press, renderEditor, selectedBlocks, typeText, undoDoc,
} from './undoKit';
import { findButton } from './editorKit';

/** The image sizes the stubbed Image reports, by file name. */
const SIZES: Record<string, { w: number; h: number }> = {
  'wide.png': { w: 160, h: 100 },
  'tall.png': { w: 90, h: 150 },
  'square.png': { w: 120, h: 120 },
};
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url: string) {
    // A browser's object URLs are each unique (one test numbers them: `blob:name#n`).
    const size = SIZES[url.replace(/^blob:/, '').replace(/#\d+$/, '')];
    setTimeout(() => {
      if (!size) { this.onerror?.(); return; }
      this.naturalWidth = size.w;
      this.naturalHeight = size.h;
      this.onload?.();
    }, 0);
  }
}

const image = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'image/png' });
/** A clipboard (or a drop's DataTransfer) as an engine hands it over. */
const transfer = (strings: Record<string, string>, files: File[] = []) => ({
  types: [...Object.keys(strings), ...(files.length ? ['Files'] : [])],
  getData: (t: string) => strings[t] ?? '',
  items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
  files,
  dropEffect: 'none',
});

const blocks = () => usePosterStore.getState().doc!.blocks;
const block = (id: string) => blocks().find((b) => b.id === id)!;
const added = (before: Block[]) => blocks().filter((b) => !before.some((o) => o.id === b.id));

/** ⌘V with nothing in edit mode: the browser fires paste at the focused element (the page, after a click on the workspace). */
async function pasteOnPage(data: ReturnType<typeof transfer>) {
  fireEvent.paste(document.activeElement ?? document.body, { clipboardData: data });
  await nextTask();
}

/** A drop at (x, y) on `target` (a dragover first, which a real drop needs cancelled); whether the dragover was cancelled. */
function dropOn(target: Element, data: ReturnType<typeof transfer>, x = 0, y = 0): boolean {
  // jsdom has no DragEvent: its drag events are plain Events, so the point
  // a browser's drag event carries is set on them here.
  const at = (ev: Event) => {
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    return ev;
  };
  const notCancelled = fireEvent(target, at(createEvent.dragOver(target, { dataTransfer: data })));
  fireEvent(target, at(createEvent.drop(target, { dataTransfer: data })));
  return !notCancelled;
}

const outer = () => document.querySelector('[data-postr-canvas-outer]')!;
const sheetZoom = () => Number(/scale\(([^)]+)\)/.exec(document.getElementById('poster-canvas')!.style.transform)![1]);

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
let alerts: string[] = [];
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (f: File) => `blob:${f.name}`, revokeObjectURL: () => {} }));
  alerts = [];
  vi.stubGlobal('alert', (m: string) => { alerts.push(m); });
  uploads.image.mockClear();
  usePosterStore.getState().setPoster('fixture-1', undoDoc(), NAME, { ownerId: 'owner' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('table B: ⌘V with nothing in edit mode', () => {
  it('order 3: an image makes one image block of Insert › Image\'s box with the image\'s shape, uploaded under its own id; one ⌘Z removes it', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('wide.png')]));
    await waitFor(() => expect(added(before)).toHaveLength(1));
    const b = added(before)[0]!;
    expect(b).toMatchObject({ type: 'image', w: 155, h: 97, imageSrc: `storage://owner/fixture-1/${b.id}.png` });
    expect(uploads.image).toHaveBeenCalledTimes(1);
    expect(uploads.image.mock.calls[0]!.slice(0, 3)).toEqual(['owner', 'fixture-1', b.id]);
    expect(selectedBlocks()).toEqual([b.id]);
    expect(blocks().filter((x) => x.id !== b.id)).toEqual(before);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('order 3: a tall image keeps the box\'s height', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('tall.png')]));
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]).toMatchObject({ w: 84, h: 140 });
  });

  it('order 3: an EMPTY image block selected is filled instead, through its own upload (its width kept, its height the image\'s shape); one ⌘Z empties it', async () => {
    renderEditor();
    fireEvent.click(document.querySelector('[data-block-id="im1"]')!);
    await nextTask();
    expect(selectedBlocks()).toEqual(['im1']);
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('square.png')]));
    await waitFor(() => expect(block('im1').imageSrc).toBe('storage://owner/fixture-1/im1.png'));
    expect(block('im1')).toMatchObject({ w: 210, h: 210 });
    expect(added(before)).toHaveLength(0);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('order 3: an image block that already holds an image, selected, is left as it is: a NEW image block is made', async () => {
    const d = undoDoc();
    usePosterStore.getState().setPoster('fixture-1', {
      ...d, blocks: d.blocks.map((b) => (b.id === 'im1' ? { ...b, imageSrc: 'storage://owner/fixture-1/im1.png' } : b)),
    }, NAME, { ownerId: 'owner' });
    renderEditor();
    fireEvent.click(document.querySelector('[data-block-id="im1"]')!);
    await nextTask();
    expect(selectedBlocks()).toEqual(['im1']);
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('square.png')]));
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(block('im1')).toEqual(before.find((b) => b.id === 'im1'));
    expect(uploads.image.mock.calls.map((c) => c[2])).toEqual([added(before)[0]!.id]);
  });

  it('order 2: an HTML table makes one table block filled by record 32\'s reader', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/html': '<table><tr><td><b>ZQa</b></td><td>ZQb</td></tr><tr><td>ZQc</td><td>x &lt; y</td></tr></table>', 'text/plain': 'ZQa\tZQb\nZQc\tx < y' }, [image('wide.png')]));
    const made = added(before);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ type: 'table', w: 155, h: 140, tableData: { rows: 2, cols: 2, cells: ['<b>ZQa</b>', 'ZQb', 'ZQc', 'x &lt; y'] } });
    expect(uploads.image).not.toHaveBeenCalled();
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('order 4: text with tabs makes one text block (not a table) holding record 32\'s cleaned paste', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/plain': 'ZQt1\tZQt2\nZQt3\tZQt4' }));
    const made = added(before);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ type: 'text', w: 155, content: 'ZQt1\tZQt2\nZQt3\tZQt4', tableData: null });
  });

  it('order 4: an image with text is text', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/plain': 'ZQcaption' }, [image('wide.png')]));
    expect(added(before).map((b) => b.type)).toEqual(['text']);
    expect(uploads.image).not.toHaveBeenCalled();
  });

  it('order 5: HTML with only an <img>, and a file that is not an image, make nothing', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/html': '<img src="https://example.test/a.png">' }));
    await pasteOnPage(transfer({}, [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })]));
    await nextTask();
    expect(blocks()).toEqual(before);
    expect(alerts).toEqual([]);
  });

  it('an image over 10 MB: today\'s message, no block, no upload', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('wide.png', 10 * 1024 * 1024 + 1)]));
    await nextTask();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/too large[\s\S]*Images must be under 10 MB/);
    expect(blocks()).toEqual(before);
    expect(uploads.image).not.toHaveBeenCalled();
  });

  it('a paste into a sidebar field is the field\'s: no block', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const name = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    name.focus();
    fireEvent.paste(name, { clipboardData: transfer({ 'text/plain': 'ZQNAME' }, [image('wide.png')]) });
    await nextTask();
    expect(blocks()).toEqual(before);
    expect(uploads.image).not.toHaveBeenCalled();
  });
});

describe('table A row 3: an image pasted into a text', () => {
  it('a new image block to the text block\'s right (it fits there), the text unchanged; one ⌘Z removes it', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const before = structuredClone(blocks());
    fireEvent.paste(ed, { clipboardData: transfer({}, [image('wide.png')]) });
    await waitFor(() => expect(added(before)).toHaveLength(1));
    const b = added(before)[0]!;
    // b1 is at x 20, w 210 (jsdom has no layout, so its drawn top reads 0).
    expect(b).toMatchObject({ type: 'image', x: 235, w: 155, h: 97 });
    expect(block('b1').content).toBe(before.find((x) => x.id === 'b1')!.content);
    // The text is left (no caret in it) and the new image block is selected.
    expect(document.activeElement).not.toBe(ed);
    expect(selectedBlocks()).toEqual([b.id]);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('a paste with text stays the text\'s (record 32): no image block', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const before = structuredClone(blocks());
    fireEvent.paste(ed, { clipboardData: transfer({ 'text/plain': 'ZQWORDS' }, [image('wide.png')]) });
    await nextTask();
    expect(added(before)).toHaveLength(0);
    expect(block('b1').content).toContain('ZQWORDS');
  });
});

describe('while an image is stored', () => {
  /** Hold the next upload until `release()`. */
  function holdUpload() {
    let release: () => void = () => {};
    uploads.image.mockImplementationOnce((userId: string, posterId: string, blockId: string) => new Promise((resolve) => {
      release = () => resolve(`storage://${userId}/${posterId}/${blockId}.png`);
    }));
    return () => release();
  }

  it('an edit made during the upload is kept, and the image block still lands, in a step of its own', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const release = holdUpload();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({}, [image('wide.png')]));
    await waitFor(() => expect(uploads.image).toHaveBeenCalledTimes(1));
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQTYPED');
    release();
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(block('b1').content).toContain('ZQTYPED');
    await press(document.body, KEYS.undo);
    expect(added(before)).toHaveLength(0);
    expect(block('b1').content).toContain('ZQTYPED');
  });

  it('another poster opened before the upload is back gets no block', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const release = holdUpload();
    await pasteOnPage(transfer({}, [image('wide.png')]));
    await waitFor(() => expect(uploads.image).toHaveBeenCalledTimes(1));
    // The user opens another poster (the editor loads it into the store).
    usePosterStore.getState().setPoster('fixture-2', undoDoc(), NAME, { ownerId: 'owner' });
    const other = structuredClone(blocks());
    release();
    await nextTask();
    await nextTask();
    expect(usePosterStore.getState().posterId).toBe('fixture-2');
    expect(blocks()).toEqual(other);
  });
});

describe('a drop on the canvas', () => {
  it('the dragover of a file is taken (a real drop needs it), and an image dropped makes one block centred on the drop point, read through the zoom', async () => {
    renderEditor();
    // Zoom in twice, so the drop point on screen and in the poster's units differ.
    fireEvent.click(document.querySelector('button[aria-label="Zoom in"]')!);
    await nextTask();
    fireEvent.click(document.querySelector('button[aria-label="Zoom in"]')!);
    await nextTask();
    const before = structuredClone(blocks());
    const z = sheetZoom();
    expect(z).not.toBe(1);
    expect(dropOn(outer(), transfer({}, [image('wide.png')]), 201 * z, 152 * z)).toBe(true);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    // Centred on (201, 152) units, snapped to the ½ in grid: 155 × 97 → (123.5, 103.5) → (125, 105).
    expect(added(before)[0]).toMatchObject({ type: 'image', x: 125, y: 105, w: 155, h: 97 });
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('several images: one block each, each 1 in down and right of the last, one undo step for all', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const z = sheetZoom();
    dropOn(outer(), transfer({}, [image('wide.png'), image('tall.png'), image('square.png')]), 200 * z, 150 * z);
    await waitFor(() => expect(added(before)).toHaveLength(3));
    const made = added(before);
    expect(made.map((b) => [b.x - made[0]!.x, b.y - made[0]!.y])).toEqual([[0, 0], [10, 10], [20, 20]]);
    expect(uploads.image).toHaveBeenCalledTimes(3);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('one image dropped on an image block replaces its image through its own upload', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    dropOn(document.querySelector('[data-block-id="im1"]')!, transfer({}, [image('tall.png')]));
    await waitFor(() => expect(block('im1').imageSrc).toBe('storage://owner/fixture-1/im1.png'));
    expect(block('im1')).toMatchObject({ w: 210, h: 350 });
    expect(added(before)).toHaveLength(0);
  });

  it('a file that is not an image is skipped with today\'s message; an image beside it is still placed', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    dropOn(outer(), transfer({}, [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }), image('wide.png')]));
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/"notes\.pdf" doesn't look like an image/);
  });

  it('a drag that carries no files (text) is not taken', () => {
    renderEditor();
    expect(dropOn(outer(), transfer({ 'text/plain': 'ZQ' }))).toBe(false);
  });
});

describe('the image block\'s own upload, which a fill and a drop use: one undo step, no preview URL stored', () => {
  it('"+ Upload figure": stored and fitted in one step; one ⌘Z empties it; no blob: URL ever in the poster', async () => {
    renderEditor();
    const seen: string[] = [];
    const stop = usePosterStore.subscribe((s) => { const src = s.doc?.blocks.find((b) => b.id === 'im1')?.imageSrc; if (src) seen.push(src); });
    const before = structuredClone(blocks());
    const input = document.querySelector<HTMLInputElement>('[data-block-id="im1"] input[type="file"]')!;
    fireEvent.change(input, { target: { files: [image('wide.png')] } });
    await waitFor(() => expect(block('im1').imageSrc).toBe('storage://owner/fixture-1/im1.png'));
    expect(block('im1').h).toBe(131);
    stop();
    expect(seen.filter((s) => s.startsWith('blob:'))).toEqual([]);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('a file over 10 MB: today\'s message, and nothing stored (it used to store the preview URL first)', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const input = document.querySelector<HTMLInputElement>('[data-block-id="im1"] input[type="file"]')!;
    fireEvent.change(input, { target: { files: [image('wide.png', 10 * 1024 * 1024 + 1)] } });
    await waitFor(() => expect(alerts[0]).toMatch(/too large/));
    expect(blocks()).toEqual(before);
  });
});

/**
 * Record 34's review round (section 9): each finding reproduced in the
 * browser first (scripts/canvas-paste-check.mjs, the R34 scenarios), then
 * entered here the same way. Each test failed on the tree the review read
 * (9c250e5) for the reason it names.
 */
describe('the review round', () => {
  const IMG_HTML = '<img alt="ZQ alt text" src="https://example.invalid/zq-figure.png">';
  const ADDRESS = 'https://example.invalid/zq-figure.png';

  it('R34-1: a second file put into an image block while the first uploads: only the last one updates it (one undo step), and the block draws a preview the page has not revoked', async () => {
    // Each object URL unique, as a browser's; every revocation logged.
    let n = 0;
    const revoked: string[] = [];
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (f: File) => `blob:${f.name}#${(n += 1)}`,
      revokeObjectURL: (u: string) => { revoked.push(u); },
    }));
    // Both uploads held; the first is answered first (the order two uploads of a held storage come back in).
    const releases: Array<() => void> = [];
    for (let i = 0; i < 2; i += 1) {
      uploads.image.mockImplementationOnce((userId: string, posterId: string, blockId: string, file: File) => new Promise((resolve) => {
        releases.push(() => resolve(`storage://${userId}/${posterId}/${blockId}.${file.name.split('.').pop()}`));
      }));
    }
    renderEditor();
    const before = structuredClone(blocks());
    const im1 = () => document.querySelector('[data-block-id="im1"]')!;
    dropOn(im1(), transfer({}, [image('tall.png')]));
    await waitFor(() => expect(uploads.image).toHaveBeenCalledTimes(1));
    dropOn(im1(), transfer({}, [image('square.png')]));
    await waitFor(() => expect(uploads.image).toHaveBeenCalledTimes(2));
    releases[0]!();
    await nextTask();
    await nextTask();
    releases[1]!();
    await waitFor(() => expect(block('im1')).toMatchObject({ imageSrc: 'storage://owner/fixture-1/im1.png', h: 210 }));
    await nextTask();
    const src = im1().querySelector('img')!.getAttribute('src')!;
    expect(src).toMatch(/^blob:square\.png#/);
    expect(revoked).not.toContain(src);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('R34-2: a "Copy image" carrying an <img> fragment and the address as plain text pastes the image (a text paste of it inserts nothing)', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/html': IMG_HTML, 'text/plain': ADDRESS }, [image('wide.png')]));
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]).toMatchObject({ type: 'image', w: 155, h: 97 });
  });

  it('R34-2: the same pasted into a text: an image block beside it, the text unchanged', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const before = structuredClone(blocks());
    fireEvent.paste(ed, { clipboardData: transfer({ 'text/html': IMG_HTML, 'text/plain': ADDRESS }, [image('wide.png')]) });
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]).toMatchObject({ type: 'image', x: 235, w: 155, h: 97 });
    expect(block('b1').content).toBe(before.find((x) => x.id === 'b1')!.content);
  });

  it('R34-2 and R34-5: the fragment and the address with no image file make nothing; the address alone makes a text block holding it', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/html': IMG_HTML, 'text/plain': ADDRESS }));
    await nextTask();
    expect(blocks()).toEqual(before);
    await pasteOnPage(transfer({ 'text/plain': ADDRESS }));
    expect(added(before)).toHaveLength(1);
    expect(added(before)[0]).toMatchObject({ type: 'text', content: ADDRESS });
  });

  it('R34-3: a table\'s cells selected by dragging (no caret in a cell), then ⌘V: no block made; once the table is left, a paste makes one', async () => {
    renderEditor();
    const tds = document.querySelectorAll('[data-block-id="tb1"] td');
    // The user presses on the first cell (the block is selected) and drags to the cell below its right.
    fireEvent.pointerDown(tds[0]!, { button: 0, pointerId: 1 });
    fireEvent.mouseDown(tds[0]!, { button: 0 });
    fireEvent.mouseEnter(tds[3]!);
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    fireEvent.mouseUp(tds[3]!);
    // The browser's click after a press and a release on two cells goes to their common ancestor.
    fireEvent.click(tds[0]!.closest('tbody')!);
    expect(selectedBlocks()).toEqual(['tb1']);
    // Chromium leaves the focus on the page after such a drag (MEASURED, F-cell-range-tsv).
    (document.activeElement as HTMLElement | null)?.blur?.();
    await nextTask();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/plain': 'ZQd1\tZQd2\nZQd3\tZQd4' }));
    expect(blocks()).toEqual(before);
    await clickEmptyWorkspace();
    await pasteOnPage(transfer({ 'text/plain': 'ZQd1\tZQd2\nZQd3\tZQd4' }));
    expect(added(before).map((b) => b.type)).toEqual(['text']);
  });

  it('R34-7: the feedback dialog open (a chart that cannot be drawn → "Send Feedback"), a click on its heading, then ⌘V: no block made', async () => {
    const d = undoDoc();
    const chart = { id: 'ch1', type: 'chart', x: 300, y: 20, w: 100, h: 70, content: '', imageSrc: null, imageFit: 'contain', tableData: null, chartSpec: null } as unknown as Block;
    usePosterStore.getState().setPoster('fixture-1', { ...d, blocks: [...d.blocks, chart] }, NAME, { ownerId: 'owner' });
    renderEditor();
    render(<FeedbackModal />);
    await waitFor(() => expect(findButton('Send Feedback')).toBeTruthy());
    fireEvent.click(findButton('Send Feedback')!);
    const heading = await waitFor(() => {
      const h = Array.from(document.querySelectorAll('h3')).find((x) => x.textContent === 'Send feedback');
      expect(h).toBeTruthy();
      return h!;
    });
    // A click on the heading's text: no field keeps the focus.
    fireEvent.click(heading);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await nextTask();
    const before = structuredClone(blocks());
    await pasteOnPage(transfer({ 'text/plain': 'ZQFEED plain words' }));
    expect(blocks()).toEqual(before);
    // A sibling on the same check (PosterEditor modalDialogOpen, fix 02): the
    // chart the user pressed "Send Feedback" on is selected, and Delete
    // pressed on the dialog's heading removed it behind the dialog.
    expect(selectedBlocks()).toEqual(['ch1']);
    fireEvent.keyDown(document.body, { key: 'Delete' });
    await nextTask();
    expect(blocks()).toEqual(before);
    fireEvent.keyDown(window, { key: 'Escape' });
    await nextTask();
  });
});
