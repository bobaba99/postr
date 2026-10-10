#!/usr/bin/env node
/**
 * table-paste-check.mjs — real-browser check of what a paste does to a
 * table and to text (record docs/fixes/32-table-paste.md; bounded-designs
 * §3.3 A; keep-work-check H5 is the first measurement of the table half).
 *
 * The rule table under test (record section 7):
 *   1  the caret in a table cell, plain text with no tab and no line break
 *      (one final line break aside): into that cell at the caret, cleaned
 *      as text is; nothing else changes
 *   2  the caret in a table cell, a grid (HTML with a <table>, or plain text
 *      with tabs or line breaks): fills the table from that cell, across and
 *      down; the table grows to hold it; no cell outside the pasted area
 *      changes; nothing is dropped; one ⌘Z undoes it
 *   3  the caret in a text block or the title: the poster's style wins: bold,
 *      italic, underline, sub, sup, lists and line breaks kept; colour,
 *      highlight, font and size dropped
 *
 * Every scenario enters where a user does: a fresh browser opens /p/new as
 * a signed-in term holder (lib/keepWorkKit.mjs openSignedIn, the backend
 * faked at the network by lib/guestBackend.mjs), marks every cell of the
 * starting 4 × 3 table by typing, puts a shape on the clipboard with a real
 * ⌘C, clicks into the target, presses ⌘V, reads what was stored and drawn,
 * presses ⌘Z and reads again. Scenarios and readings:
 * lib/tablePasteScenarios.mjs; the clipboard shapes (plain text, TSV,
 * Excel, Word, Google Sheets and Google Docs HTML): lib/tablePasteShapes.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   T1   rule 1: after the paste the table is not 4 × 3, a cell other than
 *        the target changed, or the target is not its text before followed
 *        by the paste (cleaned: "<b>ZQBW</b>" from a bold red Georgia word)
 *   G1   rule 2: a pasted cell is not stored where the rule puts it, as the
 *        rule keeps it (merged cells, line breaks, "<" as "&lt;", colour
 *        dropped), or a marker of the paste is missing from the table
 *   G2   rule 2: a cell outside the pasted area changed
 *   G3   rule 2: the table is not max(rows, row + pasted rows) by
 *        max(columns, column + pasted columns)
 *   GD   the canvas draws a different grid, or a cell's text differs from
 *        what was stored
 *   G4   one ⌘Z does not bring back the table exactly as stored before the
 *        paste, and as drawn (rule 1 and rule 2 scenarios)
 *   X    markup pasted as text becomes markup: a script ran (window.__zqPwn
 *        set), an <img> drawn in the table, or "<img" stored unescaped
 *   C1   rule 3: the stored text holds a colour, a highlight, a font, a size
 *        or a style sheet's text from the source
 *   C2   rule 3: bold, italic, underline, sub, sup, a list or a line break
 *        of the source is not stored (a guard); in F-text-inner-copy, the
 *        line break or the double space of text copied from one text block
 *        to another (record 32 section 9, the corrector's audit)
 *   C3   rule 3: the pasted text is drawn in another colour, on a
 *        background, in another font or size than the block's own (and,
 *        for the Google Docs shape, another weight)
 *   C4   rule 3: one ⌘Z does not bring back the block's stored text (a
 *        guard)
 *   C5   rules 1 and 3: a line break the source does not show is stored
 *        between two words it shows on one line (a line wrapped in the
 *        clipboard's HTML source: Word's, or Firefox's copy of a page;
 *        record 32 section 9, R1-F3). In a cell, T1 reads the same
 *
 * The review round's defects (record 32 section 9), folded in as scenarios:
 * Word's own bold (`<b style='mso-bidi-font-weight:normal'>`, the Word
 * shapes; R1-F1), a paragraph copied by the engine after a triple-click and
 * lines ending in a blank line (R1-F2), a line wrapped in the HTML source
 * (R1-F3). The engine copies (`copy: 'triple' | 'select'` in the shapes) let
 * the engine serialise a selection itself, as a copy from a web page does.
 *
 * INFORMATION (printed, not counted)
 *   I-drag-range  cells selected by dragging (no cell keeps the caret), then
 *        ⌘V of a grid: the focus after the drag, whether a paste event
 *        reached the page, the table before and after (out of the fix's
 *        scope, record section 10)
 *
 * CONTROLS (exit 2 if one fails)
 *   K1   the paste that reached the target carried the shape (its marker
 *        in text/html and text/plain), as a trusted event when the real
 *        clipboard is used
 *
 * BLIND SPOTS
 *   - The HTML shapes are written from what Excel, Word, Google Sheets and
 *     Google Docs are known to put on the clipboard, not copied from them
 *     (UNVERIFIED for each application, record section 3); a real copy may
 *     differ (Excel on macOS, an older Word, a Sheets range with images).
 *   - The clipboard is the engine's: the copy event of a source the harness
 *     adds writes the shape, then ⌘V reads it back as the engine's own
 *     trusted paste. Another application's copy is not driven. On macOS an
 *     engine may use the system clipboard, so a run can replace what the
 *     machine's clipboard held (UNVERIFIED per engine).
 *   - The caret is always at the end of the target (a click at its right
 *     edge, checked); a paste over a selection is not driven (the review's
 *     probe drove the caret mid-cell and over a selection: record 32
 *     section 9).
 *   - The engine copies draw a short source in the page; a real page's
 *     context (its styles, a selection across elements) may serialise
 *     differently.
 *   - A paste with nothing in edit focus and an image paste are out of the
 *     fix's scope (record section 10) and not driven; a cell range selected
 *     by dragging is information only (I-drag-range).
 *   - Firefox and WebKit run the same scenarios; an engine's own paste of
 *     a real application's clipboard (Safari's, Firefox's) is not driven.
 *   - Paint is not read: style is the computed style of the text's element.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/table-paste-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5820),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *   (lib/editorHarness.mjs); TP_PASTE=event for a page-made paste event in
 *   place of the clipboard
 *
 * EXIT 0 no claim observed and every control passed · 1 a claim observed ·
 *      2 a control failed, a scenario errored, or the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, startHarness } from './lib/editorHarness.mjs';
import { openSignedIn } from './lib/keepWorkKit.mjs';
import { PASTE_MODE, SCENARIOS } from './lib/tablePasteScenarios.mjs';

const PORT = Number(process.env.PORT ?? 5820);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');

let h;
try {
  h = await startHarness({ name: 'table-paste', port: PORT });
} catch (e) {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(2);
}
const results = [];
try {
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(o))) continue;
    const t0 = Date.now();
    let s;
    try {
      s = await openSignedIn(h);
      const r = await sc.run(h, s);
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: s.state.errors, ...r, ...(sc.info ? { info: true } : {}) });
    } catch (e) {
      // What the page showed when the scenario failed, for the reader of the error.
      const shot = path.join(h.out, `${sc.id}-${h.engine}-error.png`);
      await s?.page.screenshot({ path: shot }).catch(() => {});
      results.push({ id: sc.id, how: sc.how, error: `${String(e?.message ?? e).slice(0, 300)} (screenshot ${shot})` });
    } finally {
      await s?.context.close().catch(() => {});
    }
  }
} finally {
  await h.stop();
}

log(`\n== table-paste-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · paste ${PASTE_MODE} · host ${process.platform}`);
let exit = 0;
const tally = {};
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (!r.carried?.ok) { exit = 2; log(`[CONTROL FAILED] ${r.id}: K1 the paste did not carry the shape (${r.carried?.why})`); }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.info) { log(`[info]     ${r.id}: ${nums}`); continue; }
  const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
  const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
  for (const [k, v] of Object.entries(r.claims)) tally[k] = { observed: (tally[k]?.observed ?? 0) + (v ? 1 : 0), of: (tally[k]?.of ?? 0) + 1 };
  if (obs.length && exit === 0) exit = 1;
  log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${nums}`);
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
log(`claims observed: ${Object.entries(tally).map(([k, v]) => `${k} ${v.observed}/${v.of}`).join(' · ')}`);
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, paste: PASTE_MODE, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
