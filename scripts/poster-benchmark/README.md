# Poster Import Benchmark

Generates 10 synthetic academic posters (psychology / working-memory
research) and exports each as a 36×24" PDF — a stress test for the
import pipeline (`apps/web/src/import/pdfImport.ts`).

## Source

10 papers pulled from Consensus on 2026-04-27 (working-memory
training literature). See `papers.ts` for the full list with
abstracts, citation counts, and synthesized "results" facts.

## Layout variety

Four template families exercise different code paths in the
importer:

| Template       | Used by                                                     | Stresses                                       |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `data-heavy`   | matysiak / rodas / sala-2017 / sala-2019                    | 3 logos top-right, bar chart + scatter + table |
| `methods-heavy`| klingberg / morrison                                        | one big schematic figure + bullets             |
| `review`       | constantinidis / shipstead / bastian                        | leaf icon + people-icon (decoration filter)    |
| `minimal`      | melby-lervåg                                                | 2-column, single small figure, no logos        |

## Generate + render

```bash
# 1. Write the 10 HTML posters
tsx scripts/poster-benchmark/generate.ts

# 2. Render each to PDF (Chromium headless)
tsx scripts/poster-benchmark/renderPdf.ts
```

Output:

- `generated/<id>.html` — raw HTML, openable in any browser
- `pdf/<id>.pdf` — 36×24" PDF with selectable text layer + SVG figures

## Run through the importer

Manual today (no UI driver yet):

1. Start dev servers (`pnpm --filter @postr/web dev` + `pnpm --filter @postr/api dev`).
2. Open a poster project.
3. For each `pdf/<id>.pdf`: open the import modal → drop the file → confirm.
4. In DevTools console, filter for `[import.trace]` — log lines record:
   - bbox funnel (raw → after-filter → after-merge)
   - per-bbox extraction outcome (uploaded / blank / upload-failed / no-blob)
   - text suppression (input → after-inside-figure → after-orphan-label)
   - LLM verifier verdicts + budget reconciliation
   - split-pass decisions (LLM vs pixel-gap)

## What "passing" looks like per template

- **data-heavy**: 3 logos extract as separate `logo` blocks; the
  bar chart + scatter + table all become `image`/`table` blocks.
  Section headings preserved as `heading` blocks.
- **methods-heavy**: single schematic figure preserved; methods
  bullets ingested as a `text` block with `<ul>` content.
- **review**: leaf icon + people-icon DROPPED (decoration filter
  fires); the data table preserved as `table` block.
- **minimal**: title + authors at top; 2 text blocks + 1 figure
  block; no logos; no false positives.
