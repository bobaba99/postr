/**
 * @vitest-environment jsdom
 */
/**
 * Fix 23 — the thumbnail is uploaded only as the user the editor was opened for.
 * Engineering record: docs/fixes/23-new-poster-owner-only.md.
 *
 * The thumbnail capture asked who is signed in when it ran, not who opened
 * the poster, and uploads into that user's storage folder. When the signed-in
 * user changed between a save and its capture (a sign-in to another account
 * in another tab), the owner's poster image went into the other account's
 * folder (MEASURED 3 of 3 by fix 23's gap test G3). The editor now closes a
 * poster when the user changes, and its unmount flush and final capture run
 * at that moment, under the new user.
 *
 * The signed-in user is the Supabase client's (mocked here); the capture is
 * the data layer's captureThumbnail (mocked, to record who it uploads for).
 *
 * Re-run: npx vitest run src/hooks/__tests__/useAutosaveOwner.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/data/posters', () => ({
  upsertPoster: (...args: unknown[]) => upsertMock(...args),
}));

const signedIn = vi.hoisted(() => ({ uid: 'owner' as string | null, lookupsToFail: 0 }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      // The network lookup; a test can make the next few fail (the auth
      // server unreachable for a moment).
      getUser: vi.fn(async () => {
        if (signedIn.lookupsToFail > 0) {
          signedIn.lookupsToFail -= 1;
          return { data: { user: null }, error: { message: 'Failed to fetch' } };
        }
        return { data: { user: signedIn.uid ? { id: signedIn.uid } : null }, error: null };
      }),
      getSession: vi.fn(async () => ({ data: { session: signedIn.uid ? { user: { id: signedIn.uid } } : null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const captureMock = vi.hoisted(() => vi.fn(async (uid: string, id: string) => `${uid}/${id}/thumbnail.jpg`));
vi.mock('@/data/thumbnails', () => ({
  captureThumbnail: (uid: string, id: string) => captureMock(uid, id),
}));

import { useAutosave } from '../useAutosave';

function makeDoc(font = 'Inter'): PosterDoc {
  return {
    version: 1, widthIn: 48, heightIn: 36, blocks: [], fontFamily: font,
    palette: { bg: '#fff', primary: '#000', accent: '#000', accent2: '#000', muted: '#000', headerBg: '#000', headerFg: '#fff' },
    styles: {
      title: { size: 72, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 600, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 18, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 14, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [], authors: [], references: [],
  } as PosterDoc;
}

/** Let promises and timers settle (the capture waits for an idle moment). */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  }
}

/** Idle-time callbacks, held until the test releases them. */
let idle: Array<() => void> = [];
const releaseIdle = async () => {
  const run = idle;
  idle = [];
  await act(async () => { for (const cb of run) cb(); });
};

beforeEach(() => {
  vi.useFakeTimers();
  idle = [];
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => { idle.push(cb); return idle.length; });
  signedIn.uid = 'owner';
  signedIn.lookupsToFail = 0;
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ id: 'poster-1', updated_at: new Date('2026-09-30T12:00:00Z').toISOString() });
  captureMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the thumbnail is never written as another user', () => {
  it('a sign-in to another account between a save and its capture uploads nothing into that account', async () => {
    const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), { initialProps: { doc: makeDoc() } });
    await settle();
    rerender({ doc: makeDoc('Roboto') });
    // The save goes out after the debounce; the other account signs in as
    // soon as it returns, before the idle-time capture runs.
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(upsertMock, 'precondition: the save went out').toHaveBeenCalled();
    expect(idle.length, 'precondition: a capture is waiting for an idle moment').toBeGreaterThan(0);
    signedIn.uid = 'someone-else';
    await releaseIdle();
    await settle();
    expect(captureMock.mock.calls.filter(([uid]) => uid === 'someone-else')).toEqual([]);
  });

  it('closing the poster after the user changed uploads nothing into the new user\'s folder', async () => {
    const { rerender, unmount } = renderHook(({ doc }) => useAutosave('poster-1', doc), { initialProps: { doc: makeDoc() } });
    await settle();
    rerender({ doc: makeDoc('Roboto') });
    signedIn.uid = 'new-guest';
    unmount();
    await settle();
    expect(captureMock.mock.calls.filter(([uid]) => uid === 'new-guest')).toEqual([]);
  });

  it('control: with no change of user, the saved poster\'s thumbnail is captured for its owner', async () => {
    const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), { initialProps: { doc: makeDoc() } });
    await settle();
    rerender({ doc: makeDoc('Roboto') });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    await releaseIdle();
    await settle();
    expect(captureMock).toHaveBeenCalledWith('owner', 'poster-1');
  });

  // Fix 23's step 9 review (CRa-5, MEASURED in the browser): the owner was
  // first looked up over the network when the editor opened, and one failed
  // lookup turned thumbnails off for the rest of the session.
  it('a failed user lookup as the editor opens does not stop the thumbnail', async () => {
    // The auth server is unreachable while the editor opens, and back
    // before the first save.
    signedIn.lookupsToFail = 1;
    const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), { initialProps: { doc: makeDoc() } });
    await settle();
    signedIn.lookupsToFail = 0;
    rerender({ doc: makeDoc('Roboto') });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    await releaseIdle();
    await settle();
    expect(captureMock).toHaveBeenCalledWith('owner', 'poster-1');
  });
});

