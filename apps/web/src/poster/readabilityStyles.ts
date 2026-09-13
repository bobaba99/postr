/**
 * Inline style tokens shared by the readability check's pieces —
 * ReadabilityPanel.tsx, ReadabilityCodeView.tsx, FullCodeModal.tsx.
 * Catppuccin-ish sidebar palette; the page layout scales sizes through
 * readabilityLayout.ts rather than by redefining these.
 */
import type { CSSProperties } from 'react';

export const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontSize: 14,
};

export const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
};

export const btnStyle: CSSProperties = {
  cursor: 'pointer',
  background: '#313244',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  fontFamily: 'monospace',
};

export const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: '#89b4fa',
  color: '#1e1e2e',
  borderColor: '#89b4fa',
  fontWeight: 700,
  fontFamily: 'system-ui, sans-serif',
};
