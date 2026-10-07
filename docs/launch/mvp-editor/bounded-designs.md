# Postr MVP editor: bounded designs, blank to export

Draft for Gavin, 2026-10-07, revised the same day after a critique pass (§8). The owner reads it; agents build from it.
Code: the read-only repo copy at main `f554eaa`. Nothing was run in a browser.

Built from these inputs in this folder:
- `inventory.md`: every editor control today, cited here as **inv N.N**.
- `powerpoint-reference.md`: how PowerPoint does each step, cited as **PPT ref §N**.
- `open-findings.md`: open defects, cited as **OF-NN**, **U-N**, **C-N**, and shared causes as **R1–R7**.
- `critique.md`: the critique this revision answers, cited as **H1–H4**, **M1–M11**, **L1–L13**.
- Three probes this revision ran against the repo copy: `probes/revise-probe.mts`, `probes/revise-probe-order.mts`, `probes/revise-probe-slash.mts` (how to run them is in each file's header).

## Evidence labels

| Label | Meaning |
|---|---|
| `INSPECTED file:line` | Read at `f554eaa`. Nothing was run, so it may be wrong. Paths are under `apps/web/src/` unless they start with `apps/api/`, `packages/`, `supabase/` or `public/`. |
| inv N.N | A row of `inventory.md`. Its author read the code at `f554eaa` (INSPECTED). |
| OF-NN, U-N, C-N | A row of `open-findings.md`. None was re-run, so to this doc each is UNVERIFIED. |
| `MEASURED (grep)` | A search run in this pass. It shows only that a pattern is present or absent. |
| `MEASURED (probe)` | Output of one of the three probes above. They call the production functions named in their headers under Node; no browser, no layout. |
| `PPT` / `PPT?` | Desktop PowerPoint from knowledge, not checked against a running copy. `PPT?` means unsure of the detail. |
| UNVERIFIED | Not settled. |
| (design) | Every rule table, verdict, ranking and recommendation is design judgement, not evidence. |

---

## 1. Purpose and principles

1. **Feel like PowerPoint.** Use its control names, shortcuts and places, so a researcher's PowerPoint habits work. When Postr leaves a PowerPoint control out, its key does nothing. It never does something else.
2. **Blank to export, nothing more.** A control stays only if a poster cannot get from a blank page to a PDF without it, or if PowerPoint hands reach for it. Everything else is hidden or Later.
3. **Few decisions.** Every choice has a good default. Postr never asks what a default can answer.
4. **Bulk, not per element.** One text-size control for the whole poster. One theme (palette and font). One layout pick. No per-block size, font or colour.
5. **Bounded designs.** Each function gets a short rule table: what happens, in what order, what wins, the default, and what happens when input is missing. Plain behaviour over machinery. An explicit out-of-scope list instead of cases for odd input. We assume the user's input is ordinary and working.
6. **Hide, don't delete.** A hidden feature sits behind a switch in `config/features.ts`, as the gallery does (`INSPECTED config/features.ts:1-21`). Code, data and tests stay. Hiding a control never changes stored data: a stored rotation, crop or colour still draws. Each switch states the value its hidden control stays at (§5.2).
7. **One reading order.** Heading numbers, figure and table numbers and Auto-Arrange all read the poster in the same order (§3.5). Paint order (what sits on top) is separate.

## 2. Blank to export in 7 steps

| # | Step | The minimum the user does | Defaults that answer the rest | PowerPoint habit it uses (`PPT`) |
|---|---|---|---|---|
| 1 | Start | Press "+ New poster" or open `/p/new` (inv 1.1). Nothing else is required. | 48 × 36 in, 3-Column Classic layout, Classic Academic palette (`INSPECTED pages/Editor.tsx:41-51`; `poster/constants.ts:80-93`) | File › New, Design › Slide Size, Home › Layout |
| 2 | Header | Type the title into the empty title block. Add authors and institutions in the Authors tab. Insert a logo. | The authors block on the canvas is drawn from the Authors tab (inv 2.11) | "Click to add title", Insert › Pictures |
| 3 | Text | Type or paste each section into the empty text blocks, which show grey prompts that never print (§3.1). Insert › Heading or Text for more. | Pasted text takes the poster's font and size (inv 2.4). Headings number themselves in reading order (§3.5). | "Click to add text", Ctrl+V |
| 4 | Figures and tables | Paste, drop or upload each figure. Paste each table from Excel or Word, or type over the sample table. Type a caption. | Figures keep their shape. "Figure N." and "Table N." number themselves in reading order (§3.5). | Ctrl+V a picture, Insert › Table, paste cells |
| 5 | References | Import a `.bib` or `.ris` file, paste a list, or type them. | APA 7 for typed and imported references; pasted ones show as pasted; sorted A–Z (§3.2) | None: in PowerPoint they are typed by hand |
| 6 | Arrange and check | Drag and resize where needed, or press Auto-Arrange. Fix what the Issues tab lists. | Every drag lands on a ½ in grid (§3.5). Issues lists overflow, overlap, empty blocks, empty figures, and template text or sample numbers still in place (§3.12). | Drag, handles, arrow keys |
| 7 | Export | Save PDF (top bar or Export tab, or ⌘P), or PowerPoint (paid). | The PDF page is the poster's size (inv 7.1). | File › Export › Create PDF, Ctrl+P |

Theme and text size can change at any step. Each is one control (§3.6, §3.7).

---

## 3. Bounded designs

Each design gives: what it copies from PowerPoint, today's behaviour, the rule table, the bulk control, and what is out of scope. "Change" marks a rule that differs from today.

### 3.0 The window: where things are

**Copies** (`PPT`): the Quick Access Toolbar with Undo and Redo at the top; Home's Increase and Decrease Font Size; ribbon tabs named Design and Insert; a Format tab for the selected object; File › Export.

**Today:** a left sidebar with 10 tabs: layout, style, authors, insert, edit block, references, figure, issues, versions, export (`INSPECTED poster/Sidebar.tsx:634-646`). Selecting a block opens edit block, or Authors or References for those blocks (`INSPECTED poster/Sidebar.tsx:345-366`). Main has no Undo/Redo buttons (inv 6.1). Fix 12 adds a 44 px top bar with them; that work is not merged (open-findings §3.1).

| What | Rule |
|---|---|
| Top bar | **Undo · Redo · [A−] Body 36 pt [A+] · Save PDF** (D2's recommended default). Undo and Redo come with fix 12. Text size and Save PDF are a later item on top of fix 12, not part of it. |
| Sidebar tabs, in this order | **Design · Insert · Authors · References · Format · Issues · Versions · Export** (change: 8 tabs instead of 10) |
| Design | Poster name, poster size, layout (templates, Auto-Arrange), theme (palette, font), and "Sizes by level", folded closed (§3.7). It merges today's layout and style tabs. |
| Format | Today's "edit block", renamed. It holds captions, Replace image, table rows and columns, and the logo picker. |
| Selecting a block | Authors block: the Authors tab. References block: the References tab. Image, table or logo: Format. Title, heading or text: the sidebar stays on its tab (change). Today every other kind opens edit block (`INSPECTED poster/Sidebar.tsx:345-366`), and after §3.7 that tab would hold one sentence for text. |
| Figure tab | Hidden (§3.11, D1). |
| Tab labels | The tour finds tabs by their label text (`INSPECTED components/OnboardingTour.tsx:40-43`). Rename the tour's targets in the same edit. |

If D2 is answered "sidebar only", Text size sits at the top of Design and Save PDF stays in Export.

**Out of scope:** a full ribbon (D2); a slide thumbnail pane (a poster is one page); a status bar; a customisable toolbar.

### 3.1 Start: new poster, size, layout, starting text

**Copies** (`PPT`): File › New; Design › Slide Size › Custom Slide Size; the Home › Layout gallery and its "Click to add…" placeholders, which show grey and never print.

**Today:** the default poster's text blocks hold guidance sentences as real text, for example "Background and research question. Provide context, motivation, and the gap your work addresses." (`INSPECTED poster/templates.ts:55, 57, 60, 79`). The title holds "Your Poster Title" (`INSPECTED poster/templates.ts:206`). The sample table holds made-up results ("DV 1", "4.2 (0.8)", "< .01"; `INSPECTED poster/templates.ts:73`). Insert › Text stores "Enter your text here." and Insert › Heading stores "Section Title" (`INSPECTED poster/PosterEditor.tsx:1903`). Every block must be cleared before typing. Issues flags only "Enter your text here." and the default title (`INSPECTED poster/PosterEditor.tsx:1619-1645`), so the rest can reach the PDF unflagged. The prompts the inventory lists ("Poster Title", "Section Heading", "Type here…", inv 2.2) are passed as a `data-placeholder` attribute (`INSPECTED poster/RichTextEditor.tsx:324`), but no stylesheet reads it (`MEASURED (grep)`: no `data-placeholder` selector in `apps/` or `packages/`). So an empty block likely shows nothing (UNVERIFIED on screen).

| # | When | Then |
|---|---|---|
| 1 | The user opens `/p/new` or presses "+ New poster" | A poster is created and opened (inv 1.1). |
| 2 | The poster has no blocks | It is filled with 3-Column Classic and Classic Academic (`INSPECTED pages/Editor.tsx:41-51`). The size is the database default, 48 × 36 in (inv 1.2). |
| 3 | The user picks one of 8 size presets, or types width and height (10–100 in) | "Change poster to …?" Then the blocks move onto the new sheet as one undo step (inv 1.7). Unchanged. |
| 4 | The user picks one of 5 layouts on a poster that has content | "Replace blocks?" Then every block is swapped for the layout's blocks, as one undo step (inv 1.9). Unchanged. |
| 5 | A layout or Insert makes a block | Change: the title, text blocks, and headings from Insert start **empty**. Template headings keep their section names ("Introduction", "Methods") as real text, since most posters keep them. The sample table keeps its numbers, so its shape is clear; Issues flags them until they change (§3.12). |
| 6 | A title, heading or text block is empty | It shows a grey prompt on the canvas only (change). A template text block shows its own guidance sentence, held in a new optional `prompt` field on the block that is never saved as text, printed or exported. Other blocks show today's prompts: "Poster Title", "Section Heading", "Type here… (type / for symbols)" (`INSPECTED poster/blocks.tsx:2214, 2256, 2279`). One CSS rule in the app's stylesheet draws `data-placeholder` on an empty block. The print page builds its own stylesheet (`INSPECTED export/printDocument.ts:80-90`), so prompts never print. |
| 7 | A typed size is outside 10–100 in | The field refuses it (inv 1.7). |

**Check before building** (UNVERIFIED): browsers can leave a `<br>` in a block the user empties, which defeats `:empty`. The prompt rule must treat a lone `<br>` as empty.

**Bulk control:** the layout pick (1 of 5) and Auto-Arrange (§3.5).

**Out of scope:** importing an existing poster (D3); Duplicate inside the editor (the dashboard keeps it: `INSPECTED pages/Home.tsx:92-95`); changing layout while keeping content (Auto-Arrange tidies instead); PowerPoint's Maximize / Ensure Fit question; PowerPoint's 56 in size limit (not copied); type sizes that follow the sheet size; prompts inside table cells; rewriting text already stored in older posters (Issues flags it instead, §3.12).

### 3.2 Blocks: each kind

**Copies** (`PPT`): text boxes and placeholders, pictures, tables. PowerPoint has no authors, references or logo object; there users type superscripts and paste logos by hand.

| Kind | How it is added | MVP rules | Out of scope |
|---|---|---|---|
| Title | Comes with the layout. If the poster has none, Insert lists "Title" (change). One per poster: ⌘D refuses it (`INSPECTED poster/PosterEditor.tsx:1773`). | Starts empty (§3.1). Single line: Enter does nothing (`INSPECTED poster/RichTextEditor.tsx:220-221`). | A second title; a subtitle block |
| Authors | Comes with the layout. If the poster has none, Insert lists "Authors" (change). Edited in the Authors tab; the canvas says "Add authors in sidebar →" (inv 2.11). | Names, ▲▼ order, affiliations, Corresponding, Equal contrib. Paste a list and press Parse (inv 2.12). | Typing authors on the canvas |
| Heading | Insert › Heading | Starts empty. Single line, like the title (`INSPECTED poster/RichTextEditor.tsx:18, 220-221`). Numbered in reading order (§3.5). | Turning numbering off; typed numbers |
| Text | Insert › Text | Starts empty. Enter makes a new line that is saved (change; OF-01). Bullets and numbered lists. | Columns inside a block |
| Image | Insert › Image, paste, or drop (§3.3) | Keeps its shape. "Replace image" on the handle row. Image files up to 10 MB (`INSPECTED poster/blocks.tsx:97, 107-125`). Each image block has its own stored file (§3.3 D). | Crop, stretch, rotate (hidden) |
| Logo | Insert › Logo, or "+ Logo" in the Authors tab (`INSPECTED poster/Sidebar.tsx:730`). One user logo per poster: pressing it again selects that logo (inv 2.1). | Presets with search, My Logos, Upload (inv 2.7). The locked credit mark does not count as the logo (change, see below). | A second logo: use an image block |
| Table | Insert › Table (3 × 3, APA 3-line borders), or paste on the canvas (§3.3) | Type in cells; Tab and arrows move; Tab in the last cell adds a row (change, `PPT`; today it does nothing, `INSPECTED poster/blocks.tsx:628-638`). A paste fills the table and grows it (inv 2.8). Format › Rows and Columns add or remove a row or column at the end (`INSPECTED poster/Sidebar.tsx:3475-3510`; D5). | Insert or delete at a position, merge, border styles, column widths (Later, owner 2026-10-07) |
| References | Insert › References. Content comes from the References tab (inv 2.13, 2.14). | Import `.bib`/`.ris`, paste and Parse, or type 4 fields. Shown in APA 7; sorted A–Z by first author. The style menu is hidden (change; D9). | `.enw` files; in-text citation links; numbered styles (Vancouver, IEEE) |
| Chart | Hidden (D1). Chart blocks already on a poster still draw and print. | — | Making charts in Postr |
| Credit mark | Added automatically and locked (inv 2.17) | Delete refuses it with a toast. The paid PowerPoint export removes it. | — |

**The logo rule and the credit mark.** `addBlock('logo')` selects the first block of type `logo` if one exists (`INSPECTED poster/PosterEditor.tsx:1885-1891`). The credit mark is a locked block of type `logo` (`INSPECTED export/ackBlock.ts:53-55`), added when the editor opens (`INSPECTED pages/Editor.tsx:284`; `stores/posterStore.ts:331`), and no template has a logo block (critique H4, `MEASURED grep`). So on a poster that carries the mark, Insert › Logo can select the mark and add nothing. Rule (change): the one-logo check and the paste rule (§3.3 C) skip locked blocks. Reproduce first: OF-25 says the default poster may not get a mark at all (UNVERIFIED), which would hide this on the default path.

**Title and authors come back through Insert.** Delete removes any block that is not locked (`INSPECTED export/blockLock.ts:66-82`), and Insert has no Title or Authors entry today (`INSPECTED poster/Sidebar.tsx:4164-4172`). After a reload, a deleted title can only return through a layout pick, which replaces every block. Rule (change): Insert lists Title and Authors only while the poster has none. They go where the layouts put them: top, full width (`INSPECTED poster/templates.ts:50-51`). Delete stays plain, as PowerPoint deletes placeholders.

**References.** The parser stores each pasted reference's own text (`INSPECTED apps/api/src/import.ts:71, 1131`; `poster/Sidebar.tsx:1476-1494, 2034`), and every style shows that text verbatim, adding only a number for Vancouver and IEEE (`INSPECTED poster/citations.ts:49-62`). The sort is A–Z for every style (`INSPECTED poster/PosterEditor.tsx:710-712`), so a Vancouver or IEEE list comes out alphabetised and numbered. The style is component state that falls back to APA 7 on reload (`INSPECTED poster/PosterEditor.tsx:713`; reload UNVERIFIED). Rule (change): hide the menu; typed and imported references show in APA 7; pasted ones show as pasted. Nothing is stored, so `PosterDoc` gets no new field. Drop `.enw` from the file picker, since nothing parses it (inv finding 9).

**Check before building** (UNVERIFIED): whether a pasted numbered list ("1. Smith…") keeps its number in the stored text. If it does, the A–Z sort puts the numbers out of order; strip a leading number on paste, as the fallback splitter already does (`INSPECTED poster/Sidebar.tsx:2001`).

**Text editing rules**

| When | Then |
|---|---|
| Enter in a text block | A new line, saved as a line break (change). Today the new line is lost when the block is redrawn from the store, for example after a reload, and exports join the words (OF-01). Likely cause: the typing save calls the cleaner with no line separator (`INSPECTED poster/RichTextEditor.tsx:166-174`), while the paste path passes one (`:251-254`). |
| Enter in a title or heading | Nothing (today, `RichTextEditor.tsx:220-221`). |
| ⌘/Ctrl + B, I, U | Bold, italic, underline. These are the browser's own editing keys (UNVERIFIED in Postr). |
| ⌘/Ctrl + Shift + = and ⌘/Ctrl + = in text | Superscript and subscript, PowerPoint's keys (PPT ref §7; Mac keys `PPT?`). Browsers use ⌘/Ctrl + = to zoom the page; Postr takes the key only while the caret is in text. Whether every browser lets a page take it is UNVERIFIED; where it cannot, the buttons are the way. |
| The format bar over selected text | **B · I · U · x² · x₂ · bullets · numbered · Clear formatting**: 8 buttons instead of 26 (inv 4.9). x² and x₂ are new; today's bar has no sub- or superscript button (`INSPECTED poster/FloatingFormatToolbar.tsx:256-290`), though the cleaner keeps `sub` and `sup` (inv 2.4). Main's bar still has A−, A+ and alignment (`INSPECTED poster/FloatingFormatToolbar.tsx:272-274, 322, 334`); fix 12's branch removes them. |
| A block's height | Follows its text. Text never shrinks to fit (PowerPoint's "Resize shape to fit text", `PPT`). Top and bottom handles are not drawn on text, title, heading, authors, references and table blocks. First reproduce TRIAGE S7, which says a vertical resize of a title, text or table block does nothing today (open-findings §4, end; UNVERIFIED on main). |
| `/` at the start of a word | Opens the symbol menu, 66 entries (inv 2.3). Tab or a click inserts the highlighted symbol. Enter inserts one only after an arrow key has moved in the menu; otherwise Enter closes the menu and makes a new line (change). |
| `/` inside a word ("n/a", "mg/kg") | Just a slash; no menu (change). Today the menu opens on "/" anywhere and Enter inserts the first match (`INSPECTED poster/slashCommand.ts:23, 40`; `RichTextEditor.tsx:212-218`). `MEASURED (probe)`: "n/a" + Enter gives "nα", "w/" gives "wα", "μg/d" gives "μgδ", "see Fig. 2/" gives "see Fig. 2α"; "and/or", "mg/kg", "24/7" and "km/h" are untouched because no symbol starts with those letters. That is the production matcher and filter, not a browser run. |

Out of scope for text: size, font, colour, highlight or alignment on part of a block; strikethrough; indent levels; line spacing; Format Painter; shrink-to-fit; the Format tab's second copy of the text box (inv 2.5).

**Caption rules**

| When | Then |
|---|---|
| A figure or table is on the poster | "Figure N." or "Table N." is numbered in reading order (§3.5). The user types only the words. |
| Where the caption goes | Always above the figure or table. That is the canvas default today (`INSPECTED poster/blocks.tsx:1620`) and APA 7's place (knowledge, not checked). |
| The user wants no caption | One checkbox, "Show caption". |
| A table note | Kept, below the table (inv 2.15). |
| An older block stored left, right or bottom | Still drawn as stored. |

Today the Format tab highlights "Bottom" for a block with no stored position (`INSPECTED poster/Sidebar.tsx:3031, 3122-3124`), while the canvas and the PowerPoint writer draw it on top (`INSPECTED poster/blocks.tsx:1620`; `export/pptx/writer.ts:306`). Hiding the position buttons removes that mismatch. How it looks on screen is UNVERIFIED.

Out of scope for captions: the position buttons, the spacing slider, "✨ Format table/note" (inv 2.15).

### 3.3 Paste, copy, cut and drop

**Copies** (`PPT`): Ctrl/⌘ + C, X, V on objects; pasting a picture makes a picture; pasting Excel cells makes a table; the default paste is "Use Destination Theme".

**Today:** pasted text is cleaned. It keeps bold, italic, underline, strikethrough, sub, sup, lists, colour and highlight, and drops font and size (inv 2.4; `INSPECTED poster/sanitizeHtml.ts:20-29`). A paste into a focused table cell fills the table (`INSPECTED poster/blocks.tsx:818-825`). Blocks cannot be copied or pasted, only duplicated with ⌘D (inv 6.2). Images cannot be pasted or dropped (inv 2.6; `MEASURED grep`, critique: no `onDrop` or `dataTransfer` in `poster/`). An image pasted while the caret is in text is dropped without a word: the paste handler inserts the clipboard's HTML or text, and an image-only clipboard has neither (`INSPECTED poster/RichTextEditor.tsx:239-257`).

**A. Focus is in a text block, a field or a table cell**

| When | Then |
|---|---|
| Any paste with text in it | The field takes it. Postr's block keys do nothing. |
| Text into a text block | The poster's style wins. Keep bold, italic, underline, sub, sup, lists and line breaks. Drop font and size (today) **and colour and highlight** (change, on paste only; stored text is untouched). |
| An image with no text, while editing text | A new image block next to the text block, as B order 3 (change, `PPT?`). The text is unchanged. |

**B. Nothing is in edit mode: ⌘V checks the clipboard in this order. The first match wins.**

| Order | The clipboard holds | Then |
|---|---|---|
| 1 | Postr blocks (the marked payload of table C) | Paste copies (table C). |
| 2 | HTML with a `<table>` in it (Excel, Word and Sheets put one there; knowledge, UNVERIFIED for each) | A new table block, filled by the table's own paste reader (`INSPECTED poster/blocks.tsx:818-825`). |
| 3 | An image file, and no text | A new image block. If an empty image block is selected, fill that one instead. |
| 4 | Plain text, including text with tabs | A new text block holding that text, cleaned as in table A. |
| 5 | Anything else | Nothing. |

Order 2 comes before 3 because Excel also puts a picture of the cells on the clipboard (knowledge, UNVERIFIED), and PowerPoint's default makes a table (`PPT`). Plain text with tabs is not a table: tab-indented prose would otherwise become one.

**Drop:** an image file dropped on empty canvas makes an image block at the drop point. Dropped on an image block, it replaces the image. Files that are not images are skipped with today's message (`INSPECTED poster/blocks.tsx:110-116`). Several images make one block each, each 1 in down and right of the last.

**Image checks:** the same as upload: an image file under 10 MB (`INSPECTED poster/blocks.tsx:97, 107-125`). A new image block takes Insert › Image's default size, and the image keeps its shape inside it.

**C. Copy, cut and paste blocks**

| When | Then |
|---|---|
| ⌘C / Ctrl+C with blocks selected | Copies them to the system clipboard as HTML holding a marked payload (the blocks as JSON in a data attribute), plus the blocks' words as plain text. |
| ⌘X / Ctrl+X | Copies, then deletes as Delete does. The credit mark stays, with today's toast (`INSPECTED poster/PosterEditor.tsx:2217-2224`). |
| ⌘V / Ctrl+V of copied blocks | Copies land 1 in down and right of the originals, as ⌘D's do (`INSPECTED poster/PosterEditor.tsx:1777-1778`). In another poster they land at the same position. |
| The poster already has a title, an authors block or a user logo | That block is not pasted, and a toast says why. ⌘D already refuses title and authors (`INSPECTED poster/PosterEditor.tsx:1773`). The credit mark does not count as a logo (§3.2). |
| How long a copy lasts | Until the next copy anywhere: it is the system clipboard. It survives a reload and works across tabs and posters. |
| Pasting into another app | That app gets the plain text. |

**D. Image files.** Files live at `{userId}/{posterId}/{blockId}.{ext}` and uploads overwrite (`upsert: true`; `INSPECTED data/posterImages.ts:35-53, 120-133`). ⌘D's clone keeps the original's `imageSrc` (`INSPECTED poster/PosterEditor.tsx:1774-1779`), so Replace on the original overwrites the file the copy shows when the extension matches (INSPECTED; UNVERIFIED on screen, where caching may hide it). Rule (change): every upload and Replace writes a new file name (`{blockId}-{short random}.{ext}`), so no two blocks share a file by accident; a paste into another poster copies the file into that poster's folder.

**Bulk control:** none. A paste always takes the poster's style.

**Out of scope:** Paste Options, Paste Special, Keep Source Formatting; pasting blocks into another app as objects; images inside text; pasting PDF or vector files; Ctrl+drag to copy; cleaning up files no block uses any more.

**Check before building** (all UNVERIFIED): whether each browser keeps the custom HTML payload on the clipboard, and whether writing it needs `navigator.clipboard.write` (with its permission rules) when no text is selected; and OF-21, an upload race that may overwrite edits, since paste and drop make uploads more frequent.

### 3.4 Select, move, resize, rotate

**Copies** (`PPT`): click, Shift-click and box-select; Esc; Ctrl+A; arrow keys and Ctrl+arrow; handles with Shift; Ctrl+D; Delete.

**The key rule comes first.**

| When | Then |
|---|---|
| Focus is in a text field (`INPUT`, `TEXTAREA`, `SELECT`, or editable text) | Keys go to the field. Delete, arrows, ⌘D, ⌘A, ⌘C/X/V and Esc's deselect do nothing to blocks. Today's guard leaves out `SELECT` (`INSPECTED poster/PosterEditor.tsx:2204-2209`), so Backspace on a focused menu deletes the selected block (OF-11). The owner parked that fix on 2026-09-30; it is one word in this rule. |

**Then the gestures.**

| Gesture | Result |
|---|---|
| Click | Selects. On a text block it also places the caret (inv 3.1). |
| Shift, ⌘ or Ctrl + click | Adds or removes a block (inv 3.1). |
| Drag on empty canvas | Selects the blocks the box touches (today; `INSPECTED poster/PosterEditor.tsx:2821`). PowerPoint selects only blocks wholly inside (`PPT`). Kept: the user sees the result at once. |
| Click on empty canvas | Deselects (inv 3.1). |
| Esc | Change: inside text, leave the text and keep the block selected; otherwise deselect (`PPT`). Today nothing deselects on Esc: `MEASURED (grep)`, "Escape" is handled only for the slash menu, menus and area comments (`RichTextEditor.tsx:207`, `blocks.tsx:665, 1327`, `PosterEditor.tsx:3978`). |
| ⌘A / Ctrl+A outside text | Change: selects every block except the locked credit mark. Today there is no handler: `MEASURED (grep)`, no `key === 'a'` in `PosterEditor.tsx` or `blocks.tsx`. |
| Drag a block | Moves it. It lands on the grid (§3.5). |
| Arrow key | Moves ½ in (today, `INSPECTED poster/PosterEditor.tsx:2235`). |
| ⌘ or Ctrl + arrow | Moves 0.1 in, PowerPoint's fine nudge (change). Today Shift + arrow is the fine nudge and ⌘/Ctrl are ignored, so ⌘/Ctrl + arrow moves ½ in (`INSPECTED poster/PosterEditor.tsx:2235-2243`). Which key Mac PowerPoint uses is `PPT?`; check it before building and use that one. |
| Shift + arrow, Alt/⌥ + arrow | Nothing (change). PowerPoint resizes and rotates with them (`PPT?`); Postr leaves both out, so by principle 1 they do nothing. On Windows, Alt + Left is also the browser's Back. |
| Drag a handle | Resizes. Shift keeps the shape; images always keep it (inv 3.4). |
| Several blocks selected | They move and resize together, as one undo step (item 6, OF-06). |
| ⌘D / Ctrl+D | Duplicates one block, 1 in down and right (`INSPECTED poster/PosterEditor.tsx:1770-1779`). An image copy gets its own file (§3.3 D). |
| Delete / Backspace | Removes the selection, except the credit mark (`INSPECTED poster/PosterEditor.tsx:2217-2224`). A deleted title or authors block comes back through Insert (§3.2). |
| Rotate | Hidden: no handle. A stored rotation still draws (`INSPECTED packages/shared/src/types/poster.ts:206`). |
| Right-click a block | **Cut · Copy · Paste · Duplicate · Bring to Front · Send to Back · Delete**, on every kind (change). While editing text or a table cell, the browser's own menu appears. Today the block menu skips title, text, heading, authors and table (`INSPECTED poster/blocks.tsx:2077-2091`) and offers only one-step Bring Forward and Send Back (`INSPECTED poster/blocks.tsx:2723-2738`). |

**Out of scope:** Tab to step through blocks; the Selection Pane; Group and Ungroup (Ctrl+G); resizing and rotating from the keyboard; typed size and position fields; ⌘D on several blocks (⌘C/⌘V covers it); crop; stretch.

### 3.5 Reading order, snap and Auto-Arrange

**Copies** (`PPT`): snap to grid; Home › Layout. PowerPoint has no auto-numbered headings and no Auto-Arrange; these are Postr's own, so they get the plainest rules.

**Today, three orders disagree.**
- Heading numbers follow the order of the `doc.blocks` array (`INSPECTED poster/PosterEditor.tsx:1475-1497`; the exports use the same rule, `export/posterContent.ts:51-63`).
- "Figure N." and "Table N." follow top edge, then left edge (`INSPECTED poster/PosterEditor.tsx:1523-1540`; `export/posterContent.ts:36-47`). So a 3-column poster numbers its figures across the columns, not down them.
- The array is also paint order: Bring Forward moves a block one place in it (`INSPECTED poster/PosterEditor.tsx:1789-1800`). So the planned Bring to Front / Send to Back on a heading would renumber every heading (critique H2).
- Auto-Arrange rewrites the array in top-then-left order (`INSPECTED poster/autoLayout.ts:203, 306`; `PosterEditor.tsx:2076`), and a heading pulls the next block in that order into its column (`INSPECTED poster/autoLayout.ts:312-336`). `MEASURED (probe)`, today's `autoLayout()` on the default 3-Column Classic 48 × 36 poster: the Introduction, Methods and Results headings stack in column 1 (y = 60, 90, 115 units), with Introduction's text below them at y = 145, and Hypotheses goes from section 2 to section 5. 4 of the 4 templates with headings end with one heading directly above another. 3 of them (2-Col Wide Figure, Billboard, Sidebar + Focus) squeeze wide blocks to one column: the 2-column figure from 460 to 110 units wide. The welcome poster renumbers like 3-Column Classic. The probe used stored heights; the editor measures text first (`INSPECTED poster/PosterEditor.tsx:2062-2075`), which changes heights only, and neither the sort nor the heading pull reads heights, so the stacking and renumbering hold either way (INSPECTED).
- Pasted and duplicated headings are appended to the array, so they take the last number wherever they land (`INSPECTED poster/PosterEditor.tsx:1780`).

**A. The reading order (change).** One rule, used by heading numbers, figure and table numbers, and Auto-Arrange, in the editor and in every export.

| Step | Rule |
|---|---|
| Which blocks | Every block except the title, the authors block and the credit mark. |
| Wide blocks | A block at least 90 % as wide as the space inside the margins is a band of its own. Wide blocks split the poster into bands, by top edge. |
| Columns | Inside a band, blocks whose left edges are within 3 in of each other form a column. (3 in is Auto-Arrange's existing tolerance, `INSPECTED poster/autoLayout.ts:30`.) |
| Order | Bands top to bottom. Inside a band, columns left to right. Inside a column, top edge first. |
| When numbers change | Live, as figure numbers do today. A heading moved to another column, or pasted, takes its number from where it sits. |
| What it does not touch | Paint order. Bring to Front and Send to Back move a block in the array only, and never change a number. |

`MEASURED (probe)`: this rule gives the same heading order the templates' authors wrote into the array on 6 of 6 layouts (the 5 templates and the welcome poster). A first try that called any block wider than half the space "wide" got Sidebar + Focus wrong (its 70 % main column is a column, not a band), which is why the threshold is 90 %. The probe tested only these layouts, not posters users have rearranged. The code's own comment says two earlier position rules broke on templates (`INSPECTED poster/PosterEditor.tsx:1475-1486`); a unit test must hold the 6 layouts to their template order.

**B. Snap and guides**

| When | Then |
|---|---|
| A block is dragged or resized | Its edges land on the ½ in grid. The code snaps within 0.3 in (`INSPECTED poster/snap.ts:11-16`; `poster/constants.ts:60-63`), but no point is more than 0.25 in from a ½ in grid line, so every drag lands on the grid (`MEASURED (probe)`: 0 of 50,001 positions from 0 to 50 in left off the grid). The 0.1 in nudge (§3.4) is the only way off it. |
| While dragging | Guides show the block's own edges and centres and the sheet's centre (inv 3.3). Unchanged. |

**C. Auto-Arrange: tidy within columns (change; D6)**

| # | When | Then |
|---|---|---|
| 1 | The user presses Auto-Arrange (Design › Layout) | Title and authors go to the top, full width (today, `INSPECTED poster/autoLayout.ts:118-127`). |
| 2 | Bands and columns | Read the body in reading order (A). Wide blocks stay full width and keep their place between bands. Every other block stays in its column. The number of columns does not change. |
| 3 | Inside each column | Blocks stack top to bottom in reading order, 0.6 in apart (`GAP` = 6 units, `INSPECTED poster/constants.ts:57`), from the top of their band. Every block takes the width of the column's widest block. Images keep their shape. Text-like blocks take their measured height (today's measurement, `INSPECTED poster/PosterEditor.tsx:2062-2075`). |
| 4 | Bands | Each band starts 0.6 in below the tallest column of the band above, or below the authors block. |
| 5 | It does not fit | Auto-Arrange steps text down as A− does (§3.7), one step at a time, and tidies again, until it fits or the bottom step is reached. The toast names the size it chose (D7). |
| 6 | Still too tall at the bottom step | Blocks stay where they were tidied. Issues lists the overflow (§3.12). |
| 7 | Undo | One step, text steps included. Today it takes 3 when type is shrunk (OF-20). |
| 8 | Positions | Everything lands on the grid. |

Because blocks never change column and keep their order, Auto-Arrange never changes a number.

| When | Then |
|---|---|
| A layout is picked | §3.1, rule 4. |
| Bring to Front / Send to Back | Moves the block to the top or bottom of the paint order (change). Today the menu moves it one place (`INSPECTED poster/PosterEditor.tsx:1789-1800`). Numbers do not change (A). |

**Bulk control:** the layout pick and Auto-Arrange.

**Out of scope (Later):** moving blocks between columns to even them out (D6); changing the number of columns; Align and Distribute; smart guides to other blocks; grid settings; the visible grid (hidden); rulers (already hidden, `INSPECTED config/features.ts:67`); groups that are saved.

### 3.6 Theme: palette and font

**Copies** (`PPT`): Design › Themes and Variants › Colors / Fonts. Text set in theme colours follows a theme change.

**Today:** 8 palettes (inv 4.1) and 10 fonts in one list (`INSPECTED poster/constants.ts:197-208`). One font per poster (`INSPECTED packages/shared/src/types/poster.ts:351-366`). Colour can also be set in five other places (inv §4, intro).

| When | Then |
|---|---|
| The user picks a palette | Every block's colours change at once, as one undo step. Colour and highlight set on a text level are cleared in the same step, so the theme wins (change). Today a palette pick replaces only the palette (`INSPECTED stores/posterStore.ts:417-418`), so a level colour stays until "Reset to palette" (inv 4.8). |
| The user picks a font | All text changes, as one undo step. |
| Defaults | Classic Academic (`INSPECTED pages/Editor.tsx:43-50`) and the poster's stored font. |
| A palette is not colour-blind safe | A badge says so (inv 4.1). Information only. |
| An older poster used a custom palette | It keeps its colours: a poster stores the palette's values, not its name (`INSPECTED pages/Editor.tsx:45-50`). |
| Colour inside text from older edits | Still drawn. Clear formatting removes it. |

**Bulk control:** palette (1 of 8) and font (1 of 10). Two pickers, not PowerPoint's one Themes gallery; one list that sets both is Later (D10).

**Out of scope (hidden):** the custom palette designer (inv 4.2); Copy a design (4.3); style presets (4.7); heading style (4.6); the per-level colour picker (4.8); text colour and highlight in the format bar (4.9). **Later:** one theme list that sets palette and font together; a heading font paired with a body font.

### 3.7 Text size: one control for the whole poster

**Copies** (`PPT`): Home › Increase and Decrease Font Size (A▲ A▼), and the Slide Master's text levels. In Postr no block stores its own size (PPT ref §7: `INSPECTED packages/shared/src/types/poster.ts:175-278`), so a level change reaches every block.

**Today:** four levels (title, heading, authors, body), each with size, weight, italic and line height: 16 controls (inv 4.5). Defaults: title 14 units ≈ 101 pt, heading 8 ≈ 58 pt, body 5 ≈ 36 pt, authors 5 ≈ 36 pt (`INSPECTED poster/constants.ts:270-293`; 1 unit = 7.2 pt, `:39`). The Format tab's size field also changes the whole level (`INSPECTED poster/Sidebar.tsx:2793-2817`), though the panel is headed "Editing: {block type}" (`:3948`). Auto-Arrange shrinks body and heading by a free factor, never below 3 units ≈ 22 pt, and leaves title and authors alone (`INSPECTED poster/autoLayout.ts:213-231`). The code's readability guideline is title 72 pt, heading 42 pt, body 24 pt at least (`INSPECTED poster/constants.ts:29-35`, a comment, not enforced). The welcome poster's title is 146.0 pt (`MEASURED (probe)`: 20.28 units in `public/seeds/welcome-cat-poster.postr`).

**The control:** **[A−] Body 36 pt [A+]**, in the top bar (D2) or at the top of Design.

**The body sizes:** 28 · 32 · 36 · 40 · 44 · 48 pt. Default 36 pt (today's).

| When | Then |
|---|---|
| A+ or A− | The body moves to the next size up or down. Title, heading and authors are multiplied by the same ratio (new body ÷ old body), so their proportions stay. Sizes are not rounded, so A+ then A− returns exactly. One undo step. |
| The body is between two sizes, or outside them (older posters, or a size set by hand) | A+ goes to the next size above it, A− to the next size below it. At 48 pt or more, A+ is greyed; at 28 pt or less, A− is greyed. |
| What it shows | The body size, always. There is no "Custom" state. |
| "Sizes by level" (folded, in Design) | Today's four size fields (inv 4.5). Editing one changes only that level, and so changes the ratios A± keeps from then on. This is how a long title is made smaller on its own. |
| Auto-Arrange cannot fit the blocks | It presses A− for the user (§3.5 C; D7). |
| A text block is selected | The Format tab, if opened, says one line: "Body text · 36 pt · the same for all body text. Change it with A− / A+", with a link. It replaces today's font controls there (inv 4.8). |
| Weight, italic, line height | Hidden. Stored values still draw (defaults `INSPECTED poster/constants.ts:281-293`). |
| What wins | The last action. |

At today's default ratios (title 2.8 × body, heading 1.6 × body), the bottom size gives title 78.4 pt, heading 44.8 pt, body 28 pt, all above the guideline; the top gives 134.4 / 76.8 / 48 pt (arithmetic). On the welcome poster, A+ takes the title from 146.0 to 162.2 pt (arithmetic). A poster whose ratios were set by hand can still go below the guideline at the bottom size; that is out of scope.

**Bulk control:** the whole scale.

**Out of scope:** size per block or per word; ⌘⇧> and ⌘⇧< (left doing nothing: in PowerPoint they size the selection, so binding them to the whole poster would change their meaning); sizes that follow the sheet size; enforcing the guideline on hand-set ratios.

### 3.8 Undo and redo

**Copies** (`PPT`): Ctrl+Z and Ctrl+Y; one history for typing and objects; Undo and Redo on the Quick Access Toolbar. Mac keys ⌘Z, ⌘Y, ⌘⇧Z (`PPT?`).

**Today on main:** 50 steps, keyboard only. Inside a text field the browser's own, separate undo runs (`INSPECTED poster/PosterEditor.tsx:993-1012`; inv 6.1). Fix 12, on branch `fix/12-one-undo-history` and not merged, gives one history of 100 steps and adds the buttons (open-findings §3.1).

| When | Then |
|---|---|
| ⌘Z / Ctrl+Z | Undo, anywhere, including inside text (fix 12). |
| Redo | Mac: ⌘⇧Z and ⌘Y. Windows: Ctrl+Y and Ctrl+Shift+Z. On a Mac, Ctrl+Y is left to the system's text "yank" (change to fix 12, U-5). Main treats Ctrl+Y and ⌘Y as redo on every system (`INSPECTED poster/PosterEditor.tsx:1001-1005`). |
| What one step is | Typing is grouped by word (fix 12). Every drag is one step, group drags included (item 6, OF-06). Every bulk action is one step: palette, font, A+ or A−, layout, Auto-Arrange with its text steps, sheet size. |
| The buttons | Undo and Redo in the top bar, greyed out when there is nothing to undo or redo. |
| After a mouse click on Undo or Redo | Focus goes back to where it was, so arrows and Delete work at once (U-4). After a keyboard press, focus stays on the button (U-3). |
| An empty history | Buttons greyed; the key does nothing. |

**Out of scope:** the undo dropdown; repeat (F4); history across a reload or across posters; keeping history across an import (import is hidden, D3).

### 3.9 Saving

**Copies** (`PPT`): AutoSave and the "Saved" note in the title bar; Ctrl+S saves.

**Today:** autosave 800 ms after the last change, with a Saving… / Saved / Save failed pill (inv 6.3). A failed save counts as saved and is not retried unless the user edits again (OF-05). ⌘S inserts an unnamed version each time (`INSPECTED poster/PosterEditor.tsx:1215-1231` → `data/posterVersions.ts:68-91`). The 20-version cap is only on the Versions tab's button (`INSPECTED poster/VersionPanel.tsx:89`; `data/posterVersions.ts:42`). The database refuses a 31st version (`INSPECTED supabase/migrations/20260702000000_poster_versions.sql:84-85`), and Restore first saves a "Before restore" version and stops if that fails (`INSPECTED poster/PosterEditor.tsx:1195-1207`). So a PowerPoint hand that presses ⌘S by reflex can fill the store and stop Restore (INSPECTED; the Restore failure is UNVERIFIED in a browser).

| When | Then |
|---|---|
| After each change | Save 800 ms after the last change. Unchanged. |
| A save fails | The change stays pending. Postr retries after 2, 5, 10 and 30 s, then every 30 s while the tab is open, and at once when the browser reports it is back online. A new edit restarts the wait. The pill says "Not saved, retrying". Closing the tab while unsaved warns (change; OF-05). |
| ⌘S / Ctrl+S | Saves now: writes any pending change at once and shows "Saved" (change; D8). It uses autosave's existing `flushNow` (`INSPECTED hooks/useAutosave.ts:40`). It still swallows the browser's save dialog. It no longer makes a version. |
| Versions tab | "Save version" makes a version, up to 20 (today). Restore or delete. Restoring first saves the current state (inv 6.4). The database's 30 leaves room for 10 "Before restore" saves. |
| The same poster is open in two tabs | A banner warns; the last write wins (inv 6.5; OF-22). |

**Out of scope:** offline editing; merging edits from two tabs; automatic version checkpoints (open-findings §4, end, F4); more than 30 versions.

### 3.10 Export and print

**Copies** (`PPT`): File › Export › Create PDF; File › Print (Ctrl+P).

**Today:** "⎙ Save PDF" opens a print window sized to the poster. The print window then asks for 4 print-dialog choices: Save as PDF, the paper size, no margins, and "Background graphics" (`INSPECTED export/printDocument.ts:212-219`), and the sidebar's steps disagree with the print window's (inv 7.1). The print page sets `@page` size and zero margins (`INSPECTED export/printDocument.ts:81-84`) but not `print-color-adjust` (`MEASURED (grep)`: 0 hits in `apps/web/src`). ⌘P has no handler and the editor has no print stylesheet (`MEASURED (grep)`), so ⌘P prints the editor page, sidebar included. Printing from Preview runs a long title into the authors (OF-07). A selected block's handles are copied into the print document (OF-08). PowerPoint export is paid (inv 7.2). Save PDF needs no account; only editable exports gate guests (critique, `INSPECTED EditableExportButtons.tsx:108-114`).

| When | Then |
|---|---|
| Save PDF (top bar or Export), Preview › Print / Save PDF, or ⌘P / Ctrl+P in the editor | All call one print function (change; OF-07, and ⌘P is new). |
| Before printing | The selection is cleared (change; OF-08). The editor stays visible while Postr measures. |
| The print page | Its page is the poster's size (inv 7.1). It sets `print-color-adjust: exact` (and the `-webkit-` form), so backgrounds print without the "Background graphics" box (change; knowledge, UNVERIFIED per browser). |
| The print window | It holds the only list of print-dialog steps: Save as PDF, Margins None, and the paper size if the dialog asks. The sidebar says one line: "Your browser's print window opens. Choose Save as PDF." |
| The browser blocks the window | Today's alert (inv 7.1). Unchanged. |
| The credit line | On every free PDF (inv 7.1). Unchanged; owner policy (OF-16). |
| PowerPoint (.pptx) | Paid. Unchanged: posters over 56 in on a side export at half size; over 112 in the button is off (inv 7.2). |

**Check before building** (UNVERIFIED): which of Chrome, Edge, Safari and Firefox make a PDF page of the poster's size, and whether Chrome still offers a paper size once `@page` size is set. Write the result into the print window's steps; the docs record none.

**Out of scope:** a PDF file made without the print dialog; PNG; print-shop help (the Staples button, hidden by this doc; today it is in Export, `INSPECTED poster/Sidebar.tsx:1202-1213`); bleed and crop marks; LaTeX (already hidden, `INSPECTED config/features.ts:84`); `.postr` backup (D3).

### 3.11 The in-editor figure check: kept, rebuilt as a bounded rule table

Correction (lead, 2026-10-07): an earlier draft hid this on the reading that the owner had stopped the readability check. He had not: asked directly, he chose to keep the check and finish its simple rebuild (item 13 part 2, stream P). The Figure tab's "Check a figure" stays, and runs the rebuilt checker:

| Step | Rule |
|---|---|
| Read | A short, documented regex rule table of the settings that decide printed text size (Python: figure size, save settings, `font.size` and the per-element sizes under any rcParams spelling, seaborn's theme and context, `fontsize=` on labels, titles, ticks and legends, simple constant names; R: `ggsave` size, `theme_*(base_size)`, the `theme(text=, axis.title=, …)` sizes). |
| Order | By position: the last setting that applies wins, with the few override rules written down (a later complete theme resets an earlier `theme()`; seaborn's theme resets per-element sizes set before it). |
| Missing | A setting not found is a warning that shows the default assumed, and the generated script sets it explicitly. |
| Output | A complete script, "Replace your code with this version": values changed where they take effect, missing ones added, the figure saved at a fixed size so printed size = font size × print/canvas ratio holds. |
| Input | Ordinary working code with only the font or canvas size wrong; loops, `rc_context` scoping and exotic setups are out of scope (listed, not handled). |

"🔎 Scan image" (reading text sizes off an uploaded image) is outside the blank-to-export path: HIDE with the adjustments (D4). If D1 hides chart blocks, the Figure tab keeps only "Check a figure". The standalone plot checker page is outside this doc.

### 3.12 Issues: the pre-flight list

**Copies:** nothing; PowerPoint has no pre-flight check. The Issues tab is the one place a user learns what is still unfinished (inv 5.1).

| A block … | Issues says | Status |
|---|---|---|
| Overflows, overlaps another, or leaves the sheet | Today's messages (inv 5.1, 5.2). | Unchanged |
| An image block with no file | "Image block has no file attached…" (`INSPECTED poster/PosterEditor.tsx:1609-1618`) | Unchanged |
| The title is empty or "Your Poster Title" | "Poster title is still the default placeholder." (`INSPECTED poster/PosterEditor.tsx:1619-1630`) | Unchanged |
| A heading or text block is empty | Info: "Empty block: type in it or delete it." An empty heading would print its number alone (`INSPECTED poster/blocks.tsx:2252`). | Change |
| A text or heading block still holds template or Insert text: "Enter your text here.", "Section Title", or a template guidance sentence | Info: "This block still has the template's text." It compares with the strings in `poster/templates.ts` and `PosterEditor.tsx:1903`, so older posters are covered. Today only "Enter your text here." is checked (`INSPECTED poster/PosterEditor.tsx:1632-1645`). | Change |
| A table whose cells all still equal the template's sample (`INSPECTED poster/templates.ts:73`) | Warning: "This table still has the sample numbers." | Change |

**Out of scope:** spelling; a readability score; checking text against the guideline sizes.

---

## 4. Every editor feature: keep, simplify, hide or Later

KEEP = in the MVP as it is. SIMPLIFY = in the MVP, cut down or fixed as stated. HIDE = behind a switch, code kept (§5.2 names the switches). LATER = on the Later list. ADD = missing today, built for the MVP. "Today" for each row is the inventory row named in the first column.

| inv | Feature | Verdict | How, and why |
|---|---|---|---|
| 1.1 | "+ New poster", `/p/new` | KEEP | Step 1. |
| 1.2 | Default contents (3-Column Classic, Classic Academic, 48 × 36) | SIMPLIFY | Text starts empty with grey prompts; the title starts empty (§3.1). |
| 1.3 | Welcome sample poster | KEEP | Automatic; shows a finished poster. Built through the importer, which stays (§5.2). |
| 1.4 | Poster name field | KEEP | Moves to the top of Design. |
| 1.5 | Import tile (layout tab) | HIDE | Not on the blank path (D3). |
| 1.6 | Dashboard "Import…" | HIDE | As 1.5 (D3). |
| 1.7 | Poster size | KEEP | Needed for export. |
| 1.8 | Auto-Arrange | SIMPLIFY | Tidies within columns in reading order; never renumbers; shrinks type only through A−; one undo step (§3.5 C). |
| 1.9 | Templates (5) | KEEP | The one layout choice. |
| 1.10 | Duplicate this poster (editor) | HIDE | The dashboard keeps Duplicate (`pages/Home.tsx:92-95`). Removes the "Open copy" path behind OF-03 and OF-04 (§5.3). |
| 1.11 | Back to My Posters, logo link | KEEP | Navigation. |
| 1.12 | Onboarding tour | SIMPLIFY | Drop the Import, figure-check and guidelines steps; retitle "Export, print, or save .postr" (`OnboardingTour.tsx:92`) to "Export and print"; follow the tab renames. |
| 2.1 | Insert tab, 7 buttons | SIMPLIFY | 6 buttons: Chart hidden (D1). Title and Authors appear only while missing (§3.2). |
| 2.2 | Typing title, heading, text | SIMPLIFY | Fix Enter (OF-01); blocks start empty with prompts that are actually drawn (§3.1). |
| 2.3 | Slash symbols | SIMPLIFY | Opens only at the start of a word; Enter takes a symbol only after an arrow key (§3.2). |
| 2.4 | Pasting into text | SIMPLIFY | Also drop pasted colour and highlight; an image pasted into text becomes an image block (§3.3). |
| 2.5 | Format tab's second text box | HIDE | Duplicates typing on the canvas. |
| 2.6 | Image upload | KEEP | Add paste and drop; one file per block (§3.3). |
| 2.7 | Logo picker | KEEP | MVP list. The one-logo check skips the credit mark (§3.2). |
| 2.8 | Table insert, cells, paste | SIMPLIFY | Tab in the last cell adds a row (§3.2, D5). |
| 2.9 | Table rows and columns on the canvas (strips, hover bars, right-click items, border drag) | LATER | Owner, 2026-10-07. The Format tab's end-only Rows/Columns buttons stay (D5). |
| 2.10 | Chart, "Make a figure" | HIDE | D1. |
| 2.11 | Authors and institutions | KEEP | MVP list. |
| 2.12 | Paste authors, "✨ Parse" | KEEP | Saves typing; no decision. |
| 2.13 | References tab | SIMPLIFY | Style menu hidden (APA 7; pasted text as pasted); drop `.enw` (§3.2, D9). |
| 2.14 | References block | KEEP | MVP list. |
| 2.15 | Captions | SIMPLIFY | Text, table note and "Show caption" only; position fixed above; numbered in reading order (§3.2, §3.5). |
| 2.16 | Heading numbers | SIMPLIFY | Numbered in reading order, not array order (§3.5 A). |
| 2.17 | Credit mark | KEEP | Automatic. |
| 3.1 | Select | KEEP | Add Esc and ⌘A (§3.4). |
| 3.2 | Move, arrow nudge | SIMPLIFY | ⌘/Ctrl + arrow is the fine nudge; Shift and Alt + arrow do nothing (§3.4). |
| 3.3 | Snap to grid | KEEP | Every drag lands on the ½ in grid (§3.5 B). Snap to other blocks is Later. |
| 3.4 | Resize | KEEP | Top and bottom handles off for text-like blocks, once S7 is reproduced (§3.2). |
| 3.5 | Rotate | HIDE | Posters rarely turn blocks; retires C-4, C-10 and part of C-2. |
| 3.6 | Crop | HIDE | An adjustment; users crop before pasting. Retires U-9 and parts of C-2 and C-6. |
| 3.7 | "Stretch to fit block" | HIDE | Images always keep their shape. |
| 3.8 | Move and resize several blocks | KEEP | PowerPoint users expect it. Fix item 6 (OF-06). |
| 3.9 | Bring Forward / Send Back | SIMPLIFY | Bring to Front / Send to Back, in the menu on every block kind; paint order only (§3.4, §3.5). |
| 3.10 | ⌘D duplicate | KEEP | An image copy gets its own file (§3.3 D). |
| 3.11 | Delete | KEEP | — |
| 3.12 | Align and distribute (missing) | LATER | Grid snap, layouts and Auto-Arrange do the MVP's aligning. |
| 3.13 | Show grid | HIDE | Snapping works without it. Hidden means off: no grid drawn. |
| 3.14 | Rulers | HIDE | Already off (`features.ts:67`); stays parked. |
| 3.15 | Zoom | KEEP | A 48 in sheet cannot be edited at 100 %. |
| 3.16 | Show / hide sidebar | KEEP | Navigation. |
| 3.17 | Layout (Auto-Arrange, templates) | — | See 1.8 and 1.9. |
| 4.1 | Palette | KEEP | Theme (§3.6). |
| 4.2 | Custom palettes | HIDE | Customisation; stored only in one browser (inv 4.2). |
| 4.3 | Copy a design | HIDE | Customisation; the palette list covers it. |
| 4.4 | Font family | KEEP | Theme (§3.6). |
| 4.5 | Typography per level (16 controls) | SIMPLIFY | A−/A+ over six body sizes, other levels by ratio; the 4 size fields folded under "Sizes by level"; weight, italic and line height hidden (§3.7). |
| 4.6 | Heading style | HIDE | Default stays: bottom border, left. |
| 4.7 | Style presets | HIDE | One poster style is enough; stored only in one browser (inv 4.7). |
| 4.8 | Format tab font controls | HIDE | Replaced by a line naming the level and a link to A−/A+ (§3.7). |
| 4.9 | Format bar (26 controls) | SIMPLIFY | 8 buttons: B, I, U, x², x₂, bullets, numbered, Clear (§3.2). |
| 4.10 | A−, A+ and alignment leave nothing | — | Still on main (`FloatingFormatToolbar.tsx:272-274, 322, 334`); fix 12's branch removes them. Settled when fix 12 merges. |
| 4.11 | Table borders | HIDE | New tables stay APA 3-line; stored borders still draw. |
| 4.12 | Chart series palette | HIDE | Goes with charts (D1). |
| 4.13 | Auto-Arrange shrinking type | SIMPLIFY | Through A− only, never below body 28 pt (§3.5 C, §3.7; D7). |
| 5.1 | Issues tab | SIMPLIFY | Adds empty blocks, template text and sample numbers (§3.12). |
| 5.2 | Out-of-bounds banner | KEEP | Automatic. |
| 5.3 | Figure tab, "Check a figure" | KEEP (rebuilt) | The bounded rule-table checker (§3.11); "Scan image" hidden (D4). |
| 5.4 | Guidelines panel | HIDE | Reference reading, not a blank-to-export step (D4). Retires C-11, C-13. |
| 5.5 | Preview | KEEP | One print path (§3.10). |
| 6.1 | Undo and redo | KEEP | Fix 12 in flight (§3.8). |
| 6.2 | Copy and paste blocks (missing) | ADD | MVP list ("undo/paste"); PowerPoint habit (§3.3). |
| 6.3 | Autosave and status pill | SIMPLIFY | Retry on failure (OF-05); ⌘S saves now (§3.9). |
| 6.4 | Versions | SIMPLIFY | Made only from the Versions tab, not by ⌘S (§3.9; D8). |
| 6.5 | Two-tab and leave warnings | KEEP | Automatic. |
| 7.1 | Save PDF | SIMPLIFY | One print path for every entry, ⌘P included; backgrounds print by themselves; one set of steps; nothing selected (§3.10). |
| 7.2 | PowerPoint (.pptx), paid | KEEP | The way back to PowerPoint. |
| 7.3 | LaTeX | HIDE | Already off (`features.ts:84`). |
| 7.4 | Save as `.postr` | HIDE | A backup with no import is a dead end (D3). |
| 7.5 | "Email the PDF to Staples" | HIDE | Print-shop help, after export (D4). |
| 7.6 | Publish to gallery | HIDE | Already off (`features.ts:21`). |
| §8 | Comments, share link, Review tab | HIDE | Already off (`features.ts:53`; Review commented out, `Sidebar.tsx:642`). |

**Gaps the MVP adds** (none exists today): paste and drop of images (inv 2.6); copy, cut and paste of blocks (inv 6.2); Esc and ⌘A (§3.4); x² and x₂, as buttons and keys (§3.2); the A−/A+ text-size control (§3.7); Bring to Front / Send to Back (§3.4); ⌘P (§3.10); Tab in a table's last cell adds a row (§3.2); Insert › Title and Authors while missing (§3.2); grey prompts that are actually drawn (§3.1).

**Gaps left for Later:** Align and Distribute; smart guides to other blocks (inv 3.3, 3.12); evening out columns (D6); ⌘D on several blocks; Tab to step through blocks; numbered reference styles.

---

## 5. What this means for the open work

### 5.1 MVP blockers, ranked by how much they block blank to export

| Rank | Finding | Why it blocks | Step | Next |
|---|---|---|---|---|
| 1 | **OF-01** Enter in a text block is not saved | Every multi-paragraph section runs together after a reload and in exports. Almost every poster has one. | 3 | Not in main's PLAN.md (open-findings §4). Add it as a plan item. Likely cause R3, `RichTextEditor.tsx:166-174` vs `:251-254`. |
| 2 | **OF-05** A failed save counts as saved (item 8) | Any network blip can lose work with no warning. | All | Item 8. Cause R2 (`useAutosave.ts:206-209`, per OF-05). Retry rule in §3.9. |
| 3 | **Template text is stored as content** (critique H1; new to the plan) | On every new poster, each block must be cleared before typing, and guidance sentences or the sample table's made-up numbers left in place reach the PDF with no warning. | 3, 4 | §3.1 and §3.12. INSPECTED; reproduce on screen, including whether empty blocks show any prompt today. |
| 4 | **OF-07** Printing from Preview runs the title into the authors (item 5) | A wrong PDF, from the first button the Export tab offers. | 7 | Item 5. Rule: one print path (§3.10). |
| 5 | **Auto-Arrange stacks headings and renumbers sections** (new in this revision) | On the default poster it puts three headings in a row above one text and turns section 2 into 5 (`MEASURED (probe)`, §3.5). Undo restores it, but the bulk layout tool the direction leans on gives a wrong layout. | 6 | Reproduce in the editor (the probe skipped the height measurement), then build §3.5 A and C together. |
| 6 | **OF-06** A group move cannot be undone (item 6) | Multi-select stays and undo is MVP, so this is a hole in the safety net. | 6 | Item 6, right after fix 12 (the plan calls it a three-line change). |
| 7 | **OF-08** A selected block's handles are copied into the print document | May print controls on the poster. Whether they reach the PDF was not measured. | 7 | Reproduce in the PDF first. Rule: clear the selection (§3.10). |
| 8 | **Insert › Logo may select the credit mark** (critique H4) | Logo is on the MVP list; the button may add nothing. | 2 | Reproduce first (OF-25 may hide it on the default poster). Rule in §3.2. |
| 9 | **Slash menu takes Enter after an ordinary slash** (critique M11) | "n/a" + Enter becomes "nα" at the function level. | 3 | Reproduce in a browser. Rule in §3.2. |
| 10 | **OF-21** Image upload may overwrite edits | Image paste and drop will make uploads more common. | 4 | Reproduce before paste and drop ship (PLAN.md says the same). |
| 11 | **⌘S fills the version store** (critique H3) | After 30 versions, ⌘S fails and Restore stops. Rare, but PowerPoint hands press ⌘S constantly. | All | Rule in §3.9. Restore failure UNVERIFIED in a browser. |
| 12 | **OF-14** The 3-column layout overflows sheets under about 30 in tall | Only custom sizes: no preset is that short (`INSPECTED poster/constants.ts:80-89`). | 1 | Re-check under the new Auto-Arrange rule. |

Each fix follows the house order: reproduce, state the cause, look for siblings, fix, audit. Ranks 3, 5, 8, 9 and 11 come from this doc's code reading and probes; none has been reproduced in a browser.

**One shared cause, five symptoms.** Ranks 5 and the z-order problem (critique H2), pasted headings taking the last number, figures numbered across columns (critique L1), and Auto-Arrange squeezing wide blocks share one cause: the poster has no single reading order (§3.5). Build §3.5 A once and test all five against it.

### 5.2 The MVP build list (the design changes), in order

| # | Change | Section |
|---|---|---|
| 1 | Add the hide switches below, each with a header comment like the gallery's (`features.ts:1-21`): what is off, what stays, the value each hidden control stays at, and what turning it back on needs. Like the LaTeX switch, add a test that fails if a hidden control comes back while its switch is off (`features.ts:69-83`). | §1, §4 |
| 2 | Fix Enter (OF-01). | §3.2 |
| 3 | Saving: retry a failed save (OF-05); ⌘S saves now. | §3.9 |
| 4 | Starting text: empty title and text blocks, the `prompt` field, the CSS rule that draws prompts, the three new Issues rows. | §3.1, §3.12 |
| 5 | One print path: Save PDF, Preview and ⌘P; `print-color-adjust`; selection cleared; one set of steps. | §3.10 |
| 6 | Reading order for heading, figure and table numbers (editor and exports), and Auto-Arrange tidying within columns. | §3.5 |
| 7 | The A−/A+ text-size control; Auto-Arrange stepping through it, one undo step. | §3.7, §3.5 |
| 8 | Paste and drop images; one file per image block. | §3.3 |
| 9 | Copy, cut and paste blocks through the system clipboard. | §3.3 |
| 10 | Keys: ⌘/Ctrl + arrow fine nudge, Esc, ⌘A, `SELECT` in the key guard, x² and x₂ keys, the slash rule. | §3.4, §3.2 |
| 11 | Format bar: 8 buttons with x² and x₂; paste drops colour and highlight. | §3.2, §3.3 |
| 12 | Window: 8 tabs, the Format-opening rule, the tour; the top bar's text size and Save PDF (D2). | §3.0 |
| 13 | Block menu on every kind, with Bring to Front / Send to Back. | §3.4 |
| 14 | Blocks: the logo check skips the credit mark; Insert › Title and Authors while missing; Tab adds a table row; references style menu hidden; `.enw` dropped. | §3.2 |
| 15 | A palette pick clears per-level colours. | §3.6 |

| Switch (in `config/features.ts`) | What it hides | The value while hidden |
|---|---|---|
| `CHART_BLOCKS_ENABLED` (D1) | Insert › Chart, Figure › Make a figure, the series palette | Chart blocks on older posters still draw and print. |
| `IMPORT_ENABLED` (D3) | The Import tile, the dashboard's "Import…", Export › Save as `.postr`, the tour's `.postr` mention | The UI only. `importPostr` stays: the welcome poster is built through it (`INSPECTED data/seedWelcomePoster.ts:85-86`). |
| `ADJUSTMENTS_ENABLED` (D4) | Rotate, crop, stretch, show grid; the Figure tab's "🔎 Scan image"; custom palettes, Copy a design, style presets, heading style; weight, italic, line height; the Format tab's font controls and second text box; strikethrough, indent, colour and highlight in the format bar; caption position, spacing and Format; table borders; table row and column controls on the canvas; the citation style menu | Grid: off (it starts on today, `INSPECTED poster/PosterEditor.tsx:709`). Caption position: the stored value, else top. New tables: APA 3-line. Citation style: APA 7. Stored rotation, crop, stretch, borders, colours, weights and line heights still draw. |
| `EDITOR_EXTRAS_ENABLED` (D4) | The guidelines panel, the Staples help, Duplicate inside the editor | Duplicate stays on the dashboard. |

### 5.3 Retired while hidden: no fix needed

| Finding | Retired by |
|---|---|
| OF-02 text colour from the format bar is not saved | Colour buttons hidden (§3.2). |
| OF-03 Back from an edited copy writes into the original; OF-04 "Open copy" loses recent typing | Duplicate inside the editor hidden. Its "Open copy" is the editor's only call that moves to another poster while it stays open (`MEASURED (grep)`: one `navigate(` in `PosterEditor.tsx`, at `:2616`). UNVERIFIED that no other path exists. The cause (R1, the editor stays open while the poster changes) is still in the code, so any future in-editor switch brings these back. |
| OF-09 the PowerPoint export drops chart blocks; OF-10 inserted charts hide their caption and "Sample data" label | Chart blocks hidden (D1). Charts already on old posters keep OF-09; that moves to Later. |
| OF-12 Delete on a table strip removes the table; OF-13 table menu items do nothing; C-3 | On-canvas table controls hidden. |
| OF-15 and U-2 a `.postr` replace-import re-arranges the poster and wipes undo | Import hidden (D3). |
| OF-24 "Reset to palette" adds an empty undo step | The button is hidden with the per-level colour picker. |
| U-9, C-2, C-4, C-10, and C-6 in part | Rotate and crop hidden. |
| C-11, C-13 | Guidelines panel hidden. |
| C-17 (in part) | The Import and Copy a design dialogs are hidden. |
| C-18 (in part) | The tour loses the steps that pointed at hidden tabs. |
| The caption "Bottom" mismatch (§3.2) | Caption position buttons hidden. |
| Citation style lost on reload (inv finding 5) | The style menu is hidden; every poster uses APA 7. |
| inv finding 9 `.enw` accepted but not parsed | Dropped from the picker. |
| inv 4.10 A−, A+ and alignment leave nothing | Removed on fix 12's branch; retired when fix 12 merges. |

### 5.4 Moved to Later, or staying there

- **OF-11** a focused menu's keys reach the poster: parked by the owner on 2026-09-30. Hiding the Format tab's Weight menu removes the likeliest path (OF-11 names it). The one-word guard change sits in §3.4 if the owner wants it now.
- OF-09 for charts already on old posters (if D1 hides charts), and its sibling: on such posters the exports number figures among images only (`INSPECTED export/posterContent.ts:36-47`), while the canvas counts images and charts together (`PosterEditor.tsx:1532-1533`), so the PowerPoint file's figure numbers can differ.
- OF-16 (credit line on the free PDF: policy), OF-17, OF-18 (owner moved it to Later), OF-19, OF-22, OF-23, OF-25, OF-26, OF-27, OF-28.
- C-1, C-5 to C-9, C-14 to C-16, C-19 to C-21.
- U-6, U-7, U-8, U-10, U-11.
- Align and Distribute; smart guides; evening out columns; ⌘⇧> / ⌘⇧<; a combined theme list; more than one logo; changing a block's level ("make this a heading"); numbered reference styles.
- A doc fix: PLAN.md's Later entry gives 14 of 78 clicks where records 19 and 12 give 18 of 78 (C-5).

### 5.5 Work in flight: what to keep, cut or stop

| Work | Under this scope |
|---|---|
| **Item 12, one undo history** (`fix/12-one-undo-history`; top bar and drag steps uncommitted) | **Keep and finish.** It is the MVP's undo. Do not widen it: the top bar's text size and Save PDF (D2) come after, as their own item. Adopt three small rules from §3.8: focus returns after a mouse click on Undo or Redo (U-4); a keyboard press keeps focus on the button (U-3); on a Mac, Ctrl+Y is not redo (U-5). The owner's manual check, flow 29, stays (U-12). |
| **Item 6, group drag undo** | Do it right after item 12. It closes the "every drag is one step" promise. |
| **Item 13 part 2, stream P** (checker reading; in `fix13p2-wt`) | **Keep and finish** (owner, 2026-10-07): the bounded regex rule table of §3.11, three review rounds. |
| **Item 13 part 2, stream Q** (inserted chart text and captions; uncommitted in `charts-wt`) | **Stop if D1 hides charts** (recommended), and park it. If charts stay, OF-09 and OF-10 become MVP blockers and stream Q continues. |
| **Item 4, rulers** | Stays parked and hidden. |
| **Items 5 and 8** (OF-07, OF-05) | Move up: they are blockers 4 and 2. |
| **Next pair in flight** (two at a time, the owner's rule) | Item 12 plus OF-01. Then OF-05 and the starting-text change (blocker 3), then OF-07 and the reading order (blocker 5). |

---

## 6. Decisions for the owner

Only product direction is here. Each has a recommended default; silence means the default.

| # | Decision | Recommended default | What changes if you choose otherwise |
|---|---|---|---|
| D1 | Chart blocks ("Make a figure"): keep or hide? | **Hide.** Researchers bring figures they already made in R, Python or Prism, and paste them. The in-editor check covers figures made outside Postr (§3.11). | Keep: OF-09 (the paid PowerPoint export drops charts, no warning) and OF-10 (the hidden "Sample data" label) become MVP blockers, and stream Q continues. |
| D2 | You asked to "mimic PPT's control and layout". Which screen layout? (a) the left sidebar only, with PowerPoint's names; (b) the sidebar for panels, plus a top bar with the commands PowerPoint keeps at the top; (c) a full ribbon. | **(b).** Fix 12 already builds the 44 px top bar with Undo and Redo. Add A− / A+ and Save PDF to it (§3.0). Panels (Design, Insert, Authors, References, Format, Issues, Versions, Export) stay in the sidebar. | (a): text size sits in Design and Save PDF in Export; nothing new at the top beyond fix 12. (c): a new design pass and a rebuild of the editor's chrome before launch. |
| D3 | Import an existing poster (PDF, PPTX, image, `.postr`) and the `.postr` backup: keep or hide? | **Hide both.** Import is not on the blank path; a backup you cannot import is a dead end. | Keep: OF-15 and U-2 return as MVP findings, and the tour keeps its Import step. |
| D4 | The hide list (§4, §5.2) as a whole | **Approve it.** Name any item to keep. The ones most likely to be missed: crop, the guidelines panel's conference specs, the Staples help. | Each kept item brings back its findings in §5.3. |
| D5 | Table size: are the Format tab's "add/remove the last row or column" buttons the "advanced table editing" you moved to Later? | **No: keep them**, and add PowerPoint's Tab-in-the-last-cell-adds-a-row. Inserting or deleting at a position stays Later. | Hide the buttons: typed tables then grow only by Tab (rows) and by pasting (columns). |
| D6 | Auto-Arrange: tidy within columns, or even out the columns? | **Tidy within columns** (§3.5 C). Blocks keep their column and order, so section numbers never change and the result is predictable. | Even out: blocks flow from column to column in reading order to balance heights. Numbers still hold, but blocks move between columns and the rule needs a page-break rule for headings. |
| D7 | When Auto-Arrange cannot fit, may it shrink the text, and the title with it? | **Yes, through A−**: all four levels together, one step at a time, never below body 28 pt (title 78 pt at default ratios). | "Never": Auto-Arrange only arranges, and Issues lists the overflow. "Today's": body and heading only, down to 22 pt, below the code's own guideline. |
| D8 | What does ⌘S / Ctrl+S do? | **Save now**, as in PowerPoint (§3.9). Versions are made only from the Versions tab. | Keep "save a version": ⌘S then needs a cap and a message at 20, or it fills the store and stops Restore. |
| D9 | References: keep the 4-style menu? | **Hide it.** Typed and imported references show in APA 7; pasted ones show as pasted, which is what happens today in every style. No new stored field. | Keep it: store the style in the poster, and number Vancouver and IEEE in the order entered instead of A–Z. |
| D10 | Theme: one list that sets palette and font together, as PowerPoint's Themes gallery does? | **Later.** Keep today's two pickers (palette, font) for the MVP. | Now: design about 8 named themes (palette plus font) and replace both pickers with one. |

Treated as decided, not asked:
- The in-editor figure check stays and is rebuilt as a bounded rule table (owner, 2026-10-07, when asked directly; §3.11).
- Pasted text loses its colour and highlight, so the theme wins (principle 4).
- Heading, figure and table numbers follow the reading order and change live (§3.5 A).
- New blocks start empty and show grey prompts that never print, as PowerPoint's placeholders do (§3.1).

---

## 7. What this doc does not establish

- Nothing was run in a browser. Every "today" line is a code reading, an inventory row, or a probe of a pure function. On-screen behaviour may differ.
- The probes call production functions under Node with no layout. The Auto-Arrange probe used stored block heights; the editor measures text heights first. The stacking and renumbering do not depend on heights (INSPECTED), but which column the other blocks land in may differ.
- The reading-order rule was tested only on the 5 templates and the welcome poster, not on posters users have rearranged.
- No finding in `open-findings.md` was re-run. Their numbers are the sources' own.
- Every PowerPoint line is from knowledge. The `PPT?` details (the Mac fine-nudge key, Mac redo keys, the sub- and superscript keys on a Mac, whether PowerPoint switches tabs on selection) need a check on a real copy before they go into code.
- `docs/brand/master-narrative.md` is not in this repo copy (`MEASURED`: `docs/` has no `brand` folder), so its idea comes from the task text.
- The six body sizes, the paste order, the reading-order thresholds (90 %, 3 in) and the tab names are design proposals. No user data backs them.
- Whether hiding the editor's Duplicate closes every path to OF-03 and OF-04 is UNVERIFIED. The cause stays in the code.
- Not covered: pages outside the editor (account, billing, legal) and the standalone plot checker.

---

## 8. Revision notes (2026-10-07)

Each critique point was checked against the code before acting on it. "Holds" means the reviser re-read the cited lines (INSPECTED) or re-ran a probe (MEASURED).

**Changed**

| Point | Check | What changed |
|---|---|---|
| H1 template text is content | Holds (`templates.ts:55-79, 206`; `PosterEditor.tsx:1903, 1632-1645`). Also found: the title stores "Your Poster Title", the sample table holds made-up results (`templates.ts:73`), and no stylesheet draws `data-placeholder`, so the prompts the old draft relied on are likely never shown. | New §3.1 rules 5–6 (empty starts, `prompt` field, one CSS rule); new §3.12 Issues rows; §2 steps 2–4, 6; blocker 3. |
| H2 z-order renumbers headings | Holds (`PosterEditor.tsx:1475-1497, 1789-1800`; `posterContent.ts:51-63`). "Numbered by position" was wrong. | One reading order (§3.5 A, principle 7) for headings, figures, tables and Auto-Arrange; z-order is paint order only. Tested on 6 of 6 layouts by probe. |
| H3 ⌘S fills the version store | Holds (`PosterEditor.tsx:1162-1231`; `VersionPanel.tsx:89`; migration `:84-85`). | ⌘S saves now through `flushNow`; versions only from the tab (§3.9; D8; blocker 11). |
| H4 one-logo check finds the credit mark | Holds by reading (`PosterEditor.tsx:1885-1891`; `ackBlock.ts:53-55`). | The check and the paste rule skip locked blocks; reproduce first (§3.2; blocker 8). |
| M1 Shift/Alt + arrow contradiction | Holds (`PosterEditor.tsx:2235`). | ⌘/Ctrl + arrow only; Shift and Alt + arrow do nothing (§3.4). |
| M2 "Custom" is common; A+ shrinks the welcome title | Holds (`MEASURED (probe)`: title 146.0 pt). | Steps replaced by six body sizes with the other levels following by ratio; no Custom state (§3.7). |
| M3 steps 1–2 under the guideline | Holds (`MEASURED (probe)`: 60.5/34.6/21.6 and 70.6/40.3/25.2 pt; guideline `constants.ts:29-35`). | Bottom size 28 pt keeps all levels above the guideline at default ratios; Auto-Arrange shrinking the title is now D7. |
| M4 Format tab opens on every selection | Holds (`Sidebar.tsx:345-366`). | Opens only for image, table and logo; title, heading and text leave the tab alone (§3.0). |
| M5 citation style menu | Holds, and stronger than stated: the parser keeps every pasted reference's own text (`apps/api/src/import.ts:71, 1131`). | Menu hidden, no stored field (§3.2; D9); citation style moved from blockers to retired (§5.3). |
| M6 ⌘P undefined | Holds (`MEASURED (grep)`). | ⌘P runs the one print function (§3.10). |
| M7 four print choices | Holds (`printDocument.ts:81-84, 212-219`; no `print-color-adjust`). | Add `print-color-adjust: exact`; steps trimmed; browser check listed (§3.10). |
| M8 title and authors lost for good | Holds (`blockLock.ts:66-82`; `Sidebar.tsx:4164-4172`). | Insert offers Title and Authors while missing (§3.2). Chosen over refusing Delete, which PowerPoint does not do. |
| M9 clipboard contradiction; shared image files | Holds (`posterImages.ts:35-53`; `PosterEditor.tsx:1774-1779`). | System clipboard with a marked payload; a new file name on every upload; cross-poster paste copies the file (§3.3 C, D). |
| M10 D2 does not quote the owner | Holds. | D2 quotes him and offers three options; recommends the middle one (§6, §3.0). |
| M11 slash menu takes Enter | Holds at the function level (`MEASURED (probe)`); also a bare trailing "/" + Enter inserts α. | Menu only at the start of a word; Enter only after an arrow key (§3.2; blocker 9). |
| L1 figure order; export vs canvas counts | Holds (`PosterEditor.tsx:1523-1533`; `posterContent.ts:36-47`). | Reading order fixes the first; the second is listed under Later with OF-09 (§5.4). |
| L2 snap always snaps | Holds (`MEASURED (probe)`: 0 of 50,001 positions off grid). | §3.5 B says every drag lands on the grid. |
| L3 fix 12 written as on main | Holds (`FloatingFormatToolbar.tsx:272-274, 322, 334`). | §3.2, §4 row 4.10, §5.3 say main still has them. |
| L4 hidden toggles need a value | Holds (`PosterEditor.tsx:709`). | New column in the switch table (§5.2). |
| L5 tour mentions `.postr` | Holds (`OnboardingTour.tsx:92`). | §4 row 1.12 retitles the step. |
| L6 import switch must hide UI only | Holds (`seedWelcomePoster.ts:85-86`). | Stated in the switch table. |
| L7 Tab in the last cell | Holds (`blocks.tsx:628-638`). | Added; D5's default updated. |
| L8 image pasted into text ignored | Holds (`RichTextEditor.tsx:239-257`). | Becomes a new image block (§3.3 A). |
| L9 tabs rule turns prose into a table | Accepted as a design point. | Order 2 is HTML tables only (§3.3 B). |
| L10 proposals worded as today | Holds (`PosterEditor.tsx:3463`; `Sidebar.tsx:1202-1213`). | §3.10, §3.11 reworded. |
| L11 no keys for x² and x₂ | Accepted. | Keys added, with the browser zoom risk marked UNVERIFIED (§3.2). |
| L12 save retry has no rule | Accepted. | Retry schedule in §3.9. |
| L13 one theme list deferred | Accepted. | Named as D10. |
| (e) silent product choices | Accepted. | D6–D10 added; "Treated as decided" lists the rest. |

**Declined, with reasons**

- M2's option to hide "Sizes by level": with the ratio rule the fields create no Custom state, and they are the only way to shrink a long title alone. They stay folded.
- H2's alternative of keeping z-order out of the array: one reading order fixes five symptoms at once (§5.1), while moving z-order fixes one.
- M7's request to name the browsers that work: it cannot be settled without a browser. It stays as a check before building (§3.10).
- M4's suggestion to switch to Format for tables and images was taken; switching for title, heading and text was not, since Format holds one sentence for them.

**New in this revision (found while checking the critique)**

- Auto-Arrange stacks headings, renumbers sections and squeezes wide blocks on 4 of 4 templates with headings (`MEASURED (probe)`; §3.5; blocker 5). Not in `open-findings.md`.
- No stylesheet draws the editor's text prompts (`MEASURED (grep)`; §3.1).
- The default title and the sample table are content that Issues does not fully cover (§3.1, §3.12).
- An empty heading prints its number alone (`INSPECTED poster/blocks.tsx:2252`; §3.12).

**Probes added** (in this folder, read-only against the repo copy): `revise-probe.mts` (default-poster Auto-Arrange, starting text, step sizes, snap sweep, welcome sizes), `revise-probe-order.mts` (today's orders vs the reading-order rule, Auto-Arrange on all templates), `revise-probe-slash.mts` (slash-menu Enter capture).
