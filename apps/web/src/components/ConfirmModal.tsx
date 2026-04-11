/**
 * ConfirmModal — dark-themed confirmation dialog.
 *
 * Supports an optional `typedConfirmation` prop: when set, the user
 * must type the exact phrase before the confirm button enables.
 * Used for high-friction destructive actions like account deletion.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** If set, user must type this exact phrase to enable the confirm button. */
  typedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  typedConfirmation,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');

  // Reset typed text when modal opens/closes
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!typedConfirmation) confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, typedConfirmation]);

  if (!open) return null;

  const confirmEnabled = typedConfirmation
    ? typed.toLowerCase().trim() === typedConfirmation.toLowerCase().trim()
    : true;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 16,
            fontWeight: 600,
            color: danger ? '#f87171' : '#e2e2e8',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#9ca3af',
          }}
        >
          {message}
        </p>

        {typedConfirmation && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
              Type <strong style={{ color: '#f87171', fontFamily: 'monospace' }}>{typedConfirmation}</strong> to confirm:
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typedConfirmation}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                color: confirmEnabled ? '#a6e3a1' : '#e2e2e8',
                background: '#1a1a26',
                border: `1px solid ${confirmEnabled ? '#a6e3a1' : '#2a2a3a'}`,
                borderRadius: 6,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={!confirmEnabled}
            style={{
              cursor: confirmEnabled ? 'pointer' : 'not-allowed',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: danger ? '#dc2626' : '#7c6aed',
              border: 'none',
              borderRadius: 6,
              opacity: confirmEnabled ? 1 : 0.4,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
