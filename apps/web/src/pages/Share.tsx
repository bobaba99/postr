/**
 * Share — public read-only poster viewer with guest commenting.
 *
 * Route `/s/:slug` is mounted outside AuthBootstrap so anonymous
 * visitors can land directly without a sign-in gate. `ensureSession`
 * (called from the main app shell) still bootstraps an anonymous
 * Supabase session; once that resolves, guests can insert comments
 * under RLS (`user_id = auth.uid()`).
 *
 * Renders the full `<PosterEditor readOnly />` so reviewers see the
 * exact same canvas the owner sees — fonts, palette, blocks, images —
 * with only the Comments sidebar exposed. Autosave and block-level
 * edits are gated off via the `readOnly` prop.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadPosterBySlug } from '@/data/posters';
import { usePosterStore } from '@/stores/posterStore';
import { PosterEditor } from '@/poster/PosterEditor';
import type { PosterDoc } from '@postr/shared';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export default function Share() {
  const { slug } = useParams<{ slug: string }>();
  const setPoster = usePosterStore((s) => s.setPoster);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!slug) {
      setStatus({ kind: 'not-found' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await loadPosterBySlug(slug);
        if (cancelled) return;
        if (!row) {
          setStatus({ kind: 'not-found' });
          return;
        }
        setPoster(row.id, row.data as PosterDoc, row.title);
        setStatus({ kind: 'ready' });
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, setPoster]);

  if (status.kind === 'loading') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Loading poster…</div>
      </main>
    );
  }
  if (status.kind === 'not-found') {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <h1 className="text-xl font-semibold">Poster not found</h1>
        <p className="mt-2 text-sm text-[#888]">
          The link may be wrong, or the owner may have unpublished it.
        </p>
      </main>
    );
  }
  if (status.kind === 'error') {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <h1 className="text-xl font-semibold">Couldn't load this poster</h1>
        <p className="mt-2 text-sm text-[#888]">{status.message}</p>
      </main>
    );
  }

  return <PosterEditor readOnly />;
}
