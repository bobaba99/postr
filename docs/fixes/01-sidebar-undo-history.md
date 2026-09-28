# Fix 01 — A sidebar change wipes the undo history and the poster's name

**Plan item:** 1 · **Branch:** `editor/undo-sidebar-history` · **Status:** done

## 1. Symptom

A researcher types in a text block, then changes something in the sidebar — a
font, the poster width, the poster size. They press ⌘Z and nothing happens: the
typing can no longer be undone.

Found while tracing that: the same sidebar change also blanks the poster's
display name (the "Poster Title" field, separate from the title block on the
canvas), and the next autosave writes the **title block's text** into the saved
poster's name. A poster the researcher had named "Lab meeting draft v3" shows up
in the dashboard under its title-block text instead.

## 2. Hypotheses

| id | hypothesis | prediction that would confirm it |
|---|---|---|
| H1 | Sidebar edits reach the store through `setPoster`, the *load a poster* action, which clears the undo and redo stacks | after a sidebar change, `canUndo` is false and ⌘Z does not revert the earlier typing, nor the change itself |
| H2 | `setPoster` writes `posterTitle = title ?? ''`, and the sidebar path passes no title | the display name is `''` after any sidebar change |
| H3 | Autosave sends the store's display name and falls back to the title block's text when it is empty | the next save sends the title-block text as the poster's title |
| H-alt | History is lost to something else, such as the sidebar tab remounting when it opens | `canUndo` drops when the tab opens, before any setting changes |

## 3. Method

`apps/web/src/poster/__tests__/sidebarHistory.test.tsx` — one `describe` per
hypothesis, each asserting the *correct* behaviour so the unfixed code fails
them. Re-run:

```bash
cd apps/web && npx vitest run src/poster/__tests__/sidebarHistory.test.tsx --reporter=verbose
```

Entry points are the user's: typing into the canvas contenteditable (mutate,
then `input`), clicking a sidebar tab by its visible label, changing the real
`<select>`/`<input>`, pressing ⌘Z on the page. Only the network write
(`upsertPoster`) is replaced, so H3 observes the title actually sent.

Controls covered: Style › Font, Layout › Poster width, Layout › Poster size
preset — three different `updateDoc` callers across two tabs. All eleven
sidebar edits pass through the one `updateDoc` funnel; the other eight are
covered by the independent confirmation (section 5).

**What is committed.** Three instruments are committed, and anyone can re-run
them:
- this test file;
- the real-browser harness (section 5);
- the mutation checker with its spec (section 8).

The reviewers' own scripts ran from the session's scratch space and are not
committed. Their results are quoted here with the numbers they printed, and are
labelled as theirs.

Two instrument errors were caught before any result was accepted, and both are
worth knowing for the next fix: a hand-written fixture without full `styles`
crashed the render, failing every assertion for the wrong reason; and the older
editor test fixture names the author field `institutionIds`, while the `Author`
type uses `affiliationIds` — harmless until a template adds an authors block,
then it crashes. Red tests from a broken instrument are not evidence.

## 4. Results before the fix (TESTED)

| prediction | Font | Width | Size preset |
|---|---|---|---|
| H-alt: `canUndo` after the tab opens | true — **refuted** | true — **refuted** | true — **refuted** |
| H1: `canUndo` after the change | **false** | **false** | **false** |
| H1: ⌘Z reverts the change itself | **no** (`DM Sans` stays) | | |
| H2: display name after the change | **`''`** | **`''`** | **`''`** |
| H3: title sent by the next save | **title-block text**, not "Lab meeting draft v3" | | |

8 of 8 predictions for H1–H3 confirmed; the alternative refuted 3 of 3.

## 5. Independent confirmation (before any change)

Two reviewers, neither of whom saw the author's test, each with their own
method. Both were asked to refute the report, and both confirmed it.

**Reviewer A — jsdom, the controls the author did not cover.** 18 real sidebar
controls reaching all 11 `updateDoc` callers (palette, font, italic, title size,
heading border and fill, style preset, custom-palette save, add/edit author,
affiliation chip, add/edit institution, add/remove reference, per-block italic,
size preset, custom width), plus positive and negative controls. MEASURED:

| claim | result |
|---|---|
| (a) undo wiped | `canUndo` true → false in **18/18**; ⌘Z×2 reverted neither the setting nor the typing in 18/18 |
| (b) name blanked | `posterTitle` → `''` in **18/18**; the Layout › Poster name field read `''` |
| (c) name overwritten on save | the save sent the title-block text in **18/18** (`'Your Poster Title'` after a size preset — the template's placeholder) |
| negative controls | Insert › + Text and Layout › Template (both `setBlocks`) kept history and name |
| H-alt | visiting 10 tabs: 0 store writes, history and name kept — **refuted** |

Counterfactual experiments settled the mechanism: replacing only that one
`setPoster` call with a history-preserving write took the assert run from
**36 of 47 failing to 47 of 47 passing**; passing the current title into the same
call kept the name 18/18 while (a) still failed.

**Reviewer B — a real browser.** The unmodified editor in Chromium, only the
network faked, real keyboard input including the real ⌘Z and Ctrl+Z keypress.
14 scenarios across the 11 callers, **3 of 3 runs** each. MEASURED:

- The typed words survived both ⌘Z presses in every scenario; the setting was
  not reverted (e.g. font stayed `DM Sans`).
- The Poster name field went from `Smith Lab APA 2026` to `''` and showed the red
  "A poster name is required for dashboard identification." The browser tab
  title and the screen-reader heading lost the name too.
- The save request carried the title-block text; after reopening the poster from
  the (faked) database, the name was gone.
- Boundary: with an empty title block the save carries no title, the database
  keeps the name, and (b) lasts only until reload.

This harness is committed as `apps/web/scripts/sidebar-history-check.mjs`.

**Siblings found by the reviewers, same cause:** an unsaved Poster-name draft is
erased by any Layout change (the field re-syncs from the blanked store name);
Duplicate would save the title-block text first (INSPECTED). **Not this cause:**
applying a Layout template discards the content despite its copy saying it
doesn't (recoverable with ⌘Z) — moved to item 2; ⌘Z pressed while focus is still
in a sidebar input goes to the browser's native undo — item 12.

## 6. Root cause

`PosterEditor`'s `updateDoc` — the single funnel for all 11 document-level
sidebar edits — saved the change by calling `setPoster`
(`apps/web/src/stores/posterStore.ts`). `setPoster` exists to **load** a poster,
and it does two things a load should: it starts a fresh history
(`undoStack = []; redoStack = []`) and it sets the display name from its `title`
argument (`posterTitle: title ?? ''`). `updateDoc` passed no title. So every
sidebar edit was treated as opening the poster again.

Autosave (`useAutosave.ts`) then read the blank display name, fell back to the
title block's text, and sent that as the poster's title.

What this does **not** explain: why a size preset destroys the content (a
separate decision in `changeSize` — item 2), and why ⌘Z inside a sidebar input
reverts canvas typing (the keyboard handler steps aside for inputs — item 12).

## 7. Fix

A new store action, `patchDoc(patch, coalesceKey?)`, is the editing counterpart
of `setPoster`. It applies the patch to the latest document as **one undo
step** and leaves `posterId` and `posterTitle` alone. `PosterEditor.updateDoc`,
the funnel for all eleven document-level sidebar edits, now calls it.

`setPoster` is unchanged and is still used where a reset is right:
- opening a poster (Editor route, Import, Share);
- restoring a version.

A misleading comment in `useAutosave.ts` claimed the title fallback was written
back to the store. The comment was corrected; the behaviour was not changed.

Undo steps are shaped the way PowerPoint shapes them. The first version of the
fix did not get this right (section 9, F3):

- **A click is one step.** This covers every button, menu, checkbox, preset and
  delete.
- **A burst of continuous input is one step.** Only inputs that fire on every
  keystroke, drag or colour pick pass a coalesce key:
  - author name;
  - institution name, department and city;
  - Style-tab size and line height;
  - custom width and height, one key per field, so typing a width and then a
    height is two steps;
  - Edit-tab text size, line-spacing slider, line-spacing number and colour.

  This is the rule canvas typing already followed (`content:<id>`). Without it,
  dragging a slider adds one history entry per event and pushes older work out
  of the 50-entry history.
- **One user action is one step, even when it patches twice.** The bulk author
  paste adds the new institutions, then the authors. Patches made in the same
  synchronous run share a key, which is cleared at the next microtask, so two
  separate clicks never merge.

The post-fix review (section 9) found four problems in keeping history. They
were fixed on the same branch, because each was either introduced by the first
version or only became reachable through it:

- **F4, a click that changes nothing.** Clicking the option that is already
  selected now adds no undo step. Before this, the click armed a guest's
  "Leave site?" prompt although nothing had changed.
  - `patchDoc` compares each patched field with `sameValue`: deep equality
    that ignores key order and treats an undefined field as absent.
  - Key order matters because Postgres jsonb does not keep it. A palette
    loaded from the database can list the same colours in a different order
    from the catalog entry a click builds. An earlier `JSON.stringify`
    comparison called that a change (review 2).
- **F2, undo and redo end the edit in progress.** Both now clear the typing
  burst. Before, the next keystroke into the same field joined the undone
  burst, and the following ⌘Z went one step too far.
- **F1, the credit mark after undo or redo across a size change.** Undo and
  redo put back a locked block that the restored document lacks, at the
  coordinates of the document being replaced. When the step crosses a size
  change that dropped the mark, those coordinates are off the new sheet.
  - `restoreFromHistory` re-places the mark with `replaceAckBlock`, as
    `ackBlock.ts` requires of every write that changes the sheet size.
  - It does so **only** when the guard brought the mark back. A mark the
    restored document already has is where the user put it, even on top of
    other content, and is never moved or dropped. The broader first attempt,
    which re-placed on every undo, moved such a mark from (30, 30) to (10, 338)
    when a font change was undone (MEASURED, section 9).
- **Locked-block baseline.** `patchDoc` refreshes the baseline after each edit,
  as `setPoster` did on this path before.
  - The reason is the case where a size change **drops** the mark. Without the
    refresh, the next template swap would bring the mark back at the old
    sheet's coordinates.
  - An earlier draft of this record gave a different reason: that the guard
    restores a re-placed mark from the baseline. The reviewer showed that was
    wrong, because the current document is consulted first.

## 8. Results after the fix

Every figure below is MEASURED, with the command beside it. They come from the
final code; section 9 has the first version's figures.

**Tests.** `sidebarHistory.test.tsx` has 55 tests, all entered through the UI,
with a task boundary between user actions:

| group | tests |
|---|---|
| H1–H3, H-alt | 11 |
| same-control clicks and reference deletes | 2 |
| continuous inputs, one step each | 12 |
| discrete controls, two steps for two clicks | 11 |
| no-op clicks (active border, palette saved in another key order, Reset to palette on an unset colour) and two controls (a real border change, an author reorder) | 5 |
| undo/redo end the burst, with a control | 3 |
| credit mark across size changes | 3 |
| name and id untouched, name draft survives | 2 |
| misc (different controls, width then height, colour then Reset, preset after typing, paste, load) | 6 |

Results:
- The file passes 55/55.
- The whole web suite passes 2723/2723 in 170 files (main: 2668).
- `tsc -b` passes.

**Falsification by part.**
`apps/web/scripts/mutation-check.mjs` serves each "mutant" (an edit that undoes
one part of the fix) to vitest without writing the repo. The unmutated control
runs first and must be all green. Spec:
`docs/fixes/01-sidebar-undo-history.mutants.json`.

```bash
cd apps/web && node scripts/mutation-check.mjs ../../docs/fixes/01-sidebar-undo-history.mutants.json
```

The spec runs this file together with the three neighbouring suites the
change touches (`blockLock`, `posterStore`, `useLeaveGuard`).

Result: control 108/108, **35 of 35 mutants killed**. Fifteen were added
after review 2:
- the reviewer's nine from round 1. Eight survived this file's tests at the
  time, and seven survived all four suites.
- three of the reviewer's round-2 `sameValue` mutants, which had survived:
  array order, array length only, shallow.
- three of mine, for the review 2 changes: the per-field size key, the
  key-order check, and the add-author row.

| mutant (undoes) | tests failing |
|---|---|
| sidebar edits go through `setPoster` again (the whole fix) | 46 |
| history reset / no undo push | 40 / 40 |
| patch applied under the current doc | 37 |
| separate actions share one key forever | 16 |
| every edit keyed by field (the first version, F3) | 12 |
| custom size unkeyed | 7 |
| display name blanked / no-op check compares array lengths only | 6 / 6 |
| Edit-tab style inputs unkeyed | 4 |
| institution fields unkeyed / no no-op skip (F4) / no-op by identity only | 3 / 3 / 3 |
| each of: Style-tab inputs unkeyed, undo/redo keep the burst (F2), undo unguarded, adding an author keyed | 2 |
| each of: no same-run grouping, no mark re-place (F1), re-place on every undo, redo unguarded, redo discards the reinstated mark, no baseline refresh, width and height share a key, no-op check sensitive to key order, no-op check blind to array order, no-op check shallow, author name / department / colour picker unkeyed, palette / add-institution / Edit-tab weight / Edit-tab italic / Reset-to-palette keyed | 1 |

When the whole fix is reverted, 46 of the 55 tests in this file go red and 9
stay green:
- The three Halt tests and "load and look around". These were correct on
  main, and no mutant of this fix reaches them. They guard against a future
  write that happens on its own.
- The three no-op tests. `no-noop-skip` kills all three;
  `noop-key-order-sensitive` and `samevalue-shallow` each kill one.
- The overlapping-mark test. `mark-replaced-on-every-undo` kills it.
- The template-after-drop test. `no-baseline-refresh` kills it.

Not covered by any test (INSPECTED): `sameValue` treats an undefined field as
absent and checks that both sides have the same keys. The reviewer's mutants
for these two survive the suite and the reviewer's own probes, and no UI path
reaches either: that would need a legacy palette or preset carrying an extra
key.

**Real browser.** `apps/web/scripts/sidebar-history-check.mjs` was written by
reviewer B (section 5). It covers 13 scenarios and 4 controls, with real ⌘Z and
Ctrl+Z.

```bash
cd apps/web && node scripts/sidebar-history-check.mjs
```

The harness was validated in both directions after one comparison bug in it was
corrected:

| code | controls | defects | exit |
|---|---|---|---|
| main | 4/4 OK | 13/13 | 1 |
| fix | 4/4 OK | 0/13 | 0 |

The final code gives controls 4/4 OK, defects 0/13, exit 0. The reviewer's
round 2 run got the same. After that run the only changes were one store
comment and tests.

The `size-preset` scenario is marked KNOWN. Its remaining defect is item 2: a
preset replaces the blocks. Since this fix, ⌘Z brings the blocks back.

`custom-width-no-blur` is INFO. With focus still in the width input, ⌘Z goes to
the browser's native undo, which reverted the canvas typing; a second ⌘Z
brought it back. That is item 12.

**Independent jsdom harness** (reviewer A, section 5; not committed), re-run
against the first version of the fix: 47 of 47 assertions pass, where 36 of 47
failed before.

## 9. Review of the fix

### Review 1: the first version (jsdom through the real editor, no browser)

Verdict: the original three defects were fixed. Keeping history exposed four
new problems. Each was confirmed before anything changed, first by the
reviewer's own probes and then by a second, independent real-browser check. The
second check ran against a frozen copy of the first version; its calibration
reproduced 11 of 11 predicted failures.

| id | problem in the first version | confirmation 1 (reviewer's probe, MEASURED) | confirmation 2 (real browser) | on main |
|---|---|---|---|---|
| F1 | ⌘Z then ⌘⇧Z after typing a height "2", "24" leaves the credit mark at y 338 + 12 on a 240-unit sheet. `checkBounds` calls it "completely outside the poster", and the lock stops the user deleting it | reproduced | **3/3**. On a sheet where the mark sat in its bottom band (y 338), redo left it at y+h 350 against a limit of 230. Where the mark sat higher (y 120) it stayed inside, so this depends on position | 3/3 not reachable: ⌘Z does nothing |
| F2 | ⌘Z, then the same control again within 600 ms: the next ⌘Z also removes earlier canvas typing | reproduced; with a 700 ms gap it works | **3/3** (Box, ⌘Z, Left 158–166 ms later, ⌘Z: the typing went too). Gap over 1 s: correct, 3/3 | 3/3 not reachable. The canvas-text version is refuted on **both** trees, 3/3: with focus in a text block ⌘Z never reaches the app, and clicking out ends the burst |
| F3 | two separate clicks on one control merge into one step (border Box → Left undoes to Bottom; two reference deletes restore both) | reproduced | **3/3** (border clicks 226–280 ms apart; deletes 231–266 ms apart). Gaps over 1 s: two steps, 3/3 | 3/3 not reachable |
| F4 | clicking the option already selected makes `canUndo` true, so a guest who changed nothing gets the leave prompt | reproduced | **3/3**, for the active border and the active palette: document byte-identical, `canUndo` false→true, the first ⌘Z did nothing visible, and leaving raised `beforeunload`. The fake session was checked to be a guest: a permanent user got no prompt | 3/3 `canUndo` stayed false, no prompt |

The reviewer also showed that four mutants of the first version survived its
tests:
- the baseline refresh;
- the default key;
- the null default key;
- the custom-size key.

Its bulk-paste and burst tests called `patchDoc` directly with hand-picked
keys, so they were built from the fix itself. Those tests were rewritten to
enter through the UI (section 8).

**Found while fixing, by the author.** The first attempt at F1 re-placed the
mark on **every** undo. That moves a mark the user dragged over other content,
or drops it on a crowded poster: undoing a font change moved such a mark from
(30, 30) to (10, 338). The test was red first (MEASURED). The fix was then
narrowed to marks the guard brings back.

**Instrument errors caught along the way**, all corrected before the results
were counted:
- **All actions in one synchronous run.** The new tests at first fired every
  action in one synchronous run. The fix's same-run grouping then merged
  separate clicks, so tests went red or green for the wrong reason. The tell
  was a control predicted green that came out red. Every user action now ends
  with a task boundary, as in a browser.
- **Template button lookup.** It matched the button's full text, but the button
  holds the template's name plus a description.
- **The second confirmer's tree.** It was first pointed at this working tree,
  which then changed under it when the F1–F4 fixes went in. It was re-pointed
  at a frozen, calibrated copy, and its earlier results on the live tree were
  discarded.

### Review 2: the second version (F1–F4 fixed)

The reviewer worked on a frozen copy, in jsdom and in real Chromium. Its
instruments included:
- a randomised UI fuzz of 250 sequences, 3,436 steps and 1,608 undo/redo
  actions. It was first shown to catch three mutants, so it can see breakage;
- its own mutants, run through `mutation-check.mjs`.

Verdict: the core fix holds. F1 and F2 held under the fuzz, with 0 violations
of four invariants. Three problems remained in this fix. Each was reproduced by
the author with a failing UI test before it was changed.

| # | problem | measured | change |
|---|---|---|---|
| R2-1 | F4 was incomplete. The no-op check compared `JSON.stringify` output, which depends on key order. A palette saved through Postgres jsonb comes back in another order, so clicking the active palette still added a step and armed the guest leave prompt. | reviewer: jsdom and Chromium, `canUndo` false→true. Author's test: red | `sameValue`, deep equality that ignores key order |
| R2-2 | Nothing protected redo's credit-mark guard. Two F1 assertions were `if (m) expect(…)`, and 8 of the reviewer's 9 mutants survived this file, including redo unguarded, redo discarding the mark, and five clicks wrongly keyed. | 8/9 survived (7/9 across the four suites) | assertions made unconditional; five click rows and a Reset-to-palette test added; all 9 mutants now in the spec and killed |
| R2-3 | Width and height shared one key, so width 40, Tab, height 30, ⌘Z undid both. | 48x36 instead of 40x36, jsdom and Chromium. Author's test: red | a key per field |

Not changed, a recorded limit: a keyed number field merges quick ArrowUp
presses into one step. Title size 14 → 14.44 in two presses, one ⌘Z gave 14
(MEASURED in Chromium). The key belongs to the input, not to the kind of event.

The reviewer also found comments that did not match the code. All were fixed,
including one the author wrote earlier in this fix: the `useAutosave` title-ref
comment. It claimed "later saves send the same value", but the ref is re-synced
on every render (MEASURED).

**Round 2: the reviewer's own instruments against the final version.** No
break found through the UI. All figures MEASURED:

- Suite 2721/2721. The given spec: 32/32 killed, control 106/106.
- The reviewer's round-1 mutants, adapted: 9/9 killed.
- Browser harness: 0/13, exit 0.
- Jsonb palette re-click: `canUndo` and the leave guard stay false in Chromium.
- Width then height: 40x36.
- Width, height, width: three steps (40x30 → 40x36 → 48x36).
- Seven attacks on the per-field keys: every ⌘Z trail was as expected.
- The 250-sequence fuzz: 3,437 steps, 0 violations. It still kills its
  falsification mutants.
- No UI input made `sameValue` swallow a real change:
  - 56 of 56 palette-to-palette clicks registered as changes;
  - an author reorder registered as a change.
- Store-level inputs the UI never builds do fool it: a sparse array with a
  hole, and two different `Date` values. The doc has neither (INSPECTED).
- Cost on an 8.45 MB poster: at most 0.04 ms per slider event and 0.45 ms per
  size preset. The old `JSON.stringify` check took 15–17 ms per preset.
- Two of its `sameValue` mutants survived the suite (array order, shallow).
  Two UI tests were added and both mutants are now killed (section 8). Two
  more cannot be reached from the UI (section 8, "Not covered").
- It agreed that the ArrowUp merge should stay a recorded limit: it changes
  only granularity within one field and cannot flood or evict history.
- It flagged one comment nit (the baseline "self-healing" wording), since
  fixed.

## 10. Limits and follow-ups

- **Size preset replaces the blocks** (item 2). A preset still lays out a fresh
  3-column template. Since this fix ⌘Z brings the blocks back, but the preset
  itself should keep them. The Layout › Templates copy says content is kept
  while applying a template discards it; that is also item 2.
- **Typing a size keystroke by keystroke drops the credit mark until the poster
  is reopened** (item 2, MEASURED on main and on the fix, 3/3 in Chromium).
  - The height field accepts any value above 0 despite `min={10}`.
  - Typing "24" applies a 2-inch sheet at the first keystroke, and the mark is
    dropped for lack of room.
  - `replaceAckBlock` never adds it back, so the saves in between have no mark.
  - Reopening the poster re-seeds it.
- **Custom-size sheets are drawn and laid out as 48×36** (items 3 and 4). There
  are two independent reports, neither reproduced here yet:
  - the browser confirmer: a 48×24 poster rendered 480×360 units;
  - review 2 (MEASURED): templates and Auto-Arrange put 10 of 15 blocks past
    the edge of a 30-inch-wide sheet.

  The suspected cause is `findSizeKey`'s fallback to 48×36 for non-preset
  sizes.
- **The default 3-column template at 48×36 never gets a credit mark**
  (browser confirmer, UNVERIFIED here). Its column bottoms overlap the band the
  mark needs.
- **⌘Z inside a sidebar input goes to the browser's native undo** (item 12). The
  keyboard handler steps aside for inputs. In a real browser, that native undo
  reverted canvas typing, and a second ⌘Z brought it back.
- **Edit-tab block inputs flood the history** (item 12, MEASURED by both
  reviews; the same on main). Caption, note and caption spacing go through
  `updateBlock` without a key:
  - 10 events make 10 steps;
  - a slider drag of 60 events makes 50;
  - a 60-character caption pushes an earlier font change out of the 50-step
    history.

  This fix covers only the document-level inputs.
- **Auto-Arrange with font scaling takes 3 undo steps** (item 12, review 2,
  MEASURED). It calls `setBlocks` and then two `setStyle`, and same-run
  grouping covers only `patchDoc`.
- **Version restore resets history and drops the credit mark** (review 2,
  MEASURED). Restore still goes through `setPoster`, which is unchanged here.
  - Whether a restore should be an undoable step is item 12.
  - The dropped mark contradicts the comment at `Editor.tsx:182-185`, and
    needs its own look.
- **Authors without `affiliationIds` crash the editor** (review 1, both
  versions). Every writer in the code sets the field (INSPECTED). Whether saved
  posters ever lack it was not checked (UNVERIFIED).
- **`migrateBase64ToStorage` calls `setBlocksSilent` with the load-time
  blocks** (review 2, INSPECTED only). This would overwrite edits made while
  images upload. Not reproduced.
- **A number field merges quick ArrowUp or spinner presses into one step**
  (review 2, MEASURED). This is a deliberate limit: separating two taps from a
  held key would mean tracking keydowns.
- **Reset to palette on an older poster whose style has no `color` key adds a
  step** (review 2, MEASURED). The stored value really does change, from
  missing to `null`, although the poster looks the same.
- **H3 (the saved title) is unit-tested only for Font.** The browser harness
  checks the saved title and a reopen for all 13 scenarios.
