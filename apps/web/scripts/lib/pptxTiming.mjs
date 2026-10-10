/**
 * Timing scenarios for scripts/pptx-export-check.mjs (record 31's review
 * round 1; its probes folded in): what the user does while Export ›
 * PowerPoint builds the file.
 *
 *   scroll  R1-F1: the poster zoomed in so the workspace scrolls; Export ›
 *           PowerPoint; once the export has asked for the poster font's
 *           stylesheet (its own fetch, held `holdFontMs`, so the timing is
 *           the harness's, not the machine's), a plain wheel scroll of
 *           `scroll` px over the poster. The file's charts, captions and
 *           notes must still be where the editor draws them (the harness's
 *           CHART and CAPPOS; positions on the sheet do not move with a
 *           scroll). Control K-scroll: the scroll landed while the fetch was
 *           held, and the workspace moved.
 *   loading R1-F2: Observable Plot's lazy chunk held `holdPlotMs` (a slow
 *           network), so the charts still show "Rendering chart…" when the
 *           user clicks Export › PowerPoint right after the editor opens.
 *           Within the export's wait (10 s) the file must have every chart
 *           (CHART); past it (`expectNoFile`), no file, no credit spent and
 *           no paid export recorded, and the Export tab says a chart is
 *           still drawing (claim WAIT). Control K-loading: no chart drawn at
 *           the click. A pack holder (`pack`: its credits) where the
 *           scenario says, the billing API's calls counted.
 *   away    R2-F1 (review round 2): the user looks away while Export ›
 *           PowerPoint waits: "👁 Preview poster" (`away: 'preview'`, in the
 *           same tab, above the button) or the browser's Back to the
 *           dashboard (`away: 'leave'`: the router's popstate, an in-app
 *           route change) `awayAtMs` after the click, while the charts
 *           still draw (`holdPlotMs`) or while the writer's chunk is held
 *           (`holdWriterMs`: a slow network on a session's first export, no
 *           chart drawing); back from Preview `returnAtMs` after the click
 *           (none: past the wait; when set, after the charts have drawn,
 *           hidden). Claim AWAY: with no return in the wait,
 *           a file, a credit spent or a paid export recorded, a note that a
 *           chart "could not be drawn", "Something went wrong", or (back in
 *           the editor) no note that the poster was hidden; back within the
 *           wait, no file (its charts are the harness's CHART). Control
 *           K-away: the Preview click or the Back landed while the export
 *           was still waiting (no file yet), the sheet then hidden (its
 *           width 0) or gone, (holdWriterMs) inside the held chunk, and
 *           (returnAtMs) every chart drawn, hidden, before the return.
 */
import fs from 'node:fs';
import { openTab } from './undoKit.mjs';

const STILL_DRAWING = /still drawing/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The routes a timing scenario needs, added before the page opens (they
 * run before the fake backend's): returns the scenario's live state.
 */
export async function prepareTiming(context, timing) {
  const t = { api: [], fontFetchAt: null, fontReleaseAt: null };
  if (timing.holdFontMs) {
    await context.route('https://fonts.googleapis.com/**', async (route) => {
      // Only the export's own fetch() of the stylesheet; the editor's <link> passes.
      if (route.request().resourceType() === 'fetch' && t.fontFetchAt === null) {
        t.fontFetchAt = Date.now();
        await sleep(timing.holdFontMs);
        t.fontReleaseAt = Date.now();
      }
      return route.fallback();
    });
  }
  if (timing.holdWriterMs) {
    // The writer's own chunk, by its dev-server name (the build names it otherwise).
    await context.route(/\/src\/export\/pptx\/writer\.ts/, async (route) => {
      if (t.writerHeldAt === undefined) {
        t.writerHeldAt = Date.now();
        await sleep(timing.holdWriterMs);
        t.writerReleaseAt = Date.now();
      }
      return route.continue();
    });
  }
  if (timing.holdPlotMs) {
    await context.route(/observablehq_plot/, async (route) => {
      await sleep(timing.holdPlotMs);
      return route.continue();
    });
  }
  if (timing.pack !== undefined) {
    let credits = timing.pack;
    await context.route(/dummy\.supabase\.co\/rest\/v1\/users/, (route) => {
      const row = { id: 'zq-pack', plan: null, plan_expires_at: null, export_credits: credits, review_credits: 0, review_addon: false, subscription_status: null, research_consent_at: null, marketing_consent_at: null };
      const wantsObject = (route.request().headers().accept || '').includes('vnd.pgrst.object');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(wantsObject ? row : [row]) });
    });
    t.credits = () => credits;
    t.spend = () => { credits = Math.max(0, credits - 1); return credits; };
  }
  await context.route('http://localhost:3000/**', (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const p = new URL(route.request().url()).pathname;
    t.api.push(p);
    if (p.endsWith('/billing/consume-credit')) return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ ok: true, credits: t.spend ? t.spend() : 0 }) });
    if (p.endsWith('/billing/mark-export')) return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{"success":true}' });
    return route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{"success":false,"error":"mock"}' });
  });
  return t;
}

/** The billing calls a paid export makes: credits spent and paid exports recorded. */
export const billingCalls = (t) => ({
  consumed: t.api.filter((p) => p.endsWith('/billing/consume-credit')).length,
  marked: t.api.filter((p) => p.endsWith('/billing/mark-export')).length,
});

/** Zoom the editor in (a pinch: Ctrl + wheel over the sheet) so its workspace scrolls. */
export async function zoomIn(page) {
  const box = await page.locator('#poster-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -120);
    await sleep(60);
  }
  await page.keyboard.up('Control');
  await sleep(1500);
  return (await page.locator('#poster-canvas').boundingBox()).width;
}

/** The workspace element that scrolls the sheet: its scrollTop. */
const scrollTop = (page) => page.evaluate(() => {
  let el = document.getElementById('poster-canvas');
  while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  return el ? el.scrollTop : null;
});

/** Export › PowerPoint with a wheel scroll while the export's font fetch is held (scenario `scroll`). */
export async function exportWhileScrolling(page, t, px) {
  await openTab(page, 'export');
  const btn = page.locator('[data-postr-export-pptx]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  const box = await btn.boundingBox();
  const sheet = await page.locator('#poster-canvas').boundingBox();
  const dl = page.waitForEvent('download', { timeout: 90000 });
  await btn.click();
  const until = Date.now() + 30000;
  while (t.fontFetchAt === null && Date.now() < until) await sleep(25);
  const before = await scrollTop(page);
  // Over the poster, clear of the sidebar the button is in.
  await page.mouse.move(Math.max(box.x + box.width + 200, sheet.x + 200), Math.max(200, sheet.y + 200));
  await page.mouse.wheel(0, px);
  const scrollAt = Date.now();
  await sleep(300);
  const after = await scrollTop(page);
  const bytes = fs.readFileSync(await (await dl).path());
  return { bytes, control: { fontFetchAt: t.fontFetchAt, scrollAt, fontReleaseAt: t.fontReleaseAt, scrollTopBefore: before, scrollTopAfter: after } };
}

/** Each chart block on the sheet, and how many are drawn (an svg). */
const chartsDrawn = (page) => page.evaluate(() => {
  const blocks = [...document.querySelectorAll('#poster-canvas [data-block-type="chart"]')];
  return { charts: blocks.length, drawn: blocks.filter((b) => b.querySelector('svg[viewBox]')).length };
});

/** The notes the Export tab lists under its buttons. */
export const exportNotes = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-postr-export-pptx]')?.parentElement;
  return root ? [...root.querySelectorAll('li')].map((e) => e.textContent.trim()).filter(Boolean) : [];
});

/**
 * Export › PowerPoint right after the editor opens, its charts still
 * drawing (scenario `loading`): the file (or null), what was drawn at the
 * click and when the export ended, the notes and the billing calls.
 */
export async function exportWhileLoading(page, t, { expectNoFile, waitMs }) {
  await openTab(page, 'export');
  const btn = page.locator('[data-postr-export-pptx]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  const atClick = await chartsDrawn(page);
  const t0 = Date.now();
  let file = null;
  let fileMs = null;
  page.on('download', (d) => {
    if (file) return;
    file = d;
    fileMs = Date.now() - t0;
  });
  await btn.click();
  if (expectNoFile) {
    // The export's wait, then a note; or a file. Whichever comes first.
    await page.waitForFunction((re) => {
      const root = document.querySelector('[data-postr-export-pptx]')?.parentElement;
      return root && new RegExp(re, 'i').test(root.textContent);
    }, STILL_DRAWING.source, { timeout: waitMs + 15000 }).catch(() => {});
    await sleep(800);
  } else {
    const until = Date.now() + waitMs + 30000;
    while (!file && Date.now() < until) await sleep(50);
  }
  const ms = Date.now() - t0;
  const atEnd = await chartsDrawn(page);
  const notes = await exportNotes(page);
  const failed = await page.evaluate(() => /Something went wrong/.test(document.querySelector('[data-postr-export-pptx]')?.parentElement?.textContent ?? ''));
  const bytes = file ? fs.readFileSync(await file.path()) : null;
  return { bytes, fileMs, atClick, atEnd, ms, notes, failed, billing: billingCalls(t), stillDrawingNote: notes.some((n) => STILL_DRAWING.test(n)) };
}

const HIDDEN_NOTE = /hidden in Preview/i;
const LEFT_OUT_NOTE = /could not be drawn/i;
const sheetWidth = (page) => page.evaluate(() => document.getElementById('poster-canvas')?.getBoundingClientRect().width ?? null);

/**
 * Export › PowerPoint, then Preview or the browser's Back while it waits
 * (scenario `away`): the file (or null), when it came, what the user did
 * and when, the notes back in the editor and the billing calls.
 */
export async function exportWhileAway(page, t, { away, awayAtMs, returnAtMs = null, waitMs }) {
  await openTab(page, 'export');
  const btn = page.locator('[data-postr-export-pptx]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  const atClick = await chartsDrawn(page);
  const control = {};
  const t0 = Date.now();
  let file = null;
  let fileMs = null;
  page.on('download', (d) => {
    if (file) return;
    file = d;
    fileMs = Date.now() - t0;
  });
  const until = (ms) => sleep(Math.max(0, ms - (Date.now() - t0)));
  await btn.click();
  await until(awayAtMs);
  control.fileBeforeAway = !!file;
  if (away === 'preview') {
    await page.getByRole('button', { name: /Preview poster/ }).click();
    control.awayAt = Date.now();
    control.awayMs = control.awayAt - t0;
    control.sheetWidthAway = await sheetWidth(page);
  } else {
    // The browser's Back to the dashboard, as the router sees it.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    control.awayAt = Date.now();
    control.awayMs = control.awayAt - t0;
    await sleep(300);
    control.left = await page.evaluate(() => ({ path: window.location.pathname, sheet: !!document.getElementById('poster-canvas') }));
  }
  if (returnAtMs !== null) {
    await until(returnAtMs);
    // The charts drawn while hidden (the scenario's point): the control reads it.
    control.drawnAtReturn = (await chartsDrawn(page)).drawn;
    control.fileBeforeReturn = !!file;
    await page.getByRole('button', { name: 'Back to Editor' }).click();
    control.returnMs = Date.now() - t0;
    control.sheetWidthBack = await sheetWidth(page);
    const deadline = Date.now() + waitMs + 30000;
    while (!file && Date.now() < deadline) await sleep(50);
  } else {
    // The export's wait and a margin: a file, or (Preview) the note.
    const deadline = t0 + waitMs + 8000;
    while (!file && Date.now() < deadline) {
      if (away === 'preview' && HIDDEN_NOTE.test(await page.evaluate(() => document.querySelector('[data-postr-export-pptx]')?.parentElement?.textContent ?? ''))) break;
      await sleep(100);
    }
    await sleep(800);
    if (away === 'preview') {
      await page.getByRole('button', { name: 'Back to Editor' }).click();
      await sleep(400);
    }
  }
  const ms = Date.now() - t0;
  const notes = away === 'leave' ? [] : await exportNotes(page);
  const failed = away === 'leave' ? false : await page.evaluate(() => /Something went wrong/.test(document.querySelector('[data-postr-export-pptx]')?.parentElement?.textContent ?? ''));
  const bytes = file ? fs.readFileSync(await file.path()) : null;
  return {
    bytes, fileMs, atClick, ms, notes, failed, control, billing: billingCalls(t),
    hiddenNote: notes.some((n) => HIDDEN_NOTE.test(n)), leftOutNote: notes.some((n) => LEFT_OUT_NOTE.test(n)),
  };
}
