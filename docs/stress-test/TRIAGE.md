# Stress-test triage — priority by user impact, and the branch plan

Companion to [`FINDINGS.md`](./FINDINGS.md) (poster editor, F1–F10),
[`FIGURE-READABILITY.md`](./FIGURE-READABILITY.md) (FR1–FR9 + Python) and
[`LOGGING.md`](./LOGGING.md). Written 2026-09-13.

Every finding below was **re-verified against the code on this branch**, not
taken from the stress-test docs on trust: each was read at its current
`file:line`, then put through an independent adversarial pass whose brief was to
refute it. Nothing here is "reported"; it is all reproduced. Where the original
docs proposed a fix that turned out to be incomplete, the gap is recorded.

**Ordering rule for this document: user impact first**, not severity label and
not effort. The question asked of every finding is *what does a researcher lose,
how often, and can they tell it happened?* A silent wrong answer outranks a loud
crash, because a crash tells the user to stop and a wrong answer does not.

**Execution rule: one branch per finding, one commit per todo item.** No mass
fixes. Each entry below carries its own branch name, scope and test plan, and
they are written to be landed independently and in any order — no entry depends
on another having landed first.

---

## The impact ranking at a glance

| Rank | ID | What the user loses | Do they notice? | Frequency |
|---|---|---|---|---|
| — | PREVIEW-1..6 | Preview crashed; Print dead; images dropped; zoom killed; Backspace deleted blocks | Mixed — 2 silent | ✅ **fixed** |
| — | WM-2 | Credit printed at 50 pt on a conference wall | Yes, at the printer | ✅ **fixed** |
| 1 | **FR1–FR7, PY-1/2/3** | **A wrong PASS on a figure they then print** | **No — never** | Every figure check |
| 2 | **F3** | Structural edits silently unrecoverable after ~50 keystrokes | No, until they try to undo | Every session |
| 3 | **F6** | Pasted text corrupted — words glued together | Rarely; it looks like a typo | Every Word/Docs paste |
| 4 | **F8** | Clipped text + overlapping blocks ship to the printer | No — ISSUES says "clean" | Any dense poster |
| 5 | **F1** | A group move can never be undone | Yes, and it looks broken | Any multi-select edit |
| 6 | **F5** | Poster clipped after "Fit"; a whole column hidden on a 13" laptop | Yes, looks like a rendering bug | Every fit on a small screen |
| 7 | **FR9** | Pasted plotting script destroyed by clicking a text block | Yes, and it is infuriating | Common |
| 8 | **F7** | Dead-end screen with a raw Postgres error | Yes — and cannot recover | Rare, catastrophic |
| 9 | **F2** | Typed text can never be redone | Yes | Every session |
| 10 | **F4** | No recovery path when F1/F3 bite | Only after the damage | Rare |
| 11 | **FR8, PY-5, PY-6** | Stale/misattributed checker results | Sometimes | Moderate |
| 12 | **F9, F10** | Stepper walks off cursor; stale duplicate-tab banner | Yes, minor | Common, low cost |
| — | PREVIEW-5, LOG-1, WM-11 | *Nothing directly* — these are why the above shipped | n/a | Preventive |

> **Why the figure checker outranks everything.** A researcher uses it *instead
> of* printing a test poster. When it says PASS they stop checking. Seven of its
> nine findings produce a confidently wrong PASS — and the damage is discovered
> at A0, at the conference, after paying for the print.

---

## Already fixed on this branch

### ✅ PREVIEW-1/2/3 — "Preview poster" crashed, and its Print button was dead

`PosterEditor.tsx` had `if (previewMode) { return … }` sitting ~1000 lines above
the `const`s its JSX reads. **Five** faults, one cause — the branch *replaced*
the editor tree instead of *layering over* it:

1. **TDZ crash.** The branch read `sortedRefs`, `headingNumbers`, `didDragRef`
   and `printPoster`, all declared later. JSX props evaluate in order, so
   `references={sortedRefs}` threw first — `Cannot access 'sortedRefs' before
   initialization`, minified in production to **`Cannot access 'Jt' before
   initialization`**. Confirmed in the minified bundle: the two identifiers are
   emitted 2366 and 2489 bytes *after* the branch that reads them.
2. **Rules of Hooks.** 26 further hooks are called between the old position and
   the main return, so toggling `previewMode` changed the hook count.
3. **Dead Print button.** `printPoster` does `getElementById('poster-canvas')`
   and `if (!canvas) return`. Preview unmounted that node.
4. **Print would have dropped every image.** Found in review, *after* a first
   attempt fixed (3) with `flushSync`. `flushSync` does not restore the canvas —
   it **remounts** it, which resets `useStorageUrl` to `null`; signed URLs then
   re-resolve asynchronously while `printPoster` clones synchronously, so every
   Supabase-uploaded figure and logo would have printed as a 1×1 placeholder GIF.
   Silent, and only on the preview path.
5. **Canvas zoom died after one preview round trip.** The pinch/wheel listener
   and three ResizeObservers capture `canvasRef.current` with `[canvasRef]` in
   their deps — a stable ref *object*, so they never re-subscribe after a
   remount and stay bound to a detached node for the rest of the session.

Plus a sixth, independent of the crash: the editor's global keydown handlers had
no `previewMode` guard, so **Backspace in preview deleted the still-selected
block** with nothing on screen to show it — confirmed by test (4 blocks → 3).

`git log -S previewMode` shows one commit, **e9952ef (2026-04-10)** — the branch
already sat above those declarations the day it was written. **Preview mode has
never worked**, on any poster with at least one block.

**Fixed** by extracting
[`PosterPreviewOverlay.tsx`](../../apps/web/src/poster/PosterPreviewOverlay.tsx)
and rendering it from the editor's single return. The editor is now **hidden**
(`display: none` + `inert`), never unmounted — which resolves 1–5 together and
removes the need for `flushSync` entirely. The two global keydown effects gained
a `previewMode` guard, and the overlay gained `role="dialog"`, `aria-modal`, an
`Escape` exit and a resize-responsive scale.

Regression test
[`previewMode.test.tsx`](../../apps/web/src/poster/__tests__/previewMode.test.tsx)
— 9 cases, each verified to fail without its fix: the TDZ case reproduces the
exact production error, the canvas-identity case catches a remount, and the
keyboard case catches the block deletion. **Lesson worth keeping:** the first
patch (move the branch + `flushSync`) made the crash go away and would have
shipped a silently image-less print. Moving code is not the same as fixing the
shape that made it wrong.

### ✅ WM-2 — the print colophon printed at 50 pt, not 7 pt

`acknowledgementPrintCss` set `font-size: 7px` and documented it as "prints
around 7 pt". It did not. Colophon sizes are CSS px at canvas scale, where
**1 px = 1 poster unit = 0.1 inch**, and `printDocument.ts` then applies
`zoom: 96/PX = 9.6`. Real printed size: 7 × 9.6 / 96 in = **0.7 in = 50.4 pt** —
larger than most posters' body text.

Fixed per owner instruction: every dimension × 0.25, anchored bottom-**right**
(`font-size` 7→1.75 px ⇒ **≈12.6 pt**, mark 9→2.25 px, gap 4→1 px). Owner
separately changed the copy to `made with postr.sh`.

---

## Deferred pending visual inspection — not a code decision

### ⏸ WM-7 / WM-8 — colophon consistency across PPTX and LaTeX

**Status: owner decision, needs printed/exported samples side by side. Do not
resolve by symmetry with the PDF change.**

Only the print/PDF colophon was resized and moved. The other two visible
colophons are untouched:

| Surface | Size today | Anchor | ×0.25 would give |
|---|---|---|---|
| Print / PDF | ≈12.6 pt | bottom-**right** ✅ | — (done) |
| PPTX text box | 11 pt | bottom-left | **2.75 pt** |
| LaTeX footer | 9 pt | bottom-left | **2.25 pt** |

The credit therefore now differs across formats. But **the ×0.25 rule must not
be applied mechanically here**: the PDF was 50.4 pt because of a *units bug*,
and the other two never had that bug. Their sizes are already honest points.
2.75 pt and 2.25 pt are below every readability floor the product itself
enforces (`readability.ts` uses an 18 pt axis-label and 12 pt caption minimum),
and 2.75 pt is unselectable in PowerPoint in practice.

**What to decide, with samples in hand:**

1. Export the same poster to PDF, PPTX and LaTeX. Print or view each at 100%.
2. Decide whether the credit should read as *the same mark* across formats, or
   whether each format's own conventions win.
3. If consistency wins, the target is a **pt size**, not a scale factor — pick
   one (≈8–12 pt is the plausible band) and set all three to it.

**Implementation notes for whoever executes the decision:**

- PPTX (`attribution.ts`, `acknowledgementPptxBox`): `h`, `w` and `fontSize` are
  inches/points already. Moving it right needs
  `x: Math.max(0, slideWidthIn - w - margin)` — guard the negative-`x` case on a
  narrow slide. PowerPoint's default text insets (0.1 in L/R) eat into a short
  box; widen `w` or zero the insets.
- LaTeX (`acknowledgementLatexBlock`): anchoring right requires a **breaking
  signature change** to `(widthIn, heightIn, opts)` plus the caller at
  `latex/writer.ts:496` and `attribution.test.ts:78`.
- `attributionPptxBox`'s geometry test is a weak bound — it would pass a
  bottom-right move silently. Tighten it as part of the change.

---

## The branch plan

One branch per row. Branch off `main`. One commit per todo item inside a branch;
where a row lists two commits, they are genuinely separate units of work.

### Priority 1 — the figure checker's silent wrong PASS

> Land **`fig-checker/fail-loud` first.** It converts silent wrongness into a
> visible warning across six findings at once, so even before the individual
> parsers are fixed the user stops being lied to. Everything after it narrows
> the set of cases that need the warning.

| Branch | Scope | Test plan |
|---|---|---|
| `fig-checker/fail-loud` | **FAIL-LOUD-1.** One helper `probe(code, presentRe, parsed, message, warnings)` called at ~8 extraction sites in `readability.ts` (~60 lines). Whenever a `ggsave`/`figsize`/`base_size`/override pattern is *present in the text but not parsed*, warn instead of silently substituting a default. | Unit: one case per probe site asserting the warning fires on the stress-test repro string and stays silent on the clean equivalent. |
| `fig-checker/facet-scale` | **FR1.** Stop dividing the canvas by the facet grid — return the real `width`/`height` (`readability.ts:175-176` and the identical `:256-257`). Keep `facetRows/Cols` for an informational note only. Note `facet_grid` is hardcoded 2×2 regardless of real levels. | Unit: the doc's `mtcars` repro must report the **same** scale with and without the `facet_grid` line. Same for `plt.subplots(2, 3)`. |
| `fig-checker/base-size-parse` | **FR5 + FR6.** (1) `base_size` anywhere in the arg list: `/theme_\w+\s*\((?:[^()]\|\([^()]*\))*?\bbase_size\s*=\s*([\d.]+)/g`. (2) Strip comments before parsing — R keeps the *last* match so a commented-out experiment wins; Python's non-global `figsize` keeps the *first*. **Two commits.** | Unit: `theme_bw(base_family="Helvetica", base_size=22)` → 22; commented-out `base_size = 30` beside a live `11` → 11. |
| `fig-checker/axis-overrides` | **FR2.** Per-axis selectors (`axis.text.x`) match nothing today — the regex hits `.x` where it needs `=`. Also fix `[^)]*` dropping a size that follows a nested call. | Unit: the 7 pt `axis.text.x` repro must FAIL, not PASS at 16 pt. |
| `fig-checker/ggsave-units` | **FR3 + FR4.** (1) `ggsave(file.path(...))` truncates at the first `)`; canvas never read, scale pins to exactly 1.00x, and the "no ggsave" warning sits in an unreachable `else`. (2) `units='cm'` in single quotes: `/units\s*=\s*["'](\w+)["']/`, plus a warning on unrecognised units. **Two commits.** | Unit: nested-call `ggsave` must match the plain-string form's 0.78x; `'cm'` must match `"cm"` at 1.27x. |
| `fig-checker/matplotlib-idioms` | **PY-1/2/3.** `plt.rcParams.update({…})`, `sns.set_context(font_scale=…)`, and `fontsize` after a `(` inside a label string — the three commonest matplotlib idioms, all unmatched. | Unit: one case per idiom. |
| `fig-checker/suggested-size` | **FR7.** `Math.max(...)` over all-overridden elements yields `base_size = 0` — a snippet that would destroy the figure. Compute over non-overridden specs only; carry per-element advice for the rest. | Unit: the seven-override repro must not offer `0`, and must still advise on each overridden row. |

### Priority 2 — editor data loss

| Branch | Scope | Test plan |
|---|---|---|
| `editor/undo-coalesce` | **F3.** One whole-doc snapshot per keystroke against `MAX_HISTORY = 50`. Give `pushUndo` a coalesce key + ~600 ms window in `posterStore.ts:89-93`. Raising the cap alone does **not** fix it — 78 keystrokes still burn 78 entries. | Unit on the store: delete a block, type 78 chars, assert the deletion is still reachable. |
| `editor/paste-boundaries` | **F6.** `sanitizeHtml` unwraps block tags with no separator → `weeks.Accuracy`. **The doc's fix is incomplete**: `sanitizeHtml` is shared with the single-line title/heading editors, which deliberately swallow Enter, so an unconditional `<br>` would inject breaks there. Make the separator a **parameter**. | Unit: `sanitizeHtml.test.ts:51` currently asserts `'<div>a</div><p>b</p>' === 'ab'` — rewrite. Add a multiline=false case asserting a space, not `<br>`. |
| `editor/group-undo` | **F1.** `handleGroupDragEnd` commits the post-drag doc. Write `groupDragOrigin.current` back via `setBlocksSilent` before `setBlocks(moved)`. **Verified against the store**: `guardLocked` is a no-op here because `origin` already contains every id, so the entry is genuinely pre-drag. Fixes move and resize together. | Unit or RTL: group-move two blocks, ⌘Z, assert both return to origin. |
| `editor/preflight-collisions` | **F8.** ISSUES flags neither clipped text nor overlapping blocks — the two defects most likely to ruin a printed poster. Collision is pure geometry → `checkCollisions()` in `boundsCheck.ts`; overflow needs a measured `scrollHeight > clientHeight` signal. **Two commits.** | Unit for `checkCollisions` (pure, with a 2 px snap tolerance). RTL for the overflow warning. |
| `editor/auto-checkpoints` | **F4.** Automatic version checkpoints, so F1/F3 degrade from unrecoverable to annoying. **Do not route through the same 20-slot budget** or auto snapshots evict the user's named versions — prefix them `auto:` and prune separately. | Unit on the pruner: named versions survive N auto checkpoints. |

### Priority 3 — visible breakage and dead ends

| Branch | Scope | Test plan |
|---|---|---|
| `editor/fit-gutter` | **F5.** Work area pads 96 px/side; fit is called with `fitPadding: 60`. The constant **132 px** overflow at every window size is exactly 192 − 60. Hoist one `WORKAREA_PAD` constant and pass `2 × pad`. Optionally centre the scroll offset after fitting. | Browser check at 1280 and 1728, panel open and closed: `scrollWidth === clientWidth` after FIT. |
| `fig-checker/panel-state` | **FR9.** Clicking any non-image/chart block auto-routes the sidebar to Edit, unmounting the panel and destroying the pasted script. Lift `code` out of the remount into `PosterEditor` beside the existing `figureMode` state — `FigureTab.tsx:12-14` already documents that pattern for exactly this reason. | RTL: paste code, select a text block, return to FIGURE, assert the textarea still holds it. |
| `editor/load-error-recovery` | **F7.** Raw Postgres message on a screen with **zero** buttons or links. Now refactored into `EditorLoadError` (`Editor.tsx:344-380`) which emits a diagnostic but still prints the raw message. Use the generic copy from `EnsureSession.tsx`, keep the real message in state for the feedback payload only, add the exits the sibling `not-found` branch already has. Violates the project's own generic-errors rule. | RTL: force the error branch, assert the raw message is absent and ≥1 recovery control is present. |
| `fig-checker/stale-results` | **FR8 + PY-5 + PY-6.** Stale results under a live language label; plotnine detected as R so its underscore overrides are dropped; base-R scores 0/0 yet Check stays enabled as a destructive no-op. **Three commits.** | Unit for detection; RTL for the stale badge and the disabled Check. |
| `editor/small-annoyances` | **F9 + F10.** Stepper walks off the cursor because the border mockup's height tracks the row count — give it a fixed height. Duplicate-tab banner never clears — broadcast a `bye` and re-probe. **Two commits.** | Unit for `useTwoTabGuard` bye handling; RTL for the fixed mockup height. |

### Priority 4 — preventive (why the above shipped)

| Branch | Scope | Test plan |
|---|---|---|
| `tooling/eslint` | **PREVIEW-5.** Verified: **no ESLint config, no dependency anywhere in the repo**; `npm run lint` is a no-op (`--if-present`, and no workspace defines `lint`); CI runs typecheck + test + build only. Add `eslint-plugin-react-hooks` (`rules-of-hooks: error`) and `@typescript-eslint/no-use-before-define` (`error`, `functions: false`). **This rule set would have caught the preview crash for free, at authoring time**, and the same early-return-before-hooks shape is still latent at the `!doc` guard (PREVIEW-4). Expect an `exhaustive-deps` backlog on a 3,900-line file — land it as `warn`. | CI green with the lint step added. |
| `obs/wire-diagnostics` | **LOG-1.** Seven of ten diagnostic signal kinds have **no emitter anywhere in the client**: `undo_noop`, `undo_exhausted`, `redo_unavailable`, `fit_overflow`, `layout_defect`, `paste_normalized`, `duplicate_tab`. Taxonomy, dedup, rate limiting and privacy review are all built and tested; nothing sends. `undo_noop` is the production detector for F1. **One commit per signal.** | Assert each emits once on its anomaly and not at all during normal editing. |
| `export/colophon-pt-sizing` | **WM-13 (new, found in review 2026-09-13).** The colophon is authored at `font-size: 1.75px` and relies on the print window's `zoom: 9.6` to reach 12.6 pt. Any user-set or enterprise-policy **minimum font size** (Chrome Settings → Appearance; Firefox `font.minimum-size.*`) clamps the *computed* size before that multiplier. At 7 px the old value sat above Chromium's 6 px logical floor; **1.75 px does not**. A clamp to 6 px prints `6 × 9.6 / 96 × 72 = 43.2 pt` — the 50 pt bug back again, on that user's machine only, with no signal. Fix: neutralise the zoom locally (`zoom: 1/printZoom` on `.postr-attribution`) and author in real `pt`, so there is nothing to clamp. Needs `printZoom` threaded into `acknowledgementPrintCss`. | Add a case asserting the rule contains a `pt` size and a zoom-neutralising factor. |
| `docs/regen-feature-graph` | **DOC-1 (new).** `docs/feature-graph.md`'s `Sidebar.tsx` line references have drifted by **+1 to +59**, non-uniformly — measured across 72 uniquely-locatable refs, so no single offset repairs them. This is the pre-existing "feature-graph is stale" TODO, not fallout from the 2026-09-13 change (the `PosterEditor.tsx` refs *were* accurate at HEAD and were remapped wholesale to stay that way — verified by re-measuring the literal-to-citation offset distribution before and after: identical). Regenerate the file from source rather than hand-patching. | A checker script that resolves each `file:N` ref against a quoted literal and fails on drift would keep it honest — worth building as part of this. |
| `export/print-document-tests` | **WM-11.** `printDocument.ts`'s own docstring says it was extracted from `PosterEditor` *specifically to make the printed geometry testable* — and it has no test file. The surface that just shipped a 7×-too-large colophon is untested. Pin `@page` size, canvas dimensions, the `zoom` factor, and the colophon's computed print size in pt. | New `printDocument.test.ts`. |

---

## Things that are *not* bugs — recorded so they are not re-filed

- **The `@postr/shared` build/test failures in a worktree.** This worktree has no
  local `node_modules`, so `@postr/shared` resolves through the root symlink to
  the **main checkout**, which lacks this branch's commits. That yields
  `MISSING_EXPORT: DIAGNOSTIC_BATCH_MAX` on `vite build`, 7 failed suites
  (`pdf-lib`, `@gsap/react`), and 2 failed `diagnostics.test.ts` cases
  (`DIAGNOSTIC_BATCH_MAX` resolves to `undefined`, so the emitter no-ops).
  **All nine are environment artifacts.** CI and Vercel check out the whole repo
  and build clean. Baseline on this branch: 2309 pass / 2 fail before any change.
- The stress-test docs' own discarded false positives — see the tail of
  `FINDINGS.md`.

## Test-surface notes for whoever picks this up

- **No snapshot tests and no golden LaTeX/PPTX fixtures exist** anywhere in
  `apps/web`. Every export test asserts structurally (zip entry names, `<p:pic>`
  counts, substring matches), so mark/geometry changes break no byte-level file.
- `ackPlacement.test.ts` is the only file pinning exact mark geometry. If
  `ACK_MARK_SIZE` is ever changed, four assertions need updating — including a
  "too small to host the mark" null case that stops being null, and two that pin
  the mark to the left references column. Note `MIN_MARK_SIZE = 6` floors the
  *cluster* path independently of `ACK_MARK_SIZE`.
- The colophon copy is now referenced through `ACKNOWLEDGEMENT_TEXT` everywhere
  in the suite, with the literal pinned in exactly one place
  (`attribution.test.ts`) — so a future copy change breaks one deliberate test
  rather than twelve incidental ones.
- `PosterEditor` previewMode had **zero** coverage before 2026-09-13; it now has
  `previewMode.test.tsx`. Several branches above touch `PosterEditor` — that file
  is 3,900 lines with no lint, so prefer RTL tests over reasoning about it.
