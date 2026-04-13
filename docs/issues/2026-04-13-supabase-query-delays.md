# Supabase Query Delays — Diagnosis & Fixes

Date: 2026-04-13
Diagnosed via: Chrome DevTools MCP (performance traces + network panel)

## Issue 1: Duplicate Supabase Fetches (React StrictMode)

### Symptom
Every page load fires 2 identical Supabase requests (poster load, poster listing, is_gallery_admin).

### Console Check
```
Network tab → filter by "fetch" → look for duplicate GET requests to:
  - /rest/v1/posters?select=*&id=eq.{id}    (editor load)
  - /rest/v1/posters?select=*&order=...       (dashboard listing)
  - /rest/v1/rpc/is_gallery_admin             (dashboard)
```

### Root Cause
React 18 StrictMode double-mounts components in development. Each mount's `useEffect` fires a Supabase fetch. The cleanup function sets a `cancelled` flag to prevent state updates but doesn't cancel the network request.

### Fix Applied
**File:** `apps/web/src/data/posters.ts`
- Added in-flight promise dedup cache (`inflightLoads` Map) to `loadPoster()`
- Same ID returns the existing in-flight promise instead of firing a new request
- Promise cleaned up on resolve/reject via `.finally()`

### Fix Remaining
- `listPosters()` — same pattern not yet applied
- `is_gallery_admin` RPC — same pattern not yet applied

---

## Issue 2: Dashboard Listing Fetches Full JSONB (920ms)

### Symptom
Navigating editor → dashboard takes ~1-2 seconds. Network tab shows `listPosters` response takes 920ms+.

### Console Check
```
Network tab → click the GET /rest/v1/posters?select=* request
Response Headers → x-envoy-upstream-service-time: 923
Response Body → massive JSON with base64 data URLs in blocks[].imageSrc
```

### Root Cause
`listPosters()` used `select('*')` which pulled the full `data` JSONB column including base64-encoded images for every poster. A single poster with one figure can have 1-5MB of base64 in its JSONB.

### Fix Applied
**File:** `apps/web/src/data/posters.ts`
- Changed `listPosters()` to select only metadata columns: `id,user_id,title,width_in,height_in,thumbnail_path,share_slug,is_public,created_at,updated_at`
- Server response time dropped from ~920ms to ~32ms

**File:** `apps/web/src/components/PosterCard.tsx`
- Updated to use `PosterListRow` type (no `data` field)
- Shows thumbnail image when `thumbnail_path` is set
- Falls back to letter initial when no thumbnail

---

## Issue 3: Base64 Images in JSONB Payload (Critical, Ongoing)

### Symptom
Every autosave PATCH transfers the full poster document including base64 images. A poster with 2 figures can be 5-10MB per save.

### Console Check
```
Network tab → filter PATCH requests to /rest/v1/posters
Request Body → look for "imageSrc":"data:image/png;base64,..."
Content-Length header shows payload size
```

### Root Cause
`readImageFile()` in `blocks.tsx` converts uploaded images to base64 data URLs via `FileReader.readAsDataURL()`. These are stored in `block.imageSrc` and persisted to the `data` JSONB column in Supabase.

### Fix In Progress
Migrating images from inline base64 to Supabase Storage (`poster-assets` bucket). See `docs/plans/2026-04-13-images-to-storage.md`.

---

## Issue 4: All 10 Google Fonts Loaded Eagerly (561ms)

### Symptom
Editor page load shows a 561ms CSS request to Google Fonts followed by 10+ font file downloads.

### Console Check
```
Network tab → filter by "font"
Look for: fonts.googleapis.com/css2?family=Charter&family=DM+Sans&...
Check timing: should be ~100ms for one font vs ~561ms for all 10
```

### Root Cause
A single Google Fonts URL loaded all 10 curated font families on every editor mount, regardless of which font the poster actually uses.

### Fix Applied
**File:** `apps/web/src/poster/PosterEditor.tsx`
- Replaced the monolithic `GOOGLE_FONTS_URL` with per-font URLs via `FONT_URL_FRAGMENTS` map
- `ensureFontLoaded(fontFamily)` loads only the poster's font (idempotent, tracks loaded fonts)
- Added `<link rel="preconnect">` hints for `fonts.googleapis.com` and `fonts.gstatic.com`
- Print window still loads all fonts (needs every font for detached document)

---

## Issue 5: GSAP Forced Reflows on Mount (84ms)

### Symptom
Performance trace shows 84ms of "Forced Reflow" during editor page load.

### Console Check
```
Performance tab → record a page load → look for:
  - Long "Recalculate Style" tasks in the flame chart
  - Warning markers labeled "Forced reflow"
  - Call frame: _getComputedProperty @ gsap.js
```

### Root Cause
`blockSelection()` GSAP animation fires in a `useEffect` when `selected` becomes true. On initial mount, no blocks are selected, but React StrictMode can trigger the effect. GSAP's `fromTo()` calls `getComputedStyle()` which forces a synchronous layout reflow.

### Fix Applied
**File:** `apps/web/src/poster/blocks.tsx`
- Added `hasMountedRef` to skip the GSAP animation on the component's first render
- Animation still plays on subsequent user-initiated block selections

---

## Quick Reference: Network Debugging Commands

```javascript
// In browser console — check poster payload size
fetch('/rest/v1/posters?select=*&id=eq.YOUR_ID', {
  headers: { 'apikey': 'YOUR_KEY', 'Authorization': 'Bearer YOUR_JWT' }
}).then(r => r.text()).then(t => console.log('Payload size:', (t.length / 1024).toFixed(1), 'KB'));

// Check if thumbnail exists for a poster
// Look for thumbnail_path in the listing response

// Monitor autosave payload size
// Network tab → filter PATCH → check Content-Length
```

---

## Issue 6: Handle Row pointer-events:none Blocks Button Clicks

### Symptom
Delete, move, and rotate buttons in the block handle row don't respond to real mouse clicks, but keyboard shortcuts and right-click context menu work.

### Root Cause
The handle row container had `pointerEvents: 'none'` to prevent its background from stealing clicks. But this prevented real mouse `pointerdown`/`pointerup` from targeting child buttons — the browser synthesized `click` events on the element BELOW the row, never reaching the buttons. `button.click()` in JS worked because it dispatches directly.

### Fix Applied
**File:** `apps/web/src/poster/blocks.tsx`
- Removed `pointerEvents: 'none'` from the handle row container
- Added `onClick` + `onPointerDown` `stopPropagation` on the row div to prevent gap clicks from deselecting

---

## Issue 7: didDragRef Stuck State Blocks Image Block Clicks

### Symptom
After dragging any block, clicking on image/logo blocks doesn't select them. All buttons inside the block stop working.

### Root Cause
`didDragRef.current` stays `true` after a drag because image blocks skip `onPointerDown` (to avoid browser image-drag), so the `onUp` handler that resets `didDragRef` never fires. The `onClickCapture` handler checks `didDragRef` and swallows clicks when it's true.

### Fix Applied
**File:** `apps/web/src/poster/blocks.tsx`
- `onClickCapture` now always resets `didDragRef.current = false` before calling `stopPropagation`

---

## Issue 8: Thumbnail Capture Causes Visible Flicker

### Symptom
Poster visually jumps/flickers every ~800ms during active editing.

### Root Cause
`captureThumbnail()` in `data/thumbnails.ts` set `el.style.transform = 'none'` on the live `#poster-canvas` during `toCanvas()` capture (100-500ms), then restored it. The poster visually jumped to 1x scale and back on every autosave.

### Fix Applied
**File:** `apps/web/src/data/thumbnails.ts`
- Clone the element off-screen (`left: -9999px`) and capture the clone
- Live DOM is never touched during capture

---

## Issue 9: Table Cell Selection Persists After Block Deselection

### Symptom
After clicking a table cell, clicking elsewhere (canvas background, another block) deselects the table block but the cell remains highlighted/focused.

### Root Cause
`activeCell` state lives inside `TableBlock` component. When the block is deselected, the component re-renders but `activeCell` state persists (React preserves state across re-renders for the same component instance).

### Fix Applied
**File:** `apps/web/src/poster/blocks.tsx`
- Added `selected` prop to `TableBlock`
- `useEffect` clears `activeCell`, `selectedRow`, `selectedCol`, `rangeStart`, `rangeEnd` when `selected` becomes false

---

## Issue 10: Undo Doesn't Work for Block Moves/Resize

### Symptom
After dragging a block to a new position, Cmd+Z doesn't restore the original position. The block stays where it was dropped.

### Root Cause
Block moves use `setBlocksSilent()` during the drag (to avoid flooding the undo stack with 60 entries/second). On `pointerup`, `setBlocks(blocksRef.current)` was called to commit — but `setBlocks` uses `withUndo` which snapshots the **current** `doc.blocks` before applying the change. Since `setBlocksSilent` already moved blocks to their final position, the "before" snapshot was identical to the "after" — making the undo entry a no-op.

### Fix Applied
**File:** `apps/web/src/poster/PosterEditor.tsx`
- Added `preDragBlocksRef` — captures blocks snapshot when drag crosses the 4px activation threshold
- On `pointerup`, temporarily restores pre-drag blocks via `setBlocksSilent`, then calls `setBlocks` with post-drag blocks
- `withUndo` now correctly snapshots the pre-drag state

---

## Issue 11: Phantom Undo Entries from Image onLoad Auto-Sizing

### Symptom
First Cmd+Z appears to do nothing, second Cmd+Z undoes two steps at once.

### Root Cause
Image block's `onLoad` handler called `onUpdate({ h: newH })` to auto-size the block to match image aspect ratio. This went through `withUndo`, pushing a phantom undo entry. `onLoad` fired on every render — storage URL resolution, zoom changes, React re-renders — each time creating an invisible undo entry (height change of 0-2px, below visual threshold).

### Fix Applied
**File:** `apps/web/src/poster/blocks.tsx`
- Removed `onLoad` auto-sizing handler entirely
- Auto-sizing only happens at upload time in `handleFile` (one-time, intentional)

---

## Issue 12: Base64 Migration Wipes Undo History

### Symptom
After loading a poster with base64 images, all previous undo history is lost.

### Root Cause
`migrateBase64ToStorage()` called `store.setPoster()` after uploading images to Storage. `setPoster` clears both `undoStack` and `redoStack` (by design — it's meant for loading a new poster, not updating the current one).

### Fix Applied
**File:** `apps/web/src/pages/Editor.tsx`
- Changed migration to use `store.setBlocksSilent(nextBlocks)` instead of `store.setPoster()`
- `setBlocksSilent` updates blocks without touching the undo stack
- Autosave still detects the change via doc reference change
