/**
 * Record 38's review round 1 (docs/fixes/38-save-on-leave.md, section 9):
 * the reviewer's probes, folded in (R1-1, R1-2, R1-3, R1-7) and measured on
 * the branch before its correction, with the cases around them the
 * correction's rules reach (a change kept after the editor closed: the tab
 * closed, the backend back, the poster opened again). Run by
 * scripts/keep-work-check.mjs with the other leave scenarios
 * (lib/keepWorkLeave.mjs), whose helpers these use.
 */
import { sleep } from './editorHarness.mjs';
import { focusBlockEnd, textBlockIds } from './undoKit.mjs';
import { savePill } from './keepWorkKit.mjs';
import { AFTER_MS, WAYS, has, patchesSince, recordWrites, slowThenEdit, typeWord, waitSheet, watchDialogs, writesMade } from './keepWorkLeave.mjs';

const writesText = (made) => JSON.stringify(made.map((w) => `${w.ka ? 'ka' : 'plain'}@${w.at}${w.has ? '+' : ''}`));

/** Polls the stored row for `word` every 100 ms for up to `ms`: the ms it took, or null. */
async function storedWithin(state, id, word, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (has(state, id, word)) return Date.now() - t0;
    await sleep(100);
  }
  return has(state, id, word) ? Date.now() - t0 : null;
}

/** Stored writes since `t0` in the order applied, and whether one without `newer` was applied after one with it. */
function appliedOrder(state, t0, older, newer) {
  const applied = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.status === 200 && x.keys?.includes('data'));
  const firstNewer = applied.findIndex((x) => (x.dataStr ?? '').includes(newer));
  return {
    olderAfter: firstNewer >= 0 && applied.slice(firstNewer + 1).some((x) => !(x.dataStr ?? '').includes(newer)),
    text: JSON.stringify(applied.map((x) => `@${x.t - t0}${(x.dataStr ?? '').includes(newer) ? '+new' : (x.dataStr ?? '').includes(older) ? '+old' : ''}`)),
  };
}

/**
 * The page's own trace (R1-2): each poster write it makes (`fetch-new` when
 * its body holds one of `newer`, else `fetch-old`; `-ka` with keepalive), its
 * outcome, and the leave events, by the page's clock, in localStorage.
 */
function traceScript(newer) {
  if (window.__zqTrace) return;
  window.__zqTrace = true;
  const put = (e) => {
    try {
      const n = Number(localStorage.getItem('zq-t-n') ?? '0');
      localStorage.setItem('zq-t-n', String(n + 1));
      localStorage.setItem(`zq-t-${n}`, JSON.stringify({ t: performance.timeOrigin + performance.now(), ...e }));
    } catch { /* trace only */ }
  };
  const orig = window.fetch;
  window.fetch = function zqTraceFetch(input, init) {
    const url = String(input?.url ?? input);
    const isWrite = /\/rest\/v1\/posters\?/.test(url) && init?.method === 'PATCH' && String(init?.body ?? '').includes('"data"');
    const tag = isWrite ? (newer.some((w) => String(init.body).includes(w)) ? 'new' : 'old') : null;
    if (isWrite) put({ e: `fetch-${tag}${init.keepalive ? '-ka' : ''}` });
    const p = orig.apply(this, arguments);
    if (isWrite) p.then((r) => put({ e: `ok-${tag}-${r.status}` }), (err) => put({ e: `fail-${tag}-${String(err).slice(0, 40)}` }));
    return p;
  };
  for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => put({ e: ev }), true);
}

async function readTrace(h, s, since) {
  const p = await s.context.newPage();
  try {
    await p.goto(`${h.base}/version.json`);
    const all = await p.evaluate(() => Array.from({ length: Number(localStorage.getItem('zq-t-n') ?? '0') }, (_, i) => JSON.parse(localStorage.getItem(`zq-t-${i}`) ?? 'null')).filter(Boolean));
    return all.filter((x) => x.t >= since).map((x) => `${x.e}@${Math.round(x.t - since)}`);
  } finally {
    await p.close().catch(() => {});
  }
}

/** An address of the dev server whose page answers after `ms`, with `status` (200: a page; 204: the old page stays). */
async function slowAddress(h, s, name, ms, status) {
  await s.context.route(`${h.base}/${name}*`, async (route) => {
    await sleep(ms);
    await route.fulfill(status === 204 ? { status: 204, body: '' } : { status, contentType: 'text/html', body: '<!doctype html><p>slow page</p>' }).catch(() => {});
  });
  return `${h.base}/${name}`;
}

/** Every save fails (network) while `word` waits; 3 s later Back inside the app to the dashboard. */
async function failThenInApp(h, s, word) {
  await recordWrites(s);
  await WAYS.inapp.prepare(h, s);
  const { page, state } = s;
  const dialogs = watchDialogs(page);
  state.faults.patch = 'network';
  await typeWord(page, word);
  const t0 = Date.now();
  await sleep(3000);
  const pill = await savePill(page);
  await page.goBack().catch(() => {});
  const path = new URL(page.url()).pathname;
  return { t0, dialogs, pill, path };
}

export const LEAVE_ROUND1 = [
  {
    // R1-1 (a): fix 27's retry state, then the editor left inside the app.
    // The editor's retries went with it: on the branch before the
    // correction the word was never stored (the reviewer's reopen check:
    // not on the sheet, not stored), with no dialog and nothing said.
    id: 'L3-inapp-failing-stay', claims: ['L3f'],
    how: 'every save fails (network); " ZQFI" typed; 3 s later Back inside the app to the dashboard (still failing); 1 s later the backend accepts again; the tab kept on the dashboard: is ZQFI stored within 40 s (L3f: not)?',
    async run(h, s) {
      const { state, id } = s;
      const r = await failThenInApp(h, s, 'ZQFI');
      await sleep(1000);
      state.faults.patch = 'ok';
      const tOk = Date.now();
      const storedAfter = await storedWithin(state, id, 'ZQFI', 40000);
      const made = await writesMade(h, s, r.t0 - 50, 'ZQFI');
      return {
        claims: { L3f: storedAfter === null },
        numbers: {
          storedMsAfterBackendBack: storedAfter, dialog: r.dialogs.n, pillBeforeBack: JSON.stringify(r.pill), pathAfterBack: r.path,
          patches: JSON.stringify(patchesSince(state, r.t0 - 50, 'ZQFI')), writesMade: writesText(made), backendBackAtMs: tOk - r.t0,
        },
      };
    },
  },
  {
    // R1-1's siblings: the same, the tab then closed while the backend
    // still fails (the change cannot be stored: was the dialog shown?) …
    id: 'L3-inapp-failing-close', claims: ['L3fd'],
    how: 'every save fails (network); " ZQFJ" typed; 3 s later Back inside the app; 1 s later the tab closed, still failing: ZQFJ lost with no dialog (L3fd)?',
    async run(h, s) {
      const { page, state, id } = s;
      const r = await failThenInApp(h, s, 'ZQFJ');
      await sleep(1000);
      const t1 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(1500);
      const kept = has(state, id, 'ZQFJ');
      return {
        claims: { L3fd: !kept && r.dialogs.n === 0 },
        numbers: { dialog: r.dialogs.n, stored: kept, pathAtClose: r.path, patchesAtClose: JSON.stringify(patchesSince(state, t1, 'ZQFJ')) },
      };
    },
  },
  {
    // … and closed just as the backend accepts again, before the next
    // retry is due (LF's case, with the editor left inside the app first).
    id: 'L3-inapp-failing-recovered-close', claims: ['L3fr'],
    how: 'every save fails (network); " ZQFL" typed; 3 s later Back inside the app; 1 s later the backend accepts again and the tab is closed at once: is ZQFL stored 3 s later (L3fr: not)?',
    async run(h, s) {
      const { page, state, id } = s;
      const r = await failThenInApp(h, s, 'ZQFL');
      await sleep(1000);
      state.faults.patch = 'ok';
      const t1 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      const kept = has(state, id, 'ZQFL');
      return {
        claims: { L3fr: !kept },
        numbers: { dialog: r.dialogs.n, stored: kept, patchesAfter: JSON.stringify(patchesSince(state, t1, 'ZQFL')) },
      };
    },
  },
  {
    // … and the poster opened again from its card while the change is
    // still not stored: it must open as the user left it (the server's
    // copy is older), and nothing older may be written over the next edit.
    id: 'L3-inapp-failing-reopen', claims: ['L3r', 'L3rs', 'L3ro'],
    how: 'every save fails (network); " ZQFM" typed; 3 s later Back inside the app; 1 s later the poster opened again from its card, still failing: is ZQFM on the sheet (L3r: not)? " ZQFN" typed; the backend accepts again: are both stored within 15 s (L3rs: not), and was a write without ZQFN applied after one with it (L3ro)?',
    async run(h, s) {
      const { page, state, id } = s;
      const r = await failThenInApp(h, s, 'ZQFM');
      await sleep(1000);
      const card = page.locator(`a[href="/p/${id}"]`).first();
      await card.waitFor({ timeout: 30000 });
      await card.click();
      await waitSheet(page);
      const onSheet = await page.evaluate(() => (document.querySelector('#poster-canvas')?.textContent ?? '').includes('ZQFM'));
      const pillReopened = await savePill(page);
      await typeWord(page, 'ZQFN');
      const tEdit = Date.now();
      state.faults.patch = 'ok';
      const bothAfter = await (async () => {
        const t = Date.now();
        while (Date.now() - t < 15000) {
          if (has(state, id, 'ZQFM') && has(state, id, 'ZQFN')) return Date.now() - t;
          await sleep(100);
        }
        return null;
      })();
      await sleep(2500);
      const order = appliedOrder(state, tEdit, 'ZQFM', 'ZQFN');
      return {
        claims: { L3r: !onSheet, L3rs: bothAfter === null, L3ro: order.olderAfter },
        numbers: {
          onSheetReopened: onSheet, pillReopened: JSON.stringify(pillReopened), bothStoredMsAfterBackendBack: bothAfter, dialog: r.dialogs.n,
          appliedAfterEdit: order.text, stored: `${has(state, id, 'ZQFM') ? 'M' : ''}${has(state, id, 'ZQFN') ? 'N' : ''}`,
        },
      };
    },
  },
  {
    // R1-1 (b): a change made while a save is out, then the editor left
    // inside the app (its write waits for the held one), then the tab
    // closed before that write lands. The dashboard has no dialog of its
    // own: on the branch before the correction the change was lost with
    // none, in the three engines.
    id: 'L3-inapp-slow-close', claims: ['L3sd'],
    how: 'the first save held 3 s; " ZQRA" typed; 1 s later (its write out) " ZQRB"; at once Back inside the app to the dashboard; the tab closed 300 ms later: ZQRB lost with no dialog (L3sd)?',
    async run(h, s) {
      await recordWrites(s);
      await WAYS.inapp.prepare(h, s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      state.faults.patchDelays = [3000];
      await typeWord(page, 'ZQRA');
      const t0 = Date.now();
      await sleep(1000);
      const outBefore = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0).length;
      await typeWord(page, 'ZQRB');
      await page.goBack().catch(() => {});
      const tBack = Date.now();
      await sleep(300);
      const pathAtClose = new URL(page.url()).pathname;
      await page.close({ runBeforeUnload: true });
      await sleep(5000);
      const made = await writesMade(h, s, t0 - 50, 'ZQRB');
      const kept = has(state, id, 'ZQRB');
      return {
        claims: { L3sd: !kept && dialogs.n === 0 },
        numbers: {
          stored: `${has(state, id, 'ZQRA') ? 'A' : ''}${kept ? 'B' : ''}`, dialog: dialogs.n, landedBeforeEdit: outBefore, pathAtClose,
          backAtMs: tBack - t0, patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQRB')), writesMade: writesText(made),
        },
      };
    },
  },
  {
    // Its counterpart: the same, the tab kept on the dashboard 6 s.
    id: 'L3-inapp-slow-stay', claims: ['L3sk'],
    how: 'the same with " ZQRC" and " ZQRD", the tab kept on the dashboard 6 s: is ZQRD stored (L3sk: not)?',
    async run(h, s) {
      await recordWrites(s);
      await WAYS.inapp.prepare(h, s);
      const { page, state, id } = s;
      state.faults.patchDelays = [3000];
      await typeWord(page, 'ZQRC');
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, 'ZQRD');
      await page.goBack().catch(() => {});
      await sleep(6000);
      const made = await writesMade(h, s, t0 - 50, 'ZQRD');
      const kept = has(state, id, 'ZQRD');
      return {
        claims: { L3sk: !kept },
        numbers: { stored: kept, patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQRD')), writesMade: writesText(made) },
      };
    },
  },
  {
    // R1-2: L4 with a slow navigation (the old page stays up until the new
    // one answers, 4 s): a write the leave cut off may land later still
    // (held 5 s at the server), and a newer write sent meanwhile (a retry,
    // pagehide's) landed before it on the branch before the correction
    // (Firefox, WebKit).
    id: 'L4-slow-write-then-slow-address', claims: ['L4', 'L4d'],
    how: 'the first save held 5 s; " ZQNA"; 1 s later " ZQNB"; at once another address whose page answers after 4 s: is an older poster stored over a newer one (L4), or ZQNB lost with no dialog (L4d)? 7 s later',
    async run(h, s) {
      const url = await slowAddress(h, s, 'zq-slow-nav', 4000, 200);
      await s.context.addInitScript(traceScript, ['ZQNB']);
      await s.page.evaluate(traceScript, ['ZQNB']);
      const tStart = Date.now();
      const r = await slowThenEdit(h, s, 'ZQNA', 'ZQNB', (p) => p.goto(url, { timeout: 20000 }).catch(() => {}), { holdMs: 5000, afterMs: 7000 });
      const trace = await readTrace(h, s, tStart);
      return { ...r, numbers: { ...r.numbers, trace: JSON.stringify(trace) } };
    },
  },
  {
    // R1-2's second half: the address answers 204 after 4 s, so the page
    // stays (as after Stop). The pill read at 8 s, then the tab closed.
    id: 'L4-slow-write-then-204-close', claims: ['L4', 'L4q', 'L4p'],
    how: 'the first save held 5 s; " ZQNC"; 1 s later " ZQND"; at once an address that answers 204 after 4 s (the page stays); at 8 s the pill read and the tab closed: an older poster stored over a newer one (L4)? the pill saying "Saved" while ZQND is not stored (L4p)? ZQND lost with no dialog at the close (L4q)?',
    async run(h, s) {
      const { page, state, id } = s;
      const url = await slowAddress(h, s, 'zq-slow-204', 4000, 204);
      state.faults.patchDelays = [5000];
      const dialogs = watchDialogs(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQNC', { delay: 20 });
      const t0 = Date.now();
      await sleep(1000);
      await page.keyboard.type(' ZQND', { delay: 20 });
      await page.goto(url, { timeout: 20000 }).catch(() => {});
      const answeredAt = Date.now() - t0;
      await sleep(Math.max(0, 8000 - (Date.now() - t0)));
      const stayed = !page.isClosed() && new URL(page.url()).pathname.startsWith('/p/');
      const pill = await savePill(page).catch(() => null);
      const storedAt8 = `${has(state, id, 'ZQNC') ? 'C' : ''}${has(state, id, 'ZQND') ? 'D' : ''}`;
      const dialogsAtLeave = dialogs.n;
      await page.close({ runBeforeUnload: true });
      await sleep(2500);
      const order = appliedOrder(state, t0, 'ZQNC', 'ZQND');
      const keptD = has(state, id, 'ZQND');
      return {
        claims: { L4: order.olderAfter, L4q: !keptD && dialogs.n === dialogsAtLeave, L4p: /^Saved\b/.test(pill ?? '') && !storedAt8.includes('D') },
        numbers: {
          stayed, answeredAtMs: answeredAt, pillAt8s: JSON.stringify(pill), storedAt8s: storedAt8,
          dialogsAtLeave, dialogsAtClose: dialogs.n - dialogsAtLeave, applied: order.text, storedEnd: `${has(state, id, 'ZQNC') ? 'C' : ''}${keptD ? 'D' : ''}`,
        },
      };
    },
  },
  {
    // R1-3: the newer change's own wait (its debounce) already waiting on
    // the held write when the page is left: whichever caller writes it
    // once the held write lands, the request is made while the page is
    // going, so it must outlive the page (keepalive).
    id: 'L1-debounce-waiting-then-slow-address', claims: ['L1o'],
    how: 'the first save held 2 s; " ZQPA"; 1 s later " ZQPB"; 900 ms later (its save waiting for the held one) another address that answers after 4 s: is ZQPB written by an ordinary request after the page began to go (L1o)?',
    async run(h, s) {
      const { page, state, id } = s;
      await recordWrites(s);
      const url = await slowAddress(h, s, 'zq-slow-nav', 4000, 200);
      state.faults.patchDelays = [2000];
      watchDialogs(page);
      await typeWord(page, 'ZQPA');
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, 'ZQPB');
      await sleep(900);
      await page.goto(url, { timeout: 20000 }).catch(() => {});
      await sleep(2000);
      const made = await writesMade(h, s, t0 - 50, 'ZQPB');
      const late = made.filter((w) => w.has && made.leftAt !== null && w.at >= made.leftAt);
      return {
        claims: { L1o: late.some((w) => !w.ka) },
        numbers: { pageLeftAtMs: made.leftAt, writesMade: writesText(made), stored: has(state, id, 'ZQPB') },
      };
    },
  },
  {
    // R1-7 (a guard: the reviewer found it held): the token a leave's
    // write carries after the client refreshed it. A token that lasts
    // 100 s; the client refreshes it once under 90 s are left (its 30 s
    // ticker). 40 s idle, an edit, the tab closed.
    id: 'L1-token-refreshed-close', claims: ['L1t'], session: { expiresIn: 100 },
    how: 'a session whose token lasts 100 s; 40 s idle (the client refreshes it); " ZQTK" typed; the tab closed at once: is the word not stored, or its write without the token the client holds at that moment, or with an expired one (L1t)?',
    async run(h, s) {
      const { page, state, id, context } = s;
      const auths = [];
      await context.route('https://dummy.supabase.co/rest/v1/posters*', async (route) => {
        const req = route.request();
        if (req.method() === 'PATCH') auths.push({ t: Date.now(), auth: req.headers().authorization ?? null, body: req.postData() ?? '' });
        return route.fallback();
      });
      const tokenNow = () => page.evaluate(() => {
        const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
        try { return k ? JSON.parse(localStorage.getItem(k)).access_token : null; } catch { return null; }
      });
      const expOf = (tok) => { try { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString()).exp; } catch { return null; } };
      const first = await tokenNow();
      await sleep(40000);
      const before = await tokenNow();
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQTK');
      const t0 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      const leave = auths.filter((a) => a.t >= t0 - 50 && a.body.includes('ZQTK'));
      const tok = leave[0]?.auth?.replace(/^Bearer\s+/i, '') ?? null;
      const now = Math.floor(Date.now() / 1000);
      const kept = has(state, id, 'ZQTK');
      return {
        claims: { L1t: !kept || !tok || tok !== before || (expOf(tok) ?? 0) <= now },
        numbers: {
          stored: kept, dialog: dialogs.n, refreshedBeforeEdit: first !== before, leaveWrites: leave.length,
          carriesLatest: tok === before, carriesFirst: tok === first, secondsLeftOnIt: tok ? (expOf(tok) ?? 0) - now : null,
        },
      };
    },
  },
];

