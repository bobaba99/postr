/**
 * Fix 38, review round 2 (R2-4) — a poster deleted from the dashboard while
 * a change its closed editor made is still kept by the page (its saves
 * failing) takes that change with it.
 *
 * The page keeps the change the editor closed with until a write of it is
 * stored (review round 1, R1-1: hooks/useAutosave.ts, keptChanges.ts). A
 * poster deleted meanwhile can never store it: the page went on writing it
 * (answered 406, zero rows, every 30 s) and closing the tab still asked to
 * leave (MEASURED, keep-work-check L3-inapp-kept-then-delete, three
 * engines). Entered where the user deletes: the dashboard card's Delete and
 * its confirmation, as figureScriptDeletion.test.tsx (a deleted poster's
 * plot script goes the same way). The change is made by the real autosave
 * hook, its save failing; Supabase is faked at its client.
 *
 * Engineering record: docs/fixes/38-save-on-leave.md.
 * Re-run: npx vitest run src/pages/__tests__/dashboardDeleteKept.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';
import type { PosterListRow } from '@/data/posters';

const db = vi.hoisted(() => ({
  deleteError: null as { message: string } | null,
  deletes: [] as Array<{ id: string; ok: boolean }>,
}));
const listeners = vi.hoisted(() => [] as Array<(event: string, session: unknown) => void>);
const upsert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      // The client reports the session to each subscriber, as auth-js does.
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        queueMicrotask(() => cb('INITIAL_SESSION', { access_token: 'ZQ-TOKEN', user: { id: 'u1' } }));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: () => ({
      delete: () => ({
        eq: async (_column: string, id: string) => {
          db.deletes.push({ id, ok: db.deleteError === null });
          return { error: db.deleteError };
        },
      }),
    }),
  },
}));
const row = (id: string, title: string): PosterListRow => ({
  id,
  user_id: 'u1',
  title,
  width_in: 48,
  height_in: 36,
  thumbnail_path: null,
  share_slug: null,
  is_public: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  listPosters: vi.fn(async () => [row('poster-a', 'Poster A'), row('poster-b', 'Poster B')]),
  upsertPoster: (...args: unknown[]) => upsert(...args),
}));
vi.mock('@/data/gallery', () => ({ checkIsGalleryAdmin: vi.fn(async () => false) }));
vi.mock('@/data/thumbnails', () => ({ getThumbnailUrl: vi.fn(async () => null), captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/lib/diagnostics', () => ({ reportUiSignal: vi.fn() }));
vi.mock('@/components/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/seo/useDocumentMeta', () => ({ useDocumentMeta: () => {} }));

import Home from '../Home';
import { useAutosave } from '@/hooks/useAutosave';
import { keptChange } from '@/hooks/keptChanges';

function posterDoc(words: string): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [{ id: 'b1', type: 'text', x: 20, y: 20, w: 200, h: 40, content: words, imageSrc: null, imageFit: 'contain', tableData: null }],
    fontFamily: 'Source Sans 3',
    styles: {},
    institutions: [],
    authors: [],
    references: [],
  } as unknown as PosterDoc;
}

const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

/** The editor of Poster A, a change made there whose save fails, then the editor left inside the app: the page keeps it. */
async function keepChangeOfPosterA() {
  upsert.mockRejectedValue(new TypeError('Failed to fetch'));
  const editor = renderHook(({ doc }) => useAutosave('poster-a', doc, 'Poster A'), { initialProps: { doc: posterDoc('Stored words.') } });
  await settle();
  editor.rerender({ doc: posterDoc('Stored words. ZQDELETED') });
  editor.unmount();
  await settle();
  expect(keptChange('poster-a'), 'kept by the page').not.toBeNull();
}

/** The card's Delete, then Delete in the confirmation. */
async function deleteFromDashboard(title: string) {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: `Delete ${title}` }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
}

/** The tab closed: whether the page asks to confirm leaving. */
function closeTabAsks(): boolean {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

beforeEach(() => {
  db.deleteError = null;
  db.deletes = [];
  upsert.mockReset();
  listeners.length = 0;
});
afterEach(() => {
  cleanup();
  // Signed out: anything still kept is given up, so nothing carries over.
  listeners.forEach((cb) => cb('SIGNED_OUT', null));
});

describe('a poster deleted while the page keeps a change its closed editor made', () => {
  it('the dashboard\'s Delete takes the kept change with it: nothing more written, nothing asked at the close', async () => {
    await keepChangeOfPosterA();
    expect(closeTabAsks(), 'kept: the tab close asks first').toBe(true);
    await deleteFromDashboard('Poster A');
    await waitFor(() => expect(db.deletes).toEqual([{ id: 'poster-a', ok: true }]));
    await waitFor(() => expect(keptChange('poster-a')).toBeNull());
    const writes = upsert.mock.calls.length;
    // The backend accepts again and the browser is back online: a kept
    // change would be written at once.
    upsert.mockResolvedValue({});
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(upsert, 'no write of a poster that is gone').toHaveBeenCalledTimes(writes);
    expect(closeTabAsks(), 'nothing unsaved to warn of').toBe(false);
  });

  it('a delete that fails keeps the change: still asked at the close, and written once the backend is back', async () => {
    db.deleteError = { message: 'network down' };
    await keepChangeOfPosterA();
    await deleteFromDashboard('Poster A');
    await waitFor(() => expect(db.deletes).toEqual([{ id: 'poster-a', ok: false }]));
    expect(await screen.findByRole('button', { name: 'Delete Poster A' })).toBeInTheDocument();
    expect(keptChange('poster-a')).not.toBeNull();
    expect(closeTabAsks()).toBe(true);
    upsert.mockResolvedValue({});
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(JSON.stringify(upsert.mock.calls.at(-1))).toContain('ZQDELETED');
    await waitFor(() => expect(keptChange('poster-a')).toBeNull());
  });
});
