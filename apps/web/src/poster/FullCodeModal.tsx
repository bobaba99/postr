/**
 * "Full edited code" — the overlay that shows the pasted script with
 * the recommended base_size applied (readabilityFullFix.ts).
 *
 * Mounted from ReadabilityPanel in both hosts, and on the public page
 * (/tools/figure-readability) it is the only modal a visitor meets, so
 * it is a real dialog: `role="dialog" aria-modal`, named by its
 * heading, focus moves to the close control on open and back to the
 * opener on close, Tab wraps inside it, body scroll is locked while it
 * is up. Escape, the × and a backdrop click all close it — the same
 * idiom as ConfirmModal / InputModal.
 */
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { layoutTokens, type ReadabilityLayout } from './readabilityLayout';
import { CodeView, CopyButton } from './ReadabilityCodeView';
import { btnStyle, labelStyle } from './readabilityStyles';

interface Props {
  open: boolean;
  code: string;
  onClose: () => void;
  onCopied: () => void;
  layout: ReadabilityLayout;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FullCodeModal({ open, code, onClose, onCopied, layout }: Props) {
  const t = layoutTokens(layout);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus + scroll lock: remember the opener, land on ×, restore both
  // when the dialog goes away.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        style={{
          background: '#1e1e2e',
          border: '1px solid #45475a',
          borderRadius: 10,
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid #313244',
          }}
        >
          <div id={titleId} style={{ ...labelStyle, letterSpacing: 1 }}>
            Full edited code
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{
              ...btnStyle,
              padding: '4px 10px',
              fontFamily: 'system-ui, sans-serif',
              fontSize: t.buttonFontSize,
              minHeight: t.buttonMinHeight,
              minWidth: t.buttonMinHeight,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          <CodeView text={code} layout={layout} />
        </div>
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #313244',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <CopyButton
            text={code}
            label="Copy full code"
            onCopied={onCopied}
            style={{ minHeight: t.buttonMinHeight, fontSize: t.buttonFontSize }}
          />
        </div>
      </div>
    </div>
  );
}
