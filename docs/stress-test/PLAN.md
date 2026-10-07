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
- **From fix 19 (2026-10-06), the owner's MVP triage of its questions**
  (record 19, section 10; MEASURED with `control-size-check.mjs` on the
  fix, Chromium, at the 1280 × 800 fit unless marked):
  - Q5: a group's members keep drawing their own handles, move, delete
    and rotate, under the group frame and its handles: 10 covered and 14
    overlaps (main: 20 covered, 36 overlaps). Hide them while a group is
    selected, as PowerPoint and Figma do.
  - Q6: crop mode's Cancel / Reset / Apply bar lies on the rotate control
    (407.6 px²), and on a small image the crop edges overlap its corner
    handles (about 75 px²) and each other. Hide rotate while cropping.
  - Q7: a table's row and column strips are drawn when the table is not
    selected (as before) and sit under its n, nw, ne and w handles (11
    overlaps); on rows under 24 px on screen (12.25 px at 100%, 17.05 px at
    the fit) the row strips fail WCAG 2.5.8 by size and by spacing (claim
    Tl, 3 of 44 views), which no control size can change.
  - Q8a: the group frame is placed from the blocks' stored geometry, 95.6
    units below a text block's rendered bottom (133 px at the 1280 fit,
    324.2 px at the 2560 fit; claim Gf, 8 of 8, three engines), with
    record 02's drag guide and record 03's rubber band.
  - Q8b: the floating format toolbar stays where it was after a pinch, 192
    px from its text (191.8 Firefox, 189.3 WebKit; claim Tf).
  - Q9: the ZoomBar's own buttons are under 24 px: 21.3 × 25, 50 × 17.5,
    25 × 16 px.
  - A 44 px size for a coarse pointer (touch, pen).
- **From fix 19's review round 1 (2026-10-06)** (record 19, sections 9 and
  10; `control-size-check.mjs`, three engines, unless marked):
  - Zoomed far out, a selected block's handles, move button or rotate
    control can still lie on another block's centre, so a click there
    selects nothing (review F3's remainder, claim Ns, information): 14 of
    78 clicks at the template's other blocks with its image, title or
    table selected, at the 20% floor and 0.35 (Firefox and WebKit 13; main
    4). None deletes, replaces or crops the selected block any more (claim
    Fd 0 of 78: the lead's rule, under 35% zoom a handle row wider than its
    block draws only its move button, record 19 section 9). Hide the
    handles too on a block small on screen, or keep them.
  - Replace and Crop under 35% zoom (after F3): an image narrower on screen
    than its row of buttons (108 px) has neither until zoomed in to 35%,
    and the Figure tab's crop hint names the ✂︎ button even then
    (`Sidebar.tsx`, CropHint). The 35% threshold is measured on one
    template and poster (the hazard last seen at 30%): another layout may
    need it re-measured (`control-size-check.mjs --only overview-...`).
  - A block turned off the square (10°, ±90°, ±135°, ±170°): its upright
    handle row can lie on one of its own handles, 10 of 21 readings
    (Firefox 8), at ±90° at every zoom; main 21 of 21 (claim Or-tilt). A
    row placed out from the tilted edge by its own width would clear it.
  - A round button's hover glow and focus outline follow its 24 px hit
    area, not its 20 px circle: a dark band between the circle and the
    glow (review I1, cosmetic; the reviewer's screenshots, UNVERIFIED here).
  - Views claim R does not read (review I2, not regressions; the reviewer's
    measurements, UNVERIFIED here): a pinch to 1.63 at 1280 × 800 puts an
    edge image's corner handles 4.35 px out of the canvas (main: buttons up
    to 54 px out); a captioned image flush with a portrait poster's bottom
    edge overruns the sheet by 9 to 12 px and its bottom corner handles
    meet the zoom bar at the fits, as on main. Q3's zoom bar test could
    cover the bottom corner handles.
- On main, found by fix 19 (2026-10-06, MEASURED in Chromium by a scratch
  probe on main `e09c0ea` and on the fix): Save PDF with a block selected
  copies its selection controls into the print document (8 handles, the
  row and the rotate control on main; `printPoster` strips only
  `[data-postr-overlay]`, `PosterEditor.tsx`, where the thumbnail strips
  the selection markers too). Whether they show in the PDF was not
  measured; with fix 19 they are drawn at the editor's zoom of the moment.
- Still in the sheet's units after fix 19, growing with the zoom: a
  selected block's own border (1.5 units: 15 px at 10×; it is the block's
  box, so a thinner one would change where its text wraps) and the crop
  frame's 2-unit line; the Check tab's figure-size corner, the drag
  guides, the rubber band and the comment area's handles (hidden with
  sharing) (record 19, section 10, INSPECTED).
- The comment-mode style hides `[data-postr-rotate-handle]`, which nothing
  carries, so a rotate control would show in comment mode (INSPECTED;
  comments are hidden).
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
- **Fix 13, legend titles** are raised with legend text (fix 13b keeps it:
  `legend.title_fontsize` is set with `legend.fontsize`). Not a class the
  checker lists, so a policy for the owner: f32 at 4 × 3 in crosses 1.394 in²
  with the title raised against 0.208 left at 10 pt (record 13, section 10;
  the same on 13b).
- ~~**Fix 13, one layout pass** and **what counts as out of date**~~ gone
  with part 1's helper (fix 13b): the plain edits set each size where the
  code sets it, and the fixed script measures the same as the layout grid's
  ideal control in each of its 26 stale-layout tags outside the seaborn grids
  the fix sets to the print size (record 13b, section 10).
- **Fix 13b, a seaborn grid smaller than the print size** (an owner
  question): the script sets the grid to the print size, so two texts that
  printed at 15.67 and 17.95 pt at the grid's own size print at 14 (pass to
  pass; c-displot and p2-facetgrid at 14 × 10 in, MEASURED, the gate's L 4).
  Setting the size only when the grid is larger than the print size would
  keep them; not built (a runtime branch, and the re-check could then only
  give a lower bound).
- **Fix 13b, a legend wider than the print size leaves room for** (an owner
  question): f17 at 4 × 3 in, two facets and a legend 2.942 in wide at 14 pt:
  `tight_layout` gives up and the legend covers the plots (2.484 in²,
  MEASURED by the shape harness). Moving such a legend below the plots is
  not built.
- **Fix 13b, rows for text the code does not draw:** a plot title or legend
  the script never makes (Python), or a legend, strip or caption (R), still
  has a row at the default size, unmarked, as on main, and the script sets
  it (harmless; INSPECTED). Since review round 2 a Python row of that kind no
  longer drives the one-number advice.
- **Fix 13b, `ReadabilityPanel.tsx` is 1245 lines** (1208 on main, over the
  800-line rule before 13b); a split is its own change.
- **Fix 13b review round 2, the fit block at a small print size** (R2-12):
  when what a script draws outside its plots is wider than the canvas at the
  sizes needed, the fit stops at a tenth of the canvas and the box cuts the
  rest, and the page cannot know before the script runs, so its ✓ stands
  (py08 at 4 × 3 in: a legend entry cut, MEASURED). The copy now says the
  crop's text is kept when it fits. Re-running the script's own layout
  inside the fit loop, or warning when the fit stops at its floor, is not
  built. Review round 3 (P13B-R3-05) asked again for the ✓ or the all-pass
  line to be withheld for a tight save at a small print size: accepted as is
  (record 13b section 9): the page has no text extents to say "small"; on the
  review's partition 1 of its 5 tight-save scripts cuts a text, at 4 × 3 in
  only (MEASURED with the review's driver), and the shape harness measures 3
  of the 4 corpus tight-save scripts cut at 4 × 3 in, 0 at 6 × 4.5 in.
- **Fix 13b review round 3, an unread `font.size` floored at the largest
  need:** `max(N, float(EXPR))` raises every class that follows it to the
  need of the largest, so a script with no layout call of its own cuts more
  at the canvas edge than the ideal control (0.607 against 0.316 in² at
  6 × 4.5 in, MEASURED, record 13b section 10). Per-key floors after the
  `font.size` line, as for a seaborn context the check cannot read, would
  match the ideal; not built.
- **Fix 13b review round 3, an R theme from outside the script under a name
  that is not `theme_*`** (`+ my_theme()` from a `source()`d file): no complete
  theme is seen, so base 11 is assumed and set at the root
  (`text = element_text(size = 11)`), which lowers the text if that theme
  draws larger (INSPECTED; how common is UNVERIFIED; no corpus script). A theme
  held in a name or a function the script itself defines is read (R15). A
  floor on the root size, or reading the sourced file, is not built.
- **Fix 13b review round 3, a Python `fontdict=` the check cannot see into**
  (a call's result): raised only where it falls short, with a plain
  `fontsize=N` (review round 1's choice), which would lower a larger size the
  dict sets (INSPECTED); where it passes it is left as written and the panel
  says to check it.
- **Fix 13b review round 3, devices the check does not read:** svglite
  (UNVERIFIED: not installed), and a plot drawn with `plot(p)` or
  `grid.draw()`: the page says it found the device but not its plot, and the
  script saves `poster_figure.png` at the size checked.
- **Fix 13b review round 2, several figures in one Python script** (out of
  scope by the owner's design): the first figure's canvas is read for the
  second (py09: 2 false passes and 6 false greens in 9 runs, MEASURED with the
  review's driver), and the page says nothing about it. A warning when a
  script makes more than one figure is not built.
- **Fix 13b review round 2, an R canvas the check cannot read**
  (`ggsave(width = cfg$width)`) is set to the size checked, so text a smaller
  canvas printed larger prints at 1.0 × (the R gate's L 15, every verdict
  kept, no size lowered). `min(cfg$width, W)` would keep the larger print
  but mixes units; not built.
- **Fix 13b review round 1, outside text wider than the canvas:** where what
  a script draws outside its plots (a long legend or suptitle) is wider than
  the canvas at the sizes needed, the fit block cannot fit it: at 4 × 3 in
  three of the four tight-save scripts cut 0.33–0.96 in² of text (MEASURED,
  shape harness); 0 at 6 × 4.5 in. Moving the legend inside or below the
  plots is not built (record 13b, section 10).
- **Fix 13b review round 1, a reset inside an `if`** is read as made: a false
  fail when the branch does not run, and the script writes the reset's size
  (one of the gate's L 5, pass to pass). Reading both branches is not built.
- **Fix 13b review round 1, text grown past a canvas the script fixes** with
  no layout call of its own (an axis title cut at the edge, 13 gate runs, 9
  on main): the size's own cost, equal to the ideal control's in 23 of 23
  runs measured; adding a layout call to the user's script is not built.
- **Fix 13b review rounds 1 and 2, patchwork** (UNVERIFIED, patchwork not
  installed): since round 2 a patchwork of plot names (`p1 | p2`) is read as
  a combined figure and themed in each plot, as cowplot and gridExtra are
  (measured for those two); measure with patchwork installed.
- ~~**Record 24 review round 1, the refund button as an automated decision**~~
  FIXED 2026-10-06 (`fix/refund-review-note`): every refusal the endpoint
  sends (a 409: `window_expired`, `already_used` for a term or a pack,
  `no_pack_purchase`, and `no_subscription`, `no_invoice`, `no_payment`, which
  showed the generic "try again" before and now read "This purchase can’t be
  refunded here.") ends "This answer was given automatically. To have a person
  review it, email support@resila.ai."; a failure that is not a 409 keeps the
  generic message without it (`profile/__tests__/SubscriptionPanel.test.tsx`:
  7 of 13 red on main's component, 13 of 13 after; its one review found the
  three unmapped codes).
  Was (LOW, INSPECTED; the legal reading UNVERIFIED). Privacy §7 and §10 name
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
- **Item 13 part 2, the plot checker's misses** (fix 13b reads the sizes
  below and places the R fix after every theme; the two sets of minimums and
  the inserted charts are stream Q's; these are the audit's sub-items): R sizes set with
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
  (1) and (2) FIXED in the merge of 26 (2026-10-06): the French Terms §7.2
  now name the pricing page « Tarifs », as the French page is titled (R1-07),
  and the `/terms/fr` and `/cookies/fr` crawler copy says « facturation » and
  « fonctionnalités », as the French Terms do (R1-03); (3) on main already: when Supabase answers an e-mail
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
| 13 | `checker/python-reads-own-fix` (part 1), `fix/13p2-checker-sizes` (part 2) | part 1 done — `docs/fixes/13-checker-reads-its-own-fix.md`; part 2 implemented, review rounds 1 (17 findings: a tight save cut what it drew outside the plots, a `fontdict=`/`prop=` overwritten so the script raised, R theme order, `theme_void()`, a theme that is not ggplot2's, `ggsave(filename = …)`, `**kwargs`, and more) and 2 (13 findings: an R figure combining plots themed as a whole, a blank image for gridExtra; a panel letter replacing the centre title; a size the check cannot read pinned at the default and lowered; R names with a comment; PdfPages; colorbars seaborn and pandas make; sup-labels; legend guides; png() devices; advice from rows not drawn; `%+replace%`; loops over Axes) and 3 (5 findings: a theme held in a name or a function dropped from a combined figure's plots and base 11 written over it; the floor on a string font.size, an import above `from __future__`, `FontProperties as FP`; a passing unread size left unfloored; a plot drawn on its own line in a device, `grid.arrange()`, ragg; a cut legend at 4 × 3 in, accepted) done and answered — `docs/fixes/13b-checker-sizes.md` (the owner's design of 2026-10-07: a bounded rule table read by position, the last setting winning; a size or canvas the code leaves out marked `*` and set in the script the page asks you to use in place of yours; plain edits instead of part 1's helper. On the corpora with every review scenario, 116 Python and 61 R scripts × 4 sizes in real matplotlib, seaborn and ggplot2: first-check false passes 201 → 0 unmarked (Python; 10 on rows marked `*`) and 126 → 0 unmarked (R; 6 marked), re-check false greens 151 → 0 and 141 → 0, scripts whose fix leaves a text short or does not run 31 → 0 and 51 → 0, texts cut from the image 0 → 0, false fails 151 → 16 and 86 → 22 (rows marked `*`); R sizes written below what ggplot2 draws 68 → 0 (R texts printed smaller 78 → 15, all from a canvas the check cannot read, set to the size checked); Python 0 → 5, pass to pass: two seaborn grids at 14 × 10 in, an owner question, and a reset inside an `if`) |
| 7 | `fix/07-figure-script-kept` | done (three review rounds); review round 1 answered (a blank-line regression fixed, tests added, legal copy corrected); round 2 answered (a result checked against an image block is no longer shown under the preview's size, and a kept result says the size it is for; a long script edited after its Check stays stored); round 3 answered (a note no longer promises an image check comes back) — `docs/fixes/07-figure-script-kept.md`; the owner's decisions of 2026-10-06: the script kept per poster in this browser and re-checked on return, sessionStorage on the public page, Check stays up once a script is in, and the same cause fixed in the Authors, References, Make-a-figure, poster-name and version-name drafts (memory only) |
| 15 | `fix/15-checker-language` | done (three review rounds) — `docs/fixes/15-checker-language.md` (Check answers when it cannot tell R from Python; unsupported plotting systems are named, not scored; a result on screen stays, marked out of date, and one a new print size hides is said to be hidden; detection reads live code only, re-landing 9ea9f38; a string in `aes()` or seaborn's `barplot()` places nothing on its own: code with only such a token gets the could-not-tell answer (an R package name such as `library(tidyverse)` is an R signal and is checked as ggplot2)) |
| 19 | `fix/19-controls-one-size` | fixed; its one review round (the browser, through the user's entry points) answered: on a turned block the handle row now turns about its own centre (near 180° it lay on the block's own handles, and a click on one deleted the block), and crop mode's edge handles no longer animate their size after a zoom change; after the round, by the lead's decision, zoomed out under 35% a handle row wider than its block draws only its move button (there a click meant for another block could delete the selected image: F3; the threshold measured); three cosmetic or older items and F3's remainder went to the Later list — `docs/fixes/19-controls-one-size.md` (a selected block's handles, row, rotate control, a selected table's strips and grips, crop mode's edges and bar and a group's handles and outline are the same size on screen at every zoom, 24 px to grab with 8 px squares and 20 px circles; a block small on screen draws fewer controls; the rotate control moves into the handle row where below it would meet the ZoomBar or leave the canvas; the owner's Q5–Q9 are on the Later list) |
| 24 | `fix/legal-canada-law25` | done (three review rounds; round 3 found nothing left) — `docs/fixes/24-legal-canada-law25.md`: the Privacy, Cookies and Terms pages (EN and FR) rewritten for Quebec's Law 25 and PIPEDA first, Global Privacy Control honoured, poster ids kept out of the analytics address and its Referer, the feedback console log opt-in, account deletion clearing every Postr browser entry, the French Terms linked at sign-up; internal file `docs/legal/quebec-law-25.md`; the claims audit's product defects queued above |
| 25 | `fix/latex-hidden-prices` | one review round (browser and entry points), answered: the `/auth?plan=term` label puts the period before the tax note, a stale code comment reworded — `docs/fixes/25-latex-hidden-prices.md`; the owner's decisions of 2026-10-06: the LaTeX export hidden (`LATEX_EXPORT_ENABLED`, `config/features.ts`; before it returns: the section above), every price shown says tax is extra, the landing "Editable exports" card says the export is paid; a copy inventory test keeps both true |
| 26 | `feat/french-public-pages` | implemented, review round 1 done and corrected (one round: a simple feature; 12 findings: 7 corrected, 1 left to the owner, 4 informational) — `docs/fixes/26-french-public-pages.md`; the owner's decision of 2026-10-06 (Quebec, Bill 96): every public page in French at its path + `/fr` (`/fr` for the landing page, `/auth/fr?plan=term`), its language read from the URL, a « Français » / "English" link on every page, the French heads with hreflang and the French pages in the sitemap, a French Stripe Checkout from `/auth/fr`; the editor stays English; queued above: "Queued by fix 26" |
