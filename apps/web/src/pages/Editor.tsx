/**
 * Editor page — loads the poster row from Supabase, sets it in the
 * Zustand store, then mounts <PosterEditor />.
 *
 * Friction principle: "/p/new" opens the user's most recently updated
 * poster, or a new one, so a visitor always lands on an editable canvas.
 * An explicit id opens only the signed-in user's own poster; any other
 * id, including another user's shared poster, shows "Poster not found"
 * (fix 23).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { loadOrCreateMostRecentPoster, loadPoster } from '@/data/posters';
import { usePosterStore } from '@/stores/posterStore';
import { PosterEditor } from '@/poster/PosterEditor';
import { SecureWorkModal } from '@/poster/SecureWorkModal';
import { makeBlocks } from '@/poster/templates';
import { DEFAULT_STYLES, PALETTES, withUsableSheetSize } from '@/poster/constants';
import { useTwoTabGuard } from '@/hooks/useTwoTabGuard';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useSignedInUserId } from '@/hooks/useSignedInUserId';
import type { PosterDoc, Styles, TypeStyle } from '@postr/shared';
import { uploadBase64Image } from '@/data/posterImages';
import { supabase } from '@/lib/supabase';
import { reportUiSignal } from '@/lib/diagnostics';
import { editorMeta } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

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
 * Repair a stored size that is not a usable number of inches (missing, a
 * string, 0, absurd) BEFORE an empty poster is laid out from it. The row's
 * own width_in/height_in are the better fallback when they are usable;
 * otherwise the default sheet. The store repairs every document again on
 * entry (setPoster), without the row, so this is where the row counts.
 * The editor used to hide such a size by drawing every sheet through a preset
 * lookup; drawn as stored it is NaN (docs/fixes/02-poster-size.md).
 */
function normalizeSheetSize(doc: PosterDoc, row: { width_in: unknown; height_in: unknown }): PosterDoc {
  return withUsableSheetSize(doc, { widthIn: row.width_in, heightIn: row.height_in });
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
      const storageSrc = await uploadBase64Image(
        userId,
        posterId,
        b.id,
        b.imageSrc,
      );
      if (!storageSrc) return b;
      mutated = true;
      return { ...b, imageSrc: storageSrc };
    }),
  );

  if (!mutated) return;

  // Update blocks with migrated paths — use setBlocksSilent to avoid
  // pushing a phantom entry to the undo stack and wiping undo history.
  // Autosave will pick up the change on the next debounce cycle.
  const { usePosterStore } = await import('@/stores/posterStore');
  const store = usePosterStore.getState();
  if (store.posterId === posterId && store.doc) {
    store.setBlocksSilent(nextBlocks);
  }
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  // The poster was open for the user signed in before, and the signed-in
  // user changed (a sign-out, or a sign-in to another account, here or in
  // another tab).
  | { kind: 'account-changed' }
  | { kind: 'error'; message: string };

export default function Editor() {
  const { posterId } = useParams<{ posterId: string }>();
  const navigate = useNavigate();
  const setPoster = usePosterStore((s) => s.setPoster);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  // Who is signed in. The page opens only that user's own posters, and loads
  // again when the user changes (fix 23): the database also lets anyone read
  // a shared poster, and a sign-in elsewhere must not leave another user's
  // poster open under the new session.
  const userId = useSignedInUserId();
  // The poster that is open, and the user it was opened for.
  const openedRef = useRef<{ posterId: string; userId: string } | null>(null);

  // Noindex, and named after the poster so a user with several editor
  // tabs open can tell them apart; only while it is open, so a poster closed
  // by a change of account, or a poster that is not the user's, leaves no
  // name behind.
  useDocumentMeta(editorMeta(status.kind === 'ready' ? posterTitle : null, posterId));

  useEffect(() => {
    let cancelled = false;
    // Wait until the client has said who is signed in.
    if (userId === undefined) return undefined;
    // A change of user closes the poster that was open. It is not asked for
    // again: the new user cannot read a private poster, so the database would
    // only say it does not exist.
    const opened = openedRef.current;
    if (opened && opened.userId !== userId) {
      if (opened.posterId === posterId) {
        setStatus({ kind: 'account-changed' });
        return undefined;
      }
      // The open poster is closed at once; it stays remembered, so going
      // Back to it still says it is in another account.
      setStatus({ kind: 'loading' });
    } else {
      // An open editor stays open while the next poster loads (/p/new's
      // address becoming /p/<id>, or a copy opened from the editor), rather
      // than flashing the loading screen. The load still replaces the
      // poster when it lands (docs/fixes/23-new-poster-owner-only.md,
      // section 10).
      setStatus((s) => (s.kind === 'ready' ? s : { kind: 'loading' }));
    }

    (async () => {
      try {
        // Try the URL id first. If that fails (unknown id, RLS miss,
        // or the "/p/new" sentinel) fall through to load-or-create.
        let row =
          posterId && posterId !== 'new' ? await loadPoster(posterId) : null;

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
        // Someone else's poster (a shared one is readable by anyone) is not
        // found here: nothing of it is loaded, shown or migrated.
        if (!userId || row.user_id !== userId) {
          setStatus({ kind: 'not-found' });
          return;
        }
        openedRef.current = { posterId: row.id, userId };
        // normalizeStaleStyles runs first so that docs saved before
        // the typography calibration fix (title:60, heading:28, etc.)
        // self-heal on load without needing a db reset.
        const raw = row.data as PosterDoc;
        const hydrated = hydrateIfEmpty(normalizeSheetSize(normalizeStaleStyles(raw), row));
        // Seeding is opt-in and belongs to the EDITING entry point only.
        // Inside the editor the acknowledgement is fixed: seeded on load
        // and refused by every delete path. Exports are the opposite —
        // the mark ships as an ordinary removable object, because that
        // file is the author's, not ours.
        //
        // Deliberately NOT set on the other three setPoster callers:
        // Share.tsx renders a poster exactly as stored, version restore
        // already keeps the mark via the lock guard, and importPostr
        // calls ensureAckBlock itself.
        setPoster(row.id, hydrated, row.title, { seedAcknowledgement: true });
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
        const message =
          err instanceof Error ? err.message : 'Failed to load poster';
        setStatus({ kind: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [posterId, userId, setPoster, navigate]);

  if (status.kind === 'loading') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <h1 className="sr-only">Poster editor</h1>
        <div className="animate-pulse text-sm tracking-wide">
          Loading poster…
        </div>
      </main>
    );
  }

  if (status.kind === 'not-found') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-base font-medium">Poster not found</h1>
          <p className="text-xs text-[#888]">
            The poster you're looking for doesn't exist or you don't have access
            to it.
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

  if (status.kind === 'account-changed') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-base font-medium">This poster is in another account</h1>
          <p className="text-xs text-[#888]">
            The account signed in here changed. Sign in to the account that owns
            this poster to keep editing it.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <a
              href="/auth"
              className="inline-block rounded-md bg-[#2a2a3a] px-4 py-2 text-xs font-medium text-[#c8cad0] hover:bg-[#3a3a4a]"
            >
              Sign in
            </a>
            <a
              href="/dashboard"
              className="inline-block rounded-md bg-[#2a2a3a] px-4 py-2 text-xs font-medium text-[#c8cad0] hover:bg-[#3a3a4a]"
            >
              My posters
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (status.kind === 'error') {
    return <EditorLoadError message={status.message} />;
  }

  return (
    <>
      <h1 className="sr-only">
        {posterTitle ? `Editing ${posterTitle}` : 'Poster editor'}
      </h1>
      <EditorWithGuards posterId={posterId ?? null} />
    </>
  );
}

export function EditorWithGuards({ posterId }: { posterId: string | null }) {
  const { collision, dismiss } = useTwoTabGuard(posterId);
  // Leave guard: a guest who has edited this session gets nudged to
  // secure their poster before leaving. The hook arms a `beforeunload`
  // handler (the only thing the platform allows on a real tab-close /
  // refresh — and it also catches the editor's own full-page nav exits,
  // the logo and "Back to My Posters" links, which are plain <a href>
  // navigations). `leaveModalOpen` drives our own SecureWorkModal for the
  // in-app path once a `requestLeave()` caller is wired in. Only guests
  // with unsaved-session edits ever arm it — a permanent user is never
  // touched, so the logged-in editor is unchanged.
  const { leaveModalOpen, cancelLeave, confirmLeave } = useLeaveGuard();
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
          <span aria-hidden style={{ flex: '0 0 auto', fontSize: 18 }}>
            ⚠️
          </span>
          <div style={{ flex: 1 }}>
            <b style={{ color: '#fef2f2' }}>
              This poster is already open in another tab.
            </b>
            <br />
            Postr autosave is last-write-wins, so edits in one tab can silently
            overwrite the other. Close the duplicate tab to avoid losing work.
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
      {leaveModalOpen && (
        <SecureWorkModal
          reason="leave"
          onClose={cancelLeave}
          onConverted={confirmLeave}
        />
      )}
      <PosterEditor />
    </>
  );
}

/**
 * Shown when the poster could not be loaded.
 *
 * Split out from the render path so the failure can be reported exactly
 * once, on mount, rather than on every re-render. The visual treatment is
 * unchanged; see docs/stress-test/FINDINGS.md (F7) for the two open
 * issues with this screen — it prints the raw backend message, and it
 * offers no recovery control — which are deliberately left for a
 * follow-up rather than folded into an instrumentation change.
 */
function EditorLoadError({ message }: { message: string }) {
  useEffect(() => {
    const permissionDenied = /permission denied|row-level security/i.test(
      message,
    );
    reportUiSignal(
      permissionDenied
        ? {
            kind: 'session_invalid',
            reason: 'permission_denied',
            route: '/p/:posterId',
            recovered: false,
          }
        : {
            kind: 'client_error',
            name: 'PosterLoadFailed',
            // Postgres/PostgREST messages embed row values (Key (title)=(…)),
            // so the raw text is not safe to log. The screen still shows it
            // to the user; only the signal is sanitised.
            message: 'see console',
            where: 'Editor.load',
            // No retry, no navigation: the user cannot proceed from here.
            deadEnd: true,
          },
      { surface: 'poster-editor' },
    );
  }, [message]);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-base font-medium">Couldn’t load this poster</h1>
        <p className="text-xs text-[#888]">{message}</p>
      </div>
    </main>
  );
}
