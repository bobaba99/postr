/**
 * ChartSpec → Observable Plot options.
 *
 * The Plot module is injected (`PlotLike`) so this stays a pure,
 * synchronously testable mapping while the real module remains
 * lazy-loaded in renderChart.ts. No Plot API leaks outside
 * `apps/web/src/charts/` (v1 plan, decided default #5).
 *
 * Print legibility is enforced here, not checked after the fact:
 * tick/legend text renders at ≥ 18 pt and axis titles at ≥ 24 pt of
 * printed size — the same MIN_PT_BY_ROLE thresholds the figure
 * readability checker measures against — so a chart the picker
 * inserts can never fail our own linter.
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
  resolveSlot,
  sequentialRamp,
  seriesColors,
} from './chartColors';

/** Loose view of the Plot module — only what we call. */
export type PlotLike = Record<string, (...args: never[]) => unknown> & {
  plot: (options: Record<string, unknown>) => SVGSVGElement | HTMLElement;
};

export interface ChartTheme {
  palette: Palette;
  /** CSS font-family for every piece of chart text. */
  fontFamily: string;
  /** Natural render size in px (the block's on-canvas pixel size). */
  widthPx: number;
  heightPx: number;
  /** Pixels per printed point at this render size. */
  pxPerPt: number;
}

export interface LegendEntry {
  label: string;
  color: string;
}

export interface PlotBuild {
  options: Record<string, unknown>;
  /** Entries for the custom SVG legend (empty = no legend). */
  legendEntries: LegendEntry[];
  /** Font sizes in px, for the legend painter. */
  tickPx: number;
  labelPx: number;
}

/** MIN_PT_BY_ROLE, ReadabilityPanel.tsx — axis-tick/legend 18, titles 24. */
const MIN_TICK_PT = 18;
const MIN_LABEL_PT = 24;

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

function longestLabelChars(data: DataRow[], field: string | undefined): number {
  if (!field) return 0;
  return data.reduce((max, row) => Math.max(max, String(row[field] ?? '').length), 0);
}

const LIKERT_NEGATIVE = /disagree/i;
const LIKERT_NEUTRAL = /^(neutral|neither)/i;

/**
 * Build the Plot options for a spec. `plot` is the (lazily imported)
 * Plot module.
 */
export function buildPlotOptions(spec: ChartSpec, theme: ChartTheme, plot: PlotLike): PlotBuild {
  const P = plot as unknown as Record<string, (...args: unknown[]) => unknown>;
  const { palette } = theme;
  const e = spec.encoding;
  const data = toObjects(spec);
  const tickPx = MIN_TICK_PT * theme.pxPerPt;
  const labelPx = MIN_LABEL_PT * theme.pxPerPt;
  const color0 = resolveSlot(spec.paletteSlots[0] ?? 'accent', palette);
  const textColor = '#1c1b1a';
  const strokeW = Math.max(2, tickPx * 0.14);

  const marks: unknown[] = [];
  let legendEntries: LegendEntry[] = [];
  const options: Record<string, unknown> = {
    width: theme.widthPx,
    height: theme.heightPx,
    marginTop: Math.round(tickPx * 1.2),
    marginRight: Math.round(tickPx * 1.5),
    marginBottom: Math.round(labelPx * 2.2),
    marginLeft: Math.round(labelPx * 2.6),
    style: {
      background: 'transparent',
      color: textColor,
      fontFamily: theme.fontFamily,
      fontSize: `${Math.round(tickPx)}px`,
    },
    x: { label: spec.xLabel ?? e.x ?? null },
    y: { label: spec.yLabel ?? e.y ?? null, grid: true },
  };

  const seriesValues = distinctStrings(data, e.series);
  const colors = seriesColors(Math.max(1, seriesValues.length), spec.paletteSlots, palette);
  const colorScale = { domain: seriesValues, range: colors };

  const sortByValue = spec.options.sort === 'value';
  const horizontal = spec.options.horizontal;

  // Generous left margin for horizontal category labels.
  const catLabelChars = horizontal
    ? Math.max(longestLabelChars(data, e.x), longestLabelChars(data, e.y))
    : 0;
  if (horizontal) {
    options['marginLeft'] = Math.round(
      Math.min(theme.widthPx * 0.42, Math.max(labelPx * 2, catLabelChars * tickPx * 0.62)),
    );
  }

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
          marks.push(
            P['text']?.(lastPerSeries, {
              x: e.x,
              y: e.y,
              text: e.series,
              fill: e.series,
              dx: Math.round(tickPx * 0.4),
              textAnchor: 'start',
              fontSize: tickPx,
            }),
          );
          options['marginRight'] = Math.round(
            Math.max(tickPx * 2, longestLabelChars(data, e.series) * tickPx * 0.62),
          );
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
        options['height'] = Math.min(theme.heightPx, Math.round(labelPx * 6));
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
      options['marginLeft'] = Math.round(
        Math.min(theme.widthPx * 0.42, Math.max(labelPx * 2, longestLabelChars(data, e.y) * tickPx * 0.55)),
      );
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

  return { options, legendEntries, tickPx, labelPx };
}
