/**
 * Typed wrapper around the Render Express API.
 *
 * Currently a stub — the only consumers are Tier 1 features
 * (`/api/import/extract`, future `/api/scan`). Centralizing the base
 * URL + auth-header dance here keeps that work small once it lands.
 */
import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    /** Seconds to wait before retrying — populated from the
     *  `Retry-After` header on 429 / 503 responses. Undefined when
     *  the server didn't send the header. */
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Convert a `Retry-After` seconds value into a human-readable
 *  duration: "37 seconds", "2 minutes", "3 hours", "tomorrow".
 *  Each unit rolls over cleanly — 60 seconds becomes "1 minute"
 *  (not "60 seconds"), 60 minutes becomes "1 hour". */
export function formatRetryAfter(sec: number): string {
  if (!Number.isFinite(sec) || sec < 1) return 'a moment';
  const s = Math.ceil(sec);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.ceil(sec / 3600);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  return 'tomorrow';
}

interface ApiOptions {
  signal?: AbortSignal;
  /** When true, attaches the current Supabase JWT as Bearer auth. */
  auth?: boolean;
}

/** Low-level POST. Throws `ApiError` on non-2xx. */
export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  options: ApiOptions = {},
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(
      'API base URL not configured (VITE_API_BASE_URL is empty).',
      0,
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response — leave payload null.
  }

  if (!res.ok) {
    // Build the ApiError message from whatever the server gave us.
    // The full body (including `message`) is preserved on
    // `ApiError.body` so callers can pull richer context for bug
    // reports — but the surfaced `message` defaults to the
    // machine-readable code so end-users see something stable
    // ("vision_call_failed") rather than verbose Anthropic stack
    // traces. Import flows wrap this with a generic "Something
    // went wrong" + Send Feedback panel anyway.
    const errBody = payload as
      | { error?: string; message?: string }
      | null;
    const message =
      errBody?.error ??
      errBody?.message ??
      `Request failed (${res.status})`;
    const retryAfterRaw = res.headers.get('Retry-After');
    // Retry-After can be either an integer-seconds value or an
    // HTTP-date. We only emit integer seconds server-side, so parse
    // that path; ignore the date form (rare) to keep this simple.
    const retryAfterSec =
      retryAfterRaw && /^\d+$/.test(retryAfterRaw)
        ? parseInt(retryAfterRaw, 10)
        : undefined;
    throw new ApiError(message, res.status, payload, retryAfterSec);
  }

  return payload as T;
}
