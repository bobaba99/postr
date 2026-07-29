# Relation-ablation — RESULTS

Blind-judged, 15 held-out spatial-edit phrases (0 leaks verified). References
stripped of worked examples -> tests generalization, not recall.

## Aggregate (mean over 15)

| axis | Arm A (crosswalk only) | Arm B (+ relations) |
|---|---|---|
| component-correct | 0.73 | 1.00 |
| operation-correct | 0.73 | 0.87 |
| relations-respected | 0.73 | 0.80 |
| **overall** | **0.73** | **0.89** |

## Verdict: the relations doc HELPS — keep it.

Arm B beats A by +0.16 overall; biggest gain is
component identification (0.73 -> 1.00). Without the
relations vocabulary the crosswalk alone often could not resolve WHICH component a
vague spatial phrase meant. Not redundant; build its lookup into Phase 3.
Caveat: single judge, n=15, one slide. B >= A on 14/15 phrases; direction clear,
exact magnitude has judge noise.

## Per-phrase (component|operation|relations)

| id | phrase | A | B |
|---|---|---|---|
| T01 | the callout is crowding the footer | 011 | 111 |
| T02 | push everything up a bit, there's dead space at the  | 111 | 111 |
| T03 | the body text is hanging too far left | 111 | 110 |
| T04 | center the callout box | 011 | 111 |
| T05 | the accent dot is stranded way below everything else | 100 | 111 |
| T06 | move the footnote away from the dot | 100 | 100 |
| T07 | the slide number is too close to the edge | 111 | 111 |
| T08 | scoot the title down so it's not right at the top | 111 | 111 |
| T09 | the label above the title feels detached | 111 | 111 |
| T10 | nothing lines up on the left | 111 | 111 |
| T11 | the evidence box is floating, give it an anchor | 000 | 100 |
| T12 | even out the space around the middle chunk | 001 | 111 |
| T13 | shift the section tag and heading as one unit to the | 110 | 111 |
| T14 | tuck the page number into the corner properly | 111 | 111 |
| T15 | the title runs into the box below it when it's long | 111 | 111 |

## Honest re-read after spot-check (Gavin should verify)

Reading the raw resolutions (not just the judge scores) tempers the verdict:
on several phrases where the judge scored Arm A lower, Arm A's actual output is
reasonable — it identifies the bound pairs (callout-box + its children) and picks
a sensible operation. So **the +0.16 aggregate likely OVERSTATES the gap**; the
judge penalized Arm A on borderline calls.

Fairer conclusion: **the relations doc helps, but modestly.** Its clearest,
real value is **disambiguating WHICH component** a bare spatial phrase targets
(the "dominant text" rule, the component vocabulary) — that is where Arm A
genuinely stumbles without it. The collision/alignment reasoning, both arms do
passably because a capable model already knows "a box contains its label."

Recommendation: **keep a SLIM relations doc** — the component vocabulary + the
"dominant text" disambiguation rule + the bound-pair list are the parts that
earn their place. The longer worked-example prose is less load-bearing (the model
generalizes). Fold the slim version into the Phase-3 viewer's few-shot rather
than shipping the full doc. Re-test against real Phase-3 usage with a 2nd judge.
