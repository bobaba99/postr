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
 *       plan item 4). Update this guard when item 4 fixes the rulers. While
 *       the rulers are hidden (RULERS_ENABLED) it measures nothing, and the
 *       run prints that instead of the claim.
 *   H4k with the guidelines panel closed (clipped to zero width, not
 *       removed), the keyboard still reaches controls inside it: focus
 *       lands on something nobody can see. The same for the sidebar is
 *       INFORMATION (claim H4k-sidebar), handed on, not fixed here.
 *   Ht  a first-time user's onboarding tour highlights something that is
 *       not visible (less than half of the highlighted area shows the
 *       target), leaves a dimming strip over its own highlight, or puts
 *       its tooltip outside the window: the last step
 *       (the guidelines panel or its toggle), the export step, and a
 *       sidebar step after the user collapsed the sidebar mid-tour
 *   Hp  the tour's highlight is not ON its target: more than 8 px from the
 *       target's box once things settle (a sidebar step after the tour
 *       reopened a collapsed sidebar; the last step after the user opened
 *       the panel from the highlighted toggle)
 *   Hr2 keyboard focus lands on a button that draws no focus ring
 *       (outline-style none while :focus-visible matches)
 *   Hb  after Fit, the out-of-bounds banner reaches down over the sheet
 *   Hw  opening the guidelines panel scrolls its clipped wrapper (a wipe,
 *       not a slide)
 *   Hk2 a held Enter on the panel's Show toggle flips the panel more than once
 *   Hr3 a rail tab's, or any data-focus-inset button's (guidelines header and
 *       Save as, author ▲ ▼ ×, Post comment), focus ring is drawn outside it
 *       (where its container clips it)
 *   Ht6 the tour's step 6 does not show the Issues tab on a poster with issues
 *   Hts after a window resize the tour's dimming stops short of the window
 *   Hf  closing the guidelines panel from the keyboard, with focus inside
 *       it, or opening it from its focused toggle, leaves focus on <body>
 *       or on something invisible. The sidebar's case is INFORMATION
 *       (claim Hf-sidebar), handed on.
 *   Hh  INFORMATION, not counted in the exit code: a selected block's
 *       handle row, above a block at the top of the sheet, starts under
 *       the 24 px top ruler after Fit. Until fix 19 the row was drawn in
 *       the sheet's units, 24 × zoom px above its block; since fix 19
 *       (docs/fixes/19-controls-one-size.md) it starts 38 px above the
 *       block at every zoom, inside the 64 px gutter. The rulers are
 *       hidden (RULERS_ENABLED); item 4 re-measures this when they return.
 *   Control: the phone share view (its gutter matches its padding) hides
 *   nothing. Skipped (printed as [skipped], not counted, never an error)
 *   on a tree that hides sharing, read at run time: the share link
 *   /s/<slug> is sent elsewhere (fix 23 sends it to /) and the tree's
 *   src/config/features.ts sets SHARING_ENABLED = false. A redirect that
 *   the switch does not explain is an error (exit 2).
 *
 * RUN (from apps/web)
 *   node scripts/fit-check.mjs [--only id,id]
 *   env PORT (default 5261), OUT_DIR, POSTR_REPO, POSTR_MUTANT (lib/editorHarness.mjs)
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
import { RouteRedirected, log, openEditor, sourceFlag, startHarness } from './lib/editorHarness.mjs';

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
/**
 * Open or close the guidelines panel, whatever its first state. The state is
 * read from the "Show" toggle, which exists only while the panel is closed:
 * a closed panel keeps its own "Hide" button in the page, clipped to zero
 * width, so that button's presence says nothing.
 */
async function setGuidelines(page, open) {
  const isOpen = !(await page.$('[title="Show poster guidelines"]'));
  if (isOpen === open) return;
  await page.click(open ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]');
  await page.waitForTimeout(600); // the panel's 280 ms width transition, then the re-fit
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

// The two rails collapse to zero width rather than leaving the page. Each:
// how to close it, a control inside it, and the toggle that reopens it.
const RAILS = {
  guidelines: {
    close: (page) => setGuidelines(page, false),
    inner: '[title="Hide guidelines"]',
    reveal: '[title="Show poster guidelines"]',
  },
  sidebar: {
    close: async (page) => {
      if (await page.$('[title="Show sidebar (⌘/)"]')) return;
      await page.click('[title="Hide sidebar (⌘/)"]');
      await page.waitForTimeout(600);
    },
    inner: '[title="Hide sidebar (⌘/)"]',
    reveal: '[title="Show sidebar (⌘/)"]',
  },
};
for (const [rail, r] of Object.entries(RAILS)) {
  for (const vw of [1280, 1920]) {
    SCENARIOS.push({
      id: `${rail}-closed-keyboard-${vw}`, claim: rail === 'sidebar' ? 'H4k-sidebar' : 'H4k',
      async run(h) {
        const { context, page } = await openEditor(h, { viewport: { width: vw, height: 800 }, poster: { w: 48, h: 36 } });
        try {
          await r.close(page);
          // The rail's wrapper: its inner control's nearest ancestor drawn at zero width.
          const wrapper = await page.evaluateHandle((sel) => {
            let el = document.querySelector(sel);
            while (el && el.getBoundingClientRect().width !== 0) el = el.parentElement;
            return el;
          }, r.inner);
          if (!(await wrapper.evaluate((w) => w !== null))) throw new Error(`precondition: the closed ${rail} is found, at zero width`);
          const focusable = await wrapper.evaluate((w) => [...w.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
            .filter((el) => el.tabIndex >= 0 && !el.closest('[inert]')).length);
          // A keyboard user on the visible toggle that reopens the rail presses
          // Shift+Tab: the closed rail comes before it in the page. (A Tab walk
          // from the top is no instrument here: it gets stuck in a table cell
          // on the poster, and where it starts depends on what was last
          // clicked.)
          await page.focus(r.reveal);
          let reached = 0;
          for (let i = 0; i < 3; i += 1) {
            await page.keyboard.press('Shift+Tab');
            if (await wrapper.evaluate((w) => w.contains(document.activeElement))) reached += 1;
          }
          return { observed: reached > 0, reached, focusable };
        } finally {
          await context.close();
        }
      },
    });
  }
}
/**
 * The tour's highlight (its pulsing outline) against what is really on screen
 * there: the share of a 7 x 7 grid of points inside it, and inside the
 * window, whose topmost element lies within `wanted` (a list of selectors).
 */
async function tourHighlight(page, wanted) {
  return page.evaluate((sels) => {
    const pulse = [...document.querySelectorAll('div')].find((d) => d.style.animation.includes('postr-tour-pulse'));
    if (!pulse) return null;
    const r = pulse.getBoundingClientRect();
    const targets = sels.flatMap((sel) => [...document.querySelectorAll(sel)]);
    let hit = 0;
    let n = 0;
    for (let i = 1; i <= 7; i += 1) {
      for (let j = 1; j <= 7; j += 1) {
        n += 1;
        const x = r.left + (r.width * i) / 8;
        const y = r.top + (r.height * j) / 8;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const el = document.elementFromPoint(x, y);
        if (el && targets.some((t) => t.contains(el))) hit += 1;
      }
    }
    const tip = [...document.querySelectorAll('button')].find((b) => /^(Next →|Done)$/.test(b.textContent.trim()));
    let box = tip;
    while (box && getComputedStyle(box).position !== 'fixed') box = box.parentElement;
    const t = box ? box.getBoundingClientRect() : null;
    const round = (v) => Math.round(v * 10) / 10;
    // The dimming strips must leave the highlight clear: the area (px²)
    // where any strip covers the highlight, inside the window.
    const hl = Math.max(0, r.left);
    const ht = Math.max(0, r.top);
    const hr = Math.min(innerWidth, r.right);
    const hb = Math.min(innerHeight, r.bottom);
    let dimmedOver = 0;
    for (const d of document.querySelectorAll('div')) {
      if (d.style.zIndex !== '10000' || d.style.position !== 'fixed') continue;
      const q = d.getBoundingClientRect();
      const w = Math.min(hr, q.right) - Math.max(hl, q.left);
      const hgt = Math.min(hb, q.bottom) - Math.max(ht, q.top);
      if (w > 0 && hgt > 0) dimmedOver += w * hgt;
    }
    return {
      dimmedOver: Math.round(dimmedOver),
      highlight: { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height) },
      visibleShare: Math.round((hit / n) * 100) / 100,
      tooltipInWindow: t ? t.left >= 0 && t.top >= 0 && t.right <= innerWidth && t.bottom <= innerHeight : null,
    };
  }, wanted);
}
const tourNext = async (page) => {
  await page.getByRole('button', { name: /^(Next →|Done)$/ }).click();
  await page.waitForTimeout(400);
};
const GUIDELINES_TARGETS = ['[data-postr-guidelines]', '[title="Show poster guidelines"]'];
for (const vw of [1280, 1440, 1599, 1600, 1920]) {
  SCENARIOS.push({
    id: `tour-last-step-${vw}`, claim: 'Ht',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: vw, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
      try {
        await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
        let steps = 1;
        while (await page.getByRole('button', { name: 'Next →' }).count()) {
          await tourNext(page);
          steps += 1;
          if (steps > 20) throw new Error('the tour never reached its last step');
        }
        const got = await tourHighlight(page, GUIDELINES_TARGETS);
        if (!got) throw new Error('precondition: the last step shows a highlight');
        return { observed: got.visibleShare < 0.5 || got.tooltipInWindow === false || got.dimmedOver > 0, steps, ...got };
      } finally {
        await context.close();
      }
    },
  });
}
for (const vw of [1280, 1440, 1920]) {
  SCENARIOS.push({
    // Step 7 of 8: the .postr export button, in the sidebar's Export tab.
    id: `tour-export-step-${vw}`, claim: 'Ht',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: vw, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
      try {
        await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
        for (let i = 0; i < 6; i += 1) await tourNext(page);
        await page.waitForTimeout(400);
        const got = await tourHighlight(page, ['[data-postr-export-postr]']);
        if (!got) throw new Error('precondition: step 7 shows a highlight');
        return { observed: got.visibleShare < 0.5 || got.tooltipInWindow === false || got.dimmedOver > 0, ...got };
      } finally {
        await context.close();
      }
    },
  });
}
/** How far the tour's highlight is from `sel`'s box (the highlight is padded by 6 px). */
async function highlightOffset(page, sel) {
  return page.evaluate((s) => {
    const pulse = [...document.querySelectorAll('div')].find((d) => d.style.animation.includes('postr-tour-pulse'));
    const el = document.querySelector(s);
    if (!pulse || !el) return null;
    const p = pulse.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    return Math.round(Math.max(
      Math.abs(p.left + 6 - t.left), Math.abs(p.top + 6 - t.top),
      Math.abs(p.right - 6 - t.right), Math.abs(p.bottom - 6 - t.bottom),
    ) * 10) / 10;
  }, sel);
}
SCENARIOS.push({
  // ⌘/ collapses the sidebar on step 1; Next goes to step 2, the import
  // tile in the sidebar, which the tour opens again.
  id: 'tour-reopened-sidebar-step2', claim: 'Hp',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      await page.keyboard.press('Meta+/');
      await page.waitForTimeout(600);
      if (!(await page.$('[title="Show sidebar (⌘/)"]'))) throw new Error('precondition: the sidebar collapsed');
      await tourNext(page);
      await page.waitForTimeout(600);
      const offset = await highlightOffset(page, '[data-postr-import-tile]');
      if (offset === null) throw new Error('precondition: a highlight and the import tile');
      return { observed: offset > 8, offset };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // Step 1's target is the canvas. Zoomed in, the canvas is taller than its
  // own scroll box, and scrolling it into view moved the user's canvas (the
  // step 11 claims audit of fix 03 found this path: 0,0 -> 64,64 px with
  // scrollIntoView). The tour must leave the user's scroll alone.
  id: 'tour-back-zoomed-keeps-scroll', claim: 'Hp',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      await tourNext(page); // step 2
      for (let i = 0; i < 8; i += 1) await page.click('[aria-label="Zoom in"]');
      await page.waitForTimeout(300);
      const scroll = () => page.evaluate(() => {
        const el = document.querySelector('[data-postr-canvas-outer]');
        return el ? { x: el.scrollLeft, y: el.scrollTop, tall: el.scrollHeight > el.clientHeight } : null;
      });
      const before = await scroll();
      if (!before?.tall) throw new Error('precondition: the zoomed canvas scrolls');
      await page.getByRole('button', { name: 'Back' }).click(); // step 1, the canvas
      await page.waitForTimeout(800);
      const after = await scroll();
      const moved = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
      return { observed: moved > 0.5, moved, before, after };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // As tour-reopened-sidebar-step2, but measuring the sidebar itself: the
  // tour scrolls its target into view while the sidebar is still sliding
  // open. scrollIntoView also scrolled the sidebar's clipping wrappers
  // sideways, so the panel stays shifted left after the slide; the
  // highlight follows the target, so its offset alone cannot show it.
  id: 'tour-reopened-sidebar-sideways', claim: 'Hp',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      await page.keyboard.press('Meta+/');
      await page.waitForTimeout(600);
      if (!(await page.$('[title="Show sidebar (⌘/)"]'))) throw new Error('precondition: the sidebar collapsed');
      await tourNext(page);
      await page.waitForTimeout(800);
      const got = await page.evaluate(() => {
        const sb = document.querySelector('[data-postr-sidebar]');
        if (!sb) return null;
        let scrolledSideways = 0;
        for (let el = sb; el; el = el.parentElement) scrolledSideways = Math.max(scrolledSideways, el.scrollLeft);
        return { scrolledSideways, sidebarLeft: Math.round(sb.getBoundingClientRect().left * 10) / 10 };
      });
      if (!got) throw new Error('precondition: the sidebar is open again');
      return { observed: got.scrolledSideways > 0 || got.sidebarLeft < -0.5, ...got };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // The last step below 1600 px highlights the closed panel's toggle; the
  // user clicks it, as the step invites.
  id: 'tour-step8-open-panel', claim: 'Hp',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      while (await page.getByRole('button', { name: 'Next →' }).count()) await tourNext(page);
      if (!(await page.$('[title="Show poster guidelines"]'))) throw new Error('precondition: the panel is closed at the last step');
      await page.click('[title="Show poster guidelines"]');
      await page.waitForTimeout(700);
      const offset = await highlightOffset(page, '[data-postr-guidelines]');
      const got = await tourHighlight(page, ['[data-postr-guidelines]']);
      return { observed: offset === null || offset > 8 || got.dimmedOver > 0, offset, ...got };
    } finally {
      await context.close();
    }
  },
});
for (const which of ['open', 'close']) {
  SCENARIOS.push({
    // Keyboard: Enter on the focused toggle; focus moves to the other button.
    id: `focus-ring-guidelines-${which}`, claim: 'Hr2',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: which === 'open' ? 1280 : 1920, height: 900 }, poster: { w: 48, h: 36 } });
      try {
        const from = which === 'open' ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]';
        await page.focus(from);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
        const got = await page.evaluate(() => {
          const a = document.activeElement;
          return {
            on: a?.getAttribute('title') ?? a?.tagName,
            focusVisible: !!a && a.matches(':focus-visible'),
            outline: a ? getComputedStyle(a).outlineStyle : null,
          };
        });
        if (got.on === 'BODY') throw new Error(`precondition: focus moved to a button, got ${JSON.stringify(got)}`);
        return { observed: got.focusVisible && got.outline === 'none', ...got };
      } finally {
        await context.close();
      }
    },
  });
}
SCENARIOS.push({
  // Every button with an inline outline-style (an `all: unset`) in the editor, focused
  // after a key press (so :focus-visible applies, as for a keyboard user):
  // how many draw no ring.
  id: 'focus-ring-sweep', claim: 'Hr2',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1920, height: 1080 }, poster: { w: 48, h: 36 } });
    try {
      await page.keyboard.press('Shift');
      const got = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
          // `all: unset` inline expands into every longhand, outline-style
          // included: an inline outline-style is the mark of one.
          .filter((b) => b.style.outlineStyle !== '' && b.getClientRects().length > 0 && !b.closest('[inert]'));
        let noRing = 0;
        let visibleFocus = 0;
        const examples = [];
        for (const b of buttons) {
          b.focus();
          if (document.activeElement !== b || !b.matches(':focus-visible')) continue;
          visibleFocus += 1;
          if (getComputedStyle(b).outlineStyle === 'none') {
            noRing += 1;
            if (examples.length < 5) examples.push(b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20));
          }
        }
        return { buttons: buttons.length, visibleFocus, noRing, examples };
      });
      if (got.visibleFocus === 0) throw new Error(`precondition: :focus-visible matched on some button, got ${JSON.stringify(got)}`);
      return { observed: got.noRing > 0, ...got };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // The user collapses the sidebar (⌘/) during the tour, then goes on.
  id: 'tour-sidebar-collapsed', claim: 'Ht',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      await tourNext(page); // step 2: the import tile, in the sidebar's Layout tab
      await page.keyboard.press('Meta+/');
      await page.waitForTimeout(600);
      if (!(await page.$('[title="Show sidebar (⌘/)"]'))) throw new Error('precondition: the sidebar collapsed');
      await tourNext(page); // step 3: the Authors tab, in the sidebar
      const got = await tourHighlight(page, ['[data-postr-sidebar]']);
      if (!got) throw new Error('precondition: the step shows a highlight');
      return { observed: got.visibleShare < 0.5 || got.tooltipInWindow === false || got.dimmedOver > 0, ...got };
    } finally {
      await context.close();
    }
  },
});
/** Where keyboard focus is, and whether anyone can see it. */
async function focusNow(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { on: 'body', visible: false };
    let r = a.getBoundingClientRect();
    let vis = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let el = a.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflow !== 'visible' || cs.display === 'none') {
        const c = el.getBoundingClientRect();
        vis = { left: Math.max(vis.left, c.left), top: Math.max(vis.top, c.top), right: Math.min(vis.right, c.right), bottom: Math.min(vis.bottom, c.bottom) };
      }
    }
    vis = { left: Math.max(vis.left, 0), top: Math.max(vis.top, 0), right: Math.min(vis.right, innerWidth), bottom: Math.min(vis.bottom, innerHeight) };
    const name = a.getAttribute('title') || a.getAttribute('aria-label') || a.tagName;
    return { on: name, visible: vis.right - vis.left > 1 && vis.bottom - vis.top > 1 };
  });
}
const RAIL_CLOSE = {
  sidebar: { focus: '[aria-label="Poster name"]', close: (page) => page.keyboard.press('Meta+/') },
  guidelines: { focus: '[title="Hide guidelines"]', close: (page) => page.keyboard.press('Enter') },
};
for (const [rail, r] of Object.entries(RAIL_CLOSE)) {
  SCENARIOS.push({
    id: `${rail}-close-focus`, claim: rail === 'sidebar' ? 'Hf-sidebar' : 'Hf',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: 1920, height: 1080 }, poster: { w: 48, h: 36 } });
      try {
        if (rail === 'guidelines') await setGuidelines(page, true);
        await page.focus(r.focus);
        const before = await focusNow(page);
        if (!before.visible) throw new Error(`precondition: focus inside the open ${rail}, got ${JSON.stringify(before)}`);
        await r.close(page);
        await page.waitForTimeout(600);
        const after = await focusNow(page);
        return { observed: !after.visible, before, after };
      } finally {
        await context.close();
      }
    },
  });
}
SCENARIOS.push({
  // Opening the closed panel from its focused toggle (Enter), at 1280 where
  // it starts closed: the toggle leaves the page as the panel opens.
  id: 'guidelines-open-focus', claim: 'Hf',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } });
    try {
      await setGuidelines(page, false);
      await page.focus('[title="Show poster guidelines"]');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      const after = await focusNow(page);
      const open = !(await page.$('[title="Show poster guidelines"]'));
      if (!open) throw new Error('precondition: Enter opened the panel');
      return { observed: !after.visible, after };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // Control for Hf and Hr2: a MOUSE click on the "Show" toggle. Chromium
  // focuses a clicked button, so focus follows into the panel, but no ring
  // may show (:focus-visible is for the keyboard).
  id: 'ctl-guidelines-mouse-open', control: true,
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } });
    try {
      await setGuidelines(page, false);
      const box = await page.locator('[title="Show poster guidelines"]').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      const got = await page.evaluate(() => {
        const a = document.activeElement;
        return { on: a?.getAttribute('title') ?? a?.tagName, focusVisible: !!a && a.matches(':focus-visible') };
      });
      return { ok: !got.focusVisible, ...got };
    } finally {
      await context.close();
    }
  },
});
// Review of fix 03 (record section 9): one scenario per follow-up that
// jsdom cannot see.
const offSheet = (n) => (doc) => ({
  ...doc,
  blocks: doc.blocks.map((b, i) => (b.type !== 'title' && i <= n + 1 && i > 1 ? { ...b, x: doc.widthIn * 10 + 20 } : b)),
});
for (const [vw, vh] of [[1280, 800], [1440, 900]]) {
  SCENARIOS.push({
    id: `oob-banner-${vw}x${vh}`, claim: 'Hb',
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: vw, height: vh }, poster: { w: 36, h: 48 }, editDoc: offSheet(3) });
      try {
        await clickFit(page);
        const got = await page.evaluate(() => {
          const b = document.querySelector('[data-postr-oob-banner]') ?? [...document.querySelectorAll('strong')].find((x) => /outside poster bounds/.test(x.textContent))?.parentElement;
          const sheet = document.getElementById('poster-canvas').getBoundingClientRect();
          return b ? { bannerBottom: Math.round(b.getBoundingClientRect().bottom * 10) / 10, sheetTop: Math.round(sheet.top * 10) / 10 } : null;
        });
        if (!got) throw new Error('precondition: the banner shows');
        return { observed: got.bannerBottom > got.sheetTop, ...got };
      } finally {
        await context.close();
      }
    },
  });
}
SCENARIOS.push({
  id: 'guidelines-open-slide', claim: 'Hw',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 } });
    try {
      await setGuidelines(page, false);
      await page.focus('[title="Show poster guidelines"]');
      const sample = page.evaluate(() => new Promise((resolve) => {
        const panel = document.querySelector('[data-postr-guidelines]');
        let wrap = panel.parentElement;
        while (wrap && getComputedStyle(wrap).overflow !== 'hidden') wrap = wrap.parentElement;
        let max = 0;
        const t0 = performance.now();
        const tick = () => {
          max = Math.max(max, wrap.scrollLeft);
          if (performance.now() - t0 < 500) requestAnimationFrame(tick); else resolve(max);
        };
        requestAnimationFrame(tick);
      }));
      await page.keyboard.press('Enter');
      const maxScrollLeft = await sample;
      return { observed: maxScrollLeft > 0, maxScrollLeft };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  id: 'guidelines-held-enter', claim: 'Hk2',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 } });
    try {
      await setGuidelines(page, false);
      await page.focus('[title="Show poster guidelines"]');
      const isOpen = () => page.evaluate(() => !document.querySelector('[title="Show poster guidelines"]'));
      let flips = 0;
      let last = await isOpen();
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.down('Enter'); // after the first, Playwright sends repeat: true
        await page.waitForTimeout(60);
        const now = await isOpen();
        if (now !== last) flips += 1;
        last = now;
      }
      await page.keyboard.up('Enter');
      if (flips === 0) throw new Error('precondition: the first Enter opens the panel');
      return { observed: flips > 1, flips };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // Every button the fix marks data-focus-inset, in each of its five places,
  // plus a rail tab (its own inset rule). A missing site is an instrument
  // failure, not a pass.
  id: 'focus-ring-inset', claim: 'Hr3',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1920, height: 1080 }, poster: { w: 48, h: 36 } });
    try {
      // Keyboard modality first, so a programmatic focus matches :focus-visible.
      // `where` is a selector; { text } a sidebar button's whole text; or
      // { author } the first author row's ▲, ▼ or × (found from the row's ▲,
      // not by the attribute under test: the affiliation list has its own ×).
      // Every element is found by something other than data-focus-inset, so
      // removing the attribute cannot move the check onto a sibling that
      // still has it (the code review found the headers did exactly that).
      const read = async (where) => {
        await page.keyboard.press('Shift');
        return page.evaluate((w) => {
          const sidebarButton = (t) => [...document.querySelectorAll('[data-postr-sidebar] button')].find((b) => b.textContent.trim() === t);
          const authorRow = () => sidebarButton('▲')?.parentElement?.parentElement;
          const el = typeof w === 'string' ? document.querySelector(w)
            : w.header !== undefined ? document.querySelectorAll('[data-postr-section-header]')[w.header]
            : w.text ? sidebarButton(w.text)
            : w.author === 'remove' ? [...(authorRow()?.children ?? [])].find((c) => c.tagName === 'BUTTON')
            : sidebarButton(w.author);
          if (!el) return 'missing';
          el.focus();
          return el.matches(':focus-visible') ? getComputedStyle(el).outlineOffset : 'no :focus-visible';
        }, where);
      };
      const openTab = (name) => page.evaluate((n) => {
        [...document.querySelectorAll('button[data-postr-tab]')].find((b) => b.firstChild?.textContent === n)?.click();
      }, name);
      const byText = (t) => page.waitForFunction(
        (x) => [...document.querySelectorAll('[data-postr-sidebar] button')].some((b) => b.textContent.trim() === x), t, { timeout: 5000 },
      ).catch(() => {});
      const got = {};
      got.railTab = await read('button[data-postr-tab]');
      // All five section headers: the worst offset counts.
      const headers = await page.$$eval('[data-postr-section-header]', (els) => els.length);
      if (headers < 5) throw new Error(`precondition: 5 guidelines section headers, found ${headers}`);
      const offsets = [];
      for (let i = 0; i < headers; i += 1) offsets.push(await read({ header: i }));
      const unreadable = offsets.find((v) => v === 'missing' || v === 'no :focus-visible');
      if (unreadable) throw new Error(`precondition: could not focus every guidelines header (${unreadable})`);
      got.guidelinesHeaders = [...new Set(offsets)].join(' ');
      // "Save as..." sits in a section that may start closed (inert): open it.
      await page.evaluate(() => {
        const b = document.querySelector('[title="Save current checklist as a reusable template"]');
        let p = b?.closest('[inert]')?.parentElement;
        while (p && !p.firstElementChild?.matches('button[data-postr-section-header]')) p = p.parentElement;
        p?.firstElementChild.click();
      });
      await page.waitForFunction(() => !document.querySelector('[title="Save current checklist as a reusable template"]')?.closest('[inert]'), null, { timeout: 3000 }).catch(() => {});
      got.guidelinesSaveAs = await read('[title="Save current checklist as a reusable template"]');
      await openTab('authors');
      await byText('×');
      for (const [key, author] of [['authorUp', '▲'], ['authorDown', '▼'], ['authorRemove', 'remove']]) got[key] = await read({ author });
      // The comments tab exists only where sharing does (fix 23 switched it
      // off): read the tree's own switch, so a missing button is still an
      // error where the tab should be there.
      if (sourceFlag('SHARING_ENABLED') !== false) {
        await openTab('comments');
        await byText('Post comment');
        got.postComment = await read({ text: 'Post comment' });
      }
      const missing = Object.entries(got).filter(([, v]) => v === 'missing' || v === 'no :focus-visible');
      if (missing.length) throw new Error(`precondition: could not focus ${missing.map(([k, v]) => `${k} (${v})`).join(', ')}`);
      const outside = Object.entries(got).filter(([, v]) => v !== '-2px').map(([k]) => k);
      // (guidelinesHeaders lists the distinct offsets of all five; anything
      // but exactly "-2px" is outside.)
      const left = sourceFlag('SHARING_ENABLED') === false ? { leftOut: 'Post comment (the comments tab is hidden: SHARING_ENABLED is false)' } : {};
      return { observed: outside.length > 0, outside: outside.join(' ') || 'none', ...got, ...left };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  id: 'tour-step6-issues', claim: 'Ht6',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, editDoc: offSheet(1), tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      for (let i = 0; i < 5; i += 1) await tourNext(page);
      const step = await page.evaluate(() => [...document.querySelectorAll('span')].map((x) => x.textContent).find((t) => /^\d\/8$/.test(t)));
      if (step !== '6/8') throw new Error(`precondition: at step 6, got ${step}`);
      const shown = await page.evaluate(() => /out of bounds/i.test(document.querySelector('[data-postr-sidebar]')?.textContent ?? ''));
      return { observed: !shown, issuesTabShown: shown };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  id: 'tour-resize-strips', claim: 'Hts',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1280, height: 700 }, poster: { w: 48, h: 36 }, tour: true });
    try {
      await page.getByRole('button', { name: 'Next →' }).waitFor({ timeout: 5000 });
      await tourNext(page); // step 2
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(500);
      const got = await page.evaluate(() => {
        const strips = [...document.querySelectorAll('div')].filter((d) => d.style.zIndex === '10000' && d.style.position === 'fixed');
        const bottom = Math.max(...strips.map((d) => d.getBoundingClientRect().bottom));
        return { stripsBottom: Math.round(bottom), windowHeight: innerHeight };
      });
      return { observed: got.stripsBottom < got.windowHeight - 1, ...got };
    } finally {
      await context.close();
    }
  },
});
SCENARIOS.push({
  // Control for Hf: ⌘/ with focus outside the sidebar leaves focus alone.
  id: 'ctl-sidebar-close-focus-outside', control: true,
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1920, height: 1080 }, poster: { w: 48, h: 36 } });
    try {
      await page.focus('[aria-label="Zoom in"]');
      await page.keyboard.press('Meta+/');
      await page.waitForTimeout(600);
      const after = await focusNow(page);
      return { ok: after.on === 'Zoom in' && after.visible, after };
    } finally {
      await context.close();
    }
  },
});
for (const [rail, r] of Object.entries(RAILS)) {
  SCENARIOS.push({
    // Control for H4k: an OPEN rail's controls still take keyboard focus.
    id: `ctl-${rail}-open-keyboard`, control: true,
    async run(h) {
      const { context, page } = await openEditor(h, { viewport: { width: 1920, height: 900 }, poster: { w: 48, h: 36 } });
      try {
        if (rail === 'guidelines') await setGuidelines(page, true);
        await page.focus(r.inner);
        const focused = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), r.inner);
        return { ok: focused, focused };
      } finally {
        await context.close();
      }
    },
  });
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
    let opened;
    try {
      opened = await openEditor(h, {
        viewport: { width: 375, height: 812 }, poster: { w: 48, h: 36 }, route: (row) => `/s/${row.share_slug}`,
        ownedByOther: true,
      });
    } catch (e) {
      if (e instanceof RouteRedirected && sourceFlag('SHARING_ENABLED') === false) {
        return { skipped: `the app hides this page: ${e.wanted} was sent to ${e.landed}, and src/config/features.ts sets SHARING_ENABLED = false` };
      }
      throw e;
    }
    const { context, page } = opened;
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
      if (r.skipped) {
        results.push({ id: sc.id, skipped: r.skipped });
        log(`[skipped] ${sc.id} ${r.skipped}`);
        continue;
      }
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
} else if (mech.length) {
  // No ruler drew a 0" mark: the rulers are hidden (RULERS_ENABLED,
  // config/features.ts, 2026-09-30), so the guard measures nothing. Say so
  // rather than let it pass in silence.
  log('[INFO] Hr not measured: no ruler drew a 0" mark (the rulers are hidden)');
}
const summary = {
  git: h.git, mutant: h.mutant, claims: byClaim,
  skipped: results.filter((r) => r.skipped).map((r) => r.id),
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
const INFO_CLAIMS = new Set(['Hh', 'H4k-sidebar', 'Hf-sidebar']);
const exit = errors ? 2
  : Object.entries(byClaim).some(([claim, c]) => !INFO_CLAIMS.has(claim) && c.observed > 0) ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(h.out, 'results.json')}`);
process.exit(exit);
