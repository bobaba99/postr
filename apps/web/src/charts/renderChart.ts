/**
 * renderChart — (ChartSpec, ChartTheme) → SVGSVGElement.
 *
 * The only place Observable Plot is touched. The module is
 * lazy-loaded so posters without charts never pay for it, and the
 * result is post-processed into a single self-contained <svg>:
 *
 * - Text is measured in the chart's own font (textMeasure.ts, after the
 *   font has loaded), and the tick labels Plot drew on a continuous axis
 *   are read back: when they need wider margins or ticks farther apart
 *   (tickFit.ts), the chart is laid out and drawn again with them, at most
 *   three times.
 * - Axis titles are set to their print size (24 pt; ticks render at
 *   18 pt via the base font size; chartLayout.ts) and placed so their
 *   capitals and descenders stay inside the svg, on the lines the
 *   margins were sized for.
 * - Legends are painted as SVG marks INSIDE the svg rather than
 *   using Plot's HTML legend — one element serializes losslessly
 *   through every export path (print window, html-to-image
 *   thumbnails, SVG/PNG downloads). The legend's rows come out of the
 *   box's height (plotOptions laid them out before Plot drew), so the
 *   svg is as tall as the box and its text prints at its size.
 * - A viewBox is added so the svg scales with its block.
 */
import type { ChartSpec } from '@postr/shared';
import {
  buildPlotOptions,
  type ChartTheme,
  type LayoutOverrides,
  type LegendLayout,
  type PlotBuild,
  type PlotLike,
} from './plotOptions';
import { TEXT_ASCENT, TEXT_DESCENT, wrapText } from './chartLayout';
import { fitTicks } from './tickFit';
import { loadChartFont, textMeasurer, type MeasureText } from './textMeasure';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Draws after the first that the tick labels may ask for. */
const TICK_FIT_PASSES = 3;

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

/**
 * Set axis titles to their print size, and place their lines inside the
 * svg. Plot drew them for its base font: a y title's first baseline at
 * 0.71 em below its top line, an x title's baseline on the bottom line
 * (Plot 0.6.17 marks/text.js). At title size that puts capitals above the
 * top edge and descenders below the bottom one, so the lines go where the
 * margins were sized for: the top's first baseline TEXT_ASCENT em down, the
 * bottom's last baseline TEXT_DESCENT em up, TEXT_ASCENT + TEXT_DESCENT em
 * apart. A title too long for its room wraps the way the margins counted.
 */
function emphasizeAxisLabels(svg: SVGSVGElement, build: PlotBuild, measure: MeasureText): void {
  const step = TEXT_ASCENT + TEXT_DESCENT;
  svg.querySelectorAll('[aria-label$="-axis label"]').forEach((g) => {
    g.setAttribute('font-size', String(build.labelPx));
    const top = g.getAttribute('aria-label') === 'y-axis label';
    // Only the titles the margins counted wrap: the x title and a y title
    // above the plot. A band y axis's title runs along the axis, one line.
    const wraps = (top ? build.titleLines.y : build.titleLines.x).length > 0;
    const room = top ? build.titleRoom.y : build.titleRoom.x;
    g.querySelectorAll('text').forEach((text) => {
      const own = text.textContent ?? '';
      const lines = wraps ? wrapText(own, room, build.labelPx, measure) : [own];
      const first = top ? TEXT_ASCENT : -(TEXT_DESCENT + (lines.length - 1) * step);
      text.setAttribute('y', `${first}em`);
      if (lines.length < 2) return;
      const doc = text.ownerDocument;
      text.replaceChildren(
        ...lines.map((line, i) => {
          const tspan = doc.createElementNS(SVG_NS, 'tspan');
          tspan.setAttribute('x', '0');
          if (i > 0) tspan.setAttribute('dy', `${step}em`);
          tspan.textContent = line;
          return tspan;
        }),
      );
    });
  });
}

/**
 * Paint a swatch legend above the plot, from the rows plotOptions laid
 * out (a label too long for its row on lines of its own). Plot drew the
 * plot that much shorter than the box, so with the legend the svg is the
 * box's height.
 */
function paintLegend(svg: SVGSVGElement, layout: LegendLayout, theme: ChartTheme): void {
  if (layout.rows.length < 2) return;
  const doc = svg.ownerDocument;
  const [, height] = readSize(svg, theme.widthPx, theme.heightPx);
  const { swatch, lineStep, fontPx, height: legendH } = layout;

  // Shift the existing chart down to make room.
  const chart = doc.createElementNS(SVG_NS, 'g');
  while (svg.firstChild) chart.appendChild(svg.firstChild);
  chart.setAttribute('transform', `translate(0, ${legendH})`);
  svg.appendChild(chart);

  const legend = doc.createElementNS(SVG_NS, 'g');
  legend.setAttribute('aria-label', 'legend');
  // Plot's root svg sets text-anchor="middle"; a label inheriting it was
  // centred on its start, over its own swatch and past the left edge.
  legend.setAttribute('text-anchor', 'start');
  for (const { entry, x, y, lines } of layout.rows) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(swatch));
    rect.setAttribute('height', String(swatch));
    rect.setAttribute('fill', entry.color);
    legend.appendChild(rect);
    const text = doc.createElementNS(SVG_NS, 'text');
    const textX = String(x + swatch + 6);
    text.setAttribute('x', textX);
    text.setAttribute('y', String(y + swatch * 0.82));
    text.setAttribute('font-size', String(fontPx));
    text.setAttribute('font-family', theme.fontFamily);
    text.setAttribute('fill', '#1c1b1a');
    if (lines.length < 2) {
      text.textContent = entry.label;
    } else {
      text.replaceChildren(
        ...lines.map((line, i) => {
          const tspan = doc.createElementNS(SVG_NS, 'tspan');
          tspan.setAttribute('x', textX);
          if (i > 0) tspan.setAttribute('dy', String(lineStep));
          tspan.textContent = line;
          return tspan;
        }),
      );
    }
    legend.appendChild(text);
  }
  svg.appendChild(legend);

  svg.setAttribute('height', String(height + legendH));
}

function draw(plot: PlotLike, build: PlotBuild): SVGSVGElement {
  const element = plot.plot(build.options);
  const svg =
    element instanceof SVGSVGElement
      ? element
      : (element.querySelector('svg') as SVGSVGElement | null);
  if (!svg) throw new Error('chart render produced no svg');
  return svg;
}

/** A drawn chart, and the least height it takes at the minimum text sizes (render px). */
export interface LaidOutChart {
  svg: SVGSVGElement;
  minHeightPx: number;
}

/**
 * Render a spec to a standalone SVG element, with the least height the
 * chart can take at the minimum text sizes (ChartBlock grows a block too
 * short for it). Throws when the spec cannot be rendered — callers show
 * the generic failure state.
 */
export async function renderChartLaidOut(spec: ChartSpec, theme: ChartTheme): Promise<LaidOutChart> {
  if (spec.data.rows.length === 0) throw new Error('chart spec has no rows');
  const plot = await loadPlot();
  await loadChartFont(theme.fontFamily);
  const measure = theme.measure ?? textMeasurer(theme.fontFamily);
  const measured: ChartTheme = { ...theme, measure };

  let overrides: LayoutOverrides = {};
  let build = buildPlotOptions(spec, measured, plot, overrides);
  let svg = draw(plot, build);
  for (let pass = 0; pass < TICK_FIT_PASSES; pass += 1) {
    const next = fitTicks(svg, build, theme.widthPx, measure, overrides);
    if (!next) break;
    overrides = next;
    build = buildPlotOptions(spec, measured, plot, overrides);
    svg = draw(plot, build);
  }

  emphasizeAxisLabels(svg, build, measure);
  paintLegend(svg, build.legend, theme);

  const [w, h] = readSize(svg, theme.widthPx, theme.heightPx);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return { svg, minHeightPx: build.minHeightPx };
}

/**
 * Render a spec to a standalone SVG element. Throws when the spec
 * cannot be rendered — callers show the generic failure state.
 */
export async function renderChart(spec: ChartSpec, theme: ChartTheme): Promise<SVGSVGElement> {
  return (await renderChartLaidOut(spec, theme)).svg;
}
