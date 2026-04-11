/**
 * Gallery entry detail page — public, shows a single published poster.
 *
 * Open to anonymous visitors. If the entry doesn't exist or has been
 * retracted, shows a friendly "not found" state rather than a 404
 * component, so the URL can be copy-pasted without dead-ending.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PublicFooter } from '@/components/PublicFooter';
import { getGalleryEntry, labelForField, type GalleryEntryWithUrls } from '@/data/gallery';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; entry: GalleryEntryWithUrls }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export default function GalleryEntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!entryId) {
      setStatus({ kind: 'not_found' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entry = await getGalleryEntry(entryId);
        if (cancelled) return;
        setStatus(entry ? { kind: 'ready', entry } : { kind: 'not_found' });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      {status.kind === 'loading' && (
        <p className="py-24 text-center text-sm text-[#6b7280]">Loading…</p>
      )}

      {status.kind === 'error' && (
        <p className="py-24 text-center text-sm text-[#f87171]">
          Couldn’t load the entry: {status.message}
        </p>
      )}

      {status.kind === 'not_found' && (
        <section className="mx-auto max-w-xl px-8 py-24 text-center">
          <h1 className="text-3xl font-bold text-[#e2e2e8]">This entry is unavailable.</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-[#6b7280]">
            It may have been retracted by its author, or the link is wrong. Browse
            the rest of the gallery below.
          </p>
          <Link
            to="/gallery"
            className="mt-8 inline-block rounded-lg bg-[#7c6aed] px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-[#6c5ce7]"
          >
            Back to the gallery
          </Link>
        </section>
      )}

      {status.kind === 'ready' && <Detail entry={status.entry} />}

      <PublicFooter />
    </main>
  );
}

function Detail({ entry }: { entry: GalleryEntryWithUrls }) {
  const dateLabel = new Date(entry.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <article className="mx-auto max-w-4xl px-8 py-12">
      <Link to="/gallery" className="text-[12px] text-[#6b7280] no-underline hover:text-[#c8cad0]">
        ← Back to the gallery
      </Link>

      <header className="mt-6 mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#1a1a26] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#7c6aed]">
            {labelForField(entry.field)}
          </span>
          {entry.conference && (
            <span className="text-[12px] text-[#9ca3af]">{entry.conference}</span>
          )}
          {entry.year && (
            <span className="text-[12px] text-[#6b7280]">· {entry.year}</span>
          )}
          <span className="text-[12px] text-[#6b7280]">· published {dateLabel}</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
          {entry.title}
        </h1>
      </header>

      <div className="overflow-hidden rounded-xl border border-[#1f1f2e] bg-[#111118]">
        <img
          src={entry.image_url}
          alt={entry.title}
          className="w-full object-contain"
        />
      </div>

      {entry.pdf_url && (
        <div className="mt-4 flex justify-end">
          <a
            href={entry.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-[13px] font-medium text-[#c8cad0] no-underline hover:border-[#7c6aed] hover:text-white"
          >
            Download PDF
          </a>
        </div>
      )}

      {entry.notes && (
        <section className="mt-10 rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">
            Notes from the author
          </h2>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#9ca3af]">
            {entry.notes}
          </p>
        </section>
      )}

      <div className="mt-12 rounded-lg border-l-4 border-[#7c6aed] bg-[#111118] p-5 text-[13px] leading-relaxed text-[#9ca3af]">
        Postr is a sharing platform, not a publisher. This poster was uploaded by
        its author, who confirmed they own or have permission to share everything
        on it. If you believe it infringes your rights,{' '}
        <a className="text-[#7c6aed] underline" href="mailto:hello@postr.sh">
          email us
        </a>{' '}
        — see Section 5.4 of the{' '}
        <Link to="/terms" className="text-[#7c6aed] underline">
          Terms
        </Link>{' '}
        for the takedown procedure.
      </div>
    </article>
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
        <Link to="/gallery" className="text-sm text-[#7c6aed] no-underline hover:text-white">
          Gallery
        </Link>
        <Link to="/about" className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]">
          About
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

