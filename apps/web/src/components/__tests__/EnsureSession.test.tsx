import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
const ensureSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.mock('@/lib/auth', () => ({ ensureSession: ensureSessionMock }));

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
});
