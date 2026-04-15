/**
 * Share — public read-only poster viewer with guest commenting.
 *
 * Route `/s/:slug` is mounted outside AuthBootstrap so anonymous
 * visitors can land directly without a sign-in gate. `ensureSession`
 * (called from the main app shell) still bootstraps an anonymous
 * Supabase session; once that resolves, guests can insert comments
 * under RLS (`user_id = auth.uid()`).
 *
 * v1 renders the poster's saved thumbnail — full block rendering on
 * the guest side would require porting the editor's render pipeline
 * to a read-only variant and is tracked separately. Comments pin to
 * the thumbnail via the CommentsPanel sidebar; area / text anchors
 * are phase-2.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadPosterBySlug, type PosterRow } from '@/data/posters';
import { getThumbnailUrl } from '@/data/thumbnails';
import { CommentsPanel } from '@/poster/CommentsPanel';
import { supabase } from '@/lib/supabase';

export default function Share() {
  const { slug } = useParams<{ slug: string }>();
  const [poster, setPoster] = useState<PosterRow | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    'loading',
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setStatus('not-found');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await loadPosterBySlug(slug);
        if (cancelled) return;
        if (!row) {
          setStatus('not-found');
          return;
        }
        setPoster(row);
        if (row.thumbnail_path) {
          const url = await getThumbnailUrl(row.thumbnail_path);
          if (!cancelled) setThumbUrl(url);
        }
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setCurrentUserId(data.user?.id ?? null);
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === 'loading') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading…
      </main>
    );
  }
  if (status === 'not-found') {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-300">
        <h1 className="text-xl font-semibold">Poster not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The link may be wrong, or the owner may have unpublished it.
        </p>
      </main>
    );
  }
  if (status === 'error') {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-300">
        <h1 className="text-xl font-semibold">Couldn't load this poster</h1>
        <p className="mt-2 text-sm text-slate-500">{errMsg}</p>
      </main>
    );
  }
  if (!poster) return null;

  const isOwner = !!currentUserId && currentUserId === poster.user_id;

  return (
    <main className="flex h-screen w-screen bg-slate-950 text-slate-100">
      <section className="flex min-w-0 flex-1 flex-col items-center overflow-auto p-6">
        <header className="mb-4 w-full max-w-4xl text-left">
          <h1 className="text-lg font-semibold">{poster.title || 'Untitled poster'}</h1>
          <p className="text-xs text-slate-500">
            {poster.width_in}" × {poster.height_in}" · shared for review
          </p>
        </header>
        <div
          className="flex w-full max-w-4xl flex-1 items-start justify-center"
          style={{ minHeight: 0 }}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={poster.title}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
                background: '#fff',
              }}
            />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded border border-slate-800 bg-slate-900 text-sm text-slate-500">
              Preview not available — leave a comment on the document below.
            </div>
          )}
        </div>
      </section>
      <aside
        className="flex w-[360px] flex-col border-l border-slate-800 bg-slate-900"
        style={{ minHeight: 0 }}
      >
        <CommentsPanel
          posterId={poster.id}
          pendingAnchor={null}
          onClearPendingAnchor={() => {}}
          isOwner={isOwner}
          currentUserId={currentUserId}
        />
      </aside>
    </main>
  );
}
