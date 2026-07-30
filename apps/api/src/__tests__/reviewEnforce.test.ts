/**
 * enforceFindings — the deterministic half of the output contract
 * (spec §4.5). The prompt ASKS for well-anchored, deduped,
 * economy-biased findings; this module GUARANTEES them:
 *
 *   1. drop findings whose anchor doesn't resolve (D18): block ids
 *      must exist in the PosterDoc (block anchors are postr-only),
 *      region/slide pages must be within 1..pageCount, region bboxes
 *      are clamped to [0,1] and dropped when non-finite;
 *   2. dedupe by anchor-key + action + normalized problem prefix;
 *   3. action-distribution guard: with ≥ 4 findings, 'add' may be at
 *      most half — drop low-severity adds first, then medium;
 *   4. clamp to maxFindings (default REVIEW_MAX_FINDINGS), severity
 *      order high → medium → low, stable within a severity.
 *
 * Pure functions, exact assertions.
 */
import { describe, it, expect } from 'vitest';
import type { ReviewFinding } from '@postr/shared';
import { enforceFindings } from '../review/enforce.js';
import { REVIEW_MAX_FINDINGS } from '../review/config.js';

let seq = 0;
function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  seq += 1;
  return {
    dimension: 'design',
    severity: 'medium',
    category: 'wall-of-text',
    anchor: { kind: 'slide', page: 1 },
    action: 'condense',
    problem: `Problem ${seq}: the methods section is a wall of text.`,
    fix: 'Condense methods to three bullets.',
    example: 'Replace the 180-word methods paragraph with three bullets.',
    ...overrides,
  };
}

function addFinding(severity: ReviewFinding['severity'], problem: string): ReviewFinding {
  return finding({ action: 'add', severity, problem });
}

describe('anchor resolution', () => {
  it('keeps block findings whose blockId resolves and drops the rest', () => {
    const kept = finding({ anchor: { kind: 'block', blockId: 'b1' }, problem: 'kept block' });
    const dropped = finding({ anchor: { kind: 'block', blockId: 'bX' }, problem: 'dropped block' });
    const out = enforceFindings([kept, dropped], { blockIds: new Set(['b1']), pageCount: 1 });
    expect(out).toEqual([kept]);
  });

  it('drops every block anchor when there is no PosterDoc (upload sources, D18)', () => {
    const f = finding({ anchor: { kind: 'block', blockId: 'b1' } });
    expect(enforceFindings([f], { pageCount: 1 })).toEqual([]);
  });

  it.each([0, 2, 1.5, -1])(
    'drops slide/region findings with page %s when pageCount is 1',
    (page) => {
      const slide = finding({ anchor: { kind: 'slide', page } });
      const region = finding({ anchor: { kind: 'region', page, bbox: [0, 0, 0.5, 0.5] } });
      expect(enforceFindings([slide, region], { pageCount: 1 })).toEqual([]);
    },
  );

  it('clamps region bboxes into [0,1] and keeps the finding', () => {
    const f = finding({ anchor: { kind: 'region', page: 1, bbox: [-0.2, 0.4, 1.7, 0.1] } });
    const out = enforceFindings([f], { pageCount: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.anchor).toEqual({ kind: 'region', page: 1, bbox: [0, 0.4, 1, 0.1] });
  });

  it.each([NaN, Infinity, -Infinity])(
    'drops region findings with non-finite bbox value %s',
    (bad) => {
      const f = finding({ anchor: { kind: 'region', page: 1, bbox: [0, bad, 0.5, 0.5] } });
      expect(enforceFindings([f], { pageCount: 1 })).toEqual([]);
    },
  );
});

describe('dedupe', () => {
  // 44 chars — two problems sharing this opener share the 40-char
  // normalized prefix the dedupe key compares.
  const PREFIX = 'the key result is impossible to find because';

  it('drops the later finding when anchor, action, and normalized problem prefix match', () => {
    const a = finding({ problem: `${PREFIX} it sits below the fold.` });
    const b = finding({ problem: `${PREFIX} of the layout choices.` });
    const out = enforceFindings([a, b], { pageCount: 1 });
    expect(out).toEqual([a]);
  });

  it('normalizes case and whitespace before comparing prefixes', () => {
    const a = finding({ problem: 'The   KEY result is impossible to find because X.' });
    const b = finding({ problem: 'the key result is impossible to find because Y.' });
    expect(enforceFindings([a, b], { pageCount: 1 })).toEqual([a]);
  });

  it('keeps findings that share a problem prefix but differ in action or anchor', () => {
    const base = { problem: `${PREFIX} same.` };
    const a = finding({ ...base, action: 'cut' as const });
    const b = finding({ ...base, action: 'condense' as const });
    const c = finding({ ...base, action: 'cut' as const, anchor: { kind: 'slide' as const, page: 2 } });
    const out = enforceFindings([a, b, c], { pageCount: 2 });
    expect(out).toHaveLength(3);
  });
});

describe('add-distribution guard', () => {
  it('does nothing when there are fewer than 4 findings', () => {
    const fs = [addFinding('low', 'add a'), addFinding('low', 'add b'), addFinding('low', 'add c')];
    expect(enforceFindings(fs, { pageCount: 1 })).toHaveLength(3);
  });

  it('drops low-severity adds first until adds are at most half', () => {
    const keep1 = finding({ problem: 'keep 1' });
    const keep2 = finding({ problem: 'keep 2' });
    const addHigh = addFinding('high', 'add high');
    const addMed = addFinding('medium', 'add medium');
    const addLow1 = addFinding('low', 'add low 1');
    const addLow2 = addFinding('low', 'add low 2');
    const out = enforceFindings([keep1, addLow1, addHigh, addLow2, addMed, keep2], {
      pageCount: 1,
    });
    expect(out.map((f) => f.problem).sort()).toEqual([
      'add high',
      'add medium',
      'keep 1',
      'keep 2',
    ]);
  });

  it('keeps exactly 50% adds', () => {
    const fs = [
      finding({ problem: 'keep 1' }),
      finding({ problem: 'keep 2' }),
      addFinding('low', 'add low'),
      addFinding('high', 'add high'),
    ];
    expect(enforceFindings(fs, { pageCount: 1 })).toHaveLength(4);
  });
});

describe('count clamp', () => {
  it('clamps to REVIEW_MAX_FINDINGS high-severity first, stable within a severity', () => {
    const highs = [0, 1, 2].map((i) => finding({ severity: 'high' as const, problem: `high ${i}` }));
    const mediums = Array.from({ length: 8 }, (_, i) =>
      finding({ severity: 'medium' as const, problem: `medium ${i}` }),
    );
    const lows = Array.from({ length: 5 }, (_, i) =>
      finding({ severity: 'low' as const, problem: `low ${i}` }),
    );
    const out = enforceFindings([...lows, ...mediums, ...highs], { pageCount: 1 });
    expect(REVIEW_MAX_FINDINGS).toBe(12);
    expect(out).toHaveLength(REVIEW_MAX_FINDINGS);
    expect(out.map((f) => f.problem)).toEqual([
      'high 0',
      'high 1',
      'high 2',
      'medium 0',
      'medium 1',
      'medium 2',
      'medium 3',
      'medium 4',
      'medium 5',
      'medium 6',
      'medium 7',
      'low 0',
    ]);
  });

  it('respects a maxFindings override', () => {
    const fs = Array.from({ length: 5 }, (_, i) => finding({ problem: `p${i}` }));
    expect(enforceFindings(fs, { pageCount: 1, maxFindings: 2 })).toHaveLength(2);
  });
});

describe('composition (all rules in pipeline order)', () => {
  it('resolves anchors, dedupes, rebalances adds, then clamps', () => {
    const out = enforceFindings(
      [
        addFinding('low', 'add one'), // kept by guard (adds land at exactly 50%)
        finding({
          severity: 'high',
          problem: 'unresolvable',
          anchor: { kind: 'block', blockId: 'gone' }, // dropped: anchor
        }),
        finding({ severity: 'high', problem: 'dup anchor same problem text!!' }),
        finding({ severity: 'high', problem: 'dup anchor same problem text!!' }), // dropped: dedupe
        finding({ severity: 'medium', problem: 'solid medium' }),
        addFinding('high', 'add two'),
      ],
      { blockIds: new Set(['b1']), pageCount: 1 },
    );
    // High severities first (stable), then medium, then low.
    expect(out.map((f) => f.problem)).toEqual([
      'dup anchor same problem text!!',
      'add two',
      'solid medium',
      'add one',
    ]);
  });
});
