# Fix 23 — a new visitor can land in someone else's shared poster

**Plan item:** 23 (found 2026-09-30, placed first: privacy and lost work) · **Branch:** `fix/new-poster-owner-only` · **Status:** step 9 complete (three rounds); step 10 next

## 1. Symptom

A visitor who opens the editor from the landing page, the nav or the pricing page goes to `/p/new`, which opens "your most recent poster, or a new one". If any other user has made a share link for a poster (which makes it public), the visitor is put into that stranger's poster instead: its content on the canvas, its name in the browser tab, and nothing the visitor types is saved ("Save failed — check your connection"). A returning visitor whose own poster is older than the stranger's shared one is put into it too.

Found by the ranking-evidence agent for items 8–11 (2026-09-30, `public-poster-new-check.mjs`, UNVERIFIED until reproduced here). Reproduced from the visitor's entry point, `/p/new` on a fresh browser, with the backend faked at the network layer with the posters table's row-level security as the migrations write it (MEASURED, `node scripts/new-poster-owner-check.mjs` on main `7f93b5b`, exit 1, both controls passed):

| scenario | whose poster opened | stranger's title on the canvas and in the tab | the visitor's typing saved |
|---|---|---|---|
| C1 control: no shared poster | the visitor's new poster | no | 200 |
| C2 control: a stranger's PRIVATE poster, newer | the visitor's new poster | no | 200 |
| N1 a new guest; a stranger's shared poster | the stranger's | yes | 406 ("Save failed — check your connection") |
| N2 a returning guest with an older poster of their own; a stranger's shared poster, newer | the stranger's | yes | 406 |

Two scenarios were added to the instrument after the confirmation and the owner's decision (below), and measured on the same commit (MEASURED, the same script, exit 1, controls passed): **N3**, a guest who opens a stranger's shared poster by its editor link (`/p/<id>`), gets the full editor on it; **S1**, a share link (`/s/<slug>`) shows the shared poster, a defect only since the owner hid sharing.

Production (MEASURED 2026-09-30, a read-only query of project `postr`): 3 posters, 0 public, and the live read policy is the migration's (`posters_select`, roles anon and authenticated, `using ((select auth.uid()) = user_id or is_public = true)`). So no one has been shown a stranger's poster yet; the first share link anyone makes would start it.

## 2. Hypotheses

| id | claim | prediction that would confirm it |
|---|---|---|
| H1 | `loadMostRecentPoster` (`apps/web/src/data/posters.ts:128-141`) asks for the newest poster with no owner filter, and the read policy returns public rows, so a visitor with no newer poster of their own gets the newest shared poster. | With a stranger's shared poster newer than anything the visitor owns, `/p/new` opens it; with the stranger's poster private, or older than the visitor's own, it does not. The request carries no `user_id` filter. |
| H2 | The editor does not check who owns the poster it opened: it shows a stranger's poster as editable, and every save fails because the update policy is owner-only. | The stranger's poster is editable on screen; the save gets 0 rows (406); the stranger's row is unchanged. |
| H-alt | Something else decides which poster opens (a redirect, a cache, an ownership check), and the defect does not happen from real entry points. | A real entry point opens the visitor's own poster even with a newer shared poster present. |

## 3. Method

Graph: `build_or_update_graph_tool` (full rebuild, 666 files, 8105 nodes, at `7f93b5b`), then `query_graph_tool` callers_of `loadMostRecentPoster`: `loadOrCreateMostRecentPoster` (`posters.ts:262`) and the unit test `posters.test.ts:214` ("orders by updated_at desc and limits to 1"); callers_of `loadOrCreateMostRecentPoster`: `Editor.tsx:180` and two tests (`posters.test.ts:282, 296`). Plus a grep of every `.from('posters')` in `apps/web/src` (10 queries).

| surface | file:line | touched | check |
|---|---|---|---|
| the query `/p/new` uses | apps/web/src/data/posters.ts:128-141 | yes | `scripts/new-poster-owner-check.mjs` |
| `/p/new`'s loader | apps/web/src/data/posters.ts:261-265, apps/web/src/pages/Editor.tsx:178-181 | no | `scripts/new-poster-owner-check.mjs` |
| the posters read policy | supabase/migrations/20260408000600_rls_perf.sql:43-48 | no | production's `pg_policies` (read-only), section 1 |
| the other posters queries | apps/web/src/data/posters.ts (10 queries) | no | confirmer B's sweep |
| the unit test that pins the query's shape | apps/web/src/data/__tests__/posters.test.ts:209-224 | yes | the suite |

Instrument (committed with the fix): `apps/web/scripts/new-poster-owner-check.mjs`, with `apps/web/scripts/lib/guestBackend.mjs` (a fake Supabase backend: anonymous sessions, a new user per guest sign-in, and the posters row-level security as the migrations write it, reading the user from each request's token). It opens `/p/new` on a fresh browser, types into a text block, and reads whose poster opened, what shows, and the save's status. Two controls must pass or it stops (exit 2).

## 4. Results before the fix

Section 1's table (MEASURED, `new-poster-owner-check.mjs` on `7f93b5b`): the defect in 2 of 2 scenarios (N1, N2), the controls 2 of 2. With N3 and S1 added: 4 of 4, the controls 2 of 2.

## 5. Independent confirmation (before any change)

On a frozen copy of main (`7f93b5b`) plus the instrument, each with its own instrument (both used `lib/guestBackend.mjs` as the posters fake; see the critic's G5 below), neither reading this record's instrument before it had its own numbers.

- Confirmer A — scope: the entry points and what the visitor experiences (the landing page's guest link, the nav's Editor link, the pricing page's free tier, the plot checker's link, the dashboard's new-poster button; new, returning and signed-in visitors; what they can see and do; whether the stranger's poster changes). A first run answered a relayed request instead of its task and ran nothing; the record counts the re-run.
- Confirmer B — scope: the mechanism and its siblings (the request `/p/new` sends, every read in the web app and the API server of a table whose read policy exposes more than the caller's own rows, and whether the editor checks the opened poster's owner).

**The defect exists: CONFIRMED by both.**
- A: 10 of 12 clicks on `/p/new` opened the stranger's shared poster (the other 2 are the safe case, the visitor's own poster newer); every link that leads to `/p/new` does it (the pricing page's free tier and the plot checker's link for everyone, the landing and nav links for a visitor without a session); a public poster 5 days old still opens for a new guest; the dashboard's "+ New poster" is safe, 3 of 3 (MEASURED, `entry-owner.mjs`). Controls: no public poster, the visitor's own poster newer, a stranger's private poster newest: the stranger's poster never opens (MEASURED). Serving the code with an owner filter added gave the visitor their own poster 3 of 3 (MEASURED).
- B: the request is `GET /rest/v1/posters?select=*&order=updated_at.desc&limit=1`, with no user filter, 3 of 3; B's scenario 1 (a new guest) and scenario 4 (a returning guest via the pricing page) open the stranger's poster 3 of 3 each (MEASURED, `newposter-owner-B.mjs`); with an owner filter served, both flip (MEASURED).

**Hypotheses:**
- H1: CONFIRMED by both (above).
- H2 (no owner check): CONFIRMED. `/p/<a stranger's public id>` opens the full editor, all 11 tabs, no read-only notice, 3 of 3 (B) and 2 of 2 (A); every save is refused, 9 of 9 and 13 of 13, and the pill says "Save failed — check your connection", even before the visitor types (A: a save runs and fails on load, 13 of 13) (MEASURED).
- H-alt: REFUTED. Only the editor's load effect decides which poster opens (INSPECTED), and the owner-filter counterfactual flips the result (MEASURED).

**What a visitor in a stranger's poster could do** (MEASURED by A, 4 of 4 each): see the canvas, title, authors and institution, and the stranger's comments; copy the stranger's share link; post a comment onto the stranger's thread (it lands there); print the stranger's poster to PDF; duplicate it into their own account. The stranger's stored row was unchanged, 13 of 13. The stranger's embedded images were uploaded into the visitor's own storage folder, 12 of 12.

**New findings from the confirmation:**
- F1 (MEASURED by both): the editor's comments panel hard-codes `isOwner={true}` (`Sidebar.tsx:815`): the share button shows to non-owners, and deleting another user's comment shows a false success (the row stays).
- F2 (MEASURED by the security review on a throwaway PostgreSQL 18.1 with all 31 migrations applied): anyone holding the publishable key can list every shared poster (title, slug, owner id, full content) and its assets; a guest session can list every comment on shared posters with commenter ids. That contradicts the design, which treats the slug as the capability. Production has 0 public posters, so nothing is exposed today.
- F3 (MEASURED): an ownership refusal is shown as "check your connection".
- The share slug has 40 bits of randomness, not the ~50 its comment claims (MEASURED over 200,000 samples); sharing has no consent step and no undo (INSPECTED); comment updates do not pin `poster_id` (MEASURED at the SQL level).

**Security review** (the process's rule for a security issue): the full review, with a database fix designed and prototyped (slug-keyed security-definer functions for shared reads, owner-only table reads, 128-bit slugs, pinned comment columns, pgTAP tests, a two-step deploy), is in the fix's scratch folder (`sec-run/security-review`).

**Owner decisions (2026-09-30):** hide the share button now; hide sharing and comments altogether ("it should just be editor, no sharing or comments yet"); duplicate only one's own posters; park sharing, its undo and its consent step to the Later list. So this fix is the client half (the owner filter, an ownership gate, duplicate own-only) plus hiding sharing and comments. The database hardening is recorded as a precondition for ever turning sharing back on (section 10). With sharing hidden, no control in the app makes a poster public (claims S1 and S2 of the instrument, section 8; the first version missed the text toolbar's path, which the step 9 review found). The database still lets an owner set `is_public` through the API.

Critic — 14 gaps (3 HIGH, 6 MEDIUM, 5 LOW). The HIGH ones: nobody visited the share page (G1), the database-side counterfactual was never run through the app (G2), and a session change mid-edit is an untried route to the same symptom and a trap for an ownership check run only at load (G3); all three were tested before the fix (below). MEDIUM and LOW gaps go to section 10 or into the fix (for example G8: `posters.test.ts:209-222` pins the unfiltered query; G14: the query must not run without a user id).

**G1, the share page `/s/<slug>`** (MEASURED, `share-g1.mjs` on the frozen main, 5 runs per scenario, both phone and desktop widths; the comments route written from the comments migration's policies). Every prediction held:
- a viewer who is not the owner sees the owner-only controls (copy share link; delete, edit and resolve on others' comments), because of F1; served with `isOwner={!props.readOnly}`, 0 of them, 4 of 4;
- a viewer with no session sees 0 of 3 comments, told "No comments yet" (15 of 15), cannot comment, and nothing on the page creates a session;
- a guest deleting a third user's comment is shown success while the row stays (10 of 10); resolving throws an uncaught error (10 of 10);
- "Make your own" then "Try as guest" opens the newest public poster, not necessarily the one viewed (5 of 5 in each of two worlds): the fix's root cause, reached from the share page;
- the owner's stored images do not load for anyone else (25 of 25).

It also found **D1**: the "Delete comment?" dialog cannot be confirmed with a mouse, 14 of 14 presses, for the owner too (Enter works). The press lands on the button, the dialog jumps, and the release lands outside it: the dialog is rendered inside the thread card, whose `:active` scale transform becomes the containing block of its `position: fixed` (INSPECTED). **D2**: the sidebar keeps an identity transform after the entrance animation, so the dialog's backdrop is 483 px wide and at 375 px 66 px of the dialog is off-screen (14 of 14). **D3**: at 375 px the comments sheet renders the 484 px sidebar; its Reply buttons are off-screen (2 of 2).

**G2, the database-side counterfactual through the app** (MEASURED, `g2-counterfactual.mjs`, the fake's read rule narrowed to own rows, the client unchanged). The narrowing alone stopped every visitor landing in a stranger's poster, 12 of 12 non-owner runs; the share page then shows "Poster not found" to everyone but the owner. The 2 × 2 of client owner filter × narrowing: `/p/new` needs both the unfiltered query and the wide policy (either change removes it); `/p/<a stranger's id>` still opens with the client filter alone (4 of 4), so a client-only fix needs the filter AND an ownership gate. The owner is never told a share link is broken once the read narrows (3 of 3), so any narrowing must deploy after a slug-keyed read and be tested as a non-owner.

**G3, the signed-in user changing mid-edit** (MEASURED, `session-change.mjs`, 3 of 3 per scenario; a second tab in the same browser context, sharing storage and supabase-js's broadcast channel). A sign-out in another tab (a1), a failed refresh in the editor's own tab (a2), and a guest signing in to another account in another tab (b1): in every one the owner's poster stayed loaded under the new user id, the next edit was sent as the new user and refused (406), and the pill blamed the connection; the edits were lost (9 of 9). A token refresh for the same user (control c0r) kept saving, so a gate must key on the user id changing, not on every auth event. Two new defects: **the owner's poster thumbnail uploaded into the other account's storage folder** when the sign-in lands between a save and its idle-time capture (3 of 3, race forced; `runThumbnailCapture` asks who is signed in when it runs); and **the "Your session has expired" warning never appears** (0 of 5 sign-out runs; its callback reads a stale `hadSession`, INSPECTED; served without that condition it appeared, 1 of 1). Its risk for the fix: a signed-out owner is silently given a new guest session, so an owner gate would tell the owner their own poster is not found.

## 6. Root cause

**Readable was taken to mean mine.** The web app treats any poster the database returns as the signed-in user's own. The posters read policy returns the user's own rows and every shared row (`using ((select auth.uid()) = user_id or is_public = true)`), so every place that asks the database "which poster" without saying "mine", or that opens what came back without checking whose it is, can hand a user a stranger's shared poster. Four places made that assumption:

- **A — the query `/p/new` uses** (`loadMostRecentPoster`, `posters.ts:128-141` on `7f93b5b`) asks for the newest readable poster, with no owner filter (H1). `listPosters` in the same file has the filter, with a comment about exactly this policy (confirmer B's blame: the dashboard's filter was written for it; `/p/new`'s query predates it).
- **B — the editor** (`Editor.tsx`) opens whatever `loadPoster` returns (H2), and never asks again when the signed-in user changes (G3). Two sibling reads have the same assumption: `duplicatePoster` copies any readable poster, and the autosave's thumbnail capture asks who is signed in at the moment it runs, not whose poster it is (G3's thumbnail finding).

The policy's width is the other half (G2: removing either half removes the `/p/new` symptom; the editor link needs the gate or the narrowing). It is also its own defect (F2: anyone with the publishable key can list every shared poster). With sharing hidden (the owner's decision), nothing in the app can make a poster public, and production has 0 public posters; the narrowing is recorded as a precondition for turning sharing back on (section 10), not made here.

**Siblings checked** (confirmer B's sweep of every read of a table whose policy returns more than the caller's rows, MEASURED or INSPECTED as marked there, and the graph's callers of `loadPoster` and `loadMostRecentPoster`): `listPosters` and `listMyGallery` filter by owner; `loadPosterBySlug` and the gallery reads are public by design (and hidden); `ensureShareLink` is harmless (the update is owner-only) and hidden; no web or API code reads `assets`; the API's service-role calls filter by user or check the owner. The comments panel's `isOwner={true}` (F1) is the same assumption in the UI, hidden with the comments tab.

**What this does not explain:** F3, a refused save shown as "check your connection" (it becomes unreachable in these flows, but the mapping of a refused write to a network error stays); the "Your session has expired" warning never showing (G3; a stale value in `SessionExpiredModal`); D1–D3 in the comments dialog and sheet; a signed-out editor tab being given a new guest session at once (G3).

## 7. Fix

Three commits, one per cause, plus the docs.

- **A.** `loadMostRecentPoster` asks for the signed-in user's own posters (`.eq('user_id', user.id)`), and with no signed-in user it sends no query and throws (G14), as `duplicatePoster` already did.
- **B.**
  - The editor waits for the signed-in user (`useSignedInUserId`, a new hook: the id from `getSession()`, then from every auth event, re-rendering only when the id changes) and opens a poster only if it is that user's: another user's poster, shared or not, shows "Poster not found", with nothing of it loaded, shown or copied into the visitor's storage.
  - When the user changes while a poster is open (a sign-out, or a sign-in to another account, here or in another tab), the poster closes and the page says "This poster is in another account", with Sign in and My posters. The poster is not asked for again: the new user cannot read a private poster, so the database would only say it does not exist (the first version asked again, and the browser rerun caught it saying "Poster not found"; section 8). Signing back in to the owner's account opens it again. A token refresh for the same user changes nothing.
  - An open editor stays open while the user's next poster loads (`/p/new`'s address becoming `/p/<id>`, a copy opened from the editor), as on main; a change of account during that load closes the open poster.
  - The user id for `/p/new`'s query and for the thumbnail's owner comes from the session the client holds (`getSession()`), not a network lookup, so a moment without the auth server neither dead-ends `/p/new` nor turns thumbnails off.
  - The browser tab is named after the poster only while it is open.
  - `duplicatePoster` copies only the user's own posters (owner decision).
  - The thumbnail capture uploads only if the signed-in user is still the user the editor was opened for.
- **C.** Sharing and comments are hidden behind `SHARING_ENABLED = false` in `config/features.ts`, the gallery's precedent. `/s/:slug` redirects to `/` in the app and is served the app shell by Vercel (not the share edge shell). The editor offers no way into comments: no comments tab in the sidebar, no "Comment on selection" in the text toolbar, both comment requests (`postr:comment-text`, `postr:comment-area`) ignored, and the comments panel, whose "Copy share link" was the only control that made a poster public, not rendered even if something sets its tab. The About page and its prerendered SEO copy no longer offer share links. The components, the edge function and the database stay; the flag's comment lists what must happen before it is turned back on (section 10).

Tests that encoded the old behaviour, changed with it: `posters.test.ts` pinned the unfiltered query (the critic's G8) and duplicated another user's poster; `EditorSheetSize.test.tsx` rendered the editor with no signed-in user; `routes.test.tsx` and `vercelRouting.test.ts` expected the share page; `PublicPageOutline.test.tsx` counted four editor headings and pinned the tab-title call's source text. The area-comment geometry test moved from `sheetConsumers.test.tsx` to `areaCommentSheet.test.tsx`, the one file that turns the flag on (the panel is frozen, not removed), so the rest runs the configuration that ships.

## 8. Results after the fix

**Tests red first (TESTED).** New: `EditorOwnership.test.tsx` (12), entering at the route with the auth client and the database mocked at the data layer; its database returns a poster only to its owner or, when shared, to anyone, as the read policy does, and its stand-in editor counts its mounts. `useAutosaveOwner.test.ts` (4), holding the idle-time capture until the test releases it. `sharingHidden.test.tsx` (5), entering at the sidebar, the format toolbar, and the two requests the toolbar and the area drag send. `posters.test.ts` gained or changed 4. These four files run against main's source (`7f93b5b`, a scratch worktree with only the test files replaced): 17 fail, each for the defect it names (in `posters.test.ts` 4, `useAutosaveOwner` 2, `EditorOwnership` 7, `sharingHidden` 4; the NEW-1 test was added after this run and fails on its own version, 1 of 1). The new tests that pass on main are the controls (the owner's own poster opens, a token refresh leaves it open, the thumbnail for its owner), another user's private poster (main already hides it), and three guards against regressions only the fix could bring (the editor reopened on a poster swap, thumbnails stopped by one failed lookup, the share button).

A lesson the first version taught: the ownership test's first database mock returned the poster to anyone. The account-change tests passed against it, while in the browser, with the policy faked at the network layer, the page said "Poster not found" (G3's rerun, first smoke: 2 of 2). With the mock following the policy, 3 of the account-change tests went red on that version, and green on the fix.

**Mutants (TESTED, `mutation-check.mjs`, `docs/fixes/23-new-poster-owner-only.mutants.json`).** Control 115 of 115; 17 of 17 killed. A: the owner filter removed (2 tests fail), the no-user guard removed (1), the user read over the network (1). B: the gate removed (2), the user change not followed (5), the account change asking the database again (4), the tab keeping the poster's name (1), a reload closing the open editor (1), a switch keeping the old poster under a new account (1), the closed poster forgotten on a switch (1), duplicate copying any poster (1), the thumbnail uploading as the current user (2), its owner read over the network (1). C: sharing on (6), the toolbar offering "Comment on selection" (1), each comment request followed (1 and 1). Two blind spots, documented: `vercel.json`'s rewrite is read with `fs` by its test, which the load-hook mutants cannot reach (falsified by hand: the old rewrite put back, `vercelRouting.test.ts` fails 1 of 50; restored, 50 of 50); and the panel's own gate, a second gate behind three guarded ones that no path reaches alone.

**The browser (MEASURED, frozen copies `fix23-frozen-4` and `fix23-frozen-5`).** `new-poster-owner-check.mjs`, extended after the step 9 review with claim S2 (select text in one's own poster: is there a way into comments or sharing?), control C3 (one's own poster by its editor link opens) and control C4 (the toolbar shows, so S2 can see it), and with S1 read as "the stranger's poster, or any share or comment control" rather than "not the home page": 0 of 5 claims observed on each copy, controls 3 of 3 and C4 held; S2 on `fix23-frozen-5` looks for any button labelled for comments or sharing. Main: 5 of 5, controls held. The version reviewed at step 9 (`fix23-frozen-3`): 4 of 5, S2 observed (the toolbar offered "Comment on selection" and the panel with "Copy share link" opened), which reproduces the review's CR-b-1 with this instrument. N1: the new guest gets their own new poster, typing saves (200), "Saved · just now". N2: the returning guest gets their own poster. N3: `/p/<a stranger's shared id>` shows "Poster not found", with no editor. S1: `/s/<slug>` lands on `/`. A side observation: a new guest at `/p/new` in the dev server created 2 rows on main (StrictMode runs the load effect twice) and 1 with the fix, since the load now waits for the user.

G3's `session-change.mjs`, rerun on the fix: on frozen copy `fix23-frozen-3`, then again on `fix23-frozen-4` after the step 9 follow-ups changed the editor's loading (every line of the gap agent's `run-all.sh`, 16 processes each, all exit 0; `summarize.mjs` exit 0; the two tallies are the same scenario for scenario). One change to the instrument first, recorded in its header: the poster now closes on the change, which the script had no branch for (its EXIT 0 already named "the poster was unloaded", but it went on to type into the closed canvas and timed out). It now records the closed page and goes Back; in `cloose`, whose known answer came from the app writing under B, tab 2 now sends one raw PATCH of the owner's poster as B, not through the app, and the detector must report it.

| scenario | main (gap G3) | the fix |
|---|---|---|
| a1, sign-out in another tab | owner's poster stays; next edit 406 as the new guest; "check your connection" (3 of 3) | poster closed, "This poster is in another account", 4 of 4 (one under the modal watcher control); no write as the new guest, 0 page errors |
| a2, refresh fails in the editor's tab | same (3 of 3) | closed, the same page, 3 of 3 |
| b1, a guest signs in to account B in another tab | same, as B (3 of 3) | closed, 3 of 3; Back lands on B's dashboard |
| b1race, the sign-in between a save and its thumbnail | the owner's thumbnail uploaded into B's folder (3 of 3) | closed; no thumbnail uploaded anywhere after the change, 3 of 3 |
| c0, c0g, no change (controls) | save 200 as the owner | save 200 as the owner; edits 1–3 stored, 6 of 6 (plus the smoke run) |
| c0r, a token refresh for the same user (control) | saves stay 200 | saves stay 200, poster stays open, 2 of 2 |
| cloose, the detector's known answer | detects the write as B, 3 of 3 | detects the raw write as B, 3 of 3 |

In every change run the tab title no longer names the poster, and the observer agreed with the fake's own count of writes (24 of 24 on each copy, the modal control's run included). The session-expired warning still never appears (0 in every change run; with the watcher control's mutant, 2 sightings in 1 run): that defect is not this fix's (section 10).

**The unit suite (TESTED):** 2998 of 2998, 184 files, on `fix23-frozen-5`'s sources; `tsc --noEmit` clean.

## 9. Review of the fix

### Code reviews (step 9)

Round 1, on frozen copy `fix23-frozen-2` against the frozen main (`7f93b5b`), two reviewers with split scopes, each with its own browser instrument:
- Reviewer CR-a — scope: causes A and B, the client ownership logic (`posters.ts`, `useSignedInUserId`, the editor's gate, the thumbnail tie, their tests and mutants).
- Reviewer CR-b — scope: cause C (the sharing switch), the committed instrument, and this record.

Findings (labels are the reviewers'; each above LOW, and each acted on, was reproduced first as noted):

| id | severity | finding | measured | action |
|---|---|---|---|---|
| CR-b-1 | HIGH | the text toolbar's "Comment on selection" still opened the hidden comments panel, whose "Copy share link" made the poster public | 5 of 5 (CR-b); reproduced by claim S2, 1 of 1 on `fix23-frozen-3` | fixed: button, requests and panel all gated; red tests and mutants (section 8) |
| CRa-1 | MEDIUM | "This poster is in another account" never showed for a private poster (the database hides it from the new user first) | 3 of 3 and 2 of 2 (CR-a); found independently by the G3 rerun's first smoke, 2 of 2 | fixed before the review returned (section 7) |
| CR-b-2 | MEDIUM | the record and the flag's comment claimed nothing could make a poster public | contradicted 5 of 5 | claim restated with its instrument (sections 5, 7) |
| CR-b-3 | MEDIUM | the About page and its prerendered copy still offered share links | 1 of 1 and 1 of 1 | copy removed |
| CRa-2 | LOW | `/p/new` flashed "Loading poster…" and reopened the editor when its address changed | 3 of 3 (CR-a), main 0 of 3 | fixed; jsdom batches the address change with the load, so the red test is the same mechanism through a copy opened from the editor (main keeps the editor, the first version reopened it) |
| CRa-4 | LOW | `/p/new` dead-ended with raw error text while the auth server was unreachable | 2 of 2 | fixed (the held session), red test |
| CRa-5 | LOW | one failed lookup at open turned thumbnails off for the session | 3 of 3 | fixed (the held session), red test |
| CRa-6 | LOW | the token-refresh control could not see a close and reopen | TESTED (a flapping mutant survived) | the control now counts mounts |
| CRa-7, CRa-8 | LOW | stale comments; the tab kept the closed poster's name | INSPECTED; 1 of 1 | comments corrected; the tab fixed (section 7) |
| CR-b-4 | LOW | the instrument had no control for its direct links, and S1 asserted the fix's design | INSPECTED and MEASURED | C3 added; S1 restated; S2 and C4 added |
| CR-b-5 | LOW | the record cites evidence kept outside the repository | INSPECTED | stated in section 10: the confirmers', gaps' and reviewers' scripts are not in the repository and not re-runnable from it; the committed instrument is |
| CR-b-6 | LOW | the feature graph did not say sharing is hidden | 72 mentions, 0 notes | `feature-graph.md` and `manual-test-flows.md` updated |
| CR-b-8 | LOW | `sheetConsumers.test.tsx` turned sharing on for every test in it | INSPECTED | the one test that needs it moved to its own file |
| CRa-3 | LOW | an edit typed inside the save delay is lost across a switch to another account and back | 3 of 3 (CR-a), main kept it 3 of 3 | handed on (section 10) |
| CRa-9 | LOW | `loadPoster`'s in-flight cache is keyed by poster id alone | INSPECTED; round 2 MEASURED it reachable (4 of 4), kept safe by the owner check | handed on (section 10) |
| CR-b-7 | LOW | `/s/<slug>` now serves the landing page's HTML with a `noindex` header | MEASURED | kept (the gallery's precedent; the header wins) |

Jev — shadow mode: 17 findings sent, 0 routed (the "review-finding" text format is not validated), 0 errors (`jev-route-findings.mjs`, jev-1.13.0). Nothing to audit.

Round 2, on frozen copy `fix23-frozen-4` (the follow-ups): each reviewer re-ran its own instrument on its findings and reviewed the follow-up diff in its scope.
- CR-b: nothing above LOW. CR-b-1 NOT REPRODUCED: at 1440 × 900 the toolbar showed 3 of 3 times and "Comment on selection", the panel, comment mode, a public PATCH and a comment write 0 of 3 each; at 375 × 812, with the sidebar hidden so the toolbar can be reached, the toolbar 3 of 3 and the button 0 of 3; main 3 of 3 on each. Falsified on the fix with its own mutants: all three gates removed brings the panel, the public PATCH (200) and the comment write back, 1 of 1; each gate holds on its own (toolbar button back: panel 0 of 1; button and listener back: panel 0 of 1, comment mode 1 of 1). CR-b-3 NOT REPRODUCED: `/about` shows 0 share lines (main 2), its prerendered HTML 0 (main 1). The committed instrument: 0 of 5 on the fix, 5 of 5 on main, controls held; with the toolbar mutant served, S2 goes red 1 of 1. New, all LOW: the switched-off lists in `features.ts`, `feature-graph.md` and `manual-test-flows.md` still named only the tab (corrected); S2 looked for one button title (it now looks for any button labelled for comments or sharing); the guard "nothing offers to copy a share link" could not fail, since the editor opens on another tab (it now opens every tab, and fails under the sharing-on mutant: 6 tests fail, against 5 before); `results.json` records the commit but not uncommitted changes (handed on: the harness file is shared with fix 04's branch).
- CR-a: nothing above LOW; controls K1–K3 held; its unit run 62 of 62 and the fix's A and B mutants 12 of 12 killed. NOT REPRODUCED on the fix: CRa-1 ("in another account" after a sign-in to B, 3 of 3; after a lost guest session, 3 of 3), CRa-2 (no loading flash on `/p/new`, 0 of 3; 2 canvas inserts, as on main), CRa-4 (`/p/new` during an auth blip opens the editor, 3 of 3), CRa-5 (a thumbnail after an auth blip, 3 of 3; none into the new user's folder, 0 of 3), CRa-7, CRa-8 (no poster name in the tab after a close, 4 of 4); CRa-6 changed (its flapping probe now killed). Still reproduced, as handed on: CRa-3 (3 of 3) and CRa-9 (now reachable when B signs in while a copy loads: B's load is answered from A's request in flight, 4 of 4, and the owner check rejects it, so B sees "Poster not found" 5 of 5 and never the editor). Clean: a user change during the first load never shows the owner's poster under B (0 of 3; main 2 of 2); a copy opened from the editor keeps it mounted and saves to the copy; the owner signing back in reopens the poster (3 of 3); 0 page errors. New, all LOW: NEW-1, Back to a poster closed by an account change during a switch said "Poster not found" (the closed poster was forgotten; the same message as main) — fixed, it stays remembered, red test and mutant; NEW-2, `/p/new`'s address-normalising reload replaces the poster just opened, so text typed before it lands is lost (2 of 2 with the reload held 2.5 s; main 2 of 2) — handed on, and the comment that claimed otherwise corrected; NEW-3, the load error screen's raw text — already handed on. Two comments older than the fix corrected (the editor page's header, `loadMostRecentPoster`'s).

Round 3, on `fix23-frozen-5` (NEW-1, the S2 selector, the guard test, the comments and docs):
- CR-b: all three round-2 items resolved. The widened S2 matches no button on the fix, at S2's moment or after opening each of the 10 sidebar tabs (1 run, the toolbar shown), and matches only "Comment on selection" under the toolbar mutant; the committed S2 is not observed on the fix and observed with the mutant (1 of 1 each). The guard now fails under sharing-on (in `sharingHidden.test.tsx`, 5 of 5 against 4 of 5). One cosmetic LOW: three stale line numbers in `feature-graph.md` (corrected).
- CR-a: nothing above LOW; controls K1–K3 held; unit 63 of 63; the five mutants in its scope killed (control 115 of 115). NEW-1 NOT REPRODUCED: Back to a poster closed by an account change during a switch says "This poster is in another account", 2 of 2 (main "Poster not found", 2 of 2). No new hole from keeping the closed poster remembered: the owner signing back in on another poster opens it and saves as the owner (2 of 2; main stays "Poster not found"), on the copy's route likewise (2 of 2), and user B moving to B's own poster opens it and saves as B (2 of 2); nothing of A's poster shown under B (0 of 6); 0 page errors. Still, as on main: if the copy had finished loading before the account changed, Back to the original says "Poster not found" (only the last poster opened is remembered; 2 of 2, main 2 of 2) — handed on. A doc gap (NEW-2 missing from section 10 in that copy of the record) was already filled in the working tree.

## 10. Handed on

**Before sharing is turned back on** (the precondition in `config/features.ts`; from the security review, which prototyped the database half on a throwaway PostgreSQL 18.1 with all 31 migrations applied):
- Shared reads through slug-keyed security-definer functions (`set search_path = ''`, returning no owner id), and owner-only table reads for posters, assets and comments; guests comment through a function that checks the slug, the session and a reply's parent.
- Comment updates limited to their content columns, so a comment cannot be moved to another poster (the design traps this: once the read narrows, an ordinary update could move a comment into a private poster).
- 128-bit slugs (today's are 40 bits, not the ~50 the code's comment claims).
- The comments panel given real ownership (`isOwner`), a way to stop sharing, and a consent step before a poster becomes public.
- Images on a shared poster signed by a server endpoint keyed by the slug (today they do not load for anyone but the owner).
- pgTAP tests for all of it, falsified against main's migrations; a two-step deploy (functions and client first, the policy drops after); production's migration history checked against the files first.
- The Privacy page's share-link paragraph, which treats a link as public and indexable, reconciled with the design, which treats it as unlisted.

**Later list** (none blocks the MVP editor):
- The "Your session has expired" warning never appears (G3; a stale `hadSession` in `SessionExpiredModal`; the item-11 area).
- A refused save is shown as "check your connection" (F3).
- An edit typed inside the save delay is lost across a switch to another account and back (CRa-3); a fix would keep the unsaved edits locally when a poster closes and offer them to the owner on reopening.
- `loadPoster`'s in-flight cache is keyed by poster id alone (CRa-9; worst case a false "Poster not found").
- Back past more than one poster after an account change says "Poster not found" (only the last poster opened is remembered; main says the same).
- `/p/new`'s address-normalising reload replaces the poster just opened, so text typed before it lands is lost (NEW-2; main too; a fix would skip the reload when the poster and its user are already open).
- `results.json` of the browser instruments records the commit but not uncommitted changes (`editorHarness.mjs`, shared with fix 04's branch).
- The comments dialog cannot be confirmed with a mouse (D1), its backdrop is offset by the sidebar's leftover transform (D2), and the phone comments sheet clips (D3): all in the hidden comments panel.
- A signed-out editor tab is given a new guest session at once (G3), so signing out does not stick while an editor tab is open.
- The load error screen shows the raw error message, against the product rule (seen through CRa-4's path, which is fixed; the screen itself is main's).
- `is_gallery_admin(uuid)` answers for any user id, and anon can read gallery entries' poster ids (the security review; the gallery is hidden).

**Evidence outside the repository:** the confirmers', gap agents', security reviewer's and code reviewers' scripts ran from the fix's scratch folder and are not committed; their numbers here are what they reported, and they cannot be re-run from the repository. The committed instrument (`new-poster-owner-check.mjs` with `lib/guestBackend.mjs`) and the unit tests can.
