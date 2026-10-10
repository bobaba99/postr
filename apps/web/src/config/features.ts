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
 *   - components/PublishGalleryModal.tsx: its capture draws #poster-canvas
 *     itself, so the editor's hints and selection would reach the image;
 *     capture through export/stripEditorChrome.ts's copy, as
 *     data/thumbnails.ts does (record 31's review round 1, R1-I1).
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

/**
 * RULERS_ENABLED — the workspace rulers were hidden on 2026-09-30 (owner
 * decision: "hide this entirely and we can work on it later"). On main
 * their marks were off the sheet by up to 30 in (docs/stress-test/PLAN.md,
 * item 4). The fix in progress is parked on the local branch
 * editor/rulers-match-sheet: its record (docs/fixes/04-rulers-match-sheet.md
 * there), its instruments (ruler-check.mjs, ruler-sync-check.mjs,
 * ruler-paint-check.mjs) and the open review findings. What is switched off:
 *   - poster/PosterEditor.tsx: the rulers are not drawn
 *   - poster/Sidebar.tsx: no "Show ruler" toggle in the layout tab
 * The ruler code and its toggle's state remain.
 */
export const RULERS_ENABLED = false;

/**
 * LATEX_EXPORT_ENABLED — the LaTeX export was hidden on 2026-10-06 (owner
 * decision: "unnecessary for now"; docs/fixes/25-latex-hidden-prices.md).
 * Frozen, not removed: export/latex/ (the writer, its escaping, the .bib)
 * and its tests remain. What is switched off:
 *   - poster/sidebar/EditableExportButtons.tsx: no "LaTeX source (.zip)"
 *     button, no hint under it, no size note pointing to it, and the
 *     handler runs nothing (the writer is imported only inside the switch)
 * Every other mention of LaTeX was taken out of the copy (the public
 * pages, pricing, the paywall, the profile, the sign-in banner, the
 * crawler copy, index.html); src/__tests__/copyInventory.test.ts fails if
 * one comes back while this is false. Turning it back on is a checklist,
 * not a flip: docs/stress-test/PLAN.md, "LaTeX export: before it is
 * switched back on".
 */
export const LATEX_EXPORT_ENABLED = false;
