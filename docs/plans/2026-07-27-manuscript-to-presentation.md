# Manuscript → Presentation

**Status:** planned, unbuilt. Space booked, page marked upcoming, waitlist collecting.
**Owner decisions captured 2026-07-27.** Where this doc says "decided", do not relitigate.

---

## 0.1 The narrative standard — evidence base

Gavin's shape: **introduce the problem → create the tension → present the study on a silver
platter.** Literature searched via Consensus 2026-07-27 to check that against evidence rather
than taste. It holds, with one important caveat recorded at the end.

**Narrative writing is associated with more citations.** Across 732 climate-science abstracts,
more narrative abstracts were cited more often — though the effect is entangled with journal
identity, so this is correlational, not causal
([Hillier et al. 2016](https://consensus.app/papers/details/835990c11a6a5582a9292a5b2133e34d/?utm_source=claude_desktop)).
A large NLP study of semantic "narrative paths" links discourse shape to success including
paper citations
([Toubia et al. 2021, PNAS](https://consensus.app/papers/details/8987451d5ec05406af9363aae0010633/?utm_source=claude_desktop)).

**The ABT structure is the compact form of Gavin's shape.** Randy Olson's **AND / BUT /
THEREFORE** — established facts, *but* the gap, *therefore* the finding — is explicitly
recommended for narrative research writing, and contrasted with two named failure modes: **AAA**
("and, and, and" — facts with no link, which is exactly the section-list failure) and **DHY**
("despite, however, yet" — unresolved tension, no landing)
([Boyer et al. 2023, Water Research X](https://consensus.app/papers/details/02b8162709305fcc9fd8a99c6f83f99d/?utm_source=claude_desktop)).
ABT maps onto the four beats already in §2: STAKES+GAP = AND/BUT, RESOLUTION+SO WHAT = THEREFORE.

**Tension is the mechanism, and it must resolve.** Reflexive analysis of ~40,000 traditional and
~20,000 non-traditional narratives found a consistent three-process structure — **staging, plot
progression, and cognitive tension**
([Boyd et al. 2020, Science Advances](https://consensus.app/papers/details/223e154ac01b5bd2965644e7fc82b90e/?utm_source=claude_desktop)).
Editorial guidance frames the same idea for research: conflict is what "drives the plot", created
by naming the gap the literature overlooked, and a paper is interesting when it produces the
"Aha!" of a resolved paradox — Davis's point that a great theory is great because it is
*interesting*, not merely true
([Wang 2025](https://consensus.app/papers/details/9751ac0186b95d70920e1a7fae6b48ef/?utm_source=claude_desktop)).

**Write backwards.** Start from the conclusion, then Results → Methods → Discussion →
Introduction → Abstract → Title
([Montagnes et al. 2021](https://consensus.app/papers/details/ea695d657de35120af29174361149dc8/?utm_source=claude_desktop)).
This is a direct instruction for the pipeline: the deterministic mapper should establish the
takeaway first (which Q1 already captures) and build the arc back from it, rather than walking
the manuscript front-to-back.

**For talks specifically**, the same complaint recurs across the conference-presentation
literature: talks are "crowded with methods and data … lacking in narrative arc", and the fix is
a journey of discovery ending in a memorable takeaway
([Langin 2017, The Condor](https://consensus.app/papers/details/009c76cd1e0c5e66b5d8a19cca765614/?utm_source=claude_desktop)).
A systematic review of 91 expert-opinion articles found the five most frequent recommendations
were: **keep slides simple, adjust to the audience, rehearse, do not read from slides, make eye
contact** — with near-total absence of contradicting advice
([Blome et al. 2017](https://consensus.app/papers/details/083158535adb55cd885a2f278cb7816d/?utm_source=claude_desktop)).
Three of those five are properties the generator controls (simplicity, audience fit, and notes
that are spoken rather than read); two are delivery, which belongs in guidance to the user, not
in the artifact.

**Cognitive-load constraints that bound the design**: dual-channel theory, coherence, signalling
and segmenting; the visual channel dominates the auditory, so wordy slides *compete with the
speaker and win*
([Ameen 2026](https://consensus.app/papers/details/ae8cb8331fa85cb497d9e9f1c07c1899/?utm_source=claude_desktop);
[Gelernter 2017](https://consensus.app/papers/details/5229651fec1e54ee8867455efcd8b36b/?utm_source=claude_desktop)).
That is the empirical justification for the bullet-dump ban and for speaker notes carrying what
the slide does not say. Notably, one of these papers observes that **AI-generated slides are
"often overly complex, with redundant text, intricate visuals"** — the exact failure this
product must not ship.

**⚠ The caveat that complicates the story, recorded rather than buried.** Boyd et al. found **no
evidence that adherence to normative story structure predicted a story's popularity**, and that
fact-driven texts showed structures *different* from story-based narratives. So "more narrative"
is not automatically "better received", and a research talk is a fact-driven text. The defensible
claim is narrower than the marketing temptation: a clear arc aids **comprehension and retention**,
which is what the cognitive-load literature supports directly. It should not be sold as a
citation- or career-boosting guarantee. This constrains the product copy as much as the prompt.

---

## 0. What this is

The deck sibling of `/paper-to-poster`. Same ingest, same scripted interviewer, same
deterministic rubric — a different output shape: an ordered set of slides instead of one
canvas. A **title slide is always first** and **references are always last**; everything
between is derived. Slide count comes from the **1 minute per slide** rule, which is
already the Q6 question in the poster pipeline.

**Paid feature.** The free tier ends at bare-bones black-and-white text output; the design
pass is what people pay for. Pricing decided 2026-07-27, see §5.1. Details in §6.

---

## 1. Slug and SEO — measured, not guessed

Pulled via OpenSEO `get_keyword_metrics`, US market, 2026-07-27. **This is measured data.**

| Keyword | Vol/mo | KD | Intent |
|---|---|---|---|
| pdf to powerpoint | 18,100 | 33 | informational |
| ai presentation maker | 12,100 | 52 | commercial |
| presentation generator | 4,400 | 52 | informational |
| presentation maker | 4,400 | 44 | transactional |
| slide generator | 1,300 | 52 | transactional |
| **how many slides for 10 minute presentation** | **480** | **0** | informational |
| scientific presentation template | 320 | 1 | informational |
| journal club presentation | 260 | 0 | informational |
| thesis defense presentation | 260 | 4 | informational |
| pdf to presentation | 110 | 19 | informational |
| academic presentation template | 90 | 18 | informational |
| lab meeting presentation | 30 | 0 | informational |
| paper to slides | 20 | — | informational |
| paper to presentation | 10 | 0 | informational |
| convert paper to presentation | 10 | — | transactional |
| paper to powerpoint | 10 | 48 | informational |

No measurable volume: `research talk slides`, `conference talk slides`, `paper to deck`,
`manuscript to presentation`, `academic slides generator`, `research presentation maker`,
`conference presentation maker`, `academic presentation maker`, `research paper to
presentation`, `research paper to powerpoint`, `turn paper into presentation`,
`convert paper to slides`.

### The decision

**`/paper-to-poster` REMAINS the canonical standalone. Presentation does NOT take over.**

The owner asked to promote presentation to standalone *if the SEO yielded better outcomes*.
It does not. Every high-volume presentation term is a head term at KD 33–52, owned by Adobe,
Smallpdf and iLovePDF (`pdf to powerpoint`) or by Gamma, Tome and Beautiful.ai (`ai
presentation maker`). Those are 18–36-month targets for a zero-authority domain, exactly the
"not year one" category §4 of the SEO plan warns about. Every *winnable* presentation term is
tiny — `paper to presentation` is 10/mo. Against that, `/paper-to-poster` already holds
**140/mo at KD 0**.

**Slug: `/paper-to-slides`.** Chosen over `/paper-to-presentation` on brevity and because the
measured terms split evenly between "slides" and "presentation" phrasing at this volume, so
neither wins on demand. `/paper-to-present` (already reserved and 308-ing to the poster page)
re-points here **when this ships**, since it is the phrasing the owner reaches for naturally.
`/paper-to-presentation` becomes a third alias. All aliases 308; one indexed URL only.

### The real SEO prize is not the tool page

`how many slides for 10 minute presentation` — **480/mo, KD 0, $12.51 CPC** — is the single
best keyword surfaced in any pull this project has run, and **the product computes the answer
directly**. It is the "computed value, not advice" shape §4 of the SEO plan identifies as the
only winnable category for this domain.

Build **`/slides-for-a-talk`** (working slug): a free, no-auth calculator. Enter a duration,
get a slide count and a per-section breakdown derived from the same rubric the pipeline uses,
with the 1 min/slide convention stated and its caveats named (title and reference slides are
not spoken-to-time; a data-heavy slide runs long; question time is usually excluded). Then a
single honest link to the paid generator. This mirrors `/tools/figure-readability` in Phase 4
of the SEO plan: justified by link acquisition and conversion, not by tool traffic.

Secondary pages, all KD ≤ 4, all with genuine per-page content and none of them thin:
`journal club presentation` (260), `thesis defense presentation` (260),
`scientific presentation template` (320), `lab meeting presentation` (30, $20.68 CPC).
Each is a real format with different conventions — a journal club walks someone else's paper,
a defense front-loads contribution, a lab meeting is work-in-progress. Do not generate these
from a template; if a page cannot say something specific about its format, do not publish it.

**Explicitly not targeting:** `pdf to powerpoint`, `ai presentation maker`,
`presentation generator`, `presentation maker`, `slide generator`. Head terms, wrong audience,
and the first is a file-conversion intent Postr does not serve.

---

## 2. Pipeline — shared with the poster, by design

Reuse, do not fork:

| Stage | Module | Change needed |
|---|---|---|
| Ingest (paste / .docx) | `manuscript/docxIngest.ts`, `parseManuscriptText.ts` | none |
| Document model | `manuscript/buildDocumentModel.ts` | none |
| Section mapping | `manuscript/mapper.ts`, `sectionLexicon.ts` | none |
| Interviewer | `manuscript/interviewer.ts` | **shared question set**, output-type branch |
| Budgets | `manuscript/rubric.ts` | slide budgets alongside panel budgets |
| Condense | `api/narrative/*` | same call, slide-shaped roles |
| Build | **new** `manuscript/buildDeck.ts` | slide arc + title/reference slides |
| Emit | `export/pptx/*` | multi-slide (exporter is single-slide today) |

**Same questions as the poster** (owner decision). Q6 — slide count or duration — finally has
a consumer here; on the poster path it is captured but only weakly consumed, which is stated
honestly in that pipeline's open questions.

### Slide arc

Deterministic, from the rubric. No LLM decides structure — same rule as the poster.

1. **Title** — always. Title, authors, affiliations, venue, date. Free.
2. Hook / motivation
3. Question / aim
4. Methods (1–2, scaled by budget)
5. Results (the bulk; one slide per ranked finding, figures preferred over tables per Q2)
6. Takeaway
7. **References** — always last. Formatted from the same citation layer as the poster.

Slides 2–6 flex with the count from Q6. Title and references are **excluded from the
speaking-time budget** and stated as such in the UI — a 10-minute talk is ~10 content slides
plus these two, not 8 content slides.

---

## 3. Phase 1 — bare bones, black and white

Owner decision: **ship text-only first, no layout worry.** Black text, white background, one
readable serif or sans, generous margins, no colour, no imagery, no theme. It must be
*correct* and *complete* before it is pretty.

Deliverables: `buildDeck.ts`, multi-slide PPTX emission, title and reference slides, the
Q6 → slide-count derivation wired to real budgets, and a PDF path via the existing print flow.

Acceptance: a 12-page manuscript in, a `.pptx` out that opens in PowerPoint, Keynote, Google
Slides and LibreOffice, with every slide inside its word budget, correct citation formatting,
and no invented content. **This phase involves no design model at all.**

---

## 4. Phase 2 — the design pass (this is the paid part)

Owner's sketch: invoke a design model — Claude Design (API or MCP), Stitch, or GPT image —
to beautify, then feed the result to a model that writes the PPTX. **Show the user several
varieties first, through a chat interface.**

### What is unresolved and must be settled before building

The owner's own framing was tentative ("not sure if this is possible with API then MCP calls",
"maybe gpt does it reasonably well too"). Recording the open questions honestly rather than
pretending a design exists:

1. **Image-based or structure-based?** Generating slide *images* looks impressive and is
   trivially varied, but the output is not editable — which contradicts the whole point of the
   editable-exports work, where every block stays a real PowerPoint text box. A user who
   cannot fix a typo in their own deck will not pay twice. **Recommendation: generate a
   THEME (palette, type scale, layout rules, accent treatment), not pixels.** Apply it
   deterministically to the Phase-1 structure so every slide stays editable. Use image
   generation only for genuinely decorative assets (a title-slide background), never for text.
2. **Which surface?** Claude Design MCP is interactive-auth and unavailable headless, so it
   cannot sit in a server request path. Any design call must be a normal server-side API call
   from `apps/api`, following the existing `import.ts` patterns. Verify availability before
   committing to a vendor.
3. **Variety before commitment.** Show 3–4 distinct directions as *previews of the user's own
   first three slides*, not stock thumbnails. Deterministic theme application makes this cheap:
   render the same deck under several themes with no extra model call per preview.

### Cost shape

One design call per *deck*, not per slide. Theme generation is a small structured output
(palette + type scale + layout rules), so it is a cheap call even on a capable model. Slide
rendering stays in code. This keeps the expensive surface bounded and the output editable.

---

## 5. Cost optimisation — where the money actually goes

### 5.1 Pricing and business model — DECIDED 2026-07-27

**$7.00 / month, unlimited** (soft cap ~50 decks/month) · **$4.99 for 3 decks**, one-off.

Modelled against the measured per-deck cost: **$0.056 typical**, $0.092 worst case (top-tier
first generation + 6 cached iterations + one theme call).

| | Net after Stripe | Cost at typical use | Margin |
|---|---|---|---|
| $7.00/mo, 5 decks | $6.50 | $0.28 | **95.7%** |
| $7.00/mo, 10 decks | $6.50 | $0.56 | **91.4%** |
| $7.00/mo, 50 decks | $6.50 | $2.80 | 56.9% |
| $4.99 pack, 3 decks | $4.55 | $0.17 | **96.3%** |

**The pack must stay cheaper than one month of subscription.** An earlier proposal of $10.99
for 3 was rejected on this basis: at $3.66/deck against the subscription's $2.33/deck at the
same volume, a rational one-off buyer would take the $7 subscription and cancel, so the pack
would only ever sell to people who did not compare. At $4.99 ($1.66/deck) the pack has a real
reason to exist — no recurring charge, nothing to remember to cancel — which fits the
"one symposium, one deck" user the SEO plan identifies as the dominant academic pattern.

**The soft cap is about abuse, not researchers.** Break-even on the subscription is ~116 decks
per month (70 in the worst case), which no real user approaches. But accounts are anonymous-
first and cheap to create, so "unlimited" is a promise made to scripts as well as people. A
~50/month soft cap with a contact route above it keeps the word honest for humans while
bounding the downside.

**The governing insight: LLM cost is not the constraint.** At every price considered, model
spend is 1–2% of revenue while **Stripe's $0.30 fixed fee is 6%** of a $4.99 sale. Two
consequences, both of which cut against the usual instinct:
1. **Do not degrade narrative quality to save tokens.** Choosing a flagship model over the
   cheapest for first generation costs roughly 4¢ per deck — invisible at these prices, and
   narrative quality is the entire differentiator.
2. **Price on what researchers will pay**, not on a cost-plus basis, and prefer fewer, larger
   transactions over many small ones, because the fixed fee dominates at low ticket sizes.

### 5.1.5 Model pipeline — measured, and it reverses an earlier recommendation

Two blind-graded experiments, 2026-07-27. Scripts and full outputs in the session record.

**Run 1** (baseline prompt, 1 manuscript, 2 graders/deck): narrative scored 23–24/25 across all
tiers, but **every deck failed fidelity**. Invented prevalence figures ("fifteen million older
adults"), hypothetical examples with fabricated numbers, causal upgrades, imported constructs.
Tier spread was ~1 point — inside grader disagreement. On that evidence I recommended a cheap
generator. **That recommendation was wrong**, and the error was trusting an n=1 result.

**Run 2** (hardened prompt — invention promoted to "Rule Zero" above narrative quality, run 1's
real violations quoted as forbidden examples, the four invention "moves" banned by name, and a
mandatory verbatim `sourceQuote` per slide; 4 manuscripts × 3 tiers, 1 grader/deck):

| Model | Fidelity | Total violations | Narrative |
|---|---|---|---|
| **Opus-tier** | **4/4 pass** | **0** | 23.2/25 |
| Sonnet-tier | 2/4 pass | 5 | 23.5/25 |
| Haiku-tier | 0/4 pass | **55** | 18.8/25 |

**Two findings, in order of importance.**

1. **The hardened prompt is the larger effect** — universal failure became a clean pass on the
   top tier. Prompt engineering did most of the work here, not model choice.
2. **But tier is decisive, and the run-1 conclusion inverts.** 0 vs 55 violations is not grader
   noise. **Use the top tier for first generation.** The ~4¢ premium per deck is invisible
   against a $7/month price (§5.1) and is the difference between shippable and not.

**Manuscript type predicts invention — the hypothesis held.** Violations by source:

| Manuscript | Opus | Sonnet | Haiku |
|---|---|---|---|
| Positive finding | 0 | 0 | 9 |
| **Null result** | 0 | **3** | **16** |
| **Methods/tool paper** | 0 | **2** | **16** |
| Qualitative | 0 | 0 | 14 |

The clean positive finding is the safest source. **Null results and methods papers are the risky
pair** — the only two that broke the mid tier. The mechanisms differ and both are nameable:

- **A null paper has a claim-shaped hole where the finding should be, and the model fills it.**
  Observed: a non-significant per-protocol test upgraded to "No Effect in Completers"; a
  within-arm decline the paper attributes to regression to the mean recast as "real improvement";
  and — worst — a design asserted to "rule out attention and expectancy" when the paper invokes
  expectancy as its *own leading explanation*. Reporting someone's null result as a positive
  finding is the most damaging output this product could produce.
- **Methods papers invite invented mechanism** — fabricated causal explanations for reported
  numbers, including one that contradicted the paper's own data.

**What survived on the top tier** (zero hard violations, three borderline reaches, all flagged by
graders, all in **speaker notes**): a characterisation of standard clinical practice the paper
never makes; a deployment claim ("commodity compute") absent from the source; and an inaccurate
quotative frame ("In the author's own words:" followed by a paraphrase). Every one is the notes
reaching past the source — that is where the next prompt revision belongs.

**Sample-size honesty.** n=4 manuscripts per tier, one generation per cell, **one grader per deck
in run 2** (run 1 used two), so there is no inter-rater reliability estimate for run 2. The
top-tier/cheap-tier separation survives any plausible grader noise. **The top-vs-mid separation
does not** — the mid tier's failure rate is ~50% with a 95% CI of roughly 15–85%. If that choice
ever needs defending rigorously, run 3 should be mid-tier only, 8–12 manuscripts, 2 graders.

**Pipeline decision:**
- **First generation: top tier.** Non-negotiable.
- **Iterations: cheap tier + cache** — an accepted spine constrains the edit, and §5.1's cost
  model already assumes this.
- **Never the cheapest tier for first generation.** It failed 4/4 and corrupted verbatim quotes
  it was handed (3/4 on quote accuracy), so it cannot be trusted even for repair work.
- **Verification is still required regardless of tier** — see §4.1. A 4/4 pass on four
  manuscripts is not a guarantee on the fifth.

### 5.2 Model spend

The owner asked where hardcoding or cheaper models can replace the current shape. Measured
prices, 2026-07-27:

| Model | Input /1M | Output /1M | Notes |
|---|---|---|---|
| gpt-5.6 (sol) | $5.00 | $15.00 | flagship; not used |
| gpt-5.6-terra | $2.50 | $15.00 | **current condenser** |
| gpt-5.6-luna | $1.00 | $6.00 | nano tier |
| Kimi K3 | $3.00 | $15.00 | $0.30/1M on **cache hits**; 1M ctx; image+video |

### Measured cost experiment — run 2026-07-27

Gavin's point that **caching matters once a user iterates** is correct, and it overturns the
first pass of this section, which had wrongly assumed only the ~400-token system prompt was
cacheable. The manuscript excerpts are the bulk of the input (up to 20k chars ≈ 5k tokens,
typically ~2.5k) and are **byte-identical across iterations of the same paper**. That is the
cacheable asset, not the system prompt.

**Model, measured against the repo:** system 400 tok (from `prompt.ts`) · emphasis ~120 tok,
changes every iteration · manuscript 2,500 tok typical / 5,000 cap · output ~520 tok
(five panels at the `rubric.ts` budgets, ≈390 words).

**Prices verified against provider docs, 2026-07-27**, including two things the first pass
missed: GPT-5.6+ bills **cache writes at 1.25×** the uncached input rate, and caching requires
a prefix of **≥1,024 tokens**.

| Model | In | Cached in | Out |
|---|---|---|---|
| gpt-5.6-terra | $2.50 | $0.25 | $15.00 |
| gpt-5.6-luna | $1.00 | $0.10 | $6.00 |
| Kimi K3 | $3.00 | $0.30 | $15.00 |

**Cost per user, one manuscript, N iterations (typical length):**

| Model | 1 iter | 3 iter | 5 iter | 10 iter |
|---|---|---|---|---|
| terra, no cache | $0.0153 | $0.0461 | $0.0767 | $0.1535 |
| terra + cache | $0.0172 | $0.0348 | $0.0525 | $0.0966 |
| **luna, no cache** | **$0.0061** | $0.0184 | $0.0307 | $0.0614 |
| **luna + cache** | $0.0069 | **$0.0139** | **$0.0210** | **$0.0386** |
| K3 + cache | $0.0169 | $0.0349 | $0.0530 | $0.0981 |

**Four findings:**

1. **Caching pays from the second iteration onward**, for every OpenAI-family model. The
   1.25× write premium costs ~12% extra on a one-shot call and is repaid immediately on the
   first repeat. At 10 iterations it is a **37% saving**. Gavin's instinct is confirmed:
   enable caching.
2. **Kimi K3 still loses, and caching does not rescue it.** It is ~2.5× the cheapest option at
   every iteration count, because luna caches at $0.10/1M against K3's $0.30/1M — K3's
   headline cache discount is real but starts from a 3× higher base. **Do not adopt K3 for
   condensing.** Revisit only for its multimodal input or 1M context, which are capability
   arguments, not cost ones.
3. **Model choice dominates caching.** luna-without-cache beats terra-with-cache at every
   count. Both levers are worth pulling, but if only one ships, ship the model change.
4. **Short manuscripts cannot cache at all** — a 600-token manuscript yields a 1,000-token
   prefix, under the 1,024 minimum. Real papers clear it easily; abstracts and short drafts do
   not, so caching must be treated as an optimisation that sometimes silently does not apply,
   never as a guaranteed price.

**At scale, 1,000 users × 3 iterations:** luna+cache **$13.20** · terra+cache $34.80 ·
K3+cache $34.92 · terra uncached (today's shape) $46.10.

### The code change caching depends on

Automatic prefix caching only hits if the **volatile part of the prompt comes last**.
`buildCondenserUserMessage()` in `prompt.ts` currently emits `AUTHOR EMPHASIS` **first**, then
the panels — so the emphasis block, which changes on every iteration, sits at the front and
**invalidates the entire prefix every time**. As written today, the cache would essentially
never hit on an iteration.

**Required: reorder to panels-then-emphasis.** The panels (static per manuscript) form the
cacheable prefix; the emphasis block trails. This is a small change to one function, but it is
load-bearing for every number above, and it must be verified against the provider's
`cached_tokens` response field rather than assumed. Note the ordering swap changes what the
model reads last, which can shift output subtly — re-grade the prompt after the change rather
than treating it as cost-only.

### Ordered by expected saving

1. **Do more in code.** The largest saving is not a cheaper model, it is fewer calls. Slide
   arc, budgets, section mapping, citation formatting, theme *application*, and the slide-count
   derivation are all deterministic already or can be. Keep them that way.
2. **Drop the condenser to `gpt-5.6-luna`** once the Phase-2 bake-off grades it. That is a
   60% input / 60% output cut on the main recurring call. It is one constant in
   `api/narrative/config.ts`. **Gate on measured quality** — a condenser that silently drops a
   finding costs more than the saving.
3. **Enable prompt caching, and reorder the user message so it can hit.** Measured at a 37%
   saving over 10 iterations — but only after the panels-before-emphasis reorder described
   above. Verify with the provider's `cached_tokens` field; do not assume.
4. **One design call per deck**, per §4.
5. **Never call a model to classify what search can match.** The Q3 audience presets already
   follow this rule. Apply it to every future question.
6. **Free tier ends before the paid call.** Phase 1 output must be reachable with zero model
   spend beyond the condense step, so free users cost approximately one cheap call.

---

## 6. Booking the space — what ships before the feature does

Owner decision: **book the page now, mark it upcoming, collect a waitlist.**

- `/paper-to-slides` — real page, honest "Upcoming" framing, waitlist email capture. It must
  **not** imply the feature works today. No fake screenshots of output that does not exist.
- Waitlist storage: a Supabase table with RLS, email plus timestamp plus optional source. This
  is a new personal-data surface — the privacy policy names what is collected, and the form
  states what the address will be used for and nothing more.
- `/slides-for-a-talk` — the calculator from §1. **This one genuinely works on day one** and
  is the honest reason to visit before the generator exists.
- SEO records for both in `seo/routes.json` so they prerender and enter the sitemap.
- Copy is bound by the standing rule: no AI mentions, name the workflow not the capability,
  and every claim verified against what the code does.

---

## 7. Open questions for Gavin

1. **Design output: theme or image?** §4.1 recommends theme-based to preserve editability.
   This is the load-bearing decision for the whole paid tier.
2. ~~**Price and gate.**~~ **RESOLVED 2026-07-27** — $7/mo unlimited (soft cap ~50) plus a
   $4.99 three-deck pack; see §5.1. Still open within that: whether free ends at Phase-1
   text output or after one free themed deck.
3. **`/paper-to-present` re-point.** It currently 308s to `/paper-to-poster`. Confirm it moves
   here on ship.
4. **Journal club is a different pipeline.** It presents *someone else's* paper, so the
   interviewer's "your findings" framing is wrong for it. Separate mode, or out of scope?
5. **Speaker notes.** Free text per slide is cheap to emit and genuinely useful for a talk.
   In or out for Phase 1?
