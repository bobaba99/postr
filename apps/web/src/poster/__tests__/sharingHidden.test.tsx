/**
 * Fix 23 — sharing and comments are hidden (owner decision 2026-09-30:
 * "it should just be editor, no sharing or comments yet").
 * Engineering record: docs/fixes/23-new-poster-owner-only.md.
 *
 * The editor offers no way into comments, and so no "Copy share link" (the
 * only control that made a poster public): not the sidebar's comments tab,
 * and not the text toolbar's "Comment on selection" button, whose request
 * opened the hidden panel (fix 23's step 9 review, CR-b-1, MEASURED 5 of 5
 * in the browser). The share page's route is pinned in
 * src/__tests__/routes.test.tsx; the browser check is claim S2 of
 * scripts/new-poster-owner-check.mjs.
 *
 * Re-run: npx vitest run src/poster/__tests__/sharingHidden.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
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

import { NoopResizeObserver, load, makeDoc, nextTask, renderEditor } from './editorKit';
import { FormatToolbarButtons } from '../FloatingFormatToolbar';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sharing and comments are hidden in the editor', () => {
  it('the sidebar offers no comments tab', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await nextTask();
    const tabs = [...document.querySelectorAll('[data-postr-tab]')].map((t) => t.textContent?.trim().toLowerCase());
    expect(tabs.length, 'precondition: the sidebar tabs are drawn').toBeGreaterThan(3);
    expect(tabs.filter((t) => t?.startsWith('comments'))).toEqual([]);
  });

  it('no sidebar tab offers to copy a share link', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await nextTask();
    const tabs = [...document.querySelectorAll<HTMLElement>('[data-postr-tab]')];
    expect(tabs.length, 'precondition: the sidebar tabs are drawn').toBeGreaterThan(3);
    for (const tab of tabs) {
      await act(async () => { tab.click(); });
      expect(screen.queryByText(/copy share link/i), `the ${tab.textContent?.trim()} tab`).toBeNull();
    }
  });
});

describe('no way into comments from the text toolbar', () => {
  it('the format toolbar offers no "Comment on selection"', () => {
    render(<FormatToolbarButtons onChange={() => {}} />);
    expect(screen.getAllByRole('button').length, 'precondition: the toolbar is drawn').toBeGreaterThan(3);
    expect(screen.queryByTitle('Comment on selection')).toBeNull();
  });

  it('a request to comment on a selection opens no comments panel', async () => {
    const d = makeDoc(48, 36);
    load(d);
    renderEditor();
    await nextTask();
    const blockId = d.blocks.find((b) => b.type === 'text')?.id ?? 'b1';
    // What the toolbar's button sends for a selection in a text block.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('postr:comment-text', {
        detail: { blockId, start: 0, end: 4, quote: 'Test' },
      }));
    });
    await nextTask();
    expect(screen.queryByText(/copy share link/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /post comment/i })).toBeNull();
    expect(document.querySelector('[data-comment-mode="true"]'), 'the canvas stays editable').toBeNull();
  });

  it('a request to comment on an area opens no comments panel', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await nextTask();
    // What the canvas's area drag sends on mouseup (inches).
    await act(async () => {
      window.dispatchEvent(new CustomEvent('postr:comment-area', { detail: { rect: [2, 2, 10, 6] } }));
    });
    await nextTask();
    expect(screen.queryByText(/copy share link/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /post comment/i })).toBeNull();
    expect(document.querySelector('[data-comment-mode="true"]'), 'the canvas stays editable').toBeNull();
  });
});
