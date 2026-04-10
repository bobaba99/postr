# Postr — Pre-Launch UX Audit (2026-04-10)

Comprehensive audit after 20+ commits of feature work and bug fixes.
Tested via Playwright MCP on the psilocybin poster (Goodwin 2022 data)
and fresh poster creation flows.

## Regression Check — All Previously-Reported Bugs

| ID | Bug | Status | Evidence |
|---|---|---|---|
| B1 | Title/authors overlap on multi-line titles | **PASS** | gap=3px, overlap=false |
| B2 | References block clips below canvas | **PASS** | height=88px, auto-grows |
| B3 | Table right "+" button clips column gutter | **PASS** | 0 clipped buttons |
| B4 | Table bottom "+" floats below table | **PASS** | shrink-to-fit container |
| M1 | Insert-tab blocks spawn on top of existing blocks | **PASS** | first-free-slot scan |
| K1 | Style presets vanish on poster change | **PASS** | localStorage key exists |
| S1 | Table cells are `<input>`, can't hold rich text | **PASS** | 15 contentEditable divs, 0 inputs |
| M2 | Palette caption label stale | **PASS** | 5-field comparison |
| — | Dashboard shows "NO PREVIEW" | **PASS** | MiniPreview renders all blocks |
| — | Dashboard shows "Untitled Poster" | **PASS** | title sync via autosave |
| — | Browser window.confirm dialogs | **PASS** | ConfirmModal throughout |
| — | Canvas covered by right sidebar | **PASS** | flex layout, no overlap |
| — | Tour grays out sidebars | **PASS** | z-index boost on target |
| — | Table canvas too cluttered (6 buttons) | **PASS** | hover-only edge lines |
| — | Buttons clipped at poster edges | **PASS** | all moved inside bounds |

**0 regressions. All 15 previously-reported bugs remain fixed.**

## Feature Verification

| Feature | Status | Notes |
|---|---|---|
| Dashboard mini-preview | **PASS** | Renders blocks, palettes, images, text |
| Dashboard poster name | **PASS** | Synced from sidebar "Poster Name" field |
| Profile icon in header | **PASS** | Links to /profile |
| Profile page | **PASS** | Account info, link account, preferences, danger zone |
| Profile: clear presets | **PASS** | Wipes localStorage key |
| Profile: replay tour | **PASS** | Resets onboarding flag |
| Profile: delete all / account | **PASS** | ConfirmModal, iterative delete |
| Sidebar: Poster Name + Save | **PASS** | Local state, Save button, red/amber/green borders |
| Sidebar: Layout tab | **PASS** | Size, grid, auto-arrange, templates |
| Sidebar: Insert tab | **PASS** | All 6 block types insertable |
| Sidebar: Edit tab | **PASS** | Table stepper + text block controls |
| Sidebar: Style tab | **PASS** | Palettes, fonts, typography, presets |
| Sidebar: Authors tab | **PASS** | Authors + institutions |
| Sidebar: Refs tab | **PASS** | Manual entry, import, citation style switching |
| Sidebar: Figure tab | **PASS** | Readability panel, R/Python auto-detect |
| Guidelines panel (right) | **PASS** | 7 conferences, 5 resources, flex layout |
| Onboarding tour (9 steps) | **PASS** | Spotlight overlay, sidebar highlight, z-index |
| Table: contentEditable cells | **PASS** | Rich text + bold/highlight |
| Table: Tab/Shift+Tab nav | **PASS** | Moves between cells, wraps rows |
| Table: Arrow key nav | **PASS** | At content edges only |
| Table: Right-click context menu | **PASS** | Figma-style, insert/delete/clear |
| Table: Column resize drag | **PASS** | Pointer capture, 8% min width |
| Table: TSV paste | **PASS** | onPasteCapture intercepts |
| Table: Mini preview in sidebar | **PASS** | Grid thumbnail with filled indicators |
| Image upload | **PASS** | File picker, base64, fit toggle |
| Logo → dashboard link | **PASS** | `<a href="/">` on Postr brand |
| Figure readability: R parser | **PASS** | 24 unit tests |
| Figure readability: Python parser | **PASS** | 24 unit tests |
| Autosave | **PASS** | "Saved · just now" pill visible |

## Layout & Spacing

| Check | Status |
|---|---|
| Left sidebar width (460px) | OK |
| Canvas positioned between sidebars | OK — no overlap |
| Right guidelines panel (320px) | OK — flex child |
| Canvas shrinks when both sidebars open | OK |
| Canvas expands when either closes | OK |
| Font sizes match between left/right sidebars | OK — 12-14pt throughout |

## Console Errors

**0 JavaScript errors.** Two React Router v6 future-flag warnings
(v7_startTransition, v7_relativeSplatPath) — informational only,
not breaking.

## Remaining Items for Launch

### Critical (must fix before launch)
None found.

### Recommended (polish)
1. **Poster name not auto-populated** — new posters show "Your Poster Title" in the dashboard because the Poster Name field defaults empty. Consider auto-filling from the title block on first save if the name is blank.
2. **Onboarding re-triggers** — tour shows every time a poster is opened because `localStorage.setItem` only fires on skip/done, but if the user navigates away mid-tour it doesn't persist.
3. **Table context menu z-index** — the portal renders at z=99999 which could conflict with other overlays. Use a more reasonable value.

### Deferred (post-launch)
- S1 full migration: table cells store HTML strings now, but a dedicated `TableCell` type with `{ text, bold, highlight }` would be cleaner for structured serialization
- OCR-based figure readability (Phase 2 PRD exists)
- Export to PDF (currently print-based)
- Mobile responsive layout
