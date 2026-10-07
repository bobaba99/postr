# Fix 13b — the plot checker reads sizes by a rule table and hands back a script to use

**Plan item:** 13, part 2 · **Branch:** `fix/13p2-checker-sizes` (off main `f554eaa`) · **Status:** implemented; review rounds 1 (code review on `fix13p2-frozen-1`), 2 (a new angle, on `fix13p2-frozen-2`) and 3 (a re-check, decision 7: a result the user relies on, on `fix13p2-frozen-3`) done and answered (section 9)

Part 1 is `docs/fixes/13-checker-reads-its-own-fix.md`. This record follows the
fix process: reproduce, hypothesis, measure, shared cause, fix, audit. Every
claim carries how it was checked: MEASURED (a number from a re-runnable
harness or a red-then-green test), TESTED (the suite passes with a test that
fails without the change), INSPECTED (read, nothing run) or UNVERIFIED
(another agent's finding, or mine, not run by me).

## 1. Symptom

The owner, 2026-10-07: "I'm more concerned about the plot readability
feature, why is this so hard? This should be simple math and replacement
script, why is this so buggy? I envision it takes in the canvas size then map
a fixed formula onto the input code, regex find the font size and other
relevant code, then calculate, with the recommended values, just replace and
share the updated code no?"

What a researcher meets on main (`f554eaa`), MEASURED by the committed gate
extended to 88 Python scripts (`scripts/checker-truth-check.mjs`, every
original and corrected script run in matplotlib 3.10.8 and seaborn 0.13.2,
instrument `0d4f9e24695c9f06`) and by the new R gate on 31 ggplot2 scripts
(`scripts/checker-r-truth-check.mjs`, ggplot2 4.0.3), 4 print sizes each:

- **The first check passes text that prints too small:** 180 of 1348 drawn
  Python elements are ✓ where the real figure is below its minimum, and 93 of
  612 R elements.
- **The all-pass banner shows over a failing figure** on 55 of the 123 Python
  runs that show it (for example `c-colorbar` at 10 × 7 in: axis titles shown
  at 26.3 pt, real 14.58 pt).
- **The corrected script does not fix it:** the re-check is ✓ where the real
  render of the corrected script is not on 123 Python and 77 R elements; the
  corrected script leaves a text short in 25 of 229 Python and 24 of 82 R runs.
- **The fix lowers text:** the R fix sets 31 element-runs smaller than ggplot2
  draws them. The one-number advice ("Or change one number: font.size = N")
  names a number below the script's own on 22 of 229 Python runs and 10 of 82
  R runs; doing it lowers 61 Python and 41 R element-runs, and on 36 and 17
  runs it lifts nothing.
- **False fails:** 109 Python and 40 R elements are ✗ or ⚠ where the real
  figure passes.

## 2. Hypotheses

The reproduction and its confirmation (other agents, before this branch;
`scratchpad/item13p2-repro-confirm.json`, UNVERIFIED by me except where I
re-measured main above) found the misses by idiom and argued over the cause:
the reproducer named one cause, "the parser reads a size only from literal
spellings"; the confirmer (verdict PARTLY) showed that a measured share of
false passes come from sizes the parser does read, applied in the wrong
order, to the wrong objects, or with the wrong library model.

| id | claim | prediction |
|---|---|---|
| H1 | Sizes are read as a bag of literal spellings, with no position: order (a seaborn `set_theme` after `font.size`, a complete `theme_*()` after `theme()`), read time (an axis label takes `axes.labelsize` when its Axes is made, a title when it is set), per-object scope (`set_xlabel` on one Axes) and library models (seaborn contexts write absolute sizes; ticks are 1.0 × `font.size`; ggplot2's caption is 0.8 × its title) are invisible. | A reader that keeps each match's position and applies the last one that takes effect, with the override rules written down, takes the first-check false passes to 0 on the corpora. |
| H2 | The canvas is taken as given where the code does not give it (a seaborn figure-level grid sizes itself; `bbox_inches="tight"` crops the save; a notebook's display crops it), silently. | Those runs' scale differs from the real one; marking the scale and fixing the canvas in the script removes the misses. |
| H3 | The fix writes settings that cannot win (rcParams under an explicit `fontsize=`; an R `theme()` placed before a later complete theme, inside a string, or on `theme_update(`), so part 1 needed a runtime helper. | Editing the winning occurrence in place, and putting R's `theme()` in the plot `ggsave()` saves, takes F and the re-check false greens to 0 with no helper. |
| H4 | The advice takes no floor and no account of what follows the base. | Flooring at the script's own base and hiding it when it lifts nothing takes SNIPLOW, SNIPL and SNIPNOOP to 0. |

The owner's design (binding, 2026-10-07; quoted in substance in
`scratchpad/item13p2-decisions.md`): a bounded, explicit rule table read by
regex with each match's character position; the last one that applies wins,
with the override rules written down; a setting the code leaves out is warned
with the default assumed and set explicitly in the generated script; the
generated script is the user's own with values replaced at the winning
occurrence, the missing settings inserted where they take effect, the save at
a fixed size; "Replace your code with this version"; working code with wrong
sizes is assumed, and loops, `rc_context` scoping, threads and many-figure
notebooks are out of scope; plain edits over machinery.

## 3. Method

**Entry points.** The public page `/tools/figure-readability` (and `/fr`) and
the editor's Figure › Check a figure, both `poster/ReadabilityPanel.tsx`. The
tests enter where the user does: `src/pages/__tests__/figureReadabilitySizes.test.tsx`
types the size, pastes the script, presses ▶ Check and reads the table, the
warnings, the fix and the copied script; the browser gates do the same in
Chromium and run the copied script.

**Instruments (committed with this record).**

- `scripts/checker-truth-check.mjs` (Python gate), extended: the corpus from
  45 to 116 scripts (`fixtures/checker-corpus/`: the reproducer's `p2-*`, the
  confirmer's `c-*`, review round 1's `r1-*`, review round 2's `r2-*` and
  review round 3's `r3-*` partitions), a row with a missing-setting mark (`*`)
  counted apart (`fpU`, `rcfpU`: unwarned), the scale also judged against the
  image the save writes (SAVED, `truth/mpl_truth.py --png`), notebook exports
  run as a notebook runs them (`--notebook`, NB), and the editor's check
  against the picture an image block prints (EDIMG). Review round 1 added
  claim CUT (a text the original's image holds, more than half outside the
  image the corrected script writes; truth `texts`, self-test C2), counted
  where the original's image is a crop and INFO (`cutPlain`) where it is the
  canvas, and scores a corrected script that saves an explicit box against
  that box. Review round 2: the truth counts `fig.supxlabel` and
  `fig.supylabel` as axis titles (self-test, falsified: without it the
  self-test reads 12 pt for an 8.5 pt sup-label) and measures the image
  PdfPages' `savefig` writes (it passes `backend='pdf'`, which the PNG
  re-save could not take).
- `scripts/checker-r-truth-check.mjs` (R gate, new): 61 scripts
  (`fixtures/checker-corpus-r/`, review rounds 2's `r2-*` and 3's `r3-*`
  among them),
  `truth/gg_truth.R` reads every text grob's
  size from the plot ggplot2 builds (`ggplotGrob`), never from the script;
  since review round 1 its `ggsave()` recorder also calls the real
  `ggplot2::ggsave()` with the arguments as bound (self-test D: a plot bound
  to `device` is an error). Review round 2 (self-test E): a gtable
  (gridExtra's `arrangeGrob()`) is measured as it is and the plots inside a
  cowplot figure are classed by their own cells (before, the first raised
  "no applicable method for ggplot_build" and the second read every axis
  text as in-panel text), a NULL plot (`gtable + theme()`) is the script's
  error, and `png()`/`pdf()`/`tiff()`/`jpeg()`/`bmp()`/`svg()`/`cairo_pdf()`
  then `print(p)` is measured with the device's size; on the 36 scripts of
  round 1 its output is byte-identical to before (36 of 36, MEASURED). The
  GATE-R line splits L into `Lsrc` (a size written below what ggplot2
  drew) and `Llost` (a verdict lost); the rest of L is text printed smaller
  only because the edited script sets a canvas it could not read. Review
  round 3 (self-test F): the runner runs a script as Rscript does, a visible
  value printed (autoprint), records `grid.arrange()` and ragg's devices, and
  closes the device at `dev.off()`; on the 46 scripts of round 2 its output
  is byte-identical (46 of 46, MEASURED).
- `scripts/lib/checkerPage.mjs` drives the page for both gates;
  `allowClipboard` lets Firefox and WebKit read the page's clipboard (an init
  script records what the page hands to `navigator.clipboard.writeText`).
- `scripts/checker-shape-check.mts` (part 1's matplotlib shape harness), now
  reading every module of the checker and run with `--no-same-process`;
  since review round 1 `truth/layout_truth.py` judges text against the image
  each save writes (a tight crop, an explicit box, or the figure) and adds
  `cut_in2` (every text, legends and figure texts too).
- `docs/fixes/13b-checker-sizes.mutants.json` with `scripts/mutation-check.mjs`.

**Controls (every gate run).** K-truth (known sizes read back by the truth
runners, `--selftest`), control C (372 Python and 280 R control element-runs
and every scale match the real render), K-known (scripts the checker reads
right stay unflagged), K-page (every check renders a table and copies what it
shows; every original runs). All held on every run quoted here.

**Falsification.** The entry tests run on main: 26 of 27 fail (MEASURED;
the one that passes, "is offered above the script's own font.size when rows
that follow it fail", is a control main also meets). Review round 2's
entry tests (`figureReadabilityReview2.test.tsx`) on round 2's code
(`fix13p2-frozen-2`): 26 of 28 fail; the two that pass (a colorbar named
`cbar = ax.collections[0].colorbar` beside `plt.xticks()`, and a loop over
`fig.axes`, Axes the check cannot name) guard parts of the change against
their mutants, and round 2's code also meets them. Review round 3's tests
(`figureReadabilityReview3.test.tsx`, `readabilityReview3.test.ts`) on round
3's code (`fix13p2-frozen-3`): 32 of 35 fail; the 3 that pass (a passing
`fontdict=` the check cannot see into, a reassignment inside a block, and
`p$theme` in Postr's own floor) guard parts of the change against their
mutants.

## 4. Results before the fix (main, MEASURED)

Python, 88 scripts × 4 sizes, 352 page runs, 1348 drawn elements, instrument
`0d4f9e24695c9f06`:
`GATE fp=180 rcfp=123 L=0 run=0 ffw=109 rcffw=0 | SAVED fpU=41 rcfp=107 | F=25/229`.

- First-check false passes by cause (the manifest's owner of each script):
  W2 18 (per-element rcParams keys), FIGLEVEL 21 (seaborn figure-level grids),
  SNS-RESET 20 (a size set before seaborn resets it), MULTI 15 (several Axes),
  UNITS 14 (canvas in cm/mm or arithmetic), CTX 14 (`rc_context`), SNS-CTX 12,
  OO 10 (object setters), RESET 10 (`rcdefaults`), SK2 10, VAR 8 (a size in a
  name), C 5, READTIME 5 (an axis label made before `font.size` changes), SK 5,
  SUPT 3, T 2, SA 2, SR 2, STYLE 1, other 3.
- False fails by cause: T 19 (ticks at 0.83 ×), SA 16, SR 15, W2 14, UNITS 10,
  STYLE 6, READTIME 5, TIGHT 3, MULTI 2, NB 2, G 2, OO 1, SNS-CTX 1, SUPT 1,
  other 12.

R, 31 scripts × 4 sizes, 124 runs, 612 drawn elements:
`GATE-R fp=93 rcfp=77 F=24/82 L=31 ffw=40 rcffw=0`; by cause R-ORDER 37 false
passes of 60 (a complete theme or `theme_set` order), R-TEXT 14 (`theme(text=)`,
`theme_update(text=)`), R-CANVAS 14 (`ggsave(scale=)`, units), TITLE 11
(`theme(title=)`), TEXT 8, POS 5 (positional `base_size`), R-POS 2, R-STRIP 2;
RCAP: the caption at 0.67 × instead of 0.8 ×; R-FIXPLACE: the fix inside a
string or on `theme_update(` (rc-fix-in-string).

## 5. Independent confirmation

Before this branch, by other agents (UNVERIFIED here, quoted as found): the
reproducer reproduced every sub-item on main through the user's entry; the
confirmer reproduced them on a disjoint partition of 31 Python and 20 R
scripts and widened the cause (section 2). Both partitions are in the
committed corpora, so the gates above re-measure them.

## 6. Root cause

**One cause behind H1, H3 and H4:** the checker had no model of the settings.
It matched a few literal spellings with no position, so it could not apply
"the last one that takes effect wins", the resets (seaborn, `rcdefaults`, a
complete `theme_*()`), the read point (Axes creation or call), per-object
scope, or the library's own sizes; and the generator, writing rcParams or a
`theme()` after the user's code, could not beat what the code set, which part
1 papered over with a runtime helper. The rule table with positions (section
7) is that model; the generator edits the occurrence the model says wins.

**Separate causes this does not explain:**

- **H2, the canvas.** For a seaborn grid with facets or a legend outside,
  a tight save and a notebook display, the printed scale is not in the code
  at all; no reader can fix it, only the script can (it sets the size and
  saves the whole figure).
- **The editor's image block.** The panel scored against the block, while a
  side caption takes 35 % of its width and the frame a unit each side
  (`poster/imageBox.ts`); EDIMG measured the drawn picture's width (8.97 of
  14 in for a 140-unit block with a side caption).
- **The minimums** (18/18/14/14/12, warn 0.85) are decision 1 and unchanged;
  the shared module is stream Q's.

## 7. Fix

### The Python rule table (`readabilityPyRules.ts`, `readabilityPyText.ts`; the same table is the file's header)

| rule | idiom (any alias: `plt.`, `mpl.`, `matplotlib.`, bare) | sets | overrides / notes |
|---|---|---|---|
| P1 | `rcParams['key'] = v` | key | earlier writes of key |
| P2 | `rcParams.update({...})`, `update(dict(...))`, `update(NAME)`, `update(**d)` | each key | same |
| P3 | `rc('font', size=)`, `rc('font', **font)` (round 1), `rc('axes' / 'xtick' / 'ytick' / 'legend' / 'figure' / 'savefig', ...)` | the matching keys | same |
| P4 | `rc_context({...})`, `rc_context(rc={...})` | each key, from its position | the end of its with-block is not tracked (out of scope) |
| P5 | `sns.set_theme`, `sns.set`, `sns.set_context` (context, font_scale, rc; positional as seaborn 0.13.2 orders them: `font_scale` fifth in `set_theme`, round 1) | every font key, absolute | resets every per-element size set before it |
| P6 | `rcdefaults()`, `sns.reset_defaults()` | every key to its default | resets everything before it |
| P7 | `style.use(name)`, `style.context(name)`: matplotlib's 11 built-in sheets that set sizes or a figure size | the sheet's keys | an unknown sheet: warned |
| P8 | a figure or Axes made: `subplots`, `figure`, `subplot`, `subplot_mosaic`, `axes`, `Figure()`, `add_subplot`, `add_axes`, `inset_axes`, `twinx`/`twiny`, `colorbar`, implicit pyplot, seaborn axes-level or pandas plotting; a colorbar seaborn or pandas makes (`sns.heatmap` unless `cbar=False`, `histplot`/`kdeplot(cbar=True)`, `df.plot.scatter(c='column')`, `df.plot.hexbin()`; round 2), named by `NAME = ....colorbar` | Axes made here read `axes.labelsize` and `x/ytick.labelsize`; a colorbar's Axes is never the current one (`plt.`) | `figsize=` on the call |
| P9 | `set_size_inches(w, h)`, also `w=`, `h=` | the canvas | the figure's `figsize` and `figure.figsize` |
| P10 | seaborn figure-level grids: `relplot`, `catplot`, `lmplot`, `displot`, `jointplot`, `pairplot`, `FacetGrid`, `PairGrid`, `JointGrid` | the canvas from `height` × `aspect` when no facets or legend size it | `g.savefig` crops with `bbox_inches='tight'` unless told otherwise |
| P11 | `savefig(bbox_inches=)`, `rcParams['savefig.bbox']`; a notebook's `show()`; PdfPages' `pdf.savefig(fig)` saves `fig` (round 2) | whether the saved image is the canvas | tight: the printed scale is unknown |
| P12 | titles: `set_title`, `title`, `suptitle`, `ax.set(title=)`, `g.set_titles`, `ax.title.set_fontsize` | plot title (`fontsize=`, `size=`, a `**` dict holding one, `fontdict=` inline or in a name; round 1); one title per `loc=` (`center`, `left`, `right`): a panel letter is a title of its own (round 2) | an explicit size beats rcParams; a fontdict with no size sets none; read at the call |
| P13 | axis titles: `set_xlabel`/`set_ylabel`/`set_zlabel`, `xlabel`/`ylabel`, `ax.set(xlabel=)`, `g.set_axis_labels`, colorbar `set_label` and `colorbar(label=)`, a colorbar label seaborn or pandas draws (`cbar_kws={'label': ...}`, scatter's `c=` column; round 2), `ax.xaxis.label.set_fontsize`; `fig.supxlabel`/`supylabel` (round 2: listed here before, not read) | axis titles | explicit beats rcParams; rcParams read when the Axes is made; a sup-label reads `figure.labelsize` (`'large'`) at the call |
| P14 | tick labels: `tick_params` / `set_tick_params(labelsize=)` (axis x, y, z; or in a `**` dict, round 1), `xticks`/`yticks(fontsize=)`, `set_xticklabels(fontsize=)`, `set_xticks(labels=, fontsize=)`, `setp(get_*ticklabels(), fontsize=)`, `for t in ...ticklabels(): t.set_fontsize(n)`, pandas `df.plot(fontsize=)` | tick labels | explicit beats rcParams, read when the Axes is made |
| P15 | legends: `legend`, `figlegend`, `fig.legend` (`fontsize=`, `prop=` a dict or a `FontProperties`, inline or in a name; round 1; a `FontProperties` called by an alias an import gives it, `as FP`, round 3), seaborn hue legends, `g.add_legend`, `sns.move_legend` | legend text | explicit beats rcParams; a prop with no size takes `legend.fontsize`; read at the call |
| P16 | captions: `fig.text`, `figtext` (`fontsize=`, `size=`) | caption | `font.size` at the call |
| P17 | `NAME = number`, arithmetic, `'named size'`, `{dict}`, `(w, h)`, tuple assignments | a value names refer to | its last assignment before the use |
| P18 | Postr's earlier fix (part 1): `_POSTR_NEED = {...}` with `_postr_raise_text` | each class raised to at least that size | read so a script fixed before still checks |
| P19 | Postr's fit block (round 1): `set_size_inches(max(W / 10, f.get_figwidth() * W / poster_box.width), ...)` and a save with `bbox_inches=poster_box` | the canvas: the save writes W × H | the printed scale is then known |
| P20 | a loop over Axes (round 2): `for V in (a, b)` or `[a, b]`, `for V in X`, `X.flat`, `X.ravel()`, `X.flatten()` (X a subplots array), through `enumerate()` and `zip()` | a size set on V is set on each Axes it names | otherwise V names no Axes and its size is a text of its own (the smaller wins) |
| P21 | Postr's floor on a size it cannot read (round 2): `max(N, FontProperties(size=EXPR).get_size_in_points())`, or `max(N, float(EXPR))` on `font.size` (round 3: `max(N, EXPR)` before, which a string from a config file made a TypeError) | the size, at least N | read as N, unmarked; a later fix raises N and keeps EXPR |

Named sizes resolve against `font.size` at the read point (matplotlib's
`FONT_SCALINGS`); a seaborn context is the notebook base (font 12, labels and
titles 12, ticks and legend 11) × {paper 0.8, notebook 1, talk 1.5, poster 2}
× `font_scale`, written as absolute numbers; ticks are `'medium'`, 1.0 ×
`font.size` (part 1's 0.83 under-read every inherited tick label by 17 %);
captions 1.0 × `font.size`. The model (`readabilityPyModel.ts`) makes every
drawn text an instance with its size and the occurrence that decides it.

### The R rule table (`readabilityRModel.ts`, header of the same file)

| rule | idiom | sets | overrides / notes |
|---|---|---|---|
| R1 | `theme_<name>(base_size = v)` or `theme_<name>(v)` | a complete theme and its base | every `theme()` before it |
| R2 | `theme(elem = element_text(size = v or rel(r)))` | that element: `text`, `title`, every scored element and its `.x`/`.y` children | a later `theme()` for the same element; a child's own size beats its parent's |
| R3 | `theme_set(T)` | the global theme | replaced by a complete theme the plot adds |
| R4 | `theme_update(...)` | global theme elements, in order, after the last `theme_set()` | the plot's own `theme()` calls apply after it, wherever they are written (ggplot2 builds `get_theme()` + the plot's theme; round 1) |
| R5 | `ggsave(filename, plot, device, path, scale, width, height, units, dpi)` | the canvas: width × scale by height × scale, in units | the last `ggsave()`; arguments matched as R matches them, exact, then partial (`file =`), then position (round 1, `readabilityCalls.ts` `matchR`) |
| R6 | `element_blank()` | the element is not drawn | its row is left out; the fix never draws it back |
| R7 | `facet_wrap` / `facet_grid(rows, cols)` | which strips are drawn | |
| R8 | `name <- v`, `name = v` | a value names refer to | its last assignment before the use; a comment after the value is not part of it (round 2) |
| R9 | `geom_text`, `geom_label`, `annotate("text")`, `stat_summary(geom = "text")` size (mm) | in-panel text: a warning, not a row | |
| R10 | Postr's floor (round 1): `element_text(size = max(N, calc_element(leaf, complete_theme(p$theme))$size))`, written under a complete theme that is not ggplot2's and, since round 2, on a row resting on a `base_size` the check cannot read | that element, at least N | read as N |
| R11 | `png()`, `jpeg()`, `tiff()`, `bmp()` and ragg's `agg_png()`, `agg_jpeg()`, `agg_tiff()` (round 3) (`width`, `height`, `units`, `res`; pixels at 72 ppi by default), `pdf()`, `svg()`, `cairo_pdf()` (inches), then, before its `dev.off()`, `print(p)` or (round 3) the plot on a line of its own, which Rscript prints: a name, a name and operators, a `ggplot()` chain, `grid.arrange()` or another call that combines plots; with no `ggsave()` (round 2; `readabilityROutput.ts`) | the canvas, and the plot drawn | a size it cannot read is set to the size checked (`units = "in"`, `res = 300` for the pixel devices); a device whose plot the check cannot find (`plot(p)`) is said, and a `ggsave()` of `poster_figure.png` added (round 3) |
| R12 | a plot combining others (round 2; `readabilityROutput.ts`): `plot_grid`, `ggdraw` with `draw_plot`, `ggarrange`, `arrangeGrob`, `grid.arrange` (read since round 3: the scanner finds it as `arrange` on `grid`), `marrangeGrob`, `wrap_plots`, patchwork's `\|` `/` `+` on plot names with `library(patchwork)` | each plot it combines, read from its own assignments before it is combined and (round 3) the names they use (R15); per row the smallest | plots the check cannot name (made inside the call): every row marked, nothing written |
| R13 | `guide_legend(theme = theme(legend.text = , legend.title = ))`, `guide_legend(label.theme = , title.theme = )` and the colour-bar guides (round 2) | that guide's legend text and title | applied after the plot's theme and never reset by a complete theme; the row takes the smaller of the plot's and each guide's |
| R14 | `T %+replace% theme(elem = element_text(...))` (round 2) | the element, replaced whole | a size it leaves out comes from the parent, not the complete theme's `rel()` |
| R15 | a top-level `name <- value` whose value holds a theme call or uses a name that does: a theme object (`theme_fig <- theme_bw(16) + theme(...)`), a function that builds a plot (`make_panel <- function(d) ggplot(d) + theme_bw(16)`), a plot another is built from (`p2 <- p1 + labs(...)`) (round 3; `readabilityRNames.ts`) | its theme calls, placed where the name is used (the last use that reaches the plot read), three names deep | a name assigned again inside a block (`if (...) { p <- p + theme_bw(16) }`) is read in source order, as before; `p$theme` is a part of `p`, not a use; a combined plot's own assignments are read in place |

ggplot2 4.0.3's inheritance: `text` is `base_size`; `title`, `axis.title`,
`legend.title` inherit; `axis.text`, `legend.text`, `strip.text` are rel(0.8)
of `text`; `plot.title` rel(1.2) and `plot.caption` rel(0.8) of `title`
(main's 0.67 drew 10.05 pt where ggplot2 draws 12 at base_size 15, TESTED).
All ten of ggplot2's complete themes share these sizes, and `theme_void()`
blanks `axis.title` and `axis.text` (MEASURED with `calc_element()` on each
theme at base 10; round 1, P13B-R1-06).

### Idioms declared unreadable (a warning, the default assumed, and the script sets it unless it must not overwrite it)

Since review round 2 a size the code sets as an expression the table cannot
evaluate (a config value, `CONFIG['font_size']`, `cfg$base`) is "Not read
from your code" (its own legend line and row title, EN and FR), never
pinned at the default the check assumed: where it falls short the script
writes a floor read when it runs (P21 in Python, R10 in R), where it passes
it is left as written and the panel says to check it (P13B-R2-03). Since
review round 3 it is floored whether or not it falls short at the size
assumed (P13B-R3-03: one left as written there printed short under the
re-check's ✓); only a Python `fontdict=` the check cannot see into is still
raised only where it falls short (with a plain `fontsize=`), and left as
written where it passes. A size resting on a complete theme that is not
ggplot2's is read the same way since round 3: "Not read from your code", and
floored on every row.

Python (`readabilityPyModel.ts` `warningsOf`): a size the code sets in a way
the table cannot read (a call's result, a name it cannot resolve; since round
1 also a `fontdict=`, `prop=` or `**` value that is no dict or
`FontProperties` the table can see, and a `FontProperties` with no size:
these are left as written, their rows marked on every check, and the panel
says to check them by hand; a `fontdict=` of that kind still takes a
`fontsize=` keyword, which matplotlib applies after it); a style sheet it
does not know; a figure size it cannot read (replaced in the script); a
seaborn grid with facets or a legend outside (its size depends on the data);
a save with `bbox_inches="tight"` and a notebook's display (both crop to
another size). Each says what was assumed. R (`readabilityRModel.ts`):
`base_size` from a name it cannot resolve; a `ggsave()` width or height it
cannot read (replaced); unknown units; a complete theme that is not one of
ggplot2's (assumed to follow ggplot2's: since round 1 every size that rests
on it is marked on every check, and a row of it that falls short gets the
R10 floor; since round 3 every row resting on it, short or not); in-panel text (warned, not scored); since round 2 a device size
it cannot read (replaced) and a figure combining plots the check cannot
name (`plot_grid(ggplot(...) + ..., ...)`: every row marked and kept, a
warning, nothing written); since round 3 a device whose plot it cannot find
(`plot(p)`: a warning, and a `ggsave()` of `poster_figure.png` added). A size the code leaves out
is marked `*` in its row, the scale is marked `*` when the canvas is not
fixed by the code, and the legend explains the mark (EN and FR).

### The script it hands back

`readabilityFullFix.ts` `generateTargetedFullFix` returns '' when nothing
needs setting (`offersScript`), else:

- **Python** (`readabilityPyFix.ts`): each size below its need is replaced
  where the winning occurrence writes it (`fontsize=8` → `fontsize=16`, an
  rcParams value, a dict entry, a name's assignment); a size the code leaves
  out is set at the size checked in one `rcParams.update({...})` marked
  `# Postr: text sizes and canvas for this print size`, placed after the last
  reset before the text is made and before the figure when it can be (so the
  script's own `tight_layout` lays out the bigger text), at the figure's own
  indent and never before an `else:`, `elif`, `except` or `finally` (round 1);
  a caption gets its own `fontsize=`; `legend.title_fontsize` follows
  `legend.fontsize`; the canvas is set when left out (`figure.figsize`) and
  replaced when unreadable; a seaborn grid whose size the code does not give
  is set to the print size and saved whole (`g.savefig` given
  `bbox_inches=None`); a save cropped with `bbox_inches="tight"` (on the
  call, by rcParams, a known grid's `g.savefig`) gets the fit block before it
  and writes `bbox_inches=poster_box` (round 1); a script with no save gets
  one before its first `show()` (after the grid block for a grid, the fit
  block for a crop rcParams asks for or a notebook's display); a second fix
  adds its keys to the first block instead of stacking one. Each written
  value is the larger of the need and every size the same occurrence decides
  now, so never below the size the table shows. A size the check cannot read
  and must not overwrite is left as written; when nothing is left to set the
  page offers no script (`generateTargetedFullFix` returns ''). Review round
  2: a size the check cannot read is left as written where it passes; where
  it falls short, the `font.size` line it follows becomes
  `max(N, CONFIG['font_size'])` (N the need over the class's scaling), an
  unread value written in a call or a dict becomes
  `max(N, FontProperties(size=EXPR).get_size_in_points())`, and a key set
  for a class whose size the code sets unreadably (a seaborn context it
  cannot read) is inserted as
  `max(N, FontProperties(size=plt.rcParams['key']).get_size_in_points())`,
  with `from matplotlib.font_manager import FontProperties` added after the
  matplotlib import; each title loc, each sup-label and an implicit
  colorbar's ticks and label are raised like any instance; PdfPages'
  `pdf.savefig(fig)` gets the fit block on `fig`. Review round 3: every
  drawn size the check cannot read is floored, not only one that falls short
  (P13B-R3-03); the `font.size` floor is `max(N, float(CONFIG['font_size']))`
  (a config file gives a string, and `max()` cannot compare it with a
  number); FontProperties is imported by its own name (an `as FP` import does
  not bind it), after the first top-level matplotlib import or, with none,
  after a module docstring and any `from __future__` import (P13B-R3-02).
- **R** (`readabilityRFix.ts`): one `theme(...)` in the plot `ggsave()` saves
  (`ggsave("f.png", p +\n  theme(...), ...)`, or `plot = last_plot() +` when
  it has none), after every theme of the user's, never in a string (found in
  masked code) and never on `theme_update(`; the plot argument found as R
  matches arguments (round 1); it names only the elements below their
  minimum, a per-axis child when one axis or a pinned child falls short, and
  the root text size when no `base_size` is set and the complete theme is
  ggplot2's; a selector whose size rests on a theme that is not ggplot2's is
  set, by its drawn name, to `max(need, calc_element(...))` (R10, round 1); a
  `ggsave()` is appended at the checked size when there is none; an
  unreadable size is replaced (units "in", scale 1). Review round 2: a
  device's `print(p)` becomes `print(p +\n  theme(...))`, so the user's own
  file gets it; a figure that combines plots gets, before the first
  statement that combines them, one `p1 <- p1 +\n  theme(...)` per plot
  (`# Postr: text sizes for this print size, in each plot the figure
  combines`), each naming only that plot's elements below their minimum
  (a gtable plus `theme()` is NULL, so `ggsave()` wrote a blank image, and
  on cowplot's canvas the theme reached no plot); a size a guide gives its
  own legend is raised where it is written (a plot-level `theme()` does not
  reach it); R10 also covers a row resting on a `base_size` the check
  cannot read; a missing device argument goes in with `units = "in"` and
  `res = 300` for the pixel devices; with no `ggsave()` and no device the
  `ggsave()` added writes `poster_figure.png`, which the copy now names.
  Review round 3: a plot the device draws on a line of its own (`p`, a
  `ggplot()` chain) becomes `print(p +\n  theme(...))`, and one drawn with
  `grid.arrange()` is themed in each plot before it (P13B-R3-04); a device
  whose plot the check cannot find gets the `ggsave()` of `poster_figure.png`
  and a warning saying so; every drawn selector resting on an unread
  `base_size` or a theme that is not ggplot2's gets the R10 floor, short or
  not (P13B-R3-03); a theme held in a name or a function is read where it is
  used (R15), so the root `text =` size is no longer written over a
  `theme_bw(base_size = 16)` held in `theme_fig` (P13B-R3-01).

The copy says "Replace your code with this version", and the panel's legend,
fix title ("Set the sizes your code leaves out" when only assumed sizes are
set) and all-pass line say what is assumed (`i18n/readability.ts`, EN and FR;
the engine's new warnings in French in `i18n/readabilityWarnings.ts`; the
page's "How it works" in `i18n/figureReadability.ts` and `seo/routes.json`).

**The one-number advice** (`readability.ts` `baseAdvice`): only when a
failing element the figure draws follows the base (since round 2: a row
for text the script never makes, `FigureParams.undrawn`, does not count),
never at or below the script's own base,
and withheld when the classes that follow a base follow different settings,
the printed scale is unknown (a grid, a cropped save, a notebook, an
unreadable size; since round 1 a crop or a notebook decides this before a
default canvas does), the complete theme is not ggplot2's (round 1: its
base is unknown, and `theme_cowplot()` takes no `base_size`), or the figure
combines plots, each with its own theme (round 2).

### Plain edits over machinery: what is kept, and why

Part 1's helper (`_postr_raise_text`, the save-time raise and layout replay)
is gone. Four pieces of runtime code are kept, each where no plain edit can
know what it needs before the figure is drawn (the first from the build, the
second and third from review round 1, the fourth from review round 2,
section 9):

- for a seaborn grid, the block before its save (`poster_fig.set_size_inches(W, H)`,
  then `tight_layout(rect=...)` leaving the width the legend takes). Seaborn
  places a legend outside for the grid's own size: without the re-layout it
  covered the plots at the print size (k10, MEASURED by the shape harness
  during the build: at 6 × 4.5 in 0.619 in² of text under the legend before
  the block, 0 after; at 4 × 3 in 0.309 clipped and 1.176 under the legend
  before, 0.257 crossed and 0.007 under it after);
- for a cropped save (P13B-R1-01), the fit block: the figure resized until
  what it draws, with the pad, fits W × H at the save's dpi (at most 8
  steps, never below a tenth of the canvas), then `poster_box`, a W × H box
  centred on it, which the save writes. The extent of a legend, an
  annotation or a suptitle outside the plots is known only once drawn. The
  box, not the crop, writes the image: a crop alone stopped 0.03 in short
  (8.03 × 6 in for 8 × 6, MEASURED) where tick labels change with the width;
- for an R complete theme that is not ggplot2's (P13B-R1-05), the floor
  `max(need, calc_element(leaf, complete_theme(p$theme))$size)` on a row
  that falls short: the theme's sizes are known only to ggplot2 when the
  script runs (`theme_cowplot()` draws axis titles at 14 where ggplot2's
  base is 11). Since round 2 the same floor on a row resting on a
  `base_size` the check cannot read (`cfg$base`); since round 3 on every
  such row, short or not (P13B-R3-03);
- for a size the code sets as an expression the check cannot evaluate
  (P13B-R2-03), the P21 floor where it is written: `max(N, float(EXPR))` on
  `font.size` (round 3: `max(N, EXPR)` before; P13B-R3-02),
  `max(N, FontProperties(size=EXPR).get_size_in_points())`
  elsewhere (a size may be a named size, `'large'`, which `max()` alone
  cannot compare). A plain edit can only write a constant, and a constant
  below what the expression gives lowered the text: on round 2's code the
  config-dict script's four classes went 24 → 12, 20 → 11, 20 → 10 and
  20 → 10 pt (MEASURED). The floor is one expression on the user's own
  line, and P21 reads it back as N.

### How the shape changed during the build (MEASURED by the gates at each step)

v1 (rule table, plain edits): Python `fp=0 rcfp=0 L=12 ffw=8`, exit 2 (a
control failed: `ctl-tight-full` TIGHT-fix, observed 0 of 0 where the
manifest expected at least 1: the fix no longer saves tight, so the
manifest now expects at least 0); its 12 lowered element-runs were
`g-codegen-grouped` (a size in a tuple assignment, now read), legend titles
and two grids. v2: `L=7 ffw=3`; v3 (legend titles follow legend text):
`L=4`, the two grids of section 10; v4 and the final code: unchanged. R:
`fp=0 rcfp=0 F=0 L=0 ffw=0` from v1 on. The shape harness went from 48 defects (v1: loops, `cb.ax`, pandas
`fontsize=`, z labels and ticks, insets, colorbar labels) to 0, with the four
out-of-scope scripts listed (section 10).

## 8. Results after the fix

**After review round 3 (MEASURED, Chromium, the production page's code
served by Vite: 116 Python scripts × 4 sizes, instrument `1b025d31c909709b`,
and 61 R scripts × 4 sizes, each with review round 3's `r3-*` scenarios;
every control held: K-truth with self-test F (R), C 380 element-runs and 400
scales (Python) and 280 (R), K-known, K-page 510 of 510 and 244 of 244, 116
of 116 and 61 of 61 originals run).** Main is `f554eaa` (a copy of its
tree); round 3 is the code that review read (`fix13p2-frozen-3`); all three
measured with the same harness:

| | main Py | round 3 Py | now Py | main R | round 3 R | now R |
|---|---|---|---|---|---|---|
| first-check false passes (fp) | 201 | 10 | 10 | 126 | 9 | 6 |
| … with no missing-setting mark (fpU) | 201 | 0 | 0 | 126 | 3 | 0 |
| re-check false greens (rcfp) | 151 | 2 | 0 | 141 | 5 | 0 |
| … with no missing-setting mark (rcfpU) | 151 | 0 | 0 | 141 | 3 | 0 |
| corrected script leaves a text short or does not run (F) | 31 of 329 | 15 of 392 | 0 of 396 | 51 of 174 | 4 of 196 | 0 of 190 |
| corrected scripts that raise (run) | 0 | 15 | 0 | — | (in F) | 0 |
| element-runs lowered at print by the fix (L) | 0 | 5 | 5 | 78 | 54 | 15 |
| … R: a size written below what ggplot2 drew (Lsrc) / a verdict lost (Llost) | — | — | — | 68 / 2 | 31 / 0 | 0 / 0 |
| the corrected image cuts a text the original's crop holds (cut) | 0 | 0 | 0 | — | — | — |
| … from a canvas, INFO (cutPlain) | 10 | 13 | 17 | — | — | — |
| first-check false fails (ffw) | 151 | 17 | 16 | 86 | 55 | 22 |
| re-check false fails (rcffw) | 0 | 0 | 0 | 4 | 0 | 0 |
| against the image the save writes: unwarned false passes / re-check false greens | 43 / 141 | 0 / 0 | 0 / 0 | — | — | — |
| advice below the drawn base (SNIPLOW) | 29 of 329 | 0 of 153 | 0 of 153 | 23 of 174 | 0 of 119 | 0 of 110 |
| advice that lifts nothing (SNIPNOOP) | 36 | 0 | 0 | 22 | 2 | 0 |
| all-pass banner over a failing figure | 58 of 135 | 0 of 68 | 0 of 68 | — | — | — |
| editor image block: false passes (EDIMG, 40 checks) | 44 | 0 | 0 | — | — | — |

- **fp 10 (Python) and 6 (R)** are all rows marked `*` (fpU 0): sizes the
  code sets in a way the check cannot read (`r3-*` configs, a seaborn
  `font_scale`, `base_size = cfg$base`), shown at the default; the script
  floors each of them, so the re-check is true (rcfp 0; round 3's code: 2
  and 5, P13B-R3-03).
- **L 5 (Python)** is unchanged from rounds 1 and 2 (the two seaborn grids
  at 14 × 10 in and the conditional reset, section 10); a sixth, found by
  this gate, came from the floor this round adds and is fixed (a legend
  title read through `legend.fontsize`, section 9). **L 15 (R)** is still
  all `r2-config-list`'s canvas (Lsrc 0, Llost 0).
- **cutPlain 17:** round 3's 13 and the 4 `r3-*` scripts at 6 × 4.5 in whose
  edited scripts raised on round 3's code (`r3-configparser-fontsize`,
  `r3-argparse-update`, `r3-future-main`, `r3-rc-font-kw-unread`; MEASURED,
  the same runs on both): axis titles raised to 20 pt in a 6.4 × 4.8 in
  figure with no layout call, the case section 10 describes; main 10.
- **ffw 16 (Python) and 22 (R)** are rows marked `*` (Python: 3 rows of the
  two seaborn grids at 14 × 10 in, the conditional, 12 of `r2-config-dict`,
  and no longer `r3-fp-alias`'s legend, read since this round; R: 5
  `theme_cowplot()` rows and 17 of `r2-config-list`).
- **GEOMTEXT** (R, an in-panel text with no warning) is 4 of 16 on main,
  round 3's code and now alike: cowplot's panel labels "A" and "B"
  (`label_size = 14`) are drawn in the panel cells; they are not a table
  row, and the change does not touch them.
- **Firefox and WebKit** (9 R and 8 Python scripts of round 3's scenarios at
  10 × 7 in): the same tables, warnings, fix lists, copied scripts and
  re-check tables as Chromium, 0 differences in 34 runs; on their gate lines
  fp is 2 (R) and 8 (Python), all marked (fpU 0), and rcfp, F, L and run 0.

**After review round 2 (MEASURED, Chromium, the production page's code
served by Vite: 110 Python scripts × 4 sizes, instrument
`8db7b994dabd521b`, and 46 R scripts × 4 sizes, each with review round 2's
`r2-*` scenarios; every control held: K-truth with its new self-tests,
C 380 element-runs and 376 scales (Python) and 280 (R), K-known, K-page 486
of 486 and 184 of 184, 110 of 110 and 46 of 46 originals run).** Main is
`f554eaa` (a copy of its tree); round 2 is the code that review read
(`fix13p2-frozen-2`); all three measured with the same harness:

| | main Py | round 2 Py | now Py | main R | round 2 R | now R |
|---|---|---|---|---|---|---|
| first-check false passes (fp) | 195 | 8 | 0 | 117 | 15 | 0 |
| … with no missing-setting mark (fpU) | 195 | 8 | 0 | 117 | 15 | 0 |
| re-check false greens (rcfp) | 147 | 14 | 0 | 128 | 17 | 0 |
| corrected script leaves a text short or does not run (F) | 31 of 311 | 11 of 369 | 0 of 372 | 47 of 125 | 12 of 137 | 0 of 143 |
| corrected scripts that raise (run) | 0 | 4 | 0 | — | (in F) | 0 |
| element-runs lowered at print by the fix (L) | 0 | 19 | 5 | 67 | 31 | 15 |
| … R: a size written below what ggplot2 drew (Lsrc) / a verdict lost (Llost) | — | — | — | 65 / 2 | 27 / 0 | 0 / 0 |
| the corrected image cuts a text the original's crop holds (cut) | 0 | 0 | 0 | — | — | — |
| … from a canvas, INFO (cutPlain) | 9 | 13 | 13 | — | — | — |
| first-check false fails (ffw) | 148 | 16 | 16 | 74 | 36 | 22 |
| re-check false fails (rcffw) | 0 | 0 | 0 | 0 | 0 | 0 |
| against the image the save writes: unwarned false passes / re-check false greens | 43 / 141 | 0 / 0 | 0 / 0 | — | — | — |
| advice below the drawn base (SNIPLOW) | 29 of 311 | 0 of 162 | 0 of 149 | 20 of 125 | 0 of 94 | 0 of 88 |
| advice that lifts nothing (SNIPNOOP) | 36 | 0 | 0 | 20 | 1 | 0 |
| all-pass banner over a failing figure | 57 of 129 | 2 of 71 | 0 of 68 | — | — | — |
| editor image block: false passes (EDIMG, 40 checks) | 44 | 6 | 0 | — | — | — |

- **On the review's own partition** (its 38 scripts × 3 sizes through the
  production build, `vite preview`, run with its driver and its own truth
  instruments, MEASURED): first-check unmarked false passes 2 (round 2's
  code 14), re-check false greens 6 (26), copied scripts that raise 0 (3),
  element-runs lowered 0 (31), all-pass banner over a failing figure 5 at
  the first check (10) and 3 at the re-check (17). Every remaining false
  pass and false green, and 3 of the banners, are `py09_two_figures`
  (several figures in one script: out of scope by the owner's design,
  section 10); the other 2 banners (`py02`, `py18`) sit on a scale marked
  `*` (a tight save, a seaborn grid). French page (9 runs of 8 of its
  scripts) and the editor's image block (5 runs, every caption position):
  0 false passes, 0 false greens, 0 errors, the panel's scale within 0.005
  of the drawn picture's.
- **L 5 (Python)** is unchanged from round 1 (the two seaborn grids set to
  the print size and the conditional reset, section 10). **L 15 (R)** is all
  `r2-config-list`: its canvas, `cfg$width` × `cfg$height` (7 × 5 in), cannot
  be read, so the script saves at the size checked and the same text, its
  source sizes unchanged (Lsrc 0), prints at 1.0 × instead of 1.14 × or more;
  no verdict changes (Llost 0). Main writes constants there (Lsrc 65).
- **ffw 16 (Python) and 22 (R)** are rows marked `*`: the 4 of round 1 (the
  seaborn grids at 14 × 10 in, the conditional) and 12 rows of sizes the
  check cannot read (`r2-config-dict`); in R, 5 `theme_cowplot()` rows and
  17 of `r2-config-list`.
- **Firefox and WebKit** (8 Python and 8 R scripts of round 2's scenarios at
  10 × 7 in): the same tables, warnings, fix lists and copied scripts as
  Chromium, 0 differences in 32 runs; on their gate lines fp, rcfp, F and
  run are 0, ffw is 4 (Python) and 5 (R), all rows marked `*`, and L is 5
  (R, the canvas set for `r2-config-list`), as in Chromium.

**After review round 1 (MEASURED, Chromium, instrument `51465caf18cdd76f`:
100 Python scripts and 36 R scripts × 4 sizes, the CUT claim, the real
`ggsave()`; every control held: K-truth, C 372 element-runs and 336 scales
(Python) and 280 (R), K-known, K-page 426 of 426 and 144 of 144, every
original runs).** Main is `f554eaa`; round 1 is the code the review read
(`fix13p2-frozen-1`); all three measured with the same harness:

| | main Py | round 1 Py | now Py | main R | round 1 R | now R |
|---|---|---|---|---|---|---|
| first-check false passes (fp) | 189 | 5 | 0 | 97 | 4 | 0 |
| … with no missing-setting mark (fpU) | 189 | 2 | 0 | 97 | 4 | 0 |
| re-check false greens (rcfp) | 139 | 20 | 0 | 90 | 5 | 0 |
| corrected script leaves a text short or does not run (F) | 28 of 275 | 27 of 335 | 0 of 333 | 27 of 97 | 6 of 108 | 0 of 107 |
| corrected scripts that raise (run) | 0 | 20 | 0 | — | (in F) | 0 |
| element-runs lowered by the fix (L) | 0 | 19 | 5 | 35 | 10 | 0 |
| the corrected image cuts a text the original's crop holds (cut) | 0 | 23 | 0 | — | — | — |
| … from a canvas, INFO (cutPlain) | 9 | 13 | 13 | — | — | — |
| first-check false fails (ffw) | 131 | 18 | 4 | 45 | 5 | 5 |
| re-check false fails (rcffw) | 0 | 0 | 0 | 0 | 0 | 0 |
| against the image the save writes: unwarned false passes / re-check false greens | 42 / 131 | 0 / 0 | 0 / 0 | — | — | — |
| advice below the drawn base (SNIPLOW) | 25 of 275 | 3 of 155 | 0 of 145 | 11 of 97 | 1 of 78 | 0 of 75 |
| advice that lifts nothing (SNIPNOOP) | 36 | 0 | 0 | 17 | 0 | 0 |
| all-pass banner over a failing figure | 56 of 125 | 1 of 65 | 0 of 67 | — | — | — |

- **The re-check against the real render of the edited script:** over the
  1252 drawn elements re-checked, the page's print size is within 0.05 pt of
  the real one (the page shows one decimal), boxed saves included.
- **L 5 (Python)**: the four of the build (two seaborn grids at 14 × 10 in,
  an owner question, section 10) and one from a review scenario, a reset
  inside an `if` read as made (`r1-conditional-reset`, section 10); all pass
  before and after. **ffw 4 (Python)**: the three of the build (seaborn
  grids, the scale marked) and that conditional; **ffw 5 (R)**: `theme_cowplot()`'s
  rows, marked, which the theme draws larger than ggplot2 would.
- **cutPlain 13**: text grown past a canvas the script fixes, the size's own
  cost in the script's layout (section 10; equal to the ideal control's in
  23 of 23 runs measured).
- **After these runs** the checker changed once more: `tick_params(**kw)`
  reads its `labelsize` (a sibling of R1-08). No corpus script or shape
  fixture passes `**` to `tick_params` (INSPECTED, grep), so the gates'
  pages are unchanged by it; the shape harness, the suite and the mutants
  ran after it.
- **The shape harness** (MEASURED, after every change): 0 defects, 35 known,
  0 stale, exit 0.

**Before review round 1** (the build's final code; instrument
`0d4f9e24695c9f06`, 88 Python and 31 R scripts; every control held):

| | main Python | 13b Python | main R | 13b R |
|---|---|---|---|---|
| first-check false passes (fp) | 180 | 0 | 93 | 0 |
| re-check false greens (rcfp) | 123 | 0 | 77 | 0 |
| corrected script leaves a text short (F) | 25 of 229 | 0 of 288 | 24 of 82 | 0 of 90 |
| element-runs lowered by the fix (L) | 0 | 4 | 31 | 0 |
| corrected scripts that raise (run) | 0 | 0 | — | — |
| first-check false fails (ffw) | 109 | 3 | 40 | 0 |
| re-check false fails (rcffw) | 0 | 0 | 0 | 0 |
| against the image the save writes: unwarned false passes / re-check false greens | 41 / 107 | 0 / 0 | — | — |
| advice below the script's own base (SNIPLOW) | 22 of 229 | 0 of 119 | 10 of 82 | 0 of 63 |
| element-runs lowered by doing the advice | 61 | 0 | 41 | 0 |
| advice that lifts nothing (SNIPNOOP) | 36 | 0 | 17 | 0 |
| all-pass banner over a failing figure | 55 of 123 | 0 of 64 | — | — |

- **Warned rows, counted apart:** 0 first-check false passes on any row,
  marked or not. Against the image a tight save writes, 16 first-check false
  passes, every one on a run whose scale is marked `*` (SAVED `fpU=0`); the
  script saves the whole figure, and its re-check has none.
- **The 3 Python false fails** are all on seaborn grids at 14 × 10 in with
  the scale marked `*` (FIGLEVEL 2, T 1; for example `p2-facetgrid` tick
  labels: ✗ at the assumed 10 pt × 1.00, the real grid is 7.8 × 3 in and
  prints them at 17.95 pt).
- **L 4** (an owner question, section 10): on two seaborn grids at 14 × 10 in,
  the script sets the grid to the print size, so text the grid's own smaller
  size printed larger now prints at its minimum: `c-displot` tick labels,
  legend text and legend title 15.67 → 14 pt, `p2-facetgrid` tick labels
  17.95 → 14 pt. All pass before and after.
- **Firefox and WebKit** (MEASURED): an 8-script Python subset and an 8-script
  R subset at 10 × 7 in render the same tables, warnings and fix lists, and
  copy the same script, as Chromium: 32 tables and 16 copies (Python), 16 runs
  (R), 0 differences; their gate lines are all 0.
- **The shape harness** (`checker-shape-check.mts --no-same-process
  --layout`, matplotlib 3.10.8): 0 defects, 36 known, 0 stale, exit 0; 191
  scripts at 2 sizes, clean outside the known list.
- **Mutants:** 63 of 63 killed by the unit tests (control 244 of 244), 1
  documented blind spot (`advice-unfloored`, the advice's floor): served to
  both browser gates, the page's output is identical on all 378 Python and
  124 R runs (MEASURED), so the floor is unreachable on the corpora (the
  gates measure its purpose directly: SNIPLOW 0). Record 13's spec: 4 canvas
  mutants ported, 4 of 4 killed; 59 retired with the helper they guarded.
  Record 26's spec: one mutant retargeted to the new warning, 57 of 57 killed.
- **Tests (TESTED):** 3810 of 3810, 211 files; `tsc --noEmit` clean; `npm run
  build` succeeds (`apps/web/public/version.json` restored after each run).
  The entry tests: 26 of 27 red on main.

## 9. Review of the fix

Three ordered rounds (decision 7), each reviewer with a partition of its own
(code → a new angle → a re-check), each on a frozen copy.

### Round 1: code review (on `fix13p2-frozen-1`)

**The reviewer's partition:** the change read file by file; the two gates
re-run on its own copies of the frozen tree and of main; a probe of its own
that drives the public page as a user does (size, paste, ▶ Check, read, Copy
edited code, paste back, Check) on 17 scripts it wrote, and runs the
original and the copied script through the committed truth runners; its own
mutant spec (21 mutants over the 5 named test files). 17 findings: 2 HIGH,
9 MEDIUM, 5 LOW, 1 INFO. What held (its MEASURED re-runs): every gate number
of section 8 as recorded then, the mutant and suite counts, `tsc`, the shape
harness, and the decisions met in structure; and eight sentences of copy
that the findings made false (EN and FR).

**The corrector's method (this section).** Each finding is a hypothesis
until reproduced: my tree was identical to `fix13p2-frozen-1` (`diff -rq`:
only `tsconfig.tsbuildinfo`), and I re-ran the reviewer's probe on it (17
scripts × 3 sizes, and the four tight-save corpus scripts × 4 sizes),
`Rscript` on the copied R scripts, and its `beyond.py` on the copied
Python. A red test from the user's entry came first for every fix
(`src/pages/__tests__/figureReadabilityReview.test.tsx`: 15 of 15 red on the
round-1 code, then green; unit tests in `readabilityScript.test.ts`); every
probe script that found a defect is now a corpus scenario (`r1-*`, 12 Python
and 5 R), so the gates re-measure it.

| id | sev. | reproduced on round 1's code (MEASURED unless marked) | cause | what was done |
|---|---|---|---|---|
| R1-01 | HIGH | the four tight-save corpus scripts × 4 sizes: 16 of 16 copied scripts save an image whose content runs 1.20 to 4.78 in past its edge (the largest side of each; originals 0), e.g. `tight-legend-outside` at 10 × 7 in 2.45 in on the right, its four legend entries more than half outside; the re-checks all ✓ | the script removed `bbox_inches="tight"`; decision 4's trade-off was never measured, and no instrument looked at the saved image's content | a cropped save keeps everything it kept: the fit block resizes the figure until what it draws fits the canvas checked, and the save writes `bbox_inches=poster_box`, that canvas (section 7); read back as P19. After: 0 in past the edge on all 16, images exactly 8.00 × 6.00 and 6.40 × 4.80 in |
| R1-02 | HIGH | `fontdict=font`, `fontdict={'fontweight': ...}`, `prop={'family': ...}`, `prop=fp`: 12 of 12 copied scripts raise (`AttributeError`, `TypeError`); `pB` at 14 × 10 shows Plot title ✓ (marked) over real 8 pt | `sizeKw` returned an editable span for any `fontdict=`/`prop=` it could not read, and the fix wrote a number over it | a dict or `FontProperties`, inline or in a name, is read where its size is written (and raised there); a dict with no size sets none; anything else is never overwritten (`Winner` `none`), its row marked; a `fontdict=` of that kind takes a `fontsize=` keyword. After: 0 raise |
| R1-03 | MED | `relplot(hue=, col=)` then `plt.show()`: the added save is not preceded by the grid block; re-checks ✓ (scale marked) over 16.32 and 12.70 pt at 10 × 7 (8 marked false greens over 3 sizes) | the grid block was emitted only before an existing save | the grid block also comes before the save the fix adds |
| R1-04 | MED | `theme(axis.text = 6)` in the plot, then `theme_update(axis.text = 30)`: Tick labels 30 ✓ unmarked, ggplot2 draws 6 (first check 3 of 3, re-check 3 of 3) | global and plot theme calls sorted together by position | the global theme first (theme_set's, then each theme_update in order), the plot's own theme() on top, as ggplot2 builds `get_theme()` + the plot's theme |
| R1-05 | MED | `+ theme_cowplot()`: the fix wrote `text = element_text(size = 11)` and lowered 9 element-runs (title 22.40 → 17.60 pt at 10 × 7, pass → warn); the re-check showed that title ✓ unmarked; the advice offered `theme_cowplot(base_size = 13)`, which R rejects (`unused argument`, MEASURED) | an unknown complete theme was treated as ggplot2's for the root size, the marks and the advice | the root text size is never written from ggplot2's 11 under such a theme; every size resting on it is marked on every check; the advice is withheld; a row of it that falls short gets the R10 floor `max(need, calc_element(...))`, so never below what the theme draws (cowplot 1.2.0: axis titles 14, tick labels 12) |
| R1-06 | MED | `+ theme_void()`: axis titles and tick labels drawn only after the fix (2 of 3 runs) | `theme_void()`'s blank axis text not modelled | `THEME_BLANK`: its `axis.title` and `axis.text` (read with `calc_element()` on all ten ggplot2 themes; no other blanks a text element) |
| R1-07 | MED | `ggsave(filename = "fig.png", p, ...)` and `ggsave(file = ...)`: the copied scripts abort in real R (`device` must be a string …, MEASURED with `Rscript`) where the originals write fig.png (43,542 bytes); the R gate's recorder accepted the binding | `argOf` counted only unnamed arguments | `matchR` (R's own rules: exact names, unique partial names, then position) finds the plot and the canvas arguments (a partial `w =` / `h =` too, a sibling); `gg_truth.R` now calls the real `ggsave()` with the arguments as bound (self-test D) |
| R1-08 | MED | `**label_kw` with `{'fontsize': 8}`: re-check ✓ unmarked over real 8 pt (6 of 6 title and axis-title runs) | `**` arguments were not read | a `**NAME` or `**{...}` dict is read and raised in place (also `tick_params(**kw)`'s `labelsize`, a sibling); one the check cannot resolve is unread and left as written, its row marked |
| R1-09 | MED | font.size 9, default canvas, tight save: the advice offered (font.size = 20 at 6 × 4.5, 13 at 10 × 7) and no tight warning | `canvasOf` returned "default" before it looked at the crop | a crop or a notebook decides the scale before a default canvas does |
| R1-10 | MED | `sns.set_theme(...)` inside an `if`: the copied script is a `SyntaxError` (3 of 3) | the block went to the line after the reset, an `else:` | `safeLine`: settings go at the figure's own indent, never inside a deeper block and never before `else:`/`elif`/`except`/`finally` |
| R1-11 | MED | `matplotlib.rc('font', **font)` (size 22): first-check false fails and 11 element-runs lowered by the fix (3 of 3 runs) | P3 read keyword arguments only | `**NAME` and `**{...}` read in P3 and in `rcParams.update` (the same dict reader as R1-02 and R1-08: one cause, the table read sizes only from keywords and literals at the call) |
| R1-12 | LOW | `set_theme('notebook', 'whitegrid', 'deep', 'sans-serif', 0.8)` at 14 × 10: Plot title and Axis titles ✓ unmarked over real 9.6 pt (16.0 at print) and the all-pass banner | `font_scale` read from position 5 | position 4 (seaborn 0.13.2's signature) |
| R1-13 | LOW | `fig, (ax1, ax2) = plt.subplots(1, 2)`, ticks at 18: Tick labels 10* ✗, real 18 | tuple-unpacked names not tied to their Axes | each name is its Axes, in order |
| R1-14 | LOW | the reviewer's spec: 12 of 21 mutants survived (its run; not re-run as such) | parts no test exercised | each folded into the record's spec with a test that kills it (`r1-14-*`), but the block-merge dedupe, a documented blind spot (below) |
| R1-15 | LOW | INSPECTED: no caller of `extractCallArgs`, `extractAllCallArgs`, `topLevelArgs` (grep over `src` and `scripts`) | left over from part 1 | removed, with a sibling the grep found, `argValueEnd` (re-exported, never called) |
| R1-16 | LOW | read + score + edit (tsx; the machine shared with three gate runs): 1.6 s at 1003 lines, 6.3 s at 2003, 25.5 s at 4003 (quadratic); the linear-time test fails on round 1's code at 8003 lines (over 3 s) | `calls(src, /element_text/)` scanned the source once per theme() argument; the model ran 3 times per check | one scan per source (`ELEMENT_TEXT` cache) and the model built once per check (memo); a test bounds 8003 lines at 3 s. After: 13, 16 and 30 ms at the same sizes |
| R1-17 | INFO | not reproduced: patchwork is not installed, and installing is out of bounds | — | the `wrap()` comment's claim ("the theme reaches all of it") removed; section 10 |

**A defect the round's mutant check found.** The surviving mutant
`fix-tight-kept` showed no test on a seaborn grid saved with an explicit
`bbox_inches='tight'`: the script removed it, and `g.savefig` crops when it
is not given, so the image stayed cropped (9.95 × 6.90 in for 10 × 7,
MEASURED). It is now told `None` (test and mutant `r1-14-grid-tight-removed`).

**Instruments the round showed blind, extended (the reviewer's notes, each
checked):**

- `mpl_truth.py` read sizes from artists whether or not the image holds
  them: it now lists every text drawn and whether the image cuts it
  (self-test C2: a figure legend outside the canvas cut from a plain save, 2
  entries, kept by a tight one, 0; off-view tick labels are not texts), and
  the Python gate counts CUT.
- `gg_truth.R`'s recorder accepted bindings real `ggsave()` rejects: it now
  calls the real `ggsave()` (self-test D).
- The shape harness measured text against the figure, so its controls, which
  keep the crop, looked like the fix that dropped it: it now judges against
  the image each save writes and adds `cut_in2` for every text. Falsified
  (MEASURED, `--dir` on the four tight-save scripts at 4 × 3 and 6 × 4.5 in):
  on round 1's code 8 defects, e.g. `tight-legend-outside` at 6 × 4.5 clip
  0.253 and cut 2.987 in² against 0 for the original and the ideal; on this
  code 0 at 6 × 4.5 and 3 at 4 × 3 (section 10).

**After the round (MEASURED; section 8 has the table).** On the gates with
every review scenario in them: first-check false passes 0 (Python and R;
round 1's code 5 and 4), re-check false greens 0 (20 and 5), corrected
scripts that raise 0 (20) or do not run in R 0 (6), cut texts 0 (23), R
texts lowered 0 (10), Python 5 (19; the build's 4 and one conditional
reset). The reviewer's probe on this code, its 17 scripts × 3 sizes and the four
tight-save scripts × 4, 67 runs: 0 corrected scripts fail to run, 0 unmarked
false passes at the first check (12 marked, all on a crop whose scale is
marked) or at the re-check (0 marked), 1 element-run lowered (the
conditional reset) and 0 texts drawn only after the fix. Firefox and WebKit
(8 Python and 8 R scripts with the round's scenarios, 10 × 7 in): the same
tables, warnings, fix lists and copied scripts as Chromium, 0 differences in
32 runs. Tests (TESTED): 3844 of 3844 in 212 files; `tsc --noEmit` clean;
`npm run build` succeeds (`apps/web/public/version.json` restored after each
run). Review round 1's tests on round 1's code: 25 of 55 fail in the two
files that hold them (the other 30 guard what round 1 already did right,
the reviewer's surviving mutants among them). Mutants (record 13b's spec, 108):
106 of 106 killed, control 278 of 278, 2 documented blind spots; record 13's
4 of 4; record 26's 57 of 57 and its 1 blind spot. The shape harness
(`--no-same-process --layout`, with the image-aware clip and `cut_in2`): 0
defects, 35 known, 0 stale, exit 0 (k11's stale-clip entries came off: the
fit block keeps its crop, clip 0; f06, f17 and k32 gained a `cut_in2` tag
at their clip figure).

**Blind spots (mutants that survive, each documented in the spec):**
`advice-unfloored` (kept from the build) and `r1-14-block-merge-dups`: a key
the first block already holds is read as a value the code writes (P2) and
edited in place, so the fix never inserts it again and the dedupe filter is
not reached by any ordinary input (INSPECTED; the unit tests' second fixes
pass with it removed). Served to the Python gate (`POSTR_MUTANT`), the page's
tables and copied scripts are identical to the unmutated run on all 400 page
runs (MEASURED); the gate offers no second fix on any of them, so it says
nothing more about the second-fix path.

**Copy.** The eight sentences found false are true again or reworded, EN and
FR (`i18n/readability.ts` `whereR`, `wherePython`; `i18n/figureReadability.ts`
and `seo/routes.json` `howCanvas`, `howFix`; `readsR` and the grid warning
true as written after R1-04 and R1-03): "never below the size the table
shows" replaces "never smaller than the one your code gives", which a size
the check cannot read made untrue. New: `assumedBodySome`, `assumedBodyKept`
and `allPassAssumedKept` for a marked size the script leaves as written.

### Round 2: a new angle (on `fix13p2-frozen-2`)

**The reviewer's partition:** 38 scripts of its own (22 Python, 16 R) in
researchers' idioms, none from the earlier corpora, each at 10 × 7, 14 × 10
and 6 × 4.5 in through the production build (`vite preview`): 114 English
page runs and 90 fix runs, every copied script run in real matplotlib
3.10.8, seaborn 0.13.2 and ggplot2 4.0.3 (cowplot 1.2.0, gridExtra) with
instruments of its own (an SVG font-size cross-check on four scripts), plus
9 French page runs, 5 editor image-block runs and 13 runs on a build of
main. 13 findings: 3 HIGH, 7 MEDIUM, 3 LOW. What held (its MEASURED
re-runs): 20 of 38 scripts right at all 3 sizes (356 compared rows within
0.43 pt), the tight-save fit block at 10 × 7, 6 × 4.5 and 14 × 10 in, the
editor's side-caption box (0.90 against a measured 0.897), the French page
and its warnings, and the marked rows on seaborn grids and cropped saves.

**The corrector's method.** My tree was identical to `fix13p2-frozen-2`
(`diff -rq`, MEASURED). Each finding was reproduced on a production build of
it with the reviewer's driver and truth instruments (its 38 scripts; the
13 findings' runs listed below, Chromium); the R2-10 advice on round 2's
code was read through the same modules the page uses. A red test from the
user's entry came first for every fix
(`src/pages/__tests__/figureReadabilityReview2.test.tsx`: 26 of 28 red on
round 2's code; the 2 green guard parts of the change against their
mutants); every reviewer script that found a defect, and siblings, is a
corpus scenario (`r2-*`, 10 Python and 10 R), so the gates re-measure it.

| id | sev. | reproduced on round 2's code (MEASURED unless marked) | cause | what was done |
|---|---|---|---|---|
| R2-01 | HIGH | `r04_gridextra` at 10 × 7 in: the re-check all ✓ and the copied script's `ggsave("figure3.png", g + theme(...))` saves a NULL plot (blank image); `r03_cowplot_grid`: re-check Axis titles 18 ✓ and Tick labels 14 ✓ over a real 9.0 and 7.2 pt | `readabilityRFix.ts` wrapped whatever ggsave() saves in `(...) + theme(...)`; the reader read every theme of the script as one plot | R12 (`readabilityROutput.ts`): a plot made by `plot_grid`, `ggdraw` + `draw_plot`, `ggarrange`, `arrangeGrob`, `grid.arrange`, `marrangeGrob`, `wrap_plots`, or patchwork operators on names with `library(patchwork)` (UNVERIFIED: patchwork is not installed), followed through names and two levels of nesting: each plot read from its own assignments, the smallest per row; the fix inserts `p1 <- p1 + theme(...)` per plot before the first statement that combines them; plots the check cannot name: rows marked and kept, a warning (EN, FR), nothing written; no one-number advice. Gate (`r2-cowplot-grid`, `r2-gridextra`, `r2-cowplot-mixed`, bases 9 and 20 written larger last): 0 false passes, 0 false greens, F 0 (round 2's code: R2-COMBINE 4 false passes; F 12 of 137 in R, the cowplot and gridExtra scripts among them) |
| R2-02 | HIGH | `py06_panel_letters` at 14 × 10 in: Plot title 20 → 28 pt ✓ over a real 9 → 12.60 pt ✗, first check and re-check | titles folded per receiver, the last call winning; `loc=` not read | P12: one title per `loc=` (keyword or third argument), the smallest scored, each raised where it is written (the letters at 20 pt stay). Gate `r2-panel-letters`: 0 (round 2's code: R2-TITLELOC 2 false passes, and 6 editor image-block false passes on it and `r2-supxlabel`) |
| R2-03 | HIGH | `py22_config_dict` at 14 × 10 in: lowered 24 → 12, 20 → 11, 20 → 10, 20 → 10 pt; `r16_config_list` at 10 × 7: 5 classes lowered; `r01_comment_names`: 2 | Python pinned every row marked `*` at the size it assumed, including sizes the code sets unreadably (`origin: 'unread'`); R wrote the need with no floor when `base_size` was unread. The cause round 1 named; R1-05 fixed only the theme branch | a size the check cannot read is left as written where it passes; where it falls short the P21 floor (Python: `max(N, CONFIG['font_size'])` on the `font.size` it follows, `max(N, FontProperties(size=EXPR).get_size_in_points())` in a call, a dict or an inserted key) or the R10 floor (R); P21 read back as N. A sibling found reading `fromValue` (then a red test): a named size (`fontsize='large'`) on an unread `font.size` was read as known, unmarked; now unread, and floored as `max(N, FontProperties(size='large').get_size_in_points())`. The shape harness's f01 (`font.size` from a loop's variable over two figures) no longer lowers text: its two known entries came off. Copy: "Not read from your code." (legend line, row title, EN and FR), the warning reworded (EN, FR), a passing unread row is "kept" (the all-pass line says to check it). Gate: Python L 0 on `r2-config-dict`, `r2-unread-kw`; R Lsrc 0 (main 65, round 2's code 27) |
| R2-04 | MED | `r01_comment_names` at 10 × 7: "base_size is set from a variable" and Axis titles 11* ⚠ over a real 30.80 pt; `r07_ggsave_comment_width` at 14 × 10: "could not read its width/height", Plot title 10.8 ✗ over a real 21.34 pt ✓ | `rNumber` sliced to the statement's end, comment included | the value ends at its last character in the masked copy (comments blanked). Gate R2-NAMES 0 of 36 (main 34, 10 false passes) |
| R2-05 | MED | `py19_pdfpages_tight`: the copied script raises `AttributeError: 'PdfPages' object has no attribute 'dpi'` (3 of 3 sizes) | the fit block took the save's receiver for the figure | P11: a save on a PdfPages object (`with PdfPages(...) as pdf`, `pdf = PdfPages(...)`) writes its figure argument (`figure=` or the first), else `plt.gcf()`; `SaveInfo.figExpr`. The truth runner now measures the image PdfPages writes (it passes `backend='pdf'`). Gate `r2-pdfpages-tight`: run 0 (round 2's code 4) |
| R2-06 | MED | `py04_sns_heatmap` at 10 × 7: Tick labels 16 → 18.7 ✓ over the colorbar's 11 → 12.83 pt ⚠, first check and re-check; `py20_scatter_cbar_pandas`: Axis titles 16 → 22.4 ✓ over the colorbar label's 10 → 14 pt ✗, no fix offered | P8 made a colorbar Axes only for an explicit `colorbar(` | P8: `sns.heatmap` (unless `cbar=False`), `histplot`/`kdeplot(cbar=True)`, `df.plot.scatter(c='column')` (not a colour name) and `df.plot.hexbin()` make a colorbar, labelled when `cbar_kws` has a label or the column names it; never the current Axes; named by `cbar = ax.collections[0].colorbar`. Gate R2-CBAR 0 (round 2's code 5 false passes, main 5) |
| R2-07 | MED | `py03_supxlabel` at 14 × 10: Axis titles 16 → 18.7 ✓ over the 9 → 10.50 pt sup-labels ✗, no fix; INSPECTED: P13 listed them, the call regex had neither | sup-labels never read | read as axis titles: `fontsize=`/`size=`, else `figure.labelsize` (`'large'`; `'medium'` in the classic sheet), raised where written or by that key. `mpl_truth.py` counts them (self-test, falsified). Gate R2-SUP 0 (round 2's code and main 1) |
| R2-08 | MED | `r13`/`r15` at 10 × 7: Legend text 14.4 → 20.2 ✓ over a real 7 → 9.80 pt ✗, Legend title 18 → 25.2 ✓ over 8 → 11.20 pt ✗, no fix | a guide's `theme()` read as the plot's (and wiped by the later complete theme); `label.theme`/`title.theme` not read | R13: a guide's own legend sizes, after the plot's theme and never reset; raised where written. Gate R2-GUIDE 0 of 32 (round 2's code 10 false passes, main 5) |
| R2-09 | MED | `r02_png_device` at 10 × 7: the copied script leaves `figure1.png` unfixed and writes `poster_figure.png`; the re-check shows 7 of 7 ✓ | devices not read | R11: the device's size (pixels at `res`, 72 by default; inches for `pdf()`) and `print(p + theme(...))`; an unreadable device size set to the size checked with `units = "in"` and `res = 300`; with neither ggsave() nor a device, the copy names `poster_figure.png`. `gg_truth.R` records devices (self-test E). Gate `r2-png-device`: 0 |
| R2-10 | MED | advice through the page's modules at 10 × 7 (MEASURED): `py16` "font.size = 13", `py06` 14, `py07` 11, `r03` "theme_bw(base_size = 18)", `r04` "theme_minimal(base_size = 18)"; the reviewer applied each and rendered it: no drawn text changed (UNVERIFIED by me) | rows for text the script never draws counted; several plots' bases | only drawn rows count (`FigureParams.undrawn`); no advice for a figure that combines plots. All five now give none. Gate SNIPNOOP 0 (main 36 and 20) |
| R2-11 | LOW | `r06_replace_inline` at 10 × 7: Plot title 14.4 → 20.2 ✓ over a real 12 → 16.80 pt ⚠, and the re-check ✓ | `%+replace%` read as `+` | R14: an element after `%+replace%` replaces the earlier one whole, and a size it leaves out is the parent's. Gate R2-REPLACE 0 (round 2's code 1) |
| R2-12 | LOW | `py08_fig_legend_below_tight` at 4 × 3: re-check all ✓, the legend entry "Rescue" cut (CUT) | the fit block's floor (a tenth of the canvas), section 10 | copy qualified, EN and FR: the script keeps what the crop kept "when that fits the canvas at the sizes needed" (`wherePython`, `howCanvas`, `howFix`, `routes.json`). Not built: knowing at check time that the fit will stop at its floor (section 10, PLAN.md Later) |
| R2-13 | LOW | `py06` at 10 × 7: Tick labels 10* ✗ over a real 12 ⚠, and "No font size found" | a loop variable named no Axes | P20: a size set on a loop's variable over names (`(a, b)`, `[a, b]`) or a subplots array (`X`, `X.flat`, `.ravel()`, `.flatten()`, through `enumerate()` and `zip()`) is set on each of those Axes |

**A defect the round's own mutants found.** `py-unnamed-dropped` survived
the first mutation run: P20 now names the Axes of the loop the earlier test
used, so nothing reached the path for Axes the check cannot name (a loop
over `fig.axes`). A test of that path came first (green on round 2's code
too), then the run (below).

**Instruments the round showed blind, extended (each checked):**
`gg_truth.R` (self-test E: a gtable, a cowplot figure, `gtable + theme()`
NULL, a png device; the old runner raised on the first, read the second's
axis text as in-panel text and stopped on the fourth with "no ggsave()
call"; on round 1's 36 scripts byte-identical output); `mpl_truth.py`
(sup-labels as axis titles, falsified: 12 pt read for an 8.5 pt sup-label
without the change; the image PdfPages writes); the R gate's L split into
`Lsrc` and `Llost`.

**After the round (MEASURED; section 8 has the table).** On the gates with
every review scenario in them: first-check false passes 0 (Python and R;
round 2's code 8 and 15), re-check false greens 0 (14 and 17), corrected
scripts that raise 0 (4) or leave a text short 0 (11 and 12), R sizes
written below what ggplot2 draws 0 (27), editor image-block false passes 0
(6). Tests (TESTED): 3874 of 3874 in 213 files; `tsc --noEmit` clean;
`npm run build` succeeds (`apps/web/public/version.json` restored after
each run). After the gates ran, the source changed only in two header
comments (`readabilityPyText.ts`, `readabilityPyModel.ts`; INSPECTED) and
the R gate ran after the last code change (a missing device argument
appended in one edit, in order). Mutants (record 13b's spec, 139: 25 mutants' anchors retargeted
to the refactored R reader and the floors, each undoing the same rule, and
31 new `r2-*`): 137 of 137 killed, control 308 of 308, the 2 documented
blind spots; record 13's spec 4 of 4 killed (control 175 of 175); record 26's
57 of 57 killed (control 516 of 516) and its 1 blind spot. The shape
harness (`--no-same-process --layout`): 0 defects, 33 known, 0 stale, exit 0;
the first run flagged f01's two entries stale (a loop over two figures
whose `font.size` comes from the loop's variable: no longer lowered), which
came off the known list.

### Round 3: a re-check (on `fix13p2-frozen-3`)

**The reviewer's partition:** the production build of `fix13p2-frozen-3`
(`vite preview`), driven with round 2's driver (size, paste, ▶ Check, Copy
edited code, paste back, Check), every copied script run in real matplotlib
3.10.8, seaborn 0.13.2 and ggplot2 4.0.3 (cowplot, gridExtra) with round 2's
truth instruments and an autoprint-aware copy of the R one; the inputs of
rounds 1 and 2 (59 scripts × 3 sizes, 4 × 3 in for the 5 tight saves: 182
page runs) and 31 new scripts in 61 runs (a font size from configparser or argparse, a
`from __future__` script, `FontProperties as FP`, a seaborn `font_scale`
from a config, a shared theme object, a function building each panel,
`png()` then `p`, a `ggplot()` chain or `grid.arrange()`, ragg), the French
page, the editor's image block, and builds of main and round 2's code on
ports of its own. 5 findings: 1 HIGH, 3 MEDIUM, 1 LOW. What held (its
MEASURED re-runs, UNVERIFIED by me except where re-run below): 0 copied
scripts raise on the 182 runs, 0 re-check false greens and 0 unmarked
first-check false passes outside `py09` (several figures, out of scope), 0
false fails on R2-04's scripts, the advice's 60 offers each lifting a
failing drawn class (SNIPNOOP 0), the R reader linear (19–23 ms at 4006
lines).

**The corrector's method.** My tree was identical to `fix13p2-frozen-3`
(`diff -rq`, MEASURED). Each finding was reproduced on a production build of
it with the reviewer's driver, cases and truth instruments (the runs below,
Chromium). A red test from the user's entry came first
(`src/pages/__tests__/figureReadabilityReview3.test.tsx`: 20 tests, 20 red
on round 3's code; `src/poster/__tests__/readabilityReview3.test.ts`: 16
unit tests, 12 red; of the 4 green, a `fontdict=` that passes, a
reassignment inside a block and `p$theme` guard parts of the change against
their mutants, and the linear-time test guards R15 itself, which round 3's
code does not have: 32 of 36 red, MEASURED by running the final test files
on round 3's code). Every reviewer script that found a defect, and each sibling the
correction found, is a corpus scenario (`r3-*`, 6 Python and 15 R).

| id | sev. | reproduced on round 3's code (MEASURED unless marked) | cause | what was done |
|---|---|---|---|---|
| R3-01 | HIGH | `t36_shared_theme_object` (`theme_fig <- theme_bw(base_size = 16) + theme(...)` on two plots, `arrangeGrob`) at 14 × 10 in: Axis titles, Tick labels and Legend text ⚠ marked over a real 22.40 and 17.92 pt ✓, and the copied script lowered 5 classes (19.2 → 13.2, 16 → 13, 12.8 → 10, 12.8 → 10, 16 → 11); at 10 × 7, 2 (19.2 → 18, 16 → 14); `t34_function_panels` (`make_panel <- function(...) ggplot(...) + theme_bw(base_size = 16)`) the same 5 at 14 × 10; the control `t35` (one plot) read 16. Siblings found here: one plot, `theme_ticks <- theme(axis.text = element_text(size = 20))` added after `theme_bw(base_size = 9)`, read 7.2 and lowered 20 → 10 pt at 10 × 7; `p2 <- p1 + aes(...)` combined with p1 lowered 5 classes at 14 × 10; `print(p + theme(axis.text = ...30))` before `ggsave(p)`: Tick labels 30 ✓ unmarked over a real 7.2 pt, first check and re-check | R12 read each plot from its own assignment lines, so a theme held in a name or a function never reached it, and base 11 was assumed and written (`text = 11`); in one plot a theme in a name was read where it is written, not where it is added. The same cause as R1-05 and R2-03: a size the check assumed, written as if known | R15 (`readabilityRNames.ts`): a top-level `name <- value` holding a theme call, or using a name that does (a theme object, a function, a plot another is built from), gives its themes where the name is used, three names deep, in each plot of a combined figure and in a figure of one plot; a name assigned again inside a block is read in source order; `p$theme` is no use; a combined plot's own assignments are read in place. Gate R3-NAMES (9 scripts × 4 sizes): 0 of 148 element-runs wrong (round 3's code 84, main 8) |
| R3-02 | MED | `t01` (`rcParams['font.size'] = cfg['plot']['font_size']`), `t02` (`update({'font.size': args.font_size})`), `t14` (`rc('font', size=cfg.get(...))`): `TypeError: '>' not supported between instances of 'str' and 'int'`; `t03` (`from __future__` first, matplotlib imported in `main()`): `SyntaxError`; `t09` (`FontProperties as FP`): `NameError`: 5 of 5 copied scripts at 10 × 7 | the P21 floor wrote `max(N, EXPR)` for `font.size`, which matplotlib takes as a string; the import went to offset 0 when no top-level matplotlib import existed, and any import line naming FontProperties counted as binding it | `max(N, float(EXPR))`; the import after the first top-level matplotlib import or, with none, after a docstring and any `from __future__` import; bound only by an import of that exact name (or `*`). Sibling found by the gate: the reader did not know `FP(size=14)` as a FontProperties either (Legend text read at the default 10, and the fix listed a size it could not set: F 1, re-check false fail 1); it now reads an alias an import gives. Gate R3-RUN: run 0 (round 3's code 15) |
| R3-03 | MED | `t13` (`sns.set_theme(context='paper', font_scale=cfg['scale'])`, 0.8) at 10 × 7: re-check Tick labels and Legend text 10* ✓ over a real 7.04 → 10.27 pt; `t37` (`theme_bw(base_size = cfg$base)`, 7): re-check Plot title 13.2* ✓ over 8.4 → 11.76 pt and Legend title 11* ✓ over 7 → 9.80 pt | round 2 floored an unread size only where it fell short at the size assumed; one that passed there was left as written | every drawn size resting on an unread value is floored, short or not (P21, R10); a theme that is not ggplot2's is "Not read from your code" and floored the same way; only a Python `fontdict=` the check cannot see into is still raised only where short (a plain `fontsize=` could lower a larger size), and the legend says so (`unreadBodyKept`). Sibling found by the gate: the legend title written beside a floored legend text read `legend.fontsize`, which set seaborn's 7.68 pt title to 7.04 (`r3-sns-unread-scale` at 14 × 10, L 1); it now reads `legend.title_fontsize or legend.fontsize`. Copy: `unreadBody` (EN, FR), `wherePython`, `howFix` (and `routes.json`), the Python warning; `assumedBody*` now name the one case left, a plot the check cannot find by name |
| R3-04 | MED | `t21` (`png(...)`, `p`, `dev.off()`), `t22` (`pdf()` then a `ggplot()` chain), `t33` (`agg_png()` then `print(p)`): the user's own file still prints 9.33–14.00 pt (5 of 5 classes fail at 10 × 7) and only an added `poster_figure.png` passes; `t23` (`png()` then `grid.arrange(p1, p2)`): figure3.png at 9 and 7.2 pt, and `poster_figure.png` holds only p2 | R11 read a device's plot only from `print(x)`; ragg's devices were not devices; `grid.arrange` is found by the scanner as `arrange` on `grid`, so R12 never read it (on the gate, `ggsave("f.png", grid.arrange(p1, p2))` was given `+ theme()`: a NULL plot, F 4) | R11: a statement R prints between the device and its `dev.off()` (a name, a name and operators, a `ggplot()` chain, a call that combines plots) is what the device draws, and the fix prints it themed (`print(p +\n  theme(...))`, so it draws under `source()` too); a `print()` after `dev.off()` is not the device's; `agg_png`, `agg_jpeg`, `agg_tiff`; R12 matches `grid.arrange` by its full name; a device whose plot the check cannot find is said ("Found png() but not the plot it draws …", EN, FR) and the copy no longer says "without a device". Gate R3-DEVICE 0 of 84 element-runs wrong (round 3's code and main 29), F 0 (round 3's code 4, all `r3-ggsave-gridarrange`) |
| R3-05 | LOW | `py08_fig_legend_below_tight` at 4 × 3 in: the copied script saves 9.00 × 3.00 in, the legend entry "Rescue" cut, the re-check all ✓; 0 cut at 6 × 4.5, 10 × 7 and 14 × 10 in | the fit block stops at a tenth of the canvas (R2-12) | accepted as is (section 10): withholding the ✓ for a tight save "at a small print size" needs the extents of what is drawn outside the plots, which only the run knows; the copy already says the crop's text is kept when it fits |

**Instruments the round showed blind, extended (each checked):**
`gg_truth.R` ran the script with `sys.source()`, which prints nothing, so a
plot drawn on its own line inside a device was "no plot printed"; it now
runs each expression as Rscript does and prints a visible value, records
`grid.arrange()` and ragg's devices, closes the device at `dev.off()`, and
prints no value that is not a plot (stdout holds the JSON). Self-test F
(five checks), falsified: the previous runner fails all five (four "no
plot printed to a device", and a `print()` after `dev.off()` measured as the
device's, 9 pt instead of 11); on the 46 earlier R scripts its output is
byte-identical (46 of 46, MEASURED). Both gates' corpora gain the `r3-*`
scenarios and their owners (R3-RUN, R3-UNREAD, R3-NAMES, R3-DEVICE,
R3-COMBINE; R3-DEVICE also owns those scripts' scale).

**After the round (MEASURED; section 8 has the table).** On the gates with
every review scenario in them (116 Python and 61 R scripts × 4 sizes):
first-check false passes with no
missing-setting mark 0 (Python and R; round 3's code 0 and 3, main 201 and
126), re-check false greens 0 (round 3's code 2 and 5, all but 3 marked),
corrected scripts that raise 0 (15) or leave a text short 0 (Python 0 of
396, round 3's code 15 of 392; R 0 of 190, 4 of 196), R sizes written below
what ggplot2 draws 0 (31; main 68), Python texts printed smaller 5, the
same 5 as rounds 1 and 2 (a sixth, found by this gate in this round's own
change, fixed: below). Firefox and WebKit (9 R and 8 Python scripts of the
round's scenarios at 10 × 7 in): 0 differences from Chromium in 34 runs.

**Defects this round's own instruments found in the correction, each fixed
with a test first:** the gate's first run of the corrected code gave
Python F 1 and a re-check false fail on `r3-fp-alias` (the reader too did
not know `FP(...)`: Legend text read at the default 10 where the script
sets 14, and listed for a fix it could not make), and L 1 on
`r3-sns-unread-scale` at 14 × 10 in (the legend title written beside a
floored legend text read `legend.fontsize`: 7.68 → 7.04 pt); the R gate's
first run gave a re-check false fail on `r3-three-deep` at 10 × 7 in (the
edited script's own `p1 <- p1 + theme(...)` took one of R15's three levels,
so the theme three names down went out of reach): a combined plot's own
assignments now take no level. And a timing of my own: R15's first version
found whether a `name = value` line sits in a block by walking back to its
bracket, so a long function body full of them was read in quadratic time
(974 ms at 8,003 lines, 3.7 s at 16,003; the review's 4006-line timing has
no such body); each position's bracket is now found in one pass (16 ms at
16,003 lines; a test bounds it at 2 s, red before). After them: the numbers
above.

**Measured beside the gates:** the shape harness (`--no-same-process
--layout`): 0 defects, 33 known, 0 stale, exit 0. On the 4 `r3-*` scripts
whose edited script cuts an axis title at 6 × 4.5 in (CUT-plain: no layout
call of their own), the shape harness's `--dir` (3 of them: its raise-first
control cannot run `r3-future-main`, as it writes code above `from
__future__`) measures the edited script cutting more than the ideal control
that sets each listed class at its own need: 0.607 against 0.316 in²
(`r3-configparser-fontsize`, `r3-rc-font-kw-unread`) and 0.141 against
0.080 (`r3-argparse-update`); the cause, round 2's floor on an unread
`font.size` at the largest need of the classes that follow it, is in section
10. Tests (TESTED): 3911 of 3911 in 215 files; `tsc --noEmit` clean; `npm run build` succeeds (`apps/web/public/version.json` restored after each run). After the gates ran, `readabilityPyFix.ts` changed once more (the import's place found without a docstring branch, which a surviving mutant showed no input reaches: in the masked copy every line of a docstring is blank or its quotes); the 10 corpus scripts that take that import, re-run in the gate on the final code (40 runs), give the same tables, copied scripts and re-checks as the full run, and the review's R3-02 and R3-03 scripts on a build of it: 0 copied scripts raise, 0 lowered; then `readabilityRNames.ts` changed once more (the bracket found in one pass, above), and the R gate run after it gives the same GATE-R line (fp 6, all marked, rcfp 0, F 0 of 190, L 15, Lsrc 0, ffw 22, rcffw 0). Mutants: record 13b's spec, 162 (9 anchors retargeted to R15's
order, the floors and the device reader, each undoing the same rule, and 23
new `r3-*`): 160 of 160 killed, control 345 of 345, the 2 documented blind
spots; the first full run left 4 alive (three of round 1's copy mutants,
which round 1's cowplot test had killed until this round moved cowplot's
rows to "Not read", and `r3-02-docstring-is-code`, a branch no input
reaches, now removed): tests for the first three came first, then the
run. Record 13's spec 4 of 4 killed (control 175 of 175); record 26's 57 of
57 killed (control 517 of 517) and its 1 blind spot (both run before the
import-placement and bracket edits above, in files neither spec mutates).

**The review's own partition on this code** (the reviewer's driver, cases
and truth runners, a production build of the code before the last
import-placement edit, whose scripts are re-run after it above): 258 runs (the 182 of
rounds 1 and 2, the round's 61 new runs, 9 runs of the siblings found here,
6 on the French page): 0 copied scripts raise (round 3's code: 5 of 5 in my
reproduction of R3-02 at 10 × 7 in; the reviewer counted 10 of 10), 0
element-runs lowered but the known conditional reset (`s1`, section 10;
round 3's code: 12 in the 3 runs of R3-01 I reproduced, 14 in the
reviewer's), 0 unmarked
first-check false passes or re-check false greens outside `py09` (2 and 6,
several figures, out of scope), 0 marked re-check false greens (R3-03's
`t13` and `t37`: 4 before), and every device script's own file passes with
no `poster_figure.png` written (`t21`, `t22`, `t23`, `t33` at 10 × 7 and
6 × 4.5 in). The all-pass line over a failing figure: 9 first checks (2
`py09`, 6 on a scale marked `*`, 1 with only marked rows failing) and 3
re-checks (all `py09`). Cuts: `py08` at 4 × 3 in (R3-05, accepted) and
axis titles at 6 × 4.5 in in 5 scripts with an unread `font.size` and no
layout call (`t01`–`t04`, `t14`; the case above). The one-number
advice, applied as the user is told on all 60 offers (the reviewer's
`advice3.mjs`): 0 lowered, 0 errors, and each lifts a failing drawn class
except `q1-rc-font-kwargs` at 6 × 4.5 in, where the applier puts the number
where the script does not read it, as the reviewer found. The editor's
image block (the reviewer's `editor.mjs` on a build of the final code, `t36`
at 14 in with no caption and 8 in with one on the right, `t01` at 14 in):
every panel row equal to the real verdict, the scale within 0.004 of the drawn picture's, no size
lowered, and `t01`'s copied script runs.


## 10. Limits and follow-ups

**Owner questions.**

- **A seaborn grid smaller than the print size** (L 4 above): the gate's
  rule "L not worse than main" is not met (main 0) because the owner's design
  sets the grid to the print size. Setting it only when the grid is larger
  than the print size (`if w0 > W or h0 > H:`) would keep those texts; not
  built: it is a runtime branch, and when the branch is not taken the
  re-check, reading the literal size, would show a lower bound of the printed
  size.
- **A legend wider than the print size leaves room for:** f17 at 4 × 3 in
  (two facets, a legend 2.942 in wide at 14 pt): `tight_layout` gives up and
  warns, and the legend covers the plots (2.484 in² of text under it). The
  original grid printed at that size keeps its layout because its text prints
  at about half its points. Moving such a legend below the plots is not built.
  The same for a cropped save (review round 1): where what a script draws
  outside its plots is wider than the canvas at the sizes needed, the fit
  block cannot fit it, shrinks the figure to a tenth of the canvas and the
  box cuts the rest (MEASURED, shape harness `--dir`, 4 × 3 in only:
  `c-tight-suptitle-high` cut 0.964 in², `p2-tight-figlegend` clip 0.32,
  cut 0.329 and the figure legend over the plots 1.804, `tight-legend-outside`
  clip and cut 0.329; 0 at 6 × 4.5 in for all four). The plots left are
  small; no instrument measures a plot's size.
- **A conditional reset** (review round 1, R1-COND): `sns.set_theme(...)`
  inside an `if` is read as made, so when the branch does not run the table
  shows the reset's smaller sizes (a false fail) and the script writes them
  where the reset would: `r1-conditional-reset` at 14 × 10 in, the title
  12 → 11 pt (20 → 18.33 at print, pass → pass), one of the gate's L 5.
  Conditionals are not on the owner's out-of-scope list; reading both
  branches is not built.

**Out of scope by the owner's design** (read as their regex sees them, in
source order; the shape harness lists each with its measured figure):
several figures in one script (k35: the second figure, a 3 × 3 in sheet, is
short by 7 pt at 6 × 4.5 in; review round 2's `py09_two_figures`, the first
figure's canvas read for the second: 2 first-check false passes, 6 re-check
false greens and 3 all-pass lines over a failing figure in 9 runs, MEASURED
with the review's driver, and the page says nothing about it; f01's loop
over two figures, which lowered 1–9 pt, no longer does since round 2),
a size set in a function called later (f04), `rc_context`'s end (f07: the
figure made after the with-block is read at the context's sizes and passes
falsely), `style.context`/`rc_context` scope after the script (k13, k14: the
figure left open, drawn again after the block, keeps 23 pt tick labels while
the tick locator reads the restored default size, 11 labels, overlapping
0.0509 in²), threads, notebooks with many figures, loops beyond the
tick-label loop idiom.

**Layout costs** (the shape harness's known list, `lib/checker-shape/known.mts`, MEASURED):

- **A layout the script makes stale:** a script that changes its figure after
  its own `tight_layout` (a colorbar, a twin axis, a resize, a title per
  frame: f10, f11, f25, f26, k08, k11, k20, k24, s09). The fixed script
  measures the same as the harness's ideal control (the needed sizes at their
  source) in each of the 26 stale tags outside the seaborn grids it sets to
  the print size; only the fresh
  control, which runs the layout again before every save, does better (f10 at
  4 × 3 in crosses 1.505 in², the fresh control 0.918). That needs a layout
  call the script does not make; part 1's replay did it at runtime.
- **Seaborn grids at the print size:** facet titles, labels, legends and a
  raised suptitle at their minimum do not all fit at 4 × 3 in (k32 crosses
  1.393 in², k10 0.257, f20 0.148, f17 above), or at 6 × 4.5 in for k32
  (0.258); the controls keep the grid's own, larger size.
- **A raised suptitle in room the script fixed by hand:** k11 at 4 × 3 in
  (a jointplot, `subplots_adjust(top=0.92)`): the suptitle at the needed
  29 pt puts 0.342 in² of text under it; the ideal control keeps suptitles at
  the script's size (the suptitle is raised by the owner's rule).
- **f06** (6 × 4.5 in): sizes the code leaves out are set before the figure,
  which the raised-first control measures too (clip 0.062, cross 0.065 in²);
  the ideal raises them where matplotlib reads them (0).
- **Legend titles follow legend text** (kept from part 1, an owner policy):
  f32 at 4 × 3 in crosses 1.394 in² and constrained layout warns.

**Other limits.**

- Rows for text the code does not draw (a Python plot title or legend the
  script never makes; an R legend, strip or caption) are still shown, at the
  default size and unmarked, as on main, and the script sets them (INSPECTED;
  harmless, but the table can say a missing legend fails, and "N of M below
  the minimum" counts them). Since review round 2 a Python row of that kind
  no longer drives the one-number advice; R cannot tell (a legend depends on
  the aesthetics mapped).
- **Review round 2's readings that err on the side of a false fail, never a
  false pass (INSPECTED):** a floor (P21, R10) is read as its N, a lower
  bound of what prints; a legend row is the smallest of the plot's legend
  size and each guide's own (R13), whether or not a legend without a guide
  theme is drawn; a pandas `scatter(c=...)` naming a column is taken to draw
  a colorbar unless the name is a matplotlib colour (a column called "red"
  is read as a colour, so no colorbar row: the one way this rule can miss).
- **R, several plots in one script** that are not combined: the last
  `ggsave()` (or device) is read with every `theme()` before it, as on main
  (the review's `r11_two_plots` held at 3 sizes), except that since review
  round 3 a theme held in the saved plot's name applies where the name is
  used (R15), so a `theme()` that only previews another version of it
  (`print(p + theme(...))`) no longer outranks the plot's own complete theme
  (MEASURED, `r3-preview-print`); with no complete theme in the plot it still
  does (INSPECTED). Since round 3 a plot a
  device draws on a line of its own (auto-printed by `Rscript`, not by
  `source()`) is read, and the edited script prints it, so it draws under
  both.
- **R15's limits (review round 3, INSPECTED):** a name is followed from its
  last assignment at the top level before the use; a function whose body
  uses a name assigned only after the function is written, a local variable
  in a function that shares a global theme's name, or a column named like a
  plot (`aes(x = p)`) can be followed wrongly; names are followed three deep
  (a call inside a name is placed in the gap after the use, split by the
  name's length at each level: three levels of names a few hundred
  characters long stay apart in double precision, while three nested names
  each thousands of characters long, in a script of 100,000, could tie). A theme from outside the script
  under a name that is not `theme_*` (`+ my_theme()` from a `source()`d file)
  is not seen: base 11 is assumed and set at the root, which lowers the text
  if that theme draws larger (UNVERIFIED how common; PLAN.md Later). The
  reviewer's other proposal for P13B-R3-01, treating a combined plot's base
  as unread when its theme cannot be traced, is not built: following the
  names traced every case of the corpora and of the review's partition, and
  a theme outside the script leaves no trace to detect.
- **An unread `font.size` is floored at the largest need of the classes
  that follow it** (review round 2's choice, `max(N, float(EXPR))` on the
  user's line), so the others print larger than they need: at 6 × 4.5 in
  `r3-configparser-fontsize` gets `font.size` 20, its ticks and legend 20 pt
  where 15 would do, and with no layout call of its own the edited script
  cuts 0.607 in² of axis title at the canvas edge where the ideal control
  (each listed class at its own need) cuts 0.316 (MEASURED, shape harness
  `--dir`; `r3-rc-font-kw-unread` the same, `r3-argparse-update` 0.141
  against 0.080). A readable `font.size` gets a key per class instead, as a
  seaborn context the check cannot read does; giving an unread one per-key
  floors (`max(N, FontProperties(size=rcParams[key]).get_size_in_points())`
  after the `font.size` line) would match the ideal; not built (PLAN.md
  Later). A caption that follows an unread `font.size` and falls short gets a
  plain `fontsize=N` (INSPECTED; no corpus script).
- **A Python `fontdict=` the check cannot see into** (a call's result) is
  the one unread size still raised only where it falls short, with a plain
  `fontsize=N` (review round 1's choice), which would lower a larger size
  the dict sets (INSPECTED; no corpus script); where it passes it is left as
  written and the legend says so (`unreadBodyKept`).
- **Devices not read** (review round 3): svglite (UNVERIFIED: not
  installed), and a plot drawn with `plot(p)` or `grid.draw()`: the page says
  it found the device but not its plot, and the script saves
  `poster_figure.png` at the size checked.
- **An R canvas the check cannot read** (`ggsave(width = cfg$width)`) is set
  to the size checked, so text the original's smaller canvas printed larger
  prints at 1.0 × (the gate's L 15 on `r2-config-list`, every verdict kept,
  Lsrc 0). Setting `min(cfg$width, W)` instead would keep the larger print but
  mixes units; not built.
- **The fit block at a small print size** (review round 2, R2-12; review
  round 3, P13B-R3-05, accepted): when what a script draws outside its plots
  is wider than the canvas at the sizes needed, the fit stops at a tenth of
  the canvas and the box cuts the rest (above); the page cannot know this
  before the script runs, so its ✓ and all-pass line stand there (the
  review's py08 at 4 × 3 in: the legend entry "Rescue" cut, the re-check all
  ✓; section 9 has the numbers). The copy says the crop's text is kept when
  it fits. Withholding the ✓ for a tight save "at a small print size" needs
  the extents of what is drawn outside the plots, which only the run knows;
  a print-size threshold would be a guess the measurements do not support.
  Re-running the script's own layout inside the fit loop is not built
  (PLAN.md Later).
- `ReadabilityPanel.tsx` is 1247 lines (1208 on main), over the 800-line
  rule before this fix; a split is its own change. The checker's own modules
  are each under 640 lines (`readability.ts` went from 2358 to 617).
- The rule table reads what its regex sees. Since review round 1 a `**`
  dict, a `fontdict=` or `prop=` dict or `FontProperties` held in a name are
  read; a size built by string formatting, a `**` the check cannot resolve
  (a parameter, a call's result) or a `FontProperties` with no size is left
  as written and its row stays marked, and the panel says to check it by
  hand. If such a row falls short, the fix list names it but the script
  cannot raise it (INSPECTED; no corpus script does this). A custom
  matplotlibrc or a theme set outside the script is covered by design: the
  script sets every assumed size explicitly.
- **Text grown past a canvas the script fixes** (review round 1, the gate's
  INFO `cutPlain`): a script with no layout call of its own whose raised axis
  title no longer fits the canvas is cut at its edge, 13 runs (main 9, the
  same scripts and four more the fix now raises); in each of the 23 script ×
  size runs the shape harness measured (`--dir`, 8 scripts at 6 × 4.5, 8 × 6
  and 10 × 7 in), the fixed script's clip and cut equal the ideal control's
  (the needed sizes at their source, no Postr code) exactly, from 0 to
  0.595 in²: the cost of the size in the script's own layout, not of the fix.
  Since review round 3, 17 runs (main 10): the 4 more are `r3-*` scripts at
  6 × 4.5 in with an unread `font.size`, whose fix costs more than the ideal
  (the item on an unread `font.size` above).
- **A complete R theme that is not ggplot2's:** the floor uses
  `complete_theme()` (ggplot2 3.5 and later); since review round 3 every row
  resting on the theme gets it, short or not (before, a passing one was left
  marked); R1-05's numbers are for cowplot 1.2.0.
- **patchwork** (review round 1, R1-17; review round 2, R12; UNVERIFIED:
  patchwork is not installed): a plot written as patchwork operators on plot
  names (`p1 | p2`, with `library(patchwork)`) is read as a combined figure,
  each plot on its own, and themed in each plot before it is combined, as
  cowplot and gridExtra are (MEASURED for those two); the operators on
  anything else (`p1 + theme(...) | p2`) are not read as combining.
- **Several saves:** the fit block goes before the first cropped save after
  the figure is made, and every cropped save after it writes the box; a
  figure changed between two saves is out of scope (several figures).
- Versions: measured on matplotlib 3.10.8, seaborn 0.13.2, ggplot2 4.0.3 only.
- The harnesses: the Firefox and WebKit runs read the clipboard through the
  init script, not the system clipboard; the R gate has no all-pass-banner
  judgement; the shape harness's layout controls keep a grid's own size, so
  they cannot say what a grid at the print size would cost with the text
  sized by any other rule.
