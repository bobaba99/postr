/**
 * simplify-check's starting-text scenarios (record docs/fixes/29-mvp-simplify.md,
 * bounded-designs.md §3.1 and §3.12): what a new poster and Insert store,
 * whether an empty block shows a grey prompt, whether prompts or template
 * text reach the print window or the PowerPoint file, and what Issues lists,
 * on a new poster and on an older one. Each scenario runs in a fresh
 * signed-in session at /p/new (lib/keepWorkKit.mjs openSignedIn).
 */
import { DEFAULT_DATA } from './guestBackend.mjs';
import { focusBlockEnd, openTab } from './undoKit.mjs';
import { downloadPptx, openPrintWindow, pptxParagraphs, rowOf } from './keepWorkKit.mjs';
import {
  EDITOR_HINTS, OLD_GUIDANCE, OLD_INSERT_HEADING, OLD_INSERT_TEXT, OLD_SAMPLE_CELLS, OLD_SAMPLE_NUMBERS, OLD_STRINGS, OLD_TITLE,
  deselect, emptyBlock, inkIn, issueRows, openStoredPoster, plain, promptDrawn, promptStates, storedBlocks,
} from './simplifyKit.mjs';

const MARK = 'ZQMARK';
/** Ink pixels an empty block's box holds with no prompt drawn stay under this (MEASURED on 21e6671: 6 and 31). */
const INK_PROMPT = 60;
/** The default prompts the canvas passes (blocks.tsx), with or without record 29. */
const DEFAULT_PROMPTS = ['Poster Title', 'Poster title', 'Section Heading', 'Type here… (type / for symbols)'];

/** A new poster: what is stored, what the screen shows, and the same once two blocks are emptied by hand. */
const newPoster = {
  id: 'T1-new-poster',
  how: '/p/new: the text the title and text blocks hold on screen; the title and the first text block emptied with ⌘A, Backspace (a change, so the poster is written); the prompts drawn; what is stored',
  async run(h, s) {
    const { page } = s;
    await deselect(page);
    const before = await promptStates(page);
    const firstText = before.find((x) => x.type === 'text');
    const titleState = before.find((x) => x.type === 'title');
    if (!firstText || !titleState) throw new Error('the new poster has no title or text block');
    await emptyBlock(page, titleState.id);
    await emptyBlock(page, firstText.id);
    await deselect(page);
    await page.waitForTimeout(1500);
    const after = await promptStates(page);
    const emptied = after.filter((x) => x.id === titleState.id || x.id === firstText.id);
    const inkTitle = await inkIn(page, titleState.id, `${h.out}/T1-title.png`);
    const inkText = await inkIn(page, firstText.id, `${h.out}/T1-text.png`);
    // The caret in the emptied text block: its prompt goes (index.css
    // :not(:focus)), so it never sits beside the caret.
    await page.locator(`#poster-canvas [data-block-id="${firstText.id}"] [contenteditable="true"]`).first().click();
    await page.waitForTimeout(250);
    const whileFocused = (await promptStates(page)).find((x) => x.id === firstText.id);
    await deselect(page);
    // A change that touches none of the blocks read below, so the poster is
    // written: Insert › + Image. Stored: every block but the two emptied.
    await openTab(page, 'insert');
    await page.locator('[data-postr-sidebar] button').filter({ hasText: /^\+ Image/ }).first().click();
    await page.waitForTimeout(1500);
    const blocks = await storedBlocks(s.state, s.id);
    const texts = blocks.filter((b) => b.type === 'text' && b.id !== firstText.id);
    const table = blocks.find((b) => b.type === 'table');
    const startEmpty = before.filter((x) => !x.text);
    return {
      claims: {
        T1: titleState.text !== '',
        T2: texts.some((b) => plain(b.content) !== ''),
        T3: (table?.tableData?.cells ?? []).some((c) => OLD_SAMPLE_NUMBERS.includes(plain(c))),
        T5: emptied.some((x) => x.text === '' && !promptDrawn(x)),
        T5i: [inkTitle, inkText].some((n) => n !== null && n < INK_PROMPT),
        T6: startEmpty.some((x) => !promptDrawn(x)),
        T5f: !!whileFocused && promptDrawn(whileFocused),
      },
      numbers: {
        titleOnScreen: titleState.text || '(empty)',
        otherTextBlocksStored: `${texts.filter((b) => plain(b.content)).length} of ${texts.length} hold text`,
        holdingGuidance: texts.filter((b) => OLD_GUIDANCE.includes(plain(b.content))).length,
        sampleNumbersStored: (table?.tableData?.cells ?? []).filter((c) => OLD_SAMPLE_NUMBERS.includes(plain(c))).length,
        tableCells: JSON.stringify((table?.tableData?.cells ?? []).map(plain)),
        startEmptyBlocks: `${startEmpty.length} (${startEmpty.filter(promptDrawn).length} with a prompt drawn)`,
        prompts: JSON.stringify(before.map((x) => `${x.type}:${x.placeholder}`)),
        emptiedPromptDrawn: emptied.map((x) => `${x.type}:${promptDrawn(x)}`).join(','),
        emptiedHtml: emptied.map((x) => `${x.type}:${JSON.stringify(x.html)}`).join(' '),
        beforeColor: emptied.map((x) => x.beforeColor).join(' '),
        beforeContent: emptied.map((x) => x.beforeContent).join(' '),
        focusedBefore: whileFocused?.beforeContent ?? null,
        inkTitle, inkText,
      },
    };
  },
};

/** Insert › Text and Insert › Heading: what each stores, and what it shows. */
const insertBlocks = {
  id: 'T4-insert',
  how: 'Insert › + Text, then Insert › + Heading: their stored text, and whether each draws its prompt',
  async run(h, s) {
    const { page } = s;
    const out = {};
    for (const [label, type] of [['Text', 'text'], ['Heading', 'heading']]) {
      const before = new Set((await promptStates(page)).map((x) => x.id));
      await openTab(page, 'insert');
      await page.locator('[data-postr-sidebar] button').filter({ hasText: new RegExp(`^\\+ ${label}`) }).first().click();
      await page.waitForTimeout(1500);
      await deselect(page);
      const st = (await promptStates(page)).find((x) => !before.has(x.id) && x.type === type);
      const stored = (rowOf(s.state, s.id)?.data?.blocks ?? []).find((b) => b.id === st?.id);
      out[type] = { stored: plain(stored?.content), drawn: st ? promptDrawn(st) : null, text: st?.text ?? null, ink: st ? await inkIn(page, st.id, `${h.out}/T4-${type}.png`) : null };
    }
    return {
      claims: {
        T4t: out.text.stored !== '',
        T4h: out.heading.stored !== '',
        T5n: [out.text, out.heading].some((x) => x.text !== '' || !x.drawn || x.ink < INK_PROMPT),
      },
      numbers: { text: JSON.stringify(out.text), heading: JSON.stringify(out.heading) },
    };
  },
};

/** A marker typed in the second text block; then Save PDF and PowerPoint read for prompts and template text. */
const printAndPptx = {
  id: 'T7-print-pptx',
  how: `"${MARK}" typed in the second text block; Save PDF's print window and Export › PowerPoint read for template text and prompts`,
  async run(h, s) {
    const { page } = s;
    await deselect(page);
    const states = await promptStates(page);
    const second = states.filter((x) => x.type === 'text')[1];
    if (!second) throw new Error('no second text block');
    await focusBlockEnd(page, second.id);
    await page.keyboard.type(` ${MARK}`, { delay: 30 });
    await page.waitForTimeout(1500);
    await deselect(page);
    const prompts = [...new Set([...DEFAULT_PROMPTS, ...states.map((x) => x.placeholder).filter(Boolean)])];
    const popup = await openPrintWindow(page, MARK);
    const print = await popup.evaluate(() => ({
      text: document.body.innerText,
      before: [...document.querySelectorAll('[data-placeholder]')].map((el) => getComputedStyle(el, '::before').content).filter((c) => c && c !== 'none' && c !== 'normal'),
      placeholders: document.querySelectorAll('[data-placeholder]').length,
    }));
    await popup.close().catch(() => {});
    const paras = pptxParagraphs(await downloadPptx(page));
    const pptText = paras.join('\n');
    const has = (text, list) => list.filter((t) => text.includes(t));
    return {
      claims: {
        T7a: has(print.text, OLD_STRINGS).length > 0,
        T7b: has(print.text, prompts).length > 0 || print.before.length > 0,
        T8a: has(pptText, OLD_STRINGS).length > 0,
        T8b: has(pptText, prompts).length > 0,
      },
      numbers: {
        printOld: has(print.text, OLD_STRINGS).length, printPrompts: has(print.text, prompts).length,
        printPseudo: print.before.length, printPlaceholderAttrs: print.placeholders,
        pptOld: has(pptText, OLD_STRINGS).length, pptPrompts: has(pptText, prompts).length,
        printHasMark: print.text.includes(MARK), pptHasMark: pptText.includes(MARK),
        // Information (R1-02, older than record 29): the editor's hints in
        // empty authors, image and references blocks, as print text.
        printEditorHints: JSON.stringify(has(print.text, EDITOR_HINTS)),
        pptEditorHints: JSON.stringify(has(pptText, EDITOR_HINTS)),
      },
    };
  },
};

/** Which rows Issues lists for blocks still empty or holding template text, and for the sample table. */
function expectedIssues(blocks) {
  const flag = blocks.filter((b) => (b.type === 'text' || b.type === 'heading') && (plain(b.content) === '' || OLD_STRINGS.includes(plain(b.content))));
  const sample = blocks.filter((b) => b.type === 'table' && JSON.stringify((b.tableData?.cells ?? []).map(plain)) === JSON.stringify(OLD_SAMPLE_CELLS));
  return { flag: flag.length, sample: sample.length };
}
const listedStarting = (rows) => rows.filter((r) => /empty block|template/i.test(`${r.category} ${r.message}`) || /Enter your text here/.test(r.message)).length;
const listedSample = (rows) => rows.filter((r) => /sample/i.test(`${r.category} ${r.message}`)).length;

const issuesNew = {
  id: 'T9-issues-new',
  how: `/p/new with "${MARK}" typed in the second text block: Issues against the blocks still empty or holding template text`,
  async run(h, s) {
    const { page } = s;
    await deselect(page);
    const second = (await promptStates(page)).filter((x) => x.type === 'text')[1];
    await focusBlockEnd(page, second.id);
    await page.keyboard.type(` ${MARK}`, { delay: 30 });
    await page.waitForTimeout(1500);
    await deselect(page);
    await openTab(page, 'issues');
    const rows = await issueRows(page);
    // Information (R1-04): the number on the Issues tab, every severity.
    const badge = await page.locator('button[data-postr-tab]').filter({ hasText: /^issues/ }).first().innerText();
    const blocks = rowOf(s.state, s.id)?.data?.blocks ?? [];
    const want = expectedIssues(blocks);
    return {
      claims: {
        T9: listedStarting(rows) < want.flag,
        T9s: listedSample(rows) < want.sample,
        // A new poster, one word typed: no block runs into another (a guard;
        // a prompt longer than the text it replaced can make a block taller).
        T9o: rows.some((r) => /overlap/i.test(r.category)),
      },
      numbers: {
        blocksToFlag: want.flag, listed: listedStarting(rows), sampleTables: want.sample, sampleListed: listedSample(rows),
        issuesTab: badge.replace(/\s+/g, ' ').trim(),
        rows: JSON.stringify(rows.map((r) => r.category)),
        overlaps: JSON.stringify(rows.filter((r) => /overlap/i.test(r.category)).map((r) => r.message)),
      },
    };
  },
};

/** An older poster, stored before record 29 with the old starting text: Issues, and its stored text kept. */
function olderPosterDoc() {
  const base = { imageSrc: null, imageFit: 'contain', tableData: null };
  return {
    ...DEFAULT_DATA,
    blocks: [
      { ...base, id: 'old-title', type: 'title', x: 10, y: 10, w: 460, h: 45, content: OLD_TITLE },
      { ...base, id: 'old-h1', type: 'heading', x: 10, y: 90, w: 145, h: 20, content: 'Introduction' },
      { ...base, id: 'old-t1', type: 'text', x: 10, y: 112, w: 145, h: 80, content: OLD_GUIDANCE[0] },
      { ...base, id: 'old-h2', type: 'heading', x: 165, y: 90, w: 145, h: 20, content: 'Methods' },
      { ...base, id: 'old-t2', type: 'text', x: 165, y: 112, w: 145, h: 80, content: OLD_GUIDANCE[2] },
      { ...base, id: 'old-t3', type: 'text', x: 10, y: 200, w: 145, h: 60, content: OLD_INSERT_TEXT },
      { ...base, id: 'old-h3', type: 'heading', x: 320, y: 90, w: 145, h: 20, content: OLD_INSERT_HEADING },
      { ...base, id: 'old-own', type: 'text', x: 320, y: 112, w: 145, h: 60, content: 'ZQOWN Our own sentence about the results.' },
      { ...base, id: 'old-tab', type: 'table', x: 165, y: 200, w: 145, h: 60, tableData: { rows: 4, cols: 3, cells: OLD_SAMPLE_CELLS, colWidths: null, borderPreset: 'apa' } },
    ],
    authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: [] }],
  };
}

const issuesOld = {
  id: 'T10-issues-older-poster',
  how: 'an older poster stored with the old title, two guidance sentences, both Insert strings and the sample table: Issues, and its stored text after 3 s',
  async run(h, s) {
    const { page } = s;
    const doc = olderPosterDoc();
    const id = await openStoredPoster(h, s, doc);
    await page.waitForTimeout(3000);
    await openTab(page, 'issues');
    const rows = await issueRows(page);
    const stored = rowOf(s.state, id)?.data?.blocks ?? [];
    const changed = doc.blocks.filter((b) => {
      const now = stored.find((x) => x.id === b.id);
      return !now || plain(now.content) !== plain(b.content) || JSON.stringify(now.tableData?.cells ?? null) !== JSON.stringify(b.tableData?.cells ?? null);
    }).map((b) => b.id);
    const want = expectedIssues(doc.blocks);
    return {
      claims: {
        T10: listedStarting(rows) < want.flag,
        T10s: listedSample(rows) < want.sample,
        T10t: !rows.some((r) => /default/i.test(r.category)),
        T11: changed.length > 0,
      },
      numbers: { blocksToFlag: want.flag, listed: listedStarting(rows), sampleListed: listedSample(rows), changedBlocks: changed.join(',') || 'none', rows: JSON.stringify(rows.map((r) => `${r.category}: ${r.message.slice(0, 50)}`)) },
    };
  },
};

/** Click a dialog's button by its words when the dialog asks; false when nothing asked within `ms`. */
async function confirmIfAsked(page, label, ms = 2500) {
  const btn = page.getByRole('button', { name: label, exact: true });
  try {
    await btn.first().waitFor({ state: 'visible', timeout: ms });
  } catch {
    return false;
  }
  await btn.first().click();
  await page.waitForTimeout(400);
  return true;
}

const SIZES = ['48×36', '36×48', '42×36', '36×42', '42×42', '24×36', 'A0L', 'A0P'];

/** The fresh 3-column layout at every size preset: does a block run into another (the table's prompt is the sibling to watch)? */
const sizeSweep = {
  id: 'T12-sizes',
  info: true,
  how: 'each of the 8 size presets (Layout › size, Change size), then Layout › 3-Column Classic (Replace blocks): the overlaps Issues lists on the fresh layout',
  async run(h, s) {
    const { page } = s;
    const out = {};
    for (const key of SIZES) {
      await openTab(page, 'layout');
      const menu = page.locator('[data-postr-sidebar] select').filter({ has: page.locator('option[value="custom"]') }).first();
      if ((await menu.inputValue()) !== key) {
        await menu.selectOption(key);
        await confirmIfAsked(page, 'Change size');
      }
      await page.locator('[data-postr-sidebar] button').filter({ hasText: /^3-Column Classic/ }).first().click();
      await confirmIfAsked(page, 'Replace blocks');
      await page.waitForTimeout(1200);
      await deselect(page);
      await openTab(page, 'issues');
      out[key] = (await issueRows(page)).filter((r) => /overlap/i.test(r.category)).map((r) => r.message);
    }
    const withOverlap = Object.entries(out).filter(([, v]) => v.length).map(([k]) => k);
    return { claims: {}, numbers: { withOverlap: `${withOverlap.length} of ${SIZES.length}`, sizes: withOverlap.join(',') || 'none', overlaps: JSON.stringify(out) } };
  },
};

/**
 * Export › Preview poster on a new poster (review round 1, R1-01: the
 * reviewer's probe G3, folded in). bounded-designs §3.1 rule 6: the prompt
 * shows on the canvas only; Preview shows the poster as it prints.
 */
const preview = {
  id: 'T13-preview',
  how: '/p/new: Export › 👁 Preview poster; the prompts drawn in the preview (computed ::before of every [data-placeholder] in it, and the ink of its first empty text block); then Back to Editor and the canvas prompts',
  async run(h, s) {
    const { page } = s;
    await deselect(page);
    // Information (R1-04): the Issues tab's number on a poster just made.
    await page.waitForTimeout(1000);
    const badge = await page.locator('button[data-postr-tab]').filter({ hasText: /^issues/ }).first().innerText();
    await openTab(page, 'export');
    await page.getByRole('button', { name: /Preview poster/ }).first().click();
    const root = '[data-postr-preview]';
    await page.waitForSelector(`${root} [data-block-id]`, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const pv = await page.evaluate((r) => [...document.querySelectorAll(`${r} [data-placeholder]`)].map((el) => {
      const b = getComputedStyle(el, '::before');
      const ph = el.getAttribute('data-placeholder');
      const c = b.content ?? '';
      return { ph, drawn: b.display !== 'none' && (c.replace(/^"|"$/g, '') === ph || c === 'attr(data-placeholder)') };
    }), root);
    const firstEmpty = (await promptStates(page, root)).find((x) => x.type === 'text' && !x.text);
    const ink = firstEmpty ? await inkIn(page, firstEmpty.id, `${h.out}/T13-preview-text.png`, root) : null;
    const hints = await page.evaluate((r) => document.querySelector(r)?.innerText ?? '', root);
    await page.getByRole('button', { name: 'Back to Editor' }).first().click();
    await page.waitForSelector(root, { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(300);
    await deselect(page);
    const canvas = (await promptStates(page)).filter((x) => !x.text);
    return {
      claims: {
        T13: pv.some((x) => x.drawn),
        T13i: ink !== null && ink >= INK_PROMPT,
        // A guard: the canvas keeps its prompts once Preview closes (main,
        // which starts no block empty, shows it observed).
        T13k: canvas.length === 0 || canvas.some((x) => !promptDrawn(x)),
      },
      numbers: {
        previewPlaceholders: pv.length, previewPromptsDrawn: pv.filter((x) => x.drawn).length,
        drawn: JSON.stringify(pv.filter((x) => x.drawn).map((x) => x.ph.slice(0, 30))),
        previewInkFirstEmptyText: ink,
        canvasEmpty: canvas.length, canvasPromptsDrawn: canvas.filter(promptDrawn).length,
        // Information (older than record 29): the editor's hints, which the
        // print window copies too (R1-02).
        previewEditorHints: JSON.stringify(EDITOR_HINTS.filter((t) => hints.includes(t))),
        issuesTabNewPoster: badge.replace(/\s+/g, ' ').trim(),
      },
    };
  },
};

export const START = [newPoster, insertBlocks, printAndPptx, issuesNew, issuesOld, sizeSweep, preview];
