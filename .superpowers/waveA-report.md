# Wave A — API correctness ports (codex + cursor → feat/presentation-checker)

Date: 2026-07-30. Branch: feat/presentation-checker @ (commit below). All 9 items landed.
Verification gates at the end of the wave (see the dist-flake section for why the
test gate is quoted on a clean tree):

- `npm test --workspace=apps/api` (clean tree, no `dist/`) → **21 files / 270 tests, all green**
- `npm run build --workspace=apps/api` (tsc) → **clean**
- `npx supabase@2.101.0 db reset && npx supabase@2.101.0 test db` → **7 files / 103 tests, PASS**
  (brew supabase 2.110.0 deliberately NOT used, per instructions)

`apps/web/public/version.json` was dirty in the worktree before this wave (build artifact
from a dev run, timestamp 11:48 pre-dates my edits); left untouched and excluded from the commit.

---

## 1. LIVE BUG — refund misattribution (codex analysis)

- `apps/api/src/billing.ts` `fulfillCheckout` review_pack branch now records
  `markSessionFulfilled(..., 0)` instead of `REVIEW_PACK_CREDITS`, with a comment explaining
  why: the export-pack refund flow selects the newest fulfilled session with
  `credits_granted > 0`, so a nonzero marker let a review purchase be mistaken for an export
  pack (wrong Stripe charge refunded + export credits revoked). Review-SKU refunds are
  manual per D8, so the row exists only for idempotency.
- Codex's own fix is a larger SQL-RPC restructure (`fulfill_credit_pack` claims the session
  atomically and records 0). **Not ported** — the task prescribed the minimal fix on our
  shape; codex's RPC/migration path stays out of scope.
- Test: `billing.test.ts` review_pack test now pins `credits_granted: 0` on the
  `billing_fulfilled_sessions` marker (with the refund-selection rationale in the comment).
- RED/GREEN: expectation `toBe(0)` failed against the old `3` → passed after the one-line fix.

## 2. Add-on activate/revoke conditional writes (codex billing hardening)

- `fulfillCheckout` review_addon branch: `.eq('id', userId)` →
  `.match({ id: userId, review_addon: false })` — idempotent, forward-only activation.
- `handleSubscriptionChange` review_addon branch: activate path same conditional match;
  terminal path now `.match({ id, review_addon: true, review_addon_subscription_id: sub.id })`
  — only the subscription currently granting the flag can revoke it. A stale terminal event
  for an OLD add-on subscription can no longer clear access granted by a NEWER one.
- Codex's provider-reconciliation retrieve (`stripe.subscriptions.retrieve` inside
  `handleSubscriptionChange`, signature change) was **not ported** — out of the scoped shape.
- Tests (`billing.test.ts`): the recording fake now captures `filters` from `.eq()/.match()`;
  the three existing review_addon lifecycle tests assert the conditional matchers; a new
  stateful fake (`statefulAddOnSupabase`, ported from codex) pins: terminal event with a
  DIFFERENT (stale) subscription id leaves `review_addon: true` untouched, and a terminal
  event for the CURRENT sub does clear it.
- RED/GREEN: 3 matcher assertions + stale-event test failed against unconditional writes →
  38/38 pass after the fix.

## 3. Rate-limit bucket pruning (codex `65eab63`)

- Clean port: `git diff 65eab63^..65eab63 -- apps/api/src/rateLimit.ts
  apps/api/src/__tests__/rateLimit.test.ts | git apply` applied without conflicts (our
  rateLimit.ts matched codex's base exactly).
- `apps/api/src/rateLimit.ts`: disabled layers (`MAX_SAFE_INTEGER`) no longer accumulate
  events; a 60s-interval opportunistic sweep drops buckets whose enabled windows both
  expired — per-user buckets no longer grow unboundedly.
- `apps/api/src/__tests__/rateLimit.test.ts` (new, from the same commit): rewind-clock test
  proves the stale bucket was pruned.
- RED/GREEN: new test failed pre-patch (bucket retained → rewound user hit the cap) →
  passed after; reviewFlow/reviewRouter limiter consumers unaffected (15/15 at the time).

## 4. Provider timeout + no SDK retries (codex critique.ts)

- `apps/api/src/review/config.ts`: new `REVIEW_TIMEOUT_MS = 60_000` (mirrors
  `CONDENSER_TIMEOUT_MS` in narrative/config.ts; task-prescribed name/value — codex used
  `REVIEW_PROVIDER_TIMEOUT_MS = 120_000`).
- `apps/api/src/review/critique.ts`: `messages.create(params, { timeout: REVIEW_TIMEOUT_MS,
  maxRetries: 0 })` — bounded provider work; no SDK retry multiplying the per-review bill.
- Test: `reviewCritique.test.ts` create-options assertion now includes the second argument
  `{ timeout: REVIEW_TIMEOUT_MS, maxRetries: 0 }`.
- RED/GREEN: failed pre-fix (called with one argument) → 9/9 pass after.

## 5. Deferred weekly-slot + pack-credit compensation (cursor `471248a`, manual port)

- `apps/api/src/review.ts` `runInitial` (our shape kept; cursor's restructured
  entitlement/persist helpers NOT copied):
  - (a) the `weeklySlotAllowed` check moved to AFTER `fetchReviewPages` succeeds, still
    before the model call — a 400/413/502 ingest failure no longer burns a weekly add-on
    slot. The entitlement branch now only picks `creditSource`.
  - (b) `poster_reviews` insert failure after a successful pack consume now compensates
    with `grant_review_credits(p_amount: 1)` before the 500; a failed compensation logs
    `[review.critique] credit compensation failed` loudly. Weekly slots stay uncompensated
    (D17 soft cap, comment says so).
- Tests (`reviewRouter.test.ts`): fake gained `insertError`/`grantError` opts (cursor's
  shape). New: "does not consume an add-on weekly slot when the guarded page fetch fails"
  (limiter vi.fn never called, model never called); "restores a consumed pack credit when
  persistence fails" (rpc sequence = consume → grant_review_credits×1, 500 body); "logs
  loudly and still returns 500 when the credit restoration itself fails" (log payload pin).
  The pre-existing weekly-rejection test now resolves its fetch mock (the limiter runs
  after the fetch). File-header pipeline comment updated to the new order.
- RED/GREEN: 3 new tests failed pre-fix (slot consumed pre-fetch; no compensation RPC;
  no loud log) → pass after; flow/follow-up suites stayed green throughout.

## 6. pgTAP fixture grants (codex `831c63e`)

- `supabase/tests/billing_plan_test.sql`, `feedback_rate_limit_test.sql`,
  `poster_versions_test.sql`: codex's exact grant diffs applied via `git apply`
  (`grant select, update on public.users …`, `grant select, insert on public.feedback …`,
  `grant select … posters / poster_versions …`). Codex's `fulfill_credit_pack_test.sql`
  does not exist on this branch (its RPC was never ported) — nothing to do there.
- `supabase/tests/poster_reviews_test.sql` (task-requested, codex didn't have this file):
  added `grant select, insert, update on public.poster_reviews to authenticated,
  service_role; grant select, update on public.users to authenticated, service_role;` —
  the minimal privileges for the fixture to reach the RLS policy / billing-guard trigger
  rather than 42501-ing on a missing table grant first.
- Baseline note: the suite already PASSED on CLI 2.101.0 before the grants (this CLI
  version seeds the environment-owned grants); the change is defensive hardening for CLI
  versions where they are absent, per the commit's intent.
- Verified: `db reset` + `test db` → 7 files / 103 tests PASS after the grants.

## 7. fetchPages streaming cap + strict MIME + fetch_failed→502 (cursor `1512546`, `cb8335c`, `75d41e1`)

- `apps/api/src/review/fetchPages.ts`: ported cursor's `readPageBody` (streams via
  `response.body.getReader()`, rejects a deceptive oversized `content-length` before
  reading, aborts mid-stream at the byte cap, wraps read failures as
  `PageFetchError('fetch_failed')`) and `parsePageMediaType` (strict
  `split(';')[0].trim().toLowerCase()` equality — kills the `includes('jpeg')` substring
  hole, e.g. `application/notjpeg`). Our contract kept: `FetchedPage`, the four
  `PageFetchError` codes, guard-before-fetch, `redirect: 'error'`, injectable `maxBytes`.
- `apps/api/src/review.ts` `replyPageFetchError`: `fetch_failed` now maps to **502** (was
  400 — a storage hiccup is not a client error); `url_not_allowed`/`unsupported_media`
  stay 400, `too_large` stays 413. Note: this branch had **no** pre-existing router test
  pinning fetch_failed→400 (the task expected one) — the new test adds the 502 pin with a
  justification comment.
- Tests (`reviewFetchPages.test.ts`): ported cursor's deceptive-media, oversized
  content-length (asserts body never read via an `arrayBuffer` spy), and stream-read-failure
  tests; added a mid-stream-abort test (chunked body, no content-length, capped during
  read). Router test: "maps an upstream page-fetch failure to 502 fetch_failed and charges
  nothing"; the item-5 deferred-slot test tightened to assert 502.
- RED/GREEN: 3 fetchPages tests failed pre-fix (substring MIME accepted, body buffered,
  raw stream error escaped) + 2 router 502 assertions failed (400) → all green after.

## 8. reviewId uuid validation (cursor, schema half only)

- `apps/api/src/review.ts`: `reviewId: z.string().uuid().optional()`; the stale Task-16
  comment justifying the loose `min(1)` removed, replaced with a one-liner (400 here beats
  500 on the Postgres uuid cast). Cursor's burst-limiter restructure from the same commit
  (`2f39106`) deliberately NOT ported — schema half only, per the task.
- Fixtures: `reviewFollowup.test.ts` uses a real UUID constant for `REVIEW_ROW.id` /
  `reviewId` / update-target assertions; `reviewFlow.test.ts`'s stateful fake now mints
  deterministic UUIDs (`f1000000-…-seq`) for inserted reviews (follow-up requests echo them
  back through the uuid gate). `reviewRouter.test.ts` needed no reviewId fixtures (initial
  flow only).
- New test (`reviewFollowup.test.ts`): non-uuid reviewId → 400 `bad_request`, fetch/model
  never called.
- RED/GREEN: malformed-id test failed pre-fix (404 from the DB lookup, not 400) → 24/24
  across the three router suites after.

## 9. critique.ts protocol hardening (cursor `7922e70`, `5f9ab25`)

- `apps/api/src/review/critique.ts`: tool_use block now matched by
  `name === 'emit_critique'` (was first-found); timeout detection adds
  `err instanceof Anthropic.APIConnectionTimeoutError` ahead of the name duck-type
  (import changed from `import type Anthropic` to a value import — verified the pinned SDK
  0.30 exposes the class as a static on the default export).
- Tests (`reviewCritique.test.ts`): cursor's two tests ported — a `tool_use` block named
  `wrong_tool` → `no_tool_call`; a real `new APIConnectionTimeoutError(...)` instance →
  `timeout`.
- RED/GREEN: both failed pre-fix — notably the real SDK instance does NOT carry
  `name === 'APIConnectionTimeoutError'` in SDK 0.30, so the duck-type alone was blind to
  genuine timeouts; both pass after.

---

## Commit

Single commit, message:
`fix(review): port API correctness hardening — refund attribution, conditional add-on writes, deferred slot, credit compensation, streaming fetch, uuid gate, protocol guards`

Files: apps/api/src/{billing.ts, rateLimit.ts, review.ts, review/config.ts,
review/critique.ts, review/fetchPages.ts}, apps/api/src/__tests__/{billing.test.ts,
rateLimit.test.ts (new), reviewCritique.test.ts, reviewFetchPages.test.ts,
reviewFlow.test.ts, reviewFollowup.test.ts, reviewRouter.test.ts},
supabase/tests/{billing_plan_test.sql, feedback_rate_limit_test.sql,
poster_reviews_test.sql, poster_versions_test.sql}.

## Post-commit verification: dist-double-run flake (pre-existing, NOT a port regression)

After the commit, repeated full-suite runs showed intermittent single-test failures
(~2 in 12 runs), each time a DIFFERENT import-family test in `dist/__tests__/*.test.js`
(compiled output), never in the `src/` originals. Investigation:

- Root cause: the repo has NO vitest config, so vitest's default include picks up
  `dist/**/*.test.js` whenever `tsc` has run — the suite then executes every test twice
  (21 src + 21 dist files). This pre-existed the wave: the pre-build suite run already
  showed 41 files (21 src + 20 stale dist). Under full 42-file parallel load, one of the
  compiled import-family tests flakes nondeterministically.
- Exonerating evidence: src-only suite (21 files / 270 tests) green 20+/20+ runs;
  dist-only suite green 3/3; the one failure touching code this wave changed
  (extractStyle 10/day cap → my rateLimit.ts pruning) was stress-tested out-of-band —
  2000/2000 trials deterministic (11th request always 429; weekly window-only config
  2000/2000). The other failure (importExtract SSRF 400-before-fetch) is in untouched
  code (import.ts / imageUrlGuard.ts).
- Gate was therefore verified the CI way: `rm -rf apps/api/dist` (gitignored build
  output) → `npm test --workspace=apps/api` = **21 files / 270 tests, all green** →
  `npm run build --workspace=apps/api` = tsc clean.
- Recommendation (NOT done — out of this wave's scope): add `exclude: ['dist/**']` via a
  small `apps/api/vitest.config.ts`, or add `--exclude` to the test script, so a local
  build can't double the suite. Worth doing before Wave B.

## Not ported (deliberately)

- Codex's `fulfill_credit_pack` SQL-RPC fulfillment restructure + migration (item 1 took
  the prescribed minimal fix instead).
- Codex's `stripe.subscriptions.retrieve` provider reconciliation inside
  `handleSubscriptionChange` (item 2 took the conditional-writes half).
- Cursor's burst-limiter restructure for follow-ups (`2f39106` router half; item 8 took
  the schema half only).
- Cursor's restructured `runInitial` helpers (`resolveEntitlementDecision`,
  `persistInitialReview`, `compensatePackCredit` as free functions) — same behavior
  implemented in our shape.

No loose ends known; nothing blocked.
