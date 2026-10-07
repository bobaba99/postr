/**
 * Global Privacy Control (GPC): a browser signal that the person does not
 * want their data sold, shared or used beyond what they asked for. Postr
 * honours it by not loading Vercel Web Analytics at all on a page load
 * that sends it (owner decision 2026-10-06; docs/fixes/24-legal-canada-law25.md).
 *
 * Read from `navigator.globalPrivacyControl`, which browsers that send the
 * `Sec-GPC: 1` header also expose to scripts. Only `true` counts: a browser
 * without GPC support leaves it undefined, and `false` is an explicit no.
 * The signal is set in the browser's settings, so it does not change while
 * a page is open; it is read when the app renders.
 */
export function globalPrivacyControlOn(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl === true;
}
