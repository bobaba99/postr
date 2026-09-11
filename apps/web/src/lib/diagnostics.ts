/**
 * Client side of the UI diagnostics channel.
 *
 * Reports the small set of anomaly signals defined in `@postr/shared`
 * (types/diagnostics) to `POST /v1/diagnostics/ui`, so failures that
 * happen entirely in the browser — a save that never lands, an undo that
 * does nothing, text clipped out of a block — become visible in the API
 * log.
 *
 * Guarantees this module makes to its callers
 * ───────────────────────────────────────────
 * - **Never throws, never rejects.** `reportUiSignal` is fire-and-forget.
 *   A diagnostics outage must not surface as an editor error.
 * - **Never blocks.** Signals are queued and flushed on a timer, so a
 *   call site in a pointer handler costs an array push.
 * - **Coalesced.** Identical consecutive signals inside the flush window
 *   collapse to one. The server dedups again; this just avoids paying for
 *   the request. Between the two, a signal firing on every animation
 *   frame still yields roughly one log line per minute.
 * - **Silent when unconfigured.** With no API base URL or no session the
 *   queue is dropped, so local dev and tests stay quiet.
 *
 * It deliberately carries no poster content — only counts, pixels,
 * milliseconds and enums. See the shared types for the rationale.
 */
import type {
  DiagnosticEvent,
  DiagnosticSignal,
  DiagnosticSurface,
} from '@postr/shared';
import { DIAGNOSTIC_BATCH_MAX, diagnosticSignatureDetail } from '@postr/shared';
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

/**
 * Build identifier, so a signal can be tied to a release. Uses the same
 * `__BUILD_ID__` define the update toast already relies on, rather than a
 * separate env var that would have to be wired in every environment.
 */
const APP_VERSION = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : undefined;

/** How long signals accumulate before a batch is sent. */
const FLUSH_MS = 5_000;

/**
 * How long a signature stays suppressed client-side. Matches the server's
 * default dedup window: without this the queue-only check resets every
 * flush, so a condition that persists for an hour would post ~720 requests
 * the server then discards as duplicates.
 */
const SUPPRESS_MS = 60_000;

interface QueuedEvent {
  ev: DiagnosticEvent;
  /** Computed once — recomputing per report is O(queue) on a hot path. */
  sig: string;
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const lastSentAt = new Map<string, number>();

/**
 * Signature used to collapse identical signals. Uses the shared rule so
 * client and server cannot disagree about what "the same signal" means.
 */
function signatureOf(ev: DiagnosticEvent): string {
  const detail = diagnosticSignatureDetail(ev.signal);
  return `${ev.signal.kind}|${detail}|${ev.posterId ?? ''}`;
}

async function flush(): Promise<void> {
  const batch = queue;
  queue = [];
  timer = null;
  if (batch.length === 0 || !API_BASE) return;

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return; // no session — nothing to attribute the signal to

    await fetch(`${API_BASE}/v1/diagnostics/ui`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        events: batch.slice(0, DIAGNOSTIC_BATCH_MAX).map((q) => q.ev),
        appVersion: APP_VERSION,
      }),
      // The tab may be closing when a signal fires (e.g. an autosave
      // failure on unload). keepalive lets the request outlive the page.
      keepalive: true,
    });
  } catch {
    // Diagnostics are best-effort by definition. Swallowing here is the
    // whole point: reporting a problem must never create a second one.
  }
}

/**
 * Queue one anomaly signal.
 *
 * Call this where something has actually gone wrong — not on ordinary
 * actions. Normal editing should produce no traffic at all.
 */
export function reportUiSignal(
  signal: DiagnosticSignal,
  context: { surface?: DiagnosticSurface; posterId?: string } = {},
): void {
  try {
    const ev: DiagnosticEvent = {
      signal,
      surface: context.surface ?? 'poster-editor',
      at: Date.now(),
      posterId: context.posterId,
    };

    const sig = signatureOf(ev);
    const now = Date.now();

    // Suppressed across flushes, not just within one queue — a condition
    // that persists must not re-post every FLUSH_MS.
    const last = lastSentAt.get(sig);
    if (last !== undefined && now - last < SUPPRESS_MS) return;

    if (queue.some((q) => q.sig === sig)) return; // already queued
    if (queue.length >= DIAGNOSTIC_BATCH_MAX) return; // bound memory

    queue.push({ ev, sig });
    lastSentAt.set(sig, now);

    // Bound the suppression map: drop entries whose window has closed.
    if (lastSentAt.size > 64) {
      for (const [k, ts] of lastSentAt) {
        if (now - ts >= SUPPRESS_MS) lastSentAt.delete(k);
      }
    }

    if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
  } catch {
    // Never let instrumentation break a call site.
  }
}

/** Send anything queued immediately. Used on page hide. */
export function flushUiSignals(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void flush();
}

/** Test seam — drops queued signals without sending. */
export function __resetUiSignals(): void {
  queue = [];
  lastSentAt.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

// Signals queued when the tab is closing would otherwise die with it —
// `keepalive` on the request only helps if the request is actually made.
// `pagehide` covers bfcache and iOS, where `beforeunload` is unreliable.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushUiSignals);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUiSignals();
  });
}
