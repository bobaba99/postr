/**
 * A brute-force Auto-Arrange for tests (record 28), written from the
 * record's rule table, not from arrangeColumns.ts: every width set on the
 * grid (¼ in, ½ in for 4+ columns; each width between max(0.6 × equal,
 * line, table) and 1.6 × equal; the last column takes the rest), plus equal
 * widths, and every way to cut the reading order into k consecutive
 * columns; the lowest F = 1000·O + U + 8·moved + 2·Σ|w − w̄| wins
 * (`oracleBest`). Then the refinement (`oracleRefined`, 2 to 4 columns):
 * the centre is the grid's (or equal) width set with the lowest score
 * without the keep term (1000·O + U + 2·Σ|w − w̄|, over every cut); every
 * width set whose first k − 1 widths are within ±0.5 in of the centre's,
 * in 0.05 in steps, inside the bounds, with every cut; a lower F than the
 * grid's choice wins, a tie keeps it.
 * Exponential: for a handful of blocks only.
 */
export interface OracleInput {
  k: number;
  /** Sum of the column widths (in). */
  bodyWidth: number;
  /** Body height (in). */
  bodyHeight: number;
  /** Lower bound from text lines and tables (in). */
  minWidth: number;
  /** The column each block is in now. */
  wasIn: readonly number[];
  /** Block i's height (in) at width w (in). */
  heightAt: (i: number, w: number) => number;
}

export interface OracleBest {
  F: number;
  O: number;
  ws: number[];
  cuts: number[];
}

function cutsOf(n: number, k: number): number[][] {
  if (k === 1) return [[0, n]];
  const out: number[][] = [];
  for (let j = 0; j <= n; j++) for (const rest of cutsOf(n - j, k - 1)) out.push([0, ...rest.map((x) => x + j)]);
  return out;
}

function gridSets(o: OracleInput): number[][] {
  const wEq = o.bodyWidth / o.k;
  const lo = Math.max(0.6 * wEq, o.minWidth);
  const hi = 1.6 * wEq;
  const step = o.k >= 4 ? 0.5 : 0.25;
  const grid: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) grid.push(i * step);
  const out: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === o.k - 1) {
      const last = o.bodyWidth - prefix.reduce((a, b) => a + b, 0);
      if (last >= lo - 1e-9 && last <= hi + 1e-9) out.push([...prefix, last]);
      return;
    }
    for (const w of grid) walk([...prefix, w]);
  };
  if (o.k >= 2 && lo <= hi) walk([]);
  out.push(new Array(o.k).fill(wEq));
  return out;
}

/** The lowest F (with `keep` per moved block) over `sets` and every cut, starting from `best`. */
function bruteOver(o: OracleInput, sets: number[][], start: OracleBest, keep = 8): OracleBest {
  const n = o.wasIn.length;
  const wEq = o.bodyWidth / o.k;
  let best = start;
  for (const ws of sets) {
    for (const cuts of cutsOf(n, o.k)) {
      let O = 0;
      let U = 0;
      let moved = 0;
      for (let c = 0; c < o.k; c++) {
        let H = 0;
        for (let i = cuts[c]!; i < cuts[c + 1]!; i++) {
          H += o.heightAt(i, ws[c]!) + (i > cuts[c]! ? 0.6 : 0);
          if (o.wasIn[i] !== c) moved += 1;
        }
        O += Math.max(0, H - o.bodyHeight) * ws[c]!;
        U += (o.bodyHeight - H) ** 2;
      }
      const F = 1000 * O + U + keep * moved + 2 * ws.reduce((a, w) => a + Math.abs(w - wEq), 0);
      if (F < best.F - 1e-9) best = { F, O, ws, cuts };
    }
  }
  return best;
}

/** The lowest F on the grid (the prototype's search). */
export function oracleBest(o: OracleInput): OracleBest {
  return bruteOver(o, gridSets(o), { F: Infinity, O: Infinity, ws: [], cuts: [] });
}

/** Width sets within ±0.5 in of `ws` in 0.05 in steps, the last taking the rest, inside the bounds. */
export function oracleNeighbourhood(o: OracleInput, ws: number[]): number[][] {
  if (o.k < 2 || o.k > 4) return [];
  const wEq = o.bodyWidth / o.k;
  const lo = Math.max(0.6 * wEq, o.minWidth);
  const hi = 1.6 * wEq;
  const out: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === o.k - 1) {
      const all = [...prefix, o.bodyWidth - prefix.reduce((a, b) => a + b, 0)];
      if (all.every((w) => w >= lo - 1e-9 && w <= hi + 1e-9)) out.push(all);
      return;
    }
    for (let d = -10; d <= 10; d++) walk([...prefix, ws[prefix.length]! + d * 0.05]);
  };
  walk([]);
  return out;
}

/** The refinement's centre: the grid's (or equal) width set with the lowest score without the keep term. */
export function oracleCentre(o: OracleInput): number[] {
  return bruteOver(o, gridSets(o), { F: Infinity, O: Infinity, ws: [], cuts: [] }, 0).ws;
}

/** The grid's choice, then refined (see the file's header). */
export function oracleRefined(o: OracleInput): OracleBest {
  return bruteOver(o, oracleNeighbourhood(o, oracleCentre(o)), oracleBest(o));
}
