/**
 * Tests for the poster repository.
 *
 * These stub the Supabase client at the module level with vi.mock so
 * that each query chain (`.from('posters').select(...).eq(...)` etc.)
 * is recorded and inspected by the test. No network, no local DB —
 * pure contract tests.
 *
 * Covers Phase 4.1 scope:
 *   - loadPoster / loadMostRecentPoster / loadOrCreateMostRecentPoster
 *   - createPoster
 *   - upsertPoster (used by autosave)
 *   - listPosters (Home page grid)
 *   - duplicatePoster
 *   - deletePoster
 *   - error bubbling: every repo function converts a Supabase
 *     `error` into a thrown Error with a descriptive message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

// ---------------------------------------------------------------------------
// Supabase client mock
// ---------------------------------------------------------------------------
// Each test rebuilds the mock via `setNextResponses` to express the happy
// path or an error path for the query chain in question. The builder below
// is deliberately dumb: it records which method was called, captures args,
// and returns itself so `.select().eq().maybeSingle()` chains resolve.

interface QueryTrace {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
  resolved: { data: unknown; error: unknown } | null;
}

let traces: QueryTrace[] = [];
let nextResponses: Array<{ data: unknown; error: unknown }> = [];
let fakeUser: { id: string } | null = { id: 'user-1' };
let getUserError: { message: string } | null = null;

function makeQuery(table: string) {
  const trace: QueryTrace = { table, ops: [], resolved: null };
  traces.push(trace);

  const thenable: {
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
  } & Record<string, (...args: unknown[]) => unknown> = {
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
      const response = nextResponses.shift() ?? { data: null, error: null };
      trace.resolved = response;
      resolve(response);
    },
  } as never;

  const chain = (method: string) => (...args: unknown[]) => {
    trace.ops.push({ method, args });
    return thenable;
  };

  // Terminal chain methods that return a Promise-like.
  thenable.select = chain('select');
  thenable.eq = chain('eq');
  thenable.order = chain('order');
  thenable.limit = chain('limit');
  thenable.maybeSingle = chain('maybeSingle');
  thenable.single = chain('single');
  thenable.insert = chain('insert');
  thenable.update = chain('update');
  thenable.upsert = chain('upsert');
  thenable.delete = chain('delete');

  return thenable;
}

// vi.mock is hoisted, so any vars it references have to live inside
// a vi.hoisted() block or they'll be temporal-dead-zone undefined.
const { signInAnonymouslyMock, signOutMock, storageCopyMock } = vi.hoisted(() => ({
  signInAnonymouslyMock: vi.fn(async () => ({
    data: { session: { user: { id: 'user-1' } }, user: { id: 'user-1' } },
    error: null,
  })),
  signOutMock: vi.fn(async () => ({ error: null })),
  storageCopyMock: vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: fakeUser },
        error: getUserError,
      })),
      signInAnonymously: signInAnonymouslyMock,
      signOut: signOutMock,
    },
    storage: {
      from: () => ({ copy: storageCopyMock }),
    },
  },
}));

import {
  createPoster,
  deletePoster,
  duplicatePoster,
  listPosters,
  loadMostRecentPoster,
  loadOrCreateMostRecentPoster,
  loadPoster,
  upsertPoster,
  type PosterRow,
} from '../posters';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeDoc(overrides: Partial<PosterDoc> = {}): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [],
    fontFamily: 'Inter',
    palette: {
      bg: '#ffffff',
      primary: '#0f172a',
      accent: '#2563eb',
      accent2: '#0ea5e9',
      muted: '#64748b',
      headerBg: '#0f172a',
      headerFg: '#ffffff',
    },
    styles: {
      title: { size: 72, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 600, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 18, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 14, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
    ...overrides,
  };
}

function makeRow(overrides: Partial<PosterRow> = {}): PosterRow {
  return {
    id: 'poster-1',
    user_id: 'user-1',
    title: 'Untitled Poster',
    width_in: 48,
    height_in: 36,
    data: makeDoc(),
    thumbnail_path: null,
    share_slug: null,
    is_public: false,
    created_at: '2026-04-08T00:00:00Z',
    updated_at: '2026-04-08T00:00:00Z',
    ...overrides,
  };
}

function setResponses(...responses: Array<{ data: unknown; error: unknown }>) {
  nextResponses = responses;
}

beforeEach(() => {
  traces = [];
  nextResponses = [];
  fakeUser = { id: 'user-1' };
  getUserError = null;
  storageCopyMock.mockClear();
  storageCopyMock.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// loadPoster
// ---------------------------------------------------------------------------
describe('loadPoster', () => {
  it('returns the row when Supabase returns one', async () => {
    const row = makeRow();
    setResponses({ data: row, error: null });

    const result = await loadPoster('poster-1');

    expect(result).toEqual(row);
    const trace = traces[0]!;
    expect(trace.table).toBe('posters');
    expect(trace.ops.map((o) => o.method)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(trace.ops[1]!.args).toEqual(['id', 'poster-1']);
  });

  it('returns null when the row is missing', async () => {
    setResponses({ data: null, error: null });
    expect(await loadPoster('missing')).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    setResponses({ data: null, error: { message: 'rls denied' } });
    await expect(loadPoster('x')).rejects.toThrow(/rls denied/);
  });
});

// ---------------------------------------------------------------------------
// loadMostRecentPoster
// ---------------------------------------------------------------------------
describe('loadMostRecentPoster', () => {
  it('orders by updated_at desc and limits to 1', async () => {
    const row = makeRow({ id: 'recent' });
    setResponses({ data: row, error: null });

    const result = await loadMostRecentPoster();

    expect(result?.id).toBe('recent');
    const trace = traces[0]!;
    const methods = trace.ops.map((o) => o.method);
    expect(methods).toEqual(['select', 'order', 'limit', 'maybeSingle']);
    expect(trace.ops[1]!.args[0]).toBe('updated_at');
    expect(trace.ops[1]!.args[1]).toMatchObject({ ascending: false });
    expect(trace.ops[2]!.args).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// createPoster
// ---------------------------------------------------------------------------
describe('createPoster', () => {
  it('inserts a row tied to the current auth user and returns it', async () => {
    const row = makeRow({ id: 'new-poster' });
    setResponses({ data: row, error: null });

    const result = await createPoster();

    expect(result.id).toBe('new-poster');
    const trace = traces[0]!;
    expect(trace.ops[0]!.method).toBe('insert');
    expect(trace.ops[0]!.args[0]).toMatchObject({ user_id: 'user-1' });
  });

  it('throws when there is no active user', async () => {
    fakeUser = null;
    await expect(createPoster()).rejects.toThrow(/no active user/i);
  });

  it('throws when Supabase insert fails', async () => {
    setResponses({ data: null, error: { message: 'constraint violation' } });
    await expect(createPoster()).rejects.toThrow(/constraint violation/);
  });

  // Regression: after `supabase db reset` the browser holds a JWT for
  // a user that no longer exists. The first insert fails with
  // "User from sub claim in JWT does not exist"; createPoster should
  // wipe the local session, sign in anonymously again, and retry.
  it('re-bootstraps on a stale JWT and retries the insert', async () => {
    signInAnonymouslyMock.mockClear();
    signOutMock.mockClear();

    const row = makeRow({ id: 'healed' });
    setResponses(
      { data: null, error: { message: 'User from sub claim in JWT does not exist' } },
      { data: row, error: null },
    );

    const result = await createPoster();

    expect(result.id).toBe('healed');
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// loadOrCreateMostRecentPoster
// ---------------------------------------------------------------------------
describe('loadOrCreateMostRecentPoster', () => {
  it('returns the existing row when one is found', async () => {
    const row = makeRow({ id: 'existing' });
    setResponses({ data: row, error: null });

    const result = await loadOrCreateMostRecentPoster();

    expect(result.id).toBe('existing');
    // Only one query was issued (the load) — no create.
    expect(traces).toHaveLength(1);
  });

  it('creates a new row when none exists', async () => {
    const row = makeRow({ id: 'fresh' });
    setResponses(
      { data: null, error: null }, // loadMostRecentPoster → null
      { data: row, error: null }, // createPoster → row
    );

    const result = await loadOrCreateMostRecentPoster();

    expect(result.id).toBe('fresh');
    expect(traces).toHaveLength(2);
    expect(traces[1]!.ops[0]!.method).toBe('insert');
  });
});

// ---------------------------------------------------------------------------
// upsertPoster (autosave)
// ---------------------------------------------------------------------------
describe('upsertPoster', () => {
  it('updates data + updated_at and returns the new row', async () => {
    const row = makeRow({ id: 'poster-1' });
    setResponses({ data: row, error: null });

    const doc = makeDoc({ fontFamily: 'Merriweather' });
    const result = await upsertPoster('poster-1', { data: doc });

    expect(result.id).toBe('poster-1');
    const trace = traces[0]!;
    expect(trace.table).toBe('posters');
    const updateOp = trace.ops.find((o) => o.method === 'update');
    expect(updateOp).toBeDefined();
    const payload = updateOp!.args[0] as Record<string, unknown>;
    expect(payload.data).toEqual(doc);
    expect(payload.updated_at).toBeTypeOf('string');
    const eqOp = trace.ops.find((o) => o.method === 'eq');
    expect(eqOp!.args).toEqual(['id', 'poster-1']);
  });

  it('supports title and size changes in one call', async () => {
    const row = makeRow({ title: 'Renamed', width_in: 36, height_in: 48 });
    setResponses({ data: row, error: null });

    await upsertPoster('poster-1', {
      title: 'Renamed',
      widthIn: 36,
      heightIn: 48,
    });

    const payload = traces[0]!.ops.find((o) => o.method === 'update')!.args[0] as Record<
      string,
      unknown
    >;
    expect(payload.title).toBe('Renamed');
    expect(payload.width_in).toBe(36);
    expect(payload.height_in).toBe(48);
  });

  it('throws when Supabase returns an error', async () => {
    setResponses({ data: null, error: { message: 'rls denied' } });
    await expect(upsertPoster('poster-1', { title: 'x' })).rejects.toThrow(/rls denied/);
  });
});

// ---------------------------------------------------------------------------
// listPosters
// ---------------------------------------------------------------------------
describe('listPosters', () => {
  it('filters by current user_id and orders by updated_at desc', async () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
    setResponses({ data: rows, error: null });

    const result = await listPosters();

    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    const trace = traces[0]!;
    const eqOp = trace.ops.find((o) => o.method === 'eq');
    expect(eqOp!.args).toEqual(['user_id', 'user-1']);
    const order = trace.ops.find((o) => o.method === 'order');
    expect(order!.args[0]).toBe('updated_at');
    expect(order!.args[1]).toMatchObject({ ascending: false });
  });

  it('returns an empty array when Supabase returns null data', async () => {
    setResponses({ data: null, error: null });
    expect(await listPosters()).toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    setResponses({ data: null, error: { message: 'boom' } });
    await expect(listPosters()).rejects.toThrow(/boom/);
  });

  it('throws when there is no active user', async () => {
    fakeUser = null;
    await expect(listPosters()).rejects.toThrow(/no active user/i);
  });
});

// ---------------------------------------------------------------------------
// duplicatePoster
// ---------------------------------------------------------------------------
describe('duplicatePoster', () => {
  it('loads the source row and inserts a copy owned by the CURRENT user', async () => {
    // Source belongs to a different user (e.g. a public gallery
    // poster) — duplicate must still succeed and own the new row.
    // No thumbnail on the source so the storage copy step is skipped.
    const source = makeRow({ id: 'src', title: 'My Poster', user_id: 'someone-else' });
    const copy = makeRow({ id: 'dst', title: 'My Poster (copy)' });
    setResponses(
      { data: source, error: null }, // loadPoster
      { data: copy, error: null }, // insert
    );

    const result = await duplicatePoster('src');

    expect(result.id).toBe('dst');
    expect(traces).toHaveLength(2);
    const insertOp = traces[1]!.ops.find((o) => o.method === 'insert')!;
    const payload = insertOp.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe('user-1');
    expect(payload.title).toBe('My Poster (copy)');
    expect(payload.data).toEqual(source.data);
    expect(payload.width_in).toBe(48);
    expect(payload.height_in).toBe(36);
    // New row must NOT carry over the share_slug or is_public.
    expect(payload.share_slug).toBeUndefined();
    expect(payload.is_public).toBeUndefined();
    // No thumbnail on source → no storage copy attempted.
    expect(storageCopyMock).not.toHaveBeenCalled();
  });

  it('copies the source thumbnail into the current user\'s folder when present', async () => {
    const source = makeRow({
      id: 'src',
      title: 'Has Thumb',
      thumbnail_path: 'user-1/src/thumbnail.jpg',
    });
    const copy = makeRow({ id: 'dst', title: 'Has Thumb (copy)' });
    setResponses(
      { data: source, error: null }, // loadPoster
      { data: copy, error: null }, // insert new row
      { data: null, error: null }, // update with new thumbnail_path
    );

    const result = await duplicatePoster('src');

    expect(result.id).toBe('dst');
    expect(result.thumbnail_path).toBe('user-1/dst/thumbnail.jpg');
    expect(storageCopyMock).toHaveBeenCalledWith(
      'user-1/src/thumbnail.jpg',
      'user-1/dst/thumbnail.jpg',
    );
    // Third trace is the update writing the new thumbnail_path.
    const updateOp = traces[2]!.ops.find((o) => o.method === 'update')!;
    expect((updateOp.args[0] as Record<string, unknown>).thumbnail_path).toBe(
      'user-1/dst/thumbnail.jpg',
    );
  });

  it('still returns the duplicate when the storage copy fails', async () => {
    const source = makeRow({
      id: 'src',
      thumbnail_path: 'someone-else/src/thumbnail.jpg', // cross-user, RLS may deny
    });
    const copy = makeRow({ id: 'dst' });
    storageCopyMock.mockResolvedValueOnce({ data: null, error: { message: 'rls' } });
    setResponses(
      { data: source, error: null }, // loadPoster
      { data: copy, error: null }, // insert
    );

    const result = await duplicatePoster('src');

    expect(result.id).toBe('dst');
    // Storage copy was attempted but failed → no follow-up update,
    // and the returned row still carries the source row's path
    // (not surfaced as broken because PosterCard's onError falls
    // back to the synthetic preview).
    expect(storageCopyMock).toHaveBeenCalled();
    expect(traces).toHaveLength(2);
  });

  it('throws when the source poster is missing', async () => {
    setResponses({ data: null, error: null });
    await expect(duplicatePoster('missing')).rejects.toThrow(/not found/i);
  });

  it('throws when the source load errors', async () => {
    setResponses({ data: null, error: { message: 'rls' } });
    await expect(duplicatePoster('x')).rejects.toThrow(/rls/);
  });

  it('throws when there is no active user', async () => {
    const source = makeRow({ id: 'src' });
    setResponses({ data: source, error: null });
    fakeUser = null;
    await expect(duplicatePoster('src')).rejects.toThrow(/no active user/i);
  });
});

// ---------------------------------------------------------------------------
// deletePoster
// ---------------------------------------------------------------------------
describe('deletePoster', () => {
  it('calls .delete().eq("id", id) on posters', async () => {
    setResponses({ data: null, error: null });

    await deletePoster('poster-1');

    const trace = traces[0]!;
    expect(trace.table).toBe('posters');
    expect(trace.ops.map((o) => o.method)).toEqual(['delete', 'eq']);
    expect(trace.ops[1]!.args).toEqual(['id', 'poster-1']);
  });

  it('throws when Supabase returns an error', async () => {
    setResponses({ data: null, error: { message: 'cannot delete' } });
    await expect(deletePoster('poster-1')).rejects.toThrow(/cannot delete/);
  });
});
