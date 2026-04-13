# Images to Supabase Storage Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move poster images from inline base64 in the JSONB `data` column to Supabase Storage, reducing autosave payload from MBs to KBs.

**Architecture:** On image upload, save the file to the `poster-assets` Storage bucket and store the storage path in `block.imageSrc` (prefixed with `storage://`). On render, resolve storage paths to signed URLs. Existing base64 data URLs continue to render as-is for backward compatibility.

**Tech Stack:** Supabase Storage (poster-assets bucket), signed URLs (1h TTL), html-to-image (needs base64 at capture time)

---

### Task 1: Image upload → Storage

**Files:**
- Modify: `apps/web/src/poster/blocks.tsx` — `readImageFile()` and `ImageBlock.handleFile()`
- Create: `apps/web/src/data/posterImages.ts` — upload helper

**What:** When user uploads an image to an image block, upload the file to `poster-assets/{userId}/{posterId}/{blockId}.{ext}` and set `imageSrc = "storage://{path}"` instead of a base64 data URL.

**Key details:**
- Need userId + posterId at upload time — pass from PosterEditor via props or context
- Keep the `readImageFile()` validation (MIME check, 10MB limit)
- Upload the raw File object, not base64 — avoids the 33% inflation
- Set `imageSrc` immediately to show the image (use a local object URL as interim preview while upload is in-flight, then swap to storage path on success)

### Task 2: Image rendering — resolve storage paths to signed URLs

**Files:**
- Create: `apps/web/src/hooks/useStorageUrl.ts` — hook that resolves `storage://` paths to signed URLs with caching
- Modify: `apps/web/src/poster/blocks.tsx` — `ImageBlock` and `LogoBlock` rendering

**What:** When rendering `<img src={block.imageSrc}>`, check if the value starts with `storage://`. If so, resolve it to a signed URL via a hook. Cache signed URLs in a module-level Map with TTL tracking so we don't re-sign on every render.

**Key details:**
- Plain data URLs and remote URLs render as-is (backward compatible)
- `storage://` prefix is the discriminator
- Cache signed URLs for 50 minutes (URLs expire at 60 minutes)
- The hook returns `{ url: string | null, loading: boolean }` so we can show a placeholder while resolving

### Task 3: Logo upload → Storage

**Files:**
- Modify: `apps/web/src/components/LogoPicker.tsx` — Upload tab handler

**What:** Same pattern as Task 1 — upload logo files to Storage instead of base64. The "My Logos" tab already uses Storage (via userLogos.ts). The Upload tab currently reads as base64 AND saves to Storage in background — simplify to just save to Storage and use the storage path.

### Task 4: Export/print compatibility

**Files:**
- Modify: `apps/web/src/poster/PosterEditor.tsx` — print window generation
- Modify: `apps/web/src/components/PublishGalleryModal.tsx` — gallery capture
- Modify: `apps/web/src/data/thumbnails.ts` — thumbnail capture

**What:** html-to-image and the print window need actual image data in the DOM (not storage paths). Before capture/print, resolve all `storage://` URLs to signed URLs and temporarily swap them into the DOM.

**Key details:**
- Create a `resolveAllStorageUrls(blocks)` helper that batch-resolves all storage paths
- For print: inject resolved URLs into the cloned DOM
- For html-to-image captures: resolve URLs before calling toCanvas (the signed URLs are CORS-safe since they're on the same Supabase project)

### Task 5: Migrate existing base64 on load

**Files:**
- Modify: `apps/web/src/pages/Editor.tsx` — post-load migration

**What:** When loading a poster that has base64 `imageSrc` values, migrate them to Storage in the background. Upload each base64 image to Storage, replace `imageSrc` with `storage://` path, and trigger an autosave. This is a one-time migration per poster — once saved, the base64 is gone.

**Key details:**
- Only run when a block has `imageSrc` starting with `data:` (base64)
- Fire-and-forget, non-blocking — the poster loads and renders immediately with base64
- After migration completes, update the store which triggers autosave
- Skip blocks with null imageSrc or remote URLs

## Verification

1. `npx tsc --noEmit` — type check
2. `npx vitest run` — all tests pass
3. Upload a new image → verify it goes to Storage (check network tab for storage upload)
4. Reload the poster → verify the image loads via signed URL
5. Open an old poster with base64 images → verify background migration runs
6. Print the poster → verify images appear in print preview
7. Check autosave payload size in network tab — should be KBs, not MBs
