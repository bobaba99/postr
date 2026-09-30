#!/usr/bin/env node
/**
 * new-poster-owner-check.mjs — does opening the editor at /p/new ever put a
 * visitor into someone else's poster? (docs/fixes/23-new-poster-owner-only.md)
 *
 * /p/new opens "the visitor's most recent poster, or a new one". The posters
 * table lets anyone read a poster whose owner made a share link (is_public),
 * so a query for "the most recent poster" that does not say "mine" can
 * return a stranger's shared poster.
 *
 * It enters where a visitor enters: the editor link, /p/new, on a fresh
 * browser. The backend is faked at the network layer with the posters
 * table's row-level security as the migrations write it
 * (lib/guestBackend.mjs); nothing in the app is stubbed.
 *
 * CLAIMS, per scenario
 *   N1  a new guest, when another user has a shared (public) poster, is put
 *       into that poster (defect) rather than a new one of their own;
 *   N2  a returning guest whose own poster is older than a stranger's shared
 *       poster is put into the stranger's poster (defect) rather than their
 *       own.
 *   N3  a guest who opens a stranger's shared poster by its editor link
 *       (/p/<id>) gets the editor on it (defect) rather than "Poster not found".
 *   S1  a share link (/s/<slug>) shows the shared poster, or any share or
 *       comment control (defect since the owner hid sharing, 2026-09-30).
 *       This runs on the Vite dev server: vercel.json's rewrite of /s/:slug
 *       is covered only by src/seo/__tests__/vercelRouting.test.ts.
 *   S2  a guest who selects text in their own poster is offered a way into
 *       comments or sharing: any button on the page labelled for comments
 *       or sharing (today the text toolbar's "Comment on selection"), or,
 *       once it is pressed, the comments panel (its "Copy share link" made a
 *       poster public). Added after fix 23's step 9 review (CR-b-1).
 * Read for each: which poster the editor opened (the URL's id), whose it is,
 * whether the stranger's title text shows on the canvas, and whether the
 * visitor's typing is saved (the PATCH's status).
 * CONTROLS (a failed control stops the run, exit 2)
 *   C1  no shared poster exists: the guest gets a new poster of their own and
 *       typing saves (200);
 *   C2  a stranger's PRIVATE poster, newer than anything: the guest never sees
 *       it (the fake applies the read policy).
 *   C3  a returning guest opens their own poster by its editor link: the
 *       editor opens (the direct-link scenarios' known answer).
 *   C4  selecting text shows the format toolbar ("Clear formatting"), so S2
 *       can see a button there.
 *
 * RUN (from apps/web; the tree's apps/web/.env must point at the harness's
 * fake backend, https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/new-poster-owner-check.mjs [--only id,id]
 *   env PORT (default 5361), OUT_DIR, POSTR_REPO, POSTR_MUTANT
 * EXIT 0 no claim observed · 1 a defect observed · 2 a control failed or the
 *      instrument errored
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { log, startHarness, buildDoc } from './lib/editorHarness.mjs';
import {
  newState, newGuestPage, makeUser, makeRow, sessionFor, typeIntoTextBlock, waitFor, dataPatches, canvasHas, pillText, sleep,
} from './lib/guestBackend.mjs';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    process.stderr.write(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 500)}\n`);
    process.exit(2);
  });
}

const PORT = Number(process.env.PORT ?? 5361);
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;

const days = (n) => new Date(Date.now() - n * 86400e3).toISOString();
const STRANGER_TITLE = 'ZQSTRANGER shared poster';

/**
 * Open /p/new as a visitor, with `seed(state, page)` putting rows in the
 * table first, then type into a text block. What the visitor got.
 */
async function visit(h, seed, { returning = false } = {}) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state);
  try {
    const doc = await buildDoc(page, h.base, { w: 48, h: 36 });
    const seeded = await seed(state, doc);
    if (returning) {
      // A guest who was here before: their session and their own poster.
      const me = makeUser(state);
      state.signups.push({ t: Date.now(), id: me.id, returning: true });
      const mine = makeRow(me.id, { ...doc, blocks: doc.blocks.map((b) => (b.type === 'title' ? { ...b, content: 'ZQMINE my own poster' } : b)) }, { title: 'ZQMINE', updated_at: days(5) });
      state.rows.push(mine);
      seeded.mine = mine;
      // supabase-js keeps the session in localStorage as sb-<project ref>-auth-token;
      // the harness's project URL is https://dummy.supabase.co.
      await page.addInitScript((token) => {
        localStorage.setItem('sb-dummy-auth-token', JSON.stringify(token));
      }, sessionFor(state, me.id));
    }
    await page.goto(`${h.base}/p/new`);
    await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await sleep(1000);
    const openedId = page.url().split('/p/')[1];
    const visitor = returning ? seeded.mine.user_id : state.signups.find((s) => !s.returning)?.id ?? state.signups[0]?.id;
    const opened = state.rows.find((r) => r.id === openedId);
    const strangerShown = await canvasHas(page, 'ZQTITLE') && opened?.user_id !== visitor;
    const t0 = Date.now();
    await typeIntoTextBlock(page, ' ZQVISITOR');
    const patch = await waitFor(() => dataPatches(state, t0).find((e) => e.dataStr?.includes('ZQVISITOR')), { timeout: 8000 });
    await sleep(800);
    return {
      openedOwner: !opened ? 'unknown' : opened.user_id === visitor ? 'visitor' : 'someone else',
      openedTitle: opened?.title ?? null,
      strangerShown,
      saveStatus: patch?.status ?? null,
      pill: await pillText(page),
      tabTitle: await page.title(),
      visitorRows: state.rows.filter((r) => r.user_id === visitor).length,
      errors: state.errors.slice(0, 3),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

const stranger = (extra) => (state, doc) => {
  const who = randomUUID();
  state.rows.push(makeRow(who, doc, { title: STRANGER_TITLE, ...extra }));
  return {};
};

/** Open a URL as a new guest, with a stranger's shared poster in the table. */
async function direct(h, path) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state);
  try {
    const doc = await buildDoc(page, h.base, { w: 48, h: 36 });
    const row = makeRow(randomUUID(), doc, { title: STRANGER_TITLE, is_public: true, share_slug: 'zqshared03', updated_at: days(1) });
    state.rows.push(row);
    await page.goto(`${h.base}${path(row)}`);
    await page.waitForFunction(() => document.querySelector('#poster-canvas [data-block-id]') || /Poster not found|academic posters/i.test(document.body.innerText), null, { timeout: 90000 });
    await sleep(800);
    return {
      url: new URL(page.url()).pathname,
      editorOpen: !!(await page.$('#poster-canvas [data-block-id]')),
      strangerShown: await canvasHas(page, 'ZQTITLE'),
      notFound: /Poster not found/.test(await page.evaluate(() => document.body.innerText)),
      shareUi: await shareUi(page),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** A returning guest opens their own poster by its editor link. */
async function directOwn(h) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state);
  try {
    const doc = await buildDoc(page, h.base, { w: 48, h: 36 });
    const me = makeUser(state);
    state.signups.push({ t: Date.now(), id: me.id, returning: true });
    const mine = makeRow(me.id, doc, { title: 'ZQMINE', updated_at: days(1) });
    state.rows.push(mine);
    await page.addInitScript((token) => {
      localStorage.setItem('sb-dummy-auth-token', JSON.stringify(token));
    }, sessionFor(state, me.id));
    await page.goto(`${h.base}/p/${mine.id}`);
    await page.waitForFunction(() => document.querySelector('#poster-canvas [data-block-id]') || /Poster not found/i.test(document.body.innerText), null, { timeout: 90000 });
    return {
      url: new URL(page.url()).pathname,
      editorOpen: !!(await page.$('#poster-canvas [data-block-id]')),
      notFound: /Poster not found/.test(await page.evaluate(() => document.body.innerText)),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** Is a share or comment control on screen? */
const shareUi = (page) => page.evaluate(() => (
  /Copy share link|Post comment|Make your own/i.test(document.body.innerText)
  || !!document.querySelector('[data-comment-mode="true"]')
));

/**
 * A new guest selects text in their own poster: is there a way into comments
 * or sharing? Presses "Comment on selection" if the toolbar offers it.
 */
async function selectText(h) {
  const state = newState();
  const { context, page } = await newGuestPage(h, state);
  try {
    await page.goto(`${h.base}/p/new`);
    await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await sleep(1000);
    await typeIntoTextBlock(page, ' ZQSELECT');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    const toolbarShown = !!(await waitFor(() => page.$('button[title="Clear formatting"]'), { timeout: 5000 }));
    // Any button labelled for comments or sharing, not only today's title.
    const button = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /comment|share/i.test(`${b.title} ${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`)) ?? null).then((h) => h.asElement());
    if (button) await button.click();
    await sleep(800);
    return { toolbarShown, commentButton: !!button, shareUi: await shareUi(page) };
  } finally {
    await context.close().catch(() => {});
  }
}

const SCENARIOS = [
  { id: 'c1-no-shared-poster', control: true, seed: () => ({}), pass: (r) => r.openedOwner === 'visitor' && r.saveStatus === 200 },
  { id: 'c2-stranger-private-newer', control: true, seed: stranger({ is_public: false, updated_at: days(0) }), pass: (r) => r.openedOwner === 'visitor' && r.saveStatus === 200 },
  { id: 'n1-new-guest-stranger-shared', claim: 'N1', seed: stranger({ is_public: true, share_slug: 'zqshared01', updated_at: days(3) }) },
  { id: 'n2-returning-guest-stranger-shared-newer', claim: 'N2', returning: true, seed: stranger({ is_public: true, share_slug: 'zqshared02', updated_at: days(1) }) },
  { id: 'n3-editor-link-to-stranger-shared', claim: 'N3', run: (h) => direct(h, (row) => `/p/${row.id}`), defect: (r) => r.editorOpen },
  { id: 'c3-own-poster-by-link', control: true, run: directOwn, pass: (r) => r.editorOpen && !r.notFound },
  { id: 's1-share-link', claim: 'S1', run: (h) => direct(h, (row) => `/s/${row.share_slug}`), defect: (r) => r.strangerShown || r.shareUi },
  // S2 is also C4: without the toolbar the claim could not be seen.
  { id: 's2-comment-on-selection', claim: 'S2', run: selectText, defect: (r) => r.commentButton || r.shareUi, control: false, needs: (r) => r.toolbarShown },
];

const chosen = SCENARIOS.filter((s) => !only || only.includes(s.id));
if (only && chosen.length !== only.length) {
  log(`[harness] unknown scenario(s): ${only.filter((id) => !SCENARIOS.some((s) => s.id === id)).join(', ')}`);
  process.exit(2);
}

const h = await startHarness({ name: 'new-poster-owner', port: PORT }).catch((e) => {
  log(`[harness] instrument error: ${e}`);
  process.exit(2);
});
const results = [];
let failedControl = false;
let observed = 0;
for (const sc of chosen) {
  try {
    const r = sc.run ? await sc.run(h) : await visit(h, sc.seed, { returning: !!sc.returning });
    if (sc.control) {
      const ok = sc.pass(r);
      failedControl ||= !ok;
      log(`[${ok ? 'control ok' : 'CONTROL FAILED'}] ${sc.id} ${JSON.stringify(r)}`);
      results.push({ id: sc.id, control: true, ok, ...r });
    } else {
      if (sc.needs && !sc.needs(r)) {
        failedControl = true;
        log(`[CONTROL FAILED] C4 ${sc.id}: the format toolbar never showed ${JSON.stringify(r)}`);
      }
      const defect = sc.defect ? sc.defect(r) : r.openedOwner !== 'visitor';
      observed += defect ? 1 : 0;
      log(`[${defect ? 'OBSERVED' : 'not observed'}] ${sc.claim} ${sc.id} ${JSON.stringify(r)}`);
      results.push({ id: sc.id, claim: sc.claim, observed: defect, ...r });
    }
  } catch (e) {
    failedControl = true;
    log(`[ERROR] ${sc.id} ${String(e).slice(0, 300)}`);
    results.push({ id: sc.id, error: String(e).slice(0, 300) });
  }
}
await h.stop();
const summary = { git: h.git, mutant: h.mutant, observed: `${observed} of ${results.filter((r) => r.claim).length}`, controlsOk: !failedControl };
fs.writeFileSync(path.join(h.out, 'results.json'), JSON.stringify({ summary, results }, null, 2));
log(`[harness] ${JSON.stringify(summary)}`);
const exit = failedControl ? 2 : observed ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(h.out, 'results.json')}`);
process.exit(exit);
