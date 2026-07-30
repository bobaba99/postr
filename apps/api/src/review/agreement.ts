/**
 * §7.4 inter-rater agreement metrics (Gavin vs checker, later: expert
 * panel). Pure and deterministic — the Phase-0 analysis CLI and the
 * pre-ship gate (Task 28) both consume these, so agreement numbers are
 * always computed the same way.
 */

/** Quadratic-weighted Cohen's kappa for ordinal scores (e.g. 1–5). */
export function weightedKappa(a: number[], b: number[], levels = 5): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error('weightedKappa: equal non-empty inputs required');
  }
  const n = a.length;
  const norm = (levels - 1) ** 2;
  const histA = new Array<number>(levels).fill(0);
  const histB = new Array<number>(levels).fill(0);
  let observed = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    histA[x - 1]!++;
    histB[y - 1]!++;
    observed += ((x - y) ** 2) / norm;
  }
  observed /= n;
  let expected = 0;
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      expected += (histA[i]! / n) * (histB[j]! / n) * (((i - j) ** 2) / norm);
    }
  }
  if (expected === 0) return observed === 0 ? 1 : 0;
  return 1 - observed / expected;
}

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
  const r = new Array<number>(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.x === order[i]!.x) j++;
    const avg = (i + j) / 2 + 1; // average rank, 1-based
    for (let k = i; k <= j; k++) r[order[k]!.i] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho with average ranks for ties. */
export function spearmanRho(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) {
    throw new Error('spearmanRho: equal inputs of length ≥ 2 required');
  }
  return pearson(ranks(a), ranks(b));
}

/** Per-poster map of issue-category → present. */
export interface ChecklistVerdict {
  [category: string]: boolean;
}

export interface Prf {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

/** Micro-averaged precision/recall/F1 over all (poster, category) cells. */
export function checklistPrf(
  gold: ChecklistVerdict[],
  predicted: ChecklistVerdict[],
  categories: readonly string[],
): Prf {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < gold.length; i++) {
    for (const c of categories) {
      const g = gold[i]?.[c] === true;
      const p = predicted[i]?.[c] === true;
      if (g && p) tp++;
      else if (!g && p) fp++;
      else if (g && !p) fn++;
    }
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/**
 * §7.4 lens 2b: of the posters seeded with a known ground-truth issue
 * (manifest.seededIssue, null for strong posters), what fraction did the
 * checker flag?
 */
export function seededCatchRate(
  seededIssues: Array<string | null>,
  predicted: ChecklistVerdict[],
): { caught: number; total: number; rate: number } {
  let caught = 0;
  let total = 0;
  seededIssues.forEach((issue, i) => {
    if (issue === null) return;
    total++;
    if (predicted[i]?.[issue] === true) caught++;
  });
  return { caught, total, rate: total === 0 ? 0 : caught / total };
}
