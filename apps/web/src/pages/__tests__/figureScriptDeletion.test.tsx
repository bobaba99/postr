/**
 * Plan item 7 — a poster's kept plot script goes with the poster, entered
 * where the user deletes one: the dashboard card's Delete and its
 * confirmation. Engineering record: docs/fixes/07-figure-script-kept.md
 * (review round 1: R1-05, R1-06). The account's scripts going with the
 * account are checked at the Danger Zone (Profile.dangerZone.test.tsx).
 *
 * The scripts are put in storage by the checker's own writer
 * (poster/figureScriptDraft.ts), as the editor leaves them; the test then
 * enters at the clicks. Supabase is faked at its client: the posters
 * table's delete answers either ok or with an error, and the dashboard
 * rolls the card back on an error.
 *
 * Re-run: npx vitest run src/pages/__tests__/figureScriptDeletion.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterListRow } from '@/data/posters';
import { posterScriptSlot, writeScriptDraft } from '@/poster/figureScriptDraft';

const db = vi.hoisted(() => ({
  deleteError: null as { message: string } | null,
  /** Every delete the posters table was asked for, and whether it went through. */
  deletes: [] as Array<{ id: string; ok: boolean }>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => ({
      delete: () => ({
        eq: async (_column: string, id: string) => {
          db.deletes.push({ id, ok: db.deleteError === null });
          return { error: db.deleteError };
        },
      }),
    }),
  },
}));
const row = (id: string, title: string): PosterListRow => ({
  id,
  user_id: 'u1',
  title,
  width_in: 48,
  height_in: 36,
  thumbnail_path: null,
  share_slug: null,
  is_public: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  listPosters: vi.fn(async () => [row('poster-a', 'Poster A'), row('poster-b', 'Poster B')]),
}));
vi.mock('@/data/gallery', () => ({ checkIsGalleryAdmin: vi.fn(async () => false) }));
vi.mock('@/data/thumbnails', () => ({ getThumbnailUrl: vi.fn(async () => null) }));
vi.mock('@/components/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/seo/useDocumentMeta', () => ({ useDocumentMeta: () => {} }));

import Home from '../Home';

const MARK = 'ZQ7MARK';
const storedScript = (id: string) => localStorage.getItem(`postr.figure-script.${id}`);

/** A script left in each poster's checker, as the editor writes it. */
function keepScripts() {
  for (const id of ['poster-a', 'poster-b']) {
    writeScriptDraft(posterScriptSlot(id), {
      code: `# ${MARK} ${id}\nimport matplotlib.pyplot as plt`,
      lang: 'python',
      checked: null,
    });
  }
  expect(storedScript('poster-a')).toContain(MARK);
  expect(storedScript('poster-b')).toContain(MARK);
}

/** The card's Delete, then Delete in the confirmation. */
async function deleteFromDashboard(title: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Delete ${title}` }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
}

beforeEach(() => {
  localStorage.clear();
  db.deleteError = null;
  db.deletes = [];
});

describe('item 7 — a deleted poster\'s kept script goes with it', () => {
  it('the dashboard\'s Delete removes the poster\'s script and leaves the other poster\'s', async () => {
    keepScripts();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await deleteFromDashboard('Poster A');
    await waitFor(() => expect(db.deletes).toEqual([{ id: 'poster-a', ok: true }]));
    await waitFor(() => expect(storedScript('poster-a')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Delete Poster A' })).toBeNull();
    expect(storedScript('poster-b')).toContain(MARK);
  });

  it('a delete that fails brings the card back and keeps its script', async () => {
    db.deleteError = { message: 'network down' };
    keepScripts();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await deleteFromDashboard('Poster A');
    await waitFor(() => expect(db.deletes).toEqual([{ id: 'poster-a', ok: false }]));
    // The dashboard rolls the card back once the delete has failed.
    expect(await screen.findByRole('button', { name: 'Delete Poster A' })).toBeInTheDocument();
    expect(storedScript('poster-a')).toContain(MARK);
    expect(storedScript('poster-b')).toContain(MARK);
  });
});
