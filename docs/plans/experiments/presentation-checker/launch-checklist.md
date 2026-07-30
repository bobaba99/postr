# Presentation Checker — pre-ship gate + launch checklist

Date: <…> · Rubric: <version stamped in results> · Corpus: frozen 20 (`frozenAt` in manifest)

## Gate result (from analysis/gate-report.md vs gate-decision.md §7.5 criterion)

| lens | gate number | Task-7 criterion | pass? |
|---|---|---|---|
| weighted kappa — narrative | <…> | ≥ <Y> | [ ] |
| weighted kappa — design | <…> | ≥ <Y> | [ ] |
| weighted kappa — content | <…> | ≥ <Y> | [ ] |
| seeded ground-truth recall | <…>% | ≥ <X>% | [ ] |
| comment-level failure modes (lens 3 reconciliation) | <…> | none systematic | [ ] |

- [ ] **GO** — every criterion passes → execute the launch checklist below
- [ ] **NO-GO** — prompt/rubric loop (Task 6 Step 3) → re-run run-production-gate.mts on the same frozen 20

## Launch checklist (GO only, in order)

- [ ] **Index the page (D12 flip).** In `apps/web/src/seo/routes.json` move `/presentation-checker` out of `app` (noindex) into `static` with this record (workflow-named, never "AI" — D15; slug rationale §8):

  ```json
  "/presentation-checker": {
    "title": "Presentation Checker — Poster & Talk Review | Postr",
    "description": "Get feedback on your research poster or talk before the conference: narrative, design and content scores, plus anchored fix-cards that show exactly what to cut, demote or show visually.",
    "robots": "index,follow",
    "h1": "Feedback on your poster or talk, before you're in front of it.",
    "copy": [
      "Upload a poster, a PDF or a deck — or check the poster you're already editing — and get a reviewer-style read: what a first-time viewer's eye lands on, whether your key result survives the scan path, and what to do about it.",
      "Every finding is anchored to a block, slide or region of your artifact and comes with a personalized fix: the line to rewrite, the table to demote to an appendix, the plot to make primary.",
      "One follow-up is included with every review: revise, re-check, and see your scores move. Review packs never expire; the add-on gives you a weekly quota on top of your term."
    ]
  }
  ```

- [ ] **Prerender + sitemap via the normal build.** `npm run build` — the apps/web build already runs `scripts/prerender.mjs` (prerenders every `static` route) and `scripts/gen-sitemap.mjs` (regenerates the sitemap); verify `/presentation-checker` appears in both outputs.
- [ ] **Link it.** Add the nav entry in `apps/web/src/components/PublicHeader.tsx` and the review pack + add-on tiers/links on `apps/web/src/pages/Pricing.tsx`.
- [ ] **Checkout landing covers review SKUs.** In `apps/web/src/pages/BillingResult.tsx` extend the `granted` check with `|| plan.canReview` (and its copy) so a review-pack buyer sees the confirmation instead of the "will appear shortly" fallback.
- [ ] **Stripe LIVE prices.** Create the `review_pack` (payment mode) and `review_addon` (subscription mode) prices in the LIVE Stripe account; set `STRIPE_PRICE_REVIEW_PACK` / `STRIPE_PRICE_REVIEW_ADDON` in Render. Review-SKU refunds stay manual via the Stripe dashboard (D8 — deferred, no code).
- [ ] **Price from real numbers.** Set `REVIEW_PACK_CREDITS` (the pack-grant const from the Milestone-3 billing task, beside the `PACK_EXPORT_CREDITS` precedent) and `REVIEW_ADDON_WEEKLY_QUOTA` (`apps/api/src/review/config.ts`) from the day-one `[review.critique]` cost lines (Task 27 Step 4 + dogfood) and the p50/p95 of `results-production/costs.jsonl` — not the placeholders (`3` / `4`).
- [ ] **PPTX infrastructure (D10).** Switch the API to the Docker-based Render service with `libreoffice-impress` + `poppler-utils` (soffice + pdftoppm for `/api/review/render-pptx`) and smoke one PPTX review in prod BEFORE enabling the PPTX input in the UI. PPTX ships last (§6.2.2) — it must never block the other three inputs.
- [ ] **Living spec.** If the rubric changed since Task 1, update the spec's living-document sections (`docs/plans/2026-07-29-presentation-checker-review.md`: §2.0 rubric-version note, §7.5 criterion record) with the final rubric version and the gate numbers above.
- [ ] **Prod smoke, then announce.** One Postr-native critique end-to-end in production (cost line + `source_meta` per Task 27 Step 4), then the launch note.
