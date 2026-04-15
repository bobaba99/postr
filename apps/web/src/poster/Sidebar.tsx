/**
 * Sidebar — 5-tab control panel.
 *
 * Tabs: Layout · Authors · Refs · Style · Edit
 *
 * Pulls everything from props rather than the store directly so the
 * sidebar stays a pure presentation component (easier to story-test
 * later). PosterEditor is the single place that wires the store
 * actions in.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  Author,
  Block,
  HeadingStyle,
  Institution,
  Palette,
  Reference,
  Styles,
  TableData,
  TypeStyle,
} from '@postr/shared';
import { nanoid } from 'nanoid';
import {
  FONTS,
  FONT_WEIGHTS,
  HIGHLIGHT_PRESETS,
  PALETTES,
  POSTER_SIZES,
  TABLE_BORDER_PRESETS,
  ptToUnits,
  unitsToPt,
  type NamedPalette,
  type PosterSizeKey,
} from './constants';
import {
  DEFAULT_TABLE_DATA,
  deleteColAt,
  deleteRowAt,
  insertCol,
  insertRow,
  setBorderPreset,
} from './tableOps';
import { CITATION_STYLES, type CitationStyleKey } from './citations';
import { LAYOUT_TEMPLATES, type LayoutKey } from './templates';
import { parseBibtex, parseRis } from './parsers';
import { AuthorLine } from './blocks';
import {
  autoFormatAPA,
  stripHtmlToPlainText,
} from './academicMarkdown';
import { auditPaletteCB } from './colorblind';
import { CommentsPanel } from './CommentsPanel';
import { RichTextEditor, type SelectionInfo } from './RichTextEditor';
import { FloatingFormatToolbar } from './FloatingFormatToolbar';
import { ReadabilityPanel } from './ReadabilityPanel';
import {
  JustRefreshedBanner,
  UpdateAvailableBanner,
} from '@/components/UpdateAvailableToast';

export type SidebarTab =
  | 'layout'
  | 'authors'
  | 'refs'
  | 'style'
  | 'edit'
  | 'insert'
  | 'check'
  | 'issues'
  | 'comments'
  | 'export';

/**
 * A single lint/validation issue surfaced in the Issues sidebar tab.
 * Covers both hard errors (block outside canvas, image missing) and
 * soft warnings (empty authors list, very long title, etc.). The
 * `blockId` hook lets the tab click-jump to the offending block.
 */
export interface PosterIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  blockId?: string;
}

export interface StylePreset {
  name: string;
  fontFamily: string;
  paletteName: string;
  styles: Styles;
  headingStyle: HeadingStyle;
  /**
   * Full palette colors. Added after 2026-04-11 so custom palettes
   * survive in presets even when the referenced custom palette is
   * deleted from the user's local catalog. Legacy presets without
   * this field fall back to looking up `paletteName` in PALETTES.
   */
  palette?: Palette;
}

interface SidebarProps {
  // poster meta
  posterTitle: string;
  onChangePosterTitle: (title: string) => void;
  posterSizeKey: PosterSizeKey;
  posterWidthIn: number;
  posterHeightIn: number;
  onChangePosterSize: (key: PosterSizeKey) => void;
  onChangeCustomSize: (w: number, h: number) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;
  showRuler: boolean;
  onToggleRuler: (show: boolean) => void;

  // typography + palette
  fontFamily: string;
  onChangeFont: (font: string) => void;
  palette: Palette;
  paletteName: string;
  onChangePalette: (palette: Palette, name: string) => void;
  styles: Styles;
  onChangeStyles: (styles: Styles) => void;
  headingStyle: HeadingStyle;
  onChangeHeadingStyle: (hs: HeadingStyle) => void;

  // authors / institutions
  authors: Author[];
  onChangeAuthors: (authors: Author[]) => void;
  institutions: Institution[];
  onChangeInstitutions: (insts: Institution[]) => void;

  // references
  references: Reference[];
  onChangeReferences: (refs: Reference[]) => void;
  citationStyle: CitationStyleKey;
  onChangeCitationStyle: (s: CitationStyleKey) => void;

  // selection + actions
  selectedBlock: Block | null;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
  onAddBlock: (type: Block['type']) => void;
  onApplyTemplate: (key: LayoutKey) => void;
  onAutoLayout: () => void;
  onPrint: () => void;
  onPrintAtStaples: () => void;
  onPreview: () => void;
  onPublish: () => void;

  // presets
  savedPresets: StylePreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: StylePreset) => void;

  // custom palettes
  customPalettes: NamedPalette[];
  onCreateCustomPalette: () => void;
  onEditCustomPalette: (name: string) => void;
  onDeleteCustomPalette: (name: string) => void;

  // sidebar visibility (Notion-style collapse toggle)
  onToggleSidebar?: () => void;

  // active sidebar tab — lifted to PosterEditor so the Check tab
  // can render a draggable "figure size" overlay on the canvas
  // when it's the active tab.
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;

  // When the Check tab is active and no image block is selected,
  // these come from the draggable canvas overlay. The panel uses
  // them as the "default" figure size instead of a hardcoded 10×7.
  checkFigureWidthIn: number;
  checkFigureHeightIn: number;

  // Pre-computed validation issues for the Issues tab. Shared with
  // the in-canvas warning banner so both surfaces stay in sync.
  issues: PosterIssue[];
  onJumpToBlock?: (blockId: string) => void;

  // Comments tab. posterId is null until the poster has been saved
  // (CommentsPanel renders an appropriate empty state in that case).
  // pendingCommentAnchor is populated by the canvas overlay when the
  // user drags a rectangle in comment mode; CommentsPanel pre-fills
  // the draft form with the anchor and clears it after submit.
  posterId: string | null;
  pendingCommentAnchor: import('@/data/comments').CommentAnchor | null;
  onClearPendingCommentAnchor: () => void;

  /** Read-only mode — share viewer. Hides every tab except Comments. */
  readOnly?: boolean;
}

// Shared inline styles for the dark sidebar UI chrome.
//
// Padding, margins, gaps, and radii were doubled alongside the 2x
// font-size bump so controls breathe correctly at the larger type.
const inputBase: CSSProperties = {
  all: 'unset',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#ddd',
  fontSize: 15,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '1.2px',
  // Bumped from #555 (near-invisible on dark bg) to #9ca3af so
  // section headings are legible across every tab. Audit flagged
  // this on the AUTHORS tab where ① INSTITUTIONS / ② AUTHORS
  // looked like placeholder text.
  color: '#9ca3af',
  marginBottom: 8,
  marginTop: 28,
};

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`;

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '12px 36px 12px 14px',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  color: '#ddd',
  fontSize: 17,
  outline: 'none',
  appearance: 'none',
  backgroundImage: SELECT_ARROW,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  backgroundSize: '18px 18px',
};

const buttonStyle = (active: boolean): CSSProperties => ({
  padding: '14px 20px',
  background: active ? '#7c6aed' : '#1a1a26',
  color: '#fff',
  border: active ? 'none' : '1px solid #2a2a3a',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
});

const iconBtnStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  fontSize: 12,
};

export function Sidebar(props: SidebarProps) {
  const tab = props.activeTab;
  const setTab = props.onChangeTab;
  const [presetName, setPresetName] = useState('');
  // Transient "just saved" flash on the Save-as-preset button so
  // users get an explicit confirmation instead of having to spot the
  // new row appearing in the list below. Cleared by a timer 1.6s
  // after save.
  const [presetJustSaved, setPresetJustSaved] = useState(false);
  useEffect(() => {
    if (!presetJustSaved) return;
    const t = setTimeout(() => setPresetJustSaved(false), 1600);
    return () => clearTimeout(t);
  }, [presetJustSaved]);

  // Auto-switch tabs based on what kind of block the user just
  // selected. The routing table:
  //
  //   authors block         → Authors tab   (dedicated controls)
  //   references block      → References tab (same idea)
  //   image block + check   → stay put (dimensions feed the panel)
  //   everything else       → Edit tab
  //
  // Sending the user to the tab that can actually edit the thing
  // they just clicked beats the old "always Edit" rule, which
  // dumped authors selections into the Edit tab's placeholder and
  // forced a second click to reach the real controls.
  useEffect(() => {
    if (!props.selectedBlock) return;
    const t = props.selectedBlock.type;
    if (t === 'image' && tab === 'check') return;
    if (t === 'authors') {
      setTab('authors');
      return;
    }
    if (t === 'references') {
      setTab('refs');
      return;
    }
    setTab('edit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedBlock?.id, props.selectedBlock?.type]);

  // Two states only: deselected (dark gray) and selected (white +
  // purple left bar + dark fill).
  //
  // Why `all: unset` and why no transitions:
  //   1. Native <button> leaks default :focus outline, :hover bg,
  //      user-agent padding, font, appearance, and user-select.
  //      Without `all: unset` Chrome draws a faint focus ring on top
  //      of our own active indicator — users read that as a phantom
  //      "light gray" state that lingers after clicking a tab.
  //   2. Transitioning color + background-color interpolates RGB
  //      between active and inactive when switching tabs. Mid-fade,
  //      the tab you just left reads as a distinct third color
  //      (neither bright white nor dim #6b7280) — that's the
  //      "third state" users kept seeing. We need instant snaps.
  //   3. outline: none is REQUIRED even with `all: unset` because
  //      some browsers re-apply focus outline via :focus-visible
  //      at the user-agent level.
  const tabStyle = (active: boolean): CSSProperties => ({
    all: 'unset',
    boxSizing: 'border-box',
    display: '-webkit-box',
    // Allow labels up to two lines — "plot code check" and "edit
    // block" wrap cleanly at ~1 word per line. Anything longer is
    // clipped with an ellipsis so the rail stays a predictable
    // height per row. Everything else uses `width: 100%` of the
    // 120 px rail so short labels still left-align.
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 2,
    overflow: 'hidden',
    width: '100%',
    padding: '12px 14px',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    fontSize: 12,
    lineHeight: 1.25,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    userSelect: 'none',
    outline: 'none',
    color: active ? '#ffffff' : '#6b7280',
    backgroundColor: active ? '#1e1e2e' : 'transparent',
    borderLeft: `3px solid ${active ? '#7c6aed' : 'transparent'}`,
  });

  return (
    <div
      data-postr-sidebar
      style={{
        // Wider sidebar — 484 px total (124 px rail + 360 px panel).
        // Rail was widened on 2026-04-11 so renamed tabs like "plot
        // code check" and "edit block" can wrap to max two lines
        // instead of getting clipped. Panel content width stays 360
        // so SmartTextarea / TableEditor / RichTextEditor layouts
        // don't need to reflow.
        width: 484,
        minWidth: 484,
        // `height: 100%` + `minHeight: 0` so the sidebar always fills
        // its (now animated) wrapper and its inner panel-content div
        // with `overflow: auto` has a bounded parent to scroll within.
        // Without these, the wrapper's content-driven height let the
        // panel grow unbounded and users couldn't scroll tall tabs
        // like Plot Code Check.
        height: '100%',
        minHeight: 0,
        background: '#111118',
        color: '#c8cad0',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        fontSize: 17,
        borderRight: '1px solid #1e1e2e',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/*
        Keyboard focus-visible indicator for the tab rail. Inline
        styles can't express pseudo-classes, so we scope a tiny
        stylesheet here. Only :focus-visible is targeted, not :focus,
        so click-focus stays invisible (no ghost ring) while keyboard
        Tab/Arrow navigation still shows where focus landed.
      */}
      <style>{`
        button[data-postr-tab]:focus-visible {
          box-shadow: inset 0 0 0 1px #7c6aed;
        }
      `}</style>

      {/* Hide-sidebar toggle, floats in the top-right corner.
          Notion-style: one click to collapse, and a reveal tab is
          rendered in PosterEditor when sidebarOpen is false. */}
      {props.onToggleSidebar && (
        <button
          aria-label="Hide sidebar"
          title="Hide sidebar (⌘/)"
          onClick={props.onToggleSidebar}
          style={{
            all: 'unset',
            position: 'absolute',
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            background: 'transparent',
            border: '1px solid transparent',
            zIndex: 5,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1a1a26';
            e.currentTarget.style.color = '#c8cad0';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#6b7280';
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Sidebar-collapse icon: panel with a left-pointing chevron. */}
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
            <path d="M16 10l-2 2 2 2" />
          </svg>
        </button>
      )}
      <a href="/dashboard" style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', cursor: 'pointer' }}>
        <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <div style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>Postr</div>
      </a>
      {/* Prominent "back to dashboard" button below the logo — the
          logo itself also links to /dashboard but users don't reliably
          recognize a logo as a back affordance, so this explicit pill
          makes the exit path unambiguous. */}
      <a
        href="/dashboard"
        title="Back to My Posters"
        style={{
          margin: '10px 24px 0',
          padding: '8px 12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 6,
          textDecoration: 'none',
          color: '#c8cad0',
          fontSize: 13,
          fontWeight: 500,
          width: 'fit-content',
          transition: 'border-color 120ms, color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#7c6aed';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#2a2a3a';
          e.currentTarget.style.color = '#c8cad0';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to My Posters
      </a>

      {/* New-version banner. Renders in-place at the top of the
          sidebar (above the tab rail) when the deployed
          /version.json advertises a build id different from the
          one baked into the running bundle. Styled to match the
          Issues panel language so it reads as an in-app editor
          signal, not a browser notification. */}
      <UpdateAvailableBanner />
      <JustRefreshedBanner />

      {/* Body: vertical tab rail on the left + panel content on the right */}
      <div style={{ flex: 1, display: 'flex', marginTop: 16, minHeight: 0 }}>
        {/* Vertical tab rail */}
        <nav
          aria-label="Sidebar sections"
          style={{
            // Widened from 100 → 124 px so "plot code check" wraps
            // to 2 lines ("plot code" / "check") without clipping,
            // and "edit block" + "references" fit on a single line.
            width: 124,
            minWidth: 124,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #1e1e2e',
            paddingTop: 4,
          }}
        >
          {/* Tab ORDER and DISPLAY LABELS — explicit per user request.
            * Internal keys (edit / refs / check) are preserved so nothing
            * downstream breaks; only the top-to-bottom order and the
            * visible label change. `insert` is grouped with `edit` since
            * both are block-focused operations. */}
          {(
            (props.readOnly
              ? ([['comments', 'comments']] as Array<[SidebarTab, string]>)
              : ([
                  ['layout', 'layout'],
                  ['style', 'style'],
                  ['authors', 'authors'],
                  ['insert', 'insert'],
                  ['edit', 'edit block'],
                  ['refs', 'references'],
                  ['check', 'plot code check'],
                  ['issues', 'issues'],
                  ['comments', 'comments'],
                  ['export', 'export'],
                ] as Array<[SidebarTab, string]>))
          ).map(([t, label]) => {
            const issueCount = props.issues.length;
            const errorCount = props.issues.filter((i) => i.severity === 'error').length;
            return (
              <button
                key={t}
                data-postr-tab
                type="button"
                onClick={() => setTab(t)}
                style={tabStyle(tab === t)}
              >
                {label}
                {t === 'issues' && issueCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: 6,
                      minWidth: 16,
                      height: 16,
                      padding: '0 5px',
                      borderRadius: 999,
                      background: errorCount > 0 ? '#f38ba8' : '#f9e2af',
                      color: '#1e1e2e',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0,
                    }}
                  >
                    {issueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Panel content — keyed on `tab` so every switch re-triggers
          * the fade-slide enter animation defined in index.css. The
          * nested wrapper decouples the animation from the scroll
          * container's own layout so scroll position survives switches
          * without re-animating. */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 24px', minWidth: 0 }}>
        <div key={tab} className="postr-tab-enter">
        {tab === 'layout' && (
          <LayoutTab
            posterTitle={props.posterTitle}
            onChangePosterTitle={props.onChangePosterTitle}
            posterSizeKey={props.posterSizeKey}
            posterWidthIn={props.posterWidthIn}
            posterHeightIn={props.posterHeightIn}
            onChangePosterSize={props.onChangePosterSize}
            onChangeCustomSize={props.onChangeCustomSize}
            showGrid={props.showGrid}
            onToggleGrid={props.onToggleGrid}
            showRuler={props.showRuler}
            onToggleRuler={props.onToggleRuler}
            onApplyTemplate={props.onApplyTemplate}
            onAutoLayout={props.onAutoLayout}
          />
        )}

        {tab === 'authors' && (
          <AuthorsTab
            authors={props.authors}
            onChangeAuthors={props.onChangeAuthors}
            institutions={props.institutions}
            onChangeInstitutions={props.onChangeInstitutions}
            palette={props.palette}
            fontFamily={FONTS[props.fontFamily]?.css ?? props.fontFamily}
            styles={props.styles}
            onAddLogo={() => props.onAddBlock('logo')}
          />
        )}

        {tab === 'refs' && (
          <RefsTab
            references={props.references}
            onChangeReferences={props.onChangeReferences}
            citationStyle={props.citationStyle}
            onChangeCitationStyle={props.onChangeCitationStyle}
          />
        )}

        {tab === 'style' && (
          <StyleTab
            paletteName={props.paletteName}
            onChangePalette={props.onChangePalette}
            fontFamily={props.fontFamily}
            onChangeFont={props.onChangeFont}
            styles={props.styles}
            onChangeStyles={props.onChangeStyles}
            headingStyle={props.headingStyle}
            onChangeHeadingStyle={props.onChangeHeadingStyle}
            savedPresets={props.savedPresets}
            onSavePreset={(n) => {
              props.onSavePreset(n);
              setPresetJustSaved(true);
            }}
            onLoadPreset={props.onLoadPreset}
            customPalettes={props.customPalettes}
            onCreateCustomPalette={props.onCreateCustomPalette}
            onEditCustomPalette={props.onEditCustomPalette}
            onDeleteCustomPalette={props.onDeleteCustomPalette}
            presetName={presetName}
            setPresetName={setPresetName}
            presetJustSaved={presetJustSaved}
          />
        )}

        {tab === 'edit' && (
          <EditTab
            selectedBlock={props.selectedBlock}
            onUpdateBlock={props.onUpdateBlock}
            palette={props.palette}
            styles={props.styles}
            onChangeStyles={props.onChangeStyles}
          />
        )}

        {tab === 'check' && (
          <ReadabilityPanel
            selectedBlock={
              props.selectedBlock && props.selectedBlock.type === 'image'
                ? props.selectedBlock
                : null
            }
            defaultFigureWidthIn={props.checkFigureWidthIn}
            defaultFigureHeightIn={props.checkFigureHeightIn}
          />
        )}

        {tab === 'issues' && (
          <IssuesTab
            issues={props.issues}
            onJumpToBlock={props.onJumpToBlock}
          />
        )}

        {tab === 'comments' && (
          <CommentsPanel
            posterId={props.posterId}
            pendingAnchor={props.pendingCommentAnchor}
            onClearPendingAnchor={props.onClearPendingCommentAnchor}
            onJumpToAnchor={(c) => {
              if (c.anchor.type === 'block' && props.onJumpToBlock) {
                props.onJumpToBlock(c.anchor.blockId);
              } else if (c.anchor.type === 'text' && props.onJumpToBlock) {
                props.onJumpToBlock(c.anchor.blockId);
              }
            }}
            isOwner={true}
          />
        )}

        {tab === 'insert' && <AddBlockPanel onAddBlock={props.onAddBlock} />}

        {tab === 'export' && (
          <ExportTab
            onPrint={props.onPrint}
            onPrintAtStaples={props.onPrintAtStaples}
            onPreview={props.onPreview}
            onPublish={props.onPublish}
          />
        )}
        </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Layout tab
// =========================================================================

function LayoutTab(props: {
  posterTitle: string;
  onChangePosterTitle: (title: string) => void;
  posterSizeKey: PosterSizeKey;
  posterWidthIn: number;
  posterHeightIn: number;
  onChangePosterSize: (k: PosterSizeKey) => void;
  onChangeCustomSize: (w: number, h: number) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;
  showRuler: boolean;
  onToggleRuler: (show: boolean) => void;
  onApplyTemplate: (k: LayoutKey) => void;
  onAutoLayout: () => void;
}) {
  const [localTitle, setLocalTitle] = useState(props.posterTitle);
  const [titleSaved, setTitleSaved] = useState(!!props.posterTitle.trim());
  const titleDirty = localTitle !== props.posterTitle;

  // Sync from parent when the poster changes (e.g. navigating to a different poster)
  useEffect(() => {
    setLocalTitle(props.posterTitle);
    setTitleSaved(!!props.posterTitle.trim());
  }, [props.posterTitle]);

  const saveTitle = () => {
    props.onChangePosterTitle(localTitle);
    setTitleSaved(true);
    setTimeout(() => setTitleSaved(true), 0); // ensure re-render
  };

  const titleLen = localTitle.length;
  const titleTip =
    !localTitle.trim()
      ? 'Name your poster for the dashboard. Try: presenter, event, date (e.g. "Maya — APA 2026").'
      : titleLen < 10
        ? 'Tip: Add the conference name or date for quick identification (e.g. "Kenji — SfN Nov 2026").'
        : titleLen > 80
          ? 'Consider shortening — this name is for the dashboard, not the poster itself.'
          : null;

  return (
    <>
      <div style={labelStyle}>Poster Name</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={localTitle}
          onChange={(e) => {
            setLocalTitle(e.target.value);
            setTitleSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTitle();
          }}
          placeholder="e.g. Maya — APA 2026"
          style={{ ...inputBase, flex: 1, borderColor: !localTitle.trim() ? '#f87171' : titleDirty ? '#f9e2af' : '#2a2a3a' }}
        />
        <button
          onClick={saveTitle}
          disabled={!localTitle.trim()}
          style={{
            all: 'unset',
            cursor: localTitle.trim() ? 'pointer' : 'not-allowed',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: titleSaved && !titleDirty ? '#2d6a4f' : '#7c6aed',
            color: '#fff',
            opacity: localTitle.trim() ? 1 : 0.4,
            whiteSpace: 'nowrap',
            transition: 'background 0.2s',
          }}
        >
          {titleSaved && !titleDirty ? '✓ Saved' : 'Save'}
        </button>
      </div>
      {!localTitle.trim() && (
        <div style={{ fontSize: 13, color: '#f87171', lineHeight: 1.4, marginTop: 4 }}>
          A poster name is required for dashboard identification.
        </div>
      )}
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: titleTip ? 0 : 8, lineHeight: 1.4 }}>
        Dashboard label — separate from the poster&apos;s main title on the canvas.
      </div>
      {titleTip && (
        <div style={{ fontSize: 13, color: '#89b4fa', lineHeight: 1.4, marginTop: 4, marginBottom: 8 }}>
          {titleTip}
        </div>
      )}

      <div style={labelStyle}>Poster Size</div>
      <select
        value={props.posterSizeKey}
        onChange={(e) => {
          const k = e.target.value;
          if (k !== 'custom') props.onChangePosterSize(k as PosterSizeKey);
        }}
        style={selectStyle}
      >
        {Object.entries(POSTER_SIZES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
        <option value="custom">Custom Size</option>
      </select>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Width (in)</div>
          <input
            type="number"
            value={props.posterWidthIn}
            onChange={(e) => {
              const w = parseFloat(e.target.value);
              if (w > 0) props.onChangeCustomSize(w, props.posterHeightIn);
            }}
            min={10}
            max={100}
            step={0.1}
            style={{ ...inputBase, fontSize: 14, width: '100%' }}
          />
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', marginTop: 16 }}>×</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Height (in)</div>
          <input
            type="number"
            value={props.posterHeightIn}
            onChange={(e) => {
              const h = parseFloat(e.target.value);
              if (h > 0) props.onChangeCustomSize(props.posterWidthIn, h);
            }}
            min={10}
            max={100}
            step={0.1}
            style={{ ...inputBase, fontSize: 14, width: '100%' }}
          />
        </div>
      </div>

      <div style={labelStyle}>Auto Layout</div>
      <button onClick={props.onAutoLayout} style={{ ...buttonStyle(false), fontSize: 14 }}>
        ⬡ Auto-Arrange
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Tidy existing blocks into an even grid — measures each text block's
        actual content height so short sections don't leave empty space.
        Great after dragging things around or after editing a lot of text.
      </div>

      <div style={labelStyle}>Templates</div>
      <div
        style={{
          fontSize: 12,
          color: '#6b7280',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        Pick a starting column layout. Apply anytime — blocks rearrange
        without losing their content.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(LAYOUT_TEMPLATES) as LayoutKey[]).map((k) => {
          const t = LAYOUT_TEMPLATES[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => props.onApplyTemplate(k)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '14px 18px',
                background: '#1a1a26',
                border: '1px solid #2a2a3a',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e2e8' }}>{t.name}</span>
              <span style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.4 }}>{t.description}</span>
            </button>
          );
        })}
      </div>

      <div style={labelStyle}>📐 Canvas overlays</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: '#888', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={props.showGrid}
          onChange={(e) => props.onToggleGrid(e.target.checked)}
          style={{ accentColor: '#7c6aed' }}
        />
        Show grid
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: '#888', cursor: 'pointer', marginTop: 4 }}>
        <input
          type="checkbox"
          checked={props.showRuler}
          onChange={(e) => props.onToggleRuler(e.target.checked)}
          style={{ accentColor: '#7c6aed' }}
        />
        Show ruler
      </label>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Visual aids only — they never print or export.
      </div>

      <div
        style={{
          marginTop: 16,
          padding: '10px 12px',
          borderRadius: 6,
          background: 'rgba(124, 106, 237, 0.08)',
          border: '1px solid rgba(124, 106, 237, 0.25)',
          fontSize: 12,
          color: '#9ca3af',
          lineHeight: 1.55,
        }}
      >
        💡 <strong style={{ color: '#c8b6ff' }}>Done building?</strong> Head to the{' '}
        <strong style={{ color: '#c8b6ff' }}>Export</strong> tab to preview,
        save PDF, print at Staples, or publish to the gallery.
      </div>
    </>
  );
}

// =========================================================================
// Export tab — preview, save PDF, print at Staples, publish
// =========================================================================

function ExportTab(props: {
  onPrint: () => void;
  onPrintAtStaples: () => void;
  onPreview: () => void;
  onPublish: () => void;
}) {
  return (
    <>
      <div style={labelStyle}>Preview</div>
      <button onClick={props.onPreview} style={buttonStyle(false)}>
        👁 Preview poster
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        See the poster at full size without the editor chrome. Great for a
        final sanity check before exporting.
      </div>

      <div style={labelStyle}>Save as PDF</div>
      <button onClick={props.onPrint} style={buttonStyle(true)}>
        ⎙ Save PDF
      </button>
      <div
        style={{
          fontSize: 12,
          color: '#6b7280',
          lineHeight: 1.6,
          marginTop: 8,
          background: '#1a1a26',
          padding: 10,
          borderRadius: 6,
          border: '1px solid #2a2a3a',
        }}
      >
        <strong style={{ color: '#9ca3af' }}>🖨️ Browser Print dialog steps:</strong>
        <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          <li>Click "Save PDF" or press Ctrl+P / Cmd+P</li>
          <li>
            Destination ={' '}
            <strong style={{ color: '#c8cad0' }}>"Save as PDF"</strong>
          </li>
          <li>
            Layout ={' '}
            <strong style={{ color: '#c8cad0' }}>Landscape</strong>{' '}
            (for landscape posters)
          </li>
          <li>
            Margins = <strong style={{ color: '#c8cad0' }}>None</strong>
          </li>
          <li>
            Enable{' '}
            <strong style={{ color: '#c8cad0' }}>"Background graphics"</strong>
          </li>
          <li>Click Save</li>
        </ol>
      </div>

      <div style={labelStyle}>🏪 Print at Staples</div>
      <button
        onClick={props.onPrintAtStaples}
        style={{
          ...buttonStyle(false),
          borderColor: '#cc0000',
          color: '#ff6b6b',
        }}
      >
        🏪 Email to Staples kiosk
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Staples' Print &amp; Go flow — email the PDF, get an 8-digit release
        code, print at any Staples kiosk without a USB drive.
      </div>

      <div style={labelStyle}>↗ Share to gallery</div>
      <button
        onClick={props.onPublish}
        style={{
          ...buttonStyle(false),
          borderColor: '#7c6aed',
          color: '#7c6aed',
        }}
      >
        ↗ Publish to gallery
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Publish to the public gallery at{' '}
        <span style={{ color: '#9ca3af' }}>/gallery</span>. You can retract at
        any time from your Profile → Gallery submissions.
      </div>
    </>
  );
}

// =========================================================================
// Authors tab
// =========================================================================

function AuthorsTab(props: {
  authors: Author[];
  onChangeAuthors: (a: Author[]) => void;
  institutions: Institution[];
  onChangeInstitutions: (i: Institution[]) => void;
  palette: Palette;
  fontFamily: string;
  styles: Styles;
  onAddLogo: () => void;
}) {
  return (
    <>
      <div style={labelStyle}>① Institutions</div>
      <InstitutionManager institutions={props.institutions} onChange={props.onChangeInstitutions} />

      <div style={{ ...labelStyle, marginTop: 28 }}>② Authors</div>
      <AuthorManager authors={props.authors} onChange={props.onChangeAuthors} institutions={props.institutions} />

      {props.authors.filter((a) => a.name).length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: '16px 18px',
            background: '#14141e',
            border: '1px solid #222',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Preview</div>
          <AuthorLine
            authors={props.authors}
            institutions={props.institutions}
            palette={props.palette}
            fontFamily={props.fontFamily}
            styles={props.styles}
          />
        </div>
      )}

      <div style={{ ...labelStyle, marginTop: 28 }}>Logos</div>
      <button onClick={props.onAddLogo} style={buttonStyle(false)}>
        + Logo
      </button>
    </>
  );
}

function InstitutionManager(props: { institutions: Institution[]; onChange: (i: Institution[]) => void }) {
  const update = (id: string, patch: Partial<Institution>) =>
    props.onChange(props.institutions.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => props.onChange(props.institutions.filter((x) => x.id !== id));
  const add = () =>
    props.onChange([...props.institutions, { id: `i${nanoid(6)}`, name: '', dept: '', location: '' }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {props.institutions.map((inst, i) => (
        <div key={inst.id} style={{ background: '#14141e', border: '1px solid #222', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: '#7c6aed22',
                border: '1px solid #7c6aed44',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                color: '#7c6aed',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <input
              value={inst.name}
              onChange={(e) => update(inst.id, { name: e.target.value })}
              placeholder="University"
              style={{ ...inputBase, fontSize: 17, fontWeight: 600, color: '#eee' }}
            />
            <button
              onClick={() => remove(inst.id)}
              style={{ all: 'unset', cursor: 'pointer', color: '#c55', fontSize: 18, fontWeight: 700 }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={inst.dept ?? ''}
              onChange={(e) => update(inst.id, { dept: e.target.value })}
              placeholder="Department"
              style={{ ...inputBase, flex: 1 }}
            />
            <input
              value={inst.location ?? ''}
              onChange={(e) => update(inst.id, { location: e.target.value })}
              placeholder="City"
              style={{ ...inputBase, flex: 1 }}
            />
          </div>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '10px 0',
          fontSize: 15,
          color: '#7c6aed',
          fontWeight: 600,
          textAlign: 'center',
          border: '1px dashed #333',
          borderRadius: 4,
        }}
      >
        + Add Institution
      </button>
    </div>
  );
}

function AuthorManager(props: { authors: Author[]; onChange: (a: Author[]) => void; institutions: Institution[] }) {
  const update = (id: string, patch: Partial<Author>) =>
    props.onChange(props.authors.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => props.onChange(props.authors.filter((x) => x.id !== id));
  const swap = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= props.authors.length || j >= props.authors.length) return;
    const next = [...props.authors];
    [next[i], next[j]] = [next[j]!, next[i]!];
    props.onChange(next);
  };
  const add = () =>
    props.onChange([
      ...props.authors,
      { id: `a${nanoid(6)}`, name: '', affiliationIds: [], isCorresponding: false, equalContrib: false },
    ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {props.authors.map((a, i) => (
        <div key={a.id} style={{ background: '#14141e', border: '1px solid #222', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <button
                onClick={() => swap(i - 1, i)}
                style={{ all: 'unset', cursor: 'pointer', color: i > 0 ? '#666' : '#2a2a3a', fontSize: 13 }}
              >
                ▲
              </button>
              <button
                onClick={() => swap(i, i + 1)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  color: i < props.authors.length - 1 ? '#666' : '#2a2a3a',
                  fontSize: 13,
                }}
              >
                ▼
              </button>
            </div>
            <input
              value={a.name}
              onChange={(e) => update(a.id, { name: e.target.value })}
              placeholder="Author name"
              style={{ ...inputBase, flex: 1, fontSize: 17 }}
            />
            <button
              onClick={() => remove(a.id)}
              style={{ all: 'unset', cursor: 'pointer', color: '#c55', fontSize: 18, fontWeight: 700 }}
            >
              ×
            </button>
          </div>
          {props.institutions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, paddingLeft: 16 }}>
              {props.institutions.map((inst, idx) => {
                const checked = a.affiliationIds.includes(inst.id);
                return (
                  <button
                    key={inst.id}
                    onClick={() =>
                      update(a.id, {
                        affiliationIds: checked
                          ? a.affiliationIds.filter((z) => z !== inst.id)
                          : [...a.affiliationIds, inst.id],
                      })
                    }
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 14,
                      background: checked ? '#7c6aed22' : '#1a1a26',
                      border: `1px solid ${checked ? '#7c6aed66' : '#2a2a3a'}`,
                      color: checked ? '#b8a8ff' : '#666',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{idx + 1}</span>
                    <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inst.name || '?'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingLeft: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9ca3af', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={a.isCorresponding}
                onChange={(e) => update(a.id, { isCorresponding: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: '#7c6aed' }}
              />
              Corresponding
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9ca3af', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={a.equalContrib}
                onChange={(e) => update(a.id, { equalContrib: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: '#7c6aed' }}
              />
              Equal contrib.
            </label>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '10px 0',
          fontSize: 15,
          color: '#7c6aed',
          fontWeight: 600,
          textAlign: 'center',
          border: '1px dashed #333',
          borderRadius: 4,
        }}
      >
        + Add Author
      </button>
    </div>
  );
}

// =========================================================================
// Refs tab
// =========================================================================

function RefsTab(props: {
  references: Reference[];
  onChangeReferences: (r: Reference[]) => void;
  citationStyle: CitationStyleKey;
  onChangeCitationStyle: (s: CitationStyleKey) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [manual, setManual] = useState({ authors: '', year: '', title: '', journal: '' });
  const [pasteText, setPasteText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  /**
   * Split a pasted references block into individual citation strings.
   * Handles two common cases users paste from manuscripts:
   *   1. Blank line separated — `a.\n\nb.\n\nc.` → ['a.', 'b.', 'c.']
   *   2. One ref per line   — `a.\nb.\nc.`      → ['a.', 'b.', 'c.']
   * If there are blank lines anywhere, we use those as the delimiter
   * (preserves multi-line refs). Otherwise every non-empty line
   * becomes its own reference.
   */
  const splitPastedRefs = (text: string): string[] => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const hasBlankLines = /\n\s*\n/.test(trimmed);
    const raw = hasBlankLines
      ? trimmed.split(/\n\s*\n+/)
      : trimmed.split(/\n+/);
    return raw
      .map((s) => s.trim().replace(/^\d+[.)]\s*/, '')) // strip "1." or "1)" prefixes
      .filter((s) => s.length > 0);
  };

  const addPasted = () => {
    const chunks = splitPastedRefs(pasteText);
    if (!chunks.length) {
      setPasteFeedback('Paste some references first.');
      setTimeout(() => setPasteFeedback(null), 2500);
      return;
    }
    const added: Reference[] = chunks.map((raw) => ({
      id: nanoid(8),
      authors: [],
      rawText: raw,
    }));
    props.onChangeReferences([...props.references, ...added]);
    setPasteText('');
    setPasteFeedback(
      `✓ Added ${added.length} reference${added.length === 1 ? '' : 's'}.`,
    );
    setTimeout(() => setPasteFeedback(null), 2500);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      let parsed = parseBibtex(text);
      if (!parsed.length) parsed = parseRis(text);
      if (parsed.length) props.onChangeReferences([...props.references, ...parsed]);
    };
    reader.readAsText(f);
  };

  const addManual = () => {
    if (!manual.title.trim()) return;
    props.onChangeReferences([
      ...props.references,
      {
        id: nanoid(8),
        authors: manual.authors.split(',').map((a) => a.trim()).filter(Boolean),
        year: manual.year,
        title: manual.title,
        journal: manual.journal,
        doi: '',
      },
    ]);
    setManual({ authors: '', year: '', title: '', journal: '' });
  };

  const sel: CSSProperties = {
    ...inputBase,
    appearance: 'none',
    padding: '10px 36px 10px 14px',
    backgroundImage: SELECT_ARROW,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '16px 16px',
  };
  const miniLabel: CSSProperties = {
    fontSize: 13,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  };

  return (
    <>
      <div style={labelStyle}>Import</div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 18px',
          background: '#7c6aed',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        Import .bib / .ris / .enw
      </button>
      <input ref={fileRef} type="file" accept=".bib,.bibtex,.ris,.enw" onChange={handleImport} style={{ display: 'none' }} />

      <div style={{ ...labelStyle, marginTop: 28 }}>Display</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ ...miniLabel, width: 48 }}>Style</label>
          <select
            value={props.citationStyle}
            onChange={(e) => props.onChangeCitationStyle(e.target.value as CitationStyleKey)}
            style={{ ...sel, flex: 1 }}
          >
            {(Object.keys(CITATION_STYLES) as CitationStyleKey[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {props.references.length > 0 && (
        <>
          <div style={{ ...labelStyle, marginTop: 28 }}>References ({props.references.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {props.references.map((r, i) => (
              <div
                key={r.id ?? i}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '12px 14px',
                  background: '#14141e',
                  border: '1px solid #222',
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 13, color: '#c8cad0', flex: 1, lineHeight: 1.5 }}>
                  {CITATION_STYLES[props.citationStyle](r, i)}
                </span>
                <button
                  type="button"
                  onClick={() => props.onChangeReferences(props.references.filter((_, j) => j !== i))}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 18, color: '#c55', lineHeight: 1, padding: 2 }}
                  aria-label="Remove reference"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...labelStyle, marginTop: 28 }}>Paste from Manuscript</div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
        Already have your references formatted in a paper? Paste the whole
        block here — one per line, or separated by blank lines. Each
        entry is stored verbatim and rendered exactly as pasted, so your
        existing APA / Vancouver / in-house formatting is preserved.
      </p>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder={
          'Smith, J. (2023). Example paper title. Journal of Examples, 12(3), 42–69.\nDoe, A., & Roe, B. (2024). Another paper title. Journal of Samples, 8(1), 1–14.'
        }
        spellCheck={false}
        style={{
          ...inputBase,
          minHeight: 120,
          resize: 'vertical',
          fontFamily:
            'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: 'pre',
        }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={addPasted}
          disabled={!pasteText.trim()}
          style={{
            all: 'unset',
            cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
            padding: '10px 16px',
            background: pasteText.trim() ? '#7c6aed' : '#2a2a3a',
            color: pasteText.trim() ? '#fff' : '#6b7280',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
            opacity: pasteText.trim() ? 1 : 0.6,
          }}
        >
          Parse & add
        </button>
        {pasteFeedback && (
          <span style={{ fontSize: 13, color: '#a6e3a1' }}>{pasteFeedback}</span>
        )}
      </div>

      <div style={{ ...labelStyle, marginTop: 28 }}>Manual Entry</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={manual.authors}
          onChange={(e) => setManual({ ...manual, authors: e.target.value })}
          placeholder="Authors (Last, F., comma-separated)"
          style={inputBase}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={manual.year}
            onChange={(e) => setManual({ ...manual, year: e.target.value })}
            placeholder="Year"
            style={{ ...inputBase, width: '32%' }}
          />
          <input
            value={manual.journal}
            onChange={(e) => setManual({ ...manual, journal: e.target.value })}
            placeholder="Journal"
            style={{ ...inputBase, flex: 1 }}
          />
        </div>
        <input
          value={manual.title}
          onChange={(e) => setManual({ ...manual, title: e.target.value })}
          placeholder="Title"
          style={inputBase}
        />
        <button
          type="button"
          onClick={addManual}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '12px 0',
            background: '#1a1a26',
            color: '#c8b6ff',
            border: '1px dashed #7c6aed55',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
            display: 'block',
          }}
        >
          + Add Reference
        </button>
      </div>
    </>
  );
}

// =========================================================================
// Style tab
// =========================================================================

function StyleTab(props: {
  paletteName: string;
  onChangePalette: (palette: Palette, name: string) => void;
  fontFamily: string;
  onChangeFont: (f: string) => void;
  styles: Styles;
  onChangeStyles: (s: Styles) => void;
  headingStyle: HeadingStyle;
  onChangeHeadingStyle: (hs: HeadingStyle) => void;
  savedPresets: StylePreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: StylePreset) => void;
  customPalettes: NamedPalette[];
  onCreateCustomPalette: () => void;
  onEditCustomPalette: (name: string) => void;
  onDeleteCustomPalette: (name: string) => void;
  presetName: string;
  setPresetName: (n: string) => void;
  /** True for ~1.6s after a preset was just saved — flips the Save
   *  button into a green "✓ Saved!" state so users get explicit
   *  confirmation that their click worked. */
  presetJustSaved: boolean;
}) {
  const renderPaletteRow = (p: NamedPalette, isCustom: boolean) => {
    const active = props.paletteName === p.name;
    const cb = auditPaletteCB(p);
    return (
      <div
        key={`${isCustom ? 'custom-' : 'builtin-'}${p.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: active ? '#7c6aed18' : '#1a1a26',
          border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
          borderRadius: 8,
          boxSizing: 'border-box',
          padding: '4px 4px 4px 14px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            const { name, ...palette } = p;
            props.onChangePalette(palette, name);
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 0',
          }}
        >
          <div style={{ display: 'flex', gap: 3 }}>
            {[p.bg, p.primary, p.accent, p.accent2].map((c, j) => (
              <div
                key={j}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: c,
                  border: '1px solid #2a2a3a',
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: active ? '#c8b6ff' : '#e2e2e8',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {p.name}
            {isCustom && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#a78bfa',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                custom
              </span>
            )}
            {!cb.safe && (
              <span
                title={`Under ${cb.worstPair.type}, "${cb.worstPair.a}" and "${cb.worstPair.b}" may look alike (ΔE ${cb.minDistance.toFixed(0)}).`}
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: '#e2a550',
                }}
                aria-label="Not colorblind-safe"
              >
                ◐
              </span>
            )}
          </span>
        </button>
        {isCustom && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                props.onEditCustomPalette(p.name);
              }}
              title="Edit palette"
              style={iconBtnStyle}
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(`Delete custom palette "${p.name}"? This cannot be undone.`)
                ) {
                  props.onDeleteCustomPalette(p.name);
                }
              }}
              title="Delete palette"
              style={iconBtnStyle}
            >
              🗑️
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={labelStyle}>Palette</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PALETTES.map((p) => renderPaletteRow(p, false))}

        {props.customPalettes.length > 0 && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              color: '#6b7280',
              marginTop: 6,
              paddingLeft: 2,
            }}
          >
            Your palettes
          </div>
        )}
        {props.customPalettes.map((p) => renderPaletteRow(p, true))}

        <button
          type="button"
          onClick={props.onCreateCustomPalette}
          style={{
            all: 'unset',
            cursor: 'pointer',
            marginTop: 4,
            padding: '10px 14px',
            background: 'linear-gradient(135deg, #7c6aed22 0%, #a855f722 100%)',
            border: '1px dashed #7c6aed',
            borderRadius: 8,
            textAlign: 'center',
            color: '#c8b6ff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ➕ Create custom palette
        </button>
        <div
          style={{
            fontSize: 11,
            color: '#6b7280',
            lineHeight: 1.5,
            marginTop: 2,
            paddingLeft: 2,
          }}
        >
          Build your own with color-theory randomizer, paste from Coolors,
          or extract from an image.
        </div>
      </div>

      <div style={labelStyle}>Font</div>
      <select value={props.fontFamily} onChange={(e) => props.onChangeFont(e.target.value)} style={selectStyle}>
        <optgroup label="Sans">
          {Object.entries(FONTS)
            .filter(([, v]) => v.cat === 'sans')
            .map(([k]) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
        </optgroup>
        <optgroup label="Serif">
          {Object.entries(FONTS)
            .filter(([, v]) => v.cat === 'serif')
            .map(([k]) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
        </optgroup>
      </select>

      <div style={labelStyle}>Typography</div>
      <StyleEditor styles={props.styles} onChange={props.onChangeStyles} />

      <div style={labelStyle}>Headings</div>
      <HeadingEditor headingStyle={props.headingStyle} onChange={props.onChangeHeadingStyle} />

      <div style={labelStyle}>🎨 Save as style preset</div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.55, marginBottom: 8 }}>
        Name your current font + palette + typography combo to reuse it on your next poster. Manage saved presets from your <strong style={{ color: '#9ca3af' }}>Profile → Preferences</strong>.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={props.presetName}
          onChange={(e) => props.setPresetName(e.target.value)}
          placeholder="e.g. Kenji Lab Green"
          style={{ ...inputBase, flex: 1, padding: '12px 14px', fontSize: 14 }}
        />
        <button
          type="button"
          onClick={() => {
            if (props.presetName.trim()) {
              props.onSavePreset(props.presetName.trim());
              props.setPresetName('');
            }
          }}
          style={{
            ...buttonStyle(true),
            width: 'auto',
            padding: '12px 18px',
            fontSize: 14,
            background: props.presetJustSaved ? '#2d6a4f' : '#7c6aed',
            transition: 'background 200ms ease',
          }}
        >
          {props.presetJustSaved ? '✓ Saved!' : '💾 Save'}
        </button>
      </div>
      {props.savedPresets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {props.savedPresets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => props.onLoadPreset(p)}
              style={{ ...buttonStyle(false), fontSize: 14, textAlign: 'left', padding: '12px 16px' }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function StyleEditor(props: { styles: Styles; onChange: (s: Styles) => void }) {
  const levels: Array<{ k: keyof Styles; l: string }> = [
    { k: 'title', l: 'Title' },
    { k: 'heading', l: 'Heading' },
    { k: 'authors', l: 'Authors' },
    { k: 'body', l: 'Body' },
  ];
  const update = (k: keyof Styles, field: string, value: number | boolean) =>
    props.onChange({ ...props.styles, [k]: { ...props.styles[k], [field]: value } });

  const inp: CSSProperties = {
    ...inputBase,
    width: 60,
    textAlign: 'center',
    padding: '10px 10px',
    fontSize: 14,
  };
  const miniLabel: CSSProperties = {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {levels.map((t) => (
        <div key={t.k}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{t.l}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                // Show/accept POINTS in the UI; store poster units underneath.
                value={Math.round(unitsToPt(props.styles[t.k].size))}
                onChange={(e) => update(t.k, 'size', ptToUnits(+e.target.value))}
                min={12}
                max={200}
                step={2}
                style={inp}
                title="Font size (points)"
              />
              <span style={miniLabel}>pt</span>
            </div>
            <select
              value={props.styles[t.k].weight}
              onChange={(e) => update(t.k, 'weight', +e.target.value)}
              style={{ ...inp, width: 80, appearance: 'auto' }}
            >
              {FONT_WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => update(t.k, 'italic', !props.styles[t.k].italic)}
              aria-pressed={props.styles[t.k].italic}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                fontSize: 17,
                fontWeight: 700,
                fontStyle: 'italic',
                fontFamily: 'Georgia, serif',
                background: props.styles[t.k].italic ? '#7c6aed22' : '#1a1a26',
                border: `1px solid ${props.styles[t.k].italic ? '#7c6aed' : '#2a2a3a'}`,
                color: props.styles[t.k].italic ? '#c8b6ff' : '#9ca3af',
                boxSizing: 'border-box',
              }}
            >
              I
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={miniLabel}>LH</span>
              <input
                type="number"
                value={props.styles[t.k].lineHeight.toFixed(2)}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(3, +e.target.value || 1));
                  update(t.k, 'lineHeight', v);
                }}
                min={1}
                max={3}
                step={0.05}
                style={{ ...inp, width: 66 }}
                title="Line height (1.0–3.0)"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeadingEditor(props: { headingStyle: HeadingStyle; onChange: (hs: HeadingStyle) => void }) {
  const update = (patch: Partial<HeadingStyle>) => props.onChange({ ...props.headingStyle, ...patch });

  const pillBtn = (active: boolean): CSSProperties => ({
    all: 'unset',
    cursor: 'pointer',
    padding: '10px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    background: active ? '#7c6aed22' : '#1a1a26',
    border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
    color: active ? '#c8b6ff' : '#9ca3af',
    boxSizing: 'border-box',
    textAlign: 'center',
  });

  const borderBtn = (v: HeadingStyle['border'], label: string) => (
    <button key={v} type="button" onClick={() => update({ border: v })} style={pillBtn(props.headingStyle.border === v)}>
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Border
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {borderBtn('none', 'None')}
          {borderBtn('bottom', 'Bottom')}
          {borderBtn('left', 'Left')}
          {borderBtn('box', 'Box')}
          {borderBtn('thick', 'Thick')}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Alignment
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {(['left', 'center'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => update({ align: a })}
              style={{ ...pillBtn(props.headingStyle.align === a), textTransform: 'capitalize' }}
            >
              {a}
            </button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9ca3af', cursor: 'pointer', marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={props.headingStyle.fill}
              onChange={(e) => update({ fill: e.target.checked })}
              style={{ accentColor: '#7c6aed', width: 14, height: 14 }}
            />
            Fill
          </label>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Edit tab — selected block + add block buttons
// =========================================================================

function EditTab(props: {
  selectedBlock: Block | null;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
  palette: Palette;
  styles: Styles;
  onChangeStyles: (s: Styles) => void;
}) {
  const sb = props.selectedBlock;
  const isTextLike = sb && ['text', 'heading', 'title'].includes(sb.type);
  const typeKey: keyof Styles | null = !sb
    ? null
    : sb.type === 'title'
      ? 'title'
      : sb.type === 'heading'
        ? 'heading'
        : sb.type === 'text'
          ? 'body'
          : null;
  const styleLevel = typeKey ? props.styles[typeKey] : null;

  const updateStyle = (field: string, value: number | boolean | string | null) => {
    if (!typeKey || !styleLevel) return;
    props.onChangeStyles({ ...props.styles, [typeKey]: { ...styleLevel, [field]: value } });
  };

  return (
    <>
      {sb && sb.type === 'table' ? (
        <>
          <TableTipsDropdown />
          <div style={{ height: 12 }} />
          <CaptionEditor
            block={sb}
            label="Table"
            onUpdateBlock={props.onUpdateBlock}
          />
          <div style={{ height: 18 }} />
          <TableEditor block={sb} onUpdateBlock={props.onUpdateBlock} />
        </>
      ) : sb && sb.type === 'image' ? (
        <CaptionEditor
          block={sb}
          label="Figure"
          onUpdateBlock={props.onUpdateBlock}
        />
      ) : sb && isTextLike && styleLevel ? (
        <TextBlockEditor
          block={sb}
          styleLevel={styleLevel}
          palette={props.palette}
          onUpdateBlock={props.onUpdateBlock}
          onUpdateStyle={updateStyle}
        />
      ) : (
        <div style={{ fontSize: 14, color: '#8a8a95', padding: '16px 0', lineHeight: 1.5 }}>
          Click a text, table, or image block on the canvas to edit it
          here, or switch to the{' '}
          <span style={{ color: '#c8b6ff' }}>Insert</span> tab to add a
          new one. Open the{' '}
          <span style={{ color: '#c8b6ff' }}>Plot Code Check</span> tab
          to analyze figure readability.
        </div>
      )}
    </>
  );
}

// =========================================================================
// TableTipsDropdown — collapsed-by-default tips for table editing
// =========================================================================
//
// Sits at the very top of the Edit tab when a table block is selected.
// Uses native <details>/<summary> so it persists open/closed state
// implicitly per render and adds zero JS state. Closed by default
// because returning users don't need the reminder every time.

function TableTipsDropdown() {
  return (
    <details
      style={{
        background: '#1a1a26',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        color: '#8a8a95',
        lineHeight: 1.5,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          color: '#c8cad0',
          fontWeight: 700,
          listStyle: 'revert',
          userSelect: 'none',
        }}
      >
        💡 Tips for editing tables
      </summary>
      <ul style={{ margin: '8px 0 4px', paddingLeft: 18 }}>
        <li>✏️ Click any cell on the canvas to type directly.</li>
        <li>🖱️ Click a row/column header strip to select the whole row or column.</li>
        <li>📋 Paste TSV from Word, Excel, or Google Sheets into any cell — the grid auto-grows.</li>
        <li>↔️ Drag column borders to resize.</li>
        <li>🗑️ Select a row/column and press Delete to remove it.</li>
        <li>⌨️ Tab / Shift+Tab to jump between cells.</li>
        <li>✨ Type <code>**bold**</code>, <code>*italic*</code>, or <code>M (SD)*</code> in a cell, then click <b>Format table</b> in the Caption section below.</li>
      </ul>
    </details>
  );
}

// =========================================================================
// CaptionEditor — figure/table caption + position controls
// =========================================================================
//
// Rendered in the Edit tab for image and table blocks. The numbering
// prefix ("Figure 1.", "Table 2.") is auto-computed from the block's
// reading-order rank and displayed read-only alongside the input.
// Users only type the descriptive text and pick a position (top /
// bottom / left / right / none). Dragging blocks on the canvas
// automatically re-ranks the numbers, so there's no manual reorder
// list.

function CaptionEditor(props: {
  block: Block;
  label: 'Figure' | 'Table';
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
}) {
  const { block, label, onUpdateBlock } = props;
  const position = block.captionPosition ?? 'bottom';
  // Transient "✓ Formatted" pulse so the click is clearly acknowledged
  // even when the textarea shows the same plain text after re-strip.
  const [justFormatted, setJustFormatted] = useState(false);
  const formatPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (formatPulseTimerRef.current) clearTimeout(formatPulseTimerRef.current);
  }, []);
  // Compute what each field would become after APA auto-format.
  // Derived so we always know whether a click would change anything —
  // drives both the patch (on click) and the "dirty" pulse (on render).
  const formattedCaption = autoFormatAPA(block.caption ?? '');
  const formattedNote = autoFormatAPA(block.note ?? '');
  const formattedCells =
    block.type === 'table' && block.tableData
      ? block.tableData.cells.map((cell) => autoFormatAPA(cell ?? ''))
      : null;

  // Dirty = at least one field would change. `M` → `<em>M</em>` etc.
  const isDirty =
    formattedCaption !== (block.caption ?? '') ||
    formattedNote !== (block.note ?? '') ||
    (formattedCells != null &&
      block.tableData != null &&
      formattedCells.some((c, i) => c !== (block.tableData!.cells[i] ?? '')));

  const handleFormat = () => {
    const patch: Partial<Block> = {
      caption: formattedCaption,
      note: formattedNote,
    };
    if (formattedCells && block.tableData) {
      patch.tableData = {
        ...block.tableData,
        cells: formattedCells,
      };
    }
    onUpdateBlock(block.id, patch);
    setJustFormatted(true);
    if (formatPulseTimerRef.current) clearTimeout(formatPulseTimerRef.current);
    formatPulseTimerRef.current = setTimeout(() => setJustFormatted(false), 1400);
  };
  const positions: Array<{
    key: NonNullable<Block['captionPosition']>;
    label: string;
  }> = [
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
    { key: 'none', label: 'Hide' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={labelStyle}>{label} Caption</div>
      <p style={{ fontSize: 13, color: '#8a8a95', margin: 0, lineHeight: 1.5 }}>
        The <b>{label} N.</b> number is assigned automatically from
        reading order — drag this block on the canvas to renumber.
        Just type the descriptive text below.
      </p>
      <input
        type="text"
        value={stripHtmlToPlainText(block.caption ?? '')}
        onChange={(e) =>
          onUpdateBlock(block.id, { caption: e.target.value })
        }
        placeholder={`${label.toLowerCase()} description…`}
        style={inputBase}
      />
      <div style={{ fontSize: 13, color: '#8a8a95' }}>Caption position</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 6,
        }}
      >
        {positions.map(({ key, label: pLabel }) => (
          <button
            key={key}
            type="button"
            onClick={() => onUpdateBlock(block.id, { captionPosition: key })}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              background: position === key ? '#7c6aed' : '#1a1a26',
              color: position === key ? '#fff' : '#c8cad0',
              border: `1px solid ${position === key ? '#9d87ff' : '#2a2a3a'}`,
              transition:
                'background 150ms ease, border-color 150ms ease, color 150ms ease',
            }}
          >
            {pLabel}
          </button>
        ))}
      </div>
      {/* Caption gap slider — lets the user tighten or loosen the
          breathing room between the caption and the figure/table
          content without touching any other spacing. Only relevant
          when a caption is actually visible, so we hide the row
          entirely when position === 'none'. */}
      {position !== 'none' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              color: '#8a8a95',
            }}
          >
            <span>Caption spacing</span>
            <span style={{ color: '#c8cad0', fontWeight: 600 }}>
              {block.captionGap ?? 0} px
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={block.captionGap ?? 0}
            onChange={(e) =>
              onUpdateBlock(block.id, {
                captionGap: Number(e.target.value),
              })
            }
            style={{ width: '100%' }}
          />
        </>
      )}

      {/* ── Note (plain text — auto-formatter handles italics) ── */}
      <div style={{ ...labelStyle, marginTop: 8 }}>{label} Note</div>
      <p style={{ fontSize: 13, color: '#8a8a95', margin: 0, lineHeight: 1.5 }}>
        Longer footnote shown directly below the {label.toLowerCase()}.
        Just paste or type normally — clicking{' '}
        <b>✨ Format {label === 'Table' ? 'table' : 'note'}</b> auto-italicizes
        APA stat symbols (<code>p</code>, <code>t</code>, <code>F</code>,{' '}
        <code>M</code>, <code>SD</code>, <code>N</code>, <code>r</code>,{' '}
        <code>df</code>, <code>β</code>, <code>χ²</code>, …) in the caption,
        note, and every cell.
      </p>
      {/* Button is above the textarea so it's always in view when
          the Edit tab opens — used to live at the bottom below the
          tip, which put it below the sidebar fold for tables. */}
      <button
        type="button"
        onClick={handleFormat}
        disabled={!isDirty && !justFormatted}
        style={{
          all: 'unset',
          cursor: isDirty || justFormatted ? 'pointer' : 'default',
          alignSelf: 'flex-start',
          padding: '10px 16px',
          background: justFormatted
            ? '#2ea27a'
            : isDirty
              ? '#7c6aed'
              : '#2a2a3a',
          color: justFormatted || isDirty ? '#fff' : '#8a8a95',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          transition: 'background 180ms ease, color 180ms ease',
          animation: isDirty && !justFormatted
            ? 'postr-dimension-pulse 1.6s ease-in-out infinite'
            : 'none',
        }}
      >
        {justFormatted
          ? `✓ Formatted ${label === 'Table' ? 'table' : 'note'}`
          : isDirty
            ? `✨ Format ${label === 'Table' ? 'table' : 'note'}`
            : `✓ ${label === 'Table' ? 'Table' : 'Note'} formatted`}
      </button>
      <textarea
        value={stripHtmlToPlainText(block.note ?? '')}
        onChange={(e) => onUpdateBlock(block.id, { note: e.target.value })}
        placeholder={
          label === 'Figure'
            ? 'Error bars show 95% CI. **p** < .01.'
            : '*Note.* *p* < .05. SD in parentheses.'
        }
        style={{
          ...inputBase,
          minHeight: 72,
          resize: 'vertical',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      />
      <p
        style={{
          fontSize: 12,
          color: '#8a8a95',
          margin: 0,
          lineHeight: 1.5,
          background: '#fff7d6',
          border: '1px solid #f1e3a3',
          borderRadius: 6,
          padding: '8px 10px',
        }}
      >
        💡 <b>Tip:</b> after typing markers like{' '}
        <code>**bold**</code> or <code>*p*</code>
        {label === 'Table' ? ' in the note or in any cell' : ''}, click{' '}
        <b>✨ Format {label === 'Table' ? 'table' : 'note'}</b> to convert
        them into bold / italic / superscript on the poster. Re-click
        anytime — it's safe to run more than once.
      </p>
    </div>
  );
}

// =========================================================================
// TableEditor — sidebar panel for the selected table block
// =========================================================================
//
// Replaces the inline toolbar that used to live under every table on the
// canvas (border preset buttons, +Row / +Col / −Row / −Col). Same set of
// operations, same underlying helpers — just relocated so selecting a
// table always routes its controls through the sidebar.

function TableEditor(props: {
  block: Block;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
}) {
  const { block, onUpdateBlock } = props;
  const data: TableData = block.tableData ?? DEFAULT_TABLE_DATA;
  const commit = (next: TableData) => onUpdateBlock(block.id, { tableData: next });

  const tblBtn: CSSProperties = {
    all: 'unset',
    cursor: 'pointer',
    width: 32,
    height: 32,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    background: '#1a1a26',
    border: '1px solid #2a2a3a',
    color: '#c8cad0',
  };

  const tblBtnDanger: CSSProperties = {
    ...tblBtn,
    color: '#f87171',
    borderColor: '#3a1f20',
    fontSize: 14,
  };

  const tblBtnDisabled: CSSProperties = {
    ...tblBtnDanger,
    opacity: 0.3,
    cursor: 'not-allowed',
  };

  // Default custom border values — starts as an APA-ish 3-line
  // layout so flipping to Custom doesn't wipe visible borders.
  // innerH / innerV are variable-length arrays sized off the
  // current rows/cols; we pad them with `false` so stored
  // tables that pre-date this schema still render cleanly.
  const rawCustomBorder: NonNullable<TableData['customBorder']> =
    data.customBorder ?? {
      topLine: true,
      bottomLine: true,
      leftLine: false,
      rightLine: false,
      headerLine: true,
      headerBox: false,
      innerH: [],
      innerV: [],
    };
  // Pad / truncate inner arrays so they exactly match the
  // current dimensions. innerH needs (rows - 2) entries
  // (gaps below row 1 through row rows-2, with row 0 being
  // the header and row rows-1 being the last body row).
  // innerV needs (cols - 1) entries (gaps between columns).
  const padArr = (arr: boolean[] | undefined, len: number) => {
    const out = Array(Math.max(0, len)).fill(false) as boolean[];
    (arr ?? []).slice(0, len).forEach((v, i) => (out[i] = !!v));
    return out;
  };
  const customBorder: NonNullable<TableData['customBorder']> = {
    ...rawCustomBorder,
    innerH: padArr(rawCustomBorder.innerH, Math.max(0, data.rows - 2)),
    innerV: padArr(rawCustomBorder.innerV, Math.max(0, data.cols - 1)),
  };
  const isCustom = data.borderPreset === 'custom';

  // Derive the border layout the canvas is ACTUALLY rendering right
  // now so the mockup is always truthful — when on a named preset
  // (APA 3-Line, All Lines, etc.) we project that preset's flags
  // into the per-edge customBorder shape; in custom mode we use
  // the user's stored toggles directly. Clicking any line in the
  // mockup commits this projection as the new custom state, so the
  // user can switch from "APA 3-Line" to a tweaked variant in one
  // click without losing the starting layout.
  const activePreset =
    !isCustom ? TABLE_BORDER_PRESETS[data.borderPreset] ?? null : null;
  const displayBorder: NonNullable<TableData['customBorder']> = activePreset
    ? {
        topLine: activePreset.topLine || activePreset.outerBorder,
        bottomLine: activePreset.bottomLine || activePreset.outerBorder,
        leftLine: activePreset.outerBorder,
        rightLine: activePreset.outerBorder,
        headerLine: activePreset.headerLine,
        headerBox: activePreset.headerBox,
        innerH: Array(Math.max(0, data.rows - 2)).fill(activePreset.horizontalLines),
        innerV: Array(Math.max(0, data.cols - 1)).fill(activePreset.verticalLines),
      }
    : customBorder;

  const commitCustomBorder = (
    patch: Partial<NonNullable<TableData['customBorder']>>,
  ) => {
    // Branch off the displayed layout (preset projection or stored
    // custom) so the very first click in the mockup preserves the
    // user's starting state instead of snapping to APA defaults.
    commit({
      ...data,
      borderPreset: 'custom',
      customBorder: { ...displayBorder, ...patch },
    });
  };
  const toggleCustomEdge = (
    key: keyof NonNullable<TableData['customBorder']>,
  ) => {
    if (key === 'innerH' || key === 'innerV') return; // handled per-index
    commitCustomBorder({ [key]: !displayBorder[key] });
  };
  const toggleInnerH = (i: number) => {
    const next = [...displayBorder.innerH];
    next[i] = !next[i];
    commitCustomBorder({ innerH: next });
  };
  const toggleInnerV = (i: number) => {
    const next = [...displayBorder.innerV];
    next[i] = !next[i];
    commitCustomBorder({ innerV: next });
  };
  /**
   * Bulk-preset helpers for the button row beneath the mockup.
   * Each button rewrites the full customBorder so the user can
   * reset to a known baseline without having to click 20 edges.
   */
  const applyBulkPreset = (kind: 'all' | 'none' | 'outer' | 'inner' | 'hOnly' | 'vOnly' | 'apa') => {
    const innerHLen = Math.max(0, data.rows - 2);
    const innerVLen = Math.max(0, data.cols - 1);
    const fill = (len: number, v: boolean) => Array(len).fill(v) as boolean[];
    switch (kind) {
      case 'all':
        commitCustomBorder({
          topLine: true, bottomLine: true, leftLine: true, rightLine: true,
          headerLine: true, headerBox: false,
          innerH: fill(innerHLen, true),
          innerV: fill(innerVLen, true),
        });
        return;
      case 'none':
        commitCustomBorder({
          topLine: false, bottomLine: false, leftLine: false, rightLine: false,
          headerLine: false, headerBox: false,
          innerH: fill(innerHLen, false),
          innerV: fill(innerVLen, false),
        });
        return;
      case 'outer':
        commitCustomBorder({
          topLine: true, bottomLine: true, leftLine: true, rightLine: true,
          headerLine: false, headerBox: false,
          innerH: fill(innerHLen, false),
          innerV: fill(innerVLen, false),
        });
        return;
      case 'inner':
        commitCustomBorder({
          topLine: false, bottomLine: false, leftLine: false, rightLine: false,
          headerLine: true, headerBox: false,
          innerH: fill(innerHLen, true),
          innerV: fill(innerVLen, true),
        });
        return;
      case 'hOnly':
        commitCustomBorder({
          topLine: false, bottomLine: false, leftLine: false, rightLine: false,
          headerLine: true, headerBox: false,
          innerH: fill(innerHLen, true),
          innerV: fill(innerVLen, false),
        });
        return;
      case 'vOnly':
        commitCustomBorder({
          topLine: false, bottomLine: false, leftLine: false, rightLine: false,
          headerLine: false, headerBox: false,
          innerH: fill(innerHLen, false),
          innerV: fill(innerVLen, true),
        });
        return;
      case 'apa':
        commitCustomBorder({
          topLine: true, bottomLine: true, leftLine: false, rightLine: false,
          headerLine: true, headerBox: false,
          innerH: fill(innerHLen, false),
          innerV: fill(innerVLen, false),
        });
        return;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Editing: table · {data.rows} × {data.cols}
      </div>

      {/* ── 2. Row / column controls — side-by-side ─────────── */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Rows</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              title="Remove last row"
              onClick={() => commit(deleteRowAt(data, data.rows - 1))}
              disabled={data.rows <= 1}
              style={data.rows <= 1 ? tblBtnDisabled : tblBtnDanger}
            >
              −
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2e8', minWidth: 30, textAlign: 'center' }}>
              {data.rows}
            </div>
            <button
              title="Add row at bottom"
              onClick={() => commit(insertRow(data, data.rows - 1, 'below'))}
              style={tblBtn}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Columns</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              title="Remove last column"
              onClick={() => commit(deleteColAt(data, data.cols - 1))}
              disabled={data.cols <= 1}
              style={data.cols <= 1 ? tblBtnDisabled : tblBtnDanger}
            >
              −
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2e8', minWidth: 30, textAlign: 'center' }}>
              {data.cols}
            </div>
            <button
              title="Add column at right"
              onClick={() => commit(insertCol(data, data.cols - 1, 'right'))}
              style={tblBtn}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Visual border editor — always visible. The mockup mirrors
          whatever borders the canvas is currently rendering (preset
          OR custom), and clicking any line flips the table into
          custom mode using the displayed layout as the starting
          point. Kept above the preset row so users see the live
          preview before scanning preset names. */}
      <CustomBorderMockup
        border={displayBorder}
        rows={data.rows}
        cols={data.cols}
        onToggleOuter={toggleCustomEdge}
        onToggleInnerH={toggleInnerH}
        onToggleInnerV={toggleInnerV}
        onBulkPreset={applyBulkPreset}
      />

      {/* ── 3. Border style (with custom feature) ──────────── */}
      <div>
        <div style={labelStyle}>Border Style</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(TABLE_BORDER_PRESETS).map(([k, v]) => {
            const active = !isCustom && data.borderPreset === k;
            return (
              <button
                key={k}
                onClick={() => commit(setBorderPreset(data, k))}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  background: active ? '#7c6aed22' : '#1a1a26',
                  border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
                  color: active ? '#c8b6ff' : '#c8cad0',
                }}
              >
                {v.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() =>
              commit({
                ...data,
                borderPreset: 'custom',
                customBorder,
              })
            }
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '8px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              background: isCustom ? '#7c6aed22' : '#1a1a26',
              border: `1px solid ${isCustom ? '#7c6aed' : '#2a2a3a'}`,
              color: isCustom ? '#c8b6ff' : '#c8cad0',
            }}
          >
            Custom
          </button>
        </div>
      </div>

    </div>
  );
}

// =========================================================================
// CustomBorderMockup — clickable mini-table for per-edge toggles
// =========================================================================
//
// Visual editor where EVERY border/gridline is an independent
// click target. The mockup sizes itself off the actual
// `data.rows` × `data.cols` so a 4-row table shows 3 distinct
// inner horizontal gaps the user can toggle one at a time
// (innerH[0], innerH[1], innerH[2] — NOT a single grouped
// "horizontalLines" flag).
//
// Very large tables are visually capped to 6×6 in the mockup
// so the clickable zones stay big enough to hit. The user can
// still fine-tune individual gaps in larger tables, and bulk
// presets (below the mockup) always apply to the REAL full
// dimensions, so "all horizontal" on a 12-row table still
// turns on every single line.

function CustomBorderMockup(props: {
  border: NonNullable<TableData['customBorder']>;
  rows: number;
  cols: number;
  onToggleOuter: (key: keyof NonNullable<TableData['customBorder']>) => void;
  onToggleInnerH: (i: number) => void;
  onToggleInnerV: (i: number) => void;
  onBulkPreset: (kind: 'all' | 'none' | 'outer' | 'inner' | 'hOnly' | 'vOnly' | 'apa') => void;
}) {
  const { border, rows, cols, onToggleOuter, onToggleInnerH, onToggleInnerV, onBulkPreset } = props;

  const ACTIVE = '#9d87ff';
  const HINT = 'rgba(138, 138, 149, 0.35)';
  const HINT_DASH = `1.5px dashed ${HINT}`;
  const SOLID = `2px solid ${ACTIVE}`;

  const line = (on: boolean) => (on ? SOLID : HINT_DASH);

  // Mockup dimensions (px). Visual cap keeps the clickable
  // zones large enough to hit on a 3+ row/col table.
  const MAX_VISIBLE = 6;
  const ROWS = Math.min(Math.max(rows, 2), MAX_VISIBLE);
  const COLS = Math.min(Math.max(cols, 2), MAX_VISIBLE);
  const W = 300;
  const H = 40 + ROWS * 30; // grows proportional to row count

  const PAD = 14; // room for outer-edge hit strips

  // Hit-zone helper — a transparent clickable overlay.
  const hit = (
    style: React.CSSProperties,
    onClick: () => void,
    title: string,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        position: 'absolute',
        borderRadius: 2,
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          'rgba(157, 135, 255, 0.18)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    />
  );

  // Inner cell width / height inside the padded frame
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const cellW = innerW / COLS;
  const cellH = innerH / ROWS;

  // Bulk-preset button styles.
  const bulkBtn: React.CSSProperties = {
    all: 'unset',
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: '#1a1a26',
    color: '#c8cad0',
    border: '1px solid #2a2a3a',
    transition: 'all 150ms ease',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px',
        background: '#111118',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, color: '#8a8a95', lineHeight: 1.5 }}>
        Click any edge, gridline, or header cell to toggle it —
        each line is independent. Solid purple = on, faint dashed = off.
      </div>

      <div
        style={{
          position: 'relative',
          width: W,
          height: H,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Outer frame — drawn edge by edge. Each of the four
            outer edges is fully independent. */}
        <div
          style={{
            position: 'absolute',
            left: PAD,
            right: PAD,
            top: PAD,
            bottom: PAD,
            borderTop: line(border.topLine),
            borderBottom: line(border.bottomLine),
            borderLeft: line(border.leftLine),
            borderRight: line(border.rightLine),
            boxSizing: 'border-box',
          }}
        >
          {/* Cell grid — renders one visible border per inner
              gap so the user sees exactly which innerH[i] /
              innerV[i] is on. */}
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
              boxSizing: 'border-box',
            }}
          >
            {Array.from({ length: ROWS * COLS }).map((_, i) => {
              const r = Math.floor(i / COLS);
              const c = i % COLS;
              const isHeader = r === 0;
              // headerLine = gap below row 0
              const topLine =
                r === 1
                  ? border.headerLine
                  : r > 1
                    ? !!border.innerH[r - 2]
                    : false;
              const leftLine = c > 0 ? !!border.innerV[c - 1] : false;
              return (
                <div
                  key={i}
                  style={{
                    background: isHeader
                      ? 'rgba(157, 135, 255, 0.06)'
                      : 'transparent',
                    boxSizing: 'border-box',
                    borderTop: topLine ? line(true) : 'none',
                    borderLeft: leftLine ? line(true) : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ── Outer edge hit zones ─────────────────────────── */}
        {hit(
          { left: PAD, right: PAD, top: 0, height: PAD - 2, zIndex: 2 },
          () => onToggleOuter('topLine'),
          border.topLine ? 'Remove top edge line' : 'Add top edge line',
        )}
        {hit(
          { left: PAD, right: PAD, bottom: 0, height: PAD - 2, zIndex: 2 },
          () => onToggleOuter('bottomLine'),
          border.bottomLine ? 'Remove bottom edge line' : 'Add bottom edge line',
        )}
        {hit(
          { left: 0, top: PAD, bottom: PAD, width: PAD - 2, zIndex: 2 },
          () => onToggleOuter('leftLine'),
          border.leftLine ? 'Remove left edge line' : 'Add left edge line',
        )}
        {hit(
          { right: 0, top: PAD, bottom: PAD, width: PAD - 2, zIndex: 2 },
          () => onToggleOuter('rightLine'),
          border.rightLine ? 'Remove right edge line' : 'Add right edge line',
        )}

        {/* Header row — one big hit zone across row 0 for headerBox */}
        {hit(
          {
            left: PAD + 2,
            top: PAD + 2,
            width: innerW - 4,
            height: cellH - 4,
            zIndex: 1,
          },
          () => onToggleOuter('headerBox'),
          border.headerBox ? 'Remove header row box' : 'Add header row box',
        )}

        {/* Header separator — the gap below row 0 */}
        {hit(
          {
            left: PAD + 2,
            top: PAD + cellH - 4,
            width: innerW - 4,
            height: 8,
            zIndex: 3,
          },
          () => onToggleOuter('headerLine'),
          border.headerLine ? 'Remove header separator' : 'Add header separator',
        )}

        {/* Inner horizontal gaps — one hit zone per innerH[i]
            (gap below row 1 through row ROWS-2). Note: uses
            VISIBLE ROWS for the hit zones, but the underlying
            innerH index is still r - 2 so it maps to the real
            row count in the data. */}
        {Array.from({ length: Math.max(0, ROWS - 2) }).map((_, i) => {
          // Gap i is below visible row (i + 1), which is
          // innerH index i in the stored array.
          const on = !!border.innerH[i];
          const top = PAD + cellH * (i + 2) - 4;
          return hit(
            {
              left: PAD + 2,
              top,
              width: innerW - 4,
              height: 8,
              zIndex: 3,
            },
            () => onToggleInnerH(i),
            on
              ? `Remove line between row ${i + 2} and row ${i + 3}`
              : `Add line between row ${i + 2} and row ${i + 3}`,
          );
        })}

        {/* Inner vertical gaps — one hit zone per innerV[i] */}
        {Array.from({ length: Math.max(0, COLS - 1) }).map((_, i) => {
          const on = !!border.innerV[i];
          const left = PAD + cellW * (i + 1) - 4;
          return hit(
            {
              top: PAD + 2,
              left,
              height: innerH - 4,
              width: 8,
              zIndex: 3,
            },
            () => onToggleInnerV(i),
            on
              ? `Remove line between col ${i + 1} and col ${i + 2}`
              : `Add line between col ${i + 1} and col ${i + 2}`,
          );
        })}
      </div>

      {rows > MAX_VISIBLE || cols > MAX_VISIBLE ? (
        <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center', lineHeight: 1.4 }}>
          Showing a {ROWS}×{COLS} preview of your {rows}×{cols} table — bulk presets below apply to every line.
        </div>
      ) : null}

      {/* ── Bulk presets ─────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #2a2a3a', paddingTop: 10, marginTop: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Bulk presets
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('all')}>
            All borders
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('none')}>
            No borders
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('outer')}>
            Outer only
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('inner')}>
            Inner only
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('hOnly')}>
            Horizontal only
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('vOnly')}>
            Vertical only
          </button>
          <button type="button" style={bulkBtn} onClick={() => onBulkPreset('apa')}>
            APA 3-line
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// TextBlockEditor — sidebar panel for the selected text / heading / title
// =========================================================================
//
// Every control gets its own labeled row with consistent spacing, so the
// Size input, weight select, italic toggle, line-spacing slider, color
// picker, and highlight swatches are all immediately visible rather than
// crammed into a wrap-flex row. Labels are left-aligned block headings
// rather than inline hints so screen readers associate them correctly.

function TextBlockEditor(props: {
  block: Block;
  styleLevel: TypeStyle;
  palette: Palette;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
  onUpdateStyle: (field: string, value: number | boolean | string | null) => void;
}) {
  const { block, styleLevel, palette, onUpdateBlock, onUpdateStyle } = props;
  const [sidebarSelection, setSidebarSelection] = useState<SelectionInfo | null>(null);

  const fieldLabel: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 8,
    display: 'block',
  };

  const row: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Editing: {block.type}
      </div>

      {/* Content — shared RichTextEditor. Text typed here supports the
          same bold/italic/underline/strike/highlight/color/slash
          commands as the canvas inline editor. */}
      <div>
        <label style={fieldLabel}>Content</label>
        <div
          style={{
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            padding: '12px 14px',
            minHeight: 120,
            maxHeight: 260,
            overflow: 'auto',
            color: '#ddd',
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          <RichTextEditor
            value={block.content}
            onChange={(v) => onUpdateBlock(block.id, { content: v })}
            placeholder="Type here… (type / for symbols)"
            multiline
            onSelectionChange={setSidebarSelection}
            style={{ fontFamily: 'inherit', fontSize: 16, lineHeight: 1.5 }}
          />
        </div>
        <FloatingFormatToolbar info={sidebarSelection} />
      </div>

      {/* Size · Weight · Italic */}
      <div>
        <label style={fieldLabel}>Font</label>
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              value={Math.round(unitsToPt(styleLevel.size))}
              onChange={(e) => onUpdateStyle('size', ptToUnits(+e.target.value))}
              min={12}
              max={200}
              step={2}
              style={{
                ...inputBase,
                width: 64,
                textAlign: 'center',
                padding: '10px 10px',
                fontSize: 15,
              }}
              title="Font size (points)"
            />
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>pt</span>
          </div>
          <select
            value={styleLevel.weight}
            onChange={(e) => onUpdateStyle('weight', +e.target.value)}
            style={{
              ...inputBase,
              width: 90,
              appearance: 'auto',
              padding: '10px 12px',
              fontSize: 14,
            }}
          >
            {FONT_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onUpdateStyle('italic', !styleLevel.italic)}
            aria-pressed={styleLevel.italic}
            title="Italic"
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              fontSize: 18,
              fontWeight: 700,
              fontStyle: 'italic',
              fontFamily: 'Georgia, serif',
              background: styleLevel.italic ? '#7c6aed22' : '#1a1a26',
              border: `1px solid ${styleLevel.italic ? '#7c6aed' : '#2a2a3a'}`,
              color: styleLevel.italic ? '#c8b6ff' : '#9ca3af',
              boxSizing: 'border-box',
            }}
          >
            I
          </button>
        </div>
      </div>

      {/* Line spacing — slider + custom number entry so users can
          type an exact value instead of dragging to approximate. */}
      <div>
        <label style={fieldLabel}>Line spacing</label>
        <div style={{ ...row, gap: 14 }}>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={styleLevel.lineHeight}
            onChange={(e) => onUpdateStyle('lineHeight', +e.target.value)}
            style={{ flex: 1, accentColor: '#7c6aed' }}
          />
          <input
            type="number"
            value={styleLevel.lineHeight.toFixed(2)}
            onChange={(e) => {
              const v = Math.max(1, Math.min(3, +e.target.value || 1));
              onUpdateStyle('lineHeight', v);
            }}
            min={1}
            max={3}
            step={0.05}
            style={{
              ...inputBase,
              width: 72,
              textAlign: 'center',
              padding: '10px 10px',
              fontSize: 15,
            }}
            title="Line height (1.0–3.0)"
          />
        </div>
      </div>

      {/* Color */}
      <div>
        <label style={fieldLabel}>Text color</label>
        <div style={row}>
          <input
            type="color"
            value={styleLevel.color || palette.primary}
            onChange={(e) => onUpdateStyle('color', e.target.value)}
            style={{
              width: 40,
              height: 40,
              border: '1px solid #2a2a3a',
              borderRadius: 6,
              cursor: 'pointer',
              padding: 0,
              background: '#1a1a26',
            }}
          />
          <button
            type="button"
            onClick={() => onUpdateStyle('color', null)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#9ca3af',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
            }}
          >
            Reset to palette
          </button>
        </div>
      </div>

      {/*
        Block-level highlight swatches removed in favor of inline
        per-selection highlight (Notion-style). Inline highlight is
        applied via the floating formatting toolbar on the canvas
        when the user selects a text range. The TypeStyle.highlight
        field stays in the data model for backwards compatibility —
        any existing posters with block-level highlight still render
        correctly — but new highlights must be inline.
      */}
    </div>
  );
}

// =========================================================================
// AddBlockPanel — the Insert tab's block-type picker
// =========================================================================

function AddBlockPanel(props: { onAddBlock: (t: Block['type']) => void }) {
  const blocks: Array<[Block['type'], string, string]> = [
    ['heading', 'Heading', 'Section title with auto-numbering'],
    ['text', 'Text', 'Paragraph with slash-command symbols'],
    ['image', 'Image', 'Figure or photo upload'],
    ['table', 'Table', 'Data table with border presets'],
    ['references', 'References', 'Auto-formatted from Refs tab'],
    ['logo', 'Logo', 'Institution or sponsor mark'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Add a block
      </div>
      {blocks.map(([type, label, desc]) => (
        <button
          key={type}
          type="button"
          onClick={() => props.onAddBlock(type)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: '14px 16px',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#7c6aed';
            e.currentTarget.style.background = '#7c6aed11';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#2a2a3a';
            e.currentTarget.style.background = '#1a1a26';
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e2e8' }}>+ {label}</span>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{desc}</span>
        </button>
      ))}

      <div style={{ marginTop: 12, padding: '14px 16px', background: '#0f0f17', borderRadius: 8, border: '1px solid #1e1e2e' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          ✨ Slash symbols
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
          Inside a text block type <code style={{ color: '#c8b6ff' }}>/alpha</code>, <code style={{ color: '#c8b6ff' }}>/beta</code>, <code style={{ color: '#c8b6ff' }}>/leq</code>, <code style={{ color: '#c8b6ff' }}>/pm</code>, or stats shortcuts like <code style={{ color: '#c8b6ff' }}>/p</code>, <code style={{ color: '#c8b6ff' }}>/SD</code>, <code style={{ color: '#c8b6ff' }}>/df</code>.
        </div>
      </div>

      <div style={{ marginTop: 4, padding: '14px 16px', background: '#0f0f17', borderRadius: 8, border: '1px solid #1e1e2e' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          📋 Pasting tables
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
          Copy a table from <strong style={{ color: '#c8b6ff' }}>Word</strong>,{' '}
          <strong style={{ color: '#c8b6ff' }}>Excel</strong>, or{' '}
          <strong style={{ color: '#c8b6ff' }}>Google Sheets</strong>, add a table block, then paste into any cell — Postr will expand the grid and fill every cell for you. No need to retype.
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Issues tab — aggregated validation surface
// =========================================================================

function IssuesTab(props: {
  issues: PosterIssue[];
  onJumpToBlock?: (blockId: string) => void;
}) {
  const { issues, onJumpToBlock } = props;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  if (issues.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={labelStyle}>Issues</div>
        <div
          style={{
            background: '#1a3a2a',
            border: '1px solid #2d6a4f',
            borderRadius: 8,
            padding: 16,
            fontSize: 14,
            color: '#a6e3a1',
            lineHeight: 1.5,
          }}
        >
          ✓ No issues detected. Your poster passes all automated checks
          — ready to export.
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
          This tab scans for common pre-flight problems: blocks outside
          the canvas, missing authors or institutions, empty image
          blocks, very long titles, overlapping blocks, and references
          missing key fields. Issues refresh automatically as you edit.
        </div>
      </div>
    );
  }

  const renderSection = (
    label: string,
    items: PosterIssue[],
    color: string,
    bg: string,
    icon: string,
  ) => {
    if (items.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}
        >
          {icon} {label} ({items.length})
        </div>
        {items.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={
              issue.blockId && onJumpToBlock
                ? () => onJumpToBlock(issue.blockId!)
                : undefined
            }
            style={{
              all: 'unset',
              cursor: issue.blockId ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '10px 12px',
              background: bg,
              border: `1px solid ${color}55`,
              borderRadius: 8,
              transition: 'background 150ms ease, border-color 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!issue.blockId) return;
              e.currentTarget.style.borderColor = color;
            }}
            onMouseLeave={(e) => {
              if (!issue.blockId) return;
              e.currentTarget.style.borderColor = `${color}55`;
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {issue.category}
            </div>
            <div style={{ fontSize: 13, color: '#e2e2e8', lineHeight: 1.45 }}>
              {issue.message}
            </div>
            {issue.blockId && onJumpToBlock && (
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                → click to jump to this block
              </div>
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={labelStyle}>
        Issues ({issues.length})
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
        Pre-flight checks scan for blocks outside the canvas, missing
        required content, empty figures, and other common problems.
        Click any issue to jump to the block it affects.
      </p>
      {renderSection('Errors', errors, '#f38ba8', '#2b1820', '⛔')}
      {renderSection('Warnings', warnings, '#f9e2af', '#2b2418', '⚠')}
      {renderSection('Suggestions', infos, '#89b4fa', '#182028', 'ℹ')}
    </div>
  );
}
