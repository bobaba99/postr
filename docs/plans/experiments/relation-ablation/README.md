# Experiment — Does the component-relations doc help? (ablation)

**Status:** DESIGNED + RUN 2026-07-29.
**Question (Gavin):** does the Arm-P component-relations lookup measurably improve
spatial-edit interpretation accuracy, or is it redundant given the crosswalk +
few-shot? **Do not leak train/test data.**

---

## Design (ablation)

Same held-out edit requests, same LLM, same slide — resolved two ways:

- **Arm A (control):** the model gets the **crosswalk reference only** (quality
  word → operation families) and must resolve each spatial edit.
- **Arm B (treatment):** crosswalk reference **+ the component-relations
  reference** (zones, component vocabulary, bound pairs, stack order, alignment
  groups).

If B beats A, the relations doc adds real value. If they tie, it is redundant.

## Anti-leakage discipline (the crux)

1. **Held-out test set** — 15 spatial/relational edit phrases (`test_set.json`)
   that appear in NEITHER doc. Grounded in web-confirmed real edit vocabulary
   (reposition, overlap, crowd, spacing, distribute, edge, alignment), phrased
   into novel scenarios. **Verified:** 0 verbatim leaks, 0 near-duplicate
   scenarios (two initial near-dups — a heading-overlap and a "whole thing" case
   that the docs walk through — were replaced).
2. **Reference materials are STRIPPED of worked examples.** Both arms see the
   docs' *tables and rules*, never the docs' worked answers — the entire "Worked
   examples" section and every quoted illustration phrase are redacted
   (`crosswalk_ref.md`, `relations_ref.md`). This tests **generalization**, not
   recall of a written-down answer. Verified: 0 example phrases remain in the
   references.
3. **Blind judge** — a separate LLM scores each resolution against the edit's
   intent (right component(s) identified? right operation? relations/collisions
   respected? ambiguity flagged when it should be?), **without being told which
   arm produced it** and without seeing the reference docs (so it judges the
   resolution on merit, not doc-adherence). Gavin spot-checks.

## Scoring (per phrase, per arm)

- **component-correct** (0/1): did it identify the right component(s)?
- **operation-correct** (0/1): did it choose the right spatial operation?
- **relations-respected** (0/1): did it avoid collisions / respect bound pairs +
  alignment groups (or correctly flag ambiguity)?
- Aggregate: mean of the three, per arm, over 15 phrases.

## Decision

- **B ≥ A by a clear margin on relations-respected** (the axis the relations doc
  specifically targets) → the doc helps; keep it, build the lookup into Phase 3.
- **A ≈ B across all three** → redundant; the crosswalk + few-shot already
  generalizes; drop the relations doc (or fold its few rules into the crosswalk).
- Record the numbers + Gavin's spot-check verdict here.

## Files

- `test_set.json` — the 15 held-out phrases + expected component/op (for the
  judge's reference, NOT shown to the resolving arms).
- `crosswalk_ref.md`, `relations_ref.md` — example-stripped references.
- `RESULTS.md` — written by the run.
