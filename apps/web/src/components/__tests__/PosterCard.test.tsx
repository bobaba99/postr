/**
 * Tests for PosterCard.
 *
 * The card is a thin presentational wrapper — it renders the poster
 * title + last-edited timestamp, shows duplicate/delete buttons on
 * hover, and fires the callbacks when those buttons are clicked.
 * The actual repository calls happen in the parent (Home).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PosterCard } from '../PosterCard';
import type { PosterRow } from '@/data/posters';

function makeRow(overrides: Partial<PosterRow> = {}): PosterRow {
  return {
    id: 'poster-1',
    user_id: 'user-1',
    title: 'Synaptic Pruning in Adolescence',
    width_in: 48,
    height_in: 36,
    data: {} as never,
    thumbnail_path: null,
    share_slug: null,
    is_public: false,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-07T12:00:00Z',
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof PosterCard>> = {}) {
  const row = makeRow();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  render(
    <MemoryRouter>
      <PosterCard row={row} onDuplicate={onDuplicate} onDelete={onDelete} {...props} />
    </MemoryRouter>,
  );
  return { row, onDuplicate, onDelete };
}

describe('PosterCard', () => {
  it('renders the title', () => {
    renderCard();
    expect(screen.getByText('Synaptic Pruning in Adolescence')).toBeInTheDocument();
  });

  it('renders "Untitled Poster" when the row has no title', () => {
    renderCard({ row: makeRow({ title: '' }) });
    expect(screen.getByText(/untitled poster/i)).toBeInTheDocument();
  });

  it('links to the editor for its row id', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /synaptic pruning/i });
    expect(link).toHaveAttribute('href', '/p/poster-1');
  });

  it('fires onDuplicate when the duplicate button is clicked', () => {
    const { onDuplicate, row } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledWith(row);
  });

  it('fires onDelete when the delete button is clicked', () => {
    const { onDelete, row } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(row);
  });
});
