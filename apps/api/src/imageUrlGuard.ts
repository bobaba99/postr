/**
 * SSRF guard for the import image fetch.
 *
 * /api/import/extract fetches imageUrl server-side and forwards the
 * bytes to the vision LLM, which would otherwise let any
 * authenticated user (anonymous sessions included) point the API at
 * cloud metadata endpoints, localhost, or private-range addresses
 * and read the response. The only legitimate sources are this
 * project's own Supabase Storage URLs, so everything else is
 * rejected before any fetch happens:
 *
 *   - https only — no plain http, no other schemes
 *   - hostname must exactly equal the host of SUPABASE_URL
 *     (no subdomains, no suffix tricks like ref.supabase.co.evil.com)
 *   - no userinfo, no non-default port
 *   - fails closed when SUPABASE_URL is missing or malformed
 *
 * The caller must also fetch with `redirect: 'error'` — an exact-host
 * match is worthless if the allowed host can 302 elsewhere.
 */

export type ImageUrlCheckFailure =
  | 'allowlist_not_configured'
  | 'invalid_url'
  | 'not_https'
  | 'host_not_allowed';

export type ImageUrlCheck =
  | { ok: true }
  | { ok: false; reason: ImageUrlCheckFailure };

export function checkImageUrl(
  imageUrl: string,
  supabaseUrl: string | undefined,
): ImageUrlCheck {
  if (!supabaseUrl) {
    return { ok: false, reason: 'allowlist_not_configured' };
  }

  let allowedHost: string;
  try {
    allowedHost = new URL(supabaseUrl).hostname;
  } catch {
    return { ok: false, reason: 'allowlist_not_configured' };
  }

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'not_https' };
  }
  if (
    url.hostname !== allowedHost ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return { ok: false, reason: 'host_not_allowed' };
  }

  return { ok: true };
}
