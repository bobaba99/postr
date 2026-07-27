/**
 * Tabular input parsing for the plot picker.
 *
 * Accepts pasted TSV (Excel / Sheets / Numbers ⌘V), .csv / .tsv files
 * (papaparse with delimiter sniffing), and table blocks already on the
 * poster. Excel files go through parseExcel.ts (lazy-loaded reader)
 * which funnels back into `tabulate()` here so header detection and
 * the row cap live in exactly one place.
 *
 * Row cap: ≤ CHART_MAX_ROWS rows per chart — a deliberate guard
 * against the base64-in-JSONB performance mistake paid for once
 * already. Oversized input is never silently truncated; the caller
 * gets a `too-large` outcome and must ask the user before re-parsing
 * with `allowTruncate`.
 */
import Papa from 'papaparse';
import type { TableData } from '@postr/shared';

/** Cell value straight from a parser, before column inference. */
export type RawCell = string | number | boolean | Date | null;

export interface RawTable {
  header: string[];
  rows: RawCell[][];
}

export const CHART_MAX_ROWS = 2000;

export type ParseOutcome =
  | { ok: true; table: RawTable; truncated: boolean }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'no-delimiter' }
  | { ok: false; reason: 'too-large'; rowCount: number }
  | { ok: false; reason: 'legacy-xls' }
  | { ok: false; reason: 'unreadable' };

export interface TabulateOptions {
  /** Take the first CHART_MAX_ROWS rows instead of failing. */
  allowTruncate?: boolean;
}

// Digits with dot/comma separators, optional spaces (regular,
// no-break U+00A0, narrow no-break U+202F, European thousands
// separators) and a trailing percent sign.
const NUMERIC_LOOKING = /^[-+]?[\d.,\u00a0\u202f ]+%?$/;

function isNumericLooking(cell: RawCell): boolean {
  if (typeof cell === 'number') return true;
  if (typeof cell !== 'string') return false;
  const t = cell.trim();
  return t.length > 0 && /\d/.test(t) && NUMERIC_LOOKING.test(t);
}

function cellToHeader(cell: RawCell, index: number): string {
  const text =
    cell === null || cell === undefined
      ? ''
      : cell instanceof Date
        ? cell.toISOString().slice(0, 10)
        : String(cell).trim();
  return text.length > 0 ? text : `Column ${index + 1}`;
}

/**
 * First row is a header when it contains no numeric-looking cells but
 * the body does — the standard shape of research tables ("Condition,
 * RT" over rows of numbers). All-text tables keep row 0 as header too
 * (there is nothing to chart in a header-less all-text table anyway).
 */
function looksLikeHeader(first: RawCell[], rest: RawCell[][]): boolean {
  if (rest.length === 0) return false;
  if (first.some(isNumericLooking)) return false;
  return true;
}

/**
 * Shared normalization: header detection + row cap. Every input path
 * (paste, CSV, Excel, table block) ends here.
 */
export function tabulate(
  grid: RawCell[][],
  options: TabulateOptions = {},
): ParseOutcome {
  const nonEmpty = grid.filter((row) =>
    row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''),
  );
  if (nonEmpty.length === 0) return { ok: false, reason: 'empty' };

  const width = Math.max(...nonEmpty.map((r) => r.length));
  if (width < 1) return { ok: false, reason: 'empty' };

  const padded = nonEmpty.map((row) => {
    const out: RawCell[] = [];
    for (let i = 0; i < width; i++) out.push(row[i] ?? null);
    return out;
  });

  const first = padded[0]!;
  const rest = padded.slice(1);
  const hasHeader = looksLikeHeader(first, rest);
  const header = hasHeader
    ? first.map(cellToHeader)
    : first.map((_, i) => `Column ${i + 1}`);
  let rows = hasHeader ? rest : padded;

  if (rows.length === 0) return { ok: false, reason: 'empty' };

  let truncated = false;
  if (rows.length > CHART_MAX_ROWS) {
    if (!options.allowTruncate) {
      return { ok: false, reason: 'too-large', rowCount: rows.length };
    }
    rows = rows.slice(0, CHART_MAX_ROWS);
    truncated = true;
  }

  return { ok: true, table: { header, rows }, truncated };
}

/**
 * Parse pasted or uploaded delimited text. Papaparse sniffs the
 * delimiter (tab first — that is what ⌘V from Excel produces), handles
 * quoted fields, and we strip a UTF-8 BOM ourselves since Excel CSV
 * exports routinely carry one.
 */
export function parseDelimited(
  text: string,
  options: TabulateOptions = {},
): ParseOutcome {
  const cleaned = text.replace(/^\ufeff/, '');
  if (cleaned.trim().length === 0) return { ok: false, reason: 'empty' };

  const result = Papa.parse<string[]>(cleaned.trim(), {
    delimitersToGuess: ['\t', ',', ';', '|'],
    skipEmptyLines: 'greedy',
  });

  const grid = result.data.filter((row): row is string[] => Array.isArray(row));
  if (grid.length === 0) return { ok: false, reason: 'empty' };

  // A wall of prose parses "successfully" as one column per line.
  // That is not a table — surface it as a missing-delimiter problem
  // so the UI can suggest pasting cells instead of sentences.
  const maxWidth = Math.max(...grid.map((r) => r.length));
  if (maxWidth < 2) return { ok: false, reason: 'no-delimiter' };

  return tabulate(grid, options);
}

/**
 * Zero-upload path: a table block already on the poster. Table cells
 * are stored as a flat row-major string array.
 */
export function parseTableBlock(
  tableData: TableData,
  options: TabulateOptions = {},
): ParseOutcome {
  const { rows, cols, cells } = tableData;
  if (rows < 1 || cols < 1) return { ok: false, reason: 'empty' };
  const grid: RawCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: RawCell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(cells[r * cols + c] ?? null);
    }
    grid.push(row);
  }
  return tabulate(grid, options);
}
