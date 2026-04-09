import { describe, it, expect } from 'vitest';
import { formatAuthorsApa, CITATION_STYLES, sortReferences } from '../citations';
import type { Reference } from '@postr/shared';

const ref = (overrides: Partial<Reference> = {}): Reference => ({
  id: 'r1',
  authors: ['Smith, John'],
  year: '2024',
  title: 'A study',
  journal: 'Journal',
  doi: '',
  ...overrides,
});

describe('formatAuthorsApa', () => {
  it('returns "Unknown" for empty author list', () => {
    expect(formatAuthorsApa([])).toBe('Unknown');
  });

  it('formats a single author "Last, F."', () => {
    expect(formatAuthorsApa(['Smith, John'])).toBe('Smith, J.');
  });

  it('joins two authors with "&"', () => {
    expect(formatAuthorsApa(['Smith, John', 'Doe, Alice'])).toBe('Smith, J. & Doe, A.');
  });

  it('joins ≤20 authors with comma + "&" before the last', () => {
    expect(formatAuthorsApa(['Smith, John', 'Doe, Alice', 'Brown, Bob'])).toBe(
      'Smith, J., Doe, A., & Brown, B.',
    );
  });

  it('truncates >20 authors with "et al."', () => {
    const authors = Array.from({ length: 21 }, (_, i) => `Author${i}, X`);
    expect(formatAuthorsApa(authors)).toBe('Author0, X. et al.');
  });
});

describe('CITATION_STYLES', () => {
  it('formats APA 7', () => {
    const out = CITATION_STYLES['APA 7'](ref(), 0);
    expect(out).toContain('Smith, J.');
    expect(out).toContain('(2024)');
    expect(out).toContain('A study');
    expect(out).toContain('_Journal_');
  });

  it('formats Vancouver with numbered prefix', () => {
    const out = CITATION_STYLES.Vancouver(ref(), 4);
    expect(out.startsWith('5.')).toBe(true);
  });

  it('formats IEEE with bracketed number', () => {
    const out = CITATION_STYLES.IEEE(ref(), 0);
    expect(out.startsWith('[1]')).toBe(true);
  });

  it('formats Harvard with year in parens', () => {
    const out = CITATION_STYLES.Harvard(ref(), 0);
    expect(out).toContain('(2024)');
  });

  it('falls back to "n.d." when year is missing', () => {
    const out = CITATION_STYLES['APA 7'](ref({ year: '' }), 0);
    expect(out).toContain('n.d.');
  });
});

describe('sortReferences', () => {
  const refs: Reference[] = [
    ref({ id: 'a', authors: ['Charlie, A'], year: '2021' }),
    ref({ id: 'b', authors: ['Alpha, B'], year: '2024' }),
    ref({ id: 'c', authors: ['Bravo, C'], year: '2023' }),
  ];

  it('returns the input unchanged for "none"', () => {
    expect(sortReferences(refs, 'none').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts alphabetically by first author', () => {
    expect(sortReferences(refs, 'alpha').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by year descending', () => {
    expect(sortReferences(refs, 'year').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by year ascending', () => {
    expect(sortReferences(refs, 'year-asc').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the input', () => {
    const before = refs.map((r) => r.id);
    sortReferences(refs, 'alpha');
    expect(refs.map((r) => r.id)).toEqual(before);
  });
});
