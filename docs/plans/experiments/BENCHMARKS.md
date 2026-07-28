# Financial-model benchmarks — sourced 2026-07-28

Real published data used to calibrate the Postr financial projection
(`projection.mjs` and the interactive projection artifact). Quality
legend: **SOLID** = real study/report with disclosed sample; **WEAK** =
vendor marketing or thin sample; **INFERENCE** = reasoning from adjacent
data, no published Postr-category figure.

**Structural caveat.** Postr is NOT subscription SaaS. It's a one-time
term unlock ($19/4mo) + a consumable pack — closer to occasion-driven
e-commerce than to SaaS trial conversion. Every benchmark below is a
*directional analog*. The conservative reading of the solid data is the
correct one for this audience.

## 1. Free→paid conversion — USE 2.6% BASE (EdTech), not 8% SaaS median
- **EdTech freemium = 2.6%**, the single lowest of 15 industries (First
  Page Sage 2026, 80+ clients). This is the best number for the
  "students convert worse" thesis. **SOLID.**
  https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/
- General freemium self-serve "good" 3–5%, "great" 8–12%; median 8% but
  bimodal (~25% of products <2.5%). ChartMogul/Growth Unhinged 2026,
  200 products. **SOLID.** https://chartmogul.com/reports/saas-conversion-report/
- Model bands: **low 1.5% · base 2.6% · high 4%.** (Below EdTech median
  is defensible for a $19 unlock to stipend-funded students.)

## 2. Repurchase / renewal (there is no churn — there is repurchase)
- **Education apps: 58% weekly renewal but 24% ANNUAL** — the lowest
  annual of any category (RevenueCat State of Subscription Apps). "Buy
  for the deadline, don't renew until the next one" — an excellent
  analog for a term-based academic tool. **SOLID.**
  https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category/
- DTC occasion-driven repeat purchase: 11–18% (seasonal/high-consideration
  items). **SOLID (e-commerce analog).**
- Model: **term repurchase ~20–25% per season**, plus explicit
  graduation/leaving-academia churn (users structurally exit the market).

## 3. Organic MoM signup growth (year 1, word-of-mouth)
- Early-stage healthy 10–15% MoM; median SaaS ~2–2.5% MoM; top decile
  15–20%+. **WEAK-to-SOLID** (widely repeated, blended primary sources).
  https://founderpath.com/blog/saas-growth-rate
- No source isolates zero-CAC niche academic tools. A WOM-only seasonal
  tool sits BELOW 10–15% and is lumpy, not smooth. **INFERENCE.**
- Model: **underlying organic 3–7% MoM base**, with seasonal step-ups
  layered on top — NOT a flat 10% compound (that overstates year 1).

## 4. Seasonality — phenomenon SOLID, magnitude UNPUBLISHED
- Academic search terms follow a biphasic school-year pattern (low in
  summer/winter break, high in fall & spring), explaining **55–74% of
  variance** (Gillis & Garrison, JMIR Infodemiology 2022, peer-reviewed).
  **SOLID as evidence the effect exists.**
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9987186/
- Conference deadlines cluster Feb–Mar (poster sessions April) + fall
  (ACS/AIChE spring & fall). Corroborates Feb–Apr + Oct. **SOLID as
  calendar evidence.**
- A quantified multiplier for "research poster" specifically does NOT
  exist. **Set it and label it an assumption.** Peak ≈ 2–3× baseline,
  summer ≈ 0.3–0.5×. Pull Google Trends for "research poster" to refine.

## 5. Deck-pack attach rate — PURE INFERENCE, do not overstate
- No benchmark exists for "% of a low-price academic tool's payers who
  also buy a consumable pack." 35% of apps now mix subs + consumables
  (RevenueCat) — prevalence, not attach rate.
- Model: **base 10–15%, never above 20% without real data.** Flag as
  assumption, not benchmark.

## 6. Comparable scale — Overleaf is the ARPU north star
- **Overleaf** (closest comp — academic, LaTeX, freemium): 19–20M users
  vs ~$9–25M revenue → **ARPU ≈ $0.50–1.25/user/YEAR.** Academic
  freemium monetizes *very* thinly. If the model implies materially more
  per user, interrogate it. **SOLID (third-party estimate).**
  https://getlatka.com/companies/overleaf.com
- BioRender: 4M+ users, ~$36.5M ARR (2024), institutional deals.
- Canva: 12% blended paid rate — a *ceiling* (mainstream, network
  effects), not a floor. An academic-only tool assumes below that.

## Could NOT find (be honest in the model)
1. Quantified poster-specific seasonality multiplier — assumption.
2. Conversion for a term/one-time academic export tool — nothing exact.
3. Consumable-pack attach rate for productivity tools — gaming only.
4. Student conversion for Grammarly/Notion/Canva — proprietary; they
   mostly give student tiers away, so not comparable.
5. WOM-only niche year-1 growth — general SaaS only; likely lower/lumpier.

---

# Free-trial abuse benchmarks — sourced 2026-07-28

For the single-deck-trial pricing decision. Same quality legend.

## Abuse rate — the SOLID anchor, and why Postr is far below it
- **7.4% of AI-startup signups implicated in multi-account abuse** —
  Stripe, "Analyzing first-party fraud trends", Mar 10 2026. **SOLID.**
  https://stripe.com/blog/analyzing-first-party-fraud-trends-account-free-trial-and-refund-abuse
- Stripe qualifier **[SOLID]**: AI startups with free trials see ~10× more
  attempted abuse than enterprise AI, because free compute is the payoff.
- **Abuse is ROI-driven** — operators quit when payoff < cost. Security
  Boulevard, May 2026. **SOLID (commentary).**
- **GitLab natural experiment [SOLID]**: got flooded ONLY because free
  CI/CD minutes had crypto-mining resale value. A 2-cent one-shot deck
  with no resale does not attract industrial abuse.
  https://about.gitlab.com/blog/prevent-crypto-mining-abuse
- **1 in 5 consumers reuse different emails for promos; 29% Gen Z, 27%
  Millennials** — Stripe/451 Research. **SOLID (population).** Postr's
  users skew into the highest-propensity age band → expect CASUAL manual
  multi-accounting, not bot farms.
- **Model bands** (INFERENCE, grounded): **low 3% · base 8% · high 15%**
  of free decks are abusive. Even the high case × $0.056 = under a cent
  of waste per real free deck. Abuse is a rounding error, not a threat.

## Why abuse is financially immaterial here
Each abused free deck costs ~$0.015–0.056 in LLM. No published abuse-cost
model goes this low — all assume persistent SaaS accounts ($0.50–2/mo) or
high-value promos. Postr is below the floor of the literature. Correct
posture: **"log it, don't fight it."**

## Proportionate mitigation stack (all near-zero conversion cost)
1. Email normalize + dedup (strip Gmail dots/`+tags`, lowercase).
2. Block disposable-email domains (maintained list, ~12% of form fills
   use them [WEAK vendor number]).
3. Email verification before the free deck unlocks.
4. Server-side one-shot gating (never trust the client).
5. Salted hash of email retained AFTER deletion → detect delete-recreate.
   GDPR: fraud-prevention legitimate interest; document it.
**Do NOT** require phone/SMS or card — they cost 5–37% of conversions
(HubSpot/Unbounce [SOLID-ish]) to prevent 2 cents. GitLab proved one card
validates many accounts anyway.

## Trial→paid uplift — the DECIDING variable, and it's UNSOURCED
No published curve for "does seeing one free deck make you buy" at
Postr's shape. The freemium aha-moment effect is real but unquantified
here. This is INFERENCE and the key sensitivity knob — the model must
show the answer's dependence on it, not hide it. Bands: 1.3× / 1.6× / 2×.

## Could NOT find
- Students-specific trial-abuse rate (only price-sensitivity signals).
- Any incentive-value → abuse-rate elasticity curve (direction SOLID,
  magnitude unpublished).
- Any abuse figure for a trial as cheap as $0.02–0.05 (below the
  literature's floor — the low-abuse conclusion is INFERENCE).

---

# Market sizing — social-science + biology poster niche (2026-07-28)

Target: psych, sociology, public health, neuro, biology, medicine,
nursing, education, ecology. EXCLUDES CS/eng/math/physics (LaTeX users).

## TAM → SAM → SOM
- **US target-field grad+postdoc+faculty ≈ 750k–900k** [INFERENCE from
  NSF NCSES nsf25316: 818k SEH grad, 65,850 postdocs; ~50% in target
  fields per doctorate field-mix nsf25300]. SOLID underlying counts.
- **Global English+EU TAM ≈ 2.5–3.5M** [INFERENCE; Eurostat 670k EU
  doctoral, HESA 700k UK PG applied at ~40–50% target share]. MEDIUM.
- **~2–4M posters/year** in target fields [INFERENCE; Frontiers 2023:
  ~4.5M conference presentations/yr, "several million posters", 1–3
  posters/postgrad/yr SOLID-survey].
- **SAM ≈ 400k–800k** active, switch-willing makers/yr [LOW-MED — the
  "switch-willing" fraction is the softest number].
- **SOM (solo, unfunded, yr 3–4) ≈ 20k–60k active users/yr** = 0.5–3%
  of SAM [LOW — solo outcomes vary hugely].

## Competitor proof the niche is real (SOLID)
- **Mind the Graph** — life-sci poster/figure maker, **~500k users**.
  Closest direct analog.
- **BioRender** — 4M registered, 500k MAU, $900M val — but VENTURE-BACKED,
  7+ yrs. Academic plan $35/mo ($420/yr) → academics DO pay for visual
  tools. Postr's $19 one-time is far below, well-placed for students.
- **Overleaf** — 10M users, ARPU ~$1/user/yr (thin). The ARPU north star.

## What they use now (SOLID)
- **PowerPoint dominant** ("vast majority of posters" — Purrington).
  Canva secondary (libraries teach it). BioRender/Mind the Graph for
  figures. Target fields have NO LaTeX escape → highest-intent for a GUI.

## The $20-30k target verdict
- $25k ÷ $18 net = ~1,389 sales/yr → ~53k users/yr @2.6% conv.
- 53k = ~1.5-2% of TAM · ~7-13% of SAM · TOP of realistic SOM band.
- **Realistic but AMBITIOUS, not conservative.** At 4-5% conv (plausible
  given acute PowerPoint pain), only ~28-35k users → conservative. If
  word-of-mouth stalls at low-thousands (common solo outcome), $3-8k is
  likelier. **The constraint is DISTRIBUTION reach, not market size.**

---

# Pack-vs-sub cannibalization (2026-07-28)

## The load-bearing SOLID facts
- **Hybrid buyers = 7% of buyers but 25% of revenue** (RevenueCat, 115k
  apps). One-time buyers are a DISTINCT high-value segment, not lost subs.
- **Education: worst annual renewal (24%), best weekly** (RevenueCat) —
  the segment rejects long commitments, pays in bursts.
- **Education one-time-purchase share 6%→17%** 2023-25 (Adapty) — users
  prefer buying specific content over subscribing.
- **88% of students stay on free tier** (arXiv 2508.00717); students cap
  ~$5/mo (Łupa-Wójcik). Recurring leaves the price-sensitive majority
  uncaptured; a $10 one-time reaches them.
- **Decoy/anchor effect** (Ariely, n=100): a cheap option can make the
  premium look better and LIFT it ~30% — IF positioned as smaller/limited.

## Substitution rate to model (INFERENCE, triangulated — no direct study)
- **low 20% / base 35% / high 55%** of pack buyers would-otherwise-have
  bought the term. So base ~65% are INCREMENTAL (net-new).
- Dierks & Seuken 2020 (arXiv): offering BOTH types "typically leads to
  significantly higher revenue than either alone" — the options SORT
  customers. [SOLID game-theoretic].

## Break-even (from sub-vs-pack.mjs)
Pack helps IFF it unlocks enough net-new buyers to pay for poached subs:
- @20% substitution: need >23 net-new pack buyers per 100 would-be subs
- @35% substitution: need >40 net-new
- @55% substitution: need >63 net-new
A pack buyer's 3-yr LTV ≈ 47% of a term buyer's ($10.39 vs $22.28).

## DESIGN GUARDRAILS (make the pack recruit, not cannibalize)
- Real value gap: $10/3-decks vs $19/4mo-unlimited. Anyone making >~4
  posters is better off with the term → heavy users self-select up.
- DON'T show pack side-by-side as co-equal. Surface as the lighter
  option / on term rejection (RevenueCat "moment of rejection").
- Watch RevenueCat failure mode: don't price so low it just shifts
  would-be recurring revenue earlier.

## Could NOT find
- Direct measured pack-vs-sub substitution rate (none published).
- Pack-buyer repeat-purchase behavior (the real long-term unknown —
  close it with your own cohort once live).

---

# Payment provider re-comparison (2026-07-28, post-price-change)

Trigger: Lemon Squeezy (Stripe-owned) now steers new signups to **Stripe
Managed Payments** instead of the classic 5%+$0.50 product. Founder
suspicious of the upsell. Re-verified.

## Real current pricing (SOLID = vendor's own page)
- **Stripe Managed Payments** `[SOLID, support.stripe.com]`: **3.5% MoR
  fee ON TOP of** standard 2.9%+$0.30 processing = **~6.4%+$0.30 domestic,
  ~8.5–11% intl**. True MoR (files+remits VAT in 80+ countries). Canada
  seller OK. It's a markup model, materially pricier.
- **Classic Lemon Squeezy (5%+$0.50) still exists** for new signups
  `[WEAK — LS page 403'd; third-party corroborated]` — the founder was
  just funneled to the pricier Managed Payments. Suspicion well-founded.
- **Polar Starter (free tier): 5%+$0.50, +1.5% intl** `[SOLID, polar.sh]`.
  Full MoR, one-time payments, clean webhook DX. Grandfathered 4%+40¢ for
  orgs before 2026-05-27; new = Starter 5%+50¢.
- **Paddle: 5%+$0.50 BUT "under $10 → contact sales"** `[SOLID]` — kills
  the $9.99 pack. Disqualified.
- Dodo (4%+$0.40, 220+ countries), Creem (3.9%+$0.40, ~50 countries) —
  cheaper headline, newer/less proven `[WEAK]`.

## Net take-home on Postr's tickets `[INFERENCE from SOLID rates]`
| Provider | $18.99 dom | $18.99 intl | $9.99 dom | $9.99 intl |
|----------|-----------|-------------|-----------|------------|
| Managed Payments | $17.47 (8.0%) | ~$16.90 (11%) | $9.05 | ~$8.75 |
| **Polar Starter** | $17.54 (7.6%) | $17.26 (9.1%) | $8.99 | $8.84 |
| Lemon Squeezy classic | $17.54 | $17.54 | $8.99 | $8.99 |

## Managed Payments premium over Polar (the "is it a lot?" answer)
- 500 sales/yr: **~$75–120/yr** · 1,400 sales/yr: **~$210–330/yr**.
- Tens at low volume, low-hundreds higher. Small — but no reason to pay
  it, and Polar is cheaper on INTERNATIONAL (matters for worldwide buyers).

## VERDICT: Polar (Starter, free tier)
Same-or-cheaper than Managed Payments on both tickets, cheaper intl, true
non-Stripe MoR (tax offload intact), clean Supabase+Express webhook DX,
and sidesteps the Stripe upsell. Accept Managed Payments only if you
value Stripe reliability/familiarity over ~$100/yr — a defensible but
not compelling trade. Do a Polar uptime due-diligence pass first.

## Could NOT verify
- Managed Payments' exhaustive country list (Stripe says "80+", no list;
  earlier "not in India/Global South" is third-party only, and limits
  SELLER location not buyer).
- Polar's literal "files & remits" wording (positions as full MoR,
  corroborated, but exact sentence not captured).
- Provider uptime track records (reputational only — founder should
  due-diligence before committing production revenue).
