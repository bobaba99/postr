/**
 * SecureWorkModal — prompts an anonymous editor to secure their poster
 * to a permanent account. Same modal for two triggers; `reason` only
 * changes the copy. Conversion is in place (convertGuest*), never a
 * fresh signUp, so the poster carries over.
 */
import { useState } from 'react';
import { convertGuestWithGoogle, convertGuestWithEmail } from '@/lib/convertGuest';

interface Props {
  reason: 'export' | 'leave';
  onClose: () => void;
  onConverted?: () => void;
}

const COPY = {
  export: {
    title: 'Create an account to export',
    body: 'Your poster is saved to a guest session — create a free account to finish and keep it for good.',
    dismiss: 'Cancel',
  },
  leave: {
    title: 'Keep this poster',
    body: 'Create a free account so this poster is here next time you visit. Guest posters are removed after a while.',
    dismiss: 'Not now',
  },
} as const;

const GENERIC_ERROR = 'Something went wrong. Try again, or send feedback.';

export function SecureWorkModal({ reason, onClose, onConverted }: Props) {
  const copy = COPY[reason];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleGoogle() {
    setError(null);
    setPending(true);
    try {
      const redirectTo = `${window.location.origin}/dashboard`;
      const { error: err } = await convertGuestWithGoogle(redirectTo);
      if (err) {
        setError(GENERIC_ERROR);
        return;
      }
      // linkIdentity redirects the browser away; onConverted covers the
      // (rare) case the caller wants to react before that navigation lands.
      onConverted?.();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  async function handleEmailSubmit() {
    setError(null);
    setPending(true);
    try {
      const redirectTo = `${window.location.origin}/dashboard`;
      const { pendingConfirmation, error: err } = await convertGuestWithEmail(
        email,
        password,
        redirectTo,
      );
      if (err) {
        setError(GENERIC_ERROR);
        return;
      }
      if (pendingConfirmation) {
        setConfirmSent(true);
        return;
      }
      onConverted?.();
      onClose();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-postr-modal-backdrop
      data-state="open"
      onClick={onClose}
      style={overlayStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        data-postr-modal-content
        data-state="open"
        onClick={(e) => e.stopPropagation()}
        style={panelStyle}
      >
        <h3 style={titleStyle}>{copy.title}</h3>

        {confirmSent ? (
          <p style={bodyStyle}>
            Check your email to finish creating your account. Your poster is
            safe in the meantime.
          </p>
        ) : (
          <>
            <p style={bodyStyle}>{copy.body}</p>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={pending}
              style={googleButtonStyle}
            >
              Continue with Google
            </button>

            <div style={dividerRowStyle}>
              <span style={dividerLineStyle} />
              <span style={dividerLabelStyle}>or</span>
              <span style={dividerLineStyle} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleEmailSubmit();
              }}
            >
              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  autoComplete="email"
                />
              </label>
              <label style={labelStyle}>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                style={{
                  ...primaryButtonStyle,
                  opacity: pending ? 0.6 : 1,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                Create account
              </button>
            </form>

            {error && (
              <p role="alert" style={errorStyle}>
                {error}
              </p>
            )}
          </>
        )}

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={dismissButtonStyle}>
            {copy.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────
// Matches the app's existing dark-modal conventions (see ConfirmModal /
// ImportPosterModal): panel #111118, border #2a2a3a, accent #7c6aed,
// muted text #9ca3af / #c8cad0.

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  background: '#111118',
  border: '1px solid #2a2a3a',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
};

const titleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 16,
  fontWeight: 600,
  color: '#e2e2e8',
};

const bodyStyle: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#c8cad0',
};

const googleButtonStyle: React.CSSProperties = {
  width: '100%',
  cursor: 'pointer',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#e2e2e8',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  boxSizing: 'border-box',
  transition: 'background var(--dur-fast, 160ms) var(--ease-out, ease)',
};

const dividerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '16px 0',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: '#2a2a3a',
};

const dividerLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#9ca3af',
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  fontSize: 14,
  color: '#e2e2e8',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 0,
  padding: '10px 12px',
  fontSize: 13,
  color: '#fca5a5',
  background: 'rgba(220, 38, 38, 0.08)',
  border: '1px solid rgba(220, 38, 38, 0.4)',
  borderRadius: 6,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 20,
  paddingTop: 16,
  borderTop: '1px solid #2a2a3a',
};

const dismissButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: 'transparent',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};
