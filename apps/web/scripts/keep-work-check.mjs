#!/usr/bin/env node
/**
 * keep-work-check.mjs — real-browser check that the user's work is kept
 * (record docs/fixes/27-keep-work-safe.md; docs/launch/mvp-editor/
 * bounded-designs.md §3.9 and §5.1 blockers 1, 2 and 11; open-findings
 * OF-01 and OF-05; plan item 8).
 *
 * Every scenario enters where a user does: a fresh browser opens the editor
 * link /p/new (a signed-in term holder: not a guest, whose own leave prompt
 * arms on every edit, and allowed the PowerPoint export), types with the
 * real keyboard, presses ⌘S / Ctrl+S, reloads, opens the dashboard, Save
 * PDF and Export. The backend is faked at the network
 * (lib/guestBackend.mjs: the posters table with its row-level security, the
 * poster_versions table with its 30-version cap, and its fault injection);
 * nothing in the app is stubbed. Scenarios: lib/keepWorkEnter.mjs (Enter),
 * lib/keepWorkSave.mjs (saving and ⌘S), lib/keepWorkElsewhere.mjs (the
 * poster saved elsewhere meanwhile, the session ended),
 * lib/keepWorkLimits.mjs (limits the fix leaves: a paste into a table
 * cell, an outage during a token refresh, a size field's draft, Enter in an
 * emptied Poster name field); helpers lib/keepWorkKit.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   E1   " ZQA", Enter, "ZQB" in a text block: the stored text has no line
 *        break between the words
 *   E1r  after a reload the canvas draws ZQB on ZQA's line
 *   E2   the dashboard's Duplicate: the copy's stored text has no break, or
 *        the copy opened in the editor draws the words on one line
 *   E3   Save PDF after the reload: the print window draws them on one line
 *   E4   Export › PowerPoint after the reload: the words share a paragraph
 *        with no line break between them
 *   E5   the same typed in Edit block › Content box: no break stored
 *   E5r  after a reload, on one line on the canvas
 *   E6   " ZQG", Enter, "ZQH", Enter, Enter, "ZQK": after a reload the gap
 *        ZQH→ZQK is under 1.5 times the gap ZQG→ZQH (the blank line lost)
 *   E7   Enter in the title or a heading (one line by design) puts a line
 *        break into it (a guard: clean before and after)
 *   E8   " ZQE", Enter, "ZQF" in a table cell: no line break stored (the
 *        cell keeps its HTML as typed, so a <div> counts as no break)
 *   E8r  after a reload the cell draws them on one line
 *   E8p  Save PDF after the reload: the print window draws them on one line
 *   E8x  the PowerPoint file joins them or writes the markup out as text
 *   S1   the backend refuses every save for 9 s (network failure) while
 *        " ZQNET" waits, then accepts again: the word is not stored within
 *        35 s with nothing more typed (no retry)
 *   S2   2 s into the failure the pill does not read "Not saved — retrying…"
 *   S3   after recovery the word is not stored or the pill does not read
 *        "Saved…"
 *   S6 S6p S6a  the same three for a refused save (403 permission denied),
 *        recovery after 4 s
 *   S4   with a save failed and nothing more typed, closing the tab shows no
 *        leave warning
 *   S4c  with everything stored, closing the tab shows a leave warning (a
 *        false alarm; a guard)
 *   S5   offline (the browser's own switch) while " ZQOFF" waits, back
 *        online after 3.4 s: the word is not stored within 1.5 s of coming
 *        back
 *   S7   " ZQX1" and " ZQX2" typed while every save fails, then the backend
 *        accepts: both words are not stored within 20 s
 *   S8   the first save takes 2.5 s; " ZQR1", 1.2 s, " ZQR2": the stored
 *        poster ends without ZQR2 (the slow first save landed last)
 *   D1   a save failed, then the sidebar's Duplicate: a copy is made that
 *        lacks the unsaved word
 *   K1   ⌘S makes a version
 *   K2   ⌘S pressed right after typing: the word is written more than
 *        400 ms after the key (the key did not save now)
 *   K3   ⌘S does not show "Saved"
 *   K5   the ⌘S keydown is not cancelled (the browser's save dialog would
 *        open; a guard)
 *   K4   one version saved from the Versions tab, then ⌘S 31 times: 30
 *        versions or more are stored, or Restore of that version fails
 *   K6   ⌘S while saves fail: the page says "Saved" while the word is not
 *        stored (a guard)
 *   K7   (over the run) a version is made in a scenario that never pressed
 *        ⌘S, Save version or Restore (a version made silently; a guard)
 *   E9   " ZQI", Enter, two spaces, "ZQJ": the two spaces are not stored
 *        before ZQJ (a new line's leading spaces lost; a guard)
 *   E10  " ZQL1" made a list with the selection toolbar's "•", Enter, "ZQL2",
 *        Enter twice (out of the list), "ZQL3": after a reload the gap from
 *        ZQL2 to ZQL3 differs by more than 0.3 glyph heights from the gap
 *        while typing (a blank line added or lost), or the list is not
 *        stored (added after the fix's first version gained a blank line
 *        here)
 *   E11  the first table selected, Edit block › Table Note: "ZQN1", Enter,
 *        "ZQN2": no line break stored (E11), or the canvas draws them on one
 *        line while typing (E11t) or after a reload (E11r), or the print
 *        window does (E11p), or PowerPoint joins them (E11x) (review round 1,
 *        R1-A1)
 *   S9   the editor opened, a sidebar tab clicked (a user gesture that edits
 *        nothing: a browser warns only a page the user has touched), the tab
 *        closed 3 s later: a leave warning shown, or a save sent with nothing
 *        changed (review round 1, R1-A7: React's StrictMode remount on this
 *        dev server)
 *   E12  Shift+Enter beside Enter: in the first text block " ZQSA",
 *        Shift+Enter, Enter, "ZQSB"; after a reload the gap between them
 *        differs by more than 0.3 glyph heights from the gap while typing (a
 *        blank line added or lost); E12p the same in the print window (and
 *        the second block's gaps); E12b in the second text block " ZQSC",
 *        Shift+Enter, "ZQSD", Enter, "ZQSE": a gap differs after a reload;
 *        E12c the same in the first table cell (" ZQSF" … "ZQSH"); E12x the
 *        PowerPoint file holds a different number of blank lines between two
 *        of these words than were drawn while typing (review round 2, R2-A1)
 *   K8   Layout › Poster name: select all, "ZQK8 name", ⌘S: the name is not
 *        stored 1.5 s later, or the page does not say "Saved" (review round
 *        2, R2-A4: the name is a draft until Enter or its Save button)
 *   K9   every save fails (network); Layout › Poster name: "ZQK9 name",
 *        Enter: 1.5 s later the field's button says "✓ Saved" while the name
 *        is not stored; K9r the backend accepts again, its next write held
 *        3 s: the button says "✓ Saved" (read every 100 ms) before the name
 *        is stored; K9a the name not stored within 15 s, or then the button
 *        does not say "✓ Saved" or the pill "Saved…" (a guard). From the
 *        runs of the first review round 3 (fix 27, section 9)
 *   K10  Layout › Poster name: "ZQK10 name", Enter, while the server holds
 *        the name's first write 4 s and then fails it (network): the button
 *        says "✓ Saved" (read every 100 ms) while that write is out; K10a
 *        the backend accepts again 1 s after the failure: the name not
 *        stored within 20 s, or then the button does not say "✓ Saved" or
 *        the pill "Saved…" (a guard). Round 1 of the restarted review,
 *        N1-F1 (fix 27, section 9)
 *   K11  " ZQK11" typed and stored, then every save fails (network), then
 *        the sidebar's Duplicate: with nothing unsaved, the page says "not
 *        saved" (its message or the pill) or warns before leaving; K11n the
 *        same with Enter in Layout › Poster name, the name unchanged (the
 *        field's button counts: "Save" there says the name is not stored).
 *        Round 2 of the restarted review, N2-F3 (fix 27, section 9)
 *
 * INFORMATION (printed, not counted)
 *   H1   the first save held 12 s, " ZQH1", " ZQH2", ⌘S: when ZQH2 is sent,
 *        what the pill and ⌘S say meanwhile, whether ZQH2 is kept (review
 *        round 1, R1-A2: one write at a time has no time limit)
 *   H2   device A's saves fail while " ZQTA" waits; device B (another
 *        browser, the same account) opens the poster and saves " ZQTB"; A's
 *        network comes back, A types nothing: which word is stored 35 s later
 *        (review round 2, R2-A2: every write is unconditional, so A's retry
 *        replaces B's work; on main A's word was lost instead)
 *   H3   the session ends (token expired, refresh refused) while a save is
 *        failing: is the word stored, is it in the closed page's "Download a
 *        copy", is leaving warned (review round 2, R2-A3; the same on main)
 *   H4   Layout › Poster name: "ZQH4 name" typed, then a click into a text
 *        block, ⌘S: what is said and stored, what the field shows, whether
 *        closing the tab warns (the first review round 3's probe N1: the
 *        name stays a draft outside its field)
 *   H5   a change stored; one line, "ZQW 12.4", pasted into the starting
 *        table's fifth cell; then ⌘Z: the table drawn and stored before,
 *        after and after ⌘Z (round 2 of the restarted review, N2-F1: the
 *        table's paste handler replaces the table; older than fix 27)
 *   H6   a 30 s session token; offline while " ZQTOK" waits; the pill every
 *        second for 45 s, ⌘S at 11 s; back online: when the word is stored
 *        (N2-F2: the write waits inside the client's token refresh, so the
 *        hook sees no failure; S5, a fresh token, is the contrast)
 *   H7   Layout › the poster's width typed, ⌘S: what is said and stored
 *        (N2-F4: a field that keeps a draft)
 *   H8   Layout › Poster name emptied, Enter: the stored title before and
 *        after, what the field and its button show (older than fix 27; round
 *        3 of the restarted review measured it in Chromium)
 *
 * CONTROLS (exit 2 if one fails)
 *   C1   the backend works: " ZQOK" is stored within 3 s and the pill says
 *        "Saved…"
 *
 * BLIND SPOTS
 *   - The backend is a fake (lib/guestBackend.mjs); the real PostgREST and
 *     the real network are not driven. "network" aborts the request
 *     (Playwright's `internetdisconnected`); "refused" answers 403.
 *   - The PDF is read as the print window's DOM, not a printed file; the
 *     PowerPoint file's slide XML is read, not opened in PowerPoint.
 *   - Line geometry is read from layout (Range rectangles); paint is not.
 *   - A leave warning is the browser's beforeunload dialog under
 *     Playwright; whether a real browser shows it after the page has had a
 *     user gesture is the browser's rule (each scenario types first).
 *   - A guest's own leave prompt (useLeaveGuard) is not exercised: these
 *     users are signed in.
 *   - In-app navigation that does not unload the page is not driven.
 *   - By default the app runs on Vite's dev server, under React's
 *     StrictMode, which runs each effect twice at mount (S9 is that server's
 *     case); POSTR_SERVE=preview runs every scenario on the production build
 *     (lib/editorHarness.mjs; `npm run build` first; no POSTR_MUTANT then).
 *   - A scenario that needs a control a feature switch hides is skipped
 *     while the tree has that switch off (record 29: E5 the Content box,
 *     ADJUSTMENTS_ENABLED; D1 and K11 the sidebar's Duplicate,
 *     EDITOR_EXTRAS_ENABLED); `sourceFlag` reads the file on disk. Printed
 *     as "skipped (switch off)" and counted on the summary line of that
 *     name (lib/editorHarness.mjs switchesOff, since the merge with record
 *     30).
 *   - Shift+Enter is pressed at a line's end only, and an input method's
 *     Enter is not driven (fix 12's undo-history-check drives composition).
 *   - H5's paste is a paste event carrying plain text (the system clipboard
 *     is not touched); the browser's own ⌘V is not driven.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/keep-work-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5820),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *   (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed and the control passed · 1 a claim observed ·
 *      2 the control failed, a scenario errored, or the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SWITCH_OFF, log, startHarness, switchOffReason, switchesOff } from './lib/editorHarness.mjs';
import { openSignedIn, versionPosts } from './lib/keepWorkKit.mjs';
import { ENTER } from './lib/keepWorkEnter.mjs';
import { SAVE } from './lib/keepWorkSave.mjs';
import { ELSEWHERE } from './lib/keepWorkElsewhere.mjs';
import { LIMITS } from './lib/keepWorkLimits.mjs';

const PORT = Number(process.env.PORT ?? 5820);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');
const SCENARIOS = [...SAVE.filter((s) => s.control), ...ENTER, ...SAVE.filter((s) => !s.control), ...ELSEWHERE, ...LIMITS];
/** Scenarios allowed to make a version (K7): they press ⌘S, Save version or Restore (K9, K10 and K11 press none). */
const MAKES_VERSIONS = /^(K[1-8]-|H1-|H4-|H6-|H7-)/;

let h;
try {
  h = await startHarness({ name: 'keep-work', port: PORT });
} catch (e) {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(2);
}
const results = [];
let silentVersions = 0;
try {
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(o))) continue;
    // A scenario that drives a control a feature switch hides (`needs`,
    // record 29) is skipped while the tree under test has the switch off.
    const off = switchesOff(sc.needs);
    if (off.length) {
      results.push({ id: sc.id, how: sc.how, skipped: switchOffReason(off), switchOff: true });
      continue;
    }
    const t0 = Date.now();
    let s;
    try {
      s = await openSignedIn(h, sc.session);
      const r = await sc.run(h, s);
      if (!MAKES_VERSIONS.test(sc.id)) silentVersions += versionPosts(s.state).length;
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: s.state.errors, ...r, ...(sc.info ? { info: true } : {}), ...(sc.control ? { control: true } : {}) });
    } catch (e) {
      results.push({ id: sc.id, how: sc.how, error: String(e?.message ?? e).slice(0, 300) });
    } finally {
      await s?.context.close().catch(() => {});
    }
  }
} finally {
  await h.stop();
}
results.push({ id: 'K7-no-silent-versions', how: 'versions made by scenarios that never pressed ⌘S, Save version or Restore', claims: { K7: silentVersions > 0 }, numbers: { silentVersions } });

log(`\n== keep-work-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · host ${process.platform}`);
let exit = 0;
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (r.skipped) { log(`[skipped]  ${r.id}: ${r.skipped}`); continue; }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.control) {
    if (!r.ok) exit = 2;
    log(`[${r.ok ? 'control ok' : 'CONTROL FAILED'}] ${r.id}: ${nums}`);
  } else if (r.info) {
    log(`[info]     ${r.id}: ${nums}`);
  } else {
    const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
    const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
    if (obs.length && exit === 0) exit = 1;
    log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${nums}`);
  }
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
const switchSkips = results.filter((r) => r.switchOff).map((r) => r.id);
log(`${SWITCH_OFF}: ${switchSkips.length}${switchSkips.length ? ` (${switchSkips.join(', ')})` : ''}`);
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
