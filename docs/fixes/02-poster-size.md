# Fix 02 — A new poster size, or a template, throws the poster away

**Plan item:** 2 · **Branches:** `editor/custom-sheet-size` (causes A and E), `editor/size-change-keeps-blocks` (causes B–D) · **Status:** done

## 1. Symptom

A researcher has written their poster. In Layout › Poster Size they pick
another preset, for example 36 × 48 in instead of 48 × 36 in. Every block
they wrote disappears, and a blank three-column template takes its place.
Nothing warns them first. Since fix 01, one ⌘Z brings the blocks back, if
they think to try it.

The same happens under Layout › Templates, whose help text promises the
opposite: "Apply anytime — blocks rearrange without losing their content."

Typing a custom width or height applies every keystroke as a sheet size.
Typing "24" makes a 2-inch poster for a moment, which drops the "made with
postr.sh" credit mark until the poster is reopened. A value below the field's
own minimum of 10 inches is accepted.

Tracing these turned up a fourth problem: a poster whose size is not one of
the presets is drawn, laid out and checked as if it were 48 × 36 in.

## 2. Hypotheses

| id | hypothesis | prediction that would confirm it |
|---|---|---|
| A | The editor takes the sheet size from the nearest preset (`findSizeKey`, which falls back to 48 × 36), not from the poster's own `widthIn`/`heightIn` | a 30 × 40 in poster is drawn 480 × 360 units; the size menu shows 48 × 36; a template and Auto-Arrange place blocks past its 300-unit right edge; ISSUES does not flag a block that is past that edge |
| B | Choosing a preset rebuilds the blocks from the 3-column template (`changeSize` calls `makeBlocks('3col', …)`), without asking | no dialog; the user's blocks and text are gone after the change |
| C | Applying a template replaces the blocks without asking (`applyTemplate` → `setBlocks(makeBlocks(…))`), while the panel says content is kept | the copy contains "without losing their content"; no dialog; the blocks are replaced |
| D | The custom width/height fields apply every `change` event and accept any value above 0 | typing "2", "24" leaves the sheet at 24 in with nothing committed; "5" + Enter gives a 5-inch sheet; the credit mark is gone |
| B-alt | The blocks are kept but moved off the sheet or hidden, not replaced | the original block ids and text are still in the document after a preset change |
| A-alt | The canvas is drawn at the right size and only the zoom makes it look like 48 × 36 | the unscaled canvas width (`#poster-canvas` style) matches the poster's size |

**Owner decisions** (`docs/stress-test/PLAN.md`, 2026-09-27):
- A size change asks first. On confirm, every block keeps its content and
  moves to the same relative position on the new sheet. The credit mark is
  placed again for the new size, and the whole change is one undo step.
- A typed custom size does the same, when the field is committed (Enter, or
  leaving the field).
- A template asks first, says it replaces the blocks, and points to
  Auto-Arrange for tidying existing content.

## 3. Method

`apps/web/src/poster/__tests__/posterSize.test.tsx` has one `describe` per
hypothesis. Each asserts the approved behaviour, so the unfixed code fails it.
Re-run:

```bash
cd apps/web && npx vitest run src/poster/__tests__/posterSize.test.tsx --reporter=verbose
```

Entry points are the user's:
- the real Poster Size menu, custom-size fields, template buttons and
  Auto-Arrange button;
- keystrokes one at a time, with a task boundary between user actions;
- Enter, and leaving the field;
- ⌘Z on the page.

Dialogs are found by their visible title, and their action as "the button that
is not Cancel", so the tests do not depend on label wording chosen later.
Controls: a preset poster is drawn at its size, the menu names a preset, and
ISSUES flags a block past a preset sheet's edge.

**Instrument errors caught before any result was counted:**
- The Auto-Arrange button's text starts with an icon (⬡), so an exact-text
  lookup found nothing. The test first failed with "nothing to click", which
  is red for the wrong reason. The lookup now ignores a leading glyph.
- The ISSUES test had no control. A red result could not tell "wrong sheet"
  apart from "the list never renders in jsdom". A control on a 48 × 36 sheet
  was added, and it passes.

## 4. Results before the fix (TESTED)

16 of 24 tests fail on main (ea5ad40); 8 pass: the three controls, plus five
guards for behaviour that already works or is approved to stay.

| hypothesis | observed on main |
|---|---|
| A-alt | **refuted**: `#poster-canvas` is 480 × 360 units unscaled for a 30 × 40 poster (a 36 × 48 poster: 360 × 480, correct) |
| A | canvas 480 × 360 instead of 300 × 400; size menu value `48×36`, not `custom`; the 3-Column template leaves 10 blocks past the 300-unit edge (right edges at 470); Auto-Arrange leaves `t1` and `b2` ending at x = 470; ISSUES shows no warning for `b2` ending at x = 460 on a 300-unit sheet |
| B, B-alt | no dialog. B-alt **refuted**: after choosing 36 × 48, block `t1` is no longer in the document at all |
| C | the copy says "without losing their content"; no dialog. The blocks are replaced (the test that measures this passes on main) |
| D | after typing "2", "24": height 24 with nothing committed; "5" + Enter: height 5; the credit mark is gone |

Already correct, kept as guards:
- text sizes survive a preset change;
- the credit mark is re-placed on the new preset sheet;
- one ⌘Z restores the size and the blocks after a preset change or a typed
  size (fix 01);
- applying a template replaces the blocks, and one ⌘Z brings them back.
  Replacing is the approved behaviour.

The prediction record is not clean, so this says so. The first run predicted
17 fail and 7 pass, and matched. Two tests were then changed:
- the ISSUES control was added;
- two tests that stopped at "no dialog" were changed to measure the blocks
  instead.

Those two had been red before they reached the block assertions, so they
could not support the "blocks replaced" claims. Only after the change do
those claims rest on a measurement.

## 5. Independent confirmation (before any change)

A workflow ran four agents on a frozen worktree of main (ea5ad40). None of them
saw the author's tests. Each was told to refute the claims, and to confirm only
what it measured.

| claim | confirmer 1: jsdom, the real editor | confirmer 2: real Chromium, real mouse and keyboard |
|---|---|---|
| A1 custom size drawn as 48 × 36 | **3/3**. 30 × 40, 48 × 24 and 60 × 40 were all drawn 480 × 360. Presets were drawn at their own size | **3/3** (30 × 40 and 48 × 24) |
| A2 template and Auto-Arrange lay out for 48 × 36 | **3/3**. On 30 × 40, 10 of 14 template blocks are past x = 300, with the right edge at 470. Auto-Arrange puts the title at w 460 | template **3/3**. Auto-Arrange 3/3 on 30 × 40; on 48 × 24 it depends on content (0/3 short, 3/3 long) |
| A3 menu shows 48 × 36; choosing it does nothing | the menu part **3/3**. "Does nothing" is inconclusive in jsdom, because jsdom fires `change` even for the selected option | **3/3**. A real mouse pick of 48 × 36 on a 30 × 40 poster made 0 changes |
| A4 ISSUES checks against 48 × 36 | **3/3**, both ways. A block past the real edge is not flagged; a block inside a 60 × 40 sheet is | **3/3** |
| A5 print/export use another size | **3/3**. Print `@page` is 30in × 40in with a 300 × 400 root, and the PPTX slide is 30 × 40. The editor and Preview draw 480 × 360, and the preview is labelled "48"×36" Landscape" | **3/3**: print on 30 × 40 and 48 × 24; PPTX |
| B1 preset replaces blocks, no dialog | **3/3**. 0 of the original ids survive, a figure is lost too, no dialog. One ⌘Z restores them | **3/3**, mouse and keyboard |
| C1 template replaces blocks, false copy | **3/3**. The copy is verbatim; 0 of 5 user strings survive | **3/3** |
| D1–D4 typed size | **3/3** each | **3/3** each |

Two instrument lessons came from the confirmers:
- **Neither harness fires `change` the way a mouse does.** jsdom's
  `fireEvent.change` and Playwright's `selectOption` both fire it for the
  option that is already selected; a mouse pick fires nothing. A harness that
  uses either would report a block wipe that no user can trigger.
- **The app's `ConfirmModal` has no dialog role.** A "no confirmation" check
  that looks only for `role="dialog"` would miss the app's own modal.

**Sibling map (third agent).** It traced every consumer of the sheet size (26)
and every path that replaces blocks wholesale (7), then measured the
important ones in Chromium. A skeptic tried to refute its 9 high-severity
claims, measured 7 of them as confirmed and refuted 2 details:
- The user's text is not missing from the PDF. It is there, cut off at the
  page edge.
- The PPTX has 8 blocks past the slide edge, not 9. The ninth is an empty
  image placeholder, which has no shape.

What the map found beyond the four claims, all MEASURED unless marked:
- **Print, PDF, PPTX and LaTeX use the poster's real size.** On a typed
  40 × 24 poster, the editor showed every block inside the sheet and flagged
  nothing, while print clipped 9 of 14 blocks.
- **New blocks are placed against the preset sheet.** On a 30 × 20 poster,
  "+ Text" landed at x 303–458, entirely off the sheet.
- **Imports are laid out for 48 × 36.** Importing a 36 × 24 PPTX runs
  Auto-Arrange for 48 × 36: 5 blocks end up outside the sheet, with no
  warning.
- **More consumers use the preset size:** the dashboard thumbnail (400 × 300
  instead of 400 × 267), the public share page, and the drag guide's
  "centred" accent (INSPECTED: 6 inches off on a 60 × 40).
- **A 60 × 40 poster that prints with 0 clipped blocks** shows "9 blocks
  outside poster bounds", and ISSUES says the credit mark "won't appear in
  print".
- **A separate cause.** Autosave never writes the `width_in`/`height_in` row
  columns, so the dashboard card keeps the old shape after any size change.
  The PATCH bodies were measured; the card was INSPECTED.

## 6. Root cause

**A.** `PosterEditor` took the sheet from a preset lookup:
- `findSizeKey(widthIn, heightIn)` returned the nearest preset key, and
  `'48×36'` when none was within half an inch;
- `pw`/`ph` and `cW`/`cH` were read from that preset.

Every consumer in the editor followed: the canvas, grid, snapping and guides,
the ISSUES bounds check, templates, Auto-Arrange (including the one that runs
after an import), new-block placement, zoom-to-fit, the preview (size and
label), and the thumbnail and share page that capture the canvas. Print, PDF,
PPTX, LaTeX and the credit-mark placement read the poster's own
`widthIn`/`heightIn`. So a custom-size poster had two sizes at once. The
editor showed one, and the paper got the other.

**B.** `changeSize` builds the new block list from
`makeBlocks('3col', …)` and keeps only locked blocks. It was written for
choosing a size before there is any content.

**C.** `applyTemplate` calls `setBlocks(makeBlocks(key, …))`, which is the
same replace-with-a-template pattern as B. The Templates copy describes a
behaviour that was never built.

**D.** The width and height inputs call `onChangeCustomSize` on every
`change` event, guarded only by `> 0`; `min={10}` is an HTML hint. Each
keystroke applies a sheet. `replaceAckBlock` drops the credit mark when a
2-inch sheet has no room for it, and never adds a dropped mark back.

**E** (found by the sibling map, a separate cause). Autosave never wrote the
row's `width_in`/`height_in` columns, which give the dashboard card its shape.
Only creating and importing a poster wrote them.

**What A–E do not explain.** Not fixed here:
- The 3-column template overflows a short sheet by itself:
  `makeBlocks('3col', 48, 24)` reaches y = 246 on a 240-unit sheet.
- The default 3-column template at 48 × 36 never gets a credit mark, because
  its column bottoms overlap the mark's band.
- Auto-Arrange's stored heights are smaller than the rendered ones: 255
  stored against 323 rendered with long text.

Found here and fixed with B–D, after its review: keyboard type-ahead on the
closed size menu changed the preset one character at a time, so typing "48"
passed through 42 × 36.

## 7. Fix

### Cause A — branch `editor/custom-sheet-size`

The sheet is the poster's own size. In `PosterEditor`, `pw`/`ph` are now
`doc.widthIn`/`doc.heightIn`, and `cW`/`cH` follow, so every consumer listed
above gets the real size through one derivation.
- `useZoom` takes the size in inches instead of a preset key.
- `findSizeKey` is replaced by `presetKeyFor` (in `constants.ts`), which only
  names a size and returns `'custom'` when no preset matches.
- The Poster Size menu can now show "Custom Size", and picking 48 × 36 from a
  custom size is a real change.
- `posterSizeLabel` gives the preview its label: "30"×40" Custom", or the
  preset's own name.

Print, PDF, PPTX, LaTeX and the credit mark already used the real size.

**After the review of cause A** (section 9), three more changes:
- **A stored size must be a usable number.** The old fallback had silently
  covered a missing or non-numeric size; drawn as stored it is NaN, and
  Auto-Arrange then deleted body blocks.
  - `sheetInches` accepts a finite number from 3 to 1,000 inches, including
    numeric strings. Anything else falls back, per side: to the row's own
    column when that is usable, else to the default. Below 3 in, 1-inch
    margins leave Auto-Arrange no column (the re-check found negative widths
    from 1 to 2 in).
  - The store's `setPoster` applies the rule to every document it receives.
    Opening, the share page, importing and restoring a version all come
    through it, so print, export and autosave see the same real size as the
    canvas.
  - The Editor page's load path applies it first, with the row's columns as
    the fallback (`normalizeSheetSize`, before `hydrateIfEmpty`), because an
    empty poster is laid out from that size.
  - Duplicating a poster uses the same rule.
  - The range is deliberately wider than the 10–100 in a user may type. A
    PowerPoint slide imported at 13.33 × 7.5 in is kept exactly, because
    clamping it would recreate the two-sizes problem.
- **Exact preset naming.** `presetKeyFor` matches a preset only to within
  0.05 in. With half an inch, a 47.8 × 36 poster was drawn and printed at
  47.8 but named "48×36", and 48×36 could not be picked from the menu, since
  it already showed as selected.
- **A dedicated error in the mutation tool.** A mutant whose tests fail to
  load, or that runs fewer tests than the control, is reported as an error
  (exit 2). Before, it read as a blind spot or as "survived".

### Cause E — the row's size columns (same branch, own commit)

The dashboard card takes its shape from the poster row's `width_in` and
`height_in`. Only creating and importing a poster ever wrote them. Once cause A
gave thumbnails the poster's real shape, a resized poster's thumbnail was
cropped by a card of the old shape.
- Autosave now sends both with every save.
- Duplicating a poster takes them from the poster's data, falling back to
  the row.

### Causes B–D — branch `editor/size-change-keeps-blocks`

**Moving onto a new sheet.** `moveOntoSheet` (new, `poster/resizeSheet.ts`)
returns the poster on a `widthIn` × `heightIn` sheet:
- Every block keeps its content. `x` and `w` scale with the width, `y` and `h`
  with the height, so a block a third of the way across stays a third of the
  way across.
- Nothing else is sheet geometry, so nothing else changes: text sizes,
  caption gaps, table column widths (percentages) and image crops
  (percentages).
- The credit mark keeps its size when it moves; only its position scales.
  `replaceAckBlock` then re-places it if that spot is not legal on the new
  sheet, or drops it when there is no room at all, as before. Placed again
  beside a row of logos, it is sized to match that row (12 → 23 measured by
  the final review), which is the rule it was first placed by (BD-4).

**Asking first.** `PosterEditor` holds a pending size and a pending template.
Each opens the app's `ConfirmModal`:
- Size: "Change poster to 36 × 48 in?", with the message "Your blocks will
  move onto the new sheet. You can undo this." and the button **Change size**.
  Confirming is one `updateDoc`, so it is one undo step. Cancel changes
  nothing, and the menu still shows the current size.
- Template: "Apply the “3-Column Classic” template?", with the message "This
  replaces every block on your poster with the template's empty layout. You
  can undo this. To tidy the blocks you already have, use Auto-Arrange
  instead." and the button **Replace blocks**. Confirming is one `setBlocks`.

**Typed sizes.** The width and height fields moved into a small component,
`sidebar/SheetSizeFields.tsx`:
- Typing only changes a draft.
- Enter, or leaving the field, commits the draft:
  - a value outside 10–100 in is rejected, with a message linked to the
    field;
  - an unchanged value does nothing;
  - anything else requests the size, and the dialog above asks.
- Escape puts the field back.

Because a typed size now applies once, the per-field coalesce keys from fix 01
(`customSize:width`/`height`) are gone.

**Copy.** Layout › Templates now reads: "Pick a starting layout. Applying one
replaces your blocks with its empty layout; you can undo it. To tidy the blocks
you already have, use Auto-Arrange above."

**Accessibility.** `ConfirmModal` is now announced as a dialog: `role="dialog"`
and `aria-modal`, named by its title and described by its message. This applies
to every confirmation in the app. The change only adds attributes.

**Fix 01 tests that changed with the behaviour** (`sidebarHistory.test.tsx`):
- The width and preset controls now commit and confirm.
- The two custom-size rows of the "continuous input" table were removed, since
  those fields are no longer continuous.
- The F2 tests use the Style-tab title size in place of the width field.
- The F1 tests reach "a size change drops the mark" by committing a 10-inch
  height on a poster whose one large block leaves the mark only a thin band.
  Until now they reached it through the transient 2-inch sheet, and that path
  is gone.

**Fix 01's mutation spec** (`01-sidebar-undo-history.mutants.json`):
- The two custom-size-key mutants were removed, since that code is gone.
- `redo-unguarded` and `redo-drops-reinstated-mark` were first recorded here
  as blind spots that no UI path reaches. The review of B–D showed that was
  wrong (R1 in section 9). Both are gated again and killed, by the
  store-contract test in `blockLock.test.ts`.

The committed browser harness `sidebar-history-check.mjs` confirms the
size dialogs in its scenarios. `size-preset` is no longer marked KNOWN.

**After the review of B–D** (section 9):

- **`ConfirmModal`, for every confirmation in the app.**
  - Focus moves to the confirm button once the dialog is on screen. The old
    effect ran while the component still rendered nothing, so focus stayed
    behind the dialog.
  - `onCancel` is read through a ref. Before, every parent render re-ran the
    focus effect and moved focus onto the confirm button, so Enter or Space
    applied a change the user had not chosen.
  - Tab is trapped inside the dialog, and focus goes back where it was on
    close.
  - The text shown while open stays on screen during the fade-out.
- **One confirmation at a time.** A size or template request while one is
  open is ignored. Before, it stacked a second dialog, or silently changed
  what the open one would apply: width 40, Tab, height 30 asked about 40 × 36
  and applied 48 × 30.
- **Editor shortcuts wait while a dialog is open.** This covers undo, redo,
  ⌘/, delete, nudge and duplicate. Before, Backspace behind the dialog
  deleted the selected block, so Cancel did not leave the poster as it was.
  A dialog that is fading out does not count; the existing "one ⌘Z" tests
  caught a first version of the guard that blocked ⌘Z during the fade.
- **The size menu by keyboard.** A closed `<select>` fires `change` on every
  type-ahead key. So "A" opened a dialog for A0 Landscape, and the space in
  "A0 P" pressed its button. A keyboard change now only moves the menu:
  Enter or leaving it asks, and Escape restores it. A mouse pick still asks
  at once. The menu lives in `SheetSizeFields` with the fields, and one
  request path serves both.
- **Geometry.**
  - Upright blocks scale their edges and derive their size from them. A
    flush block no longer lands 0.01 past the edge, which ISSUES had
    flagged. A block that fitted is clamped inside.
  - Rotated blocks move their centre with the sheet and stretch along their
    own sides. A 90° side label kept its length and its place, where it used
    to end 4.17 units past a 360-unit sheet.
- **The credit-mark scan** (`ackPlacement.ts`) always tries the last row and
  the last column. Stepping from one end skipped the top-margin row, so a
  size change dropped the mark while the new sheet had 449 legal spots.
  - This also makes the redo guard reachable, which I had documented as
    unreachable. A store-contract test now covers it in
    `blockLock.test.ts`: the old REDO test there could not fail, because
    `setBlocks` puts the block back itself.
- **The mutation tool.** A "blind spot" that is killed after all now fails the
  run, so a stale claim like mine cannot sit in a spec.

**After the re-check of B–D** (section 9). Three shared causes:

- **A confirmation dialog owns the keyboard while it is open.** Before, each
  key handler in the app decided for itself whether to act, and focus went
  straight to the dialog's action. `ConfirmModal` now:
  - listens on the window in the capture phase and stops every key there,
    so no handler behind it acts. That covers the editor's shortcuts, a
    table's range delete, crop mode and another dialog's Escape. Every other
    key listener in the app listens in the bubble phase; a window capture
    listener added before the dialog opened would still run first (none
    exists today). Stopping a key does not cancel what the browser does with
    it, so typing and pressing the focused button still work;
  - answers only when it is the innermost open dialog, so one Escape closes
    one dialog;
  - ignores a held Enter or Space (a repeated keydown), so the press that
    opened it cannot go on to press its button;
  - opens with focus on Cancel when its action cannot be undone (`danger`:
    every delete), on the typed field when there is one, and on the action
    otherwise;
  - can hold focus itself (`tabindex="-1"`), so a click on its text keeps
    focus inside, and keeps Tab and Shift+Tab inside wherever focus is;
  - focuses the typed field from the same effect instead of `autoFocus`.
    `autoFocus` ran first, so the dialog took its own field for the opener
    and gave focus to nothing when it closed;
  - keeps its button labels while it fades out, as it already kept its title
    and message.

  PosterEditor's own shortcut guard stays, for the other modal dialogs (the
  preview, the logo picker and others).
- **A turned block scales in a way the reverse change undoes.** Each side of
  a block turned by θ stretches by sx^cos²θ · sy^sin²θ (the width) and
  sx^sin²θ · sy^cos²θ (the height). At 90° this is the swap the side label
  needs; at 0° and 180° it is the upright rule. The reverse change multiplies
  by the inverse, so a round trip gives the block's SIZE back exactly. The
  earlier rule, the length of the scaled side, grew a 45° block by 17% per
  side per round trip. A block turned by a multiple of 180° covers its own
  box and now goes through the upright, edge-based path.

  A turned block drawn inside the old sheet is moved back inside the new one
  if its new shape overhangs. This is not only rounding, as a first version
  of this record said: the drawn extent of a tilted block does not scale
  exactly with the sheet, so a block near an edge can overhang by tens of
  units, and it is moved in by that much (final review, logic F1). A round
  trip then does not give its POSITION back: on the final review's preset
  sweep, at 45° 15,162 of 53,508 moves shifted a block by more than 0.011
  units (the largest 45.02), and round trips left blocks up to 69.61 units
  (about 7 in) from where they started; at 90°, 180° and 270°, none moved.
  The choice is between a block that sticks out and is cut off in print and
  a block moved in by the same amount; moving it in does what the user
  would otherwise have to. ⌘Z still puts the size and every block back
  exactly. A block that was already hanging off the old sheet keeps its
  relative place.
- **ISSUES checks the box a block is drawn in.** `checkBounds` read the
  stored box, which for a turned block is not where it is printed: a 90° side
  label drawn inside was flagged, and one drawn past the edge was not.
  `drawnBox` (in `blockGeometry.ts`, next to `effectiveTop`) is now the one
  definition, used by ISSUES' edge check, its overlap check (since the final
  review) and the size change. It is exact for upright blocks and quarter
  turns; for other angles it is the turned block's bounding box.

And two smaller changes in the size fields:
- Width and height are one change. Moving from one to the other asks
  nothing. Enter, or leaving both, asks about what both hold. Before, the Tab
  to the height opened the dialog, and the height the user went on to type
  landed on its button, so the width alone was applied.
- Pressing the mouse on the size menu drops any keyboard choice. Before, a
  pick of the current size left the keyboard choice showing, and leaving the
  menu asked about it. A first version dropped it at the pick; the Chromium
  re-run of the reviewer's harness showed that a picker which takes focus
  when it opens (Chromium's in-page picker; pickers on some platforms) then
  asked about the keyboard choice before any pick, so it is dropped at the
  mouse press.

**After the final review** (section 9):
- **Dialogs that open on their own.** The "Duplicated" prompt opens when the
  copy is saved, not when the user acts, so it now opens with focus on "Stay
  here" (`initialFocus`). With focus on "Open copy", a space typed as it
  arrived opened the copy; main did the same. (The keystrokes lost when the
  copy opens are a separate autosave problem, handed on: section 10.) A
  dialog inside a part of the page that is hidden and inert (the editor
  under Preview) leaves the keys alone.
- **⌘S and ⌘D behind a dialog.** The editor prevented the browser's Save Page
  and bookmark dialogs for its own shortcuts; with the dialog stopping those
  keys first, it now prevents them itself. Text-editing shortcuts in the
  typed field are left alone.
- **A rejected side keeps the other.** An out-of-range width no longer throws
  away a valid height typed in the other field: only the rejected side goes
  back to the poster's size.
- **On the edge means within half a hundredth.** Positions are stored to a
  hundredth, so a turned block flush with an edge can be drawn half a
  hundredth past it. ISSUES and the size change's "was it inside" check both
  allow that (`ON_EDGE`). Upright blocks' edges are whole hundredths, so
  nothing changes for them.
- **Overlaps use the drawn blocks.** ISSUES reported a 90° label over a
  block drawn 10 units beside it, and missed an image drawn on top of it. (A
  first version compared bounding boxes; see the next list.)
- **One size, whichever door.** The share page falls back to the row's own
  size as the editor does, and restoring a version with no usable size
  takes the poster's current size (`setPoster`'s `sizeFallback`).

**After the last-round verification** (section 9):
- **Overlaps are exact at any angle.** Comparing the bounding boxes of tilted
  blocks reported blocks up to 24 in apart as printing on top of each other.
  `drawnOverlap` (in `blockGeometry.ts`) compares the drawn outlines along
  each block's side directions (the separating-axis test). For two upright
  blocks it is the old test.
- **Heights are measured with their fraction.** A browser's `offsetHeight` is
  whole pixels; after a size change an image 248.25 tall read 248, so a
  flush turned image was flagged 0.12 past the edge (in Chromium; the jsdom
  test had been fed a fraction no browser returns). The editor now reads
  the block frame's computed height (its border box, before zoom and
  rotation), and falls back to `offsetHeight` only when that is not a
  number.
- **A saved rotation that is not a number is treated as upright**, by ISSUES
  and by the size change (it made every overlap check true, and would have
  given the block NaN geometry on a size change).
- **Only the dialog in view owns the keyboard.** Modals stack in page order,
  so a dialog with another open modal dialog after it on the page is covered
  (an async prompt under the logo picker). It neither takes focus nor stops
  keys. This replaces the list of open dialogs, and still means one Escape
  closes one dialog.
- **Platform shortcuts.** ⌘S and ⌘D are prevented on a Mac, Ctrl+S and
  Ctrl+D elsewhere; on a Mac, Ctrl+D is a text key (delete forward) and
  reaches the typed field.
- **Leaving the size fields after a rejection puts both back.** A rejection
  on leaving both fields resets both. After Enter rejects one side, the other
  side's typed value is kept, and leaving then asks about what the fields
  hold (48 × 30 after width 5 and height 30). A size change from anywhere
  else clears any draft and message.

**After the round-7 audit** (section 9):
- **The dialog that answers a key stops it for every other listener**
  (`stopImmediatePropagation`). With the "Duplicated" prompt open first and
  a size dialog opened under it, one real Escape closed both: a browser runs
  a microtask between window listeners, the prompt was marked as closing in
  between, and the size dialog then found itself in view.
- **A dialog uncovered when the dialog over it closes takes focus.** It had
  sat visible with focus behind it until the next key.
- **A rotation saved as a numeric string is read as the canvas draws it**
  (CSS turns `rotate(30deg)` from "30"); it had been checked as upright.
- **Overlaps: an exact fast path.** Upright and quarter-turned blocks are
  compared on their boxes, which is exact, and for upright blocks is the old
  x and x + w arithmetic to the bit (computed from centres, an overlap of
  exactly 2.00 came out as 2.000000000000057 and was reported). For any
  other pair, boxes that do not meet end the check before the exact test.
  Measured per call (Node, M4 Max): 100 blocks, 0.24 ms upright and 0.65 ms
  with 20% tilted, against 0.19 and 0.24 ms for the bounding-box version and
  10.58 ms for the audited version.

## 8. Results after the fix

All MEASURED, on the final code unless marked.

**Tests** (counts on the final code):

| file | cause | tests | covers |
|---|---|---|---|
| `poster/__tests__/sheetSize.test.tsx` | A | 39 | canvas, menu, templates, Auto-Arrange, new blocks, preview label, ISSUES, zoom-to-fit, each dimension on its own, unusable stored sizes, the drawable range, exact naming |
| `poster/__tests__/sheetConsumers.test.tsx` | A | 8 | preview sheet, grid, frame, both centre guides, area comments, the figure-size check, overflow growth |
| `pages/__tests__/EditorSheetSize.test.tsx` | A | 9 | the routed Editor's load repair, the row fallback, repair before an empty poster is laid out; the share page's row fallback |
| `poster/__tests__/restoreSheetSize.test.tsx` | A, B | 8 | Versions › Restore of a snapshot with an unusable size (the poster's current size is the fallback), and a size change after it |
| `stores/__tests__/posterStore.test.ts` | A | 22 | (4 new) `setPoster` repairs the size |
| `poster/__tests__/autosaveSheetSize.test.tsx` | E | 1 | the save after a size change carries it |
| `data/__tests__/posters.test.ts` | E | 28 | (3 new) a duplicate's size |
| `poster/__tests__/posterSize.test.tsx` | B–D | 100 | the hypotheses of section 2 and every review's findings: turned blocks, ISSUES on the drawn box, the size fields as one change, the menu, shortcuts behind dialogs, the Duplicated prompt |
| `components/__tests__/ConfirmModal.test.tsx` | B–D | 23 | dialog role, first focus, trap from anywhere, focus restore, fade-out, held keys, keys behind the dialog, stacked and covered dialogs, platform shortcuts, inert |
| `poster/__tests__/sidebarHistory.test.tsx` | fix 01 | 53 | moved onto the new flow |

Results:
- Every file passes.
- The whole web suite passes 2921/2921 in 177 files (main: 2723).
- `tsc -b` passes.
- Each commit was checked on its own tree: cause A 2788/2788 (174 files),
  cause A + E 2792/2792 (175 files), both with `tsc -b` clean.
- Before the fix, 16 of the 24 original hypothesis tests failed, each for
  its predicted reason.

**Falsification by part** (`apps/web/scripts/mutation-check.mjs`), final code:

| spec | control | result |
|---|---|---|
| `02-poster-size.sheet.mutants.json` (cause A) | 102/102 | 36/36 killed; 2 documented equivalents (below) |
| `02-poster-size.row.mutants.json` (cause E) | 29/29 | 4/4 killed; 1 documented equivalent (below) |
| `02-poster-size.resize.mutants.json` (causes B–D) | 309/309 | 89/89 killed; 2 documented equivalents (`focus-before-mount`; `half-turn-as-turned`, which differs by at most 0.01 units over 168 flush 180° moves) |
| `01-sidebar-undo-history.mutants.json` (fix 01, re-run on the new code) | 112/112 | 33/33 killed; no blind spots left |

The three equivalents in the sheet and row specs are second guards behind
the store repair: the editor's own size check, the preview label's, and
autosave's. Once the store repairs every document and the fields accept only
10–100 in, no user path gives them an unusable size. At the cause-A and
cause-E commits, before cause D, a typed size still reached them, so those
commits' specs list them as blind spots instead.

Two B–D mutants survived the first draft of the tests, and a test was added
for each:
- **A dialog on every keystroke.** Nothing asserted "no dialog while typing".
- **The credit mark scaled like a block.** The fixture's mark sits exactly on
  the left margin. Every preset is 48 in wide or narrower, so the moved mark
  lands inside the margin and is placed again at 12 × 12, which hides the
  mutant. A wider custom sheet exposes it.

**Real browser: the independent confirmer's harness**
(`size-claims-check.mjs`, 42 scenarios, 3 runs each), on the cause-A fix. Every
cause-A claim flipped from observed to not observed, 3/3 each:
- the canvas, on 30 × 40 and 48 × 24;
- templates and Auto-Arrange;
- re-picking 48 × 36;
- ISSUES;
- print on 30 × 40 and 48 × 24: `@page` 30in × 40in, the preview 300 × 400
  labelled "30"×40" Custom", and a real Chromium PDF of 30 × 40 in;
- PPTX.

All 20 controls stayed OK. One D1 variant also flipped, but only because its
pass condition included the drawn canvas size. The keystrokes it checks still
applied as before (`42x3`, `42x36`); cause D was fixed separately.

**Real browser: the sheet map's harness** (`size-map.mjs`, 27 scenarios), main
against the cause-A fix:

| scenario | main | fix |
|---|---|---|
| 60 × 40 poster: canvas / zoom-to-fit / ISSUES | 480 × 360 / 1.2 / "9 blocks outside poster bounds" (false) | 600 × 400 / 0.96 / none |
| Issues tab count on that poster | 11 | 2 |
| "+ Text" on a 30 × 20 poster | 1 block off the sheet | 0 |
| Preview of 60 × 30 | aspect 1.333, "48"×36" Landscape" | aspect 2.0, "60"×30" Custom" |
| Share page, 60 × 40 | 8 blocks flagged | 0 |
| Importing a 36 × 24 PPTX (auto-arranged) | 5 blocks outside the sheet | 0 |
| Template on 40 × 24 | 9 blocks clipped in print | 1 (the template's own overflow, not this cause) |
| Auto-Arrange on 40 × 24 | 4 clipped | 0 |
| Typed 40 × 24 (per keystroke, before cause D) | 0 flagged while print clips 9 | 9 flagged, matching print |
| Dashboard thumbnail of 60 × 40 | 400 × 300 | 400 × 266 |

**Real browser: fix 01's committed harness** (`sidebar-history-check.mjs`), on
the final code: controls OK and **0 of 14 defects**, exit 0. `size-preset`
is now a gated scenario and passes. The custom-size scenarios commit with Enter
and confirm the dialog.

**Real browser: this fix's committed harness** (`apps/web/scripts/poster-size-check.mjs`).
The independent confirmer's harness, adapted after the fix so its claims gate:
every size or template action answers the dialog as a user would; the claims
keep the confirmer's measurements; exit 1 if any claim is observed. On the
final code, RUNS=3: 47 scenarios, 141 results: 87 claim checks not observed,
51 controls OK, 3 informational; **exit 0**. On main (ea5ad40), RUNS=3: all 11 claims observed, in 84 of 87 claim checks
(the 3 others are `a2-arrange-48x24`, whose short content never shows the
defect, as in the confirmer's first run), 51 controls OK; **exit 1**.

**Real browser: the B–D re-check reviewer's own harness**
(`recheck-final.mjs`, not committed; RUNS=2) on the final code. Each finding's
scenario now measures the fixed behaviour:
- delete dialogs (Home, Profile "Delete all posters", Versions) open on
  Cancel; Enter, Enter and a held Enter delete nothing (0 of 2 runs each);
- after a click on the dialog's title or message, 6 Tab or Shift+Tab presses
  stay inside it; Home's dialog cannot be re-targeted (0 deletes);
- under the size dialog, Backspace leaves a selected table range as it was
  (0 changes); Escape keeps a crop in progress and cancels only the dialog;
  Enter on "Change size" applies the size and keeps the crop; with no dialog,
  crop mode's Escape still reverts the crop;
- a held Enter on a template, the size menu or the width field changes
  nothing;
- with the size dialog and the "Duplicated" prompt both open, one Escape
  closes only the prompt, and focus returns to "Change size";
- the typed delete-account dialog opens on its field, Tab and Shift+Tab
  move between the field and Cancel, and closing it by Escape or Cancel gives
  focus back to "Delete account" (2 of 2 runs each; before: the page body);
- a native mouse pick of the current size after a keyboard choice asks
  nothing, and a pick of another size asks about that size.

**Real browser: the later reviewers' own instruments, re-run on the final
code** (not committed): the final review's and the last-round verification's
browser harnesses (53 scenarios: the Duplicated prompt while typing and
under Preview, ⌘S/⌘D behind every dialog, first focus in every dialog, the
size menu and fields, the share page, restore), the logo-picker scenario,
the L-1 skeptic's size-field instrument and the F2 skeptic's measurement
instrument. Every finding they measured is now not observed: for example
Ctrl+D deletes forward in the typed field, the prompt under the logo picker
leaves focus and typing in the logo search (2 of 2), the full-height turned
image measured at offsetHeight 248 is not flagged, and after a rejected
width, leaving the fields shows 48 × 36 again.

**Real browser: the round-7 audit's instruments, re-run on the final code.**
One Escape with the Duplicated prompt over a size dialog closes only the
prompt, in both opening orders (the skeptic's instrument: 0 of 5 closed
both, each order; the audit's harness: 3 of 3), and focus then moves to
"Change size". A rotation saved as "30" is flagged when drawn past the edge,
as 30 is. The full-height image with no caption label is not flagged at a
browser's offsetHeight of 248 (computed 248.25px); with the default label it
is drawn to 471.7 on 468 and is flagged. Measuring 241 blocks took a median
1.1 ms (offsetHeight: 1.9 ms). The committed size harness exits 0 and fix
01's reports 0 of 14 defects.

The B–D re-check reviewer's harness exits 2 because one scenario (`r2b-h3-shift-tab-auto-arrange`) must reach
the Auto-Arrange button behind the dialog by Shift+Tab and now cannot. That is
the fixed behaviour; the harness predates the fix.

**The pre-fix confirmer harness cannot judge B–D as written**, and the final
run exits 2, because it expects the old behaviour:
- It clicks empty canvas after each action; the dialog's backdrop now covers
  the canvas ("no empty canvas point found", 8 scenarios × 3).
- One control expected a filled-in height to apply at once.

That is the new behaviour working. It is not evidence either way about B–D,
which is checked by the independent review in section 9 instead.

## 9. Review of the fix

### Cause A: independent review (workflow, 10 agents)

Three reviewers each used a different method:
- data and code paths, in jsdom;
- the real app in Chromium;
- the tests, by mutation.

Each finding above LOW went to a separate skeptic, who used its own method.
All four skeptics confirmed their finding by measurement.

**Findings in the fix, all acted on:**

| id | finding | how it was confirmed | change |
|---|---|---|---|
| A1 (MEDIUM) | A poster whose saved `widthIn` is missing or not a number now has a NaN sheet. Auto-Arrange cut it from 7 blocks to 2, and the import flow runs Auto-Arrange by itself and autosaves the result. The old 48 × 36 fallback had hidden this | reviewer: jsdom, 2 runs; skeptic: real Chromium against a production build | the validity rule and load repair (section 7). The author's tests were red first: of 4 blocks, only `t1` survived Auto-Arrange; a new block landed at NaN |
| A2, A3 (LOW) | A size of 0, below 0 or under 2 in drew a 0–5 px sheet, and Auto-Arrange wrote negative widths. There was no upper bound: typing 4800 built 28,749 DOM elements | reviewer | the same rule for stored sizes; typed sizes are 10–100 in since cause D |
| F1 (MEDIUM) | The zoom "blind spot" was not one. Zoom can be tested in jsdom by stubbing the workspace box, and three zoom mutants survived | reviewer and skeptic | four zoom tests, including one where swapped width and height would pick the wrong ratio; all three mutants are now killed |
| F2 (MEDIUM) | The fixtures could not catch a regression in one dimension only. Every custom poster was taller than the 36 in fallback, and the ISSUES test's offending blocks were past both bounds | reviewer and skeptic | per-dimension tests: on 30 × 40, a block past the right edge is flagged while a block low on the sheet is not; a template on 48 × 30; Auto-Arrange on 48 × 24. The height-only, swapped and per-site mutants are now killed |
| F3 (MEDIUM) | Seven consumers had no committed test | reviewer and skeptic (whole suite, 2,734 tests: each one-site mutant survived) | five tested (preview sheet, grid, frame, drag-guide centre, area comment). Two are documented blind spots: the figure-size check's drag, where no test drives it (INSPECTED only), and the overflow growth, where jsdom measures no painted height |
| F5 (LOW) | The mutation tool reported a mutant that does not compile as a blind spot | reviewer | now an error, exit 2 (self-test MEASURED) |
| F7 (LOW) | 13 unused imports in the test | reviewer | removed |
| A6/R7 (LOW) | Preset naming used half an inch of tolerance | reviewer | exact to 0.05 in |
| R1 (MEDIUM) | The dashboard card crops a resized poster's thumbnail: the card's shape comes from row columns that are never written. Cause A made this visible, because thumbnails now have the real shape (a 30 × 40 thumbnail showed 56% of its height) | reviewer and skeptic (own harness; typed sizes, then the dashboard) | cause E, with its own tests and mutants |

**Handed on** (existed before the fix; details in `docs/stress-test/PLAN.md`):
- The rulers are misregistered by (container − frame) / 2 − 96 px on any
  centred axis, plus the ruler bar: 2 in and 9.5 in on a 48 × 36 poster
  at 1440 × 900. This is item 4's cause (R2, confirmed by a skeptic).
- The Zoom-out button zooms in when the fit is below its 0.3 floor (R5).
- Zoom-to-fit leaves 36 px out of view (R9; item 3).
- The area-comment label divides inches by 10 a second time (R10).
- The print popup's on-screen view squeezes posters wider than about
  84 in; the PDF is unaffected (R11).
- The figure-size check's default rectangle is set for 48 × 36 (R3/A5).
- `PosterSizeKey` is just `string` (A7).
- The drag guide reads the stored height, not the rendered one (R8).
- The 3-column template overflows short sheets (A8/R6/F8).
- Version restore drops the credit mark (both reviews of this fix measured
  it).

**Re-check of the changes above** (workflow: two reviewers, data and flows in
real Chromium and the tests by mutation, each finding then checked by a
skeptic). It ran on a frozen copy of the cause-A code alone, before causes B–E
were added. Every finding below was MEASURED by its reviewer. The ids are the
reviewers' own; RD is data and flows, RT is tests.

| id | finding | status on the final code |
|---|---|---|
| RD1 (MEDIUM) | A size typed or restored during a session skipped the rule: typing 1189 drew 48 in while Save PDF printed 1189 in and the data kept 1189, so one poster had three sizes | typed: cause D rejects anything outside 10–100 in (`posterSize.test.tsx`: "typing 1189 … is rejected"). Restored: the rule moved into the store's `setPoster`, the one door that opening, sharing, importing and restoring all use. `restoreSheetSize.test.tsx` restores through Versions › Restore › confirm; removing the store repair fails 3 of its cases and 4 store tests (mutant `store-no-repair`, 7 failures) |
| RD2 (MEDIUM) | Clearing a field and typing 24 committed 3024 | fixed by cause D, where typing only edits a draft ("clearing the height and typing 24 asks about 24") |
| RD3 (LOW) | Restoring a version skipped the load repair: blank Letter PDF, empty size fields | the store repair above |
| RD4, RT2 (LOW) | Sheets from 1 to 2 in still gave every block a negative width in Auto-Arrange, including the automatic arrange after importing a 1-inch PowerPoint slide | the smallest usable sheet is now 3 in, where 1-inch margins still leave a column. "A width of 2.9 is unusable" was red first (drawn at 29 px) |
| RD5 (LOW) | The fallbacks disagreed. Opening ignored valid row columns, and duplicating fell back to unchecked columns and could write 0 × 0 | both now use one rule, `usableSheetSize(data, row fallback)`: the poster's own size, then the row's if usable, then 48 × 36. Red first: opening gave [48, 36] instead of the row's [30, 40]; duplicating wrote [0, 0] |
| RD6 (LOW) | Cause E fixes a stale row only on the next edit, so a legacy poster opened and not changed keeps a cropped card | accepted; handed on (PLAN.md). Fixing it needs a write on open, or a migration |
| RT1 (MEDIUM) | No test pinned the drawable range; a one-constant change broke every poster over 60 in | "the drawable range is pinned": 3, 72 and 1000 in are drawn as stored, 2.9 and 1000.1 are not. Five bound mutants are killed |
| RT3 (LOW) | A typed width outside the range was stored and printed as typed but drawn as 48 | typed: cause D. Stored: the store repair |
| RT4 (LOW) | The two "blind spots" (figure-size check, overflow growth) are testable in jsdom | tested in `sheetConsumers.test.tsx`; both mutants are gated and killed |
| RT5 (LOW) | The guides' vertical centre was untested | "dragging a block to the vertical middle lights the centre guide at y = 200"; mutant killed |
| RT6 (LOW) | Naming and exact drawing were only partly pinned: a width-only match, 0.2 in and 0.001 in tolerances, and a rounded sheet all survived | naming tests in both dimensions and at two decimals, plus A0 drawn at 331 × 468; four mutants killed |
| RT7 (LOW) | Nothing pinned what autosave does with an unusable size | the store repair makes it unreachable: no user path gives autosave an unusable size. Kept as a second guard and recorded as an equivalent mutant |
| RT8 (LOW) | Two orderings were unpinned: repair before an empty poster is laid out, and the duplicate's check before it writes | both tested ("an empty poster with no size is laid out on the repaired sheet"; "no usable size anywhere gets the default size"); mutants killed |
| RT9 (LOW) | The checker's unloaded-file guard has no committed self-test, and its two conditions overlap | accepted; handed on. The guard's behaviour was MEASURED by hand in both reviews |

Two reader-side checks now sit behind the store repair: the editor's own
`usableSheetSize` and the preview label's. No user path reaches them, and
their mutants are recorded as equivalent (`expect: "survive"`). They stay
because a document that ever reached the store another way would otherwise
draw a NaN sheet, and Auto-Arrange would delete its blocks.

### Causes B–D: independent review (workflow, 12 agents)

Three reviewers used different methods: logic in jsdom, real Chromium with
real keys, and the tests by mutation. Every finding above LOW went to a skeptic
with its own instrument, and all eight were confirmed by measurement.

| id | finding | how it was confirmed | change |
|---|---|---|---|
| BD-BR-1 (HIGH) | Width 40, Tab, height 30: the dialog read "40 × 36" and "Change size" applied 48 × 30; the typed width was lost | reviewer 3/3 and skeptic, both in real Chromium | one confirmation at a time, and focus into the dialog |
| BD-1, BD-BR-2 (MEDIUM) | Focus never entered the dialog; 91 of 93 tabbable elements were outside it. The cause is older than the fix (every `ConfirmModal`), but the fix put this dialog in front of a keyboard path | reviewer and skeptic | focus on mount, trap |
| BD-BR-3 (MEDIUM) | With focus on Cancel, an autosave re-render moved it to "Change size" 804 ms later, and Enter then applied the change | reviewer and skeptic | `onCancel` read through a ref; the focus effect is keyed on open and mount only |
| BD-BR-4 (MEDIUM) | Type-ahead "A0 P" applied A0 Landscape with no deliberate confirmation (18/18 runs) | reviewer and skeptic | the keyboard menu commits on Enter or leaving |
| BD-BR-5 (MEDIUM) | Two dialogs were open at once, and Enter confirmed the hidden one | reviewer and skeptic | one at a time, and the trap |
| BD-2 (MEDIUM) | Backspace, arrows and ⌘Z behind the dialog changed the poster, so Cancel did not undo that. The handlers are older than the fix | reviewer and skeptic | the shortcut guard |
| R1 (MEDIUM) | My blind-spot claim was wrong: the two fix-01 redo mutants are reachable (credit mark nudged to the top margin, height 18) | reviewer and skeptic, in a real browser | the placement scan fix, plus the store-contract test; both mutants are killed again |
| R2 (MEDIUM) | Which template is applied was untested. Always applying 3-Column Classic survived all 82 tests | reviewer and skeptic | a Billboard test; two mutants added |
| BD-3, BD-5, BD-7/BR-7 (LOW) | flush-edge rounding; a 90° label past the edge; a blank title while fading | reviewer | fixed, each with a test that was red first |
| R3–R6, R8 (LOW) | untested: area-changing sizes, the mark moving vertically, the rejection message, the upper bound, fractional sizes, the selection being cleared, stale blind spots in the tool | reviewer | tests added; the tool fixed |
| BD-4 (LOW) | When the mark is placed again beside a row of logos, it is sized to that row (12 → 24) | reviewer | not changed: that is the rule it was seeded with. Section 7's claim that it has a "fixed size" was corrected |
| BD-6, BR-6, BR-8 (LOW, existed before) | the credit mark on top of a template block; shortcuts behind other dialogs; focus lost after closing | reviewer | BR-6 and BR-8 are fixed by the guard and the focus restore; BD-6 is handed on |

Six new tests in `posterSize.test.tsx` were red before the changes, each for
the reason the review reported:
- a keyboard change asked at once;
- shortcuts behind the dialog changed the poster;
- two dialogs were open;
- a flush edge landed at 420.01;
- a rotated label ended at 364.17;
- the top-margin mark was dropped.

All five `ConfirmModal` tests were also red first, as were the two placement
tests.

**Re-check of these changes** (workflow, 7 agents: three reviewers — real
Chromium with real keys, logic and geometry in jsdom, the tests by mutation —
and a skeptic for each finding above LOW). It ran on a frozen copy of the
code above, before the cause-A re-check's store repair. The reviewers
reused the id "RB-n", so here BK is the browser reviewer, BG logic and
geometry, BT the tests. All four MEDIUM findings were confirmed by a
skeptic's own measurement. The LOW ones were not sent to a skeptic; each was
reproduced by a test that was red before its change, unless marked.

| id | finding | status on the final code |
|---|---|---|
| BK-1 = BT-1 (MEDIUM, made by this fix) | Every delete dialog opened with focus on Delete, so Enter, Enter or a held Enter deleted permanently: Home, Profile "Delete all posters", Versions, 4/4 runs each. Main deleted nothing, because focus never entered the dialog | a dialog whose action cannot be undone opens with focus on Cancel. Red first ("expected 'Delete' to be 'Cancel'") |
| BK-2 (MEDIUM, older) | After a click on the dialog's text, Shift+Tab left it; 8 more reached Auto-Arrange, and Cancel then left the poster changed. On Home it re-targeted the open delete dialog to another poster | the dialog can hold focus, and Tab is trapped wherever focus is. Red first (focus stayed on the page body; `tabindex` absent) |
| BG-1 = BT-8 (MEDIUM, made by this fix) | A block at 15°–75° grew on every there-and-back size change: 45°, 120 × 40 became 192.27 × 64.1 after 3 round trips | the blend-of-powers rule. Red first at 15°, 30°, 45°, 60°, 75°, 135° and −30° (45°: 192.3 × 64.1 after 3 trips); all now give 120 × 40 back |
| BK-3 (LOW, older) | Keys behind the dialog still acted: Backspace cleared a selected table range; Escape reverted a crop; crop mode's Enter blocked "Change size" | the dialog stops every key before any other handler. Red first: a window and a document listener received 12 keys |
| BK-4 (LOW, made by this fix) | A held Enter confirmed the size and template dialogs (4/4) | a repeated Enter or Space is swallowed. Red first in jsdom (the key's default action was allowed); jsdom does not press buttons on Enter, so the outcome is checked in Chromium (section 8) |
| BK-5 (LOW, made by this fix) | The async "Duplicated" prompt could open over a size dialog, and one Escape closed both | only the innermost dialog answers. Red first (both dialogs' Cancel ran). Two dialogs can still be open at once; that is left as it is |
| BK-6 = BT-7 (LOW, older) | The typed-confirmation dialog (Profile › Delete account) gave focus to nothing when it closed, and its button read "Delete all" while it faded | the effect focuses the typed field instead of `autoFocus`; labels stay while fading. Red first (focus after close: none; button during the fade: missing) |
| BK-7 (LOW, made by this fix) | A keyboard choice on the menu survived a mouse pick of the current size, and leaving the menu then asked about it | pressing the mouse on the menu drops the keyboard choice. Red first (the menu still showed 36×48), and again for a picker that takes focus when it opens (a dialog asked about 36 × 48 before any pick) |
| BK-8 (LOW, made by this fix) | Width, Tab, height, Enter applied the width alone: the dialog opened on the Tab and the typed height went to its button | the two fields are one change. Red first (a dialog opened on the move to the height). The reviewer called this an owner decision; section 10 says why it was changed |
| BG-2 (LOW, made visible by this fix) | ISSUES flagged a 90° label drawn inside the sheet after a size change (sweep: 1,274 of 11,200 moves at ±90°), and missed blocks drawn past the edge (771 at 45°) | ISSUES checks the drawn box. Red first both ways |
| BG-3 (LOW) | After restoring a version saved with a missing, 0 or 1200 in width, a size change left the blocks in place or shrank them to 3% | explained by the same cause as cause-A re-check RD1: the store now repairs every document it receives. `restoreSheetSize.test.tsx` restores each such snapshot and changes the size; the blocks move in proportion from 48 × 36. These tests passed when written, on the repaired code; removing the store repair fails them (mutant `store-no-repair`) |
| BG-4 (LOW, older) | A 180° block flush with the edge landed 0.01 past it (420.01 on 420), and ISSUES warned | multiples of 180° take the edge-based path. Red first (420.01) |
| BG-5 (LOW, older, no worse than main) | The credit-mark scan misses a free band 12–17 units tall that holds no scan row: in a sweep of 347,760 moves, 7,442 drops had a legal spot | not changed; handed on (PLAN.md). Main misses all of these too |
| BT-2 (LOW) | The shortcut-guard test pressed ⌘Z with nothing to undo, so a missing undo guard survived | two tests nudge a block first, then press ⌘Z behind the size dialog and behind the preview |
| BT-3, BT-4 (LOW) | User-visible mutants survived: the template dialog promising blocks are kept, 100 in rejected, a rejected value left in the field, the message kept after Escape, the dialog's name pointing at nothing, a frozen dialog text, the menu's mouse and Enter paths, a 270°/−90° label, the placement scan's last column above the band | a test for each; each mutant is in the resize spec (section 8) |
| BT-5 (LOW) | The mutant documented as equivalent (`focus-before-mount`) was not: `autoFocus` made the first run's cleanup take focus off the typed field | `autoFocus` is gone and the effect focuses the field. The equivalence argument is re-stated in the spec and re-measured (section 8) |
| BT-6 (LOW) | The sheet spec's two blind spots are testable | done in the cause-A re-check |
| BT-9 (LOW) | This record still called the fix-01 redo mutants blind spots and gave old counts | corrected (sections 7 and 8) |

### Final review of both re-check responses (workflow, 8 agents)

Three reviewers again used different methods: real Chromium with real keys
(against this code, the previous re-check's tree and main), logic and
geometry probes and sweeps, and the tests by mutation plus an audit of this
record's claims. A skeptic checked every finding above LOW; all four were
confirmed by the skeptic's own measurement. The reviewers found no HIGH
issue, and confirmed in Chromium that every dialog fix above holds (0
deletes by Enter, Enter or a held Enter on every delete dialog; 0 editor
changes from 11 shortcuts behind a dialog; the typed field still takes
typing, paste and arrow keys). Ids are per reviewer: F (browser), logic F,
RF (tests).

| id | finding | status on the final code |
|---|---|---|
| logic F1 (MEDIUM, made by this fix) | The move back inside is not only rounding: it shifted tilted blocks by up to 45.02 units, and round trips left them up to 69.61 units from where they started. This record claimed a round trip gave the block back | kept, and this record corrected (sections 7 and 10) with the reviewer's numbers: the choice is a block cut off in print or a block moved in by the same amount. The size still round-trips exactly, and a block the user hung off the edge keeps its place (a test for each) |
| F2 = RF-5 (MEDIUM, as on main) | The async "Duplicated" prompt took focus on "Open copy" while the user typed; the next space opened the copy (7 of 7 runs; main 7 of 7) and the last keystrokes were not saved | it opens on "Stay here" (`initialFocus`). Red first (focus was on "Open copy"). The lost keystrokes turned out to be an autosave problem, not a focus one, and are handed on (last-round L-2) |
| RF-1 (MEDIUM, as on main) | In Chromium, one ⌘Z right after a typed, confirmed size does not undo it: focus is back in the field, where ⌘Z is the browser's text undo. The jsdom test passed only because jsdom never had focus in the field | not changed here: it is plan item 12 (⌘Z in sidebar fields). The limit is in section 10; the test now says what it measures |
| RF-2 (MEDIUM) | `message-not-frozen` survived: the fade-out test kept the same message | fixed before this review reported: the test changes the message; the mutant is killed |
| RF-3 (MEDIUM) | Section 8's numbers did not match the code | updated |
| F1 (LOW, made by this fix) | ⌘S behind any dialog was no longer prevented, so the browser's Save Page dialog opened | the dialog prevents ⌘S and ⌘D. Red first |
| F3 = logic F5 (LOW, made by this fix) | With the width out of range, Enter also threw away a valid height typed in the other field | only the rejected side is reset. Red first (the height read 36) |
| logic F3 = RF-4 (LOW) | The share page drew a poster whose data lost its size at 48 × 36 while the editor used the row's 30 × 40; a restored version ignored the poster's size | `setPoster` takes a size fallback: the row's on the share page, the poster's current size on restore. Red first (share [48, 36]; restore 48 instead of the poster's 36) |
| logic F4 (LOW, older) | The overlap check read a turned block's stored box: a false overlap for a label drawn 10 units away, and a missed one for an image drawn on it | overlaps use the drawn box. Red first both ways |
| logic F6 (LOW, made by this fix) | The Duplicated prompt, opened while Preview hid the editor, took over the keyboard: Preview's buttons ignored Enter, and Escape closed the unseen prompt | a dialog inside an inert part of the page leaves the keys alone. Red first |
| logic F7 (LOW, older residual) | A 90° block spanning a sheet's full height ended 0.005 past the edge after a size change, and ISSUES flagged it (784 of 164,493 moves over all sizes) | ISSUES and the "was it inside" check allow half a hundredth (`ON_EDGE`). Red first, once the test re-measured the block the way a browser does (see the instrument note in section 10) |
| logic F2 = RF-7 (LOW) | The outgrow limit is not 60° only | section 10 rewritten with the reviewer's numbers |
| F4 (LOW) | "Listens first" holds only because no other window capture listener exists | section 7 says so |
| F5, RF-8 (LOW) | The committed harness, a Chromium check for held Enter, and the credit mark's size were missing or wrong in this record | section 8 now has the harness and the reviewer's Chromium runs; section 7 no longer says the mark has a fixed size |
| RF-6 (LOW) | Nine mutants of the new code survived, each visible to a user: the move back from the left or top edge, the vertical check on portrait sheets, pulling in a block the user hung off the edge, ISSUES at 135° and at negative angles, "completely outside" on the drawn box, the message while retyping, Escape resetting both fields, leaving for another field | a test for each, and each mutant is in the resize spec |

### Last-round verification (workflow, 6 agents)

Two reviewers checked the round above against its own previous tree and
main: one in Chromium with real keys, one with probes, sweeps and mutation.
A skeptic checked every finding above LOW; all four were confirmed. The
browser reviewer confirmed the round's other claims in Chromium (the
Duplicated prompt opens on "Stay here" and focus returns to the text after
it; Escape under Preview closes Preview; ⌘S and ⌘D saved nothing behind a
dialog and still work without one; every dialog opens on the right button;
the share page and restore use the poster's own size). The logic reviewer
measured: the tolerance hides at most 0.005 units and changes nothing for
upright blocks (0 of 2,000,000 simulated drags give an edge between
hundredths); the size fallback never overrode a usable size (0 of 234,256
combinations); quarter-turn overlaps are now exact (0 false, 0 missed in
200,000 pairs, against 11,465 false and 19,657 missed before).

| id | finding | status on the final code |
|---|---|---|
| L-1 (MEDIUM, made by this round) | After a rejected width, the typed height stayed in the fields when focus left them: they showed a size the poster did not have, and a later width edit asked about the old height | leaving both fields resets both; a size change from anywhere clears drafts and the message. Red first (the fields read 48 × 30; after 36 × 48 they read 36 × 30) |
| F1 (MEDIUM, made by this round) | Overlaps on bounding boxes: at 45°, 50,878 of 101,194 reports were false, some for shapes 24 in apart | exact separating-axis test. Red first (the reviewer's 30° and 45° cases were reported) |
| F2 (MEDIUM, older) | In Chromium the full-height turned image was still flagged: offsetHeight rounds 248.25 to 248, and the test had fed jsdom the fraction | the editor measures the computed height. The test now feeds what a browser reports for both (offsetHeight 248, computed 248.25px), and was red first |
| L-2 (MEDIUM, older) | Clicking "Open copy" within about 0.5 s of typing loses the typing on the original: autosave drops its pending save when the poster changes under a mounted editor (base, the previous tree and this one alike) | not changed here, and this record's earlier claim corrected: it is an autosave problem, handed on (section 10, PLAN.md) |
| L-3 (LOW, older) | A prompt covered by the logo picker still took focus and every key | only the dialog in view owns the keyboard. Red first |
| L-4 (LOW, made by this round) | Ctrl+D (delete forward on a Mac) was prevented in the typed field | shortcuts follow the platform's command key. Red first |
| F3 (LOW, made by this round) | A rotation that is not a number made the block overlap every other block | treated as upright. Red first (and a size change now keeps it finite) |
| F4 (LOW) | Five mutants of the round survived: the horizontal inside tolerance, a tenfold tolerance, the left and top tolerance, the second block of a pair, the restore fallback's height | a test for each; each mutant is in the specs |

### Round-7 audit (workflow, 7 agents)

The same two methods again (Chromium; probes, sweeps and mutation), on the
round above against its previous tree. The skeptics confirmed two findings
above LOW and confirmed another in part. The audit confirmed:
- the exact overlap test matched a brute-force 7,200-direction check on
  20,000 random tilted pairs (0 differences);
- in Chromium, the computed height equals the drawn height divided by zoom
  for all 10 block kinds tried, and one measuring pass over 241 blocks took
  1.2 ms against 1.9 ms with `offsetHeight`;
- no page keeps a modal dialog mounted while closed;
- the previous 60-scenario dialog suite changed only where intended.

| id | finding | status on the final code |
|---|---|---|
| R7L-1 = A7-1 (MEDIUM, made by the round) | With the Duplicated prompt opened first and a size dialog under it, one Escape closed both and dropped the size request (6 of 6 in Chromium) | the answering dialog stops the key for every other listener. jsdom cannot run the microtask between listeners, so the test checks the mechanism (a later window listener no longer sees the key; red first) and the Chromium instrument is re-run (section 8) |
| A7-2 (MEDIUM, partly confirmed) | The full-height image test fed a height Chromium does not draw: the block had the default "Figure 1." label, which makes the frame taller than stored, and Chromium correctly flags it | the test's block has `captionPosition: 'none'`, which renders at its stored height; the reviewer's control showed the product fix holds for it (flagged before, not after). Section 10's limit now covers captioned images and logos |
| R7L-2 = A7-3 (MEDIUM, confirmed; LOW per its skeptic) | The record's jsdom note was stale: fixed-height frames are now measured in jsdom at their stored height | section 10 and PLAN.md corrected |
| A7-4 (LOW, made by the round) | A dialog that became uncovered did not take focus | it does when the dialog over it closes (red first). Under the logo picker, which is not a ConfirmModal, the first key moves focus into the prompt (section 10) |
| R7L-3 = A7-6 (LOW, made by the round) | A numeric-string rotation was drawn turned but checked as upright | read as the canvas draws it (red first) |
| R7L-4 (LOW, made by the round) | The exact overlap test was 34 to 134 times slower, on every drag move | box fast path and early exit; numbers above |
| R7L-5 = A7-5 (LOW, made by the round) | Upright pairs overlapping by exactly 2.00 were decided differently from the old test | the old arithmetic for upright blocks (red first on the audit's pair) |
| R7L-6 (LOW) | Four mutants survived: a closing modal still covering, the commit's message clear, one block's side directions only, > against >= | a test for each; each mutant is in the resize spec |

## 10. Limits and follow-ups

**Owner calls made here** (each can be reversed on request):
- **"Commit on Enter or leaving the field" is read as leaving BOTH size
  fields.** Taken literally, the Tab from width to height asks about the
  width alone, and the height typed next lands on the dialog's button
  (BK-8). The pair is treated as one change.
- **A dialog whose action is undoable opens with focus on its action.** Enter
  confirms, as the user just asked for the change. After "3" on the size
  menu, Tab asks about 36 × 48, and a Space meant for the next control
  confirms it. The change can be undone. A dialog whose action cannot be
  undone (every delete) opens with focus on Cancel.

**Accepted limits of this fix:**
- **A large tilted block can outgrow a sheet it is moved to.** Its sides
  stretch along their own directions, so its drawn extent does not scale
  exactly with the sheet; a block that fills about 80% of one side can end
  up wider or taller than the new sheet, at any angle that is not a quarter
  turn. No move can fit it, so it stays where it is and ISSUES flags it.
  Measured: on the B–D reviewer's random placements, 10 of 11,174 moves at
  60° and 0 at the other angles; on the final review's centred blocks of
  every size that fits, 250 of 19,376 at 15°, 646 at 30°, 509 at 45°, 583 at
  60° and 275 at 75° (ISSUES flagged every one). The smallest case: a 30°
  block 380 × 110 drawn across 80% of a 48 × 36 sheet, moved to 24 × 36, is
  drawn 241.93 wide on 240.
- **A tilted block near an edge is moved in, so a round trip does not give
  its position back** (section 7; up to 69.61 units at 45° on the preset
  sweep). Its size does come back exactly, and ⌘Z restores everything.
- **⌘Z right after a typed size is confirmed is the field's own undo.** The
  dialog gives focus back to the field it was opened from, and ⌘Z in a
  field is the browser's text undo, not the poster's; the user must leave
  the field first. Measured in Chromium by the final review (RF-1): after
  typing 24, Enter and "Change size", one ⌘Z left the poster at 48 × 24 in
  4 of 4 runs; after a click on the canvas it undid, 2 of 2. Main ignored ⌘Z
  in the fields too. This belongs to plan item 12 (⌘Z in sidebar fields).
- **Text blocks, and images and logos with their caption label, are drawn
  at their rendered height (`height: auto`).** The size change works on the
  stored box, so a turned block's drawn centre can differ from the moved one
  by half the difference between its rendered and stored heights (for an
  image with the default "Figure 1." label, 7.39 units in the audit's case).
  ISSUES uses the rendered height, so it flags such a block correctly when
  it is drawn past an edge.
- **Two dialogs can still be open at once.** The async "Duplicated" prompt
  can arrive while a size change is being asked about. Keys go only to the
  one in view, and it opens on "Stay here". Keys typed while it is open go
  to it, not to the text the user was typing. When the logo picker (not a
  ConfirmModal) closes over a prompt, focus is not moved into the prompt
  until the next key, which only moves it.
- **Three second guards cannot be reached by any user path** (the editor's
  and the preview label's size check, autosave's): the store repairs every
  document first, and the fields accept only 10–100 in. Their mutants are
  recorded as equivalents.
- **The credit mark is sized to a row of logos when it is placed again
  beside one** (BD-4). That is the rule it was first placed by.
- **After a template, the credit mark can sit on a template block** (BD-6).
- **A legacy poster row with stale `width_in`/`height_in` is corrected only
  when the poster is next saved** (RD6).

**Handed on** (existed before this fix; details and numbers in
`docs/stress-test/PLAN.md`):
- **Data loss: typing lost when the editor switches to another poster.**
  Clicking "Open copy" within about 0.5 s of the last keystroke loses
  everything typed since the duplicate was made: `useAutosave` drops its
  pending save when the poster id changes, and the editor stays mounted, so
  its unmount flush never runs. Measured in Chromium by the last-round
  verification (L-2): lost at 211 and 503 ms, saved at 1,600 ms, on main as
  well.
- The credit-mark scan misses free bands that hold no scan row (BG-5; no
  worse than main).
- The rulers are misregistered on centred axes (item 4); Zoom-out zooms in
  below its 0.3 floor, and zoom-to-fit leaves 36 px out of view (item 3).
- The area-comment label divides inches by 10 again; the print popup's
  on-screen view squeezes posters wider than about 84 in; the figure-size
  check's default rectangle is set for 48 × 36; `PosterSizeKey` is `string`;
  the drag guide's centre uses the stored height; the 3-column template
  overflows short sheets; version restore drops the credit mark.
- The mutation checker's unloaded-file guard has no committed self-test
  (RT9).
- **An instrument gap for every jsdom test of ISSUES geometry.** The editor
  measures each block frame's computed height. jsdom has no layout: it
  returns the inline height for a fixed-height frame (so those are measured
  at their stored height) and "auto" for a frame that grows with its
  content (text, captioned images), where the editor falls back to
  `offsetHeight`, which jsdom reports as 0. So in jsdom ISSUES sees every
  growing block as 0 tall. It measures again when a block's ResizeObserver
  fires, and the shared test stub never fires, so a height that changes
  stays stale. This fix's ISSUES tests model a browser's two readings
  (`measureAs`: computed height with its fraction, offsetHeight rounded) and
  fire the observer after a size change (`FiringResizeObserver`), both in
  `posterSize.test.tsx`. Other suites' ISSUES tests have not been checked
  for tests that pass for these reasons.
