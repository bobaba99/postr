/**
 * The shared pieces of record 20's focus ring scenarios
 * (lib/focusRingScenarios.mjs, run by scripts/fit-check.mjs): reading the
 * focus and its ring, real clicks and keys, the click-then-key case and its
 * result, the sweeps' passes (each sidebar tab, then a block of each kind
 * selected), the paint, and the dialogs and <summary> disclosures the
 * scenarios open. Split out of the scenarios file in record 20's correction
 * 1 (the file had passed 800 lines); nothing in it measures on its own.
 */
import { randomUUID } from 'node:crypto';
import { installMocks, openEditor } from './editorHarness.mjs';

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
/** The keys a mouse user presses after a click: every kind but Tab. */
export const NON_TAB_KEYS = ['ArrowDown', 'ArrowLeft', 'Shift', 'Enter', 'Space', 'a', `${MOD}+z`, 'Escape'];

export const tabKey = (page, back = false) => {
  const webkit = (page.context().browser()?.browserType().name() ?? '') === 'webkit';
  return `${webkit ? 'Alt+' : ''}${back ? 'Shift+' : ''}Tab`;
};

// ------------------------------------------------------------ page reads
/**
 * In the page: find the element a descriptor names. { css } a selector;
 * { tab } a rail tab by its label; { text } a sidebar button whose text
 * starts with it; { summary } a shown <summary> whose text contains it;
 * { button } a shown button whose text is it.
 */
export const FIND = `(d) => {
  if (d.css) return document.querySelector(d.css);
  if (d.tab) return [...document.querySelectorAll('button[data-postr-tab]')].find((b) => b.firstChild?.textContent === d.tab) ?? null;
  if (d.text) return [...document.querySelectorAll('[data-postr-sidebar] button')].find((b) => b.textContent.trim().replace(/\\s+/g, ' ').startsWith(d.text)) ?? null;
  if (d.summary) return [...document.querySelectorAll('summary')].find((s) => s.getClientRects().length > 0 && s.textContent.includes(d.summary)) ?? null;
  if (d.button) return [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.textContent.trim() === d.button) ?? null;
  return null;
}`;

/** What has the focus, and whether a ring is drawn on it. */
export const readFocus = (page, target = null) => page.evaluate(({ find, target }) => {
  // eslint-disable-next-line no-eval
  const f = eval(find);
  const a = document.activeElement;
  const none = !a || a === document.body || a === document.documentElement;
  const cs = none ? null : getComputedStyle(a);
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) || el.tagName);
  return {
    on: none ? 'BODY' : label(a),
    isButton: !none && (a.tagName === 'BUTTON' || a.getAttribute('role') === 'button'),
    // The other click targets whose ring the fix turns off in pointer mode.
    isOtherTarget: !none && ((a.tagName === 'A' && a.hasAttribute('href')) || (a.tagName === 'INPUT' && a.type === 'checkbox') || a.tagName === 'SUMMARY'),
    kind: none ? null : a.tagName === 'INPUT' ? `input[${a.type}]` : a.tagName.toLowerCase(),
    isTarget: !!target && !none && f(target) === a,
    inSheet: !none && !!a.closest('#poster-canvas'),
    ring: !!cs && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
    outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : null,
    radius: cs ? cs.borderRadius : null,
    // The ring's whole look, to compare one tree's keyboard rings with another's.
    look: cs ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} offset ${cs.outlineOffset} radius ${cs.borderRadius}` : null,
    fv: !none && a.matches(':focus-visible'),
    modality: document.documentElement.getAttribute('data-postr-input-modality'),
  };
}, { find: FIND, target });

export const blur = (page) => page.evaluate(() => document.activeElement?.blur?.());

/** A real mouse click at the centre of what `d` names. */
export async function clickOn(page, d) {
  const box = await page.evaluate(({ find, d }) => {
    // eslint-disable-next-line no-eval
    const el = eval(find)(d);
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, { find: FIND, d });
  if (!box) throw new Error(`precondition: ${JSON.stringify(d)} is on screen`);
  await page.mouse.click(box.x, box.y);
}

export const exists = (page, d) => page.evaluate(({ find, d }) => {
  // eslint-disable-next-line no-eval
  const el = eval(find)(d);
  // A− and A+ at a bound are aria-disabled, not disabled (record 33).
  return !!el && el.getClientRects().length > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}, { find: FIND, d });

/** An undo step made with the mouse: A+, or A− at the top size. */
export async function makeStep(page) {
  const up = await exists(page, { css: '[aria-label="Increase text size"]' });
  await clickOn(page, { css: `[aria-label="${up ? 'Increase' : 'Decrease'} text size"]` });
  await page.waitForTimeout(150);
}

/** Before a case on A− or A+: when it is at its bound, one press of the other. */
export const offBound = (mine, other) => async (page) => {
  if (!(await exists(page, { css: `[aria-label="${mine} text size"]` }))) {
    await clickOn(page, { css: `[aria-label="${other} text size"]` });
    await page.waitForTimeout(150);
  }
};

/**
 * Click `d` with the mouse (focus first put nowhere), then press `key`:
 * where the focus is after each, and whether a ring is drawn.
 */
export async function clickThenKey(page, d, key) {
  await blur(page);
  // The button's own corners, unfocused: the house rule gives a focused one 4 px.
  const ownRadius = await page.evaluate(({ find, d }) => {
    // eslint-disable-next-line no-eval
    const el = eval(find)(d);
    return el ? getComputedStyle(el).borderRadius : null;
  }, { find: FIND, d });
  await clickOn(page, d);
  await page.waitForTimeout(150);
  const clicked = await readFocus(page, d);
  await page.keyboard.press(key);
  await page.waitForTimeout(180);
  const after = await readFocus(page, d);
  const kept = clicked.isTarget;
  const stayed = kept && after.isTarget;
  return {
    key, kept, stayed,
    ringAfterClick: kept && clicked.ring,
    ring: stayed && after.ring,
    ...(stayed && after.radius !== ownRadius ? { restyled: `${ownRadius} → ${after.radius}` } : {}),
    ...(kept && !stayed ? { movedTo: after.on, ringMoved: after.ring } : {}),
    // The browser's own :focus-visible after the key (the ring aside).
    fv: after.fv,
    modality: after.modality,
  };
}

/**
 * One Hm result from a list of cases. A key that moved the focus is counted
 * apart (`moved`): a ring where the focus went is a ring after a click and a
 * key too (review round 1, R20-2), so it makes the claim observed.
 */
export function hmResult(cases, extra = {}) {
  // Counted: the click left the focus on the element and the key left it
  // there (or a ring drew right after the click).
  const measurable = cases.filter((c) => c.kept && (c.stayed || c.ringAfterClick));
  const hit = (c) => c.ring || c.ringAfterClick || !!c.restyled;
  const rings = measurable.filter(hit);
  const notKept = [...new Set(cases.filter((c) => !c.kept).map((c) => c.button))];
  const movedCases = cases.filter((c) => c.movedTo && c.movedTo !== 'BODY');
  const movedRings = movedCases.filter((c) => c.ringMoved);
  const moved = cases.filter((c) => c.movedTo).map((c) => `${c.button} ${c.key} → ${c.movedTo}${c.ringMoved ? ' (ring)' : ''}`);
  const byKey = {};
  for (const c of measurable) {
    byKey[c.key] ??= [0, 0];
    byKey[c.key][1] += 1;
    if (hit(c)) byKey[c.key][0] += 1;
  }
  return {
    observed: rings.length > 0 || movedRings.length > 0,
    rings: `${rings.length} of ${measurable.length}`,
    moved: `${movedRings.length} of ${movedCases.length} with a ring where the key moved the focus`,
    cases: cases.length,
    byKey: Object.fromEntries(Object.entries(byKey).map(([k, [r, n]]) => [k, `${r}/${n}`])),
    ...(rings.length ? { examples: rings.slice(0, 6).map((c) => `${c.button} ${c.key}${c.restyled ? ` (radius ${c.restyled})` : ''}`) } : {}),
    ...(notKept.length ? { clickLeavesFocusElsewhere: notKept.join(', ') } : {}),
    ...(moved.length ? { keyMovedFocus: moved.slice(0, 8).join('; ') } : {}),
    ...extra,
  };
}

/** Close every window the page opens (Save PDF's print window). */
export const closePopups = (context) => context.on('page', (p) => { p.close().catch(() => {}); });

export const editor = (h, extra = {}) => openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 }, ...extra });

/**
 * Select the first block of `type` on the sheet by a mouse click on its
 * frame (3 px inside its top-left corner), as a user does; the Edit tab
 * opens with that block's controls. False when the sheet has none.
 */
export async function selectBlock(page, type) {
  const at = await page.evaluate((type) => {
    const el = [...document.querySelectorAll(`#poster-canvas [data-block-type="${type}"]`)]
      .find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 4);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + 3, y: r.top + 3 };
  }, type);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  return true;
}

/**
 * The block kinds whose selection the sweeps also run with, beyond the ten
 * sidebar tabs with nothing selected (the authors and references blocks
 * open their own tabs, swept already).
 */
export const SELECTION_PASSES = ['table', 'image', 'text', 'heading', 'title'];

/**
 * A fresh context on a public page with no session, the backend faked. The
 * phone notice (a strip fixed at the bottom below 768 px, over the pricing
 * page's summaries) starts dismissed, as installMocks has it in the editor;
 * it keeps that in sessionStorage now.
 */
export async function publicPage(h, route, viewport) {
  const context = await h.browser.newContext({ viewport });
  const state = { userId: randomUUID(), row: null, saves: [], aborted: [], errors: [] };
  await installMocks(context, state, h.base, { docBase: h.docBase ?? h.base });
  await context.addInitScript(() => {
    try { sessionStorage.setItem('postr.mobile-notice-dismissed', '1'); } catch { /* ignore */ }
  });
  const page = await context.newPage();
  await page.goto(`${h.base}${route}`);
  await page.waitForTimeout(1200);
  return { context, page };
}

/**
 * The passes a sweep makes: each sidebar tab with nothing selected, then a
 * block of each kind in SELECTION_PASSES selected by its frame (the Edit
 * tab with that block's controls). `open()` is false when there is no such
 * block.
 */
export async function sweepPasses(page) {
  const tabs = await page.$$eval('button[data-postr-tab]', (els) => els.map((e) => e.firstChild.textContent));
  return [
    ...tabs.map((tab) => ({ name: `tab ${tab}`, async open() { await clickOn(page, { tab }); await page.waitForTimeout(350); return true; } })),
    ...SELECTION_PASSES.map((type) => ({ name: `${type} selected`, open: () => selectBlock(page, type) })),
  ];
}

/** Press Tab (or Shift+Tab) until `pred` holds for the focus, at most `max` times. */
export async function tabUntil(page, d, { back = false, max = 40 } = {}) {
  for (let i = 1; i <= max; i += 1) {
    await page.keyboard.press(tabKey(page, back));
    await page.waitForTimeout(60);
    if ((await readFocus(page, d)).isTarget) return i;
  }
  return null;
}

/** Pixels within 40 of the house ring's colour (#7c6aed) in a band 6 px around a button. */
export async function ringPaint(page, d) {
  const { decodePNG } = await import('./png.mjs');
  const box = await page.evaluate(({ find, d }) => {
    // eslint-disable-next-line no-eval
    const r = eval(find)(d).getBoundingClientRect();
    return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 };
  }, { find: FIND, d });
  const img = decodePNG(await page.screenshot({ clip: box }));
  let n = 0;
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const [r, g, b] = img.rgb(x, y);
      if (Math.abs(r - 124) + Math.abs(g - 106) + Math.abs(b - 237) < 40) n += 1;
    }
  }
  return { ringPixels: n, of: img.w * img.h };
}

/**
 * The two dialogs the scenarios open: the Layout tab's template tile (in the
 * editor, the tab open by default) and the dashboard's Delete on a poster
 * card (shown on hover; a ConfirmModal like the template's). `go(page)`
 * brings the page there.
 */
export const DIALOGS = [
  {
    name: 'template', opener: { text: '2-Col Wide Figure' },
    dialog: (page) => page.getByRole('dialog', { name: /Apply the/ }),
    async go() {},
  },
  {
    name: 'dashboard Delete', opener: { css: 'button[aria-label^="Delete "]' },
    dialog: (page) => page.getByRole('dialog', { name: 'Delete poster' }),
    async go(page, h) {
      await page.goto(`${h.base}/dashboard`);
      await page.waitForSelector('a[href^="/p/"]', { timeout: 30000 });
      await page.waitForTimeout(800);
    },
  },
];

/** A real mouse click on what `d` names, the pointer first moved over it (the card's Delete shows on hover). */
export async function hoverClick(page, d) {
  const box = await page.evaluate(({ find, d }) => {
    // eslint-disable-next-line no-eval
    const el = eval(find)(d);
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, { find: FIND, d });
  if (!box) throw new Error(`precondition: ${JSON.stringify(d)} is on screen`);
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x, box.y);
}

/**
 * The <summary> disclosures shown outside the sheet (review round 1, R20-1):
 * the Edit tab's table tips (a table selected), the sign-up page's email
 * preferences, the pricing page's "What's included" at phone width (shown
 * below 640 px). `open(h)` gives a page; `ready(page)` brings the summary on
 * screen again when a key took it away (Esc deselects the table, record 36).
 */
export const SUMMARIES = [
  {
    name: 'table tips', d: { summary: 'Tips for editing tables' },
    open: (h) => editor(h),
    async ready(page) {
      if (!(await exists(page, this.d)) && !(await selectBlock(page, 'table'))) throw new Error('precondition: a table block on the sheet');
    },
  },
  {
    name: 'email preferences (/auth, sign up)', d: { summary: 'Email preferences' },
    open: (h) => publicPage(h, '/auth', { width: 1440, height: 900 }),
    async ready(page) {
      if (await exists(page, this.d)) return;
      await clickOn(page, { button: 'Sign up' });
      await page.waitForTimeout(400);
    },
  },
  {
    name: "What's included (/pricing, 375 px)", d: { summary: 'What’s included' },
    open: (h) => publicPage(h, '/pricing', { width: 375, height: 812 }),
    async ready() {},
  },
];
