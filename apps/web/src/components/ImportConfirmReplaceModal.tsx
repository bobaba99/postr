/**
 * ImportConfirmReplaceModal — confirms replacing a non-empty poster.
 *
 * Shown before opening `ImportPosterModal` in `replace` mode when the
 * current poster has user content (`blocks.length > 2`). Offers a
 * one-click `.postr` export shortcut so the user can save current work
 * before discarding it.
 */
import { useEffect, useState } from 'react';
import type { PosterDoc } from '@postr/shared';
import { exportPostr } from '@/import/postrFile';

interface Props {
  open: boolean;
  doc: PosterDoc | null;
  posterTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmReplaceModal({
  open,
  doc,
  posterTitle,
  onConfirm,
  onCancel,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (!open) {
      setExporting(false);
      setExported(false);
      return;
    }
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

  async function handleSaveFirst() {
    if (!doc || exporting) return;
    setExporting(true);
    try {
      const blob = await exportPostr(doc);
      const url = URL.createObjectURL(blob);
      const safe = posterTitle.replace(/[^a-z0-9-_]/gi, '_') || 'poster';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.postr`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExported(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div onClick={onCancel} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#fbbf24' }}>
          Replace this poster?
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: '#9ca3af' }}>
          The current poster's blocks will be removed and replaced with the imported
          content. <strong style={{ color: '#fca5a5' }}>This cannot be undone.</strong>
        </p>

        <div
          style={{
            padding: 12,
            background: 'rgba(124, 106, 237, 0.06)',
            border: '1px solid rgba(124, 106, 237, 0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#c8cad0',
            marginBottom: 18,
          }}
        >
          💾 <strong>Save current as .postr first?</strong> A losslessly-restorable
          backup of the current poster.
          <div style={{ marginTop: 8 }}>
            <button
              onClick={handleSaveFirst}
              disabled={exporting || !doc}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 500,
                color: exported ? '#a6e3a1' : '#c8b6ff',
                background: '#1a1a26',
                border: `1px solid ${exported ? '#3a5a3a' : '#2a2a3a'}`,
                borderRadius: 6,
                cursor: exporting ? 'wait' : 'pointer',
              }}
            >
              {exported ? '✓ Saved' : exporting ? 'Saving…' : 'Download .postr'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={cancelBtn}>
            Cancel
          </button>
          <button onClick={onConfirm} style={dangerBtn}>
            Replace poster
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 440,
  background: '#111118',
  border: '1px solid #2a2a3a',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
};

const cancelBtn: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const dangerBtn: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#dc2626',
  border: 'none',
  borderRadius: 6,
};
