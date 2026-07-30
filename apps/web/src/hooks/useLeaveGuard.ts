/**
 * useLeaveGuard — nudges an anonymous editor to secure their work
 * before they leave. Active only when the session is a guest AND the
 * poster has been edited this session (canUndo). Arms a beforeunload
 * handler (the browser's native "Leave site?" dialog is all the
 * platform allows on real tab-close/refresh) and exposes a
 * requestLeave() gate for in-app navigation, where we can show our own
 * SecureWorkModal instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { usePlan } from '@/hooks/usePlan';

export function useLeaveGuard() {
  const canUndo = usePosterStore((s) => s.canUndo);
  const { isGuest } = usePlan();
  const armed = isGuest && canUndo;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const allowNextRef = useRef(false);

  useEffect(() => {
    if (!armed) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required for the native prompt in some browsers
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [armed]);

  const requestLeave = useCallback((): boolean => {
    if (allowNextRef.current || !armedRef.current) return false; // proceed
    setLeaveModalOpen(true);
    return true; // block
  }, []);

  const confirmLeave = useCallback(() => {
    allowNextRef.current = true;
    setLeaveModalOpen(false);
  }, []);

  const cancelLeave = useCallback(() => setLeaveModalOpen(false), []);

  return { armed, leaveModalOpen, requestLeave, confirmLeave, cancelLeave };
}
