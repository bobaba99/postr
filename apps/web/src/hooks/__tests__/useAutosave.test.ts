/**
 * @vitest-environment jsdom
 */
/**
 * Tests for the autosave hook.
 *
 * useAutosave(posterId, doc) must:
 *   1. Debounce writes — multiple doc mutations within 800 ms coalesce
 *      into a single upsertPoster call.
 *   2. Expose { status: 'idle' | 'saving' | 'saved' | 'error', lastSavedAt }.
 *   3. Skip the FIRST render (loading a poster from the server into the
 *      store must not trigger an immediate save of the same document).
 *   4. Flush a pending save on unmount so in-flight edits are never lost.
 *   5. Cancel a pending debounce when posterId changes (switching posters
 *      must not save the outgoing doc under the incoming id).
 *   6. Surface save errors via status = 'error' without throwing.
 *   7. Keep a failed save's change and retry it after 2, 5, 10 and 30 s,
 *      then every 30 s; a new edit restarts the wait (fix 27,
 *      docs/fixes/27-keep-work-safe.md; the editor-level tests from the
 *      user's entry are src/poster/__tests__/keepWorkSafe.test.tsx).
 *   8. flushNow resolves true once every change made before the call is
 *      stored, false when the write failed (an edit made while its write
 *      is out is not waited for; fix 27 review round 2, R2-A7).
 *   9. Report a failure's attempt number within the diagnostics API's
 *      limit (1000), however long the retries run.
 *  10. Leave the poster opened next alone when the write for the poster
 *      left behind fails, and start its failures afresh (fix 27, review
 *      round 1).
 *  11. Under React's StrictMode (the dev server): a poster opened and
 *      closed with no edit is neither saved nor warned about, and an edit
 *      is still saved (fix 27, review round 1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';

// The hook imports `upsertPoster` from @/data/posters — mock it.
const upsertMock = vi.fn();
vi.mock('@/data/posters', () => ({
  upsertPoster: (...args: unknown[]) => upsertMock(...args),
}));

const signalMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/diagnostics', () => ({ reportUiSignal: (...args: unknown[]) => signalMock(...args) }));

import { RETRY_DELAYS_MS, useAutosave } from '../useAutosave';

function makeDoc(font = 'Inter'): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [],
    fontFamily: font,
    palette: {
      bg: '#fff',
      primary: '#000',
      accent: '#000',
      accent2: '#000',
      muted: '#000',
      headerBg: '#000',
      headerFg: '#fff',
    },
    styles: {
      title: { size: 72, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 600, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 18, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 14, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  signalMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({
    id: 'poster-1',
    updated_at: new Date('2026-04-08T12:00:00Z').toISOString(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave', () => {
  it('does not fire on the first render', () => {
    const doc = makeDoc();
    renderHook(() => useAutosave('poster-1', doc));

    // Even after the debounce elapses, the first render must not save.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('debounces multiple mutations into a single upsert', async () => {
    const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
      initialProps: { doc: makeDoc('Inter') },
    });

    // Three quick mutations — none should have flushed yet.
    rerender({ doc: makeDoc('Merriweather') });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ doc: makeDoc('IBM Plex') });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ doc: makeDoc('Lora') });

    expect(upsertMock).not.toHaveBeenCalled();

    // Cross the 800 ms threshold from the LAST mutation.
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith('poster-1', {
      data: expect.objectContaining({ fontFamily: 'Lora' }),
      // Every save keeps the row's size columns in step (fix 02, cause E).
      widthIn: 48,
      heightIn: 36,
    });
  });

  it('transitions status: idle → saving → saved', async () => {
    // Hold the upsert so the "saving" window is observable.
    let resolveUpsert: (v: unknown) => void = () => undefined;
    upsertMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ doc }) => useAutosave('poster-1', doc),
      { initialProps: { doc: makeDoc('Inter') } },
    );

    expect(result.current.status).toBe('idle');

    rerender({ doc: makeDoc('Merriweather') });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(result.current.status).toBe('saving');

    await act(async () => {
      resolveUpsert({ id: 'poster-1', updated_at: new Date().toISOString() });
      await Promise.resolve();
    });

    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it('surfaces upsert errors via status = "error" without throwing', async () => {
    upsertMock.mockRejectedValueOnce(new Error('rls denied'));

    const { result, rerender } = renderHook(
      ({ doc }) => useAutosave('poster-1', doc),
      { initialProps: { doc: makeDoc('Inter') } },
    );

    rerender({ doc: makeDoc('Merriweather') });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toMatch(/rls denied/);
  });

  it('does not save when posterId is null', () => {
    const { rerender } = renderHook(
      ({ doc, id }: { doc: PosterDoc; id: string | null }) => useAutosave(id, doc),
      { initialProps: { doc: makeDoc('Inter'), id: null } },
    );

    rerender({ doc: makeDoc('Merriweather'), id: null });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('cancels a pending save when posterId changes', async () => {
    const { rerender } = renderHook(
      ({ doc, id }: { doc: PosterDoc; id: string }) => useAutosave(id, doc),
      { initialProps: { doc: makeDoc('Inter'), id: 'poster-1' } },
    );

    // Queue a pending save for poster-1
    rerender({ doc: makeDoc('Merriweather'), id: 'poster-1' });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Switch to a different poster before the debounce elapses.
    rerender({ doc: makeDoc('Merriweather'), id: 'poster-2' });

    // Let the old debounce window complete — the outgoing doc must
    // NOT be upserted under poster-1.
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // The only call that may exist is for poster-2 (the new doc on
    // the new id). The forbidden case is a call for poster-1 here.
    for (const call of upsertMock.mock.calls) {
      expect(call[0]).not.toBe('poster-1');
    }
  });

  it('flushes a pending save on unmount', async () => {
    const { rerender, unmount } = renderHook(
      ({ doc }) => useAutosave('poster-1', doc),
      { initialProps: { doc: makeDoc('Inter') } },
    );

    rerender({ doc: makeDoc('Merriweather') });
    // Do NOT advance timers — unmount with a pending debounce.

    unmount();
    // Wait for any microtasks the flush scheduled.
    await act(async () => {
      await Promise.resolve();
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith('poster-1', {
      data: expect.objectContaining({ fontFamily: 'Merriweather' }),
      // Every save keeps the row's size columns in step (fix 02, cause E).
      widthIn: 48,
      heightIn: 36,
    });
  });

  describe('a failed save (fix 27)', () => {
    /** Times (ms after the edit) of every write, over `span` ms. */
    async function attemptTimes(span: number, step = 100) {
      const at: number[] = [];
      let t = 0;
      let seen = 0;
      while (t < span) {
        await act(async () => {
          vi.advanceTimersByTime(step);
          await Promise.resolve();
          await Promise.resolve();
        });
        t += step;
        if (upsertMock.mock.calls.length > seen) {
          seen = upsertMock.mock.calls.length;
          at.push(t);
        }
      }
      return at;
    }

    it('is tried again after 2, 5, 10 and 30 s, then every 30 s', async () => {
      upsertMock.mockRejectedValue(new Error('Failed to fetch'));
      const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      const at = await attemptTimes(110_000);
      // 800 ms debounce, then each wait after the failure before it.
      expect(at).toEqual([800, 2800, 7800, 17800, 47800, 77800, 107800]);
      expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 10000, 30000]);
    });

    it('a new edit restarts the wait: the next write is 800 ms after it', async () => {
      upsertMock.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(upsertMock).toHaveBeenCalledTimes(1);
      rerender({ doc: makeDoc('Lora') });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      expect(upsertMock).toHaveBeenCalledTimes(2);
      expect(upsertMock.mock.calls[1]![1]).toMatchObject({ data: expect.objectContaining({ fontFamily: 'Lora' }) });
    });

    it('flushNow resolves false when the write fails, true once it succeeds', async () => {
      upsertMock.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { result, rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      let first: boolean | undefined;
      await act(async () => {
        first = await result.current.flushNow();
      });
      expect(first).toBe(false);
      expect(result.current.status).toBe('error');
      let second: boolean | undefined;
      await act(async () => {
        second = await result.current.flushNow();
      });
      expect(second).toBe(true);
      expect(result.current.status).toBe('saved');
      let nothingLeft: boolean | undefined;
      await act(async () => {
        nothingLeft = await result.current.flushNow();
      });
      expect(nothingLeft, 'nothing pending: true, and no write').toBe(true);
      expect(upsertMock).toHaveBeenCalledTimes(2);
    });

    it('an edit made during a write that then fails keeps its own 800 ms wait', async () => {
      let fail: (e: Error) => void = () => {};
      upsertMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
      const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      expect(upsertMock).toHaveBeenCalledTimes(1);
      rerender({ doc: makeDoc('Lora') });
      await act(async () => {
        vi.advanceTimersByTime(300);
        fail(new Error('Failed to fetch'));
        await Promise.resolve();
        await Promise.resolve();
      });
      // 500 ms more is 800 after the edit; the retry ladder would say 2 s after the failure.
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(upsertMock).toHaveBeenCalledTimes(2);
      expect(upsertMock.mock.calls[1]![1]).toMatchObject({ data: expect.objectContaining({ fontFamily: 'Lora' }) });
    });

    it('is not retried once the editor has gone (one last try as it closes)', async () => {
      upsertMock.mockRejectedValue(new Error('Failed to fetch'));
      const { rerender, unmount } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
        await Promise.resolve();
      });
      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(upsertMock, 'the failed save, the unmount flush, nothing after').toHaveBeenCalledTimes(2);
    });

    it('opening another poster clears the failure: it is not shown as unsaved', async () => {
      upsertMock.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { result, rerender } = renderHook(
        ({ doc, id }: { doc: PosterDoc; id: string }) => useAutosave(id, doc),
        { initialProps: { doc: makeDoc('Inter'), id: 'poster-1' } },
      );
      rerender({ doc: makeDoc('Merriweather'), id: 'poster-1' });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.status).toBe('error');
      rerender({ doc: makeDoc('Lora'), id: 'poster-2' });
      expect(result.current.status).toBe('idle');
      // (Poster 1's unsaved change is dropped, as before: the editor staying
      // open while the poster changes is OF-04's cause, R1, out of scope.)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      for (const call of upsertMock.mock.calls) {
        expect(call[0] === 'poster-2' && (call[1] as { data: PosterDoc }).data.fontFamily === 'Merriweather').toBe(false);
      }
    });

    // Review round 1, R1-A3 (the reviewer's probe folded in): the write for
    // the poster left behind fails after another poster opened in the same
    // editor (the in-editor Duplicate's "Open copy", or Back after it). It
    // used to set the new poster's pill to "Not saved — retrying…" for good,
    // with nothing pending and nothing retried.
    it('a write for the poster left behind that fails after the switch leaves the new poster\'s state alone', async () => {
      let fail: (e: Error) => void = () => {};
      upsertMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
      const { result, rerender } = renderHook(
        ({ doc, id }: { doc: PosterDoc; id: string }) => useAutosave(id, doc),
        { initialProps: { doc: makeDoc('Inter'), id: 'poster-1' } },
      );
      rerender({ doc: makeDoc('Merriweather'), id: 'poster-1' });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      expect(upsertMock).toHaveBeenCalledTimes(1);
      rerender({ doc: makeDoc('Lora'), id: 'poster-2' });
      await act(async () => {
        fail(new Error('Failed to fetch'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.status).toBe('idle');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(result.current.status).toBe('idle');
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('the poster opened next starts its failures afresh: its first retry is after 2 s', async () => {
      upsertMock.mockRejectedValue(new Error('Failed to fetch'));
      const { rerender } = renderHook(
        ({ doc, id }: { doc: PosterDoc; id: string }) => useAutosave(id, doc),
        { initialProps: { doc: makeDoc('Inter'), id: 'poster-1' } },
      );
      rerender({ doc: makeDoc('Merriweather'), id: 'poster-1' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(upsertMock).toHaveBeenCalledTimes(1);
      rerender({ doc: makeDoc('Merriweather'), id: 'poster-2' });
      rerender({ doc: makeDoc('Lora'), id: 'poster-2' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(upsertMock).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(upsertMock, 'retried 2 s after the failure, not 5').toHaveBeenCalledTimes(3);
    });

    it('reports the attempt number within the API\'s 1000, however long it fails', async () => {
      upsertMock.mockRejectedValue(new Error('Failed to fetch'));
      const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
      });
      rerender({ doc: makeDoc('Merriweather') });
      // 1005 failures: 0.8 + 2 + 5 + 10 s, then 30 s each.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800 + 17_000 + 1002 * 30_000);
      });
      const attempts = signalMock.mock.calls.map((c) => (c[0] as { attempt: number }).attempt);
      expect(attempts.length).toBeGreaterThan(1000);
      expect(Math.max(...attempts)).toBe(1000);
    });
  });

  // React's StrictMode runs every effect, its cleanup and the effect again
  // when a component mounts (the dev server, where every browser check of
  // fix 27 runs). Review round 1, R1-A7: the debounce effect's second run saw
  // no change but marked the loaded poster unsaved, while the timer could not
  // be armed (the editor counted as gone between the two runs), so a tab
  // closed with no edit asked to confirm leaving; on main the second run sent
  // a save of the unchanged poster instead.
  // `reactStrictMode`, not a <StrictMode> wrapper: under renderHook only the
  // option ran the effects twice (MEASURED: 2 runs against 1, RTL 16.3).
  describe('under StrictMode (fix 27, review round 1)', () => {

    it('opened and closed with no edit: no leave warning, nothing written', async () => {
      const doc = makeDoc('Inter');
      const { unmount } = renderHook(() => useAutosave('poster-1', doc), { reactStrictMode: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented, 'a leave warning').toBe(false);
      expect(upsertMock).not.toHaveBeenCalled();
      unmount();
    });

    it('an edit is still saved 800 ms after it', async () => {
      const { rerender } = renderHook(({ doc }) => useAutosave('poster-1', doc), {
        initialProps: { doc: makeDoc('Inter') },
        reactStrictMode: true,
      });
      rerender({ doc: makeDoc('Merriweather') });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(upsertMock).toHaveBeenCalledTimes(1);
      expect(upsertMock.mock.calls[0]![1]).toMatchObject({ data: expect.objectContaining({ fontFamily: 'Merriweather' }) });
    });
  });
});
