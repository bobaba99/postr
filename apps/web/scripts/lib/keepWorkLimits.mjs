/**
 * Information scenarios for scripts/keep-work-check.mjs (record
 * docs/fixes/27-keep-work-safe.md, section 10): limits the fix leaves,
 * kept measurable. Printed, not counted. From round 2 of the restarted
 * review of fix 27, the reviewer's probes folded in (findings N2-F1, N2-F2
 * and N2-F4), and from its round 3 the reviewer's measurement of Enter in an
 * emptied Poster name field (H8); each enters where a user does, at /p/new,
 * signed in.
 */
import { sleep } from './editorHarness.mjs';
import { MOD, focusBlockEnd, openTab, textBlockIds } from './undoKit.mjs';
import { SAVE_KEY, pageNow, rowOf, savePill, savedWith, toastsSince } from './keepWorkKit.mjs';

const ON_CANVAS = '#poster-canvas';
const has = (state, id, word) => JSON.stringify(rowOf(state, id)?.data ?? {}).includes(word);

async function typeInFirstBlock(page, text) {
  const [block] = await textBlockIds(page);
  await focusBlockEnd(page, block);
  await page.keyboard.type(text, { delay: 35 });
}

/** The first table block as stored: its grid and how many cells hold text. */
function storedTable(state, id) {
  const b = (rowOf(state, id)?.data?.blocks ?? []).find((x) => x.type === 'table');
  if (!b?.tableData) return null;
  const cells = b.tableData.cells ?? [];
  return { grid: `${b.tableData.rows}x${b.tableData.cols}`, filled: cells.filter((c) => (c ?? '').trim()).length };
}

/** The first table on the canvas: its grid as drawn. */
const drawnTable = (page) => page.evaluate((sel) => {
  const t = document.querySelector(`${sel} table`);
  return t ? `${t.rows.length}x${t.rows[0]?.cells.length ?? 0}` : null;
}, ON_CANVAS);

/** Is the bearer token of `req` a JWT that has expired? */
function expiredJwt(req) {
  const tok = (req.headers().authorization ?? '').replace(/^Bearer\s+/i, '');
  try {
    const exp = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).exp;
    return typeof exp === 'number' && exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

export const LIMITS = [
  {
    // N2-F1: the table's own paste handler (blocks.tsx, onPasteCapture on
    // the whole table) builds a new table from any paste with text
    // (tableOps.ts parseTablePaste) and replaces the old one, so a single
    // word pasted into one cell leaves a 1×1 table, which autosave stores;
    // ⌘Z brings the table back. Older than fix 27 (the same on main) and
    // outside its three behaviours: the lead's call (record section 10).
    // The paste is a paste event carrying plain text, as ⌘V delivers it:
    // the system clipboard is not touched (the reviewer's real ⌘C/⌘V in
    // Chromium and Firefox read the same).
    id: 'H5-paste-into-table-cell', info: true,
    how: 'a change typed and stored; the caret in the starting table\'s fifth cell; one line pasted there, "ZQW 12.4"; then ⌘Z: the table drawn and stored before, after the paste and after ⌘Z',
    async run(h, s) {
      const { page, state, id } = s;
      await typeInFirstBlock(page, ' ZQSTART');
      if (!(await savedWith(state, 'ZQSTART', { timeout: 6000 }))) throw new Error('precondition: ZQSTART not stored');
      const before = { stored: storedTable(state, id), drawn: await drawnTable(page) };
      const cell = page.locator(`${ON_CANVAS} td [contenteditable]`).nth(4);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.keyboard.press('End');
      const inCell = await page.evaluate(() => !!document.activeElement?.closest('td') && document.activeElement.isContentEditable);
      if (!inCell) throw new Error('precondition: the caret is not in a table cell');
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'ZQW 12.4');
        // Set on the event itself: Firefox gives a page-made paste event an
        // empty clipboardData whatever its init says (MEASURED: no paste
        // reached the table there with `{ clipboardData }`).
        const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: dt });
        document.activeElement.dispatchEvent(ev);
      });
      await sleep(300);
      const drawnAfter = await drawnTable(page);
      await savedWith(state, 'ZQW', { timeout: 6000 });
      await sleep(300);
      const after = { stored: storedTable(state, id), drawn: drawnAfter };
      await page.keyboard.press(`${MOD}+z`);
      await sleep(1500);
      const drawnUndo = await drawnTable(page);
      await sleep(1000);
      const undone = { stored: storedTable(state, id), drawn: drawnUndo };
      return { numbers: { before: JSON.stringify(before), afterPaste: JSON.stringify(after), afterUndo: JSON.stringify(undone) } };
    },
  },
  {
    // N2-F2: a write waits inside the Supabase client while it refreshes a
    // token in its last 90 s (auth-js retries the refresh with backoff,
    // under its lock), so during an outage no request goes out, the hook
    // sees no failure, the pill says "Saving…" and ⌘S answers only once the
    // network is back. Nothing is lost (the change pending, the leave
    // warning armed). A fresh token in the same outage reads "Not saved —
    // retrying…" (S5). Kept, not fixed: record section 10.
    id: 'H6-outage-while-token-refreshes', info: true, session: { expiresIn: 30 },
    how: 'a session whose token lasts 30 s; the browser goes offline (every backend request fails) while " ZQTOK" waits; the pill read every second for 45 s, ⌘S at 11 s; back online: when is the word stored, and what did the page say meanwhile?',
    async run(h, s) {
      const { page, state, id, context } = s;
      let offline = false;
      const seen = [];
      await context.route('https://dummy.supabase.co/**', async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fallback();
        const tag = `${req.method()} ${new URL(req.url()).pathname.replace(/^\/(rest|auth)\/v1\//, '')}`;
        if (offline) { seen.push({ t: Date.now(), e: `aborted ${tag}` }); return route.abort('internetdisconnected'); }
        // PostgREST refuses an expired token with 401 PGRST301.
        if (new URL(req.url()).pathname.startsWith('/rest/v1/') && expiredJwt(req)) {
          seen.push({ t: Date.now(), e: `401 ${tag}` });
          return route.fulfill({
            status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ code: 'PGRST301', details: null, hint: null, message: 'JWT expired' }),
          });
        }
        return route.fallback();
      });
      await context.setOffline(true);
      offline = true;
      const t0 = Date.now();
      await typeInFirstBlock(page, ' ZQTOK');
      const pills = [];
      let keyAt = null;
      for (let i = 0; i < 45; i += 1) {
        await sleep(1000);
        pills.push(await savePill(page));
        if (i === 10) {
          keyAt = await pageNow(page);
          await page.keyboard.press(SAVE_KEY);
        }
      }
      const toastsOffline = await toastsSince(page, keyAt);
      const tagsOffline = seen.filter((x) => x.t >= t0).reduce((m, x) => ({ ...m, [x.e]: (m[x.e] ?? 0) + 1 }), {});
      offline = false;
      await context.setOffline(false);
      const t1 = Date.now();
      const ok = await savedWith(state, 'ZQTOK', { since: t1, timeout: 45000 });
      await sleep(500);
      const tally = pills.reduce((m, p) => ({ ...m, [p]: (m[p] ?? 0) + 1 }), {});
      const keyToastsByEnd = await page.evaluate((since) => window.__zqToasts.filter((x) => x.t >= since).map((x) => `${x.text}@${x.t - since}`), keyAt);
      return {
        numbers: {
          pillPerSecondOffline: JSON.stringify(tally), requestsOffline: JSON.stringify(tagsOffline),
          saveKeyToastsOffline: JSON.stringify(toastsOffline), saveKeyToastsByEnd: JSON.stringify(keyToastsByEnd),
          storedMsAfterOnline: ok ? ok.t - t1 : null, pillEnd: JSON.stringify(await savePill(page)), stored: has(state, id, 'ZQTOK'),
        },
      };
    },
  },
  {
    // N2-F4: the sheet's width and height are drafts until Enter or leaving
    // the field, which asks "Change poster to …?" (SheetSizeFields.tsx), as
    // the other fields that keep a draft (record section 10): ⌘S there saves
    // the poster and says so, and the typed size stays in the field.
    id: 'H7-save-key-in-sheet-width', info: true,
    how: 'Layout › the poster\'s width: select all, "41" (a draft until Enter or leaving the field); ⌘S: what is said, the stored width, the field\'s value',
    async run(h, s) {
      const { page, state, id } = s;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster width in inches"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      const storedBefore = rowOf(state, id)?.data?.widthIn ?? null;
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type('41', { delay: 35 });
      const since = await pageNow(page);
      await page.keyboard.press(SAVE_KEY);
      await sleep(1500);
      return {
        numbers: {
          toasts: JSON.stringify(await toastsSince(page, since)), storedWidthBefore: storedBefore,
          storedWidth: rowOf(state, id)?.data?.widthIn ?? null, fieldValue: JSON.stringify(await field.inputValue().catch(() => null)),
          dialogOpen: await page.evaluate(() => !!document.querySelector('[role="dialog"], [role="alertdialog"]')),
        },
      };
    },
  },
  {
    // Record 27 §10 (older than fix 27: the field's saveTitle is main's):
    // Enter in an emptied Poster name field commits a blank name, while the
    // field's Save button is disabled for it and ⌘S there leaves it
    // (R2-A4); the write then stores the title block's words as the title.
    // Measured in jsdom when found; round 3 of the restarted review measured
    // it in Chromium (its own probe), folded in here.
    id: 'H8-enter-in-emptied-poster-name', info: true,
    how: 'Layout › Poster name: select all, Backspace (the field empty), Enter: the stored title before and after, the title writes sent, what the field and its button show',
    async run(h, s) {
      const { page, state, id } = s;
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.waitFor({ state: 'visible', timeout: 10000 });
      const titleBefore = rowOf(state, id)?.title ?? null;
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press('Backspace');
      const tKey = Date.now();
      await page.keyboard.press('Enter');
      await sleep(2500);
      const titleWrites = state.log.filter((x) => x.method === 'PATCH' && x.t >= tKey && (x.keys ?? []).includes('title'));
      const shown = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Poster name"]');
        const button = input?.parentElement?.querySelector('button');
        const required = [...document.querySelectorAll('div, p, span')].find((el) => /A poster name is required/.test(el.textContent ?? '') && el.children.length === 0);
        return { value: input?.value ?? null, button: button?.textContent?.trim() ?? null, disabled: button?.disabled ?? null, requiredNote: !!required };
      });
      return {
        numbers: {
          storedTitleBefore: JSON.stringify(titleBefore), storedTitle: JSON.stringify(rowOf(state, id)?.title ?? null),
          titleWrites: titleWrites.length, titleWritesOk: titleWrites.filter((x) => x.status === 200).length,
          fieldValue: JSON.stringify(shown.value), fieldButton: JSON.stringify(shown.button), buttonDisabled: shown.disabled, requiredNote: shown.requiredNote,
        },
      };
    },
  },
];
