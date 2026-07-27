/**
 * ChartSpec assembly — turns a Recommendation + InferredTable into
 * the self-contained spec stored on a chart block.
 *
 * Guardrails applied here (baked in, not warned about):
 * - Aggregation: bar-family and line forms reduce repeated rows to
 *   group means at build time, so the stored spec is small, print is
 *   deterministic, and the caption can honestly say "means".
 *   Distribution forms (box, histogram, scatter) always keep raw rows.
 * - Series folding: > 8 series folds the tail into "Other (mean)" —
 *   an 11-hue line chart is unreadable at poster distance.
 * - Size cap: a finished spec over 200 KB serialized is rejected
 *   outright (the JSONB guard).
 *
 * Captions are seeded OUTPUT, not preview chrome — `captionFor()`
 * writes the journal-style caption that lands in the block's caption
 * field on insert.
 */
import type { ChartColumnDef, ChartSpec } from '@postr/shared';
import type { InferredColumn, InferredTable } from './inferColumns';
import type { Recommendation } from './recommend';
import { SAMPLE_CAPTION_PREFIX } from './sampleData';

export const CHART_MAX_SPEC_BYTES = 200_000;

const MAX_SERIES = 8;

const LIKERT_ORDER = [
  'strongly disagree',
  'disagree',
  'somewhat disagree',
  'neither agree nor disagree',
  'neutral',
  'somewhat agree',
  'agree',
  'strongly agree',
];

type Row = (string | number | null)[];

function colDef(col: InferredColumn): ChartColumnDef {
  return { name: col.name, kind: col.kind };
}

/** Extract row-aligned values for the given columns, dropping rows
 * where any required numeric value is missing. */
function extractRows(cols: InferredColumn[], required: InferredColumn[]): Row[] {
  const length = cols[0]?.values.length ?? 0;
  const rows: Row[] = [];
  for (let i = 0; i < length; i++) {
    if (required.some((c) => c.values[i] === null || c.values[i] === undefined)) continue;
    rows.push(cols.map((c) => c.values[i] ?? null));
  }
  return rows;
}

/** Group rows by 1–2 key columns and mean the value column. */
function aggregateMean(rows: Row[], keyIndices: number[], valueIndex: number): Row[] {
  const groups = new Map<string, { key: Row; sum: number; count: number }>();
  for (const row of rows) {
    const value = row[valueIndex];
    if (typeof value !== 'number') continue;
    const keyParts = keyIndices.map((k) => String(row[k] ?? ''));
    const key = keyParts.join('\u0000');
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, { ...existing, sum: existing.sum + value, count: existing.count + 1 });
    } else {
      groups.set(key, { key: keyIndices.map((k) => row[k] ?? null), sum: value, count: 1 });
    }
  }
  return [...groups.values()].map((g) => {
    const mean = g.sum / g.count;
    const out: Row = [];
    g.key.forEach((k, i) => {
      out[keyIndices[i] ?? i] = k;
    });
    out[valueIndex] = Math.round(mean * 1000) / 1000;
    return out;
  });
}

/**
 * Fold the long-format series tail: keep the top MAX_SERIES − 1
 * series by total value, average the rest into "Other (mean)".
 */
function foldSeries(rows: Row[], seriesIndex: number, valueIndex: number): Row[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const s = String(row[seriesIndex] ?? '');
    const v = row[valueIndex];
    totals.set(s, (totals.get(s) ?? 0) + (typeof v === 'number' ? Math.abs(v) : 0));
  }
  if (totals.size <= MAX_SERIES) return rows;
  const keep = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SERIES - 1)
      .map(([name]) => name),
  );
  const folded = rows.map((row) =>
    keep.has(String(row[seriesIndex] ?? ''))
      ? row
      : row.map((cell, i) => (i === seriesIndex ? 'Other (mean)' : cell)),
  );
  // Multiple folded series now share one label per x — average them.
  const keyIndices = folded[0]?.map((_, i) => i).filter((i) => i !== valueIndex) ?? [];
  return aggregateMean(folded, keyIndices, valueIndex);
}

interface Assembly {
  columns: InferredColumn[];
  rows: Row[];
  encoding: ChartSpec['encoding'];
  sort: ChartSpec['options']['sort'];
  seriesCount: number;
}

function assemble(table: InferredTable, rec: Recommendation): Assembly | null {
  const { form, roles } = rec;
  const { measure, measure2, time, cat1, cat2 } = roles;
  if (!measure) return null;
  const x = time ?? cat1;

  switch (form) {
    case 'bar': {
      if (!x) return null;
      const cols = [x, measure];
      let rows = extractRows(cols, [measure]);
      rows = aggregateMean(rows, [0], 1);
      return {
        columns: cols,
        rows,
        encoding: { x: x.name, y: measure.name },
        sort: time ? 'none' : 'value',
        seriesCount: 1,
      };
    }
    case 'line':
    case 'area': {
      if (!time) return null;
      const cols = cat1 ? [time, cat1, measure] : [time, measure];
      let rows = extractRows(cols, [measure]);
      rows = aggregateMean(rows, cat1 ? [0, 1] : [0], cols.length - 1);
      if (cat1) rows = foldSeries(rows, 1, 2);
      const seriesCount = cat1 ? new Set(rows.map((r) => r[1])).size : 1;
      return {
        columns: cols,
        rows,
        encoding: cat1
          ? { x: time.name, y: measure.name, series: cat1.name }
          : { x: time.name, y: measure.name },
        sort: 'none',
        seriesCount,
      };
    }
    case 'scatter': {
      if (!measure2) return null;
      const cols = [measure2, measure];
      const rows = extractRows(cols, [measure2, measure]);
      return {
        columns: cols,
        rows,
        encoding: { x: measure2.name, y: measure.name },
        sort: 'none',
        seriesCount: 1,
      };
    }
    case 'histogram': {
      const cols = [measure];
      return {
        columns: cols,
        rows: extractRows(cols, [measure]),
        encoding: { x: measure.name },
        sort: 'none',
        seriesCount: 1,
      };
    }
    case 'box': {
      const cols = cat1 ? [cat1, measure] : [measure];
      return {
        columns: cols,
        rows: extractRows(cols, [measure]),
        encoding: cat1 ? { x: cat1.name, y: measure.name } : { y: measure.name },
        sort: 'none',
        seriesCount: 1,
      };
    }
    case 'bar-grouped':
    case 'bar-stacked': {
      // Pre/post pairs become long format: (item, phase, value).
      if (roles.shape === 'pre-post' && measure2 && cat1) {
        const cols = [cat1, measure, measure2];
        const wide = extractRows(cols, [measure, measure2]);
        const rows: Row[] = [];
        for (const row of wide) {
          rows.push([row[0] ?? null, measure.name, row[1] ?? null]);
          rows.push([row[0] ?? null, measure2.name, row[2] ?? null]);
        }
        const phase: InferredColumn = {
          name: 'Phase',
          kind: 'category',
          values: rows.map((r) => r[1] ?? null),
          distinct: 2,
          ordered: false,
          percent: false,
        };
        const value: InferredColumn = { ...measure, name: measure.name };
        return {
          columns: [cat1, phase, value],
          rows,
          encoding: { x: cat1.name, series: 'Phase', y: measure.name },
          sort: 'label',
          seriesCount: 2,
        };
      }
      // Shares of a single whole: one stacked bar, series = category.
      if (roles.shape === 'shares' && cat1 && form === 'bar-stacked') {
        const cols = [cat1, measure];
        let rows = extractRows(cols, [measure]);
        rows = aggregateMean(rows, [0], 1);
        return {
          columns: cols,
          rows,
          encoding: { series: cat1.name, y: measure.name },
          sort: 'value',
          seriesCount: new Set(rows.map((r) => r[0])).size,
        };
      }
      const primary = time ?? cat1;
      const secondary = time ? cat1 : cat2;
      if (!primary || !secondary) return null;
      const cols = [primary, secondary, measure];
      let rows = extractRows(cols, [measure]);
      rows = aggregateMean(rows, [0, 1], 2);
      rows = foldSeries(rows, 1, 2);
      return {
        columns: cols,
        rows,
        encoding: { x: primary.name, series: secondary.name, y: measure.name },
        sort: 'label',
        seriesCount: new Set(rows.map((r) => r[1])).size,
      };
    }
    case 'bar-diverging': {
      // Likert: y = statement, series = ordered response level.
      const levels = cat2 ?? cat1;
      if (!levels) return null;
      const statement = cat2 ? cat1 : null;
      const cols = statement ? [statement, levels, measure] : [levels, measure];
      let rows = extractRows(cols, [measure]);
      rows = aggregateMean(rows, statement ? [0, 1] : [0], cols.length - 1);
      const levelIndex = statement ? 1 : 0;
      rows = rows
        .slice()
        .sort(
          (a, b) =>
            LIKERT_ORDER.indexOf(String(a[levelIndex] ?? '').toLowerCase()) -
            LIKERT_ORDER.indexOf(String(b[levelIndex] ?? '').toLowerCase()),
        );
      return {
        columns: cols,
        rows,
        encoding: statement
          ? { y: statement.name, series: levels.name, value: measure.name }
          : { series: levels.name, value: measure.name },
        sort: 'none',
        seriesCount: levels.distinct,
      };
    }
    case 'heatmap': {
      const xCol = time ?? cat1;
      const yCol = time ? cat1 : cat2;
      if (!xCol || !yCol) {
        // Dense two-numeric data: binned density map. No `value`
        // encoding — the renderer bins both axes and shades by count.
        if (!measure2) return null;
        const cols = [measure2, measure];
        return {
          columns: cols,
          rows: extractRows(cols, [measure2, measure]),
          encoding: { x: measure2.name, y: measure.name },
          sort: 'none',
          seriesCount: 1,
        };
      }
      const cols = [xCol, yCol, measure];
      let rows = extractRows(cols, [measure]);
      rows = aggregateMean(rows, [0, 1], 2);
      return {
        columns: cols,
        rows,
        encoding: { x: xCol.name, y: yCol.name, value: measure.name },
        sort: 'none',
        seriesCount: 1,
      };
    }
    case 'dumbbell': {
      if (!measure2 || !cat1) return null;
      const cols = [cat1, measure, measure2];
      const rows = extractRows(cols, [measure, measure2]);
      return {
        columns: cols,
        rows,
        encoding: { y: cat1.name, x: measure.name, value: measure2.name },
        sort: 'value',
        seriesCount: 2,
      };
    }
  }
}

const SERIES_SLOTS = ['accent', 'accent2', 'primary', 'muted'];

/**
 * Build the final ChartSpec, or null when the recommendation cannot
 * be realized (missing roles, or the serialized spec busts the JSONB
 * size cap).
 */
export function buildChartSpec(table: InferredTable, rec: Recommendation): ChartSpec | null {
  const assembly = assemble(table, rec);
  if (!assembly) return null;

  const slots = SERIES_SLOTS.slice(0, Math.max(1, Math.min(assembly.seriesCount, SERIES_SLOTS.length)));

  const spec: ChartSpec = {
    version: 1,
    form: rec.form,
    data: {
      columns: assembly.columns.map(colDef),
      rows: assembly.rows,
    },
    encoding: assembly.encoding,
    options: {
      legend: assembly.seriesCount >= 2,
      sort: assembly.sort,
      horizontal: rec.horizontal,
      directLabel: 'auto',
    },
    paletteSlots: slots,
    ...(assembly.encoding.x ? { xLabel: assembly.encoding.x } : {}),
    ...(assembly.encoding.y ? { yLabel: assembly.encoding.y } : {}),
  };

  try {
    if (JSON.stringify(spec).length > CHART_MAX_SPEC_BYTES) return null;
  } catch {
    return null;
  }
  return spec;
}

// ────────────────────────────────────────────────────────────────────
// Captions — journal voice, seeded into the block's caption field.
// ────────────────────────────────────────────────────────────────────

const lower = (s: string): string => (s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export interface CaptionOptions {
  /**
   * True when the values were synthesised rather than measured. The
   * caption is then prefixed with SAMPLE_CAPTION_PREFIX so the
   * warning travels with the figure into the block's caption field —
   * nobody should be able to mistake a sample for their results.
   */
  sample?: boolean;
}

export function captionFor(
  table: InferredTable,
  rec: Recommendation,
  options: CaptionOptions = {},
): string {
  const body = captionBody(table, rec);
  return options.sample ? `${SAMPLE_CAPTION_PREFIX} ${body}` : body;
}

function captionBody(table: InferredTable, rec: Recommendation): string {
  const { form, roles, aggregate } = rec;
  const m = roles.measure?.name ?? 'Value';
  const cat = roles.cat1?.name ?? 'group';
  const k = roles.cat1?.distinct ?? 0;
  const n = table.rowCount;

  switch (form) {
    case 'bar':
      if (roles.time) return `${m} across ${lower(roles.time.name)}.`;
      return aggregate
        ? `Mean ${lower(m)} by ${lower(cat)}. Bars show group means; n = ${k} ${lower(cat)} levels.`
        : `${m} by ${lower(cat)}; n = ${k} groups.`;
    case 'line':
    case 'area': {
      const t = roles.time?.name ?? 'time';
      return roles.cat1
        ? `${m} across ${lower(t)} by ${lower(cat)} (${roles.cat1.distinct} series).`
        : `${m} across ${lower(t)}.`;
    }
    case 'scatter':
      return `${m} against ${lower(roles.measure2?.name ?? 'value')}; n = ${n} observations.`;
    case 'histogram':
      return `Distribution of ${lower(m)}; n = ${n} observations.`;
    case 'box':
      return roles.cat1
        ? `Distribution of ${lower(m)} by ${lower(cat)}. Boxes show median and interquartile range.`
        : `Distribution of ${lower(m)}. Box shows median and interquartile range.`;
    case 'bar-stacked':
      return roles.shape === 'shares'
        ? `Composition of ${lower(m)} by ${lower(cat)}; segments sum to the whole.`
        : `Mean ${lower(m)} by ${lower(cat)}, stacked by ${lower(roles.cat2?.name ?? 'group')}.`;
    case 'bar-diverging':
      return `Responses by ${lower(cat)}, ordered from disagreement to agreement.`;
    case 'bar-grouped':
      return roles.shape === 'pre-post'
        ? `${roles.measure?.name ?? 'Baseline'} and ${lower(roles.measure2?.name ?? 'follow-up')} by ${lower(cat)}.`
        : `Mean ${lower(m)} by ${lower(cat)} and ${lower(roles.cat2?.name ?? roles.time?.name ?? 'group')}.`;
    case 'heatmap':
      if (!roles.cat1 && roles.measure2) {
        return `Joint distribution of ${lower(roles.measure2.name)} and ${lower(m)}; shade encodes observation count (n = ${n}).`;
      }
      return `Mean ${lower(m)} by ${lower(roles.time?.name ?? cat)} and ${lower(roles.cat2?.name ?? cat)}; shade encodes magnitude.`;
    case 'dumbbell':
      return `Change from ${lower(m)} to ${lower(roles.measure2?.name ?? 'follow-up')} by ${lower(cat)}; each line connects the paired values.`;
  }
}
