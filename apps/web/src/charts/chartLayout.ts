/**
 * chartLayout — where an inserted chart's text goes inside the box it is
 * drawn in (plan item 13 part 2, record docs/fixes/13c-chart-text-minimums.md).
 *
 * The chart draws into exactly the box it is given and keeps its text at
 * the size it means to print: the legend's rows, the tick labels and the
 * axis titles are laid out inside the box, and the plot area takes what is
 * left. Before, renderChart grew the svg by the legend's height and let the
 * viewBox shrink every text to fit, and the axis titles were enlarged after
 * Plot had placed them for smaller text, so they ran past the svg's edges.
 *
 * Everything here is in render px (the svg's user units). ChartBlock renders
 * at 10 px per poster unit, so `pxPerPt` turns printed points into px.
 * Text widths come from a measurer (textMeasure.ts: the chart's own font on
 * a canvas in the browser, an estimate in tests), never from a character
 * count, so margins hold the labels as drawn (review round 1, Q-R2 to Q-R4).
 * Pure, so it is tested without a DOM or the Plot module.
 */
import { FIGURE_TEXT_MIN_PT } from '@/poster/figureTextMinimums';
import { estimateTextWidth, type MeasureText } from './textMeasure';

/** One legend swatch and its label. */
export interface LegendEntry {
  label: string;
  color: string;
}

/**
 * The chart's text, in printed pt, when nothing has to give: tick labels,
 * legend text and line-end labels 18, axis titles 24. Above the canonical
 * minimums for figure text (figureTextMinimums.ts: 14 and 18).
 */
export const CHART_TEXT_PT = { tick: 18, axisTitle: 24 } as const;

/**
 * The sizes the chart draws at when nothing has to give: CHART_TEXT_PT,
 * raised to the canonical minimums (and PRINT_HEADROOM above them) should
 * those ever be set higher. Read at each call, so the chart follows the
 * shared module.
 */
export function chartTextPt(): { tick: number; axisTitle: number } {
  return {
    tick: Math.max(CHART_TEXT_PT.tick, PRINT_HEADROOM * Math.max(FIGURE_TEXT_MIN_PT.axisText, FIGURE_TEXT_MIN_PT.legendText)),
    axisTitle: Math.max(CHART_TEXT_PT.axisTitle, PRINT_HEADROOM * FIGURE_TEXT_MIN_PT.axisTitle),
  };
}

/**
 * How far above the minimums the chart's own floor sits: 0.5 %. A chart at
 * its floor (a box that grew to the chart's least height) is drawn exactly
 * for its box, and the print's zoom lays a box of fractional height out a
 * hair smaller: in Firefox a 45.71-unit box printed 45.70, its 14 pt text
 * at 13.995 (harness run f3-firefox, review round 1's corrections). The
 * margin is twelve times that.
 */
export const PRINT_HEADROOM = 1.005;

/**
 * How far the fit may scale chart text down, when the box is too small to
 * hold the legend and a plot at full size: to the canonical minimums (tick
 * labels, legend text and line-end labels 14 pt; axis titles 18 pt) and
 * PRINT_HEADROOM above them, no further. With today's numbers 14/18 binds.
 */
export function minTextScale(): number {
  const pt = chartTextPt();
  return PRINT_HEADROOM * Math.max(
    FIGURE_TEXT_MIN_PT.axisText / pt.tick,
    FIGURE_TEXT_MIN_PT.legendText / pt.tick,
    FIGURE_TEXT_MIN_PT.axisTitle / pt.axisTitle,
  );
}

/** The fit tries text scales from 1 down to minTextScale() in steps of a quarter point of tick text. */
const FIT_STEP_PT = 0.25;

/**
 * The plot keeps at least this many tick-label heights of its own (room for
 * the y axis to label about three ticks); below that the fit scales the
 * text down rather than squeezing the plot further.
 */
const MIN_PLOT_TICK_HEIGHTS = 4;



/**
 * Room a line of text needs above and below its baseline, as shares of its
 * font size: enough for capitals, accents and descenders in the poster
 * fonts. Plot places a top-anchored line's baseline at 0.71 em and a
 * bottom-anchored one's at 0 (Plot 0.6.17 marks/text.js), which at axis
 * title size puts their tops and descenders past the svg's edges.
 */
export const TEXT_ASCENT = 0.95;
export const TEXT_DESCENT = 0.3;
const LINE = TEXT_ASCENT + TEXT_DESCENT;
/**
 * From one line of a wrapped tick label to the next, in its font size:
 * Plot's text lineHeight (1, marks/text.js). A stack of n lines takes
 * (n - 1) of these and one LINE.
 */
const TICK_LINE = 1;
const tickStack = (lines: number) => (lines - 1) * TICK_LINE + LINE;

/** Clear space kept at the svg's edges, px (Plot keeps 3). */
export const EDGE = 3;
/** Plot's tick mark (6) plus its padding to the label (3), px. */
export const TICK_MARK = 9;
/** Space between an axis title and the tick labels next to it, in tick-label sizes. */
const TITLE_GAP = 0.25;

export interface ChartText {
  /** The share of chartTextPt() the text is drawn at. */
  scale: number;
  /** Tick labels, legend text, line-end labels, px. */
  tickPx: number;
  /** Axis titles, px. */
  labelPx: number;
  /** How wide a text is drawn, px. */
  measure: MeasureText;
}

/** The text sizes at a scale. Not rounded: a rounded 33.33 px is 33 px, 23.76 pt. */
export function chartText(pxPerPt: number, scale = 1, measure: MeasureText = estimateTextWidth): ChartText {
  const pt = chartTextPt();
  return {
    scale,
    tickPx: pt.tick * scale * pxPerPt,
    labelPx: pt.axisTitle * scale * pxPerPt,
    measure,
  };
}

export interface LegendLayout {
  /** Each entry: where its swatch goes (x, the top of its row y) and its label's lines. */
  rows: Array<{ entry: LegendEntry; x: number; y: number; row: number; lines: string[] }>;
  /** Total height of the legend band, px (0 with no legend). */
  height: number;
  swatch: number;
  gapY: number;
  rowH: number;
  /** From one line of a wrapped label to the next, px. */
  lineStep: number;
  fontPx: number;
}

/** Left and right of the legend's rows, px. */
const LEGEND_INSET = 8;
/** From a swatch to its label, px. */
const SWATCH_GAP = 6;

/**
 * Swatch legend rows, left to right, wrapping at the chart's width. A label
 * longer than a row wraps onto lines of its own (review Q-R3: an entry was
 * placed at the row's start and ran past the right edge), and its row is
 * that much taller. Fewer than two entries draw no legend.
 */
export function layoutLegend(entries: LegendEntry[], widthPx: number, tickPx: number, measure: MeasureText = estimateTextWidth): LegendLayout {
  const swatch = Math.round(tickPx * 0.85);
  const gapX = Math.round(tickPx * 1.1);
  const gapY = Math.round(tickPx * 0.55);
  const rowH = swatch + gapY;
  const lineStep = LINE * tickPx;
  const empty = { rows: [], height: 0, swatch, gapY, rowH, lineStep, fontPx: tickPx };
  if (entries.length < 2) return empty;
  const room = Math.max(tickPx, widthPx - 2 * LEGEND_INSET - swatch - SWATCH_GAP);
  let x = LEGEND_INSET;
  let y = gapY;
  let row = 0;
  // Lines past the first of the row's tallest label.
  let extra = 0;
  const rows = entries.map((entry) => {
    const lines = wrapText(entry.label, room, tickPx, measure);
    const w = swatch + SWATCH_GAP + Math.max(...lines.map((l) => measure(l, tickPx)));
    if (x + w > widthPx - LEGEND_INSET && x > LEGEND_INSET) {
      y += rowH + extra;
      row += 1;
      x = LEGEND_INSET;
      extra = 0;
    }
    const pos = { entry, x, y, row, lines };
    extra = Math.max(extra, (lines.length - 1) * lineStep);
    x += w + gapX;
    return pos;
  });
  return { ...empty, rows, height: y + rowH + extra };
}

/**
 * Text split into lines that fit `widthPx` at `fontPx`: between words; a
 * word wider than the width after its hyphens or slashes, and a piece wider
 * still between its characters, so no line is ever wider than the width.
 */
export function wrapText(text: string, widthPx: number, fontPx: number, measure: MeasureText = estimateTextWidth): string[] {
  const fits = (s: string) => measure(s, fontPx) <= widthPx + 1e-6;
  const lines: string[] = [];
  let line = '';
  const place = (piece: string, sep: string) => {
    const joined = line ? `${line}${sep}${piece}` : piece;
    if (!fits(joined)) return false;
    line = joined;
    return true;
  };
  const breakLine = () => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (place(word, ' ')) continue;
    breakLine();
    if (place(word, '')) continue;
    for (const part of word.match(/[^-–/]+[-–/]*|[-–/]+/g) ?? [word]) {
      if (place(part, '')) continue;
      breakLine();
      if (place(part, '')) continue;
      for (const ch of part) {
        if (place(ch, '')) continue;
        breakLine();
        line = ch;
      }
    }
  }
  breakLine();
  return lines.length ? lines : [text];
}

/** The widest piece of `labels` no line break can split (a word, or its part after a hyphen), px. */
export function widestUnbreakable(labels: string[], fontPx: number, measure: MeasureText = estimateTextWidth): number {
  const pieces = labels.flatMap((l) => l.split(/\s+/).flatMap((w) => w.match(/[^-–/]+[-–/]*|[-–/]+/g) ?? [w]));
  return Math.max(0, ...pieces.map((p) => measure(p, fontPx)));
}

/**
 * At most this share of the chart's width goes to category labels left of
 * the plot, before they wrap; up to MAX_BAND_LABEL_SHARE_WORD when a single
 * word needs it (an upper-case "MINDFULNESS-BASED" in a chart beside a side
 * caption).
 */
const MAX_BAND_LABEL_SHARE = 0.42;
const MAX_BAND_LABEL_SHARE_WORD = 0.6;
/** A category label under the plot may take this share of its band, leaving a gap to the next. */
const BAND_LABEL_FILL = 0.9;
/** At most this share of the chart's width goes to the labels at the lines' ends. */
const MAX_DIRECT_LABEL_SHARE = 0.35;

/** Category labels wrapped to a width: each label's lines (Plot draws "\n" as a line break). */
export interface WrappedLabels {
  /** A tick format or text accessor: the label with its line breaks. */
  format: (value: unknown) => string;
  /** The widest line, px, as measured. */
  widestPx: number;
  /** The most lines any label takes. */
  maxLines: number;
}

export function wrapLabels(labels: string[], maxPx: number, fontPx: number, measure: MeasureText = estimateTextWidth): WrappedLabels {
  const lines = new Map(labels.map((l) => [l, wrapText(l, maxPx, fontPx, measure)]));
  const all = [...lines.values()];
  return {
    format: (value) => (lines.get(String(value)) ?? [String(value)]).join('\n'),
    widestPx: Math.max(0, ...all.flat().map((line) => measure(line, fontPx))),
    maxLines: Math.max(1, ...all.map((l) => l.length)),
  };
}

/**
 * Plot's left margin when the y axis is a category axis: the edge, the
 * axis title running along it (the heatmap's rows), the widest wrapped
 * label and the tick mark.
 */
export function bandLeftMargin(t: ChartText, widestPx: number, titleAlongAxis: boolean): number {
  const title = titleAlongAxis ? LINE * t.labelPx + TITLE_GAP * t.tickPx : 0;
  return Math.ceil(EDGE + title + widestPx + TICK_MARK);
}

/**
 * The width a category label on the y axis may take, before it wraps: its
 * share of the chart's width, widened (up to a larger share) to hold the
 * widest word whole. A word wider still breaks (wrapText), so no label
 * runs past the chart's left edge.
 */
export function bandLabelRoom(t: ChartText, widthPx: number, titleAlongAxis: boolean, widestWordPx = 0): number {
  const title = titleAlongAxis ? LINE * t.labelPx + TITLE_GAP * t.tickPx : 0;
  const room = (share: number) => widthPx * share - title - TICK_MARK - EDGE;
  return Math.max(room(MAX_BAND_LABEL_SHARE), Math.min(widestWordPx, room(MAX_BAND_LABEL_SHARE_WORD)));
}

/**
 * The plot's own height (its range, between the margins) a category axis
 * left of it needs so that each band holds its label's lines, font box to
 * font box, and no label runs into the next (review Q-R4: wrapped labels
 * of up to four lines overlapped). Plot's band scales pad a tenth of a
 * step outside, a point scale half a step: (count + 0.2) steps cover both.
 */
export function bandAxisRange(count: number, lines: number, t: ChartText): number {
  return (count + 0.2) * tickStack(lines) * t.tickPx;
}


/** The width a category label under the plot may take: its share of the plot's width. */
export function bandBelowRoom(plotWidthPx: number, count: number): number {
  return (plotWidthPx / Math.max(1, count)) * BAND_LABEL_FILL;
}

/**
 * Category labels under the plot, wrapped to their band; where a band
 * cannot hold even one character of them (ten years under a plot 1.4 in
 * wide), every `every`-th band is labelled, each label with that many
 * bands of room, so no label is wider than its room and none meets the
 * next (review round 1: the years of a heatmap beside a side caption sat
 * 14 px apart, each 14 px wide). `fromEvery` starts the search there: the
 * fit keeps the full-size layout's choice at smaller text, where each
 * label then wraps onto no more lines than the fit counted.
 */
export function bandBelowLabels(values: string[], plotWidthPx: number, fontPx: number, measure: MeasureText = estimateTextWidth, fromEvery = 1): { every: number; wrapped: WrappedLabels } {
  const count = Math.max(1, values.length);
  for (let every = Math.max(1, fromEvery); ; every += 1) {
    const room = bandBelowRoom(plotWidthPx, count) * every;
    const wrapped = wrapLabels(values, room, fontPx, measure);
    if (wrapped.widestPx <= room + 1e-6 || every >= count) return { every, wrapped };
  }
}

/** The width a label at a line's end may take, after its offset from the end point. */
export function directLabelRoom(widthPx: number, dxPx: number): number {
  return widthPx * MAX_DIRECT_LABEL_SHARE - dxPx - EDGE;
}

/** Plot's right margin when lines end in labels: the offset, the widest line of label, the edge. */
export function directRightMargin(t: ChartText, dxPx: number, widestPx: number): number {
  return Math.ceil(Math.max(t.tickPx * 2, dxPx + widestPx + EDGE));
}

/** Which axis titles the chart draws, how many lines each takes, and how many the x tick labels take. */
export interface ChartTitles {
  /** Lines of the y title drawn above the plot (a continuous y axis); 0 for none. */
  yTopLines: number;
  /** Lines of the x title under the tick labels; 0 for none. */
  xLines: number;
  /** Lines of the longest wrapped x tick label (1 when they do not wrap). */
  xTickLines?: number;
}

export interface VerticalMargins {
  top: number;
  bottom: number;
}

/**
 * Plot's top and bottom margins. The top holds the y title's lines when it
 * sits above the plot, a gap, and the upper half of the top tick label;
 * the bottom holds the tick marks and labels, a gap and the x title's lines.
 */
export function verticalMargins(t: ChartText, titles: ChartTitles): VerticalMargins {
  const halfTick = (LINE * t.tickPx) / 2;
  const top = titles.yTopLines
    ? EDGE + titles.yTopLines * LINE * t.labelPx + TITLE_GAP * t.tickPx + halfTick
    : EDGE + halfTick;
  const tickBand = TICK_MARK + tickStack(titles.xTickLines ?? 1) * t.tickPx;
  const bottom = titles.xLines
    ? tickBand + TITLE_GAP * t.tickPx + titles.xLines * LINE * t.labelPx + EDGE
    : tickBand + EDGE;
  return { top: Math.ceil(top), bottom: Math.ceil(bottom) };
}

/** What the chart needs at a text size, besides its legend: its titles and the plot's own floor. */
export interface ChartNeeds {
  titles: ChartTitles;
  /** The plot's range a category axis needs (bandAxisRange), px; 0 for none. */
  rangeFloor: number;
}

/** The plot's floor: its margins and a range of MIN_PLOT_TICK_HEIGHTS tick labels or what a category axis needs. */
function plotFloor(t: ChartText, m: VerticalMargins, rangeFloor: number): number {
  return m.top + m.bottom + Math.max(MIN_PLOT_TICK_HEIGHTS * t.tickPx, rangeFloor);
}

/** The plot's own height (Plot's `height`, legend excluded): what the box leaves, never below its floor. */
export function plotHeight(heightPx: number, legendH: number, t: ChartText, m: VerticalMargins, rangeFloor = 0): number {
  return Math.max(heightPx - legendH, plotFloor(t, m, rangeFloor));
}

/** The least height the chart takes at text `t`: the legend, the margins and the plot's floor, px. */
export function chartHeightAt(widthPx: number, t: ChartText, entries: LegendEntry[], needs: ChartNeeds): number {
  const legendH = layoutLegend(entries, widthPx, t.tickPx, t.measure).height;
  return legendH + plotFloor(t, verticalMargins(t, needs.titles), needs.rangeFloor);
}

/**
 * The largest text scale, from 1 down to minTextScale(), at which the
 * legend, the margins and the plot's floor fit the box's height. When even
 * the minimums do not fit, minTextScale(): the chart then needs a taller
 * box than it was given, chartHeightAt() at that scale, and ChartBlock
 * grows the block to it rather than let the svg be scaled down to the box.
 *
 * `needsAt` gives the titles and the plot's floor at a scale (a title or a
 * category label may wrap onto fewer lines once its text is smaller).
 */
export function fitTextScale(
  box: { widthPx: number; heightPx: number },
  pxPerPt: number,
  entries: LegendEntry[],
  needsAt: (t: ChartText) => ChartNeeds,
  measure: MeasureText = estimateTextWidth,
): number {
  const floor = minTextScale();
  const step = FIT_STEP_PT / chartTextPt().tick;
  const steps = Math.max(0, Math.round((1 - floor) / step));
  for (let k = 0; k <= steps; k += 1) {
    const scale = k === steps ? floor : 1 - k * step;
    const t = chartText(pxPerPt, scale, measure);
    if (box.heightPx >= chartHeightAt(box.widthPx, t, entries, needsAt(t))) return scale;
  }
  return floor;
}
