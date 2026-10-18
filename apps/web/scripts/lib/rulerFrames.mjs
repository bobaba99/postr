/**
 * ruler-check.mjs --frames (fix 04, cause C; docs/fixes/04-rulers-match-sheet.md):
 * the per-frame scenarios and their runner. The modes, claims, controls and
 * blind spots are in ruler-check.mjs's header; the sampler and the judge are
 * lib/frameRecorder.mjs. Split out of ruler-check.mjs on 2026-10-16 (the
 * port onto main) when the file passed 800 lines: the code moved as it was.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, openEditor, startHarness, switchOffReason, switchesOff } from './editorHarness.mjs';
import { judge, judgeEvent, measureNow, recordEvent, restModel, roLoopControl, selfTest } from './frameRecorder.mjs';
import { changeSizeButton, clickButton, layoutTab, noDialog, rafs, scrollTo, setGuidelines, settle } from './rulerUi.mjs';

/** Judge each frame against the tree's own rest (--own-rest), not 0. */
let OWN_REST = false;

// The controls that the input changed the layout: the reading just before
// the recording started (`pre`) against the recording's late samples.
const shownOf = (frames) => frames.map((f) => f.late).filter((m) => m?.shown);
const MOVED = {
  editorShown: (pre, frames) => !pre.shown && shownOf(frames).length > 0,
  sheetResized: (pre, frames) => pre.shown && shownOf(frames).some((m) => Math.abs(m.slot.w - pre.slot.w) > 1),
  canvasResized: (pre, frames) => pre.shown && new Set(shownOf(frames).map((m) => m.cw)).size > 2 && shownOf(frames).some((m) => Math.abs(m.cw - pre.cw) > 1),
  zoomed: (pre, frames) => pre.shown && new Set(shownOf(frames).map((m) => m.slot.w)).size > 2,
  scrolled: (pre, frames) => pre.shown && shownOf(frames).some((m) => Math.abs(m.sy - pre.sy) > 1),
  /** One step, as a window resize makes it. */
  canvasGrew: (pre, frames) => pre.shown && shownOf(frames).some((m) => m.cw - pre.cw > 1),
};

/**
 * A per-frame scenario: open, `setup` once, then `n` events. Each event:
 * `before(page, k)` (not recorded) brings the editor to the moment before
 * the input, the recorder starts, `act(page, k)` is the input, and the
 * recording runs until the layout is still. `moved` is the event's control.
 */
function frameScenario(id, { viewport, poster, n, setup = null, before = null, act, moved, needs }) {
  return {
    id,
    needs,
    async run(h) {
      const { context, page } = await openEditor(h, { viewport, poster });
      try {
        const controls = { selfTest: await selfTest(page), roLoop: await roLoopControl(page) };
        if (!controls.selfTest.ok) return { error: `control failed: late sampler self test ${JSON.stringify(controls.selfTest)}`, controls };
        if (setup) await setup(page);
        const rest0 = await measureNow(page);
        const model = OWN_REST ? restModel(rest0) : 'sheet';
        if (!model) return { error: `control failed: no rest model fits the reading before the first event ${JSON.stringify({ top: rest0.top, left: rest0.left, centring: rest0.centring })}`, controls };
        const events = [];
        const reps = Number(process.env.RULER_FRAMES_REPS ?? n);
        for (let k = 0; k < reps; k += 1) {
          if (before) await before(page, k);
          const pre = await measureNow(page);
          const rec = await recordEvent(page, () => act(page, k));
          await settle(page, 300);
          const rest = await measureNow(page);
          const v = judgeEvent(rec.frames, model);
          const failed = [];
          if (!moved(pre, rec.frames, k)) failed.push('the input did not change the layout');
          if (!rec.settled) failed.push('the recording did not end still');
          if (v.unjudgeable.length) failed.push(`unjudgeable frames: ${v.unjudgeable.slice(0, 3).join('; ')}`);
          if (!rest.shown || Math.max(Math.abs(rest.slot.l - rest.sheet.l), Math.abs(rest.slot.t - rest.sheet.t), Math.abs(rest.slot.w - rest.sheet.w)) > 0.5) {
            failed.push(`at rest the slot is not where the sheet is ${JSON.stringify({ slot: rest.slot, sheet: rest.sheet })}`);
          }
          if (OWN_REST && judge(rest, model).stale) failed.push(`the rest after the event does not fit the ${model} model`);
          const ev = {
            k, stale: v.stale, staleIdx: v.staleIdx, worstPx: v.worstPx, noMarks: v.noMarks, gapped: v.gapped, worstGapIn: v.worstGapIn, frames: v.frames, shown: v.shown,
            rafStale: v.rafStale, roLoopErrors: rec.roErrors.length, info: rec.info, failed,
          };
          events.push(ev);
          log(`  ${id} #${k}: ${v.stale ? `STALE ${v.stale} frame(s) [${v.staleIdx.join(',')}] worst ${v.worstPx} px${v.noMarks ? ` (${v.noMarks} with a ruler blank)` : ''}${v.gapped ? ` (${v.gapped} partly blank, up to ${v.worstGapIn} in)` : ''}` : 'no stale frame'} · ${v.shown}/${v.frames} frames shown · rafStale ${v.rafStale} · roLoop ${rec.roErrors.length}${failed.length ? ` · CONTROL FAILED: ${failed.join('; ')}` : ''}`);
        }
        const bad = events.filter((e) => e.failed.length);
        if (bad.length) return { error: `control failed on ${bad.length} of ${events.length} events: ${bad[0].failed.join('; ')}`, controls, model, events };
        return { controls, model, events };
      } finally {
        await context.close();
      }
    },
  };
}

const at1280 = { width: 1280, height: 800 };
/** Preview from the Export tab; even events fitted, odd zoomed in 3 and scrolled. */
const openPreview = async (p, k) => {
  await clickButton(p, 'Fit poster to screen');
  if (k % 2 === 1) { await clickButton(p, 'Zoom in', 3); await scrollTo(p, 400, 300); await settle(p, 300); }
  await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
  await p.getByRole('button', { name: /Preview poster/ }).click();
  await p.getByRole('button', { name: 'Back to Editor' }).waitFor();
  await settle(p, 300);
};
// The canvas grows by more than twice the bar in one step at an unchanged
// zoom (the step 9-D review, D-01): a window resize at the zoom floor, and a
// window resized while Preview hides the editor, then Escape.
const bigGrow = { viewport: { width: 800, height: 700 }, poster: { w: 48, h: 36 }, n: 2 };
const panelClose = (pw, ph) => frameScenario(`frames-panel-close-1920x1080-${pw}x${ph}`, {
  viewport: { width: 1920, height: 1080 }, poster: { w: pw, h: ph }, n: 3, needs: 'EDITOR_EXTRAS_ENABLED',
  before: async (p) => { await setGuidelines(p, true); await settle(p, 400); },
  act: (p) => p.click('[title="Hide guidelines"]'),
  moved: MOVED.canvasResized,
});
export const FRAME_SCENARIOS = [
  frameScenario('frames-preview-exit-escape', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 4, before: openPreview,
    act: (p) => p.keyboard.press('Escape'), moved: MOVED.editorShown,
  }),
  frameScenario('frames-window-grows-at-floor', {
    ...bigGrow,
    before: async (p) => {
      await p.setViewportSize(bigGrow.viewport);
      await settle(p, 300);
      await clickButton(p, 'Zoom out', 30);
      await settle(p, 300);
    },
    act: (p) => p.setViewportSize({ width: 2560, height: 1440 }),
    moved: MOVED.canvasGrew,
  }),
  frameScenario('frames-preview-exit-after-window-grows', {
    ...bigGrow,
    before: async (p) => {
      await p.setViewportSize(bigGrow.viewport);
      await settle(p, 300);
      await clickButton(p, 'Fit poster to screen');
      await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
      await p.getByRole('button', { name: /Preview poster/ }).click();
      await p.getByRole('button', { name: 'Back to Editor' }).waitFor();
      await p.setViewportSize({ width: 2560, height: 1440 });
      await settle(p, 400);
    },
    act: (p) => p.keyboard.press('Escape'),
    moved: MOVED.editorShown,
  }),
  frameScenario('frames-preview-exit-button', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 4, before: openPreview,
    act: (p) => p.getByRole('button', { name: 'Back to Editor' }).click(), moved: MOVED.editorShown,
  }),
  // The fit is set by the 42 in height both ways: only the sheet's width changes.
  frameScenario('frames-size-preset-36x42-42x42', {
    viewport: at1280, poster: { w: 36, h: 42 }, n: 4, setup: layoutTab,
    before: async (p, k) => {
      await noDialog(p);
      await p.getByLabel('Poster size', { exact: true }).selectOption(k % 2 === 0 ? '42×42' : '36×42');
      await changeSizeButton(p).waitFor();
      await settle(p, 300);
    },
    act: (p) => changeSizeButton(p).click(),
    moved: MOVED.sheetResized,
  }),
  // 48×36 ↔ 24×36 at the fit: the sheet halves and doubles in width, so with
  // scrollbars that take space (POSTR_SCROLLBARS=classic) one appears or
  // goes and resizes the canvas inside the same resize-observer pass (the
  // step 9 review of cause C, S9C-04: a refit rendered in that pass raised
  // "ResizeObserver loop completed with undelivered notifications").
  frameScenario('frames-size-preset-48x36-24x36', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 4, setup: layoutTab,
    before: async (p, k) => {
      await noDialog(p);
      await p.getByLabel('Poster size', { exact: true }).selectOption(k % 2 === 0 ? '24×36' : '48×36');
      await changeSizeButton(p).waitFor();
      await settle(p, 300);
    },
    act: (p) => changeSizeButton(p).click(),
    moved: MOVED.sheetResized,
  }),
  // The same change reached by undo (no dialog): 36×42 → 42×42 by the menu, then Ctrl/Cmd+Z.
  frameScenario('frames-undo-size-change', {
    viewport: at1280, poster: { w: 36, h: 42 }, n: 3, setup: layoutTab,
    before: async (p) => {
      await p.getByLabel('Poster size', { exact: true }).selectOption('42×42');
      await changeSizeButton(p).click();
      await noDialog(p);
      await settle(p, 400);
      // Undo is a document shortcut: take the focus off the menu, on the empty workspace.
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.click(o.x + o.width - 30, o.y + o.height / 2);
      await settle(p, 300);
    },
    act: (p) => p.keyboard.press('ControlOrMeta+z'),
    moved: MOVED.sheetResized,
  }),
  panelClose(48, 36),
  panelClose(36, 48),
  frameScenario('frames-sidebar-hide', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 3,
    before: async (p) => {
      const show = p.getByRole('button', { name: 'Show sidebar' });
      if (await show.count()) await show.click();
      await settle(p, 900);
    },
    act: (p) => p.getByRole('button', { name: 'Hide sidebar' }).click(),
    moved: MOVED.canvasResized,
  }),
  // From the fit, 20 ctrl+wheel steps of -8 near the canvas's bottom-right
  // corner (a large anchor scroll per step), two frames apart.
  frameScenario('frames-pinch-in', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 2,
    before: async (p) => {
      await clickButton(p, 'Fit poster to screen');
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.move(o.x + o.width - 40, o.y + o.height - 60);
      await settle(p, 300);
    },
    act: async (p) => {
      await p.keyboard.down('Control');
      for (let i = 0; i < 20; i += 1) { await p.mouse.wheel(0, -8); await rafs(p, 2); }
      await p.keyboard.up('Control');
    },
    moved: MOVED.zoomed,
  }),
  // A plain wheel scroll, zoomed in 4 steps: 30 px down, then up. Only the
  // scroll moves the sheet, so this is the one input that reaches the rulers
  // by their scroll listener alone (a pinch step also resizes the frame).
  // Main-thread frames only: a frame the compositor draws on its own during
  // a threaded scroll is not seen by any sampler in the page.
  frameScenario('frames-wheel-scroll', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 4,
    setup: async (p) => {
      await clickButton(p, 'Zoom in', 4);
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
      await settle(p, 300);
    },
    act: (p, k) => p.mouse.wheel(0, k % 2 === 0 ? 30 : -30),
    moved: MOVED.scrolled,
  }),
  // One instant scroll across more than a bar's length (a jump by script, or
  // a scrollbar thumb dragged fast): the marks must reach across the whole
  // scrollable content, not only past the bars' ends.
  frameScenario('frames-scroll-jump-far', {
    viewport: at1280, poster: { w: 48, h: 36 }, n: 4,
    // 40 steps in from the fit (about 7.4× at 1280 × 800, 48 × 36 in): the
    // canvas scrolls several of its heights.
    setup: async (p) => { await clickButton(p, 'Zoom in', 40); await settle(p, 300); },
    before: async (p, k) => {
      await p.evaluate((top) => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTo(0, top ? 0 : o.scrollHeight); }, k % 2 === 0);
      await settle(p, 300);
    },
    // Down (then up) by 2.5 of the canvas's heights: the left ruler's bar.
    act: (p, k) => p.evaluate((down) => {
      const o = document.querySelector('[data-postr-canvas-outer]');
      o.scrollBy({ top: (down ? 1 : -1) * 2.5 * o.clientHeight, behavior: 'instant' });
    }, k % 2 === 0),
    moved: MOVED.scrolled,
  }),
];

/**
 * The lead's gate since the port onto main: each of the user's inputs once,
 * frame by frame, at 1024, 1280 and 1920 px wide, with the sidebar shown
 * and hidden (the top bar above the workspace in every one). One event per
 * input, in this order; `before` puts the editor where the input starts
 * from, outside the recording.
 */
const zoomChanged = (pre, frames) => pre.shown && shownOf(frames).some((m) => Math.abs(m.slot.w - pre.slot.w) > 1);
// The Show sidebar button is drawn only while the sidebar is hidden; the
// Hide sidebar button stays mounted inside the collapsed sidebar, so it is
// not a sign of the sidebar being open.
const sidebarHidden = async (p) => (await p.getByRole('button', { name: 'Show sidebar' }).count()) > 0;
const toggleSidebar = async (p) => {
  if (await sidebarHidden(p)) await p.getByRole('button', { name: 'Show sidebar' }).click();
  else await p.getByRole('button', { name: 'Hide sidebar' }).click();
};
const MATRIX_INPUTS = [
  { name: 'zoom-in', before: (p) => clickButton(p, 'Fit poster to screen'), act: (p) => p.getByRole('button', { name: 'Zoom in' }).click(), moved: zoomChanged },
  { name: 'zoom-out', before: null, act: (p) => p.getByRole('button', { name: 'Zoom out' }).click(), moved: zoomChanged },
  { name: 'fit', before: (p) => clickButton(p, 'Zoom in', 3), act: (p) => p.getByRole('button', { name: 'Fit poster to screen' }).click(), moved: zoomChanged },
  {
    name: 'pinch',
    before: async (p) => {
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.move(o.x + o.width * 0.6, o.y + o.height * 0.6);
      await settle(p, 200);
    },
    act: async (p) => {
      await p.keyboard.down('Control');
      for (let i = 0; i < 8; i += 1) { await p.mouse.wheel(0, -8); await rafs(p, 2); }
      await p.keyboard.up('Control');
    },
    moved: zoomChanged,
  },
  {
    name: 'wheel-scroll',
    before: async (p) => {
      // Zoomed in until the canvas scrolls down by more than the wheel's
      // 40 px (on a narrow canvas a width-limited sheet can still fit its
      // height), then from the middle of the scroll range, so the wheel has
      // room (the pinch before it can leave the view at the far end).
      for (let i = 0; i < 12; i += 1) {
        const room = await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); return o.scrollHeight - o.clientHeight; });
        if (i >= 2 && room > 120) break;
        await clickButton(p, 'Zoom in', 1);
      }
      await p.evaluate(() => {
        const o = document.querySelector('[data-postr-canvas-outer]');
        o.scrollTo((o.scrollWidth - o.clientWidth) / 2, (o.scrollHeight - o.clientHeight) / 2);
      });
      await settle(p, 300);
      const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
      await p.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
      await settle(p, 200);
    },
    act: (p) => p.mouse.wheel(0, 40),
    moved: MOVED.scrolled,
  },
  { name: 'window-grows', before: null, act: (p, vp) => p.setViewportSize({ width: vp.width + 200, height: vp.height + 100 }), moved: MOVED.canvasGrew },
  {
    name: 'window-shrinks',
    before: null,
    act: (p, vp) => p.setViewportSize(vp),
    moved: (pre, frames) => pre.shown && shownOf(frames).some((m) => pre.cw - m.cw > 1),
  },
  { name: 'sidebar-toggle', before: null, act: (p) => toggleSidebar(p), moved: MOVED.canvasResized },
  { name: 'sidebar-toggle-back', before: (p) => settle(p, 600), act: (p) => toggleSidebar(p), moved: MOVED.canvasResized },
  {
    // Preview opens from the Export tab, so the sidebar is shown for it, and
    // Escape comes back to the editor as it was (the sidebar shown).
    name: 'preview-exit',
    before: async (p) => {
      await showSidebar(p);
      await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
      await p.getByRole('button', { name: /Preview poster/ }).click();
      await p.getByRole('button', { name: 'Back to Editor' }).waitFor();
      await settle(p, 400);
    },
    act: (p) => p.keyboard.press('Escape'),
    moved: MOVED.editorShown,
  },
  {
    // A new size from the Layout tab, sidebar shown; with the sidebar hidden,
    // the same change made with it shown, the sidebar hidden, then undone
    // with Ctrl/Cmd+Z (the one way to change the size with it hidden).
    name: 'size-change',
    before: async (p, vp, sidebar) => {
      await showSidebar(p);
      await layoutTab(p);
      const now = await p.getByLabel('Poster size', { exact: true }).inputValue();
      await p.getByLabel('Poster size', { exact: true }).selectOption(now === '24×36' ? '48×36' : '24×36');
      await changeSizeButton(p).waitFor();
      await settle(p, 300);
      if (sidebar === 'hidden') {
        await changeSizeButton(p).click();
        await noDialog(p);
        await settle(p, 400);
        await p.getByRole('button', { name: 'Hide sidebar' }).click();
        await settle(p, 900);
        const o = await p.locator('[data-postr-canvas-outer]').boundingBox();
        await p.mouse.click(o.x + o.width - 30, o.y + o.height / 2);
        await settle(p, 300);
      }
    },
    act: (p, vp, sidebar) => (sidebar === 'hidden' ? p.keyboard.press('ControlOrMeta+z') : changeSizeButton(p).click()),
    moved: MOVED.sheetResized,
  },
];
const showSidebar = async (p) => {
  if (await sidebarHidden(p)) {
    await p.getByRole('button', { name: 'Show sidebar' }).click();
    await settle(p, 900);
  }
};
const hideSidebar2 = async (p) => {
  if (!(await sidebarHidden(p))) {
    await p.getByRole('button', { name: 'Hide sidebar' }).click();
    await settle(p, 900);
  }
};
const matrixScenario = (vw, vh, sidebar) => {
  const vp = { width: vw, height: vh };
  const input = (k) => MATRIX_INPUTS[k % MATRIX_INPUTS.length];
  return frameScenario(`frames-matrix-${vw}x${vh}-sidebar-${sidebar}`, {
    viewport: vp, poster: { w: 48, h: 36 }, n: MATRIX_INPUTS.length,
    before: async (p, k) => {
      // Every input starts with the sidebar as the scenario has it, except
      // the toggle's second press, which starts from the first one's.
      if (input(k).name !== 'sidebar-toggle-back') await (sidebar === 'hidden' ? hideSidebar2(p) : showSidebar(p));
      if (input(k).before) await input(k).before(p, vp, sidebar);
    },
    act: (p, k) => input(k).act(p, vp, sidebar),
    moved: (pre, frames, k) => input(k).moved(pre, frames),
  });
};
for (const [vw, vh] of [[1024, 768], [1280, 800], [1920, 1080]]) {
  for (const sidebar of ['shown', 'hidden']) FRAME_SCENARIOS.push(matrixScenario(vw, vh, sidebar));
}


/** Run `chosen` per frame; the exit code (0 none stale, 1 a stale frame, 2 an instrument error). */
export async function runFrames(chosen, { port, ownRest = false, fail }) {
  OWN_REST = ownRest;
  const hf = await startHarness({ name: 'ruler-check', port }).catch(fail);
  const rows = [];
  for (const sc of chosen) {
    const off = switchesOff(sc.needs);
    if (off.length) {
      rows.push({ id: sc.id, skipped: switchOffReason(off), switchOff: true });
      log(`[skipped] ${sc.id} ${switchOffReason(off)}`);
      continue;
    }
    try {
      const r = await sc.run(hf);
      const ev = r.events ?? [];
      const staleEv = ev.filter((e) => e.stale > 0);
      const row = {
        id: sc.id, error: r.error ?? null, model: r.model, observed: !r.error && staleEv.length > 0,
        events: `${staleEv.length} of ${ev.length}`, staleFramesPerEvent: ev.map((e) => e.stale),
        worstPx: Math.max(0, ...ev.map((e) => e.worstPx)), blankRulerFrames: ev.reduce((a, e) => a + e.noMarks, 0), partlyBlankFrames: ev.reduce((a, e) => a + (e.gapped ?? 0), 0),
        framesPerEvent: ev.map((e) => e.frames), rafStalePerEvent: ev.map((e) => e.rafStale),
        roLoopErrors: ev.reduce((a, e) => a + e.roLoopErrors, 0), controls: r.controls && { selfTest: r.controls.selfTest.ok, roLoopControlCaught: r.controls.roLoop.caught },
        detail: ev,
      };
      rows.push(row);
      const { detail: _d, ...brief } = row;
      log(`[${row.error ? 'ERROR' : row.observed ? 'OBSERVED' : 'not observed'}] ${sc.id} ${JSON.stringify(brief)}`);
    } catch (e) {
      rows.push({ id: sc.id, error: String(e).slice(0, 300) });
      log(`[ERROR] ${sc.id} ${String(e).slice(0, 300)}`);
    }
  }
  await hf.stop();
  const errored = rows.filter((r) => r.error);
  const seen = rows.filter((r) => r.observed);
  const switchOff = rows.filter((r) => r.switchOff).length;
  const judgedRows = rows.filter((r) => !r.error && !r.switchOff);
  const summary = {
    git: hf.git, engine: hf.engine, scrollbars: hf.scrollbars, mutant: hf.mutant, mode: OWN_REST ? 'frames, own rest' : 'frames, against the sheet',
    observed: `${seen.length} of ${judgedRows.length}`, observedIds: seen.map((r) => r.id),
    events: judgedRows.reduce((a, r) => a + (r.detail?.length ?? 0), 0),
    staleEvents: judgedRows.reduce((a, r) => a + (r.detail ?? []).filter((e) => e.stale > 0).length, 0),
    frames: judgedRows.reduce((a, r) => a + (r.detail ?? []).reduce((b, e) => b + e.frames, 0), 0),
    framesShown: judgedRows.reduce((a, r) => a + (r.detail ?? []).reduce((b, e) => b + e.shown, 0), 0),
    roLoopErrors: judgedRows.reduce((a, r) => a + (r.roLoopErrors ?? 0), 0),
    worstPx: Math.max(0, ...rows.map((r) => r.worstPx ?? 0)), errors: errored.length, switchOff,
  };
  fs.writeFileSync(path.join(hf.out, 'frames-results.json'), JSON.stringify({ summary, results: rows }, null, 2));
  log(`[harness] ${JSON.stringify(summary)}`);
  const exitF = errored.length ? 2 : seen.length ? 1 : 0;
  log(`[harness] exit=${exitF} wrote ${path.join(hf.out, 'frames-results.json')}`);
  return exitF;
}
