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
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';

// The hook imports `upsertPoster` from @/data/posters — mock it.
const upsertMock = vi.fn();
vi.mock('@/data/posters', () => ({
  upsertPoster: (...args: unknown[]) => upsertMock(...args),
}));

import { useAutosave } from '../useAutosave';

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
    });
  });
});
