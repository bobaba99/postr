/**
 * EditorErrorBoundary — catches render errors inside the poster editor
 * route and shows a recovery UI instead of a blank screen.
 *
 * The editor is the riskiest surface in the app: rich DOM, dozens of
 * block types, drag math, auto-save, pointer capture. Any uncaught
 * exception in this tree would previously leave the user staring at
 * a white page with no explanation and no way out. This boundary:
 *
 *   1. Catches the error via React's class-component lifecycle
 *      (function components can't be error boundaries yet).
 *   2. Logs full details to the console for local debugging.
 *   3. Sends the error to Sentry if `window.__POSTR_SENTRY__` is
 *      set (defensive — Sentry may not be wired yet).
 *   4. Renders a friendly fallback with the error message, a
 *      "Back to dashboard" link, and a "Try again" button that
 *      resets the boundary state.
 *
 * Does NOT catch:
 *   - Async errors (event handlers, setTimeout, fetch rejections)
 *   - Server-side rendering errors (we're client-only)
 *   - Errors in the boundary itself
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error('[EditorErrorBoundary]', error, errorInfo);
    // Defensive Sentry hook — only fires if a global capture function
    // has been registered. Keeps the boundary portable while Sentry
    // is still being wired up.
    const sentry = (window as unknown as {
      __POSTR_SENTRY__?: {
        captureException: (err: unknown, ctx?: unknown) => void;
      };
    }).__POSTR_SENTRY__;
    sentry?.captureException(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error.message || 'Unknown error';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 32,
          background: '#0a0a12',
          color: '#e2e2e8',
          fontFamily:
            "'DM Sans', system-ui, -apple-system, sans-serif",
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 540 }}>
          <div
            style={{
              fontSize: 56,
              marginBottom: 12,
              lineHeight: 1,
            }}
            aria-hidden
          >
            ⚠️
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: '0 0 12px',
              letterSpacing: -0.3,
            }}
          >
            Something broke while rendering your poster
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: '#a0a0aa',
              margin: '0 0 24px',
            }}
          >
            Your work is safe — Postr auto-saves every few seconds,
            so nothing you typed before the error has been lost. The
            error details below help us track down what went wrong.
          </p>
          <pre
            style={{
              textAlign: 'left',
              fontSize: 12,
              fontFamily: 'ui-monospace, Menlo, monospace',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
              padding: 12,
              color: '#f38ba8',
              overflow: 'auto',
              maxHeight: 160,
              margin: '0 0 24px',
            }}
          >
            {msg}
          </pre>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={this.reset}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 24px',
                background: '#7c6aed',
                color: '#fff',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <Link
              to="/dashboard"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 24px',
                background: '#1a1a26',
                color: '#c8cad0',
                border: '1px solid #2a2a3a',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
