/**
 * tickFit — what a drawn chart's own tick labels ask of its layout (fix
 * 13c, review round 1: Q-R2 and Q-R4; record
 * docs/fixes/13c-chart-text-minimums.md).
 *
 * Plot picks the ticks of a continuous axis (numbers, dates) and their
 * labels itself, so the layout cannot know them before Plot draws: the
 * left margin was a constant, and a "1,000,000" tick label ran past the
 * chart's left edge at every size; an x tick label at the plot's right end
 * past its right edge; and in a wide chart Plot's default spacing (one tick
 * per 80 px) set labels such as "12,000" closer than their own width. This
 * reads the labels Plot drew, measures them in the chart's font, and asks
 * for the margins and the spacing they need; renderChart lays the chart out
 * again with them.
 */
import { EDGE, TICK_MARK } from './chartLayout';
import type { LayoutOverrides, PlotBuild } from './plotOptions';
import type { MeasureText } from './textMeasure';

/** Plot's default x tick spacing, px (marks/axis.js). */
const PLOT_X_TICK_SPACING = 80;
/** The least space between two x tick labels, in tick-label sizes. */
const X_LABEL_GAP = 0.5;

const TRANSLATE = /translate\(\s*(-?[\d.]+(?:e-?\d+)?)/i;

/** The x offset of an element's own translate(), 0 without one. */
function translateX(el: Element | null): number {
  const m = el?.getAttribute('transform')?.match(TRANSLATE);
  return m ? Number(m[1]) : 0;
}

function tickTexts(svg: SVGSVGElement, axis: 'x' | 'y'): SVGTextElement[] {
  return [...svg.querySelectorAll<SVGTextElement>(`[aria-label="${axis}-axis tick label"] text`)].filter((t) => (t.textContent ?? '').trim());
}

/**
 * The overrides the drawn tick labels need beyond `current`, or null when
 * they fit: never narrower margins or closer ticks than `current` holds.
 */
export function fitTicks(svg: SVGSVGElement, build: PlotBuild, widthPx: number, measure: MeasureText, current: LayoutOverrides): LayoutOverrides | null {
  const px = build.tickPx;
  const marginLeft = Number(build.options['marginLeft']);
  const marginRight = Number(build.options['marginRight']);
  const next: LayoutOverrides = { ...current };
  let changed = false;
  const widen = (key: 'marginLeft' | 'marginRight', need: number, has: number) => {
    if (need <= has + 0.5) return;
    next[key] = Math.ceil(Math.max(next[key] ?? 0, need));
    changed = true;
  };

  // A continuous y axis: its labels end at the tick mark, left of the plot.
  if (build.continuous.y) {
    const widest = Math.max(0, ...tickTexts(svg, 'y').map((t) => measure(t.textContent ?? '', px)));
    if (widest > 0) widen('marginLeft', EDGE + widest + TICK_MARK, marginLeft);
  }

  // A continuous x axis: labels centred on their ticks.
  if (build.continuous.x) {
    const labels = tickTexts(svg, 'x')
      .map((t) => ({ x: translateX(t.parentElement) + translateX(t), w: measure(t.textContent ?? '', px) }))
      .sort((a, b) => a.x - b.x);
    if (labels.length) {
      const first = labels[0]!;
      const last = labels[labels.length - 1]!;
      widen('marginLeft', marginLeft + (EDGE - (first.x - first.w / 2)), marginLeft);
      widen('marginRight', marginRight + (last.x + last.w / 2 - (widthPx - EDGE)), marginRight);
      // Labels closer than their half-widths and a gap: ask for ticks
      // farther apart, by the worst pair's shortfall.
      let worst = 1;
      for (let i = 1; i < labels.length; i += 1) {
        const a = labels[i - 1]!;
        const b = labels[i]!;
        const need = (a.w + b.w) / 2 + X_LABEL_GAP * px;
        const has = b.x - a.x;
        if (has > 0 && need > has) worst = Math.max(worst, need / has);
      }
      if (worst > 1) {
        next.xTickSpacing = Math.ceil((current.xTickSpacing ?? PLOT_X_TICK_SPACING) * worst * 1.05);
        changed = true;
      }
    }
  }
  return changed ? next : null;
}
