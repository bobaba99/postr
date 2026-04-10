/**
 * AutosaveStatusPill — a small top-right overlay that shows the
 * current save state. Friction principle: never blocks, never steals
 * focus, never requires interaction. The pill is purely informational.
 *
 * States:
 *   idle   → "Saved" (before anything has been saved this session)
 *   saving → "Saving…"
 *   saved  → "Saved · 2s ago" (relative time, refreshed every 10s)
 *   error  → "Save failed · retry" with the error message as a title
 */
import { useEffect, useState } from 'react';
import type { AutosaveStatus } from '@/hooks/useAutosave';

export interface AutosaveStatusPillProps {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: Error | null;
}

function formatRelative(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return from.toLocaleDateString();
}

export function AutosaveStatusPill({ status, lastSavedAt, error }: AutosaveStatusPillProps) {
  // Tick every 10s so the relative time updates without subscribing
  // the whole editor to a rerender on every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'saved' || !lastSavedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [status, lastSavedAt]);

  const { label, color, title } = (() => {
    if (status === 'saving') {
      return { label: 'Saving…', color: '#9ca3af', title: undefined };
    }
    if (status === 'error') {
      return {
        label: 'Save failed',
        color: '#f87171',
        title: error?.message ?? 'Unknown error',
      };
    }
    if (status === 'saved' && lastSavedAt) {
      return {
        label: `Saved · ${formatRelative(lastSavedAt, new Date())}`,
        color: '#9ca3af',
        title: lastSavedAt.toLocaleString(),
      };
    }
    // idle — nothing has been saved yet this session.
    return { label: 'Saved', color: '#6b7280', title: undefined };
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      style={{
        position: 'absolute',
        top: 12,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#1a1a26ee',
        color,
        borderRadius: 999,
        padding: '5px 12px',
        fontSize: 10,
        fontFamily: 'system-ui',
        fontWeight: 600,
        letterSpacing: 0.2,
        border: '1px solid #2a2a3a',
        zIndex: 10,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {status === 'saving' && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#facc15',
            animation: 'pulse 1.2s ease-in-out infinite',
          }}
        />
      )}
      {status === 'error' && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#f87171',
          }}
        />
      )}
      {(status === 'saved' || status === 'idle') && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#4ade80',
          }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
