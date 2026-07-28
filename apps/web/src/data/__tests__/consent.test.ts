/**
 * Tests for the signup-consent module (research + marketing).
 *
 * Module-level Supabase stub (same shape as researchConsent.test.ts):
 * each query chain is recorded so we can assert the exact write, and
 * responses are queued to drive read/write paths. The stash helpers use a
 * fake sessionStorage.
 *
 * Pins the consent contract the review required: both default OFF,
 * writeConsent ONLY writes columns whose desired state differs from
 * what's stored (never disturbs a value already set, never overwrites a
 * returning user), a read failure reads as no consent, and the OAuth stash
 * round-trips without ever fabricating consent.
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

// Fake sessionStorage for the stash helpers.
const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import {
  getConsent,
  writeConsent,
  stashSignupConsent,
  readStashedSignupConsent,
  clearStashedSignupConsent,
  NO_CONSENT,
} from '../consent';

beforeEach(() => {
  traces = [];
  nextResponses = [];
  store.clear();
});

function updatePayload(): Record<string, unknown> | undefined {
  const t = traces.find((tr) => tr.ops.some((o) => o.method === 'update'));
  return t?.ops.find((o) => o.method === 'update')?.args[0] as
    | Record<string, unknown>
    | undefined;
}

describe('getConsent', () => {
  it('reads both columns; a set timestamp is true, null is false', async () => {
    nextResponses = [
      { data: { research_consent_at: '2026-07-28T00:00:00Z', marketing_consent_at: null }, error: null },
    ];
    expect(await getConsent('u1')).toEqual({ research: true, marketing: false });
  });

  it('returns no consent on a read failure', async () => {
    nextResponses = [{ data: null, error: { message: 'network' } }];
    expect(await getConsent('u1')).toEqual({ research: false, marketing: false });
  });
});

describe('writeConsent — only writes changed columns', () => {
  it('opts BOTH in from a clean slate → writes both timestamps', async () => {
    nextResponses = [
      { data: { research_consent_at: null, marketing_consent_at: null }, error: null }, // getConsent
      { data: null, error: null }, // update
    ];
    const ok = await writeConsent('u1', { research: true, marketing: true }, '2026-07-28T12:00:00.000Z');
    expect(ok).toBe(true);
    expect(updatePayload()).toEqual({
      research_consent_at: '2026-07-28T12:00:00.000Z',
      marketing_consent_at: '2026-07-28T12:00:00.000Z',
    });
  });

  it('only writes the column that CHANGED (research already on, turning marketing on)', async () => {
    nextResponses = [
      { data: { research_consent_at: '2026-01-01T00:00:00Z', marketing_consent_at: null }, error: null },
      { data: null, error: null },
    ];
    await writeConsent('u1', { research: true, marketing: true }, '2026-07-28T12:00:00.000Z');
    // research is unchanged → NOT in the patch (preserves its original timestamp)
    expect(updatePayload()).toEqual({ marketing_consent_at: '2026-07-28T12:00:00.000Z' });
  });

  it('does NOT write at all when nothing changed (returning user, same state)', async () => {
    nextResponses = [
      { data: { research_consent_at: '2026-01-01T00:00:00Z', marketing_consent_at: null }, error: null },
    ];
    const ok = await writeConsent('u1', { research: true, marketing: false });
    expect(ok).toBe(true);
    // no update query issued
    expect(traces.some((t) => t.ops.some((o) => o.method === 'update'))).toBe(false);
  });

  it('withdrawal writes null for the changed column', async () => {
    nextResponses = [
      { data: { research_consent_at: '2026-01-01T00:00:00Z', marketing_consent_at: null }, error: null },
      { data: null, error: null },
    ];
    await writeConsent('u1', { research: false, marketing: false });
    expect(updatePayload()).toEqual({ research_consent_at: null });
  });

  it('returns false when the write fails, so the caller can revert', async () => {
    nextResponses = [
      { data: { research_consent_at: null, marketing_consent_at: null }, error: null },
      { data: null, error: { message: 'rls denied' } },
    ];
    expect(await writeConsent('u1', { research: true, marketing: false })).toBe(false);
  });
});

describe('signup consent stash (OAuth round-trip)', () => {
  it('round-trips a choice', () => {
    stashSignupConsent({ research: true, marketing: false });
    expect(readStashedSignupConsent()).toEqual({ research: true, marketing: false });
  });

  it('an absent stash reads as NO consent (a lost stash never fabricates consent)', () => {
    expect(readStashedSignupConsent()).toEqual(NO_CONSENT);
  });

  it('clears the stash', () => {
    stashSignupConsent({ research: true, marketing: true });
    clearStashedSignupConsent();
    expect(readStashedSignupConsent()).toEqual(NO_CONSENT);
  });

  it('coerces malformed stored values to booleans', () => {
    store.set('postr.signupConsent', JSON.stringify({ research: 'yes', marketing: 1 }));
    // only strict true survives → both false
    expect(readStashedSignupConsent()).toEqual({ research: false, marketing: false });
  });
});
