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

function makeFakeClient(initialSession: FakeSession | null) {
  const signInAnonymously = vi.fn(async () => {
    const session: FakeSession = {
      user: { id: 'anon-user-1' },
      access_token: 'anon-token',
    };
    return { data: { session, user: session.user }, error: null };
  });

  const getSession = vi.fn(async () => ({
    data: { session: initialSession },
    error: null,
  }));

  return {
    auth: {
      getSession,
      signInAnonymously,
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
      },
    };

    await expect(ensureSession(client as never)).rejects.toThrow(/auth disabled/);
  });
});
