# PowerPoint reference for the Postr MVP editor (blank to export)

Role: the PowerPoint half of the MVP editor doc. For each step a researcher takes from a blank poster to a printed PDF, this file says what desktop PowerPoint does, at the level of the controls a user's hands remember. It then sorts each control into **MVP**, **Optional**, or **Skip** for Postr.

Owner direction (Gavin, 2026-10-07): copy PowerPoint's controls and layout so that skills transfer. Support only what it takes to get a poster from blank to export. Keep decisions few, and make font size, theme and layout bulk edits. The readability check has stopped. The standalone plot checker is not covered here. Advanced table editing (inserting or deleting rows and columns) goes to Later.

## Evidence labels

| Label | Meaning |
|---|---|
| `PPT` | From my knowledge of desktop PowerPoint (Microsoft 365, Windows; Mac in brackets). I did not check it against a running copy in this session. I am confident of these. |
| `PPT-UNVERIFIED` | From my knowledge, but I am unsure of the detail (an exact number, a Mac shortcut, a default in the current build). Check before you rely on it. |
| `INSPECTED file:line` | I read it in the repo copy at main `f554eaa`. Paths are relative to `apps/web/src/` unless they start with `packages/`. Nothing was run, so this may be wrong. |
| `JUDGEMENT` | My verdict or recommendation. It is an opinion, not evidence. |
| `MEASURED` | None. I did not run the app or any harness for this file. |

## What the verdicts mean (JUDGEMENT)

- **MVP**: either the poster cannot get from blank to export without it, or a PowerPoint user's hands will reach for it and stall if it is missing or does something else.
- **Optional**: the skill transfers and the control helps, but a poster can be finished without it.
- **Skip**: customisation or fine adjustment that Postr replaces with one bulk rule, or a PowerPoint feature that does not apply to posters.

**Transfer rule:** keep the gesture, not the dialog. A missing feature costs a PowerPoint user one moment. A familiar gesture that does something different costs more, because the user does not notice it happened. So where Postr has a control, it should mean what it means in PowerPoint. Where Postr drops a control, the gesture should do nothing rather than something else. (JUDGEMENT)

---

## 0. The flow at a glance

| # | Step | PowerPoint controls the hands remember | Postr verdict (JUDGEMENT) |
|---|---|---|---|
| 1 | Set the page | Design > Slide Size > Custom | **MVP**: a short preset list plus custom size. Skip the Maximize / Ensure Fit dialog. |
| 2 | Pick a layout | Home > New Slide / Layout gallery, "Click to add…" placeholders, Reset | **MVP**: choose a layout once, with placeholder prompts. **Optional**: Reset. **Skip**: editing layouts. |
| 3 | Insert content | Insert > Text Box / Pictures / Table / Chart, paste or drag a picture in | **MVP**: text, picture (by paste, drag or Insert), table (size chosen at insert, filled by paste). **Optional**: native chart. **Skip**: shapes, SmartArt, icons, WordArt, video. |
| 4 | Select | Click, click into text vs click the border, Esc, Shift/Ctrl+click, marquee, Ctrl+A, Tab | **MVP**: everything except Tab cycling and the Selection Pane, which are **Optional**. |
| 5 | Move and resize | 8 handles plus rotate, Shift to constrain, arrows, Ctrl+arrow fine nudge, Ctrl+D | **MVP**: handles, drag, arrows, Shift, Ctrl+D, fine nudge. **Optional**: rotate, Ctrl+drag to copy. |
| 6 | Line things up | Smart guides, Align / Distribute, Group, Bring to Front / Send to Back | **MVP**: smart guides, Align / Distribute, Front / Back. **Optional**: Group. **Skip**: grid settings, Selection Pane. |
| 7 | Write and format text | Typing, autofit, Font Size box, Ctrl+Shift+> / <, Ctrl+] / [, Ctrl+B/I/U, bullets, Format Painter | **MVP**: typing, box grows to fit, B/I/U, sub/superscript, bullets, size by role. **Skip**: per-box shrink-to-fit, Format Painter, line spacing, per-run fonts. |
| 8 | Paste from elsewhere | Ctrl+V, Paste Options (H / K / U / T), Ctrl+Alt+V | **MVP**: one paste rule in which the destination wins. **Skip**: the Paste Options chooser. |
| 9 | Theme the whole poster | Design > Themes / Variants / Colors / Fonts, Slide Master | **MVP**: one palette pick, one font pick, role sizes edited in one place. **Skip**: theme editors, effects, the Master UI, Design Ideas. |
| 10 | Undo | Ctrl+Z / Ctrl+Y, one history for text and objects | **MVP**: one history, at least 20 levels deep, with typing grouped. **Skip**: the undo dropdown, F4 repeat. |
| 11 | Right-click | Object menu and text menu, mini toolbar | **MVP**: object menu on every block, format bar on text. |
| 12 | View | Ctrl+wheel zoom, Fit to window, F5 | **MVP**: zoom at the cursor, fit. **Optional**: preview. |
| 13 | Save and export | Ctrl+S / AutoSave, File > Export > Create PDF, Ctrl+P | **MVP**: autosave, one Export PDF at true size. **Skip**: the PDF options dialog, XPS, handouts. |

---

## 1. Set the page: slide size

**PowerPoint**
- `PPT` Design > Slide Size gives Standard (4:3), Widescreen (16:9) and Custom Slide Size…. The dialog has Width, Height, Orientation and a "Slides sized for" list.
- `PPT` The maximum is **56 in (142.24 cm)** per side and the minimum is 1 in. Common poster sizes such as 72 × 48 in do not fit, so users build at half scale and ask the print shop to enlarge. This is a well-known poster workaround.
- `PPT` If a deck already has content, changing the size asks **Maximize** or **Ensure Fit**. That is a decision users cannot judge in advance, and they often undo it.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Choose a sheet size from presets | MVP | You cannot export without a size. |
| Custom width × height | MVP | Conference sizes vary. |
| Maximize / Ensure Fit prompt | Skip | Replace it with one documented rescale rule and no dialog. |
| 56 in cap and half-scale workaround | Skip (do not copy) | This is a PowerPoint limit, not a skill worth transferring. |

**Postr today**: `INSPECTED poster/constants.ts:80-93` has 8 presets (48×36, 36×48, 42×36, 36×42, 42×42, 24×36, A0 landscape and portrait), with 48×36 as the default. `INSPECTED poster/constants.ts:20` sets 1 unit = 1/10 in. A custom-size UI exists (`poster/sidebar/SheetSizeFields.tsx`, `poster/PrintSizeFields.tsx`), but I did not read how it behaves.

---

## 2. Pick a layout: layouts and placeholders

**PowerPoint**
- `PPT` Home > New Slide (its dropdown is the layout gallery) and Home > Layout (which changes the current slide). The gallery includes Title Slide, Title and Content, Two Content, Comparison, Title Only and Blank.
- `PPT` Placeholders show grey prompt text such as "Click to add title" and "Click to add text". Clicking puts the caret in the box and the prompt disappears. An empty placeholder does not print.
- `PPT-UNVERIFIED` A content placeholder shows a cluster of insert icons (table, chart, SmartArt, pictures, stock images, icons, video). The exact set varies by build.
- `PPT` Home > **Reset** puts placeholders back to the layout's position, size and formatting. It is the "undo my mess" button.
- `PPT` The layouts themselves are defined in the Slide Master (see step 9). Most users never edit them.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Choose a layout at the start (a few column patterns) | MVP | This is the bulk layout decision. Make it once. |
| Placeholder prompt text ("Click to add title") | MVP | The user knows where to type with no instruction. |
| Change layout later, with content reflowing | Optional | Useful, but it needs a rule for content that does not fit. |
| Reset to layout | Optional | A cheap escape hatch if the layout engine has one. |
| Editing or creating layouts | Skip | That is customisation. |

**Postr today**: `INSPECTED poster/templates.ts:172-180` has 5 layouts (3col, 2col, billboard, sidebar, empty), with 3col as the default.

---

## 3. Insert content

**PowerPoint**
- `PPT` **Text box**: Insert > Text Box. A *click* makes a box that does not wrap and grows wider as you type. A *drag* sets the width, wraps the text and grows taller.
- `PPT` **Pictures**: Insert > Pictures > This Device / Stock Images / Online Pictures. Most users paste an image (Ctrl+V) or drag a file onto the slide. Pictures keep their aspect ratio on corner drags by default.
- `PPT` **Table**: Insert > Table opens a grid picker (`PPT-UNVERIFIED` up to 10 × 8), Insert Table… (rows and columns), Draw Table, or an Excel spreadsheet. Pasting cells from Excel or Word makes a PowerPoint table. Tab moves to the next cell, and **Tab in the last cell adds a row**. Table Design (styles, header row, banding, borders) and Layout (insert or delete rows and columns, merge, split, distribute) are ribbon tabs.
- `PPT` **Chart**: Insert > Chart picks a type, then opens an embedded Excel sheet for the data. Next to the chart are Chart Elements (+), Chart Styles (brush) and Chart Filters buttons.
- `PPT` Also on the Insert tab: Shapes, Icons, SmartArt, WordArt, Equation, Symbol, Video, Audio.
- PowerPoint has no structured authors, affiliations, references or logo objects. Users type authors and superscript numbers into a text box by hand, and paste logos as pictures. (`PPT`)

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Text box (add, type) | MVP | It is the core of a poster. |
| Picture by paste, drag-drop or Insert | MVP | Researchers make figures in R, Python or Prism and paste them in. Paste is the path their hands know. |
| Table with size chosen at insert, filled by pasting from Excel or Word | MVP | Results tables arrive by paste. |
| Table: insert or delete rows and columns, merge, split, Tab-adds-row | **Later** | Owner decision, 2026-10-07. |
| Table styles gallery | Skip | The table look should follow the theme. |
| Native chart from data | Optional | `JUDGEMENT`, not measured: researchers rarely make final figures with PowerPoint's chart tool. |
| Authors / affiliations, references, logo blocks | MVP (Postr-only) | No transfer is needed, and they remove manual superscript and numbering work. This is in the owner's MVP list. |
| Shapes / arrows | Skip for MVP (Later) | Nice for flow diagrams, but not needed to get from blank to export. |
| SmartArt, Icons, WordArt, Video, Audio, Stock images | Skip | Customisation, or not relevant to posters. |
| Symbol / Equation | Optional | Greek letters matter. Full equations are Later. |

**Postr today**: `INSPECTED packages/shared/src/types/poster.ts:9-18` defines the block types: title, authors, heading, text, image, logo, table, references, chart. `INSPECTED poster/GuidelinesPanel.tsx:945-951` says Tab moves to the next cell, and that rows pasted from Excel or Word fill the table from the cell pasted into, the table growing to fit (fix 32, `docs/fixes/32-table-paste.md`; before it, the panel said the paste replaced the whole table, which the code did). `INSPECTED poster/blocks.tsx:628-638` shows Tab in the last cell does nothing (no new row), which fits the Later decision. I did not inspect pasting an image from the clipboard onto the canvas (UNVERIFIED).

---

## 4. Select

**PowerPoint**
- `PPT` Clicking on text inside a box puts the caret there. The box shows a **dashed** border (text-edit mode). Clicking the box's **edge** selects the box as an object, with a **solid** border.
- `PPT` With the box selected as an object, formatting commands (Ctrl+B, font size, colour) apply to *all* the text in it. `PPT-UNVERIFIED`: typing while a shape is object-selected replaces its text.
- `PPT` **Esc** in text-edit mode leaves the box selected as an object. A second Esc deselects.
- `PPT` **Shift+click or Ctrl+click** adds an object to the selection or removes it.
- `PPT` **Drag on empty slide** draws a marquee that selects only objects it *fully* encloses.
- `PPT` **Ctrl+A** selects all objects when not editing text, and all text when editing.
- `PPT` **Tab / Shift+Tab** cycles through objects in stacking order when not editing text. This is the only way to reach a covered object without the Selection Pane.
- `PPT` **Selection Pane** (Home > Arrange > Selection Pane, Alt+F10) lists every object, front first. It lets you rename, hide (eye icon), reorder by drag, and select hidden objects.
- `PPT` The first click on a group selects the group. A second click selects the object inside it.

**Verdict (JUDGEMENT)**

| Control | Verdict |
|---|---|
| Click to select; click in text to edit; edge-select vs text-edit look different | MVP |
| Esc steps out of text editing, then deselects | MVP |
| Shift/Ctrl/⌘+click to add or remove | MVP |
| Marquee drag on empty canvas | MVP |
| Ctrl/⌘+A selects all blocks (outside text) | MVP |
| Delete / Backspace removes the selection | MVP |
| Formatting applies to the whole box when the box is object-selected | MVP. This is PowerPoint's per-box "bulk" gesture, and users expect it. |
| Tab to cycle blocks | Optional |
| Selection Pane | Skip |

**Postr today**: `INSPECTED poster/PosterEditor.tsx:678, 2787-2796` has rubber-band (marquee) selection that starts on the canvas. `INSPECTED poster/PosterEditor.tsx:2217-2226`: Delete and Backspace remove all selected blocks except locked ones. I did not inspect Esc behaviour, Shift+click, or Ctrl+A for blocks (UNVERIFIED).

---

## 5. Move and resize

**PowerPoint**
- `PPT` Eight sizing handles (4 corners, 4 sides) plus a **rotation handle** above the top edge. Some shapes also have a yellow adjustment handle.
- `PPT` **Shift** while resizing keeps the proportions. Pictures already keep them on corner drags by default, while side handles distort. **Ctrl** while resizing scales from the centre.
- `PPT` **Shift while dragging** keeps the move horizontal or vertical. **Ctrl+drag** drops a copy. **Alt while dragging** turns snapping off for that drag.
- `PPT` **Shift while rotating** snaps to 15° steps.
- `PPT` **Arrow keys** nudge. `PPT-UNVERIFIED`: with snap-to-grid on, a nudge is about the grid spacing, which defaults to 1/12 in.
- `PPT` **Ctrl+arrow** nudges in much smaller steps (fine nudge). `PPT-UNVERIFIED` [Mac: the fine-nudge modifier, either ⌘ or Option].
- `PPT-UNVERIFIED` **Shift+arrow resizes** the selected object (Ctrl+Shift+arrow for fine steps). **Alt+Left/Right rotates** by 15°.
- `PPT` **Ctrl+D** duplicates the selection, offset slightly.
- `PPT` Format pane > Size & Properties takes typed width, height, position and rotation.

**Verdict (JUDGEMENT)**

| Control | Verdict | Note |
|---|---|---|
| 8 handles, drag to move | MVP | |
| Shift to constrain (aspect on resize, axis on move) | MVP | |
| Pictures keep aspect by default | MVP | Distorted figures are a real poster defect. |
| Arrow nudge | MVP | |
| Fine nudge on **Ctrl/⌘+arrow** | MVP | This is the PowerPoint gesture. See the conflict below. |
| Ctrl/⌘+D duplicate | MVP | |
| Ctrl/⌘+C / V of blocks | MVP | I did not inspect this in Postr (UNVERIFIED). |
| Rotate handle, Shift to 15° | Optional | Posters rarely rotate blocks. |
| Ctrl+drag to copy, Alt to bypass snap, Ctrl to resize from centre | Optional | |
| Shift+arrow resize, Alt+arrow rotate | Skip | Low use. Leave the keys **inert** rather than reusing them. |
| Size & Position typed fields | Skip | The layout and the snap grid make the decisions. |

**Postr today and transfer conflicts**
- `INSPECTED poster/PosterEditor.tsx:2235`: `const nudge = e.shiftKey ? 1 : SNAP_GRID;`. **Shift+arrow is the fine nudge** (1 unit = 0.1 in). In PowerPoint, Shift+arrow resizes (`PPT-UNVERIFIED`). `PPT-UNVERIFIED`: Shift for fine nudge matches Google Slides, not PowerPoint.
- `INSPECTED poster/PosterEditor.tsx:2235-2243`: the arrow handler does not check Ctrl or ⌘, so **Ctrl/⌘+arrow does the coarse nudge** (`SNAP_GRID` = 5 units = 0.5 in, `INSPECTED poster/constants.ts:60`). PowerPoint users expect Ctrl+arrow to be the fine nudge, so their hands get the opposite result. ⚠ Transfer conflict. Suggested fix (JUDGEMENT): make Ctrl/⌘+arrow the fine nudge. Keeping Shift+arrow as a fine-nudge alias does little harm.
- `INSPECTED poster/PosterEditor.tsx:383-384`: Shift while rotating gives 15° steps, as in PowerPoint. Without Shift, rotation sticks magnetically at 45° multiples (lines 386-397), which is not PowerPoint behaviour but does no harm.
- `INSPECTED poster/PosterEditor.tsx:452-455`: aspect is locked while Shift is held, or for an image in contain mode, as in PowerPoint.
- `INSPECTED poster/PosterEditor.tsx:2228-2232`: Ctrl/⌘+D duplicates, but only for a single selection. PowerPoint duplicates a multi-selection too.

---

## 6. Line things up: guides, align, group, stacking order

**PowerPoint**
- `PPT` **Smart guides**: red dashed lines appear while you drag, when an edge or centre lines up with another object or with the slide centre. Arrows show equal spacing. They are on by default. Most users align by watching these, not through menus.
- `PPT` View > Guides (Alt+F9), Gridlines (Shift+F9), Ruler. Right-click > Grid and Guides… opens the snap-to-grid, spacing and smart-guide toggles.
- `PPT` **Align**: Home > Arrange > Align, or Shape Format > Align. Options are Left / Center / Right / Top / Middle / Bottom, Distribute Horizontally / Vertically, and the choice between **Align to Slide** and **Align Selected Objects**. With one object selected, it aligns to the slide.
- `PPT` **Group** is Ctrl+G and **Ungroup** is Ctrl+Shift+G, with Regroup also available. `PPT-UNVERIFIED` [Mac: ⌘+Option+G / ⌘+Option+Shift+G].
- `PPT` **Stacking order**: right-click > Bring to Front ▸ (Bring to Front, Bring Forward) and Send to Back ▸ (Send to Back, Send Backward). The same commands are under Home > Arrange. `PPT-UNVERIFIED`: the keyboard shortcuts for these. Rely on the right-click path, which is what the hands remember.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Smart guides while dragging (edges, centres, sheet centre) | MVP | This is how PowerPoint users align. Without it they eyeball, which is the "small dumb repeated task". |
| Align (6) + Distribute (2) on a multi-selection; one block aligns to the sheet | MVP | One action replaces many nudges. It is a bulk edit. |
| Snap to a grid | MVP (invisible) | Keep it on with no settings. |
| Bring to Front / Send to Back (right-click) | MVP | Figures and text boxes do overlap. |
| Group / Ungroup | Optional | It helps to move a figure together with its caption, but captions may already be part of the block. |
| Grid and Guides dialog, visible gridlines, rulers | Skip | Rulers are already parked (memory index: item 4 hidden). |
| Selection Pane | Skip | |

**Postr today**: `INSPECTED poster/snap.ts:9-16` and `poster/constants.ts:60-63` snap to a 0.5 in grid within a threshold of 0.3 in. `INSPECTED poster/blocks.tsx:2723-2729`: the block menu offers Bring Forward and Send Back, one step each. PowerPoint's top-level items are Bring to *Front* and Send to *Back*, with the one-step versions inside the flyout. `poster/GroupFrame.tsx` and `poster/selectionLayout.ts` exist, but I did not read them, so whether smart guides, align and group exist is UNVERIFIED.

---

## 7. Write and format text

**PowerPoint**
- `PPT` **Autofit** (Format Shape > Text Options > Text Box): *Do not Autofit*, *Shrink text on overflow* (the default for body placeholders) and *Resize shape to fit text* (the default for inserted text boxes). The **AutoFit Options** button appears when a placeholder overflows. It can be turned off globally under AutoCorrect > AutoFormat As You Type.
- `PPT` **Font Size box** on Home: a dropdown list (`PPT-UNVERIFIED` 8 to 96 pt) and a field you can type any value into (`PPT-UNVERIFIED` up to 4000 pt).
- `PPT` **Ctrl+Shift+> / <** steps to the next or previous size in the list. `PPT-UNVERIFIED` **Ctrl+] / [** changes size by 1 pt. [Mac: ⌘+Shift+> / <, ⌘+] / [.] With several boxes selected as objects, each one steps and keeps its relative sizes. This is how users "make everything bigger".
- `PPT` Ctrl+B / I / U. Superscript is **Ctrl+Shift+=** and subscript is **Ctrl+=**. **Ctrl+Space** clears character formatting.
- `PPT` Bullets and Numbering buttons on Home. Body placeholders have bullets by default. **Tab / Shift+Tab** at the start of a line demotes or promotes the list level.
- `PPT` **Format Painter** (Home): a single click applies once, a double click stays on until Esc. Ctrl+Shift+C / Ctrl+Shift+V copy and paste formatting.
- `PPT` The **mini toolbar** appears above selected text and above the right-click menu, with font, size, B/I/U, colour and Format Painter.
- `PPT` Line spacing, paragraph spacing, character spacing, text direction, columns and text effects sit on Home or in the Paragraph and Font dialogs.

**PowerPoint's poster traps (`PPT`; the narrative link is JUDGEMENT)**
1. *Shrink text on overflow* quietly gives each body box a different size, so a poster ends up with 24, 22 and 19 pt body text in neighbouring columns.
2. A size typed into one box becomes hard formatting. That box no longer follows the Slide Master, so later bulk changes miss it.
3. Making "everything bigger" means selecting every box and pressing Ctrl+Shift+> once per box group. Titles and body step by different amounts, because the list's steps are not proportional.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Type into a block; block grows to fit (no shrink) | MVP | It removes trap 1. |
| Ctrl/⌘+B / I / U | MVP | Pure transfer. |
| Superscript / subscript (Ctrl+Shift+= / Ctrl+=) | MVP | Units, citations, affiliations. |
| Bullets on/off | MVP | Poster body text is mostly bullet points. |
| **Size by role** (title / heading / authors / body), set once and applied everywhere | MVP | This is the owner's bulk font-size edit, and it is PowerPoint's Slide Master text styles without the Master. |
| Font Size box and Ctrl+Shift+> / < on a selected block | MVP **gesture**, role **scope** | Keep the keys and the box, but change the size of that block's *role* and say so on screen (for example "Body: 36 pt, all body text"). This changes what the gesture affects, so the label is required. |
| List level with Tab / Shift+Tab | Optional | |
| Font colour per run | Optional | The theme should decide. |
| Format Painter | Skip | With sizes set per role there is nothing to copy. "Make this a heading" (changing a block's role) replaces it. |
| Shrink-on-overflow, per-run font face or size, line / character spacing, text effects, columns | Skip | Customisation. Spacing follows the role. |

**Postr today**: `INSPECTED packages/shared/src/types/poster.ts:282-297` has 4 role styles (title, heading, authors, body), each with size, weight, italic, lineHeight, colour and highlight. `INSPECTED packages/shared/src/types/poster.ts:175-278`: the Block interface has **no** per-block font size, face or colour fields, so a role change reaches every block. That is structurally better than PowerPoint's Master, which hard formatting defeats. The exception is inline colour spans (see step 8). `INSPECTED poster/sanitizeHtml.ts:20-26`: inline formatting allows b/strong/i/em/u, s/strike/del, mark, sub/sup, br, and span with colour or background-colour. There is no inline font size.

---

## 8. Paste from elsewhere

**PowerPoint**
- `PPT` Ctrl+V pastes, and a **Paste Options** button appears (press Ctrl to open it). For text the choices are **Use Destination Theme (H)**, **Keep Source Formatting (K)**, **Picture (U)** and **Keep Text Only (T)**. **The default is Use Destination Theme.**
- `PPT-UNVERIFIED` Use Destination Theme maps theme fonts and colours to the destination, but formatting set *explicitly* in the source (for example Word's 11 pt or a hard-coded font) can come along. That is why users end with Keep Text Only, Ctrl+Space, or retyping. This is the "format reset on paste" chore named in the master narrative.
- `PPT` Ctrl+Alt+V opens Paste Special. `PPT-UNVERIFIED`: unlike Word, PowerPoint has no setting to change the default paste.
- `PPT` Pasting a picture with no text box in edit mode creates a picture object. Pasting Excel cells creates a table.

**Verdict (JUDGEMENT)**

| Control | Verdict | Rule |
|---|---|---|
| Ctrl/⌘+V into a text block | MVP | **The destination wins**: the text takes the block's role style. Keep bold, italic, sub/superscript and line breaks, and drop size and face. No chooser. |
| Ctrl/⌘+V of an image on the canvas | MVP | Make an image block. |
| Ctrl/⌘+V of Excel or Word cells | MVP | Fill a table. |
| Paste Options chooser, Paste Special, Keep Source Formatting | Skip | Each is a decision the bulk rule removes. |

**Postr today**: `INSPECTED poster/RichTextEditor.tsx:239-257` always sanitises paste through the allowlist, keeping paragraph breaks as `<br>` or spaces. Size and face are dropped, which matches the rule. **Open question for the lead**: span colour and background-colour survive (`poster/sanitizeHtml.ts:20-26`), so pasted *colour* and highlight come from the source while everything else comes from the destination. PowerPoint's default would remap theme colours (`PPT-UNVERIFIED` for explicit RGB).

---

## 9. Theme the whole poster

**PowerPoint**
- `PPT` Design > **Themes** gallery: one click changes colours, fonts, effects, background and layouts on every slide. **Variants** gallery, with a ▸ menu for Colors / Fonts / Effects / Background Styles.
- `PPT` **Theme colours** are 12 slots: Dark 1, Light 1, Dark 2, Light 2, Accent 1-6, Hyperlink and Followed Hyperlink. Every colour picker shows a *Theme Colors* grid (10 columns, each with tints and shades), then Standard Colors, Recent, More Colors… and the Eyedropper. A colour picked from the theme grid follows later theme changes. One picked from Standard or More Colors does not.
- `PPT` **Theme fonts** are a Headings + Body pair. The font list starts with "Theme Fonts: X (Headings), Y (Body)", and text set to those follows theme changes. `PPT-UNVERIFIED`: the default changed from Calibri Light / Calibri to Aptos Display / Aptos around 2023-24.
- `PPT` **Slide Master** (View > Slide Master) is the real bulk-edit tool. The master's title and body text styles (5 visible levels) flow to every layout and slide unless a box is hard-formatted. Most users never open it and hand-format every box instead. `PPT-UNVERIFIED`: the default sizes (title about 44 pt, body levels about 28 / 24 / 20 / 18 / 18).
- `PPT` **Designer / Design Ideas** (Design > Designer) suggests slide layouts from the slide's content.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Pick one palette, applied to the whole poster | MVP | Bulk theme, and the same gesture as the Themes gallery. |
| Pick one font (or one pair), applied to everything | MVP | Bulk. A pick from a short curated list. |
| Role sizes edited in one place | MVP | This is the Slide Master's job with no Master UI to learn. |
| Colour pickers that offer palette slots first | MVP if per-run colour stays | It keeps colours following the theme, as PowerPoint's Theme Colors grid does. |
| Custom theme-colour editor, More Colors, Eyedropper | Skip | Customisation. |
| Effects, Background Styles, Variants beyond palettes | Skip | |
| Slide Master editing UI, custom layouts | Skip | |
| Designer / Design Ideas | Skip | |

**Postr today**: `INSPECTED packages/shared/src/types/poster.ts:299-307` has a 7-slot palette (bg, primary, accent, accent2, muted, headerBg, headerFg). `INSPECTED packages/shared/src/types/poster.ts:352-365`: PosterDoc has **one** `fontFamily` (not a heading/body pair), plus `palette`, `styles` and `headingStyle`. `INSPECTED poster/constants.ts:1-11` says the curated defaults are deliberate: "students should not need to pick from 400 fonts".

---

## 10. Undo and redo

**PowerPoint**
- `PPT` **Ctrl+Z** undoes and **Ctrl+Y** redoes (or repeats the last action when there is nothing to redo, as F4 does). The undo arrow on the Quick Access Toolbar has a dropdown that undoes several steps at once.
- `PPT` There is **one history** for typing and object edits. Ctrl+Z inside a text box can undo the typing and then the move before it.
- `PPT-UNVERIFIED` Typing is grouped into chunks (roughly per word or per typing run), not per keystroke.
- `PPT-UNVERIFIED` The default is **20** levels, configurable up to 150 under File > Options > Advanced > Maximum number of undos (Windows). I am unsure of the current M365 default and of Mac. [Mac: ⌘+Z, ⌘+Y; `PPT-UNVERIFIED` ⌘+Shift+Z.]

**Verdict (JUDGEMENT)**

| Control | Verdict |
|---|---|
| Ctrl/⌘+Z, Ctrl+Y and ⌘/Ctrl+Shift+Z | MVP |
| One history across text and block edits, including Ctrl+Z inside a text block | MVP |
| Typing grouped into chunks; at least 20 levels | MVP |
| Undo dropdown, F4 / Ctrl+Y repeat | Skip |

**Postr today**: `INSPECTED poster/PosterEditor.tsx:993-997`: Ctrl+Z is **ignored when focus is in an input or contentEditable**, so inside a text block the browser's own undo runs as a separate history. That differs from PowerPoint's single history. ⚠ Transfer conflict. `INSPECTED stores/posterStore.ts:20, 165-204` sets a 50-step history with keystroke grouping. The local branch name `fix/12-one-undo-history` (from the session's git status) suggests this is being worked on. I did not read that branch (UNVERIFIED).

---

## 11. Right-click menus and the mini toolbar

**PowerPoint**
- `PPT` Right-click on an object gives the mini toolbar plus Cut / Copy / Paste Options, Edit Text, Group ▸, Bring to Front ▸, Send to Back ▸, Link, Save as Picture (pictures), Edit Alt Text, Size and Position, and Format Shape / Picture.
- `PPT` Right-click inside text gives Cut / Copy / Paste Options, Font…, Paragraph…, Bullets ▸, Numbering ▸ and the object items as well.
- `PPT` Right-click on an empty slide gives Paste Options, Layout ▸, Reset Slide, Format Background…, Grid and Guides… and Ruler.

**Verdict (JUDGEMENT)**

| Control | Verdict |
|---|---|
| Right-click on **any** block: Cut / Copy / Paste, Duplicate, Delete, Bring to Front / Send to Back | MVP |
| Floating format bar on a text selection (B / I / U, sub / superscript, bullets, role) | MVP |
| Right-click on empty canvas: Paste, Layout | Optional |
| Format… dialogs, Save as Picture, Link, Size and Position | Skip |

**Postr today**: `INSPECTED poster/blocks.tsx:2723-2729`: the block menu has Duplicate (⌘D), Bring Forward, Send Back and Delete (⌫). `INSPECTED poster/blocks.tsx:2077-2091`: that menu is **skipped for title, text, heading, authors and table blocks**, which get the browser menu (tables have their own cell menu, `poster/blocks.tsx:1030-1034`). So right-clicking a text block never offers object commands, while in PowerPoint it does. ⚠ Transfer gap. `poster/FloatingFormatToolbar.tsx` exists, but I did not read it.

---

## 12. View: zoom and preview

**PowerPoint**
- `PPT` Ctrl+mouse wheel or a trackpad pinch zooms. The status bar has a zoom slider and a **Fit slide to current window** button. View > Zoom… gives a percentage.
- `PPT` F5 starts the slideshow from the beginning and Shift+F5 from the current slide. Poster makers use this as a full-screen preview.

**Verdict (JUDGEMENT)**: zoom at the cursor (pinch or Ctrl/⌘+wheel) plus "fit" is **MVP**, because a 48 in sheet cannot be edited at 100%. Full-screen preview is **Optional**.

**Postr today**: `INSPECTED poster/PosterEditor.tsx:1268-1305`: pinch or Ctrl/⌘+wheel zooms around the cursor, and plain scrolling pans. `poster/PosterPreviewOverlay.tsx` exists (not read).

---

## 13. Save and export

**PowerPoint**
- `PPT` Ctrl+S saves. AutoSave is on for OneDrive / SharePoint files.
- `PPT` File > Export > Create PDF/XPS Document, or Save As > PDF. Optimize for: *Standard (publishing online and printing)* or *Minimum size*. Options… covers range, PDF/A and "bitmap text when fonts may not be embedded". Fonts are embedded when their licence allows.
- `PPT` File > Print (Ctrl+P): printer, slide range, Full Page Slides, *Scale to Fit Paper*, High Quality.
- `PPT-UNVERIFIED` Pictures are compressed by default (File > Options > Advanced > Image Size and Quality, default resolution about 220 ppi, with a "Do not compress images in file" box). This degrades large-format prints, and more so for posters built at half scale.

**Verdict (JUDGEMENT)**

| Control | Verdict | Why |
|---|---|---|
| Autosave; Ctrl/⌘+S does not open the browser's Save dialog | MVP | |
| One **Export PDF** at the poster's true size, with fonts embedded and images at source resolution | MVP | This is the end of the flow. No options dialog. |
| PNG export | Optional | |
| PDF options dialog, XPS, handouts, notes pages, print scaling | Skip | |

**Postr today**: `INSPECTED export/printDocument.ts:1-22`: the PDF comes from a print window whose `@page` size is the poster's inches. `INSPECTED poster/PosterEditor.tsx:1215-1228`: Ctrl/⌘+S saves a *version* and suppresses the browser dialog. Editable PPTX export is a paid feature (memory: monetization model) and outside this doc.

---

## Consolidated lists (JUDGEMENT)

**MVP: the gesture must exist and mean what it means in PowerPoint**
Sheet size presets and custom size · layout pick with placeholder prompts · text, picture, table and logo / authors / references blocks · click, edge-select, Esc, Shift/⌘+click, marquee, ⌘A, Delete · 8 handles, drag, Shift to constrain, pictures keep aspect · arrow nudge and **Ctrl/⌘+arrow fine nudge** · ⌘D, ⌘C / ⌘V of blocks · smart guides · Align and Distribute · Bring to Front / Send to Back · typing with the box growing to fit · ⌘B / I / U, sub/superscript (Ctrl+Shift+= / Ctrl+=), bullets · Font Size box and Ctrl+Shift+> / < **scoped to the role and labelled** · paste where the destination wins (text, image, table) · one palette · one font · role sizes in one place · one undo history (⌘Z / ⌘Y / ⌘⇧Z) · right-click object menu on every block · format bar on text · zoom at the cursor and fit · autosave · one Export PDF.

**Optional**: native chart · Symbol · change layout later / Reset · Tab to cycle blocks · rotate · Ctrl+drag to copy · Alt to bypass snap · Group · list levels · per-run colour from palette slots · right-click on empty canvas · preview · PNG.

**Skip (customisation that a bulk rule replaces, or not relevant to posters)**: Maximize / Ensure Fit dialog · layout and Master editing · shapes (Later), SmartArt, icons, WordArt, video, stock images · table styles and row/column editing (Later) · Selection Pane · Grid and Guides dialog, rulers · Size and Position fields · Shift+arrow resize and Alt+arrow rotate (leave inert) · shrink-on-overflow · per-run font and size · line and character spacing · Format Painter · Paste Options / Paste Special · theme colour and font editors, effects, backgrounds, variants · Designer · undo dropdown and F4 · PDF options dialog.

## Transfer conflicts found in the code (INSPECTED, not run)

1. **Ctrl/⌘+arrow does the coarse nudge (0.5 in); PowerPoint uses it for the fine nudge.** `poster/PosterEditor.tsx:2235-2243`.
2. **Shift+arrow does the fine nudge; in PowerPoint it resizes** (`PPT-UNVERIFIED`). `poster/PosterEditor.tsx:2235`.
3. **Ctrl+Z inside a text block bypasses the editor's history.** `poster/PosterEditor.tsx:993-997`. A branch is possibly in flight (UNVERIFIED).
4. **Right-clicking a text, title, heading, authors or table block gives no object menu.** `poster/blocks.tsx:2077-2091`.
5. **The menu offers one-step Bring Forward / Send Back but not Bring to Front / Send to Back.** `poster/blocks.tsx:2726-2727`.
6. **Pasted colour and highlight come from the source.** `poster/sanitizeHtml.ts:20-26`. Whether this is intended is a question for the lead.
7. **⌘D duplicates only a single selection.** `poster/PosterEditor.tsx:2228-2232`.

## What this file does not establish

- I did not open PowerPoint, so every `PPT` line is from memory. Shortcut details marked `PPT-UNVERIFIED` (Shift+arrow resize, the z-order keys, Mac fine nudge and group keys, undo default, compression default, maximum font size) need a check on a real copy before they go into a spec.
- I did not run Postr. Every "Postr today" line is a code reading at `f554eaa` and may differ from what renders. I did not read whether smart guides, Align / Distribute, grouping, Esc, Shift+click, Ctrl+A, block copy-paste or image paste exist.
- I could not find the master narrative (`docs/brand/master-narrative.md`) in this repo copy, so I quote its idea from the task text.
- Every verdict (MVP / Optional / Skip) is JUDGEMENT. None is backed by user data.
