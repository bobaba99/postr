/**
 * Auto-Arrange's choice: where to cut the reading order into columns, and
 * how wide each column is. A port of the `arrange()` function of the
 * owner-approved prototype (docs/fixes/28-auto-arrange-lab.html), in the
 * same units (inches), the same arithmetic and the same search order, so
 * that given the same block heights both choose the same layout
 * (docs/fixes/28-auto-arrange.md; scripts/auto-arrange-check.mjs compares
 * them in the browser).
 *
 * Fixed: the body's width and height, the gaps, the reading order, every
 * block's height at a given width (the caller measures it). Chosen: the
 * cut points that split the reading order into k consecutive columns (a
 * block may move to the next or previous column, never out of order) and
 * the column widths (each between `minWidth` and 1.6 × equal, summing to
 * the body width, on a ¼ in grid, ½ in for 4 or more columns).
 *
 *   F = 1000·O + U + keep·moved + equal·Σ|w − w̄|
 *   O = Σ w_c · max(0, H_c − H_b)   area past the bottom margin, in in²
 *   U = Σ (H_b − H_c)²              how unevenly the white space is spread
 *
 * For each width set, a dynamic program finds the best cut points exactly;
 * the lowest F over all width sets wins (ties: the first found). Equal
 * widths are always tried, even when outside the bounds.
 *
 * Then, beyond the prototype, the widths are refined (`refineColumns`, 2 to
 * 4 columns; record 28 §9, review finding B-R3): every width set whose
 * first k − 1 widths are within ±0.5 in of the centre, in 0.05 in steps
 * (the first column's offset outermost; the last column takes the rest;
 * every width inside the bounds), with its own best cut points; a lower F
 * replaces the grid's choice, a tie keeps it. Line breaks fall between the
 * ¼ in steps: on the welcome poster this takes the area past the margin from
 * 30.35 to 24.39 in² in Chromium and from 32.67 to 24.63 in² in Firefox, the
 * least on the whole 0.05 in grid in both; ±0.25 in reached 30.90 in Firefox
 * (MEASURED, scripts/auto-arrange-check.mjs; record 28 §9).
 *
 * The centre is the grid's (or equal) width set with the lowest score
 * leaving out the keep term, 1000·O + U + equal·Σ|w − w̄|: it does not depend
 * on where the blocks are now, so a second press searches the same width
 * sets and, given the same heights, the layout the first chose stays the
 * best (a block's move to the first press's column and on from there costs
 * at least the move straight there; record 28 §7 B).
 *
 * Beyond the prototype (it offered 2, 3 and 4 columns): 1 column is the
 * body's width; 5 or more columns search the same way, nested, and when the
 * search would try more than MAX_WIDTH_SETS width sets the columns stay
 * equal (a bound on the time a click can take; record 28 §10).
 */

/** The prototype's default: the cost of moving one block to another column. */
export const KEEP = 8;
/** The prototype's default: the cost of each inch a width moves from equal. */
export const EQUAL = 2;
/** Gap between blocks and between columns, in inches (`GAP` = 6 units). */
export const GAP_IN = 0.6;
/** Search bound for 5+ columns: past it, equal widths only. */
export const MAX_WIDTH_SETS = 20000;
/** The refinement's reach either side of its centre's widths, and its step (in). */
export const REFINE_RADIUS = 0.5;
export const REFINE_STEP = 0.05;

export interface ColumnSearch {
  /** Number of blocks, in reading order. */
  n: number;
  /** Number of columns. */
  k: number;
  /** Sum of the column widths: the body's width less the gaps between columns (in). */
  bodyWidth: number;
  /** Height of the body, from under the header to the bottom margin (in). */
  bodyHeight: number;
  /** The width a body line holds 40 characters at, padding included (in). */
  lineMin: number;
  /** The widest table's minimum width (in), 0 without tables. */
  tableMin: number;
  /** The column each block sits in now, 0-based. */
  wasIn: readonly number[];
  /** Block i's height at width w, both in inches. */
  heightAt: (i: number, w: number) => number;
}

export interface PlannedColumn {
  /** Column width (in). */
  w: number;
  /** Block indices, in reading order. */
  idx: number[];
  /** Column height, gaps included (in). */
  H: number;
  /** Area past the bottom margin (in²). */
  over: number;
}

export interface ColumnPlan {
  cols: PlannedColumn[];
  /** Σ over: area past the bottom margin (in²). */
  O: number;
  U: number;
  moved: number;
  /** Σ |w − w̄| (in). */
  dev: number;
  F: number;
  /** Width sets searched. */
  evaluated: number;
  wMin: number;
  wMax: number;
  wEq: number;
  /** The refinement's centre: the width set with the lowest score without the keep term. */
  centre: number[];
}

/** The widths to try, in the order the prototype tries them. */
export function widthSets(s: Pick<ColumnSearch, 'k' | 'bodyWidth' | 'lineMin' | 'tableMin'>): {
  sets: number[][];
  wMin: number;
  wMax: number;
  wEq: number;
} {
  const { k } = s;
  const wEq = s.bodyWidth / k;
  const wMin = Math.max(wEq * 0.6, s.lineMin, s.tableMin);
  const wMax = wEq * 1.6;
  const sets: number[][] = [];
  if (wMin <= wMax && k >= 2) {
    const step = k >= 4 ? 0.5 : 0.25;
    const grid: number[] = [];
    for (let w = Math.ceil(wMin / step) * step; w <= wMax + 1e-9; w += step) grid.push(+w.toFixed(3));
    if (k === 2) for (const a of grid) sets.push([a, +(s.bodyWidth - a).toFixed(3)]);
    else if (k === 3) for (const a of grid) for (const b of grid) sets.push([a, b, +(s.bodyWidth - a - b).toFixed(3)]);
    else if (k === 4) {
      for (const a of grid) for (const b of grid) for (const c of grid) sets.push([a, b, c, +(s.bodyWidth - a - b - c).toFixed(3)]);
    } else if (grid.length ** (k - 1) <= MAX_WIDTH_SETS) {
      const walk = (prefix: number[]) => {
        if (prefix.length === k - 1) {
          sets.push([...prefix, +(s.bodyWidth - prefix.reduce((x, y) => x + y, 0)).toFixed(3)]);
          return;
        }
        for (const a of grid) walk([...prefix, a]);
      };
      walk([]);
    }
  }
  return { sets, wMin, wMax, wEq };
}

/** The dynamic program and the score, for one search's heights; `keep` is the cost of a moved block. */
function searcher(s: ColumnSearch, wEq: number, keep = KEEP) {
  const { n, k, bodyHeight: Hb } = s;
  // Per width: every block's height and the running sums, so a column's
  // height is O(1). Keyed to a thousandth of an inch, as the prototype does.
  const byWidth = new Map<string, Float64Array>();
  const at = (w: number): Float64Array => {
    const key = w.toFixed(3);
    let pref = byWidth.get(key);
    if (!pref) {
      pref = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) pref[i + 1] = pref[i]! + s.heightAt(i, w);
      byWidth.set(key, pref);
    }
    return pref;
  };
  // Blocks before position j whose column now is not c (for the keep term).
  const movedPref = Array.from({ length: k }, (_, c) => {
    const a = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) a[i + 1] = a[i]! + (Math.min(s.wasIn[i]!, k - 1) !== c ? 1 : 0);
    return a;
  });

  const segCost = (c: number, i: number, j: number, w: number) => {
    const pref = at(w);
    const H = pref[j]! - pref[i]! + (j > i ? GAP_IN * (j - i - 1) : 0);
    const over = Math.max(0, H - Hb) * w;
    const moved = movedPref[c]![j]! - movedPref[c]![i]!;
    return { cost: 1000 * over + (Hb - H) ** 2 + keep * moved, H, over, moved };
  };

  const solve = (ws: number[]): number[] => {
    const INF = 1e18;
    const dp = Array.from({ length: k }, () => new Float64Array(n + 1).fill(INF));
    const from = Array.from({ length: k }, () => new Int32Array(n + 1).fill(-1));
    for (let j = 0; j <= n; j++) {
      dp[0]![j] = segCost(0, 0, j, ws[0]!).cost;
      from[0]![j] = 0;
    }
    for (let c = 1; c < k; c++) {
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= j; i++) {
          const v = dp[c - 1]![i]! + segCost(c, i, j, ws[c]!).cost;
          if (v < dp[c]![j]!) {
            dp[c]![j] = v;
            from[c]![j] = i;
          }
        }
      }
    }
    const cuts = new Array<number>(k + 1);
    cuts[k] = n;
    for (let c = k - 1; c >= 1; c--) cuts[c] = from[c]![cuts[c + 1]!]!;
    cuts[0] = 0;
    return cuts;
  };

  const evaluate = (ws: number[], cuts: number[]) => {
    const cols: PlannedColumn[] = [];
    let O = 0;
    let U = 0;
    let moved = 0;
    for (let c = 0; c < k; c++) {
      const seg = segCost(c, cuts[c]!, cuts[c + 1]!, ws[c]!);
      O += seg.over;
      U += (Hb - seg.H) ** 2;
      moved += seg.moved;
      const idx: number[] = [];
      for (let i = cuts[c]!; i < cuts[c + 1]!; i++) idx.push(i);
      cols.push({ w: ws[c]!, idx, H: seg.H, over: seg.over });
    }
    const dev = ws.reduce((a, w) => a + Math.abs(w - wEq), 0);
    return { cols, O, U, moved, dev, F: 1000 * O + U + keep * moved + EQUAL * dev };
  };
  return { solve, evaluate };
}

/** The best cut points and widths on the grid (the prototype's search; see the file's header). */
export function planColumns(s: ColumnSearch): ColumnPlan {
  const { k } = s;
  const { sets, wMin, wMax, wEq } = widthSets(s);
  const { solve, evaluate } = searcher(s, wEq);
  const free = searcher(s, wEq, 0);

  let best: ReturnType<typeof evaluate> | null = null;
  let evaluated = 0;
  // The refinement's centre (see the file's header). A set's score without
  // the keep term is at least its F less KEEP·n, so most sets need no
  // second program.
  let centre: number[] = [];
  let centreScore = Infinity;
  const consider = (ws: number[], force: boolean) => {
    if (!force && ws.some((w) => w < wMin - 1e-9 || w > wMax + 1e-9)) return;
    const e = evaluate(ws, solve(ws));
    evaluated++;
    if (!best || e.F < best.F - 1e-9) best = e;
    if (e.F - KEEP * s.n < centreScore - 1e-9) {
      const g = free.evaluate(ws, free.solve(ws)).F;
      if (g < centreScore - 1e-9) {
        centreScore = g;
        centre = ws;
      }
    }
  };
  for (const ws of sets) consider(ws, false);
  consider(new Array<number>(k).fill(wEq), true);
  const won = best as unknown as ReturnType<typeof evaluate>;
  return { ...won, evaluated, wMin, wMax, wEq, centre };
}

/**
 * The refinement's width sets around `ws` (2 to 4 columns): the first k − 1
 * widths each moved −0.5 to +0.5 in, in 0.05 in steps (the first
 * column's offset outermost), the last column taking the rest; only sets
 * with every width inside [wMin, wMax].
 */
export function refineSets(ws: readonly number[], s: Pick<ColumnSearch, 'k' | 'bodyWidth'>, wMin: number, wMax: number): number[][] {
  const { k } = s;
  if (k < 2 || k > 4) return [];
  const steps = Math.round(REFINE_RADIUS / REFINE_STEP);
  const inside = (w: number) => w >= wMin - 1e-9 && w <= wMax + 1e-9;
  const out: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === k - 1) {
      const set = [...prefix, +(s.bodyWidth - prefix.reduce((a, b) => a + b, 0)).toFixed(3)];
      if (set.every(inside)) out.push(set);
      return;
    }
    for (let d = -steps; d <= steps; d++) walk([...prefix, +(ws[prefix.length]! + d * REFINE_STEP).toFixed(3)]);
  };
  walk([]);
  return out;
}

/** Every width (in) the refinement of `plan` asks a height for, so the caller can measure them in one pass. */
export function refineWidths(s: Pick<ColumnSearch, 'k' | 'bodyWidth'>, plan: ColumnPlan): number[] {
  const keys = new Map<string, number>();
  for (const ws of refineSets(plan.centre, s, plan.wMin, plan.wMax)) {
    for (const w of ws) if (!keys.has(w.toFixed(3))) keys.set(w.toFixed(3), w);
  }
  return [...keys.values()];
}

/** The grid's choice `plan`, refined (see the file's header). */
export function refineColumns(s: ColumnSearch, plan: ColumnPlan): ColumnPlan {
  const { solve, evaluate } = searcher(s, plan.wEq);
  let best: ReturnType<typeof evaluate> = plan;
  let evaluated = plan.evaluated;
  for (const ws of refineSets(plan.centre, s, plan.wMin, plan.wMax)) {
    const e = evaluate(ws, solve(ws));
    evaluated++;
    if (e.F < best.F - 1e-9) best = e;
  }
  return { ...best, evaluated, wMin: plan.wMin, wMax: plan.wMax, wEq: plan.wEq, centre: plan.centre };
}

/**
 * Every width (in) the search can ask a height for, so the caller can
 * measure them all in one pass: the widths of the width sets inside the
 * bounds, and equal.
 */
export function widthsToMeasure(s: Pick<ColumnSearch, 'k' | 'bodyWidth' | 'lineMin' | 'tableMin'>): number[] {
  const { sets, wMin, wMax, wEq } = widthSets(s);
  const keys = new Map<string, number>();
  for (const ws of sets) {
    if (ws.some((w) => w < wMin - 1e-9 || w > wMax + 1e-9)) continue;
    for (const w of ws) if (!keys.has(w.toFixed(3))) keys.set(w.toFixed(3), w);
  }
  if (!keys.has(wEq.toFixed(3))) keys.set(wEq.toFixed(3), wEq);
  return [...keys.values()];
}
