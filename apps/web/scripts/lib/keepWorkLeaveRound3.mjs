/**
 * Record 38's review round 3 (docs/fixes/38-save-on-leave.md, section 9):
 * the reviewer's probes that found a defect, folded in, the information
 * cells the record cites, and one new cell that makes R3-2's race
 * deterministic. Run by scripts/keep-work-check.mjs with the other leave
 * scenarios (lib/keepWorkLeave.mjs), whose helpers these use; `--only L`
 * runs them, `--only LW,L4-cut,L4-gap,L4-slow-past,L3-inapp-two` these only.
 *
 * The reviewer's ids, for its evidence: R3-win-* is `LW-*` (R3-1: a save the
 * server answered with an error counted as one the browser cut off), R3-gap-
 * <d> is `L4-gap-<d>` (R3-2: WebKit's Back with the newer change's own 800 ms
 * wait firing between the cut and beforeunload; a sweep over d, set by
 * KEEP_WORK_GAP, e.g. `766-786`; none by default), R3-slow-* is
 * `L4-slow-past-settle-*` (R3-4), R3-two-close is `L3-inapp-two-kept-close`
 * (R3-7, information). New here: `L4-cut-then-debounce-<way>` (R3-2 without
 * the race: the held save fails to the page with no answer, as a browser's
 * cut, while the server applies it 1.5 s later; the newer change's own wait
 * fires 80 ms after that failure, and the page is left 130 ms after it).
 *
 * Own instruments (the reviewer's): the page's trace (`pageTrace`: each
 * poster data write, which markers its body holds, keepalive or not, its
 * outcome, and the leave events, by the page's clock, in localStorage so it
 * outlives the page) and a hold route (`holdRules`: a PATCH whose body holds
 * given markers is held, then applied as the fake applies it, answered 500,
 * aborted, or failed to the page and applied later), keyed on the body, not
 * on arrival order, so the thumbnail's own PATCH does not shift it.
 */
import { sleep } from './editorHarness.mjs';
import { makeRow } from './guestBackend.mjs';
import { rowOf, savePill } from './keepWorkKit.mjs';
import { WAYS, has, recordWrites, typeWord, waitSheet, watchDialogs, writesMade } from './keepWorkLeave.mjs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const ZERO_ROWS = { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'Cannot coerce the result to a single JSON object' };
const SERVER = { code: 'XX000', details: null, hint: null, message: 'internal server error' };

const subOf = (auth) => {
  const p = String(auth ?? '').replace(/^Bearer\s+/i, '').split('.');
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString()).sub ?? null; } catch { return null; }
};

// ------------------------------------------------------------------ instruments

/**
 * The page's own trace (localStorage, outlives the page). `marks` = [[label,
 * word], ...]; `keys`: each keydown recorded too (`key@t`).
 */
function pageTraceScript({ marks, keys = false }) {
  if (window.__zq3) return;
  window.__zq3 = true;
  const put = (e) => {
    try {
      const n = Number(localStorage.getItem('zq3-n') ?? '0');
      localStorage.setItem('zq3-n', String(n + 1));
      localStorage.setItem(`zq3-${n}`, JSON.stringify({ t: performance.timeOrigin + performance.now(), e }));
    } catch { /* trace only */ }
  };
  const tags = (body) => marks.filter(([, w]) => body.includes(w)).map(([l]) => l).join('') || '-';
  const orig = window.fetch;
  window.fetch = function zq3Fetch(input, init) {
    const url = String(input?.url ?? input);
    const body = String(init?.body ?? '');
    const isWrite = /\/rest\/v1\/posters\?/.test(url) && init?.method === 'PATCH' && body.includes('"data"');
    const tag = isWrite ? tags(body) : null;
    if (isWrite) put(`fetch:${tag}${init.keepalive ? ':ka' : ''}`);
    const p = orig.apply(this, arguments);
    if (isWrite) p.then((r) => put(`ok:${tag}:${r.status}`), (err) => put(`fail:${tag}:${String(err).slice(0, 24)}`));
    return p;
  };
  for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => put(ev), true);
  if (keys) addEventListener('keydown', () => put('key'), true);
}
async function pageTrace(s, marks, { keys = false } = {}) {
  await s.context.addInitScript(pageTraceScript, { marks, keys });
  if (!s.page.isClosed()) await s.page.evaluate(pageTraceScript, { marks, keys }).catch(() => {});
}
async function readTrace(h, s, since) {
  const p = await s.context.newPage();
  try {
    await p.goto(`${h.base}/version.json`);
    const all = await p.evaluate(() => Array.from({ length: Number(localStorage.getItem('zq3-n') ?? '0') }, (_, i) => JSON.parse(localStorage.getItem(`zq3-${i}`) ?? 'null')).filter(Boolean));
    return all.filter((x) => x.t >= since).map((x) => `${x.e}@${Math.round(x.t - since)}`);
  } finally { await p.close().catch(() => {}); }
}
/** The time (ms) of the first trace entry matching `re`, or null. */
const traceAt = (trace, re) => { const e = trace.find((x) => re.test(x)); return e ? Number(e.split('@').at(-1)) : null; };
/** The time (ms) of the last trace entry matching `re` before `before`, or null. */
const traceLastBefore = (trace, re, before) => {
  const ts = trace.filter((x) => re.test(x)).map((x) => Number(x.split('@').at(-1))).filter((t) => t < before);
  return ts.length ? ts.at(-1) : null;
};

/** Apply a PATCH body to the fake's row, as the fake does, and log it (status 200, or 406 with no row). */
function applyPatch(state, req, body, label) {
  let b = {};
  try { const x = JSON.parse(body || '{}'); b = Array.isArray(x) ? x[0] : x; } catch { /* keep */ }
  const keys = Object.keys(b);
  const dataStr = b.data ? JSON.stringify(b.data) : '';
  const sub = subOf(req.headers().authorization);
  const url = new URL(req.url());
  const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
  const targets = state.rows.filter((r) => r.user_id === sub && r.id === id);
  if (!targets.length) {
    state.log.push({ t: Date.now(), method: 'PATCH', path: url.pathname, status: 406, sub, keys, dataStr, r3: `${label}-zero` });
    return null;
  }
  Object.assign(targets[0], b, { updated_at: new Date().toISOString() });
  state.log.push({ t: Date.now(), method: 'PATCH', path: url.pathname, status: 200, sub, keys, dataStr, r3: label });
  return targets[0];
}

/**
 * Hold rules on poster PATCHes, matched on the body: { has: [words], not:
 * [words], ms, then, times (default 1) }. `then`: 'ok' applies the write after
 * the hold (a server that received it) and answers it even if the page has
 * gone; 'server' answers 500 (nothing stored); 'network' aborts it; 'cut'
 * waits for `gate`, aborts it to the page (no answer: as a browser's cut),
 * and applies it on the server `applyMs` later. Every PATCH arrival is
 * recorded on `s.arrivals` ({ t, body }), held or not.
 */
async function holdRules(s, rules) {
  s.arrivals = [];
  const { state } = s;
  await s.context.route((u) => u.href.startsWith('https://dummy.supabase.co/rest/v1/posters'), async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    const body = req.postData() ?? '';
    s.arrivals.push({ t: Date.now(), body });
    const rule = rules.find((r) => (r.used ?? 0) < (r.times ?? 1) && r.has.every((w) => body.includes(w)) && !(r.not ?? []).some((w) => body.includes(w)));
    if (!rule) return route.fallback();
    rule.used = (rule.used ?? 0) + 1;
    if (rule.ms) await sleep(rule.ms);
    const dataStr = (() => { try { return JSON.stringify(JSON.parse(body).data ?? ''); } catch { return ''; } })();
    const sub = subOf(req.headers().authorization);
    if (rule.then === 'server') {
      state.log.push({ t: Date.now(), method: 'PATCH', path: '/rest/v1/posters', status: 500, sub, keys: ['data'], dataStr, r3: 'server' });
      return route.fulfill({ status: 500, contentType: 'application/json', headers: CORS, body: JSON.stringify(SERVER) }).catch(() => {});
    }
    if (rule.then === 'network') {
      state.log.push({ t: Date.now(), method: 'PATCH', path: '/rest/v1/posters', status: 'aborted', sub, keys: ['data'], dataStr, r3: 'network' });
      return route.abort('internetdisconnected').catch(() => {});
    }
    if (rule.then === 'cut') {
      await Promise.race([rule.gate, sleep(15000)]);
      state.log.push({ t: Date.now(), method: 'PATCH', path: '/rest/v1/posters', status: 'aborted', sub, keys: ['data'], dataStr, r3: 'cut' });
      await route.abort('internetdisconnected').catch(() => {});
      await sleep(rule.applyMs ?? 1500);
      applyPatch(state, req, body, 'cut-applied');
      return undefined;
    }
    const row = applyPatch(state, req, body, 'held');
    const wantsObject = (req.headers().accept || '').includes('vnd.pgrst.object');
    if (!row) return route.fulfill({ status: wantsObject ? 406 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(wantsObject ? ZERO_ROWS : []) }).catch(() => {});
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(wantsObject ? row : [row]) }).catch(() => {});
  });
}

/** Data writes applied (status 200) since t0, in order: `{ t, tags }`, the labels of `marks` each body holds. */
function applied(state, t0, marks) {
  return state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.status === 200 && x.keys?.includes('data'))
    .map((x) => ({ t: x.t - t0, tags: marks.filter(([, w]) => (x.dataStr ?? '').includes(w)).map(([l]) => l).join('') }));
}
/** Older over newer: a write without `newerLabel` applied after one with it. */
const olderOverNewer = (list, newerLabel) => {
  const i = list.findIndex((x) => x.tags.includes(newerLabel));
  return i >= 0 && list.slice(i + 1).some((x) => !x.tags.includes(newerLabel));
};
const appliedText = (list) => JSON.stringify(list.map((x) => `@${x.t}${x.tags ? `+${x.tags}` : ''}`));
const madeText = (made) => JSON.stringify(made.map((w) => `${w.ka ? 'ka' : 'plain'}@${w.at}${w.has ? '+' : ''}`));
const storedTags = (state, id, marks) => marks.filter(([, w]) => has(state, id, w)).map(([l]) => l).join('') || '-';

async function waitUntil(fn, ms, every = 2) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(every); }
  return null;
}
async function storedWithinMs(state, id, words, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (words.every((w) => has(state, id, w))) return Date.now() - t0;
    await sleep(50);
  }
  return null;
}
function deferred() {
  let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// ------------------------------------------------------------------ LW: a failure 200 ms or less before a leave (R3-1)

/**
 * The first save of `word` answered at once with `fault` (server: 500, the
 * server stored nothing; network: aborted, no answer); every later save
 * accepted. The tab close asked `gapMs` after the failure, Leave or Stay.
 * Claims: WL the word not stored 3 s after a close that left (lost after the
 * dialog); WS (Stay) not stored within 3 s of the close. `info`: printed,
 * not counted (the rule's cost: a failure with no answer this close to a
 * leave is counted as the leave's cut).
 */
function winCell(id, word, { fault, gapMs, answer = 'accept', info = false }) {
  const marks = [['W', word]];
  return {
    id, ...(info ? { info: true } : { claims: answer === 'accept' ? ['WL'] : ['WS'] }),
    how: `${info ? 'information (the rule\'s cost): ' : ''}the first save of " ${word}" ${fault === 'server' ? 'answered 500 by the server (nothing stored)' : 'aborted (the network: no answer)'}; later saves accepted; the tab close asked ${gapMs} ms after the failure, ${answer === 'accept' ? 'Leave' : 'Stay'}: stored?`,
    async run(h, s) {
      await pageTrace(s, marks);
      await recordWrites(s);
      const { page, state, id: pid } = s;
      await holdRules(s, [{ has: [word], ms: 0, then: fault }]);
      const dialogs = watchDialogs(page, answer);
      const tStart = Date.now();
      await typeWord(page, word);
      const fail = await waitUntil(() => state.log.find((x) => x.method === 'PATCH' && x.r3 === fault && (x.dataStr ?? '').includes(word)), 5000, 1);
      if (!fail) throw new Error('precondition: the failing save did not arrive');
      await sleep(Math.max(0, gapMs - (Date.now() - fail.t)));
      const tClose = Date.now();
      await page.close({ runBeforeUnload: true });
      let within = null;
      const pills = [];
      if (answer === 'dismiss') {
        const t1 = Date.now();
        while (Date.now() - t1 < 14000) {
          if (has(state, pid, word)) { within = Date.now() - t1; break; }
          if (pills.length < 3 && Date.now() - t1 > pills.length * 4000 + 1000) pills.push(await savePill(page).catch(() => null));
          await sleep(50);
        }
      } else await sleep(3000);
      const kept = has(state, pid, word);
      const made = await writesMade(h, s, fail.t - 20, word);
      const numbers = {
        closeAfterFailMs: tClose - fail.t, dialog: dialogs.n, stored: kept, ...(answer === 'dismiss' ? { storedMsAfterStay: within, pills: JSON.stringify(pills) } : {}),
        writesMadeAfterFail: madeText(made), trace: JSON.stringify(await readTrace(h, s, tStart)),
      };
      if (info) return { numbers };
      return { claims: answer === 'accept' ? { WL: !kept } : { WS: within === null || within > 3000 }, numbers };
    },
  };
}

/** A save waiting on a write the server answers after `holdMs`, with no leave: how long after the failure does it arrive? */
function waitingCell(id, [A, B], fault, { claim = null } = {}) {
  const marks = [['A', A], ['B', B]];
  return {
    id, ...(claim ? { claims: [claim] } : { info: true }),
    how: `${claim ? '' : 'information (the rule\'s cost): '}the first save held 2 s, then ${fault === 'server' ? 'answered 500 (nothing stored)' : 'aborted (no answer)'}; a newer word typed 1 s in (its save up at ~1.95 s, waiting on the held one); no leave: ${claim ? `the waiting save sent 150 ms or more after the failure (${claim}: held as if the browser had cut it)?` : 'how long after the failure does the waiting save arrive?'}`,
    async run(h, s) {
      await pageTrace(s, marks);
      const { page, state } = s;
      await holdRules(s, [{ has: [A], not: [B], ms: 2000, then: fault }]);
      const tStart = Date.now();
      await typeWord(page, A);
      await sleep(1000);
      await typeWord(page, B);
      await sleep(4500);
      const fail = state.log.find((x) => x.r3 === fault);
      const next = s.arrivals.find((x) => x.body.includes(B) && x.body.includes('"data"'));
      const after = fail && next ? next.t - fail.t : null;
      const numbers = { failAtMs: fail ? fail.t - tStart : null, waitingSaveArrivedAfterFailMs: after, storedB: has(state, s.id, B), trace: JSON.stringify(await readTrace(h, s, tStart)) };
      return claim ? { claims: { [claim]: after === null || after >= 150 }, numbers } : { numbers };
    },
  };
}

const WIN = [
  winCell('LW-500-close-60', 'ZQ3W5A', { fault: 'server', gapMs: 60 }),
  winCell('LW-500-close-150', 'ZQ3W5B', { fault: 'server', gapMs: 150 }),
  winCell('LW-500-close-400', 'ZQ3W5C', { fault: 'server', gapMs: 400 }),
  winCell('LW-net-close-60', 'ZQ3WNA', { fault: 'network', gapMs: 60, info: true }),
  winCell('LW-net-close-400', 'ZQ3WNC', { fault: 'network', gapMs: 400 }),
  winCell('LW-500-stay-60', 'ZQ3WSA', { fault: 'server', gapMs: 60, answer: 'dismiss' }),
  {
    // Correction 1's rule (a write out at the leave that then fails is a
    // cut) for a write the SERVER answers 500 after the leave event: the
    // server's answer says it stored nothing.
    id: 'LW-held500-stay', claims: ['WS'],
    how: 'the first save of " ZQ3WH" held 1 s, then answered 500 (nothing stored); 300 ms after it arrived the tab close asked, Stay; later saves accepted: not stored within 3 s of the close (WS)?',
    async run(h, s) {
      const A = 'ZQ3WH';
      await pageTrace(s, [['A', A]]);
      await recordWrites(s);
      const { page, state, id } = s;
      await holdRules(s, [{ has: [A], ms: 1000, then: 'server' }]);
      const dialogs = watchDialogs(page, 'dismiss');
      const tStart = Date.now();
      await typeWord(page, A);
      const arrived = await waitUntil(() => s.arrivals.find((x) => x.body.includes(A)), 5000, 2);
      if (!arrived) throw new Error('precondition: no save arrived');
      await sleep(300);
      const tc = Date.now();
      await page.close({ runBeforeUnload: true });
      const within = await storedWithinMs(state, id, [A], 14000);
      return {
        claims: { WS: within === null || within > 3000 },
        numbers: { dialog: dialogs.n, storedMsAfterClose: within, writesMadeAfterClose: madeText(await writesMade(h, s, tc, A)), trace: JSON.stringify(await readTrace(h, s, tStart)) },
      };
    },
  },
  waitingCell('LW-waiting-save-500', ['ZQ3WWA', 'ZQ3WWB'], 'server', { claim: 'LWw' }),
  waitingCell('LW-waiting-save-net', ['ZQ3WXA', 'ZQ3WXB'], 'network'),
];

// ------------------------------------------------------------------ L4-cut / L4-gap: a timer's save between the cut and the leave (R3-2)

/**
 * When the held save fails to the page, and when the page is left, after the
 * newer word's typing returned (its own 800 ms wait fires about 775 ms after,
 * by the page's clock; the leave's beforeunload comes about 40 ms after the
 * call): the failure about 55 ms before that wait fires, the leave about
 * 65 ms after it and 120 ms after the failure.
 */
const FAIL_AFTER_B_MS = 720;
const LEAVE_AFTER_B_MS = 800;
/** The debounce (useAutosave.ts DEBOUNCE_MS) and the window (CUT_BEFORE_LEAVE_MS) the interleaving must fall in. */
const DEBOUNCE_MS = 800;
const WINDOW_MS = 200;

function cutThenDebounceCell(wayName) {
  const way = WAYS[wayName];
  const tag = wayName.slice(0, 2).toUpperCase();
  const [A, B] = [`ZQCD${tag}A`, `ZQCD${tag}B`];
  const marks = [['A', A], ['B', B]];
  return {
    id: `L4-cut-then-debounce-${wayName}`, claims: ['L4', 'L4d'],
    how: `the first save of " ${A}" held, then failed to the page with no answer (a browser's cut) while the server applies it 1.5 s later; " ${B}" typed 300 ms after that save left; the failure ${FAIL_AFTER_B_MS} ms after B's last key (B's own 800 ms wait running, nothing out), then ${way.how} ${LEAVE_AFTER_B_MS} ms after it: a write without B applied after one with it (L4)? B lost with no dialog (L4d)?`,
    async run(h, s) {
      await pageTrace(s, marks, { keys: true });
      await recordWrites(s);
      if (way.prepare) await way.prepare(h, s);
      const { page, state } = s;
      const gate = deferred();
      await holdRules(s, [{ has: [A], not: [B], then: 'cut', gate: gate.promise, applyMs: 1500 }]);
      const dialogs = watchDialogs(page);
      const tStart = Date.now();
      await typeWord(page, A);
      if (!(await waitUntil(() => s.arrivals.find((x) => x.body.includes(A)), 5000, 2))) throw new Error('precondition: A\'s save did not arrive');
      await sleep(300);
      await typeWord(page, B);
      const tB = Date.now();
      await sleep(Math.max(0, FAIL_AFTER_B_MS - (Date.now() - tB)));
      gate.resolve();
      await sleep(Math.max(0, LEAVE_AFTER_B_MS - (Date.now() - tB)));
      const t0 = Date.now();
      await way.leave(page, h);
      await sleep(3500);
      const list = applied(state, tStart, marks);
      const trace = await readTrace(h, s, tStart);
      const failA = traceAt(trace, /^fail:A:/);
      // WebKit keeps no trace written at a tab close that asks nothing (no
      // dialog: nothing unsaved); the leave's call stands in, a few ms before
      // its event. A leave later than that reads as older over newer (the
      // held save sent when the 200 ms end), not as clean.
      const leaveSeen = traceAt(trace, /^beforeunload@/) ?? traceAt(trace, /^pagehide@/);
      const bu = leaveSeen ?? t0 - tStart;
      const fetchB = traceAt(trace, /^fetch:AB/);
      // The interleaving, by the page's clock: the failure before B's own
      // wait fires (else that save waited on the held one), the leave after
      // it fired and inside the 200 ms after the failure. Otherwise the cell
      // measured something else: an instrument error, not a verdict.
      const lastKey = traceLastBefore(trace, /^key@/, bu);
      const due = lastKey === null ? null : lastKey + DEBOUNCE_MS;
      const made = failA !== null && bu !== null && due !== null && failA < due && bu >= due + 15 && bu < failA + WINDOW_MS;
      if (!made) throw new Error(`interleaving not made: failure @${failA}, B's wait due @${due}, leave @${bu}${leaveSeen === null ? ' (its call)' : ''}`);
      return {
        claims: { L4: olderOverNewer(list, 'B'), L4d: !has(state, s.id, B) && dialogs.n === 0 },
        numbers: {
          // The interleaving made: the failure, then the leave within 200 ms of it.
          failToLeaveMs: bu - failA, failBeforeWaitDueMs: due - failA, leaveAfterWaitDueMs: bu - due, leaveSeenByPage: leaveSeen !== null, bSentBeforeLeave: fetchB !== null && fetchB < bu,
          dialog: dialogs.n, applied: appliedText(list), stored: storedTags(state, s.id, marks),
          writesMadeFromLeave: madeText(await writesMade(h, s, t0 - 200, B)), trace: JSON.stringify(trace),
        },
      };
    },
  };
}

/**
 * The reviewer's sweep (R3-2 in the wild, WebKit's Back): the first save held
 * 2.5 s; A; 1 s; B; then Back `d` ms after B was typed, so that B's own 800 ms
 * wait fires around WebKit's cut of the held write. L4: older over newer.
 */
function gapCell(d) {
  const [A, B] = [`ZQ3G${d}A`, `ZQ3G${d}B`];
  const marks = [['A', A], ['B', B]];
  return {
    id: `L4-gap-${d}`, claims: ['L4'],
    how: `the first save held 2.5 s; " ${A}"; 1 s; " ${B}"; the browser's Back ${d} ms after B was typed (B's own wait near WebKit's cut of the held save): a write without B applied after one with it (L4)?`,
    async run(h, s) {
      await pageTrace(s, marks);
      await recordWrites(s);
      await WAYS.back.prepare(h, s);
      const { page, state } = s;
      await holdRules(s, [{ has: [A], not: [B], ms: 2500, then: 'ok' }]);
      const dialogs = watchDialogs(page);
      const tStart = Date.now();
      await typeWord(page, A);
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, B);
      const tb = Date.now();
      await sleep(Math.max(0, d - (Date.now() - tb)));
      await page.goBack({ timeout: 20000 }).catch(() => {});
      await sleep(4500);
      const list = applied(state, t0, marks);
      const trace = await readTrace(h, s, tStart);
      const failA = traceAt(trace, /^fail:A:/);
      const bu = traceAt(trace, /^beforeunload@/);
      const fetchB = traceAt(trace, /^fetch:AB(:ka)?@/);
      return {
        claims: { L4: olderOverNewer(list, 'B') },
        numbers: {
          failA, beforeunload: bu, fetchB, bInGap: failA !== null && bu !== null && fetchB !== null && fetchB >= failA && fetchB <= bu,
          applied: appliedText(list), stored: storedTags(state, s.id, marks), dialog: dialogs.n, trace: JSON.stringify(trace),
        },
      };
    },
  };
}
/** KEEP_WORK_GAP: `766-786` (a range) or `770,772` (a list). */
function gapList(spec) {
  if (!spec) return [];
  const m = /^(\d+)-(\d+)$/.exec(spec);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return spec.split(',').filter(Boolean).map(Number);
}

const GAP = [
  cutThenDebounceCell('close'),
  cutThenDebounceCell('address'),
  cutThenDebounceCell('back'),
  ...gapList(process.env.KEEP_WORK_GAP).map(gapCell),
];

// ------------------------------------------------------------------ L4-slow-past-settle: a next page slower than the 10 s settle (R3-4)

function slowCell(id, { holdMs, pageMs, how, info = false }) {
  const tag = id.slice(-2).toUpperCase();
  const [A, B] = [`ZQ3S${tag}A`, `ZQ3S${tag}B`];
  const marks = [['A', A], ['B', B]];
  return {
    id, ...(info ? { info: true } : { claims: ['L4'] }), how,
    async run(h, s) {
      await pageTrace(s, marks);
      await recordWrites(s);
      const { page, state } = s;
      await holdRules(s, [{ has: [A], not: [B], ms: holdMs, then: 'ok' }]);
      const name = `zq3slow${tag.toLowerCase()}`;
      await s.context.route(`${h.base}/${name}*`, async (route) => {
        await sleep(pageMs);
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>slow page</p>' }).catch(() => {});
      });
      const dialogs = watchDialogs(page);
      const tStart = Date.now();
      await typeWord(page, A);
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, B);
      const nav = page.goto(`${h.base}/${name}`, { timeout: pageMs + 15000 }).catch(() => {});
      await sleep(Math.max(holdMs, pageMs) + 2500);
      await nav;
      const list = applied(state, t0, marks);
      const numbers = {
        olderOverNewer: olderOverNewer(list, 'B'), dialog: dialogs.n, applied: appliedText(list), stored: storedTags(state, s.id, marks),
        writesMade: madeText(await writesMade(h, s, t0 - 50, B)), trace: JSON.stringify(await readTrace(h, s, tStart)),
      };
      return info ? { numbers } : { claims: { L4: numbers.olderOverNewer }, numbers };
    },
  };
}

const SLOW = [
  slowCell('L4-slow-past-settle-ps', { holdMs: 3000, pageMs: 12500, how: 'the first save held 3 s; a word; 1 s; a newer word; an address that answers after 12.5 s (the old page up past the 10 s settle): a write without the newer word applied after one with it (L4)? (printed: whether the newer word was stored, and by which write)' }),
  slowCell('L4-slow-past-settle-bd', { holdMs: 12500, pageMs: 14000, info: true, how: 'information (the record\'s stated bound, section 10): the first save held 12.5 s (the server applies it after the 10 s settle); a newer word; an address answering after 14 s: is the older applied over the newer?' }),
];

// ------------------------------------------------------------------ L3-inapp-two-kept-close: two kept changes at a close (R3-7)

const TWO = [
  {
    id: 'L3-inapp-two-kept-close', info: true,
    how: 'information: two posters; every save fails; " ZQ3TA" in the first, Back inside the app; the second opened from its card, " ZQ3TB", Back (two changes kept); the tab closed while saves still fail: the dialog, and the page\'s own writes of each at the close (each its own keepalive body, one shared quota)',
    async run(h, s) {
      const { state, id } = s;
      const owner = rowOf(state, id).user_id;
      const other = makeRow(owner, structuredClone(rowOf(state, id).data), { title: 'ZQ3 Second poster' });
      state.rows.push(other);
      await recordWrites(s);
      await WAYS.inapp.prepare(h, s);
      const { page } = s;
      const dialogs = watchDialogs(page);
      state.faults.patch = 'network';
      await typeWord(page, 'ZQ3TA');
      await sleep(2500);
      await page.goBack().catch(() => {});
      const card = page.locator(`a[href="/p/${other.id}"]`).first();
      await card.waitFor({ timeout: 30000 });
      await card.click();
      await waitSheet(page);
      await typeWord(page, 'ZQ3TB');
      await sleep(2500);
      await page.goBack().catch(() => {});
      await sleep(500);
      const tc = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(1500);
      const madeA = await writesMade(h, s, tc - 20, 'ZQ3TA');
      const madeB = await writesMade(h, s, tc - 20, 'ZQ3TB');
      return { numbers: { dialog: dialogs.n, writesA: madeText(madeA.filter((w) => w.has)), writesB: madeText(madeB.filter((w) => w.has)) } };
    },
  },
];

export const LEAVE_ROUND3 = [...WIN, ...GAP, ...SLOW, ...TWO];
