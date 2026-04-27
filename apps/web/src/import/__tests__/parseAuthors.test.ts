import { describe, expect, it } from 'vitest';
import { parseAuthorsText } from '../parseAuthors';

describe('parseAuthorsText', () => {
  it('returns empty result for empty input', () => {
    const out = parseAuthorsText('');
    expect(out.authors).toEqual([]);
    expect(out.institutions).toEqual([]);
  });

  it('parses the EW_INS poster authors block correctly', () => {
    const raw =
      'Enqi Wang1,2, Gavin (Zihao) Geng1, Corina Lazarenco1, Maxime Montembeault1,2,3\n(1) McGill University, (2) Douglas Research Center, (3) Université de Montréal';
    const out = parseAuthorsText(raw);

    expect(out.institutions.map((i) => i.name)).toEqual([
      'McGill University',
      'Douglas Research Center',
      'Université de Montréal',
    ]);

    expect(out.authors.map((a) => a.name)).toEqual([
      'Enqi Wang',
      'Gavin (Zihao) Geng',
      'Corina Lazarenco',
      'Maxime Montembeault',
    ]);

    // Wang has affiliations 1 and 2
    expect(out.authors[0]!.affiliationIds).toHaveLength(2);
    expect(out.authors[0]!.affiliationIds).toEqual([
      out.institutions[0]!.id,
      out.institutions[1]!.id,
    ]);

    // Geng has affiliation 1 only
    expect(out.authors[1]!.affiliationIds).toEqual([
      out.institutions[0]!.id,
    ]);

    // Montembeault has all three
    expect(out.authors[3]!.affiliationIds).toHaveLength(3);
  });

  it('detects corresponding-author dagger marker', () => {
    const raw =
      'Alice Smith1†, Bob Jones1\n(1) MIT';
    const out = parseAuthorsText(raw);
    expect(out.authors[0]!.isCorresponding).toBe(true);
    expect(out.authors[1]!.isCorresponding).toBe(false);
    expect(out.authors[0]!.name).toBe('Alice Smith');
  });

  it('detects equal-contribution star marker', () => {
    const raw = 'Alice Smith1*, Bob Jones1*\n(1) MIT';
    const out = parseAuthorsText(raw);
    expect(out.authors[0]!.equalContrib).toBe(true);
    expect(out.authors[1]!.equalContrib).toBe(true);
  });

  it('expands ranges like 1-3 in affiliation refs', () => {
    const raw = 'Alice Smith1-3\n(1) A, (2) B, (3) C';
    const out = parseAuthorsText(raw);
    expect(out.authors[0]!.affiliationIds).toHaveLength(3);
  });

  it('handles single-line "(1) X" suffix without newline', () => {
    const raw = 'Alice Smith1 (1) MIT';
    const out = parseAuthorsText(raw);
    expect(out.institutions).toHaveLength(1);
    expect(out.institutions[0]!.name).toBe('MIT');
    expect(out.authors).toHaveLength(1);
    expect(out.authors[0]!.name).toBe('Alice Smith');
  });

  it('preserves names containing parenthetical content', () => {
    const raw = 'Gavin (Zihao) Geng1\n(1) McGill';
    const out = parseAuthorsText(raw);
    expect(out.authors[0]!.name).toBe('Gavin (Zihao) Geng');
  });

  it('handles a list with no affiliations', () => {
    const out = parseAuthorsText('Alice, Bob, Carol');
    expect(out.institutions).toEqual([]);
    expect(out.authors.map((a) => a.name)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});
