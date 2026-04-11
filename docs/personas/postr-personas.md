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

## 6. Dr. Naomi — Clinical Psychiatrist Running a Phase-2 Psilocybin RCT

**Bio.** Assistant professor of psychiatry at an academic medical center. PI on a Phase-2 RCT of single-dose psilocybin for treatment-resistant depression. Presenting interim safety + efficacy data at the ACNP annual meeting. Reports to an IRB and an FDA IND.

**Job-to-be-done.** Present interim Week-3 MADRS results, response/remission rates, and the adverse-event profile in a poster that her PharmD collaborators and a skeptical reviewer can both audit. Every number has to be traceable to a source table.

**Motivations.**

- Correctness — the P-values, confidence intervals, and adverse-event counts **must** be accurate.
- Clean statistical notation: MADRS, 95% CI, Cohen d, η², χ², N =, df.
- Conservative design — she distrusts loud accents on clinical posters.

**Frustrations.**

- Citation managers that silently truncate DOIs.
- Forced autoformatting of numerical tables (ranges becoming dates in Excel).
- Font-size controls that are imprecise in points.

**Visual / style preferences.**

- Medical/Clinical palette (navy + cyan).
- Source Sans 3 or Source Serif 4.
- APA 3-Line table borders for the efficacy table.
- Heading numbers off — she wants clean section headers.

**Test flow:**

1. Navigate to `/`, create a new poster.
2. Title: "Single-Dose Psilocybin for Treatment-Resistant Depression: Interim Phase-2 Results".
3. Authors: 4 authors across 2 institutions. One corresponding, one with equal-contrib mark.
4. Intro: 1-paragraph summary with `/MADRS` symbol inline where a lowercase p is needed (use `/p`).
5. Methods: N = 233, three arms (25 mg / 10 mg / 1 mg), MADRS as primary, psychological support.
6. Results table (5 rows × 4 cols): Measure · Δ MADRS · 95% CI · p — fill with the numeric values from Goodwin 2022.
7. Conclusions: 25 mg significantly reduced depression scores, no sustained 12-week effect — cautious language.
8. Style tab → Medical/Clinical palette → APA 3-Line table border.
9. Save to PDF.
10. **Naomi test passes only if** every cell in the results table round-trips through the sidebar edit panel without mangling decimal points or losing "95% CI" in the header.

---

## 7. Anika — Developmental Psychology PhD Running an Infant EEG Study

**Bio.** 4th-year PhD student studying early attention development via infant EEG (6–12 mo). Submitting her first-author poster to the International Congress on Infant Studies. Dataset: 42 infants, mixed methods (gaze fixation + ERP components N170 and Nc).

**Job-to-be-done.** Walk a reviewer through her ERP findings without losing the non-specialists who wander past her poster.

**Motivations.**

- Visual clarity — one hero figure (the grand-average ERP waveform) must dominate.
- Hierarchical reasoning: hypothesis → methods → result → interpretation.
- Credit her 2 undergrad RAs as authors with equal contribution.

**Frustrations.**

- Editors that can't handle Greek letters or superscripts without LaTeX.
- Image placeholders that auto-crop her carefully-plotted waveforms.

**Visual / style preferences.**

- Psychology/Neuro palette.
- IBM Plex Sans for modern-academic feel.
- Billboard layout — big assertion up top, hero ERP figure in the middle, 3-col bottom for Background/Methods/Interpretation.
- Heading fill on.

**Test flow:**

1. Create new poster → Layout tab → Billboard template.
2. Title: "Attentional Capture by Socially Salient Faces Elicits an Enhanced Nc at 7 Months".
3. Authors: PI + Anika + 2 undergrads (one corresponding on PI, 2 equal-contrib on undergrads).
4. Replace Billboard's claim text with her key finding.
5. Click image placeholder → upload a waveform PNG.
6. Add text block under the figure with `/mu` V amplitude, `/eta2` effect sizes.
7. Style tab → Psychology/Neuro palette + IBM Plex Sans + heading fill.
8. **Anika test passes only if** the hero figure never clips under her one-sentence claim and her Greek notation survives palette switches.

---

## 8. Dr. Marcus — Social Psychology Postdoc Replicating a Classic

**Bio.** Social psychology postdoc at a European lab, part of the Many Labs consortium. Running a pre-registered replication of a 1998 social-priming study across 8 sites, presenting the aggregate results at SPSP.

**Job-to-be-done.** Present a forest plot of effect sizes across sites, the original effect, and the replication estimate. Defend nuance in a hostile Q&A.

**Motivations.**

- Methodological transparency — OSF links, pre-registration statements, Bayes factors.
- Enough space for a small-text "Methods" section that lists every deviation from the original.
- Vancouver citation style for the meta-analytic references.

**Frustrations.**

- Tools that don't render Unicode italic math (𝑝, 𝑑) correctly.
- Software that fails to copy-paste a Word table without mangling the decimals.

**Visual / style preferences.**

- Clean Minimal palette.
- Charter serif.
- 2-Col Wide Figure layout — forest plot as the hero.
- Heading border "bottom" thin, no fill.

**Test flow:**

1. New poster → 2-Col Wide Figure template.
2. Title: "Social Priming Replication Across 8 Sites: A Preregistered Multi-Lab Report".
3. Authors: Marcus + 8 site leads with distinct affiliations.
4. Paste a Word table with 8 rows (site × effect size × SE × 95% CI) into the table cell — verify paste works.
5. `/d`, `/p`, `/eta2` inline in the Methods + Results prose.
6. Refs tab → switch to Vancouver → import a `.bib` with the 12 papers he cites.
7. Style tab → Clean Minimal + Charter + heading border "Bottom".
8. **Marcus test passes only if** the 8-row table pasted cleanly, every decimal preserved, and his Vancouver citations are numbered inline.

---

## 9. Dr. Kenji — Psychopharmacology PI with a Tight Visual Sense

**Bio.** Associate professor of psychopharmacology. 20 years of posters. Known for dense, data-forward designs. Running a mouse model of SSRI pharmacokinetics. His lab produces 6 posters a year — he wants to save his style as a preset.

**Job-to-be-done.** Produce his lab's signature "Kenji Green" poster in under 20 minutes, because he's using Postr for the first time and has already rendered the figures in R.

**Motivations.**

- Speed.
- Reusability — he's going to use Postr for every lab poster henceforth if the preset feature works.
- Precise font-size control.

**Frustrations.**

- Presets that don't round-trip — "it looked different when I applied it to the next poster".
- Any tool that forces a specific color palette.

**Visual / style preferences.**

- Custom green palette (he'll override Nature/Biology base).
- Libre Franklin.
- 3-Column Classic with a custom twist — bolder heading borders.
- Title font 150 pt exactly.

**Test flow:**

1. Open editor, Style tab → set title to exactly 150 pt via the numeric input.
2. Override palette accent color to #008060 via the text color picker on a heading.
3. Save current style as preset "Kenji Lab Green".
4. Create a NEW poster, apply the "Kenji Lab Green" preset.
5. **Kenji test passes only if** the new poster looks identical to the one where the preset was saved — same title pt, same accent, same heading border.

---

## 10. Dr. Sofia — Clinical Psychology Assistant Professor Presenting a Meta-Analysis

**Bio.** Clinical psychology assistant professor. Running a meta-analysis of CBT for generalized anxiety disorder across 24 RCTs. Her last poster had a cluttered forest plot she's still embarrassed about.

**Job-to-be-done.** Present a clean forest plot + summary statistics without over-crowding the canvas. The results table must accommodate per-study effect sizes for 24 trials — small table, lots of rows.

**Motivations.**

- Avoiding clutter.
- Per-row control on the results table — she needs to insert/delete specific rows, not just append.
- Highlighting statistically significant rows inline (she'll use the inline highlight feature).

**Frustrations.**

- Tables with fixed row counts.
- Highlight tools that apply to the whole block rather than a selection.

**Visual / style preferences.**

- Humanities/Arts palette (warm earth) — she likes the contrast.
- Source Serif 4.
- Sidebar + Focus layout — narrow text left, wide forest plot right.
- Inline highlight on the significant-result rows.

**Test flow:**

1. New poster → Sidebar + Focus template.
2. Add a table block, expand to 25 rows × 5 cols (24 trials + header).
3. Use the sidebar table editor to insert rows at the top without deleting existing content.
4. Select the text in specific "significant" cells → use the floating format toolbar to apply a yellow highlight and bold.
5. Refs tab → manual entry of 3 key citations.
6. Style tab → Humanities/Arts + Source Serif 4.
7. **Sofia test passes only if** the per-row insert works, inline highlight applies only to the selected cells (not the whole table), and bold survives the autosave round trip.

---

## 11. Tomás — Anonymous Visitor Landing on the Public Gallery

**Bio.** Third-year biology PhD student at a Spanish university. A friend posted a link to `/gallery` in a Slack channel. He has no Postr account and no intention of making one *yet* — he just wants to see if other people have used it for posters that look serious.

**Job-to-be-done.** Browse the gallery anonymously, judge the quality of what's there, and decide whether Postr is worth signing up for.

**Motivations.**

- Curiosity, not commitment.
- Wants to see real, finished examples — not screenshots in a marketing page.
- Wants to filter by his field (biology) so he doesn't have to wade through neuroscience and physics.

**Frustrations.**

- Sign-up walls for read-only browsing.
- Empty galleries with placeholder copy.
- Filters that pretend to work but don't actually narrow the list.
- Copy that talks about "communities" he hasn't joined yet.

**Visual / style preferences.**

- Cares about thumbnail quality. Blurry thumbnails make him close the tab.
- Wants to click an entry and see the full image, not a tiny modal.

**Test flow:**

1. Navigate to `/gallery` with no auth cookies → page should render without redirect to `/auth`.
2. Verify the field-dropdown filter exists and includes "Biology".
3. If the gallery is empty, the empty state should not say "sign up to publish" — it should not pressure him.
4. Click the field filter → "Biology" → confirm grid filters or shows the empty-for-this-field message.
5. Click into an entry detail page → confirm full image loads, retraction disclaimer is visible, takedown contact email is present.
6. Open the public footer → click Privacy / Cookies / Terms → each loads without auth.
7. **Tomás test passes only if** the entire gallery + legal flow is reachable without authentication, and no part of the experience nags him to sign up.

---

## 12. Hannah — Recent Graduate Publishing Her Defense Poster

**Bio.** Just defended her MSc thesis in social psychology. Wants to publish her poster as a portfolio piece on the public gallery so it shows up in her CV link. Already has a Postr account from drafting earlier.

**Job-to-be-done.** Take her completed poster from the editor, push the Publish button, accept whatever consent the system needs, and end up with a stable URL she can paste into her CV.

**Motivations.**

- A canonical link she can share publicly.
- Pride — she wants her name and her university on a real page indexed by search engines.
- Confidence that she can pull it down later if her advisor objects.

**Frustrations.**

- Multi-step modals where she loses her place.
- Consent screens that feel like terms-of-service ambush.
- A "publish" button that produces a blurry low-res image of her work.
- No way to retract if her advisor or co-authors push back.

**Visual / style preferences.**

- Polished metadata form: title pre-filled, field dropdown sensible, year defaulted to current.
- Sharp captured image — print-DPI quality.

**Test flow:**

1. Sign in → land on `/dashboard` → confirm her existing posters are listed.
2. Verify a "Publish" button is reachable on each poster card AND on the editor sidebar.
3. From dashboard card → click Publish → confirm she lands in the editor with the poster fully rendered before any modal opens (so the canvas can be captured).
4. Consent modal: confirm 4 required tick-boxes (rightful owner, co-authors agreed, no confidential material, retract-on-ownership-change) and confirm the Publish button stays disabled until all four are ticked.
5. Metadata modal: title pre-filled with poster name, field dropdown defaults to a sensible option, year input defaults to current year, capture preview shows a sharp image (not blurry), file size badge visible.
6. Submit → land on `/gallery/:id` → confirm the entry is publicly viewable, full image loads, footer disclaimer present.
7. Navigate to `/profile` → "Gallery submissions" section → confirm her new entry is listed with a Retract button.
8. Click Retract → ConfirmModal → confirm → confirm the entry disappears from `/gallery` immediately.
9. **Hannah test passes only if** the publish round-trip from dashboard → gallery URL takes fewer than 8 clicks, the captured image is print-readable quality, and retraction is one button press from her Profile page.

---

## 13. Gavin — Solo Founder Acting as Gallery Moderator

**Bio.** Solo dev who built Postr. Email is on the `admin_emails` allowlist. Needs to scan new gallery submissions every couple of days and pull down anything that's clearly copyrighted, confidential, or junk — without context-switching out of the app into Supabase Studio.

**Job-to-be-done.** Triage the gallery from a dedicated admin page, force-retract problem entries with a reason, occasionally undo a mistaken retraction.

**Motivations.**

- Speed — moderation should not interrupt his coding flow.
- Audit trail — when he retracts something, his reason should be visible to the author so they understand.
- Reversibility — he wants to be able to unretract if he was wrong, without restoring from a backup.

**Frustrations.**

- Going to Supabase Studio for moderation actions.
- Hidden admin pages he can't link from a normal nav.
- Force-retract without a reason field — leaves him no way to communicate with the author.
- Permanent deletes that lose the audit trail.

**Visual / style preferences.**

- Compact admin layout — many entries visible without scrolling.
- Clear visual difference between active and retracted rows.
- Filter buttons (All / Active / Retracted) so he can do a "show me retracted" pass before walking away.

**Test flow:**

1. Sign in as the admin email → land on `/dashboard` → confirm the "Admin" link appears in the header (and only for him).
2. Click Admin → land on `/admin/gallery` → confirm the page loads with every entry visible (his own AND other users').
3. Test the All / Active / Retracted filter buttons → counts update.
4. Click Retract on an active entry → inline reason textarea appears → try to submit empty → button should be disabled.
5. Type a reason → click Retract → confirm row gets the "Retracted" badge and the reason shows below the title.
6. Switch to the Retracted filter → confirm the row appears there.
7. Click Unretract on the row → confirm it returns to active state.
8. Sign out → sign in with a non-admin account → confirm the Admin link is hidden in the dashboard header AND `/admin/gallery` redirects to `/dashboard`.
9. **Gavin test passes only if** the full retract → unretract loop happens inside `/admin/gallery` without any Studio detour, and the access gate works for non-admins.

---

## How to use these personas

- **Before a release:** walk through every persona's test flow manually in the live app.
- **Automated:** invoke the `ux-persona-check` skill (`~/.claude/skills/ux-persona-check/`) which drives the browser via chrome-devtools-mcp against each persona's flow and reports pass/fail.
- **When adding a feature:** identify which personas are affected, extend their flows, and add new personas if a new target user emerges.
- **When a persona drifts from reality:** update this file. Personas are living documents, not shipped artifacts.

Persona authorship: generated from PRD §Overview (target users) + §Feature Specifications (capability surface) + §System Architecture (friction principles). Regenerate with the `ux-persona-check` skill when the PRD diverges.
