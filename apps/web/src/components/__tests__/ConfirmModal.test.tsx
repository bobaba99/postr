/**
 * ConfirmModal — keyboard focus and modality.
 *
 * Found by the review of fix 02 (docs/fixes/02-poster-size.md), which put this
 * dialog in front of the poster-size and template changes:
 *   - opened from closed, focus never reached the dialog: the focus effect ran
 *     while the component still rendered nothing;
 *   - every parent re-render (a new inline onCancel) re-ran that effect and
 *     moved focus onto the confirm button, so Enter or Space applied a change
 *     the user had not chosen;
 *   - Tab left an aria-modal dialog, and focus was lost when it closed;
 *   - the title went blank while it faded out.
 *
 * Re-run: npx vitest run src/components/__tests__/ConfirmModal.test.tsx
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmModal } from '../ConfirmModal';

function modal(open: boolean, title = 'Change poster to 36 × 48 in?', onCancel = () => {}) {
  return (
    <>
      <button type="button">outside</button>
      <ConfirmModal
        open={open}
        title={title}
        message="Your blocks will move onto the new sheet. You can undo this."
        confirmLabel="Change size"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    </>
  );
}

const active = () => (document.activeElement as HTMLElement | null)?.textContent ?? document.activeElement?.tagName;

describe('ConfirmModal focus', () => {
  it('opened from closed, focus moves to the confirm button', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    expect(active()).toBe('Change size');
  });

  it('a parent re-render does not move focus', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    screen.getByRole('button', { name: 'Cancel' }).focus();
    // The editor passes a new inline onCancel on every render.
    rerender(modal(true, 'Change poster to 36 × 48 in?', () => {}));
    expect(active()).toBe('Cancel');
  });

  it('Tab stays inside the dialog', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    const confirm = screen.getByRole('button', { name: 'Change size' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(active(), 'Tab from the last button').toBe('Cancel');
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(active(), 'Shift+Tab from the first button').toBe('Change size');
  });

  it('closing puts focus back where it was before opening', () => {
    const { rerender } = render(modal(false));
    screen.getByRole('button', { name: 'outside' }).focus();
    rerender(modal(true));
    expect(active()).toBe('Change size');
    rerender(modal(false));
    expect(active()).toBe('outside');
  });

  it('keeps its title while it fades out', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender } = render(modal(false));
    rerender(modal(true, 'Change poster to 36 × 48 in?'));
    // The editor clears what it was asking about as soon as the dialog closes.
    rerender(modal(false, ''));
    expect(screen.queryByText('Change poster to 36 × 48 in?'), 'during the exit animation').not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
  });
});

/**
 * The re-check of the fixes above (docs/fixes/02-poster-size.md, section 9,
 * "Re-check of these changes") measured, in real Chromium:
 *   BK-1  a delete dialog opened with focus on Delete, so Enter, Enter (or a
 *         held Enter) deleted permanently; main deleted nothing;
 *   BK-4  a held Enter confirmed the size and template dialogs;
 *   BK-2  after a click on the dialog's own text, Shift+Tab left the dialog;
 *   BK-3  key listeners behind the dialog (a table's range delete, crop mode)
 *         still acted on keys;
 *   BK-5  with two dialogs open, one Escape closed both;
 *   BK-6  the typed-confirmation dialog did not give focus back, and its
 *         button changed label while it faded out.
 * jsdom does not activate a button on Enter, so the held-key test checks the
 * key is swallowed; the outcome is checked in a browser (section 8).
 */
function dangerModal(open: boolean, onConfirm = vi.fn(), onCancel = vi.fn(), title = 'Delete this poster?') {
  return (
    <>
      <button type="button">outside</button>
      <ConfirmModal
        open={open}
        title={title}
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}

function typedModal(open: boolean, confirmLabel = 'Delete my account', message = 'Everything goes, permanently.') {
  return (
    <>
      <button type="button">Delete account</button>
      <ConfirmModal
        open={open}
        title="Delete your account?"
        message={message}
        confirmLabel={confirmLabel}
        danger
        typedConfirmation="delete my account"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    </>
  );
}

describe('ConfirmModal owns the keyboard while it is open', () => {
  it('a delete dialog opens with focus on Cancel, not on Delete', () => {
    const { rerender } = render(dangerModal(false));
    rerender(dangerModal(true));
    expect(active()).toBe('Cancel');
  });

  it('a held Enter (a repeated keydown) is swallowed, so it cannot press a button', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    const confirm = screen.getByRole('button', { name: 'Change size' });
    expect(fireEvent.keyDown(confirm, { key: 'Enter', repeat: true }), 'default action allowed').toBe(false);
    expect(fireEvent.keyDown(confirm, { key: ' ', repeat: true }), 'default action allowed').toBe(false);
    // A fresh press still works as a press.
    expect(fireEvent.keyDown(confirm, { key: 'Enter' })).toBe(true);
  });

  it('Shift+Tab from outside the dialog (focus fell to the page) comes back into it', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true });
    expect(['Cancel', 'Change size']).toContain(active());
  });

  it('a click on the dialog\'s own text keeps focus inside the dialog', () => {
    const { rerender } = render(modal(false));
    rerender(modal(true));
    const panel = screen.getByRole('dialog');
    // Without this, a click on its text sends focus to the page body, and
    // Shift+Tab then starts from the element just before the dialog.
    expect(panel.getAttribute('tabindex'), 'the dialog itself can hold focus').toBe('-1');
  });

  it('keys do not reach listeners behind the dialog', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    document.addEventListener('keydown', behind);
    try {
      const { rerender } = render(modal(false));
      rerender(modal(true));
      const confirm = screen.getByRole('button', { name: 'Change size' });
      for (const key of ['Backspace', 'Delete', 'Enter', 'Escape', 'ArrowDown', 'z']) {
        fireEvent.keyDown(confirm, { key, metaKey: key === 'z' });
      }
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
      document.removeEventListener('keydown', behind);
    }
  });

  it('with two dialogs open, Escape closes only the one on top', () => {
    const bottomCancel = vi.fn();
    const topCancel = vi.fn();
    const both = (open: boolean) => (
      <>
        {dangerModal(open, vi.fn(), bottomCancel, 'Delete this poster?')}
        <ConfirmModal open={open} title="Duplicated" message="Open the copy?" confirmLabel="Open copy" onConfirm={vi.fn()} onCancel={topCancel} />
      </>
    );
    const { rerender } = render(both(false));
    rerender(both(true));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open copy' }), { key: 'Escape' });
    expect(topCancel).toHaveBeenCalledTimes(1);
    expect(bottomCancel).not.toHaveBeenCalled();
  });

  it('the typed-confirmation dialog focuses its field, and gives focus back when it closes', () => {
    const { rerender } = render(typedModal(false));
    screen.getByRole('button', { name: 'Delete account' }).focus();
    rerender(typedModal(true));
    expect(document.activeElement?.tagName, 'focus on open').toBe('INPUT');
    rerender(typedModal(false));
    expect(active(), 'focus after close').toBe('Delete account');
  });

  it('Tab from Cancel reaches the typed field again', () => {
    const { rerender } = render(typedModal(false));
    rerender(typedModal(true));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('keeps its message and its button while it fades out', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { rerender } = render(typedModal(false));
      rerender(typedModal(true));
      // Profile clears what it was asking about once the dialog closes.
      rerender(typedModal(false, 'Delete all', ''));
      expect(screen.queryByRole('button', { name: 'Delete my account' }), 'the button during the fade').not.toBeNull();
      expect(screen.queryByText('Everything goes, permanently.')).not.toBeNull();
    } finally {
      act(() => {
        vi.advanceTimersByTime(500);
      });
      vi.useRealTimers();
    }
  });
});

describe('ConfirmModal and the browser (final review of fix 02)', () => {
  function onPlatform(platform: string) {
    const spy = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);
    return () => spy.mockRestore();
  }

  it('on a Mac, ⌘S and ⌘D behind the dialog do not fall through to the browser', () => {
    // The editor's own shortcuts prevented the browser's Save Page and
    // bookmark dialogs; the dialog now stops those keys before the editor
    // sees them, so it must prevent them itself (final review F1).
    const restore = onPlatform('MacIntel');
    try {
      const { rerender } = render(modal(false));
      rerender(modal(true));
      const confirm = screen.getByRole('button', { name: 'Change size' });
      expect(fireEvent.keyDown(confirm, { key: 's', metaKey: true }), '⌘S default allowed').toBe(false);
      expect(fireEvent.keyDown(confirm, { key: 'd', metaKey: true }), '⌘D default allowed').toBe(false);
    } finally {
      restore();
    }
  });

  it('elsewhere, Ctrl+S and Ctrl+D behind the dialog do not fall through to the browser', () => {
    const restore = onPlatform('Win32');
    try {
      const { rerender } = render(modal(false));
      rerender(modal(true));
      const confirm = screen.getByRole('button', { name: 'Change size' });
      expect(fireEvent.keyDown(confirm, { key: 's', ctrlKey: true }), 'Ctrl+S default allowed').toBe(false);
      expect(fireEvent.keyDown(confirm, { key: 'd', ctrlKey: true }), 'Ctrl+D default allowed').toBe(false);
    } finally {
      restore();
    }
  });

  it('on a Mac, Ctrl+D in the typed field still deletes forward (a text key there)', () => {
    // Last-round verification L-4: Ctrl+D was prevented in the typed field.
    const restore = onPlatform('MacIntel');
    try {
      const { rerender } = render(typedModal(false));
      rerender(typedModal(true));
      expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'd', ctrlKey: true })).toBe(true);
    } finally {
      restore();
    }
  });

  it('text editing shortcuts still work in the typed field', () => {
    const { rerender } = render(typedModal(false));
    rerender(typedModal(true));
    const field = screen.getByRole('textbox');
    for (const key of ['a', 'c', 'v', 'x', 'z']) {
      expect(fireEvent.keyDown(field, { key, metaKey: true }), `⌘${key.toUpperCase()}`).toBe(true);
    }
  });

  it('a dialog inside a part of the page that is hidden and inert does not take the keyboard', () => {
    // The async "Duplicated" prompt can open while Preview hides the editor
    // (final review F6): Preview's own keys must keep working.
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const tree = (open: boolean) => (
        <div inert>
          <ConfirmModal open={open} title="Duplicated" message="Open the copy?" confirmLabel="Open copy" cancelLabel="Stay here" onConfirm={vi.fn()} onCancel={vi.fn()} />
        </div>
      );
      const { rerender } = render(tree(false));
      rerender(tree(true));
      const prevented = !fireEvent.keyDown(document.body, { key: 'Enter' });
      expect(behind, 'the key reached the page').toHaveBeenCalledTimes(1);
      expect(prevented, 'the key was prevented').toBe(false);
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });
});

describe('ConfirmModal under another modal dialog (last-round L-3)', () => {
  it('a dialog covered by a later modal dialog neither takes focus nor stops its keys', () => {
    // The async "Duplicated" prompt can open while the logo picker, a modal
    // dialog added to the page after it, covers it.
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const tree = (open: boolean) => (
        <>
          <ConfirmModal open={open} title="Duplicated" message="Open the copy?" confirmLabel="Open copy" cancelLabel="Stay here" onConfirm={vi.fn()} onCancel={vi.fn()} />
          <div role="dialog" aria-modal="true" aria-label="Pick a logo">
            <input aria-label="Search logos" />
          </div>
        </>
      );
      const { rerender } = render(tree(false));
      screen.getByRole('textbox', { name: 'Search logos' }).focus();
      rerender(tree(true));
      expect(document.activeElement, 'focus stays in the logo search').toBe(screen.getByRole('textbox', { name: 'Search logos' }));
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(behind, 'Escape reached the logo picker').toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });
});

describe('ConfirmModal with two dialogs open (round-7 audit)', () => {
  it('the dialog that answers a key stops it for every other listener on the window', () => {
    // A browser runs a microtask between window listeners: after the prompt
    // cancelled on Escape, the size dialog under it was no longer covered,
    // saw the same Escape and closed too (measured in Chromium, 6 of 6).
    // stopPropagation does not stop other listeners on the same target.
    const { rerender } = render(modal(false));
    rerender(modal(true));
    const later = vi.fn();
    window.addEventListener('keydown', later, true);
    try {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Change size' }), { key: 'Escape' });
      expect(later).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', later, true);
    }
  });

  it('a dialog uncovered when the dialog over it closes takes focus', () => {
    // The page order of the editor: the size dialog, then the prompt. The
    // prompt opened first; the size dialog opened under it.
    const both = (size: boolean, prompt: boolean) => (
      <>
        <button type="button">Poster width</button>
        <ConfirmModal open={size} title="Change poster to 30 × 36 in?" message="Your blocks will move onto the new sheet." confirmLabel="Change size" onConfirm={vi.fn()} onCancel={vi.fn()} />
        <ConfirmModal open={prompt} title="Duplicated" message="Open the copy?" confirmLabel="Open copy" cancelLabel="Stay here" initialFocus="cancel" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>
    );
    const { rerender } = render(both(false, false));
    screen.getByRole('button', { name: 'Poster width' }).focus();
    rerender(both(false, true));
    expect(active(), 'the prompt takes focus').toBe('Stay here');
    rerender(both(true, true));
    expect(active(), 'the covered size dialog does not').toBe('Stay here');
    rerender(both(true, false));
    expect(active(), 'focus moves into the size dialog now in view').toBe('Change size');
  });

  it('a modal dialog that is fading out does not cover this one', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const tree = (open: boolean) => (
        <>
          <ConfirmModal open={open} title="Change poster to 36 × 48 in?" message="m" confirmLabel="Change size" onConfirm={vi.fn()} onCancel={vi.fn()} />
          <div role="dialog" aria-modal="true" data-state="closing" aria-label="closing" />
        </>
      );
      const { rerender } = render(tree(false));
      rerender(tree(true));
      fireEvent.keyDown(screen.getByRole('button', { name: 'Change size' }), { key: 'Backspace' });
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });
});
