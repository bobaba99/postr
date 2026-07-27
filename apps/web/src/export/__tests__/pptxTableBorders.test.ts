/**
 * PPTX table border mapping — must mirror the canvas cellBorder
 * logic rule-for-rule (named presets + per-line custom mode).
 * Border arrays are [top, right, bottom, left].
 */
import { describe, expect, it } from 'vitest';
import type { TableData } from '@postr/shared';
import { DEFAULT_PALETTE } from '@/poster/constants';
import { tableCellBorders } from '../pptx/tableBorders';

const table = (partial: Partial<TableData>): TableData => ({
  rows: 3,
  cols: 3,
  cells: Array(9).fill('x'),
  colWidths: null,
  borderPreset: 'apa',
  ...partial,
});

const P = DEFAULT_PALETTE;

describe('tableCellBorders — APA preset', () => {
  const data = table({ borderPreset: 'apa' });

  it('draws heavy top rule on the header row only', () => {
    const [top] = tableCellBorders(data, 0, 0, P, 1);
    expect(top).toMatchObject({ type: 'solid', pt: 1.5 });
    const [midTop] = tableCellBorders(data, 2, 0, P, 1);
    expect(midTop.type).toBe('none');
  });

  it('draws the header separator as the top of row 1', () => {
    const [top] = tableCellBorders(data, 1, 1, P, 1);
    expect(top).toMatchObject({ type: 'solid', pt: 1 });
  });

  it('draws heavy bottom rule on the last row and no verticals', () => {
    const borders = tableCellBorders(data, 2, 1, P, 1);
    expect(borders[2]).toMatchObject({ type: 'solid', pt: 1.5 });
    expect(borders[1].type).toBe('none');
    expect(borders[3].type).toBe('none');
  });
});

describe('tableCellBorders — all-lines preset', () => {
  const data = table({ borderPreset: 'all' });

  it('draws outer edges on boundary cells', () => {
    const topLeft = tableCellBorders(data, 0, 0, P, 1);
    expect(topLeft[0].type).toBe('solid'); // top
    expect(topLeft[3].type).toBe('solid'); // left
    const bottomRight = tableCellBorders(data, 2, 2, P, 1);
    expect(bottomRight[2].type).toBe('solid'); // bottom
    expect(bottomRight[1].type).toBe('solid'); // right
  });

  it('draws inner grid lines as top/left of inner cells', () => {
    const inner = tableCellBorders(data, 1, 1, P, 1);
    expect(inner[0].type).toBe('solid');
    expect(inner[3].type).toBe('solid');
  });
});

describe('tableCellBorders — custom per-line mode', () => {
  const data = table({
    borderPreset: 'custom',
    customBorder: {
      topLine: false,
      bottomLine: false,
      leftLine: false,
      rightLine: false,
      headerLine: true,
      headerBox: false,
      // innerH[0] = gap below row 1: ON; nothing else.
      innerH: [true],
      innerV: [false, false],
    },
  });

  it('draws only the enabled inner gap (top of row 2)', () => {
    const [topRow2] = tableCellBorders(data, 2, 0, P, 1);
    expect(topRow2.type).toBe('solid');
  });

  it('keeps the header line independent of innerH', () => {
    const [topRow1] = tableCellBorders(data, 1, 0, P, 1);
    expect(topRow1).toMatchObject({ type: 'solid', pt: 1 });
  });

  it('draws no outer edges when all edge flags are off', () => {
    const corner = tableCellBorders(data, 0, 0, P, 1);
    expect(corner.every((b, i) => (i === 2 ? true : b.type === 'none'))).toBe(true);
    const [, right, bottom] = tableCellBorders(data, 2, 2, P, 1);
    expect(right.type).toBe('none');
    expect(bottom.type).toBe('none');
  });
});

describe('tableCellBorders — half-scale weights', () => {
  it('halves rule weights with the geometry', () => {
    const [top] = tableCellBorders(table({ borderPreset: 'apa' }), 0, 0, P, 0.5);
    expect(top).toMatchObject({ type: 'solid', pt: 0.75 });
  });
});
