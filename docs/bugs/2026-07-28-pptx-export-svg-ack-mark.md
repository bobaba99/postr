# PPTX export fails with "Something went wrong" on posters carrying an SVG image

- **Date:** 2026-07-28
- **Status:** Fixed
- **Severity:** High. Broke `.pptx` export for a large class of posters —
  every poster sparse enough to get the acknowledgement mark auto-placed,
  which includes brand-new and lightly-populated posters. LaTeX and PDF
  export were unaffected.
- **Fixed in:** (this branch) — `apps/web/src/export/pptx/rasterizeSvg.ts`
  + writer wiring.
- **Area:** Editable exports → PowerPoint (`export/pptx`).

## Symptom

Clicking **PowerPoint (.pptx)** showed the generic
"Something went wrong. Try again, or use Send Feedback." The user
reported it failing on *every* poster, including new ones. The browser
console showed **no Postr error** — every line was from MetaMask's
`contentscript.js` (`ObjectMultiplex`, `app-init-liveness`,
`MaxListenersExceededWarning`), plus one 404 for
`GET https://www.postr.sh/p/image/svg+xml;base64,…`.

The regression started after the export "slide layouts / acknowledgement
mark" cluster of commits (known-good was `50ed373`, "add an optional
locked flag to Block").

## Root cause

**pptxgenjs cannot embed an SVG `data:` URI.** Its `addImage` path feeds
the URI to an in-browser `<img>` and reads it back through a canvas;
SVG makes the image fire `onerror`, pptxgenjs throws
`ERROR! Unable to load image (image.onerror): image/svg+xml;base64,…`,
and `pptx.write()` rejects — failing the whole export.

The acknowledgement mark (`export/ackMark.ts`) is an **SVG** data URI. It
is seeded onto the poster on load (`stores/posterStore.ts:152`,
`ensureAckBlock`) and placed by `placeAckMark` only when there is a free
spot — so it lands on **sparse** posters and is skipped on dense ones.
That is exactly the observed pattern: the failing posters are the ones
that received the mark. The throw was `writer.ts`'s `addImage` handing
`data:image/svg+xml;base64,…` straight to `slide.addImage`.

Two red herrings, both cleared during diagnosis:

- **The MetaMask 404** (`/p/image/svg+xml;base64,…`) is the extension
  scanning the page, finding the ack mark's `data:` URI, and re-fetching
  it as a relative URL (scheme stripped). It is a page-scan artifact,
  not triggered by export, and not the failure.
- **A stale deploy / purged chunk** was ruled out: the deployed
  `version.json` buildId matched HEAD, and the export code was proven to
  work in the current bundle. The failure is data-dependent (SVG asset
  present), not deploy-state.

## Why it was hard to see

The export button's `catch` swallowed the error with **no console
output** (house rule: user-facing errors stay generic, details go via
Send Feedback). So a real, specific throw surfaced only as the generic
message with nothing to diagnose. It also could not be reproduced with a
naive default doc, because a doc built straight from `makeBlocks` has no
ack block — the mark is added by `ensureAckBlock`, which a hand-built
fixture skips. Reproduction required seeding the ack mark on a sparse
(`empty`) layout, which is what a real new poster does.

## Fix

Rasterize SVG assets to PNG before they reach pptxgenjs.

- New `export/pptx/rasterizeSvg.ts` — `browserRasterizeSvg` converts SVG
  bytes → PNG bytes via an `<img>` + canvas (mirrors the proven
  `charts/download.ts` path). Returns `null` (never throws) on any
  failure, so a conversion problem degrades to a placeholder rather than
  killing the export.
- `exportPosterPptx` converts every resolved SVG asset in place, right
  after `resolvePosterAssets`, before any slide is drawn — one seam,
  covers the ack mark *and* any user-inserted SVG figure. The rasterizer
  is injectable (`opts.rasterizeSvg`) so tests and headless pipelines can
  supply their own; the writer stays DOM-free except through this seam.
- Removed the now-dead "SVG figure may not render on pre-2019 PowerPoint"
  warning — SVGs are no longer embedded as SVG, and pptxgenjs never
  merely degraded on them, it threw.
- The export button's `catch` now `console.error`s the real error, so any
  future silent failure is diagnosable.

## Verification

- Live browser repro before the fix: exporting the `empty` layout (ack
  present) threw the exact `image.onerror` above; other layouts (no ack)
  succeeded.
- After the fix, all five layout templates export; the `empty` layout
  produces a 39,510-byte file whose single media part is
  `ppt/media/image-1-1.png` — **no SVG in the archive** — using the real
  browser canvas rasterizer.
- Full download path (`Blob` → `createObjectURL`) exercised and works.

## Prevention

- Regression test `export/__tests__/pptxSvgRaster.test.ts`: an SVG asset
  must not throw, must be rasterized to PNG (rasterizer called with the
  block's 2× pixel size), must leave no `.svg` in `ppt/media/`, must fall
  back to a placeholder when rasterization returns null, and must not
  invoke the rasterizer for non-SVG assets.
- General lesson: pptxgenjs is raster-only. Any future path that hands it
  an image must guarantee PNG/JPEG, never SVG.
