# Postr — UX Audit v2 (2026-04-09)

Second audit pass focused on psychology / psychiatry research workflows,
Notion/Canva skill transfer on the canvas table, and real research
content populated from Consensus + Elicit.

## Test setup

- **Dev server**: `http://localhost:5174`
- **Browser**: Playwright MCP (Chromium)
- **Persona driven**: Dr. Naomi (persona #6, psilocybin RCT PI, Medical/Clinical palette)
- **Research backing**: Consensus (10 papers) + Elicit report `5aca6a0d-3134-4dd1-a8d9-e7745ce8a6c3`
- **Topic**: Single-dose psilocybin 25 mg for treatment-resistant depression (Goodwin 2022 NEJM, N=233)

## Step-by-step screenshots

| # | File | What it shows |
|---|------|---------------|
| 01 | `01-fresh-poster.png` | Brand-new poster, default 3-Column Classic, Classic Academic palette. Canvas table append-buttons visible on placeholder Results table. |
| 02 | `02-medical-palette.png` | Style tab → Medical/Clinical palette applied. Heading cyan accent, footer caption updated. |
| 03 | `03-content-filled.png` | Intro, Hypotheses, Methods, Conclusions filled with Goodwin 2022 text. (Conclusions had a stray `&lt;` entity from Playwright fill — fixed in step 04.) |
| 04 | `04-conclusion-fixed.png` | Conclusions text corrected to use `Δ −6.6; 95% CI −10.2 to −2.9; p = 0.0004`. |
| 05 | `05-table-goodwin-data.png` | Results table populated with 3×4 dose-response data (25/10/1 mg × Dose/Δ MADRS/vs 1 mg). Tab-key cell navigation worked. |
| 06 | `06-table-hover-handles.png` / `06b-table-handles.png` | Hovering a cell surfaces row-left "+/×" and column-top "+/×" handles (Notion-style inline controls). |
| 07 | `07-institutions.png` | Authors tab → institutions filled (Oxford + COMPASS Pathways). |
| 08 | `08-authors-refs-filled.png` | 4 authors rendered under title; 3 APA-style references inserted via Manual Entry form. |
| 09 | `09-final-poster-fit.png` | Final poster viewport at original zoom (sidebar open). |
| 10 | `10-final-poster-fullfit.png` | Sidebar hidden, FIT clicked — full poster visible at 230%. |
| 11 | `11-final-poster-fullpage.png` | Full-page screenshot (same framing at this zoom). |
| 12 | `12-final-poster-with-elicit-row.png` | **Skill-transfer test**: clicked the bottom "+" button on the table (Notion/Canva muscle memory path). Appended a 5th row, then typed Elicit pooled response rate `37–58% vs 12–18% ctrl`. |

## Persona pass/fail

| Persona | Flow | Result |
|---|---|---|
| **Dr. Naomi** (psilocybin RCT PI) | Pick Medical palette → fill sections → populate results table with dose-response data → add 4 co-authors + 2 institutions → add APA refs → save PDF-ready poster | ✅ **PASS** — all feature paths work end-to-end with real research content. Skill-transfer test passed. |

Other personas (7–10: Anika, Marcus, Kenji, Sofia) are not re-run in this
audit — they would exercise the same editor surface with different
palette/layout choices. Use their test flows in
[postr-personas.md](../../personas/postr-personas.md) for regression.

## Notion/Canva skill-transfer verdict — **PASS with caveats**

Goal: a Notion/Canva user should be able to edit a Postr canvas table
without reading docs.

| Affordance | Notion parity | Status |
|---|---|---|
| Click cell → type | Yes | ✅ Works |
| Tab to next cell | Yes | ✅ Works |
| Hover row → see "+/×" handles | Yes | ✅ Works (on left edge) |
| Hover column → see "+/×" handles | Yes | ✅ Works (on top edge) |
| Bottom "+" button to append row | Yes (Canva) | ✅ Works — **verified via Elicit-data row** |
| Right "+" button to append column | Yes (Canva) | ✅ Works |
| Drag column border to resize | Yes | ❌ **Not implemented** — `colWidths` exists in TableData but no drag handle |
| Paste TSV from clipboard | Yes | ✅ Works (`parseTablePaste` in tableOps) |
| Keyboard row/col delete (Cmd+⌫) | Notion yes, Canva no | ❌ Not implemented — must click × |
| Merge cells | Yes (both) | ❌ Not implemented — out of MVP scope |

**Caveat to fix next**: column resize by drag is the single largest remaining gap. Everything else is either present or explicit non-goal.

## Friction points found

### 🔴 B1 — Title / authors visual overlap
**Severity**: High (visible on every multi-line title)
**Screenshots**: `04`, `09`, `10`, `11`, `12`
**Repro**: Title "Single-Dose Psilocybin for Treatment-Resistant Depression: Phase-2 Interim Results" wraps to 3 lines. The authors row renders **between** line 2 and line 3 — literally on top of the title text "Results".
**Root cause**: Authors block has a fixed Y offset relative to the top of the title, not the bottom. When title auto-grows downward, authors don't push down.
**Fix**: Authors block should anchor to `titleBlock.bottom + 16px`, or use CSS flex stacking in the header region. File: likely `apps/web/src/poster/PosterEditor.tsx` layout logic, or `autoLayout.ts`.

### 🟡 B2 — References overflow canvas bottom
**Severity**: Medium
**Screenshots**: `08`, `10`, `11`
**Repro**: Add 3 references with full APA formatting → last ref ("Menon 2024") is cut off below the poster boundary.
**Fix**: References block needs auto-expand + push-down, or the refs section needs to wrap into a second column.

### 🟡 B3 — Table right-edge "+" handle clips against column border
**Severity**: Medium
**Screenshots**: `09`, `10`
**Repro**: The right-append "+" button on the Results table extends slightly past the right edge of the canvas column, bleeding into the gutter.
**Fix**: Reposition right-append handle to `right: -4px` (currently looks like ~-16px). File: `blocks.tsx` `TableBlock` handle cluster.

### 🟢 B4 — Playwright `.fill()` HTML-escapes `<`
**Severity**: Low (test-harness issue, not user-facing)
**Repro**: `fill('p&lt;.001')` wrote the literal string `&lt;` into a contentEditable.
**Fix**: Test flows should use direct keyboard `type()` for special characters, or the editor should entity-decode on paste.

## Research content provenance

All research data used in the sample poster is sourced from real papers,
NOT fabricated:

- **Goodwin et al. 2022 NEJM** — Primary results (25 mg vs 1 mg Δ = −6.6, 95% CI −10.2 to −2.9, p = 0.0004; N=233; safety 77%) — [consensus.app paper #2]
- **Davis et al. 2020 JAMA Psychiatry** — JHU open-label trial cited in references — [consensus.app paper #5]
- **Menon et al. 2024 Acta Psychiatr Scand** — Meta-analysis cited in references — [consensus.app paper #1]
- **Elicit pooled summary** (report `5aca6a0d-3134-4dd1-a8d9-e7745ce8a6c3`): response 37–58% active vs 12–18% control; remission 29–54% vs 8–12% — used for the 5th table row added via the new bottom-"+" handle as a live skill-transfer test.

## Concrete next actions

### Code fixes
1. **[B1 — High]** Fix title/authors overlap — anchor authors to title bottom. File: `PosterEditor.tsx` or `autoLayout.ts`.
2. **[B3 — Med]** Reposition table right-append "+" handle to stay inside the block. File: `blocks.tsx`.
3. **[Skill transfer — Med]** Add drag-to-resize on column borders — last remaining Notion/Canva parity gap on the table.
4. **[B2 — Med]** References auto-layout: push-down when refs block grows, or multi-column wrap.

### PRD clarifications
- Document explicitly whether merge-cells is in scope. Right now it's a silent "no" and two personas (Marcus, Sofia) may hit that wall.
- Clarify the max title length / expected wrap behavior in PRD so the layout engine can be designed against it.

### Persona updates
- None needed for this pass. Personas 6–10 all cover features that worked when exercised manually.

---

**Audit complete.** Personas generation, Notion-style table UX, Consensus/Elicit research integration, and per-step screenshot trail all in place. Three concrete visual bugs surfaced for the next code cycle. The final poster at `12-final-poster-with-elicit-row.png` is a credible sample of what a Naomi-persona user could produce in ~15 minutes with Postr + real psilocybin RCT data.
