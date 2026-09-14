# Poster editor — browser stress test

Real pointer/keyboard interaction in Chrome (viewport 1728×996 and 1280×800)
against a local dev server and an **isolated local Supabase stack**, so nothing
here touched production data. Branch `claude/poster-editor-stress-test-browser`
off `main` @ 248767b.

Every finding below was **observed in the browser first**, then attributed to
source by a separate adversarial pass. Where that pass narrowed or corrected my
initial reading, the correction is recorded rather than quietly dropped.

Severity: `data-loss` > `major` > `minor`.

> **Status, 2026-09-13.** F3, F6 and the preview crash are FIXED and merged.
> Those fixes were then audited — see [`AUDIT.md`](./AUDIT.md). 19 of the 21
> fixes shipped that day have a test that fails without them; **16 confirmed
> defects remain in the fixes themselves**, and the preview fix carries one
> question jsdom cannot answer (`display: none` and `titleOverflowPx`).
> F8 turned out not to be local: it is one symptom of a stored-vs-rendered
> geometry desync that also explains part of the colophon overlap and breaks
> `checkBounds` outright. Read the root-cause section at the top of
> [`TRIAGE.md`](./TRIAGE.md) before touching any geometry finding here —
> including F1 and F5, which it does *not* explain. Reproduction:
> `apps/web/scripts/geometry-desync.mjs`.

---

## F1 — A multi-block (group) move can never be undone · major

**Repro**
1. `/p/new`, click the `Introduction` heading, drag its ✥ move handle ~80 px right.
2. Shift-click the `Methods` heading — the dashed group box appears.
3. Drag from empty space *inside* the dashed box down ~120 px.
4. Press ⌘Z.

**Observed** Both blocks moved (Introduction top 293→441, Methods 502→651). ⌘Z
pressed **12 times**, including after clicking empty canvas to deselect —
nothing moved.

**Root cause** `handleGroupDragEnd` commits the **post-drag** document to the
undo stack, so the entry it creates is identical to the state it commits.
During the drag, `handleGroupMove` writes through `setBlocksSilent` (no undo
push), so by pointerup the store already holds the moved positions; `setBlocks`
then calls `withUndo`, whose `pushUndo(state.doc)` snapshots that same
post-drag doc. ⌘Z pops it and restores the identical coordinates.

The single-block path does it correctly and shows the intended idiom — it
rewinds to `preDragBlocksRef` *before* the undo-pushing commit.

- [PosterEditor.tsx:1408](apps/web/src/poster/PosterEditor.tsx:1408) — the faulty commit
- [PosterEditor.tsx:512](apps/web/src/poster/PosterEditor.tsx:512) — the correct pattern
- [posterStore.ts:116](apps/web/src/stores/posterStore.ts:116) — `pushUndo(state.doc)`

**Fix (3 lines, low risk)** In `handleGroupDragEnd`, write the pre-drag snapshot
back before committing. `groupDragOrigin.current` already holds it and is
currently discarded unused:

```ts
const origin = groupDragOrigin.current;
const moved = outerBlocksRef.current;
groupDragOrigin.current = null;
if (!origin) return;
storeSetBlocksSilent(origin);  // so withUndo snapshots PRE-drag
setBlocks(moved);
```

Fixes group move and group resize together — both share this handler.

**Correction to my first reading.** I originally filed this as `data-loss`,
claiming the earlier single-block edit was also destroyed. That does **not**
follow from this code: with a stack of `[pre-edit-1, post-group]`, the second ⌘Z
should have restored edit #1. The likely reason my later presses did nothing is
F2 — the ⌘Z handler bails whenever focus is inside a contenteditable, and
`GroupFrame`'s pointerdown calls `preventDefault()`, preserving that focus.
Scope this finding to "group move/resize is never undoable and silently
consumes one ⌘Z".

---

## F2 — Undo/redo inside a text block is the browser's, not the app's · major

**Observed** Typing, then ⌘Z, steps back **one character at a time**. Redo never
works — not ⌘⇧Z, not ⌘Y, not after clicking away to blur. The characters are
unrecoverable. Control: for a **drag**, undo/redo is perfect (503 → undo 296 →
redo 503), so this is specific to text.

**Root cause** The app's only undo/redo binding returns early when the keydown
target is contenteditable, *before* `preventDefault()`. So while the caret is in
a text block the store's `undo()` never runs and the browser's native
contentEditable undo handles ⌘Z — which is why it is per-character. The store's
`redoStack` has exactly one writer (`undo()`), so it stays empty and `redo()`
early-returns forever.

- [PosterEditor.tsx:913](apps/web/src/poster/PosterEditor.tsx:913) and [:924](apps/web/src/poster/PosterEditor.tsx:924) — the contenteditable bail-outs
- [posterStore.ts:287](apps/web/src/stores/posterStore.ts:287) — `redo()` early return

**Correction to my first reading.** I originally reported the cause as "undoing
a text edit clears the redo stack via `pushUndo`". That was wrong. The real
cause is that the app's history never participates in text editing at all.

**Worth a product decision, not just a patch.** The exemption is deliberate and
self-documented — the author is delegating text undo to the browser so it is
caret-preserving and burst-granular instead of whole-document snapshots. Under
that design, "store redo doesn't participate in text" is the contract. But the
user-visible result is still that **typed text cannot be redone, ever**, which
no user will read as intentional. Decide whether to own text history (and get
redo) or keep delegating (and accept no redo).

---

## F3 — Undo history is one snapshot per keystroke, capped at 50 · data-loss · ✅ FIXED

**Repro**
1. Delete the `Hypotheses` heading (select → red ✕ *Delete block*).
2. Click into the Introduction body text and type ~78 characters.
3. Click empty canvas to blur, then press ⌘Z repeatedly.

**Observed** After **90** ⌘Z presses the deleted heading never returns. The
stack runs dry mid-word and the title never reverts.

**Root cause** Every `input` event commits through `setBlocks` → `withUndo` →
`pushUndo`, storing a whole-document snapshot **per character**;
`MAX_HISTORY = 50` then evicts oldest-first. ~50 typed characters therefore
discard all prior structural history.

- [posterStore.ts:90](apps/web/src/stores/posterStore.ts:90) — `pushUndo` slice
- [posterStore.ts:19](apps/web/src/stores/posterStore.ts:19) — `MAX_HISTORY = 50`
- [RichTextEditor.tsx:200](apps/web/src/poster/RichTextEditor.tsx:200) — per-input commit

**Fix (medium risk)** Coalesce consecutive same-block content edits into one
entry — give `pushUndo` a coalesce key and a ~600 ms window. Raising
`MAX_HISTORY` alone does **not** fix it: 78 keystrokes would still burn 78
entries. The cap is the amplifier; the per-keystroke push rate is the defect.

**Why it matters** Delete a block, type one sentence, and the deletion is
permanently unrecoverable — and F4 means there is no fallback.

---

## F4 — No automatic version checkpoints, so F1/F3 have no recovery path · major

The VERSIONS panel reads **"Versions (0) — No versions yet. Save one above, or
press ⌘/Ctrl+S."** Versions are manual-only. Combined with F1 and F3, a user who
mangles a poster has no way back: undo is exhausted or a no-op, and autosave has
already persisted the damage.

An automatic checkpoint before each structural edit (or simply on a timer) would
turn F1 and F3 from unrecoverable into merely annoying.

---

## F5 — "Fit poster to screen" leaves the poster clipped · major

**Repro** Open any poster, click `FIT`.

**Observed (measured, `scrollLeft = 0`)**

| window | canvas viewport | poster | gap left | hidden right | overflow-x |
|---|---|---|---|---|---|
| 1728 px (panel open) | 911 | 816 | 114 | **18** | **132** |
| 1728 px (panel closed) | 1244 | 1135 | 121 | **11** | **132** |
| 1280 px | 476 | 416 | 96 | **36** | **132** |

The poster is *narrower* than the viewport every time — it would fit — but sits
too far right, so its right edge is cut off. On a 13" laptop the whole `Results`
column and its table are hidden behind the guidelines panel.

**Root cause — the constant 132 px is the tell.** The canvas work area applies a
**96 px pasteboard gutter per side (192 px total)**, but the fit calculation is
called with `fitPadding = 60`. `192 − 60 = 132` — exactly the measured overflow,
at every window size.

- [PosterEditor.tsx:2771](apps/web/src/poster/PosterEditor.tsx:2771) — the 96 px gutter
- [PosterEditor.tsx:1199](apps/web/src/poster/PosterEditor.tsx:1199) — `useZoom(..., 60)`
- [PosterEditor.tsx:546](apps/web/src/poster/PosterEditor.tsx:546) — `fitPadding` default

**Fix (low risk)** Make the two numbers one number: hoist the gutter to a
constant and pass `2 × gutter` as `fitPadding`. Optionally also centre the
scroll offset after fitting.

---

## F6 — Pasting from Word/Docs/web merges paragraphs and glues words · data-loss · ✅ FIXED

**Repro** Copy 2–3 paragraphs from Word, Google Docs or any web page; click into
a text block, select all, paste.

**Observed** Pasting `<p>…12 weeks.</p><p>Accuracy was…</p><p>All analyses…</p>`
produced one run with **no separator at all**:

> `Participants completed the task for 12 weeks.Accuracy was scored by two raters.All analyses used mixed models.`

Note `weeks.Accuracy` and `raters.All` — the last word of each paragraph is
glued to the first of the next. **Control:** the identical content pasted as
`text/plain` keeps its line breaks. The `text/html` branch is at fault — and
that is the branch every real copy from Word, Docs or a browser takes.

**Root cause** `handlePaste` prefers the `text/html` flavour; `sanitizeHtml`'s
allow-list is inline-only, and its policy for a disallowed tag is *unwrap*,
inserting nothing in place of the block boundary.

- [RichTextEditor.tsx:242](apps/web/src/poster/RichTextEditor.tsx:242) — html preferred
- [sanitizeHtml.ts:128](apps/web/src/poster/sanitizeHtml.ts:128) — silent unwrap
- [sanitizeHtml.test.ts:51](apps/web/src/poster/__tests__/sanitizeHtml.test.ts:51) — asserts `'<div>a</div><p>b</p>' === 'ab'`

**Fix (medium risk)** In the unwrap branch, append a `<br>` before recursing when
the tag is block-level. Separator-before-only avoids leading/trailing breaks.
The existing test encodes the current behaviour and would need updating.

**The honest counter-argument.** This is deliberate and test-pinned: poster
blocks are single inline runs, not documents, and flattening a pasted document
into one block is a defensible design. That defence covers *losing the paragraph
break*. It does not cover **emitting no separator at all**, which corrupts the
text by joining two words. Even keeping the flatten-to-one-block design, a
space or `<br>` is the correct boundary.

---

## F7 — Any backend failure produces a dead-end screen with a raw DB error · major

**Observed** When a backend call failed, the editor rendered:

> **Couldn't load this poster**
> Failed to load most recent poster: **permission denied for table posters**

1. The **raw Postgres error** is shown verbatim — contradicting the project's own
   rule that user-facing errors stay generic with a Send Feedback affordance.
2. The page has **zero buttons and zero links** (verified by enumerating every
   `button` and `a` — empty). No retry, no new poster, no way home. Reload
   reproduces it. `/dashboard` shows the same raw error but at least keeps nav.

- [Editor.tsx:233](apps/web/src/pages/Editor.tsx:233) — the error branch
- [Editor.tsx:238](apps/web/src/pages/Editor.tsx:238) — renders `status.message` raw

**Fix (low risk)** Use the generic wording already present in
`EnsureSession.tsx`, keep the real message in state for the feedback payload
only, and add the same affordances the sibling `not-found` branch already has.

**Provenance, stated plainly.** The *trigger* in my session was a local grant
misconfiguration, not a production-reachable condition. The finding is about
**presentation and recoverability**, which apply to any backend failure — and a
production path does exist: the documented weekly anonymous-user cleanup deletes
guests whose browsers still hold a valid JWT.

---

## F8 — Pre-flight ISSUES misses text overflow and block collisions · major

**Repro** Paste ~1,900 characters into the Introduction body text block.

**Observed (measured)**
- The text block needs `scrollHeight` 255 px in a 225 px box → **30 px of the
  user's text is clipped and never rendered**.
- It now **overlaps two blocks**: the `Hypotheses` heading (129×14 px) and the
  Hypotheses body text (129×10 px).
- ISSUES still reports **4** warnings — title out of bounds, empty figure,
  missing authors, empty references. **Neither the clipped text nor either
  collision is flagged.**

The panel says it scans for "blocks outside the canvas, missing required
content, empty figures, and other common problems" — but text overflowing its
own box and blocks sitting on top of each other are the two defects most likely
to ruin a printed poster, and the researcher finds out at the printer.

**Correction and root cause, 2026-09-13.** This is not a missing check; it is a
missing *input*. Text-like blocks render `height: auto` and the stored `b.h`
never updates — worse, since commit `d54b70e` `b.h` is absent from their layout
entirely (`minHeight` is a constant, `overflow` is `visible`), so it renders
nothing, floors nothing and clips nothing.

A collision check written over stored `x/y/w/h` — the obvious fix, and the one
this entry implies — **would have found nothing in this very repro**, because
the stored height does not change when you paste. Measured drift on a real
render: stored 100, rendered 185.44.

Two halves, and they are not equally real:

- **Collisions: confirmed**, and caused by the growth described above.
- **"30 px of text clipped": probably stale.** `overflow: visible` means a
  grown text block does not clip. That observation likely predates the
  auto-grow, or was taken on a block type that does not grow (images, logos).
  Re-check in a browser before building anything for it.

The fix, its cost, and why the tempting write-back remedy is a project rather
than a patch are in `TRIAGE.md`'s root-cause section. Same section lists two
further findings this uncovered: `b.h` being decorative (S1) and vertical
resize being a silent no-op on title/text/table blocks (S7).

---

## F9 — Table row/column stepper jumps out from under the cursor · minor

With the EDIT BLOCK panel scrolled down, clicking ROWS `−` decrements once *and*
shifts the stepper ~30 px down (CSS y 260 → 290). The next click at the same
point lands on empty space: **5 clicks produced 1 decrement**. Reducing a table
from 8 rows to 3 means chasing the button down the panel. Does not occur when
the panel is scrolled to the top.

---

## F10 — "Already open in another tab" banner never clears · minor

Opening the same poster twice correctly raises a warning (good — see below). But
after the duplicate tab is **closed**, the banner stays up indefinitely in the
surviving tab (still present 40 s+ later, verified programmatically). The user
has fixed the problem and is still being told they have it.

---

## Good behaviour — verified working, worth not regressing

- **Duplicate-tab detection**: warns explicitly that "Postr autosave is
  last-write-wins, so edits in one tab can silently overwrite the other."
- **Unsaved-changes guard**: navigating away raises a "Leave site?" dialog.
- **Transient outage recovery**: with the backend paused mid-edit the pill held
  at "Saving…"; on restore the write completed and returned to "Saved" — and the
  edit was confirmed present in the database.
- Onboarding tour Skip/Next work; its overlay is `pointer-events:none` and does
  not block the canvas.
- Single-block drag undo works; redo works for drags.
- Backspace in a text block clears text without deleting the block.
- Resize clamps at a minimum width (dragging a corner past the opposite edge
  gave 88 px, never zero or negative).
- Deleting a heading auto-renumbers remaining sections.
- Arrow-key nudge works once the move handle is focused.
- Export gating: a guest clicking PowerPoint (.pptx) correctly hits
  "Create an account to export".
- Bounds checking correctly flagged a title nudged past the right edge.

---

## False positives I discarded

Recorded so they are not re-reported:

- *"The onboarding tour blocks canvas clicks"* — a coordinate-mapping artifact of
  my own tooling. The overlay is `pointer-events:none` and selection works.
- *"The sidebar CONTENT field desyncs from the canvas"* — my selector was reading
  the NOTES textarea. The field is a contenteditable and stays in sync.
- *"Autosave never retries after a failure"* — only true for a *persistent*
  error. A transient outage recovers correctly (verified).
- *"`anon`/`authenticated` lack DML grants on `posters`"* — reproducible on a
  fresh local stack, but a Supabase CLI 2.110 local-bootstrap difference, not a
  production defect. See the note in `docs/stress-test/LOGGING.md`.
