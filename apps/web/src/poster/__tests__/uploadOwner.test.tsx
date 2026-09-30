/**
 * Fix 23, step 9 round 2 (S9R2-2): an image put into the open poster goes
 * into its owner's storage folder, never into the folder of whoever the
 * session says is signed in at that moment. A sign-in to another account in
 * another tab replaces the session before this tab hears of it (G1, the
 * image migration, was the first place found); the image block and Import
 * (replacing the open poster) read the user from the session too, and put
 * the owner's image in the other account's folder.
 * Engineering record: docs/fixes/23-new-poster-owner-only.md.
 *
 * The session here already belongs to another account; the poster was
 * opened for its owner (the store carries the owner the editor opened it
 * for; EditorOwnership.test.tsx shows the editor records it). The browser
 * run is the fix's account-change scenarios.
 *
 * Re-run: npx vitest run src/poster/__tests__/uploadOwner.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';

const signedInNow = vi.hoisted(() => ({ id: 'someone-else' }));
const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: signedInNow.id } }, error: null })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: signedInNow.id } } }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
const uploads = vi.hoisted(() => ({ image: vi.fn(async (..._args: unknown[]) => null), postr: vi.fn() }));
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  uploadPosterImage: uploads.image,
}));
vi.mock('@/import/postrFile', async (orig) => ({
  ...(await orig<typeof import('@/import/postrFile')>()),
  importPostr: uploads.postr,
}));

import { NoopResizeObserver, makeDoc, renderEditor } from './editorKit';
import { usePosterStore } from '@/stores/posterStore';
import { ImportPosterModal } from '@/components/ImportPosterModal';

const withImage = (): PosterDoc => {
  const d = makeDoc(30, 40);
  return {
    ...d,
    blocks: [...d.blocks, { ...d.blocks[2]!, id: 'img', type: 'image', x: 20, y: 250, w: 100, h: 80, content: '', imageSrc: null }],
  } as PosterDoc;
};

/** The poster as the editor opens it: for its owner. */
const openForOwner = (doc: PosterDoc) =>
  usePosterStore.getState().setPoster('p-owned', doc, 'Lab meeting draft v3', { seedAcknowledgement: true, ownerId: 'owner' });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
  uploads.image.mockClear();
  uploads.postr.mockReset();
  uploads.postr.mockRejectedValue(new Error('stop after the call'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('an image put into the open poster goes into its owner\'s folder', () => {
  it('an image picked for an image block, with another account\'s session in place', async () => {
    openForOwner(withImage());
    renderEditor();
    // The editor has settled: whatever it looks up about the user is in.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const input = document.querySelector<HTMLInputElement>('[data-block-id="img"] input[type="file"]');
    expect(input, 'the image block\'s file picker').not.toBeNull();
    fireEvent.change(input!, { target: { files: [new File(['png'], 'figure.png', { type: 'image/png' })] } });
    await waitFor(() => expect(uploads.image).toHaveBeenCalled());
    expect(uploads.image.mock.calls.map((c) => c[0])).toEqual(['owner']);
  });

  it('a .postr imported over the open poster', async () => {
    openForOwner(makeDoc(30, 40));
    render(
      <MemoryRouter>
        <ImportPosterModal open mode="replace" targetPosterId="p-owned" onClose={() => {}} />
      </MemoryRouter>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input!, { target: { files: [new File(['zip'], 'poster.postr')] } });
    await waitFor(() => expect(uploads.postr).toHaveBeenCalled());
    expect(uploads.postr.mock.calls[0]!.slice(1)).toEqual(['p-owned', 'owner']);
  });

  it('control: a new poster imported from the dashboard goes into the signed-in user\'s folder', async () => {
    usePosterStore.setState({ posterId: null, doc: null });
    const created = await import('@/data/posters');
    vi.spyOn(created, 'createPoster').mockResolvedValue({ id: 'p-new' } as Awaited<ReturnType<typeof created.createPoster>>);
    render(
      <MemoryRouter>
        <ImportPosterModal open mode="new" onClose={() => {}} />
      </MemoryRouter>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input!, { target: { files: [new File(['zip'], 'poster.postr')] } });
    await waitFor(() => expect(uploads.postr).toHaveBeenCalled());
    expect(uploads.postr.mock.calls[0]![2]).toBe('someone-else');
  });
});

describe('the poster store keeps the owner with the poster', () => {
  it('a version of the same poster restored keeps its owner; another poster loaded does not', () => {
    openForOwner(makeDoc(30, 40));
    const store = usePosterStore.getState;
    store().setPoster('p-owned', makeDoc(30, 40), 'Restored');
    expect(store().posterOwnerId).toBe('owner');
    store().setPoster('p-other', makeDoc(30, 40), 'Someone else\'s');
    expect(store().posterOwnerId).toBeNull();
  });
});
