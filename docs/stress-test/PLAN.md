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

- Poster gutter 64 px (owner decision; fix 03 measured handles still under the rulers at large fitted zooms, 4 of 12 cases, record 03 section 10).
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
| 9 | Error screens show DB text, no way out | dead end | S-M | F7a/b/e/f |
| 10 | Crash screen claims "work is safe" when it may not be | wrong result | S | F7g |
| 11 | Losing the session mid-edit closes the editor | loses work | L | F7d |
| 12 | PowerPoint-style undo (text undo goes to the browser today) | looks broken | L | F2 |
| 13 | Checker can't read its own Python fix; per-element rcParams ignored (re-lands 1.0x ticks) | wrong result | M | W1, W2 |
| 14 | seaborn contexts / style sheets misread | wrong result | M | W3 |
| 15 | Check does nothing when it can't tell R from Python (re-lands detection) | dead end | S-M | W4 |
| 16 | R fix attached to print(p) passes but changes nothing | wrong result | M | new |
| 17 | "Copied" on failure, empty Scan image, stale language label | annoyance | S | W4 siblings |
| 18 | Run every corrected script in real R and Python | prevents repeats | M | new |

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
| 3 | `editor/fit-whole-sheet` (A, B), `editor/guidelines-closed-small-screens` (C, D, and A and B's review follow-ups) | done — `docs/fixes/03-fit-whole-sheet.md`; four owner questions open (section 10) |
| 23 | `fix/new-poster-owner-only` | done — `docs/fixes/23-new-poster-owner-only.md`; sharing and comments hidden (`SHARING_ENABLED`) |
| 4 | `editor/rulers-match-sheet` (local, parked) | hidden — the owner hid the rulers on 2026-09-30 (`RULERS_ENABLED`, `config/features.ts`); the fix is parked unmerged with its record, instruments and open review findings |
