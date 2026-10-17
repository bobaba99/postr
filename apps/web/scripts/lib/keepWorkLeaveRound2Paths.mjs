/**
 * Record 38's review round 2 (docs/fixes/38-save-on-leave.md, section 9):
 * the reviewer's partition of the user's entry paths, folded in. These found
 * no defect of their own; they measure what the record states about the
 * production build (the nudge and A+ read from the stored row, so they run
 * there), a failing or recovered save with every way out, bfcache (Back then
 * Forward), an expired token at the leave, a guest, posters near the
 * keepalive limit, and the tab hidden. The defects' cells are
 * lib/keepWorkLeaveRound2.mjs. Run by scripts/keep-work-check.mjs.
 *
 * The reviewer's ids, for its evidence: R2-nudge-<way> / R2-aplus-<way> are
 * `L1s-nudge-<way>` / `L1s-aplus-<way>`, R2-FR / R2-FW-<way> are
 * `LF-failed-then-recovered-<way>` / `LF-still-failing-<way>`, R2-BF-* is
 * `LB-bfcache-*`, R2-TX-* is `L1x-expired-token-close` and
 * `L3x-expired-token-inapp`, R2-G-* is `LG-guest-*`, R2-KQ / R2-HV-* are
 * `L2-engine-keepalive-limit` / `L2-near-limit-*`, R2-HID-* is `LH-hidden-*`.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, sleep } from './editorHarness.mjs';
import { newState, newGuestPage, openNewPoster } from './guestBackend.mjs';
import { blockOf, focusBlockEnd, selectFrame, textBlockIds } from './undoKit.mjs';
import { openSignedIn, rowOf, savePill, savedWith } from './keepWorkKit.mjs';
import { AFTER_MS, WAYS, has, patchesSince, recordWrites, typeWord, watchDialogs, writesMade } from './keepWorkLeave.mjs';
import { NOT_DRIVEN, appliedOrder, dialogNotDriven, expOf, expiredSetup, holds, storedWithin, writesText } from './keepWorkLeaveRound2.mjs';

/** A first save stored, so the row holds the template's blocks (a new poster's are laid out in the browser). */
async function primeStored(s, word = 'ZQPRE') {
  await typeWord(s.page, word);
  if (!(await savedWith(s.state, word, { timeout: 10000 }))) throw new Error('precondition: the first save was not stored');
  await sleep(600);
}

// ------------------------------------------------------------------ the nudge and A+, read from the stored row (dev and build)

async function nudgeStored(s) {
  const { page, state, id } = s;
  const ref = await blockOf(page, 'references');
  if (!ref) throw new Error('precondition: no references block');
  const x0 = rowOf(state, id)?.data?.blocks?.find((b) => b.id === ref)?.x;
  if (typeof x0 !== 'number') throw new Error('precondition: the stored row lacks the references block');
  await selectFrame(page, ref);
  const box = () => page.locator(`#poster-canvas [data-block-id="${ref}"]`).first().boundingBox();
  const bb0 = await box();
  await page.keyboard.press('ArrowRight');
  const at = Date.now();
  const bb1 = await box();
  if (!(bb1.x > bb0.x)) throw new Error(`precondition: → did not move the block on screen (${bb0.x} → ${bb1.x})`);
  return { at, kept: (st, pid) => { const x = rowOf(st, pid)?.data?.blocks?.find((b) => b.id === ref)?.x; return typeof x === 'number' && x > x0; } };
}

async function aplusStored(s) {
  const { page, state, id } = s;
  const before = rowOf(state, id)?.data?.styles?.body?.size;
  if (typeof before !== 'number') throw new Error('precondition: the stored row lacks styles.body.size');
  const btn = page.locator('[data-postr-editor-topbar] button[aria-label="Increase text size"]').first();
  if (await btn.isDisabled()) throw new Error('precondition: A+ is disabled');
  await btn.click();
  const at = Date.now();
  return { at, kept: (st, pid) => (rowOf(st, pid)?.data?.styles?.body?.size ?? 0) > before };
}

function storedEditCell(editName, wayName) {
  const way = WAYS[wayName];
  return {
    id: `L1s-${editName}-${wayName}`, claims: ['L1', 'L0'],
    how: `${editName === 'nudge' ? 'the references block selected, →' : 'the top bar\'s A+'} (read from the stored row, so it runs on the build), then at once ${way.how}: stored ${AFTER_MS / 1000} s later (L1: not)? lost with no dialog (L0)?`,
    async run(h, s) {
      await recordWrites(s);
      await primeStored(s);
      if (way.prepare) await way.prepare(h, s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      const edit = editName === 'nudge' ? await nudgeStored(s) : await aplusStored(s);
      const t0 = Date.now();
      await way.leave(page, h);
      await sleep(AFTER_MS);
      const kept = edit.kept(state, id);
      const made = await writesMade(h, s, t0 - 50, null);
      return {
        claims: { L1: !kept, L0: !kept && dialogs.n === 0 },
        numbers: { stored: kept, dialog: dialogs.n, leftAfterMs: t0 - edit.at, patches: JSON.stringify(patchesSince(state, t0 - 50)), writesMade: writesText(made), pageLeftAtMs: made.leftAt },
      };
    },
  };
}

// ------------------------------------------------------------------ a failing save, recovered or not, every way out

function failCell(wayName, recover) {
  const way = WAYS[wayName];
  const word = `${recover ? 'ZQFR' : 'ZQFW'}${wayName.slice(0, 2).toUpperCase()}`;
  return {
    id: recover ? `LF-failed-then-recovered-${wayName}` : `LF-still-failing-${wayName}`, claims: recover ? ['LF'] : ['LFd'],
    how: recover
      ? `every save fails (network); " ${word}"; 3.5 s later the backend accepts again and at once ${way.how}: stored 3 s later (LF: not)?`
      : `every save fails (network); " ${word}"; 3 s later, still failing, ${way.how}: lost with no dialog (LFd)?`,
    async run(h, s) {
      await recordWrites(s);
      if (way.prepare) await way.prepare(h, s);
      const { page, state, id } = s;
      state.faults.patch = 'network';
      const dialogs = watchDialogs(page);
      await typeWord(page, word);
      const t0 = Date.now();
      await sleep(recover ? 3500 : 3000);
      const pill = await savePill(page);
      if (recover) state.faults.patch = 'ok';
      const t1 = Date.now();
      await way.leave(page, h);
      await sleep(AFTER_MS);
      const kept = has(state, id, word);
      const made = await writesMade(h, s, t1 - 50, word);
      const lostNoDialog = !kept && dialogs.n === 0;
      return {
        claims: recover ? { LF: !kept } : { LFd: lostNoDialog && !dialogNotDriven(h, wayName) },
        numbers: {
          ...(!recover && lostNoDialog && dialogNotDriven(h, wayName) ? { LFd: NOT_DRIVEN } : {}),
          pillBefore: JSON.stringify(pill), dialog: dialogs.n, stored: kept, patchesAfterLeave: JSON.stringify(patchesSince(state, t1 - 50, word)), writesMade: writesText(made), failedBefore: state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.t < t1).length },
      };
    },
  };
}

// ------------------------------------------------------------------ bfcache: Back, then Forward

let bfBrowser = null;
/**
 * Chromium as Playwright launches it has bfcache off (--disable-back-forward-cache),
 * and its headless shell masks bfcache even with the flag removed (MEASURED by
 * round 2's reviewer: a plain page not restored); full Chromium in new headless
 * (`channel: 'chromium'`) restores it. Firefox and WebKit under Playwright
 * restore no page: their cells run as plain Back then Forward.
 */
async function bfcacheHarness(h) {
  if (h.engine !== 'chromium') return h;
  if (!bfBrowser) {
    const engines = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
    bfBrowser = await engines.chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  }
  return { ...h, browser: bfBrowser };
}
export async function closeBfBrowser() { await bfBrowser?.close().catch(() => {}); bfBrowser = null; }

/** Back to the page before the editor (another document), then Forward: whether the editor came back from bfcache. */
async function backForward(s, dialogs, between) {
  const { page } = s;
  await page.evaluate(() => { window.__zqAlive = 'kept-in-memory'; });
  await page.goBack({ timeout: 20000, waitUntil: 'commit' }).catch(() => {});
  await sleep(500);
  if (between) await between();
  await page.goForward({ timeout: 20000, waitUntil: 'commit' }).catch(() => {});
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 60000 });
  const restored = await page.evaluate(() => window.__zqAlive === 'kept-in-memory');
  const notRestored = await page.evaluate(() => {
    const r = performance.getEntriesByType('navigation')[0]?.notRestoredReasons;
    if (!r) return null;
    const out = [];
    const walk = (x) => { for (const y of x.reasons ?? []) out.push(y.reason ?? String(y)); for (const c of x.children ?? []) walk(c); };
    walk(r);
    return out.join(',') || 'none listed';
  }).catch(() => null);
  return { restored, notRestored, dialogsAtBack: dialogs.n };
}

/** After a bfcache restore Playwright's locator actions time out (MEASURED by round 2's reviewer), while the mouse and keys at coordinates work. */
async function typeAfterRestore(page, word) {
  const at = await page.evaluate(() => {
    const r = document.querySelector('#poster-canvas [data-block-type="text"] [contenteditable="true"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(10, r.height / 2) };
  });
  await page.mouse.click(at.x, at.y);
  await sleep(300);
  if (!(await page.evaluate(() => !!document.activeElement?.isContentEditable))) throw new Error('could not focus the text after the restore');
  await page.keyboard.press('End');
  await page.keyboard.type(` ${word}`, { delay: 20 });
}

/** The cell's session in a bfcache-capable browser (Chromium), the editor opened after another page. */
async function bfCell(h, s0, body) {
  const hb = await bfcacheHarness(h);
  const own = hb !== h;
  if (own) await s0.context.close().catch(() => {});
  const s = own ? await openSignedIn(hb) : s0;
  try {
    await s.context.addInitScript(() => {
      addEventListener('pageshow', (e) => { try { localStorage.setItem(`zq-ps-${performance.timeOrigin + performance.now()}`, String(e.persisted)); } catch { /* */ } });
    });
    await recordWrites(s);
    await WAYS.back.prepare(h, s);
    return await body(s);
  } finally { if (own) await s.context.close().catch(() => {}); }
}

const BFCACHE = [
  {
    id: 'LB-bfcache-type', claims: ['LB1', 'LB2', 'LBo'],
    how: '(bfcache on in Chromium) the editor opened after another page; " ZQBA" typed; at once the browser\'s Back (dialog accepted); 2 s; Forward: restored from bfcache? ZQBA stored (LB1: not)? then " ZQBB" typed: stored within 6 s with the pill "Saved" (LB2: not)? older over newer (LBo)?',
    run: (h, s0) => bfCell(h, s0, async (s) => {
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQBA');
      const t0 = Date.now();
      const bf = await backForward(s, dialogs, () => sleep(2000));
      const storedA = has(state, id, 'ZQBA');
      await sleep(500);
      await (bf.restored ? typeAfterRestore(page, 'ZQBB') : typeWord(page, 'ZQBB'));
      const within = await storedWithin(state, id, holds('ZQBB'), 6000);
      await sleep(1000);
      const pill = await savePill(page);
      const order = appliedOrder(state, t0, 'ZQBA', 'ZQBB');
      const made = await writesMade(h, s, t0 - 50, 'ZQBB');
      return {
        claims: { LB1: !storedA, LB2: within === null || !/^Saved\b/.test(pill ?? ''), LBo: order.olderAfter },
        numbers: { restoredFromBfcache: bf.restored, notRestoredReasons: bf.notRestored, dialogAtBack: bf.dialogsAtBack, storedA, storedBWithinMs: within, pillEnd: JSON.stringify(pill), applied: order.text, writesMade: writesText(made) },
      };
    }),
  },
  {
    id: 'LB-bfcache-slow', claims: ['LB2', 'LBo', 'LBh'],
    how: '(bfcache on in Chromium) the first save held 3 s; " ZQBC"; 1 s; " ZQBD" (its write waits); at once Back (dialog accepted); 4 s; Forward; " ZQBE": stored within 8 s with the pill "Saved" (LB2: not)? older over newer (LBo)? nothing written after Forward (LBh)?',
    run: (h, s0) => bfCell(h, s0, async (s) => {
      const { page, state, id } = s;
      state.faults.patchDelays = [3000];
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQBC');
      const t0 = Date.now();
      await sleep(1000);
      await typeWord(page, 'ZQBD');
      const bf = await backForward(s, dialogs, () => sleep(4000));
      const storedAtForward = `${has(state, id, 'ZQBC') ? 'C' : ''}${has(state, id, 'ZQBD') ? 'D' : ''}`;
      const tF = Date.now();
      await sleep(500);
      await (bf.restored ? typeAfterRestore(page, 'ZQBE') : typeWord(page, 'ZQBE'));
      const within = await storedWithin(state, id, holds('ZQBE'), 8000);
      await sleep(1000);
      const pill = await savePill(page);
      const order = appliedOrder(state, t0, 'ZQBC', 'ZQBE');
      const afterForward = state.log.filter((x) => x.method === 'PATCH' && x.t >= tF && x.keys?.includes('data')).length;
      const made = await writesMade(h, s, t0 - 50, 'ZQBE');
      return {
        claims: { LB2: within === null || !/^Saved\b/.test(pill ?? ''), LBo: order.olderAfter, LBh: afterForward === 0 },
        numbers: { restoredFromBfcache: bf.restored, notRestoredReasons: bf.notRestored, dialogAtBack: bf.dialogsAtBack, storedAtForward, storedEWithinMs: within, pillEnd: JSON.stringify(pill), applied: order.text, writesMade: writesText(made) },
      };
    }),
  },
  {
    id: 'LB-bfcache-fail', claims: ['LB1'],
    how: '(bfcache on in Chromium) every save fails (network); " ZQBF"; 3 s; Back (dialog accepted); the backend accepts again; 1 s; Forward; 12 s: ZQBF stored (LB1: not, when restored; when not restored, lost with no dialog at Back)?',
    run: (h, s0) => bfCell(h, s0, async (s) => {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQBF');
      const t0 = Date.now();
      await sleep(3000);
      const bf = await backForward(s, dialogs, async () => { state.faults.patch = 'ok'; await sleep(1000); });
      const within = await storedWithin(state, id, holds('ZQBF'), 12000);
      const made = await writesMade(h, s, t0 - 50, 'ZQBF');
      return {
        claims: { LB1: bf.restored ? within === null : within === null && bf.dialogsAtBack === 0 },
        numbers: { restoredFromBfcache: bf.restored, notRestoredReasons: bf.notRestored, dialogAtBack: bf.dialogsAtBack, storedWithinMs: within, patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQBF')), writesMade: writesText(made) },
      };
    }),
  },
];

// ------------------------------------------------------------------ an expired token at the leave

const EXPIRED = [
  {
    id: 'L1x-expired-token-close', claims: ['L0'], session: { expiresIn: 100 },
    how: 'a 100 s token; the client\'s refresh held (never answered); the token expired 2.5 s ago; " ZQTXC" typed; the tab closed at once: lost with no dialog (L0)? numbers: what the leave sent and how it was answered',
    async run(h, s) {
      await recordWrites(s);
      const ex = await expiredSetup(s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQTXC');
      const t0 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      const kept = has(state, id, 'ZQTXC');
      const made = await writesMade(h, s, t0 - 50, 'ZQTXC');
      return { claims: { L0: !kept && dialogs.n === 0 }, numbers: { stored: kept, dialog: dialogs.n, refreshesHeld: ex.held.length, tokenExpiredSecAgo: Math.floor(Date.now() / 1000) - (expOf(ex.tokenAtLeave) ?? 0), patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQTXC')), writesMade: writesText(made) } };
    },
  },
  {
    id: 'L3x-expired-token-inapp', claims: ['L3x'], session: { expiresIn: 100 },
    how: 'the same token held expired; " ZQTXI" typed; at once Back inside the app to the dashboard; 3 s later the refresh is answered: ZQTXI stored within 20 s (L3x: not)?',
    async run(h, s) {
      await recordWrites(s);
      await WAYS.inapp.prepare(h, s);
      const ex = await expiredSetup(s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQTXI');
      const t0 = Date.now();
      await page.goBack().catch(() => {});
      await sleep(3000);
      const before = has(state, id, 'ZQTXI');
      const tRel = Date.now();
      await ex.release();
      const within = await storedWithin(state, id, holds('ZQTXI'), 20000);
      const made = await writesMade(h, s, t0 - 50, 'ZQTXI');
      return { claims: { L3x: within === null }, numbers: { storedBeforeRefresh: before, storedMsAfterRefresh: within, path: new URL(page.url()).pathname, dialog: dialogs.n, releasedAtMs: tRel - t0, patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQTXI')), writesMade: writesText(made) } };
    },
  },
];

// ------------------------------------------------------------------ a guest

function guestCell(id, how, body) {
  return {
    id, claims: ['L1', 'L0'], how,
    async run(h, s0) {
      await s0.context.close().catch(() => {});
      const state = newState({ anonymous: true, plan: 'free' });
      const { context, page } = await newGuestPage(h, state);
      const s = { state, context, page, id: await openNewPoster(page, h.base) };
      try { await recordWrites(s); return await body(h, s); } finally { await context.close().catch(() => {}); }
    },
  };
}
const GUEST = [
  guestCell('LG-guest-type-close', 'a guest (anonymous session) at /p/new; " ZQGC" typed; the tab closed at once: stored (L1: not)? lost with no dialog (L0)?', async (h, s) => {
    const { page, state, id } = s;
    const dialogs = watchDialogs(page);
    await typeWord(page, 'ZQGC');
    const t0 = Date.now();
    await page.close({ runBeforeUnload: true });
    await sleep(AFTER_MS);
    const kept = has(state, id, 'ZQGC');
    const made = await writesMade(h, s, t0 - 50, 'ZQGC');
    const sub = state.log.find((x) => x.method === 'PATCH' && (x.dataStr ?? '').includes('ZQGC'))?.sub ?? null;
    return { claims: { L1: !kept, L0: !kept && dialogs.n === 0 }, numbers: { stored: kept, dialog: dialogs.n, writtenAsOwner: sub === rowOf(state, id)?.user_id, writesMade: writesText(made) } };
  }),
  guestCell('LG-guest-type-link', 'a guest; " ZQGL" typed; at once the sidebar\'s "Back to My Posters" (a full load): stored (L1: not)?', async (h, s) => {
    const { page, state, id } = s;
    const dialogs = watchDialogs(page);
    await typeWord(page, 'ZQGL');
    const t0 = Date.now();
    await WAYS.link.leave(page, h);
    await sleep(AFTER_MS);
    const kept = has(state, id, 'ZQGL');
    return { claims: { L1: !kept, L0: !kept && dialogs.n === 0 }, numbers: { stored: kept, dialog: dialogs.n, writesMade: writesText(await writesMade(h, s, t0 - 50, 'ZQGL')) } };
  }),
  guestCell('LG-guest-failing-inapp-recover', 'a guest; every save fails; " ZQGF"; 3 s; Back inside the app to the dashboard; 1 s later the backend accepts: stored within 20 s (L1: not)?', async (h, s) => {
    await WAYS.inapp.prepare(h, s);
    const { page, state, id } = s;
    const dialogs = watchDialogs(page);
    state.faults.patch = 'network';
    await typeWord(page, 'ZQGF');
    const t0 = Date.now();
    await sleep(3000);
    await page.goBack().catch(() => {});
    await sleep(1000);
    state.faults.patch = 'ok';
    const within = await storedWithin(state, id, holds('ZQGF'), 20000);
    return { claims: { L1: within === null, L0: within === null && dialogs.n === 0 }, numbers: { storedMsAfterBackendBack: within, dialog: dialogs.n, writesMade: writesText(await writesMade(h, s, t0 - 50, 'ZQGF')) } };
  }),
  guestCell('LG-guest-slow-inapp-close', 'a guest; the first save held 3 s; " ZQGA"; 1 s; " ZQGB"; Back inside the app; the tab closed 300 ms later: ZQGB lost with no dialog (L0)?', async (h, s) => {
    await WAYS.inapp.prepare(h, s);
    const { page, state, id } = s;
    const dialogs = watchDialogs(page);
    state.faults.patchDelays = [3000];
    await typeWord(page, 'ZQGA');
    await sleep(1000);
    await typeWord(page, 'ZQGB');
    await page.goBack().catch(() => {});
    await sleep(300);
    await page.close({ runBeforeUnload: true });
    await sleep(5000);
    const kept = has(state, id, 'ZQGB');
    return { claims: { L1: false, L0: !kept && dialogs.n === 0 }, numbers: { stored: `${has(state, id, 'ZQGA') ? 'A' : ''}${kept ? 'B' : ''}`, dialog: dialogs.n } };
  }),
];

// ------------------------------------------------------------------ near the keepalive limit

/** The app's own cap on a keepalive save's body (data/posters.ts KEEPALIVE_BODY_MAX). */
const APP_CAP = 60 * 1024;

/** Records each PATCH body's byte size (and whether it carries the leave's word) on `s.bodySizes`. */
async function sizeTap(s) {
  s.bodySizes = [];
  await s.context.route('https://dummy.supabase.co/rest/v1/posters*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const body = req.postData() ?? '';
      s.bodySizes.push({ t: Date.now(), n: Buffer.byteLength(body, 'utf8'), hv: body.includes('ZQHVx'), data: body.includes('"data"') });
    }
    return route.fallback();
  });
}

/** Pads the first text block (page-made pastes) so the save's body is about `target` bytes. */
async function padTo(s, target) {
  const { page, state, id } = s;
  const [block] = await textBlockIds(page);
  const send = (t) => page.evaluate((txt) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', txt);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    document.activeElement.dispatchEvent(ev);
  }, t);
  const bodySize = () => [...(s.bodySizes ?? [])].reverse().find((x) => x.data)?.n ?? null;
  await focusBlockEnd(page, block);
  await send(' ZQPAD1');
  if (!(await savedWith(state, 'ZQPAD1', { timeout: 10000 }))) throw new Error('precondition: pad 1 not stored');
  const b0 = bodySize();
  // ASCII words: one byte a character in the JSON body; " ZQHVx" adds 6 more at the leave.
  const need = target - b0 - 6 - 8;
  const words = [];
  let n = 0;
  while (n < need - 8) { const w = ` w${(words.length % 89).toString(36)}x`; words.push(w); n += w.length; }
  words.push(` ${'z'.repeat(Math.max(1, need - n - 1))}`);
  await focusBlockEnd(page, block);
  await send(` ZQPAD2${words.join('')}`.slice(0, need));
  if (!(await savedWith(state, 'ZQPAD2', { timeout: 15000 }))) throw new Error('precondition: pad 2 not stored');
  await sleep(1200);
  return { before: b0, after: bodySize(), rowBytes: Buffer.byteLength(JSON.stringify(rowOf(state, id)?.data ?? {}), 'utf8') };
}

/** Over the app's cap the leave's write is the client's own and the dialog is the protection (L2): only a loss with no dialog is a claim then. */
function heavyCell(target, wayName) {
  const way = WAYS[wayName];
  const overCap = target > APP_CAP;
  return {
    id: `L2-near-limit-${target}-${wayName}`, claims: overCap ? ['L0'] : ['L1', 'L0'],
    how: `a poster padded so its save is about ${target} bytes (${overCap ? 'over' : 'under'} the app's ${APP_CAP}-byte cap); " ZQHVx" typed; at once ${way.how}: ${overCap ? '' : 'stored (L1: not)? '}lost with no dialog (L0)?`,
    async run(h, s) {
      await recordWrites(s);
      await sizeTap(s);
      const sz = await padTo(s, target);
      if (way.prepare) await way.prepare(h, s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQHVx', { delay: 20 });
      const t0 = Date.now();
      await way.leave(page, h);
      await sleep(AFTER_MS + 1000);
      const kept = has(state, id, 'ZQHVx');
      const made = await writesMade(h, s, t0 - 50, 'ZQHVx');
      const leaveBodies = (s.bodySizes ?? []).filter((x) => x.t >= t0 - 50).map((x) => `${x.n}${x.hv ? '+' : ''}`);
      return { claims: { ...(overCap ? {} : { L1: !kept }), L0: !kept && dialogs.n === 0 }, numbers: { padded: JSON.stringify(sz), stored: kept, dialog: dialogs.n, leaveWrites: JSON.stringify(leaveBodies), writesMade: writesText(made) } };
    },
  };
}

const HEAVY = [
  {
    id: 'L2-engine-keepalive-limit', info: true,
    how: 'information: in the editor page, one keepalive PATCH at a time with a body of N bytes (no page leaving): answered, or refused by the engine? then two at once of 40,000 bytes',
    async run(h, s) {
      await s.context.route('https://dummy.supabase.co/rest/v1/zq_kq*', (route) => route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' }));
      return {
        numbers: await s.page.evaluate(async () => {
          const one = async (n) => {
            try {
              const r = await fetch(`https://dummy.supabase.co/rest/v1/zq_kq?n=${n}`, { method: 'PATCH', keepalive: true, body: 'x'.repeat(n), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer zq', apikey: 'zq' } });
              await r.text();
              await new Promise((res) => setTimeout(res, 300));
              return String(r.status);
            } catch (e) { return `refused:${String(e?.message ?? e).slice(0, 50)}`; }
          };
          const out = {};
          for (const n of [61440, 64000, 65536, 65537, 70000]) out[n] = await one(n);
          out.twoAt40000 = (await Promise.all([one(40000), one(40000)])).join(' / ');
          return out;
        }),
      };
    },
  },
  heavyCell(58000, 'close'),
  heavyCell(61000, 'close'),
  heavyCell(61000, 'address'),
  heavyCell(62500, 'close'),
  heavyCell(62500, 'inapp'),
];

// ------------------------------------------------------------------ the tab hidden

const HIDDEN = [
  {
    id: 'LH-hidden-real', info: true,
    how: 'information: a second page brought to the front in the same context: does the editor\'s page report hidden (a real hidden tab under this engine)?',
    async run(h, s) {
      const p2 = await s.context.newPage();
      await p2.goto(`${h.base}/version.json`);
      await p2.bringToFront();
      await sleep(500);
      const v = await s.page.evaluate(() => document.visibilityState);
      await p2.close();
      return { numbers: { editorVisibility: v } };
    },
  },
  {
    id: 'LH-hidden-synthetic', claims: ['LH'],
    how: '" ZQHD" typed; at once the document made to report hidden and visibilitychange dispatched (synthetic: a headless page stays visible): did the page send a keepalive write of ZQHD at once, and is it stored 430 ms later (LH: not)?',
    async run(h, s) {
      await recordWrites(s);
      const { page, state, id } = s;
      await typeWord(page, 'ZQHD');
      const t0 = Date.now();
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await sleep(430);
      const kept = has(state, id, 'ZQHD');
      return { claims: { LH: !kept }, numbers: { stored: kept, writesMade: writesText(await writesMade(h, s, t0 - 50, 'ZQHD')), patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQHD')) } };
    },
  },
];

const STORED_WAYS = ['close', 'reload', 'back', 'link', 'address', 'inapp'];
export const LEAVE_ROUND2_PATHS = [
  ...['nudge', 'aplus'].flatMap((e) => STORED_WAYS.map((w) => storedEditCell(e, w))),
  ...['reload', 'back', 'link', 'address'].flatMap((w) => [failCell(w, true), failCell(w, false)]),
  ...BFCACHE,
  ...GUEST,
  ...HEAVY,
  ...HIDDEN,
  ...EXPIRED,
];
