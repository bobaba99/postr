/**
 * Fix 23 — the editor opens only the signed-in user's own posters.
 * Engineering record: docs/fixes/23-new-poster-owner-only.md.
 *
 *   H2  The editor did not check who owns the poster it loaded: another
 *       user's poster that the database lets anyone read (a shared one)
 *       opened as editable, and every save was refused.
 *   G3  When the signed-in user changes mid-edit (a sign-in to another
 *       account in another tab, or a lost session that is replaced by a new
 *       guest), the old poster stayed loaded under the new user. It now
 *       closes, and the page says the poster is in another account (not
 *       "Poster not found": the user was just editing it).
 *
 * The page is entered by its route, as in the app. The backend is mocked
 * at the data layer: which user is signed in (the Supabase client's
 * session, and the auth event it emits when that changes) and whose poster
 * the database returns. /p/new's query is covered in
 * src/data/__tests__/posters.test.ts; the whole path in a browser is
 * scripts/new-poster-owner-check.mjs.
 *
 * Re-run: npx vitest run src/pages/__tests__/EditorOwnership.test.tsx
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The editor tree is not under test; which poster the page opens is. It
// counts how often it is mounted: closing and reopening the editor loses
// its state, so a change that should leave it open must not remount it.
const mounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/poster/PosterEditor', async () => {
  const { useEffect } = await import('react');
  return {
    PosterEditor: () => {
      useEffect(() => { mounts.count += 1; }, []);
      return <div data-testid="poster-editor" />;
    },
  };
});
vi.mock('@/hooks/useTwoTabGuard', () => ({
  useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }),
}));
vi.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ armed: false, leaveModalOpen: false, requestLeave: vi.fn(() => false), confirmLeave: vi.fn(), cancelLeave: vi.fn() }),
}));

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
const auth = vi.hoisted(() => {
  const state = { uid: 'owner', listeners: [] as AuthCallback[] };
  const session = () => (state.uid ? { user: { id: state.uid }, access_token: `token-${state.uid}` } : null);
  return {
    state,
    api: {
      getSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: state.uid ? { id: state.uid } : null }, error: null })),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        state.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => { state.listeners = state.listeners.filter((l) => l !== cb); } } } };
      }),
    },
    /** The client's session changes and it tells its listeners, as supabase-js does. */
    emit(event: string, uid: string | null) {
      state.uid = uid ?? '';
      for (const l of [...state.listeners]) l(event, uid ? { user: { id: uid } } : null);
    },
  };
});
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: auth.api,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), createSignedUrl: async () => ({ data: null }) }) },
  },
}));

/**
 * The poster in the database: whose it is, and whether it is shared. The
 * database returns it to its owner, and to anyone when it is shared (the
 * posters read policy); to anyone else it does not exist.
 */
const db = vi.hoisted(() => ({ owner: 'owner', shared: false, gate: null as Promise<void> | null }));
const upload = vi.hoisted(() => vi.fn());
const row = (id: string) => ({
  id, user_id: db.owner, title: 'Lab meeting draft v3', width_in: 48, height_in: 36,
  data: {
    version: 1, widthIn: 48, heightIn: 36,
    blocks: [{ id: 'img', type: 'image', x: 10, y: 10, w: 100, h: 80, content: '', imageSrc: 'data:image/png;base64,iVBORw0KGgo=', imageFit: 'contain', tableData: null }],
    fontFamily: 'Source Sans 3', palette: {}, styles: {}, headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [], authors: [], references: [],
  },
  share_slug: db.shared ? 'zq-share' : null, is_public: db.shared,
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  loadPoster: vi.fn(async (id: string) => {
    // A test can hold a load back until it releases `db.gate`.
    if (db.gate) await db.gate;
    return auth.state.uid !== db.owner && !db.shared ? null : row(id);
  }),
  // /p/new: the signed-in user's most recent poster (its owner is the user).
  loadOrCreateMostRecentPoster: vi.fn(async () => ({ ...row('p1'), user_id: auth.state.uid })),
}));
// The background migration that moves embedded images into the user's
// own storage folder.
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  uploadBase64Image: upload,
}));

import Editor from '../Editor';
import { usePosterStore } from '@/stores/posterStore';

function openAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/p/:posterId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}

const notFound = () => screen.findByRole('heading', { name: 'Poster not found' });
const inAnotherAccount = () => screen.findByRole('heading', { name: 'This poster is in another account' });

beforeEach(() => {
  usePosterStore.setState({ posterId: null, doc: null });
  auth.state.uid = 'owner';
  auth.state.listeners = [];
  db.owner = 'owner';
  db.shared = false;
  db.gate = null;
  mounts.count = 0;
  upload.mockReset();
});

describe('H2 — another user\'s poster does not open in the editor', () => {
  it('a shared poster of another user, opened by its editor link, shows "Poster not found"', async () => {
    db.owner = 'stranger';
    db.shared = true;
    openAt('/p/p1');
    expect(await notFound()).toBeInTheDocument();
    expect(screen.queryByTestId('poster-editor')).toBeNull();
    expect(usePosterStore.getState().posterId, 'nothing is loaded into the editor').toBeNull();
  });

  it('nothing of the other user\'s poster is copied into the visitor\'s storage', async () => {
    db.owner = 'stranger';
    db.shared = true;
    openAt('/p/p1');
    await notFound();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(upload).not.toHaveBeenCalled();
  });

  it('another user\'s private poster, opened by its editor link, shows "Poster not found"', async () => {
    db.owner = 'stranger';
    openAt('/p/p1');
    expect(await notFound()).toBeInTheDocument();
  });

  it('control: the owner\'s own poster opens', async () => {
    openAt('/p/p1');
    expect(await screen.findByTestId('poster-editor')).toBeInTheDocument();
    expect(usePosterStore.getState().posterId).toBe('p1');
  });
});

describe('G3 — the check runs again when the signed-in user changes', () => {
  it('a sign-in to another account while the poster is open closes it', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    expect(await inAnotherAccount()).toBeInTheDocument();
    expect(screen.queryByTestId('poster-editor')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth');
  });

  it('a lost session replaced by a new guest closes it', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_OUT', null); });
    await act(async () => { auth.emit('SIGNED_IN', 'new-guest'); });
    expect(await inAnotherAccount()).toBeInTheDocument();
  });

  it('the browser tab no longer carries the closed poster\'s name', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await waitFor(() => expect(document.title).toContain('Lab meeting draft v3'));
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    await inAnotherAccount();
    await waitFor(() => expect(document.title).not.toContain('Lab meeting draft v3'));
  });

  it('signing back in to the owner\'s account opens the poster again', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'new-guest'); });
    await inAnotherAccount();
    await act(async () => { auth.emit('SIGNED_IN', 'owner'); });
    expect(await screen.findByTestId('poster-editor')).toBeInTheDocument();
  });

  it('control: a token refresh for the same user leaves the poster open', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    const before = mounts.count;
    await act(async () => { auth.emit('TOKEN_REFRESHED', 'owner'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('poster-editor')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Poster not found' })).toBeNull();
    expect(mounts.count, 'the editor was not closed and reopened').toBe(before);
  });
});

/** Stands in for the editor's own links to another poster (Duplicate, then "Open copy"), and the browser's Back. */
function OpenOther() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/p/p2')}>Open copy</button>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

describe('opening another of the user\'s posters from the editor', () => {
  it('swaps the poster without closing and reopening the editor', async () => {
    render(
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:posterId" element={<><Editor /><OpenOther /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('poster-editor');
    await act(async () => { screen.getByRole('button', { name: 'Open copy' }).click(); });
    await waitFor(() => expect(usePosterStore.getState().posterId).toBe('p2'));
    expect(screen.getByTestId('poster-editor')).toBeInTheDocument();
    expect(mounts.count).toBe(1);
  });

  it('a change of account while the next poster loads closes the open one', async () => {
    render(
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:posterId" element={<><Editor /><OpenOther /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('poster-editor');
    let release = () => {};
    db.gate = new Promise<void>((r) => { release = r; });
    await act(async () => { screen.getByRole('button', { name: 'Open copy' }).click(); });
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    expect(screen.queryByTestId('poster-editor'), 'the owner\'s poster is not left open under the new account').toBeNull();
    await act(async () => { release(); });
    expect(await notFound()).toBeInTheDocument();
  });

  it('after that change, Back to the poster that was open says it is in another account', async () => {
    render(
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:posterId" element={<><Editor /><OpenOther /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('poster-editor');
    let release = () => {};
    db.gate = new Promise<void>((r) => { release = r; });
    await act(async () => { screen.getByRole('button', { name: 'Open copy' }).click(); });
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    await act(async () => { release(); });
    await notFound();
    db.gate = null;
    await act(async () => { screen.getByRole('button', { name: 'Back' }).click(); });
    expect(await inAnotherAccount()).toBeInTheDocument();
  });
});

