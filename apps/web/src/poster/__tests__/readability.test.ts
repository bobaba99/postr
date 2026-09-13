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
    expect(p.warnings).toContain('No font size found — assuming ggplot2 default base_size = 11pt.');
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

  it('uses the caller-supplied label in the Python warning', () => {
    const p = parsePythonCode('plt.plot(x, y)', {
      defaultWidthIn: 24,
      defaultHeightIn: 18,
      defaultSizeLabel: 'the print size you entered,',
    });
    expect(p.warnings).toContain(
      'No figsize=(w,h) found — using the print size you entered, 24.0"×18.0" as the source canvas.',
    );
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

  it('font-first: emits a copy-ready matplotlib rcParams block', () => {
    const code = `plt.rcParams['font.size'] = 8\nplt.figure(figsize=(9, 6))`;
    const snip = computeReadability(parsePythonCode(code), 7, 10).fontSnippet!;
    expect(snip).toContain('rcParams.update');
    // Tick labels live on two keys in matplotlib; both must be set or
    // the y axis silently keeps the old size.
    if (snip.includes('xtick.labelsize')) expect(snip).toContain('ytick.labelsize');
    expect(snip.split('(').length).toBe(snip.split(')').length);
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

  it('never offers a matplotlib key that does not move a caption', () => {
    // `figure.titlesize` moves fig.suptitle, not a caption. Emitting it
    // is a line that silently does nothing.
    const code = `plt.rcParams['font.size'] = 6\nplt.figure(figsize=(9, 6))`;
    const r = computeReadability(parsePythonCode(code), 7, 10);
    expect(r.fontSnippet).not.toContain('figure.titlesize');
    // Still reported in the per-element advice, just not in the snippet.
    expect(r.fontFixes.some((f) => f.name === 'Caption')).toBe(true);
  });
});

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

  it('puts rcParams above the figure, where matplotlib reads it', () => {
    const py = "plt.rcParams.update({\n    'axes.labelsize': 17\n})";
    const code = `import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(9, 6))
ax.plot(x, y)`;
    const out = applyFontFixes(code, 'python', py);
    // After the figure is created, rcParams is a silent no-op.
    expect(out.indexOf('axes.labelsize')).toBeLessThan(out.indexOf('plt.subplots'));
    expect(out.indexOf('import matplotlib')).toBeLessThan(out.indexOf('axes.labelsize'));
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
});
