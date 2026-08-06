/**
 * Shared helpers for the R / Python code generators.
 *
 * The generators are pure `ChartSpec → string` functions (no DOM, no Plot)
 * so they are trivially unit-testable and run entirely client-side — the
 * user's data never leaves the browser, matching the chart-chooser stance.
 *
 * Two data modes (user's choice in the export UI):
 *   - 'mine'   : the user's real rows, embedded inline.
 *   - 'sample' : synthetic values with the SAME columns/shape/types, for
 *                privacy. Column names are real; values are fabricated.
 * Both modes also emit a commented-out CSV loader so swapping to a real
 * file is a one-line uncomment.
 */
import type { ChartSpec, ChartColumnDef } from '@postr/shared';

export type DataMode = 'mine' | 'sample';

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random). */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Synthetic value for a column at row index i — same TYPE as the column,
 * obviously fake values. Numbers land in a tidy 10–100 band; categories
 * cycle a small labelled set; dates walk forward by month.
 */
function sampleValue(col: ChartColumnDef, i: number, colIdx: number): string | number {
  if (col.kind === 'number') {
    return Math.round((10 + seeded(i * 7 + colIdx) * 90) * 10) / 10;
  }
  if (col.kind === 'date') {
    const month = (i % 12) + 1;
    const year = 2024 + Math.floor(i / 12);
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  // category — cycle a stable labelled set unique per column
  const labels = ['Group A', 'Group B', 'Group C', 'Group D'];
  return labels[i % labels.length]!;
}

/** Rows for the chosen mode — real rows, or same-shape synthetic rows. */
export function rowsForMode(spec: ChartSpec, mode: DataMode): (string | number | null)[][] {
  if (mode === 'mine') return spec.data.rows;
  const n = Math.min(Math.max(spec.data.rows.length, 4), 12);
  return Array.from({ length: n }, (_, i) =>
    spec.data.columns.map((col, c) => sampleValue(col, i, c)),
  );
}

/** Column values as a typed literal list for the target language. */
export function columnLiteral(
  values: (string | number | null)[],
  kind: ChartColumnDef['kind'],
  lang: 'r' | 'py',
): string {
  const cells = values.map((v) => {
    if (v === null || v === undefined) return lang === 'r' ? 'NA' : 'None';
    if (kind === 'number') return String(v);
    // strings / dates → quoted
    const escaped = String(v).replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
  return cells.join(', ');
}

/** True when the user has real rows to offer (guards the 'mine' toggle). */
export function hasRealData(spec: ChartSpec): boolean {
  return spec.data.rows.length > 0;
}
