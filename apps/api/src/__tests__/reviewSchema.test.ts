/**
 * review/schema.ts — the critique output contract (spec §4.5 + D2's
 * required `category`). Golden fixtures must validate untouched; anything
 * malformed returns null (never throws, never half-parses) so critique.ts
 * can surface `bad_tool_json`.
 */
import { describe, it, expect } from 'vitest';
import type { CritiqueResult } from '@postr/shared';
import { validateCritique } from '../review/schema.js';

/** Golden fixture — one finding per anchor kind, all fields populated. */
const GOLDEN: CritiqueResult = {
  dimensionScores: { narrative: 4, design: 2, content: 3 },
  attentionSummary:
    'The eye lands on the large decorative lab photo top-center, drops to the dense methods column, and reaches the key-result figure only third.',
  prioritization:
    'Both tables present primary results; Table 1 lands the core result, Table 2 should move to the appendix.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.3, 0.05, 0.4, 0.25] },
      action: 'cut',
      problem:
        'The stock lab photo is the most salient element on the page and carries no result.',
      fix: 'Remove the photo so the key-result figure becomes the entry point.',
      example:
        'Delete the top-center photo and move Figure 2 ("87% recovery at 6 weeks") into that space.',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'figure-text-disconnect',
      anchor: { kind: 'block', blockId: 'blk_results_fig2' },
      action: 'condense',
      problem: 'Figure 2 is never referenced from the results text.',
      fix: 'Add one sentence tying the figure to the claim it supports.',
      example:
        'After "…improved significantly", add "(Figure 2, 87% vs 41% at 6 weeks)".',
      tradeoff: 'Costs one line of the results word budget.',
    },
    {
      dimension: 'content',
      severity: 'low',
      category: 'jargon-mismatch',
      anchor: { kind: 'slide', page: 1 },
      action: 'condense',
      problem: '"qRT-PCR" appears three times before it is expanded.',
      fix: 'Expand the acronym at first use.',
      example: 'First mention becomes "quantitative RT-PCR (qRT-PCR)".',
    },
  ],
};

describe('validateCritique — golden fixtures', () => {
  it('accepts a fully-populated CritiqueResult (all three anchor kinds)', () => {
    expect(validateCritique(GOLDEN)).toEqual(GOLDEN);
  });

  it('accepts a minimal payload (no prioritization, no tradeoff, zero findings)', () => {
    const minimal = {
      dimensionScores: { narrative: 1, design: 5, content: 3 },
      attentionSummary: 'Single-page poster; the entry point is the title.',
      findings: [],
    };
    expect(validateCritique(minimal)).toEqual(minimal);
  });
});

describe('validateCritique — malformed payloads return null', () => {
  // JSON round-trip gives an `any` clone so each test can break exactly
  // one part of the contract without fighting the type system.
  const clone = () => JSON.parse(JSON.stringify(GOLDEN));

  it('rejects a finding with no example', () => {
    const raw = clone();
    delete raw.findings[0].example;
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects an unknown anchor kind', () => {
    const raw = clone();
    raw.findings[0].anchor = { kind: 'paragraph', index: 2 };
    expect(validateCritique(raw)).toBeNull();
  });

  it.each([0, 6])('rejects a dimension score of %i (outside 1–5)', (score) => {
    const raw = clone();
    raw.dimensionScores.narrative = score;
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects a category outside the rubric taxonomy', () => {
    const raw = clone();
    raw.findings[1].category = 'bad-color-choice';
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects extra top-level keys (strict schema)', () => {
    const raw = { ...clone(), posterTitle: 'leak' };
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects a region anchor with a 3-element bbox', () => {
    const raw = clone();
    raw.findings[0].anchor = { kind: 'region', page: 1, bbox: [0.1, 0.1, 0.4] };
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(validateCritique(null)).toBeNull();
    expect(validateCritique('critique')).toBeNull();
    expect(validateCritique(42)).toBeNull();
  });
});
