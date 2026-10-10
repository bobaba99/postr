/**
 * Saving: a failed save, the retry, the leave warning, two saves in
 * flight, Duplicate after a failed save, and ⌘S (scripts/keep-work-check.mjs,
 * record docs/fixes/27-keep-work-safe.md, OF-05 and bounded-designs §3.9).
 * The backend's failures are lib/guestBackend.mjs's faults; the browser's
 * own offline switch is Playwright's `context.setOffline`. Every scenario
 * types with the real keyboard into a fresh poster at /p/new, signed in.
 */
import { sleep } from './editorHarness.mjs';
import { closeWithLeavePrompt } from './guestBackend.mjs';
import { MOD, focusBlockEnd, openTab, textBlockIds } from './undoKit.mjs';
import {
  SAVE_KEY, attemptsWith, pageNow, rowOf, saveKeys, savePill, savedWith, toastsSince, versionPosts,
} from './keepWorkKit.mjs';

const NOT_SAVED = /^Not saved — retrying…$/;

async function typeInFirstBlock(page, text) {
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await page.keyboard.type(text, { delay: 35 });
  return Date.now();
}

const has = (state, id, word) => JSON.stringify(rowOf(state, id)?.data ?? {}).includes(word);
const gaps = (list) => list.slice(1).map((e, i) => e.t - list[i].t);

/** A backend failure of kind `fault`, then recovery with no further edit. */
function downThenBack(idName, fault, word, downMs, claims) {
  return {
    id: idName, claims,
    how: `the backend fails every save (${fault}); " ${word}" typed; after ${downMs / 1000} s it accepts again, nothing more typed`,
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = fault;
      const t0 = await typeInFirstBlock(page, ` ${word}`);
      await sleep(2000);
      const pillDown = await savePill(page);
      await sleep(Math.max(0, downMs - 2000));
      const failed = attemptsWith(state, word, t0);
      state.faults.patch = 'ok';
      const t1 = Date.now();
      const ok = await savedWith(state, word, { since: t1, timeout: 35000 });
      await sleep(400);
      const pillAfter = await savePill(page);
      const recoveredMs = ok ? ok.t - t1 : null;
      const out = {
        [claims[0]]: !ok,
        [claims[1]]: !NOT_SAVED.test(pillDown ?? ''),
        [claims[2]]: !ok || !/^Saved\b/.test(pillAfter ?? ''),
      };
      return {
        claims: out,
        numbers: {
          attemptsWhileDown: failed.length, gapsMs: JSON.stringify(gaps(failed)), firstAttemptMs: failed[0] ? failed[0].t - t0 : null,
          recoveredMs, pillDown: JSON.stringify(pillDown), pillAfter: JSON.stringify(pillAfter), stored: has(state, id, word),
        },
      };
    },
  };
}

/**
 * Every change stored, then every save fails (network), then `act`: with
 * nothing unsaved, the page must not say "not saved" (the pill, the
 * sidebar's message, the Poster name's button) or warn before leaving.
 * From round 2 of the restarted review of fix 27 (finding N2-F3, the
 * reviewer's probe folded in): a write queued for the poster's name passed
 * along with the action was the one failing, and its failure was counted as
 * an unsaved change.
 */
function nothingChanged(idName, claim, word, what, act) {
  return {
    id: idName, claims: [claim],
    how: `" ${word}" typed and stored; then every save fails (network); ${what}: does the page say "not saved", or warn before leaving, with nothing unsaved?`,
    async run(h, s) {
      const { page, state, id } = s;
      await typeInFirstBlock(page, ` ${word}`);
      if (!(await savedWith(state, word, { timeout: 6000 }))) throw new Error(`precondition: ${word} not stored`);
      await sleep(1500);
      const pillBefore = await savePill(page);
      const rowsBefore = state.rows.length;
      state.faults.patch = 'network';
      const t0 = Date.now();
      await act(page);
      await sleep(3000);
      const pill = await savePill(page);
      const said = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()).join(' | ') || null);
      const nameButton = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        return input?.parentElement?.querySelector('button')?.textContent?.trim() ?? null;
      });
      const writes = state.log.filter((x) => x.method === 'PATCH' && x.t >= t0).map((x) => `${x.status}@${x.t - t0}`);
      const copy = state.rows.length > rowsBefore ? state.rows[state.rows.length - 1] : null;
      const prompted = await closeWithLeavePrompt(page);
      // The pill's failure label, on main "Save failed. Recent changes are not saved.".
      const saysNotSaved = /not saved/i.test(pill ?? '') || /not saved/i.test(said ?? '') || (nameButton !== null && nameButton !== '✓ Saved');
      return {
        claims: { [claim]: saysNotSaved || prompted },
        numbers: {
          pillBefore: JSON.stringify(pillBefore), pill: JSON.stringify(pill), said: JSON.stringify(said), nameButton: JSON.stringify(nameButton),
          writesSent: JSON.stringify(writes), copyMade: !!copy, copyHasWord: copy ? JSON.stringify(copy.data).includes(word) : null,
          leavePrompted: prompted, stored: has(state, id, word),
        },
      };
    },
  };
}

export const SAVE = [
  {
    id: 'C1-normal-save', control: true,
    how: 'the backend works: " ZQOK" typed is stored within 3 s and the pill says Saved',
    async run(h, s) {
      const { page, state, id } = s;
      const t0 = await typeInFirstBlock(page, ' ZQOK');
      const ok = await savedWith(state, 'ZQOK', { since: t0, timeout: 3000 });
      await sleep(300);
      const pill = await savePill(page);
      return { ok: !!ok && has(state, id, 'ZQOK') && /^Saved\b/.test(pill ?? ''), numbers: { savedAfterMs: ok ? ok.t - t0 : null, pill: JSON.stringify(pill) } };
    },
  },
  downThenBack('S1-network-down-then-back', 'network', 'ZQNET', 9000, ['S1', 'S2', 'S3']),
  downThenBack('S6-refused-then-accepted', 'refused', 'ZQREF', 4000, ['S6', 'S6p', 'S6a']),
  {
    id: 'S4-leave-while-unsaved', claims: ['S4'],
    how: 'the backend fails (network); " ZQLEAVE" typed; 3 s later the tab is closed: is the leave warning shown?',
    async run(h, s) {
      const { page, state } = s;
      state.faults.patch = 'network';
      const t0 = await typeInFirstBlock(page, ' ZQLEAVE');
      await sleep(3000);
      const tries = attemptsWith(state, 'ZQLEAVE', t0).length;
      const prompted = await closeWithLeavePrompt(page);
      return { claims: { S4: !prompted }, numbers: { attemptsBeforeClose: tries, prompted } };
    },
  },
  {
    id: 'S4c-leave-when-saved', claims: ['S4c'],
    how: 'the backend works; " ZQSAFE" typed and stored; the tab is closed: a warning here would be a false alarm',
    async run(h, s) {
      const { page, state } = s;
      const t0 = await typeInFirstBlock(page, ' ZQSAFE');
      const ok = await savedWith(state, 'ZQSAFE', { since: t0 });
      await sleep(500);
      const prompted = await closeWithLeavePrompt(page);
      return { claims: { S4c: !ok || prompted }, numbers: { saved: !!ok, prompted } };
    },
  },
  {
    // From review round 1 of fix 27 (finding R1-A7, the reviewer's probe
    // folded in): under React's StrictMode, the dev server these scenarios
    // run on, the autosave hook's simulated remount marked the loaded poster
    // unsaved without arming its timer, so a tab closed with no edit asked
    // to confirm leaving; main sent a save of the unchanged poster instead.
    // A click on a sidebar tab first, which edits nothing: a browser shows
    // the leave warning only to a page the user has interacted with
    // (Firefox under Playwright showed none without it: the pre-round tree
    // read "not prompted" there while Chromium and WebKit prompted).
    id: 'S9-open-and-close-no-edit', claims: ['S9'],
    how: 'the editor opened at /p/new; a sidebar tab clicked, nothing typed; 3 s later the tab is closed: a leave warning, or a save sent with nothing changed?',
    async run(h, s) {
      const { page, state } = s;
      await openTab(page, 'versions');
      await sleep(3000);
      const pill = await savePill(page);
      const patches = state.log.filter((x) => x.method === 'PATCH').length;
      const prompted = await closeWithLeavePrompt(page);
      return { claims: { S9: prompted || patches > 0 }, numbers: { prompted, patchesSinceOpen: patches, pill: JSON.stringify(pill) } };
    },
  },
  {
    id: 'S5-back-online', claims: ['S5'],
    how: 'the browser goes offline; " ZQOFF" typed; 3.4 s later it is back online: how soon is the word stored?',
    async run(h, s) {
      const { page, state, context, id } = s;
      // Playwright's offline switch fires the page's offline / online events
      // but still serves routed requests (MEASURED: a save went through
      // offline), so the fake backend fails the saves for the same time.
      await context.setOffline(true);
      state.faults.patch = 'network';
      const t0 = await typeInFirstBlock(page, ' ZQOFF');
      const failed = [];
      page.on('requestfailed', (r) => { if (r.method() === 'PATCH') failed.push(Date.now() - t0); });
      await sleep(3400);
      const pillDown = await savePill(page);
      state.faults.patch = 'ok';
      await context.setOffline(false);
      const t1 = Date.now();
      const ok = await savedWith(state, 'ZQOFF', { since: t1, timeout: 20000 });
      const ms = ok ? ok.t - t1 : null;
      return {
        claims: { S5: ms === null || ms > 1500 },
        numbers: { failedPatchesAtMs: JSON.stringify(failed), pillDown: JSON.stringify(pillDown), storedAfterOnlineMs: ms, stored: has(state, id, 'ZQOFF') },
      };
    },
  },
  {
    id: 'S7-edits-while-failing', claims: ['S7'],
    how: 'the backend fails (network); " ZQX1", 1.5 s, " ZQX2", 1.5 s; it accepts again: are both words stored?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      await typeInFirstBlock(page, ' ZQX1');
      await sleep(1500);
      await page.keyboard.type(' ZQX2', { delay: 35 });
      await sleep(1500);
      state.faults.patch = 'ok';
      const t1 = Date.now();
      let both = false;
      while (!both && Date.now() - t1 < 20000) { both = has(state, id, 'ZQX1') && has(state, id, 'ZQX2'); await sleep(200); }
      return { claims: { S7: !both }, numbers: { bothStoredAfterMs: both ? Date.now() - t1 : null } };
    },
  },
  {
    id: 'S8-two-saves-in-flight', claims: ['S8'],
    how: 'the first save is slow (2.5 s); " ZQR1", 1.2 s, " ZQR2": does the slow first save land last and drop ZQR2?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patchDelays = [2500];
      const t0 = await typeInFirstBlock(page, ' ZQR1');
      await sleep(1200);
      await page.keyboard.type(' ZQR2', { delay: 35 });
      await sleep(6000);
      const writes = attemptsWith(state, 'ZQR1', t0).map((e) => ({ at: e.t - t0, r2: (e.dataStr ?? '').includes('ZQR2') }));
      return {
        claims: { S8: !has(state, id, 'ZQR2') },
        numbers: { writesInOrderApplied: JSON.stringify(writes), finalHasR2: has(state, id, 'ZQR2') },
      };
    },
  },
  {
    // Information, not a claim (review round 1 of fix 27, finding R1-A2, the
    // reviewer's probe folded in, with a 12 s hold instead of 45 s): one
    // write at a time has no time limit, so a write the server holds keeps
    // every later save, ⌘S's answer and the pill's "Saved" waiting until it
    // returns. Kept, not fixed (record §10): a client timeout would let the
    // held write land after a newer one (S8's loss) unless writes became
    // conditional.
    id: 'H1-held-save', info: true,
    how: 'the first save is held 12 s; " ZQH1", 1.5 s, " ZQH2", 4 s, ⌘S: when is ZQH2 sent, what does the page say meanwhile, is it kept?',
    async run(h, s) {
      const { page, state, id } = s;
      const HOLD = 12000;
      const sent = [];
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().includes('/rest/v1/posters')) sent.push({ t: Date.now(), h2: (r.postData() ?? '').includes('ZQH2') });
      });
      state.faults.patchDelays = [HOLD];
      const t0 = await typeInFirstBlock(page, ' ZQH1');
      await sleep(1500);
      await page.keyboard.type(' ZQH2', { delay: 35 });
      await sleep(4000);
      const pillHeld = await savePill(page);
      const since = await pageNow(page);
      await page.keyboard.press(SAVE_KEY);
      await sleep(2000);
      const toastsWithin2s = await toastsSince(page, since);
      while (Date.now() - t0 < HOLD + 6000) await sleep(250);
      const firstH2 = sent.find((x) => x.h2);
      const heldBack = state.log.find((x) => x.method === 'PATCH' && x.t >= t0 && !(x.dataStr ?? '').includes('ZQH2'));
      return {
        numbers: {
          heldWriteBackMs: heldBack ? heldBack.t - t0 : null, zqh2SentMs: firstH2 ? firstH2.t - t0 : null,
          pillWhileHeld: JSON.stringify(pillHeld), saveKeyToastsWithin2s: JSON.stringify(toastsWithin2s),
          toastsByEnd: JSON.stringify(await toastsSince(page, since)), finalHasZqh2: has(state, id, 'ZQH2'), pillEnd: JSON.stringify(await savePill(page)),
        },
      };
    },
  },
  {
    id: 'D1-duplicate-after-failed-save', claims: ['D1'],
    how: 'the backend fails (network); " ZQDUP" typed; the sidebar\'s Duplicate pressed: is a copy made without the word?',
    async run(h, s) {
      const { page, state } = s;
      state.faults.patch = 'network';
      await typeInFirstBlock(page, ' ZQDUP');
      await sleep(1500);
      const before = state.rows.length;
      await page.locator('button[title="Duplicate this poster"]').first().click();
      await sleep(2500);
      const copy = state.rows.length > before ? state.rows[state.rows.length - 1] : null;
      const alert = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()).join(' | ') || null);
      const staleCopy = !!copy && !JSON.stringify(copy.data).includes('ZQDUP');
      return { claims: { D1: staleCopy }, numbers: { copyMade: !!copy, copyHasWord: copy ? !staleCopy : null, alert: JSON.stringify(alert) } };
    },
  },
  nothingChanged('K11-duplicate-nothing-changed', 'K11', 'ZQK11', 'the sidebar\'s Duplicate', async (page) => {
    await page.locator('button[title="Duplicate this poster"]').first().click();
  }),
  nothingChanged('K11n-name-enter-unchanged', 'K11n', 'ZQK11N', 'Layout › Poster name, Enter with the name unchanged', async (page) => {
    await openTab(page, 'layout');
    const field = page.locator('input[aria-label="Poster name"]').first();
    await field.waitFor({ state: 'visible', timeout: 10000 });
    await field.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
  }),
  {
    id: 'K1-save-key', claims: ['K1', 'K2', 'K3', 'K5'],
    how: '" ZQK1" typed, ⌘S at once: a version made? the word written at once? "Saved" said? the browser\'s save dialog swallowed?',
    async run(h, s) {
      const { page, state } = s;
      await typeInFirstBlock(page, ' ZQK1');
      const since = await pageNow(page);
      const tKey = Date.now();
      await page.keyboard.press(SAVE_KEY);
      await sleep(1500);
      const ok = await savedWith(state, 'ZQK1', { since: tKey - 50, timeout: 2000 });
      const toasts = await toastsSince(page, since);
      const keys = await saveKeys(page);
      const writeMs = ok ? ok.t - tKey : null;
      return {
        claims: {
          K1: versionPosts(state).length > 0,
          K2: writeMs === null || writeMs > 400,
          K3: !toasts.includes('Saved'),
          K5: keys.length === 0 || keys.some((k) => !k.prevented),
        },
        numbers: { versionsMade: versionPosts(state).length, writeAfterKeyMs: writeMs, toasts: JSON.stringify(toasts), keydownsCancelled: JSON.stringify(keys.map((k) => k.prevented)) },
      };
    },
  },
  {
    id: 'K4-save-key-31-times', claims: ['K4'],
    how: 'Versions › Save version once, then ⌘S 31 times, then Versions › Restore that version: does the store fill and Restore stop?',
    async run(h, s) {
      const { page, state, id } = s;
      await openTab(page, 'versions');
      await page.getByRole('button', { name: 'Save version' }).click();
      const t0 = Date.now();
      while (state.versions.length < 1 && Date.now() - t0 < 5000) await sleep(100);
      const since = await pageNow(page);
      for (let i = 0; i < 31; i += 1) { await page.keyboard.press(SAVE_KEY); await sleep(250); }
      await sleep(1500);
      const toasts = await toastsSince(page, since);
      const count = state.versions.filter((v) => v.poster_id === id).length;
      await openTab(page, 'versions');
      const restoreSince = await pageNow(page);
      await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
      await sleep(2000);
      const after = await toastsSince(page, restoreSince);
      const refused = await page.getByText('Could not restore this version').count();
      const restored = after.includes('Version restored');
      const tally = toasts.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
      return {
        claims: { K4: count >= 30 || !restored },
        numbers: { versionsAfter31Keys: count, toastTally: JSON.stringify(tally), restored, refusedMessage: refused > 0, versionInsertsRefused: versionPosts(state).filter((e) => e.status === 400).length },
      };
    },
  },
  {
    id: 'K6-save-key-while-failing', claims: ['K6'],
    how: 'the backend fails (network); " ZQK6" typed; ⌘S: does the page say "Saved" while the word is not stored?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      await typeInFirstBlock(page, ' ZQK6');
      await sleep(1200);
      const since = await pageNow(page);
      await page.keyboard.press(SAVE_KEY);
      await sleep(1500);
      const toasts = await toastsSince(page, since);
      const pill = await savePill(page);
      const claimsSaved = toasts.some((t) => /^Saved\b/.test(t)) || /^Saved\b/.test(pill ?? '');
      return {
        claims: { K6: claimsSaved && !has(state, id, 'ZQK6') },
        numbers: { toasts: JSON.stringify(toasts), pill: JSON.stringify(pill), stored: has(state, id, 'ZQK6') },
      };
    },
  },
  {
    // From review round 2 of fix 27 (finding R2-A4, the reviewer's probe
    // folded in): the Poster name is a draft until Enter or its Save button
    // (fix 12), and ⌘S in the field said "Saved" while the name typed was
    // not stored; the draft went with the tab, with no leave warning.
    id: 'K8-save-key-in-poster-name', claims: ['K8'],
    how: 'Layout › Poster name: select all, "ZQK8 name", ⌘S: is the name stored, and does the page say "Saved"?',
    async run(h, s) {
      const { page, state, id } = s;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type('ZQK8 name', { delay: 35 });
      const since = await pageNow(page);
      const tKey = Date.now();
      await page.keyboard.press(SAVE_KEY);
      await sleep(1500);
      const toasts = await toastsSince(page, since);
      const title = rowOf(state, id)?.title ?? null;
      const titleWrite = state.log.find((x) => x.method === 'PATCH' && x.t >= tKey && x.status === 200 && (x.keys ?? []).includes('title'));
      const button = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        return input?.parentElement?.querySelector('button')?.textContent?.trim() ?? null;
      });
      const keys = await saveKeys(page);
      return {
        claims: { K8: title !== 'ZQK8 name' || !toasts.includes('Saved') },
        numbers: {
          storedTitle: JSON.stringify(title), titleWrittenAfterKeyMs: titleWrite ? titleWrite.t - tKey : null,
          toasts: JSON.stringify(toasts), fieldButton: JSON.stringify(button), keydownsCancelled: JSON.stringify(keys.map((k) => k.prevented)),
        },
      };
    },
  },
  {
    // From the runs of fix 27's first review round 3 (its report never
    // reached the record; its numbers reproduced here first): the Poster
    // name field's button read "✓ Saved" while every save of the name
    // failed (on main too), the one "Saved" on the page the save's result
    // did not decide.
    id: 'K9-poster-name-while-failing', claims: ['K9', 'K9r', 'K9a'],
    how: 'every save fails (network); Layout › Poster name: select all, "ZQK9 name", Enter; 1.5 s later the backend accepts again, its next write held 3 s: does the field\'s button say "✓ Saved" before the name is stored, and after?',
    async run(h, s) {
      const { page, state, id } = s;
      const NAME = 'ZQK9 name';
      const read = () => page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        return input?.parentElement?.querySelector('button')?.textContent?.trim() ?? null;
      });
      const stored = () => rowOf(state, id)?.title === NAME;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      state.faults.patch = 'network';
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type(NAME, { delay: 35 });
      await page.keyboard.press('Enter');
      await sleep(1500);
      const buttonDown = await read();
      const pillDown = await savePill(page);
      const storedDown = stored();
      state.faults.patchDelays = [3000];
      state.faults.patch = 'ok';
      const t1 = Date.now();
      // Sampled page first, store second: a name the store lacks after the
      // page was read was not stored when the page said what it said.
      const samples = [];
      while (Date.now() - t1 < 15000) {
        const button = await read();
        const pill = await savePill(page);
        if (stored()) break;
        samples.push({ ms: Date.now() - t1, button, pill });
        await sleep(100);
      }
      const storedMs = stored() ? Date.now() - t1 : null;
      await sleep(400);
      const buttonAfter = await read();
      const pillAfter = await savePill(page);
      const savedEarly = samples.filter((x) => x.button === '✓ Saved');
      return {
        claims: {
          K9: buttonDown === '✓ Saved' && !storedDown,
          K9r: savedEarly.length > 0,
          K9a: storedMs === null || buttonAfter !== '✓ Saved' || !/^Saved\b/.test(pillAfter ?? ''),
        },
        numbers: {
          buttonDown: JSON.stringify(buttonDown), pillDown: JSON.stringify(pillDown), storedDown,
          samplesBeforeStored: samples.length, buttonSavedSamples: savedEarly.length,
          pillsBeforeStored: JSON.stringify([...new Set(samples.map((x) => x.pill))]),
          storedMsAfterRecovery: storedMs, buttonAfter: JSON.stringify(buttonAfter), pillAfter: JSON.stringify(pillAfter),
        },
      };
    },
  },
  {
    // From round 1 of the restarted review (finding N1-F1, the reviewer's
    // probe folded in): the button said "✓ Saved" while the name's first
    // write was still out, before any failure; K9 starts once a save has
    // failed, so it did not reach this.
    id: 'K10-poster-name-while-write-held', claims: ['K10', 'K10a'],
    how: 'Layout › Poster name: select all, "ZQK10 name", Enter, while the server holds the name\'s first write 4 s and then fails it (network); 1 s after that failure the backend accepts again: does the field\'s button say "✓ Saved" before the name is stored, and after?',
    async run(h, s) {
      const { page, state, id } = s;
      const NAME = 'ZQK10 name';
      const read = () => page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        return input?.parentElement?.querySelector('button')?.textContent?.trim() ?? null;
      });
      const stored = () => rowOf(state, id)?.title === NAME;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type(NAME, { delay: 35 });
      state.faults.patchDelays = [4000];
      state.faults.patch = 'network';
      const t0 = Date.now();
      await page.keyboard.press('Enter');
      // Page first, store second, every 100 ms, as K9 reads.
      const samples = [];
      let failedAt = null;
      let recoveredMs = null;
      while (Date.now() - t0 < 20000) {
        const button = await read();
        const pill = await savePill(page);
        if (stored()) break;
        samples.push({ ms: Date.now() - t0, button, pill });
        failedAt ??= state.log.find((x) => x.method === 'PATCH' && x.t >= t0 && x.status === 'aborted')?.t ?? null;
        if (failedAt !== null && recoveredMs === null && Date.now() - failedAt >= 1000) {
          state.faults.patch = 'ok';
          recoveredMs = Date.now() - t0;
        }
        await sleep(100);
      }
      const storedMs = stored() ? Date.now() - t0 : null;
      await sleep(400);
      const buttonAfter = await read();
      const pillAfter = await savePill(page);
      const failMs = failedAt === null ? null : failedAt - t0;
      const held = samples.filter((x) => failMs === null || x.ms < failMs);
      const afterFail = samples.filter((x) => failMs !== null && x.ms >= failMs);
      const savedHeld = held.filter((x) => x.button === '✓ Saved');
      return {
        claims: {
          K10: savedHeld.length > 0,
          K10a: storedMs === null || buttonAfter !== '✓ Saved' || !/^Saved\b/.test(pillAfter ?? ''),
        },
        numbers: {
          firstFailureMs: failMs, samplesWhileHeld: held.length, buttonSavedWhileHeld: savedHeld.length,
          pillsWhileHeld: JSON.stringify([...new Set(held.map((x) => x.pill))]),
          samplesAfterFailure: afterFail.length, buttonSavedAfterFailure: afterFail.filter((x) => x.button === '✓ Saved').length,
          pillsAfterFailure: JSON.stringify([...new Set(afterFail.map((x) => x.pill))]),
          recoveredMs, storedMs, buttonAfter: JSON.stringify(buttonAfter), pillAfter: JSON.stringify(pillAfter),
        },
      };
    },
  },
  {
    // The first review round 3's probe N1, folded in as information: ⌘S
    // saves the name being typed only from the name field (R2-A4); typed,
    // then left for the canvas, the name stays a draft (kept for the tab,
    // plan item 7), as every field that keeps a draft does (record 27 §10).
    id: 'H4-save-key-after-leaving-poster-name', info: true,
    how: 'Layout › Poster name: select all, "ZQH4 name"; a click into the first text block (the focus leaves the field); ⌘S: what is said, what is stored, what the field shows, and whether closing the tab warns',
    async run(h, s) {
      const { page, state, id } = s;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type('ZQH4 name', { delay: 35 });
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      const since = await pageNow(page);
      await page.keyboard.press(SAVE_KEY);
      await sleep(1500);
      const toasts = await toastsSince(page, since);
      // Selecting the block switched the sidebar to Edit block; the field
      // shows again with Layout, its draft kept for the tab (plan item 7).
      const tabAtKey = await page.evaluate(() => !!document.querySelector('input[aria-label="Poster name"]'));
      await openTab(page, 'layout');
      await field.waitFor({ state: 'visible', timeout: 10000 });
      const shown = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        return { value: input?.value ?? null, button: input?.parentElement?.querySelector('button')?.textContent?.trim() ?? null };
      });
      const prompted = await closeWithLeavePrompt(page);
      return {
        numbers: {
          toasts: JSON.stringify(toasts), storedTitle: JSON.stringify(rowOf(state, id)?.title ?? null),
          nameFieldShownAtKey: tabAtKey, fieldValue: JSON.stringify(shown.value), fieldButton: JSON.stringify(shown.button), leavePrompted: prompted,
        },
      };
    },
  },
];
