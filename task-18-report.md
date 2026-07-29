# Task 18 — POST /api/review/render-pptx

Server-side PPTX render route with LibreOffice `PptxRenderer`, SSRF guard, page cap, and review-temp upload.

## Review fix

**Finding:** 1024×1024 audit floor was not enforced on `render-pptx` — sub-floor pages could reach critique.

**Fix:** After render and empty/too_many_pages checks, reject any deck where `Math.min(widthPx, heightPx) < 1024` with `400 page_too_small` before the upload loop. Route-level rejection (no upscaling).

**Test:** `reviewRenderPptx.test.ts` — injected 900×900 renderer → asserts 400 + `page_too_small`, zero uploads.

**Status:** DONE
