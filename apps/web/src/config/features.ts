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
 *   - components/PosterCard.tsx: the per-card "Publish" hover action was
 *     DELETED rather than flag-gated. It was never gated in the first
 *     place, so it survived the deactivation as a dead end — it routed
 *     to /p/:id?publish=1, which PosterEditor ignores while this flag is
 *     false. Re-add it from git history if the gallery comes back.
 */
export const GALLERY_PUBLIC_ENABLED = false;

/**
 * SHARING_ENABLED — share links and comments were deactivated on
 * 2026-09-30 (owner decision: "it should just be editor, no sharing or
 * comments yet"; docs/fixes/23-new-poster-owner-only.md). Frozen, not
 * removed: pages/Share.tsx, poster/CommentsPanel.tsx, data/comments.ts,
 * data/posters.ts ensureShareLink, api/shell/share.ts and the database all
 * remain. What is switched off:
 *   - routes.tsx: /s/:slug redirects to /
 *   - vercel.json: /s/:slug is served the app shell (which redirects), not
 *     the share edge shell
 *   - poster/Sidebar.tsx: no comments tab, and the comments panel (its
 *     "Copy share link" was the only control that made a poster public) is
 *     not rendered even if something sets that tab
 *   - poster/FloatingFormatToolbar.tsx: no "Comment on selection" button
 *   - poster/PosterEditor.tsx: the comment requests (postr:comment-text,
 *     postr:comment-area) are ignored, so nothing opens comment mode
 * The database still lets an owner set is_public through the API; only the
 * app's controls are off.
 *
 * Before turning it back on, the database must stop letting anyone read a
 * shared poster without its link (fix 23's security review): shared reads
 * through slug-keyed security-definer functions, owner-only table reads for
 * posters, assets and comments, 128-bit slugs, comment updates that cannot
 * move a comment to another poster, pgTAP tests for all of it; the
 * comments panel must take real ownership instead of `isOwner={true}`
 * (Sidebar.tsx); and sharing needs a way to stop sharing and a consent step.
 * This list is a summary. The full list, with items left out here, is
 * docs/fixes/23-new-poster-owner-only.md, section 10 ("Before sharing is
 * turned back on").
 */
export const SHARING_ENABLED = false;
