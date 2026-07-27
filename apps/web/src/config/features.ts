/**
 * Product feature switches.
 *
 * GALLERY_PUBLIC_ENABLED — the public gallery was deactivated on
 * 2026-07-27 (product decision: frozen, not removed). The DB table,
 * data, and /admin/gallery all remain live. This flag hides every
 * publish/browse entry point in the UI. Flipping it back on is
 * necessary but not sufficient to reactivate — these also need
 * reverting:
 *   - routes.tsx: /gallery and /gallery/:entryId currently redirect to /
 *   - vercel.json: X-Robots-Tag noindex header blocks on /gallery(/*)
 *   - src/seo/routes.json + sitemap: /gallery entry was removed
 *   - api/shell/gallery.ts + api/sitemap-gallery.ts were deleted
 *     (recover from git history, commit 0f404da^)
 */
export const GALLERY_PUBLIC_ENABLED = false;
