# Postr Import Flow — User Personas

Generated 2026-04-27 to drive UX checks on the PDF / `.postr` /
image import path. Anchored to PRD §16 (Upload-to-editable reverse
import).

---

## 1. Maya — Postdoc updating a previous-year poster

**Bio.** Cognitive psychology postdoc at McGill, second year on the
job market. Has a published `Maya_SfN2024.pdf` saved in Drive,
text-layer intact (Word → "Save as PDF"). Going to APA 2026 with a
follow-up study and wants the same look, updated content.

**Job-to-be-done.** Drop the 2024 PDF on Postr's dashboard, get
every text block + figure on the canvas, and start editing.

**Motivations.**
- Re-typing 1500 words feels insulting after she built it once.
- Wants the structured author + affiliation system (PRD §6) populated
  on import — her co-authors haven't changed.
- Wants references to come along too eventually, but accepts that
  Tier 0 may not parse them.

**Frustrations.**
- A page where she has to "re-add 14 figures one at a time."
- Author block dumped as one giant text block — that's the manual
  data-entry she was trying to avoid.
- A modal that hangs without progress feedback.

**Visual / style preferences.** Compact, editorial. Dislikes a
busy preview with placeholder graphics polluting the import.

**Test flow (text-layer PDF):**
1. Navigate to `/dashboard` (anonymous session).
2. Click **+ New poster ▾** chevron.
3. Confirm menu shows "Import PDF / .postr…".
4. Click "Import PDF / .postr…", drop `EW_INS.pdf` (proxy for her
   2024 PDF).
5. Wait for the **animated step list** to advance: Reading → Detecting
   text blocks → Extracting figures (n/m) → Building preview.
6. Preview panel shows summary `>= 4 text blocks`, `>= 5 images`,
   warnings list, "Try LLM extraction" button (hidden disabled in
   Tier 0).
7. Confirm. Lands at `/p/{newId}`.
8. Click **Authors** sidebar tab. Asserts:
   - At least 3 institutions parsed
   - At least 3 authors parsed
   - First author has at least one affiliation badge selected
9. Click **Layout** sidebar tab. Asserts: Poster size auto-detected
   to 36"×42" (matches source PDF).
10. Click on the canvas title block. Asserts: title content does NOT
    include the authors string (issue #2 regression).

---

## 2. David — Canva-export PDF user

**Bio.** PhD in computational biology, designed his last poster in
Canva and exported as `Douglas_poster.pdf`. Canva flattens text to
outlines — `pdftotext` returns 0 chars. Has the original `.png` he
uploaded for the cover image but not the rest.

**Job-to-be-done.** Try to reuse last-year's design, fall back to
manual rebuild if the import won't work, but get a clear answer
either way (not a hung spinner).

**Motivations.**
- Wants Postr's plot-readability check + structured authors —
  things Canva doesn't have.
- Doesn't want to babysit a long upload.

**Frustrations.**
- Indefinite spinners with no error.
- A modal that quietly succeeds with garbage when extraction fails.

**Test flow (no-text-layer PDF):**
1. Navigate to `/dashboard`.
2. Open Import modal (chevron → Import).
3. Drop `PresenterGeng.pdf` (12.6 MB, 0 chars from pdftotext —
   stand-in for Canva-exported).
4. Wait for extraction.
5. **Expected**: clear toast / inline error: "This PDF has no
   selectable text. Image OCR ships in the next release." OR (after
   Tier 1 ships) automatic fallback to image OCR with the same
   progress UI.
6. **Anti-pattern check**: modal must NOT silently succeed with an
   empty doc.
7. **Anti-pattern check**: modal must offer a clear next-action
   (Cancel button enabled, retry button visible if Tier 1 vision
   fails).

---

## 3. Aiko — Researcher with an image-only export

**Bio.** Research assistant in a memory clinic, MacBook Pro 14".
Took a screenshot (`POSTER_DRAFT_page-0001.jpg`) of the PI's poster
in PowerPoint over Zoom because the original `.pptx` lives on a
locked server. Wants to start from this image as best she can.

**Job-to-be-done.** Drop the JPG on Postr and get any starting point
that's better than blank.

**Motivations.**
- "Anything I don't have to retype."
- Tolerates imperfection if she's told what's imperfect.

**Frustrations.**
- "Image isn't supported" with no path forward.
- A 60-second LLM call with no cancel button.

**Test flow (image OCR — Tier 1):**
1. Navigate to `/dashboard`. Open Import modal.
2. Drop `POSTER_DRAFT_page-0001.jpg`.
3. Tier 0 expectation: clear "Image OCR ships in the next release"
   message.
4. Tier 1 expectation:
   - Step list updates: Reading → Calling vision model… (live elapsed
     counter visible)
   - **Cancel button visible during the LLM call** (per PRD modal
     spec).
   - Confidence score surfaced in preview.
   - Low-confidence blocks (`< 0.6`) flagged with an icon in the
     editor.

---

## 4. Rishi — Senior PI returning to a `.postr` backup

**Bio.** Professor of clinical psychology, three labs, four
universities. Made a poster on Postr last spring, exported as
`.postr` to share with a co-author who never signed up. Now wants
to re-import his own backup to add new data.

**Job-to-be-done.** Drop the `.postr` file and get an exact
byte-for-byte restoration of the original poster (PRD §16 lossless
round-trip).

**Motivations.**
- Trust. The bundle export was sold as "lossless" — it had better be.
- Speed. He can't watch a progress bar for 60 seconds for a backup.

**Frustrations.**
- Hash-mismatch warnings he has to interpret on the spot.
- Re-uploaded images at lower resolution than the export.

**Test flow:**
1. Open an existing poster on `/p/{id}`.
2. Open **Export** sidebar tab. Click "📦 Save as .postr".
3. Wait for download → save to `/tmp/`.
4. Navigate to `/dashboard` → Import modal → drop the `.postr`.
5. Wait for re-upload of assets.
6. Confirm preview. Check: blocks count == original.
7. Verify **hashMatch** passed (no warning shown).
8. Open the new poster, click an image block, verify image renders at
   the same dimensions as the source.

---

## Persona diversity matrix

| Persona | Tech | File type | Input quality | Path tier |
|---|---|---|---|---|
| Maya | Comfortable | PDF text-layer | Clean | Tier 0 |
| David | Confident | PDF no-text | Hostile to extraction | Tier 0 reject → Tier 1 fallback |
| Aiko | Light | JPG | Lossy raster | Tier 1 only |
| Rishi | Light-tolerant | `.postr` | Pristine (round-trip) | Tier 0 |

---

## Notes for the auditor

- **Run the proactive visual consistency scan FIRST** on the import
  modal in each phase: pick / extracting / preview / committing.
  Look for clipped text in the warnings list, mis-aligned step icons,
  inconsistent button heights between Cancel and Confirm.
- **Run the regression checklist** on the editor after each persona
  completes their import: title/authors gap, references auto-grow,
  no canvas overflow clipping the new image blocks.
- **Auth lifecycle is OUT of scope** for this audit — covered in
  prior reviews.
