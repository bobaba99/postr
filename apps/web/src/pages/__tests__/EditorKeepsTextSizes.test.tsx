/**
 * Record 37 — a text size the user set is kept when the poster is opened
 * again (docs/fixes/37-load-size-cap.md).
 *
 * The editor page repaired every poster it opened by replacing any text
 * level above a ceiling (title 216, heading 100.8, authors and body 72 pt)
 * with today's default, meant for posters stored before the typography
 * calibration (979df80, 2026-04-09). The Style tab's fields (which store
 * what is typed: their 200 pt maximum is not enforced) and A+ (record 33)
 * reach those sizes, so a user's large title came back at 100.8 pt. The
 * rule now: a poster whose four sizes are the old default (title 60,
 * heading 28, authors 22, body 18 units, the posters table's first default
 * for `data`) is drawn at today's defaults; every other size is kept as
 * stored; a missing level is filled with today's default, as before.
 *
 * Entered where a user enters: the editor page opening a stored poster at
 * /p/<id>, the Style tab's size fields typed into (each keystroke the
 * field's own change event, editorKit's typeKeystrokes) and the top bar's
 * A+ pressed with the mouse; the autosave's write (`upsertPoster`, mocked to
 * record what it was asked to store) is what the next open reads. That the
 * sizes are drawn so after a real reload is measured in Chromium, Firefox
 * and WebKit by scripts/text-size-check.mjs (claims RELOAD, RELOADSTYLE,
 * RELOAD12, RELOADONE, STALE, STALEEMPTY).
 *
 * Re-run: npx vitest run src/pages/__tests__/EditorKeepsTextSizes.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { PosterDoc, Styles } from '@postr/shared';

vi.setConfig({ testTimeout: 20_000 });

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'owner' } } })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } } })),
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
const row = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
const upsertSpy = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  loadPoster: vi.fn(async (id: string) => ({ id, user_id: 'owner', title: 'Lab meeting draft v3', width_in: 48, height_in: 36, data: row.data })),
  upsertPoster: upsertSpy,
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/hooks/useTwoTabGuard', () => ({ useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }) }));
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));

import Editor from '@/pages/Editor';
import { usePosterStore } from '@/stores/posterStore';
import { NoopResizeObserver, nextTask, openTab, q, typeKeystrokes } from '@/poster/__tests__/editorKit';

const PT = 7.2;
const LEVELS = ['title', 'heading', 'authors', 'body'] as const;
type Level = (typeof LEVELS)[number];
const BLOCK_TYPE: Record<Level, string> = { title: 'title', heading: 'heading', authors: 'authors', body: 'text' };

/** Today's defaults, in poster units: the rule's expectation for an old poster (record 37 §7). */
const TODAY = { title: 14, heading: 8, authors: 5, body: 5 };
/** The posters table's first default for `data` (853ec1c), as a new row held it. */
const OLD_DEFAULT = {
  version: 1, widthIn: 48, heightIn: 36, blocks: [] as unknown[], fontFamily: 'Source Sans 3',
  palette: { bg: '#ffffff', primary: '#1a1a26', accent: '#7c6aed', accent2: '#4a6cf7', muted: '#6b7280', headerBg: '#f3f4f6', headerFg: '#1a1a26' },
  styles: {
    title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
    heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
    authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
    body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [], authors: [], references: [],
};

const base = { imageSrc: null, imageFit: 'contain', tableData: null };
/** A poster a user has written into: a title, authors, a heading and two text blocks. */
const BLOCKS = [
  { ...base, id: 't1', type: 'title', x: 20, y: 20, w: 440, h: 60, content: 'Sleep Restriction in Domestic Cats' },
  { ...base, id: 'a1', type: 'authors', x: 20, y: 90, w: 440, h: 30, content: '' },
  { ...base, id: 'h1', type: 'heading', x: 20, y: 130, w: 210, h: 30, content: 'Methods' },
  { ...base, id: 'b1', type: 'text', x: 20, y: 170, w: 210, h: 80, content: 'Our own words, not a placeholder.' },
  { ...base, id: 'b2', type: 'text', x: 250, y: 170, w: 210, h: 80, content: 'A second column of results.' },
];

/** A stored poster with its levels' sizes in units (the default level otherwise). */
function storedDoc(sizes: Partial<Record<Level, number>>, blocks: unknown[] = BLOCKS): Record<string, unknown> {
  const styles = Object.fromEntries(LEVELS.map((k) => [k, { ...OLD_DEFAULT.styles[k], size: sizes[k] ?? TODAY[k] }]));
  return { ...structuredClone(OLD_DEFAULT), blocks, styles, authors: [{ id: 'p1', name: 'Jane Doe', affiliationIds: [] }] };
}

/** Open the editor page on the stored poster, as a user opens /p/<id>. */
async function open(data: Record<string, unknown>) {
  row.data = data;
  render(
    <MemoryRouter initialEntries={['/p/p1']}>
      <Routes>
        <Route path="/p/:posterId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(q('#poster-canvas [data-block-id]')).not.toBeNull());
  await nextTask();
}

/** The poster the last autosave wrote. */
function lastSaved(): Record<string, unknown> | undefined {
  const withData = upsertSpy.mock.calls.map((c) => (c[1] as { data?: Record<string, unknown> }).data).filter(Boolean);
  return withData.at(-1);
}

/** Wait for the autosave to write `want` units at `level`, then open the poster again from what it wrote. */
async function savedThenReopened(want: Partial<Record<Level, number>>) {
  await waitFor(() => {
    const saved = lastSaved() as { styles?: Styles } | undefined;
    for (const [k, v] of Object.entries(want)) expect(saved?.styles?.[k as Level]?.size).toBe(v);
  }, { timeout: 5000 });
  const saved = structuredClone(lastSaved()!);
  cleanup();
  usePosterStore.setState({ posterId: null, doc: null });
  await open(saved);
}

const styles = () => (usePosterStore.getState().doc as PosterDoc).styles;
const sizes = (): Record<Level, number> => ({ title: styles().title.size, heading: styles().heading.size, authors: styles().authors.size, body: styles().body.size });
/** The size a level is drawn at on the sheet, in pt: the largest inline font-size in its first block. */
function drawnPt(level: Level): number | null {
  const frame = q<HTMLElement>(`#poster-canvas [data-block-type="${BLOCK_TYPE[level]}"]`);
  if (!frame) return null;
  const px = [frame, ...frame.querySelectorAll<HTMLElement>('*')].map((el) => parseFloat(el.style.fontSize)).filter(Number.isFinite);
  return px.length ? Math.max(...px) * PT : null;
}

const sizeField = (i: number) => document.querySelectorAll<HTMLInputElement>('[data-postr-sidebar] input[type="number"][title="Font size (points)"]')[i]!;
/** Type `pt` into the Style tab's field for level `i` (0 title, 1 heading, 2 authors, 3 body), one key at a time. */
async function typeSize(i: number, pt: number) {
  openTab(/^style/i);
  await nextTask();
  const digits = String(pt);
  await typeKeystrokes(sizeField(i), [...digits].map((_, n) => digits.slice(0, n + 1)));
}
/** A mouse press on the top bar's A+ (mousedown, mouseup, click). */
async function pressUp() {
  const up = q<HTMLButtonElement>('[data-postr-editor-topbar] button[aria-label="Increase text size"]');
  if (!up) throw new Error('no A+ in the top bar');
  fireEvent.mouseDown(up, { detail: 1 });
  fireEvent.mouseUp(up, { detail: 1 });
  fireEvent.click(up, { detail: 1 });
  await nextTask();
}

beforeEach(() => {
  usePosterStore.setState({ posterId: null, doc: null });
  upsertSpy.mockClear();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a size the user set is the size the poster reopens with', () => {
  it('a heading typed as 110 pt in the Style tab (above the old 100.8 pt ceiling) reopens at 110 pt', async () => {
    await open(storedDoc({}));
    await typeSize(1, 110);
    expect(styles().heading.size).toBe(110 / PT);
    await savedThenReopened({ heading: 110 / PT });
    expect(styles().heading.size).toBe(110 / PT);
    expect(drawnPt('heading')).toBeCloseTo(110, 6);
    expect(sizes()).toEqual({ title: TODAY.title, heading: 110 / PT, authors: TODAY.authors, body: TODAY.body });
  });

  it('a title of 170 and a heading of 80 pt raised by A+ to a 48 pt body (226.67 and 106.67 pt) reopen as raised', async () => {
    await open(storedDoc({ title: 170 / PT, heading: 80 / PT }));
    for (let i = 0; i < 3; i += 1) await pressUp();
    const raised = sizes();
    expect(raised.body * PT, 'precondition: the body at 48 pt').toBeCloseTo(48, 9);
    expect(raised.title * PT, 'precondition: past the old 216 pt ceiling').toBeGreaterThan(216);
    expect(raised.heading * PT, 'precondition: past the old 100.8 pt ceiling').toBeGreaterThan(100.8);
    await savedThenReopened(raised);
    expect(sizes()).toEqual(raised);
    expect(drawnPt('title')).toBeCloseTo(raised.title * PT, 6);
  });

  it('a body typed as 12 pt, then one A+ (title 235.2, heading 134.4, authors 84 pt) reopens with every level as raised', async () => {
    await open(storedDoc({}));
    await typeSize(3, 12);
    await pressUp();
    const raised = sizes();
    expect(raised.body * PT, 'precondition: A+ took the body to 28 pt').toBeCloseTo(28, 9);
    expect(raised.authors * PT, 'precondition: authors past the old 72 pt ceiling').toBeCloseTo(84, 9);
    await savedThenReopened(raised);
    expect(sizes()).toEqual(raised);
    expect(drawnPt('authors')).toBeCloseTo(84, 6);
  });

  it('a title typed as 432 pt, the old default\'s title on its own (60 units exactly), reopens at 432 pt', async () => {
    await open(storedDoc({}));
    await typeSize(0, 432);
    expect(styles().title.size, 'the field stores 432 ÷ 7.2, exactly 60').toBe(60);
    await savedThenReopened({ title: 60 });
    expect(sizes()).toEqual({ ...TODAY, title: 60 });
    expect(drawnPt('title')).toBeCloseTo(432, 6);
  });
});

describe('a poster stored with the old default is still drawn at today\'s sizes', () => {
  it('the old default\'s four sizes, on a poster a user wrote into, open at today\'s defaults', async () => {
    await open(storedDoc({ title: 60, heading: 28, authors: 22, body: 18 }));
    expect(sizes()).toEqual(TODAY);
    expect(drawnPt('title')).toBeCloseTo(100.8, 6);
    expect(drawnPt('body')).toBeCloseTo(36, 6);
  });

  it('the old default as a new row held it (no blocks) opens on the template at today\'s defaults', async () => {
    await open(structuredClone(OLD_DEFAULT));
    expect(sizes()).toEqual(TODAY);
    expect((usePosterStore.getState().doc as PosterDoc).blocks.length, 'the starting template').toBeGreaterThan(0);
  });

  it('three of the old default\'s sizes with the body changed by hand are not the old default: every level kept', async () => {
    await open(storedDoc({ title: 60, heading: 28, authors: 22, body: 9 }));
    expect(sizes()).toEqual({ title: 60, heading: 28, authors: 22, body: 9 });
  });

  it('a level missing from the stored poster is filled with today\'s default, the others kept', async () => {
    const data = storedDoc({ title: 170 / PT });
    delete (data.styles as Record<string, unknown>).body;
    await open(data);
    expect(sizes()).toEqual({ title: 170 / PT, heading: TODAY.heading, authors: TODAY.authors, body: TODAY.body });
  });
});
