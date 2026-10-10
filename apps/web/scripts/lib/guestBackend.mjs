/**
 * guestBackend.mjs — a fake Supabase backend for browser harnesses that need
 * what lib/editorHarness.mjs's mocks do not model (first written for the
 * ranking evidence of 2026-09-30, docs/fixes/23-new-poster-owner-only.md):
 *
 *   - ANONYMOUS sessions, a new user id per signInAnonymously() call (a real
 *     Auth server mints a new guest each time);
 *   - the posters table's row-level security as the migrations define it
 *     (supabase/migrations/20260408000600_rls_perf.sql, "posters_select"
 *     and the owner-only write policies): a read sees own rows OR is_public
 *     rows; an insert or update touches only own rows. The user is read from
 *     each request's Bearer JWT `sub`, so a request sees what PostgREST
 *     would show that session;
 *   - PostgREST's shapes: `.single()` on 0 rows is 406 PGRST116; GET filters
 *     `col=eq.value`, `order=updated_at.desc`, `limit`;
 *   - fault injection through `state.faults` (patch, load, post, signup,
 *     refresh, postDelayMs, and `patchDelays`: a queue of delays, one per
 *     PATCH in arrival order, each held before the row is written, so an
 *     earlier save can land after a later one, as two requests in flight
 *     can on the real network; fix 27);
 *   - the plan the users row reports (`newState({ plan: 'term' })` for a
 *     term holder, who may export to PowerPoint; default 'free'; fix 27);
 *   - the poster_versions table (fix 27): owner-only reads, inserts and
 *     deletes, and the database's cap of 30 versions per poster
 *     (20260702000000_poster_versions.sql: the 31st insert raises P0001,
 *     which PostgREST answers with 400).
 *
 * Nothing in the app is stubbed; only the network is faked. Use it with
 * editorHarness.mjs's startHarness (the app's own Vite server + a browser).
 */
import { randomUUID } from 'node:crypto';

export const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);

/** The DB default for posters.data (20260408000100_posters.sql). */
export const DEFAULT_DATA = {
  version: 1, widthIn: 48, heightIn: 36, blocks: [], fontFamily: 'Source Sans 3',
  palette: { bg: '#FFFFFF', primary: '#1a1a2e', accent: '#0f4c75', accent2: '#3282b8', muted: '#6c757d', headerBg: '#0f4c75', headerFg: '#fff' },
  styles: {
    title: { size: 22, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
    heading: { size: 8, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
    authors: { size: 5, weight: 400, italic: false, lineHeight: 1.5, color: null, highlight: null },
    body: { size: 5, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [], authors: [], references: [],
};

export function newState({ anonymous = true, expiresIn = 3600, plan = 'free' } = {}) {
  return {
    anonymous, expiresIn, plan,
    users: new Map(), // id -> user
    deleted: new Set(),
    rows: [], // posters table
    versions: [], // poster_versions table
    faults: { patch: 'ok', load: 'ok', post: 'ok', signup: 'ok', refresh: 'ok', postDelayMs: 0, patchDelays: [] },
    log: [], // every posters/auth request: {t, method, path, status, sub, keys}
    signups: [],
    aborted: [], errors: [], console: [],
  };
}

function makeJwt(sub, anonymous, expiresIn) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub, aud: 'authenticated', role: 'authenticated', is_anonymous: anonymous,
    iat: now, exp: now + expiresIn, session_id: randomUUID(),
  })}.c2lnbmF0dXJl`;
}
function subOf(req) {
  const h = req.headers().authorization || '';
  const tok = h.replace(/^Bearer\s+/i, '');
  const parts = tok.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).sub ?? null; } catch { return null; }
}
export function makeUser(state, id = randomUUID()) {
  const t = new Date().toISOString();
  const u = state.anonymous
    ? { id, aud: 'authenticated', role: 'authenticated', email: '', phone: '', is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [], created_at: t, updated_at: t, last_sign_in_at: t }
    : { id, aud: 'authenticated', role: 'authenticated', email: 'jane.doe@example.test', phone: '', is_anonymous: false, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: t, updated_at: t, last_sign_in_at: t, email_confirmed_at: t };
  state.users.set(id, u);
  return u;
}
/** A session for user `uid`, as the Auth server returns it. */
export function sessionFor(state, uid) {
  const user = state.users.get(uid);
  return {
    access_token: makeJwt(uid, !!user?.is_anonymous, state.expiresIn), token_type: 'bearer', expires_in: state.expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + state.expiresIn, refresh_token: `rt-${uid}`, user,
  };
}

/** A posters row with the DB defaults. */
export function makeRow(userId, data, extra = {}) {
  const t = new Date().toISOString();
  return {
    id: randomUUID(), user_id: userId, title: 'Untitled Poster', width_in: data.widthIn ?? 48, height_in: data.heightIn ?? 36,
    data, thumbnail_path: null, share_slug: null, is_public: false, created_at: t, updated_at: t, ...extra,
  };
}

const PG = {
  refused: { status: 403, body: { code: '42501', details: null, hint: null, message: 'permission denied for table posters' } },
  server: { status: 500, body: { code: 'XX000', details: null, hint: null, message: 'internal server error' } },
  jwt: { status: 401, body: { code: 'PGRST301', details: null, hint: null, message: 'JWT expired' } },
  zeroRows: { status: 406, body: { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'Cannot coerce the result to a single JSON object' } },
};

function applyFilters(rows, url) {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (!m) continue;
    out = out.filter((r) => String(r[k]) === m[1]);
  }
  const order = /^(updated_at|created_at)\.desc/.exec(url.searchParams.get('order') ?? '');
  if (order) out = [...out].sort((a, b) => String(b[order[1]]).localeCompare(String(a[order[1]])));
  const limit = url.searchParams.get('limit');
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

/**
 * Install the fake backend on a browser context. `base` is the dev server.
 * `onboarding` false marks the tour done (as the frozen harness does).
 */
export async function installGuestBackend(context, state, base, { tour = false } = {}) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const json = (route, body, status = 200, headers = {}) => route.fulfill({
    status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body),
  });
  const rec = (entry) => { state.log.push({ t: Date.now(), ...entry }); };

  // poster_versions, as 20260702000000_poster_versions.sql defines it: the
  // owner reads, inserts (only onto a poster they own) and deletes; a
  // trigger refuses a 31st version of one poster.
  let versionClock = 0;
  const versionsRoute = (route, req, url, method, sub, wantsObject) => {
    const p = url.pathname;
    if (method === 'GET') {
      const rows = applyFilters(state.versions.filter((v) => v.user_id === sub), url);
      rec({ method, path: p, status: 200, sub, n: rows.length });
      if (wantsObject) return rows.length === 1 ? json(route, rows[0]) : json(route, PG.zeroRows.body, 406);
      return json(route, rows);
    }
    if (method === 'DELETE') {
      const gone = applyFilters(state.versions.filter((v) => v.user_id === sub), url).map((v) => v.id);
      state.versions = state.versions.filter((v) => !gone.includes(v.id));
      rec({ method, path: p, status: 204, sub, n: gone.length });
      return json(route, undefined, 204);
    }
    if (method === 'POST') {
      let b = {};
      try { const body = JSON.parse(req.postData() || '{}'); b = Array.isArray(body) ? body[0] : body; } catch { /* keep {} */ }
      const owns = state.rows.some((r) => r.id === b.poster_id && r.user_id === sub);
      if (!sub || b.user_id !== sub || !owns) {
        rec({ method, path: p, status: 403, sub });
        return json(route, { code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "poster_versions"' }, 403);
      }
      const count = state.versions.filter((v) => v.poster_id === b.poster_id).length;
      if (count >= 30) {
        rec({ method, path: p, status: 400, sub, n: count, name: b.name });
        return json(route, { code: 'P0001', details: null, hint: null, message: 'version limit: max 30 versions per poster' }, 400);
      }
      versionClock += 1;
      const row = {
        id: randomUUID(), poster_id: b.poster_id, user_id: sub, name: b.name ?? '', data: b.data,
        created_at: new Date(Date.now() + versionClock).toISOString(),
      };
      state.versions.push(row);
      rec({ method, path: p, status: 201, sub, n: count + 1, name: row.name });
      return json(route, wantsObject ? row : [row], 201);
    }
    return json(route, {}, 405);
  };

  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    if (u.startsWith('https://dummy.supabase.co/') || u.startsWith('http://localhost:3000/')) return route.fallback();
    state.aborted.push(u.slice(0, 120));
    return route.abort();
  });

  await context.route('https://dummy.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') return json(route, undefined, 204);
    const sub = subOf(req);

    // ---------------------------------------------------------------- auth
    if (p === '/auth/v1/signup') {
      if (state.faults.signup === 'server') { rec({ method, path: p, status: 500 }); return json(route, { code: 500, error_code: 'unexpected_failure', msg: 'Unexpected failure' }, 500); }
      if (state.faults.signup === 'ratelimit') { rec({ method, path: p, status: 429 }); return json(route, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 429); }
      const u = makeUser(state);
      state.signups.push({ t: Date.now(), id: u.id });
      rec({ method, path: p, status: 200, newUser: u.id });
      return json(route, sessionFor(state, u.id));
    }
    if (p === '/auth/v1/token') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch { /* keep */ }
      const uid = String(body.refresh_token || '').replace(/^rt-/, '');
      if (state.faults.refresh === 'revoked' || state.deleted.has(uid) || !state.users.has(uid)) {
        rec({ method, path: p, status: 400, grant: url.searchParams.get('grant_type') });
        return json(route, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
      }
      rec({ method, path: p, status: 200, grant: url.searchParams.get('grant_type') });
      return json(route, sessionFor(state, uid));
    }
    if (p === '/auth/v1/user') {
      if (!sub || state.deleted.has(sub) || !state.users.has(sub)) {
        rec({ method, path: p, status: 403, sub });
        return json(route, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }, 403);
      }
      rec({ method, path: p, status: 200, sub });
      return json(route, state.users.get(sub));
    }
    if (p === '/auth/v1/logout') return json(route, undefined, 204);
    if (p.startsWith('/auth/v1/')) return json(route, {});
    if (p.startsWith('/rest/v1/rpc/')) return json(route, null);

    // ---------------------------------------------------------------- rest
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const wantsObject = (req.headers().accept || '').includes('vnd.pgrst.object');
      if (table === 'posters') {
        if (method === 'GET') {
          if (state.faults.load !== 'ok') {
            const f = PG[state.faults.load];
            rec({ method, path: p, status: f.status, sub, fault: state.faults.load });
            return json(route, f.body, f.status);
          }
          const visible = state.rows.filter((r) => r.user_id === sub || r.is_public);
          const rows = applyFilters(visible, url);
          rec({ method, path: p, status: 200, sub, n: rows.length, q: url.search.slice(0, 160) });
          if (wantsObject) return rows.length === 1 ? json(route, rows[0]) : json(route, PG.zeroRows.body, 406);
          return json(route, rows);
        }
        let b = {};
        try { const body = JSON.parse(req.postData() || '{}'); b = Array.isArray(body) ? body[0] : body; } catch { /* keep {} */ }
        const keys = Object.keys(b);
        const dataStr = b.data ? JSON.stringify(b.data) : '';
        if (method === 'PATCH') {
          const delay = state.faults.patchDelays?.length ? state.faults.patchDelays.shift() : 0;
          if (delay) await sleep(delay);
          const fault = state.faults.patch;
          if (fault === 'network') {
            rec({ method, path: p, status: 'aborted', sub, keys, dataStr, fault });
            return route.abort('internetdisconnected');
          }
          if (fault !== 'ok') {
            const f = PG[fault];
            rec({ method, path: p, status: f.status, sub, keys, dataStr, fault });
            return json(route, f.body, f.status);
          }
          const targets = applyFilters(state.rows.filter((r) => r.user_id === sub), url);
          if (targets.length === 0) {
            rec({ method, path: p, status: wantsObject ? 406 : 200, sub, keys, dataStr, rls: 'zero-rows' });
            return wantsObject ? json(route, PG.zeroRows.body, 406) : json(route, []);
          }
          const now = new Date().toISOString();
          for (const t of targets) Object.assign(t, b, { updated_at: now });
          rec({ method, path: p, status: 200, sub, keys, dataStr });
          return json(route, wantsObject ? targets[0] : targets);
        }
        if (method === 'POST') {
          if (state.faults.postDelayMs) await sleep(state.faults.postDelayMs);
          if (state.faults.post && state.faults.post !== 'ok') {
            const f = PG[state.faults.post];
            rec({ method, path: p, status: f.status, sub, keys, fault: state.faults.post });
            return json(route, f.body, f.status);
          }
          const uid = b.user_id;
          if (!sub || uid !== sub) {
            rec({ method, path: p, status: 403, sub, keys });
            return json(route, { code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "posters"' }, 403);
          }
          const row = makeRow(uid, b.data ?? structuredClone(DEFAULT_DATA), b);
          state.rows.push(row);
          rec({ method, path: p, status: 201, sub, keys, created: row.id });
          return json(route, wantsObject ? row : [row], 201);
        }
      }
      if (table === 'users') {
        const term = state.plan === 'term';
        const row = {
          id: sub, plan: term ? 'term' : 'free', plan_expires_at: term ? new Date(Date.now() + 30 * 86400e3).toISOString() : null,
          export_credits: 0, review_credits: 0, review_addon: false, subscription_status: term ? 'active' : null,
          research_consent_at: null, marketing_consent_at: null,
        };
        return json(route, wantsObject ? row : [row]);
      }
      if (table === 'poster_versions') return versionsRoute(route, req, url, method, sub, wantsObject);
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

/** A fresh context + page, with the fake backend and error capture. */
export async function newGuestPage(h, state, { viewport = { width: 1440, height: 900 } } = {}) {
  const context = await h.browser.newContext({ viewport });
  await installGuestBackend(context, state, h.base);
  const page = await context.newPage();
  page.on('pageerror', (e) => state.errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') state.console.push(m.text().slice(0, 200)); });
  return { context, page };
}

/** The first visitor's path: /p/new, wait for the editor and the URL to settle on /p/<id>. */
export async function openNewPoster(page, base) {
  await page.goto(`${base}/p/new`);
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  return page.url().split('/p/')[1];
}

/** Text of the autosave pill (role=status containing "Save"). */
export async function pillText(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('[role="status"]')];
    const el = els.find((e) => /Sav/.test(e.textContent || ''));
    return el ? el.textContent.trim() : null;
  });
}

/** Click the first body text block and type `text` with the real keyboard. */
export async function typeIntoTextBlock(page, text, { delay = 35 } = {}) {
  const block = page.locator('#poster-canvas [data-block-type="text"]').first();
  await block.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i += 1) {
    const ok = await page.evaluate(() => !!document.activeElement?.isContentEditable);
    if (ok) break;
    if (i < 2) await block.click(); else await block.locator('[contenteditable="true"]').first().click();
    await page.waitForTimeout(250);
  }
  const ok = await page.evaluate(() => !!document.activeElement?.isContentEditable);
  if (!ok) throw new Error('could not focus a text block contentEditable');
  await page.keyboard.press('End');
  await page.keyboard.type(text, { delay });
}

export async function waitFor(fn, { timeout = 10000, every = 100 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

/** PATCHes carrying `data` (autosave writes), optionally after time t. */
export const dataPatches = (state, since = 0) => state.log.filter((e) => e.method === 'PATCH' && e.keys?.includes('data') && e.t >= since);

/** Does the stored row hold `marker`? */
export const dbHas = (state, id, marker) => {
  const r = state.rows.find((x) => x.id === id);
  return !!r && JSON.stringify(r.data).includes(marker);
};

/** Does the canvas text hold `marker`? */
export const canvasHas = (page, marker) => page.evaluate((m) => (document.querySelector('#poster-canvas')?.textContent || '').includes(m), marker);

/**
 * Is a leave prompt armed? Closes the page with runBeforeUnload and waits for
 * the beforeunload dialog, which it accepts. Returns true when one appeared.
 */
export async function closeWithLeavePrompt(page, timeout = 3000) {
  let saw = false;
  page.on('dialog', async (d) => { if (d.type() === 'beforeunload') saw = true; await d.accept().catch(() => {}); });
  await page.close({ runBeforeUnload: true });
  const t0 = Date.now();
  while (!page.isClosed() && Date.now() - t0 < timeout) await sleep(50);
  await sleep(200);
  return saw;
}

/** Visible, focusable controls in the page (buttons and links). */
export async function controls(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a[href], [role="button"]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 40)));
}
