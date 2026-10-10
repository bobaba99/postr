// apps/web/src/poster/__tests__/readability.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  detectLanguage,
  describePlotCode,
  languageSignals,
  type FigureParams,
  type ReadabilityResult,
} from '../readability';
import { generateTargetedFullFix } from '../readabilityFullFix';

describe('parseRCode', () => {
  it('extracts base_size from theme_minimal(base_size = 24)', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point() + theme_minimal(base_size = 24)`;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(24);
  });

  it('extracts ggsave dimensions in inches', () => {
    const code = `ggsave("fig.png", width = 10, height = 7, units = "in")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('converts cm units to inches', () => {
    const code = `ggsave("fig.png", width = 25.4, height = 17.78, units = "cm")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBeCloseTo(10, 1);
    expect(p.canvasHeight).toBeCloseTo(7, 1);
  });

  it('converts mm units to inches', () => {
    const code = `ggsave("fig.png", width = 254, height = 177.8, units = "mm")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBeCloseTo(10, 1);
    expect(p.canvasHeight).toBeCloseTo(7, 1);
  });

  it('handles px units with dpi', () => {
    const code = `ggsave("fig.png", width = 3000, height = 2100, units = "px", dpi = 300)`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('uses defaults when base_size missing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()`;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(11);
    expect(p.warnings).toContain('No base_size found — assuming ggplot2 default base_size = 11pt.');
  });

  it('FR3: reads ggsave() whose filename is a nested call', () => {
    // `/ggsave\s*\([^)]*\)/` stopped at the first ')' — the one closing
    // file.path( — so width/height were never seen. Worse, because
    // ggsave still MATCHED, the "no ggsave found" warning sat in an
    // unreachable else and the canvas silently fell back to 7x7, which
    // reads as a perfect 1.00x scale rather than as a parse failure.
    const nested = `ggsave(filename = file.path("out", "fig.png"), plot = p,
                           width = 12, height = 9, dpi = 300)`;
    const plain = `ggsave("fig.png", plot = p, width = 12, height = 9, dpi = 300)`;
    expect(parseRCode(nested).canvasWidth).toBe(12);
    expect(parseRCode(nested).canvasHeight).toBe(9);
    // Identical figure, identical answer.
    expect(parseRCode(nested).canvasWidth).toBe(parseRCode(plain).canvasWidth);
  });

  it('FR3: handles here::here, paste0 and glue the same way', () => {
    for (const fn of ['here::here("figs", "f.png")', 'paste0(dir, "/f.png")', 'glue("{dir}/f.png")']) {
      const p = parseRCode(`ggsave(${fn}, width = 8, height = 5)`);
      expect(p.canvasWidth).toBe(8);
      expect(p.canvasHeight).toBe(5);
    }
  });

  it('FR3: a parenthesis inside the filename string does not end the call', () => {
    const p = parseRCode(`ggsave("fig (final).png", width = 8, height = 5)`);
    expect(p.canvasWidth).toBe(8);
    expect(p.canvasHeight).toBe(5);
  });

  it('FR3: does not read width from a nested call argument', () => {
    // Only top-level ggsave arguments count; a `width` belonging to some
    // inner call must not be mistaken for the canvas width.
    const p = parseRCode(`ggsave("f.png", plot = wrap_plots(width = 3), width = 12, height = 9)`);
    expect(p.canvasWidth).toBe(12);
  });

  it('FR3: warns when ggsave is present but its size cannot be read', () => {
    // The fail-open case: ggsave matched, so the old code took the
    // "we have a canvas" path while holding a default.
    const p = parseRCode(`ggsave("fig.png", plot = p, dpi = 300)`);
    expect(p.warnings.join(' ')).toMatch(/ggsave/i);
  });

  it('FR4: single-quoted units are read exactly like double-quoted ones', () => {
    // R treats both quote styles identically; the units regex accepted
    // double quotes only, so cm->in conversion was skipped and a 20x14cm
    // canvas was read as 20x14 INCHES — a 2.54x error per axis that made
    // the tool recommend base_size 36 instead of 15.
    const dbl = parseRCode(`ggsave("fig.png", p, width = 20, height = 14, units = "cm", dpi = 300)`);
    const sgl = parseRCode(`ggsave("fig.png", p, width = 20, height = 14, units = 'cm', dpi = 300)`);
    expect(sgl.canvasWidth).toBeCloseTo(dbl.canvasWidth, 6);
    expect(sgl.canvasHeight).toBeCloseTo(dbl.canvasHeight, 6);
    expect(sgl.canvasWidth).toBeCloseTo(20 / 2.54, 3);
  });

  it('FR4: single-quoted mm and px convert too', () => {
    const mm = parseRCode(`ggsave("f.png", width = 200, height = 140, units = 'mm')`);
    expect(mm.canvasWidth).toBeCloseTo(200 / 25.4, 3);
    const px = parseRCode(`ggsave("f.png", width = 3000, height = 2100, units = 'px', dpi = 300)`);
    expect(px.canvasWidth).toBeCloseTo(10, 3);
  });

  it('FR4: warns rather than silently assuming inches for unknown units', () => {
    const p = parseRCode(`ggsave("f.png", width = 20, height = 14, units = 'furlongs')`);
    expect(p.warnings.join(' ')).toMatch(/furlongs/i);
  });

  it('uses defaults when ggsave missing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(7);
    expect(p.canvasHeight).toBe(7);
    expect(p.warnings).toContain('No canvas size found — assuming R default 7"×7" (ggsave).');
  });

  it('FR6: ignores base_size inside a comment, keeping the live value', () => {
    // The base_size loop keeps the LAST match in the file and comments
    // were never stripped, so a commented-out experiment left beside the
    // live line won: 30pt -> 42pt -> everything green, when the live
    // code is 11pt -> 15.4pt and FAILS the 18pt minimum.
    const code = `
      p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
        theme_minimal(base_size = 11)
      # tried theme_minimal(base_size = 30) first, way too large
      ggsave("fig.png", p, width = 7, height = 5)
    `;
    expect(parseRCode(code).baseSize).toBe(11);
  });

  it('FR6: a hex colour is not a comment', () => {
    // The reason this cannot be `/#.*$/gm`: a hex colour would open a
    // "comment" and delete the rest of the line, taking real arguments
    // with it.
    const code = `
      ggplot(df, aes(x, y)) +
        scale_fill_manual(values = c("#FF0000", '#00FF00')) +
        theme_minimal(base_size = 22)
    `;
    expect(parseRCode(code).baseSize).toBe(22);
  });

  it('FR6 (python): ignores figsize inside a comment', () => {
    // Python is the mirror image — its figsize match is non-global, so
    // the FIRST occurrence wins and a commented-out draft higher in the
    // script became the canvas.
    const code = `
      # first try: plt.figure(figsize=(2, 2))
      fig = plt.figure(figsize=(12, 8))
    `;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBe(12);
    expect(p.canvasHeight).toBe(8);
  });

  it('FR5: reads base_size when it is not the first argument', () => {
    // The regex required base_size immediately after the open paren, so
    // this reported 11pt (the library default) and advised base_size 13
    // — shrinking a real 22pt base by 41%.
    expect(parseRCode('theme_bw(base_family = "Helvetica", base_size = 22)').baseSize).toBe(22);
    expect(parseRCode('theme_classic(base_size = 14, base_line_size = 0.5)').baseSize).toBe(14);
  });

  it('FR5: tolerates one level of nesting in the argument list', () => {
    const code = 'theme_bw(base_family = paste0("Hel", "vetica"), base_size = 22)';
    expect(parseRCode(code).baseSize).toBe(22);
  });

  it('FR5: does not capture a base_size outside the theme call', () => {
    // Must not cross a closing paren, or an unrelated variable becomes
    // the figure's base size.
    expect(parseRCode('theme_void()\nmy_base_size = 30').baseSize).toBe(11);
    expect(parseRCode('p + theme_minimal() + labs(title = "x")\nbase_size = 30').baseSize).toBe(11);
  });

  it('extracts individual element overrides', () => {
    const code = `
      ggplot(df, aes(x, y)) + geom_point() +
      theme_minimal(base_size = 14) +
      theme(axis.text = element_text(size = 18),
            plot.title = element_text(size = 28))
    `;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(14);
    expect(p.sizes?.axisText).toBe(18);
    expect(p.sizes?.plotTitle).toBe(28);
  });

  it('FR2: reads per-axis element_text selectors', () => {
    // `axis.text` followed by `\\s*=` could never match `axis.text.x =`
    // — the regex hit `.x` where it needed `=` — so the single most
    // common ggplot idiom parsed to nothing and a 7pt label was reported
    // at 16pt PASS.
    const code = `ggplot(mtcars, aes(wt, mpg)) + geom_point() +
      theme_minimal(base_size = 20) +
      theme(axis.text.x = element_text(size = 7),
            axis.title.x = element_text(size = 26))
      ggsave('fig.png', width = 7, height = 5)`;
    const p = parseRCode(code);
    expect(p.sizes?.axisText).toBe(7);
    // axis.title.y still follows base_size 20: the smaller one, 20, is the row's.
    expect(p.sizes?.axisTitle).toBe(20);

    const r = computeReadability(p, 5, 7);
    expect(r.elements.find((e) => e.name === 'Tick labels')!.status).not.toBe('pass');
  });

  it('FR2: a size after a nested call argument is still read', () => {
    // `[^)]*` could not cross the ')' of an inner call, so the explicit
    // size was dropped.
    const p = parseRCode('theme(axis.text = element_text(margin = margin(t = 8), size = 9))');
    expect(p.sizes?.axisText).toBe(9);
  });

  it('FR2: an un-overridden sibling axis still counts against the score', () => {
    // The trap: overriding ONLY the x axis must not hide the y axis,
    // which still inherits from base_size. Reporting 20pt here while the
    // y labels render at 8 * 0.8 = 6.4pt would be a NEW wrong PASS,
    // introduced by the fix for an old one.
    const p = parseRCode('theme_minimal(base_size = 8) + theme(axis.text.x = element_text(size = 20))');
    const r = computeReadability(p, 5, 7);
    const ticks = r.elements.find((e) => e.name === 'Tick labels')!;
    expect(ticks.sourcePt).toBeCloseTo(6.4, 1);
    expect(ticks.status).not.toBe('pass');
  });

  it('FR2: a bare selector covers both axes', () => {
    // `axis.text` (no suffix) sets every axis, so nothing inherits and
    // the explicit value stands even when base_size is larger.
    const p = parseRCode('theme_minimal(base_size = 40) + theme(axis.text = element_text(size = 9))');
    const r = computeReadability(p, 5, 7);
    expect(r.elements.find((e) => e.name === 'Tick labels')!.sourcePt).toBe(9);
  });

  it('FR2: both axes overridden takes the smaller — the one that fails', () => {
    const p = parseRCode(
      'theme(axis.text.x = element_text(size = 7), axis.text.y = element_text(size = 22))',
    );
    expect(p.sizes?.axisText).toBe(7);
  });

  it('FR2: a partially-overridden element still informs the base_size advice', () => {
    // Interaction with FR7: the y axis still depends on base_size, so
    // this element must NOT be excluded from the recommendation the way
    // a fully-overridden one is.
    const p = parseRCode('theme_minimal(base_size = 8) + theme(axis.text.x = element_text(size = 20))');
    const r = computeReadability(p, 5, 7);
    expect(r.suggestedBaseSize).not.toBeNull();
  });

  it('handles rel() as a multiplier', () => {
    const code = `
      theme_minimal(base_size = 20) +
      theme(axis.text = element_text(size = rel(0.6)))
    `;
    const p = parseRCode(code);
    expect(p.sizes?.axisText).toBeCloseTo(12, 1);
  });

  it('later theme() overrides earlier', () => {
    const code = `
      theme(axis.text = element_text(size = 10)) +
      theme(axis.text = element_text(size = 20))
    `;
    const p = parseRCode(code);
    expect(p.sizes?.axisText).toBe(20);
  });

  it('records the facet grid but does NOT shrink the canvas', () => {
    // Faceting subdivides the PLOTTING area; it changes neither the
    // figure's physical size nor its font sizes. Dividing the canvas by
    // the grid made the scale factor grow with the panel count, which
    // is FR1: adding a facet line flipped a failing figure to PASS.
    const code = `
      ggplot(df, aes(x, y)) + geom_point() +
      facet_wrap(~group, nrow = 2) +
      ggsave("fig.png", width = 10, height = 8)
    `;
    const p = parseRCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.effectiveCanvasHeight).toBe(8);
    expect(p.effectiveCanvasWidth).toBe(10);
  });

  it('FR1: a facet line does not change the reported print size', () => {
    // The regression in its original form. Same figure, same ggsave,
    // one extra line — the verdict must not move.
    const base = `
      library(ggplot2)
      ggplot(mtcars, aes(wt, mpg)) + geom_point() +
        theme_minimal(base_size = 11)
      ggsave("fig.png", width = 9, height = 6)
    `;
    const faceted = base.replace(
      'geom_point() +',
      'geom_point() +\n        facet_grid(gear ~ cyl) +',
    );
    const plain = computeReadability(parseRCode(base), 7, 10);
    const withFacets = computeReadability(parseRCode(faceted), 7, 10);

    expect(withFacets.scale).toBeCloseTo(plain.scale, 6);
    expect(withFacets.elements.map((e) => e.effectivePt)).toEqual(
      plain.elements.map((e) => e.effectivePt),
    );
    // And the honest answer for a 9x6in figure in a 10x7in block is
    // min(10/9, 7/6) = 1.11 — which FAILS an 11pt base.
    expect(plain.scale).toBeCloseTo(1.11, 2);
    expect(plain.elements.find((e) => e.name === 'Axis titles')!.status).toBe('fail');
    expect(withFacets.elements.find((e) => e.name === 'Axis titles')!.status).toBe('fail');
  });
});

describe('parsePythonCode', () => {
  it('extracts figsize', () => {
    const code = `fig, ax = plt.subplots(figsize=(10, 7))`;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('extracts rcParams font.size', () => {
    const code = `plt.rcParams['font.size'] = 18`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(18);
  });

  it('extracts matplotlib.rcParams variant', () => {
    const code = `matplotlib.rcParams['font.size'] = 14`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(14);
  });

  // seaborn 0.13.2 writes every font key as a number: its notebook context
  // (titles and labels 12, ticks and legend 11) × the context × font_scale.
  it('extracts seaborn set_theme font_scale', () => {
    const p = parsePythonCode(`sns.set_theme(font_scale=1.5)`);
    expect(p.sizes).toMatchObject({ plotTitle: 18, axisTitle: 18, axisText: 16.5, legendText: 16.5 });
  });

  it('extracts seaborn set_context', () => {
    const p = parsePythonCode(`sns.set_context("poster")`);
    expect(p.sizes).toMatchObject({ plotTitle: 24, axisTitle: 24, axisText: 22, legendText: 22 });
  });

  it('PY-4: a small ylabel is not hidden by a large xlabel', () => {
    // Same defect class as FR2, still live on the Python side: the code
    // took `(xlabel ?? ylabel)`, so whichever it found first spoke for
    // BOTH axes. A 20pt x label hid a 6pt y label completely.
    const p = parsePythonCode('ax.set_xlabel("A", fontsize=20)\nax.set_ylabel("B", fontsize=6)');
    expect(p.sizes?.axisTitle).toBe(6);
  });

  it('PY-4: one axis set alone still leaves the other inheriting', () => {
    // Only the x label is sized, so the y label renders at
    // font.size * 1.0 and must still count against the score.
    const p = parsePythonCode('plt.rcParams["font.size"] = 8\nfig, ax = plt.subplots()\nax.set_xlabel("A", fontsize=30)\nax.set_ylabel("B")');
    const ticks = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Axis titles')!;
    expect(ticks.sourcePt).toBeCloseTo(8, 1);
  });

  it('reads a base_size held in a name, and warns when it cannot be read', () => {
    // `theme_minimal(base_size = s)` silently reported the 11pt library
    // default (FR5's suppression shape). Fix 13b reads a name assigned a
    // number (rule R8); one it cannot resolve still warns.
    expect(parseRCode('s <- 22\ntheme_minimal(base_size = s)').baseSize).toBe(22);
    const p = parseRCode('theme_minimal(base_size = poster_size())');
    expect(p.warnings.join(' ')).toMatch(/base_size/i);
    expect(p.warnings.join(' ')).toMatch(/variable|could not read|literal/i);
  });

  it('does not warn about variables when the size is a literal', () => {
    const p = parseRCode('theme_minimal(base_size = 22)');
    expect(p.warnings.join(' ')).not.toMatch(/variable/i);
  });

  it('warns that in-panel geom_text labels are not checked', () => {
    // geom_text/annotate sizes are not theme elements, so nothing in the
    // table covers them. A figure with 2mm data labels scored all-green.
    const p = parseRCode('geom_text(aes(label = n), size = 2) + theme_minimal(base_size = 40)');
    expect(p.warnings.join(' ')).toMatch(/geom_text|in-panel/i);
    // ggplot sizes geom_text in MILLIMETRES: 2 * 72.27/25.4 = 5.7pt.
    expect(p.warnings.join(' ')).toMatch(/5\.7\s*pt/);
  });

  it('PY-1: reads font.size from rcParams.update({...})', () => {
    // The most common way to set matplotlib fonts matched nothing, so a
    // 22pt figure was reported as a 10pt disaster and the offered fix
    // was a no-op.
    const p = parsePythonCode(`plt.rcParams.update({"font.size": 22, "axes.labelsize": 24})`);
    expect(p.baseSize).toBe(22);
  });

  it('PY-1: single quotes and matplotlib.rcParams both work', () => {
    expect(parsePythonCode("plt.rcParams.update({'font.size': 18})").baseSize).toBe(18);
    expect(parsePythonCode('matplotlib.rcParams.update({"font.size": 14})').baseSize).toBe(14);
  });

  it('PY-1: the later of update() and item-assignment wins', () => {
    const p = parsePythonCode(`plt.rcParams["font.size"] = 8\nplt.rcParams.update({"font.size": 22})`);
    expect(p.baseSize).toBe(22);
  });

  it('PY-2: applies font_scale passed alongside a context name', () => {
    // `set_context("poster", font_scale=0.55)` discarded font_scale and
    // read only the context, roughly doubling the reported size.
    const p = parsePythonCode('sns.set_context("poster", font_scale=0.55)');
    // poster is 2 × seaborn's notebook sizes; 0.55 brings the titles to 13.2.
    expect(p.sizes?.plotTitle).toBeCloseTo(13.2, 5);
    expect(p.sizes?.axisText).toBeCloseTo(12.1, 5);
  });

  it('PY-2: a context with no font_scale is unchanged', () => {
    expect(parsePythonCode('sns.set_context("poster")').sizes?.plotTitle).toBeCloseTo(24, 5);
  });

  it('PY-3: reads fontsize when the label text contains parentheses', () => {
    // `[^)]*` could not cross the ')' in the label, and units in
    // parentheses appear in nearly every real axis label.
    expect(parsePythonCode('ax.set_xlabel("Time (min)", fontsize=10)').sizes?.axisTitle).toBe(10);
    expect(parsePythonCode('ax.set_ylabel("Rate (n/s)", fontsize=9)').sizes?.axisTitle).toBe(9);
    expect(parsePythonCode('ax.set_title("Result (n=42)", fontsize=12)').sizes?.plotTitle).toBe(12);
  });

  it('extracts per-element overrides', () => {
    const code = `
      ax.set_xlabel("X", fontsize=14)
      ax.set_ylabel("Y", fontsize=14)
      ax.tick_params(labelsize=10)
      ax.set_title("Title", fontsize=20)
    `;
    const p = parsePythonCode(code);
    expect(p.sizes?.axisTitle).toBe(14);
    expect(p.sizes?.axisText).toBe(10);
    expect(p.sizes?.plotTitle).toBe(20);
  });

  it('records the subplots grid but does NOT shrink the canvas', () => {
    // Python mirror of FR1. plt.subplots(2, 3) on a 12x8in figure was
    // reported at 1.75x where 0.67x is correct — a 2.6x overstatement
    // that turned every row green.
    const code = `fig, axes = plt.subplots(2, 3, figsize=(12, 8))`;
    const p = parsePythonCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.facetCols).toBe(3);
    expect(p.effectiveCanvasHeight).toBe(8);
    expect(p.effectiveCanvasWidth).toBe(12);
  });

  it('uses defaults when figsize missing', () => {
    const code = `plt.plot(x, y)`;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBeCloseTo(6.4, 1);
    expect(p.canvasHeight).toBeCloseTo(4.8, 1);
    expect(p.warnings).toContain('No canvas size found — assuming matplotlib default 6.4"×4.8"; the edited script sets it.');
  });
});

describe('ParseOptions.defaultSizeLabel', () => {
  // The editor's Check tab sizes against a canvas overlay ("figure
  // preview"); the public page sizes against a typed print size. The
  // caller names the fallback canvas so the warning reads right on both.
  it('names the overlay by default when R code has no ggsave()', () => {
    const p = parseRCode('ggplot(df, aes(x, y)) + geom_point()', {
      defaultWidthIn: 10,
      defaultHeightIn: 7,
    });
    expect(p.warnings).toContain(
      'No ggsave() found — using figure preview size 10.0"×7.0" as the source canvas.',
    );
  });

  it('uses the caller-supplied label in the R warning', () => {
    const p = parseRCode('ggplot(df, aes(x, y)) + geom_point()', {
      defaultWidthIn: 10,
      defaultHeightIn: 7,
      defaultSizeLabel: 'the print size you entered,',
    });
    expect(p.warnings).toContain(
      'No ggsave() found — using the print size you entered, 10.0"×7.0" as the source canvas.',
    );
  });

});

// Fix 13, claim CANVAS (docs/fixes/13-checker-reads-its-own-fix.md): with
// no literal figsize the checker took the print size as the canvas (scale
// 1), while matplotlib draws at rcParams['figure.figsize'], 6.4 × 4.8 in
// unless the script sets it, or at what set_size_inches says. Measured
// against real matplotlib: the scale wrong in 16 of 16 page runs. The
// expected canvases below are what matplotlib 3.10.8 reports for each
// script (checker-truth-check.mjs's truth runner).
describe('the Python canvas follows matplotlib', () => {
  it('with no figsize, the canvas is matplotlib\'s default, whatever the print size', () => {
    const p = parsePythonCode('import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.plot(x, y)', {
      defaultWidthIn: 24,
      defaultHeightIn: 18,
      defaultSizeLabel: 'the print size you entered,',
    });
    expect([p.canvasWidth, p.canvasHeight]).toEqual([6.4, 4.8]);
  });

  it('rcParams figure.figsize sets the canvas of a figure made without figsize', () => {
    for (const line of [
      "plt.rcParams['figure.figsize'] = (4, 3)",
      "mpl.rcParams['figure.figsize'] = [4, 3]",
      "plt.rcParams.update({'font.size': 12, 'figure.figsize': (4, 3)})",
    ]) {
      const p = parsePythonCode(`import matplotlib.pyplot as plt\n${line}\nfig, ax = plt.subplots()`, { defaultWidthIn: 10, defaultHeightIn: 7 });
      expect([p.canvasWidth, p.canvasHeight], line).toEqual([4, 3]);
    }
  });

  it('set_size_inches sets the canvas, over the figsize the figure was made with', () => {
    for (const call of ['fig.set_size_inches(10, 7)', 'fig.set_size_inches((10, 7))', 'fig.set_size_inches(10, 7, forward=True)']) {
      const p = parsePythonCode(`import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(6, 4))\n${call}`);
      expect([p.canvasWidth, p.canvasHeight], call).toEqual([10, 7]);
    }
  });

  it('a figsize given as names assigned numbers is read (Postr\'s own generated code)', () => {
    const p = parsePythonCode('fig_w = 10\nfig_h = 7.5\nfig, ax = plt.subplots(figsize=(fig_w, fig_h))');
    expect([p.canvasWidth, p.canvasHeight]).toEqual([10, 7.5]);
    expect(p.warnings.some((w) => /figsize|canvas size/i.test(w))).toBe(false);
  });

  it('the idioms the step 9 review found misread, each as matplotlib 3.10.8 sizes it', () => {
    const cases: Array<[string, [number, number]]> = [
      ['fig, ax = plt.subplots()\nfig.set_size_inches(w=10, h=7.5)', [10, 7.5]],
      ['fig, ax = plt.subplots()\nfig.set_size_inches(10, h=7.5)', [10, 7.5]],
      ['FIGSIZE = (8, 6)\nfig, ax = plt.subplots(figsize=FIGSIZE)', [8, 6]],
      ["plt.rcParams['figure.figsize'] = 4, 3\nfig, ax = plt.subplots()", [4, 3]],
      ["plt.rc('figure', figsize=(10, 7.5))\nfig, ax = plt.subplots(figsize=(4, 3))", [4, 3]],
      ["plt.rc('figure', figsize=(10, 7.5))\nfig, ax = plt.subplots()", [10, 7.5]],
      ['w = 8\nfig, ax = plt.subplots(figsize=(w, 3))\nw = 4', [8, 3]],
      ['note = "figsize=(2, 2)"\nfig, ax = plt.subplots(figsize=(9, 6))', [9, 6]],
    ];
    for (const [code, canvas] of cases) {
      const p = parsePythonCode(`import matplotlib.pyplot as plt\n${code}`);
      expect([p.canvasWidth, p.canvasHeight], code).toEqual(canvas);
    }
  });

  it('a placeholder that is not a number leaves the default canvas, never NaN', () => {
    const p = parsePythonCode('import matplotlib.pyplot as plt\nFIG_W = ...\nfig, ax = plt.subplots(figsize=(FIG_W, 4))');
    expect([p.canvasWidth, p.canvasHeight]).toEqual([6.4, 4.8]);
  });

  it('a long script parses in linear time (the step 9 review timed 21 s on 200 KB)', () => {
    for (const code of [`figsize=(a${' '.repeat(200_000)}`, `fig.set_size_inches(a${' '.repeat(200_000)}`,
      `plt.rcParams['figure.figsize'] = (a${' '.repeat(200_000)}`, 'fig, ax = plt.subplots(figsize=(w, h))\n'.repeat(3_200),
      // Round 2 (R2-09): long runs of digits.
      `w = ${'9'.repeat(20_000)}`, `figsize=(${'9'.repeat(50_000)}`, `fig.set_size_inches(${'9'.repeat(50_000)}`]) {
      const t0 = performance.now();
      parsePythonCode(code);
      expect(performance.now() - t0, code.slice(0, 30)).toBeLessThan(1_000);
    }
  });

  it('a size written with a trailing dot is read (round 3, R3-06)', () => {
    const p = parsePythonCode('fig, ax = plt.subplots(figsize=(12., 9.))\nfig.savefig("f.png")');
    expect([p.canvasWidth, p.canvasHeight]).toEqual([12, 9]);
  });

  it('the last set_size_inches is the canvas, as in matplotlib', () => {
    const p = parsePythonCode('fig, ax = plt.subplots()\nfig.set_size_inches(4, 3)\nax.plot(x, y)\nfig.set_size_inches(8, 6)');
    expect([p.canvasWidth, p.canvasHeight]).toEqual([8, 6]);
  });

  it('a figsize given as names assigned together is read (the line Postr generates)', () => {
    // charts/codegen/toPython.ts writes exactly this pair of lines.
    const p = parsePythonCode('fig_w, fig_h, dpi = 8, 5.6, 300\nfig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)');
    expect([p.canvasWidth, p.canvasHeight]).toEqual([8, 5.6]);
  });
});

describe('language detection patterns', () => {
  // ── R code that should be detected as R ──────────────────────────

  it('detects basic ggplot as R', () => {
    const code = `library(ggplot2)\nggplot(df, aes(x=time, y=score)) + geom_line()`;
    expect(detectLanguage(code)).toBe('r');
  });

  it('detects pipe operator + ggplot as R', () => {
    const code = `df %>% ggplot(aes(x, y)) + geom_point() + theme_bw()`;
    expect(detectLanguage(code)).toBe('r');
  });

  it('detects base R plot with main= and axis labels as R', () => {
    // main=, xlab= and ylab= are base graphics arguments that matplotlib
    // never takes (fix 15). This test used to pin null: before fix 15 a
    // null left Check doing nothing, now the base R plot is named as
    // unsupported instead of scored as ggplot2.
    const code = `plot(x, y, main="Title", xlab="X", ylab="Y")`;
    expect(detectLanguage(code)).toBe('r');
    expect(describePlotCode(code).system).toBe('base');
  });

  it('detects cowplot multi-panel as R', () => {
    const code = `library(cowplot)\nplot_grid(p1, p2, ncol=2)`;
    expect(detectLanguage(code)).toBe('r');
  });

  it('detects ggpubr as R', () => {
    const code = `library(ggpubr)\nggboxplot(df, x="group", y="value")`;
    expect(detectLanguage(code)).toBe('r');
  });

  it('detects R assignment + facet_wrap as R', () => {
    const code = `p <- ggplot(df, aes(x, y)) + geom_bar(stat="identity") + facet_wrap(~group, nrow=2)`;
    expect(detectLanguage(code)).toBe('r');
  });

  // ── Python code that should be detected as Python ────────────────

  it('detects standard matplotlib as Python', () => {
    const code = `import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.plot(x, y)`;
    expect(detectLanguage(code)).toBe('python');
  });

  it('detects seaborn as Python', () => {
    const code = `import seaborn as sns\nsns.set_theme(font_scale=1.5)\nsns.boxplot(data=df, x="group", y="value")`;
    expect(detectLanguage(code)).toBe('python');
  });

  it('detects subplot grid as Python', () => {
    const code = `fig, axes = plt.subplots(2, 3, figsize=(12, 8))`;
    expect(detectLanguage(code)).toBe('python');
  });

  it('detects rcParams as Python', () => {
    const code = `plt.rcParams['font.size'] = 14\nplt.bar(groups, means, yerr=sds)`;
    expect(detectLanguage(code)).toBe('python');
  });

  // ── Ambiguous code ───────────────────────────────────────────────

  it('returns null for bare plot(x, y) — too ambiguous', () => {
    const code = `plot(x, y)`;
    expect(detectLanguage(code)).toBeNull();
  });

  it('picks the language with the higher score when both tokens present', () => {
    // Mix of R and Python tokens — R has more weight here
    const codeRWins = `library(ggplot2)\nggplot(df, aes(x, y)) + geom_point() + theme_bw()\nimport matplotlib`;
    expect(detectLanguage(codeRWins)).toBe('r');

    // Mix where Python wins
    const codePyWins = `import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.plot(x, y)\nlibrary(ggplot2)`;
    expect(detectLanguage(codePyWins)).toBe('python');
  });

  it('returns null for empty string', () => {
    expect(detectLanguage('')).toBeNull();
  });

  it('returns null when scores are tied', () => {
    // Craft a tie: library() gives R +3, import gives Python +3
    const code = `library(stats)\nimport numpy`;
    expect(detectLanguage(code)).toBeNull();
  });
});

describe('computeReadability', () => {
  it('computes effective pt for each element', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const blockHeightIn = 10; // 100 poster units / 10
    const result = computeReadability(params, blockHeightIn, blockHeightIn);
    // effective = (11 / 7) × 10 = 15.7pt for axis title (1.0 rel)
    expect(result.elements.find(e => e.name === 'Axis titles')!.effectivePt).toBeCloseTo(15.7, 0);
    // axis text = base * 0.8 = 8.8pt source → effective = (8.8 / 7) * 10 = 12.6pt
    expect(result.elements.find(e => e.name === 'Tick labels')!.effectivePt).toBeCloseTo(12.6, 0);
  });

  it('marks elements below threshold as failing', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 8,
      canvasWidth: 10,
      canvasHeight: 10,
      effectiveCanvasWidth: 10,
      effectiveCanvasHeight: 10,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 8, 8);
    // axis text = 8 * 0.8 = 6.4 source → effective = (6.4 / 10) * 8 = 5.1pt
    const tickLabels = result.elements.find(e => e.name === 'Tick labels')!;
    expect(tickLabels.effectivePt).toBeCloseTo(5.1, 0);
    expect(tickLabels.status).toBe('fail');
  });

  it('computes suggested base_size for all elements to pass', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 10, 10);
    // The tightest constraint is tick labels: min 14pt, rel 0.8
    // Need: base * 0.8 * (10/7) >= 14 → base >= 14 * 7 / (0.8 * 10) = 12.25 → 13
    expect(result.suggestedBaseSize).toBeGreaterThanOrEqual(13);
  });

  it('font-first: targets EVERY failing element, not only overridden ones', () => {
    // base_size inflates all text including rows that already pass,
    // eating panel space the figure needs. On a fixed display area the
    // targeted fix is the right default.
    const code = `theme_minimal(base_size = 11)\nggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);

    expect(r.fontFixes.length).toBeGreaterThan(0);
    // Nothing here is overridden, yet every failing row still gets a target.
    expect(r.fontFixes.every((f) => f.wasOverridden === false)).toBe(true);
    for (const f of r.fontFixes) {
      expect(r.elements.find((e) => e.name === f.name)!.status).not.toBe('pass');
      expect(f.neededPt).toBeGreaterThan(f.currentPt);
    }
  });

  it('font-first: a target actually clears its floor at the reported scale', () => {
    const code = `theme_minimal(base_size = 11)\nggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);
    for (const f of r.fontFixes) {
      const el = r.elements.find((e) => e.name === f.name)!;
      expect(f.neededPt * r.scale).toBeGreaterThanOrEqual(el.minPt);
    }
  });

  it('font-first: rows that already pass are left alone', () => {
    const code = `theme_minimal(base_size = 40)\nggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.elements.every((e) => e.status === 'pass')).toBe(true);
    expect(r.fontFixes).toEqual([]);
    expect(r.fontSnippet).toBeNull();
  });

  it('font-first: emits a copy-ready ggplot theme() block', () => {
    const code = `theme_minimal(base_size = 11)\nggsave('f.png', width = 9, height = 6)`;
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet!;
    expect(snip).toMatch(/^theme\(/);
    expect(snip.trimEnd()).toMatch(/\)$/);
    expect(snip).toContain('element_text(size =');
    // Balanced parens — a snippet that will not parse is worse than none.
    expect(snip.split('(').length).toBe(snip.split(')').length);
  });

  it('font-first: the Python fix names each failing element\'s needed size by class', () => {
    // Fix 13: the sizes go to a helper that raises the drawn text at save
    // time (applyFontFixes), so they are listed by class, not as rcParams.
    const code = `plt.rcParams['font.size'] = 8\nplt.figure(figsize=(9, 6))`;
    const r = computeReadability(parsePythonCode(code), 7, 10);
    const snip = r.fontSnippet!;
    expect(snip).not.toContain('rcParams');
    for (const f of r.fontFixes) expect(snip).toContain(`'${f.key}': ${f.neededPt}`);
  });

  it('font-first: keeps the base_size one-liner available as the fallback', () => {
    const code = `theme_minimal(base_size = 11)\nggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.suggestedBaseSize).not.toBeNull();
    expect(r.copySnippet).toContain('base_size');
  });

  it('FR7: never recommends base_size = 0 when every element is overridden', () => {
    // `Math.max` over specs that all `return 0` yielded 0, and the panel
    // offered `theme_minimal(base_size = 0)` — code that would destroy
    // the figure. There is no base_size worth recommending here: every
    // element's size is set explicitly, so base_size governs nothing.
    const code = `theme_minimal(base_size = 14) +
      theme(axis.text = element_text(size = 10), axis.title = element_text(size = 12),
            legend.text = element_text(size = 10), legend.title = element_text(size = 12),
            plot.title = element_text(size = 16), strip.text = element_text(size = 11),
            plot.caption = element_text(size = 8))
      ggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);

    expect(r.suggestedBaseSize).toBeNull();
    expect(r.copySnippet).toBeNull();
  });

  it('FR7: tells the user what each overridden element needs instead', () => {
    // Dropping overridden rows from the base_size calculation is correct
    // — but silently dropping them left failing elements with NO advice
    // at all, which is the half of this finding that actually costs the
    // user a reprint.
    const code = `theme_minimal(base_size = 14) +
      theme(axis.text = element_text(size = 10), axis.title = element_text(size = 12),
            legend.text = element_text(size = 10), legend.title = element_text(size = 12),
            plot.title = element_text(size = 16), strip.text = element_text(size = 11),
            plot.caption = element_text(size = 8))
      ggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);

    expect(r.overrideFixes.length).toBeGreaterThan(0);
    const axis = r.overrideFixes.find((f) => f.name === 'Axis titles')!;
    expect(axis).toBeDefined();
    expect(axis.currentPt).toBe(12);
    // Needs minPt / scale to clear the 18pt floor at this scale.
    expect(axis.neededPt).toBeGreaterThan(axis.currentPt);
    // Every entry must be an element that actually fails.
    for (const f of r.overrideFixes) {
      expect(r.elements.find((e) => e.name === f.name)!.status).not.toBe('pass');
    }
  });

  it('FR7: still recommends a base_size when some elements are not overridden', () => {
    // The partial case must keep working — only the all-overridden case
    // has no answer.
    const code = `theme_minimal(base_size = 11) +
      theme(axis.text = element_text(size = 10))
      ggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.suggestedBaseSize).not.toBeNull();
    expect(r.suggestedBaseSize!).toBeGreaterThan(0);
    expect(r.copySnippet).toContain('base_size');
    // ...and the overridden element that fails is still called out.
    expect(r.overrideFixes.some((f) => f.name === 'Tick labels')).toBe(true);
  });

  it('FR7: offers no fixes at all when everything passes', () => {
    const code = `theme_minimal(base_size = 40)
      ggsave('f.png', width = 9, height = 6)`;
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.elements.every((e) => e.status === 'pass')).toBe(true);
    expect(r.overrideFixes).toEqual([]);
  });

  it('uses overrides when present instead of rel() defaults', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: { axisText: 20 },
      // Declares the override reaches every axis — i.e. `axis.text`, not
      // `axis.text.x`. Without it the score conservatively assumes a
      // sibling axis is still inheriting; see the next case.
      overrideCoversAll: { axisText: true },
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 10, 10);
    const ticks = result.elements.find(e => e.name === 'Tick labels')!;
    // 20pt override → effective = (20/7)*10 = 28.6pt — passes easily
    expect(ticks.effectivePt).toBeCloseTo(28.6, 0);
    expect(ticks.status).toBe('pass');
  });

  it('scores a PARTIAL override against the inheriting sibling axis', () => {
    // Same 20pt override, but not declared as covering every axis — so
    // the y labels are still rendering at 11 * 0.8 = 8.8pt and that is
    // what must be reported. Omitting the flag is the conservative
    // reading on purpose: a parser that forgets it under-reports rather
    // than hiding a failing element.
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: { axisText: 20 },
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const ticks = computeReadability(params, 10, 10).elements.find(
      (e) => e.name === 'Tick labels',
    )!;
    expect(ticks.sourcePt).toBeCloseTo(8.8, 1);
    expect(ticks.status).not.toBe('pass');
  });

  it('handles aspect-ratio mismatch using constraining dimension', () => {
    const params: FigureParams = {
      language: 'python',
      baseSize: 10,
      canvasWidth: 12,
      canvasHeight: 4,
      effectiveCanvasWidth: 12,
      effectiveCanvasHeight: 4,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    // Block is 15" wide × 5" tall. Canvas is 12×4.
    // Scale by min(15/12, 5/4) = min(1.25, 1.25) = 1.25
    // Effective height used = canvasHeight * scale = 4 * 1.25 = 5
    // axis title = 10pt → (10/4)*5 = 12.5pt — but that's wrong
    // Correct: effective = source_pt * (blockH / canvasH) when height constrains
    // But if width constrains: effective = source_pt * (blockW / canvasW)
    // Use min scale: scale = min(blockW/canvasW, blockH/canvasH)
    // effective = source_pt * scale
    const result = computeReadability(params, 5, 15);
    const scale = Math.min(15 / 12, 5 / 4); // 1.25
    expect(result.elements.find(e => e.name === 'Axis titles')!.effectivePt).toBeCloseTo(10 * scale, 0);
  });
});

describe('font snippet — advice that actually reaches the element', () => {
  it('expands to per-axis selectors when only one axis was overridden', () => {
    // ggplot inheritance: a LATER bare `axis.text` does not clear an
    // EARLIER `axis.text.x`. Emitting the bare selector left the 7pt x
    // labels — the exact thing flagged — untouched, while growing the y
    // labels that already passed. Advice that looks right and does
    // nothing is the failure mode this feature exists to prevent.
    const code = `theme_minimal(base_size = 20) +
      theme(axis.text.x = element_text(size = 7))
      ggsave("f.png", width = 10, height = 7)`;
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet!;
    expect(snip).toContain('axis.text.x = element_text(size =');
    expect(snip).toContain('axis.text.y = element_text(size =');
    expect(snip).not.toMatch(/^\s*axis\.text = /m);
  });

  it('keeps the bare selector when the override already covers both axes', () => {
    const code = `theme_minimal(base_size = 20) +
      theme(axis.text = element_text(size = 7))
      ggsave("f.png", width = 10, height = 7)`;
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet!;
    expect(snip).toMatch(/axis\.text = element_text\(size = /);
    expect(snip).not.toContain('axis.text.x');
  });

  it('uses the bare selector when nothing was overridden', () => {
    const code = `theme_minimal(base_size = 11)\nggsave("f.png", width = 9, height = 6)`;
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet!;
    expect(snip).toMatch(/axis\.text = element_text/);
    expect(snip).not.toContain('axis.text.x');
  });

  it('a caption is scored when the code draws one, and has no row when it does not', () => {
    // No rcParams key moves a caption (`figure.titlesize` moves
    // fig.suptitle): the edited script gives the fig.text() call its own
    // fontsize= (fix 13b), and a figure with no caption has no Caption row.
    const drawn = computeReadability(parsePythonCode(`plt.rcParams['font.size'] = 6\nfig = plt.figure(figsize=(9, 6))\nfig.text(0.1, 0.1, 'n = 12')`), 7, 10);
    expect(drawn.fontFixes.some((f) => f.key === 'caption')).toBe(true);
    expect(drawn.fontSnippet).toContain("'caption':");
    const none = computeReadability(parsePythonCode(`plt.rcParams['font.size'] = 6\nplt.figure(figsize=(9, 6))`), 7, 10);
    expect(none.elements.some((e) => e.name === 'Caption')).toBe(false);
  });
});

describe('override coverage is not override reachability', () => {
  // Two defects, one cause: coverage was tracked as a single boolean, so
  // "every axis is covered" and "a bare selector would reach it" could not
  // be told apart — and on the Python side `axis=` was ignored outright.

  it("tick_params(axis='x') does not hide the untouched y tick labels", () => {
    // D2. font.size 8 -> y ticks inherit 8 * 0.8 = 6.4pt and must fail;
    // only the x ticks were raised to 20.
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.tick_params(axis='x', labelsize=20)");
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.status).toBe('fail');
    expect(el.sourcePt).toBeLessThan(20);
  });

  it('scoping x and y in separate tick_params calls DOES cover both', () => {
    const p = parsePythonCode(
      "plt.rcParams['font.size'] = 8\nax.tick_params(axis='x', labelsize=20)\nax.tick_params(axis='y', labelsize=20)",
    );
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.sourcePt).toBe(20);
  });

  it('an unscoped tick_params still covers both axes', () => {
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.tick_params(labelsize=20)");
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.sourcePt).toBe(20);
  });

  it('pinning BOTH axes still gets per-axis advice, not a bare parent', () => {
    // D6. axis.text.x and axis.text.y are both explicit, so coverage is
    // complete — but `axis.text = element_text(...)` would reach neither.
    const code = 'ggplot(d, aes(x, y)) + geom_point() +\n'
      + '  theme(axis.text.x = element_text(size = 7), axis.text.y = element_text(size = 7))\n'
      + 'ggsave("f.png", width = 10, height = 7)';
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet ?? '';
    expect(snip).toContain('axis.text.x');
    expect(snip).toContain('axis.text.y');
  });

  it('a bare axis.text override still gets bare advice', () => {
    const code = 'ggplot(d, aes(x, y)) + geom_point() +\n'
      + '  theme(axis.text = element_text(size = 7))\nggsave("f.png", width = 10, height = 7)';
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet ?? '';
    expect(snip).toMatch(/axis\.text\s*=/);
    expect(snip).not.toContain('axis.text.x');
  });

  // A test for "a non-axis element is reachable by its bare selector" was
  // removed rather than kept: it survived every mutant, including
  // hardcoding bareSelectorReaches to false. For a non-axis key the
  // `(\.[xy])?` group never matches, so the branch it claimed to guard
  // is unobservable. A test that cannot fail is worse than no test — it
  // reads as coverage.

  it('keyword order does not matter: axis= after labelsize= is honoured', () => {
    // The first fix matched `tick_params(...labelsize=N` — a pattern that
    // ENDS at the number and so can only see arguments written before it.
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.tick_params(labelsize=20, axis='x')");
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.status).toBe('fail');
  });

  it('a multiline tick_params is read whole', () => {
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.tick_params(labelsize=20,\n               axis='y')");
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.status).toBe('fail');
  });

  it('two different Axes do not add up to full coverage', () => {
    // ax's y ticks are still inheriting; only the colourbar's were scoped.
    const p = parsePythonCode(
      "plt.rcParams['font.size'] = 8\nax.tick_params(axis='x', labelsize=20)\ncbar.ax.tick_params(axis='y', labelsize=20)",
    );
    const el = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Tick labels')!;
    expect(el.status).toBe('fail');
  });

  it('a sized parent does not make a sized child reachable', () => {
    // Ordinary ggplot: shrink a rotated x label under a sized parent.
    // Measured in ggplot2 4.0.3 — the bare advice left axis.text.x at
    // 7pt (still failing) while moving y to 14pt.
    const code = 'ggplot(d, aes(x,y)) + geom_point() +\n'
      + '  theme(axis.text = element_text(size = 18), axis.text.x = element_text(size = 7, angle = 45))\n'
      + 'ggsave("f.png", width = 10, height = 7)';
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet ?? '';
    expect(snip).toContain('axis.text.x');
    expect(snip).toContain('axis.text.y');
  });

  // Ground truth for the four below measured in matplotlib 3.10.8, not
  // reasoned: each was run and the rendered tick label size read back.
  it('set_tick_params is honoured, not discarded', () => {
    // ax.xaxis/yaxis.set_tick_params(labelsize=20) renders 20/20.
    // Reporting the inherited 6.6 threw away a fix the user had made.
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.xaxis.set_tick_params(labelsize=20)\nax.yaxis.set_tick_params(labelsize=20)");
    expect(computeReadability(p, 7, 10).elements.find((e) => e.name === 'Tick labels')!.status).toBe('pass');
  });

  it('plt.tick_params and ax.tick_params are the same Axes', () => {
    // plt.tick_params is gca(); measured 20/20 on the same subplot.
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nax.tick_params(axis='x', labelsize=20)\nplt.tick_params(axis='y', labelsize=20)");
    expect(computeReadability(p, 7, 10).elements.find((e) => e.name === 'Tick labels')!.status).toBe('pass');
  });

  it('axes[0] and axes[1] are different Axes and do not add up', () => {
    // Measured: axes[0] renders x=20 y=8, axes[1] renders x=8 y=20 —
    // BOTH subplots have an unreadable axis. The canonical subplot idiom,
    // and the one a receiver scanner that stops at ']' merges into one.
    const p = parsePythonCode("plt.rcParams['font.size'] = 8\nfig, axes = plt.subplots(1, 2, figsize=(10,7))\naxes[0].tick_params(axis='x', labelsize=20)\naxes[1].tick_params(axis='y', labelsize=20)");
    expect(computeReadability(p, 7, 10).elements.find((e) => e.name === 'Tick labels')!.status).toBe('fail');
  });

  it('a phantom tick_params inside a string does not discard later calls', () => {
    const p = parsePythonCode("plt.rcParams['font.size'] = 24\nax.set_xlabel(\"see tick_params(labelsize\", fontsize=24)\nax.tick_params(labelsize=6)");
    expect(computeReadability(p, 7, 10).elements.find((e) => e.name === 'Tick labels')!.sourcePt).toBe(6);
  });

  it('the same holds for axis.title', () => {
    const code = 'ggplot(d, aes(x,y)) + geom_point() +\n'
      + '  theme(axis.title = element_text(size = 18), axis.title.y = element_text(size = 6))\n'
      + 'ggsave("f.png", width = 10, height = 7)';
    const snip = computeReadability(parseRCode(code), 7, 10).fontSnippet ?? '';
    expect(snip).toContain('axis.title.y');
  });
});

describe('in-panel text: found when it is there, not invented when it is not', () => {
  // Ground truth measured in ggplot2 4.0.3 on R 4.6.0, by building the
  // plot and reading the rendered layer's size back — not from docs.
  const warn = (code: string) => (parseRCode(code).warnings ?? []).join(' ');

  it('sees a label whose aes() contains a nested call', () => {
    // The commonest way to write a data label. The old pattern hand-rolled
    // ONE level of paren nesting, so paste0( inside aes( was a second
    // level and the whole call went unseen.
    expect(warn('geom_text(aes(label = paste0("n=", n)), size = 2)')).toMatch(/in-panel/i);
    expect(warn('geom_text(aes(label = sprintf("%.1f", v)), size = 2)')).toMatch(/in-panel/i);
  });

  it('sees ggrepel geoms and a bare geom_label', () => {
    expect(warn('geom_text_repel(aes(label = n), size = 2)')).toMatch(/in-panel/i);
    expect(warn('geom_label_repel(aes(label = n), size = 2)')).toMatch(/in-panel/i);
    expect(warn('geom_label(aes(label = n), size = 2)')).toMatch(/geom_label\(\)/);
  });

  it('sees stat_summary(geom = "text")', () => {
    // R renders this at 5.691pt. It dispatches on a geom name exactly
    // like annotate(), so the same guard covers it.
    expect(warn('stat_summary(fun = length, geom = "text", aes(label = after_stat(y)), size = 2)'))
      .toMatch(/in-panel/i);
  });

  it('a dotted argument name is NOT the font size', () => {
    // label.size is a BORDER width — ggplot2 deprecated it in favour of
    // linewidth — and \b matches after the dot. R renders this label at
    // 17.1pt; reporting "size 0 (0pt)" is a fabricated finding, and the
    // report-the-smallest rule let that zero mask every real label.
    const w = warn('geom_label(aes(label = n), label.size = 0, size = 6)');
    expect(w).toContain('size 6');
    expect(w).not.toContain('size 0');
    expect(warn('geom_text_repel(aes(label = n), segment.size = 0.2, size = 5)')).toContain('size 5');
  });

  it('honours size.unit', () => {
    // size.unit = "pt" means the number is NOT millimetres. Without it,
    // size = 8 renders at 22.76pt; with it, at 8pt.
    expect(warn('geom_text(aes(label = n), size = 8, size.unit = "pt")')).toContain('(8pt');
    expect(warn('geom_text(aes(label = n), size = 8)')).toContain('22.8pt');
  });

  it("an unsized label reports the THEME's size, which follows base_size", () => {
    // Measured: base_size 11/22/40/5 renders 11/22/40/5 pt exactly.
    // A hardcoded 3.88mm was right only at base 11 — it understated a
    // poster theme 3.6x and, worse, called a genuinely unreadable 5pt
    // label a comfortable 11pt.
    expect(warn('ggplot(d) + geom_text(aes(label = n)) + theme_minimal(base_size = 40)')).toContain('40');
    expect(warn('ggplot(d) + geom_text(aes(label = n)) + theme_grey(base_size = 5)')).toContain('5');
    expect(warn('ggplot(d) + geom_text(aes(label = n)) + theme_minimal(base_size = 40)')).not.toContain('11pt');
  });

  it('does NOT invent a text warning for annotate("rect")', () => {
    // `size` on a rect/segment is a border width — ggplot2 itself
    // deprecated it in favour of `linewidth`.
    expect(warn('annotate("rect", xmin = 1, xmax = 2, ymin = 0, ymax = 3, alpha = 0.2, size = 1)'))
      .not.toMatch(/in-panel/i);
    expect(warn('annotate("segment", x = 1, xend = 2, y = 0, yend = 3, size = 2)'))
      .not.toMatch(/in-panel/i);
  });

  it('still sees annotate("text") and the named geom = form', () => {
    expect(warn('annotate("text", x = 2, y = 2, label = "hi", size = 2)')).toMatch(/in-panel/i);
    expect(warn('annotate(geom = "label", x = 2, y = 2, label = "hi", size = 2)')).toMatch(/in-panel/i);
  });

  it('a size MAPPED inside aes() is a scale, not a fixed size', () => {
    // The previous test for this named a geom the detector never scans,
    // so it held for every implementation including the broken one.
    // geom_text IS scanned, so this one can actually fail.
    // A NUMERIC mapped size is what discriminates: `aes(size = 2)` maps the
    // constant 2 through the size SCALE, it is not 2mm of type. With a
    // variable (`size = n`) the regex needs a digit and cannot tell the
    // two implementations apart, so that input proved nothing.
    const w = warn('ggplot(d) + geom_text(aes(label = n, size = 2)) + theme_minimal(base_size = 40)');
    expect(w).not.toContain('size 2');
    expect(w).toContain('40');
  });

  it('one unbalanced call does not silence the real ones', () => {
    // A `geom_text(` inside a string literal used to abort the whole walk.
    expect(warn('ggplot(d) + labs(caption = "made with geom_text(") + geom_text(aes(label = n), size = 1)'))
      .toMatch(/in-panel/i);
  });

  it('reports the smallest label when several are drawn', () => {
    const w = warn('geom_text(aes(label = a), size = 9) + geom_text(aes(label = b), size = 2)');
    expect(w).toContain('size 2');
  });
});

describe('language detection reads the live code, not the comments', () => {
  // Held back from 9ea9f38 by its revert (4e9c175) until the panel could
  // say it could not tell R from Python; re-landed with that state by fix
  // 15. Detection now reads maskCodeForRewrite's output: comments AND
  // string contents blanked.
  it('an R script carrying a commented-out matplotlib draft is still R', () => {
    // Leaving the abandoned port in comments is normal while moving a
    // figure between languages. Scored on raw text the Python signals win,
    // the whole script goes to parsePythonCode, and a ggplot figure gets
    // measured against matplotlib defaults and offered a plt.rcParams fix.
    const code = [
      'library(ggplot2)',
      '# python draft I abandoned:',
      '# import matplotlib.pyplot as plt',
      '# fig, ax = plt.subplots(1, 2, figsize=(12, 8))',
      '# ax.set_xlabel("x"); plt.savefig("f.png")',
      'p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + theme_minimal(base_size = 11)',
      'ggsave("fig.png", p, width = 7, height = 5)',
    ].join('\n');
    expect(detectLanguage(code)).toBe('r');
  });

  it('a python script carrying a commented-out ggplot draft is still python', () => {
    const code = [
      'import matplotlib.pyplot as plt',
      '# the R version this replaced:',
      '# library(ggplot2)',
      '# p <- ggplot(d, aes(x, y)) + geom_point() + theme_minimal()',
      '# ggsave("f.png", p, width = 7, height = 5)',
      "plt.rcParams['font.size'] = 10",
      'fig, ax = plt.subplots(figsize=(7, 5))',
    ].join('\n');
    expect(detectLanguage(code)).toBe('python');
  });

  it('a # inside a string does not start a comment', () => {
    // 9ea9f38 had "signals inside string literals still count" here; fix 15
    // blanks string contents too, so what this pins now is that the
    // masking keeps the code after a '#' inside a string. A hex colour is
    // the everyday case, and the deciding signal sits after it: a stripper
    // that cut the line at the '#' would find nothing (round 1: the first
    // version of this test put every signal before the '#', and passed
    // against a naive /#.*$/ stripper).
    expect(detectLanguage('plot(dose, response, col = "#1b9e77", main = "Dose response")')).toBe('r');
    expect(detectLanguage('line, = plot(t, v, color="#d62728"); fig.savefig("f.png")')).toBe('python');
  });

  it('a script that is nothing but comments detects nothing', () => {
    expect(detectLanguage('# import matplotlib.pyplot as plt\n# plt.plot()')).toBeNull();
  });

  it('words inside strings do not count', () => {
    // The confirmer of item 15: "import" in a title read a base R plot as
    // Python. The masked text keeps the quotes and drops the words.
    expect(detectLanguage('plot(dose, response, main = "Effect of import duties")')).toBe('r');
    expect(detectLanguage('ax.annotate("onset", xy=(2, 0.4), arrowprops=dict(arrowstyle="<-"))')).toBe('python');
  });
});

describe('describePlotCode: the language and the plotting system (fix 15)', () => {
  // Supporting tests: the falsifiers enter at the page
  // (FigureReadability.test.tsx). These pin the function's contract.
  it.each([
    ['ggplot2', 'ggplot(df, aes(x, y)) + geom_point()', 'r', 'ggplot2', false],
    ['matplotlib', 'fig, ax = plt.subplots()\nax.plot(x, y)', 'python', 'matplotlib', false],
    ['seaborn is matplotlib', 'sns.lineplot(data=df, x="t", y="v")', 'python', 'matplotlib', false],
    ['base graphics', 'barplot(counts, names.arg = groups)', 'r', 'base', false],
    ['lattice', 'xyplot(y ~ x | g, data = df)', 'r', 'lattice', false],
    ['plotly in R', 'plot_ly(df, x = ~a, y = ~b)', 'r', 'plotly', false],
    ['plotly in Python', 'fig = go.Figure(go.Bar(x=g, y=m))\nfig.update_layout(title="T")', 'python', 'plotly', false],
    ['Altair', 'alt.Chart(df).mark_line().encode(x="a", y="b")', 'python', 'altair', false],
    ['plotnine', 'from plotnine import ggplot, aes, geom_point\np = ggplot(df, aes("a", "b")) + geom_point()', 'python', 'plotnine', false],
    ['R with no plotting call', 'x <- 1', 'r', 'ggplot2', true],
    ['Python with no plotting call', 'import numpy as np', 'python', 'matplotlib', true],
    ['nothing to go on', 'plot(x, y)', null, null, false],
  ])('%s', (_name, code, language, system, assumed) => {
    expect(describePlotCode(code)).toEqual({ language, system, assumed });
  });

  it('a hand pick decides the language, and the code the system', () => {
    expect(describePlotCode('plot(x, y)', 'r')).toEqual({ language: 'r', system: 'base', assumed: false });
    expect(describePlotCode('plot(x, y)', 'python')).toEqual({ language: 'python', system: 'matplotlib', assumed: false });
    // A system named by its own calls stays named whatever is picked.
    expect(describePlotCode('library(lattice)\nbwplot(v ~ g)', 'python').system).toBe('lattice');
    expect(describePlotCode('from plotnine import *\nggplot(df, aes("a", "b"))', 'r').system).toBe('plotnine');
    // ggplot's grammar in Python is plotnine.
    expect(describePlotCode('ggplot(df, aes(x, y)) + geom_point()', 'python').system).toBe('plotnine');
    // A pick of R wins over a plotnine hint; only an import of plotnine
    // outweighs it (round 1: R's aes() takes strings too).
    expect(describePlotCode('(ggplot(df, aes("a", "b")) + geom_col())', 'r')).toEqual({ language: 'r', system: 'ggplot2', assumed: false });
    // A name seaborn shares is lattice or base graphics only in R.
    expect(describePlotCode('stripplot(x="day", y="tip", data=tips)', 'python').system).toBe('matplotlib');
    expect(describePlotCode('stripplot(x="day", y="tip", data=tips)', 'r').system).toBe('lattice');
    expect(describePlotCode('heatmap(corr, annot=True)', 'python').system).toBe('matplotlib');
    expect(describePlotCode('heatmap(corr, annot=True)', 'r').system).toBe('base');
  });

  it('a plotnine hint with nothing only one language has places nothing (round 2)', () => {
    // The hint takes the grammar's words out of R's score: Python's own
    // signals then decide, and with none the code cannot be placed. A pick
    // decides the language, the grammar the system.
    const wrapped = 'print(ggplot(df, aes(x = "", y = n, fill = g)) +\n  geom_col(width = 1))';
    expect(describePlotCode(wrapped)).toEqual({ language: null, system: null, assumed: false });
    expect(describePlotCode(wrapped, 'r')).toEqual({ language: 'r', system: 'ggplot2', assumed: false });
    expect(describePlotCode(wrapped, 'python')).toEqual({ language: 'python', system: 'plotnine', assumed: false });
    expect(describePlotCode('p = (ggplot(df, aes("a", "b")) + geom_smooth(se=False))').system).toBe('plotnine');
    // With R's own line ending, the hint does not count and the code is R.
    expect(describePlotCode('ggplot(df, aes(x = "", y = n)) +\n  geom_col()').system).toBe('ggplot2');
  });

  it('an import of everything is Python only in Python\'s form (round 2)', () => {
    expect(detectLanguage('from pylab import *\nplot(t, v)')).toBe('python');
    expect(detectLanguage('import * as d3 from "d3";\nd3.select("#chart");')).toBeNull();
  });

  it('a package name is R, but names no plotting system on its own', () => {
    expect(describePlotCode('library(tidyverse)\nhist(df$v)')).toEqual({ language: 'r', system: 'base', assumed: false });
    expect(describePlotCode('library(ggplot2)')).toEqual({ language: 'r', system: 'ggplot2', assumed: true });
    expect(describePlotCode('library(ggplot2)\np <- ggplot(df, aes(x, y))')).toEqual({ language: 'r', system: 'ggplot2', assumed: false });
  });

  it('detectLanguage is describePlotCode\'s language', () => {
    for (const code of ['plot(x, y)', 'barplot(c(1, 2))', '(ggplot(df, aes("a", "b")) + geom_col())', 'import altair as alt']) {
      expect(detectLanguage(code)).toBe(describePlotCode(code).language);
    }
  });

  it('languageSignals names what fired and agrees with detectLanguage', () => {
    const s = languageSignals('library(ggplot2)\np <- ggplot(df, aes(x, y))');
    expect(s.verdict).toBe('r');
    expect(s.r).toBeGreaterThan(s.py);
    expect(s.fired.length).toBeGreaterThan(0);
  });
});

describe('comment stripping respects string literals', () => {
  // Kept from the reverted detection change of 9ea9f38: these pin
  // stripComments itself, which the parsers use. The detection tests that
  // left with the revert are back above (fix 15).
  it('a # inside a string does not truncate the line', () => {
    // The previous version of this test put every scoring token OUTSIDE
    // the quotes, so it passed even against a naive /#.*$/gm stripper —
    // the exact implementation stripComments' own docstring says is
    // wrong. Here a hex colour hides the ONLY copy of base_size behind a
    // '#', so a naive stripper reads 11 (the ggplot default) instead.
    const code = 'p <- ggplot(d, aes(x,y)) + geom_point(colour = "#FF0000") + theme_minimal(base_size = 24)\nggsave("f.png", p, width = 9, height = 6)';
    expect(parseRCode(code).baseSize).toBe(24);
    expect(detectLanguage(code)).toBe('r');
  });

  it('python: a hex colour does not truncate the line either', () => {
    const code = "plt.rcParams.update({'axes.edgecolor': '#333333', 'font.size': 22})\nplt.figure(figsize=(9,6))";
    expect(parsePythonCode(code).baseSize).toBe(22);
  });
});

describe('sizes are reported at one decimal, everywhere', () => {
  it('a rel() override does not leak float noise into the advice', () => {
    // rel(1.1) on an 11pt base is 12.100000000000001. The table rounded
    // for display, the per-element advice below it did not, so one element
    // showed two different numbers on the same screen.
    const code = "theme_minimal(base_size = 11) +\n  theme(axis.title = element_text(size = rel(1.1)))\nggsave('f.png', width = 9, height = 6)";
    const r = computeReadability(parseRCode(code), 7, 10);
    // Assert the VALUE is one-decimal, not merely that its string is
    // short: a length check passes for whole points and for two decimals,
    // so it pinned "not float noise" rather than the stated precision.
    const all = [...(r.overrideFixes ?? []), ...(r.fontFixes ?? [])] as Array<{ name?: string; currentPt?: number }>;
    for (const f of all) {
      if (f.currentPt === undefined) continue;
      expect(f.currentPt).toBe(Math.round(f.currentPt * 10) / 10);
    }
    const axisTitle = r.elements.find((e) => e.name === 'Axis titles')!;
    // Select by NAME — picking "the first row with a currentPt" only
    // coincidentally found this element.
    const advised = all.find((f) => f.name === 'Axis titles');
    expect(advised?.currentPt).toBe(axisTitle.sourcePt);
  });

  it('scoring uses the EXACT size, not the rounded one', () => {
    // base_size 15.5 x rel(0.9) = 13.950000000000001, below the 14pt
    // floor. Rounding before scoring lifted it to 14 and turned a genuine
    // warn into a pass, dropping the advice row with it.
    const code = "ggplot(d, aes(x, y)) + geom_point() +\n  theme_minimal(base_size = 15.5) +\n  theme(axis.text = element_text(size = rel(0.9)))\nggsave('f.png', width = 10, height = 7)";
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.elements.find((e) => e.name === 'Tick labels')!.status).not.toBe('pass');
  });

  it('a plain numeric override is untouched', () => {
    const code = "theme_minimal(base_size = 11) +\n  theme(axis.title = element_text(size = 9))\nggsave('f.png', width = 9, height = 6)";
    const r = computeReadability(parseRCode(code), 7, 10);
    expect(r.elements.find((e) => e.name === 'Axis titles')!.sourcePt).toBe(9);
  });
});

// Fix 13b: the edited script is the user's own with plain edits, so the
// re-check reads it with the same rule table, and the values it set are the
// sizes it shows (claim W1 of record 13, now without a helper to read).
describe('the re-check reads the edited script', () => {
  const opts = { defaultWidthIn: 10, defaultHeightIn: 7 };
  const recheck = (code: string, w = 10, h = 7) => {
    const p = parsePythonCode(code, { defaultWidthIn: w, defaultHeightIn: h });
    return { p, r: computeReadability(p, h, w) };
  };
  const edit = (code: string, w = 10, h = 7) => {
    const { p, r } = recheck(code, w, h);
    return generateTargetedFullFix(code, p, r, { defaultWidthIn: w, defaultHeightIn: h });
  };

  it('the corrected code re-checks with every fixed element passing', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 6\nfig, ax = plt.subplots(figsize=(10, 7))\nax.plot([1, 2], label='a')\nax.set_title('T')\nax.set_xlabel('x')\nax.set_ylabel('y')\nax.legend()\nfig.savefig('f.png')";
    const first = recheck(code).r;
    expect(first.fontFixes.length, 'precondition: something fails').toBeGreaterThan(0);
    const again = recheck(edit(code)).r;
    expect(again.elements.filter((e) => e.status !== 'pass')).toEqual([]);
    void opts;
  });

  it('never reads a class lower than the script already sets it', () => {
    const big = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 20\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel('x', fontsize=8)\nax.set_ylabel('y')\nax.set_title('T')\nfig.savefig('f.png')";
    const again = recheck(edit(big)).p;
    expect(again.sizes?.plotTitle).toBe(24);
    expect(again.sizes?.axisTitle).toBe(18);
  });

  it('a size the user set on one axis does not stand for the whole class', () => {
    // The x label at 30 pt, the y label at matplotlib's 10: the class is 10.
    const oneAxis = "import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel('t', fontsize=30)\nax.set_ylabel('y')\nfig.savefig('f.png')";
    expect(recheck(oneAxis).p.sizes?.axisTitle).toBe(10);
    const fixed = edit(oneAxis);
    expect(fixed).toContain("ax.set_xlabel('t', fontsize=30)");
    expect(recheck(fixed).p.sizes?.axisTitle).toBe(18);
  });

  it('a row the edit raised through rcParams is not marked "(you set this)"', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 6\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_title('T')\nfig.savefig('f.png')";
    const again = recheck(edit(code), 5, 3.5).r;
    expect(again.fontFixes.length, 'precondition: at a smaller size something fails again').toBeGreaterThan(0);
    expect(again.fontFixes.filter((f) => f.wasOverridden)).toEqual([]);
  });

  it('part 1\'s helper block, pasted back, is read: each named class is at least its size at the save', () => {
    const block = "_POSTR_NEED = {'axisTitle': 30}\n";
    const script = "import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel('x')\n_postr_raise_text(fig, _POSTR_NEED).savefig('f.png')";
    expect(parsePythonCode(`${block}${script}`).sizes?.axisTitle).toBe(30);
    // A copy in a comment or a string is not read.
    expect(parsePythonCode(`# ${block}${script.replace('_postr_raise_text(fig, _POSTR_NEED).', 'fig.')}`).sizes?.axisTitle).toBe(10);
    expect(parsePythonCode(`note = """${block}"""\n${script.replace('_postr_raise_text(fig, _POSTR_NEED).', 'fig.')}`).sizes?.axisTitle).toBe(10);
  });
});

// Fix 13b (docs/fixes/13b-checker-sizes.md): the rule table, one row at a
// time. Each expected size is what matplotlib 3.10.8 / seaborn 0.13.2 /
// ggplot2 4.0.3 draw for the same script (the gate corpora hold scripts of
// each shape: c-sns-ctx-paper, c-rcdefaults, c-style-paper, k47, c-oo-*,
// f16, s09, c-nb-*, rc-facet-grid-strip-x, rc-themeset-override).
describe('the rule table, row by row (fix 13b)', () => {
  const PY = 'import matplotlib.pyplot as plt\n';
  const FIG = 'fig, ax = plt.subplots(figsize=(10, 7))\n';
  const sizes = (code: string) => parsePythonCode(code).sizes!;

  it('P5: seaborn\'s paper context is 0.8 × its notebook sizes', () => {
    const s = sizes(`${PY}import seaborn as sns\nsns.set_context("paper")\n${FIG}ax.set_title("T")\nax.set_xlabel("x")`);
    expect(s.plotTitle).toBeCloseTo(9.6, 5);
    expect(s.axisTitle).toBeCloseTo(9.6, 5);
    expect(s.axisText).toBeCloseTo(8.8, 5);
  });

  it('P6: rcdefaults() puts matplotlib\'s defaults back', () => {
    expect(sizes(`${PY}plt.rcParams['font.size'] = 22\nplt.rcdefaults()\n${FIG}ax.set_title("T")`).plotTitle).toBe(12);
  });

  it('P7: a built-in style sheet\'s sizes; one the check does not know assumes the rows', () => {
    expect(sizes(`${PY}plt.style.use("seaborn-v0_8-paper")\n${FIG}ax.set_title("T")\nax.legend()`)).toMatchObject({ plotTitle: 9.6, legendText: 8 });
    const p = parsePythonCode(`${PY}plt.style.use("lab.mplstyle")\n${FIG}ax.set_title("T")`);
    expect(p.assumed?.plotTitle).toBe(true);
  });

  it('P14: a size set on Axes the check cannot name (a loop over them) is read', () => {
    const code = `${PY}fig, axs = plt.subplots(2, 2, figsize=(10, 7))\nfor ax in axs.flat:\n    ax.tick_params(labelsize=7)\n    ax.set_title("T", fontsize=8)`;
    expect(sizes(code)).toMatchObject({ axisText: 7, plotTitle: 8 });
  });

  it('P12, P13: object setters, ax.title.set_fontsize() and ax.xaxis.label.set_size()', () => {
    const code = `${PY}plt.rcParams['font.size'] = 16\n${FIG}ax.set(title="T", xlabel="x", ylabel="y")\nax.title.set_fontsize(8)\nax.xaxis.label.set_fontsize(7)\nax.yaxis.label.set_size(7)`;
    expect(sizes(code)).toMatchObject({ plotTitle: 8, axisTitle: 7 });
  });

  it('P14: pandas\' df.plot(fontsize=) sizes the tick labels it makes', () => {
    expect(sizes(`${PY}axs = df.plot(subplots=True, figsize=(6.4, 4.8), fontsize=7)`).axisText).toBe(7);
  });

  it('P13: colorbar(label=) draws an axis title at the size rcParams gives when it is made', () => {
    const code = `${PY}${FIG}im = ax.imshow(z)\nax.set_xlabel("x", fontsize=20)\nax.set_ylabel("y", fontsize=20)\nfig.colorbar(im, ax=ax, label="value")`;
    expect(sizes(code).axisTitle).toBe(10);
  });

  it('P11: a notebook\'s display crops the figure: the scale is assumed and unknown', () => {
    const p = parsePythonCode(`%matplotlib inline\n${PY}${FIG}ax.set_title("T", fontsize=30)\nplt.show()`);
    expect(p.canvasAssumed).toBe(true);
    expect(p.scaleUnknown).toBe(true);
  });

  it('the one-number advice is withheld when the rows that follow a base follow two of them', () => {
    // Axis labels made before font.size changes follow matplotlib's 10; the
    // title made after follows the 12: there is no one number to change.
    const p = parsePythonCode(`${PY}${FIG}plt.rcParams['font.size'] = 12\nax.set_title("T")\nax.set_xlabel("x")`);
    expect(p.ownBase).toBeNull();
    expect(computeReadability(p, 3, 4).suggestedBaseSize).toBeNull();
  });

  it('the one-number advice is withheld when the scale is unknown (a seaborn grid)', () => {
    const p = parsePythonCode('import seaborn as sns\nimport matplotlib.pyplot as plt\nplt.rcParams["font.size"] = 8\ng = sns.relplot(data=d, x="a", y="b", col="c")\ng.savefig("g.png")', { defaultWidthIn: 4, defaultHeightIn: 3 });
    expect(computeReadability(p, 3, 4).suggestedBaseSize).toBeNull();
  });

  it('R7: facet_grid draws x strips on top and y strips at the side; strip.text.x alone leaves the y strips', () => {
    const code = 'ggplot(mtcars, aes(wt, mpg)) + geom_point() + facet_grid(rows = vars(gear), cols = vars(am)) +\n  theme_bw(base_size = 11) + theme(strip.text.x = element_text(size = 16))\nggsave("g.png", width = 7, height = 6)';
    expect(parseRCode(code).sizes?.stripText).toBeCloseTo(8.8, 5);
    expect(parseRCode(code.replace('facet_grid(rows = vars(gear), cols = vars(am))', 'facet_wrap(~cyl)')).sizes?.stripText).toBe(16);
  });

  it('R: the one-number advice is withheld when the base_size written is one the plot does not use', () => {
    const code = 'theme_set(theme_classic(base_size = 20))\np <- ggplot(df, aes(x, y)) + geom_point() + labs(title = "T") + theme_bw()\nggsave("d.png", p, width = 7, height = 5)';
    const p = parseRCode(code);
    expect(p.sizes?.plotTitle).toBeCloseTo(13.2, 5);
    expect(p.ownBase).toBeNull();
    expect(computeReadability(p, 5, 7).suggestedBaseSize).toBeNull();
  });
});
