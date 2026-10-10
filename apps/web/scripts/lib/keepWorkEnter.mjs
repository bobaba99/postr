/**
 * Enter's line break, from typing to every place the text goes
 * (scripts/keep-work-check.mjs, record docs/fixes/27-keep-work-safe.md,
 * OF-01): a text block, the Content box, a table cell and the table note,
 * and Shift+Enter beside Enter.
 * Each scenario types with the real keyboard into a fresh poster
 * opened at /p/new by a signed-in term holder, then reads what was stored
 * (the fake backend's row), what the canvas draws after a reload, the copy
 * the dashboard's Duplicate makes, the print window Save PDF opens, and
 * the PowerPoint file Export makes.
 */
import { KEY, focusBlockEnd, focusContentBox, openTab, textBlockIds } from './undoKit.mjs';
import {
  breakBetween, breaksBetween, downloadPptx, drawnGap, linesBetween, openPrintWindow, pptxBreak, pptxLines,
  pptxParagraphs, reload, rowOf, savedWith, storedHtml,
} from './keepWorkKit.mjs';

const ON_CANVAS = '#poster-canvas';
/** dy (in glyph heights) under which two words are on one line. */
const SAME_LINE = 0.5;
/** dy (in glyph heights) by which a gap may move between two drawings and still be the same line. */
const SAME_GAP = 0.3;

/** Type `before`, Enter (`enters` times), then `after`, with the real keyboard. */
async function typeLines(page, before, after, enters = 1) {
  await page.keyboard.type(before, { delay: 35 });
  for (let i = 0; i < enters; i += 1) await page.keyboard.press('Enter');
  await page.keyboard.type(after, { delay: 35 });
}

/** The focused field's markup from `a` to the end of `b` (what the browser made of the typing). */
const typedDom = (page, a, b) => page.evaluate(({ a, b }) => {
  const html = document.activeElement?.innerHTML ?? '';
  const i = html.indexOf(a);
  const j = html.indexOf(b);
  return i < 0 || j < 0 ? html.slice(-80) : html.slice(Math.max(0, i - 6), j + b.length + 8);
}, { a, b });

/** Click the end of the first table cell's text. */
async function focusFirstCellEnd(page) {
  const cell = page.locator(`${ON_CANVAS} td [contenteditable]`).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  const ok = await page.evaluate(() => !!document.activeElement?.closest('td') && document.activeElement.isContentEditable);
  if (!ok) throw new Error('could not put the caret in the first table cell');
}

export const ENTER = [
  {
    id: 'E1-text-block', claims: ['E1', 'E1r', 'E2', 'E3', 'E4'],
    how: 'canvas text block: " ZQA", Enter, "ZQB"; reload; Save PDF; PowerPoint; the dashboard\'s Duplicate, then the copy opened',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await typeLines(page, ' ZQA', 'ZQB');
      const dom = await typedDom(page, 'ZQA', 'ZQB');
      const save = await savedWith(state, 'ZQB');
      const html = storedHtml(state, id, 'ZQA');
      const stored = breakBetween(html, 'ZQA', 'ZQB');
      const typedGap = await drawnGap(page, 'ZQA', 'ZQB', ON_CANVAS);
      await reload(page);
      const reloadGap = await drawnGap(page, 'ZQA', 'ZQB', ON_CANVAS);
      const popup = await openPrintWindow(page, 'ZQA');
      const pdfGap = await drawnGap(popup, 'ZQA', 'ZQB', 'body');
      await popup.close();
      const pptx = pptxBreak(pptxParagraphs(await downloadPptx(page)), 'ZQA', 'ZQB');
      // The dashboard's Duplicate, then the copy opened in the editor.
      const before = state.rows.length;
      await page.goto(`${h.base}/dashboard`);
      const dup = page.getByRole('button', { name: /^Duplicate / }).first();
      await dup.waitFor({ state: 'attached', timeout: 30000 });
      await dup.click({ force: true });
      const t0 = Date.now();
      while (state.rows.length === before && Date.now() - t0 < 10000) await page.waitForTimeout(100);
      const copy = state.rows.length > before ? state.rows[state.rows.length - 1] : null;
      const copyStored = copy ? breakBetween(storedHtml(state, copy.id, 'ZQA'), 'ZQA', 'ZQB') : 'no copy';
      let copyGap = null;
      if (copy) {
        await page.goto(`${h.base}/p/${copy.id}`);
        await page.waitForSelector(`${ON_CANVAS} [data-block-id]`, { timeout: 90000 });
        await page.waitForTimeout(800);
        copyGap = await drawnGap(page, 'ZQA', 'ZQB', ON_CANVAS);
      }
      const oneLine = (g) => g === null || g < SAME_LINE;
      return {
        claims: {
          E1: stored !== 'br',
          E1r: oneLine(reloadGap),
          E2: copyStored !== 'br' || oneLine(copyGap),
          E3: oneLine(pdfGap),
          E4: pptx !== 'paragraphs' && pptx !== 'br',
        },
        numbers: {
          typedDom: JSON.stringify(dom), saved: save ? 'yes' : 'no', stored, storedSnippet: JSON.stringify(snippet(html, 'ZQA', 'ZQB')),
          typedGap, reloadGap, pdfGap, pptx, copyStored, copyGap, copyRows: `${before}→${state.rows.length}`,
          storedRowTitle: rowOf(state, id)?.title ?? null,
        },
      };
    },
  },
  {
    id: 'E5-content-box', claims: ['E5', 'E5r'],
    how: 'Edit block › Content box of the first text block: " ZQC", Enter, "ZQD"; reload',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await openTab(page, 'edit block');
      await focusContentBox(page);
      await typeLines(page, ' ZQC', 'ZQD');
      const save = await savedWith(state, 'ZQD');
      const html = storedHtml(state, id, 'ZQC');
      const stored = breakBetween(html, 'ZQC', 'ZQD');
      await reload(page);
      const reloadGap = await drawnGap(page, 'ZQC', 'ZQD', ON_CANVAS);
      return {
        claims: { E5: stored !== 'br', E5r: reloadGap === null || reloadGap < SAME_LINE },
        numbers: { saved: save ? 'yes' : 'no', stored, storedSnippet: JSON.stringify(snippet(html, 'ZQC', 'ZQD')), reloadGap },
      };
    },
  },
  {
    id: 'E6-blank-line', claims: ['E6'],
    how: 'canvas text block: " ZQG", Enter, "ZQH", Enter, Enter, "ZQK"; reload; the second gap against the first',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await typeLines(page, ' ZQG', 'ZQH');
      await typeLines(page, '', 'ZQK', 2);
      const dom = await typedDom(page, 'ZQG', 'ZQK');
      const save = await savedWith(state, 'ZQK');
      const html = storedHtml(state, id, 'ZQG');
      await reload(page);
      const g1 = await drawnGap(page, 'ZQG', 'ZQH', ON_CANVAS);
      const g2 = await drawnGap(page, 'ZQH', 'ZQK', ON_CANVAS);
      const ratio = g1 && g2 !== null ? Math.round((g2 / g1) * 100) / 100 : null;
      return {
        // A blank line kept: the second gap is two lines, twice the first.
        claims: { E6: ratio === null || ratio < 1.5 },
        numbers: {
          typedDom: JSON.stringify(dom), saved: save ? 'yes' : 'no', breaksHK: breaksBetween(html, 'ZQH', 'ZQK'),
          storedSnippet: JSON.stringify(snippet(html, 'ZQG', 'ZQK')), g1, g2, ratio,
        },
      };
    },
  },
  {
    id: 'E7-single-line-blocks', claims: ['E7'],
    how: 'the title and a heading: Enter, then "ZQT" / "ZQHD"; nothing may break them (they are one line by design)',
    async run(h, s) {
      const { page, state, id } = s;
      const read = () => page.evaluate(() => {
        const ce = (t) => document.querySelector(`#poster-canvas [data-block-type="${t}"] [contenteditable]`);
        return { title: !!ce('title'), heading: !!ce('heading') };
      });
      const has = await read();
      const out = {};
      for (const [type, word] of [['title', 'ZQT'], ['heading', 'ZQHD']]) {
        if (!has[type]) { out[type] = 'absent'; continue; }
        const blockId = await page.evaluate((t) => document.querySelector(`#poster-canvas [data-block-type="${t}"]`)?.getAttribute('data-block-id'), type);
        await focusBlockEnd(page, blockId);
        await page.keyboard.press('Enter');
        await page.keyboard.type(word, { delay: 35 });
        await savedWith(state, word);
        const html = storedHtml(state, id, word) ?? '';
        const before = html.slice(Math.max(0, html.indexOf(word) - 12), html.indexOf(word));
        out[type] = /<br|\n|<div|<p/i.test(before) ? 'broken' : 'one line';
        out[`${type}Snippet`] = JSON.stringify(before + word);
      }
      return { claims: { E7: out.title === 'broken' || out.heading === 'broken' }, numbers: out };
    },
  },
  {
    id: 'E8-table-cell', claims: ['E8', 'E8r', 'E8p', 'E8x'],
    how: 'the first table cell: " ZQE", Enter, "ZQF"; reload; Save PDF; PowerPoint',
    async run(h, s) {
      const { page, state, id } = s;
      await focusFirstCellEnd(page);
      await typeLines(page, ' ZQE', 'ZQF');
      const dom = await typedDom(page, 'ZQE', 'ZQF');
      const save = await savedWith(state, 'ZQF');
      const html = storedHtml(state, id, 'ZQE');
      const stored = breakBetween(html, 'ZQE', 'ZQF');
      await reload(page);
      const reloadGap = await drawnGap(page, 'ZQE', 'ZQF', ON_CANVAS);
      const popup = await openPrintWindow(page, 'ZQE');
      const pdfGap = await drawnGap(popup, 'ZQE', 'ZQF', 'body');
      await popup.close();
      const paras = pptxParagraphs(await downloadPptx(page));
      const pptx = pptxBreak(paras, 'ZQE', 'ZQF');
      return {
        claims: {
          E8: stored !== 'br',
          E8r: reloadGap === null || reloadGap < SAME_LINE,
          E8p: pdfGap === null || pdfGap < SAME_LINE,
          E8x: pptx !== 'paragraphs' && pptx !== 'br',
        },
        numbers: {
          typedDom: JSON.stringify(dom), saved: save ? 'yes' : 'no', stored, storedSnippet: JSON.stringify(snippet(html, 'ZQE', 'ZQF')), reloadGap, pdfGap, pptx,
          pptxText: JSON.stringify((paras.find((p) => p.includes('ZQE')) ?? '').slice(-40)),
        },
      };
    },
  },
  {
    id: 'E9-leading-spaces', claims: ['E9'],
    how: 'canvas text block: " ZQI", Enter, two spaces, "ZQJ": are the two spaces stored before ZQJ?',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await typeLines(page, ' ZQI', '  ZQJ');
      const dom = await typedDom(page, 'ZQI', 'ZQJ');
      await savedWith(state, 'ZQJ');
      const html = storedHtml(state, id, 'ZQI');
      return {
        claims: { E9: !/(\s|&nbsp;|\u00a0){2}ZQJ/.test(html ?? '') },
        numbers: { typedDom: JSON.stringify(dom), stored: breakBetween(html, 'ZQI', 'ZQJ'), storedSnippet: JSON.stringify(snippet(html, 'ZQI', 'ZQJ')) },
      };
    },
  },
  /**
   * E10: a bulleted list made with the selection toolbar's "•", two items,
   * Enter twice to leave the list, then a line of text. The gap from the
   * last item to that text, while typing and after a reload: a gap that grows
   * on reload is a blank line the store added.
   */
  {
    id: 'E10-after-a-list', claims: ['E10'],
    how: 'canvas text block: " ZQL1" made a list with the toolbar\'s •, Enter, "ZQL2", Enter, Enter (out of the list), "ZQL3"; reload',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQL1', { delay: 35 });
      for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowLeft');
      await page.waitForTimeout(300);
      const bullet = page.locator('button[title="•"]').first();
      await bullet.waitFor({ state: 'visible', timeout: 5000 });
      await bullet.click();
      await page.waitForTimeout(200);
      await page.keyboard.press(KEY.toEnd);
      await typeLines(page, '', 'ZQL2');
      await typeLines(page, '', 'ZQL3', 2);
      const dom = await typedDom(page, 'ZQL2', 'ZQL3');
      const typedGap = await drawnGap(page, 'ZQL2', 'ZQL3', ON_CANVAS);
      await savedWith(state, 'ZQL3');
      const html = storedHtml(state, id, 'ZQL1');
      await reload(page);
      const reloadGap = await drawnGap(page, 'ZQL2', 'ZQL3', ON_CANVAS);
      const changed = typedGap === null || reloadGap === null || Math.abs(reloadGap - typedGap) > 0.3;
      return {
        claims: { E10: changed || !/<li>[^]*ZQL2/.test(html ?? '') },
        numbers: { typedDom: JSON.stringify(dom), storedSnippet: JSON.stringify(snippet(html, 'ZQL2', 'ZQL3')), typedGap, reloadGap },
      };
    },
  },
  /**
   * E11: the table note, a <textarea> in Edit block (an MVP field,
   * bounded-designs §3.2), takes Enter as a newline. From review round 1 of
   * fix 27 (finding R1-A1, the reviewer's probe folded in): the newline was
   * stored, and PowerPoint made two paragraphs, but the canvas and the print
   * window drew the two lines as one.
   */
  {
    id: 'E11-table-note', claims: ['E11', 'E11t', 'E11r', 'E11p', 'E11x'],
    how: 'the first table selected, Edit block › Table Note: "ZQN1", Enter, "ZQN2"; the canvas while typing; reload; Save PDF; PowerPoint',
    async run(h, s) {
      const { page, state, id } = s;
      await focusFirstCellEnd(page);
      await openTab(page, 'edit block');
      const note = page.locator('textarea[placeholder*="SD in parentheses"]').first();
      await note.waitFor({ state: 'visible', timeout: 10000 });
      await note.scrollIntoViewIfNeeded();
      await note.click();
      await page.keyboard.press('End');
      await typeLines(page, 'ZQN1', 'ZQN2');
      const save = await savedWith(state, 'ZQN2');
      const html = storedHtml(state, id, 'ZQN1');
      const stored = breakBetween(html, 'ZQN1', 'ZQN2');
      const typedGap = await drawnGap(page, 'ZQN1', 'ZQN2', ON_CANVAS);
      await reload(page);
      const reloadGap = await drawnGap(page, 'ZQN1', 'ZQN2', ON_CANVAS);
      const popup = await openPrintWindow(page, 'ZQN1');
      const pdfGap = await drawnGap(popup, 'ZQN1', 'ZQN2', 'body');
      await popup.close();
      const pptx = pptxBreak(pptxParagraphs(await downloadPptx(page)), 'ZQN1', 'ZQN2');
      const oneLine = (g) => g === null || g < SAME_LINE;
      return {
        claims: {
          E11: stored !== 'br',
          E11t: oneLine(typedGap),
          E11r: oneLine(reloadGap),
          E11p: oneLine(pdfGap),
          E11x: pptx !== 'paragraphs' && pptx !== 'br',
        },
        numbers: { saved: save ? 'yes' : 'no', stored, storedSnippet: JSON.stringify(snippet(html, 'ZQN1', 'ZQN2')), typedGap, reloadGap, pdfGap, pptx },
      };
    },
  },
  /**
   * E12: Shift+Enter (a soft return, as in PowerPoint and Word) next to
   * Enter, in two text blocks and a table cell. From review round 2 of fix 27
   * (finding R2-A1, the reviewer's probe folded in): Chromium and Firefox put
   * a newline character in the text for Shift+Enter (the fields are drawn
   * pre-wrap), and the stored text gained a <br> after it where the line had
   * already ended: a blank line added after a reload, in the PDF and in
   * PowerPoint. Each drawing is held against the one while typing.
   */
  {
    id: 'E12-soft-return-then-enter', claims: ['E12', 'E12p', 'E12b', 'E12c', 'E12x'],
    how: 'first text block: " ZQSA", Shift+Enter, Enter, "ZQSB"; second: " ZQSC", Shift+Enter, "ZQSD", Enter, "ZQSE"; first table cell: " ZQSF", Shift+Enter, "ZQSG", Enter, "ZQSH"; reload; Save PDF; PowerPoint',
    async run(h, s) {
      const { page, state, id } = s;
      const SOFT = 'Shift+Enter';
      const press = async (seq) => {
        for (const k of seq) {
          if (k === SOFT || k === 'Enter') await page.keyboard.press(k);
          else await page.keyboard.type(k, { delay: 35 });
        }
      };
      const groups = { a: ['ZQSA', 'ZQSB'], b: ['ZQSC', 'ZQSD', 'ZQSE'], c: ['ZQSF', 'ZQSG', 'ZQSH'] };
      const [b1, b2] = await textBlockIds(page);
      const dom = {};
      await focusBlockEnd(page, b1);
      await press([' ZQSA', SOFT, 'Enter', 'ZQSB']);
      dom.a = await typedDom(page, 'ZQSA', 'ZQSB');
      await focusBlockEnd(page, b2);
      await press([' ZQSC', SOFT, 'ZQSD', 'Enter', 'ZQSE']);
      dom.b = await typedDom(page, 'ZQSC', 'ZQSE');
      await focusFirstCellEnd(page);
      await press([' ZQSF', SOFT, 'ZQSG', 'Enter', 'ZQSH']);
      dom.c = await typedDom(page, 'ZQSF', 'ZQSH');
      /** Each group's gaps from word to word, drawn in `frame`. */
      const gapsIn = async (frame, rootSel) => {
        const out = {};
        for (const [k, words] of Object.entries(groups)) {
          out[k] = [];
          for (let i = 1; i < words.length; i += 1) out[k].push(await drawnGap(frame, words[i - 1], words[i], rootSel));
        }
        return out;
      };
      const typed = await gapsIn(page, ON_CANVAS);
      const save = await savedWith(state, 'ZQSH');
      const stored = Object.fromEntries(Object.entries(groups).map(([k, w]) => [k, snippet(storedHtml(state, id, w[0]), w[0], w[w.length - 1])]));
      await reload(page);
      const reloaded = await gapsIn(page, ON_CANVAS);
      const popup = await openPrintWindow(page, 'ZQSA');
      const pdf = await gapsIn(popup, 'body');
      await popup.close();
      const lines = pptxLines(await downloadPptx(page));
      // The blank lines PowerPoint should hold between two words: those drawn
      // while typing, a gap in units of the group's one-line step.
      const step = { a: typed.b[0], b: typed.b[0], c: typed.c[0] };
      const pptx = {};
      let pptxDiffers = false;
      for (const [k, words] of Object.entries(groups)) {
        pptx[k] = [];
        for (let i = 1; i < words.length; i += 1) {
          const got = linesBetween(lines, words[i - 1], words[i]);
          const g = typed[k][i - 1];
          const want = g && step[k] ? Math.round(g / step[k]) - 1 : null;
          pptx[k].push(got ? `${got.count}${got.empty ? '' : ' (not empty)'}` : 'missing');
          if (!got || want === null || got.count !== want || !got.empty) pptxDiffers = true;
        }
      }
      const differs = (a, b) => a.some((g, i) => g === null || b[i] === null || Math.abs(g - b[i]) > SAME_GAP);
      return {
        claims: {
          E12: differs(typed.a, reloaded.a),
          E12p: differs(typed.a, pdf.a) || differs(typed.b, pdf.b),
          E12b: differs(typed.b, reloaded.b),
          E12c: differs(typed.c, reloaded.c),
          E12x: pptxDiffers,
        },
        numbers: {
          typedDom: JSON.stringify(dom), saved: save ? 'yes' : 'no', stored: JSON.stringify(stored),
          typed: JSON.stringify(typed), reloaded: JSON.stringify(reloaded), pdf: JSON.stringify(pdf),
          pptxLinesBetween: JSON.stringify(pptx),
        },
      };
    },
  },
];

/** The stored HTML from `a` to the end of `b`. */
function snippet(html, a, b) {
  if (!html) return null;
  const i = html.indexOf(a);
  const j = html.indexOf(b);
  if (i < 0 || j < 0) return html.slice(-60);
  return html.slice(i, j + b.length);
}
