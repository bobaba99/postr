/**
 * ⌘P / Ctrl+P under the engine's real popup blocker, for
 * scripts/print-path-check.mjs (record docs/fixes/30-one-print-path.md;
 * review round 1, R1-F2, whose probe this is, folded in).
 *
 * Playwright launches its engines with their popup blockers off: its
 * Firefox profile sets dom.disable_open_during_load to false (Firefox ships
 * it true, in its firefox.js), and Chromium gets --disable-popup-blocking.
 * Here the engine is launched again with the blocker on: Firefox with
 * dom.disable_open_during_load true, Chromium without
 * --disable-popup-blocking, WebKit as Playwright launches it.
 *
 * CONTROL (K-blocker): the editor page itself tries to open a window from
 * a timer TIMER_MS after it loads, with no user input and no Playwright
 * evaluate in the GAP_MS before it (in review round 1 a timer started
 * inside an evaluate opened a window in Firefox, probably because the
 * evaluate counts as a user gesture). Blocked: the blocker is on, and the key pressed
 * after it is measured. Opened: this engine's build blocks nothing here; in
 * Firefox that fails the control (the pref did not take), elsewhere the
 * engine is reported as not measurable (review round 1 found Chromium's and
 * WebKit's builds opened even this window).
 *
 * MEASURE: ⌘P / Ctrl+P pressed after the timer, with no evaluate between:
 * whether the print window opened, and any alert.
 */
const TIMER_MS = 20000;
const GAP_MS = 6000;

/** The engine's launch options with its popup blocker on. */
function blockerOn(engine) {
  if (engine === 'firefox') return { firefoxUserPrefs: { 'dom.disable_open_during_load': true } };
  if (engine === 'chromium') return { ignoreDefaultArgs: ['--disable-popup-blocking'] };
  return {};
}

/**
 * Open the editor on `poster` in a browser with its blocker on, wait for the
 * page's own timer window, press ⌘P / Ctrl+P. Returns
 * { engine, timer: 'blocked'|'opened'|'pending', gapMs, timerBeforePress,
 *   opened, alerts }.
 */
export async function keyUnderBlocker({ h, engines, openEditor, sleep, poster, assets }) {
  const raw = await engines[h.engine].launch(blockerOn(h.engine));
  const browser = {
    newContext: async (o) => {
      const c = await raw.newContext(o);
      await c.addInitScript((ms) => {
        if (!location.pathname.startsWith('/p/')) return;
        window.__zqTimerWindow = 'pending';
        setTimeout(() => {
          const w = window.open('', '_blank', 'width=200,height=200');
          window.__zqTimerWindow = w ? 'opened' : 'blocked';
          window.__zqTimerAt = Date.now();
          if (w) w.close();
        }, ms);
      }, TIMER_MS);
      return c;
    },
  };
  const out = { engine: h.engine };
  let ed = null;
  try {
    ed = await openEditor(h, { browser, viewport: { width: 1440, height: 900 }, poster: poster.size, editDoc: (doc) => ({ ...doc, ...poster.build(assets) }) });
    const { page } = ed;
    const chord = (await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))) ? 'Meta+KeyP' : 'Control+KeyP';
    // Every evaluate is behind this point: the page loaded before it, so its
    // timer fires at the latest TIMER_MS after it.
    const lastEval = Date.now();
    const alerts = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await sleep(TIMER_MS + 1500);
    const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
    const pressAt = Date.now();
    await page.keyboard.press(chord);
    const popup = await popupP;
    await sleep(500);
    const timer = await page.evaluate(() => ({ state: window.__zqTimerWindow, at: window.__zqTimerAt ?? null }));
    Object.assign(out, {
      timer: timer.state,
      gapMs: timer.at ? timer.at - lastEval : null,
      timerBeforePress: timer.at ? timer.at < pressAt : false,
      opened: !!popup,
      alerts,
    });
    if (popup) await popup.close().catch(() => {});
  } finally {
    await ed?.context.close().catch(() => {});
    await raw.close().catch(() => {});
  }
  return out;
}

/** Whether the control held: the page's own timer window was blocked, long enough after the last evaluate and before the key. */
export const blockerHeld = (r) => r.timer === 'blocked' && r.gapMs !== null && r.gapMs >= GAP_MS && r.timerBeforePress;
