/**
 * Home page — "My Posters" grid.
 *
 * Friction principle: anonymous users land here with at least one
 * poster already in their list (the trigger-created Untitled Poster
 * from handle_new_user). The primary CTA is "+ New poster" which
 * creates and navigates straight into the editor — no dialogs.
 *
 * Duplicate / delete are hover actions on each card. Both are
 * optimistic: we mutate the local array immediately, then run the
 * repository call. Errors roll back and show an inline banner.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  deletePoster,
  duplicatePoster,
  listPosters,
  type PosterRow,
} from '@/data/posters';
import { Link } from 'react-router-dom';
import { PosterCard } from '@/components/PosterCard';
import { NewPosterButton } from '@/components/NewPosterButton';
import { ConfirmModal } from '@/components/ConfirmModal';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: PosterRow[] }
  | { kind: 'error'; message: string };

export default function Home() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosterRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPosters();
        if (cancelled) return;
        setStatus({ kind: 'ready', rows });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load posters';
        setStatus({ kind: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDuplicate = useCallback(async (row: PosterRow) => {
    setActionError(null);
    try {
      const copy = await duplicatePoster(row.id);
      setStatus((s) =>
        s.kind === 'ready' ? { kind: 'ready', rows: [copy, ...s.rows] } : s,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate';
      setActionError(message);
    }
  }, []);

  const handleDeleteRequest = useCallback((row: PosterRow) => {
    setDeleteTarget(row);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const row = deleteTarget;
    setDeleteTarget(null);
    if (!row) return;

    setActionError(null);
    let rollback: PosterRow[] | null = null;
    setStatus((s) => {
      if (s.kind !== 'ready') return s;
      rollback = s.rows;
      return { kind: 'ready', rows: s.rows.filter((r) => r.id !== row.id) };
    });

    try {
      await deletePoster(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      setActionError(message);
      if (rollback) {
        const rows = rollback;
        setStatus({ kind: 'ready', rows });
      }
    }
  }, [deleteTarget]);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f1f2e] bg-[#0a0a12]/95 px-8 py-5 backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight">Postr</h1>
        <div className="flex items-center gap-4">
          <NewPosterButton />
          <Link
            to="/profile"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2a2a3a] text-[#6b7280] hover:border-[#7c6aed] hover:text-[#c8cad0]"
            title="Profile & Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-8 py-8">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-[#6b7280]">
          My posters
        </h2>

        {actionError && (
          <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-xs text-[#f87171]">
            {actionError}
          </div>
        )}

        {status.kind === 'loading' && (
          <p className="text-sm text-[#6b7280]">Loading…</p>
        )}

        {status.kind === 'error' && (
          <p className="text-sm text-[#f87171]">Couldn’t load posters: {status.message}</p>
        )}

        {status.kind === 'ready' && status.rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-[#2a2a3a] p-8 text-center text-sm text-[#6b7280]">
            No posters yet. Click <span className="text-[#c8b6ff]">+ New poster</span> to start.
          </div>
        )}

        {status.kind === 'ready' && status.rows.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {status.rows.map((row) => (
              <PosterCard
                key={row.id}
                row={row}
                onDuplicate={handleDuplicate}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete poster"
        message={`Permanently delete "${deleteTarget?.title?.trim() || 'Untitled Poster'}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
