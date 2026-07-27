import { describe, expect, it } from 'vitest';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

describe('inferTable', () => {
  it('detects numeric string columns', () => {
    const t = inferTable(raw(['Group', 'RT'], [
      ['Control', '412'],
      ['Drug', '388.5'],
    ]));
    expect(t.columns[0]?.kind).toBe('category');
    expect(t.columns[1]?.kind).toBe('number');
    expect(t.columns[1]?.values).toEqual([412, 388.5]);
  });

  it('reads European decimal commas per column', () => {
    const t = inferTable(raw(['Wert'], [['1,5'], ['2,25'], ['3,7']]));
    expect(t.columns[0]?.kind).toBe('number');
    expect(t.columns[0]?.values).toEqual([1.5, 2.25, 3.7]);
  });

  it('reads comma thousands separators when dots are decimal', () => {
    const t = inferTable(raw(['N'], [['1,234'], ['12,345.5'], ['999']]));
    expect(t.columns[0]?.kind).toBe('number');
    expect(t.columns[0]?.values).toEqual([1234, 12345.5, 999]);
  });

  it('treats ambiguous all-1,234 columns as thousands, not decimals', () => {
    const t = inferTable(raw(['N'], [['1,234'], ['2,468']]));
    expect(t.columns[0]?.values).toEqual([1234, 2468]);
  });

  it('parses percent columns and flags them', () => {
    const t = inferTable(raw(['Share'], [['45%'], ['30%'], ['25%']]));
    expect(t.columns[0]?.kind).toBe('number');
    expect(t.columns[0]?.percent).toBe(true);
    expect(t.columns[0]?.values).toEqual([45, 30, 25]);
  });

  it('detects ISO date columns as ordered dates', () => {
    const t = inferTable(raw(['Visit', 'Score'], [
      ['2024-01-15', '10'],
      ['2024-02-15', '12'],
    ]));
    expect(t.columns[0]?.kind).toBe('date');
    expect(t.columns[0]?.ordered).toBe(true);
  });

  it('does not read a lone "Dec" category as a date column', () => {
    const t = inferTable(raw(['Direction'], [['Dec'], ['Dec'], ['Dec']]));
    expect(t.columns[0]?.kind).toBe('category');
  });

  it('reads month-name sequences as dates', () => {
    const t = inferTable(raw(['Month'], [['Jan'], ['Feb'], ['Mar'], ['Apr']]));
    expect(t.columns[0]?.kind).toBe('date');
  });

  it('marks bare-year integer columns as ordered', () => {
    const t = inferTable(raw(['Year', 'Enrollment'], [
      ['2019', '120'],
      ['2020', '145'],
      ['2021', '160'],
    ]));
    expect(t.columns[0]?.kind).toBe('number');
    expect(t.columns[0]?.ordered).toBe(true);
    expect(t.columns[1]?.ordered).toBe(false);
  });

  it('marks time-named integer columns (Week) as ordered', () => {
    const t = inferTable(raw(['Week', 'Pain score'], [
      ['1', '7.2'],
      ['2', '6.1'],
      ['3', '5.0'],
    ]));
    expect(t.columns[0]?.ordered).toBe(true);
  });

  it('coerces stray text inside a numeric column to null', () => {
    const t = inferTable(raw(['Score'], Array.from({ length: 20 }, (_, i) =>
      i === 5 ? ['n/a'] : [String(i)],
    )));
    expect(t.columns[0]?.kind).toBe('number');
    expect(t.columns[0]?.values[5]).toBeNull();
  });

  it('keeps mixed columns categorical', () => {
    const t = inferTable(raw(['Label'], [['A'], ['B'], ['3'], ['C']]));
    expect(t.columns[0]?.kind).toBe('category');
  });

  it('counts distinct values', () => {
    const t = inferTable(raw(['Group'], [['A'], ['B'], ['A'], ['C']]));
    expect(t.columns[0]?.distinct).toBe(3);
  });

  it('accepts native Excel numbers and dates', () => {
    const t = inferTable(raw(['When', 'Value'], [
      [new Date('2024-03-01T00:00:00Z'), 3],
      [new Date('2024-04-01T00:00:00Z'), 5],
    ]));
    expect(t.columns[0]?.kind).toBe('date');
    expect(t.columns[0]?.values).toEqual(['2024-03-01', '2024-04-01']);
    expect(t.columns[1]?.kind).toBe('number');
  });
});
