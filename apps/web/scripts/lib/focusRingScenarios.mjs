/**
 * The house focus ring after a mouse click and after keyboard navigation, in
 * the editor's chrome (plan item 20; record docs/fixes/20-focus-ring.md).
 * Scenarios for scripts/fit-check.mjs, which runs them (claims Hm, Hk and
 * the information claim Hm-info), extending record 03's Hr2 and Hr3.
 *
 * Every press is the user's: a real mouse click at a button's centre, or a
 * real key (Tab, and Alt+Tab in WebKit, where Tab alone skips buttons as in
 * Safari). A "ring" is read on the focused element as the browser computes
 * it: an outline that is not `none` and wider than 0 (the house ring is
 * `2px solid`; the browser's own is `auto`). `focus-tab-keys` also reads
 * the paint: the ring's colour in a screenshot of Zoom in (control K-paint).
 *
 *   Hm  after a mouse click on a chrome button that keeps the focus on it,
 *       a key other than Tab (↓, ←, Shift, Enter, Space, a letter, ⌘Z /
 *       Ctrl+Z, Esc) leaves a ring drawn on that button, or the house
 *       rule's 4 px corners on a button whose own are not: the zoom bar's
 *       four, the top bar's Undo, Redo, A−, A+ and Save PDF, the ten rail
 *       tabs, the sidebar's Hide and Show and four panel buttons; and every
 *       visible button outside the sheet in each sidebar tab, pressed with
 *       the mouse (its click held back by the harness, so a press changes
 *       nothing) and then Shift and ↓ (`focus-mouse-sweep`); outside the
 *       editor, the public pages' menu button at 1024 px (its own corners
 *       are 6 px; `focus-mouse-public-menu`); and the chrome's other click
 *       targets, the browser's own ring (`focus-mouse-siblings`: every
 *       focusable element outside the sheet that is not a button or a text
 *       field, pressed, then Shift). The two sweeps also run with a block
 *       of each kind selected (the Edit tab's own controls: the table's
 *       tips are a <summary>; review round 1 of record 20, R20-1); and the
 *       <summary> disclosures with every key (`focus-mouse-summary`: the
 *       table's tips, the sign-up page's email preferences, the pricing
 *       page's "What's included" at phone width). A case counts
 *       when the click left the focus on the button and the key left it
 *       there; a key that moved the focus is counted apart, in the same
 *       result (`moved`: a ring where the focus went).
 *   Hm-move  after a mouse press, a key that moves the focus leaves a ring
 *       where the focus went: a dialog opened with the mouse and closed with
 *       Esc (the opener), then opened again from its opener with Enter (its
 *       focused button) and closed with Esc: the template's dialog and the
 *       dashboard's Delete dialog (`focus-dialog-mouse`; R20-2). The plan's
 *       rule: Enter and Esc pressed after a click do not switch the ring on.
 *   Hk  keyboard navigation loses a ring it has today (WCAG 2.4.7): a
 *       button (or link, or checkbox) reached by Tab or Shift+Tab, after a
 *       click elsewhere, draws no ring (every one met going forward and back from each rail
 *       tab, and through the zoom bar); a key pressed after Tab (the same
 *       eight) leaves the button focused without its ring (Zoom in, a rail
 *       tab, A+, Undo, Save PDF); a dialog opened with Enter from a button
 *       reached by Tab shows no ring on its focused button, or on the
 *       opener after Esc; before any input, a button a script focuses
 *       draws no ring where the browser's :focus-visible matches (the
 *       ring as it was before the fix; `focus-script-before-input`); a
 *       <summary> reached by Shift+Tab draws no ring (`focus-tab-summary`,
 *       the three of focus-mouse-summary); the dashboard's Delete dialog
 *       from the keyboard (in `focus-dialog-keyboard`).
 *   Hm-info  INFORMATION, not counted: a dialog opened with the mouse (its
 *       focused button, and the opener after a click on Cancel, in
 *       focus-dialog-mouse's result), a script's focus after a Shift press,
 *       the onboarding tour, a selected block's move control pressed and
 *       then ↓, the sheet's own buttons in the sweep, the browser's own
 *       :focus-visible after the modifier keys alone and in a chord
 *       (`focus-mouse-modifiers`; R20-4), and a keyboard user's ring after
 *       a click on A+, which keeps the focus where it was
 *       (`focus-keyboard-then-press`; R20-3).
 *
 * WebKit does not focus a button on a click (Safari's rule): its Hm cases
 * are reported as "0 of 0" measurable, the engine's own answer, not a pass
 * of the fix. Firefox focuses it and draws no ring after a key, before the
 * fix as after.
 */
import { randomUUID } from 'node:crypto';
import { installMocks } from './editorHarness.mjs';
import {
  NON_TAB_KEYS, tabKey, readFocus, blur, clickOn, exists, makeStep, offBound, clickThenKey, hmResult,
  closePopups, editor, sweepPasses, tabUntil, ringPaint, DIALOGS, hoverClick, SUMMARIES,
} from './focusRingKit.mjs';

export { NON_TAB_KEYS, readFocus } from './focusRingKit.mjs';

// ------------------------------------------------------------ scenarios
export const FOCUS_RING_SCENARIOS = [];

/** Hm on a fixed list of buttons, each with every non-Tab key. */
function family(id, buttons) {
  FOCUS_RING_SCENARIOS.push({
    id, claim: 'Hm',
    async run(h) {
      const { context, page } = await editor(h);
      closePopups(context);
      try {
        const cases = [];
        for (const b of await (typeof buttons === 'function' ? buttons(page) : buttons)) {
          for (const key of NON_TAB_KEYS) {
            if (b.before) await b.before(page);
            if (!(await exists(page, b.d))) throw new Error(`precondition: ${b.name} is on screen and enabled`);
            cases.push({ button: b.name, ...(await clickThenKey(page, b.d, key)) });
            if (b.after) await b.after(page);
          }
        }
        return hmResult(cases);
      } finally {
        await context.close();
      }
    },
  });
}

family('focus-mouse-zoombar', ['Zoom out', 'Reset zoom to fit', 'Zoom in', 'Fit poster to screen']
  .map((l) => ({ name: l, d: { css: `[aria-label="${l}"]` } })));

family('focus-mouse-topbar', [
  { name: 'Undo', d: { css: '[aria-label="Undo"]' }, before: makeStep },
  {
    name: 'Redo', d: { css: '[aria-label="Redo"]' },
    async before(page) { await makeStep(page); await clickOn(page, { css: '[aria-label="Undo"]' }); await page.waitForTimeout(150); },
  },
  // At a bound the button is aria-disabled: the other one first moves off it.
  { name: 'A−', d: { css: '[aria-label="Decrease text size"]' }, before: offBound('Decrease', 'Increase') },
  { name: 'A+', d: { css: '[aria-label="Increase text size"]' }, before: offBound('Increase', 'Decrease') },
  { name: 'Save PDF', d: { css: '[data-postr-topbar-print]' } },
]);

family('focus-mouse-rail', async (page) => (await page.$$eval('button[data-postr-tab]', (els) => els.map((e) => e.firstChild.textContent)))
  .map((t) => ({ name: t, d: { tab: t } })));

const showSidebar = async (page) => {
  if (await exists(page, { css: '[aria-label="Show sidebar"]' })) {
    await clickOn(page, { css: '[aria-label="Show sidebar"]' });
    await page.waitForTimeout(500);
  }
};
const hideSidebar = async (page) => {
  if (await exists(page, { css: '[aria-label="Hide sidebar"]' })) {
    await clickOn(page, { css: '[aria-label="Hide sidebar"]' });
    await page.waitForTimeout(500);
  }
};
const inTab = (tab) => async (page) => { await showSidebar(page); await clickOn(page, { tab }); await page.waitForTimeout(300); };
family('focus-mouse-sidebar', [
  { name: 'Hide sidebar', d: { css: '[aria-label="Hide sidebar"]' }, before: showSidebar },
  { name: 'Show sidebar', d: { css: '[aria-label="Show sidebar"]' }, before: hideSidebar },
  { name: 'Auto-Arrange', d: { text: '⬡Auto-Arrange' }, before: inTab('layout') },
  { name: 'a palette', d: { text: 'Nature / Biology' }, before: inTab('style') },
  { name: 'an author ▼', d: { text: '▼' }, before: inTab('authors') },
  { name: 'Save version', d: { text: 'Save version' }, before: inTab('versions') },
]);

FOCUS_RING_SCENARIOS.push({
  // Every visible button outside the sheet in each sidebar tab, and with a
  // block of each kind selected, pressed with the mouse (the harness holds
  // its click back in the capture phase, so the press changes nothing; the
  // focus a press gives comes from the pointer going down), then Shift,
  // then ↓.
  id: 'focus-mouse-sweep', claim: 'Hm',
  async run(h) {
    const { context, page } = await editor(h);
    closePopups(context);
    try {
      await page.evaluate(() => {
        window.addEventListener('click', (e) => {
          if (window.__zqHold) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
      });
      const seen = new Set();
      const cases = [];
      const sheet = { buttons: 0, rings: 0 };
      const newIn = {};
      for (const pass of await sweepPasses(page)) {
        if (!(await pass.open())) continue;
        let outside = 0;
        const n = await page.$$eval('button, [role="button"]', (els) => els.length);
        for (let i = 0; i < n; i += 1) {
          const it = await page.evaluate((i) => {
            const el = document.querySelectorAll('button, [role="button"]')[i];
            if (!el || el.disabled || el.closest('[inert]') || el.getClientRects().length === 0) return null;
            const where = el.closest('#poster-canvas') ? 'sheet' : el.closest('[data-postr-editor-topbar]') ? 'topbar'
              : el.closest('[data-postr-canvas-chrome]') ? 'zoombar' : el.closest('[data-postr-sidebar]') ? 'sidebar' : 'other';
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2; const y = r.top + r.height / 2;
            const top = document.elementFromPoint(x, y);
            if (!top || !(el === top || el.contains(top))) return null;
            const labelOf = (e) => e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim().replace(/\s+/g, ' ').slice(0, 28);
            const label = labelOf(el);
            // Two buttons with one label (the authors tab's two ×) are told
            // apart by their order among those with it.
            const nth = [...document.querySelectorAll('button, [role="button"]')].slice(0, i).filter((e) => labelOf(e) === label).length;
            document.querySelectorAll('[data-zq-sweep]').forEach((e) => e.removeAttribute('data-zq-sweep'));
            el.setAttribute('data-zq-sweep', '');
            return { x, y, where, key: `${where}|${label}${nth ? ` #${nth + 1}` : ''}` };
          }, i);
          if (!it || seen.has(it.key)) continue;
          seen.add(it.key);
          if (it.where !== 'sheet') outside += 1;
          await blur(page);
          await page.evaluate(() => { window.__zqHold = true; });
          await page.mouse.click(it.x, it.y);
          await page.evaluate(() => { window.__zqHold = false; });
          await page.waitForTimeout(80);
          const d = { css: '[data-zq-sweep]' };
          const clicked = await readFocus(page, d);
          const rec = { button: it.key, kept: clicked.isTarget, ringAfterClick: clicked.isTarget && clicked.ring };
          for (const key of ['Shift', 'ArrowDown']) {
            await page.keyboard.press(key);
            await page.waitForTimeout(80);
            const after = await readFocus(page, d);
            const c = { ...rec, key, stayed: rec.kept && after.isTarget, ring: rec.kept && after.isTarget && after.ring };
            if (it.where === 'sheet') {
              sheet.buttons += key === 'Shift' ? 1 : 0;
              sheet.rings += c.ring ? 1 : 0;
            } else cases.push(c);
          }
        }
        newIn[pass.name] = outside;
      }
      return hmResult(cases, {
        buttons: seen.size - sheet.buttons,
        // Buttons outside the sheet first met with a block selected.
        newWithSelection: Object.fromEntries(Object.entries(newIn).filter(([k]) => k.endsWith(' selected'))),
        sheetInfo: `${sheet.rings} rings in ${sheet.buttons * 2} presses on the sheet's own buttons (information)`,
      });
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // Forward and back from each rail tab, clicked first (so each run also
  // starts as "a click, then Tab"), and through the zoom bar from FIT: every
  // button, link and checkbox the keyboard reaches draws a ring.
  id: 'focus-tab-sweep', claim: 'Hk',
  async run(h) {
    const { context, page } = await editor(h);
    closePopups(context);
    try {
      const tabs = await page.$$eval('button[data-postr-tab]', (els) => els.map((e) => e.firstChild.textContent));
      const met = new Map();
      // How many visits drew each look (outline, offset, radius): the same
      // counts on two trees mean the keyboard rings look the same.
      const looks = {};
      const walk = async (start, back, max) => {
        await blur(page);
        await clickOn(page, start);
        await page.waitForTimeout(300);
        // Each element visited is marked, so the walk stops where it came
        // round (two fields with one label are still two elements).
        await page.evaluate(() => document.querySelectorAll('[data-zq-walked]').forEach((e) => e.removeAttribute('data-zq-walked')));
        for (let i = 0; i < max; i += 1) {
          await page.keyboard.press(tabKey(page, back));
          await page.waitForTimeout(60);
          const f = await readFocus(page);
          const again = await page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body) return true;
            if (a.hasAttribute('data-zq-walked')) return true;
            a.setAttribute('data-zq-walked', '');
            return false;
          });
          if (f.on === 'BODY' || f.inSheet || again) break;
          if (f.isButton || f.isOtherTarget) {
            const key = f.isOtherTarget && !f.isButton ? `${f.on} (${f.kind})` : f.on;
            met.set(key, (met.get(key) ?? true) && f.ring);
            looks[f.look] = (looks[f.look] ?? 0) + 1;
          }
        }
      };
      for (const tab of tabs) {
        await walk({ tab }, false, 60);
        await walk({ tab }, true, 30);
      }
      await walk({ css: '[aria-label="Fit poster to screen"]' }, true, 3);
      const noRing = [...met].filter(([, ring]) => !ring).map(([k]) => k);
      if (met.size < 20) throw new Error(`precondition: the keyboard reached 20 or more buttons, got ${met.size}`);
      const kinds = {};
      for (const k of met.keys()) { const m = k.match(/\((a|input\[checkbox\]|summary)\)$/); kinds[m ? m[1] : 'button'] = (kinds[m ? m[1] : 'button'] ?? 0) + 1; }
      return { observed: noRing.length > 0, buttons: met.size, kinds, noRing: noRing.length, ...(noRing.length ? { examples: noRing.slice(0, 8).join(', ') } : {}), looks };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A button reached by Tab or Shift+Tab, then each non-Tab key: the ring
  // stays while the focus does. Also the paint, on Zoom in (control K-paint
  // in the result: the ring's colour is on screen around it, not only in
  // its computed style).
  id: 'focus-tab-keys', claim: 'Hk',
  async run(h) {
    const { context, page } = await editor(h);
    closePopups(context);
    try {
      const targets = [
        { name: 'Zoom in', d: { css: '[aria-label="Zoom in"]' }, from: { css: '[aria-label="Fit poster to screen"]' }, back: true },
        { name: 'a rail tab (style)', d: { tab: 'style' }, from: { tab: 'layout' }, back: false },
        { name: 'A+', d: { css: '[aria-label="Increase text size"]' }, from: { tab: 'layout' }, back: true },
        { name: 'Undo', d: { css: '[aria-label="Undo"]' }, from: { tab: 'layout' }, back: true, steps: 6 },
        { name: 'Save PDF', d: { css: '[data-postr-topbar-print]' }, from: { tab: 'layout' }, back: true },
      ];
      const lost = [];
      const out = {};
      let paint = null;
      // A click on `from`, then Tab or Shift+Tab until the target has the focus.
      const reach = async (t) => {
        await blur(page);
        await clickOn(page, t.from);
        await page.waitForTimeout(300);
        if (!(await tabUntil(page, t.d, { back: t.back }))) throw new Error(`precondition: the keyboard reaches ${t.name}`);
      };
      for (const t of targets) {
        for (let i = 0; i < (t.steps ?? 0); i += 1) await makeStep(page);
        await reach(t);
        const first = await readFocus(page, t.d);
        const row = { tabbed: first.ring ? 'ring' : 'NO RING' };
        if (!first.ring) lost.push(`${t.name} after Tab`);
        if (t.name === 'Zoom in') paint = await ringPaint(page, t.d);
        for (const key of NON_TAB_KEYS) {
          // A key before this one moved the focus: reach the target again the same way.
          if (!(await readFocus(page, t.d)).isTarget) await reach(t);
          await page.keyboard.press(key);
          await page.waitForTimeout(180);
          const f = await readFocus(page, t.d);
          row[key] = !f.isTarget ? `moved to ${f.on}${f.ring ? ' (ring)' : ''}` : f.ring ? 'ring' : 'NO RING';
          if (f.isTarget && !f.ring) lost.push(`${t.name} ${key}`);
          if (!f.isTarget && f.isButton && !f.ring) lost.push(`${t.name} ${key} → ${f.on}`);
        }
        out[t.name] = row;
      }
      if (!paint || paint.ringPixels < 20) throw new Error(`control K-paint: a ring drawn on Zoom in after Tab shows in the screenshot, got ${JSON.stringify(paint)}`);
      return { observed: lost.length > 0, lost: lost.join(', ') || 'none', paint, ...out };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // Reproduces the Hm defect's paint on Zoom in: after a click and ↓, how
  // many ring-coloured pixels are on screen around it (information; the
  // counted claim is focus-mouse-zoombar's computed ring).
  id: 'focus-mouse-paint', claim: 'Hm-info',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const d = { css: '[aria-label="Zoom in"]' };
      const c = await clickThenKey(page, d, 'ArrowDown');
      return { ...c, paint: await ringPaint(page, d) };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A dialog opened from the keyboard: Tab to its opener (a template tile;
  // the dashboard's Delete on a card), Enter. The dialog's focused button,
  // and the opener after Esc, draw a ring.
  id: 'focus-dialog-keyboard', claim: 'Hk',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const out = {};
      let lost = 0;
      for (const dl of DIALOGS) {
        await dl.go(page, h);
        if (dl.name === 'template') {
          await clickOn(page, { tab: 'layout' });
          await page.waitForTimeout(300);
        } else await blur(page);
        if (!(await tabUntil(page, dl.opener, { max: 60 }))) throw new Error(`precondition: the keyboard reaches the ${dl.name} opener`);
        const onOpener = await readFocus(page, dl.opener);
        // The paint on the opener (information): the dashboard's Delete sits
        // in a hover-only row at opacity 0, older than record 20.
        const paint = (await ringPaint(page, dl.opener)).ringPixels;
        const dlg = dl.dialog(page);
        await page.keyboard.press('Enter');
        await dlg.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForTimeout(400);
        const inDialog = await readFocus(page);
        await page.keyboard.press('Escape');
        await dlg.waitFor({ state: 'detached', timeout: 5000 });
        await page.waitForTimeout(300);
        const back = await readFocus(page, dl.opener);
        if (!inDialog.isButton) throw new Error(`precondition: the ${dl.name} dialog focuses a button, got ${inDialog.on}`);
        if (!back.isTarget) throw new Error(`precondition: Esc gives the focus back to the ${dl.name} opener, got ${back.on}`);
        lost += [onOpener, inDialog, back].filter((f) => !f.ring).length;
        out[dl.name] = {
          opener: onOpener.ring ? 'ring' : 'NO RING', openerPaintPx: paint,
          dialog: `${inDialog.on}: ${inDialog.ring ? 'ring' : 'NO RING'}`, afterEsc: back.ring ? 'ring' : 'NO RING',
        };
      }
      return { observed: lost > 0, lost: `${lost} of ${DIALOGS.length * 3}`, ...out };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A dialog opened with the mouse, then keys that move the focus (claim
  // Hm-move, R20-2): Esc (the opener); the dialog opened again with the
  // mouse and closed with a click on Cancel (information: the pointer's
  // path), then Enter on the opener (the dialog's focused button) and Esc
  // (the opener). Counted: the three states a key reached, where the focus
  // is on an element.
  id: 'focus-dialog-mouse', claim: 'Hm-move',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const out = {};
      const counted = [];
      const show = (f) => `${f.on}: ${f.ring ? 'RING' : 'no ring'} (fv ${f.fv}, ${f.modality})`;
      for (const dl of DIALOGS) {
        await dl.go(page, h);
        const dlg = dl.dialog(page);
        await hoverClick(page, dl.opener);
        await dlg.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForTimeout(400);
        const mouseOpened = await readFocus(page);
        await page.keyboard.press('Escape');
        await dlg.waitFor({ state: 'detached', timeout: 5000 });
        await page.waitForTimeout(300);
        const afterEsc = await readFocus(page);
        await hoverClick(page, dl.opener);
        await dlg.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForTimeout(400);
        await dlg.getByRole('button', { name: 'Cancel' }).click();
        await dlg.waitFor({ state: 'detached', timeout: 5000 });
        await page.waitForTimeout(300);
        const afterCancel = await readFocus(page, dl.opener);
        const row = { mouseOpened: show(mouseOpened), afterEsc: show(afterEsc), afterCancelClick: show(afterCancel) };
        const states = [['afterEsc', afterEsc]];
        if (afterCancel.isTarget) {
          await page.keyboard.press('Enter');
          await dlg.waitFor({ state: 'visible', timeout: 5000 });
          await page.waitForTimeout(400);
          const enter = await readFocus(page);
          await page.keyboard.press('Escape');
          await dlg.waitFor({ state: 'detached', timeout: 5000 });
          await page.waitForTimeout(300);
          const esc2 = await readFocus(page);
          row.enterOnOpener = show(enter);
          row.afterSecondEsc = show(esc2);
          states.push(['enterOnOpener', enter], ['afterSecondEsc', esc2]);
        } else row.enterOnOpener = 'not reached: the click on Cancel left the focus off the opener';
        for (const [k, f] of states) if (f.on !== 'BODY') counted.push({ k: `${dl.name} ${k}`, ring: f.ring });
        out[dl.name] = row;
      }
      const rings = counted.filter((c) => c.ring);
      return {
        observed: rings.length > 0,
        rings: `${rings.length} of ${counted.length}`,
        ...(rings.length ? { ringOn: rings.map((c) => c.k).join(', ') } : {}),
        ...out,
      };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // Before any input (no press, no key): a script focuses each zoom bar
  // button. Where the browser's :focus-visible matches, the ring is drawn,
  // as it was before the fix.
  id: 'focus-script-before-input', claim: 'Hk',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const rows = {};
      let lost = 0;
      let matched = 0;
      for (const l of ['Zoom out', 'Reset zoom to fit', 'Zoom in', 'Fit poster to screen']) {
        await page.evaluate((l) => document.querySelector(`[aria-label="${l}"]`).focus(), l);
        const f = await readFocus(page);
        rows[l] = `${f.fv ? ':focus-visible' : 'not :focus-visible'}, ${f.ring ? 'ring' : 'no ring'}`;
        if (f.fv) matched += 1;
        if (f.fv && !f.ring) lost += 1;
      }
      const modality = (await readFocus(page)).modality;
      if (modality !== null) throw new Error(`precondition: no input yet, the modality unset; got ${modality}`);
      return { observed: lost > 0, lost: `${lost} of ${matched}`, ...rows };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A script's focus after a Shift press (as Hr2 reads), and the onboarding
  // tour as it opens, after a click on Next and after Enter.
  id: 'focus-before-input', claim: 'Hm-info',
  async run(h) {
    const out = {};
    {
      const { context, page } = await editor(h);
      try {
        await page.keyboard.press('Shift');
        await page.evaluate(() => document.querySelector('[aria-label="Zoom out"]').focus());
        out.afterShift = (await readFocus(page)).ring ? 'ring' : 'no ring';
        out.modality = (await readFocus(page)).modality;
      } finally {
        await context.close();
      }
    }
    {
      const { context, page } = await editor(h, { tour: true });
      try {
        const next = page.getByRole('button', { name: 'Next →' });
        await next.waitFor({ timeout: 8000 });
        const f0 = await readFocus(page);
        out.tourOpens = `${f0.on}${f0.ring ? ': ring' : ''}`;
        const b = await next.boundingBox();
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        await page.waitForTimeout(400);
        const f1 = await readFocus(page);
        out.tourNextClicked = `${f1.on}${f1.ring ? ': ring' : ''}`;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        const f2 = await readFocus(page);
        out.tourEnter = `${f2.on}${f2.ring ? ': ring' : ''}`;
      } finally {
        await context.close();
      }
    }
    return out;
  },
});

FOCUS_RING_SCENARIOS.push({
  // The siblings outside the house rule: every other focusable element
  // outside the sheet that is not a text field (links, menus, <summary>,
  // checkboxes, radios, sliders, colour wells, file inputs, [tabindex]
  // elements), in each sidebar tab and with a block of each kind selected,
  // pressed with the mouse (its click held back), then Shift: whether the
  // browser draws its own ring there.
  id: 'focus-mouse-siblings', claim: 'Hm',
  async run(h) {
    const { context, page } = await editor(h);
    closePopups(context);
    try {
      await page.evaluate(() => {
        window.addEventListener('click', (e) => {
          if (window.__zqHold) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
      });
      const seen = new Map();
      const newIn = {};
      for (const pass of await sweepPasses(page)) {
        if (!(await pass.open())) continue;
        const before = seen.size;
        const sel = 'a[href], select, summary, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], input[type="file"], [tabindex]:not(button):not([role="button"]):not(input):not(textarea):not([contenteditable])';
        const n = await page.$$eval(sel, (els) => els.length);
        for (let i = 0; i < n; i += 1) {
          const it = await page.evaluate(({ sel, i }) => {
            const el = document.querySelectorAll(sel)[i];
            if (!el || el.disabled || el.closest('#poster-canvas') || el.closest('[inert]') || el.getClientRects().length === 0 || el.tabIndex < 0) return null;
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2; const y = r.top + r.height / 2;
            const top = document.elementFromPoint(x, y);
            if (!top || !(el === top || el.contains(top))) return null;
            const kindOf = (e) => (e.tagName === 'INPUT' ? `input[${e.type}]` : e.tagName.toLowerCase());
            const labelOf = (e) => e.getAttribute('aria-label') || e.getAttribute('title') || e.closest('label')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) || e.textContent.trim().replace(/\s+/g, ' ').slice(0, 24);
            const kind = kindOf(el);
            const label = labelOf(el);
            const nth = [...document.querySelectorAll(sel)].slice(0, i).filter((e) => kindOf(e) === kind && labelOf(e) === label).length;
            document.querySelectorAll('[data-zq-sweep]').forEach((e) => e.removeAttribute('data-zq-sweep'));
            el.setAttribute('data-zq-sweep', '');
            return { x, y, key: `${kind}|${label}${nth ? ` #${nth + 1}` : ''}` };
          }, { sel, i });
          if (!it || seen.has(it.key)) continue;
          await blur(page);
          await page.evaluate(() => { window.__zqHold = true; });
          await page.mouse.click(it.x, it.y);
          await page.evaluate(() => { window.__zqHold = false; });
          await page.waitForTimeout(80);
          const d = { css: '[data-zq-sweep]' };
          const clicked = await readFocus(page, d);
          // A menu the press opened: Esc closes it before the key.
          await page.keyboard.press('Shift');
          await page.waitForTimeout(80);
          const after = await readFocus(page, d);
          seen.set(it.key, !clicked.isTarget ? 'click leaves the focus elsewhere' : after.isTarget && after.ring ? `ring (${after.outline})` : 'no ring');
        }
        newIn[pass.name] = seen.size - before;
      }
      const rings = [...seen].filter(([, v]) => v.startsWith('ring')).map(([k, v]) => `${k}: ${v}`);
      const measurable = [...seen.values()].filter((v) => v !== 'click leaves the focus elsewhere').length;
      if (seen.size < 4) throw new Error(`precondition: the sweep met the sidebar's links, menus and checkboxes, got ${seen.size}`);
      return {
        observed: rings.length > 0, elements: seen.size, rings: rings.length, measurable,
        newWithSelection: Object.fromEntries(Object.entries(newIn).filter(([k]) => k.endsWith(' selected'))),
        ...(rings.length ? { which: rings.slice(0, 12).join('; ') } : {}), all: [...seen].map(([k, v]) => `${k}: ${v}`).join('; '),
      };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A selected block's move control, pressed with the mouse without moving,
  // then ↓ (the nudge, fix 36): where the focus is and whether it rings.
  id: 'focus-selection-move', claim: 'Hm-info',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const id = await page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-id]')]
        .find((e) => e.querySelector('[contenteditable]') && !e.textContent.includes('ZQTITLE'))?.getAttribute('data-block-id'));
      const frame = page.locator(`#poster-canvas [data-block-id="${id}"]`).first();
      const bb = await frame.boundingBox();
      await page.mouse.click(bb.x + 3, bb.y + 3);
      await page.waitForTimeout(400);
      const move = await page.evaluate(() => {
        const b = [...document.querySelectorAll('#poster-canvas button')].find((x) => getComputedStyle(x).cursor === 'move' && x.getClientRects().length);
        if (!b) return null;
        b.setAttribute('data-zq-move', '');
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (!move) return { skipped: 'no move control drawn for the selected block' };
      await page.mouse.click(move.x, move.y);
      await page.waitForTimeout(200);
      const d = { css: '[data-zq-move]' };
      const clicked = await readFocus(page, d);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      const after = await readFocus(page, d);
      return { clickFocus: clicked.on, onMove: clicked.isTarget, ringAfterDown: after.ring, focusAfterDown: after.on };
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // Outside the editor: the public pages' menu button (PublicHeader, shown
  // below 1280 px), whose own corners are 6 px (Tailwind's rounded-md): a
  // click, then each non-Tab key.
  id: 'focus-mouse-public-menu', claim: 'Hm',
  async run(h) {
    const context = await h.browser.newContext({ viewport: { width: 1024, height: 800 } });
    const state = { userId: randomUUID(), row: null, saves: [], aborted: [], errors: [] };
    await installMocks(context, state, h.base, { docBase: h.docBase ?? h.base });
    const page = await context.newPage();
    try {
      await page.goto(`${h.base}/`);
      const d = { css: 'button[aria-haspopup="true"][aria-controls], button[aria-haspopup="true"][aria-expanded]' };
      await page.waitForSelector(d.css, { state: 'visible', timeout: 30000 });
      await page.waitForTimeout(500);
      const cases = [];
      for (const key of NON_TAB_KEYS) {
        // The menu closed first, so each case starts the same way.
        if (await page.evaluate((c) => document.querySelector(c)?.getAttribute('aria-expanded') === 'true', d.css)) {
          await clickOn(page, d);
          await page.waitForTimeout(200);
        }
        cases.push({ button: 'menu', ...(await clickThenKey(page, d, key)) });
      }
      return hmResult(cases);
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // Each <summary>, clicked, then each non-Tab key: the browser's own ring
  // on it (Chromium and WebKit draw one after a key; R20-1).
  id: 'focus-mouse-summary', claim: 'Hm',
  async run(h) {
    const cases = [];
    for (const sm of SUMMARIES) {
      const { context, page } = await sm.open(h);
      try {
        for (const key of NON_TAB_KEYS) {
          await sm.ready(page);
          if (!(await exists(page, sm.d))) throw new Error(`precondition: the ${sm.name} summary is on screen`);
          cases.push({ button: sm.name, ...(await clickThenKey(page, sm.d, key)) });
        }
      } finally {
        await context.close();
      }
    }
    return hmResult(cases, { outlines: [...new Set(cases.filter((c) => c.ring).map((c) => c.button))].join(', ') || 'none' });
  },
});

FOCUS_RING_SCENARIOS.push({
  // Each <summary> reached by the keyboard: clicked, Tab to the next
  // control, Shift+Tab back: the browser's own ring is drawn on it.
  id: 'focus-tab-summary', claim: 'Hk',
  async run(h) {
    const out = {};
    let lost = 0;
    for (const sm of SUMMARIES) {
      const { context, page } = await sm.open(h);
      try {
        await sm.ready(page);
        await blur(page);
        await clickOn(page, sm.d);
        await page.waitForTimeout(200);
        await page.keyboard.press(tabKey(page));
        await page.waitForTimeout(150);
        await page.keyboard.press(tabKey(page, true));
        await page.waitForTimeout(150);
        const f = await readFocus(page, sm.d);
        if (!f.isTarget) throw new Error(`precondition: Shift+Tab gives the focus back to the ${sm.name} summary, got ${f.on}`);
        if (!f.ring) lost += 1;
        out[sm.name] = `${f.ring ? 'ring' : 'NO RING'} (${f.outline}, ${f.modality})`;
      } finally {
        await context.close();
      }
    }
    return { observed: lost > 0, lost: `${lost} of ${SUMMARIES.length}`, ...out };
  },
});

FOCUS_RING_SCENARIOS.push({
  // The modifier keys alone and in a chord, after a click on Zoom in: does
  // the browser's own :focus-visible turn on (R20-4; information, read the
  // same on main and on the fix: the rule leaves these keys alone).
  id: 'focus-mouse-modifiers', claim: 'Hm-info',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const d = { css: '[aria-label="Zoom in"]' };
      const out = {};
      for (const key of ['Meta', 'Alt', 'Control', 'Meta+k', 'Alt+k', 'Control+k', 'Shift', 'F2']) {
        const c = await clickThenKey(page, d, key);
        out[key] = !c.kept ? 'the click left the focus elsewhere' : !c.stayed ? `moved to ${c.movedTo}` : `:focus-visible ${c.fv}, ${c.ring ? 'ring' : 'no ring'}`;
      }
      return out;
    } finally {
      await context.close();
    }
  },
});

FOCUS_RING_SCENARIOS.push({
  // A keyboard user who clicks once (R20-3): Shift+Tab from FIT to Zoom in
  // (ring), then a mouse click on A+, which keeps the focus where it was
  // (record 33), then Enter (Zoom in acts): the ring on Zoom in after each.
  // Information: a loss the rule accepts (a press is the pointer's).
  id: 'focus-keyboard-then-press', claim: 'Hm-info',
  async run(h) {
    const { context, page } = await editor(h);
    try {
      const zoomIn = { css: '[aria-label="Zoom in"]' };
      const show = (f) => (f.isTarget ? `Zoom in: ${f.ring ? 'ring' : 'no ring'} (${f.modality})` : `${f.on} (${f.modality})`);
      await blur(page);
      await clickOn(page, { css: '[aria-label="Fit poster to screen"]' });
      await page.waitForTimeout(200);
      if (!(await tabUntil(page, zoomIn, { back: true }))) throw new Error('precondition: Shift+Tab reaches Zoom in');
      const tabbed = await readFocus(page, zoomIn);
      await clickOn(page, { css: '[aria-label="Increase text size"]' });
      await page.waitForTimeout(250);
      const afterClick = await readFocus(page, zoomIn);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
      const afterEnter = await readFocus(page, zoomIn);
      return { tabbed: show(tabbed), afterAplusClick: show(afterClick), afterEnter: show(afterEnter) };
    } finally {
      await context.close();
    }
  },
});
