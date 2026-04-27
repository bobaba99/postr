/**
 * NewPosterButton — split-button entry to create a new poster.
 *
 * Primary action ("+ New poster"): one click, zero dialogs — mints a
 * fresh poster row and navigates straight into the editor.
 *
 * Chevron menu: "Import PDF / .postr…" opens the import modal in
 * `new` mode, which mints its own poster row once the user confirms
 * the preview.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPoster } from '@/data/posters';
import { ImportPosterModal } from './ImportPosterModal';

export function NewPosterButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close menu on outside-click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  async function handlePrimary() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      const row = await createPoster();
      navigate(`/p/${row.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create poster';
      setError(message);
      setBusy(false);
    }
  }

  function handleOpenImport() {
    setMenuOpen(false);
    setImportOpen(true);
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col items-start gap-1">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy}
          className="rounded-l-md border border-r-0 border-[#7c6aed] bg-[#7c6aed]/10 px-4 py-2 text-sm font-semibold text-[#c8b6ff] transition-colors hover:bg-[#7c6aed]/20 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Creating…' : '+ New poster'}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label="More poster options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-r-md border border-[#7c6aed] bg-[#7c6aed]/10 px-2 py-2 text-sm text-[#c8b6ff] transition-colors hover:bg-[#7c6aed]/20 disabled:cursor-wait disabled:opacity-60"
        >
          ▾
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[220px] overflow-hidden rounded-md border border-[#2a2a3a] bg-[#111118] shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handlePrimary}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#e2e2e8] hover:bg-[#1a1a26]"
          >
            <span aria-hidden>＋</span> New blank poster
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenImport}
            className="flex w-full items-center gap-2 border-t border-[#2a2a3a] px-3 py-2 text-left text-sm text-[#e2e2e8] hover:bg-[#1a1a26]"
          >
            <span aria-hidden>📥</span> Import PDF / .postr…
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[#f87171]">{error}</p>}

      <ImportPosterModal
        open={importOpen}
        mode="new"
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
