#!/usr/bin/env node
/**
 * account-change-check.mjs — does the editor keep one user's poster, or write
 * one user's work into another account, when the signed-in account changes?
 * Measured against a REAL local Supabase stack, not a fake backend
 * (docs/fixes/23-new-poster-owner-only.md, step 10 critic gaps G2, G5, G6).
 *
 * Why a real stack. Every earlier browser claim for fix 23 went through one
 * fake backend (lib/guestBackend.mjs). It does not model refresh-token
 * rotation, a global sign-out, storage policies (its storage answers 404 to
 * everything), GoTrue's updateUser, or links that sign a browser in
 * (detectSessionInUrl). Here the app's own Vite server talks to GoTrue,
 * PostgREST and Storage on 127.0.0.1, with the repo's migrations applied.
 * Nothing in the app is stubbed and no fake is installed: the only network
 * handling is a recorder, a guard that aborts anything that is not the dev
 * server or the local stack, and, in the race scenarios, a HOLD that delays a
 * request until another tab has signed in (it never edits a request).
 *
 * Users are made through the app where it can: a guest by opening /p/new, a
 * sign-in through /auth, a recovery link through /auth's "Forgot password?",
 * a conversion through /auth's Sign up. The service key is used only to
 * create fixtures (a permanent user, a stranger's shared poster, a base64
 * image written into a poster, a poster's age), to delete the shared
 * posters it made, and to read rows and storage objects back.
 *
 * CLAIMS (a defect when observed)
 *   P1  the storage policy accepts, with user B's token, an upload into user
 *       A's folder (a new object, or an overwrite), or signs a URL for A's
 *       object (API level: the claim in Editor.tsx's migration comment).
 *   H2  a guest who opens another user's SHARED poster by its editor link,
 *       /p/<id>, gets it: the editor, its content in the page or the store,
 *       an upload into the guest's folder, or a write to any row.
 *   N1  a new guest at /p/new is put into another user's shared poster (or
 *       gets no editor at all: "Poster not found" also counts).
 *   N2  a returning guest at /p/new, whose own poster is older than a
 *       stranger's shared one, is put into the stranger's poster (or gets no
 *       editor).
 *   AC  tab 1 edits guest A's poster; tab 2 signs in to account B through
 *       /auth: tab 1 still shows A's poster, or anything of A's poster is
 *       written to B's rows or lands in B's storage folder. ap: the same with
 *       A a permanent account signed in through /auth.
 *   DL  on the page the fix shows after AC (the poster closed), "Download a
 *       copy" gives a .postr without the text typed before the change or
 *       without the image uploaded before it. Not applicable where the page
 *       does not exist (main keeps the editor). Judged at once (after AC and
 *       SO), and in dl2 51 minutes later on the page's clock (Playwright
 *       clock), past the 50-minute signed-URL cache in posterImages.ts: the
 *       image must then be signed again, with B's session.
 *   G1  a sign-in to B lands while A's poster (with base64 images) loads:
 *       A's images land in B's storage folder.
 *   TH  a sign-in to B lands between A's save and its thumbnail capture:
 *       A's thumbnail lands in B's folder (TH1), or an upload into A's
 *       folder is accepted with B's token (TH2).
 *   SO  a sign-out in another tab (/debug's supabase.auth.signOut(), scope
 *       global; the last step of account deletion is the same call): tab 1
 *       keeps A's poster open under the new session, or writes as it.
 *       so2: A signs out everywhere from ANOTHER device (POST /logout
 *       ?scope=global with A's token). Tab 1's access token keeps working
 *       (its next save is recorded) until GoTrue refuses the ended session
 *       (GET /user 403 session_not_found, or a refresh 400); judged then.
 *   RL  a link that signs account B in, opened in A's browser (the session
 *       from the URL replaces A's; supabase-js detectSessionInUrl): as AC.
 *       rl: a password-recovery link, asked for on /auth ("Forgot
 *       password?"); ml: a magic link, asked for through the Auth API (the app
 *       has no magic-link form); cf: the sign-up confirmation link of a new
 *       account B (skipped when the stack confirms e-mail automatically).
 *   PW  the paywall path, /auth?plan=term then "Sign in" to existing account
 *       B, while tab 1 edits A's poster: as AC.
 *   CV  a guest who converts in place in another tab (/auth, Sign up: GoTrue
 *       updateUser, same user id; with confirmations on, the link in the
 *       e-mail is opened in tab 2) has the poster closed, or loses saves (a
 *       regression the fix could bring; not a user change).
 *   RF  (only when the stack's jwt_expiry is at most 180 s; skipped
 *       otherwise) refresh tokens rotated by two tabs for RF_WAIT_MS: a
 *       refresh fails (reuse), or the poster closes on a token refresh for
 *       the same user.
 * CONTROLS (a failed control stops the verdict, exit 2)
 *   K00 the stack holds no shared poster before the run (a build without the
 *       owner filter would open it at every /p/new); the shared posters this
 *       run makes are deleted after each scenario.
 *   K0  every Supabase request went to the local stack (none to any other
 *       host), and at least one did.
 *   K1  a guest's own poster: typing saves (200, as the guest), an uploaded
 *       image lands in the guest's folder, the thumbnail lands there too.
 *   K2  A's poster with base64 images, no user change: the migration puts
 *       them in A's folder.
 *   Each account-change scenario also needs its change to have happened
 *   (tab 2 reached B's session; the recovery link signed the browser in).
 *
 * NOT MEASURABLE HERE: Google sign-in and linkIdentity (need Google);
 * account deletion's API step (apps/api is not run; only its final
 * signOut({ scope: 'global' }) is, as SO); e-mail as production sends it
 * (production's auth settings are not read here; cf and CV's link need
 * auth.email.enable_confirmations = true in the stack).
 *
 * STACK. A local stack started from a COPY of the repo's supabase/ folder
 * (never edit the tracked config), with these changes in the copy's
 * config.toml:
 *   [api] auto_expose_new_tables = true — Supabase CLI 2.110 no longer grants
 *       new public tables to anon/authenticated; without it every posters
 *       request is "permission denied" (the migrations rely on the grants
 *       the hosted project was created with);
 *   [auth] site_url = "http://127.0.0.1:<PORT>" and additional_redirect_urls
 *       including "http://127.0.0.1:<PORT>/**", so e-mailed links land on the
 *       app under test;
 *   [auth.rate_limit] email_sent, anonymous_users, sign_in_sign_ups,
 *       token_refresh, token_verifications raised (a run makes ~40 guests);
 *   optional: [auth] jwt_expiry = 120 (runs RF, and makes refreshes happen
 *       during every scenario); [auth.email] enable_confirmations = true
 *       (runs cf, and CV's confirmation link); a distinct project_id keeps
 *       the stack apart from any other.
 *
 * RUN (from apps/web of the tree to test):
 *   supabase start --workdir <copy>          # 127.0.0.1:54321
 *   set -a; eval "$(supabase status -o env --workdir <copy>)"; set +a
 *   POSTR_REPO=<tree> node <path>/account-change-check.mjs [--only id,id]
 *   env API_URL (or SUPABASE_URL), PUBLISHABLE_KEY (or ANON_KEY),
 *       SERVICE_ROLE_KEY, MAILPIT_URL (or INBUCKET_URL), PORT (default 5461),
 *       OUT_DIR, POSTR_REPO, RF_WAIT_MS (default 150000)
 *   Set PORT to the port in the stack's site_url. A link requested outside
 *   the app's page (ml asks GoTrue from Node; cf's confirmation by the same
 *   path) lands on site_url, so on any other port the account never changes
 *   and the scenario reads "n/a: precondition failed", exit 2. rl, asked
 *   from the page, followed the page's port in the one run on another port
 *   (5465; step 9 round 4's run, read in round 5).
 * The Supabase URL must be 127.0.0.1, localhost or [::1], and the service
 * key must not carry a project ref (production keys do): otherwise it
 * refuses to run (exit 2). The keys go to the in-process Vite server as
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY environment variables,
 * which Vite prefers over apps/web/.env; nothing is written to the tree
 * except Vite's build stamp.
 * It refuses to start while the stack holds a shared poster (K00): reset
 * the stack (supabase db reset --local --workdir <copy>) after an
 * interrupted run.
 * EXIT 0 no claim observed · 1 a claim observed · 2 a control failed, or
 *      the instrument refused or errored
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore it afterwards (git checkout, or the copy you kept).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    process.stderr.write(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 800)}\n`);
    process.exit(2);
  });
}
const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ config
const env = process.env;
const API_URL = (env.API_URL ?? env.SUPABASE_URL ?? '').replace(/\/$/, '');
const PUBLISHABLE = env.PUBLISHABLE_KEY ?? env.ANON_KEY ?? '';
const SERVICE = env.SERVICE_ROLE_KEY ?? '';
const MAIL = (env.MAILPIT_URL ?? env.INBUCKET_URL ?? '').replace(/\/$/, '');
const PORT = Number(env.PORT ?? 5461);
const RF_WAIT_MS = Number(env.RF_WAIT_MS ?? 150000);

const isLocal = (u) => {
  try {
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(u).hostname);
  } catch {
    return false;
  }
};
const jwtClaims = (token) => {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString()); } catch { return null; }
};
function refuse(why) {
  log(`[harness] REFUSED: ${why}`);
  process.exit(2);
}
if (!API_URL || !isLocal(API_URL)) refuse(`the Supabase URL must be a local stack (127.0.0.1, localhost or [::1]); got "${API_URL || '(unset)'}"`);
if (!PUBLISHABLE || !SERVICE) refuse('PUBLISHABLE_KEY (or ANON_KEY) and SERVICE_ROLE_KEY must be set (supabase status -o env)');
if (jwtClaims(SERVICE)?.ref || jwtClaims(PUBLISHABLE)?.ref) refuse('a key carries a project ref: that is a hosted project, not a local stack');
if (MAIL && !isLocal(MAIL)) refuse(`the mail catcher must be local; got "${MAIL}"`);
// The app reads these through Vite, which prefers the environment over .env.
env.VITE_SUPABASE_URL = API_URL;
env.VITE_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(env.POSTR_REPO ?? path.resolve(HERE, '../../..'));
if (!fs.existsSync(path.join(REPO, 'apps/web/scripts/lib/editorHarness.mjs'))) refuse(`no apps/web/scripts/lib/editorHarness.mjs under ${REPO}: set POSTR_REPO`);
env.POSTR_REPO = REPO;
const { startHarness } = await import(pathToFileURL(path.join(REPO, 'apps/web/scripts/lib/editorHarness.mjs')).href);
const { unzipSync } = await import(pathToFileURL(path.join(REPO, 'node_modules/fflate/esm/index.mjs')).href);

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;
const STORAGE_KEY = `sb-${new URL(API_URL).hostname.split('.')[0]}-auth-token`;
const RUN = Date.now().toString(36);

// ------------------------------------------------------------ fixtures (service key)
const ADMIN = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
async function api(pathname, { method = 'GET', body, headers = {}, key = null, raw = false } = {}) {
  const h = key ? { apikey: PUBLISHABLE, Authorization: `Bearer ${key}` } : ADMIN;
  const isBytes = body instanceof Uint8Array || Buffer.isBuffer(body);
  const res = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { ...h, ...(body && !isBytes ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : isBytes ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (raw) return { status: res.status, json, text: text.slice(0, 300) };
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}
const admin = {
  createUser: (email, password) => api('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true } }),
  poster: async (id) => (await api(`/rest/v1/posters?select=*&id=eq.${id}`))[0] ?? null,
  postersOf: (uid) => api(`/rest/v1/posters?select=id,user_id,title,updated_at,thumbnail_path,data&user_id=eq.${uid}`),
  insertPoster: async (row) => (await api('/rest/v1/posters', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }))[0],
  deletePosters: async (ids) => (ids.length ? api(`/rest/v1/posters?id=in.(${ids.join(',')})`, { method: 'DELETE' }) : null),
  sharedCount: async () => (await api('/rest/v1/posters?select=id&is_public=eq.true')).length,
  patchPoster: (id, patch) => api(`/rest/v1/posters?id=eq.${id}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }),
  upload: (objPath, bytes, type) => api(`/storage/v1/object/poster-assets/${objPath}`, { method: 'POST', body: bytes, headers: { 'content-type': type, 'x-upsert': 'true' } }),
  /** Every object under `<uid>/` in poster-assets: path -> updated_at. */
  async objects(uid) {
    const out = {};
    const walk = async (prefix, depth) => {
      const items = await api('/storage/v1/object/list/poster-assets', { method: 'POST', body: { prefix, limit: 1000, offset: 0 } });
      for (const it of items ?? []) {
        const p = `${prefix}/${it.name}`;
        if (it.id === null && depth < 4) await walk(p, depth + 1); else out[p] = it.updated_at;
      }
    };
    if (uid) await walk(uid, 0);
    return out;
  },
};
const newObjects = (before, after) => Object.keys(after).filter((k) => before[k] !== after[k]);

/** A small valid PNG (w × h, one colour), made here so no file is read. */
function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) rows.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const PNG_A = makePng(64, 48, [200, 30, 30]);
const PNG_B64 = makePng(40, 40, [30, 30, 200]);
const DATA_URL = `data:image/png;base64,${PNG_B64.toString('base64')}`;

// ------------------------------------------------------------------ mail
/** The first GoTrue verify link (recovery, magic link) mailed to `to` since `since`. */
async function verifyLink(to, since, timeout = 20000) {
  if (!MAIL) return null;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((x) => x.json()).catch(() => null);
    const msg = (r?.messages ?? []).find((m) => Date.parse(m.Created) >= since - 2000);
    if (msg) {
      const full = await fetch(`${MAIL}/api/v1/message/${msg.ID}`).then((x) => x.json());
      const m = /(https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+)/.exec(`${full.Text ?? ''} ${full.HTML ?? ''}`);
      if (m) return m[1].replace(/&amp;/g, '&');
    }
    await sleep(500);
  }
  return null;
}

// ------------------------------------------------------------------ browser
/**
 * A browser profile (one context: tabs share storage and supabase-js's
 * broadcast channel, as tabs of one browser do), with every request to the
 * stack recorded: tab, method, path, the JWT's user, status, and for poster
 * writes which markers the body carried.
 */
async function newProfile(h, markers = []) {
  const T0 = Date.now();
  const context = await h.browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const tabs = new Map(); // page -> name
  const net = [];
  const offsite = [];
  const holds = [];
  const errors = [];
  const byReq = new Map();
  const tabOf = (req) => { try { return tabs.get(req.frame().page()) ?? '?'; } catch { return '?'; } };
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(h.base) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    if (u.startsWith(API_URL)) {
      const hold = holds.find((x) => !x.taken && x.armed && x.match(req, tabOf(req)));
      if (hold) {
        hold.taken = true;
        hold.caught = `${tabOf(req)} ${req.method()} ${new URL(u).pathname}${new URL(u).search.slice(0, 80)}`;
        hold.onCaught();
        await hold.released;
      }
      return route.continue();
    }
    offsite.push(u.slice(0, 120));
    return route.abort();
  });
  context.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(API_URL)) return;
    const url = new URL(u);
    const auth = req.headers().authorization || '';
    const claims = jwtClaims(auth.replace(/^Bearer\s+/i, ''));
    const e = {
      t: Date.now() - T0, tab: tabOf(req), method: req.method(), path: url.pathname, q: url.search.slice(0, 160),
      sub: claims?.sub ?? null, status: null,
    };
    if (url.pathname === '/auth/v1/token') e.grant = url.searchParams.get('grant_type');
    if (url.pathname.startsWith('/storage/v1/object/')) e.object = url.pathname.replace(/^\/storage\/v1\/object\/(sign\/|upload\/sign\/)?poster-assets\//, '');
    if (url.pathname === '/rest/v1/posters' && ['PATCH', 'POST'].includes(e.method)) {
      const body = req.postData() || '';
      e.markers = markers.filter((m) => body.includes(m));
      try { const b = JSON.parse(body); e.keys = Object.keys(Array.isArray(b) ? b[0] ?? {} : b); } catch { e.keys = []; }
    }
    net.push(e);
    byReq.set(req, e);
  });
  context.on('response', async (res) => {
    const e = byReq.get(res.request());
    if (!e) return;
    e.status = res.status();
    if (e.path.startsWith('/auth/v1/') && res.status() >= 400) {
      try { const j = await res.json(); e.err = j.error_code ?? j.code ?? j.msg ?? null; } catch { /* no body */ }
    }
  });
  context.on('requestfailed', (req) => { const e = byReq.get(req); if (e) e.status = `failed:${req.failure()?.errorText ?? ''}`; });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('postr.onboarding-done', 'true');
      localStorage.setItem('postr.mobile-notice-dismissed', 'true');
    } catch { /* ignore */ }
  });
  return {
    context, net, offsite, errors, T0, markers,
    async tab(name) {
      const page = await context.newPage();
      tabs.set(page, name);
      page.on('pageerror', (err) => errors.push(`${name}: ${String(err).slice(0, 200)}`));
      page.on('dialog', (d) => d.accept().catch(() => {}));
      return page;
    },
    /** Delay the first request matching `match(req, tab)` once armed, until released. */
    hold(match) {
      let onCaught;
      let release;
      const caught = new Promise((r) => { onCaught = r; });
      const released = new Promise((r) => { release = r; });
      const hd = { match, armed: false, taken: false, caught: null, onCaught, released };
      holds.push(hd);
      return { arm: () => { hd.armed = true; }, caught, release, get what() { return hd.caught; } };
    },
    close: () => context.close().catch(() => {}),
  };
}

async function waitFor(fn, { timeout = 10000, every = 100 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}
const since = (net, t) => net.filter((e) => e.t >= t);
const now = (p) => Date.now() - p.T0;

/** /p/new, for a scenario that must also see it NOT open an editor. */
async function openNewPosterOrWhat(page) {
  await page.goto(`${H.base}/p/new`);
  await page.waitForFunction(() => document.querySelector('#poster-canvas [data-block-id]') || /Poster not found|Couldn.t load|Something went wrong/.test(document.body.innerText), null, { timeout: 90000 });
  if (!(await page.$('#poster-canvas [data-block-id]'))) return { id: null, shown: (await page.evaluate(() => document.body.innerText)).trim().split('\n')[0].slice(0, 80) };
  await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await sleep(1000);
  return { id: page.url().split('/p/')[1], shown: 'the editor' };
}

async function openNewPoster(page) {
  await page.goto(`${H.base}/p/new`);
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1000);
  return page.url().split('/p/')[1];
}

/** Click the first body text block and type with the real keyboard. */
async function typeInto(page, text) {
  const block = page.locator('#poster-canvas [data-block-type="text"]').first();
  await block.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i += 1) {
    if (await page.evaluate(() => !!document.activeElement?.isContentEditable)) break;
    if (i < 2) await block.click(); else await block.locator('[contenteditable="true"]').first().click();
    await sleep(250);
  }
  if (!(await page.evaluate(() => !!document.activeElement?.isContentEditable))) throw new Error('could not focus a text block');
  await page.keyboard.press('End');
  await page.keyboard.type(text, { delay: 30 });
}

/** Choose an image file for the template's image block, as the file picker would. */
async function uploadFigure(page, png) {
  const input = page.locator('#poster-canvas [data-block-type="image"] input[type="file"]').first();
  await input.setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });
}

/** What a tab shows, and what the editor's store holds (the app's own module). */
async function tabState(page) {
  return page.evaluate(async (key) => {
    const text = document.body?.innerText ?? '';
    let st = null;
    try { st = (await import('/src/stores/posterStore.ts')).usePosterStore.getState(); } catch { /* not loaded */ }
    let session = null;
    try { session = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* none */ }
    return {
      path: location.pathname,
      editor: !!document.querySelector('#poster-canvas [data-block-id]'),
      notFound: /Poster not found/.test(text),
      closed: /This guest poster was closed/.test(text) ? 'guest poster closed' : /This poster is in another account/.test(text) ? 'in another account' : null,
      signInOffered: !!document.querySelector('main a[href="/auth"]'),
      storePosterId: st?.posterId ?? null,
      storeHasDoc: !!st?.doc,
      storeText: st?.doc ? JSON.stringify(st.doc.blocks.map((b) => b.content ?? '')).slice(0, 4000) : '',
      docTitle: document.title,
      sessionUser: session?.user?.id ?? null,
      sessionAnon: session?.user?.is_anonymous ?? null,
      pill: [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent.trim()).find((x) => /Sav/.test(x)) ?? null,
    };
  }, STORAGE_KEY);
}
const sessionOf = (page) => page.evaluate((key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, STORAGE_KEY);

/** Sign in through /auth (optionally with ?plan=). Returns where the tab ended up. */
async function signInViaAuth(page, email, password, { plan = null } = {}) {
  await page.goto(`${H.base}/auth${plan ? `?plan=${plan}` : ''}`);
  await page.waitForSelector('input[aria-label="Email address"]', { timeout: 60000 });
  const submit = page.locator('form button[type="submit"]');
  if (!/^\s*Sign in\s*$/.test(await submit.innerText())) {
    await page.locator('button:not([type="submit"])', { hasText: /^Sign in$/ }).click();
    await waitFor(async () => /^\s*Sign in\s*$/.test(await submit.innerText()), { timeout: 5000 });
  }
  await page.fill('input[aria-label="Email address"]', email);
  await page.fill('input[aria-label="Password"]', password);
  await submit.click();
  await waitFor(async () => /\/dashboard/.test(page.url()) || (await page.locator('[class*="f87171"]').count()) > 0, { timeout: 20000 });
  await sleep(500);
  const onAuth = /\/auth/.test(page.url());
  return { url: new URL(page.url()).pathname, message: onAuth ? (await page.evaluate(() => [...document.querySelectorAll('[class*="f87171"]')].map((e) => e.textContent.trim()).join(' | '))).slice(0, 160) : '' };
}

// --------------------------------------------------------------- measuring
/** Who a JWT sub is, in this scenario's words. */
function namer(known) {
  const extra = new Map();
  return (sub) => {
    if (!sub) return 'no user';
    for (const [k, v] of Object.entries(known)) if (v && v === sub) return k;
    if (!extra.has(sub)) extra.set(sub, `other${extra.size + 1}`);
    return extra.get(sub);
  };
}
/** Writes and uploads in a slice of the log, named. */
function writes(entries, name) {
  return {
    posterWrites: entries.filter((e) => e.path === '/rest/v1/posters' && ['PATCH', 'POST'].includes(e.method))
      .map((e) => `${e.tab} ${e.method} as ${name(e.sub)} -> ${e.status}${e.markers?.length ? ` [${e.markers.join(',')}]` : ''}${e.keys?.includes('thumbnail_path') ? ' (thumbnail_path)' : ''}`),
    uploads: entries.filter((e) => e.path.startsWith('/storage/v1/object/poster-assets/') && ['POST', 'PUT'].includes(e.method))
      .map((e) => `${e.tab} into ${name(e.object?.split('/')[0])}/${e.object?.split('/').slice(1).join('/')} as ${name(e.sub)} -> ${e.status}`),
    tokens: entries.filter((e) => e.path === '/auth/v1/token' || e.path === '/auth/v1/logout' || e.path === '/auth/v1/signup')
      .map((e) => `${e.tab} ${e.path.split('/').pop()}${e.grant ? `:${e.grant}` : ''} as ${name(e.sub)} -> ${e.status}${e.err ? ` ${e.err}` : ''}`),
  };
}

/** Rows and objects of the named users, with whether any row holds a marker. */
async function snapshot(users, markers) {
  const out = {};
  for (const [label, uid] of Object.entries(users)) {
    if (!uid) continue;
    const rows = await admin.postersOf(uid);
    out[label] = {
      rows: rows.length,
      rowsWithMarkers: rows.map((r) => markers.filter((m) => JSON.stringify(r.data).includes(m))).filter((m) => m.length).map((m) => m.join('+')),
      objects: await admin.objects(uid),
    };
  }
  return out;
}
/** Objects new or rewritten since `before`, per user label, without the user folder. */
function objectDiff(before, after) {
  const out = {};
  for (const label of Object.keys(after)) out[label] = newObjects(before[label]?.objects ?? {}, after[label].objects).map((p) => p.split('/').slice(1).join('/'));
  return out;
}

/** The .postr the closed page's "Download a copy" gives. */
async function downloadCopy(page) {
  const button = page.getByRole('button', { name: 'Download a copy' });
  if (!(await button.count())) return { offered: false };
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), button.click()]);
  if (!dl) return { offered: true, name: null, poster: '', assets: [], status: await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '') };
  const file = path.join(H.out, `download-${randomUUID().slice(0, 8)}.postr`);
  await dl.saveAs(file);
  const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const poster = new TextDecoder().decode(files['poster.json'] ?? new Uint8Array());
  const assets = Object.keys(files).filter((k) => k.startsWith('assets/'));
  return { offered: true, name: dl.suggestedFilename(), poster, assets: assets.map((k) => ({ k, sha: sha(Buffer.from(files[k])) })) };
}

// -------------------------------------------------------------- scenarios
/** Shared posters this run made; deleted after each scenario, so a build that
 *  opens any shared poster at /p/new (main before fix 23) is not sent into a
 *  leftover one in the next scenario. */
const FIXTURE_POSTERS = [];
const EMAIL = (tag) => `jane.doe+${tag}-${RUN}-${randomUUID().slice(0, 6)}@example.test`;
const PASSWORD = 'Sample-Pass-1234';
async function permanentUser(tag) {
  const email = EMAIL(tag);
  const u = await admin.createUser(email, PASSWORD);
  return { id: u.id, email };
}

/** A stranger's shared poster: a permanent user's row, public, with a stored and a base64 image. */
async function strangersSharedPoster(updatedAt) {
  const s = await permanentUser('stranger');
  const imgId = `img-${randomUUID().slice(0, 8)}`;
  const b64Id = `b64-${randomUUID().slice(0, 8)}`;
  const posterId = randomUUID();
  const objPath = `${s.id}/${posterId}/${imgId}.png`;
  await admin.upload(objPath, PNG_A, 'image/png');
  const doc = {
    version: 1, widthIn: 48, heightIn: 36, fontFamily: 'Source Sans 3',
    palette: { bg: '#FFFFFF', primary: '#1a1a2e', accent: '#0f4c75', accent2: '#3282b8', muted: '#6c757d', headerBg: '#0f4c75', headerFg: '#fff' },
    styles: {
      title: { size: 22, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
      heading: { size: 8, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
      authors: { size: 5, weight: 400, italic: false, lineHeight: 1.5, color: null, highlight: null },
      body: { size: 5, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [], authors: [], references: [],
    blocks: [
      { id: 'st-title', type: 'title', x: 10, y: 10, w: 300, h: 40, content: 'ZQSTRANGER Shared findings' },
      { id: 'st-text', type: 'text', x: 10, y: 60, w: 150, h: 80, content: '<p>ZQSTRANGERTEXT body</p>' },
      { id: imgId, type: 'image', x: 170, y: 60, w: 100, h: 80, imageSrc: `storage://${objPath}` },
      { id: b64Id, type: 'image', x: 170, y: 150, w: 100, h: 80, imageSrc: DATA_URL },
    ],
  };
  FIXTURE_POSTERS.push(posterId);
  const row = await admin.insertPoster({
    id: posterId, user_id: s.id, title: 'ZQSTRANGER shared poster', data: doc, is_public: true,
    share_slug: `zq${randomUUID().slice(0, 8)}`, updated_at: updatedAt,
  });
  return { stranger: s, row, objPath };
}

/** Tab 1: a new guest's poster, typed into and saved. */
async function guestEditing(p, M1, { clock = false, signIn = null } = {}) {
  const tab1 = await p.tab('tab1');
  // A clock the scenario can move forward (DL2), running at real speed until then.
  if (clock) await tab1.clock.install();
  // A permanent owner instead of a guest: signed in through /auth first.
  if (signIn) await signInViaAuth(tab1, signIn.email, signIn.password);
  const posterId = await openNewPoster(tab1);
  const t = now(p);
  await typeInto(tab1, ` ${M1}`);
  const save = await waitFor(() => since(p.net, t).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M1) && e.status));
  const row = await admin.poster(posterId);
  return { tab1, posterId, A: row?.user_id ?? null, save: save?.status ?? null };
}

/**
 * The account-change body shared by AC, SO, RL, PW: tab 1 edits guest A's
 * poster (with an uploaded figure), `change(p)` changes the account in this
 * browser, then tab 1 is read, typed into if the editor is still there, and
 * rows and objects are compared.
 */
async function accountChange(p, { change, B = null, download = false, laterMs = 0, signIn = null }) {
  const M1 = `ZQM1${randomUUID().slice(0, 6)}`;
  const M2 = `ZQM2${randomUUID().slice(0, 6)}`;
  p.markers.push(M1, M2);
  const { tab1, posterId, A, save } = await guestEditing(p, M1, { clock: laterMs > 0, signIn });
  // A figure, uploaded into A's folder, and stored in the row by autosave.
  const tUp = now(p);
  await uploadFigure(tab1, PNG_A);
  const up = await waitFor(() => since(p.net, tUp).find((e) => e.tab === 'tab1' && e.path.startsWith('/storage/v1/object/poster-assets/') && e.method !== 'GET' && e.status));
  const stored = await waitFor(async () => (JSON.stringify((await admin.poster(posterId))?.data ?? {}).includes(`storage://${A}/`) ? true : null), { timeout: 10000 });
  await sleep(1500);
  const before = await snapshot({ A, B }, [M1, M2]);
  const tChange = now(p);
  const changed = await change(p, { A });
  await sleep(4000);
  const after1 = await tabState(tab1);
  if (after1.sessionUser && after1.sessionUser !== A && after1.sessionUser !== (B ?? changed.known?.B)) changed.known = { ...(changed.known ?? {}), C: after1.sessionUser };
  const name = namer({ A, B, ...(changed?.known ?? {}) });
  let typedAfter = null;
  if (after1.editor) {
    const t = now(p);
    await typeInto(tab1, ` ${M2}`).catch((e) => { typedAfter = `could not type: ${String(e).slice(0, 80)}`; });
    const w = await waitFor(() => since(p.net, t).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M2) && e.status), { timeout: 8000 });
    typedAfter = typedAfter ?? (w ? `saved as ${name(w.sub)} -> ${w.status}` : 'no save sent');
    await sleep(1500);
  }
  if (laterMs && after1.closed) await tab1.clock.fastForward(laterMs);
  const dl = download && after1.closed ? await downloadCopy(tab1) : null;
  await sleep(2500);
  const after = await snapshot({ A, B, ...(changed?.known ?? {}) }, [M1, M2]);
  const final = await tabState(tab1);
  return {
    posterId, A, B, save, figureUpload: up ? `${name(up.sub)} -> ${up.status}` : null, figureStored: !!stored,
    change: changed?.summary ?? null, changeHappened: !!changed?.ok,
    tab1: { editor: after1.editor, closed: after1.closed, signInOffered: after1.signInOffered, notFound: after1.notFound, storeHasDoc: after1.storeHasDoc, storeHoldsM1: after1.storeText.includes(M1), docTitle: after1.docTitle, session: name(after1.sessionUser), pill: after1.pill },
    typedAfter, pillAfter: final.pill,
    ...writes(since(p.net, tChange), name),
    newObjects: objectDiff(before, after),
    rows: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { rows: v.rows, withMarkers: v.rowsWithMarkers }])),
    aRowHoldsM1: after.A?.rowsWithMarkers.some((m) => m.includes(M1)) ?? false,
    download: dl && (dl.offered ? { offered: true, name: dl.name, holdsM1: dl.poster.includes(M1), holdsM2: dl.poster.includes(M2), assets: dl.assets, figureSha: sha(PNG_A), figureIncluded: dl.assets.some((a) => a.sha === sha(PNG_A)) } : { offered: false }),
    M1, M2, name,
  };
}
/** Did anything of A's poster reach an account that is not A's? */
function crossAccount(r) {
  const leaks = [];
  for (const [label, objs] of Object.entries(r.newObjects)) if (label !== 'A') for (const o of objs) if (o.includes(r.posterId)) leaks.push(`object ${label}/${o}`);
  for (const [label, v] of Object.entries(r.rows)) if (label !== 'A') for (const m of v.withMarkers) leaks.push(`row of ${label} holds ${m}`);
  for (const u of r.uploads) if (/-> 20\d/.test(u) && !/ into A\//.test(u) && u.includes(r.posterId)) leaks.push(`upload ${u}`);
  for (const u of r.uploads) if (/-> 20\d/.test(u) && / into A\//.test(u) && !/ as A -> /.test(u)) leaks.push(`upload into A's folder by another user: ${u}`);
  return leaks;
}
const acDefect = (r) => r.tab1.editor || r.tab1.storeHoldsM1 && !r.tab1.closed || crossAccount(r).length > 0;

const SCENARIOS = [
  {
    id: 'k0-k1-own-poster', control: true,
    async run(p) {
      const M1 = `ZQK1${randomUUID().slice(0, 6)}`;
      p.markers.push(M1);
      const { tab1, posterId, A, save } = await guestEditing(p, M1);
      const t = now(p);
      await uploadFigure(tab1, PNG_A);
      const up = await waitFor(() => since(p.net, t).find((e) => e.path.startsWith('/storage/v1/object/poster-assets/') && e.method !== 'GET' && e.status));
      const thumb = await waitFor(async () => Object.keys(await admin.objects(A)).find((k) => k.endsWith(`${posterId}/thumbnail.jpg`)), { timeout: 20000 });
      await waitFor(async () => JSON.stringify((await admin.poster(posterId))?.data ?? {}).includes(`storage://${A}/${posterId}/`), { timeout: 10000 });
      const row = await admin.poster(posterId);
      const name = namer({ A });
      return {
        posterId, save, upload: up ? `${up.object?.startsWith(A) ? 'into A' : 'elsewhere'} as ${name(up.sub)} -> ${up.status}` : null,
        storedM1: JSON.stringify(row?.data ?? {}).includes(M1), storedFigure: JSON.stringify(row?.data ?? {}).includes(`storage://${A}/${posterId}/`),
        thumbnail: thumb ? 'in A/' : null, thumbnailPath: row?.thumbnail_path ? 'set' : null,
        tab1: await tabState(tab1).then((s) => ({ editor: s.editor, storeIsUrl: s.storePosterId === posterId, pill: s.pill })),
      };
    },
    pass: (r) => r.save === 200 && /into A as A -> 200/.test(r.upload ?? '') && r.storedM1 && r.storedFigure && r.thumbnail && r.tab1.storeIsUrl,
  },
  {
    id: 'p1-storage-policy', claim: 'P1',
    async run() {
      // Two real sessions from the Auth API with the publishable key, as the app gets them.
      const guest = await api('/auth/v1/signup', { method: 'POST', body: {}, key: PUBLISHABLE, raw: true });
      const B = await permanentUser('policyB');
      const bSess = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: B.email, password: PASSWORD }, key: PUBLISHABLE, raw: true });
      const aTok = guest.json?.access_token;
      const bTok = bSess.json?.access_token;
      const A = jwtClaims(aTok)?.sub;
      const pid = randomUUID();
      const put = (tok, p, upsert = true) => api(`/storage/v1/object/poster-assets/${p}`, { method: 'POST', key: tok, body: PNG_A, headers: { 'content-type': 'image/png', 'x-upsert': String(upsert) }, raw: true });
      const own = await put(aTok, `${A}/${pid}/fig.png`);
      const bNew = await put(bTok, `${A}/${pid}/thumbnail.jpg`);
      const bOverwrite = await put(bTok, `${A}/${pid}/fig.png`);
      const bSign = await api(`/storage/v1/object/sign/poster-assets/${A}/${pid}/fig.png`, { method: 'POST', key: bTok, body: { expiresIn: 60 }, raw: true });
      const aSign = await api(`/storage/v1/object/sign/poster-assets/${A}/${pid}/fig.png`, { method: 'POST', key: aTok, body: { expiresIn: 60 }, raw: true });
      const objs = await admin.objects(A);
      return {
        control_ownUpload: own.status, control_ownSign: aSign.status,
        bUploadNewIntoA: `${bNew.status} ${bNew.json?.message ?? bNew.json?.error ?? ''}`.trim(),
        bOverwriteInA: `${bOverwrite.status} ${bOverwrite.json?.message ?? bOverwrite.json?.error ?? ''}`.trim(),
        bSignA: `${bSign.status} ${bSign.json?.message ?? bSign.json?.error ?? ''}`.trim(),
        aFolder: Object.keys(objs).map((k) => k.split('/').pop()),
      };
    },
    needs: (r) => r.control_ownUpload === 200 && r.control_ownSign === 200,
    defect: (r) => /^20\d/.test(r.bUploadNewIntoA) || /^20\d/.test(r.bOverwriteInA) || /^20\d/.test(r.bSignA) || r.aFolder.includes('thumbnail.jpg'),
  },
  {
    id: 'h2-editor-link-to-shared', claim: 'H2',
    async run(p) {
      const { stranger, row } = await strangersSharedPoster(new Date().toISOString());
      const tab1 = await p.tab('tab1');
      await tab1.goto(`${H.base}/p/${row.id}`);
      await tab1.waitForFunction(() => document.querySelector('#poster-canvas [data-block-id]') || /Poster not found/.test(document.body.innerText), null, { timeout: 90000 });
      await sleep(6000);
      const s = await tabState(tab1);
      const A = (await sessionOf(tab1))?.user?.id ?? null;
      const name = namer({ A, S: stranger.id });
      const after = await admin.poster(row.id);
      return {
        editor: s.editor, notFound: s.notFound, strangerInDom: await tab1.evaluate(() => /ZQSTRANGER/.test(document.body.innerText)),
        strangerInStore: s.storePosterId === row.id || /ZQSTRANGER/.test(s.storeText), docTitle: s.docTitle,
        ...writes(p.net, name),
        // POST .../sign/... asks for a signed URL (the session's policy decides);
        // GET .../sign/...?token= fetches through one (no session involved).
        signAttempts: p.net.filter((e) => e.method === 'POST' && e.path.startsWith('/storage/v1/object/sign/')).map((e) => `${name(e.object?.split('/')[0])}/… as ${name(e.sub)} -> ${e.status}`),
        objectsInA: Object.keys(await admin.objects(A)).map((k) => k.split('/').slice(1).join('/')),
        strangerRowChanged: after.updated_at !== row.updated_at || JSON.stringify(after.data) !== JSON.stringify(row.data),
        aRows: (await admin.postersOf(A)).length,
      };
    },
    defect: (r) => r.editor || r.strangerInDom || r.strangerInStore || r.objectsInA.length > 0 || r.posterWrites.length > 0 || r.strangerRowChanged,
  },
  {
    id: 'n1-new-guest-p-new', claim: 'N1',
    async run(p) {
      const { stranger, row } = await strangersSharedPoster(new Date().toISOString());
      const tab1 = await p.tab('tab1');
      const got = await openNewPosterOrWhat(tab1);
      await sleep(4000);
      const A = (await sessionOf(tab1))?.user?.id ?? null;
      const opened = got.id ? await admin.poster(got.id) : null;
      const name = namer({ A, S: stranger.id });
      return {
        opened: opened ? name(opened.user_id) : `no editor: "${got.shown}"`, docTitle: (await tabState(tab1)).docTitle, ...writes(p.net, name),
        objectsInA: Object.keys(await admin.objects(A)).map((k) => k.split('/').slice(1).join('/')),
        strangerRowChanged: (await admin.poster(row.id)).updated_at !== row.updated_at, aRows: (await admin.postersOf(A)).length,
      };
    },
    defect: (r) => r.opened !== 'A',
  },
  {
    id: 'n2-returning-guest-p-new', claim: 'N2',
    async run(p) {
      const tab1 = await p.tab('tab1');
      const own = await openNewPoster(tab1);
      const A = (await sessionOf(tab1))?.user?.id ?? null;
      await admin.patchPoster(own, { updated_at: new Date(Date.now() - 5 * 86400e3).toISOString() });
      const { stranger } = await strangersSharedPoster(new Date().toISOString());
      await tab1.goto(`${H.base}/`);
      const got = await openNewPosterOrWhat(tab1);
      const name = namer({ A, S: stranger.id });
      return { ownPoster: own === got.id, opened: got.id ? name((await admin.poster(got.id))?.user_id) : `no editor: "${got.shown}"`, docTitle: (await tabState(tab1)).docTitle };
    },
    defect: (r) => r.opened !== 'A',
  },
  {
    id: 'ac-signin-other-tab', claim: 'AC', download: true,
    async run(p) {
      const B = await permanentUser('acB');
      return accountChange(p, {
        B: B.id, download: true,
        async change(pp) {
          const tab2 = await pp.tab('tab2');
          const r = await signInViaAuth(tab2, B.email, PASSWORD);
          const s = await sessionOf(tab2);
          return { ok: s?.user?.id === B.id, summary: `tab2 /auth sign-in -> ${r.url}` };
        },
      });
    },
    needs: (r) => r.changeHappened && r.save === 200 && r.figureStored,
    defect: (r) => acDefect(r),
    extra: (r) => (r.download && r.download.offered ? { claim: 'DL', observed: !(r.download.holdsM1 && r.download.figureIncluded) } : { claim: 'DL', observed: null, note: r.download ? 'no Download button' : 'no closed page (the editor stayed)' }),
  },
  {
    id: 'ap-permanent-owner', claim: 'AC', download: true,
    async run(p) {
      const A0 = await permanentUser('apA');
      const B = await permanentUser('apB');
      return accountChange(p, {
        B: B.id, download: true, signIn: { email: A0.email, password: PASSWORD },
        async change(pp) {
          const tab2 = await pp.tab('tab2');
          const r = await signInViaAuth(tab2, B.email, PASSWORD);
          return { ok: (await sessionOf(tab2))?.user?.id === B.id, summary: `permanent owner A; tab2 /auth sign-in to B -> ${r.url}` };
        },
      });
    },
    needs: (r) => r.changeHappened && r.save === 200 && r.figureStored,
    defect: (r) => acDefect(r),
    extra: (r) => (r.download && r.download.offered ? { claim: 'DL', observed: !(r.download.holdsM1 && r.download.figureIncluded) } : null),
  },
  {
    id: 'dl2-download-51-min-later', claim: 'DL',
    async run(p) {
      const B = await permanentUser('dl2B');
      const r = await accountChange(p, {
        B: B.id, download: true, laterMs: 51 * 60 * 1000,
        async change(pp) {
          const tab2 = await pp.tab('tab2');
          await signInViaAuth(tab2, B.email, PASSWORD);
          return { ok: (await sessionOf(tab2))?.user?.id === B.id, summary: 'tab2 /auth sign-in; the closed page is used 51 minutes later (page clock), past the signed-URL cache (50 min)' };
        },
      });
      const signs = p.net.filter((e) => e.tab === 'tab1' && e.method === 'POST' && e.path.startsWith('/storage/v1/object/sign/')).map((e) => `sign ${r.name(e.object?.split('/')[0])}/… as ${r.name(e.sub)} -> ${e.status}`);
      return { ...r, signs };
    },
    needs: (r) => r.changeHappened && r.save === 200 && r.figureStored,
    // Only the page the fix adds can be judged; main keeps the editor.
    defect: (r) => (r.download?.offered ? !(r.download.holdsM1 && r.download.figureIncluded) : null),
  },
  {
    id: 'g1-migration-race', claim: 'G1',
    async run(p) {
      const B = await permanentUser('g1B');
      const M1 = `ZQG1${randomUUID().slice(0, 6)}`;
      p.markers.push(M1);
      const { tab1, posterId, A } = await guestEditing(p, M1);
      // Fixture: base64 images in A's stored poster (older documents hold them).
      const row = await admin.poster(posterId);
      const blocks = row.data.blocks.map((b) => (b.type === 'image' ? { ...b, imageSrc: DATA_URL } : b));
      blocks.push({ ...blocks.find((b) => b.type === 'image'), id: `b64-${randomUUID().slice(0, 6)}`, y: 5, imageSrc: DATA_URL });
      await admin.patchPoster(posterId, { data: { ...row.data, blocks } });
      const before = await snapshot({ A, B: B.id }, [M1]);
      const hold = p.hold((req, tab) => tab === 'tab1' && req.method() === 'GET' && req.url().includes('/rest/v1/posters') && req.url().includes(`id=eq.${posterId}`));
      hold.arm();
      const t = now(p);
      await tab1.goto(`${H.base}/p/${posterId}`);
      await Promise.race([hold.caught, sleep(30000)]);
      const tab2 = await p.tab('tab2');
      const signed = await signInViaAuth(tab2, B.email, PASSWORD);
      await sleep(1500);
      hold.release();
      await sleep(9000);
      const after = await snapshot({ A, B: B.id }, [M1]);
      const s = await tabState(tab1);
      const name = namer({ A, B: B.id });
      return {
        held: hold.what, change: `tab2 -> ${signed.url}`, changeHappened: (await sessionOf(tab2))?.user?.id === B.id,
        tab1: { editor: s.editor, notFound: s.notFound, closed: s.closed, session: name(s.sessionUser) },
        ...writes(since(p.net, t), name),
        newObjects: objectDiff(before, after),
        posterId,
      };
    },
    needs: (r) => r.changeHappened && !!r.held,
    defect: (r) => (r.newObjects.B ?? []).some((o) => o.includes(r.posterId)),
  },
  {
    id: 'k2-migration-no-change', control: true,
    async run(p) {
      const M1 = `ZQK2${randomUUID().slice(0, 6)}`;
      p.markers.push(M1);
      const { tab1, posterId, A } = await guestEditing(p, M1);
      const row = await admin.poster(posterId);
      await admin.patchPoster(posterId, { data: { ...row.data, blocks: row.data.blocks.map((b) => (b.type === 'image' ? { ...b, imageSrc: DATA_URL } : b)) } });
      const t = now(p);
      await tab1.goto(`${H.base}/p/${posterId}`);
      await tab1.waitForSelector('#poster-canvas [data-block-id]', { timeout: 60000 });
      await sleep(5000);
      const name = namer({ A });
      return { ...writes(since(p.net, t), name), objectsInA: Object.keys(await admin.objects(A)).filter((k) => k.includes(posterId)).map((k) => k.split('/').pop()) };
    },
    pass: (r) => r.uploads.some((u) => /into A\/.* as A -> 200/.test(u)) && r.objectsInA.some((o) => o.endsWith('.png')),
  },
  {
    id: 'th1-thumbnail-after-signin', claim: 'TH',
    async run(p) {
      const B = await permanentUser('th1B');
      const M1 = `ZQTH${randomUUID().slice(0, 6)}`;
      p.markers.push(M1);
      const tab1 = await p.tab('tab1');
      const posterId = await openNewPoster(tab1);
      const A = (await admin.poster(posterId))?.user_id;
      // Past the thumbnail cooldown (3 s) of the save the editor makes on
      // opening, so the typed save's capture runs.
      await sleep(4000);
      const before = await snapshot({ A, B: B.id }, [M1]);
      // Hold the save (it carries A's token and succeeds as A once released);
      // the sign-in lands before its thumbnail capture asks who is signed in.
      const hold = p.hold((req, tab) => tab === 'tab1' && req.method() === 'PATCH' && req.url().includes('/rest/v1/posters') && (req.postData() || '').includes(M1));
      hold.arm();
      const t = now(p);
      await typeInto(tab1, ` ${M1}`);
      await Promise.race([hold.caught, sleep(15000)]);
      const tab2 = await p.tab('tab2');
      await signInViaAuth(tab2, B.email, PASSWORD);
      await sleep(1000);
      hold.release();
      await sleep(9000);
      const after = await snapshot({ A, B: B.id }, [M1]);
      const s = await tabState(tab1);
      const name = namer({ A, B: B.id });
      return {
        held: hold.what, changeHappened: (await sessionOf(tab2))?.user?.id === B.id,
        tab1: { editor: s.editor, closed: s.closed, notFound: s.notFound },
        ...writes(since(p.net, t), name), newObjects: objectDiff(before, after), posterId,
      };
    },
    needs: (r) => r.changeHappened && !!r.held,
    defect: (r) => Object.entries(r.newObjects).some(([k, v]) => k !== 'A' && v.some((o) => o.includes(r.posterId))),
  },
  {
    id: 'th2-thumbnail-owner-folder-other-token', claim: 'TH',
    async run(p) {
      const B = await permanentUser('th2B');
      const M1 = `ZQT2${randomUUID().slice(0, 6)}`;
      p.markers.push(M1);
      const tab1 = await p.tab('tab1');
      const posterId = await openNewPoster(tab1);
      const A = (await admin.poster(posterId))?.user_id;
      // Past the thumbnail cooldown (3 s) of the save the editor makes on
      // opening, so the typed save's capture runs.
      await sleep(4000);
      const before = await snapshot({ A, B: B.id }, [M1]);
      // Hold the "who is signed in" lookup the capture makes after the save
      // (sent with A's token, so it answers A); the upload that follows is
      // made after the sign-in, with B's token.
      const sent = () => p.net.some((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M1));
      const hold = p.hold((req, tab) => tab === 'tab1' && req.method() === 'GET' && req.url().endsWith('/auth/v1/user') && sent());
      hold.arm();
      const t = now(p);
      await typeInto(tab1, ` ${M1}`);
      await waitFor(() => since(p.net, t).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M1) && e.status === 200), { timeout: 10000 });
      const got = await Promise.race([hold.caught.then(() => true), sleep(8000).then(() => false)]);
      const tab2 = await p.tab('tab2');
      await signInViaAuth(tab2, B.email, PASSWORD);
      await sleep(1000);
      hold.release();
      await sleep(9000);
      const after = await snapshot({ A, B: B.id }, [M1]);
      const s = await tabState(tab1);
      const name = namer({ A, B: B.id });
      return {
        held: got ? hold.what : null, changeHappened: (await sessionOf(tab2))?.user?.id === B.id,
        tab1: { editor: s.editor, closed: s.closed },
        ...writes(since(p.net, t), name), newObjects: objectDiff(before, after), posterId,
      };
    },
    needs: (r) => r.changeHappened,
    defect: (r) => r.uploads.some((u) => /into A\/.* as B -> 20\d/.test(u)) || Object.entries(r.newObjects).some(([k, v]) => k !== 'A' && v.some((o) => o.includes(r.posterId))),
  },
  {
    id: 'so-signout-other-tab', claim: 'SO', download: true,
    async run(p) {
      let aSession = null;
      const r = await accountChange(p, {
        download: true,
        async change(pp) {
          const tab1 = [...pp.context.pages()][0];
          aSession = await sessionOf(tab1);
          const tab2 = await pp.tab('tab2');
          await tab2.goto(`${H.base}/debug`);
          await tab2.getByRole('button', { name: 'supabase.auth.signOut()' }).click({ timeout: 60000 });
          await sleep(3000);
          const s = await sessionOf(tab1);
          return { ok: s?.user?.id !== aSession?.user?.id, summary: `tab2 /debug signOut() (global); session now ${s?.user?.id ? (s.user.is_anonymous ? 'a new guest' : 'permanent') : 'none'}`, known: {} };
        },
      });
      // Is A's session really ended at the server? Its refresh token, and its access token.
      const refresh = aSession ? await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: aSession.refresh_token }, key: PUBLISHABLE, raw: true }) : null;
      const read = aSession ? await api(`/rest/v1/posters?select=id&id=eq.${r.posterId}`, { key: aSession.access_token, raw: true }) : null;
      return { ...r, aRefreshAfter: refresh && `${refresh.status} ${refresh.json?.error_code ?? ''}`.trim(), aAccessTokenReadsOwnPoster: read && `${read.status} rows=${Array.isArray(read.json) ? read.json.length : '?'}` };
    },
    needs: (r) => r.changeHappened && r.save === 200,
    defect: (r) => acDefect(r),
    extra: (r) => (r.download && r.download.offered ? { claim: 'DL', observed: !(r.download.holdsM1 && r.download.figureIncluded) } : null),
  },
  {
    id: 'so2-signout-elsewhere', claim: 'SO',
    async run(p) {
      const [M1, M2, M3] = ['ZQS1', 'ZQS2', 'ZQS3'].map((m) => `${m}${randomUUID().slice(0, 6)}`);
      p.markers.push(M1, M2, M3);
      const { tab1, posterId, A, save } = await guestEditing(p, M1);
      const sess = await sessionOf(tab1);
      // A signs out everywhere from another device (account deletion ends the same way).
      const logout = await api('/auth/v1/logout?scope=global', { method: 'POST', key: sess.access_token, raw: true });
      const name = namer({ A });
      const typeAndSave = async (m) => {
        const t = now(p);
        await typeInto(tab1, ` ${m}`);
        const w = await waitFor(() => since(p.net, t).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(m) && e.status), { timeout: 8000 });
        return w ? `as ${name(w.sub)} -> ${w.status}` : 'no save';
      };
      const tLogout = now(p);
      const savedAfterLogout = await typeAndSave(M2);
      const out = { posterId, save, expiresIn: sess.expires_in, logout: logout.status, savedAfterLogout };
      // Tab 1 learns of it when GoTrue refuses the ended session: a GET /user
      // (403 session_not_found; the thumbnail capture after a save asks) or a
      // refresh (400). Until then its access token still works.
      const refused = await waitFor(() => since(p.net, tLogout).find((e) => e.tab === 'tab1' && e.status >= 400 && (e.path === '/auth/v1/user' || e.path === '/auth/v1/token')), { timeout: sess.expires_in <= 180 ? RF_WAIT_MS : 20000 });
      if (!refused) return { ...out, skipped: `tab 1 was not refused within the wait (jwt_expiry ${sess.expires_in}s)` };
      await sleep(4000);
      const st = await tabState(tab1);
      const later = { refusedBy: `${refused.method} ${refused.path} -> ${refused.status} ${refused.err ?? ''}`.trim(), afterMs: refused.t - tLogout, editor: st.editor, closed: st.closed, session: name(st.sessionUser) };
      if (st.editor) later.typed = await typeAndSave(M3);
      return { ...out, later, ...writes(p.net, name) };
    },
    needs: (r) => r.save === 200 && r.logout === 204,
    defect: (r) => !!r.later && (r.later.editor || /as (?!A )\S+ -> 20\d/.test(r.later.typed ?? '')),
  },
  {
    id: 'rl-recovery-link-for-B', claim: 'RL',
    async run(p) {
      const B = await permanentUser('rlB');
      return accountChange(p, {
        B: B.id,
        async change(pp) {
          // B asks for a recovery link on B's own browser, through /auth.
          const other = await newProfile(H, []);
          const tb = await other.tab('B-browser');
          await tb.goto(`${H.base}/auth`);
          await tb.fill('input[aria-label="Email address"]', B.email);
          const sent = Date.now();
          await tb.getByRole('button', { name: 'Forgot password?' }).click();
          await sleep(1500);
          await other.close();
          const link = await verifyLink(B.email, sent);
          if (!link) return { ok: false, summary: 'no recovery email arrived' };
          // The link is opened in A's browser.
          const tab2 = await pp.tab('tab2');
          await tab2.goto(link);
          await sleep(4000);
          const s = await sessionOf(tab2);
          return { ok: s?.user?.id === B.id, summary: `recovery link opened in tab2 -> ${new URL(tab2.url()).origin === H.base ? new URL(tab2.url()).pathname : `another site ${new URL(tab2.url()).origin}`}` };
        },
      });
    },
    needs: (r) => r.changeHappened && r.save === 200,
    defect: (r) => acDefect(r),
  },
  {
    id: 'ml-magic-link-for-B', claim: 'RL',
    async run(p) {
      const B = await permanentUser('mlB');
      return accountChange(p, {
        B: B.id,
        async change(pp) {
          // B asks for a magic link elsewhere (the app has no magic-link form;
          // GoTrue sends one to any client with the publishable key).
          const sent = Date.now();
          const otp = await api('/auth/v1/otp', { method: 'POST', body: { email: B.email, create_user: false }, key: PUBLISHABLE, raw: true });
          const link = await verifyLink(B.email, sent);
          if (!link) return { ok: false, summary: `no magic link arrived (otp ${otp.status})` };
          const tab2 = await pp.tab('tab2');
          await tab2.goto(link);
          await sleep(4000);
          const s = await sessionOf(tab2);
          return { ok: s?.user?.id === B.id, summary: `magic link opened in tab2 -> ${new URL(tab2.url()).origin === H.base ? new URL(tab2.url()).pathname : `another site ${new URL(tab2.url()).origin}`}` };
        },
      });
    },
    needs: (r) => r.changeHappened && r.save === 200,
    defect: (r) => acDefect(r),
  },
  {
    id: 'cf-confirmation-link-for-B', claim: 'RL',
    async run(p) {
      const email = EMAIL('cfB');
      let B = null;
      // B's id is known only after the sign-up; it reaches the snapshot as `known`.
      const r = await accountChange(p, {
        async change(pp) {
          // B signs up on B's own device (the Auth API the app's sign-up calls).
          const sent = Date.now();
          const su = await api('/auth/v1/signup', { method: 'POST', body: { email, password: PASSWORD }, key: PUBLISHABLE, raw: true });
          B = su.json?.id ?? su.json?.user?.id ?? null;
          if (su.json?.access_token) return { ok: false, summary: 'autoconfirm: sign-up signed in at once, no confirmation link' };
          const link = await verifyLink(email, sent);
          if (!link) return { ok: false, summary: `no confirmation email (signup ${su.status})` };
          const tab2 = await pp.tab('tab2');
          await tab2.goto(link);
          await sleep(4000);
          const s = await sessionOf(tab2);
          return { ok: !!B && s?.user?.id === B, summary: `confirmation link opened in tab2 -> ${new URL(tab2.url()).pathname}`, known: { B } };
        },
      });
      return /autoconfirm/.test(r.change ?? '') ? { skipped: r.change, save: r.save } : r;
    },
    needs: (r) => r.skipped || (r.changeHappened && r.save === 200),
    defect: (r) => acDefect(r),
  },
  {
    id: 'pw-paywall-signin', claim: 'PW',
    async run(p) {
      const B = await permanentUser('pwB');
      return accountChange(p, {
        B: B.id,
        async change(pp) {
          const tab2 = await pp.tab('tab2');
          const r = await signInViaAuth(tab2, B.email, PASSWORD, { plan: 'term' });
          return { ok: (await sessionOf(tab2))?.user?.id === B.id, summary: `tab2 /auth?plan=term sign-in -> ${r.url}${r.message ? ` "${r.message}"` : ''}` };
        },
      });
    },
    needs: (r) => r.changeHappened && r.save === 200,
    defect: (r) => acDefect(r),
  },
  {
    id: 'cv-convert-in-place', claim: 'CV',
    async run(p) {
      const M1 = `ZQCV${randomUUID().slice(0, 6)}`;
      const M2 = `ZQCW${randomUUID().slice(0, 6)}`;
      p.markers.push(M1, M2);
      const { tab1, posterId, A, save } = await guestEditing(p, M1);
      const tab2 = await p.tab('tab2');
      await tab2.goto(`${H.base}/auth`);
      await tab2.waitForSelector('input[aria-label="Email address"]', { timeout: 60000 });
      await tab2.locator('button:not([type="submit"])', { hasText: /^Sign up$/ }).click();
      const email = EMAIL('convert');
      await tab2.fill('input[aria-label="Email address"]', email);
      await tab2.fill('input[aria-label="Create password"]', PASSWORD);
      const t = now(p);
      const sentAt = Date.now();
      await tab2.locator('form button[type="submit"]').click();
      await waitFor(async () => /\/dashboard/.test(tab2.url()) || /Check your inbox/.test(await tab2.evaluate(() => document.body.innerText)), { timeout: 20000 });
      await sleep(3000);
      // With email confirmations on (production), the guest stays a guest until
      // the link in the email is opened; it is opened in tab 2.
      let confirmation = 'none asked for';
      if (/Check your inbox/.test(await tab2.evaluate(() => document.body.innerText))) {
        const pending = await tabState(tab1);
        const link = await verifyLink(email, sentAt);
        confirmation = `pending (tab1 editor ${pending.editor}); ${link ? 'link opened in tab2' : 'no email arrived'}`;
        if (link) { await tab2.goto(link); await sleep(5000); }
      }
      const s2 = await sessionOf(tab2);
      const st = await tabState(tab1);
      const t2 = now(p);
      if (st.editor) await typeInto(tab1, ` ${M2}`);
      const w = await waitFor(() => since(p.net, t2).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M2) && e.status), { timeout: 8000 });
      const name = namer({ A });
      const row = await admin.poster(posterId);
      return {
        save, confirmation, tab2: `${new URL(tab2.url()).pathname}; session ${name(s2?.user?.id)} anonymous=${s2?.user?.is_anonymous}`,
        sameUser: s2?.user?.id === A, nowPermanent: s2?.user?.is_anonymous === false,
        tab1: { editor: st.editor, closed: st.closed }, typedAfter: w ? `as ${name(w.sub)} -> ${w.status}` : 'no save', storedM2: JSON.stringify(row.data).includes(M2),
        updateUser: since(p.net, t).filter((e) => e.path === '/auth/v1/user' && e.method === 'PUT').map((e) => `${e.tab} PUT /user as ${name(e.sub)} -> ${e.status}`),
      };
    },
    needs: (r) => r.save === 200 && r.sameUser,
    defect: (r) => !r.tab1.editor || !r.storedM2,
  },
  {
    id: 'rf-refresh-across-tabs', claim: 'RF',
    async run(p) {
      const M1 = `ZQRF${randomUUID().slice(0, 6)}`;
      const M2 = `ZQRG${randomUUID().slice(0, 6)}`;
      p.markers.push(M1, M2);
      const { tab1, A, save } = await guestEditing(p, M1);
      const expiresIn = (await sessionOf(tab1))?.expires_in ?? null;
      if (!expiresIn || expiresIn > 180) return { skipped: `jwt_expiry is ${expiresIn}s; RF needs at most 180 s`, save };
      const tab2 = await p.tab('tab2');
      await tab2.goto(`${H.base}/pricing`);
      const t = now(p);
      await sleep(RF_WAIT_MS);
      const st = await tabState(tab1);
      const t2 = now(p);
      if (st.editor) await typeInto(tab1, ` ${M2}`);
      const w = await waitFor(() => since(p.net, t2).find((e) => e.tab === 'tab1' && e.method === 'PATCH' && e.markers?.includes(M2) && e.status), { timeout: 8000 });
      const name = namer({ A });
      const tokens = since(p.net, t).filter((e) => e.path === '/auth/v1/token');
      return {
        expiresIn, save, waitedMs: RF_WAIT_MS,
        refreshes: tokens.map((e) => `${e.tab} as ${name(e.sub)} -> ${e.status}${e.err ? ` ${e.err}` : ''}`),
        failedRefreshes: tokens.filter((e) => e.status !== 200).length,
        tab1: { editor: st.editor, closed: st.closed, session: name(st.sessionUser) }, typedAfter: w ? `as ${name(w.sub)} -> ${w.status}` : 'no save',
      };
    },
    needs: (r) => r.skipped || (r.save === 200 && r.refreshes.length > 0),
    defect: (r) => !r.skipped && (r.failedRefreshes > 0 || !r.tab1.editor || !/as A -> 200/.test(r.typedAfter)),
  },
];

// ------------------------------------------------------------------ runner
const chosen = SCENARIOS.filter((s) => !only || only.includes(s.id));
if (only && chosen.length !== only.length) {
  log(`[harness] unknown scenario(s): ${only.filter((id) => !SCENARIOS.some((s) => s.id === id)).join(', ')}`);
  process.exit(2);
}
// K00: no shared poster may be in the stack before the run. On a build without
// the owner filter every guest's /p/new would open one, and the account-change
// scenarios would measure someone else's poster instead of the guest's own.
const sharedBefore = await admin.sharedCount().catch((e) => refuse(`cannot read the stack with the service key: ${e}`));
if (sharedBefore > 0) refuse(`the stack holds ${sharedBefore} shared poster(s) (is_public); reset it (supabase db reset --local) or delete them first`);
const H = await startHarness({ name: 'account-change', port: PORT }).catch((e) => { log(`[harness] instrument error: ${e}`); process.exit(2); });
log(`[harness] stack ${API_URL}; mail ${MAIL || '(none)'}; the app's Supabase URL comes from VITE_SUPABASE_URL=${API_URL}`);
const results = [];
let failedControl = false;
let observed = 0;
let counted = 0;
const k0 = { toStack: 0, offsite: [] };
for (const sc of chosen) {
  // p.markers is the recorder's own list: a marker pushed before a write is
  // looked for in that write's body.
  const p = await newProfile(H, []);
  try {
    const r = await sc.run(p);
    const pageErrors = p.errors.slice(0, 5);
    const out = { id: sc.id, ...r, pageErrors };
    delete out.name;
    if (sc.control) {
      const ok = sc.pass(r);
      failedControl ||= !ok;
      log(`[${ok ? 'control ok' : 'CONTROL FAILED'}] ${sc.id} ${JSON.stringify(out)}`);
      results.push({ ...out, control: true, ok });
    } else {
      const needsOk = sc.needs ? !!sc.needs(r) : true;
      if (!needsOk) {
        failedControl = true;
        log(`[CONTROL FAILED] ${sc.id}: its precondition did not hold ${JSON.stringify(out)}`);
      }
      // With its precondition failed the scenario says nothing about the
      // claim (step 9 round 4, S9R4-5: a magic link that landed on another
      // port was printed as OBSERVED): no verdict, and not counted.
      const verdict = r.skipped || !needsOk ? null : sc.defect(r);
      const defect = verdict === null || verdict === undefined ? null : !!verdict;
      if (defect !== null) { counted += 1; observed += defect ? 1 : 0; }
      const extra = sc.extra && needsOk ? sc.extra(r) : null;
      if (extra && extra.observed !== null && extra.observed !== undefined) { counted += 1; observed += extra.observed ? 1 : 0; }
      log(`[${!needsOk ? 'n/a: precondition failed' : defect === null ? 'skipped' : defect ? 'OBSERVED' : 'not observed'}] ${sc.claim} ${sc.id} ${JSON.stringify(out)}`);
      if (extra) log(`   [${extra.observed === null || extra.observed === undefined ? 'n/a' : extra.observed ? 'OBSERVED' : 'not observed'}] ${extra.claim} ${extra.note ?? ''}`);
      results.push({ ...out, claim: sc.claim, observed: defect, preconditionOk: needsOk, extra });
    }
  } catch (e) {
    failedControl = true;
    const pages = await Promise.all(p.context.pages().map(async (pg) => ({
      url: pg.url(), text: (await pg.evaluate(() => document.body?.innerText ?? '').catch(() => '')).slice(0, 300),
    })));
    log(`[ERROR] ${sc.id} ${String(e?.stack ?? e).slice(0, 600)} pages=${JSON.stringify(pages)} lastRequests=${JSON.stringify(p.net.slice(-8))}`);
    results.push({ id: sc.id, error: String(e).slice(0, 400), pages, pageErrors: p.errors.slice(0, 5) });
  } finally {
    await admin.deletePosters(FIXTURE_POSTERS.splice(0)).catch((e) => log(`[harness] fixture cleanup failed: ${e}`));
    fs.writeFileSync(path.join(H.out, `net-${sc.id}.json`), JSON.stringify(p.net, null, 1));
    k0.toStack += p.net.length;
    k0.offsite.push(...p.offsite);
    await p.close();
  }
}
await H.stop();
// K0: the app talked to the local stack, and to nothing else.
const k0ok = k0.toStack > 0 && k0.offsite.filter((u) => /supabase\.co|dummy/.test(u)).length === 0;
failedControl ||= !k0ok;
log(`[${k0ok ? 'control ok' : 'CONTROL FAILED'}] K0 ${JSON.stringify({ requestsToLocalStack: k0.toStack, abortedOffsite: [...new Set(k0.offsite.map((u) => new URL(u).origin))] })}`);
const summary = { git: H.git, repo: REPO, stack: API_URL, observed: `${observed} of ${counted}`, controlsOk: !failedControl };
fs.writeFileSync(path.join(H.out, 'results.json'), JSON.stringify({ summary, k0, results }, null, 2));
log(`[harness] ${JSON.stringify(summary)}`);
const exit = failedControl ? 2 : observed ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(H.out, 'results.json')}`);
process.exit(exit);
