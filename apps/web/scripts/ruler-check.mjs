#!/usr/bin/env node
/**
 * ruler-check.mjs — do the workspace rulers' inch marks sit on the poster's
 * inches? (docs/fixes/04-rulers-match-sheet.md)
 *
 * For every scenario it opens the editor the way a user does (a window size,
 * a poster size, the guidelines panel, the zoom buttons, the scroll) and
 * reads what is ON SCREEN: every tick of both rulers that is visible, its
 * inch read from the ruler's own labels (the 0", 5", 10" … marks and the
 * ticks' order between them), against where that inch of the sheet is on
 * screen: the sheet's edge plus inches × (the sheet's size on screen ÷ its
 * size in inches). Nothing is computed from the editor's code.
 *
 * CLAIMS (record 04 section 2), reported per scenario:
 *   error   — a tick's position less its inch on the sheet (the sheet's
 *             painted box, #poster-canvas), in px (and in inches); the
 *             defect is observed when any |error| is over half a device
 *             pixel plus layout's 1/64 px unit (0.5 / ratio + 1/64 px:
 *             0.516 px at a ratio of 1, 0.762 at 0.67; lib/frameRecorder.mjs
 *             tickLimit). The rulers' layers are rounded to the screen's
 *             whole device pixels (the step 10 review, R3-F1; the review of
 *             the port, R1-F1), which moves every tick by up to half a
 *             device pixel (INSPECTED, place() in WorkspaceRulers.tsx); a
 *             fixed 0.516 px limit read that rounding as the defect below a
 *             ratio of 1 (the review of the port, R1-F5: 0.52 to 0.53 px at
 *             0.67 in all three engines);
 *   printShown — file-print-media only: ruler bars, the corner and labels
 *             shown with the page under print media (the browser's own
 *             File › Print, which no key the app catches; the review of the
 *             port, R1-F3); observed when any is. Its control: on screen the
 *             same finder reads the two bars, the corner and labels;
 *   drift   — max − min error along one ruler (H3: 0 when the scale is right);
 *   residual — the error left after H1 + H2's prediction: 24 px (the bar's
 *             inset) less the sheet's centring offset (the sheet's position
 *             less the workarea's padded content edge, read from the page's
 *             layout). H1 + H2 explain the error when |residual| ≤ 0.5 px;
 *   gapIn   — the longest stretch at either end of a ruler's bar with no
 *             tick, in inches. Marks come every inch, so a gap over 1.02 in
 *             is a ruler that stopped drawing part of the way along (the
 *             completeness critic's gap: a stale canvas size); a ruler with
 *             no marks at all is the defect too.
 *   hintDrift — text-hint-follows-scroll only: how far the text editor's
 *             focus hint moves from its block when the canvas scrolls 60 px,
 *             in px; observed when > 2 px (a hint that follows moves up to
 *             0.73 px with sub-pixel layout, one that does not moves the
 *             whole 60 px; measured on this fix). The hint is placed during the
 *             editor's render, so it follows a scroll only through the
 *             editor's own re-render on scroll, which nothing else reads
 *             since the rulers read the scroll themselves (the step 9
 *             review of cause C, S9C-05). A hint that cannot be read is an
 *             instrument error (exit 2).
 * INFO (no effect on the exit): `grid` — how far the dark workspace grid's
 *   5-inch lines sit from the sheet's 5-inch lines, in px, from the page's
 *   layout and the grid's computed CSS (paint is not read). A sibling the
 *   completeness critic named; outside fix 04's scope (PLAN.md, Later).
 * CONTROL: after Fit the whole sheet is on screen (fix 03's guarantee, a
 * known answer), and every labelled tick agrees on the ruler's first inch;
 * if either fails, the instrument is not trusted (exit 2).
 * INFO in `info.controls` (controls-under-rulers-…, since the port onto
 *   main): a corner block's grabbable controls (lib/selectionControls.mjs)
 *   that a ruler bar covers, and by how much, to compare one tree with
 *   another (the bars take no pointer events, so this is read from boxes);
 *   in `info.showSidebar` (zoomed-in-3-sidebar-hidden-…): the Show sidebar
 *   button's box over the bars.
 * SKIPPED (printed as [skipped], not counted, never an error):
 *   share-desktop-1440x900 on a tree that hides sharing, read at run time:
 *   the share link /s/<slug> is sent elsewhere (fix 23 sends it to /) and
 *   the tree's src/config/features.ts sets SHARING_ENABLED = false. A
 *   redirect that the switch does not explain is an error (exit 2).
 *   A scenario that drives the guidelines panel (fit-…-open, fit-…-closed,
 *   capped-panel-close-10x10, frames-panel-close-…) on a tree with
 *   EDITOR_EXTRAS_ENABLED off (record 29): printed "skipped (switch off)"
 *   and counted on the summary line of that name (lib/editorHarness.mjs
 *   switchesOff).
 *
 * RUN (from apps/web; the tree's apps/web/.env must point at the harness's
 * fake backend, https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/ruler-check.mjs [--only id,id] [--list]
 *   (154 scenarios at rest, 51 of them the guidelines panel's; --list
 *   prints their ids and starts nothing. Since the port onto main: 1024 ×
 *   768 windows, the sidebar hidden before Fit (fit-…-nosidebar), hidden
 *   and shown again, windows resized at a manual zoom, and the 18
 *   controls-under-rulers readings, 6 of them their positive control.
 *   Since its review: ratios 0.67, 0.9 and 1.1, a browser zoom, and the
 *   page under print media, file-print-media)
 *   env PORT (default 5271), OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_BROWSER
 *   (chromium, firefox or webkit), POSTR_SCROLLBARS=classic (scrollbars that
 *   take space; Chromium and WebKit only) (lib/editorHarness.mjs)
 * EXIT 0 no error over the limit (0.516 px at a ratio of 1) and no gap over
 *      1.02 in anywhere · 1 the defect observed (some tick off by more than
 *      the limit, a ruler with a gap over 1.02 in or with no marks, the text
 *      hint over 2 px, or a ruler shown under print media) ·
 *      2 a scenario errored or a control failed
 *
 * PER-FRAME MODE (--frames; record 04, cause C). The claims above are read
 * at rest. These are read on every frame from the user's input until the
 * layout has been still for 8 frames (at least 40 frames), for the inputs
 * that move the sheet by a resize or a scroll, 13 scenarios: leaving
 * Preview (Escape, and Back to Editor; fitted and zoomed-and-scrolled);
 * leaving Preview by Escape after the window grew from 800×700 to
 * 2560×1440 while it hid the editor, and the window growing that much at
 * the zoom floor (the step 9-D review, D-01: the bars leave the marks, and
 * the rulers render them at once); a size preset (36×42 ↔ 42×42, and
 * 48×36 ↔ 24×36, which with POSTR_SCROLLBARS=classic adds and removes a
 * scrollbar); undoing a size change; the guidelines panel closing
 * (1920×1080, 48×36 and 36×48); the sidebar hiding; one pinch gesture
 * (20 ctrl+wheel steps); a 30 px wheel scroll; and an instant scroll of
 * 2.5 canvas heights at about 7.4× (a jump by script, or a scrollbar thumb
 * dragged fast). The last two reach the rulers only by their scroll
 * listener; the wheel's frames are main-thread frames only (see the
 * scenario). Since the port onto main, six frames-matrix-… scenarios more:
 * at 1024 × 768, 1280 × 800 and 1920 × 1080, the sidebar shown and hidden
 * (the top bar above the workspace in each), one event per input: Zoom in,
 * Zoom out, Fit, a pinch (8 ctrl+wheel steps), a 40 px wheel scroll, the
 * window 200 × 100 px larger and back, the sidebar toggled and toggled back,
 * leaving Preview by Escape (opened from the Export tab, so with the sidebar
 * shown), and a size change (24 × 36 ↔ 48 × 36 by the Layout tab with the
 * sidebar shown; with it hidden, the same change made, the sidebar hidden,
 * then Ctrl/Cmd+Z). Each frame is sampled after the page's
 * ResizeObserver callbacks and before that frame is painted
 * (lib/frameRecorder.mjs, ported from the first step 10 review's late sampler).
 *   stale frame — a frame that shows the editor in which some ruler tick is
 *             more than 0.5 px from its inch on the sheet's layout slot
 *             (the slot's edge + inch × the slot's width ÷ the sheet's width
 *             in inches), a ruler has no mark in its bar, or a stretch of
 *             a bar over 1.05 in has no tick (a partly blank ruler; the
 *             step 9-D review, D-02, found the judge blind to it);
 *   the defect is observed when any event has a stale frame. Reported per
 *   scenario: events with a stale frame (k of n), stale frames per event,
 *   the worst px, frames recorded; INFO: frames a rAF sample alone would
 *   call stale (`rafStale`), and ResizeObserver loop errors.
 * --own-rest judges each frame against the tree's own rest instead of 0:
 *   the rest model that fits the reading before the first event, 0 or the
 *   bar's 24 px inset less the sheet's centring (H1 + H2; main's rest). For
 *   a tree whose marks are off at rest (main), where 0 would call every
 *   frame stale.
 * CONTROLS (a failure is exit 2): the late sampler's known answer (two
 *   observers move an element in their callbacks, one created before the
 *   recording and one while it runs: the rAF sample sees the old place, the
 *   late sample the new, on the same frame); every judged frame's late
 *   sample from that frame's own rendering update; the input changed the
 *   layout (Preview left, the sheet resized, the canvas resized, the zoom
 *   or the scroll changed); the recording ended still; at rest after each event the slot
 *   and the painted sheet agree within 0.5 px (the judge's reference is
 *   where the sheet rests); with --own-rest, a rest model fits before the
 *   first event and after each one.
 * RUN  node scripts/ruler-check.mjs --frames [--own-rest] [--only id,id] [--list]
 *      (19 scenarios, 2 of them the guidelines panel's; --frames --list
 *      prints their ids)
 *      env as above, and RULER_FRAMES_REPS, which overrides the events per
 *      scenario. Writes frames-results.json in the output folder.
 * EXIT (per-frame mode) 0 no stale frame · 1 a stale frame observed ·
 *      2 a scenario errored or a control failed
 *
 * EXPORTS MODE (--exports; lib/rulerExports.mjs, its header has the claims
 * X1–X3 and controls): the print document, the thumbnail and the PowerPoint
 * file made with "Show ruler" on and off, through a signed-in term holder
 * at /p/new. EXIT 0 none holds a ruler or changes with them · 1 one does ·
 * 2 a control failed. Writes exports-results.json.
 *
 * BLIND SPOTS (the second step 10 review; R1-F8 and R1-F9 MEASURED by its reviewer
 * R1 on synthetic rulers in jsdom, R3-F1 by R3 in the browser). Both modes
 * read layout boxes, never paint (scripts/ruler-paint-check.mjs reads the
 * painted ticks at rest: smeared ones, and the painted 0" against the
 * painted sheet):
 *   - a bar that ends short of the canvas with its marks right reads clean
 *     (gaps are measured from the bar's own ends);
 *   - a tick's visible 1 px line drawn away from its mark's box reads clean
 *     (the box is read, not the line);
 *   - a bar painted at opacity 0, or covered by something else (the
 *     out-of-bounds banner), reads clean;
 *   - a tick painted smeared over two device pixels reads clean: before the
 *     layers were rounded to whole device pixels, 470 of 815 painted ticks
 *     on 7 layouts in Chromium and 461 of 815 in WebKit (R3-F1), while R3's
 *     run of this check read 0 of 83 over 0.5 px (WebKit with classic
 *     scrollbars, worst 0.02 px);
 *   - a missing interior mark makes the labels disagree on a ruler's first
 *     inch, which reads as an instrument error (exit 2), not as the defect.
 * The per-frame judge measures against the sheet's layout slot, the box the
 * rulers themselves read (R1-F8): while the painted sheet is off its slot
 * (today only during the entrance animation) it cannot see the rulers
 * disagree with what is painted. The at-rest mode reads the painted sheet,
 * and the rest control after each event (slot and painted sheet within
 * 0.5 px) bounds this.
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RouteRedirected, SWITCH_OFF, log, openEditor, sourceFlag, startHarness, switchOffReason, switchesOff } from './lib/editorHarness.mjs';
import { FRAME_SCENARIOS, runFrames } from './lib/rulerFrames.mjs';
import { tickLimit } from './lib/frameRecorder.mjs';
import { runExports } from './lib/rulerExports.mjs';
import { readControls } from './lib/selectionControls.mjs';
import { clickButton, hideSidebar, scrollTo, setGuidelines, settle } from './lib/rulerUi.mjs';

// A crash is an instrument failure (exit 2), never a finding: Node's own
// exit code for an uncaught error is 1, which here means "observed".
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    process.stderr.write(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 500)}\n`);
    process.exit(2);
  });
}

const PORT = Number(process.env.PORT ?? 5271);
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;
const FRAMES = args.includes('--frames');
const EXPORTS = args.includes('--exports');
const OWN_REST = args.includes('--own-rest');

/** Everything on screen that the claims need, read in the page. */
function measure(page, poster) {
  return page.evaluate(({ w: openedW, h: openedH }) => {
    let w = openedW;
    let h = openedH;
    const sheetEl = document.getElementById('poster-canvas');
    // The sheet's size in inches NOW (a scenario may change it): its own
    // width and height, in the editor's units of 1/10 in, before the zoom.
    if (sheetEl) { w = parseFloat(sheetEl.style.width) / 10; h = parseFloat(sheetEl.style.height) / 10; }
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const frame = document.querySelector('[data-postr-canvas-frame]');
    if (!sheetEl || !outer || !frame) return { error: 'no sheet, canvas or frame' };
    const s = sheetEl.getBoundingClientRect();
    const o = outer.getBoundingClientRect();
    const view = {
      left: o.left + outer.clientLeft, top: o.top + outer.clientTop,
      right: o.left + outer.clientLeft + outer.clientWidth, bottom: o.top + outer.clientTop + outer.clientHeight,
    };
    // The workarea is the frame's grandparent; its padding is the gutter the page lays out.
    const workarea = frame.parentElement.parentElement;
    const cs = getComputedStyle(workarea);
    const padLeft = parseFloat(cs.paddingLeft);
    const padTop = parseFloat(cs.paddingTop);
    const w0 = workarea.getBoundingClientRect();
    // A ruler's marks are the siblings of the marks that carry an inch label;
    // its bar is the nearest element around them that clips (the marks may
    // sit in a layer of their own inside it).
    const labels = [...document.querySelectorAll('span')].filter((sp) => /^-?\d+"$/.test(sp.textContent.trim()));
    const clipOf = (el) => {
      let e = el;
      while (e && getComputedStyle(e).overflow !== 'hidden') e = e.parentElement;
      return e;
    };
    const ruler = (vertical) => {
      const mine = labels.filter((sp) => (sp.style.writingMode === 'vertical-lr') === vertical);
      // Show ruler is on in every scenario, so a ruler with no labelled marks
      // is the defect (the rulers drew nothing), not a failed instrument.
      if (!mine.length) return { noMarks: true };
      const ticks = [...mine[0].parentElement.parentElement.children];
      const bar = clipOf(mine[0].parentElement.parentElement);
      if (!bar) return { error: 'no clipping ruler bar around the marks' };
      const bases = new Set(mine.map((sp) => Number(sp.textContent.trim().replace('"', '')) - ticks.indexOf(sp.parentElement)));
      if (bases.size !== 1) return { error: `labels disagree on the first inch: ${[...bases].join(', ')}` };
      const first = [...bases][0];
      const b = bar.getBoundingClientRect();
      const perInch = vertical ? s.height / h : s.width / w;
      const rows = ticks.map((t, i) => {
        const r = t.getBoundingClientRect();
        const pos = vertical ? r.top : r.left;
        const inch = first + i;
        const onSheet = (vertical ? s.top : s.left) + inch * perInch;
        return { inch, pos, err: pos - onSheet };
      }).filter((r) => (vertical ? r.pos >= b.top && r.pos <= b.bottom : r.pos >= b.left && r.pos <= b.right));
      const errs = rows.map((r) => r.err);
      const round = (v) => Math.round(v * 100) / 100;
      const [start, end] = vertical ? [b.top, b.bottom] : [b.left, b.right];
      const gap = rows.length ? Math.max(rows[0].pos - start, end - rows[rows.length - 1].pos) : end - start;
      const zero = rows.find((r) => r.inch === 0);
      // H1 + H2's prediction: the bar's 24 px inset less the sheet's centring
      // (the sheet's position less the workarea's padded content edge).
      const centring = vertical ? s.top - (w0.top + padTop) : s.left - (w0.left + padLeft);
      const predicted = 24 - centring;
      return {
        ticks: rows.length, perInch: round(perInch),
        err0: zero ? round(zero.err) : null,
        min: round(Math.min(...errs)), max: round(Math.max(...errs)),
        drift: round(Math.max(...errs) - Math.min(...errs)),
        maxAbsIn: round(Math.max(...errs.map(Math.abs)) / perInch),
        centring: round(centring), predicted: round(predicted),
        residual: round(Math.max(...errs.map((e) => Math.abs(e - predicted)))),
        gapIn: round(gap / perInch),
      };
    };
    // The workspace grid: a background on the scroll container, tiled from
    // its padding box at background-position. Distance of the sheet's edge
    // from the nearest major line, folded to ± half a tile.
    const ocs = getComputedStyle(outer);
    const tile = parseFloat(ocs.backgroundSize.split(',')[0]);
    const [posX, posY] = ocs.backgroundPosition.split(',')[0].trim().split(/\s+/).map(parseFloat);
    const fold = (d) => { const m = ((d % tile) + tile) % tile; return Math.round((m > tile / 2 ? m - tile : m) * 100) / 100; };
    const grid = Number.isFinite(tile) && tile > 0
      ? { tile: Math.round(tile * 100) / 100, x: fold(s.left - (o.left + outer.clientLeft) - posX), y: fold(s.top - (o.top + outer.clientTop) - posY), attachment: ocs.backgroundAttachment.split(',')[0] }
      : null;
    const hidden = Math.max(0, view.left - s.left, s.right - view.right, view.top - s.top, s.bottom - view.bottom);
    return {
      dpr: window.devicePixelRatio,
      view: { w: outer.clientWidth, h: outer.clientHeight },
      zoom: Math.round((s.width / (w * 10)) * 10000) / 10000,
      scroll: { x: outer.scrollLeft, y: outer.scrollTop },
      guidelinesOpen: !document.querySelector('[title="Show poster guidelines"]'),
      hidden: Math.round(hidden * 100) / 100,
      top: ruler(false),
      left: ruler(true),
      grid,
    };
  }, poster);
}

/**
 * Why a scenario on a page the tree hides is skipped, or null: the app sent
 * the page elsewhere and the tree's own switch `flag` is off (RouteRedirected
 * in lib/editorHarness.mjs). A redirect the switch does not explain is the
 * scenario's error.
 */
function hiddenByTree(e, flag) {
  if (!(e instanceof RouteRedirected) || !flag || sourceFlag(flag) !== false) return null;
  return `the app hides this page: ${e.wanted} was sent to ${e.landed}, and src/config/features.ts sets ${flag} = false`;
}

/**
 * A scenario: open, then act, then measure. `fitted` scenarios carry the
 * control. `hiddenBy` names the feature switch that hides the page at
 * `route`; with it off, the scenario is skipped (not counted).
 */
function scenario(id, { viewport, poster, panel = 'default', sidebar = 'shown', dpr = 1, act = null, fitted = true, route, ownedByOther = false, hiddenBy, editDoc }) {
  return {
    id,
    // The guidelines panel is hidden with record 29's EDITOR_EXTRAS_ENABLED.
    needs: panel !== 'default' ? 'EDITOR_EXTRAS_ENABLED' : undefined,
    async run(h) {
      let opened;
      try {
        opened = await openEditor(h, { viewport, poster, deviceScaleFactor: dpr, route, ownedByOther, editDoc });
      } catch (e) {
        const skipped = hiddenByTree(e, hiddenBy);
        if (skipped) return { skipped };
        throw e;
      }
      const { context, page } = opened;
      try {
        if (panel !== 'default') await setGuidelines(page, panel === 'open');
        if (sidebar === 'hidden') await hideSidebar(page);
        // The control is read right after Fit, before any zoom or scroll.
        let fitHidden = null;
        if (fitted) {
          await clickButton(page, 'Fit poster to screen');
          fitHidden = (await measure(page, poster)).hidden;
        }
        const info = act ? await act(page) : undefined;
        const m = await measure(page, poster);
        return { ...m, fitted, fitHidden, info };
      } finally {
        await context.close();
      }
    },
  };
}

// 1024 × 768 since the port onto main (the lead's gate: 1024, 1280 and
// 1920 px wide, the sidebar shown and hidden).
const VIEWPORTS = [[1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]];
const POSTERS = [[48, 36], [36, 48], [24, 36], [60, 30], [30, 60]];
const SCENARIOS = [];
for (const [vw, vh] of VIEWPORTS) for (const [pw, ph] of POSTERS) {
  for (const panel of ['default', 'open', 'closed']) {
    SCENARIOS.push(scenario(`fit-${vw}x${vh}-${pw}x${ph}-${panel}`, { viewport: { width: vw, height: vh }, poster: { w: pw, h: ph }, panel }));
  }
  // The sidebar hidden first, then Fit.
  SCENARIOS.push(scenario(`fit-${vw}x${vh}-${pw}x${ph}-nosidebar`, { viewport: { width: vw, height: vh }, poster: { w: pw, h: ph }, sidebar: 'hidden' }));
}
const base = { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } };
SCENARIOS.push(
  // Zoomed in, then scrolled: the sheet fills both axes; the marks must follow the scroll.
  scenario('zoomed-in-4-scroll-0', { ...base, act: (p) => clickButton(p, 'Zoom in', 4) }),
  scenario('zoomed-in-4-scroll-middle', {
    ...base,
    act: async (p) => {
      await clickButton(p, 'Zoom in', 4);
      await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTo((o.scrollWidth - o.clientWidth) / 2, (o.scrollHeight - o.clientHeight) / 2); });
      await p.waitForTimeout(250);
    },
  }),
  scenario('zoomed-in-4-scroll-end', {
    ...base,
    act: async (p) => {
      await clickButton(p, 'Zoom in', 4);
      await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTo(o.scrollWidth, o.scrollHeight); });
      await p.waitForTimeout(250);
    },
  }),
  // Zoomed out below the fit: the sheet is centred on both axes.
  scenario('zoomed-out-2', { ...base, act: (p) => clickButton(p, 'Zoom out', 2) }),
  // Device pixel ratios: fractional, and a Retina Mac's 2.
  scenario('fit-1280x800-48x36-dpr1.5', { ...base, dpr: 1.5 }),
  scenario('fit-1280x800-48x36-dpr2', { ...base, dpr: 2 }),
  // A browser zoom of 67 %, 90 % and 110 % (the review of the port, R1-F5:
  // below a ratio of 1 a device pixel is more than a CSS pixel, and the
  // rounding to one moves a tick by up to 0.5 / ratio px).
  scenario('fit-1280x800-48x36-dpr0.9', { ...base, dpr: 0.9 }),
  scenario('fit-1280x800-48x36-dpr1.1', { ...base, dpr: 1.1 }),
  scenario('fit-1280x800-48x36-dpr0.67', { ...base, dpr: 0.67 }),
  scenario('zoomed-in-4-scroll-middle-dpr0.67', {
    ...base,
    dpr: 0.67,
    act: async (p) => {
      await clickButton(p, 'Zoom in', 4);
      await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTo((o.scrollWidth - o.clientWidth) / 2, (o.scrollHeight - o.clientHeight) / 2); });
      await p.waitForTimeout(250);
    },
  }),
  // The browser's own File › Print of the editor page, which no key the app
  // catches (the review of the port, R1-F3): the page under print media.
  scenario('file-print-media', {
    ...base,
    act: async (p) => {
      const shown = () => p.evaluate(() => {
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const bars = [...document.querySelectorAll('div')].filter((d) => {
          const r = d.getBoundingClientRect();
          return getComputedStyle(d).backgroundColor === 'rgb(18, 18, 30)' && (Math.round(r.height) === 24 || Math.round(r.width) === 24) && visible(d);
        });
        const labels = [...document.querySelectorAll('span')].filter((sp) => /^-?\d+"$/.test(sp.textContent.trim()) && /monospace/.test(getComputedStyle(sp).fontFamily) && visible(sp));
        const sheet = document.getElementById('poster-canvas');
        return { bars: bars.length, labels: labels.length, sheetShown: !!sheet && visible(sheet) };
      });
      const screen = await shown();
      await p.emulateMedia({ media: 'print' });
      await settle(p, 300);
      const print = await shown();
      await p.emulateMedia({ media: 'screen' });
      await settle(p, 400);
      return { printMedia: { screen, print } };
    },
  }),
  // Sizes the size fields do not offer: a widescreen slide and the smallest sheet.
  scenario('fit-1280x800-13.33x7.5', { ...base, poster: { w: 13.33, h: 7.5 } }),
  scenario('fit-1280x800-3x3', { ...base, poster: { w: 3, h: 3 } }),
);

// The completeness critic's gaps (record 04 section 5). Each is a way the
// canvas's size or scroll changes after the rulers last drew.
/** Open Preview from the Export tab and leave it by the button or Escape; the scroll before and after. */
const previewRoundTrip = (exit) => async (p) => {
  await clickButton(p, 'Zoom in', 3);
  const before = await scrollTo(p, 400, 300);
  await settle(p, 300);
  await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
  await p.getByRole('button', { name: /Preview poster/ }).click();
  await settle(p);
  if (exit === 'escape') await p.keyboard.press('Escape');
  else await p.getByRole('button', { name: 'Back to Editor' }).click();
  await settle(p);
  return { scrollBefore: before };
};
SCENARIOS.push(
  // As opened, no button pressed: the entrance animation scales the sheet's
  // frame after the first reading, and a transform fires no event.
  scenario('as-opened-1280x800-48x36', { ...base, fitted: false }),
  // A fit capped at 500 %: a resize changes the canvas but not the zoom.
  ...[[10, 10], [8.5, 11]].map(([pw, ph]) => scenario(`capped-resize-${pw}x${ph}`, {
    viewport: { width: 1280, height: 800 }, poster: { w: pw, h: ph },
    act: async (p) => { await p.setViewportSize({ width: 1920, height: 1080 }); await settle(p); },
  })),
  scenario('capped-panel-close-10x10', {
    viewport: { width: 1920, height: 1080 }, poster: { w: 10, h: 10 }, panel: 'open',
    act: async (p) => { await setGuidelines(p, false); await settle(p); },
  }),
  // Preview hides the editor (display: none) and brings it back.
  scenario('preview-roundtrip-button', { ...base, act: previewRoundTrip('button') }),
  scenario('preview-roundtrip-escape', { ...base, act: previewRoundTrip('escape') }),
  // Below the fit, down to the zoom floor: the sheet is centred on both axes.
  scenario('zoom-out-to-floor', { ...base, act: (p) => clickButton(p, 'Zoom out', 12) }),
  // The browser clamps the scroll when the content shrinks.
  scenario('scroll-clamp-zoom-out', {
    ...base,
    act: async (p) => { await clickButton(p, 'Zoom in', 6); const before = await scrollTo(p, 'end', 'end'); await settle(p, 300); await clickButton(p, 'Zoom out', 3); return { scrollBefore: before }; },
  }),
  scenario('scroll-clamp-window-grows', {
    ...base,
    act: async (p) => { await clickButton(p, 'Zoom in', 4); const before = await scrollTo(p, 'end', 'end'); await settle(p, 300); await p.setViewportSize({ width: 1920, height: 1080 }); await settle(p); return { scrollBefore: before }; },
  }),
  // The text editor's focus hint is placed from the editor's position during
  // render: it follows a scroll only if the editor re-renders on scroll
  // (hintDrift, above).
  scenario('text-hint-follows-scroll', {
    ...base,
    act: async (p) => {
      await clickButton(p, 'Zoom in', 6);
      const editable = p.locator('#poster-canvas [contenteditable="true"]').first();
      await editable.click();
      await editable.click();
      await settle(p, 300);
      const read = () => p.evaluate(() => {
        const o = document.querySelector('[data-postr-canvas-outer]');
        const ed = document.activeElement;
        const hint = [...document.body.children].flatMap((c) => [c, ...c.querySelectorAll('div')]).find((d) => d.style?.zIndex === '9500' && d.style.position === 'fixed');
        const at = { x: o.scrollLeft, y: o.scrollTop };
        if (!ed?.isContentEditable || !hint) return { focused: !!ed?.isContentEditable, hint: !!hint, at };
        return { gap: Math.round((hint.getBoundingClientRect().top - ed.getBoundingClientRect().bottom) * 100) / 100, at };
      });
      // Scroll the way a wheel does, by a known amount inside the range.
      await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTo(o.scrollLeft, 0); });
      await settle(p, 300);
      const before = await read();
      await p.evaluate(() => document.querySelector('[data-postr-canvas-outer]').scrollBy(0, 60));
      await settle(p, 300);
      return { before, after: await read() };
    },
  }),
  // A new poster height at a width-limited fit: only the sheet's frame
  // resizes (step 9 review CR9-04-01).
  scenario('size-change-48x36-to-48x30', {
    ...base,
    act: async (p) => {
      await p.locator('[data-postr-tab]', { hasText: 'layout' }).click();
      const field = p.getByLabel('Poster height in inches');
      await field.fill('30');
      await field.press('Enter');
      await p.getByRole('button', { name: 'Change size' }).click();
      await settle(p);
    },
  }),
  // A size change that, with scrollbars that take space, adds a scrollbar
  // and takes it away again while the fit settles (the step 9-F review,
  // F-01: WebKit then moved the sheet by 5 px after the rulers' last reading).
  scenario('size-change-24x36-to-48x36', {
    ...base, poster: { w: 24, h: 36 },
    act: async (p) => {
      await p.locator('[data-postr-tab]', { hasText: 'layout' }).click();
      const field = p.getByLabel('Poster width in inches');
      await field.fill('48');
      await field.press('Enter');
      await p.getByRole('button', { name: 'Change size' }).click();
      await settle(p);
    },
  }),
  // Fit after a pinch zoomed in (F-01's other trigger).
  scenario('fit-after-pinch', {
    ...base,
    act: async (p) => {
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.move(o.x + o.width - 40, o.y + o.height - 60);
      await p.keyboard.down('Control');
      for (let i = 0; i < 20; i += 1) await p.mouse.wheel(0, -8);
      await p.keyboard.up('Control');
      await settle(p, 400);
      await clickButton(p, 'Fit poster to screen');
      await settle(p);
    },
  }),
  // The desktop share view: someone else's poster, read-only, at its link.
  // Skipped where the tree hides sharing (fix 23: /s/:slug goes to /).
  scenario('share-desktop-1440x900', {
    viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, fitted: false,
    route: (row) => `/s/${row.share_slug}`, ownedByOther: true, hiddenBy: 'SHARING_ENABLED',
  }),
  // Hiding the sidebar widens the canvas, with an animation.
  scenario('sidebar-hidden', {
    ...base,
    act: async (p) => { await p.getByRole('button', { name: 'Hide sidebar' }).click(); await settle(p, 900); },
  }),
  // Hidden and shown again, without Fit in between, at the three widths of
  // the gate (and zoomed in, so the marks must follow a scroll too).
  ...[[1024, 768], [1280, 800], [1920, 1080]].flatMap(([vw, vh]) => [
    scenario(`sidebar-hide-show-${vw}x${vh}`, {
      viewport: { width: vw, height: vh }, poster: { w: 48, h: 36 },
      act: async (p) => {
        await p.getByRole('button', { name: 'Hide sidebar' }).click(); await settle(p, 900);
        await p.getByRole('button', { name: 'Show sidebar' }).click(); await settle(p, 900);
      },
    }),
    scenario(`zoomed-in-3-sidebar-hidden-${vw}x${vh}`, {
      viewport: { width: vw, height: vh }, poster: { w: 48, h: 36 }, sidebar: 'hidden',
      act: async (p) => {
        await clickButton(p, 'Zoom in', 3); await scrollTo(p, 120, 80); await settle(p, 300);
        // INFORMATION: the Show sidebar button against the bars (the second
        // step 10 review's R3-F3: its tab covered the rulers' corner).
        return p.evaluate(() => {
          const b = document.querySelector('[aria-label="Show sidebar"]')?.getBoundingClientRect();
          const bars = [...document.querySelectorAll('span')].filter((x) => /^-?\d+"$/.test(x.textContent.trim())).map((sp) => {
            let e = sp.parentElement;
            while (e && getComputedStyle(e).overflow !== 'hidden') e = e.parentElement;
            return e;
          }).filter((e, i, a) => e && a.indexOf(e) === i).map((e) => e.getBoundingClientRect());
          if (!b) return { showSidebar: null };
          const inter = (r) => Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) * Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
          return { showSidebar: { box: [b.left, b.top, b.width, b.height].map((v) => Math.round(v)), overBarsPx2: Math.round(bars.reduce((a, r) => a + inter(r), 0)) } };
        });
      },
    }),
  ]),
  // INFORMATION, compared across trees (the lead's gate: a selected
  // block's controls, fix 19's, not covered by the rulers more than on
  // main): the title moved to the sheet's top-left corner and selected by a
  // click, at the fit and zoomed in 3 scrolled to the origin; how many of
  // its grabbable controls (lib/selectionControls.mjs) a ruler bar covers,
  // and by how much. The bars take no pointer events, so a hit test cannot
  // see them: this is read from the boxes. Control (`under`, a failure is
  // exit 2): zoomed in 3 and scrolled until the block's corner is 10 px
  // inside the canvas, under both bars, some control must read covered.
  ...[[1024, 768], [1280, 800], [1920, 1080]].flatMap(([vw, vh]) => ['shown', 'hidden'].flatMap((sidebar) => ['fit', 'zoomed', 'under'].map((at) => scenario(`controls-under-rulers-${vw}x${vh}-sidebar-${sidebar}-${at}`, {
    viewport: { width: vw, height: vh }, poster: { w: 48, h: 36 }, sidebar,
    editDoc: (doc) => ({ ...doc, blocks: doc.blocks.map((b) => (b.type === 'title' ? { ...b, x: 0, y: 0 } : b)) }),
    act: async (p) => {
      if (at === 'zoomed') { await clickButton(p, 'Zoom in', 3); await scrollTo(p, 0, 0); await settle(p, 300); }
      if (at === 'under') {
        await clickButton(p, 'Zoom in', 3);
        await p.evaluate(() => {
          const o = document.querySelector('[data-postr-canvas-outer]');
          const sheetBox = document.getElementById('poster-canvas').getBoundingClientRect();
          const ob = o.getBoundingClientRect();
          o.scrollTo(o.scrollLeft + sheetBox.left - ob.left - 10, o.scrollTop + sheetBox.top - ob.top - 10);
        });
        await settle(p, 300);
      }
      const title = p.locator('#poster-canvas [data-block-id]', { hasText: 'ZQTITLE' }).first();
      const tb = await title.boundingBox();
      await p.mouse.click(tb.x + Math.min(40, tb.width / 3), tb.y + tb.height / 2);
      await settle(p, 350);
      const reading = await readControls(p);
      const bars = await p.evaluate(() => {
        const out = [];
        for (const sp of [...document.querySelectorAll('span')].filter((x) => /^-?\d+"$/.test(x.textContent.trim()))) {
          let e = sp.parentElement;
          while (e && getComputedStyle(e).overflow !== 'hidden') e = e.parentElement;
          if (e && !out.includes(e)) out.push(e);
        }
        return out.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      });
      const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const targets = reading.controls.filter((c) => c.target);
      const under = targets.map((c) => ({ kind: c.kind, area: Math.round(bars.reduce((a, b) => a + inter(c.r, b), 0) * 100) / 100, of: Math.round(c.r.w * c.r.h * 100) / 100 })).filter((c) => c.area > 1);
      if (at === 'under' && !under.length) throw new Error(`control failed: a block's corner under both bars read no control covered (${targets.length} controls, ${bars.length} bars)`);
      return { controls: { targets: targets.length, under: under.length, coveredPx2: Math.round(under.reduce((a, c) => a + c.area, 0) * 100) / 100, which: under, bars: bars.length } };
    },
  })))),
  // The window resized at a manual zoom (no Fit after it), narrower and wider.
  ...[[1920, 1080, 1024, 768], [1024, 768, 1920, 1080]].map(([w0, h0, w1, h1]) => scenario(`window-resize-${w0}x${h0}-to-${w1}x${h1}`, {
    viewport: { width: w0, height: h0 }, poster: { w: 48, h: 36 },
    act: async (p) => { await clickButton(p, 'Zoom in', 2); await p.setViewportSize({ width: w1, height: h1 }); await settle(p); },
  })),
);

if (args.includes('--list')) {
  for (const s of FRAMES ? FRAME_SCENARIOS : SCENARIOS) process.stdout.write(`${s.id}\n`);
  process.exit(0);
}
const pool = FRAMES ? FRAME_SCENARIOS : SCENARIOS;
const chosen = pool.filter((s) => !only || only.includes(s.id));
if (only && chosen.length !== only.length) {
  log(`[harness] unknown scenario(s): ${only.filter((id) => !pool.some((s) => s.id === id)).join(', ')}`);
  process.exit(2);
}

const fail = (e) => {
  log(`[harness] instrument error: ${e}`);
  process.exit(2);
};

if (EXPORTS) {
  const he = await startHarness({ name: 'ruler-check', port: PORT }).catch(fail);
  let r;
  try {
    r = await runExports(he);
  } catch (e) {
    r = { errors: [String(e).slice(0, 300)], claims: {} };
  } finally {
    await he.stop();
  }
  const summary = {
    git: he.git, engine: he.engine, mutant: he.mutant, mode: 'exports',
    claims: Object.fromEntries(Object.entries(r.claims).map(([k, v]) => [k, v.observed ? 'OBSERVED' : 'not observed'])),
    errors: r.errors,
  };
  fs.writeFileSync(path.join(he.out, 'exports-results.json'), JSON.stringify({ summary, ...r }, null, 2));
  log(`[exports] ${JSON.stringify({ claims: r.claims, info: r.info }).slice(0, 3000)}`);
  log(`[harness] ${JSON.stringify(summary)}`);
  const exitE = r.errors.length ? 2 : Object.values(r.claims).some((c) => c.observed) ? 1 : 0;
  log(`[harness] exit=${exitE} wrote ${path.join(he.out, 'exports-results.json')}`);
  process.exit(exitE);
}
if (FRAMES) process.exit(await runFrames(chosen, { port: PORT, ownRest: OWN_REST, fail }));
const h = await startHarness({ name: 'ruler-check', port: PORT }).catch(fail);
const results = [];
let errors = 0;
for (const sc of chosen) {
  const off = switchesOff(sc.needs);
  if (off.length) {
    results.push({ id: sc.id, skipped: switchOffReason(off), switchOff: true });
    log(`[skipped] ${sc.id} ${switchOffReason(off)}`);
    continue;
  }
  try {
    const r = await sc.run(h);
    if (r.skipped) {
      results.push({ id: sc.id, skipped: r.skipped });
      log(`[skipped] ${sc.id} ${r.skipped}`);
      continue;
    }
    const rulers = [r.top, r.left];
    const instrumentError = r.error ?? rulers.find((x) => x.error)?.error ?? (r.fitted && r.fitHidden > 0.5 ? `control failed: ${r.fitHidden} px of the fitted sheet hidden` : null);
    if (!instrumentError && rulers.some((x) => x.noMarks)) {
      results.push({ id: sc.id, observed: true, worst: null, noMarks: true, ...r });
      log(`[OBSERVED] ${sc.id} a ruler drew no marks ${JSON.stringify({ top: r.top, left: r.left })}`);
      continue;
    }
    if (instrumentError) {
      errors += 1;
      log(`[ERROR] ${sc.id} ${instrumentError}`);
      results.push({ id: sc.id, error: instrumentError });
      continue;
    }
    const worst = Math.max(...rulers.map((x) => Math.max(Math.abs(x.min), Math.abs(x.max))));
    const gapIn = Math.max(...rulers.map((x) => x.gapIn));
    let hintDrift;
    if (sc.id === 'text-hint-follows-scroll') {
      const { before, after } = r.info ?? {};
      if (typeof before?.gap !== 'number' || typeof after?.gap !== 'number' || after.at.y - before.at.y !== 60) {
        errors += 1;
        log(`[ERROR] ${sc.id} the focus hint could not be read before and after a 60 px scroll ${JSON.stringify(r.info)}`);
        results.push({ id: sc.id, error: 'focus hint unreadable' });
        continue;
      }
      hintDrift = Math.round(Math.abs(after.gap - before.gap) * 100) / 100;
    }
    // File › Print: on screen the same finder reads the two bars, the corner
    // and labels (the control); under print media, any of them is the defect.
    let printShown;
    if (r.info?.printMedia) {
      const { screen, print } = r.info.printMedia;
      if (!(screen.bars >= 3 && screen.labels > 0 && screen.sheetShown)) {
        errors += 1;
        log(`[ERROR] ${sc.id} control failed: the rulers are not found on screen ${JSON.stringify(r.info.printMedia)}`);
        results.push({ id: sc.id, error: 'print-media control failed' });
        continue;
      }
      printShown = print.bars + print.labels;
    }
    // Half a device pixel plus layout's 1/64 px unit: a tick on whole device
    // pixels sits up to half a device pixel from a fractional layout position
    // (the second step 10 review, R3-F1), 0.5 px at a ratio of 1 and
    // 0.5 / ratio px at another (the review of the port, R1-F5).
    const observed = worst > tickLimit(r.dpr) || gapIn > 1.02 || hintDrift > 2 || printShown > 0;
    results.push({ id: sc.id, observed, worst, gapIn, hintDrift, printShown, ...r });
    log(`[${observed ? 'OBSERVED' : 'not observed'}] ${sc.id} ${JSON.stringify({ zoom: r.zoom, view: r.view, panel: r.guidelinesOpen, scroll: r.scroll, info: r.info, top: r.top, left: r.left, grid: r.grid })}`);
  } catch (e) {
    errors += 1;
    log(`[ERROR] ${sc.id} ${String(e).slice(0, 300)}`);
    results.push({ id: sc.id, error: String(e).slice(0, 300) });
  }
}
await h.stop();

const ok = results.filter((r) => !r.error && !r.noMarks && !r.skipped);
const noMarks = results.filter((r) => r.noMarks).map((r) => r.id);
const observed = results.filter((r) => r.observed);
const span = (pick, rows = ok) => {
  const v = rows.map(pick).filter((x) => typeof x === 'number');
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
};
const summary = {
  git: h.git, engine: h.engine, mutant: h.mutant,
  observed: `${observed.length} of ${ok.length + noMarks.length}`,
  rulersDrewNothing: noMarks,
  worstPx: span((r) => r.worst),
  worstInches: span((r) => Math.max(r.top.maxAbsIn, r.left.maxAbsIn)),
  driftPx: span((r) => Math.max(r.top.drift, r.left.drift)),
  // Only where the defect shows: once the marks are right, the error is 0
  // and its distance from H1 + H2's prediction is the prediction itself.
  residualAfterH1H2Px: span((r) => Math.max(r.top.residual, r.left.residual), observed.filter((r) => !r.noMarks)),
  gapInches: span((r) => r.gapIn),
  gapOverOneInch: ok.filter((r) => r.gapIn > 1.02).map((r) => r.id),
  gridOffsetPx: span((r) => (r.grid ? Math.max(Math.abs(r.grid.x), Math.abs(r.grid.y)) : undefined)),
  skipped: results.filter((r) => r.skipped && !r.switchOff).map((r) => r.id),
  switchOff: results.filter((r) => r.switchOff).length,
  errors,
};
fs.writeFileSync(path.join(h.out, 'results.json'), JSON.stringify({ summary, results }, null, 2));
log(`[harness] ${SWITCH_OFF}: ${summary.switchOff}`);
log(`[harness] ${JSON.stringify(summary)}`);
const exit = errors ? 2 : observed.length ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(h.out, 'results.json')}`);
process.exit(exit);
