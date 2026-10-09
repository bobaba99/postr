/**
 * textMeasure — how wide a chart's text is drawn, in render px (fix 13c,
 * review round 1, record docs/fixes/13c-chart-text-minimums.md).
 *
 * The chart's layout sizes its margins, wraps its labels and lays its
 * legend out from these widths. It used to count characters at 0.6 em,
 * which is short for capitals and long digits: a "1,000,000" tick label
 * ran past the left edge, upper-case category labels were cut, legend
 * labels ran past the right edge (review findings Q-R2 to Q-R4). Measured
 * with a canvas in the chart's own font, the width is the one the svg draws.
 *
 * jsdom has no canvas: there the estimate stands in, generous on purpose so
 * a label errs toward wrapping early.
 */

/** Width in render px of `text` drawn at `fontPx`. */
export type MeasureText = (text: string, fontPx: number) => number;

/** The estimate's glyph widths, as shares of the font size. */
const UPPER_EM = 0.75;
const OTHER_EM = 0.6;

/** The width without a canvas: capitals at 0.75 em, everything else at 0.6 em. */
export const estimateTextWidth: MeasureText = (text, fontPx) => {
  let em = 0;
  for (const ch of text) em += /[A-Z]/.test(ch) ? UPPER_EM : OTHER_EM;
  return em * fontPx;
};

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
let shared: Context2D | null | undefined;

function canvasContext(): Context2D | null {
  if (shared !== undefined) return shared;
  shared = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      shared = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')) {
      shared = document.createElement('canvas').getContext('2d');
    }
  } catch {
    shared = null;
  }
  return shared;
}

/**
 * What a canvas width is padded by: 2 % and 0.16 em. The canvas measures
 * the advance; an engine's SVG text can come out wider (WebKit's "2024"
 * 59.58 px against the canvas's 58.79 at 25 px; Firefox's text box 4 px
 * wider than its advance, 391.78 against 387.78; scratch probe
 * ffmeasure), and a label laid out to the advance would touch an edge.
 */
const PAD_RATIO = 1.02;
const PAD_EM = 0.16;

/**
 * A measurer for text set in `fontFamily` (a CSS font-family list), with
 * the estimate where there is no canvas. Measured at the size it is drawn
 * at: widths do not scale with the size (the system font spaces small text
 * wider; at 25 px a title measured at 100 px and scaled came out 3 % short
 * in Chromium, 4 % in Firefox and WebKit, probe ffmeasure).
 */
export function textMeasurer(fontFamily: string): MeasureText {
  const ctx = canvasContext();
  if (!ctx) return estimateTextWidth;
  const cache = new Map<string, number>();
  return (text, fontPx) => {
    const key = `${fontPx}\u0000${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = `${fontPx}px ${fontFamily}`;
      w = ctx.measureText(text).width * PAD_RATIO + PAD_EM * fontPx;
      cache.set(key, w);
    }
    return w;
  };
}

/**
 * Wait (at most `timeoutMs`) for the chart's font to load, so it is the
 * font measured rather than a fallback the poster's font later replaces.
 * Resolves at once where there is no font loading API (jsdom) or nothing
 * to load.
 */
export async function loadChartFont(fontFamily: string, timeoutMs = 3000): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts || typeof fonts.load !== 'function') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fonts.load(`16px ${fontFamily}`),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Measure with the font there is.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
