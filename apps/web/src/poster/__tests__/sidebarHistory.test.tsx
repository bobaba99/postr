/**
 * Fix 01 — a sidebar change must not wipe the undo history or the poster's
 * name. Engineering record: docs/fixes/01-sidebar-undo-history.md.
 *
 * Each describe block tests ONE stated hypothesis and asserts the CORRECT
 * behaviour, so on the unfixed code these fail, and the failure pattern is the
 * evidence. Everything enters where a user enters: typing into the canvas
 * contenteditable, clicking a sidebar tab by its label, changing a real
 * <select>/<input>, pressing ⌘Z on the page.
 *
 *   H1   Sidebar edits reach the store through setPoster — the LOAD-a-poster
 *        action — which clears the undo and redo stacks.
 *   H2   setPoster writes posterTitle = title ?? '', and the sidebar path
 *        passes no title, so the display name is blanked.
 *   H3   Autosave sends the store's display name and falls back to the title
 *        block's text when it is empty, so the blank is SAVED over the name.
 *   Halt History is lost to something else — e.g. the sidebar tab remounting
 *        — not to the setting change itself.
 *
 * Found by the post-fix review once history was kept (each red before its
 * change; see the record, section 8):
 *   F1   undo/redo restore the credit mark verbatim and never re-place it, so
 *        redo across a size change that dropped the mark leaves it off the sheet.
 *   F2   undo/redo do not end the edit in progress, so the next edit to the
 *        same field joins the undone one and the following undo goes too far.
 *   F3   keying sidebar edits by field merged separate CLICKS on one control.
 *   F4   a click that changes nothing still added an undo step.
 *
 * Re-run: npx vitest run src/poster/__tests__/sidebarHistory.test.tsx --reporter=verbose
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
const upsertSpy = vi.hoisted(() => vi.fn(async () => ({})));

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
// Only the network write is replaced; every other export stays real.
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: upsertSpy,
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { PosterEditor } from '../PosterEditor';
import { usePosterStore } from '@/stores/posterStore';
import { ACK_BLOCK_ID } from '@/export/ackBlock';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const NAME = 'Lab meeting draft v3';
const TITLE_BLOCK = 'Effects of Sample Treatment on Model Outcomes';

function makeDoc(): PosterDoc {
  const base = { imageSrc: null, imageFit: 'contain' as const, tableData: null };
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [
      { ...base, id: 't1', type: 'title', x: 20, y: 20, w: 440, h: 70, content: TITLE_BLOCK },
      { ...base, id: 'h1', type: 'heading', x: 20, y: 110, w: 210, h: 30, content: 'Methods' },
      { ...base, id: 'b1', type: 'text', x: 20, y: 150, w: 210, h: 150, content: 'Body copy.' },
    ],
    fontFamily: 'Source Sans 3',
    // Same palette/styles shape the editor's other tests use — a partial one
    // crashes the render, and a crash fails every assertion for the wrong
    // reason.
    palette: {
      bg: '#ffffff',
      primary: '#1a1a26',
      accent: '#7c6aed',
      accent2: '#4a6cf7',
      muted: '#6b7280',
      headerBg: '#f3f4f6',
      headerFg: '#1a1a26',
    },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: [] }],
    references: [{ id: 'ref1', authors: ['Smith, John'], year: '2020', title: 'Alpha study' }],
  } as unknown as PosterDoc;
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/p/fixture']}>
      <PosterEditor />
    </MemoryRouter>,
  );
}

/** Click a sidebar tab by its visible label. */
function openTab(label: RegExp) {
  const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-postr-tab]')).find((el) =>
    label.test((el.textContent ?? '').trim()),
  );
  if (!tab) throw new Error(`no sidebar tab matching ${label}`);
  fireEvent.click(tab);
}

/** Type into a block the way the browser delivers it: mutate, then `input`. */
function typeInto(blockId: string, extra: string) {
  const frame = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
  const editable = frame.querySelector('[contenteditable]') as HTMLElement;
  editable.innerHTML = editable.innerHTML + extra;
  fireEvent.input(editable);
}

const bodyText = () => usePosterStore.getState().doc!.blocks.find((b) => b.id === 'b1')!.content;
const pressUndo = () => fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

const pressRedo = () => fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
const doc = () => usePosterStore.getState().doc!;

/**
 * In a browser every click and every keystroke is its own task, so the
 * microtask queue drains between two user actions. The store relies on that
 * (edits made in ONE synchronous run are one undo step), so a test that
 * fires two actions back to back without yielding would model a single
 * action. Every user-action helper below therefore ends with a task boundary.
 * The older single-edit tests (Halt, H1–H3) call a control directly: they
 * make one document edit, which is one run either way.
 */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function click(el: Element | null | undefined, what: string) {
  if (!el) throw new Error(`nothing to click: ${what}`);
  fireEvent.click(el);
  await nextTask();
}

/** Click a button whose own text, or one of its lines, is exactly `text`. */
function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (b) =>
      (b.textContent ?? '').trim() === text ||
      Array.from(b.querySelectorAll('span')).some((s) => (s.textContent ?? '').trim() === text),
  );
}
const clickButton = (text: string) => click(findButton(text), `button "${text}"`);

/** Type into an <input> one keystroke at a time, as the browser reports it. */
async function typeKeystrokes(input: HTMLInputElement, values: string[]) {
  for (const value of values) {
    fireEvent.change(input, { target: { value } });
    await nextTask();
  }
}

async function undoKey() {
  pressUndo();
  await nextTask();
}
async function redoKey() {
  pressRedo();
  await nextTask();
}
async function actOn(control: { act: () => void }) {
  control.act();
  await nextTask();
}

/**
 * The undo window is measured with Date.now(). Freezing it makes "inside
 * 600 ms" a fact of the test rather than of the machine's speed; `advance`
 * moves past the window when a test needs a pause.
 */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};
function freezeClock() {
  clock = 1_000_000;
  return vi.spyOn(Date, 'now').mockImplementation(() => clock);
}

/**
 * Confirm the dialog that is open. Since fix 02 a size change and a template
 * ask first; the dialog mounts within the same act() as the click.
 */
function confirmOpenDialog() {
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('[data-postr-modal-content][data-state="open"]'));
  const box = boxes[boxes.length - 1];
  if (!box) throw new Error('no dialog is open');
  const ok = Array.from(box.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() !== 'Cancel');
  fireEvent.click(ok!);
}

/** Type a whole value into a Layout size field, press Enter, and confirm (fix 02). */
function commitSizeField(field: 'width' | 'height', value: string) {
  const input = document.querySelector(`[aria-label="Poster ${field} in inches"]`) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
  confirmOpenDialog();
}

/** The sidebar controls exercised, each through a different updateDoc caller. */
const CONTROLS: Array<{ name: string; tab: RegExp; act: () => void; read: () => unknown }> = [
  {
    name: 'Style › Font',
    tab: /style/i,
    read: () => doc().fontFamily,
    act: () => {
      const font = usePosterStore.getState().doc!.fontFamily;
      const select = Array.from(document.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === font),
      ) as HTMLSelectElement;
      const other = Array.from(select.options).find((o) => o.value && o.value !== font)!;
      fireEvent.change(select, { target: { value: other.value } });
    },
  },
  {
    name: 'Layout › Poster width',
    tab: /layout/i,
    read: () => doc().widthIn,
    act: () => commitSizeField('width', '40'),
  },
  {
    name: 'Layout › Poster size preset',
    tab: /layout/i,
    read: () => `${doc().widthIn}x${doc().heightIn}`,
    act: () => {
      const select = Array.from(document.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === 'custom'),
      ) as HTMLSelectElement;
      const other = Array.from(select.options).find(
        (o) => o.value && o.value !== 'custom' && o.value !== select.value,
      )!;
      fireEvent.change(select, { target: { value: other.value } });
      confirmOpenDialog();
    },
  },
];

/** The fixture plus one institution, so the institution fields exist. */
function withInstitution(): PosterDoc {
  return {
    ...makeDoc(),
    institutions: [{ id: 'i1', name: 'Acme State University', dept: 'Biology', location: 'Springfield' }],
  } as unknown as PosterDoc;
}

const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;

async function openEditBlockTab() {
  await click(q('[data-block-id="b1"]'), 'block b1'); // select the body text block
  openTab(/edit block/i);
}

/**
 * Every sidebar input that fires on each keystroke, drag or colour pick.
 * Each must merge its burst into ONE undo step — otherwise dragging a slider
 * fills the history with one entry per event (the flood behind FINDINGS F3).
 */
const CONTINUOUS: Array<{
  name: string;
  open: () => Promise<void> | void;
  input: () => HTMLInputElement;
  values: string[];
  read: () => unknown;
}> = [
  { name: 'Authors › author name', open: () => openTab(/authors/i), input: () => q('input[placeholder="Author name"]'), values: ['J', 'Jo', 'Joh'], read: () => doc().authors[0]!.name },
  { name: 'Authors › institution name', open: () => openTab(/authors/i), input: () => q('[aria-label="Institution 1 name"]'), values: ['S', 'Sa', 'Sam'], read: () => doc().institutions[0]!.name },
  { name: 'Authors › institution department', open: () => openTab(/authors/i), input: () => q('[aria-label="Institution 1 department"]'), values: ['C', 'Ch', 'Che'], read: () => doc().institutions[0]!.dept },
  { name: 'Authors › institution city', open: () => openTab(/authors/i), input: () => q('[aria-label="Institution 1 city"]'), values: ['O', 'Os', 'Osl'], read: () => doc().institutions[0]!.location },
  { name: 'Style › title size', open: () => openTab(/style/i), input: () => q('input[title="Font size (points)"]'), values: ['7', '72'], read: () => doc().styles.title.size },
  { name: 'Style › title line height', open: () => openTab(/style/i), input: () => q('input[title="Line height (1.0–3.0)"]'), values: ['1.5', '1.55'], read: () => doc().styles.title.lineHeight },
  { name: 'Edit block › text size', open: openEditBlockTab, input: () => q('input[title="Font size (points)"]'), values: ['2', '24'], read: () => doc().styles.body.size },
  { name: 'Edit block › line spacing slider', open: openEditBlockTab, input: () => q('input[type="range"]'), values: ['1.5', '1.6', '1.7'], read: () => doc().styles.body.lineHeight },
  { name: 'Edit block › line spacing number', open: openEditBlockTab, input: () => q('input[title="Line height (1.0–3.0)"]'), values: ['1.8', '1.85'], read: () => doc().styles.body.lineHeight },
  { name: 'Edit block › text colour', open: openEditBlockTab, input: () => q('input[type="color"]'), values: ['#112233', '#223344', '#334455'], read: () => doc().styles.body.color },
];

/** Discrete controls: each click is one user action, so one undo step. */
const CLICKS: Array<{
  name: string;
  open: () => Promise<void> | void;
  click: (n: number) => Promise<void>;
  read: () => unknown;
}> = [
  { name: 'Style › heading border', open: () => openTab(/style/i), click: (n) => clickButton(['Box', 'Left'][n]!), read: () => doc().headingStyle.border },
  { name: 'Style › title italic', open: () => openTab(/style/i), click: () => click(q('button[aria-pressed]'), 'italic'), read: () => doc().styles.title.italic },
  {
    name: 'Style › title weight',
    open: () => openTab(/style/i),
    click: async (n) => {
      const weight = Array.from(document.querySelectorAll('select')).find((el) =>
        Array.from(el.options).some((o) => o.value === '700'),
      )!;
      fireEvent.change(weight, { target: { value: ['400', '300'][n] } });
      await nextTask();
    },
    read: () => doc().styles.title.weight,
  },
  { name: 'Style › font', open: () => openTab(/style/i), click: () => actOn(CONTROLS[0]!), read: () => doc().fontFamily },
  { name: 'Layout › size preset', open: () => openTab(/layout/i), click: () => actOn(CONTROLS[2]!), read: () => `${doc().widthIn}x${doc().heightIn}` },
  { name: 'Style › palette', open: () => openTab(/style/i), click: (n) => clickButton(['Nature / Biology', 'Engineering'][n]!), read: () => doc().palette.accent },
  { name: 'Authors › add institution', open: () => openTab(/authors/i), click: () => clickButton('+ Add Institution'), read: () => doc().institutions.length },
  { name: 'Authors › add author', open: () => openTab(/authors/i), click: () => clickButton('+ Add Author'), read: () => doc().authors.length },
  {
    name: 'Edit block › weight',
    open: openEditBlockTab,
    click: async (n) => {
      const weight = Array.from(document.querySelectorAll('select')).find((el) =>
        Array.from(el.options).some((o) => o.value === '700'),
      )!;
      fireEvent.change(weight, { target: { value: ['700', '300'][n] } });
      await nextTask();
    },
    read: () => doc().styles.body.weight,
  },
  { name: 'Edit block › italic', open: openEditBlockTab, click: () => click(q('button[title="Italic"]'), 'italic'), read: () => doc().styles.body.italic },
  { name: 'Authors › corresponding checkbox', open: () => openTab(/authors/i), click: () => click(Array.from(document.querySelectorAll('label')).find((l) => (l.textContent ?? '').trim() === 'Corresponding')?.querySelector('input'), 'corresponding'), read: () => doc().authors[0]!.isCorresponding },
];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  upsertSpy.mockClear();
  usePosterStore.getState().setPoster('fixture-1', makeDoc(), NAME);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks(); // the frozen Date.now, where a test froze it
});

describe('Halt — opening a sidebar tab does not touch the history', () => {
  it.each(CONTROLS)('$name: history survives opening the tab', ({ tab }) => {
    renderEditor();
    typeInto('b1', ' TYPED');
    expect(usePosterStore.getState().canUndo).toBe(true);
    openTab(tab);
    expect(usePosterStore.getState().canUndo, 'canUndo right after the tab opens').toBe(true);
  });
});

describe('H1 — a sidebar change keeps the undo history', () => {
  it.each(CONTROLS)('$name: earlier typing can still be undone', ({ tab, act: change, read }) => {
    renderEditor();
    typeInto('b1', ' TYPED');
    openTab(tab);
    const setting0 = read();
    change();
    expect(read(), 'the control changed the setting').not.toEqual(setting0);
    expect(usePosterStore.getState().canUndo, 'canUndo after the sidebar change').toBe(true);
    pressUndo();
    expect(read(), '⌘Z #1 reverts the setting').toEqual(setting0);
    expect(bodyText(), '⌘Z #1 leaves the typing').toContain('TYPED');
    pressUndo();
    expect(bodyText(), '⌘Z #2 reverts the typing').not.toContain('TYPED');
  });

  it('the sidebar change itself is one undo step', () => {
    renderEditor();
    const before = usePosterStore.getState().doc!.fontFamily;
    openTab(/style/i);
    CONTROLS[0]!.act();
    expect(usePosterStore.getState().doc!.fontFamily).not.toBe(before);
    pressUndo();
    expect(usePosterStore.getState().doc!.fontFamily).toBe(before);
  });
});

describe('H2 — a sidebar change keeps the poster name', () => {
  it.each(CONTROLS)('$name: the display name is unchanged', ({ tab, act: change }) => {
    renderEditor();
    openTab(tab);
    change();
    expect(usePosterStore.getState().posterTitle).toBe(NAME);
  });
});

describe("H3 — the next save keeps the user's poster name", () => {
  it('Style › Font: the saved title is the name, not the title block', async () => {
    // Fake ONLY the timers autosave uses. Faking Date as well stalls the
    // sidebar's GSAP entrance tween in whatever test runs next.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderEditor();
    openTab(/style/i);
    CONTROLS[0]!.act();
    await act(async () => {
      vi.advanceTimersByTime(1_000); // past the 800 ms autosave debounce
    });
    const calls = upsertSpy.mock.calls as unknown as Array<[string, { title?: string }]>;
    expect(calls.length, 'autosave ran').toBeGreaterThan(0);
    const saved = calls[calls.length - 1]![1].title;
    expect(saved, 'title written to posters.title').toBe(NAME);
  });
});

describe('undo steps are shaped like PowerPoint: a click is one step, typing merges (F3)', () => {
  beforeEach(() => {
    freezeClock(); // every action below lands inside the 600 ms window
  });

  it('two clicks on the same control are two undo steps', async () => {
    renderEditor();
    openTab(/style/i);
    expect(doc().headingStyle.border).toBe('bottom');
    await clickButton('Box');
    await clickButton('Left');
    await undoKey();
    expect(doc().headingStyle.border, '⌘Z #1 undoes only "Left"').toBe('box');
    await undoKey();
    expect(doc().headingStyle.border, '⌘Z #2 undoes "Box"').toBe('bottom');
  });

  it('deleting two references is two undo steps', async () => {
    const three = {
      ...makeDoc(),
      references: ['Alpha', 'Beta', 'Gamma'].map((title, i) => ({
        id: `ref${i + 1}`,
        authors: ['Smith, John'],
        year: '2020',
        title,
      })),
    } as unknown as PosterDoc;
    usePosterStore.getState().setPoster('fixture-1', three, NAME);
    renderEditor();
    openTab(/references/i);
    await click(document.querySelector('[aria-label="Remove reference"]'), 'remove #1');
    await click(document.querySelector('[aria-label="Remove reference"]'), 'remove #2');
    expect(doc().references).toHaveLength(1);
    await undoKey();
    expect(doc().references, '⌘Z #1 restores one reference').toHaveLength(2);
    await undoKey();
    expect(doc().references).toHaveLength(3);
  });

  it('two different controls back to back are two undo steps', async () => {
    renderEditor();
    openTab(/style/i);
    const font0 = doc().fontFamily;
    await actOn(CONTROLS[0]!); // font
    const font1 = doc().fontFamily;
    await clickButton('Box');
    await undoKey();
    expect(doc().fontFamily, '⌘Z #1 leaves the font change').toBe(font1);
    expect(doc().headingStyle.border).toBe('bottom');
    await undoKey();
    expect(doc().fontFamily).toBe(font0);
  });

  it.each(CONTINUOUS)('$name: typed or dragged in bursts, one undo step', async (row) => {
    usePosterStore.getState().setPoster('fixture-1', withInstitution(), NAME);
    renderEditor();
    await row.open();
    const value0 = row.read();
    const input = row.input();
    expect(input, 'the input is on screen').toBeTruthy();
    await typeKeystrokes(input, row.values);
    expect(row.read(), 'the input changed the setting').not.toEqual(value0);
    await undoKey();
    expect(row.read(), 'one ⌘Z undoes the whole burst').toEqual(value0);
    expect(usePosterStore.getState().canUndo, 'the burst was one step').toBe(false);
  });

  it.each(CLICKS)('$name: two clicks, two undo steps', async (row) => {
    usePosterStore.getState().setPoster('fixture-1', withInstitution(), NAME);
    renderEditor();
    await row.open();
    const value0 = row.read();
    await row.click(0);
    const value1 = row.read();
    expect(value1, 'click 1 changed the setting').not.toEqual(value0);
    await row.click(1);
    expect(row.read(), 'click 2 changed the setting').not.toEqual(value1);
    await undoKey();
    expect(row.read(), '⌘Z #1 undoes only click 2').toEqual(value1);
    await undoKey();
    expect(row.read(), '⌘Z #2 undoes click 1').toEqual(value0);
  });

  // Since fix 02 a typed size applies once, when the field is committed and
  // confirmed (posterSize.test.tsx covers the keystrokes).
  it('committing a width, then a height, is two undo steps', async () => {
    renderEditor();
    openTab(/layout/i);
    commitSizeField('width', '40');
    await nextTask();
    commitSizeField('height', '30');
    await nextTask();
    await undoKey();
    expect(`${doc().widthIn}x${doc().heightIn}`, '⌘Z #1 undoes only the height').toBe('40x36');
  });

  it('dragging a colour, then Reset to palette, is two undo steps', async () => {
    renderEditor();
    await openEditBlockTab();
    await typeKeystrokes(q('input[type="color"]'), ['#112233', '#223344']);
    await clickButton('Reset to palette');
    expect(doc().styles.body.color).toBeNull();
    await undoKey();
    expect(doc().styles.body.color, '⌘Z #1 undoes only the reset').toBe('#223344');
  });

  it('a size preset right after a committed custom width is its own step', async () => {
    renderEditor();
    openTab(/layout/i);
    commitSizeField('width', '40');
    await nextTask();
    await actOn(CONTROLS[2]!); // size preset
    await undoKey();
    expect(`${doc().widthIn}x${doc().heightIn}`, '⌘Z #1 undoes only the preset').toBe('40x36');
  });

  it('pasting an author list — institutions, then authors — is one undo step', async () => {
    renderEditor();
    openTab(/authors/i);
    const paste = Array.from(document.querySelectorAll('textarea')).find((t) =>
      (t.placeholder ?? '').startsWith('John Smith'),
    )!;
    fireEvent.change(paste, {
      target: { value: 'John Smith1, Jane Roe2, (1) Acme State University, (2) Sample Research Institute' },
    });
    await clickButton('✨ Parse with AI'); // offline in the test: falls back to the local parser
    await waitFor(() => expect(doc().authors.length).toBeGreaterThan(1));
    expect(doc().institutions.length, 'the paste added institutions').toBeGreaterThan(0);
    await undoKey();
    expect(doc().institutions).toHaveLength(0);
    expect(doc().authors.map((a) => a.name)).toEqual(['Jane Doe']);
  });
});

describe('a click that changes nothing adds no undo step (F4)', () => {
  it('clicking the heading border that is already active', async () => {
    renderEditor();
    openTab(/style/i);
    expect(doc().headingStyle.border).toBe('bottom');
    await clickButton('Bottom');
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('clicking the palette already in use, saved with its keys in another order', async () => {
    // Postgres jsonb does not keep key order, so a palette loaded from the
    // database can list the same colours in a different order from the
    // catalog entry the palette row builds on click.
    const classicInJsonbOrder = {
      bg: '#FFFFFF',
      muted: '#6c757d',
      accent: '#1a80bb',
      accent2: '#ea801c',
      primary: '#12233a',
      headerBg: '#1a80bb',
      headerFg: '#fff',
    };
    usePosterStore
      .getState()
      .setPoster('fixture-1', { ...makeDoc(), palette: classicInJsonbOrder } as unknown as PosterDoc, NAME);
    renderEditor();
    openTab(/style/i);
    await clickButton('Classic Academic');
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('Reset to palette when the colour already follows the palette', async () => {
    renderEditor();
    await openEditBlockTab();
    expect(doc().styles.body.color).toBeNull();
    await clickButton('Reset to palette');
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('control: moving an author down IS a change, and one step', async () => {
    // Same fields, same values, different order: an order-blind comparison
    // would call this a no-op and silently drop the reorder.
    const two = {
      ...makeDoc(),
      authors: [
        { id: 'a1', name: 'Jane Doe', affiliationIds: [] },
        { id: 'a2', name: 'John Smith', affiliationIds: [] },
      ],
    } as unknown as PosterDoc;
    usePosterStore.getState().setPoster('fixture-1', two, NAME);
    renderEditor();
    openTab(/authors/i);
    await clickButton('▼');
    expect(doc().authors.map((a) => a.name)).toEqual(['John Smith', 'Jane Doe']);
    await undoKey();
    expect(doc().authors.map((a) => a.name)).toEqual(['Jane Doe', 'John Smith']);
  });

  it('control: clicking a different border does add a step', async () => {
    renderEditor();
    openTab(/style/i);
    await clickButton('Box');
    expect(usePosterStore.getState().canUndo).toBe(true);
  });
});

describe('an undo or redo ends the edit in progress (F2)', () => {
  // A continuous, keyed input: the Style-tab title size. (The custom size
  // fields were used here until fix 02 made them apply once, on commit.)
  const size = () => document.querySelector('input[title="Font size (points)"]') as HTMLInputElement;
  const titleSize = () => doc().styles.title.size;

  beforeEach(() => {
    freezeClock();
  });

  it('undo, then typing into the same field again: the next undo stops there', async () => {
    renderEditor();
    typeInto('b1', ' TYPED');
    openTab(/style/i);
    const s0 = titleSize();
    await typeKeystrokes(size(), ['7', '72']);
    await undoKey();
    expect(titleSize()).toBe(s0);
    await typeKeystrokes(size(), ['6', '64']);
    await undoKey(); // must undo only the "64"
    expect(titleSize()).toBe(s0);
    expect(bodyText(), 'the earlier canvas typing survives').toContain('TYPED');
  });

  it('redo, then typing into the same field again: the next undo stops at the redo', async () => {
    renderEditor();
    typeInto('b1', ' TYPED');
    openTab(/style/i);
    await typeKeystrokes(size(), ['7', '72']);
    const s72 = titleSize();
    await undoKey();
    await redoKey();
    expect(titleSize()).toBe(s72);
    await typeKeystrokes(size(), ['6', '64']);
    await undoKey();
    expect(titleSize(), 'undo returns to the redone 72 pt').toBe(s72);
  });

  it('control: with a pause longer than the window the same sequence already works', async () => {
    renderEditor();
    typeInto('b1', ' TYPED');
    openTab(/style/i);
    const s0 = titleSize();
    await typeKeystrokes(size(), ['7', '72']);
    await undoKey();
    advance(700);
    await typeKeystrokes(size(), ['6', '64']);
    await undoKey();
    expect(titleSize()).toBe(s0);
    expect(bodyText()).toContain('TYPED');
  });
});

describe('undo and redo across a size change keep the credit mark on the sheet (F1)', () => {
  const mark = () => doc().blocks.find((b) => b.id === ACK_BLOCK_ID);
  /** Inside the sheet, one margin (1 inch = 10 units) in from every edge. */
  const onSheet = (b: { x: number; y: number; w: number; h: number }) =>
    b.x >= 10 && b.y >= 10 && b.x + b.w <= doc().widthIn * 10 - 10 && b.y + b.h <= doc().heightIn * 10 - 10;
  beforeEach(() => {
    freezeClock();
    usePosterStore.getState().setPoster('fixture-1', makeDoc(), NAME, { seedAcknowledgement: true });
  });

  /**
   * One block filling the sheet above the mark's bottom band. On a 48×36
   * sheet the mark fits under it; moved onto a 10-inch-high sheet, the band
   * shrinks below the mark's 12 units, so the size change drops the mark.
   * (Until fix 02 the drop came from typing "2" on the way to "24"; typed
   * sizes now apply only when committed.)
   */
  function loadFull() {
    const d = makeDoc();
    const big = { ...d.blocks[2]!, id: 'big', x: 10, y: 10, w: 460, h: 312 };
    usePosterStore.getState().setPoster('fixture-1', { ...d, blocks: [big] } as PosterDoc, NAME, { seedAcknowledgement: true });
    expect(mark(), 'premise: at 48×36 the mark fits under the block').toBeDefined();
  }

  it('undo and redo across a size change that left no room for the mark', async () => {
    loadFull();
    renderEditor();
    openTab(/layout/i);
    commitSizeField('height', '10');
    await nextTask();
    expect(doc().heightIn).toBe(10);
    expect(mark(), 'premise: no room on the 10-inch sheet').toBeUndefined();
    await undoKey();
    expect(doc().heightIn).toBe(36);
    expect(mark() && onSheet(mark()!), 'after ⌘Z the mark is back on the sheet').toBe(true);
    await redoKey();
    expect(doc().heightIn).toBe(10);
    // Redo must not bring the mark back at the tall sheet's coordinates:
    // there is no room for it on this one.
    expect(mark()).toBeUndefined();
  });

  it('an unrelated undo leaves a mark the user placed over content exactly where it is', async () => {
    // The mark is draggable, so a saved poster can have it sitting on top of
    // another block. Re-placing on EVERY undo would move it — or, with no
    // legal spot left, drop it — whenever the user undoes anything at all.
    const seeded = usePosterStore.getState().doc!;
    const placed = {
      ...seeded,
      blocks: seeded.blocks.map((b) => (b.id === ACK_BLOCK_ID ? { ...b, x: 30, y: 30 } : b)),
    };
    usePosterStore.getState().setPoster('fixture-1', placed, NAME);
    renderEditor();
    openTab(/style/i);
    await actOn(CONTROLS[0]!); // font
    await undoKey();
    expect(mark(), 'the mark is still there').toBeDefined();
    expect({ x: mark()!.x, y: mark()!.y }, 'and has not moved').toEqual({ x: 30, y: 30 });
  });

  it('a template after a size change that dropped the mark does not bring it back off the sheet', async () => {
    loadFull();
    renderEditor();
    openTab(/layout/i);
    commitSizeField('height', '10');
    await nextTask();
    expect(mark(), 'premise: the mark was dropped').toBeUndefined();
    await clickButton('3-Column Classic');
    confirmOpenDialog();
    await nextTask();
    // Nothing brings the mark back at the tall sheet's coordinates.
    expect(mark()).toBeUndefined();
  });
});

describe('the edit never touches the poster id or name', () => {
  it('after a sidebar change', () => {
    renderEditor();
    openTab(/style/i);
    CONTROLS[0]!.act();
    expect(usePosterStore.getState().posterId).toBe('fixture-1');
    expect(usePosterStore.getState().posterTitle).toBe(NAME);
  });

  it('an unsaved Poster name draft survives a Layout change', () => {
    // LayoutTab re-syncs its draft from the store name, so blanking the
    // store name erased whatever the user had typed but not yet saved.
    renderEditor();
    openTab(/layout/i);
    const nameInput = document.querySelector('[aria-label="Poster name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Draft name not saved yet' } });
    CONTROLS[1]!.act(); // Layout › Poster width
    expect((document.querySelector('[aria-label="Poster name"]') as HTMLInputElement).value)
      .toBe('Draft name not saved yet');
  });
});

describe('opening a poster and looking around creates no undo steps', () => {
  // The old path reset history on EVERY sidebar write, which would have
  // hidden any write a component makes on its own — a mount effect that
  // normalises authors, say. With history now kept, such a write would
  // make ⌘Z undo something invisible and arm a guest's leave warning
  // before they had done anything. So: load, touch nothing, visit every
  // tab, and history must still be empty.
  it('canUndo stays false through a load and a visit to every tab', () => {
    renderEditor();
    expect(usePosterStore.getState().canUndo, 'right after load').toBe(false);
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[data-postr-tab]'));
    expect(tabs.length).toBeGreaterThan(5);
    for (const tab of tabs) {
      fireEvent.click(tab);
      expect(usePosterStore.getState().canUndo, `after opening "${(tab.textContent ?? '').trim()}"`).toBe(false);
    }
    expect(usePosterStore.getState().posterTitle).toBe(NAME);
  });
});
