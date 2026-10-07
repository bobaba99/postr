# Open editor findings, sorted by the blank-to-export path

Input for the MVP editor doc (owner's direction, 2026-10-07): copy PowerPoint's
controls and layout, keep only what takes a poster from blank to export, keep
decisions few, and make font size, theme and layout bulk edits.

**What was read.** `docs/stress-test/PLAN.md` (order, status, queue, Later list),
`docs/launch/owner-followups.md`, `docs/fixes/README.md`, section 10 of each record
(01, 02, 03, 07, 13, 15, 19, 23, 24, 25, 26), `FINDINGS.md` and `TRIAGE.md`
(2026-09-13), the plan page (claude.ai artifact `Uip1hzXaK9ssopFvzwH755`, items 5,
6 and 8), and the in-flight work: branch `fix/12-one-undo-history` at `5af43b8`
(record 12 and its PLAN.md), the uncommitted changes in the `fix12-wt`,
`charts-wt` (`fix/13p2-chart-text`) and `fix13p2-wt` (`fix/13p2-checker-sizes`)
worktrees as they stood when read, and the scratchpad notes `item13p2-decisions.md`
and `item13p2-repro-confirm.json`. Code line numbers are on main `f554eaa` unless
a tree is named.

**Evidence labels.**
- `Rec: MEASURED / INSPECTED / UNVERIFIED (where)`: the source's own label. **Not
  re-run in this pass**, so to this pass every `Rec:` line is UNVERIFIED.
- `INSPECTED here (file:line)`: read in this pass; nothing run. May be wrong.
- `MEASURED here`: a grep count run in this pass.
- `PPT (knowledge)`: how PowerPoint behaves, from general knowledge, not checked
  against a running copy.

**Severity.** The source's grade where it gave one. Otherwise mine, marked
"(mine)": HIGH = an ordinary user loses work or gets a wrong print or export on
the main path; MEDIUM = a visible failure or dead end on the main path, with a way
round it; LOW = rare, cosmetic or an edge case.

**MVP or customization.**
- **MVP**: breaks a blank-to-export step or the safety net under every step.
- **Custom**: exists only because of a per-element adjustment surface (rotate,
  crop, groups, per-run colour, row and column editing, rulers, the guidelines
  panel, extreme zooms, the collapsed sidebar). Hiding the surface retires the
  finding; fixing it is optional.
- **Out**: not the editor's blank-to-export path (account, billing, legal,
  sharing and comments, which are hidden, the plot checker's internals).

---

## 0. Two things to settle first

1. **The plot checker.** The owner's message today says "we already stopped the
   readability check feature", while the task brief lists item 13 part 2 as in
   flight. That work has two streams. Stream P is the checker's reading: the
   owner's bounded regex rule table, with uncommitted harness, corpus and new
   `readabilitySource.ts` / `readabilityTypes.ts` / `imageBox.ts` in `fix13p2-wt`.
   Stream Q is the inserted charts' text and caption layout: uncommitted
   `chartLayout.ts`, `figureTextMinimums.ts` and changes to `ChartBlock.tsx` and
   `renderChart.ts` in `charts-wt`. If the checker is stopped, stream P stops, and
   every checker row below (section 7.1) is listed only for completeness. Stream Q
   is about chart **blocks** on the poster. It stays only if "Make a figure"
   (chart blocks) stays in the MVP: see OF-09 and OF-10. Who decides: the owner.
2. **Item 12 is not on main, and the brief describes uncommitted work.** The branch
   head `5af43b8` (2026-10-06 23:40) still draws the Undo/Redo buttons over the
   workspace's top-left. The top bar (`EditorTopBar.tsx`) and "every drag one
   step" (`dragStep.ts`, `undoDragSteps.test.tsx`) exist only as uncommitted files
   in `fix12-wt`. Their PLAN.md row is uncommitted too, and record 12 §11 does not
   yet describe them (INSPECTED here: the record's working diff changes only line
   references). The record's own status still has review round 4 next (a re-check
   of round 3's keyboard change). **"Every drag" leaves out group drags.**
   `handleGroupDragEnd` still commits the dragged positions as the undo point, on
   main and in `fix12-wt` (INSPECTED here: `PosterEditor.tsx:1465-1473` in both
   trees). That is item 6 (OF-06).

---

## 1. The path, step by step

| step | what the user does | PowerPoint analogue (PPT, knowledge) |
|---|---|---|
| S1 Start | open `/p/new` (guest session), choose sheet size and template | New presentation, Slide Size, Layout |
| S2 Theme | palette, font, text sizes per level (bulk) | Design › Themes / Variants, Slide Master fonts and sizes |
| S3 Header | title, authors, affiliations, logo | title placeholder, insert picture |
| S4 Text | type and paste section text, line breaks, bold/italic/lists | type in placeholders |
| S5 Figures | insert or replace an image (or a chart), caption | Insert › Pictures / Chart |
| S6 Tables | paste a table, edit cells | Insert › Table, paste |
| S7 Arrange | select, move, resize, Auto-Arrange, Fit and zoom | drag, Arrange, Zoom to fit |
| S8 References | add the reference list | text box |
| S9 Safety net | undo and redo, autosave, reload, duplicate, versions | Undo/Redo in the Quick Access Toolbar, AutoSave |
| S10 Check | ISSUES panel, Preview | slide show preview |
| S11 Export | Save PDF / print (free), PowerPoint (paid), `.postr` backup | Save as PDF / Print |

## 2. What is open at each step (MVP rows only)

| step | HIGH | MEDIUM | LOW |
|---|---|---|---|
| S1 | (OF-18 Later: a room on one network can be refused guest sessions) | OF-14 (3-column template at short sheets) | OF-25 |
| S2 | none found | OF-11 (a dropdown key deletes the selected block) | OF-24 |
| S3 | none found | none found | OF-26 (authors without affiliation ids, UNVERIFIED) |
| S4 | **OF-01** Enter not saved | OF-02 text colour not saved | none found |
| S5 | OF-10 (chart blocks only) | OF-21 (image upload race, UNVERIFIED) | none found |
| S6 | none found | OF-12 (Delete on a strip removes the table; Custom) | OF-13, OF-28 (UNVERIFIED) |
| S7 | none found | OF-06 group move not undoable, OF-11 | OF-19 stored-geometry tools, OF-20 Auto-Arrange 3 steps |
| S8 | none found | none found | none found |
| S9 | **OF-05** a failed save counts as saved; **OF-04** "Open copy" loses typing | OF-03 Back from a copy overwrites the original, OF-15 replace-import (not on the blank path), OF-21 | OF-22, OF-23, OF-27 |
| S10 | **OF-07** Preview → print overlaps title and authors | none found | none found |
| S11 | **OF-07**; **OF-09** PowerPoint export drops charts (chart blocks only) | OF-08 selection controls copied into the print document | OF-16, OF-17 |

Item 12 (in flight) underlies every step's safety net: section 3.

---

## 3. In-flight work

### 3.1 Item 12: one undo history (branch `fix/12-one-undo-history`, not merged)

**State** (record 12 status line and §8 to §11 at `5af43b8`; the PLAN.md row in
`fix12-wt`). Steps 1 to 8 done. Review rounds 1 to 3 answered; round 4 (a re-check
of round 3's keyboard change) next. Main `f554eaa` merged in. Tests at the merge:
web 3924 of 3924, `undo-history-check.mjs` 0 of 70 / 62 / 62 claims observed in
Chromium / Firefox / WebKit, 120 of 120 mutants killed. Rec: TESTED / MEASURED
(record 12 §11). Then the merge review's F1 and F2 were answered, uncommitted, in
`fix12-wt`: every drag of a crop edge, a column width or the two Edit-block sliders
is one step (one crop gesture had emptied the 100-step history), and Undo/Redo
moved into a new 44 px top bar (`EditorTopBar.tsx`, `TOP_BAR_HEIGHT = 44`,
INSPECTED here in `fix12-wt`). Before the top bar, the button group lay on a
top-left block's handle row in 8 of 624 selections at the fit. Rec: MEASURED
(record 12 §11, three engines).

**Matches the direction.** PowerPoint keeps Undo and Redo in a bar at the top of
the window (PPT, knowledge). The A+/A− and alignment buttons, which never saved,
are removed. Text size is set per level (title, heading, body) in the Edit tab,
which is the bulk edit the owner asked for: record 12 §10 lists per-block size
and alignment as a possible new feature, and the direction answers that: **no**.

**Open from record 12 (owner questions and limits), with my classification:**

| id | finding | severity | step | class | evidence |
|---|---|---|---|---|---|
| U-1 | Group move/resize is still not a step: the first ⌘Z after a group drag does nothing visible (item 6, OF-06) | MEDIUM ("looks broken") | S7 | MVP if multi-select stays | INSPECTED here `PosterEditor.tsx:1465-1473` (main and `fix12-wt`) |
| U-2 | Importing a `.postr` over the open poster still wipes the history (`setPoster`) | LOW (mine) | S9 | Out (not on the blank path) | Rec: INSPECTED (record 12 §10) |
| U-3 | A keyboard press of Undo/Redo keeps focus on the button and selects nothing; ⌘Z and a mouse press put the caret back (decisions 4 and 5 meet) | LOW, owner choice | S9 | MVP (decide once) | Rec: MEASURED (record 12 §9 R2-F2) |
| U-4 | After a mouse click on Undo, arrows and Delete do nothing until the poster is clicked (focus stays on Undo in Chromium and Firefox on the Mac) | LOW | S7 | MVP (decide once) | Rec: MEASURED (fix12-wt PLAN.md, merge review finding 7) |
| U-5 | Ctrl+Y is redo on a Mac, so the system's Ctrl+K / Ctrl+Y yank no longer works in a text block | LOW | S4 | owner choice | Rec: INSPECTED (record 12 §10) |
| U-6 | Each composed CJK word is a step; text typed with no input method in scripts without spaces (Thai, Lao, Khmer, Burmese) follows the space rule, so a sentence is one step | LOW | S4 | Later | Rec: INSPECTED (record 12 §10) |
| U-7 | A cancelled composition leaves a step that changes nothing and drops the redo | LOW | S4 | Later | Rec: MEASURED in Chromium (record 12 §9) |
| U-8 | A word dragged within a block is probably two steps | LOW | S4 | Later | Rec: INSPECTED, no engine could drive it (record 12 §10) |
| U-9 | Undo during crop restores the stored crop but the crop frame stays put until Apply (stored right crop 30.4 % → 25.3 % → 0, edge drawn at 69.3 % throughout) | LOW | S5 | Custom (crop) | Rec: MEASURED, three engines (fix12-wt PLAN.md) |
| U-10 | WebKit: forward Delete on a focused Undo deletes a character in a text block ("ZQSENT4 …" → "QSENT4 …") and drops the redo; Backspace on a focused button goes back in history and leaves the editor in Playwright's WebKit | LOW (Safari UNVERIFIED) | S9 | Later | Rec: MEASURED in Playwright WebKit (fix12-wt PLAN.md; record 12 §10 B3w) |
| U-11 | The delete / nudge keys' own dialog guard (`modalDialogOpen`) has no test since ⌘Z left that handler; its mutant survives 3906 of 3906 tests | test gap | none | Later | Rec: TESTED by the merge reviewer (fix12-wt PLAN.md) |
| U-12 | Physical keyboards, the real Edit and right-click menus, Windows, iPad: not measured; manual flow 29 is the owner's check | verification gap | S9 | MVP (owner check) | Rec: UNVERIFIED (record 12 §10) |
| U-13 | Auto-Arrange with font scaling takes 3 undo steps (also OF-20) | LOW | S7 | MVP (bulk layout) | Rec: MEASURED in fix 01 review 2; not re-measured after 12 (record 12 §10) |

**Fixed by item 12 once merged** (so not listed again below): ⌘Z in text and in
sidebar fields going to the browser; redo after leaving a block; table cells typing
backwards; 50 → 100 steps; "Undo" shown on an empty history; version restore
wiping the history and dropping the credit mark; A+/A− and alignment that never
saved; caption and note flooding the history; ⌘Z right after a typed sheet size
(record 02 §10). Rec: TESTED / MEASURED (record 12 §7, §8).

### 3.2 Item 13 part 2 (branches `fix/13p2-checker-sizes`, `fix/13p2-chart-text`; no commits past main)

Both branch heads equal `f554eaa` (MEASURED here: `git log f554eaa..<branch>` is
empty); the work is uncommitted in the worktrees.

- **Stream P, the checker's reading.** The owner's design of 2026-10-07: a short
  regex rule table read by character position, last match wins, missing settings
  warned about and set explicitly in a full replacement script, plain in-place
  edits instead of part 1's runtime machinery (`item13p2-decisions.md`).
  Reproduction on `f554eaa`: first-check false passes 74 and false greens on
  re-check 48 on the extended Python corpus; R false passes 24. Rec: MEASURED by
  the item 13p2 reproducer (real matplotlib 3.10.8, seaborn 0.13.2, ggplot2
  4.0.3). Its open defects are in section 7.1. **Its fate depends on question 0.1.**
- **Stream Q, inserted charts** (OF-10): the caption, including "Sample data, not
  real results.", is hidden in 107 of 126 chart sizes (shown in 1 of 21 at the
  default 10 × 7). The x-axis title is clipped in 102 of 120 and the x tick labels
  in 40 of 126; the chart box runs up to 1.21 in past the block's clipping box; and
  with a legend the text prints at 13.60–17.74 pt against the chart's own 18 pt.
  Rec: MEASURED by the reproducer (editor; print path: the confirmer measured the
  print HTML equal to the editor, 20 of 20). The fix in progress lays the legend
  out inside the box and gives chart blocks the image blocks' caption chrome
  (INSPECTED here: `charts-wt` `chartLayout.ts` header). It also merges the
  minimums into one set: 18 pt titles, 14 pt ticks and legend, 12 pt captions
  (`figureTextMinimums.ts` header).

---

## 4. Open MVP findings (core path)

| id | finding | severity | step | state | evidence |
|---|---|---|---|---|---|
| **OF-01** | **Enter in a text block is not saved as a line break.** The browser puts the new line in a `<div>`, which the save flattens with no separator: " ZQA", Enter, "ZQB" is stored as "…ZQAZQB". The screen keeps two lines until the block is drawn again from the store (a reload; since fix 12 an undo of it); exports built from the store join the words. PowerPoint keeps a new paragraph (PPT, knowledge). | HIGH (mine; the words of a multi-paragraph section run together after a reload) | S4 blocks; S11 | On the Later list only on the fix 12 branch, as "a text-formatting item, not undo"; **not in main's PLAN.md** | Rec: MEASURED in 3 engines, main and fix 12 (record 12 §10). INSPECTED here: the typing commit calls `sanitizeHtml(el.innerHTML)` with no separator (`RichTextEditor.tsx:171`), while the paste path passes `blockSeparator: multiline ? '<br>' : ' '` (`:252-255`); `DIV` is a block tag the sanitizer flattens (`sanitizeHtml.ts:42-51`) |
| OF-02 | **Text colour from the selection toolbar is never saved** (it changes the screen only). The A+/A− half of the same finding is removed by fix 12. | MEDIUM (record 23) | S4 | Record 23 §10 says "a new plan item"; **no plan item exists** (MEASURED here: `R2-P2` appears only in record 23) | Rec: MEASURED by the R2-P2 skeptic, main the same (record 23 §9). Cause UNVERIFIED. A hypothesis to test: `execCommand('foreColor')` (`FloatingFormatToolbar.tsx:202-204`) emits a tag the sanitizer drops. The allowlist has no `FONT` (`sanitizeHtml.ts:53-78`), `styleWithCSS` is never set (MEASURED here: 0 hits in `apps/web/src`), but the sanitizer's own comment says foreColor emits a `span` (`:28-29`). Under the direction, per-run colour is a customization: fix it or remove the swatches |
| **OF-03** | **Back from an edited copy writes the copy's text into the original poster.** | MEDIUM, data loss (record 23) | S9 | Record 23 §10: "a new plan item (data loss in the MVP editor)"; **not in PLAN.md** (MEASURED here: `R2-P1` appears only in record 23) | Rec: MEASURED by the R2-P1 skeptic, main the same (record 23 §9) |
| **OF-04** | **"Open copy" within about 0.5 s of typing loses that typing on the original** (lost at 211 and 503 ms, kept at 1,600 ms). | HIGH (mine; record 02 calls it data loss) | S9 | PLAN.md "handed on", assigned to items 8–11 | Rec: MEASURED in Chromium, main too (record 02 §10, L-2). INSPECTED here: a poster-id change drops the pending save (`useAutosave.ts:287-298`) and the editor stays mounted, so the unmount flush never runs |
| **OF-05** | **Item 8: a failed save is treated as saved.** The pill turns red once; the save is never retried unless the user edits again; closing the tab gives no warning; Save still reports success. | HIGH ("loses work", plan) | S9 | Plan item 8, last in the ranked order; carries 10's "Try again discards unsaved work" and 11's "a refused save is blamed on the connection" | Rec: MEASURED in the 2026-09-27 planning round, re-measured on main 2026-09-30 (plan page item 8; PLAN.md re-ranking). INSPECTED here: the pending doc is cleared before the request (`useAutosave.ts:206-209`), and the failure path only sets `status: 'error'` (`:251-279`), so nothing is left to retry. Sibling, INSPECTED here, not measured: Duplicate awaits `flushNow`, which never throws (`useAutosave.ts:17-18`), so after a failed save it copies the older database row (`PosterEditor.tsx:1147-1148`), and its error branch shows the raw message (`:1151-1152`) |
| OF-06 | **Item 6: a group move or resize cannot be undone**; the first ⌘Z quietly uses up the step. PowerPoint undoes a multi-selection move in one step (PPT, knowledge). | MEDIUM ("looks broken", plan) | S7 | Plan item 6; not covered by fix 12's "every drag one step" | Rec: MEASURED, fix tested in the planning round ("a three-line change", plan page item 6). INSPECTED here: `PosterEditor.tsx:1465-1473` commits `outerBlocksRef.current` and never writes `groupDragOrigin` back first. Custom if the owner drops multi-select |
| **OF-07** | **Item 5: printing from Preview runs a long title into the authors**: 0.33 in for a 3-line title at 48 × 36, 1.9 in for a 4-line title at 36 × 48. Preview is the first thing the Export tab offers; printing straight from the Export tab is fine. | HIGH ("wrong result", plan) | S10, S11 | Plan item 5 | Rec: MEASURED in the planning round (plan page item 5). INSPECTED here: the title's extra height is read from `el.offsetHeight` with no guard for a hidden editor (`PosterEditor.tsx:1048-1050`); Preview hides the editor (`display: none`, `PosterEditor.tsx:2397`) |
| OF-08 | **Save PDF with a block selected copies its selection controls into the print document** (8 handles, the handle row and the rotate control). Whether they show in the PDF was not measured. | MEDIUM (mine; UNVERIFIED in the PDF) | S11 | PLAN.md Later (from fix 19) | Rec: MEASURED in Chromium, main and fix 19 (record 19 §10). INSPECTED here: `printPoster` removes only `[data-postr-overlay]` (`PosterEditor.tsx:2347`) |
| OF-09 | **The paid PowerPoint export leaves out Figure-tab chart blocks, with no warning** (15 blocks with and without a chart: the same slide, 18 shapes, 0 pictures). | HIGH (claims audit) | S11 (paid) | PLAN.md queue (claims audit) | Rec: MEASURED by the claims audit (`g2-export-probe.mjs`). INSPECTED here: the writer's block switch has no `chart` case (`export/pptx/writer.ts:658-682`), while `BlockType` includes it (`packages/shared/src/types/poster.ts:9-18`). Applies only if chart blocks stay |
| OF-10 | **Inserted charts clip their caption (with the "Sample data" label), x-axis title and tick labels**, and print text below their own 18 pt (numbers in 3.2). | HIGH for the hidden sample-data label (decision 6, "a truthfulness matter"); MEDIUM otherwise | S5, S11 | In flight (stream Q, uncommitted) | Rec: MEASURED by the 13p2 reproducer and confirmer. Applies only if chart blocks stay |
| OF-11 | **Item 22: with a block selected, keys on a focused dropdown reach the poster.** Backspace deletes the block (7 of 7) and the arrows move it (7 of 7); ⌘Z restores it (6 of 6). The Edit tab's Weight dropdown is the likeliest path; the guidelines template `<select>` does the same (record 03, MEDIUM). | MEDIUM (record 03) | S2, S7 | Parked on the Later list by the owner (2026-09-30) | Rec: MEASURED by the ranking evidence on main. INSPECTED here: the guard covers INPUT, TEXTAREA and contenteditable, not SELECT (`PosterEditor.tsx:2204-2209`). Fix 12 adds the Undo/Redo buttons to the guard only (`onHistoryButtons`) |
| OF-12 | **Delete or Backspace with a table row or column selected by its strip removes the whole table**; one ⌘Z brings it back. | MEDIUM (mine) | S6 | Owner 2026-10-07: advanced table editing goes to Later (fix12-wt PLAN.md) | Rec: MEASURED by the fix 12 merge reviewer (`table-keys.mjs`, 3 engines); TESTED in jsdom on main. Custom: the row and column strips are the surface; hiding them, or making Delete do nothing while a strip is selected, retires it |
| OF-13 | The table's right-click menu shows "Insert row below", "Delete column" and "Clear cell", and **they do nothing**; Edit block's table editor removes only the last row or column. | LOW (mine; a control that does nothing) | S6 | Later (owner, 2026-10-07) | Rec: MEASURED by the merge reviewer (`ctxmenu.mjs`, Chromium, WebKit). INSPECTED here: menu items `blocks.tsx:1388-1396`; `deleteRowAt(data, data.rows - 1)` / `deleteColAt(data, data.cols - 1)` (`Sidebar.tsx:3475`, `:3499`). Custom: remove the menu items or wire them |
| OF-14 | The default 3-column template overflows sheets shorter than about 30 in. Bulk layout has to work at every size the size field accepts. | MEDIUM (mine) | S1 | PLAN.md "handed on" (fix 02) | Rec: MEASURED (record 02 §10, PLAN.md) |
| OF-15 | A replace-import of a `.postr` re-arranges the poster: 13 of 14 blocks moved, up to 310.9 units (about 31 in). A second replace-import in the same editor leaves the flag set, so that poster is re-arranged on its next open, over manual edits; a backup is not a restore. It also wipes the undo history (U-2). | MEDIUM (claims audit) | S9 (backup) | PLAN.md queue | Rec: MEASURED by the claims audit (`g5vt/importpos.mjs`). INSPECTED here: `ImportPosterModal.tsx:304` sets `postr.autoArrangeOnLoad`; `PosterEditor.tsx:2091-2104` runs once per mount. Out of the blank path; data integrity for returning users |
| OF-16 | The free PDF always carries the colophon, paid or not; the code comment still says "Paid tier does not exist yet". | LOW, owner policy | S11 | manual-test-flows "Still open" §22 | INSPECTED here: `PosterEditor.tsx:2375-2377` (`attribution: {}`) |
| OF-17 | The print popup's on-screen view squeezes posters wider than about 84 in (the PDF is fine). | LOW | S11 | PLAN.md "handed on" (fix 02) | Rec: MEASURED (record 02 reviews) |
| OF-18 | **Item 9 (Later):** error screens print database text and have no way out (6 of 6 start or load failures on a first visit; 3 of 5 print backend text). The local config limits guest sign-ins to 30 per hour per IP, so a class on one network could hit this at S1. | HIGH for a workshop room (mine), otherwise MEDIUM | S1 | Moved to Later by the owner (outside MVP, 2026-09-30); PLAN.md asks for the production limit to be checked before any workshop | Rec: MEASURED (ranking evidence, PLAN.md) |
| OF-19 | Tools that still use the stored height instead of the drawn one: the drag guide's centre, the rubber band, and the group frame (95.6 units below a text block's drawn bottom: 133 px at the 1280 fit; Q8a). | LOW (mine) | S7 | PLAN.md "handed on" and Later | Rec: MEASURED (records 02, 03, 19). INSPECTED here: ISSUES and collisions already use the measured heights (`PosterEditor.tsx:1508-1518`, `boundsCheck.ts:150`), so F8's collision half looks fixed on main |
| OF-20 | Auto-Arrange with font scaling takes 3 undo steps (U-13). Auto-Arrange is the bulk layout tool the direction leans on. | LOW | S7 | Not changed by fix 12 | Rec: MEASURED (record 01 §10) |
| OF-21 | `migrateBase64ToStorage` writes back the blocks as they were at load (`setBlocksSilent`), which would overwrite edits made while images upload. | MEDIUM if real (mine) | S5, S9 | PLAN.md: "reproduce before planning" | Rec: INSPECTED only (record 01 §10) |
| OF-22 | Two tabs on one poster: the last write wins; the banner warns. | LOW | S9 | by design (record 07) | Rec: MEASURED (record 07 §10) |
| OF-23 | The "Already open in another tab" banner never clears after the other tab closes (F10). | LOW | S9 | Not in PLAN.md; status on main UNVERIFIED | Rec: observed 2026-09-13 (FINDINGS F10). MEASURED here: no goodbye message in `hooks/useTwoTabGuard.ts` (grep "bye": 0 hits) |
| OF-24 | "Reset to palette" on an older poster adds an undo step that changes nothing visible. | LOW | S2 | Not changed | Rec: MEASURED (record 01 §10) |
| OF-25 | The default 3-column template at 48 × 36 never gets a credit mark, and the mark's scan misses free bands (19,890 of 347,760 sweep moves dropped it, 7,442 with room). Matters only for the free PDF's mark. | LOW | S1, S11 | PLAN.md "handed on" | Rec: UNVERIFIED (template case); MEASURED (sweep, record 02 BG-5) |
| OF-26 | Authors without `affiliationIds` crash the editor; whether any saved poster lacks the field was not checked. | LOW | S3 | Not planned | Rec: INSPECTED, UNVERIFIED (record 01 §10) |
| OF-27 | Version-name Save during a tab change can save a second version. | LOW | S9 | Not planned | Rec: INSPECTED (record 07 §10) |
| OF-28 | A click on the table block's frame selected nothing in a harness run; not investigated. | UNVERIFIED | S6 | Not handed on (record 07 §10) | Rec: an instrument observation only |

**Older stress-test findings not carried into PLAN.md** (2026-09-13; status on main
not re-checked, so UNVERIFIED): F4, no automatic version checkpoints (FINDINGS:
major; less pressing once undo holds 100 steps); F9, the table's ROWS stepper moves
out from under the pointer (minor; 5 clicks made 1 decrement); S7, a vertical resize
of a title, text or table block is a silent no-op (TRIAGE, INSPECTED then;
PowerPoint's text boxes also resize to fit their text by default, PPT, knowledge).
The owner-reported issues of 2026-07-29 in `manual-test-flows.md` STEP 0 (titles
stripped on parse, no way back, scroll overshoot, wordiness, fine print) are
unreproduced and mostly about flows now hidden.

---

## 5. Shared root causes to check before designing fixes

Hypotheses, not conclusions: each is a code reading (INSPECTED) that groups
findings; none was measured in this pass.

- **R1, the editor stays mounted while the poster changes under it** (OF-03, OF-04).
  `useAutosave` drops the pending save on an id change (`useAutosave.ts:287-298`).
  Whatever else holds the previous poster's state across the switch could explain
  R2-P1 too. Not explained: why Back writes the **copy's** text (a direction R1
  alone does not predict).
- **R2, autosave treats "sent" as "done"** (OF-05, the Duplicate sibling, item 10's
  "your work is safe" claim). The pending doc is cleared before the request
  (`useAutosave.ts:206-209`), and `flushNow` never throws.
- **R3, typed text goes through a different sanitizer call than pasted text**
  (OF-01; possibly OF-02). One commit path (`RichTextEditor.tsx:171`) passes no
  separator. Not explained: OF-02 needs its own reproduction; the sanitizer's
  comment contradicts the `<font>` hypothesis.
- **R4, one key guard that knows only text fields** (OF-11, the guidelines
  `<select>`, OF-12, U-10). The delete / nudge handler acts on the selection from
  any focus that is not INPUT, TEXTAREA or contenteditable
  (`PosterEditor.tsx:2204-2209`). OF-12 is the editor's handler beating the
  table's own (the merge reviewer's reading).
- **R5, visible controls that do not reach the poster** (A+/A− and alignment,
  removed by 12; OF-02; OF-13; U-9). Under "keep decisions minimal", removing such
  a control is as good as wiring it.
- **R6, stored versus drawn geometry** (OF-19). TRIAGE's 2026-09-13 root cause;
  ISSUES has been moved to measured heights, three tools have not.
- **R7, customization surfaces** (section 6). Rotation, groups, crop, row and
  column strips, rulers and the guidelines panel produce most of the fix 19 and fix
  04 Later items. Hiding a surface retires its rows.

---

## 6. Customization findings (hide the surface, or fix later)

| id | finding | severity | surface | evidence |
|---|---|---|---|---|
| C-1 | Q5: a group's members draw their own handles, move, delete and rotate under the group frame: 10 covered, 14 overlaps at the 1280 fit (main 20 and 36) | LOW | groups | Rec: MEASURED (record 19 §10) |
| C-2 | Q6: crop mode's Cancel/Reset/Apply bar lies on the rotate control (407.6 px²); on a small image the crop edges overlap its corner handles | LOW | crop, rotate | Rec: MEASURED (record 19 §10) |
| C-3 | Q7: row and column strips show on an unselected table, under its n, nw, ne and w handles (11 overlaps); rows under 24 px on screen fail WCAG 2.5.8 (3 of 44 views) | LOW | table strips | Rec: MEASURED (record 19 §10) |
| C-4 | Or-tilt: on a turned block (10°, ±90°, ±135°, ±170°) the upright handle row can lie on one of its own handles, 10 of 21 readings (Firefox 8; main 21 of 21) | LOW | rotation | Rec: MEASURED (record 19 §10) |
| C-5 | Ns: zoomed far out, a selected block's controls can lie on another block's centre, so a click there selects nothing: 18 / 14 / 17 of 78 clicks (Chromium / Firefox / WebKit); none deletes or replaces (Fd 0). **PLAN.md's Later entry says 14 of 78 (13, 13)**, which does not match record 19 §10 or record 12 §11 (both 18, 14, 17): INSPECTED here | LOW | extreme zoom | Rec: MEASURED (record 19 §10) |
| C-6 | Under 35 % zoom an image narrower on screen than its 108 px button row has no Replace or Crop, and the Figure tab's crop hint names the ✂︎ button that is then not drawn; the 35 % threshold was measured on one template and poster | LOW | extreme zoom, crop | Rec: INSPECTED (record 19 §10); `CropHint` at `Sidebar.tsx:2925` (INSPECTED here) |
| C-7 | Q8b: the floating format toolbar stays 192 px from its text after a pinch (191.8 Firefox, 189.3 WebKit) | LOW | pinch zoom | Rec: MEASURED (record 19 §10) |
| C-8 | Q9: the zoom bar's own buttons are under 24 px (21.3 × 25, 50 × 17.5, 25 × 16 px); no 44 px size for touch and pen | LOW | zoom bar, touch | Rec: MEASURED (record 19 §10) |
| C-9 | I1 / I2 / I3: hover glow and focus outline follow the 24 px hit area, not the 20 px circle; a pinch to 1.63 puts an edge image's corner handles 4.35 px out of the canvas; a selected title's text sits a little more under its own s handle (6.52 % against 1.93 %) | LOW | controls | Rec: UNVERIFIED (the reviewer's, record 19 §10) |
| C-10 | A large tilted block moved to a new sheet can outgrow it (250–646 of 19,376 placements per angle, ISSUES flags each) | LOW | rotation | Rec: MEASURED (record 02 §10) |
| C-11 | Item 21: at 640–700 px windows the guidelines panel's button covers FIT (4 of 4 widths) | LOW | guidelines panel | Rec: MEASURED; parked by the owner (PLAN.md) |
| C-12 | Rulers (item 4): hidden (`RULERS_ENABLED` off), the fix parked on the local branch `editor/rulers-match-sheet`. Its Later items wait for it: the out-of-bounds banner over the top ruler (22 of 55 marks at 1280 × 800), the ruler bars over classic scrollbars, the workspace grid's offset (up to 76 px), marks every 2 px at the 20 % floor, a frame of lag | n/a while hidden | rulers | Rec: MEASURED (PLAN.md Later) |
| C-13 | With reduced motion requested, opening the guidelines panel still animates the canvas width (12 distinct values) | LOW (a11y) | guidelines panel | Rec: MEASURED (PLAN.md Later) |
| C-14 | Collapsed sidebar: 29 of its controls stay in the Tab order; ⌘/ from a sidebar field leaves focus there and typing edits it unseen (6 of 6) | LOW-MEDIUM (mine) | sidebar collapse | Rec: MEASURED (record 03 §10) |
| C-15 | Zoom edge cases: a pinch during the panel's slide can go the wrong way; a pinch over the zoom bar is not handled; more than 52 Ctrl+wheel events in one task throw "Maximum update depth exceeded"; Firefox line-mode wheels zoom about 30× less | LOW (the throw could reach the crash screen: UNVERIFIED) | zoom | Rec: the reviewers' (record 03 §10 R4) |
| C-16 | A selected block's border and the crop frame's line, the drag guides and the rubber band still scale with zoom | LOW, cosmetic | controls | Rec: INSPECTED (record 19 §10) |
| C-17 | Dialogs opened from the sidebar without `aria-modal` (Import, Copy design, Import-replace) are drawn inside its 484 px rail, and ⌘/ can hide them while open | LOW-MEDIUM (mine) | sidebar dialogs | Rec: MEASURED by reproducer S (record 03 §10) |
| C-18 | Tour: step 1's tooltip leaves the window with the sidebar collapsed; leaving mid-tour restarts at 1/8; step 2's tooltip runs off a 600 px window | LOW | onboarding tour | Rec: the reviewers' (record 03 §10 R7) |
| C-19 | Table: forward Tab sticks in the last cell (120 Tabs from load end there), so the controls after the table, Undo/Redo included, are not reached by Tab | LOW-MEDIUM (a11y) | tables | Rec: MEASURED (records 03, 12). INSPECTED here: `blocks.tsx:627` `onCellKeyDown` |
| C-20 | The table cell's HTML is stored unsanitized | LOW while sharing is hidden | tables | Rec: INSPECTED (record 12 §10) |
| C-21 | Item 20: a toolbar button shows a focus ring after a mouse click then a key (Chromium, 6 of 7) | LOW ("annoyance", plan) | chrome polish | Rec: MEASURED (record 03 §10) |

---

## 7. Later or outside the editor (for completeness)

### 7.1 Plot checker (stopped, per the owner's message; question 0.1)

From the 13p2 reproduction and confirmation on `f554eaa` (Rec: MEASURED by them,
not re-run), the PLAN.md Later list and records 07, 13 and 15:
- Python misreads: per-element rcParams 18, rc_context 14, seaborn keys 10, sizes
  held in names 8; the all-pass banner over a real failure in 28 of 65 runs.
  Seaborn's figure-level grids and tight saves: 50 re-check ✓ over a saved image
  below the minimum; the fix fails on 9 of 9 seaborn-grid runs.
- R misreads: `theme(title=)` 11 of 12, `theme(text=)` 8, positional base_size 5.
  The R fix lands inside a string literal, or on `theme_update(`, giving false greens
  (3 of 3 each). Item 16 (an R fix attached to `print(p)` passes and changes
  nothing) is not named in the owner's rule table.
- Advice: "Or change one number" can lower what the user set (19 runs), and in 28
  of 147 offers it changes nothing.
- In the editor, a left or right caption takes 35 % of an image block's width, but
  the panel scores the full width (16 false-pass elements in 4 of 8 side runs).
- Three sets of minimums (code check 18/14/12, image scan 24/18, charts 18/24).
  Stream Q's shared module merges them.
- Item 14 (seaborn contexts and style sheets) is covered by the owner's rule
  table's seaborn rows; item 17 (Later): "Copied" when copying failed, "Detected:"
  for a hand-picked language.
- The editor's code box traps Tab and Shift+Tab (WCAG 2.1.2); image scan results are
  lost on a tab change and a second image shows the first one's rows; a result
  scrolls out of view at small editor heights (10–16 px visible in 4 of 10
  configurations); the preview size is not kept per poster (record 07 owner question
  3); part 1's limits (legend titles raised, one layout pass, what counts as out of
  date, the runtime wrapper the owner's design replaces with plain edits).
- `ReadabilityPanel.tsx` is 1,208 lines (PLAN.md).

### 7.2 Account, billing, legal (Out)

The password reset has no screen to set a new password (HIGH, claims audit;
INSPECTED here: `resetPasswordForEmail` at `pages/Auth.tsx:381`, no
`PASSWORD_RECOVERY` handler, as the comment at `:606` says). Refund edge cases, the
EU withdrawal waiver on one path only, retention clean-ups, "Download my data"
coverage, PPTX file properties naming Postr, the merchant-of-record comments, the
missing Terms line on the editor's "Create account", a failed sign-out after
deletion, the e-mail sign-up with no session (R1-09), and the legal questions for
counsel (owner-followups §1, §2): all in PLAN.md's queue. Item 9 is OF-18; items 10
and 11 are Later. Record 23 Later: the session-expired warning never appears, a
signed-out editor tab gets a new guest at once, an edit typed inside the save delay
is lost across an account switch, a delete that removes no row reported as success,
and import during a tab-sync delay ending in backend text. **Stale checkbox:**
manual-test-flows "§1b /auth uses signUp" looks fixed. INSPECTED here: a guest is
converted with `updateUser` (`pages/Auth.tsx:320-324`).

### 7.3 Sharing and comments (hidden, `SHARING_ENABLED` off)

Record 23 §10's hardening list before re-enabling; the comments panel's fields not
marked `data-own-undo` (record 12); the area-comment label dividing inches by 10
again; comment-mode CSS hiding a marker nothing carries; the phone share bars over
the poster; read-only viewers seeing the guidelines rail.

### 7.4 Test and instrument gaps (no user-facing defect)

jsdom ISSUES tests see growing blocks as 0 tall (record 02 §10); the mutation
checker's spec shapes it still passes (record 03 §10); the "five steps in and out"
zoom test passes when Zoom in does nothing (PLAN.md); `PosterEditor` calls hooks
after an early return (Rec: INSPECTED, record 03 §10; a latent crash shape);
`canvasOverflow` never fires (record 03 §10); U-11.

---

## 8. Owner questions the direction already answers, or should

1. **Text size per level, not per block** (record 12 §10). The direction says bulk:
   keep per-level size (it matches PowerPoint's Slide Master levels, PPT,
   knowledge) and do not add per-block size or alignment.
2. **Per-run text colour** (OF-02): wire it or remove the swatches (theme colours
   are the bulk edit).
3. **Enter's line break** (OF-01): MVP, not "text formatting". Typing paragraphs is
   step S4.
4. **Row and column editing** (OF-12, OF-13, C-3, C-19): Later per the owner. If
   so, hide the strips and the dead menu items too, so Delete cannot remove a table
   by surprise.
5. **Multi-select and groups** (OF-06, C-1, OF-19): keep (PowerPoint users expect
   shift-click and drag), and then item 6's three-line fix is MVP; or hide groups.
6. **Rotation and crop** (C-2, C-4, C-6, C-10, U-9): candidates to hide for the MVP.
7. **Chart blocks ("Make a figure")** (OF-09, OF-10): keep them, and the PowerPoint
   export and caption clipping are MVP; or hide them and let figures come in as
   images (the common case: a researcher pastes the plot they already made).
8. **Templates at every size** (OF-14): the 3-column template at sheets shorter
   than 30 in.
9. **Where Undo/Redo sit**: the top bar (in flight) matches PowerPoint's Quick
   Access Toolbar (PPT, knowledge).
