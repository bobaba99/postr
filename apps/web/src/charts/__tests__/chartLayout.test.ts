/**
 * chartLayout's rules (plan item 13 part 2, record
 * docs/fixes/13c-chart-text-minimums.md): the chart's text sizes against
 * the canonical minimums, the legend's rows, wrapping, the margins and the
 * fit. The editor-level tests (poster/__tests__/chartBlockLayout.test.tsx)
 * enter where the user does; these pin the rules those rely on, and the
 * browser harness (scripts/chart-print-size-check.mjs) measures what they
 * draw.
 */
import { describe, expect, it } from 'vitest';
import {
  CHART_TEXT_PT,
  bandAxisRange,
  bandLabelRoom,
  chartHeightAt,
  chartText,
  chartTextPt,
  fitTextScale,
  layoutLegend,
  minTextScale,
  plotHeight,
  verticalMargins,
  widestUnbreakable,
  wrapLabels,
  wrapText,
} from '../chartLayout';
import { estimateTextWidth } from '../textMeasure';
import { FIGURE_TEXT_MIN_PT } from '@/poster/figureTextMinimums';

const PX_PER_PT = 10 / 7.2;
const entries = (labels: string[]) => labels.map((label) => ({ label, color: '#000' }));
/** A measurer unlike the estimate: every character 0.5 em, so a rule that reads a character count instead of the measurer shows. */
const halfEm = (text: string, px: number) => text.length * 0.5 * px;
const W = (text: string, px: number) => estimateTextWidth(text, px);

describe('the chart’s text sizes', () => {
  it('are 18 pt and 24 pt, above the canonical minimums', () => {
    expect(chartTextPt()).toEqual({ tick: CHART_TEXT_PT.tick, axisTitle: CHART_TEXT_PT.axisTitle });
    expect(CHART_TEXT_PT.tick).toBeGreaterThan(FIGURE_TEXT_MIN_PT.axisText);
    expect(CHART_TEXT_PT.axisTitle).toBeGreaterThan(FIGURE_TEXT_MIN_PT.axisTitle);
  });

  it('may scale down only to the minimums, and a 0.5 % margin above them for print: 14/18 of tick size binds', () => {
    expect(minTextScale()).toBeCloseTo((14 / 18) * 1.005, 12);
    const t = chartText(PX_PER_PT, minTextScale());
    expect(t.tickPx / PX_PER_PT).toBeCloseTo(14 * 1.005, 9);
    expect(t.labelPx / PX_PER_PT).toBeGreaterThanOrEqual(18 * 1.005);
  });
});

describe('layoutLegend', () => {
  it('draws no legend for fewer than two entries', () => {
    expect(layoutLegend(entries(['Only']), 600, 25)).toMatchObject({ rows: [], height: 0 });
  });

  it('wraps entries onto rows that fit the width, and its height counts every row', () => {
    const tickPx = 25;
    const l = layoutLegend(entries(['Placebo arm', 'Low dose arm', 'Medium dose arm', 'High dose arm', 'Active comparator']), 600, tickPx);
    const rows = Math.max(...l.rows.map((r) => r.row)) + 1;
    expect(rows).toBeGreaterThan(1);
    expect(l.height).toBe(rows * l.rowH + l.gapY);
    for (const r of l.rows) expect(r.x + l.swatch + 6 + W(r.entry.label, tickPx)).toBeLessThanOrEqual(600 - 8);
  });

  it('wraps a label longer than a row onto lines inside the width, and the row is that much taller (review Q-R3)', () => {
    const tickPx = 25;
    const long = 'Systolic blood pressure before the intervention, seated, after rest (mmHg)';
    const l = layoutLegend(entries([long, 'After']), 400, tickPx);
    const first = l.rows[0]!;
    expect(first.lines.length).toBeGreaterThan(1);
    for (const line of first.lines) expect(first.x + l.swatch + 6 + W(line, tickPx)).toBeLessThanOrEqual(400 - 8 + 1e-9);
    expect(l.height).toBeCloseTo(2 * l.rowH + l.gapY + (first.lines.length - 1) * l.lineStep, 9);
  });

  it('measures with the measurer it is given', () => {
    const l = layoutLegend(entries(['abcdefghij', 'klmnopqrst']), 1000, 20, halfEm);
    expect(l.rows[1]!.x).toBeCloseTo(8 + l.swatch + 6 + 10 * 0.5 * 20 + Math.round(20 * 1.1), 9);
  });
});

describe('wrapping', () => {
  it('breaks between words within the width', () => {
    const lines = wrapText('Mean reaction time across all sessions (ms)', 300, 25);
    expect(lines.join(' ')).toBe('Mean reaction time across all sessions (ms)');
    for (const line of lines) expect(W(line, 25)).toBeLessThanOrEqual(300);
  });

  it('breaks a word wider than the width after its hyphen, then between its characters, so no line is wider (review Q-R4)', () => {
    expect(wrapText('Mindfulness-based', 200, 25)).toEqual(['Mindfulness-', 'based']);
    const lines = wrapText('Supercalifragilistic', 50, 25);
    expect(lines.join('')).toBe('Supercalifragilistic');
    for (const line of lines) expect(W(line, 25)).toBeLessThanOrEqual(50);
  });

  it('counts capitals wider than lower case without a canvas', () => {
    expect(estimateTextWidth('MINDFULNESS', 20)).toBeGreaterThan(estimateTextWidth('mindfulness', 20));
  });

  it('wrapLabels formats each label with its line breaks, and reports the widest line and the most lines', () => {
    const w = wrapLabels(['Low dose', 'Placebo'], 120, 25);
    expect(w.format('Low dose')).toBe('Low\ndose');
    expect(w.format('Placebo')).toBe('Placebo');
    expect(w.maxLines).toBe(2);
    expect(w.widestPx).toBeCloseTo(W('Placebo', 25), 9);
    expect(wrapLabels(['Placebo'], 1000, 25, halfEm).widestPx).toBeCloseTo(7 * 0.5 * 25, 9);
  });

  it('a category axis on the left widens its room to hold its widest word, up to a limit', () => {
    const t = chartText(PX_PER_PT);
    const base = bandLabelRoom(t, 390, false);
    const word = widestUnbreakable(['MINDFULNESS-BASED STRESS REDUCTION'], t.tickPx);
    expect(word).toBeCloseTo(W('MINDFULNESS-', t.tickPx), 9);
    expect(bandLabelRoom(t, 390, false, word)).toBeGreaterThan(base);
    expect(bandLabelRoom(t, 390, false, 10_000)).toBeLessThan(390 * 0.6);
  });
});

describe('margins and the plot’s height', () => {
  const t = chartText(PX_PER_PT);
  it('give a y title above the plot and an x title under it room, line by line', () => {
    const none = verticalMargins(t, { yTopLines: 0, xLines: 0 });
    const one = verticalMargins(t, { yTopLines: 1, xLines: 1 });
    const two = verticalMargins(t, { yTopLines: 2, xLines: 2, xTickLines: 2 });
    expect(one.top).toBeGreaterThan(none.top + t.labelPx);
    expect(one.bottom).toBeGreaterThan(none.bottom + t.labelPx);
    expect(two.top).toBeGreaterThan(one.top + t.labelPx);
    expect(two.bottom).toBeGreaterThan(one.bottom + t.labelPx + t.tickPx);
  });

  it('the plot takes what the legend leaves, never less than its margins and a minimum plot', () => {
    const m = verticalMargins(t, { yTopLines: 1, xLines: 1 });
    expect(plotHeight(700, 100, t, m)).toBe(600);
    expect(plotHeight(200, 150, t, m)).toBeGreaterThan(m.top + m.bottom);
  });

  it('a category axis on the left raises the plot’s floor so each band holds its label’s lines (review Q-R4)', () => {
    const m = verticalMargins(t, { yTopLines: 0, xLines: 1 });
    const range = bandAxisRange(4, 3, t);
    // Three lines, Plot's 1 em apart, and the font box of one: 3.25 em a band.
    expect(range).toBeCloseTo(4.2 * 3.25 * t.tickPx, 9);
    expect(plotHeight(100, 0, t, m, range)).toBeCloseTo(m.top + m.bottom + range, 9);
  });

  it('the chart’s least height is its legend, its margins and the plot’s floor', () => {
    const needs = { titles: { yTopLines: 1, xLines: 1 }, rangeFloor: 0 };
    const legendH = layoutLegend(entries(['A', 'B']), 600, t.tickPx).height;
    const m = verticalMargins(t, needs.titles);
    expect(chartHeightAt(600, t, entries(['A', 'B']), needs)).toBeCloseTo(legendH + m.top + m.bottom + 4 * t.tickPx, 9);
    expect(chartHeightAt(600, t, entries(['A', 'B']), { ...needs, rangeFloor: 1000 })).toBeCloseTo(legendH + m.top + m.bottom + 1000, 9);
  });
});

describe('fitTextScale', () => {
  const titles = () => ({ titles: { yTopLines: 1, xLines: 1 }, rangeFloor: 0 });
  const eight = entries(['Placebo arm', 'Low dose arm', 'Medium dose arm', 'High dose arm', 'Active comparator', 'Open-label extension', 'Standard of care', 'Waitlist control']);
  it('keeps full size when the legend, margins and plot fit', () => {
    expect(fitTextScale({ widthPx: 980, heightPx: 680 }, PX_PER_PT, entries(['A', 'B']), titles)).toBe(1);
  });
  it('scales down, not below the minimums, when the legend does not fit at full size', () => {
    const s = fitTextScale({ widthPx: 580, heightPx: 430 }, PX_PER_PT, eight, titles);
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThanOrEqual(minTextScale());
  });
  it('stops at the minimums when even they do not fit', () => {
    expect(fitTextScale({ widthPx: 380, heightPx: 230 }, PX_PER_PT, eight, titles)).toBe(minTextScale());
  });
  it('a box exactly the chart’s least height at the minimums fits at the minimums', () => {
    const tMin = chartText(PX_PER_PT, minTextScale());
    const least = chartHeightAt(380, tMin, eight, titles());
    expect(fitTextScale({ widthPx: 380, heightPx: least }, PX_PER_PT, eight, titles)).toBe(minTextScale());
    expect(fitTextScale({ widthPx: 380, heightPx: least - 0.4 }, PX_PER_PT, eight, titles)).toBe(minTextScale());
  });
});
