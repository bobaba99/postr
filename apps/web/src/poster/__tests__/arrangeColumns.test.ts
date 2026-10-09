/**
 * Record 28 — Auto-Arrange's choice of cut points and widths
 * (arrangeColumns.ts, a port of the approved prototype's arrange()).
 *
 * The oracle is a brute force written from the record's objective
 * (arrangeOracle.ts), F = 1000·O + U + 8·moved + 2·Σ|w − w̄|: every width set
 * on the grid and every way to cut the reading order into k consecutive
 * columns. The dynamic program must find the same lowest F. The browser harness
 * (scripts/auto-arrange-check.mjs, G8) compares with the prototype itself.
 * Re-run: npx vitest run src/poster/__tests__/arrangeColumns.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_WIDTH_SETS, planColumns, refineColumns, refineWidths, widthSets, widthsToMeasure, type ColumnSearch,
} from '../arrangeColumns';
import { oracleBest, oracleCentre, oracleRefined } from './arrangeOracle';

/** A text block: area / width + padding, like wrapped text. */
const textOf = (area: number, pad = 0.3) => (w: number) => area / w + pad;
/** A figure: keeps its shape, plus a caption. */
const figureOf = (aspect: number, caption = 0.8) => (w: number) => w / aspect + caption;

/** The brute force's answer for a search (arrangeOracle.ts). */
const oracleOf = (s: ColumnSearch) =>
  ({ k: s.k, bodyWidth: s.bodyWidth, bodyHeight: s.bodyHeight, minWidth: Math.max(s.lineMin, s.tableMin), wasIn: s.wasIn, heightAt: s.heightAt });
const bruteBest = (s: ColumnSearch) => oracleBest(oracleOf(s));

const sample = (k: number, heights: Array<(w: number) => number>, wasIn: number[], bodyHeight = 26): ColumnSearch => ({
  n: heights.length, k, bodyWidth: 46 - (k - 1) * 0.6, bodyHeight, lineMin: 9.7, tableMin: 0, wasIn,
  heightAt: (i, w) => heights[i]!(w),
});

describe('the dynamic program finds the lowest F over every cut and width', () => {
  it('2 columns, 6 blocks', () => {
    const s = sample(2, [textOf(30), textOf(120), figureOf(1.33), textOf(60), textOf(200), figureOf(1.78)], [0, 0, 0, 1, 1, 1]);
    const plan = planColumns(s);
    const best = bruteBest(s);
    expect(plan.F).toBeCloseTo(best.F, 3);
    expect(plan.cols.map((c) => c.w)).toEqual(best.ws.map((w) => +w.toFixed(3)));
  });

  it('3 columns, 7 blocks', () => {
    const s = sample(3, [textOf(20), textOf(90), textOf(20), figureOf(1.2), textOf(20), textOf(140), textOf(50)], [0, 0, 0, 1, 1, 2, 2]);
    expect(planColumns(s).F).toBeCloseTo(bruteBest(s).F, 3);
  });

  it('3 columns that cannot fit: O is the least area past the margin', () => {
    const s = sample(3, [textOf(400), textOf(400), textOf(400), textOf(400)], [0, 1, 2, 2], 20);
    const plan = planColumns(s);
    expect(plan.O).toBeGreaterThan(0);
    expect(plan.F).toBeCloseTo(bruteBest(s).F, 3);
    expect(plan.O).toBeCloseTo(bruteBest(s).O, 3);
  });

  it('a column may be left empty, as in the prototype', () => {
    // Figures that cannot fit: area past the margin grows with the square of
    // a column's width, so the least puts them in the narrow columns.
    const s = sample(3, [figureOf(0.7), figureOf(0.7), figureOf(0.7), figureOf(0.7)], [0, 0, 1, 2], 14);
    const plan = planColumns(s);
    const best = bruteBest(s);
    const sizes = (cuts: number[]) => cuts.slice(1).map((c, i) => c - cuts[i]!);
    // The widest column is left empty: the last one, not only the first may be.
    expect(sizes(best.cuts)).toEqual([3, 1, 0]);
    expect(plan.cols.map((c) => c.idx.length)).toEqual([3, 1, 0]);
    expect(plan.F).toBeCloseTo(best.F, 3);
  });

  it('4 columns search a ½ in grid', () => {
    const s = sample(4, [textOf(40), textOf(60), textOf(40), textOf(80), textOf(30)], [0, 1, 2, 3, 3]);
    const { sets } = widthSets(s);
    const steps = new Set(sets.flatMap((ws) => ws.slice(0, 3)).map((w) => Math.round((w % 0.5) * 1000)));
    expect([...steps]).toEqual([0]);
    expect(planColumns(s).F).toBeCloseTo(bruteBest(s).F, 3);
  });
});

describe('the rules around the search', () => {
  it('columns keep the reading order: every block once, in order', () => {
    const s = sample(3, Array.from({ length: 9 }, (_, i) => textOf(20 + 15 * i)), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const idx = planColumns(s).cols.flatMap((c) => c.idx);
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('widths stay between max(0.6 × equal, 40 characters, a table) and 1.6 × equal, and sum to the body', () => {
    const s = { ...sample(3, [textOf(50), textOf(80), textOf(20)], [0, 1, 2]), tableMin: 11 };
    const plan = planColumns(s);
    expect(plan.wMin).toBe(11);
    // 40 characters (9.7 in) bind over 0.6 × equal (8.96 in) without the table.
    expect(planColumns({ ...s, tableMin: 0 }).wMin).toBe(9.7);
    for (const c of plan.cols) {
      expect(c.w).toBeGreaterThanOrEqual(plan.wMin - 1e-9);
      expect(c.w).toBeLessThanOrEqual(plan.wMax + 1e-9);
    }
    expect(plan.cols.reduce((a, c) => a + c.w, 0)).toBeCloseTo(s.bodyWidth, 6);
  });

  it('equal widths are tried even when the bounds leave no width set', () => {
    const s = { ...sample(3, [textOf(50), textOf(80), textOf(20)], [0, 1, 2]), tableMin: 30 };
    const plan = planColumns(s);
    expect(plan.evaluated).toBe(1);
    expect(plan.cols.map((c) => c.w)).toEqual([s.bodyWidth / 3, s.bodyWidth / 3, s.bodyWidth / 3]);
  });

  it('equal widths are tried too, and win when width changes nothing else', () => {
    // Heights that do not depend on width: only Σ|w − w̄| tells width sets apart.
    const s = sample(3, [() => 5, () => 7, () => 6], [0, 1, 2]);
    const wEq = s.bodyWidth / 3;
    expect(widthSets(s).sets.length).toBeGreaterThan(0);
    expect(planColumns(s).cols.map((c) => c.w)).toEqual([wEq, wEq, wEq]);
  });

  it('one column is the body width', () => {
    const s = sample(1, [textOf(50), textOf(80)], [0, 0]);
    const plan = planColumns(s);
    expect(plan.cols).toHaveLength(1);
    expect(plan.cols[0]!.w).toBe(s.bodyWidth);
  });

  it('5 columns search the same nested grid; past the bound they stay equal', () => {
    const five = { ...sample(5, Array.from({ length: 7 }, () => textOf(30)), [0, 1, 2, 3, 4, 4, 4]), bodyWidth: 40, lineMin: 7.5 };
    // wMin 7.5, wMax 12.8, a ½ in grid: 11 widths for each of the first four columns.
    expect(widthSets(five).sets).toHaveLength(11 ** 4);
    expect(11 ** 4).toBeLessThanOrEqual(MAX_WIDTH_SETS);
    expect(planColumns(five).evaluated).toBeGreaterThan(1);
    const six = { ...sample(6, Array.from({ length: 6 }, () => textOf(30)), [0, 1, 2, 3, 4, 5]), bodyWidth: 120, lineMin: 0 };
    expect(widthSets(six).sets).toEqual([]);
    expect(planColumns(six).evaluated).toBe(1);
  });

  it('every width the search asks a height for is measured up front', () => {
    const asked = new Set<string>();
    const s = sample(3, [textOf(50), textOf(80), figureOf(1.4), textOf(20)], [0, 1, 1, 2]);
    planColumns({ ...s, heightAt: (i, w) => { asked.add(w.toFixed(3)); return s.heightAt(i, w); } });
    const measured = new Set(widthsToMeasure(s).map((w) => w.toFixed(3)));
    expect([...asked].filter((w) => !measured.has(w))).toEqual([]);
  });

});

describe('the widths refined in 0.05 in steps (record 28 §9, B-R3)', () => {
  // Text that wraps in whole lines of 1 in, 19 lines to the column: a width
  // a little over a line break is a line shorter. Block B (294.5 / w lines)
  // runs one line past the margin from 14.725 in to 15.5 in, two below
  // that; the least overflow is B one line over in the narrowest column
  // that keeps it to one: 14.75 in, between the ¼ in widths 14.65 (two
  // lines over) and 14.9.
  const lines = (chars: number) => (w: number) => Math.ceil(chars / w);
  const twoColumns: ColumnSearch = {
    n: 2, k: 2, bodyWidth: 31.4, bodyHeight: 19, lineMin: 9.7, tableMin: 0, wasIn: [0, 1],
    heightAt: (i, w) => [lines(300), lines(294.5)][i]!(w),
  };

  it('finds less area past the margin than the ¼ in grid alone, and the least over the refinement', () => {
    const grid = planColumns(twoColumns);
    const refined = refineColumns(twoColumns, grid);
    expect(grid.O).toBeCloseTo(14.9, 6);
    expect(grid.cols.map((c) => c.w)).toEqual([16.5, 14.9]);
    expect(refined.O).toBeCloseTo(14.75, 6);
    expect(refined.cols.map((c) => c.w)).toEqual([16.65, 14.75]);
    const best = oracleRefined(oracleOf(twoColumns));
    expect(refined.F).toBeCloseTo(best.F, 6);
    expect(refined.cols.map((c) => c.w)).toEqual(best.ws.map((w) => +w.toFixed(3)));
  });

  it('reaches ±0.5 in: a width 0.4 in from the centre (Firefox’s welcome poster needed ±0.5, record 28 §9)', () => {
    // Three blocks of whole 1 in lines, 15 to the column; found by a search
    // of random posters. ±0.25 in reaches 105.75 in² past the margin; ±0.5 in
    // reaches 104.70, its second column 0.4 in wider than the centre's.
    const chars = [352.29, 216.42, 205.81];
    const s: ColumnSearch = {
      n: 3, k: 3, bodyWidth: 44.8, bodyHeight: 15, lineMin: 9.34, tableMin: 0, wasIn: [0, 1, 2],
      heightAt: (i, w) => Math.ceil(chars[i]! / w),
    };
    const grid = planColumns(s);
    const refined = refineColumns(s, grid);
    expect(grid.centre).toEqual([23.5, 11, 10.3]);
    expect(refined.O).toBeCloseTo(104.7, 6);
    expect(refined.cols.map((c) => c.w)).toEqual([23.55, 11.4, 9.85]);
    expect(refined.F).toBeCloseTo(oracleRefined(oracleOf(s)).F, 6);
  });

  it('is never worse than the grid, keeps the bounds and the body width, and stays within ±0.5 in', () => {
    const s = sample(3, [textOf(20), textOf(90), textOf(20), figureOf(1.2), textOf(20), textOf(140), textOf(50)], [0, 0, 0, 1, 1, 2, 2], 18);
    const grid = planColumns(s);
    const refined = refineColumns(s, grid);
    expect(refined.F).toBeLessThanOrEqual(grid.F + 1e-9);
    expect(refined.F).toBeCloseTo(oracleRefined(oracleOf(s)).F, 3);
    refined.cols.forEach((c, i) => {
      expect(c.w).toBeGreaterThanOrEqual(grid.wMin - 1e-9);
      expect(c.w).toBeLessThanOrEqual(grid.wMax + 1e-9);
      if (i < 2) expect(Math.abs(c.w - grid.centre[i]!)).toBeLessThanOrEqual(0.5 + 1e-9);
    });
    expect(refined.cols.reduce((a, c) => a + c.w, 0)).toBeCloseTo(s.bodyWidth, 6);
    expect(refined.cols.flatMap((c) => c.idx)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('its centre is the width set with the lowest score without the keep term, wherever the blocks are now', () => {
    const heights = [textOf(20), textOf(90), textOf(20), figureOf(1.2), textOf(20), textOf(140), textOf(50)];
    for (const wasIn of [[0, 0, 0, 1, 1, 2, 2], [2, 2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 1]]) {
      const s = sample(3, heights, wasIn, 18);
      expect(planColumns(s).centre).toEqual(oracleCentre(oracleOf(s)).map((w) => +w.toFixed(3)));
    }
  });

  it('it searches the same widths wherever the blocks are now, so a second press finds the same layout', () => {
    // Three equal blocks in two columns: which column holds two of them is
    // what the blocks' columns now decide (the keep term), and with it the
    // grid's choice of widths; the refinement must not follow it.
    const base = sample(2, [textOf(60), textOf(60), textOf(60)], [0, 0, 1], 40);
    const run = (wasIn: number[]) => {
      const asked = new Set<string>();
      const s = { ...base, wasIn, heightAt: (i: number, w: number) => { asked.add(w.toFixed(3)); return base.heightAt(i, w); } };
      const grid = planColumns(s);
      asked.clear();
      refineColumns(s, grid);
      return { choice: grid.cols.map((c) => c.w), asked: [...asked].sort() };
    };
    const a = run([0, 0, 1]);
    const b = run([0, 1, 1]);
    expect(a.choice).not.toEqual(b.choice);
    expect(a.asked).toEqual(b.asked);
  });

  it('a tie keeps the grid’s choice', () => {
    // Heights that do not depend on width: no width set beats the grid's.
    const s = sample(3, [() => 5, () => 7, () => 6], [0, 1, 2]);
    const grid = planColumns(s);
    expect(refineColumns(s, grid).cols.map((c) => c.w)).toEqual(grid.cols.map((c) => c.w));
  });

  it('1 column and 5 or more columns are not refined', () => {
    const one = sample(1, [textOf(50), textOf(80)], [0, 0]);
    expect(refineWidths(one, planColumns(one))).toEqual([]);
    const five = { ...sample(5, Array.from({ length: 7 }, () => textOf(30)), [0, 1, 2, 3, 4, 4, 4]), bodyWidth: 40, lineMin: 7.5 };
    const grid = planColumns(five);
    expect(refineWidths(five, grid)).toEqual([]);
    expect(refineColumns(five, grid).evaluated).toBe(grid.evaluated);
  });

  it('every width the refinement asks a height for is measured up front', () => {
    const asked = new Set<string>();
    const s = sample(3, [textOf(50), textOf(80), figureOf(1.4), textOf(20)], [0, 1, 1, 2]);
    const grid = planColumns(s);
    refineColumns({ ...s, heightAt: (i, w) => { asked.add(w.toFixed(3)); return s.heightAt(i, w); } }, grid);
    const measured = new Set([...widthsToMeasure(s), ...refineWidths(s, grid)].map((w) => w.toFixed(3)));
    expect([...asked].filter((w) => !measured.has(w))).toEqual([]);
  });
});
