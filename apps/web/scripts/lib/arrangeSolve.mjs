/**
 * The harness's own solver for Auto-Arrange's objective (record 28), for
 * scripts/auto-arrange-check.mjs: written from the record's rule table, not
 * from the app's arrangeColumns.ts nor the prototype's arrange(). Its dynamic
 * program comes from record 28's review round 1 probe, which used it to show
 * that the ¼ in grid alone leaves area past the margin a finer width finds
 * (B-R3); the refinement step is the record's rule for it.
 *
 *   F = 1000·O + U + 8·moved + 2·Σ|w − w̄|
 *   O = Σ_c w_c · max(0, H_c − Hb)   U = Σ_c (Hb − H_c)²
 *   H_c = Σ heights at w_c + 0.6 · (blocks in the column − 1)
 *
 * Heights: `h(i, w)` in inches, block i at width w (inches). `keep` (the
 * cost of a block moved to another column) is 8, or 0 for the refinement's
 * centre: the grid's (or equal) width set with the lowest score without it.
 */
export const GAP = 0.6;
export const REFINE_STEP = 0.05;
export const REFINE_RADIUS = 0.5;
const key = (w) => w.toFixed(3);

/** A layout's F and its parts, for widths `ws` and cut points `cuts` (k + 1 of them). */
export function evaluate({ h, Hb, was, wEq }, ws, cuts, keep = 8) {
  let O = 0;
  let U = 0;
  let moved = 0;
  let dev = 0;
  for (let c = 0; c < ws.length; c += 1) {
    let H = 0;
    for (let i = cuts[c]; i < cuts[c + 1]; i += 1) H += h(i, ws[c]);
    if (cuts[c + 1] - cuts[c] > 1) H += GAP * (cuts[c + 1] - cuts[c] - 1);
    O += ws[c] * Math.max(0, H - Hb);
    U += (Hb - H) ** 2;
    for (let i = cuts[c]; i < cuts[c + 1]; i += 1) if (was[i] !== c) moved += 1;
    dev += Math.abs(ws[c] - wEq);
  }
  return { F: 1000 * O + U + keep * moved + 2 * dev, O, U, moved, dev };
}

/** The best cut points for one width set: an exact dynamic program (empty columns allowed). */
export function bestCuts({ h, Hb, was, n }, ws, keep = 8) {
  const k = ws.length;
  const pre = ws.map((w) => {
    const p = new Float64Array(n + 1);
    for (let t = 0; t < n; t += 1) p[t + 1] = p[t] + h(t, w);
    return p;
  });
  const mv = ws.map((_, c) => {
    const a = new Int32Array(n + 1);
    for (let t = 0; t < n; t += 1) a[t + 1] = a[t] + (was[t] !== c ? 1 : 0);
    return a;
  });
  const cost = (c, i, j) => {
    const H = pre[c][j] - pre[c][i] + (j - i > 1 ? GAP * (j - i - 1) : 0);
    return 1000 * ws[c] * Math.max(0, H - Hb) + (Hb - H) ** 2 + keep * (mv[c][j] - mv[c][i]);
  };
  let prev = new Float64Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = cost(0, 0, j);
  const arg = [];
  for (let c = 1; c < k; c += 1) {
    const cur = new Float64Array(n + 1).fill(Infinity);
    const a = new Int32Array(n + 1);
    for (let j = 0; j <= n; j += 1) {
      for (let i = 0; i <= j; i += 1) {
        const v = prev[i] + cost(c, i, j);
        if (v < cur[j]) { cur[j] = v; a[j] = i; }
      }
    }
    arg.push(a);
    prev = cur;
  }
  const cuts = new Array(k + 1);
  cuts[k] = n;
  cuts[0] = 0;
  for (let c = k - 1; c >= 1; c -= 1) cuts[c] = arg[c - 1][cuts[c + 1]];
  return cuts;
}

/**
 * The record's grid: the first k − 1 widths on ¼ in steps (½ in for 4 or
 * more columns) from max(0.6 × equal, line, table) to 1.6 × equal, the last
 * column taking the rest, only sets with every width inside those bounds;
 * then equal widths, always. `step` overrides the grid's step (`--fine`:
 * the whole 0.05 in grid, to see how far the refinement is from its least).
 */
export function gridSets({ BW, k, wMin, wMax }, step = k >= 4 ? 0.5 : 0.25) {
  const grid = [];
  for (let i = Math.ceil(wMin / step - 1e-9); i * step <= wMax + 1e-9; i += 1) grid.push(Number((i * step).toFixed(3)));
  const inside = (w) => w >= wMin - 1e-9 && w <= wMax + 1e-9;
  const out = [];
  const walk = (prefix) => {
    if (prefix.length === k - 1) {
      const last = Number((BW - prefix.reduce((a, b) => a + b, 0)).toFixed(3));
      if (inside(last)) out.push([...prefix, last]);
      return;
    }
    for (const w of grid) walk([...prefix, w]);
  };
  if (k >= 2 && wMin <= wMax) walk([]);
  out.push(new Array(k).fill(BW / k));
  return out;
}

/** The layout with the lowest F over `sets`, each with its best cut points. */
export function bestOver(ctx, sets) {
  let best = null;
  for (const ws of sets) {
    const cuts = bestCuts(ctx, ws);
    const e = evaluate(ctx, ws, cuts);
    if (!best || e.F < best.F - 1e-9) best = { ws, cuts, ...e };
  }
  return best;
}

/** The refinement's centre: the set of `sets` with the lowest score without the keep term (ties: the first). */
export function centreOf(ctx, sets) {
  let best = null;
  for (const ws of sets) {
    const F = evaluate(ctx, ws, bestCuts(ctx, ws, 0), 0).F;
    if (!best || F < best.F - 1e-9) best = { ws, F };
  }
  return best.ws;
}

/**
 * The record's refinement neighbourhood of a width set `ws` (2 to 4
 * columns): the first k − 1 widths each moved by −0.5 to +0.5 in, in
 * 0.05 in steps (the first column's offset outermost), the last column
 * taking the rest; only sets with every width inside [wMin, wMax].
 */
export function neighbourhood({ ws, BW, wMin, wMax }) {
  const k = ws.length;
  if (k < 2 || k > 4) return [];
  const steps = Math.round(REFINE_RADIUS / REFINE_STEP);
  const inside = (w) => w >= wMin - 1e-9 && w <= wMax + 1e-9;
  const out = [];
  const walk = (prefix) => {
    if (prefix.length === k - 1) {
      const last = Number((BW - prefix.reduce((a, b) => a + b, 0)).toFixed(3));
      if ([...prefix, last].every(inside)) out.push([...prefix, last]);
      return;
    }
    const base = ws[prefix.length];
    for (let d = -steps; d <= steps; d += 1) walk([...prefix, Number((base + d * REFINE_STEP).toFixed(3))]);
  };
  walk([]);
  return out;
}

/** Every width (inches) the neighbourhood of `ws` needs a height at. */
export function neighbourhoodWidths(args) {
  const seen = new Map();
  for (const ws of neighbourhood(args)) for (const w of ws) seen.set(key(w), w);
  return [...seen.values()];
}

/**
 * Refine a grid choice `start` ({ ws, cuts }) by the record's rule: every
 * set of the neighbourhood of `centre` with its own best cut points; a
 * lower F by more than 1e-9 replaces the best so far (a tie keeps the
 * grid's choice).
 */
export function refine(ctx, start, centre, bounds) {
  let best = { ws: start.ws, cuts: start.cuts, ...evaluate(ctx, start.ws, start.cuts) };
  let tried = 0;
  for (const ws of neighbourhood({ ws: centre, ...bounds })) {
    const cuts = bestCuts(ctx, ws);
    const e = evaluate(ctx, ws, cuts);
    tried += 1;
    if (e.F < best.F - 1e-9) best = { ws, cuts, ...e };
  }
  return { ...best, tried };
}
