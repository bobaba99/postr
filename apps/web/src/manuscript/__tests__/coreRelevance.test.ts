/**
 * Core-relevance scoring — this is a SCORING module, so these tests are
 * its spec: what establishes the core, which signals fire, how they
 * combine, and the traceability that lets the UI explain a cut.
 *
 * The load-bearing claim under test is that relevance to the core is a
 * different question from effect prominence, and that when the two
 * diverge, relevance wins.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import {
  buildCore,
  buildIdf,
  KIND_PRIOR,
  numberOverlap,
  rankCandidates,
  scoreCandidate,
  statTokens,
  weightedOverlap,
  type RelevanceCandidate,
} from '../coreRelevance';
import { extractFindings } from '../mapper';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Abstract

Sleep loss impairs memory, but the dose-response shape is unclear. We tested recall accuracy across three sleep-duration groups.

1. Introduction

Memory consolidation depends on sleep, and students are chronically restricted.

We asked whether moderate sleep restriction produces measurable recall deficits.

2. Methods

Participants were 120 undergraduates randomized to 5, 6.5, or 8 hours in bed.

3. Results

Recall accuracy fell 21% in the 5-hour group relative to controls (p < .001). Grip strength increased 44% among participants who used the stairwell (p < .001). Sleep quality ratings did not differ between groups (p = .41).

4. Discussion

Moderate sleep restriction measurably impairs recall accuracy.`;

const doc = parseManuscriptText(MANUSCRIPT);
const idf = buildIdf(doc.sections);

describe('statTokens', () => {
  it('extracts numbers and normalises trailing zeros', () => {
    expect(statTokens('fell 21.0% (p = .001)')).toEqual(new Set(['21', '0.001']));
  });

  it('ignores bare years, which are citations not effects', () => {
    expect(statTokens('as reported in 2019')).toEqual(new Set());
    // ...but a four-digit sample size is not a year.
    expect(statTokens('n = 3400 participants')).toEqual(new Set(['3400']));
  });
});

describe('buildCore', () => {
  const findings = extractFindings(doc);

  it('uses the author takeaway as the primary core, and says so', () => {
    const core = buildCore(doc, 'Moderate sleep restriction impairs recall', findings);
    expect(core.source).toBe('takeaway');
    expect(core.text).toBe('Moderate sleep restriction impairs recall');
    expect(core.terms.has('recall')).toBe(true);
  });

  it('falls back deterministically to title + abstract + top finding', () => {
    const core = buildCore(doc, '', findings);
    expect(core.source).toBe('derived');
    // Title terms lead the fallback and must be present.
    expect(core.terms.has('sleep')).toBe(true);
    expect(core.terms.has('recall')).toBe(true);
  });

  it('treats whitespace-only takeaway as absent', () => {
    expect(buildCore(doc, '   \n ', findings).source).toBe('derived');
  });

  it('weights the takeaway above the title', () => {
    const core = buildCore(doc, 'zebrafish behaviour', findings);
    // "zebrafish" appears only in the takeaway (weight 3); "sleep"
    // reaches the core only via the title (weight 1).
    expect(core.terms.get('zebrafish')).toBeGreaterThan(core.terms.get('sleep') ?? 0);
  });

  it('is stable — same input, same core', () => {
    const a = buildCore(doc, 'sleep restriction impairs recall', findings);
    const b = buildCore(doc, 'sleep restriction impairs recall', findings);
    expect([...a.terms.entries()].sort()).toEqual([...b.terms.entries()].sort());
    expect(a.numbers).toEqual(b.numbers);
  });
});

describe('weightedOverlap', () => {
  const core = buildCore(doc, 'sleep restriction impairs recall accuracy', []);

  it('scores a candidate sharing core terms above one that does not', () => {
    const related = weightedOverlap('recall accuracy under sleep restriction', core.terms, idf);
    const unrelated = weightedOverlap('grip strength in the stairwell', core.terms, idf);
    expect(related).toBeGreaterThan(unrelated);
  });

  it('returns 0 for text with no content terms', () => {
    expect(weightedOverlap('the and of', core.terms, idf)).toBe(0);
    expect(weightedOverlap('', core.terms, idf)).toBe(0);
  });

  it('normalises to 0..1', () => {
    const score = weightedOverlap('recall accuracy sleep restriction', core.terms, idf);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });

  it('does not let a long candidate win on volume alone', () => {
    const focused = weightedOverlap('recall accuracy sleep', core.terms, idf);
    const padded = weightedOverlap(
      `recall accuracy sleep ${'stairwell corridor cafeteria lighting furniture '.repeat(20)}`,
      core.terms,
      idf,
    );
    expect(focused).toBeGreaterThan(padded);
  });
});

describe('numberOverlap', () => {
  it('rewards a candidate quoting the core numbers', () => {
    const coreNumbers = new Set(['21', '0.001']);
    expect(numberOverlap('recall fell 21% (p < .001)', coreNumbers)).toBe(1);
    expect(numberOverlap('grip rose 44%', coreNumbers)).toBe(0);
  });

  it('returns 0 when either side has no numbers', () => {
    expect(numberOverlap('no numbers here', new Set(['21']))).toBe(0);
    expect(numberOverlap('fell 21%', new Set())).toBe(0);
  });
});

describe('scoreCandidate — traceability', () => {
  const core = buildCore(doc, 'sleep restriction impairs recall accuracy', []);

  const candidate: RelevanceCandidate = {
    id: 'c1',
    kind: 'finding',
    text: 'Recall accuracy fell 21% under sleep restriction.',
    sectionKind: 'results',
  };

  it('reports every signal that fired with its contribution', () => {
    const score = scoreCandidate(candidate, core, idf);
    expect(score.signals.map((s) => s.signal).sort()).toEqual([
      'kind',
      'numbers',
      'overlap',
      'position',
      'prominence',
    ]);
    for (const signal of score.signals) {
      expect(signal.value).toBeGreaterThanOrEqual(0);
      expect(signal.value).toBeLessThanOrEqual(1);
    }
  });

  it('the contributions sum to the composite score', () => {
    const score = scoreCandidate(candidate, core, idf);
    const summed = score.signals.reduce((sum, s) => sum + s.contribution, 0);
    expect(summed).toBeCloseTo(score.score, 2);
  });

  it('normalises the composite to 0..1', () => {
    const score = scoreCandidate(candidate, core, idf);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1);
  });

  it('gives a human reason, never a number', () => {
    const score = scoreCandidate(candidate, core, idf);
    expect(score.reason).toMatch(/[a-z]/i);
    expect(score.reason).not.toMatch(/\d/);
  });

  it('is pure — repeated scoring yields an identical result', () => {
    const a = scoreCandidate(candidate, core, idf);
    const b = scoreCandidate(candidate, core, idf);
    expect(a).toEqual(b);
  });
});

describe('scoreCandidate — overrides beat the score', () => {
  const core = buildCore(doc, 'sleep restriction impairs recall', []);
  // Deliberately irrelevant: low overlap, no shared numbers.
  const irrelevant: RelevanceCandidate = {
    id: 'x',
    kind: 'section',
    text: 'We thank the stairwell maintenance staff for their patience.',
    sectionKind: 'acknowledgements',
  };

  it('scores it into tier 4 with no override', () => {
    expect(scoreCandidate(irrelevant, core, idf).tier).toBe(4);
  });

  it('a core override promotes to tier 1 and says so', () => {
    const score = scoreCandidate(irrelevant, core, idf, { isCore: true });
    expect(score.tier).toBe(1);
    expect(score.override).toBe('core');
    expect(score.reason).toMatch(/main message/i);
  });

  it("a user's ranking outranks the algorithm", () => {
    const score = scoreCandidate(irrelevant, core, idf, { userRanked: true });
    expect(score.tier).toBe(2);
    expect(score.override).toBe('user-ranking');
    expect(score.reason).toMatch(/you chose/i);
  });

  it('a pin outranks the algorithm', () => {
    const score = scoreCandidate(irrelevant, core, idf, { pinned: true });
    expect(score.tier).toBe(2);
    expect(score.override).toBe('pinned');
    expect(score.reason).toMatch(/you asked/i);
  });
});

describe('KIND_PRIOR', () => {
  it('ranks results above acknowledgements', () => {
    expect(KIND_PRIOR.results).toBeGreaterThan(KIND_PRIOR.acknowledgements);
    expect(KIND_PRIOR['literature-review']).toBeLessThan(KIND_PRIOR.discussion);
  });
});

describe('rankCandidates', () => {
  const core = buildCore(doc, 'sleep restriction impairs recall accuracy', []);

  const candidates: RelevanceCandidate[] = [
    {
      id: 'unrelated',
      kind: 'finding',
      text: 'Grip strength increased 44% among stairwell users (p < .001).',
      sectionKind: 'results',
      prominence: 1,
    },
    {
      id: 'related',
      kind: 'finding',
      text: 'Recall accuracy fell under sleep restriction (p = .02).',
      sectionKind: 'results',
      prominence: 0.5,
    },
  ];

  it('ranks the core-relevant candidate above the more prominent one', () => {
    const ranked = rankCandidates(candidates, core, idf);
    expect(ranked[0]!.id).toBe('related');
  });

  it('sorts by tier first, then score', () => {
    const ranked = rankCandidates(candidates, core, idf);
    for (let i = 1; i < ranked.length; i++) {
      const prev = ranked[i - 1]!;
      const cur = ranked[i]!;
      expect(prev.tier <= cur.tier).toBe(true);
      if (prev.tier === cur.tier) expect(prev.score >= cur.score).toBe(true);
    }
  });

  it('is stable across repeated calls', () => {
    const a = rankCandidates(candidates, core, idf).map((s) => s.id);
    const b = rankCandidates(candidates, core, idf).map((s) => s.id);
    expect(a).toEqual(b);
  });
});
