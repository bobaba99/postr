# Critique of `mvp-editor-bounded-designs.md`

Critic pass, 2026-10-07. Code: the read-only repo copy at main `f554eaa` (paths under `apps/web/src/` unless they start with `packages/`, `supabase/` or `public/`). Nothing was run in a browser. No node_modules in the copy, so no test was run.

Labels: `INSPECTED file:line` = read at f554eaa, nothing run. `MEASURED` = a grep, an arithmetic sweep, or a read of the seed bundle that I ran. `PPT` / `PPT?` = PowerPoint from knowledge; `PPT?` = unsure. `UNVERIFIED` = not settled. Severity is my judgement.

**Verdict.** The doc is mostly accurate and well bounded. 27 of the 30 code claims I checked hold. But four things a PowerPoint user will meet on the blank-to-export path are wrong or missing: the template's text is real text, not "Click to add" prompts (H1). The new z-order rule renumbers sections (H2). The kept ⌘S rule can break Restore (H3). Insert › Logo may select the credit mark (H4). Two rules also contradict the doc's own principle 1 (M1) or its readability floor (M3).

---

## HIGH

**H1. The template's text blocks hold real guidance text, not "Click to add" prompts, and Issues does not flag it.** (completeness, PPT fidelity, truth)
- The doc says step 1 copies PowerPoint's "Click to add…" placeholders (§3.1 Copies; §2 steps 2–3). It says an empty block shows prompt text (§3.1 rule 5) and that Issues lists "leftover placeholders" (§2 step 6).
- In the code, the 3-column template fills each text block with content strings, for example "Background and research question. Provide context, motivation, and the gap your work addresses." (`INSPECTED poster/templates.ts:55, 57, 60, 79`). Insert › Text stores "Enter your text here." and Insert › Heading stores "Section Title" as content (`INSPECTED poster/PosterEditor.tsx:1903`).
- Issues checks only `/Enter your text here/` (`INSPECTED poster/PosterEditor.tsx:1634-1645`). So template guidance text left in a block reaches the PDF with no warning.
- A PowerPoint hand clicks and types. Here the typing lands inside the guidance sentence, so each block must be cleared first: the "small dumb repeated task" the narrative names.
- Bounded fix (design): template and Insert text bodies start empty and show prompt text. Or keep them, and add one Issues rule: "a text block still has its template text", comparing with the template strings. Add this to §5.1 and to step 3 of §2.

**H2. Bring to Front / Send to Back on every kind would renumber the section headings.** (bounded-ness, truth)
- Heading numbers follow the order of the `doc.blocks` array, not the canvas position (`INSPECTED poster/PosterEditor.tsx:1481-1497`, whose comment says so; the export uses the same rule, `export/posterContent.ts:51-63`). The doc says "Numbered by position" (§3.2 Heading row; inherited from inv 2.16). That is wrong.
- Z-order is the same array: today's reorder moves array positions (`INSPECTED poster/PosterEditor.tsx:1789-1800`).
- The doc's change sends a block to the start or end of the stack and opens that menu on headings (§3.4, §3.5). So "Send to Back" on heading 3 makes it "1." and renumbers the others.
- Pasted and duplicated headings are appended, so they take the last number wherever they land (⌘D already does this).
- Bounded fix: one numbering rule for headings and captions (reading order), or z-order kept out of the array. The doc must state which.

**H3. The kept ⌘S rule fills the version store, and then Restore stops working.** (PPT fidelity)
- §3.9 keeps "⌘S / Ctrl+S saves a version, as today" and cites PPT ref §13. That section says Ctrl+S *saves* (`powerpoint-reference.md:352`), which is reflexive for PowerPoint users.
- Today each ⌘S inserts an unnamed version (`INSPECTED poster/PosterEditor.tsx:1215-1231` → `data/posterVersions.ts:68-91`). The 20-version cap exists only on the Versions tab's button (`INSPECTED poster/VersionPanel.tsx:89`).
- The database refuses the 31st version (`INSPECTED supabase/migrations/20260702000000_poster_versions.sql:84-85`).
- Restore first inserts a "Before restore" version and stops if that fails (`INSPECTED poster/PosterEditor.tsx:1195-1207`).
- So 30 reflexive saves over a multi-day build leave ⌘S showing "Could not save version" and stop Restore. The Restore failure is UNVERIFIED in a browser.
- Bounded fix: ⌘S saves now (flushes autosave and shows "Saved"), as in PowerPoint. Named versions come only from the Versions tab.

**H4 (if reproduced). The one-logo rule counts the locked credit mark, and the doc copies that rule into its new paste rule.** (completeness, truth)
- `addBlock('logo')` selects the first block of type `logo` if one exists (`INSPECTED poster/PosterEditor.tsx:1885-1891`). The credit mark is a block of type `logo` (`INSPECTED export/ackBlock.ts:53-55`), and it is added on every editor open (`INSPECTED pages/Editor.tsx:284`). No template has a logo block (`MEASURED grep`: 0 `type: 'logo'` in `poster/templates.ts`).
- So on a poster that carries the mark and has no logo yet, Insert › Logo and the Authors tab's "+ Logo" (`Sidebar.tsx:730`) select the credit mark and add nothing.
- §3.2 keeps the rule ("pressing it again selects the logo"). §3.3 C adds "a poster has one logo" to the paste rule.
- OF-25 says the default 3-column 48 × 36 poster may never get a mark (UNVERIFIED), which would hide this on the default path only.
- Fix: leave locked blocks out of the one-logo check. Reproduce first; logo is on the MVP list.

## MEDIUM

**M1. §3.4 breaks principle 1.** Principle 1: when Postr leaves a PowerPoint key out, "its key does nothing. It never does something else."
- §3.4 binds "⌘, Ctrl, ⌥ or Shift + arrow" to the 0.1 in nudge. Its own out-of-scope line says "Shift+arrow to resize and Alt+arrow to rotate (left doing nothing)". ⌥ is Alt, so Shift and Alt are both bound and listed as doing nothing.
- PowerPoint resizes on Shift+arrow (`PPT?`, PPT ref §5 line 159) and rotates on Alt+Left/Right (`PPT?`).
- Today Shift is the fine nudge (`INSPECTED poster/PosterEditor.tsx:2235`).
- Pick one: Ctrl/⌘ only, with Shift and Alt doing nothing. Or keep Shift and write the exception into principle 1. (Alt+Left is also browser Back on Windows; whether a page can block it is UNVERIFIED.)

**M2. The "Custom" state is not rare: the first poster every user sees is Custom, and A+ shrinks its title.**
- The welcome poster's title is 20.28 units = 146.0 pt (`MEASURED`: `public/seeds/welcome-cat-poster.postr` › `poster.json`). That matches no step: step 7 gives 131 pt.
- Under §3.7, its first A+ goes to "the first step with a larger body size", which is step 6. That cuts the title from 146 pt to 116 pt, so "Increase" makes the title smaller.
- "Sizes by level" keeps four free fields, so Custom stays a normal state. It brings two more cases: A± from Custom, and Auto-Arrange from Custom.
- Bounded options: hide the folded size fields with weight, italic and line height, and re-save the seed at a step. Or make A± scale the current four sizes by one factor, which needs no table and no Custom state.

**M3. Steps 1 and 2 go below Postr's own readability minimums, and Auto-Arrange can now reach them by itself.**
- `constants.ts` states minimums of title 72 pt, heading 42 pt and body 24 pt (`INSPECTED poster/constants.ts:29-35`).
- Step 1 gives 60.5 / 34.6 / 21.6 pt. Step 2 gives 70.6 / 40.3 / 25.2 pt. Steps 3–7 match the doc's table (`MEASURED`, arithmetic over `DEFAULT_STYLES` 14/8/5 units × 7.2 pt).
- Today Auto-Arrange never touches the title or authors (`INSPECTED poster/autoLayout.ts:226-231`). §3.5 now lets it lower all four sizes, down to step 1.
- Make step 3 (×0.8) the floor, or have Issues flag sizes below the minimum. Name this behaviour change in §6: it is a product choice. For fairness: today's heading floor is 22 pt (`autoLayout.ts:215, 230`), so for headings the steps are better than today.

**M4. The Format tab still opens on every selection, but after the hides it is nearly empty for text.**
- Selecting any block other than authors or references switches to "edit block" (`INSPECTED poster/Sidebar.tsx:345-366`). §3.0 keeps that.
- After §3.7, the tab holds one sentence for a title, heading or text block. A user stepping Text size in Design and clicking a block to look at it loses Design each time.
- PowerPoint shows its contextual Format tab but stays on the current tab when an object is selected (`PPT?`).
- Rule: switch on selection only to Authors or References (where that content is edited), and perhaps for images and tables (captions). Otherwise stay put.

**M5. The citation style menu is a decision a default could answer, and the doc adds a stored field to keep it.**
- A reference with pasted raw text renders verbatim whatever the style (`INSPECTED poster/citations.ts:49-62`). The paste fallback stores raw text only (`INSPECTED poster/Sidebar.tsx:2034`). On the common path the menu mostly changes the number prefix.
- The sort is fixed A–Z for every style (`INSPECTED poster/PosterEditor.tsx:710-712`). Vancouver and IEEE lists therefore come out alphabetised and numbered; those styles number in citation order (knowledge, UNVERIFIED).
- Either hide the menu (APA 7 for typed fields, pasted text verbatim) and drop the new `PosterDoc` field, or write the rule: A–Z for APA and Harvard, entry order for Vancouver and IEEE.

**M6. ⌘P / Ctrl+P is not defined.**
- PowerPoint's Ctrl+P is File › Print (`PPT`). Postr has no handler and no print stylesheet (`MEASURED grep`: no `key === 'p'` and no `@media print` in `poster/`, `pages/`, `components/` or `index.css`). So the browser prints the editor page, sidebar included.
- Add one row to §3.10: ⌘P → the one print function.

**M7. The PDF step still asks for 4 print-dialog choices; one CSS line removes one of them.**
- The print page sets `@page { size; margin: 0 }` (`INSPECTED export/printDocument.ts:81-84`) but has no `print-color-adjust: exact` (`MEASURED grep`: 0 hits).
- With it, Chromium and WebKit print backgrounds without the "Background graphics" box (knowledge, UNVERIFIED per browser).
- With `@page size` set, Chrome may not offer Paper size at all (UNVERIFIED). The print window's hint asks for it anyway (`printDocument.ts:212-217`), and §3.10 makes that hint "the only list" of steps.
- §3.10 should also say which browsers produce a 48 × 36 in page; the docs record none (UNVERIFIED).

**M8. The title and authors blocks can be lost for good.**
- Delete removes any block that is not locked (`INSPECTED export/blockLock.ts:66-82`). Insert has no Title or Authors entry (`INSPECTED poster/Sidebar.tsx:4164-4172`). ⌘D and the new paste rule refuse them.
- After a reload, or past the undo depth, the only way back is a layout pick, which replaces every block.
- The new ⌘A (everything except the credit mark) followed by Delete brings this within two keys.
- Rule: Delete refuses title and authors with a toast, as it does for the credit mark. Or Insert offers them when they are missing (PowerPoint's Reset brings placeholders back, `PPT?`).

**M9. The block clipboard design contradicts itself, and copies of images share a file.**
- "A reload loses it" (an in-memory copy) conflicts with "the most recent copy, inside or outside Postr, wins" and with pasting into another poster. Both of those need the system clipboard.
- One mechanism answers all three and removes the "copy event with no text selected" question: put a Postr payload on the system clipboard. This is an engineering choice to write down, not leave to the build.
- Image files live at `{userId}/{posterId}/{blockId}.{ext}` and are written with `upsert: true` (`INSPECTED data/posterImages.ts:45-53, 127-133`). A copy keeps the same `imageSrc`, as ⌘D's clone does today (`INSPECTED poster/PosterEditor.tsx:1774-1779`).
- So "Replace image" on the original overwrites the file the copy shows (INSPECTED; UNVERIFIED on screen, where caching may hide it). Today's ⌘D has the same root cause.
- Rule: a pasted or duplicated image block gets its own file, or Replace writes a new file name.

**M10. D2 does not quote the owner's words.**
- The owner said "mimic PPT's control and layout". "Layout" may mean PowerPoint's window layout (ribbon on top), not slide layouts. D2 recommends the left sidebar and lists the ribbon as out of scope without quoting him.
- Add the cheap middle option to D2: put PowerPoint's most-used commands (Undo/Redo, A−/A+, Insert picture, table and text, Export PDF) in the 44 px top bar fix 12 already adds.

**M11. The slash menu swallows Enter after an ordinary slash.**
- The slash menu stays KEEP and "Unchanged". It opens on "/" followed by letters or digits anywhere (`INSPECTED poster/slashCommand.ts:23, 40`), and Enter or Tab inserts the first match (`INSPECTED poster/RichTextEditor.tsx:212-218`).
- So "n/a" + Enter becomes "nα" (`alpha` is the first key starting with "a", `poster/symbols.ts:13`), and "μg/d" + Enter becomes "μgδ". UNVERIFIED in a browser.
- In PowerPoint "/" is a character and Enter starts a new paragraph.
- Bounded rule: open the menu only when "/" starts a word. Enter takes a symbol only after an arrow key has moved into the menu; Tab always takes one.

## LOW

- **L1. Caption order is not column reading order.** "Reading order" in the code is y then x (`INSPECTED poster/PosterEditor.tsx:1528-1529`), so a 3-column poster numbers its figures across the columns, not down them. State the rule as it is, or make it follow columns. Also, export numbering counts only images and tables (`export/posterContent.ts:36-47`), while the canvas counts images and charts together (`PosterEditor.tsx:1532-1533`). On old posters with charts, the PPTX's Figure numbers can differ from the canvas. This is a sibling of OF-09.
- **L2. "Snaps within 0.3 in" means it always snaps.** On a ½ in grid no point is more than 0.25 in from a grid line (`MEASURED` sweep: 2.5 units, threshold 3; `snap.ts:14-15`, `constants.ts:60, 63`). The 0.1 in nudge is the only off-grid placement; say so. Nothing matches PowerPoint's Alt-drag past the grid (`PPT?`).
- **L3. Fix 12 written as if on main.** §4 row 4.10 and §5.3 say "the bar no longer has them". Main still has A−, A+ and alignment (`INSPECTED poster/FloatingFormatToolbar.tsx:272-274, 322, 334`). They are removed only on `fix/12-one-undo-history` (`INSPECTED` via `git show` of that branch's file, comment at :213-214).
- **L4. A hidden toggle must state the value it stays at.** "Show grid" starts on (`INSPECTED poster/PosterEditor.tsx:708`). Hiding only the checkbox leaves the grid drawn for good. Write: switch off → no grid.
- **L5. The tour still mentions `.postr`.** The step titled "Export, print, or save .postr" (`INSPECTED components/OnboardingTour.tsx:92`) points at the hidden backup.
- **L6. `IMPORT_ENABLED` must hide only the UI.** The welcome poster is built through `importPostr` (`INSPECTED data/seedWelcomePoster.ts:31-33, 85-86`). Gating the importer would silently drop it, and 1.3 is KEEP.
- **L7. PowerPoint's Tab in the last cell adding a row is missing.** That is how PowerPoint grows a typed table (`PPT`, PPT ref §3 line 95). Today Tab in the last cell does nothing (`INSPECTED poster/blocks.tsx:628-638`). It undercuts D5's "stuck at 3 × 3" and would make a better D5 default.
- **L8. A pasted image is ignored when the caret is in text.** Pasting a figure while the caret sits in a text block does nothing, silently (§3.3 A). PowerPoint pastes it as a separate picture (`PPT?`). Use clipboard rule 3 here too, or show a toast.
- **L9. Paste rule 2 can turn prose into a table.** "Text with tabs on two or more lines" also matches tab-indented prose. Excel, Word and Sheets also put an HTML table on the clipboard (knowledge, UNVERIFIED), so the HTML half of the rule may be enough.
- **L10. Proposals worded as today.** "The guidelines panel is hidden anyway" (§3.11) and "print-shop help (Staples, hidden)" (§3.10) describe the proposal. Today the panel shows in wide windows (`PosterEditor.tsx:3463`; inv 5.4) and Staples is in Export (`INSPECTED poster/Sidebar.tsx:1202-1213`).
- **L11. No keys for x² and x₂.** PPT ref §7 marks Ctrl+Shift+= and Ctrl+= as MVP, but the doc adds buttons only. In browsers ⌘/Ctrl+= zooms the page, so principle 1 fails unless these keys are taken over inside text.
- **L12. The save retry has no rule.** "Postr retries" (§3.9) needs one: how often, and until when.
- **L13. A one-pick theme is left for Later.** PowerPoint's main surface is one Themes gallery. Deferring "one theme list" keeps two choices (palette and font) where the owner asked for fewer. This is acceptable for the MVP, but name it in §6.

---

## (d) Truth: 30 claims checked against `main`

| # | Claim (doc §) | Result |
|---|---|---|
| 1 | Switches: gallery `:21`, sharing `:53`, rulers `:67`, LaTeX `:84` (§1, §4) | holds |
| 2 | Empty poster gets 3-col + Classic Academic; palette stored without its name (`Editor.tsx:41-51, 45-50`) | holds |
| 3 | 8 size presets, none under 30 in tall (`constants.ts:80-89`; §5.1 rank 8) | holds |
| 4 | Citation style is component state; APA 7 default; A–Z (`PosterEditor.tsx:711-714`, `citations.ts:103`) | holds (state at `:713`) |
| 5 | 10 sidebar tabs (`Sidebar.tsx:634-646`) | holds |
| 6 | Selection opens edit, authors or refs (`Sidebar.tsx:345-366`) | holds |
| 7 | Tour matches tabs by label (`OnboardingTour.tsx:40-43`); "Plot code readability check" step | holds (`:78`) |
| 8 | Dashboard keeps Duplicate (`Home.tsx:95`) | holds (`:92-95`) |
| 9 | ⌘D refuses title and authors; +1 in offset (`PosterEditor.tsx:1773, 1777-1778`) | holds |
| 10 | Enter swallowed in single-line; typing commit has no separator, paste has one (`RichTextEditor.tsx:220-221, 166-174, 251-254`) | holds |
| 11 | Image up to 10 MB; non-image message (`blocks.tsx:97, 107-125`) | holds |
| 12 | Format tab adds or removes the last row or column (`Sidebar.tsx:3475-3510`) | holds |
| 13 | No `citationStyle` in `PosterDoc`; `rotation` field; no per-block font size (`poster.ts:351-366, 206, 175-278`) | holds |
| 14 | No sub/sup button in the format bar (`FloatingFormatToolbar.tsx:256-290`) | holds (`MEASURED grep`) |
| 15 | Caption default: canvas top, Format tab bottom, PPTX top (`blocks.tsx:1620`, `Sidebar.tsx:3031`, `writer.ts:306`) | holds |
| 16 | Sanitizer allowlist; no `IMG` (`sanitizeHtml.ts:20-29, 53-78`) | holds |
| 17 | Key guard leaves out `SELECT` (`PosterEditor.tsx:2204-2209`) | holds |
| 18 | Shift = 0.1 in; ⌘/Ctrl ignored, so 0.5 in (`PosterEditor.tsx:2235-2243`) | holds |
| 19 | No Escape deselect; no ⌘A handler (MEASURED grep) | holds (also none in `hooks/`, `stores/`) |
| 20 | Block menu skips 5 kinds; Bring Forward / Send Back only (`blocks.tsx:2077-2091, 2723-2738`) | holds |
| 21 | Reorder moves one place (`PosterEditor.tsx:1789-1800`) | holds |
| 22 | Snap ½ in within 0.3 in (`snap.ts`, `constants.ts:60-63`) | holds, but misleading (L2) |
| 23 | Auto-Arrange floor 3 units; title and authors untouched (`autoLayout.ts:205-231`) | holds |
| 24 | Palette pick replaces only the palette (`posterStore.ts:417-418`) | holds |
| 25 | Defaults 14/8/5/5 units; 1 unit = 7.2 pt (`constants.ts:270-293, 39`) | holds |
| 26 | Format size changes the whole level; panel "Editing: {type}" (`Sidebar.tsx:2793-2817, 3948`) | holds |
| 27 | Ctrl+Y is redo on every system (`PosterEditor.tsx:1001-1005`) | holds (⌘Y too) |
| 28 | One `navigate(` in `PosterEditor.tsx`, at `:2616` | holds (`MEASURED grep`) |
| 29 | Headings "numbered by position" (§3.2, inv 2.16) | **wrong**: array order (H2) |
| 30 | A−/A+/alignment "no longer" in the bar (§4 4.10, §5.3) | **wrong for main** (L3) |
| + | Issues lists "leftover placeholders" (§2 step 6) | **overstated**: only "Enter your text here." (H1) |
| + | Figures "numbered in reading order" (§3.2) | imprecise: y then x (L1) |
| + | `docs/brand/` absent (§7) | holds (`MEASURED ls`) |
| + | Save PDF needs no account (implied by §2 step 7) | holds: only editable exports gate guests (`EditableExportButtons.tsx:108-114`); Save PDF calls `onPrint` directly (`Sidebar.tsx:1158-1159`) |

**Hidden or shown claims.** Gallery, sharing and comments, rulers and LaTeX are off: holds. The Review tab is commented out: holds (`Sidebar.tsx:642`). The Figure tab, guidelines panel, Staples, `.postr` export, Import, crop, rotate and grid are all **shown** on main; the doc's "hidden" for them is a proposal. Two places word it as fact: L10, plus §4 4.10 and §5.3 (L3). No image paste or drop exists today: holds (`MEASURED grep`: no `onDrop` or `dataTransfer` in `poster/`).

## (c) Completeness: blank to PDF with only the KEEP set

The path works on main without an account: Save PDF is not gated for guests (row "+" above). Missing or broken steps:
1. Clearing each template text block's guidance text. It is not in step 3, and Issues does not catch it (H1).
2. Adding a logo may select the credit mark instead (H4).
3. A deleted title or authors block cannot be added back (M8).
4. ⌘P prints the editor page (M6).
5. Four print-dialog choices remain, and the browsers that work are not named (M7).

## (e) Decisiveness

- **KEEP items that are really customisation:**
  - "Sizes by level", the four folded fields (M2).
  - The citation style menu, plus a new stored field to keep it (M5).
  - ⌘S as "save a version" (H3).
  - Slash symbols, kept unchanged with the Enter hazard (M11).
  - Two theme pickers instead of one (L13).
- **D1–D5:** none is a pure engineering choice. D5 could be settled by design instead (L7).
- **Product choices made silently** that belong in §6:
  - Auto-Arrange now shrinks the title, down to 60 pt (M3).
  - ⌘S's meaning (H3).
  - Z-order on headings renumbers them (H2).
  - Pasted colour is dropped (§3.3). Fine as a default, but it is a choice.
- **Engineering choices the doc leaves open** and should state: the clipboard mechanism and image-file ownership (M9); the value each hidden toggle stays at (L4).

## What this critique does not establish

- Nothing was run in a browser and no test was run.
- H3's Restore failure, H4's trigger frequency, M9's shared-file overwrite and M11's symbol insertion are code readings (INSPECTED), not reproductions.
- All PowerPoint behaviour is from knowledge.
- I checked 30 claims and the hidden/shown claims, not every line of the doc.
