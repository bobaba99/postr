/**
 * Shared content derivations — must mirror the canvas exactly so a
 * poster exports the same numbers/lines the editor shows.
 */
import { describe, expect, it } from 'vitest';
import type { Author, Block, Institution, Reference } from '@postr/shared';
import {
  computeCaptionNumbers,
  computeHeadingNumbers,
  deriveAuthorsContent,
  formatReferencesForExport,
  safeFileBaseName,
} from '../posterContent';

const block = (partial: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  content: '',
  imageSrc: null,
  imageFit: 'contain',
  tableData: null,
  ...partial,
});

describe('computeCaptionNumbers', () => {
  it('numbers figures in reading order (y primary, x secondary)', () => {
    const numbers = computeCaptionNumbers([
      block({ id: 'low', type: 'image', x: 0, y: 100 }),
      block({ id: 'topRight', type: 'image', x: 200, y: 10 }),
      block({ id: 'topLeft', type: 'image', x: 10, y: 10 }),
    ]);
    expect(numbers['topLeft']).toBe(1);
    expect(numbers['topRight']).toBe(2);
    expect(numbers['low']).toBe(3);
  });

  it('numbers tables independently from figures', () => {
    const numbers = computeCaptionNumbers([
      block({ id: 'fig', type: 'image', y: 50 }),
      block({ id: 'tbl', type: 'table', y: 90 }),
    ]);
    expect(numbers['fig']).toBe(1);
    expect(numbers['tbl']).toBe(1);
  });
});

describe('computeHeadingNumbers', () => {
  it('numbers headings by array order, not canvas position', () => {
    const numbers = computeHeadingNumbers([
      block({ id: 'h1', type: 'heading', y: 500 }),
      block({ id: 't', type: 'text' }),
      block({ id: 'h2', type: 'heading', y: 10 }),
    ]);
    expect(numbers['h1']).toBe(1);
    expect(numbers['h2']).toBe(2);
  });
});

describe('deriveAuthorsContent', () => {
  const institutions: Institution[] = [
    { id: 'acme', name: 'Acme State University', dept: 'Dept. of Testing' },
    { id: 'sri', name: 'Sample Research Institute' },
  ];
  const authors: Author[] = [
    {
      id: 'a1',
      name: 'John Smith',
      affiliationIds: ['acme'],
      isCorresponding: true,
      equalContrib: false,
    },
    {
      id: 'a2',
      name: 'Jane Doe',
      affiliationIds: ['acme', 'sri'],
      isCorresponding: false,
      equalContrib: true,
    },
  ];

  it('builds author segments with superscript markers', () => {
    const c = deriveAuthorsContent(authors, institutions);
    expect(c.authors).toEqual([
      { name: 'John Smith', markers: ['1', '†'] },
      { name: 'Jane Doe', markers: ['1', '2', '*'] },
    ]);
  });

  it('builds indexed affiliation lines', () => {
    const c = deriveAuthorsContent(authors, institutions);
    expect(c.affiliations).toEqual([
      { index: 1, text: 'Acme State University, Dept. of Testing' },
      { index: 2, text: 'Sample Research Institute' },
    ]);
  });

  it('emits the equal-contribution / corresponding footnote', () => {
    const c = deriveAuthorsContent(authors, institutions);
    expect(c.footnote).toBe('*Equal contribution · †Corresponding author');
  });

  it('falls back to ALL institutions when none are linked', () => {
    const unlinked: Author[] = [
      { id: 'a', name: 'John Smith', affiliationIds: [], isCorresponding: false, equalContrib: false },
    ];
    const c = deriveAuthorsContent(unlinked, institutions);
    expect(c.affiliations).toHaveLength(2);
    expect(c.footnote).toBeNull();
  });

  it('skips authors without names', () => {
    const c = deriveAuthorsContent(
      [{ id: 'x', name: '', affiliationIds: [], isCorresponding: false, equalContrib: false }],
      [],
    );
    expect(c.authors).toEqual([]);
  });
});

describe('formatReferencesForExport', () => {
  const refs: Reference[] = [
    { id: 'r1', authors: ['Zed, A.'], year: '2024', title: 'Zeta effects', journal: 'J Tests' },
    { id: 'r2', authors: ['Able, B.'], year: '2026', title: 'Alpha effects', journal: 'J Tests' },
  ];

  it('sorts alphabetically by default (mirrors the editor)', () => {
    const out = formatReferencesForExport(refs);
    expect(out[0]).toContain('Able');
    expect(out[1]).toContain('Zed');
  });

  it('applies the requested citation style with index prefixes', () => {
    const out = formatReferencesForExport(refs, { citationStyle: 'IEEE', sortMode: 'none' });
    expect(out[0]).toMatch(/^\[1\]/);
    expect(out[1]).toMatch(/^\[2\]/);
  });

  it('never mutates the input array', () => {
    const copy = [...refs];
    formatReferencesForExport(refs);
    expect(refs).toEqual(copy);
  });
});

describe('safeFileBaseName', () => {
  it('sanitizes to a filesystem-safe name', () => {
    expect(safeFileBaseName('My Poster: Final (v2)!')).toBe('My_Poster_Final_v2');
  });
  it('falls back when nothing survives', () => {
    expect(safeFileBaseName('***')).toBe('poster');
  });
});
