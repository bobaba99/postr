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
import { loadOrCreateMostRecentPoster, loadPoster } from '@/data/posters';
import { usePosterStore } from '@/stores/posterStore';
import { PosterEditor } from '@/poster/PosterEditor';
import { makeBlocks } from '@/poster/templates';
import { PALETTES } from '@/poster/constants';
import type { PosterDoc } from '@postr/shared';

/**
 * Posters can arrive here empty — either from the handle_new_user
 * trigger (which inserts with the migration's default data) or from
 * the client createPoster() fallback. Both paths leave `blocks: []`
 * and a palette that doesn't exactly match the Classic Academic
 * catalog entry. Hydrate the doc so the user always lands on a
 * populated 3-column template with a real catalog palette.
 *
 * This is in-memory only — Phase 4 autosave will persist the
 * hydrated doc the moment the user touches anything.
 */
function hydrateIfEmpty(doc: PosterDoc): PosterDoc {
  if (doc.blocks.length > 0) return doc;
  const classic = PALETTES[0]!;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name: _name, ...palette } = classic;
  return {
    ...doc,
    blocks: makeBlocks('3col', doc.widthIn, doc.heightIn),
    palette,
  };
}

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
        // Try the URL id first. If that fails (unknown id, RLS miss,
        // or the "/p/new" sentinel) fall through to load-or-create.
        let row =
          posterId && posterId !== 'new'
            ? await loadPoster(posterId)
            : null;

        if (!row) {
          row = await loadOrCreateMostRecentPoster();
        }

        if (cancelled) return;
        setPoster(row.id, hydrateIfEmpty(row.data as PosterDoc));
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
