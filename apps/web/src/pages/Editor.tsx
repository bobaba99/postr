/**
 * Editor page — loads the poster row from Supabase, sets it in the
 * Zustand store, then mounts <PosterEditor />.
 *
 * Friction principle: if the URL contains "/p/new" or any id we
 * can't resolve, we silently fall back to the user's most recently
 * updated poster (handle_new_user already created an Untitled one
 * for every anonymous session). The user always lands on a real
 * editable canvas — never an error page.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadMostRecentPoster, loadPoster } from '@/data/posters';
import { usePosterStore } from '@/stores/posterStore';
import { PosterEditor } from '@/poster/PosterEditor';
import type { PosterDoc } from '@postr/shared';

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

export default function Editor() {
  const { posterId } = useParams<{ posterId: string }>();
  const navigate = useNavigate();
  const setPoster = usePosterStore((s) => s.setPoster);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let row =
          posterId && posterId !== 'new'
            ? await loadPoster(posterId)
            : null;

        if (!row) {
          row = await loadMostRecentPoster();
        }

        if (!row) {
          if (!cancelled) setStatus({ kind: 'error', message: 'No poster found for this account.' });
          return;
        }

        if (cancelled) return;
        setPoster(row.id, row.data as PosterDoc);
        // Normalize the URL so refreshes land on the real id, not "/p/new"
        if (posterId !== row.id) {
          navigate(`/p/${row.id}`, { replace: true });
        }
        setStatus({ kind: 'ready' });
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load poster';
        setStatus({ kind: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [posterId, setPoster, navigate]);

  if (status.kind === 'loading') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Loading poster…</div>
      </main>
    );
  }

  if (status.kind === 'error') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-base font-medium">Couldn’t load this poster</p>
          <p className="text-xs text-[#888]">{status.message}</p>
        </div>
      </main>
    );
  }

  return <PosterEditor />;
}
