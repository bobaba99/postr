/**
 * renderChart — (ChartSpec, ChartTheme) → SVGSVGElement.
 *
 * The only place Observable Plot is touched. The module is
 * lazy-loaded so posters without charts never pay for it, and the
 * result is post-processed into a single self-contained <svg>:
 *
 * - Axis titles are bumped to the 24 pt print minimum (ticks render
 *   at 18 pt via the base font size).
 * - Legends are painted as SVG marks INSIDE the svg rather than
 *   using Plot's HTML legend — one element serializes losslessly
 *   through every export path (print window, html-to-image
 *   thumbnails, SVG/PNG downloads).
 * - A viewBox is added so the svg scales with its block.
 */
import type { ChartSpec } from '@postr/shared';
import {
  buildPlotOptions,
  type ChartTheme,
  type LegendEntry,
  type PlotLike,
} from './plotOptions';

const SVG_NS = 'http://www.w3.org/2000/svg';

let plotPromise: Promise<PlotLike> | null = null;

function loadPlot(): Promise<PlotLike> {
  plotPromise ??= import('@observablehq/plot').then((m) => m as unknown as PlotLike);
  return plotPromise;
}

function readSize(svg: SVGSVGElement, fallbackW: number, fallbackH: number): [number, number] {
  const w = Number(svg.getAttribute('width')) || fallbackW;
  const h = Number(svg.getAttribute('height')) || fallbackH;
  return [w, h];
}

/** Bump axis titles to the 24 pt minimum (ticks stay at base size). */
function emphasizeAxisLabels(svg: SVGSVGElement, labelPx: number): void {
  const labels = svg.querySelectorAll(
    '[aria-label="x-axis label"], [aria-label="y-axis label"], [aria-label="fx-axis label"]',
  );
  labels.forEach((el) => {
    (el as SVGElement).setAttribute('font-size', String(Math.round(labelPx)));
  });
}

/**
 * Paint a swatch legend into the svg's top margin, growing the svg
 * as needed. Rows wrap at the chart width.
 */
function paintLegend(
  svg: SVGSVGElement,
  entries: LegendEntry[],
  theme: ChartTheme,
  tickPx: number,
): void {
  if (entries.length < 2) return;
  const doc = svg.ownerDocument;
  const [width, height] = readSize(svg, theme.widthPx, theme.heightPx);

  const swatch = Math.round(tickPx * 0.85);
  const gapX = Math.round(tickPx * 1.1);
  const gapY = Math.round(tickPx * 0.55);
  const rowH = swatch + gapY;
  const charW = tickPx * 0.6;
  const startX = 8;

  // Lay out entries left-to-right, wrapping at the svg width.
  let x = startX;
  let row = 0;
  const placed = entries.map((entry) => {
    const w = swatch + 6 + Math.ceil(entry.label.length * charW) + gapX;
    if (x + w > width - 8 && x > startX) {
      row += 1;
      x = startX;
    }
    const pos = { entry, x, row };
    x += w;
    return pos;
  });
  const legendH = (row + 1) * rowH + gapY;

  // Shift the existing chart down to make room.
  const chart = doc.createElementNS(SVG_NS, 'g');
  while (svg.firstChild) chart.appendChild(svg.firstChild);
  chart.setAttribute('transform', `translate(0, ${legendH})`);
  svg.appendChild(chart);

  const legend = doc.createElementNS(SVG_NS, 'g');
  legend.setAttribute('aria-label', 'legend');
  for (const { entry, x: ex, row: er } of placed) {
    const y = gapY + er * rowH;
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(ex));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(swatch));
    rect.setAttribute('height', String(swatch));
    rect.setAttribute('fill', entry.color);
    legend.appendChild(rect);
    const text = doc.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(ex + swatch + 6));
    text.setAttribute('y', String(y + swatch * 0.82));
    text.setAttribute('font-size', String(Math.round(tickPx)));
    text.setAttribute('font-family', theme.fontFamily);
    text.setAttribute('fill', '#1c1b1a');
    text.textContent = entry.label;
    legend.appendChild(text);
  }
  svg.appendChild(legend);

  svg.setAttribute('height', String(height + legendH));
}

/**
 * Render a spec to a standalone SVG element. Throws when the spec
 * cannot be rendered — callers show the generic failure state.
 */
export async function renderChart(spec: ChartSpec, theme: ChartTheme): Promise<SVGSVGElement> {
  if (spec.data.rows.length === 0) throw new Error('chart spec has no rows');
  const plot = await loadPlot();
  const build = buildPlotOptions(spec, theme, plot);

  const element = plot.plot(build.options);
  const svg =
    element instanceof SVGSVGElement
      ? element
      : (element.querySelector('svg') as SVGSVGElement | null);
  if (!svg) throw new Error('chart render produced no svg');

  emphasizeAxisLabels(svg, build.labelPx);
  paintLegend(svg, build.legendEntries, theme, build.tickPx);

  const [w, h] = readSize(svg, theme.widthPx, theme.heightPx);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return svg;
}
