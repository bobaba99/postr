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

/**
 * IMPORT_ENABLED — importing a poster and the .postr backup were hidden on
 * 2026-10-07 (owner decision D3 on docs/launch/mvp-editor/bounded-designs.md
 * §6: "hide both"; record docs/fixes/29-mvp-simplify.md). Import is not on
 * the blank-to-export path, and a backup that cannot be imported is a dead
 * end. Frozen, not removed: import/ (the readers, importPostr, exportPostr),
 * components/ImportPosterModal.tsx, ImportConfirmReplaceModal.tsx,
 * poster/sidebar/ImportSection.tsx, ImportTile.tsx and PostrExportButton.tsx
 * remain, and importPostr itself still runs: the welcome poster is built
 * through it (data/seedWelcomePoster.ts). What is switched off (the UI only):
 *   - poster/Sidebar.tsx: no Import tile in the layout tab; no "Backup file"
 *     section (Save as .postr) in the export tab
 *   - components/NewPosterButton.tsx: the dashboard offers "+ New poster"
 *     alone: no "Import…" button and no menu (its two items were New poster
 *     and Import)
 *   - pages/Home.tsx: the welcome card does not offer an import
 *   - components/OnboardingTour.tsx: no Import step; the export step names
 *     no .postr file
 *   - components/PosterClosedPage.tsx: "Download a copy" stays (it is the
 *     closed poster's way out), without "you can import it into any account"
 *   - i18n/about.ts: no "Start from the poster you already have" card
 * No hidden control holds a value: nothing is imported while it is off.
 * Rewritten outright (no switch can guard JSON or a dictionary line):
 * i18n/landing.ts exportsBody ("Import and edit a PowerPoint…"), and
 * routes.json's pricing copy ("such as import and Copy a design").
 * src/__tests__/copyInventory.test.ts fails if copy naming import comes
 * back while this is false.
 * Turning it back on: flip this; bring back the rewritten copy; the
 * findings it retired come back (OF-15, U-2: a replace-import re-arranges
 * the poster and wipes undo). src/poster/__tests__/mvpShown.test.tsx turns
 * it on to check the controls still render.
 */
export const IMPORT_ENABLED = false;

/**
 * ADJUSTMENTS_ENABLED — the editor's per-element adjustments were hidden on
 * 2026-10-07 (owner decision D4 on docs/launch/mvp-editor/bounded-designs.md
 * §6: the hide list approved as a whole; §5.2's switch table; record
 * docs/fixes/29-mvp-simplify.md). One poster style, set in bulk, instead of
 * per-block styling. Frozen, not removed: the controls' code and the data
 * fields remain. What is switched off:
 *   - poster/blocks.tsx and selectionLayout.ts: no rotate control, no crop
 *     button (so no crop overlay; its slot in an image's or logo's handle
 *     row stays, empty and inert, so the row keeps the width record 19
 *     measured its overview threshold with); on a table, no row or column strips, no
 *     column-border drag, no hover "+" to add a row or column, and no
 *     right-click menu (the browser's own menu shows)
 *   - poster/Sidebar.tsx: no "Show grid" (and so no Canvas overlays section
 *     while the rulers are hidden too); style tab: no Copy a design, no
 *     custom palettes (create, edit, delete, "Your palettes"), no style
 *     presets, no heading style, and only the size of each text level
 *     (no weight, italic or line height); edit tab: for a title, heading or
 *     text block one line naming its level and size instead of the font
 *     controls and the second text box; for an image or logo no "Stretch to
 *     fit block" and no crop hint; for a caption no position buttons
 *     ("Show caption" instead), no spacing slider and no "✨ Format"
 *     button; for a table no border mockup and no border styles; the table
 *     tips name no hidden control; references tab: no citation style menu
 *   - poster/FloatingFormatToolbar.tsx: no strikethrough, indent, outdent,
 *     highlight or text colour (B, I, U, bullets, numbered and Clear stay)
 *   - poster/ReadabilityPanel.tsx: no "🔎 Scan image" in the Figure tab
 *     ("Check a figure" stays: owner, 2026-10-07)
 *   - poster/PosterEditor.tsx: the palette designer is not mounted
 *   - pages/Profile.tsx: no style presets row (nor its dialog)
 *   - components/OnboardingTour.tsx: the references step names no style
 *   - i18n/about.ts: no "Borrow a look you like" card (Copy a design)
 * The value each hidden control stays at: the grid is off (it started on);
 * a caption's position is the stored value, else top; a new table is APA
 * 3-line; the citation style is APA 7 (component state, never stored);
 * headings keep the poster's stored style (new posters: a bottom border,
 * left). Stored rotation, crop, stretch, borders, colours, weights, line
 * heights and heading styles still draw: hiding a control never changes
 * stored data.
 * Rewritten outright: the citation styles on the landing page and in
 * routes.json ("the BibTeX reference formatting"; the about copy now says
 * APA 7), "or build your own" palettes and "citation-style support" on the
 * about page, the profile page's description in routes.json.
 * src/__tests__/copyInventory.test.ts fails if copy naming a hidden
 * adjustment comes back while this is false.
 * Turning it back on: flip this; bring back the rewritten copy; the
 * findings it retired come back (bounded-designs.md §5.3: OF-02, OF-12,
 * OF-13, OF-24, U-9, C-2 to C-4, C-6, C-10, the caption "Bottom" mismatch,
 * the citation style lost on reload) and need their fixes.
 * src/poster/__tests__/mvpShown.test.tsx turns it on to check the controls
 * still render.
 */
export const ADJUSTMENTS_ENABLED = false;

/**
 * EDITOR_EXTRAS_ENABLED — three editor extras were hidden on 2026-10-07
 * (owner decision D4 on docs/launch/mvp-editor/bounded-designs.md §6;
 * record docs/fixes/29-mvp-simplify.md): reference reading and print-shop
 * help outside the blank-to-export path, and a second way to copy a poster.
 * Frozen, not removed: poster/GuidelinesPanel.tsx, components/
 * StaplesPrintModal.tsx and the editor's duplicate flow remain. What is
 * switched off:
 *   - poster/PosterEditor.tsx: no guidelines panel and no button that opens
 *     it
 *   - poster/Sidebar.tsx: no Duplicate beside "Back to My Posters" (the
 *     dashboard's Duplicate stays, pages/Home.tsx); no "Print at Staples"
 *     section in the export tab, and the layout tab's export hint does not
 *     name Staples
 *   - pages/Profile.tsx: no checklist templates row (they come from the
 *     guidelines panel's scratch pad)
 *   - components/OnboardingTour.tsx: no guidelines step; the export step
 *     names no Staples
 * No hidden control holds a value.
 * Rewritten outright: "the conference size lookups", the word targets and
 * the checklist on the landing and about pages and in routes.json (the
 * guidelines panel's). The privacy policy still says what the Staples
 * helper does "if you use" it (legal pages are outside the copy
 * inventory; docs/launch/owner-followups.md).
 * src/__tests__/copyInventory.test.ts fails if copy naming a hidden extra
 * comes back while this is false.
 * Turning it back on: flip this; bring back the rewritten copy; the
 * findings it retired come back (C-11, C-13 for the panel; OF-03 and OF-04
 * for the editor's Duplicate, whose cause R1 is still in the code: the
 * editor stays open while the poster changes).
 * src/poster/__tests__/mvpShown.test.tsx turns it on to check the controls
 * still render.
 */
export const EDITOR_EXTRAS_ENABLED = false;
