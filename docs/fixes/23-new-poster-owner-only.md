# Fix 23 — a new visitor can land in someone else's shared poster

**Plan item:** 23 (found 2026-09-30, placed first: privacy and lost work) · **Branch:** `fix/new-poster-owner-only` · **Status:** steps 1 to 10 done; the step 10 follow-ups reviewed in step 9 rounds 2 to 6; step 11 (the claims audit) next

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
  - The editor waits for the signed-in user (`useSignedInUser`, a new hook: the id and whether it is a guest, from `getSession()`, then from every auth event, re-rendering only when either changes) and opens a poster only if it is that user's: another user's poster, shared or not, shows "Poster not found", with nothing of it put in the editor, shown, or copied into the visitor's storage. The database's answer still carries the row (the step 10 review measured one such read; its critic's G4): the client check keeps it off the screen, not off the wire.
  - When the user changes while a poster is open (a sign-out, or a sign-in to another account, here or in another tab), the poster closes. The page says what happened: for a guest's poster, that the guest session that made it has ended (a guest session cannot be signed in to again); for an account's, "This poster is in another account", with Sign in only when a guest or no one is signed in now (`/auth` sends a signed-in account on to My posters; step 10, R1-1). Either way it offers "Download a copy" and My posters: the poster stays in memory (the editor does not clear its store), and the copy is made as the page opens, while the owner's stored images can still be fetched (their signed URLs are cached for 50 minutes; step 9 round 2, S9R2-1), saying how many images it could not include. The poster is not asked for again: the new user cannot read a private poster, so the database would only say it does not exist (the first version asked again, and the browser rerun caught it saying "Poster not found"; section 8). Signing back in to the owner's account opens it again (measured for an account's poster; a guest's cannot be signed back in to). A token refresh for the same user changes nothing.
  - An open editor stays open while the user's next poster loads (a copy opened from the editor), as on main; a change of account during that load closes the open poster. `/p/new`'s move to `/p/<id>` does not load the poster again (it replaced what was typed in the meantime; step 9 round 2, NEW-2), and a change of account while that move is still pending closes the poster instead of opening the other account's (the router applies the move after other updates; step 10, R3-1).
  - The user id for `/p/new`'s query and for the thumbnail's owner comes from the session the client holds (`getSession()`), not a network lookup, so a moment without the auth server neither dead-ends `/p/new` nor turns thumbnails off.
  - The browser tab is named after the poster only while it is open.
  - `duplicatePoster` copies only the user's own posters (owner decision).
  - Everything uploaded into the poster goes into its owner's storage folder. The thumbnail capture and the background move of embedded images into storage upload only while the session is still the owner's (the second found by the step 10 critic, G1). An image picked for an image block and a `.postr` imported over the open poster use the owner the editor recorded with the poster when it opened it (`posterOwnerId` in the poster store; step 9 round 2, S9R2-2); with another account's session, the storage policy refuses the write instead of it landing in that account's folder.
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

### Independent review (step 10)

On `fix23-frozen-final` (the branch at `4e95985`) against main, three reviewers with split scopes, a skeptic per finding above LOW, and a completeness critic (workflow `wf_d9399aef-4ba`):
- R1 — Firefox and WebKit (every earlier check was Chromium), desktop and phone widths: the guest journeys, a stranger's poster by link, `/s/<slug>`, a sign-out and a sign-in to another account in another tab, a token refresh, any way into comments or sharing.
- R2 — regressions in the core editor journey in Chromium: the first-user journey to the free PDF, a guest converting in place, Duplicate and "Open copy", versions, import, the dashboard, the two-tab and leave guards, the thumbnail, the text toolbar.
- R3 — a production build instead of the dev server (no StrictMode): `/p/new` for a new guest, a stranger's poster, `/s/<slug>`, the account-change flows.

| finding | checked | action |
|---|---|---|
| R1-1 MEDIUM (the fix's): the closed page's "Sign in" cannot reach a form while an account is signed in (`/auth` sends it to the dashboard, and the app has no sign-out) | REPRODUCED by a skeptic with its own instrument, 6 of 6 | fixed (section 7): Sign in only when a guest or no one is signed in |
| R1-2 MEDIUM (worse than main): a guest whose browser signs in to an existing account loses the poster on screen for good | REPRODUCED 9 of 9; part of it (the guest session replaced, the poster orphaned, missing from the dashboard) is main's too | fixed for what the fix caused: the guest page and "Download a copy" |
| R1-3 LOW (the fix's): at 375 px the closed page's text 6 px from the edges | the reviewer's numbers | fixed: 16 px gutters on the closed and not-found pages |
| R3-1 LOW (the fix's): a sign-in landing just after `/p/new` made the tab create or open the other account's poster | no skeptic (critic G3); reproduced by the lead in a unit test first, and by the step 9 round 2 skeptic on the frozen step 10 tree (10 of 10 in Chromium, 4 of 5 in Firefox and WebKit, with the sign-in 136–161 ms after the address change) | fixed (section 7) |
| NEW-2 (step 9 round 2, handed on as main's): `/p/new`'s address change reloaded the poster over what was typed | red unit test; the round 2 skeptic: the marker lost on canvas and in the database in 3 of 3 browsers with the reload held back | fixed (section 7) |
| R1-4 LOW (main's): `/p/new` within 2 minutes of closing an editor tab says it is open in another tab | the reviewer's numbers | Later |
| R2-P1 MEDIUM (main's): Back from an edited copy writes the copy's text into the original | REPRODUCED by a skeptic, main the same | a new plan item (data loss in the MVP editor) |
| R2-P2 MEDIUM (main's): the toolbar's A+/A− and text colour change the screen but are never saved (the skeptic corrected the cause: A+/A− never start a save) | REPRODUCED, main the same | a new plan item |

Critic: 2 HIGH, 5 MEDIUM, 6 LOW gaps.
- G1 HIGH: the background move of embedded images into storage used whoever was signed in when it ran, the sibling of the thumbnail race. Fixed (section 7), with a test red before (it now asserts nothing is uploaded at all while another account is signed in; a first version asserted only the folder and did not fail without the session check, found by its mutant).
- G2 HIGH: every browser claim ran through one fake backend written for this fix. Run against a real local Supabase stack (below, "The real stack").
- G3 MEDIUM: R3-1 had no skeptic. Covered by the step 9 round 2 skeptic (above).
- G4 MEDIUM: claims beyond the measurements (a stranger's row is read, only not shown; Sign in as the remedy; the store keeps the poster). Restated in section 7.
- G5 MEDIUM: auth transitions never tried (a global sign-out, a magic or recovery link for another account, the paywall's sign-in, Google). All but Google run on the real stack (below).
- G6 MEDIUM: no committed harness for the account-change half of cause B. `scripts/account-change-check.mjs` is committed with the fix.
- G7 MEDIUM: Vercel's routing never run; G8–G13 LOW (the hook's two sources racing, the stale-token recovery with the new dependency, the legal pages' share wording, thin engine and device coverage, no public-poster check around the deploy, CI's build command). Section 10.

### Step 9 review of the step 10 follow-ups (round 2)

Reviewer and skeptic with split partitions (code and unit probes; the browser through the user's entry points, own scripts, three engines), on `fix23-frozen-r2`. All six follow-ups reproduced on the previous tree and not on this one, in Chromium, Firefox and WebKit (MEASURED by the skeptic): NEW-2 as above; R3-1 0 posters for the other account in 23 trials; R1-1 no Sign in with an account signed in, Sign in reaching the form with a guest (1 password field); R1-2 the `.postr` holds the typed marker and the image (70 B, byte-equal to the served PNG) and imports into the other account; R1-3 the closed page 25 px from the edges at 375 px, at least 16.8 px from 320 to 414 px (6.5 px on the previous tree; the 6 px figure was the closed page's, the not-found page already had 17.2 px at 375 px but 0.9–4.7 px at 320, 390 and 414); G1 nothing uploaded with a delayed tab sync.

| finding | checked | action |
|---|---|---|
| S9R2-1 MEDIUM: "Download a copy" dropped stored images once their signed URLs expired, and said "Downloaded." | red unit tests (an expired signing at the press; an image that can never be fetched) | fixed: the copy is made as the page opens, and says how many images it left out |
| S9R2-2 MEDIUM (main's, same cause as G1): an image picked for an image block, and Import over the open poster, uploaded into whoever the session named | red unit tests (both uploaded as the other account) | fixed: the owner travels with the poster (section 7) |
| S9R2-3 MEDIUM: the mutant spec no longer ran (a stale anchor) | the run stopped: "bad spec" | fixed; the spec's runs below |
| S9R2-5, S9R2-6, S9R2-8 LOW: a comment claiming an effect order that is not needed; the A→B→A switch inside the address change and a failed download untested; focus left on the page body when the poster closes | the reviewer's mutants survived | comment rewritten; tests added (the switch test first passed on a mutant because two sign-ins in one `act()` render once; rewritten to render each); the closed page's heading takes the focus |
| S9R2-4 LOW: signing back in to the owner reloads over the store's newer, unsaved copy | the skeptic's numbers, the same as round 1 | section 10 |
| S9R2-7, S9R2-9 LOW: stale docs; the download code duplicated | INSPECTED | this write-up; Later |

**Mutants after round 2 (TESTED).** Control 134 of 134; 36 of 36 killed, 2 documented blind spots (as before). New: the address change reloading, the pending change opening the other account, the migration uploading as the session, the owner not recorded, the image block and Import uploading as the session, the owner dropped on a restore or kept for another poster, the copy made on the press, a left-out image not counted, a failed copy not retried, the guest page and the Sign in rule (six).

**Tests (TESTED).** 3017 of 3017; `EditorOwnership.test.tsx` 27, `uploadOwner.test.tsx` 4.

### The real stack (step 10 critic G2, G5, G6)

`scripts/account-change-check.mjs` runs the app's own dev server against a local Supabase stack (GoTrue, PostgREST and Storage on 127.0.0.1, the repo's migrations applied), with nothing stubbed. It makes users through the app where it can (a guest at `/p/new`, a sign-in at `/auth`, a recovery link from "Forgot password?", a conversion from Sign up). It refuses a non-local URL or a key that carries a project ref.

Ten runs on the round-2 tree (`fix23-frozen-r2`) and ten on main (MEASURED; defect observed in runs whose precondition held):

| scenario | fix | main |
|---|---|---|
| P1: another account's token writes into, overwrites or signs a URL in the owner's storage folder | 0 of 10 | 0 of 10 (the policy refuses: 400) |
| H2: a guest opens a stranger's shared poster by its editor link | 0 of 10 | 10 of 10 |
| N1, N2: `/p/new` puts a new, or a returning, guest into a stranger's shared poster | 0 of 10 each | 10 of 10 each |
| G1: the image migration during a sign-in lands in the other account | 0 of 10 | 10 of 10 |
| TH1, TH2: the thumbnail after a sign-in lands in the other account | 0 of 10, 0 of 10 | 9 of 10, 0 of 10 |
| AC: a sign-in to another account in another tab | 0 of 10 | 9 of 9 |
| AC, the owner a permanent account | 0 of 1 | 1 of 1 |
| RL: a recovery link, a magic link, a sign-up confirmation link for another account | 0 of 10, 0 of 5, 0 of 3 | 9 of 9, 5 of 5, 3 of 3 |
| PW: the paywall's sign-in | 0 of 10 | 9 of 9 |
| SO: a global sign-out in another tab; from another device | 0 of 10; 0 of 5 | 9 of 9; 5 of 5 |
| CV: a guest converting in place keeps the editor and its saves | 0 of 10 | 0 of 9 |
| RF: refresh tokens rotated by two tabs | 0 of 3 | 0 of 3 |
| DL: the copy after AC and SO holds the text and the image | 0 of 19 missing | no page |

The first run on the fix recorded AC, RL and PW as observed. That was the harness's first defect rule counting the other account's own starter poster, which its dashboard creates at sign-in. Re-judged with the committed rule on that run's recorded data, all three are not observed (MEASURED).

The runs without a precondition are one run on main whose controls failed, and scenarios skipped where the stack could not stage them. RF needs a JWT expiry of 180 s or less; the confirmation link needs e-mail confirmations on.

The same tree with one part of the fix taken away (POSTR_MUTANT, real stack; one run per mutant, and the first runs of `download-does-nothing` and `no-owner-filter` stopped at a timeout, exit 2, and were run again):

- **Read red:** no ownership gate (H2), no owner filter (N1, N2), the user change not followed (AC, SO, RL), and a download that does nothing (DL).
- **Stayed green:** the migration and the thumbnail run as the session's user. The poster closes before either can run under the other account, so on this stack they are defence in depth; the unit tests kill both.

dl2 (the closed page used 51 minutes later) left the image out on this tree, 8 of 8. That is S9R2-1, fixed in round 2.

A trap for anyone re-running it, as the gap agent that built the stack reported it (UNVERIFIED: no run's log records it): Supabase CLI 2.110 no longer grants new public tables to the browser roles, so a stack started from the tracked `config.toml` answers every posters request with "permission denied". The harness's header gives the stack settings. CI pins CLI 2.101.0 (`ci.yml`), so whether an upgrade breaks the `db` job is also UNVERIFIED (section 10).

### Step 9 review, round 3 (on `fix23-frozen-r3`)

A reviewer and a skeptic with split partitions. The reviewer took code, mutants and unit probes. The skeptic took the browser through the user's entry points, with clocks moved on the page and the server, in three engines.

| finding | checked | action |
|---|---|---|
| S9R3-1 MEDIUM: "Download a copy" still left out a stored image when the editor had been open over 50 minutes before the account changed; the URL cache is 50 minutes, nothing signed it again while the editor stayed open, and the closed page's new session is refused | the skeptic, on the fake backend: 55 minutes left it out ("1 image could not be included") in Chromium, Firefox and WebKit; 51, 61 and a sign-out at 55 in Chromium (2 runs each); 0 and 51 minutes after the close kept it | fixed: an open poster's stored images are signed again every 40 minutes (red unit test first: the 55-minute case with the signing modelled as owner-folder-only and expiring); an honest-expiry re-try on the real stack is round 4's |
| S9R3-2 LOW: the focus fix had no test | reviewer's mutants survived | test added |
| S9R3-3 LOW: nothing pinned that only blocks that had an image count as missing | reviewer's mutant survived | test added (a text block, a kept image, a lost one: 1) |
| S9R3-4 LOW: three untested guards | reviewer's mutants survived | the upload's session fallback removed (in the editor it was dead: the editor always records the owner; with no owner an image stays in the poster); the Import target check and the prefetch's rejection handler are defensive (section 10) |
| S9R3-5 LOW: the thumbnail's owner read from the session at mount | INSPECTED; the real stack's TH1 and TH2 0 of 10 | section 10 |
| S9R3-6 LOW (main's): Import over the open poster during a tab-sync delay ends in raw backend text | the skeptic's numbers; nothing reaches the other account's folder on the fix (main: 200 into it) | section 10 (generic errors) |

**Mutants after round 3 (TESTED).** Control 147 of 147; 39 of 39 killed, 2 documented blind spots. New: signed URLs not renewed, the focus not taken, blocks without images counted.

**Tests (TESTED).** 3020 of 3020.

### Step 9 review, round 4 (on `fix23-frozen-r4`)

One reviewer, on the renewal and round 3's tests, with PREV `fix23-frozen-r3`. It re-tried S9R3-1 on the real local stack with the editor open 53 real minutes from the first signing, then a sign-in to B through `/auth` in another tab, then "Download a copy" (MEASURED; Chromium twice, Firefox and WebKit once, per tree):

- **The fix:** the image is in the copy in 4 of 4 runs (Chromium twice, Firefox, WebKit), byte-equal to the stored PNG, and the page says "Downloaded." The renewal signed as the owner at 39.94 minutes (200).
- **PREV:** 0 of 4. Each run says "1 image could not be included"; its only signing after the change was as B, refused (400).
- **A hidden tab** (the reviewer's report, UNVERIFIED: a hand-run session in the Claude browser pane, Chromium 152, with no network log kept): the renewal ran at 39.96 minutes and the image is in the copy; PREV left it out. Timers were throttled (gaps of up to 97 s on a 1-minute probe), not stopped. A frozen or discarded tab could not be staged.
- **Clean:** unit suite 3020 of 3020; committed mutants 39 of 39 killed (control 147 of 147). The harness's one full run on this tree exited 2, 1 of 19 observed: `ml`, whose magic link landed on another port (S9R4-5). `rl` and `ml` re-run on the stack's `site_url` port: controls held, 0 of 2 observed. `cf` and `RF` were not run on this stack (e-mail confirmation off; a 3600 s token).

| finding | checked | action |
|---|---|---|
| S9R4-1 LOW: the 40-minute clock restarts whenever the editor opens the poster, so a poster opened again within one page load (Back to My posters and the same card, or a sign-out and back in) more than 10 minutes after its images were signed is not renewed before the cache expires | real stack, reopened in place: at 20 minutes, the account changed at 55, the image left out (1 of 1); at 5, it is in the copy (1 of 1); PREV at 20 the same (1 of 1). Back and the same card (round 5's critic, on the unit model): left out 3 of 3 | Later (section 10), with S9R4-2 |
| S9R4-2 LOW: a failed renewal is not tried again for 40 minutes | a unit probe (a signing that fails once): the image left out | Later, with S9R4-1 |
| S9R4-3 LOW: the renewal's tests pinned only the 55-minute case | the reviewer's mutants: a renewal at 52 or 54 minutes, a refused renewal dropping the cached URL, the renewal never stopped, and the renewal reading the poster as it was opened all survived (control 169 of 169) | four tests added after the reviewer's probes: the account changing just after the first signing expired, a renewal refused because another tab already signed in, an image added after opening (a new block; the probe's version re-signed the same image and did not kill its mutant), the renewal stopping when the poster closes. The five mutants are in the spec, killed 5 of 5 (control 151 of 151) |
| S9R4-4 LOW: four round 3 items said "section 10" and were not there | INSPECTED | added (section 10) |
| S9R4-5 LOW: the harness printed OBSERVED for a scenario whose precondition failed (a magic link landed on another port), though it already exited 2 | the reviewer's run on port 5465 | no verdict and no count without the precondition ("n/a: precondition failed"); the header says `PORT` must be the stack's `site_url` port. INSPECTED only: the Supabase images were removed after the round, and the change was not run on a stack |

S9R4-1 and S9R4-2 share one cause: the renewal is scheduled from the poster's opening, not from the age of what the cache holds. S9R3-1's fix renewed on a clock that each opening restarts. The reviewer's suggestion addresses the cause: every few minutes, sign again any image whose cached URL is missing or expires within 15 minutes. That also retries a failed signing. It is handed on rather than done here (the owner's MVP triage: it does not block the editor): the path needs the poster opened again within one page load, or a failed signing, and then an account change in another tab 50 minutes or more after the images were signed. The copy then says how many images it left out; for a guest's poster they cannot be fetched again, as the guest session cannot be signed back in to.

**Mutants after round 4 (TESTED).** Control 151 of 151; 44 of 44 killed, 2 documented blind spots (as before).

**Tests (TESTED).** 3024 of 3024, 185 files; `tsc --noEmit` clean.

### Step 9 review, round 5 (on `fix23-frozen-r5`)

A code reviewer (the diff, the tests' order and timing, the harness's verdict loop replayed on 34 recorded runs, and every number in round 4's section against round 4's logs), a skeptic with 22 mutants of its own against the renewal, and a critic. No application code changed from r4 to r5 (the harness's verdict loop did: replayed on 34 recorded runs, never run on a stack), so round 4's real-stack results stand for it.

| finding | checked | action |
|---|---|---|
| SK5-1 MEDIUM: the tests' clock jumped in one synchronous step, so a renewal's cache entry was written at the end of the jump, and a renewal that caches its URL too briefly passed every test (a seconds-for-milliseconds slip leaves 3.6 s, worse than no renewal) | the skeptic's logging mutant: the 40-minute renewal wrote at 46 minutes; its two expiry mutants 0 of 151 | the clock advances timer by timer (`advanceTimersByTimeAsync`). Falsified by the lead: with the old helper both expiry mutants survive (0 of 155), with the new one each is killed (6 of 155); in the spec |
| critic, MEDIUM: S9R4-1 is wider than recorded: Back to My posters and the same card opens the poster again with the old cache and a new clock | the critic's probe on the unit model: 3 of 3 left the image out; round 4's sketch turns it green | S9R4-1 restated (round 4's table and section 10); still Later, by the owner's MVP triage |
| SK5-2, SK5-3, SK5-5 LOW: a renewal that runs once, one that starts only if the poster opened with a stored image, and one that stops at the first refusal all passed | the skeptic's mutants | three tests (95 minutes open; a figure uploaded into a poster that had none; an image the owner cannot sign listed first); the mutants in the spec, killed |
| SK5-4 LOW: the 51-minute test let a renewal due at 51 minutes pass | the skeptic's numbers | the test changes the account at 50.5 minutes; `renewal-at-51-minutes` in the spec, killed. A renewal at 50 minutes still passes (the model's signing is instant; the skeptic killed it only with a delayed signing) |
| SK5-6 INFO: nothing bounded how often the renewal signs | the skeptic's mutant: every minute passed | a test: an hour open signs the image twice; `renewal-every-minute` killed |
| SK5-7 INFO: two of the skeptic's mutants survive | a 49-minute renewal (correct behaviour in this model) and a 70-minute cache (main's constant; no fix 23 flow reaches it) | none |
| R5C-1 LOW: the harness's new PORT note was wrong for `rl`, which followed the page's port in the recorded 5465 run | the recorded results | the note now says which links land on `site_url` |
| R5C-2, R5C-3, R5C-5 LOW and INFO; the critic's LOW wording gaps | round 4's and 3's logs | corrected: the CLI 2.110 claim labelled UNVERIFIED and added to section 10; round 4's run counts and its full harness run (exit 2); round 3's S9R3-1 engines; the hidden tab labelled as the reviewer's report; the real-stack mutants' single runs and re-runs |
| R5C-4 LOW: "names the image it left out": the page gives a count | INSPECTED (`PosterClosedPage.tsx`) | "says how many" in the record, the page's comment, a test title and a mutant's text |
| R5C-6 INFO: the "renewal stops" test depends on the store keeping the poster after the close | INSPECTED | noted; the store keeps it by design (the closed page's copy needs it) |

Held by the reviewers (MEASURED): the ownership file 10 runs × 33 of 33, each new test alone, in reverse and under 8 shuffle seeds; the harness's new loop changes no exit code in 34 recorded runs, and the observed count only in two runs that exited 2 either way; every cell of the real-stack table reproduced from the 20 recorded runs.

**Mutants after round 5 (TESTED).** Control 155 of 155; 51 of 51 killed, 2 documented blind spots.

**Tests (TESTED).** 3028 of 3028, 185 files; `tsc --noEmit` clean.

### Step 9 review, round 6 (on `fix23-frozen-r6`)

A reviewer (79 mutants run under the old and the new test clock, 30 sequential and 8 shuffled runs per tree, every round 4 and 5 claim against the logs) and a skeptic (its own wrong-expiry and copy-timing mutants against r5's and r6's tests). Held (MEASURED by the reviewer): no mutant a test kills under the old clock escapes it under the new one; each of the seven new spec mutants fails only its named test; the round-5 table and the corrections to round 4 hold against the logs.

| finding | checked | action |
|---|---|---|
| SK6-1 MEDIUM: a renewal that caches its URL for 21 to 39 minutes still passed every test | the skeptic, in a copy with one more test (the account changing at 79.5 minutes): 21, 25, 30, 35 and 39 each killed; 41 survives, as it should | the test is committed, and `renewal-expiry-39-minutes` is in the spec |
| SK6-2 LOW: with the timers fired in turn, "an hour after the close" no longer caught a copy put off to a timer (r5's clock caught 3 of 3) | the skeptic's mutants | the test first waits for the copy's one fetch, made as the page opens |
| SK6-3, R6C-1 LOW: the clock's comment claimed everything a timer awaits settles; only microtasks do | the reviewer's probe: a cache write one real `setTimeout(0)` late fails 6 of 37 tests under either clock | comment corrected. The renewal tests assume that signing and the copy's fetch finish within microtasks, as the mocks do; a change that adds real latency (batching, a back-off) will turn them red |
| R6C-3 INFO: the token-refresh control failed 1 of 30 runs (the editor's mount effect read too early) | the reviewer's runs | it waits for the first mount |
| R6C-2, R6C-4, R6C-5, R6C-6 LOW and INFO: wording (r4 to r5 changed the harness; a test title; SK5-7's two survivors; the round that ran on port 5465; logs taken before the freeze) | the logs | corrected; this round's numbers are from the tree as committed |
| SK6-4 INFO: expiry mutants in the too-long direction (from the signing's start, the URL's own 60 minutes, a day) survive | the skeptic's mutants | none here: the renewal writes the cache's own 50 minutes, below the URL's 60. An entry that outlived its URL would hand out an expired one; a unit test of `posterImages.ts` capping the entry by the URL's life is in section 10 |
| SK6-5 INFO: a status that clears itself after a minute survives | the skeptic's mutant | none: nothing asks for the count to stay |

**Mutants after round 6 (TESTED).** Control 156 of 156; 52 of 52 killed, 2 documented blind spots.

**Tests (TESTED).** 3029 of 3029, 185 files; `tsc --noEmit` clean.

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
- Signing back in to the owner's account after the poster closed loads it again from the database, over the store's newer copy, so the last edits refused under the other account are lost (S9R2-4; the same shape as CRa-3).
- `results.json` of the browser instruments records the commit but not uncommitted changes (`editorHarness.mjs`, shared with fix 04's branch).
- The comments dialog cannot be confirmed with a mouse (D1), its backdrop is offset by the sidebar's leftover transform (D2), and the phone comments sheet clips (D3): all in the hidden comments panel.
- A signed-out editor tab is given a new guest session at once (G3), so signing out does not stick while an editor tab is open.
- The load error screen shows the raw error message, against the product rule (seen through CRa-4's path, which is fixed; the screen itself is main's).
- `is_gallery_admin(uuid)` answers for any user id, and anon can read gallery entries' poster ids (the security review; the gallery is hidden).
- `/p/new` within 2 minutes of closing an editor tab says the poster is open in another tab (R1-4; the two-tab guard keeps entries on purpose).
- Step 10 critic: Vercel's production routing for `/s/:slug` never run (G7); the hook's two sources, `getSession()` and the auth event, unordered (G8); the stale-token recovery inside `/p/new`'s load with the new user dependency (G9); the legal pages still describe share links (G10); only Playwright engines, and phone meaning width only (G11); CI's build command not run on the final tree (G13).
- **The renewal's schedule** (step 9 rounds 4 and 5, S9R4-1 and S9R4-2): it runs every 40 minutes from the editor's opening of the poster, so a poster opened again within one page load (Back to My posters and the same card, or a sign-out and back in) more than 10 minutes after its images were signed, or a renewal that failed once, can leave images out of "Download a copy" after an account change in another tab 50 minutes or more after the signing; the page says how many. For a guest's poster they are then out of reach. Round 3's suggestion to sign again when a hidden tab comes back was not taken, and a frozen or discarded tab (which runs no timer) was never staged. The fix: every few minutes, and when the tab is shown again, sign every stored image of the open poster whose cached URL is missing or expires within 15 minutes (the cache alone is not enough: a signing that failed when the poster opened leaves no entry; round 5's critic, probe CR-P2). Commit the critic's CR-P1 (Back and the same card at 20 minutes, the account changed at 55) with it.
- A unit test of `posterImages.ts` that caps a cache entry by its URL's life (step 9 round 6, SK6-4: a renewal that writes a longer entry passes the editor's tests).
- Supabase CLI 2.110's default grants (reported by the gap agent, UNVERIFIED): a local stack from the tracked `config.toml` refused every posters request; CI pins 2.101.0. Check before upgrading the CLI in CI.
- The Import target check and the prefetch's rejection handler (step 9 round 3, S9R3-4) are defensive and untested: no path reaches either alone.
- The thumbnail's owner is read from the session when the editor mounts (S9R3-5); the real stack's TH1 and TH2 were not observed in 10 runs, and in round 4's.
- Import over the open poster during a tab-sync delay ends in raw backend text (S9R3-6, main's): against the generic-errors rule. Nothing reaches the other account's folder on the fix (main: 200 into it).
- The `.postr` download code exists four times (`downloadPostr`/`savePostr` now, `PostrExportButton`, `ImportConfirmReplaceModal`, `PaperToPoster`; S9R2-9).

**At deploy (G12):** count public posters in production before and after (read-only; 0 on 2026-09-30), since the database's wide read stays until sharing's own hardening, and tabs running the old bundle keep "Copy share link" until they reload.

**New plan items (MVP editor, from step 10's R2):** Back from an edited copy writes the copy's text into the original poster (R2-P1, data loss); the text toolbar's A+/A− and text colour are never saved (R2-P2).

**Evidence outside the repository:** the confirmers', gap agents', security reviewer's and code reviewers' scripts ran from the fix's scratch folder and are not committed; their numbers here are what they reported, and they cannot be re-run from the repository. The committed instrument (`new-poster-owner-check.mjs` with `lib/guestBackend.mjs`) and the unit tests can.
