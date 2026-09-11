/**
 * `FullCodeModal` — the "Full edited code" overlay. It is mounted on a
 * public, no-auth page (/tools/figure-readability) so it must be a real
 * modal dialog: named, focus-managed, Tab-trapped, and scroll-locked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { FullCodeModal } from '../FullCodeModal';

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <a href="/elsewhere">outside link</a>
      <FullCodeModal
        open={open}
        code={'line one\nline two'}
        onClose={() => setOpen(false)}
        onCopied={() => {}}
        layout="page"
      />
    </>
  );
}

describe('FullCodeModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('is an accessible modal dialog named by its heading', () => {
    render(<Harness initiallyOpen />);
    const dialog = screen.getByRole('dialog', { name: /full edited code/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus to the close control on open and returns it to the opener on close', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    fireEvent.click(opener);

    const close = screen.getByRole('button', { name: /close/i });
    expect(document.activeElement).toBe(close);

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog in both directions', () => {
    render(<Harness initiallyOpen />);
    const close = screen.getByRole('button', { name: /close/i });
    const copy = screen.getByRole('button', { name: /copy full code/i });

    copy.focus();
    fireEvent.keyDown(copy, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(copy);
  });

  it('locks body scroll while open and restores it on close', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(<Harness initiallyOpen />);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    rerender(<Harness initiallyOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('renders the code at the page code-view size in page layout', () => {
    render(<Harness initiallyOpen />);
    const pre = screen.getByRole('dialog').querySelector('pre') as HTMLElement;
    expect(getComputedStyle(pre).fontSize).toBe('16px');
  });
});
