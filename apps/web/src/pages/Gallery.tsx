/**
 * Public gallery — grid of published posters.
 *
 * Open to anonymous visitors (no AuthGuard). Supports a single
 * field-dropdown filter for v1; richer filters (multi-select,
 * conference, full-text search) are PRD future work item 13.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listGallery,
  FIELD_OPTIONS,
  labelForField,
  type GalleryEntryWithUrls,
  type GalleryField,
} from '@/data/gallery';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: GalleryEntryWithUrls[] }
  | { kind: 'error'; message: string };

export default function Gallery() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [field, setField] = useState<GalleryField | 'all'>('all');

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const rows = await listGallery({ field: field === 'all' ? undefined : field });
      setStatus({ kind: 'ready', rows });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [field]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      <section className="mx-auto max-w-3xl px-8 pt-16 pb-8 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          Public gallery
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          Real posters,<br />
          <span className="text-[#7c6aed]">from real researchers.</span>
        </h1>
        <p className="mt-6 text-base text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          Browse posters published by the Postr community. Everything here was
          uploaded by its author, who confirmed they hold the rights to share it.
          Found something off?{' '}
          <a
            className="text-[#7c6aed] underline"
            href="mailto:hello@postr.sh"
          >
            Let us know
          </a>
          .
        </p>
      </section>

      {/* Filter bar */}
      <section className="mx-auto max-w-6xl px-8 pb-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1f1f2e] pb-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">
            Filter by field
          </span>
          <select
            value={field}
            onChange={(e) => setField(e.target.value as GalleryField | 'all')}
            className="rounded-md border border-[#2a2a3a] bg-[#111118] px-3 py-1.5 text-[13px] text-[#c8cad0] outline-none hover:border-[#7c6aed]"
          >
            <option value="all">All fields</option>
            {FIELD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {status.kind === 'ready' && (
            <span className="ml-auto text-[12px] text-[#6b7280]">
              {status.rows.length} {status.rows.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-8 pb-24">
        {status.kind === 'loading' && (
          <p className="py-12 text-center text-sm text-[#6b7280]">Loading gallery…</p>
        )}
        {status.kind === 'error' && (
          <p className="py-12 text-center text-sm text-[#f87171]">
            Couldn’t load gallery: {status.message}
          </p>
        )}
        {status.kind === 'ready' && status.rows.length === 0 && (
          <div className="mx-auto max-w-md rounded-xl border border-[#1f1f2e] bg-[#111118] p-10 text-center">
            <h3 className="text-lg font-semibold text-[#e2e2e8]">Nothing here yet.</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">
              {field === 'all'
                ? 'Be the first to publish a poster. Sign in and look for the "Publish" button on the dashboard or in the editor.'
                : `No posters have been published under ${labelForField(field).toLowerCase()} yet. Try a different field.`}
            </p>
          </div>
        )}
        {status.kind === 'ready' && status.rows.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {status.rows.map((row) => (
              <GalleryCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>

      <PublicFooter />
    </main>
  );
}

function GalleryCard({ row }: { row: GalleryEntryWithUrls }) {
  return (
    <Link
      to={`/gallery/${row.id}`}
      className="group block overflow-hidden rounded-xl border border-[#1f1f2e] bg-[#111118] no-underline transition-colors hover:border-[#7c6aed]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0a0a12]">
        <img
          src={row.image_url}
          alt={row.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="rounded bg-[#1a1a26] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7c6aed]">
            {labelForField(row.field)}
          </span>
          {row.year && (
            <span className="text-[11px] text-[#6b7280]">{row.year}</span>
          )}
        </div>
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#e2e2e8] group-hover:text-white">
          {row.title}
        </h3>
        {row.conference && (
          <p className="mt-1 truncate text-[12px] text-[#6b7280]">{row.conference}</p>
        )}
      </div>
    </Link>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <span className="text-xl font-bold text-[#c8cad0]">Postr</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/about" className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]">
          About
        </Link>
        <Link to="/gallery" className="text-sm text-[#7c6aed] no-underline hover:text-white">
          Gallery
        </Link>
        <Link
          to="/auth"
          className="rounded-lg border border-[#7c6aed] px-5 py-2 text-sm font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-[#1f1f2e] px-8 py-6 text-center text-sm text-[#555]">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link to="/" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Home
        </Link>
        <Link to="/about" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          About
        </Link>
        <Link to="/gallery" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Gallery
        </Link>
        <Link to="/privacy" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Privacy
        </Link>
        <Link to="/cookies" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Cookies
        </Link>
        <Link to="/terms" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Terms
        </Link>
      </div>
    </footer>
  );
}
