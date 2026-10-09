/**
 * ChartSpec → Observable Plot options.
 *
 * The Plot module is injected (`PlotLike`) so this stays a pure,
 * synchronously testable mapping while the real module remains
 * lazy-loaded in renderChart.ts. No Plot API leaks outside
 * `apps/web/src/charts/` (v1 plan, decided default #5).
 *
 * Print legibility is enforced here, not checked after the fact
 * (chartLayout.ts): tick, legend and line-end text is drawn at 18 pt and
 * axis titles at 24 pt of printed size, above the canonical minimums for
 * figure text the readability checker measures against (14 and 18 pt,
 * poster/figureTextMinimums.ts). The legend, the tick labels and the axis
 * titles are laid out inside the box the chart is drawn in and the plot
 * area takes what is left, so the text prints at those sizes; only in a
 * box too small for the legend at full size does the text scale down, and
 * never below the minimums.
 *
 * Styling rules (dataviz method): hairline gridlines, thin marks,
 * direct labels over legends for lines, no number-on-every-point,
 * sequential ramps by default, categorical hues only when series
 * identity is the subject.
 */
import type { ChartSpec, Palette } from '@postr/shared';
import {
  divergingRamp,
  mixHex,
  resolveSeriesColors,
  resolveSlot,
  sequentialRamp,
} from './chartColors';
import {
  bandAxisRange,
  bandBelowLabels,
  bandLabelRoom,
  bandLeftMargin,
  chartHeightAt,
  chartText,
  directLabelRoom,
  directRightMargin,
  EDGE,
  fitTextScale,
  layoutLegend,
  minTextScale,
  plotHeight,
  verticalMargins,
  widestUnbreakable,
  wrapLabels,
  wrapText,
  type ChartNeeds,
  type ChartText,
  type LegendEntry,
  type LegendLayout,
} from './chartLayout';
import { estimateTextWidth, type MeasureText } from './textMeasure';

export type { LegendEntry, LegendLayout } from './chartLayout';

/**
 * What a drawn chart's own tick labels asked for (tickFit.ts reads them
 * after Plot draws): margins wide enough for the widest y tick label and
 * the x tick labels at the plot's ends, and ticks far enough apart that
 * the x labels do not meet. Each only ever widens what the layout gave.
 */
export interface LayoutOverrides {
  marginLeft?: number;
  marginRight?: number;
  /** Plot's x `tickSpacing`, px (Plot's default is 80). */
  xTickSpacing?: number;
}

/** Loose view of the Plot module — only what we call. */
export type PlotLike = Record<string, (...args: never[]) => unknown> & {
  plot: (options: Record<string, unknown>) => SVGSVGElement | HTMLElement;
};

export interface ChartTheme {
  palette: Palette;
  /** CSS font-family for every piece of chart text. */
  fontFamily: string;
  /**
   * Render size in px: the box the chart is drawn in (ChartBlock: the box
   * its host is laid out in, at 10 px per poster unit). The svg comes out
   * this size, legend included.
   */
  widthPx: number;
  heightPx: number;
  /** Pixels per printed point at this render size. */
  pxPerPt: number;
  /** How wide a text is drawn (textMeasure.ts); the estimate when absent. */
  measure?: MeasureText;
}

export interface PlotBuild {
  options: Record<string, unknown>;
  /** Entries for the custom SVG legend (empty = no legend). */
  legendEntries: LegendEntry[];
  /** Where the legend's entries go, and its height (0 = no legend). */
  legend: LegendLayout;
  /** Font sizes in px, for the legend painter and the axis titles. */
  tickPx: number;
  labelPx: number;
  /** The share of the design sizes the text is drawn at (1 unless the box is too small). */
  textScale: number;
  /** The axis titles' lines, as the margins hold them. */
  titleLines: { x: string[]; y: string[] };
  /** The width each axis title may take before it wraps, px. */
  titleRoom: { x: number; y: number };
  /**
   * The least height the chart takes at the minimum text sizes, px: the
   * legend, the margins and the plot's floor. A box shorter than this
   * cannot hold the chart without printing text below the minimums; the
   * svg then comes out this tall and ChartBlock grows the block to it.
   */
  minHeightPx: number;
  /** Which axes Plot ticks itself (numbers, dates), so their labels are read after it draws. */
  continuous: { x: boolean; y: boolean };
}

type DataRow = Record<string, string | number | Date | null>;

function toObjects(spec: ChartSpec): DataRow[] {
  const dateCols = new Set(
    spec.data.columns.filter((c) => c.kind === 'date').map((c) => c.name),
  );
  // Dates become Date objects only for continuous axes (line/area/
  // scatter); band-scale forms keep the original strings as labels.
  const continuous = spec.form === 'line' || spec.form === 'area' || spec.form === 'scatter';
  return spec.data.rows.map((row) => {
    const obj: DataRow = {};
    spec.data.columns.forEach((col, i) => {
      const value = row[i] ?? null;
      obj[col.name] =
        continuous && dateCols.has(col.name) && typeof value === 'string'
          ? new Date(value)
          : value;
    });
    return obj;
  });
}

function distinctStrings(data: DataRow[], field: string | undefined): string[] {
  if (!field) return [];
  const seen: string[] = [];
  for (const row of data) {
    const v = row[field];
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/**
 * Distinct values of a spec's `series` encoding, first-seen order.
 * Shared by the palette picker (swatch count) and buildPlotOptions so
 * the two never disagree on how many series a chart has.
 */
export function distinctSeries(spec: ChartSpec): string[] {
  return distinctStrings(toObjects(spec), spec.encoding.series);
}

const LIKERT_NEGATIVE = /disagree/i;
const LIKERT_NEUTRAL = /^(neutral|neither)/i;

/**
 * Build the Plot options for a spec. `plot` is the (lazily imported)
 * Plot module. Laid out at full text size first; when the box cannot hold
 * the legend, the margins and the plot's floor at that size, again at the
 * text scale chartLayout's fit finds. `overrides` are what a first draw's
 * tick labels asked for (tickFit.ts).
 */
export function buildPlotOptions(spec: ChartSpec, theme: ChartTheme, plot: PlotLike, overrides: LayoutOverrides = {}): PlotBuild {
  const measure = theme.measure ?? estimateTextWidth;
  const full = buildAt(spec, theme, plot, chartText(theme.pxPerPt, 1, measure), overrides);
  // The x tick labels' lines and the titles' room as at full size: smaller
  // text wraps onto no more lines, so the fit errs toward room.
  const needsAt = (t: ChartText): ChartNeeds => ({
    titles: { ...titlesOf(full.titleText, full.titleRoom, t), xTickLines: full.xTickLines },
    rangeFloor: full.yBand ? bandAxisRange(full.yBand.labels.length, yBandWrap(full.yBand, theme.widthPx, t).maxLines, t) : 0,
  });
  const scale = fitTextScale(theme, theme.pxPerPt, full.legendEntries, needsAt, measure);
  const built = scale === 1 ? full : buildAt(spec, theme, plot, chartText(theme.pxPerPt, scale, measure), overrides, full.xEvery);
  const tMin = chartText(theme.pxPerPt, minTextScale(), measure);
  return { ...built, minHeightPx: chartHeightAt(theme.widthPx, tMin, full.legendEntries, needsAt(tMin)) };
}

/** The axis titles' text, before wrapping. */
interface TitleText {
  /** Drawn under the x tick labels. */
  x: string | null;
  /** Drawn above the plot (a continuous y axis); a band y axis's title runs along it. */
  yTop: string | null;
}

/** The width each axis title may take before it wraps, px. */
interface TitleRoom {
  x: number;
  y: number;
}

function titleLines(text: TitleText, room: TitleRoom, t: ChartText): { x: string[]; y: string[] } {
  return {
    x: text.x ? wrapText(text.x, room.x, t.labelPx, t.measure) : [],
    y: text.yTop ? wrapText(text.yTop, room.y, t.labelPx, t.measure) : [],
  };
}

function titlesOf(text: TitleText, room: TitleRoom, t: ChartText): { xLines: number; yTopLines: number } {
  const lines = titleLines(text, room, t);
  return { xLines: lines.x.length, yTopLines: lines.y.length };
}

/**
 * Where the titles may run (Plot places them, axis.js): a continuous x
 * axis's title ends at the right edge and a band axis's is centred under
 * the plot; the y title above the plot starts at the left edge and stops
 * short of the line-end labels' margin, where the top line's label sits
 * (review Q-R4: it ran into it).
 */
function titleRoom(widthPx: number, marginLeft: number, marginRight: number, xBand: boolean, directLabels: boolean): TitleRoom {
  const centre = (marginLeft + widthPx - marginRight) / 2;
  return {
    x: xBand ? 2 * Math.min(centre - EDGE, widthPx - EDGE - centre) : widthPx - 2 * EDGE,
    y: (directLabels ? widthPx - marginRight : widthPx - EDGE) - EDGE,
  };
}

/** A category axis left of the plot: its labels, and whether its title runs along it. */
interface YBand {
  labels: string[];
  along: boolean;
}

function yBandWrap(band: YBand, widthPx: number, t: ChartText) {
  const room = bandLabelRoom(t, widthPx, band.along, widestUnbreakable(band.labels, t.tickPx, t.measure));
  return wrapLabels(band.labels, room, t.tickPx, t.measure);
}

/** A scale's axis title as Plot draws it: its own label, or the default (the field name). */
function labelOf(scale: unknown): string | null {
  if (!scale || typeof scale !== 'object') return null;
  const s = scale as { label?: unknown; axis?: unknown };
  if (s.axis === null || typeof s.label !== 'string' || !s.label) return null;
  return s.label;
}

/**
 * The category axes whose labels wrap: the one under the plot (`x`, or
 * `fx` for grouped bars' groups) and the one left of it (`y`), with their
 * labels. Continuous axes (numbers, dates) and the binned heatmap have none.
 */
function categoryAxes(spec: ChartSpec, data: DataRow[]): { x: { scale: 'x' | 'fx'; values: string[] } | null; y: string[] | null } {
  const e = spec.encoding;
  const isCategory = (field: string | undefined) =>
    !!field && spec.data.columns.some((c) => c.name === field && c.kind === 'category');
  const below = (scale: 'x' | 'fx', field: string | undefined) => (field ? { scale, values: distinctStrings(data, field) } : null);
  switch (spec.form) {
    case 'bar':
      return spec.options.horizontal ? { x: null, y: distinctStrings(data, e.x) } : { x: below('x', e.x), y: null };
    case 'line':
    case 'area':
      return { x: isCategory(e.x) ? below('x', e.x) : null, y: null };
    case 'box':
    case 'bar-stacked':
      return { x: below('x', e.x), y: null };
    case 'bar-grouped':
      return { x: below('fx', e.x), y: null };
    case 'bar-diverging':
      return { x: null, y: distinctStrings(data.map((row) => ({ y: (e.y ? row[e.y] : null) ?? 'All responses' })), 'y') };
    case 'heatmap':
      // A cell map's axes are bands whatever the field holds; the binned map's are continuous.
      return e.value ? { x: below('x', e.x), y: distinctStrings(data, e.y) } : { x: null, y: null };
    case 'dumbbell':
      return { x: null, y: distinctStrings(data, e.y) };
    default:
      return { x: null, y: null };
  }
}

type Built = Omit<PlotBuild, 'minHeightPx'> & { titleText: TitleText; xTickLines: number; xEvery: number; yBand: YBand | null };

function buildAt(spec: ChartSpec, theme: ChartTheme, plot: PlotLike, text: ChartText, overrides: LayoutOverrides, xEveryFrom = 1): Built {
  const P = plot as unknown as Record<string, (...args: unknown[]) => unknown>;
  const { palette } = theme;
  const e = spec.encoding;
  const data = toObjects(spec);
  const { tickPx, labelPx, measure } = text;
  const color0 = resolveSlot(spec.paletteSlots[0] ?? 'accent', palette);
  const textColor = '#1c1b1a';
  const strokeW = Math.max(2, tickPx * 0.14);

  const marks: unknown[] = [];
  let legendEntries: LegendEntry[] = [];
  // A height Plot must not exceed for this form (the single stacked bar).
  let heightCap: number | null = null;
  const options: Record<string, unknown> = {
    width: theme.widthPx,
    marginRight: Math.round(tickPx * 1.5),
    marginLeft: Math.round(labelPx * 2.6),
    style: {
      background: 'transparent',
      color: textColor,
      fontFamily: theme.fontFamily,
      fontSize: `${tickPx}px`,
    },
    x: { label: spec.xLabel ?? e.x ?? null },
    y: { label: spec.yLabel ?? e.y ?? null, grid: true },
  };

  const seriesValues = distinctStrings(data, e.series);
  const colors = resolveSeriesColors(
    spec.seriesPaletteId,
    Math.max(1, seriesValues.length),
    spec.paletteSlots,
    palette,
  );
  const colorScale = { domain: seriesValues, range: colors };

  const sortByValue = spec.options.sort === 'value';
  const horizontal = spec.options.horizontal;

  switch (spec.form) {
    case 'bar': {
      if (horizontal) {
        marks.push(
          P['barX']?.(data, {
            y: e.x,
            x: e.y,
            fill: color0,
            ...(sortByValue ? { sort: { y: '-x' } } : {}),
          }),
          P['ruleX']?.([0]),
        );
        options['x'] = { label: spec.yLabel ?? e.y ?? null, grid: true };
        options['y'] = { label: null };
      } else {
        marks.push(
          P['barY']?.(data, {
            x: e.x,
            y: e.y,
            fill: color0,
            ...(sortByValue ? { sort: { x: '-y' } } : {}),
          }),
          P['ruleY']?.([0]),
        );
      }
      break;
    }
    case 'line':
    case 'area': {
      if (spec.form === 'area') {
        marks.push(P['areaY']?.(data, { x: e.x, y: e.y, fill: color0, fillOpacity: 0.25 }));
      }
      if (e.series) {
        marks.push(
          P['lineY']?.(data, { x: e.x, y: e.y, stroke: e.series, strokeWidth: strokeW }),
        );
        // Direct labels at line ends beat a legend (dataviz method).
        if (spec.options.directLabel !== 'none') {
          const lastPerSeries = seriesValues
            .map((s) => data.filter((row) => String(row[e.series ?? '']) === s).at(-1))
            .filter((row): row is DataRow => row !== undefined);
          // A long series name wraps (Plot draws "\n" as a line break) and
          // the right margin holds its widest line, so it stays in the svg.
          const dx = Math.round(tickPx * 0.4);
          const names = wrapLabels(seriesValues, directLabelRoom(theme.widthPx, dx), tickPx, measure);
          const seriesField = e.series;
          marks.push(
            P['text']?.(lastPerSeries, {
              x: e.x,
              y: e.y,
              text: (row: DataRow) => names.format(row[seriesField]),
              fill: e.series,
              dx,
              textAnchor: 'start',
              fontSize: tickPx,
            }),
          );
          options['marginRight'] = directRightMargin(text, dx, names.widestPx);
        } else {
          legendEntries = seriesValues.map((label, i) => ({
            label,
            color: colors[i] ?? color0,
          }));
        }
        options['color'] = colorScale;
      } else {
        marks.push(P['lineY']?.(data, { x: e.x, y: e.y, stroke: color0, strokeWidth: strokeW }));
        if (data.length <= 15) {
          marks.push(P['dot']?.(data, { x: e.x, y: e.y, fill: color0, r: strokeW * 1.4 }));
        }
      }
      break;
    }
    case 'scatter': {
      marks.push(
        P['dot']?.(data, {
          x: e.x,
          y: e.y,
          fill: color0,
          fillOpacity: 0.75,
          r: Math.max(3, tickPx * 0.18),
        }),
      );
      break;
    }
    case 'histogram': {
      marks.push(
        P['rectY']?.(data, P['binX']?.({ y: 'count' }, { x: e.x, fill: color0 })),
        P['ruleY']?.([0]),
      );
      options['y'] = { label: 'Count', grid: true };
      break;
    }
    case 'box': {
      marks.push(
        P['boxY']?.(data, {
          x: e.x,
          y: e.y,
          fill: mixHex(color0, '#ffffff', 0.6),
          stroke: color0,
        }),
      );
      break;
    }
    case 'bar-grouped': {
      marks.push(
        P['barY']?.(data, { fx: e.x, x: e.series, y: e.y, fill: e.series }),
        P['ruleY']?.([0]),
      );
      options['x'] = { axis: null };
      options['fx'] = { label: spec.xLabel ?? e.x ?? null };
      options['color'] = colorScale;
      legendEntries = seriesValues.map((label, i) => ({ label, color: colors[i] ?? color0 }));
      break;
    }
    case 'bar-stacked': {
      if (e.x) {
        marks.push(
          P['barY']?.(data, { x: e.x, y: e.y, fill: e.series }),
          P['ruleY']?.([0]),
        );
      } else {
        // Shares of a single whole: one horizontal stacked bar.
        marks.push(P['barX']?.(data, { x: e.y, fill: e.series }));
        options['y'] = { axis: null };
        options['x'] = { label: spec.yLabel ?? e.y ?? null };
        heightCap = Math.round(labelPx * 6);
      }
      options['color'] = colorScale;
      legendEntries = seriesValues.map((label, i) => ({ label, color: colors[i] ?? color0 }));
      break;
    }
    case 'bar-diverging': {
      // Likert: signed values — disagreement negative, neutral split
      // half-and-half across the zero line.
      const signed: DataRow[] = [];
      for (const row of data) {
        const level = String(row[e.series ?? ''] ?? '');
        const value = row[e.value ?? ''];
        if (typeof value !== 'number') continue;
        const y = (e.y ? row[e.y] : null) ?? 'All responses';
        if (LIKERT_NEUTRAL.test(level)) {
          signed.push({ __y: y, __level: level, __value: -value / 2 });
          signed.push({ __y: y, __level: level, __value: value / 2 });
        } else {
          signed.push({
            __y: y,
            __level: level,
            __value: LIKERT_NEGATIVE.test(level) ? -value : value,
          });
        }
      }
      const levels = distinctStrings(data, e.series);
      const negatives = levels.filter((l) => LIKERT_NEGATIVE.test(l)).length;
      const positives = levels.filter(
        (l) => !LIKERT_NEGATIVE.test(l) && !LIKERT_NEUTRAL.test(l),
      ).length;
      const ramp = divergingRamp(negatives, levels.length > negatives + positives, positives, palette);
      marks.push(
        P['barX']?.(signed, { y: '__y', x: '__value', fill: '__level' }),
        P['ruleX']?.([0]),
      );
      options['color'] = { domain: levels, range: ramp };
      options['x'] = { label: spec.yLabel ?? e.value ?? null };
      options['y'] = { label: null };
      legendEntries = levels.map((label, i) => ({ label, color: ramp[i] ?? color0 }));
      break;
    }
    case 'heatmap': {
      if (e.value) {
        const ramp = sequentialRamp(spec.paletteSlots, palette);
        marks.push(P['cell']?.(data, { x: e.x, y: e.y, fill: e.value, inset: 1 }));
        options['color'] = { type: 'linear', range: ramp };
      } else {
        // Binned density for dense two-numeric data.
        const ramp = sequentialRamp(spec.paletteSlots, palette);
        marks.push(P['rect']?.(data, P['bin']?.({ fill: 'count' }, { x: e.x, y: e.y, inset: 0 })));
        options['color'] = { type: 'linear', range: ramp };
      }
      options['y'] = { label: spec.yLabel ?? e.y ?? null };
      break;
    }
    case 'dumbbell': {
      const sorted = data
        .slice()
        .sort((a, b) => Number(b[e.value ?? '']) - Number(a[e.value ?? '']));
      const gray = mixHex(color0, '#ffffff', 0.55);
      marks.push(
        P['link']?.(sorted, {
          x1: e.x,
          x2: e.value,
          y1: e.y,
          y2: e.y,
          stroke: '#b9b6b0',
          strokeWidth: strokeW,
        }),
        P['dot']?.(sorted, { x: e.x, y: e.y, fill: gray, r: Math.max(4, tickPx * 0.22) }),
        P['dot']?.(sorted, { x: e.value, y: e.y, fill: color0, r: Math.max(4, tickPx * 0.22) }),
      );
      options['x'] = { label: spec.xLabel ?? e.x ?? null, grid: true };
      options['y'] = { label: null, domain: sorted.map((row) => String(row[e.y ?? ''] ?? '')) };
      legendEntries = [
        { label: e.x ?? 'Before', color: gray },
        { label: e.value ?? 'After', color: color0 },
      ];
      break;
    }
  }

  options['marks'] = marks.filter((m) => m !== undefined);

  if (!spec.options.legend) legendEntries = [];

  // Category labels wrap to fit and the margins hold the wrapped labels, so
  // none runs past the svg's edges (plan item 13 part 2): left of the plot
  // up to MAX_BAND_LABEL_SHARE of the width; under it, within its band.
  // The cell heatmap's y axis is a band whose title runs along it; the
  // binned heatmap's is continuous, its title above the plot.
  const yAlongAxis = spec.form === 'heatmap' && !!e.value;
  const cats = categoryAxes(spec, data);
  const yBand: YBand | null = cats.y ? { labels: cats.y, along: yAlongAxis && labelOf(options['y']) !== null } : null;
  let yLines = 1;
  if (yBand) {
    const wrapped = yBandWrap(yBand, theme.widthPx, text);
    options['marginLeft'] = bandLeftMargin(text, wrapped.widestPx, yBand.along);
    options['y'] = { ...(options['y'] as object), tickFormat: wrapped.format };
    yLines = wrapped.maxLines;
  }
  // What a first draw's tick labels asked for (tickFit.ts): only ever wider.
  if (overrides.marginLeft !== undefined) options['marginLeft'] = Math.max(Number(options['marginLeft']), overrides.marginLeft);
  if (overrides.marginRight !== undefined) options['marginRight'] = Math.max(Number(options['marginRight']), overrides.marginRight);
  if (overrides.xTickSpacing !== undefined && !cats.x) options['x'] = { ...(options['x'] as object), tickSpacing: overrides.xTickSpacing };
  let xTickLines = 1;
  let xEvery = 1;
  if (cats.x) {
    const plotWidth = theme.widthPx - Number(options['marginLeft']) - Number(options['marginRight']);
    const { every, wrapped } = bandBelowLabels(cats.x.values, plotWidth, tickPx, measure, xEveryFrom);
    xEvery = every;
    const ticks = every > 1 ? { ticks: cats.x.values.filter((_, i) => i % every === 0) } : {};
    options[cats.x.scale] = { ...(options[cats.x.scale] as object), tickFormat: wrapped.format, ...ticks };
    xTickLines = wrapped.maxLines;
  }

  // The titles Plot will draw, and where: the x (or facet) title under the
  // x tick labels; a continuous y axis's title above the plot (a band y
  // axis's runs along it, in marginLeft).
  // Counted with the arrow Plot adds on a continuous axis ("↑ Score",
  // "Month →"); a band axis draws none, so its title takes no more lines.
  const xTitle = labelOf(options['fx']) ?? labelOf(options['x']);
  const yTitle = yAlongAxis ? null : labelOf(options['y']);
  const titleText: TitleText = {
    x: xTitle === null ? null : `${xTitle} →`,
    yTop: yTitle === null ? null : `↑ ${yTitle}`,
  };
  const room = titleRoom(theme.widthPx, Number(options['marginLeft']), Number(options['marginRight']), !!cats.x, hasDirectLabels(spec));
  const lines = titleLines(titleText, room, text);
  const legend = layoutLegend(legendEntries, theme.widthPx, tickPx, measure);
  const margins = verticalMargins(text, { xLines: lines.x.length, yTopLines: lines.y.length, xTickLines });
  const rangeFloor = yBand ? bandAxisRange(yBand.labels.length, yLines, text) : 0;
  const height = plotHeight(theme.heightPx, legend.height, text, margins, rangeFloor);
  options['marginTop'] = margins.top;
  options['marginBottom'] = margins.bottom;
  options['height'] = heightCap === null ? height : Math.min(height, heightCap);

  return {
    options, legendEntries, legend, tickPx, labelPx, textScale: text.scale, titleLines: lines, titleText, titleRoom: room, xTickLines, xEvery, yBand,
    continuous: { x: !cats.x, y: !cats.y },
  };
}

/** Whether the lines end in labels (a series line chart whose direct labels are on). */
function hasDirectLabels(spec: ChartSpec): boolean {
  return (spec.form === 'line' || spec.form === 'area') && !!spec.encoding.series && spec.options.directLabel !== 'none';
}
