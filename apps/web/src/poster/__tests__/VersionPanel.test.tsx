/**
 * Tests for VersionPanel.
 *
 * The panel reads the version list and deletes directly; save + restore
 * go through injected callbacks (owned by PosterEditor). The data layer
 * is mocked so these are pure interaction tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PosterVersionSummary } from '@/data/posterVersions';

const { listVersionsMock, deleteVersionMock } = vi.hoisted(() => ({
  listVersionsMock: vi.fn(),
  deleteVersionMock: vi.fn(),
}));

vi.mock('@/data/posterVersions', () => ({
  listVersions: listVersionsMock,
  deleteVersion: deleteVersionMock,
  MAX_VERSIONS_PER_POSTER: 20,
  VERSION_WARNING_THRESHOLD: 15,
}));

import { VersionPanel } from '../VersionPanel';

function makeVersion(overrides: Partial<PosterVersionSummary> = {}): PosterVersionSummary {
  return {
    id: 'v1',
    poster_id: 'p1',
    user_id: 'u1',
    name: '',
    created_at: '2026-07-02T17:30:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  listVersionsMock.mockReset();
  deleteVersionMock.mockReset();
  listVersionsMock.mockResolvedValue([]);
  deleteVersionMock.mockResolvedValue(undefined);
});

it('shows an empty state and does not query when there is no poster', () => {
  render(<VersionPanel posterId={null} onSaveVersion={vi.fn()} onRestoreVersion={vi.fn()} />);
  expect(screen.getByText(/Save your poster first/i)).toBeInTheDocument();
  expect(listVersionsMock).not.toHaveBeenCalled();
});

it('lists versions newest-first with a count and named/unnamed labels', async () => {
  listVersionsMock.mockResolvedValue([
    makeVersion({ id: 'v2', name: 'Before advisor review', created_at: '2026-07-02T18:00:00Z' }),
    makeVersion({ id: 'v1', name: '', created_at: '2026-07-02T17:30:00Z' }),
  ]);
  render(<VersionPanel posterId="p1" onSaveVersion={vi.fn()} onRestoreVersion={vi.fn()} />);

  await waitFor(() => expect(screen.getByText(/Versions \(2\)/)).toBeInTheDocument());
  expect(screen.getByText('Before advisor review')).toBeInTheDocument();
  // Unnamed version falls back to its formatted timestamp label; the
  // named version also shows a timestamp sub-label — so both rows carry
  // a "Jul 2" string.
  expect(screen.getAllByText(/Jul 2/).length).toBeGreaterThanOrEqual(2);
});

it('saves with the typed name and clears the input', async () => {
  const onSaveVersion = vi.fn().mockResolvedValue(undefined);
  render(<VersionPanel posterId="p1" onSaveVersion={onSaveVersion} onRestoreVersion={vi.fn()} />);

  const input = await screen.findByPlaceholderText(/Optional name/i);
  fireEvent.change(input, { target: { value: 'Milestone' } });
  fireEvent.click(screen.getByRole('button', { name: /save version/i }));

  await waitFor(() => expect(onSaveVersion).toHaveBeenCalledWith('Milestone'));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
});

it('disables saving at the version cap', async () => {
  listVersionsMock.mockResolvedValue(
    Array.from({ length: 20 }, (_, i) => makeVersion({ id: `v${i}` })),
  );
  render(<VersionPanel posterId="p1" onSaveVersion={vi.fn()} onRestoreVersion={vi.fn()} />);

  await waitFor(() => expect(screen.getByText(/20-version limit/i)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /save version/i })).toBeDisabled();
});

it('restores only after the confirmation modal is accepted', async () => {
  const onRestoreVersion = vi.fn().mockResolvedValue(undefined);
  listVersionsMock.mockResolvedValue([makeVersion({ id: 'v9', name: 'Snapshot' })]);
  render(<VersionPanel posterId="p1" onSaveVersion={vi.fn()} onRestoreVersion={onRestoreVersion} />);

  fireEvent.click(await screen.findByRole('button', { name: /restore/i }));
  // Modal open, nothing restored yet.
  expect(onRestoreVersion).not.toHaveBeenCalled();
  // The modal's confirm button is the second "Restore" control.
  const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
  fireEvent.click(restoreButtons[restoreButtons.length - 1]!);

  await waitFor(() => expect(onRestoreVersion).toHaveBeenCalledWith('v9'));
});

it('deletes only after confirmation and refetches on the change event', async () => {
  listVersionsMock.mockResolvedValue([makeVersion({ id: 'v9', name: 'Snapshot' })]);
  render(<VersionPanel posterId="p1" onSaveVersion={vi.fn()} onRestoreVersion={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: /delete version/i }));
  expect(deleteVersionMock).not.toHaveBeenCalled();

  const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
  fireEvent.click(deleteButtons[deleteButtons.length - 1]!);

  await waitFor(() => expect(deleteVersionMock).toHaveBeenCalledWith('v9'));
  // Delete broadcasts postr:versions-changed → panel refetches (initial + post-delete).
  await waitFor(() => expect(listVersionsMock.mock.calls.length).toBeGreaterThanOrEqual(2));
});
