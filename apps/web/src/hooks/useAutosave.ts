/**
 * useAutosave — debounced poster persistence.
 *
 * Subscribes to `doc` changes (the in-memory PosterDoc driven by the
 * Zustand store) and pushes them to Supabase via `upsertPoster` on a
 * 800 ms debounce. The component tree never awaits the save — this
 * hook owns the save lifecycle and exposes a status so the UI can
 * render a "Saved · 2s ago" pill without blocking edits.
 *
 * Key invariants:
 *   - First render is skipped (loading a poster into the store must
 *     not immediately save the same snapshot back).
 *   - Switching posters mid-debounce cancels the pending save — we
 *     never write the outgoing doc under the incoming id.
 *   - Unmount flushes any pending debounce so in-flight edits aren't
 *     silently dropped when the user navigates away.
 *   - Errors are captured into status instead of thrown — the editor
 *     stays usable and the pill switches to an error state.
 */
import { useEffect, useRef, useState } from 'react';
import { upsertPoster } from '@/data/posters';
import { captureThumbnail } from '@/data/thumbnails';
import { supabase } from '@/lib/supabase';
import type { PosterDoc } from '@postr/shared';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: Error | null;
  /**
   * Cancel the debounce and persist the pending doc immediately.
   * Pass an overrideTitle to commit a title change that hasn't yet
   * propagated through React render (store update + flush in the
   * same event handler).
   */
  flushNow: (overrideTitle?: string) => Promise<void>;
}

const DEBOUNCE_MS = 800;

/**
 * Minimum gap between thumbnail captures. Autosave debounces at 800ms,
 * so without this a user nudging blocks with the arrow keys queues a
 * full canvas rasterisation roughly every second. 3s coalesces those
 * bursts while still keeping the dashboard thumbnail close to current.
 */
const THUMBNAIL_COOLDOWN_MS = 3000;

/**
 * Upper bound on how long a capture may wait for an idle window. A
 * poster being actively edited may never go idle, and a thumbnail that
 * never renders is worse than one that costs a frame.
 */
const THUMBNAIL_IDLE_TIMEOUT_MS = 2000;

/** Strip HTML tags to get plain text for the poster title column. */
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

export function useAutosave(posterId: string | null, doc: PosterDoc | null, displayTitle?: string): AutosaveState {
  const [state, setState] = useState<Omit<AutosaveState, 'flushNow'>>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
  });

  // Refs that survive re-renders without triggering effect re-runs.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDocRef = useRef<PosterDoc | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const pendingTitleRef = useRef<string | undefined>(displayTitle);
  const firstRenderRef = useRef(true);
  const lastPosterIdRef = useRef<string | null>(posterId);
  // Always-current refs so flushNow() can persist even when the debounce
  // effect hasn't scheduled yet (e.g. title change → user clicks Save
  // before React has committed the next render).
  const posterIdRef = useRef<string | null>(posterId);
  const docRef = useRef<PosterDoc | null>(doc);
  posterIdRef.current = posterId;
  docRef.current = doc;

  // Keep the title ref in sync (also read inside the effect below).
  pendingTitleRef.current = displayTitle;

  // ── Thumbnail capture throttling ──────────────────────────────────
  //
  // captureThumbnail is expensive on the main thread: it clones
  // #poster-canvas, inlines every computed style into a foreignObject
  // SVG, rasterises it, JPEG-encodes it, and uploads. Running that
  // after *every* autosave made rapid block moves stutter, because a
  // fast-moving user queues one capture per 800ms debounce window.
  //
  // Two guards, deliberately no drag-state plumbing:
  //   1. A cooldown, so bursts of edits coalesce into one capture.
  //   2. requestIdleCallback, so a capture that does run yields to
  //      pending input first. This gets most of the benefit of a
  //      "skip while dragging" gate without threading pointer state
  //      from useBlockDrag into this hook.
  //
  // captureDirtyRef records that we skipped a capture, so the unmount
  // path can force one and the dashboard still gets a fresh thumbnail.
  const lastCaptureRef = useRef(0);
  const captureDirtyRef = useRef(false);

  const runThumbnailCapture = (id: string) => {
    lastCaptureRef.current = Date.now();
    captureDirtyRef.current = false;
    void supabase.auth.getUser().then(({ data: userData }) => {
      const uid = userData?.user?.id;
      if (!uid) return;
      return captureThumbnail(uid, id).then((path) => {
        if (path) void upsertPoster(id, { thumbnailPath: path });
      });
    });
  };

  const scheduleThumbnail = (id: string, force = false) => {
    if (!force && Date.now() - lastCaptureRef.current < THUMBNAIL_COOLDOWN_MS) {
      captureDirtyRef.current = true;
      return;
    }
    // Forced captures (unmount) run immediately — deferring to idle
    // would race the component teardown and often never fire.
    if (force) {
      runThumbnailCapture(id);
      return;
    }
    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      idle(() => runThumbnailCapture(id), { timeout: THUMBNAIL_IDLE_TIMEOUT_MS });
    } else {
      window.setTimeout(() => runThumbnailCapture(id), 0);
    }
  };

  // Actual save — runs at the tail of the debounce window, on unmount,
  // or synchronously when flushNow() is invoked (e.g. the Sidebar "Save"
  // button needs the write to reach Supabase before a potential refresh).
  const flush = async (overrideTitle?: string) => {
    // Cancel any pending debounce — whoever called flush wants this
    // snapshot persisted now, not after another 800ms window.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const id = pendingIdRef.current ?? posterIdRef.current;
    const data = pendingDocRef.current ?? docRef.current;
    pendingIdRef.current = null;
    pendingDocRef.current = null;
    if (overrideTitle !== undefined) pendingTitleRef.current = overrideTitle;
    if (!id || !data) return;

    setState((s) => ({ ...s, status: 'saving', error: null }));
    try {
      // Sync the display title (sidebar "Poster Title" field) to the
      // posters.title column. Falls back to extracting the title
      // block's content if no display title is set.
      // Use display name if set, otherwise auto-fill from the title block
      let titleText = pendingTitleRef.current?.trim() ?? '';
      if (!titleText) {
        const titleBlock = data.blocks.find((b) => b.type === 'title');
        titleText = titleBlock?.content ? stripHtml(titleBlock.content).trim() : '';
      }
      // If title block content was used, also push it back to the store
      // so the sidebar Poster Name field shows the auto-filled value
      if (titleText && !pendingTitleRef.current?.trim()) {
        pendingTitleRef.current = titleText;
      }
      await upsertPoster(id, { data, ...(titleText ? { title: titleText } : {}) });
      setState({ status: 'saved', lastSavedAt: new Date(), error: null });

      // Fire-and-forget thumbnail capture — never blocks editing, and
      // deliberately does NOT run on every save. See scheduleThumbnail.
      scheduleThumbnail(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((s) => ({ ...s, status: 'error', error }));
    }
  };

  useEffect(() => {
    // 1. Skip the very first render so loading a poster from the
    //    server doesn't immediately save the same snapshot back.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      lastPosterIdRef.current = posterId;
      return;
    }

    // 2. If posterId flipped, drop any pending save for the old id.
    //    The new poster has its own autosave cycle starting fresh.
    if (lastPosterIdRef.current !== posterId) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingIdRef.current = null;
      pendingDocRef.current = null;
      lastPosterIdRef.current = posterId;
      return;
    }

    // 3. Nothing to save if we don't have both an id and a doc.
    if (!posterId || !doc) return;

    // 4. Schedule a debounced save. Replacing the pending doc each
    //    time means only the newest snapshot is ever written.
    //    For title-only changes the doc reference is unchanged, but
    //    we still need it in the ref so flush() has data to write.
    pendingIdRef.current = posterId;
    pendingDocRef.current = doc;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);

    return () => {
      // Cleanup is handled by the effect re-running (new timer
      // supersedes the old one) or by the unmount effect below.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, posterId, displayTitle]);

  // Unmount: flush any pending save so nothing is lost, and try to
  // leave the dashboard with a current thumbnail.
  useEffect(() => {
    return () => {
      const id = pendingIdRef.current ?? posterIdRef.current;
      // Bind to a local so TypeScript narrows it — reading the ref
      // again inside the branch widens back to `Timeout | null`.
      const timer = timerRef.current;
      const hadPending = timer !== null;
      if (timer !== null) {
        clearTimeout(timer);
        timerRef.current = null;
        void flush();
      }

      // Best-effort, explicitly not a guarantee. Two things can make
      // this a no-op: #poster-canvas may already be detached by the
      // time this cleanup runs (captureThumbnail returns null), and
      // captureThumbnail's module-level `capturing` guard drops the
      // call outright if an earlier capture is still in flight.
      //
      // That is acceptable. The cooldown bounds staleness at
      // THUMBNAIL_COOLDOWN_MS of editing, so the worst case is a
      // thumbnail missing the last ~3s of edits — a cosmetic gap on a
      // 400px preview, refreshed on the next edit session. Do not
      // rewrite this into something that blocks teardown to "fix" it.
      if (id && (hadPending || captureDirtyRef.current)) {
        scheduleThumbnail(id, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab close: flush any pending save AND show the browser's native
  // "leave site?" confirmation dialog if there are un-flushed edits
  // or a save is currently in flight. Browsers ignore custom messages
  // for this dialog (shows their own localized "Changes you made may
  // not be saved." text) — the trick is to call preventDefault() AND
  // set returnValue on the event. Both are required because older
  // WebKit releases only honor one or the other.
  //
  // We don't gate on `state.status === 'saving'` because the
  // BeforeUnloadEvent handler runs synchronously and can't await
  // the in-flight PATCH anyway — instead we trust the pending
  // timer + dirty ref as the "are there unsaved edits?" signal,
  // fire flush() optimistically, and let the browser decide
  // whether to hold the tab open.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasPendingEdits =
        timerRef.current !== null &&
        pendingDocRef.current !== null &&
        pendingIdRef.current !== null;
      if (hasPendingEdits) {
        clearTimeout(timerRef.current!);
        timerRef.current = null;
        void flush();
        // Trigger the browser confirmation dialog. The exact string
        // is ignored by every modern browser — they show their own
        // localized message — but `returnValue` + `preventDefault`
        // are the documented cross-browser incantation.
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, flushNow: flush };
}
