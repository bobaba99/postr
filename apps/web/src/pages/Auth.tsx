/**
 * Auth page — sign up, sign in, or continue as guest.
 *
 * Three paths:
 *   1. Sign in with Google (OAuth)
 *   2. Sign up with email + password
 *   3. Continue as guest (anonymous Supabase session)
 *
 * After auth, redirects to /dashboard. Guest accounts can be
 * linked later from the Profile page — Supabase auto-merges
 * data when identities are linked.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PasswordStrength, isPasswordValid } from '@/components/PasswordStrength';

type Mode = 'signin' | 'signup';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If ?guest=1, auto-trigger guest login
  useEffect(() => {
    if (searchParams.get('guest') === '1') {
      handleGuest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  const handleGuest = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInAnonymously();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);

    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      // Supabase may require email confirmation — show message
      setError(null);
      setLoading(false);
      navigate('/dashboard', { replace: true });
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      navigate('/dashboard', { replace: true });
    }
  }, [email, password, mode, navigate]);

  const handleGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8 no-underline">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="12" fill="#7c6aed" />
            <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
            <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
            <circle cx="32" cy="32" r="5" fill="white" />
          </svg>
          <span className="text-2xl font-bold text-white">Postr</span>
        </Link>

        {/* Guest — most prominent, top of card */}
        <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 mb-4">
          <button
            onClick={handleGuest}
            disabled={loading}
            className="w-full rounded-lg bg-[#7c6aed] px-4 py-3.5 text-base font-semibold text-white hover:bg-[#6c5ce7] transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Start creating — no account needed'}
          </button>
          <p className="mt-3 text-[13px] text-[#6b7280] text-center leading-relaxed">
            Jump straight into the editor as a guest. Your work saves in this browser.
            Link an account anytime to sync across devices.
          </p>
        </div>

        {/* Sign in / Sign up card */}
        <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
          <h2 className="text-base font-bold text-[#e2e2e8] mb-1">
            {mode === 'signin' ? 'Or sign in' : 'Or create an account'}
          </h2>
          <p className="text-sm text-[#6b7280] mb-5">
            {mode === 'signin'
              ? 'Access your posters from any device.'
              : 'Save your work across devices.'}
          </p>

          {error && (
            <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[13px] text-[#f87171]">
              {error}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#2a2a3a]" />
            <span className="text-[13px] text-[#555]">or use email</span>
            <div className="h-px flex-1 bg-[#2a2a3a]" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#555]"
            />
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Create password' : 'Password'}
                required
                minLength={8}
                className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#555]"
              />
              {mode === 'signup' && <PasswordStrength password={password} />}
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password || (mode === 'signup' && !isPasswordValid(password))}
              className="w-full rounded-lg border border-[#7c6aed] bg-transparent px-4 py-3 text-sm font-semibold text-[#7c6aed] hover:bg-[#7c6aed] hover:text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center text-[13px] text-[#6b7280]">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => setMode('signup')} className="text-[#7c6aed] font-semibold bg-transparent border-none cursor-pointer">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('signin')} className="text-[#7c6aed] font-semibold bg-transparent border-none cursor-pointer">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
