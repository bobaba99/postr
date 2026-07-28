# Blog & content plan — academic grad-school resources

**Date:** 2026-07-28
**Status:** PLANNED, NOT BUILT. Read-and-approve.
**Owner:** Gavin (requested a blog of academic grad-school resources).
**Reconciled with:** `2026-07-26-seo-plan.md`. That plan originally listed
**"A blog"** under *do not build*; it was **amended 2026-07-28** (same
section) to allow a **resource library** — content that passes its
quality tests — while keeping the ban on advice-blog filler. This doc is
that library's plan. The trigger for the amendment was Gavin's shift to
explicit **long-term planning**, where content's compounding search
returns justify the investment. It is also the organic-distribution
answer to "when do I run paid ads"
(`2026-07-28-pricing-and-market-strategy.md` §3): content is the
near-zero-CAC channel a niche academic tool runs *instead* of ads, because
the ad math (allowable CPC ~$0.02–0.17 vs real $0.40–5+) never closes at
a ~$20 LTV.

---

## 1. The tension, and how the blog earns its place

The SEO plan rules out "a blog" for a specific, correct reason:

> "Page one is a wall of `.edu` LibGuides… A zero-authority `.sh` domain
> does not outrank decades of institutional authority on informational
> intent, and AI Overviews take most of the remaining clicks. Every query
> whose best answer is *a paragraph of advice* is lost."

**That verdict stands — for advice-blog content.** A post titled "How to
make a great research poster" cannot beat NYU, Stanford, and Purdue OWL,
and shouldn't be written.

But "a blog" is a *format*, not a content strategy. The SEO plan's own
governing test decides what belongs:

> Every query whose best answer is *a computed value, a spec lookup, a
> filtered gallery, or a working tool* is open.

So the blog is allowed **only** for posts that pass the SEO plan's three
tests (substitution / deletion / one-step): posts carrying a **specific
number, a computed result, a tool, a dataset, or first-hand primary-source
work** that a LibGuide paragraph does not. Generic advice is still banned.

**The reframe:** this is not "a blog," it is a **grad-school resource
library** — each entry a genuine reference artifact, not an opinion piece.
That framing is what makes it survive the SEO plan's deletion test AND
serve the audience Gavin wants to reach.

---

## 2. What the content must be (and must not be)

**Every post must clear all three (from the SEO plan §5):**

1. **Substitution** — can't be produced by swapping variables in another
   post. Each needs its own research/computation/asset.
2. **Deletion** — a specific person is worse off if it vanishes, and you
   can name the question they arrived with.
3. **One-step** — answers something the reader couldn't get from the
   primary source in one click.

**Allowed (passes):** posts anchored to a computed value, a checklist
tool, a real dataset, a primary-source synthesis, or Postr's own product
capability. Structured for AI-Overview extraction (SEO plan): direct
answer in the first ~40 words, specific numbers, question-shaped
H2/H3s, one claim per paragraph.

**Banned (fails):** "How to make a research poster," "Tips for your first
conference," "Why posters matter" — anything whose best form is a
paragraph of advice already owned by `.edu` LibGuides.

---

## 3. Post ideas that pass the test (grad-school resource angle)

Each is a *resource*, not advice. Grouped by the job it does. All titles
provisional; every one carries a specific number, tool, or dataset.

### A. Poster / presentation mechanics (closest to product, highest intent)
- **"Poster font sizes that are actually readable from 6 feet"** — the
  computed table (title/heading/body/caption in pt at common sizes), the
  physics of viewing distance, backed by Postr's readability checker.
  *Number-anchored, tool-backed. Passes.*
- **"How many slides for a 10-minute conference talk"** — already a
  measured keyword (480/mo, KD 0 per the SEO plan). A computed answer
  (words/minute × slide cadence), not advice. Feeds paper→talk.
- **"Conference poster size cheat-sheet: what each society actually
  requires"** — synthesised from primary-source guidelines, links to the
  per-conference pages. Passes because it required reading the PDFs.

### B. Grad-school process resources (the broader "resource library")
- **"Abstract word limits for the top social-science & biology
  conferences"** — a maintained dataset (society, limit, deadline,
  `verifiedOn`). A real table nobody else keeps current. *Passes — dataset.*
- **"A timeline for making a conference poster before the deadline"** — a
  concrete backwards-planning schedule (T-minus days) with a downloadable
  checklist, not "start early." Passes if it ships the actual checklist.
- **"What to put on a poster when your results are null / preliminary"** —
  a genuinely under-served, specific question for the target fields;
  concrete structure, not platitudes. Borderline — must carry specifics.

### C. Field-specific (social science + biology — the target segment)
- **"Reporting stats on a poster: APA vs the space you actually have"** —
  concrete formatting rules + what to cut. Specific to psych/social-sci.
- **"Figure choices for biology posters that survive greyscale printing"**
  — ties to the plot picker + CVD-tested palettes already built. Passes —
  tool-backed and specific.

**The discipline:** if a draft could be summarised as "be clear, start
early, tell a story," it fails and doesn't ship. The bar is a number, a
tool, a dataset, or primary-source work.

---

## 4. How the blog serves the business (why it's worth the time)

The blog is the **organic-distribution engine** the whole $20–30k target
depends on (market-strategy §2: the constraint is reach, not market size):

- **SEO / AI-Overview citation** — the SEO plan's thesis: win the
  low-volume, low-KD informational long-tail by *being the cited source*,
  worth ~120% more clicks when cited. Resource posts are exactly this.
- **Top-of-funnel for the free tier** — a grad student who lands on
  "readable poster font sizes" is one click from the tool that applies it.
  Each post ends with the relevant Postr feature as the natural next step
  (name the workflow, not the capability — `feedback_marketing_no_ai_framing`).
- **The growth loop** — posts are shareable in the exact places the
  audience lives (lab Slacks, academic Bluesky, r/GradSchool,
  r/AskAcademia), which is the word-of-mouth reach that paid ads can't
  buy at this LTV.
- **Backlink earning** — a genuinely useful dataset (abstract limits,
  size cheat-sheet) is the kind of thing `.edu` LibGuides *link to* —
  turning institutional authority from competitor into referrer.

---

## 5. Cadence & operations (proportionate for a solo founder)

- **Quality over frequency.** One genuinely-passes-the-test post a month
  beats weekly filler. The SEO plan's whole point is that padded volume
  is a liability, not an asset.
- **Batch the datasets.** The abstract-limits and size cheat-sheet posts
  share primary-source research with the per-conference SEO pages — write
  them together, once.
- **One re-check per meeting cycle** for any post carrying a
  conference-dependent number (mirrors the SEO plan's `verifiedOn` rule).
- **Start with the 2–3 that double as SEO pages** (font sizes, slides-per-
  talk, size cheat-sheet) — they earn their keep twice.

**Infrastructure:** no CMS. Static MDX/Markdown posts rendered by the
existing Vite app, prerendered like the other static routes (the SEO
plan's prerender covers this). A blog index at `/resources` or `/blog`,
each post a prerendered route with the same JSON-LD / extraction
structure as the rest of the site. **Do not** add a database, comments,
or a tagging system — a solo founder's blog is files, not a platform.

---

## 6. Open questions

1. **`/blog` vs `/resources` vs `/guides`** — "resources" or "guides"
   signals reference-library (the passing kind), "blog" signals
   advice-column (the banned kind). Recommend **`/resources`** — it frames
   the content correctly for both readers and the SEO strategy.
2. **How much overlaps the SEO programmatic pages?** Some posts (font
   sizes, size cheat-sheet) are close to the planned `/poster-size/:size`
   family. Decide per topic: a computed *reference page* (SEO family) vs a
   *narrative resource* (blog) — don't build both for the same query;
   one canonical, per the SEO plan's merge-don't-publish rule.
3. **Who writes them?** They require real subject knowledge (the numbers
   must be right). Gavin-authored, or reviewed. Not auto-generated —
   auto-generated advice is precisely the scaled-content-abuse the SEO
   plan warns against.
