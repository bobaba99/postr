/**
 * Record 38's review round 2 (docs/fixes/38-save-on-leave.md, section 9):
 * the reviewer's probes that found a defect, folded in, and the cases
 * around them; its other cells (the partition of entry paths: the build,
 * bfcache, an expired token, a guest, near the keepalive limit, the tab
 * hidden) are lib/keepWorkLeaveRound2Paths.mjs. Run by
 * scripts/keep-work-check.mjs with the other leave scenarios
 * (lib/keepWorkLeave.mjs), whose helpers these use; `--only L` runs them.
 *
 * The reviewer's ids, for its evidence: R2-SWT-<way> is
 * `L4-slow-write-then-edit-<way>-traced` (R2-1: WebKit's Back), R2-RR-* is
 * `L3-inapp-reopen-*` (R2-2), R2-KA-* is `LKa-*` (R2-3), R2-DB-* is
 * `L3-inapp-kept-then-*` (R2-4). New here: `L4-slow-write-then-own-save-
 * <way>-traced` (the newer change's own save waiting on the held write when
 * the page is left: R2-1's sibling).
 */
import { sleep } from './editorHarness.mjs';
import { rowOf, savePill } from './keepWorkKit.mjs';
import { WAYS, has, recordWrites, typeWord, waitSheet, watchDialogs, writesMade } from './keepWorkLeave.mjs';

/** The page's writes as `ka@ms` / `plain@ms`, `+` when the body holds the word asked. */
export const writesText = (made) => JSON.stringify(made.map((w) => `${w.ka ? 'ka' : 'plain'}@${w.at}${w.has ? '+' : ''}`));

/** Stored writes since `t0` in the order applied, and whether one without `newer` was applied after one with it. */
export function appliedOrder(state, t0, older, newer) {
  const applied = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.status === 200 && x.keys?.includes('data'));
  const firstNewer = applied.findIndex((x) => (x.dataStr ?? '').includes(newer));
  return {
    olderAfter: firstNewer >= 0 && applied.slice(firstNewer + 1).some((x) => !(x.dataStr ?? '').includes(newer)),
    text: JSON.stringify(applied.map((x) => `@${x.t - t0}${(x.dataStr ?? '').includes(newer) ? '+new' : (x.dataStr ?? '').includes(older) ? '+old' : ''}`)),
  };
}

/** Polls the stored row every 100 ms for up to `ms` until `pred(row)`: the ms it took, or null. */
export async function storedWithin(state, id, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred(rowOf(state, id))) return Date.now() - t0;
    await sleep(100);
  }
  return pred(rowOf(state, id)) ? Date.now() - t0 : null;
}
export const holds = (word) => (row) => JSON.stringify(row?.data ?? {}).includes(word);

/**
 * Playwright's Firefox shows no leave dialog on a reload (main and branch
 * alike: record 38 section 6): a claim that the change was lost WITH NO
 * DIALOG cannot be measured there, and is printed, not counted.
 */
export const dialogNotDriven = (h, wayName) => h.engine === 'firefox' && wayName === 'reload';
export const NOT_DRIVEN = 'not counted: Playwright\'s Firefox shows no dialog on a reload';

// ------------------------------------------------------------------ an expired token (also lib/keepWorkLeaveRound2Paths.mjs)

/** The token the page's client holds now. */
const tokenNow = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
  try { return k ? JSON.parse(localStorage.getItem(k)).access_token : null; } catch { return null; }
});
export const expOf = (tok) => { try { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString()).exp; } catch { return null; } };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/**
 * A 100 s token (the scenario's `session: { expiresIn: 100 }`); the client's
 * refresh held at the Auth server (a laptop waking: the refresh is out, the
 * page still holds the old token); a PATCH whose bearer has expired answered
 * 401 "JWT expired", as PostgREST does. Waits until the token expired 2.5 s ago.
 */
export async function expiredSetup(s) {
  const { context, page } = s;
  const held = [];
  await context.route('https://dummy.supabase.co/auth/v1/token*', (route) => { held.push(route); });
  await context.route('https://dummy.supabase.co/rest/v1/posters*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const exp = expOf((req.headers().authorization ?? '').replace(/^Bearer\s+/i, ''));
      if (exp !== null && exp <= Math.floor(Date.now() / 1000)) {
        s.state.log.push({ t: Date.now(), method: 'PATCH', path: '/rest/v1/posters', status: 401, keys: ['data'], dataStr: req.postData() ?? '', expired: true });
        return route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ code: 'PGRST301', details: null, hint: null, message: 'JWT expired' }) });
      }
    }
    return route.fallback();
  });
  const exp = expOf(await tokenNow(page));
  await sleep(Math.max(0, exp * 1000 - Date.now() + 2500));
  return {
    held,
    tokenAtLeave: await tokenNow(page),
    release: async () => {
      for (const r of held.splice(0)) await r.fallback().catch(() => {});
      await context.unroute('https://dummy.supabase.co/auth/v1/token*').catch(() => {});
    },
  };
}

// ------------------------------------------------------------------ R2-1: a slow write, an edit, then each way out, with the page's own trace

/** The page's own trace: each poster data write (`new` when its body holds one of `newer`), its outcome, and the leave events, by the page's clock. */
function traceScript(newer) {
  if (window.__zqTrace2) return;
  window.__zqTrace2 = true;
  const put = (e) => {
    try {
      const n = Number(localStorage.getItem('zq-t2-n') ?? '0');
      localStorage.setItem('zq-t2-n', String(n + 1));
      localStorage.setItem(`zq-t2-${n}`, JSON.stringify({ t: performance.timeOrigin + performance.now(), ...e }));
    } catch { /* trace only */ }
  };
  const orig = window.fetch;
  window.fetch = function zqTrace2Fetch(input, init) {
    const url = String(input?.url ?? input);
    const isWrite = /\/rest\/v1\/posters\?/.test(url) && init?.method === 'PATCH' && String(init?.body ?? '').includes('"data"');
    const tag = isWrite ? (newer.some((w) => String(init.body).includes(w)) ? 'new' : 'old') : null;
    if (isWrite) put({ e: `fetch-${tag}${init.keepalive ? '-ka' : ''}` });
    const p = orig.apply(this, arguments);
    if (isWrite) p.then((r) => put({ e: `ok-${tag}-${r.status}` }), (err) => put({ e: `fail-${tag}-${String(err).slice(0, 30)}` }));
    return p;
  };
  for (const ev of ['beforeunload', 'pagehide', 'visibilitychange', 'popstate']) addEventListener(ev, () => put({ e: ev }), true);
}
async function readTrace(h, s, since) {
  const p = await s.context.newPage();
  try {
    await p.goto(`${h.base}/version.json`);
    const all = await p.evaluate(() => Array.from({ length: Number(localStorage.getItem('zq-t2-n') ?? '0') }, (_, i) => JSON.parse(localStorage.getItem(`zq-t2-${i}`) ?? 'null')).filter(Boolean));
    return all.filter((x) => x.t >= since).map((x) => `${x.e}@${Math.round(x.t - since)}`);
  } finally { await p.close().catch(() => {}); }
}

/**
 * The first save held 2.5 s; `older` typed; 1 s later `newer`; then, after
 * `waitMs` (0: at once, its own save not yet due; 900: its own save up and
 * waiting on the held write), the way out. Claims: L4 a write without
 * `newer` applied after one with it (older over newer); L4d `newer` lost with
 * no dialog.
 */
function tracedCell(id, wayName, older, newer, waitMs, how) {
  const way = WAYS[wayName];
  const holdMs = 2500;
  return {
    id, claims: ['L4', 'L4d'], how: `${how} ${way.how}; the page's own trace of its writes and leave events: older over newer (L4)? ${newer} lost with no dialog (L4d)?`,
    async run(h, s) {
      await s.context.addInitScript(traceScript, [newer]);
      await recordWrites(s);
      if (way.prepare) await way.prepare(h, s);
      await s.page.evaluate(traceScript, [newer]);
      const { page, state } = s;
      state.faults.patchDelays = [holdMs];
      const dialogs = watchDialogs(page);
      const tStart = Date.now();
      await typeWord(page, older);
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, newer);
      if (waitMs) await sleep(waitMs);
      const tl = Date.now();
      await way.leave(page, h);
      await sleep(holdMs + 2000);
      const order = appliedOrder(state, t0, older, newer);
      const made = await writesMade(h, s, t0 - 50, newer);
      const lostNoDialog = !has(state, s.id, newer) && dialogs.n === 0;
      return {
        claims: { L4: order.olderAfter, L4d: lostNoDialog && !dialogNotDriven(h, wayName) },
        numbers: {
          ...(lostNoDialog && dialogNotDriven(h, wayName) ? { L4d: NOT_DRIVEN } : {}),
          dialog: dialogs.n, applied: order.text, stored: `${has(state, s.id, older) ? 'old' : ''}${has(state, s.id, newer) ? '+new' : ''}`,
          leftAtMs: tl - t0, writesMade: writesText(made), trace: JSON.stringify(await readTrace(h, s, tStart)),
        },
      };
    },
  };
}
const UNLOADING = ['back', 'close', 'reload', 'link', 'address'];
const TRACED = [
  ...UNLOADING.map((w) => tracedCell(`L4-slow-write-then-edit-${w}-traced`, w, 'ZQWC', 'ZQWD', 0,
    'the first save held 2.5 s; " ZQWC" typed; 1 s later (its write out) " ZQWD"; at once')),
  // R2-1's sibling: the newer change's own save is up and waiting on the
  // held write when the page is left; an engine that fails the held write
  // before its leave event would let that save go at once.
  ...UNLOADING.map((w) => tracedCell(`L4-slow-write-then-own-save-${w}-traced`, w, 'ZQWE', 'ZQWF', 900,
    'the first save held 2.5 s; " ZQWE" typed; 1 s later (its write out) " ZQWF"; 900 ms later (ZQWF\'s own save up, waiting on the held one)')),
];

// ------------------------------------------------------------------ R2-3: the leave's ask after Stay

/** A synthetic visibilitychange (a headless page stays visible). */
const flip = (page, vis) => page.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}, vis);

const ASK = [
  {
    id: 'LKa-stay-then-later', claims: ['LKa'],
    how: 'every save held 2 s; " ZQKA" typed; 1 s later (its write out) the tab close asked and the dialog dismissed (Stay); 4 s (stored, nothing waiting); then " ZQKB" typed and left alone: is ZQKB\'s ordinary save sent with keepalive (LKa: the leave\'s ask outlived the leave)?',
    async run(h, s) {
      await recordWrites(s);
      const { page, state, id } = s;
      state.faults.patchDelays = [2000, 2000, 2000];
      const dialogs = watchDialogs(page, 'dismiss');
      await typeWord(page, 'ZQKA');
      const t0 = Date.now();
      await sleep(1000);
      await page.close({ runBeforeUnload: true });
      await sleep(4000);
      const storedA = has(state, id, 'ZQKA');
      const tB = Date.now();
      await typeWord(page, 'ZQKB');
      await sleep(4000);
      const made = await writesMade(h, s, t0 - 50, 'ZQKB');
      return {
        claims: { LKa: made.filter((w) => w.has).some((w) => w.ka) },
        numbers: { dialog: dialogs.n, stayed: !page.isClosed(), storedAAt4s: storedA, writesMade: writesText(made), editBAtMs: tB - t0, storedB: has(state, id, 'ZQKB') },
      };
    },
  },
  {
    id: 'LKa-hidden-then-later', claims: ['LKa'],
    how: 'every save held 2 s; " ZQKC" typed; 1 s later (its write out) the tab hidden then shown again (synthetic visibilitychange); 4 s; " ZQKD" typed: is ZQKD\'s ordinary save sent with keepalive (LKa)?',
    async run(h, s) {
      await recordWrites(s);
      const { page, state, id } = s;
      state.faults.patchDelays = [2000, 2000, 2000];
      await typeWord(page, 'ZQKC');
      const t0 = Date.now();
      await sleep(1000);
      await flip(page, 'hidden');
      await sleep(300);
      await flip(page, 'visible');
      await sleep(3700);
      await typeWord(page, 'ZQKD');
      await sleep(4000);
      const made = await writesMade(h, s, t0 - 50, 'ZQKD');
      return { claims: { LKa: made.filter((w) => w.has).some((w) => w.ka) }, numbers: { writesMade: writesText(made), storedD: has(state, id, 'ZQKD') } };
    },
  },
  {
    // The harm of a stale ask: the hand-built request does not refresh an
    // expiring token, as the client's own does.
    id: 'LKa-stale-ask-expired', claims: ['LKe'], session: { expiresIn: 100 },
    how: 'the ask left set (the first save held 2 s, Stay at 1 s while it is out); then the client\'s refresh held (a laptop waking) and the token expired 2.5 s ago; " ZQKE" typed; the pill read every 100 ms for 2.5 s: "Not saved" shown (LKe: a failed save the client\'s own path would have waited out)? the refresh then answered: stored?',
    async run(h, s) {
      await recordWrites(s);
      const { page, state, id } = s;
      state.faults.patchDelays = [2000];
      const dialogs = watchDialogs(page, 'dismiss');
      await typeWord(page, 'ZQKA');
      await sleep(1000);
      await page.close({ runBeforeUnload: true });
      await sleep(3000);
      const ex = await expiredSetup(s);
      const t0 = Date.now();
      await typeWord(page, 'ZQKE');
      const pills = [];
      for (let i = 0; i < 25; i += 1) { pills.push(await savePill(page)); await sleep(100); }
      await ex.release();
      const within = await storedWithin(state, id, holds('ZQKE'), 15000);
      const made = await writesMade(h, s, t0 - 50, 'ZQKE');
      const patches = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 - 50 && (x.dataStr ?? '').includes('ZQKE')).map((x) => `${x.status}@${x.t - t0}`);
      return {
        claims: { LKe: pills.some((p) => /^Not saved/.test(p ?? '')) },
        numbers: { dialog: dialogs.n, pills: JSON.stringify([...new Set(pills)]), storedMsAfterRefresh: within, patches: JSON.stringify(patches), writesMade: writesText(made) },
      };
    },
  },
];

// ------------------------------------------------------------------ R2-2: the reopened poster's load and the kept write

/** A change kept while its write waits on a held one: `a` typed, 1 s, `b`, Back inside the app; the first save held 3 s, the next 4 s. */
async function keptBehindHeld(h, s, a, b) {
  await recordWrites(s);
  await WAYS.inapp.prepare(h, s);
  const { page, state } = s;
  state.faults.patchDelays = [3000, 4000];
  watchDialogs(page);
  await typeWord(page, a);
  const t0 = Date.now();
  await sleep(1000);
  await typeWord(page, b);
  await page.goBack().catch(() => {});
  return t0;
}
/** The poster opened again from its card at `atMs` after `t0`: whether `word` is on the sheet. */
async function reopenAt(s, t0, atMs, word) {
  const { page, id } = s;
  await sleep(Math.max(0, atMs - (Date.now() - t0)));
  const card = page.locator(`a[href="/p/${id}"]`).first();
  await card.waitFor({ timeout: 30000 });
  const at = Date.now();
  await card.click();
  await waitSheet(page);
  return { at: at - t0, onSheet: await page.evaluate((w) => (document.querySelector('#poster-canvas')?.textContent ?? '').includes(w), word) };
}

const REOPEN = [
  {
    id: 'L3-inapp-reopen-race', claims: ['LRr', 'LRo'],
    how: 'the first save held 3 s, the next 4 s; " ZQRR1"; 1 s; " ZQRR2"; at once Back inside the app (the change kept, its write queued behind the held one); at about 4 s the poster opened again from its card, its load answered with the row as it was when the load arrived, delivered 30 ms after the kept write is stored (an engineered order); then " ZQRR3": ZQRR2 not on the sheet (LRr)? the stored poster at the end without ZQRR2 (LRo: older over newer)?',
    async run(h, s) {
      const { state, id, context } = s;
      let snapshotted = 0;
      const keptStored = () => state.log.some((x) => x.method === 'PATCH' && x.status === 200 && (x.dataStr ?? '').includes('ZQRR2'));
      await context.route((u) => u.href.startsWith('https://dummy.supabase.co/rest/v1/posters') && u.searchParams.get('id') === `eq.${id}`, async (route) => {
        const req = route.request();
        if (req.method() !== 'GET' || keptStored()) return route.fallback();
        snapshotted += 1;
        const row = structuredClone(rowOf(state, id));
        const wantsObject = (req.headers().accept || '').includes('vnd.pgrst.object');
        const t = Date.now();
        while (Date.now() - t < 15000 && !keptStored()) await sleep(20);
        await sleep(30);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(wantsObject ? row : [row]) });
      });
      const t0 = await keptBehindHeld(h, s, 'ZQRR1', 'ZQRR2');
      const re = await reopenAt(s, t0, 4000, 'ZQRR2');
      const storedAtOpen = has(state, id, 'ZQRR2');
      await typeWord(s.page, 'ZQRR3');
      await sleep(3000);
      const order = appliedOrder(state, t0, 'ZQRR1', 'ZQRR2');
      return {
        claims: { LRr: !re.onSheet, LRo: !has(state, id, 'ZQRR2') },
        numbers: { snapshotted, reopenAtMs: re.at, onSheet: re.onSheet, storedAtOpen, applied: order.text, stored: `${has(state, id, 'ZQRR1') ? '1' : ''}${has(state, id, 'ZQRR2') ? '2' : ''}${has(state, id, 'ZQRR3') ? '3' : ''}` },
      };
    },
  },
  {
    id: 'L3-inapp-reopen-natural', claims: ['LRr', 'LRo'],
    how: 'the control: the same, the load answered at once (the kept write still held): ZQRR5 on the sheet (LRr: not)? stored at the end, nothing older over it (LRo)?',
    async run(h, s) {
      const { state, id } = s;
      const t0 = await keptBehindHeld(h, s, 'ZQRR4', 'ZQRR5');
      const re = await reopenAt(s, t0, 4000, 'ZQRR5');
      await typeWord(s.page, 'ZQRR6');
      await sleep(6000);
      const order = appliedOrder(state, t0, 'ZQRR4', 'ZQRR5');
      return {
        claims: { LRr: !re.onSheet, LRo: !has(state, id, 'ZQRR5') || order.olderAfter },
        numbers: { onSheet: re.onSheet, applied: order.text, stored: `${has(state, id, 'ZQRR4') ? '4' : ''}${has(state, id, 'ZQRR5') ? '5' : ''}${has(state, id, 'ZQRR6') ? '6' : ''}` },
      };
    },
  },
];

// ------------------------------------------------------------------ R2-4: the dashboard's own actions while a change is kept

/** The change kept by the closed editor: every save refused (500), `word` typed, 3 s, Back inside the app; its card on the dashboard. */
async function keptThenDashboard(h, s, word) {
  await WAYS.inapp.prepare(h, s);
  const { page, state, id } = s;
  state.faults.patch = 'server';
  await typeWord(page, word);
  await sleep(3000);
  await page.goBack().catch(() => {});
  const card = page.locator(`a[href="/p/${id}"]`).first();
  await card.waitFor({ timeout: 30000 });
  await card.hover();
}

const DASHBOARD = [
  {
    id: 'L3-inapp-kept-then-delete', claims: ['LDr', 'LDd'],
    how: 'every save refused by the server (500); " ZQDL" typed; 3 s; Back inside the app to the dashboard (the change kept); the poster deleted from its card (Delete, confirmed; the cell answers the DELETE, which the fake does not model); the server accepts saves again; 15 s: does the closed editor go on writing a poster that is gone (LDr: two or more writes after the delete), and does closing the tab still ask to leave (LDd: a warning for nothing)?',
    async run(h, s) {
      await recordWrites(s);
      const { page, state, id, context } = s;
      await context.route((u) => u.href.startsWith('https://dummy.supabase.co/rest/v1/posters') && u.searchParams.get('id') === `eq.${id}`, async (route) => {
        if (route.request().method() !== 'DELETE') return route.fallback();
        state.rows = state.rows.filter((r) => r.id !== id);
        state.log.push({ t: Date.now(), method: 'DELETE', path: '/rest/v1/posters', status: 204 });
        return route.fulfill({ status: 204, headers: CORS, body: '' });
      });
      const dialogs = watchDialogs(page);
      await keptThenDashboard(h, s, 'ZQDL');
      await page.getByRole('button', { name: /^Delete / }).first().click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      const tDel = Date.now();
      await sleep(500);
      const deleted = !state.rows.some((r) => r.id === id);
      state.faults.patch = 'ok';
      await sleep(15000);
      const after = state.log.filter((x) => x.method === 'PATCH' && x.t >= tDel && (x.dataStr ?? '').includes('ZQDL'));
      const before = dialogs.n;
      await page.close({ runBeforeUnload: true });
      await sleep(800);
      return {
        claims: { LDr: after.length >= 2, LDd: dialogs.n > before },
        numbers: { deleted, patchesAfterDelete: JSON.stringify(after.map((x) => `${x.status}@${x.t - tDel}`)), dialogAtClose: dialogs.n - before },
      };
    },
  },
  {
    id: 'L3-inapp-kept-then-duplicate', info: true,
    how: 'information: every save refused (500); " ZQDU" typed; 3 s; Back inside the app; the dashboard\'s Duplicate on its card: does the copy hold ZQDU (the kept change)?',
    async run(h, s) {
      const { page, state, id } = s;
      watchDialogs(page);
      await keptThenDashboard(h, s, 'ZQDU');
      const n0 = state.rows.length;
      await page.getByRole('button', { name: /^Duplicate / }).first().click();
      await sleep(3000);
      const copy = state.rows.length > n0 ? state.rows[state.rows.length - 1] : null;
      return { numbers: { copyMade: !!copy, copyHasWord: copy ? JSON.stringify(copy.data).includes('ZQDU') : null, originalStoredHasWord: has(state, id, 'ZQDU') } };
    },
  },
];

export const LEAVE_ROUND2 = [...TRACED, ...ASK, ...REOPEN, ...DASHBOARD];
