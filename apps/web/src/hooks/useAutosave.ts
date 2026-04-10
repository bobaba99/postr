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
import type { PosterDoc } from '@postr/shared';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: Error | null;
}

const DEBOUNCE_MS = 800;

/** Strip HTML tags to get plain text for the poster title column. */
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

export function useAutosave(posterId: string | null, doc: PosterDoc | null, displayTitle?: string): AutosaveState {
  const [state, setState] = useState<AutosaveState>({
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

  // Keep the title ref in sync (also read inside the effect below).
  pendingTitleRef.current = displayTitle;

  // Actual save — runs at the tail of the debounce window or on unmount.
  const flush = async () => {
    const id = pendingIdRef.current;
    const data = pendingDocRef.current;
    pendingIdRef.current = null;
    pendingDocRef.current = null;
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

  // Unmount: flush any pending save so nothing is lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void flush();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
