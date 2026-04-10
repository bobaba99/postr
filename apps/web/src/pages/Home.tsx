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
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="12" fill="#7c6aed" />
            <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
            <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
            <circle cx="32" cy="32" r="5" fill="white" />
          </svg>
          <h1 className="text-xl font-semibold tracking-tight">Postr</h1>
        </div>
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
        {/* Mobile notice */}
        <div className="mb-6 rounded-lg border border-[#2a2a3a] bg-[#111118] px-4 py-3 text-[13px] text-[#6b7280] sm:hidden">
          Postr is designed for desktop browsers. For the best editing experience, please use a laptop or desktop computer.
        </div>

        <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-[#6b7280]">
          My posters
        </h2>

        {actionError && (
          <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[13px] text-[#f87171]">
            {actionError}
          </div>
        )}

        {status.kind === 'loading' && (
          <p className="text-sm text-[#6b7280]">Loading…</p>
        )}

        {status.kind === 'error' && (
          <p className="text-sm text-[#f87171]">Couldn’t load posters: {status.message}</p>
        )}

        {status.kind === 'ready' && status.rows.length <= 1 && (
          <div className="mb-8 rounded-xl border border-[#2a2a3a] bg-[#111118] p-8">
            <div className="flex items-center gap-4 mb-4">
              <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                <rect width="64" height="64" rx="14" fill="#7c6aed" />
                <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
                <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
                <circle cx="32" cy="32" r="5" fill="white" />
              </svg>
              <div>
                <h3 className="text-lg font-bold text-[#e2e2e8]">Welcome to Postr</h3>
                <p className="text-sm text-[#6b7280]">Create conference-quality research posters in minutes, not hours.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="rounded-lg bg-[#1a1a26] p-4 border border-[#2a2a3a]">
                <div className="text-sm font-semibold text-[#c8cad0] mb-1">Pick a template</div>
                <div className="text-[13px] text-[#6b7280] leading-relaxed">5 layouts — 3-column classic, billboard, sidebar + focus, and more. Start with structure, not a blank page.</div>
              </div>
              <div className="rounded-lg bg-[#1a1a26] p-4 border border-[#2a2a3a]">
                <div className="text-sm font-semibold text-[#c8cad0] mb-1">Write with guidance</div>
                <div className="text-[13px] text-[#6b7280] leading-relaxed">Built-in writing guide, conference size specs, and a checklist to keep you on track from intro to references.</div>
              </div>
              <div className="rounded-lg bg-[#1a1a26] p-4 border border-[#2a2a3a]">
                <div className="text-sm font-semibold text-[#c8cad0] mb-1">Check before you print</div>
                <div className="text-[13px] text-[#6b7280] leading-relaxed">Paste your R or Python code to verify figure text is readable at poster size. Out-of-bounds warnings catch layout issues.</div>
              </div>
            </div>
            <div className="mt-6">
              <NewPosterButton />
            </div>
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
