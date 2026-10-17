/**
 * Fix 38 — the save sent as the page is left (docs/fixes/38-save-on-leave.md,
 * rules L1 and L2): `upsertPoster(id, update, { keepalive, accessToken })`.
 *
 *   - It is sent before the function first waits (a `beforeunload` or
 *     `pagehide` handler cannot wait), with `keepalive: true`.
 *   - It is the request the Supabase client itself sends for the same
 *     update (address, method, headers, body): the client's own request is
 *     captured here from a real `createClient` given a fetch that records,
 *     so a change in either is seen. Only the token differs: the session's,
 *     where this client, signed out, sends its key.
 *   - No token, or a body over KEEPALIVE_BODY_MAX: the client's own update,
 *     as every other save (the leave dialog is then the protection).
 *   - The answer read as the client reads it: the row, or the error's
 *     message ("Failed to save poster: …"), with the answer's HTTP status on
 *     the error, 0 when there was no answer (review round 3, R3-1: the hook
 *     counts only a failure with no answer as one the browser may have cut).
 *
 * Re-run: npx vitest run src/data/__tests__/posterKeepalive.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { PosterDoc } from '@postr/shared';

const URL_ = 'https://zq-project.supabase.co';
const KEY = 'zq-publishable-key';

/** The client's own chain, recorded: what `upsertPoster` asks of it without keepalive. */
const clientCalls = vi.hoisted(() => [] as Array<{ table: string; update: unknown; eq: unknown[] }>);
/** The client's answer to its update, in PostgREST's shape (`status` 0 when its fetch failed). */
const clientAnswer = vi.hoisted(() => ({ current: { data: { id: 'row-from-client' } as unknown, error: null as null | { message: string }, status: 200 } }));

vi.mock('@/lib/supabase', () => ({
  supabaseUrl: 'https://zq-project.supabase.co',
  supabaseKey: 'zq-publishable-key',
  supabase: {
    from: (table: string) => ({
      update: (update: unknown) => ({
        eq: (...eq: unknown[]) => {
          clientCalls.push({ table, update, eq });
          return { select: () => ({ single: async () => clientAnswer.current }) };
        },
      }),
    }),
  },
}));

import { KEEPALIVE_BODY_MAX, upsertPoster } from '../posters';

function makeDoc(text = 'ZQ words'): PosterDoc {
  return {
    version: 1, widthIn: 48, heightIn: 36, fontFamily: 'Inter',
    blocks: [{ id: 'b1', type: 'text', x: 0, y: 0, w: 100, h: 50, content: text, imageSrc: null, imageFit: 'contain', tableData: null }],
    palette: { bg: '#fff', primary: '#000', accent: '#000', accent2: '#000', muted: '#000', headerBg: '#000', headerFg: '#fff' },
    styles: {
      title: { size: 22, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
      heading: { size: 8, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
      authors: { size: 5, weight: 400, italic: false, lineHeight: 1.5, color: null, highlight: null },
      body: { size: 5, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [], authors: [], references: [],
  } as unknown as PosterDoc;
}

interface Sent { url: string; init: RequestInit & { keepalive?: boolean } }
let sent: Sent[] = [];
let answer: () => Response = () => new Response(JSON.stringify({ id: 'p-1', title: 'ZQ' }), { status: 200 });

beforeEach(() => {
  sent = [];
  clientCalls.length = 0;
  clientAnswer.current = { data: { id: 'row-from-client' }, error: null, status: 200 };
  answer = () => new Response(JSON.stringify({ id: 'p-1', title: 'ZQ' }), { status: 200 });
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return Promise.resolve(answer());
  }));
});
afterEach(() => vi.unstubAllGlobals());

const update = () => ({ data: makeDoc(), title: 'ZQ poster', widthIn: 48, heightIn: 36 });
const headersOf = (init: RequestInit) => Object.fromEntries(new Headers(init.headers).entries());

describe('L1: the save sent as the page is left', () => {
  it('is sent before upsertPoster first waits, with keepalive', () => {
    void upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' });
    // No await above: a leave handler gets no later chance.
    expect(sent, 'fetch called at once').toHaveLength(1);
    expect(sent[0]!.init.keepalive).toBe(true);
    expect(clientCalls, 'not the client\'s own (asynchronous) update').toHaveLength(0);
  });

  it('is the request the Supabase client sends for the same update, with the session\'s token', async () => {
    const theirs: Sent[] = [];
    const client = createClient(URL_, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (async (url: string, init: RequestInit) => {
          theirs.push({ url: String(url), init });
          return new Response(JSON.stringify({ id: 'p-1' }), { status: 200 });
        }) as typeof fetch,
      },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00.000Z'));
    try {
      const u = update();
      await upsertPoster('p-1', u, { keepalive: true, accessToken: 'ZQ-TOKEN' });
      await client.from('posters').update({
        updated_at: new Date().toISOString(), title: u.title, width_in: u.widthIn, height_in: u.heightIn, data: u.data,
      } as never).eq('id', 'p-1').select('*').single();
    } finally {
      vi.useRealTimers();
    }
    expect(theirs).toHaveLength(1);
    const mine = sent[0]!;
    expect(mine.url, 'the address and filter').toBe(theirs[0]!.url);
    expect(mine.init.method).toBe(theirs[0]!.init.method);
    expect(JSON.parse(String(mine.init.body)), 'the body').toEqual(JSON.parse(String(theirs[0]!.init.body)));
    const h = headersOf(mine.init);
    const t = headersOf(theirs[0]!.init);
    // The client adds its version for its own telemetry; nothing reads it.
    delete t['x-client-info'];
    expect(h.authorization, 'the session\'s token').toBe('Bearer ZQ-TOKEN');
    expect(t.authorization, 'a signed-out client sends its key').toBe(`Bearer ${KEY}`);
    expect({ ...h, authorization: null }).toEqual({ ...t, authorization: null });
  });

  it('returns the saved row', async () => {
    const row = await upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' });
    expect(row).toMatchObject({ id: 'p-1' });
  });

  it('an error answer throws as the client\'s does: "Failed to save poster: <message>"', async () => {
    answer = () => new Response(JSON.stringify({ code: '42501', message: 'permission denied for table posters' }), { status: 403 });
    await expect(upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' }))
      .rejects.toThrow('Failed to save poster: permission denied for table posters');
    answer = () => new Response(JSON.stringify({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' }), { status: 406 });
    await expect(upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' }), 'no row: an error, as .single()')
      .rejects.toThrow(/Failed to save poster: Cannot coerce/);
  });

  it('a network failure rejects (a failed save, retried by the hook if the page stayed)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' })).rejects.toThrow('Failed to fetch');
  });

  it('the error carries the answer\'s status; a failure with no answer has none (review round 3, R3-1)', async () => {
    answer = () => new Response(JSON.stringify({ code: 'XX000', message: 'internal server error' }), { status: 500 });
    await expect(upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' }))
      .rejects.toMatchObject({ status: 500, message: 'Failed to save poster: internal server error' });
    answer = () => new Response(JSON.stringify({ code: '42501', message: 'permission denied for table posters' }), { status: 403 });
    await expect(upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' })).rejects.toMatchObject({ status: 403 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await upsertPoster('p-1', update(), { keepalive: true, accessToken: 'ZQ-TOKEN' }).catch((e: unknown) => e);
    expect((err as { status?: number }).status ?? 0, 'no answer').toBe(0);
  });
});

describe('the client\'s own update: its answer\'s status on the error too (review round 3, R3-1)', () => {
  it('a server\'s error answer (500): the status; a failed fetch (the client answers status 0): 0', async () => {
    clientAnswer.current = { data: null, error: { message: 'internal server error' }, status: 500 };
    await expect(upsertPoster('p-1', update())).rejects.toMatchObject({ status: 500, message: 'Failed to save poster: internal server error' });
    clientAnswer.current = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
    await expect(upsertPoster('p-1', update())).rejects.toMatchObject({ status: 0, message: 'Failed to save poster: TypeError: Failed to fetch' });
  });
});

describe('L2: when it cannot be sent so, the client\'s own update, as every other save', () => {
  it('no session token known', async () => {
    const row = await upsertPoster('p-1', update(), { keepalive: true, accessToken: null });
    expect(sent).toHaveLength(0);
    expect(clientCalls).toHaveLength(1);
    expect(row).toMatchObject({ id: 'row-from-client' });
  });

  it('a body over the keepalive limit (64 KiB, less room for the page\'s other keepalive requests)', async () => {
    expect(KEEPALIVE_BODY_MAX, 'room left under the 64 KiB quota').toBeLessThan(64 * 1024);
    const big = { data: makeDoc('x'.repeat(KEEPALIVE_BODY_MAX)) };
    await upsertPoster('p-1', big, { keepalive: true, accessToken: 'ZQ-TOKEN' });
    expect(sent).toHaveLength(0);
    expect(clientCalls).toHaveLength(1);
  });

  it('the limit is in bytes: text that is short in characters but long in UTF-8', async () => {
    const chars = Math.floor(KEEPALIVE_BODY_MAX / 3) - 100; // under the limit in characters, over it in bytes
    await upsertPoster('p-1', { data: makeDoc('€'.repeat(chars)) }, { keepalive: true, accessToken: 'ZQ-TOKEN' });
    expect(sent).toHaveLength(0);
    expect(clientCalls).toHaveLength(1);
  });

  it('a body just under the limit is sent with keepalive', async () => {
    const shell = JSON.stringify({ updated_at: new Date().toISOString(), data: makeDoc('') }).length;
    await upsertPoster('p-1', { data: makeDoc('x'.repeat(KEEPALIVE_BODY_MAX - shell - 64)) }, { keepalive: true, accessToken: 'ZQ-TOKEN' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.init.keepalive).toBe(true);
  });

  it('no keepalive asked: the client\'s own update', async () => {
    await upsertPoster('p-1', update());
    expect(sent).toHaveLength(0);
    expect(clientCalls).toHaveLength(1);
  });
});
