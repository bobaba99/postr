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
 *   - Only a change is saved: the first render is skipped (loading a
 *     poster into the store must not immediately save the same snapshot
 *     back), and so is React StrictMode's second run of the effect at
 *     mount, which changes nothing.
 *   - Switching posters mid-debounce cancels the pending save — we
 *     never write the outgoing doc under the incoming id — and a write
 *     for the outgoing poster that fails after the switch is not shown
 *     or retried.
 *   - Unmount flushes any pending debounce so in-flight edits aren't
 *     silently dropped when the user navigates away.
 *   - Errors are captured into status instead of thrown — the editor
 *     stays usable and the pill switches to an error state.
 *   - A change is unsaved until a write of it succeeds (fix 27,
 *     docs/fixes/27-keep-work-safe.md; OF-05, plan item 8). The pending
 *     change used to be cleared as the request went out, so a failed save
 *     was never tried again, and closing the tab after it gave no warning.
 *     Now a failure keeps it pending and retries after 2, 5, 10 and 30 s,
 *     then every 30 s, at once when the browser says it is back online,
 *     and 800 ms after a new edit; the tab warns before closing while a
 *     change is unsaved or a write is out.
 *   - One write at a time. Two writes in flight could land in either
 *     order, and an earlier, slower one put an older poster over a newer
 *     one (MEASURED, fix 27, S8). A change made during a write is written
 *     after it.
 *   - `flushNow` resolves true once every change made before the call is
 *     stored: ⌘S and the sidebar's Duplicate read it. An edit made while
 *     its write is out is not waited for (it stays pending, for its own
 *     debounce); this line said "nothing is left unsaved" until fix 27's
 *     review round 2 (R2-A7). A name passed to it that the server already
 *     holds is no change: with nothing pending, nothing is written (fix 27,
 *     round 2 of the restarted review, N2-F3).
 */
import { useEffect, useRef, useState } from 'react';
import { upsertPoster } from '@/data/posters';
import { captureThumbnail } from '@/data/thumbnails';
import { supabase } from '@/lib/supabase';
import { reportUiSignal } from '@/lib/diagnostics';
import { sheetInches } from '@/poster/constants';
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
   * same event handler). Resolves true once every change made before the
   * call is stored, false when the write failed (it is retried, as any
   * failed save is).
   */
  flushNow: (overrideTitle?: string) => Promise<boolean>;
}

const DEBOUNCE_MS = 800;

/** Wait before retrying after the 1st, 2nd, 3rd and 4th failure in a row; then the last, again and again. */
export const RETRY_DELAYS_MS = [2000, 5000, 10000, 30000];

/** The diagnostics API takes attempt numbers up to 1000 (apps/api/src/diagnostics.ts). */
const MAX_REPORTED_ATTEMPT = 1000;

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

/**
 * Bucket a save failure into a short, stable reason for the log.
 *
 * Kept coarse on purpose: the raw message can vary per backend and is
 * not safe to treat as an enum, but the distinction that matters when
 * reading the log — could-not-reach vs. was-refused — is stable.
 */
function classifySaveError(
  error: Error,
): 'permission_denied' | 'auth' | 'network' | 'other' {
  const m = error.message.toLowerCase();
  if (m.includes('permission denied') || m.includes('row-level security')) {
    return 'permission_denied';
  }
  if (m.includes('jwt') || m.includes('token') || m.includes('session')) {
    return 'auth';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'network';
  }
  return 'other';
}

/** Strip HTML tags to get plain text for the poster title column. */
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

export function useAutosave(
  posterId: string | null,
  doc: PosterDoc | null,
  displayTitle?: string,
): AutosaveState {
  const [state, setState] = useState<Omit<AutosaveState, 'flushNow'>>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
  });

  // Refs that survive re-renders without triggering effect re-runs.
  /** The one timer: the debounce after an edit, or the next retry. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The change not saved yet, or null when the server has everything. Set
   * by every edit; cleared only when a write of this very change succeeds,
   * so a failed write leaves it to retry and an edit made during a write
   * stays to be written next.
   */
  const pendingRef = useRef<{ id: string; doc: PosterDoc } | null>(null);
  /** The write in flight, if any: one at a time. */
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  /** False once the editor has gone: no retry is scheduled after that. */
  const aliveRef = useRef(true);
  const pendingTitleRef = useRef<string | undefined>(displayTitle);
  /**
   * The poster name the server holds: as loaded (the store's name is the
   * row's title), then the one each write of the open poster that succeeded
   * carried. A name passed to `flush` that equals it is no change to write.
   */
  const storedTitleRef = useRef<string | undefined>(displayTitle);
  /** The inputs the debounce effect last acted on; at first, the poster as loaded. */
  const seenRef = useRef({ doc, posterId, displayTitle });
  /**
   * Consecutive-failure tracking for diagnostics. A single failed save is
   * usually a blip the next cycle recovers from; a run of them means the
   * user has been editing against a backend that is not accepting writes,
   * which is what needs to reach the log.
   */
  const saveFailStreakRef = useRef(0);
  const saveFailFirstAtRef = useRef(0);
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
  // The user this editor was opened for. The editor opens only the signed-in
  // user's own poster, so that is its owner. A capture uploads into the
  // signed-in user's storage folder, so one that runs after the user changed
  // (a sign-in to another account in another tab, then the save's idle-time
  // capture, or the final capture as the editor closes) would put this
  // poster's image in the other account's folder (fix 23, gap G3).
  // Read from the session the client holds, not over the network: one
  // failed lookup would otherwise turn thumbnails off for the session
  // (fix 23, CRa-5).
  const openedForRef = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    openedForRef.current = supabase.auth.getSession().then(({ data }) => data?.session?.user?.id ?? null);
  }, []);

  const runThumbnailCapture = (id: string) => {
    lastCaptureRef.current = Date.now();
    captureDirtyRef.current = false;
    const openedFor = openedForRef.current;
    if (!openedFor) return;
    void Promise.all([openedFor, supabase.auth.getUser()]).then(([owner, { data: userData }]) => {
      const uid = userData?.user?.id;
      if (!uid || uid !== owner) return;
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
      idle(() => runThumbnailCapture(id), {
        timeout: THUMBNAIL_IDLE_TIMEOUT_MS,
      });
    } else {
      window.setTimeout(() => runThumbnailCapture(id), 0);
    }
  };

  /** (Re)arm the one timer: the next attempt in `ms`. Nothing once the editor has gone. */
  const schedule = (ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!aliveRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, ms);
  };

  // One write of `change`: true when it was stored. A failure leaves the
  // change pending and schedules the retry.
  const write = async (change: { id: string; doc: PosterDoc }): Promise<boolean> => {
    const { id, doc: data } = change;
    // After a failure the poster stays "not saved" until a write succeeds,
    // the retry's own write too: the pill keeps "Not saved — retrying…" and
    // the Poster name's button its "Save". They read "Saving…" and "✓ Saved"
    // while the retry was out (MEASURED, fix 27, keep-work-check K9r: the
    // button in every reading before the name was stored, three engines).
    setState((s) => (s.status === 'error' ? s : { ...s, status: 'saving', error: null }));
    // The name this write carries, as asked (before a title taken from the
    // title block stands in for an empty one below).
    const sentTitle = pendingTitleRef.current;
    try {
      // Sync the display title (sidebar "Poster Title" field) to the
      // posters.title column. Falls back to extracting the title
      // block's content if no display title is set.
      // Use display name if set, otherwise auto-fill from the title block
      let titleText = pendingTitleRef.current?.trim() ?? '';
      if (!titleText) {
        const titleBlock = data.blocks.find((b) => b.type === 'title');
        titleText = titleBlock?.content
          ? stripHtml(titleBlock.content).trim()
          : '';
      }
      // Does NOT write back to the store, so the sidebar's Poster name field
      // keeps the store's value (an earlier comment said it did; it never
      // has). The ref is re-synced from `displayTitle` on every render, so
      // this assignment lasts only until then; later saves derive the title
      // the same way again.
      if (titleText && !pendingTitleRef.current?.trim()) {
        pendingTitleRef.current = titleText;
      }
      // The row's width_in/height_in give the dashboard card its shape. They
      // were only ever written when a poster was created or imported, so a
      // resized poster's thumbnail was cropped by a card of the old shape
      // (docs/fixes/02-poster-size.md, cause E). Every save now carries them.
      const widthIn = sheetInches(data.widthIn, NaN);
      const heightIn = sheetInches(data.heightIn, NaN);
      await upsertPoster(id, {
        data,
        ...(titleText ? { title: titleText } : {}),
        ...(Number.isFinite(widthIn) && Number.isFinite(heightIn) ? { widthIn, heightIn } : {}),
      });
      saveFailStreakRef.current = 0;
      // Saved, unless an edit came in while the write was out: that newer
      // change stays pending, with its own timer from the effect below.
      if (pendingRef.current === change) pendingRef.current = null;
      if (id === posterIdRef.current) storedTitleRef.current = sentTitle;
      setState({ status: 'saved', lastSavedAt: new Date(), error: null });

      // Fire-and-forget thumbnail capture — never blocks editing, and
      // deliberately does NOT run on every save. See scheduleThumbnail.
      scheduleThumbnail(id);
      return true;
    } catch (err) {
      // Another poster was opened in this editor while the write was out
      // (the in-editor Duplicate's "Open copy", or Back after it). The change
      // was dropped with the switch (the effect below), so this failure is
      // not the new poster's to show or retry: it used to leave the new
      // poster's pill on "Not saved — retrying…" for good, with nothing
      // pending (MEASURED, fix 27 review round 1, R1-A3).
      if (id !== posterIdRef.current) return false;
      const error = err instanceof Error ? err : new Error(String(err));
      const now = Date.now();
      if (saveFailStreakRef.current === 0) saveFailFirstAtRef.current = now;
      saveFailStreakRef.current += 1;
      // Supabase surfaces a `status` on PostgrestError; a network failure
      // has none. Clamp to the range the API accepts: the API checks each
      // event of a batch on its own, and refuses one with an out-of-range
      // value (a NaN status, an attempt over 1000), so that failure signal
      // would be lost; its siblings are kept (MEASURED, fix 27 review round
      // 1, R1-A4). The attempt number needs it: retries run as long as the
      // tab is open.
      const rawStatus = Number((err as { status?: number })?.status ?? 0);
      const status = Number.isFinite(rawStatus)
        ? Math.min(599, Math.max(0, Math.trunc(rawStatus)))
        : 0;
      reportUiSignal(
        {
          kind: 'autosave_failed',
          status,
          attempt: Math.min(MAX_REPORTED_ATTEMPT, saveFailStreakRef.current),
          sinceFirstMs: now - saveFailFirstAtRef.current,
          reason: classifySaveError(error),
        },
        { surface: 'poster-editor', posterId: id },
      );
      setState((s) => ({ ...s, status: 'error', error }));
      // Try again later, unless an edit already set a sooner attempt.
      const step = Math.min(saveFailStreakRef.current, RETRY_DELAYS_MS.length) - 1;
      if (!timerRef.current) schedule(RETRY_DELAYS_MS[step]!);
      return false;
    }
  };

  // Save now — at the tail of the debounce window, at a retry, on unmount,
  // or when flushNow() is invoked (⌘S, Duplicate, the Poster name field).
  // One write at a time: a call while a write is out waits for it, then
  // writes whatever is still pending.
  const flush = async (overrideTitle?: string): Promise<boolean> => {
    // Cancel any pending debounce — whoever called flush wants this
    // snapshot persisted now, not after another 800ms window.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (overrideTitle !== undefined) {
      pendingTitleRef.current = overrideTitle;
      // A title set in the same handler as this call has not rendered yet,
      // so nothing is pending for it: write the poster as it is now. Not a
      // name the server already holds: the sidebar's Duplicate and Enter in
      // the Poster name field pass the name along unchanged, and the write
      // queued for it, failing, was counted as an unsaved change ("not
      // saved yet", "Not saved — retrying…", a leave warning) with nothing
      // unsaved (MEASURED, fix 27, keep-work-check K11 and K11n, three
      // engines).
      const id = posterIdRef.current;
      const data = docRef.current;
      if (!pendingRef.current && id && data && overrideTitle !== storedTitleRef.current) {
        pendingRef.current = { id, doc: data };
      }
    }
    while (inFlightRef.current) await inFlightRef.current;
    const change = pendingRef.current;
    if (!change) return true;
    const run = write(change);
    inFlightRef.current = run;
    try {
      return await run;
    } finally {
      inFlightRef.current = null;
    }
  };

  useEffect(() => {
    // 1. Act on a change only. The first run sees the poster as loaded,
    //    which must not be saved straight back. React's StrictMode (the dev
    //    server) runs the effect a second time at mount with nothing
    //    changed; that is no edit either. It used to mark the loaded poster
    //    unsaved while the retry timer could not be armed (the editor counts
    //    as gone between the two runs), so a tab closed with no edit asked
    //    to confirm leaving; on main it sent a save of the unchanged poster
    //    (MEASURED, fix 27 review round 1, R1-A7).
    const seen = seenRef.current;
    if (seen.doc === doc && seen.posterId === posterId && seen.displayTitle === displayTitle) return;
    seenRef.current = { doc, posterId, displayTitle };

    // 2. If posterId flipped, drop any pending save for the old id.
    //    The new poster has its own autosave cycle starting fresh.
    if (seen.posterId !== posterId) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      saveFailStreakRef.current = 0;
      storedTitleRef.current = displayTitle;
      setState({ status: 'idle', lastSavedAt: null, error: null });
      return;
    }

    // 3. Nothing to save if we don't have both an id and a doc.
    if (!posterId || !doc) return;

    // 4. Schedule a debounced save. Replacing the pending doc each
    //    time means only the newest snapshot is ever written.
    //    For title-only changes the doc reference is unchanged, but
    //    we still need it in the ref so flush() has data to write.
    //    A new edit restarts the wait, after a failure too.
    pendingRef.current = { id: posterId, doc };
    schedule(DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, posterId, displayTitle]);

  // Unmount: flush any pending save so nothing is lost, and try to
  // leave the dashboard with a current thumbnail. A failure here is not
  // retried: the editor has gone (its page, if it closed, warned first).
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const id = pendingRef.current?.id ?? posterIdRef.current;
      const hadPending = pendingRef.current !== null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (hadPending) void flush();

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
  // "leave site?" confirmation dialog while a change is unsaved: waiting
  // for its debounce, for a retry after a failed save, or for the write
  // that is out (a change stays pending until its write succeeds).
  // Browsers ignore custom messages for this dialog (shows their own
  // localized "Changes you made may not be saved." text) — the trick is
  // to call preventDefault() AND set returnValue on the event. Both are
  // required because older WebKit releases only honor one or the other.
  //
  // The handler runs synchronously and cannot await the write, so it
  // fires flush() optimistically and lets the browser hold the tab open.
  //
  // Back online: a pending change is written at once instead of at its
  // next retry.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingRef.current === null) return undefined;
      void flush();
      // Trigger the browser confirmation dialog. The exact string
      // is ignored by every modern browser — they show their own
      // localized message — but `returnValue` + `preventDefault`
      // are the documented cross-browser incantation.
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    const onOnline = () => {
      if (pendingRef.current !== null) void flush();
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, flushNow: flush };
}
