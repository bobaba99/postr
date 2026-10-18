#!/usr/bin/env node
/**
 * ruler-paint-check.mjs — are the workspace rulers' ticks PAINTED crisp, and
 * do the painted marks sit on the painted sheet? (docs/fixes/04-rulers-match-sheet.md)
 *
 * ruler-check.mjs reads layout boxes, and a tick on its box but painted
 * smeared over two device pixels, or a whole ruler painted a device pixel
 * from where its box says, reads clean there (its blind spots). This reads
 * PAINT: a screenshot at the device's own pixels, judged by lib/rulerPaint.mjs
 * (the follow-up review's pixel judge, R2-paint's, ported): per tick, the
 * coverage of each device column (top ruler) or row (left ruler) by the
 * tick's colour, and the sheet's painted edge from the step in brightness
 * across it. The DOM is read only to know where to look.
 *
 * CLAIMS, per ruler of each scenario, in device px:
 *   smeared — a tick with a device column or row covered only partly
 *             (between 0.12 and 0.88 of its colour): its 1 px line spread
 *             over two device pixels. Observed when any judged tick is.
 *   off0    — the painted 0" tick's leading edge less the painted sheet
 *             edge. Observed when |off0| > 0.5: place() puts the 0" within
 *             half a device pixel of the sheet's layout edge.
 *   tick    — the worst judged tick's painted leading edge less its inch on
 *             the painted sheet (the edge plus the inch × the sheet's laid
 *             out inch). Observed when |tick| > 0.75: layout puts each tick
 *             on a device pixel, up to 0.5 from its exact inch; the other
 *             0.25 is for the painted edge's own place and the judge.
 *   A ruler with no marks is observed too. off0 and tick are judged only
 *   where the sheet's edge is on screen and read (a clean step within
 *   2 device px of its layout edge), and only where the engine paints the
 *   sheet on its layout box: not WebKit at 1.25 or 1.5 (below).
 * CONFIGURATIONS (fixed; POSTR_BROWSER and POSTR_SCROLLBARS are not read)
 *   chromium@<r>, r = 1, 1.25, 1.5, 2, and 0.9, 1.1, 1.8, 2.2 — Chromium
 *     launched with --force-device-scale-factor=<r> and a window of the
 *     layout's size: the ratio is the browser's own, as on a display of that
 *     density. The last four are a browser zoom of 90 % and 110 % on a
 *     display of ratio 1 and 2 (the review of the port, R1-F1: there the
 *     bars sit at a fraction of a device pixel, and a layer rounded against
 *     its bar was painted a device pixel off the sheet). A real Ctrl/Cmd +/−
 *     is not driven (UNVERIFIED that Chrome's zoom paints as this ratio does).
 *     Playwright's emulated deviceScaleFactor lays out at CSS pixels and
 *     scales the result, and paints even a plain 1 px box smeared at 1.25
 *     (the follow-up review, R2P-F4, and its R3G-01 skeptic).
 *   webkit@<r>, r = 1, 1.25, 1.5, 2 — WebKit at Playwright's deviceScaleFactor:
 *     EMULATED (whether Safari reaches a fractional ratio, by page zoom, is
 *     UNVERIFIED). At 1.25 and 1.5 WebKit paints the scaled sheet up to a
 *     device pixel off its layout box (the follow-up review, R2P-F5), so
 *     only smear is judged there; off0 and tick are printed, not counted.
 *   Each runs 32 layouts: fits at 11 window and poster sizes, the
 *   guidelines panel open and closed, as opened, zoomed in (scrolled to
 *   the middle, the end and fractional offsets), zoomed out, the sidebar
 *   hidden, a pinch, a Preview round trip, 4 with classic scrollbars
 *   (10 px, in the layout), and since the port onto main 4 more for the
 *   lead's gate: fits at 1024 × 768 and the sidebar hidden at 1024 × 768
 *   and 1920 × 1080. The guidelines panel's two are skipped on a tree with
 *   EDITOR_EXTRAS_ENABLED off (record 29), printed "skipped (switch off)".
 *   change@<a>><b> — Chromium, the ratio changed in mid-session with nothing
 *     resized: the page opened at Playwright's emulated ratio <a>, then
 *     DevTools' Emulation.setDeviceMetricsOverride to <b> at the same CSS
 *     size, as the follow-up review's R2P-F1 skeptic changed it. EMULATED: a
 *     window moved between real displays is UNVERIFIED. Judged at end
 *     ratios 1 and 2 only, from a DevTools capture at the page's scale (an
 *     emulated fractional ratio paints every 1 px box smeared, R2P-F4);
 *     off0 and tick at 1 only (emulated 2 paints the sheet at a CSS-rounded
 *     place, R2P-F4). 5 changes (2→1, 1.25→1, 1.5→1, 1.5→2, 1.25→2) × 5
 *     layouts.
 * CONTROLS (a failure is exit 2). Each rest configuration's first layout,
 *   with the marks' layers set by the control itself, whatever the tree's
 *   place() does (ported from the R2P-F1 skeptic's dpr-smear.mjs and the
 *   R3G-01 skeptic's paint0.mjs):
 *   - each layer half a device pixel off the grid (by a translate) reads
 *     smeared on at least 90 % of at least 5 judged ticks;
 *   - each layer one whole device pixel further reads off0 1 ± 0.25 later;
 *   - the sheet's holder one device pixel further reads off0 1 ± 0.25
 *     earlier;
 *   - both sheet edges are read.
 *   In every scenario: the page has the configuration's ratio and window
 *   (at a fractional ratio Chromium's window may be a CSS px larger, made a
 *   whole number of device px), the screenshot is the window's device
 *   pixels, and some tick is judged.
 *   In change mode: no window resize event and a change of the resolution
 *   query (the input was the ratio alone), and on each change's first
 *   layout the half-pixel control above.
 * BLIND SPOTS
 *   - at rest only: ruler-check --frames judges each frame, by layout;
 *   - Firefox is not run (it paints the scaled sheet about a device pixel
 *     off its layout box at 1.25 to 2, on the tree before cause C too,
 *     R2P-F5); WebKit's ratio and every mid-session change are emulated;
 *   - a tick under something drawn over the bar (the out-of-bounds banner)
 *     is not judged, nor are the labels;
 *   - off0 and tick are not judged where the sheet's edge is off screen
 *     (zoomed in and scrolled): there smear alone is judged.
 *
 * RUN (from apps/web; the tree's apps/web/.env must point at the harness's
 * fake backend, https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/ruler-paint-check.mjs [--only id,id] [--list]
 *   (409 scenarios, 24 of them the guidelines panel's, ids
 *   <configuration>/<layout>; --list prints them and
 *   starts nothing)
 *   env PORT (default 5281), OUT_DIR, POSTR_REPO, POSTR_MUTANT
 *   (lib/editorHarness.mjs); SHOTS=1 saves each observed scenario's
 *   screenshot in OUT_DIR/shots.
 * EXIT 0 no tick smeared and no off0 or tick over its limit anywhere ·
 *      1 the defect observed · 2 a scenario errored or a control failed
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, SWITCH_OFF, log, openEditor, startHarness, switchOffReason, switchesOff } from './lib/editorHarness.mjs';
import { collectDom, judgeShot, r3 } from './lib/rulerPaint.mjs';

// A crash is an instrument failure (exit 2), never a finding.
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    process.stderr.write(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 500)}\n`);
    process.exit(2);
  });
}
// The configurations are fixed: the harness's own switches would change
// the browser it starts for the change mode.
delete process.env.POSTR_BROWSER;
delete process.env.POSTR_SCROLLBARS;

const PORT = Number(process.env.PORT ?? 5281);
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;
/** The claims' limits, in device px (see CLAIMS). */
const LIMIT = { off0: 0.5, tick: 0.75 };

// ------------------------------------------------------------ layouts
const settle = (p, ms = 700) => p.waitForTimeout(ms);
const clickButton = async (p, name, times = 1) => {
  for (let i = 0; i < times; i += 1) { await p.getByRole('button', { name }).click(); await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
};
const scrollTo = (p, x, y) => p.evaluate(([sx, sy]) => {
  const o = document.querySelector('[data-postr-canvas-outer]');
  const X = sx === 'end' ? o.scrollWidth : sx === 'mid' ? (o.scrollWidth - o.clientWidth) / 2 : sx;
  const Y = sy === 'end' ? o.scrollHeight : sy === 'mid' ? (o.scrollHeight - o.clientHeight) / 2 : sy;
  o.scrollTo(X, Y);
}, [x, y]);
/** Open or close the guidelines panel (its "Show" toggle exists only while it is closed). */
async function setGuidelines(p, open) {
  const isOpen = !(await p.$('[title="Show poster guidelines"]'));
  if (isOpen === open) return;
  await p.click(open ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]');
  await settle(p, 600);
}
const pinch = (steps, dy) => async (p) => {
  const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
  await p.mouse.move(o.x + o.width * 0.63, o.y + o.height * 0.41);
  await p.keyboard.down('Control');
  for (let i = 0; i < steps; i += 1) { await p.mouse.wheel(0, dy); await p.waitForTimeout(30); }
  await p.keyboard.up('Control');
};
const zoomIn = (n, then) => async (p) => { await clickButton(p, 'Zoom in', n); if (then) await then(p); };

/** A layout: a window, a poster, then the panel, Fit and an action. */
const L = (id, [w, h], [pw, ph], act = null, { fitted = true, panel = 'default', scrollbars = 'default' } = {}) => ({
  id, vp: { width: w, height: h }, poster: { w: pw, h: ph }, act, fitted, panel, scrollbars,
  // The guidelines panel is hidden with record 29's EDITOR_EXTRAS_ENABLED.
  needs: panel !== 'default' ? 'EDITOR_EXTRAS_ENABLED' : undefined,
});
const hideSidebar = async (p) => { await p.getByRole('button', { name: 'Hide sidebar' }).click(); await settle(p, 900); };
const LAYOUTS = [
  // The first layout of each configuration carries its controls: both sheet edges on screen.
  L('fit-1280x800-48x36', [1280, 800], [48, 36]),
  L('fit-1280x800-36x48', [1280, 800], [36, 48]),
  L('fit-1440x900-24x36', [1440, 900], [24, 36]),
  L('fit-1366x768-60x30', [1366, 768], [60, 30]),
  L('fit-1536x864-30x60', [1536, 864], [30, 60]),
  L('fit-1920x1080-48x36', [1920, 1080], [48, 36]),
  L('fit-1920x1080-33.1x46.8', [1920, 1080], [33.1, 46.8]),
  L('fit-2560x1440-42x42', [2560, 1440], [42, 42]),
  L('fit-1280x800-13.33x7.5', [1280, 800], [13.33, 7.5]),
  L('fit-1301x777-48x36', [1301, 777], [48, 36]),
  L('fit-1111x701-36x24', [1111, 701], [36, 24]),
  L('guides-open-1280x800-48x36', [1280, 800], [48, 36], null, { panel: 'open' }),
  L('guides-closed-1440x900-36x48', [1440, 900], [36, 48], null, { panel: 'closed' }),
  L('as-opened-1280x800-48x36', [1280, 800], [48, 36], null, { fitted: false }),
  L('zoom-in-1', [1280, 800], [48, 36], zoomIn(1)),
  L('zoom-in-3-scroll-mid', [1280, 800], [48, 36], zoomIn(3, (p) => scrollTo(p, 'mid', 'mid'))),
  L('zoom-in-4-scroll-end', [1280, 800], [48, 36], zoomIn(4, (p) => scrollTo(p, 'end', 'end'))),
  L('zoom-in-2-scroll-odd', [1280, 800], [48, 36], zoomIn(2, (p) => scrollTo(p, 123.4, 77.6))),
  L('zoom-in-5-scroll-frac', [1440, 900], [36, 48], zoomIn(5, (p) => scrollTo(p, 333.3, 211.7))),
  L('zoom-out-1', [1280, 800], [48, 36], (p) => clickButton(p, 'Zoom out', 1)),
  L('zoom-out-3', [1440, 900], [24, 36], (p) => clickButton(p, 'Zoom out', 3)),
  L('sidebar-hidden', [1280, 800], [48, 36], hideSidebar),
  // The lead's gate since the port onto main: 1024 and 1920 px wide, the
  // sidebar shown and hidden (Fit, then the sidebar hidden).
  L('fit-1024x768-48x36', [1024, 768], [48, 36]),
  L('fit-1024x768-36x48', [1024, 768], [36, 48]),
  L('sidebar-hidden-1024x768-48x36', [1024, 768], [48, 36], hideSidebar),
  L('sidebar-hidden-1920x1080-36x48', [1920, 1080], [36, 48], hideSidebar),
  L('pinch-in-7', [1280, 800], [48, 36], pinch(7, -8)),
  L('preview-roundtrip', [1280, 800], [48, 36], async (p) => {
    await clickButton(p, 'Zoom in', 2);
    await scrollTo(p, 211, 157);
    await settle(p, 300);
    await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
    await p.getByRole('button', { name: /Preview poster/ }).click();
    await settle(p);
    await p.keyboard.press('Escape');
    await settle(p);
  }),
  L('classic-fit-1280x800-48x36', [1280, 800], [48, 36], null, { scrollbars: 'classic' }),
  L('classic-fit-1440x900-36x48', [1440, 900], [36, 48], null, { scrollbars: 'classic' }),
  L('classic-zoom-in-3-scroll-mid', [1280, 800], [48, 36], zoomIn(3, (p) => scrollTo(p, 'mid', 'mid')), { scrollbars: 'classic' }),
  L('classic-zoom-out-1', [1280, 800], [48, 36], (p) => clickButton(p, 'Zoom out', 1), { scrollbars: 'classic' }),
];
// The R2P-F1 skeptic's layouts: each smeared a whole ruler after a change
// of ratio on the tree that moved the layers by a translate.
const CHANGE_LAYOUTS = [
  L('fit-1280x800-48x36', [1280, 800], [48, 36]),
  L('fit-1366x768-48x36', [1366, 768], [48, 36]),
  L('fit-1920x1080-33.1x46.8', [1920, 1080], [33.1, 46.8]),
  L('fit-1600x1000-42x30', [1600, 1000], [42, 30]),
  L('zoom-in-3-wheel-1440x900-48x36', [1440, 900], [48, 36], zoomIn(3, async (p) => {
    const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
    await p.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
    await p.mouse.wheel(0, 137);
    await settle(p, 500);
  })),
];
const CHANGES = [[2, 1], [1.25, 1], [1.5, 1], [1.5, 2], [1.25, 2]];

// ------------------------------------------------------------ scenarios
const RATIOS = [1, 1.25, 1.5, 2];
// Browser zoom (the review of the port, R1-F1): Chrome's first steps from
// 100 % are 90 % and 110 %, on a display of ratio 1 or 2. At these the bars
// themselves sit at a fraction of a device pixel (24 px is 21.6 device px at
// 0.9), so a layer rounded relative to its bar is rounded again when painted.
const ZOOM_RATIOS = [0.9, 1.1, 1.8, 2.2];
const CONFIGS = [
  ...[...RATIOS, ...ZOOM_RATIOS].map((r) => ({ id: `chromium@${r}`, engine: 'chromium', ratio: r, position: true })),
  ...RATIOS.map((r) => ({ id: `webkit@${r}`, engine: 'webkit', ratio: r, position: Number.isInteger(r) })),
];
const SCENARIOS = [];
for (const cfg of CONFIGS) {
  LAYOUTS.forEach((lay, i) => SCENARIOS.push({ id: `${cfg.id}/${lay.id}`, mode: 'rest', cfg, lay, control: i === 0 }));
}
for (const [from, to] of CHANGES) {
  CHANGE_LAYOUTS.forEach((lay, i) => SCENARIOS.push({
    id: `change@${from}>${to}/${lay.id}`, mode: 'change', from, to, lay, control: i === 0,
    cfg: { id: `change@${from}>${to}`, engine: 'chromium', ratio: to, position: to === 1 },
  }));
}

if (args.includes('--list')) {
  for (const s of SCENARIOS) process.stdout.write(`${s.id}\n`);
  process.exit(0);
}
const chosen = SCENARIOS.filter((s) => !only || only.includes(s.id));
if (only && chosen.length !== only.length) {
  log(`[harness] unknown scenario(s): ${only.filter((id) => !SCENARIOS.some((s) => s.id === id)).join(', ')}`);
  process.exit(2);
}

// ------------------------------------------------------------ looking
/**
 * A screenshot at the device's pixels: DevTools' for Chromium, Playwright's
 * for WebKit. `cdp`: the session that changed the ratio, whose emulation a
 * session of its own would not share.
 */
async function shot(page, engine, inner, own) {
  if (engine !== 'chromium') return page.screenshot({ scale: 'device' });
  const cdp = own ?? await page.context().newCDPSession(page);
  try {
    // A clip at scale 1 is captured at the page's current scale, which an
    // emulated change of ratio leaves Playwright's own capture unaware of.
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: inner[0], height: inner[1], scale: 1 },
    });
    return Buffer.from(data, 'base64');
  } finally {
    if (!own) await cdp.detach().catch(() => {});
  }
}

/** Read the page, screenshot it and judge both rulers. */
async function look(page, engine, { save, cdp } = {}) {
  const dom = await collectDom(page);
  if (dom.error) return { error: dom.error };
  const png = await shot(page, engine, dom.inner, cdp);
  if (save) fs.writeFileSync(save, png);
  const j = judgeShot(png, dom);
  return j.error ? { error: j.error } : { dom, ...j };
}

/**
 * Set both marks' layers, or the sheet's holder, to a known place, in the
 * page: each layer `whole` device pixels past the nearest whole device pixel
 * of the screen to the sheet's reading (the frame's holder, as the rulers
 * read it against their bar), by layout, plus `half` device pixels by a translate; the holder
 * moved `sheet` device pixels by a translate. The known answers of the
 * controls, independent of the tree's own place().
 */
function setKnown(page, { whole = 0, half = 0, sheet = 0 }) {
  return page.evaluate(({ whole, half, sheet }) => {
    const dpr = window.devicePixelRatio;
    const slot = document.querySelector('[data-postr-canvas-frame]').parentElement;
    // The reading is taken with the holder in its own place.
    slot.style.transform = '';
    const lines = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).backgroundColor === 'rgba(255, 255, 255, 0.35)');
    for (const vertical of [false, true]) {
      const tick = lines.find((d) => (vertical ? d.style.height === '1px' : d.style.width === '1px'));
      const layer = tick.parentElement.parentElement;
      let bar = layer;
      while (bar && getComputedStyle(bar).overflow !== 'hidden') bar = bar.parentElement;
      const s = slot.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      // On the screen's device pixels, not the bar's: at a browser zoom the
      // bar itself sits at a fraction of one (the review of the port, R1-F1).
      const barAt = vertical ? b.top : b.left;
      const reading = vertical ? s.top - b.top : s.left - b.left;
      const at = (Math.round((barAt + reading) * dpr) + whole) / dpr - barAt;
      layer.style[vertical ? 'top' : 'left'] = `${at}px`;
      layer.style.transform = half ? `translate${vertical ? 'Y' : 'X'}(${half / dpr}px)` : '';
    }
    if (sheet) slot.style.transform = `translate(${sheet / dpr}px, ${sheet / dpr}px)`;
  }, { whole, half, sheet });
}

/** The verdict on one judged look. `position`: off0 and tick count here. */
function verdict(j, position) {
  const rulers = [j.top, j.left];
  if (rulers.some((r) => r.noMarks)) return { observed: true, why: 'a ruler drew no marks' };
  if (rulers.every((r) => r.n === 0)) return { error: 'no tick judged on either ruler' };
  const why = [];
  const smeared = rulers.reduce((a, r) => a + r.smeared, 0);
  if (smeared) why.push(`${smeared} smeared`);
  if (position) {
    for (const [name, r] of [['top', j.top], ['left', j.left]]) {
      if (r.off0 !== null && Math.abs(r.off0) > LIMIT.off0) why.push(`${name} off0 ${r.off0}`);
      if (r.worstTick !== null && Math.abs(r.worstTick) > LIMIT.tick) why.push(`${name} tick ${r.worstTick}`);
    }
  }
  return { observed: why.length > 0, why: why.join(', ') };
}

const brief = (r) => ({
  n: r.n, smeared: r.smeared, covered: r.covered, off0: r.off0, worstTick: r.worstTick,
  edge: r.sheetEdge ? r.sheetEdge.p : null, placement: r.placement, smearedInches: r.smearedInches,
});

/** The controls on a judged page (see CONTROLS); a list of failures. */
async function controls(page, engine, { smearOnly = false, cdp } = {}) {
  const fails = [];
  const at = async (known) => { await setKnown(page, known); await settle(page, 250); return look(page, engine, { cdp }); };
  const half = await at({ half: 0.5 });
  if (half.error) return [`half-pixel look: ${half.error}`];
  for (const [name, r] of [['top', half.top], ['left', half.left]]) {
    if (r.n < 5 || r.smeared < 0.9 * r.n) fails.push(`${name} half a device pixel off read ${r.smeared} of ${r.n} smeared`);
  }
  if (smearOnly) return fails;
  const base = await at({});
  const moved = await at({ whole: 1 });
  const sheet = await at({ sheet: 1 });
  for (const look1 of [base, moved, sheet]) if (look1.error) return [`look: ${look1.error}`];
  for (const name of ['top', 'left']) {
    const b = base[name].off0; const m = moved[name].off0; const s = sheet[name].off0;
    if (b === null || m === null || s === null) { fails.push(`${name}: the sheet's edge or the 0" was not read (${b}, ${m}, ${s})`); continue; }
    if (Math.abs(m - b - 1) > 0.25) fails.push(`${name}: the layer 1 device px further read off0 ${r3(m - b)} later`);
    if (Math.abs(b - s - 1) > 0.25) fails.push(`${name}: the sheet 1 device px further read off0 ${r3(b - s)} earlier`);
  }
  return fails;
}

// ------------------------------------------------------------ running
const h = await startHarness({ name: 'ruler-paint-check', port: PORT }).catch((e) => {
  log(`[harness] instrument error: ${e}`);
  process.exit(2);
});
const pw = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
let webkit = null;
const shotsDir = path.join(h.out, 'shots');
if (process.env.SHOTS === '1') fs.mkdirSync(shotsDir, { recursive: true });

/** Open the editor for a scenario: its own browser, window, ratio and scrollbars. */
async function open(sc) {
  const { lay } = sc;
  if (sc.mode === 'change') {
    return { ...await openEditor(h, { viewport: lay.vp, deviceScaleFactor: sc.from, poster: lay.poster, scrollbars: 'default' }), browser: null };
  }
  if (sc.cfg.engine === 'webkit') {
    webkit ??= await pw.webkit.launch();
    return { ...await openEditor(h, { viewport: lay.vp, deviceScaleFactor: sc.cfg.ratio, poster: lay.poster, browser: webkit, scrollbars: lay.scrollbars }), browser: null };
  }
  const browser = await pw.chromium.launch({
    args: [`--force-device-scale-factor=${sc.cfg.ratio}`, `--window-size=${lay.vp.width},${lay.vp.height}`],
    ...(lay.scrollbars === 'classic' ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {}),
  });
  try {
    return { ...await openEditor(h, { viewport: null, poster: lay.poster, browser, scrollbars: lay.scrollbars }), browser };
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
}

/** Panel, Fit and the layout's action; then the pointer off the bars. */
async function arrange(page, lay) {
  if (lay.panel !== 'default') await setGuidelines(page, lay.panel === 'open');
  if (lay.fitted) await clickButton(page, 'Fit poster to screen');
  if (lay.act) await lay.act(page);
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  await page.mouse.move(o.x + o.width - 30, o.y + o.height - 30);
  await settle(page);
}

const frames = (page, n) => page.evaluate((k) => new Promise((res) => {
  let i = 0;
  const step = () => { i += 1; if (i >= k) res(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

async function run(sc) {
  const { context, page, state, browser } = await open(sc);
  try {
    await arrange(page, sc.lay);
    let counters = null;
    let cdp;
    if (sc.mode === 'change') {
      await page.evaluate(() => {
        const k = { resize: 0, resolution: 0 };
        window.__paintCheck = k;
        window.addEventListener('resize', () => { k.resize += 1; });
        matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { k.resolution += 1; });
      });
      cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        mobile: false, width: sc.lay.vp.width, height: sc.lay.vp.height, screenWidth: sc.lay.vp.width, screenHeight: sc.lay.vp.height,
        deviceScaleFactor: sc.to, screenOrientation: { angle: 0, type: 'landscapePrimary' },
      });
      await settle(page);
      await frames(page, 4);
      counters = await page.evaluate(() => ({ ...window.__paintCheck }));
      if (counters.resize !== 0 || counters.resolution < 1) {
        return { error: `control failed: the input was not a change of ratio alone ${JSON.stringify(counters)}` };
      }
    }
    // A window set in CSS px is made a whole number of device px, which can
    // make it a CSS px larger at a fractional ratio (1301 x 777 at 1.25 is
    // 1302 x 778).
    const real = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    const off = (got, want) => got < want || got > want + (Number.isInteger(sc.cfg.ratio) ? 0 : 1);
    if (off(real[0], sc.lay.vp.width) || off(real[1], sc.lay.vp.height) || Math.abs(real[2] - sc.cfg.ratio) > 1e-6) {
      return { error: `control failed: the page is ${real[0]}x${real[1]} at ${real[2]}, not ${sc.lay.vp.width}x${sc.lay.vp.height} at ${sc.cfg.ratio}` };
    }
    const j = await look(page, sc.cfg.engine, { cdp });
    if (j.error) return { error: j.error };
    const v = verdict(j, sc.cfg.position);
    if (v.error) return { error: v.error };
    if (v.observed && process.env.SHOTS === '1') {
      await look(page, sc.cfg.engine, { cdp, save: path.join(shotsDir, `${sc.id.replace(/[^a-z0-9.@-]+/gi, '_')}.png`) });
    }
    let controlFails = [];
    if (sc.control) {
      controlFails = await controls(page, sc.cfg.engine, { smearOnly: sc.mode === 'change', cdp });
      if (!controlFails.length && sc.mode === 'rest' && (!j.top.sheetEdge || !j.left.sheetEdge)) controlFails.push('a sheet edge was not read on the control layout');
    }
    return {
      ...v, position: sc.cfg.position, counters, pageErrors: state.errors.length,
      top: brief(j.top), left: brief(j.left), controlFails,
    };
  } finally {
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

const results = [];
let errors = 0;
for (const sc of chosen) {
  const off = switchesOff(sc.lay.needs);
  if (off.length) {
    results.push({ id: sc.id, config: sc.cfg.id, layout: sc.lay.id, skipped: switchOffReason(off), switchOff: true });
    log(`[skipped] ${sc.id} ${switchOffReason(off)}`);
    continue;
  }
  let r;
  try {
    r = await run(sc);
  } catch (e) {
    r = { error: String(e).slice(0, 300) };
  }
  if (!r.error && r.controlFails?.length) r = { ...r, error: `control failed: ${r.controlFails.join('; ')}` };
  results.push({ id: sc.id, config: sc.cfg.id, layout: sc.lay.id, ...r });
  if (r.error) {
    errors += 1;
    log(`[ERROR] ${sc.id} ${r.error}`);
  } else {
    log(`[${r.observed ? 'OBSERVED' : 'not observed'}] ${sc.id} ${JSON.stringify({ why: r.why || undefined, top: r.top, left: r.left })}`);
  }
}
await webkit?.close().catch(() => {});
await h.stop();

const judged = results.filter((r) => !r.error && !r.switchOff);
const byConfig = {};
for (const r of judged) {
  const c = (byConfig[r.config] ??= { scenarios: 0, observed: 0, ticks: 0, smeared: 0, off0Judged: 0, worstOff0: 0, tickJudged: 0, worstTick: 0, positionCounted: r.position });
  c.scenarios += 1;
  if (r.observed) c.observed += 1;
  for (const x of [r.top, r.left]) {
    c.ticks += x.n ?? 0;
    c.smeared += x.smeared ?? 0;
    if (x.off0 !== null && x.off0 !== undefined) { c.off0Judged += 1; c.worstOff0 = Math.max(c.worstOff0, Math.abs(x.off0)); }
    if (x.worstTick !== null && x.worstTick !== undefined) { c.tickJudged += 1; c.worstTick = Math.max(c.worstTick, Math.abs(x.worstTick)); }
  }
}
const summary = {
  git: h.git, mutant: h.mutant, limits: LIMIT,
  observed: `${judged.filter((r) => r.observed).length} of ${judged.length}`,
  observedIds: judged.filter((r) => r.observed).map((r) => r.id),
  byConfig, errors, switchOff: results.filter((r) => r.switchOff).length,
};
fs.writeFileSync(path.join(h.out, 'results.json'), JSON.stringify({ summary, results }, null, 2));
log(`[harness] ${JSON.stringify(summary)}`);
const exit = errors ? 2 : judged.some((r) => r.observed) ? 1 : 0;
log(`[harness] ${SWITCH_OFF}: ${summary.switchOff}`);
log(`[harness] exit=${exit} wrote ${path.join(h.out, 'results.json')}`);
process.exit(exit);
