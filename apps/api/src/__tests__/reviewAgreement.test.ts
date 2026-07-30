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
});
