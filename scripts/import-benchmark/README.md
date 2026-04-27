# Postr import benchmark

Run vision models against the four test posters in
`docs/test_posters/` and emit a markdown report comparing text
accuracy, bbox count fidelity, latency, and cost.

## Run

```bash
# From repo root.
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... OLLAMA_API_KEY=... \
  pnpm bench:import
```

Each model can be skipped by leaving its API key unset — the runner
just logs `skipped: missing API key` for that model.

## Output

`docs/plans/2026-04-XX-import-benchmark-results.md` — table per
poster + summary, plus the recommended production model.

## Models

- **claude** — `claude-sonnet-4-5` via Anthropic Messages API,
  tool-use structured output.
- **openai** — `gpt-4o-mini` (cheap-and-fast) plus `gpt-4o` if
  budget allows. Structured output via `response_format`.
- **ollama** — `qwen2.5vl:72b` via Ollama Cloud
  (`https://ollama.com/api/chat`). Structured output via
  `format: 'json'`.

## Ground truth

For the two text-layer PDFs (`EW_INS.pdf`, `VocUM_poster.pdf`)
ground truth is the concatenation of `pdftotext` output. For the
flattened PDF (`PresenterGeng.pdf`) and the JPG, ground truth is a
hand-transcribed `.text.json` in `fixtures/`.

## Metrics

1. **Text accuracy** — normalized Levenshtein distance vs ground
   truth.
2. **Block count fidelity** — `extracted / expected` blocks.
3. **Latency p50/p95** — 3 runs per poster per model.
4. **`$/poster`** — token counts × public price sheet.
5. **Composite score** — `0.5 × text + 0.3 × blockFidelity +
   0.2 × (1 − costNorm)`.
