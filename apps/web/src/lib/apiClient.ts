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
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
    const message =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}
