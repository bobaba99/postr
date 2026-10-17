/**
 * Fix 38, review round 1 (R1-1) — a poster opened again while a change made
 * in its closed editor is not stored yet opens as the user left it.
 *
 * The editor left inside the app (the dashboard) with a change whose save
 * failed used to lose it: its retries went with the editor, and opening the
 * poster again from its card showed the server's older copy (MEASURED,
 * keep-work-check L3-inapp-failing-reopen, three engines). The page now
 * keeps the change until it is stored (hooks/useAutosave.ts), and the
 * editor's page opens a poster from that change when there is one
 * (`keptChange`); the editor opened then takes its saving over
 * (src/poster/__tests__/saveOnLeave.test.tsx, L3).
 *
 * The page is entered by its route, as in the app. The change is made by the
 * real autosave hook (its save failing); the editor tree itself is mocked,
 * as in EditorSheetSize.test.tsx. Engineering record:
 * docs/fixes/38-save-on-leave.md.
 *
 * Re-run: npx vitest run src/pages/__tests__/EditorKeptChange.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { PosterDoc } from '@postr/shared';

vi.mock('@/poster/PosterEditor', () => ({ PosterEditor: () => <div data-testid="poster-editor" /> }));
vi.mock('@/hooks/useTwoTabGuard', () => ({
  useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }),
}));
vi.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ armed: false, leaveModalOpen: false, requestLeave: vi.fn(() => false), confirmLeave: vi.fn(), cancelLeave: vi.fn() }),
}));
vi.mock('@/lib/diagnostics', () => ({ reportUiSignal: vi.fn() }));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

const upsert = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => ({ doc: null as unknown }));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  // The server's copy: the poster as it was before the change.
  loadPoster: vi.fn(async (id: string) => ({ id, user_id: 'owner', title: 'Stored name', width_in: 48, height_in: 36, data: stored.doc })),
  upsertPoster: (...args: unknown[]) => upsert(...args),
}));

import Editor from '../Editor';
import { loadPoster } from '@/data/posters';
import { keptChange } from '@/hooks/keptChanges';
import { useAutosave } from '@/hooks/useAutosave';
import { usePosterStore } from '@/stores/posterStore';
import { supabase } from '@/lib/supabase';

type Listener = (event: string, session: unknown) => void;
let listeners: Listener[] = [];

function posterDoc(words: string): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [{ id: 'b1', type: 'text', x: 20, y: 20, w: 200, h: 40, content: words, imageSrc: null, imageFit: 'contain', tableData: null }],
    fontFamily: 'Source Sans 3',
    palette: { bg: '#ffffff', primary: '#1a1a26', accent: '#7c6aed', accent2: '#4a6cf7', muted: '#6b7280', headerBg: '#f3f4f6', headerFg: '#1a1a26' },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
  } as unknown as PosterDoc;
}

async function openPoster() {
  render(
    <MemoryRouter initialEntries={['/p/p1']}>
      <Routes>
        <Route path="/p/:posterId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(usePosterStore.getState().posterId).toBe('p1'));
  const { doc, posterTitle } = usePosterStore.getState();
  return { text: JSON.stringify(doc), posterTitle };
}

const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

beforeEach(() => {
  usePosterStore.setState({ posterId: null, doc: null });
  stored.doc = posterDoc('Our stored words.');
  upsert.mockReset();
  listeners = [];
  // Signed in as the poster's owner; the client reports the session to each subscriber.
  const session = { user: { id: 'owner' }, access_token: 'ZQ-TOKEN' } as never;
  vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session }, error: null } as never);
  vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'owner' } }, error: null } as never);
  vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(((cb: Listener) => {
    listeners.push(cb);
    queueMicrotask(() => cb('INITIAL_SESSION', session));
    return { data: { subscription: { unsubscribe: () => {} } } };
  }) as never);
});
afterEach(() => {
  cleanup();
  // Signed out: anything a closed editor kept is given up.
  listeners.forEach((cb) => cb('SIGNED_OUT', null));
});

describe('opening a poster whose closed editor still has a change waiting to be saved', () => {
  it('opens as the user left it, with the name they gave it, not the server\'s older copy', async () => {
    upsert.mockRejectedValue(new TypeError('Failed to fetch'));
    // The editor, its poster as stored; the user's change; the editor left.
    const editor = renderHook(({ doc, name }) => useAutosave('p1', doc, name), {
      initialProps: { doc: posterDoc('Our stored words.'), name: 'Stored name' },
    });
    await settle();
    editor.rerender({ doc: posterDoc('Our stored words. ZQKEPT'), name: 'ZQ new name' });
    editor.unmount();
    await settle();
    expect(upsert, 'its save failed').toHaveBeenCalled();
    const opened = await openPoster();
    expect(opened.text).toContain('ZQKEPT');
    expect(opened.posterTitle).toBe('ZQ new name');
  });

  it('the kept change stored while the poster\'s load is out: it still opens as the user left it, not as the load\'s older answer (review round 2, R2-2)', async () => {
    upsert.mockRejectedValue(new TypeError('Failed to fetch'));
    const editor = renderHook(({ doc, name }) => useAutosave('p1', doc, name), {
      initialProps: { doc: posterDoc('Our stored words.'), name: 'Stored name' },
    });
    await settle();
    editor.rerender({ doc: posterDoc('Our stored words. ZQRACE'), name: 'ZQ race name' });
    editor.unmount();
    await settle();
    // The load answers later with the row as it was when the load arrived:
    // the kept write had not been stored then (keep-work-check
    // L3-inapp-reopen-race engineers this order in a browser).
    let answer: (row: unknown) => void = () => {};
    const loadsBefore = vi.mocked(loadPoster).mock.calls.length;
    vi.mocked(loadPoster).mockImplementationOnce(() => new Promise((resolve) => { answer = resolve as (row: unknown) => void; }));
    render(
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:posterId" element={<Editor />} />
        </Routes>
      </MemoryRouter>,
    );
    // This page's own load (an earlier test's call stays in the mock's record).
    await waitFor(() => expect(vi.mocked(loadPoster).mock.calls.length).toBe(loadsBefore + 1));
    expect(vi.mocked(loadPoster).mock.calls.at(-1)?.[0]).toBe('p1');
    // Meanwhile the kept change is stored (the backend back, the browser
    // online): the page forgets it.
    upsert.mockResolvedValue({});
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(JSON.stringify(upsert.mock.calls.at(-1)?.[1])).toContain('ZQRACE');
    expect(keptChange('p1'), 'stored: no longer kept').toBeNull();
    answer({ id: 'p1', user_id: 'owner', title: 'Stored name', width_in: 48, height_in: 36, data: posterDoc('Our stored words.') });
    await waitFor(() => expect(usePosterStore.getState().posterId).toBe('p1'));
    const { doc, posterTitle } = usePosterStore.getState();
    expect(JSON.stringify(doc)).toContain('ZQRACE');
    expect(posterTitle).toBe('ZQ race name');
  });

  it('with nothing waiting, it opens as stored', async () => {
    const opened = await openPoster();
    expect(opened.text).toContain('Our stored words.');
    expect(opened.text).not.toContain('ZQKEPT');
    expect(opened.posterTitle).toBe('Stored name');
  });
});
