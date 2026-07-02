/**
 * Tests for the poster versions repository.
 *
 * Same approach as posters.test.ts: stub the Supabase client at the
 * module level so each query chain is recorded and inspected. No
 * network, no local DB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PosterDoc } from '@postr/shared';

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

  thenable.select = chain('select');
  thenable.eq = chain('eq');
  thenable.order = chain('order');
  thenable.limit = chain('limit');
  thenable.maybeSingle = chain('maybeSingle');
  thenable.single = chain('single');
  thenable.insert = chain('insert');
  thenable.update = chain('update');
  thenable.delete = chain('delete');

  return thenable;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: fakeUser },
        error: getUserError,
      })),
    },
  },
}));

import {
  listVersions,
  saveVersion,
  deleteVersion,
  loadVersion,
  MAX_VERSIONS_PER_POSTER,
  VERSION_WARNING_THRESHOLD,
} from '../posterVersions';

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

function setResponses(...responses: Array<{ data: unknown; error: unknown }>) {
  nextResponses = responses;
}

beforeEach(() => {
  traces = [];
  nextResponses = [];
  fakeUser = { id: 'user-1' };
  getUserError = null;
});

describe('constants', () => {
  it('soft cap sits above the warning threshold', () => {
    expect(VERSION_WARNING_THRESHOLD).toBeLessThan(MAX_VERSIONS_PER_POSTER);
    // Room below the DB backstop (30) for the auto "before restore" save.
    expect(MAX_VERSIONS_PER_POSTER).toBeLessThan(30);
  });
});

describe('listVersions', () => {
  it('selects by poster_id newest-first and omits the data column', async () => {
    setResponses({
      data: [
        { id: 'v2', poster_id: 'p1', user_id: 'user-1', name: 'B', created_at: '2026-07-02T01:00:00Z' },
        { id: 'v1', poster_id: 'p1', user_id: 'user-1', name: 'A', created_at: '2026-07-02T00:00:00Z' },
      ],
      error: null,
    });

    const rows = await listVersions('p1');

    expect(rows).toHaveLength(2);
    const trace = traces[0]!;
    expect(trace.table).toBe('poster_versions');
    const select = trace.ops.find((o) => o.method === 'select');
    expect(select?.args[0]).not.toContain('data');
    expect(trace.ops.find((o) => o.method === 'eq')?.args).toEqual(['poster_id', 'p1']);
    expect(trace.ops.find((o) => o.method === 'order')?.args).toEqual([
      'created_at',
      { ascending: false },
    ]);
  });

  it('returns [] when Supabase yields null data', async () => {
    setResponses({ data: null, error: null });
    expect(await listVersions('p1')).toEqual([]);
  });

  it('throws a descriptive error on failure', async () => {
    setResponses({ data: null, error: { message: 'boom' } });
    await expect(listVersions('p1')).rejects.toThrow(/Failed to list versions: boom/);
  });
});

describe('saveVersion', () => {
  it('inserts a snapshot owned by the session user', async () => {
    const doc = makeDoc();
    setResponses({
      data: { id: 'v1', poster_id: 'p1', user_id: 'user-1', name: 'Milestone', data: doc, created_at: 'now' },
      error: null,
    });

    const row = await saveVersion('p1', 'Milestone', doc);

    expect(row.id).toBe('v1');
    const insert = traces[0]!.ops.find((o) => o.method === 'insert');
    expect(insert?.args[0]).toMatchObject({
      poster_id: 'p1',
      user_id: 'user-1',
      name: 'Milestone',
    });
    // The full doc is persisted verbatim.
    expect((insert?.args[0] as { data: PosterDoc }).data).toBe(doc);
  });

  it('throws when there is no active user', async () => {
    fakeUser = null;
    getUserError = { message: 'no session' };
    await expect(saveVersion('p1', 'x', makeDoc())).rejects.toThrow(
      /Cannot save version — no active user/,
    );
  });

  it('surfaces an insert failure (e.g. the DB cap trigger)', async () => {
    setResponses({ data: null, error: { message: 'version limit: max 30 versions per poster' } });
    await expect(saveVersion('p1', 'x', makeDoc())).rejects.toThrow(/version limit/);
  });
});

describe('deleteVersion', () => {
  it('deletes by id', async () => {
    setResponses({ data: null, error: null });
    await deleteVersion('v9');
    expect(traces[0]!.ops.find((o) => o.method === 'delete')).toBeTruthy();
    expect(traces[0]!.ops.find((o) => o.method === 'eq')?.args).toEqual(['id', 'v9']);
  });

  it('throws on failure', async () => {
    setResponses({ data: null, error: { message: 'denied' } });
    await expect(deleteVersion('v9')).rejects.toThrow(/Failed to delete version: denied/);
  });
});

describe('loadVersion', () => {
  it('returns the stored PosterDoc', async () => {
    const doc = makeDoc({ widthIn: 24 });
    setResponses({ data: { data: doc }, error: null });
    const loaded = await loadVersion('v1');
    expect(loaded).toEqual(doc);
  });

  it('returns null when the version is missing / hidden by RLS', async () => {
    setResponses({ data: null, error: null });
    expect(await loadVersion('nope')).toBeNull();
  });

  it('throws on failure', async () => {
    setResponses({ data: null, error: { message: 'oops' } });
    await expect(loadVersion('v1')).rejects.toThrow(/Failed to load version: oops/);
  });
});
