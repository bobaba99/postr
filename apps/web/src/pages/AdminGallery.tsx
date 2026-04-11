/**
 * Admin gallery moderation page.
 *
 * Lists every gallery entry (including retracted ones), lets an
 * allowlisted moderator force-retract content with a reason, and
 * bring retracted content back if the action was wrong.
 *
 * Access is gated two ways, belt-and-suspenders:
 *   1. On mount, we call checkIsGalleryAdmin (RPC to the Supabase
 *      SECURITY DEFINER helper). If false we redirect to /dashboard.
 *   2. Even if a non-admin reaches the route, the RLS policies on
 *      gallery_entries strip out everything but their own rows, so
 *      the admin operations quietly fail.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listAllGalleryAdmin,
  adminRetractEntry,
  adminUnretractEntry,
  checkIsGalleryAdmin,
  labelForField,
  type GalleryEntryWithUrls,
} from '@/data/gallery';
import { PublicFooter } from '@/components/PublicFooter';

type Access =
  | { kind: 'checking' }
  | { kind: 'denied' }
  | { kind: 'allowed' };

type DataStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: GalleryEntryWithUrls[] }
  | { kind: 'error'; message: string };

type Filter = 'all' | 'active' | 'retracted';

export default function AdminGallery() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<Access>({ kind: 'checking' });
  const [data, setData] = useState<DataStatus>({ kind: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const [retractingId, setRetractingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Check admin status first. If not admin, bounce to dashboard —
  // no flash of empty table.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isAdmin = await checkIsGalleryAdmin();
      if (cancelled) return;
      if (!isAdmin) {
        setAccess({ kind: 'denied' });
        navigate('/dashboard', { replace: true });
        return;
      }
      setAccess({ kind: 'allowed' });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const loadEntries = useCallback(async () => {
    setData({ kind: 'loading' });
    try {
      const rows = await listAllGalleryAdmin();
      setData({ kind: 'ready', rows });
    } catch (err) {
      setData({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    if (access.kind !== 'allowed') return;
    loadEntries();
  }, [access.kind, loadEntries]);

  async function handleRetractSubmit(entryId: string) {
    setActionError(null);
    try {
      await adminRetractEntry(entryId, reasonDraft);
      setRetractingId(null);
      setReasonDraft('');
      await loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retract failed.');
    }
  }

  async function handleUnretract(entryId: string) {
    setActionError(null);
    try {
      await adminUnretractEntry(entryId);
      await loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unretract failed.');
    }
  }

  if (access.kind !== 'allowed') {
    return (
      <main className="flex min-h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-sm text-[#6b7280]">
        {access.kind === 'checking' ? 'Checking admin access…' : 'Access denied.'}
      </main>
    );
  }

  const filteredRows =
    data.kind === 'ready'
      ? data.rows.filter((row) => {
          if (filter === 'active') return row.retracted_at === null;
          if (filter === 'retracted') return row.retracted_at !== null;
          return true;
        })
      : [];

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f1f2e] bg-[#0a0a12]/95 px-8 py-5 backdrop-blur">
        <Link to="/dashboard" className="flex items-center gap-3 no-underline">
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="12" fill="#7c6aed" />
            <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
            <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
            <circle cx="32" cy="32" r="5" fill="white" />
          </svg>
          <h1 className="text-xl font-semibold tracking-tight">Postr</h1>
          <span className="ml-2 rounded bg-[#7c6aed]/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#7c6aed]">
            Admin
          </span>
        </Link>
        <Link
          to="/dashboard"
          className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]"
        >
          ← Back to dashboard
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 px-8 py-10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Gallery moderation</h2>
          <p className="mt-2 text-[13px] text-[#6b7280]">
            Force-retract content that violates the Terms. Reasons are stored on
            the entry and shown to the author. Retractions are reversible — the
            image files stay in storage until the owner hard-deletes.
          </p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex items-center gap-2 border-b border-[#1f1f2e] pb-4">
          {(['all', 'active', 'retracted'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? 'rounded-md border border-[#7c6aed] bg-[#7c6aed]/10 px-3 py-1.5 text-[12px] font-semibold text-[#7c6aed]'
                  : 'rounded-md border border-[#2a2a3a] bg-[#111118] px-3 py-1.5 text-[12px] font-medium text-[#6b7280] hover:border-[#7c6aed] hover:text-[#c8cad0]'
              }
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Retracted'}
            </button>
          ))}
          {data.kind === 'ready' && (
            <span className="ml-auto text-[12px] text-[#6b7280]">
              {filteredRows.length} / {data.rows.length} entries
            </span>
          )}
        </div>

        {actionError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[13px] text-[#f87171]"
          >
            {actionError}
          </div>
        )}

        {data.kind === 'loading' && (
          <p className="py-12 text-center text-sm text-[#6b7280]">Loading entries…</p>
        )}
        {data.kind === 'error' && (
          <p className="py-12 text-center text-sm text-[#f87171]">
            Couldn’t load entries: {data.message}
          </p>
        )}
        {data.kind === 'ready' && filteredRows.length === 0 && (
          <p className="py-12 text-center text-sm text-[#6b7280]">
            No entries match this filter.
          </p>
        )}
        {data.kind === 'ready' && filteredRows.length > 0 && (
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <EntryRow
                key={row.id}
                row={row}
                isRetractExpanded={retractingId === row.id}
                reasonDraft={retractingId === row.id ? reasonDraft : ''}
                onStartRetract={() => {
                  setRetractingId(row.id);
                  setReasonDraft('');
                  setActionError(null);
                }}
                onCancelRetract={() => {
                  setRetractingId(null);
                  setReasonDraft('');
                }}
                onReasonChange={setReasonDraft}
                onSubmitRetract={() => handleRetractSubmit(row.id)}
                onUnretract={() => handleUnretract(row.id)}
              />
            ))}
          </div>
        )}
      </section>

      <PublicFooter />
    </main>
  );
}

function EntryRow({
  row,
  isRetractExpanded,
  reasonDraft,
  onStartRetract,
  onCancelRetract,
  onReasonChange,
  onSubmitRetract,
  onUnretract,
}: {
  row: GalleryEntryWithUrls;
  isRetractExpanded: boolean;
  reasonDraft: string;
  onStartRetract: () => void;
  onCancelRetract: () => void;
  onReasonChange: (v: string) => void;
  onSubmitRetract: () => void;
  onUnretract: () => void;
}) {
  const publishedAt = new Date(row.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const retracted = row.retracted_at !== null;

  return (
    <div
      className={`rounded-lg border p-4 ${
        retracted
          ? 'border-[#f87171]/30 bg-[#f87171]/5'
          : 'border-[#1f1f2e] bg-[#111118]'
      }`}
    >
      <div className="flex items-start gap-4">
        <img
          src={row.image_url}
          alt={row.title}
          className="h-24 w-24 shrink-0 rounded object-cover"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#1a1a26] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7c6aed]">
              {labelForField(row.field)}
            </span>
            {retracted && (
              <span className="rounded bg-[#f87171]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f87171]">
                Retracted
              </span>
            )}
            <Link
              to={`/gallery/${row.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[14px] font-medium text-[#c8cad0] no-underline hover:text-white"
            >
              {row.title}
            </Link>
          </div>
          <div className="mt-1 text-[11px] text-[#6b7280]">
            Published {publishedAt}
            {row.conference && ` · ${row.conference}`}
            {row.year && ` · ${row.year}`}
            {` · user ${row.user_id.slice(0, 8)}…`}
          </div>
          {row.notes && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[#9ca3af]">
              {row.notes}
            </p>
          )}
          {retracted && row.retraction_reason && (
            <div className="mt-2 rounded border-l-2 border-[#f87171] bg-[#f87171]/5 px-2 py-1 text-[12px] text-[#f87171]">
              <strong>Reason:</strong> {row.retraction_reason}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {retracted ? (
            <button
              type="button"
              onClick={onUnretract}
              className="rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[12px] font-medium text-[#7c6aed] hover:border-[#7c6aed]"
            >
              Unretract
            </button>
          ) : isRetractExpanded ? null : (
            <button
              type="button"
              onClick={onStartRetract}
              className="rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-1.5 text-[12px] font-medium text-[#f87171] hover:border-[#f87171]"
            >
              Retract
            </button>
          )}
        </div>
      </div>

      {isRetractExpanded && (
        <div className="mt-4 rounded-md border border-[#f87171]/30 bg-[#0a0a12] p-3">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#f87171]">
            Retraction reason (required, max 500 characters)
          </label>
          <textarea
            value={reasonDraft}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why is this being retracted? Copyright, confidentiality, spam, terms violation…"
            maxLength={500}
            rows={3}
            autoFocus
            className="w-full resize-y rounded border border-[#2a2a3a] bg-[#1a1a26] px-3 py-2 text-[13px] text-[#e2e2e8] outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-[#6b7280]">{reasonDraft.length} / 500</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancelRetract}
                className="rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[12px] font-medium text-[#c8cad0] hover:border-[#7c6aed]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitRetract}
                disabled={reasonDraft.trim().length === 0}
                className="rounded-md bg-[#f87171] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retract
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
