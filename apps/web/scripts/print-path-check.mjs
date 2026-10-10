#!/usr/bin/env node
/**
 * print-path-check.mjs — the PDF a user saves, from every way the editor
 * offers to print it, against the poster the editor draws (record
 * docs/fixes/30-one-print-path.md; the MVP design doc §3.10 and §5.1
 * blockers 4 and 7: OF-07, printing from Preview runs the title into the
 * authors; OF-08, a selected block's controls in the print document).
 *
 * ENTRY POINTS (the user's, each pressed in the real editor)
 *   export   Export tab › "⎙ Save PDF"
 *   topbar   the top bar's "Save PDF" (owner decision D2; absent before
 *            record 30: reported as TOPBAR)
 *   preview  Export tab › "👁 Preview poster" › "Print / Save PDF"
 *   key      ⌘P on a Mac, Ctrl+P elsewhere, in the editor (before record
 *            30 the editor had no handler: reported as KEY)
 *   Each opens the real print window (a popup); its document is measured
 *   laid out in print media (its @media print rules: the sheet scaled to
 *   the page). In Firefox and WebKit the popup's document completes and its
 *   own script runs (the auto-print waits for the fonts; the headless
 *   engines open no dialog). In Chromium it does not: the popup's request
 *   for the poster font's stylesheet never reaches the harness's routing,
 *   so its document stays "loading" and its script, the auto-print and the
 *   buttons, never runs (review round 2, R2-F4; INFO popup-script counts
 *   it). The layout and page.pdf are read all the same.
 *   A poster with `select` is printed again with that block selected (a
 *   click on it, as a user does before printing: the caret is in its text):
 *   from export, preview and key; and once with ⌘P / Ctrl+P pressed at
 *   once after the click (key+fresh), while the selection's 0.22 s pop is
 *   still scaling the frame. A poster whose `select` is the title is last
 *   typed into until the title gains a line, and printed with ⌘P at once
 *   (key+typed), against the editor as it is then. A poster with `resize`
 *   is last changed to that size (Layout › the size menu › "Change size")
 *   and printed with ⌘P at once, while the answered dialog may still be
 *   fading out (key+resized; review round 1, R1-F1: a key bound to the first render's
 *   print function printed the old size).
 *   The poster with `tableStates` is last typed into, in a cell in the last
 *   column of its longest table, and printed with ⌘P / Ctrl+P with the
 *   pointer left on the cell (key+table-cell: its "Add column" bar shows),
 *   on that row's strip (key+table-strip: tinted), and, first, moved off
 *   the sheet (key+table-off, the control; review round 2, R2-F1). In
 *   Chromium, ⌘P / Ctrl+P inside an input method's composition on the
 *   3-line-title poster (key+composing, DevTools' Input.imeSetComposition;
 *   review round 2, R2-F3), and the print document Save PDF writes in the
 *   editor at thirteen poster sizes with an empty sheet, for the credit mark
 *   (lib/printPathColophon.mjs; review round 2, R2-F2; `--only colophon`
 *   alone). The editor is the server's under test, so under
 *   POSTR_SERVE=preview the build's document is measured (review round 3,
 *   R3-F1: the sweep imported the source's print module, and on the build
 *   read a credit layer broken in dist only as right).
 *   Once per run (with the key entry and user-title3): the engine launched
 *   again with its popup blocker on, ⌘P pressed (lib/printPathBlocker.mjs;
 *   review round 1, R1-F2).
 *
 * POSTERS (lib/printPathPosters.mjs): the five templates and the welcome
 *   poster as a new user meets them; a 3-line title at 48 × 36 and a 4-line
 *   title at 36 × 48 (OF-07's two shapes); long text; figures with
 *   captions and a note; tables with long cells; inserted charts; seven
 *   authors from four institutions; Charter (real font metrics on macOS)
 *   with filled headings. The portrait poster is named after its 144
 *   character title (the print window's toolbar shows the name).
 *
 * MEASURE (lib/printPathRead.mjs): every block's box and the lines of its
 *   text (words grouped by row), in poster inches against the sheet's own
 *   box, in the editor (nothing selected), in Preview's own drawing and in
 *   each print document. Chromium only: the print document's PDF, made by
 *   the engine's print pipeline (page.pdf, the CSS page size preferred,
 *   backgrounds off as the print dialog's "Background graphics" box is by
 *   default: scripts/print-dialog-check.mjs measures that default).
 *
 * CLAIMS (each OBSERVED or not; the gate is POS, WRAP and LINEPOS)
 *   POS      a block's box in the print document more than 0.05 in from the
 *            editor's (left, top, width or height)
 *   WRAP     a block's text broken into lines differently
 *   LINEPOS  a line more than 0.15 in from where the editor draws it in its
 *            block (read to about 0.1 in in the editor: LINE_TOL)
 *   TITLE    the title runs into the block under it in print and not in the
 *            editor (OF-07's symptom; the overlap in inches)
 *   PREVIEW  Preview's own drawing differs from the editor (the same three
 *            comparisons; a sibling: Preview shows what it then prints)
 *   SAME     the entries write different documents (the sheet's markup,
 *            each element's attributes in name order) for the same poster
 *            and the same state
 *   TOPBAR   no "Save PDF" in the top bar
 *   KEY      ⌘P / Ctrl+P writes no print document, or leaves the browser's
 *            own print to run (its default not prevented, also inside an
 *            input method's composition); after a size change, its
 *            document's @page or sheet is not the new size; with the
 *            engine's popup blocker on, it opens no window or shows the
 *            alert
 *   SEL      printed with a block selected: the print document carries the
 *            selection (a selected frame, handles, the selection's
 *            controls), or the editor keeps the selection after printing
 *   TABLEUI  printed with the pointer on a selected table: the print
 *            document carries a table control that paints (the "+" bars, a
 *            tinted row or column strip; lib/printPathStates.mjs), or
 *            Chromium's PDF has a fill in the accent colour on or beside
 *            the table that the control (pointer off the sheet) lacks
 *   PAGE     the print document's @page is not the poster's size with no
 *            margin; Chromium: the PDF's page is not the poster's size
 *   ADJUST   the print document's sheet does not set print-color-adjust:
 *            exact (the computed value, standard or -webkit-); Chromium: a
 *            filled heading's colour missing from the PDF made with
 *            backgrounds off
 *   PDFTEXT  Chromium: a line the editor draws not found at its place in
 *            the PDF: its characters (a multiset, spaces ignored) among the
 *            PDF's text within its line's height and its block's width; a
 *            line past the page's edge is counted apart (offPage)
 *   STEPS    the print window's steps are not the design's (Save as PDF,
 *            with Firefox's name for it, Save to PDF; Margins None; the
 *            paper size if the dialog asks; nothing about "Background
 *            graphics"), or the Export tab says more than its
 *            one line ("Your browser's print window opens. Choose Save as
 *            PDF.") or lists steps of its own
 *   ALERT    with the window blocked (window.open returns null), an entry
 *            that prints does not show today's alert, word for word
 *   HEADER   the print window's screen view: its toolbar and steps cover
 *            the top of the poster, in a window 900, 700 or 500 px wide
 *            (the popup opens at 900 × 700; review round 1, R1-F4); read on
 *            the Export tab's document
 *   CREDIT   the print document lacks the free PDF's credit line ("made with
 *            postr.sh") or does not show it in print, or its box's corner is
 *            more than 0.2 units (0.02 in) from where colophonGeometry() puts
 *            it; Chromium: in the PDF the credit mark is not square, not
 *            colophonGeometry()'s size or its bottom not there, each within
 *            0.015 in (a print pixel and a half), on every poster and at
 *            thirteen sizes (review round 2, R2-F2)
 *   BASE     an editor stylesheet rule that lays out something on the sheet
 *            (Tailwind's base, index.css's list rules) that the print
 *            document does not restate for its sheet, declaration for
 *            declaration (longhands as the engine parses them, so the build's
 *            minified CSS reads as written; review round 2, R2-F5; and
 *            `transparent` read as rgba(0, 0, 0, 0), a border-image
 *            longhand at its initial value dropped: two equivalences,
 *            lib/printPathRead.mjs DECL_EQUIV, review round 3, R3-F2): the
 *            copy carries inline styles only, so such a rule is lost in
 *            print unless restated (the out-of-bounds colouring, motion,
 *            Tailwind's custom properties and Plot's own rules left out);
 *            and a property the sheet inherits (its font, line height,
 *            text rendering…) computed differently on the print sheet than
 *            on the editor's (both read in screen media)
 *   HINT     an editor hint on the print document's sheet ("+ Upload
 *            figure", "Add references in Refs tab →", "Add authors in sidebar
 *            →", "+ Logo", a chart's "Rendering chart…" or its failure
 *            message: HINTS, the harness's own list; record 31): an empty
 *            block prints as empty space; the editor shows the hint, its
 *            sheet read with it (K-self) and without it (WRAP skips the
 *            editor's own marks, and since record 31 the hints carry one)
 *   INFO     text on the sheet in the editor's own UI font (DM Sans, not
 *            loaded by the print window; ui-font); the editor's controls
 *            copied onto the printed sheet, by label (ui-copied: a button,
 *            role="button" strip or titled grip); each print window's
 *            readyState when read (popup-script, R2-F4); the boxes record
 *            29's grey prompts change on the canvas (prompt-sized, below)
 *
 * RECORD 29 (the merge of main, record 30, into it). Its grey prompts are
 *   drawn on the canvas only and never print (simplify-check T7, from
 *   every way to print), but an empty block's prompt sets its height on the
 *   canvas (a text block grows with it; a table's row with its first body
 *   cell's). So the editor is read without them (lib/printPathRead.mjs
 *   readSheet `hidePrompts`): POS, WRAP, LINEPOS and PREVIEW compare the
 *   print document and Preview with the editor's layout of what prints;
 *   INFO prompt-sized lists the boxes the prompts change (MEASURED on the
 *   merge: a 3-Column text block 0.55 in, the 3-column table at 36 × 48
 *   0.75 in, which POS reported before the projection). Its
 *   ADJUSTMENTS_ENABLED hides the table's "+" bars and strips: TABLEUI's
 *   cell and strip variants are skipped while the tree has it off, printed
 *   on the "skipped (switch off)" summary line; the off variant runs.
 *
 * CONTROLS (exit 2 if one fails)
 *   K-self   the editor read twice gives the same reading
 *   K-frame  every upright block is as wide as stored (0.02 in), in the
 *            editor and in each print document
 *   K-sheet  each print document's sheet is the poster's size (0.02 in)
 *   K-count  every block read in the editor is read in the print document
 *   K-hover  each TABLEUI variant's state is on screen before the key: the
 *            "Add column" bar (cell), a tinted strip (strip), no table
 *            control painting (off)
 *   K-compose the composition is open when the key is pressed (isComposing),
 *            and once committed the key opens the print window
 *   K-blocker Firefox: with its popup blocker on, the editor page's own
 *            window from a timer (no input, no evaluate in the 6 s before)
 *            is blocked, so the key press after it is measured. In Chromium
 *            and WebKit an opened timer window means the engine's build
 *            blocks nothing here: reported, not measured (INFO blocker)
 *
 * BLIND SPOTS: the browsers' popup blockers are off (Playwright launches
 *   them so) except in the blocker scenario; there only Firefox's blocks a
 *   window (review round 1: Chromium launched without
 *   --disable-popup-blocking, and WebKit, opened a window from a timer with
 *   no input), so ⌘P under a blocker is measured in Firefox only.
 *   The editor is read at a device scale factor of 1 (--dpr 2 for 2).
 *   The poster's Google font is not loaded (the fake backend aborts it), so
 *   text is laid out in the fallback font in the editor and in print alike;
 *   Charter, installed on macOS, is the real-metrics case.
 *   The PDF is read in Chromium only (page.pdf); Firefox and WebKit are
 *   read as laid out in print media, and their print dialogs are not
 *   driven (scripts/print-dialog-check.mjs reads Chromium's dialog and
 *   Firefox's silent print). Chart text is SVG and is the chart harness's
 *   (chart-print-size-check.mjs); here a chart block is its box.
 *
 * KNOWN until record 31 (record 30 §9, R1-X1): in WebKit, WRAP on
 *   key+resized. WebKit's copy of the sheet lost an empty figure
 *   placeholder's dashed border (React's `all: 'unset'` serialised with the
 *   logical border unset after the physical border), so its hint broke onto
 *   fewer lines in print. Since record 31 the placeholder is an editor hint
 *   the copy drops (HINT), and WebKit's run exits 0.
 *   (Until review round 3, BASE also reported two rules on the production
 *   build that the CSS minifier rewrote, so the build run could not exit 0;
 *   since R3-F2 they compare through DECL_EQUIV and the build run exits 0.)
 *
 * RUN (from apps/web): node scripts/print-path-check.mjs
 *   [--only <poster ids, and colophon for the size sweep>] [--entries export,topbar,preview,key] [--dpr 1|2]
 *   env PORT (default 5840), OUT_DIR, POSTR_BROWSER, POSTR_MUTANT, POSTR_SERVE
 *   (preview: the production build, `npm run build` first; it also uses
 *   PORT + 1, a dev server for the posters' preparation: lib/editorHarness.mjs).
 * EXIT 0 no claim observed · 1 a claim observed, controls held · 2 a control
 *   failed or an error.
 * Side effect: vite.config.ts rewrites public/version.json; put back here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { POSTERS, prepAssets } from './lib/printPathPosters.mjs';
import { DECL_EQUIV, INHERITED, compareSheets, linesInPdf, pdfFacts, readSheet, sheetInherited, sheetRules, titleOverlap, unrestated } from './lib/printPathRead.mjs';
import { clickAway, selectFrame } from './lib/arrangeUi.mjs';
import { blockerHeld, keyUnderBlocker } from './lib/printPathBlocker.mjs';
import { keyComposing, tableStates } from './lib/printPathStates.mjs';
import { COLOPHON_SIZES, colophonSweep, creditMark, geometryOf, pdfImagesAndText } from './lib/printPathColophon.mjs';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
process.exitCode = 2;
const args = process.argv.slice(2);
const argAt = (f) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : null);
const ONLY = argAt('--only') ? new Set(argAt('--only').split(',')) : null;
const ENTRIES = (argAt('--entries') ?? 'export,topbar,preview,key').split(',');
const DPR = Number(argAt('--dpr') ?? 1);
const PORT = Number(process.env.PORT ?? 5840);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-print-path-check'));
process.env.OUT_DIR = OUT;
fs.mkdirSync(OUT, { recursive: true });
const { REPO, WEB, startHarness, openEditor, sleep, SWITCH_OFF } = await import('./lib/editorHarness.mjs');
const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { PDFDocument } = await import(pathToFileURL(path.join(REPO, 'node_modules/pdf-lib/cjs/index.js')).href);
const pdfjs = await import(pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

const TOL = 0.05;
/**
 * A line's place inside its block: the editor lays the sheet out at 10 CSS
 * px per inch, where a word's box comes out a whole px tall (6.000 units
 * against 5.729 in print, the probe in record 30 §4), so where a line sits
 * in the editor is read to about 0.1 in; 0.15 in still catches a margin or
 * a line height lost in print (a 36 pt line is 0.5 in).
 */
const LINE_TOL = 0.15;
const ALERT_TEXT = 'Popup blocked. Please allow popups for this site to use "Save PDF".';
const SIDEBAR_LINE = 'Your browser’s print window opens. Choose Save as PDF.';
const CREDIT_TEXT = 'made with postr.sh';
const PRINT_SHEET = '#poster-print-root #poster-canvas';
/** The editor's hints and prompts on the sheet (record 31's rule: never printed), the harness's own copy. */
const HINTS = ['+ Upload figure', 'click to browse · drag to move', '+ Logo', 'presets · upload · reuse', 'Add authors in sidebar →',
  'Add references in Refs tab →', 'Rendering chart…', 'Something went wrong rendering this chart.', 'Send Feedback'];

const openTab = (page, name) => page.locator('button[data-postr-tab]', { hasText: new RegExp(`^${name}$`, 'i') }).click();
const editorSelected = (page) => page.evaluate(() => document.querySelectorAll('#poster-canvas [data-postr-selected="true"]').length);
const previewOpen = (page) => page.evaluate(() => !!document.querySelector('[data-postr-preview]'));

/** The print shortcut's keys, as this page's system names them. */
const printChord = async (page) => ((await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))) ? 'Meta+KeyP' : 'Control+KeyP');

/** Each ⌘P / Ctrl+P keydown seen at the window, after every handler: whether its default was prevented. */
async function watchPrintKeys(page) {
  await page.evaluate(() => {
    window.__zqPrintKeys = [];
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'p') window.__zqPrintKeys.push(e.defaultPrevented);
    });
  });
}

/**
 * Print from `entry`. Returns { popup } (the print window, its sheet laid
 * out), or { missing } when the entry has no control, or { none } when it
 * opened no window; `preview` holds Preview's own drawing for that entry.
 */
async function printVia(page, entry, posterW, { popupTimeout = 8000 } = {}) {
  const out = {};
  const popupP = page.waitForEvent('popup', { timeout: popupTimeout }).catch(() => null);
  if (entry === 'export') {
    await openTab(page, 'export');
    await page.getByRole('button', { name: '⎙ Save PDF' }).click();
  } else if (entry === 'topbar') {
    const btn = page.locator('[data-postr-editor-topbar] button', { hasText: /Save PDF/ });
    if (!(await btn.count())) return { missing: 'no Save PDF button in the top bar' };
    await btn.first().click();
  } else if (entry === 'preview') {
    await openTab(page, 'export');
    await page.getByRole('button', { name: /Preview poster/ }).click();
    await page.waitForSelector('[data-postr-preview]');
    await sleep(700);
    out.preview = await page.evaluate(readSheet, { sheetSel: '[data-postr-preview] > div:first-child > div', posterW });
    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
  } else if (entry === 'key') {
    await page.keyboard.press(await printChord(page));
  }
  const popup = await popupP;
  if (!popup) return { ...out, none: true };
  await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
  await popup.evaluate(() => document.fonts.ready).catch(() => {});
  return { ...out, popup };
}

/**
 * The print window's own reading: copy in screen media, then the sheet in
 * print media. `label` (the poster and the entry) names the document in a
 * HINT claim: every print document is read for the editor's hints.
 */
async function readPrint(popup, posterW, posterH, label = '') {
  const hints = await popup.evaluate((list) => {
    const sheet = document.querySelector('#poster-print-root #poster-canvas');
    const text = sheet ? sheet.textContent : '';
    return list.filter((x) => text.includes(x));
  }, HINTS);
  if (hints.length) see('HINT', `${label}: ${hints.join(' | ')}`);
  hintReads.n += 1;
  const inherited = await popup.evaluate(sheetInherited, { sel: PRINT_SHEET, props: INHERITED });
  const screen = await popup.evaluate(({ w, h }) => {
    const readyState = document.readyState;
    const hint = document.querySelector('.print-toolbar-hint')?.innerText ?? '';
    let page = null;
    for (const sh of document.styleSheets) {
      let rules = [];
      try { rules = [...sh.cssRules]; } catch { /* the Google Fonts sheet: cross-origin */ }
      for (const r of rules) if (r.type === CSSRule.PAGE_RULE) page = { size: r.style.getPropertyValue('size').trim(), margin: r.style.getPropertyValue('margin').trim() };
    }
    return { readyState, hint, page, sizeText: `${w} × ${h} in` };
  }, { w: posterW, h: posterH });
  await popup.emulateMedia({ media: 'print' });
  await sleep(300);
  const sheet = await popup.evaluate(readSheet, { sheetSel: PRINT_SHEET, posterW });
  const print = await popup.evaluate(() => {
    const el = document.querySelector('#poster-print-root #poster-canvas');
    const cs = getComputedStyle(el);
    const blockCs = getComputedStyle(el.querySelector('[data-block-id]') ?? el);
    const credit = document.querySelector('.postr-attribution');
    const cr = credit?.getBoundingClientRect();
    return {
      adjust: cs.printColorAdjust || cs.webkitPrintColorAdjust || '',
      adjustWebkit: cs.webkitPrintColorAdjust || '',
      adjustBlock: blockCs.printColorAdjust || blockCs.webkitPrintColorAdjust || '',
      chrome: document.querySelectorAll('[data-postr-resize-handle], [data-postr-selection-ui], [data-postr-editor-ui]').length,
      // INFO ui-copied: the editor's controls copied onto the printed sheet
      // (a button, a role="button" strip, a titled grip), by label.
      uiCopied: [...document.querySelectorAll('#poster-print-root #poster-canvas :is(button, [role="button"], [title])')]
        .map((el) => (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || el.tagName.toLowerCase()).replace(/\d+/g, 'N')),
      selectedFrames: document.querySelectorAll('[data-block-id][data-postr-selected="true"]').length,
      credit: credit ? {
        text: credit.innerText.trim(), shown: getComputedStyle(credit).display !== 'none' && cr.width > 0 && cr.height > 0,
        // Its box's gaps to the sheet's right and bottom edges, in sheet units
        // (the sheet's width in px over its stored width: the print's scale cancels).
        gaps: (() => {
          const rr = el.getBoundingClientRect();
          const k = el.offsetWidth / rr.width;
          return [(rr.right - cr.right) * k, (rr.bottom - cr.bottom) * k].map((v) => Math.round(v * 100) / 100);
        })(),
      } : null,
      // The sheet's markup with each element's attributes in name order: an
      // attribute React took off and put back (a block's out-of-bounds flag,
      // while Preview hid the editor) comes back last, the same document.
      markup: (function canon(n) {
        if (n.nodeType === 3) return n.textContent;
        if (n.nodeType !== 1) return '';
        const attrs = [...n.attributes].map((a) => `${a.name}="${a.value}"`).sort().join(' ');
        return `<${n.tagName.toLowerCase()} ${attrs}>${[...n.childNodes].map(canon).join('')}</${n.tagName.toLowerCase()}>`;
      })(document.getElementById('poster-print-root')),
    };
  });
  return { ...screen, inherited, sheet, ...print, hints };
}

/**
 * HEADER: the print window's document in screen media at 900, 700 and 500
 * px wide: how far its toolbar and steps reach over the top of the poster
 * (0 when they end above it). Laid out in a new page of the same context
 * (its own print call left out), not in the popup: once the popup has
 * called window.print(), Firefox never finishes resizing it (a scratch
 * probe: 10 s and no answer, record 30 §9).
 */
async function readHeader(popup) {
  const html = (await popup.content()).replace('window.print();', '/* not printed here */');
  const pg = await popup.context().newPage();
  const out = [];
  try {
    await pg.setContent(html, { waitUntil: 'load' }).catch(() => {});
    for (const width of [900, 700, 500]) {
      await pg.setViewportSize({ width, height: 700 });
      await sleep(150);
      const m = await pg.evaluate(() => {
        const bottom = Math.max(...['.print-toolbar', '.print-toolbar-hint'].map((s) => document.querySelector(s)?.getBoundingClientRect().bottom ?? 0));
        const top = document.getElementById('poster-print-root').getBoundingClientRect().top;
        const r1 = (v) => Math.round(v * 10) / 10;
        return { headerBottom: r1(bottom), posterTop: r1(top), covered: r1(Math.max(0, bottom - top)) };
      });
      out.push({ width, ...m });
    }
  } finally {
    await pg.close().catch(() => {});
  }
  return out;
}

/** The Export tab's print copy: the panel around "⎙ Save PDF" (up to the next section label). */
const exportCopy = (page) => page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '⎙ Save PDF');
  if (!btn) return null;
  const bits = [];
  for (let n = btn.nextElementSibling; n; n = n.nextElementSibling) {
    if (/Editable formats/.test(n.textContent)) break;
    bits.push({ text: n.innerText.trim(), lists: n.querySelectorAll('ol, ul, li').length + (/^(OL|UL)$/.test(n.tagName) ? 1 : 0) });
  }
  return bits;
});

const stamp = fs.readFileSync(path.join(WEB, 'public/version.json'));
// An error starting the harness (a bad POSTR_MUTANT, a port in use) is an
// instrument error, exit 2; uncaught, Node exited 1, which reads as a claim.
const h = await startHarness({ name: 'print-path-check', port: PORT }).catch((e) => {
  log(`ERROR starting the harness: ${String(e).slice(0, 300)}`);
  fs.writeFileSync(path.join(WEB, 'public/version.json'), stamp);
  process.exit(2);
});
const R = { git: h.git, engine: h.engine, mutant: h.mutant, serve: h.serve, dpr: DPR, posters: [], copy: null, errors: [] };
const controlFails = [];
const claims = Object.fromEntries(['POS', 'WRAP', 'LINEPOS', 'TITLE', 'PREVIEW', 'SAME', 'TOPBAR', 'KEY', 'SEL', 'TABLEUI', 'PAGE', 'ADJUST', 'PDFTEXT', 'STEPS', 'ALERT', 'HEADER', 'CREDIT', 'BASE', 'HINT'].map((c) => [c, []]));
const baseSeen = new Set();
const see = (c, what) => claims[c].push(what);
/** INFO tallies: each print window's readyState when read; the editor controls copied onto its sheet, by label. */
const info = { readyState: {}, uiCopied: {} };
const tally = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
/** How many print documents were read for HINT (every one readPrint reads). */
const hintReads = { n: 0 };

try {
  const prep = await (await h.browser.newContext()).newPage();
  const assets = await prepAssets(prep, h.docBase, REPO);
  await prep.context().close();
  // colophonGeometry() for each poster's size, from the app's own module (CREDIT, Chromium's PDF).
  const GEO = await geometryOf(h.browser, h.docBase, [...new Set(POSTERS.flatMap((p) => [p.size, p.resize ?? p.size]).map((z) => `${z.w}x${z.h}`))].map((k) => k.split('x').map(Number)));
  log(`[harness] ${POSTERS.length} posters; entries ${ENTRIES.join(', ')}; engine ${h.engine}`);

  for (const P of POSTERS) {
    if (ONLY && !ONLY.has(P.id)) continue;
    const row = { id: P.id, size: P.size, entries: {}, selected: {} };
    R.posters.push(row);
    let ed;
    try {
      ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR, poster: P.size, rowTitle: P.name, editDoc: (doc) => ({ ...doc, ...P.build(assets) }) });
      const { page } = ed;
      await page.waitForFunction(() => [...document.querySelectorAll('#poster-canvas [data-block-type="chart"]')].every((b) => b.querySelector('svg[viewBox]')), null, { timeout: 30000 });
      await sleep(500);
      await clickAway(page);
      await page.keyboard.press('Escape');
      await sleep(300);
      await watchPrintKeys(page);
      // The editor without record 29's prompts (canvas only, never printed):
      // its layout of what prints (lib/printPathRead.mjs readSheet). How far
      // the prompts move a box on the canvas is INFO prompt-sized.
      const ref = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: P.size.w, hidePrompts: true });
      const again = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: P.size.w, hidePrompts: true });
      const withPrompts = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: P.size.w });
      row.promptSized = compareSheets(ref, withPrompts, TOL).boxes.map((b) => ({ type: b.type, d: b.d }));
      const self = compareSheets(ref, again, 0);
      if (self.boxes.length || self.wraps.length || self.linePos.length) controlFails.push(`K-self ${P.id}: ${JSON.stringify(self).slice(0, 200)}`);
      const stored = new Map((ed.state.row?.data?.blocks ?? []).map((b) => [b.id, b]));
      const kFrame = (sheet, where) => {
        for (const b of sheet.blocks) {
          const s = stored.get(b.id);
          if (s && !s.rotation && Math.abs(b.box[2] - s.w / 10) > 0.02) controlFails.push(`K-frame ${P.id} ${where}: ${b.type} ${b.id} ${b.box[2]} in wide, stored ${s.w / 10}`);
        }
      };
      kFrame(ref, 'editor');
      row.editor = { blocks: ref.blocks.length, lines: ref.blocks.reduce((n, b) => n + b.lines.length, 0), title: titleOverlap(ref) };
      const rules = await page.evaluate(sheetRules, DECL_EQUIV);
      row.editor.rules = rules.length;
      const inherited = await page.evaluate(sheetInherited, { sel: '#poster-canvas', props: INHERITED });
      // INFO ui-font: visible text on the sheet whose font is the editor's own (DM Sans).
      row.editor.uiFontText = await page.evaluate(() => {
        const out = [];
        const w = document.createTreeWalker(document.getElementById('poster-canvas'), NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const p = n.parentElement;
          // The editor's own marks and hints (never printed since record 31) aside.
          if (!n.textContent.trim() || !p || p.closest('[data-postr-selection-ui], [data-postr-resize-handle], [data-postr-overlay], [data-postr-editor-ui], button')) continue;
          if (/^\s*"?DM Sans/i.test(getComputedStyle(p).fontFamily)) out.push(n.textContent.trim().slice(0, 30));
        }
        return out;
      });
      const markups = {};

      const runEntry = async (entry, label, target) => {
        const before = await page.evaluate(() => window.__zqPrintKeys.length);
        const got = await printVia(page, entry, P.size.w, { popupTimeout: entry === 'key' ? 4000 : 8000 });
        const r = { entry };
        target[label] = r;
        if (entry === 'key') {
          const keys = await page.evaluate((b) => window.__zqPrintKeys.slice(b), before);
          r.keyPrevented = keys;
          if (!keys.length || keys.some((p) => !p)) see('KEY', `${P.id} ${label}: default prevented ${JSON.stringify(keys)}`);
        }
        if (got.preview) {
          const pc = compareSheets(ref, got.preview, TOL, LINE_TOL);
          r.preview = { worstBox: pc.worstBox, worstLine: pc.worstLine, boxes: pc.boxes.length, wraps: pc.wraps.length, title: titleOverlap(got.preview) };
          if (pc.boxes.length || pc.wraps.length || pc.linePos.length) see('PREVIEW', `${P.id} ${label}: ${pc.boxes.length} boxes (worst ${pc.worstBox} in), ${pc.wraps.length} wraps, ${pc.linePos.length} lines moved`);
        }
        if (got.missing) { r.missing = got.missing; if (entry === 'topbar') see('TOPBAR', `${P.id}: ${got.missing}`); return; }
        if (got.none) {
          r.none = true;
          if (entry === 'key') see('KEY', `${P.id} ${label}: no print window`);
          else see('POS', `${P.id} ${label}: no print window`);
          return;
        }
        const pr = await readPrint(got.popup, P.size.w, P.size.h, `${P.id} ${label}`);
        r.hints = pr.hints;
        tally(info.readyState, pr.readyState);
        for (const u of pr.uiCopied) tally(info.uiCopied, u);
        r.readyState = pr.readyState;
        kFrame(pr.sheet, label);
        if (Math.abs(pr.sheet.sheetIn[1] - P.size.h) > 0.02) controlFails.push(`K-sheet ${P.id} ${label}: sheet ${pr.sheet.sheetIn.join(' × ')} in`);
        const c = compareSheets(ref, pr.sheet, TOL, LINE_TOL);
        if (label === entry) {
          const differ = INHERITED.filter((k) => inherited[k] !== pr.inherited?.[k]);
          r.inherited = Object.fromEntries(differ.map((k) => [k, [inherited[k], pr.inherited?.[k]]]));
          for (const k of differ) {
            if (!baseSeen.has(`inherit:${k}`)) { baseSeen.add(`inherit:${k}`); see('BASE', `${P.id} ${label}: the sheet inherits ${k} ${JSON.stringify(inherited[k])} in the editor, ${JSON.stringify(pr.inherited?.[k])} in print`); }
          }
          const lost = await got.popup.evaluate(unrestated, { rules, equiv: DECL_EQUIV });
          r.baseLost = lost.length;
          for (const x of lost) {
            if (!baseSeen.has(x.selector)) { baseSeen.add(x.selector); see('BASE', `${P.id} ${label}: "${x.selector}" { ${x.css} } not restated`); }
          }
        }
        if (c.missing.length) controlFails.push(`K-count ${P.id} ${label}: ${c.missing.slice(0, 3).join('; ')}`);
        r.worstBox = c.worstBox;
        r.worstLine = c.worstLine;
        r.title = titleOverlap(pr.sheet);
        r.boxes = c.boxes.slice(0, 6);
        r.wraps = c.wraps.slice(0, 6);
        r.linePos = c.linePos.slice(0, 6);
        if (c.boxes.length) see('POS', `${P.id} ${label}: ${c.boxes.length} of ${ref.blocks.length} blocks off, worst ${c.worstBox} in (${c.boxes.slice(0, 3).map((b) => b.type).join(', ')})`);
        if (c.wraps.length) see('WRAP', `${P.id} ${label}: ${c.wraps.length} blocks broken differently (${c.wraps.slice(0, 3).map((w) => `${w.type} ${w.lines.join('→')} lines`).join(', ')})`);
        if (c.linePos.length) see('LINEPOS', `${P.id} ${label}: ${c.linePos.length} blocks' lines moved, worst ${c.worstLine} in`);
        const tEd = row.editor.title?.overlapIn ?? -1;
        if (r.title && r.title.overlapIn > 0.005 && tEd <= 0.005) see('TITLE', `${P.id} ${label}: the title runs ${r.title.overlapIn} in into the ${r.title.under}`);
        r.page = pr.page;
        const sizeOk = pr.page && pr.page.size.replace(/\s+/g, ' ') === `${P.size.w}in ${P.size.h}in` && /^0(px|in)?$/.test(pr.page.margin);
        if (!sizeOk) see('PAGE', `${P.id} ${label}: @page ${JSON.stringify(pr.page)}`);
        r.adjust = [pr.adjust, pr.adjustWebkit, pr.adjustBlock];
        if (pr.adjust !== 'exact' || pr.adjustBlock !== 'exact') see('ADJUST', `${P.id} ${label}: print-color-adjust ${pr.adjust || 'unset'} (block ${pr.adjustBlock || 'unset'})`);
        r.credit = pr.credit;
        if (!pr.credit || pr.credit.text !== CREDIT_TEXT || !pr.credit.shown) see('CREDIT', `${P.id} ${label}: ${JSON.stringify(pr.credit)}`);
        // The line's corner where colophonGeometry() puts it, in every engine (0.2 units, 0.02 in).
        const cg = GEO[`${P.size.w}×${P.size.h}`]?.geo;
        if (pr.credit && cg && (Math.abs(pr.credit.gaps[0] - cg.rightUnits) > 0.2 || Math.abs(pr.credit.gaps[1] - cg.bottomUnits) > 0.2)) see('CREDIT', `${P.id} ${label}: the credit line ${pr.credit.gaps.join(', ')} units from the sheet's right and bottom edges, the geometry's ${cg.rightUnits}`);
        r.hint = pr.hint;
        const hintOk = /Save as PDF/.test(pr.hint) && /Firefox, Save to PDF/.test(pr.hint) && /Margins/.test(pr.hint) && /None/.test(pr.hint) && pr.hint.includes(pr.sizeText) && !/Background graphics/i.test(pr.hint);
        if (!hintOk) see('STEPS', `${P.id} ${label}: print window says "${pr.hint.replace(/\s+/g, ' ').slice(0, 220)}"`);
        r.chrome = pr.chrome;
        r.selectedFrames = pr.selectedFrames;
        if (label !== entry) {
          const still = await editorSelected(page);
          r.editorSelectedAfter = still;
          if (pr.chrome || pr.selectedFrames || still) see('SEL', `${P.id} ${label}: print ${pr.selectedFrames} selected frames, ${pr.chrome} controls; editor still has ${still} selected`);
        } else markups[entry] = pr.markup;
        if (h.engine === 'chromium' && label === 'export') {
          const bytes = await got.popup.pdf({ preferCSSPageSize: true, printBackground: false });
          fs.writeFileSync(path.join(OUT, `${P.id}.pdf`), bytes);
          const pf = await pdfFacts(bytes, { PDFDocument, pdfjs });
          r.pdf = { pages: pf.pages, pageIn: pf.pageIn, areas: pf.areas.length };
          if (pf.pages !== 1 || Math.abs(pf.pageIn[0] - P.size.w) > 0.01 || Math.abs(pf.pageIn[1] - P.size.h) > 0.01) see('PAGE', `${P.id} pdf: ${pf.pages} page(s) of ${pf.pageIn.join(' × ')} in`);
          const lt = linesInPdf(ref, pf, TOL);
          r.pdf.lines = { checked: lt.checked, offPage: lt.offPage, lost: lt.lost.length, sample: lt.lost.slice(0, 3) };
          if (lt.lost.length) see('PDFTEXT', `${P.id}: ${lt.lost.length} of ${lt.checked} lines not at their place in the PDF (${lt.lost.slice(0, 2).map((x) => `${x.type} "${x.line.slice(0, 30)}"`).join('; ')})`);
          // The credit mark against colophonGeometry() (review round 2, R2-F2).
          const g = GEO[`${P.size.w}×${P.size.h}`];
          const cm = creditMark(await pdfImagesAndText(bytes, { pdfjs }), { w: P.size.w, h: P.size.h, geo: g.geo, px: g.px });
          r.pdf.creditMark = cm;
          if (cm.wrong.length) see('CREDIT', `${P.id} pdf: the credit mark ${cm.wrong.join('; ')}`);
          const doc = ed.state.row?.data ?? {};
          if (doc.headingStyle?.fill) {
            const want = String(doc.palette?.headerBg ?? '').toLowerCase();
            r.pdf.headingFill = { want, painted: pf.areas.includes(want) };
            if (!pf.areas.includes(want)) see('ADJUST', `${P.id} pdf: the filled headings' ${want} is not painted with backgrounds off (${pf.areas.length} painted area colours: ${pf.areas.slice(0, 6).join(' ')})`);
          }
        }
        if (label === 'export') {
          r.header = await readHeader(got.popup);
          const over = r.header.filter((x) => x.covered > 0.5);
          if (over.length) see('HEADER', `${P.id}: the toolbar and steps cover the top of the poster by ${over.map((x) => `${x.covered} px at ${x.width} px`).join(', ')}`);
        }
        await got.popup.close().catch(() => {});
        if (await previewOpen(page)) await page.getByRole('button', { name: 'Back to Editor' }).click();
        await sleep(300);
      };

      for (const entry of ENTRIES) await runEntry(entry, entry, row.entries);
      const ms = Object.entries(markups);
      if (ms.length > 1 && ms.some(([, m]) => m !== ms[0][1])) {
        see('SAME', `${P.id}: ${ms.filter(([, m]) => m !== ms[0][1]).map(([e]) => e).join(', ')} differ from ${ms[0][0]}`);
        // The documents, to diff by hand.
        for (const [e, mk] of ms) fs.writeFileSync(path.join(OUT, `${P.id}-${e}.html`), mk);
      }
      row.sameMarkup = ms.length > 1 ? ms.every(([, m]) => m === ms[0][1]) : null;

      if (P.select && ENTRIES.includes('key')) {
        // Selected and printed at once (⌘P a moment after the click): the
        // selection's pop, a 0.22 s scale from 1.04 to 1 on the frame
        // (motion/timelines/blockSelection.ts), is still running.
        const id = ref.blocks.find((b) => b.type === P.select)?.id;
        const fr = await page.locator(`#poster-canvas [data-block-id="${id}"]`).first().boundingBox();
        const chord = await printChord(page);
        const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
        await page.mouse.click(fr.x + 3, fr.y + 3);
        await page.keyboard.press(chord);
        // The window opened by that key press, measured as any other.
        const popup = await popupP;
        row.selected['key+fresh'] = popup ? { opened: true } : { none: true };
        if (popup) {
          await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
          const pr = await readPrint(popup, P.size.w, P.size.h, `${P.id} key+fresh`);
          const c = compareSheets(ref, pr.sheet, TOL, LINE_TOL);
          Object.assign(row.selected['key+fresh'], { worstBox: c.worstBox, worstLine: c.worstLine, boxes: c.boxes.slice(0, 3), wraps: c.wraps.length });
          if (c.boxes.length) see('POS', `${P.id} key+fresh: ${c.boxes.length} blocks off, worst ${c.worstBox} in (${c.boxes.slice(0, 3).map((b) => b.type).join(', ')})`);
          if (c.wraps.length) see('WRAP', `${P.id} key+fresh: ${c.wraps.length} blocks broken differently`);
          await popup.close().catch(() => {});
        } else see('KEY', `${P.id} key+fresh: no print window`);
        await clickAway(page);
      }

      if (P.select === 'title' && ENTRIES.includes('key')) {
        // Typed into the selected title until it gains a line, then ⌘P at
        // once: the copy against the editor as it is after printing (its
        // own reading, the title longer). Runs last: it changes the poster.
        row.typed = true;
      }

      if (P.select) {
        for (const entry of ['export', 'preview', 'key'].filter((e) => ENTRIES.includes(e))) {
          const id = ref.blocks.find((b) => b.type === P.select)?.id;
          if (!id) { controlFails.push(`select ${P.id}: no ${P.select} block`); break; }
          await selectFrame(page, id);
          const n = await editorSelected(page);
          if (n !== 1) { controlFails.push(`select ${P.id} ${entry}: ${n} blocks selected after the click`); continue; }
          await runEntry(entry, `${entry}+selected`, row.selected);
          await clickAway(page);
        }
      }

      if (row.typed) {
        const title = page.locator('#poster-canvas [data-block-type="title"] [contenteditable]').first();
        await title.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' and several more words that wrap the title onto one more line');
        await sleep(400);
        const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
        await page.keyboard.press(await printChord(page));
        const popup = await popupP;
        row.selected['key+typed'] = popup ? { opened: true } : { none: true };
        if (popup) {
          await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
          const now = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: P.size.w, hidePrompts: true });
          const pr = await readPrint(popup, P.size.w, P.size.h, `${P.id} key+typed`);
          const c = compareSheets(now, pr.sheet, TOL, LINE_TOL);
          Object.assign(row.selected['key+typed'], { worstBox: c.worstBox, worstLine: c.worstLine, boxes: c.boxes.slice(0, 3), wraps: c.wraps.length, title: titleOverlap(pr.sheet), editorTitle: titleOverlap(now) });
          if (c.boxes.length) see('POS', `${P.id} key+typed: ${c.boxes.length} blocks off, worst ${c.worstBox} in (${c.boxes.slice(0, 3).map((b) => b.type).join(', ')})`);
          if (c.wraps.length) see('WRAP', `${P.id} key+typed: ${c.wraps.length} blocks broken differently`);
          await popup.close().catch(() => {});
        } else see('KEY', `${P.id} key+typed: no print window`);
      }

      if (P.resize && ENTRIES.includes('key')) {
        // Layout › the size menu › "Change size", then ⌘P / Ctrl+P at once,
        // while the answered dialog may still be fading out: the window
        // prints the poster at its new size, as the editor draws it then
        // (review round 1, R1-F1). Runs last: it changes the poster.
        const { key: sizeKey, w: nw, h: nh } = P.resize;
        const chord = await printChord(page);
        await openTab(page, 'layout');
        await page.locator('select:has(option[value="custom"])').first().selectOption(sizeKey);
        await page.getByRole('button', { name: 'Change size' }).click();
        const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
        await page.keyboard.press(chord);
        const popup = await popupP;
        row.selected['key+resized'] = popup ? { opened: true } : { none: true };
        if (popup) {
          await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
          await popup.evaluate(() => document.fonts.ready).catch(() => {});
          await sleep(300);
          const now = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: nw, hidePrompts: true });
          const pr = await readPrint(popup, nw, nh, `${P.id} key+resized`);
          const c = compareSheets(now, pr.sheet, TOL, LINE_TOL);
          const sizeOk = pr.page && pr.page.size.replace(/\s+/g, ' ') === `${nw}in ${nh}in`;
          Object.assign(row.selected['key+resized'], { page: pr.page, sheetIn: pr.sheet.sheetIn, worstBox: c.worstBox, worstLine: c.worstLine, boxes: c.boxes.slice(0, 3), wraps: c.wraps.slice(0, 3) });
          // Here a sheet of another size is the defect measured, not the reading's.
          if (!sizeOk || Math.abs(pr.sheet.sheetIn[1] - nh) > 0.02) see('KEY', `${P.id} key+resized: @page ${JSON.stringify(pr.page)}, sheet ${pr.sheet.sheetIn.join(' × ')} in, for a ${nw} × ${nh} in poster`);
          if (c.missing.length) controlFails.push(`K-count ${P.id} key+resized: ${c.missing.slice(0, 3).join('; ')}`);
          if (c.boxes.length) see('POS', `${P.id} key+resized: ${c.boxes.length} blocks off, worst ${c.worstBox} in (${c.boxes.slice(0, 3).map((b) => b.type).join(', ')})`);
          if (c.wraps.length) see('WRAP', `${P.id} key+resized: ${c.wraps.length} blocks broken differently`);
          await popup.close().catch(() => {});
        } else see('KEY', `${P.id} key+resized: no print window`);
      }

      if (P.tableStates && ENTRIES.includes('key')) {
        // TABLEUI (review round 2, R2-F1): lib/printPathStates.mjs. Runs last: it changes the poster.
        row.tableStates = await tableStates({
          page, P, ed, engine: h.engine, sleep, clickAway, chord: await printChord(page), readPrint, readSheet, compareSheets,
          tol: [TOL, LINE_TOL], see, controlFails, pdfjs, savePdf: (name, bytes) => fs.writeFileSync(path.join(OUT, name), bytes),
        });
      }

      if (P.id === 'user-title3' && ENTRIES.includes('key') && h.engine === 'chromium') {
        // ⌘P / Ctrl+P inside an input method's composition (review round 2,
        // R2-F3): the browser's own print of the editor page must be kept
        // away; once the composition is committed the key prints (K-compose).
        const cmp = await keyComposing(page, { textSel: '#poster-canvas [data-block-type="text"] [contenteditable]', chord: await printChord(page), sleep });
        row.composing = cmp;
        const first = cmp.keys[0];
        if (!first?.composing || !cmp.openedAfter) controlFails.push(`K-compose ${P.id}: ${JSON.stringify(cmp)}`);
        else if (!first.prevented) see('KEY', `${P.id} key+composing: inside a composition the default is not prevented (the browser prints the editor page)${cmp.openedDuring ? '' : '; no print window'}`);
      }

      if (P.id === 'user-title3') {
        // ALERT: the window blocked, each entry pressed once.
        await page.evaluate(() => { window.__zqOpen = window.open; window.open = () => null; });
        row.alerts = {};
        for (const entry of ENTRIES) {
          let msg = null;
          const onDialog = (d) => { msg = d.message(); d.accept().catch(() => {}); };
          page.on('dialog', onDialog);
          const got = await printVia(page, entry, P.size.w, { popupTimeout: 1500 }).catch((e) => ({ error: String(e).slice(0, 120) }));
          await sleep(400);
          page.off('dialog', onDialog);
          row.alerts[entry] = got.missing ? `(${got.missing})` : msg;
          if (!got.missing && msg !== ALERT_TEXT) see('ALERT', `${P.id} ${entry}: ${JSON.stringify(msg)}`);
          if (await previewOpen(page)) await page.getByRole('button', { name: 'Back to Editor' }).click();
          await page.keyboard.press('Escape');
        }
        await page.evaluate(() => { window.open = window.__zqOpen; });
        // STEPS (the sidebar): what the Export tab says about the print dialog.
        await openTab(page, 'export');
        const copy = await exportCopy(page);
        R.copy = copy;
        const text = (copy ?? []).map((c) => c.text).join(' | ');
        const lists = (copy ?? []).reduce((n, c) => n + c.lists, 0);
        if (!copy || text.trim() !== SIDEBAR_LINE || lists) see('STEPS', `Export tab: "${text.replace(/\s+/g, ' ').slice(0, 200)}" (${lists} list elements)`);
      }
      for (const e of ed.state.errors) R.errors.push(`${P.id}: ${e}`);
      log(`[P] ${P.id} ${P.size.w}×${P.size.h}: ${Object.entries({ ...row.entries, ...row.selected }).map(([k, v]) => `${k} ${v.missing ? 'missing' : v.none ? 'none' : `box ${v.worstBox} line ${v.worstLine}${v.wraps?.length ? ` wraps ${v.wraps.length}` : ''}`}`).join('; ')}`);
    } catch (e) {
      R.errors.push(`${P.id}: ${String(e).slice(0, 300)}`);
      log(`[P] ${P.id}: ERROR ${String(e).slice(0, 300)}`);
    } finally {
      await ed?.context.close().catch(() => {});
    }
  }

  const blockerPoster = POSTERS.find((p) => p.id === 'user-title3');
  if (ENTRIES.includes('key') && (!ONLY || ONLY.has(blockerPoster.id))) {
    // ⌘P / Ctrl+P with the engine's popup blocker on (lib/printPathBlocker.mjs).
    const b = await keyUnderBlocker({ h, engines, openEditor, sleep, poster: blockerPoster, assets });
    R.blocker = b;
    if (blockerHeld(b)) {
      if (!b.opened || b.alerts.length) see('KEY', `under ${h.engine}'s popup blocker: ${b.opened ? 'window opened' : 'no print window'}${b.alerts.length ? `, alert ${JSON.stringify(b.alerts[0])}` : ''}`);
    } else if (h.engine === 'firefox') {
      controlFails.push(`K-blocker: the page's own timer window ${b.timer} (${b.gapMs} ms after the last evaluate, ${b.timerBeforePress ? 'before' : 'not before'} the key)`);
    }
    const why = b.timer === 'opened' ? 'this engine\'s build opened the page\'s own timer window' : 'the control did not hold';
    log(`[${blockerHeld(b) ? 'blocker' : 'INFO blocker'}] ${JSON.stringify(b)}${blockerHeld(b) ? '' : ` (not measured: ${why})`}`);
  }

  if (h.engine === 'chromium' && (!ONLY || ONLY.has('colophon'))) {
    // CREDIT at thirteen sizes (review round 2, R2-F2): the print document
    // Save PDF writes in the editor under test (review round 3, R3-F1), an
    // empty sheet, Chromium's PDF, the mark against colophonGeometry().
    R.colophon = await colophonSweep({ h, openEditor, sizes: COLOPHON_SIZES, pdfjs, outDir: OUT, fs });
    for (const c of R.colophon) if (c.wrong.length) see('CREDIT', `sweep ${c.size}: the credit mark ${c.wrong.join('; ')}`);
    for (const c of R.colophon) for (const e of c.errors) R.errors.push(`colophon ${c.size}: ${e}`);
    log(`[colophon] ${R.colophon.map((c) => `${c.size} ${c.mark ? `${c.mark[2]}×${c.mark[3]}` : 'none'} (want ${c.want}) text ${c.credit?.baselineUp ?? '?'} up`).join(' · ')}`);
  }

} catch (e) {
  R.errors.push(String(e).slice(0, 400));
  log(`ERROR ${String(e).slice(0, 400)}`);
} finally {
  await h.stop();
  fs.writeFileSync(path.join(WEB, 'public/version.json'), stamp);
}

R.claims = claims;
R.controlFails = controlFails;
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 2));
for (const [c, rows] of Object.entries(claims)) {
  log(`[${rows.length ? 'OBSERVED' : 'not observed'} ${c}] ${rows.length}${rows.length ? `: ${rows.slice(0, 4).join(' · ')}${rows.length > 4 ? ` … (+${rows.length - 4})` : ''}` : ''}`);
}
R.info = info;
log(`[INFO popup-script] print windows by readyState when read: ${JSON.stringify(info.readyState)} (Chromium: a popup's stylesheet request never reaches the harness's routing, so its document stays "loading" and its own script, the auto-print and the buttons, never runs: review round 2, R2-F4)`);
log(`[INFO ui-copied] editor controls copied onto the printed sheet, by label: ${JSON.stringify(info.uiCopied)}`);
log(`[INFO hint-reads] ${hintReads.n} print documents read for the editor's hints (HINT)`);
const uiFont = R.posters.filter((p) => p.editor?.uiFontText?.length).map((p) => `${p.id}: ${p.editor.uiFontText.length} (${p.editor.uiFontText.slice(0, 3).join(' | ')})`);
log(`[INFO ui-font] ${uiFont.length ? uiFont.join(' · ') : 'no sheet text in the editor\'s UI font'}`);
const promptSized = R.posters.filter((p) => p.promptSized?.length).map((p) => `${p.id}: ${p.promptSized.map((b) => `${b.type} ${b.d} in`).join(', ')}`);
log(`[INFO prompt-sized] boxes record 29's prompts change on the canvas (not printed; POS reads the editor without them): ${promptSized.length ? promptSized.join(' · ') : 'none'}`);
const switchSkips = R.posters.flatMap((p) => Object.entries(p.tableStates ?? {}).filter(([, t]) => t.switchOff).map(([label]) => `${p.id} ${label}`));
log(`[harness] ${SWITCH_OFF}: ${switchSkips.length}${switchSkips.length ? ` (${switchSkips.join(', ')})` : ''}`);
log(`[controls] ${controlFails.length ? `FAILED ${controlFails.length}: ${controlFails.slice(0, 4).join(' · ')}` : 'held'}; errors ${R.errors.length}${R.errors.length ? `: ${R.errors.slice(0, 3).join(' · ')}` : ''}`);
log(`[out] ${path.join(OUT, 'results.json')}`);
process.exitCode = controlFails.length || R.errors.length ? 2 : Object.values(claims).some((r) => r.length) ? 1 : 0;
