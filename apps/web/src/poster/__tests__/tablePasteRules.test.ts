/**
 * Fix 32 — the paste rule table, read on its own (docs/fixes/32-table-paste.md).
 * `readCellPaste` says what a paste into a cell is (a grid, or text for the
 * caret); `pasteGrid` fills a table from a cell; `cleanPastedHtml` is what
 * a paste into text keeps. The user's entry (a click and a paste in the
 * editor) is tablePaste.test.tsx's; the engines' own clipboard is
 * scripts/table-paste-check.mjs's.
 *
 * Re-run: npx vitest run src/poster/__tests__/tablePasteRules.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { TableData } from '@postr/shared';
import { pasteGrid, readCellPaste } from '../tablePaste';
import { cleanPastedHtml, pastedHtml } from '../pasteClean';

const table = (rows: number, cols: number, widths: number[] | null = null): TableData => ({
  rows,
  cols,
  cells: Array.from({ length: rows * cols }, (_, i) => `c${i}`),
  colWidths: widths,
  borderPreset: 'three-line',
});

describe('readCellPaste: which rule a paste follows', () => {
  it('one line of plain text is text for the caret', () => {
    expect(readCellPaste('', 'ZQW 12.4')).toEqual({ kind: 'text', html: 'ZQW 12.4' });
  });

  it('one final line break, in any of its spellings, does not make a row', () => {
    expect(readCellPaste('', 'a\n')).toEqual({ kind: 'text', html: 'a' });
    expect(readCellPaste('', 'a\r\n')).toEqual({ kind: 'text', html: 'a' });
    expect(readCellPaste('', 'a\r')).toEqual({ kind: 'text', html: 'a' });
  });

  it('blank lines at the end are not rows, in any spelling; one at the start is (R1-F2)', () => {
    expect(readCellPaste('', 'a\nb\n\n')).toEqual({ kind: 'grid', rows: [['a'], ['b']] });
    expect(readCellPaste('', 'a\r\n\r\n\r\n')).toEqual({ kind: 'text', html: 'a' });
    expect(readCellPaste('', 'a\tb\n\n')).toEqual({ kind: 'grid', rows: [['a', 'b']] });
    // A leading empty line is an empty first row (a range whose first cell is empty keeps its place).
    expect(readCellPaste('', '\na')).toEqual({ kind: 'grid', rows: [[''], ['a']] });
  });

  it('one line whose HTML ends in a line break (an engine\'s copy of a whole paragraph) is text with no break (R1-F2)', () => {
    expect(readCellPaste('<p>x <b>y</b></p><br class="Apple-interchange-newline">', 'x y\n\n')).toEqual({ kind: 'text', html: 'x <b>y</b>' });
    expect(readCellPaste('<p>x</p><br class="Apple-interchange-newline">', 'x\n')).toEqual({ kind: 'text', html: 'x' });
  });

  it('a tab, or a second line, makes a grid', () => {
    expect(readCellPaste('', 'a\tb')).toEqual({ kind: 'grid', rows: [['a', 'b']] });
    expect(readCellPaste('', 'a\nb')).toEqual({ kind: 'grid', rows: [['a'], ['b']] });
    expect(readCellPaste('', 'a\r\nb\r\n')).toEqual({ kind: 'grid', rows: [['a'], ['b']] });
    expect(readCellPaste('', 'a\rb')).toEqual({ kind: 'grid', rows: [['a'], ['b']] });
  });

  it('keeps empty rows and empty cells (nothing dropped)', () => {
    expect(readCellPaste('', 'a\tb\n\t\nc\td\n')).toEqual({ kind: 'grid', rows: [['a', 'b'], ['', ''], ['c', 'd']] });
    expect(readCellPaste('', 'a\n\nb')).toEqual({ kind: 'grid', rows: [['a'], [''], ['b']] });
  });

  it('a grid\'s plain text is stored as text', () => {
    expect(readCellPaste('', 'x<y\ta & b>c')).toEqual({ kind: 'grid', rows: [['x&lt;y', 'a &amp; b&gt;c']] });
  });

  it('an HTML table is read before the plain text, rows padded to the widest', () => {
    const html = '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></table>';
    expect(readCellPaste(html, 'ignored\tplain')).toEqual({ kind: 'grid', rows: [['a', 'b', 'c'], ['d', '', '']] });
  });

  it('a merged cell keeps the cells after it in their columns, across and down', () => {
    const html = '<table><tr><td colspan="2">G</td><td>H</td></tr><tr><td rowspan="2">R</td><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>';
    expect(readCellPaste(html, '')).toEqual({ kind: 'grid', rows: [['G', '', 'H'], ['R', '1', '2'], ['', '3', '4']] });
  });

  it('a rowspan past the table\'s last row, or of 0, stops at the last row', () => {
    const html = '<table><tr><td rowspan="9">A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    expect(readCellPaste(html, '')).toEqual({ kind: 'grid', rows: [['A', 'B'], ['', 'C']] });
    const zero = '<table><tr><td rowspan="0">A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    expect(readCellPaste(zero, '')).toEqual({ kind: 'grid', rows: [['A', 'B'], ['', 'C']] });
  });

  it('a cell keeps its tags and line breaks, drops colour, font and edge space, and reads source whitespace as HTML draws it', () => {
    const html = `<table><tr>
      <td style="color:red;font-family:Georgia"><p class=MsoNormal><b>Mean</b><o:p></o:p></p></td>
      <td>a long label wrapped
        in its source</td>
      <td>L1<br>
        L2</td>
      <td><p>P1</p>
        <p>P2</p></td>
      <td><p><o:p>&nbsp;</o:p></p></td>
      <td><span style="color: rgb(255, 0, 0)">x</span><sup>2</sup> <mark>m</mark></td>
      <td><pre>a  b</pre></td>
      <td>
        Mean (SD)&nbsp;
      </td>
      <td>last<br></td>
    </tr></table>`;
    expect(readCellPaste(html, '')).toEqual({
      kind: 'grid',
      rows: [['<b>Mean</b>', 'a long label wrapped in its source', 'L1<br>L2', 'P1<br>P2', '', 'x<sup>2</sup> m', 'a  b', 'Mean (SD)', 'last']],
    });
  });

  it('a cell has no &nbsp; beside its line breaks (plain spaces there are the source\'s line edges, read as drawn)', () => {
    const html = '<table><tr><td>a&nbsp;<br>&nbsp;b</td><td><p>c&nbsp;</p><p>d</p></td></tr></table>';
    expect(readCellPaste(html, '')).toEqual({ kind: 'grid', rows: [['a<br>b', 'c<br>d']] });
  });

  it('a table copied from cells drawn pre-wrap (Firefox\'s copy of a poster\'s own table) keeps its cells\' spaces, as its plain text shows them', () => {
    expect(readCellPaste('<table><tr><td>a  b</td><td>c</td></tr></table>', 'a  b\tc')).toEqual({ kind: 'grid', rows: [['a  b', 'c']] });
    expect(readCellPaste('<table><tr><td>a\n   b</td></tr></table>', 'a b')).toEqual({ kind: 'grid', rows: [['a b']] });
  });

  it('a cell showing markup keeps it as text', () => {
    const html = '<table><tr><td>&lt;img src=x onerror="alert(1)"&gt;</td></tr></table>';
    expect(readCellPaste(html, '')).toEqual({ kind: 'grid', rows: [['&lt;img src=x onerror="alert(1)"&gt;']] });
  });

  it('a style sheet and Office fragments around the table are not text outside it', () => {
    const html = '<html><head><style>.xl65{color:red}</style></head><body><!--StartFragment--><table><tr><td>a</td></tr></table><!--EndFragment--><p class=MsoNormal><o:p>&nbsp;</o:p></p></body></html>';
    expect(readCellPaste(html, 'a')).toEqual({ kind: 'grid', rows: [['a']] });
    const sheets = '<meta charset="utf-8"><google-sheets-html-origin><style><!--td {border: 1px solid #ccc;}--></style><table><tr><td>a</td><td>b</td></tr></table></google-sheets-html-origin>';
    expect(readCellPaste(sheets, 'a\tb')).toEqual({ kind: 'grid', rows: [['a', 'b']] });
  });

  it('text copied with the table is not dropped: the plain text is read instead', () => {
    const html = '<p>Table 1. Results</p><table><tr><td>a</td><td>b</td></tr></table>';
    expect(readCellPaste(html, 'Table 1. Results\na\tb\n')).toEqual({ kind: 'grid', rows: [['Table 1. Results'], ['a', 'b']] });
  });

  it('a table\'s caption is not dropped either: the plain text is read', () => {
    const html = '<table><caption>Table 2</caption><tr><td>a</td></tr></table>';
    expect(readCellPaste(html, 'Table 2\na\n')).toEqual({ kind: 'grid', rows: [['Table 2'], ['a']] });
  });

  it('a nested table belongs to its outer cell', () => {
    const html = '<table><tr><td>x<table><tr><td>in1</td><td>in2</td></tr></table></td><td>y</td></tr></table>';
    expect(readCellPaste(html, '')).toEqual({ kind: 'grid', rows: [['x<br>in1<br>in2', 'y']] });
  });

  it('HTML with no table is text for the caret, cleaned', () => {
    expect(readCellPaste('<span style="color:#f00"><b>Z</b></span>', 'Z')).toEqual({ kind: 'text', html: '<b>Z</b>' });
  });

  it('nothing with text (an image alone, or nothing) is left to the browser', () => {
    expect(readCellPaste('', '')).toBeNull();
    expect(readCellPaste('<img src="data:image/png;base64,AAAA">', '')).toBeNull();
    expect(readCellPaste('<table><tr></tr></table>', '')).toBeNull();
  });
});

describe('pasteGrid: the table filled from a cell', () => {
  it('inside the table: only the pasted area changes, the size and widths stay', () => {
    const t = table(3, 3, [20, 30, 50]);
    const next = pasteGrid(t, 1, 1, [['p', 'q'], ['r', 's']]);
    expect(next).toEqual({ ...t, cells: ['c0', 'c1', 'c2', 'c3', 'p', 'q', 'c6', 'r', 's'] });
    expect(t.cells[4]).toBe('c4');
  });

  it('past the edges: rows and columns added, new cells outside the paste empty, widths made even', () => {
    const t = table(2, 2, [40, 60]);
    const next = pasteGrid(t, 1, 1, [['p', 'q', 'r'], ['s', 't', 'u']]);
    expect(next.rows).toBe(3);
    expect(next.cols).toBe(4);
    expect(next.colWidths).toBeNull();
    expect(next.borderPreset).toBe('three-line');
    expect(next.cells).toEqual([
      'c0', 'c1', '', '',
      'c2', 'p', 'q', 'r',
      '', 's', 't', 'u',
    ]);
  });

  it('only rows added: the column widths are kept', () => {
    const t = table(2, 2, [40, 60]);
    expect(pasteGrid(t, 1, 0, [['a', 'b'], ['c', 'd']]).colWidths).toEqual([40, 60]);
  });

  it('a pasted empty cell empties its cell; the pasted area is the grid\'s rectangle', () => {
    const t = table(2, 3);
    expect(pasteGrid(t, 0, 0, [['', 'x', '']]).cells).toEqual(['', 'x', '', 'c3', 'c4', 'c5']);
  });

  it('a short stored cell list reads as empty cells', () => {
    const t: TableData = { rows: 2, cols: 2, cells: ['a'], colWidths: null, borderPreset: 'apa' };
    expect(pasteGrid(t, 1, 1, [['z']]).cells).toEqual(['a', '', '', 'z']);
  });
});

describe('cleanPastedHtml: a paste into text takes the poster\'s style', () => {
  it('keeps bold, italic, underline, strikethrough, sub, sup, lists and line breaks', () => {
    const html = '<b>b</b><i>i</i><u>u</u><s>s</s>H<sub>2</sub>x<sup>3</sup><ul><li>one</li></ul>a<br>b';
    expect(cleanPastedHtml(html, true)).toBe('<b>b</b><i>i</i><u>u</u><s>s</s>H<sub>2</sub>x<sup>3</sup><ul><li>one</li></ul>a<br>b');
  });

  it('drops the source\'s colour, highlight, font and size', () => {
    const html = '<span style="color: rgb(1, 2, 3); background-color: #ff0; font: 30px Georgia">c</span> <mark>m</mark> <font color="red" face="Times">f</font>';
    expect(cleanPastedHtml(html, true)).toBe('c m f');
  });

  it('drops a style sheet, a script and a title with their text', () => {
    const html = '<html><head><title>T</title><style>p{color:red}</style></head><body><style>td{x:y}</style><script>bad()</script><p>ok</p></body></html>';
    expect(cleanPastedHtml(html, true)).toBe('ok');
  });

  it('unwraps a <b> or <strong> that says it is not bold, keeps one that is', () => {
    expect(cleanPastedHtml('<b style="font-weight:normal;" id="docs-internal-guid-x"><span>plain</span> <b>bold</b></b>', true)).toBe('plain <b>bold</b>');
    expect(cleanPastedHtml('<strong style="font-weight: 400">plain</strong>', true)).toBe('plain');
    expect(cleanPastedHtml('<b style="font-weight: 700">bold</b>', true)).toBe('<b>bold</b>');
    expect(cleanPastedHtml('<b style="font-weight: 600">semi</b>', true)).toBe('<b>semi</b>');
  });

  it('keeps Word\'s bold and italic, which carry a complex-script weight in their style (R1-F1)', () => {
    expect(cleanPastedHtml("<b style='mso-bidi-font-weight:normal'>b</b> <i style='mso-bidi-font-style:normal'>i</i>", true)).toBe('<b>b</b> <i>i</i>');
    expect(cleanPastedHtml("<strong style='mso-bidi-font-weight: normal; color: red'>s</strong>", true)).toBe('<strong>s</strong>');
  });

  it('reads the weight a style\'s last font-weight gives, by property name', () => {
    expect(cleanPastedHtml('<b style="mso-bidi-font-weight:normal;font-weight:normal">n</b>', true)).toBe('n');
    expect(cleanPastedHtml('<b style="font-weight:normal;font-weight:bold">b</b>', true)).toBe('<b>b</b>');
    expect(cleanPastedHtml('<b style="FONT-WEIGHT: 400 !important">n</b>', true)).toBe('n');
  });

  it('reads source whitespace as HTML draws it: a run is one space, none at a line\'s edges (R1-F3)', () => {
    expect(cleanPastedHtml('<p>a long line wrapped\r\n   in its source</p>', true)).toBe('a long line wrapped in its source');
    expect(cleanPastedHtml('<p>\n  a\n</p>\n<p>\n  b\n</p>', true)).toBe('a<br>b');
    expect(cleanPastedHtml('<p>a\n</p><p>b</p>', false)).toBe('a b');
    expect(cleanPastedHtml('L1 <br>\n   L2', true)).toBe('L1<br>L2');
    expect(cleanPastedHtml('a <b> bold </b> c', true)).toBe('a <b> bold </b> c');
  });

  it('keeps the whitespace the plain text shows as written (an engine\'s copy of text drawn pre-wrap), else reads it as drawn', () => {
    expect(cleanPastedHtml('a\n<b>b</b>  c', true, 'a\nb  c')).toBe('a\n<b>b</b>  c');
    // A line made with Enter is a <br> (or a <div>) in the copy: its double space and its indent are kept.
    expect(cleanPastedHtml('a<br>b  c<br>  d', true, 'a\nb  c\n  d')).toBe('a<br>b  c<br>  d');
    expect(cleanPastedHtml('a<div>b  c</div>', true, 'a\nb  c')).toBe('a<br>b  c');
    expect(cleanPastedHtml('<div>a</div><div>b  c</div>', true, 'a\nb  c')).toBe('a<br>b  c');
    expect(cleanPastedHtml('a<br>b  c', true, 'a\r\nb  c')).toBe('a<br>b  c');
    // A pretty-printed page whose plain text draws the newline as a space: read as drawn.
    expect(cleanPastedHtml('<p><b>a</b>\n<i>b</i></p><p>c</p>', true, 'a b\n\nc')).toBe('<b>a</b> <i>b</i><br>c');
    expect(cleanPastedHtml('<p>a wrapped\n   line</p>', true, 'a wrapped line')).toBe('a wrapped line');
    expect(cleanPastedHtml('<p>a wrapped\n   line</p>', true)).toBe('a wrapped line');
  });

  it('a pretty-printed list keeps no newline between its items (fix 27\'s R2-A6, its second part)', () => {
    expect(cleanPastedHtml('<ul>\n  <li>L1</li>\n  <li>L2</li>\n</ul>', true)).toBe('<ul><li>L1</li><li>L2</li></ul>');
    expect(cleanPastedHtml('<p>a</p>\n<ul>\n<li>x</li>\n</ul>\n<p>b</p>', true)).toBe('a<br><ul><li>x</li></ul>b');
  });

  it('keeps whitespace where the source keeps it: <pre>, and white-space pre, pre-wrap, break-spaces', () => {
    expect(cleanPastedHtml('<pre>a  b\nc</pre>', true)).toBe('a  b\nc');
    expect(cleanPastedHtml('<span style="white-space:pre;white-space:pre-wrap;">a  b</span>', true)).toBe('a  b');
    expect(cleanPastedHtml('<div style="white-space: break-spaces"><span>a  b</span></div>', true)).toBe('a  b');
    expect(cleanPastedHtml('<pre style="white-space: normal">a  b</pre>', true)).toBe('a b');
    expect(cleanPastedHtml('<span style="white-space:nowrap">a  b</span>', true)).toBe('a b');
    // Kept whitespace is kept at a line's edges too.
    expect(cleanPastedHtml('<p><span style="white-space:pre-wrap">  indented</span></p>', true)).toBe('  indented');
  });

  it('a paragraph boundary is a line break, or a space in a one-line field', () => {
    expect(cleanPastedHtml('<p>a</p><p>b</p>', true)).toBe('a<br>b');
    expect(cleanPastedHtml('<p>a</p><p>b</p>', false)).toBe('a b');
  });

  it('plain text is escaped, not read as markup', () => {
    expect(pastedHtml('', '<b>x</b> & y', true)).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});
