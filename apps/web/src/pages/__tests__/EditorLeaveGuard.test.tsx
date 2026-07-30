/**
 * Leave gate mount.
 *
 * EditorWithGuards renders the SecureWorkModal (reason "leave") exactly
 * when useLeaveGuard reports `leaveModalOpen`. The guard itself decides
 * WHEN to open (guest + edited-this-session); this test pins only the
 * wiring — modal present when open, absent when not — so the leave prompt
 * can never appear for a user the guard hasn't armed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Heavy editor tree — stub it. The guard mount is what we're testing.
vi.mock('@/poster/PosterEditor', () => ({
  PosterEditor: () => <div data-testid="poster-editor" />,
}));

// Two-tab guard is orthogonal — keep it quiet (no collision).
vi.mock('@/hooks/useTwoTabGuard', () => ({
  useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }),
}));

// The leave guard is swapped per-test via this mutable holder.
const guard = {
  value: {
    armed: false,
    leaveModalOpen: false,
    requestLeave: vi.fn(() => false),
    confirmLeave: vi.fn(),
    cancelLeave: vi.fn(),
  },
};
vi.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => guard.value,
}));

import { EditorWithGuards } from '../Editor';

describe('EditorWithGuards — leave gate', () => {
  beforeEach(() => {
    guard.value = {
      armed: false,
      leaveModalOpen: false,
      requestLeave: vi.fn(() => false),
      confirmLeave: vi.fn(),
      cancelLeave: vi.fn(),
    };
  });

  it('renders the leave modal when the guard reports leaveModalOpen', () => {
    guard.value = { ...guard.value, armed: true, leaveModalOpen: true };
    render(<EditorWithGuards posterId="p1" />);
    expect(
      screen.getByRole('dialog', { name: /keep this poster/i }),
    ).toBeInTheDocument();
  });

  it('does not render the leave modal when the guard is closed', () => {
    render(<EditorWithGuards posterId="p1" />);
    expect(
      screen.queryByRole('dialog', { name: /keep this poster/i }),
    ).toBeNull();
    // The editor itself still mounts either way.
    expect(screen.getByTestId('poster-editor')).toBeInTheDocument();
  });
});
