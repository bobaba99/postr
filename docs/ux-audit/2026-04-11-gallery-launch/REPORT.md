# UX Audit — Gallery Launch

**Date:** 2026-04-11
**Tooling:** chrome-devtools-mcp + Playwright (real input pipeline) + manual JS evaluation
**Personas exercised:** 11 (Tomás), 12 (Hannah), 13 (Gavin)
**Scope:** the post-feature wave that landed since `2026-04-10-prelaunch` —
feedback system, public gallery + publish flow, legal pages, admin
moderation, sticky footer + sitemap, account-page trim, "no auto-poster"
empty dashboard.

---

## Per-persona summary

| # | Persona | Result | Notes |
|---|---------|--------|-------|
| 11 | **Tomás** — anonymous gallery visitor | ⚠️ PARTIAL | Browse + filter + legal pages all work without auth. **Footer feedback button is broken for unauthenticated visitors** (Finding #1). |
| 12 | **Hannah** — recent grad publishing her defense poster | ⚠️ PARTIAL | Publish round-trip succeeds end-to-end (`/p/:id?publish=1` → consent → metadata → `/gallery/:id` → visible in grid → visible in Profile). But the **onboarding tour overlay blocks the consent modal** for first-time guests (Finding #2). Once tour is dismissed, capture is sharp. |
| 13 | **Gavin** — admin moderator | ⚠️ PARTIAL | Negative path verified (non-admins redirected, "Admin" link hidden). Positive path **SKIP** — would require signing in as the admin allowlist email, which isn't possible from automation. Manual verification still required. |
| Regression checklist (B1-S1 + layout + canvas) | ✅ PASS | All previously-fixed editor invariants hold. See "Regression" section below. |

---

## Findings

### 🔴 #1 — Anonymous visitors cannot send feedback

**Severity:** HIGH
**Where:** any public page footer → "Send feedback" button → modal → Send

**What happens:** A visitor lands on `/gallery` (or any public page) with no Postr account. The PublicFooter exposes a "Send feedback" button. The feedback modal opens, the visitor fills in title + body, clicks Send, and gets:

> "You need to be signed in to send feedback. Try refreshing the page."

Refreshing doesn't help. The Supabase anonymous-bootstrap (`signInAnonymously()`) only fires inside `AuthGuard`-protected routes (`/dashboard`, `/p/:id`, `/profile`), so visitors who land directly on `/gallery` never get a session.

**Why this matters:** The Tomás persona was specifically built to test the "no signup nag" promise. Right now, anonymous visitors are silently invited to send feedback and then blocked at the last moment with a confusing error. Worse: the error message ("Try refreshing the page") doesn't actually fix it.

**Suggested fix (smallest patch):** In `data/feedback.ts → submitFeedback`, if `getUser()` returns null, call `supabase.auth.signInAnonymously()` once and retry. Existing `feedbackStore` and modal don't change.

**Suggested fix (cleaner):** Bootstrap the anonymous session in `App.tsx` mount so EVERY page has a session. Matches the PRD philosophy of "anonymous-first, no friction" and removes the public/protected split for any feature that talks to RLS.

**Screenshot:** [01-finding1-anonymous-feedback-blocked.png](01-finding1-anonymous-feedback-blocked.png)

---

### 🔴 #2 — Onboarding tour overlay blocks the publish consent modal

**Severity:** BLOCKING for first-time guests
**Where:** dashboard PosterCard → Publish → editor opens with `?publish=1` → consent modal AND onboarding tour both render simultaneously

**What happens:** A fresh guest user opens the editor for the first time. The onboarding tour fires (because `localStorage` doesn't have a "tour completed" flag yet) and the publish consent modal also fires (because of `?publish=1`). The tour's transparent highlight overlay sits ON TOP of the modal at z-index that intercepts pointer events. Clicks to the modal's checkboxes silently get swallowed by the tour.

Playwright surfaces this as a real failure (`<div>Click any block to select it...</div> from <div>…</div> subtree intercepts pointer events`), not just a visual collision. The user IS clicking on the right pixels, but the wrong DOM element receives the event.

**Why this matters:** This is the worst possible time for a tour collision — the user just clicked a deliberate "Publish" button and is presented with a modal they cannot interact with. The only way out is to find the tour's "Skip tour" button on the left and dismiss it manually.

**Suggested fix:** When the publish flow opens (consent or metadata step), suppress / pause the onboarding tour. Either:

1. Add a `useEffect` in `OnboardingTour` that watches `usePublishFlowStore` and hides the tour when `step !== 'closed'`, OR
2. Add a higher z-index on the consent modal AND set `pointer-events: none` on the tour overlay while a publish modal is open.

(1) is cleaner — the tour shouldn't compete with deliberate user actions.

**Screenshot:** [02-finding2-tour-blocks-consent-modal.png](02-finding2-tour-blocks-consent-modal.png)

---

### 🔴 #3 — Guest sign-in auto-creates an Untitled Poster (FIXED in this audit)

**Severity:** MEDIUM — addressed during the audit
**Where:** `/auth → "Start creating — no account needed"` → `/dashboard` shows a stale empty Untitled Poster

**What happens:** The `handle_new_user()` Supabase trigger has been seeding every new `auth.users` row with a placeholder poster since `20260408000100_posters.sql`. The intent was to drop users into a live document with no "New project" dialog. In practice, the dashboard now has both a Welcome card AND a placeholder poster, which is visual clutter and user-confusing.

**Fix shipped during audit:** New migration [20260411010000_no_auto_poster.sql](../../../supabase/migrations/20260411010000_no_auto_poster.sql) restores `handle_new_user()` to inserting only the `public.users` row. Existing seeded posters from old guest sessions are intentionally left alone (users can delete from their own dashboard).

**Action required:** `supabase db push` to apply on remote.

---

### 🟡 #4 — html-to-image throws CORS errors on Google Fonts CSS

**Severity:** LOW (capture still works, but the console is noisy and the rasterized fonts are fallback)
**Where:** `PublishGalleryModal.captureCanvas` → `toCanvas()` → fails to read `cssRules` from cross-origin Google Fonts stylesheets

**What happens:** Each capture attempt produces 2 console errors:

```
SecurityError: Failed to read the 'cssRules' property from 'CSSStyleSheet':
Cannot access rules
  at parseWebFontRules (...html-to-image.js)
  at embedWebFonts (...html-to-image.js)
  at toSvg (...html-to-image.js)
```

The retry ladder runs at pixelRatio 3 → 2.5 → 2.0, so a publish that retries to step 2.5 produces 4 errors total. The capture STILL succeeds — it just falls through to `toSvg()` without embedded font CSS. **In practice the visible quality is fine** — see the Hannah test screenshot below — because the host-page fonts are already rendered into the canvas before SVG-ization. But the errors clutter the console and the embedded SVG won't carry the font references, which means anyone who inspects the JPEG with a font-aware tool (rare) won't see the curated fonts.

**Suggested fix:** In `captureAt()`, pass `skipFonts: true` to `html-to-image.toCanvas` if the option exists, OR catch and silence the parseWebFontRules errors. The simpler fix is `cacheBust: true` (already set) plus `skipFonts: true`. Test that the visible output is still sharp afterward.

**Screenshot of finished capture (looks fine despite errors):** [04-hannah-publish-roundtrip-success.png](04-hannah-publish-roundtrip-success.png)

---

### 🟡 #5 — RETRACTED — false positive

The Playwright text snapshot doesn't always reflect `<input value>` state. I initially flagged the publish metadata title as "not pre-filling", but the actual DOM and screenshot both show `Untitled Poster` correctly populated. No bug.

---

### 🟡 #6 — Footer tagline duplication

**Severity:** COSMETIC
**Where:** every page footer

The brand block reads "Built by researchers. Built for researchers." and the bottom copyright strip reads "Built for researchers." Same line, twice, ~200 px apart. Pick one — I'd drop the bottom-strip version since the brand block is the authoritative place.

---

## Regression checklist — ALL PASS

Run via `evaluate_script` against the editor on `f54dae25-...`:

| Check | Result |
|---|---|
| B1 — title/authors overlap | ✓ no overlap, 2px gap |
| B2 — references block height | ✓ 75.3px (auto-grew from 0) |
| B3/B4 — clipped canvas buttons | ✓ 0 clipped |
| S1 — table cells contentEditable | ✓ 12 contentEditable, 0 inputs |
| K1 — presets in localStorage | ✓ key exists |
| Layout — left sidebar overlap | ✓ no |
| Layout — right guidelines overlap | ✓ no |
| Canvas exists | ✓ `#poster-canvas` + `[data-postr-canvas-frame]` present |

The previously fixed bugs (per `2026-04-09-v2/REPORT.md` and the prelaunch round) all hold.

---

## Test artifacts

| File | What |
|---|---|
| [01-finding1-anonymous-feedback-blocked.png](01-finding1-anonymous-feedback-blocked.png) | Anonymous visitor sees "You need to be signed in" after filling the feedback modal from /gallery |
| [02-finding2-tour-blocks-consent-modal.png](02-finding2-tour-blocks-consent-modal.png) | Onboarding tour overlay sitting on top of publish consent modal, intercepting clicks |
| [03-finding5-empty-title-prefill.png](03-finding5-empty-title-prefill.png) | False positive — title IS pre-filled, snapshot misled me |
| [04-hannah-publish-roundtrip-success.png](04-hannah-publish-roundtrip-success.png) | Successful gallery entry detail page after end-to-end publish |

---

## Concrete next actions

**Code fixes (in priority order):**

1. **#1** Anonymous feedback — bootstrap anonymous session in `App.tsx` OR retry-with-bootstrap inside `submitFeedback`. ~10 lines.
2. **#2** Tour vs publish modal collision — make `OnboardingTour` listen to `usePublishFlowStore` and hide while a publish step is active. ~15 lines.
3. **#4** html-to-image CORS warnings — pass `skipFonts: true` (or equivalent) and verify visual quality unchanged. ~3 lines.
4. **#6** Footer tagline dedup — drop the bottom-strip "Built for researchers." line. 1 line.

**Database push required:**

- `20260411010000_no_auto_poster.sql` (FIX #3 — already committed at `9269e8b`, needs `supabase db push`)

**Manual verification still owed:**

- **Gavin positive path:** sign in as `gavingengzihao@gmail.com`, navigate to `/admin/gallery`, verify the Hannah test entry is visible, retract it with a reason ("Test data from 2026-04-11 audit — auto-cleanup"), unretract, then either retract again or hard-delete via the owner Profile page.

**Personas to add (none right now):**

- The 13 existing personas cover the current feature surface. Will revisit once gallery filters or saved-collections (PRD items 13/14) ship.

---

## Test cleanup

A real gallery entry exists in remote Supabase from this audit:

- **Title:** "Hannah test — UX audit publish round-trip"
- **ID:** `07604c78-9e86-4a14-8710-1c9b2b776865`
- **URL:** `/gallery/07604c78-9e86-4a14-8710-1c9b2b776865`

Either retract it via the admin moderation flow (which doubles as Gavin's positive-path manual test), or delete the row from `gallery_entries` in Supabase Studio + remove the storage file from the `gallery` bucket.
