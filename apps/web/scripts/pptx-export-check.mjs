#!/usr/bin/env node
/**
 * pptx-export-check.mjs — the paid PowerPoint file a user downloads, and the
 * free PDF's print document, against the poster the editor draws: Postr's
 * own charts in the PowerPoint file, and the editor's hints in neither
 * (record docs/fixes/31-exports-charts.md; PLAN.md's HIGH "the paid
 * PowerPoint export leaves out charts made in the Figure tab, with no
 * warning"; record 30's INFO ui-copied and ui-font; record 29's R1-02).
 *
 * ENTRY POINT (the user's): a term holder's editor (lib/editorHarness.mjs's
 *   fake backend: the users row holds an active term), Export tab ›
 *   PowerPoint (`[data-postr-export-pptx]`), the downloaded file read here;
 *   then Export tab › "⎙ Save PDF" (window.open stubbed: the document the
 *   print window is written is kept, window.print never runs).
 *   The poster's font is a web font, as in production: the fake answers the
 *   Google Fonts stylesheet for Source Sans 3 with this machine's Comic Sans
 *   MS (lib/pptxRead.mjs installFakeFonts), so the editor measures and draws
 *   its charts in a font the fallback is far from. The other harnesses abort
 *   Google Fonts, which hides whether a picture keeps the web font.
 *
 * POSTERS (lib/pptxPosters.mjs): every chart form the chooser and the pasted
 *   tables give, one each, at 6 × 4.5 and 12 × 9 in (caption under, as
 *   Insert puts it); captions top, left, right and none, and a note, at
 *   8 × 6; long captions; charts turned 20°, -90° and 180°; a selected
 *   chart; a 94 × 48 poster (exported at half size); blocks left empty
 *   (authors, logo, figure, references) and a chart that cannot be drawn;
 *   the print path harness's five templates, welcome poster, figures poster
 *   and charts poster; and, on the charts poster, what the user does while
 *   the file is built (lib/pptxTiming.mjs, review round 1): a scroll
 *   (scroll-export), an export while the charts still draw, within the
 *   export's wait (loading-export) and past it, a pack holder
 *   (loading-past-wait); and, while the export waits (review round 2),
 *   Preview opened and kept past the wait (preview-export) or left within
 *   it (preview-return-export), Preview with the writer's chunk held and
 *   every chart drawn (preview-slow-export), the browser's Back to the
 *   dashboard (leave-export). The -90° chart of the turned poster has a
 *   note.
 *
 * MEASURE: in the editor, each chart's drawing (its svg's viewBox corners
 *   through the svg's screen transform: centre, size before turning, and
 *   turn, in poster inches; not the host box the export reads), its caption
 *   as shown,
 *   its text's printed pt by role (lib/chartMeasure.mjs) and its svg's
 *   markup; in the file (lib/pptxRead.mjs, plain XML): the slide's size,
 *   each picture's box, turn and PNG, and the text.
 *
 * CLAIMS (gated)
 *   CHART    a chart the editor draws has no picture in the file whose
 *            drawing is where the editor's is × the export's scale (centre
 *            and size within 0.05 in, turn within 0.5°; the drawing inside a
 *            picture by SVG's preserveAspectRatio rule, xMidYMid meet)
 *   CAPTION  a chart's caption as the editor shows it ("Figure N." and its
 *            text, spaces ignored) is not a paragraph of the file
 *   CAPPOS   a chart's caption or note text box in the file more than
 *            0.05 in (centre or size, turn 0.5°) from where the editor draws
 *            it (the caption found as the div that starts with a bold
 *            "Figure N.", the note by its text; a caption the file lacks is
 *            CAPTION's)
 *   MINPT    a chart text in the file, read as the editor's pt × the
 *            picture's scale, under the minimums at the poster's size
 *            (tick labels, legend and line-end labels 14 pt, axis titles
 *            18 pt; fix 13c's, the harness's own copy)
 *   DPI      a chart picture under 300 px per printed inch, where 300 per
 *            inch is at most 16,777,216 px (4096²; the record's cap)
 *   PICTURE  a picture is not the editor's drawing: the editor's own svg
 *            markup drawn in a page that has the poster's web font, against
 *            the picture, both 1000 px wide on white: more than PICTURE_TOL
 *            of the pixels inked in either differ in colour (INK_DIFF)
 *   HINT     an editor hint ("+ Upload figure", "Add references in Refs tab
 *            →", …: HINTS, the harness's own list) in the print document's
 *            sheet or in the file's text
 *   EMPTY    the file writes "References" for a poster with no references
 *            (the editor shows only its hint, the PDF nothing)
 *   WARN     a chart the editor does not draw (it cannot be drawn) and the
 *            Export tab's notes after the export say nothing about a chart,
 *            or every chart drawn and a note about a chart
 *   WAIT     an export clicked while the charts still draw: within the
 *            export's wait, no file; past it, a file, a credit spent, a paid
 *            export recorded, "Something went wrong", or no note that a
 *            chart is still drawing (loading-export, loading-past-wait)
 *   AWAY     Preview opened or the editor left while the export waits
 *            (lib/pptxTiming.mjs `away`): kept past the wait, a file, a
 *            credit spent, a paid export recorded, a note that a chart
 *            "could not be drawn", "Something went wrong", or (back in the
 *            editor) no note that the poster was hidden; back within the
 *            wait, no file (whose charts CHART then reads)
 *   REIMPORT the app's own PowerPoint reader (`parsePptx`, run in the page)
 *            does not bring a chart's picture back as a figure at its box
 *            (0.05 in, in slide inches: the reader reads a half-size file
 *            back at full size, and its inches are divided back)
 *   LO       LibreOffice (headless, `soffice --convert-to pdf`, a profile of
 *            its own) draws no picture at a chart's box (0.05 in) or drops a
 *            caption's text (--readers lo; absent on this machine: BLIND
 *            SPOT)
 *   QL       Quick Look (macOS's own Office renderer, `qlmanage -t -s 2000`,
 *            --readers ql) draws less than 1 % ink in an upright chart's
 *            box on its slide thumbnail (it draws turned pictures upright,
 *            so turned charts are LibreOffice's; absent: BLIND SPOT)
 *   INFO     shapes and pictures on each slide (the audit's "18 shapes, 0
 *            pictures"); image-captions: an image block's caption text box
 *            against where the editor draws it (a sibling the writer places
 *            by its own one-line layout; not gated, record 31 §10); the
 *            export's warnings shown in the Export tab; the
 *            fonts fetched; the worst box, DPI and PICTURE share; a chart
 *            that cannot be drawn and what the file and the PDF do with it
 *
 * CONTROLS (exit 2 if one fails)
 *   K-hint   every hint a poster is built to show is on its editor sheet
 *   K-drawn  every chart the poster holds is drawn in the editor (an svg),
 *            the broken one aside
 *   K-same   the editor's svg drawn twice in the comparison page differs by
 *            under PICTURE_TOL / 4
 *   K-font   the editor's svg drawn as an image with no font embedded (the
 *            fallback font) differs by more than PICTURE_TOL from the svg
 *            drawn with the web font, on at least 90 % of the charts: the
 *            comparison sees a picture drawn in another font
 *   K-webfont the poster's web font is loaded in the editor (document.fonts)
 *            on the posters set in Source Sans 3
 *   K-lo     LibreOffice's PDF has the slide's size and draws the figures
 *            poster's three pictures
 *   K-scroll the scroll landed while the export's font fetch was held, and
 *            the workspace moved (scroll-export)
 *   K-loading no chart drawn at the click, and past the wait none drawn when
 *            the export ended (the loading posters)
 *   K-away   the Preview click or the Back landed before any file, the sheet
 *            then hidden (width 0) or gone, no chart drawn at the click
 *            (Plot held) or the click inside the held writer chunk, and
 *            (back within the wait) every chart drawn before the return
 *
 * BLIND SPOTS: PowerPoint itself is not driven here (opening it would take
 *   over the desktop); Keynote and Google Slides are not read; Quick Look's
 *   thumbnail is read for ink only, not for where in the box it falls; the
 *   comparison is at 1000 px wide, so a picture's own resolution is the DPI
 *   claim's; the web font is a stand-in served locally (macOS's Comic Sans
 *   MS), not Google's file; Charter (installed on macOS, not on Google
 *   Fonts) is the local-font case only through the print path poster's
 *   Charter poster, which this harness does not export.
 *
 * RUN (from apps/web): node scripts/pptx-export-check.mjs
 *   [--only <poster ids>] [--readers reimport,lo,ql] [--no-picture] [--shots]
 *   (--shots writes each comparison's screenshots to OUT_DIR/shots)
 *   env PORT (default 5860), OUT_DIR, POSTR_BROWSER, POSTR_MUTANT,
 *   POSTR_SERVE (preview: the production build; PORT + 1 also used).
 * EXIT 0 no claim observed · 1 a claim observed, controls held · 2 a control
 *   failed or an error.
 * Side effect: vite.config.ts rewrites public/version.json; put back here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { measureChartsIn, SAMPLE_PREFIX } from './lib/chartMeasure.mjs';
import { PASTE_TABLES } from './lib/chartPasteTables.mjs';
import { prepAssets } from './lib/printPathPosters.mjs';
import { pptxPosters, oneEachForm, fromPrintPoster } from './lib/pptxPosters.mjs';
import { readPptx, inkDiff, installFakeFonts, fakeFontsAvailable, FAKE_FAMILIES } from './lib/pptxRead.mjs';
import { prepareTiming, zoomIn, exportWhileScrolling, exportWhileLoading, exportWhileAway } from './lib/pptxTiming.mjs';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
process.exitCode = 2;
const args = process.argv.slice(2);
const argAt = (f) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : null);
const ONLY = argAt('--only') ? new Set(argAt('--only').split(',')) : null;
const READERS = new Set((argAt('--readers') ?? 'reimport,lo,ql').split(',').filter(Boolean));
const PICTURE = !args.includes('--no-picture');
const SHOTS = args.includes('--shots');
const PORT = Number(process.env.PORT ?? 5860);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-pptx-export-check'));
process.env.OUT_DIR = OUT;
fs.mkdirSync(path.join(OUT, 'pptx'), { recursive: true });
const { REPO, WEB, startHarness, openEditor, sleep } = await import('./lib/editorHarness.mjs');
const { downloadPptx } = await import('./lib/keepWorkKit.mjs');
const pdfjs = await import(pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
const { pdfImagesAndText } = await import('./lib/printPathColophon.mjs');

const TOL = 0.05;
const ROT_TOL = 0.5;
const PICTURE_TOL = 0.02;
const MIN = { tick: 14, legend: 14, direct: 14, axisTitle: 18 };
const DPI = 300;
const RASTER_CAP = 4096 * 4096;
/** How long Export › PowerPoint waits for a chart still drawing (the app's 10 s; the harness's own copy). */
const CHART_WAIT_MS = 10000;
const HINTS = ['+ Upload figure', 'click to browse · drag to move', '+ Logo', 'presets · upload · reuse', 'Add authors in sidebar →',
  'Add references in Refs tab →', 'Rendering chart…', 'Something went wrong rendering this chart.', 'Send Feedback'];
const squash = (t) => (t ?? '').replace(/\s+/g, '');

const stamp = fs.readFileSync(path.join(WEB, 'public/version.json'));
const h = await startHarness({ name: 'pptx-export-check', port: PORT }).catch((e) => {
  log(`ERROR starting the harness: ${String(e).slice(0, 300)}`);
  fs.writeFileSync(path.join(WEB, 'public/version.json'), stamp);
  process.exit(2);
});
const claims = Object.fromEntries(['CHART', 'CAPTION', 'CAPPOS', 'MINPT', 'DPI', 'PICTURE', 'HINT', 'EMPTY', 'WARN', 'WAIT', 'AWAY', 'REIMPORT', 'LO', 'QL'].map((c) => [c, []]));
const see = (c, what) => claims[c].push(what);
const controlFails = [];
const R = { git: h.git, engine: h.engine, mutant: h.mutant, serve: h.serve, posters: [], forms: [], errors: [], fonts: [] };
const fontsOk = fakeFontsAvailable();

/** In the editor: each chart's drawn box, caption, svg markup; the sheet's hints; the web font. */
function readEditor({ posterW, hints, family, notes }) {
  const sheet = document.getElementById('poster-canvas');
  const s = sheet.getBoundingClientRect();
  const k = posterW / s.width;
  const unitsPerIn = parseFloat(getComputedStyle(sheet).width) / posterW;
  const charts = [...sheet.querySelectorAll('[data-block-type="chart"]')].filter((b) => !b.parentElement.closest('[data-block-id]')).map((b) => {
    const id = b.getAttribute('data-block-id');
    const svg = b.querySelector('svg[viewBox]');
    const capEl = [...b.querySelectorAll('div')].find((d) => d.firstElementChild?.tagName === 'B' && /^Figure\s*\d+\.$/.test(d.firstElementChild.textContent.trim()));
    const caption = capEl ? capEl.textContent.replace(/\s+/g, ' ').trim() : null;
    // A box as drawn: its size before any turn (computed), centred on what is drawn.
    const boxOf = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { center: [((r.left + r.right) / 2 - s.left) * k, ((r.top + r.bottom) / 2 - s.top) * k], size: [parseFloat(cs.width) / unitsPerIn, parseFloat(cs.height) / unitsPerIn] };
    };
    const note = notes[id] ? [...b.querySelectorAll('div')].find((d) => d.textContent.replace(/\s+/g, ' ').trim() === notes[id]) : null;
    const parts = { caption: capEl ? boxOf(capEl) : null, note: note ? { ...boxOf(note), text: notes[id] } : null };
    if (!svg) return { id, drawn: false, caption, parts };
    // Where the drawing itself is: the corners of the svg's viewBox through
    // its screen transform (zoom, turn, the viewBox's fit), not the boxes the
    // export reads (its host's layout), so the claim does not share the
    // fix's way of measuring.
    const m = svg.getScreenCTM();
    const vb = svg.viewBox.baseVal;
    const at = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const p0 = at(vb.x, vb.y);
    const p1 = at(vb.x + vb.width, vb.y);
    const p2 = at(vb.x, vb.y + vb.height);
    const p3 = at(vb.x + vb.width, vb.y + vb.height);
    const turn = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
    const rot = Math.round(((turn % 360) + 360) % 360 * 100) / 100;
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return {
      id, drawn: true, caption, rot, parts,
      center: [((p0.x + p3.x) / 2 - s.left) * k, ((p0.y + p3.y) / 2 - s.top) * k],
      size: [Math.hypot(p1.x - p0.x, p1.y - p0.y) * k, Math.hypot(p2.x - p0.x, p2.y - p0.y) * k],
      host: boxOf(svg.parentElement),
      viewBox: [vb.width, vb.height],
      fit: svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet',
      markup: copy.outerHTML,
    };
  });
  // INFO image-captions (a sibling, not gated): an image block's caption and
  // picture as drawn, against where the writer's own layout puts them.
  const boxOn = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { center: [((r.left + r.right) / 2 - s.left) * k, ((r.top + r.bottom) / 2 - s.top) * k], size: [parseFloat(cs.width) / unitsPerIn, parseFloat(cs.height) / unitsPerIn] };
  };
  const images = [...sheet.querySelectorAll('[data-block-type="image"]')].flatMap((b) => {
    const img = b.querySelector('img');
    const capEl = [...b.querySelectorAll('div')].find((d) => d.firstElementChild?.tagName === 'B' && /^Figure\s*\d+\.$/.test(d.firstElementChild.textContent.trim()));
    if (!img || !capEl) return [];
    return [{ id: b.getAttribute('data-block-id'), caption: capEl.textContent.replace(/\s+/g, ' ').trim(), capBox: boxOn(capEl), lines: Math.round(capEl.getBoundingClientRect().height / parseFloat(getComputedStyle(capEl).lineHeight || '1')), img: boxOn(img.parentElement) }];
  });
  const text = sheet.textContent;
  const fam = (f) => f.replace(/["']/g, '').trim().toLowerCase();
  return {
    charts,
    images,
    hintsShown: hints.filter((x) => text.includes(x)),
    webFont: [...document.fonts].some((f) => fam(f.family) === fam(family) && f.status === 'loaded'),
    fontLinks: [...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis"]')].map((l) => l.href),
    selected: sheet.querySelectorAll('[data-postr-selected="true"]').length,
  };
}

/** Export tab › "⎙ Save PDF" with window.open stubbed: the document the print window is written. */
async function printDocument(page) {
  await page.evaluate(() => {
    window.__zqPrint = null;
    window.open = () => {
      let html = '';
      return { document: { open() {}, write(x) { html += x; }, close() { window.__zqPrint = html; } }, focus() {}, print() {}, close() {}, addEventListener() {} };
    };
  });
  await page.locator('button[data-postr-tab]', { hasText: /^export$/i }).click();
  await page.getByRole('button', { name: '⎙ Save PDF' }).click();
  return page.waitForFunction(() => window.__zqPrint, null, { timeout: 15000 }).then((x) => x.jsonValue());
}

/** The comparison page's three readings for one chart: the picture, the svg (twice), the svg as an image. */
async function comparePicture(context, fontLinks, markup, pngBytes, aspect, shotName = null) {
  const pg = await context.newPage();
  try {
    const W = 1000;
    const H = Math.max(1, Math.round(W / aspect));
    await pg.setViewportSize({ width: W + 40, height: H + 40 });
    const links = fontLinks.map((u) => `<link rel="stylesheet" href="${u}">`).join('');
    await pg.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">${links}</head><body style="margin:0;background:#fff"><div id="box" style="width:${W}px;height:${H}px;background:#fff;overflow:hidden"></div></body></html>`, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const shots = {};
    // Each reading drawn alone in the same box: the picture as an image,
    // the editor's svg markup inline (its own attributes kept, sized by the
    // DOM, so the page's web font applies), twice, and the same svg as an
    // image (an svg image has no page fonts: the fallback).
    const shoot = async (id, how, payload) => {
      await pg.evaluate(({ how, payload, W, H }) => new Promise((resolve) => {
        const box = document.getElementById('box');
        box.replaceChildren();
        const sized = (svg) => {
          svg.setAttribute('width', String(W));
          svg.setAttribute('height', String(H));
          svg.style.width = `${W}px`;
          svg.style.height = `${H}px`;
          svg.style.display = 'block';
          return svg;
        };
        const parse = () => sized(new DOMParser().parseFromString(payload, 'image/svg+xml').documentElement);
        if (how === 'svg') {
          box.appendChild(document.importNode(parse(), true));
          resolve();
          return;
        }
        const img = new Image();
        img.style.cssText = `width:${W}px;height:${H}px;display:block`;
        img.onload = () => img.decode().catch(() => {}).then(resolve);
        img.onerror = () => resolve();
        img.src = how === 'png' ? `data:image/png;base64,${payload}` : `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(parse()))))}`;
        box.appendChild(img);
      }), { how, payload, W, H });
      await pg.evaluate(() => document.fonts.ready);
      await sleep(150);
      shots[id] = await pg.locator('#box').screenshot();
    };
    await shoot('pic', 'png', Buffer.from(pngBytes).toString('base64'));
    await shoot('svg1', 'svg', markup);
    await shoot('svg2', 'svg', markup);
    await shoot('fallback', 'img', markup);
    if (shotName) {
      fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
      for (const [k2, buf] of Object.entries(shots)) fs.writeFileSync(path.join(OUT, 'shots', `${shotName}-${k2}.png`), buf);
    }
    return { picture: inkDiff(shots.pic, shots.svg1), same: inkDiff(shots.svg1, shots.svg2), font: inkDiff(shots.fallback, shots.svg1) };
  } finally {
    await pg.close().catch(() => {});
  }
}

/**
 * The app's own reader (`parsePptx`), run in a page on the dev server: the
 * poster's width it reads and the figures it brings back, in its inches (it
 * reads a half-size file back at full size, by the note the export writes).
 */
async function reimport(context, bytes) {
  const pg = await context.newPage();
  try {
    await pg.goto(`${h.docBase}/version.json`);
    return await pg.evaluate(async (b64) => {
      const { parsePptx } = await import('/src/import/pptx/parsePptx.ts');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const out = parsePptx(bytes);
      return { widthIn: out.doc.widthIn, figures: out.doc.blocks.filter((b) => b.type === 'image').map((b) => ({ box: [b.x / 10, b.y / 10, b.w / 10, b.h / 10], rotation: b.rotation ?? 0 })) };
    }, Buffer.from(bytes).toString('base64'));
  } finally {
    await pg.close().catch(() => {});
  }
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** The drawing inside a picture box [x, y, w, h]: its centre and size, by the svg's fit (see CHART). */
function drawnIn(b, c) {
  if (!/meet/.test(c.fit) || !/xMidYMid/.test(c.fit)) return [b[0] + b[2] / 2, b[1] + b[3] / 2, b[2], b[3]];
  const k = Math.min(b[2] / c.viewBox[0], b[3] / c.viewBox[1]);
  return [b[0] + b[2] / 2, b[1] + b[3] / 2, c.viewBox[0] * k, c.viewBox[1] * k];
}
const turnDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const r3 = (v) => Math.round(v * 1000) / 1000;

try {
  const prep = await (await h.browser.newContext()).newPage();
  const assets = await prepAssets(prep, h.docBase, REPO);
  const pool = await prep.evaluate(async (tables) => {
    const sd = await import('/src/charts/sampleData.ts');
    const ic = await import('/src/charts/inferColumns.ts');
    const rc = await import('/src/charts/recommend.ts');
    const bs = await import('/src/charts/buildSpec.ts');
    const pd = await import('/src/charts/parseData.ts');
    const out = [];
    for (const ds of sd.sampleDatasets()) {
      const table = ic.inferTable(ds.table);
      for (const rec of rc.recommendFigures(table).recommendations) {
        const spec = bs.buildChartSpec(table, rec);
        if (spec) out.push({ sample: ds.key, spec, caption: bs.captionFor(table, rec, { sample: true }) });
      }
    }
    for (const [key, text] of Object.entries(tables)) {
      const parsed = pd.parseDelimited(text);
      if (!parsed.ok) continue;
      const table = ic.inferTable(parsed.table);
      for (const emphasis of [null, 'difference', 'trend', 'spread', 'relationship', 'share']) {
        for (const rec of rc.recommend(table, emphasis ? { emphasis } : {})) {
          const spec = bs.buildChartSpec(table, rec);
          if (spec) out.push({ sample: `paste:${key}`, spec, caption: bs.captionFor(table, rec, { sample: true }) });
        }
      }
    }
    return out;
  }, PASTE_TABLES);
  await prep.context().close();
  const forms = oneEachForm(pool);
  R.forms = forms.map((f) => `${f.formId} (${f.sample})`);
  log(`[harness] ${forms.length} chart forms: ${forms.map((f) => f.formId).join(', ')}; web font ${fontsOk ? 'served' : 'NOT available (blind spot)'}; readers ${[...READERS].join(', ') || 'none'}`);

  const posters = pptxPosters(forms);
  for (const P of posters) {
    if (ONLY && !ONLY.has(P.id)) continue;
    // The loading scenarios hold the dev server's Plot chunk (or the writer's)
    // by its name; the build's chunks are named otherwise.
    if ((P.timing?.holdPlotMs || P.timing?.holdWriterMs) && h.serve === 'preview') {
      R.skipped = [...(R.skipped ?? []), `${P.id} (BLIND SPOT on the build: the Plot chunk is held by its dev-server name)`];
      continue;
    }
    const row = { id: P.id, charts: [], hints: {}, warnings: [] };
    R.posters.push(row);
    let ed;
    try {
      const fromPrint = P.fromPrint ? fromPrintPoster(P.fromPrint, assets) : null;
      const size = fromPrint ? fromPrint.size : P.size;
      row.size = size;
      const fontLog = [];
      let timing = null;
      ed = await openEditor(h, {
        viewport: { width: 1440, height: 900 }, poster: size, rowTitle: fromPrint?.name ?? `ZQ ${P.id}`,
        editDoc: (doc) => (fromPrint ? { ...doc, ...fromPrint.fields } : { ...doc, blocks: P.blocks, ...(P.doc ?? {}) }),
        prepare: async (ctx) => {
          if (fontsOk) await installFakeFonts(ctx, fontLog);
          if (P.timing) timing = await prepareTiming(ctx, P.timing);
        },
      });
      const { page } = ed;
      const stored = ed.state.row.data;
      const want = stored.blocks.filter((b) => b.type === 'chart' && !(P.broken ?? []).includes(b.id)).length;
      // The away scenarios (review round 2, R2-F1): Preview or Back while the export waits.
      let early = null;
      if (P.timing?.away) {
        early = await exportWhileAway(page, timing, { ...P.timing, waitMs: CHART_WAIT_MS });
        const c = early.control;
        row.away = { atClick: early.atClick, ms: early.ms, fileMs: early.fileMs, notes: early.notes, billing: early.billing, file: !!early.bytes, control: c, writerHeldMs: timing.writerHeldAt ? [timing.writerHeldAt - c.awayAt, timing.writerReleaseAt - c.awayAt] : null };
        if (c.fileBeforeAway) controlFails.push(`K-away ${P.id}: the file came before the user looked away (${early.fileMs} ms)`);
        if (P.timing.away === 'preview' && c.sheetWidthAway !== 0) controlFails.push(`K-away ${P.id}: the sheet not hidden by Preview (width ${c.sheetWidthAway})`);
        if (P.timing.away === 'leave' && (c.left?.path !== '/dashboard' || c.left?.sheet)) controlFails.push(`K-away ${P.id}: the editor not left (${JSON.stringify(c.left)})`);
        if (P.timing.holdPlotMs && early.atClick.drawn !== 0) controlFails.push(`K-away ${P.id}: ${early.atClick.drawn} of ${early.atClick.charts} charts drawn at the click`);
        if (P.timing.holdWriterMs && !(timing.writerHeldAt < c.awayAt && c.awayAt < timing.writerReleaseAt)) controlFails.push(`K-away ${P.id}: the Preview click not inside the held writer chunk`);
        if (P.timing.returnAtMs && c.drawnAtReturn < early.atClick.charts) controlFails.push(`K-away ${P.id}: ${c.drawnAtReturn} of ${early.atClick.charts} charts drawn at the return (the hold outlasted it)`);
        if (P.timing.expectNoFile) {
          if (early.bytes) see('AWAY', `${P.id}: a file made ${early.fileMs} ms after the click (${P.timing.away} at ${c.awayMs} ms), ${readPptx(early.bytes).pics.length} picture(s)`);
          if (early.billing.consumed || early.billing.marked) see('AWAY', `${P.id}: ${early.billing.consumed} credit(s) spent, ${early.billing.marked} paid export(s) recorded`);
          if (early.leftOutNote) see('AWAY', `${P.id}: the Export tab says a chart could not be drawn`);
          if (early.failed) see('AWAY', `${P.id}: "Something went wrong" shown`);
          if (P.timing.away === 'preview' && !early.hiddenNote) see('AWAY', `${P.id}: back in the editor, no note that the poster was hidden (notes: ${early.notes.join(' | ').slice(0, 160) || 'none'})`);
        } else if (!early.bytes) see('AWAY', `${P.id}: back from Preview at ${c.returnMs} ms, no file ${early.ms} ms after the click`);
        if (P.timing.away === 'leave') continue;
      } else if (P.timing?.holdPlotMs) {
        // The loading scenarios: Export › PowerPoint at once, the charts still drawing.
        early = await exportWhileLoading(page, timing, { expectNoFile: !!P.timing.expectNoFile, waitMs: CHART_WAIT_MS });
        row.loading = { atClick: early.atClick, atEnd: early.atEnd, ms: early.ms, fileMs: early.fileMs, notes: early.notes, billing: early.billing, file: !!early.bytes };
        if (early.atClick.drawn !== 0 || early.atClick.charts < want) controlFails.push(`K-loading ${P.id}: ${early.atClick.drawn} of ${early.atClick.charts} charts drawn at the click`);
        if (P.timing.expectNoFile) {
          if (early.atEnd.drawn !== 0 && !early.bytes) controlFails.push(`K-loading ${P.id}: ${early.atEnd.drawn} charts drawn when the export ended (the hold is shorter than the wait)`);
          if (early.bytes) see('WAIT', `${P.id}: a file made ${early.fileMs} ms after the click, ${early.atClick.charts - early.atClick.drawn} chart(s) still drawing at the click`);
          if (early.billing.consumed || early.billing.marked) see('WAIT', `${P.id}: ${early.billing.consumed} credit(s) spent, ${early.billing.marked} paid export(s) recorded, with no file of the charts`);
          if (!early.stillDrawingNote) see('WAIT', `${P.id}: the Export tab does not say a chart is still drawing (notes: ${early.notes.join(' | ').slice(0, 160) || 'none'})`);
          if (early.failed) see('WAIT', `${P.id}: "Something went wrong" shown`);
          // INFO print-while-drawing (a sibling, not gated: the free PDF
          // copies the sheet in the click, its window cannot wait): Save PDF
          // with the charts still drawing, the charts its document holds.
          const atPrint = await page.evaluate(() => document.querySelectorAll('#poster-canvas [data-block-type="chart"] svg[viewBox]').length);
          const printHtml = await printDocument(page);
          const sheetPart = printHtml.slice(printHtml.indexOf('id="poster-print-root"'));
          // A chart's drawing: an svg whose viewBox is its render size (hundreds of px; an icon's is 24).
          row.printWhileDrawing = { drawnAtPrint: atPrint, chartBlocks: (sheetPart.match(/data-block-type="chart"/g) ?? []).length, svgs: (sheetPart.match(/<svg[^>]*viewBox="0 0 \d{3,}/g) ?? []).length };
        } else if (!early.bytes) see('WAIT', `${P.id}: no file ${early.ms} ms after the click`);
      }
      await page.waitForFunction((n) => document.querySelectorAll('#poster-canvas [data-block-type="chart"] svg[viewBox]').length >= n, want, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1200);
      if (P.select) {
        const fr = await page.locator(`#poster-canvas [data-block-id="${P.select}"]`).boundingBox();
        await page.mouse.click(fr.x + fr.width * 0.5, fr.y + Math.min(30, fr.height * 0.2));
        await sleep(1200);
      }
      if (P.timing?.zoomIn) row.zoomedSheetPx = Math.round(await zoomIn(page));
      const family = stored.fontFamily;
      const notes = Object.fromEntries(stored.blocks.filter((b) => b.type === 'chart' && b.note).map((b) => [b.id, b.note.replace(/\s+/g, ' ').trim()]));
      const ed0 = await page.evaluate(readEditor, { posterW: size.w, hints: HINTS, family, notes });
      row.webFont = ed0.webFont;
      row.selected = ed0.selected;
      if (fontsOk && FAKE_FAMILIES.includes(family) && !ed0.webFont) controlFails.push(`K-webfont ${P.id}: ${family} not loaded in the editor`);
      for (const x of P.hints ?? []) if (!ed0.hintsShown.includes(x)) controlFails.push(`K-hint ${P.id}: "${x}" not on the editor's sheet`);
      const drawn = ed0.charts.filter((c) => c.drawn);
      if (drawn.length !== want) controlFails.push(`K-drawn ${P.id}: ${drawn.length} of ${want} charts drawn`);
      const measured = await page.evaluate(`(${measureChartsIn.toString()})('#poster-canvas', ${size.w}, ${JSON.stringify(SAMPLE_PREFIX)}, 0.01, 0.01)`);

      let bytes;
      if (early?.bytes && !P.timing.expectNoFile) bytes = early.bytes;
      else if (P.timing?.scroll) {
        const r = await exportWhileScrolling(page, timing, P.timing.scroll);
        bytes = r.bytes;
        row.scroll = r.control;
        const c = r.control;
        if (!(c.fontFetchAt && c.fontReleaseAt && c.scrollAt > c.fontFetchAt && c.scrollAt < c.fontReleaseAt) || Math.abs((c.scrollTopAfter ?? 0) - (c.scrollTopBefore ?? 0)) < P.timing.scroll / 2) controlFails.push(`K-scroll ${P.id}: the scroll did not land inside the held font fetch (${JSON.stringify(c)})`);
      } else bytes = await downloadPptx(page);
      fs.writeFileSync(path.join(OUT, 'pptx', `${P.id}.pptx`), bytes);
      await sleep(400);
      // The notes the Export tab lists under its buttons after the export.
      row.warnings = await page.evaluate(() => {
        const root = document.querySelector('[data-postr-export-pptx]')?.parentElement;
        return root ? [...root.querySelectorAll('li')].map((e) => e.textContent.trim()).filter(Boolean) : [];
      });
      const undrawn = ed0.charts.filter((c) => !c.drawn).length;
      const chartNotes = row.warnings.filter((w) => /chart/i.test(w));
      if (undrawn && !chartNotes.length) see('WARN', `${P.id}: ${undrawn} chart(s) not drawn in the editor and the Export tab says nothing about charts`);
      if (!undrawn && chartNotes.length) see('WARN', `${P.id}: every chart drawn, and the Export tab says "${chartNotes[0]}"`);
      const file = readPptx(bytes);
      const scale = file.slideIn ? r3(file.slideIn[0] / size.w) : 1;
      row.scale = scale;
      row.slide = { shapes: file.shapes, pictures: file.pics.length };
      for (const x of HINTS) if (file.text.includes(x)) see('HINT', `${P.id} PowerPoint: "${x}"`);
      const hasRefsBlock = stored.blocks.some((b) => b.type === 'references');
      if (hasRefsBlock && !(stored.references ?? []).length && file.paras.some((p) => p.trim() === 'References')) see('EMPTY', `${P.id}: "References" written for a poster with no references`);

      const html = await printDocument(page);
      const sheetHtml = html.slice(html.indexOf('id="poster-print-root"'));
      row.printChartSvgs = (sheetHtml.match(/<svg[^>]*viewBox="0 0 \d{3,}/g) ?? []).length;
      for (const x of HINTS) if (sheetHtml.includes(x)) { see('HINT', `${P.id} print document: "${x}"`); row.hints[x] = true; }
      // INFO empty-printed (review round 2, R2-F3): what an empty block
      // prints in the PDF (its text in the print document) and what the file
      // holds that is only a number ("1.", "Figure 2.").
      if (P.emptyProbe) {
        row.emptyPrinted = {
          pdf: await page.evaluate(({ doc, ids }) => {
            const d = new DOMParser().parseFromString(doc, 'text/html');
            return Object.fromEntries(ids.map((id) => [id, (d.querySelector(`#poster-canvas [data-block-id="${id}"]`)?.textContent ?? '(no block)').replace(/\s+/g, ' ').trim()]));
          }, { doc: html, ids: P.emptyProbe }),
          pptx: file.paras.map((p) => p.trim()).filter((p) => /^(Figure \d+\.|\d+\.)$/.test(p)),
        };
      }

      const imports = READERS.has('reimport') ? await reimport(ed.context, bytes) : null;
      for (const c of ed0.charts) {
        const rec = { id: c.id, drawn: c.drawn, caption: c.caption };
        row.charts.push(rec);
        if (c.caption && !file.paras.some((p) => squash(p) === squash(c.caption) || squash(p).includes(squash(c.caption)))) see('CAPTION', `${P.id} ${c.id}: "${c.caption.slice(0, 50)}" not in the file`);
        // Where the caption and the note are: the text shape holding each, against the editor's box × the scale.
        for (const [what, part, text] of [['caption', c.parts?.caption, c.caption], ['note', c.parts?.note, c.parts?.note?.text]]) {
          if (!part || !text) continue;
          // The text box holding the text nearest where the editor draws it
          // (charts with the same note have the same text).
          const want = [...part.center, ...part.size].map((v) => v * scale);
          const gotOf = (x) => [x.box[0] + x.box[2] / 2, x.box[1] + x.box[3] / 2, x.box[2], x.box[3]];
          const shape = file.boxes.filter((x) => x.box && squash(x.text) === squash(text))
            .sort((a, b) => Math.hypot(gotOf(a)[0] - want[0], gotOf(a)[1] - want[1]) - Math.hypot(gotOf(b)[0] - want[0], gotOf(b)[1] - want[1]))[0];
          if (!shape) continue;
          const got = gotOf(shape);
          const d = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
          rec[`${what}D`] = r3(d);
          if (d > TOL || turnDiff(shape.rot, c.rot ?? 0) > ROT_TOL) see('CAPPOS', `${P.id} ${c.id}: the ${what}'s text box ${d.toFixed(3)} in from where the editor draws it (turn ${shape.rot}°)`);
        }
        if (!c.drawn) continue;
        const want4 = [c.center[0] * scale, c.center[1] * scale, c.size[0] * scale, c.size[1] * scale];
        // Where the drawing is inside a picture: the svg's viewBox fitted into
        // the picture's box by its preserveAspectRatio (SVG's rule; the
        // charts use xMidYMid meet: centred, the whole drawing inside), so a
        // drawing shorter than its block (a single stacked bar) is compared
        // as drawn, not as its picture's box.
        const best = file.pics.map((p) => ({ p, c: drawnIn(p.box, c) }))
          .map((x) => ({ ...x, d: Math.max(...x.c.map((v, i) => Math.abs(v - want4[i]))) }))
          .sort((a, b) => a.d - b.d)[0];
        rec.editorIn = { center: c.center.map(r3), size: c.size.map(r3), rot: c.rot, viewBox: c.viewBox, fit: c.fit };
        if (!best || best.d > TOL || turnDiff(best.p.rot, c.rot) > ROT_TOL) {
          see('CHART', `${P.id} ${c.id}: no picture at ${want4.map(r3).join(', ')} in (turn ${c.rot}°)${best ? `; nearest ${best.d.toFixed(3)} in off, turn ${best.p.rot}°` : '; the slide has no picture'}`);
          continue;
        }
        rec.d = r3(best.d);
        const pic = best.p;
        // The text's scale: the drawing in the picture against the editor's drawing.
        const ratio = best.c[2] / (c.size[0] * scale);
        const m = measured.find((x) => x.id === c.id);
        if (m) {
          const minBy = {};
          for (const t of m.texts) if (MIN[t.role] !== undefined) minBy[t.role] = Math.min(minBy[t.role] ?? Infinity, t.pt * ratio);
          rec.minPt = Object.fromEntries(Object.entries(minBy).map(([k2, v]) => [k2, Math.round(v * 100) / 100]));
          for (const [role, v] of Object.entries(minBy)) if (v < MIN[role] - 0.005) see('MINPT', `${P.id} ${c.id}: ${role} at ${v.toFixed(2)} pt in the file (minimum ${MIN[role]})`);
        }
        if (pic.png) {
          // Per printed inch at the poster's full size: the picture's box / the scale.
          const [pw, ph] = [pic.box[2] / scale, pic.box[3] / scale];
          rec.ppi = Math.round(pic.png.w / pw);
          const full = DPI * pw * DPI * ph;
          if (rec.ppi < DPI - 1 && full <= RASTER_CAP) see('DPI', `${P.id} ${c.id}: ${rec.ppi} px per inch (${pic.png.w} × ${pic.png.h} px for ${[pw, ph].map(r3).join(' × ')} in)`);
          if (full > RASTER_CAP) rec.capped = true;
          if (PICTURE) {
            const cmp = await comparePicture(ed.context, ed0.fontLinks, c.markup, pic.bytes, pic.png.w / pic.png.h, SHOTS ? `${P.id}-${c.id}` : null);
            rec.picture = cmp.picture.share;
            rec.same = cmp.same.share;
            rec.font = cmp.font.share;
            if (cmp.picture.share > PICTURE_TOL) see('PICTURE', `${P.id} ${c.id}: ${(cmp.picture.share * 100).toFixed(1)} % of the inked pixels differ from the editor's svg (fallback font ${(cmp.font.share * 100).toFixed(1)} %)`);
            if (cmp.same.share > PICTURE_TOL / 4) controlFails.push(`K-same ${P.id} ${c.id}: the svg drawn twice differs by ${(cmp.same.share * 100).toFixed(2)} %`);
          }
        } else see('DPI', `${P.id} ${c.id}: the picture is not a PNG (${pic.media})`);
        if (imports) {
          // The reader's inches per slide inch (2 for a half-size file).
          const k = imports.widthIn / file.slideIn[0];
          const back = imports.figures.map((f) => drawnIn(f.box.map((v) => v / k), c)).find((d) => Math.max(...d.map((v, i) => Math.abs(v - want4[i]))) <= TOL);
          if (!back) see('REIMPORT', `${P.id} ${c.id}: the app's reader brings no figure back at ${want4.map(r3).join(', ')} in`);
        }
      }
      // INFO image-captions: where the file puts an image block's caption, against the editor.
      row.imageCaptions = ed0.images.map((im) => {
        const want = [...im.capBox.center, ...im.capBox.size].map((v) => v * scale);
        const shape = file.boxes.find((x) => x.box && squash(x.text) === squash(im.caption));
        if (!shape) return { id: im.id, missing: true };
        const got = [shape.box[0] + shape.box[2] / 2, shape.box[1] + shape.box[3] / 2, shape.box[2], shape.box[3]];
        return { id: im.id, lines: im.lines, d: r3(Math.max(...got.map((v, i) => Math.abs(v - want[i])))), dTop: r3((got[1] - got[3] / 2) - (want[1] - want[3] / 2)), dHeight: r3(got[3] - want[3]) };
      });
      row.fonts = fontLog.reduce((o, x) => ({ ...o, [x.kind]: (o[x.kind] ?? 0) + 1 }), {});
      for (const e of ed.state.errors) R.errors.push(`${P.id}: page error ${e}`);
      log(`[P] ${P.id} ${size.w} × ${size.h} in (scale ${scale}): ${drawn.length} charts drawn, ${file.pics.length} pictures, ${file.shapes} shapes; hints in print ${Object.keys(row.hints).length}; web font ${ed0.webFont}`);
    } catch (e) {
      R.errors.push(`${P.id}: ${String(e).slice(0, 300)}`);
      log(`[P] ${P.id}: ERROR ${String(e).slice(0, 300)}`);
    } finally {
      await ed?.context.close().catch(() => {});
    }
  }

  // LibreOffice: every file to PDF in one run, its pictures and text read with pdfjs.
  if (READERS.has('lo')) {
    let soffice = null;
    for (const c of ['/opt/homebrew/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice', '/usr/bin/soffice']) if (fs.existsSync(c)) { soffice = c; break; }
    if (!soffice) R.lo = 'BLIND SPOT: no soffice on this machine';
    else {
      const loOut = path.join(OUT, 'lo');
      fs.mkdirSync(loOut, { recursive: true });
      const files = R.posters.filter((p) => fs.existsSync(path.join(OUT, 'pptx', `${p.id}.pptx`))).map((p) => path.join(OUT, 'pptx', `${p.id}.pptx`));
      try {
        execFileSync(soffice, [`-env:UserInstallation=${pathToFileURL(path.join(OUT, 'lo-profile')).href}`, '--headless', '--convert-to', 'pdf', '--outdir', loOut, ...files], { stdio: 'pipe', timeout: 600000 });
        R.lo = { version: execFileSync(soffice, ['--version'], { timeout: 60000 }).toString().trim().split('\n')[0], files: files.length };
      } catch (e) {
        R.errors.push(`LibreOffice: ${String(e).slice(0, 200)}`);
      }
      for (const p of R.posters) {
        const pdfFile = path.join(loOut, `${p.id}.pdf`);
        if (!fs.existsSync(pdfFile)) continue;
        const pdf = await pdfImagesAndText(fs.readFileSync(pdfFile), { pdfjs });
        const slideW = p.size.w * p.scale;
        if (Math.abs(pdf.pageIn[0] - slideW) > 0.02) controlFails.push(`K-lo ${p.id}: LibreOffice's page ${pdf.pageIn.join(' × ')} in, the slide ${slideW} in wide`);
        if (p.id === 'user-figures' && pdf.images.length < 3) controlFails.push(`K-lo user-figures: LibreOffice drew ${pdf.images.length} pictures, the poster has 3 figures`);
        const text = squash(pdf.items.map((it) => it.s).join(''));
        p.lo = { images: pdf.images.length };
        for (const c of p.charts.filter((x) => x.editorIn)) {
          const [cx, cy] = c.editorIn.center.map((v) => v * p.scale);
          const [w, hh] = c.editorIn.size.map((v) => v * p.scale);
          const turned = Math.abs(Math.sin((c.editorIn.rot * Math.PI) / 180));
          const [bw, bh] = turned > 0.5 ? [hh, w] : [w, hh];
          const hit = pdf.images.find((b) => {
            const d = drawnIn(turned > 0.5 ? [b[0] + (b[2] - b[3]) / 2, b[1] + (b[3] - b[2]) / 2, b[3], b[2]] : b, c.editorIn);
            const [dw, dh] = turned > 0.5 ? [d[3], d[2]] : [d[2], d[3]];
            return near(d[0], cx, TOL) && near(d[1], cy, TOL) && (c.editorIn.rot % 90 !== 0 || (near(dw, bw, TOL) && near(dh, bh, TOL)));
          });
          if (!hit) see('LO', `${p.id} ${c.id}: LibreOffice draws no picture at ${[cx, cy, w, hh].map(r3).join(', ')} in`);
          if (c.caption && !text.includes(squash(c.caption))) see('LO', `${p.id} ${c.id}: LibreOffice's PDF lacks the caption "${c.caption.slice(0, 40)}"`);
        }
      }
    }
  }

  // Quick Look (macOS's own Office renderer, `qlmanage -t`): slide 1 drawn
  // to a PNG; each upright chart's picture box must hold ink. Quick Look
  // draws a turned picture upright (it ignores the turn, text boxes too),
  // so turned charts are left out here; LibreOffice reads those.
  if (READERS.has('ql')) {
    if (!fs.existsSync('/usr/bin/qlmanage')) R.ql = 'BLIND SPOT: no qlmanage on this machine';
    else {
      const { decodePNG } = await import('./lib/png.mjs');
      R.ql = { posters: 0, charts: 0 };
      for (const p of R.posters) {
        const file = path.join(OUT, 'pptx', `${p.id}.pptx`);
        const charts = p.charts.filter((c) => c.editorIn && Math.abs(Math.sin((c.editorIn.rot * Math.PI) / 180)) < 1e-6 && Math.abs(c.editorIn.rot) < 90);
        if (!fs.existsSync(file) || !charts.length) continue;
        const dir = path.join(OUT, 'ql', p.id);
        fs.mkdirSync(dir, { recursive: true });
        try {
          execFileSync('/usr/bin/qlmanage', ['-t', '-s', '2000', '-o', dir, file], { stdio: 'pipe', timeout: 120000 });
        } catch (e) {
          R.errors.push(`Quick Look ${p.id}: ${String(e).slice(0, 160)}`);
          continue;
        }
        const png = decodePNG(fs.readFileSync(path.join(dir, `${p.id}.pptx.png`)));
        const slideW = p.size.w * p.scale;
        const slideH = p.size.h * p.scale;
        // The thumbnail keeps the slide's shape inside its 2000 px box.
        const k = Math.min(png.w / slideW, png.h / slideH);
        R.ql.posters += 1;
        for (const c of charts) {
          const [cx, cy] = c.editorIn.center.map((v) => v * p.scale);
          const [w, hh] = c.editorIn.size.map((v) => v * p.scale);
          let ink = 0;
          let all = 0;
          for (let y = Math.max(0, Math.round((cy - hh / 2) * k)); y < Math.min(png.h, Math.round((cy + hh / 2) * k)); y += 1) {
            for (let x = Math.max(0, Math.round((cx - w / 2) * k)); x < Math.min(png.w, Math.round((cx + w / 2) * k)); x += 1) {
              all += 1;
              if (Math.min(...png.rgb(x, y)) < 200) ink += 1;
            }
          }
          c.qlInk = all ? Math.round((ink / all) * 1000) / 1000 : 0;
          R.ql.charts += 1;
          if (c.qlInk < 0.01) see('QL', `${p.id} ${c.id}: Quick Look draws nothing at the chart's box (${(c.qlInk * 100).toFixed(1)} % inked)`);
        }
      }
    }
  }

  // K-font: the comparison sees another font on (nearly) every chart.
  const compared = R.posters.flatMap((p) => p.charts).filter((c) => c.font !== undefined);
  const seesFont = compared.filter((c) => c.font > PICTURE_TOL).length;
  R.kFont = { compared: compared.length, seesFont };
  if (PICTURE && fontsOk && compared.length && seesFont < 0.9 * compared.length) controlFails.push(`K-font: the fallback font differs by more than ${PICTURE_TOL} on ${seesFont} of ${compared.length} charts`);
} catch (e) {
  R.errors.push(`run: ${String(e).slice(0, 300)}`);
} finally {
  await h.stop();
  fs.writeFileSync(path.join(WEB, 'public/version.json'), stamp);
}

fs.writeFileSync(path.join(OUT, 'pptx-export-check.json'), JSON.stringify({ ...R, claims, controlFails }, null, 1));
const all = R.posters.flatMap((p) => p.charts.filter((c) => c.drawn));
const worst = (k) => all.reduce((m, c) => (c[k] !== undefined ? Math.max(m, c[k]) : m), 0);
const least = (k) => all.reduce((m, c) => (c[k] !== undefined ? Math.min(m, c[k]) : m), Infinity);
log(`\n[pptx-export-check] ${h.engine} ${h.serve}, git ${h.git}${h.mutant ? ` MUTANT ${h.mutant}` : ''}: ${R.posters.length} posters, ${all.length} charts drawn`);
log(`[INFO slides] ${R.posters.map((p) => `${p.id} ${p.slide ? `${p.slide.shapes} shapes ${p.slide.pictures} pictures` : '-'}`).join(' · ')}`);
log(`[INFO worst] box ${worst('d')} in · least ppi ${least('ppi')} (capped ${all.filter((c) => c.capped).length}) · PICTURE worst ${worst('picture')} · K-same worst ${worst('same')} · K-font least ${least('font')} (${R.kFont?.seesFont} of ${R.kFont?.compared} above ${PICTURE_TOL})`);
log(`[INFO minPt] least in the file: ${['tick', 'legend', 'direct', 'axisTitle'].map((k) => `${k} ${all.reduce((m, c) => Math.min(m, c.minPt?.[k] ?? Infinity), Infinity)}`).join(', ')}`);
log(`[INFO fonts] ${R.posters.map((p) => `${p.id} ${JSON.stringify(p.fonts ?? {})}`).join(' · ')}`);
log(`[INFO warnings] ${R.posters.filter((p) => p.warnings?.length).map((p) => `${p.id}: ${p.warnings.join(' | ').slice(0, 200)}`).join(' · ') || 'none read'}`);
log(`[INFO LibreOffice] ${JSON.stringify(R.lo ?? 'not run')}`);
log(`[INFO Quick Look] ${JSON.stringify(R.ql ?? 'not run')}; least ink in an upright chart's box ${all.reduce((m, c) => (c.qlInk !== undefined ? Math.min(m, c.qlInk) : m), Infinity)}`);
log(`[INFO away] ${R.posters.filter((p) => p.away).map((p) => `${p.id}: ${p.away.atClick.drawn} of ${p.away.atClick.charts} drawn at the click, away at ${p.away.control.awayMs} ms${p.away.control.returnMs ? `, back at ${p.away.control.returnMs} ms` : ''}${p.away.writerHeldMs ? ` (writer chunk held ${p.away.writerHeldMs.join(' to ')} ms around it)` : ''}, file ${p.away.file ? `after ${p.away.fileMs} ms` : 'none'}, credits spent ${p.away.billing.consumed}, paid exports recorded ${p.away.billing.marked}, notes "${p.away.notes.join(' | ').slice(0, 140)}"`).join(' · ') || 'none run'}`);
log(`[INFO timing] ${R.posters.filter((p) => p.scroll || p.loading).map((p) => `${p.id}: ${p.scroll ? `scrolled ${p.scroll.scrollTopBefore} → ${p.scroll.scrollTopAfter} px ${p.scroll.scrollAt - p.scroll.fontFetchAt} ms into the held font fetch` : `${p.loading.atClick.drawn} of ${p.loading.atClick.charts} drawn at the click, export ended after ${p.loading.ms} ms with ${p.loading.atEnd.drawn} drawn, file ${p.loading.file ? `after ${p.loading.fileMs} ms` : 'none'}, credits spent ${p.loading.billing.consumed}, paid exports recorded ${p.loading.billing.marked}, notes "${p.loading.notes.join(' | ').slice(0, 120)}"`}`).join(' · ') || 'none run'}`);
log(`[INFO print-while-drawing] (a sibling, not gated) ${R.posters.filter((p) => p.printWhileDrawing).map((p) => `${p.id}: Save PDF with ${p.printWhileDrawing.drawnAtPrint} charts drawn: ${p.printWhileDrawing.chartBlocks} chart blocks in the print document, ${p.printWhileDrawing.svgs} chart drawings (drawn: ${p.printChartSvgs})`).join(' · ') || 'not run'}`);
log(`[INFO empty-printed] (review round 2, R2-F3; not gated: numbering, not a hint) ${R.posters.filter((p) => p.emptyPrinted).map((p) => `${p.id}: PDF ${Object.entries(p.emptyPrinted.pdf).map(([id, t]) => `${id} "${t}"`).join(', ')}; PowerPoint paragraphs that are only a number: ${p.emptyPrinted.pptx.map((t) => `"${t}"`).join(', ') || 'none'}`).join(' · ') || 'not run'}`);
log(`[INFO image-captions] (a sibling, not gated: the image blocks' captions, placed by the writer's own layout) ${R.posters.filter((p) => p.imageCaptions?.length).map((p) => `${p.id}: ${p.imageCaptions.map((x) => (x.missing ? `${x.id} missing` : `${x.id} ${x.lines} line(s) off ${x.d} in (top ${x.dTop}, height ${x.dHeight})`)).join(', ')}`).join(' · ') || 'none'}`);
for (const [c, list] of Object.entries(claims)) log(`[${list.length ? 'OBSERVED' : 'not observed'} ${c}] ${list.length}${list.length ? `: ${list.slice(0, 6).join(' | ')}` : ''}`);
for (const x of R.skipped ?? []) log(`[SKIPPED] ${x}`);
for (const e of R.errors) log(`[ERROR] ${e}`);
for (const f of controlFails) log(`[CONTROL FAILED] ${f}`);
process.exitCode = controlFails.length || R.errors.length ? 2 : Object.values(claims).some((l) => l.length) ? 1 : 0;
