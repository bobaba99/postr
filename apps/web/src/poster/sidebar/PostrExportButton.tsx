/**
 * PostrExportButton — downloads the active poster as a `.postr`
 * zipped bundle. Lives in the Export tab next to PDF / Staples / Share.
 *
 * Reads from `usePosterStore` directly so the host tab needs no new
 * props.
 */
import { useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { exportPostr } from '@/import/postrFile';

export function PostrExportButton() {
  const doc = usePosterStore((s) => s.doc);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!doc || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const blob = await exportPostr(doc);
      const url = URL.createObjectURL(blob);
      const safeName = (posterTitle || 'poster').replace(/[^a-z0-9-_]/gi, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.postr`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!doc || busy}
        data-postr-export-postr
        style={{
          padding: '14px 20px',
          background: '#1a1a26',
          color: done ? '#a6e3a1' : '#c8b6ff',
          border: `1px solid ${done ? '#3a5a3a' : '#7c6aed'}`,
          borderRadius: 8,
          cursor: !doc || busy ? 'wait' : 'pointer',
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'center',
          width: '100%',
        }}
      >
        {done ? '✓ Saved' : busy ? 'Packing…' : '📦 Save as .postr'}
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Lossless backup that bundles the poster JSON + every image. Re-import
        from the dashboard "+ New poster ▾" menu to restore.
      </div>
      {error && (
        <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>{error}</div>
      )}
    </>
  );
}
