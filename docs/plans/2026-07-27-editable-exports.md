# Editable Exports — PPTX and LaTeX

> **For Claude:** design + implementation plan. Blocks the presentation half of
> `2026-07-27-manuscript-pipeline.md`.
> `.fig` was considered and **dropped by Gavin (2026-07-27)** — Figma's format is a
> proprietary binary with no public writer. Do not reintroduce it.

**Goal:** export a poster to formats the user can keep editing elsewhere. Today the only
export is browser print-to-PDF, which is final-form — good for the printer, useless for the
advisor who wants to move a box.

**Formats:** PPTX (PowerPoint/Keynote/Google Slides) and LaTeX (source, compilable).

---

## 1. The coordinate model makes this tractable

Postr stores every block as absolute `(x, y, w, h)` in **poster units where 1 unit = 1/10
inch**, with `POINTS_PER_UNIT = 7.2` (`constants.ts:33`). Both targets are absolute
positioning systems, so the conversions are exact integers-to-scale, not approximations:

| | Per poster unit | Derivation |
|---|---|---|
| Inches | `0.1` | by definition |
| Points | `7.2` | `POINTS_PER_UNIT` |
| **EMU** (PPTX) | **`91440`** | 914400 EMU/inch × 0.1 |
| Millimetres | `2.54` | |

EMU is an integer unit, and 91440 is an integer, so **PPTX geometry round-trips with zero
floating-point drift.** That is a real piece of luck and the reason PPTX is worth doing
properly rather than rasterising.

---

## 2. ⚠ PowerPoint's 56-inch ceiling — read this before scoping

**PowerPoint's maximum slide dimension is 56 inches (142.24 cm) per side.**

Postr ships poster sizes that exceed it. Most importantly **SfN's board is 72 × 48 in** — the
single most common target in Postr's core neuroscience audience. A 72-inch-wide poster
**cannot be represented 1:1 in a PPTX file.** This is a hard format limit, not a bug we can
engineer around.

### The handling

Emit at **half scale** whenever either dimension exceeds 56 in, which is exactly what poster
print shops already instruct people to do:

- Slide size `36 × 24 in` for a `72 × 48 in` poster.
- **Every** geometry and font size multiplied by the same `0.5`.
- The user prints at 200%.

Requirements on top of that:

1. **Tell the user, at export time, in the UI** — not in a README nobody reads. "Your poster is 72×48 in. PowerPoint's limit is 56 in, so this file is half size — print at 200%." Silent scaling is how someone prints a 36-inch poster for a 72-inch board.
2. **Write it into the file too** — a text note in the PPTX core properties `description` field, and an off-canvas text box on the slide. It survives being emailed to a supervisor without the export screen.
3. **Never scale silently, and never scale by anything but 0.5.** Arbitrary scale factors produce non-round font sizes and make the 200% instruction wrong.
4. LaTeX has **no such limit** — `geometry` accepts any paper size. Full size always. This is a genuine argument for LaTeX being the better editable export for large posters, and the UI should say so when the ceiling is hit.

---

## 3. PPTX writer

### Dependency decision: `pptxgenjs` — DECIDED (Gavin, 2026-07-27)

**Use `pptxgenjs`. Lazy-load it.** The trade-off below is retained as the record of why,
but the decision is made — do not re-open it.

`pptxgenjs` must be behind a dynamic `import()` so posters that are never exported to
PowerPoint pay nothing, exactly as `@observablehq/plot` is handled in the plot-picker design.

Two things the library will *not* do for us, which remain our code:
1. **The 56-inch ceiling logic (§2).** `pptxgenjs` will happily accept an out-of-range
   `defineLayout` and emit a file PowerPoint refuses. The scale decision, the warning, and
   the core-properties note are ours.
2. **Rich-text run mapping.** Its text API takes an array of run objects; converting our
   `RichTextEditor` HTML into that array is the §6 high-risk mapping either way.

A `.pptx` is a ZIP of XML, and `fflate` is **already a dependency** used to write `.postr`
bundles (`import/postrFile.ts`), so hand-rolling was viable — this is the option not taken:

| | Hand-rolled + fflate | `pptxgenjs` |
|---|---|---|
| Bundle cost | **0 KB** | ~500 KB (lazy-loadable) |
| Slide-size ceiling handling | full control | fights its own abstractions at exotic sizes |
| Font embedding | we choose | limited |
| Code | ~600 lines, mostly static XML templates | ~150 lines |
| Risk | XML correctness; mitigated by fixture tests | mature, battle-tested |

The deciding factor is that most of those 600 lines are **static template strings** —
`[Content_Types].xml`, `presentation.xml`, the slide master, the theme — with a handful of
substitution points. Only `slide1.xml` is genuinely generated. That is not 600 lines of
*logic*, it is 600 lines of boilerplate we write once.

If Gavin prefers shipping speed over bundle size, `pptxgenjs` is a legitimate call and the
§4 block-mapping table is unchanged either way. **This is one of the staged approvals.**

### Archive layout

```
[Content_Types].xml
_rels/.rels
docProps/core.xml            ← title, authors, the scale note
docProps/app.xml
ppt/presentation.xml         ← sldSz cx/cy in EMU  ← the ceiling logic lands here
ppt/_rels/presentation.xml.rels
ppt/slideMasters/slideMaster1.xml (+ _rels)
ppt/slideLayouts/slideLayout1.xml (+ _rels)   ← one blank layout, that is all we need
ppt/theme/theme1.xml         ← poster palette mapped to the theme color slots
ppt/slides/slide1.xml        ← every block, generated
ppt/slides/_rels/slide1.xml.rels
ppt/media/image1.png…        ← resolved from storage:// paths
```

Mapping the poster palette onto the **theme** color slots (rather than hardcoding hex per
shape) means a user who applies a PowerPoint theme later gets sane results, and it mirrors
how `ChartSpec` uses palette slots.

### Block → shape mapping

| Postr block | PPTX | Notes |
|---|---|---|
| `title`, `heading`, `text` | `<p:sp>` with `<p:txBody>` | Rich text (`RichTextEditor`) → `<a:r>` runs with `b`/`i`/`u`. **This is the highest-risk mapping** — see §6 |
| `authors` | text shape | Superscript affiliation markers → `baseline="30000"` |
| `references` | text shape | Hanging indent via `<a:pPr marL indent>` |
| `image`, `logo` | `<p:pic>` | Resolve `storage://` → bytes → `ppt/media/`. `imageFit` → `<a:srcRect>` crop |
| `table` | `<a:tbl>` | Native PowerPoint table — genuinely editable, and the direct answer to the PowerPoint table pain in `COMP_EDGE.md` |
| `chart` (future) | `<p:pic>` with SVG + PNG fallback | Real OOXML charts are a large separate project; not now |
| `caption` | separate text shape | Positioned per `captionPosition`, number prefix baked in |
| `rotation` | `<a:xfrm rot="…">` | 60000ths of a degree, clockwise — same convention as ours |

### Fonts

Postr's ten families are all **SIL Open Font License**, which permits embedding. But PPTX
font embedding is fiddly and PowerPoint-for-Mac support is inconsistent.

**Phase 1:** reference fonts by name and ship a **font-substitution warning** in the export
dialog listing which families the user needs installed, with a Google Fonts link.
**Phase 2:** evaluate real embedding.

Do not silently map to Arial. A poster whose type has been substituted has had its line
breaks changed, which changes its layout, which is the thing the user is exporting to
preserve.

---

## 4. LaTeX writer

### Class decision: `article` + `geometry` + `textpos`

**Not `tikzposter`, not `beamerposter`.**

Both impose their own column/block model, which fights Postr's free absolute positioning —
converting into them means *inferring* a column structure that may not exist, and the output
would not match what the user built. `textpos`'s `textblock` environment is absolute
positioning with a settable unit, which is a **1:1 structural match** for our model.

```latex
\documentclass{article}
\usepackage[paperwidth=48in,paperheight=36in,margin=0in]{geometry}
\usepackage[absolute,overlay]{textpos}
\setlength{\TPHorizModule}{0.1in}   % 1 Postr unit, exactly
\setlength{\TPVertModule}{0.1in}
\usepackage{fontspec}                % XeLaTeX/LuaLaTeX
\usepackage{xcolor}
\usepackage{graphicx}

\begin{document}
\begin{textblock}{240}(20,15)        % w=240u at x=20u, y=15u — raw Postr coords
  {\fontsize{96}{115}\selectfont\bfseries\color{postrTitle} Poster title here}
\end{textblock}
\end{document}
```

Setting `TPHorizModule` to `0.1in` means **block coordinates are emitted verbatim**. No
conversion, no rounding, and the file is legible to a human who wants to nudge something.

**Engine:** XeLaTeX/LuaLaTeX via `fontspec` for the real Google fonts. Emit a commented
pdfLaTeX fallback block mapping each family to a TeX-native near-equivalent (Source Sans
Pro → `sourcesanspro`, Lora → `cochineal`, …) for users on a locked-down TeX install.

**Deliverable is a `.zip`**: `poster.tex`, `figures/`, `references.bib` (from `citations.ts`),
and a `README.txt` with the one-line compile command. A bare `.tex` with broken image paths
is not an export.

### Beamer for talks

The presentation half of the manuscript pipeline emits `beamer` — the standard, and the one
academics can actually edit. One frame per `SlideDeck` slide, speaker notes to `\note{}`.

---

## 5. Where this plugs in

- **Editor:** the existing export/print affordance in `PosterEditor.tsx` becomes a small menu — Print / PDF · PowerPoint (.pptx) · LaTeX (.zip) · Postr bundle (.postr).
- **Standalone pipeline pages:** the same writers, called on a `PosterDoc` that was never opened in the editor. **Therefore both writers must be pure `PosterDoc → bytes` functions with no DOM dependency** — no `html-to-image`, no reading computed styles off a live canvas. This is the single most important architectural constraint in this doc, and violating it silently breaks the standalone pipeline.
- **Module:** `apps/web/src/export/` — `pptx/`, `latex/`, shared `resolveAssets.ts` (storage:// → bytes) and `units.ts`.

## 6. Testing

- **Unit:** unit→EMU and unit→textpos conversions (exactness, not tolerance); the 56-inch ceiling logic (72×48 → half scale; 48×36 → unscaled; boundary at exactly 56); rich-text run splitting; LaTeX escaping.
- **`\LaTeX` escaping is a correctness *and* security surface.** Poster text is user content going into a language with command execution. Escape `\ { } $ & # ^ _ ~ %`, and never emit user content anywhere it could be read as a control sequence. Fuzz it.
- **Fixture tests:** golden files for a known `PosterDoc`. Byte-compare the XML with normalised whitespace.
- **Validation:** unzip generated PPTX in CI and validate each part against the OOXML schema. Catches malformed XML that PowerPoint would silently refuse to open.
- **Manual, once per release:** open in PowerPoint (Mac + Windows), Keynote, Google Slides, LibreOffice. Compile the LaTeX with XeLaTeX and pdfLaTeX. There is no substitute.

## 7. Phasing

| Phase | Ships |
|---|---|
| **1** | LaTeX writer end-to-end. *Deliberately first* — plain text output, no ZIP-of-XML risk, no 56-inch problem, and it exercises `resolveAssets` + `units` for the PPTX phase |
| **2** | PPTX writer: text, images, tables, rotation, theme palette, ceiling handling, font warning |
| **3** | Beamer + PPTX for `SlideDeck` (unblocks the manuscript pipeline's talk half) |
| **4** | PPTX font embedding; native OOXML charts for `chart` blocks |

LaTeX-first inverts the obvious order on purpose: it is lower risk, it de-risks the shared
asset/units layer, and its audience overlaps almost perfectly with the STEM users who care
most about editable output.

## 8. Open questions

1. **`pptxgenjs` or hand-rolled?** (§3) — staged for approval. My recommendation is hand-rolled.
2. **Half-scale PPTX** — acceptable for >56 in, or should we refuse and steer to LaTeX/PDF? I favour emitting with loud warnings; a half-size file is useful, a refusal is not.
3. **LaTeX default engine** — XeLaTeX with real fonts (my proposal), or pdfLaTeX with substituted fonts for maximum compatibility?
4. **`tikzposter` as a second, opinionated LaTeX target** later? It produces a more conventionally "LaTeX-looking" poster, at the cost of not matching what the user built.
