#!/usr/bin/env node
/**
 * simplify-check.mjs — real-browser check of the minimal editor (record
 * docs/fixes/29-mvp-simplify.md; docs/launch/mvp-editor/bounded-designs.md
 * §5.2 items 1 and 4, §3.1, §3.12; owner decisions D3 and D4 of 2026-10-07).
 *
 * Every scenario enters where a user does: a fresh browser opens the editor
 * link /p/new as a signed-in term holder (the PowerPoint export is theirs),
 * clicks the sidebar's tabs, selects blocks on the canvas, types with the
 * real keyboard, opens Save PDF and Export › PowerPoint, the dashboard, the
 * profile page and the first-visit tour; an older poster is opened from a
 * stored row. The backend is faked at the network (lib/guestBackend.mjs);
 * nothing in the app is stubbed. Scenarios: lib/simplifyStart.mjs (starting
 * text) and lib/simplifyHidden.mjs (the hide switches); helpers
 * lib/simplifyKit.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   T1   a new poster's title holds text on screen ("Your Poster Title")
 *   T2   a new poster's text blocks store text (template guidance) the user
 *        must delete before typing (read from the row written after
 *        Insert › + Image, a change to no block read)
 *   T3   a new poster's sample table stores made-up numbers
 *   T5   the title or a text block emptied by hand ("ZQ" typed, ⌘A,
 *        Backspace; Chromium leaves a lone <br>) draws no
 *        prompt (the ::before the stylesheet draws, read from computed
 *        style); T5i the same read from paint: under 60 ink pixels in the
 *        block's box
 *   T5f  the emptied text block still draws its prompt while the caret is
 *        in it (the prompt goes while the block has focus, so it never
 *        sits beside the caret; a guard)
 *   T6   a block a new poster starts empty draws no prompt
 *   T4t  Insert › + Text stores text; T4h Insert › + Heading stores text;
 *        T5n either inserted block shows text, or shows no prompt
 *   T7a  Save PDF's print window holds template text (the old title, a
 *        guidance sentence or an Insert string); T7b it holds a prompt, as
 *        text or as a drawn ::before
 *   T8a  the PowerPoint file holds template text; T8b it holds a prompt
 *   T9   on a new poster, Issues lists fewer empty-or-template rows than
 *        there are text and heading blocks still empty or holding template
 *        text; T9s a table still holding the sample is not listed; T9o
 *        Issues lists blocks that overlap on that poster (a guard: a prompt
 *        longer than the text it replaces makes its block taller)
 *   T10  the same on an older poster (stored with the old starting text);
 *        T10s its sample table is not listed; T10t the default-title row is
 *        gone (a guard); T11 opening it changes its stored text (a guard:
 *        older posters keep their text)
 *   H1   a control a switch hides is shown (counted per place: layout,
 *        style, a text block and its format bar, an image, the Figure tab,
 *        a table and its canvas controls, references, export, dashboard)
 *   K1   a control that stays is missing (a guard)
 *   H2i  the tour mentions import or the .postr file; H2s Staples; H2g the
 *        guidelines panel; H2c the citation styles
 *   H3p  the profile page offers the style presets row; H3c the checklist
 *        templates row; K3 its tour row is missing (a guard)
 *   D1r D1c D1f D1w D1k D1h D1b D1p  a stored rotation, crop, stretch, body
 *        weight and line height, red word, boxed heading, All Lines borders
 *        or bottom caption is not drawn as stored (guards)
 *   V1   an image with no stored caption position does not draw it on top;
 *        V2 Insert › + Table does not store APA 3-line; V3 a typed
 *        reference is not drawn in APA 7, or is numbered (guards: the
 *        values the hidden controls stay at)
 *   T13  Export › Preview poster draws a prompt (§3.1 rule 6: the canvas
 *        only; computed ::before of every [data-placeholder] in the
 *        preview); T13i the same read from paint: 60 or more ink pixels in
 *        the preview's first empty text block; T13k after Back to Editor no
 *        canvas block is empty, or an empty one draws no prompt (a guard).
 *        Review round 1's probe G3 (R1-01), folded in
 *
 * INFORMATION (printed, not counted)
 *   T12  each of the 8 size presets with a fresh 3-Column Classic: the
 *        overlaps Issues lists (the table's prompt sits where "DV 1" did;
 *        a longer prompt made the table run into the heading below it at
 *        48 × 36 in, T9o, while building)
 *   T7 printEditorHints / pptEditorHints, T13 previewEditorHints  the
 *        editor's own hints in empty authors, image and references blocks
 *        ("Add authors in sidebar →", "+ Upload figure", "Add references in
 *        Refs tab →"; older than record 29) found in the print window's
 *        text, the PowerPoint file and the Preview (review round 1, R1-02:
 *        a sibling left open)
 *   T9 issuesTab, T13 issuesTabNewPoster  the number on the Issues tab,
 *        every severity, with one text block typed in and on a poster just
 *        made (R1-04)
 *
 * BLIND SPOTS
 *   - The backend is a fake (lib/guestBackend.mjs); the real one is not
 *     driven. The PDF is the print window's DOM, not a printed file; the
 *     PowerPoint file's slide XML is read, not opened in PowerPoint.
 *   - A control is counted when it has a box, is not inert, hidden or
 *     transparent; one painted under another is still counted. The
 *     guidelines panel counts when it or its toggle is in the page at all.
 *   - The browser's own right-click menu cannot be seen: the table menu
 *     counted is Postr's.
 *   - Prompts are read at rest with no block selected (T5f reads one block
 *     with the caret in it: computed style only). The caret's place is not
 *     measured.
 *   - The dashboard thumbnail (html-to-image) is not read.
 *   - Pages other than the editor, the dashboard and the profile, and the
 *     legal pages, are read by the copy inventory (vitest), not here.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/simplify-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5824),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *   (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed · 1 a claim observed · 2 a scenario errored or
 *      the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, startHarness } from './lib/editorHarness.mjs';
import { openSignedIn } from './lib/keepWorkKit.mjs';
import { START } from './lib/simplifyStart.mjs';
import { HIDDEN } from './lib/simplifyHidden.mjs';

const PORT = Number(process.env.PORT ?? 5824);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');
const SCENARIOS = [...START, ...HIDDEN];

let h;
try {
  h = await startHarness({ name: 'simplify', port: PORT });
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
      s = await openSignedIn(h, sc.session);
      const r = await sc.run(h, s);
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: s.state.errors, ...r, ...(sc.info ? { info: true } : {}) });
    } catch (e) {
      results.push({ id: sc.id, how: sc.how, error: String(e?.message ?? e).slice(0, 300) });
    } finally {
      await s?.context.close().catch(() => {});
    }
  }
} finally {
  await h.stop();
}

log(`\n== simplify-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · host ${process.platform}`);
let exit = 0;
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.info) { log(`[info]     ${r.id}: ${nums}`); continue; }
  const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
  const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
  if (obs.length && exit === 0) exit = 1;
  log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${nums}`);
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
