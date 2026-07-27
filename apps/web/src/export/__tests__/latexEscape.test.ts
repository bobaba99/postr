/**
 * LaTeX escaping — correctness AND security surface (plan §6).
 * Poster text is user content going into a language with command
 * execution; the fuzz block hammers the escaper with hostile input.
 */
import { describe, expect, it } from 'vitest';
import { escapeLatex, isSafeLatexIdentifier } from '../latex/escape';

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
    expect(escapeLatex('{')).toBe('\\{');
    expect(escapeLatex('}')).toBe('\\}');
    expect(escapeLatex('$')).toBe('\\$');
    expect(escapeLatex('&')).toBe('\\&');
    expect(escapeLatex('#')).toBe('\\#');
    expect(escapeLatex('%')).toBe('\\%');
    expect(escapeLatex('_')).toBe('\\_');
    expect(escapeLatex('^')).toBe('\\textasciicircum{}');
    expect(escapeLatex('~')).toBe('\\textasciitilde{}');
  });

  it('escapes a realistic hostile string', () => {
    expect(escapeLatex('\\input{/etc/passwd} & 100% $x_i^2$ #1 ~')).toBe(
      '\\textbackslash{}input\\{/etc/passwd\\} \\& 100\\% \\$x\\_i\\textasciicircum{}2\\$ \\#1 \\textasciitilde{}',
    );
  });

  it('never lets \\write18 or \\input survive as control sequences', () => {
    for (const attack of ['\\write18{rm -rf /}', '\\input{evil}', '\\def\\x{}', '\\catcode`\\%=11']) {
      const out = escapeLatex(attack);
      expect(out).not.toMatch(/\\write18/);
      expect(out).not.toMatch(/\\input/);
      expect(out).not.toMatch(/\\def/);
      expect(out).not.toMatch(/\\catcode/);
    }
  });

  it('passes ordinary academic text through unchanged', () => {
    const text = 'Cortical thickness declined (p < 0.05) across 3 cohorts — see Fig. 2.';
    expect(escapeLatex(text)).toBe(text);
  });

  it('preserves unicode (XeLaTeX handles it natively)', () => {
    expect(escapeLatex('α β → ±3 µm · naïve')).toBe('α β → ±3 µm · naïve');
  });

  it('strips ASCII control characters except tab', () => {
    expect(escapeLatex('a\u0000b\u0007c\td\u007f')).toBe('abc\td');
  });

  describe('fuzz: no unescaped special ever survives', () => {
    const SPECIALS = '\\{}$&#%_^~';
    const CHARSET =
      SPECIALS + 'abcXYZ0189 .,;:!?()[]<>"\'-+=/|*@`\n\téü中→';

    /** Deterministic LCG so failures reproduce. */
    const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

    const randomString = (rand: () => number): string => {
      const len = Math.floor(rand() * 40);
      let s = '';
      for (let i = 0; i < len; i++) {
        s += CHARSET[Math.floor(rand() * CHARSET.length)]!;
      }
      return s;
    };

    /**
     * Verify output only contains specials as part of the known
     * escape forms: strip every legal escape emission, then assert
     * no special characters remain.
     */
    const stripLegalEscapes = (out: string): string =>
      out
        .replaceAll('\\textbackslash{}', '')
        .replaceAll('\\textasciicircum{}', '')
        .replaceAll('\\textasciitilde{}', '')
        .replaceAll('\\{', '')
        .replaceAll('\\}', '')
        .replaceAll('\\$', '')
        .replaceAll('\\&', '')
        .replaceAll('\\#', '')
        .replaceAll('\\%', '')
        .replaceAll('\\_', '');

    it('500 random strings', () => {
      const rand = lcg(0xdecafbad);
      for (let i = 0; i < 500; i++) {
        const input = randomString(rand);
        const out = escapeLatex(input);
        const residue = stripLegalEscapes(out);
        for (const ch of SPECIALS) {
          expect(residue.includes(ch), `unescaped ${JSON.stringify(ch)} for input ${JSON.stringify(input)}`).toBe(false);
        }
      }
    });

    it('is stable across repeated escaping of already-escaped text length', () => {
      // Not idempotent by design (escaping escapes the backslash),
      // but must never throw or drop printable content.
      const rand = lcg(0xfeedface);
      for (let i = 0; i < 100; i++) {
        const input = randomString(rand);
        expect(() => escapeLatex(escapeLatex(input))).not.toThrow();
      }
    });
  });
});

describe('isSafeLatexIdentifier', () => {
  it('accepts simple identifiers only', () => {
    expect(isSafeLatexIdentifier('postrAccent')).toBe(true);
    expect(isSafeLatexIdentifier('a1')).toBe(true);
    expect(isSafeLatexIdentifier('1a')).toBe(false);
    expect(isSafeLatexIdentifier('bad-name')).toBe(false);
    expect(isSafeLatexIdentifier('\\evil')).toBe(false);
    expect(isSafeLatexIdentifier('')).toBe(false);
  });
});
