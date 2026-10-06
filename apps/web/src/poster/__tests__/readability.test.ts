// apps/web/src/poster/__tests__/readability.test.ts
import { describe, it, expect } from 'vitest';
import {
  applyFontFixes,
  parseRCode,
  parsePythonCode,
  computeReadability,
  detectLanguage,
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
    expect(p.overrides.axisText).toBe(18);
    expect(p.overrides.plotTitle).toBe(28);
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
    expect(p.overrides.axisText).toBe(7);
    expect(p.overrides.axisTitle).toBe(26);

    const r = computeReadability(p, 5, 7);
    expect(r.elements.find((e) => e.name === 'Tick labels')!.status).not.toBe('pass');
  });

  it('FR2: a size after a nested call argument is still read', () => {
    // `[^)]*` could not cross the ')' of an inner call, so the explicit
    // size was dropped.
    const p = parseRCode('theme(axis.text = element_text(margin = margin(t = 8), size = 9))');
    expect(p.overrides.axisText).toBe(9);
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
    expect(p.overrides.axisText).toBe(7);
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
    expect(p.overrides.axisText).toBeCloseTo(12, 1);
  });

  it('later theme() overrides earlier', () => {
    const code = `
      theme(axis.text = element_text(size = 10)) +
      theme(axis.text = element_text(size = 20))
    `;
    const p = parseRCode(code);
    expect(p.overrides.axisText).toBe(20);
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

  it('extracts seaborn set_theme font_scale', () => {
    const code = `sns.set_theme(font_scale=1.5)`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(15); // 10 * 1.5
  });

  it('extracts seaborn set_context', () => {
    const code = `sns.set_context("poster")`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(20); // 10 * 2.0
  });

  it('PY-4: a small ylabel is not hidden by a large xlabel', () => {
    // Same defect class as FR2, still live on the Python side: the code
    // took `(xlabel ?? ylabel)`, so whichever it found first spoke for
    // BOTH axes. A 20pt x label hid a 6pt y label completely.
    const p = parsePythonCode('ax.set_xlabel("A", fontsize=20)\nax.set_ylabel("B", fontsize=6)');
    expect(p.overrides.axisTitle).toBe(6);
  });

  it('PY-4: one axis set alone still leaves the other inheriting', () => {
    // Only the x label is sized, so the y label renders at
    // font.size * 1.0 and must still count against the score.
    const p = parsePythonCode('plt.rcParams["font.size"] = 8\nax.set_xlabel("A", fontsize=30)');
    const ticks = computeReadability(p, 5, 7).elements.find((e) => e.name === 'Axis titles')!;
    expect(ticks.sourcePt).toBeCloseTo(8, 1);
  });

  it('warns when a font size is bound to a variable rather than a literal', () => {
    // `theme_minimal(base_size = s)` silently reported the 11pt library
    // default. The "No font size found" warning is guarded by
    // `!/base_size\s*=/` — and `base_size =` IS present — so it was
    // suppressed exactly when it was needed. Same suppression shape as FR5.
    const p = parseRCode('s <- 22\ntheme_minimal(base_size = s)');
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
    // poster context is 2.0x on a 10pt default; 0.55 brings it to 11.
    expect(p.baseSize).toBeCloseTo(11, 5);
  });

  it('PY-2: a context with no font_scale is unchanged', () => {
    expect(parsePythonCode('sns.set_context("poster")').baseSize).toBeCloseTo(20, 5);
  });

  it('PY-3: reads fontsize when the label text contains parentheses', () => {
    // `[^)]*` could not cross the ')' in the label, and units in
    // parentheses appear in nearly every real axis label.
    expect(parsePythonCode('ax.set_xlabel("Time (min)", fontsize=10)').overrides.axisTitle).toBe(10);
    expect(parsePythonCode('ax.set_ylabel("Rate (n/s)", fontsize=9)').overrides.axisTitle).toBe(9);
    expect(parsePythonCode('ax.set_title("Result (n=42)", fontsize=12)').overrides.plotTitle).toBe(12);
  });

  it('extracts per-element overrides', () => {
    const code = `
      ax.set_xlabel("X", fontsize=14)
      ax.set_ylabel("Y", fontsize=14)
      ax.tick_params(labelsize=10)
      ax.set_title("Title", fontsize=20)
    `;
    const p = parsePythonCode(code);
    expect(p.overrides.axisTitle).toBe(14);
    expect(p.overrides.axisText).toBe(10);
    expect(p.overrides.plotTitle).toBe(20);
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
    expect(p.warnings).toContain('No canvas size found — assuming matplotlib default 6.4"×4.8".');
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

  it('detects base R plot with library call as R', () => {
    const code = `plot(x, y, main="Title", xlab="X", ylab="Y")`;
    // base R plot alone has no strong R-specific tokens beyond plot()
    // but parseRCode should still handle it — detection may return null
    // since "plot" is ambiguous. Let's verify what the scorer returns.
    const result = detectLanguage(code);
    // "plot" alone doesn't trigger any R or Python patterns strongly
    // No ggplot, no plt., no import — should be null
    expect(result).toBeNull();
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

  it('the caption is raised too: the helper reaches the figure\'s texts', () => {
    // No rcParams key moves a caption (`figure.titlesize` moves
    // fig.suptitle), so the block form left it out; the helper raises
    // fig.text() captions directly.
    const code = `plt.rcParams['font.size'] = 6\nplt.figure(figsize=(9, 6))`;
    const r = computeReadability(parsePythonCode(code), 7, 10);
    expect(r.fontFixes.some((f) => f.key === 'caption')).toBe(true);
    expect(r.fontSnippet).toContain("'caption':");
    expect(r.fontSnippet).not.toContain('figure.titlesize');
  });
});

/** A Python fix as buildFontSnippet emits it. */
const PY_NEED = "{'axisTitle': 17, 'axisText': 14}";

/** The user's script back from a Python fix: the block out, each rewritten call back to its receiver. */
function stripPyFix(fixed: string): string {
  const lines = fixed.split('\n');
  const begin = lines.findIndex((l) => l.startsWith('# Postr: raise text that prints too small (begin)'));
  const end = lines.findIndex((l) => l.startsWith('# Postr: raise text that prints too small (end)'));
  let after = end + 1;
  while (after < lines.length && lines[after] === '') after += 1;
  let before = begin;
  while (before > 0 && lines[before - 1] === '') before -= 1;
  const kept = [...lines.slice(0, before), ...(before > 0 ? [''] : []), ...lines.slice(after)];
  const joined = (before > 0 ? [...lines.slice(0, before), ...lines.slice(after)] : kept).join('\n');
  return joined
    .replace(/\(lambda \*a, \*\*k: _postr_raise_text\(([^,]+), _POSTR_NEED, every=True\)\.show\(\*a, \*\*k\)\)/g, '$1.show')
    .replace(/_postr_raise_text\(None, _POSTR_NEED(?:, [^()]*)?\)\./g, '')
    .replace(/_postr_raise_text\(([^,]+), _POSTR_NEED(?:, [^()]*)?\)\./g, '$1.')
    .replace(/\n+_postr_raise_text\(None, _POSTR_NEED, every=True, end=True\)\n*$/, '');
}

describe('applyFontFixes — the copy button hands back runnable code', () => {
  const rFix = 'theme(\n  axis.title = element_text(size = 17)\n)';

  it('inserts after an existing theme_*() so ggplot lets it win', () => {
    const code = `ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  theme_minimal(base_size = 11)
ggsave("fig.png", width = 9, height = 6)`;
    const out = applyFontFixes(code, 'r', rFix);
    // Lands between the theme_minimal() call and ggsave(), not at the end.
    expect(out.indexOf('theme(')).toBeGreaterThan(out.indexOf('theme_minimal'));
    expect(out.indexOf('theme(')).toBeLessThan(out.indexOf('ggsave'));
    expect(out).toContain('theme_minimal(base_size = 11) +');
  });

  it('never appends below ggsave(), where it would do nothing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()
ggsave("fig.png", width = 9, height = 6)`;
    const out = applyFontFixes(code, 'r', rFix);
    expect(out.indexOf('theme(')).toBeLessThan(out.indexOf('ggsave'));
    expect(out).toContain('geom_point() +');
  });

  it('handles a theme_*() containing a nested call', () => {
    const code = `p + theme_bw(base_family = paste0("Hel", "vetica"))
ggsave("f.png", width = 9, height = 6)`;
    const out = applyFontFixes(code, 'r', rFix);
    // The insert must go after the OUTER paren, or the code will not parse.
    expect(out).toContain('vetica")) +');
    expect(out.indexOf('theme(')).toBeLessThan(out.indexOf('ggsave'));
  });

  it('python: the saves are left as written; the block makes every save raise, and a call at the end raises what is open', () => {
    const code = `import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(9, 6))
ax.set_xlabel("Time (s)", fontsize=9)
fig.savefig("figure.png", dpi=300)`;
    const out = applyFontFixes(code, 'python', PY_NEED);
    expect(out).toContain('\nfig.savefig("figure.png", dpi=300)\n');
    expect(out).toContain(`_POSTR_NEED = ${PY_NEED}`);
    expect(out.match(/def _postr_raise_text/g)).toHaveLength(1);
    expect(out).toMatch(/^_postr_install\(\)$/m);
    expect(out.trimEnd().split('\n').pop()).toBe('_postr_raise_text(None, _POSTR_NEED, every=True, end=True)');
    // Take the block and the end call out: the user's script, exactly.
    expect(stripPyFix(out)).toBe(code);
  });

  it('python: the block goes after a module docstring and from __future__ imports', () => {
    const code = ['"""Figure for the poster."""', 'from __future__ import annotations', 'import matplotlib.pyplot as plt',
      'fig, ax = plt.subplots()', 'fig.savefig("f.png")'].join('\n');
    const lines = applyFontFixes(code, 'python', PY_NEED).split('\n');
    const block = lines.findIndex((l) => l.startsWith('# Postr: raise text'));
    expect(block).toBeGreaterThan(lines.indexOf('from __future__ import annotations'));
    expect(block).toBeLessThan(lines.indexOf('import matplotlib.pyplot as plt'));
  });

  it('python: a multi-line or continued import keeps the block out of it', () => {
    for (const imports of [['from matplotlib.ticker import (', '    MaxNLocator,', ')'], ['from matplotlib.ticker import \\', '    MaxNLocator']]) {
      const code = ['import matplotlib.pyplot as plt', ...imports, 'fig, ax = plt.subplots()', 'fig.savefig("f.png")'].join('\n');
      const out = applyFontFixes(code, 'python', PY_NEED);
      expect(out.indexOf('# Postr: raise text')).toBeLessThan(out.indexOf('import matplotlib.pyplot'));
      expect(stripPyFix(out)).toBe(code);
    }
  });

  it('python: saves inside one-line bodies, comprehensions and defs are left as written', () => {
    const code = ['import matplotlib.pyplot as plt', 'from matplotlib.backends.backend_pdf import PdfPages',
      'figs = [plt.figure() for _ in range(2)]', 'for k, f in enumerate(figs): f.savefig(f"f{k}.png")',
      'if figs: figs[0].savefig("a.png")', 'else: plt.savefig("b.png")', '[f.savefig(n) for f, n in zip(figs, "ab")]',
      'def save(f, n): f.savefig(n)', 'with PdfPages("w.pdf") as pdf: pdf.savefig(figs[0])'].join('\n');
    const out = applyFontFixes(code, 'python', PY_NEED);
    for (const line of code.split('\n')) expect(out).toContain(`\n${line}\n`);
    expect(stripPyFix(out)).toBe(code);
  });

  it('python: a show() is rewritten to raise every open figure; with neither save nor show, a call at the end', () => {
    const shown = applyFontFixes('import matplotlib.pyplot as plt\nplt.plot([1], [1])\nplt.show()', 'python', PY_NEED);
    expect(shown).toContain('_postr_raise_text(plt, _POSTR_NEED, every=True).show()');
    const bare = applyFontFixes('import matplotlib.pyplot as plt\nplt.plot([1], [1])', 'python', PY_NEED).trimEnd().split('\n');
    expect(bare[bare.length - 1]).toBe('_postr_raise_text(None, _POSTR_NEED, every=True, end=True)');
    // fig.show() does not close the figure; it is left alone.
    expect(applyFontFixes('import matplotlib.pyplot as plt\nfig.show()\nfig.savefig("f.png")', 'python', PY_NEED)).toContain('\nfig.show()');
  });

  it('python: a show() in a comment, a string or a def of its own is not rewritten, nor fig.show()', () => {
    const code = ['import matplotlib.pyplot as plt', '# plt.show()', 'note = "call plt.show later"',
      'def show(): pass', 'fig, ax = plt.subplots()', 'fig.show()', 'plt.show()'].join('\n');
    const out = applyFontFixes(code, 'python', PY_NEED);
    expect(out.match(/_postr_raise_text\(plt, _POSTR_NEED, every=True\)\.show\(\)/g)).toHaveLength(1);
    expect(out).toContain('\n# plt.show()\n');
    expect(out).toContain('\ndef show(): pass\n');
    expect(out).toContain('\nfig.show()\n');
  });

  it('python: fixing an already fixed script replaces the block, and routes each show and adds the end call once', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nfig.savefig("f.png")\nplt.show()';
    const once = applyFontFixes(code, 'python', PY_NEED);
    const twice = applyFontFixes(once, 'python', "{'plotTitle': 20}");
    expect(twice.match(/def _postr_raise_text/g)).toHaveLength(1);
    expect(twice.match(/^_postr_install\(\)$/gm)).toHaveLength(1);
    expect(twice).toContain("_POSTR_NEED = {'plotTitle': 20}");
    expect(twice.match(/_postr_raise_text\(plt, _POSTR_NEED, every=True\)\.show/g)).toHaveLength(1);
    expect(twice.match(/^_postr_raise_text\(None, _POSTR_NEED, every=True, end=True\)$/gm)).toHaveLength(1);
    expect(stripPyFix(twice)).toBe(code);
  });

  it('R: a trailing comment does not swallow the joining +', () => {
    // Measured in ggplot2: with the + inside the comment the script still
    // evaluates cleanly and the theme simply never attaches — a silent
    // no-op, which is the failure this whole feature exists to avoid.
    const code = ['library(ggplot2)', 'p <- ggplot(df, aes(x, y)) + geom_point()  # main plot',
      'ggsave("f.png", width = 9, height = 6)'].join('\n');
    const out = applyFontFixes(code, 'r', 'theme(\n  axis.title = element_text(size = 17)\n)');
    expect(out.split('\n').some((l) => /#.*\+\s*$/.test(l))).toBe(false);
    expect(out).toMatch(/geom_point\(\) \+\s+# main plot/);
  });

  it('R: a commented-out theme_*() does not attract the insert', () => {
    // The commented copy must come AFTER the live one, because the
    // insertion point is the LAST theme_*() call — put it first and the
    // old raw-text scan picks the right one by luck.
    const code = [
      'p <- ggplot(df, aes(x, y)) + geom_point() + theme_minimal(base_size = 11)',
      '# p <- p + theme_minimal(base_size = 20)   # an older version',
      'ggsave("f.png", width = 9, height = 6)',
    ].join('\n');
    const out = applyFontFixes(code, 'r', 'theme(axis.title = element_text(size = 17))');
    // The comment survives byte-for-byte...
    expect(out).toContain('# p <- p + theme_minimal(base_size = 20)   # an older version');
    // ...and the snippet hangs off the LIVE theme_minimal, not the dead one.
    expect(out).toContain('theme_minimal(base_size = 11) +');
  });

  it('R: offsets survive comments around the real theme call', () => {
    // Pins that the comment mask is length-preserving: the index is found
    // in the masked copy and applied to the original, so any drift lands
    // the insert mid-token. The banner sits BEFORE (so it shifts offsets)
    // and a dead theme_*() sits AFTER (so a raw-text scan picks it).
    const code = [
      '# --------------------------------------------------------------',
      '# Banner with parens ( ) and a fake theme_minimal( inside it',
      '# --------------------------------------------------------------',
      'p <- ggplot(df, aes(x, y)) + geom_point() + theme_minimal(base_size = 11)',
      '# p + theme_bw(base_size = 9)',
      'ggsave("f.png", width = 9, height = 6)',
    ].join('\n');
    const out = applyFontFixes(code, 'r', 'theme(axis.title = element_text(size = 17))');
    expect(out).toContain('theme_minimal(base_size = 11) +');
    expect(out).toContain('# Banner with parens ( ) and a fake theme_minimal( inside it');
    expect(out).toContain('# p + theme_bw(base_size = 9)');
    const commented = out.split('\n').filter((l) => l.trimStart().startsWith('#'));
    expect(commented.join('\n')).not.toContain('axis.title');
  });

  it('returns the code untouched when there is nothing to apply', () => {
    const code = 'ggplot(df) + geom_point()';
    expect(applyFontFixes(code, 'r', null)).toBe(code);
  });

  it('produces code whose parens still balance', () => {
    const code = `ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  theme_minimal(base_size = 11)
ggsave("fig.png", width = 9, height = 6)`;
    const out = applyFontFixes(code, 'r', rFix);
    expect(out.split('(').length).toBe(out.split(')').length);
  });

  it('python: a save inside a function or a loop is left where it is, as written', () => {
    const code = ['import matplotlib.pyplot as plt', '', 'def make_figure(x, y):',
      '    fig, ax = plt.subplots(figsize=(9, 6))', '    ax.plot(x, y)', '    fig.savefig("a.png")', '',
      'for i in range(3):', '    fig, ax = plt.subplots()', '    plt.savefig(f"b{i}.png")'].join('\n');
    const out = applyFontFixes(code, 'python', PY_NEED);
    expect(out).toContain('\n    fig.savefig("a.png")\n');
    expect(out).toContain('\n    plt.savefig(f"b{i}.png")\n');
    expect(stripPyFix(out)).toBe(code);
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

describe('comment stripping respects string literals', () => {
  // Kept from the reverted detection change: these pin stripComments
  // itself, which is still in use. The detection-from-stripped-code tests
  // went with the revert — scoring stripped code doubled the cases where
  // Check does nothing (5 -> 10 of 20) because the panel has no
  // 'could not tell R from Python' state yet. They return with that state.
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

// Fix 13, claim W1: the re-check could not read the checker's own fix, so
// pasting the corrected code back showed the same failures (42 of 42 runs
// identical, while real matplotlib passed 31 of them). The re-check now
// reads the helper's calls: each listed class is at least the size named.
describe('the Python fix, applied again and to harder scripts (step 9 review, rounds 2 and 3)', () => {
  const NEED2 = "{'axisTitle': 20, 'axisText': 16, 'legendText': 14}";
  const twice = (code: string) => applyFontFixes(applyFontFixes(code, 'python', PY_NEED), 'python', NEED2);
  const block = '# Postr: raise text that prints too small';

  it('R2-02: a second fix leaves every save as written, commas and all', () => {
    for (const code of [
      'import seaborn as sns\nsns.catplot(data=df, x="a", y="b").savefig("f.png")',
      'import matplotlib.pyplot as plt\nfig, axs = plt.subplots(2, 2)\naxs[0, 1].figure.savefig("f.png")',
      'import matplotlib.pyplot as plt\nplt.figure(1, figsize=(6, 4)).savefig("f.png")',
    ]) {
      const out = twice(code);
      expect(out).toContain(`\n${code.split('\n').pop()}\n`);
      expect(out.match(/def _postr_raise_text/g)).toHaveLength(1);
      expect(out).toContain(`_POSTR_NEED = ${NEED2}`);
      expect(stripPyFix(out)).toBe(code);
    }
  });

  it('R2-03: a second fix finds the earlier block when its marker comments were edited', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nfig.savefig("f.png")';
    const once = applyFontFixes(code, 'python', PY_NEED);
    const begin = `${block} (begin)`;
    const end = `${block} (end)`;
    for (const edited of [
      once.replace(`${begin}\n`, ''),
      once.replace(`${end}\n`, ''),
      once.replace(begin, `${begin} `).replace(end, `${end} `),
      once.replace(/\n/g, '\r\n'),
    ]) {
      const out = applyFontFixes(edited, 'python', NEED2).replace(/\r/g, '');
      expect(out.match(/def _postr_raise_text/g)).toHaveLength(1);
      expect(out.match(/def _postr_install/g)).toHaveLength(1);
      expect(out.match(/^_postr_install\(\)$/gm)).toHaveLength(1);
      expect(out).not.toMatch(/^def[ \t]*$/m);
      expect(out.match(/_POSTR_NEED = /g)).toHaveLength(1);
      // No marker of the earlier block is left behind.
      expect(out.match(/raise text that prints too small \(begin\)/g)).toHaveLength(1);
      expect(out.match(/raise text that prints too small \(end\)/g)).toHaveLength(1);
      expect(stripPyFix(out)).toBe(code);
    }
  });

  it('R2-07: a first-line cell magic stays on the first line', () => {
    const code = '%%time\nimport matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nfig.savefig("f.png")';
    expect(applyFontFixes(code, 'python', PY_NEED).split('\n')[0]).toBe('%%time');
  });

  it('R2-09: a script full of unclosed calls is fixed in linear time, and not doubled', () => {
    const code = `import matplotlib.pyplot as plt\n${'_postr_raise_text(\n'.repeat(20_000)}`;
    const t0 = performance.now();
    const out = applyFontFixes(code, 'python', PY_NEED);
    expect(performance.now() - t0).toBeLessThan(2_000);
    expect(out.length).toBeLessThan(code.length * 1.5);
  });

  it('R3-01: an attribute named savefig or show that is not matplotlib\'s is left alone', () => {
    const code = ['import matplotlib.pyplot as plt', 'import functools', 'fig, ax = plt.subplots()',
      'if args.savefig: fig.savefig(args.savefig)', 'self.savefig = True', 'save = fig.savefig',
      'fig.savefig = functools.partial(fig.savefig, dpi=120)', 'cfg.plot.show()', 'save("f.png")'].join('\n');
    const out = applyFontFixes(code, 'python', PY_NEED);
    for (const line of code.split('\n')) expect(out).toContain(`\n${line}\n`);
    expect(stripPyFix(out)).toBe(code);
  });

  it('R3-04: a save added to a script that never binds plt imports it', () => {
    const code = 'import matplotlib.pyplot as pyplot\nfig, ax = pyplot.subplots()\nax.set_xlabel("t")';
    const fixed = generateTargetedFullFix(code, parsePythonCode(code), "{'axisTitle': 17}");
    expect(fixed).toMatch(/\nimport matplotlib\.pyplot as plt\nplt\.savefig\("poster_figure\.png"/);
  });

  it('R2-06: shows across a line continuation, continued in brackets, and under an import of several modules are routed', () => {
    for (const code of [
      'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nplt \\\n    .show()',
      'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\n(plt\n    .show())',
      'import numpy as np, matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nplt.show()',
    ]) expect(applyFontFixes(code, 'python', PY_NEED), code).toContain('_postr_raise_text(plt, _POSTR_NEED, every=True).show()');
  });

  it('R3-08 and n20: shows through a bracketed import and a show handed on uncalled are routed', () => {
    const bracketed = 'from matplotlib import (\n    pyplot as plt,\n    cm,\n)\nfig, ax = plt.subplots()\nplt.show()';
    expect(applyFontFixes(bracketed, 'python', PY_NEED)).toContain('_postr_raise_text(plt, _POSTR_NEED, every=True).show()');
    const handed = 'import matplotlib.pyplot as plt\ndisplay_plot = plt.show\nfig, ax = plt.subplots()\ndisplay_plot()';
    const out = applyFontFixes(handed, 'python', PY_NEED);
    expect(out).toContain('display_plot = (lambda *a, **k: _postr_raise_text(plt, _POSTR_NEED, every=True).show(*a, **k))');
    expect(stripPyFix(out)).toBe(handed);
    // Replaced or deleted, it is the attribute itself: left alone.
    const replaced = 'import matplotlib.pyplot as plt\nplt.show = print\ndel plt.show';
    expect(stripPyFix(applyFontFixes(replaced, 'python', PY_NEED))).toBe(replaced);
    expect(applyFontFixes(replaced, 'python', PY_NEED)).toContain('\nplt.show = print\ndel plt.show\n');
  });

  it('the re-check gives the fix no credit while a pyplot show is not routed, a figure is printed by its canvas, or the wrap is not installed', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel("t")\nfig.savefig("f.png")';
    const fixed = applyFontFixes(code, 'python', "{'axisTitle': 17}");
    expect(parsePythonCode(fixed).overrides.axisTitle, 'precondition: credited as fixed').toBe(17);
    expect(parsePythonCode(`${fixed}\nplt.show()`).overrides.axisTitle).toBeUndefined();
    expect(parsePythonCode(`${fixed}\nfig.canvas.print_figure("g.png")`).overrides.axisTitle).toBeUndefined();
    expect(parsePythonCode(fixed.replace(/^_postr_install\(\)$/m, '')).overrides.axisTitle).toBeUndefined();
  });

  it('R2-14: of two blocks, the one Python runs last is read; a helper deleted is not read at all', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel("t")\nfig.savefig("f.png")';
    const fixed = applyFontFixes(code, 'python', "{'axisTitle': 40}");
    const two = fixed.replace("_POSTR_NEED = {'axisTitle': 40}", "_POSTR_NEED = {'axisTitle': 40}\n_POSTR_NEED = {'axisTitle': 12}");
    expect(parsePythonCode(two).overrides.axisTitle ?? 0).toBeLessThanOrEqual(12);
    const noDef = fixed.replace(/^def _postr_raise_text[\s\S]*?\n(?=\S)/m, '');
    expect(noDef, 'precondition: the def is gone').not.toContain('def _postr_raise_text');
    expect(parsePythonCode(noDef).overrides.axisTitle).toBeUndefined();
  });

  it('R3-06: shows are routed after a continuation before a Windows line break, an import after a `;`, and a receiver over several lines', () => {
    for (const [code, receiver] of <Array<[string, string]>>[
      ['import matplotlib.pyplot as plt\r\nfig, ax = plt.subplots()\r\nplt \\\r\n    .show()', 'plt'],
      ['import numpy as np; import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nplt.show()', 'plt'],
      ['import matplotlib.pyplot\nfig, ax = matplotlib.pyplot.subplots()\n(matplotlib\n    .pyplot\n    .show())', 'matplotlib\n    .pyplot'],
    ]) expect(applyFontFixes(code, 'python', PY_NEED), code).toContain(`_postr_raise_text(${receiver}, _POSTR_NEED, every=True)`);
  });

  it('R3-07: a long chain of `.show` attributes is fixed and read back in linear time', () => {
    const code = `import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.set_xlabel("x")\nfig${'.show'.repeat(8_000)}\n`;
    const t0 = performance.now();
    parsePythonCode(applyFontFixes(code, 'python', PY_NEED));
    expect(performance.now() - t0).toBeLessThan(1_000);
  });

  it('R4-07: a bare show() under `from matplotlib.pyplot import *` is routed', () => {
    const code = 'from matplotlib.pyplot import *\nfig, ax = subplots()\nax.set_title("t")\nshow()';
    expect(applyFontFixes(code, 'python', PY_NEED)).toContain('\n_postr_raise_text(None, _POSTR_NEED, every=True).show()\n');
  });

  it('R5-08: a script that defines its own show() keeps calling it under `from matplotlib.pyplot import *`', () => {
    const code = 'from matplotlib.pyplot import *\ndef show():\n    savefig("report.pdf")\nfig, ax = subplots()\nax.set_title("t")\nshow()';
    const out = applyFontFixes(code, 'python', PY_NEED);
    expect(out).toContain('\nshow()\n');
    expect(out).not.toContain(').show()');
  });

  it('R6: any display( withholds the credit, since a figure can reach it under any name (round 6, R6C-01, R6P-01)', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel("t")\nfig.savefig("f.png")';
    const fixed = applyFontFixes(code, 'python', "{'axisTitle': 17}");
    expect(parsePythonCode(fixed).overrides.axisTitle, 'precondition: credited as fixed').toBe(17);
    for (const shown of [
      'display(fig)', 'display(g.figure)', 'IPython.display.display(plt.gcf())',
      'display(f)', 'display(ax.get_figure())', 'display(g.fig)', 'display(df, fig)', 'display(*figs)',
      'display(plt.figure(1))', 'ipd.display(p)', 'display(\n    fig,\n)',
      // Not a figure, but the checker cannot tell (round 5's R5-09, reversed:
      // a false red is kept rather than a false green).
      'display(df.describe())',
    ]) expect(parsePythonCode(`${fixed}\n${shown}`).overrides.axisTitle, shown).toBeUndefined();
  });

  it('R6: a show() the script defines or assigns anywhere, not only at the top, is its own (round 6, R6C-04, R6P-04)', () => {
    for (const own of [
      'def main():\n    def show():\n        savefig("report.pdf")\n    fig, ax = subplots()\n    show()\nmain()',
      'if True:\n    def show():\n        savefig("r.pdf")\nfig, ax = subplots()\nshow()',
      'try:\n    show = save_pdf\nexcept NameError:\n    pass\nfig, ax = subplots()\nshow()',
    ]) {
      const out = applyFontFixes(`from matplotlib.pyplot import *\n${own}`, 'python', PY_NEED);
      expect(out, own).not.toContain(').show()');
    }
  });

  it('R6: a method named show is not the script\'s own show (round 6)', () => {
    const code = 'from matplotlib.pyplot import *\nclass Report:\n    def show(self):\n        print("x")\nfig, ax = subplots()\nax.set_title("t")\nshow()';
    expect(applyFontFixes(code, 'python', PY_NEED)).toContain('\n_postr_raise_text(None, _POSTR_NEED, every=True).show()\n');
  });

  it('R6: a bare show() under `from pylab import *` is routed (round 6, R6P-03)', () => {
    for (const imp of ['from pylab import *', 'from matplotlib.pylab import *', 'from pylab import show, subplots']) {
      const code = `${imp}\nfig, ax = subplots()\nax.set_title("t")\nshow()`;
      expect(applyFontFixes(code, 'python', PY_NEED), imp).toContain('\n_postr_raise_text(None, _POSTR_NEED, every=True).show()\n');
    }
  });

  it('R4-05: the re-check gives no credit when a figure reaches a file or a notebook without Figure.savefig', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel("t")\nfig.savefig("f.png")';
    const fixed = applyFontFixes(code, 'python', "{'axisTitle': 17}");
    expect(parsePythonCode(fixed).overrides.axisTitle, 'precondition: credited as fixed').toBe(17);
    for (const bypass of [
      'fig.canvas.print_png("g.png")',
      'write = fig.canvas.print_figure',
      'FigureCanvasPdf(fig).print_pdf("g.pdf")',
      'fig.canvas.draw()\nimage = fig.canvas.buffer_rgba()',
      'display(fig)',
    ]) expect(parsePythonCode(`${fixed}\n${bypass}`).overrides.axisTitle, bypass).toBeUndefined();
  });

  it('R4-11: a save added to a script that imports pyplot only inside a function imports it at the top level', () => {
    const code = 'def main():\n    import matplotlib.pyplot as plt\n    fig, ax = plt.subplots()\n    ax.set_xlabel("t")\n    plt.show()\n\nmain()';
    const fixed = generateTargetedFullFix(code, parsePythonCode(code), "{'axisTitle': 17}");
    expect(fixed).toMatch(/\nimport matplotlib\.pyplot as plt\nplt\.savefig\("poster_figure\.png"/);
  });

  it('R4-13: a second fix takes out an earlier install def whose marker comments and call were deleted', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nfig.savefig("f.png")';
    const once = applyFontFixes(code, 'python', PY_NEED)
      .replace('# Postr: raise text that prints too small (begin)\n', '')
      .replace('# Postr: raise text that prints too small (end)\n', '')
      .replace(/^_postr_install\(\)\n/m, '');
    expect(once, 'precondition: the earlier install def is the block\'s last line').not.toMatch(/^_postr_install\(\)$/m);
    const out = applyFontFixes(once, 'python', NEED2);
    expect(out.match(/^def _postr_install/gm)).toHaveLength(1);
    expect(out.match(/^_postr_install\(\)$/gm)).toHaveLength(1);
  });

  it('R3-06: a second fix takes a show handed on uncalled back to one lambda', () => {
    const handed = 'import matplotlib.pyplot as plt\ndisplay_plot = plt.show\nfig, ax = plt.subplots()\ndisplay_plot()';
    const out = twice(handed);
    expect(out.match(/\(lambda \*a, \*\*k:/g)).toHaveLength(1);
    expect(stripPyFix(out)).toBe(handed);
  });

  it('a second fix keeps code written after the end call on its line, and a call nested in another', () => {
    const code = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.set_xlabel("t")\nfig.savefig("f.png")';
    const once = applyFontFixes(code, 'python', PY_NEED);
    const edited = once.replace(/^(_postr_raise_text\(None, _POSTR_NEED, every=True, end=True\))$/m, '$1; print("done")  # finished');
    expect(edited, 'precondition: the end call has code after it').toContain('end=True); print("done")');
    const out = applyFontFixes(edited, 'python', NEED2);
    expect(out).toMatch(/^print\("done"\) {2}# finished$/m);
    expect(out.match(/^_postr_raise_text\(None, _POSTR_NEED, every=True, end=True\)$/gm)).toHaveLength(1);
    // Wrapped twice by hand: one call is taken out, the other left whole.
    const nested = `${once}\n_postr_raise_text(_postr_raise_text(plt, _POSTR_NEED, every=True), _POSTR_NEED, every=True).show()`;
    const again = applyFontFixes(nested, 'python', NEED2);
    expect(again).toContain('\n_postr_raise_text(plt, _POSTR_NEED, every=True).show()');
    expect(again).not.toMatch(/_postr_raise_text\([^\n]*\)\.\s*$/m);
  });
});

describe('the re-check reads its own Python fix', () => {
  const script = 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_title("Result")\nfig.savefig("f.png")';

  it('each class the fix names is read at the size it names', () => {
    const fixed = applyFontFixes(script, 'python', "{'plotTitle': 19, 'axisTitle': 17}");
    const p = parsePythonCode(fixed);
    expect(p.overrides.plotTitle).toBe(19);
    expect(p.overrides.axisTitle).toBe(17);
  });

  it('the re-check never reads a class lower than the script already sets it', () => {
    const big = script.replace('import matplotlib.pyplot as plt', "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 20");
    const p = parsePythonCode(applyFontFixes(big, 'python', "{'axisTitle': 17}"));
    expect(p.overrides.axisTitle ?? p.baseSize).toBeGreaterThanOrEqual(20);
  });

  it('a copy of the block in a comment or a string is not read', () => {
    const block = "_POSTR_NEED = {'axisTitle': 30}\n_postr_raise_text(fig, _POSTR_NEED).savefig('f.png')";
    expect(parsePythonCode(`${script}\n# ${block.replace('\n', '\n# ')}`).overrides.axisTitle).toBeUndefined();
    expect(parsePythonCode(`${script}\nnote = """${block}"""`).overrides.axisTitle).toBeUndefined();
    // Each line of the copy at column 0 inside a multi-line string (round 2, R2-12).
    expect(parsePythonCode(`${script}\nnote = """\n${block}\n"""`).overrides.axisTitle).toBeUndefined();
  });

  it('a size the user set on one axis does not stand for the whole class', () => {
    // Step 9 review, S9-06: the x label at 30 pt, the y label inheriting 10;
    // the fix raises the class to 17, so the smallest drawn is 17, not 30.
    const oneAxis = "import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 7))\nax.set_xlabel('t', fontsize=30)\nax.set_ylabel('y')\nfig.savefig('f.png')";
    const p = parsePythonCode(applyFontFixes(oneAxis, 'python', "{'axisTitle': 17}"));
    expect(p.overrides.axisTitle).toBe(17);
  });

  it('a row the fix raised is not marked "(you set this)"', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 6\nfig, ax = plt.subplots(figsize=(10, 7))\nfig.savefig('f.png')";
    const first = computeReadability(parsePythonCode(code), 10, 7);
    const again = computeReadability(parsePythonCode(applyFontFixes(code, 'python', first.fontSnippet)), 5, 3.5);
    expect(again.fontFixes.length, 'precondition: at a smaller size something fails again').toBeGreaterThan(0);
    expect(again.fontFixes.filter((f) => f.wasOverridden)).toEqual([]);
  });

  it('the corrected code re-checks with every fixed element passing', () => {
    const code = "import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = 6\nfig, ax = plt.subplots(figsize=(10, 7))\nfig.savefig('f.png')";
    const first = computeReadability(parsePythonCode(code), 10, 7);
    expect(first.fontFixes.length, 'precondition: something fails').toBeGreaterThan(0);
    const fixed = applyFontFixes(code, 'python', first.fontSnippet);
    const again = computeReadability(parsePythonCode(fixed), 10, 7);
    const fixedNames = new Set(first.fontFixes.map((f) => f.name));
    expect(again.elements.filter((e) => fixedNames.has(e.name) && e.status !== 'pass')).toEqual([]);
  });
});

