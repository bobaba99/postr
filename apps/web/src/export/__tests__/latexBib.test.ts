/** references.bib generation for the LaTeX bundle. */
import { describe, expect, it } from 'vitest';
import type { Reference } from '@postr/shared';
import { referencesToBib } from '../latex/bib';

describe('referencesToBib', () => {
  // The credit ships as a real @misc entry, so a reference-less
  // poster now yields a one-entry bib rather than nothing. A comment
  // is not citable; an entry is, which is the whole point of the .bib.
  it('still emits the Postr credit entry when the poster has no references', () => {
    const bib = referencesToBib([]);
    expect(bib).toContain('@misc{postr,');
    expect(bib).toContain('Poster made with postr.sh');
  });

  it('returns empty string for no references once the paid seam suppresses the credit', () => {
    expect(referencesToBib([], { paidPlan: true })).toBe('');
  });

  it('appends the credit LAST, after every user reference', () => {
    const bib = referencesToBib([
      { id: 'r1', authors: ['Smith, John'], year: '2026', title: 'A paper' },
    ]);
    expect(bib.indexOf('@article{')).toBeLessThan(bib.indexOf('@misc{postr,'));
  });

  it('namespaces the credit key so it cannot collide with a user entry', () => {
    // A user reference authored by someone named "Postr" would
    // generate key `postr<year>`, never bare `postr`.
    const bib = referencesToBib([
      { id: 'r1', authors: ['Postr, P'], year: '2026', title: 'Collision bait' },
    ]);
    expect(bib.match(/@misc\{postr,/g)).toHaveLength(1);
    expect(bib).toContain('@article{postr2026,');
  });

  it('renders field-based references as @article entries', () => {
    const bib = referencesToBib([
      {
        id: 'r1',
        authors: ['Smith, John', 'Doe, Jane'],
        year: '2026',
        title: 'Reproducible poster pipelines',
        journal: 'Journal of Sample Research',
        doi: '10.1000/xyz123',
      },
    ]);
    expect(bib).toContain('@article{smith2026,');
    expect(bib).toContain('author = {Smith, John and Doe, Jane}');
    expect(bib).toContain('title = {Reproducible poster pipelines}');
    expect(bib).toContain('journal = {Journal of Sample Research}');
    expect(bib).toContain('year = {2026}');
    expect(bib).toContain('doi = {10.1000/xyz123}');
  });

  it('renders rawText references as @misc with a note', () => {
    const bib = referencesToBib([
      {
        id: 'r1',
        authors: [],
        rawText: 'Smith J. Sample study. J Tests. 2025.',
        year: '2025',
      },
    ]);
    expect(bib).toContain('@misc{ref12025,');
    expect(bib).toContain('note = {Smith J. Sample study. J Tests. 2025.}');
  });

  it('dedupes colliding citation keys', () => {
    const ref = (id: string): Reference => ({
      id,
      authors: ['Smith, John'],
      year: '2026',
      title: `Title ${id}`,
    });
    const bib = referencesToBib([ref('a'), ref('b'), ref('c')]);
    expect(bib).toContain('@article{smith2026,');
    expect(bib).toContain('@article{smith2026b,');
    expect(bib).toContain('@article{smith2026c,');
  });

  it('escapes LaTeX specials inside field values', () => {
    const bib = referencesToBib([
      {
        id: 'r1',
        authors: ['Smith, John'],
        year: '2026',
        title: 'Costs & benefits of 100% coverage',
        journal: 'J_Tests',
      },
    ]);
    expect(bib).toContain('Costs \\& benefits of 100\\% coverage');
    expect(bib).toContain('J\\_Tests');
  });

  it('skips empty fields entirely', () => {
    const bib = referencesToBib([{ id: 'r1', authors: ['Doe, Jane'], title: 'Untitled study' }]);
    expect(bib).not.toContain('journal =');
    expect(bib).not.toContain('year =');
    expect(bib).not.toContain('doi =');
  });
});
