/**
 * Record 34 (docs/fixes/34-paste-drop.md): the pure parts of the canvas's
 * paste and drop rules (canvasPaste.ts, imageFile.ts): table B's order,
 * table A row 3's image-only test, the image block's size, and where a new
 * block goes. The user's entry (a paste or a drop event on the editor) is
 * canvasPasteEntry.test.tsx; geometry as the canvas draws it is
 * scripts/canvas-paste-check.mjs (jsdom performs no layout).
 *
 * Re-run: npx vitest run src/poster/__tests__/canvasPasteRules.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  centredAt, centredIn, dropPositions, filesOf, imageOnlyPaste, insertSize, isEditing, nextTo, pastedWords,
  readCanvasPaste, snapOnto, tableFromRows, type TransferLike,
} from '../canvasPaste';
import { fittedHeight, imageBlockSize, imageFileProblem } from '../imageFile';
import { MAX_IMAGE_BYTES } from '@/data/posterImages';

const png = (name = 'figure.png', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' });

/** A clipboard as an engine hands it over: strings by type, files in `items` (and `files`). */
function clip(strings: Record<string, string>, files: File[] = [], { inItems = true, inFiles = true } = {}): TransferLike {
  return {
    getData: (t: string) => strings[t] ?? '',
    items: inItems ? files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })) : [],
    files: inFiles ? files : [],
  };
}

const SHEET = { w: 480, h: 360 };

describe('table B: the first match wins', () => {
  it('order 2: HTML with a <table> is a table, read by record 32\'s grid reader, before an image on the same clipboard (Excel puts both)', () => {
    const r = readCanvasPaste(clip({ 'text/html': '<table><tr><td><b>ZQa</b></td><td>ZQb</td></tr><tr><td>ZQc</td><td>x &lt; y</td></tr></table>', 'text/plain': 'ZQa\tZQb\nZQc\tx < y' }, [png()]));
    expect(r).toEqual({ kind: 'table', rows: [['<b>ZQa</b>', 'ZQb'], ['ZQc', 'x &lt; y']] });
  });

  it('a table with text around it is order 4\'s (the reader reads it from the plain text in a cell; here, a text block)', () => {
    const r = readCanvasPaste(clip({ 'text/html': '<p>ZQintro</p><table><tr><td>ZQa</td></tr></table>', 'text/plain': 'ZQintro\nZQa' }));
    expect(r?.kind).toBe('text');
  });

  it('order 3: an image file and no text is an image', () => {
    const f = png();
    expect(readCanvasPaste(clip({}, [f]))).toEqual({ kind: 'image', file: f });
  });

  it('order 3: an image with HTML that holds only the <img> (Chromium\'s "Copy image") is still an image', () => {
    const f = png();
    expect(readCanvasPaste(clip({ 'text/html': '<meta charset="utf-8"><img src="https://example.test/a.png">' }, [f]))).toEqual({ kind: 'image', file: f });
  });

  it('an image AND text is order 4\'s: a text block (the rule says "an image file, and no text")', () => {
    expect(readCanvasPaste(clip({ 'text/plain': 'ZQcaption' }, [png()]))?.kind).toBe('text');
  });

  it('a file that is not an image, and no text, is order 5: nothing', () => {
    expect(readCanvasPaste(clip({}, [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })]))).toBeNull();
  });

  it('order 4: plain text with tabs is text, not a table, cleaned as record 32\'s text paste', () => {
    expect(readCanvasPaste(clip({ 'text/plain': 'ZQt1\tZQt2\nZQt3\tZQt4' }))).toEqual({ kind: 'text', html: 'ZQt1\tZQt2\nZQt3\tZQt4' });
  });

  it('order 4: a web page\'s styled text keeps bold, sub and sup and drops colour, highlight, font and size', () => {
    const r = readCanvasPaste(clip({
      'text/html': '<span style="color: rgb(220, 0, 0); background-color: rgb(255, 255, 0); font-family: Georgia; font-size: 40px">ZQCOL</span> <mark>ZQMARK</mark> <b>ZQBOLD</b> H<sub>2</sub>O x<sup>3</sup>',
      'text/plain': 'ZQCOL ZQMARK ZQBOLD H2O x3',
    }));
    expect(r).toEqual({ kind: 'text', html: 'ZQCOL ZQMARK <b>ZQBOLD</b> H<sub>2</sub>O x<sup>3</sup>' });
  });

  it('order 5: HTML with only an <img> and no file, or only spaces, is nothing', () => {
    expect(readCanvasPaste(clip({ 'text/html': '<img src="https://example.test/a.png">' }))).toBeNull();
    expect(readCanvasPaste(clip({ 'text/plain': '  \n\t ' }))).toBeNull();
    expect(readCanvasPaste(clip({}))).toBeNull();
  });
});

describe('table A row 3: an image pasted into text', () => {
  it('takes an image with no text; a paste with text stays the text\'s', () => {
    const f = png();
    expect(imageOnlyPaste(clip({}, [f]))).toBe(f);
    expect(imageOnlyPaste(clip({ 'text/plain': 'ZQ' }, [f]))).toBeNull();
    expect(imageOnlyPaste(clip({ 'text/plain': 'ZQ' }))).toBeNull();
  });
  it('R34-2: an image with an <img> fragment and its address as plain text is taken (a text paste of it inserts nothing)', () => {
    const f = png();
    const address = 'https://example.invalid/a.png';
    expect(imageOnlyPaste(clip({ 'text/html': `<img src="${address}">`, 'text/plain': address }, [f]))).toBe(f);
    expect(readCanvasPaste(clip({ 'text/html': `<img src="${address}">`, 'text/plain': address }, [f]))).toEqual({ kind: 'image', file: f });
  });
});

describe('the clipboard\'s files', () => {
  it('a file listed in items and in files is read once; one listed in files only (an engine\'s drop) is read too', () => {
    const f = png();
    expect(filesOf(clip({}, [f]))).toEqual([f]);
    expect(filesOf(clip({}, [f], { inItems: false }))).toEqual([f]);
  });
  it('text is what a text paste would insert: an <img> alone, or a style sheet\'s text, is not text', () => {
    expect(pastedWords('<img src=x>', '')).toBe('');
    // A style sheet inside the body, as Google Sheets puts one (after its origin tag), with an image.
    expect(pastedWords('<google-sheets-html-origin><style>td {border: 1px solid #ccc;}</style><img src=x></google-sheets-html-origin>', '')).toBe('');
    expect(pastedWords('<p>ZQ</p>', '')).toBe('ZQ');
    expect(pastedWords('', 'ZQ')).toBe('ZQ');
  });
  it('R34-2: an <img> fragment with the image\'s address as plain text is not text (the HTML wins, as in a text block); the address alone is', () => {
    const address = 'https://example.invalid/a.png';
    expect(pastedWords(`<img alt="ZQ" src="${address}">`, address)).toBe('');
    expect(pastedWords('', address)).toBe(address);
  });
  it('markup the cleaning leaves with no words in it (an empty bold run, a line break) is not text: an image beside it is the image', () => {
    expect(pastedWords('<p><b> </b></p>', '')).toBe('');
    expect(pastedWords('<p>&nbsp;</p><p><br></p>', '')).toBe('');
    const f = png();
    expect(readCanvasPaste(clip({ 'text/html': '<b><img src=x></b>' }, [f]))).toEqual({ kind: 'image', file: f });
  });
});

describe('edit mode: where a paste is the field\'s own', () => {
  it('an input, a text box, a menu and editable text are in edit mode; a button and the page are not', () => {
    for (const tag of ['input', 'textarea', 'select']) expect(isEditing(document.createElement(tag))).toBe(true);
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    document.body.appendChild(ce);
    // jsdom has no isContentEditable: the property the browser computes, set as it would be.
    Object.defineProperty(ce, 'isContentEditable', { value: true });
    expect(isEditing(ce)).toBe(true);
    expect(isEditing(document.createElement('button'))).toBe(false);
    expect(isEditing(document.body)).toBe(false);
    expect(isEditing(null)).toBe(false);
    ce.remove();
  });
});

describe('the image checks (the upload\'s, with its messages)', () => {
  it('a file that is not an image, and one over 10 MB, are refused with today\'s words; an image under 10 MB passes', () => {
    expect(imageFileProblem(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toMatch(/"notes\.pdf" doesn't look like an image \(got application\/pdf\)/);
    expect(imageFileProblem(png('big.png', MAX_IMAGE_BYTES + 1))).toMatch(/"big\.png" is 10\.0 MB — too large[\s\S]*Images must be under 10 MB/);
    expect(imageFileProblem(png('ok.png', MAX_IMAGE_BYTES))).toBeNull();
  });
});

describe('a new image block: Insert › Image\'s box with the image\'s shape', () => {
  const box = insertSize('image');
  it('Insert\'s sizes: an image, a table and a text block 155 × 140 units (15.5 × 14 in)', () => {
    expect(box).toEqual({ w: 155, h: 140 });
    expect(insertSize('table')).toEqual({ w: 155, h: 140 });
    expect(insertSize('text')).toEqual({ w: 155, h: 140 });
    expect(insertSize('logo')).toEqual({ w: 50, h: 40 });
  });
  it('a wide image keeps the box\'s width; a tall one its height; a square one (narrower than the box) its height', () => {
    expect(imageBlockSize({ w: 160, h: 100 }, box)).toEqual({ w: 155, h: 97 });
    expect(imageBlockSize({ w: 90, h: 150 }, box)).toEqual({ w: 84, h: 140 });
    expect(imageBlockSize({ w: 120, h: 120 }, box)).toEqual({ w: 140, h: 140 });
  });
  it('its height is what the image block\'s own fit makes of its width, so the fit on load changes nothing (no second undo step)', () => {
    for (const size of [{ w: 160, h: 100 }, { w: 90, h: 150 }, { w: 1000, h: 110 }, { w: 37, h: 333 }]) {
      const b = imageBlockSize(size, box);
      expect(Math.abs(fittedHeight(b.w, size) - b.h)).toBeLessThanOrEqual(2);
    }
  });
  it('an image whose size cannot be read takes the box', () => {
    expect(imageBlockSize(null, box)).toEqual(box);
  });
});

describe('where a new block goes', () => {
  it('snapped to the ½ in grid and kept on the sheet (at 0 when larger than it)', () => {
    expect(snapOnto(12.4, 13, { w: 10, h: 10 }, SHEET)).toEqual({ x: 10, y: 15 });
    expect(snapOnto(475, -3, { w: 50, h: 10 }, SHEET)).toEqual({ x: 430, y: 0 });
    expect(snapOnto(20, 20, { w: 600, h: 10 }, SHEET)).toEqual({ x: 0, y: 20 });
  });
  it('a paste: centred in the part of the sheet in view (the whole sheet when none shows)', () => {
    expect(centredIn({ x: 300, y: 200, w: 160, h: 140 }, { w: 155, h: 97 }, SHEET)).toEqual({ x: 305, y: 220 });
    expect(centredIn(null, { w: 155, h: 97 }, SHEET)).toEqual({ x: 165, y: 130 });
  });
  it('a drop: centred on the drop point; further images each 1 in (10 units) down and right of the last', () => {
    expect(centredAt({ x: 100, y: 100 }, { w: 40, h: 20 }, SHEET)).toEqual({ x: 80, y: 90 });
    expect(dropPositions({ x: 100, y: 100 }, [{ w: 40, h: 20 }, { w: 20, h: 40 }, { w: 30, h: 30 }], SHEET))
      .toEqual([{ x: 80, y: 90 }, { x: 90, y: 100 }, { x: 100, y: 110 }]);
  });
  it('next to a text: to its right, top aligned, when it fits on the sheet there; else below it as drawn; kept on the sheet', () => {
    expect(nextTo({ x: 10, y: 103, w: 149, h: 18 }, { w: 155, h: 97 }, SHEET)).toEqual({ x: 164, y: 103 });
    expect(nextTo({ x: 320, y: 202, w: 149, h: 12 }, { w: 155, h: 97 }, SHEET)).toEqual({ x: 320, y: 219 });
    expect(nextTo({ x: 320, y: 300, w: 149, h: 40 }, { w: 155, h: 97 }, SHEET)).toEqual({ x: 320, y: 263 });
  });
});

describe('a new table block from pasted rows', () => {
  it('the rows poured into an empty table with Insert › Table\'s borders', () => {
    expect(tableFromRows([['a', 'b'], ['c', 'd'], ['e', '']])).toEqual({ rows: 3, cols: 2, cells: ['a', 'b', 'c', 'd', 'e', ''], colWidths: null, borderPreset: 'apa' });
  });
});
