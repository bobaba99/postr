import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const store = vi.hoisted(() => ({ canUndo: false }));
const plan = vi.hoisted(() => ({ isGuest: true }));
vi.mock('@/stores/posterStore', () => ({
  usePosterStore: (sel: (s: { canUndo: boolean }) => unknown) => sel(store),
}));
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => plan }));

import { useLeaveGuard } from '../useLeaveGuard';

describe('useLeaveGuard', () => {
  beforeEach(() => {
    store.canUndo = false;
    plan.isGuest = true;
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('arms only when the user is a guest AND has edited (canUndo)', () => {
    store.canUndo = true;
    plan.isGuest = true;
    const add = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(true);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('does not arm for a permanent (non-guest) user even after edits', () => {
    store.canUndo = true;
    plan.isGuest = false;
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(false);
  });

  it('does not arm for a guest who has not edited', () => {
    store.canUndo = false;
    plan.isGuest = true;
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(false);
  });

  it('requestLeave blocks (returns true) and opens the modal when armed', () => {
    store.canUndo = true;
    const { result } = renderHook(() => useLeaveGuard());
    let blocked = false;
    act(() => { blocked = result.current.requestLeave(); });
    expect(blocked).toBe(true);
    expect(result.current.leaveModalOpen).toBe(true);
  });

  it('requestLeave allows (returns false) when not armed', () => {
    store.canUndo = false;
    const { result } = renderHook(() => useLeaveGuard());
    let blocked = true;
    act(() => { blocked = result.current.requestLeave(); });
    expect(blocked).toBe(false);
  });

  it('removes the beforeunload listener when it disarms', () => {
    store.canUndo = true;
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(() => useLeaveGuard());
    store.canUndo = false;
    rerender();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
