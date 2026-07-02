# Thumbnail Capture Lag When Moving Blocks Quickly

Date: 2026-04-26
Status: Known issue, deferred. User-reported during fast block movement in editor.

## Symptom

When the user drags / nudges blocks in rapid succession (e.g. moving several blocks one after another, or holding arrow keys), there's a perceptible lag / stutter in the editor.

## Suspected Root Cause

`captureThumbnail` runs after **every** successful autosave ([useAutosave.ts:114-120](apps/web/src/hooks/useAutosave.ts#L114-L120)) — fire-and-forget, but still expensive. Each capture:

1. Clones `#poster-canvas` (15+ children, each with computed styles)
2. Wraps in a fixed-position 0×0 div appended to body
3. Runs html-to-image's `toCanvas` — walks the cloned subtree, inlines computed styles into a `<foreignObject>` SVG, rasterizes it via `Image` + `drawImage`
4. JPEG-encodes the canvas
5. Uploads to Supabase Storage
6. Issues a second `upsertPoster` call to write the new `thumbnail_path`

Steps 1–4 happen on the main thread. With autosave debounced at 800ms, a fast-moving user can queue many capture cycles back-to-back, each costing tens of milliseconds of layout/paint work.

## Quick Wins (rank by impact)

1. **Coalesce captures** — only capture if 2-3 seconds have passed since the last capture (not after every save). Most edits don't change the visual significantly.
2. **Skip capture during active drag** — `useBlockDrag` knows when a pointer is down. Don't capture while `dragRef.current !== null`. Capture once on pointerup.
3. **`requestIdleCallback`** wrapper — only run captureThumbnail when the browser is idle.
4. **Move capture off main thread** — `OffscreenCanvas` + Web Worker. html-to-image needs DOM access so this is non-trivial; would need a different rasterization path.

## Likely Smallest-Diff Fix

Add a per-poster cooldown in `useAutosave.ts`:

```ts
const lastCaptureRef = useRef<number>(0);
const CAPTURE_COOLDOWN_MS = 3000;

// inside the success branch of flush():
const now = Date.now();
if (now - lastCaptureRef.current >= CAPTURE_COOLDOWN_MS) {
  lastCaptureRef.current = now;
  supabase.auth.getUser().then(...).then(captureThumbnail).then(...);
}
```

Plus a final flush on editor unmount that **always** captures (so the dashboard ends up with a fresh thumbnail when the user leaves):

```ts
// useAutosave.ts unmount effect already calls flush(). Pass a
// `forceCapture: true` flag through so it bypasses the cooldown.
```

## Out of Scope (this note)

- Fully redesigning thumbnail generation as a server-side job (would need a Supabase Edge Function with headless Chromium — overkill for MVP).
- Switching off html-to-image to a synthetic Canvas-based renderer that draws block rects directly from `PosterDoc` (faster but loses font/style fidelity).

## Related Files

- [apps/web/src/data/thumbnails.ts](apps/web/src/data/thumbnails.ts) — capture + upload
- [apps/web/src/hooks/useAutosave.ts](apps/web/src/hooks/useAutosave.ts) — fire-and-forget call site (lines 114-120)
- [apps/web/src/poster/blocks.tsx](apps/web/src/poster/blocks.tsx) — block drag/move handlers (would need to expose drag state to autosave)
