/**
 * Q5's derivation. Deterministic scoring — same input, same ranking,
 * every time, with no model call anywhere in the path.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import { extractFindings } from '../mapper';
import { contentTerms, rankSections } from '../sectionRelevance';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy

John Smith1
(1) Acme State University

Abstract

Sleep loss impairs memory. We tested recall accuracy across sleep-duration groups.

Introduction

Memory consolidation depends on sleep. We asked whether restriction produces deficits.

Literature Review

Earlier surveys of workplace productivity software adoption are extensive.

Methods

Participants were 120 undergraduates randomized to three groups.

Results

Recall fell 21% in the restricted group (p < .001).

Discussion

Moderate restriction measurably impairs recall.

Limitations

Recall accuracy was measured in a single sleep-restricted undergraduate sample, so the memory deficits may not generalize.

Acknowledgements

We thank the Sample Research Institute.`;

function rank(takeaway = 'Sleep restriction impairs recall accuracy.') {
  const doc = parseManuscriptText(MANUSCRIPT);
  return rankSections(doc, takeaway, extractFindings(doc));
}

describe('contentTerms', () => {
  it('drops short words and stop words', () => {
    expect(contentTerms('The recall data were not from that study')).toEqual([
      'recall',
    ]);
  });

  it('lowercases and strips punctuation', () => {
    expect(contentTerms('Recall, Accuracy!')).toEqual(['recall', 'accuracy']);
  });
});

describe('rankSections', () => {
  it('never offers sections the five-role spine already claims', () => {
    const kinds = rank().map((s) => s.kind);
    expect(kinds).not.toContain('introduction');
    expect(kinds).not.toContain('methods');
    expect(kinds).not.toContain('results');
    expect(kinds).not.toContain('discussion');
  });

  it('returns candidates ranked by score, highest first', () => {
    const scores = rank().map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('ranks an on-topic limitations section above an off-topic review', () => {
    const ranked = rank();
    const limitations = ranked.findIndex((s) => s.kind === 'limitations');
    const review = ranked.findIndex((s) => s.kind === 'literature-review');
    expect(limitations).toBeGreaterThanOrEqual(0);
    expect(review).toBeGreaterThanOrEqual(0);
    expect(limitations).toBeLessThan(review);
  });

  it('ranks acknowledgements last — credits are not content', () => {
    const ranked = rank();
    expect(ranked[ranked.length - 1]!.kind).toBe('acknowledgements');
  });

  it('gives every candidate a plain-language reason', () => {
    for (const section of rank()) {
      expect(section.reason.length).toBeGreaterThan(0);
      // No scoring jargon leaks to the user.
      expect(section.reason).not.toMatch(/tf-?idf|score|weight/i);
    }
  });

  it('is deterministic — the same input ranks identically', () => {
    // Section ids are minted by nanoid at parse time, so two parses of
    // the same text differ there by design. Everything the SCORING
    // produces must be identical.
    const stable = (ranked: ReturnType<typeof rank>) =>
      ranked.map(({ heading, kind, score, suggested, reason }) => ({
        heading,
        kind,
        score,
        suggested,
        reason,
      }));
    expect(stable(rank())).toEqual(stable(rank()));
  });

  it('responds to the takeaway, which is the author saying what matters', () => {
    // A takeaway about the off-topic review's subject should lift it.
    const onTopic = rank('Sleep restriction impairs recall accuracy.');
    const offTopic = rank('Workplace productivity software adoption is uneven.');
    const reviewScore = (ranked: ReturnType<typeof rank>) =>
      ranked.find((s) => s.kind === 'literature-review')!.score;
    expect(reviewScore(offTopic)).toBeGreaterThan(reviewScore(onTopic));
  });

  it('returns an empty list when there is nothing beyond the spine', () => {
    const doc = parseManuscriptText(
      [
        'A Title',
        '',
        'Introduction',
        '',
        'We asked whether X changes Y.',
        '',
        'Results',
        '',
        'X increased Y by 12% (p = .01).',
        '',
        'Discussion',
        '',
        'X matters.',
      ].join('\n'),
    );
    expect(rankSections(doc, 'X matters.', extractFindings(doc))).toEqual([]);
  });

  it('flags suggestions without selecting everything', () => {
    const ranked = rank();
    const suggested = ranked.filter((s) => s.suggested);
    expect(suggested.length).toBeLessThan(ranked.length);
  });
});
