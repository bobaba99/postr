# Fix 03 — "Fit" cuts off the poster's far edge, and the zoom controls can zoom the wrong way

**Plan item:** 3 · **Branches:** `editor/fit-whole-sheet` (the fit and the zoom floors), `editor/guidelines-closed-small-screens` (the panel's default) · **Status:** in progress

## 1. Symptom

A researcher on a 13-inch laptop opens a poster, or clicks **FIT**. The poster
is narrower than the canvas, so it should fit, but its right edge (or, for a
portrait poster, its bottom edge) is cut off, and the canvas scrolls. On a
1280-pixel-wide screen the sidebar (484 px) and the guidelines panel (320 px)
leave 476 px of canvas, so a large part of the poster's last column sits
under the panel's edge (the original report: "a whole column hidden").

Two related oddities: with a large poster on a small window, the **Zoom out**
button makes the poster *bigger*, and so does a pinch out on the trackpad.

## 2. Hypotheses

| id | hypothesis | prediction that would confirm it |
|---|---|---|
| H1 | The fit reserves a 60 px gutter in total (`useZoom(…, 60)`), while the workspace pads the sheet by 96 px on each side (192 px in total) | after FIT, the far edge of the limiting axis is hidden by 36 px and the scroll overflow is 192 − 60 = 132 px, whatever the window or poster size |
| H1-alt | Something else hides the edge: the guidelines panel drawn over the canvas, the rulers, scrollbars, or text overflowing the sheet | the hidden amount tracks the panel's or scrollbar's width, or changes with content, instead of a constant 36 px |
| H2 | The Zoom out button clamps to 0.3 regardless of the fit | at a fit below 0.3, one click raises the zoom to 0.3 |
| H3 | A pinch (Ctrl + wheel) clamps to 0.2 regardless of the fit | at a fit below 0.2, a pinch out raises the zoom to 0.2 |
| H4 | The guidelines panel is open by default at every width; the owner decided it starts closed below 1600 px | on a 1280–1599 px window the panel is open on first load |
| control | The phone share view reserves a 16 px gutter and pads 8 px per side, which agree | it hides nothing |

Owner decisions that set the target (`docs/stress-test/PLAN.md`): the poster
gutter is **64 px** (the smallest measured value that keeps block handles out
from under the rulers), and the guidelines panel **starts closed on small
screens** (viewport narrower than 1600 px).

## 3. Method

**Author's instruments** (the confirmers did not use them):

- `apps/web/scripts/fit-check.mjs` — real Chromium on the app's own Vite
  server, backend faked at the network layer. It opens the editor at each
  window size and poster shape (7 × 5, guidelines panel open and closed),
  and measures the sheet against the visible part of the canvas area after
  opening and after FIT: the gutter on each side, the hidden amount, the
  scroll overflow and the zoom. It also runs the zoom-out and pinch cases
  (a 100 × 72 in poster in a 1024 × 768 window), the panel's state on first
  open at each width, and a control: the phone share view. Exit 1 if any
  claim is observed, 2 if the instrument fails.
  `cd apps/web && node scripts/fit-check.mjs`
  After the confirmations (section 5) it gained the confirmers' new claims,
  each run on main first:
  - **H5**: zoom in three times, scroll to the far corner, click FIT; plain,
    and with a block parked 15 in off the sheet (a pasteboard).
  - **H6**: a 900 and an 860 px window with both panels open (96 and 56 px
    of canvas).
  - **H1 at device pixel ratios 1.25 and 1.5** (3 windows × 3 posters,
    including A0 portrait, 33.1 × 46.8 in), where a flush fit could round
    into a pixel of overflow. H1 now also counts any scroll after Fit.
  - **The rulers' 0-inch marks** against the sheet's corner (`rulerError`),
    not a claim: the rulers are plan item 4, and this fix moves the sheet.
- `apps/web/scripts/lib/editorHarness.mjs` — the shared scaffolding (Vite,
  Chromium, fake backend) for this and later harnesses. It refuses to run
  outside `apps/web`, where Tailwind cannot find its config and every
  measurement would be of an unstyled page.
- jsdom, one file per cause, sharing `__tests__/workspaceKit.ts` (the
  canvas's size and the window's width stubbed; zoom and padding read off
  the rendered DOM):
  - `fitWholeSheet.test.tsx` (cause A): the fitted sheet plus its padding
    fits the canvas and fills its limiting side; the padding is 64 px; a
    canvas narrower than two gutters (100, 50 and 40 px) still shows the
    sheet, and one that loses its size keeps its fit; FIT, the zoom readout
    and a new poster size return a scrolled canvas to 0, 0, with a control
    (Zoom in keeps the scroll).
  - `zoomFloors.test.tsx` (cause B): the two floors, driven by a click and
    by a Ctrl + wheel event; Zoom in then Zoom out returns to the fit, and
    after the window grows Zoom out still does not zoom in.
  - `guidelinesDefault.test.tsx` (cause C): the panel's first state at five
    window widths (matchMedia answered for that width, as a browser would).

**Instrument errors caught before any result was counted:**
- The phone-share control first measured the editor, not the share page: a
  poster's owner opening its share link is redirected to the editor. The
  fake backend now makes that poster belong to someone else, and the control
  checks it is on `/s/…`.
- H5's first version required a scroll on both axes. A 48 × 36 in poster at
  1440 × 900 only scrolls sideways, so it stopped as an error; it now needs
  a scroll on either axis. The zoom-floor scenarios now stop with an error
  when their precondition (a fit below the floor) fails, instead of
  reporting it as a field nobody reads.

## 4. Results before the fix

On main (292f10f), MEASURED:

- **H1:** in all 70 configurations (7 window sizes from 1280 × 800 to
  2560 × 1440, five poster shapes from 60 × 30 to 30 × 60, the guidelines
  panel open and closed), the far edge of the limiting axis is hidden by
  exactly **36 px**, both on opening and after FIT; the right edge for wide
  posters, the bottom for tall ones. The scroll overflow on that axis is
  exactly **132 px** in 70 of 70, the value H1 predicts.
- **H1-alt:** the hidden amount does not change with the panel open or
  closed, or with the window size (it is 36 px everywhere), so the panel,
  the rulers and the window size do not explain it (MEASURED); scrollbars and
  overflowing text were left to the confirmers.
- **H2:** fit 0.16; one click on Zoom out → 0.30 (jsdom: fit 0.14 → 0.3).
- **H3:** fit 0.16; a pinch out → 0.20 (jsdom: fit 0.14 → 0.2).
- **H4:** the panel is open on first load at every width tried. With it
  open, the canvas is 476 px wide at 1280 × 800, 562 at 1366, 636 at 1440 and
  708 at 1512.
- **Control:** the phone share view hides nothing (8 px gutter on each side).
- **The added scenarios, on main:**
  - H1 at DPR 1.25 and 1.5: 18 of 18 hide 36 px (34.74 px at 1366 × 768 on
    A0 portrait, where the other axis also hides 36 px); the canvas scrolls
    in 18 of 18.
  - H5: after scrolling, FIT leaves 36 px of the near (left) edge hidden;
    with a block parked off the sheet, 299 px.
  - H6: at 96 px of canvas the fit is 0.075 and 36 px are hidden; at 56 px
    the fit falls back to 100% and 520 px of the 48 in poster are hidden.
- jsdom, the final test files run against main (TESTED):
  - `fitWholeSheet.test.tsx`: 16 of 18 fail, each for its predicted reason
    (for example: the fitted sheet plus its padding is 652 px tall in a
    520 px canvas, and 608 px wide in a 476 px one, 132 px too big both
    times; a 50 px canvas shows the poster at 100%; FIT leaves the scroll
    at 300, 200). The 2 that pass are the scroll control and the phone
    share view's 8 px gutter, which already agreed with its fit on main.
    The three "Fit goes back to the fitted zoom" tests fail on main because
    main's fit keeps a 60 px gutter, not because FIT kept the manual zoom:
    what they add is checked by the mutant `fit-keeps-manual-zoom`
    (section 8).
  - `zoomFloors.test.tsx`: 5 of 6 fail (Zoom out and a pinch go 0.14 →
    0.3 and 0.2); the control passes.
  - `guidelinesDefault.test.tsx`: 4 of 6 fail (open at 1280, 1440 and
    1599 px); the two wide-window cases pass.

## 5. Independent confirmation (before any change)

A workflow ran two confirmers on a frozen copy of main (292f10f), with
**disjoint scopes** (the owner asked that independent confirmers test
different things, not repeat each other), and a critic listing what neither
tested. Neither saw the author's tests or harness.

- **Confirmer A — the Fit claim and its cause.** Two instruments sharing no
  code: GEOM (the sheet's box against the canvas's client box) and PIX (the
  sheet painted a unique colour and found in a real screenshot).
- **Confirmer B — siblings and other entry points.** Zoom limits, re-fit
  triggers, the guidelines panel's default, the share page, and whether the
  rulers share the cause.

| claim | confirmer | verdict | numbers (MEASURED unless marked) |
|---|---|---|---|
| FIT, and the fit the editor opens with, hide the far edge | A | CONFIRMED | 164 of 164 fit states (windows 1000–2600 × 768–1440, DPR 1 and 2, posters 4 × 4 to 120 × 36, rails open and closed, after a resize): exactly 36 px hidden on the limiting axis's far edge; PIX equals GEOM within 1 px. Share of the sheet hidden: 2.1% (2560 × 1440) to 22.5% (1024 × 768 with both rails). Only exception: the 5× zoom cap (tiny posters), 0 px |
| Cause: 60 px of fit gutter against 96 px of padding per side | A | CONFIRMED by counterfactual | injecting only the padding p (a stylesheet) or only the gutter G (the served module rewritten) moves the clip exactly as hidden = max(0, p − G) and overflow = max(0, 2p − G) predict, 98 of 98 cells. p = 64 with G = 128 gives 0 hidden and 0 overflow; G = 64 with p = 96 still hides 32 px |
| Cause, by history | A | CONFIRMED (INSPECTED, git) | d54b70e (2026-04-11) raised the padding from 30 (which matched the 60 px gutter) to 96 and left the gutter at 60; e2044d2 later added the false comment "Matches the auto-fit gutter above" |
| The overflow is 132 px | A | PARTLY | 132 px on the limiting axis in 164 of 164; the other axis also overflows in 40 of 164 (16–132 px), hiding 16–36 px there in 6 (for example 1808 × 768: 36 px right and 36 px bottom). Same cause |
| Alternatives: rulers, the panel, overflowing text, resizing | A | REFUTED as causes | at scroll 0 the rulers never cover the sheet; closing the panel widens the canvas by exactly 320 px (it pushes, not overlays) and 36 px stays hidden; text past the sheet and a resize change nothing |
| Alternative: scrollbars | A | PARTLY | not the cause (0 px with overlay scrollbars); with 15 px classic scrollbars forced by CSS the clip grows by 15 px when both axes overflow |
| Zoom out zooms in below its 0.3 floor | B | CONFIRMED | fit 0.16, 0.22, 0.27 → 0.30. And not only below a small fit: at 1440 × 900 a pinch can go down to 0.2, and one Zoom-out click then goes 0.2 → 0.3 |
| A pinch zooms in below its 0.2 floor | B | CONFIRMED | fit 0.16 → 0.20 on a pinch out; a pinch in from 0.16 jumps to 0.20 (+25%) instead of 0.168 |
| The guidelines panel is open at every width, and nothing remembers it | B | CONFIRMED | open on first load at 1024–1920; reopened after a reload. Canvas with it open against closed: 476 vs 796 px at 1280, 636 vs 956 at 1440, 220 vs 540 at 1024 |
| Share page: desktop and phone | B | desktop CONFIRMED, phone REFUTED | desktop: 36 px hidden, 132 px overflow, like the editor; phone (16 px gutter, 8 px padding): 0 px in 9 of 9 |
| The rulers share the cause | B | PARTLY | the 0" mark is off by 120 − (the sheet's offset in the canvas): the ruler's own `pad = 96` plus its 24 px bar. It shares the 96 constant, not the fit's error |

**New defects the confirmers found in this area:**
- **FIT keeps the scroll position** (A, MEDIUM). After the user scrolls, FIT
  leaves the scroll clamped, and the sheet's NEAR edge is cut (36 px, 60 px
  counting the ruler). Same root cause: with no overflow the scroll clamps
  to 0.
- **Fit jumps to 100% when the canvas is narrower than the gutter** (B,
  MEDIUM). `useZoom` treats a ratio ≤ 0 as "not laid out" and shows 100%: at
  a 60 px canvas (windows ≤ 864 px wide with both rails open, or a phone
  turned sideways on the share page), 516–568 px of the poster are hidden.
  A 128 px gutter would move that threshold to 932 px.
- **LOW:** the phone share view's bottom bars cover 32–50 px of the fitted
  poster; the desktop share page shows the guidelines rail and rulers to a
  read-only visitor; the "frame grows with overflowing text" mechanism
  (`canvasOverflow`) never fires in a browser, because the sheet's own
  border box never grows; undoing a size change keeps a manual zoom; the fit
  is capped at 5× while manual zoom goes to 10×.

**The critic's gaps**, each assigned below to a reviewer of the fix: the
64 px rationale (handles clear of the rulers) was never measured; a flush
fit at fractional DPR or page zoom could round to 1 px of overflow;
classic scrollbars were only simulated; blocks past the left or top edge
were not tried; the Preview overlay has its own fit; the panel's default
was only tried at first load; and a bounding-box screenshot check misses a
toolbar covering part of an edge.

## 6. Root cause

Three causes, each a single line of code, and one shared mistake behind the
first two: **the workspace's geometry is written down in several places
that no longer agree.**

- **A (the fit).** `useZoom` fits the sheet into the canvas minus a 60 px
  gutter in total (`PosterEditor.tsx`, `useZoom(…, 60)`), and the workarea
  pads the sheet by 96 px on each side. The fitted sheet plus its padding is
  132 px bigger than the canvas; centred from the scroll origin, the far
  edge lands 36 px outside. The ruler holds a third copy of the padding
  (`const pad = 96`). The two numbers agreed (30 per side, 60 in total)
  until d54b70e raised one.
  - It also explains FIT keeping the scroll position: once the fit overflows,
    there is scroll range to keep.
- **B (the floors).** The zoom controls clamp with `Math.max(floor, next)`,
  which raises a zoom that is already below the floor. Two floors disagree
  (0.3 on the buttons, 0.2 on the pinch), and the fit has none, so a fit or
  a pinch below the button's floor turns Zoom out into zoom in.
- **C (the panel).** `useState(true)`: the guidelines panel opens at every
  width.

**What these do not explain:** the fit's 100% fallback for a canvas smaller
than the gutter (a separate guard, `ratio > 0 ? ratio : 1`, made easier to
reach by a larger gutter, so it is fixed with A); the ruler's centring error
and 24 px inset (item 4); the phone share view's bottom bars; the
`canvasOverflow` mechanism that never fires (handed on).

## 7. Fix

### Cause A — the gutter (branch `editor/fit-whole-sheet`)

**One source for the workspace's geometry.** `poster/workspaceGeometry.ts`
(new) holds the gutter and the fit:
- `WORKSPACE_GUTTER = 64` (owner decision) and `PHONE_GUTTER = 8` per side.
- `gutterFor` never gives a side more than a quarter of the canvas, so a
  canvas narrower than two gutters still shows the whole sheet, smaller,
  instead of the old 100% fallback.
- `fitSheet` returns the zoom and the gutter per axis for a canvas size, or
  null when the canvas has no size yet (the editor then keeps the fit it
  has). It takes the canvas in whole pixels, rounded down. That guard is
  cheap, but nothing measured needs it (section 8).

**`useZoom`** (PosterEditor) now uses it:
- It returns the gutter it used (`gutterX`, `gutterY`). The workarea's
  padding is exactly that, so the fitted sheet and its padding always fit.
- The rulers count from the same gutter instead of their own copy of 96.
- `fitToScreen` replaces `setZoom(null)` for FIT, the zoom readout and a
  confirmed poster size. It returns to the fitted zoom AND scrolls the
  canvas to its start. A fitted canvas only scrolls when a block is parked
  off the sheet; a scroll kept from a zoomed-in view then cut the sheet's
  near edge.

**After the code review** (everything-claude-code:code-reviewer, before
commit; each finding reproduced before acting):
- HIGH: nothing tested that FIT goes back to the fitted zoom (the reviewer's
  mutant survived 0 of 67). Added three tests: FIT and the readout after
  zooming in, and a new size after zooming in. Also two tests for the phone
  share view's gutter, which the reviewer's mutants showed was unprotected.
- MEDIUM, the rulers: on the axis the sheet fills, the 0" mark is off by
  24 px on main and on the fix (the ruler bar's own inset). On the centred
  axis it moves further off (section 8). Both are plan item 4's centring
  bug, so it stays there. `fit-check.mjs` now fails if the filled-axis
  error ever changes from main's 24 px (claim Hr), and the code comment says
  the origin is only right on a filled axis.
- MEDIUM, handles under the ruler: measured, and true on main as well
  (section 8). The fix only moves the threshold, so it is handed on
  (section 10). The rationale "64 px keeps handles clear of the rulers" is
  removed from the code until someone measures it at every zoom.
- MEDIUM, the harness: a failed start (busy port, unknown `--only` id) now
  exits 2, "instrument failed", instead of 1, "claim observed". Measured:
  both exit 2. `openEditor` closes its browser context when the editor
  never loads, and `startHarness` closes Vite when Chromium fails to launch.
- LOW: five stale or inexact comments corrected, and a test that skipped
  its dialog silently now asserts it appeared. The block parked off the
  sheet in H5 sits 40 in down, so the fitted canvas scrolls both ways and
  the vertical reset is checked in a browser too.
- Not taken: computing the fit during render from a stored canvas size (a
  new size is drawn at the old fit for one render). That was already so on
  main, and it is not what this fix is about.
- Handed on: `useZoom` and other hooks run after an early return in
  `PosterEditor` (`if (!doc || !posterId) return …`), which breaks React's
  rule of hooks. INSPECTED, already there on main.

### Cause B — the zoom floors (same branch, own commit)

One floor for every zoom control, in `workspaceGeometry.ts`:
- `clampZoom(next, current, fit)` keeps a requested zoom between a floor and
  `ZOOM_MAX` (10×). The floor is `ZOOM_MIN` (0.2), lowered to the fit or to
  the zoom on screen when either is below it. A floor above the zoom on
  screen is what turned Zoom out into zoom in. With the fit in the floor,
  Zoom out can always get back to the fit.
- The Zoom out and Zoom in buttons (step 0.15) and a pinch (Ctrl + wheel) all
  go through it. The buttons' own 0.3 floor is gone: both now go down to
  0.2, or further, to the fit, when the fit is smaller.
- A button step that cannot move changes nothing. Before, a click at the
  floor still set a manual zoom, so the poster stopped refitting when the
  window changed.
- The pinch reads the fit from a ref kept in step with each render, as it
  already did for the zoom.

## 8. Results after the fix

### Cause A

**Chromium, `fit-check.mjs`** (MEASURED; `292f10f` plus the uncommitted
cause A):

| claim | main | fix |
|---|---|---|
| H1: after Fit part of the sheet is hidden, or the canvas scrolls (70 at DPR 1, 18 at DPR 1.25 and 1.5) | 88 of 88 | 0 of 88 |
| the gutter on the side the sheet fills | 96 px, 36 px of it cut | exactly 64 px in 88 of 88 |
| H5: FIT after zooming in and scrolling | 36 px of the near edge hidden; 299 px left and 26 px top with a block parked off the sheet | 0 px in both; the parked block still scrolls (253 × 177 px) and the scroll is 0, 0 |
| H6: a 96 px canvas | fit 0.075, 36 px hidden | fit 0.1, 24 px gutters, 0 hidden |
| H6: a 56 px canvas | 100%, 520 px hidden | fit 0.058, 14 px gutters, 0 hidden |
| control: phone share view | 0 hidden | 0 hidden |

**The rulers** (not a claim of this fix; plan item 4). On the axis the sheet
fills, the 0" mark is 24 px off in 12 of 12 on main and 12 of 12 on the
fix. On the centred axis it moves further from the sheet's corner in 10 of
12 (by 49 to 77 px; for example −124 → −181.5 px at 1280 × 800 on
48 × 36 in) and slightly closer in 2. The sheet now sits deeper in the
canvas, and the ruler still assumes it starts at the padding.

**Handles under the ruler** (the review's hypothesis M2, MEASURED): after
Fit, with the title selected, its handle row starts under the 24 px top
ruler in 2 of 12 configurations on main and 4 of 12 on the fix (1440,
1920 and 2560 px windows; 48 × 36 and 24 × 36 in; the title where the
template puts it, and moved to the top edge). The worst is −19.7 px, at
2560 × 1440 on 24 × 36 in with the title at the top edge (7.9 px on main).
The row is drawn inside the zoomed sheet, 24 × zoom px above its block
(INSPECTED, `blocks.tsx`), so any fixed gutter is too small above some
zoom. For a block at the top edge of a sheet that fills the canvas's
height, the row reaches the ruler above zoom 3 on main (96 − 24 × zoom <
24) and above about 1.7 on the fix (64 − 24 × zoom < 24): arithmetic, which
agrees with the measured cases.

**jsdom:** `fitWholeSheet.test.tsx` 18 of 18 pass (16 fail on main,
section 4); `sheetSize.test.tsx` passes with its expected fit updated to the
new gutter. The full suite: 2942 pass in 178 files; the only failures are
the nine cause B and C tests (5 in `zoomFloors`, 4 in `guidelinesDefault`),
red by design until those causes land. Those two files are not in cause A's
commit.

**Mutation check** (`03-fit-whole-sheet.fit.mutants.json`, MEASURED):
13 of 13 mutants killed, each by the test meant for it. Two documented blind
spots:
- The rulers' origin needs layout. `fit-check.mjs` guards it (claim Hr).
- The whole-pixel floor is UNVERIFIED as necessary. With the floor removed,
  the DPR 1.25 and 1.5 scenarios still pass (exit 0): 0 of 18 had a
  fractional canvas, so neither instrument exercises the floor. It stays as
  a cheap guard; browser page zoom was left to the reviewers.

### Cause B

**Chromium, `fit-check.mjs`** (MEASURED; 1024 × 768 with both panels open,
100 × 72 in poster):

| claim | main | fix |
|---|---|---|
| H2: one click on Zoom out | fit 0.16 → 0.30 | fit 0.11 → 0.11 |
| H3: a pinch out (Ctrl + wheel, deltaY 60) | fit 0.16 → 0.20 | fit 0.11 → 0.11 |

The fit differs between the columns because of cause A's larger gutter.

**jsdom:** `zoomFloors.test.tsx` 6 of 6 pass (5 fail on main, section 4).
Beyond the two claims, they check that Zoom in then Zoom out lands back on
the fit (main: 0.3), that Zoom out never zooms in after the window grows past
a zoom the user chose, that a Zoom out which cannot go lower keeps the poster
refitting, and that a pinch from just above 0.2 carries on down toward a
smaller fit. The full suite: 2947 pass; the only failures are cause C's
four tests.

**Mutation check** (`03-fit-whole-sheet.floors.mutants.json`, MEASURED):
6 of 6 killed. One documented blind spot: Zoom in without the clamp survives,
because reaching the 10× ceiling takes more than 60 clicks from a normal fit.
The ceiling is `ZOOM_MAX`, shared with the pinch and unchanged from main.

