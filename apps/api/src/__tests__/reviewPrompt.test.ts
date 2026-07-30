/**
 * review/prompt.ts — the §2.0 composition guarantee: every criterion in
 * the system prompt must come FROM the rubric data, never from inlined
 * prose. The custom-rubric test is the anti-inlining pin — render a fake
 * rubric and v1's rule ids must disappear entirely.
 */
import { describe, it, expect } from 'vitest';
import type { CritiqueResult } from '@postr/shared';
import {
  CURRENT_RUBRIC,
  type Rubric,
} from '../review/rubric/index.js';
import {
  composeReviewSystemPrompt,
  buildInitialUserMessage,
  buildFollowupUserMessage,
  CRITIQUE_TOOL_INPUT_SCHEMA,
} from '../review/prompt.js';
import type { ReviewSignals } from '../review/signals.js';

const SIGNALS: ReviewSignals = {
  emphasisRunCount: 4,
  boldRuns: 2,
  italicRuns: 1,
  highlightRuns: 1,
  figureBlockCount: 2,
  tableBlockCount: 1,
  textBlockCount: 2,
  totalWordCount: 18,
  figureToTextRatio: 1,
};

const INITIAL_CRITIQUE: CritiqueResult = {
  dimensionScores: { narrative: 3, design: 2, content: 4 },
  attentionSummary: 'Entry point is the decorative header band.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'wall-of-text',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.3, 0.4, 0.5] },
      action: 'cut',
      problem: 'The methods column is a 180-word paragraph no one will read.',
      fix: 'Cut it to three bullets of ≤ 12 words each.',
      example: '"Cells were cultured overnight at 37°C in DMEM + 10% FBS."',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'buried-key-result',
      anchor: { kind: 'slide', page: 1 },
      action: 'keep-as-primary',
      problem: 'The 87% recovery figure sits in the bottom-right corner.',
      fix: 'Move it to the top-right entry position.',
      example: 'Swap Figure 2 with the background panel above it.',
    },
  ],
};

describe('composeReviewSystemPrompt', () => {
  it('renders every rubric rule id and text (perception AND economy)', () => {
    const prompt = composeReviewSystemPrompt();
    for (const rule of [
      ...CURRENT_RUBRIC.perceptionRules,
      ...CURRENT_RUBRIC.economyRules,
    ]) {
      expect(prompt).toContain(`[${rule.id}]`);
      expect(prompt).toContain(rule.text);
    }
  });

  it('renders the economy rules inside the BOTH-stages economy section', () => {
    const prompt = composeReviewSystemPrompt();
    const economySection = prompt.slice(
      prompt.indexOf('BOTH stages are governed'),
    );
    for (const rule of CURRENT_RUBRIC.economyRules) {
      expect(economySection).toContain(`[${rule.id}]`);
      expect(economySection).toContain(rule.text);
    }
  });

  it('renders the dimension scoring anchors', () => {
    const prompt = composeReviewSystemPrompt();
    for (const d of CURRENT_RUBRIC.dimensions) {
      expect(prompt).toContain(
        `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`,
      );
    }
  });

  it('composes a custom rubric with NO v1 residue (anti-inlining pin)', () => {
    const custom: Rubric = {
      version: CURRENT_RUBRIC.version,
      issueCategories: CURRENT_RUBRIC.issueCategories,
      perceptionRules: [
        {
          id: 'test-perc-only',
          text: 'Custom perception rule text for the anti-inlining test.',
          provenance: 'test',
          dimensions: ['design'],
          checklistCategory: null,
        },
      ],
      economyRules: [
        {
          id: 'test-econ-only',
          text: 'Custom economy rule text for the anti-inlining test.',
          provenance: 'test',
          dimensions: ['narrative'],
          checklistCategory: null,
        },
      ],
      dimensions: [
        {
          dimension: 'narrative',
          name: 'TestNarrative',
          anchors: { low: 'tl', mid: 'tm', high: 'th' },
        },
      ],
    };
    const prompt = composeReviewSystemPrompt(custom);
    expect(prompt).toContain('[test-perc-only]');
    expect(prompt).toContain('[test-econ-only]');
    expect(prompt).toContain('TestNarrative');
    expect(prompt).not.toContain('perc-entry-salience');
    expect(prompt).not.toContain('econ-lens');
  });
});

describe('buildInitialUserMessage', () => {
  it('embeds the deterministic signals numbers', () => {
    const msg = buildInitialUserMessage({
      pageCount: 1,
      sourceKind: 'postr',
      signals: SIGNALS,
      posterDocPresent: true,
    });
    expect(msg).toContain(
      'Emphasis runs: 4 total (bold 2, italic 1, highlight 1)',
    );
    expect(msg).toContain('Blocks: 2 figure, 1 table, 2 text');
    expect(msg).toContain('Total words: 18');
    expect(msg).toContain('Figure-to-text ratio: 1.00');
  });

  it('declares block anchors available iff a PosterDoc is present', () => {
    const withDoc = buildInitialUserMessage({
      pageCount: 1,
      sourceKind: 'postr',
      signals: SIGNALS,
      posterDocPresent: true,
    });
    expect(withDoc).toContain('block anchors ARE available');
    const noDoc = buildInitialUserMessage({
      pageCount: 3,
      sourceKind: 'pdf',
      posterDocPresent: false,
    });
    expect(noDoc).toContain('block anchors are NOT available');
    expect(noDoc).toContain(
      'judge emphasis load and figure-to-text balance visually',
    );
  });

  it('states the page count and source kind', () => {
    const msg = buildInitialUserMessage({
      pageCount: 12,
      sourceKind: 'pptx',
      posterDocPresent: false,
    });
    expect(msg).toContain('12 page(s)');
    expect(msg).toContain('Source kind: pptx');
  });
});

describe('buildFollowupUserMessage', () => {
  it('embeds the initial findings JSON (problem strings recoverable)', () => {
    const msg = buildFollowupUserMessage({
      initialFindings: INITIAL_CRITIQUE,
      pageCount: 1,
      sourceKind: 'postr',
    });
    expect(msg).toContain(JSON.stringify(INITIAL_CRITIQUE));
    for (const f of INITIAL_CRITIQUE.findings) {
      expect(msg).toContain(f.problem);
    }
  });

  it('carries the §5.2 judge framing ("did they address these? what is still open?")', () => {
    const msg = buildFollowupUserMessage({
      initialFindings: INITIAL_CRITIQUE,
      pageCount: 1,
      sourceKind: 'postr',
    });
    expect(msg).toContain('Did they address these?');
    expect(msg).toContain('What is still open?');
  });
});

describe('CRITIQUE_TOOL_INPUT_SCHEMA', () => {
  it('derives the category enum from the rubric taxonomy', () => {
    const categories =
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.findings.items.properties
        .category.enum;
    expect([...categories]).toEqual([...CURRENT_RUBRIC.issueCategories]);
  });

  it('requires example on every finding (the personalization guarantee)', () => {
    expect(
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.findings.items.required,
    ).toContain('example');
  });

  it('marks the dimension scores as 1–5 integers', () => {
    const scores =
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.dimensionScores.properties;
    for (const key of ['narrative', 'design', 'content'] as const) {
      expect(scores[key]).toMatchObject({
        type: 'integer',
        minimum: 1,
        maximum: 5,
      });
    }
  });
});
