#!/usr/bin/env node
/**
 * sidebar-history-check.mjs — real-browser check for the "sidebar setting
 * wipes undo history and blanks the poster name" report.
 *
 * Written by an independent reviewer to confirm the defect BEFORE it was fixed
 * (exit 1 on the unfixed code, 3 of 3 runs), then re-run against the fix
 * (exit 0). Record: docs/fixes/01-sidebar-undo-history.md.
 *
 * WHAT IT DOES
 *   Boots the REAL apps/web Vite dev server in-process (PORT, default 5201),
 *   opens the unmodified editor bundle in Chromium via Playwright, and fakes
 *   ONLY the network (Supabase REST/Auth at https://dummy.supabase.co and the
 *   Express API at http://localhost:3000) with page.route(). Nothing in the
 *   app is stubbed at module level.
 *
 *   For every scenario, in a fresh browser context:
 *     1. seed a poster whose display name ("posters.title") differs from its
 *        title BLOCK's text;
 *     2. click into a body text block, type a marker with the real keyboard,
 *        click out onto empty canvas, wait for the autosave;
 *     3. perform ONE sidebar action through the real UI (or a control action);
 *     4. click empty canvas, press the real ⌘Z (page.keyboard "Meta+z";
 *        "Control+z" in the *-ctrl variants) twice, observing after each;
 *     5. read the "Poster name" field, document.title and the sr-only h1
 *        before and after, and capture every autosave PATCH body to
 *        /rest/v1/posters (its `title` field);
 *     6. reopen the poster from the faked DB and read the name field again.
 *
 *   Observation sources, in order of authority:
 *     DOM     — canvas text, sidebar field values, document.title
 *     NETWORK — the PATCH bodies the app sends
 *     STORE   — a PASSIVE zustand subscriber + getState() reads through the
 *               same Vite module URL the app uses ('/src/stores/posterStore.ts').
 *               It never calls an action or replaces state.
 *
 * EXPECTED (correct) BEHAVIOUR, which the check asserts
 *   - after a sidebar change, ⌘Z #1 reverts the change and ⌘Z #2 removes the
 *     typed marker (auto-arrange: same; control-none/tab-switch: ⌘Z #1 removes it);
 *   - the Poster name field and posters.title keep the chosen display name.
 *
 * EXIT CODES
 *   0  every scenario behaved correctly
 *   1  defect(s) reproduced (and the controls passed, so the instrument works)
 *   2  a control scenario failed — the instrument itself is not trustworthy
 *
 * RUN
 *   node sidebar-history-check.mjs                  # all scenarios
 *   node sidebar-history-check.mjs --only font,control-none
 *   OUT_DIR=/some/dir POSTR_REPO=/path/to/repo node sidebar-history-check.mjs
 *   PORT=5203 node sidebar-history-check.mjs        # two runs side by side
 *
 * A scenario with `needs` drives a control one of record 29's switches hides
 * (config/features.ts): while the tree has the switch off it is skipped,
 * printed "skipped (switch off)" and counted on the summary line of that
 * name (since the merge of main, record 30, into record 29). Those with
 * ADJUSTMENTS_ENABLED: custom-palette-save, style-preset, heading-style,
 * typography (italic).
 *
 * A scenario marked `knownDefect` names a DIFFERENT open defect; it prints
 * KNOWN and does not affect the exit code. Remove the mark when that item ships.
 *
 * Side effect to know about: loading vite.config.ts rewrites
 * apps/web/public/version.json (the app's own build-stamp plugin).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SWITCH_OFF, switchOffReason, switchesOff } from './lib/editorHarness.mjs';

// ---------------------------------------------------------------- config
const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepo() {
  if (process.env.POSTR_REPO) return process.env.POSTR_REPO;
  let d = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(d, 'apps/web/vite.config.ts'))) return d;
    d = path.dirname(d);
  }
  throw new Error('Could not find the repo root (apps/web/vite.config.ts). Set POSTR_REPO.');
}
const REPO = findRepo();
const WEB = path.join(REPO, 'apps/web');
const PORT = Number(process.env.PORT ?? 5201);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-sidebar-history-check');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const DISPLAY_NAME = 'Smith Lab APA 2026';
const TITLE_BLOCK_TEXT = 'Five Nights of Restricted Sleep Impair Adolescent Working Memory';
const MARKER = 'ZQXMARK';
const PRESET_NAME = 'Lab Preset Z';

const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1])
      .split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- deps
const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules/vite/dist/node/index.js')).href);

// ---------------------------------------------------------------- fake backend
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeJwt(sub) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub, aud: 'authenticated', role: 'authenticated', is_anonymous: true,
    iat: now, exp: now + 86400, session_id: randomUUID(),
  })}.c2lnbmF0dXJl`;
}
function makeUser(id) {
  const t = new Date().toISOString();
  return {
    id, aud: 'authenticated', role: 'authenticated', email: '', phone: '',
    is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [],
    created_at: t, updated_at: t, last_sign_in_at: t,
  };
}

/**
 * Fake Supabase + API at the network layer. `state.row` is the poster row;
 * PATCHes merge into it (so a reopen sees what the app persisted) and every
 * posters write is appended to `state.saves` with the harness phase label.
 */
async function installMocks(page, state) {
  const user = makeUser(state.userId);
  const session = () => ({
    access_token: makeJwt(state.userId), token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'fake-refresh', user,
  });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', headers: cors,
    body: body === undefined ? '' : JSON.stringify(body),
  });

  // Hermetic: anything not the dev server or a faked host is aborted.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (u.startsWith('https://dummy.supabase.co/') || u.startsWith('http://localhost:3000/')) return route.fallback();
    state.aborted.push(u.slice(0, 120));
    return route.abort();
  });

  await page.route('https://dummy.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    if (method === 'OPTIONS') return json(route, undefined, 204);
    if (p === '/auth/v1/signup' || p === '/auth/v1/token') return json(route, session());
    if (p === '/auth/v1/user') return json(route, user);
    if (p === '/auth/v1/logout') return json(route, undefined, 204);
    if (p.startsWith('/auth/v1/')) return json(route, {});
    if (p.startsWith('/rest/v1/rpc/')) return json(route, null);
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const wantsObject = (req.headers().accept || '').includes('vnd.pgrst.object');
      if (table === 'posters') {
        if (method === 'GET') return json(route, wantsObject ? state.row : [state.row]);
        if (method === 'PATCH' || method === 'POST') {
          let b = {};
          try {
            const body = JSON.parse(req.postData() || '{}');
            b = Array.isArray(body) ? body[0] : body;
          } catch { /* keep {} */ }
          const dataStr = b.data ? JSON.stringify(b.data) : '';
          state.saves.push({
            phase: state.phase,
            method,
            hasTitleKey: Object.prototype.hasOwnProperty.call(b, 'title'),
            title: b.title,
            hasData: !!b.data,
            thumbnailOnly: !b.data && !!b.thumbnail_path,
            markerInData: dataStr.includes(MARKER),
            fontFamily: b.data?.fontFamily,
            widthIn: b.data?.widthIn,
          });
          state.row = { ...state.row, ...b, updated_at: new Date().toISOString() };
          return json(route, wantsObject ? state.row : [state.row]);
        }
      }
      if (table === 'users') {
        const row = { id: state.userId, plan: 'free', plan_expires_at: null, export_credits: 0, review_credits: 0, review_addon: false, subscription_status: null, research_consent_at: null, marketing_consent_at: null };
        return json(route, wantsObject ? row : [row]);
      }
      if (method === 'GET') return json(route, wantsObject ? null : [], wantsObject ? 406 : 200);
      return json(route, wantsObject ? {} : [], 201);
    }
    if (p.startsWith('/storage/v1/')) return json(route, { error: 'not found' }, 404);
    return json(route, {});
  });
  await page.route('http://localhost:3000/**', (route) => json(route, { success: false, error: 'mock' }, 404));
  await page.addInitScript(({ preset }) => {
    try {
      localStorage.setItem('postr.onboarding-done', 'true');
      localStorage.setItem('postr.mobile-notice-dismissed', 'true');
      if (preset) localStorage.setItem('postr.style-presets', JSON.stringify([preset]));
    } catch { /* ignore */ }
  }, { preset: state.preset ?? null });
}

/** Seed doc built from the app's REAL makeBlocks(); display name != title block. */
async function buildDoc(page, titleText = TITLE_BLOCK_TEXT) {
  await page.goto(`${BASE}/version.json`);
  return page.evaluate(async ({ title }) => {
    const t = await import('/src/poster/templates.ts');
    const c = await import('/src/poster/constants.ts');
    const blocks = t.makeBlocks('3col', 48, 36);
    const body = [
      'Chronic sleep restriction impairs working memory in adolescents.',
      'We predicted a dose-dependent decline in 2-back accuracy.',
      'Forty-eight participants completed a within-subject protocol.',
      'Accuracy fell by 11% across restriction nights.',
    ];
    let i = 0;
    for (const b of blocks) {
      if (b.type === 'title') b.content = title;
      if (b.type === 'text') b.content = `<p>${body[i++ % body.length]}</p>`;
    }
    const { name: _n, ...palette } = c.PALETTES[0];
    return {
      version: 1, widthIn: 48, heightIn: 36, blocks,
      fontFamily: 'Source Sans 3', palette, styles: c.DEFAULT_STYLES,
      headingStyle: { border: 'bottom', fill: false, align: 'left' },
      institutions: [
        { id: 'i1', name: 'Acme State University', dept: 'Department of Psychology' },
        { id: 'i2', name: 'Sample Research Institute' },
      ],
      authors: [
        { id: 'a1', name: 'Jane Doe', affiliationIds: ['i1'], isCorresponding: true, equalContrib: false },
        { id: 'a2', name: 'John Smith', affiliationIds: ['i1', 'i2'], isCorresponding: false, equalContrib: false },
      ],
      references: [
        { id: 'r1', authors: ['Doe, J.', 'Smith, J.'], year: '2021', title: 'Sleep restriction and adolescent cognition', journal: 'Journal of Sample Studies' },
        { id: 'r2', authors: ['Smith, J.'], year: '2019', title: 'Chronotype and recovery sleep', journal: 'Acme Review of Sleep' },
      ],
    };
  }, { title: titleText });
}

// ---------------------------------------------------------------- page helpers
async function openEditor(context, state) {
  const page = await context.newPage();
  state.errors = state.errors ?? [];
  page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 300)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await installMocks(page, state);
  if (!state.row) {
    const doc = await buildDoc(page, state.titleBlockText ?? TITLE_BLOCK_TEXT);
    const t = new Date().toISOString();
    state.row = {
      id: randomUUID(), user_id: state.userId, title: DISPLAY_NAME, width_in: 48, height_in: 36,
      data: doc, thumbnail_path: null, share_slug: null, is_public: false, created_at: t, updated_at: t,
    };
    if (state.wantPreset) {
      state.preset = {
        name: PRESET_NAME, fontFamily: 'DM Sans', paletteName: 'Engineering',
        palette: { bg: '#FAFAFA', primary: '#1e2223', accent: '#298c8c', accent2: '#a00000', muted: '#6c757d', headerBg: '#298c8c', headerFg: '#fff' },
        styles: doc.styles, headingStyle: { border: 'box', fill: true, align: 'center' },
      };
      await page.addInitScript(({ preset }) => {
        try { localStorage.setItem('postr.style-presets', JSON.stringify([preset])); } catch { /* ignore */ }
      }, { preset: state.preset });
    }
  }
  await page.goto(`${BASE}/p/${state.row.id}`);
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  // PASSIVE store observer: records every state transition, never writes.
  await page.evaluate(async () => {
    const mod = await import('/src/stores/posterStore.ts');
    window.__phase = 'load';
    window.__transitions = [];
    mod.usePosterStore.subscribe((s, p) => {
      window.__transitions.push({
        phase: window.__phase,
        docChanged: s.doc !== p.doc,
        titleFrom: p.posterTitle,
        titleTo: s.posterTitle,
        canUndo: [p.canUndo, s.canUndo],
        // Call path that produced this transition. The listener runs
        // synchronously inside zustand's set(), so the stack names the
        // store action and its callers (dev build = unminified names).
        callers: (new Error().stack || '').split('\n').slice(2, 14)
          .map((l) => (l.trim().match(/^at\s+([^\s(]+)/) || [])[1])
          .filter((n) => n && !/^(https?:|Object$|Array$|Function$|eval$|<anonymous>$)/.test(n))
          .slice(0, 8),
      });
    });
  });
  return page;
}

async function setPhase(page, state, phase) {
  state.phase = phase;
  await page.evaluate((ph) => { window.__phase = ph; }, phase);
}

async function openTab(page, label) {
  await page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(350);
}

/** Since fix 02 a size change asks first: confirm the dialog it opens. */
async function confirmSizeDialog(page) {
  const dlg = page.getByRole('dialog', { name: /Change poster to/ });
  await dlg.waitFor({ state: 'visible', timeout: 5000 });
  await dlg.getByRole('button', { name: 'Change size', exact: true }).click();
  await dlg.waitFor({ state: 'detached', timeout: 5000 });
}

/** A point on the canvas workspace that is outside the poster and not a control. */
async function emptyCanvasPoint(page) {
  const pt = await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const poster = document.getElementById('poster-canvas');
    if (!outer || !poster) return null;
    const o = outer.getBoundingClientRect();
    const p = poster.getBoundingClientRect();
    const cands = [];
    for (const fx of [0.5, 0.2, 0.8]) {
      cands.push([o.left + (o.width * fx), (p.bottom + o.bottom) / 2]);
      cands.push([o.left + (o.width * fx), (o.top + p.top) / 2]);
    }
    for (const fy of [0.5, 0.3, 0.7]) {
      cands.push([(p.right + o.right) / 2, o.top + o.height * fy]);
      cands.push([(o.left + p.left) / 2, o.top + o.height * fy]);
    }
    cands.push([o.right - 30, o.bottom - 30], [o.left + 40, o.bottom - 30]);
    for (const [x, y] of cands) {
      const el = document.elementFromPoint(x, y);
      if (!el || !outer.contains(el)) continue;
      if (el.closest('#poster-canvas') || el.closest('button') || el.closest('input,select,textarea,[contenteditable="true"]')) continue;
      return { x, y, tag: el.tagName };
    }
    return null;
  });
  if (!pt) throw new Error('no empty canvas point found');
  return pt;
}

async function clickEmptyCanvas(page) {
  const pt = await emptyCanvasPoint(page);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  return pt;
}

/** Click into the first body text block and type the marker with the real keyboard. */
async function typeIntoTextBlock(page) {
  const block = page.locator('#poster-canvas [data-block-type="text"]').first();
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await page.waitForTimeout(250);
  let isCE = await page.evaluate(() => !!document.activeElement?.isContentEditable);
  if (!isCE) {
    await block.click();
    await page.waitForTimeout(250);
    isCE = await page.evaluate(() => !!document.activeElement?.isContentEditable);
  }
  if (!isCE) {
    await block.locator('[contenteditable="true"]').first().click();
    await page.waitForTimeout(250);
    isCE = await page.evaluate(() => !!document.activeElement?.isContentEditable);
  }
  if (!isCE) throw new Error('could not focus a text block contentEditable');
  await page.keyboard.press('End');
  await page.keyboard.type(` ${MARKER}`, { delay: 35 });
  // > COALESCE_IDLE_MS so the burst is closed before anything else happens.
  await page.waitForTimeout(800);
}

async function waitForSave(state, since, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (state.saves.filter((s) => s.hasData).length > since) break;
    await sleep(100);
  }
  await sleep(300);
}

/** Everything observed at one instant. DOM + passive store reads. */
async function probe(page) {
  return page.evaluate(async (marker) => {
    const mod = await import('/src/stores/posterStore.ts');
    const s = mod.usePosterStore.getState();
    const d = s.doc;
    const canvas = document.getElementById('poster-canvas');
    const textCE = canvas?.querySelector('[data-block-type="text"] [contenteditable]');
    const nameInput = document.querySelector('input[aria-label="Poster name"]');
    const widthInput = document.querySelector('input[aria-label="Poster width in inches"]');
    const heightInput = document.querySelector('input[aria-label="Poster height in inches"]');
    const fontSelect = [...document.querySelectorAll('select')].find((el) => el.querySelector('option[value="Source Sans 3"]'));
    const authorsBlock = canvas?.querySelector('[data-block-type="authors"]');
    const refsBlock = canvas?.querySelector('[data-block-type="references"]');
    const heading = canvas?.querySelector('[data-block-type="heading"]');
    return {
      dom: {
        docTitle: document.title,
        srH1: [...document.querySelectorAll('h1')].map((h) => h.textContent).filter((t) => /Edit|editor/i.test(t)),
        nameField: nameInput ? nameInput.value : null,
        markerInCanvas: canvas ? canvas.innerText.includes(marker) : null,
        canvasFont: textCE ? getComputedStyle(textCE).fontFamily : null,
        fontSelect: fontSelect ? fontSelect.value : null,
        widthInput: widthInput ? widthInput.value : null,
        heightInput: heightInput ? heightInput.value : null,
        authorsText: authorsBlock ? authorsBlock.innerText.replace(/\s+/g, ' ').slice(0, 160) : null,
        refsText: refsBlock ? refsBlock.innerText.replace(/\s+/g, ' ').slice(0, 200) : null,
        headingBorder: heading ? getComputedStyle(heading.querySelector('[contenteditable]') ?? heading).borderTopWidth + '/' + getComputedStyle(heading.querySelector('[contenteditable]') ?? heading).borderBottomWidth : null,
        activeTag: document.activeElement?.tagName ?? null,
        seededSentencesInCanvas: canvas ? ['Chronic sleep restriction impairs', 'We predicted a dose-dependent', 'Forty-eight participants completed', 'Accuracy fell by 11%'].filter((t) => canvas.innerText.includes(t)).length : null,
        titleBlockText: canvas?.querySelector('[data-block-type="title"]')?.innerText?.trim() ?? null,
      },
      store: {
        posterId: s.posterId,
        posterTitle: s.posterTitle,
        canUndo: s.canUndo,
        canRedo: s.canRedo,
        markerInDoc: d ? JSON.stringify(d.blocks).includes(marker) : null,
        fontFamily: d?.fontFamily,
        palettePrimary: d?.palette?.primary,
        widthIn: d?.widthIn,
        heightIn: d?.heightIn,
        headingBorder: d?.headingStyle?.border,
        bodyItalic: d?.styles?.body?.italic ?? false,
        author0: d?.authors?.[0]?.name,
        inst0: d?.institutions?.[0]?.name,
        refCount: d?.references?.length,
      },
    };
  }, MARKER);
}

async function shotNameField(page, file) {
  const input = page.locator('input[aria-label="Poster name"]');
  if (!(await input.count())) return null;
  const box = await input.boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 34), width: box.width + 120, height: box.height + 78 };
  await page.screenshot({ path: file, clip });
  return file;
}

// ---------------------------------------------------------------- scenarios
// `setting(p)` picks the value that the action changes, from a probe.
const S = {
  font: (p) => ({ store: p.store.fontFamily, dom: p.dom.canvasFont }),
  palette: (p) => ({ store: p.store.palettePrimary }),
  size: (p) => ({ store: `${p.store.widthIn}x${p.store.heightIn}`, dom: p.dom.widthInput != null ? `${p.dom.widthInput}x${p.dom.heightInput}` : null }),
  heading: (p) => ({ store: p.store.headingBorder, dom: p.dom.headingBorder }),
  italic: (p) => ({ store: p.store.bodyItalic }),
  preset: (p) => ({ store: `${p.store.fontFamily}|${p.store.palettePrimary}|${p.store.headingBorder}` }),
  author: (p) => ({ store: p.store.author0, dom: p.dom.authorsText }),
  inst: (p) => ({ store: p.store.inst0, dom: p.dom.authorsText }),
  refs: (p) => ({ store: p.store.refCount, dom: p.dom.refsText }),
  none: () => ({ store: null }),
  blocks: () => ({ store: null }),
};

const SCENARIOS = [
  // ---- controls (must behave correctly or the instrument is wrong)
  // NB: selecting a text block auto-switches the sidebar to "edit block",
  // so every action that lives on another tab opens that tab first.
  { id: 'control-none', control: true, setting: S.none, undoPushesExpected: 0, act: async () => {}, how: 'no sidebar action' },
  { id: 'control-none-ctrl', control: true, key: 'Control+z', setting: S.none, undoPushesExpected: 0, act: async () => {}, how: 'no sidebar action; Ctrl+Z' },
  {
    id: 'control-tab-switch', control: true, setting: S.none, undoPushesExpected: 0, how: 'switch layout→style→authors→references→layout, change nothing (tests the "Halt" hypothesis)',
    act: async (page) => { await openTab(page, 'style'); await openTab(page, 'authors'); await openTab(page, 'references'); await openTab(page, 'layout'); },
  },
  {
    id: 'control-auto-arrange', control: true, setting: S.blocks, undoPushesExpected: 1, how: 'Layout tab → "Auto-Arrange" (store setBlocks/withUndo path)',
    act: async (page) => { await openTab(page, 'layout'); await page.getByRole('button', { name: /Auto-Arrange/ }).click(); await page.waitForTimeout(600); },
  },
  // ---- sidebar settings named in the report
  {
    id: 'font', setting: S.font, undoPushesExpected: 1, how: 'Style tab → Font <select> → "DM Sans" (selectOption)',
    act: async (page) => { await openTab(page, 'style'); await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).selectOption('DM Sans'); },
  },
  {
    id: 'font-ctrl', key: 'Control+z', setting: S.font, undoPushesExpected: 1, how: 'as font, Ctrl+Z',
    act: async (page) => { await openTab(page, 'style'); await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).selectOption('DM Sans'); },
  },
  {
    id: 'font-empty-title-block', titleBlockText: '', setting: S.font, undoPushesExpected: 1, how: 'as font, but the title BLOCK is empty (bounds claim c)',
    act: async (page) => { await openTab(page, 'style'); await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).selectOption('DM Sans'); },
  },
  {
    id: 'palette', setting: S.palette, undoPushesExpected: 1, how: 'Style tab → click palette row "Nature / Biology"',
    act: async (page) => { await openTab(page, 'style'); await page.getByRole('button', { name: /Nature \/ Biology/ }).first().click(); },
  },
  {
    id: 'custom-palette-save', needs: 'ADJUSTMENTS_ENABLED', setting: S.palette, undoPushesExpected: 1, how: 'Style tab → "Create custom palette" → Primary text hex filled "#AA0000" + name typed → "Save palette and apply"',
    act: async (page) => {
      await openTab(page, 'style');
      await page.getByRole('button', { name: /Create custom palette/ }).click();
      const hex = page.locator('input[aria-label="Primary text hex code"]');
      // fill() = one input event (like a paste). Char-by-char typing does not
      // land here: the controlled field rejects the invalid intermediate '#'.
      await hex.fill('#AA0000');
      await page.locator('input[aria-label="Palette name"]').click();
      await page.keyboard.type('Lab Green Z');
      await page.getByRole('button', { name: /Save palette and apply/ }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    // Since fix 02 a size change asks first and keeps the blocks; this
    // scenario was KNOWN (plan item 2) until then and must now pass.
    id: 'size-preset', setting: S.size, undoPushesExpected: 1, how: 'Layout tab → Poster Size <select> → 36"×48" Portrait (selectOption), then "Change size" in the dialog',
    act: async (page) => { await openTab(page, 'layout'); await page.locator('select', { has: page.locator('option[value="custom"]') }).selectOption('36×48'); await confirmSizeDialog(page); },
  },
  {
    // Since fix 02 a typed size applies when committed (Enter) and confirmed.
    id: 'custom-width', setting: S.size, undoPushesExpected: 1, how: 'Layout tab → Width input, real ArrowUp key (48 → 48.1), Enter, "Change size"',
    act: async (page) => { await openTab(page, 'layout'); await page.locator('input[aria-label="Poster width in inches"]').click(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await confirmSizeDialog(page); },
  },
  {
    id: 'custom-height', setting: S.size, undoPushesExpected: 1, how: 'Layout tab → Height input, real ArrowUp key (36 → 36.1), Enter, "Change size"',
    act: async (page) => { await openTab(page, 'layout'); await page.locator('input[aria-label="Poster height in inches"]').click(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await confirmSizeDialog(page); },
  },
  {
    id: 'custom-width-no-blur', informational: true, noBlurBeforeUndo: true, setting: S.size, undoPushesExpected: 1, how: 'as custom-width, then a click back INTO the width input so ⌘Z #1 is pressed with focus there (app ignores ⌘Z in INPUTs, so the browser\'s native undo runs — plan item 12); excluded from the exit code',
    act: async (page) => { await openTab(page, 'layout'); const w = page.locator('input[aria-label="Poster width in inches"]'); await w.click(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await confirmSizeDialog(page); await w.click(); },
  },
  {
    id: 'style-preset', needs: 'ADJUSTMENTS_ENABLED', wantPreset: true, setting: S.preset, undoPushesExpected: 1, how: `Style tab → click saved preset "${PRESET_NAME}" (seeded in localStorage)`,
    act: async (page) => { await openTab(page, 'style'); await page.getByRole('button', { name: PRESET_NAME, exact: true }).click(); },
  },
  {
    id: 'heading-style', needs: 'ADJUSTMENTS_ENABLED', setting: S.heading, undoPushesExpected: 1, how: 'Style tab → Headings Border "Box"',
    act: async (page) => { await openTab(page, 'style'); await page.getByRole('button', { name: 'Box', exact: true }).click(); },
  },
  {
    id: 'typography', needs: 'ADJUSTMENTS_ENABLED', setting: S.italic, undoPushesExpected: 1, how: 'Style tab → Typography Body italic toggle',
    act: async (page) => { await openTab(page, 'style'); await page.locator('button[aria-pressed]').filter({ hasText: /^I$/ }).nth(3).click(); },
  },
  {
    id: 'authors', setting: S.author, undoPushesExpected: 1, how: 'Authors tab → first "Author name" input, real keystroke "X"',
    act: async (page) => { await openTab(page, 'authors'); const i = page.locator('input[placeholder="Author name"]').first(); await i.click(); await page.keyboard.press('End'); await page.keyboard.type('X'); },
  },
  {
    id: 'affiliations', setting: S.inst, undoPushesExpected: 1, how: 'Authors tab → "Institution 1 name" input, real keystroke "X"',
    act: async (page) => { await openTab(page, 'authors'); const i = page.locator('input[aria-label="Institution 1 name"]'); await i.click(); await page.keyboard.press('End'); await page.keyboard.type('X'); },
  },
  {
    id: 'references', setting: S.refs, undoPushesExpected: 1, how: 'References tab → first "Remove reference" button',
    act: async (page) => { await openTab(page, 'references'); await page.locator('button[aria-label="Remove reference"]').first().click(); },
  },
];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Compare two setting snapshots on the fields observed in BOTH. A DOM
 * field is null when its panel is not on screen — the Layout tab is closed
 * while the user types in a canvas block, because selecting a block
 * switches the sidebar to "edit block". Comparing that null against the
 * value read later with the tab open reported the width as "not reverted"
 * after ⌘Z had put it back (store 48 -> 48.1 -> 48). Fixed 2026-09-27.
 */
const sameSetting = (a, b) => {
  const keys = Object.keys(a ?? {}).filter((k) => a[k] != null && b?.[k] != null);
  return keys.length > 0 && keys.every((k) => eq(a[k], b[k]));
};

async function runScenario(browser, sc) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const state = { userId: randomUUID(), row: null, saves: [], aborted: [], phase: 'load', wantPreset: !!sc.wantPreset, titleBlockText: sc.titleBlockText };
  const key = sc.key ?? 'Meta+z';
  const r = { id: sc.id, control: !!sc.control, informational: !!sc.informational || !!sc.knownDefect, knownDefect: sc.knownDefect ?? null, how: sc.how, key };
  let page = null;
  try {
    page = await openEditor(context, state);
    r.before = await probe(page);
    r.shotBefore = await shotNameField(page, path.join(OUT, 'shots', `${sc.id}-name-before.png`));

    // 1. type into a text block, click out, let autosave run
    await setPhase(page, state, 'typing');
    await typeIntoTextBlock(page);
    await clickEmptyCanvas(page);
    await waitForSave(state, 0);
    r.afterTyping = await probe(page);

    // 2. the sidebar action
    await setPhase(page, state, 'change');
    const savesBefore = state.saves.filter((s) => s.hasData).length;
    await sc.act(page);
    await page.waitForTimeout(300);
    r.afterChangeFocus = await page.evaluate(() => document.activeElement?.tagName);
    if (!sc.noBlurBeforeUndo) await clickEmptyCanvas(page);
    await waitForSave(state, savesBefore);
    r.afterChange = await probe(page);

    // 3. real ⌘Z twice
    await setPhase(page, state, 'undo1');
    r.focusAtUndo1 = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? `${a.tagName}${a.isContentEditable ? '[ce]' : ''}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}` : null;
    });
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    r.afterUndo1 = await probe(page);
    await setPhase(page, state, 'undo2');
    if (sc.noBlurBeforeUndo) await clickEmptyCanvas(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    r.afterUndo2 = await probe(page);
    await waitForSave(state, state.saves.filter((s) => s.hasData).length, 1500);

    // 4. name field on the Layout tab after everything
    await setPhase(page, state, 'post');
    await openTab(page, 'layout');
    r.nameFieldEnd = await page.locator('input[aria-label="Poster name"]').inputValue().catch(() => null);
    r.shotAfter = await shotNameField(page, path.join(OUT, 'shots', `${sc.id}-name-after.png`));
    r.transitions = await page.evaluate(() => window.__transitions);
    await page.close();

    // 5. reopen from the faked DB (what a refresh / the dashboard sees)
    state.phase = 'reopen';
    const page2 = await openEditor(context, state);
    r.reopen = {
      dbTitle: state.row.title,
      nameField: await page2.locator('input[aria-label="Poster name"]').inputValue().catch(() => null),
      docTitle: await page2.title(),
    };
    await page2.close();
  } catch (e) {
    r.harnessError = String(e && e.stack ? e.stack : e).slice(0, 800);
    try { if (page && !page.isClosed()) await page.screenshot({ path: path.join(OUT, 'shots', `${sc.id}-harness-error.png`) }); } catch { /* ignore */ }
  }
  r.saves = state.saves;
  r.errors = state.errors;
  r.abortedHosts = [...new Set(state.aborted.map((u) => { try { return new URL(u).host; } catch { return u; } }))];
  await context.close();
  return evaluate(sc, r);
}

function evaluate(sc, r) {
  if (r.harnessError) { r.verdict = 'HARNESS-ERROR'; return r; }
  const set = (p) => sc.setting(p);
  const tr = r.transitions ?? [];
  const change = tr.filter((t) => t.phase === 'change');
  r.metrics = {
    storeModuleIsAppInstance: r.before.store.posterId !== null,
    typedMarkerLanded: r.afterTyping.dom.markerInCanvas === true && r.afterTyping.store.markerInDoc === true,
    canUndoBeforeChange: r.afterTyping.store.canUndo,
    canUndoAfterChange: r.afterChange.store.canUndo,
    settingChanged: !sameSetting(set(r.afterChange), set(r.afterTyping)),
    settingRevertedByUndo1: sameSetting(set(r.afterUndo1), set(r.afterTyping)) && !sameSetting(set(r.afterChange), set(r.afterTyping)),
    markerAfterUndo1: r.afterUndo1.dom.markerInCanvas,
    markerAfterUndo2: r.afterUndo2.dom.markerInCanvas,
    nameFieldBefore: r.before.dom.nameField,
    nameFieldAfterTyping: r.afterTyping.dom.nameField,
    nameFieldAfterChange: r.afterChange.dom.nameField, // null when the Layout tab is not open
    nameFieldEnd: r.nameFieldEnd,
    storeTitleBefore: r.before.store.posterTitle,
    storeTitleAfterChange: r.afterChange.store.posterTitle,
    docTitleBefore: r.before.dom.docTitle,
    docTitleAfterChange: r.afterChange.dom.docTitle,
    savesTyping: r.saves.filter((s) => s.phase === 'typing' && s.hasData).map((s) => s.hasTitleKey ? s.title : '<no title key>'),
    savesChange: r.saves.filter((s) => s.phase === 'change' && s.hasData).map((s) => s.hasTitleKey ? s.title : '<no title key>'),
    reopenDbTitle: r.reopen?.dbTitle,
    reopenNameField: r.reopen?.nameField,
    // passive-store fingerprint of the change: transitions that dropped canUndo true→false AND rewrote posterTitle
    changeTransitions: change.length,
    changeTransitionsResettingHistory: change.filter((t) => t.docChanged && t.canUndo[0] === true && t.canUndo[1] === false).length,
    changeTransitionsRewritingTitle: change.filter((t) => t.titleFrom !== t.titleTo).map((t) => `${JSON.stringify(t.titleFrom)}→${JSON.stringify(t.titleTo)}`),
    changeCallers: change.filter((t) => t.docChanged).map((t) => t.callers.join(' < ')),
  };
  const m = r.metrics;
  m.markerTrace = [r.afterTyping, r.afterChange, r.afterUndo1, r.afterUndo2].map((p) => (p.dom.markerInCanvas ? 'T' : 'F')).join(',');
  m.markerAfterChange = r.afterChange.dom.markerInCanvas;
  m.seededSentencesAfterTyping = r.afterTyping.dom.seededSentencesInCanvas;
  m.seededSentencesAfterChange = r.afterChange.dom.seededSentencesInCanvas;
  m.seededSentencesAfterUndo2 = r.afterUndo2.dom.seededSentencesInCanvas;
  m.titleBlockAfterChange = r.afterChange.dom.titleBlockText;
  // What CORRECT behaviour looks like for this scenario:
  //   no undoable action  → ⌘Z#1 removes the typing;
  //   one undoable action → ⌘Z#1 reverts it (typing still there), ⌘Z#2 removes the typing.
  const undoOk = sc.undoPushesExpected === 0
    ? m.markerAfterUndo1 === false
    : m.markerAfterUndo1 === true && m.markerAfterUndo2 === false && (sc.setting === S.blocks || m.settingRevertedByUndo1);
  const nameOk = m.storeTitleAfterChange === DISPLAY_NAME && (m.nameFieldEnd === DISPLAY_NAME) && m.savesChange.every((t) => t === DISPLAY_NAME || t === '<no title key>');
  const persistOk = m.reopenDbTitle === DISPLAY_NAME;
  r.checks = { undoOk, nameOk, persistOk, instrumentOk: m.storeModuleIsAppInstance && m.typedMarkerLanded };
  if (!r.checks.instrumentOk) r.verdict = 'INSTRUMENT-FAIL';
  else r.verdict = undoOk && nameOk && persistOk ? 'OK' : sc.knownDefect ? 'KNOWN' : sc.informational ? 'INFO' : 'DEFECT';
  return r;
}

// ---------------------------------------------------------------- main
let server;
let browser;
const cleanup = async () => {
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  try { if (server) await server.close(); } catch { /* ignore */ }
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

let exitCode = 0;
try {
  server = await createServer({
    root: WEB,
    configFile: path.join(WEB, 'vite.config.ts'),
    cacheDir: path.join(OUT, '.vite-cache'),
    server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false },
    logLevel: 'warn',
  });
  await server.listen();
  log(`[harness] vite on ${BASE} (repo ${REPO})`);
  browser = await chromium.launch();
  const git = await import('node:child_process').then((cp) => {
    try { return cp.execSync('git rev-parse --short HEAD && git status --porcelain -- apps/web/src', { cwd: REPO }).toString().trim(); } catch { return 'n/a'; }
  });
  const results = [];
  const list = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));
  // Warm-up load so Vite's dep optimisation does not land inside a timed scenario.
  {
    const ctx = await browser.newContext();
    const st = { userId: randomUUID(), row: null, saves: [], aborted: [], phase: 'warmup' };
    try { const p = await openEditor(ctx, st); await p.close(); } catch (e) { log('[harness] warm-up:', String(e).slice(0, 200)); }
    await ctx.close();
  }
  const switchSkips = [];
  for (const sc of list) {
    const off = switchesOff(sc.needs);
    if (off.length) {
      switchSkips.push(sc.id);
      log(`[skipped] ${sc.id.padEnd(22)} ${switchOffReason(off)}`);
      continue;
    }
    const t0 = Date.now();
    const r = await runScenario(browser, sc);
    r.ms = Date.now() - t0;
    results.push(r);
    const m = r.metrics ?? {};
    log(`[${r.verdict}] ${sc.id.padEnd(22)} marker[typed,changed,⌘Z1,⌘Z2]=${m.markerTrace ?? '-'} undoOk=${r.checks?.undoOk} nameOk=${r.checks?.nameOk} persistOk=${r.checks?.persistOk} settingRevertedBy⌘Z1=${m.settingRevertedByUndo1} canUndo ${m.canUndoBeforeChange}→${m.canUndoAfterChange} name '${m.storeTitleBefore}'→'${m.storeTitleAfterChange}' saveTitle=${JSON.stringify(m.savesChange)} reopenDbTitle=${JSON.stringify(m.reopenDbTitle)} ${r.harnessError ? r.harnessError.split('\n')[0] : ''}`);
  }
  const controls = results.filter((r) => r.control);
  const controlsOk = controls.every((r) => r.verdict === 'OK');
  const defects = results.filter((r) => !r.control && !r.informational && r.verdict === 'DEFECT');
  exitCode = !controlsOk || results.some((r) => r.verdict === 'HARNESS-ERROR' || r.verdict === 'INSTRUMENT-FAIL') ? 2 : defects.length ? 1 : 0;
  const summary = {
    ranAt: new Date().toISOString(), repo: REPO, git, base: BASE, displayName: DISPLAY_NAME, titleBlockText: TITLE_BLOCK_TEXT,
    controlsOk, defects: defects.map((r) => r.id), exitCode, switchSkips,
    table: results.map((r) => ({ id: r.id, control: r.control, informational: r.informational, how: r.how, key: r.key, verdict: r.verdict, ...r.checks, ...(r.metrics ?? {}), focusAtUndo1: r.focusAtUndo1, afterChangeFocus: r.afterChangeFocus, pageErrors: (r.errors ?? []).length })),
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  log(`[harness] ${SWITCH_OFF}: ${switchSkips.length}${switchSkips.length ? ` (${switchSkips.join(', ')})` : ''}`);
  log(`[harness] controlsOk=${controlsOk} defects=${defects.length}/${results.filter((r) => !r.control && !r.informational).length} (informational excluded) exit=${exitCode}`);
  log(`[harness] wrote ${path.join(OUT, 'results.json')}`);
} catch (e) {
  log('[harness] fatal:', e && e.stack ? e.stack : e);
  exitCode = 2;
} finally {
  await cleanup();
}
process.exit(exitCode);
