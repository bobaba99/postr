import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  onAuthStateChange: vi.fn((_cb: (event: string) => void) => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));
const ensureSessionMock = vi.hoisted(() => vi.fn());
const resetEnsureSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.mock('@/lib/auth', () => ({
  ensureSession: ensureSessionMock,
  resetEnsureSession: resetEnsureSessionMock,
}));

import { EnsureSession } from '../EnsureSession';

describe('EnsureSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('renders children once a session is ensured', async () => {
    ensureSessionMock.mockResolvedValue({ user: { id: 'anon1', is_anonymous: true } });
    render(<EnsureSession><div>editor</div></EnsureSession>);
    expect(await screen.findByText('editor')).toBeInTheDocument();
    expect(ensureSessionMock).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state before the session resolves', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EnsureSession><div>editor</div></EnsureSession>);
    expect(screen.queryByText('editor')).toBeNull();
    expect(screen.getByText(/loading|preparing/i)).toBeInTheDocument();
  });

  it('shows a generic error (not raw text) if ensureSession throws', async () => {
    ensureSessionMock.mockRejectedValue(new Error('supabase exploded internals'));
    render(<EnsureSession><div>editor</div></EnsureSession>);
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.queryByText('editor')).toBeNull();
    expect(screen.queryByText(/exploded internals/)).toBeNull();
  });

  /**
   * Regression: ensureSession() caches its resolved promise in a
   * module-level in-flight slot and only clears it on failure. Without
   * resetting that cache first, a SIGNED_OUT re-ensure would just hand
   * back the stale (now signed-out) resolved value instead of truly
   * bootstrapping a fresh anonymous session — bouncing the guest
   * toward a dead end. This asserts the reset happens BEFORE the
   * re-ensure call, and that ensureSession runs again afterward.
   */
  it('resets the auth bootstrap cache before re-ensuring on SIGNED_OUT', async () => {
    let authStateCallback: ((event: string) => void) | undefined;
    auth.onAuthStateChange.mockImplementation((cb: (event: string) => void) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    ensureSessionMock.mockResolvedValue({ user: { id: 'anon1', is_anonymous: true } });

    render(<EnsureSession><div>editor</div></EnsureSession>);
    await screen.findByText('editor');

    expect(ensureSessionMock).toHaveBeenCalledTimes(1);
    expect(resetEnsureSessionMock).not.toHaveBeenCalled();

    const callOrder: string[] = [];
    resetEnsureSessionMock.mockImplementation(() => callOrder.push('reset'));
    ensureSessionMock.mockImplementation(async () => {
      callOrder.push('ensure');
      return { user: { id: 'anon2', is_anonymous: true } };
    });

    authStateCallback?.('SIGNED_OUT');

    await waitFor(() => expect(ensureSessionMock).toHaveBeenCalledTimes(2));
    expect(resetEnsureSessionMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['reset', 'ensure']);
  });
});
