/**
 * Deterministic SlideDeck builder — fixed scientific arc (title, hook,
 * question, methods, one 'result' slide PER ranked finding, references
 * last). Pins: title-first/references-last, one-finding-per-slide (genre:
 * expand not compress), the ≤30-word gate on every content slide,
 * mandatory sourceQuote on non-title/ref slides, pasted references routed
 * into the relevant slide's references[] + speakerNotes AND merged +
 * deduplicated into the final references slide.
 */
import { describe, it, expect } from 'vitest';
import { buildDeck, type BuildDeckInput } from '../buildDeck';

const base: BuildDeckInput = {
  title: 'Spaced practice in the classroom',
  authors: [{ name: 'J. Doe' }],
  durationMinutes: 10,
  rankedFindings: [
    { text: 'Spacing raised 6-week recall by 34%.', sourceQuote: 'a 34% improvement in delayed recall', sourceSection: 'Results' },
    { text: 'The effect held across all age bands.', sourceQuote: 'held across every age band', sourceSection: 'Results' },
  ],
  gap: 'Classroom evidence over weeks is thin.',
  resolution: 'This 6-week study shows the gain holds.',
  methodsSummary: 'Two conditions, 120 students, 6 weeks.',
  references: ['Doe J. 2026. Journal of Learning.'],
  introReferences: [],
  methodsReferences: [],
};

describe('buildDeck', () => {
  it('puts title first and references last', () => {
    const d = buildDeck(base);
    expect(d.slides[0]!.role).toBe('title');
    expect(d.slides[d.slides.length - 1]!.role).toBe('references');
  });

  it('emits one result slide per ranked finding (genre: expand, not compress)', () => {
    const d = buildDeck(base);
    expect(d.slides.filter((s) => s.role === 'result')).toHaveLength(2);
  });

  it('enforces the 30-word cap on every content slide', () => {
    const d = buildDeck({
      ...base,
      rankedFindings: [{ text: Array.from({ length: 50 }, (_, i) => `w${i}`).join(' '), sourceQuote: 'x', sourceSection: 'Results' }],
    });
    const result = d.slides.find((s) => s.role === 'result')!;
    expect(result.assertion.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(result.wordCapCut).toBe(true);
  });

  it('carries a sourceQuote on every non-title/ref slide (no invention)', () => {
    const d = buildDeck(base);
    for (const s of d.slides) {
      if (s.role === 'title' || s.role === 'references') continue;
      expect(s.sourceQuote.length).toBeGreaterThan(0);
    }
  });

  it('routes intro references onto the hook and question slides', () => {
    const d = buildDeck({
      ...base,
      introReferences: ['Prior A. 2020.', 'Prior B. 2021.'],
    });
    const hook = d.slides.find((s) => s.role === 'hook')!;
    const question = d.slides.find((s) => s.role === 'question')!;
    expect(hook.references).toEqual(['Prior A. 2020.', 'Prior B. 2021.']);
    expect(question.references).toEqual(['Prior A. 2020.', 'Prior B. 2021.']);
  });

  it('appends intro references into the hook/question speaker notes with reference provenance', () => {
    const d = buildDeck({
      ...base,
      introReferences: ['Prior A. 2020.'],
    });
    const hook = d.slides.find((s) => s.role === 'hook')!;
    const refNotes = hook.speakerNotes.filter((n) => n.provenance === 'reference');
    expect(refNotes.map((n) => n.text)).toContain('Prior A. 2020.');
  });

  it('routes methods references onto the methods slide only', () => {
    const d = buildDeck({
      ...base,
      methodsReferences: ['Method M. 2019.'],
    });
    const methods = d.slides.find((s) => s.role === 'methods')!;
    const hook = d.slides.find((s) => s.role === 'hook')!;
    expect(methods.references).toEqual(['Method M. 2019.']);
    expect(hook.references).toEqual([]);
    const refNotes = methods.speakerNotes.filter((n) => n.provenance === 'reference');
    expect(refNotes.map((n) => n.text)).toContain('Method M. 2019.');
  });

  it('merges pasted intro/methods references into the references slide and deduplicates (case-insensitive, trimmed)', () => {
    const d = buildDeck({
      ...base,
      references: ['Doe J. 2026. Journal of Learning.'],
      introReferences: ['  doe j. 2026. journal of learning.  ', 'Prior A. 2020.'],
      methodsReferences: ['Prior A. 2020.', 'Method M. 2019.'],
    });
    const refs = d.slides.find((s) => s.role === 'references')!;
    const lines = (refs.evidence ?? '').split('\n').filter((l) => l.length > 0);
    // 'Doe J. 2026...' appears once (dedup vs the case/whitespace variant),
    // 'Prior A. 2020.' once (dedup across intro+methods), plus 'Method M. 2019.'
    expect(lines).toHaveLength(3);
    const lowered = lines.map((l) => l.trim().toLowerCase());
    expect(new Set(lowered).size).toBe(lines.length); // no duplicates
    expect(lowered).toContain('doe j. 2026. journal of learning.');
    expect(lowered).toContain('prior a. 2020.');
    expect(lowered).toContain('method m. 2019.');
  });

  it('references-slide bottom box is not word-capped (apparatus, not talk content)', () => {
    const longRef = Array.from({ length: 60 }, (_, i) => `ref${i}`).join(' ');
    const d = buildDeck({ ...base, references: [longRef] });
    const refs = d.slides.find((s) => s.role === 'references')!;
    expect(refs.evidence).toContain(longRef);
    expect(refs.wordCapCut).toBe(false);
  });
});
