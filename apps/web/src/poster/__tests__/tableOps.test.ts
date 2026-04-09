/**
 * Pure table-ops tests. Each helper returns a new TableData — these
 * tests pin the immutability contract plus the specific cell-index
 * math (row-major flat array) so refactors can't silently flip it.
 */
import { describe, it, expect } from 'vitest';
import type { TableData } from '@postr/shared';
import {
  DEFAULT_TABLE_DATA,
  addCol,
  addRow,
  delCol,
  delRow,
  parseTablePaste,
  setBorderPreset,
  updateCell,
} from '../tableOps';

function makeTable(rows: number, cols: number, fill: (r: number, c: number) => string): TableData {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(fill(r, c));
  }
  return { rows, cols, cells, colWidths: null, borderPreset: 'apa' };
}

describe('tableOps', () => {
  it('updateCell places the new value at [row * cols + col]', () => {
    const t = makeTable(2, 3, (r, c) => `${r},${c}`);
    const next = updateCell(t, 1, 2, 'X');
    expect(next.cells[5]).toBe('X');
    // Unchanged neighbours
    expect(next.cells[4]).toBe('1,1');
    expect(next.cells[0]).toBe('0,0');
    // Immutable
    expect(next).not.toBe(t);
    expect(t.cells[5]).toBe('1,2');
  });

  it('addRow appends cols blank cells at the end', () => {
    const t = makeTable(2, 3, (r, c) => `${r},${c}`);
    const next = addRow(t);
    expect(next.rows).toBe(3);
    expect(next.cells).toHaveLength(9);
    expect(next.cells.slice(6)).toEqual(['', '', '']);
  });

  it('addCol inserts a blank column on the right of every row', () => {
    const t = makeTable(2, 2, (r, c) => `${r}${c}`);
    const next = addCol(t);
    expect(next.cols).toBe(3);
    // Row 0: 00, 01, ''
    expect(next.cells.slice(0, 3)).toEqual(['00', '01', '']);
    // Row 1: 10, 11, ''
    expect(next.cells.slice(3, 6)).toEqual(['10', '11', '']);
    // colWidths equalize
    expect(next.colWidths).toEqual([100 / 3, 100 / 3, 100 / 3]);
  });

  it('delRow drops the last row', () => {
    const t = makeTable(3, 2, (r, c) => `${r}${c}`);
    const next = delRow(t);
    expect(next.rows).toBe(2);
    expect(next.cells).toEqual(['00', '01', '10', '11']);
  });

  it('delRow is a no-op at 1 row', () => {
    const t = makeTable(1, 2, () => 'a');
    expect(delRow(t)).toBe(t);
  });

  it('delCol drops the last column of every row', () => {
    const t = makeTable(2, 3, (r, c) => `${r}${c}`);
    const next = delCol(t);
    expect(next.cols).toBe(2);
    expect(next.cells).toEqual(['00', '01', '10', '11']);
    expect(next.colWidths).toBeNull();
  });

  it('delCol is a no-op at 1 column', () => {
    const t = makeTable(2, 1, () => 'a');
    expect(delCol(t)).toBe(t);
  });

  it('setBorderPreset updates the preset key only', () => {
    const t = DEFAULT_TABLE_DATA;
    const next = setBorderPreset(t, 'all');
    expect(next.borderPreset).toBe('all');
    expect(next.cells).toEqual(t.cells);
  });

  describe('parseTablePaste', () => {
    it('parses HTML <tr>/<td> into rows + cols', () => {
      const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
      const t = parseTablePaste(html, '');
      expect(t?.rows).toBe(2);
      expect(t?.cols).toBe(2);
      expect(t?.cells).toEqual(['a', 'b', 'c', 'd']);
    });

    it('parses tab-delimited plain text', () => {
      const txt = 'a\tb\tc\nd\te\tf';
      const t = parseTablePaste('', txt);
      expect(t?.rows).toBe(2);
      expect(t?.cols).toBe(3);
      expect(t?.cells).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('pads short rows to the max width', () => {
      const txt = 'a\tb\tc\nd\te';
      const t = parseTablePaste('', txt);
      expect(t?.cols).toBe(3);
      expect(t?.cells).toEqual(['a', 'b', 'c', 'd', 'e', '']);
    });

    it('returns null for empty input', () => {
      expect(parseTablePaste('', '')).toBeNull();
    });
  });
});
