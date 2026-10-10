/**
 * Fix 27, part 1 — Enter in a text block is saved (OF-01). Engineering
 * record: docs/fixes/27-keep-work-safe.md.
 *
 * Enter in an editable field does not insert a <br>: every engine puts the
 * new line in a <div> (Chromium and WebKit `…ZQA<div>ZQB</div>`, Firefox
 * `<div>…ZQA</div><div>ZQB</div>`; MEASURED by scripts/keep-work-check.mjs).
 * The typing commit sanitized that markup with no separator, so the store
 * held "ZQAZQB": the words ran together after a reload, in the dashboard's
 * copy, the PDF and PowerPoint. A table cell stored the <div> as typed, and
 * the PowerPoint export wrote it out as text. The table note, a <textarea>,
 * stored its newline but was drawn without it (review round 1, R1-A1).
 *
 * Entry is the user's: a click into the block, typing at the caret and
 * Enter as the engines deliver them (undoKit `pressEnterNewLine`); the
 * store is read, never called. The PowerPoint part starts from a stored
 * poster, the export's own entry (the browser harness clicks Export).
 *
 * Re-run: npx vitest run src/poster/__tests__/enterSaved.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the Edit block tab's Content box (config/features.ts ADJUSTMENTS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
}));
import { unzipSync } from 'fflate';
import { act, fireEvent } from '@testing-library/react';

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
import { exportPosterPptx } from '@/export/pptx/writer';
import { parseRichText, richTextToPlain } from '@/export/richText';
import {
  NoopResizeObserver,
  canvasEditor,
  cellEditor,
  clickToEnd,
  contentBox,
  focusField,
  installContentEditableShim,
  installExecCommandShim,
  keyInto,
  load,
  openTab,
  pressEnterNewLine,
  pressSoftReturn,
  renderEditor,
  typeText,
  undoDoc,
} from './undoKit';
import { makeFixtureDoc, TINY_PNG_BYTES } from '@/export/__tests__/fixtures';

const stored = (id: string) => usePosterStore.getState().doc!.blocks.find((b) => b.id === id)!.content;
const storedCellHtml = (id: string, i: number) =>
  usePosterStore.getState().doc!.blocks.find((b) => b.id === id)!.tableData!.cells[i] ?? '';

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

describe('a line started with Enter is stored as a line break', () => {
  it('in a text block on the canvas (Chromium and WebKit: the new line in a <div>)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQA');
    await pressEnterNewLine(ed);
    await typeText(ed, 'ZQB');
    expect(stored('b1')).toMatch(/ZQA<br>ZQB$/);
  });

  it('in a text block, as Firefox does it (the line before wrapped too)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQA');
    await pressEnterNewLine(ed, { wrapFirst: true });
    await typeText(ed, 'ZQB');
    expect(stored('b1')).toBe('Our own words, not a placeholder. ZQA<br>ZQB');
  });

  it('keeps a blank line (Enter twice) as two breaks', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQH');
    await pressEnterNewLine(ed);
    await pressEnterNewLine(ed);
    await typeText(ed, 'ZQK');
    expect(stored('b1')).toMatch(/ZQH<br><br>ZQK$/);
  });

  it('keeps the spaces typed at the start of the new line', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQI');
    await pressEnterNewLine(ed);
    await typeText(ed, '  ZQJ');
    expect(stored('b1')).toMatch(/ZQI<br> {2}ZQJ$/);
  });

  it('in the Edit block tab\'s Content box', async () => {
    renderEditor();
    await clickToEnd(canvasEditor('b1'));
    openTab(/edit block/i);
    const box = contentBox();
    await clickToEnd(box);
    await typeText(box, ' ZQC');
    await pressEnterNewLine(box);
    await typeText(box, 'ZQD');
    expect(stored('b1')).toMatch(/ZQC<br>ZQD$/);
  });

  it('in a table cell, which used to store the <div> as typed', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 0);
    await clickToEnd(cell);
    await typeText(cell, ' ZQE');
    await pressEnterNewLine(cell);
    await typeText(cell, 'ZQF');
    expect(storedCellHtml('tb1', 0)).toBe('Group ZQE<br>ZQF');
  });
});

describe('Shift+Enter, then Enter, adds no blank line once stored (review round 2, R2-A1)', () => {
  // Shift+Enter puts a newline in the text (the fields are drawn pre-wrap),
  // which already ends the line; the <div> Enter then starts owed no <br>.
  // One was stored, a blank line more after a reload, in the PDF and in
  // PowerPoint (MEASURED in Chromium and Firefox, keep-work-check E12: a gap
  // of 2.58 glyph heights while typing, 3.87 after a reload). Firefox's
  // markup for these keys is in sanitizeHtml.test.ts, as measured.
  it('in a text block, as Chromium does it (…ZQSA\\n\\n<div>ZQSB</div>)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQSA');
    await pressSoftReturn(ed);
    await pressEnterNewLine(ed);
    await typeText(ed, 'ZQSB');
    expect(ed.innerHTML).toMatch(/ZQSA\n\n<div>ZQSB<\/div>$/);
    expect(stored('b1')).toBe('Our own words, not a placeholder. ZQSA\n\nZQSB');
  });

  it('in a table cell (the keys modelled as in a text block)', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 0);
    await clickToEnd(cell);
    await typeText(cell, ' ZQSA');
    await pressSoftReturn(cell);
    await pressEnterNewLine(cell);
    await typeText(cell, 'ZQSB');
    expect(storedCellHtml('tb1', 0)).toBe('Group ZQSA\n\nZQSB');
  });

  // The rule is the stored dialect's, not the typing path's alone: a paste
  // whose text ends a line with a newline before the next paragraph
  // (pretty-printed markup from a web page) is drawn by these pre-wrap
  // fields with that newline as the line's end. The paste path stored a
  // <br> there too, a blank line the source does not show (the first review
  // round 3's mutant, its probe "ZQA\n<br>ZQB"; reproduced here first).
  // Since fix 32's review (R1-F3) a paste reads the source's whitespace as
  // HTML draws it, so the pretty-printed newline is no line end of its own
  // and the paragraph's end is the one break; a newline the source keeps
  // (white-space: pre-wrap, as Google Docs writes) still reaches the rule.
  it('a paste whose line ends in a newline, before a paragraph, gains no blank line either', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await act(async () => {
      fireEvent.paste(ed, { clipboardData: { getData: (t: string) => (t === 'text/html' ? '<p>ZQPA\n</p><p>ZQPB</p>' : '') } });
    });
    expect(stored('b1')).toMatch(/ZQPA(?:\n|<br>)ZQPB$/);
    await act(async () => {
      fireEvent.paste(ed, { clipboardData: { getData: (t: string) => (t === 'text/html' ? '<p><span style="white-space: pre-wrap">ZQPC\n</span></p><p>ZQPD</p>' : '') } });
    });
    expect(stored('b1')).toMatch(/ZQPC\nZQPD$/);
  });
});

describe('the table note keeps a line started with Enter (review round 1, R1-A1)', () => {
  // The note is a <textarea> in Edit block (an MVP field, bounded-designs
  // §3.2): Enter puts a newline in its value, which is stored as typed and
  // which PowerPoint makes a second paragraph. The canvas drew the note with
  // `white-space: normal`, so the two lines showed as one, on screen and in
  // the PDF (MEASURED in Chromium, Firefox and WebKit, keep-work-check E11).
  // jsdom does no layout: the test reads the rule the browser draws by.
  it('is stored with the newline and drawn on the canvas with newlines kept', async () => {
    renderEditor();
    await clickToEnd(cellEditor('tb1', 0));
    openTab(/edit block/i);
    const note = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="SD in parentheses"]')!;
    await focusField(note);
    let value = '';
    for (const ch of 'ZQN1') await keyInto(note, (value += ch));
    await keyInto(note, (value += '\n'), 'insertLineBreak');
    for (const ch of 'ZQN2') await keyInto(note, (value += ch));
    expect(usePosterStore.getState().doc!.blocks.find((b) => b.id === 'tb1')!.note).toBe('ZQN1\nZQN2');
    const drawn = Array.from(document.querySelectorAll<HTMLElement>('#poster-canvas [data-block-id="tb1"] div'))
      .find((el) => el.textContent === 'ZQN1\nZQN2');
    expect(drawn, 'the note on the canvas').toBeTruthy();
    expect(['pre', 'pre-wrap', 'pre-line', 'break-spaces']).toContain(getComputedStyle(drawn!).whiteSpace);
  });
});

describe('the PowerPoint file keeps a table cell\'s lines', () => {
  const cellDoc = (cell: string) => {
    const d = makeFixtureDoc();
    const blocks = d.blocks.map((b) =>
      b.type === 'table' && b.tableData ? { ...b, tableData: { ...b.tableData, cells: [cell, ...b.tableData.cells.slice(1)] } } : b,
    );
    return { ...d, blocks };
  };
  /** The <a:p> paragraphs of the cell holding ZQE, as text. */
  async function cellParagraphs(cell: string): Promise<string[]> {
    const { bytes } = await exportPosterPptx(cellDoc(cell), { fetcher: async () => TINY_PNG_BYTES });
    const slide = new TextDecoder().decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
    const tc = slide.split('<a:tc').find((c) => c.includes('ZQE')) ?? '';
    return [...tc.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''));
  }

  it('a line break typed in a cell is two paragraphs, not one run of text', async () => {
    expect(await cellParagraphs('Measure ZQE<br>ZQF')).toEqual(['Measure ZQE', 'ZQF']);
  });

  it('a cell saved before the fix (the browser\'s <div> kept) is two paragraphs, no tag written out', async () => {
    expect(await cellParagraphs('Measure ZQE<div>ZQF</div>')).toEqual(['Measure ZQE', 'ZQF']);
    expect(await cellParagraphs('<div>Measure ZQE</div><div>ZQF</div>')).toEqual(['Measure ZQE', 'ZQF']);
  });

  it('reads <div> and <p> lines as paragraphs, an empty one as a blank line', () => {
    expect(richTextToPlain(parseRichText('a<div>b</div>'))).toBe('a\nb');
    expect(richTextToPlain(parseRichText('a<div><br></div><div>b</div>'))).toBe('a\n\nb');
    expect(richTextToPlain(parseRichText('<p>a</p><p>b</p>'))).toBe('a\nb');
    expect(richTextToPlain(parseRichText('x &lt;div&gt; y'))).toBe('x <div> y');
  });
});
