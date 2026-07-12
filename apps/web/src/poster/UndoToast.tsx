/**
 * Lightweight toast notification for undo/redo actions.
 * Floats at bottom-center of the canvas area, auto-dismisses after 1.2s.
 * Rapid actions reset the timer rather than stacking.
 */
import { useEffect, useState } from 'react';

interface UndoToastProps {
  /** The action label ("Undo" or "Redo"), null = hidden. */
  message: string | null;
  onDismiss: () => void;
}

export function UndoToast({ message, onDismiss }: UndoToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 150); // wait for the (faster) fade-out
    }, 1200);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 52,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 16px',
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 13,
        fontWeight: 500,
        pointerEvents: 'none',
        zIndex: 15,
        opacity: visible ? 1 : 0,
        // Entrance uses ease-out so the toast is instantly responsive;
        // the exit is faster than the entrance (Emil's asymmetric
        // rule — the system's response snaps). ease-in on the entrance
        // delayed the exact moment the user looks, making it sluggish.
        transition: visible
          ? 'opacity 200ms var(--ease-out)'
          : 'opacity 150ms var(--ease-out)',
      }}
    >
      {message}
    </div>
  );
}
