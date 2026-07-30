# Frozen validation corpus (spec §7.2)

20 posters/decks, frozen once built. **Frozen means frozen:** after
`frozenAt` is set in `manifest.json`, items are never edited — every
prompt/rubric iteration measures against the same 20 so numbers are
comparable across rounds.

## Building it (manual, ~half a day)

1. **Pick 20 papers across fields** (bio, medicine, CS, physics, social
   science, …) via the Consensus / paper-search MCP — varied fields keep
   the critique field-agnostic.
2. **Generate each into a poster** with Postr (`/paper-to-poster` or the
   editor). This also dogfoods the generation pipeline.
3. **Seed the failure modes.** Pick ≥ 4 posters to keep **strong**
   (`quality: "strong"`, `seededIssue: null`). For each remaining poster,
   plant exactly ONE known issue from this table (cover ≥ 7 distinct
   categories across the corpus):

   | seededIssue | How to plant it |
   |---|---|
   | `buried-key-result` | Move the main-result figure/statement to the bottom-right; lead with background. |
   | `over-emphasis` | Bold + highlight + color 8–10 separate phrases across sections. |
   | `redundant-text` | Add a paragraph that narrates, sentence by sentence, what the key plot already shows. |
   | `competing-elements` | Include two equally large tables/figures both presenting primary results (forced-prioritization case). |
   | `wall-of-text` | Rewrite methods + results as dense 150–200-word paragraphs, no figures. |
   | `decorative-hijack` | Add a large decorative stock photo / lab group photo unrelated to the key result, top-center. |
   | `no-takeaway` | Delete the conclusion/take-home; end on methods details. |
   | `figure-text-disconnect` | Keep figures but remove every in-text reference/caption tie-in. |
   | `jargon-mismatch` | Load the intro with field-specific acronyms, unexplained. |
   | `claims-evidence-gap` | State 2–3 strong claims with no supporting data anywhere. |
   | `section-imbalance` | Inflate background to half the poster; squeeze results into a corner. |
   | `readability-at-distance` | Shrink body/figure text well below poster legibility. |

4. **Export each poster** as PPTX (dogfoods the PPTX ingest path — keep the
   file as `corpus/<id>/deck.pptx`) and as PDF.
5. **Render page images** from the PDF at ≥ 150 DPI, e.g.
   `pdftoppm -r 150 -png poster.pdf corpus/<id>/page` → `page-1.png`
   (multi-page decks: one PNG per slide). Posters are single-page; decks
   exercise the multi-page path.
6. **Fill `manifest.json`** (one entry per poster, relative paths), set
   `frozenAt` to today's date.
7. **Validate:** `npx tsx docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts` → `corpus OK`.

## Rules

- Never tune a poster after freezing — not even "obvious" fixes.
- The checker prototype must never see `seededIssue`; it is ground truth
  for scoring only.
