/**
 * Record 35 — copy, cut and paste blocks, and each image block's own file
 * (bounded-designs.md §3.3 table B order 1, table C, D;
 * docs/fixes/35-block-copy.md).
 *
 * Entry is the user's: a click that selects a block (as the rubber band
 * does: nothing in edit mode), ⌘C / ⌘X / ⌘D pressed on the page, the copy
 * event a browser fires for `execCommand('copy')` at the focused element
 * (the page), the paste event it fires carrying the clipboard, the image
 * block's file input (Replace), ⌘Z. The store is read, never called. The
 * network is faked at the Supabase client: storage's upload and copy keep
 * files by path in `files`, and a copy of a file outside the owner's folder,
 * or of a missing one, fails as the bucket's row-level security makes it
 * fail; a copy to a name that exists is refused (409), as the storage API
 * refuses it. jsdom performs no layout and fires no copy event of its own: where
 * blocks are drawn, and the engines' own clipboards, are
 * scripts/canvas-paste-check.mjs's.
 *
 * Before the change ⌘C and ⌘X did nothing and ⌘V of copied blocks made a
 * text block of their words (MEASURED in three engines, record section 4);
 * ⌘D's clone shared its original's file, and an upload overwrote
 * {block}.{ext}.
 *
 * Re-run: npx vitest run src/poster/__tests__/blockClipboardEntry.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const net = vi.hoisted(() => ({
  files: new Map<string, unknown>(),
  uploads: [] as string[],
  copies: [] as Array<[string, string]>,
  hold: null as null | Promise<void>,
  /** An error every copy answers (a transient 503, as Storage can answer). */
  copyError: null as null | { message: string; statusCode: string },
  /**
   * The next copies' fates, one per try: storage makes the copy but its
   * answer is lost, a gateway's 504 ('written504') or a network failure
   * ('writtenLost'), as storage-js reports them (the final check, F35-FC-1).
   */
  copyPlan: [] as Array<'written504' | 'writtenLost'>,
  /**
   * Storage's answers to the next copies, one per try, whatever the file
   * (correction 5, F35-FC-2): an error as storage-js reports it, the copy
   * not made. When the list is empty the copy goes on as below.
   */
  copyAnswers: [] as Array<{ message: string; statusCode: string }>,
}));
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
    // The poster-assets bucket as its row-level security has it: a session
    // reads and writes only under its own user id's folder ('owner').
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: { message: 'not here' } }),
        upload: async (path: string, file: unknown) => {
          net.uploads.push(path);
          if (!path.startsWith('owner/')) return { data: null, error: { message: 'rls', statusCode: '403' } };
          net.files.set(path, file);
          return { data: { path }, error: null };
        },
        copy: async (from: string, to: string) => {
          net.copies.push([from, to]);
          if (net.hold) await net.hold;
          if (net.copyError) return { data: null, error: net.copyError };
          const answer = net.copyAnswers.shift();
          if (answer) return { data: null, error: answer };
          if (!from.startsWith('owner/') || !to.startsWith('owner/') || !net.files.has(from)) {
            return { data: null, error: { message: 'Object not found', statusCode: '404' } };
          }
          // A destination that exists is refused, as the storage API refuses it.
          if (net.files.has(to)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
          net.files.set(to, net.files.get(from));
          const fate = net.copyPlan.shift();
          if (fate === 'written504') return { data: null, error: { message: 'Gateway Timeout', statusCode: '504' } };
          if (fate === 'writtenLost') return { data: null, error: { message: 'Failed to fetch' } };
          return { data: { path: to }, error: null };
        },
      }),
    },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import type { Block, PosterDoc } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import { ACK_BLOCK_ID } from '@/export/ackBlock';
import {
  KEYS, NAME, NoopResizeObserver, canvasEditor, clickEmptyWorkspace, clickToEnd, installContentEditableShim, installExecCommandShim,
  nextTask, press, renderEditor, selectedBlocks, undoDoc,
} from './undoKit';

const IMG = 'storage://owner/fixture-1/im1.png';
const OWN_FILE = (posterId: string) => new RegExp(`^storage://owner/${posterId}/b[A-Za-z0-9_-]{6}-[A-Za-z0-9_-]{8}\\.png$`);

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_url: string) {
    setTimeout(() => {
      this.naturalWidth = 120;
      this.naturalHeight = 120;
      this.onload?.();
    }, 0);
  }
}

/** What reached the "system clipboard" by the last copy: the page's data when it cancelled the event, else the selection's text. */
const clip = vi.hoisted(() => ({ last: null as null | Record<string, string>, events: 0 }));
/** `execCommand('copy')` as a browser runs it: a `copy` event at the focused element with a writable clipboardData. */
function installCopyCommand(): () => void {
  const doc = document as unknown as { execCommand: (c: string, u?: boolean, v?: string) => boolean };
  const prev = doc.execCommand;
  doc.execCommand = (cmd, u, v) => {
    if (cmd !== 'copy') return prev.call(document, cmd, u, v);
    const data: Record<string, string> = {};
    const ev = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { setData: (t: string, x: string) => { data[t] = x; }, getData: (t: string) => data[t] ?? '' } });
    (document.activeElement ?? document.body).dispatchEvent(ev);
    clip.events += 1;
    clip.last = ev.defaultPrevented ? data : { 'text/plain': String(window.getSelection() ?? '') };
    return true;
  };
  return () => { doc.execCommand = prev; };
}

const transfer = (strings: Record<string, string>) => ({
  types: Object.keys(strings),
  getData: (t: string) => strings[t] ?? '',
  items: [],
  files: [],
});
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const marked = (json: unknown) => ({ 'text/html': `<div data-postr-blocks="${attr(JSON.stringify(json))}"><p>ZQ words</p></div>`, 'text/plain': 'ZQ words' });

const blocks = () => usePosterStore.getState().doc!.blocks;
const block = (id: string) => blocks().find((b) => b.id === id)!;
const added = (before: Block[]) => blocks().filter((b) => !before.some((o) => o.id === b.id));
const frame = (id: string) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`)!;
const C = { key: 'c', code: 'KeyC', metaKey: true };
const X = { key: 'x', code: 'KeyX', metaKey: true };
const D = { key: 'd', code: 'KeyD', metaKey: true };

/** Select blocks as the rubber band does (nothing in edit mode): a click on the first, Shift+click on the rest. */
async function select(...ids: string[]) {
  await clickEmptyWorkspace();
  ids.forEach((id, i) => fireEvent.click(frame(id), { shiftKey: i > 0 }));
  await nextTask();
  expect(selectedBlocks().sort()).toEqual([...ids].sort());
}
/** ⌘V with nothing in edit mode: the paste at the page, carrying the clipboard. */
async function pasteOnPage(strings: Record<string, string>) {
  fireEvent.paste(document.activeElement ?? document.body, { clipboardData: transfer(strings) });
  await nextTask();
}
/** The payload the last copy wrote. */
function payload() {
  const html = clip.last?.['text/html'] ?? '';
  const el = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-postr-blocks]');
  return el ? JSON.parse(el.getAttribute('data-postr-blocks')!) : null;
}

function docWith(extra: Block[] = [], over: (b: Block) => Block = (b) => b): PosterDoc {
  const d = undoDoc();
  return { ...d, blocks: [...d.blocks.map(over), ...extra] };
}
const filled = (b: Block) => (b.id === 'im1' ? { ...b, imageSrc: IMG, caption: 'ZQ caption' } : b);
function open(d: PosterDoc, id = 'fixture-1') {
  usePosterStore.getState().setPoster(id, d, NAME, { ownerId: 'owner' });
}

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim(), installCopyCommand()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:zq', revokeObjectURL: () => {} }));
  net.files.clear();
  net.files.set('owner/fixture-1/im1.png', 'A');
  net.uploads.length = 0;
  net.copies.length = 0;
  net.hold = null;
  net.copyError = null;
  net.copyPlan = [];
  net.copyAnswers = [];
  clip.last = null;
  clip.events = 0;
  open(docWith([], filled));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll('[data-zq-temp]').forEach((e) => e.remove());
});

describe('C1: ⌘C with blocks selected and nothing in edit mode', () => {
  it('puts a version 1 payload of the selected blocks, in the poster\'s order, as stored, and their words on the clipboard', async () => {
    renderEditor();
    await select('im1', 'h1', 'b1');
    expect(await press(document.body, C)).toBe(true);
    const p = payload();
    expect(p.v).toBe(1);
    expect(p.blocks.map((b: Block) => b.id)).toEqual(['h1', 'b1', 'im1']);
    for (const b of p.blocks) expect(b).toMatchObject(Object.fromEntries(Object.entries(block(b.id)).filter(([k]) => k !== 'locked')));
    expect(clip.last!['text/plain']).toBe('Methods we used\n\nOur own words, not a placeholder.\n\nZQ caption');
  });

  it('nothing in the poster changes and there is no undo step', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    await select('b1');
    await press(document.body, C);
    expect(blocks()).toEqual(before);
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('the caret in a text: the text\'s own copy (no payload)', async () => {
    renderEditor();
    await clickToEnd(canvasEditor('b1'));
    expect(await press(canvasEditor('b1'), C)).toBe(false);
    expect(clip.events).toBe(0);
  });

  it('a dialog open, or a table showing cells selected by dragging: no copy', async () => {
    renderEditor();
    await select('b1');
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('data-zq-temp', '');
    document.body.appendChild(dlg);
    expect(await press(document.body, C)).toBe(false);
    dlg.remove();
    document.querySelector('#poster-canvas [data-block-id="tb1"] table')!.setAttribute('data-postr-cell-range', '');
    expect(await press(document.body, C)).toBe(false);
    expect(clip.events).toBe(0);
  });

  it('text the user selected on the page after selecting a block (the sidebar\'s words): the browser\'s own copy of it', async () => {
    renderEditor();
    await select('b1');
    const words = document.createElement('p');
    words.setAttribute('data-zq-temp', '');
    words.textContent = 'ZQ words outside the canvas';
    document.body.appendChild(words);
    window.getSelection()!.selectAllChildren(words);
    expect(await press(document.body, C)).toBe(false);
    expect(clip.events).toBe(0);
    window.getSelection()!.removeAllRanges();
  });

  /** A press on the canvas (the rubber band's, or a click on a block) that leaves `select()` selected on the page as it ends. */
  function pressOnCanvas(select: () => void) {
    const outer = document.querySelector('[data-postr-canvas-outer]')!;
    outer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    select();
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
  }

  it('words selected when the user presses on the canvas (WebKit\'s rubber band leaves some; or text selected before a click on a block): the press clears them and the blocks are copied', async () => {
    renderEditor();
    await select('b1');
    const words = document.createElement('p');
    words.setAttribute('data-zq-temp', '');
    words.textContent = 'ZQ words a band crossed';
    document.body.appendChild(words);
    pressOnCanvas(() => window.getSelection()!.selectAllChildren(words));
    expect(String(window.getSelection())).toBe('');
    expect(await press(document.body, C)).toBe(true);
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1']);
  });

  it('a press on the canvas leaves alone the words selected in a text being edited, and a selection made in a table', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    window.getSelection()!.selectAllChildren(ed);
    ed.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    expect(String(window.getSelection())).toContain('Our own words');
    (document.activeElement as HTMLElement).blur();
    const td = document.querySelector('#poster-canvas [data-block-id="tb1"] td')!;
    window.getSelection()!.selectAllChildren(td);
    td.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    expect(String(window.getSelection())).toContain('Group');
    window.getSelection()!.removeAllRanges();
  });

  it('nothing selected: the browser\'s own copy', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    expect(await press(document.body, C)).toBe(false);
    expect(clip.events).toBe(0);
  });

  it('the credit mark is never copied; selected alone, ⌘C copies nothing', async () => {
    open(docWith([{ id: ACK_BLOCK_ID, type: 'logo', x: 400, y: 330, w: 30, h: 12, content: '', imageSrc: 'data:image/png;base64,AA', imageFit: 'contain', tableData: null, locked: true }], filled));
    renderEditor();
    await select(ACK_BLOCK_ID);
    expect(await press(document.body, C)).toBe(false);
    expect(clip.events).toBe(0);
    await select(ACK_BLOCK_ID, 'b1');
    await press(document.body, C);
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1']);
  });
});

describe('C2: ⌘X', () => {
  it('copies, then deletes as Delete does, in one undo step', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    await select('b1', 'im1');
    await press(document.body, X);
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1', 'im1']);
    expect(blocks().map((b) => b.id)).toEqual(before.filter((b) => b.id !== 'b1' && b.id !== 'im1').map((b) => b.id));
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('the credit mark stays, with Delete\'s toast; it is not copied', async () => {
    open(docWith([{ id: ACK_BLOCK_ID, type: 'logo', x: 400, y: 330, w: 30, h: 12, content: '', imageSrc: 'data:image/png;base64,AA', imageFit: 'contain', tableData: null, locked: true }], filled));
    renderEditor();
    await select(ACK_BLOCK_ID, 'b1');
    await press(document.body, X);
    expect(blocks().some((b) => b.id === ACK_BLOCK_ID)).toBe(true);
    expect(blocks().some((b) => b.id === 'b1')).toBe(false);
    expect(screen.getByText('This credit stays on the canvas.')).toBeTruthy();
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1']);
  });
});

describe('C3: ⌘V of copied blocks', () => {
  it('copies with new ids 1 in down and right of the originals, each image with its own file, in one undo step, selected', async () => {
    renderEditor();
    await select('h1', 'b1', 'im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(3));
    const made = added(before);
    for (const [i, id] of ['h1', 'b1', 'im1'].entries()) {
      const o = before.find((b) => b.id === id)!;
      expect(made[i]).toMatchObject({ type: o.type, content: o.content, w: o.w, h: o.h, x: o.x + 10, y: o.y + 10 });
      expect(made[i]!.id).not.toBe(o.id);
    }
    expect(made[2]!.imageSrc).toMatch(OWN_FILE('fixture-1'));
    expect(made[2]!.caption).toBe('ZQ caption');
    expect(net.copies).toEqual([['owner/fixture-1/im1.png', made[2]!.imageSrc!.slice('storage://'.length)]]);
    expect(block('im1').imageSrc).toBe(IMG);
    expect(selectedBlocks().sort()).toEqual(made.map((b) => b.id).sort());
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('in another poster: at the originals\' places, the file copied into that poster\'s folder', async () => {
    renderEditor();
    await select('b1', 'im1');
    await press(document.body, C);
    // Another poster: its own block ids (a duplicated poster keeps the
    // originals' ids, and there the copies are offset, as in the same poster).
    const other = undoDoc();
    open({ ...other, blocks: other.blocks.map((b) => ({ ...b, id: `${b.id}x` })) }, 'fixture-2');
    await nextTask();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(2));
    const [t, im] = added(before);
    expect(t).toMatchObject({ x: 20, y: 140, content: 'Our own words, not a placeholder.' });
    expect(im).toMatchObject({ x: 20, y: 240, type: 'image' });
    expect(im!.imageSrc).toMatch(OWN_FILE('fixture-2'));
  });

  it('after a cut: at the originals\' places (they are gone); one ⌘Z removes the copies, one more brings back the cut', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    await select('b1');
    await press(document.body, X);
    const afterCut = structuredClone(blocks());
    await clickEmptyWorkspace();
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(afterCut)).toHaveLength(1));
    expect(added(afterCut)[0]).toMatchObject({ x: 20, y: 140 });
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(afterCut);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('kept on the sheet when it would leave it (at 0 when larger than the sheet)', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const clipBlock = (id: string, x: number, y: number, w: number) => ({ id, type: 'text', x, y, w, h: 40, content: id, imageSrc: null, imageFit: 'contain', tableData: null });
    await pasteOnPage(marked({ v: 1, blocks: [clipBlock('zqk1', 470, 340, 100), clipBlock('zqk2', 10, 10, 600)] }));
    await waitFor(() => expect(added(before)).toHaveLength(2));
    expect(added(before).map((b) => [b.x, b.y])).toEqual([[380, 320], [0, 10]]);
  });

  it('an empty image block selected: the copies are pasted (order 1 comes before the image fill)', async () => {
    open(undoDoc());
    renderEditor();
    await select('b1');
    await press(document.body, C);
    await select('im1');
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(block('im1').imageSrc).toBeNull();
  });

  it('another poster opened while the files are copied: nothing changes there, and no toast about the first poster shows there (R2-1: the copies went into the first poster at once)', async () => {
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    let release: () => void = () => {};
    net.hold = new Promise<void>((r) => { release = r; });
    await pasteOnPage(clip.last!);
    // And one image whose file is missing (its copy fails), with a title the poster already has (refused): neither toast may show in the other poster.
    await pasteOnPage(marked({ v: 1, blocks: [
      { id: 'zm', type: 'image', x: 30, y: 30, w: 100, h: 80, content: '', imageSrc: 'storage://owner/fixture-1/missing.png', imageFit: 'contain', tableData: null },
      { id: 'zt', type: 'title', x: 20, y: 20, w: 300, h: 40, content: 'ZQ second title', imageSrc: null, imageFit: 'contain', tableData: null },
    ] }));
    await waitFor(() => expect(net.copies).toHaveLength(2));
    open(undoDoc(), 'fixture-2');
    await nextTask();
    const there = structuredClone(blocks());
    release();
    for (let i = 0; i < 4; i += 1) await nextTask();
    expect(blocks()).toEqual(there);
    expect(screen.queryByText(/couldn't be copied|Not pasted/)).toBeNull();
  });

  it('a payload pasted into a text is the text\'s (record 32): its words, no blocks', async () => {
    renderEditor();
    await select('b2');
    await press(document.body, C);
    const before = structuredClone(blocks());
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    fireEvent.paste(ed, { clipboardData: transfer(clip.last!) });
    await nextTask();
    expect(added(before)).toHaveLength(0);
    expect(block('b1').content).toContain('A second column of results.');
  });
});

describe('C4: a title, an authors block or a user logo the poster already has', () => {
  it('is not pasted, and a toast says why; the others are pasted', async () => {
    open(docWith([{ id: 'au1', type: 'authors', x: 20, y: 85, w: 440, h: 10, content: '', imageSrc: null, imageFit: 'contain', tableData: null }], filled));
    renderEditor();
    await select('t1', 'au1', 'h1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]).toMatchObject({ type: 'heading' });
    expect(screen.getByText('Not pasted: the poster already has a title and an authors block.')).toBeTruthy();
  });

  it('a user logo is refused; the credit mark is not a logo', async () => {
    const logo = (id: string, extra: Partial<Block> = {}): Block => ({ id, type: 'logo', x: 400, y: 20, w: 50, h: 40, content: '', imageSrc: null, imageFit: 'contain', tableData: null, ...extra });
    const pasteLogo = marked({ v: 1, blocks: [{ id: 'zqlogo', type: 'logo', x: 30, y: 30, w: 50, h: 40, content: '', imageSrc: null, imageFit: 'contain', tableData: null }] });
    open(docWith([logo('lg1')]));
    const view = renderEditor();
    await clickEmptyWorkspace();
    let before = structuredClone(blocks());
    await pasteOnPage(pasteLogo);
    await nextTask();
    expect(added(before)).toHaveLength(0);
    expect(screen.getByText('Not pasted: the poster already has a logo.')).toBeTruthy();
    view.unmount();
    open(docWith([logo(ACK_BLOCK_ID, { locked: true, imageSrc: 'data:image/png;base64,AA' })]));
    renderEditor();
    await clickEmptyWorkspace();
    before = structuredClone(blocks());
    await pasteOnPage(pasteLogo);
    await waitFor(() => expect(added(before)).toHaveLength(1));
  });
});

describe('D and C6: image files and untrusted payloads', () => {
  const imageClip = (id: string, imageSrc: string | null) => ({ id, type: 'image', x: 30, y: 30, w: 100, h: 80, content: '', imageSrc, imageFit: 'contain', tableData: null });

  it('a source that is not this account\'s file, or no file at all: an empty image block, one toast', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    net.files.set('someone-else/p9/theirs.png', 'B');
    await pasteOnPage(marked({ v: 1, blocks: [
      imageClip('s1', 'javascript:alert(1)'), imageClip('s2', 'http://zq.invalid/a.png'), imageClip('s3', 'storage://someone-else/p9/theirs.png'),
      imageClip('s4', 'storage://owner/fixture-1/missing.png'), imageClip('s5', IMG),
    ] }));
    await waitFor(() => expect(added(before)).toHaveLength(5));
    expect(added(before).map((b) => (b.imageSrc ? 'file' : null))).toEqual([null, null, null, null, 'file']);
    expect(screen.getByText('4 images couldn\'t be copied, so their blocks are empty.')).toBeTruthy();
  });

  it('every text cleaned by the editor\'s sanitizer: no script, handler, img, link or style kept', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const evil = '<img src=x onerror="alert(1)">ZQ <b>bold</b><script>alert(2)</script><a href="javascript:alert(3)">L</a><style>*{}</style>';
    await pasteOnPage(marked({ v: 1, blocks: [
      { id: 'e1', type: 'text', x: 30, y: 30, w: 100, h: 40, content: evil, imageSrc: null, imageFit: 'contain', tableData: null, caption: evil, note: evil, prompt: '"><img src=x>P' },
      { id: 'e2', type: 'table', x: 30, y: 90, w: 100, h: 40, content: '', imageSrc: null, imageFit: 'contain', tableData: { rows: 1, cols: 1, cells: [evil], colWidths: null, borderPreset: 'apa' } },
    ] }));
    await waitFor(() => expect(added(before)).toHaveLength(2));
    const [t, tb] = added(before);
    for (const s of [t!.content, t!.caption, t!.note, tb!.tableData!.cells[0]]) {
      expect(s).not.toMatch(/<img|onerror|<script|javascript:|<a[\s>]|<style/i);
      expect(s).toContain('ZQ <b>bold</b>');
    }
    expect(t!.prompt).toBe('">P');
  });

  it('a payload that fails validation pastes nothing, and a toast says so', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(marked({ v: 1, blocks: [{ id: 'n1', type: 'text', x: 1e308, y: 10, w: 100, h: 40, content: 'ZQ', imageSrc: null, imageFit: 'contain', tableData: null }] }));
    expect(blocks()).toEqual(before);
    expect(screen.getByText('These blocks can\'t be pasted.')).toBeTruthy();
  });
});

describe('D: ⌘D and Replace', () => {
  it('⌘D of an image: the clone has its own file, in one undo step; the original untouched', async () => {
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    const clone = added(before)[0]!;
    expect(clone).toMatchObject({ x: block('im1').x + 10, y: block('im1').y + 10, caption: 'ZQ caption' });
    expect(clone.imageSrc).toMatch(OWN_FILE('fixture-1'));
    expect(net.copies).toEqual([['owner/fixture-1/im1.png', clone.imageSrc!.slice('storage://'.length)]]);
    expect(block('im1').imageSrc).toBe(IMG);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('⌘D of an image whose file is not there (storage\'s 404): the clone is emptied, with the toast (correction 5, the lead\'s rule on F35-FC-2; until then it kept the missing path)', async () => {
    net.files.delete('owner/fixture-1/im1.png');
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('1 image couldn\'t be copied, so its block is empty.')).toBeTruthy());
    expect(added(before)[0]!.imageSrc).toBeNull();
  });

  it('⌘D while storage refuses the copy for a reason not about the file (403): the clone keeps its original\'s file, no toast (R1-3; correction 5)', async () => {
    net.copyAnswers = [{ message: 'new row violates row-level security policy', statusCode: '403' }];
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    await waitFor(() => expect(net.copies).toHaveLength(1));
    for (let i = 0; i < 4; i += 1) await nextTask();
    expect(added(before)[0]!.imageSrc).toBe(IMG);
    expect(screen.queryByText(/couldn't be copied/)).toBeNull();
  });

  it('⌘D of a block showing another account\'s file (no editor path writes one; storage answers 404 for a file it hides): the clone keeps that path, as before (correction 5: the rule is for the user\'s own folder)', async () => {
    const THEIRS = 'storage://someone-else/p9/theirs.png';
    net.files.set('someone-else/p9/theirs.png', 'B');
    open(docWith([], (b) => (b.id === 'im1' ? { ...b, imageSrc: THEIRS } : b)));
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    await waitFor(() => expect(net.copies).toHaveLength(1));
    for (let i = 0; i < 4; i += 1) await nextTask();
    expect(added(before)[0]!.imageSrc).toBe(THEIRS);
    expect(screen.queryByText(/couldn't be copied/)).toBeNull();
  });

  it('⌘D while storage answers a transient error: one try, then the clone keeps its original\'s file at once (R1-3)', async () => {
    net.copyError = { message: 'Gateway Timeout', statusCode: '504' };
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1), { timeout: 800 });
    expect(net.copies).toHaveLength(1);
    expect(added(before)[0]!.imageSrc).toBe(IMG);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('⌘D of an image stored under an older name ({block}.{any extension}): the clone gets its own file (R1-3)', async () => {
    const OLD = 'storage://owner/fixture-1/im1.plot_final';
    net.files.set('owner/fixture-1/im1.plot_final', 'A');
    open(docWith([], (b) => (b.id === 'im1' ? { ...b, imageSrc: OLD } : b)));
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    const clone = added(before)[0]!;
    expect(clone.imageSrc).toMatch(OWN_FILE('fixture-1'));
    expect(net.copies).toEqual([['owner/fixture-1/im1.plot_final', clone.imageSrc!.slice('storage://'.length)]]);
    expect(net.files.get(clone.imageSrc!.slice('storage://'.length))).toBe('A');
  });

  it('⌘D of a text block: the clone at once, as before', async () => {
    renderEditor();
    await select('b1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    expect(added(before)).toHaveLength(1);
    expect(net.copies).toHaveLength(0);
  });

  it('Replace writes a new file name; the old file stays; one ⌘Z puts the old one back', async () => {
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    const input = frame('im1').querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['C'], 'square.png', { type: 'image/png' })] } });
    await waitFor(() => expect(block('im1').imageSrc).not.toBe(IMG));
    expect(block('im1').imageSrc).toMatch(/^storage:\/\/owner\/fixture-1\/im1-[A-Za-z0-9_-]{8}\.png$/);
    expect(net.uploads).toEqual([block('im1').imageSrc!.slice('storage://'.length)]);
    expect(net.files.get('owner/fixture-1/im1.png')).toBe('A');
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });
});

describe('charts are not copied (hidden, D1)', () => {
  it('a chart in the selection is left out with a toast; ⌘X leaves it on the poster', async () => {
    const chart: Block = {
      id: 'c1', type: 'chart', x: 300, y: 20, w: 100, h: 70, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
      chartSpec: {
        version: 1, form: 'bar', data: { columns: [{ name: 'G', kind: 'category' }, { name: 'V', kind: 'number' }], rows: [['a', 1], ['b', 2]] },
        encoding: { x: 'G', y: 'V' }, options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      },
    };
    open(docWith([chart]));
    renderEditor();
    await select('c1', 'b1');
    await press(document.body, X);
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1']);
    expect(blocks().some((b) => b.id === 'c1')).toBe(true);
    expect(blocks().some((b) => b.id === 'b1')).toBe(false);
    expect(screen.getByText('Charts can\'t be copied, so the chart was left out.')).toBeTruthy();
  });
});

describe('review round 1 (record 35 §9)', () => {
  const tableClip = (id: string, rows: number, cols: number) => ({
    id, type: 'table', x: 30, y: 30, w: 200, h: 100, content: '', imageSrc: null, imageFit: 'contain',
    tableData: { rows, cols, cells: Array(rows * cols).fill(''), colWidths: null, borderPreset: 'apa' },
  });

  it('R1-1: a payload whose tables hold more than 2 500 cells in all pastes nothing, with the toast; one table of 2 500 cells is pasted', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(marked({ v: 1, blocks: [tableClip('zt1', 50, 50), tableClip('zt2', 50, 50)] }));
    expect(blocks()).toEqual(before);
    expect(screen.getByText('These blocks can\'t be pasted.')).toBeTruthy();
    await pasteOnPage(marked({ v: 1, blocks: [tableClip('zt1', 50, 50)] }));
    await waitFor(() => expect(added(before)).toHaveLength(1));
  });

  it('R1-2: ⌘X leaves on the poster a picture ⌘V could not bring back (an address, a data URL), with a toast; the rest is cut', async () => {
    const logo: Block = { id: 'lg1', type: 'logo', x: 400, y: 20, w: 50, h: 40, content: '', imageSrc: 'https://upload.wikimedia.org/zq.png', imageFit: 'contain', tableData: null };
    open(docWith([logo], (b) => (b.id === 'im1' ? { ...b, imageSrc: 'data:image/png;base64,AAAA' } : b)));
    renderEditor();
    const before = structuredClone(blocks());
    await select('b1', 'lg1', 'im1');
    await press(document.body, X);
    expect(payload().blocks.map((b: Block) => b.id)).toEqual(['b1']);
    expect(blocks().some((b) => b.id === 'b1')).toBe(false);
    expect(block('lg1')).toEqual(before.find((b) => b.id === 'lg1'));
    expect(block('im1')).toEqual(before.find((b) => b.id === 'im1'));
    expect(screen.getByText('2 pictures stay on the canvas: they can\'t be pasted back.')).toBeTruthy();
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('R1-2: ⌘X of such a picture alone cuts and copies nothing; ⌘C still copies it (pasted empty, with the paste\'s toast)', async () => {
    const logo: Block = { id: 'lg1', type: 'logo', x: 400, y: 20, w: 50, h: 40, content: '', imageSrc: 'https://upload.wikimedia.org/zq.png', imageFit: 'contain', tableData: null };
    open(docWith([logo]));
    renderEditor();
    const before = structuredClone(blocks());
    await select('lg1');
    await press(document.body, X);
    expect(blocks()).toEqual(before);
    expect(clip.events).toBe(0);
    expect(screen.getByText('1 picture stays on the canvas: it can\'t be pasted back.')).toBeTruthy();
    expect(usePosterStore.getState().canUndo).toBe(false);
    await press(document.body, C);
    expect(payload().blocks.map((b: Block) => [b.id, b.imageSrc])).toEqual([['lg1', '']]);
  });

  it('R1-3: ⌘C, ⌘V of an image stored under an older name: the copy gets its own file', async () => {
    net.files.set('owner/fixture-1/im1.plot_final', 'A');
    open(docWith([], (b) => (b.id === 'im1' ? { ...b, imageSrc: 'storage://owner/fixture-1/im1.plot_final' } : b)));
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    const copy = added(before)[0]!;
    expect(copy.imageSrc).toMatch(OWN_FILE('fixture-1'));
    expect(net.files.get(copy.imageSrc!.slice('storage://'.length))).toBe('A');
    expect(screen.queryByText(/couldn't be copied/)).toBeNull();
  });

  it('R1-4: blocks the payload cannot carry (a table of 51 columns, a text over 100 000 characters): ⌘X cuts and copies nothing, ⌘C copies nothing, with a toast', async () => {
    const wide: Block = { id: 'tw', type: 'table', x: 20, y: 300, w: 400, h: 40, content: '', imageSrc: null, imageFit: 'contain', tableData: { rows: 1, cols: 51, cells: Array(51).fill('c'), colWidths: null, borderPreset: 'apa' } };
    const long: Block = { id: 'tl', type: 'text', x: 20, y: 340, w: 400, h: 20, content: 'a'.repeat(100_001), imageSrc: null, imageFit: 'contain', tableData: null };
    open(docWith([wide, long]));
    renderEditor();
    const before = structuredClone(blocks());
    for (const big of ['tw', 'tl']) {
      await select('b1', big);
      await press(document.body, X);
      expect(blocks()).toEqual(before);
      await press(document.body, C);
      expect(blocks()).toEqual(before);
    }
    expect(clip.events).toBe(0);
    expect(screen.getAllByText('These blocks are too large to copy.').length).toBeGreaterThan(0);
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('R1-5: a second ⌘V pressed while the first copies its files: one title in all, the second refused with the toast', async () => {
    const d = docWith([], filled);
    open({ ...d, blocks: d.blocks.filter((b) => b.type !== 'title') });
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    let release: () => void = () => {};
    net.hold = new Promise<void>((r) => { release = r; });
    const both = marked({ v: 1, blocks: [
      { id: 'zt', type: 'title', x: 20, y: 10, w: 400, h: 40, content: 'ZQ TITLE', imageSrc: null, imageFit: 'contain', tableData: null },
      { id: 'zi', type: 'image', x: 20, y: 80, w: 80, h: 50, content: '', imageSrc: IMG, imageFit: 'contain', tableData: null },
    ] });
    await pasteOnPage(both);
    await pasteOnPage(both);
    await waitFor(() => expect(net.copies).toHaveLength(2));
    release();
    await waitFor(() => expect(added(before).filter((b) => b.type === 'image')).toHaveLength(2));
    expect(blocks().filter((b) => b.type === 'title')).toHaveLength(1);
    expect(screen.getByText('Not pasted: the poster already has a title.')).toBeTruthy();
  });

  it('R1-7: two charts left out: the toast says "the charts"', async () => {
    const chart = (id: string): Block => ({
      id, type: 'chart', x: 300, y: 20, w: 100, h: 70, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
      chartSpec: {
        version: 1, form: 'bar', data: { columns: [{ name: 'G', kind: 'category' }, { name: 'V', kind: 'number' }], rows: [['a', 1], ['b', 2]] },
        encoding: { x: 'G', y: 'V' }, options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      },
    });
    open(docWith([chart('c1'), chart('c2')]));
    renderEditor();
    await select('c1', 'c2', 'b1');
    await press(document.body, C);
    expect(screen.getByText('Charts can\'t be copied, so the charts were left out.')).toBeTruthy();
  });
});

describe('review round 2 (record 35 §9)', () => {
  /** Hold storage's copies until the returned function is called. */
  function holdCopies(): () => void {
    let release: () => void = () => {};
    net.hold = new Promise<void>((r) => { release = r; });
    return release;
  }
  /** Let the held copies answer and their results land. */
  async function land(release: () => void) {
    release();
    for (let i = 0; i < 4; i += 1) await nextTask();
  }
  const imageClip = (id: string, imageSrc: string | null) => ({ id, type: 'image', x: 30, y: 30, w: 100, h: 80, content: '', imageSrc, imageFit: 'contain', tableData: null });

  it('R2-1: ⌘D while storage copies the file: the clone is there at once, holding its original\'s file; ⌘Z removes it and nothing else; the copy landing adds nothing; ⌘⇧Z brings it back (with its own file since R3-3)', async () => {
    renderEditor();
    await select('b2');
    await press(document.body, X);
    const afterCut = structuredClone(blocks());
    const release = holdCopies();
    await select('im1');
    await press(document.body, D);
    expect(added(afterCut)).toHaveLength(1);
    expect(added(afterCut)[0]!.imageSrc).toBe(IMG);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(afterCut);
    await land(release);
    expect(net.copies).toHaveLength(1);
    expect(blocks()).toEqual(afterCut);
    await press(document.body, KEYS.redo);
    expect(added(afterCut)).toHaveLength(1);
    expect(added(afterCut)[0]!.imageSrc).toMatch(OWN_FILE('fixture-1'));
  });

  it('R2-1: a second ⌘D while the first clone\'s file is copied clones that clone, 1 in further; each clone gets its own file once copied, silently (two ⌘Z remove both)', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await select('im1');
    await press(document.body, D);
    await press(document.body, D);
    const o = block('im1');
    expect(added(before).map((b) => [b.x - o.x, b.y - o.y])).toEqual([[10, 10], [20, 20]]);
    await land(release);
    await waitFor(() => expect(added(before).map((b) => OWN_FILE('fixture-1').test(b.imageSrc ?? ''))).toEqual([true, true]));
    expect(new Set(added(before).map((b) => b.imageSrc)).size).toBe(2);
    await press(document.body, KEYS.undo);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('R2-1: a Replace on the clone before its file is copied stays (the copy takes the place of its original\'s file only)', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await select('im1');
    await press(document.body, D);
    const clone = added(before)[0]!;
    const input = frame(clone.id).querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['C'], 'square.png', { type: 'image/png' })] } });
    await waitFor(() => expect(block(clone.id).imageSrc).not.toBe(IMG));
    const replaced = block(clone.id).imageSrc;
    await land(release);
    expect(net.copies).toHaveLength(1);
    expect(block(clone.id).imageSrc).toBe(replaced);
  });

  it('R2-1: ⌘V while storage copies the files: the copies are there at once, selected, the image showing its source (this account\'s own file); ⌘Z removes them and nothing else; ⌘⇧Z brings them back', async () => {
    renderEditor();
    await select('b1', 'im1');
    await press(document.body, C);
    const copied = clip.last!;
    await select('b2');
    await press(document.body, X);
    const afterCut = structuredClone(blocks());
    const release = holdCopies();
    await clickEmptyWorkspace();
    await pasteOnPage(copied);
    const made = added(afterCut);
    expect(made.map((b) => b.type)).toEqual(['text', 'image']);
    expect(made[1]!.imageSrc).toBe(IMG);
    expect(selectedBlocks().sort()).toEqual(made.map((b) => b.id).sort());
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(afterCut);
    await land(release);
    expect(net.copies).toHaveLength(1);
    expect(blocks()).toEqual(afterCut);
    await press(document.body, KEYS.redo);
    expect(added(afterCut).map((b) => b.id)).toEqual(made.map((b) => b.id));
  });

  it('R2-1: once copied, the pasted image holds its own file in place of the source, silently: one ⌘Z removes the paste', async () => {
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    expect(copy!.imageSrc).toBe(IMG);
    await land(release);
    await waitFor(() => expect(block(copy!.id).imageSrc).toMatch(OWN_FILE('fixture-1')));
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
  });

  it('R2-1: while copying, a pasted image whose source is another account\'s file shows nothing (never that path); once refused, empty with the toast', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    net.files.set('someone-else/p9/theirs.png', 'B');
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(marked({ v: 1, blocks: [imageClip('s3', 'storage://someone-else/p9/theirs.png')] }));
    expect(added(before)).toHaveLength(1);
    expect(added(before)[0]!.imageSrc).toBeNull();
    await land(release);
    await waitFor(() => expect(screen.getByText('1 image couldn\'t be copied, so its block is empty.')).toBeTruthy());
    expect(added(before)[0]!.imageSrc).toBeNull();
  });

  it('R2-1: a pasted image whose own-folder file is missing: shown from its source while copying, then emptied with the toast', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(marked({ v: 1, blocks: [imageClip('s4', 'storage://owner/fixture-1/missing.png')] }));
    expect(added(before)[0]!.imageSrc).toBe('storage://owner/fixture-1/missing.png');
    await land(release);
    await waitFor(() => expect(screen.getByText('1 image couldn\'t be copied, so its block is empty.')).toBeTruthy());
    expect(added(before)[0]!.imageSrc).toBeNull();
  });

  it('R2-2: an image cropped by 60 % on one side (the crop overlay allows up to 90 %): ⌘C carries the crop; the copy, and the block cut and pasted back, hold it', async () => {
    const crop = { top: 0, right: 0, bottom: 0, left: 60 };
    open(docWith([], (b) => (b.id === 'im1' ? { ...b, imageSrc: IMG, crop } : b)));
    renderEditor();
    await select('im1');
    await press(document.body, C);
    expect(payload().blocks[0].crop).toEqual(crop);
    await clickEmptyWorkspace();
    let before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]!.crop).toEqual(crop);
    await select('im1');
    await press(document.body, X);
    before = structuredClone(blocks());
    await clickEmptyWorkspace();
    await pasteOnPage(clip.last!);
    await waitFor(() => expect(added(before)).toHaveLength(1));
    expect(added(before)[0]!.crop).toEqual(crop);
  });
});

describe('review round 3 (record 35 §9)', () => {
  function holdCopies(): () => void {
    let release: () => void = () => {};
    net.hold = new Promise<void>((r) => { release = r; });
    return release;
  }
  async function land(release: () => void) {
    release();
    for (let i = 0; i < 4; i += 1) await nextTask();
  }
  const MISSING = 'storage://owner/fixture-1/missing.png';
  const imageClip = (id: string, imageSrc: string | null) => ({ id, type: 'image', x: 30, y: 30, w: 100, h: 80, content: '', imageSrc, imageFit: 'contain', tableData: null });
  const LOST = /couldn't be copied/;
  const extractPath = (src: string) => src.replace(/^storage:\/\//, '');

  it('R3-1: ⌘X of a figure, then ⌘V in another poster while storage is busy (503 on every try): the pasted figure keeps the file it shows (still there), no toast', async () => {
    net.copyError = { message: '503 Service Unavailable', statusCode: '503' };
    renderEditor();
    await select('im1');
    await press(document.body, X);
    expect(blocks().some((b) => b.id === 'im1')).toBe(false);
    const other = undoDoc();
    open({ ...other, blocks: other.blocks.map((b) => ({ ...b, id: `${b.id}x` })) }, 'fixture-2');
    await nextTask();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    expect(copy!.imageSrc).toBe(IMG);
    // Storage's three tries, 1 s and 4 s apart.
    await waitFor(() => expect(net.copies).toHaveLength(3), { timeout: 8000 });
    for (let i = 0; i < 4; i += 1) await nextTask();
    expect(block(copy!.id).imageSrc).toBe(IMG);
    expect(net.files.has('owner/fixture-1/im1.png')).toBe(true);
    expect(screen.queryByText(LOST)).toBeNull();
  }, 15000);

  it('R3-2: ⌘Z pressed before a refused copy answers: no "couldn\'t be copied" toast (its block is not on the poster)', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(marked({ v: 1, blocks: [imageClip('s5', MISSING)] }));
    expect(added(before)).toHaveLength(1);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
    await land(release);
    expect(net.copies).toHaveLength(1);
    expect(screen.queryByText(LOST)).toBeNull();
  });

  it('R3-2: a Replace on the pasted image before its refused copy answers: the Replace stays and no "couldn\'t be copied" toast', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(marked({ v: 1, blocks: [imageClip('s6', MISSING)] }));
    const [copy] = added(before);
    const input = frame(copy!.id).querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['C'], 'square.png', { type: 'image/png' })] } });
    await waitFor(() => expect(block(copy!.id).imageSrc).toMatch(OWN_FILE('fixture-1')));
    const replaced = block(copy!.id).imageSrc;
    await land(release);
    expect(net.copies).toHaveLength(1);
    expect(block(copy!.id).imageSrc).toBe(replaced);
    expect(screen.queryByText(LOST)).toBeNull();
  });

  it('R3-2: the toast still names a pasted image left empty (another account\'s file), and only it', async () => {
    renderEditor();
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    await pasteOnPage(marked({ v: 1, blocks: [imageClip('s7', 'storage://someone-else/p9/theirs.png'), imageClip('s8', IMG)] }));
    await waitFor(() => expect(screen.getByText('1 image couldn\'t be copied, so its block is empty.')).toBeTruthy());
    expect(added(before).map((b) => b.imageSrc === null)).toEqual([true, false]);
  });

  it('R3-3: a step made while a pasted image\'s file is copied, undone once the file is copied: the step is undone and the copy keeps its own file', async () => {
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    expect(copy!.imageSrc).toBe(IMG);
    await select('b1');
    await press(document.body, { key: 'ArrowRight', code: 'ArrowRight' });
    const moved = block('b1').x;
    expect(moved).not.toBe(before.find((b) => b.id === 'b1')!.x);
    await land(release);
    await waitFor(() => expect(block(copy!.id).imageSrc).toMatch(OWN_FILE('fixture-1')));
    const own = block(copy!.id).imageSrc;
    await clickEmptyWorkspace();
    await press(document.body, KEYS.undo);
    expect(block('b1').x).toBe(before.find((b) => b.id === 'b1')!.x);
    expect(block(copy!.id).imageSrc).toBe(own);
    await press(document.body, KEYS.redo);
    expect(block('b1').x).toBe(moved);
    expect(block(copy!.id).imageSrc).toBe(own);
  });

  it('R3-3: ⌘D, then a step made while the clone\'s file is copied, undone once copied: the clone keeps its own file', async () => {
    renderEditor();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await select('im1');
    await press(document.body, D);
    const [clone] = added(before);
    await select('b1');
    await press(document.body, { key: 'ArrowRight', code: 'ArrowRight' });
    await land(release);
    await waitFor(() => expect(block(clone!.id).imageSrc).toMatch(OWN_FILE('fixture-1')));
    const own = block(clone!.id).imageSrc;
    await clickEmptyWorkspace();
    await press(document.body, KEYS.undo);
    expect(block('b1').x).toBe(before.find((b) => b.id === 'b1')!.x);
    expect(block(clone!.id).imageSrc).toBe(own);
  });

  it('R3-3: ⌘V, ⌘Z before the file is copied, ⌘⇧Z once it is: the copy brought back holds its own file', async () => {
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
    await land(release);
    expect(net.copies).toHaveLength(1);
    await press(document.body, KEYS.redo);
    expect(block(copy!.id).imageSrc).toMatch(OWN_FILE('fixture-1'));
    expect(net.files.has(extractPath(block(copy!.id).imageSrc!))).toBe(true);
  });

  it('R3-3\'s sibling: the pasted copy dragged while its file is copied (pressed before, released after): one ⌘Z undoes the drag and the copy keeps its own file', async () => {
    renderEditor();
    await select('im1');
    await press(document.body, C);
    await clickEmptyWorkspace();
    const before = structuredClone(blocks());
    const release = holdCopies();
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    const grip = frame(copy!.id).querySelector('button[title^="Drag to move"]')!;
    expect(grip, 'precondition: the pasted copy is selected, with its move button').not.toBeNull();
    const at = (type: string, x: number, target: EventTarget = window) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 50 }));
    at('pointerdown', 100, grip);
    await nextTask();
    for (let i = 1; i <= 4; i += 1) { at('pointermove', 100 + 15 * i); await nextTask(); }
    await land(release);
    await waitFor(() => expect(block(copy!.id).imageSrc).toMatch(OWN_FILE('fixture-1')));
    const own = block(copy!.id).imageSrc;
    for (let i = 5; i <= 8; i += 1) { at('pointermove', 100 + 15 * i); await nextTask(); }
    at('pointerup', 220);
    await nextTask();
    expect(block(copy!.id).x, 'the drag moved the copy').not.toBe(copy!.x);
    await press(document.body, KEYS.undo);
    expect(block(copy!.id).x).toBe(copy!.x);
    expect(block(copy!.id).imageSrc).toBe(own);
  });

  /** A drag on `grip` as the browser delivers it: pointerdown there, pointer moves on the window, pointerup. */
  async function gesture(grip: Element, points: Array<[number, number]>) {
    const at = (type: string, [x, y]: [number, number], target: EventTarget = window) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    at('pointerdown', points[0]!, grip);
    await nextTask();
    for (const p of points.slice(1)) { at('pointermove', p); await nextTask(); }
    at('pointerup', points.at(-1)!);
    await nextTask();
  }

  it('R3-3\'s sibling, the drag\'s step since the change: a resize drag is undone by one ⌘Z, the size as before', async () => {
    renderEditor();
    await select('b1');
    const o = structuredClone(block('b1'));
    await gesture(frame('b1').querySelector('[data-postr-resize-handle="se"]')!, [[100, 100], [130, 120], [160, 140]]);
    expect([block('b1').w, block('b1').h], 'the resize drag changed the size').not.toEqual([o.w, o.h]);
    await press(document.body, KEYS.undo);
    expect(block('b1')).toEqual(o);
  });

  /** A double- or triple-click on the canvas that selects `select()`'s words as it ends: the browser's events in their order (MEASURED, record 35 §9: pointerdown's detail is 0 in Chromium and Firefox, mousedown's the click count). */
  function multiClickOnCanvas(target: Element, count: number, select: () => void) {
    for (let n = 1; n <= count; n += 1) {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: n }));
      if (n === count) select();
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, detail: n }));
    }
  }

  it('R3-4: a word double-clicked in the References block (nothing being edited): the word stays selected and ⌘C is the browser\'s copy of it', async () => {
    const refs = { id: 'rf1', type: 'references', x: 250, y: 20, w: 210, h: 80, content: '', imageSrc: null, imageFit: 'contain', tableData: null } as Block;
    open({ ...docWith([refs], filled), references: [{ id: 'r1', authors: ['Smith J'], year: '2020', title: 'ZQREFTITLE words', journal: 'Acme J' }] });
    renderEditor();
    await select('rf1');
    const el = frame('rf1');
    const word = document.createElement('span');
    word.setAttribute('data-zq-temp', '');
    word.textContent = 'ZQREFTITLE';
    el.appendChild(word);
    multiClickOnCanvas(el, 2, () => window.getSelection()!.selectAllChildren(word));
    expect(String(window.getSelection())).toBe('ZQREFTITLE');
    expect(await press(document.body, C)).toBe(false);
    expect(clip.events).toBe(0);
    window.getSelection()!.removeAllRanges();
  });

  it('R3-4: a triple-click keeps its line selected too; a single press still clears the words it leaves selected', async () => {
    renderEditor();
    await select('h1');
    const el = frame('h1');
    const line = document.createElement('span');
    line.setAttribute('data-zq-temp', '');
    line.textContent = 'ZQ a whole line';
    el.appendChild(line);
    multiClickOnCanvas(el, 3, () => window.getSelection()!.selectAllChildren(line));
    expect(String(window.getSelection())).toBe('ZQ a whole line');
    multiClickOnCanvas(el, 1, () => window.getSelection()!.selectAllChildren(line));
    expect(String(window.getSelection())).toBe('');
  });
});

describe('the final check (record 35 §9, correction 4)', () => {
  const LOST = /couldn't be copied/;
  /** ⌘X of the figure in this poster, the user's other poster opened, ⌘V there; storage's first copy made with its answer lost (`fate`). */
  async function cutPasteElsewhere(fate: 'written504' | 'writtenLost') {
    renderEditor();
    await select('im1');
    await press(document.body, X);
    const other = undoDoc();
    open({ ...other, blocks: other.blocks.map((b) => ({ ...b, id: `${b.id}x` })) }, 'fixture-2');
    await nextTask();
    await clickEmptyWorkspace();
    net.copyPlan = [fate];
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    expect(copy!.imageSrc).toBe(IMG);
    // The lost answer, then the retry 1 s later.
    await waitFor(() => expect(net.copies).toHaveLength(2), { timeout: 6000 });
    for (let i = 0; i < 4; i += 1) await nextTask();
    return block(copy!.id);
  }

  it('F35-FC-1: storage made the first copy but the gateway answered 504; the retry: the pasted figure holds its own file in this poster, no toast', async () => {
    const held = await cutPasteElsewhere('written504');
    expect(held.imageSrc).toMatch(OWN_FILE('fixture-2'));
    expect(net.files.get(held.imageSrc!.replace(/^storage:\/\//, ''))).toBe('A');
    expect(screen.queryByText(LOST)).toBeNull();
  }, 15000);

  it('F35-FC-1\'s sibling: the first copy made, its answer lost on the network; the retry: its own file, no toast', async () => {
    const held = await cutPasteElsewhere('writtenLost');
    expect(held.imageSrc).toMatch(OWN_FILE('fixture-2'));
    expect(screen.queryByText(LOST)).toBeNull();
  }, 15000);
});

describe('the final check\'s F35-FC-2 (record 35 §9, correction 5: the lead\'s rule)', () => {
  const LOST = /couldn't be copied/;
  /**
   * ⌘X of the figure in this poster, the user's other poster opened, ⌘V
   * there; storage answering the copy's tries as `answers` says (the file
   * there unless `missing`). Returns the pasted block once `tries` copies
   * were asked for.
   */
  async function cutPasteRefused(answers: Array<{ message: string; statusCode: string }>, tries: number, { missing = false } = {}) {
    renderEditor();
    await select('im1');
    await press(document.body, X);
    if (missing) net.files.delete('owner/fixture-1/im1.png');
    const other = undoDoc();
    open({ ...other, blocks: other.blocks.map((b) => ({ ...b, id: `${b.id}x` })) }, 'fixture-2');
    await nextTask();
    await clickEmptyWorkspace();
    net.copyAnswers = [...answers];
    const before = structuredClone(blocks());
    await pasteOnPage(clip.last!);
    const [copy] = added(before);
    expect(copy, 'precondition: the figure is pasted').toBeTruthy();
    await waitFor(() => expect(net.copies).toHaveLength(tries), { timeout: 6000 });
    expect(net.copies[0]![0], 'precondition: its own-folder source is copied').toBe('owner/fixture-1/im1.png');
    for (let i = 0; i < 4; i += 1) await nextTask();
    return block(copy!.id);
  }
  const E403 = { message: 'new row violates row-level security policy', statusCode: '403' };
  const JWT = { message: 'jwt expired', statusCode: '400' };
  const BUSY = { message: '503 Service Unavailable', statusCode: '503' };
  const E404 = { message: 'Object not found', statusCode: '404' };
  const E409 = { message: 'The resource already exists', statusCode: '409' };

  it('a 403 (row-level security) while the file is there: the pasted figure keeps the file it shows, no toast', async () => {
    const held = await cutPasteRefused([E403], 1);
    expect(held.imageSrc).toBe(IMG);
    expect(net.files.has('owner/fixture-1/im1.png')).toBe(true);
    expect(screen.queryByText(LOST)).toBeNull();
  });

  it('a 400 InvalidJWT ("jwt expired") on the first try: kept, no toast', async () => {
    const held = await cutPasteRefused([JWT], 1);
    expect(held.imageSrc).toBe(IMG);
    expect(screen.queryByText(LOST)).toBeNull();
  });

  it('a 409 on the first try: kept, no toast', async () => {
    const held = await cutPasteRefused([E409], 1);
    expect(held.imageSrc).toBe(IMG);
    expect(screen.queryByText(LOST)).toBeNull();
  });

  it('busy (503), then a 404 while the file is there: not a clear "missing", kept, no toast', async () => {
    const held = await cutPasteRefused([BUSY, E404], 2);
    expect(held.imageSrc).toBe(IMG);
    expect(screen.queryByText(LOST)).toBeNull();
  }, 15000);

  it('busy (503), then a 400 InvalidJWT: kept, no toast', async () => {
    const held = await cutPasteRefused([BUSY, JWT], 2);
    expect(held.imageSrc).toBe(IMG);
    expect(screen.queryByText(LOST)).toBeNull();
  }, 15000);

  it('⌘D of an image whose file is not there, ⌘Z before its copy answers: no toast (the clone is not on the poster); ⌘⇧Z brings it back empty', async () => {
    net.files.delete('owner/fixture-1/im1.png');
    let release: () => void = () => {};
    net.hold = new Promise<void>((r) => { release = r; });
    renderEditor();
    await select('im1');
    const before = structuredClone(blocks());
    await press(document.body, D);
    const [clone] = added(before);
    expect(clone!.imageSrc).toBe(IMG);
    await press(document.body, KEYS.undo);
    expect(blocks()).toEqual(before);
    release();
    await waitFor(() => expect(net.copies).toHaveLength(1));
    for (let i = 0; i < 4; i += 1) await nextTask();
    expect(screen.queryByText(LOST)).toBeNull();
    await press(document.body, KEYS.redo);
    expect(block(clone!.id).imageSrc).toBeNull();
  });

  it('the control: the file not there (storage\'s 404 on the first try): emptied, with the toast', async () => {
    const held = await cutPasteRefused([], 1, { missing: true });
    expect(held.imageSrc).toBeNull();
    await waitFor(() => expect(screen.getByText('1 image couldn\'t be copied, so its block is empty.')).toBeTruthy());
  });
});
