/**
 * Fix 32 — a paste into a table cell fills the table from that cell; a
 * paste into text takes the poster's style. Engineering record:
 * docs/fixes/32-table-paste.md (bounded-designs.md §3.3 A).
 *
 * The rule table these tests ask for:
 *   1  caret in a cell, plain text with no tab and no line break: into the
 *      cell at the caret, cleaned as text is; nothing else changes
 *   2  caret in a cell, a grid (an HTML table, or text with tabs or line
 *      breaks): fills the table from that cell, across and down, growing
 *      it; no cell outside the pasted area changes; nothing dropped; one
 *      undo step
 *   3  caret in a text block or the title: bold, italic, underline, sub,
 *      sup, lists and line breaks kept; colour, highlight, font and size
 *      dropped (and a style sheet's text, and Google Docs' non-bold <b>)
 * Before the fix the table's paste handler replaced the whole table with
 * one built from any paste with text (keep-work-check H5: 4 × 3 → 1 × 1),
 * and a pasted cell's text was stored as markup.
 *
 * Entry is the user's: a click into the cell or block, the paste event as
 * the browser delivers it (its clipboardData), ⌘Z on the focused element.
 * The store is read, never called. jsdom does no layout; the drawing and
 * the engines' own clipboard are scripts/table-paste-check.mjs's.
 *
 * The review round (record section 9) added the cases its probes found:
 * Word's own bold (`<b style='mso-bidi-font-weight:normal'>`, R1-F1), lines
 * ending in blank lines and a paragraph copied with a triple-click (R1-F2),
 * a line wrapped in the clipboard's HTML source (R1-F3).
 *
 * Re-run: npx vitest run src/poster/__tests__/tablePaste.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { usePosterStore } from '@/stores/posterStore';
import {
  KEYS,
  NoopResizeObserver,
  canvasEditor,
  cellEditor,
  clickToEnd,
  installContentEditableShim,
  installExecCommandShim,
  load,
  nextTask,
  press,
  renderEditor,
  undoDoc,
} from './undoKit';

/** The fixture's table, as stored: 3 rows × 2 columns. */
const table = () => usePosterStore.getState().doc!.blocks.find((b) => b.id === 'tb1')!.tableData!;
const content = (id: string) => usePosterStore.getState().doc!.blocks.find((b) => b.id === id)!.content;

/** A Word document around `body`, as Word puts it on the clipboard (its style sheet, its fragment markers). */
const word = (body: string) => `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name=ProgId content=Word.Document><style><!-- p.MsoNormal {margin:0cm;font-family:"Calibri",sans-serif;} --></style></head><body lang=EN-US>\r\n<!--StartFragment-->\r\n\r\n${body}\r\n\r\n<!--EndFragment-->\r\n</body></html>`;
/** Word's bold and italic: a complex-script weight in their own style. */
const WORD_BOLD = word(`<p class=MsoNormal><b style='mso-bidi-font-weight:normal'><span lang=EN-CA>ZQWB<o:p></o:p></span></b><span lang=EN-CA> and <i style='mso-bidi-font-style:normal'>ZQWI</i> words<o:p></o:p></span></p>`);
/** A sentence Word wraps in its HTML source, one line in Word and in the plain text. */
const WORD_WRAP = word(`<p class=MsoNormal><span lang=EN-CA>ZQWRAP fell across the three\r\nsessions ZQEND<o:p></o:p></span></p>`);

/** The paste event a browser fires on the focused editor, carrying the clipboard's types. */
async function paste(el: HTMLElement, data: { html?: string; text?: string }) {
  fireEvent.paste(el, {
    clipboardData: { getData: (t: string) => (t === 'text/html' ? data.html ?? '' : t === 'text/plain' ? data.text ?? '' : '') },
  });
  await nextTask();
}

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  load(undoDoc());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rule 1: one line of text goes into the cell at the caret', () => {
  it('plain text: the cell gains it, the table and every other cell stay', async () => {
    renderEditor();
    const before = structuredClone(table());
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, { text: 'ZQW 12.4' });
    expect(table().rows).toBe(3);
    expect(table().cols).toBe(2);
    expect(table().cells).toEqual(['Group', 'Mean', 'DV 1', '4.2ZQW 12.4', 'DV 2', '3.9']);
    await press(ed, KEYS.undo);
    expect(table()).toEqual(before);
  });

  it('a styled word: bold kept, its colour, font and size dropped', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, {
      html: '<span style="color: rgb(200, 0, 0); font-family: Georgia; font-size: 30px"><b>ZQB</b></span>',
      text: 'ZQB',
    });
    expect(table().cells[3]).toBe('4.2<b>ZQB</b>');
    expect(table().cells.filter((_, i) => i !== 3)).toEqual(['Group', 'Mean', 'DV 1', 'DV 2', '3.9']);
  });

  it('a line ending in one line break is still one line', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 5);
    await clickToEnd(ed);
    await paste(ed, { text: 'ZQNL\n' });
    expect(table().cells).toEqual(['Group', 'Mean', 'DV 1', '4.2', 'DV 2', '3.9ZQNL']);
  });

  it('Word\'s own bold and italic are kept (R1-F1: a check for "not bold" read mso-bidi-font-weight:normal)', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, { html: WORD_BOLD, text: 'ZQWB and ZQWI words' });
    expect(table().cells[3]).toBe('4.2<b>ZQWB</b> and <i>ZQWI</i> words');
  });

  it('a line wrapped in the clipboard\'s HTML source is one line in the cell (R1-F3)', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, { html: WORD_WRAP, text: 'ZQWRAP fell across the three sessions ZQEND' });
    expect(table().cells[3]).toBe('4.2ZQWRAP fell across the three sessions ZQEND');
  });

  it('a paragraph copied with a triple-click is one line in the cell, the cell below kept (R1-F2)', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    // Chromium's copy: the plain text ends in two line breaks, the HTML in an interchange <br>.
    await paste(ed, { html: '<p style="color: rgb(0, 0, 0)">ZQTB <b>bold</b> value</p><br class="Apple-interchange-newline">', text: 'ZQTB bold value\n\n' });
    expect(table().cells).toEqual(['Group', 'Mean', 'DV 1', '4.2ZQTB <b>bold</b> value', 'DV 2', '3.9']);
    // WebKit's: one line break in the plain text, the same <br> in the HTML.
    const below = cellEditor('tb1', 5);
    await clickToEnd(below);
    await paste(below, { html: '<p>ZQWK value</p><br class="Apple-interchange-newline">', text: 'ZQWK value\n' });
    expect(table().cells[5]).toBe('3.9ZQWK value');
  });
});

describe('rule 2: a grid fills the table from the focused cell and grows it', () => {
  it('tab-separated rows at row 2 column 2: the table grows by a column, nothing else changes, one undo', async () => {
    renderEditor();
    const before = structuredClone(table());
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, { text: 'a1\ta2\r\nb1\tb2\r\n' });
    expect(table().rows).toBe(3);
    expect(table().cols).toBe(3);
    expect(table().cells).toEqual([
      'Group', 'Mean', '',
      'DV 1', 'a1', 'a2',
      'DV 2', 'b1', 'b2',
    ]);
    expect(table().borderPreset).toBe('apa');
    await press(ed, KEYS.undo);
    expect(table()).toEqual(before);
  });

  it('a larger grid at the last cell grows rows and columns and keeps every pasted cell', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 5);
    await clickToEnd(ed);
    await paste(ed, { text: 'p\tq\tr\ns\tt\tu\n' });
    expect(table().rows).toBe(4);
    expect(table().cols).toBe(4);
    expect(table().cells).toEqual([
      'Group', 'Mean', '', '',
      'DV 1', '4.2', '', '',
      'DV 2', 'p', 'q', 'r',
      '', 's', 't', 'u',
    ]);
  });

  it('blank lines at the end are not rows: the cell below the lines keeps its text (R1-F2)', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 1);
    await clickToEnd(ed);
    await paste(ed, { text: 'ZQa\nZQb\n\n' });
    expect(table().rows).toBe(3);
    expect(table().cells).toEqual(['Group', 'ZQa', 'DV 1', 'ZQb', 'DV 2', '3.9']);
  });

  it('a Word table keeps Word\'s own bold (R1-F1)', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 0);
    await clickToEnd(ed);
    await paste(ed, {
      html: word(`<table class=MsoTableGrid><tr><td><p class=MsoNormal><b style='mso-bidi-font-weight:normal'>ZQH1<o:p></o:p></b></p></td><td><p class=MsoNormal><i style='mso-bidi-font-style:normal'>ZQH2</i></p></td></tr></table>`),
      text: 'ZQH1\tZQH2\r\n',
    });
    expect(table().cells.slice(0, 2)).toEqual(['<b>ZQH1</b>', '<i>ZQH2</i>']);
  });

  it('an empty row and lines with no tab are rows too', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 0);
    await clickToEnd(ed);
    await paste(ed, { text: 'x1\n\nx3' });
    expect(table().rows).toBe(3);
    expect(table().cells).toEqual(['x1', 'Mean', '', '4.2', 'x3', '3.9']);
  });

  it('an HTML table (Excel, Word, Sheets): merged cells keep their place, line breaks stay, colour and the style sheet go', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 0);
    await clickToEnd(ed);
    await paste(ed, {
      html: `<html><head><style>.xl65 {color: red}</style></head><body><table>
        <tr><td colspan=2 class=xl65>Head
          spanning</td><td>H3</td></tr>
        <tr><td rowspan=2><span style="color:red">M</span></td><td><p class=MsoNormal>P1</p>
          <p class=MsoNormal>P2</p></td><td><b>B</b> x<sup>2</sup></td></tr>
        <tr><td>L1<br>  L2</td><td><p><o:p>&nbsp;</o:p></p></td></tr>
      </table></body></html>`,
      text: 'Head spanning\t\tH3\nM\tP1 P2\tB x2\n\tL1 L2\t\n',
    });
    expect(table().rows).toBe(3);
    expect(table().cols).toBe(3);
    expect(table().cells).toEqual([
      'Head spanning', '', 'H3',
      'M', 'P1<br>P2', '<b>B</b> x<sup>2</sup>',
      '', 'L1<br>L2', '',
    ]);
  });

  it('one HTML cell (one Excel cell) replaces the focused cell only', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    await paste(ed, { html: '<table><tr><td>ZQone</td></tr></table>', text: 'ZQone\r\n' });
    expect(table().cells).toEqual(['Group', 'Mean', 'DV 1', 'ZQone', 'DV 2', '3.9']);
    await press(ed, KEYS.undo);
    expect(table().cells[3]).toBe('4.2');
  });

  it('text that looks like markup stays text, from plain text and from an HTML cell', async () => {
    renderEditor();
    const ed = cellEditor('tb1', 2);
    await clickToEnd(ed);
    await paste(ed, { text: 'x<y\t<img src=x onerror="window.__zqPwn=1">\n' });
    expect(table().cells.slice(2, 4)).toEqual(['x&lt;y', '&lt;img src=x onerror="window.__zqPwn=1"&gt;']);
    expect(document.querySelector('#poster-canvas td img')).toBeNull();
    await clickToEnd(cellEditor('tb1', 4));
    await paste(cellEditor('tb1', 4), { html: '<table><tr><td>&lt;b&gt;no&lt;/b&gt; &amp; ok</td></tr></table>', text: '<b>no</b> & ok' });
    expect(table().cells[4]).toBe('&lt;b&gt;no&lt;/b&gt; &amp; ok');
  });
});

describe('outside the rule table: a paste with no text', () => {
  it('an image alone is left to the browser, as before (image paste is a later item)', async () => {
    renderEditor();
    const before = structuredClone(table());
    const ed = cellEditor('tb1', 3);
    await clickToEnd(ed);
    const notCancelled = fireEvent.paste(ed, {
      clipboardData: { getData: (t: string) => (t === 'text/html' ? '<img src="data:image/png;base64,AAAA">' : '') },
    });
    await nextTask();
    expect(notCancelled).toBe(true);
    expect(table()).toEqual(before);
  });
});

describe('rule 3: a paste into text takes the poster\'s style', () => {
  it('a text block keeps bold, italic, underline, sub and sup, and drops colour, highlight, font and size', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, {
      html: '<span style="color: rgb(220, 0, 0); background-color: rgb(255, 255, 0); font-family: Georgia; font-size: 40px">ZQC</span> <mark>ZQM</mark> <b>B</b> <i>I</i> <u>U</u> H<sub>2</sub>O x<sup>3</sup>',
      text: 'ZQC ZQM B I U H2O x3',
    });
    expect(content('b1')).toBe('Our own words, not a placeholder.ZQC ZQM <b>B</b> <i>I</i> <u>U</u> H<sub>2</sub>O x<sup>3</sup>');
  });

  it('a style sheet on the clipboard (Google Sheets) is not pasted as text', async () => {
    renderEditor();
    const ed = canvasEditor('b2');
    await clickToEnd(ed);
    await paste(ed, {
      html: '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style><table><tr><td>S1</td></tr></table></google-sheets-html-origin>',
      text: 'S1',
    });
    expect(content('b2')).toBe('A second column of results.S1');
  });

  it('Google Docs\' non-bold <b> wrapper does not make the paste bold; a real <b> stays', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, {
      html: '<b style="font-weight:normal;" id="docs-internal-guid-1"><span style="color:#000000;font-weight:400">ZQD</span> <b>ZQB</b></b>',
      text: 'ZQD ZQB',
    });
    expect(content('b1')).toBe('Our own words, not a placeholder.ZQD <b>ZQB</b>');
  });

  it('Word\'s own bold and italic are kept in a text block (R1-F1; main kept them)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, { html: WORD_BOLD, text: 'ZQWB and ZQWI words' });
    expect(content('b1')).toBe('Our own words, not a placeholder.<b>ZQWB</b> and <i>ZQWI</i> words');
  });

  it('a line wrapped in the clipboard\'s HTML source is one line in a text block and the title (R1-F3)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, { html: WORD_WRAP, text: 'ZQWRAP fell across the three sessions ZQEND' });
    expect(content('b1')).toBe('Our own words, not a placeholder.ZQWRAP fell across the three sessions ZQEND');
    const title = canvasEditor('t1');
    await clickToEnd(title);
    await paste(title, { html: '<p>ZQT1 wrapped\n   here</p>', text: 'ZQT1 wrapped here' });
    expect(content('t1')).toBe('Effects of Sample TreatmentZQT1 wrapped here');
  });

  it('text copied inside the poster, as Firefox puts it on the clipboard (the bare text as HTML): its line break and spaces are kept', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, { html: 'ZQA\nZQB  ZQC', text: 'ZQA\nZQB  ZQC' });
    expect(content('b1')).toBe('Our own words, not a placeholder.ZQA\nZQB  ZQC');
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await paste(cell, { html: 'ZQD  <b>ZQE</b>\n', text: 'ZQD  ZQE\n' });
    expect(table().cells[3]).toBe('4.2ZQD  <b>ZQE</b>');
  });

  it('whitespace the source keeps (Google Docs\' pre-wrap spans, <pre>) is kept (a guard)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await paste(ed, {
      html: '<b style="font-weight:normal;" id="docs-internal-guid-2"><p dir="ltr"><span style="font-weight:400;white-space:pre;white-space:pre-wrap;">ZQ1  two  spaces</span></p></b>',
      text: 'ZQ1  two  spaces',
    });
    expect(content('b1')).toBe('Our own words, not a placeholder.ZQ1  two  spaces');
  });

  it('the title (one line) joins pasted paragraphs with a space', async () => {
    renderEditor();
    const ed = canvasEditor('t1');
    await clickToEnd(ed);
    await paste(ed, { html: '<p>ZQA</p><p>ZQB</p>', text: 'ZQA\nZQB' });
    expect(content('t1')).toBe('Effects of Sample TreatmentZQA ZQB');
  });

  it('the title (one line) drops the colour too', async () => {
    renderEditor();
    const ed = canvasEditor('t1');
    await clickToEnd(ed);
    await paste(ed, { html: '<span style="color: rgb(220, 0, 0); background-color: #ffff00">ZQT</span>', text: 'ZQT' });
    expect(content('t1')).toBe('Effects of Sample TreatmentZQT');
  });
});
