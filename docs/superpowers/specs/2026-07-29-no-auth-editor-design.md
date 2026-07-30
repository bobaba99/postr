# No-auth editor — edit immediately, secure your work on export or leave

**Date:** 2026-07-29
**Status:** Design — approved section-by-section, pending written-spec review
**Worktree:** `.claude/worktrees/no-auth-editor` (branch `worktree-no-auth-editor`, off `origin/main` @ a40ef41)

## Goal

A logged-out visitor clicks **Editor** and lands directly on an editable poster canvas — no signup, no visible "guest" step. Their work autosaves from keystroke one. Only when they try to **export** or **leave** are they prompted to create a permanent account (which carries the poster over). Once they have any real account, the nav flips to "My posters" and the prompts stop.

## Locked decisions (from brainstorming)

1. **Same editor for both auth states.** One `PosterEditor`. The no-auth and logged-in editors are the same component and the same persistence — not a fork. Only the *entry* and the *save-prompts* differ, and those live at the edges, not inside the editor.
2. **Silent anonymous session, not localStorage.** Clicking Editor silently calls `ensureSession()` → a real but account-less Supabase (anonymous) session. The poster autosaves to Supabase immediately; images, sharing, thumbnails, and autosave all work unchanged. This is what makes decision #1 free — the editor already runs on an anonymous session today (the existing "guest" flow); this feature just removes the visible detour to it.
3. **Prompts fire on export AND on leave** (tab-close/navigate-away), framed as "secure your work to a real account," not "save or lose it" (the work is already saved to the anonymous session).
4. **Entry is direct to the editor**, session ensured behind it — no `/auth` detour, no `AuthGuard` on that path.
5. **Conversion is in place** (`updateUser` / `linkIdentity`), never `signUp` (which creates a new user and orphans the guest's poster). See `project_guest_to_permanent_conversion`.

## Why this is small

The editor is already built to run on an anonymous session. Today that's gated behind a visible `/auth?guest=1` detour + `AuthGuard`. Removing the detour is the feature. `PosterEditor`, `useAutosave`, `data/posters.ts`, image upload, sharing, and thumbnails are **untouched**. What changes lives entirely at the edges.

## Architecture

```
Nav "Editor" (logged out) ──▶ /p/new
                                 │
                    ┌────────────▼─────────────┐
                    │ EnsureSession wrapper     │  (replaces AuthGuard on /p/:posterId)
                    │  ensureSession(supabase)  │  logged-out → anon session; logged-in → no-op
                    └────────────┬─────────────┘
                                 ▼
                    Editor.tsx (UNCHANGED)  loadOrCreateMostRecentPoster → setPoster → <PosterEditor/>
                                 ▼
                    PosterEditor (UNCHANGED) ── autosave → Supabase (anon session)

  Secure-work prompts (anonymous + dirty only):
    • export click  ─▶ SecureWorkModal(reason:'export')  ─▶ convertGuest()
    • leave         ─▶ beforeunload (native dialog) + in-app-nav intercept ─▶ SecureWorkModal(reason:'leave')
```

### Units

1. **`EnsureSession` route wrapper** — `apps/web/src/components/EnsureSession.tsx` (new).
   Wraps `/p/:posterId` in place of `AuthGuard`. On mount, `await ensureSession(supabase)`; render a brief loading state until it resolves, then render children. Logged-out → creates an anonymous session; logged-in → returns the existing session (no-op). Subscribes to `onAuthStateChange`: on `SIGNED_OUT`, **re-ensure a fresh anonymous session** (do NOT bounce to `/auth` — the editor must never dead-end). `AuthGuard` stays unchanged on `/dashboard`, `/profile`, `/admin/gallery` — those require a real account and still bounce.

2. **Nav "Editor" link** — one-line change in `PublicHeader.tsx` (`workspaceLink`): logged-out target `/auth?guest=1` → `/p/new`. (The auth-aware link shipped in a40ef41; this only swaps the destination.)

3. **`SecureWorkModal`** — `apps/web/src/poster/SecureWorkModal.tsx` (new).
   Props: `reason: 'export' | 'leave'`, `onClose`, `onConverted`. `reason` changes only the headline/subcopy; conversion buttons are identical. **Google first** (instant, `linkIdentity`), then email (`updateUser`, shows a "check your email to finish" state because the user stays anonymous until they click the link). "Leave anyway" / "Not now" dismisses. User-facing copy stays generic on errors (no raw error text; Send-Feedback affordance per `feedback_user_facing_errors`). No "AI" language.

4. **`convertGuest` helper** — extract the existing in-place conversion from `Auth.tsx` (the `is_anonymous` → `updateUser`/`linkIdentity` branch, ~line 239) into `apps/web/src/lib/convertGuest.ts` so `Auth.tsx` and `SecureWorkModal` share one implementation. Signature: `convertGuest(method: 'google' | 'email', payload) → Promise<Result>`. Never calls `signUp`. `Auth.tsx` is refactored to call it (behaviour-preserving).

5. **`useLeaveGuard` hook** — `apps/web/src/hooks/useLeaveGuard.ts` (new).
   Active only when `is_anonymous && dirty`. Arms a `beforeunload` handler (native dialog on real tab-close/refresh) and exposes an in-app-navigation intercept that opens `SecureWorkModal(reason:'leave')` instead of navigating, with a "leave anyway" escape. Disarms immediately on conversion or if the session is already permanent. `dirty` = the poster store's **`canUndo`** flag (true after ≥1 edit this session, reset by `setPoster` on load) — so a visitor who lands and immediately bounces without touching anything is never nagged.

6. **Export gate** — in `EditableExportButtons.tsx`, add an `is_anonymous` check *ahead* of the existing paywall gate: anonymous export click → `SecureWorkModal(reason:'export')` instead of the export/paywall flow. After conversion, the normal paywall/credit flow applies unchanged.

## Data flow (worked example)

1. Logged-out visitor clicks **Editor** → `/p/new` → `EnsureSession` calls `ensureSession()` → anonymous session created; `handle_new_user` has auto-created an "Untitled" poster.
2. `Editor.tsx` runs unchanged: `loadOrCreateMostRecentPoster()` → `setPoster` → `PosterEditor`. `hydrateIfEmpty` gives the 3-column template. URL normalizes `/p/new` → `/p/<id>`.
3. User edits; `useAutosave` persists to Supabase under the anonymous session. `useLeaveGuard` arms (anon + now dirty).
4. User clicks **Export PPTX** → anonymous check trips → `SecureWorkModal(reason:'export')`.
5. User clicks **Continue with Google** → `convertGuest('google')` → `linkIdentity` converts the session in place; the same poster is now owned by a permanent account. Modal closes, `useLeaveGuard` disarms, nav flips to "My posters". The normal export paywall now applies.
6. Alternatively the user closes the tab while anonymous+dirty → native "Leave site?" dialog (best the platform allows); the poster is already autosaved to the anonymous session and recoverable until the 14-day anonymous-cleanup.

## Error handling

- **`ensureSession` failure** (network/Supabase down): `EnsureSession` shows the generic "Something went wrong" state with a retry, never a raw error. The editor does not mount without a session.
- **Conversion failure**: generic message + Send Feedback; the user stays anonymous and their work is intact. Email path never claims "saved" before confirmation.
- **`SIGNED_OUT` mid-session** (e.g. token wipe): re-ensure anonymous rather than dead-ending.
- **Double-submit / concurrent ensure**: `ensureSession` already dedupes concurrent callers (single in-flight `signInAnonymously`).

## Testing (TDD, ≥ 80%)

- **`EnsureSession`**: logged-out → creates anon session + renders children; logged-in → renders without creating; `SIGNED_OUT` → re-ensures, does not navigate to `/auth`; ensure-failure → error state, no children.
- **`useLeaveGuard`**: anon+dirty → beforeunload armed + in-app intercept opens modal; logged-in → never arms; anon+pristine → never arms; disarms on convert.
- **`SecureWorkModal`**: renders both reasons; Google → `convertGuest('google')`; email → confirmation state, no false "saved"; dismiss/leave-anyway proceeds.
- **Export gate**: anonymous click → modal (not export); post-convert → normal paywall path.
- **`convertGuest`**: uses `updateUser`/`linkIdentity`, never `signUp`; email stays anonymous pre-confirmation.
- **Regression guard**: the logged-in editor entry + autosave flow is unchanged (the "same editor" invariant) — assert `EnsureSession` is a no-op render for an existing session and `Editor.tsx` behaviour is identical.

## Docs to update (graph-driven review rule)

- `docs/feature-graph.md` — editor entry + auth flow: `/p/:posterId` now uses `EnsureSession` (not `AuthGuard`); document the anonymous-first editor entry, the two prompts, and `convertGuest`. This also corrects the already-flagged stale "AuthGuard ensureSession" claim (`project_doc_conflicts_to_check`).
- `docs/manual-test-flows.md` — new flow: edit as anonymous → export prompt → convert (Google) → poster carries over; and the leave prompt (in-app nav modal + native tab-close).
- Memory: note the no-auth editor shipped; update `project_standalone_chart_tools` cross-ref if relevant.

## Out of scope (YAGNI)

- No localStorage / session-less layer — the silent-anonymous decision makes it unnecessary.
- No soft-nudge banner (the after-N-edits option) — the two prompts suffice for v1; can add later.
- No change to the paid-export mechanics, the paywall itself, or the 14-day anonymous cleanup cron.
- No change to `AuthGuard` on the genuinely account-required routes (`/dashboard`, `/profile`, `/admin`).
