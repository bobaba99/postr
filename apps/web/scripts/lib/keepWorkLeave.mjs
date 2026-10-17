/**
 * Leaving the editor right after an edit (scripts/keep-work-check.mjs,
 * record docs/fixes/38-save-on-leave.md): every way a user leaves (closing
 * the tab, reload, the browser's Back to the page before, the sidebar's
 * "Back to My Posters" link, a new address typed, and Back inside the app to
 * the dashboard) right after every kind of edit (a word typed, a nudge, the
 * top bar's A+, a paste), within a few milliseconds of the last key or
 * click, well inside the 800 ms the save waits. What the fake backend
 * receives (lib/guestBackend.mjs: each PATCH, its body, the row it stores)
 * and what the user sees (the leave dialog, the save pill just before).
 * Also a write still out or failing when the user leaves (fix 27's single
 * writer and its retries), a poster whose save is over the keepalive limit,
 * and the sizes of real posters' saves.
 *
 * Record 36 measured the first of these (a nudge, then the page's own
 * Back): not saved in Chromium and WebKit, saved in Firefox
 * (lib/selectMoveScenarios.mjs SM-I-arrow-chords-leave).
 *
 * Every scenario starts as keep-work-check's do: a signed-in term holder at
 * /p/new (lib/keepWorkKit.mjs openSignedIn). The user's actions are
 * Playwright's keyboard and mouse; the paste is a page-made paste event
 * carrying plain text (the system pasteboard is not touched, as H5).
 */
import { REPO, sleep } from './editorHarness.mjs';
import { DEFAULT_DATA } from './guestBackend.mjs';
import { POSTERS as PRINT_POSTERS, prepAssets } from './printPathPosters.mjs';
import { blockOf, focusBlockEnd, selectFrame, textBlockIds } from './undoKit.mjs';
import { openSignedIn, rowOf, savePill, savedWith } from './keepWorkKit.mjs';

/** The Fetch standard's limit on the bodies of a page's keepalive requests in flight (64 KiB). */
export const KEEPALIVE_QUOTA = 64 * 1024;
/** How long after leaving the stored row is read. */
export const AFTER_MS = 3000;

export const has = (state, id, word) => JSON.stringify(rowOf(state, id)?.data ?? {}).includes(word);

/** Count beforeunload dialogs on `page`, answering each with `answer` ('accept' leaves, 'dismiss' stays). */
export function watchDialogs(page, answer = 'accept') {
  const seen = { n: 0, at: [] };
  page.on('dialog', async (d) => {
    if (d.type() === 'beforeunload') { seen.n += 1; seen.at.push(Date.now()); }
    await (answer === 'accept' ? d.accept() : d.dismiss()).catch(() => {});
  });
  return seen;
}

/** Every PATCH the backend received since `t0`: `status@ms` and `+` when its body holds `word`. */
export const patchesSince = (state, t0, word) => state.log
  .filter((x) => x.method === 'PATCH' && x.t >= t0)
  .map((x) => `${x.status}@${x.t - t0}${word && (x.dataStr ?? '').includes(word) ? '+' : ''}`);

/**
 * The page's own record of each poster write it makes (each PATCH to the
 * posters table: when fetch was called, with `keepalive` or not), kept in
 * localStorage so it outlives the page; read back from a second page of the
 * same context (`writesMade`). It only records and calls through. It shows
 * a request the page made that the fake backend could not see: one made a
 * moment before the tab closed, which Playwright's routes miss (MEASURED in
 * Firefox: a keepalive write made 1 ms before the close, never routed).
 */
function recordWritesScript() {
  if (window.__zqWrites) return;
  window.__zqWrites = true;
  const orig = window.fetch;
  window.fetch = function zqFetch(input, init) {
    try {
      const url = String(input?.url ?? input);
      if (/\/rest\/v1\/posters\?/.test(url) && init?.method === 'PATCH') {
        const n = Number(localStorage.getItem('zq-w-n') ?? '0');
        localStorage.setItem('zq-w-n', String(n + 1));
        localStorage.setItem(`zq-w-${n}`, JSON.stringify({ t: performance.timeOrigin + performance.now(), ka: init.keepalive === true, body: String(init.body ?? '').slice(0, 4000) }));
      }
    } catch { /* recording only */ }
    return orig.apply(this, arguments);
  };
  // When the page began to go, by its own clock (the first beforeunload or
  // pagehide of each document).
  let marked = false;
  const leave = (e) => {
    if (marked) return;
    marked = true;
    try { localStorage.setItem(`zq-leave-${performance.timeOrigin + performance.now()}`, e.type); } catch { /* recording only */ }
  };
  addEventListener('beforeunload', leave, true);
  addEventListener('pagehide', leave, true);
}

export async function recordWrites(s) {
  await s.context.addInitScript(recordWritesScript);
  if (!s.page.isClosed()) await s.page.evaluate(recordWritesScript);
}

/** The writes the page recorded since `since` (ms, this machine's clock): `ka@ms` or `plain@ms`, `+` when the body holds `word`. */
export async function writesMade(h, s, since, word) {
  const p = await s.context.newPage();
  try {
    await p.goto(`${h.base}/version.json`);
    const { all, leaves } = await p.evaluate(() => {
      const n = Number(localStorage.getItem('zq-w-n') ?? '0');
      return {
        all: Array.from({ length: n }, (_, i) => JSON.parse(localStorage.getItem(`zq-w-${i}`) ?? 'null')).filter(Boolean),
        leaves: Object.keys(localStorage).filter((k) => k.startsWith('zq-leave-')).map((k) => Number(k.slice('zq-leave-'.length))),
      };
    });
    const firstLeave = leaves.filter((t) => t >= since).sort((a, b) => a - b)[0];
    const list = all.filter((w) => w.t >= since).map((w) => ({ at: Math.round(w.t - since), ka: w.ka, has: !!word && w.body.includes(word) }));
    list.leftAt = firstLeave === undefined ? null : Math.round(firstLeave - since);
    return list;
  } finally {
    await p.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ edits
// Each makes one change with the user's keys or mouse and returns a check
// of the stored row: did it keep the change?

/** A word typed at the end of the first text block. */
export async function typeWord(page, word) {
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await page.keyboard.type(` ${word}`, { delay: 20 });
  return { at: Date.now(), kept: (state, id) => has(state, id, word) };
}

/**
 * A passive read of the editor's poster (the store, as undoKit's `read`
 * does): a stored row may not hold the blocks yet, since a new poster's
 * template is laid out in the browser and stored with the first save.
 */
const editorDoc = (page) => page.evaluate(async () => {
  const { doc } = (await import('/src/stores/posterStore.ts')).usePosterStore.getState();
  return { xs: doc.blocks.map((x) => [x.id, x.x]), body: doc.styles?.body?.size };
});

/** The references block selected by a click on its frame, then → (a nudge, record 36). */
async function nudge(page) {
  const ref = await blockOf(page, 'references');
  if (!ref) throw new Error('precondition: no references block on the new poster');
  await selectFrame(page, ref);
  const before = new Map((await editorDoc(page)).xs);
  await page.keyboard.press('ArrowRight');
  const at = Date.now();
  const after = new Map((await editorDoc(page)).xs);
  const x1 = after.get(ref);
  if (!(x1 > before.get(ref))) throw new Error(`precondition: → did not move the references block (${before.get(ref)} → ${x1})`);
  return { at, kept: (st, pid) => rowOf(st, pid)?.data?.blocks?.find((b) => b.id === ref)?.x === x1 };
}

/** The top bar's A+ (record 33), pressed with the mouse. */
async function aPlus(page) {
  const before = (await editorDoc(page)).body;
  await page.locator('[data-postr-editor-topbar] button[aria-label="Increase text size"]').first().click();
  const at = Date.now();
  const after = (await editorDoc(page)).body;
  if (!(after > before)) throw new Error(`precondition: A+ did not raise the body size (${before} → ${after})`);
  return { at, kept: (st, pid) => rowOf(st, pid)?.data?.styles?.body?.size === after };
}

/** One line pasted at the end of the first text block (a page-made paste event, plain text). */
async function paste(page, word) {
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await pasteText(page, ` ${word}`);
  return { at: Date.now(), kept: (state, id) => has(state, id, word) };
}

/** A paste event carrying `text` on the focused element (keepWorkLimits H5's way). */
async function pasteText(page, text) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    // Set on the event itself: Firefox gives a page-made paste event an
    // empty clipboardData whatever its init says (fix 27, H5).
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    document.activeElement.dispatchEvent(ev);
  }, text);
}

export const EDITS = { type: typeWord, nudge, aplus: aPlus, paste };

// ------------------------------------------------------------------ ways to leave
// `prepare` runs before the edit (the page the user came from); `leave` right
// after it. `unloads`: the editor's document goes (a leave dialog can show).

export const WAYS = {
  close: { unloads: true, how: 'the tab closed (its leave dialog accepted)', leave: (page) => page.close({ runBeforeUnload: true }) },
  reload: { unloads: true, how: 'the page reloaded (its leave dialog accepted)', leave: (page) => page.reload({ timeout: 20000 }).catch(() => {}) },
  back: {
    unloads: true,
    how: 'the browser\'s Back to the page before the editor (its leave dialog accepted)',
    async prepare(h, s) {
      await s.page.goto(`${h.base}/version.json`);
      await s.page.goto(`${h.base}/p/${s.id}`);
      await waitSheet(s.page);
    },
    leave: (page) => page.goBack({ timeout: 20000 }).catch(() => {}),
  },
  link: {
    unloads: true,
    how: 'the sidebar\'s "Back to My Posters" link clicked (a full page load; its leave dialog accepted)',
    leave: (page) => page.getByRole('link', { name: /Back to My Posters/ }).first().click({ noWaitAfter: true }),
  },
  address: { unloads: true, how: 'another address opened in the tab (its leave dialog accepted)', leave: (page, h) => page.goto(`${h.base}/version.json`, { timeout: 20000 }).catch(() => {}) },
  inapp: {
    unloads: false,
    how: 'the poster opened from the dashboard\'s card, then the browser\'s Back to the dashboard (a route change in the app: the editor unmounts)',
    async prepare(h, s) {
      await s.page.goto(`${h.base}/dashboard`);
      const card = s.page.locator(`a[href="/p/${s.id}"]`).first();
      await card.waitFor({ timeout: 30000 });
      await card.click();
      await waitSheet(s.page);
    },
    leave: (page) => page.goBack({ timeout: 20000 }).catch(() => {}),
  },
};

export async function waitSheet(page) {
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

/**
 * One cell: edit `editName`, then leave by `wayName` at once. Claims: L1 the
 * edit is not stored 3 s after leaving; L5 (closing the tab, where every
 * engine shows the dialog on main) no leave dialog while the change was
 * unsaved; L0 the edit lost with no dialog (the harm the gate forbids).
 */
function cell(editName, wayName) {
  const way = WAYS[wayName];
  const word = `ZQL${editName.slice(0, 2).toUpperCase()}${wayName.slice(0, 3).toUpperCase()}`;
  const claims = ['L1', 'L0', ...(wayName === 'close' ? ['L5'] : [])];
  return {
    id: `L1-${editName}-${wayName}`, claims,
    how: `${editName === 'type' ? `" ${word}" typed in the first text block` : editName === 'nudge' ? 'the references block selected, → pressed (a nudge)' : editName === 'aplus' ? 'the top bar\'s A+ clicked' : `" ${word}" pasted at the end of the first text block`}, then at once ${way.how}: is the edit stored ${AFTER_MS / 1000} s later?`,
    async run(h, s) {
      await recordWrites(s);
      if (way.prepare) await way.prepare(h, s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      const edit = await EDITS[editName](page, word);
      const pill = await savePill(page);
      const t0 = Date.now();
      await way.leave(page, h);
      await sleep(AFTER_MS);
      const kept = edit.kept(state, id);
      const unloads = way.unloads;
      const made = await writesMade(h, s, t0 - 50, ['type', 'paste'].includes(editName) ? word : null);
      return {
        claims: { L1: !kept, L0: !kept && dialogs.n === 0, ...(wayName === 'close' ? { L5: dialogs.n === 0 } : {}) },
        numbers: {
          stored: kept, dialog: unloads ? dialogs.n > 0 : `${dialogs.n} (a route change)`, pillBefore: JSON.stringify(pill), leftAfterMs: t0 - edit.at,
          patches: JSON.stringify(patchesSince(state, t0 - 50, ['type', 'paste'].includes(editName) ? word : null)),
          writesMade: JSON.stringify(made.map((w) => `${w.ka ? 'ka' : 'plain'}@${w.at}${w.has ? '+' : ''}`)),
          // By the page's own clock: when it began to go (its first
          // beforeunload or pagehide; none for a route change) and when its
          // first poster write was made, from then.
          pageLeftAtMs: made.leftAt, firstWriteAfterLeaveMs: made.length && made.leftAt !== null ? made[0].at - made.leftAt : null,
        },
      };
    },
  };
}

/** A body over the keepalive limit: the save of a poster with this much text pasted in. */
const BIG_TEXT_WORDS = 11000;

export const LEAVE = [
  {
    // The instrument's own check: Playwright's routes see a keepalive request
    // sent while the page goes. They see one sent at beforeunload when the
    // tab is closed, and one sent at pagehide when the page navigates; one
    // sent at pagehide when the tab is closed is not seen in any engine
    // (MEASURED while writing this harness: the page's target has gone), so a
    // tab close is measured through what the page sends at beforeunload.
    id: 'LK-keepalive-seen', control: true,
    how: 'control: a keepalive fetch sent at beforeunload, and one at pagehide, as the tab closes and as the page goes to another address: does the fake backend see each?',
    async run(h, s) {
      const seen = {};
      const probe = async (sess, leave) => {
        const got = [];
        await sess.context.route('https://dummy.supabase.co/rest/v1/zq_probe*', async (route) => {
          got.push(new URL(route.request().url()).searchParams.get('tag'));
          await route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' }).catch(() => {});
        });
        await sess.page.evaluate(() => {
          const send = (tag) => {
            try {
              void fetch(`https://dummy.supabase.co/rest/v1/zq_probe?tag=${tag}`, {
                method: 'PATCH', keepalive: true, body: JSON.stringify({ tag }),
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer zq', apikey: 'zq', Prefer: 'return=representation' },
              }).catch(() => {});
            } catch { /* counted as not seen */ }
          };
          addEventListener('beforeunload', (e) => { send('beforeunload'); e.preventDefault(); e.returnValue = ''; });
          addEventListener('pagehide', () => send('pagehide'));
        });
        watchDialogs(sess.page);
        // A user gesture first: a browser shows the leave dialog only on a page the user touched.
        await sess.page.locator('button[data-postr-tab]').first().click();
        await leave(sess.page);
        await sleep(1500);
        return got;
      };
      seen.close = await probe(s, (p) => p.close({ runBeforeUnload: true }));
      const s2 = await openSignedIn(h);
      try {
        seen.address = await probe(s2, (p) => p.goto(`${h.base}/version.json`).catch(() => {}));
      } finally {
        await s2.context.close().catch(() => {});
      }
      return {
        ok: seen.close.includes('beforeunload') && seen.address.includes('pagehide'),
        numbers: { closeSeen: JSON.stringify(seen.close), addressSeen: JSON.stringify(seen.address), blindSpot: `pagehide at a tab close ${seen.close.includes('pagehide') ? 'seen' : 'not seen'}` },
      };
    },
  },
  ...Object.keys(EDITS).flatMap((e) => Object.keys(WAYS).map((w) => cell(e, w))),
  {
    // Fix 27's single writer (S8): the first write held 2.5 s, an edit made
    // while it is out, then the tab closed at once. The newer change cannot
    // be written before the held one lands without racing it.
    id: 'L4-slow-write-then-edit-close', claims: ['L4', 'L4d'],
    how: 'the first save held 2.5 s by the backend; " ZQSA" typed; 1 s later (its write out) " ZQSB"; the tab closed at once: is an older poster stored over a newer one (L4), or ZQSB lost with no dialog (L4d)? 4 s later',
    async run(h, s) {
      return slowThenEdit(h, s, 'ZQSA', 'ZQSB', (page) => page.close({ runBeforeUnload: true }));
    },
  },
  {
    id: 'L4-slow-write-then-edit-address', claims: ['L4', 'L4d'],
    how: 'the same, leaving by another address: an older poster stored over a newer one (L4), or ZQSD lost with no dialog (L4d)?',
    async run(h, s) {
      return slowThenEdit(h, s, 'ZQSC', 'ZQSD', (page) => page.goto(`${h.base}/version.json`).catch(() => {}));
    },
  },
  {
    // The write sent as the tab starts to close, then the user stays (the
    // dialog dismissed) and edits again while it is still out: the next write
    // must wait for it (one write at a time), or the held one lands last.
    id: 'L4-stay-then-edit', claims: ['L4s'],
    how: 'every save held 2 s by the backend; " ZQSE" typed; the tab close asked at once and the dialog dismissed (Stay); " ZQSF" typed 300 ms later; 6 s later: is ZQSF missing from the stored poster, or was a write sent while another was out?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patchDelays = [2000, 2000, 2000, 2000];
      const dialogs = watchDialogs(page, 'dismiss');
      await typeWord(page, 'ZQSE');
      const t0 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(300);
      const closed = page.isClosed();
      await page.keyboard.type(' ZQSF', { delay: 20 });
      await sleep(6000);
      // The autosave's writes (they carry the poster; the thumbnail's own
      // write carries only its path, and is not one of them), when each was
      // stored: each was held 2 s, so one that arrived before the one
      // before it was stored is two in flight.
      const writes = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.keys?.includes('data'));
      const overlap = writes.some((w, i) => i > 0 && w.t - 2000 < writes[i - 1].t);
      const last = writes.at(-1);
      return {
        claims: { L4s: closed || !has(state, id, 'ZQSF') || overlap },
        numbers: {
          dialog: dialogs.n > 0, stayed: !closed, writesStoredAtMs: JSON.stringify(writes.map((w) => `${w.status}@${w.t - t0}${(w.dataStr ?? '').includes('ZQSF') ? '+F' : (w.dataStr ?? '').includes('ZQSE') ? '+E' : ''}`)),
          lastHoldsF: !!last && (last.dataStr ?? '').includes('ZQSF'), stored: `${has(state, id, 'ZQSE') ? 'E' : ''}${has(state, id, 'ZQSF') ? 'F' : ''}`,
        },
      };
    },
  },
  {
    // Fix 27's retry state: a save failed, the backend accepts again before
    // the next retry, and the user closes the tab meanwhile.
    id: 'LF-failed-then-recovered-close', claims: ['LF'],
    how: 'every save fails (network); " ZQFR" typed; 3.5 s later (two attempts failed, the next retry due at about 7.8 s) the backend accepts again and the tab is closed at once: is the word stored 3 s later?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQFR');
      const t0 = Date.now();
      await sleep(3500);
      const failed = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0).length;
      const pill = await savePill(page);
      state.faults.patch = 'ok';
      const t1 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      return {
        claims: { LF: !has(state, id, 'ZQFR') },
        numbers: { failedBefore: failed, pillBefore: JSON.stringify(pill), dialog: dialogs.n > 0, patchesAfter: JSON.stringify(patchesSince(state, t1, 'ZQFR')), stored: has(state, id, 'ZQFR') },
      };
    },
  },
  {
    id: 'LF-still-failing-close', claims: ['LFd'],
    how: 'every save fails (network) while " ZQFD" waits; 3 s later the tab is closed (the backend still failing): the word cannot be stored; was the dialog shown first (LFd: lost with no dialog)?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQFD');
      await sleep(3000);
      const t1 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(1500);
      const kept = has(state, id, 'ZQFD');
      return { claims: { LFd: !kept && dialogs.n === 0 }, numbers: { dialog: dialogs.n > 0, stored: kept, patchesAtClose: JSON.stringify(patchesSince(state, t1, 'ZQFD')) } };
    },
  },
  {
    // The keepalive limit (the brief's L2): a poster whose save is larger
    // than 64 KiB, a long text pasted and stored, then a word typed and the
    // tab closed at once.
    id: 'L2-over-limit-close', claims: ['L2'],
    how: `${BIG_TEXT_WORDS} words pasted into the first text block and stored (a save over the 64 KiB keepalive limit); " ZQBIG" typed; the tab closed at once: lost with no dialog (L2)? and is it stored?`,
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      const words = Array.from({ length: BIG_TEXT_WORDS }, (_, i) => `word${i % 97}`).join(' ');
      await pasteText(page, ` ZQLONG ${words}`);
      if (!(await savedWith(state, 'ZQLONG', { timeout: 15000 }))) throw new Error('precondition: the long text was not stored');
      const bodyBytes = Buffer.byteLength(JSON.stringify(rowOf(state, id).data), 'utf8');
      await sleep(1200);
      const dialogs = watchDialogs(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQBIG', { delay: 20 });
      const t0 = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      const kept = has(state, id, 'ZQBIG');
      return {
        claims: { L2: !kept && dialogs.n === 0 },
        numbers: { dataBytes: bodyBytes, overQuota: bodyBytes > KEEPALIVE_QUOTA, dialog: dialogs.n > 0, stored: kept, patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQBIG')) },
      };
    },
  },
  {
    // The brief's L2 measurement: the size of a save of real posters (the
    // print path harness's templates, welcome poster and posters a user has
    // written into), against the keepalive limit. Images as the app stores
    // them once uploaded (a storage:// path), and as data: URLs (an image
    // whose upload has not happened: the fake backend's posters keep them).
    id: 'L2-sizes', info: true,
    how: 'information: the PATCH body of a save of each print-path poster, in bytes (UTF-8), with its images as storage:// paths and as data: URLs, against 64 KiB',
    async run(h, s) {
      const page = await s.context.newPage();
      const a = await prepAssets(page, h.docBase ?? h.base, REPO);
      const bytes = (d, P) => Buffer.byteLength(JSON.stringify({ updated_at: new Date().toISOString(), data: d, title: 'Untitled Poster', width_in: P.size.w, height_in: P.size.h }), 'utf8');
      const stored = (d) => ({ ...d, blocks: d.blocks.map((b) => (typeof b.imageSrc === 'string' && b.imageSrc.startsWith('data:') ? { ...b, imageSrc: `storage://00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/${b.id}.png` } : b)) });
      const numbers = {};
      let max = 0;
      for (const P of PRINT_POSTERS) {
        const doc = { ...DEFAULT_DATA, widthIn: P.size.w, heightIn: P.size.h, ...P.build(a) };
        const n = bytes(stored(doc), P);
        max = Math.max(max, n);
        numbers[P.id] = `${n}${bytes(doc, P) !== n ? ` (data: URLs ${bytes(doc, P)})` : ''}`;
      }
      numbers.largest = max;
      numbers.quota = KEEPALIVE_QUOTA;
      return { numbers };
    },
  },
  {
    // L3's sibling: the editor left inside the app (its write sent as it
    // unmounts), then the tab closed at once. The editor's leave dialog went
    // with it, so a loss here is silent (MEASURED on main in Chromium while
    // writing this harness: not stored, no dialog).
    id: 'L3-inapp-then-close', claims: ['L3c'],
    how: '" ZQIC" typed; at once the browser\'s Back to the dashboard inside the app, then the tab closed at once: is the word lost, neither stored nor sent before the close by a request that outlives the page (L3c)?',
    async run(h, s) {
      await recordWrites(s);
      await WAYS.inapp.prepare(h, s);
      const { page, state, id } = s;
      const dialogs = watchDialogs(page);
      await typeWord(page, 'ZQIC');
      const t0 = Date.now();
      await page.goBack().catch(() => {});
      const tClose = Date.now();
      await page.close({ runBeforeUnload: true });
      await sleep(AFTER_MS);
      const kept = has(state, id, 'ZQIC');
      const made = await writesMade(h, s, t0, 'ZQIC');
      // A keepalive write of the word made before the close: the browser
      // finishes it after the page has gone (the Fetch standard), which
      // the fake backend cannot see when the page closes within a moment.
      const goneAt = made.leftAt ?? tClose - t0;
      const keptAlive = made.some((w) => w.ka && w.has && w.at <= goneAt);
      return {
        claims: { L3c: !kept && !keptAlive },
        numbers: {
          stored: kept, dialog: dialogs.n > 0, closeAtMs: tClose - t0, pageLeftAtMs: made.leftAt, writesMade: JSON.stringify(made.map((w) => `${w.ka ? 'ka' : 'plain'}@${w.at}${w.has ? '+' : ''}`)),
          patches: JSON.stringify(patchesSince(state, t0 - 50, 'ZQIC')),
        },
      };
    },
  },
  {
    // A sibling of the cause, not fixed by record 38 (its section 6): the
    // diagnostics batch (lib/diagnostics.ts) is sent at pagehide with
    // keepalive, but only after it reads the session asynchronously, as the
    // autosave's save did. An autosave failure queues a signal, sent 5 s
    // later or when the page goes.
    id: 'LD-diagnostics-at-leave', info: true,
    how: 'information: every save fails (network); " ZQDG" typed; 1.5 s later (a failure signal queued, its batch due 5 s after it) the page goes to another address: does the diagnostics batch reach the API?',
    async run(h, s) {
      const run = async (sess, leave) => {
        const got = [];
        await sess.context.route('http://localhost:3000/v1/diagnostics/ui', async (route) => {
          got.push(Date.now());
          await route.fulfill({ status: 202, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: '{}' }).catch(() => {});
        });
        sess.state.faults.patch = 'network';
        watchDialogs(sess.page);
        await typeWord(sess.page, 'ZQDG');
        await sleep(1500);
        const t0 = Date.now();
        if (leave) await sess.page.goto(`${h.base}/version.json`).catch(() => {});
        await sleep(leave ? 2000 : 6000);
        return { failed: sess.state.log.filter((x) => x.method === 'PATCH').length, sent: got.map((t) => t - t0) };
      };
      const left = await run(s, true);
      // The control: the same failure, the page kept 6 s: the batch is sent (5 s after the signal).
      const s2 = await openSignedIn(h);
      let kept;
      try { kept = await run(s2, false); } finally { await s2.context.close().catch(() => {}); }
      return {
        numbers: {
          leftAtOnce: `saves failed ${left.failed}, batches sent ${left.sent.length} ${JSON.stringify(left.sent)}`,
          controlKept6s: `saves failed ${kept.failed}, batches sent ${kept.sent.length} ${JSON.stringify(kept.sent)}`,
        },
      };
    },
  },
];

/** L4: the first write held `holdMs`, a newer edit while it is out, then `leave`; the stored row read `afterMs` later. */
export async function slowThenEdit(h, s, older, newer, leave, { holdMs = 2500, afterMs = 4000 } = {}) {
  const { page, state, id } = s;
  state.faults.patchDelays = [holdMs];
  const dialogs = watchDialogs(page);
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await page.keyboard.type(` ${older}`, { delay: 20 });
  const t0 = Date.now();
  await sleep(1000);
  const outBefore = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0).length;
  await page.keyboard.type(` ${newer}`, { delay: 20 });
  await leave(page);
  await sleep(afterMs);
  // Stored writes in the order they were applied; older over newer: a write
  // without `newer` applied after one with it.
  const applied = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0 && x.status === 200 && x.keys?.includes('data'));
  const firstNewer = applied.findIndex((x) => (x.dataStr ?? '').includes(newer));
  const olderAfter = firstNewer >= 0 && applied.slice(firstNewer + 1).some((x) => !(x.dataStr ?? '').includes(newer));
  const kept = has(state, id, newer);
  return {
    claims: { L4: olderAfter, L4d: !kept && dialogs.n === 0 },
    numbers: {
      writesLandedBeforeEdit: outBefore, dialog: dialogs.n > 0,
      applied: JSON.stringify(applied.map((x) => `@${x.t - t0}${(x.dataStr ?? '').includes(newer) ? '+new' : (x.dataStr ?? '').includes(older) ? '+old' : ''}`)),
      stored: `${has(state, id, older) ? older : ''} ${kept ? newer : ''}`.trim(),
    },
  };
}
