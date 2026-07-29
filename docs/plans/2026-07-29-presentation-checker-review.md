# Presentation Checker (LLM Review) — Design Spec

> **Status:** Design agreed in brainstorming 2026-07-29; spec pending Gavin's review. Next step after review: implementation plan (superpowers:writing-plans).
> **LIVING DOCUMENT — keep open for revision.** This spec is intentionally not frozen at v1. Gavin builds v1 first, validates against himself (§7 Phase 0), then **expands the ground-truth panel to domain experts — professors, grad students, post-docs — for external validation** (§7.6). The architecture is designed *now* so their criteria fold in later without a rewrite (see §2.0 — rubric-as-versioned-config). Revise this doc as the rubric and validation evolve.
> **Author flow:** brainstormed with Gavin 2026-07-29. This is the design; the build order lives in the implementation plan (which front-loads the Section 7 validation spike — see §7).
> **Framing rule (hard):** every user-facing string names the *workflow* ("get feedback on your poster / talk"), never "AI". See `feedback_marketing_no_ai_framing`.

## 0. One-paragraph summary

A standalone **reviewer for research posters and presentations** — Postr's competitive moat. The user submits a poster or talk (a Postr-native poster, or an uploaded **PDF / PPTX / PNG**, including multi-page decks) and gets back a **structured critique**: per-dimension scores (narrative / design / content) on top, and **anchored, clickable fix-cards** underneath. The critique is grounded in a **perceptual-attention pass** (it predicts how a human eye moves across the artifact) and judged against an **economy-first house style** (cut / demote / show-visually over add). It ships as its own product surface at `/presentation-checker`, sold as a standalone **review pack** (parallel to the export pack) and as a **weekly add-on** to the semester subscription. It is **advisory only** in v1 — every recommendation carries a *personalized, content-specific example* of the fix, but the user applies edits by hand.

---

## 1. Scope & shape

### In scope (v1)
- **Inputs (all four at launch):**
  - **Postr-native poster** — richest input: we have both the rendered image *and* the structured `PosterDoc`.
  - **PDF** (single or multi-page).
  - **PPTX** (single or multi-page deck).
  - **PNG / JPG** (flat image, vision-only).
  - **Hard page cap: < 25 pages (max 24).** Rationale: a 15-minute talk is the longest realistic slot (~15 content slides at ~1 min each), plus headroom for title, acknowledgements, references, and extra-plot slides. Over the cap → tell the user and let them trim. **Never silently truncate.**
- **One unified critique** across **narrative + design + content**, produced by a two-stage reasoning flow (perceive → judge; §4).
- **Output:** per-dimension scores + anchored fix-cards with personalized examples (§4).
- **Advisory only** — no auto-mutation of the poster in v1. Each finding shows a concrete, content-specific example of *how* to apply the fix.
- **Monetization:** standalone review pack (own SKU) + weekly add-on to the semester subscription (§5).
- **Public surface:** `/presentation-checker` (one unified page for posters *and* presentations).

### Out of scope (v1 — deliberate YAGNI)
- Applyable / one-click restructuring of the poster (fast-follow once critique quality is trusted).
- A real saliency-model attention stage ("approach #2") — designed as a swappable upgrade (§4), not built now.
- A separate credit-ledger microservice — reuse the existing billing columns/RPC pattern (§5).
- Peer/share-link commenting — that already exists (`poster_comments`) and is a *different* feature. See the naming trap below.

### The three-way "feedback" naming trap (do not conflate)
1. **`poster_comments`** — peer/reviewer feedback on a *shared* poster (humans comment via share link). **Already live.** Not this feature.
2. **`feedback` table** — app bug/feature reports ("Send Feedback" modal). Unrelated.
3. **This feature** — AI critique of the user's own artifact. **Net-new.**

Because "feedback" is overloaded, the **URL, table, and code names use "review" / "checker", never "feedback"** (also the SEO-preferred term — see §8).

---

## 2. Architecture

### 2.0 Durability criterion — the rubric is versioned CONFIG, not hardcoded logic

**The single most important architecture decision for longevity.** The critique's *criteria* — the perception rules, the economy principles, the issue-checklist taxonomy, and the scoring dimensions — must live in a **versioned rubric artifact**, not baked into `prompt.ts` as inline prose or into `enforce.ts` as branchy code. Why: Gavin builds v1 against his own judgment, then later expands the ground-truth panel to **professors / grad students / post-docs** (§7.6). When those experts disagree with the checker, the fix must be **"add/adjust a rubric entry + re-run the frozen corpus,"** never "refactor the critique engine."

Concretely:
- A `review/rubric/` module holds the criteria as **structured, versioned data** (e.g. `rubric.vN.ts` exporting typed rule sets: perception rules, economy rules, the issue taxonomy, dimension definitions + score anchors). Each rule carries an id, the rule text, and its research/expert provenance.
- `prompt.ts` **composes** the system prompt *from* the rubric — it does not contain the criteria itself.
- The **issue-checklist taxonomy is shared** between the rubric and the §7 validation harness (single source of truth), so expert-rating checklists and the checker's `Finding` categories can never drift.
- The rubric version is **stamped into every `poster_reviews` row** (`source_meta.rubric_version`), so any historical review is reproducible and agreement metrics are always tied to a known rubric.
- Adding an expert-derived criterion = a new rubric entry (+ optional new `action`/checklist enum value) + re-running the frozen 20-corpus to confirm it didn't regress. No engine change.

This is the seam that makes §7.6 (expert validation) a *config change*, and keeps this document a living spec.

### 2.1 Reuse map

The vision-critique loop is *almost free* — most plumbing already exists. New work is concentrated in five areas.

```
apps/web (client)
  └─ /presentation-checker page + ReviewPanel (sidebar tab 'review')
  └─ review/ingest/ : normalize any input → NormalizedArtifact
        { pages: PageImage[], posterDoc?: PosterDoc, meta }
                                            │  postJson('/api/review/critique', …, {auth:true})
apps/api (Express proxy on Render)          ▼
  └─ NEW createReviewRouter → /api/review/*
        requireAuth ─ rateLimit ─ creditCheck ─ imageUrlGuard(SSRF)
        ├─ /api/review/critique      (initial + follow-up)
        └─ /api/review/render-pptx   (server-side PPTX → page images)
      review/ module  (mirrors the existing narrative/ module shape)
        ├─ config.ts    model id isolated (Claude Sonnet 4.5 vision — already wired)
        ├─ prompt.ts    perception-pass rubric + economy rubric + tool schema
        ├─ critique.ts  forced tool-use → structured JSON → Zod validate
        └─ enforce.ts   dedupe/clamp cards, resolve anchors (deterministic)
Supabase
  └─ NEW poster_reviews table (RLS owner-only)
  └─ NEW users.review_credits column + guard-trigger extension
  └─ NEW consume_review_credit(uuid) RPC (service_role only)
  └─ reuse poster-assets bucket + signed URLs (needs a HIGHER-RES capture variant)
```

### Reused unchanged
- Express proxy (`apps/api`), keys server-side only.
- `requireAuth(getSupabaseAdmin)` — Supabase JWT verification, anon-aware, `{requirePermanent}` gate.
- `createRateLimiter({maxPerWindow, maxPerDay})` — extended with a **7-day rolling window** for the subscription add-on quota.
- `apiClient.postJson(path, body, {auth:true})` — JWT-attaching client wrapper, typed `ApiError` w/ `retryAfterSec`.
- **Forced tool-use + Zod** structured-output pattern (from `import.ts` / `narrative/`).
- `imageUrlGuard` SSRF allowlist — the `poster-assets` Storage host is exactly what it permits.
- The **whole `narrative/` module shape** (`config` / `prompt` / `critique` / `enforce`) as the template.
- Billing: **server-owned columns on `public.users` + `guard_billing_columns()` trigger + `consume_*_credit` RPC** pattern (verified against `20260728120000_billing_plan.sql` and `20260728140000_consume_export_credit.sql`).
- Sidebar **click-jump-to-block** pattern (`PosterIssue.blockId` in `Sidebar.tsx`) — the checker's anchored cards reuse it.

### Genuinely new (the five build areas)
1. **Ingest / normalization layer** (§3) — the biggest net-new piece; PPTX is the fiddly part.
2. **Higher-res poster capture** — current thumbnail is 400px (too small to read poster text).
3. **`review/` proxy module** — config / prompt / critique / enforce, **+ the versioned `review/rubric/` criteria module** (§2.0) that `prompt.ts` composes from.
4. **`poster_reviews` table + `review_credits` column + `consume_review_credit` RPC + guard-trigger extension.**
5. **Review UI surface** — `/presentation-checker` page + `ReviewPanel` sidebar tab, scored summary + anchored cards.

### Model
- v1: **Claude Sonnet 4.5 vision** (already wired for structured tool-use in `import.ts`). Model id isolated in `review/config.ts` so a swap is config-only.
- **No streaming** anywhere (consistent with existing routes).

---

## 3. Ingest & normalization layer

**Goal:** every input becomes the same thing — one or more **high-res rendered page images**, plus an optional **`PosterDoc`** (present only for Postr-native posters).

| Input | Normalization | Where it runs |
|---|---|---|
| **Postr poster** | Reuse the capture path, **higher-res variant** (not the 400px thumb). Upload to `poster-assets`, mint signed URL. Ship the `PosterDoc` too. | client |
| **PNG / JPG** | Validate, downscale to the model's max useful resolution, upload. | client |
| **PDF** | `pdf.js` → render each page to canvas → JPEG. Multi-page → array. | client |
| **PPTX** | Parse/convert to page images (LibreOffice headless `--convert-to pdf` then rasterize, or hosted convert). | **server** (`/api/review/render-pptx`) |

**The one architecture fork — where PPTX renders.** PDF/PNG/Postr render fine client-side (no new backend). PPTX has no clean browser renderer; faithful rendering needs a server step. Decision: **client-side for PNG/PDF/Postr, server-side for PPTX** — keeps the common paths zero-backend and contains the messy dependency to one route.

**Module shape:** `apps/web/src/review/ingest/` — one file per source (`fromPoster.ts`, `fromPdf.ts`, `fromImage.ts`) behind a common:
```ts
normalizeInput(input): Promise<NormalizedArtifact>
// NormalizedArtifact = { pages: PageImage[]; posterDoc?: PosterDoc; meta: IngestMeta }
```
`fromPptx` calls the new `/api/review/render-pptx` route and returns the same shape.

**Deterministic guards (pre-model, no credit charged on failure):**
- **Page cap** — ≤ 24 pages/slides; over → typed error → user message, let them trim.
- **Resolution ceiling** per image (vision models have a useful-pixel limit; oversized = wasted tokens).
- **File-size / MIME allowlist** on upload; the server-side re-fetch still passes through `imageUrlGuard`.
- **Corrupt / empty / renders-to-blank** → typed error → generic user message ("We couldn't read that file"). No credit consumed.

---

## 4. The critique (the moat)

The critique runs **two ordered stages inside one structured call** (v1). The ordering *is* the differentiator: **perceive first, then judge against intent.** Both stages are governed by the **economy principle** (see §4.3).

### 4.1 Stage 1 — Perceptual-attention pass (free-viewing simulation)

Before any judgment, the model describes *how a first-time viewer's eye would actually move* across the artifact, grounded in the **perception rules from the versioned `review/rubric/` module** (§2.0; research citations in §9), which `prompt.ts` composes into the system prompt:

- **Entry point & salience hotspots** — what grabs the eye first. Figures/plots capture attention fastest and most; *but* on text-heavy layouts the headline can be the entry point, and center-placed content dominates. Predict the *actual* first fixation, don't assume figure-first.
- **Faces / social cues** — flag any face / photo / social icon as a strong attention magnet that pulls gaze regardless of layout intent (faces are fixated with >80% probability within the first two fixations, and override low-level saliency).
- **Emphasis load** — assess salient elements (bold, color, size jumps). The failure mode is **over-emphasis competition** ("everything emphasized ⇒ nothing is"), a *dose* effect — **not** "you used bold."
- **Predicted reading path** — the likely scan order across sections.

### 4.2 Stage 2 — Judge the predicted flow against the intended message

Now the model has both the predicted attention flow (Stage 1) *and* the intended hierarchy (from `PosterDoc` headings, or inferred from a deck's structure). It judges the gap:

- Does the eye land on the **key result** early, or does a decorative figure hijack it?
- Is the **narrative** (hook → question → method → result → takeaway) recoverable from the predicted scan path?
- Does each **figure connect to its explaining text** (the text↔figure integration finding — a *narrative* dimension, not just design)?
- **Content**: audience-appropriate jargon, claims vs. evidence, section balance, readability-at-distance.

### 4.3 The economy principle — the core lens for BOTH stages

The critique's default posture is **"what can be removed or shown instead of told,"** not "what's missing." This inverts the usual AI instinct to add. Encoded rules:

- **Economy is the top-level lens.** Save space for the take-away message and the important plots.
- **Plots/tables carry the story; prose explains only what the visual can't.** Flag detailed text that merely narrates what a figure already shows → recommend cutting it.
- **Visual emphasis replaces text.** Circles, highlight, gray/shadow to emphasize/de-emphasize are *space-saving* devices — suggest them to reduce text (subject to the emphasis-dose limit from Stage 1).
- **One take-away message per slide/section** — but *subordinate* to economy. The core result gets the space; everything else is mentioned only when necessary.
- **Forced prioritization is a first-class output (don't cop out).** When two elements are both "important" (e.g. two tables), the reviewer **must** pick one as primary and recommend the other be (a) summarized in-text or (b) **demoted to supplementary/appendix** ("available if someone asks about the details"). It must say so explicitly. Ranking under a space budget *is* the job.

**Through-line:** predict where the eye goes → judge whether it lands on the core result → and the fix is almost always **cut / demote / show-visually**, rarely add.

### 4.4 Deterministic grounding fed into the prompt

Even in v1's single call, a few hard numbers are passed alongside the image so the model can't misjudge them — e.g. **emphasis-run count** and **figure-to-text ratio** derived from the `PosterDoc` (reusing the `readability.ts` parsing pattern). Small build, big reliability win; also the natural on-ramp to approach #2.

### 4.5 Output contract (forced tool-use → Zod)

```ts
CritiqueResult = {
  dimensionScores: { narrative: number; design: number; content: number }; // 1–5
  attentionSummary: string;         // Stage-1 predicted gaze path / hotspots, in prose
  prioritization?: string;          // "both tables strong; Table 1 lands the core result, demote Table 2"
  findings: Finding[];
}

Finding = {
  dimension: 'narrative' | 'design' | 'content';
  severity: 'high' | 'medium' | 'low';
  anchor: Anchor;                   // block id / region / slide index (see below)
  action: 'cut' | 'demote-to-appendix' | 'show-visually' | 'condense'
        | 'keep-as-primary' | 'add';    // 'add' is explicitly the rare case
  problem: string;                  // the economy / attention-mismatch issue
  fix: string;                      // the concrete recommendation
  example: string;                  // PERSONALIZED, content-specific: the actual rewritten
                                    //   line; the exact rows to gray; the specific point to
                                    //   circle — drawn from THEIR content, never a template
  tradeoff?: string;                // for prioritization calls
}

Anchor =
  | { kind: 'block'; blockId: string }      // Postr-native: click-jumps to the block
  | { kind: 'region'; page: number; bbox: [number,number,number,number] } // uploads
  | { kind: 'slide'; page: number };
```

- The **`action` enum encodes the economy bias into the schema itself** — dominated by cut/demote/show-visually; `add` is marked rare, so the model is nudged away from spraying "add more context."
- **`example` is required and must reference the user's actual content** (enforced in the system prompt) — that personalized illustration *is* the value in an advisory-only feature.
- `enforce.ts` (deterministic): dedupes findings, clamps counts, drops any finding whose `anchor` doesn't resolve, and validates the `action` distribution isn't degenerate.

### 4.6 Upgrade path to approach #2 (designed-in, not built)

Stage 1 is a **named, isolated stage**. When a real saliency model is warranted later, replace "model *describes* the attention pass" with "saliency model *computes* an attention map → fed into Stage 2." Stage 2's judge prompt barely changes. The seam exists now; the upgrade is a stage-replacement, not a rewrite. (Caveat to respect at upgrade time: bottom-up saliency poorly predicts attention during *task-based* viewing, so the pass must stay framed as free-viewing/first-impression and be paired with the structured doc to infer intent.)

---

## 5. Data model + credit / follow-up state machine

### 5.1 `poster_reviews` table (RLS: owner-only)

```sql
create table public.poster_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  poster_id         uuid references public.posters(id) on delete set null, -- null for uploads
  source_kind       text not null check (source_kind in ('postr','pdf','pptx','image')),
  source_meta       jsonb not null default '{}'::jsonb,   -- filename, page count, ingest info
  status            text not null default 'pending'
                      check (status in ('pending','complete','failed')),
  stage             text not null default 'initial'
                      check (stage in ('initial','followup','closed')),
  initial_findings  jsonb,                                 -- CritiqueResult
  followup_findings jsonb,                                 -- CritiqueResult (diffed vs initial)
  credit_source     text check (credit_source in ('pack','subscription_addon')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- RLS: owner-only select/insert/update (auth.uid() = user_id). Verified via pgTAP.
-- findings columns are written by the API (service_role) after the model call.
```

### 5.2 The review = 1 initial + 1 follow-up, then closed

```
[pending] ── run critique ──▶ [complete, stage=initial]
     │
     │  user revises, requests follow-up
     │  (UI warns up-front: "This is your one follow-up — the review closes after it.")
     ▼
[pending] ── run critique with initial_findings as context
             (judge: "did they address these? what's still open?") ──▶
        [complete, stage=followup] ──▶ stage=closed   (credit fully spent)
```

- **The follow-up is a diff, not a fresh review** — the prompt receives `initial_findings` and assesses *progress against those specific findings*, plus any new issues. That's the "mentor tracking your improvement" feel.
- **`closed` is terminal** — a new critique needs a new credit. **Enforced server-side** (the route rejects a third critique on a closed review), not just hidden in the UI.
- **Up-front disclosure** before the follow-up runs is a hard requirement.

### 5.3 Billing / entitlements (slots into the existing pattern)

The current model (verified in migrations): server-owned columns on `public.users`, guarded by `guard_billing_columns()`; `export_credits` is the pack precedent; `plan` / `subscription_status` / `plan_expires_at` model the semester subscription.

- **Review pack** — its **own SKU**, structured exactly like the export pack. New server-owned column **`users.review_credits integer not null default 0`** (`>= 0` constraint), **guard trigger extended** to cover it. Credits **never expire**. New RPC **`consume_review_credit(p_user_id uuid)`** mirrors `consume_export_credit` (atomic conditional `UPDATE … where review_credits > 0`, `service_role` only, browser EXECUTE revoked). Price ← token-cost experiments.
- **Subscription add-on** — an **additional fee on the semester subscription** granting a **weekly review quota** (a **7-day rolling window** via `createRateLimiter`, keyed per user). No per-review decrement; quota-consumption is tracked against the window.
- **Credit-check middleware** runs **before** the model call:
  - pack path → will `consume_review_credit` succeed (balance > 0)?
  - add-on path → is the user within the weekly window *and* term-active (`plan_expires_at` in future, status non-terminal)?
  - failure → typed 402-style error → paywall UI. **No credit consumed on ingest or model failure.**
- **The follow-up is included** in the initial credit — it does not decrement a second credit or consume a second weekly slot.

---

## 6. Testing & rollout

### 6.1 Testing (80%+ coverage, TDD)
- **Unit (pure, deterministic) — the bulk:**
  - `review/ingest/*` — each normalizer (PDF→pages, image validate/downscale, poster capture params, PPTX page extraction); **page-cap (24)** enforcement; oversized/corrupt/blank → typed error.
  - `enforce.ts` — dedupe, count clamps, drop-unresolvable-anchors, `action`-distribution guard.
  - Deterministic signals (emphasis-run count, figure:text ratio) — reuse the `readability.ts` test pattern.
  - Credit / state machine — `initial→followup→closed`; third-critique rejection; no-charge-on-failure; weekly-window accounting.
- **Schema/contract:** Zod validation of the model tool output; golden-fixture `CritiqueResult`.
- **Prompt evals (the moat's real test):** the §7 validation harness — a frozen fixture set of real posters/decks (good + deliberately bad) with expected critique properties, run against the live model (not mocks).
- **DB (pgTAP):** RLS owner-only on `poster_reviews`; `consume_review_credit` atomicity + `service_role`-only; guard-trigger rejects client writes to `review_credits`.
- **E2E (one critical flow):** upload → review → scored summary + anchored cards → request follow-up → closed.

### 6.2 Rollout (respects "slides-first protects the moat")
1. **Behind a flag / internal first.** Ship ingest + proxy + UI dark; dogfood on real posters; tune the prompt against the §7 eval set until critique quality clears a bar Gavin sets. Bad-feedback risk is the gate, not code-completeness.
2. **Internal build/enable order:** Postr-native posters first (richest input) → image/PDF upload → **PPTX last** (fiddliest ingest). (All four are launch scope; this is the *internal* order.)
3. **Paywall + `/presentation-checker` page** go live once quality is trusted.
4. **Cost instrumentation from day one** — log tokens/cost per review so the pack price + weekly quota are set from real numbers.

### 6.3 Docs / graph hygiene (ABSOLUTE-FIRST rule)
Update `docs/feature-graph.md` + `docs/manual-test-flows.md` + the sidebar/tab inventory so the new `review` tab and `/presentation-checker` route don't drift from code.

---

## 7. Pre-ship validation: inter-rater agreement vs Gavin

The measured version of "bad feedback destroys the moat." **Authored here as §7 for readability, but sequenced early** — the implementation plan front-loads **Phase 0** as the first milestone (an architecture-validation spike), and keeps only the final measured gate at pre-ship.

### 7.1 Why split it (Gavin's question: "section 7 or earlier, for architecture refactoring?")
If the corpus reveals the critique is systematically wrong in a way that needs *architectural* change — approach #1 can't hit the bar and we need the two-stage saliency model (approach #2) sooner, the input needs different chunking, or the output schema is missing a field the comments keep surfacing — discovering that *after* building everything is the expensive way to learn it. So:

- **Phase 0 (EARLY, before architecture is locked):** build the corpus + capture Gavin's ground-truth ratings against a **cheap throwaway prompt-only prototype** (just the vision call + rubric — no ingest layer, no DB, no billing, no UI; a script). This de-risks the architecture before building it, and Gavin's ratings become the **frozen ground-truth set** every later iteration measures against (capturing them early costs nothing extra). It also yields **early token-cost numbers** for pack pricing.
- **Pre-ship gate (LATER, in rollout):** once the real pipeline exists, re-run the checker on the **same frozen 20**, compute agreement, tune, re-measure.

### 7.2 Corpus — 20 posters, frozen, intentional quality spread
- **Source:** Consensus / paper-search MCP → 20 papers across fields → generate each into a poster → **export PPTX** (also dogfoods the PPTX ingest path).
- **Rubric-driven quality MIX** (not uniform "all decent" — that makes agreement uninformative). Some strong; the rest each seeded with **one** known failure mode from the economy/attention rubric: buried key result, over-emphasis competition, redundant text a figure already shows, two-competing-tables (forced-prioritization case), wall-of-text, decorative-figure-hijacks-attention, no take-away. Each seeded poster carries a **known ground-truth issue** the checker *should* catch.

### 7.3 Rating instrument — scores + checklist + comments
Gavin rates by **commenting**, not just ticking — comments are first-class. For each poster, both raters (Gavin + checker) produce:
- **dimension scores** — narrative / design / content (1–5);
- **issue checklist** — which known issues are present (shared rubric list);
- **free-text comments** — Gavin's natural mode; the checker already emits comment-style findings (problem + fix + personalized example).

### 7.4 Agreement — three complementary lenses
1. **Scores** → correlation + weighted-kappa (Gavin vs checker, per dimension): *do we rank the same?*
2. **Checklist** → precision / recall / F1 of the checker's flagged issues vs Gavin's, **including % of seeded ground-truth caught**: *same specific problems?*
3. **Comments** → qualitative reconciliation (align Gavin's prose with checker findings); catches wrong-element / missed-why even when the checkbox agrees. This is where real polish opportunities surface.

### 7.5 Decision gate
- Triage disagreements → **rubric gap** (add/adjust a `review/rubric/` entry + re-run) vs **genuine judgment call** (log, no fix).
- **Ship criterion is Gavin's to set** after round 1; proposed shape: *recall ≥ X on seeded ground-truth issues AND score-kappa ≥ Y AND no systematic comment-level failure mode*.
- Iterate: tune prompt → re-run on the **same frozen 20** → re-measure (frozen corpus = comparable across iterations).
- **Lives in:** a validation harness (`docs/plans/experiments/` + script), run before the flag flips.

### 7.6 Future phase — expert panel validation (post-v1, roadmap)

**This is why the architecture is built the way §2.0 describes.** After v1 ships and clears the solo (Gavin-only) gate, the ground-truth panel expands to **domain experts — professors, grad students, post-docs**. They rate the same style of frozen corpus (their own field's posters may be added), and their criteria become **new/adjusted rubric entries**, not code changes.

- **Multi-rater agreement.** With >2 raters, move from pairwise agreement to a panel statistic (e.g. Fleiss' / Krippendorff's on the checklist; ICC on scores). The checker is treated as one more rater and scored against the *expert consensus*.
- **Disagreement triage feeds the rubric.** Where experts systematically diverge from the checker, the resolution is a rubric edit (add a criterion, re-anchor a score, split an issue category) → re-run the frozen corpus → confirm no regression. The versioned rubric + shared taxonomy (§2.0) make this a config loop.
- **Field-specificity may emerge.** Experts might reveal that "economy" or "one clear graph" has field-dependent nuances (a stats poster vs a wet-lab poster). If so, the rubric gains field-scoped rule variants — still config, still no engine change.
- **Recruiting is out of scope for this spec** — Gavin will source the panel. What the spec guarantees is that when the panel exists, folding their judgment in is cheap.

**Keep this document open and revise it** as the rubric and the validation panel evolve. v1 is the first version, not the last.

---

## 8. SEO / naming (OpenSEO-backed)

Keyword research (postr.sh, US/en, 2026-07-29) found this is a **near-zero-demand keyword space**: `poster feedback` / `poster critique` (~10 vol), `poster review` / `poster checker` (110), `presentation checker` (210, **KD 2**), `presentation feedback` (210, KD 7); everything else ("poster analyzer", "review my poster", "ai poster feedback", "scientific poster feedback", "slide feedback", …) has **no measurable volume**.

**Implication:** the feature rides product + word-of-mouth + the watermark loop, *not* organic search. The slug's job is to be clean, human-readable, and quietly aligned with the lowest-difficulty real term — **`/presentation-checker`** (210 vol, KD 2). It naturally covers decks *and* posters (a poster is a one-page presentation), keeps a single product page + funnel, and matches Postr's existing in-app vocabulary (the "check" tab, the figure "checker"). **Avoid "feedback"/"critique" as URL/table/code names** (lower traction + collides with the peer-comments and bug-report meanings). Keep the no-AI-framing rule: `presentation-checker`, never `ai-presentation-checker`.

---

## 9. Research grounding (perception-pass rubric)

The Stage-1 rubric is citation-grounded (via Consensus / paper-search, 2026-07-29):
- **Figures/plots capture attention first & fast** — image-rich poster areas have shorter time-to-first-fixation than text (Galibourg 2026); poster pictures fixated 3–7× faster than logos (Grabowska-Chenczke 2026); graphics grab the first fixation before text (Wang 2019).
- **But not always the entry point** — text-rich posters/ads often start at the headline (Konovalova 2023); center placement dominates (Wianto 2025). → reason about *competition*, don't assume figure-first.
- **Faces / social cues override low-level saliency** — 423-effect gaze-cueing meta-analysis (McKay 2021); face-detector improves gaze prediction, face fixated >80% within two fixations (Cerf 2007); social features prioritized regardless of saliency (Flechsenhar 2017).
- **Bold/emphasis is a dose effect** — emphasis captures attention (Wu 2023) but light signaling helps and heavy signaling kills the benefit (Lorch 1995; Fitzsimmons 2019; Osipenko 2023). → flag over-emphasis, not "you used bold."
- **Text↔figure integration is a narrative dimension** — signaling that links a figure to its text improves comprehension (Scheiter 2015; Richter 2016 meta-analysis).
- **Caveat for the approach-#2 upgrade** — bottom-up saliency poorly predicts attention during *task-based* viewing (Polatsek 2018); keep the pass framed as free-viewing and pair it with the structured doc to infer intent.

---

## 10. Open items for the implementation plan
- Confirm the exact PPTX render toolchain (LibreOffice headless on Render vs a hosted convert) and its cold-start behaviour.
- Confirm the higher-res poster capture parameters (target px so poster text is legible to the model without blowing the resolution ceiling).
- Confirm how the existing checkout wires a new pack SKU + a subscription add-on line item (against the Stripe billing router / webhook), so review entitlements reconcile the same way exports do.
- Set the concrete ship-criterion numbers (§7.5) after Phase-0 round one.
- Price the pack + weekly quota from Phase-0 / day-one cost instrumentation.
- Design the `review/rubric/` schema (§2.0) so a criterion is addable as data — rule id, text, provenance, dimension, checklist-category, score anchors — and the issue taxonomy is the single source shared with the §7 validation harness. This is the seam that makes the §7.6 expert panel a config change.
```
