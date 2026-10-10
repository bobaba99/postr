/**
 * Information scenarios for scripts/keep-work-check.mjs (record
 * docs/fixes/27-keep-work-safe.md, section 10): a change that waits to be
 * saved while the poster changes somewhere else, or while the session ends.
 * Printed, not counted: both are known limits the fix does not change (the
 * owner's call), kept measurable here. From review round 2 of fix 27, the
 * reviewer's probes folded in (findings R2-A2 and R2-A3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO, sleep } from './editorHarness.mjs';
import { closeWithLeavePrompt, installGuestBackend } from './guestBackend.mjs';
import { focusBlockEnd, textBlockIds } from './undoKit.mjs';
import { rowOf, savePill, savedWith } from './keepWorkKit.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

const ON_CANVAS = '#poster-canvas';
const has = (state, id, word) => JSON.stringify(rowOf(state, id)?.data ?? {}).includes(word);

async function typeInFirstBlock(page, text) {
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await page.keyboard.type(text, { delay: 35 });
}

/** Does the bytes' text (a .postr file, zipped or not) hold `word`? */
function fileHolds(bytes, word) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return Object.values(unzipSync(new Uint8Array(bytes))).some((u) => strFromU8(u).includes(word));
  }
  return bytes.toString('utf8').includes(word);
}

export const ELSEWHERE = [
  {
    // R2-A2: every write is unconditional (the last one wins), so a change
    // retried after an outage is written over whatever another device saved
    // in between, with no edit from the user. On main the outage's change was
    // never retried and was lost instead (S1). Not fixed: writes conditional
    // on the row's version, and what to ask the user then, are the owner's
    // call (record section 10; PLAN.md's Later list).
    id: 'H2-saved-elsewhere-meanwhile', info: true,
    how: 'device A\'s saves fail; A types " ZQTA"; device B (another browser, the same account) opens the poster, types " ZQTB", saved; A\'s network comes back, A types nothing: whose word is stored 35 s later?',
    async run(h, s) {
      const { page, state, id } = s;
      let aDown = true;
      await page.route('https://dummy.supabase.co/rest/v1/posters*', (route) => (
        aDown && route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.fallback()
      ));
      await typeInFirstBlock(page, ' ZQTA');
      await sleep(2500);
      const pillA = await savePill(page);
      const authKey = await page.evaluate(() => Object.keys(localStorage).find((k) => /auth-token/.test(k)));
      const authVal = await page.evaluate((k) => localStorage.getItem(k), authKey);
      const ctxB = await h.browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await installGuestBackend(ctxB, state, h.base);
        await ctxB.addInitScript(({ k, v }) => { try { localStorage.setItem(k, v); } catch { /* none */ } }, { k: authKey, v: authVal });
        const pageB = await ctxB.newPage();
        await pageB.goto(`${h.base}/p/${id}`);
        await pageB.waitForSelector(`${ON_CANVAS} [data-block-id]`, { timeout: 90000 });
        await pageB.waitForTimeout(800);
        await typeInFirstBlock(pageB, ' ZQTB');
        const savedB = await savedWith(state, 'ZQTB', { timeout: 8000 });
        await sleep(500);
        const afterB = { A: has(state, id, 'ZQTA'), B: has(state, id, 'ZQTB') };
        const tUp = Date.now();
        aDown = false;
        await sleep(35000);
        const writes = state.log
          .filter((x) => x.method === 'PATCH' && x.t >= tUp && x.status === 200 && x.keys?.includes('data'))
          .map((x) => ({ ms: x.t - tUp, A: x.dataStr.includes('ZQTA'), B: x.dataStr.includes('ZQTB') }));
        const banner = (p) => p.evaluate(() => document.querySelector('[role="alert"]')?.textContent?.trim().slice(0, 80) ?? null);
        return {
          numbers: {
            pillA: JSON.stringify(pillA), bSaved: !!savedB, storedAfterB: JSON.stringify(afterB),
            writesAfterARecovers: JSON.stringify(writes),
            storedAtEnd: JSON.stringify({ A: has(state, id, 'ZQTA'), B: has(state, id, 'ZQTB') }),
            bannerA: JSON.stringify(await banner(page)), bannerB: JSON.stringify(await banner(pageB)),
          },
        };
      } finally {
        await ctxB.close().catch(() => {});
      }
    },
  },
  {
    // R2-A3: the session ends (the access token expired, the refresh token
    // refused) while a save is failing. The editor closes on the account
    // change (fix 23's closed page): the change is only in its "Download a
    // copy", and leaving warns of nothing. The same on main. Not fixed:
    // record section 10; PLAN.md's Later list.
    id: 'H3-session-ends-while-unsaved', info: true,
    how: 'the backend fails (network); " ZQN4A" typed; the session ends (refresh refused, token expired, 401); the backend accepts again: is the word stored, in the closed page\'s copy, and is leaving warned?',
    async run(h, s) {
      const { page, state, id } = s;
      state.faults.patch = 'network';
      await typeInFirstBlock(page, ' ZQN4A');
      await sleep(2500);
      const pillBefore = await savePill(page);
      state.faults.refresh = 'revoked';
      state.faults.patch = 'jwt';
      await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (!/auth-token/.test(k)) continue;
          try {
            const v = JSON.parse(localStorage.getItem(k));
            v.expires_at = Math.floor(Date.now() / 1000) - 10;
            localStorage.setItem(k, JSON.stringify(v));
          } catch { /* not a session */ }
        }
      });
      // supabase-js refreshes when the tab is shown again, as after a laptop wakes.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await sleep(12000);
      state.faults.patch = 'ok';
      await sleep(8000);
      const editorOpen = await page.evaluate(() => !!document.querySelector('#poster-canvas'));
      const screen = await page.evaluate(() => (document.querySelector('main h1')?.textContent ?? '').trim());
      const patches = state.log.filter((x) => x.method === 'PATCH').map((x) => `${x.status}${(x.dataStr ?? '').includes('ZQN4A') ? '+word' : ''}`);
      let copyHasWord = null;
      try {
        const button = page.getByRole('button', { name: /^Download a copy/ }).first();
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button.click()]);
        copyHasWord = fileHolds(fs.readFileSync(await dl.path()), 'ZQN4A');
      } catch (e) {
        copyHasWord = `no copy: ${String(e?.message ?? e).slice(0, 80)}`;
      }
      const prompted = page.isClosed() ? null : await closeWithLeavePrompt(page);
      return {
        numbers: {
          pillBefore: JSON.stringify(pillBefore), editorOpen, heading: JSON.stringify(screen), stored: has(state, id, 'ZQN4A'),
          patches: JSON.stringify(patches.slice(-8)), copyHasWord, leaveWarned: prompted,
        },
      };
    },
  },
];
