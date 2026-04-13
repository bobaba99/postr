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
import { DEFAULT_STYLES, PALETTES } from '@/poster/constants';
import { useTwoTabGuard } from '@/hooks/useTwoTabGuard';
import type { PosterDoc, Styles, TypeStyle } from '@postr/shared';
import { uploadBase64Image } from '@/data/posterImages';
import { supabase } from '@/lib/supabase';

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

/**
 * Print-readability sanity limits for each style level, in poster
 * units (1 unit = 7.2 points). Anything above these clearly violates
 * the guideline — older documents written before the calibration fix
 * saved sizes like title:60 / heading:28 / body:18, which rendered as
 * 432pt / 202pt / 130pt and crammed the layout. If we detect any
 * level above its ceiling, we replace JUST that level with the
 * default — preserving user-tweaked colors, weights, and italics on
 * any level that's already within the sane range.
 *
 * Ceilings are deliberately generous so users can still crank a
 * title to ~200pt if they want; only clearly-broken old defaults
 * get replaced.
 */
const STYLE_SIZE_CEILING_UNITS: Record<keyof Styles, number> = {
  title: 30, // ~216pt
  heading: 14, // ~100pt
  authors: 10, // ~72pt
  body: 10, // ~72pt
};

function normalizeStaleStyles(doc: PosterDoc): PosterDoc {
  const levels: Array<keyof Styles> = ['title', 'heading', 'authors', 'body'];
  let mutated = false;
  const next: Styles = { ...doc.styles };
  for (const level of levels) {
    const current: TypeStyle | undefined = doc.styles[level];
    if (!current || current.size > STYLE_SIZE_CEILING_UNITS[level]) {
      next[level] = DEFAULT_STYLES[level];
      mutated = true;
    }
  }
  if (!mutated) return doc;
  return { ...doc, styles: next };
}

/**
 * One-time background migration: upload base64 imageSrc values to
 * Supabase Storage and replace them with storage:// paths. Runs
 * after poster load, fire-and-forget. Triggers a store update on
 * success so autosave persists the migrated paths.
 */
async function migrateBase64ToStorage(posterId: string, doc: PosterDoc) {
  const base64Blocks = doc.blocks.filter(
    (b) => b.imageSrc && b.imageSrc.startsWith('data:'),
  );
  if (base64Blocks.length === 0) return;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;

  let mutated = false;
  const nextBlocks = await Promise.all(
    doc.blocks.map(async (b) => {
      if (!b.imageSrc || !b.imageSrc.startsWith('data:')) return b;
      const storageSrc = await uploadBase64Image(userId, posterId, b.id, b.imageSrc);
      if (!storageSrc) return b;
      mutated = true;
      return { ...b, imageSrc: storageSrc };
    }),
  );

  if (!mutated) return;

  // Update the store with migrated paths — autosave will persist.
  const { usePosterStore } = await import('@/stores/posterStore');
  const store = usePosterStore.getState();
  if (store.posterId === posterId && store.doc) {
    store.setPoster(posterId, { ...store.doc, blocks: nextBlocks }, store.posterTitle);
  }
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

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

        // If an explicit poster id was provided but doesn't exist,
        // show a not-found message instead of silently loading a
        // different poster. Only fall back for the `/p/new` case.
        if (!row && posterId && posterId !== 'new') {
          if (!cancelled) setStatus({ kind: 'not-found' });
          return;
        }

        if (!row) {
          row = await loadOrCreateMostRecentPoster();
        }

        if (cancelled) return;
        // normalizeStaleStyles runs first so that docs saved before
        // the typography calibration fix (title:60, heading:28, etc.)
        // self-heal on load without needing a db reset.
        const raw = row.data as PosterDoc;
        const hydrated = hydrateIfEmpty(normalizeStaleStyles(raw));
        setPoster(row.id, hydrated, row.title);
        // Normalize the URL so refreshes land on the real id, not "/p/new"
        if (posterId !== row.id) {
          navigate(`/p/${row.id}`, { replace: true });
        }
        setStatus({ kind: 'ready' });

        // Background migration: upload any base64 images to Storage.
        // Fire-and-forget — the poster renders immediately with base64,
        // then autosave picks up the storage:// paths on next change.
        migrateBase64ToStorage(row.id, hydrated);
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

  if (status.kind === 'not-found') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-base font-medium">Poster not found</p>
          <p className="text-xs text-[#888]">
            The poster you're looking for doesn't exist or you don't have access to it.
          </p>
          <a
            href="/dashboard"
            className="mt-4 inline-block rounded-md bg-[#2a2a3a] px-4 py-2 text-xs font-medium text-[#c8cad0] hover:bg-[#3a3a4a]"
          >
            Back to Dashboard
          </a>
        </div>
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

  return <EditorWithGuards posterId={posterId ?? null} />;
}

function EditorWithGuards({ posterId }: { posterId: string | null }) {
  const { collision, dismiss } = useTwoTabGuard(posterId);
  return (
    <>
      {collision && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            maxWidth: 520,
            padding: '12px 18px',
            background: '#7f1d1d',
            border: '1px solid #f87171',
            borderRadius: 10,
            color: '#fecaca',
            fontSize: 13,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.5,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <span aria-hidden style={{ flex: '0 0 auto', fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <b style={{ color: '#fef2f2' }}>
              This poster is already open in another tab.
            </b>
            <br />
            Postr autosave is last-write-wins, so edits in one tab can
            silently overwrite the other. Close the duplicate tab to
            avoid losing work.
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss warning"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '2px 8px',
              color: '#fecaca',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      <PosterEditor />
    </>
  );
}
