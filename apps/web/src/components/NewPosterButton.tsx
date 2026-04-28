/**
 * NewPosterButton — dashboard entry point with TWO equal-weight
 * primary actions: "+ New poster" (blank) and "📥 Import…" (PDF /
 * image / .postr). Import used to be hidden behind a split-button
 * chevron, which most users missed entirely. Surfacing it as a
 * sibling button doubles its visibility and makes the import-an-
 * existing-poster path discoverable on first visit.
 *
 * Chevron menu kept for keyboard-menu users; same actions, plus a
 * place for future variants (templates, etc.).
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
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy}
          className="rounded-md border border-[#7c6aed] bg-[#7c6aed] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#7c6aed]/30 transition-all hover:bg-[#9d87ff] hover:shadow-md hover:shadow-[#7c6aed]/40 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Creating…' : '+ New poster'}
        </button>
        <button
          type="button"
          onClick={handleOpenImport}
          disabled={busy}
          data-postr-import-cta
          aria-label="Import an existing poster"
          className="flex items-center gap-1.5 rounded-md border border-[#7c6aed] bg-[#7c6aed]/10 px-4 py-2 text-sm font-semibold text-[#c8b6ff] transition-all hover:bg-[#7c6aed]/20 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          <span aria-hidden>📥</span>
          Import…
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label="More poster options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-md border border-[#2a2a3a] bg-transparent px-2 py-2 text-sm text-[#9ca3af] transition-colors hover:bg-[#1a1a26] hover:text-[#c8b6ff] disabled:cursor-wait disabled:opacity-60"
        >
          ▾
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[260px] overflow-hidden rounded-md border border-[#2a2a3a] bg-[#111118] shadow-2xl"
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
            className="flex w-full flex-col items-start gap-0.5 border-t border-[#2a2a3a] px-3 py-2 text-left hover:bg-[#1a1a26]"
          >
            <span className="flex items-center gap-2 text-sm text-[#e2e2e8]">
              <span aria-hidden>📥</span> Import PDF / image / .postr…
            </span>
            <span className="pl-6 text-[11px] leading-snug text-[#6b7280]">
              Text-only for image inputs · figures stay manual
            </span>
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
