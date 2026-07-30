# Wave B1 — apps/web ingest-layer hardening ports

Branch: `feat/presentation-checker` (worktree `postr-presentation-checker`).
Sources: cursor worktree (`postr-presentation-checker-cursor`), codex worktree
(`postr-presentation-checker-codex`, ReviewTab lock only).
Baseline before any change: 45/45 green across the 8 affected test files.
TDD per item: cursor/codex tests ported first (RED), then implementation (GREEN).

## 1. Partial-upload cleanup + error preservation
(cursor `a02deed`, `eb75238`, `7302cab`, `3e78f47`)

**`apps/web/src/review/ingest/uploadReviewPage.ts`**
- Upload wrapped in try/catch: a *rejected* upload request (network throw, not
  just a supabase error object) now maps to `IngestError('upload-failed')`.
- Signed-URL creation wrapped in try/catch: on ANY signing failure the
  already-uploaded object is removed (best-effort, `console.error` on removal
  failure) and the ORIGINAL error is rethrown — a rejected `createSignedUrl`
  propagates its raw error identity; a supabase error object still maps to the
  typed `upload-failed`.
- Kept OUR docblock (superset of cursor's), extended with the orphan-removal
  contract.

**`apps/web/src/review/ingest/fromPdf.ts`** (interwoven with item 2 — one file)
- Tracks `uploadedStoragePaths` as pages upload; on failure, `removeUploadedPages`
  deletes them best-effort AFTER `pdf.destroy()` (upload-before-remove ordering
  pinned via `invocationCallOrder`).
- Primary-error preservation: the ingest error is captured, `pdf.destroy()` is
  awaited in its own try/catch (`ingestError ??=` — a destroy failure never
  clobbers the primary error, only fills an error-less path), cleanup runs,
  then the original error rethrows (identity preserved — `toBe(uploadError)`).
- Non-`IngestError` throwables (e.g. a pdfjs render rejection) map to
  `unreadable-file` — previously they escaped raw.
- Kept OUR header docblock + `file.arrayBuffer()` (the Task 21
  `Blob.arrayBuffer` polyfill in `vitest.setup.ts` covers jsdom) instead of
  cursor's FileReader-based `readFileBuffer`. Untouched.

Covering tests:
- `uploadReviewPage.test.ts`: +`maps a rejected upload request to upload-failed`,
  +`removes the uploaded object and preserves a rejected signing error`
  (remove called with the path, upload-before-remove ordering, error identity).
- `fromPdf.test.ts`: +`removes prior uploads and preserves a typed error when a
  later page fails` (partial paths removed, invocationCallOrder, `toBe`),
  +`maps render failures to unreadable-file and releases the page canvas`,
  +`preserves a primary ingest error when PDF cleanup fails` (destroy-failure
  doesn't clobber), +`releases a padded audit canvas when drawing into it fails`.

RED: 2 failed in uploadReviewPage (remove never called; rejected upload unmapped);
5 failed in fromPdf. GREEN: 5/5 and 9/9.

## 2. 1024px audit floor on client captures
(cursor `99b9c40`, `54dfe0d`, `de7c245`, `cbc9718`, `e82fabc`)

**`apps/web/src/data/thumbnails.ts`**
- New `REVIEW_SHORT_EDGE_PX = 1024` + exported `reviewTargetWidthPx(w, h)`:
  width target solving long edge ≥ 2048 AND short edge ≥ 1024, `Math.ceil`
  (a floor rounding can undershoot is not a floor). `captureReviewImage` now
  calls it. The 400px `captureThumbnail`/`capturePosterJpeg` path is
  byte-identical — verified by the unchanged `pixelRatioFor` tests and diff.

**`apps/web/src/review/ingest/fromPoster.ts`**
- `reviewPixelDims` mirrors the dual floor (max of the two scales, ceil) so
  reported dims agree with the captured JPEG. Extreme aspects exceed the 2048
  long edge deliberately (60×20in → 3072×1024) — the audit floor is the
  binding constraint.

**`apps/web/src/review/ingest/fromPdf.ts`**
- `calculateRenderScale`: per-page render scale ≥ legacy 2×, enough to lift the
  short edge to 1024, capped at 2048/long-edge. Viewport dims `Math.ceil`ed.
- `ensureAuditDimensions` (pad-only variant): white-pads centered to ≥1024 on
  the short edge (render scale already caps the long edge; this never scales).

**`apps/web/src/review/ingest/fromImage.ts`**
- `ensureAuditDimensions` (rescale variant): upscale+white-pad tiny sources to
  the floor, shrink oversized to the ceiling, pass through when already in the
  1024–2048 envelope. Non-`IngestError` scaling failures map to
  `unreadable-file`; all three canvases released in `finally` (identity-tracked).

Covering tests: `thumbnails.test.ts` +5 `reviewTargetWidthPx` cases (3:1
landscape → 3072, 2:1 boundary → 2048, 1:3 portrait → 1024, non-integral ratio
ceil); `fromPoster.test.ts` +extreme-aspect floor case; `fromPdf.test.ts`
+small-page floor / oversized ceiling cases; `fromImage.test.ts` reworked first
test (100×50 fake → 2048×1024 upload dims) +2048-ceiling fallback, +scaling-
failure mapping, +audit-canvas release.

RED: 6 failed across thumbnails/fromPoster (`reviewTargetWidthPx is not a
function`, 60×20in → 2048×683 undershoot); 4 failed in fromImage; floor cases
included in fromPdf's 5. GREEN: 15/15, 7/7, 9/9.

## 3. Per-channel blank detection + sample cap (cursor `e56dba4`, `d096c4c`)

**`apps/web/src/review/ingest/guards.ts`**
- `isCanvasBlank` now tracks per-channel min/max: a single-channel-uniform
  render (solid red) previously showed a 0→255 global range and passed as
  "content"; now each RGB channel must independently stay within ±8.
- Stride `Math.floor` → `Math.ceil`: floor could sample every pixel (2047px
  image → stride 1 → 2047 samples); ceil caps at ~1024 samples.

Covering tests: +solid-red line in the near-uniform case, +`samples no more
than 1024 pixels from a large render` (Proxy-counted channel reads ≤ 3072).
RED: 2 failed (red not flagged; 6141 > 3072 reads). GREEN: 17/17.

## 4. ReviewTab in-flight ref lock (codex `ddba57a`, ReviewTab part only)

**`apps/web/src/poster/sidebar/ReviewTab.tsx`**
- `inFlightRef = useRef(false)`; `run()` does the synchronous check-and-set
  (`if (!doc || !posterId || inFlightRef.current) return; inFlightRef.current = true;`)
  BEFORE any await, resets in `finally`. `running` state still drives the UI.
- OUR `tempPathsRef` capture tracking + unmount/start-fresh `cleanupReviewTemp`
  logic untouched; codex's checkout lock (`checkoutInFlightRef`,
  `checkoutPending`), `revokePagePreviews`, and `storagePath`-in-critique-pages
  are codex-side extras outside item 4's scope — deliberately NOT ported.

Covering test: `ReviewTab.test.tsx` +`coalesces same-tick double clicks into
one ingest + one critique` (deferred ingest gate; two clicks inside one `act`
→ 1 ingest, 1 critique). RED: 1 failed (2 ingest calls). GREEN: 6/6.

## 5. Null-session typed error (cursor `de7c245` hunk)

**`apps/web/src/review/ingest/index.ts`**
- `resolveIngestContext` now throws
  `IngestError("We couldn't start a session — refresh the page and try again.",
  'unreadable-file')` instead of raw `Error('No session returned by Supabase')`
  — consistent typed handling, workflow-named copy (D15, never "AI").
- `cleanupReviewTemp` (our fix-wave barrel export) untouched.

Covering test: `index.test.ts` +`resolveIngestContext failures` (typed kind,
exact copy, normalizeInput never called). RED: 1 failed. GREEN: 6/6.

## Constraint check (fix-wave code NOT weakened)

- `cleanupReviewTemp` barrel + unmount/reset cleanup in
  PresentationChecker/ReviewTab: untouched, tests still green.
- 402 `retryAfterSec` body read (`reviewApi.ts`), `filename` in
  `requestCritique` (PresentationChecker), render-pptx `storagePath`
  round-trip (`fromPptx.ts`): files untouched by this wave.
- `Blob.arrayBuffer` polyfill in `vitest.setup.ts`: untouched.
- cursor's fromPptx raw-upload cleanup (`uploaded` flag) is outside the
  scoped items — not ported (flag for a future wave if wanted).

## Verification

- `npm test --workspace=apps/web`: **113 files / 1917 tests, all green.**
- `npm run build --workspace=apps/web`: **green** (regenerated
  `apps/web/public/version.json` left uncommitted per instructions).
- One commit: `fix(review): port ingest hardening — partial-upload cleanup,
  1024px audit floor, per-channel blank detect, in-flight lock, typed
  null-session`.
