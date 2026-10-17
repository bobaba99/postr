#!/usr/bin/env node
/**
 * text-size-check.mjs — the poster's text size, one control for the whole
 * poster, in a real browser (record docs/fixes/33-text-size.md; the MVP
 * design doc docs/launch/mvp-editor/bounded-designs.md §3.7).
 *
 * Every scenario enters where a user does: the editor opened on a stored
 * poster (lib/editorHarness.mjs, the backend faked at the network, a term
 * holder; the new-row scenarios at /p/new as a guest, lib/guestBackend.mjs),
 * the top bar's "Decrease text size" / "Increase text size"
 * pressed with the mouse (Playwright's pointer) or reached with Tab and
 * pressed with Enter and Space, the top bar's Undo and Redo, the sidebar's
 * tabs and the Style tab's size fields typed into, the top bar's Save PDF,
 * Export › PowerPoint. The expected sizes come from the rule table, applied
 * to the sizes the poster is drawn at before the first press (read from the
 * sheet), not from the app's code. Posters: lib/textSizePosters.mjs (the
 * five templates and the welcome poster from lib/printPathPosters.mjs, and
 * bodies set by hand at 34, 30, 24 and 52 pt and ratios set level by
 * level).
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   TB   the top bar shows no [A−] Body N pt [A+] (buttons named "Decrease
 *        text size" and "Increase text size", the body's size in whole pt
 *        between them): the claim of the reproduction
 *   Per poster, the ladder (lib/textSizeLadder.mjs): A+ to the top, A− to
 *   the bottom, A+ back to the first size reached:
 *   S    a level is drawn more than 0.01 pt from the rule at some size (the
 *        body at the next of 28 · 32 · 36 · 40 · 44 · 48 pt, every other
 *        level its start × the body's ratio to its start), or one level's
 *        blocks are drawn at two sizes
 *   L    the label is not "Body N pt", a button is enabled past a bound or
 *        disabled inside them, a disabled button's title does not name its
 *        bound (48 pt, 28 pt), or a button has no title
 *   RT   a size reached a second time holds other sizes in the store than
 *        the first time (=== on each level: the exact round trip)
 *   U    one Undo after a press does not put all four levels back exactly
 *        (store), or the sheet does not draw them back; R  Redo does not
 *        re-apply the press exactly
 *   DX   a disabled button, pressed, changes a size
 *   KEY  A+ reached with Tab and pressed with Enter, then Space, does not
 *        step twice; KEYFOCUS the focus leaves the button; KEYPASS
 *        ArrowDown, Backspace or Delete pressed there moves or deletes the
 *        selected block or edits its text
 *   CARET  with the caret in a text block, A+ pressed with the mouse moves
 *        the caret out of the block, or the letters typed after it do not
 *        join those typed before; STEPS Undo, Undo, Undo do not take back
 *        "cd", the size, "ZQab", one each (the typing step lost or split);
 *        PRESSED the press changed nothing
 *   STYLE1  the Style tab's title field changes another level; STYLEKEEP
 *        A+ after it does not keep the new title's ratio
 *   NOTE a text block's Edit tab does not name A− / A+ in the top bar
 *   PRINT  after A+, the top bar's Save PDF document draws a level at
 *        another size than the editor, or off the rule
 *   PPTX after A+, the PowerPoint file writes a level's text at another size
 *        than the editor draws it (within 0.006 pt: the writer rounds to
 *        0.01 pt)
 *   FIT… at 1024 × 768 and 1280 × 800, the sidebar shown and hidden: two of
 *        the top bar's controls overlap (FITOVER), one is outside the bar or
 *        the window or the bar scrolls (FITOUT), the label wraps (FITWRAP),
 *        a button is not the top element at its centre (FITHIT), the order
 *        is not History, text size, Save PDF (FITORDER)
 *   UNBOUND  ⌘⇧> or ⌘⇧< (Ctrl off a Mac) changes a size (out of scope:
 *        left unbound, as the design says)
 *   ARRANGE  Auto-Arrange after A+ to 48 pt changes a size (record 28)
 *   A body that is not a size (review round 1, R1-F1; lib/textSizeEdgeScenarios.mjs):
 *   NOSIZE  the Style tab's Body field cleared (select all, Backspace): the
 *        label shows a number, A+ is disabled or its title names no 28 pt,
 *        A− is enabled or its title promises a size; NOSIZEUP A− then
 *        changes a size, or A+ does not draw the body at 28 pt, moves
 *        another level, or leaves a label other than "Body 28 pt";
 *        NOSIZEU one Undo does not give the cleared body back
 *   ODDCTL / ODDUP  the same for a body stored as null, a string or a
 *        negative number (the control absent counts)
 *   ODDLEVEL  a title stored as null is changed by A+ or A− (R1-F5), or
 *        the heading does not follow the rule
 *   Reopening a poster (record 37, docs/fixes/37-load-size-cap.md;
 *   lib/textSizeReloadScenarios.mjs): the size drawn before a reload is
 *   the size drawn after it, unless the poster holds the old default
 *   (title 60, heading 28, authors 22, body 18 units) as a whole:
 *   RELOAD  a title of 170 and a heading of 80 pt set by hand, A+ to 48 pt
 *        (226.67 and 106.67 pt, past the old load-time ceilings), saved,
 *        reloaded: a level drawn otherwise after the reload
 *   RELOADSTYLE  then the Style tab's heading typed to 110 pt, saved,
 *        reloaded: the heading not drawn at 110 pt
 *   RELOAD12  the Style tab's Body field typed to 12 pt (its minimum), A+
 *        once (record 33 R1-F2), saved, reloaded: a level drawn otherwise
 *   RELOADONE  the Style tab's title typed to 432 pt (the old default's
 *        title alone, exactly 60 units), saved, reloaded: the title not at
 *        432 pt or another level moved (one old value is not an old poster)
 *   STALE  a poster stored with the old default's four sizes and a user's
 *        blocks is not drawn at today's defaults (100.8 / 57.6 / 36 / 36 pt)
 *   STALEEMPTY  the old default as a new row held it (no blocks): not
 *        drawn at today's defaults, or no template laid out
 *
 * INFORMATION (printed, not counted)
 *   ROUTE  the Style tab's way to raise every level one step: the fields a
 *        user types into, the Undo presses back, the ratios' drift, where a
 *        round trip by the fields ends (the reproduction's measurement)
 *   extremes  on the templates and the welcome poster, at the start, at 48
 *        pt and at 28 pt: overlapping blocks, blocks past the sheet, and the
 *        Issues rows about them (the brief's rule 7)
 *   old-default-one-edited  the old default with the body changed by hand
 *        (60 / 28 / 22 / 9 units): drawn as stored (record 37's rule: all four
 *        sizes or none)
 *   reload-siblings  the Layout tab's width 100 and height 10 in (the
 *        fields' bounds), the palette "Nature / Biology" and the font DM
 *        Sans, saved, reloaded: what the reload changes (record 37 §6)
 *   font-not-listed  a stored font the font list does not have, opened and
 *        reloaded: what the store holds and the canvas asks for
 *   reload-emptied-…  every deletable block deleted (a poster written into,
 *        a new one), saved, reloaded: whether the starting template comes
 *        back, the palette kept, the locked blocks (the credit mark) at the
 *        start
 *   Review round 1 of record 37 (lib/textSizeNewRowScenarios.mjs):
 *   new-row-defaults  a guest's first /p/new: the row the fake backend
 *        inserted (the posters table's column default) against the
 *        migration file's default and today's DEFAULT_STYLES, what is drawn,
 *        the Style tab's fields; then A+ and A− once, and Body 12 and A+
 *        (R37-1, R37-3)
 *   new-row-emptied  that new poster with every deletable block deleted,
 *        saved: the row against the inserted one, key by key (R37-2)
 *   old-default-strings / old-default-authors-absent  the old default with
 *        its sizes as strings, and with no authors level: drawn, the store
 *        with each size's type, the fields (R37-5)
 *   RTRELOAD / RTSTYLE  the two round trips the anchor does not keep exact
 *        (R1-F3, record 33 §10): A+ ×2, a reload, A− ×2; and A+ ×2, a
 *        Style-tab title, A−, Undo ×2, A− ×2: the store's misses
 *   FIT at 768 × 800, 390, 384 and 375 × 812 (narrower than the brief's
 *        widths; below 640 px the editor shows its phone notice)
 *
 * BLIND SPOTS
 *   - A size is read as the computed font-size of each block's text; what
 *     is painted is not read (the same box, any glyphs). Charts, captions,
 *     tables and the references block follow the body by their own rules
 *     and are not gated here.
 *   - The print document is read in the print window, in print media; no
 *     PDF is printed. The PowerPoint file's slide XML is read, not opened.
 *   - The exact round trip is read from the store (a passive import of the
 *     app's store module in the page), not from what is drawn.
 *   - The native tooltip of a title is not seen; the attribute is read.
 *   - The backend is a fake; a reload is not part of a round trip.
 *   - A reload reopens the poster from the fake backend's row as the
 *     autosave left it; the production database and its column defaults
 *     are not read (record 37 §3). new-row-… read what the fake inserts (its
 *     DEFAULT_DATA), and whether that is the migration file's default
 *     (`fakeCopiesMigration`): a database built from another version of
 *     the migration holds another default.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/text-size-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5860),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *
 * EXIT 0 no claim observed · 1 a claim observed · 2 a scenario errored or
 *      the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, startHarness, openEditor, REPO } from './lib/editorHarness.mjs';
import { prepAssets } from './lib/printPathPosters.mjs';
import { POSTERS, posterById } from './lib/textSizePosters.mjs';
import { ladder } from './lib/textSizeLadder.mjs';
import { NoControl } from './lib/textSizeKit.mjs';
import * as S from './lib/textSizeScenarios.mjs';
import * as E from './lib/textSizeEdgeScenarios.mjs';
import * as RL from './lib/textSizeReloadScenarios.mjs';
import * as NR from './lib/textSizeNewRowScenarios.mjs';

const PORT = Number(process.env.PORT ?? 5860);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');

const WIDE = { width: 1440, height: 900 };
const SCENARIOS = [
  { id: 'control', poster: 'tpl-3col', how: 'the top bar on a new 3-column poster', run: S.topBarControl },
  ...POSTERS.map((p) => ({ id: `ladder-${p.id}`, poster: p.id, how: 'A+ to the top, A− to the bottom, A+ back; one press, Undo, Redo', run: (page) => ladder(page, p) })),
  { id: 'keys', poster: 'user-filled', how: 'A+ reached with Tab from the text, Enter, Space, then arrows and Delete on it', run: S.keys },
  { id: 'caret', poster: 'user-filled', how: 'caret in text, "ZQab", A+ by mouse, "cd", Undo ×3', run: S.caret },
  { id: 'style-tab', poster: 'user-filled', how: 'Style › Typography › title 120 pt, then A+', run: S.styleTab },
  { id: 'note', poster: 'user-filled', how: 'a text block selected, its Edit tab', run: S.note },
  { id: 'cleared-body', poster: 'user-filled', how: 'Style › Typography › Body cleared (select all, Backspace), then A−, A+, Undo', run: E.clearedBody },
  ...['null', 'string', 'negative'].map((k) => ({ id: `odd-body-${k}`, poster: `stored-body-${k}`, how: `a body stored as ${k}, then A+`, run: E.oddBody })),
  { id: 'odd-title-null', poster: 'stored-title-null', how: 'a title stored as null, then A+, A− ×2', run: E.oddTitle },
  ...['user-filled', 'welcome', 'hand-ratios-40'].map((poster) => ({ id: `route-${poster}`, poster, info: true, how: 'one step up and back by the Style tab’s four fields', run: S.route })),
  { id: 'print', poster: 'user-filled', how: 'A+, then the top bar’s Save PDF', run: S.print },
  { id: 'pptx', poster: 'user-filled', how: 'A+, then Export › PowerPoint', run: S.pptx },
  ...[[1024, 768], [1280, 800], [768, 800], [390, 812], [384, 812], [375, 812]].flatMap(([w, hh]) => ['open', 'hidden'].map((sidebar) => ({
    id: `fit-${w}-${sidebar}`, poster: 'user-filled', viewport: { width: w, height: hh }, info: w < 1024,
    how: `the top bar at ${w} × ${hh}, the sidebar ${sidebar}`, run: (page) => S.fit(page, { sidebar }),
  }))),
  { id: 'unbound', poster: 'user-filled', how: '⌘⇧> and ⌘⇧< with the caret in text', run: S.unbound },
  { id: 'arrange', poster: 'user-filled', how: 'A+ ×3, then Layout › Auto-Arrange', run: S.arrange },
  { id: 'reload-ceiling', poster: 'hand-large-36', how: 'title 170 and heading 80 pt by hand, A+ ×3, saved, reloaded; Style heading 110 pt, saved, reloaded', run: RL.reloadCeiling },
  { id: 'reload-small-body', poster: 'user-filled', how: 'Style › Typography › Body 12 pt, A+, saved, reloaded', run: RL.reloadSmallBody },
  { id: 'reload-old-title-alone', poster: 'user-filled', how: 'Style › Typography › title 432 pt (the old default’s title alone), saved, reloaded', run: RL.reloadOldTitleAlone },
  { id: 'old-default-written', poster: 'old-default-written', how: 'a poster stored with the old default’s four sizes and a user’s blocks, opened', run: RL.oldDefault('STALE') },
  { id: 'old-default-empty', poster: 'old-default-empty', how: 'the old default as a new row held it (no blocks), opened', run: RL.oldDefault('STALEEMPTY') },
  { id: 'old-default-one-edited', poster: 'old-default-one-edited', info: true, how: 'the old default with the body changed by hand (60 / 28 / 22 / 9 units), opened', run: RL.oldDefaultOneEdited },
  { id: 'reload-siblings', poster: 'user-filled', info: true, how: 'Layout width 100 and height 10 in, palette Nature / Biology, font DM Sans, saved, reloaded', run: RL.reloadSiblings },
  { id: 'font-not-listed', poster: 'font-not-listed', info: true, how: 'a stored font the list does not have, opened and reloaded', run: RL.fontNotListed },
  ...['user-filled', 'tpl-3col'].map((poster) => ({ id: `reload-emptied-${poster}`, poster, info: true, how: 'every deletable block deleted, saved, reloaded', run: RL.reloadEmptied })),
  { id: 'new-row-defaults', entry: 'guest', info: true, how: 'a guest’s first /p/new: the row inserted, what is drawn; A+, A−; Style › Body 12, A+', run: NR.newRowDefaults },
  { id: 'new-row-emptied', entry: 'guest', info: true, how: 'a guest’s first /p/new, every deletable block deleted, saved: the row against the inserted one', run: NR.newRowEmptied },
  ...['old-default-strings', 'old-default-authors-absent'].map((poster) => ({ id: poster, poster, info: true, how: `the old default ${poster.endsWith('strings') ? 'with its sizes stored as strings' : 'with no authors level'}, opened`, run: NR.oldDefaultOdd })),
  { id: 'round-trip-reload', poster: 'user-filled', info: true, how: 'A+ ×2, saved, reloaded, A− ×2', run: E.reloadRoundTrip },
  { id: 'round-trip-style-undo', poster: 'user-filled', info: true, how: 'A+ ×2, Style title 130 pt, A−, Undo ×2, A− ×2', run: E.styleUndoRoundTrip },
];

let h;
let assets;
try {
  h = await startHarness({ name: 'text-size', port: PORT });
  const ctx = await h.browser.newContext();
  const pg = await ctx.newPage();
  assets = await prepAssets(pg, h.docBase ?? h.base, REPO);
  await ctx.close();
} catch (e) {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  await h?.stop();
  process.exit(2);
}

const results = [];
try {
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(o))) continue;
    const t0 = Date.now();
    let ed;
    try {
      if (sc.entry === 'guest') {
        ed = await NR.openNewGuestPoster(h, { viewport: sc.viewport ?? WIDE });
      } else {
        const p = posterById(sc.poster);
        ed = await openEditor(h, {
          viewport: sc.viewport ?? WIDE, poster: p.size, editDoc: (d) => p.build(assets, d),
          prepare: (context) => context.addInitScript(() => { window.print = () => {}; }),
        });
      }
      const r = await sc.run(ed.page, ed);
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: ed.state.errors, ...r, ...(sc.info ? { info: true } : {}) });
    } catch (e) {
      if (e instanceof NoControl) results.push({ id: sc.id, how: sc.how, noControl: true, ...(sc.info ? { info: true } : {}) });
      else results.push({ id: sc.id, how: sc.how, error: String(e?.stack ?? e).slice(0, 400) });
    } finally {
      await ed?.context.close().catch(() => {});
    }
  }
} finally {
  await h.stop();
}

log(`\n== text-size-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · host ${process.platform}`);
let exit = 0;
const fmt = (n) => Object.entries(n ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (r.noControl) {
    if (!r.info && exit === 0) exit = 1;
    log(`[${r.info ? 'info' : 'OBSERVED'}]  ${r.id}: not measurable, the top bar has no text-size control (TB)`);
    continue;
  }
  if (r.info) { log(`[info]     ${r.id}: ${fmt(r.numbers)}`); continue; }
  const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
  const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
  if (obs.length && exit === 0) exit = 1;
  log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${fmt(r.numbers)}`);
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
