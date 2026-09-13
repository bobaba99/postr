/**
 * Read-only code view + copy button shared by the readability check's
 * fix box (ReadabilityPanel.tsx) and its full-code modal
 * (FullCodeModal.tsx).
 *
 * `CodeView` is a styled <pre> with a line-number gutter; it takes the
 * host layout so the page shows the fix at the same 16px the pasted
 * code is shown at, never smaller than what the visitor typed.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { layoutTokens, type ReadabilityLayout } from './readabilityLayout';
import { btnStyle } from './readabilityStyles';

interface CopyButtonProps {
  text: string;
  label?: string;
  onCopied?: () => void;
  style?: CSSProperties;
}

/** Copy to clipboard with a 2.4s "✓ Copied" state. */
export function CopyButton({ text, label = 'Copy', onCopied, style }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        onCopied?.();
      }}
      style={{
        ...btnStyle,
        minWidth: 88,
        textAlign: 'center',
        // A wrapped "Copy snippet" reads as two buttons on a phone.
        whiteSpace: 'nowrap',
        fontFamily: 'system-ui, sans-serif',
        background: copied ? '#0f3f2a' : btnStyle.background,
        color: copied ? '#a6e3a1' : btnStyle.color,
        borderColor: copied ? '#2d6a4f' : '#45475a',
        transition: 'background var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard)',
        ...style,
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

interface CodeViewProps {
  text: string;
  layout: ReadabilityLayout;
}

export function CodeView({ text, layout }: CodeViewProps) {
  const t = layoutTokens(layout);
  const lines = text.split('\n');
  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid #313244',
        borderRadius: 6,
        background: '#181825',
        overflow: 'auto',
        maxHeight: 420,
      }}
    >
      <div
        aria-hidden
        style={{
          flex: '0 0 auto',
          padding: '10px 8px 10px 10px',
          color: '#585b70',
          ...t.editorFont,
          textAlign: 'right',
          userSelect: 'none',
          borderRight: '1px solid #313244',
          minWidth: 34,
          background: '#11111b',
        }}
      >
        {lines.map((_, i) => (
          <div key={i} style={{ lineHeight: t.editorLineHeight }}>
            {i + 1}
          </div>
        ))}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: 10,
          color: '#a6e3a1',
          ...t.editorFont,
          whiteSpace: 'pre',
          overflow: 'auto',
        }}
      >
        {text}
      </pre>
    </div>
  );
}
