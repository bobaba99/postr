# Figure readability checker — stress test

The feature: **FIGURE → Check a figure**. Paste your R (ggplot2) or Python
(matplotlib/seaborn) plotting code; it parses the figure's canvas size and font
sizes, computes what each text element will measure once the figure is printed
at its size on the poster, and reports pass/warn/fail plus a recommended
`base_size` and a copy-ready snippet.

Tested in Chrome against a local dev server and an isolated local Supabase
stack. Every case below was pasted into the real textarea and checked with the
real button. Cases marked **(static)** come from reading the parser and are
high-confidence but were not individually driven in the browser.

## Why this matters more than the editor bugs

A researcher uses this tool *instead of* printing a test poster. When it says
PASS, they stop checking. So a **confidently wrong PASS is the worst possible
output** — worse than a crash, which at least tells them something is wrong.
Seven of the findings below produce exactly that.

The core arithmetic is sound. Every defect here is in **reading the code**, and
almost all of them fail *silently* — no warning, no "couldn't parse this".

---

## FR1 — Faceting doubles the reported print size and flips FAIL → PASS · critical

**Repro** Paste, Check. Then delete the `facet_grid` line and Check again.

```r
library(ggplot2)
ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  facet_grid(gear ~ cyl) +
  theme_minimal(base_size = 11)
ggsave("fig.png", width = 9, height = 6)
```

**Measured, same figure, only the facet line differs**

| | scale | Axis titles | Tick labels | verdict |
|---|---|---|---|---|
| without `facet_grid` | 1.11x | 12.2pt | 9.8pt | ✗ FAIL, fix base_size 17 |
| with `facet_grid`    | **2.22x** | **24.4pt** | **19.6pt** | ✓ **PASS**, no fix offered |

**Why it's wrong** Adding a faceting line changes neither the figure's physical
size nor its font sizes. A 9×6in figure in a 10×7in block scales by
min(10/9, 7/6) = 1.11 whether or not it is faceted. The parser divides the
canvas by the facet grid *before* computing the scale, so more panels →
"smaller canvas" → larger scale factor.

`facet_grid` is also hardcoded to a 2×2 grid regardless of the real number of
levels (`gear ~ cyl` in mtcars is 3×3), so the inflation is arbitrary.

The same mechanism fires in Python for `plt.subplots(2, 3)` **(static:** measured
1.75x where 0.67x is correct — a 2.6× overstatement, all rows green**)**.

`readability.ts:176-177` — `effectiveCanvasWidth: width / facetCols`,
`effectiveCanvasHeight: height / facetRows`; `:168` — `if (fgrid) { facetRows = 2; facetCols = 2; }`

---

## FR2 — Per-axis font overrides are ignored; 7pt labels reported as 16pt PASS · critical

```r
library(ggplot2)
ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  theme_minimal(base_size = 20) +
  theme(axis.text.x = element_text(size = 7),
        axis.title.x = element_text(size = 26))
ggsave("fig.png", width = 7, height = 5)
```

**Measured** Tick labels reported **16pt → 22.4pt ✓ PASS**. Every row passes.
**Reality**: the code sets x tick labels to **7pt**, which prints at 9.8pt —
well under the 14pt minimum.

**Why** The override patterns are bare `axis\.text` / `axis\.title` followed
immediately by `\s*=`. Against `axis.text.x =` the regex hits `.x` where it
needs `=` and fails. Per-axis selectors are *the* standard ggplot idiom
(rotated x labels, different y sizing) — the exact case this tool exists to
catch. The same `[^)]*` also drops a size that follows a nested call, e.g.
`element_text(margin = margin(t = 8), size = 9)`.

`readability.ts:105-106, :114`

---

## FR3 — `ggsave()` with a nested call: canvas silently ignored, scale pinned to 1.00x · critical

```r
ggsave(filename = file.path("out", "fig.png"), plot = p,
       width = 12, height = 9, dpi = 300)
```

**Measured, identical figure**

| `ggsave` form | scale | Axis titles | advice |
|---|---|---|---|
| `filename = file.path("out","fig.png")` | **1.00x** | **11pt** | base_size 18 |
| `"fig.png"` (plain string) | 0.78x | 8.6pt | base_size 24 |

0.78x is correct. The nested-paren form overstates print size by ~28%, and its
advice (18) still fails at the true scale: 18 × 0.78 = 14pt against an 18pt
minimum.

**Why, and why it's the worst kind of silent** `/ggsave\s*\([^)]*\)/` stops at
the first `)` — the one closing `file.path(`. Width/height are never seen. But
because `ggsave` still *matched*, the "no ggsave found" warning in the `else`
branch never fires. The canvas then falls back to **the figure preview's own
dimensions**, which makes the scale exactly 1.00x — indistinguishable from a
perfect match. `file.path()`, `here::here()`, `paste0()` and `glue()` all
trigger it.

`readability.ts:138` (matcher), `:152-158` (warning is in the unreached `else`)

---

## FR4 — `units = 'cm'` in single quotes is read as inches · critical

```r
ggsave("fig.png", p, width = 20, height = 14, units = 'cm', dpi = 300)
```

**Measured**

| quotes | scale | Axis titles | advice |
|---|---|---|---|
| `'cm'` | **0.50x** | **5.5pt** | base_size **36** |
| `"cm"` | 1.27x | 14pt | base_size **15** |

1.27x is correct (20×14 cm = 7.87×5.51 in). R treats both quote styles
identically; the units regex accepts double quotes only, so the cm→in
conversion is skipped and the canvas is read as 20×14 **inches** — a 2.54×
error per axis. Acting on the advice (36 instead of 15) would wreck the figure.
Same blind spot for `'mm'` and `'px'`.

`readability.ts:143` — `/units\s*=\s*"(\w+)"/`

---

## FR5 — `base_size` that isn't the first argument is ignored, and the fix shrinks your real font · critical

```r
theme_bw(base_family = "Helvetica", base_size = 22)
```

**Measured** Source reported as **11pt** (the library default) — the code says
**22pt**. No warning. Recommended fix: **base_size = 13**.

Following that advice changes a real 22pt base to 13pt — **shrinking the text
by 41%** and turning a comfortably-passing figure (22 × 1.4 = 30.8pt) into a
borderline one (18.2pt).

**Why the warning doesn't save you** The regex requires `base_size` immediately
after the open paren. The "No font size found" warning is guarded by
`if (!code.match(/base_size\s*=/))` — and `base_size =` *is* present in the
text, so the warning is suppressed precisely when it is needed.

`readability.ts:97` (regex), `:100` (suppressed warning)

---

## FR6 — `base_size` is read from commented-out code · critical

```r
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  theme_minimal(base_size = 11)
# tried theme_minimal(base_size = 30) first, way too large
ggsave("fig.png", p, width = 7, height = 5)
```

**Measured** Axis titles source = **30pt** → 42pt → ✓ PASS, everything green.
**Reality**: the live code is 11pt → 15.4pt, which FAILS the 18pt minimum.

The base_size loop keeps the **last** match in the file and comments are never
stripped. Leaving a commented-out experiment beside the live line is completely
ordinary practice.

The mirror-image bug exists in Python **(static)**: the figsize regex is
non-global, so the **first** occurrence wins — a commented-out draft `figsize`
higher in the script becomes the canvas.

`readability.ts:97-99` — `while ((m = themeBase.exec(code)) !== null) baseSize = …`

---

## FR7 — A fully-styled theme yields `theme_minimal(base_size = 0)` · major

```r
theme_minimal(base_size = 14) +
  theme(axis.text = element_text(size = 10), axis.title = element_text(size = 12),
        legend.text = element_text(size = 10), legend.title = element_text(size = 12),
        plot.title = element_text(size = 16), strip.text = element_text(size = 11),
        plot.caption = element_text(size = 8))
```

**Measured** Five elements FAIL, and the panel offers
**"Recommended fix (base_size = 0)"** with the snippet
`theme_minimal(base_size = 0)` — code that would destroy the figure.

The suggestion loop returns 0 for any element that has an override; with all
seven overridden, `Math.max(...[0,0,0,0,0,0,0])` = 0. The same exclusion means
that in partial cases **the recommended base_size can leave a failing element
unfixed**, because overridden rows are dropped from the calculation entirely.

---

## FR8 — Stale results are shown beside a live language label · major

**Repro** Check some Python code. Then replace the textarea with R code. Do not
press Check.

**Measured** The header updates live to **"Detected: R / ggplot2"** while the
table below still shows the Python element set and the recommended fix still
reads **`plt.rcParams['font.size'] = 24`** — a Python snippet under an R label.
Nothing marks the result as stale.

Not re-running on every keystroke is a deliberate, defensible choice. Showing a
*live* detection line above *pinned* results is what makes it misleading.

Related **(static)**: the results table is also not invalidated when the image
block is resized after a check, and "Open full edited code" serves the snapshot
from the last Check, silently discarding edits made since.

---

## FR9 — Clicking any text block destroys the pasted script · major

**Repro** Paste a script, Check, then click a text block on the canvas to look
at something. Return to FIGURE → Check a figure.

**Measured** The sidebar is yanked to EDIT BLOCK; on return the textarea is
**empty** and the status has reset to "Auto-detect waiting for code…". The
script and results are gone — no confirmation, no undo.

Image and chart selections are exempted from the auto-route; every other block
type falls through to the Edit tab and the panel unmounts.

`Sidebar.tsx:344-363`

---

## Python-side findings (static)

Same class of silent parse failure, not individually browser-driven:

- **`plt.rcParams.update({...})`** — the most common way to set matplotlib fonts
  — matches nothing. A 22pt figure is reported as a 10pt disaster and the
  offered fix is a no-op.
- **`sns.set_context("poster", font_scale=0.55)`** — the `font_scale` argument is
  discarded; only the context name is read, roughly doubling the reported size.
- **`set_xlabel("Time (min)", fontsize=10)`** — `[^)]*` cannot cross the `)` in
  the label text, so the explicit fontsize is dropped. Units in parentheses
  appear in nearly every real axis label.
- **`figsize=(18/2.54, 12/2.54)`** — arithmetic isn't matched; scale collapses to
  1.00x.
- **plotnine** (Python, ggplot syntax) is detected as R, so its underscore
  overrides (`axis_text_x`) are all dropped → confident all-PASS on an 8pt figure.
- **Base-R graphics** (`par(cex.lab=…)`, `plot()`) scores 0/0 → language is null,
  but the Check button is enabled and is a silent no-op that also clears the
  previous result while claiming to be "waiting for code".

---

## What works

- The **arithmetic is correct** whenever parsing succeeds: base_size 11 at scale
  1.40 gives 15.4pt, and the per-element relative multipliers (title 1.2, ticks
  0.8, caption 0.67) are applied correctly.
- The **recommendation is sound in the simple case**: for the baseline figure it
  suggested base_size 13, and 13 does make every element clear its minimum.
- **Language auto-detection** works on ordinary ggplot and matplotlib scripts.
- The **figure preview overlay** is a genuinely good idea — sizing against
  something visible on the canvas beats asking the user to type dimensions.
- The `(default block size)` caveat on the scale line is honest when it appears.

---

## The one-line summary

The engine is fine; the parsers are a set of regexes that fail open. The single
highest-value change would be to **fail loudly instead of silently**: whenever a
`ggsave`/`figsize`/`base_size`/override pattern is present in the text but not
successfully parsed, say so, rather than substituting a default that reads as a
clean result. Six of the nine findings above would become visible to the user
immediately.
