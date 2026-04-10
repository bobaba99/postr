/**
 * InputModal — dark-themed prompt dialog replacing window.prompt.
 *
 * Renders a centered overlay with title, message, text input, and
 * Cancel/Confirm buttons. Same dark palette as ConfirmModal.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputModal({
  open,
  title,
  message,
  placeholder = '',
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, onConfirm, value]);

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
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#e2e2e8' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: '#9ca3af' }}>
          {message}
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            color: '#e2e2e8',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 20,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#7c6aed'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a3a'; }}
        />
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
            Cancel
          </button>
          <button
            onClick={() => { if (value.trim()) onConfirm(value.trim()); }}
            disabled={!value.trim()}
            style={{
              cursor: value.trim() ? 'pointer' : 'not-allowed',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: '#7c6aed',
              border: 'none',
              borderRadius: 6,
              opacity: value.trim() ? 1 : 0.4,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
