/**
 * UIMax a11y — keyboard activation for formerly click-only surfaces,
 * and accessible names on poster inputs.
 *
 * Keyboard users could not:
 *   - open the logo picker / image upload from an empty block (the
 *     placeholder tiles were <div onClick>), or
 *   - select a table row/column for deletion (the selector strips
 *     had role="button" but no tabIndex or key handler), or
 *   - promote a comment thread to the persistent "focus" highlight
 *     (the ThreadCard only broadcast on mouse click).
 *
 * These tests pin the fixes: real <button> tiles, Enter/Space parity
 * on the strips + card, and aria-labels on inputs whose purpose was
 * previously conveyed only by nearby visual copy.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Block } from '@postr/shared';
import type { Comment } from '@/data/comments';
import { DEFAULT_PALETTE, DEFAULT_STYLES } from '../constants';
import { DEFAULT_TABLE_DATA } from '../tableOps';
import { ImageBlock, LogoBlock, TableBlock } from '../blocks';
import { CommentsPanel } from '../CommentsPanel';
import { LayoutTab } from '../Sidebar';
import { GuidelinesPanel } from '../GuidelinesPanel';

const { useCommentsMock } = vi.hoisted(() => ({ useCommentsMock: vi.fn() }));

vi.mock('@/hooks/useComments', () => ({
  useComments: () => useCommentsMock(),
  readGuestName: () => 'Tester',
  writeGuestName: vi.fn(),
}));

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    type: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    content: '',
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
    ...overrides,
  };
}

describe('empty-block placeholder tiles', () => {
  it('renders the empty logo tile as a real button that opens the picker', () => {
    render(<LogoBlock block={makeBlock({ type: 'logo' })} onUpdate={vi.fn()} />);

    const tile = screen.getByRole('button', { name: /logo/i });
    fireEvent.click(tile);

    // LogoPicker mounts its dialog (portal to document.body) on open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the empty image tile as a real button proxying the hidden file input', () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(
      <ImageBlock
        block={makeBlock({ type: 'image' })}
        palette={DEFAULT_PALETTE}
        onUpdate={vi.fn()}
      />,
    );

    const tile = screen.getByRole('button', { name: /upload figure/i });
    fireEvent.click(tile);

    expect(inputClick).toHaveBeenCalled();
    inputClick.mockRestore();
  });
});

describe('table row/column selector strips', () => {
  function renderTable(onUpdate = vi.fn()) {
    const utils = render(
      <TableBlock
        block={makeBlock({ type: 'table', tableData: DEFAULT_TABLE_DATA })}
        palette={DEFAULT_PALETTE}
        fontFamily="Inter"
        styles={DEFAULT_STYLES}
        onUpdate={onUpdate}
        selected
      />,
    );
    return { onUpdate, ...utils };
  }

  it('toggles row selection on Enter and Space', () => {
    renderTable();
    const strip = screen.getByRole('button', { name: 'Select row 2' });
    expect(strip).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(strip, { key: 'Enter' });
    expect(strip.style.background).not.toBe('transparent');

    fireEvent.keyDown(strip, { key: ' ' });
    expect(strip.style.background).toBe('transparent');
  });

  it('toggles column selection on Enter and Space', () => {
    renderTable();
    const strip = screen.getByRole('button', { name: 'Select column 1' });
    expect(strip).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(strip, { key: 'Enter' });
    expect(strip.style.background).not.toBe('transparent');

    fireEvent.keyDown(strip, { key: ' ' });
    expect(strip.style.background).toBe('transparent');
  });

  it('deletes the keyboard-selected row via the existing Delete listener', () => {
    const { onUpdate } = renderTable();
    const strip = screen.getByRole('button', { name: 'Select row 2' });

    fireEvent.keyDown(strip, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tableData: expect.objectContaining({ rows: DEFAULT_TABLE_DATA.rows - 1 }),
      }),
    );
  });
});

describe('comment thread card', () => {
  const thread: Comment = {
    id: 'c1',
    posterId: 'p1',
    userId: 'u1',
    authorName: 'Ada',
    parentId: null,
    anchor: { type: 'doc' },
    body: 'Move the methods figure left.',
    resolvedAt: null,
    createdAt: '2026-07-29T10:00:00Z',
    updatedAt: '2026-07-29T10:00:00Z',
  };

  beforeEach(() => {
    useCommentsMock.mockReturnValue({
      comments: [thread],
      loading: false,
      error: null,
      refetch: vi.fn(),
      addComment: vi.fn(),
      editComment: vi.fn(),
      editAnchor: vi.fn(),
      resolveComment: vi.fn(),
      removeComment: vi.fn(),
    });
  });

  function renderPanel() {
    return render(
      <CommentsPanel
        posterId="p1"
        pendingAnchor={null}
        onClearPendingAnchor={vi.fn()}
        isOwner
        currentUserId="u1"
      />,
    );
  }

  it('broadcasts the focus highlight on Enter/Space, mirroring the card click', () => {
    renderPanel();
    const card = screen.getByRole('button', {
      name: /highlight where this thread is pinned/i,
    });
    expect(card).toHaveAttribute('tabindex', '0');

    const focusSpy = vi.fn();
    window.addEventListener('postr:comment-focus', focusSpy);

    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(focusSpy).toHaveBeenCalledTimes(2);

    window.removeEventListener('postr:comment-focus', focusSpy);
  });

  it('ignores keys aimed at the inner reply input', () => {
    renderPanel();
    const reply = screen.getByRole('textbox', { name: 'Write a reply' });

    const focusSpy = vi.fn();
    window.addEventListener('postr:comment-focus', focusSpy);

    fireEvent.keyDown(reply, { key: 'Enter' });
    expect(focusSpy).not.toHaveBeenCalled();

    window.removeEventListener('postr:comment-focus', focusSpy);
  });
});

describe('input accessible names', () => {
  it('labels the Layout tab poster name + dimension inputs', () => {
    // MemoryRouter: the tab embeds ImportSection, whose import modal
    // calls useNavigate (same convention as ReviewTab.test.tsx).
    render(
      <MemoryRouter>
        <LayoutTab
          posterTitle="Smith Lab — APA 2026"
          onChangePosterTitle={vi.fn()}
          posterSizeKey="48×36"
          posterWidthIn={48}
          posterHeightIn={36}
          onChangePosterSize={vi.fn()}
          onChangeCustomSize={vi.fn()}
          showGrid={false}
          onToggleGrid={vi.fn()}
          showRuler={false}
          onToggleRuler={vi.fn()}
          onApplyTemplate={vi.fn()}
          onAutoLayout={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'Poster name' })).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Poster width in inches' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Poster height in inches' }),
    ).toBeInTheDocument();
  });

  it('labels the guidelines scratch-checklist item input', () => {
    localStorage.setItem(
      'postr.scratch-pad',
      JSON.stringify([{ id: 's1', text: 'Check margins', done: false }]),
    );
    render(<GuidelinesPanel open onToggle={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Checklist item' })).toBeInTheDocument();
    localStorage.removeItem('postr.scratch-pad');
  });
});
