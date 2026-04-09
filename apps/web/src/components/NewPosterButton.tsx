/**
 * NewPosterButton — creates a fresh poster row and navigates the
 * user straight into the editor. Friction principle: one click,
 * zero dialogs, no size picker. The user can change size from the
 * Layout tab once they're in.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPoster } from '@/data/posters';

export function NewPosterButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createPoster();
      navigate(`/p/${row.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create poster';
      setError(message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-[#7c6aed] bg-[#7c6aed]/10 px-4 py-2 text-sm font-semibold text-[#c8b6ff] transition-colors hover:bg-[#7c6aed]/20 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Creating…' : '+ New poster'}
      </button>
      {error && <p className="text-xs text-[#f87171]">{error}</p>}
    </div>
  );
}
