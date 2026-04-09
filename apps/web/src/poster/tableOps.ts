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

export function addRow(data: TableData): TableData {
  return {
    ...data,
    rows: data.rows + 1,
    cells: [...data.cells, ...Array(data.cols).fill('')],
  };
}

export function addCol(data: TableData): TableData {
  const cells: string[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) cells.push(data.cells[r * data.cols + c] ?? '');
    cells.push('');
  }
  return {
    ...data,
    cols: data.cols + 1,
    cells,
    colWidths: Array(data.cols + 1).fill(100 / (data.cols + 1)),
  };
}

export function delRow(data: TableData): TableData {
  if (data.rows <= 1) return data;
  return {
    ...data,
    rows: data.rows - 1,
    cells: data.cells.slice(0, (data.rows - 1) * data.cols),
  };
}

export function delCol(data: TableData): TableData {
  if (data.cols <= 1) return data;
  const cells: string[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols - 1; c++) cells.push(data.cells[r * data.cols + c] ?? '');
  }
  return { ...data, cols: data.cols - 1, cells, colWidths: null };
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
