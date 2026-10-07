#!/usr/bin/env node
/**
 * analytics-privacy-check.mjs — does Postr load Vercel Web Analytics when
 * the browser sends Global Privacy Control, and what page address would it
 * report? (docs/fixes/24-legal-canada-law25.md)
 *
 * The owner's decision (2026-10-06): honour GPC by not mounting Vercel Web
 * Analytics at all, and never report a poster's id in the page address.
 *
 * It enters where a visitor enters: a page load of the landing page, the
 * pricing page and the editor (/p/<id>, the backend faked at the network by
 * lib/editorHarness.mjs). The GPC signal is the browser's own: Firefox with
 * its Global Privacy Control setting on (`privacy.globalprivacycontrol.
 * enabled`), which sends `Sec-GPC: 1` and sets navigator.globalPrivacyControl;
 * nothing in the page is stubbed. Chromium has no GPC setting, so it is the
 * no-signal control alongside Firefox with the setting off.
 *
 * The analytics script is read three ways: the <script> element the
 * package adds, the request for it (the dev server's package asks for
 * va.vercel-scripts.com/v1/script.debug.js; the harness's network fake
 * aborts and records it, so nothing leaves the machine), and the queue the
 * package creates (window.va / window.vaq).
 *
 * CLAIMS (counted; each is the defect)
 *   G1  with the browser's GPC setting on, the page adds the analytics
 *       script, asks for it, or queues anything for it (/, /pricing, the
 *       editor: 3 readings).
 *   R1  in the editor (/p/<id>?zq=1, and /P/<id>?zq=1, which the router
 *       also serves as the editor; no GPC), the page address the app hands
 *       the analytics script contains the poster id or the query string
 *       (2 readings; the upper-case one added by record 24's review round 1).
 *       The vendor script calls the registered beforeSend with
 *       { type, url: location.href } and sends what it returns as the address
 *       (MEASURED on the production script, v0.1.3, on www.postr.sh: record
 *       24, section 3), so the harness calls it the same way.
 *   B1  the beacon's Referer header carries the page's path (a poster id):
 *       a page at /p/<id> served with the Referrer-Policy the tree's
 *       vercel.json sets for every page makes the vendor script's request
 *       (a same-origin POST to /_vercel/insights/view, keepalive, as the
 *       production script makes it) and a local server records its Referer,
 *       in Chromium and Firefox (2 readings). The page is the harness's, not
 *       the app's: the Vite dev server does not apply vercel.json's headers,
 *       so this reads the browser rule the header relies on.
 *   T1  on /auth, the line that says continuing is accepting the Terms, with
 *       the French Terms linked (Terms §1; owner decision 9, Bill 96), is
 *       missing, is not next to "Continue with Google" (more than 32 px
 *       above or below it), or is not wholly in the first view: sign-in mode
 *       (the page's default) and sign-up mode (after the user's click), in
 *       Chromium, Firefox and WebKit, at 1440 × 900, 1366 × 768 and
 *       1280 × 720 (18 readings). "Continue with Google" creates an account
 *       for a Google user Postr has not seen, in either mode (Auth.tsx
 *       handleGoogle). Added by record 24's review round 2, from its
 *       reviewer's probe: before the correction the line was absent in
 *       sign-in mode and, in sign-up mode, under the email form.
 * CONTROLS (a failed control stops the run, exit 2)
 *   C1  Firefox with GPC on: navigator.globalPrivacyControl is true and the
 *       page request carried Sec-GPC: 1 (else the signal is not what G1 reads).
 *   C2  Firefox with GPC off, and Chromium: the page adds and asks for the
 *       analytics script (else G1 could not see it if it were there).
 *   C3  each page rendered (its heading, or the editor's sheet; at /P/<id>
 *       too, or openEditor stops the run).
 *   C4  B1's page under Referrer-Policy: unsafe-url sends the path (else B1
 *       could not see a path if one were sent).
 *   C5  T1: "Continue with Google" rendered and wholly in the first view
 *       (else "next to it, in the first view" means nothing).
 * INFORMATION
 *   I1  localStorage and sessionStorage keys and document.cookie after each
 *       public page load, less the two the harness itself writes
 *       (postr.onboarding-done and postr.mobile-notice-dismissed, set before
 *       the page loads); the vendor script is aborted here, so its storage
 *       is read on production instead (record 24).
 *
 * BLIND SPOTS: the production script itself (dev loads the debug build,
 * which is aborted; --live reads it); Safari and Chromium-based browsers
 * that send GPC (Brave, DuckDuckGo) are not driven; that Vercel applies
 * vercel.json's Referrer-Policy is read only by --live, after a deploy (B1
 * applies the value the file sets; src/__tests__/analyticsPrivacy.test.tsx
 * pins it).
 *
 * --live <origin>: THE DEPLOYED SITE, read-only (added by record 24's review
 * round 2, from its reviewer's production-site probe). No dev server: public
 * pages only (/, /pricing, /privacy, /tools/figure-readability; never /p/,
 * which would create a guest account; no sign-in, no form). Every request
 * that is not a GET or HEAD is answered in the browser and recorded, never
 * sent, so no page view reaches the owner's analytics. The vendor script
 * returns at once when navigator.webdriver is true or the user agent says
 * "Headless" (its bot check, read in the v0.1.3 source), so the pages see
 * webdriver false and a user agent without "Headless", as a visitor's
 * browser would show them. GPC is Firefox's own setting; Chromium gets
 * navigator.globalPrivacyControl and Sec-GPC: 1 injected, as Brave or
 * DuckDuckGo would send them. Before this branch deploys, L1 and L2 are
 * expected (record 24, section 9, round 2); after it, the run should exit 0.
 *   L1  with GPC on, a page asks for the analytics script, creates its queue
 *       or sends a page view (Chromium and Firefox, 4 pages: 8 readings).
 *   L2  a page view's Referer carries the page's path (GPC off, the three
 *       pages that are not /: 6 readings).
 *   C6  GPC on: navigator.globalPrivacyControl is true and the page request
 *       carried Sec-GPC: 1.
 *   C7  GPC off: each page sent at least one page view (else L2 sees none).
 *   I2  each document's Referrer-Policy header, the cookies in the browser's
 *       store and document.cookie, storage keys, the other hosts reached.
 *
 * RUN (from apps/web; apps/web/.env must point at the fake backend,
 * https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/analytics-privacy-check.mjs [--only G1,R1,B1,T1]
 *   node scripts/analytics-privacy-check.mjs --live https://www.postr.sh
 *   env PORT (default 5860; B1's server uses PORT + 1), OUT_DIR, POSTR_REPO,
 *   POSTR_MUTANT
 * EXIT 0 no claim observed · 1 a defect observed · 2 a control failed or the
 *      instrument errored
 *
 * Side effect (not with --live): rewrites apps/web/public/version.json
 * (Vite's build stamp); restore with
 * `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, log, sleep, startHarness, installMocks, openEditor } from './lib/editorHarness.mjs';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    process.stderr.write(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 500)}\n`);
    process.exit(2);
  });
}

const PORT = Number(process.env.PORT ?? 5860);
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;
const wants = (id) => !only || only.includes(id);
const liveArg = args.find((a) => a.startsWith('--live'));
const LIVE = liveArg ? (liveArg.includes('=') ? liveArg.split('=')[1] : args[args.indexOf(liveArg) + 1]) : null;
if (liveArg && !/^https:\/\/[^/]+$/.test(LIVE ?? '')) {
  process.stderr.write('--live takes an origin, for example https://www.postr.sh\n');
  process.exit(2);
}

const GPC_PREFS = {
  'privacy.globalprivacycontrol.enabled': true,
  'privacy.globalprivacycontrol.functionality.enabled': true,
};
const VIEWPORT = { width: 1440, height: 900 };
const PUBLIC_PAGES = [
  { path: '/', heading: /academic posters/i },
  { path: '/pricing', heading: /./ },
];
const SCRIPT_SELECTOR = 'script[src*="vercel-scripts.com"], script[src*="/_vercel/insights"]';
const isAnalyticsRequest = (url) => /vercel-scripts\.com|\/_vercel\/insights\//.test(url);

/** What the page did for the analytics script, read after it settled. */
async function readAnalytics(page, state, requests) {
  await sleep(1500);
  const inPage = await page.evaluate((sel) => ({
    scripts: document.head.querySelectorAll(sel).length,
    va: typeof window.va,
    vaq: Array.isArray(window.vaq) ? window.vaq.map((entry) => entry[0]) : null,
    gpc: String(navigator.globalPrivacyControl),
    localStorage: Object.keys(localStorage)
      .filter((key) => key !== 'postr.onboarding-done' && key !== 'postr.mobile-notice-dismissed').sort(),
    sessionStorage: Object.keys(sessionStorage).sort(),
    cookie: document.cookie,
  }), SCRIPT_SELECTOR);
  const asked = [...requests, ...state.aborted].filter(isAnalyticsRequest);
  return { ...inPage, asked: asked.length, loaded: inPage.scripts > 0 || asked.length > 0 || inPage.va !== 'undefined' };
}

/** A public page in a fresh context of `browser`, the backend faked. */
async function loadPublic(h, browser, route) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const state = { userId: 'zq-visitor', row: null, saves: [], aborted: [], errors: [] };
  await installMocks(context, state, h.base);
  const page = await context.newPage();
  const requests = [];
  const gpcHeaders = [];
  page.on('request', (req) => {
    requests.push(req.url());
    if (req.isNavigationRequest()) gpcHeaders.push(req.headers()['sec-gpc'] ?? null);
  });
  page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 300)));
  await page.goto(`${h.base}${route.path}`);
  const rendered = await page.getByRole('heading', { name: route.heading }).first()
    .waitFor({ timeout: 60000 }).then(() => true, () => false);
  const reading = await readAnalytics(page, state, requests);
  await context.close();
  return { ...reading, rendered, gpcHeaders, errors: state.errors };
}

/** The editor on a fresh poster in `browser` (openEditor's own context). */
async function loadEditor(h, browser) {
  const requests = [];
  const { context, page, state } = await openEditor(h, { viewport: VIEWPORT, poster: { w: 48, h: 36 }, browser });
  page.on('request', (req) => requests.push(req.url()));
  // openEditor has already loaded the page; re-read what it asked for from
  // the network fake's record (state.aborted holds every outside request).
  const reading = await readAnalytics(page, state, requests);
  const posterId = state.row.id;
  await context.close();
  return { ...reading, rendered: true, posterId, errors: state.errors };
}

/** R1: the address the app's beforeSend gives for the editor's own URL, spelled by `route`. */
async function reportedEditorAddress(h, browser, route) {
  const { context, page, state } = await openEditor(h, {
    viewport: VIEWPORT, poster: { w: 48, h: 36 }, browser, route,
  });
  await sleep(1500);
  const out = await page.evaluate(() => {
    const entry = (window.vaq ?? []).find(([command]) => command === 'beforeSend');
    if (!entry || typeof entry[1] !== 'function') return { registered: false, href: location.href };
    const sent = entry[1]({ type: 'pageview', url: location.href });
    return { registered: true, href: location.href, sent: sent ? sent.url : null };
  });
  await context.close();
  return { ...out, posterId: state.row.id };
}

/** The Referrer-Policy vercel.json sets on every page (source "/(.*)"). */
function siteReferrerPolicy() {
  const config = JSON.parse(fs.readFileSync(path.join(REPO, 'apps/web/vercel.json'), 'utf8'));
  const rule = (config.headers ?? []).find((r) => r.source === '/(.*)');
  return rule?.headers.find((x) => x.key.toLowerCase() === 'referrer-policy')?.value ?? null;
}

/**
 * B1's server: GET /p/<id>?policy=<p> is a page served with that
 * Referrer-Policy that makes the production vendor script's beacon request;
 * POST /_vercel/insights/view records the Referer it carried.
 */
function startBeaconServer(port) {
  const referers = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && url.pathname === '/_vercel/insights/view') {
      referers.push(req.headers.referer ?? null);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'referrer-policy': url.searchParams.get('policy') ?? '' });
    res.end(`<!doctype html><title>zq</title><script>
      fetch('/_vercel/insights/view', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(() => { document.title = 'sent'; });
    </script>`);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, referers })));
}

/** The Referer one beacon carried from /p/<id> under `policy`, in `browser`. */
async function beaconReferer(browser, port, beacon, policy) {
  const page = await browser.newPage();
  beacon.referers.length = 0;
  await page.goto(`http://127.0.0.1:${port}/p/zq-poster-4f1c9a?policy=${encodeURIComponent(policy)}`);
  await page.waitForFunction(() => document.title === 'sent', null, { timeout: 15000 });
  await page.close();
  return beacon.referers[0] ?? null;
}

/** T1: where /auth shows the Terms line, in `mode`, at `viewport`, in `browser`. */
async function authTermsLine(h, browser, viewport, mode) {
  const context = await browser.newContext({ viewport });
  const state = { userId: 'zq-visitor', row: null, saves: [], aborted: [], errors: [] };
  await installMocks(context, state, h.base);
  const page = await context.newPage();
  await page.goto(`${h.base}/auth`);
  const google = page.getByRole('button', { name: /Continue with Google/ });
  let rendered = await google.waitFor({ timeout: 60000 }).then(() => true, () => false);
  if (rendered && mode === 'signup') {
    await page.getByRole('button', { name: /^Sign up$/ }).click();
    rendered = await page.getByRole('button', { name: /^Create account/ }).waitFor({ timeout: 15000 })
      .then(() => true, () => false);
  }
  const box = async (locator) => {
    const b = await locator.boundingBox();
    return b ? { top: Math.round(b.y), bottom: Math.round(b.y + b.height) } : null;
  };
  // The line is the paragraph that links the French Terms (the footer links
  // the English pages only), found the same way on every tree.
  const lines = page.locator('main p:has(a[href="/terms/fr"])');
  const count = await lines.count();
  const googleBox = rendered ? await box(google) : null;
  const lineBox = count ? await box(lines.first()) : null;
  await context.close();
  const gap = googleBox && lineBox
    ? (lineBox.top >= googleBox.bottom ? lineBox.top - googleBox.bottom : googleBox.top - lineBox.bottom)
    : null;
  return {
    rendered, count, google: googleBox, line: lineBox, gap,
    lineInFirstView: lineBox ? lineBox.bottom <= viewport.height : false,
    googleInFirstView: googleBox ? googleBox.bottom <= viewport.height : false,
  };
}

const AUTH_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }];
const NEXT_TO_GOOGLE_PX = 32;

// ---------------------------------------------------------------- --live
const LIVE_PAGES = ['/', '/pricing', '/privacy', '/tools/figure-readability'];

/** A context on the deployed site: nothing but GET leaves it, and the page sees a visitor's browser. */
async function liveContext(browser, engine, gpc, sent) {
  const injectGpc = gpc && engine !== 'firefox';
  const context = await browser.newContext({ viewport: VIEWPORT, ...(injectGpc ? { extraHTTPHeaders: { 'Sec-GPC': '1' } } : {}) });
  if (injectGpc) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    });
  }
  await context.addInitScript(() => {
    const ua = navigator.userAgent.replace(/Headless/g, '');
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua, configurable: true });
  });
  await context.route('**/*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue();
    sent.push({ method: req.method(), url: req.url().slice(0, 160), referer: req.headers().referer ?? null, body: (req.postData() ?? '').slice(0, 400) });
    return route.fulfill({ status: req.method() === 'OPTIONS' ? 204 : 200, body: req.method() === 'OPTIONS' ? '' : 'OK' });
  });
  return context;
}

/** One public page of the deployed site, read-only. */
async function loadLive(browser, engine, gpc, origin, pagePath) {
  const sent = [];
  const context = await liveContext(browser, engine, gpc, sent);
  const page = await context.newPage();
  const requests = [];
  page.on('request', (req) => requests.push({
    url: req.url(), method: req.method(), navigation: req.isNavigationRequest(), secGpc: req.headers()['sec-gpc'] ?? null,
  }));
  const response = await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
  const documentHeaders = response ? await response.allHeaders() : {};
  await sleep(3000);
  const inPage = await page.evaluate((sel) => ({
    gpc: String(navigator.globalPrivacyControl),
    va: typeof window.va,
    scripts: document.querySelectorAll(sel).length,
    localStorage: Object.keys(localStorage).sort(),
    sessionStorage: Object.keys(sessionStorage).sort(),
    cookie: document.cookie,
  }), SCRIPT_SELECTOR);
  const jar = (await context.cookies()).map((c) => `${c.domain} ${c.name}`);
  await context.close();
  const host = new URL(origin).host;
  const beacons = sent.filter((r) => r.method === 'POST' && isAnalyticsRequest(r.url));
  return {
    engine, gpc, page: pagePath, status: response?.status() ?? null,
    referrerPolicy: documentHeaders['referrer-policy'] ?? null,
    setCookie: documentHeaders['set-cookie'] ?? null,
    docSecGpc: requests.find((r) => r.navigation)?.secGpc ?? null,
    scriptAsked: requests.filter((r) => r.method === 'GET' && isAnalyticsRequest(r.url)).length,
    beacons, otherAnswered: sent.length - beacons.length,
    otherHosts: [...new Set(requests.map((r) => new URL(r.url).host).filter((x) => x !== host))],
    ...inPage, jar,
  };
}

/** The --live run: L1, L2 and their controls on `origin`. */
async function runLive(origin) {
  const out = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-analytics-privacy-live'));
  fs.mkdirSync(out, { recursive: true });
  const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
  const results = { origin, at: new Date().toISOString(), readings: [] };
  const observed = [];
  const controlFailures = [];
  const browsers = {
    'chromium gpc': await engines.chromium.launch(),
    'firefox gpc': await engines.firefox.launch({ firefoxUserPrefs: GPC_PREFS }),
    'firefox plain': await engines.firefox.launch({}),
  };
  try {
    for (const [engine, gpc, browser] of [
      ['chromium', true, browsers['chromium gpc']], ['chromium', false, browsers['chromium gpc']],
      ['firefox', true, browsers['firefox gpc']], ['firefox', false, browsers['firefox plain']],
    ]) {
      for (const pagePath of LIVE_PAGES) {
        const r = await loadLive(browser, engine, gpc, origin, pagePath);
        results.readings.push(r);
        const name = `${engine} ${pagePath}`;
        if (gpc) {
          if (r.gpc !== 'true' || r.docSecGpc !== '1') controlFailures.push(`C6 ${name}: gpc ${r.gpc}, Sec-GPC ${r.docSecGpc}`);
          if (r.scriptAsked > 0 || r.va !== 'undefined' || r.beacons.length > 0) observed.push(`L1 ${name}`);
        } else {
          if (r.beacons.length === 0) controlFailures.push(`C7 ${name}: no page view sent without GPC`);
          const withPath = r.beacons.filter((b) => b.referer && new URL(b.referer).pathname !== '/');
          if (pagePath !== '/' && withPath.length > 0) observed.push(`L2 ${name}`);
        }
        log(`${name} GPC ${gpc ? 'on' : 'off'}: status ${r.status} · Referrer-Policy ${r.referrerPolicy} · script asked ${r.scriptAsked}, va ${r.va} · page views ${r.beacons.length}${r.beacons.length ? ` (Referer ${r.beacons.map((b) => b.referer).join(', ')})` : ''} · cookies ${r.jar.length} "${r.cookie}" · storage ${JSON.stringify(r.localStorage)} ${JSON.stringify(r.sessionStorage)} · other hosts ${r.otherHosts.join(',') || 'none'}`);
      }
    }
  } finally {
    for (const browser of Object.values(browsers)) await browser.close().catch(() => {});
  }
  return finish(results, observed, controlFailures, out);
}

function finish(results, observed, controlFailures, out) {
  results.observed = observed;
  results.controlFailures = controlFailures;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  log(`[harness] observed ${observed.length}: ${observed.join(', ') || 'none'} · control failures ${controlFailures.length}${controlFailures.length ? `: ${controlFailures.join('; ')}` : ''} · ${path.join(out, 'results.json')}`);
  process.exit(controlFailures.length ? 2 : observed.length ? 1 : 0);
}

if (LIVE) await runLive(LIVE);

const h = await startHarness({ name: 'analytics-privacy', port: PORT });
const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const firefoxGpc = await engines.firefox.launch({ firefoxUserPrefs: GPC_PREFS });
const firefoxPlain = await engines.firefox.launch({});
const chromium = h.engine === 'chromium' ? h.browser : await engines.chromium.launch();
log(`[harness] firefox ${firefoxGpc.version()} (GPC on) and ${firefoxPlain.version()} (off); chromium ${chromium.version()}`);

const results = { git: h.git, mutant: h.mutant, firefox: firefoxGpc.version(), chromium: chromium.version(), readings: {} };
const observed = [];
const controlFailures = [];

try {
  if (wants('G1')) {
    for (const route of PUBLIC_PAGES) {
      const on = await loadPublic(h, firefoxGpc, route);
      const off = await loadPublic(h, firefoxPlain, route);
      const chrome = await loadPublic(h, chromium, route);
      results.readings[`G1 ${route.path}`] = { gpcOn: on, gpcOff: off, chromium: chrome };
      if (on.gpc !== 'true' || !on.gpcHeaders.includes('1')) controlFailures.push(`C1 ${route.path}: gpc ${on.gpc}, Sec-GPC ${on.gpcHeaders}`);
      if (!off.loaded || !chrome.loaded) controlFailures.push(`C2 ${route.path}: off ${off.loaded}, chromium ${chrome.loaded}`);
      if (!on.rendered || !off.rendered || !chrome.rendered) controlFailures.push(`C3 ${route.path} did not render`);
      if (on.loaded) observed.push(`G1 ${route.path}`);
      log(`G1 ${route.path}: GPC on loaded=${on.loaded} (scripts ${on.scripts}, asked ${on.asked}, va ${on.va}) · off loaded=${off.loaded} · chromium loaded=${chrome.loaded} · storage ${JSON.stringify(on.localStorage)} ${JSON.stringify(on.sessionStorage)} cookie "${on.cookie}"`);
    }
    const on = await loadEditor(h, firefoxGpc);
    const off = await loadEditor(h, firefoxPlain);
    results.readings['G1 /p/<id>'] = { gpcOn: on, gpcOff: off };
    if (on.gpc !== 'true') controlFailures.push(`C1 editor: gpc ${on.gpc}`);
    if (!off.loaded) controlFailures.push('C2 editor: no analytics with GPC off');
    if (on.loaded) observed.push('G1 /p/<id>');
    log(`G1 /p/<id>: GPC on loaded=${on.loaded} (scripts ${on.scripts}, asked ${on.asked}, va ${on.va}) · off loaded=${off.loaded}`);
  }

  if (wants('R1')) {
    const spellings = [
      ['/p/<id>', (row) => `/p/${row.id}?zq=1`],
      ['/P/<id>', (row) => `/P/${row.id}?zq=1`],
    ];
    for (const [name, route] of spellings) {
      const r = await reportedEditorAddress(h, chromium, route);
      results.readings[`R1 ${name}`] = r;
      if (!r.registered) {
        controlFailures.push(`R1 ${name}: no beforeSend registered (analytics not mounted without GPC)`);
      } else if (r.sent === null || r.sent.includes(r.posterId) || r.sent.includes('zq=1')) {
        observed.push(`R1 ${name}`);
      }
      log(`R1 ${name}: ${r.href} → reported ${r.sent}`);
    }
  }
  if (wants('B1')) {
    const policy = siteReferrerPolicy();
    const beacon = await startBeaconServer(PORT + 1);
    try {
      for (const [name, browser] of [['chromium', chromium], ['firefox', firefoxPlain]]) {
        const sent = await beaconReferer(browser, PORT + 1, beacon, policy ?? '');
        const control = await beaconReferer(browser, PORT + 1, beacon, 'unsafe-url');
        results.readings[`B1 ${name}`] = { policy, referer: sent, controlReferer: control };
        if (!control || !control.includes('zq-poster-4f1c9a')) controlFailures.push(`C4 ${name}: unsafe-url sent ${control}`);
        if (sent && sent.includes('zq-poster-4f1c9a')) observed.push(`B1 ${name}`);
        log(`B1 ${name}: Referrer-Policy ${policy} → Referer ${sent} · control unsafe-url → ${control}`);
      }
    } finally {
      beacon.server.close();
    }
  }
  if (wants('T1')) {
    const webkit = h.engine === 'webkit' ? h.browser : await engines.webkit.launch();
    try {
      for (const [name, browser] of [['chromium', chromium], ['firefox', firefoxPlain], ['webkit', webkit]]) {
        for (const viewport of AUTH_VIEWPORTS) {
          for (const mode of ['signin', 'signup']) {
            const r = await authTermsLine(h, browser, viewport, mode);
            const key = `T1 ${name} ${viewport.width}x${viewport.height} ${mode}`;
            results.readings[key] = r;
            if (!r.rendered || !r.googleInFirstView) controlFailures.push(`C5 ${key}: Google button rendered ${r.rendered}, in first view ${r.googleInFirstView}`);
            else if (r.count !== 1 || r.gap === null || r.gap > NEXT_TO_GOOGLE_PX || !r.lineInFirstView) observed.push(key);
            log(`${key}: lines ${r.count} · Google ${JSON.stringify(r.google)} · line ${JSON.stringify(r.line)} · gap ${r.gap} · line in first view ${r.lineInFirstView}`);
          }
        }
      }
    } finally {
      if (webkit !== h.browser) await webkit.close().catch(() => {});
    }
  }
} finally {
  await firefoxGpc.close().catch(() => {});
  await firefoxPlain.close().catch(() => {});
  if (chromium !== h.browser) await chromium.close().catch(() => {});
  await h.stop();
}

finish(results, observed, controlFailures, h.out);
