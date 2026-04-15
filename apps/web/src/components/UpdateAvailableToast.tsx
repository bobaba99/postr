import { useEffect, useState } from 'react';

// Poll interval for `/version.json`. 60 s is a good balance between
// freshness and request volume — it's a ~60-byte static file served
// from Vercel's edge, so cost is negligible. The poll pauses while
// the tab is hidden to avoid burning cycles on background tabs.
const POLL_INTERVAL_MS = 60_000;

// Path to the version manifest written by the Vite plugin at build
// time. Served from the root of the Vercel deployment alongside
// `index.html`. Cache-busted via a query string so intermediate
// proxies never serve a stale copy.
const VERSION_URL = '/version.json';

interface VersionPayload {
  buildId: string;
}

/**
 * Toast that appears in the bottom-right corner whenever the
 * deployed `/version.json` advertises a build id different from
 * the one baked into the currently running bundle. Dismissing
 * the toast suppresses it for the rest of the session (state
 * held in memory only — a fresh tab re-evaluates).
 */
export function UpdateAvailableToast() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Resolve the bundle's build id once. Guarded in case the
    // `define` shim was ever stripped so the toast degrades
    // silently instead of looping on refresh prompts.
    const currentBuildId =
      typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null;
    if (!currentBuildId) return;

    let cancelled = false;

    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as VersionPayload;
        if (cancelled) return;
        if (body.buildId && body.buildId !== currentBuildId) {
          setHasUpdate(true);
        }
      } catch {
        // Network hiccups are expected — retry on the next tick.
      }
    };

    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);

    // Run an immediate check whenever the tab regains focus so a
    // user coming back from a long break sees the prompt without
    // waiting for the next poll tick.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!hasUpdate || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        maxWidth: 360,
        padding: '14px 16px',
        background: '#1c1a2e',
        border: '1px solid #7c6aed',
        borderRadius: 10,
        boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
        color: '#e2e2e8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>
        ✨ A new version of Postr is available
      </div>
      <div style={{ color: '#b3b5be', fontSize: 13 }}>
        Refresh to load the latest fixes and features. Your current
        work is safe — autosave has already written it to your account.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 14px',
            background: '#7c6aed',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Refresh now
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 14px',
            color: '#8a8a95',
            fontSize: 13,
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
