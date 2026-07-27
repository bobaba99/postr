/**
 * Pasted-text ingest — the primary MVP input path. These tests pin the
 * deterministic structure extraction: title/byline detection, section
 * classification, abstract/reference splitting, and figure-caption
 * capture from text-only manuscripts.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1,2, Jane Doe1
(1) Acme State University, (2) Sample Research Institute

Abstract

Sleep loss impairs memory, but the dose-response shape is unclear. We tested recall accuracy across three sleep-duration groups. Restricted sleep reduced recall by 21%.

1. Introduction

Memory consolidation depends on sleep. Prior work has focused on total deprivation rather than the partial restriction students actually experience.

We asked whether moderate sleep restriction produces measurable recall deficits.

2. Methods

Participants were 120 undergraduates randomized to 5, 6.5, or 8 hours in bed for one week. Recall was measured with a 40-item word-list task. Analyses used mixed-effects models in R version 4.3.

3. Results

Recall accuracy fell 21% in the 5-hour group relative to 8-hour controls (p < .001). The 6.5-hour group showed an intermediate 9% deficit (p = .02).

Figure 1. Mean recall accuracy by sleep group.

Sleep quality ratings did not differ between groups (p = .41).

4. Discussion

Even moderate restriction measurably impairs recall. This suggests sleep advice for students should target consistency, not only total deprivation avoidance.

Limitations

The sample was drawn from a single institution.

References

Smith, J. & Doe, J. (2024). Sleep and memory. Journal of Sample Studies, 12, 1-10.
Roe, A. (2023). Restriction paradigms. Acme Review, 8, 33-41.`;

describe('parseManuscriptText', () => {
  const doc = parseManuscriptText(MANUSCRIPT);

  it('extracts the title from the leading line', () => {
    expect(doc.title).toBe(
      'Sleep Duration and Recall Accuracy in Undergraduate Students',
    );
  });

  it('parses the byline into structured authors and institutions', () => {
    expect(doc.authors.map((a) => a.name)).toEqual(['John Smith', 'Jane Doe']);
    expect(doc.institutions.map((i) => i.name)).toEqual([
      'Acme State University',
      'Sample Research Institute',
    ]);
    // John Smith carries both affiliations.
    expect(doc.authors[0]!.affiliationIds).toHaveLength(2);
  });

  it('pulls the abstract out of the section list', () => {
    expect(doc.abstract).toMatch(/dose-response shape is unclear/);
    expect(doc.sections.some((s) => s.kind === 'abstract')).toBe(false);
  });

  it('classifies numbered sections through the lexicon', () => {
    const kinds = doc.sections.map((s) => s.kind);
    expect(kinds).toEqual([
      'introduction',
      'methods',
      'results',
      'discussion',
      'limitations',
    ]);
  });

  it('keeps paragraphs separate within a section', () => {
    const intro = doc.sections.find((s) => s.kind === 'introduction')!;
    expect(intro.paragraphs).toHaveLength(2);
    expect(intro.paragraphs[1]).toMatch(/^We asked whether/);
  });

  it('captures text-declared figures without polluting section prose', () => {
    expect(doc.figures).toHaveLength(1);
    expect(doc.figures[0]!.caption).toMatch(/^Figure 1\./);
    const results = doc.sections.find((s) => s.kind === 'results')!;
    expect(results.paragraphs.join(' ')).not.toMatch(/Figure 1\. Mean recall/);
  });

  it('parses references with year extraction', () => {
    expect(doc.references).toHaveLength(2);
    expect(doc.references[0]!.year).toBe('2024');
    expect(doc.references[0]!.rawText).toMatch(/Sleep and memory/);
  });

  it('counts words across abstract and body', () => {
    expect(doc.wordCount).toBeGreaterThan(100);
    expect(doc.wordCount).toBeLessThan(400);
  });

  it('handles single-newline documents (line mode)', () => {
    const lineDoc = parseManuscriptText(
      [
        'A Short Title',
        'Introduction',
        'First paragraph of intro.',
        'Second paragraph of intro.',
        'Results',
        'Accuracy improved by 12% (p = .01).',
      ].join('\n'),
    );
    expect(lineDoc.title).toBe('A Short Title');
    const intro = lineDoc.sections.find((s) => s.kind === 'introduction')!;
    expect(intro.paragraphs).toHaveLength(2);
  });

  it('survives a manuscript with no headings at all', () => {
    const flat = parseManuscriptText(
      'Just One Title Line\n\nA single paragraph of content with words.',
    );
    expect(flat.title).toBe('Just One Title Line');
    expect(flat.sections).toHaveLength(1);
    expect(flat.sections[0]!.kind).toBe('other');
  });

  it('returns an empty-but-valid model for empty input', () => {
    const empty = parseManuscriptText('');
    expect(empty.title).toBe('');
    expect(empty.sections).toHaveLength(0);
    expect(empty.wordCount).toBe(0);
  });
});
