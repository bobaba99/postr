/**
 * review/signals.ts — deterministic grounding numbers (spec §4.4).
 * Exact-value cases only: these numbers go into the prompt verbatim, so
 * any counting drift is a prompt drift.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReviewSignals,
  type SignalBlock,
} from '../review/signals.js';

const POSTER: SignalBlock[] = [
  { id: 't1', type: 'title', content: 'A <b>bold</b> claim' },
  { id: 'h1', type: 'heading', content: 'Results' },
  {
    id: 'x1',
    type: 'text',
    content:
      '<p>One two <strong>three</strong> four.</p><p>Five <em>six</em> <mark>seven</mark>.</p>',
  },
  { id: 'x2', type: 'text', content: 'Eight nine ten' },
  { id: 'f1', type: 'image', content: null },
  { id: 'f2', type: 'chart', content: '' },
  { id: 'tb', type: 'table', content: '<td>cell one</td><td>cell two</td>' },
  { id: 'lg', type: 'logo', content: null },
];

describe('computeReviewSignals', () => {
  it('computes exact values on a synthetic poster', () => {
    expect(computeReviewSignals(POSTER)).toEqual({
      emphasisRunCount: 4,
      boldRuns: 2,
      italicRuns: 1,
      highlightRuns: 1,
      figureBlockCount: 2,
      tableBlockCount: 1,
      textBlockCount: 2,
      totalWordCount: 18,
      figureToTextRatio: 1,
    });
  });

  it('returns zeros for an empty block list', () => {
    expect(computeReviewSignals([])).toEqual({
      emphasisRunCount: 0,
      boldRuns: 0,
      italicRuns: 0,
      highlightRuns: 0,
      figureBlockCount: 0,
      tableBlockCount: 0,
      textBlockCount: 0,
      totalWordCount: 0,
      figureToTextRatio: 0,
    });
  });

  it('floors the ratio denominator at 1 (all-figure poster)', () => {
    const s = computeReviewSignals([
      { id: 'a', type: 'image', content: null },
      { id: 'b', type: 'chart', content: null },
    ]);
    expect(s.textBlockCount).toBe(0);
    expect(s.figureToTextRatio).toBe(2);
  });

  it('counts uppercase openers and tags with attributes as emphasis runs', () => {
    const s = computeReviewSignals([
      {
        id: 'x',
        type: 'text',
        content: '<STRONG>one</STRONG> <b class="k">two</b> <MARK>three</MARK>',
      },
    ]);
    expect(s.boldRuns).toBe(2);
    expect(s.highlightRuns).toBe(1);
    expect(s.emphasisRunCount).toBe(3);
    expect(s.totalWordCount).toBe(3);
  });

  it('decodes entities before counting words', () => {
    const s = computeReviewSignals([
      { id: 'x', type: 'text', content: '<p>Tom &amp; Jerry</p>' },
    ]);
    expect(s.totalWordCount).toBe(3);
  });
});
