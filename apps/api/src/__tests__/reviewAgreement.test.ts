/**
 * §7.4 agreement metrics — pure functions shared by the Phase-0 analysis
 * CLI and the Milestone-6 pre-ship gate. Exact-value cases only.
 */
import { describe, it, expect } from 'vitest';
import {
  weightedKappa,
  spearmanRho,
  checklistPrf,
  seededCatchRate,
  type ChecklistVerdict,
} from '../review/agreement.js';

describe('weightedKappa (quadratic)', () => {
  it('is 1 for perfect agreement', () => {
    expect(weightedKappa([1, 3, 5, 2], [1, 3, 5, 2], 5)).toBeCloseTo(1, 10);
  });

  it('is 0 when one rater is constant (agreement no better than chance)', () => {
    // Constant rater: expected weighted disagreement equals observed.
    expect(weightedKappa([3, 3, 3, 3], [1, 2, 4, 5], 5)).toBeCloseTo(0, 10);
  });

  it('is negative for systematic disagreement', () => {
    const k = weightedKappa([1, 1, 5, 5], [5, 5, 1, 1], 5);
    expect(k).toBeLessThan(0);
  });

  it('rejects length mismatch', () => {
    expect(() => weightedKappa([1], [1, 2], 5)).toThrow();
  });

  it('rejects empty inputs', () => {
    expect(() => weightedKappa([], [], 5)).toThrow(
      'equal non-empty inputs required',
    );
  });

  it('returns 1 when both raters give one identical constant score', () => {
    expect(weightedKappa([3], [3], 5)).toBe(1);
  });
});

describe('spearmanRho', () => {
  it('is 1 for identical rankings, -1 for reversed', () => {
    expect(spearmanRho([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearmanRho([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it('handles ties with average ranks', () => {
    // a has one tie pair; result must be strictly below 1.
    const rho = spearmanRho([1, 2, 2, 4], [1, 2, 3, 4]);
    expect(rho).toBeGreaterThan(0.9);
    expect(rho).toBeLessThan(1);
  });

  it('returns zero when either ranking is constant', () => {
    expect(spearmanRho([2, 2, 2], [1, 2, 3])).toBe(0);
    expect(spearmanRho([1, 2, 3], [2, 2, 2])).toBe(0);
  });

  it('rejects mismatched and singleton inputs', () => {
    expect(() => spearmanRho([1, 2], [1])).toThrow(
      'equal inputs of length ≥ 2 required',
    );
    expect(() => spearmanRho([1], [1])).toThrow(
      'equal inputs of length ≥ 2 required',
    );
  });
});

describe('checklistPrf (micro-averaged)', () => {
  const categories = ['buried-key-result', 'wall-of-text'] as const;

  it('counts tp/fp/fn exactly', () => {
    const gold = [{ 'buried-key-result': true, 'wall-of-text': false }];
    const pred = [{ 'buried-key-result': true, 'wall-of-text': true }];
    const r = checklistPrf(gold, pred, categories);
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(0);
    expect(r.precision).toBeCloseTo(0.5, 10);
    expect(r.recall).toBeCloseTo(1, 10);
    expect(r.f1).toBeCloseTo(2 / 3, 10);
  });

  it('returns zeros when nothing is flagged anywhere', () => {
    const r = checklistPrf([{ 'buried-key-result': false }], [{ 'buried-key-result': false }], categories);
    expect(r).toMatchObject({ tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 });
  });

  it('counts false negatives even when a predicted row is absent', () => {
    const r = checklistPrf(
      [{ 'buried-key-result': true, 'wall-of-text': true }],
      [],
      categories,
    );
    expect(r).toMatchObject({ tp: 0, fp: 0, fn: 2 });
  });
});

describe('seededCatchRate', () => {
  it('counts only seeded items, skipping strong posters', () => {
    const seeded = ['buried-key-result', null, 'wall-of-text'];
    const pred: ChecklistVerdict[] = [
      { 'buried-key-result': true },
      { 'buried-key-result': true }, // strong poster: ignored even if flagged
      { 'wall-of-text': false },
    ];
    const r = seededCatchRate(seeded, pred);
    expect(r).toEqual({ caught: 1, total: 2, rate: 0.5 });
  });

  it('returns a zero rate when the corpus has no seeded items', () => {
    expect(seededCatchRate([null, null], [{}, {}])).toEqual({
      caught: 0,
      total: 0,
      rate: 0,
    });
  });
});
