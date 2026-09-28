#!/usr/bin/env node
/**
 * poster-size-check.mjs — real-browser regression check for fix 02: a new
 * poster size, or a template, throws the poster away; a typed size applies
 * every keystroke; a custom size is drawn, laid out and checked as 48 × 36.
 * Record: docs/fixes/02-poster-size.md.
 *
 * ORIGIN
 *   Written by the fix's independent confirmer (confirmer 2, real Chromium),
 *   who confirmed claims A1–A5, B1, C1 and D1–D4 on the UNFIXED code without
 *   seeing the author's tests (it was `size-claims-check.mjs` then). After the
 *   fix it was adapted so its claims can GATE:
 *     - every size or template action now answers the confirmation dialog the
 *       way a user would (the button that is not "Cancel", or "Cancel" in the
 *       *-cancel scenarios), then waits for the dialog to close;
 *     - it never clicks the empty canvas while a dialog is open (the backdrop
 *       covers the canvas; the pre-fix version failed with "no empty canvas
 *       point found");
 *     - each claim is re-expressed against the approved behaviour (record,
 *       section 7). The measuring code is the confirmer's; only the action
 *       layer, the pass conditions where the approved behaviour differs, and
 *       the exit gating changed.
 *
 * METHOD
 *   Boots the REAL apps/web Vite dev server in-process, opens the unmodified
 *   editor in Chromium (Playwright), fakes ONLY the network (Supabase REST/Auth
 *   at https://dummy.supabase.co and the API at http://localhost:3000) with
 *   context.route() — context-level so the print popup is hermetic too.
 *   Every action goes through real sidebar controls with real mouse/keyboard.
 *   The zustand store is read PASSIVELY (getState + subscribe) through the
 *   app's own module URL; no store action is ever called. Each store change is
 *   stamped with the harness phase and with whether a confirmation dialog was
 *   open at that instant.
 *
 *   A confirmation dialog is found as an element with role="dialog" (or the
 *   app's modal-content marker, for the pre-fix modal that had no role) that
 *   is not fading out (data-state="closing") and has a "Cancel" button.
 *
 *   One instrument note: the macOS native <select> popup cannot be driven in
 *   headless Chromium (click + Arrow/Enter do nothing, measured). For "choose
 *   an option from the menu with the mouse" the harness injects the CSS
 *   `select, ::picker(select) { appearance: base-select }`, which renders
 *   Chromium's customizable select picker in-page so real mouse clicks can
 *   pick an option; whether input/change fire is still decided by the
 *   browser's own select code. A control (picking a DIFFERENT option) must
 *   change the size, or the instrument is reported broken. Keyboard
 *   type-ahead on the focused, closed native select is a second, CSS-free path.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   A1–A5  a custom-size poster is drawn / laid out / offered in the menu /
 *          checked by ISSUES / previewed at 48 × 36 instead of its own size
 *          (meaning unchanged from the confirmer's run).
 *   B1     a preset change destroys the user's blocks. After CONFIRMING: any
 *          original block id or text missing, or a block not moved
 *          proportionally (more than 0.5 units off on any edge, stored
 *          geometry; the credit mark is excluded, it keeps its size). After
 *          CANCEL, or Escape on a keyboard draft: anything changed. Whether a
 *          dialog appeared before anything changed is reported.
 *   C1     a template replaces the blocks with no warning while the copy
 *          promises they are kept: no dialog before the blocks change, or the
 *          Templates copy still says "without losing their content". After
 *          CANCEL: anything changed.
 *   D1     a keystroke in the width/height field changes the poster's size
 *          before the field is committed (Enter, leaving it); Escape and
 *          Cancel leave the poster as it was.
 *   D2     a value outside 10–100 in is committed.
 *   D3     typing a normal size (24) loses the credit mark (__postr_ack_mark__).
 *   D4     a committed, confirmed smaller size leaves blocks where they were:
 *          not moved proportionally, or past the new edge.
 *   A claim scenario whose action had no effect at all (the size never
 *   reached its target after confirming, the template never applied, no
 *   dialog and no change after a Cancel) is a HARNESS-ERROR, not a verdict.
 *
 * RUN (from apps/web)
 *   node scripts/poster-size-check.mjs
 *   node scripts/poster-size-check.mjs --only b1-preset-mouse,ctl-b1-noop
 *   env PORT       dev-server port (default 5231; use another for side-by-side runs)
 *       OUT_DIR    results.json + exported PDF/PPTX files
 *                  (default <os tmpdir>/postr-poster-size-check-<PORT>)
 *       RUNS       run every scenario N times, each in a fresh browser context (default 1)
 *       POSTR_REPO repository root to test (default: the repo containing this script)
 *
 * EXIT
 *   0  every control passed, no scenario errored, and NO claim was observed
 *   1  at least one claim was observed (listed at the end); controls passed
 *   2  a control failed or a scenario errored — the instrument is not trustworthy
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json
 * (the app's build-stamp plugin). Restore it afterwards:
 *   git -C "$POSTR_REPO" checkout -- apps/web/public/version.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.POSTR_REPO ?? path.resolve(HERE, '../../..'));
const WEB = path.join(REPO, 'apps/web');
const PORT = Number(process.env.PORT ?? 5231);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS ?? 1);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), `postr-poster-size-check-${PORT}`));
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });

const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1])
      .split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACK_ID = '__postr_ack_mark__';
/** How long to wait for a confirmation dialog that may never come (the unfixed code has none). */
const DIALOG_APPEAR_MS = 1500;
/** B1/D4: how far (poster units) a stored block edge may sit from its proportional position. */
const EDGE_TOLERANCE = 0.5;
/** D2: the sizes a user may commit, in inches. */
const SHEET_MIN_IN = 10;
const SHEET_MAX_IN = 100;

const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules/vite/dist/node/index.js')).href);
const { PDFDocument } = await import(pathToFileURL(path.join(REPO, 'node_modules/pdf-lib/cjs/index.js')).href);
const fflate = await import(pathToFileURL(path.join(REPO, 'node_modules/fflate/esm/index.mjs')).href);
const pdfjs = await import(pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

// 4×4 opaque PNG, used as a user "figure" so its disappearance is observable.
const FIG_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fOEpjAAAAAElFTkSuQmCC';
const SENTENCES = [
  'ZQSENT1 Chronic sleep restriction impairs working memory.',
  'ZQSENT2 We predicted a dose-dependent decline in accuracy.',
  'ZQSENT3 Forty-eight participants completed the protocol.',
  'ZQSENT4 Accuracy fell by eleven percent across nights.',
];
const TEMPLATE_PLACEHOLDERS = [
  'Background and research question', 'State your specific hypotheses',
  'Participants, design, materials', 'Key findings, implications', 'Your Poster Title',
];

// ---------------------------------------------------------------- fake backend
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeJwt(sub, anon) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub, aud: 'authenticated', role: 'authenticated', is_anonymous: anon,
    iat: now, exp: now + 86400, session_id: randomUUID(),
  })}.c2lnbmF0dXJl`;
}
function makeUser(id, paid) {
  const t = new Date().toISOString();
  return {
    id, aud: 'authenticated', role: 'authenticated', email: paid ? 'jane.doe@example.test' : '', phone: '',
    is_anonymous: !paid, app_metadata: paid ? { provider: 'email', providers: ['email'] } : {}, user_metadata: {},
    identities: [], created_at: t, updated_at: t, last_sign_in_at: t, email_confirmed_at: paid ? t : undefined,
  };
}

async function installMocks(context, state) {
  const user = makeUser(state.userId, state.paid);
  const session = () => ({
    access_token: makeJwt(state.userId, !state.paid), token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'fake-refresh', user,
  });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', headers: cors, body: body === undefined ? '' : JSON.stringify(body),
  });
  // Hermetic: anything not the dev server, a data/blob URL or a faked host is aborted.
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    if (u.startsWith('https://dummy.supabase.co/') || u.startsWith('http://localhost:3000/')) return route.fallback();
    state.aborted.push(u.slice(0, 120));
    return route.abort();
  });
  await context.route('https://dummy.supabase.co/**', async (route) => {
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
          try { const body = JSON.parse(req.postData() || '{}'); b = Array.isArray(body) ? body[0] : body; } catch { /* keep {} */ }
          state.saves.push({
            phase: state.phase, hasData: !!b.data, widthIn: b.data?.widthIn, heightIn: b.data?.heightIn,
            ack: b.data ? (b.data.blocks || []).some((x) => x.id === ACK_ID) : null,
          });
          state.row = { ...state.row, ...b, updated_at: new Date().toISOString() };
          return json(route, wantsObject ? state.row : [state.row]);
        }
      }
      // Only the modal-detector control seeds a saved version (Versions › Restore opens a ConfirmModal).
      if (table === 'poster_versions' && method === 'GET' && state.versions) {
        return json(route, wantsObject ? state.versions[0] : state.versions);
      }
      if (table === 'users') {
        const row = {
          id: state.userId, plan: state.paid ? 'term' : 'free',
          plan_expires_at: state.paid ? new Date(Date.now() + 30 * 86400e3).toISOString() : null,
          export_credits: 0, review_credits: 0, review_addon: false,
          subscription_status: state.paid ? 'active' : null, research_consent_at: null, marketing_consent_at: null,
        };
        return json(route, wantsObject ? row : [row]);
      }
      if (method === 'GET') return json(route, wantsObject ? null : [], wantsObject ? 406 : 200);
      return json(route, wantsObject ? {} : [], 201);
    }
    if (p.startsWith('/storage/v1/')) return json(route, { error: 'not found' }, 404);
    return json(route, {});
  });
  await context.route('http://localhost:3000/**', (route) => json(route, { success: false, error: 'mock' }, 404));
  await context.addInitScript(({ customPalettes }) => {
    try {
      localStorage.setItem('postr.onboarding-done', 'true');
      localStorage.setItem('postr.mobile-notice-dismissed', 'true');
      if (customPalettes) localStorage.setItem('postr.custom-palettes', JSON.stringify(customPalettes));
    } catch { /* ignore */ }
  }, { customPalettes: state.customPalettes ?? null });
}

// ---------------------------------------------------------------- seed docs
/**
 * Seed doc from the app's REAL modules. spec:
 *   { w, h, kind: 'template', lw?, lh? }  3-col blocks laid out for lw×lh (default w×h),
 *                                          text blocks carry ZQSENT1..4, plus one PNG figure
 *   { w, h, kind: 'probes', blocks: [...] } explicit blocks (title added at the sheet top)
 */
async function buildDoc(page, spec) {
  await page.goto(`${BASE}/version.json`);
  return page.evaluate(async ({ spec, SENTENCES, FIG_PNG }) => {
    const t = await import('/src/poster/templates.ts');
    const c = await import('/src/poster/constants.ts');
    const { name: _n, ...palette } = c.PALETTES[0];
    let blocks;
    if (spec.kind === 'template') {
      blocks = t.makeBlocks('3col', spec.lw ?? spec.w, spec.lh ?? spec.h);
      let i = 0;
      for (const b of blocks) {
        if (b.type === 'title') b.content = 'ZQTITLE Sleep Restriction and Working Memory';
        if (b.type === 'text') {
          const filler = spec.long ? ` ${'Participants slept five hours per night for five nights while completing a two-back task each morning. '.repeat(spec.long)}` : '';
          b.content = `<p>${SENTENCES[i % SENTENCES.length]}${filler}</p>`; i += 1;
        }
        if (b.type === 'image') b.imageSrc = FIG_PNG;
      }
    } else {
      const W = spec.w * 10;
      blocks = [
        { id: 'zq-title', type: 'title', x: 10, y: 10, w: W - 20, h: 45, content: 'ZQTITLE Probe Poster', imageSrc: null, imageFit: 'contain', tableData: null },
        ...spec.blocks.map((b) => ({ type: 'text', imageSrc: null, imageFit: 'contain', tableData: null, ...b, content: `<p>${b.content}</p>` })),
      ];
    }
    return {
      version: 1, widthIn: spec.w, heightIn: spec.h, blocks,
      fontFamily: 'Source Sans 3', palette, styles: c.DEFAULT_STYLES,
      headingStyle: { border: 'bottom', fill: false, align: 'left' },
      institutions: [{ id: 'i1', name: 'Acme State University', dept: 'Department of Psychology' }],
      authors: [
        { id: 'a1', name: 'Jane Doe', affiliationIds: ['i1'], isCorresponding: true, equalContrib: false },
        { id: 'a2', name: 'John Smith', affiliationIds: ['i1'], isCorresponding: false, equalContrib: false },
      ],
      references: [{ id: 'r1', authors: ['Doe, J.'], year: '2021', title: 'Sleep restriction and cognition', journal: 'Journal of Sample Studies' }],
    };
  }, { spec, SENTENCES, FIG_PNG });
}

// ---------------------------------------------------------------- page helpers
async function openEditor(context, state) {
  const page = await context.newPage();
  page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 300)));
  page.on('dialog', (d) => { state.nativeDialogs.push({ phase: state.phase, type: d.type(), message: d.message().slice(0, 120) }); d.dismiss().catch(() => {}); });
  if (!state.row) {
    const doc = await buildDoc(page, state.spec);
    const t = new Date().toISOString();
    state.row = {
      id: randomUUID(), user_id: state.userId, title: 'ZQ Display Name', width_in: state.spec.w, height_in: state.spec.h,
      data: doc, thumbnail_path: null, share_slug: null, is_public: false, created_at: t, updated_at: t,
    };
  }
  await page.goto(`${BASE}/p/${state.row.id}`);
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  // PASSIVE observers — they record, never write. `__openModal` finds an open
  // confirmation dialog: role="dialog" (or the app's modal-content marker, which
  // the pre-fix ConfirmModal carried without a role), not fading out, with a
  // "Cancel" button (the Preview overlay is also a dialog, but has no Cancel).
  await page.evaluate(async (ACK) => {
    window.__openModal = () => {
      for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-postr-modal-content]')) {
        if (el.getAttribute('data-state') === 'closing') continue;
        if ([...el.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel')) return el;
      }
      return null;
    };
    const mod = await import('/src/stores/posterStore.ts');
    window.__phase = 'load';
    window.__tr = [];
    mod.usePosterStore.subscribe((s, p) => {
      if (s.doc === p.doc) return;
      window.__tr.push({
        phase: window.__phase, w: s.doc?.widthIn, h: s.doc?.heightIn, n: s.doc?.blocks.length,
        ack: !!s.doc?.blocks.some((b) => b.id === ACK),
        dlg: !!window.__openModal(), // was a confirmation dialog on screen when the poster changed?
      });
    });
  }, ACK_ID);
  return page;
}

async function setPhase(page, state, phase) {
  state.phase = phase;
  await page.evaluate((ph) => { window.__phase = ph; }, phase);
}
/** Store transitions, optionally only those stamped with one of `phases`. */
const transitions = (page, phases) => page.evaluate((ph) => window.__tr.filter((t) => !ph || ph.includes(t.phase)), phases ? [].concat(phases) : null);
const trLen = (page) => page.evaluate(() => window.__tr.length);
const sizeOf = (t) => `${t.w}x${t.h}`;

async function openTab(page, label) {
  await page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(350);
}

async function clickEmptyCanvas(page) {
  // A dialog's backdrop covers the canvas; clicking "empty canvas" then would
  // hit the backdrop (and cancel the dialog). Answer the dialog first.
  const openTitle = await page.evaluate(() => {
    const el = window.__openModal?.();
    return el ? (el.querySelector('h1,h2,h3,h4')?.textContent?.trim() || '(untitled)') : null;
  });
  if (openTitle) throw new Error(`a dialog is still open ("${openTitle}") — answer it before clicking the canvas`);
  const pt = await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const poster = document.getElementById('poster-canvas');
    if (!outer || !poster) return null;
    const o = outer.getBoundingClientRect();
    const frame = document.querySelector('[data-postr-canvas-frame]')?.getBoundingClientRect() ?? poster.getBoundingClientRect();
    const cands = [];
    for (const fx of [0.5, 0.2, 0.8]) { cands.push([o.left + o.width * fx, (frame.bottom + o.bottom) / 2]); cands.push([o.left + o.width * fx, (o.top + frame.top) / 2]); }
    for (const fy of [0.5, 0.3, 0.7]) { cands.push([(frame.right + o.right) / 2, o.top + o.height * fy]); cands.push([(o.left + frame.left) / 2, o.top + o.height * fy]); }
    cands.push([o.right - 20, o.bottom - 20], [o.left + 30, o.bottom - 20], [o.right - 20, o.top + 20]);
    for (const [x, y] of cands) {
      const el = document.elementFromPoint(x, y);
      if (!el || !outer.contains(el)) continue;
      if (el.closest('#poster-canvas') || el.closest('[data-block-id]') || el.closest('button') || el.closest('input,select,textarea,[contenteditable="true"]')) continue;
      return { x, y };
    }
    return null;
  });
  if (!pt) throw new Error('no empty canvas point found');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
}

/**
 * Answer the confirmation dialog the way a user would: `choice` 'confirm'
 * clicks the button that is not "Cancel", 'cancel' clicks "Cancel". Waits up
 * to DIALOG_APPEAR_MS for one to appear (none is a valid outcome: the unfixed
 * code never asks), then for it to leave the DOM. `since` is the store's
 * transition count before the user's action, so the result says how many
 * changes landed before the dialog did.
 */
async function answerDialog(page, choice, since) {
  const out = { appeared: false, choice, role: null, ariaModal: null, title: null, buttons: [], focusInside: null, clicked: null, changesBeforeDialog: null };
  const appeared = await page.waitForFunction(() => !!window.__openModal(), null, { timeout: DIALOG_APPEAR_MS, polling: 50 }).then(() => true, () => false);
  out.changesBeforeDialog = (await trLen(page)) - since;
  if (!appeared) return out;
  out.appeared = true;
  await page.waitForTimeout(150); // let the dialog's focus effect run before reading focus
  const dlg = page.locator('[role="dialog"]:not([data-state="closing"]), [role="alertdialog"]:not([data-state="closing"]), [data-postr-modal-content]:not([data-state="closing"])')
    .filter({ has: page.getByRole('button', { name: 'Cancel', exact: true }) }).first();
  const info = await dlg.evaluate((el) => ({
    role: el.getAttribute('role'), ariaModal: el.getAttribute('aria-modal'),
    title: el.querySelector('h1,h2,h3,h4')?.textContent?.trim() ?? null,
    buttons: [...el.querySelectorAll('button')].map((b) => b.textContent.trim()),
    focusInside: el.contains(document.activeElement),
  }));
  Object.assign(out, info);
  const idx = choice === 'cancel' ? info.buttons.indexOf('Cancel') : info.buttons.findIndex((t) => t !== 'Cancel');
  if (idx < 0) throw new Error(`dialog "${info.title}" has no ${choice} button (buttons: ${info.buttons.join(' | ')})`);
  const handle = await dlg.elementHandle();
  await dlg.locator('button').nth(idx).click();
  out.clicked = info.buttons[idx];
  const closed = await page.waitForFunction((el) => !el.isConnected, handle, { timeout: 5000, polling: 50 }).then(() => true, () => false);
  if (!closed) throw new Error(`dialog "${info.title}" did not close after clicking "${out.clicked}"`);
  await page.waitForTimeout(200);
  return out;
}

async function waitForSave(state, since, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (state.saves.filter((s) => s.hasData).length > since) break;
    await sleep(100);
  }
  await sleep(300);
}
const saveCount = (state) => state.saves.filter((s) => s.hasData).length;

const sizeSelect = (page) => page.locator('select', { has: page.locator('option[value="custom"]') });

/** Everything observed at one instant: DOM first, then passive store reads. */
async function probe(page) {
  return page.evaluate(async ({ ACK, SENTENCES, TEMPLATE_PLACEHOLDERS, FIG_PNG }) => {
    const mod = await import('/src/stores/posterStore.ts');
    const s = mod.usePosterStore.getState();
    const d = s.doc;
    const canvas = document.getElementById('poster-canvas');
    const text = canvas ? canvas.innerText : '';
    const sel = [...document.querySelectorAll('select')].find((el) => el.querySelector('option[value="custom"]'));
    const wIn = document.querySelector('input[aria-label="Poster width in inches"]');
    const hIn = document.querySelector('input[aria-label="Poster height in inches"]');
    const described = (el) => {
      const id = el?.getAttribute('aria-describedby');
      return id ? (document.getElementById(id)?.textContent?.trim() || null) : null;
    };
    const blocks = canvas ? [...canvas.querySelectorAll(':scope > [data-block-id]')].map((el) => ({
      id: el.getAttribute('data-block-id'), type: el.getAttribute('data-block-type'),
      x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
      oob: el.getAttribute('data-postr-oob') === 'true',
    })) : [];
    return {
      dom: {
        canvasW: canvas?.offsetWidth ?? null,
        canvasH: canvas?.offsetHeight ?? null,
        sentences: SENTENCES.filter((t) => text.includes(t.split(' ')[0])).length,
        placeholders: TEMPLATE_PLACEHOLDERS.filter((t) => text.includes(t)).length,
        figures: canvas ? [...canvas.querySelectorAll('img')].filter((i) => i.getAttribute('src') === FIG_PNG).length : null,
        authorsHasJane: text.includes('Jane Doe'),
        ack: !!canvas?.querySelector(`[data-block-id="${ACK}"]`),
        blockCount: blocks.length,
        blocks,
        select: sel ? { value: sel.value, label: sel.selectedOptions[0]?.textContent ?? null } : null,
        widthInput: wIn ? wIn.value : null,
        heightInput: hIn ? hIn.value : null,
        heightUnderflow: hIn ? hIn.validity.rangeUnderflow : null,
        widthInvalid: wIn ? wIn.getAttribute('aria-invalid') : null,
        heightInvalid: hIn ? hIn.getAttribute('aria-invalid') : null,
        fieldMessage: described(hIn) ?? described(wIn),
        domDialogs: document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],[data-postr-modal-content]').length,
        confirmDialogOpen: !!window.__openModal?.(),
      },
      store: {
        posterId: s.posterId,
        widthIn: d?.widthIn, heightIn: d?.heightIn, canUndo: s.canUndo,
        blocks: d ? d.blocks.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rotation ?? 0 })) : [],
        ack: d ? d.blocks.some((b) => b.id === ACK) : null,
      },
    };
  }, { ACK: ACK_ID, SENTENCES, TEMPLATE_PLACEHOLDERS, FIG_PNG });
}

/** Geometry summary of a block list against a sheet of W×H units. */
function geom(blocks, W, H, { excludeAck = false } = {}) {
  const bs = blocks.filter((b) => !excludeAck || b.id !== ACK_ID);
  const r = (n) => Math.round(n * 10) / 10;
  const maxRight = bs.length ? Math.max(...bs.map((b) => b.x + b.w)) : null;
  const maxBottom = bs.length ? Math.max(...bs.map((b) => b.y + b.h)) : null;
  const past = bs.filter((b) => b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5 || b.x < -0.5 || b.y < -0.5);
  return { n: bs.length, maxRight: r(maxRight), maxBottom: r(maxBottom), pastEdge: past.length, pastIds: past.map((b) => `${b.type}`) };
}

/**
 * B1/D4: did every block (by id) survive, and move PROPORTIONALLY from a
 * `from` sheet to a `to` sheet (inches)? Upright blocks: each stored edge must
 * sit within EDGE_TOLERANCE units of the old edge × the sheet's scale on that
 * axis. Rotated blocks: the centre. The credit mark is excluded (it keeps its
 * size and may be placed again for the new sheet).
 */
function proportional(beforeBlocks, afterBlocks, from, to) {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const missing = [];
  const rows = [];
  for (const b of beforeBlocks) {
    if (b.id === ACK_ID) continue;
    const a = afterBlocks.find((x) => x.id === b.id);
    if (!a) { missing.push(b.type); continue; }
    const dev = b.rot
      ? Math.max(Math.abs(a.x + a.w / 2 - (b.x + b.w / 2) * sx), Math.abs(a.y + a.h / 2 - (b.y + b.h / 2) * sy))
      : Math.max(
        Math.abs(a.x - b.x * sx), Math.abs(a.y - b.y * sy),
        Math.abs(a.x + a.w - (b.x + b.w) * sx), Math.abs(a.y + a.h - (b.y + b.h) * sy),
      );
    rows.push({ type: b.type, dev: Math.round(dev * 1000) / 1000 });
  }
  const over = rows.filter((r) => r.dev > EDGE_TOLERANCE);
  return {
    scale: `${+sx.toFixed(4)}x${+sy.toFixed(4)}`, checked: rows.length, missing,
    maxDev: rows.length ? Math.max(...rows.map((r) => r.dev)) : null,
    overTolerance: over.length, overTypes: over.map((r) => `${r.type}:${r.dev}`).slice(0, 6),
  };
}

/** Layout › Templates copy: the text under the "Templates" label, and whether the panel still promises content is kept. */
async function templatesCopy(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll('div')].find((el) => el.children.length === 0 && el.textContent.trim() === 'Templates');
    const copy = label?.nextElementSibling ? label.nextElementSibling.textContent.replace(/\s+/g, ' ').trim() : null;
    const panel = label?.parentElement?.innerText ?? '';
    return { copy, promisesKept: /without losing their content/i.test(`${copy ?? ''} ${panel}`) };
  });
}

/** Inject Chromium's customizable-select CSS so the picker renders in-page. */
async function enableBaseSelect(page) {
  await page.addStyleTag({ content: 'select, ::picker(select) { appearance: base-select !important; }' });
  await page.waitForTimeout(100);
}

/** Real mouse: click the size <select>, then click the option with `value`. */
async function mousePickSize(page, value) {
  const sel = sizeSelect(page);
  await sel.scrollIntoViewIfNeeded();
  const box = await sel.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const opt = await page.evaluate((v) => {
    const s = [...document.querySelectorAll('select')].find((el) => el.querySelector('option[value="custom"]'));
    const o = [...s.options].find((x) => x.value === v);
    const r = o.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, open: s.matches(':open') };
  }, value);
  if (!opt.open || opt.w === 0) throw new Error(`size picker did not open (open=${opt.open}, w=${opt.w})`);
  await page.mouse.click(opt.x + opt.w / 2, opt.y + opt.h / 2);
  await page.waitForTimeout(500);
  return opt;
}

/** Tab through the sidebar from the Poster-name field until the size <select> has focus. */
async function focusSizeSelectByTab(page) {
  await page.locator('input[aria-label="Poster name"]').click();
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(() => !!document.activeElement?.querySelector?.('option[value="custom"]'));
    if (ok) return i + 1;
  }
  throw new Error('could not Tab to the size select');
}

/** Select-all in a sidebar input, then type `text` one keystroke at a time, probing after each. */
async function typeIntoField(page, label, text, { probeEach = false } = {}) {
  const input = page.locator(`input[aria-label="${label}"]`);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.press('ControlOrMeta+a');
  const steps = [];
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(350);
    if (probeEach) {
      const p = await probe(page);
      steps.push({ typed: ch, inputValue: label.includes('height') ? p.dom.heightInput : p.dom.widthInput, canvas: `${p.dom.canvasW}x${p.dom.canvasH}`, domAck: p.dom.ack, store: `${p.store.widthIn}x${p.store.heightIn}`, storeAck: p.store.ack, dialogOpen: p.dom.confirmDialogOpen });
    }
  }
  return steps;
}

/**
 * Typed size, the user's way: type into the field (phase 'type'), then commit
 * it (phase 'commit') with `commit` = 'enter' | 'tab' (leave the field) |
 * 'click-away' | 'escape', and answer any dialog with `choice`. Ends with a
 * click on the empty canvas (after the dialog is gone).
 */
async function typeAndCommit(page, state, label, text, { commit, choice = 'confirm', fill = false, probeEach = true }) {
  await setPhase(page, state, 'type');
  let steps = [];
  if (fill) {
    await page.locator(`input[aria-label="${label}"]`).fill(text);
    await page.waitForTimeout(400);
  } else {
    steps = await typeIntoField(page, label, text, { probeEach });
  }
  const afterTyping = await probe(page);
  await setPhase(page, state, 'commit');
  const since = await trLen(page);
  if (commit === 'enter') await page.keyboard.press('Enter');
  else if (commit === 'tab') {
    // Leave the size fields by keyboard. Width and height are one change, so
    // a Tab from width onto height asks nothing; the next Tab leaves both.
    await page.keyboard.press('Tab');
    const onOther = await page.evaluate(() => /^Poster (width|height) in inches$/.test(document.activeElement?.getAttribute('aria-label') ?? ''));
    if (onOther) await page.keyboard.press('Tab');
  }
  else if (commit === 'escape') await page.keyboard.press('Escape');
  else if (commit === 'click-away') await clickEmptyCanvas(page);
  else throw new Error(`unknown commit "${commit}"`);
  const dialog = await answerDialog(page, choice, since);
  const afterCommit = await probe(page); // before the final click-away, so a field message is still attached
  await clickEmptyCanvas(page);
  return {
    steps, afterTyping, afterCommit, dialog,
    typed: await transitions(page, 'type'),
    committed: await transitions(page, 'commit'),
  };
}

async function undoLoop(page, state, maxPresses, restored) {
  const out = [];
  await clickEmptyCanvas(page);
  for (let i = 1; i <= maxPresses; i += 1) {
    await setPhase(page, state, `undo${i}`);
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(500);
    const p = await probe(page);
    const snap = { press: i, size: `${p.store.widthIn}x${p.store.heightIn}`, sentences: p.dom.sentences, figures: p.dom.figures, placeholders: p.dom.placeholders };
    out.push(snap);
    if (restored(p)) return { presses: i, trace: out };
  }
  return { presses: null, trace: out };
}

// ---------------------------------------------------------------- PDF / PPTX readers
async function pdfFacts(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const { width, height } = pages[0].getSize();
  const pj = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false }).promise;
  const pg = await pj.getPage(1);
  const tc = await pg.getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5] }));
  const onPage = (m) => items.some((it) => it.s.includes(m) && it.x >= 0 && it.x <= width && it.y >= 0 && it.y <= height);
  const anywhere = (m) => items.some((it) => it.s.includes(m));
  await pj.destroy();
  return { pages: pages.length, widthIn: +(width / 72).toFixed(3), heightIn: +(height / 72).toFixed(3), onPage, anywhere, itemCount: items.length };
}

function pptxSlideSize(bytes) {
  const files = fflate.unzipSync(new Uint8Array(bytes));
  const xml = fflate.strFromU8(files['ppt/presentation.xml']);
  const m = xml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  return m ? { cx: +m[1], cy: +m[2], widthIn: +(m[1] / 914400).toFixed(3), heightIn: +(m[2] / 914400).toFixed(3) } : null;
}

// ---------------------------------------------------------------- scenario bodies
const tpl = (w, h, extra = {}) => ({ w, h, kind: 'template', ...extra });

/** A1 + A3(part 1): what the editor draws and what the size menu shows. */
const drawScenario = (w, h) => async ({ page }) => {
  await openTab(page, 'layout');
  const p = await probe(page);
  return {
    docSize: `${p.store.widthIn}x${p.store.heightIn}`,
    drawnUnits: `${p.dom.canvasW}x${p.dom.canvasH}`,
    drawnIn: `${p.dom.canvasW / 10}x${p.dom.canvasH / 10}`,
    drawnMatchesDoc: p.dom.canvasW === Math.round(w * 10) && p.dom.canvasH === Math.round(h * 10),
    selectValue: p.dom.select?.value, selectLabel: p.dom.select?.label,
    inputs: `${p.dom.widthInput}x${p.dom.heightInput}`,
    storeBlocksVsDoc: geom(p.store.blocks, w * 10, h * 10),
    storeBlocksVsDrawn: geom(p.store.blocks, p.dom.canvasW, p.dom.canvasH),
  };
};

/** A2: template / auto-arrange on a sheet of w×h. A template asks first since fix 02: confirm it. */
const layoutScenario = (w, h, action) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  await setPhase(page, state, 'act');
  const since = await trLen(page);
  let dialog = null;
  if (action === 'template') {
    await page.getByRole('button', { name: /3-Column Classic/ }).click();
    dialog = await answerDialog(page, 'confirm', since);
  } else {
    await page.getByRole('button', { name: /Auto-Arrange/ }).click();
  }
  await page.waitForTimeout(700);
  await clickEmptyCanvas(page);
  const after = await probe(page);
  // Geometry signature (ids/content excluded). For the template action, compare against the
  // app's own pure makeBlocks() output for (a) the drawn 48x36 preset and (b) the poster's own size.
  const sig = (bs) => bs.filter((b) => b.id !== ACK_ID).map((b) => `${b.type}:${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).sort().join('|');
  const refs = await page.evaluate(async ({ w, h }) => {
    const t = await import('/src/poster/templates.ts');
    const g = (bs) => bs.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h }));
    return { drawn48x36: g(t.makeBlocks('3col', 48, 36)), own: g(t.makeBlocks('3col', w, h)) };
  }, { w, h });
  const afterSig = sig(after.store.blocks);
  return {
    afterSig,
    dialog: dialog && { appeared: dialog.appeared, title: dialog.title, clicked: dialog.clicked },
    matchesTemplateAt48x36: action === 'template' ? afterSig === sig(refs.drawn48x36) : null,
    matchesTemplateAtOwnSize: action === 'template' ? afterSig === sig(refs.own) : null,
    docSize: `${after.store.widthIn}x${after.store.heightIn}`,
    drawnUnits: `${after.dom.canvasW}x${after.dom.canvasH}`,
    storeChanged: JSON.stringify(before.store.blocks) !== JSON.stringify(after.store.blocks),
    beforeVsSheet: geom(before.store.blocks, w * 10, h * 10, { excludeAck: true }),
    afterStoreVsSheet: geom(after.store.blocks, w * 10, h * 10, { excludeAck: true }),
    afterDomVsSheet: geom(after.dom.blocks, w * 10, h * 10, { excludeAck: true }),
    afterStoreVs480x360: geom(after.store.blocks, 480, 360, { excludeAck: true }),
    titleBlockAfter: after.store.blocks.filter((b) => b.type === 'title').map((b) => `x${b.x} w${b.w} right${b.x + b.w}`)[0] ?? null,
    oobFlagsOnBlocksPastSheet: after.dom.blocks.filter((b) => b.id !== ACK_ID && (b.x + b.w > w * 10 + 0.5 || b.y + b.h > h * 10 + 0.5)).filter((b) => b.oob).length,
    nativeDialogs: state.nativeDialogs.length,
  };
};

/** A3: choose an option from the size menu with the real mouse (base-select picker); confirm if asked. */
const menuScenario = (value) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  await setPhase(page, state, 'act');
  const since = await trLen(page);
  await enableBaseSelect(page);
  await mousePickSize(page, value);
  const dialog = await answerDialog(page, 'confirm', since);
  await clickEmptyCanvas(page);
  const after = await probe(page);
  const tr = await transitions(page, 'act');
  return {
    how: `mouse: open picker, click option ${value}${dialog.appeared ? `, then "${dialog.clicked}"` : ''}`,
    dialog: { appeared: dialog.appeared, title: dialog.title, changesBeforeDialog: dialog.changesBeforeDialog },
    selectBefore: before.dom.select, selectAfter: after.dom.select,
    sizeBefore: `${before.store.widthIn}x${before.store.heightIn}`, sizeAfter: `${after.store.widthIn}x${after.store.heightIn}`,
    docTransitions: tr.length, transitionSizes: tr.map(sizeOf),
    sentencesBefore: before.dom.sentences, sentencesAfter: after.dom.sentences,
    placeholdersAfter: after.dom.placeholders,
    blocksKept: after.store.blocks.filter((b) => before.store.blocks.some((x) => x.id === b.id)).length,
  };
};

/** A3 informational: Playwright selectOption() of the ALREADY-selected value (synthetic change event). */
const selectOptionSameScenario = async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  await setPhase(page, state, 'act');
  const since = await trLen(page);
  await sizeSelect(page).selectOption(before.dom.select.value);
  await page.waitForTimeout(500);
  const dialog = await answerDialog(page, 'confirm', since);
  await clickEmptyCanvas(page);
  const after = await probe(page);
  const tr = await transitions(page, 'act');
  return { selectValue: before.dom.select.value, dialogAppeared: dialog.appeared, sizeBefore: `${before.store.widthIn}x${before.store.heightIn}`, sizeAfter: `${after.store.widthIn}x${after.store.heightIn}`, docTransitions: tr.length, sentencesBefore: before.dom.sentences, sentencesAfter: after.dom.sentences };
};

/** A4: off-sheet warnings for probe blocks. */
const PROBES = {
  '30x40': [
    { id: 'zq-past-real', x: 320, y: 100, w: 100, h: 40, content: 'ZQPAST past the real right edge (300), inside the drawn 480' },
    { id: 'zq-in-real-past-drawn', x: 20, y: 364, w: 120, h: 26, content: 'ZQIN inside' },
    { id: 'zq-inside', x: 20, y: 100, w: 100, h: 40, content: 'ZQOK inside both' },
  ],
  '48x24': [
    { id: 'zq-past-real', x: 20, y: 262, w: 140, h: 40, content: 'ZQPAST below the real bottom (240)' },
    { id: 'zq-inside', x: 20, y: 100, w: 100, h: 40, content: 'ZQOK inside both' },
  ],
  '48x36': [
    { id: 'zq-past-real', x: 470, y: 100, w: 60, h: 40, content: 'ZQPAST past 480' },
    { id: 'zq-inside', x: 20, y: 100, w: 100, h: 40, content: 'ZQOK inside' },
  ],
  '36x48': [
    { id: 'zq-past-real', x: 320, y: 100, w: 100, h: 40, content: 'ZQPAST past the real right edge (360)' },
    { id: 'zq-in-real-past-drawn', x: 20, y: 420, w: 120, h: 26, content: 'ZQIN inside the real 480' },
    { id: 'zq-inside', x: 20, y: 100, w: 100, h: 40, content: 'ZQOK inside both' },
  ],
};
const issuesScenario = async ({ page }) => {
  await openTab(page, 'issues');
  const p = await probe(page);
  const issues = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('nav[aria-label="Sidebar sections"] ~ div button, nav[aria-label="Sidebar sections"] + div button')) {
      const t = b.innerText.replace(/\s+/g, ' ').trim();
      if (/out of bounds|extends past|completely outside/i.test(t)) out.push(t.slice(0, 140));
    }
    return out;
  });
  const flag = Object.fromEntries(p.dom.blocks.filter((b) => b.id.startsWith('zq-')).map((b) => [b.id, { oob: b.oob, rect: `x${b.x} y${b.y} w${b.w} h${b.h}` }]));
  return { docSize: `${p.store.widthIn}x${p.store.heightIn}`, drawnUnits: `${p.dom.canvasW}x${p.dom.canvasH}`, flags: flag, oobIssueTexts: issues, oobIssueCount: issues.length };
};

/** A5: Preview → Print / Save PDF popup → PDF bytes (page.pdf of the popup). */
const printScenario = (markersVisible) => async ({ page, state, run, id }) => {
  const p0 = await probe(page);
  await openTab(page, 'export');
  await page.getByRole('button', { name: /Preview poster/ }).click();
  await page.waitForSelector('[data-postr-preview]');
  await page.waitForTimeout(500);
  const preview = await page.evaluate(() => {
    const ov = document.querySelector('[data-postr-preview]');
    const clip = ov.firstElementChild; const inner = clip.firstElementChild;
    const label = [...ov.querySelectorAll('span')].map((s) => s.textContent).find((t) => /·/.test(t)) ?? null;
    const ir = inner.getBoundingClientRect(); const cr = clip.getBoundingClientRect();
    const scale = ir.width / inner.offsetWidth;
    const clipped = [...inner.querySelectorAll(':scope > [data-block-id]')].filter((el) => {
      const r = el.getBoundingClientRect(); return r.bottom > cr.bottom + 1 || r.right > cr.right + 1;
    }).map((el) => el.getAttribute('data-block-type'));
    return { innerUnits: `${inner.offsetWidth}x${inner.offsetHeight}`, label, scale: +scale.toFixed(4), blocksCutByPreviewClip: clipped };
  });
  await setPhase(page, state, 'print');
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }),
    page.getByRole('button', { name: /Print \/ Save PDF/ }).click(),
  ]);
  await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
  await popup.waitForTimeout(1200);
  const pop = await popup.evaluate(() => {
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const m = css.match(/@page\s*{\s*size:\s*([^;]+);/);
    const root = document.getElementById('poster-print-root');
    return { pageSizeCss: m ? m[1].trim() : null, printRootPx: `${root.offsetWidth}x${root.offsetHeight}`, toolbarSize: document.querySelector('.print-toolbar-size')?.textContent ?? null };
  });
  const pdfBytes = await popup.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPath = path.join(OUT, 'files', `${id}-run${run}.pdf`);
  fs.writeFileSync(pdfPath, pdfBytes);
  const pf = await pdfFacts(pdfBytes);
  await popup.close();
  const markers = {};
  for (const m of markersVisible) markers[m] = { inEditorDom: (await page.evaluate((mm) => document.getElementById('poster-canvas').innerText.includes(mm), m)), onPdfPage: pf.onPage(m), anywhereInPdf: pf.anywhere(m) };
  return {
    docSize: `${p0.store.widthIn}x${p0.store.heightIn}`,
    editorDrawnUnits: `${p0.dom.canvasW}x${p0.dom.canvasH}`,
    preview,
    popup: pop,
    pdf: { file: pdfPath, pages: pf.pages, pageIn: `${pf.widthIn}x${pf.heightIn}`, textItems: pf.itemCount },
    markers,
  };
};

/** A5: PPTX export (fake paid permanent user) → ppt/presentation.xml sldSz. */
const pptxScenario = async ({ page, run, id }) => {
  const p0 = await probe(page);
  await openTab(page, 'export');
  const btn = page.locator('button[data-postr-export-pptx]');
  await btn.waitFor();
  for (let i = 0; i < 30 && (await btn.isDisabled()); i += 1) await page.waitForTimeout(200);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    btn.click(),
  ]);
  const file = path.join(OUT, 'files', `${id}-run${run}.pptx`);
  await dl.saveAs(file);
  const sz = pptxSlideSize(fs.readFileSync(file));
  return { docSize: `${p0.store.widthIn}x${p0.store.heightIn}`, editorDrawnUnits: `${p0.dom.canvasW}x${p0.dom.canvasH}`, file, slide: sz ? `${sz.widthIn}x${sz.heightIn}` : null, sldSz: sz };
};

/**
 * B1 / C1: a whole-poster action (preset, template), the dialog answered with
 * `choice`, then block survival, proportional geometry (when `target` is a
 * size), the Templates copy, and ⌘Z recovery after a confirmed change.
 * `act(page)` returns a description, or { how, ...extra } merged into the result.
 */
const replaceScenario = (act, { choice = 'confirm', target = null, kind } = {}) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  const copy = await templatesCopy(page);
  if (copy.copy === null) throw new Error('Layout › Templates copy not found');
  await setPhase(page, state, 'act');
  const since = await trLen(page);
  const acted = await act(page);
  const { how, ...extra } = typeof acted === 'string' ? { how: acted } : acted;
  const dialog = await answerDialog(page, choice, since);
  await page.waitForTimeout(300);
  await clickEmptyCanvas(page);
  const after = await probe(page);
  const tr = await transitions(page, 'act');
  const sizeBefore = `${before.store.widthIn}x${before.store.heightIn}`;
  const sizeAfter = `${after.store.widthIn}x${after.store.heightIn}`;
  const idsMissing = before.store.blocks.filter((b) => b.id !== ACK_ID && !after.store.blocks.some((x) => x.id === b.id)).map((b) => b.type);
  const textLost = after.dom.sentences < before.dom.sentences || after.dom.figures < before.dom.figures;
  const storeChanged = JSON.stringify(before.store.blocks) !== JSON.stringify(after.store.blocks);
  const selectChanged = before.dom.select?.value !== after.dom.select?.value;
  const r = {
    how, ...extra, choice, templatesCopy: copy.copy, copyPromisesKept: copy.promisesKept,
    dialog, dialogBeforeChange: dialog.appeared && dialog.changesBeforeDialog === 0,
    firstChangeUnderDialog: tr.length ? tr[0].dlg : null,
    sizeBefore, sizeAfter, target: target ? `${target.w}x${target.h}` : null,
    sentences: `${before.dom.sentences}->${after.dom.sentences}`,
    figures: `${before.dom.figures}->${after.dom.figures}`,
    placeholders: `${before.dom.placeholders}->${after.dom.placeholders}`,
    authorsStillShown: after.dom.authorsHasJane,
    blockIdsKept: `${after.store.blocks.filter((b) => before.store.blocks.some((x) => x.id === b.id)).map((b) => b.id === ACK_ID ? 'ACK' : b.type).join(',') || '(none)'} of ${before.store.blocks.length}`,
    idsMissing, textLost, storeChanged,
    select: `${before.dom.select?.value}->${after.dom.select?.value}`,
    anythingChanged: sizeAfter !== sizeBefore || storeChanged || textLost || selectChanged,
    docTransitions: tr.length,
    nativeDialogs: state.nativeDialogs.filter((d) => d.phase === 'act').length,
  };
  if (target && choice === 'confirm') { // after a Cancel there is no new sheet to be proportional to
    r.geometry = proportional(before.store.blocks, after.store.blocks,
      { w: before.store.widthIn, h: before.store.heightIn }, target);
  }
  // A claim scenario whose action did nothing measures nothing: say so instead of passing.
  if (kind === 'confirm-size' && sizeAfter !== r.target) throw new Error(`the size change did not apply (size ${sizeBefore} -> ${sizeAfter}, target ${r.target}; dialog: ${dialog.appeared ? `"${dialog.title}" -> "${dialog.clicked}"` : 'none'})`);
  if (kind === 'confirm-template' && !storeChanged) throw new Error(`the template did not apply (blocks unchanged; dialog: ${dialog.appeared ? `"${dialog.title}" -> "${dialog.clicked}"` : 'none'})`);
  if (kind === 'cancel' && !dialog.appeared && !r.anythingChanged) throw new Error('the action had no effect: no dialog to cancel and nothing changed');
  if (kind === 'escape' && !extra.draftMoved) throw new Error(`typing did not move the menu (${extra.selectWhileTyping})`);
  if (choice === 'confirm' && storeChanged) {
    const restored = (p) => p.dom.sentences === before.dom.sentences && p.dom.figures === before.dom.figures
      && p.store.widthIn === before.store.widthIn && p.store.heightIn === before.store.heightIn;
    const undo = await undoLoop(page, state, 3, restored);
    r.undoPressesToRestore = undo.presses;
    r.undoTrace = undo.trace;
  }
  return r;
};

/** Is a committed w×h outside the sizes a user may commit? */
const outOfRange = (w, h) => !(w >= SHEET_MIN_IN && w <= SHEET_MAX_IN && h >= SHEET_MIN_IN && h <= SHEET_MAX_IN);

/** Common D-family result: what typing did, what the commit did, the end state. */
function typedResult(before, after, t, targetSize) {
  const sizeBefore = `${before.store.widthIn}x${before.store.heightIn}`;
  const canvasBefore = `${before.dom.canvasW}x${before.dom.canvasH}`;
  return {
    sizeBefore, sizeAfter: `${after.store.widthIn}x${after.store.heightIn}`, target: targetSize,
    canvasBefore, canvasAfter: `${after.dom.canvasW}x${after.dom.canvasH}`,
    sizeChangesWhileTyping: t.typed.filter((x) => sizeOf(x) !== sizeBefore).map(sizeOf),
    canvasChangesWhileTyping: t.steps.filter((s) => s.canvas !== canvasBefore).map((s) => `${s.typed}:${s.canvas}`),
    dialogWhileTyping: t.steps.some((s) => s.dialogOpen),
    appliedSizes: [...t.typed, ...t.committed].map(sizeOf),
    dialog: { appeared: t.dialog.appeared, title: t.dialog.title, role: t.dialog.role, clicked: t.dialog.clicked, changesBeforeDialog: t.dialog.changesBeforeDialog, focusInside: t.dialog.focusInside },
    steps: t.steps,
  };
}

/** D1: keystroke-by-keystroke custom size, committed with Enter and confirmed (or cancelled / escaped). */
const keystrokeSizeScenario = (label, text, { fill = false, commit = 'enter', choice = 'confirm', kind = 'confirm' } = {}) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  const field = label.includes('width') ? 'w' : 'h';
  const target = field === 'w' ? `${Number(text)}x${before.store.heightIn}` : `${before.store.widthIn}x${Number(text)}`;
  const t = await typeAndCommit(page, state, label, text, { commit, choice, fill, probeEach: !fill });
  const after = await probe(page);
  const r = {
    how: `${fill ? `fill("${text}") — one input event` : `select-all + type "${text}" one key at a time`}, then ${commit}${t.dialog.appeared ? `, then "${t.dialog.clicked}"` : ''}`,
    ...typedResult(before, after, t, target),
    fieldAfterTyping: field === 'w' ? t.afterTyping.dom.widthInput : t.afterTyping.dom.heightInput,
    fieldAfter: field === 'w' ? after.dom.widthInput : after.dom.heightInput,
    storeChanged: JSON.stringify(before.store.blocks) !== JSON.stringify(after.store.blocks),
    ackDom: `${before.dom.ack}->${after.dom.ack}`,
  };
  if (r.fieldAfterTyping !== text) throw new Error(`the field did not take the typed "${text}" (shows "${r.fieldAfterTyping}")`);
  if (kind === 'confirm' && r.sizeAfter !== target) throw new Error(`the typed size did not apply after ${commit}${t.dialog.appeared ? ` + "${t.dialog.clicked}"` : ''} (size ${r.sizeBefore} -> ${r.sizeAfter}, target ${target})`);
  if (kind === 'cancel' && !t.dialog.appeared && r.sizeAfter === r.sizeBefore && r.sizeChangesWhileTyping.length === 0) throw new Error('the action had no effect: no dialog to cancel and nothing changed');
  return r;
};

/** D2: a value outside 10–100 in, committed by leaving the field (click-away) or Enter. */
const outOfRangeScenario = (value, { commit = 'click-away', requireEcho = true } = {}) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  const s0 = saveCount(state);
  const t = await typeAndCommit(page, state, 'Poster height in inches', value, { commit, choice: 'confirm', probeEach: false });
  await waitForSave(state, s0);
  const after = await probe(page);
  const saved = state.saves.filter((s) => (s.phase === 'type' || s.phase === 'commit') && s.hasData).map((s) => ({ w: s.widthIn, h: s.heightIn }));
  const applied = [...t.typed, ...t.committed];
  // Guard against a keystroke that never reached the field (a false "not committed").
  if (requireEcho && t.afterTyping.dom.heightInput !== value) throw new Error(`the field did not take the typed "${value}" (shows "${t.afterTyping.dom.heightInput}")`);
  return {
    typed: value, commit, fieldAfterTyping: t.afterTyping.dom.heightInput, sizeBefore: `${before.store.widthIn}x${before.store.heightIn}`, sizeAfter: `${after.store.widthIn}x${after.store.heightIn}`,
    heightInputAfter: after.dom.heightInput, rangeUnderflow: after.dom.heightUnderflow,
    fieldMessage: t.afterCommit.dom.fieldMessage, heightAriaInvalid: t.afterCommit.dom.heightInvalid,
    dialog: { appeared: t.dialog.appeared, title: t.dialog.title, clicked: t.dialog.clicked },
    appliedSizes: applied.map(sizeOf),
    appliedOutOfRange: applied.filter((x) => outOfRange(x.w, x.h)).map(sizeOf),
    savedToDb: saved.map(sizeOf),
    savedOutOfRange: saved.filter((x) => outOfRange(x.w, x.h)).map(sizeOf),
    endOutOfRange: outOfRange(after.store.widthIn, after.store.heightIn),
  };
};

/** D3: credit mark through keystroke vs single-change height entry (Enter + confirm), a later edit, then reopen. */
const ackScenario = ({ fill }) => async ({ context, page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  if (!before.dom.ack) throw new Error('precondition: the poster has no credit mark to lose');
  const s0 = saveCount(state);
  const t = await typeAndCommit(page, state, 'Poster height in inches', '24', { commit: 'enter', choice: 'confirm', fill, probeEach: !fill });
  await waitForSave(state, s0);
  const after = await probe(page);
  if (`${after.store.widthIn}x${after.store.heightIn}` !== `${before.store.widthIn}x24`) throw new Error(`the typed height did not apply (size ${after.store.widthIn}x${after.store.heightIn})`);
  // A further, unrelated edit: does anything bring the mark back in-session?
  await setPhase(page, state, 'later');
  await openTab(page, 'style');
  await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).selectOption('DM Sans');
  await page.waitForTimeout(400);
  await clickEmptyCanvas(page);
  const s1 = saveCount(state);
  await waitForSave(state, s1 - 1);
  const later = await probe(page);
  const ackRect = (p) => { const b = p.dom.blocks.find((x) => x.id === ACK_ID); return b ? `x${b.x} y${b.y} w${b.w} h${b.h}` : null; };
  await page.close();
  state.phase = 'reopen';
  const page2 = await openEditor(context, state);
  const reopened = await probe(page2);
  await page2.close();
  return {
    how: `${fill ? 'fill("24") — one input event' : 'select-all + type "2","4"'}, Enter${t.dialog.appeared ? `, "${t.dialog.clicked}"` : ''}`,
    sizeAfter: `${after.store.widthIn}x${after.store.heightIn}`,
    dialog: { appeared: t.dialog.appeared, title: t.dialog.title, clicked: t.dialog.clicked },
    ackBefore: { dom: before.dom.ack, store: before.store.ack, rect: ackRect(before) },
    steps: t.steps,
    ackLostWhileTyping: t.steps.some((s) => !s.domAck || !s.storeAck),
    ackAfter: { dom: after.dom.ack, store: after.store.ack, rect: ackRect(after) },
    ackAfterLaterEdit: { dom: later.dom.ack, store: later.store.ack },
    savedAck: state.saves.filter((s) => s.hasData && s.phase !== 'load').map((s) => `${s.phase}:${s.heightIn}:${s.ack}`),
    reopened: { size: `${reopened.store.widthIn}x${reopened.store.heightIn}`, ackDom: reopened.dom.ack, rect: ackRect(reopened), sheetBottom: reopened.store.heightIn * 10 },
  };
};

/** D4: shrink the sheet by typing, leave the size fields (Tab) and confirm; do the blocks move with it? */
const shrinkScenario = (label, text, W, H) => async ({ page, state }) => {
  await openTab(page, 'layout');
  const before = await probe(page);
  const t = await typeAndCommit(page, state, label, text, { commit: 'tab', choice: 'confirm', probeEach: false });
  const after = await probe(page);
  const to = { w: W / 10, h: H / 10 };
  const moved = after.store.blocks.filter((b) => {
    const o = before.store.blocks.find((x) => x.id === b.id);
    return !o || o.x !== b.x || o.y !== b.y || o.w !== b.w || o.h !== b.h;
  }).map((b) => (b.id === ACK_ID ? 'ACK' : b.type));
  const r = {
    ...typedResult(before, after, t, `${to.w}x${to.h}`),
    drawnAfter: `${after.dom.canvasW}x${after.dom.canvasH}`,
    blocksMovedOrResized: moved, blocksBefore: before.store.blocks.length, blocksAfter: after.store.blocks.length,
    geometry: proportional(before.store.blocks, after.store.blocks, { w: before.store.widthIn, h: before.store.heightIn }, to),
    pastNewEdgeStore: geom(after.store.blocks, W, H, { excludeAck: true }),
    pastNewEdgeDom: geom(after.dom.blocks, W, H, { excludeAck: true }),
    oobFlagsOnPastBlocks: after.dom.blocks.filter((b) => b.id !== ACK_ID && (b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5)).filter((b) => b.oob).length,
  };
  delete r.steps;
  if (r.sizeAfter !== r.target) throw new Error(`the typed size did not apply after Tab${t.dialog.appeared ? ` + "${t.dialog.clicked}"` : ''} (size ${r.sizeBefore} -> ${r.sizeAfter}, target ${r.target})`);
  return r;
};

/** Control: the native-dialog listener and the DOM dialog detector both work. */
const dialogDetectorScenario = async ({ page, state }) => {
  await openTab(page, 'style');
  await setPhase(page, state, 'act');
  await page.locator('button[title="Delete palette"]').first().click();
  await page.waitForTimeout(400);
  const native = state.nativeDialogs.filter((d) => d.phase === 'act');
  await openTab(page, 'export');
  await page.getByRole('button', { name: /Preview poster/ }).click();
  await page.waitForSelector('[data-postr-preview]');
  const p = await probe(page);
  return { nativeDialogs: native.length, nativeDialogTexts: native.map((d) => `${d.type}:${d.message}`), domDialogsWithPreviewOpen: p.dom.domDialogs };
};

/**
 * Control: answerDialog() finds the app's own ConfirmModal — on the unfixed
 * code too, where it had no dialog role — and Cancel closes it with no change.
 * Versions › Restore opens one without touching the poster's size.
 */
const modalDetectorScenario = async ({ page, state }) => {
  await openTab(page, 'versions');
  const restore = page.getByRole('button', { name: 'Restore', exact: true }).first();
  await restore.waitFor({ timeout: 10000 });
  const before = await probe(page);
  await setPhase(page, state, 'act');
  const since = await trLen(page);
  await restore.click();
  const dialog = await answerDialog(page, 'cancel', since);
  await clickEmptyCanvas(page);
  const after = await probe(page);
  return {
    dialog: { appeared: dialog.appeared, title: dialog.title, role: dialog.role, buttons: dialog.buttons, clicked: dialog.clicked },
    docTransitions: (await transitions(page, 'act')).length,
    storeChanged: JSON.stringify(before.store.blocks) !== JSON.stringify(after.store.blocks),
  };
};

// ---------------------------------------------------------------- scenario table
// `claim(r)` → true when the reported defect is OBSERVED in this run.
// `control_(r)` → true when the control behaves as a correct instrument must.
// Controls must hold on the unfixed AND the fixed code: they check the instrument.
const TOP_HALF = tpl(48, 36, { lh: 18 }); // 3-col blocks laid out for 48×18 → all content in the top half of 48×36
const B1_TARGET = { w: 36, h: 48 };
/** B1 after confirming: a block (id or text) lost, or not moved proportionally. */
const b1Destroyed = (r) => r.idsMissing.length > 0 || r.textLost || r.geometry.overTolerance > 0;
const pickPortrait = async (page) => { await enableBaseSelect(page); await mousePickSize(page, '36×48'); return 'mouse: size picker → 36"×48" Portrait'; };
const typePortrait = async (page, key) => {
  const n = await focusSizeSelectByTab(page);
  await page.keyboard.type('3');
  await page.waitForTimeout(400);
  const selectWhileTyping = await page.evaluate(() => [...document.querySelectorAll('select')].find((el) => el.querySelector('option[value="custom"]'))?.value);
  await page.keyboard.press(key);
  return { how: `keyboard: Tab x${n} to the size select, type-ahead "3", ${key}`, selectWhileTyping, draftMoved: selectWhileTyping === '36×48' };
};
const SCENARIOS = [
  { id: 'ctl-dialog-detector', control: true, spec: tpl(48, 36), customPalettes: [{ name: 'ZQ Pal', bg: '#FFFFFF', primary: '#111111', accent: '#1a80bb', accent2: '#ea801c', muted: '#6c757d', headerBg: '#1a80bb', headerFg: '#fff' }],
    run: dialogDetectorScenario, control_: (r) => r.nativeDialogs === 1 && r.domDialogsWithPreviewOpen >= 1 },
  { id: 'ctl-modal-detector', control: true, spec: tpl(48, 36), versions: true, run: modalDetectorScenario,
    control_: (r) => r.dialog.appeared && r.dialog.clicked === 'Cancel' && r.docTransitions === 0 && !r.storeChanged },

  // A1 (+ A3 menu label)
  { id: 'a1-30x40', claimId: 'A1/A3', spec: tpl(30, 40), run: drawScenario(30, 40), claim: (r) => r.drawnUnits === '480x360' && !r.drawnMatchesDoc },
  { id: 'a1-48x24', claimId: 'A1/A3', spec: tpl(48, 24), run: drawScenario(48, 24), claim: (r) => r.drawnUnits === '480x360' && !r.drawnMatchesDoc },
  { id: 'ctl-a1-36x48', control: true, spec: tpl(36, 48), run: drawScenario(36, 48), control_: (r) => r.drawnMatchesDoc && r.selectValue === '36×48' },
  { id: 'ctl-a1-a0l', control: true, spec: tpl(46.8, 33.1), run: drawScenario(46.8, 33.1), control_: (r) => r.drawnMatchesDoc && r.selectValue === 'A0L' },

  // A2 (a template now asks first; the scenario confirms, then measures the layout)
  { id: 'a2-template-30x40', claimId: 'A2', spec: tpl(30, 40), run: layoutScenario(30, 40, 'template'), claim: (r) => r.matchesTemplateAt48x36 && !r.matchesTemplateAtOwnSize && r.afterStoreVsSheet.pastEdge > 0 },
  { id: 'a2-template-48x24', claimId: 'A2', spec: tpl(48, 24), run: layoutScenario(48, 24, 'template'), claim: (r) => r.matchesTemplateAt48x36 && !r.matchesTemplateAtOwnSize && r.afterStoreVsSheet.pastEdge > 0 },
  { id: 'ctl-a2-template-36x48', control: true, spec: tpl(36, 48), run: layoutScenario(36, 48, 'template'), control_: (r) => r.storeChanged && r.matchesTemplateAtOwnSize && r.afterStoreVsSheet.pastEdge === 0 },
  { id: 'a2-arrange-30x40', claimId: 'A2', spec: tpl(30, 40), run: layoutScenario(30, 40, 'arrange'), claim: (r) => r.afterStoreVsSheet.pastEdge > 0 && r.beforeVsSheet.pastEdge === 0 },
  { id: 'a2-arrange-48x24', claimId: 'A2', spec: tpl(48, 24), run: layoutScenario(48, 24, 'arrange'), claim: (r) => r.afterStoreVsSheet.pastEdge > 0 && r.beforeVsSheet.pastEdge === 0 },
  // Long text: packed height lands between 240 and 360 units, so a 48x24 sheet and a 48x36 sheet must differ.
  { id: 'a2-arrange-48x24-long', claimId: 'A2', spec: tpl(48, 24, { lh: 24, long: 7 }), run: layoutScenario(48, 24, 'arrange'), claim: (r) => r.afterStoreVsSheet.pastEdge > 0 },
  { id: 'ctl-a2-arrange-48x36-long', control: true, spec: tpl(48, 36, { lh: 24, long: 7 }), run: layoutScenario(48, 36, 'arrange'), control_: (r) => r.storeChanged && r.afterStoreVsSheet.pastEdge === 0 },
  { id: 'ctl-a2-arrange-36x48', control: true, spec: tpl(36, 48), run: layoutScenario(36, 48, 'arrange'), control_: (r) => r.storeChanged && r.afterStoreVsSheet.pastEdge === 0 },

  // A3 (a menu pick now asks first; the scenarios confirm when asked)
  { id: 'a3-mouse-same-30x40', claimId: 'A3', spec: tpl(30, 40), run: menuScenario('48×36'), claim: (r) => r.selectBefore?.value === '48×36' && r.docTransitions === 0 && r.sizeAfter === '30x40' },
  { id: 'a3-mouse-same-48x24', claimId: 'A3', spec: tpl(48, 24), run: menuScenario('48×36'), claim: (r) => r.selectBefore?.value === '48×36' && r.docTransitions === 0 && r.sizeAfter === '48x24' },
  { id: 'ctl-a3-mouse-other-30x40', control: true, spec: tpl(30, 40), run: menuScenario('36×48'), control_: (r) => r.docTransitions >= 1 && r.sizeAfter === '36x48' },
  { id: 'ctl-a3-mouse-same-36x48', control: true, spec: tpl(36, 48), run: menuScenario('36×48'), control_: (r) => r.docTransitions === 0 && r.sizeAfter === '36x48' && !r.dialog.appeared },
  { id: 'info-a3-selectOption-same-30x40', informational: true, spec: tpl(30, 40), run: selectOptionSameScenario },

  // A4
  { id: 'a4-30x40', claimId: 'A4', spec: { w: 30, h: 40, kind: 'probes', blocks: PROBES['30x40'] }, run: issuesScenario,
    claim: (r) => r.flags['zq-past-real']?.oob === false && r.flags['zq-in-real-past-drawn']?.oob === true },
  { id: 'a4-48x24', claimId: 'A4', spec: { w: 48, h: 24, kind: 'probes', blocks: PROBES['48x24'] }, run: issuesScenario,
    claim: (r) => r.flags['zq-past-real']?.oob === false },
  { id: 'ctl-a4-48x36', control: true, spec: { w: 48, h: 36, kind: 'probes', blocks: PROBES['48x36'] }, run: issuesScenario,
    control_: (r) => r.flags['zq-past-real']?.oob === true && r.flags['zq-inside']?.oob === false && r.oobIssueCount >= 1 },
  { id: 'ctl-a4-36x48', control: true, spec: { w: 36, h: 48, kind: 'probes', blocks: PROBES['36x48'] }, run: issuesScenario,
    control_: (r) => r.flags['zq-past-real']?.oob === true && r.flags['zq-in-real-past-drawn']?.oob === false && r.flags['zq-inside']?.oob === false },

  // A5
  { id: 'a5-print-30x40', claimId: 'A5', spec: tpl(30, 40), run: printScenario(['ZQSENT1', 'ZQSENT2', 'ZQSENT3', 'ZQSENT4']),
    claim: (r) => r.editorDrawnUnits === '480x360' && r.pdf.pageIn === '30x40' },
  { id: 'a5-print-48x24', claimId: 'A5', spec: { w: 48, h: 24, kind: 'probes', blocks: PROBES['48x24'] }, run: printScenario(['ZQPAST', 'ZQOK']),
    claim: (r) => r.editorDrawnUnits === '480x360' && r.pdf.pageIn === '48x24' && r.markers.ZQPAST.inEditorDom && !r.markers.ZQPAST.onPdfPage },
  { id: 'ctl-a5-print-36x48', control: true, spec: tpl(36, 48), run: printScenario(['ZQSENT1', 'ZQSENT4']),
    control_: (r) => r.editorDrawnUnits === '360x480' && r.pdf.pageIn === '36x48' && r.markers.ZQSENT1.onPdfPage && r.markers.ZQSENT4.onPdfPage },
  { id: 'a5-pptx-30x40', claimId: 'A5', paid: true, spec: tpl(30, 40), run: pptxScenario, claim: (r) => r.editorDrawnUnits === '480x360' && r.slide === '30x40' },
  { id: 'ctl-a5-pptx-36x48', control: true, paid: true, spec: tpl(36, 48), run: pptxScenario, control_: (r) => r.editorDrawnUnits === '360x480' && r.slide === '36x48' },

  // B1 — measured AFTER answering the dialog (the unfixed code shows none)
  { id: 'b1-preset-mouse', claimId: 'B1', spec: tpl(48, 36),
    run: replaceScenario(pickPortrait, { choice: 'confirm', target: B1_TARGET, kind: 'confirm-size' }), claim: b1Destroyed },
  { id: 'b1-preset-keyboard', claimId: 'B1', spec: tpl(48, 36),
    run: replaceScenario((page) => typePortrait(page, 'Enter'), { choice: 'confirm', target: B1_TARGET, kind: 'confirm-size' }), claim: b1Destroyed },
  { id: 'b1-preset-cancel', claimId: 'B1', spec: tpl(48, 36),
    run: replaceScenario(pickPortrait, { choice: 'cancel', target: B1_TARGET, kind: 'cancel' }), claim: (r) => r.anythingChanged },
  { id: 'b1-preset-keyboard-escape', claimId: 'B1', spec: tpl(48, 36),
    run: replaceScenario((page) => typePortrait(page, 'Escape'), { choice: 'cancel', target: B1_TARGET, kind: 'escape' }), claim: (r) => r.anythingChanged },
  { id: 'ctl-b1-noop', control: true, spec: tpl(48, 36), run: replaceScenario(async () => 'no action', { choice: 'cancel' }),
    control_: (r) => r.sentences === '4->4' && r.figures === '1->1' && !r.dialog.appeared && !r.anythingChanged },

  // C1
  { id: 'c1-template', claimId: 'C1', spec: tpl(48, 36),
    run: replaceScenario(async (page) => { await page.getByRole('button', { name: /2-Col Wide Figure/ }).click(); return 'click Templates › 2-Col Wide Figure'; }, { choice: 'confirm', kind: 'confirm-template' }),
    claim: (r) => !r.dialogBeforeChange || r.copyPromisesKept },
  { id: 'c1-template-cancel', claimId: 'C1', spec: tpl(48, 36),
    run: replaceScenario(async (page) => { await page.getByRole('button', { name: /2-Col Wide Figure/ }).click(); return 'click Templates › 2-Col Wide Figure'; }, { choice: 'cancel', kind: 'cancel' }),
    claim: (r) => r.anythingChanged || r.copyPromisesKept },

  // D1 — a keystroke must not change the poster's size; Enter commits, then the dialog asks
  { id: 'd1-keystrokes-height', claimId: 'D1', spec: TOP_HALF, run: keystrokeSizeScenario('Poster height in inches', '24'),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.canvasChangesWhileTyping.length > 0 },
  // Changed with the approved behaviour: this control used to expect fill("24") to apply at
  // once. A committed size now applies once, after Enter and the dialog. What it checks is the
  // instrument: one fill + commit gives exactly one size transition, to 48x24 — which both the
  // unfixed code (applies on input) and the fix (applies on confirm) must show.
  { id: 'ctl-d1-fill-height', control: true, spec: TOP_HALF, run: keystrokeSizeScenario('Poster height in inches', '24', { fill: true }),
    control_: (r) => r.appliedSizes.join(',') === '48x24' && r.sizeAfter === '48x24' },
  { id: 'd1-keystrokes-dom-42x42', claimId: 'D1', spec: tpl(42, 42), run: keystrokeSizeScenario('Poster height in inches', '36'),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.canvasChangesWhileTyping.length > 0 },
  { id: 'd1-typed-cancel', claimId: 'D1', spec: tpl(48, 36), run: keystrokeSizeScenario('Poster width in inches', '30', { choice: 'cancel', kind: 'cancel' }),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.sizeAfter !== r.sizeBefore || r.storeChanged },
  { id: 'd1-escape-width', claimId: 'D1', spec: tpl(48, 36), run: keystrokeSizeScenario('Poster width in inches', '30', { commit: 'escape', choice: 'cancel', kind: 'escape' }),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.sizeAfter !== r.sizeBefore || r.storeChanged || r.fieldAfter !== '48' },

  // D2 — nothing outside 10–100 in is ever committed
  { id: 'd2-below-min-5', claimId: 'D2', spec: tpl(48, 36), run: outOfRangeScenario('5', { commit: 'click-away' }),
    claim: (r) => r.appliedOutOfRange.length > 0 || r.savedOutOfRange.length > 0 || r.endOutOfRange },
  { id: 'd2-above-max-150', claimId: 'D2', spec: tpl(48, 36), run: outOfRangeScenario('150', { commit: 'enter' }),
    claim: (r) => r.appliedOutOfRange.length > 0 || r.savedOutOfRange.length > 0 || r.endOutOfRange },
  // No echo check here: the unfixed field is bound to the poster's size and drops a "0" at the keystroke.
  { id: 'ctl-d2-zero', control: true, spec: tpl(48, 36), run: outOfRangeScenario('0', { commit: 'click-away', requireEcho: false }), control_: (r) => r.sizeAfter === '48x36' && r.appliedSizes.length === 0 },

  // D3 — typing a normal size keeps the credit mark (while typing, after, after a later edit, on reopen)
  { id: 'd3-keystrokes', claimId: 'D3', spec: TOP_HALF, run: ackScenario({ fill: false }),
    claim: (r) => r.ackLostWhileTyping || r.ackAfter.dom === false || r.ackAfterLaterEdit.dom === false || r.reopened.ackDom === false },
  { id: 'ctl-d3-fill', control: true, spec: TOP_HALF, run: ackScenario({ fill: true }),
    control_: (r) => r.ackBefore.dom === true && r.ackAfter.dom === true },

  // D4 — a confirmed typed size moves the blocks with the sheet
  { id: 'd4-shrink-width', claimId: 'D4', spec: tpl(48, 36), run: shrinkScenario('Poster width in inches', '30', 300, 360),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.geometry.missing.length > 0 || r.geometry.overTolerance > 0 || r.pastNewEdgeStore.pastEdge > 0 },
  { id: 'd4-shrink-height', claimId: 'D4', spec: tpl(48, 36), run: shrinkScenario('Poster height in inches', '24', 480, 240),
    claim: (r) => r.sizeChangesWhileTyping.length > 0 || r.geometry.missing.length > 0 || r.geometry.overTolerance > 0 || r.pastNewEdgeStore.pastEdge > 0 },
];

// ---------------------------------------------------------------- runner
async function runScenario(browser, sc, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const state = {
    userId: randomUUID(), row: null, saves: [], aborted: [], errors: [], nativeDialogs: [], phase: 'load',
    spec: sc.spec, paid: !!sc.paid, customPalettes: sc.customPalettes, versions: null,
  };
  const r = { id: sc.id, run, claimId: sc.claimId ?? null, control: !!sc.control, informational: !!sc.informational };
  try {
    await installMocks(context, state);
    const page = await openEditor(context, state);
    if (sc.versions) {
      state.versions = [{ id: randomUUID(), poster_id: state.row.id, user_id: state.userId, name: 'ZQ Version', created_at: new Date(Date.now() - 3600e3).toISOString() }];
    }
    const p0 = await probe(page);
    r.instrument = { storeIsAppInstance: p0.store.posterId === state.row.id, loadedSize: `${p0.store.widthIn}x${p0.store.heightIn}` };
    r.result = await sc.run({ context, page, state, run, id: sc.id });
    if (!page.isClosed()) await page.close();
  } catch (e) {
    r.harnessError = String(e && e.stack ? e.stack : e).slice(0, 900);
  }
  r.pageErrors = state.errors;
  r.abortedHosts = [...new Set(state.aborted.map((u) => { try { return new URL(u).host; } catch { return u; } }))];
  await context.close();
  if (r.harnessError) r.verdict = 'HARNESS-ERROR';
  else if (!r.instrument.storeIsAppInstance) r.verdict = 'INSTRUMENT-FAIL';
  else if (sc.control) r.verdict = sc.control_(r.result) ? 'CONTROL-OK' : 'CONTROL-FAIL';
  else if (sc.informational) r.verdict = 'INFO';
  else r.verdict = sc.claim(r.result) ? 'CLAIM-OBSERVED' : 'CLAIM-NOT-OBSERVED';
  return r;
}

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
    root: WEB, configFile: path.join(WEB, 'vite.config.ts'), cacheDir: path.join(OUT, '.vite-cache'),
    server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'warn',
  });
  await server.listen();
  log(`[harness] vite on ${BASE} (repo ${REPO})`);
  browser = await chromium.launch();
  const git = await import('node:child_process').then((cp) => {
    try { return cp.execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(); } catch { return 'n/a'; }
  });
  { // warm-up so Vite's dep optimisation does not land inside a scenario
    const ctx = await browser.newContext();
    const st = { userId: randomUUID(), row: null, saves: [], aborted: [], errors: [], nativeDialogs: [], phase: 'warmup', spec: tpl(48, 36) };
    try { await installMocks(ctx, st); const p = await openEditor(ctx, st); await p.close(); } catch (e) { log('[harness] warm-up:', String(e).slice(0, 200)); }
    await ctx.close();
  }
  const list = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));
  if (ONLY && list.length !== ONLY.length) throw new Error(`--only names unknown scenario(s): ${ONLY.filter((id) => !SCENARIOS.some((s) => s.id === id)).join(', ')}`);
  const results = [];
  for (let run = 1; run <= RUNS; run += 1) {
    for (const sc of list) {
      const t0 = Date.now();
      const r = await runScenario(browser, sc, run);
      r.ms = Date.now() - t0;
      results.push(r);
      log(`[run${run}] [${r.verdict}] ${sc.id} ${r.harnessError ? r.harnessError.split('\n')[0] : JSON.stringify(r.result).slice(0, 600)}`);
    }
  }
  const tally = {};
  for (const r of results) {
    const t = (tally[r.id] ??= { claimId: r.claimId, control: r.control, informational: r.informational, runs: 0, verdicts: {} });
    t.runs += 1;
    t.verdicts[r.verdict] = (t.verdicts[r.verdict] ?? 0) + 1;
  }
  const bad = results.filter((r) => ['HARNESS-ERROR', 'INSTRUMENT-FAIL', 'CONTROL-FAIL'].includes(r.verdict));
  const observed = results.filter((r) => r.verdict === 'CLAIM-OBSERVED');
  exitCode = bad.length ? 2 : observed.length ? 1 : 0;
  // Per claim id: which scenarios observed it, in how many runs.
  const claims = {};
  for (const r of results.filter((x) => x.claimId)) {
    const c = (claims[r.claimId] ??= { observedRuns: 0, runs: 0, scenarios: {} });
    c.runs += 1;
    const s = (c.scenarios[r.id] ??= { observed: 0, runs: 0 });
    s.runs += 1;
    if (r.verdict === 'CLAIM-OBSERVED') { c.observedRuns += 1; s.observed += 1; }
  }
  // Cross-scenario check: Auto-Arrange on the SAME blocks at 48x24 and at 48x36 — identical
  // geometry means the real sheet height played no part in the layout.
  const crossChecks = [];
  for (let run = 1; run <= RUNS; run += 1) {
    const a = results.find((r) => r.run === run && r.id === 'a2-arrange-48x24-long')?.result;
    const b = results.find((r) => r.run === run && r.id === 'ctl-a2-arrange-48x36-long')?.result;
    if (a && b) crossChecks.push({ run, check: 'arrange 48x24 vs 48x36 same blocks', identicalGeometry: a.afterSig === b.afterSig });
  }
  const summary = {
    ranAt: new Date().toISOString(), repo: REPO, git, base: BASE, runs: RUNS, exitCode, tally, claims, crossChecks,
    observedClaims: Object.entries(claims).filter(([, c]) => c.observedRuns > 0).map(([id, c]) => ({
      claimId: id, observedRuns: c.observedRuns, runs: c.runs,
      scenarios: Object.entries(c.scenarios).filter(([, s]) => s.observed > 0).map(([sid, s]) => `${sid} ${s.observed}/${s.runs}`),
    })),
    failures: bad.map((r) => ({ id: r.id, run: r.run, verdict: r.verdict, error: r.harnessError?.split('\n')[0] ?? null })),
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  log(JSON.stringify(tally, null, 1));
  log(JSON.stringify(crossChecks));
  for (const f of summary.failures) log(`[harness] ${f.verdict} ${f.id} run${f.run}${f.error ? `: ${f.error}` : ''}`);
  for (const c of summary.observedClaims) log(`[harness] CLAIM OBSERVED ${c.claimId} (${c.observedRuns}/${c.runs} runs): ${c.scenarios.join(', ')}`);
  log(`[harness] exit=${exitCode} wrote ${path.join(OUT, 'results.json')}`);
} catch (e) {
  log('[harness] fatal:', e && e.stack ? e.stack : e);
  exitCode = 2;
} finally {
  await cleanup();
}
process.exit(exitCode);
