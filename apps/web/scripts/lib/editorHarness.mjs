/**
 * Shared scaffolding for real-browser editor harnesses: the app's own Vite
 * dev server in-process, Chromium through Playwright, and a fake backend at
 * the network layer (Supabase REST/Auth at https://dummy.supabase.co, the API
 * at http://localhost:3000). No store action is called; the editor is
 * driven the way a user drives it.
 *
 * Plain ESM on purpose: harnesses run in bare Node. The repo is POSTR_REPO or
 * the repo containing this file.
 *
 * POSTR_BROWSER=chromium (the default), firefox or webkit picks the engine
 * (Playwright's own builds: `npx playwright install firefox webkit`); the
 * harness reports it as `h.engine`.
 *
 * POSTR_SCROLLBARS=classic (Chromium and WebKit) draws scrollbars that take
 * space, 10 px, as on Windows and Linux, and in Safari set to always show
 * them; by default Playwright hides them, and macOS overlays them. A scrollbar that appears or goes when the sheet
 * resizes changes the canvas's size, which the default cannot show (the
 * step 9 review of fix 04's cause C, S9C-04).
 *
 * POSTR_MUTANT=<spec.mutants.json>#<name> serves that mutant's edited
 * sources instead of the files (the repo is never written), so a browser
 * scenario can show it goes red when a part of a fix is taken away:
 * scripts/blind-spot-check.mjs runs it for a spec's blind spots.
 *
 * POSTR_SERVE=preview serves the production build (apps/web/dist, made by
 * `npm run build`) with `vite preview` instead of the dev server: the code
 * users get, without React's StrictMode, which the dev server runs (each
 * effect run twice at mount). A mutant edits sources as the dev server
 * serves them, so POSTR_MUTANT is refused with it. From fix 27's review
 * round 2, whose reviewer measured the editor on the build with this switch.
 *
 * A page opened at a `route` the app redirects to another path throws
 * RouteRedirected at once, instead of waiting 90 s for a sheet that never
 * comes: a tree that hides a feature (fix 23 sends the share link /s/:slug
 * to /) has nothing for that scenario to measure. `sourceFlag` reads the
 * tree's own feature switch, so a scenario can tell that apart from a page
 * that redirects by mistake. It reads the file on disk, not a POSTR_MUTANT's
 * edited copy: a mutant that flips a switch in features.ts is not seen.
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json
 * (the build-stamp plugin). Restore it afterwards:
 *   git -C "$POSTR_REPO" checkout -- apps/web/public/version.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSpec, mutate, mutantPlugin } from './mutants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(process.env.POSTR_REPO ?? path.resolve(HERE, '../../../..'));
export const WEB = path.join(REPO, 'apps/web');
export const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Start Vite and Chromium. `name` names the default output folder.
 * Run from apps/web: Tailwind resolves its config from the working
 * directory, and from anywhere else the page renders unstyled, so every
 * measurement would be wrong while looking plausible.
 */
export async function startHarness({ name, port }) {
  if (path.resolve(process.cwd()) !== WEB) {
    throw new Error(`run from ${WEB} (the working directory is ${process.cwd()}): Tailwind reads its config from there`);
  }
  const base = `http://127.0.0.1:${port}`;
  const out = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), `postr-${name}-${port}`));
  fs.mkdirSync(out, { recursive: true });
  const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
  const engine = process.env.POSTR_BROWSER ?? 'chromium';
  if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error(`POSTR_BROWSER must be chromium, firefox or webkit, not "${engine}"`);
  const { createServer, preview } = await import(pathToFileURL(path.join(REPO, 'node_modules/vite/dist/node/index.js')).href);
  const mutant = mutantFromEnv();
  const serve = process.env.POSTR_SERVE || 'dev';
  if (!['dev', 'preview'].includes(serve)) throw new Error(`POSTR_SERVE must be preview or unset, not "${serve}"`);
  if (serve === 'preview' && mutant) throw new Error('POSTR_MUTANT needs the dev server: POSTR_SERVE=preview serves the built files as they are');
  if (serve === 'preview' && !fs.existsSync(path.join(WEB, 'dist/index.html'))) {
    throw new Error(`POSTR_SERVE=preview serves ${path.join(WEB, 'dist')}: run \`npm run build\` first`);
  }
  let server;
  if (serve === 'preview') {
    server = await preview({
      root: WEB, configFile: path.join(WEB, 'vite.config.ts'),
      preview: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn',
    });
  } else {
    server = await createServer({
      root: WEB, configFile: path.join(WEB, 'vite.config.ts'), cacheDir: path.join(out, '.vite-cache'),
      server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'warn',
      plugins: mutant ? [mutantPlugin(mutant.byFile)] : [],
    });
    await server.listen();
  }
  const scrollbars = process.env.POSTR_SCROLLBARS || 'default';
  if (!['default', 'classic'].includes(scrollbars)) throw new Error(`POSTR_SCROLLBARS must be classic or unset, not "${scrollbars}"`);
  // Chromium and WebKit draw styled ::-webkit-scrollbar ones in the layout;
  // Playwright's Firefox keeps overlay scrollbars whatever it is told.
  if (scrollbars === 'classic' && engine === 'firefox') throw new Error('POSTR_SCROLLBARS=classic needs POSTR_BROWSER=chromium or webkit');
  let browser;
  try {
    browser = await engines[engine].launch(scrollbars === 'classic' && engine === 'chromium' ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {});
  } catch (e) {
    await server.close().catch(() => {});
    throw e;
  }
  let git = 'n/a';
  try {
    git = (await import('node:child_process')).execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim();
  } catch { /* not a git checkout */ }
  log(`[harness] vite ${serve === 'preview' ? 'preview (the production build)' : 'dev'} on ${base} (repo ${REPO}, ${git})${mutant ? ` MUTANT ${mutant.name} (${mutant.byFile.size} file(s))` : ''}${scrollbars === 'classic' ? ' SCROLLBARS classic' : ''}`);
  return {
    base, out, git, browser, engine, scrollbars, serve, mutant: mutant?.name ?? null,
    async stop() {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

/** POSTR_MUTANT=<spec>#<name>, validated the way mutation-check validates it. */
function mutantFromEnv() {
  const env = process.env.POSTR_MUTANT;
  if (!env) return null;
  const at = env.lastIndexOf('#');
  if (at < 0) throw new Error('POSTR_MUTANT is <spec.mutants.json>#<mutant name>');
  const [specPath, name] = [path.resolve(env.slice(0, at)), env.slice(at + 1)];
  const m = loadSpec(specPath).mutants[name];
  if (!m) throw new Error(`no mutant "${name}" in ${specPath}`);
  return { name, byFile: mutate(WEB, m) };
}

// ---------------------------------------------------------------- fake backend
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeJwt(sub) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
    iat: now, exp: now + 86400, session_id: randomUUID(),
  })}.c2lnbmF0dXJl`;
}

/**
 * A fake backend holding one poster row (`state.row`) and recording every
 * write (`state.saves`). Anything that is not the dev server, a data/blob URL
 * or a faked host is aborted and recorded (`state.aborted`). The onboarding
 * tour is marked done unless `tour` is true.
 */
export async function installMocks(context, state, base, { tour = false } = {}) {
  const t = new Date().toISOString();
  const user = {
    id: state.userId, aud: 'authenticated', role: 'authenticated', email: 'jane.doe@example.test', phone: '',
    is_anonymous: false, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    identities: [], created_at: t, updated_at: t, last_sign_in_at: t, email_confirmed_at: t,
  };
  const session = () => ({
    access_token: makeJwt(state.userId), token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'fake-refresh', user,
  });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', headers: cors, body: body === undefined ? '' : JSON.stringify(body),
  });
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    if (u.startsWith('https://dummy.supabase.co/') || u.startsWith('http://localhost:3000/')) return route.fallback();
    state.aborted.push(u.slice(0, 120));
    return route.abort();
  });
  await context.route('https://dummy.supabase.co/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
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
          state.saves.push({ at: Date.now(), keys: Object.keys(b) });
          state.row = { ...state.row, ...b, updated_at: new Date().toISOString() };
          return json(route, wantsObject ? state.row : [state.row]);
        }
      }
      if (table === 'users') {
        const row = {
          id: state.userId, plan: 'term', plan_expires_at: new Date(Date.now() + 30 * 86400e3).toISOString(),
          export_credits: 0, review_credits: 0, review_addon: false, subscription_status: 'active',
          research_consent_at: null, marketing_consent_at: null,
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
  await context.addInitScript((showTour) => {
    try {
      if (!showTour) localStorage.setItem('postr.onboarding-done', 'true');
      localStorage.setItem('postr.mobile-notice-dismissed', 'true');
    } catch { /* ignore */ }
  }, tour);
}

/**
 * A poster doc from the app's REAL modules: the 3-column template laid out
 * for `w` × `h` inches, with text in its text blocks.
 */
export async function buildDoc(page, base, { w, h }) {
  await page.goto(`${base}/version.json`);
  return page.evaluate(async ({ w, h }) => {
    const t = await import('/src/poster/templates.ts');
    const c = await import('/src/poster/constants.ts');
    const { name: _n, ...palette } = c.PALETTES[0];
    let i = 0;
    const blocks = t.makeBlocks('3col', w, h).map((b) => {
      if (b.type === 'title') return { ...b, content: 'ZQTITLE Sleep Restriction and Working Memory' };
      if (b.type !== 'text') return b;
      i += 1;
      return { ...b, content: `<p>ZQSENT${i} Forty-eight participants completed the protocol.</p>` };
    });
    return {
      version: 1, widthIn: w, heightIn: h, blocks,
      fontFamily: 'Source Sans 3', palette, styles: c.DEFAULT_STYLES,
      headingStyle: { border: 'bottom', fill: false, align: 'left' },
      institutions: [{ id: 'i1', name: 'Acme State University', dept: 'Department of Psychology' }],
      authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: ['i1'], isCorresponding: true, equalContrib: false }],
      references: [],
    };
  }, { w, h });
}

/** The app sent a page opened at a route to another path (see the file's header). */
export class RouteRedirected extends Error {
  constructor(wanted, landed) {
    super(`${wanted} was redirected to ${landed}`);
    this.wanted = wanted;
    this.landed = landed;
  }
}

/**
 * A feature switch of the tree under test (apps/web/src/config/features.ts,
 * `export const NAME = true|false;`): true or false, or null when the tree
 * has no such switch.
 */
export function sourceFlag(name) {
  let src = '';
  try { src = fs.readFileSync(path.join(WEB, 'src/config/features.ts'), 'utf8'); } catch { return null; }
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(true|false)\\s*;`));
  return m ? m[1] === 'true' : null;
}

/**
 * A fresh browser context and editor page on a `w` × `h` inch poster.
 * `route` picks the page (default the editor, /p/:id). `ownedByOther` makes
 * the poster someone else's: an owner opening their own share link is sent
 * to the editor, so a share-page check needs a poster the user does not own.
 * `editDoc(doc)` returns a changed copy of the doc before it is stored.
 * `tour` leaves the onboarding tour to start, as for a first-time user.
 * `browser` and `scrollbars` override the harness's (a browser launched
 * with a device scale factor of its own); `viewport: null` takes that
 * browser's window as it is, with its own ratio.
 */
export async function openEditor(h, {
  viewport, poster, deviceScaleFactor = 1, route, ownedByOther = false, editDoc, tour = false,
  browser = h.browser, scrollbars = h.scrollbars,
}) {
  const context = await browser.newContext(viewport === null ? { viewport: null } : { viewport, deviceScaleFactor });
  if (scrollbars === 'classic') {
    await context.addInitScript(() => {
      // The standard scrollbar-width and scrollbar-color (the app sets both)
      // make Chromium draw its platform's scrollbars, overlaid on macOS, and
      // ignore these; unset, it draws these 10 px ones in the layout.
      const css = '*{scrollbar-width:auto!important;scrollbar-color:auto!important}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:#555}::-webkit-scrollbar-track{background:#222}';
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = css;
        document.head.append(st);
      });
    });
  }
  const state = { userId: randomUUID(), row: null, saves: [], aborted: [], errors: [] };
  await installMocks(context, state, h.base, { tour });
  const page = await context.newPage();
  page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 300)));
  const built = await buildDoc(page, h.base, poster);
  const doc = editDoc ? editDoc(built) : built;
  const t = new Date().toISOString();
  state.row = {
    id: randomUUID(), user_id: ownedByOther ? randomUUID() : state.userId, title: 'ZQ Display Name', width_in: poster.w, height_in: poster.h,
    data: doc, thumbnail_path: null, share_slug: 'zq-share', is_public: false, created_at: t, updated_at: t,
  };
  try {
    const wanted = route ? route(state.row) : `/p/${state.row.id}`;
    await page.goto(`${h.base}${wanted}`);
    if (route) {
      // The sheet, or the app sending the page somewhere else.
      const at = await page.waitForFunction(
        (w) => (document.querySelector('#poster-canvas [data-block-id]') ? 'sheet' : location.pathname !== w ? location.pathname : null),
        new URL(wanted, h.base).pathname, { timeout: 90000 },
      );
      const landed = await at.jsonValue();
      if (landed !== 'sheet') throw new RouteRedirected(wanted, landed);
    }
    await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
  return { context, page, state };
}
