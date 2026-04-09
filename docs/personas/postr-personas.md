# Postr — UX Test Personas

Five personas derived from the PRD's target-user section and feature constraints. Each persona is **actionable**: bio, job-to-be-done, motivations, frustrations, visual preferences, and a **concrete test flow** that a UX verification agent (or a human) can walk through with the live app to validate the experience for that user type.

Update this file whenever the PRD's target users, features, or friction principles change.

---

## 1. Maya — Psychology PhD Student (Pre-Defense Deadline)

**Bio.** Second-year clinical psychology PhD student at a mid-tier US university. Presenting her first conference poster at APA in 10 days. Has a laptop, no design training, and an undergrad advisor who "will glance at it for 30 seconds."

**Job-to-be-done.** Turn her dissertation chapter outline into a readable, competent-looking poster without learning new software.

**Motivations.**

- Deadline pressure — she has 2–3 evenings total.
- Wants to look professional next to postdocs' posters.
- Wants to include properly-formatted stats (η², 𝑝, SD) without wrestling with equation editors.
- Prefers to start from a template and just replace text.

**Frustrations.**

- Anything that requires her to choose between 400 fonts.
- Save dialogs, account creation walls, pricing pages.
- Design tools with infinite freedom — she's paralyzed by blank canvases.
- Losing work on refresh.

**Visual / style preferences.**

- Conservative palette — navy/blue, high contrast, print-safe.
- Classic Academic or Psychology/Neuro palette.
- Sans-serif, likely Source Sans 3 or IBM Plex Sans.
- 3-Column Classic layout.
- Heading numbers on (she'll reference "section 3" in her talk).

**Test flow (run with chrome-devtools-mcp):**

1. Navigate to `/` with fresh cookies → should land straight in the editor, no signup wall.
2. Verify default template is 3-Column Classic with real placeholder blocks (Introduction, Methods, Results, Conclusions).
3. Click the title block → type "Maya Example Poster" → verify it replaces inline.
4. Click a text block → type `/eta2` → verify autocomplete dropdown → Tab → verify `η²` inserted.
5. Switch Style tab → click Psychology/Neuro palette → verify accent colors change across headings + references.
6. Switch Edit tab → verify selected block controls appear.
7. Refresh the page → **Maya test passes only if her edits survived (Phase 4 autosave)**.

---

## 2. Dr. Priya — Postdoc in Computational Biology

**Bio.** Third-year postdoc at a R1 research university. Posters frequently — 3–4/year across multiple conferences. Comfortable with LaTeX, git, and Zotero. Has 4 co-authors across 2 institutions.

**Job-to-be-done.** Quickly assemble a polished poster, import her existing BibTeX library, and push back on her PI's suggestion of "just use PowerPoint."

**Motivations.**

- Speed. She wants sub-30-minute turnaround from outline to PDF.
- Reusing assets across multiple posters — her author list, her institutions, her references.
- Exact control over citation style (her field uses Vancouver).
- Importing from Zotero `.bib` rather than retyping.

**Frustrations.**

- Having to re-enter her co-authors' names and affiliations for every new poster.
- Citation formatters that silently drop DOIs or mangle "et al."
- Tools that don't support markdown-ish italics in text blocks.

**Visual / style preferences.**

- Nature/Biology palette (green) or Clean Minimal.
- Source Serif 4 for body (she thinks it's more "rigorous").
- 2-Col Wide Figure layout — she leads with a data visualization.
- Custom preset saved once, re-applied across all posters.

**Test flow:**

1. Open editor, Authors tab → add 2 institutions + 4 authors with mixed affiliations → verify badge numbers + multi-affiliation sup marks.
2. Mark one author as Corresponding, another as Equal Contribution → verify preview shows `*` and `†` footnotes.
3. Refs tab → click Import → upload a `.bib` file with ≥5 entries → verify all parsed, verify DOIs preserved.
4. Switch citation style to Vancouver → verify every entry reformats to numbered inline style.
5. Style tab → switch font to Source Serif 4, palette to Nature/Biology → save as preset "Priya Nature".
6. (Phase 6) Create a NEW poster, apply the "Priya Nature" preset → verify full style transfers.
7. (Phase 7) Verify her authors/institutions/references appear in "Import from library" pickers on the new poster.

---

## 3. Leo — First-Year Engineering Undergraduate

**Bio.** Sophomore mechanical engineering major at a state school. First research poster ever, for an undergraduate research symposium. Mostly uses his phone; his laptop is 5 years old with a small screen.

**Job-to-be-done.** Produce *something* that looks like a real academic poster without embarrassment.

**Motivations.**

- Doesn't want to look lost or unprepared.
- Wants to follow a clear recipe: pick template, fill in, print.
- Has exactly 2 hours before he needs to send it to his advisor.

**Frustrations.**

- Confusing terminology (what is an "affiliation"? what is a "citation style"?).
- Tools that require him to know what they're asking for.
- Dense walls of UI — he wants big obvious buttons.

**Visual / style preferences.**

- Engineering palette (red accent) because "it looks technical."
- Billboard layout — he has one cool CAD render and wants it huge.
- Default font is fine.
- Doesn't care about heading numbers.

**Test flow:**

1. Open editor at `localhost:5173` on a narrower viewport (1024×768) → verify layout doesn't break, sidebar doesn't overflow.
2. Layout tab → click Billboard template → verify blocks rearrange to wide-figure-plus-3-col-bottom.
3. Click the big image placeholder → upload a PNG → verify it fills the zone with `cover` fit.
4. Click the top text block → type a one-sentence claim → verify it renders centered with large size.
5. Switch palette to Engineering → verify accent color is red.
6. Print button → verify `@media print` rules hide the sidebar and render only the canvas.
7. **Leo test passes only if** he never had to type more than 5 words of jargon and never saw a term he didn't know.

---

## 4. Professor Alonso — Senior Humanities Researcher

**Bio.** Tenured professor of comparative literature. Posters are unusual in his field but he's been invited to present at an interdisciplinary symposium. Uses Chrome on a large external monitor, prefers keyboard shortcuts, worries about every citation.

**Job-to-be-done.** Present his argument as a coherent visual without misrepresenting his sources.

**Motivations.**

- Correctness. Every reference, author initial, and date must be right.
- Minimal visual noise — he distrusts "flashy" modern design.
- Harvard citation style (his journal's convention).

**Frustrations.**

- Automatic-anything that might introduce errors.
- Citation formatters that abbreviate inconsistently.
- Interfaces where he can't see the whole poster at once.

**Visual / style preferences.**

- Humanities/Arts palette (muted earth tones) or Clean Minimal.
- Charter or Literata serif.
- Sidebar + Focus layout — he has lots of text, few images.
- Headings with thin bottom border, no fill.

**Test flow:**

1. Open editor on a 2560×1440 display → verify canvas auto-fits with generous padding, not stretched.
2. Refs tab → manually enter 3 references via the form → verify Harvard style renders "(Smith, 2024)" inline.
3. Refs tab → switch sort to Alphabetical → verify order stable, no dropped entries.
4. Style tab → Humanities/Arts palette + Charter font + heading border "thin" → verify the canvas updates live with no lag.
5. Select a heading → Edit tab → verify he can tweak weight and line-height without touching other blocks.
6. Zoom out to 50% → verify all text remains readable, no clipping.
7. **Alonso test passes only if** every citation formatter round-trips correctly and no heading was accidentally renumbered.

---

## 5. Wei — Medical Resident

**Bio.** PGY-2 internal medicine resident at a large teaching hospital. Presenting a case series at a regional meeting. Has maybe 45 minutes between shifts. Mostly works on a locked-down hospital laptop where she can't install anything.

**Job-to-be-done.** Paste her Excel table, add a title and author block, and produce a medical-clinical-looking PDF.

**Motivations.**

- Zero install — has to be web.
- Zero signup — she has no personal email she'll trust on a hospital machine.
- Pasting from Excel must just work.

**Frustrations.**

- Tools that require Google login or Microsoft login (hospital blocks both).
- Losing 10 minutes to cookie banners.
- Tables that break when pasted.

**Visual / style preferences.**

- Medical/Clinical palette.
- APA 3-line table border (her field's convention).
- Title + authors + one big table + a paragraph of discussion.

**Test flow:**

1. Open editor with third-party cookies blocked → verify anonymous auth still bootstraps (no third-party auth dependency).
2. Add a table block → paste an Excel selection (HTML table) → verify rows/cols populate correctly.
3. Switch table border preset → APA 3-Line → verify only top/bottom/header lines visible.
4. Switch palette → Medical/Clinical.
5. Add an authors block with 3 co-residents → verify preview.
6. Print → verify table borders render correctly in print mode (no extra lines).
7. **Wei test passes only if** she never hit a login wall, her paste worked, and the whole flow took < 8 minutes.

---

## How to use these personas

- **Before a release:** walk through every persona's test flow manually in the live app.
- **Automated:** invoke the `ux-persona-check` skill (`~/.claude/skills/ux-persona-check/`) which drives the browser via chrome-devtools-mcp against each persona's flow and reports pass/fail.
- **When adding a feature:** identify which personas are affected, extend their flows, and add new personas if a new target user emerges.
- **When a persona drifts from reality:** update this file. Personas are living documents, not shipped artifacts.

Persona authorship: generated from PRD §Overview (target users) + §Feature Specifications (capability surface) + §System Architecture (friction principles). Regenerate with the `ux-persona-check` skill when the PRD diverges.
