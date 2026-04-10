/**
 * Tests for the anonymous-first auth bootstrap.
 *
 * ensureSession() must:
 *   1. Reuse an existing session when one is present.
 *   2. Call signInAnonymously() exactly once when no session exists.
 *   3. Surface errors from the underlying client (no swallowing).
 *   4. Be safe to call concurrently — only one signInAnonymously call
 *      per cold start (deduped through an in-flight promise).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSession, __resetAuthBootstrapForTests } from '../auth';

type FakeSession = { user: { id: string }; access_token: string };

interface FakeClientOptions {
  /** Make getUser() return this error (triggers the stale-JWT recovery). */
  getUserError?: { message: string } | null;
}

function makeFakeClient(initialSession: FakeSession | null, opts: FakeClientOptions = {}) {
  // Mutable so tests that exercise re-bootstrapping can see the
  // signOut → signInAnonymously flip to a fresh session.
  let currentSession: FakeSession | null = initialSession;
  let getUserCallCount = 0;

  const signInAnonymously = vi.fn(async () => {
    const session: FakeSession = {
      user: { id: 'anon-user-1' },
      access_token: 'anon-token',
    };
    currentSession = session;
    return { data: { session, user: session.user }, error: null };
  });

  const getSession = vi.fn(async () => ({
    data: { session: currentSession },
    error: null,
  }));

  const getUser = vi.fn(async () => {
    getUserCallCount += 1;
    // First call fails with the stale JWT error if the test asked
    // for it; subsequent calls (after re-bootstrap) return the
    // live session's user.
    if (opts.getUserError && getUserCallCount === 1) {
      return { data: { user: null }, error: opts.getUserError };
    }
    return {
      data: { user: currentSession ? currentSession.user : null },
      error: null,
    };
  });

  const signOut = vi.fn(async () => {
    currentSession = null;
    return { error: null };
  });

  return {
    auth: {
      getSession,
      signInAnonymously,
      getUser,
      signOut,
    },
  };
}

beforeEach(() => {
  __resetAuthBootstrapForTests();
});

describe('ensureSession', () => {
  it('reuses an existing session and does not sign in anonymously', async () => {
    const existing: FakeSession = {
      user: { id: 'existing-user' },
      access_token: 'existing-token',
    };
    const client = makeFakeClient(existing);

    const session = await ensureSession(client as never);

    expect(session?.user.id).toBe('existing-user');
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no session exists', async () => {
    const client = makeFakeClient(null);

    const session = await ensureSession(client as never);

    expect(session?.user.id).toBe('anon-user-1');
    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent calls into a single signInAnonymously', async () => {
    const client = makeFakeClient(null);

    const [a, b, c] = await Promise.all([
      ensureSession(client as never),
      ensureSession(client as never),
      ensureSession(client as never),
    ]);

    expect(a?.user.id).toBe('anon-user-1');
    expect(b?.user.id).toBe('anon-user-1');
    expect(c?.user.id).toBe('anon-user-1');
    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('throws when getSession returns an error', async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'network down' },
        })),
        signInAnonymously: vi.fn(),
      },
    };

    await expect(ensureSession(client as never)).rejects.toThrow(/network down/);
  });

  it('throws when signInAnonymously returns an error', async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signInAnonymously: vi.fn(async () => ({
          data: { session: null, user: null },
          error: { message: 'auth disabled' },
        })),
        getUser: vi.fn(),
        signOut: vi.fn(),
      },
    };

    await expect(ensureSession(client as never)).rejects.toThrow(/auth disabled/);
  });

  // Regression: after `supabase db reset`, the browser still holds
  // a JWT for a user that no longer exists. getUser() will reject
  // with "User from sub claim in JWT does not exist". Rather than
  // bubble that up to the Editor as an error page, the bootstrap
  // wipes the stale session and signs in a fresh anonymous user.
  it('self-heals a stale JWT by wiping + re-bootstrapping', async () => {
    const stale: FakeSession = { user: { id: 'ghost' }, access_token: 'stale-token' };
    const client = makeFakeClient(stale, {
      getUserError: { message: 'User from sub claim in JWT does not exist' },
    });

    const session = await ensureSession(client as never);

    expect(session?.user.id).toBe('anon-user-1');
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('throws when session validation returns a non-JWT error', async () => {
    const existing: FakeSession = { user: { id: 'u' }, access_token: 't' };
    const client = makeFakeClient(existing, {
      getUserError: { message: 'network down' },
    });

    await expect(ensureSession(client as never)).rejects.toThrow(/network down/);
  });
});
