# Wave B2 — API-side hardening ports

Branch `feat/presentation-checker` (worktree `postr-presentation-checker`).
Source: reviewed cursor worktree `postr-presentation-checker-cursor`. TDD per item, one commit at the end.

## Item 1 — 1024×1024 audit floor on render-pptx (cursor `21eb67a`)

- `apps/api/src/review.ts` — render-pptx route: after the 24-page cap and before
  any storage upload, reject any page whose short edge < 1024 px with typed 400
  `page_too_small`. Copy tells the user to export the deck as a PDF and upload
  that instead (the PDF path upscales via render scale). Our response shape
  (`storagePath` per page) and existing error codes untouched.
- `apps/api/src/__tests__/reviewRenderPptx.test.ts` — ported cursor's route test
  (900×900 page → 400 `page_too_small`, message contains `1024×1024`, zero
  uploads). RED → GREEN confirmed (4/4 pass).
- ⚠️ Cursor's junk file `task-18-report.md` from `21eb67a` deliberately NOT
  copied.

## Item 2 — strict anchor anyOf tool schema (cursor `afc7546`)

- `apps/api/src/review/prompt.ts` — replaced the loose anchor object
  (`{kind, blockId?, page?, bbox?}`) with a nested `anyOf` of the three strict
  variants (block: `kind`+`blockId`; region: `kind`+`page`+`bbox`; slide:
  `kind`+`page`), each with `additionalProperties: false`. The model can no
  longer emit `kind:'block'` without `blockId` and only fail at Zod
  (`bad_tool_json` 502). Doc comment notes the pre-ship gate (Task 28)
  re-validates this schema against the live model.
- `apps/api/src/__tests__/reviewPrompt.test.ts` — ported cursor's +60-line
  schema pin. RED → GREEN confirmed (13/13 pass).

## Item 3 — enforce edge-case pins (cursor `c9cf333`, test-only)

- `apps/api/src/__tests__/reviewEnforce.test.ts` — two pins: an all-'add' list
  of ≥4 findings enforces to `[]` (fixed point of the add-distribution guard),
  and empty input returns empty. Both hold against our existing enforce logic
  (21/21 pass).

## Item 4 — vitest dist exclusion (Wave A flake investigation)

- `apps/api/vitest.config.ts` (new) — `exclude: [...configDefaults.exclude,
  '**/dist/**']`, default include behavior otherwise (no jsdom; api is node).
  Vitest 4's default exclude no longer covers `dist/**`, so after any `tsc`
  build the suite ran every test twice (42 files: 21 src + 21 dist) and flaked
  under parallel load — observed twice during this session (2 spurious failures
  on a double-run; green once dist was excluded).

## Verification

- `npm run build --workspace=apps/api` — clean (tsc).
- `npm test --workspace=apps/api` AFTER the build — 21 test files (exactly the
  src-only count), 274 tests, all pass; no `dist/` entries in the run.
- `npm test --workspace=apps/web` — 1917 pass (untouched).
- Gate import check: `npx tsx docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts`
  with no key → `ANTHROPIC_API_KEY must be set (Preflight P3) — the gate calls
  the live model.` (imports resolve with the strict schema; not an import error).

## Notes

- `apps/web/public/version.json` was already dirty before this wave (build-id
  churn from the web vite config) and is deliberately excluded from the commit.
