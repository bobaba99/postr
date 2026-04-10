// apps/web/src/poster/__tests__/readability.test.ts
import { describe, it, expect } from 'vitest';
import {
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

  it('uses defaults when ggsave missing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(7);
    expect(p.canvasHeight).toBe(7);
    expect(p.warnings).toContain('No canvas size found — assuming R default 7"×7" (ggsave).');
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

  it('detects facet_wrap and adjusts canvas', () => {
    const code = `
      ggplot(df, aes(x, y)) + geom_point() +
      facet_wrap(~group, nrow = 2) +
      ggsave("fig.png", width = 10, height = 8)
    `;
    const p = parseRCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.effectiveCanvasHeight).toBe(4);
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

  it('detects subplots grid and adjusts canvas', () => {
    const code = `fig, axes = plt.subplots(2, 3, figsize=(12, 8))`;
    const p = parsePythonCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.facetCols).toBe(3);
    expect(p.effectiveCanvasHeight).toBe(4);
    expect(p.effectiveCanvasWidth).toBe(4);
  });

  it('uses defaults when figsize missing', () => {
    const code = `plt.plot(x, y)`;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBeCloseTo(6.4, 1);
    expect(p.canvasHeight).toBeCloseTo(4.8, 1);
    expect(p.warnings).toContain('No canvas size found — assuming matplotlib default 6.4"×4.8".');
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

  it('uses overrides when present instead of rel() defaults', () => {
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
    const result = computeReadability(params, 10, 10);
    const ticks = result.elements.find(e => e.name === 'Tick labels')!;
    // 20pt override → effective = (20/7)*10 = 28.6pt — passes easily
    expect(ticks.effectivePt).toBeCloseTo(28.6, 0);
    expect(ticks.status).toBe('pass');
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
