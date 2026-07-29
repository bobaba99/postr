# Extraction experiment harness — deterministic (Arm A) vs LLM (Arm B)

This is the runnable harness for the experiment specified in
[`../extraction-deterministic-vs-llm.md`](../extraction-deterministic-vs-llm.md).
It answers spec §3.1 of [`../../2026-07-29-paper-to-slides.md`](../../2026-07-29-paper-to-slides.md):
**which extraction approach do we build for the talk's star-finding cards?**

> **Status:** scaffold. Arm B is stubbed with a fake LLM response so the pipeline
> runs end-to-end today. **Arm A (deterministic spike) is a SEPARATE agent's task**
> and is not in this directory yet. The real `gpt-5.6-terra` forced-tool call plugs
> into the clearly-marked seam in `runArmB.mjs`. Do not point it at prod.

Everything here is plain Node ESM (`.mjs`), **outside the app bundle** — it imports
no app code, ships no secrets, and never runs in a browser or server request path.

---

## Layout

```
extraction/
  README.md                  ← you are here
  shape.md                   ← the common { text, sourceQuote, sourceSection, rank } contract
  runArmB.mjs                ← LLM arm (STUBBED); emits papers/<P>/findings.B.json
  score.mjs                  ← reads gold + both arms; writes RESULTS.json + RESULTS.md
  simulate-bad-intro.md      ← procedure to degrade a clean intro into umbrella background
  papers/
    EXAMPLE/                 ← one tiny illustrative paper (bogus placeholder study)
      text.md                ← full paper text
      gold.json              ← the human ranking (see shape.md)
      findings.A.json        ← (written by Arm A — the other agent)
      findings.B.json        ← (written by runArmB.mjs)
```

Add real papers as `papers/<SLUG>/{text.md,gold.json}`. Simulated badly-written
variants go in their own folder (e.g. `papers/AD-LANG-BAD/`) with `wellWritten:false`
and `simulatedFrom:"AD-LANG"` in `gold.json` — see `simulate-bad-intro.md`.

---

## Running

All commands run from this directory (`docs/plans/experiments/extraction/`).

### 1. Run Arm B (LLM) on one paper — stubbed, no network

```bash
node runArmB.mjs EXAMPLE
```

Writes `papers/EXAMPLE/findings.B.json`. With no `EXTRACTION_LLM_LIVE` env flag
set it uses the deterministic fake response, so the harness is runnable offline.
The verbatim-quote presence gate runs regardless — findings whose `sourceQuote`
is not a substring of `text.md` (after whitespace normalization) are dropped, and
the drop count is recorded in `meta.droppedForMissingQuote`.

Run every paper:

```bash
for p in papers/*/; do node runArmB.mjs "$(basename "$p")"; done
```

### 2. Run Arm A (deterministic) — separate agent

Arm A ships `runArmA.mjs` from the deterministic-spike task. It reads the same
`text.md` and writes `papers/<P>/findings.A.json` in the identical shape
(`shape.md`). It is intentionally NOT in this scaffold.

### 3. Score both arms against the gold set

```bash
node score.mjs
```

Reads, per paper: `gold.json`, `findings.A.json`, `findings.B.json` (missing arm
files are reported, not fatal). Computes the three axes from the spec and writes:

- **`RESULTS.json`** — machine-readable, per-paper + aggregate, stamped with the
  run time (stamped at run, never committed into a fixture).
- **`RESULTS.md`** — a short human table: per-paper rows + an aggregate block,
  split **well-written vs badly-written**.

Neither `RESULTS.json` nor `RESULTS.md` is a committed fixture; they are
regenerated on every run. `papers/**/text.md`, `gold.json`, and the simulated
variants ARE the committed fixtures and must contain no `Date.now()` /
`Math.random()` — they are frozen inputs.

---

## What gets measured (from the experiment doc)

1. **Ranking agreement** with the human gold set:
   - **star-hit** (binary): did the arm's `rank:1` match the human star finding?
   - **top-3 overlap** (0..1): `|arm-top-3 ∩ human-top-3| / 3`.
2. **Fidelity** — the automatable half: does every `sourceQuote` appear verbatim
   in `text.md`? Any miss is a **fidelity failure** (a gate, not a score — an arm
   that invents on a clean paper is disqualified for that paper). The "does the
   quote actually *support* the claim?" half is a human judgement, recorded
   separately by Gavin — the scorer leaves a column for it but does not fill it.
3. **Robustness** — every axis is reported split by well-written vs badly-written,
   so we see which arm degrades less on the simulated bad-intro papers.

**Recorded for context, never a decider:** cost ($/paper, Arm B) and latency
(ms/paper). Surfaced so the quality gain is visible against its price.

---

## Decision rule (copied from the experiment doc for convenience)

Pick the arm that, on the gold set: (1) has **zero fidelity failures on
well-written papers** (hard gate), (2) wins or ties on **star-hit + top-3
overlap** aggregate, and (3) degrades **less** on the badly-written subset. On a
quality tie, **prefer Arm A** (deterministic) — it keeps the live poster path
free of LLM cost, latency, and hallucination surface. Record the decision and the
numbers back into spec §3.1.

---

## The Arm B live seam (do this only when running the real bake-off)

`runArmB.mjs` isolates the real call behind `EXTRACTION_LLM_LIVE=1` and reads the
key from `OPENAI_API_KEY` (never hard-coded, never committed). The forced-tool-use
request mirrors the shipped condense provider
(`apps/api/src/narrative/condense.ts`): `model: gpt-5.6-terra`, a single
`extract_findings` function tool, `tool_choice` forcing that function. See the
`callRealLlm` seam and its inline TODO. Until you set the flag, the stub runs and
nothing touches the network.
