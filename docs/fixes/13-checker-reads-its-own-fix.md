# Fix 13 — the plot checker cannot read its own Python fix

**Plan item:** 13 · **Branch:** `checker/python-reads-own-fix` · **Status:** part 1 (the fix's shape and the re-check) fixed: seven step 9 rounds and three checked harness builds, step 10 waived under the owner's review rule of 2026-09-30 (section 9); part 2 (the parser) not started

## 1. Symptom

A researcher pastes a matplotlib script into the plot checker (the public
page `/tools/figure-readability`, or the editor's Figure › Check a figure),
types the size the figure will print at and presses Check. Some labels
fail, and the page lists what to raise and offers "Copy corrected code".
They run the corrected script, and matplotlib now draws the labels large
enough. They paste it back and press Check: the table is exactly as red as
before, and copying the fix again stacks a second `rcParams.update` block on
the first. The tool never agrees with its own advice.

The same gap also passes text that is too small. A script that sets a size
per element, for example `'xtick.labelsize': 12` under `'font.size': 22`, is
scored from `font.size`, so the page can say "All elements pass readability
thresholds at this poster size" while the printed tick labels are 10.7 pt
against a 14 pt minimum.

On `7f93b5b` (main), `node scripts/checker-truth-check.mjs`, matplotlib 3.10.8 (MEASURED):
- `ctl-default` (no size set: matplotlib's defaults) at 6 × 4.5 in. The first
  check gives ✗ on all five rows. The corrected code, run in matplotlib,
  draws the plot title and axis titles at 20 pt and the ticks and legend at
  15 pt, which is 18.75 and 14.06 pt at print, so every element passes.
  Pasted back, the re-check shows the first table unchanged: 12, 10, 8.3 and
  10 pt, all ✗.
- `w2-rc-ticks` at 8 × 6 in. Tick labels are reported at 16.2 pt ✓, but the real
  size is 10.67 pt ✗. The page shows the all-pass banner and offers no fix.

The ranking-evidence prototype's figures reproduce in direction on this
committed corpus, and its named examples reproduce to the digit (section 4).

## 2. Hypotheses

W1 and W2 are the plan's names (PLAN.md item 13): W1, the checker's re-check
of its own corrected code agrees with the real render; W2, a per-element
size the script sets is read.

| id | claim | prediction that would confirm it |
|---|---|---|
| H1 (W1) | `parsePythonCode` reads a size only from `font.size`, in two patterns anchored on `plt.` / `matplotlib.` (`readability.ts:863-864`), and from four per-Axes keyword calls with numeric literals. The targeted fix is written as per-element rcParams keys (`axes.titlesize`, `axes.labelsize`, `x/ytick.labelsize`, `legend.fontsize`; `buildFontSnippet`, `readability.ts:1214-1221`), which the parser never reads. So the re-check scores the corrected code exactly as it scored the original. | The re-check's table is identical to the first check in every run. With a counterfactual parser that reads numeric per-element keys, the re-check follows the real render for every raised element that nothing else overrides. |
| H2 (W2) | The same gap, for the user's own per-element keys: an element set by a per-element key is scored at the size it would inherit from `font.size`. | The source size differs for every element set by a per-element key. A false PASS appears exactly where the key is smaller than the inherited size and the inherited size would pass. The counterfactual removes the differences for numeric keys. Named sizes (`'x-small'`) stay unread unless names are resolved. |
| H3 (siblings) | The parser matches literal text: the `plt.`/`matplotlib.` prefix for rcParams, four method names for keywords, and numeric literals only. So the `mpl.rcParams` / bare `rcParams` alias (SA), `plt.rc()` (SR), every other keyword setter (SK), and sizes or a canvas passed as variables (G, Postr's own generated code) are all invisible. | The source size differs for all of those elements. The H1 counterfactual leaves them unchanged, so they are separate causes. |
| H4 (T) | Tick labels are modelled at 0.83 × `font.size` (`readability.ts:167`). matplotlib's default `xtick.labelsize` is `'medium'`, which is 1.0 ×. | Every inherited tick label is under-reported by 17 %. Held-back 5b20625 (1.0 ×) removes this. On its own, 1.0 × also adds false PASSes on scripts with per-element tick keys, which is the prediction in revert d7d45bb: at 6 × 4.5 in, `w2-rc-ticks` ticks go from 18.3 → 12.2 pt ⚠ to 22.0 → 14.7 pt ✓ against a real 12 → 8.0 pt ✗. |
| H5 (F) | The fix can only write rcParams. matplotlib lets an explicit `fontsize=` / `labelsize=` in the plotting call win over rcParams. So the fix cannot raise an element the script sizes through a keyword, even one the checker reads and marks "(you set this)". | In real matplotlib, the corrected code leaves a listed element below its minimum in every run whose list includes a keyword-set element, and in no other run. Under H1's counterfactual, those runs become a re-check ✓ over a real ✗. |
| H-alt1 | The page shows a stale table on the second Check (the result is pinned), so the parser is not the cause. | The counterfactual parser changes nothing on the re-check. |
| H-alt2 | The corrected code does not raise anything in real matplotlib: the block lands after the figure is created, or the script's own `font.size` line overrides it. | The real sizes after the fix equal the original sizes. |
| H-alt3 | The scale (the canvas) is misread, not the sizes. | The checker's scale differs from the real scale. |
| H-alt4 | The instrument misreads: it attributes text to the wrong class, measures clipped text, or counts the suptitle as a caption. | The truth runner's own controls fail. |

## 3. Method

**Graph.** code-review-graph had no graph for this tree: `list_graph_stats_tool`
showed 0 files and 0 nodes. I built one with `build_or_update_graph_tool`
(full rebuild, postprocess minimal) at `7f93b5b`: 666 files, 8105 nodes,
79179 edges, and the head matches the build. The queries used:
- `importers_of readability.ts`: `ReadabilityPanel.tsx`, `readabilityFullFix.ts` and two test files.
- `importers_of ReadabilityPanel.tsx`: `pages/FigureReadability.tsx` and `poster/sidebar/FigureTab.tsx`, the two entry points.
- `callers_of parsePythonCode`: `runCheck` (`ReadabilityPanel.tsx:278`) plus 40 test call sites.
- `callers_of computeReadability`: `runCheck` (`:279`) plus 44 test call sites.
- `callers_of applyFontFixes`: `generateTargetedFullFix` (`readabilityFullFix.ts:221`) plus 13 test call sites.

A grep for `rcParams` / `font.size` in `apps` and `packages`, outside the
readability files, finds only the panel's copy at `ReadabilityPanel.tsx:678`.
The graph does not link `charts/codegen/toPython.ts` to the checker, because
the connection is a user copying one tool's output into the other. I found it
by reading the Figure tab's Make mode (INSPECTED), and it is measured as claim
G.

| surface | file:line | touched | check |
|---|---|---|---|
| Python rcParams reads: `font.size` only, anchored on `plt.` / `matplotlib.` | readability.ts:859-877 | yes (H1, H2, SA) | checker-truth-check W1, W1p, W2, SA |
| per-element keyword reads: `set_xlabel/set_ylabel/set_title(fontsize=)`, `tick_params(labelsize=)`, numeric literals only | readability.ts:901-984 | likely (SK, G) | SK, G, C |
| canvas read: `figsize=(w, h)` numeric literals only | readability.ts:986-1004 | if G is taken on | G-scale, C (scale) |
| Python element model: ticks and caption at 0.83 × `font.size` | readability.ts:159-174 | yes (re-lands 5b20625, H4) | T; 5b20625's unit tests |
| per-element advice (`wasOverridden`, `bareSelectorReaches`) | readability.ts:1136-1160 | likely (H5) | F |
| the fix block: per-element rcParams only | readability.ts:1191-1222 (Python 1214-1221) | likely (H5) | F, W1, R2 |
| `applyFontFixes`, Python branch: a new block above the figure on every copy | readability.ts:1286-1308 | likely (R2) | R2 (INFO) |
| rows for every element spec, drawn or not; Caption has no selector | readability.ts:173, 1058-1084 | owner decision (P) | P (INFO), W1p |
| the base_size path (`generateFullFix` / `fixPython`): `PY_FONT_SIZE_KEY` matches any `rcParams[...]`, including the alias the parser misses | readabilityFullFix.ts:28, 162-198 | not decided | none: the harness copies only "Copy corrected code" (INSPECTED) |
| `ensurePySave` tests `/savefig/` on raw code, comments included | readabilityFullFix.ts:202-205 | no (sibling) | seen in the corrected generated script, 4 of 4 |
| `generateTargetedFullFix` | readabilityFullFix.ts:216-225 | maybe | W1 |
| the panel: `runCheck`, the fix list, "Copy corrected code", the rcParams sentence, the all-pass banner | ReadabilityPanel.tsx:260-295, 620-680, 714-722 | `runCheck` no; the sentence at :676-678 maybe | every claim (the harness reads these) |
| entry: the public page | pages/FigureReadability.tsx:80-85 | no | page runs |
| entry: the editor's Figure › Check a figure | poster/sidebar/FigureTab.tsx:165-170 | no | editor runs (W1e; editor equals the page at 10 × 7 in) |
| Postr's own Python from Make a figure: sizes and canvas passed as variables into keyword arguments | charts/codegen/toPython.ts:120-138 | owner decision (G) | G, G-scale, F |
| unit tests | __tests__/readability.test.ts:325-467 (parsePythonCode), 899-953 and 1088-1119 (applyFontFixes); __tests__/readabilityFullFix.test.ts | yes | vitest |
| index docs | docs/feature-graph.md §6.8 (:1593-1621) and §6.10 (:2644-2656, "copy the base_size fix"); docs/stress-test/FIGURE-READABILITY.md (:215, :247) | step 12 | — |

### Instruments (committed with this record)

**`apps/web/scripts/checker-truth-check.mjs`** is a browser harness built on
`lib/editorHarness.mjs`. It starts the app's own Vite server and fakes the
backend at the network layer. It enters where the user enters.

On `/tools/figure-readability`, for each corpus script at 6 × 4.5, 8 × 6,
10 × 7 and 14 × 10 in, it:
1. types the size into the Width and Height fields and presses Enter;
2. pastes the script and presses ▶ Check;
3. reads the freshly mounted table: source, print, min and verdict per row,
   the scale line, the "Raise these text elements" list and the all-pass
   banner;
4. presses "Copy corrected code" and reads the clipboard;
5. pastes that code back, presses Check, and copies again.

It then runs six of the scripts in the editor's Figure › Check a figure.
The harness does not set the editor's block, so there it compares source
sizes only (claim W1e and the control's source check), and it checks that
the editor's tables equal the page's at 10 × 7 in. Every original and every corrected script is run in real matplotlib by the
truth runner. Real print pt = real size × min(print W / real canvas W,
print H / real canvas H). Verdicts use the page's own Min column.

Claims (observed = defect present):
- W1, W1p, W1e and F concern the corrected code.
- W2, SA, SR, SK, G, G-scale and T concern the first check.
- P and R2 are INFO and do not count in the exit code.

Which claim owns each element is set per script in
`fixtures/checker-corpus/manifest.json`, never inferred from the checker.
Exit codes: 0 no claim observed, 1 a claim observed with every control
holding, 2 a control failed or the instrument errored. A whole run takes
about 40 s. Run it with `node scripts/checker-truth-check.mjs`, from `apps/web`.

**`apps/web/scripts/truth/mpl_truth.py`** runs a script with the Agg backend.
Savefig and show are wrapped. It draws the figure and reads back each visible
Text artist's size, keeping the smallest per class. It shares no rule with
the checker. With `--selftest` it runs its own controls.

**`apps/web/scripts/fixtures/checker-corpus/`** holds 15 scripts with made-up
data and generic labels, plus `manifest.json`. A 16th script,
`g-codegen-grouped`, is generated at run time through the app's own
`charts/codegen/toPython.ts`, so it always matches the shipped generator.

**Controls.** Each must hold, or the run exits 2:
- **K-truth**, 6 checks.
  - Two scripts set every class with an explicit `fontsize=`, one saving
    through `Figure.savefig` and one through `pyplot.savefig` +
    `plt.figtext`. They must read back exactly those sizes and that canvas.
  - Four ink checks. Each measured text is painted pure red, and its ink
    height at 600 dpi is compared with a 10 pt reference. The ink ratio must
    match the reported-size ratio within 3 %. The checks cover sizes that
    come from rcParams names (`'x-small'`, `'large'`, `'small'`) and a
    numeric legend size.
- **C.** Elements whose size comes from what the checker is meant to read.
  The checker's source size must equal the drawn size within 0.05 pt, and its
  verdict must equal the real verdict. The checker's scale must equal the real
  scale within 0.005 on every page run whose canvas is a literal. The expected
  values come from the real render, not from the checker's code.
- **K-page.** Every check renders a fresh table and "Detected: Python /
  matplotlib". The copied code equals the code shown. Every original script
  runs.

**Falsification of the instrument** (MEASURED):
- **K-truth.** Two mutants of the runner each turn "known sizes via
  Figure.savefig" red: one takes the largest size instead of the smallest, the
  other counts the suptitle as a caption. The suptitle mutant first passed:
  the suptitle was larger than the caption, so the minimum hid it. The
  known-size script now sets the suptitle smaller. The ink check caught the
  runner's own first version, where the axis label was clipped at the canvas
  edge (54 px of ink against the 146 px expected; with room made below the
  axes it reads 146 px. That the label was clipped is INSPECTED).
- **C.** Probe `control-breaker` (axis titles modelled at 1.1 ×) gives 26
  control failures and exit 2.
- **W1 / W2.** Probe `reads-rc-keys` takes W1 from 39 of 42 to 10 of 44, and W2
  from 48 of 48 to 8 of 48. So the instrument reports agreement where the
  cause is removed.
- **T.** Probe `ticks-1.0x` takes it from 8 of 8 to 0 of 8.
- **Not falsified by a probe:** SA, SR, SK, G, F and W1p. They share W2's
  and W1's comparison code, but no probe turns them green.

**Probes.** These are counterfactuals, not a fix. They are served through
`POSTR_MUTANT` from `scratchpad/fix13-probes/probes.mutants.json` and are
never committed:
- `ticks-1.0x` is 5b20625's two multipliers;
- `reads-rc-keys` makes the parser read numeric per-element keys in the item
  and dict forms (x and y ticks separately, the smaller wins);
- the combination of both;
- `control-breaker`.

**Not covered:**
- seaborn and style sheets (item 14), R (item 16) and language detection (item 15);
- figures with several Axes (every corpus script has one; the truth takes the smallest per class across Axes);
- log axes and minor tick labels;
- `bbox_inches='tight'` cropping (the truth scales from the canvas, as the checker does);
- fonts other than DejaVu Sans, and browsers other than Chromium;
- the editor's overlay at sizes other than its default;
- the "Copy snippet" base_size path and the image-scan path;
- how often researchers write each idiom (UNVERIFIED: the corpus is designed, not sampled).

**`apps/web/scripts/checker-shape-check.mts`** (added in step 9, rounds 3 and 4) is the gate's companion for the fix's shape. It holds the step 9 reviewers' break sets under `fixtures/checker-shapes/`, each script written to catch one way that inserting code into someone else's script goes wrong:

- `round1`: 43 scripts;
- `round2`: 23;
- `round3`: 32;
- `round4`: 48. The round-4 reviewer's 47 (45 scripts and 2 more that print through the canvas), less three that need ffmpeg, IPython, or spawned worker processes the runner cannot serve, plus four of the lead's with sizes the script sets itself.

**The shape check.** For each script, at 6 × 4.5 and 4 × 3 in, it runs the panel's own functions (the check, then the copy button's code). It measures the original and the corrected script at every save in real matplotlib (`truth/shape_truth.py`). It then checks the corrected code again, and fixes it a second time at 4 × 3 in. A defect is any of:

- no fix offered while a row fails;
- a crash;
- a listed class short of its size;
- a text lowered;
- a false green on the re-check;
- a second fix that crashes or is short;
- the fix's own warning that it could not raise the text.

**The same-process check.** Two fixed scripts are run in one Python (`truth/same_process_truth.py`); the second must be saved at its own sizes.

**The layout grid** (`--layout`, `truth/layout_truth.py`) runs round 3's layout scripts and all of round 4. It measures text outside the figure, text over another panel, text under a figure legend or suptitle, and Axes drawn over each other. Each is judged against both the original script and a raise-first control: the original with the same sizes set as rcParams before anything is drawn. Text that has to grow can need room the script's own layout never gave it, and the control measures that cost. An Axes moved further than in the control counts as a defect too (a panel the script placed itself).

**Known failures and mutants.** Known failures are listed in the script with the kind of defect each is known for; any other defect still counts, and a known failure that starts to pass fails the run. `POSTR_MUTANT=<spec>#<name>` serves a mutant of the checker's two modules. That falsifies the parts of the fix that are Python, which the unit tests never run.

## 4. Results before the fix

`node scripts/checker-truth-check.mjs`, run from `apps/web` on `7f93b5b`
(main) in Chromium with matplotlib 3.10.8, covered 70 runs: 16 scripts × 4
sizes on the page, plus 6 in the editor. It had 0 instrument errors, and its
exit code was 1. A second full run into a fresh folder gave an identical
`results.json` (MEASURED).

**Controls:**
- K-truth: 6 of 6. The ink ratios read 1.3934 against 1.388, 2.3934 against
  2.4, 1.6721 against 1.666, and 0.7541 against 0.75.
- C: 88 control element-runs and 60 scales, 0 failures.
- K-page: 70 of 70.

| claim | result on main | worst |
|---|---|---|
| W1: the re-check disagrees with the real render of the corrected code | 39 of 42 runs with a fix. Elements: 120 of 158, and 118 of the 138 the fix raised. The re-check is identical to the first check in 42 of 42 runs and all ✓ in 0 of 42, while the real render is all-pass in 31 of 42. | `ctl-default` @ 6 × 4.5: re-check 12 / 10 / 8.3 / 10 pt ✗, real 20 / 20 / 15 / 15 pt (18.75 / 18.75 / 14.06 / 14.06 at print) ✓ |
| W1p (the user's view): the corrected code passes in matplotlib, yet the page does not say "All elements pass" | 31 of 31 runs | `ctl-default` @ 6 × 4.5 (above) |
| W1e (the editor entry): the re-check source differs from the real source of a raised element | 4 of 4 editor runs with a fix. The editor's first check, corrected code and re-check equal the page's at 10 × 7 in for 6 of 6 scripts (INFO). | `s-alias-mpl`: re-check 12 / 10 / 8.3 / 10 pt, real 16 / 16 / 12 / 12 pt |
| W2: a per-element rcParams key is not read | 48 of 48 element-runs differ in source. 33 wrong verdicts, of which 14 are false PASSes (in 8 of 20 runs) and 14 are false FAIL/WARN. | `w2-rc-yonly` @ 10 × 7: ticks 16.6 → 19.4 pt ✓, real 9 → 10.5 pt ✗. `w2-rc-all` @ 8 × 6: 4 elements ✓, real 10.29–13.71 pt ✗. `w2-rc-ticks` @ 8 × 6: 16.2 pt ✓, real 10.67 pt ✗ |
| SA: the `mpl.rcParams` / `from matplotlib import rcParams` alias | 24 of 24 element-runs differ. 18 wrong verdicts: 16 false FAIL/WARN, 0 false PASS. | `s-alias-mpl` @ 10 × 7: title 12 → 14 pt ✗, real 24 → 28 pt ✓ |
| SR: `plt.rc(...)` | 24 of 24 element-runs differ. 19 wrong verdicts: 15 false FAIL/WARN, 0 false PASS. | `s-rc-elements` @ 8 × 6: axis titles 10 pt ✗, real 20 pt ✓ |
| SK: other `fontsize=` keywords | 24 of 24 element-runs differ. 11 wrong verdicts, all 5 false PASSes among them. | `s-kw-ticklabels` @ 10 × 7: ticks 16.6 → 19.4 pt ✓, real 8 → 9.33 pt ✗. `s-kw-axlegend` and `s-kw-pyplot` @ 10 × 7: legend 16.7 pt ✓, real 11.67 pt ✗ |
| G: Postr's own Make-a-figure Python (sizes as variables) | 12 of 12 element-runs differ. 7 wrong verdicts, 0 false PASS. G-scale: its canvas (`figsize=(fig_w, fig_h)`) is not read, so the scale is wrong in 3 of 4 runs. | @ 14 × 10: the checker scores scale 1 against a real 1.75, title 12 pt ✗, real 16 → 28 pt ✓ |
| T: inherited ticks at 0.83 × | 8 of 8 element-runs differ. 4 wrong verdicts: 2 false FAIL/WARN, 0 false PASS. | `ctl-fontsize` @ 10 × 7: 10 → 11.6 pt ✗, real 12 → 14 pt ✓ |
| F: the corrected code leaves a listed element below its minimum | 10 of 42 runs with a fix | `s-kw-pyplot` @ 6 × 4.5: all four listed elements unchanged in matplotlib (title 11, axis titles 9, ticks 7, legend 7 pt). `ctl-explicit` @ 6 × 4.5: the axis titles, set with `fontsize=16` and marked "(you set this)", stay 16 pt → 13.71 pt ✗ |
| P (INFO): ⚠/✗ on an element the figure does not draw | 33 of 64 runs (Caption 32 rows, plot title 3, legend 3) | `ctl-default` @ 6 × 4.5: Caption 7.8 pt ✗ on a figure with no caption |
| R2 (INFO): a second copy stacks a second block | 42 of 42 | — |
| all-pass banner over a real failure (across claims) | shown on 21 runs; the real figure draws a failing element on 11 of them | `s-kw-ticklabels` @ 10 × 7: ticks shown 19.4 pt, real 9.33 pt ✗ |

Across all first checks, 106 of 232 drawn-element verdicts are wrong: 19
false PASSes in 13 of 64 runs, and 62 false FAIL/WARN.

**Probes.** These are counterfactuals, with the same corpus and harness
(MEASURED):

| probe | W1 | W1p | re-check ✓ over real ✗ (elements) | W2 (false PASS) | SK false PASS | T | F |
|---|---|---|---|---|---|---|---|
| main | 39 / 42 | 31 / 31 | 2 | 48 / 48 (14) | 5 | 8 / 8 | 10 / 42 |
| `ticks-1.0x` (5b20625) | 39 / 42 | 29 / 29 | 7 | 48 / 48 (17) | 7 | 0 / 8 | 9 / 42 |
| `reads-rc-keys` | 10 / 44 | 20 / 33 | 24 | 8 / 48 (2) | 5 | 8 / 8 | 10 / 44 |
| both | 10 / 44 | 16 / 33 | 25 | 8 / 48 (3) | 7 | 0 / 8 | 9 / 44 |
| `control-breaker` | control fails: 26 failures, exit 2 | | | | | | |

**The hypotheses, as measured:**
- **H1: CONFIRMED.**
  - The re-check is identical to the first check in 42 of 42 runs.
  - With the counterfactual parser it is identical in 0 of 44, W1 falls from
    39 of 42 to 10 of 44, and the elements the fix raised disagree in 22 of
    136 instead of 118 of 138.
  - The 10 runs that remain all involve a size set by a keyword or a named
    size (below). No other run remains.
- **H2: CONFIRMED for numeric keys.**
  - W2 falls from 48 of 48 to 8 of 48 under the probe.
  - All 8 that remain are `w2-rc-named` (`'x-small'`, `'small'`): named sizes
    are a second cause the probe does not read.
- **H3: CONFIRMED, and independent of H1.** SA 24 of 24, SR 24 of 24, SK 24 of
  24 and G 12 of 12 under every probe.
- **H4: CONFIRMED.**
  - T falls from 8 of 8 to 0 of 8 with 1.0 ×.
  - The held-back revert d7d45bb's prediction reproduces to the digit:
    `w2-rc-ticks` @ 6 × 4.5 goes from main's 18.3 → 12.2 pt ⚠ to 22.0 → 14.7
    pt ✓ with 1.0 ×, against a real 12 → 8.0 pt ✗.
  - On its own, 1.0 × raises the W2 false PASSes from 14 to 17 and SK's from 5
    to 7. So 0.83 was masking part of W2, as d7d45bb said.
- **H5: CONFIRMED.**
  - F is observed in 10 of the 11 runs whose fix list names an element the
    script sizes through a keyword (a literal, or a variable in the generated
    script), and in 0 of the other 31.
  - The eleventh is `g-codegen-grouped` @ 14 × 10: its real scale of 1.75 lifts
    the elements the fix could not raise.
  - Under the H1 counterfactual those runs turn from an honest red into a
    **false green**: 10 of 44 runs and 24 elements show re-check ✓ over real
    ✗/⚠, against 2 elements on main.
- **H-alt1: REFUTED.** Through the same page flow, with the counterfactual
  parser the re-check differs from the first check in 44 of 44 runs (0 of 44
  identical, against 42 of 42 on main).
- **H-alt2: REFUTED for where the block is placed, on this corpus** (confirmer B found a placement failure outside it; section 5). The corrected code passes
  in real matplotlib in 31 of 42 runs. Of the 11 that do not:
  - 10 are F;
  - 1 is `w2-rc-named` @ 6 × 4.5, whose legend the checker thought passed and
    so never raised.
- **H-alt3: REFUTED for literal canvases** (both confirmers found the scale wrong for canvases set any other way; section 5). 60 of 60 literal-canvas scales match. The generated
  script's canvas is set through variables, which is claim G-scale, not a
  scale rule.
- **H-alt4: REFUTED.** K-truth 6 of 6, with both runner mutants red.

**The prototype, re-measured** (it was UNVERIFIED before this record):

| prototype's figure | here | verdict |
|---|---|---|
| re-check identical in 48 of 48 runs, all ✓ in 0 of 48, real all-pass in 41 of 48 | 42 of 42, 0 of 42, 31 of 42 | reproduced; a different corpus, the same direction |
| `py-rc-ticks` @ 8 × 6: ticks 16.2 pt ✓, real 10.7 pt ✗ | `w2-rc-ticks` @ 8 × 6: 16.2 pt ✓, real 10.67 pt ✗ | same script, same numbers |
| `py-rc-all-elements` @ 8 × 6: 4 elements ✓, real 10.3–13.7 pt ✗ | `w2-rc-all` @ 8 × 6: 4 ✓, real 10.29–13.71 pt ✗ | same numbers |
| `py-oo-legend` and `py-pyplot-kwargs` @ 10 × 7: legend 16.7 pt ✓, real 11.7 pt ✗ | `s-kw-axlegend` and `s-kw-pyplot` @ 10 × 7: 16.7 pt ✓, real 11.67 pt ✗ | same numbers |
| explicit keywords override the fix: 5 of 5 corrected runs of those two scripts still fail | 5 of 5 (3 + 2) | same |
| the tick verdict is wrong in 4 of 8 runs of the two scripts that set only `font.size` | T: 4 wrong verdicts in 8 | same |
| a second fix leaves 2 blocks in 48 of 48 | R2: 42 of 42 | same |
| `mpl.rcParams` and `plt.rc('font', size=)` are not read: 8 of 8 runs wrong | SA and SR: 24 of 24 element-runs each differ in source, 18 and 19 wrong verdicts | the same cause; counted per element here |
| (d7d45bb) "a prototype of that model took the per-element matrix from 40/48 wrong to 0/48" | not re-measured: I do not have that prototype. This record's numeric-key probe takes W2 from 48 of 48 to 8 of 48 (the named sizes). | UNVERIFIED |

**Found here, not in the prototype** (MEASURED unless marked):
1. **The fix cannot beat keywords** (H5): 10 of 11 runs. It fails even for
   keywords the checker reads and marks "(you set this)": 7 of the 7 such
   elements stay below their minimum after the fix (`ctl-explicit` @ 6 × 4.5,
   and `s-kw-axlegend` @ 6 × 4.5 and 8 × 6).
2. **Fixing H1 alone turns red into a false green** on the same scripts: 24
   elements in 10 runs under the probe. The parser fix and the fix's shape are
   one design question.
3. **The phantom Caption row keeps the page from turning green after H1 is
   fixed.**
   - Under both probes together, 16 of the 33 runs whose corrected code passes
     in matplotlib still do not say "All elements pass".
   - In every one of the 16, the only ⚠/✗ rows are for elements the figure does
     not draw: the Caption row, 16 of 16. Caption has no selector, so no fix can
     raise it.
   - W1p therefore has two causes: H1, and P.
4. **Postr cannot read its own Make-a-figure Python.**
   - G is 12 of 12 and G-scale 3 of 4. The generated script's keyword sizes
     also defeat the fix: F in 3 of 4 of its runs.
   - Its corrected code gets no save call, because `ensurePySave` sees the
     generator's commented-out `# fig.savefig(...)`. None of the 4 corrected
     generated scripts has a live `savefig`, measured by reading the copied
     code. Whether that loses anything for the user is INSPECTED only: the
     script still calls `plt.show()`.
5. **The editor entry behaves exactly like the page at 10 × 7 in.** Its first
   check, copied code and re-check are identical for 6 of 6 scripts, and W1e is
   4 of 4. The item is therefore not page-only. The ranking evidence had
   this as INSPECTED only.

**What these causes do not explain:**
- P, the rows for undrawn elements. This is a display rule, not a parser gap:
  `computeReadability` lists every element spec whether or not the figure
  draws it, for R as for Python (INSPECTED for R, which this harness does
  not run).
- Named-size resolution, which is H2's second cause.
- seaborn contexts and style sheets (item 14).
- The base_size "Copy snippet" path, which is not measured.
- Any figure with several Axes, which the corpus does not cover.

## 5. Independent confirmation (before any change)

On a frozen copy of main (`7f93b5b`), each confirmer with its own truth
runner and its own corpus, neither reading sections 3–4 or this record's
instrument before it had its own numbers. Real matplotlib 3.10.8 and seaborn
0.13.2 in both.

- Confirmer A: scope W1, W2, H4 and H5 with a counterfactual, entering at the
  public page. 13 scripts × 4 sizes (6 × 4.5, 10 × 7, 11 × 8, 24 × 18 in), 4
  parser modes, 208 page runs; each run types the size, pastes, checks,
  copies the corrected code, pastes it back and checks again.
- Confirmer B: scope the editor entry (the Figure tab's default 10 × 7 in
  overlay and a selected 6 × 4.5 in image block), the sibling forms, H-alt1
  and H-alt3, and the "Copy snippet" path. 31 editor runs.

**The defect exists: CONFIRMED by both.**
- **W1 / H1: CONFIRMED.** The re-check is identical to the first check in 29
  of 29 runs with a fix (A, page) and 17 of 17 (B, editor). Against the real
  render of the corrected code it agrees in 24 of 101 element-rows (A: 72 false
  FAIL, 4 false PASS) and 17 of 65 (B: 48 false FAIL, 0 false PASS). With a
  parser that reads numeric per-element keys, identical re-checks fall to 2 of
  30 (A; both are a keyword-sized script, where identical is right) and B's
  re-check matches the real verdict in 54 of 65 elements (MEASURED).
- **W2 / H2: CONFIRMED.** Numeric per-element keys: the source differs from the
  real size in 48 of 48 element-rows, with 10 false PASS and 10 false FAIL; 0 of
  48 under the counterfactual. Named sizes stay unread in both modes, 8 of 8
  rows (A, MEASURED).
- **H3 (siblings): CONFIRMED.** B, first checks of 25 sibling runs, 97
  elements: 34 false PASS in 14 runs and 35 false FAIL (the `mpl.rcParams`
  alias 12 / 7, `plt.rc` 5 / 3, keywords 5 / 0, variables 9 / 11, named sizes 3 /
  0, seaborn 0 / 4, Postr's generated code 0 / 10). All 14 false-PASS runs showed
  "All elements pass"; in 13 of them the page also warned "No font size found —
  assuming 10pt" for a script that sets one. The counterfactual changes 0 of 25,
  so they are separate causes (MEASURED).
- **H4: CONFIRMED.** Inherited tick labels read at 0.8273–0.8333 × the real
  size, 20 of 20 rows (A). The revert's prediction reproduces for
  `w2-rc-ticks`-like s03 @ 6 × 4.5: main 18.3 → 12.2 pt ⚠, 1.0 × 22 → 14.7 pt ✓,
  real 12 → 8.0 pt ✗ (MEASURED).
- **H5: CONFIRMED, and PARTLY as worded.** 9 of 9 keyword-sized elements stay
  below their minimum after the fix (A). "In no other run" does not hold: other
  mechanisms also leave listed elements low (below).
- **H-alt1: REFUTED** by both (the counterfactual changes the re-check in 28 of
  30 runs; B's stale-pin control and 65 of 65 fresh parses equal the page).
- **H-alt2: REFUTED as the cause of W1, but the fix fails in 10 of B's 17 runs**
  through three mechanisms: keywords (6), placement (1: with no
  `plt.subplots`/`plt.figure` line the block lands above `sns.set_theme()`, which
  resets it; this corrects section 4's verdict), and lowered text (3).
- **H-alt3: REFUTED as the cause of W1, CONFIRMED as a separate cause.** With a
  literal `figsize` the scale matches, 22 of 22 (B) and 48 of 52 (A). With a
  canvas set by variables, `set_size_inches`, a seaborn figure-level call or no
  `figsize` at all, the checker assumes the print size, scale 1.00, in 9 of 9
  runs (B) and in all 4 runs of A's seaborn `catplot` script, against real
  scales from 0.5 to 3.45 (MEASURED).
- **H-alt4: REFUTED** by both: their own truth controls passed (A 19 of 19 known
  sizes; B 7 of 7 routes).

**New defects from the confirmation** (MEASURED unless marked):
- **The corrected code lowers the user's text.** Where a size comes from an
  unread alias or `plt.rc`, the fix writes absolute keys from the assumed 10 pt
  over the user's larger size: 3 of 17 of B's runs (title 24 → 13, axis titles
  20 → 13, ticks 20 → 10).
- **The corrected code can crash.** A seaborn-only script (no `plt` import)
  raises `NameError: name 'plt' is not defined` at 4 of 4 sizes; with the import
  added, a later `sns.set_theme()` resets the keys anyway (A).
- **`ax.legend(fontsize=)` is unread**: 3 false PASS that survive every
  counterfactual (A).
- **The seaborn 'talk' table is wrong**: axis titles 15 pt against a real 18 pt,
  1 false FAIL (A; item 14's area).
- **"Copy snippet" on Postr's own generated Python** gives a false PASS: after
  `font.size = 18` the re-check shows all ✓ while the keyword variables keep the
  render unchanged, 9 elements in 4 of 4 runs (B).
- **"Or change one number" can suggest a smaller size than the script has**
  (10 → 7 and 10 → 8), shrinking text that passes (B).
- **Misleading warnings on Postr's own code**: "No figsize=(w,h) found" beside
  `figsize=(fig_w, fig_h)` (B).

**Critic** — 7 gaps HIGH, 7 MEDIUM, 5 LOW. Its measurements are module-level
(it imported the frozen `readability.ts`, not the page), so they are
UNVERIFIED here until the instrument reproduces them. The HIGH ones:
1. no literal `figsize` gives scale 1, and a fixed parser would turn that into
   a false green (its n01: 8 elements re-check ✓ over real ✗ under the
   counterfactual, 0 on main);
2. five more unread keyword idioms (`size=`, `fontdict`, named keyword sizes,
   `legend(prop=)`, a `set_fontsize` loop): 24 false-green elements under the
   counterfactual against 2 on main, and 8 first-check false PASS on main;
3. the fix lowers text, with no claim to catch it (12 of 43 of its targeted-fix
   runs on main, 35 element classes);
4. rcParams set after the figure is created: a source-order parser adds false
   PASS;
5. the fix block crashes without a `plt` import (8 of 8);
6. the remedy's shape is unmeasured: only the rcParams block was ever probed;
7. the probe `reads-rc-keys` is looser than an anchored parser (it reads a
   dict in a variable), so its gains may overstate what a real fix achieves.

Its commit plan: one resolver that applies matplotlib's own precedence
(keyword over per-element key over `font.size` × named scale, each key read at
its time), many commits, each gated on four numbers no worse than the commit
before it: first-check false PASS, re-check ✓ over real ✗, lowered text, and
corrected code that runs. That one shared cause fits H1, H2, SA, SR, SK, H4,
named sizes, read time and the canvas is the critic's hypothesis, UNVERIFIED.

**Gate before the fix (process step 4).** The HIGH gaps are now claims of the
committed instrument, the MEDIUM ones INFO claims, and every run prints the
four gate numbers (the instrument's second version, below). Gap 6, the fix's
shape, is measured with remedy probes before the fix is designed.

### The instrument's second version, on main

`checker-truth-check.mjs` now runs 41 scripts (25 added: the critic's 14,
renamed, plus a `set_size_inches` canvas, an `rc_context` dict, a seaborn-only
script, `font.size` set after the figure exists, and 7 known-answer controls)
at the same four sizes, plus the 6 editor runs: 170 runs. The truth runner
also measures legend titles and Axes texts, the canvas each `savefig` really
writes (a PNG saved to memory with the call's own keywords, so a
`bbox_inches='tight'` crop is measured, not modelled), and the Jupyter inline
backend (`--inline`). New control K-known: each known-answer script must show
0 of n on its claim, and a manifest that declares the defect-bearing twins as
known answers makes all 10 declarations fail and the run exit 2.

On `7f93b5b` (MEASURED: the agent that built it ran it twice, and I ran it a
third time into a fresh folder; the three `results.json` are byte-identical,
sha256 `aecbe1eca47e50eb…`; exit 1). Controls: K-truth 11 of 11 (with 4 runner
mutants each turning its check red), C 284 element-runs and 144 scales, K-page
170 of 170, K-known 0 of n on all 10 declarations. Scoring only the first 16
scripts reproduces section 4 exactly.

`GATE fp=38 rcfp=10 L=63 run=8` (first-check false PASS elements; re-check ✓
over real ✗ elements; elements the fix lowers; runs whose corrected code
raises).

| claim | on main | worst |
|---|---|---|
| CANVAS (no literal `figsize`) | 16 of 16 runs: the checker's scale is always 1, the real one 0.86–3.33; 39 of 60 verdicts wrong, 32 false FAIL/WARN, 0 false PASS | `cv-rc-figsize` @ 14 × 10: 1 against 3.33 |
| SK2 (`size=`, `fontdict`, named keyword sizes, `legend(prop=)`, a `set_fontsize` loop) | 32 of 32 element-runs; 16 wrong, 10 false PASS | `sk2-legend-prop` @ 10 × 7: legend 18.7 pt ✓, real 8.17 pt ✗ |
| READTIME (sizes set after the figure exists) | 20 of 32; 13 wrong, 5 false PASS (all `font.size` set late), 6 false FAIL/WARN | `rt-fontsize-after-fig` @ 8 × 6: axis titles 20 pt ✓, real 10 pt ✗ |
| L (the fix lowers text) | 63 of 478 element-runs in 28 of 117 runs; none falls below the page's minimum (the harm is the user's own sizes overwritten); 52 from under-read sizes, 11 from the 0.83 tick model | `w2-rc-fixblock` @ 14 × 10: axis titles 26 → 11 pt |
| RUN (the corrected code raises) | 8 of 125 runs, all `NameError: name 'plt' is not defined` (an object-oriented script and a seaborn-only one, 4 each); the same script with the import runs, 0 of 4 | — |
| INFO AXTEXT | 6 of 8: the legend title and Axes texts stay at 10 pt after the fix (`legend.fontsize` does not move a legend title) | `ax-annotations` @ 6 × 4.5: 7.5 pt against a 12 pt minimum |
| INFO TIGHT / TIGHT-fix | 4 of 4 / 5 of 5; 3 of the 5 are show-only scripts cropped by the `bbox_inches="tight"` that `ensurePySave` appends | `tight-legend-outside` @ 8 × 6: 10.37 × 5.7 in saved, scale 0.77 against the checker's 1 |
| INFO SHOWSAVE | show-only scripts: 3 of 3 corrected scripts save a figure with 0 Axes under the inline backend | — |

Across the 164 page runs: 199 of 632 first-check verdicts wrong, 38 false PASS
in 27 runs; the all-pass banner on 34 runs, 19 of them over a real failure.

**The critic's HIGH gaps, checked:** 1 CANVAS reproduced (as false FAIL/WARN;
no false PASS on this corpus, but the probe that defaults the canvas to
6.4 × 4.8 in adds one on Postr's own generated script, whose canvas is set
through variables). 2 SK2 reproduced. 3 L reproduced, to the digit on the
named example, but not as a readability failure. 4 READTIME reproduced in
matplotlib (a late update moves the title and legend, not the axis labels or
ticks). 5 RUN reproduced. 7 partly: the `reads-rc-keys` probe does credit a
dict held in a variable and an `rc_context` dict, but the drawn sizes match,
so crediting them is not shown to be wrong; its measured looseness is
position (6 READTIME false PASS added on `rt-rc-after-fig`).

**Probes** (counterfactuals, MEASURED): `canvas-default-6.4x4.8` takes CANVAS
to 8 of 16; `fix-imports-plt` takes RUN to 0; `fix-max-current` takes L to 0;
each new claim's known-answer script shows it can go green.


### The fix's shape (the critic's gap 6)

Seven shapes of the corrected code were measured as probes on the fix
generator (`buildFontSnippet` / `applyFontFixes`), with main's parser, over
the second version's 170 runs, against the real render (MEASURED, one run per
shape; every control held in all 8 runs; a `control-today` probe that sends
today's shape through the probe plumbing reproduced main byte for byte).

| shape | F: runs (elements) left below the minimum | L | RUN | real all-pass of the corrected code |
|---|---|---|---|---|
| main (per-element rcParams block above the figure) | 44 of 129 (80): keywords 27 runs, read time 4, caption 3, canvas 3, crash 8 | 63 | 8 | 81 of 129 |
| block, safe (imports pyplot, placed after seaborn's theme calls) | 37 (83) | 64 | 0 | 88 |
| block, safe, never lowering (`max(N, the value in force)`) | 37 (83) | 0 | 0 | 88 |
| **at save** (a helper called just before each `savefig`, or `show()` with no save, that raises each drawn text of each listed class to `max(its size, N)`) | **4 (15), all canvas** | **0** | **0** | **117** |
| at save, also legend titles and Axes texts | 4 (15) | 0 | 0 | 117 (AXTEXT 0 of 8) |
| in place (keyword literals rewritten, plus today's block) | 29 (39) | 63 | 8 | 93 |
| in place, plus the safe block | 22 (42) | 0 | 0 | 100 |

"Canvas" is the checker's scale, wrong for a canvas that is not a literal
`figsize`: the fix reaches its target size in the script's own points, but
those points print at another scale. No shape can fix that; CANVAS must be
fixed with, or before, the re-check reading the fix back, or those 15 elements
become a false green.

The gate line reads `rcfp=10` for every shape, the same 10 elements: first-check
false PASSes the fix is never asked to raise. The re-check reads none of the
shapes back (W1p stays N of N), which is W1's parser cause.

Side effects (MEASURED with the truth runner on every original and corrected
script): no shape crashes (except those keeping today's block), none saves a
blank figure under Agg, none raises a table row the page did not list (at save
raises a legend title with its legend, by design); every shape stacks a second
copy harmlessly. Raising text on a fixed canvas pushes more text past its edge
in every shape (runs with more text past the edge than the original: main 30,
the never-lowering block 34, at save 43; the extra 9 are the keyword-sized
scripts only at save raises). One new failure for at save, on a script built to
test it: a one-shot `fig.tight_layout()` before the save leaves 2 texts clipped
at 6 × 4.5 in and 1 at 8 × 6 (0 for the other shapes, 0 with `layout="tight"`,
and 0 when the layout is re-run after the raise).

How hard each shape is for the checker to read back (INSPECTED, with a model
computed from the measured runs, UNVERIFIED as a parser outcome): at save is
one marked, self-contained call whose effect does not depend on the rest of
the script, so the re-check can score each listed class as `max(read, N)`
(modelled: 25 elements of re-check ✓ over real ✗, the 10 unlisted plus the 15
canvas ones; all-pass in 115 of the 117 runs whose fix passes). A block needs
matplotlib's precedence modelled to be read right (90 modelled false greens);
in place needs the whole keyword parser (49).

**The shape chosen: at save.** It is the only shape whose effect does not
depend on the rest of the script (keywords, when rcParams are read, seaborn's
resets), and it measures best on every gate number. It leaves: the canvas
cause (to fix first), the first-check false PASSes (parser work), the re-check
reading the helper (W1), the one-shot `tight_layout` clip (re-run the layout
after the raise when the script ran one), `savefig` after `show()` (SHOWSAVE,
`ensurePySave`), and the length of the helper (about 41 lines as probed; to be
shortened).

## 6. Root cause

**The checker models matplotlib with a handful of literal spellings instead
of matplotlib's own rules**, and its fix is written in the one form the
checker writes but cannot read. Each claim is a place where the model and
matplotlib part: the canvas (a literal `figsize` only, else the print size),
per-element sizes (read only through `font.size` and four keyword calls, as
numeric literals, anchored on `plt.`/`matplotlib.`), the tick model (0.83 ×
where matplotlib's `'medium'` is 1.0 ×), when a setting takes effect (source
order, not the moment matplotlib reads it), and the fix (per-element rcParams
keys, which keywords, read time and seaborn's resets all override). That one
design cause is the critic's hypothesis; the claims' independence under the
probes (section 4) says the code paths are separate, and the fix is planned as
one commit per path, each gated on the four numbers (first-check false PASS,
re-check ✓ over real ✗, lowered text, corrected code that raises) being no
worse than the commit before.

Plan, in order: the canvas (the fix's re-check cannot be trusted while the
scale is wrong); the fix's shape (at save); the re-check reading its own fix;
the user's own sizes read as matplotlib reads them (per-element keys, aliases,
`plt.rc`, the keyword idioms, named sizes, read time); the tick model; rows for
text the figure does not draw; Postr's generated code; `savefig` after
`show()` and the commented-out `savefig`.

## 7. Fix

**Canvas.** `parsePythonCode` takes the canvas as matplotlib sizes it:
`set_size_inches` (its last call), else the `figsize` the figure is made with
(a literal, or names assigned numbers at the top level, alone or together, as
Postr's generator writes `fig_w, fig_h, dpi = 8, 5.6, 300`), else
`rcParams['figure.figsize']`, else 6.4 × 4.8 in. The print size is no longer
taken as the canvas: that was a deliberate choice ("so the analyzer and the
UI agree on scale"), reversed because matplotlib draws at its own canvas
whatever the print size, and the scale was wrong in 16 of 16 such runs. R
keeps the print size as its fallback: `ggsave()` with no size uses whatever
device is open, which the checker cannot know.

Results (MEASURED on a frozen copy, the second version of the instrument, 170
runs; controls held): `GATE fp=38 rcfp=10 L=63 run=7` against main's `fp=38
rcfp=10 L=63 run=8`; CANVAS 0 of 16 (main 16 of 16); G-scale 0 of 4 (main 3 of
4); first-check verdicts wrong 162 of 632 (main 199). A first version missed
the generator's tuple assignment and read `GATE fp=39 rcfp=11`: its one new
false PASS was that script's legend at 10 × 7 in (scale 1.46 against a real
1.25), found by diffing every element's verdict against main. Tests
(`readability.test.ts`, "the Python canvas follows matplotlib", 5): red
before, green after; each expected canvas is what matplotlib 3.10.8 reports
for the same script. `readabilityFullFix.test.ts` pinned the base-size fix
writing the print size as the figure size; it now writes matplotlib's canvas,
the one the check used.

**The fix's shape: at save.** For Python, `buildFontSnippet` now emits the
size each listed element needs, by class (`{'axisTitle': 17, ...}`), and
`applyFontFixes` adds a helper, `_postr_raise_text`, after the imports and
calls it just before each `savefig` (the figure it saves when its receiver
is a plain name, else the current figure), or before `show()` when nothing
is saved, or at the end. The helper raises each drawn text of a listed class
to at least its size and never lowers one; legend titles follow legend
text; captions (`fig.text`) are raised too, which no rcParams key could do;
a one-shot `tight_layout()` in the script is run again after the raise. A
second fix replaces the helper and its calls instead of stacking them. The
panel's sentence under the fix now says so, in one line. The helper reads
three matplotlib attributes that are private (`_left_title`,
`_right_title`, `_suptitle`), through `getattr`, so a version without them
loses only those.

Results (MEASURED on a frozen copy, 170 runs, controls held): `GATE fp=38
rcfp=10 L=0 run=0` (the canvas step: `L=63 run=7`); F 0 of 123 runs with a
fix (main 44 of 129); R2 0 of 123 (main 121 of 121); AXTEXT 3 of 8 (Axes texts
are never listed, so never raised); SHOWSAVE 3 of 7 and TIGHT-fix 5 of 5
unchanged (their own steps). The re-check still reads none of it: W1p 115 of
115, the next step. Tests: 10 new or rewritten in `readability.test.ts` (the
placement before each save, the receiver, a statement over several lines,
indentation in a function and a loop, `show()` and the end, a `savefig` in a
comment or a string, the relayout, a second fix); six tests pinned the
rcParams block and were rewritten for the helper.

**The re-check reads its own fix (W1).** `parsePythonCode` reads each live
`_postr_raise_text(target, {...})` call (comments stripped; the helper's own
`def` line excluded) and takes each named class at `max(what it reads
otherwise, the size named)`, covering both axes, since the helper raises
every drawn text of the class. Tests (`readability.test.ts`, "the re-check
reads its own Python fix", 4): each named class read at its size; never
lower than the script's own size; a call in a comment not read; and end to
end, a corrected script re-checks with every fixed element passing (2 red
before, the other 2 guards).

Results (MEASURED on a frozen copy with the instrument as it was before its
code review, so provisional until re-measured with the reviewed version;
controls held): `GATE fp=38 rcfp=10 L=0 run=0`; W1p 0 of 115 (main 81 of 81:
the corrected code passes in matplotlib and the page now says so); the
re-check identical to the first check in 0 of 123 runs (main 121 of 121); W1
8 of 123 runs, 10 elements, all of them re-check ✓ over real ✗/⚠ on elements
the fix never raised because the first check wrongly passed them (the same
10 as `rcfp`); W1e 2 of 5 editor runs, both a size the parser under-reads
(the `mpl.rcParams` alias and a per-element key), the next step's causes.

**The gate, per step, on the reviewed instrument (MEASURED).** The
instrument's code review (step 9) found one HIGH defect: the scoring trusted
the page's row set, so a fix that renamed or dropped a row made the gate
better with every control holding (renaming "Tick labels" took `fp` from 38
to 23; dropping "Legend text" took it to 26 and `rcfp` to 4). Its third
version exits 2 on an unknown or duplicate row, scores every class the truth
draws (a drawn class with no row is its own claim, NOROW, counted in `fp` and
`rcfp`), prints the gate's bases so a commit that offers fewer fixes cannot
look better, and fixes four MEDIUM and six LOW findings; the scoring moved to
`scripts/lib/checkerScore.mjs` with byte-identical results. Each step's runs,
collected above, re-scored with it:

| step | GATE fp · rcfp · L · run | fixes offered · re-checks | F | runs red with no fix offered |
|---|---|---|---|---|
| main | 38 · 10 · 63 · 8 | 129 · 121 | 44 of 129 | 1 |
| + canvas | 38 · 10 · 63 · 7 | 122 · 115 | 41 of 122 | 1 |
| + the fix at save | 38 · 10 · 0 · 0 | 123 · 123 | 0 of 123 | 0 |
| + the re-check reads it | 38 · 10 · 0 · 0 | 123 · 123 | 0 of 123 | 0 |

The canvas step offers 7 fewer fixes because 7 runs pass at the right scale;
runs red with no fix offered stay at 1 (the phantom Caption row, section 4).
No step is worse than the one before on any number; NOROW 0 in every step.
The earlier figures in this section, measured with the instrument's second
version, agree.

### The first shape, and why it changed (step 9 review, round 1)

The review of the three steps above (15 findings, S9-01 to S9-15) found the
shape itself broken: a helper call added as a line of its own above each
save broke one-line bodies (`for ...: fig.savefig(...)`, `with ...:`,
`else:`, a semicolon, a comprehension), landed inside a multi-line import,
and missed saves inside a `def`. On the reviewer's 43 probe scripts at
6 × 4.5 in (MEASURED by the reviewer, reproduced by the lead's driver on the
same scripts): the first shape ran 30 of 43 (11 crashed, 2 left a class
short); main ran 37 of 43 (2 crashed, 4 short) and its re-check still listed
the fixed elements in 43 of 43.

The fix now rewrites each save and each pyplot show in place:
`fig.savefig(` becomes `_postr_raise_text(fig, _POSTR_NEED).savefig(`, so the
raise happens exactly when that figure is saved, wherever the call sits. The
sizes live once, in `_POSTR_NEED = {...}`, in a marked block at the top of
the script (after a module docstring and `from __future__` imports). A save's
first argument, when it is a plain name, is passed as the figure
(`pdf.savefig(fig)`). A second fix takes the first one out before it goes
in. Redesign, same 43 scripts (MEASURED): 43 of 43 run, 0 crashed, 0 short,
0 lowered, 0 listed again on the re-check.

### The instrument's fourth version

The instrument's own review (round 2 of its step 9) found five ways a fix
could look better on the gate for the wrong reason. Version 4: the minimums
are pinned (18/18/14/14/12 pt; any other is an instrument error, exit 2); a
table that offers a fix must list exactly its ⚠/✗ rows; the gate line
carries the false alarms (`ffw` first check, `rcffw` re-check) and four
agreement twins (W2, SA, SR, SK, each set to the size the element has
anyway), so a pessimistic change shows; the header says which numbers can
mislead; a hash of the harness, its libraries and the corpus is printed on
the gate line. Falsified by its agent with the reviewer's mutations (each
now exit 2) and a self-consistent pessimist (exit 2 with the twins; without
them, visible on the gate line as ffw 113 → 147, redNoFix 1 → 27). The lead
re-scored main from the collected runs: the same gate line and the same
results hash (`1f1764593a6d945b`; MEASURED).

### Step 9 review, round 2 (on the redesign)

Two HIGH, four MEDIUM, eight LOW. Each reproduced by the lead before the
fix (MEASURED unless marked), fixed, and re-measured:

| finding | reproduced | fix |
|---|---|---|
| R2-01 HIGH: 16 tests unrelated to the fix deleted in the redesign | HEAD's test file run against the redesign: 125 of 131 pass; 26 titles missing | the 20 that pass restored (the override-coverage block, two R tests); 6 left out as obsolete by design (the Python fallback is now matplotlib's canvas, not the print size; no rcParams block; nothing inserted at the figure), one test added for a save in a function and in a loop |
| R2-02 HIGH: a second fix cut a receiver at its first comma | 3 of 3 receivers with a comma (`sns.catplot(data=df, …)`, `axs[0, 1].figure`, `plt.figure(1, figsize=…)`) SyntaxError after a second fix; a plain `fig` fine | the receiver ends at the first comma at its own bracket level |
| R2-03 MEDIUM: edited marker comments broke the helper | INSPECTED: the undo read the helper's `def` as a call | the block is found by its markers (trimmed, CR-tolerant), else by its `_POSTR_NEED` line and helper `def`; the `def` is never taken for a call |
| R2-04 MEDIUM: no save appended to a script that saves nothing | the save was looked for as the word `savefig`, which the helper's own docstring contains | a save counts only in live code (strings and comments masked), and it is added before the fix, so the fix raises it |
| R2-05 MEDIUM: the helper's relayout undid `tight_layout(rect=…)` and a later `subplots_adjust` | reviewer's numbers (right edge 0.727 → 0.977) | the helper re-runs `tight_layout()` only when every call in the script has no arguments and nothing calls `subplots_adjust` |
| R2-06 MEDIUM: saves after a line continuation, a save handed on uncalled (`save = fig.savefig`), and a show under `import numpy as np, matplotlib.pyplot as plt` were missed, and the re-check credited the fix anyway | 4 of 4 (reviewer), each red in a unit test first | one finder for both the rewrite and the re-check: continuation- and bracket-aware; an uncalled save becomes `(lambda *a, **k: _postr_raise_text(x, _POSTR_NEED, a[0] if a else None).savefig(*a, **k))`; imports read module by module; the re-check gives the fix no credit while any save or pyplot show is not routed through the helper |
| R2-07 LOW: a first-line `%%time` cell magic moved below the block | red test | the block goes after a first-line `%%` magic |
| R2-09 LOW: digit runs quadratic; 200 KB of unclosed calls ran 74 s then threw | 20k digits 1.9 s in the unit test; the unclosed-call test threw RangeError after 36 s | numbers read by an unambiguous pattern; brackets matched in one pass; the undo applies its edits in one pass and leaves an unclosed call alone |
| R2-11 LOW: four stale comments | INSPECTED | rewritten |
| R2-12 LOW: parts with no failing test | reviewer's mutants | tests added; see mutants below |
| R2-13 LOW: `get_layout_engine` needs matplotlib 3.6 | INSPECTED | read through `getattr`; 3.6 is the minimum for the relayout |
| R2-14 LOW: of two blocks the first was read (Python runs the last); a deleted helper `def` still read | red test | the last column-0 `_POSTR_NEED` is read, and only with the helper's `def` present |
| R2-08 LOW (contrived), R2-10 LOW (seaborn FacetGrid canvas, before this fix) | — | part 2 / section 10 |

The round-2 cases in real matplotlib 3.10.8 (MEASURED, the lead's own probe,
not the reviewer's): 11 of 11 fixed scripts run, and at save every listed
class is at least the size asked (17/14/13 pt, or 20/16/14 pt after a second
fix); `rect=` keeps the right edge at 0.725 and `subplots_adjust(top=0.78)`
keeps 0.78, while a bare `tight_layout()` is still re-run (right edge 0.975);
all four second-fix receivers parse.

### The gate on version 4 (MEASURED)

| tree | scripts | GATE fp · rcfp · L · run · ffw · rcffw | fixes offered · re-checks | F | red, no fix |
|---|---|---|---|---|---|
| main | 45 | 38 · 10 · 63 · 8 · 113 · 343 | 133 · 125 | 45 of 133 | 1 |
| main | 41 | 38 · 10 · 63 · 8 · 113 · 340 | 129 · 121 | 44 of 129 | 1 |
| + canvas | 41 | 38 · 10 · 63 · 7 · 81 · 320 | 122 · 115 | 41 of 122 | 1 |
| + first shape at save | 41 | 38 · 10 · 0 · 0 · 81 · 414 | 123 · 123 | 0 of 123 | 0 |
| + the re-check reads it | 41 | 38 · 10 · 0 · 0 · 81 · 0 | 123 · 123 | 0 of 123 | 0 |
| redesign | 45 | 38 · 10 · 0 · 0 · 81 · 0 | 127 · 127 | 0 of 127 | 0 |
| + round 2 part 1 | 45 | 38 · 10 · 0 · 0 · 81 · 0 | 127 · 127 | 0 of 127 | 0 |
| + round 2 complete (c6 = c7's source) | 45 | 38 · 10 · 0 · 0 · 81 · 0 | 127 · 127 | 0 of 127 | 0 |

The 41-script rows are the steps collected before the twins existed (scored
by the instrument's agent; the steps' frozen trees no longer match those
runs, so their twins could not be collected). Every control held on every
row (K-truth 13 of 13, C, K-page, K-known 0 on all thirteen claims).
`fp` 38 and `rcfp` 10 are the parser's (part 2); `ffw` 113 → 81 is the
canvas. What the gate does not measure: a second fix, notebook cells, and
minor tick labels (none in the corpus).

**Mutants (TESTED, `13-checker-reads-its-own-fix.mutants.json`).** Control
183 of 183; 25 of 25 killed: the canvas (4), the shape (4), the undo (3),
the finder (4), the re-check's credit and read-back (6), the relayout, the
save added before the fix and read only in live code (2), numbers in linear
time. Two survived on the first run and got tests: the last
`set_size_inches` wins, and an edited end marker left behind. One documented
blind spot: the helper's own Python (minor tick labels), which jsdom never
runs; TESTED in matplotlib (18 minor labels at 14 pt with the fix, 10 pt with
the mutant's text), not by a committed harness.

**Tests (TESTED).** 3004 of 3004; `readability.test.ts` 160,
`readabilityFullFix.test.ts` with the two R2-04 tests.

### Step 9 review, round 3, and the third shape

One HIGH, one MEDIUM, seven LOW, one INFO (R3-01 to R3-10), on the round-2
version. The HIGH one changed the shape again.

**R3-01 (HIGH).** R2-06's rewrite of a save handed on uncalled took any
attribute named `savefig` for matplotlib's: `if args.savefig:
fig.savefig(args.savefig)`, `self.savefig = True`, a config's `cfg.savefig`,
`orig = plt.savefig` kept in order to wrap it. The reviewer's new set of 32
scripts at 6 × 4.5 in, run by the lead's driver (MEASURED; the same at
4 × 3 in and in matplotlib 3.9.2): the round-2 version ran 23 of 32 (6
crashed, 3 left a class short of its size); main 29 of 32 (2 crashed, 1
short).

**The third shape: the save is wrapped, not rewritten.** No save in the
script is edited. The block at the top defines the helper and
`_postr_install()`, and calls it: `_postr_install()` wraps matplotlib's own
`Figure.savefig` once (a flag stops a notebook's second run stacking it), so
each figure raises its listed text as it is saved, however the save is
written: a method, pyplot's `savefig`, a name bound to either, `getattr`,
`functools.partial`, a library's own save. A pyplot show saves nothing, so
nothing wraps it: each is still routed through the helper, and a call at the
end raises every figure still open, which is what a notebook draws. The
re-check credits the fix only with the block's `_POSTR_NEED`, both defs, a
live `_postr_install()` call, no figure printed by its canvas
(`.print_figure(`, which does not go through `Figure.savefig`) and every
pyplot show routed.

| finding | reproduced | fix |
|---|---|---|
| R3-01 HIGH: any attribute named `savefig` rewritten | round-2 version 23 of 32 run (above) | the third shape; a test with the reviewer's shapes (argparse, `self.savefig`, a partial, `cfg.plot.show()`) left byte-for-byte |
| R3-02 MEDIUM: R2-05's relayout skip was all or nothing: one `tight_layout(pad=…)` or `subplots_adjust` anywhere stopped it for every figure | the layout grid below: panels crossing on the round-2 version (1.119 in² on n17) | `Figure.tight_layout` and `Figure.subplots_adjust` are wrapped too: each figure records its last `tight_layout(args)` and any `subplots_adjust` after it, and the helper replays them after raising (nothing is recorded while replaying) |
| R3-03 LOW: two figures, neither saved nor shown: the appended save raised only the current one | reviewer: the other figure 12/10/10/10 pt at the end of the run | the end call, raising every figure, is always appended |
| R3-04 LOW: the appended save named `plt` in a script that never binds it | n24 crashes with NameError on the round-2 version and on main | the save imports `plt` when the script never binds it (test) |
| R3-05 LOW: saves the finder could not see stayed small while the re-check credited the fix (`getattr(fig, 'savefig')`, `from matplotlib.pyplot import savefig as s`, a partial) | n05, n06, n07, n19 short on the round-2 version | the wrap raises them all; `.print_figure(` withholds the credit (test) |
| R3-06 LOW: 11 of the reviewer's 18 extra mutants survived | on the third shape (MEASURED): 9 of the 18 edit code it removed; of the other 9, the tests killed 4 | tests for 4 of the 5 left (a continuation before a Windows line break, an import after a `;`, a receiver over several lines, a call nested in another); the fifth, a second fix unwrapping a show handed on uncalled, changes nothing, since the new fix routes the unwrapped show back to the same text, so that code was removed |
| R3-07 LOW: contrived attribute shapes that do not compile once fixed; a chain of attributes quadratic | on the third shape (MEASURED, the reviewer's probe): 9 of 9 save shapes compile, 8 of 9 as shows (`plt.show, other = print, 1` does not: section 10); `fig.show.show…` of 40 KB took 3174 ms to fix and 3183 ms to re-check | the walk back from `.show` reads at most two names (no pyplot alias is longer): 8 ms and 5 ms (red test at 5951 ms first) |
| R3-08 LOW: `from matplotlib import (\n pyplot as plt, …)` not read, so its `plt.show()` was not raised | n15 on the round-2 version | read (test) |
| R3-09 LOW: three stale docstrings | INSPECTED | rewritten |
| R3-10 INFO: the helper imports `FigureBase` | INSPECTED; 3.4 is when it arrived (UNVERIFIED: no older matplotlib installed) | section 10 |

Writing the R3-06 tests found one more (MEASURED): a second fix deleted
code written after the end call on its line (`…every=True); print("done")`
lost the `print`), because the undo took the call to the end of its line.
It now takes the call and a `;` after it (red test first).

**The break sets on the third shape (MEASURED, the lead's driver, matplotlib
3.10.8; each fixed script also fixed a second time at 4 × 3 in, and each
second fix runs):**

| set | scripts | round-2 version | third shape | main |
|---|---|---|---|---|
| round 1 (S9) | 43 | 43 | 43 | 37 (2 crash, 4 short; round 1) |
| round 2 | 23 | 22 (b10 crashes: R2-08, part 2) | 22 (b10) | 20 (3 crash) |
| round 3 | 32 | 23 (6 crash, 3 short) | 32 | 29 (2 crash, 1 short) |

The same at 4 × 3 in. The layout grid (`layout2.py` at every save; square
inches of text outside the figure, of one panel's text over another panel,
of a figure legend or suptitle over a panel; 6 × 4.5 in):

| script | original | third shape | round-2 version | main |
|---|---|---|---|---|
| n16 two figures, mixed layouts | 0 · 0 · 0 | 0 · 0 · 0 | 0.19 · 0.63 · 0 | 0 · 0 · 0 |
| n17 `tight_layout(pad=…)`, grid | 0.013 · 0.012 · 0 | 0 · 0 · 0 | 0.52 · 1.119 · 0 | 0 · 0 · 0 |
| n18 adjust, then tight | 0 · 0 · 0 | 0 · 0 · 0 | 0.119 · 0.549 · 0 | 0 · 0 · 0 |
| n29 `tight_layout(h_pad=…)`, one row at 6.4 × 3 in | 0 · 0 · 0 | 0.051 · 1.301 · 0 | 0.584 · 1.747 · 0 | 0.052 · 1.305 · 0 |
| n30 suptitle, `rect=`, grid | 0 · 0 · 0 | 0 · 0 · 0 | 0.108 · 0.544 · 0 | 0 · 0 · 0 |
| l01 `rect=` for a figure legend | 0 · 0 · 0 | 0 · 0 · 0 | 0.137 · 0 · 0 | 0 · 0 · 0.099 |
| l02 tight, then `subplots_adjust(top=0.78)` | 0 · 0 · 0 | 0 · 0 · 0 (top 0.78) | 0.019 · 0.026 · 0 | 0 · 0 · 0 (top 0.78) |

n29 is the one left: at the sizes asked for, the raised text does not fit
one row of three panels on a 3 in canvas, whatever the layout; main
collides the same (section 10). On no script in this grid is the third
shape worse than main.

**The gate's truth script bypassed the wrap (instrument correction).** The
first gate run on the third shape read `rcfp=33 F=8/127`, where the break
sets had it clean. The truth script replaces pyplot's `savefig` to record
each save, and called its recorder on `plt.gcf()` directly: a save written
`plt.savefig(…)` never went through `Figure.savefig`, which the fix now
wraps, so the gate measured those figures unraised. matplotlib's own
`pyplot.savefig` calls `gcf().savefig(…)`; the replacement now does the
same (`mpl_truth.py`, one line, with a comment). Re-scored (MEASURED,
instrument `60380f74b203ee83`; every control held):

| tree | GATE fp · rcfp · L · run · ffw · rcffw | F | leaf differences from the old instrument's results |
|---|---|---|---|
| main | 38 · 10 · 63 · 8 · 113 · 343 | 45 of 133 | 0 |
| round-2 version (c6) | 38 · 10 · 0 · 0 · 81 · 0 | 0 of 127 | 0 |
| third shape (c8) | 38 · 10 · 0 · 0 · 81 · 0 | 0 of 127 | 123 (the saves now measured through the wrap) |
| third shape, install removed (mutant `wrap-not-installed`) | 38 · 10 · 0 · 0 · 81 · 102 | 103 of 127 | — |

The correction changes no verdict on main or on the round-2 version (a
comparison of every leaf of `results.json`; the comparison itself tells c8's
two runs apart, 123 leaves, and main from c6, 2799). A fix that installs no
wrap still reads red on the corrected gate.

**Mutants (TESTED).** Control 186 of 186; 34 of 34 killed, 2 documented
blind spots. The blind spots are both the helper's own Python, which jsdom
never runs. Each was checked in matplotlib 3.10.8 by the lead, not by a
committed harness:

- **Minor tick labels:** 14 pt with the fix, 10 pt with the mutant's text.
- **The layout replay:** n17 at 0 / 0 in² with the fix, and 1.119 / 0.52 in² with the mutant.

**Tests (TESTED).** 3007 of 3007.

The changes above made after `fix13-frozen-c8` froze (the R3-06 tests, the end call, the removed unwrap and the bounded walk) were reviewed with round 4's follow-ups.

### Step 9 review, round 4, and the fourth shape

On `fix13-frozen-c8`: no HIGH, three MEDIUM, eight LOW, five INFO (R4-01 to R4-16). The reviewer ran its own render-level instrument, which is independent of `Figure.savefig`, over 46 scripts of its own plus notebook and same-process scenarios. It ran them on c8, c7, main and a raise-first control, in matplotlib 3.10.8 and 3.9.2. It found the instrument correction sound: 0 differing leaves for main and for c6.

Each MEDIUM was reproduced by the lead's harness before the fix (MEASURED on c8's helper, 6 × 4.5 in):

- **R4-02:** k40 crashes with RuntimeError; main runs.
- **R4-03:** k41 no longer pickles (PicklingError); main pickles it.
- **R4-04:** k10's seaborn legend lies 0.419 in² over the panel; the raise-first control, 0.026.

For R4-01, the lead's layout instrument could not see the reviewer's colorbar drawn over a panel: it skipped Axes whose boxes overlap. It now measures Axes over Axes and how far each moved. The four scripts written for round 4's follow-ups show it (below).

**The shared cause, and the fourth shape.** R4-01 to R4-04, like R3-02, n16 and n29 before them, have one cause: the text was raised after the layouts were computed. The layouts in question are the script's own `tight_layout`, seaborn's legend placed outside, and a hand-placed panel. The replay tried to catch up afterwards and brought its own failures.

The block's install now also wraps `Figure.__init__`. As each figure is made, the sizes rcParams set (titles, axis labels, tick labels, legends) are raised to the need, never lowered. Text is born at its size, so every layout, the script's and seaborn's, is computed with it. This is what the reviewer's raise-first control does. It also holds after `sns.set_theme()`, which resets rcParams between the imports and the first figure.

The save-time raise stays as the guarantee, for sizes the script sets itself. The replay runs only when such a save grew a text, and only while the script has neither moved nor added an Axes nor changed the layout engine since its own layout.

Also:

- The record holds step names, not functions, so figures pickle.
- Running the block again replaces the first install, so a second fixed script in one Python uses its own sizes.
- A failure inside the helper is a warning, and the save still happens.
- `FigureBase` is no longer imported, so R3-10's floor is gone for that name. The versions actually checked are 3.9.2 and 3.10.8.
- 3D Axes' z axes are raised.

| finding | reproduced | fix |
|---|---|---|
| R4-01 MEDIUM: the replay undid geometry the script set after its layout (a panel placed by hand pushed back into the grid; a colorbar drawn over a panel) | on k48 with the guard taken out: the panel moved 1.86 in, 0.265 in² over another | text born at its size leaves the replay rarely needed; when it is, it does not run after an Axes moved or was added |
| R4-02 LOW: the replay crashed the save after a switch to constrained layout | k40, above | the same guard; and a failure is a warning (k49 warns with the guard off, crashes with the catch off too) |
| R4-03 MEDIUM: figures that ran `tight_layout` could not be pickled | k41, above | names in the record |
| R4-04 MEDIUM: seaborn's figure-level legends ran over the right panel | k10, above | text born at its size: 0.027 in² (the control 0.026) |
| R4-05 LOW: false greens where a figure reaches a file or a notebook without `Figure.savefig` (`canvas.print_png`, `buffer_rgba`, `print_pdf`, a handed-on `print_figure`, `display(fig)`) | reviewer's page probe | the re-check gives no credit for any of them (red unit test first) |
| R4-06 LOW: a 3D Axes' z axis was not raised | k50 (lead's): z label 8 pt, need 20, shown passing | raised; the instrument now reads z |
| R4-07 LOW (new in c8): a bare `show()` under `from matplotlib.pyplot import *` was no longer routed | k45: short, false green | routed again (red test) |
| R4-08 LOW: a second fixed script in one Python used the first one's sizes | same-process check: [[17], [17]] | re-install: [[17], [25]] |
| R4-09 LOW: the install is process-wide, so a figure the script keeps small (a diagnostics sheet) is raised too | k35 | section 10; a known failure in the harness |
| R4-10 LOW: the block imports matplotlib before the script's own environment setup (`MPLCONFIGDIR`) | reviewer's numbers | section 10 |
| R4-11 LOW: the save added to a script that imports pyplot only inside a function hit NameError | k46 (main too) | only a top-level import binds `plt` (red test) |
| R4-12 INFO: `plt.show, x = …` does not compile once fixed | reviewer's probe, and the lead's | section 10 |
| R4-13 LOW: 4 of the reviewer's 6 extra mutants survived | reviewer's run | the bare-show and install-def ones have tests; the Python ones are in the harness |
| R4-14 INFO: stale docstrings | INSPECTED | rewritten |
| R4-15 INFO: the frozen tree lacked the instrument correction | — | frozen copies are made after the harness changes |
| R4-16 INFO: the replay cost about 18 ms per animation frame | reviewer's numbers | the replay runs only when a save grew a text; not re-timed |

**The shape harness on the fourth shape (MEASURED, `checker-shape-check.mts`, matplotlib 3.10.8):**

| set | 6 × 4.5 in | 4 × 3 in | main (6 × 4.5 and 4 × 3) |
|---|---|---|---|
| round1 (43) | 43 | 43 | 36, 36 |
| round2 (23) | 22 (b10 known) | 22 | 20, 20 |
| round3 (32) | 32 | 32 | 29, 29 |
| round4 (48) | 48 (k23 passes every row: no fix needed) | 48 | not run on main |

On the same-process check, the fix saves [[17], [25]]; main saves [[8], [8]], because main never raises a size the script sets itself.

The layout grid covers round 3's 7 scripts and round 4's 48, judged against the original and the raise-first control. It finds 0 defects and 2 known ones:

- **k35:** R4-09.
- **k48:** text the script sized itself, in a panel it placed after its layout. The layout is not run again, so the placement holds and the text clips 0.183 in².

Main has 5 layout defects there.

**Mutants (TESTED).** Control 190 of 190. 37 of 37 killed by the unit tests, and 8 documented blind spots, all Python. Each blind spot is falsified by the shape harness, except minor ticks, falsified in matplotlib by hand as before; the numbers are in the spec. The catch that keeps a failure from stopping the save is equivalent alone: with the layout guard also off, k49 crashes.

**Tests (TESTED).** 3011 of 3011.

**The gate on the fourth shape (MEASURED, instrument `60380f74b203ee83`, every control held):** `GATE fp=38 rcfp=10 L=0 run=0 ffw=81 rcffw=0`, F 0 of 127, the same as the third shape. `fp` 38 and `rcfp` 10 are the parser's (part 2).

### Step 9 review, round 5, and the fifth shape

On `fix13-frozen-c10`: no HIGH, four MEDIUM, seven LOW, three INFO (R5-01 to R5-14). The reviewer's instrument hooked only the PDF backend's text drawing, a different layer from round 4's and from every name the fix wraps, and cross-checked it by reading every saved PDF (0 disagreements in 570 runs). It reproduced the lead's round-4 numbers exactly.

The lead reproduced each finding with the shape harness on the round-5 scripts (now `fixtures/checker-shapes/round5`, 32 scripts; MEASURED, 6 × 4.5 in):

- **R5-01:** the fourth shape lowered text in f01, f02, f03 and f04; c8 lowered none.
- **R5-02:** after a colorbar, a twin Axes, an added Axes, an Axes deleted and added again, or an unpickled copy, the fourth shape clipped and collided (f11: 0.487 and 1.08 in², against 0.108 crossing in the control), where c8 re-ran the layout.

**The shared cause:** the fourth shape's two new mechanisms had each been made too blunt.

- Born-at-size wrote numbers over the script's own rcParams for the rest of the process.
- The replay guard refused any change to the figure's Axes, and any figure whose layout had gone stale.

**The fifth shape:**

- **Born at size, reversibly.** Postr remembers what it set in rcParams and the script's own value. Before each figure is made, and at the end of the script, it puts the script's value back and resolves it again. A size the script sets later (a bigger `font.size`, a relative "large") then wins whenever it is bigger than the need. Legend titles are born at size too (they follow `font.size`, not the legend's own size).
- **A different replay guard.** The layout is run again when a save grew a text, or when the layout is out of date (the figure resized, or titles, labels or legends added since the script's `tight_layout`). It is not run when an Axes has left the position its subplotspec gives, which is what a hand placement or a colorbar shared by several Axes does, or when the layout engine changed. Colorbars made on the grid, twin Axes, an Axes deleted and added again, and an unpickled figure all keep their subplotspec position, so they are replayed.
- **The wrap is made once.** Its state lives on the Figure class, so a second install updates the sizes without unwrapping a library that wrapped `savefig` after it (R5-10).
- **Inset Axes** (an Axes' children) are raised.
- **The TypeScript side.**
  - A script that defines its own `show` keeps calling it (R5-08).
  - Only a figure passed to `display(` withholds the re-check's credit (R5-09).
  - The end call is `…, every=True, end=True)`.

| finding | reproduced | action |
|---|---|---|
| R5-01 MEDIUM: born-at-size lowered text a bigger `font.size` set later would have made larger | f01–f04, above | reversible born-at-size: f01, f02, f04 clean; f03 (`font.size` changed after the figure is made and before its text) stays lowered at 6 × 4.5 in, a known residual (section 10) |
| R5-02 MEDIUM: the guard refused needed replays | above | the subplotspec guard: f10 0.476 · 1.008 → 0 · 0; f11 0.487 · 1.08 → 0 · 0; f12 0.328 · 1.213 → 0 · 0; f22 0.487 · 0.2 → 0 · 0; f27 0.487 · 0.2 → 0 · 0 (in² clipped · crossed) |
| R5-03 MEDIUM: a stale layout was never re-run | the grid: k20 0.44 · 0.98, k24 0.63 (the control fails the same way, so the grid could not flag it) | stale layouts are replayed: k20 0 · 0 (the original script itself clips 0.058 · 0.306), k24 0 |
| R5-04 MEDIUM: seaborn grids with a legend outside widen their saved canvas once the legend is born at size, so the text prints small while the page shows all-pass | the reviewer's page probe (f18: canvas 5.98 → 6.99 in) | part 2, with R2-10 (the checker assumes a 6.4 × 4.8 in canvas for seaborn's grids) |
| R5-05 LOW: legend titles were not born at size | f17: the legend 1.333 in² over the panel | `legend.title_fontsize` raised: 0.017 in² (the control 0.028) |
| R5-06 LOW: a second script with a smaller need kept the first one's bigger rc sizes | the reviewer's numbers | the script's own values come back before each figure and at the end |
| R5-07 LOW: the process-wide install reaches later cells' figures | the reviewer's numbers | the end restores rcParams; the wrap still raises later figures (section 10, with R4-09) |
| R5-08 LOW: a script's own `show()` was replaced by pyplot's under the star import | red test | kept |
| R5-09 LOW: any `display(` withheld the credit | red test (`display(df.describe())`) | only a figure displayed withholds it |
| R5-10 LOW: re-install dropped a library's later wrapper, and a plain wrapper disabled the replay | INSPECTED | the state on the Figure class; not measured with a real library (section 10) |
| R5-11 LOW: inset Axes were not raised, and the instrument did not see them | f13 | raised; `shape_truth.py` now reads an Axes' children |
| R5-12 INFO: the harness's b06b fixture (an atexit save) wrote `apps/web/a.png` into the tree; the grid ran at one size; no fixture changed rc after a figure | the reviewer's | `shape_truth.py` stays in its temporary folder; the round-5 set covers rc changes; the grid stays at 6 × 4.5 in |
| R5-13 INFO: the parser reads rc_context text as passing | the reviewer's | part 2 (the parser) |
| R5-14 INFO: two stale docstrings | INSPECTED | rewritten |

**The harness, made stricter.**

- **Known failures:** each is scoped to the kind of defect it is known for, and is stale only when it passes at every size it ran at.
- **New defects:** a matplotlib warning about the layout that the original script never gave counts as a defect, and so do rcParams left changed after two fixed scripts in one Python.
- **New cases:** k51, a figure switched to constrained layout after its layout, and the round-5 set.
- **The "moved" rule:** its threshold is 1 in, since a replay that makes room for grown text moves Axes by up to 0.6 in (c8 on f10 and f11).

Three layout cases share one cause, and main has them too. The script fixed its own layout: `subplots_adjust` alone (f15), gridspec spacing set after its layout (f24), or no layout at all (f30, after `rcdefaults()`). Text the script sized itself, raised at the save, overflows it; the fix does not invent a layout the script did not ask for. They are known failures in the harness, with k35 and k48.

**Mutants (TESTED).** Control 192 of 192. 39 of 39 killed by the unit tests, and 14 documented blind spots, all the helper's Python. Each is falsified by the shape harness (the numbers are in the spec), except two:

- minor ticks, falsified by hand in matplotlib as before;
- the catch that keeps a failure from stopping the save, which is equivalent alone (with the layout guard also off, k49 crashes).

The end restore and the engine check were first measured by hand. With the restore removed, rcParams are left at 20 and 15 after the script. With the check removed, the figure is switched back to tight and matplotlib warns. The harness now judges both.

**Round 6's change: the replay's own warning.** The stricter harness found one more defect. On three scripts (k39, an inset; f12, an Axes added by hand; f24, gridspec spacing changed after the layout) the replay printed matplotlib's "This figure includes Axes that are not compatible with tight_layout", which the script never printed (a LAYOUT WARNING at both sizes). The replay now runs with that one warning filtered. A mutant that removes the filter survives the unit tests (the Python never runs there) and is falsified by the harness on those three scripts. f32, a constrained layout whose legend sits outside the panel, warns "constrained_layout not applied" at 4 × 3 in only: the raised text does not fit that canvas, whatever the layout. It is a known failure (section 10).

**The shape harness on the fifth shape with round 6's change (MEASURED, `checker-shape-check.mts --layout`, matplotlib 3.10.8; 0 defects, 9 known, 0 stale known):**

| set | 6 × 4.5 in | 4 × 3 in |
|---|---|---|
| round1 (43) | 43 | 43 |
| round2 (23) | 22 (b10 known) | 22 (b10) |
| round3 (32) | 32 | 32 |
| round4 (49, with k51) | 49 | 49 |
| round5 (32) | 31 (f03 known) | 31 (f32 known) |

The layout grid, 88 scripts at 6 × 4.5 in (80 whose original saves, so can be judged), has 0 defects and five known ones: k35 (R4-09), k48, f15, f24 and f30 (section 10). Below the tolerance of 0.05 in² over the control: f26, a figure legend added after `tight_layout` and `subplots_adjust`, crosses 0.037 in² where the control and the original cross nothing.

### Step 9 review, round 6, and the sixth shape

On `fix13-frozen-c11` (the fifth shape with round 6's warning filter), a workflow of three reviewers with split partitions, a skeptic for each finding above LOW, and a critic:

- **Code:** the diff read line by line, and the TypeScript and the helper's Python driven at unit level (the page's own functions through `tsx`; the helper imported and called on constructed figures); the harness weakened in copies to see what it would miss.
- **Real matplotlib:** 30 new scripts measured from the saved SVG (`svg.fonttype none`), a layer no earlier round used, against c10, main and a raise-first control, in matplotlib 3.10.8 and 3.9.2.
- **The page, notebooks and claims:** the checker page driven in Chromium, notebooks in IPython with the inline backend, two fixed scripts in one Python, and every number in this record's round 5 and sections 8 to 10 re-measured.

Each of the 8 findings above LOW was REPRODUCED by a skeptic with an instrument of its own and a positive control (MEASURED by the skeptics, `fix13-out/step9-review/round6/skeptic-*`).

**The shared causes.** Six of the nine MEDIUM findings come from two causes, and a third is round 5's own change:

1. **Postr told its own rcParams values from the script's by equal numbers.** `rc_context` and `style.context` put back a snapshot that held Postr's number, and a script can write the same number itself. So the end of the script put a context's inner sizes (8, 6, 9.6) into rcParams for the rest of the session, or dropped a size the script had set. A later fixed script, or a later notebook cell, then printed text below its own original and below the checker's minimum (16.66 pt against 18), while its page showed all-pass (R6C-02, R6P-02, R6M-01, R6M-02).
2. **Tick label sizes lived only on the label objects.** The size a tick label was born at, or raised to, was not the axis's own. Once rcParams were given back, the tick locator spaced the ticks for the smaller size, so a notebook's preview and any later save of the figure crowded 18 labels where the save had 8 (R6M-03). A shared axis whose labels are hidden kept its small size and set the spacing for every Axes that shares it (R6M-04; c10 has it too).
3. **Round 5's narrower `display(` rule** gave the re-check credit for a figure shown under any other name (`display(f)`, `display(ax.get_figure())`, `display(df, fig)`), whose text is never raised (R6C-01, R6P-01).

**The sixth shape:**

- **Postr knows its value by identity.** It keeps each value it puts into rcParams as the very object it wrote, with the script's value it replaced. A context puts back that same object; a script's own assignment makes a new one. At the end, and before each figure, a key still holding one of Postr's objects gets that object's script value back; the record is cleared at the end, and given back even when raising the text failed.
- **Tick sizes are the axis's own.** Each raise writes the size a tick label has into the axis's tick settings (`labelsize`), so the locator keeps spacing for it after rcParams are given back. An axis whose labels are hidden is raised through its tick settings too.
- **Any `display(` withholds the credit** again: a false red on `display(df)` is kept rather than a false green.
- **A show the script defines or assigns anywhere** (in a function, an `if`, a `try`; a method named `show` aside) is its own, and `from pylab import *` is routed like pyplot's.
- **The replay** also filters matplotlib's "Tight layout not applied": when the grown text does not fit, the replay leaves the layout as the script had it, and that warning is not the script's (R6M-05, a 3D Axes).
- **The helper never stops a save under warnings-as-errors**, and the end call returns None, so a notebook cell shows nothing for it.

| finding | reproduced | action |
|---|---|---|
| R6C-01, R6P-01 MEDIUM: `display(` under another name kept the credit (false green) | the skeptics: 7 of 7 spellings on c11, the page all-pass and the notebook's image at 7.39 to 11.08 pt; c10 withheld it in 16 of 16 | any `display(` withholds (red test: 12 spellings) |
| R6C-02, R6P-02, R6M-02 MEDIUM: a context after a figure leaked its sizes into later scripts and cells | the skeptics: 10 of 14 script pairs lower on c11, and a later notebook cell printed 16.66 pt (V1: 9.6, 8.8 and 8 pt) with all-pass | identity (below) |
| R6M-01 MEDIUM: text lowered below what the script drew, in contexts after a figure | the skeptic: 98 texts in 17 runs on c11 (c10 and main lowered more) | identity (below) |
| R6M-03 MEDIUM: tick labels crowded in a notebook's preview and later saves | the skeptic: 18 labels overlapping 0.101 to 0.954 in² on c11; 8 labels and none on c10 and main | tick sizes the axis's own |
| R6M-04 MEDIUM: shared axes with small explicit tick labels crowded once raised | the skeptic, by ink: g48 0.026 and 0.259 in² on c11 and c10; main 0 (its text stays small) | hidden-label axes raised |
| R6C-04, R6P-04 LOW: a `show` defined in a function or an `if` was replaced | the reviewers' scripts: `report.pdf` never written | own show anywhere (red test) |
| R6P-03 LOW: `from pylab import *` with a bare `show()` was not routed | the page reviewer | routed (red test) |
| R6C-08 LOW: under warnings-as-errors a failure inside the helper stopped the save | the code reviewer | the warning is guarded |
| R6C-09 LOW: the end call's return value was a notebook cell's output | the code reviewer | returns None |
| R6C-12 INFO: the end restore was skipped when raising failed | the code reviewer | the restore runs after a failure too |
| R6M-05 LOW: a 3D figure's replay printed "Tight layout not applied" | the mpl reviewer and the harness (g24, both sizes) | filtered in the replay |
| critic, HIGH: f32 at 4 × 3 in: the raised legend title collapses the panels to 0.15 in (1.09 with the title left at 10 pt; the original 1.79), and the KNOWN entry gave the wrong cause | the critic, `layout_truth.py` | an owner call (section 10): legend titles stay raised; the cause corrected |
| R6C-03, R6C-07, R6C-10, R6C-11, R6P-05, R6M-06 LOW and INFO | the reviewers' numbers | section 10 |
| R6P-07 LOW: a figure legend outside with `bbox_inches='tight'` widens the saved canvas (s12: 8.786 in; 18 texts under) | the page reviewer | part 2, with R5-04 |
| R6C-05, R6P-06, R6P-08 LOW and INFO: record claims | the reviewers | corrected (below and section 10) |
| R6C-06, R6M-07 and the critic's MEDIUM gaps: what the harness could not see | the reviewers and the critic | the harness's next version (below) |

**The sixth shape, measured with the skeptics' own instruments (MEASURED, re-run by the lead on the sixth shape, matplotlib 3.10.8):**

- **Two fixed scripts in one Python** (skeptic-code-2's 7 × 2 pairs): the second script's axis-title and tick sizes and rcParams after the first match the unfixed pair in 14 of 14 cells; on c11, 10 of 14 were lower (a context's sizes leaked in 8, the script's own 36 pt lost in 2).
- **Notebook cells** (skeptic-mpl-2, IPython with the inline backend): no later cell below the minimum in any fixed scenario at either size; c11 printed 16.66 pt (REV) and 9.6, 8.8 and 8 pt (V1) at 6 × 4.5 in.
- **Lowering** (skeptic-mpl-1's 23 jobs at both sizes): on the fix's own path, 0 of 46 runs lower any text, but f03 (known); c11 lowered in 17. Three runs still lower text at 6 × 4.5 in: g28, g40 and g41 get the page's base-size fix, not the helper, and it rewrites `font.size` 26 or 22 to 18 (part 2, section 10).
- **Tick crowding** (skeptic-mpl-3's notebook cases): d01 and v3_show keep 8 labels and no overlap in the preview and a later save, at both sizes; c11 had 18 labels, 0.101 to 0.954 in².
- **Shared axes** (skeptic-mpl-4's 10 cases): no tick-label overlap at 6 × 4.5 in; at 4 × 3 in the ideal control's own figures (g48 0.038 against 0.039 in², v06 0.001); c10 and c11 up to 0.110 and 0.259 in².

**Mutants (TESTED).** Control 195 of 195; 42 of 42 killed; 20 documented blind spots, all the helper's Python. New: `display-narrowed`, `own-show-top-level-only`, `method-show-counts-as-own`, `pylab-not-routed` (killed), and `rc-known-by-equality`, `hidden-tick-labels-skipped`, `tick-size-not-pinned`, `end-returns-pyplot`, `warning-as-error-breaks-save` (blind spots, each falsified in matplotlib with the numbers in the spec). `replay-warns` now also removes the new filter (g24 warns at both sizes with it).

**Tests (TESTED).** 3016 of 3016, 180 files; `tsc --noEmit` clean.

**Corrections from round 6.** Section 7 said every helper blind spot is falsified by the harness but minor ticks and the catch: `stale-layout-kept` was not (R6C-05; the next harness judges it). f15 and f24 do not clip on main: there their text stays too small, and the re-check says so (R6P-06); f30 clips on both. f18's canvas on c11 is 6.578 in, not c10's 6.99. The rcParams "given back at the end" hold for the fixed script; a figure a later cell makes is still raised by the wrap, and writes Postr's sizes into rcParams again (R6P-08, with R5-07).

### The harness's sixth version, and round 7

Round 6's reviewers and critic named what the harness could not see (R6C-05, R6C-06, R6M-07 and the critic's gaps). Its sixth version was built in three steps on `fix13-harness`, each followed by an independent agent that reproduced the builder's controls and weakened each judgement to see the red go (`fix13-out/harness-v6`, `-v6-1`, `-v6-2` and their `-check` folders). What it judges, each against controls that run no Postr code:

- **The layout grid at two sizes**, 6 × 4.5 and 4 × 3 in, against three controls:
  - the ideal: the script itself sizing the classes the checker lists (plot titles, axis titles, tick labels, legend text and captions); legend titles and other unlisted text keep the script's own sizes;
  - raised first: rcParams raised before the script runs;
  - fresh: the ideal, with the script's own last `tight_layout` and the `subplots_adjust` calls after it run again at every save.

  The ideal first raised legend titles as the fix does. Its check found that it then copied the fix's own policy, so f17 and f32 at 4 × 3 in could not go red, and it was narrowed to the listed classes.
- **Moved.** An Axes the script placed by hand (no grid place, or taken out of the layout) is judged by its position relative to every other Axes, against the original or the ideal, with 0.05 in of slack. The first version measured an absolute move: it missed a01 (a colorbar placed from its panel's position, which the replay leaves 0.28 to 0.51 in off the moved panel) and flagged f21, where the fix equals the ideal. On the fix, every hand-placed Axes but a01's and a02's is within 0.006 in, and those two are 0.222 in or more. The slack sits in that gap, which is this tree's own; no bound says what relative move is harmless (the check of v6.2, LOW).
- **Stale.** A save whose original layout is out of date (the figure resized, or a text added or changed since its layout call; measured in the original run, 20 fixtures) is a defect when the fixed script clips or crosses more than max(original, fresh) + 0.05 in². The fresh control shares the fix's replay policy, though none of its code: at a save the fix replays, it can tell only whether the fix applied that policy, not whether the policy is right. The grid still bounds every save by the ideal, which shares nothing (the check of v6.2, LOW).
- **Ticks:** tick labels overlapping each other, at the script's saves and in figures left open after it (a notebook's preview).
- **Warnings:** all of them, collected even when the script ends in `sys.exit`; a layout warning the original never printed is a defect.
- **Two fixed scripts in one Python:** chains with a context, a style or a decorator after a figure, and equal and falling needs. Each second script's printed sizes are judged against that script run alone, lower or more than 1 pt higher.
- **Saves:** the fixed script writes the files and pages the original does, compared by name. A file only the fixed script writes (its `poster_figure.png`) is printed, not judged.
- **Known failures:** keyed by script and size, with a ceiling of 1.5 times the recorded figure (`--known-selftest` halves the figures and every entry with one comes out KNOWN WORSE), and stale per tag. A run killed at its timeout is an instrument error (exit 2), not a crash, and each run removes its temporary folders.

**Its positive controls (MEASURED by the builders, each reproduced by its check).** Of the helper's 21 blind-spot mutants, 17 go red under v6.2 against the fix:

| mutant | what goes red |
|---|---|
| `layout-not-replayed` | the grid in 41 places, stale in 17 |
| `born-small` | the grid in 21 (k10's figure legend 0.419 in²), stale in 6, k08 short |
| `stale-layout-kept` | stale on k08, k11, k20, k24 at both sizes and k32 at 4 × 3 in (R6C-05: v5 could not see it) |
| `moved-axes-ignored` | moved on k48, 1.857 and 1.627 in; overlap on g13, s09, k22 and k38 |
| `legend-title-not-born` | f17's figure legend, 1.333 and 4.994 in² |
| `rc-not-given-back` | text lowered on f01, f02 and f04 (by up to 11.2 pt); the same-process chains |
| `end-keeps-rc`, `rc-known-by-equality`, `second-install-ignored` | the same-process chains (falling need: 25 pt in the chain against 17 alone) |
| `hidden-tick-labels-skipped` | tick overlap on g48 (0.026 and 0.368 in²) and v06 |
| `tick-size-not-pinned` | tick overlap after the script, 19 places |
| `replay-warns`, `engine-change-ignored` | a layout warning, 14 places and k51 |
| `record-holds-functions`, `no-z-axis`, `inset-axes-skipped` | a crash (PicklingError); short and false green on the 3D scripts and f13 |
| `adjust-refreshes-record` (round 7, below) | stale on k11 at both sizes; f17 at 4 × 3 in |

Four survive, as their spec entries say: `helper-minor-ticks` (minor tick labels are noted, not judged), `helper-failure-breaks-save`, `end-returns-pyplot` and `warning-as-error-breaks-save`, each falsified by hand in matplotlib with the numbers in the spec. The checker's own `later-saves-dropped` and a save renamed or written to a buffer go red on the saves rule; a timed-out run exits 2.

**Round 7: a layout record refreshed by `subplots_adjust` (k11).** The fresh control found a defect of the fix. k11 is a seaborn jointplot whose labels are set after the jointplot's own `tight_layout`, then a suptitle and `subplots_adjust(top=0.92)`. On the sixth shape it clips 0.433 in² at 6 × 4.5 in and 0.67 at 4 × 3, where the original clips 0.048 and a fresh layout 0 (found by v6.1's check; reproduced by the lead, MEASURED, the same numbers). The ideal and raised-first controls clip the same, which is why the grid could not flag it. The cause: the helper's `subplots_adjust` wrapper refreshed the layout record, so the labels added since the `tight_layout` no longer made it out of date, and nothing replayed it. A `subplots_adjust` lays out no text; the wrapper now only appends the step.

- **Before and after (MEASURED, v6.1's whole run on each):** k11 clipped 0.433 → 0 and 0.67 → 0 in². f17 at 4 × 3 in: the figure legend over a panel 0.304 → 0.104 in² (the ideal 0.142) and crossing 0.039 → 0, so its known entry, put down to legend titles, went stale: most of that cost was this record, not the title. The flagged lists differ in those three lines only.
- **Falsified:** `adjust-refreshes-record`, which puts the refresh back, survives the unit tests (the Python never runs there) and is red in the harness on k11 at both sizes (0.433 and 0.67) and on f17 at 4 × 3 in (0.304).
- **A sibling, not this cause:** the record counts only centre titles, axis labels, legend and figure texts (R6C-07), so a text of another kind changed after the layout still leaves it out of date (section 10).

**Two flags left at 4 × 3 in, and why they are known (round 7's probe and its skeptic; MEASURED by them, the skeptic with an ink instrument of its own).** The sixth version's stale rule flagged f10 (crossing 1.131 in² against a fresh layout's 0.918) and f26 (0.329 against 0.274). The fix replays the script's own layout faithfully: from the same starting layout, the fixed and the fresh scripts end identical in 22 of 22 pairs (the skeptic's sweep of 11 starts each). The difference is where the single `tight_layout` pass starts. In the fixed script the script's own layout ran at its explicit 8 pt sizes, which the fix raises only at the save; in the fresh control it ran at the needed sizes. One pass from each ends in a different place: on f10 because of an aspect-locked image, on f26 because of an x tick at the panel's right edge. Neither pass is settled: a second gives f10 0.638 against 0.599, and f26 0.273 against 0.274. The direction is not systematic: with `xlim(0, 5)`, f26's fix crosses 0 and the fresh control 0.238. The legend title adds nothing (left at 10 pt, f26 still crosses 0.329). A helper that raised the explicit sizes before the script's own `tight_layout` lands exactly on the fresh control (4 of 4; a probe, not the fix). Both flags are on the known list, and the two ways to close them are on the Later list (section 10).

**The known list on the fix (harness v6.2, 20 entries, each at its recorded figure):** b10 at both sizes (R2-08); f03 at 6 × 4.5 in (R5-01); f32 at 4 × 3 in, its layout warning and its crossing (1.394 in², the legend-title owner call); k35 (R4-09), k48 and f24 at both sizes; k24 at 4 × 3 in (the needed sizes do not fit three panels in a row); g13 and s09 at both sizes (R6P-05, R6M-06); a01 and a02 at both sizes (R6C-03). Their reasons are in section 10. v6.1 took f15 and f30 at 6 × 4.5 in off: the ideal clips the same, so their cost is the sizes', not the fix's.

**Totals (MEASURED, harness v6.2, matplotlib 3.10.8; defects / known / stale known):** the fix (round 7) 0 / 22 / 0, exit 0; the sixth shape 5 / 20 / 0 (k11 at both sizes, f10 and f26 at 4 × 3 in, f17's grid at 4 × 3 in); the fifth shape 38 / 20 / 0; the fourth (`fix13-frozen-c10`) 54 / 15 / 5; main 167 / 1 / 19.

**The gate on round 7 (MEASURED, instrument `60380f74b203ee83`, 45 scripts × 4 sizes, 180 page runs, every control held):** `GATE fp=38 rcfp=10 L=0 run=0 ffw=81 rcffw=0`, F 0 of 127, no run red without a fix offered: the same line as the fifth shape's. Exit 1, for `fp` and `rcfp`, part 2's.

**Mutants (TESTED):** control 195 of 195; 42 of 42 killed; 21 documented blind spots, all the helper's Python, `adjust-refreshes-record` new.

**Tests (TESTED):** 3016 of 3016 in 180 files; `tsc --noEmit` clean.

## 8. Results after the fix

The seventh shape (round 7), as committed. The numbers and their controls are under "The harness's sixth version, and round 7" (section 7); in short:

- **The gate (MEASURED, instrument `60380f74b203ee83`, 45 scripts × 4 sizes, every control held):** `GATE fp=38 rcfp=10 L=0 run=0 ffw=81 rcffw=0`, F 0 of 127, no run red without a fix offered. Main: `fp=38 rcfp=10 L=63 run=8`, F 44 of 129 (the step table in section 7). The gate script exits 1 because `fp` and `rcfp` are not 0. Both are the parser's first-check misreads, part 2 (section 10).
- **The shape harness, sixth version (MEASURED, `checker-shape-check.mts --layout`, matplotlib 3.10.8):** 0 / 22 / 0, exit 0 on the fix. The 20 known entries are limits listed in section 10.
- **Two fixed scripts in one Python (MEASURED, the harness's chains):** no flag on the fix; the exact pair saves `[[17], [25]]`, each script at its own need, and rcParams are matplotlib's own afterwards.
- **Mutants (TESTED):** control 195 of 195; 42 of 42 killed by the unit tests; 21 documented blind spots, all the helper's Python: 17 falsified by the shape harness, 4 by hand in matplotlib (section 7).
- **Tests (TESTED):** 3016 of 3016, 180 files; `tsc --noEmit` clean.

## 9. Review of the fix

Step 9 ran in rounds, each on a frozen copy, each reviewer with an instrument of its own; the findings, their reproduction and what changed are in section 7:

- round 1, the first shape: S9-01 to S9-15;
- round 2, the redesign: R2-01 to R2-14;
- round 3, the third shape: R3-01 to R3-10;
- round 4, the fourth shape: R4-01 to R4-16;
- round 5, the fourth shape, which led to the fifth: R5-01 to R5-14;
- round 6, the fifth shape, which led to the sixth: R6C, R6P and R6M findings, eight skeptics and a critic;
- the harness's sixth version, built in three steps, each with an independent check; the check of its second step found round 7's defect (k11).

Step 10, the independent review before merge, is waived. On 2026-09-30 the owner set the review budget at three reviews for important feature logic and one for a simple feature, after this fix and fix 04 had run far past it. This fix had seven step 9 rounds, each with skeptics and a critic, and three builds of its harness, each with an independent check; round 7's one-line change is falsified by its mutant in the harness (section 7).

## 10. Limits and follow-ups

**Part 2: the parser (the next branch on item 13).** This part changes what the fix does and what the re-check reads. The first check's own misreads stay, and the gate still counts them:

- `fp` 38 and `rcfp` 10: sizes the script sets that the parser does not read as matplotlib does (the `mpl.rcParams` alias, `plt.rc`, keyword setters, sizes held in names, named sizes, and when a setting takes effect) and the tick model (0.83 × where matplotlib uses 1.0 ×). Hypotheses H2 to H4, section 2.
- R2-10, R5-04 and R6P-07: the checker assumes a 6.4 × 4.8 in canvas where the saved one is wider: seaborn's figure-level grids, which size themselves, and any save with `bbox_inches='tight'` and an artist outside the figure (s12, a figure legend outside: the saved canvas 8.786 in wide, the title at 13.66 pt, 18 texts under the minimum, the page all-pass; f17: 8.617 in). Once the legend is born at size, the canvas widens further (f18: 5.98 → 6.578 in on the fifth shape; 6.99 on the fourth), so the text prints smaller than the page says (the reviewer's numbers, MEASURED by it).
- The page's base-size fix, not the helper, rewrites a `font.size` the script set to 26 or 22 down to 18, so g28, g40 and g41 print text lower than their original at 6 × 4.5 in (round 6's skeptic-mpl-1, MEASURED by it).
- R5-13: text sized inside `rc_context` is read as passing.
- R2-08: b10, a script that opens with a string continued over lines (`"""…""" \ .upper()`), crashes once fixed (IndentationError): the block is placed inside the continued statement. Contrived.

**Accepted limits of this part** (the harness's known list holds every one it can measure, with its figure):

- **f03:** the script raises `font.size` (to 22) after the figure is made and before its title and legend exist. Postr set those sizes as numbers when the figure was made, so they no longer follow `font.size`: at 6 × 4.5 in the title prints at 20 pt where the script alone draws 26.4, and the legend at 15 where it draws 22 (MEASURED, `shape_truth.py`). Both are at the size asked for, so nothing is under its minimum; the text is only smaller than the script meant. At 4 × 3 in the need is above the script's sizes and it passes.
- **A figure the script keeps small is raised too** (R4-09, R5-07). The install is process-wide in one Python: k35's diagnostics sheet, saved at 3 × 3 in, is raised with the main figure and its text crosses (0.897 in² at 6 × 4.5 in). In a notebook, figures made in later cells are raised by the wrap and write Postr's sizes into rcParams again (after a plain later cell: 20, 20 and 15 pt; R6P-08, the reviewer's numbers); rcParams are given back at the end of the fixed cell.
- **Layouts the script fixed by hand.** f24 sets its gridspec's spacing after the layout, and k48 places a panel after it. Text the script sized itself is raised at the save and overflows; the fix does not invent a layout the script did not ask for (f24 0.328 in² clipped and 1.194 crossed, k48 0.183 clipped, at 6 × 4.5 in). f24's replay runs and changes nothing: `tight_layout` skips a gridspec whose spacing was changed, and the warning that says so is one the replay filters (R6C-11). On main these scripts keep their text too small instead, which the re-check shows (R6P-06: f24 52 texts under on main). f15 and f30 left the known list: a script sizing its own text in the same layout clips the same.
- **A hand-placed Axes next to a grid panel** (R6C-03). a01 places its colorbar's Axes from its panel's position, and a02 a zoom inset; when the replay moves the panel to make room for grown text, they stay where the script put them: a01's colorbar 0.28 in (6 × 4.5) and 0.51 in (4 × 3) off its panel, a02's inset 0.25 and 0.222 in (relative to the other Axes, the harness's moved rule). The fourth shape did not replay there and clipped the text instead (0.296 and 0.398 in²). A trade-off against clipped text; the fix keeps the replay.
- **A colorbar shared by several Axes, added after `tight_layout`** (R6P-05, R6M-06). It moves the panels off their grid places, so the layout is not run again: a replay would put the panels back over the colorbar. Text the script sized itself, raised at the save, crosses and clips, and the page shows all-pass: s09 clips 0.716 in² and crosses 0.421 at 6 × 4.5 in (a script sizing its own text: 0.019 and 0.039), and 3.186 and 1.297 at 4 × 3; g13 crosses 0.1 (0) and, at 4 × 3, clips 0.677 and crosses 0.33. Main keeps the text small (s09: 33 texts under).
- **Legend titles are raised with legend text.** They are not a class the checker lists, so this is a policy, not a measurement, and the owner's to change (the Later list): seaborn's hue legends carry the variable's name as their title, which is why it is raised. Its cost, measured by round 6's critic (`layout_truth.py`): f32 at 4 × 3 in (a constrained layout with a legend outside two panels) crosses 1.394 in² with the title raised, against 0.208 with it left at 10 pt; constrained layout warns that it cannot fit. f17's cost at that size was mostly round 7's record, now fixed (0.104 in², below a script sizing its own text, 0.142).
- **k24 at 4 × 3 in:** the needed sizes (41 and 32 pt on its 9 × 3 in canvas) do not fit three panels in a row. The replay of its out-of-date layout brings the clipped text in (clipped 0, where a script sizing its own text clips 1.813 in²), and it crosses 1.136 in², the same as a fresh layout of the script's own calls.
- **One layout pass from the script's own start** (f10 and f26 at 4 × 3 in). The fix raises explicit `fontsize=` values at the save and replays the script's own `tight_layout` once, from the layout the script made at its small sizes. At the needed sizes `tight_layout` is not settled in one pass, so the result depends on that start: f10 crosses 1.131 in² and f26 0.329, where one pass from a layout made at the needed sizes gives 0.918 and 0.274 (a script sizing its own text: 1.505 and 0.348). Two ways to close it, neither measured on the whole set (the Later list): raise explicit sizes before the script's own `tight_layout` as well (0.918 and 0.274), or replay until the layout stops changing (two passes: 0.638 and 0.273; a settled f10 is worse, 0.757).
- **What counts as out of date** (R6C-07). The layout record counts centre titles, axis labels, legend and figure texts. A label replaced, tick labels replaced, a left or right title, an inset's title, a 3D z label or a subfigure's text changed after the layout leaves it out of date and not replayed: a03 (panel letters added after `tight_layout`) clips 0.0654 in² against the original's 0.0187, and a06 (tick labels set after it) 6.77 against 2.65 (the reviewer's numbers; the fourth shape measured the same).
- **A figure made inside `rc_context` whose Axes come after the context** (R6C-12): its labels are born at the context's sizes (10 and 12 pt against a need of 17 and 20) and raised only at the save. The fourth shape behaves the same.
- **The replay's warnings** (R6C-10). It runs under `catch_warnings`, which resets Python's once-per-place record: a warning of the script's own, raised in a loop, prints on every pass (w02: 4 times against once in the original) and points at the helper's line.
- **A figure shown with `display(`** under any name withholds the re-check's credit (round 6), since the helper raises nothing on the display path: in a notebook the displayed image keeps the script's sizes (7.39 pt at 4 × 3 in), and a `poster_figure.png` saved after it holds no text (the reviewers' numbers, MEASURED by them).
- **n29 at a small canvas:** at the size asked for, the raised text does not fit one row of three panels on a 3 in canvas; main collides the same.
- **R4-10:** the block imports matplotlib before any environment setup the script does first (`MPLCONFIGDIR`), the reviewer's numbers.
- **R3-07, R4-12:** `plt.show, x = …` (a show handed on inside a tuple assignment) does not compile once fixed.
- **R5-10:** the wrap's state lives on the Figure class so a library that wraps `savefig` after the install keeps its wrapper. INSPECTED only; not measured with a real library.
- **R4-16:** the replay's cost per animation frame (about 18 ms on round 4's shape) was not timed again; the replay runs only when a save grew a text or the layout is out of date.
- **Versions:** the seventh shape is measured on matplotlib 3.10.8 only. Round 6's reviewers ran the fifth shape on 3.9.2 too (0 of 146 runs differed), and round 4's the fourth. The relayout needs 3.6 (`get_layout_engine`, read through `getattr`); older versions are not installed here (UNVERIFIED).

**The harness's own limits** (its sixth version; the checks of v6.1 and v6.2, MEASURED or INSPECTED by them):

- Minor tick labels are noted ("raised, not listed"), not judged: the mutant that leaves them small is falsified by hand in matplotlib.
- The moved rule's 0.05 in of slack comes from this tree's own gap (0.006 against 0.222 in), not from a stated bound. An Axes that is its figure's only one, or whose move every other Axes shares, cannot be judged by it.
- The fresh control shares the fix's replay policy, though none of its code: at a replayed save it shows whether the fix applied that policy, not whether the policy is right. The grid bounds every save by the ideal.
- A known grid entry for a script with no fix offered can never go stale: the layout loop skips such a script before judging it (not seen on the fix).
- Saves made from threads (k27) are compared by position, and their order can differ between runs (values about 0.19 in², under the slack).
- The same-process chains' 1 pt slack is not set from data; every difference on the fix is 0.
