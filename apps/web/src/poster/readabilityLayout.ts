/**
 * Layout tokens for ReadabilityPanel's two hosts.
 *
 *   'panel' — the editor's Figure › Check tab: a 13px sidebar, the size
 *             comes from a draggable overlay on the canvas, and Tab in
 *             the code editor indents (the sidebar is not a page).
 *   'page'  — /tools/figure-readability: a public, phone-first page.
 *             16px inputs (iOS Safari zooms below that), 44px targets
 *             (WCAG 2.5.5), the typed print size is the canvas, and Tab
 *             is never intercepted — on a page that would be a trap.
 *
 * Kept out of ReadabilityPanel.tsx so the panel reads as one component
 * with a few `t.*` lookups instead of a thicket of ternaries.
 */
import type { CSSProperties } from 'react';

export type ReadabilityLayout = 'panel' | 'page';

export interface ReadabilityLayoutTokens {
  /** Shared by the code editor, its line-number gutter AND the read-only
   *  CodeView (fix snippet, full-code modal) — if they drift, line
   *  numbers stop lining up with rows, and on the page the fix would
   *  render smaller than the code the visitor pasted. */
  readonly editorFont: CSSProperties;
  readonly editorLineHeight: string;
  /** Applied to the language toggles, Check, Copy and "Open full edited
   *  code". Undefined keeps the sidebar's natural button height. */
  readonly buttonMinHeight: number | undefined;
  readonly buttonFontSize: number;
  readonly tableFontSize: number;
  /** Secondary text — #6b7280 fails contrast on the page's ground. */
  readonly mutedColor: string;
  /** Whether the code editor turns Tab into two spaces. */
  readonly tabIndents: boolean;
  /** Suffix after "Scale factor: 1.40x" when no image block sizes it. */
  readonly scaleSuffix: string;
  /** Second half of the "✓ Copied to clipboard —" banner. */
  readonly copiedBannerTail: string;
  /** How the parser's "no canvas size" warning names the fallback. */
  readonly defaultSizeLabel: string | undefined;
}

const MONO = 'ui-monospace, "SF Mono", Menlo, Monaco, monospace';

const PANEL_TOKENS: ReadabilityLayoutTokens = {
  editorFont: { fontFamily: MONO, fontSize: 13, lineHeight: '20px' },
  editorLineHeight: '20px',
  buttonMinHeight: undefined,
  buttonFontSize: 13,
  tableFontSize: 13,
  mutedColor: '#6b7280',
  tabIndents: true,
  scaleSuffix: ' (default block size)',
  copiedBannerTail: 'paste it into your editor, re-run, and re-upload the image.',
  defaultSizeLabel: undefined,
};

const PAGE_TOKENS: ReadabilityLayoutTokens = {
  editorFont: { fontFamily: MONO, fontSize: 16, lineHeight: '24px' },
  editorLineHeight: '24px',
  buttonMinHeight: 44,
  buttonFontSize: 15,
  tableFontSize: 15,
  mutedColor: '#8b8f99',
  tabIndents: false,
  scaleSuffix: ' (source canvas → printed size)',
  copiedBannerTail: 'paste it into your script, re-run, and print at this size.',
  defaultSizeLabel: 'the print size you entered,',
};

export function layoutTokens(layout: ReadabilityLayout): ReadabilityLayoutTokens {
  return layout === 'page' ? PAGE_TOKENS : PANEL_TOKENS;
}
