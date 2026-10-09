# Fix records

One record per fix in the September plan (`docs/stress-test/PLAN.md`), written
so someone who wasn't there can check every claim. Each record follows the same
order:

1. **Symptom** — what the researcher sees, in their words.
2. **Hypotheses** — each cause stated as a claim with the prediction that would
   confirm or refute it, including at least one alternative.
3. **Method** — the committed script(s) that test the hypotheses, the command to
   re-run them, where they enter (the user's entry point), and what they do not
   cover.
4. **Results before the fix** — the numbers each prediction produced.
5. **Independent confirmation** — two reviewers who did not use the author's
   scripts, each with its own method AND its own scope, confirming or refuting
   the defect before anything was changed. Their scopes are split so they test
   different things (for example: the claim as stated and its cause; its
   siblings, other entry points and alternative causes), never the same checks
   with a different tool. The record states the split. The same applies to the
   reviews of the fix (section 9).
6. **Root cause** — the mechanism, with file references, and what it does not
   explain.
7. **Fix** — what changed and why that shape.
8. **Results after the fix** — the same scripts re-run, plus falsification
   (revert the fix, confirm the tests go red).
9. **Review of the fix** — findings and what was done about them.
10. **Limits and follow-ups** — what the fix does not cover.

Evidence tiers used throughout: **MEASURED** (a number from a re-runnable
command), **TESTED** (a test that fails without the fix), **INSPECTED** (read the
code; nothing ran), **UNVERIFIED** (not reproduced).

## Review budget

Set by the owner on 2026-09-30: **three review rounds for important feature
logic** (data, money, privacy, a result the user relies on), **one for a
simple feature** (a display aid, a layout nicety). Count rounds per batch of
code, not per fix: a new cause's first review is that code's round 1.

**Why, from the records of fixes 01, 02, 03, 04, 13 and 23** (a tally of
every review round, 2026-10-05; the HIGH and MEDIUM counts recounted from the
records' grade labels, the rest an agent's reading of them, not re-derived:
UNVERIFIED. Record 04 is on the parked branch `editor/rulers-match-sheet`). Later
rounds were not marginal by count: they found about the same number of HIGH
or MEDIUM product defects per round at every ordinal (1.8 at round 1, 1.8 at
round 2, 2.2 at round 3, about 1.7 from round 4 on). What changed was where
the defects came from. Of the about 47 found at round 4 and later, about 25
were made by the previous round's own change, about 11 were older defects on
main found in passing, and about 11 were missed in the fix's earlier code.
Rounds in which a reviewer re-ran its own instruments found no HIGH or MEDIUM
product defect (5 of 5); rounds that added an angle found most of what was
missed (the four step 10 reviews, 3.5 each). And the cost of a missed defect,
or of a round, is not in the records.

**So the rounds go in this order:**

1. Code review on a frozen copy.
2. An independent review from a new angle: other browsers, the production
   build, the real backend, the user's own entry points.
3. A re-check of the responses to 1 and 2.

A simple feature gets one round, and it is the second kind: the browser,
through the user's entry points.

**Stopping rule.** One more round only when the last response changed what
the product does beyond a local fix with a test that went red first (a new
mechanism, keyboard or focus handling, a redesign), or an angle not yet used
applies, or the last round found a HIGH or MEDIUM data-loss or privacy
defect (then a sweep for its siblings). Findings only about the record, an
instrument or a test never justify a round: they go to the step 11 claims
audit. Defects on main found in passing go to the plan.

## Harnesses to reuse

Review agents start from these committed instruments and extend them (a new
scenario, a new fixture, a new claim) instead of writing their own. A tool
built during a review that finds a real defect is folded into the matching
harness before the fix merges: anything left in a scratch folder is lost
when it is cleared. All run from `apps/web` unless their row says otherwise;
the fix harnesses' headers give their claims, controls, blind spots and exit
codes (0 clean, 1 the defect observed, 2 an instrument error).

| harness | measures | first written for |
|---|---|---|
| `scripts/lib/editorHarness.mjs` | the base of the editor browser checks from fix 03 on: the app's own Vite server and Playwright, the backend faked at the network; `POSTR_BROWSER` (chromium, firefox, webkit), `POSTR_SCROLLBARS=classic` (scrollbars that take space), `POSTR_MUTANT` (serve a mutant, the repo never written); `RouteRedirected` and `sourceFlag` let a scenario skip a page a feature switch hides | fix 03; browsers, scrollbars and skips from fix 04 |
| `scripts/lib/guestBackend.mjs` | a fake Supabase with anonymous sessions and the posters table's row-level security | fix 23 |
| `scripts/lib/png.mjs` | decodes a browser screenshot, for judging what is painted (layout boxes do not show paint) | fix 04 |
| `scripts/mutation-check.mjs` | each part of a fix against the unit tests, one mutant at a time; a mutant no test notices is a blind spot; a test that reads a source from disk through `src/test/copyScan.ts` `readSource` sees the mutant too (fix 25; since fix 26 `vercelRouting.test.ts` reads `vercel.json` that way, and `prerenderFrench.test.ts` runs copies of the build scripts made through it) | the fix process |
| `scripts/api-mutation-check.mjs` | the same for the API (`apps/api`): copies it to a scratch folder, writes each mutant there, runs the spec's API tests (specs named `*.api-mutants.json`, paths relative to `apps/api`; the repo is never written) | fix 26 |
| `scripts/blind-spot-check.mjs` | serves each blind-spot mutant to the browser scenarios its spec names; guarded only if they go red; a blind spot's `browser.env` (for example `{"POSTR_BROWSER": "webkit"}`) runs its control and mutant in the one engine that shows it | fix 03; `browser.env` from fix 13c |
| `scripts/sidebar-history-check.mjs` | undo history and the poster name across sidebar changes | fix 01 |
| `scripts/poster-size-check.mjs` | poster size and template changes keep every block | fix 02 |
| `scripts/fit-check.mjs` | Fit and zoom: gutters, hidden sheet, focus rings, the guidelines panel, the tour | fix 03 |
| `scripts/new-poster-owner-check.mjs` | `/p/new` never opens someone else's poster | fix 23 |
| `scripts/account-change-check.mjs` | the editor across an account change, against a real local Supabase | fix 23 |
| `scripts/figure-script-check.mjs` | the plot checker's script and the sidebar's drafts across tab changes, block clicks, a reload, another poster, a copy opened in place, the dashboard round trip, and the public page's reload and new tab; a kept result against the figure and size it is for, a long script edited after its Check, and the engine's storage capacity | fix 07 |
| `scripts/checker-truth-check.mjs` | the plot checker's gate for Python: the page and the editor on 116 scripts at 4 sizes (`fixtures/checker-corpus/`), every original and corrected script run in matplotlib 3.10.8 and seaborn 0.13.2 (`truth/mpl_truth.py`: `--notebook` for a script saved as a notebook cell, `--png` for the saved image); since fix 13b a row with a missing-setting mark (`*`) is counted apart (`fpU`, `rcfpU`), the scale is also judged against the image the save writes (SAVED), and the editor's check against the picture an image block prints (EDIMG); since fix 13b review round 1 the truth lists every text drawn and whether the image the save writes cuts it (claim CUT), and a corrected script that saves an explicit box is scored against that box; since review round 2 the truth counts `fig.supxlabel`/`supylabel` as axis titles and measures the image PdfPages writes; review round 3 adds the `r3-*` scenarios (owners R3-RUN, R3-UNREAD); `lib/checkerPage.mjs` drives the page for both languages (Firefox and WebKit read the page's clipboard through an init script) | fix 13; extended by fix 13b |
| `scripts/checker-r-truth-check.mjs` | the same gate for R: the page on 61 scripts at 4 sizes (`fixtures/checker-corpus-r/`), every original and corrected script run in R with ggplot2 4.0.3 (`truth/gg_truth.R` reads each text grob's size from the built plot, and since review round 1 calls the real `ggsave()` with the arguments as bound, so a binding it rejects is the script's error; since review round 2 it measures a gtable and the plots inside a cowplot or gridExtra figure by their own cells, a NULL plot is the script's error, and a plot `print()`ed to a `png()`/`pdf()` device is measured at the device's size; since review round 3 it runs a script as Rscript does (a visible value printed: a plot on its own line in a device), records `grid.arrange()` and ragg's `agg_png`/`agg_jpeg`/`agg_tiff`, and closes the device at `dev.off()` (self-test F) — needs cowplot, gridExtra and ragg; the GATE-R line splits L into `Lsrc`, a size written below what ggplot2 drew, and `Llost`, a verdict lost) | fix 13b |
| `scripts/checker-shape-check.mts` | the plot checker's Python fix on the reviewers' break sets, judged by layout against controls that run no Postr code; since fix 13b it reads every module of the checker and runs with `--no-same-process` (several scripts in one Python are out of the owner's design of 2026-10-07); its known list (`lib/checker-shape/known.mts`) is fix 13b's; since review round 1 text is judged against the image each save writes (a tight crop, an explicit box, or the figure), and `cut_in2` counts every text, legends and figure texts too | fix 13 |
| `scripts/language-detect-check.mjs` | the plot checker on code it must tell R from Python, and on plotting systems it does not read: the page and the editor on 350 scripts (`fixtures/language-corpus/` labels 104 everyday snippets by language and system), what Check answers beside the button, its live region, an answer said again or kept with no press, a result kept out of date, and one hidden by a new print size; `--corpus everyday` for a shorter run | fix 15 (written by its reproducer) |
| `scripts/undo-history-check.mjs` | undo and redo from every entry point: text blocks, the title, cells, the Content box, sidebar fields, sliders, the code box and other fields that keep their own undo, dialogs, the preview, the buttons, a version restore, the browser's own history inputs (probed, and its Edit-menu stand-in in a sidebar field), steps per word and the caret after an undo, a word typed in front of one that starts with the same letter, a one-character paste, a colour drag, the buttons pressed from the keyboard and the keys pressed on them after (arrows, Backspace, Delete, ⌘D, the table's own Delete), and text typed through an input method, a dead key or a phone keyboard (Chromium's own IME pipeline through CDP); since the merge with main also every drag as one step (a crop edge, a table column's width, the two Edit-block sliders, a long crop gesture against the history's depth) and where the Undo / Redo buttons sit (against the workspace and a corner block's controls on the shapes that met them, the top bar at 1280, 900 and 375 px with the phone notice); scenarios in `lib/undoScenariosCore.mjs`, `lib/undoScenariosEntries.mjs`, `lib/undoScenariosSignals.mjs`, `lib/undoScenariosCompose.mjs`, `lib/undoScenariosButtonKeys.mjs`, `lib/undoScenariosDrags.mjs` and `lib/undoScenariosPlacement.mjs`, helpers in `lib/undoKit.mjs` (`tabToward` reaches a button by Tab or Shift+Tab) | fix 12 (written by its reproducer; its confirmer's entry points, its reviews' probes and the merge review's folded in) |
| `scripts/analytics-privacy-check.mjs` | Vercel Web Analytics under Global Privacy Control (Firefox's own GPC setting, against Firefox without it and Chromium), the page address the app hands the analytics script for `/p/<id>?query` and `/P/<id>?query`, the Referer a same-origin beacon carries under the Referrer-Policy `vercel.json` sets, and where `/auth` shows the Terms line (T1: both modes, Chromium, Firefox and WebKit, three window sizes); `--live <origin>` reads the deployed site read-only (public pages only, nothing but GET leaves the browser): analytics under GPC (L1) and the page view's Referer (L2), for the check after a deploy | record 24 (T1 and `--live` from its review round 2's probes) |
| `src/__tests__/copyInventory.test.ts` (vitest) with `src/test/copyScan.ts` | every string a visitor or a crawler can be shown (the web app's and the API's source strings read from their syntax trees, `seo/routes.json`, `index.html`, `public/` text files; legal pages left out) against copy rules: no LaTeX while `LATEX_EXPORT_ENABLED` is off, a tax note within 40 characters after every price and never between a price and its billing period (`TAX_BEFORE_PERIOD`), no "registered in Quebec"; add a rule as a new `describe` | fix 25 |
| `scripts/copy-claims-check.mjs` | the same rules on what a visitor reads in Chromium (`innerText`): the Export tab for a guest, a free account and a term holder at three poster sizes, and nine public pages and their nine French twins (claims X1–X3, P1–P4; the `/auth?plan=` label's text and line count at 375 and 1440 px recorded); since fix 26 also L1 (`<html lang>`), L2 (the language link, seen at 1440 px and in the open phone menu at 375 px), L3 (a French page's line also on its English twin), W1 (sideways scroll at 375 and 320 px) and W2 (the English landing's two buttons leave the one row they share on main, at 375 or 320 px; review round 1 of fix 26); `POSTR_MUTANT` for falsifying; `POSTR_REPO` runs it against another tree (main as the control) | fix 25; French pages fix 26 |
| `src/__tests__/frenchPages.test.tsx` (vitest) with `src/i18n/__tests__/dictionaries.test.ts` | every public page and its French twin entered at their URLs through the app's router: `<html lang>`, title, description, h1 against `routes.json`, hreflang alternates, the language link both ways (query kept), no string of the English page left on the French one (open phone menu included), every link on a French page to a page with a twin going to the twin; the dictionaries' key parity, nothing left in English, French typography (curly apostrophes, no-break spaces) and Quebec terms, and (D6, review round 1) the same numbers and product names in each French string and each French `routes.json` record as in its English twin | fix 26 |
| `scripts/control-size-check.mjs` | a selected block's controls at the zooms a user meets (FIT, the floor, a pinch to 100%, the ceiling, a 67-step sweep) and after a scroll or a narrower window: their size on screen, WCAG 2.5.8 target size, overlaps among one block's own controls, controls off the canvas or under the ZoomBar, the owner's rule for blocks small on screen, where each control sits; `lib/selectionControls.mjs` reads the controls from the app's own markers, `lib/rotateRoom.mjs` holds the scroll and window scenarios, `lib/controlReview.mjs` those from its review round 1 (a turned block's own controls and a click on each of its handles, every control's size in each frame after a zoom change, other blocks under a selection's controls when zoomed far out), `lib/neighbourClicks.mjs` review finding F3's (a click at each other block's centre that must not delete, replace or crop the selected block; every block selected with the pointer at the others' centres; a 3 in image and logo keeping their row at editing zooms; on demand, the overview threshold's measurement) | fix 19 (written by its reproducer; review round 1's probes folded in) |
| `scripts/chart-print-size-check.mjs` with `lib/chartMeasure.mjs` and `lib/chartPasteTables.mjs` | Postr's own inserted charts in the editor and in the "⎙ Save PDF" document laid out in print media (and Preview's print): every chart text's printed pt and role against the canonical minimums (BELOW), clipped captions, sample-data prefixes, axis titles, tick labels and legends (CLIP), titles over labels and tick labels whose glyphs meet (COLLIDE), print against the editor (PRINT), editor chrome in the print document (CHROME), charts drawn twice while the editor opens (REDRAW); the chooser's 21 sample figures, the confirmer's 4 and 19 charts from 8 pasted tables (long and upper-case names, ten long series, millions; the review's partition) at the sizes a user meets, caption positions and long captions, notes, legends off, a real-metrics font, a selected chart, Insert through the Figure tab (K-U) and through Insert › + Chart with a pasted table; INFO: text scaled, charts grown taller than their block, the blocks an inserted chart covers | item 13 part 2's reproducer; the confirmer's partition, the print document and the gates from fix 13c; its review round 1's partition, paste entry, selected print and print media folded in by its corrector |
| `scripts/auto-arrange-check.mjs` | Layout › Auto-Arrange on the five templates, the welcome poster and eleven posters a user has written into (`lib/arrangeScenarios.mjs`; since review round 1 also the authors block along the foot, set and dragged there, a block dragged part-way across its column, six figures on a 48 × 24 sheet and four columns on a 72 × 48 one, the drags by mouse in `lib/arrangeUi.mjs`): font sizes, the reading order, overlaps, heading, figure and table numbers, one Undo, the time to the new layout, a second press and its undo step, the editor's columns against the owner-approved prototype's own `arrange()` given the same block heights (`lib/arrangeLab.mjs` runs it from `docs/fixes/28-auto-arrange-lab.html`) and refined by the record's rule (`lib/arrangeSolve.mjs`, the harness's own solver, from review round 1's probe), Issues' area past the bottom margin, the preview's figure and table numbers, the app's measured heights against the heights drawn after, the number of columns, and the 0.6 in spacing under the header and between blocks (G1–G13; what it reads, from the record's rule tables, in `lib/arrangeRead.mjs`); reads body blocks off the ½ in grid and where a block dragged down after Auto-Arrange lands; `--fine` also reads the least F on the whole 0.05 in grid (2 or 3 columns, every width measured); `--only`, `POSTR_BROWSER`, `POSTR_MUTANT`, `POSTR_REPO` (run from that tree's `apps/web`) | record 28 (review round 1's probes folded in) |
| `scripts/geometry-desync.mjs` | stored against rendered block geometry, in real layout, on a page that copies the block renderer (not the app); run from the repo root; exits 0 when the desync reproduces | — |
| `scripts/mobile-audit.mjs` | overflow, tap targets and text sizes of the public pages at phone widths; needs a dev server already on port 5173; no exit code | — |

Parked with fix 04 on the local branch `editor/rulers-match-sheet`:
`ruler-check.mjs` (every ruler mark against the sheet's inches, at rest and
frame by frame), `ruler-sync-check.mjs` and a first `ruler-paint-check.mjs`.
