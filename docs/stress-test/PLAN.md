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

- Poster gutter 64 px (smallest measured value with no handles under rulers).
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

- **Item 2**, from fix 01:
  - Typing a height one key at a time ("2", "24") drops the credit mark until
    the poster is reopened, and the saves in between have no mark. The field
    accepts any value above 0 despite `min={10}`, and `replaceAckBlock` never
    re-adds a dropped mark. MEASURED on main, 3/3 in Chromium.
  - Layout › Templates says content is kept, but applying a template discards
    it.
- **Items 3 and 4**, from fix 01's second confirmer and review 2: two
  independent reports, neither reproduced here yet.
  - A custom-size poster is drawn on the preset 48×36 canvas: a 48×24 poster
    rendered 480×360 units.
  - Templates and Auto-Arrange lay out for 48×36 on a custom sheet, putting
    10 of 15 blocks past the edge of a 30-inch-wide sheet.
  - The suspected cause of both is `findSizeKey`'s fallback. Check it first
    when reproducing the ruler and Fit offsets.
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
