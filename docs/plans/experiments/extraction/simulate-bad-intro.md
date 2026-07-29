# Simulating a badly-written paper: the over-comprehensive umbrella intro

The experiment needs **≥2 deliberately poorly-structured manuscripts** to test
robustness (axis 3). We do **not** hunt for genuinely bad real papers — they vary
in too many ways at once. Instead we **degrade a clean paper along exactly one
axis**: its Introduction. Everything else (Abstract, Methods, Results, Discussion,
References) is kept **byte-for-byte identical**, so any measured degradation is
attributable to the intro alone. The clean original stays paired with the
simulated version so both are graded on the same underlying study.

## The failure pattern (Gavin, 2026-07-29)

A good intro narrows to the paper's **specific** research target and motivates the
**specific** gap the study closes. The failure is the intro that stops being about
the target and instead **sweeps the whole umbrella around it** — every adjacent,
true, on-topic-but-off-target strand of background, so the actual gap is buried.

**Worked example — an Alzheimer's *language-deficits* study.** The intro *should*
motivate a **language gap**: what is known and not known about language decline in
Alzheimer's, ending on the precise unknown this study addresses. The **bad**
version instead spends:

- paragraph 1 on **behavioural deficits** (agitation, wandering, sleep disruption),
- paragraph 2 on **biological deficits** (amyloid, tau, hippocampal atrophy),
- paragraph 3 on **caregiving costs** (burden, institutionalisation, economics),

— all true, all real Alzheimer's background, **none of it the language gap.** The
reader reaches Methods without ever being told what specific question is being
asked. The test: **does each arm still surface the real finding and the real gap
when the intro points everywhere at once?**

## Procedure

Do this per source paper you want a bad twin of.

1. **Pick a clean, well-written source** already in `papers/<SRC>/` (with its
   `gold.json`). It must have a focused intro that names its specific gap.

2. **Create the twin folder** `papers/<SRC>-BAD/`. Copy `text.md` into it
   unchanged for now.

3. **Rewrite ONLY the Introduction** of the twin's `text.md`:
   - **Delete** the sentence(s) that name the specific gap and the "we addressed
     this" turn. That focused core is exactly what must NOT survive in the bad
     version.
   - **Add two-to-three paragraphs of umbrella background** — adjacent, true,
     on-topic strands that are *not* the paper's actual target (mirror the
     behavioural → biological → caregiving sweep: pick 3 real neighbours of the
     paper's topic and expand each into a paragraph).
   - **Bury, do not delete entirely:** if a hint of the real gap remains, keep it
     to a single hedged clause somewhere in the middle, not a clean statement.
     The point is a gap that is *findable but not signposted*, not one that is
     absent.
   - Keep the intro's length plausible (a real over-broad intro is *longer*, not
     shorter). Do not introduce new numbers or new named entities that could leak
     into Results.

4. **Do NOT touch** the Abstract, Methods, Results, Discussion, or References.
   Diff the twin against the source and confirm the **only** changed block is the
   Introduction:

   ```bash
   diff papers/<SRC>/text.md papers/<SRC>-BAD/text.md
   ```

   Every hunk in the diff must fall inside the `## Introduction` section.

5. **Write the twin's `gold.json`:**
   - `"wellWritten": false`
   - `"simulatedFrom": "<SRC>"`
   - **Keep the same `star`, `top3`, and `doNotPromote` as the source** — the
     underlying study is identical, so the *correct* answer is identical. The bad
     intro must not change what the right findings are; it only makes them harder
     to reach. Every `sourceQuote` still lives in the (untouched) Results/Discussion,
     so it stays verbatim. Confirm:

     ```bash
     # each gold sourceQuote must still be a substring of the twin text
     node -e '...'   # or just grep -F each quote against papers/<SRC>-BAD/text.md
     ```

6. **Run both arms** on the twin and let `score.mjs` place it in the
   `badly-written` split automatically (it reads `wellWritten` from `gold.json`).

## What good vs bad output looks like

- **Robust arm:** still returns the real star finding at rank 1 and the real gap,
  ignoring the umbrella paragraphs. star-hit and top-3 overlap barely move between
  the clean and bad twin.
- **Fragile arm:** gets pulled toward the loudest umbrella strand — promotes a
  background topic (e.g. "caregiving burden") over the actual finding, or invents
  a gap statement the intro no longer contains (a fidelity failure). star-hit
  drops on the bad twin.

The **delta between the clean source and its bad twin**, per arm, is the
robustness signal. Report it from the two rows in `RESULTS.md` (the source in the
well-written split, the twin in the badly-written split).

## Keep the pairing

Never ship a `-BAD` twin without its clean source in the set. The comparison is
only meaningful as a pair on the same study. Both are committed fixtures; neither
contains `Date.now()`/`Math.random()`.
