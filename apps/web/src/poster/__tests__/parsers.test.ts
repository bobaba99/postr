import { describe, it, expect } from 'vitest';
import { parseBibtex, parseRis } from '../parsers';

describe('parseBibtex', () => {
  it('parses a single article entry', () => {
    const bib = `@article{smith2024,
      author = {Smith, John and Doe, Alice},
      title = {A study of academic posters},
      journal = {Journal of Visual Communication},
      year = {2024},
      doi = {10.1234/abc}
    }`;
    const refs = parseBibtex(bib);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      authors: ['Smith, John', 'Doe, Alice'],
      title: 'A study of academic posters',
      journal: 'Journal of Visual Communication',
      year: '2024',
      doi: '10.1234/abc',
    });
  });

  it('parses multiple entries', () => {
    const bib = `@article{a, title = {First}, year = {2020}}
                 @article{b, title = {Second}, year = {2021}}`;
    expect(parseBibtex(bib)).toHaveLength(2);
  });

  it('falls back to booktitle when journal is missing', () => {
    const bib = `@inproceedings{x, title={Conf paper}, booktitle={Proceedings of ABC}, year={2023}}`;
    expect(parseBibtex(bib)[0]?.journal).toBe('Proceedings of ABC');
  });

  it('skips entries without a title', () => {
    const bib = `@misc{noTitle, year = {2024}}`;
    expect(parseBibtex(bib)).toHaveLength(0);
  });

  it('handles double-quoted field values', () => {
    const bib = `@article{q, title = "Quoted title", year = "2024"}`;
    expect(parseBibtex(bib)[0]?.title).toBe('Quoted title');
  });

  it('returns empty array for empty input', () => {
    expect(parseBibtex('')).toEqual([]);
  });

  it('assigns ids to each parsed reference', () => {
    const bib = `@article{a, title={A}}@article{b, title={B}}`;
    const refs = parseBibtex(bib);
    expect(refs[0]?.id).toBeTruthy();
    expect(refs[1]?.id).toBeTruthy();
    expect(refs[0]?.id).not.toBe(refs[1]?.id);
  });
});

describe('parseRis', () => {
  it('parses a single article entry', () => {
    const ris = `TY  - JOUR
AU  - Smith, John
AU  - Doe, Alice
TI  - A study of academic posters
JO  - Journal of Visual Communication
PY  - 2024/03/15
DO  - 10.1234/abc
ER  - `;
    const refs = parseRis(ris);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      authors: ['Smith, John', 'Doe, Alice'],
      title: 'A study of academic posters',
      journal: 'Journal of Visual Communication',
      year: '2024',
      doi: '10.1234/abc',
    });
  });

  it('parses multiple entries', () => {
    const ris = `TY  - JOUR
TI  - First
ER  -
TY  - JOUR
TI  - Second
ER  - `;
    expect(parseRis(ris)).toHaveLength(2);
  });

  it('accepts AU and A1 as author tags', () => {
    const ris = `TY  - JOUR
A1  - Alpha, A
AU  - Bravo, B
TI  - Mixed authors
ER  - `;
    expect(parseRis(ris)[0]?.authors).toEqual(['Alpha, A', 'Bravo, B']);
  });

  it('skips entries without title', () => {
    const ris = `TY  - JOUR
AU  - Solo, S
ER  - `;
    expect(parseRis(ris)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseRis('')).toEqual([]);
  });
});
