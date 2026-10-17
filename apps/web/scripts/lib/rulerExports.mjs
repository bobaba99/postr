/**
 * The rulers never reach a copy of the sheet (fix 04, the port onto main;
 * docs/fixes/04-rulers-match-sheet.md): `ruler-check.mjs --exports`.
 *
 * Through a signed-in term holder at /p/new on lib/guestBackend.mjs (the
 * PowerPoint export is theirs), with the rulers shown as the editor opens:
 *   - the print document the top bar's "Save PDF" writes (record 30's one
 *     print path), read in its window: its whole <body>, and any ruler mark
 *     in it (a label like 5" in a monospace span, or a 24 px bar in the
 *     rulers' colour, rgb(18, 18, 30));
 *   - the thumbnail, made by the app's own capture (`capturePosterJpeg` in
 *     src/data/thumbnails.ts, imported from the dev server), decoded in the
 *     page and hashed pixel by pixel;
 *   - the PowerPoint file (Export › PowerPoint), every slide's XML and every
 *     media file's name and size.
 * Each is made with "Show ruler" on (twice) and off, and once more with the
 * rulers on after a word is typed into the poster.
 *
 * CLAIMS (observed = the defect):
 *   X1  a copy made with the rulers shown differs from the same copy made
 *       with them hidden (print document, thumbnail or PowerPoint file);
 *   X2  the print document holds a ruler mark;
 *   X3  a ruler element sits inside #poster-canvas, the box every copy is
 *       taken from (INSPECTED: printPoster, capturePosterJpeg and the
 *       PowerPoint writer's chart pictures all start from it).
 * CONTROLS (a failure is exit 2): the rulers are drawn as the editor opens;
 *   "Show ruler" hides them; two copies made the same way are the same
 *   (nothing in a copy changes by itself, so X1 can be read); the copies
 *   made after the typed word differ from the first ones (X1 can go red).
 * INFORMATION: "Show ruler"'s state as the editor opens, and after it is
 *   turned off and the page reloaded (whether it is remembered); the layout
 *   tab's line under it.
 * BLIND SPOTS: the dev server only (the capture is imported from /src);
 *   Chromium's print dialog and the PDF it writes are not read (record 30's
 *   print-path-check reads those); one poster, the new one.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './editorHarness.mjs';
import { typeIntoTextBlock } from './guestBackend.mjs';
import { downloadPptx, openPrintWindow, openSignedIn } from './keepWorkKit.mjs';
import { openTab } from './undoKit.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

/** Ruler marks in a document: labels (5", -10"), bars in the rulers' colour; and those inside the sheet. */
function rulerMarks(doc) {
  const isLabel = (sp) => /^-?\d+"$/.test(sp.textContent.trim()) && /monospace/.test(getComputedStyle(sp).fontFamily);
  const labels = [...doc.querySelectorAll('span')].filter(isLabel);
  const bars = [...doc.querySelectorAll('div')].filter((d) => {
    const cs = getComputedStyle(d);
    const r = d.getBoundingClientRect();
    return cs.backgroundColor === 'rgb(18, 18, 30)' && (Math.round(r.height) === 24 || Math.round(r.width) === 24);
  });
  const sheet = doc.getElementById('poster-canvas');
  return {
    labels: labels.length, bars: bars.length,
    inSheet: sheet ? [...labels, ...bars].filter((el) => sheet.contains(el)).length : null,
  };
}

const marksOn = (page) => page.evaluate(`(${rulerMarks.toString()})(document)`);

/** The app's own thumbnail capture, decoded and hashed in the page. */
const thumbnail = (page) => page.evaluate(async () => {
  const m = await import('/src/data/thumbnails.ts');
  const blob = await m.capturePosterJpeg({ targetWidthPx: 800, quality: 0.95 });
  if (!blob) return { error: 'the capture returned nothing' };
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  let hash = 2166136261;
  for (let i = 0; i < px.length; i += 1) { hash ^= px[i]; hash = Math.imul(hash, 16777619) >>> 0; }
  return { w: c.width, h: c.height, hash: hash.toString(16) };
});

/** The top bar's Save PDF document: its body, and any ruler mark in it. */
async function printCopy(page, marker) {
  const popup = await openPrintWindow(page, marker, { entry: 'topbar' });
  if (!popup) return { error: 'no print window' };
  try {
    const body = await popup.evaluate(() => document.body.innerHTML);
    const marks = await popup.evaluate(`(${rulerMarks.toString()})(document)`);
    return { length: body.length, body, marks };
  } finally {
    await popup.close().catch(() => {});
  }
}

/** Export › PowerPoint: every slide's XML, and every media file's name and size. */
async function pptxCopy(page) {
  const files = unzipSync(new Uint8Array(await downloadPptx(page)));
  const slides = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort().map((n) => strFromU8(files[n]));
  const media = Object.keys(files).filter((n) => n.startsWith('ppt/media/')).sort().map((n) => `${n}:${files[n].length}`);
  return { slides: slides.join('\n'), media: media.join(',') };
}

async function copies(page, marker) {
  const t = await thumbnail(page);
  const print = await printCopy(page, marker);
  const pptx = await pptxCopy(page);
  return { thumb: t, print, pptx };
}

/** Where two sets of copies differ: the parts by name. */
function differ(a, b) {
  const out = [];
  if (a.thumb.error || b.thumb.error || a.thumb.hash !== b.thumb.hash || a.thumb.w !== b.thumb.w) out.push('thumbnail');
  if (a.print.error || b.print.error || a.print.body !== b.print.body) out.push('print document');
  if (a.pptx.slides !== b.pptx.slides || a.pptx.media !== b.pptx.media) out.push('PowerPoint file');
  return out;
}

const deselect = async (page) => {
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  await page.mouse.click(o.x + o.width - 20, o.y + o.height - 20);
  await page.waitForTimeout(400);
};

async function setShowRuler(page, on) {
  await openTab(page, 'layout');
  const box = page.getByLabel('Show ruler');
  if ((await box.isChecked()) !== on) await box.click();
  await page.waitForTimeout(300);
}

/** The run: see the header. Returns { observed, errors, ... }. */
export async function runExports(h) {
  const { context, page } = await openSignedIn(h, { plan: 'term' });
  try {
    const marker = 'ZQRULERS';
    await typeIntoTextBlock(page, ` ${marker}`);
    await deselect(page);
    const opened = await marksOn(page);
    await openTab(page, 'layout');
    const toggleAsOpened = await page.getByLabel('Show ruler').isChecked();
    const note = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent.trim()).find((t) => /never prints or exports/.test(t) && t.length < 80) ?? null);
    const on1 = await copies(page, marker);
    const on2 = await copies(page, marker);
    await setShowRuler(page, false);
    const hidden = await marksOn(page);
    const off = await copies(page, marker);
    // Remembered? Off, then a reload.
    await page.reload();
    await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
    await page.waitForTimeout(800);
    const afterReload = await marksOn(page);
    await openTab(page, 'layout');
    const toggleAfterReload = await page.getByLabel('Show ruler').isChecked();
    await setShowRuler(page, true);
    await typeIntoTextBlock(page, ' ZQCTL');
    await deselect(page);
    const changed = await copies(page, marker);

    const errors = [];
    if (!(opened.labels > 0 && opened.bars >= 2)) errors.push(`control: the rulers are not drawn as the editor opens ${JSON.stringify(opened)}`);
    if (hidden.labels !== 0 || hidden.bars !== 0) errors.push(`control: "Show ruler" off leaves rulers drawn ${JSON.stringify(hidden)}`);
    const same = differ(on1, on2);
    if (same.length) errors.push(`control: two copies made the same way differ (${same.join(', ')})`);
    const ctl = differ(on1, changed);
    if (ctl.length < 3) errors.push(`control: a typed word did not change every copy (only ${ctl.join(', ') || 'none'})`);
    for (const c of [on1, on2, off, changed]) {
      if (c.thumb.error) errors.push(`thumbnail: ${c.thumb.error}`);
      if (c.print.error) errors.push(`print: ${c.print.error}`);
    }
    const x1 = differ(on1, off);
    const x2 = on1.print.marks ?? { labels: null };
    const claims = {
      X1: { observed: x1.length > 0, parts: x1 },
      X2: { observed: !(x2.labels === 0 && x2.bars === 0), marks: x2 },
      X3: { observed: opened.inSheet !== 0, inSheet: opened.inSheet },
    };
    return {
      errors, claims,
      info: {
        showRulerAsOpened: toggleAsOpened, drawnAsOpened: opened,
        showRulerAfterOffAndReload: toggleAfterReload, drawnAfterOffAndReload: afterReload,
        layoutTabNote: note,
        thumbnail: { on: on1.thumb, off: off.thumb, changed: changed.thumb },
        printBodyLength: { on: on1.print.length, off: off.print.length, changed: changed.print.length },
        pptxMedia: { on: on1.pptx.media, off: off.pptx.media },
      },
    };
  } finally {
    await context.close().catch(() => {});
  }
}
