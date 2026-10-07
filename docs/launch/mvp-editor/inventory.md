# Poster editor inventory: every function and control, blank to export

Code: the read-only repo copy at `main f554eaa`. Paths are relative to `apps/web/src/` unless they start with `docs/`, `packages/` or `supabase/`.

## How to read this

**Evidence labels.** Every `file:line` is INSPECTED, meaning I read it at f554eaa and ran nothing. MEASURED marks the one claim I ran, a probe of the sanitizer (`inventory-probe-sanitize.mts`, in this folder). A claim about PowerPoint is marked [PPT knowledge]: it comes from my own knowledge and was not checked in this repo. UNVERIFIED marks anything I could not settle by reading, for example how a control behaves in a real browser.

The line numbers in `docs/feature-graph.md` are out of date in many places. For example, it puts `Sidebar.tsx` at 4,306 lines, but at f554eaa the file has 4,365. I checked the code itself, and the line numbers below come from the code, not from the graph.

**Visibility**

| Tag | Meaning |
|---|---|
| Shown | Visible on the canvas, or at the top of a sidebar tab, with no other action |
| Tab | Inside a sidebar tab, one click away |
| Deep | Needs one of: scrolling past other sections of a tab (judged from source order, not measured on screen), a modal, a right-click, a hover, a keyboard shortcut only, or a particular block being selected |
| Flag | Turned off by a `false` flag in `config/features.ts`, or commented out |

**Class**

| Tag | Meaning |
|---|---|
| CORE | Needed to take a poster from blank to export |
| BULK | One choice that applies to the whole poster. This is the kind of control the owner's direction asks for |
| ADJUST | Customization or adjustment beyond blank to export |
| LATER | Already on the owner's Later list |
| AUTO | Happens without a decision |
| HIDDEN | Behind a flag |

**Decisions** counts what the user must choose in the control: buttons, options, fields and sliders. A list that repeats counts once per repeated unit. These counts come from reading the source, not from the screen.

---

## 1. Start: new poster, size, template, layout

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 1.1 | "+ New poster" (dashboard), its ▾ menu item "New blank poster", and the public `/p/new` links | `createPoster()` makes a row and opens `/p/{id}`. `/p/new` opens the most recent poster, or creates one | `components/NewPosterButton.tsx:60-66, 109-112`; `data/posters.ts:233`; `pages/Editor.tsx:5-9, 245-252`; links `pages/Landing.tsx:192`, `components/PublicHeader.tsx:158`, `components/PricingSection.tsx:101` | Shown | 1 click | CORE |
| 1.2 | Default poster contents | An empty poster is filled with the 3-Column Classic template and the Classic Academic palette, at the database default of 48 × 36 in | `pages/Editor.tsx:41-51`; `supabase/migrations/20260408000100_posters.sql:18-19, 35` | — | 0 | AUTO |
| 1.3 | Welcome sample poster (the cat poster) | Added once, on an account's first dashboard visit | `data/seedWelcomePoster.ts` (header); `pages/Home.tsx:74` | — | 0 | AUTO |
| 1.4 | Poster name field and Save | Sets the dashboard label. The poster's title on the canvas is a separate block | `poster/Sidebar.tsx:934-975` | Shown (top of the Layout tab) | 1 field, 1 button | CORE (light) |
| 1.5 | Import existing poster (Layout tab) | Opens a tile, then an import modal. Takes PDF, PPTX, image or `.postr`. With more than 2 blocks on the poster it first asks to replace them, and offers a `.postr` backup | `poster/sidebar/ImportTile.tsx:66` (large tile when the poster has ≤2 blocks), `:105` (small pill otherwise); `poster/sidebar/ImportSection.tsx:15, 28`; `components/ImportPosterModal.tsx:50` (`ACCEPT`) | Shown (Layout tab) | Pick a file, then confirm | ADJUST (an optional start). A `.pptx` import matters for people coming from PowerPoint |
| 1.6 | Dashboard "Import…" | The same modal in "new poster" mode. Auto-Arrange runs on the first load after import | `components/NewPosterButton.tsx:68-77`; `poster/PosterEditor.tsx:2087-2114` | Shown (dashboard) | Pick a file | ADJUST |
| 1.7 | Poster size | A menu of 8 presets (`48"×36" Landscape` … `A0 Portrait`) plus "Custom Size". Width and height fields take 10 to 100 in. Committing a size opens "Change poster to …?", and confirming moves the blocks onto the new sheet as one undo step | `poster/sidebar/SheetSizeFields.tsx:136-176` (menu), `:101-131` (fields); `poster/constants.ts:80-89`; `poster/resizeSheet.ts:123-124`; `poster/PosterEditor.tsx:1963-1979, 2583-2590` | Tab (Layout, below Import) | 1 of 9 options, or 2 number fields; then confirm | CORE |
| 1.8 | Auto-Arrange | One button. Measures text height, packs blocks into 2 to 4 columns (shortest column first) and snaps them to the grid. If the blocks still overflow, it **shrinks the body and heading sizes** | `poster/Sidebar.tsx:995-1044`; `poster/PosterEditor.tsx:1981-2085`; `poster/autoLayout.ts:1-26` | Tab (Layout) | 0 | BULK (layout) |
| 1.9 | Templates | 5 buttons: 3-Column Classic, 2-Col Wide Figure, Billboard, Sidebar + Focus, Blank. Confirming "Replace blocks" swaps **every** block for the template's empty layout, as one undo step | `poster/templates.ts:43-162, 172, 191`; `poster/Sidebar.tsx:1046-1085`; `poster/PosterEditor.tsx:1947-1958, 2592-2599` | Tab (Layout, below Auto-Arrange) | 1 of 5, then confirm | BULK (layout) |
| 1.10 | Duplicate this poster | Copies the poster, then asks "Open copy / Stay here" | `poster/Sidebar.tsx:562-594`; `poster/PosterEditor.tsx:1143, 2604-2621` | Shown (sidebar header) | 1 click, plus the dialog | ADJUST |
| 1.11 | Back to My Posters, and the logo link | Go to `/dashboard` | `poster/Sidebar.tsx:512, 530-559` | Shown | — | navigation |
| 1.12 | Onboarding tour | 8 steps with Skip, Back, Next/Done. Runs once per browser (`postr.onboarding-done`). Its step titled "Plot code readability check" sends the user to the Figure tab | `components/OnboardingTour.tsx:44-109, 74-81, 111, 393-400`; mounted `poster/PosterEditor.tsx:3528` | Shown on the first visit | 3 buttons | ADJUST |

## 2. Add content: each block kind, paste, import

The poster has 9 block kinds: `title`, `authors`, `heading`, `text`, `image`, `logo`, `table`, `references`, `chart` (`packages/shared/src/types/poster.ts:9-18`).

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 2.1 | Insert tab: 7 buttons (Heading, Text, Image, Chart, Table, References, Logo) | `addBlock` places the block in an open slot at its default size. A poster has **one logo at most**: pressing Logo again selects the existing one. Chart opens Figure › Make instead of adding a block | `poster/Sidebar.tsx:4156-4236` (list `:4164-4172`); `poster/PosterEditor.tsx:1878-1911` (logo rule `:1885-1891`) | Tab (Insert) | 1 of 7 | CORE |
| 2.2 | Title, heading and text, typed on the canvas | Editable in place. Placeholders read "Poster Title", "Section Heading" and "Type here… (type / for symbols)" | `poster/blocks.tsx:2214, 2256, 2279`; `poster/RichTextEditor.tsx` | Shown | typing | CORE |
| 2.3 | Slash symbols | `/` opens a menu of 66 entries: Greek letters, math signs, arrows and stats shortcuts | `poster/symbols.ts:11-34`; `poster/RichTextEditor.tsx` | Deep (keyboard) | optional | ADJUST (cheap) |
| 2.4 | Pasting into text | The paste is sanitized. **Kept:** bold, italic, underline, strike, sub, sup, lists, color, highlight. **Dropped:** font size and font family, so pasted text takes the poster's type style. This is the master narrative's "format reset on paste" pain, already handled | `poster/RichTextEditor.tsx:239-256`; `poster/sanitizeHtml.ts:53-84`. MEASURED: a Word span with `font-family: Calibri; font-size: 11pt` comes out as plain `pasted` | — | 0 | AUTO, CORE |
| 2.5 | Edit tab "Content" box for a text block | A second editor for the same text, with a docked format toolbar | `poster/Sidebar.tsx:3951-3993` | Deep (Edit tab, needs a selected text block) | — | duplicate surface |
| 2.6 | Image upload | Click "+ Upload figure" to open the file picker. Images up to 10 MB. "Replace image" sits on the block's handle row. **There is no drag-and-drop and no clipboard paste of images**: a search for `onDrop`, `dataTransfer` and image `clipboardData` in `poster/*.tsx` found none | `poster/blocks.tsx:97, 118, 408, 450-457, 2530` | Shown (placeholder) | Pick a file | CORE |
| 2.7 | Logo | "+ Logo" opens the LogoPicker with three tabs: Presets (about 100; a grep counts 103 `name:` lines in `logoPresets.ts`), with a search box and 6 region filters; My Logos; Upload. There is also a "+ Logo" in the Authors tab | `poster/blocks.tsx:218-264`; `components/LogoPicker.tsx:309-311`; `poster/Sidebar.tsx:1295` | Shown (placeholder) | 1 pick; search and filters are optional | CORE (on the MVP list) |
| 2.8 | Table: insert and cell editing | A new table is 3 × 3 with the APA 3-line preset. Tab and the arrow keys move between cells. Pasting TSV, CSV or HTML fills the table and grows it as needed | `poster/PosterEditor.tsx:1906-1909`; `poster/blocks.tsx:819-821` | Shown | typing / paste | CORE |
| 2.9 | Table: adding and removing rows and columns | "Add row" and "Add column" bars (on hover); row and column strips that select, then Delete removes; a right-click menu (Insert row above/below, Insert column left/right, Clear cell, Delete row/column); sidebar buttons for row and column; dragging a column border | `poster/blocks.tsx:962, 1118, 1176, 1231, 1255, 1387-1396`; `poster/Sidebar.tsx:3474-3509` | Deep (hover, right-click) | about 11 controls | LATER (owner, 2026-10-07) |
| 2.10 | Chart (Figure tab › "Make a figure") | A questionnaire of 0 to 4 questions (`charts/ladder/steps.ts:1-11`), then preview panels, then "Insert selected figures". The chart is added at 10 × 7 in. A multi-series chart also gets a series-palette picker | `poster/sidebar/FigureTab.tsx:102, 137, 151-176`; `poster/PosterEditor.tsx:1919-1945` | Tab (Figure) | 0–4 questions, a pick, an optional palette | ADJUST: not on the MVP list ("plot check" is; making charts is not). Owner to decide |
| 2.11 | Authors and institutions (Authors tab) | Per institution: name, department, city, remove; "+ Add Institution". Per author: name, ▲ ▼ order, remove, one affiliation chip per institution, "Corresponding", "Equal contrib."; "+ Add Author". The authors block on the canvas only shows "Add authors in sidebar →" | `poster/Sidebar.tsx:1246, 1301-1384, 1599-1856`; `poster/blocks.tsx:1434, 1449` | Tab (Authors; selecting the authors block opens it, `Sidebar.tsx:345-367`) | Per author about 6 + one per institution; per institution 4 | CORE (MVP) |
| 2.12 | Paste authors, then "✨ Parse with AI" | Calls `/api/import/parse-authors`, with a regex parser as fallback | `poster/Sidebar.tsx:1404-1414, 1886, 1941` | Deep (bottom of the Authors tab) | 1 box, 1 button | ADJUST (a shortcut) |
| 2.13 | References (Refs tab) | "Import .bib / .ris" (the file input also accepts `.enw`, which has no parser); a citation style menu (APA 7, Vancouver, IEEE, Harvard); paste, then "✨ Parse with AI" (`/api/import/parse-references`); manual entry with 4 fields (authors, year, journal, title) and "+ Add Reference"; a remove button on each reference | `poster/Sidebar.tsx:1457-1465, 1963, 2112-2122, 2158, 2177, 2215, 2234-2274`; `poster/citations.ts:45, 64, 103` | Tab (Refs) | Style 1 of 4; per reference 4 fields | CORE (MVP); the style menu is BULK |
| 2.14 | References block on the canvas | Formatted from the Refs tab. The last entry is always "Poster made with postr.sh" | `poster/blocks.tsx:1543`; `export/attribution.ts` | Insert › References | 0 | CORE |
| 2.15 | Captions on images, charts and tables (Edit tab) | Caption text; position (Top, Bottom, Left, Right, Hide); a spacing slider from 0 to 24 px; "✨ Format table/note" (APA autoformat); a note field. Captions are numbered automatically ("Figure N." / "Table N.") | `poster/Sidebar.tsx:3025-3270` (positions `:3077-3081`, slider `:3151-3162`, Format `:3188`, note `:3223-3229`); numbering `poster/blocks.tsx:1596-1624` | Deep (Edit tab, needs a selected image, chart or table) | Text, then 5 + slider + button + note | Caption text CORE; the rest ADJUST |
| 2.16 | Heading numbers | Headings are numbered automatically by their position on the canvas. There is no on/off control | `poster/blocks.tsx:2252`; `export/posterContent.ts:53` | — | 0 | AUTO |
| 2.17 | Credit mark (a locked logo block) | Added to every poster. Deleting it shows "Postr is free — this credit stays on the poster." Paid PPTX exports remove it | `stores/posterStore.ts:318-331`; `export/ackBlock.ts:78`; `export/blockLock.ts:33`; `export/stripAckBlock.ts` | Shown | 0 | AUTO |

## 3. Arrange: select, move, resize, rotate, align, snap, layout, groups, z-order

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 3.1 | Select | Click selects. Shift-, ⌘- or Ctrl-click adds to the selection. Dragging on empty canvas draws a selection rectangle. Clicking empty canvas deselects | `poster/blocks.tsx:2049`; `poster/PosterEditor.tsx:678-682, 2788-2830`; `poster/SelectionRect.tsx` | Shown | — | CORE |
| 3.2 | Move | Drag the block body. Images and logos are dragged by the move handle. The arrow keys nudge by ½ in, or 1/10 in with Shift | `poster/blocks.tsx:2443`; `poster/PosterEditor.tsx:165, 2235-2245` | Shown | — | CORE |
| 3.3 | Snap | Snaps only to a ½ in grid, within 0.3 in. The drag guides draw the dragged block's own edges and centres, plus a tick where it meets the canvas centre. **Blocks do not snap to other blocks' edges** | `poster/snap.ts`; `poster/constants.ts:60, 63`; `poster/PosterEditor.tsx:3008-3080` (reads only `draggingBlock`) | — | 0 | AUTO. PowerPoint's smart guides snap to other objects [PPT knowledge] |
| 3.4 | Resize | 8 handles, or the 4 corners for an image in "contain" mode. Shift locks the aspect ratio, and a contain-mode image always keeps it. Which handles appear depends on the block's size on screen (fix 19) | `poster/resizeHandles.tsx`; `poster/blocks.tsx:2361`; `poster/PosterEditor.tsx:445-455`; `poster/selectionLayout.ts` | Shown when selected | — | CORE |
| 3.5 | Rotate | A handle below the block. Snaps to 0, 45, 90, 135 and 180° within 4°; Shift snaps to 15° steps | `poster/blocks.tsx:1966`; `poster/PosterEditor.tsx:383-395` | Shown when selected | — | ADJUST |
| 3.6 | Crop (images and logos) | A toggle on the handle row, then 4 edge handles and Cancel / Reset / Apply | `poster/blocks.tsx:2305, 2324, 2559`; `poster/CropOverlay.tsx:196-206` | Shown when selected | 4 edges, 3 buttons | ADJUST |
| 3.7 | "Stretch to fit block" (images and logos) | Switches `imageFit` between `fill` and `contain` | `poster/Sidebar.tsx:2964-3020` | Deep (Edit tab) | 1 checkbox | ADJUST |
| 3.8 | Moving and resizing several blocks | With more than one block selected, a frame lets them move and resize together. **Groups are not saved** | `poster/PosterEditor.tsx:3249`; `poster/GroupFrame.tsx` | Shown | — | CORE (light) |
| 3.9 | Z-order: "Bring Forward" and "Send Back" | Only in the right-click menu, and **that menu opens only for image, logo, chart and references blocks**. Title, text, heading, authors and table blocks have no order control | `poster/blocks.tsx:2077-2095` (excluded types `:2083-2091`), `:2725-2727` | Deep (right-click) | 2 | ADJUST |
| 3.10 | Duplicate a block | ⌘D, or the right-click menu (same block types as 3.9) | `poster/PosterEditor.tsx:2228-2232`; `poster/blocks.tsx:2725` | Deep (keyboard, right-click) | — | CORE (light) |
| 3.11 | Delete a block | Delete or Backspace; the red button on the handle row; the right-click "Delete". The credit mark refuses | `poster/PosterEditor.tsx:2217-2226`; `poster/blocks.tsx:2591, 2728` | Shown | — | CORE |
| 3.12 | Align and distribute | **None.** A search for align or distribute and group or ungroup found no block-level controls | — | — | — | GAP (PowerPoint: Arrange › Align [PPT knowledge]) |
| 3.13 | Show grid | A checkbox. The grid is a visual aid and never prints | `poster/Sidebar.tsx:1087-1096`; `poster/PosterEditor.tsx:748, 2873-3000` | Deep (bottom of the Layout tab) | 1 | ADJUST |
| 3.14 | Rulers | Turned off (`RULERS_ENABLED = false`). Neither the toggle nor the rulers render | `config/features.ts:67`; `poster/Sidebar.tsx:1098-1107`; `poster/PosterEditor.tsx:747, 3288` | Flag | — | HIDDEN |
| 3.15 | Zoom | Buttons: −, a % readout (fits on click), +, FIT. Pinch and Ctrl+wheel also zoom | `poster/PosterEditor.tsx:615, 3560-3650` | Shown | 4 | CORE (navigation) |
| 3.16 | Show / hide the sidebar | ⌘/; a "Hide sidebar" button; a "Show sidebar" tab | `poster/PosterEditor.tsx:988-991, 2733-2734`; `poster/Sidebar.tsx:466-467` | Shown | — | navigation |
| 3.17 | Layout (Auto-Arrange, templates) | See 1.8 and 1.9 | | | | BULK |

## 4. Style: theme, palettes, fonts, sizes, per-block formatting, presets

Font size and color can each be set in several places:

- **Size:** Style › Typography (per level); the Edit tab (per level, reached through a block); the toolbar's A−/A+ (per selection); and Auto-Arrange, which shrinks sizes on its own.
- **Color:** the palette; a custom palette; the Edit tab's color picker (per level); the toolbar's 5 text colors and 5 highlight colors; and "Copy a design".

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 4.1 | Palette | 8 built-in palettes (Classic Academic … Clean Minimal). Each row shows 4 swatches, and a badge when the palette is not colorblind-safe | `poster/constants.ts:247-265`; `poster/Sidebar.tsx:2389-2395, 2476-2478` | Tab (Style) | 1 of 8 | BULK, CORE (theme) |
| 4.2 | Custom palettes | "➕ Create custom palette" opens the PaletteDesigner, which has 4 tabs: Manual (7 color roles, each with a picker and a hex field); Random (5 strategies, "Colorblind-friendly only", shuffle); From text; From image. Then a name and "Save palette and apply". Custom palettes have edit and delete buttons, and are stored only in this browser's localStorage | `poster/Sidebar.tsx:2404-2425, 2497-2514`; `components/PaletteDesigner.tsx:63-66, 525, 661, 696`; `poster/customPalettes.ts:9` | Deep (a modal) | About 25 | ADJUST |
| 4.3 | "Copy a design" | Drop a poster (PDF or image) to extract its palette and font. Two checkboxes (Colours, Font), then "Apply — undo with ⌘Z", as one undo step | `poster/Sidebar.tsx:2438-2471`; `components/CopyDesignModal.tsx:275, 318`; `stores/posterStore.ts:88` | Tab (top of Style), then a modal | A file, then 2 checkboxes | ADJUST (it is a bulk action) |
| 4.4 | Font family | A menu of 10 fonts, grouped as 6 sans and 4 serif | `poster/constants.ts:197-208`; `poster/Sidebar.tsx:2530-2550` | Tab (Style) | 1 of 10 | BULK, CORE |
| 4.5 | Typography, per level (Title, Heading, Authors, Body) | Each level has a size in pt, a weight (6 options), italic and line height: **16 controls** in all. Defaults: title ≈ 101 pt, heading ≈ 58 pt, body and authors ≈ 36 pt | `poster/Sidebar.tsx:2552, 2607-2712`; `poster/constants.ts:282-303` | Deep (Style, below the palettes) | 16 | The 4 sizes are BULK; weight, italic and line height are ADJUST |
| 4.6 | Heading style | Border (None, Bottom, Left, Box, Thick), alignment (left, center) and a "Fill" checkbox. Applies to every heading | `poster/Sidebar.tsx:2555, 2714-2780` | Deep (Style) | 3 controls, 8 options | ADJUST (bulk) |
| 4.7 | Style presets | A name field and "💾 Save", which store font, palette, styles and heading style. Saved presets appear as a list of buttons. Stored only in localStorage `postr.style-presets` | `poster/Sidebar.tsx:2558-2600`; `poster/PosterEditor.tsx:717-727, 2116-2156` | Deep (bottom of Style) | 1 field, 1 button, list | ADJUST |
| 4.8 | Font controls in the Edit tab (title, heading or text selected) | Size, weight, italic, a line-spacing slider and number, a color picker, and "Reset to palette". The panel is headed "Editing: {type}", but **every change applies to all blocks of that level** | `poster/Sidebar.tsx:3948, 3995-4136`; scope `:2793-2817` | Deep (Edit tab) | 7 | duplicates 4.5; ADJUST |
| 4.9 | Inline format toolbar (floats over a text selection; docked in the Edit tab) | B, I, U, S (4); align left, center, right (3); bullet, numbered, indent, outdent (4); A− and A+ (2); 5 highlight colors plus clear; 5 text colors plus default; Clear formatting. **26 controls** | `poster/FloatingFormatToolbar.tsx:244-402` (A−/A+ `:91-104, 314, 326`); mounted `poster/blocks.tsx:2682`, `poster/Sidebar.tsx:3962, 3993` | Shown when text is selected | 26 | B/I/U and color are CORE (as in PowerPoint); the rest ADJUST |
| 4.10 | What the toolbar's output turns into | Every text commit runs through `sanitizeHtml`, which keeps only `color` and `background-color` as styles and has no `DIV` tag. MEASURED: `<span style="font-size: 1.06em">big</span>` comes out as `big`, `<font size="4">` is stripped, and `<div style="text-align: center">` and `<div align="right">` come out as plain text. When the editor loses focus, it redraws itself from the sanitized value. So **A−, A+ and the three alignment buttons probably leave nothing on the poster.** UNVERIFIED in a browser: I did not capture the exact markup each browser emits | `poster/sanitizeHtml.ts:53-84, 108-120`; `poster/RichTextEditor.tsx:156-174` | — | — | finding |
| 4.11 | Table borders (Edit tab, table selected) | Presets: None, APA 3-Line, All Lines, H-Lines, Header Box, plus Custom. Custom shows a clickable diagram (4 outer edges, header box, header line, and one line per inner row or column gap). There are also 7 one-click presets (All borders … APA 3-line). New tables start as APA 3-Line | `poster/Sidebar.tsx:3539-3580, 3609-3870, 3882-3900`; `poster/constants.ts:337-344` | Deep (Edit tab) | 6 presets + about 6+n lines + 7 presets | ADJUST |
| 4.12 | Series palette for a multi-series chart | A palette picker in the Figure tab | `poster/sidebar/FigureTab.tsx:102` | Deep | 1 | ADJUST |
| 4.13 | Auto-Arrange shrinking type | Lowers the body and heading sizes when the blocks do not fit | `poster/PosterEditor.tsx:2076-2081` | — | 0 | AUTO |

## 5. Check: guidelines and readability

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 5.1 | Issues tab, with a count badge | Lists: out of bounds; blocks overlap; empty figure; default title; placeholder text; long title; missing authors or institutions; empty references; a reference without a title or authors. Clicking an issue jumps to its block | `poster/PosterEditor.tsx:1578-1700` (overlap `:1602`); `poster/Sidebar.tsx:4238` | Tab (Issues) | 0 (a click jumps) | CORE, AUTO |
| 5.2 | Out-of-bounds banner | "{N} blocks outside poster bounds — details in Issues" | `poster/PosterEditor.tsx:3387-3420`; `poster/boundsCheck.ts` | Shown when it applies | 0 | AUTO |
| 5.3 | Figure tab › "Check a figure" (figure readability) | Paste R or Python code. Language buttons Auto, R, Python; ▶ Check; a results table; Copy snippet; Open full edited code; "🔎 Scan image" (Claude Vision) for a selected image. While this tab is open, a gray figure rectangle appears on the canvas. **The owner calls the readability check stopped, but at f554eaa it is still shown in the editor**, and the tour (1.12) and the Standard Poster checklist (`GuidelinesPanel.tsx:398`) still point to it. The standalone plot checker is outside this doc | `poster/sidebar/FigureTab.tsx:145, 181`; `poster/ReadabilityPanel.tsx:233, 397, 1112`; `poster/PosterEditor.tsx:889, 3271, 3661-3700` | Tab (Figure) | About 7, plus pasting code | ADJUST. Owner to confirm whether it is hidden |
| 5.4 | Guidelines panel (right side) | Scratch pad (a checklist with 4 built-in templates plus custom ones, and notes); 7 conference specs; 6 writing guides; a shortcuts sheet; 5 resource links. Open by default in windows 1600 px wide or wider; a "Show poster guidelines" toggle | `poster/GuidelinesPanel.tsx:568-775`; `poster/PosterEditor.tsx:639, 761, 3463, 3481` | Shown (wide windows) | 30+ | ADJUST (reference) |
| 5.5 | Preview | A full-screen preview with "Back to Editor" and "Print / Save PDF" | `poster/Sidebar.tsx:1148-1150`; `poster/PosterPreviewOverlay.tsx:194-197` | Tab (Export) | 1 | CORE (light) |

## 6. Edit safety: undo, copy and paste, versions, autosave

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 6.1 | Undo and redo | ⌘Z, and ⌘⇧Z or Ctrl+Y, each with a toast. The store keeps 50 steps and merges bursts of edits. **There are no Undo or Redo buttons** (a search for undo or redo handlers on `onClick` found none). Inside a text field the editor hands the key to the browser, so text has its own separate undo history. Fix 12 addresses this on another branch, not on main | `poster/PosterEditor.tsx:993-1012` (handing off to the browser `:994-997`); `stores/posterStore.ts:20, 181-203` | Deep (keyboard only) | 0 | CORE. PowerPoint has Undo and Redo buttons in the Quick Access Toolbar [PPT knowledge] |
| 6.2 | Copying and pasting blocks | **None.** No ⌘C, ⌘V or ⌘X for blocks; there is only ⌘D (duplicate). Text paste is 2.4 and table paste is 2.8 | `poster/PosterEditor.tsx` (the keydown handlers at `:988-1012, 1219, 2217-2245` contain no c, v or x) | — | — | GAP. "undo/paste" is on the MVP list. In PowerPoint, Ctrl+C/V copies objects [PPT knowledge] |
| 6.3 | Autosave and status pill | Saves 800 ms after the last change. The pill shows Saving…, Saved, or "Save failed" | `hooks/useAutosave.ts:43`; `poster/PosterEditor.tsx:1128, 3424`; `components/AutosaveStatusPill.tsx` | Shown | 0 | AUTO, CORE |
| 6.4 | Versions | ⌘S saves a version. The Versions tab has a name field, "Save version", and Restore and Delete on each version. Restoring first saves the current state. Limit: 20 versions | `poster/PosterEditor.tsx:1162-1213, 1215-1231`; `poster/VersionPanel.tsx:161, 197, 262`; `data/posterVersions.ts:42` | Tab (Versions) | 1 field, 3 buttons | ADJUST (safety beyond autosave) |
| 6.5 | Warnings: two tabs, guest leaving | An alert when the same poster is open in two tabs. A guest with edits sees the browser's leave prompt, and the SecureWorkModal | `pages/Editor.tsx:364, 406`; `hooks/useLeaveGuard.ts` | When it applies | 0–1 | AUTO |

## 7. Export and print

| # | Function / control | What it does | Where | Visibility | Decisions | Class |
|---|---|---|---|---|---|---|
| 7.1 | "⎙ Save PDF" (free) | Opens a print window sized to the poster with `@page size`. The **user still sets 4 options in the print dialog**: Destination, Paper size, Margins None, Background graphics. The sidebar's step list says "Layout = Landscape" where the print window says "Paper size = w × h in", so the two sets of instructions differ. The PDF always carries the credit line (`docs/manual-test-flows.md` §22). If the popup is blocked, an `alert()` appears | `poster/Sidebar.tsx:1157-1194`; `poster/PosterEditor.tsx:2339-2360`; `export/printDocument.ts:81-82, 212-219` | Tab (Export) | 1 click + 4 print-dialog settings | CORE |
| 7.2 | "▤ PowerPoint (.pptx)" (paid) | Without a plan it shows the paywall: a consent checkbox, "Get the term" and "Get the pack". Posters over 56 in on a side export at half size; over 112 in the button is disabled. Paid exports remove the credit mark | `poster/sidebar/EditableExportButtons.tsx:330-438` | Tab (Export) | 1 click (paywall: 1 checkbox + 1 of 2 plans) | CORE (the way back to PowerPoint) |
| 7.3 | LaTeX (.zip) | Turned off | `config/features.ts:84`; `poster/sidebar/EditableExportButtons.tsx:455, 472` | Flag | — | HIDDEN |
| 7.4 | "📦 Save as .postr" | A complete backup bundle that can be imported again | `poster/sidebar/PostrExportButton.tsx:63` | Tab (Export) | 1 | ADJUST |
| 7.5 | "🏪 Email the PDF to Staples" | A walkthrough modal: save the PDF, then Gmail, Outlook or Yahoo links, or copy the address | `poster/Sidebar.tsx:1202-1213`; `components/StaplesPrintModal.tsx:21` | Tab (Export, bottom) | about 5 | ADJUST |
| 7.6 | Publish to gallery | Turned off | `poster/Sidebar.tsx:1218-1240`; `config/features.ts:21` | Flag | — | HIDDEN |

## 8. Controls that are hidden or turned off

| Control | Switch | Where |
|---|---|---|
| Comments tab, "Comment on selection", area comments, share link | `SHARING_ENABLED = false` | `config/features.ts:53`; `poster/Sidebar.tsx:644, 820`; `poster/FloatingFormatToolbar.tsx:377` |
| Rulers and their toggle | `RULERS_ENABLED = false` | 3.14 |
| LaTeX export | `LATEX_EXPORT_ENABLED = false` | 7.3 |
| Publish to gallery | `GALLERY_PUBLIC_ENABLED = false` | 7.6 |
| Review tab (Presentation Checker) | commented out | `poster/Sidebar.tsx:7-12, 642, 811-816` |

## 9. How many decisions each step asks for (counted from the source)

| Step | Needed for blank to export | Customization and adjustment on offer |
|---|---|---|
| 1 Start | New poster (1); size (1 of 9 or 2 fields, then confirm); template (1 of 5, then confirm) **or** Auto-Arrange (0); name (1 field) | Import, Duplicate, the tour |
| 2 Add | Insert (1 of 7); typing; image file; logo pick; table cells; authors (about 6 per author); references (style, then 4 fields or a paste) | Chart questionnaire, table rows and columns (LATER), caption position, spacing and format, AI parse, slash symbols |
| 3 Arrange | Drag, resize, arrow keys, delete, zoom | Rotate, crop, stretch, grid, z-order (right-click on 4 block kinds only) |
| 4 Style | **3 bulk choices:** palette (1 of 8), font (1 of 10), sizes (4 fields) | About 90: 12 typography fields beyond size, heading style 3, presets, custom palette about 25, Copy a design, Edit-tab duplicates 7, toolbar 26, table borders about 19+n |
| 5 Check | Issues tab (0) | Figure readability (about 7), guidelines panel (30+) |
| 6 Safety | Autosave (0); undo (keyboard) | Versions (4) |
| 7 Export | PDF (1 + 4 print-dialog settings); PPTX (1, plus the paywall) | .postr, Staples |

## 10. Findings for the design doc

Each finding carries its own evidence label.

1. **Style is mostly adjustment.** Taking a poster from blank to export needs about 3 bulk style choices: palette, font, and sizes. The Style and Edit tabs and the toolbar offer about 90 more controls (section 9). INSPECTED.
2. **One change appears in several places.** Font size can be set in 3 places, and Auto-Arrange also changes it. Color can be set in 5 (section 4, intro). INSPECTED.
3. **The Edit tab's font controls look per-block but are bulk.** The panel says "Editing: text", yet a change applies to every text block (`Sidebar.tsx:2793-2817`). This already behaves like the bulk edit the owner wants, but it is labelled as a per-block control. INSPECTED.
4. **A−, A+ and the alignment buttons probably do nothing that lasts** (4.10). The sanitizer result is MEASURED; the effect in a browser is UNVERIFIED.
5. **Citation style is not saved with the poster.** It is component state (`PosterEditor.tsx:714`), and `PosterDoc` has no `citationStyle` field (`packages/shared/src/types/poster.ts`). So it should go back to APA 7 on reload. INSPECTED; reload behavior UNVERIFIED.
6. **Missing compared with PowerPoint:** copying and pasting blocks, dropping or pasting images, align and distribute, snapping to other blocks, Undo and Redo buttons, and z-order for text and table blocks. The Postr side is INSPECTED; the PowerPoint side is [PPT knowledge].
7. **The PDF still asks for 4 print-dialog settings**, and the two sets of instructions disagree (7.1). INSPECTED.
8. **Readability check still shown.** The owner calls it stopped, but it is still shown in the Figure tab, the tour and the checklist (5.3). INSPECTED.
9. **`.enw` files are accepted but not parsed.** The References file input accepts them, though the button reads ".bib / .ris" (`Sidebar.tsx:2112-2114`). INSPECTED.

What this does not cover: how anything looks or behaves on screen (I ran no browser); the routes outside the editor (billing, auth, profile); the standalone plot checker.
