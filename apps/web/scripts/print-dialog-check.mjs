#!/usr/bin/env node
/**
 * print-dialog-check.mjs — what the browsers' print dialogs make of the
 * document "Save PDF" writes (record docs/fixes/30-one-print-path.md; the
 * MVP design doc §3.10 "Check before building": which browsers make a PDF
 * page of the poster's size, and whether Chrome still offers a paper size
 * once `@page` size is set). Its results are the print window's steps.
 *
 * HOW
 *   1. The real editor (lib/editorHarness.mjs, the backend faked) opens a
 *      poster with filled headings (lib/printPathPosters.mjs
 *      user-charter-filled); Export › "⎙ Save PDF" (window.open stubbed)
 *      gives the document; the editor's own reading of the sheet
 *      (lib/printPathRead.mjs readSheet) is kept.
 *   2. Chromium's print dialog: Playwright's Chromium, the full browser,
 *      HEADED (a window opens for a few seconds), a fresh profile whose saved
 *      print settings pick "Save as PDF" (this machine's default destination
 *      may be a real printer: nothing here ever presses Print or Save). The
 *      document is loaded; it opens the dialog itself (window.print() once
 *      its fonts are ready). Read from the dialog (chrome://print, through
 *      the DevTools protocol): whether it offers a paper size, a layout,
 *      margins and "Background graphics", and their values; and the PDF its
 *      preview holds, which "Save" writes (the preview at the dialog's
 *      default settings).
 *   3. Firefox: Playwright's Firefox printing silently to "Mozilla Save to
 *      PDF" with its default print settings (backgrounds off), the document
 *      loaded the same way. Not its dialog: Firefox's dialog is browser
 *      chrome, out of Playwright's reach. Printed again with
 *      print.save_as_pdf.use_page_rule_size_as_paper_size.enabled set true
 *      and false: the pref's default is compiled into Firefox, and which of
 *      the two its default prints like is read from the PDFs' pages. And
 *      Firefox's own print UI, read from its omni.ja (Playwright's build;
 *      review round 1, R1-F3): what its dialog calls its PDF printer
 *      (printUI.ftl), its paper list, and whether its print.js hides the
 *      paper size when that pref is on and the page sets its size.
 *   Every request but the page itself and data: URLs is aborted (the
 *   poster's Google Font included), in both.
 *
 * CLAIMS
 *   PAPER    Chromium's dialog offers a paper size for the document
 *   PDFSIZE  Chromium's preview PDF is not one page of the poster's size
 *   PLACE    a line the editor draws is not at its place in Chromium's
 *            preview PDF (margins or scale) (printPathRead linesInPdf)
 *   BG       a filled heading's colour is not painted in Chromium's preview
 *            PDF (Background graphics as the dialog leaves it), or in
 *            Firefox's silent PDF (backgrounds off)
 *   LABEL    the print window's steps do not name Firefox's PDF printer as
 *            Firefox's dialog names it (its printUI.ftl)
 *   INFO     the dialog's layout, margins and Background graphics settings
 *            (offered, value); Firefox's PDF page size, with the @page pref
 *            at its default, true and false; Firefox's paper list and its
 *            print.js rule for the paper size
 * CONTROLS (exit 2 if one fails)
 *   K-dest     the dialog's destination is Save as PDF
 *   K-nopage   the same document without its @page rule: the dialog offers
 *              a paper size (the reader reads the setting)
 *   K-noadjust the same document without print-color-adjust: the filled
 *              headings' colour is not painted, in Chromium's preview and in
 *              Firefox's PDF (the colour reader tells the two apart)
 *   K-ffui     Firefox's omni.ja read: a PDF printer label and a paper list
 *              found (a reader that finds nothing would pass LABEL falsely)
 *
 * RUN (from apps/web): node scripts/print-dialog-check.mjs [--no-chromium] [--no-firefox]
 *   env PORT (default 5850), OUT_DIR, POSTR_REPO (run another tree).
 * EXIT 0 no claim observed · 1 a claim observed · 2 a control failed or an error.
 * Side effect: vite.config.ts rewrites public/version.json; put back here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { POSTERS, prepAssets } from './lib/printPathPosters.mjs';
import { linesInPdf, pdfFacts, readSheet } from './lib/printPathRead.mjs';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
process.exitCode = 2;
const args = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 5850);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-print-dialog-check'));
process.env.OUT_DIR = OUT;
fs.mkdirSync(OUT, { recursive: true });
const { REPO, WEB, startHarness, openEditor, sleep } = await import('./lib/editorHarness.mjs');
const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { PDFDocument } = await import(pathToFileURL(path.join(REPO, 'node_modules/pdf-lib/cjs/index.js')).href);
const pdfjs = await import(pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

const TOL = 0.05;
const POSTER = POSTERS.find((p) => p.id === 'user-charter-filled');

/** The document without its @page rule, or without print-color-adjust. */
const noPage = (html) => html.replace(/@page\s*{[^}]*}/, '');
const noAdjust = (html) => html.replace(/(-webkit-)?print-color-adjust:\s*exact;/g, '');

/** Abort everything but the page and data: URLs (Google Fonts included). */
const offline = (context) => context.route('**/*', (r) => (/^(data|about|blob):/.test(r.request().url()) ? r.continue() : r.abort()));

/**
 * Chromium's dialog for `html`: its settings and its preview's PDF bytes.
 * A fresh headed profile, "Save as PDF" saved as the last destination.
 */
async function chromiumDialog(html, tag) {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'postr-print-dialog-'));
  fs.mkdirSync(path.join(udd, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(udd, 'Default', 'Preferences'), JSON.stringify({
    printing: { print_preview_sticky_settings: { appState: JSON.stringify({ version: 2, recentDestinations: [{ id: 'Save as PDF', origin: 'local', account: '' }] }) } },
  }));
  const ctx = await engines.chromium.launchPersistentContext(udd, { headless: false, channel: 'chromium', viewport: { width: 900, height: 700 } });
  try {
    await offline(ctx);
    const page = ctx.pages()[0] ?? await ctx.newPage();
    const cdp = await ctx.browser()?.newBrowserCDPSession?.() ?? await ctx.newCDPSession(page);
    await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
    // The document opens the dialog itself once its fonts are ready.
    let target = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      await sleep(250);
      const { targetInfos } = await cdp.send('Target.getTargets');
      target = targetInfos.find((t) => t.url.startsWith('chrome://print'));
    }
    if (!target) throw new Error(`${tag}: no print dialog opened`);
    await sleep(2500);
    let seq = 0;
    const waiting = new Map();
    cdp.on('Target.receivedMessageFromTarget', (e) => {
      const m = JSON.parse(e.message);
      if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    });
    const attach = async (t) => (await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: false })).sessionId;
    const evalIn = (sessionId, expression) => new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, (m) => resolve(m.result?.result?.value ?? { error: JSON.stringify(m).slice(0, 200) }));
      cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }) });
    });
    const dlg = await attach(target);
    const settings = await evalIn(dlg, `(() => {
      const deep = (root, sel, out = []) => { root.querySelectorAll('*').forEach((el) => { if (el.matches(sel)) out.push(el); if (el.shadowRoot) deep(el.shadowRoot, sel, out); }); return out; };
      const model = deep(document, 'print-preview-model')[0];
      const get = (k) => { try { const s = model.getSetting(k); return { offered: s.available, value: s.value }; } catch (e) { return null; } };
      const sel = deep(document, 'select').find((s) => [...s.options].some((o) => /Save as PDF/.test(o.textContent)));
      return { destination: sel ? sel.options[sel.selectedIndex]?.textContent.trim() : null, mediaSize: get('mediaSize'), layout: get('layout'), margins: get('margins'), cssBackground: get('cssBackground'), scaling: get('scalingType') };
    })()`);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const pdfTarget = targetInfos.filter((t) => t.url.includes('print.pdf')).pop();
    if (!pdfTarget) throw new Error(`${tag}: no preview PDF`);
    const b64 = await evalIn(await attach(pdfTarget), `fetch(location.href).then((r) => r.arrayBuffer()).then((b) => { let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 1) s += String.fromCharCode(u[i]); return btoa(s); })`);
    if (typeof b64 !== 'string') throw new Error(`${tag}: preview PDF not read (${JSON.stringify(b64).slice(0, 160)})`);
    const bytes = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(OUT, `chromium-${tag}.pdf`), bytes);
    return { settings, bytes };
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(udd, { recursive: true, force: true });
  }
}

/**
 * Firefox's own print UI, from its omni.ja: the dialog's name for its PDF
 * printer, its paper list, whether print.js hides the paper size when the
 * page sets its size and the pref is on, and the pref's fallback there.
 */
async function firefoxPrintUi() {
  const exe = engines.firefox.executablePath();
  const omni = [path.resolve(path.dirname(exe), '../Resources/omni.ja'), path.join(path.dirname(exe), 'omni.ja')].find((f) => fs.existsSync(f));
  if (!omni) return null;
  const JSZip = (await import(pathToFileURL(path.join(REPO, 'node_modules/jszip/lib/index.js')).href)).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(omni));
  const ftl = (await zip.file('localization/en-US/toolkit/printing/printUI.ftl')?.async('string')) ?? '';
  const js = (await zip.file('chrome/toolkit/content/global/print.js')?.async('string')) ?? '';
  let version = null;
  try { version = /^Version=(.+)$/m.exec(fs.readFileSync(path.join(path.dirname(omni), 'application.ini'), 'utf8'))?.[1] ?? null; } catch { /* not beside it */ }
  return {
    version,
    pdfLabel: /^printui-destination-pdf-label = (.+)$/m.exec(ftl)?.[1]?.trim() ?? null,
    papers: [...ftl.matchAll(/^printui-paper-([\w-]+) = (.+)$/gm)].filter((m) => !m[1].endsWith('-label')).map((m) => m[2].trim()),
    hidesPaperWithPageSize: /isUsingPageRuleSizeAsPaperSize\s*=\s*\n?\s*settings\.usePageRuleSizeAsPaperSize[\s\S]{0,1500}hide-paper-size/.test(js),
    prefFallback: /use_page_rule_size_as_paper_size\.enabled",\s*(true|false)/.exec(js)?.[1] ?? null,
  };
}

/** Firefox's silent print of `html` to a PDF file, default print settings (`prefs` added). */
async function firefoxSilent(html, tag, prefs = {}) {
  const file = path.join(OUT, `firefox-${tag}.pdf`);
  fs.rmSync(file, { force: true });
  const browser = await engines.firefox.launch({
    firefoxUserPrefs: {
      'print.always_print_silent': true,
      print_printer: 'Mozilla Save to PDF',
      'print.printer_Mozilla_Save_to_PDF.print_to_file': true,
      'print.printer_Mozilla_Save_to_PDF.print_to_filename': file,
      'print.show_print_progress': false,
      ...prefs,
    },
  });
  try {
    const ctx = await browser.newContext();
    await offline(ctx);
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
    for (let i = 0; i < 60 && !fs.existsSync(file); i += 1) await sleep(250);
    await sleep(1500);
    if (!fs.existsSync(file)) throw new Error(`${tag}: Firefox wrote no PDF`);
    return fs.readFileSync(file);
  } finally {
    await browser.close().catch(() => {});
  }
}

const stamp = fs.readFileSync(path.join(WEB, 'public/version.json'));
const h = await startHarness({ name: 'print-dialog-check', port: PORT });
const R = { git: h.git, chromium: null, firefox: null, errors: [] };
const claims = { PAPER: [], PDFSIZE: [], PLACE: [], BG: [], LABEL: [] };
const controlFails = [];
let html = null;
let ref = null;
let headerBg = null;
try {
  const prep = await (await h.browser.newContext()).newPage();
  const assets = await prepAssets(prep, h.docBase, REPO);
  await prep.context().close();
  const ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: POSTER.size, editDoc: (doc) => ({ ...doc, ...POSTER.build(assets) }) });
  try {
    ref = await ed.page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: POSTER.size.w });
    headerBg = String(ed.state.row?.data?.palette?.headerBg ?? '').toLowerCase();
    await ed.page.evaluate(() => {
      window.__zqPrint = null;
      window.open = () => {
        let s = '';
        return { document: { open() {}, write(x) { s += x; }, close() { window.__zqPrint = s; } }, focus() {}, print() {}, close() {}, addEventListener() {} };
      };
    });
    await ed.page.locator('button[data-postr-tab]', { hasText: /^export$/i }).click();
    await ed.page.getByRole('button', { name: '⎙ Save PDF' }).click();
    html = await ed.page.waitForFunction(() => window.__zqPrint, null, { timeout: 15000 }).then((x) => x.jsonValue());
  } finally {
    await ed.context.close();
  }
  log(`[doc] ${html.length} chars; @page ${(html.match(/@page\s*{[^}]*}/) ?? ['none'])[0].replace(/\s+/g, ' ')}; print-color-adjust ${/print-color-adjust:\s*exact/.test(html) ? 'set' : 'not set'}; headings' fill ${headerBg}`);

  if (!args.includes('--no-chromium')) {
    const main = await chromiumDialog(html, 'document');
    const pf = await pdfFacts(main.bytes, { PDFDocument, pdfjs });
    const lt = linesInPdf(ref, pf, TOL);
    const painted = pf.areas.includes(headerBg);
    const ctlPage = await chromiumDialog(noPage(html), 'no-page-rule');
    const ctlAdjust = /print-color-adjust:\s*exact/.test(html) ? await pdfFacts((await chromiumDialog(noAdjust(html), 'no-color-adjust')).bytes, { PDFDocument, pdfjs }) : null;
    R.chromium = {
      settings: main.settings, pdf: { pages: pf.pages, pageIn: pf.pageIn, headingFillPainted: painted, lines: { checked: lt.checked, offPage: lt.offPage, lost: lt.lost.length, sample: lt.lost.slice(0, 3) } },
      controls: { noPageRule: ctlPage.settings, noColorAdjustPainted: ctlAdjust ? ctlAdjust.areas.includes(headerBg) : '(the document sets none)' },
    };
    if (!/Save as PDF/.test(main.settings?.destination ?? '')) controlFails.push(`K-dest: destination ${JSON.stringify(main.settings?.destination)}`);
    if (ctlPage.settings?.mediaSize?.offered !== true) controlFails.push(`K-nopage: with no @page the dialog's paper size is ${JSON.stringify(ctlPage.settings?.mediaSize)}`);
    if (ctlAdjust && ctlAdjust.areas.includes(headerBg)) controlFails.push('K-noadjust (Chromium): the headings\' fill painted without print-color-adjust');
    if (main.settings?.mediaSize?.offered) claims.PAPER.push(`the dialog offers a paper size (${JSON.stringify(main.settings.mediaSize.value?.custom_display_name ?? main.settings.mediaSize.value)})`);
    if (pf.pages !== 1 || Math.abs(pf.pageIn[0] - POSTER.size.w) > 0.01 || Math.abs(pf.pageIn[1] - POSTER.size.h) > 0.01) claims.PDFSIZE.push(`${pf.pages} page(s) of ${pf.pageIn.join(' × ')} in`);
    if (lt.lost.length) claims.PLACE.push(`${lt.lost.length} of ${lt.checked} lines not at their place (${lt.lost.slice(0, 2).map((x) => `"${x.line.slice(0, 30)}"`).join('; ')})`);
    if (!painted) claims.BG.push(`Chromium: the headings' ${headerBg} not painted (Background graphics ${JSON.stringify(main.settings?.cssBackground)})`);
    log(`[chromium] ${JSON.stringify(R.chromium)}`);
  }
  if (!args.includes('--no-firefox')) {
    const pf = await pdfFacts(await firefoxSilent(html, 'document'), { PDFDocument, pdfjs });
    const painted = pf.areas.includes(headerBg);
    const ctl = /print-color-adjust:\s*exact/.test(html) ? await pdfFacts(await firefoxSilent(noAdjust(html), 'no-color-adjust'), { PDFDocument, pdfjs }) : null;
    const PREF = 'print.save_as_pdf.use_page_rule_size_as_paper_size.enabled';
    const prefTrue = await pdfFacts(await firefoxSilent(html, 'pref-true', { [PREF]: true }), { PDFDocument, pdfjs });
    const prefFalse = await pdfFacts(await firefoxSilent(html, 'pref-false', { [PREF]: false }), { PDFDocument, pdfjs });
    const same = (a, b) => a.pages === b.pages && a.pageIn.every((v, i) => Math.abs(v - b.pageIn[i]) < 0.01);
    const ui = await firefoxPrintUi();
    R.firefox = {
      pdf: { pages: pf.pages, pageIn: pf.pageIn, headingFillPainted: painted },
      pagePref: { default: pf.pageIn, true: prefTrue.pageIn, false: prefFalse.pageIn, defaultPrintsLike: same(pf, prefTrue) && !same(pf, prefFalse) ? 'true' : same(pf, prefFalse) && !same(pf, prefTrue) ? 'false' : 'undecided' },
      ui,
      controls: { noColorAdjustPainted: ctl ? ctl.areas.includes(headerBg) : '(the document sets none)' },
    };
    if (ctl && ctl.areas.includes(headerBg)) controlFails.push('K-noadjust (Firefox): the headings\' fill painted without print-color-adjust');
    if (!painted) claims.BG.push(`Firefox (silent, backgrounds off): the headings' ${headerBg} not painted`);
    if (!ui?.pdfLabel || !ui.papers.length) controlFails.push(`K-ffui: Firefox's print UI not read (${JSON.stringify(ui).slice(0, 160)})`);
    else if (!html.includes(ui.pdfLabel)) claims.LABEL.push(`the print window's steps do not name "${ui.pdfLabel}", Firefox's PDF printer`);
    log(`[firefox] ${JSON.stringify(R.firefox)}`);
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
for (const [c, rows] of Object.entries(claims)) log(`[${rows.length ? 'OBSERVED' : 'not observed'} ${c}]${rows.length ? ` ${rows.join(' · ')}` : ''}`);
if (R.chromium) log(`[INFO chromium dialog] layout ${JSON.stringify(R.chromium.settings?.layout)}, margins ${JSON.stringify(R.chromium.settings?.margins)}, Background graphics ${JSON.stringify(R.chromium.settings?.cssBackground)}, scaling ${JSON.stringify(R.chromium.settings?.scaling)}`);
if (R.firefox) {
  log(`[INFO firefox silent PDF] ${R.firefox.pdf.pages} page(s) of ${R.firefox.pdf.pageIn.join(' × ')} in; with the @page pref true ${R.firefox.pagePref.true.join(' × ')} in, false ${R.firefox.pagePref.false.join(' × ')} in: its default prints like ${R.firefox.pagePref.defaultPrintsLike}`);
  const ui = R.firefox.ui;
  if (ui) log(`[INFO firefox print UI] Firefox ${ui.version}: PDF printer "${ui.pdfLabel}"; paper list ${ui.papers.join(', ')}; print.js hides the paper size when the page sets its size and the pref is on: ${ui.hidesPaperWithPageSize}; the pref's fallback in print.js: ${ui.prefFallback}`);
}
log(`[controls] ${controlFails.length ? `FAILED: ${controlFails.join(' · ')}` : 'held'}; errors ${R.errors.length}`);
log(`[out] ${path.join(OUT, 'results.json')}`);
process.exitCode = controlFails.length || R.errors.length ? 2 : Object.values(claims).some((r) => r.length) ? 1 : 0;
