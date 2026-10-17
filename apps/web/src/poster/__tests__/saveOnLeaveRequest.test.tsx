/**
 * Fix 38 — from the keystroke to the request (docs/fixes/38-save-on-leave.md,
 * L1): a word typed in a text block, then the page left. Nothing between
 * the editor and `fetch` is mocked: the autosave hook and the data layer's
 * `upsertPoster` are the app's; the network is a `fetch` that records, and
 * the Supabase client is mocked only for what the editor reads (its session
 * token, `ZQ-TOKEN`, as the client reports it; the project's address).
 *
 * On main the leave's save went through the client's own update, which
 * reads the session asynchronously before it sends: no request had been
 * made by the time the browser's event returned (MEASURED in the browser:
 * keep-work-check L1-*; here the client's update is not even reached
 * synchronously).
 *
 * The saves made before the page is left are the client's own update: a
 * real Supabase client's PostgREST builder over the same recording `fetch`
 * (review round 3, R3-1: a server's error answer reaches the hook with its
 * status, so it is not taken for the browser's cut).
 *
 * Re-run: npx vitest run src/poster/__tests__/saveOnLeaveRequest.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';

const authListeners = vi.hoisted(() => [] as Array<(event: string, session: unknown) => void>);

vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  // The client's own update (its PostgREST builder), over the test's fetch.
  const real = createClient('https://zq-project.supabase.co', 'zq-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a)) as typeof fetch },
  });
  return {
  supabaseUrl: 'https://zq-project.supabase.co',
  supabaseKey: 'zq-publishable-key',
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'ZQ-TOKEN', user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authListeners.push(cb);
        queueMicrotask(() => cb('INITIAL_SESSION', { access_token: 'ZQ-TOKEN', user: { id: 'u1' } }));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      update: (values: never) => real.from(table).update(values),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
  };
});
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
  installContentEditableShim,
  installExecCommandShim,
  load,
  renderEditor,
  typeText,
  undoDoc,
} from './undoKit';
import { reportUiSignal } from '@/lib/diagnostics';

interface Sent { url: string; method?: string; keepalive?: boolean; body: string; auth: string | null }
let sent: Sent[] = [];
/** How the next poster writes are answered, in order (then 200 with the row). */
let answers: Array<() => Promise<Response>> = [];
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  sent = [];
  answers = [];
  vi.mocked(reportUiSignal).mockClear();
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit & { keepalive?: boolean }) => {
    sent.push({ url: String(url), method: init.method, keepalive: init.keepalive, body: String(init.body ?? ''), auth: new Headers(init.headers).get('authorization') });
    const next = /\/rest\/v1\/posters\?/.test(String(url)) && init.method === 'PATCH' ? answers.shift() : undefined;
    return next ? next() : Promise.resolve(new Response(JSON.stringify({ id: 'fixture-1' }), { status: 200 }));
  }));
  load(undoDoc());
});
afterEach(() => {
  // Close the editor, then sign out: a change a closed editor still keeps
  // (fix 38, review round 1) is given up, so nothing carries into the next test.
  cleanup();
  authListeners.forEach((cb) => cb('SIGNED_OUT', null));
  authListeners.length = 0;
  vi.unstubAllGlobals();
});

async function openAndType(word: string) {
  renderEditor();
  await settle();
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, word);
}

const posterWrites = () => sent.filter((s) => /\/rest\/v1\/posters\?/.test(s.url) && s.method === 'PATCH');

describe('a word typed, then the page left: the request is made while the browser\'s event runs', () => {
  it('the tab closed (beforeunload): one PATCH of the poster with the word, keepalive, the session\'s token', async () => {
    await openAndType(' ZQREQ');
    expect(posterWrites(), 'nothing sent inside the 800 ms wait').toHaveLength(0);
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    // Read before anything is awaited: after the event the page may be gone.
    const writes = posterWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      url: 'https://zq-project.supabase.co/rest/v1/posters?id=eq.fixture-1&select=*',
      method: 'PATCH', keepalive: true, auth: 'Bearer ZQ-TOKEN',
    });
    expect(writes[0]!.body).toContain('ZQREQ');
  });

  it('the page going with no beforeunload (pagehide): the same request', async () => {
    await openAndType(' ZQREQ2');
    window.dispatchEvent(new Event('pagehide'));
    const writes = posterWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', keepalive: true, auth: 'Bearer ZQ-TOKEN' });
    expect(writes[0]!.body).toContain('ZQREQ2');
  });
});

describe('the first save failed, then the tab closed 60 ms later (review round 3, R3-1)', () => {
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  /** A word typed, its save (the client's own update) answered as `answer` says; resolves once the hook has seen the failure. */
  async function typeAndFail(word: string, answer: () => Promise<Response>) {
    answers = [answer];
    await openAndType(word);
    await tick(800);
    await vi.waitFor(() => expect(reportUiSignal).toHaveBeenCalled());
    expect(posterWrites(), 'the save, the client\'s own request').toHaveLength(1);
    expect(posterWrites()[0]!.keepalive).toBeFalsy();
  }

  it('the server answered 500 (it stored nothing): the leave\'s keepalive PATCH is made while the event runs, and the failure is reported with its status', async () => {
    await typeAndFail(' ZQREQ5', async () => new Response(JSON.stringify({ code: 'XX000', details: null, hint: null, message: 'internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    expect(vi.mocked(reportUiSignal).mock.calls[0]![0], 'the status reported (it was always 0)').toMatchObject({ kind: 'autosave_failed', status: 500 });
    await tick(60);
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    const writes = posterWrites();
    expect(writes, 'on correction 2: counted as the browser\'s cut, nothing sent').toHaveLength(2);
    expect(writes[1]).toMatchObject({ method: 'PATCH', keepalive: true, auth: 'Bearer ZQ-TOKEN' });
    expect(writes[1]!.body).toContain('ZQREQ5');
  });

  it('no answer (the network): counted as the leave\'s cut, nothing more sent (the rule\'s cost: an engine\'s cut looks the same)', async () => {
    await typeAndFail(' ZQREQN', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(vi.mocked(reportUiSignal).mock.calls[0]![0]).toMatchObject({ kind: 'autosave_failed', status: 0 });
    await tick(60);
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(posterWrites()).toHaveLength(1);
  });
});
