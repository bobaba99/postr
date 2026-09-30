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
- **Item 10, outside the MVP scope (2026-09-30):** the crash screen claims the
  work is safe when it may not be (MEASURED with a synthetic crash only); its
  "Try again discards unsaved work" part moved into item 8.
- **Item 11, outside the MVP scope (2026-09-30):** losing the session mid-edit
  (MEASURED only with a forced refresh refusal; no first-session path found);
  its parts moved into items 8 and 9.
- **Item 17, outside the MVP scope (2026-09-30):** "Copied" when copying
  failed, Scan image silent on an empty placeholder, a stale language label
  (MEASURED); the label may be absorbed by item 15.
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
