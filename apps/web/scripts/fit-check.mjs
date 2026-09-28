#!/usr/bin/env node
/**
 * fit-check.mjs — real-browser check of "Fit poster to screen" and the zoom
 * controls (plan item 3; record docs/fixes/03-fit-whole-sheet.md).
 *
 * The sheet is measured on screen after the editor opens (it opens fitted)
 * and after a click on FIT: for each side, the gutter between the sheet and
 * the visible part of the canvas area (its client box: scrollbars excluded),
 * and how much of the sheet is hidden. Also the scroll overflow, the zoom,
 * and whether the guidelines panel is open.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   H1  after Fit, part of the sheet is hidden (more than half a pixel), or
 *       the canvas scrolls; also at device pixel ratios 1.25 and 1.5, where
 *       a flush fit can round to a pixel of overflow
 *   H1m the mechanism: the overflow on the limiting axis is 192 − 60 = 132 px
 *   H2  at a fit below 0.3, one click on Zoom out makes the poster bigger
 *   H3  at a fit below 0.2, a pinch out (Ctrl + wheel) makes it bigger
 *   H4  below 1600 px wide, the guidelines panel is open when the editor opens
 *   H5  after zooming in and scrolling to the far corner, Fit leaves part of
 *       the sheet hidden (plain, and with a block parked off the sheet)
 *   H6  a canvas narrower than the gutter (a 860–900 px window with both
 *       panels open) shows the poster at 100%, or hides part of it
 *   Hr  regression guard: on the axis the sheet fills, the rulers' 0-inch
 *       mark is not the 24 px off it was on main (the ruler bar's inset,
 *       plan item 4). Update this guard when item 4 fixes the rulers.
 *   Hh  INFORMATION, not counted in the exit code: a selected block's
 *       handle row, above a block at the top of the sheet, starts under
 *       the 24 px top ruler after Fit. The row is drawn inside the zoomed
 *       sheet, so it sits 24 × zoom px above its block; it happens on main
 *       too, and is handed on (record section 10), not fixed here.
 *   Control: the phone share view (its gutter matches its padding) hides
 *   nothing.
 *
 * RUN (from apps/web)
 *   node scripts/fit-check.mjs [--only id,id]
 *   env PORT (default 5261), OUT_DIR, POSTR_REPO
 *
 * EXIT 0 no claim observed and no scenario errored · 1 a claim observed ·
 *      2 a scenario errored, or the harness did not start (the instrument
 *      is not trustworthy)
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, openEditor, startHarness } from './lib/editorHarness.mjs';

const PORT = Number(process.env.PORT ?? 5261);
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1]).split(',')
  : null;
/** The instrument failed: never let that read as "claim observed" (exit 1). */
const fail = (e) => {
  log(`[harness] instrument error: ${String(e).slice(0, 300)}`);
  process.exit(2);
};

/** Where the sheet sits relative to the visible canvas area, in CSS px. */
async function measure(page) {
  return page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const sheet = document.getElementById('poster-canvas');
    const o = outer.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    const vis = {
      left: o.left + outer.clientLeft,
      top: o.top + outer.clientTop,
      right: o.left + outer.clientLeft + outer.clientWidth,
      bottom: o.top + outer.clientTop + outer.clientHeight,
    };
    const gutter = {
      left: s.left - vis.left,
      right: vis.right - s.right,
      top: s.top - vis.top,
      bottom: vis.bottom - s.bottom,
    };
    const round = (v) => Math.round(v * 100) / 100;
    const hidden = Object.fromEntries(Object.entries(gutter).map(([k, v]) => [k, round(Math.max(0, -v))]));
    const sheetUnitsW = Number(sheet.style.width.replace('px', ''));
    // The rulers' 0-inch marks against the sheet's top-left corner: 0 when
    // the rulers are right (plan item 4 fixes the rest; this fix must not
    // make them worse).
    const zeros = [...document.querySelectorAll('span')].filter((sp) => sp.textContent === '0"');
    const topZero = zeros.find((sp) => sp.style.writingMode !== 'vertical-lr');
    const leftZero = zeros.find((sp) => sp.style.writingMode === 'vertical-lr');
    const rulerError = topZero && leftZero
      ? {
        x: round(topZero.parentElement.getBoundingClientRect().left - s.left),
        y: round(leftZero.parentElement.getBoundingClientRect().top - s.top),
      }
      : null;
    return {
      view: { w: outer.clientWidth, h: outer.clientHeight },
      box: { w: round(o.width), h: round(o.height) },
      sheet: { w: round(s.width), h: round(s.height) },
      zoom: round(s.width / sheetUnitsW * 1000) / 1000,
      gutter: Object.fromEntries(Object.entries(gutter).map(([k, v]) => [k, round(v)])),
      hidden,
      hiddenMax: Math.max(...Object.values(hidden)),
      overflow: { x: outer.scrollWidth - outer.clientWidth, y: outer.scrollHeight - outer.clientHeight },
      scroll: { x: outer.scrollLeft, y: outer.scrollTop },
      guidelinesOpen: !document.querySelector('[title="Show poster guidelines"]'),
      rulerError,
    };
  });
}
const zoomNow = (page) => page.evaluate(() => {
  const s = document.getElementById('poster-canvas');
  return s.getBoundingClientRect().width / Number(s.style.width.replace('px', ''));
});
/** Open or close the guidelines panel, whatever its first state. */
async function setGuidelines(page, open) {
  const toggle = open ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]';
  if (await page.$(toggle)) {
    await page.click(toggle);
    await page.waitForTimeout(600); // the panel's 280 ms width transition, then the re-fit
  }
}
const clickFit = async (page) => {
  await page.getByRole('button', { name: 'Fit poster to screen' }).click();
  await page.waitForTimeout(350);
};

const VIEWPORTS = [
  [1280, 800], [1366, 768], [1440, 900], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440],
];
const POSTERS = [[48, 36], [36, 48], [24, 36], [60, 30], [30, 60]];

function fitScenario(vw, vh, pw, ph, guidelines, dpr = 1) {
  return {
    id: `fit-${vw}x${vh}-${pw}x${ph}-${guidelines}${dpr === 1 ? '' : `-dpr${dpr}`}`,
    claim: 'H1',
    async run(h) {
      const { context, page } = await openEditor(h, {
        viewport: { width: vw, height: vh }, poster: { w: pw, h: ph }, deviceScaleFactor: dpr,
      });
      try {
        if (guidelines !== 'default') await setGuidelines(page, guidelines === 'open');
        const onOpen = await measure(page);
        await clickFit(page);
        const afterFit = await measure(page);
        const limiting = afterFit.overflow.x >= afterFit.overflow.y ? 'x' : 'y';
        // The axis the sheet fills: its near gutter is the smaller one.
        const filled = afterFit.gutter.left <= afterFit.gutter.top ? 'x' : 'y';
        const rulerFilled = afterFit.rulerError ? afterFit.rulerError[filled] : null;
        const rulerOther = afterFit.rulerError ? afterFit.rulerError[filled === 'x' ? 'y' : 'x'] : null;
        const scrolls = Math.max(afterFit.overflow.x, afterFit.overflow.y) > 0;
        return {
          observed: afterFit.hiddenMax > 0.5 || onOpen.hiddenMax > 0.5 || scrolls,
          rulerRegressed: rulerFilled !== null && Math.abs(rulerFilled - 24) > 0.5,
          mechanism: afterFit.overflow[limiting] === 132,
          scrolls,
          rulerFilled, rulerOther,
          onOpen, afterFit,
        };
      } finally {
        await context.close();
      }
    },
  };
}

const SCENARIOS = [];
for (const [vw, vh] of VIEWPORTS) for (const [pw, ph] of POSTERS) {
  SCENARIOS.push(fitScenario(vw, vh, pw, ph, 'default'));
  SCENARIOS.push(fitScenario(vw, vh, pw, ph, 'closed'));
}
// Fractional device pixel ratios: a flush fit must not round to overflow.
for (const dpr of [1.25, 1.5]) {
  for (const [vw, vh] of [[1280, 800], [1366, 768], [1440, 900]]) {
    for (const [pw, ph] of [[48, 36], [36, 48], [33.1, 46.8]]) SCENARIOS.push(fitScenario(vw, vh, pw, ph, 'open', dpr));
  }
}

SCENARIOS.push({
  // 1024 wide with both panels open leaves about 220 px of canvas: a 100 in
  // poster fits below 0.2.
  id: 'zoom-out-below-floor', claim: 'H2',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1024, height: 768 }, poster: { w: 100, h: 72 } });
    try {
      await setGuidelines(page, true);
      const fit = await zoomNow(page);
      if (!(fit < 0.3)) throw new Error(`precondition: a fit below 0.3, got ${fit}`);
      await page.getByRole('button', { name: 'Zoom out' }).click();
      await page.waitForTimeout(300);
      const after = await zoomNow(page);
      return { observed: after > fit + 1e-6, fit, afterZoomOut: after };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  id: 'pinch-out-below-floor', claim: 'H3',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1024, height: 768 }, poster: { w: 100, h: 72 } });
    try {
      await setGuidelines(page, true);
      const fit = await zoomNow(page);
      if (!(fit < 0.2)) throw new Error(`precondition: a fit below 0.2, got ${fit}`);
      const box = await page.locator('[data-postr-canvas-outer]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 60); // positive deltaY = pinch out (zoom out)
      await page.keyboard.up('Control');
      await page.waitForTimeout(300);
      const after = await zoomNow(page);
      return { observed: after > fit + 1e-6, fit, afterPinchOut: after };
    } finally {
      await context.close();
    }
  },
});
for (const [vw, vh] of VIEWPORTS) {
  SCENARIOS.push({
    id: `guidelines-on-open-${vw}`, claim: 'H4',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: vw, height: vh }, poster: { w: 48, h: 36 } });
      try {
        const m = await measure(page);
        return { observed: vw < 1600 && m.guidelinesOpen, guidelinesOpen: m.guidelinesOpen, view: m.view };
      } finally {
        await context.close();
      }
    },
  });
}
// A copy of the first text block parked 15 in past the right edge and 40 in
// below the sheet, the way people use the workspace as a pasteboard: far
// enough that a fitted canvas still scrolls both ways.
const parkOffSheet = (doc) => {
  const text = doc.blocks.find((b) => b.type === 'text');
  const parked = { ...text, id: 'zq-parked', x: doc.widthIn * 10 + 150, y: doc.heightIn * 10 + 400 };
  return { ...doc, blocks: [...doc.blocks, parked] };
};
for (const variant of ['plain', 'pasteboard']) {
  SCENARIOS.push({
    id: `fit-after-scroll-${variant}`, claim: 'H5',
    async run(h) {
      const { context, page } = await openEditor(h, {
        viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 },
        editDoc: variant === 'pasteboard' ? parkOffSheet : undefined,
      });
      try {
        for (let i = 0; i < 3; i += 1) {
          await page.getByRole('button', { name: 'Zoom in' }).click();
          await page.waitForTimeout(120);
        }
        const scrolled = await page.evaluate(() => {
          const o = document.querySelector('[data-postr-canvas-outer]');
          o.scrollLeft = o.scrollWidth;
          o.scrollTop = o.scrollHeight;
          return { x: o.scrollLeft, y: o.scrollTop };
        });
        if (!(scrolled.x > 0 || scrolled.y > 0)) throw new Error(`precondition: scrolled, got ${JSON.stringify(scrolled)}`);
        await page.waitForTimeout(200);
        await clickFit(page);
        const afterFit = await measure(page);
        if (variant === 'pasteboard' && !(afterFit.overflow.x > 0 && afterFit.overflow.y > 0)) {
          throw new Error(`precondition: the parked block makes the fitted canvas scroll both ways, got ${JSON.stringify(afterFit.overflow)}`);
        }
        return { observed: afterFit.hiddenMax > 0.5, scrolled, afterFit };
      } finally {
        await context.close();
      }
    },
  });
}
for (const vw of [900, 860]) {
  SCENARIOS.push({
    // With both panels open (804 px) a 900 px window leaves 96 px of canvas,
    // an 860 px one 56 px: under a 128 px gutter, and under the old 60.
    id: `fit-narrow-canvas-${vw}`, claim: 'H6',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: vw, height: 800 }, poster: { w: 48, h: 36 } });
      try {
        await setGuidelines(page, true);
        await clickFit(page);
        const afterFit = await measure(page);
        return {
          observed: afterFit.zoom >= 1 || afterFit.hiddenMax > 0.5 || Math.max(afterFit.overflow.x, afterFit.overflow.y) > 0,
          afterFit,
        };
      } finally {
        await context.close();
      }
    },
  });
}
// The title moved flush with the sheet's top edge (y = 0), where a user can
// drag any block.
const titleAtTop = (doc) => ({
  ...doc,
  blocks: doc.blocks.map((b) => (b.type === 'title' ? { ...b, y: 0 } : b)),
});
for (const [vw, vh] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
  for (const [pw, ph] of [[48, 36], [24, 36]]) {
    for (const where of ['template', 'top']) {
      SCENARIOS.push({
        id: `handles-${vw}x${vh}-${pw}x${ph}-${where}`, claim: 'Hh',
        async run(h) {
          const { context, page } = await openEditor(h, {
            viewport: { width: vw, height: vh }, poster: { w: pw, h: ph },
            editDoc: where === 'top' ? titleAtTop : undefined,
          });
          try {
            await clickFit(page);
            const title = page.locator('#poster-canvas [data-block-id]', { hasText: 'ZQTITLE' }).first();
            const tb = await title.boundingBox();
            // Select it the way a user does: a click near its left end.
            await page.mouse.click(tb.x + 6, tb.y + tb.height / 2);
            await page.waitForTimeout(250);
            const got = await page.evaluate(() => {
              const outer = document.querySelector('[data-postr-canvas-outer]').getBoundingClientRect();
              const block = [...document.querySelectorAll('#poster-canvas [data-block-id]')]
                .find((el) => el.textContent.includes('ZQTITLE'));
              const row = block && block.querySelector('[data-postr-selection-ui]');
              return row ? { rowTop: row.getBoundingClientRect().top - outer.top } : null;
            });
            if (!got) throw new Error('precondition: the title is selected (no handle row found)');
            const zoom = await zoomNow(page);
            return { observed: got.rowTop < 24, rowTop: Math.round(got.rowTop * 100) / 100, zoom };
          } finally {
            await context.close();
          }
        },
      });
    }
  }
}
SCENARIOS.push({
  id: 'ctl-phone-share', control: true,
  async run(h) {
    const { context, page } = await openEditor(h, {
      viewport: { width: 375, height: 812 }, poster: { w: 48, h: 36 }, route: (row) => `/s/${row.share_slug}`,
      ownedByOther: true,
    });
    try {
      const m = await measure(page);
      const onShare = await page.evaluate(() => location.pathname.startsWith('/s/'));
      return { ok: onShare && m.view.w > 0 && m.hiddenMax <= 0.5, onShare, ...m };
    } finally {
      await context.close();
    }
  },
});

const list = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));
if (ONLY && list.length !== ONLY.length) fail(`unknown --only id: ${ONLY.filter((id) => !SCENARIOS.some((s) => s.id === id))}`);
const h = await startHarness({ name: 'fit-check', port: PORT }).catch(fail);
const results = [];
let errors = 0;
try {
  for (const sc of list) {
    try {
      const r = await sc.run(h);
      results.push({ id: sc.id, claim: sc.claim ?? null, control: !!sc.control, ...r });
      const verdict = sc.control ? (r.ok ? 'CONTROL-OK' : 'CONTROL-FAIL') : r.observed ? 'OBSERVED' : 'not observed';
      if (sc.control && !r.ok) errors += 1;
      log(`[${verdict}] ${sc.id} ${JSON.stringify(r.afterFit ? { hidden: r.afterFit.hidden, overflow: r.afterFit.overflow, zoom: r.afterFit.zoom, view: r.afterFit.view, guidelinesOpen: r.afterFit.guidelinesOpen, rulerError: r.afterFit.rulerError } : r)}`);
    } catch (e) {
      errors += 1;
      results.push({ id: sc.id, error: String(e).slice(0, 300) });
      log(`[ERROR] ${sc.id} ${String(e).slice(0, 200)}`);
    }
  }
} finally {
  await h.stop();
}
const byClaim = {};
for (const r of results.filter((x) => x.claim)) {
  byClaim[r.claim] ??= { observed: 0, of: 0 };
  byClaim[r.claim].of += 1;
  if (r.observed) byClaim[r.claim].observed += 1;
}
const mech = results.filter((r) => r.claim === 'H1');
// The ruler guard counts as its own claim, so a regression fails the run.
const rulerRuns = mech.filter((r) => typeof r.rulerFilled === 'number');
if (rulerRuns.length) {
  byClaim.Hr = { observed: rulerRuns.filter((r) => r.rulerRegressed).length, of: rulerRuns.length };
}
const summary = {
  git: h.git, claims: byClaim,
  mechanism132: `${mech.filter((r) => r.mechanism).length} of ${mech.length}`,
  scrollsAfterFit: `${mech.filter((r) => r.scrolls).length} of ${mech.length}`,
  rulerError: (() => {
    const span = (k) => {
      const v = mech.map((r) => r[k]).filter((x) => typeof x === 'number');
      return v.length ? { min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
    };
    return { filledAxis: span('rulerFilled'), otherAxis: span('rulerOther') };
  })(),
  errors,
};
fs.writeFileSync(path.join(h.out, 'results.json'), JSON.stringify({ summary, results }, null, 2));
log(`[harness] ${JSON.stringify(summary)}`);
const INFO_CLAIMS = new Set(['Hh']);
const exit = errors ? 2
  : Object.entries(byClaim).some(([claim, c]) => !INFO_CLAIMS.has(claim) && c.observed > 0) ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(h.out, 'results.json')}`);
process.exit(exit);
