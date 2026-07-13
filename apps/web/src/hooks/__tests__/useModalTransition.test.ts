/**
 * @vitest-environment jsdom
 */
/**
 * Tests for useModalTransition — the hook that keeps a modal mounted
 * through its exit animation.
 *
 * It must:
 *   1. Report mounted=true / state='open' immediately when open.
 *   2. On close, KEEP mounted=true (state='closing') until exitMs
 *      elapses, then flip mounted=false so the caller can unmount.
 *   3. Cancel a pending unmount if the modal re-opens mid-exit.
 *   4. Start unmounted when opened as false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalTransition } from '../useModalTransition';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useModalTransition', () => {
  it('is mounted and open while open=true', () => {
    const { result } = renderHook(() => useModalTransition(true));
    expect(result.current.mounted).toBe(true);
    expect(result.current.state).toBe('open');
  });

  it('starts unmounted when open=false', () => {
    const { result } = renderHook(() => useModalTransition(false));
    expect(result.current.mounted).toBe(false);
  });

  it('holds the mount for exitMs on close, then unmounts', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useModalTransition(open, 140),
      { initialProps: { open: true } },
    );

    // Close: still mounted, now in the closing state.
    rerender({ open: false });
    expect(result.current.mounted).toBe(true);
    expect(result.current.state).toBe('closing');

    // Just before the exit window elapses, still mounted.
    act(() => {
      vi.advanceTimersByTime(139);
    });
    expect(result.current.mounted).toBe(true);

    // After exitMs, it unmounts.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.mounted).toBe(false);
  });

  it('cancels the pending unmount if re-opened mid-exit', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useModalTransition(open, 140),
      { initialProps: { open: true } },
    );

    rerender({ open: false }); // begin closing
    act(() => {
      vi.advanceTimersByTime(100); // partway through the exit
    });
    rerender({ open: true }); // re-open before it unmounts

    // The pending unmount is cancelled — advancing past the old window
    // must NOT drop the mount.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.mounted).toBe(true);
    expect(result.current.state).toBe('open');
  });
});
