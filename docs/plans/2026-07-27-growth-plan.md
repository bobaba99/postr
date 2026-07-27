# Postr Growth Plan

**Date:** 2026-07-27
**Constraints:** solo operator, zero acquisition budget, ~50 MAU break-even on free hosting tiers, no traffic, no conversion data.
**Tagging convention:** every claim below is marked `[EVIDENCE]` (traceable to a cited study or primary source in the research), `[JUDGEMENT]` (my inference, not evidenced), or `[UNVERIFIED]` (asserted in the research but resting on vendor marketing or a single weak source).

---

## 1. The Answer: Top 5 Moves, Ranked by Impact ÷ Effort

### #1 — Put "Made with postr.sh" on every free-tier export, and ship it before the August notification wave

**Why it's first:** highest impact per hour of work in the entire research set. A conference poster hangs at eye level for 3-6 hours in a room full of exactly the target audience. Nothing else Postr can do reaches 50-200 psychology/medicine researchers for zero marginal cost.

- `[EVIDENCE]` BioRender contractually requires free-tier exports to carry "Created with BioRender.com"; that mark now appears in 500,000+ journal citations against 4M+ researchers — roughly 1 citation per 8 users. The absolute numbers are company-reported and self-serving, but the *mechanism* is verifiable in the licensing terms.
- `[EVIDENCE]` The comparables line found artifact-borne attribution to be the single most reliable growth engine in this category.
- `[JUDGEMENT]` The November conference-dense month (APHA, AHA, SfN, RSNA, all in four weeks) is worthless as an acquisition push — the posters were made in August. But it is enormously valuable as a *presence* month if and only if the mark is already on the exports. That makes the mark a hard deadline, not a nice-to-have: it must ship before the early-August SfN/AHA acceptance wave, or the entire November impression volume is forfeited for a year.

**Build spec:**
- Small, monochrome, bottom-corner, journal-footer scale. Not a logo lockup. `[EVIDENCE]` The research flags twice, independently, that psychology/medicine PIs and some conferences are hostile to visible branding on scholarly output and will order it removed.
- Same mark on print PDF and image export.
- A "How to cite Postr" page. `[JUDGEMENT]` Academics are trained to cite; giving them the string costs nothing and converts an aesthetic objection into a familiar academic convention.
- **Do not** make watermark removal the primary paid benefit. `[EVIDENCE]` Named as a dead end: it sets the growth loop directly against revenue, and charging stipend-funded grad students $19 to delete a logo is a poor value story. Paid tier needs standalone value.

**Cost:** hours of export-pipeline work plus one help page.
**Risk:** `[EVIDENCE]` If it's heavy-handed, users remove the poster from Postr entirely rather than negotiate with their PI. Keep it minimal. `[JUDGEMENT]` Consider a documented policy that it can be removed for a submission where a conference explicitly bans third-party marks — the goodwill is worth more than the impressions lost in that edge case.

---

### #2 — Ship a first-class BetterPoster template


> **Verification note (checked 2026-07-27):** the research agent reported "zero matches for
> `betterposter`/`morrison` in the repo". That grep was too narrow — `GuidelinesPanel.tsx` *does*
> cite the format (APA's "Better Poster" modification template, and Purrington's
> betterposters.blogspot.com as a source). The substantive claim survives and is arguably stronger:
> no BetterPoster **layout** exists among the five templates (3-Column Classic, 2-Col Wide Figure,
> Billboard, Sidebar + Focus, Blank), so the guidelines panel currently tells users about a format
> the editor cannot produce.

**Why it's second:** this is pre-existing, pre-validated demand in Postr's exact category, currently served by a raw .pptx download. Being the best web editor for a format people already want is far cheaper than creating want.

- `[EVIDENCE]` Mike Morrison — a *psychology* PhD student at Michigan State, precisely Postr's audience — posted a 2019 explainer that hit ~150,000 views/2,900 retweets within three months and later exceeded 1.3M YouTube views. #betterposter went viral. Templates sit free on OSF (osf.io/ef53g).
- `[EVIDENCE]` The format then got *institutionalized*: UC Davis built an entire LibGuide around it; Yale runs an academic-poster guide listing it; MIT students shipped an "Even Better Scientific Poster" in 2023. Librarians are already sending students to it.
- `[EVIDENCE]` Verified by grep of the Postr repo: zero matches for `betterposter` / `better poster` / `morrison` across code and docs/plans. This is currently absent.

**Build spec:** landscape + portrait variants, the giant plain-language finding, the QR-code slot, the sidebar. `[JUDGEMENT]` All of this sits inside existing editor primitives — it's a template plus a QR block, not a feature.

**Cost:** low.
**Risk:** `[EVIDENCE]` The format is genuinely contested among senior academics (Inside Higher Ed ran a "are they really better?" piece) and a PI can veto it. Ship as one *prominent* option among conventional templates, never as the default. Do not claim endorsement by Morrison or MIT.

**Strategic point `[JUDGEMENT]`:** this move compounds with #1 and #3. A BetterPoster made in Postr is visually distinctive across a conference hall in a way a conventional poster is not — which raises the value of the attribution mark — and it gives the librarian outreach in #3 a concrete reason to relink a guide that already features the format.

---

### #3 — Librarian outreach: 20 emails a week, offering a free resource, never pitching the product

**Why it's third:** highest-leverage non-SEO channel found, and the only one that compounds. A LibGuide listing is a permanent .edu backlink *plus* in-context referral at the exact moment of need.

- `[EVIDENCE]` Poster-design LibGuides already exist at dozens of universities, are authored by a single named subject/health-sciences librarian whose contact is exposed by design, and routinely link out to free third-party tools with no procurement, no IT security review, no contract. Directly observed: UC Davis links to Morrison's OSF repo and MIT's templates and hosts nothing proprietary. USC School of Medicine runs an entire guide recommending Canva, with a named librarian contact publicly listed.
- `[EVIDENCE]` Confirmed poster guides at Exeter, Trinity, Grinnell, Fitchburg State, Guilford, Mississippi Univ. for Women, Tufts, Clemson, Central Washington, UT Knoxville, Yale.
- `[EVIDENCE]` Springshare markets LibGuides on SEO indexing, and a Grand Valley State librarian documents that SEO link-builders systematically google "libguides" to farm .edu backlinks — the pages rank, and this vector is already known and abused, which is exactly why the outreach must not read as marketing.
- `[UNVERIFIED]` The "5-15% reply rate on cold librarian email" figure in the research has no cited source. Treat as a guess.

**Mechanics:**
- Build the list: `site:libguides.com "research poster"` and `"libguides" "scientific poster"`, filtered to psychology / medicine / health-sciences guides. Extract the named librarian from each contact box. Target ~200 contacts.
- Fold in ~30-50 postdoc-office professional-development resource pages (Yale, UNC, Notre Dame all maintain public ones). `[EVIDENCE]` NPA has 240 organizational members covering ~70,000 postdocs and its RPPP explicitly directs offices to run a website and listserv. Same motion, different job title — do not run it as a separate campaign.
- The offer is the free chart chooser + figure-readability checker as a resource for their existing guide. Not Postr.
- Every email individually written, referencing their actual guide. `[EVIDENCE]` Templated vendor pitches get ignored or flagged on library listservs.

**Cost:** zero cash; ~4-6 hours to build the list, ~2 hours/week thereafter. First listings realistically 4-8 weeks out.

**Timing caveat `[UNVERIFIED]`:** the "librarians refresh guides in late August and early January" assumption is **not established**. Two targeted searches failed to find a source for those specific months, and Emory's documented *summer* broken-link projects actively suggest June-July. The semester-boundary pattern is real; the month precision is not. **Resolve it cheaply:** in the first batch of 10 emails, ask the librarian directly when they refresh. That converts a low-confidence inference into first-party fact and doubles as outreach.

**Hard constraint `[EVIDENCE]`:** if Postr later paywalls something a librarian listed as free, that librarian removes the link and remembers. The chart chooser and readability checker must be free forever, in writing. This is a real cost of Move #4 and it is why the export meter must never touch these tools.

---

### #4 — Split the chart chooser and readability checker into standalone, no-signup, permanently free micro-tools with their own URLs

**Why it's fourth:** it is the enabler for #3 (librarians link tools, not editors), it compounds with the existing SEO plan, and the causal evidence for free tools lifting paid demand is real if modest.

- `[EVIDENCE]` Deng, Lambrecht et al., *Management Science* — difference-in-differences on App Store apps using unpredictable Apple review timing for identification — found launching a free version caused an **8.9% increase** in daily ratings for the paid app. Two mechanisms: pre-purchase sampling *and* improved discoverability from the extra listing. Causal via a credible natural experiment; setting is mobile games and "ratings" proxies demand, so transfer is imperfect.
- `[JUDGEMENT]` The discoverability half is the half that transfers cleanly to Postr. The persuasion half probably does not.
- `[EVIDENCE]` Bootstrapped precedent: Paperpile (no funding rounds per Tracxn, ~$1M ARR) runs BibGuru, a free citation generator reportedly serving 2M+ students/month. The free tool is ~1000x the revenue base. That shape is fine when the free tool is cheap to run — which these are.
- `[EVIDENCE]` The Morrison case shows the same pattern from the other direction: a free, opinionated, downloadable, *citable* artifact hosted at a stable link is what got absorbed into permanent library infrastructure.

**Build spec:**
- Permanent, stable, indexable URLs. `[JUDGEMENT]` The OSF-equivalent: a link a librarian can paste into a guide and trust for years.
- Named by workflow, not capability. **House constraint:** "check your figure is readable from six feet" — never "AI-powered figure analysis."
- A soft, non-blocking path into the editor at the end. `[EVIDENCE]` Not a nag; the research explicitly warns the funnel only works if the exit is natural.
- `[EVIDENCE]` These map directly onto the measured KD-0 keywords and are link-worthy in a way a general editor is not.

**Cost:** low-moderate. The logic exists; this is routing, standalone UI, and SEO shells.
**Risk `[EVIDENCE]`:** real chance of building popular tools that never convert. **Judge them on assisted signups, not on their own traffic**, or they will look better than they are. Also adds maintenance surface for a solo operator.

---

### #5 — Capture email at export, and send exactly two seasonal messages a year

**Why it's fifth:** it's the only mechanism that makes a seasonal product re-acquirable, it costs almost nothing, and Resend is already in the stack. It is fifth rather than first because it does nothing until there are users.

- `[EVIDENCE]` Churnkey State of Retention 2025 (1,000+ companies, $3B subscription revenue, 15M subscriptions, 3M cancellation sessions): 30.6% cite infrequent usage as a cancellation reason, up from 27.1%, second only to budget at 32.97%. The report explicitly names seasonal and "on-and-off use case" businesses. Self-reported exit-survey data, skewed toward companies that bought churn software.
- `[EVIDENCE]` The Frontiers RCT (n=680,588, randomized 3-day vs 7-day trials) found **delayed conversion +42.4%** and 2-year conversion +20.9%, with no significant effect on immediate conversion. Users who don't convert in the moment convert later when re-approached.
- `[EVIDENCE]` Same RCT: longer-exposure users responded better to **feature-based promotions than discounts**. The seasonal message should announce new capability, not cut price.
- `[UNVERIFIED]` The "5-10% reactivation for 90+ day inactive" win-back benchmarks come from email-vendor blogs with no stated samples. Ignore the numbers; keep the timing logic.

**Mechanics:**
- Ask for email at the export moment — the natural point, and the point at which value is already on screen.
- Two sends per year, timed ~4-6 weeks *before* the two demand peaks: **late January** (ahead of the March-April symposium wave) and **late June/early July** (ahead of the early-August SfN/AHA acceptance wave).
- Content is "what's new since you last visited." Never a discount.
- `[EVIDENCE]` Do NOT build a cancellation/pause/win-back-offer flow. A 4-month term that expires generates no cancellation event to save. Building it is engineering against a problem the pricing model already solved.

**Cost:** very low.
**Risk `[EVIDENCE]`:** academic emails go stale fast when students graduate or change institutions. Expect list decay far above consumer benchmarks and do not read low reactivation as product failure.

---

### Sharpening what's already planned (not re-pitched — the owner has these)

**Campus flyers.** `[EVIDENCE]` The seasonality research changes the placement and the timing, not the tactic:
- **Two print runs, not a continuous drip: late February and late July.** Late Feb catches undergrad symposium abstract deadlines (verified: Illinois Mar 13, UVA Mar 24, William Paterson Mar 27, Penn State Mar 30, NC State Mar 30). Late July catches the early-August SfN/AHA acceptance wave.
- **Target undergraduate research offices, not just psych/med departments,** for the spring run. `[EVIDENCE]` Six independent universities converge on March-April symposium season. `[JUDGEMENT]` First-time poster-makers have no existing tool and no PowerPoint habit to displace — they are the cheapest possible conversion to the free tier. But `[EVIDENCE]` they are also the segment least able to pay $19; judge this run on MAU toward break-even, not revenue.
- **Two building-specific variants.** `[EVIDENCE]` Psych/neuro peaks autumn (SfN acceptances early Aug, ACNP Oct); medicine is split and earlier (AAN meets April, ASCO deadline January, AHA/RSNA/APHA notify anywhere from June to mid-September). Same product, different timing per building. `[JUDGEMENT]` If bandwidth is tight, skip the split and run the single Mar-Apr + Aug calendar — this may be over-engineering for a product with zero traffic.
- **What goes on the flyer `[JUDGEMENT]`:** the short domain and one concrete workflow claim, not a feature list. The audience is non-tech-savvy and reading it while walking. `[EVIDENCE]` House rule: name the workflow, never the capability, and verify every printed claim against the code before it goes to print.
- **Not November.** `[EVIDENCE]` Four major meetings fall in a four-week span (APHA Nov 1-4, AHA Nov 6-9, SfN Nov 14-18, RSNA Nov 29-Dec 3) but every one of those posters was made in August-October. Flyering in November buys visibility after the decision.

**Instagram.** `[EVIDENCE]` Two adjustments from the seasonality line: run two content calendars keyed to the verified psych-vs-medicine split above, and front-load content so it is live *before* the peak, not during it. `[JUDGEMENT]` Deadline-driven demand arrives in spikes; content published during the spike is too late to have been discovered.

---

## 2. Conversion Mechanics for a Seasonal Academic Tool

### The instrument: term, not subscription — and keep credits for decks

**Verdict: the already-planned $19/4-month term is correct. Keep it. Do not convert the $4.99/3-decks add-on into a subscription.**

- `[EVIDENCE]` Infrequent usage is the #2 stated cancellation reason across 3M cancellation sessions and is *growing* (27.1% → 30.6%). A recurring monthly subscription for a tool used in March and October is a poor fit by construction.
- `[JUDGEMENT]` The structural advantage of a term is that it **expires without a cancellation event.** No "why am I paying for this in July" moment, no churn statistic, no cancellation flow to build. Frame it as a *term* in all copy — never as a subscription.
- `[EVIDENCE]` The $4.99/3-decks add-on is already per-artifact credit pricing and matches bursty project-based demand.
- `[EVIDENCE — honesty flag]` The "credits beat subscriptions under bursty demand" claim has **essentially no evidence base**. A dedicated search for academic or experimental work returned only vendor content marketing from billing companies (Flexprice, Lago, Tangle, Freemius, Apiable) with a direct commercial interest in usage-based billing. The assertion is plausible and internally consistent across sources but has no cited study, sample, or experiment behind it anywhere. Keep the credits because the instinct is good and the cost of keeping them is zero, not because the literature supports it.
- `[JUDGEMENT]` Time the deck add-on's promotion to March-April. `[EVIDENCE]` Thesis-defence deadlines cluster there (WMU Apr 17, U. Miami defend-by Mar 27, CU Boulder Apr 12), and the already-measured "how many slides for 10 minute presentation" keyword (480/mo, KD 0) is defence-shaped, not poster-shaped.

### What to meter: the export, never the clock

**Free = unlimited editing + one full-resolution/print-ready export per term. Paid = additional exports + decks.**

- `[EVIDENCE]` The Frontiers RCT (n=680,588) identified **demand saturation** — users fulfilling their need during the free window — as an offsetting negative force, and found creative/exploratory features showed cannibalization risk from longer exposure.
- `[JUDGEMENT]` A poster is the extreme demand-saturation case: one artifact, one date. A user who finishes their poster inside any time-limited free window has permanently zero reason to pay. **This is the single strongest argument in the entire research set for metering the artifact rather than the clock**, and it rules out the 14-day trial that 62% of products use.
- `[EVIDENCE]` Runge, Wagner, Claussen & Klapper (~300,000 users, randomized across three freemium schemes) found reducing free features increased **both** conversion and viral activity. Operators were documented as "overly optimistic about positive externalities from usage and viral activity" and therefore "give too much of their product away for free." This is the only randomized test of the generous-free-tier-buys-word-of-mouth belief, and it found it false.
- `[JUDGEMENT — dissent from the research]` Postr's audience is not that study's population. Psychology and medicine grad students on stipends, in a tightly-connected campus environment where word-of-mouth *is* the distribution plan, can generate active resentment at a tool that over-meters. **Meter the second export. Never the first.** Editing stays free forever because that is where time-to-value lives.
- `[EVIDENCE]` The chart chooser and readability checker sit **outside the meter permanently** — this is a commitment to the librarians in Move #3, and breaking it costs the backlinks.

### The gate: ungated build, account at export

- `[EVIDENCE]` ChartMogul/Growth Unhinged 2026 (200 B2B products) models per 1,000 visitors: ungated freemium (usable before account creation) yields 70 signups → 5.6 paying, beating standard free trial's 45 → 3.6. 38% of freemium products now allow usage before signup. **Correlational, self-reported survey medians, not an experiment.**
- `[JUDGEMENT]` This also happens to place the ask at the moment the value is visible on screen, which is the right place on first principles regardless of what the survey says.
- `[EVIDENCE]` The existing anonymous-first Supabase auth pattern already covers most of the implementation. This is a merge-on-signup path, not new architecture.
- `[EVIDENCE]` Explicitly do **not** adopt an upfront paywall on the strength of the "5.5x better" claim — it traces to a vendor (PaywallPro) selling paywall-screenshot databases, from an undisclosed observational scrape of 1,240 apps with no controls. Apps that dare put a paywall upfront are disproportionately those with strong pre-existing brand — pure selection.
- `[EVIDENCE]` Do **not** require a credit card. The 30%-conversion figure is real in the ChartMogul data but the same report shows card-required produces only 35 signups per 1,000 visitors vs 90 for freemium. It selects; it does not persuade. Postr's binding constraint is reach at a ~$0.71 CAC ceiling — trading 60% of the funnel for a better-looking percentage is backwards.
- **Metric discipline `[EVIDENCE]`:** report conversion as **paying-users-per-visitor**, never as trial-to-paid percentage, or the metric will lie.

### The activation moment

**Candidate: first successful export within 7 days of first visit.**

- `[JUDGEMENT]` It is the moment the user holds the artifact they came for, and it is downstream of every step in the workflow.
- `[EVIDENCE — critical caveat]` The standard "find your aha moment" method is **correlational by construction**, and no peer-reviewed validation of it was found. Even Lenny Rachitsky's own widely-circulated framework is explicit that steps 1-2 produce only correlation and that structured experimentation is required for causality. The failure mode here is mechanical: users who export are users who *had a poster to make*, so exporting predicts retention partly because motivated users both export and return.
- `[EVIDENCE]` Do not copy thresholds by analogy. Slack's 2,000 messages measures *team* value under network effects and has no analogue in a single-author poster tool.
- **The actual test `[JUDGEMENT]`:** does an intervention that *raises* export rate also raise return-in-next-season rate? If pushing more people to export doesn't move seasonal return, the metric is a bystander, not a lever.
- **Implementation note `[EVIDENCE]`:** this runs against the standing no-analytics/no-cookies decision. It needs first-party server-side counting, not PostHog or GA4.
- **Danger `[EVIDENCE]`:** optimizing a correlational metric can actively mislead. Chasing "exports" could push toward nagging prompts that raise the number while degrading the experience for deliberately non-tech-savvy users.

---

## 3. Calendar

Verified dates are primary-source from society or university websites. Inferred entries are marked and should not be treated as facts in any copy.

| Month | Action | Trigger / basis | Status |
|---|---|---|---|
| **Jan** | Seasonal email #1 (ahead of spring wave); ACNP meeting; ASCO abstract deadline Jan 27 | ASCO deadline **verified**; ACNP January meeting **verified** | Email timing is `[JUDGEMENT]` |
| **Jan** | Spring-semester LibGuide outreach batch | "Librarians refresh at semester start" | **INFERRED — month not established.** Ask librarians directly |
| **Feb** | Late Feb: **flyer print run #1** to undergrad research offices + psych/med buildings | Undergrad abstract deadlines mid-late March: Illinois Mar 13, UVA Mar 24, William Paterson Mar 27, Penn State Mar 30, NC State Mar 30 — all **verified** | Deadlines verified; 2-week flyer lead is `[JUDGEMENT]` |
| **Feb** | SPSP convention cycle (~Feb) | SPSP publishes annual poster-presenter guidance — **verified it exists** | Partnership precedent **not verified** |
| **Mar** | Peak. Sustain flyers. Deck add-on promotion begins | Symposium abstract deadlines cluster here (see Feb row); thesis-defence deadlines: U. Miami defend-by Mar 27 **verified** | Verified |
| **Apr** | **Densest month of the year.** Peak flyer + Instagram window | Four independent demand streams collide: symposia Apr 1-30 (FSU Apr 1, Penn State Apr 2-9, UVA Apr 24, NC State Apr 28-29, Illinois Apr 30) + defences (WMU Apr 17, CU Boulder Apr 12) + NCUR 2027 Apr 12-14 + AAN Apr 18-22 2027 — **all verified** | Verified. "Four streams collide" framing is `[JUDGEMENT]` |
| **May** | Quiet. SEO content-building, not pushes. APS meets May 27-30 2027 | APS dates **verified**; "quiet" is `[JUDGEMENT]` from absence of notification dates | Mixed |
| **Jun** | APHA notifies **Jun 2** for Nov 1-4 meeting — a discrete, emailable cohort. Seasonal email #2 late Jun | APHA dates **verified** | Verified |
| **Jun-Jul** | Possible real LibGuide maintenance window | Emory documents **summer** broken-link projects | **INFERRED** — this may be the true window, not August |
| **Jul** | Late Jul: **flyer print run #2**. Ensure attribution mark is shipped | Ahead of early-Aug acceptance wave | `[JUDGEMENT]` |
| **Aug** | **Second-biggest push.** SfN acceptances early Aug (meeting Nov 14-18); AHA acceptance status mid-Aug (meeting Nov 6-9). ACNP deadline Aug 27. RSNA cutting-edge deadline Aug 5. APA meets Aug 12-15 2027 | All **verified** from society sites | Verified |
| **Aug** | Pre-fall LibGuide outreach batch | Semester-start refresh | **INFERRED — month not established** |
| **Sep** | Small top-up push. SfN late-breaking Sep 8-15; RSNA cutting-edge notifications mid-Sept; AAN submissions open Aug 27 | **Verified** | Verified |
| **Oct** | ACNP notifies in October for its January meeting; AAN abstract deadline Oct 13 | **Verified** | Verified |
| **Nov** | **PRESENCE month, not push.** No flyer spend. APHA Nov 1-4, AHA Nov 6-9, SfN Nov 14-18, RSNA Nov 29-Dec 3 | Meeting dates **verified**; "the making already happened" follows from the June-Sept notification dates | Dates verified; the do-not-push conclusion is `[JUDGEMENT]` |
| **Dec** | Nothing. RSNA runs to Dec 3 | `[JUDGEMENT]` | — |

**Two structural facts from this calendar:**

1. `[EVIDENCE]` **The trigger is the acceptance-notification date, not the abstract deadline and not the conference date.** Poster-making demand begins the day the acceptance email lands. Measured lead times: SfN ~14 weeks, AHA ~12, APHA ~22, RSNA ~10, ACNP ~13. Modal window is 10-14 weeks. `[EVIDENCE]` APHA's gap between abstract deadline (Mar 31) and notification (Jun 2) is two months — anchoring to the deadline hits users who don't yet know if they need a poster.

2. `[UNVERIFIED]` The claim that poster work compresses into the final 1-3 weeks before travel is **inferred from ordinary procrastination behaviour and is not evidenced anywhere in the research.** If demand is actually spread evenly across the 12-week window, a late second push wastes effort. Cheap to test once there's any traffic: measure days-between-signup-and-conference-date.

**Maintenance `[EVIDENCE]`:** society dates shift year to year. Re-verify each date annually from the primary source. Do not let a 2026 date silently become a 2028 assumption. **Every date here is US.** Non-US conferences and academic calendars were not checked and the March-April symposium and spring-defence patterns are tied to the US academic year.

---

## 4. Kill List

### Violates the zero-budget or solo-operator constraint

| Don't | Why |
|---|---|
| **Pursue institutional/site licensing as an acquisition channel** | `[EVIDENCE]` UMich DS-20, UT Austin ISO, and CU Anschutz all document the same pipeline: HECVAT, VPAT accessibility documentation, FERPA School Official acknowledgement, 10-15 business days *minimum* per CU Denver for a responsive vendor with documents already prepared. `[EVIDENCE]` BioRender reached institutional deals (Western 230 seats, MSU $138.22/user/yr, Caltech named-user) only *after* bottom-up lab adoption. Overleaf literally hands users a "request for service letter" to lobby their own department head — they harvest, they don't sell. Irrelevant below ~50 MAU anyway. Keep Postr in the "free tool a student uses on their own laptop" category, which triggers no review at all. |
| **Formal student ambassador program** | `[EVIDENCE]` Canva's Campus Canvassadors launched long after Canva was worth billions and prioritizes campuses that already hold Canva for Campus licenses; compensation is Pro licenses, community *funds*, and affiliate access. Notion Campus Leaders requires event funding and swag. No counterexample found of a pre-traffic tool bootstrapping this way. `[JUDGEMENT]` Ambassador programs have a strong appeal-to-vanity pull — they feel like leverage and produce visible activity while generating almost no signups at small scale. |
| **Paid advertising in society newsletters** | `[EVIDENCE]` No published rates findable for the student-facing APS/SPSP outlets, and any realistic rate blows through the $0.71 CAC ceiling. Pursue contributed content and free resource-page listings instead — student-run publications are chronically short of content. |
| **Any paid channel at all** | `[EVIDENCE]` Modelled CAC ceiling of ~$0.71 per free signup rules out essentially all paid acquisition. `[EVIDENCE]` This is less of a handicap than it looks: the ChartMogul data shows organic search/referral/social/LLM traffic converting highest and paid converting lowest — though `[JUDGEMENT]` note this is confounded by intent, not evidence that the channel causes conversion. |

### Low-yield per the research

| Don't | Why |
|---|---|
| **Build an X/Twitter strategy for medicine** | `[EVIDENCE]` Study of 300,000 academic users (276,434 linked to bibliometric data): only **13.3%** of Medicine & Health academics migrated to Bluesky. And the pre-2023 X reach that made Morrison's video viral no longer exists either. Neither platform works for that discipline. |
| **Use a fresh Bluesky account as a broadcast channel** | `[EVIDENCE]` Same study: retention is predicted by *rebuilding prior network* — every 10pp of reconstructed Twitter network bought ~1 extra active month. A zero-network account gets essentially no distribution regardless of posting frequency. `[EVIDENCE]` Psychology did move at ~26.8% (vs Arts/Humanities 31.3%), so if posting at all, use Bluesky for psychology only, participate rather than broadcast, and budget 20 min/day as a habit — not a channel with a plan. |
| **ResearchGate and Academia.edu** | `[EVIDENCE]` Repository and citation-signalling platforms, not discovery surfaces. No evidence any tool acquired users there, no partnership surface. ResearchGate's standing has eroded via the MDPI deal and settled litigation with Elsevier (Germany) and ACS (US). Nobody browses ResearchGate looking for a poster tool. |
| **Drop links in large open academic Discords** | `[EVIDENCE]` Psychology Den reports 35,197 members but describes itself as spanning "professionals, students and laypeople" — the grad-student fraction is unknown and likely small. The plausible-looking scale number is misleading. The valuable servers are the closed program-level ones, unreachable by definition. |
| **Self-promotional posting on r/GradSchool, r/labrats, r/psychology, r/medicalschool without history** | `[EVIDENCE]` Subreddit-delegated rules, widespread 90/10 participation-to-promotion norms, and mod-approval requirements. A ban is effectively permanent in exactly the communities with the best audience fit. `[JUDGEMENT]` The viable version: read each sidebar manually, build genuine comment history for 4-8 weeks answering poster/figure questions, then link the *free standalone tools*, never the signup page. Ask modmail permission before any "I built a free thing" post. |
| **Cold-email departmental listserv owners or grad student association officers** | `[EVIDENCE]` Single moderated gatekeeper who bears the reputational cost of forwarding a vendor pitch. `[JUDGEMENT]` The channel is real but only opens through an existing member forwarding. **The substitute:** after someone finishes a poster, ask whether their department has a grad listserv, and give them a ready-to-paste 3-sentence blurb so forwarding costs 30 seconds. One forward into a 200-person psychology department during February is worth more than a month of social posting. |
| **Cold outreach to research methods instructors / stats TAs** | `[EVIDENCE]` The instructional-technology literature (weak, correlational, not poster-specific) says adoption spreads peer-to-peer among instructors via informal communities, not vendor-to-instructor. `[JUDGEMENT]` Build a receive-well "for instructors" page instead — copy-pasteable assignment brief, a link that works without accounts, and an explicit statement that no student data is collected, which pre-empts the FERPA question that otherwise kills classroom use. Low cost, genuinely low expected yield, zero outbound effort. |

### Conversion / pricing traps

| Don't | Why |
|---|---|
| **Require a credit card for trial** | `[EVIDENCE]` Cuts signups from ~90 to ~35 per 1,000 visitors. The 30% figure is selection, not persuasion. |
| **Adopt an upfront paywall on the "5.5x" claim** | `[EVIDENCE]` Vendor marketing (PaywallPro), undisclosed method, no controls, selection-biased sample of 1,240 apps. |
| **Time-limited free trial (14 days or any length)** | `[EVIDENCE]` The Frontiers RCT's demand-saturation mechanism means a user who finishes their poster inside a free window has permanently zero reason to pay. Meter the artifact, not the clock. |
| **Convert the $4.99/3-decks add-on into a monthly subscription** | `[EVIDENCE]` Infrequent usage is the #2 cancellation reason across 3M sessions and rising. Per-artifact pricing already matches bursty demand. |
| **Build a cancellation / pause / win-back-offer flow** | `[EVIDENCE]` These exist to fight monthly-subscription churn. A 4-month term that expires generates no cancellation event to save. Engineering against a problem the pricing model already solves. |
| **Make "remove the watermark" the primary paid benefit** | `[EVIDENCE]` Sets the growth loop in direct opposition to revenue, and charging broke grad students $19 to delete a logo reads badly to an audience that talks to each other. |
| **Discount-led seasonal re-engagement** | `[EVIDENCE]` The RCT found longer-exposure users respond better to *feature* promotions; discounts worked better on shorter-exposure users. Discounting a $19 term erodes a margin that is currently fine while training price sensitivity. |
| **Wait for statistically significant A/B tests before deciding pricing or onboarding** | `[EVIDENCE]` Onboarding tests need ~500-1,000 exposures per variant. At ~50 MAU break-even Postr will not reach that for a long time. `[JUDGEMENT]` Do not burn the first year waiting for significance that cannot arrive — decide from judgement and qualitative interviews with psychology/medicine grad students. |
| **Believe a generous free tier buys word-of-mouth** | `[EVIDENCE]` The only randomized test (Runge et al., ~300k users) found the opposite. Operators in that study were specifically documented as wrong about this. |
| **Copy "aha moment" thresholds from famous products** | `[EVIDENCE]` Correlational artifacts of each product's specific network structure. Slack's 2,000 messages measures team value under network effects. Deriving Postr's activation metric by analogy produces a number that predicts nothing. |

### Copy and framing violations

| Don't | Why |
|---|---|
| **Mention AI anywhere in marketing copy** | House constraint. Name the workflow, not the capability. "Check your figure is readable from six feet," not "AI figure analysis." Applies to flyers, LibGuide pitch emails, micro-tool landing pages, seasonal emails, and the for-instructors page. |
| **State "librarians refresh LibGuides in late August and early January" as fact** | `[EVIDENCE]` Two targeted searches failed to find a source. Emory's documented summer broken-link projects actively suggest June-July. |
| **Invent or cite Google Trends seasonality for poster/presentation terms** | `[EVIDENCE]` A dedicated search returned nothing on-topic. The three measured keyword volumes are annual averages with no monthly breakdown. Presenting a fabricated seasonal curve would corrupt the timing logic of the whole calendar. |
| **Cite consumer word-of-mouth statistics ("83-88% trust recommendations")** | `[EVIDENCE]` Every such figure traces to referral-software vendors (Buyapowa, Ambassador, Tremendous) surveying consumers. The actual academic TAM literature is equivocal, with subjective norm showing **non-significant** effects in some studies — including medical technology adoption specifically, one of Postr's two target disciplines. |
| **Claim endorsement by Morrison, MIT, or any library that lists Postr** | `[JUDGEMENT]` A listing is not an endorsement, and an academic audience will punish the overclaim harder than it rewards the credibility. |
| **Treat a Hacker News hit as the target channel** | `[EVIDENCE]` It demonstrably worked for Overleaf — but LaTeX users are developers. Postr's audience is deliberately non-technical. An HN spike delivers people who will never present a poster, inflating signups and depressing every downstream metric. `[JUDGEMENT]` Worth one well-prepared attempt as a secondary traffic spike; not worth reading as product-market fit. |
| **Build a "conference abstract deadline calendar" page on spec** | `[EVIDENCE]` The research flags this as its own weakest finding — feasibility is proven (the dates were assembled in ~a dozen searches) but the claim that it attracts traffic is **unverified speculation** with no keyword volume measured. `[EVIDENCE]` Stale dates would damage credibility with a precision-minded audience far more than having no page. Measure search volume for "SfN abstract deadline"-type queries first. Only build if volume justifies the recurring annual maintenance. |

---

## 5. Honesty: What Is Actually Uncertain

### Postr has zero conversion data. These recommendations are therefore provisional.

Everything in Section 2 about *what to meter* and *where to gate* is reasoned from studies conducted on other populations — a 300k-user software app, a 680k-user image-editing SaaS, 200 B2B products with $50-249 ARPU and sales teams. **Postr is in none of those populations.** The mechanisms (demand saturation, selection vs. persuasion, term-vs-subscription fit) transfer better than the magnitudes, and I have tried to lean only on mechanisms. But every specific number — one free export, $19, two emails a year — is judgement dressed in evidence's clothing. Revisit all of it after the first 50 real users.

### Rests on vendor marketing, not evidence

- **"Credits beat subscriptions for bursty demand."** `[UNVERIFIED]` No academic or experimental work exists. Every source is a billing company selling usage-based billing. The $4.99/3-decks decision is being kept on instinct plus zero switching cost — not on evidence.
- **"Upfront paywalls convert 5.5x better."** `[UNVERIFIED]` PaywallPro, undisclosed scrape, no controls, direct commercial interest. Ignored.
- **Win-back reactivation benchmarks (5-10% for 90+ day inactive).** `[UNVERIFIED]` Klaviyo, Braze, Sender, ActiveCampaign blogs with no stated samples. The *timing* logic is kept; the numbers are discarded.
- **Consumer word-of-mouth trust statistics.** `[UNVERIFIED]` Referral-software vendors surveying consumers, not academics.
- **"5-15% reply rate on cold librarian email."** `[UNVERIFIED]` No source cited anywhere in the research. Assume worse.
- **The "aha moment" method itself.** `[UNVERIFIED]` All substantive sources are vendor blogs (Amplitude, Intercom, Appcues, LogRocket) plus one widely-circulated newsletter framework. No peer-reviewed validation found. To its credit, that framework is itself explicit that its first two steps produce only correlation.

### Correlational where a causal read would be tempting

- **"Organic converts better than paid."** `[EVIDENCE, but confounded]` Heavily confounded by intent. Someone searching "scientific poster template" has already decided they need one; an ad interrupts someone who hasn't. The correct conclusion is **"high-intent visitors convert,"** not "organic is a better channel." The Webflow "ChatGPT traffic converts at 24%" figure is a single self-reported data point.
- **The ChartMogul funnel model.** `[EVIDENCE, but weak]` Self-reported survey medians across dissimilar B2B products, modelled per 1,000 visitors — not an experiment. Used here for direction (ungated > gated on signups) and not for magnitude.
- **BioRender's 4M users / 500k citations.** `[EVIDENCE, but self-serving]` Company-reported absolute numbers. The *licensing mechanism* is independently verifiable in their help docs; the scale is not.
- **The Deng/Lambrecht 8.9% spillover.** `[EVIDENCE]` Genuinely causal via a credible natural experiment, but the setting is mobile games with strong within-store discovery dynamics Postr lacks, and "ratings" is a proxy for demand. 8.9% is meaningful, not transformative.
- **BioRender's growth ordering (bottom-up before institutional).** `[JUDGEMENT]` Inferred from licensing design, not from any disclosed company history. No public account of BioRender's early tactics was found. Also note BioRender was YC-backed and venture-funded, and the founder arrived with a decade as National Geographic's lead medical illustrator plus an existing illustration firm supplying inbound demand. The copyable part is narrowly the attribution loop — not the funding, the team, or the pre-existing distribution.

### Inferences of mine, clearly flagged

- The "four independent demand streams collide in April" framing is my reading of verified dates, not a cited claim.
- "Psychology and medicine have opposite seasonal rhythms" — the dates are verified; the framing is interpretation.
- "November is worthless for acquisition" follows logically from the June-September notification dates but was never directly measured.
- "Poster work compresses into the last 1-3 weeks" is pure inference from ordinary procrastination behaviour. It is the weakest link in the calendar's second-push logic.
- "The Morrison precedent still works without a viral spike" — the artifact strategy plausibly works through the librarian and word-of-mouth channels alone, but Morrison had pre-2023 Twitter reach that no longer exists, and I would not plan on the spike.
- The whole psych/med flyer split may be over-engineering for a product with zero traffic. `[JUDGEMENT]` If bandwidth is tight, drop it.

### Cheap things to measure before committing more effort

Ordered by cost-to-resolve:

1. **Google Trends, 3 keywords, 5-year window, ~10 minutes, free.** Pull "research poster examples," "scientific poster template," "how many slides for 10 minute presentation." Separates real recurring seasonality from one-off spikes. `[EVIDENCE]` If search seasonality lags the conference calendar — people search when *making* the poster, not when accepted — the August push timing needs shifting later. Worth checking before committing to it.
2. **Ask 5-10 psych/med subject librarians when they actually refresh their guides. ~1 hour, free.** Converts the single largest unverified assumption in the calendar into first-party fact, and doubles as the first outreach batch.
3. **Search volume for "SfN abstract deadline"-type queries. ~20 minutes.** Decides whether the deadline-calendar page is worth its recurring annual maintenance. Do not build on speculation.
4. **Retrieve the Kramer & Bosman "101 Innovations" open dataset (F1000Research 5:692). ~2 hours, free.** `[EVIDENCE]` n=20,663 across 7 languages, filterable by discipline and career stage — the largest dataset on researcher tool usage. The research line hit HTTP 403 fetching it and could **not** extract any discovery-channel statistic, so nothing in this document rests on it. `[EVIDENCE]` Caveat: 2015-16 data, so discipline-level patterns may hold while specific tools do not.
5. **Once there is any traffic: days-between-signup-and-conference-date.** Tests the unverified 1-3-week compression claim that the second seasonal push depends on.
6. **Once there is any traffic: does raising export rate raise seasonal return?** The only honest validation of the activation metric.

### One thing that would change the plan

`[JUDGEMENT]` If the binding constraint ever flips from **reach** to **monetization** — meaningful traffic, poor conversion — several kills reverse. Card-required trials, tighter metering, and institutional licensing all become defensible at volume. Nothing in this document is a permanent commitment except the promise that the chart chooser and readability checker stay free, which is load-bearing for the librarian channel and cannot be walked back without cost.
