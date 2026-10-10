/**
 * Clipboard payloads for scripts/table-paste-check.mjs (record
 * docs/fixes/32-table-paste.md): what a user's ⌘C in another application
 * puts on the clipboard, by shape. The HTML shapes follow what Excel, Word,
 * Google Sheets and Google Docs are known to write (a full Office document
 * with a style sheet and `class=xl…` cells; Word's `MsoTableGrid` with a
 * `<p class=MsoNormal>` in every cell; Sheets' `<google-sheets-html-origin>`
 * with its own style sheet; Docs' non-bold `<b id="docs-internal-guid-…">`
 * wrapper). They are knowledge, not copies of a real clipboard: UNVERIFIED
 * against each application (record section 3). Every cell holds a marker
 * (ZQ…) so the harness can say where it landed.
 *
 * A grid shape's `expect` is the stored cell HTML of each pasted cell, row
 * by row, as the rule table says it is kept: bold, italic, underline, sub
 * and sup kept; colour, highlight, font and size dropped; "<" stored as
 * "&lt;"; a merged cell's text in its first cell and the cells it covers
 * empty; the line break a cell shows kept as <br>; source-code whitespace
 * read as HTML draws it (one space, none at a line's start or end).
 */

/** An Excel range: a full Office document (Windows' shape; the fragment markers inside the table). */
const EXCEL_HTML = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
<style>
<!--table
	{mso-displayed-decimal-separator:"\\.";
	mso-displayed-thousand-separator:"\\,";}
.xl65
	{font-weight:700;
	text-align:center;}
.xl66
	{color:red;}
-->
</style>
</head>

<body link="#0563C1" vlink="#954F72">

<table border=0 cellpadding=0 cellspacing=0 width=256 style='border-collapse:
 collapse;width:192pt'>
<!--StartFragment-->
 <col width=64 span=4 style='width:48pt'>
 <tr height=20 style='height:15.0pt'>
  <td colspan=2 height=20 class=xl65 width=128 style='height:15.0pt;
  width:96pt'>ZQX1 group</td>
  <td class=xl65 width=64 style='width:48pt'>ZQX3</td>
  <td class=xl65 width=64 style='width:48pt'>ZQX4</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 style='height:15.0pt'>ZQX5</td>
  <td class=xl66>ZQX6 a long label that Excel wraps in
  its source</td>
  <td></td>
  <td>p &lt; .05 ZQX8</td>
 </tr>
 <tr height=40 style='height:30.0pt'>
  <td height=40 class=xl67 width=64 style='height:30.0pt;width:48pt'>ZQXa<br>
    ZQXb</td>
  <td align=right>12.40</td>
  <td align=right>ZQX11</td>
  <td align=right>ZQX12</td>
 </tr>
<!--EndFragment-->
</table>

</body>

</html>`;

const EXCEL_TEXT = 'ZQX1 group\t\tZQX3\tZQX4\r\nZQX5\tZQX6 a long label that Excel wraps in its source\t\tp < .05 ZQX8\r\n"ZQXa\nZQXb"\t12.40\tZQX11\tZQX12\r\n';

/**
 * A Word table: two rows of three, a style sheet, a <p class=MsoNormal> in
 * every cell. Bold and italic are written as Word writes them, with a
 * complex-script weight in their own style (`<b style='mso-bidi-font-weight:
 * normal'>`): a check for "not bold" that read any `font-weight: normal` in
 * the style unwrapped them (record 32 section 9, R1-F1).
 */
const WORD_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Word.Document>
<style><!-- /* Style Definitions */ p.MsoNormal {margin:0cm; font-size:12.0pt; font-family:"Calibri",sans-serif;} --></style>
</head>
<body lang=EN-US style='tab-interval:36.0pt'>
<!--StartFragment-->
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0
 style='border-collapse:collapse;border:none;mso-yfti-tbllook:1184'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal><b style='mso-bidi-font-weight:normal'>ZQW1<o:p></o:p></b></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-left:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal><i style='mso-bidi-font-style:normal'>ZQW2</i> <span style='color:red;font-family:"Times New Roman"'>ZQWred</span><o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-left:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal><o:p>&nbsp;</o:p></p>
  </td>
 </tr>
 <tr style='mso-yfti-irow:1;mso-yfti-lastrow:yes'>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-top:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal>ZQW4<sup>a</sup> a long note that Word wraps in
  its source<o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;border-top:none;border-left:
  none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal>ZQWp1<o:p></o:p></p>
  <p class=MsoNormal>ZQWp2<o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;border-top:none;border-left:
  none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal>H<sub>2</sub>O ZQW6<o:p></o:p></p>
  </td>
 </tr>
</table>
<!--EndFragment-->
</body>
</html>`;

const WORD_TEXT = 'ZQW1\tZQW2 ZQWred\t \r\nZQW4a a long note that Word wraps in its source\tZQWp1\r\nZQWp2\tH2O ZQW6\r\n';

/** Google Sheets: its origin tag and style sheet, a bold header, a cell merged down two rows. */
const SHEETS_HTML = `<meta charset='utf-8'><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1"><colgroup><col width="100"/><col width="100"/></colgroup><tbody><tr style="height:21px;"><td style="border-top:1px solid #000000;overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;">ZQS1</td><td style="border-top:1px solid #000000;overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;color:#ff0000;">ZQS2</td></tr><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:12.4}">12.4 ZQS3</td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:middle;" rowspan="2">ZQSm merged</td></tr><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">ZQS5<br/>ZQS5b</td></tr></tbody></table></google-sheets-html-origin>`;

const SHEETS_TEXT = 'ZQS1\tZQS2\n12.4 ZQS3\tZQSm merged\n"ZQS5\nZQS5b"\t';

/** A Google Docs paragraph: the whole paste inside a non-bold <b>. */
const DOCS_HTML = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff-ffff-ffff-123456789abc"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">ZQDOC plain words</span></p></b><br class="Apple-interchange-newline">`;

/**
 * Word paragraphs (a full Word document around them, as WORD_HTML): Word's
 * bold and italic with their complex-script style (R1-F1), and a long
 * sentence Word wraps in its HTML source, one line in Word and in the
 * plain text (R1-F3). Knowledge, not a copy of Word's clipboard
 * (UNVERIFIED, as every shape here).
 */
const WORD_DOC = (body) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15"><style><!-- p.MsoNormal {margin:0cm;font-size:12.0pt;font-family:"Calibri",sans-serif;} --></style></head><body lang=EN-US style='tab-interval:36.0pt;word-wrap:break-word'>\r\n<!--StartFragment-->\r\n\r\n${body}\r\n\r\n<!--EndFragment-->\r\n</body>\r\n</html>`;
const WORD_BOLD_PARA = WORD_DOC(`<p class=MsoNormal><b style='mso-bidi-font-weight:normal'><span lang=EN-CA>ZQWB<o:p></o:p></span></b><span lang=EN-CA> and <i style='mso-bidi-font-style:normal'>ZQWI</i> words<o:p></o:p></span></p>`);
const WORD_WRAP_PARA = WORD_DOC(`<p class=MsoNormal><span lang=EN-CA>ZQWRAP Mean reaction time fell by twelve percent across the three\r\nsessions in the treated group ZQEND<o:p></o:p></span></p>`);
const WORD_WRAP_TEXT = 'ZQWRAP Mean reaction time fell by twelve percent across the three sessions in the treated group ZQEND';

/**
 * Sources the engine copies itself (`copy: 'triple'` or `'select'`): the
 * harness draws the HTML in the page, selects it as a user would, and a real
 * ⌘C puts the engine's own text/html and text/plain on the clipboard.
 *   - A paragraph selected with a triple-click: Chromium's plain text ends in
 *     two line breaks and WebKit's in one, and both end the HTML with
 *     `<br class="Apple-interchange-newline">` (R1-F2, MEASURED by the
 *     reviewer's probe; read back by K1 here).
 *   - A paragraph whose page source wraps a line: Firefox copies the raw
 *     newline and indent into the HTML (R1-F3); Chromium and WebKit write
 *     one space.
 */
const TRIPLE_SOURCE = '<p>ZQTB <b>bold</b> value</p><p>ZQNEXT below</p>';
const WRAP_SOURCE = `<p>ZQWA alpha beta
      gamma ZQWZ</p>`;

const tsv = (rows, eol = '\n') => rows.map((r) => r.join('\t')).join(eol) + eol;
const grid = (r, c, tag) => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => `ZQ${tag}${i}${j}`));

/**
 * The table scenarios. `cell` is the focused cell's index in the starting
 * 4 × 3 table (row-major); `at` its row and column; `kind` 'grid' or 'text'
 * (rule 1: into the focused cell at the caret, the caret at the cell's end).
 */
export const TABLE_SHAPES = [
  {
    id: 'plain-line', kind: 'text', cell: 4,
    how: 'one line of plain text, "ZQW 12.4" (no tab, no line break)',
    payload: { 'text/plain': 'ZQW 12.4' },
    appended: 'ZQW 12.4',
  },
  {
    id: 'plain-line-html', kind: 'text', cell: 4,
    how: 'a bold, red, 30 px Georgia word from a web page: its HTML and "ZQBW" (no tab, no line break)',
    payload: { 'text/html': '<span style="color: rgb(200, 0, 0); font-family: Georgia; font-size: 30px"><b>ZQBW</b></span>', 'text/plain': 'ZQBW' },
    appended: '<b>ZQBW</b>',
  },
  {
    id: 'line-and-newline', kind: 'text', cell: 4,
    how: 'one line ending in a line break, "ZQNL 7.1\\n" (a line copied from a text editor): the final line break is not a row',
    payload: { 'text/plain': 'ZQNL 7.1\n' },
    appended: 'ZQNL 7.1',
  },
  {
    id: 'tsv-2x3', kind: 'grid', cell: 3, at: [1, 0],
    how: 'tab-separated text, 2 rows of 3, ending in a line break (a spreadsheet\'s plain text), at row 2 column 1',
    payload: { 'text/plain': tsv(grid(2, 3, 't')) },
    expect: grid(2, 3, 't'),
  },
  {
    id: 'tsv-crlf', kind: 'grid', cell: 4, at: [1, 1],
    how: 'tab-separated text with Windows line ends (\\r\\n), 2 rows of 2, at row 2 column 2',
    payload: { 'text/plain': tsv(grid(2, 2, 'r'), '\r\n') },
    expect: grid(2, 2, 'r'),
  },
  {
    id: 'tsv-blank-row', kind: 'grid', cell: 3, at: [1, 0],
    how: 'tab-separated text whose second row is empty ("ZQb1\\tZQb2\\n\\t\\nZQb3\\tZQb4\\n"), at row 2 column 1: the empty row is a row',
    payload: { 'text/plain': 'ZQb1\tZQb2\n\t\nZQb3\tZQb4\n' },
    expect: [['ZQb1', 'ZQb2'], ['', ''], ['ZQb3', 'ZQb4']],
  },
  {
    id: 'lines-only', kind: 'grid', cell: 5, at: [1, 2],
    how: 'three lines with no tab ("ZQl1\\nZQl2\\nZQl3"), at row 2 column 3: each line a row of one cell',
    payload: { 'text/plain': 'ZQl1\nZQl2\nZQl3' },
    expect: [['ZQl1'], ['ZQl2'], ['ZQl3']],
  },
  {
    id: 'excel-html', kind: 'grid', cell: 7, at: [2, 1],
    how: 'an Excel range of 3 rows by 4 (a merged header, a wrapped label, an empty cell, "p < .05", a cell with a line break), at row 3 column 2: the table grows to 5 by 5',
    payload: { 'text/html': EXCEL_HTML, 'text/plain': EXCEL_TEXT },
    expect: [
      ['ZQX1 group', '', 'ZQX3', 'ZQX4'],
      ['ZQX5', 'ZQX6 a long label that Excel wraps in its source', '', 'p &lt; .05 ZQX8'],
      ['ZQXa<br>ZQXb', '12.40', 'ZQX11', 'ZQX12'],
    ],
  },
  {
    id: 'word-html', kind: 'grid', cell: 0, at: [0, 0],
    how: 'a Word table of 2 rows by 3 (bold, italic, a red Times word, an empty cell, a superscript, two paragraphs in a cell, a subscript), at row 1 column 1',
    payload: { 'text/html': WORD_HTML, 'text/plain': WORD_TEXT },
    expect: [
      ['<b>ZQW1</b>', '<i>ZQW2</i> ZQWred', ''],
      ['ZQW4<sup>a</sup> a long note that Word wraps in its source', 'ZQWp1<br>ZQWp2', 'H<sub>2</sub>O ZQW6'],
    ],
  },
  {
    id: 'sheets-html', kind: 'grid', cell: 4, at: [1, 1],
    how: 'a Google Sheets range of 3 rows by 2 (a red header, a cell merged down two rows, a cell with a line break), at row 2 column 2: the table grows to 4 by 3, no column added',
    payload: { 'text/html': SHEETS_HTML, 'text/plain': SHEETS_TEXT },
    expect: [
      ['ZQS1', 'ZQS2'],
      ['12.4 ZQS3', 'ZQSm merged'],
      ['ZQS5<br>ZQS5b', ''],
    ],
  },
  {
    id: 'bigger', kind: 'grid', cell: 0, at: [0, 0],
    how: 'tab-separated text of 6 rows by 5, larger than the 4 by 3 table, at row 1 column 1: the table grows to 6 by 5',
    payload: { 'text/plain': tsv(grid(6, 5, 'g')) },
    expect: grid(6, 5, 'g'),
  },
  {
    id: 'one-cell-html', kind: 'grid', cell: 4, at: [1, 1],
    how: 'one Excel cell (an HTML table of one cell and "ZQone\\r\\n"), at row 2 column 2: the cell takes it, nothing else changes',
    payload: { 'text/html': '<table><tr><td>ZQone</td></tr></table>', 'text/plain': 'ZQone\r\n' },
    expect: [['ZQone']],
  },
  {
    id: 'last-cell', kind: 'grid', cell: 11, at: [3, 2],
    how: 'tab-separated text of 2 rows by 2 at the last cell (row 4 column 3): the table grows to 5 by 4',
    payload: { 'text/plain': tsv(grid(2, 2, 'e')) },
    expect: grid(2, 2, 'e'),
  },
  {
    id: 'markup-tsv', kind: 'grid', cell: 3, at: [1, 0],
    how: 'tab-separated text whose cells hold markup as text ("x<yZQ", an <img> with an onerror script), at row 2 column 1: kept as text, no script runs',
    payload: { 'text/plain': 'x<yZQ\t<img src=x onerror="window.__zqPwn=1">ZQimg\n' },
    expect: [['x&lt;yZQ', '&lt;img src=x onerror="window.__zqPwn=1"&gt;ZQimg']],
    markup: true,
  },
  {
    id: 'markup-html', kind: 'grid', cell: 3, at: [1, 0],
    how: 'an HTML table whose cell shows markup as text (&lt;img … onerror …&gt;), at row 2 column 1: kept as text, no script runs',
    payload: { 'text/html': '<table><tr><td>&lt;img src=x onerror="window.__zqPwn=2"&gt;ZQhtml</td><td>a &amp; b ZQamp</td></tr></table>', 'text/plain': '<img src=x onerror="window.__zqPwn=2">ZQhtml\ta & b ZQamp\n' },
    expect: [['&lt;img src=x onerror="window.__zqPwn=2"&gt;ZQhtml', 'a &amp; b ZQamp']],
    markup: true,
  },
  {
    id: 'word-line', kind: 'text', cell: 4,
    how: 'a Word paragraph with Word\'s own bold and italic (<b style=\'mso-bidi-font-weight:normal\'>), one line: bold and italic kept (R1-F1)',
    payload: { 'text/html': WORD_BOLD_PARA, 'text/plain': 'ZQWB and ZQWI words' },
    appended: '<b>ZQWB</b> and <i>ZQWI</i> words',
  },
  {
    id: 'word-wrap-line', kind: 'text', cell: 4,
    how: 'a long Word sentence whose HTML source wraps after "three", one line in Word: stored as one line (R1-F3)',
    payload: { 'text/html': WORD_WRAP_PARA, 'text/plain': WORD_WRAP_TEXT },
    appended: WORD_WRAP_TEXT,
  },
  {
    id: 'lines-trailing', kind: 'grid', cell: 1, at: [0, 1],
    how: 'two lines from a text editor ending in a blank line ("ZQa\\nZQb\\n\\n"), at row 1 column 2: two rows, the cell below them kept (R1-F2)',
    payload: { 'text/plain': 'ZQa\nZQb\n\n' },
    expect: [['ZQa'], ['ZQb']],
  },
  {
    id: 'triple-line', kind: 'text', cell: 4, copy: 'triple', source: TRIPLE_SOURCE, marker: 'ZQTB', loose: true,
    how: 'a page\'s paragraph selected with a triple-click and copied by the engine (its plain text ends in line breaks, its HTML in an interchange <br>): one line into the cell, bold kept, the cell below kept (R1-F2)',
    appended: 'ZQTB <b>bold</b> value',
  },
  {
    id: 'web-wrap-line', kind: 'text', cell: 4, copy: 'select', source: WRAP_SOURCE, marker: 'ZQWA', loose: true,
    how: 'a page\'s paragraph whose source wraps a line, selected and copied by the engine: one line into the cell (R1-F3; Firefox copies the raw newline)',
    appended: 'ZQWA alpha beta gamma ZQWZ',
  },
];

/**
 * The text-field scenarios (rule 3): the caret at the end of the first text
 * block, or in the title. `keep` must be in the stored HTML; `drop` must
 * not; `drawn` names a marker whose drawn colour, background, font and size
 * must be the block's own (and, with `weight`, its font weight).
 */
export const TEXT_SHAPES = [
  {
    id: 'text-colour', target: 'text',
    how: 'into a text block: red text on a yellow background in 40 px Georgia, a <mark>, bold, italic, underline, a subscript and a superscript',
    payload: {
      'text/html': '<span style="color: rgb(220, 0, 0); background-color: rgb(255, 255, 0); font-family: Georgia; font-size: 40px">ZQCOL</span> <mark>ZQMARK</mark> <b>ZQBOLD</b> <i>ZQITAL</i> <u>ZQUND</u> H<sub>2</sub>O x<sup>3</sup>',
      'text/plain': 'ZQCOL ZQMARK ZQBOLD ZQITAL ZQUND H2O x3',
    },
    keep: ['<b>ZQBOLD</b>', '<i>ZQITAL</i>', '<u>ZQUND</u>', '<sub>2</sub>', '<sup>3</sup>', 'ZQCOL', 'ZQMARK'],
    drop: ['color:', 'background-color', '<mark', 'font-family', 'font-size', 'Georgia'],
    drawn: ['ZQCOL', 'ZQMARK'],
  },
  {
    id: 'text-lines', target: 'text',
    how: 'into a text block: a bulleted list of two items and a paragraph with a line break',
    payload: { 'text/html': '<ul><li>ZQL1</li><li>ZQL2</li></ul><p>ZQP1<br>ZQP2</p>', 'text/plain': '• ZQL1\n• ZQL2\nZQP1\nZQP2' },
    keep: ['<ul><li>ZQL1</li><li>ZQL2</li></ul>', 'ZQP1<br>ZQP2'],
    drop: [],
    drawn: [],
  },
  {
    id: 'text-sheets', target: 'text',
    how: 'into a text block: the Google Sheets range above (its style sheet travels with it)',
    payload: { 'text/html': SHEETS_HTML, 'text/plain': SHEETS_TEXT },
    keep: ['ZQS1', 'ZQSm merged'],
    drop: ['mso-data-placement', 'border:', '&lt;!--', 'color:'],
    drawn: ['ZQS2'],
  },
  {
    id: 'text-docs', target: 'text',
    how: 'into a text block: a Google Docs paragraph (its non-bold <b> wrapper)',
    payload: { 'text/html': DOCS_HTML, 'text/plain': 'ZQDOC plain words' },
    keep: ['ZQDOC plain words'],
    drop: ['<b>', 'color:'],
    drawn: ['ZQDOC'],
    weight: true,
  },
  {
    id: 'title-colour', target: 'title',
    how: 'into the title (one line): red 40 px Georgia text with a yellow background',
    payload: {
      'text/html': '<span style="color: rgb(220, 0, 0); background-color: rgb(255, 255, 0); font-family: Georgia; font-size: 40px">ZQTCOL</span> <b>ZQTB</b>',
      'text/plain': 'ZQTCOL ZQTB',
    },
    keep: ['ZQTCOL', '<b>ZQTB</b>'],
    drop: ['color:', 'background-color', 'Georgia'],
    drawn: ['ZQTCOL'],
  },
  {
    id: 'text-word', target: 'text',
    how: 'into a text block: a Word paragraph with Word\'s own bold and italic (<b style=\'mso-bidi-font-weight:normal\'>): both kept (R1-F1)',
    payload: { 'text/html': WORD_BOLD_PARA, 'text/plain': 'ZQWB and ZQWI words' },
    keep: ['<b>ZQWB</b>', '<i>ZQWI</i>'],
    drop: ['mso-', 'MsoNormal', 'Calibri'],
    drawn: [],
  },
  {
    id: 'text-word-wrap', target: 'text',
    how: 'into a text block: a long Word sentence whose HTML source wraps after "three": stored as one line (R1-F3)',
    payload: { 'text/html': WORD_WRAP_PARA, 'text/plain': WORD_WRAP_TEXT },
    keep: ['ZQWRAP', 'ZQEND'],
    drop: [],
    drawn: [],
    oneLine: ['ZQWRAP', 'ZQEND'],
  },
  {
    id: 'text-web-wrap', target: 'text', copy: 'select', source: WRAP_SOURCE, marker: 'ZQWA',
    how: 'into a text block: a page\'s paragraph whose source wraps a line, selected and copied by the engine: stored as one line (R1-F3; Firefox copies the raw newline)',
    keep: ['ZQWA', 'ZQWZ'],
    drop: [],
    drawn: [],
    oneLine: ['ZQWA', 'ZQWZ'],
  },
  {
    id: 'title-word-wrap', target: 'title',
    how: 'into the title (one line): the long Word sentence whose HTML source wraps: stored as one line (R1-F3, a sibling field)',
    payload: { 'text/html': WORD_WRAP_PARA, 'text/plain': WORD_WRAP_TEXT },
    keep: ['ZQWRAP', 'ZQEND'],
    drop: [],
    drawn: [],
    oneLine: ['ZQWRAP', 'ZQEND'],
  },
];
