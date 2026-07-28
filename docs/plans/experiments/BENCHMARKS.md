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
