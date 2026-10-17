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
 *     silently dropped when the user navigates away, and a change not
 *     stored yet is kept by the page until it is (fix 38, review round 1,
 *     R1-1; below).
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
 *   - Leaving the page saves the change waiting (fix 38,
 *     docs/fixes/38-save-on-leave.md). An edit made less than 800 ms before
 *     the page was left was lost in Chromium and WebKit: the save fired at
 *     `beforeunload` went through the Supabase client, which reads the
 *     session asynchronously before it sends, and the page went first (no
 *     request made, or one made after the leave began and cancelled with
 *     the page: MEASURED). Now `beforeunload` (before the browser's
 *     dialog), `pagehide`, the tab hidden and the editor unmounting each
 *     write the change at once, with a request the browser finishes after
 *     the page has gone (`keepalive`). One write at a time still: a change
 *     made while a write is out waits for it, as before, and the leave
 *     dialog protects it; and after a write the browser cut off as the page
 *     went, or one that failed with no answer CUT_BEFORE_LEAVE_MS or less
 *     before it began to go (it may still be stored), nothing newer is sent
 *     for CUT_OFF_SETTLE_MS, which an older poster could otherwise overwrite
 *     (MEASURED on main in Firefox; with a slow next page, on the first
 *     version of this fix in Firefox and WebKit, review round 1, R1-2; at
 *     WebKit's Back, which fails the write out before beforeunload, review
 *     round 2, R2-1). A server's error answer is not such a write: it says
 *     nothing was stored (review round 3, R3-1).
 *   - The editor closed inside the app (the dashboard, the account page)
 *     with a change not stored yet: the change is kept by the page, not by
 *     the editor, until a write of it is stored (fix 38, review round 1,
 *     R1-1). This hook goes on for it after the editor has gone: the retries
 *     as in the editor, the leave dialog and the leave's write when the tab
 *     is then closed. The poster opened again opens from it (keptChanges.ts
 *     `keptChange`, pages/Editor.tsx), and its editor takes the saving
 *     over: one writer. Given up when the signed-in user changes (the
 *     session that could store it has gone). The change used to go with the
 *     editor: a failing save, or the tab closed while a save was out, lost
 *     it with no warning (MEASURED on main and on the first version of this
 *     fix, keep-work-check L3-inapp-*, three engines).
 */
import { useEffect, useRef, useState } from 'react';
import { upsertPoster, type SaveOptions } from '@/data/posters';
import { forgetKeptBy, keeperOf, recordKept, type Change, type HandedOver } from './keptChanges';
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
 * After a write the browser cut off as the page was being left (an ordinary
 * request out at `beforeunload` or `pagehide` that then failed with no
 * answer; a server's error answer says it stored nothing), nothing
 * newer is sent for this long: the server may have received the cut write
 * and still store it, over anything sent after (fix 38, L4; review round 1,
 * R1-2: a newer write sent 2 s after the cut-off, by the retry or at
 * `pagehide`, was stored before the cut one, which then overwrote it, in
 * Firefox and WebKit with a slow next page). It bounds that window, it does
 * not order the writes: one the server applies later still can. 10 s is
 * past Supabase's default statement timeout for the `authenticated` role,
 * which guests' sessions use too (8 s: its documentation, "Timeouts", read
 * 2026-10-17; not read from this project's settings); a write held before
 * it reaches the database is not bounded by it.
 */
export const CUT_OFF_SETTLE_MS = 10_000;

/**
 * For this long after an ordinary write fails with no answer, a leave event
 * (`beforeunload`, `pagehide`) counts the failure as cut off by the leave, as
 * a write still out then is, and a save that was waiting on that write, or
 * that its own timer starts meanwhile (the 800 ms wait after an edit, a
 * retry), waits it out before it is sent (fix 38, review round 2, R2-1;
 * round 3, R3-2): WebKit's Back stops the page's loads, failing the write
 * out, a few ms before it fires `beforeunload` (2–12 ms, MEASURED,
 * keep-work-check L4-slow-write-then-*-back-traced). The leave found nothing
 * out and sent the newer poster at once, and the cut write, which the server
 * had, landed over it; and a save sent between the failure and the leave
 * event (one that waited behind the cut write, or the newer edit's own wait
 * firing then) was stored under it too (L4-slow-write-then-own-save-back-
 * traced on main, 1 of 4 runs; L4-gap-* on correction 2, R3-2). A bounded
 * choice: a failure with no answer this close to a leave (the network) is
 * counted too, as the page cannot tell it from an engine's cut, and the
 * leave's write is then not sent (the dialog shows first, L5); with no leave,
 * the held save goes when the 200 ms are over. A server's error answer (an
 * HTTP status) opens no window: nothing was stored (review round 3, R3-1).
 * Timed by a timer, not by comparing clock readings (R1-4).
 */
export const CUT_BEFORE_LEAVE_MS = 200;

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
  /**
   * False once nothing is left to save after the editor has gone: no retry
   * is scheduled after that. Since fix 38's review round 1 the editor's
   * going is not enough: a change not stored yet is kept, and saved, until
   * it is (`keep`), unless it is handed to the editor opened again.
   */
  const aliveRef = useRef(true);
  /** The editor is open (the hook mounted). */
  const mountedRef = useRef(true);
  /** This hook, as the keeper of a change (keptChanges.ts). */
  const selfRef = useRef({});
  /**
   * The session's access token as the client last reported it (fix 38): a
   * write made as the page is left is sent at once, and the client's own
   * session read is asynchronous.
   */
  const tokenRef = useRef<string | null>(null);
  /** The signed-in user, as the client last reported it. */
  const sessionUserRef = useRef<string | null>(null);
  /** The user the poster was opened for, once known (`openedForRef`). */
  const ownerRef = useRef<string | null>(null);
  /** The user a change kept after the editor closed was kept for: another, or none, gives it up. */
  const keptForRef = useRef<string | null>(null);
  /** Removes the page's leave listeners and the session subscription (`attach`), while they are on. */
  const detachRef = useRef<(() => void) | null>(null);
  /**
   * The write out: whether it was sent with `keepalive`, and whether the
   * page began to be left (`beforeunload`, `pagehide`) while it was out.
   */
  const outRef = useRef<{ keepalive: boolean; atLeave: boolean } | null>(null);
  /**
   * The page being left asked for a request that outlives it: the next write
   * sent carries `keepalive`, whichever caller sends it (review round 1,
   * R1-3: the change's own save, waiting on the write out, sent it as an
   * ordinary request while the page went). Spent by that write, or by a
   * flush that finds nothing it may write (review round 2, R2-3: after Stay,
   * or the tab shown again, the next ordinary save, any time later, went as
   * the hand-built request, which does not refresh an expiring token).
   */
  const keepaliveAskedRef = useRef(false);
  /**
   * A write the browser cut off as the page was being left (an ordinary one
   * out at a leave event, then failed): it may still be stored after anything
   * sent now, so nothing is sent for CUT_OFF_SETTLE_MS (fix 38, L4; review
   * round 1, R1-2). `settleTimerRef` ends it.
   */
  const cutOffRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * An ordinary write failed with no answer less than CUT_BEFORE_LEAVE_MS ago:
   * a save that waited on it, or that its own timer started, waits until
   * `done`, and a leave event now counts the failure as cut off (review round
   * 2, R2-1; round 3, R3-2). Its timer, the leave, or `stop` ends it.
   */
  const failWindowRef = useRef<{ done: Promise<void>; end: () => void } | null>(null);
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
    // Known to the change kept after the editor closes (fix 38, `keep`).
    void openedForRef.current.then((owner) => { ownerRef.current = owner; }, () => {});
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

  /**
   * (Re)arm the one timer: the next attempt in `ms`. Nothing once the editor
   * has gone. Its save waits out the moment after a failure (`fromTimer`).
   */
  const schedule = (ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!aliveRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush(undefined, { fromTimer: true });
    }, ms);
  };

  // One write of `change`: true when it was stored. A failure leaves the
  // change pending and schedules the retry. Sent with `keepalive` when the
  // page being left asked for it (`keepaliveAskedRef`).
  const write = async (change: Change): Promise<boolean> => {
    const { id, doc: data } = change;
    const keepalive = keepaliveAskedRef.current;
    keepaliveAskedRef.current = false;
    const out = { keepalive, atLeave: false };
    outRef.current = out;
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
      const update = {
        data,
        ...(titleText ? { title: titleText } : {}),
        ...(Number.isFinite(widthIn) && Number.isFinite(heightIn) ? { widthIn, heightIn } : {}),
      };
      // The page is being left (fix 38): sent at once, to outlive the page.
      const leaving: SaveOptions = { keepalive: true, accessToken: tokenRef.current };
      await (keepalive ? upsertPoster(id, update, leaving) : upsertPoster(id, update));
      if (outRef.current === out) outRef.current = null;
      saveFailStreakRef.current = 0;
      // Saved, unless an edit came in while the write was out: that newer
      // change stays pending, with its own timer from the effect below.
      if (pendingRef.current === change) pendingRef.current = null;
      if (id === posterIdRef.current) storedTitleRef.current = sentTitle;
      setState({ status: 'saved', lastSavedAt: new Date(), error: null });

      // Fire-and-forget thumbnail capture — never blocks editing, and
      // deliberately does NOT run on every save. See scheduleThumbnail.
      // Not once the editor has gone (a kept change's write, fix 38): the
      // canvas on the page then is not this poster's.
      if (mountedRef.current) scheduleThumbnail(id);
      return true;
    } catch (err) {
      if (outRef.current === out) outRef.current = null;
      // Another poster was opened in this editor while the write was out
      // (the in-editor Duplicate's "Open copy", or Back after it). The change
      // was dropped with the switch (the effect below), so this failure is
      // not the new poster's to show or retry: it used to leave the new
      // poster's pill on "Not saved — retrying…" for good, with nothing
      // pending (MEASURED, fix 27 review round 1, R1-A3).
      if (id !== posterIdRef.current) return false;
      // The server's answer, as the data layer puts it on the error
      // (`SaveError`): its HTTP status, 0 when there was none (the network,
      // or the browser cut the request off). It used to be always 0: the
      // data layer threw a plain Error (review round 3, R3-1). Clamped to the
      // range the API accepts: the API checks each event of a batch on its
      // own, and refuses one with an out-of-range value (a NaN status, an
      // attempt over 1000), so that failure signal would be lost; its
      // siblings are kept (MEASURED, fix 27 review round 1, R1-A4).
      const rawStatus = Number((err as { status?: number })?.status ?? 0);
      const status = Number.isFinite(rawStatus)
        ? Math.min(599, Math.max(0, Math.trunc(rawStatus)))
        : 0;
      // An ordinary request out when the page began to be left, that failed
      // with no answer: the browser may have cut it off after the server
      // received it (fix 38, L4). The leave's own write is keepalive, not cut
      // off by the page going (review round 1, R1-4: it was counted by
      // comparing two clock readings). One that fails now may be the leave's
      // too, if the page begins to go in the next moment (`noteFailure`;
      // review round 2, R2-1). A server's error answer is neither: it says
      // the write was not stored (review round 3, R3-1: a 500 counted as a
      // cut held the next write 10 s, or lost it after the dialog).
      if (status === 0) {
        if (out.atLeave) markCutOff();
        else if (!out.keepalive) noteFailure();
      }
      const error = err instanceof Error ? err : new Error(String(err));
      const now = Date.now();
      if (saveFailStreakRef.current === 0) saveFailFirstAtRef.current = now;
      saveFailStreakRef.current += 1;
      // The attempt number is clamped too: retries run as long as the tab is
      // open.
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
  const flush = async (
    overrideTitle?: string,
    { keepalive = false, fromTimer = false }: { keepalive?: boolean; fromTimer?: boolean } = {},
  ): Promise<boolean> => {
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
    // Whether this save waits out the moment after a failure (below): one
    // that waits on a write out, or one its own timer started.
    const mayHold = inFlightRef.current !== null || fromTimer;
    // The page being left asks the next write sent to outlive it, whoever
    // sends it (fix 38, review round 1, R1-3).
    if (keepalive) keepaliveAskedRef.current = true;
    while (inFlightRef.current) {
      await inFlightRef.current;
    }
    // A save that waited on a write which then failed with no answer (an
    // ordinary one), or that its own timer started in the moment after such a
    // failure (the 800 ms wait after an edit, a retry), waits until
    // CUT_BEFORE_LEAVE_MS after the failure: the page may be about to go, the
    // failure being its cut, and the save would land before the cut write
    // (review round 2, R2-1's sibling, MEASURED on main in WebKit, 1 of 4
    // runs; round 3, R3-2, the timer's save, MEASURED on correction 2: the
    // WebKit build 1 of 21, keep-work-check L4-gap-*, and
    // L4-cut-then-debounce-* in the three engines). A save the user or the
    // page asks for after the failure (back online, ⌘S, the unmount, a
    // take-over) is not held.
    while (mayHold && failWindowRef.current) {
      await failWindowRef.current.done;
      while (inFlightRef.current) await inFlightRef.current;
    }
    // A write was cut off as the page was left, and may still be stored: a
    // newer one sent now could land first and be overwritten (MEASURED on
    // main in Firefox, fix 38). The change is written when the wait is over
    // (`markCutOff`).
    // Nothing to write now (cut off, or nothing pending): the leave's ask is
    // for a write sent at the leave, not for one any time later (review
    // round 2, R2-3).
    if (cutOffRef.current || !pendingRef.current) keepaliveAskedRef.current = false;
    if (cutOffRef.current) return false;
    const change = pendingRef.current;
    if (!change) return true;
    const run = write(change);
    inFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (inFlightRef.current === run) inFlightRef.current = null;
      // The editor has gone and its change is stored: nothing is kept.
      if (!mountedRef.current && pendingRef.current === null) stop();
    }
  };

  /** A write was cut off as the page was being left: nothing newer is sent for CUT_OFF_SETTLE_MS. */
  const markCutOff = () => {
    cutOffRef.current = true;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      cutOffRef.current = false;
      if (aliveRef.current && pendingRef.current !== null) void flush();
    }, CUT_OFF_SETTLE_MS);
  };

  /**
   * An ordinary write failed with no answer: for CUT_BEFORE_LEAVE_MS a save
   * that waited on it, or that its own timer starts, waits too, and a leave
   * event counts the failure as cut off (review round 2, R2-1; round 3, R3-2).
   */
  const noteFailure = () => {
    endFailWindow();
    let release: () => void = () => {};
    const done = new Promise<void>((resolve) => { release = resolve; });
    const timer = setTimeout(() => endFailWindow(), CUT_BEFORE_LEAVE_MS);
    const window_ = {
      done,
      end: () => {
        clearTimeout(timer);
        if (failWindowRef.current === window_) failWindowRef.current = null;
        release();
      },
    };
    failWindowRef.current = window_;
  };

  /** The moment after a failure is over: whatever waits on it goes on. */
  const endFailWindow = () => {
    failWindowRef.current?.end();
  };

  /**
   * The page began to be left: an ordinary write out now may be cut off with
   * it, and one that failed a moment ago may have been (WebKit's Back fails
   * it first; review round 2, R2-1).
   */
  const markOutAtLeave = () => {
    const out = outRef.current;
    if (out && !out.keepalive) out.atLeave = true;
    if (failWindowRef.current && pendingRef.current !== null) {
      markCutOff();
      endFailWindow();
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
      // A change kept for the poster opened now by its closed editor: this
      // editor writes it (one writer; fix 38, review round 1).
      if (posterId) takeOver(posterId);
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

  // Leaving the page (fix 38, docs/fixes/38-save-on-leave.md): the change
  // waiting is written at once, with a request the browser finishes after
  // the page has gone. One write at a time: while a write is out, the change
  // is written right after it is stored (the page may still be there then;
  // if it has gone, the leave dialog showed first), and not while a write the
  // leave cut off may still land (`flush`, `markCutOff`).
  const leaveWrite = () => {
    if (pendingRef.current === null) return;
    void flush(undefined, { keepalive: true });
  };

  // Tab close, reload, a link or an address: write the change waiting (as
  // above) AND show the browser's native "leave site?" confirmation dialog
  // while a change is unsaved: waiting for its debounce, for a retry after a
  // failed save, or for the write that is out (a change stays pending until
  // its write succeeds). Browsers ignore custom messages for this dialog
  // (shows their own localized "Changes you made may not be saved." text) —
  // the trick is to call preventDefault() AND set returnValue on the event.
  // Both are required because older WebKit releases only honor one or the
  // other.
  //
  // The write goes before the dialog: a handler cannot await it, and after
  // the dialog the page may go without running anything else. `pagehide`
  // (the page going, after the dialog; a phone's browser may fire no
  // beforeunload at all) and the tab hidden (the last moment a phone
  // reliably gives) write it too when nothing was sent before. A Back whose
  // page is kept for Forward (bfcache) still fires beforeunload in
  // Chromium, and the dialog shows (keep-work-check LB-bfcache-*, review
  // round 2, R2-5).
  //
  // Back online: a pending change is written at once instead of at its
  // next retry.
  //
  // The session's token, which the leave's write carries (fix 38): the
  // client reports the session on subscribing and at every change (a
  // refresh, a sign-out).
  //
  // On while the editor is open, and after it has gone while it keeps a
  // change not stored yet (`keep`): `detachRef` takes them off.
  const attach = () => {
    if (detachRef.current) return;
    const handler = (e: BeforeUnloadEvent) => {
      markOutAtLeave();
      if (pendingRef.current === null) return undefined;
      leaveWrite();
      // Trigger the browser confirmation dialog. The exact string
      // is ignored by every modern browser — they show their own
      // localized message — but `returnValue` + `preventDefault`
      // are the documented cross-browser incantation.
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    const onPageHide = () => {
      markOutAtLeave();
      leaveWrite();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leaveWrite();
    };
    const onOnline = () => {
      if (pendingRef.current !== null) void flush();
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      tokenRef.current = session?.access_token ?? null;
      sessionUserRef.current = session?.user?.id ?? null;
      // A kept change is the user's it was kept for: with another user, or
      // none, signed in, no write of it can be stored.
      if (keptForRef.current !== null && sessionUserRef.current !== keptForRef.current) {
        pendingRef.current = null;
        stop();
      }
    });
    detachRef.current = () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      data?.subscription?.unsubscribe();
    };
  };

  /** Nothing left to save after the editor has gone: no retry, no listener, nothing kept. */
  const stop = () => {
    aliveRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    cutOffRef.current = false;
    endFailWindow();
    detachRef.current?.();
    detachRef.current = null;
    forgetKeptBy(selfRef.current);
    keptForRef.current = null;
  };

  /**
   * The editor has gone with a change not stored yet: the page keeps it until
   * a write of it is stored (fix 38, review round 1, R1-1). Only for the user
   * signed in now, if the poster was opened for them: another user's session
   * cannot store it.
   */
  const keep = (change: Change): boolean => {
    const user = sessionUserRef.current;
    if (tokenRef.current === null || user === null) return false;
    if (ownerRef.current !== null && ownerRef.current !== user) return false;
    keptForRef.current = user;
    recordKept(change.id, {
      owner: selfRef.current,
      doc: change.doc,
      title: pendingTitleRef.current,
      handOver: () => {
        const prior: HandedOver = {
          change: pendingRef.current,
          inFlight: inFlightRef.current,
          cutOff: cutOffRef.current,
          storedTitle: storedTitleRef.current,
        };
        pendingRef.current = null;
        stop();
        return prior;
      },
    });
    return true;
  };

  /**
   * The editor opening `id` takes over the saving of a change its closed
   * editor kept: that one stops, and this one waits for its write out, then
   * writes the poster as opened (from the kept change, pages/Editor.tsx).
   * One writer.
   */
  const takeOver = (id: string) => {
    const kept = keeperOf(id);
    if (!kept || kept.owner === selfRef.current) return;
    const prior = kept.handOver();
    if (!prior.change) return;
    if (prior.inFlight) {
      const mine = inFlightRef.current;
      const waits: Promise<boolean> = Promise.all([mine, prior.inFlight]).then(() => true).finally(() => {
        if (inFlightRef.current === waits) inFlightRef.current = null;
      });
      inFlightRef.current = waits;
    }
    storedTitleRef.current = prior.storedTitle;
    pendingRef.current = { id, doc: posterIdRef.current === id && docRef.current ? docRef.current : prior.change.doc };
    if (prior.cutOff) markCutOff();
    void flush();
  };

  // Open: the leave listeners on, and the saving of a change this poster's
  // closed editor kept taken over. Unmount: flush any pending save so
  // nothing is lost, and try to leave the dashboard with a current
  // thumbnail. Sent with `keepalive` (fix 38): a tab closed right after lost
  // the change (MEASURED on main, keep-work-check L3-inapp-then-close). A
  // change not stored yet is kept (`keep`) and retried, as in the editor,
  // until it is; with no session that could store it, nothing is retried
  // after this one try.
  useEffect(() => {
    aliveRef.current = true;
    mountedRef.current = true;
    // Mounted again (React's StrictMode runs this twice): nothing is kept.
    forgetKeptBy(selfRef.current);
    keptForRef.current = null;
    attach();
    if (posterIdRef.current) takeOver(posterIdRef.current);
    return () => {
      mountedRef.current = false;
      const id = pendingRef.current?.id ?? posterIdRef.current;
      const hadPending = pendingRef.current !== null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!(pendingRef.current && keep(pendingRef.current))) stop();
      if (hadPending) void flush(undefined, { keepalive: true });

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

  return { ...state, flushNow: flush };
}
