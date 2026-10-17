/**
 * Fix 38 — an edit made just before the editor's page is left is still
 * saved (docs/fixes/38-save-on-leave.md, rules L1–L5).
 *
 * Entry is the user's: typing in a text block or the top bar's A+, then
 * the browser's own `beforeunload`, `pagehide` and `visibilitychange` events
 * on the window and the document, as the browser fires them when the page
 * is left. The backend is the data layer's `upsertPoster` (mocked: to hold a
 * write, to fail one, and to record what was asked of it, including whether
 * it was asked to send the save with `keepalive`); the request it then
 * builds is `src/data/__tests__/posterKeepalive.test.ts`'s, and the whole
 * path from a keystroke to `fetch` is `saveOnLeaveRequest.test.tsx`'s. The
 * session is the Supabase client's (mocked: it reports a session whose
 * token is `ZQ-TOKEN`). Time is faked for the timers only and runs on its
 * own, as keepWorkSafe.test.tsx's.
 *
 * Since review round 1 (correction 1): the change the editor closed with,
 * kept by the page until it is stored (the editor unmounted as the app's
 * route changes; R1-1), the 10 s with nothing newer sent after a write the
 * leave cut off (R1-2), keepalive decided when the request is sent (R1-3),
 * and the cut-off marked on the write out, not by the clock (R1-4).
 *
 * Since review round 3 (correction 3): a save the server answered with an
 * error (the data layer's `SaveError`, its status on it) is not one the
 * browser cut off (R3-1), and a save its own timer starts in the 200 ms
 * after a failure with no answer waits them out (R3-2).
 *
 * What a real browser does with the request after the page has gone is not
 * here: scripts/keep-work-check.mjs (L1-*, L4-*, LF-*, L2-*, L3-inapp-*)
 * measures it in Chromium, Firefox and WebKit.
 *
 * Re-run: npx vitest run src/poster/__tests__/saveOnLeave.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const upsertSpy = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})));
const authListeners = vi.hoisted(() => [] as Array<(event: string, session: unknown) => void>);

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      // The client reports the session to a new subscriber, as auth-js
      // does with INITIAL_SESSION.
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authListeners.push(cb);
        queueMicrotask(() => cb('INITIAL_SESSION', { access_token: 'ZQ-TOKEN', user: { id: 'u1' } }));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
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
  upsertPoster: upsertSpy,
}));
vi.mock('@/data/posterVersions', async (orig) => ({
  ...(await orig<typeof import('@/data/posterVersions')>()),
  listVersions: vi.fn(async () => []),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/lib/diagnostics', () => ({ reportUiSignal: vi.fn() }));

import {
  NoopResizeObserver,
  canvasEditor,
  clickToEnd,
  clickWithPointer,
  installContentEditableShim,
  installExecCommandShim,
  load,
  renderEditor,
  typeText,
  undoDoc,
} from './undoKit';
import { CUT_OFF_SETTLE_MS, useAutosave } from '@/hooks/useAutosave';
import { keptChange } from '@/hooks/keptChanges';
import { supabase } from '@/lib/supabase';
import { captureThumbnail } from '@/data/thumbnails';

const NAME_A = 'Poster A';

/** What each write sent: the poster's text, and whether it was asked to outlive the page. */
const writes = () => upsertSpy.mock.calls.map((c) => ({
  text: JSON.stringify((c[1] as { data?: unknown }).data ?? null),
  keepalive: (c[2] as { keepalive?: boolean } | undefined)?.keepalive === true,
  token: (c[2] as { accessToken?: string } | undefined)?.accessToken ?? null,
}));
const offline = () => new TypeError('Failed to fetch');
/** The server answered with an error (500): it stored nothing. The data layer puts the answer's status on the error (review round 3, R3-1). */
const serverError = () => Object.assign(new Error('Failed to save poster: internal server error'), { status: 500 });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

/** A held write: resolves or fails (with no answer, unless the test passes one) when the test says. */
function holdNextWrite() {
  const h: { release: () => void; fail: (err?: Error) => void } = { release: () => {}, fail: () => {} };
  upsertSpy.mockImplementationOnce(() => new Promise((resolve, reject) => {
    h.release = () => resolve({});
    h.fail = (err = offline()) => reject(err);
  }));
  return h;
}

/**
 * The browser's events as the page is left, in a browser's order, each
 * dispatched on its own (no await between the event and the count read
 * after it: a handler cannot wait for a write either). Returns whether the
 * page asked to confirm leaving, and how many writes had been asked for by
 * the time each event's handlers returned.
 */
function closeTab(): { prompted: boolean; callsAfterBeforeUnload: number } {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return { prompted: ev.defaultPrevented, callsAfterBeforeUnload: upsertSpy.mock.calls.length };
}
function pageHide(): number {
  window.dispatchEvent(new Event('pagehide'));
  return upsertSpy.mock.calls.length;
}
function hideTab(): number {
  // jsdom's page is always visible: the document's own property hides it
  // for the event, then goes, leaving the prototype's getter.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  try {
    document.dispatchEvent(new Event('visibilitychange'));
  } finally {
    delete (document as { visibilityState?: unknown }).visibilityState;
  }
  return upsertSpy.mock.calls.length;
}

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  upsertSpy.mockReset();
  upsertSpy.mockImplementation(async () => ({}));
  authListeners.length = 0;
  // No session read at open, unless a test says (the poster's owner unknown).
  vi.mocked(supabase.auth.getSession).mockImplementation((async () => ({ data: { session: null } })) as never);
  load(undoDoc());
});
afterEach(() => {
  // Close the editor, then sign out: a change a closed editor still keeps
  // (review round 1, R1-1) is given up, so nothing carries into the next test.
  cleanup();
  authListeners.forEach((cb) => cb('SIGNED_OUT', null));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Open the editor (the session reported) and type `word` at the end of the first text block. */
async function openAndType(word: string) {
  renderEditor();
  await settle();
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, word);
  return ed;
}

describe('L1: leaving the page writes the change waiting, with a request that outlives the page', () => {
  it('closing the tab right after typing: the write is asked for before the dialog, sent with keepalive and the session token', async () => {
    await openAndType(' ZQBYE');
    expect(upsertSpy, 'nothing written inside the 800 ms wait').not.toHaveBeenCalled();
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(callsAfterBeforeUnload, 'asked for while the event ran, before the dialog').toBe(1);
    expect(prompted, 'the leave dialog, as before (L5)').toBe(true);
    expect(writes()[0]).toEqual({ text: expect.stringContaining('ZQBYE'), keepalive: true, token: 'ZQ-TOKEN' });
    pageHide();
    await settle();
    expect(upsertSpy, 'one write: pagehide sends nothing more while it is out').toHaveBeenCalledTimes(1);
  });

  it('the page going with no beforeunload first (a phone\'s browser may fire none): pagehide writes it, with keepalive', async () => {
    await openAndType(' ZQHIDE');
    expect(pageHide(), 'asked for while pagehide ran').toBe(1);
    expect(writes()[0]).toEqual({ text: expect.stringContaining('ZQHIDE'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('the tab shown again writes nothing early: the change keeps its 800 ms wait', async () => {
    await openAndType(' ZQSHOWN');
    document.dispatchEvent(new Event('visibilitychange')); // jsdom's page is visible
    expect(upsertSpy).not.toHaveBeenCalled();
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('the tab hidden (the last moment a phone gives): the change is written at once, with keepalive', async () => {
    await openAndType(' ZQTAB');
    expect(hideTab(), 'asked for while visibilitychange ran').toBe(1);
    expect(writes()[0]).toEqual({ text: expect.stringContaining('ZQTAB'), keepalive: true, token: 'ZQ-TOKEN' });
    await advance(1000);
    expect(upsertSpy, 'not written again after its 800 ms wait').toHaveBeenCalledTimes(1);
  });

  it('A+ clicked, then the tab closed: the new body size is written at once, with keepalive', async () => {
    // A body of 36 pt (5 units, the database's default), where A+ is on.
    const d = undoDoc();
    load({ ...d, styles: { ...d.styles, body: { ...d.styles.body, size: 5 } } });
    renderEditor();
    await settle();
    const before = JSON.stringify(5);
    const plus = document.querySelector<HTMLButtonElement>('[data-postr-editor-topbar] button[aria-label="Increase text size"]')!;
    await clickWithPointer(plus);
    expect(upsertSpy).not.toHaveBeenCalled();
    closeTab();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const sent = (upsertSpy.mock.calls[0]![1] as { data: { styles: { body: { size: number } } } }).data.styles.body.size;
    expect(JSON.stringify(sent), 'the raised size').not.toBe(before);
    expect(writes()[0]!.keepalive).toBe(true);
  });

  it('nothing changed: leaving writes nothing and warns of nothing', async () => {
    renderEditor();
    await settle();
    expect(closeTab().prompted).toBe(false);
    pageHide();
    hideTab();
    await settle();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('a save that failed, waiting for its retry, then the tab closed: written at once, with keepalive (fix 27\'s retry state)', async () => {
    upsertSpy.mockRejectedValueOnce(offline());
    await openAndType(' ZQFAIL');
    await advance(800);
    await settle();
    expect(upsertSpy, 'the first save, failed').toHaveBeenCalledTimes(1);
    // More than the 200 ms in which a failure counts as cut by the leave
    // (review round 2, R2-1; the next describe's test).
    await advance(300);
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted).toBe(true);
    expect(callsAfterBeforeUnload, 'before its 2 s retry').toBe(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQFAIL'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('the token the client reports last is the one sent (a refresh)', async () => {
    await openAndType(' ZQREFRESH');
    act(() => authListeners.forEach((cb) => cb('TOKEN_REFRESHED', { access_token: 'ZQ-TOKEN-2', user: { id: 'u1' } })));
    closeTab();
    expect(writes()[0]!.token).toBe('ZQ-TOKEN-2');
  });

  it('an ordinary save stays the client\'s own: no keepalive asked for', async () => {
    await openAndType(' ZQPLAIN');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy.mock.calls[0]!.length, 'no options').toBe(2);
  });
});

describe('L3: the editor left inside the app', () => {
  it('unmounting with a change waiting writes it at once, with keepalive (a tab closed right after has no dialog to stop it)', async () => {
    const view = renderEditor();
    await settle();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQAPP');
    view.unmount();
    expect(upsertSpy, 'asked for while the editor unmounted').toHaveBeenCalledTimes(1);
    expect(writes()[0]).toEqual({ text: expect.stringContaining('ZQAPP'), keepalive: true, token: 'ZQ-TOKEN' });
  });
});

/** Open the editor, type `word`, let its first save fail, then leave the editor inside the app (it unmounts). */
async function failThenLeaveInApp(word: string) {
  upsertSpy.mockRejectedValue(offline());
  const view = renderEditor();
  await settle();
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, word);
  await advance(800);
  await settle();
  expect(upsertSpy, 'the first save, failed').toHaveBeenCalledTimes(1);
  view.unmount();
  await settle();
  expect(upsertSpy, 'one more try as the editor closed, failed too').toHaveBeenCalledTimes(2);
}
/** The backend accepts writes again. */
const backendBack = () => upsertSpy.mockImplementation(async () => ({}));

describe('L3: a change the editor closed with, not stored yet, is kept by the page until it is (review round 1, R1-1)', () => {
  it('a failing save, then the editor left inside the app: retried while the page is open, stored once the backend accepts, then nothing more', async () => {
    await failThenLeaveInApp(' ZQGONE');
    backendBack();
    // Two failures in a row: the next try 5 s later, as in the editor.
    await advance(5100);
    await settle();
    expect(upsertSpy, 'retried after the editor closed').toHaveBeenCalledTimes(3);
    expect(writes()[2]!.text).toContain('ZQGONE');
    await advance(60_000);
    expect(upsertSpy, 'stored: nothing written after').toHaveBeenCalledTimes(3);
    expect(closeTab().prompted, 'stored: closing the tab asks nothing').toBe(false);
    expect(keptChange('fixture-1')).toBeNull();
  });

  it('the tab closed from the dashboard while it is still not stored: the leave dialog, and the change written at once with keepalive', async () => {
    await failThenLeaveInApp(' ZQSHUT');
    // A moment on the dashboard: more than the 200 ms in which the editor's
    // failed save would count as cut by the leave (review round 2, R2-1).
    await advance(300);
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: the change is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'written while the event ran').toBe(3);
    expect(writes()[2]).toEqual({ text: expect.stringContaining('ZQSHUT'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('a write out, an edit, then the editor left inside the app: the tab closed meanwhile asks first; the edit goes once the write is stored', async () => {
    const held = holdNextWrite();
    const view = renderEditor();
    await settle();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQRA');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQRB');
    view.unmount();
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: ZQRB is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'one write at a time').toBe(1);
    await act(async () => { held.release(); });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQRB'), keepalive: true, token: 'ZQ-TOKEN' });
    expect(closeTab().prompted, 'stored: nothing asked').toBe(false);
  });

  it('the poster opened again while its change is not stored: the page has it as left, and the editor opened again takes the saving over (one writer)', async () => {
    await failThenLeaveInApp(' ZQBACK');
    const kept = keptChange('fixture-1');
    expect(JSON.stringify(kept?.doc ?? null), 'what the page opens (pages/Editor.tsx)').toContain('ZQBACK');
    // The page opens it so (pages/__tests__/EditorKeptChange.test.tsx), the backend is back.
    load(kept!.doc);
    backendBack();
    renderEditor();
    await settle();
    expect(upsertSpy, 'written at once by the editor opened again').toHaveBeenCalledTimes(3);
    expect(writes()[2]!.text).toContain('ZQBACK');
    expect(keptChange('fixture-1'), 'no longer kept by the page').toBeNull();
    // The closed editor's own retry (due 5 s after its last failure) does not run.
    await advance(40_000);
    expect(upsertSpy).toHaveBeenCalledTimes(3);
  });

  it('a write out when the poster is opened again: the editor opened again writes only after it, and the closed one nothing more', async () => {
    const held = holdNextWrite();
    const view = renderEditor();
    await settle();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQIA');
    await advance(800);
    await typeText(ed, ' ZQIB');
    view.unmount();
    await settle();
    expect(upsertSpy, 'the held write only: one at a time').toHaveBeenCalledTimes(1);
    const kept = keptChange('fixture-1');
    expect(JSON.stringify(kept?.doc ?? null)).toContain('ZQIB');
    load(kept!.doc);
    renderEditor();
    await settle();
    expect(upsertSpy, 'nothing while the closed editor\'s write is out').toHaveBeenCalledTimes(1);
    await act(async () => { held.release(); });
    await settle();
    expect(upsertSpy, 'one write after it, by one editor').toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQIB');
    await advance(5000);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('the editor closed for another account (the poster not the signed-in user\'s): not kept, one last try only', async () => {
    vi.mocked(supabase.auth.getSession).mockImplementation((async () => ({ data: { session: { user: { id: 'u0' } } } })) as never);
    await failThenLeaveInApp(' ZQOTHER');
    expect(keptChange('fixture-1')).toBeNull();
    expect(closeTab().prompted).toBe(false);
    await advance(60_000);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('a kept change stored after the editor closed takes no thumbnail (the canvas on the page then is not this poster\'s)', async () => {
    // The clock too: the capture's 3 s cooldown reads Date.now().
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    vi.mocked(supabase.auth.getSession).mockImplementation((async () => ({ data: { session: { user: { id: 'u1' } } } })) as never);
    await failThenLeaveInApp(' ZQTHUMB');
    await advance(100);
    await settle();
    const captures = vi.mocked(captureThumbnail).mock.calls.length;
    backendBack();
    await advance(5100);
    await settle();
    expect(writes()[2]!.text).toContain('ZQTHUMB');
    await advance(4000);
    await settle();
    expect(vi.mocked(captureThumbnail).mock.calls.length).toBe(captures);
  });

  it('signing out gives up a change a closed editor kept: nothing retried, nothing asked', async () => {
    await failThenLeaveInApp(' ZQOUT');
    authListeners.forEach((cb) => cb('SIGNED_OUT', null));
    await advance(60_000);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(closeTab().prompted).toBe(false);
    expect(keptChange('fixture-1')).toBeNull();
  });

  it('a poster switched to in an open editor takes over a change kept for it: one writer (hook level; the in-editor switch is hidden, bounded-designs 1.10)', async () => {
    upsertSpy.mockRejectedValue(offline());
    const d = undoDoc();
    const a = renderHook(({ doc }) => useAutosave('poster-a', doc, NAME_A), { initialProps: { doc: d } });
    await settle();
    const edited = { ...d, fontFamily: 'ZQFONT' };
    a.rerender({ doc: edited });
    await advance(800);
    a.unmount();
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    backendBack();
    const b = renderHook(({ id, doc }) => useAutosave(id, doc, NAME_A), { initialProps: { id: 'poster-b', doc: d } });
    await settle();
    b.rerender({ id: 'poster-a', doc: edited });
    await settle();
    expect(upsertSpy, 'the kept change, written by the open editor').toHaveBeenCalledTimes(3);
    expect(upsertSpy.mock.calls[2]![0]).toBe('poster-a');
    expect(writes()[2]!.text).toContain('ZQFONT');
    await advance(40_000);
    expect(upsertSpy, 'the closed editor writes nothing more').toHaveBeenCalledTimes(3);
    b.unmount();
  });
});

describe('L4: one write at a time, also while the page is left', () => {
  it('a write out, an edit made, then the tab closed: nothing more is sent while it is out; once it is stored, the edit at once, with keepalive', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQSA');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQSB');
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: ZQSB is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'no second write while the first is out').toBe(1);
    expect(pageHide()).toBe(1);
    expect(hideTab()).toBe(1);
    await act(async () => { held.release(); });
    await settle();
    // The page is still there (a test, or a browser loading the next page):
    // ZQSB goes right after the first is stored, not on its own wait.
    expect(upsertSpy, 'one more write, once').toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQSB'), keepalive: true, token: 'ZQ-TOKEN' });
    await advance(900);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('a write the browser cuts off as the page goes is not followed at once by a newer one (it may still be stored)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQSC');
    await advance(800);
    await typeText(ed, ' ZQSD');
    await advance(900); // ZQSD's own wait is up: its save waits for the held one
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    closeTab();
    await act(async () => { held.fail(); });
    await settle();
    expect(upsertSpy, 'nothing sent right after the cut-off write').toHaveBeenCalledTimes(1);
    expect(pageHide(), 'nor at pagehide').toBe(1);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    // The page stayed (a slow next page, or one that answered 204): not by
    // the retry 2 s later either, nor by a later leave event, while the cut
    // write may still land (review round 1, R1-2: it landed after the
    // retry's newer write, Firefox and WebKit).
    await advance(2100);
    await settle();
    expect(upsertSpy, 'not by the retry').toHaveBeenCalledTimes(1);
    expect(hideTab(), 'nor by the tab hidden').toBe(1);
    // 10 s after the cut-off the newest change is written.
    await advance(CUT_OFF_SETTLE_MS - 2100);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQSD');
    // Once a write is stored again, leaving writes the next change at once.
    await typeText(ed, ' ZQSD2');
    closeTab();
    expect(upsertSpy, 'the next leave writes again').toHaveBeenCalledTimes(3);
    expect(writes()[2]).toEqual({ text: expect.stringContaining('ZQSD2'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('a failure with no leave after it is not a cut-off: the write waiting goes 200 ms after it (review round 2: a leave in that time would make it the cut)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQSE');
    await advance(800);
    await typeText(ed, ' ZQSF');
    await advance(900);
    await act(async () => { held.fail(); });
    await settle();
    await advance(250);
    await settle();
    expect(upsertSpy, 'the write waiting went once the 200 ms were over').toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQSF');
  });

  it('the newer change\'s own save waiting on a write the browser cuts just before its leave event: not sent in the moment between them; the newest 10 s later (review round 2, R2-1\'s sibling)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQWE');
    await advance(800);
    await typeText(ed, ' ZQWF');
    await advance(900); // ZQWF's own save is up, waiting for the held one
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { held.fail(); });
    await settle();
    // On main the waiting save went at once, before the leave event (WebKit:
    // stored under the held one, keep-work-check
    // L4-slow-write-then-own-save-back-traced on main, 1 of 4 runs).
    expect(upsertSpy, 'nothing sent in the moment before the leave').toHaveBeenCalledTimes(1);
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted).toBe(true);
    expect(callsAfterBeforeUnload).toBe(1);
    await advance(2100);
    await settle();
    expect(upsertSpy, 'nor after it, while the cut write may land').toHaveBeenCalledTimes(1);
    await advance(CUT_OFF_SETTLE_MS - 2100);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQWF');
  });

  it('the dialog answered with Stay, then an edit while the leave\'s write is out: the edit waits for it', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQSG');
    closeTab();
    expect(writes()[0]!.keepalive).toBe(true);
    await typeText(ed, ' ZQSH');
    await advance(900);
    expect(upsertSpy, 'the edit\'s save waits for the leave\'s write').toHaveBeenCalledTimes(1);
    await act(async () => { held.release(); });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQSH'), keepalive: false, token: null });
  });

  it('the change\'s own save already waiting on a write when the page is left: sent with keepalive once that write lands (review round 1, R1-3)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQPA');
    await advance(800);
    await typeText(ed, ' ZQPB');
    await advance(900); // ZQPB's own save is up, waiting for the held one
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    closeTab();
    await act(async () => { held.release(); });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQPB'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('the leave\'s own write failing (Stay, then the network) is no cut-off: the tab hidden next writes the change again at once (review round 1, R1-4)', async () => {
    // The clock stands still inside an event handler, as Date.now() can.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    upsertSpy.mockRejectedValueOnce(offline());
    await openAndType(' ZQSTAY');
    expect(closeTab().callsAfterBeforeUnload).toBe(1);
    await settle();
    expect(writes()[0]!.keepalive).toBe(true);
    expect(hideTab(), 'written again').toBe(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQSTAY'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('the page going with no beforeunload (pagehide) while an ordinary write is out that then fails: a cut-off too (review round 1, R1-2)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQPH');
    await advance(800);
    await typeText(ed, ' ZQPI');
    expect(pageHide(), 'waits for the write out').toBe(1);
    await act(async () => { held.fail(); });
    await settle();
    expect(upsertSpy, 'nothing newer right after the cut write').toHaveBeenCalledTimes(1);
    await advance(2100);
    expect(hideTab(), 'nor at its retry or when the tab is hidden').toBe(1);
    await advance(CUT_OFF_SETTLE_MS - 2100);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQPI');
  });

  it('nor is a keepalive write still out at a later leave event (pagehide) that then fails (review round 1, R1-4)', async () => {
    const held = holdNextWrite();
    await openAndType(' ZQKA');
    closeTab();
    expect(writes()[0]!.keepalive).toBe(true);
    expect(pageHide(), 'nothing more while it is out').toBe(1);
    await act(async () => { held.fail(); });
    await settle();
    expect(hideTab(), 'written again at once').toBe(2);
  });

  it('the leave\'s own keepalive write failing, then the tab closed again at once: written again (the page going does not cut a keepalive write; review round 2, R2-1)', async () => {
    upsertSpy.mockRejectedValueOnce(offline());
    await openAndType(' ZQKAF');
    expect(closeTab().callsAfterBeforeUnload).toBe(1);
    await settle();
    expect(writes()[0]!.keepalive).toBe(true);
    const again = closeTab();
    expect(again.prompted).toBe(true);
    expect(again.callsAfterBeforeUnload, 'written again at once').toBe(2);
  });

  it('a write out that the browser cuts just BEFORE its leave event (WebKit\'s Back stops the page\'s loads first): a cut-off too, nothing newer at once nor by its retry; the newest 10 s later (review round 2, R2-1)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQWA');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQWB');
    // The held write fails, then beforeunload a moment later (2-12 ms in
    // WebKit, MEASURED: keep-work-check L4-slow-write-then-edit-back-traced).
    await act(async () => { held.fail(); });
    await settle();
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: ZQWB is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'nothing newer sent at the leave: the cut write may still be stored').toBe(1);
    expect(pageHide(), 'nor at pagehide').toBe(1);
    await advance(2100);
    await settle();
    expect(upsertSpy, 'nor by its retry, nor by its own 800 ms wait').toHaveBeenCalledTimes(1);
    await advance(CUT_OFF_SETTLE_MS - 2100);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQWB');
  });
});

describe('the leave\'s keepalive is for a write sent at the leave (review round 2, R2-3)', () => {
  it('Stay answered while a write is out, that write stored with nothing left: the next edit\'s save is an ordinary request', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQKA');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(closeTab().prompted, 'the dialog, answered Stay').toBe(true);
    await act(async () => { held.release(); });
    await settle();
    expect(upsertSpy, 'stored: nothing left to write').toHaveBeenCalledTimes(1);
    await advance(4000);
    await typeText(ed, ' ZQKB');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQKB'), keepalive: false, token: null });
  });

  it('the tab hidden and shown again while a write is out: the same', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQKC');
    await advance(800);
    expect(hideTab(), 'waits for the write out').toBe(1);
    await act(async () => { held.release(); });
    await settle();
    await typeText(ed, ' ZQKD');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.keepalive).toBe(false);
  });

  it('a write the leave cut off, then the user stays: the newest, written 10 s later, is an ordinary request', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQKE');
    await advance(800);
    await typeText(ed, ' ZQKF');
    closeTab();
    await act(async () => { held.fail(); });
    await settle();
    expect(upsertSpy, 'cut off: nothing newer').toHaveBeenCalledTimes(1);
    await advance(CUT_OFF_SETTLE_MS);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQKF'), keepalive: false, token: null });
  });
});

describe('only a failure with no answer may be the browser\'s cut: a server\'s error answer says nothing was stored (review round 3, R3-1)', () => {
  it('a save the server answered with an error, then the tab closed 60 ms later: the change written at once, with keepalive', async () => {
    upsertSpy.mockRejectedValueOnce(serverError());
    await openAndType(' ZQ5A');
    await advance(800);
    await settle();
    expect(upsertSpy, 'the first save, answered 500').toHaveBeenCalledTimes(1);
    await advance(60);
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: the change is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'written while the event ran (on correction 2: counted as cut, not sent)').toBe(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQ5A'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('a save out at the leave that the server then answers with an error: no cut-off, the change written right after it, with keepalive (not 10 s later)', async () => {
    const held = holdNextWrite();
    await openAndType(' ZQ5H');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(closeTab().prompted, 'the dialog, answered Stay').toBe(true);
    await act(async () => { held.fail(serverError()); });
    await settle();
    expect(upsertSpy, 'the leave\'s write, right after the answer').toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQ5H'), keepalive: true, token: 'ZQ-TOKEN' });
  });

  it('with no leave, a save waiting on a write the server answered with an error goes at once (not 200 ms later)', async () => {
    const held = holdNextWrite();
    const ed = await openAndType(' ZQ5W');
    await advance(800);
    await typeText(ed, ' ZQ5X');
    await advance(900); // ZQ5X's own save is up, waiting for the held one
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { held.fail(serverError()); });
    await settle();
    expect(upsertSpy, 'sent at once after the answer').toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQ5X');
  });
});

describe('a save its own timer starts in the moment after a failure with no answer waits that moment too (review round 3, R3-2)', () => {
  /** A save held; a newer edit; the held save fails with no answer 700 ms after it, before the edit's own 800 ms wait is up. */
  async function failBeforeOwnWait(a: string, b: string) {
    const held = holdNextWrite();
    const ed = await openAndType(a);
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, b);
    await advance(700);
    await act(async () => { held.fail(); });
    await settle();
    // The edit's own wait is up 100 ms after the failure.
    await advance(120);
    await settle();
  }

  it('the newer change\'s own 800 ms wait firing then: not sent; a leave then makes the failure its cut, and the newest goes 10 s later', async () => {
    await failBeforeOwnWait(' ZQGA', ' ZQGB');
    // On correction 2 it was sent at once: in WebKit stored before the cut
    // write, which then landed over it (keep-work-check L4-cut-then-debounce-*,
    // L4-gap-*).
    expect(upsertSpy, 'not sent in the moment after the failure').toHaveBeenCalledTimes(1);
    const { prompted, callsAfterBeforeUnload } = closeTab();
    expect(prompted, 'the dialog: ZQGB is unsaved').toBe(true);
    expect(callsAfterBeforeUnload, 'nothing newer at the leave: the cut write may still be stored').toBe(1);
    await advance(2100);
    await settle();
    expect(upsertSpy, 'nor by a retry').toHaveBeenCalledTimes(1);
    await advance(CUT_OFF_SETTLE_MS - 2100);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes()[1]!.text).toContain('ZQGB');
  });

  it('with no leave, it goes when the 200 ms after the failure are over', async () => {
    await failBeforeOwnWait(' ZQGC', ' ZQGD');
    expect(upsertSpy, 'held while the moment lasts').toHaveBeenCalledTimes(1);
    await advance(100);
    await settle();
    expect(upsertSpy, 'sent once it is over').toHaveBeenCalledTimes(2);
    expect(writes()[1]).toEqual({ text: expect.stringContaining('ZQGD'), keepalive: false, token: null });
  });
});
