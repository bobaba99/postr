import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const convert = vi.hoisted(() => ({
  google: vi.fn(),
  email: vi.fn(),
}));
vi.mock('@/lib/convertGuest', () => ({
  convertGuestWithGoogle: convert.google,
  convertGuestWithEmail: convert.email,
}));

import { SecureWorkModal } from '../SecureWorkModal';

describe('SecureWorkModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an export-flavoured headline for reason="export"', () => {
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    expect(screen.getByText(/export/i)).toBeInTheDocument();
  });

  it('shows a leave-flavoured headline for reason="leave"', () => {
    render(<SecureWorkModal reason="leave" onClose={() => {}} />);
    expect(screen.getByText(/keep|save|come back/i)).toBeInTheDocument();
  });

  it('converts with Google when the Google button is clicked', () => {
    convert.google.mockResolvedValue({ error: null });
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(convert.google).toHaveBeenCalledTimes(1);
  });

  it('shows a check-your-email state when email conversion is pending confirmation', async () => {
    convert.email.mockResolvedValue({ pendingConfirmation: true, error: null });
    render(<SecureWorkModal reason="leave" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByRole('button', { name: /create account|continue with email|sign up/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });

  it('shows a generic error (not raw text) when conversion fails', async () => {
    convert.google.mockResolvedValue({ error: new Error('supabase raw internals') });
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.queryByText(/raw internals/)).toBeNull();
  });

  it('dismisses via the close / not-now control', () => {
    const onClose = vi.fn();
    render(<SecureWorkModal reason="leave" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /not now|leave anyway|close|×/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
