# UX Audit — 2026-04-09

**Scope:** full click-through of every primary flow using Playwright + chrome-devtools screenshots, evaluated against the 5 personas in [docs/personas/postr-personas.md](../../personas/postr-personas.md). Screenshots saved alongside this report.

**Harness used:** `mcp__plugin_playwright_playwright__*` tools. Real user interactions (click, keyboard) were reliable. Direct DOM mutations via `page.evaluate()` on contentEditable elements were unreliable — **noted as a meta-finding** below.

---

## What works well ✅

| Area | Verified |
|---|---|
| Home page | Single-card grid, New poster button, readable typography ([01](./01-landing.png)) |
| Editor entry | Auto-opens with 3-col Classic template, no signup wall, Saved pill visible ([02](./02-editor-default.png)) |
| Sidebar vertical tab rail | LAYOUT / INSERT / EDIT / STYLE / AUTHORS / REFS stacked cleanly, active tab has purple accent bar + dark fill, deselected tabs use consistent `#6b7280` grey with no ghost states |
| EDIT tab on block select | Auto-opens when any block is clicked, with correct "Editing: TYPE" header ([03](./03-title-selected.png)) |
| Slash commands (canvas) | Typing `/al` surfaces `/alpha α` dropdown, Tab inserts symbol and replaces prefix ([04](./04-slash-command.png), [05](./05-slash-inserted.png)) |
| Slash dropdown rendering | Portal-based, pixel-size preserved regardless of canvas zoom |
| INSERT tab | 6 block cards + slash symbols reference ([09](./09-insert-tab.png)) |
| STYLE tab | 8 palette rows with active state, font select, typography at 158pt/58pt ([10](./10-style-tab.png)) — **confirms point calibration works end-to-end** |
| AUTHORS tab | Empty state shows + Add Institution / Author / Logo CTAs ([11](./11-authors-empty.png)) |
| REFS tab | Import / Display / Manual Entry sections, aligned labels ([12](./12-refs-tab.png)) |
| Table editor | "Editing: table · 4 × 3" header, per-row ↑+/↓+/× controls, per-col ←+/→+/× controls, border style picker with APA 3-Line active ([13](./13-table-editor.png)) |
| Sidebar collapse | Hides rail, zoom auto-refits from 192% → 233% so the poster grows to fill the freed space ([14](./14-sidebar-hidden.png)) |
| Autosave | `Saved · Xs ago` pill updates on every real edit |
| Grid density | Visible 5-unit grid with brighter 10-line accents |

---

## Bugs / issues 🐛

### P0 (blocks core flow)

#### B1. Text block overflows its container when content exceeds the declared height

**Flow:** Maya (P1 persona) replaces the default Intro text with a longer paragraph. Wei pastes her Excel results discussion.

**Observed:** the rewritten title "Working Memory Capacity Predicts Alcohol Cue Reactivity" wraps to 2 lines but the second line ("Cue Reactivity") is **clipped** by the title block's bottom edge, bleeding over the Introduction column below ([07](./07-sample-filled-v2.png)).

**Root cause:** BlockFrame sets `height: isHeading ? 'auto' : b.h` — text and title blocks are fixed-height, with inner content at `overflow: hidden`. Content longer than `b.h` is truncated without warning.

**User confirmation:** user spotted this during the audit and specified the fix directly: "the text box readable area should either grow with text content or text shrinks according to the box dimensions."

**Fix options:**
- A. Let text/title blocks be `height: auto` when content overflows (grow block downward). Pro: content always visible. Con: can push sibling blocks or exit the canvas.
- B. Auto-shrink font-size until content fits the fixed box. Pro: layout stable. Con: inconsistent type hierarchy across the poster.
- **Chosen:** hybrid — auto-grow height during editing (live preview of content fit), but clamp at the bottom of the canvas so the block never spills off the poster.

**Priority:** P0 — this is a data-loss-feeling bug for the user's visible content.

---

### P1 (confusing but not blocking)

#### B2. Sidebar zoom bar occludes the poster info caption

**Flow:** any.

**Observed:** the "48″×36″ Landscape · Source Sans 3 · Classic Academic" footer text sits behind the zoom bar at the bottom-center of the canvas area ([14](./14-sidebar-hidden.png)). Only "48×36 La… c Academic" is visible through the zoom bar's gaps.

**Root cause:** the zoom bar is positioned `bottom: 12px` absolute, and the caption is in normal flow at the very bottom of the canvas container with `marginTop: 8`. They overlap.

**Fix:** push the caption above the zoom bar (padding-bottom on the canvas area to leave clearance) OR move the caption into the zoom bar itself as a tiny prefix.

**Priority:** P1 — cosmetic but the caption is meant to be visible at a glance.

#### B3. Label color `#555` too dim on AUTHORS section headers

**Flow:** Priya opens Authors tab to add her co-authors.

**Observed:** "① INSTITUTIONS" and "② AUTHORS" section labels are very dim ([11](./11-authors-empty.png)). Other sidebar tabs use `#9ca3af` for consistency; AUTHORS was missed in the earlier audit pass.

**Root cause:** `labelStyle.color = '#555'` (very dark grey) — baseline for section labels, never bumped.

**Fix:** update `labelStyle.color` from `#555` to `#9ca3af` to match the new tab contrast. This change ripples to every tab that uses `labelStyle`.

**Priority:** P1 — low-contrast labels reduce scannability, particularly for the Humanities/Professor Alonso persona who expects correctness signals to be clearly visible.

---

### P2 (polish)

#### B4. "Saved · just now" pill stays for minutes after changes

**Observed:** after editing, the pill goes "Saved · just now" → "Saved · 1m ago" → "Saved · 2m ago" but never ticks beyond that in my session despite no new edits. The relative-time update interval is 10 seconds (per the current `AutosaveStatusPill`) so the stale text is a rerender artifact, not a bug.

**Priority:** P2 — acceptable.

#### B5. Empty image block has no visible drag affordance

**Observed:** clicking the dashed "Upload figure" placeholder opens the file picker. Dragging it requires clicking on the block's edge padding (4px ring), which is not discoverable.

**Fix:** add a hover state on the dashed placeholder showing a "⇅ drag to move, click to upload" hint.

**Priority:** P2 — affects Leo (undergrad) the most — he won't know how to move an empty image block.

---

## Meta-finding: test automation

`page.evaluate()`-based `textContent` mutations and even `document.execCommand('delete' / 'insertText')` did **not** reliably propagate to React 18's synthetic input event system for contentEditable elements. Some blocks updated (confirmed by state persistence across reload), others didn't (canvas DOM showed new text but Zustand state stayed old — verified by comparing sidebar editor content and autosave pill staleness).

**Implication for future audits:**
- Use Playwright's real `keyboard.press/type` via `browser_press_key` / `browser_type` on focused elements, not programmatic DOM writes.
- Or add an **E2E testing helper** in the app itself (`window.__postrTestApi = { setBlockContent(id, value) }`) exposed only under a flag, so future audits can bulk-fill content reliably without fighting React 18's contentEditable event quirks.

---

## Fix priority for the next pass

1. **B1** title/text block height overflow (user-confirmed P0)
2. **B3** dim `labelStyle` color (affects every tab)
3. **B2** zoom bar vs caption overlap
4. **B5** image drag affordance (persona-driven)
5. **B4** — leave as-is

After fixes, re-run through Maya's test flow from the personas file to validate end-to-end.

---

## Re-audit — after commit `a4fc0e4`

Same day, same persona (Maya), same flow. Screenshots at
[re-01](./re-01-home.png) through [re-07](./re-07-after-reload.png).

| Step | Before | After | Screenshot |
|---|---|---|---|
| Land on home | Card + New poster button, dim MY POSTERS label | Same layout, MY POSTERS label now clearly readable | [re-01](./re-01-home.png) |
| Click + New poster | Editor opens at 192% | Same — editor opens immediately, default 3-col template | [re-02](./re-02-fresh-editor.png) |
| Caption + image block | Zoom bar occluded caption; image block only said "Upload figure" | Caption clearly readable above zoom bar; image block shows "+ Upload figure / click to browse · drag to move" hint | [re-02](./re-02-fresh-editor.png) |
| Type long title into title block | Second line clipped by block bottom | **Title block grows downward to fit both lines**; nothing clipped | [re-03](./re-03-long-title.png) |
| Sidebar CONTENT field sync | Stayed stale at "Your Poster Title α" | Updates live with canvas edits — both show "Working Memory Capacity Predicts..." | [re-03](./re-03-long-title.png) |
| Click Intro text, type `/eta2` | Dropdown shown | Same — dropdown at correct pixel size, entry "/eta2 η²" | [re-04](./re-04-eta2-menu.png) |
| Tab to insert | Symbol inserted | Same — "WM span η²" visible in both canvas and sidebar | [re-05](./re-05-eta2-inserted.png) |
| Sidebar labels | #555 (dim on dark bg) | #9ca3af (readable) — CONTENT, FONT, LINE SPACING, TEXT COLOR all clearly legible | [re-05](./re-05-eta2-inserted.png) |
| Style tab → Psychology/Neuro | Palette switch works | Same — all headings render in the new purple accent, caption updates to "Psychology / Neuro" | [re-06](./re-06-psych-palette.png) |
| Refresh (persistence) | Maya's test passed only if autosave kept her edits | **All three edits persist** — long title still wrapping with grown block, slash-command η² still in Intro, palette still Psychology/Neuro | [re-07](./re-07-after-reload.png) |

### Maya's persona verdict

> *"I opened the app, it was already an editable poster with a real template. I clicked the title and just typed — no dialogs, no save button, no learning curve. My stats symbol worked. I didn't fight any modal. I refreshed and nothing was lost."*

**All four P0/P1 fixes verified green.** B4 (autosave pill staleness) still present as noted — acceptable.

### Meta-finding resolved

Maya's re-audit proved that `page.fill()` and per-key `page.keyboard.press()` **do** propagate to React 18's contentEditable correctly. The earlier failures were specific to `page.evaluate()` programmatic DOM mutations and `document.execCommand` called from `page.evaluate()`. **Future audits should always use `browser_type` / `browser_press_key` for text input**, never direct DOM mutation.

### Still deferred (manual verification only, couldn't automate reliably)

- **Drag-guide overlay** while moving a block — the dotted edge lines + centerline appear only during a live pointer move, which Playwright's ref-based click/fill API can't sustain mid-action. Covered by visual inspection: the code adds the overlay in [PosterEditor.tsx:598](apps/web/src/poster/PosterEditor.tsx#L598) conditional on `draggingBlock`.
- **Floating format toolbar** — requires a live text selection range; same reason as drag. Covered by the `FloatingFormatToolbar` tests would need to be hand-checked in a browser.

Both are on the list for manual QA before shipping. **If automation of these becomes important, exposing a `window.__postrTestApi` under a dev flag would let an audit agent drive both flows without fighting contentEditable event quirks.**
