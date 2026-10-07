# Fix plan — approved 2026-09-27

Readable version: https://claude.ai/artifact/Uip1hzXaK9ssopFvzwH755 (owner-private).
Every number below was measured in the 2026-09-27 planning round (real editor
in Chromium with the backend faked at the network layer; real matplotlib
3.10.8; Rscript 4.6.0 + ggplot2 4.0.3). Harnesses are committed with the fix
they prove.

**Per-fix process (owner's rule, revised 2026-09-27):**

1. Symptom, reproduced from the user's entry point.
2. Hypotheses stated explicitly, including alternatives to rule out, each with
   the prediction that would confirm or refute it.
3. A reusable, committed script that tests each hypothesis (a vitest file when
   jsdom can observe it, a browser harness in `apps/web/scripts/` when it
   needs layout). Results recorded as numbers.
4. **Two independent reviews confirm the issue exists** before any fix — each
   reviewer uses its own method and scripts, not the author's.
5. Fix. Re-run the hypothesis scripts; falsify (revert the fix, confirm red).
   For a fix with several parts, falsify each part:
   `apps/web/scripts/mutation-check.mjs` with a mutant spec next to the record
   (`docs/fixes/NN-slug.mutants.json`). Every mutant must be killed.
6. Independent review of the fix.
7. An engineering record per fix in `docs/fixes/NN-slug.md`: symptom,
   hypotheses, method, results before, root cause, fix, results after,
   review outcomes, what it does not cover.

One branch per cause.

## Owner decisions

- Poster-size wipe goes before the 13-inch fit problem.
- Changing poster size asks first, then moves existing blocks onto the new sheet.
- Guidelines panel starts closed on small screens.
- Undo is PowerPoint-style: one history, works inside text, large changes too.
- A pasted plot script survives a reload.
- Owner check: undo of deleted text/components works in real Chrome. Redo
  after undoing typing is still unconfirmed (settled by item 12).

## Assumptions accepted with the plan

- Poster gutter 64 px (owner decision; fix 03 measured handles still under the rulers at large fitted zooms, 4 of 12 cases, record 03 section 10). The owner kept the gutter and chose to fix the controls instead: item 19 (2026-09-30).
- "Small screen" = viewport narrower than 1600 px.
- Pasted script saved per poster in this browser (localStorage), not in the poster.
- Undo history 50 -> 100 steps.

## Order

| # | Fix | Effect | Size | Ref |
|---|---|---|---|---|
| 1 | A sidebar change wipes the undo history | loses work | S-M | new |
| 2 | A new poster size replaces the whole poster | loses work | M | new |
| 3 | Fit leaves the far edge cut off (36 px, 64/64 configs) | looks broken | S | F5 |
| 4 | Rulers off by up to 30 in | wrong result | S | new |
| 5 | Printing from Preview runs the title into the authors (up to 1.9 in) | wrong result | S | O1, O3 |
| 6 | Group move/resize can't be undone | looks broken | S | F1 |
| 7 | Leaving the Figure tab loses the pasted script; must survive reload | loses work | M | FR9 |
| 8 | A failed save is treated as saved | loses work | M | F7c |
| 9 | *Moved to the Later list (outside the MVP scope, 2026-09-30).* | | | |
| 10 | *Moved to the Later list (outside the MVP scope, 2026-09-30).* | | | |
| 11 | *Moved to the Later list (outside the MVP scope, 2026-09-30).* | | | |
| 12 | PowerPoint-style undo (text undo goes to the browser today) | looks broken | L | F2 |
| 13 | Checker can't read its own Python fix; per-element rcParams ignored (re-lands 1.0x ticks) | wrong result | M | W1, W2 |
| 14 | seaborn contexts / style sheets misread | wrong result | M | W3 |
| 15 | Check does nothing when it can't tell R from Python (re-lands detection) | dead end | S-M | W4 |
| 16 | R fix attached to print(p) passes but changes nothing | wrong result | M | new |
| 17 | *Moved to the Later list (outside the MVP scope, 2026-09-30).* | | | |
| 18 | *Moved to the Later list (outside the MVP scope, 2026-09-30).* | | | |
| 19 | Block controls (handles, rotate and move) stay one size on screen at every zoom | looks broken | M | fix 03 question |
| 20 | Toolbar buttons show a focus ring only after Tab, not after a mouse click then a key | annoyance | S | fix 03 question |
| 21 | *Parked on the Later list by the owner (2026-09-30).* | | | |
| 22 | *Parked on the Later list by the owner (2026-09-30).* | | | |

**Re-ranked for first users (2026-09-30).** The owner asked for the remaining items to be ranked by their effect on a first visitor's sessions, and for anything outside the MVP scope to move to Later. Real traffic was too small to rank with (59 visitors in 30 days, Vercel Web Analytics, MEASURED), so reach is judgment; each item was re-measured on main first (the ranking evidence, `scratchpad/ranking-evidence/`, MEASURED per item). A Jev screen (jev-1.13.0, unvalidated for this question) was used only to pick which items to argue; a skeptic per disputed item decided from the evidence. Order now: **23** (new, privacy: a visitor could open someone else's shared poster; first), then **13, 15, 7, 12, 19, 14, 20, 16, 5, 6, 8**. Folded rather than dropped: 18's real-R/Python harness becomes the instrument of 13–16; 10's "Try again discards unsaved work" and 11's "a refused save is blamed on the connection" join item 8's scope. Two fixes run at once.

Items 19–22 come from the owner's answers to fix 03's questions (2026-09-30). The goal the owner set: the editor adapts to every screen size and feels smooth. Later the same day the owner parked 21 and 22 on the Later list and kept 19 and 20, while the remaining items are re-ranked by their effect on a first visitor.

## MVP scope and the Later list

The owner's definition of the MVP (2026-09-30): a usable poster editor where
most functionality works well, particularly the normal functions and workflow
people know from PowerPoint: inserting blocks, pasting tables, checking a
plot's code for readability, a working logo, author and reference-list setup,
theme colours, and the editing functions (undo, paste and the rest).

A new finding that does not block that scope goes on the Later list below
(and the fix board's Later section), with its label and who measured it: no
plan item, no skeptic, no owner question. Only a finding that blocks the
scope becomes a plan item or a question for the owner.

### Later

- Where keyboard focus goes after ⌘/ hides the sidebar: typing can edit a
  hidden field (MEASURED in fix 03, record 03 section 10).
- Whether read-only viewers of a shared poster should see the rulers and the
  guidelines panel (an owner question, record 03 section 10).
- The out-of-bounds banner covers the top ruler: 22 of 55 marks hidden at
  1280 × 800 (MEASURED by both of fix 04's confirmers, independently).
- With scrollbars that take space (Windows, or macOS set to always show
  them), the ruler bars cover the first 24 px of the canvas's scrollbars
  (MEASURED by fix 04's confirmer B on emulated scrollbars; native
  UNMEASURED).
- The canvas's own 10 px scrollbar style never applies in Chromium:
  `scrollbar-width: thin` overrides the `::-webkit-scrollbar` rules
  (MEASURED by fix 04's confirmer B).
- The dark workspace grid around the sheet starts at the canvas's corner,
  not at the sheet: its 5-inch lines sit 5.58 px and 10.33 px from the
  sheet's at the default window, up to 76 px across fix 04's scenarios
  (MEASURED from layout and the grid's computed CSS by
  `ruler-check.mjs`'s INFO `grid` reading; paint not read). The same kind
  of cause as fix 04; the rulers' measured sheet position could feed its
  `background-position` (record 04 section 6).
- At the 20 % zoom floor the rulers draw a mark every 2 px (an inch is
  2 px): a solid band, no labels readable (INSPECTED, from fix 04's
  `zoom-out-to-floor` numbers; not looked at by eye).
- The rulers lag the sheet by a frame while the canvas animates or scrolls
  (MEASURED by fix 04's step 9 reviewer, `transient-probe.mjs`, from layout
  at each animation frame; paint not read): closing the guidelines panel at
  1920 × 1080, 13 of 168 and 16 of 172 frames over 0.5 px, worst 87.08 and
  88.17 px; hiding the sidebar at 1280 × 800, 16 of 174 frames, worst
  133.36 px, each on the first frame after the click; a 30 px wheel scroll,
  1 of 179 frames, 30 px, the same as main; at rest 0. Likely because the
  reading is set from the resize callback and renders after that frame
  paints (INSPECTED, the reviewer's inference).
- With reduced motion requested (`prefers-reduced-motion`), opening the
  guidelines panel still animates the canvas's width, through 12 distinct
  values (MEASURED by fix 04's step 9 reviewer, round 2,
  `reduced-motion-check.mjs`).
- **Item 9, outside the MVP scope (2026-09-30):** error screens show database
  text and have no way out: 6 of 6 start or load failures on a first visit are
  dead ends, 3 of 5 print backend text (MEASURED, ranking evidence). It breaks
  the product rule that user-facing errors stay generic. Before any workshop or
  class session, check production's anonymous sign-in rate limit (30 per hour
  per IP in the local config): a room on one network would hit this screen.
- The editor's plot checker code box keeps Tab and Shift+Tab (it indents),
  so a keyboard-only user who types code cannot reach ▶ Check or the
  language buttons (WCAG 2.1.2); the public page does not indent. On main
  too (MEASURED by fix 15's round 2 reviewer, 8 of 8 runs in each of three
  engines; INSPECTED in fix 15, record 15 section 10).
- **Item 10, outside the MVP scope (2026-09-30):** the crash screen claims the
  work is safe when it may not be (MEASURED with a synthetic crash only); its
  "Try again discards unsaved work" part moved into item 8.
- **Item 11, outside the MVP scope (2026-09-30):** losing the session mid-edit
  (MEASURED only with a forced refresh refusal; no first-session path found);
  its parts moved into items 8 and 9.
- **Item 17, outside the MVP scope (2026-09-30):** "Copied" when copying
  failed, Scan image silent on an empty placeholder, a stale language label
  (MEASURED). Fix 15 marks a result out of date when the code or its
  reading changes; the label's "Detected:" for a hand-picked language is
  not changed (record 15, section 10).
- **Item 18 as its own item (2026-09-30):** its real-R/Python harness is the
  instrument of items 13–16 instead.
- **Item 21, parked by the owner (2026-09-30):** close the guidelines panel when
  the poster area gets too narrow to use; at windows 640–700 px wide its button
  covers FIT, so FIT cannot be clicked (MEASURED, 4 of 4 widths, fix 04's
  confirmer A and the ranking evidence on main).
- **Item 22, parked by the owner (2026-09-30):** with a block selected, keys
  pressed on a focused dropdown reach the poster: Backspace deletes the block
  (7 of 7) and the arrows move it (7 of 7); the Edit tab's Weight dropdown is
  the likeliest path, and ⌘Z restores the block (6 of 6) (MEASURED by the
  ranking evidence on main, 2026-09-30). The cause is one key guard, copied at
  three places in `PosterEditor.tsx`, that covers text fields but not SELECT.
- From fix 07's confirmer (2026-10-06), for items 6 and 12 to settle, not
  re-measured: in Playwright's Chromium and WebKit, ⌘Z with focus outside the
  figure checker's code box undid the pasted script (325 → 0 characters;
  Control+Z and Firefox: no change; real Chrome and Safari UNVERIFIED); and
  after one arrow nudge of an image on the Figure tab a keyboard undo did not
  move it back (x 778 → 785 → 785, 4 of 4, the "Undo" toast showing).
- Fix 07's image scan results (Figure › Check with an image block) are still
  the panel's state: lost on a tab change (2 rows → 0, MEASURED on the fix),
  and a second image shows the first one's rows (the FR8 family, items 15/17).
  A rerun costs an API call. Record 07 section 10.
- On main, from fix 07's round 2 reviewer (2026-10-06, MEASURED by it in
  Chromium, Firefox and WebKit, and on main 735636e in Chromium; the
  corrector read the code, INSPECTED): the editor's plot-checker code box
  traps the keyboard. With focus in it, Tab and Shift+Tab each insert two
  spaces and Escape does nothing, so "▶ Check", which follows the box, cannot
  be reached by keyboard after a paste (WCAG 2.1.2). The panel layout sets
  `tabIndents: true` (`poster/readabilityLayout.ts:52`) and the box's keydown
  handler cancels every Tab, Shift+Tab included (`ReadabilityPanel.tsx:126`).
  The public page does not intercept Tab. For an accessibility item: for
  example Escape leaves the box, or Tab indents only once the user turns it
  on.
- On main, found by fix 07's corrector (2026-10-06, INSPECTED, not run): a
  failed delete on the dashboard shows the raw error text ("Failed to delete
  poster: " and the database's message, `pages/Home.tsx:126-127` showing
  `data/posters.ts:464`), against the rule that user-facing errors stay
  generic.
- The "five steps in and five out" zoom test passes on its own when Zoom in
  does nothing; the 10× ceiling test in the same file catches that
  (MEASURED by the step 9 reviewer of 60ca7b3, mutant F6; it predates that
  change).

- **Item 4, the rulers, hidden by the owner (2026-09-30):** `RULERS_ENABLED`
  is off; the fix is parked on the local branch `editor/rulers-match-sheet`
  (its record, `ruler-check.mjs`, `ruler-sync-check.mjs` and a first
  `ruler-paint-check.mjs`). Open there: placing the marks by layout instead of
  a transform (the step 9-G critic's CG-1), a committed paint check (CG-3),
  and skipping its share scenarios while sharing is hidden. The ruler items
  above wait for it.
- **Fix 13, legend titles** are raised with legend text. Not a class the
  checker lists, so a policy for the owner: f32 at 4 × 3 in crosses 1.394 in²
  with the title raised against 0.208 left at 10 pt (record 13, section 10).
- **Fix 13, one layout pass:** at 4 × 3 in, f10 and f26 cross 1.131 and
  0.329 in² where a layout made at the needed sizes gives 0.918 and 0.274.
  Raise explicit sizes before the script's own `tight_layout`, or replay
  until the layout settles (record 13, section 10; neither measured on the
  whole set).
- **Fix 13, what counts as out of date:** the layout record counts centre
  titles, axis labels, legend and figure texts only; panel letters or tick
  labels changed after the layout are not replayed (a03, a06; record 13,
  section 10).
- **Record 24 review round 1, the refund button as an automated decision**
  (LOW, INSPECTED; the legal reading UNVERIFIED). Privacy §7 and §10 name
  the self-serve refund button as the one decision made only by automated
  processing, with review by a person on request by email. Law 25 s. 12.1
  asks that the person be told so no later than when they are told the
  decision, but the refusal messages (`profile/SubscriptionPanel.tsx:49-58`,
  stream B's Profile copy) say neither that the answer was automatic nor how
  to have a person review it. Owner decides: keep the exception and add a
  line to those messages (for example "This answer was given automatically.
  Email support@resila.ai to have a person review it."), or decide the
  button is not such a decision and drop it from Privacy §7 and §10.
- **Record 24 review round 1, the Terms line on the other sign-up paths**
  (INFO, INSPECTED). Accounts are also created from the editor ("Create
  account" in `poster/SecureWorkModal.tsx`) and from Profile
  (`profile/GuestConversionCard.tsx`); neither shows a Terms line in any
  language, while `/auth` does, in English and French.
- **Record 24 review round 1, the merchant of record** (LOW, UNVERIFIED).
  Under Managed Payments the code's comments call Stripe the merchant of
  record in four places (`apps/api/src/billing.ts:22,305`,
  `billing/refundReconcile.ts:3,21`) and Link in four others
  (`billing.ts:474`, `profile/SubscriptionPanel.tsx:4`,
  `data/billing.ts:146`, `pages/Profile.tsx:642`). The Terms and Privacy now name Stripe's
  merchant-of-record service without naming the seller. Check a sandbox
  receipt, then align the comments (and name the seller if wanted).
- **Record 24 review round 1, found in passing: a failed sign-out after a
  deletion** (LOW, INSPECTED, not measured). `runAccountDeletion` ignores
  the result of `signOut({ scope: 'global' })`; supabase-js 2.103.0 keeps
  the session in localStorage (`sb-<ref>-auth-token`, which holds a copy of
  the account record) when the sign-out request fails with anything but
  401, 403 or 404, a network error included. The Postr entries are cleared
  before it. Whether the next page load drops the dead session was not
  checked.
- **Record 24 review round 2, page counting is on by default** (owner
  decision; the legal reading UNVERIFIED). Vercel Web Analytics loads for
  every visitor whose browser does not send Global Privacy Control
  (MEASURED: a page view on 8 of 8 production page loads without GPC,
  `--live` 2026-10-06; the script on 3 of 3 pages without GPC in G1's
  control on this branch; the round-2 reviewer counted 57 of 57 on the
  production build, its own figure), and Vercel's documentation says it may
  record with each page view an approximate location (country, region,
  city), the device type, operating system and browser. The pages now say so
  (Privacy §6–§8, Cookies §4) instead of listing counting as a private
  default. Whether Law 25 s. 8.1 (a function that locates, off by default)
  or s. 9.1 asks for counting to be off until the visitor agrees is
  counsel's reading; turning it into opt-in (a consent choice before
  `<Analytics>` mounts) is the owner's call.
- ~~**Record 24 review round 2, the crawler copy of the legal pages**~~ FIXED in the
  merge of 24 with 25 (2026-10-06): the six legal entries of `seo/routes.json`
  now summarise the new pages (no region, Resila responsible, recipients in the
  pages' order, GPC, the rights, prices before tax, the 14-day refund, « lot
  d’exportation », « Fondation Wikimedia »; the Cookies entry no longer says the
  referring address is unchanged). Was (MEDIUM,
  INSPECTED; stream B's file). `apps/web/src/seo/routes.json`, which the
  build prerenders into the HTML of `/privacy` and `/privacy/fr` (what search
  engines and a visitor without JavaScript read), still says "Supabase
  (database, sign-in and file storage, in Oregon, United States)" and « en
  Oregon, aux États-Unis », a region the owner dropped (decision 10) and the
  Privacy Policy no longer states; `/privacy/fr` says « la Wikimedia
  Foundation » and `/terms/fr` « pack d’exportation », where the pages now say
  « Fondation Wikimedia » and « lot d’exportation ». Align the crawler copy
  with the pages (no region; the French terms).
- **Record 24 review round 2, after the deploy** (check, not a defect).
  `node scripts/analytics-privacy-check.mjs --live https://www.postr.sh`
  (from `apps/web`) must exit 0 once this branch is live: no analytics under
  GPC (L1), the page view's Referer the origin only (L2). On 2026-10-06,
  before the deploy, it exited 1 (L1 8 of 8, L2 6 of 6, every document
  `Referrer-Policy: strict-origin-when-cross-origin`; record 24, section 9).
- **Record 24 review round 2, for counsel: the Consumer Protection Act
  statements in the Terms** (LOW, UNVERIFIED legal reading). §5.5, §10, §11
  and §13's "continued use means you accept" are now each immediately
  preceded by a bold "The following clause does not apply to consumers in
  Quebec to the extent that Quebec’s Consumer Protection Act prohibits it."
  (s. 19.1, EN and FR). Counsel to confirm the wording ("to the extent")
  and the list: §4 (suspend or terminate "at our sole discretion") and §9
  (change or discontinue "at any time") may need it too; Terms §12 credits
  the CPA with the right to sue in one's own district, where the source is
  arguably the Code of Civil Procedure (art. 42) and the Civil Code
  (art. 3149), CPA s. 11.1 banning its restriction.
- **Record 24 review round 2, the guest button on `/auth`** (INFO,
  INSPECTED). "Start creating — no account needed" starts a guest session
  with no Terms line beside it; Terms §1 makes using the editor without
  signing up acceptance, and the `/auth` footer links the English Terms. The
  same holds for the landing page's way into `/p/new` (stream B). The Terms
  line now on `/auth` sits in the sign-in card, next to "Continue with
  Google".

### Queued by the claims audit (owner decisions, 2026-10-06)

The claims audit of 2026-10-05/06 (report artifact; its findings by claim id
in `audit-summary.json` of that session) found these product defects. The
owner's decisions of 2026-10-06 (record 24, `docs/fixes/24-legal-canada-law25.md`)
send them here: the copy now describes them honestly, and each is a
behaviour fix to rank. Every number below is the audit agent's (labels as
it gave them; not re-measured for this list, so UNVERIFIED here).

- **HIGH — the paid PowerPoint export leaves out charts made in the Figure
  tab, with no warning.** A 15-block poster with and without one chart block
  exports the same slide (18 shapes, 0 pictures, 1 frame), the chart's title
  and caption absent and the warning count unchanged (MEASURED by the audit,
  `g2-export-probe.mjs`; claims g2-…-88, g2-…-79). A paid feature.
- **HIGH — no screen to set a new password.** "Forgot password?" sends
  Supabase's recovery email (`Auth.tsx` `resetPasswordForEmail`, no
  `redirectTo`); the app has no `PASSWORD_RECOVERY` handler and no
  `updateUser({ password })` outside guest conversion, so the link at most
  signs the user in once and the password is never reset (INSPECTED by the
  audit; claim g2-…-59). Email accounts only. The /auth copy already says
  "we emailed it a sign-in link".
- **MEDIUM — a replace-import re-arranges the poster.** `ImportPosterModal`
  sets `postr.autoArrangeOnLoad` and the editor runs Auto-Arrange when the
  import lands: a `.postr` replace-import of the 48 × 36 template moved 13 of
  14 blocks (up to 310.9 units, about 31 in), control 0 of 14 (MEASURED by
  the audit, `g5vt/importpos.mjs`; claims g5-…-71, -76, -103). A second
  replace-import in the same editor mount leaves the flag set, which
  re-arranges that poster on its next open, over manual edits; a `.postr`
  backup is therefore not a restore.
- **MEDIUM — billing: a term renewal stays refundable after a re-export,
  and pack refunds are pooled.** `termRefundEligible` reads
  `first_paid_export_at`, stamped once ever, so an export taken after a
  renewal does not end that charge's refund (the code is more generous than
  Terms §7.2); `packRefundEligible` refuses every pack once any credit of
  any pack is spent, so a second pack bought after the first was used is not
  refundable before its own first export, and a pack holder with an active
  term has no self-serve pack refund (INSPECTED by the audit; claims
  g2-…-09, g2-…-29, g6-…-70, g6-…-72). Money: decide the rule, then make
  code and Terms match.
- **MEDIUM — the EU/UK withdrawal waiver is asked on one path and never
  recorded.** The checkbox is only in the editor's paywall
  (`EditableExportButtons.tsx`); `/pricing` → `/auth?plan=` → Stripe asks
  nothing, and no confirmation is stored (INSPECTED by the audit; claims
  g2-…-82, g6-…-78). Terms §7.2 already says a Pricing-page purchase is not
  asked and that the statutory right then applies regardless of use.
- **MEDIUM — retention clean-ups.** Nothing deletes feedback (kept after
  account deletion with `user_id` set null, including any console log the
  user chose to send, and, when a file was attached, its storage path, which
  starts with the account id: `storage://<account id>/feedback/…`, MEASURED
  in record 24's review round 1 from the feedback form; a deletion step in
  the API could remove that path from the text), the `account_deletions` audit rows, or API logs
  beyond the hosts' own retention; the orphan files of deleted guests are
  already queued (948 of 961 poster files belonged to users who no longer
  exist, MEASURED by the audit). The Privacy Policy states retention as it is
  (§9); a clean-up job would let it state periods.
- **MEDIUM — extend "Download my data".** `export_my_data` returns the
  account snapshot, posters, gallery entries and feedback only: not versions,
  logos, uploaded images, billing records or email choices (INSPECTED by the
  audit; claims g5-…-134, g7-…-58). The Privacy Policy offers the rest by
  email within 30 days (Law 25 s. 27 portability).
- **LOW — paid exports name Postr in their file properties.** The PPTX's
  `docProps/app.xml` Company and `core.xml` Subject say "made with postr.sh
  (https://postr.sh)" (`export/pptx/writer.ts`), while the visible mark is
  gone for paid exports (MEASURED by the audit; claims g2-…-21, -145).
- **Item 13 part 2, the plot checker's misses** (already queued; these are
  its sub-items from the audit, UNVERIFIED here): R sizes set with
  `theme(text = element_text(size = …))` and Python sizes set with
  `plt.xlabel(…, fontsize=…)`, `plt.xticks(fontsize=…)` or
  `plt.legend(fontsize=…)` are not read, so a too-small label passes (claims
  g3-…-04, -05); the R fix does nothing when the script's `theme()` comes
  after `theme_*()`; two sets of minimums exist (the code check's 18/14/12 pt
  and the image scan's and inserted charts' 24/18 pt; claims g3-…-07, -30,
  -45); inserted charts with a legend print their text at 14.9–16.8 pt.
- **LaTeX re-enable checklist** (the export is hidden by the owner,
  2026-10-06; stream B's flag). Before switching it back on: it may not
  compile (9 of 12 coloured text arguments contain a paragraph break, which
  `xcolor`'s `\textcolor` does not allow; INSPECTED by the audit, no TeX
  engine was available); it drops Figure-tab charts (MEASURED: 15 text
  blocks with and without a chart, claim g2-…-92); it needs XeLaTeX or
  LuaLaTeX (Overleaf's default is pdfLaTeX); side captions, cover-fit,
  crops and custom table borders are not reproduced (claim g2-…-157); the
  Terms, Privacy and Pricing copy must name it again (record 24 removed it).
- **Fix 25, Stripe's own text (an owner check):** the product names and
  descriptions Stripe shows on Checkout and on receipts come from the Stripe
  Dashboard, not the repo, so no test can read them. Whether they still name
  LaTeX is UNVERIFIED (fix 25's implementer and its round 1 reviewer, B-R1-04;
  `apps/api/src` has 0 strings naming LaTeX and sends no `custom_text`,
  MEASURED). The owner reads them in the Dashboard.

### Queued by fix 26 (the French public pages, 2026-10-06)

Record `docs/fixes/26-french-public-pages.md` section 10 has the detail and
the evidence label of each.

- **Owner checks before the French pages deploy.** (1) Supabase Auth →
  URL Configuration: the Redirect URLs must allow `/auth/fr` (a French
  e-mail sign-up's confirmation link comes back there, and a French Google
  sign-in that is buying a plan comes back to `/auth/fr?plan=…`);
  if they list exact paths, a French visitor lands on the Site URL instead
  (UNVERIFIED: the production setting is not in the repo). (2) Stripe
  Checkout with `locale: 'fr-CA'` under Managed Payments has not been run in
  the sandbox (UNVERIFIED; Stripe refused `custom_text` with Managed
  Payments, so a sandbox checkout from `/auth/fr?plan=term` should be tried
  once). (3) The Stripe Dashboard's product names and descriptions are
  shown on a French Checkout in whatever language they are written.
- **Still English on a French page:** the feedback form (`FeedbackModal`,
  opened from the French footer's « Envoyer une rétroaction » and the French
  About page's buttons), which the editor shares; Supabase's own error
  messages beyond the six the French sign-in page translates (others show a
  generic French line).
- **Out of the owner's scope for now (English only):** the editor and its
  panels, the dashboard, the profile, the emails Supabase, Stripe and the API
  send, and Stripe's own pages beyond the Checkout locale.
- **Owner question:** whether the French pages should say the editor is in
  English for now (they do not: fix 26 adds no claim the English pages do
  not make).
- **Found in passing, English pages (unchanged by fix 26):** at 320 px the
  English header wraps "Sign in" onto two lines and the wordmark touches the
  menu button (0 px apart on main and on the branch, in Chromium, Firefox
  and WebKit, English and French; 11.4 px French and 29.1 px English at
  360 px: review round 1, R1-10, the reviewer's measurement, not re-run);
  the crawler h1 of `/about` ("About Postr") and `/why-posters` ("Why
  poster sessions matter") is not the page's h1 (the French records use the
  page's h1).
  Below about 389 px the English landing's "Get started" and "Try as guest"
  shrink side by side and each label takes two lines (main's layout, kept:
  R1-01); stacking them is a design choice for the owner.
- **From review round 1 (record 26 section 9), not changed here:**
  (1) the French Terms §7.2 call the pricing page « Pricing », and the
  French page is now titled « Tarifs » (legal text; owner or legal decision,
  R1-07); (2) fix 24's `routes.json` crawler copy for `/terms/fr` and
  `/cookies/fr` says « prélèvement » and « fonctions » where the French
  Terms say « facturation » and « fonctionnalités » (the public pages were
  aligned, R1-03); (3) on main already: when Supabase answers an e-mail
  sign-up with the user and `is_anonymous: false` but no session (a pending
  confirmation, if GoTrue sends that field), `Auth.tsx` skips « Check your
  inbox » and sends one create-checkout request with no session (R1-09,
  the reviewer's measurement against a faked response, not re-run here; the
  production payload is UNVERIFIED): decide "pending" by `session === null` for
  sign-up, after checking a real sign-up response.
- **`poster/ReadabilityPanel.tsx` is 1,208 lines** (1,202 on main): splitting
  it (the result table and the fix box) is left for a change that can
  re-run fixes 07 and 15's mutant specs in full.

## LaTeX export: before it is switched back on

The owner hid the LaTeX export on 2026-10-06 ("unnecessary for now"):
`LATEX_EXPORT_ENABLED = false` in `apps/web/src/config/features.ts`, fix 25
(`docs/fixes/25-latex-hidden-prices.md`). The writer (`src/export/latex/`)
and its tests are kept; the button, its hint and its handler are behind the
switch in `poster/sidebar/EditableExportButtons.tsx`. Turning it back on is
this list, not a flip:

- **It compiles.** The claims audit (2026-10-06) could not show that the
  `.zip` compiles: compile `poster.tex` with XeLaTeX and LuaLaTeX on a set of
  real posters (every block kind, images, references, a 120 × 60 in sheet)
  and record the numbers before the button returns.
- **Charts.** The writer has no case for chart blocks (`latex/writer.ts`
  EMITTERS), and the button's hint says so; the PowerPoint export has the
  same gap (queued, HIGH). Decide the warning for both.
- **The copy fix 25 took out** comes back, each sentence checked against the
  code again: record 25 section 7 lists every string and where it was (main
  `e09c0ea` holds the old wording): the landing "Editable exports" card, the
  About "Iterate, export, print" card, the /pricing hero, the pricing cards,
  the paywall heading and body, the pack holder's credit line, the size
  notes (the too-big note's way out; the half-size note's LaTeX sentence is
  already behind the switch), the already-subscribed notices (`Auth.tsx`,
  `EditableExportButtons.tsx`), `/billing/success`, the guest's export
  modal, the profile's subscription panel (four strings),
  `PptxSizeLimitError`, the crawler copy (`seo/routes.json`: `/pricing`
  title, description and copy, `/auth`, `/dashboard`, `/billing/cancel`)
  and `index.html`'s description. The legal pages (Terms §7 and the privacy
  pages, EN and FR) name the paid exports too: stream A of 2026-10-06 owns
  their wording.
- **The tests that lock it hidden flip:** `poster/__tests__/latexHidden.test.tsx`
  (no button for any plan) becomes a test that the button is there for a
  paid user; `src/__tests__/copyInventory.test.ts` stops checking LaTeX by
  itself (`describe.runIf(!LATEX_EXPORT_ENABLED)`); the mutant spec
  `docs/fixes/25-latex-hidden-prices.mutants.json` part A is retired.
- **Prices still say tax is extra** on every new string, after the billing
  period ("CA$18.99 every 4 months + applicable taxes"; the inventory checks
  both whatever the switch).
- **Stripe's own text** (product names and descriptions in the Dashboard,
  shown on Checkout and receipts) is not in the repo; check it says the same.

## Handed on by finished fixes

Found while fixing one item, belonging to another (details in the record named):

- **Item 2**, from fix 01. **Both fixed by fix 02:**
  - Typing a size one key at a time dropped the credit mark. Typed sizes now
    apply when committed (cause D).
  - The Templates copy promised the content was kept. It now asks first and
    says it replaces (cause C).
- **Item 4**, from fix 02's review of cause A (MEASURED, and confirmed by a
  skeptic with its own instruments), updated by fix 03. The rulers ignore
  the flex centring and the 24 px ruler bar, so the 0" mark is off on any
  centred axis: 2 in horizontally and 9.5 in vertically on a 48 × 36 poster
  at 1440 × 900 before fix 03, up to 52 in on extreme shapes. Fix 03 made
  the ruler count from the gutter the workarea draws (`gutterX`/`gutterY`
  in PosterEditor.tsx, no longer a copy of 96), but not from the centring.
  On the centred axis, with the guidelines panel in the same state on both
  trees, the error grew: at 1280 × 800 on 48 × 36 in with the panel closed,
  −4 → −61.5 px; at 1920 × 1080 (panel open), −24 → −81.5 px (MEASURED
  with `fit-check.mjs`'s fit scenarios, `rulerError`, on both trees, by
  fix 03's step 11 audits). As the editor opens by default at 1280 × 800 it
  shrank instead (−124 px with main's open panel → −61.5 px), because the
  panel now starts closed. On the filled axis it is the bar's 24 px, before
  and after. Item 4 must re-measure at the shipped defaults. `fit-check.mjs` claim Hr
  guards the filled axis at 24 px; item 4 must update that guard. (Since 2026-09-30 the rulers are hidden, `RULERS_ENABLED`; Hr measures nothing and the run says so.)
- **Item 3**, same review: zoom-to-fit leaves 36 px of the limiting side out
  of view, and Zoom out zooms IN below its 0.3 floor. **Fixed by fix 03.**
- **From fix 03** (a summary; record 03 section 10 is the complete list,
  with numbers and labels):
  - owner questions: the 64 px gutter against block controls at large fitted
    zooms (the ZoomBar over a rotate control, a move control off the canvas,
    a rotated block hidden by 21–62 px, handles under the rulers in 2 → 4 of
    12 measured cases); the ring a mouse user sees after
    clicking a chrome button and pressing an arrow key; the readout on a
    0 px canvas; whether to install Firefox and WebKit for measuring;
  - MEDIUM, there before: the guidelines template `<select>` gives its
    arrow keys to the canvas, and Backspace in it deletes the selected
    block;
  - LOW, there before: zoom (pinch during the panel's slide, pinch over the
    ZoomBar, a Zoom out landing on the fit, a burst of 53+ wheel events,
    line-mode wheels), classic scrollbars, the rubber band's stored
    geometry, tour tooltips and resumes, the panel's missing
    `aria-expanded`, the collapsed sidebar's keyboard focus, a table cell
    that keeps Tab, "Comment on selection" with the sidebar collapsed, sidebar
    dialogs without `aria-modal` drawn inside the rail, PosterEditor's
    hooks after an early return, the phone share bars over the poster,
    read-only visitors seeing the guidelines rail, the `canvasOverflow`
    mechanism that never fires, a size change keeping a manual zoom, the
    fit's 5× cap against manual zoom's 10×, the undo toast straddling the
    sheet's bottom edge for 1.2 s, table handle rings at 20% opacity and
    three Figure-tab buttons' rings clipped, the fit lagging the sidebar's
    slide by one frame, and splitting `fit-check.mjs` (over 1,000 lines);
  - the critic's untested gaps: a production build, the tour during other
    modals, D's ring in dialogs and toasts, the 640 px share threshold
    crossed live, "a new poster size scrolls back to 0,0" in a browser (only
    jsdom), the quarter-cap zone below 1280 px, and the tour's keyboard
    path.
- **Unplanned, from fix 02's reviews** (MEASURED unless marked):
  - The area-comment label divides inches by 10 again ("Area 2×1 in" for a
    19.2 × 14.4 in area).
  - The print popup's on-screen view squeezes posters wider than about
    84 in (the PDF is fine).
  - The figure-size check's default rectangle is set for 48 × 36.
  - The drag guide's centre uses the stored height.
  - `PosterSizeKey` is just `string` (INSPECTED).
  - The 3-column template overflows sheets shorter than about 30 in.
  - Version restore drops the credit mark.
  - A legacy poster row whose `width_in`/`height_in` are stale is corrected
    only when the poster is next edited (autosave writes them). One that is
    opened and left alone keeps a cropped dashboard card. Fixing it needs a
    write on open, or a migration.
  - The mutation checker's unloaded-file guard has no committed self-test,
    and its two conditions overlap (checked by hand in both reviews).
  - The credit-mark scan tries only rows maxY − 6k and columns M + 6k (plus
    the last row and column), so it misses a free band 12–17 units tall
    that holds no scan row. Sweep of 347,760 moves (4 templates minus one
    block, every whole-inch sheet from 10 to 100): the mark was dropped
    19,890 times, 7,442 of them with a legal spot; main misses all of these
    too (fix 02 re-check, BG-5). Candidate positions at block edges found
    the room.
  - **Data loss (fix 02, last-round verification L-2, MEASURED in
    Chromium, on main too):** clicking "Open copy" after Duplicate within
    about 0.5 s of the last keystroke loses the typing on the original.
    `useAutosave` drops the pending save when the poster id changes while
    the editor stays mounted (the unmount flush never runs). Belongs with
    items 8–11 (saves).
  - **Test instrument:** the editor measures each block frame's computed
    height. In jsdom a fixed-height frame reads its stored height, but a
    frame that grows with its content (text, captioned images) reads "auto"
    and falls back to offsetHeight, 0. So jsdom tests of ISSUES geometry see
    growing blocks as 0 tall, and a changed height stays stale because the
    ResizeObserver stub never fires. Fix 02 models a browser's readings
    (`measureAs`, `FiringResizeObserver` in posterSize.test.tsx); other
    suites' ISSUES tests have not been checked for tests that pass for
    these reasons.
- **Items 3 and 4**, from fix 01's second confirmer and review 2: a
  custom-size poster was drawn, laid out and checked as 48 × 36. **Fixed by
  fix 02, cause A**; it was a separate cause from the ruler and Fit offsets
  above.
- **New, unplanned**, from fix 01's second confirmer (UNVERIFIED here). The
  default 3-column template at 48×36 never gets a credit mark, because its
  column bottoms (338.8–342.2) overlap the bottom band the mark needs
  (338–350).
- **Item 12**, from fix 01:
  - ⌘Z with focus in a sidebar input runs the browser's native undo, which
    reverted canvas typing; a second ⌘Z brought it back. MEASURED in Chromium.
  - The caption-spacing slider goes through `updateBlock` unkeyed: 60 events
    make 50 history entries. MEASURED on main.
  - Version restore resets history, and drops the credit mark (review 2,
    MEASURED; this contradicts the comment at `Editor.tsx:182-185`).
  - Edit-tab caption and note text, and caption spacing, go through
    `updateBlock` unkeyed. 10 events make 10 steps, and a 60-character
    caption pushes older work out of the history (review 2, MEASURED).
  - Auto-Arrange with font scaling takes 3 undo steps (review 2, MEASURED).
- **Unplanned, possible data loss** (review 2, INSPECTED only).
  `migrateBase64ToStorage` calls `setBlocksSilent` with the load-time blocks,
  which would overwrite edits made while images upload. Reproduce before
  planning.

## Checked and retired

- F8 "text clipped in print": 0 of 14 blocks clipped. Only content past the sheet
  bottom is cut, and ISSUES already warns.
- F5 "a whole column hidden": no; 21% of one column, a constant 36 px.

## Status

| # | Branch | State |
|---|---|---|
| 1 | `editor/undo-sidebar-history` | done — `docs/fixes/01-sidebar-undo-history.md` |
| 2 | `editor/custom-sheet-size` (causes A, E), `editor/size-change-keeps-blocks` (B–D) | done — `docs/fixes/02-poster-size.md` |
| 3 | `editor/fit-whole-sheet` (A, B), `editor/guidelines-closed-small-screens` (C, D, and A and B's review follow-ups) | done — `docs/fixes/03-fit-whole-sheet.md`; the owner answered its questions on 2026-09-30 (items 19–22; Firefox and WebKit engines installed) |
| 23 | `fix/new-poster-owner-only` | done — `docs/fixes/23-new-poster-owner-only.md`; sharing and comments hidden (`SHARING_ENABLED`) |
| 4 | `editor/rulers-match-sheet` (local, parked) | hidden — the owner hid the rulers on 2026-09-30 (`RULERS_ENABLED`, `config/features.ts`); the fix is parked unmerged with its record, instruments and open review findings |
| 13 | `checker/python-reads-own-fix` | part 1 done — `docs/fixes/13-checker-reads-its-own-fix.md` (the fix raises the text it saves, and its re-check reads it); part 2, the parser's own misreads, not started |
| 7 | `fix/07-figure-script-kept` | done (three review rounds); review round 1 answered (a blank-line regression fixed, tests added, legal copy corrected); round 2 answered (a result checked against an image block is no longer shown under the preview's size, and a kept result says the size it is for; a long script edited after its Check stays stored); round 3 answered (a note no longer promises an image check comes back) — `docs/fixes/07-figure-script-kept.md`; the owner's decisions of 2026-10-06: the script kept per poster in this browser and re-checked on return, sessionStorage on the public page, Check stays up once a script is in, and the same cause fixed in the Authors, References, Make-a-figure, poster-name and version-name drafts (memory only) |
| 15 | `fix/15-checker-language` | done (three review rounds) — `docs/fixes/15-checker-language.md` (Check answers when it cannot tell R from Python; unsupported plotting systems are named, not scored; a result on screen stays, marked out of date, and one a new print size hides is said to be hidden; detection reads live code only, re-landing 9ea9f38; a string in `aes()` or seaborn's `barplot()` places nothing on its own: code with only such a token gets the could-not-tell answer (an R package name such as `library(tidyverse)` is an R signal and is checked as ggplot2)) |
| 24 | `fix/legal-canada-law25` | done (three review rounds; round 3 found nothing left) — `docs/fixes/24-legal-canada-law25.md`: the Privacy, Cookies and Terms pages (EN and FR) rewritten for Quebec's Law 25 and PIPEDA first, Global Privacy Control honoured, poster ids kept out of the analytics address and its Referer, the feedback console log opt-in, account deletion clearing every Postr browser entry, the French Terms linked at sign-up; internal file `docs/legal/quebec-law-25.md`; the claims audit's product defects queued above |
| 25 | `fix/latex-hidden-prices` | one review round (browser and entry points), answered: the `/auth?plan=term` label puts the period before the tax note, a stale code comment reworded — `docs/fixes/25-latex-hidden-prices.md`; the owner's decisions of 2026-10-06: the LaTeX export hidden (`LATEX_EXPORT_ENABLED`, `config/features.ts`; before it returns: the section above), every price shown says tax is extra, the landing "Editable exports" card says the export is paid; a copy inventory test keeps both true |
| 26 | `feat/french-public-pages` | implemented, review round 1 done and corrected (one round: a simple feature; 12 findings: 7 corrected, 1 left to the owner, 4 informational) — `docs/fixes/26-french-public-pages.md`; the owner's decision of 2026-10-06 (Quebec, Bill 96): every public page in French at its path + `/fr` (`/fr` for the landing page, `/auth/fr?plan=term`), its language read from the URL, a « Français » / "English" link on every page, the French heads with hreflang and the French pages in the sitemap, a French Stripe Checkout from `/auth/fr`; the editor stays English; queued above: "Queued by fix 26" |
