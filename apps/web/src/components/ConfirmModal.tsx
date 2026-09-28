/**
 * ConfirmModal — dark-themed confirmation dialog.
 *
 * Supports an optional `typedConfirmation` prop: when set, the user
 * must type the exact phrase before the confirm button enables.
 * Used for high-friction destructive actions like account deletion.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useModalTransition } from '@/hooks/useModalTransition';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

/**
 * The editor's own shortcuts whose browser default opens browser UI (S: Save
 * Page, D: bookmark). The editor prevented these; with the dialog stopping
 * keys before the editor sees them, the dialog prevents them (final review of
 * fix 02, F1). Only with the platform's command key: on a Mac, Ctrl+D is a
 * text key (delete forward) and must reach the typed field.
 */
const APP_SHORTCUTS = new Set(['s', 'd']);
const commandKey = (e: globalThis.KeyboardEvent) =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? e.metaKey : e.ctrlKey;

/**
 * Whether the user can see and reach this dialog, so that it should own the
 * keyboard. Not when it sits in a part of the page that is hidden and inert
 * (the editor under Preview; final review F6), and not when another open
 * modal dialog comes after it on the page. Modals stack in page order (the
 * same z-index, the later one on top), so the later one is the one in view:
 * the logo picker over an async "Duplicated" prompt (last-round
 * verification L-3), or the prompt over a size dialog, where one Escape then
 * closes only the prompt (BK-5).
 */
/**
 * Open dialogs, so that one that becomes uncovered when the dialog over it
 * closes can take focus (round-7 audit, A7-4): otherwise a visible modal
 * dialog sat with focus behind it until the next key.
 */
const openDialogs = new Set<{ content: () => HTMLElement | null; first: () => HTMLElement | null }>();

function focusDialogInView() {
  for (const d of openDialogs) {
    const content = d.content();
    if (content && inView(content) && !content.contains(document.activeElement)) d.first()?.focus();
  }
}

function inView(content: HTMLElement): boolean {
  if (content.closest('[inert]')) return false;
  for (const other of document.querySelectorAll<HTMLElement>('[aria-modal="true"]')) {
    if (other === content || other.contains(content) || content.contains(other)) continue;
    if (other.getAttribute('data-state') === 'closing') continue;
    if (content.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) return false;
  }
  return true;
}

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** If set, user must type this exact phrase to enable the confirm button. */
  typedConfirmation?: string;
  /**
   * Which button has focus when the dialog opens. By default the action,
   * or Cancel when the action cannot be undone (`danger`). A dialog that
   * opens on its own, not in answer to what the user just did, passes
   * 'cancel': the user may be typing, and the next key would press it.
   */
  initialFocus?: 'action' | 'cancel';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  typedConfirmation,
  initialFocus,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  const messageId = useId();
  const { mounted, state } = useModalTransition(open);

  // Callers pass a new inline onCancel on every render. Reading it through a
  // ref keeps the effects below from re-running on each parent render — they
  // used to, and each run moved focus onto the confirm button, so Enter or
  // Space applied a change the user had not chosen (review of fix 02).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // What was shown while open stays on screen while the dialog fades out:
  // callers clear what they were asking about as soon as it closes.
  const focusCancel = initialFocus ? initialFocus === 'cancel' : danger;
  const shown = useRef({ title, message, confirmLabel, cancelLabel, danger, typedConfirmation, focusCancel });
  if (open) shown.current = { title, message, confirmLabel, cancelLabel, danger, typedConfirmation, focusCancel };
  const view = shown.current;

  // Reset typed text when modal opens/closes
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Focus moves into the dialog once it is actually on screen (`mounted`),
  // and goes back to whatever had it when the dialog closes. Keyed on the
  // open/mounted pair only, so a parent re-render never moves focus.
  //
  // The first focus is the typed field when there is one, Cancel when the
  // action cannot be undone (`danger`) or the dialog opened on its own
  // (`initialFocus`), and the action otherwise. Focusing Delete let the
  // Enter that opened the dialog, repeating, or a second Enter, delete
  // permanently (re-check of fix 02, BK-1).
  useEffect(() => {
    if (!open || !mounted) return;
    const before = document.activeElement as HTMLElement | null;
    const first = () =>
      shown.current.typedConfirmation ? typedRef.current : shown.current.focusCancel ? cancelRef.current : confirmRef.current;
    if (contentRef.current && inView(contentRef.current)) first()?.focus();
    const entry = { content: () => contentRef.current, first };
    openDialogs.add(entry);

    // While open, the dialog owns the keyboard. It listens on the window in
    // the capture phase and stops every key there, so no listener behind it
    // reacts: the editor's shortcuts, a table's range delete, crop mode,
    // another dialog's Escape (re-check of fix 02, BK-2, BK-3, BK-5). The
    // app's other key listeners all listen in the bubble phase; a window
    // capture listener added before the dialog opened would still run first.
    // Stopping a key does not cancel what the browser does with it: typing
    // and pressing the focused button still work.
    //
    // Only a dialog in view owns the keyboard (see inView); one that is
    // hidden or covered leaves the keys to what the user can see.
    const onKey = (e: globalThis.KeyboardEvent) => {
      const content = contentRef.current;
      if (!content || !inView(content)) return;
      // Not only stopPropagation: another dialog's listener on the same
      // window would still run, and a browser runs a microtask between the
      // two. The dialog over this one closed on Escape in between, so the
      // one under it found itself in view and closed on the same Escape
      // (round-7 audit, A7-1: 6 of 6 in Chromium).
      e.stopImmediatePropagation();
      if (commandKey(e) && APP_SHORTCUTS.has(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
      } else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) {
        // A held key repeats. The press that opened the dialog must not go
        // on to press its button (BK-4).
        e.preventDefault();
      } else if (e.key === 'Tab') {
        trapTab(e, content, first);
      } else if (!(e.target instanceof Node) || !content.contains(e.target)) {
        e.preventDefault();
        first()?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      openDialogs.delete(entry);
      if (before && before.isConnected && before !== document.body) before.focus();
      focusDialogInView();
    };
  }, [open, mounted]);

  if (!mounted) return null;

  const confirmEnabled = view.typedConfirmation
    ? typed.toLowerCase().trim() === view.typedConfirmation.toLowerCase().trim()
    : true;

  return (
    <div
      data-postr-modal-backdrop data-state={state}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={contentRef}
        data-postr-modal-content data-state={state}
        // A dialog screen readers announce, named by its title.
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        // A click on the dialog's text keeps focus in the dialog. Otherwise
        // focus fell to the page, and Shift+Tab left the dialog (BK-2).
        tabIndex={-1}
        style={{
          outline: 'none',
          width: '100%',
          maxWidth: 440,
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h3
          id={titleId}
          style={{
            margin: '0 0 8px',
            fontSize: 16,
            fontWeight: 600,
            color: view.danger ? '#f87171' : '#e2e2e8',
          }}
        >
          {view.title}
        </h3>
        <p
          id={messageId}
          style={{
            margin: '0 0 20px',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#9ca3af',
          }}
        >
          {view.message}
        </p>

        {view.typedConfirmation && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
              Type <strong style={{ color: '#f87171', fontFamily: 'monospace' }}>{view.typedConfirmation}</strong> to confirm:
            </p>
            <input
              ref={typedRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={view.typedConfirmation}
              aria-label={`Type ${view.typedConfirmation} to confirm`}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                color: confirmEnabled ? '#a6e3a1' : '#e2e2e8',
                background: '#1a1a26',
                border: `1px solid ${confirmEnabled ? '#a6e3a1' : '#2a2a3a'}`,
                borderRadius: 6,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          >
            {view.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={!confirmEnabled}
            style={{
              cursor: confirmEnabled ? 'pointer' : 'not-allowed',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: view.danger ? '#dc2626' : '#7c6aed',
              border: 'none',
              borderRadius: 6,
              opacity: confirmEnabled ? 1 : 0.4,
            }}
          >
            {view.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tab and Shift+Tab stay inside the dialog, wherever focus is: on its last
 * or first control, on the dialog itself after a click on its text, or on
 * the page if it fell out.
 */
function trapTab(e: globalThis.KeyboardEvent, content: HTMLElement, first: () => HTMLElement | null) {
  const focusables = Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) {
    e.preventDefault();
    first()?.focus();
    return;
  }
  const head = focusables[0]!;
  const tail = focusables[focusables.length - 1]!;
  const at = focusables.indexOf(document.activeElement as HTMLElement);
  if (at === -1) {
    e.preventDefault();
    (e.shiftKey ? tail : head).focus();
  } else if (!e.shiftKey && at === focusables.length - 1) {
    e.preventDefault();
    head.focus();
  } else if (e.shiftKey && at === 0) {
    e.preventDefault();
    tail.focus();
  }
}
