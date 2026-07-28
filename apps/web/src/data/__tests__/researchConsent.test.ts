/**
 * Tests for the research-consent repository.
 *
 * Same module-level Supabase stub as posterVersions.test.ts: each query
 * chain is recorded so we can assert the exact write, and responses are
 * queued to drive success/failure paths. No network, no local DB.
 *
 * Pins the consent contract: opt-in stamps a timestamp, opt-out writes
 * null, a read failure reads as NOT consented (a flaky read must never
 * look like consent), and every write is scoped to the given user id.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface QueryTrace {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
  resolved: { data: unknown; error: unknown } | null;
}

let traces: QueryTrace[] = [];
let nextResponses: Array<{ data: unknown; error: unknown }> = [];

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
  thenable.update = chain('update');
  thenable.maybeSingle = chain('maybeSingle');
  return thenable;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => makeQuery(table) },
}));

import { getResearchConsent, setResearchConsent } from '../researchConsent';

beforeEach(() => {
  traces = [];
  nextResponses = [];
});

/** The single recorded query (each test issues exactly one). */
function lastTrace(): QueryTrace {
  const t = traces[0];
  if (!t) throw new Error('no query was recorded');
  return t;
}

/** The args passed to a recorded op, e.g. the `.update({...})` payload. */
function opArgs(trace: QueryTrace, method: string): unknown[] {
  return trace.ops.find((o) => o.method === method)?.args ?? [];
}

describe('getResearchConsent', () => {
  it('returns true when a timestamp is stored', async () => {
    nextResponses = [{ data: { research_consent_at: '2026-07-28T00:00:00Z' }, error: null }];
    expect(await getResearchConsent('u1')).toBe(true);
  });

  it('returns false when the column is null (opted out / default)', async () => {
    nextResponses = [{ data: { research_consent_at: null }, error: null }];
    expect(await getResearchConsent('u1')).toBe(false);
  });

  it('returns false on a read failure — a flaky read is never consent', async () => {
    nextResponses = [{ data: null, error: { message: 'network' } }];
    expect(await getResearchConsent('u1')).toBe(false);
  });

  it('scopes the read to the given user id', async () => {
    nextResponses = [{ data: null, error: null }];
    await getResearchConsent('user-42');
    expect(opArgs(lastTrace(), 'eq')).toEqual(['id', 'user-42']);
    expect(lastTrace().table).toBe('users');
  });
});

describe('setResearchConsent', () => {
  it('opt-in writes the given ISO timestamp and returns true', async () => {
    nextResponses = [{ data: null, error: null }];
    const ok = await setResearchConsent('u1', true, '2026-07-28T12:00:00.000Z');
    expect(ok).toBe(true);
    expect(opArgs(lastTrace(), 'update')[0]).toEqual({
      research_consent_at: '2026-07-28T12:00:00.000Z',
    });
    expect(opArgs(lastTrace(), 'eq')).toEqual(['id', 'u1']);
  });

  it('opt-out writes null and returns true', async () => {
    nextResponses = [{ data: null, error: null }];
    const ok = await setResearchConsent('u1', false, '2026-07-28T12:00:00.000Z');
    expect(ok).toBe(true);
    expect(opArgs(lastTrace(), 'update')[0]).toEqual({ research_consent_at: null });
  });

  it('returns false when the write fails, so the caller can revert', async () => {
    nextResponses = [{ data: null, error: { message: 'rls denied' } }];
    expect(await setResearchConsent('u1', true, '2026-07-28T12:00:00.000Z')).toBe(false);
  });
});
