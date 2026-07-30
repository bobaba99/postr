import { describe, expect, it, vi, beforeEach } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  linkIdentity: vi.fn(),
  updateUser: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { convertGuestWithGoogle, convertGuestWithEmail } from '../convertGuest';

describe('convertGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
    });
  });

  it('links Google identity in place for an anonymous user (never OAuth sign-in)', async () => {
    auth.linkIdentity.mockResolvedValue({ error: null });
    const res = await convertGuestWithGoogle('https://app/dashboard');
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app/dashboard' },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(res.error).toBeNull();
  });

  it('updates the user (never signUp) for email, reporting pending confirmation', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { is_anonymous: true } }, error: null });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'a@b.com', password: 'pw123456' },
      { emailRedirectTo: 'https://app/dashboard' },
    );
    expect(auth.signUp).not.toHaveBeenCalled();
    // Still anonymous after updateUser → email confirmation pending.
    expect(res.pendingConfirmation).toBe(true);
    expect(res.error).toBeNull();
  });

  it('reports NOT pending when the user is already permanent after update', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(res.pendingConfirmation).toBe(false);
  });

  it('surfaces a Supabase error as { error }', async () => {
    auth.linkIdentity.mockResolvedValue({ error: new Error('boom') });
    const res = await convertGuestWithGoogle('https://app/dashboard');
    expect(res.error).toBeInstanceOf(Error);
  });

  it('refuses to convert when the session is not anonymous (guards against orphaning)', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(res.error).toBeInstanceOf(Error);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
