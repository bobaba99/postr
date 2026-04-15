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
 * Polls `/version.json` and tracks whether the live deploy has a
 * different build id than the one baked into this bundle. Returns
 * a `{ hasUpdate, dismiss }` pair so consumers can decide where to
 * surface the signal (sidebar banner, issues panel, toast, etc.).
 * Dismissing hides the signal for the rest of the session only.
 */
export function useUpdateAvailable(): {
  hasUpdate: boolean;
  dismiss: () => void;
} {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
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

    // Immediate check on tab visibility change so a user coming
    // back from a long break sees the banner without waiting.
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

  return {
    hasUpdate: hasUpdate && !dismissed,
    dismiss: () => setDismissed(true),
  };
}

/**
 * Inline banner rendered at the top of the editor sidebar when a
 * new deploy is live. Matches the visual language of the in-app
 * Issues panel (bordered card, severity-colored accents) rather
 * than a floating OS-level toast, so the prompt feels like part
 * of the editor rather than a browser notification.
 */
export function UpdateAvailableBanner() {
  const { hasUpdate, dismiss } = useUpdateAvailable();
  if (!hasUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: '12px 16px 0',
        padding: '12px 14px',
        background: '#1c1a2e',
        border: '1px solid #7c6aed',
        borderRadius: 10,
        color: '#e2e2e8',
        fontSize: 13,
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
          color: '#c8b6ff',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        ✨ New version available
      </div>
      <div style={{ color: '#b3b5be' }}>
        Refresh to load the latest fixes. Your work is already saved —
        autosave has written it to your account.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '6px 12px',
            background: '#7c6aed',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          Refresh now
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '6px 12px',
            color: '#8a8a95',
            fontSize: 12,
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
