import { describe, expect, it } from 'vitest';
import type { TableData } from '@postr/shared';
import {
  CHART_MAX_ROWS,
  parseDelimited,
  parseTableBlock,
  tabulate,
} from '../parseData';
import { isExcelFile, isLegacyXls, tabulateExcelSheet } from '../parseExcel';

function expectOk(outcome: ReturnType<typeof parseDelimited>) {
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.reason}`);
  return outcome;
}

describe('parseDelimited', () => {
  it('parses comma-separated text with a header row', () => {
    const out = expectOk(parseDelimited('Condition,RT\nControl,412\nTreatment,388'));
    expect(out.table.header).toEqual(['Condition', 'RT']);
    expect(out.table.rows).toEqual([
      ['Control', '412'],
      ['Treatment', '388'],
    ]);
  });

  it('sniffs tab delimiters from an Excel paste', () => {
    const out = expectOk(parseDelimited('Group\tScore\nA\t1.5\nB\t2.5'));
    expect(out.table.header).toEqual(['Group', 'Score']);
    expect(out.table.rows).toHaveLength(2);
  });

  it('sniffs semicolon delimiters (European CSV)', () => {
    const out = expectOk(parseDelimited('Gruppe;Wert\nA;1,5\nB;2,5'));
    expect(out.table.header).toEqual(['Gruppe', 'Wert']);
  });

  it('strips a UTF-8 BOM before the first header cell', () => {
    const out = expectOk(parseDelimited('﻿Condition,RT\nControl,412\nDrug,398'));
    expect(out.table.header[0]).toBe('Condition');
  });

  it('handles quoted fields containing the delimiter', () => {
    const out = expectOk(
      parseDelimited('Site,Count\n"Acme State University, Dept A",12\n"Sample Research Institute",9'),
    );
    expect(out.table.rows[0]?.[0]).toBe('Acme State University, Dept A');
  });

  it('generates column names when the first row is data', () => {
    const out = expectOk(parseDelimited('1,4\n2,9\n3,16'));
    expect(out.table.header).toEqual(['Column 1', 'Column 2']);
    expect(out.table.rows).toHaveLength(3);
  });

  it('rejects empty input', () => {
    expect(parseDelimited('   \n  ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects prose with no delimiter', () => {
    const out = parseDelimited('this is a paragraph\nof plain sentences\nnot a table');
    expect(out).toEqual({ ok: false, reason: 'no-delimiter' });
  });

  it('refuses oversized input without explicit consent', () => {
    const big = ['x,y', ...Array.from({ length: CHART_MAX_ROWS + 5 }, (_, i) => `a${i},${i}`)].join('\n');
    const out = parseDelimited(big);
    expect(out).toEqual({ ok: false, reason: 'too-large', rowCount: CHART_MAX_ROWS + 5 });
  });

  it('truncates oversized input only when allowTruncate is set', () => {
    const big = ['x,y', ...Array.from({ length: CHART_MAX_ROWS + 5 }, (_, i) => `a${i},${i}`)].join('\n');
    const out = expectOk(parseDelimited(big, { allowTruncate: true }));
    expect(out.truncated).toBe(true);
    expect(out.table.rows).toHaveLength(CHART_MAX_ROWS);
  });

  it('skips blank lines between data rows', () => {
    const out = expectOk(parseDelimited('a,b\n1,2\n\n\n3,4'));
    expect(out.table.rows).toHaveLength(2);
  });
});

describe('tabulate', () => {
  it('pads ragged rows to the widest row', () => {
    const out = tabulate([
      ['Group', 'Score', 'SD'],
      ['A', 1],
      ['B', 2, 0.4],
    ]);
    if (!out.ok) throw new Error('expected ok');
    expect(out.table.rows).toEqual([
      ['A', 1, null],
      ['B', 2, 0.4],
    ]);
  });

  it('treats a numeric-looking first row as data, not header', () => {
    const out = tabulate([
      [2019, 4.2],
      [2020, 4.8],
    ]);
    if (!out.ok) throw new Error('expected ok');
    expect(out.table.header).toEqual(['Column 1', 'Column 2']);
    expect(out.table.rows).toHaveLength(2);
  });
});

describe('parseTableBlock', () => {
  const table = (cells: string[], rows: number, cols: number): TableData => ({
    rows,
    cols,
    cells,
    colWidths: null,
    borderPreset: 'apa',
  });

  it('reads a poster table block with header row', () => {
    const out = parseTableBlock(table(['Group', 'Mean', 'A', '1.2', 'B', '3.4'], 3, 2));
    if (!out.ok) throw new Error('expected ok');
    expect(out.table.header).toEqual(['Group', 'Mean']);
    expect(out.table.rows).toEqual([
      ['A', '1.2'],
      ['B', '3.4'],
    ]);
  });

  it('rejects an all-empty table', () => {
    const out = parseTableBlock(table(['', '', '', ''], 2, 2));
    expect(out).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('excel helpers', () => {
  it('recognizes Excel extensions case-insensitively', () => {
    expect(isExcelFile('results.XLSX')).toBe(true);
    expect(isExcelFile('results.xls')).toBe(true);
    expect(isExcelFile('results.csv')).toBe(false);
  });

  it('flags legacy .xls separately from .xlsx', () => {
    expect(isLegacyXls('old-data.xls')).toBe(true);
    expect(isLegacyXls('new-data.xlsx')).toBe(false);
  });

  it('tabulates a normalized sheet grid like any other input', () => {
    const out = tabulateExcelSheet({
      name: 'Sheet1',
      grid: [
        ['Visit', 'Score'],
        [new Date('2024-01-15T00:00:00Z'), 12],
        [new Date('2024-02-15T00:00:00Z'), 15],
      ],
    });
    if (!out.ok) throw new Error('expected ok');
    expect(out.table.header).toEqual(['Visit', 'Score']);
    expect(out.table.rows[0]?.[1]).toBe(12);
  });
});
