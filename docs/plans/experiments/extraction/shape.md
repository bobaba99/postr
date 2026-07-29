# The common finding shape

Both arms — **Arm A (deterministic)** and **Arm B (LLM)** — emit the *same*
shape so `score.mjs` grades them identically and blind. This file is the
contract. If you change it, change both arms and the scorer together.

## `Finding`

```jsonc
{
  "text":          "string",  // the finding, in the arm's own words (a claim sentence)
  "sourceQuote":   "string",  // a span the arm asserts is VERBATIM from text.md
  "sourceSection": "string",  // where the quote lives: "Results" | "Discussion" | "Abstract" | ...
  "rank":          1          // 1-based importance; 1 = the arm's star finding. Unique per arm.
}
```

### Field rules

- **`text`** — one sentence. The claim. Arm A's `text` is typically the scored
  sentence itself; Arm B paraphrases in the model's words. The scorer never
  requires `text` to be verbatim — only `sourceQuote` is held to that bar.
- **`sourceQuote`** — the anti-hallucination lever. The arm claims this string
  appears in `text.md`. The scorer **verifies** it with a substring check after
  whitespace normalization (collapse runs of whitespace to a single space, trim,
  lowercase). A finding whose `sourceQuote` is **not** found is a **fidelity
  failure** and is dropped before ranking is scored. Empty `sourceQuote` = drop.
- **`sourceSection`** — informational; not scored in Phase 0. Helps a human audit
  where each quote came from. Free-form but should match a heading in `text.md`.
- **`rank`** — 1-based, contiguous, unique within one arm's output. `rank: 1` is
  that arm's single **star finding**. The scorer reads `rank` (it does **not**
  rely on array order) so an arm may emit findings in any order.

## The emitted file: `findings.json`

Each arm produces `papers/<PAPER>/findings.<arm>.json` where `<arm>` is `A` or `B`.
The scorer accepts **two equivalent serializations**, so an arm may write whichever
is natural for it (`score.mjs` `normalizeArmFile()` unifies them):

1. **Wrapper object** (Arm B writes this directly):

```jsonc
{
  "paper":   "EXAMPLE",           // folder name, for the scorer's join
  "arm":     "B",                 // "A" | "B"
  "model":   "gpt-5.6-terra",     // arm B only; "deterministic-vX" for arm A
  "findings": [ /* Finding[], already gated on verbatim-quote presence */ ],
  "meta": {                       // recorded for context, NOT used to pick a winner
    "latencyMs":  0,              // wall time for the extraction call
    "costUsd":    0,              // arm B only; 0 for arm A
    "droppedForMissingQuote": 0   // how many candidates the verbatim gate removed
  }
}
```

2. **Bare `Finding[]` array** — Arm A's spike prints its findings to stdout, so
   the canonical way to persist it is a redirect that yields a bare array:

   ```bash
   node runArmA.mjs papers/EXAMPLE > papers/EXAMPLE/findings.A.json
   ```

   The scorer reads this as `arm:"A"`, `model:null`, `meta:{}` (no latency/cost
   recorded, which is fine — Arm A has neither an LLM cost nor a meaningful one).

> Whichever form an arm emits, its `findings` must already be **gated on
> verbatim-quote presence** (Arm A's quote *is* the scored sentence, so it passes
> for free; Arm B drops invented quotes and reports `droppedForMissingQuote`). The
> scorer re-checks the gate independently (defence in depth) and counts any
> residual miss as a fidelity failure against that arm.

## The gold shape: `gold.json`

Supplied by the human (Gavin), one per paper, recorded **before** seeing either
arm. See `papers/EXAMPLE/gold.json` for a concrete instance.

```jsonc
{
  "paper":       "EXAMPLE",
  "wellWritten": true,            // false for the SIMULATED badly-written variants
  "simulatedFrom": null,         // e.g. "EXAMPLE" when this is a degraded variant; else null
  "star": {
    "text":        "the single most important finding, in the human's words",
    "sourceQuote": "the supporting span, verbatim from text.md"
  },
  "top3": [                       // ranked 1..3; top3[0] SHOULD equal star (or support it)
    { "text": "...", "sourceQuote": "..." },
    { "text": "...", "sourceQuote": "..." },
    { "text": "...", "sourceQuote": "..." }
  ],
  "doNotPromote": [               // optional — findings that must NOT be ranked highly
    { "text": "a null result readers should not be sold as the headline",
      "sourceQuote": "..." }
  ]
}
```

## How the scorer matches an arm's findings to the gold

Matching is by **sourceQuote overlap**, not by `text` string equality (the arms
word `text` differently). Two spans are considered the same finding when, after
whitespace normalization + lowercasing, one `sourceQuote` **contains** the other
(either direction). This tolerates an arm quoting a slightly longer or shorter
span than the human did. See `score.mjs` `sameFinding()` for the exact rule.
