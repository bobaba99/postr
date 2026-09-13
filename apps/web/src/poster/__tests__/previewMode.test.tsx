/**
 * Preview mode — Export tab → "👁 Preview poster".
 *
 * ── The bug this pins ────────────────────────────────────────────
 * The `if (previewMode)` branch used to sit high in `PosterEditor`,
 * just after the `sizeKey`/`cW`/`cH` derivations, while the JSX it
 * returns reads `sortedRefs`, `headingNumbers` and `printPoster` —
 * three `const`s declared several hundred lines FURTHER DOWN.
 *
 * `const` bindings are in the temporal dead zone until their
 * declaration executes, so returning from the early branch reached
 * them before initialisation and threw
 *
 *     ReferenceError: Cannot access 'sortedRefs' before initialization
 *
 * (minified in production to names like `Cannot access 'Jt' before
 * initialization`). It fired for any poster carrying at least one
 * block, i.e. every real poster — Preview was never usable.
 *
 * The same early return also broke the Rules of Hooks: 26 further
 * hooks are called between that old position and the main return, so
 * toggling `previewMode` changed the component's hook count.
 *
 * Both faults have ONE cause — the branch being too early — so both
 * are covered by asserting that preview renders at all, with real
 * content, and that the editor survives the round trip back.
 *
 * These tests deliberately go through the real `ExportTab` button
 * rather than poking state, so a future refactor that rewires the
 * button is covered too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
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

import { PosterEditor } from '../PosterEditor';
import { usePosterStore } from '@/stores/posterStore';

// jsdom ships neither; the canvas auto-fit observes its container and
// blocks measure themselves on mount. Both are pure measurement and
// jsdom reports every rect as 0×0 regardless, so no-op stubs are
// faithful — these tests assert what renders, not what it measures.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const TITLE = 'Effects of Sample Treatment on Model Outcomes';
const HEADING = 'Methods';

function makeDoc(): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [
      {
        id: 't1',
        type: 'title',
        x: 20,
        y: 20,
        w: 440,
        h: 70,
        content: TITLE,
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
      {
        id: 'h1',
        type: 'heading',
        x: 20,
        y: 110,
        w: 210,
        h: 30,
        content: HEADING,
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
      {
        id: 'b1',
        type: 'text',
        x: 20,
        y: 150,
        w: 210,
        h: 150,
        content: 'Placeholder body copy from Acme State University.',
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
      // A references block is what pulls `sortedRefs` into the preview
      // render path — the exact binding that used to throw.
      {
        id: 'r1',
        type: 'references',
        x: 250,
        y: 150,
        w: 210,
        h: 150,
        content: '',
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
    ],
    fontFamily: 'Source Sans 3',
    palette: {
      bg: '#ffffff',
      primary: '#1a1a26',
      accent: '#7c6aed',
      accent2: '#4a6cf7',
      muted: '#6b7280',
      headerBg: '#f3f4f6',
      headerFg: '#1a1a26',
    },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [{ id: 'a1', name: 'Jane Doe', institutionIds: [] }],
    references: [
      { id: 'ref1', authors: ['Smith, John'], year: '2020', title: 'Alpha study' },
    ],
  } as unknown as PosterDoc;
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/p/fixture']}>
      <PosterEditor />
    </MemoryRouter>,
  );
}

/** Click through the sidebar the way a user reaches Preview. */
async function openPreview() {
  // The tab rail is keyed by `data-postr-tab` rather than an
  // accessible name, so select it the way the sidebar's own tests do.
  const exportTab = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-postr-tab]'),
  ).find((b) => (b.textContent ?? '').trim().toLowerCase().startsWith('export'));
  if (!exportTab) throw new Error('Export tab not found in the sidebar rail');
  await act(async () => {
    fireEvent.click(exportTab);
  });
  await click(/preview poster/i);
}

/** fireEvent.click wrapped in act, so effects flush before we assert. */
async function click(name: RegExp) {
  const btn = screen.getByRole('button', { name });
  await act(async () => {
    fireEvent.click(btn);
  });
}

describe('preview mode', () => {
  beforeEach(() => {
    // Re-applied per test: one case below stubs `window.open` and calls
    // `vi.unstubAllGlobals()`, which would otherwise strip this too and
    // leave every later test throwing "ResizeObserver is not defined".
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
    usePosterStore.getState().setPoster('fixture-1', makeDoc(), 'Sample Poster');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders instead of throwing a TDZ ReferenceError', async () => {
    renderEditor();

    // Before the fix this threw
    // "Cannot access 'sortedRefs' before initialization" and the tree
    // unmounted, so the assertion is simply that we get here with the
    // preview's own controls on screen.
    await openPreview();

    expect(screen.getByRole('button', { name: /back to editor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save pdf/i })).toBeInTheDocument();
  });

  it('renders the poster content, not an empty shell', async () => {
    renderEditor();
    await openPreview();

    // `headingNumbers` and `sortedRefs` both feed BlockFrame here. If
    // either were still in the TDZ we would not reach this point; if
    // they were silently undefined the blocks would render empty.
    expect(screen.getAllByText(new RegExp(TITLE, 'i')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(HEADING, 'i')).length).toBeGreaterThan(0);
  });

  it('hides the editor chrome without unmounting it', async () => {
    renderEditor();
    expect(screen.getByText(/poster guidelines/i)).toBeVisible();

    await openPreview();
    // Chromeless full-screen poster — that is the feature. But the editor
    // must still be IN the document: `printPoster` clones `#poster-canvas`
    // from it, and four subscriptions hold its nodes. Hidden, not gone.
    expect(screen.getByText(/poster guidelines/i)).not.toBeVisible();
    expect(document.getElementById('poster-canvas')).not.toBeNull();
  });

  it('keeps the live canvas mounted so print clones resolved images', async () => {
    renderEditor();
    const canvasBefore = document.getElementById('poster-canvas');
    expect(canvasBefore).not.toBeNull();

    await openPreview();
    // Node IDENTITY, not just presence. A remount would reset
    // `useStorageUrl` to null and re-resolve signed URLs asynchronously,
    // so a synchronous `printPoster` clone would capture 1x1 placeholder
    // GIFs instead of every uploaded figure and logo.
    expect(document.getElementById('poster-canvas')).toBe(canvasBefore);

    await click(/back to editor/i);
    expect(document.getElementById('poster-canvas')).toBe(canvasBefore);
  });

  it('takes the hidden editor out of the a11y tree and tab order', async () => {
    renderEditor();
    await openPreview();
    const overlay = document.querySelector('[data-postr-preview]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute('aria-modal', 'true');
    // `inert` is what stops a keyboard user tabbing into the hidden editor.
    expect(document.querySelector('[data-comment-mode], [inert]')).not.toBeNull();
  });

  it('ignores editor keyboard shortcuts while previewing', async () => {
    renderEditor();
    const before = usePosterStore.getState().doc?.blocks.length ?? 0;
    expect(before).toBeGreaterThan(0);

    // Select a block FIRST — otherwise this test is vacuous: the editor's
    // delete handler bails on an empty selection, so it would pass with or
    // without the previewMode guard.
    const block = document.querySelector('[data-block-id="b1"]') as HTMLElement;
    expect(block).not.toBeNull();
    await act(async () => {
      fireEvent.click(block);
    });
    expect(document.querySelector('[data-postr-selected="true"]')).not.toBeNull();

    await openPreview();
    // Backspace is the natural "go back" key on a chromeless full-screen
    // view. The editor's delete handler is still bound to `window`, and
    // preview renders every block with `selected={false}` — so an
    // unguarded Backspace would delete a block the user cannot see is
    // selected, and the confirming toast would render behind the overlay.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Backspace' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
    });

    expect(usePosterStore.getState().doc?.blocks.length).toBe(before);
  });

  it('exits on Escape', async () => {
    renderEditor();
    await openPreview();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('button', { name: /back to editor/i })).not.toBeInTheDocument();
    expect(screen.getByText(/poster guidelines/i)).toBeVisible();
  });

  it('actually prints from preview instead of no-opping', async () => {
    // `printPoster` reads `#poster-canvas` and silently returns when it
    // is missing. Preview unmounts that node, and `setPreviewMode(false)`
    // is async — so before the `flushSync` fix this button did nothing
    // at all. Assert the print window is genuinely opened and written to.
    const write = vi.fn();
    const openSpy = vi.fn(() => ({
      document: { open: vi.fn(), write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    })) as unknown as typeof window.open;
    vi.stubGlobal('open', openSpy);

    renderEditor();
    await openPreview();

    await click(/print \/ save pdf/i);

    expect(openSpy).toHaveBeenCalled();
    // And the document it wrote is the real poster, not an empty shell.
    expect(write).toHaveBeenCalled();
    expect(String(write.mock.calls[0]?.[0] ?? '')).toContain(TITLE);

  });

  it('returns to the editor without unmounting the app', async () => {
    renderEditor();
    await openPreview();

    await click(/back to editor/i);

    // A hooks-order violation on the way in OR out would blow up here
    // rather than restoring the editor.
    expect(screen.getByText(/poster guidelines/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /back to editor/i })).not.toBeInTheDocument();
  });
});
