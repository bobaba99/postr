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
import { flushSync } from 'react-dom';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';

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

type AuthCallback = (event: string, session: { user: { id: string; is_anonymous: boolean } } | null) => void;
const auth = vi.hoisted(() => {
  // `guests`: the users that are guests (anonymous sessions).
  const state = { uid: 'owner', guests: new Set<string>(), listeners: [] as AuthCallback[] };
  const user = (uid: string) => ({ id: uid, is_anonymous: state.guests.has(uid) });
  const session = () => (state.uid ? { user: user(state.uid), access_token: `token-${state.uid}` } : null);
  return {
    state,
    api: {
      getSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: state.uid ? user(state.uid) : null }, error: null })),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        state.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => { state.listeners = state.listeners.filter((l) => l !== cb); } } } };
      }),
    },
    /** The client's session changes and it tells its listeners, as supabase-js does. */
    emit(event: string, uid: string | null) {
      state.uid = uid ?? '';
      for (const l of [...state.listeners]) l(event, uid ? { user: user(uid) } : null);
    },
  };
});
// Signing a stored image as the storage service does: only the owner of
// the folder can sign its paths, and a signed URL works until it expires.
const storage = vi.hoisted(() => ({
  sign: vi.fn(async (path: string, seconds: number) => (path.startsWith(`${auth.state.uid}/`)
    ? { data: { signedUrl: `https://signed.test/${path}?until=${Date.now() + seconds * 1000}` }, error: null }
    : { data: null, error: { message: 'not allowed' } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: auth.api,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), createSignedUrl: storage.sign }) },
  },
}));

/**
 * The poster in the database: whose it is, and whether it is shared. The
 * database returns it to its owner, and to anyone when it is shared (the
 * posters read policy); to anyone else it does not exist.
 */
const db = vi.hoisted(() => ({ owner: 'owner', shared: false, gate: null as Promise<void> | null, imageSrc: 'data:image/png;base64,iVBORw0KGgo=' }));
const upload = vi.hoisted(() => vi.fn());
const row = (id: string) => ({
  id, user_id: db.owner, title: 'Lab meeting draft v3', width_in: 48, height_in: 36,
  data: {
    version: 1, widthIn: 48, heightIn: 36,
    blocks: [{ id: 'img', type: 'image', x: 10, y: 10, w: 100, h: 80, content: '', imageSrc: db.imageSrc, imageFit: 'contain', tableData: null }],
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
  loadOrCreateMostRecentPoster: vi.fn(async () => {
    const uid = auth.state.uid;
    if (db.gate) await db.gate;
    return { ...row('p1'), user_id: uid };
  }),
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
  auth.state.guests = new Set();
  auth.state.listeners = [];
  db.owner = 'owner';
  db.shared = false;
  db.gate = null;
  db.imageSrc = 'data:image/png;base64,iVBORw0KGgo=';
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

describe('the owner\'s images go only into the owner\'s storage folder', () => {
  // Step 9 round 2 (S9R2-2): the owner travels with the poster, for the
  // uploads the editor makes later (src/poster/__tests__/uploadOwner.test.tsx).
  it('the editor records the owner with the poster it opens', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    expect(usePosterStore.getState().posterOwnerId).toBe('owner');
  });

  // Step 10 critic, G1: after a poster opens, its embedded images are moved
  // into storage in the background, into the folder of whoever was signed in
  // when that ran. A sign-in to another account landing between the load and
  // the move put the owner's images in the other account's folder. Nothing
  // is uploaded at all while another user is signed in: an upload into the
  // owner's folder under the other user's session is left to the storage
  // policy to refuse.
  it('a sign-in to another account between the load and the image move uploads nothing', async () => {
    db.shared = true;
    let release = () => {};
    db.gate = new Promise<void>((r) => { release = r; });
    openAt('/p/p1');
    await act(async () => { await Promise.resolve(); });
    // The other account's session is stored before its event reaches this tab.
    auth.state.uid = 'someone-else';
    await act(async () => { release(); });
    await screen.findByTestId('poster-editor');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(upload).not.toHaveBeenCalled();
  });

  it('control: with no change of user, the images move into the owner\'s folder', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls.every(([uid]) => uid === 'owner')).toBe(true);
  });
});

describe('G3 — the check runs again when the signed-in user changes', () => {
  it('a sign-in to another account while the poster is open closes it', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    expect(await inAnotherAccount()).toBeInTheDocument();
    expect(screen.queryByTestId('poster-editor')).toBeNull();
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
    // The editor's mount effect can land after it first renders (round 6,
    // R6C-3: 1 of 30 runs read the count too early).
    await waitFor(() => expect(mounts.count).toBe(1));
    const before = mounts.count;
    await act(async () => { auth.emit('TOKEN_REFRESHED', 'owner'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('poster-editor')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Poster not found' })).toBeNull();
    expect(mounts.count, 'the editor was not closed and reopened').toBe(before);
  });
});

describe('the page a closed poster leaves (step 10, R1-1 and R1-2)', () => {
  // R1-1: /auth sends a signed-in permanent account on to /dashboard, so the
  // page's "Sign in" reached no sign-in form while one was signed in.
  // R1-2: a guest whose browser signs in to an existing account loses the
  // guest session for good, and the poster that was on screen with it.
  const closedGuestPoster = () => screen.findByRole('heading', { name: 'This guest poster was closed' });
  function openAsGuest() {
    auth.state.guests.add('guest-a');
    auth.state.uid = 'guest-a';
    db.owner = 'guest-a';
    openAt('/p/p1');
  }

  it('a guest\'s poster closed by a sign-in to an existing account says the guest session ended, and offers no sign-in', async () => {
    openAsGuest();
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
    expect(await closedGuestPoster()).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download a copy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My posters' })).toHaveAttribute('href', '/dashboard');
  });

  // Step 9 round 3 (S9R3-2): the editor that had the focus is gone.
  it('the closed page takes the focus', async () => {
    openAsGuest();
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
    expect(document.activeElement).toBe(await closedGuestPoster());
  });

  it('a guest\'s poster closed by a sign-out offers no sign-in either: a guest session cannot be signed in to again', async () => {
    openAsGuest();
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_OUT', null); });
    await closedGuestPoster();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('"Download a copy" saves the poster that was on screen as a .postr file', async () => {
    const saved: { name: string; blob: Blob }[] = [];
    const blobs = new Map<string, Blob>();
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (b: Blob) => { const u = `blob:copy-${blobs.size}`; blobs.set(u, b); return u; },
      revokeObjectURL: () => {},
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blobs.get(this.getAttribute('href') ?? '')! });
    });
    try {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await act(async () => { screen.getByRole('button', { name: 'Download a copy' }).click(); });
      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0]!.name).toBe('Lab_meeting_draft_v3.postr');
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(saved[0]!.blob);
      });
      const entries = unzipSync(new Uint8Array(bytes));
      const doc = JSON.parse(new TextDecoder().decode(entries['poster.json'])) as { blocks: { id: string }[] };
      expect(doc.blocks.map((b) => b.id)).toContain('img');
      // The poster's own image travels with it.
      expect(entries['assets/img.png']?.length).toBeGreaterThan(0);
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  // Step 9 round 2, S9R2-1, and round 3, S9R3-1: a stored image is fetched
  // by a signed URL. Only the owner can sign one, a URL works for 60 minutes,
  // and the app caches it for 50; after a change of account the copy can
  // only use a URL signed for the owner. Made when the button was pressed,
  // the copy left the image out once the cache had expired; made as the page
  // opens, it still did when the editor had been open over 50 minutes.
  describe('a stored image in the copy', () => {
    const saved: Blob[] = [];
    let n = 0;
    const MIN = 60_000;
    const bytesOf = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    /** The editor shows the image: it is signed for the owner signed in now. */
    const shown = async () => {
      const { resolveStorageUrl } = await import('@/data/posterImages');
      await act(async () => { expect(await resolveStorageUrl(db.imageSrc), 'precondition: signed for the owner').toBeTruthy(); });
    };
    // Each timer due in the span fires at its own moment, and what it queues
    // as microtasks (the mocked signing and fetch are instant) settles before
    // the next (step 9 round 5, SK5-1: one synchronous jump wrote the
    // renewal's cache entry at the end of the span, so its expiry could not be
    // seen). A signing with real latency would still land at the span's end.
    const later = async (minutes: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(minutes * MIN); }); };
    const pressDownload = async () => {
      await act(async () => { screen.getByRole('button', { name: 'Download a copy' }).click(); });
      await waitFor(() => expect(saved).toHaveLength(1));
    };
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      saved.length = 0;
      n += 1;
      db.imageSrc = `storage://guest-a/p1/img-${n}.png`;
      const blobs = new Map<string, Blob>();
      vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: (b: Blob) => { const u = `blob:copy-${blobs.size}`; blobs.set(u, b); return u; },
        revokeObjectURL: () => {},
      }));
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(blobs.get(this.getAttribute('href') ?? '')!);
      });
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const until = Number(new URL(url).searchParams.get('until'));
        return url.startsWith('https://signed.test/') && Date.now() < until
          ? { ok: true, arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }
          : { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
      }));
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('is in the copy when the button is pressed an hour after the close', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      // The copy is made as the page opens, not on a timer the hour would fire
      // (round 6, SK6-2: with the timers fired in turn, a copy put off to one
      // passed).
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      await later(61);
      await pressDownload();
      expect(unzipSync(await bytesOf(saved[0]!))['assets/img.png']?.length).toBe(4);
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('is in the copy when the editor was open over 50 minutes before the account changed', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(55);
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(unzipSync(await bytesOf(saved[0]!))['assets/img.png']?.length).toBe(4);
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    // Step 9 round 4, S9R4-3: the 55-minute case alone let a renewal at 52
    // or 54 minutes pass; the cache's 50 minutes are the edge (round 5,
    // SK5-4: at 51 minutes a renewal due at 51 still passed).
    it('is in the copy when the account changes just after the first signing would have expired', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(50.5);
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(unzipSync(await bytesOf(saved[0]!))['assets/img.png']?.length).toBe(4);
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('a renewal refused because another tab already signed in keeps the URL signed for the owner', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(39);
      auth.state.uid = 'account-b'; // the session in storage is B's; this tab has not heard yet
      await later(2); // the 40-minute renewal signs as B, and is refused
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(unzipSync(await bytesOf(saved[0]!))['assets/img.png']?.length).toBe(4);
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('an image added after the poster opened is renewed too', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(30);
      const lateSrc = `storage://guest-a/p1/late-${n}.png`;
      act(() => {
        const doc = usePosterStore.getState().doc!;
        usePosterStore.setState({ doc: { ...doc, blocks: [...doc.blocks, { ...doc.blocks[0]!, id: 'late', imageSrc: lateSrc }] } });
      });
      const { resolveStorageUrl } = await import('@/data/posterImages');
      await act(async () => { expect(await resolveStorageUrl(lateSrc), 'precondition: signed for the owner').toBeTruthy(); });
      await later(55); // its first signing expired at 80 minutes
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    // Round 6, SK6-1: just before the second renewal the first renewal's
    // entry must still hold, which pins its expiry above the 40-minute period
    // (a renewal cached for 21 to 39 minutes passed every other test).
    it('is in the copy when the account changes just before the second renewal', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(79.5);
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(unzipSync(await bytesOf(saved[0]!))['assets/img.png']?.length).toBe(4);
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('keeps renewing while the poster stays open', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await later(95); // renewed at 40 and 80 minutes
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('renews a figure uploaded into a poster that opened with none stored', async () => {
      db.imageSrc = 'data:image/png;base64,iVBORw0KGgo=';
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await later(5);
      const figSrc = `storage://guest-a/p1/fig-${n}.png`;
      act(() => {
        const doc = usePosterStore.getState().doc!;
        usePosterStore.setState({ doc: { ...doc, blocks: [...doc.blocks, { ...doc.blocks[0]!, id: 'fig', imageSrc: figSrc }] } });
      });
      const { resolveStorageUrl } = await import('@/data/posterImages');
      await act(async () => { expect(await resolveStorageUrl(figSrc), 'precondition: signed for the owner').toBeTruthy(); });
      await later(55); // its first signing expired at 55 minutes
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(screen.getByRole('status').textContent).toBe('Downloaded.');
    });

    it('an image the owner cannot sign does not stop the renewal of the others', async () => {
      db.imageSrc = `storage://someone-else/p1/img-${n}.png`;
      openAsGuest();
      await screen.findByTestId('poster-editor');
      const ownSrc = `storage://guest-a/p1/own-${n}.png`;
      act(() => {
        const doc = usePosterStore.getState().doc!;
        usePosterStore.setState({ doc: { ...doc, blocks: [...doc.blocks, { ...doc.blocks[0]!, id: 'own', imageSrc: ownSrc }] } });
      });
      const { resolveStorageUrl } = await import('@/data/posterImages');
      await act(async () => { expect(await resolveStorageUrl(ownSrc), 'precondition: signed for the owner').toBeTruthy(); });
      await later(55);
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(screen.getByRole('status').textContent).toBe('Downloaded. 1 image could not be included.');
    });

    it('an hour open signs the image twice: when shown, and once renewed', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      const path = db.imageSrc.slice('storage://'.length);
      await later(60);
      expect(storage.sign.mock.calls.filter(([p]) => p === path)).toHaveLength(2);
    });

    it('the renewal stops when the poster closes', async () => {
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await shown();
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      const signings = storage.sign.mock.calls.length;
      await later(120);
      expect(storage.sign.mock.calls.length).toBe(signings);
    });

    it('a copy that cannot be made says so, and can be tried again', async () => {
      const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('the hash failed'));
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await act(async () => { screen.getByRole('button', { name: 'Download a copy' }).click(); });
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Something went wrong. Try again.'));
      expect(saved).toHaveLength(0);
      spy.mockRestore();
      await pressDownload();
    });

    it('an image that cannot be fetched at all is counted, not passed over', async () => {
      db.imageSrc = `storage://someone-else/p1/img-${n}.png`;
      openAsGuest();
      await screen.findByTestId('poster-editor');
      await act(async () => { auth.emit('SIGNED_IN', 'account-b'); });
      await closedGuestPoster();
      await pressDownload();
      expect(screen.getByRole('status').textContent).toMatch(/1 image could not be included/);
    });
  });

  it('a poster closed by a sign-in to another permanent account offers no "Sign in", which could not reach a form', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_IN', 'someone-else'); });
    await inAnotherAccount();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download a copy' })).toBeInTheDocument();
  });

  it('control: with a guest signed in now, "Sign in" is offered', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    auth.state.guests.add('new-guest');
    await act(async () => { auth.emit('SIGNED_IN', 'new-guest'); });
    await inAnotherAccount();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth');
  });

  it('control: with no one signed in now, "Sign in" is offered', async () => {
    openAt('/p/p1');
    await screen.findByTestId('poster-editor');
    await act(async () => { auth.emit('SIGNED_OUT', null); });
    await inAnotherAccount();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth');
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

describe('/p/new', () => {
  // Step 9 round 2 (NEW-2): once /p/new had opened the user's poster, the
  // address changing to /p/<id> loaded it again from the database and
  // replaced what was on screen, so text typed before the reload landed was
  // lost.
  it('the poster /p/new opened is not loaded a second time when the address catches up', async () => {
    const { loadPoster } = await import('@/data/posters');
    vi.mocked(loadPoster).mockClear();
    openAt('/p/new');
    await screen.findByTestId('poster-editor');
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(vi.mocked(loadPoster).mock.calls).toEqual([]);
    expect(screen.getByTestId('poster-editor')).toBeInTheDocument();
  });

  // Step 10 (R3-1): the router applies /p/new's change of address as a
  // transition, after an ordinary update. A sign-in to another account that
  // lands between the two re-ran the page while the address still said
  // /p/new, and the page made or opened the other account's poster in place
  // of the one on screen.
  // Step 9 round 2 (S9R2-6): a sign-in and a sign-back both landing before
  // the address catches up. The closed page must not stay up with the owner
  // signed in again.
  it('a sign-in and a sign-back both landing before the address catches up leave the owner in the editor', async () => {
    const { loadOrCreateMostRecentPoster } = await import('@/data/posters');
    vi.mocked(loadOrCreateMostRecentPoster).mockClear();
    let release!: () => void;
    db.gate = new Promise<void>((r) => { release = r; });
    openAt('/p/new');
    await waitFor(() => expect(loadOrCreateMostRecentPoster).toHaveBeenCalledTimes(1));
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
      // Each sign-in is rendered on its own, while the address change waits.
      flushSync(() => auth.emit('SIGNED_IN', 'other'));
      flushSync(() => auth.emit('SIGNED_IN', 'owner'));
    });
    expect(await screen.findByTestId('poster-editor')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This poster is in another account' })).toBeNull();
  });

  it('a sign-in to another account landing before the address catches up opens nothing for that account', async () => {
    const { loadOrCreateMostRecentPoster } = await import('@/data/posters');
    vi.mocked(loadOrCreateMostRecentPoster).mockClear();
    let release!: () => void;
    db.gate = new Promise<void>((r) => { release = r; });
    openAt('/p/new');
    await waitFor(() => expect(loadOrCreateMostRecentPoster).toHaveBeenCalledTimes(1));
    await act(async () => {
      // The poster lands: the page opens it and asks for /p/<id>. The
      // sign-in elsewhere arrives before that address is applied.
      release();
      await new Promise((r) => setTimeout(r, 0));
      auth.emit('SIGNED_IN', 'other');
    });
    await inAnotherAccount();
    expect(loadOrCreateMostRecentPoster).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('poster-editor')).toBeNull();
  });
});

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

