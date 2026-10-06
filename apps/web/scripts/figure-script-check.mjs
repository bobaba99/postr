#!/usr/bin/env node
/**
 * figure-script-check.mjs — does the plot checker keep what a researcher put
 * into it? (plan item 7, "Leaving the Figure tab loses the pasted script;
 * must survive reload"; evidence FR9 in docs/stress-test/FIGURE-READABILITY.md
 * and TRIAGE.md.)
 *
 * ENTRY POINT: the user's. A first visitor opens the editor at /p/new on a
 * fresh browser (a silent anonymous session, lib/guestBackend.mjs's fake
 * Supabase with the posters table's row-level security), clicks the rail's
 * FIGURE tab, "Check a figure", resizes the gray figure preview on the canvas
 * by its corner, picks "Python", puts a plotting script in the code box and
 * presses "▶ Check". Then ONE thing a user does next, and the code box, the
 * language, the results table, "Copy edited code" and the size are read
 * again from the DOM. The public page /tools/figure-readability is entered at
 * its URL. Nothing in the app is called directly; only the network is faked.
 *
 * VERSIONS: 1 — the reproduction on main b0125c3 (record 07 section 4).
 * 2 — for the fix (record 07 section 8): the owner's decisions of
 * 2026-10-06 turned I1 into claim L6 (a copy opened in the mounted editor
 * starts with its own empty checker), S1–S3 into counted claims and added
 * S5, S6 and S7 (the siblings are in scope; S3 now types a header only, so
 * the click does not use it), and added K3 (Check stays up once a
 * script is in), L7 (the dashboard round trip) and P1 (a new tab of the page
 * starts empty); the claims audit's copy changes renamed "Copy corrected
 * code" and the manual-entry placeholder, which the readings follow.
 * 3 — review round 2 (record 07 section 9): the reviewer's probes e8 and e9
 * folded in as K4 (a check against an image block, then a deselect, a
 * reload and the image selected again), K5 (a kept table under a size
 * pill of another size: after a resize of the preview, and after the
 * reload of L3) and L8 (a long script edited after its Check, then a
 * reload); the readings gained the visible table rows, the scale line and
 * the note that says which size a kept result is for.
 *
 * Each reading also tags the code box's DOM node before the action, so a
 * reading after it says whether the panel was REMOUNTED (a new node) or kept
 * (the same node): the mechanism, not only the symptom.
 *
 * CLAIMS (counted; a claim is OBSERVED when the defect is present)
 *   L1  a rail tab round trip (FIGURE → <tab> → FIGURE) empties the code box;
 *       swept over every other tab on the rail
 *   L2  selecting a block on the canvas sends the sidebar to another tab and
 *       empties the code box; swept over every block type on the default
 *       poster (the auto-route, Sidebar.tsx's selection effect)
 *   L3  a reload of the editor empties the code box
 *   L4  opening another of the visitor's posters and coming back empties it
 *   L5  a reload of /tools/figure-readability empties it
 *   L6  Duplicate → "Open copy" (an in-app navigation to ANOTHER poster that
 *       keeps the editor mounted): the copy's checker shows the original's
 *       script, or the original's script is stored under the copy's id, or
 *       Back to the original has lost it (owner decision 2026-10-06: the
 *       copy starts with its own empty checker)
 *   L7  "Back to My Posters" (a full page load), then the poster's card on
 *       the dashboard: the code box is empty
 *   L8  a long script (about 26,000 characters, 500 lines: each copy fits
 *       the store, the script and the version last checked together do
 *       not fit 50,000), Check, ONE typed character, a reload: the code box
 *       comes back empty or without the edit
 *   K1  switching "Make a figure" → "Check a figure" empties it (predicted
 *       NOT observed: FigureTab keeps both modes mounted; a guard for the fix)
 *   K2  hiding and showing the sidebar (its button, and ⌘/) empties it
 *       (predicted NOT observed: the sidebar collapses to width 0, it is not
 *       unmounted; a guard for the fix)
 *   K3  Check that came up because an image block is selected (no click on
 *       "Check a figure"), a script put in, then a click on empty canvas:
 *       the Figure tab goes back to Make and the script is hidden (owner
 *       decision 2026-10-06: it stays on Check once a script is in)
 *   K4  a Check against the selected image block, then (a) a click on empty
 *       canvas (and "Check a figure" when Make came up), (b) a reload: the
 *       table shows, under the gray figure preview's size pill, with no
 *       note saying it is for the image (it was scored at the image's size,
 *       and the line under it says "default block size"); (c) the image
 *       selected again: its table does not come back
 *   K5  a kept table shows under a size pill of another size with no note
 *       saying which size it is for: (a) after the preview is resized
 *       following a Check (the editor keeps the result through the drag),
 *       (b) after the reload of L3 (the preview is back at 10 x 7)
 *   S1  Authors › "Paste author list": typed text is gone after a click on a
 *       text block and back to Authors
 *   S2  References › "Paste from Manuscript" and Manual Entry: the same
 *   S3  Figure › "Make a figure": a table header typed into "Paste your
 *       table" (one line, so the click does not use it): the same
 *   S7  Figure › "Make a figure": a header and two rows typed; the click on
 *       the text block blurs the box, which uses the table (step 1 answered,
 *       DataStep's onBlur); back on Figure, step 1 is no longer answered
 *   S5  Layout › the poster-name draft (saved only on Enter or Save): the same
 *   S6  Versions › the version name: the same
 *   P1  a NEW tab of /tools/figure-readability shows a script checked in
 *       another tab (predicted NOT observed: sessionStorage is per tab; the
 *       guard for the owner's shared-computer decision)
 *   For each L and K claim, also read: the language choice, the results
 *   table's rows, "Copy edited code" (the edited script), the size the check
 *   uses (the editor's figure preview pill, the page's typed width and
 *   height), and which localStorage or sessionStorage keys hold the script.
 *
 * INFORMATION (printed, not counted in the exit code)
 *   S4  Figure › Check with an image block: "Scan image" results (the image
 *       text scan; its API faked at the network), then (a) selecting another
 *       image block, (b) a click on a text block and back to the image (not
 *       in item 7's scope: record 07 section 10)
 *   Q1  the engine's localStorage capacity for one value of plain ASCII
 *       text, in characters, beside the most the kept scripts can take
 *       (10 posters x 2 copies x 50,000 characters): the headroom left for
 *       the sign-in session
 *
 * CONTROLS (a failed control is an instrument error, exit 2)
 *   C1  editor, no action: 1.5 s after Check the code box is the same node
 *       and still holds the script, the language and the table: the readings
 *       can see a kept panel, and nothing resets it on its own
 *   C2  page, no action: the same on /tools/figure-readability
 *   C3  after a reload or a trip to another poster, the editor is back on the
 *       SAME poster (its URL id), so an empty box is not a different poster's
 *   C4  every scenario's setup reached a results table with the script in
 *       the box before its action
 *
 * BLIND SPOTS
 *   - The script is put in the box with Playwright's fill() (an input event),
 *     not a clipboard paste; the defect is about keeping it, not pasting.
 *   - L4 opens the other poster by its URL (a typed address or a bookmark);
 *     L7 drives the dashboard's own route.
 *   - Chromium by default (POSTR_BROWSER picks another engine).
 *   - The phone share layout and the read-only viewer are not driven.
 *   - Storage is searched in localStorage and sessionStorage only, not
 *     IndexedDB or the Cache API.
 *   - A selection made from the Issues tab's "jump to block" is not driven
 *     (it starts outside the Figure tab).
 *   - Chart and logo blocks are not on the default poster (the logo row of
 *     L2 prints n/a); the chart's exemption from the auto-route is read
 *     from the code (INSPECTED), not driven.
 *
 * RUN (from apps/web; the tree's apps/web/.env must point at the fake
 * backend, https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/figure-script-check.mjs [--only id,id]
 *   ids: control-idle tabs select mode sidebar implicit-check image-check
 *        resize reload other-poster dashboard duplicate long-script
 *        page-control page-reload page-newtab sib-authors sib-refs sib-make
 *        sib-ladder sib-name sib-version sib-scan quota
 *   env PORT (default 5750), OUT_DIR, POSTR_REPO, POSTR_BROWSER, POSTR_MUTANT
 *
 * EXIT 0 no counted claim observed · 1 a counted claim observed (and every
 *      control held) · 2 a control failed, a scenario errored, or the harness
 *      did not start
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json
 * (the build stamp); the run puts its bytes back when it ends. After a killed
 * run: git checkout -- apps/web/public/version.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
let restoreStamp = () => {};
/** The instrument failed: never let that read as "claim observed" (exit 1). */
const fail = (e) => {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  try { restoreStamp(); } catch { /* the error above is the one to report */ }
  process.exit(2);
};
process.exitCode = 2;
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const HERE = path.dirname(fileURLToPath(import.meta.url));
let startHarness, WEB, newState, newGuestPage, openNewPoster, makeRow;
try {
  ({ startHarness, WEB } = await import('./lib/editorHarness.mjs'));
  ({ newState, newGuestPage, openNewPoster, makeRow } = await import('./lib/guestBackend.mjs'));
} catch (e) {
  fail(e);
}

const PORT = Number(process.env.PORT ?? 5750);
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1]).split(',').filter(Boolean)
  : null;

const MARKER = 'ZQ7MARK';
const SCRIPT = `# ${MARKER} response figure\n${fs.readFileSync(path.join(HERE, 'fixtures/checker-corpus/ctl-fontsize.py'), 'utf8')}`;
const VIEWPORT = { width: 1440, height: 900 };
const CODE_LABEL = 'Your R or Python plotting code';
const RAIL_TABS = ['layout', 'style', 'authors', 'insert', 'edit block', 'references', 'issues', 'versions', 'export'];
const BLOCK_TYPES = ['image', 'title', 'authors', 'heading', 'text', 'table', 'references', 'logo'];

// ---------------------------------------------------------------- readings
/** What the sidebar and the checker show, read from the DOM. */
function readPanel(page) {
  return page.evaluate(({ marker, label }) => {
    const rail = [...document.querySelectorAll('button[data-postr-tab]')];
    const active = rail.find((b) => getComputedStyle(b).borderLeftColor === 'rgb(124, 106, 237)');
    const pressed = (names) => names.find((n) => [...document.querySelectorAll('button[aria-pressed="true"]')]
      .some((b) => b.textContent.trim() === n)) ?? null;
    const ta = document.querySelector(`textarea[aria-label="${label}"]`);
    const leaf = (re) => [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && re.test(d.textContent.trim()));
    const table = [...document.querySelectorAll('table')].find((t) => /Element/.test(t.querySelector('thead')?.textContent ?? ''));
    const scanTable = [...document.querySelectorAll('table')].find((t) => /Effective pt/.test(t.querySelector('thead')?.textContent ?? ''));
    const pill = document.querySelector('.postr-dimension-pill')?.textContent.trim() ?? null;
    const hits = [];
    for (const [name, s] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i);
        if ((s.getItem(k) ?? '').includes(marker)) hits.push(`${name}:${k}`);
      }
    }
    const shown = (el) => !!el && el.offsetParent !== null;
    const field = (lbl) => document.querySelector(`input[aria-label="${lbl}"]`)?.value
      ?? [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === lbl)?.control?.value ?? null;
    return {
      path: location.pathname,
      tab: active ? active.textContent.replace(/\d+$/, '').trim().toLowerCase() : null,
      mode: pressed(['Make a figure', 'Check a figure']),
      present: !!ta,
      sameNode: ta?.dataset.zqNode === '1',
      codeLen: ta?.value.length ?? 0,
      hasMarker: !!ta && ta.value.includes(marker),
      detected: leaf(/^(Detected: .*|Auto-detect waiting for code…)$/)?.textContent.trim() ?? null,
      lang: pressed(['Auto', 'R', 'Python']),
      rows: table ? table.querySelectorAll('tbody tr').length : 0,
      visibleRows: shown(table) ? table.querySelectorAll('tbody tr').length : 0,
      scale: leaf(/^Scale factor:/)?.textContent.trim() ?? null,
      resultNote: [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && /^(This|The last) result is for /.test(d.textContent.trim()) && shown(d))?.textContent.trim() ?? null,
      hasCopy: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Copy edited code'),
      boxVisible: !!ta && ta.offsetParent !== null,
      pill,
      scanRows: scanTable ? scanTable.querySelectorAll('tbody tr').length : 0,
      width: field('Width'),
      height: field('Height'),
      storage: hits,
      sidebarHidden: !!document.querySelector('button[aria-label="Show sidebar"]'),
    };
  }, { marker: MARKER, label: CODE_LABEL });
}
const tagCodeBox = (page) => page.evaluate((label) => {
  const ta = document.querySelector(`textarea[aria-label="${label}"]`);
  if (ta) ta.dataset.zqNode = '1';
  return !!ta;
}, CODE_LABEL);
/** The script, its language and its table are all there. */
const intact = (r) => r.present && r.hasMarker && r.lang === 'Python' && r.rows > 0;
/** One line for a reading. */
const fmt = (r) => `tab=${r.tab} mode=${r.mode ?? '-'} box=${r.present ? (r.sameNode ? 'same' : 'NEW') : 'none'} code=${r.codeLen}${r.hasMarker ? '+' : ''} lang=${r.lang} rows=${r.rows} shown=${r.visibleRows} copy=${r.hasCopy ? 'y' : 'n'} size=${r.pill ?? `${r.width}x${r.height}`} scan=${r.scanRows} stored=${r.storage.length}${r.resultNote ? ` note="${r.resultNote.slice(0, 60)}…"` : ''}${r.sidebarHidden ? ' SIDEBAR-HIDDEN' : ''}`;
/** A table on screen under a size pill other than the size it was checked at, saying nothing about it. */
const silentlyElsewhere = (r, checkedPill) => r.visibleRows > 0 && r.pill !== checkedPill && !r.resultNote;

// ---------------------------------------------------------------- user actions
const railTab = (page, name) => page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${name}\\d*$`, 'i') }).first();
async function openTab(page, name) {
  await railTab(page, name).click();
  await page.waitForTimeout(350);
}
/** FIGURE › Check a figure, with the code box on screen. */
async function openChecker(page) {
  await openTab(page, 'figure');
  const check = page.getByRole('button', { name: 'Check a figure' });
  if ((await check.getAttribute('aria-pressed')) !== 'true') await check.click();
  await page.getByLabel(CODE_LABEL).waitFor({ timeout: 10000 });
}
/** Python, the script, ▶ Check; returns once the table shows. */
async function fillAndCheck(page) {
  await page.getByRole('button', { name: 'Python', exact: true }).click();
  await page.getByLabel(CODE_LABEL).fill(SCRIPT);
  await page.getByRole('button', { name: '▶ Check' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('table')].some((t) => /Element/.test(t.querySelector('thead')?.textContent ?? '')),
    null, { timeout: 5000 },
  );
}
/** Drag the gray figure preview's corner handle by (dx, dy) screen px. */
async function resizePreview(page, dx, dy) {
  const box = await page.locator('[data-postr-figure-size-overlay]').boundingBox();
  if (!box) throw new Error('no figure preview on the canvas');
  const x = box.x + box.width - 5;
  const y = box.y + box.height - 5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
/** A click on empty canvas outside the sheet: deselects. */
async function clickEmptyCanvas(page) {
  const p = await page.evaluate(() => {
    const o = document.querySelector('[data-postr-canvas-outer]').getBoundingClientRect();
    const s = document.getElementById('poster-canvas').getBoundingClientRect();
    return { x: Math.max(o.left + 8, Math.min(s.left - 16, o.left + 30)), y: (s.top + s.bottom) / 2 };
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}
/**
 * A click on the `nth` block of `type`, at a point where the block itself is
 * the topmost element (the figure preview can cover part of a block), until
 * the block is selected (data-postr-selected): some points inside a block do
 * not select it (a table's frame above its cells, in every engine tried).
 * Returns the block id, or null when the poster has no such block; throws
 * when no point selects it, so a missed click never reads as "kept".
 */
async function clickBlock(page, type, nth = 0) {
  const target = await page.evaluate(({ type, nth }) => {
    const els = [...document.querySelectorAll(`#poster-canvas [data-block-type="${type}"]`)];
    const el = els[nth];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const points = [];
    for (let fy = 0.2; fy <= 0.8; fy += 0.1) {
      for (let fx = 0.15; fx <= 0.85; fx += 0.1) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit)) points.push({ x, y });
      }
    }
    return { points, id: el.getAttribute('data-block-id') };
  }, { type, nth });
  if (!target) return null;
  const isSelected = () => page.evaluate((id) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`)?.getAttribute('data-postr-selected') === 'true', target.id);
  for (const p of target.points.slice(0, 6)) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    if (await isSelected()) return target.id;
  }
  throw new Error(`no click selected the ${type} block (${target.points.length} candidate points)`);
}
async function waitForSheet(page) {
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------- scenarios
/** A first visitor at /p/new, the checker opened, the preview resized, a script checked. */
async function visitorWithCheckedScript(h, { resize = true } = {}) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const posterId = await openNewPoster(page, h.base);
  await openChecker(page);
  const pillBefore = await page.locator('.postr-dimension-pill').textContent();
  if (resize) await resizePreview(page, -60, -40);
  await fillAndCheck(page);
  await tagCodeBox(page);
  const before = await readPanel(page);
  return { state, context, page, posterId, before, pillBefore: pillBefore?.trim() };
}

const results = [];
const record = (r) => {
  results.push(r);
  log(`${r.kind.padEnd(7)} ${r.id.padEnd(28)} ${r.observed === null ? 'n/a     ' : r.observed ? 'OBSERVED' : 'not obs.'}  ${r.note ?? ''}`);
  if (r.before) log(`         before: ${fmt(r.before)}`);
  if (r.mid) log(`         mid:    ${fmt(r.mid)}`);
  if (r.after) log(`         after:  ${fmt(r.after)}`);
};
const setupOk = (r, id) => {
  if (!intact(r)) throw new Error(`C4 setup of ${id} did not reach a checked script: ${fmt(r)}`);
};

const SCENARIOS = {
  async 'control-idle'(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'control-idle');
      await v.page.waitForTimeout(1500);
      const after = await readPanel(v.page);
      const ok = intact(after) && after.sameNode && after.hasCopy === v.before.hasCopy && after.pill === v.before.pill;
      record({ kind: 'CONTROL', id: 'C1 control-idle', claim: 'C1', observed: null, ok, before: v.before, after, note: `${ok ? 'held' : 'FAILED'}; preview pill ${v.pillBefore} → ${v.before.pill}` });
      if (!ok) throw new Error('C1 failed: the panel changed with no action');
    } finally { await v.context.close(); }
  },

  async tabs(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'tabs');
      for (const t of RAIL_TABS) {
        // Reset to a checked script before each round trip, so each is independent.
        const cur = await readPanel(v.page);
        if (!intact(cur)) await fillAndCheck(v.page);
        await tagCodeBox(v.page);
        const before = await readPanel(v.page);
        await openTab(v.page, t);
        const mid = await readPanel(v.page);
        await openChecker(v.page);
        const after = await readPanel(v.page);
        record({ kind: 'CLAIM', id: `L1 tab ${t}`, claim: 'L1', observed: !after.hasMarker, before, mid, after });
      }
    } finally { await v.context.close(); }
  },

  async select(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'select');
      for (const type of BLOCK_TYPES) {
        await clickEmptyCanvas(v.page);
        const cur = await readPanel(v.page);
        if (cur.tab !== 'figure') await openChecker(v.page);
        if (!intact(await readPanel(v.page))) await fillAndCheck(v.page);
        await tagCodeBox(v.page);
        const before = await readPanel(v.page);
        const id = await clickBlock(v.page, type);
        if (id === null) {
          record({ kind: 'CLAIM', id: `L2 select ${type}`, claim: 'L2', observed: null, note: 'no such block on the poster' });
          continue;
        }
        const mid = await readPanel(v.page);
        if (mid.tab !== 'figure') await openChecker(v.page);
        const after = await readPanel(v.page);
        record({ kind: 'CLAIM', id: `L2 select ${type}`, claim: 'L2', observed: !after.hasMarker, before, mid, after, note: `routed to ${mid.tab}` });
      }
    } finally { await v.context.close(); }
  },

  async mode(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'mode');
      await v.page.getByRole('button', { name: 'Make a figure' }).click();
      await v.page.waitForTimeout(300);
      const mid = await readPanel(v.page);
      await v.page.getByRole('button', { name: 'Check a figure' }).click();
      await v.page.waitForTimeout(300);
      const after = await readPanel(v.page);
      record({ kind: 'CLAIM', id: 'K1 make-then-check', claim: 'K1', observed: !intact(after), before: v.before, mid, after });
    } finally { await v.context.close(); }
  },

  async sidebar(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'sidebar');
      await v.page.getByRole('button', { name: 'Hide sidebar' }).click();
      await v.page.waitForTimeout(500);
      const mid = await readPanel(v.page);
      await v.page.getByRole('button', { name: 'Show sidebar' }).click();
      await v.page.waitForTimeout(500);
      const after = await readPanel(v.page);
      if (!mid.sidebarHidden) throw new Error('K2: the Hide sidebar button did not hide it');
      record({ kind: 'CLAIM', id: 'K2 hide-show button', claim: 'K2', observed: !intact(after), before: v.before, mid, after });
      // The keyboard shortcut, from the Check button (focus is on it after the click).
      await v.page.getByRole('button', { name: '▶ Check' }).focus();
      await v.page.keyboard.press('ControlOrMeta+/');
      await v.page.waitForTimeout(500);
      const mid2 = await readPanel(v.page);
      await v.page.keyboard.press('ControlOrMeta+/');
      await v.page.waitForTimeout(500);
      const after2 = await readPanel(v.page);
      if (!mid2.sidebarHidden) throw new Error('K2: ⌘/ did not hide the sidebar');
      record({ kind: 'CLAIM', id: 'K2 hide-show ⌘/', claim: 'K2', observed: !intact(after2), before: after, mid: mid2, after: after2 });
    } finally { await v.context.close(); }
  },

  async reload(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'reload');
      const storedBefore = v.before.storage.length;
      await v.page.reload();
      await waitForSheet(v.page);
      const landed = await readPanel(v.page);
      await openChecker(v.page);
      const after = await readPanel(v.page);
      const same = after.path === `/p/${v.posterId}`;
      if (!same) throw new Error(`C3 failed: reload landed on ${after.path}, not /p/${v.posterId}`);
      record({ kind: 'CLAIM', id: 'L3 editor reload', claim: 'L3', observed: !after.hasMarker, before: v.before, mid: landed, after, note: `C3 same poster; script in storage before reload: ${storedBefore} key(s); preview ${v.before.pill} → ${after.pill}` });
      record({ kind: 'CLAIM', id: 'K5 reload, preview reset', claim: 'K5', observed: silentlyElsewhere(after, v.before.pill), note: `checked at ${v.before.pill}; after the reload: pill ${after.pill}, table rows shown ${after.visibleRows}, ${after.scale ?? 'no scale line'}; note: ${after.resultNote ?? 'none'}` });
    } finally { await v.context.close(); }
  },

  async 'other-poster'(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'other-poster');
      const uid = v.state.rows.find((r) => r.id === v.posterId)?.user_id;
      if (!uid) throw new Error('the visitor\'s poster row is not in the fake backend');
      const other = makeRow(uid, structuredClone(v.state.rows.find((r) => r.id === v.posterId).data), { title: 'ZQ Second Poster' });
      v.state.rows.push(other);
      await v.page.goto(`${h.base}/p/${other.id}`);
      await waitForSheet(v.page);
      const mid = await readPanel(v.page);
      if (mid.path !== `/p/${other.id}`) throw new Error(`the other poster did not open: ${mid.path}`);
      await v.page.goto(`${h.base}/p/${v.posterId}`);
      await waitForSheet(v.page);
      await openChecker(v.page);
      const after = await readPanel(v.page);
      if (after.path !== `/p/${v.posterId}`) throw new Error(`C3 failed: came back to ${after.path}`);
      record({ kind: 'CLAIM', id: 'L4 other poster and back', claim: 'L4', observed: !after.hasMarker, before: v.before, mid, after, note: 'C3 same poster' });
    } finally { await v.context.close(); }
  },

  async duplicate(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'duplicate');
      await v.page.locator('button[title="Duplicate this poster"]').click();
      await v.page.getByRole('button', { name: 'Open copy' }).click({ timeout: 10000 });
      await v.page.waitForURL((u) => !u.pathname.endsWith(v.posterId), { timeout: 10000 });
      await v.page.waitForTimeout(1200);
      const mid = await readPanel(v.page);
      const copyId = mid.path.slice(3);
      if (!copyId || copyId === v.posterId) throw new Error(`the copy did not open: ${mid.path}`);
      await v.page.goBack();
      await v.page.waitForURL((u) => u.pathname.endsWith(v.posterId), { timeout: 10000 });
      await v.page.waitForTimeout(1200);
      const after = await readPanel(v.page);
      const underCopy = [...mid.storage, ...after.storage].some((k) => k.includes(copyId));
      const observed = mid.hasMarker || underCopy || !after.hasMarker;
      record({ kind: 'CLAIM', id: 'L6 duplicate, open copy, back', claim: 'L6', observed, before: v.before, mid, after, note: `on the copy (${copyId.slice(0, 8)}…) the box shows the original's script: ${mid.hasMarker}; stored under the copy's id: ${underCopy}; back on the original: ${after.hasMarker}` });
    } finally { await v.context.close(); }
  },

  async dashboard(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'dashboard');
      await v.page.getByTitle('Back to My Posters').click();
      await v.page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 20000 });
      const card = v.page.locator(`a[href="/p/${v.posterId}"]`).first();
      await card.waitFor({ timeout: 30000 });
      await card.click();
      await v.page.waitForURL((u) => u.pathname === `/p/${v.posterId}`, { timeout: 20000 });
      await waitForSheet(v.page);
      await openChecker(v.page);
      const after = await readPanel(v.page);
      record({ kind: 'CLAIM', id: 'L7 my posters, card, back', claim: 'L7', observed: !after.hasMarker, before: v.before, after, note: 'C3 same poster (its card); "Back to My Posters" is a full page load' });
    } finally { await v.context.close(); }
  },

  async 'implicit-check'(h) {
    const state = newState();
    const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
      await openNewPoster(page, h.base);
      await openTab(page, 'figure');
      const id = await clickBlock(page, 'image', 0);
      if (!id) throw new Error('no image block on the default poster');
      const shown = await readPanel(page);
      if (shown.mode !== 'Check a figure') throw new Error(`selecting the image did not bring up Check: ${fmt(shown)}`);
      await page.getByLabel(CODE_LABEL).fill(SCRIPT);
      await tagCodeBox(page);
      const before = await readPanel(page);
      await clickEmptyCanvas(page);
      const after = await readPanel(page);
      const observed = after.mode !== 'Check a figure' || !after.boxVisible || !after.hasMarker;
      record({ kind: 'CLAIM', id: 'K3 implicit check, deselect', claim: 'K3', observed, before, after, note: `after the deselect: mode ${after.mode}, code box visible ${after.boxVisible}` });
    } finally { await context.close(); }
  },

  async 'image-check'(h) {
    const state = newState();
    const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
      const posterId = await openNewPoster(page, h.base);
      await openTab(page, 'figure');
      if (!(await clickBlock(page, 'image', 0))) throw new Error('no image block on the default poster');
      const shown = await readPanel(page);
      if (shown.mode !== 'Check a figure') throw new Error(`selecting the image did not bring up Check: ${fmt(shown)}`);
      await fillAndCheck(page);
      const before = await readPanel(page);
      if (!intact(before) || before.visibleRows === 0) throw new Error(`C4 setup of image-check did not reach a checked script: ${fmt(before)}`);
      const imagePill = before.pill;
      // (a) A click on empty canvas; where Make came up instead, the user
      // clicks "Check a figure" to see their script again.
      await clickEmptyCanvas(page);
      const landed = await readPanel(page);
      if (landed.mode !== 'Check a figure') await page.getByRole('button', { name: 'Check a figure' }).click();
      await page.waitForTimeout(300);
      const deselected = await readPanel(page);
      record({ kind: 'CLAIM', id: 'K4 image check, deselect', claim: 'K4', observed: silentlyElsewhere(deselected, imagePill), before, mid: landed, after: deselected, note: `checked on the image at ${imagePill} (${before.scale}); after the deselect: mode ${landed.mode}${landed.mode !== 'Check a figure' ? ' (then "Check a figure")' : ''}, pill ${deselected.pill}, table rows shown ${deselected.visibleRows}, ${deselected.scale ?? 'no scale line'}; note: ${deselected.resultNote ?? 'none'}` });
      // (b) A reload: nothing is selected afterwards.
      await page.reload();
      await waitForSheet(page);
      await openChecker(page);
      const reloaded = await readPanel(page);
      if (reloaded.path !== `/p/${posterId}`) throw new Error(`C3 failed: reload landed on ${reloaded.path}`);
      record({ kind: 'CLAIM', id: 'K4 image check, reload', claim: 'K4', observed: silentlyElsewhere(reloaded, imagePill), after: reloaded, note: `C3 same poster; pill ${reloaded.pill}, table rows shown ${reloaded.visibleRows}, ${reloaded.scale ?? 'no scale line'}; note: ${reloaded.resultNote ?? 'none'}` });
      // (c) The image selected again: its own table comes back.
      await clickBlock(page, 'image', 0);
      const back = await readPanel(page);
      const lost = back.visibleRows !== before.visibleRows || back.scale !== before.scale || !back.hasMarker;
      record({ kind: 'CLAIM', id: 'K4 image check, image again', claim: 'K4', observed: lost, after: back, note: `pill ${back.pill}; table rows shown ${before.visibleRows} → ${back.visibleRows}; ${before.scale} → ${back.scale ?? 'no scale line'}` });
    } finally { await context.close(); }
  },

  async resize(h) {
    const v = await visitorWithCheckedScript(h);
    try {
      setupOk(v.before, 'resize');
      await resizePreview(v.page, -50, -30);
      const after = await readPanel(v.page);
      if (after.pill === v.before.pill) throw new Error(`the preview did not resize: ${after.pill}`);
      record({ kind: 'CLAIM', id: 'K5 resize after check', claim: 'K5', observed: silentlyElsewhere(after, v.before.pill), before: v.before, after, note: `checked at ${v.before.pill}, preview now ${after.pill}; table rows shown ${after.visibleRows}; note: ${after.resultNote ?? 'none'}` });
    } finally { await v.context.close(); }
  },

  async 'long-script'(h) {
    const state = newState();
    const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const long = `${SCRIPT}\n${'# a line of a long analysis script, kept as written\n'.repeat(500)}`;
    const storedLengths = () => page.evaluate(() => Object.keys(localStorage)
      .filter((k) => k.startsWith('postr.figure-script.')).map((k) => localStorage.getItem(k).length));
    try {
      const posterId = await openNewPoster(page, h.base);
      await openChecker(page);
      await page.getByRole('button', { name: 'Python', exact: true }).click();
      await page.getByLabel(CODE_LABEL).fill(long);
      await page.getByRole('button', { name: '▶ Check' }).click();
      await page.waitForTimeout(400);
      const before = await readPanel(page);
      if (!intact(before) || before.codeLen !== long.length) throw new Error(`C4 setup of long-script did not reach a checked script: ${fmt(before)}`);
      const afterCheck = await storedLengths();
      // ONE character typed at the end of the script, with the keyboard.
      const box = page.getByLabel(CODE_LABEL);
      await box.focus();
      await box.evaluate((ta) => ta.setSelectionRange(ta.value.length, ta.value.length));
      await page.keyboard.type('#');
      await page.waitForTimeout(300);
      const edited = await readPanel(page);
      const afterEdit = await storedLengths();
      await page.reload();
      await waitForSheet(page);
      await openChecker(page);
      const after = await readPanel(page);
      if (after.path !== `/p/${posterId}`) throw new Error(`C3 failed: reload landed on ${after.path}`);
      const observed = after.codeLen !== long.length + 1 || !after.hasMarker;
      record({ kind: 'CLAIM', id: 'L8 long script, edit, reload', claim: 'L8', observed, before, mid: edited, after, note: `script ${long.length} chars; stored entry after the Check ${JSON.stringify(afterCheck)}, after one typed character ${JSON.stringify(afterEdit)}; after the reload ${after.codeLen} chars, table rows ${after.visibleRows}` });
    } finally { await context.close(); }
  },

  async 'page-newtab'(h) {
    const { context, page, before } = await pageWithCheckedScript(h);
    try {
      const second = await context.newPage();
      await second.goto(`${h.base}/tools/figure-readability`);
      await second.getByLabel(CODE_LABEL).waitFor({ timeout: 90000 });
      await second.waitForTimeout(500);
      const other = await readPanel(second);
      const leaked = other.hasMarker || other.width !== '10' || other.height !== '7';
      record({ kind: 'CLAIM', id: 'P1 page, a new tab', claim: 'P1', observed: leaked, before, after: other, note: `the new tab shows the script: ${other.hasMarker}; size ${other.width}x${other.height}; localStorage keys holding it: ${other.storage.filter((k) => k.startsWith('localStorage')).length}` });
    } finally { await context.close(); }
  },

  async 'page-control'(h) {
    const { context, page, before } = await pageWithCheckedScript(h);
    try {
      await page.waitForTimeout(1500);
      const after = await readPanel(page);
      const ok = intact(after) && after.sameNode && after.width === before.width && after.height === before.height;
      record({ kind: 'CONTROL', id: 'C2 page-control', claim: 'C2', observed: null, ok, before, after, note: ok ? 'held' : 'FAILED' });
      if (!ok) throw new Error('C2 failed: the page changed with no action');
    } finally { await context.close(); }
  },

  async 'page-reload'(h) {
    const { context, page, before } = await pageWithCheckedScript(h);
    try {
      await page.reload();
      await page.getByLabel(CODE_LABEL).waitFor({ timeout: 90000 });
      await page.waitForTimeout(500);
      const after = await readPanel(page);
      record({ kind: 'CLAIM', id: 'L5 page reload', claim: 'L5', observed: !after.hasMarker, before, after, note: `size ${before.width}x${before.height} → ${after.width}x${after.height}` });
    } finally { await context.close(); }
  },

  async 'sib-authors'(h) {
    await siblingDraft(h, {
      id: 'S1 authors paste box', tab: 'authors',
      fill: async (page) => page.locator('textarea[placeholder^="John Smith"]').fill(`Jane Doe1, John Smith2 ${MARKER}`),
      read: (page) => page.locator('textarea[placeholder^="John Smith"]').inputValue().catch(() => null),
    });
  },

  async 'sib-refs'(h) {
    await siblingDraft(h, {
      id: 'S2 references paste + manual', tab: 'references',
      fill: async (page) => {
        await page.locator('textarea[placeholder^="Smith, J. (2023)"]').fill(`Doe, J. (2024). A sample paper. ${MARKER}`);
        await page.locator('input[placeholder^="Authors, comma-separated"]').fill(`Doe J ${MARKER}`);
      },
      read: async (page) => {
        const a = await page.locator('textarea[placeholder^="Smith, J. (2023)"]').inputValue().catch(() => null);
        const b = await page.locator('input[placeholder^="Authors, comma-separated"]').inputValue().catch(() => null);
        // Both fields must keep their text.
        return a?.includes(MARKER) && b?.includes(MARKER) ? `paste:${a}|manual:${b}` : `paste:${a ?? ''}|manual:${(b ?? '').replace(MARKER, '')}`;
      },
    });
  },

  async 'sib-make'(h) {
    // One line, a header: the box parses on blur only once it holds a
    // header and a row (DataStep's looksLikeTable), so the click on the
    // text block leaves this a draft. S7 is the table that is used.
    await siblingDraft(h, {
      id: 'S3 make-a-figure table', tab: 'figure',
      fill: async (page) => {
        const make = page.getByRole('button', { name: 'Make a figure' });
        if ((await make.getAttribute('aria-pressed')) !== 'true') await make.click();
        await page.getByLabel('Paste your table').fill(`Condition\tMean (ms) ${MARKER}`);
      },
      read: (page) => page.getByLabel('Paste your table').inputValue().catch(() => null),
    });
  },

  async 'sib-ladder'(h) {
    // A header and two rows: the click on the text block blurs the box,
    // which uses the table (step 1 answered) before the sidebar moves.
    // Kept when step 1 is still answered on the way back.
    await siblingDraft(h, {
      id: 'S7 make-a-figure ladder', tab: 'figure',
      fill: async (page) => {
        const make = page.getByRole('button', { name: 'Make a figure' });
        if ((await make.getAttribute('aria-pressed')) !== 'true') await make.click();
        await page.getByLabel('Paste your table').fill(`Condition\tMean (ms) ${MARKER}\nControl\t512\nHigh dose\t428`);
      },
      read: (page) => page.evaluate((marker) => {
        const box = document.querySelector('textarea[aria-label="Paste your table"]');
        if (box) return box.value;
        const step1 = document.querySelector('section[aria-label="Step 1: Your data"]');
        return step1 && /rows ×/.test(step1.textContent) ? `step 1 answered: ${step1.textContent.trim()} ${marker}` : null;
      }, MARKER),
    });
  },

  async 'sib-name'(h) {
    await siblingDraft(h, {
      id: 'S5 layout poster-name draft', tab: 'layout',
      fill: async (page) => page.getByLabel('Poster name').fill(`Untitled Poster ${MARKER}`),
      read: (page) => page.getByLabel('Poster name').inputValue().catch(() => null),
    });
  },

  async 'sib-version'(h) {
    await siblingDraft(h, {
      id: 'S6 version name', tab: 'versions',
      fill: async (page) => page.locator('input[placeholder^="Optional name"]').fill(`before advisor ${MARKER}`),
      read: (page) => page.locator('input[placeholder^="Optional name"]').inputValue().catch(() => null),
    });
  },

  async 'sib-scan'(h) {
    const state = newState();
    const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    // The image text scan (Claude Vision behind /api/import/extract), faked:
    // registered after the backend's own catch-all, so it wins.
    let scans = 0;
    await context.route('http://localhost:3000/api/import/extract', (route) => {
      scans += 1;
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: JSON.stringify({
          imagePixelWidth: 800, imagePixelHeight: 600,
          regions: [
            { text: `Time (min) ${MARKER}`, bbox: { x: 300, y: 560, w: 200, h: 24 }, role: 'axis-title' },
            { text: '0 10 20 30', bbox: { x: 80, y: 530, w: 600, h: 14 }, role: 'axis-tick' },
          ],
        }),
      });
    });
    try {
      const posterId = await openNewPoster(page, h.base);
      // Give the poster two image blocks with a picture (a same-origin URL,
      // so nothing is uploaded), then open it again as the visitor would.
      await page.waitForTimeout(1500);
      const row = state.rows.find((r) => r.id === posterId);
      const img = row.data.blocks.find((b) => b.type === 'image');
      if (!img) throw new Error('no image block on the default poster');
      img.imageSrc = '/icon-512.png';
      const second = { ...img, id: 'zq-image-2', x: img.x, y: img.y + img.h + 4, imageSrc: '/icon-192.png' };
      row.data = { ...row.data, blocks: [...row.data.blocks, second] };
      await page.reload();
      await waitForSheet(page);
      await openTab(page, 'figure');
      await clickBlock(page, 'image', 0);
      await openChecker(page);
      await page.getByRole('button', { name: '🔎 Scan image' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('table')].some((t) => /Effective pt/.test(t.textContent)), null, { timeout: 8000 });
      const before = await readPanel(page);
      await clickBlock(page, 'image', 1);
      const onOther = await readPanel(page);
      record({ kind: 'INFO', id: 'S4a scan, select image B', claim: 'S4', observed: null, before, after: onOther, note: `image B selected (pill ${onOther.pill}); image A's ${before.scanRows} scan row(s) still shown: ${onOther.scanRows > 0}` });
      await clickBlock(page, 'image', 0);
      await clickBlock(page, 'text', 0);
      const mid = await readPanel(page);
      await openTab(page, 'figure');
      await clickBlock(page, 'image', 0);
      await openChecker(page);
      const after = await readPanel(page);
      record({ kind: 'INFO', id: 'S4b scan, text block, back', claim: 'S4', observed: null, before, mid, after, note: `routed to ${mid.tab}; scan rows ${before.scanRows} → ${after.scanRows}; API calls ${scans}` });
    } finally { await context.close(); }
  },
};

SCENARIOS.quota = async function quota(h) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
  try {
    await page.goto(`${h.base}/tools/figure-readability`);
    await page.getByLabel(CODE_LABEL).waitFor({ timeout: 90000 });
    const capacity = await page.evaluate(() => {
      const fits = (n) => {
        try {
          localStorage.setItem('zq-quota', 'a'.repeat(n));
          return true;
        } catch {
          return false;
        } finally {
          localStorage.removeItem('zq-quota');
        }
      };
      let lo = 0;
      let hi = 64 * 1024 * 1024;
      while (hi - lo > 1024) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) lo = mid; else hi = mid;
      }
      return lo;
    });
    const bound = 10 * 2 * 50_000;
    record({ kind: 'INFO', id: 'Q1 localStorage capacity', claim: 'Q1', observed: null, note: `one value of ASCII text fits up to about ${capacity} characters (to 1,024); the kept scripts take at most about ${bound} (${((bound / capacity) * 100).toFixed(0)}%)` });
  } finally { await context.close(); }
};

async function pageWithCheckedScript(h) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
  await page.goto(`${h.base}/tools/figure-readability`);
  await page.getByLabel(CODE_LABEL).waitFor({ timeout: 90000 });
  for (const [label, v] of [['Width', '6'], ['Height', '4.5']]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(v);
    await input.press('Enter');
  }
  await fillAndCheck(page);
  await tagCodeBox(page);
  const before = await readPanel(page);
  if (!intact(before) || before.width !== '6' || before.height !== '4.5') {
    await context.close();
    throw new Error(`C4 page setup did not reach a checked script at 6 x 4.5: ${fmt(before)}`);
  }
  return { context, page, before };
}

/** A sibling panel's typed draft, a click on a text block, then back to its tab. */
async function siblingDraft(h, { id, tab, fill, read }) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state, { viewport: VIEWPORT });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  try {
    await openNewPoster(page, h.base);
    await openTab(page, tab);
    await fill(page);
    const before = await read(page);
    if (!before?.includes(MARKER)) throw new Error(`${id}: the draft did not take (${before})`);
    await clickBlock(page, 'text', 0);
    const mid = await readPanel(page);
    await openTab(page, tab);
    const after = await read(page);
    const lost = !(after ?? '').includes(MARKER);
    // A read that returns labels around the fields (S2) counts only the typed text.
    const typed = (t) => (t ?? '').replace(/paste:|\|manual:/g, '').length;
    record({ kind: 'CLAIM', id, claim: id.slice(0, 2), observed: lost, note: `routed to ${mid.tab}; draft ${typed(before)} chars → ${after === null ? 'no field' : `${typed(after)} chars`}; lost: ${lost}; kept in storage under ${mid.storage.length} key(s)` });
  } finally { await context.close(); }
}

// ---------------------------------------------------------------- run
const ids = Object.keys(SCENARIOS).filter((id) => !ONLY || ONLY.includes(id));
if (ONLY && ids.length !== ONLY.length) fail(`unknown --only id: ${ONLY.filter((id) => !SCENARIOS[id])}`);
const stampFile = path.join(WEB, 'public/version.json');
const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile) : null;
restoreStamp = () => { if (stamp !== null) fs.writeFileSync(stampFile, stamp); };

const h = await startHarness({ name: 'figure-script-check', port: PORT });
let errored = 0;
try {
  for (const id of ids) {
    try {
      await SCENARIOS[id](h);
    } catch (e) {
      errored += 1;
      log(`ERROR   ${id}: ${String(e?.message ?? e).slice(0, 400)}`);
    }
  }
} finally {
  await h.stop();
  restoreStamp();
}

const counted = results.filter((r) => r.kind === 'CLAIM' && r.observed !== null);
const observed = counted.filter((r) => r.observed);
const byClaim = {};
for (const r of counted) {
  byClaim[r.claim] ??= { n: 0, observed: 0 };
  byClaim[r.claim].n += 1;
  if (r.observed) byClaim[r.claim].observed += 1;
}
const failedControls = results.filter((r) => r.kind === 'CONTROL' && !r.ok).length;
log('');
log(`[summary] ${h.engine} ${h.git}${h.mutant ? ` MUTANT ${h.mutant}` : ''}: ${observed.length} of ${counted.length} counted readings observed the defect; ${errored} scenario(s) errored; ${failedControls} control(s) failed`);
for (const [c, v] of Object.entries(byClaim)) log(`[summary] ${c}: ${v.observed} of ${v.n}`);
fs.writeFileSync(path.join(h.out, 'results.json'), JSON.stringify({ git: h.git, engine: h.engine, mutant: h.mutant, results, errored }, null, 1));
log(`[summary] results: ${path.join(h.out, 'results.json')}`);
process.exit(errored || failedControls ? 2 : observed.length ? 1 : 0);
