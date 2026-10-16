#!/usr/bin/env node
/**
 * canvas-paste-check.mjs — real-browser check of a paste on the canvas and
 * of a file dropped on it (record docs/fixes/34-paste-drop.md;
 * bounded-designs §3.3 table A row 3, table B orders 2 to 5, "Drop" and
 * "Image checks"). A sibling of table-paste-check.mjs on the same libs: that
 * one pastes into a focused cell or text; this one pastes with nothing in
 * edit mode, pastes images, drops files, and reads uploads, so its readings
 * (blocks made, placed, stored, drawn) and its clipboard (image files) are
 * its own.
 *
 * The rule table under test (record section 7):
 *   A3  the caret in a text (a text block, a heading, the title), an image
 *       file and no text on the clipboard: a new image block next to it (to
 *       its right if it fits on the sheet, else below it as drawn); the text
 *       unchanged
 *   B   nothing in edit mode (a block may be selected), ⌘V, the first match:
 *       B2 HTML with a <table>: a new table block filled by record 32's grid
 *          reader
 *       B3 an image file and no text: a new image block; an EMPTY selected
 *          image block is filled instead
 *       B4 any other text (tabs included): a new text block holding record
 *          32's cleaned paste
 *       B5 anything else: nothing
 *   Drop an image on the canvas: an image block centred on the drop point;
 *       on an image block: its image replaced; several: one block each, each
 *       1 in down and right of the last; a file that is not an image:
 *       skipped with today's message
 *   Images: an image type under 10 MB (today's messages), Insert › Image's
 *       15.5 × 14 in box with the image's shape, uploaded through the image
 *       block's own path ({user}/{poster}/{block}.{ext}, storage://)
 *   Every paste or drop that makes or changes blocks: one undo step.
 *
 * Every scenario enters where a user does: a fresh browser at /p/new as a
 * signed-in term holder (lib/keepWorkKit.mjs openSignedIn) or a guest
 * (G-…), the backend and storage faked at the network
 * (lib/guestBackend.mjs), the title typed into first (the poster is stored
 * from its first edit), the mouse and the keys after. Scenarios:
 * lib/canvasPasteScenarios.mjs (paste), lib/canvasDropScenarios.mjs (drop);
 * helpers lib/canvasPasteKit.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   B2   not exactly one new table block holding the reader's grid (its
 *        cells as record 32's table-paste-check stores them), Insert's
 *        width, on the sheet, wholly in the view
 *   B3   not exactly one new image block with the image's shape in
 *        Insert › Image's box, imageSrc storage://{user}/{poster}/{block}.png,
 *        one upload keyed by it under the user's folder, drawn (its colour
 *        on at least half its box), on the sheet, wholly in the view (at
 *        FIT, 100 % and 300 % scrolled to a corner and to the middle:
 *        B3-image, L-100, L-zoomed, L-zoomed-mid)
 *   B3F  the empty selected image block not filled as the rule says (a new
 *        block made, its width changed, its height not the image's shape,
 *        not one upload keyed by it, not drawn)
 *   B4   not exactly one new text block (not a table) holding what record
 *        32's paste into an empty text block stores
 *   B5   a paste B5 names made a block, an upload or a change
 *   A3   not one new image block placed as A3 says (right: within 1 in of
 *        the text block's right edge, top aligned with it; below: within
 *        1 in under its drawn bottom, over its columns), or the text changed
 *   DR   a drop on the sheet not one image block centred on the drop point
 *        (within 0.3 in), shaped, uploaded and drawn as B3
 *   DM   several images not one block each, each 1 in down and right of
 *        the last
 *   DI   a drop on an image block did not replace its image (a block made,
 *        its width changed, its height not the new shape, not one upload to
 *        its own path, the new image not drawn)
 *   DX   a file that is not an image made a block or an upload
 *   TEN  an image over 10 MB made a block or an upload
 *   MSG  today's message not shown (DX: "…doesn't look like an image…";
 *        TEN: "…too large… under 10 MB")
 *   F    a paste into a sidebar field (the Poster name, the width field,
 *        the Figure tab's code box, the Authors and References paste boxes)
 *        or with the size dialog open made a block or an upload; FIELD the
 *        field did not take the text (a guard)
 *   G    a guest's paste or drop not as B3 / DR (uploads under the guest's
 *        own folder)
 *   N    another block of the poster changed
 *   U    one ⌘Z did not bring back the poster as stored before, or the new
 *        block is still drawn (counted only when the paste or drop made or
 *        changed a block: with nothing made, a ⌘Z undoes the user's last edit)
 *   UP   the image block's own "+ Upload figure" (the path a fill and a drop
 *        on an image block share): not one upload keyed by it, its height
 *        not the image's shape, not drawn, or one ⌘Z does not empty it
 *   UPB  (the upload held 2.5 s) a blob: address stored in the poster while
 *        the upload was out
 *   UPX  (a file over 10 MB through the chooser) the message not shown, or
 *        anything stored or uploaded
 *   DQ   (review R34-1) two files dropped on one image block, the second
 *        while the first uploads: the block does not draw the second (not
 *        loaded, its colour under half its box, or a blob: address the page
 *        revoked), the file at its stored path is not the second's, or one
 *        ⌘Z does not bring back the poster as before both (counted for two
 *        files of one extension; with another, the first file's upload
 *        overwrote the old path, §3.3 D, and the presses are information)
 *   RNG  (review R34-3) a table's cells selected by dragging, then ⌘V: a
 *        block made (the table's own cell paste, record 32's, aside)
 *
 * Since the review round (record section 9; lib/canvasPasteReviewScenarios.mjs):
 * B3-img-address and A3-img-address (a "Copy image" carrying an <img>
 * fragment and the address as text: the image, R34-2), B4-address (an
 * address alone: a text block, R34-5), F-feedback-text (the feedback
 * dialog, R34-7), and three INFORMATION scenarios (R34-4, R34-6).
 *
 * INFORMATION (printed, not counted)
 *   D-on-image… after the replace, one ⌘Z: what is stored and drawn (the
 *        files are stored per block id and an upload overwrites:
 *        bounded-designs §3.3 D, the next fix's)
 *   I-replace-button  today's Replace button with a file of the same
 *        extension: what is drawn after, and the ⌘Z presses back
 *   each B block's centre against the centre of the sheet's visible part
 *        (`seen`, in inches)
 *   msToBlock  the time from ⌘V to the first new block drawn (an image block
 *        is made once its file is stored; B3-slow holds the upload 2.5 s)
 *   I-engine-image-paste  what the engine's own paste of an image written
 *        to its clipboard carries (Firefox's: a file item with no file)
 *
 * CONTROLS (exit 2 if one fails)
 *   K1   the paste that reached the page carried the shape: a trusted
 *        paste with the file or the text from the real clipboard, or the
 *        page-made paste of the event mode (Firefox's images; a PDF; the
 *        10 MB image) carrying its file
 *   K2   the drop reached the page: a dragover carrying Files (trusted in
 *        Chromium)
 *
 * BLIND SPOTS
 *   - Playwright's Firefox delivers a trusted paste of a clipboard image
 *     with no file in it (getAsFile() null, a probe, record section 3), so
 *     Firefox's image pastes are page-made events carrying a real File; a
 *     real Firefox's own image paste is not driven (UNVERIFIED).
 *   - Firefox and WebKit drops are page-made drag events (a real file
 *     drag from the desktop cannot be driven there); the default action of
 *     a drop the page does not take (the browser opens the file in the tab)
 *     is not exercised in any engine: `dragoverCancelled` reads whether the
 *     page takes it. Chromium's drops are trusted (DevTools protocol).
 *   - Clipboard images are PNGs written by the page (WebKit re-encodes
 *     them); an application's own copy of a picture (a screenshot, Word's
 *     copy of a figure with its text) is not driven: a clipboard with an
 *     image AND text is B4's, by the rule.
 *   - The fake storage has no CDN: a cached old copy of an overwritten file
 *     (§3.3 D) is not modelled; the browser's own image cache is.
 *   - The browser's DevTools leaves some upload bodies out of the request
 *     it hands the harness (Chromium: a file dropped from disk; WebKit: every
 *     multipart upload): the fake storage then keeps the harness's own copy
 *     of the file it handed the page (`bytesFromHarness` in the numbers): by
 *     its name, or the file handed last when the page names it otherwise
 *     (an engine's clipboard file is "image.png"; a scenario hands its
 *     pasted file again just before ⌘V). There the bytes stored are not
 *     read from the request; the upload's path, count and owner are.
 *   - Paint is judged by colour share in the block's box, at 40 per
 *     channel; the selection chrome covers part of it.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/canvas-paste-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5822),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *   (lib/editorHarness.mjs); IMG_PASTE=event (images by page-made paste in
 *   every engine), DROP_MODE=event (Chromium's drops page-made too)
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
import { PASTE_SCENARIOS, runPasteScenario } from './lib/canvasPasteScenarios.mjs';
import { DROP_SCENARIOS, runDropScenario } from './lib/canvasDropScenarios.mjs';
import { REVIEW_SCENARIOS, runReviewScenario } from './lib/canvasPasteReviewScenarios.mjs';
import { imageMode } from './lib/canvasPasteKit.mjs';

const PORT = Number(process.env.PORT ?? 5822);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');

const SCENARIOS = [
  ...PASTE_SCENARIOS.map((sc) => ({ ...sc, run: (h) => runPasteScenario(h, openSignedIn, sc) })),
  ...DROP_SCENARIOS.map((sc) => ({ ...sc, run: (h) => runDropScenario(h, openSignedIn, sc) })),
  ...REVIEW_SCENARIOS.map((sc) => ({ ...sc, run: (h) => (sc.custom ? runReviewScenario(h, openSignedIn, sc) : runPasteScenario(h, openSignedIn, sc)) })),
];

let h;
try {
  h = await startHarness({ name: 'canvas-paste', port: PORT });
} catch (e) {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(2);
}
const results = [];
try {
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(o))) continue;
    const t0 = Date.now();
    try {
      const r = await sc.run(h);
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, ...r, ...(sc.info ? { info: true } : {}) });
    } catch (e) {
      results.push({ id: sc.id, how: sc.how, error: String(e?.message ?? e).slice(0, 400) });
    }
  }
} finally {
  await h.stop();
}

log(`\n== canvas-paste-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · images by ${imageMode(h)} · host ${process.platform}`);
let exit = 0;
const tally = {};
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (!r.carried?.ok) { exit = 2; log(`[CONTROL FAILED] ${r.id}: the paste or drop did not reach the page as the shape (${r.carried?.why})`); }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.info) { log(`[info]     ${r.id}: ${nums}`); continue; }
  // A claim read as null says nothing in this scenario (U when nothing was made): not counted.
  const counted = Object.entries(r.claims).filter(([, v]) => v !== null && v !== undefined);
  const obs = counted.filter(([, v]) => v).map(([k]) => k);
  const clean = counted.filter(([, v]) => !v).map(([k]) => k);
  for (const [k, v] of counted) tally[k] = { observed: (tally[k]?.observed ?? 0) + (v ? 1 : 0), of: (tally[k]?.of ?? 0) + 1 };
  if (obs.length && exit === 0) exit = 1;
  log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${r.carried?.why ?? ''}\n           ${nums}`);
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
log(`claims observed: ${Object.entries(tally).map(([k, v]) => `${k} ${v.observed}/${v.of}`).join(' · ')}`);
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, images: imageMode(h), host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
