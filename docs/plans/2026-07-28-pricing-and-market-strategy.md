# Pricing & market strategy — the deck decision, the market, and when to advertise

**Date:** 2026-07-28
**Status:** DECIDED (pricing + tiers). Paid-ads guidance and the pricing-page
quiz are ANALYSIS + PLANNING, not built.
**Owner:** Gavin. Decisions here captured 2026-07-28.
**Grounds on:** the sourced analysis in `experiments/BENCHMARKS.md` and the
interactive models (`experiments/*.mjs`, `experiments/*.html`).
**Relates to:** `2026-07-28-payment-and-paywall.md` (Sequence 1) — this
settles the prices that plan gates.

---

## 1. The final pricing — DECIDED

Three tiers. Prices chosen to clear the payment-fee trap, sit under the
student price ceiling, and keep a real value gap so the pack recruits
rather than cannibalises the term.

| Tier | Price | What it unlocks |
|------|-------|-----------------|
| **Free** | $0 | Unlimited editing, all tools, **watermarked PDF** poster export, paper→poster. |
| **Deck pack** | **$9.99 / 3 deck exports** (one-time) | Export generated talks. For the occasional / one-off user. |
| **Term** | **$18.99 / 4 months** | Clean PPTX + LaTeX export, unlimited talk export. Framed as a *term*, never a subscription. |

**Why these exact numbers** (all proven in `experiments/margin-math.mjs`):

- **$18.99 / 4 months = $4.75/month** — sits just under the **~$5/month
  student price ceiling** (Łupa-Wójcik 2024). Keeps **91.5%** after
  Lemon Squeezy fees + LLM cost.
- **$9.99 pack keeps 88.3%** after fees. The old $4.99 kept only 82% —
  the $0.50 fixed fee was eating 10% of the sale. $9.99 is the efficient
  point; the margin curve flattens above it, so charging more buys little.
- **The value gap is deliberate:** term nets $5.85/deck, pack nets
  $3.00/deck. Anyone making more than ~3–4 posters is better off on the
  term, so **heavy users self-select up** (Ariely anchor effect). This is
  what makes the cheap pack recruit incremental buyers instead of
  draining the term.

**Decision: ship the $9.99 pack alongside the term** — the substitution
research (below) says it mostly captures price-sensitive users who would
otherwise pay $0, not lost subscribers. Design guardrails in §4.

---

## 2. TAM / SAM / SOM — the market, and the target reality-check

The three nested rings of market size, with Postr's numbers
(`experiments/BENCHMARKS.md`, `experiments/market-strategy.html`):

- **TAM (Total Addressable Market)** — everyone who *could* use it:
  **2.5–3.5M** social-science + biology researchers (grad + postdoc +
  faculty), global English-speaking + EU. `[INFERENCE from SOLID NSF
  NCSES / Eurostat / HESA counts]`
- **SAM (Serviceable Addressable Market)** — the reachable slice with the
  need: **400–800k** active, switch-willing poster-makers per year.
- **SOM (Serviceable Obtainable Market)** — what a solo, unfunded,
  word-of-mouth tool realistically captures in 3–4 years: **20–60k**
  users/year. (Comparables: Mind the Graph reached ~500k, BioRender 4M —
  but over years and, for BioRender, with venture funding.)

**The $20–30k/yr target, checked against this:** $25k needs ~1,400
sales/yr → **~53k users/yr** at 2.6% conversion. That is ~1.5% of TAM but
**7–13% of SAM** and the **top edge of the realistic SOM band.**

> **Verdict: realistic but ambitious — and it is a DISTRIBUTION problem,
> not a market one.** The market is comfortably large. Whether the target
> is hit depends almost entirely on organic reach into ~50k poster-makers
> a year. If conversion runs 4–5% (plausible given acute PowerPoint pain
> in these non-LaTeX fields), the same $25k needs only ~30k users and the
> target turns conservative. If word-of-mouth stalls at low-thousands (the
> common solo outcome), $3–8k is likelier.

---

## 3. When to start paid advertising (Instagram / TikTok / Google)

**DECIDED: not now, and — at this LTV — the cold-ad math essentially never
closes.** The allowable-CPC math is decisive (`[INFERENCE]` on Postr's
inputs; the LTV:CAC ≥ 3:1 framework behind it is `[SOLID]` — Skok/Matrix,
now the standard benchmark).

**The allowable-CPC ceiling:**

| Step | Formula | Value |
|------|---------|-------|
| Net LTV | one term + ~22% repurchase | ~$20 |
| Max CAC per paying customer | LTV ÷ 3 | **$6.67** |
| Max cost per free signup | CAC × 2.6% conversion | **$0.17** |
| Max CPC (generous 20% click→signup) | ×20% | **$0.035** |
| Max CPC (realistic ~10% click→signup) | ×10% | **$0.017** |

**Postr's ceiling is ~$0.02–0.17 per click.** Real 2026 CPCs
`[SOLID-ish, WordStream / vendor-consistent]`:

| Channel | 2026 CPC | vs Postr's $0.17 ceiling |
|---------|----------|--------------------------|
| Instagram (best case) | ~$0.40 | **~2.3× over** (23× over the realistic ceiling) |
| TikTok | ~$1.02 | ~6× over |
| Google Search — Education | **$4.81** (CPL $77) | **~28× over** (140–280× realistic) |

**The gap is 10–150×.** Cold ads cannot pay for themselves. Google
Education even at a strong 13.1% conversion costs ~$77/lead — **4× Postr's
entire LTV** before that lead clears the 2.6% free→paid gate.

**Why, structurally `[SOLID principle]`:** cold paid CAC for bootstrapped
SaaS runs ~$800; at 3:1 that needs **LTV ≈ $2,400+**. Postr's ~$20 is ~1%
of that. Paid ads want an LTV two orders of magnitude higher than a $19
one-time term produces. The expert consensus (Lenny Rachitsky, Elena
Verna) is blunt: **you cannot advertise your way to product-market fit;
ads amplify a funnel that already pulls.** Verna: wait ~$1M ARR before a
paid-growth function.

**Trigger conditions before ANY cold spend — meet ALL:** (1) organic
already pulls unprompted; (2) conversion known and stable across cohorts;
(3) LTV + repurchase *measured* over 2+ term cycles, not modelled; (4) a
*measured* click→signup rate (it sets the CPC ceiling); (5) payback under
~1 month on any test; (6) ideally a higher-LTV tier exists. Postr today
plausibly clears 1–3 but cannot clear 4–5 on cold traffic at these CPCs.

**Run this instead — the organic playbook** (the only channels whose CAC
fits a $20 LTV, ranked):

1. **Programmatic + comparison SEO** — `[SOLID-ish]` content+SEO is the
   primary channel for 67% of indie hackers reaching $10k MRR. The whole
   SEO plan (`2026-07-26-seo-plan.md`) is this. Compounds for years.
2. **The "made with postr.sh" artifact loop** — every printed poster is a
   billboard at a conference full of the exact ICP. Warm, targeted, free.
   Growth-plan Move #1.
3. **Community participation** — academic Bluesky/Twitter, r/GradSchool,
   r/AskAcademia, field Slacks. Answer real questions, don't spam.
4. **Conference presence** + hashtag — poster sessions ARE the use case.
5. **University library / grad-program lists** — one departmental rec
   seeds a cohort. ~zero CAC.
6. **Blog / resource library** — see `2026-07-28-blog-and-content.md`.

Pick **2 channels, run 90 days deep** before adding a third. Start with
SEO + the made-with loop.

**The only defensible paid spend, ever, at this LTV:**
- **Branded-search defense** — but only if a competitor bids on "Postr".
  Do the *free* thing first: file a Google Ads trademark complaint.
- **Retargeting warm visitors** — $3–10/day, ~30–60% cheaper than cold,
  but pointless until organic drives real visit volume to retarget.
- **A higher-LTV institutional/lab tier** is the real unlock — a site
  license at hundreds–low-thousands/yr pushes LTV toward the $2,400 that
  makes even cold CAC viable. **Ads follow LTV, not the reverse.**

---

## 4. The pricing page + the plan-selector quiz

**DONE (2026-07-28): a standalone `/pricing` page** with a 3-tier
comparison (Free / Deck / Term), the term marked "Recommended", and a
one-line "which should I pick?" helper. Built as `pages/Pricing.tsx` +
`components/PricingSection.tsx` (the section is a separate component so an
in-app upgrade modal can reuse it). In the header nav and footer Product
column; SEO-registered and prerendered.

**Deliberately a standalone page, NOT a home-page section** (Gavin,
2026-07-28): the home page is reserved for the hero, tools, and — later —
**user reviews**. Pricing gets its own room.

> **REMINDER — revamp the About page (Gavin, 2026-07-28).** The About page
> should become **more human — a page that fosters trust and connection**,
> not just a feature tour. This matters more now that the site asks for
> money: a real person/story behind a paid tool converts better with a
> skeptical, stipend-funded academic audience. Not yet scoped; flagged
> here so it isn't lost. Pairs with the planned home-page **user reviews**
> section (both are trust-building surfaces).

**Note on checkout:** the pricing CTAs route to signup — **no billing is
wired yet.** The page ships the pricing *story* ahead of Sequence 1
(payment-and-paywall) so the free/paid line is public and export is never
a surprise. Checkout gets wired when the paywall is built.

**Talk export is COMING-SOON, not live.** Paper-to-talk generation/export
is NOT BUILT (`2026-07-28-paper-to-talk.md`). So the pricing page ships
**two live tiers** (Free, Term — both back only shipped features: editing,
watermarked PDF, PPTX + LaTeX export) **plus a coming-soon Deck pack** that
advertises the planned $9.99 price and collects a **waitlist** rather than
taking a live purchase. The term card deliberately does **not** list "turn
a paper into a talk" — it only sells what a buyer gets today. This keeps
the page honest: it never sells an artifact the product can't produce.

> **REDEEM ON LAUNCH — the waitlist free-deck promise (Gavin,
> 2026-07-28).** The coming-soon pack card promises *"waitlist members get
> their first deck free."* When paper-to-talk ships and billing is wired,
> this must be honoured: everyone who joined the waitlist before launch
> gets one free talk generation+export. Track waitlist signups (the
> `/auth` route the CTA points at, plus a flag/table) so the cohort is
> identifiable at redemption time. Do NOT flip the pack to a live purchase
> without delivering this. Flagged here so it isn't lost between now and
> the feature landing.

**DECIDED (on research): do NOT build the quiz. Ship a comparison table +
"recommended" badge + a one-line helper instead.** A 3-tier, one-variable
decision is well below the complexity threshold where a quiz earns its
friction. The evidence:

- `[SOLID]` **Choice-overload is real only when several moderators
  converge** (Chernev et al. 2015 meta-analysis, N=7,202: set complexity ×
  task difficulty × preference uncertainty × a maximizing goal).
  Scheibehenne et al. 2010 (50 experiments) found the mean effect of more
  options ≈ **zero**. Three tiers is *not* overload territory — a quiz
  solves a problem the page doesn't have.
- `[SOLID]` **NN/g on wizards:** use one only for *novice users AND
  complex/infrequent tasks*, and *never as the only path* — otherwise it
  "quickly becomes annoying and overly controlling."
- `[MODERATE]` **Multi-step only wins past ~7 fields** (HubSpot). Under
  ~5, the extra clicks are pure friction. Postr's decision is **one
  variable**: "one poster once, or unlimited for a term?" A quiz around a
  1-question choice is textbook overkill — a step between intent and CTA.
- `[WEAK, but consistent]` **Quizzes shine for ecommerce DISCOVERY** (find
  1 of dozens of SKUs), and are **weak at closing a considered purchase
  in-session** — the sale "lands later, off-session." A pricing decision
  is the latter.
- **The lower-friction alternatives deliver the quiz's *output* with zero
  added steps:** a "Recommended/Most popular" badge on the term (cited
  +25–40% tier selection `[WEAK magnitude, SOLID direction]`), the natural
  $9.99-vs-$18.99 decoy anchor, a simplified table with detail-on-demand,
  and a one-line helper: *"Making one poster? Get the pack. Presenting all
  term? Get the term."*
- **The one real point for a quiz** — the audience is less-tech-savvy, and
  guidance helps non-experts (Chernev's uncertainty moderator applies). But
  guidance ≠ a wizard: the inline helper + badge addresses it without the
  gate.

**Build the quiz only if** tiers grow past 3–4 / the choice becomes
multi-variable, OR analytics later show real friction at the table
(dwell/thrash, "which plan?" support tickets) — and even then make it
optional, skippable, and framed as top-of-funnel discovery ("is Postr
right for my poster?"), not a gate on the pricing decision. **You run no
analytics yet, so you can't see that friction — another reason to wait.**

**Provisional design guardrails for the pack** (so it recruits, not
cannibalises — from the substitution research):

- Keep the value gap visible ($9.99/3 decks vs $18.99/4-months-unlimited).
- Do **not** show the pack as a co-equal third column with equal weight —
  surface it as the lighter option, or at the moment someone hesitates on
  the term (RevenueCat "moment of rejection").
- Mark the **term as "recommended"/"best value"** — the anchor that makes
  heavy users self-select up.

---

## 5. Substitution & the pack decision — the evidence

Why shipping the cheap pack is the right call (full sources in
`experiments/BENCHMARKS.md`):

- `[SOLID]` **Hybrid buyers = 7% of buyers but 25% of revenue**
  (RevenueCat, 115k apps) — one-time buyers are a distinct high-value
  segment, not lost subscribers.
- `[SOLID]` **Education has the worst annual renewal (24%)** but best
  weekly — this segment rejects long commitments and pays in bursts.
- `[SOLID]` **88% of students stay on the free tier**; students cap at
  ~$5/month — a subscription leaves the price-sensitive majority
  uncaptured. A $9.99 one-time reaches them.
- `[INFERENCE, triangulated]` **~35% substitution / 65% incremental** is
  the base case. The pack wins whenever it unlocks **>40 net-new buyers
  per 100 would-be subscribers** — a bar this audience likely clears.
  Interactive: `experiments/market-strategy.html`.

**The load-bearing unknown:** the substitution rate is triangulated, not
measured (no study tests this exact case), and pack-buyer *repeat*
behaviour is unknown. **Validate both with the first real cohort** rather
than trusting the model.

---

## 6. Decision log

| Date | Decision | By |
|------|----------|-----|
| 2026-07-28 | Term priced **$18.99 / 4 months** ($4.75/mo, under student ceiling) | Gavin |
| 2026-07-28 | Deck pack **$9.99 / 3 decks** (up from $4.99 — clears the fee trap) | Gavin |
| 2026-07-28 | Ship the pack alongside the term; positioned to recruit not cannibalise | Gavin, on evidence |
| 2026-07-28 | Build a 3-tier pricing page (Free / Deck / Term) | Gavin |
| 2026-07-28 | Plan-selector quiz: research first, then decide | Gavin |
| 2026-07-28 | Paid ads: not now; confirm with CPC math (likely never at this LTV) | analysis |
