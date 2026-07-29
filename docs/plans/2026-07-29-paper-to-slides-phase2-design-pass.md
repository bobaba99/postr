# Paper-to-Slides Phase 2 — The Design Pass (spec)

**Status:** DESIGNED, approved section-by-section 2026-07-29. Not built.
**Owner:** Gavin. Builds on Phase 1 (shipped) + the design-pass experiments.
**Governs:** the beautification pass — `2026-07-29-paper-to-slides.md` §4 Phase 2.

> Phase 1 shipped a **correct, plain, editable** deck. Phase 2 makes it
> **beautiful — free to everyone** (spec §6: polish is never what the user pays
> for; both the free PDF and the paid PPTX get the full design). Architecture was
> decided by the design-pass experiments (`experiments/design-pass-architecture.md`):
> **Arm T + Arm P; Arm I (generated imagery) deferred.**

---

## 0. Architecture — P leads, T normalizes

```
Phase-1 deck (plain, editable, one-finding-per-slide)
  → Arm P (LLM): styles each slide — layout + presentation devices (progress bar,
    quote block, stat-emphasis, callout) — its own structural choices → styled-layout DATA
  → Arm T (LLM, cheap): a field-aware theme (palette + type scale) applied as a
    recolor/normalize LAYER over P's output — enforces color/type consistency
  → shared styled-layout model (P structure + T theme = one data structure)
      ├─→ pptxgenjs writer  → .pptx  (content + refs + ack + icon slide + palette slide + empty layouts)
      └─→ client PDF writer → .pdf   (content + refs + ack ONLY — utility slides omitted)
```

- **P leads (structure), T normalizes (color/type).** P has creative freedom on
  layout + devices; T enforces a consistent, field-appropriate palette + scale on
  top. Re-theming = re-run the cheap T layer only; P's structure stays.
- **Everything stays editable.** P emits structured layout data, not an image; the
  writer renders real pptx text/shapes. (This is also why the Phase-3 component
  relations model works — structure, not pixels.)
- **Arm I (imagery) is OUT of Phase 2** — no image generation, no cost, no
  editability risk. Saved for a future design feature (its structure would be
  recolorable by T when it lands).

---

## 1. The user flow (vibe/theme)

- User finishes the Phase-1 deck (reaches the "Visuals & notes" / tweaks step) →
  the design pass runs **automatically** when the deck first assembles — the user
  never sees a plain black-and-white deck as a dead end; they see the styled
  version by default. (A "restyle" affordance re-triggers it, but the first run
  is automatic.) **No blocking prompt.**
- Arm P styles + Arm T **auto-derives a field-appropriate theme** from the paper's
  topic — the user sees a **fully styled deck immediately** (instant default).
- A **vibe field + 2 recommended prompts** stay visible in the viewer (e.g.
  *"Clean & minimal, lots of whitespace"* / *"Confident & bold, strong headline
  emphasis"*). Typing a vibe (or picking a suggestion) **re-runs ONLY Arm T** —
  the deck recolors/re-themes in ~1s, ~$0.007. P's structure is untouched.
- This vibe field is the seed of the Phase-3 edit surface (crosswalk + relation
  lookup), but **Phase 2 keeps it to whole-deck re-theming**, not per-component
  edits. (Per-component tweaks + the relation lookup = Phase 3.)

---

## 2. Deliverables

### Every content slide themed
Arm P's device layout + Arm T's palette/type on all slides — the core design pass.
Conference-tolerable devices only (creative list layouts, quotes, progress bars,
text shading, abstract shapes). **No attention-grabbing animation, nothing slow
to interpret, no meme-energy imagery** (real negative feedback informs this). One
design call per deck for P, one cheap call for T.

### 4-palette slide (PPTX-only)
Arm T generates **4 field-appropriate palette variations** (one call). Rendered
as 4 labeled swatch rows on an appended slide. The user can recolor the deck by
picking one (re-runs the T layer with that palette). Real hex, editable.

### Icon-library slide (PPTX-only)
A **curated, tagged, permissively-licensed academic/scientific icon set** (SVG,
monochrome), filtered by the paper's topic keywords (from the DocumentModel /
extraction), ~8–12 icons placed on an appended slide, recolored to the theme. The
user duplicates/substitutes them into content slides in PowerPoint. **No per-deck
image generation** — deterministic + editable. (Icon sourcing is a risk — §5.)

Both utility slides carry `TEMPLATE_SLIDE_PREFIX` naming so the importer does not
warn about them, and **appear ONLY in the .pptx** (§3).

---

## 3. Export architecture (revised from Phase 1)

**One styled-layout model feeds both writers**, so PDF and PPTX match by
construction:

```
styled-layout model (P structure + T theme)
  ├─→ pptxgenjs writer → .pptx : content + refs + ack + icon slide + palette slide + empty layout templates
  └─→ client PDF writer → .pdf : content + refs + ack ONLY (utility slides OMITTED)
```

- **PDF omits the icon/palette/empty-layout slides** — they are PowerPoint-editing
  utilities, meaningless in a PDF. The PDF is the clean, presentable deck.
- **Retires the Phase-1 `window.print()` PDF** (which rendered the DOM, not the
  styled pptx — they would diverge post-Phase-2). The new PDF renders the SAME
  styled-layout model.
- **PDF writer: client-side (jsPDF or pdf-lib).** No server, no LibreOffice
  dependency. **Fallback:** if client-side PDF cannot faithfully reproduce P's
  layout + devices, use headless LibreOffice (`soffice`) server-side as a
  pptx→pdf converter (heavier deploy; only if the client path is inadequate).
- **Free/paid split UNCHANGED (spec §6):** PDF free (with the PNG "Made by
  Postr.sh" ack mark), PPTX paid. Polish is free to both. The PDF being clean
  (no utility slides) is not a downgrade — those slides are only useful inside
  PowerPoint.

---

## 4. What's new vs. reused

**New:**
- `themeGen` (Arm T) — server call in `apps/api`: field theme + 4 palette
  variations. Cheap text model, `reasoning_effort:'none'`, structured output.
- `styleDeck` (Arm P) — server call: per-slide styled layout, constrained to
  editable structured output (positions + device types, never an image).
- The **shared styled-layout model** — the TS type both writers consume.
- **Extended deckWriter** — renders styled layout + theme to editable pptx
  shapes/text/devices (progress bar → shapes; quote block → text + rule; callout
  → box + text; etc.).
- **Client PDF writer** — same layout model → `.pdf`, utility slides omitted.
- **Icon-library + 4-palette slide** builders.
- **Vibe field + 2 suggestions** in the viewer (re-runs T only).

**Reused:** the Phase-1 plain deck (P+T style on top of it), the existing
pptxgenjs `deckWriter` (extended, not replaced), the narrative/extraction
pipeline, the ack mark, the export drawer, `TEMPLATE_SLIDE_PREFIX` importer
contract.

---

## 5. Risk flags (carried into the plan)

1. **Client-side PDF fidelity — LOAD-BEARING.** jsPDF/pdf-lib must faithfully
   reproduce P's layout + devices. **The plan's FIRST task validates this on a
   real styled deck before anything else is built on it.** LibreOffice `soffice`
   is the documented fallback (verified installed on the dev machine; production
   deploy cost is the reason it is the fallback, not the default).
2. **Icon set sourcing.** Needs a curated, permissively-licensed, tagged
   academic/scientific icon set. Early plan task. If unavailable, icons slip to a
   fast-follow — the theme + palettes + styled deck still ship.
3. **P's device → editable pptx mapping.** P returns positions + device types;
   the extended writer maps each device to real editable shapes. **A device P
   invents that the writer can't render must degrade gracefully** (fall back to
   plain text placement, never break the export). The writer's supported-device
   set is a fixed vocabulary P is prompted against.

---

## 6. Explicitly OUT of Phase 2 (guard against scope creep)

- **Arm I / generated imagery** — deferred to a future design feature.
- **Per-component tweaks + the relation lookup + crosswalk edit surface** —
  Phase 3. Phase 2's vibe field is whole-deck re-theming ONLY.
- **The real Stripe paywall** — Phase 3. Phase 2's export drawer stays
  display-only for the paid path.
- **A slide editor** — never. Small tweaks only, per the locked Phase-3 decision;
  anything approaching free-form editing is out.

---

## 7. Copy / house rules (unchanged, still apply)

- No AI framing — name the workflow, not the capability.
- Polish-is-free stated plainly at export (spec §6).
- Generic user-facing errors ("Something went wrong").
- Conference-appropriate restraint — the design must not read as an "AI deck."
