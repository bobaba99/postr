# Audit of the 21 fixes shipped 2026-09-13

Every fix merged to `main` during the stress-test session, audited against
three questions: **is it really tested**, **does the test enter where a user
enters**, and **is what the commit claimed true**.

Findings carry an evidence tier. `MEASURED` = a number from a re-runnable
harness or a red-then-green test, quoted. `CONFIRMED` = a written assertion
of the correct behaviour that fails against the shipped code. `REFUTED` = the
same assertion passes. `UNVERIFIED` = could not be executed here, and why.

---

## 0. Baseline correction

The suite figure quoted throughout the session — "2557 passing" — was wrong.
Seven test files never loaded, because `@gsap/react` is declared in
`apps/web/package.json` and present in the lockfile but was never installed in
this worktree. `vitest` reported the remaining files as green and the run as a
success.

| | files | tests |
|---|---|---|
| as reported during the session | 162 of 169 | 2557 |
| after `npm install` | **169** | **2583** |

The 7 files are all `manuscript/slides` and `export/pdf`; none of the 21 fixes
touches either area, so no result below is affected. It is recorded because a
green suite that silently skips 4% of its files is not a green suite.

## 1. Method

For each fix commit, in a **throwaway worktree checked out at that commit** (so
the reverse patch always applies cleanly, and the live tree is never touched):

1. **Control** — run the full suite as shipped.
2. **Treatment** — reverse-apply *only* that commit's non-test source hunks,
   leaving its tests in place. Run again.
3. `delta_red` = tests that fail in treatment but not control. `delta_gone` =
   tests that stop existing, i.e. a suite that could no longer load.

`delta_red == 0 && delta_gone == 0` means nothing in the suite notices the fix
being removed.

### Two instrument failures, both mine

Recorded because the conclusions would have been wrong, and both are the same
mistake the method exists to prevent.

**First sweep, discarded entirely.** It reverse-applied hunks against the
*current* tree, where later commits had rewritten the same files: 14 of 21
conflicted. Worse, it restored with `git checkout -- .`, which cannot restore a
file the reverse-apply had *deleted*, so the tree stayed dirty and every
subsequent measurement ran against contaminated source. No number from it is
usable.

**Second sweep, blind spot corrected.** It scored `78da3bc` and `5989fc2` as
untested. Both are covered — their tests landed one commit *later* (`435b051`,
`b0e530b`), so a worktree at the fix commit predates them. Re-measured at the
test commit: 8 red and 4 red respectively.

The instrument was validated before use on a case with a known answer
(`a6dfdd3` → exactly 1 red, clean restore) and calibrated until the scratch
worktree reproduced main exactly (2583/2583) — it did not, until the gitignored
dummy `.env` was copied across.

## 2. Coverage — MEASURED

**19 of 21** fixes have at least one test that fails when the fix is removed.

| commit | control | treatment | red | gone |
|---|---|---|---|---|
| `08f6607` preview overlay | 2346p/0f | 2337p/9f | **9** | 0 |
| `71a7ca6` colophon 50pt | 2348p/0f | 2345p/3f | 3 | 0 |
| `bea54b9` adaptive geometry | 2397p/0f | 2347p/1f | 1 | **49** |
| `718c369` facets | 2349p/0f | 2346p/3f | 3 | 0 |
| `78da3bc` ggsave nesting † | 2356p/0f | 2348p/8f | **8** | 0 |
| `5989fc2` strip comments † | 2354p/0f | 2350p/4f | 4 | 0 |
| `d344e60` derive clamps | 2421p/0f | 2400p/21f | **21** | 0 |
| `911698e` overlap claim | 2421p/0f | 2421p/0f | **0** | 0 |
| `d88bf96` base_size = 0 | 2352p/0f | 2348p/4f | 4 | 0 |
| `698922b` per-axis overrides | 2359p/0f | 2355p/4f | 4 | 0 |
| `9b7991e` matplotlib idioms | 2354p/0f | 2349p/5f | 5 | 0 |
| `b15da8c` unreadable code | 2385p/0f | 2382p/3f | 3 | 0 |
| `38f5313` font-first | 2391p/0f | 2386p/5f | 5 | 0 |
| `630ab83` verdict glyphs | 2391p/0f | 2391p/0f | **0** | 0 |
| `2de952f` full corrected code | 2397p/0f | 2391p/6f | 6 | 0 |
| `0d0fcc7` snippet reaches | 2555p/0f | 2553p/2f | 2 | 0 |
| `378af5c` seat in corner | 2564p/0f | 2544p/20f | **20** | 0 |
| `53a54e7` undo coalescing | 2568p/0f | 2566p/2f | 2 | 0 |
| `dbb7659` paste separator | 2576p/0f | 2570p/6f | 6 | 0 |
| `3aba33c` rendered height | 2582p/0f | 2577p/5f | 5 | 0 |
| `a6dfdd3` editor bypass | 2583p/0f | 2582p/1f | 1 | 0 |

† re-measured at the test commit, per §1.

The two zeros:

- **`911698e` — comment-only.** Verified: the commit adds no executable line to
  either source file. Nothing to test, so a zero is correct. Its defect is of a
  different kind (§4, D1).
- **`630ab83` — genuinely uncovered.** No test anywhere references
  `statusGlyph`, `statusColor`, or the glyph characters. The fix's own premise —
  that the glyph colour must agree with the legend — is assertable and unasserted.

## 3. Instrument independence

Of 21 fixes, **2** are tested through the path a user actually takes; **17**
enter at the internal API the fix lives in; **2** have no covering test.

This is the session's recurring failure mode: `53a54e7` put coalescing in the
store action and its tests called the store action, so all of them passed while
the editor's own wrapper bypassed it. That took `a6dfdd3` to find. Seventeen
fixes still have that shape. It does not mean they are broken — it means the
tests could not tell us either way.

The clearest live example: **no test anywhere calls `buildPrintDocument`**, so
the single caller line that feeds the colophon its poster size is unasserted.
Had it passed poster units (480×360) instead of inches, every poster would clamp
to the ceiling, the adaptive behaviour would be silently inert, and all 30+
colophon tests would still be green.

## 4. Claims

Confirmed by writing each claim as an assertion of the correct behaviour and
running it against HEAD. **16 confirmed, 6 refuted, 1 not executable here.**

### D1 — `911698e` shipped the false claim it existed to delete. CONFIRMED

The commit's whole purpose was to remove an overstatement about the colophon.
Two pieces of it still ship:

- `apps/web/src/export/attribution.ts:169` — *"20 of 32 (size × template) pairs,
  down from 23"*. Re-measured today across all four templates × eight sizes:

  | template | overlaps / 8 |
  |---|---|
  | 3col (default) | **0** |
  | 2col | 1 |
  | billboard | **4** |
  | sidebar | 1 |
  | **total** | **6 / 32** |

  The figure in the file is wrong by more than 3×. The corrected number reached
  `TRIAGE.md` in `209efb4` and never reached the source.

- `apps/web/src/export/attribution.ts:218` — *"so it cannot overlap poster
  content"*, inside the CSS template literal **emitted into every print window**.
  That is verbatim the sentence `911698e` was written to delete.

### D2–D16 — confirmed defects

| # | fix | severity | defect | proof |
|---|---|---|---|---|
| D2 | `b15da8c` | high | `tick_params(axis='x', labelsize=20)` flips the *y* tick labels from a correct `fail` to a wrong `pass` — the untouched axis becomes invisible | assertion on `elements['Tick labels'].status` |
| D3 | `9b7991e` | high | the full-fix path does not recognise `plt.rcParams.update({...})`, so it emits a **second** `font.size` | `font.size` appears 2× in output |
| D4 | `2de952f` | high | Python fix splices `rcParams` at column 0 under a `def`, producing code that will not parse | `ast.parse` → `SyntaxError: expected an indented block after function definition on line 3` |
| D5 | `2de952f` | high | R fix is comment-blind: the joining `+` lands inside a trailing `#` comment, so the emitted `theme()` never attaches | assertion on emitted lines |
| D6 | `0d0fcc7` | high | pinning **both** axes makes the snippet emit the bare parent selector, which by the commit's own inheritance rule reaches neither child | snippet lacks `axis.text.x` |
| D7 | `dbb7659` | high | the paste boundary is recorded on *entering* a block tag, never on leaving, so `<h2>Results</h2>Accuracy…` still glues | `sanitizeHtml` output |
| D8 | `3aba33c` | high | `checkCollisions` reads rendered *height* but stored *top*, so a grown title reports a false overlap with the block below it | `checkCollisions` returns 1 where 0 is correct |
| D9 | `5989fc2` | med | `detectLanguage` is still fed raw code, so a commented-out matplotlib draft routes an R script to the Python parser — the same "reads something other than the live code" cause the commit names | `detectLanguage` → `'python'` |
| D10 | `d88bf96` | med | a `rel()` override prints as `12.100000000000001pt` beside the same element shown as `12.1pt` | float in `fontFixes` |
| D11 | `b15da8c` | med | in-panel warning misses `geom_text(aes(label = paste0(...)), size = 2)` — nested calls, ggrepel, and the no-explicit-size default | no warning emitted |
| D12 | `b15da8c` | med | `annotate("rect", …, size = 1)` fabricates *"in-panel text at 2.8pt"* — `size` there is line width | warning emitted |
| D13 | `b15da8c` | med | full fix emits a **duplicate** `base_size` for a variable-bound base, handing back R that errors | `base_size =` appears 2× |
| D14 | `dbb7659` | med | `BLOCK_TAGS` has `TABLE`/`TR` but not `TD`/`TH`, so `<td>Mean</td><td>12.4</td>` pastes as `Mean12.4` | `sanitizeHtml` output |
| D15 | `378af5c` | low | the band clamp is **dead code**: deleting it leaves all **98** colophon tests green, including the one named *"keeps a huge poster inside the band even at the size ceiling"*. The JSDoc, the inline comment, the commit message and that test all present it as load-bearing | source mutation |
| D16 | `3aba33c` | low | `checkBounds` classifies `fullyOutside` from stored `b.h` while the edge test uses the measured height, so a grown block with 50 units on the sheet is reported as an **error** saying it will not print | `severity` is `full`, should be `partial` |

### Refuted — 6

Raised by the audit, asserted, and the assertion passed. Recorded so they are
not re-raised.

| fix | claim | why it failed |
|---|---|---|
| `53a54e7` | "coalescing is inert" (blocker) | true **at that commit**; `a6dfdd3` fixed it. The canvas-typing test passes at HEAD and goes red without the fix |
| `71a7ca6` | "the new test is inert" | that test no longer exists at HEAD |
| `78da3bc` | apostrophe in a `#` comment breaks `ggsave` parsing | parses correctly: 12 × 9 |
| `38f5313` | R snippet targets the parent when the child was pinned | snippet does contain `axis.text.x` |
| `38f5313` | Python caption maps to `figure.titlesize` | not present in the emitted snippet |
| `d88bf96` | ggplot-only copy shown on the Python path | no `theme()` in the Python output |

Two of the six were *historically* true. Auditing a commit in isolation finds
defects that later commits already fixed; a finding is only live once it is
asserted against HEAD.

### Not executable here — 1

**`08f6607`** — hiding the editor with `display: none` may zero `titleOverflowPx`,
dropping the title-overflow shift from the preview and from any print launched
from it. jsdom performs no layout, so `offsetHeight` is always 0 and this is
invisible to the unit suite **by construction**. It needs a browser harness.
Status: UNVERIFIED — neither confirmed nor dismissed.

## 5. Harness defects

- `apps/web/scripts/colophon-stress.ts` documents its usage as
  `npx tsx apps/web/scripts/colophon-stress.ts <outDir>` from the repo root. It
  only runs from `apps/web` — the `@/poster/constants` alias added by `d344e60`
  does not resolve from the root. The committed harness did not run as
  documented.
- Its default layout is `sidebar`, deliberately (worst case), which is easy to
  mistake for the default template when reading a single run.

## 6. Reproducing this

- Falsification sweep: `scratchpad/audit/sweep2.sh` → `sweep2.jsonl`
- Claim assertions: `scratchpad/audit/repro1.test.ts`, `repro2.test.ts`
  (drop into `apps/web/src/poster/__tests__/`; a failure is a live defect)
- Colophon geometry: from `apps/web`,
  `npx tsx scripts/colophon-stress.ts <dir> <3col|2col|billboard|sidebar>`
  then `node scripts/colophon-shots.mjs <dir> <dir>/shots`
