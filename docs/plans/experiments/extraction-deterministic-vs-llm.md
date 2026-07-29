# Experiment — Deterministic vs LLM findings extraction

**Status:** DESIGNED, NOT RUN. Runs **before** any extraction implementation.
**Owner:** Gavin. Designed 2026-07-29.
**Decides:** spec `2026-07-29-paper-to-slides.md` §3.1 — which extraction approach
we build for the talk's star-finding cards.

> **Why this runs first.** The talk needs *ranked findings, each with a verbatim
> quote*. We do NOT yet know whether an upgraded deterministic engine or an LLM
> does this better. Building either before measuring would pre-judge the answer
> and risk adding cost/latency/hallucination to the live `/paper-to-poster` for
> no proven gain. This experiment produces the evidence; the winner gets built.

---

## The two arms

- **Arm A — Deterministic (upgraded `coreRelevance.ts`).** Extend the existing
  scoring engine with stronger signals: **semantic relatedness** (embedding
  cosine between a candidate sentence and the core), **semantic/word-content
  frequency** (how often the finding's terms recur across Results/Discussion),
  and **informational density** (numbers, effect sizes, and named entities per
  token). Output: ranked findings, each paired with the verbatim sentence that
  scored it (the quote falls out for free — it *is* the scored sentence).
- **Arm B — LLM extraction.** A forced-tool-use call (`gpt-5.6-terra`, or the
  bake-off winner) that returns ranked findings, each with a `sourceQuote` the
  model copies from the text. A verbatim-presence check gates the quote.

Both arms emit the SAME shape so they are scored identically:
`{ text, sourceQuote, sourceSection, rank }[]`.

---

## What we measure (three axes — cost/latency is recorded but NOT a decider)

1. **Ranking agreement with a human gold set.** For each paper, Gavin hand-ranks
   the **single star finding** and the **top-3** findings. Score each arm by:
   - **star-hit:** did the arm's rank-1 match the human star finding? (binary)
   - **top-3 overlap:** |arm-top-3 ∩ human-top-3| / 3 (0…1)
   - **rank correlation:** Spearman ρ over the findings both identified.
2. **Fidelity — no invented or misattributed findings.** For every finding an arm
   emits: (a) does its `sourceQuote` appear **verbatim** in the paper text?
   (automatable — substring match after whitespace normalization); (b) does the
   quote actually **support** the finding text? (Gavin judges, binary). Any
   invented finding (quote not in paper) or misattribution (quote present but
   doesn't support the claim) is a **fidelity failure**. Report failures per arm;
   **fidelity is a gate, not a score** — an arm that invents is disqualified for
   that paper regardless of ranking quality.
3. **Robustness on badly-written papers.** The paper set includes **≥2
   deliberately poorly-structured manuscripts** (buried findings, no clear
   results section, hedged prose). Report each axis split by
   well-written vs badly-written so we see which arm degrades less — this is the
   original reason LLM was considered.

Recorded for context, not used to pick the winner: **cost** (LLM $/paper) and
**latency** (ms/paper). Surfaced so the quality gain is visible against its price.

---

## Inputs (the two things only Gavin can supply)

### The fixture set (N = 12: 6 social science + 6 biology) — Consensus-generated

Decided 2026-07-29. Rather than collect individual PDFs, **generate each fixture
from a research question via Consensus**: a core research question →
Consensus's papers-grounded synthesis → that synthesis IS the fixture text (a
findings-bearing body of prose with a known main result). Because *we chose* the
core question, the expected star finding is largely determined — which is what
makes the gold set draftable and the experiment reproducible.

- **9 clean fixtures** — one core research question each, 6 across social science
  + 3 across biology (and vice-versa to reach 6/6 with the degraded ones). The
  synthesis prose is the fixture `text.md`.
- **3 degraded fixtures (bad-intro simulation)** — take a clean fixture's core
  question and **prepend adjacent, off-target "umbrella" background** generated
  from 2–3 *adjacent* research questions (the noise), THEN keep the **real study
  objective + hypothesis at the end** (the original core question). This mimics
  Gavin's umbrella-background failure (AD language-deficits: behavioural +
  biological + caregiving noise → then the real language gap). The test: does each
  arm push past the intro noise to the real objective at the end? The clean and
  degraded versions of the same core question are paired for degradation measurement.

**Gold set:** drafted by the orchestrator from each core research question +
Consensus synthesis (star finding + top-3), then **reviewed and approved by Gavin
before scoring**. Blind ordering still applies when grading arm outputs.

Consensus pacing: batch ≤3 searches, wait on any 429, per the server's own rule.
- **≥2 badly-written — SIMULATED** from a well-written paper by degrading its
  introduction into an **over-comprehensive umbrella background**. The canonical
  failure pattern (Gavin, 2026-07-29): the intro stops being about the specific
  research target and instead sweeps the whole umbrella around it. Worked example
  — an Alzheimer's **language-deficits** study whose intro should motivate a
  language gap, but a bad version instead spends paragraphs on **behavioural
  deficits**, then **biological deficits**, then **caregiving costs** — all true,
  all background, none of it the actual gap. To simulate: take a clean paper, keep
  Results/Methods intact, and **rewrite the Introduction** to bury the specific
  gap under two-to-three paragraphs of adjacent-but-off-target umbrella
  background. The test: does each arm still surface the *real* finding and the
  *real* gap when the intro points everywhere at once? Keep the original clean
  version paired with each simulated one so degradation is measured on the same
  underlying study.

### The human gold set

For each paper, Gavin records, before seeing either arm's output:
- the **star finding** (one sentence, in his words + the supporting quote),
- the **top-3 findings** ranked,
- (optional) findings that must NOT be promoted (e.g. a null result).

Blind ordering: grade arm outputs without knowing which arm produced which, to
avoid bias toward the LLM.

---

## Harness (built as part of the experiment, not the product)

Location: `docs/plans/experiments/extraction/` (scripts + fixtures, kept out of
the app). Shape:
- `papers/` — one folder per paper: `text.md` (full text), `gold.json` (the human
  ranking).
- `runArmA.mjs` / `runArmB.mjs` — each reads a paper's `text.md`, emits
  `findings.json` in the common shape. Arm A imports the (experimental) upgraded
  scorer; Arm B calls the LLM endpoint behind a flag so it never touches prod.
- `score.mjs` — reads gold + both arms, computes the three axes, writes
  `RESULTS.json` + a short `RESULTS.md` table (per-paper and aggregate,
  split well/badly-written).
- No `Date.now()`/`Math.random()` in committed fixtures; stamp results at run time.

Arm A is allowed to be a **throwaway spike** — the point is to measure whether the
deterministic upgrade *can* compete, not to ship that exact code. If Arm A wins,
we productionize the winning signals into `coreRelevance.ts` properly (with the
full test suite). If Arm B wins, we build the LLM extraction layer from the spec.

---

## Decision rule

Pick the arm that, on the gold set:
1. has **zero fidelity failures** on well-written papers (a hard gate — an arm
   that invents on clean input is out), AND
2. wins or ties on **star-hit + top-3 overlap** aggregate, AND
3. degrades **less** on the badly-written subset.

If they tie on quality, **prefer Arm A** (deterministic) — it keeps the live
poster path free of LLM cost, latency, and hallucination surface, consistent with
the pipeline's deterministic-first thesis. Record the decision and the numbers
back into spec §3.1.
