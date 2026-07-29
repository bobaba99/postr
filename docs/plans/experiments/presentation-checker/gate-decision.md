# Phase 0 decision gate (spec §7.1 / §7.5)

Date: <…> · Rubric: rubric.v1 · Corpus: frozen 20 (`frozenAt` in manifest)

## Round-1 agreement (from analysis/report.md)

| lens | number |
|---|---|
| kappa — narrative / design / content | <…> / <…> / <…> |
| spearman — narrative / design / content | <…> / <…> / <…> |
| checklist P / R / F1 | <…> / <…> / <…> |
| **seeded ground-truth caught** | **<…>%** |

## Disagreement triage (§7.5)

- Rubric gaps found (→ rubric edits made / planned): <…>
- Genuine judgment calls (logged, no fix): <…>
- Systematic comment-level failure modes: <… or "none">

## Architecture go/no-go (the reason Phase 0 exists)

- [ ] Output schema is sufficient (no field the comments keep surfacing is missing)
- [ ] Single-call two-stage pass grounds the attention prediction adequately (no move to approach #2 needed yet)
- [ ] Page-image input resolution is adequate (poster text legible to the model)
- [ ] No ingest-chunking change required

Any unchecked box → record the architecture change decided here BEFORE
Milestone 2; update the spec (it is a living document) and this plan.

## Proposed ship criterion for the pre-ship gate (§7.5; Gavin sets this)

- Seeded ground-truth recall ≥ <X>%
- Score weighted-kappa ≥ <Y> on all three dimensions
- No systematic comment-level failure mode

## Early token costs (from results/costs.jsonl) → pricing inputs

- tokens/review p50 / p95: <…> / <…>
- cost/review p50 / p95: $<…> / $<…>
- proposed pack: <N> credits at $<price> · proposed weekly add-on quota: <N>/week
  (final prices set in Task 28 from day-one instrumentation; these are the first anchors)

## Decision

- [ ] **GO** — proceed to Milestone 2 as planned
- [ ] **GO WITH CHANGES** — <record changes; update spec + plan>
- [ ] **NO-GO** — <record why; what pivot>

Signed: Gavin · <date>
