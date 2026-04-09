# UX Audit v2 — Full Persona Pass Findings (2026-04-09)

Ran all 5 psych/psychiatry personas (Naomi, Anika, Marcus, Kenji, Sofia)
end-to-end via Playwright. Consolidated findings below. Naomi's findings
are in the main REPORT.md; this file covers the other 4 + cross-cutting
bugs surfaced.

## Per-persona pass/fail

| # | Persona | Flow | Verdict |
|---|---|---|---|
| 6 | Dr. Naomi | Medical palette + dose-response table + authors + APA refs | ✅ PASS (minor B1/B2/B3) |
| 7 | Anika | Billboard + Psych/Neuro + IBM Plex Sans + heading fill + Greek in claim | ✅ PASS |
| 8 | Dr. Marcus | 2-Col Wide Figure + Clean Minimal + Charter + insert table + TSV paste (9 rows × 4 cols, decimals preserved) + Vancouver ref numbering | ⚠️ PARTIAL — TSV paste ✅, Vancouver ✅, but **M1 table-insert collision**, **M2 palette label stale** |
| 9 | Dr. Kenji | Title 150 pt + Libre Franklin + save preset "Kenji Lab Green" + apply to NEW poster | ❌ **FAIL at round-trip** — preset disappears on new poster |
| 10 | Dr. Sofia | Sidebar + Focus + 25×5 table + inline highlight significant rows | ⚠️ PARTIAL — 25-row table ✅, per-row insert via sidebar ✅, but **S1 cells cannot hold rich HTML** so inline highlight is architecturally impossible |

## Findings — new bugs discovered in this pass

### 🔴 M1/S2 — Inserting a table (or any block) from Insert tab overlaps existing blocks
**Screenshots**: `personas/marcus-01-tsv-paste-vancouver.png`, `personas/sofia-01-25-row-table.png`
**Repro**: Click Insert tab → `+ Table` → new table renders on top of existing Introduction block.
**Root cause**: The new-block default position ignores occupied regions. Auto-Arrange is manual.
**Fix**: When inserting, scan existing blocks and place the new block in the first free grid slot. Or auto-run the layout pass immediately after insert.

### 🔴 K1 — Style presets don't persist across posters
**Evidence**: `apps/web/src/poster/PosterEditor.tsx:266` — `useState<StylePreset[]>([])` is component-local React state; re-mounts on each poster open.
**Repro**: Style tab → Save preset "X" → open new poster → preset X is gone.
**Fix**: Persist to `localStorage` keyed `postr.style-presets` (list is cross-poster, not cross-device). Later: sync via Supabase `user_presets` table for cross-device.

### 🟡 B4 — Bottom-center "+" on table floats far below actual table
**Evidence**: Playwright measured table bottom at y=318 and button at y=519 — 200px below.
**Root cause**: Button is `position: absolute; bottom: -12` inside the BlockFrame, but BlockFrame is sized to its `h` prop (block height), not the intrinsic table height. A default 3×3 table only fills ~80px of a ~280px block.
**Fix**: Position the "+" relative to the `<table>` element itself, not the frame. Wrap the button + table in a `position: relative` span.

### 🔴 S1 — Table cells are `<input>` elements and cannot hold rich text / marks
**Evidence**: `packages/shared/src/types/poster.ts:25` — `cells: string[]`. `blocks.tsx` TableBlock renders each cell as `<input value={...} />`.
**Impact**: Sofia's "highlight significant rows" requirement is unsupportable without a schema migration. Slash-commands (`/mu`, `/eta2`) inside cells are also blocked — Greek insertion via slash won't work in a table context either.
**Fix (MVP)**: Migrate to `cells: Array<{ text: string; mark?: 'highlight' | null; bold?: boolean }>`, render as contentEditable spans. Preserve old string[] via a one-time migration helper.
**Deferred**: This is a schema-migration-scoped change. I'll note the gap but not ship the full TableData v2 in this batch — the safer path is a follow-up PR with migration tests.

### 🟡 M2 — Palette label in canvas caption may be stale after programmatic click
**Evidence**: In the Marcus run, the caption said "Classic Academic" despite clicking "Clean Minimal".
**Uncertainty**: Playwright's synthetic `.click()` didn't reliably fire the React handler in this run — while Anika's `Psychology / Neuro` click worked in the same session. Possible test-harness flake rather than prod bug.
**Fix plan**: Mark as "needs manual verification". Do not ship a speculative fix. If repro confirmed, check for a race between `onChangePalette` and the caption re-render.

## Cross-cutting from v1 Naomi findings

Still open from the Naomi-only audit (REPORT.md):

- **B1** — Title/authors visual overlap (authors anchored to title top, not bottom)
- **B2** — References overflow canvas bottom
- **B3** — Table right-append "+" handle clips against column border
- **Skill-transfer gap** — No drag-to-resize on column borders

## Fix priority & plan

Shipping in this batch (high-confidence, contained):

1. **B1** — Anchor AuthorLine to title-bottom in `PosterEditor.tsx`/`autoLayout.ts`
2. **B2** — References block auto-expand on content growth
3. **B3** — Reposition table `+` handle to `right: -2` instead of clipping
4. **B4** — Position bottom "+" relative to table intrinsic height, not block frame
5. **M1/S2** — First-free-slot placement on Insert-tab block creation
6. **K1** — Persist presets to `localStorage`
7. **Drag-to-resize column borders** — Full implementation on column borders

Deferring:

- **S1** TableData v2 rich-cell migration — follow-up PR with schema tests
- **M2** Palette caption flake — manual verification required first

## Screenshots

- `personas/anika-01-billboard.png` — Anika Billboard pass
- `personas/marcus-01-tsv-paste-vancouver.png` — Marcus TSV-paste + Vancouver (shows M1 table collision)
- `personas/sofia-01-25-row-table.png` — Sofia 25×5 table built (shows S2 table collision + sidebar row controls)
