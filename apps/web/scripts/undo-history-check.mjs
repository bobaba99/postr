#!/usr/bin/env node
/**
 * undo-history-check.mjs — real-browser check of undo and redo in the editor
 * (plan item 12, "PowerPoint-style undo"; evidence FINDINGS.md F2; record
 * docs/fixes/12-one-undo-history.md).
 *
 * Version 1 was the item 12 reproducer's (claims U1–U17, the per-action X*,
 * bsf/bso). Version 2 (the fix) asks for the owner's decisions of 2026-10-06:
 * ONE history for everything that edits the poster; the code box, the
 * poster name, dialogs and the preview keep the browser's undo for their
 * own field and never change the poster; a step per typed word; the caret
 * back where the change was; Undo and Redo buttons; a version restore is
 * one step; nothing shown on an empty history; 100 steps; no A+ or
 * alignment on the selection toolbar; a table cell keeps the order of its
 * letters. It folds in the entry points the item 12 confirmer measured on
 * main with its own probes (E1–E17). Every scenario enters where the user
 * does: the canvas text blocks by mouse and keyboard, the sidebar by its
 * visible controls, real key presses (no store action is called). The
 * store is read passively (`usePosterStore.getState()` through the module
 * URL the app uses), never written. Scenarios: lib/undoScenariosCore.mjs
 * (the reproducer's), lib/undoScenariosEntries.mjs, and the review's:
 * lib/undoScenariosSignals.mjs (round 1), lib/undoScenariosCompose.mjs
 * (round 2), lib/undoScenariosButtonKeys.mjs (round 3), and the merge with
 * main's: lib/undoScenariosDrags.mjs, lib/undoScenariosPlacement.mjs;
 * helpers: lib/undoKit.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   U1   ⌘Z with the caret in a text block runs the browser's undo, not the
 *        editor's: the text changes, no toast, redo unavailable
 *   U1g  one typed word (" ZQTYPED") takes more than one ⌘Z to vanish
 *   U2   ⌘⇧Z in the block after U1's ⌘Zs does not bring the word back
 *   U2y  ⌘Y does nothing with the caret in a block, after a ⌘Z there
 *   U3   ⌘Z in the block, click away, ⌘⇧Z: the word is not redone
 *   U4   ⌘Z in the block, click away, ⌘Z: the editor brings back the word
 *        the user just undid
 *   U5   " ZQONE", a 1.5 s pause, " ZQTWO": one ⌘Z removes a different
 *        amount with the caret in the block than after clicking away
 *   U6   a Style › Font change is not undone by ⌘Z with the caret in text
 *   U7   ⌘Z presses in block B never undo block A's earlier typing (20)
 *   U8   typing in A, clicking into B, ⌘Z: A's typing is not undone
 *   K2   (with U8) the caret does not go back to A
 *   U9   from Authors › Author name, ⌘Z does not undo canvas typing
 *        through the editor
 *   Xu Xr Xo  for X in {bold (the toolbar's B), paste (⌘C/⌘V), del
 *        (Backspace on a selected word)}: one ⌘Z in the block does not
 *        return it to before X; one ⌘⇧Z then does not redo X; after a
 *        click away one ⌘Z does not return it to before X
 *   bsf / bso  Edit block › Font size, 60 typed: one ⌘Z in the field / after
 *        a click away does not return the block's size
 *   U10  type, click away, editor ⌘Z, click back in, ⌘Z: the text changes
 *        (a replay of history), or the editor's redo no longer works
 *   U11  ⌘Z in the block until the word is gone, type "Q": the word is back
 *   U12  a word typed in a table cell takes more than one ⌘Z (or none)
 *   U12r the letters typed into the cell are not in the order typed
 *   U12e a font change, then 55 characters in a cell: not undone in 60 ⌘Z
 *   U14  Ctrl+Shift+Z with key "Z" (Windows) does not redo
 *   U15  ⌘⇧Z with key "Z" does not redo
 *   U16  ⌘Z / ⌘⇧Z with nothing to undo or redo still shows "Undo" / "Redo"
 *   U17  after 60 nudges, 60 ⌘Z do not return the block (history < 60)
 *   N1   ⌘Z in Layout › Poster name (it keeps its own undo) changes the
 *        poster, the editor's redo, or moves the focus out of the field
 *   TB   the selection toolbar (floating or docked) has A+, A− or alignment
 *   W1   " ZQWONE ZQWTWO" typed without a pause, click away: the first ⌘Z
 *        does not leave "ZQWONE", or the second does not leave the original;
 *        W1i: the first ⌘Z with the caret in the block does not leave "ZQWONE"
 *   W2   "ZQAB", a 1.5 s pause, "CD": one ⌘Z does not remove the whole word
 *   W3   " ZQA", Enter, "ZQB": while the caret is in the block, the screen
 *        does not show ZQB on its own line (the block's own typing written
 *        back into it)
 *   K1   after ⌘Z (focus away) the block does not have a caret where the
 *        word was, or after ⌘⇧Z the word is not selected
 *   B1   no Undo / Redo buttons, or wrong enabled states, or a click on
 *        Undo does not undo, or Tab from Undo does not reach Redo, or Enter
 *        on Redo does not redo
 *   B2   (review round 2; a poster without a table) " ZQAA ZQBB", click
 *        away, Tab to Undo (Shift+Tab since the merge: the buttons are in
 *        the top bar, before the workspace; lib/undoKit.mjs tabToward):
 *        Enter then Space do not undo twice with the focus kept on Undo,
 *        or a line break or a space reaches the poster; Tab to Redo, Enter
 *        then Space do not redo both with the focus on Redo; or a mouse
 *        click on Undo does not put the caret back where the word was
 *        (decision 4)
 *   V1   after Versions › Restore, ⌘Z does not bring back the poster as it
 *        was, or ⌘⇧Z does not restore the version again
 *   E1   in the Content box, ⌘Z does not undo its typing through the editor
 *        (the box and the canvas agree; redo works; the caret stays there)
 *   E1x  canvas typing then Content-box typing: 4 ⌘Z in the box leave the
 *        canvas word, or the box and the store disagree
 *   E2   ⌘Z on the caption-spacing slider does not undo one slider step, or
 *        changes canvas text, or moves the focus
 *   E4   ⌘Z × 3 in the Figure code box changes the poster or the editor's
 *        redo, or moves the focus out of the box
 *   E5   document.execCommand("undo"/"redo") (an Edit-menu stand-in) leaves
 *        the screen and the store disagreeing, or changes the store behind
 *        the editor's history
 *   E6   Ctrl+Z with the caret in a text block does not undo (Mac too)
 *   E7   a block deleted with Backspace is not restored by ⌘Z in text
 *   E9   the title block: ⌘Z in it does not undo through the editor, or
 *        redo after a click away fails
 *   E14  ⌘Z in the preview changes the poster, or after leaving it ⌘Z does
 *        not undo the typing
 *   E15  ⌘Z with the size dialog open changes the poster or takes the focus
 *        out of the dialog, or after Cancel ⌘Z does not undo the typing
 *   E17  ⌘Z in the table caption field does not undo the typed word, or
 *        undoes canvas typing instead, or moves the focus
 *   From the fix's review, round 1 (lib/undoScenariosSignals.mjs):
 *   W4   a colour drag in Edit block (30 input events one hex digit apart,
 *        the events the picker fires) takes more than one ⌘Z to undo
 *   W5   " ZQAB", "B" copied and pasted with ⌘C / ⌘V (one character), "CD":
 *        the first ⌘Z does not remove "CD" alone, or the second the paste
 *   W6   " ZQAB", the caret moved before "AB", " A" typed: the first ⌘Z does
 *        not remove "A" alone (a word starts where the caret is, whatever
 *        follows it), or the second does not remove the space
 *   E5i  document.execCommand("undo") with the focus in Authors › Author
 *        name changes the store behind the editor's history, or the field
 *        and the store disagree, or the editor's ⌘Z then brings text back
 *   From the fix's review, round 2 (lib/undoScenariosCompose.mjs; Chromium
 *   only: CDP drives Chromium's own IME pipeline, real composition events):
 *   I1   " " then にほんご composed from romaji (8 updates), committed 日本語,
 *        click away: ⌘Z does not remove 日本語 in one press, then the space
 *        (any other text seen on the way is text never typed)
 *   I1i  the same, ⌘Z once with the caret in the block: not "… " on screen
 *        and in the store
 *   I2   " ", 中 (zhong), 文 (wen), a 6 s pause, 很 (hen): ⌘Z does not
 *        remove one composed word per press
 *   I3   " ", 한 then 글 composed from jamo: ⌘Z does not remove 한글 at once
 *   I4   " caf" typed, a dead key composes ´ then é: ⌘Z does not remove
 *        "café" at once
 *   I5   a phone keyboard composing each word, " hello world": not three
 *        steps (" ", "hello ", "world")
 *   I6   a table cell (" 한글") and Authors › Author name (" 日本語"): one ⌘Z
 *        does not remove the composed word
 *   I7   a font change, then 12 composed words: the font is not reverted
 *        within 40 ⌘Z, or uncommitted kana show on the way
 *   From the fix's review, round 3 (lib/undoScenariosButtonKeys.mjs; a
 *   poster without a table, " ZQAA ZQBB" typed in block 1, each case on a
 *   new page):
 *   B3   click away, Tab (or Shift+Tab) to Undo, Enter, then ArrowDown, ArrowRight,
 *        Backspace, Delete or ⌘D on Undo: a block moves, is removed or is
 *        duplicated, the redo is lost, or the focus leaves Undo
 *   B3k  the same with no click away (a keyboard-only user: Tab from the
 *        text, the block still selected from typing), ArrowDown, Backspace
 *   B3r  Enter twice on Undo, Tab to Redo, Enter, then ArrowRight or
 *        Backspace on Redo: the same
 *   B3s  after Enter on Undo a block is selected, or ArrowRight on the
 *        control after Redo (two Tabs on) moves a block or drops the redo
 *   B3t  (the default poster, with its table) a column selected by its
 *        handle, or a range of cells dragged, then Backspace and Delete on
 *        Undo (focused by .focus(), a stand-in for Shift+Tab): the column or
 *        the cells' text is removed
 *   From the merge of main into fix 12 (record section 11; the merge
 *   review's F1 and F2, folded in from its undo-controls.mjs and overlap.mjs
 *   and the integrator's history-vs-controls.mjs):
 *   G1   the image's right crop edge dragged 12 moves, Apply: the Undo button
 *        does not undo the drag in one press, or ⌘⇧Z redo it in one
 *   G2   the image nudged, then one crop gesture of 330 moves (back and
 *        forth, each a new crop), Apply: the first ⌘Z leaves a crop, or the
 *        second does not undo the nudge (the gesture pushed it out of the
 *        100 steps)
 *   G3   a table column's width grip dragged 12 moves: not one press
 *   G4   Edit block › Caption spacing dragged through its values: not one
 *        press (review R2-I1)
 *   G5   Edit block › Line spacing dragged, held still 0.8 s midway: not one
 *        press
 *   B4   the History group shares any area with the workspace, or a control
 *        of a selected top-left corner logo (one turned 180°) has the group
 *        on top at its centre: at the fit for the shapes and windows where the
 *        merge review found one (48×48, 44×48, 46×48 at 1280 × 800 with the
 *        sidebar shown; 48×28, 48×30, 48×32 hidden; 48×30 hidden at
 *        2560 × 1440), at the ceiling scrolled to the corner, and the default
 *   B4o  the top bar at 1280 × 800 (sidebar shown and hidden), 900 × 800 with
 *        both panels open, 375 × 812 (the phone notice showing): clipped or
 *        scrolled sideways, the group outside the window or under the notice,
 *        a button not the top element at its centre, or the sidebar's Show
 *        button (hidden sidebar) over the workspace
 *   INFORMATION, not counted:
 *   U10p U10 on text stored with <p> wrappers (the first commit unwraps them)
 *   P1   whether highlight (an allowed style) reaches the store after a
 *        later keystroke ("kept" observed = it is missing)
 *   M1   DOM mutations outside the focused block per typed character
 *   M2   the bare page of C3 with one outside DOM change per keystroke: ⌘Z
 *        presses to remove the typed word (Chromium ends its typing step at
 *        an outside text change)
 *   F-boldkey (Chromium only) native ⌘B, then ⌘Z / ⌘⇧Z in the block
 *   I0   (Chromium only) the events one composition fires: the selection
 *        covers the text composed so far at every update after the first
 *   B1t  forward Tab from the workspace, up to 150 presses: whether it
 *        reaches Undo (the table's last cell keeps Tab, R2-F3, pre-existing)
 *   I8   (Chromium only) a composition cancelled: whether the redo held
 *        before it survives and the next ⌘Z changes text (would-be claims
 *        redoDropped, emptyStep; LOW, not fixed, record 12 §10)
 *   B3w  nothing selected, Backspace on a focused Undo button: whether the
 *        page leaves the editor (Playwright's WebKit goes back in history
 *        on an uncancelled Backspace outside a text field; B3 and B3t hold
 *        such a Backspace at the window, after the app's listeners)
 *   B3m  the references block clicked, ArrowRight, Undo clicked with the
 *        mouse, ArrowRight: where the click leaves the focus, and whether
 *        the second arrow moves the block (B3's guard keeps keys pressed
 *        on the buttons off the poster; record 12 §10)
 *
 * CONTROLS (exit 2 if one fails: the instrument is not trustworthy)
 *   C1  Style › Font change, click away: ⌘Z reverts it, ⌘⇧Z (key "z") and
 *       ⌘Y redo it
 *   C2  type in a block, click away: ⌘Z removes the word, ⌘⇧Z restores it
 *   C3  a bare contenteditable page (no app code): one ⌘Z removes the typed
 *       word and one ⌘⇧Z restores it
 *   G0  the image's move button dragged 12 moves (one step before the merge
 *       too): one press of Undo returns it
 *
 * BLIND SPOTS
 *   - Keys are Playwright's. Native editing shortcuts are the host's: on a
 *     macOS host ⌘ (Chromium and WebKit through Playwright's mac editing
 *     commands, Firefox natively); on Linux, Ctrl. Windows' native Ctrl+Z
 *     in a text block is not reproduced on a Mac host.
 *   - The key value a real keyboard sends for ⌘⇧Z / Ctrl+Shift+Z / Caps
 *     Lock is the OS's; U14/U15 deliver each value explicitly.
 *   - The browser's real Edit and context menus are not driven: E5 and E5i
 *     use execCommand, which does not fire beforeinput in every engine.
 *   - The native colour picker is not driven: W4 fires its input events on
 *     the real field.
 *   - Paste uses the engine's own clipboard through ⌘C / ⌘V; an engine whose
 *     clipboard does not carry it prints the scenario as [skipped].
 *   - Rendered paint is not read; text and HTML are read from the DOM.
 *   - Text is stored as the editor stores it (no <p>; see `canonical`),
 *     except in U10p. Touch screens, iPad and screen readers are not
 *     driven.
 *   - Compositions (I*) are Chromium's own pipeline driven through CDP, not
 *     a physical input method; Firefox and WebKit have no driver (skipped
 *     there), and WebKit's commit events (deleteCompositionText,
 *     insertFromComposition) are tested in jsdom only.
 *   - A native drag of selected text cannot be driven (Chromium fires no
 *     drag events, Firefox no drop, WebKit selects nothing on a
 *     double-click; MEASURED in round 2): a drag within a block is a manual
 *     check (docs/manual-test-flows.md, flow 29).
 *
 * RUN (from apps/web)
 *   node scripts/undo-history-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5880),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed and every control passed · 1 a claim observed ·
 *      2 a control failed, a scenario errored, or the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, openEditor, startHarness } from './lib/editorHarness.mjs';
import { KEY, MOD, canonical, press, textBlockIds } from './lib/undoKit.mjs';
import { CORE } from './lib/undoScenariosCore.mjs';
import { ENTRIES } from './lib/undoScenariosEntries.mjs';
import { SIGNALS } from './lib/undoScenariosSignals.mjs';
import { COMPOSE } from './lib/undoScenariosCompose.mjs';
import { BUTTON_KEYS } from './lib/undoScenariosButtonKeys.mjs';
import { DRAGS } from './lib/undoScenariosDrags.mjs';
import { PLACEMENT } from './lib/undoScenariosPlacement.mjs';

const PORT = Number(process.env.PORT ?? 5880);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');
const fail = (e) => {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(2);
};
const VIEWPORT = { width: 1440, height: 900 };
const POSTER = { w: 48, h: 36 };
const SCENARIOS = [...CORE, ...ENTRIES, ...SIGNALS, ...COMPOSE, ...BUTTON_KEYS, ...DRAGS, ...PLACEMENT];

/** C3: the engine's own undo on a bare page, no app code. */
async function bareControl(h) {
  const context = await h.browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent('<div id="e" contenteditable style="width:400px;min-height:40px">ZQSENT1 Forty-eight participants.</div>');
    const txt = () => page.evaluate(() => document.getElementById('e').textContent);
    await page.click('#e');
    await page.keyboard.press(KEY.toEnd);
    await page.keyboard.type(' ZQTYPED', { delay: 35 });
    await page.waitForTimeout(300);
    const typed = await txt();
    await press(page, KEY.undo); const u = await txt();
    await press(page, KEY.redo); const r = await txt();
    const ok = typed.endsWith(' ZQTYPED') && u.endsWith('participants.') && r.endsWith(' ZQTYPED');
    return { control: true, ok, numbers: { afterOneUndo: JSON.stringify(u.slice(-14)), afterOneRedo: JSON.stringify(r.slice(-14)) } };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * M2: the same bare page, but every keystroke also rewrites a <p> elsewhere
 * on the page (as the editor re-renders its sidebar on every keystroke).
 * How many ⌘Z remove the typed word now? (Chromium ends its typing step at
 * any outside DOM change; Firefox and WebKit do not.)
 */
async function bareMutationProbe(h) {
  const context = await h.browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(`<div id="e" contenteditable style="width:400px;min-height:40px">ZQSENT1 Forty-eight participants.</div><p id="t"></p>
      <script>const e = document.getElementById('e'); e.addEventListener('input', () => { document.getElementById('t').textContent = e.textContent; });</script>`);
    const txt = () => page.evaluate(() => document.getElementById('e').textContent);
    await page.click('#e');
    await page.keyboard.press(KEY.toEnd);
    await page.keyboard.type(' ZQTYPED', { delay: 35 });
    await page.waitForTimeout(300);
    let n = 0;
    // " Z" marks the typed word: the seeded text starts with "ZQSENT1", no space before it.
    while (n < 12 && (await txt()).includes(' Z')) { await press(page, KEY.undo, 80); n += 1; }
    return { info: true, numbers: { undoPressesToRemoveZQTYPED: (await txt()).includes(' Z') ? '>12' : n } };
  } finally {
    await context.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ main
let h;
try {
  h = await startHarness({ name: 'undo-history', port: PORT });
} catch (e) { fail(e); }
const results = [];
let exit = 0;
try {
  const c3 = await bareControl(h);
  results.push({ id: 'C3-bare-contenteditable', ...c3 });
  if (!ONLY || ONLY.includes('M2')) results.push({ id: 'M2-bare-with-outside-mutation', ...(await bareMutationProbe(h)) });
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(`${o}-`) || sc.id.startsWith(o))) continue;
    if (sc.chromiumOnly && h.engine !== 'chromium') {
      const why = typeof sc.chromiumOnly === 'string' ? sc.chromiumOnly : 'Playwright delivers this native shortcut to Chromium alone';
      results.push({ id: sc.id, how: sc.how, skip: `Chromium only (${why})` });
      continue;
    }
    const t0 = Date.now();
    let opened;
    try {
      const openOpts = { viewport: VIEWPORT, poster: POSTER, editDoc: sc.editDoc ?? canonical };
      opened = await openEditor(h, openOpts);
      const ids = await textBlockIds(opened.page);
      if (ids.length < 2) throw new Error(`need two text blocks, found ${ids.length}`);
      const extra = [];
      const reopen = async () => { const o = await openEditor(h, openOpts); extra.push(o); return o; };
      // Another window, poster size or document (the placement scenarios).
      const openWith = async (over) => { const o = await openEditor(h, { ...openOpts, ...over }); extra.push(o); return o; };
      let r;
      try { r = await sc.run(opened.page, ids, reopen, openWith); } finally { for (const o of extra) await o.context.close().catch(() => {}); }
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: opened.state.errors, ...r, ...(sc.info ? { info: true } : {}) });
    } catch (e) {
      results.push({ id: sc.id, how: sc.how, error: String(e?.message ?? e).slice(0, 300) });
    } finally {
      await opened?.context.close().catch(() => {});
    }
  }
} finally {
  await h.stop();
}

log(`\n== undo-history-check · ${h.engine} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · host ${process.platform} (native modifier ${MOD})`);
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (r.skip) { log(`[skipped]  ${r.id}: ${r.skip}`); continue; }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.control) {
    if (!r.ok) exit = 2;
    log(`[${r.ok ? 'control ok' : 'CONTROL FAILED'}] ${r.id}: ${nums}`);
  } else if (r.info) {
    const would = r.claims ? ` would-be {${Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k).join(', ')}}` : '';
    log(`[info]     ${r.id}:${would} ${nums}`);
  } else {
    const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
    const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
    if (obs.length && exit === 0) exit = 1;
    log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${nums}`);
  }
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, git: h.git, mutant: h.mutant, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
