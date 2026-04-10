/**
 * ConfirmModal — dark-themed confirmation dialog replacing window.confirm.
 *
 * Renders a centered overlay with title, message, and Cancel/Confirm
 * buttons. Matches the app's dark palette (#0a0a12 bg, #111118 card,
 * #7c6aed accent). Supports a `danger` variant for destructive actions
 * (red confirm button).
 *
 * Usage:
 *   <ConfirmModal
 *     open={showDelete}
 *     title="Delete poster"
 *     message="This cannot be undone."
 *     confirmLabel="Delete"
 *     danger
 *     onConfirm={() => handleDelete()}
 *     onCancel={() => setShowDelete(false)}
 *   />
 */
import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
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
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when the modal opens, and trap Escape.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

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
          maxWidth: 400,
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
            margin: '0 0 24px',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#9ca3af',
          }}
        >
          {message}
        </p>
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
            style={{
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: danger ? '#dc2626' : '#7c6aed',
              border: 'none',
              borderRadius: 6,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
