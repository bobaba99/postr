/**
 * GuestConversionCard — turns the current ANONYMOUS session into a
 * permanent account IN PLACE, so the guest's posters carry over.
 *
 * Both paths go through lib/convertGuest (P0-4, H-6):
 *   Google → linkIdentity. NEVER signInWithOAuth here: that starts a new
 *            user and orphans the guest's work while this card promises
 *            linking.
 *   Email  → updateUser. The user stays anonymous until they click the
 *            confirmation link, so the card says "check your inbox" —
 *            never a false "Account created!". A pending address shows
 *            as "Confirmation pending" with a resend.
 *
 * Supabase errors are mapped to guidance; the raw text is never shown.
 */
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { convertGuestWithGoogle, convertGuestWithEmail } from '@/lib/convertGuest';
import { PasswordStrength, isPasswordValid } from '@/components/PasswordStrength';
import { Section } from './ProfileChrome';
import { btnPrimary } from './styles';

const GENERIC_ERROR = 'Something went wrong. Try again, or send feedback.';

const PENDING_COPY =
  'Check your inbox to confirm your email — your posters stay on this account.';

/**
 * Map a Supabase auth error to guidance the user can act on. Keyed on the
 * documented error codes; anything unknown falls back to the generic line
 * so raw server text never reaches the screen.
 */
export function conversionErrorMessage(err: { code?: string } | Error | null): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'identity_already_exists':
      return 'That Google account is already linked to another Postr account. Sign in with it from the sign-in page, or use a different Google account here.';
    case 'manual_linking_disabled':
      return 'Linking a Google account isn’t available right now. Use email to create your account, or try again later.';
    case 'email_exists':
    case 'user_already_exists':
      return 'That email already belongs to another Postr account. Sign in with it from the sign-in page, or use a different address here.';
    default:
      return GENERIC_ERROR;
  }
}

interface Props {
  user: User | null;
  /** Called after a conversion step succeeds so the page re-reads the user. */
  onConverted: () => void;
  onError: (message: string) => void;
}

export function GuestConversionCard({ user, onConverted, onError }: Props) {
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const pendingEmail = user?.new_email ?? null;
  const redirectTo = `${window.location.origin}/profile`;

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await convertGuestWithGoogle(redirectTo);
      if (error) onError(conversionErrorMessage(error));
      // On success the browser is redirected to Google; nothing to do here.
    } catch {
      onError(GENERIC_ERROR);
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setResendStatus(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'email_change', email: pendingEmail });
      setResendStatus(error ? GENERIC_ERROR : 'Confirmation email sent again.');
    } catch {
      setResendStatus(GENERIC_ERROR);
    }
  };

  return (
    <Section title="Create an Account">
      <p className="mb-4 text-[14pt] text-[#8b8f99] leading-relaxed">
        You're using a guest account. Sign up to preserve your posters across devices
        and prevent data loss if your browser clears storage. All your current work
        will be linked to your new account automatically.
      </p>

      {(pendingConfirmation || pendingEmail) && (
        <div
          role="status"
          className="mb-4 rounded-md border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-[13pt] text-[#fde68a]"
        >
          <div className="font-semibold text-[#fbbf24]">Confirmation pending</div>
          <p className="mt-1 leading-relaxed">
            {PENDING_COPY}
            {pendingEmail && (
              <>
                {' '}We sent the link to <span className="font-medium">{pendingEmail}</span>.
              </>
            )}
          </p>
          {pendingEmail && (
            <button
              type="button"
              onClick={handleResend}
              className="mt-2 cursor-pointer rounded-md border border-[#fbbf24]/40 bg-transparent px-3 py-1 text-[12pt] text-[#fde68a] hover:bg-[#fbbf24]/10"
            >
              Resend confirmation
            </button>
          )}
          {resendStatus && <p className="mt-1 text-[12pt] text-[#fde68a]/80">{resendStatus}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleBusy}
        className={`${btnPrimary} w-full flex items-center justify-center gap-3 mb-3`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#fff" fillOpacity="0.7" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#fff" fillOpacity="0.5" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#fff" fillOpacity="0.85" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign up with Google
      </button>
      <div className="flex items-center gap-3 my-3">
        <div className="h-px flex-1 bg-[#2a2a3a]" />
        <span className="text-[13px] text-[#8b8f99]">or use email</span>
        <div className="h-px flex-1 bg-[#2a2a3a]" />
      </div>
      <EmailSignUp
        redirectTo={redirectTo}
        onPending={() => {
          setPendingConfirmation(true);
          onConverted();
        }}
        onConverted={onConverted}
        onError={onError}
      />
    </Section>
  );
}

// ── EmailSignUp — inline email/password form for guest → account ───

function EmailSignUp({
  redirectTo,
  onPending,
  onConverted,
  onError,
}: {
  redirectTo: string;
  onPending: () => void;
  onConverted: () => void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const { pendingConfirmation, error } = await convertGuestWithEmail(
        email,
        password,
        redirectTo,
      );
      if (error) {
        onError(conversionErrorMessage(error));
        return;
      }
      if (pendingConfirmation) {
        onPending();
        return;
      }
      onConverted();
    } catch {
      onError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        aria-label="Email address"
        required
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Create password"
        aria-label="Create password"
        required
        minLength={8}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      <PasswordStrength password={password} />
      <button
        type="submit"
        disabled={loading || !email.trim() || !isPasswordValid(password)}
        className="w-full cursor-pointer rounded-lg border border-[#7c6aed] bg-transparent px-4 py-3 text-sm font-semibold text-[#7c6aed] hover:bg-[#5641b8] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating account…' : 'Create account with email'}
      </button>
    </form>
  );
}
