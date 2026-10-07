/**
 * Vercel Web Analytics, entered where a visitor enters: a page load of the
 * whole app (App, its router and the real <Analytics> wiring).
 *
 * 1. Global Privacy Control (owner decision 2026-10-06, record 24): when
 *    the browser sends GPC, the analytics script is never added to the
 *    page, so nothing is sent to Vercel Web Analytics at all.
 * 2. Identifiers never reach it in the page address: a page load of an
 *    id-bearing route hands Vercel's script a `beforeSend` that reports
 *    the route's shape, not the id. The vendor script calls that function
 *    with `{ type, url }` before every beacon (MEASURED on the production
 *    script, v0.1.3, on www.postr.sh; record 24, section 4), so calling it
 *    the same way here measures what would leave the page.
 * 3. Nor in the beacon's Referer header: the vendor script's request is a
 *    same-origin POST, so the browser sends the page address as its
 *    Referer unless the page's Referrer-Policy cuts it to the origin.
 *    vercel.json sets that policy for every page; this pins it. What a
 *    browser sends under it is MEASURED by scripts/analytics-privacy-check.mjs
 *    (claim B1, Chromium and Firefox).
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => new Promise<never>(() => {})),
      getUser: vi.fn(() => new Promise<never>(() => {})),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import App from '../App';
// Imported, not read from disk, so a mutant of vercel.json reaches this test
// (scripts/mutation-check.mjs serves mutated files through Vite).
import vercelConfig from '../../vercel.json';

type VaWindow = Window & {
  va?: unknown;
  vaq?: Array<[string, unknown]>;
  vam?: unknown;
  vai?: unknown;
};

const ANALYTICS_SCRIPT = 'script[src*="vercel-scripts.com"], script[src*="/_vercel/insights"]';
const POSTER_ID = 'ec67e5ba-7c24-436e-a9e8-1731dd9e5d0c';

function setGpc(value: boolean | undefined) {
  if (value === undefined) {
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    return;
  }
  Object.defineProperty(navigator, 'globalPrivacyControl', { value, configurable: true });
}

function resetAnalytics() {
  document.head.querySelectorAll(ANALYTICS_SCRIPT).forEach((node) => node.remove());
  const w = window as VaWindow;
  delete w.va;
  delete w.vaq;
  delete w.vam;
  delete w.vai;
}

function loadAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

/** The beforeSend the app registered with Vercel's queue, if any. */
function registeredBeforeSend(): ((event: { type: string; url: string }) => { url: string } | null) | null {
  const entry = (window as VaWindow).vaq?.find(([command]) => command === 'beforeSend');
  return (entry?.[1] as never) ?? null;
}

beforeEach(() => {
  resetAnalytics();
  setGpc(undefined);
});

afterEach(() => {
  resetAnalytics();
  setGpc(undefined);
  window.history.replaceState(null, '', '/');
});

describe('Global Privacy Control', () => {
  it('adds the analytics script when the browser sends no GPC signal (control)', async () => {
    loadAt('/');
    await waitFor(() => expect(document.head.querySelectorAll(ANALYTICS_SCRIPT)).toHaveLength(1));
    expect(registeredBeforeSend()).not.toBeNull();
  });

  it('adds the analytics script when GPC is explicitly false', async () => {
    setGpc(false);
    loadAt('/');
    await waitFor(() => expect(document.head.querySelectorAll(ANALYTICS_SCRIPT)).toHaveLength(1));
  });

  it('never adds the analytics script, nor queues anything for it, when GPC is on', async () => {
    setGpc(true);
    const { findAllByText } = loadAt('/');
    // The page itself renders as usual.
    expect((await findAllByText(/academic posters/i)).length).toBeGreaterThan(0);
    // Give any effect a chance to run before reading the head.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.head.querySelectorAll(ANALYTICS_SCRIPT)).toHaveLength(0);
    expect((window as VaWindow).va).toBeUndefined();
    expect((window as VaWindow).vaq).toBeUndefined();
  });
});

describe('the page address Vercel Web Analytics is given', () => {
  it('a page load of a poster reports /p/[redacted], never the poster id', async () => {
    loadAt(`/p/${POSTER_ID}?from=email`);
    await waitFor(() => expect(registeredBeforeSend()).not.toBeNull());
    const sent = registeredBeforeSend()!({ type: 'pageview', url: window.location.href });
    expect(sent?.url).toBe(`${window.location.origin}/p/[redacted]`);
    expect(JSON.stringify(sent)).not.toContain(POSTER_ID);
    expect(JSON.stringify(sent)).not.toContain('from=email');
  });

  it('a page load of /P/<id> reports /p/[redacted]', async () => {
    // The router matches routes without regard to case, so this address
    // opens the editor (analytics/__tests__/redactUrl.test.ts checks that
    // with the router's matcher; record 24, review round 1).
    loadAt(`/P/${POSTER_ID}`);
    await waitFor(() => expect(registeredBeforeSend()).not.toBeNull());
    const sent = registeredBeforeSend()!({ type: 'pageview', url: window.location.href });
    expect(window.location.pathname).toBe(`/P/${POSTER_ID}`);
    expect(sent?.url).toBe(`${window.location.origin}/p/[redacted]`);
    expect(JSON.stringify(sent)).not.toContain(POSTER_ID);
  });

  it('a page load of a public page reports its path, without the query string', async () => {
    loadAt('/pricing?utm_source=zq-campaign');
    await waitFor(() => expect(registeredBeforeSend()).not.toBeNull());
    const sent = registeredBeforeSend()!({ type: 'pageview', url: window.location.href });
    expect(sent?.url).toBe(`${window.location.origin}/pricing`);
  });
});

describe('the page address in the beacon’s Referer header', () => {
  it('every page is served with a Referrer-Policy that sends only the origin', () => {
    const config = vercelConfig as {
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const site = config.headers?.find((rule) => rule.source === '/(.*)');
    const policy = site?.headers.find((header) => header.key.toLowerCase() === 'referrer-policy')?.value;
    // strict-origin-when-cross-origin (the value before record 24) sends the
    // full address, /p/<poster id> included, on a same-origin request.
    expect(policy).toBe('strict-origin');
  });
});
