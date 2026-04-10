/**
 * Pure table-data operations.
 *
 * Each helper takes a TableData and returns a NEW TableData — no
 * mutation — so they're safe to call from both the block itself
 * (during inline cell edits) and the sidebar editor (for structural
 * operations like adding rows / columns / changing border preset).
 *
 * Colocated with blocks.tsx because they're the table's only
 * caller today, but split out so the sidebar can import them
 * without dragging the whole blocks.tsx React tree along.
 */
import type { TableData } from '@postr/shared';

export const DEFAULT_TABLE_DATA: TableData = {
  rows: 3,
  cols: 3,
  cells: Array(9).fill(''),
  colWidths: null,
  borderPreset: 'apa',
};

export function updateCell(data: TableData, r: number, c: number, v: string): TableData {
  const cells = [...data.cells];
  cells[r * data.cols + c] = v;
  return { ...data, cells };
}

/**
 * Insert a blank row at `index`. `position` is 'above' (insert at
 * index) or 'below' (insert at index + 1). Clamped to [0, rows].
 */
export function insertRow(
  data: TableData,
  index: number,
  position: 'above' | 'below' = 'below',
): TableData {
  const at = Math.max(0, Math.min(data.rows, position === 'above' ? index : index + 1));
  const before = data.cells.slice(0, at * data.cols);
  const after = data.cells.slice(at * data.cols);
  return {
    ...data,
    rows: data.rows + 1,
    cells: [...before, ...Array(data.cols).fill(''), ...after],
  };
}

/** Backwards-compat: append a blank row at the end. */
export function addRow(data: TableData): TableData {
  return insertRow(data, data.rows - 1, 'below');
}

/**
 * Insert a blank column at `index`. `position` is 'left' (insert at
 * index) or 'right' (insert at index + 1). Clamped to [0, cols].
 */
export function insertCol(
  data: TableData,
  index: number,
  position: 'left' | 'right' = 'right',
): TableData {
  const at = Math.max(0, Math.min(data.cols, position === 'left' ? index : index + 1));
  const newCols = data.cols + 1;
  const cells: string[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < newCols; c++) {
      if (c < at) {
        cells.push(data.cells[r * data.cols + c] ?? '');
      } else if (c === at) {
        cells.push('');
      } else {
        cells.push(data.cells[r * data.cols + (c - 1)] ?? '');
      }
    }
  }
  return {
    ...data,
    cols: newCols,
    cells,
    colWidths: Array(newCols).fill(100 / newCols),
  };
}

/** Backwards-compat: append a blank column on the right. */
export function addCol(data: TableData): TableData {
  return insertCol(data, data.cols - 1, 'right');
}

/** Delete the row at `index`. No-op if only one row remains. */
export function deleteRowAt(data: TableData, index: number): TableData {
  if (data.rows <= 1) return data;
  if (index < 0 || index >= data.rows) return data;
  const before = data.cells.slice(0, index * data.cols);
  const after = data.cells.slice((index + 1) * data.cols);
  return {
    ...data,
    rows: data.rows - 1,
    cells: [...before, ...after],
  };
}

/** Backwards-compat: drop the last row. */
export function delRow(data: TableData): TableData {
  return deleteRowAt(data, data.rows - 1);
}

/** Delete the column at `index`. No-op if only one column remains. */
export function deleteColAt(data: TableData, index: number): TableData {
  if (data.cols <= 1) return data;
  if (index < 0 || index >= data.cols) return data;
  const newCols = data.cols - 1;
  const cells: string[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      if (c === index) continue;
      cells.push(data.cells[r * data.cols + c] ?? '');
    }
  }
  return { ...data, cols: newCols, cells, colWidths: null };
}

/** Backwards-compat: drop the last column. */
export function delCol(data: TableData): TableData {
  return deleteColAt(data, data.cols - 1);
}

export function setBorderPreset(data: TableData, borderPreset: string): TableData {
  return { ...data, borderPreset };
}

/**
 * Parses clipboard content (HTML <table> or tab-delimited plain text)
 * into a fresh TableData. Returns null if nothing parseable was found.
 */
export function parseTablePaste(html: string, text: string): TableData | null {
  let rows: string[][] = [];
  if (html?.includes('<tr')) {
    new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelectorAll('tr')
      .forEach((tr) => {
        const c: string[] = [];
        tr.querySelectorAll('td,th').forEach((td) => c.push((td.textContent ?? '').trim()));
        if (c.length) rows.push(c);
      });
  } else if (text) {
    rows = text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.split('\t'));
  }
  if (!rows.length) return null;

  const maxCols = Math.max(...rows.map((r) => r.length));
  const cells: string[] = [];
  rows.forEach((r) => {
    for (let i = 0; i < maxCols; i++) cells.push(r[i] ?? '');
  });
  return {
    rows: rows.length,
    cols: maxCols,
    cells,
    colWidths: null,
    borderPreset: 'apa',
  };
}
