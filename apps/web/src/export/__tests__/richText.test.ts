/**
 * Rich-text run parser — the sanitized-HTML → styled-runs bridge
 * both export writers depend on (plan §6: "rich-text run splitting").
 */
import { describe, expect, it } from 'vitest';
import {
  cssColorToHex6,
  decodeEntities,
  parseRichText,
  richTextToPlain,
  splitItalicMarkers,
} from '../richText';

describe('parseRichText', () => {
  it('returns [] for empty input', () => {
    expect(parseRichText('')).toEqual([]);
  });

  it('parses plain text as a single unstyled run', () => {
    const [p] = parseRichText('Hello poster');
    expect(p?.runs).toHaveLength(1);
    expect(p?.runs[0]).toMatchObject({
      text: 'Hello poster',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      sub: false,
      sup: false,
      color: null,
      highlight: null,
    });
  });

  it('splits runs at style boundaries', () => {
    const [p] = parseRichText('plain <b>bold</b> tail');
    expect(p?.runs.map((r) => [r.text, r.bold])).toEqual([
      ['plain ', false],
      ['bold', true],
      [' tail', false],
    ]);
  });

  it('handles nested styles cumulatively', () => {
    const [p] = parseRichText('<b>bold <i>bold-italic</i></b>');
    expect(p?.runs).toHaveLength(2);
    expect(p?.runs[0]).toMatchObject({ text: 'bold ', bold: true, italic: false });
    expect(p?.runs[1]).toMatchObject({ text: 'bold-italic', bold: true, italic: true });
  });

  it('maps strong/em to bold/italic', () => {
    const [p] = parseRichText('<strong>a</strong><em>b</em>');
    expect(p?.runs[0]).toMatchObject({ text: 'a', bold: true });
    expect(p?.runs[1]).toMatchObject({ text: 'b', italic: true });
  });

  it('maps u / s / strike / del (identical styles merge)', () => {
    const [p] = parseRichText('<u>u</u><s>s</s><strike>k</strike><del>d</del>');
    expect(p?.runs[0]).toMatchObject({ text: 'u', underline: true, strike: false });
    // s / strike / del all map to strike — adjacent identical
    // styles merge into a single run.
    expect(p?.runs[1]).toMatchObject({ text: 'skd', strike: true });
    expect(p?.runs).toHaveLength(2);
  });

  it('merges adjacent runs with identical style', () => {
    const [p] = parseRichText('<s>a</s><del>b</del>');
    expect(p?.runs).toHaveLength(1);
    expect(p?.runs[0]).toMatchObject({ text: 'ab', strike: true });
  });

  it('maps sub and sup', () => {
    const [p] = parseRichText('H<sub>2</sub>O and x<sup>2</sup>');
    expect(p?.runs[1]).toMatchObject({ text: '2', sub: true });
    expect(p?.runs[3]).toMatchObject({ text: '2', sup: true });
  });

  it('maps mark to the default highlight', () => {
    const [p] = parseRichText('<mark>hi</mark>');
    expect(p?.runs[0]).toMatchObject({ text: 'hi', highlight: '#FFFF00' });
  });

  it('reads span color and background-color', () => {
    const [p] = parseRichText(
      '<span style="color: #c1121f">red</span><span style="background-color: rgb(255, 235, 59)">hl</span>',
    );
    expect(p?.runs[0]).toMatchObject({ text: 'red', color: '#c1121f' });
    expect(p?.runs[1]).toMatchObject({ text: 'hl', highlight: 'rgb(255, 235, 59)' });
  });

  it('splits paragraphs on <br>', () => {
    const ps = parseRichText('line one<br>line two');
    expect(ps).toHaveLength(2);
    expect(ps[0]?.runs[0]?.text).toBe('line one');
    expect(ps[1]?.runs[0]?.text).toBe('line two');
  });

  it('splits paragraphs on literal newlines (pre-wrap content)', () => {
    const ps = parseRichText('alpha\nbeta');
    expect(ps).toHaveLength(2);
    expect(ps[1]?.runs[0]?.text).toBe('beta');
  });

  it('carries style across a <br> inside a styled range', () => {
    const ps = parseRichText('<b>one<br>two</b>');
    expect(ps).toHaveLength(2);
    expect(ps[0]?.runs[0]).toMatchObject({ text: 'one', bold: true });
    expect(ps[1]?.runs[0]).toMatchObject({ text: 'two', bold: true });
  });

  it('drops trailing empty paragraphs from dangling <br>', () => {
    const ps = parseRichText('text<br>');
    expect(ps).toHaveLength(1);
  });

  it('preserves interior blank lines', () => {
    const ps = parseRichText('a<br><br>b');
    expect(ps).toHaveLength(3);
    expect(ps[1]?.runs).toHaveLength(0);
  });

  it('decodes entities', () => {
    const [p] = parseRichText('Smith &amp; Doe &lt;2026&gt; &#39;q&#39;&nbsp;&#x41;');
    expect(p?.runs[0]?.text).toBe("Smith & Doe <2026> 'q' A");
  });

  it('treats an unknown < sequence as literal text', () => {
    const [p] = parseRichText('x < y and p<0.05');
    expect(richTextToPlain([p!])).toBe('x < y and p<0.05');
  });

  it('parses unordered lists into bulleted paragraphs', () => {
    const ps = parseRichText('<ul><li>first</li><li>second</li></ul>');
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatchObject({ list: 'unordered', listIndex: null });
    expect(ps[0]?.runs[0]?.text).toBe('first');
    expect(ps[1]?.runs[0]?.text).toBe('second');
  });

  it('numbers ordered lists, honoring start', () => {
    const ps = parseRichText('<ol start="5"><li>five</li><li>six</li></ol>');
    expect(ps[0]).toMatchObject({ list: 'ordered', listIndex: 5 });
    expect(ps[1]).toMatchObject({ list: 'ordered', listIndex: 6 });
  });

  it('text after a list starts a fresh non-list paragraph', () => {
    const ps = parseRichText('<ul><li>item</li></ul>after');
    expect(ps).toHaveLength(2);
    expect(ps[1]).toMatchObject({ list: null });
    expect(ps[1]?.runs[0]?.text).toBe('after');
  });

  it('tolerates mismatched closing tags without crashing', () => {
    const ps = parseRichText('<b>bold</i></b> plain');
    expect(richTextToPlain(ps)).toBe('bold plain');
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal, and hex entities', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;&#65;&#x42;')).toBe('&<>"\'AB');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&bogus; &;')).toBe('&bogus; &;');
  });
});

describe('splitItalicMarkers', () => {
  it('splits the citations.ts _italic_ dialect', () => {
    expect(splitItalicMarkers('Smith (2026). Title. _Journal of Tests_.')).toEqual([
      { text: 'Smith (2026). Title. ', italic: false },
      { text: 'Journal of Tests', italic: true },
      { text: '.', italic: false },
    ]);
  });

  it('passes through text without markers', () => {
    expect(splitItalicMarkers('no markers')).toEqual([
      { text: 'no markers', italic: false },
    ]);
  });
});

describe('cssColorToHex6', () => {
  it('normalizes hex forms', () => {
    expect(cssColorToHex6('#c1121f')).toBe('C1121F');
    expect(cssColorToHex6('#abc')).toBe('AABBCC');
    expect(cssColorToHex6('#aabbccdd')).toBe('AABBCC');
    expect(cssColorToHex6('#abcd')).toBe('AABBCC');
  });

  it('normalizes rgb()/rgba()', () => {
    expect(cssColorToHex6('rgb(255, 235, 59)')).toBe('FFEB3B');
    expect(cssColorToHex6('rgba(0, 0, 0, 0.5)')).toBe('000000');
  });

  it('returns null for unparseable values', () => {
    expect(cssColorToHex6('url(javascript:x)')).toBeNull();
    expect(cssColorToHex6('')).toBeNull();
    expect(cssColorToHex6(null)).toBeNull();
  });
});
