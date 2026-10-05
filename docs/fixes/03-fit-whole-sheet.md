# Fix 03 — "Fit" cuts off the poster's far edge, and the zoom controls can zoom the wrong way

**Process:** `docs/process/README.md`, merged together with this fix. · **Plan item:** 3 · **Branches:** `editor/fit-whole-sheet` (A: the fit; B: the zoom floors), `editor/guidelines-closed-small-screens` (C: the panel's default; D: the house focus ring, found by C's review) · **Status:** done

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

**Scope from the code graph** (process step 0, done retroactively on
2026-09-29: the step postdates this fix's start):

Graph: `list_graph_stats_tool` — 661 files, 8,080 nodes, 78,957 edges, built
at 142173a with HEAD 142173a (a full rebuild; an incremental update on this
fresh worktree had indexed only 64 files). `get_impact_radius_tool` from
292f10f, depth 2: 21 changed files, 23 more affected.

| surface | file:line | touched | check |
|---|---|---|---|
| the editor's fit, zoom controls, guidelines panel, banner, rulers | `PosterEditor.tsx`, `workspaceGeometry.ts` | yes (A, B, C) | `fit-check.mjs`, jsdom suites, mutants |
| the guidelines panel and its focus | `GuidelinesPanel.tsx` | yes (C, D) | `guidelinesDefault.test.tsx`, Hf, Hk2, Hw, Hr3 |
| the onboarding tour | `OnboardingTour.tsx` | yes (C) | `guidelinesDefault.test.tsx`, Ht, Hp, Ht6, Hts |
| the small-screen hook and its other consumer | `hooks/useIsSmallScreen.ts`, `components/MobileNotice.tsx` | yes (C) / no | `useIsSmallScreen.test.tsx`, `MobileNotice.test.tsx` |
| the sidebar's tabs and author buttons; the comments composer | `Sidebar.tsx`, `CommentsPanel.tsx` | yes (D) | Hr3 (the composer's ring unguarded while fix 23 hides comments: the `post-comment-not-inset` blind spot is accepted until sharing returns) |
| the house focus ring | `index.css` | yes (D) | Hr2, Hr3 |
| the desktop share page and the phone share view | `pages/Share.tsx` | no (reads the fit) | review R1, R5 (section 9) |
| the editor page and routes | `pages/Editor.tsx`, `routes.tsx`, `App.tsx` | no | the full suite; `EditorSheetSize.test.tsx`, `EditorLeaveGuard.test.tsx` |
| replaying the tour | `pages/Profile.tsx` | no (clears a flag for the next load) | code review (section 9) |
| a preset dialog's input | `components/PresetEditModal.tsx` | no: an input's inline `outline: none`; D targets buttons | INSPECTED |
| the Preview overlay, thumbnails, print and PDF | `PosterPreviewOverlay.tsx`, `data/thumbnails.ts` | no (own gutter, poster units) | review R5 (section 9) |
| the index docs | `docs/feature-graph.md`; `docs/manual-test-flows.md` | updated (zoom, toggle, banner, tour, focus ring); not touched: no manual flow covers the editor's fit | process step 12 |

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
- After cause C, the first full run stopped with 20 errors (exit 2), all
  "panel closed" scenarios below 1600 px. The harness closed the panel by
  clicking its "Hide" button whenever that button was in the page, but a
  closed panel keeps it, clipped to zero width, so Playwright waited 30 s
  to click something invisible. The panel's state is now read from the
  "Show" toggle, which exists only while it is closed.
- The first keyboard instrument walked the whole page with Tab (400
  presses). It was no instrument: it got stuck in a table cell on the
  poster, which keeps Tab for itself, and where it started depended on what
  had last been clicked (one run reported 0 for that reason alone). It now
  focuses the rail's own reopen toggle and presses Shift+Tab, with a
  control that an open rail's controls still take focus.

**Re-running everything** (from `apps/web`; each exits 0 on the final code):

```bash
node scripts/fit-check.mjs
node scripts/mutation-check.mjs ../../docs/fixes/03-fit-whole-sheet.fit.mutants.json
node scripts/mutation-check.mjs ../../docs/fixes/03-fit-whole-sheet.floors.mutants.json
node scripts/mutation-check.mjs ../../docs/fixes/03-fit-whole-sheet.panel.mutants.json
node scripts/blind-spot-check.mjs ../../docs/fixes/03-fit-whole-sheet.fit.mutants.json
node scripts/blind-spot-check.mjs ../../docs/fixes/03-fit-whole-sheet.panel.mutants.json
node scripts/blind-spot-check.mjs ../../docs/fixes/03-fit-whole-sheet.ring.mutants.json
npx vitest run
git checkout -- public/version.json
```

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
    the fit falls back to 100%, and the whole poster (480 px) is off the
    canvas. (Corrected after review R8: this line said "520 px hidden".)
- jsdom, the test files run against main (TESTED; the counts are cause A
  and B's versions of the files; the step 11 claims audit ran the final
  files on main: `fitWholeSheet` 17 of 19 fail, the extra one being the
  banner test, `zoomFloors` 6 of 8, where the residue test fails on main for
  the floor, not the residue, and the 10× ceiling test passes on main):
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
  - `guidelinesDefault.test.tsx`, cause C's first version of the file: 4 of
    6 fail (open at 1280, 1440 and 1599 px); the two wide-window cases
    pass. (Review R8 ran the final file, 19 tests then, against main: 13
    fail and 6 pass. The final file now has 25 tests; section 8.)

## 5. Independent confirmation (before any change)

A workflow ran two confirmers on a frozen copy of main (292f10f), with
**disjoint scopes** (the owner asked that independent confirmers test
different things, not repeat each other), and a critic listing what neither
tested. Neither saw the author's tests or harness.

- **Confirmer A** — scope: the Fit claim at the reported entry point, and
  its cause. Two instruments sharing no code: GEOM (the sheet's box against
  the canvas's client box) and PIX (the sheet painted a unique colour and
  found in a real screenshot).
- **Confirmer B** — scope: siblings and other entry points: zoom limits,
  re-fit triggers, the guidelines panel's default, the share page, and
  whether the rulers share the cause.

(The numbers below are the confirmers', MEASURED by their own scripts in the
fix's scratch folder, not committed; process §1.1.)

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

Critic — the gaps, each assigned to a reviewer of the fix (section 9): the
64 px rationale (handles clear of the rulers) was never measured; a flush
fit at fractional DPR or page zoom could round to 1 px of overflow;
classic scrollbars were only simulated; blocks past the left or top edge
were not tried; the Preview overlay has its own fit; the panel's default
was only tried at first load; and a bounding-box screenshot check misses a
toolbar covering part of an edge.

## 6. Root cause

Four causes (D found later, by cause C's review), each a single line of code, and one shared mistake behind the
first two: **the workspace's geometry is written down in several places
that no longer agree.**

- **A (the fit).** `useZoom` fits the sheet into the canvas minus a 60 px
  gutter in total (`PosterEditor.tsx`, `useZoom(…, 60)`), and the workarea
  pads the sheet by 96 px on each side. The fitted sheet plus its padding is
  132 px bigger than the canvas; centred from the scroll origin, the far
  edge lands 36 px outside. The ruler holds a third copy of the padding
  (`const pad = 96`). The two numbers agreed (30 per side, 60 in total)
  until d54b70e raised one.
  - It also explains FIT keeping the scroll position in the plain case:
    once the fit overflows, there is scroll range to keep. It does not
    explain the case with a block parked off the sheet: FIT (`setZoom(null)`
    on main) never reset the scroll, so a canvas that still scrolls keeps
    it. With the gutter fixed and the reset removed (mutant
    `fit-keeps-scroll`), a parked block leaves 388 px left and 431.5 px top
    hidden after FIT, and the plain case 0 (MEASURED: `fit-check.mjs --only
    fit-after-scroll-pasteboard,fit-after-scroll-plain` with
    `POSTR_MUTANT=…fit.mutants.json#fit-keeps-scroll`; found by the step 11
    claims audit). Section 7 fixes both.
- **B (the floors).** The zoom controls clamp with `Math.max(floor, next)`,
  which raises a zoom that is already below the floor. Two floors disagree
  (0.3 on the buttons, 0.2 on the pinch), and the fit has none, so a fit or
  a pinch below the button's floor turns Zoom out into zoom in.
- **C (the panel).** `useState(true)`: the guidelines panel opens at every
  width.

- **D (the focus ring), found by cause C's third review.** The house
  `:focus-visible` ring in `index.css` was written for buttons styled with
  `all: 'unset'`, but that is an inline style: an inline declaration beats
  a stylesheet rule that is not `!important`, so the ring never drew on
  them. Cause C moves keyboard focus to two such buttons.

**Siblings checked** (process step 5):
- the ruler's own copy of the padding (`pad = 96`): shares the constant, not
  the fit's error; handed to item 4 (confirmer B, MEASURED by B; its scripts are in the fix's scratch folder
  under `confirmB/`, confirmer A's under `confirmA/`);
- the Preview overlay's own gutter, the share pages, thumbnails and
  print: separate fits, whole in every case measured (review R5, MEASURED
  by R5);
- fix 02's stored-versus-rendered geometry: not the same cause; the fit
  reads the canvas's rendered box (INSPECTED, `useZoom`);
- the zoom floors (B) and the panel's default (C) came out of the same
  confirmation, as separate causes.

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

### Cause C — the guidelines panel's first state (branch `editor/guidelines-closed-small-screens`)

The panel starts closed when the window is narrower than 1600 px (owner
decision). `PosterEditor` reads `matchMedia('(max-width: 1599px)')` once,
in the state's initialiser:
- So the first render, and the first fit, already have the wider canvas.
- Resizing the window later never opens or closes the panel under the
  user; the toggle does.
- The choice is not remembered between visits, as before.

The branch is stacked on `editor/fit-whole-sheet` because its tests use the
shared `workspaceKit.ts`.

**After the code review** (each finding reproduced first):
- HIGH, reproduced with a failing test: the phone share view now rendered
  the "Show poster guidelines" toggle. There the panel is never drawn, and
  the share bar covers the toggle. It is gated like the sidebar's reveal
  tab (`!mobileShare`), with a test and a desktop-share control.
- MEDIUM: the guard read `window.matchMedia` without checking that `window`
  exists. The panel's first state now goes through `mediaQueryMatches`,
  exported from `useIsSmallScreen.ts`, the same guarded read every other
  call site uses. It is not a live bug: nothing renders React outside a
  browser (`scripts/prerender.mjs` only injects strings).
- LOW: the constant sits next to its use, and its comment says "1599 px
  wide or narrower".

**A sibling, found by measuring** (section 8): a closed panel is clipped to
zero width, not removed, so its 40 controls stayed in the keyboard's reach,
invisible, on main too. Cause C makes the closed panel the default on most
laptops, so the panel is now `inert` while closed (and always on the phone
share view). The editor already used `inert` for preview mode.

**After the second code review, with three independent reproducers.** The
review reported two HIGH hypotheses from reading the code. Before any
change, a workflow ran three reproducers on frozen copies of main and of the
fix. Each had its own scope and its own instruments:
- **T:** the onboarding tour.
- **F:** keyboard focus when a panel closes.
- **S:** a sweep for anything `inert` breaks.

I measured the same two hypotheses with `fit-check.mjs`. Every claim below
is MEASURED on both trees by the reproducer (its own script in the fix's
scratch folder, not committed), and by `fit-check.mjs` where a claim names
it. (Corrected after review R8: `fit-check.mjs` has no Backspace or
block-count scenario, so "14 → 13 blocks" is the reproducer's alone.)
- **The tour's last step pointed at nothing (regression from cause C).**
  Below 1600 px the step measured the closed panel, which sits off the
  window's right edge, and dimmed the whole editor. It now takes selectors
  in order of preference, and points at the panel's "Show" toggle while the
  panel is closed. The copy says "Open it when you need it; close it to give
  the canvas more room", which is true in both states.
- **Three more tour defects, all on main too, with the same cause** (the
  tour measures a target without making it visible):
  - a sidebar step after the user collapsed the sidebar mid-tour
    highlighted an empty strip; the tour now opens the sidebar first;
  - step 7's export button sat below its panel's scroll; the tour now
    scrolls a target into view before measuring it;
  - a highlight touching the window's top or left edge gave a dimming strip
    a negative size, which the browser drops, so the previous step's strip
    stayed over the highlight (reproducer T). The strips are now clamped to
    the window.
- **Keyboard focus when the panel closes or opens.** On main, closing the
  panel from its focused "Hide" button left focus on that button,
  invisible. With the panel inert, focus fell to `<body>`. Opening it from
  its "Show" toggle dropped focus to `<body>` on both trees, because the
  toggle leaves the page. `useGuidelinesFocus` now moves focus to the toggle
  on close, and to the panel's "Hide" button on open. It only moves focus
  that was already on the panel or its toggle; a mouse click with focus
  elsewhere moves nothing.
- **Reverted: the sidebar's `inert`.** The first version made the collapsed
  sidebar inert too. Reproducer S measured what that did to ⌘/ from a
  sidebar field with a block selected: focus fell to `<body>`, and the next
  Backspace deleted the selected block silently (14 → 13 blocks; ⌘Z brings
  it back). Arrow keys nudged it, and a sheet-size field committed on the
  blur. On main the same keys edit the hidden field instead. Moving focus
  to the "Show sidebar" tab would not help, because the canvas shortcuts
  act whenever focus is not in a text field. Which of those behaviours is
  right is an owner call. The sidebar's default did not change in this fix,
  so the sidebar is back to main's behaviour and its keyboard problems are
  handed on (section 10).

**After the third review** (two reviewers, split: code correctness, and
what users experience; each MEDIUM finding reproduced in Chromium first):
- **The tour now follows its target every frame while a step is shown.**
  It used to measure only on step changes. At the last step, a user who
  clicked the highlighted toggle got a highlight 842 px from the panel it
  opened. The step's text now matches the state: "Open it with this
  button…" on the toggle, "Close it to give the canvas more room" on the
  panel.
- **A target is scrolled only vertically, inside its own panel.**
  `scrollIntoView` also scrolled the sidebar's clipped wrapper while it
  slid open, which put step 2's highlight 144 px off its target after the
  tour reopened a collapsed sidebar. A target taller than its panel (the
  canvas when zoomed in) is not scrolled at all.
- **The sidebar is opened only when the step changes**, never on a resize
  or when a modal closes.
- **The dimming strips are clamped on all four sides**, each with a test.
  The tests wait for the tour to appear instead of a fixed 900 ms.
- **Closing the panel records where focus is** at the moment of closing,
  in the Hide handler, rather than relying on when a browser moves focus
  out of an inert element.
- **In Chromium a mouse click moves focus the same way**, because Chromium
  focuses a clicked button. A Chromium control confirms that no ring shows
  after a click (`:focus-visible` false).

### Cause D — the house focus ring (same branch, own commit)

`button:focus-visible` in `index.css` now sets the outline and its offset
`!important`, so the ring draws on buttons styled with an inline
`all: 'unset'`, as the rule's own comment always said it should. Only the
outline is `!important`; the radius stays each button's own. Of the 20
inline `outline: 'none'` in the app, one is on buttons: the sidebar tabs'
`tabStyle`, which the rule overrides on purpose (its comment now says so);
the others are on inputs, selects, textareas and three divs, which the rule
does not touch. (Corrected after review R8: this said "three, all on
inputs".)

## 8. Results after the fix

**The final code, all four causes** (MEASURED on 1cd5f76, the branch head
after the review follow-ups and the claims audit's new guard; re-run with
the commands in section 3):
- `fit-check.mjs`, the complete run: exit 0, 148 scenarios (143 with a
  claim, 5 controls), no errors, every control passed. H1 0 of 88; H2 0 of
  1; H3 0 of 1; H4 0 of 7; H4k 0 of 2 (the guidelines panel); H5 0 of 2; H6
  0 of 2; Ht 0 of 9; Hp 0 of 4; Hf 0 of 2; Hr2 0 of 3; the review
  follow-ups' Hb 0 of 2, Hw, Hk2, Hr3, Ht6 and Hts 0 of 1 each; the ruler
  guard Hr 0 of 88 (the filled-axis error is 24 px in 88 of 88, as on
  main; 20 of the 88 H1 runs, the "default" ones below 1600 px, now repeat
  their "closed" twins, so the 88 cover 68 distinct states). No fit
  scrolls (0 of 88), and the 132 px overflow is gone (0 of 88).
  Information only, handed on (section 10): the collapsed sidebar keeps 29
  controls in the Tab order (H4k-sidebar 2 of 2) and keeps focus on a
  hidden field after ⌘/ (Hf-sidebar 1 of 1); handles start under the ruler
  in 4 of 12 cases (Hh; the worst −19.75 px at 2560 × 1440 on 24 × 36 in).
- Mutation checks: fit 14 of 14 killed, floors 8 of 8, panel 22 of 22.
- Browser-only blind spots (`blind-spot-check.mjs`): ring 7 of 7 guarded;
  fit 1 guarded and 1 accepted; panel 2 guarded and 1 accepted (reasons in
  the specs and in section 9).
- The full suite: 2973 of 2973 in 180 files.

(Corrected after review R8: this headline said "H4k 0 of 4, exit 0" for a
run that could not have produced it on the final code. The numbers under
each cause below are from the rounds they name.)

### Cause A

**Chromium, `fit-check.mjs`** (MEASURED; `292f10f` plus the uncommitted
cause A):

| claim | main | fix |
|---|---|---|
| H1: after Fit part of the sheet is hidden, or the canvas scrolls (70 at DPR 1, 18 at DPR 1.25 and 1.5) | 88 of 88 | 0 of 88 |
| the gutter on the side the sheet fills | 96 px, 36 px of it cut | exactly 64 px in 88 of 88 |
| H5: FIT after zooming in and scrolling | 36 px of the near edge hidden; 299 px left and 26 px top with a block parked off the sheet | 0 px in both; the parked block still scrolls (253 × 177 px) and the scroll is 0, 0 |
| H6: a 96 px canvas | fit 0.075, 36 px hidden | fit 0.1, 24 px gutters, 0 hidden |
| H6: a 56 px canvas | 100%, the whole poster (480 px) off the canvas | fit 0.058, 14 px gutters, 0 hidden |
| control: phone share view | 0 hidden | 0 hidden |

**The rulers** (not a claim of this fix; plan item 4). On the axis the sheet
fills, the 0" mark is 24 px off in 12 of 12 on main and 12 of 12 on the
fix. On the centred axis it moves further from the sheet's corner in 10 of
12 (by 49 to 77 px; for example −124 → −181.5 px at 1280 × 800 on
48 × 36 in, both with the guidelines panel open, as it was at that round) and slightly closer in 2. The sheet now sits deeper in the
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
- (At cause A's round; review R2 later found fractional canvases common,
  section 9.) The whole-pixel floor is UNVERIFIED as necessary. With the floor removed,
  the DPR 1.25 and 1.5 scenarios still pass (exit 0): 0 of 18 had a
  fractional canvas, so neither instrument exercises the floor. It stays as
  a cheap guard; browser page zoom was left to the reviewers.

### Cause B

(Measured at a6be0ec, cause B's first commit; the final numbers are in the
headline.)

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

### Cause C

(Measured before cause C's first commit, in the rounds of section 7; its
commit 142173a carries the third round's numbers, which follow. The final
numbers are in the headline.)

**jsdom:** `guidelinesDefault.test.tsx` 6 of 6 pass (4 fail on main,
section 4): closed at 1280, 1440 and 1599 px; open at 1600 and 1920 px;
still openable on a small screen. `shareMobile.test.tsx` (the phone share
view hides the rails) still passes.

**The keyboard and the closed panel** (`fit-check.mjs`, claim H4k,
MEASURED; 1280 and 1920 px windows). Focus on the toggle that reopens the
closed panel, then press Shift+Tab three times:

| | main | fix |
|---|---|---|
| guidelines panel | 40 focusable controls inside; 3 of 3 presses land inside | 0 focusable; 0 of 3 |
| sidebar (information only, handed on) | 29 focusable; 3 of 3 | unchanged: 29; 3 of 3 |
| control: an open rail's control takes focus | yes (both rails) | yes (both rails) |

**Focus and the tour** (`fit-check.mjs`, claims Hf and Ht, MEASURED):

| | main | fix |
|---|---|---|
| Hf: close the panel from its focused "Hide" button (1920) | focus on "Hide guidelines", invisible | on "Show poster guidelines", visible |
| Hf: open it from its focused "Show" toggle (1280) | `<body>` | on "Hide guidelines", visible |
| Ht: the tour's last step at 1280, 1440, 1599 px | highlight 100% visible (panel open) | 92% visible, on the toggle (panel closed) |
| Ht: the last step at 1600 and 1920 px | 100% | 100% |
| Ht: dimming over the last step's own highlight (1440, 1920) | 293,400 px² | 0 |
| Ht: step 7, the export button (1280, 1440, 1920) | 0 visible (below its panel's scroll) | 86% visible |
| Ht: a sidebar step after ⌘/ collapsed the sidebar mid-tour | 0 visible | 100% visible |
| control: ⌘/ with focus outside the sidebar | focus stays on "Zoom in" | the same |

The two sidebar focus cases (closing it with ⌘/ from a field) are recorded
as information and handed on: on both trees focus stays on the hidden field.

A Tab walk from the top of the page gets stuck in a table cell on the poster
(the cell keeps Tab). That trap was there on main, and it is handed on
(section 10).

**jsdom:** `guidelinesDefault.test.tsx` 16 of 16 pass. That includes the
phone share view without the toggle, with a desktop-share control; the panel
inert only while closed; focus on close and on open, with a mouse control;
and the tour's last step, stale dimming and collapsed-sidebar step. Each was
red before its part of the fix. The full suite: 2961 of 2961 in 180 files.

**Mutation check** (`03-fit-whole-sheet.panel.mutants.json`, MEASURED):
11 of 11 killed:
- always open, always closed, and the threshold off by one pixel;
- the toggle back on the phone share view, and the panel no longer inert;
- focus not moved on close, not moved on open, and moved on every open;
- the tour's last step on the panel only, no sidebar reveal, and unclamped
  strips.

Two documented blind spots:
- reading `window.matchMedia` without the guarded helper (every test
  environment here has both);
- the tour's scroll-into-view (jsdom does not scroll; `fit-check.mjs`
  measures it, 0 → 86% visible).

**Cause C after its third review** (`fit-check.mjs`, MEASURED at that round, before → after the
third round, on the fix; the final numbers are in the headline above):

| | before | after |
|---|---|---|
| Hp: step 2 after the tour reopened a collapsed sidebar, highlight's distance from the import tile | 144 px | 0 px |
| Hp: the last step after the user opens the panel from the toggle, distance from the panel | 842 px | 0.2 px |
| Ht: step 7, the export button | 86% visible | 100% |
| control: a mouse click on the toggle | — | focus on "Hide guidelines", no ring |

**jsdom:** `guidelinesDefault.test.tsx` 19 of 19. The full suite: 2964 of
2964 in 180 files.

**Mutation check** (`03-fit-whole-sheet.panel.mutants.json`, MEASURED): 17 of
17 killed:
- the default, its threshold, the phone share toggle, and the panel's
  `inert`;
- focus on close and on open, each "never" and "always";
- the tour: the toggle target, the sidebar reveal, following the target,
  the text, and each of the four strip clamps.

Three documented blind spots: the unguarded media read, and the two scroll
mutants (scrolling everything, not scrolling). (Corrected after the review:
the sentence here said `fit-check.mjs` guards both scroll mutants. It
guarded one; section 9 says how the other came to be guarded.)

### Cause D (the house focus ring)

**Chromium, `fit-check.mjs`** (claim Hr2, MEASURED): the 11 buttons with an
inline `all: 'unset'` that keyboard focus can reach in the editor's default
view, focused after a key press so `:focus-visible` applies. Buttons in
other tabs and in dialogs were not swept (review R8):

| | main | fix |
|---|---|---|
| buttons that match `:focus-visible` but draw no ring | 11 of 11 (the sidebar tabs among them) | 0 of 11 |
| the guidelines panel's Show toggle and Hide button, after Enter | — | outline solid, both |

The instrument's first version found 0 buttons: the browser expands `all`
into every longhand in the style attribute, so a regex on "all: unset" never
matched. It now looks for an inline `outline-style`.

## 9. Review of the fix

Eight reviewers worked on a frozen copy of the fix (142173a) and one of main
(292f10f). Each had its own scope and its own instruments, and none used the
author's. The numbers below are the reviewers' and skeptics', MEASURED by
their own scripts (process §1.1), unless marked. Their scripts are not
committed; each reviewer's are in the fix's scratch folder under
`review/R1/` … `review/R8/`, each skeptic's under `review/skeptic-*/`, and
the list per reviewer is in `review/review-result.json` there.

- Reviewer R1 — scope: what the user can see and reach at each edge of the fitted sheet, and the new focus rings.
- Reviewer R2 — scope: rounding, classic scrollbars, page zoom, device pixel ratios, and whether the fit oscillates.
- Reviewer R3 — scope: working at the sheet's edges: drags, handles, block controls, rubber band and pinch.
- Reviewer R4 — scope: the zoom controls end to end (cause B), swept from a fit of 0.05 to 4.
- Reviewer R5 — scope: sibling fits and other consumers of the geometry: Preview, share pages, thumbnails, print, selection, comments.
- Reviewer R6 — scope: the guidelines panel's default and keyboard focus (cause C, not the tour).
- Reviewer R7 — scope: the onboarding tour end to end, with interruptions (modals, resizes, reloads).
- Reviewer R8 — scope: an audit of the record's and the commit messages' claims against their instruments.

**Findings: 46** (10 MEDIUM, 36 LOW; none HIGH). By the reporters' own
comparison with main: 23 caused by the fix, 3 made worse, 20 there before.
Every MEDIUM got a skeptic with its own instrument: 10 of 10 REPRODUCED;
the skeptics rated 6 of them LOW.

| finding | by | severity (skeptic) | caused | what was done |
|---|---|---|---|---|
| After FIT the out-of-bounds banner hides the poster's title (77–93% of its glyphs in 1280–1440 px windows): the sheet moved 32 px up, the banner did not | R1, R5 | MEDIUM (MEDIUM) | worse | fixed (A): the banner is one line, "N blocks outside poster bounds — details in Issues". Hb: its bottom 143.7 → 45.4 px, above the sheet's 64 px top (MEASURED, `fit-check.mjs`) |
| The ZoomBar covers the rotate control of a block flush with the sheet's bottom edge near its centre | R3 | MEDIUM (LOW) | yes | owner decision (the gutter; section 10) |
| At large fitted zooms, the move control of a narrow image at the left edge sits left of the canvas | R3 | MEDIUM (MEDIUM) | worse | owner decision (the gutter; section 10) |
| The template `<select>` loses its arrow keys to the canvas, and Backspace in it deletes the selected block | R6 | MEDIUM (MEDIUM) | no | handed on (section 10) |
| A resize that leaves the tour's target in place leaves the dimming strips at the old window size | R7 | MEDIUM (LOW) | yes | fixed (C): the tour tracks the window size. Hts: strips' bottom 700 → 1000 px after a resize to 1000 px (MEASURED) |
| Closing the feedback modal mid-tour reopens a sidebar the user collapsed; section 7 said it never does | R7 | MEDIUM (LOW) | yes | fixed (C): a step is prepared once. TESTED, mutant `tour-prepares-on-resume` killed |
| Step 6 never opens the Issues tab when the poster has issues (the tab's text includes its count badge) | R7 | MEDIUM (MEDIUM) | no | fixed anyway (a one-line match in code this fix rewrote). Ht6: false → true (MEASURED) |
| Section 8's headline ("H4k 0 of 4, exit 0") cannot come from the final code | R8 | MEDIUM (LOW) | yes | corrected: section 8 now gives a complete run on the final code |
| The blind spot `tour-scroll-into-view-everything` is not guarded by `fit-check.mjs`, as section 8 claimed | R8 | MEDIUM (LOW) | yes | MEASURED with the new `blind-spot-check.mjs`: with the mutant served, 0 px sideways and 0 px off. Recorded as accepted-unguarded with that reason (below) |
| Commit 142173a's "main → fix" table puts values that are not main's in its left column (Ht 0%, Hp 144 px) | R8 | MEDIUM (LOW) | yes | corrected here (below); the commit is not rewritten |

**LOW findings caused or worsened by the fix** (18):
- **Fixed** (each red first, then green):
  - the focus ring clipped on full-width buttons, and the author ▲ ▼ ×
    rings drawn over the name field: `data-focus-inset` on all five groups
    of such buttons, and the rail tabs inset too. Hr3 now samples every
    site (7 of 7 at −2 px, MEASURED; each site removed alone turns Hr3 red,
    naming it, 7 of 7 in `03-fit-whole-sheet.ring.mutants.json`);
  - opening the panel uncovered it in place (a wipe) instead of sliding:
    focus now moves with `preventScroll`. Hw: the wrapper's scrollLeft
    during the slide 286 → 0 px (MEASURED);
  - a held Enter on a guidelines toggle flickered the panel: key repeats
    are ignored. Hk2: 6 flips → 1 (MEASURED);
  - floating-point residue after k steps in and out below 0.2 left the
    zoom 1e-17 above the fit: a zoom within 1e-9 of the fit is the fit
    (TESTED, on a 143 px canvas: 0.06083333333333335 against the fit
    0.060833333333333336);
  - the banner over a height-limited sheet (the MEDIUM above);
  - the guidelines tour tests' flake: they waited for the highlight's
    corner, which a not-yet-measured 0 × 0 target also has. MEASURED by
    the author (a probe added to the test in a scratch copy; results in the
    fix's scratch folder, `flake/probe-sidebar-step.jsonl`): in 3 of 3 runs the tour draws two 12 × 12 frames at (−6, −6) before the
    sidebar's 496 × 912 box, and reading the strips on one gives the flaked
    894 px. The tests now wait for the whole box; the strip mutants are
    still killed;
  - the zoom-in ceiling, listed as a blind spot, is now a test (80 clicks
    stop at 10×; mutant `zoom-in-unclamped` killed, 8 of 8 in its spec).
- **Owner decisions** (section 10): a mouse user sees a ring on the chrome
  button they clicked once they press an arrow or Shift (Chromium's
  `:focus-visible` rule, drawn now that D forces the ring: 6 of 7 cases, 0
  on main); a block rotated past the sheet's left edge is hidden by 21, 42
  and 62 px at the fit in 1280, 1440 and 1920 px windows (main: 0, 0 and
  39 px); at 800 × 600 with both panels open the canvas is 0 px wide and
  the readout shows 0–1% (main: 100%).
- **Claims corrected** (R8, R2; each reproduced by a skeptic or
  INSPECTED):
  - H6 read "520 px of the 48 in poster hidden"; the instrument measured a
    480 px sheet (section 4, section 8, commit 74ef5c3);
  - section 4 called the guidelines test result "the final test files run
    against main"; it was an earlier version of the file;
  - section 7 D said "three inline `outline: none` in the app, all on
    inputs"; there are 20;
  - Hr2 was claimed for "every button with an inline `all: unset` that
    keyboard focus can reach"; it measured the 11 buttons rendered in the
    default view, plus the panel's two. Hr3 now covers the five marked
    groups; buttons in other tabs and in dialogs are not measured;
  - the whole-pixel floor's reason: R2 found fractional canvases common,
    yet without the floor a visible defect (overflow, a scrollbar, a hidden sheet) appeared in 0 of 720 steps (MEASURED by R2). The floor
    stays as a guard nothing measured needs (UNVERIFIED as necessary);
  - section 8's fix-side numbers were measured before later review rounds,
    and some MEASURED labels named no committed instrument: section 8 is
    re-measured on the final code, and the rest relabelled;
  - commit 148f305's message says "142 scenarios"; the run had 147 (142
    with a claim, 5 controls);
  - commit 142173a's table, left column: Ht "0%", Hp "144 px" and Hp
    "842 px" are values from the third review round of the fix, not main's
    (842 px is what the fix gives with the tracking mutant served); H4 on
    main is 4 of 7 (4 of the 4 widths below 1600 px), not 7 of 7. Main's
    values are in section 4.
  - after the step 11 claims audit: the blind spot
    `tour-scroll-into-view-everything` had been accepted as unguarded, "no
    environment reaches it". The audit found one that does: going Back to
    step 1 with a zoomed canvas scrolls it 0,0 → 64,64 px with the mutant
    served (MEASURED by the audit; reproduced by the new `fit-check.mjs`
    scenario `tour-back-zoomed-keeps-scroll`: 0 px on the fix, 64 px with
    the mutant). It is now guarded; commit 729eb91's message still calls it
    accepted.

**LOW findings that were there before** (18): handed on in section 10.

Critic — 17 gaps (1 HIGH, 7 MEDIUM, 9 LOW). The HIGH one: every claim was
measured in Chromium only; Firefox and WebKit need a download, which is the
owner's call (asked). The MEDIUM ones are listed in section 10.

Jev — shadow mode (the review-finding format has not passed its gate): 46
findings sent, 0 routed (`jev-route-findings.mjs`, route log in the fix's
scratch folder). Jev judged 42 as evidence on both trees (35 with a
control) and 4 as weaker (3 one tree, 1 code only), all 4 below confidence
1.00, so none could have been routed. Nothing to audit (this is not a pass).

**Blind spots, falsified in the browser** (`blind-spot-check.mjs`,
MEASURED): `ruler-origin-96`, `tour-no-scroll` and
`tour-scroll-into-view-everything` are guarded (their scenarios go red with
the mutant served). Accepted unguarded, with reasons in the specs: the
whole-pixel floor (reached: fractional canvases in 664 of 720 of R2's
sweep steps; yet without the floor, a visible defect (overflow, a scrollbar,
a hidden sheet) in 0 of 720, MEASURED by R2) and the guarded media read (no environment here lacks a window
or matchMedia).

**Code reviews of the follow-ups** (process step 9):
- The first, of the fixes above except the flake and the blind spots, found
  one MEDIUM: `data-focus-inset` had no check for three of its five sites
  (reproduced: 0 tests referenced it; Hr3 sampled two). Hr3 now samples all
  five. It also saw the tour test flake once in the full suite (above), and
  noted that the rail tabs' inset is written in `Sidebar.tsx`'s own style
  block rather than through `data-focus-inset` (kept: that block already
  styles the tabs).
- The second, of everything above, found one HIGH: Hr3 located the
  guidelines header by the very attribute under test, so with the headers'
  `data-focus-inset` removed it read "Save as…" instead and stayed green
  (reproduced: exit 0 with the mutant served). The headers now carry their
  own hook, `data-postr-section-header`, and Hr3 reads all five. MEASURED
  with `03-fit-whole-sheet.ring.mutants.json` (seven browser-only mutants,
  one per site): each turns Hr3 red, naming its site; `blind-spot-check.mjs`
  7 of 7 guarded. Two LOWs: the one-line banner keeps `maxWidth: 400` with
  `nowrap` (MEASURED by the reviewer: 13 blocks off the sheet make it 313
  px wide, so it fits; not changed), and `fit-check.mjs` is over 1,000
  lines (handed on: split it by concern). The reviewer also re-ran the
  other mutants in the browser (6 of 6 red) and the three jsdom specs
  (8 of 8, 14 of 14, 22 of 22 killed).
- The same reviewer then re-checked the Hr3 fix as a skeptic, with its own
  mutants that remove the attribute from ONE header (Writing Guide, then
  Scratch Pad, the first in the page): both red, control green (MEASURED by
  the reviewer). Its one LOW, the helper that opens a section also finding
  it by `data-focus-inset`, is fixed (it now uses the header hook).

## 10. Limits and follow-ups

**Found after the merge (2026-09-29).** This fix re-ran its own four specs
but not fixes 01 and 02's. Its rewrite of the fit code (cause A) left three
of fix 02's sheet mutants on removed code, so that whole spec stopped at
"bad spec" and its 36 gated mutants guarded nothing. They were ported
(record 02 §8: control 102/102, 36/36 killed, MEASURED). Every committed
spec was then re-run on the ported tree: 206 of 206 gated mutants killed,
17 documented blind spots, 223 mutants, no survivor (MEASURED by the port's
second review, one spec at a time). And
`scripts/__tests__/mutantSpecs.test.mjs` now fails the suite when a
committed spec no longer applies.

The test checks that each spec still applies, not that it can guard
anything. Its second review found shapes it still passes (all LOW or INFO,
MEASURED by the reviewer on crafted specs), handed on to the process branch,
which owns `lib/mutants.mjs`:
- a mutant with `"edits": []`, an edit with count 0, or edits that cancel
  each other: one check on the net effect (does `mutate()` change the file?)
  would cover all three and the no-op edit (all 223 committed mutants pass
  it); a blind spot shaped so reports "BLIND SPOT", exit 0;
- a mutant id written twice (JSON keeps the last);
- `"expect"` misspelled, which `blind-spot-check.mjs` then silently drops;
- `"edits"` given as an object stops the test at a bare TypeError that
  names no mutant;
- a blind spot whose edit lands in a file none of the spec's tests load
  (mutation-check reports it as a blind spot, exit 0);
- a failing test-file load that the control does not catch (the port's first
  review, CR-3; the process branch's uncommitted `mutation-check.mjs` has
  the check);
- once the process branch merges, its `loadSpec` throws on the first
  problem, so this test would again name only one.

**Owner calls made here** (each can be reversed on request):
- **The phone share view keeps its own 8 px gutter.** The owner's 64 px is
  for the desktop workspace; on a 375 px phone it would take a third of the
  width.
- **A canvas narrower than two gutters gets a smaller gutter** (a quarter of
  the canvas per side), not the old 100% fallback. There, handles can sit
  under the rulers.
- **The panel's first state is read once.** Crossing 1600 px later neither
  opens nor closes it, and the choice is not remembered between visits
  (as before).
- **The closed guidelines panel is inert, and focus follows it** (to the
  toggle on close, into the panel on open, only when focus was already
  there). The sidebar is not made inert: its focus after ⌘/ is handed on.
- **The tour's last step points at the closed panel's toggle** rather than
  opening the panel, so the tour leaves the panel as the owner decided it
  should start. A sidebar step does open a sidebar the user collapsed: a
  tab in a closed sidebar shows nothing.

**Owner decisions asked after the review** (section 9; 2026-09-29). The
owner answered on 2026-09-30, with the goal of an editor that adapts to every
screen size and feels smooth: the controls are to stay one size on screen at
every zoom (plan item 19, the gutter stays 64 px); toolbar buttons show a
ring only after Tab (item 20); the guidelines panel closes when the poster
area is too narrow (item 21); the template dropdown's keys (below) are item 22;
and Playwright's Firefox and WebKit engines are installed. Later the same day
the owner parked items 21 and 22 on the Later list, kept 19 and 20, and had
the remaining items re-ranked by their effect on a first visitor
(`docs/stress-test/PLAN.md`). The questions as asked:
- **The 64 px gutter and the block controls.** The ZoomBar covers the rotate
  control of a block flush with the sheet's bottom edge near its centre; at
  large fitted zooms the move control of a narrow image at the left edge
  sits left of the canvas; a block rotated past the left edge is hidden by
  21–62 px at the fit (main 0–39). Same root as the handles under the
  ruler (below): the controls scale with zoom, the gutter does not.
- **A ring after a mouse click.** Once D draws the house ring, a mouse user
  who clicked a chrome button (Zoom in, FIT, a rail tab) and then presses an
  arrow key or Shift sees a ring on that button: Chromium's `:focus-visible`
  rule (6 of 7 cases; 0 on main, where no ring drew at all).
- **A 0 px canvas.** At 800 × 600 with both panels open the canvas has no
  width; the readout shows 0–1% (a fit left from the panel's slide) where
  main showed 100%. Nothing is visible either way.
- **Firefox and WebKit** (the critic's one HIGH gap): measuring them needs
  `npx playwright install firefox webkit`, a download.

**Accepted limits of this fix:**
- **The whole-pixel floor in the fit is UNVERIFIED as necessary.** Review
  R2 found fractional canvases common, but without the floor a visible defect
  appeared in 0 of 720 steps (MEASURED by R2). It costs under a pixel and stays as
  a guard (an accepted blind spot, section 9).
- **A new poster size is drawn at the old fit for one render** before the
  fit catches up (the code review's suggestion, not taken). It was already
  so on main.
- **The fit is still capped at 5×** while manual zoom goes to 10× (as on
  main).

**Handed on** (existed before this fix, or outside its causes; to go into
`docs/stress-test/PLAN.md`):
- **Rulers (plan item 4).** On the axis where the sheet is centred, the 0"
  mark is off. With the guidelines panel in the same state on both trees,
  more so after this fix: at 1280 × 800 on 48 × 36 in with the panel closed,
  −4 → −61.5 px; at 1920 × 1080 (open), −24 → −81.5 px. As the editor opens
  by default at 1280 × 800, the error shrank (−124 px with main's open panel
  → −61.5 px), because the panel now starts closed (MEASURED:
  `fit-check.mjs` fit scenarios, `rulerError`, on both trees; figures from
  the step 11 audits). On the filled axis it is
  24 px off, the ruler bar's own inset, before and after. `fit-check.mjs`
  guards the filled axis (Hr); item 4 must update that guard.
- **Handles under the ruler at large fitted zooms.** The handle row is drawn
  inside the zoomed sheet, 24 × zoom px above its block, so no fixed gutter
  clears the 24 px ruler at every zoom. 2 of 12 measured cases on main, 4 of
  12 after this fix; the worst is −19.7 px, where the row starts above the
  canvas. The rulers let clicks through, so the handles still work where
  they are visible. The options (handles at a fixed screen size, or a
  larger gutter) are the owner's.
- **The collapsed sidebar and the keyboard** (MEASURED by reproducers F and S, whose scripts are in the fix's scratch
  folder under `repro/F/` and `repro/S/`; `fit-check.mjs` measures
  only where focus lands after ⌘/; the same on main and the fix). The collapsed
  sidebar is clipped, not removed:
  - 29 of its controls stay in the Tab order, invisible;
  - ⌘/ from a sidebar field leaves focus in that field, and typing edits it
    unseen (6 of 6; with Enter the poster name is saved);
  - making it inert (tried here, then reverted, section 7) sends focus to
    `<body>`, and then Backspace deletes the selected block;
  - opening it with its "Show sidebar" tab drops focus to `<body>`.

  Where focus should go after ⌘/ is an owner call. Also found by S, on
  main too:
  - "Comment on selection" with the sidebar collapsed mounts the draft in
    the hidden sidebar and silently switches the canvas to review mode;
  - dialogs rendered inside the sidebar without `aria-modal`
    (ImportConfirmReplaceModal, CopyDesignModal, ImportPosterModal) are
    drawn inside its 484 px rail, because a GSAP entrance leaves a transform
    on it, and ⌘/ can hide them while they are open.
- **A table cell keeps Tab** (MEASURED by reproducer F, scratch `repro/F/`): from a fresh load,
  120 Tabs end stuck in a table cell on the poster, on main and the fix.
  `blocks.tsx` `onCellKeyDown` prevents every Tab, and the last cell moves
  nowhere. So forward Tab from the top never reaches the guidelines toggle;
  Shift+Tab does.
- **`PosterEditor` calls hooks after an early return** (`if (!doc ||
  !posterId) return …`), which breaks React's rule of hooks. INSPECTED only;
  offered as a separate task.
- **From the confirmers** (section 5), not changed here:
  - the phone share view's bottom bars cover 32–50 px of the fitted poster;
  - the desktop share page shows the guidelines panel and the rulers to a
    read-only visitor (an owner question: should read-only viewers get
    them at all?);
  - the "frame grows with overflowing text" mechanism (`canvasOverflow`)
    never fires in a browser, and fix 02's test of it models a browser
    behaviour that does not happen;
  - undoing a size change keeps a manual zoom;
  - the fit is capped at 5× while manual zoom goes to 10×.
- **From the independent review, there before this fix** (section 9; the
  reviewers' numbers):
  - the guidelines template `<select>` gives its arrow keys to the canvas,
    and Backspace in it deletes the selected block (MEDIUM, R6);
  - the panel's toggle has no `aria-expanded` or `aria-controls` (R6);
  - zoom: a pinch during the panel's 280 ms slide can go the wrong way; a
    pinch over the ZoomBar is not handled; a Zoom out that lands exactly on
    the fit leaves manual mode; more than 52 Ctrl+wheel events in one task
    throw "Maximum update depth exceeded"; line-mode wheel events (Firefox)
    zoom about 30× less per notch (R4);
  - classic scrollbars: a block parked off one axis makes the other axis
    scroll by the bar's width; on the phone share view 3 px of the sheet sit
    under it; the fit lags the sidebar's slide by one frame (R2);
  - a rubber band from the gutter selects by stored geometry (R3);
  - the undo toast straddles the sheet's bottom edge for 1.2 s; on a tall
    poster the phone share bar covers 57 px; table handle rings are drawn at
    20% opacity, and three Figure-tab buttons' rings are clipped (R1);
  - the tour: step 1's tooltip leaves the window when the sidebar is
    collapsed or the canvas panned; collapsing the sidebar during a sidebar
    step leaves the highlight on the canvas; leaving the editor mid-tour
    restarts it at 1/8; step 2's tooltip runs off a 600 px window; closing
    the feedback modal mid-step switches the sidebar back to the step's
    tab (R7).
- **The critic's MEDIUM gaps, not tested:** "a new poster size scrolls back
  to 0,0" in a browser (only jsdom); a production build (every run used the
  dev server, with StrictMode); the tour during the other modals (it is
  suspended only for publishing and feedback); D's ring in dialogs and
  toasts; the quarter-cap zone below 1280 px; crossing the 640 px share
  threshold live; the tour's keyboard path.
- **Browsers:** only Chromium was measured. Firefox and WebKit are not
  installed here.
