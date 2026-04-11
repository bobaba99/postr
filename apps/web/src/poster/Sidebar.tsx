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
import { CITATION_STYLES, SORT_MODE_LABELS, type CitationStyleKey, type SortMode } from './citations';
import { LAYOUT_TEMPLATES, type LayoutKey } from './templates';
import { parseBibtex, parseRis } from './parsers';
import { AuthorLine } from './blocks';
import { RichTextEditor, type SelectionInfo } from './RichTextEditor';
import { FloatingFormatToolbar } from './FloatingFormatToolbar';
import { ReadabilityPanel } from './ReadabilityPanel';

export type SidebarTab =
  | 'layout'
  | 'authors'
  | 'refs'
  | 'style'
  | 'edit'
  | 'insert'
  | 'export';

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
  sortMode: SortMode;
  onChangeSortMode: (m: SortMode) => void;

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

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  color: '#ddd',
  fontSize: 17,
  outline: 'none',
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
  const [tab, setTab] = useState<SidebarTab>('layout');
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

  // Auto-switch to the Edit tab whenever a block is selected. The
  // Edit tab routes each block type to the appropriate editor and
  // shows the ReadabilityPanel when an image block is selected — so
  // there's only one place users need to look after clicking on the
  // canvas. If the user deselects (click empty canvas), stay on the
  // current tab rather than jumping back to Layout.
  useEffect(() => {
    if (!props.selectedBlock) return;
    setTab('edit');
  }, [props.selectedBlock?.id]);

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
    display: 'block',
    width: '100%',
    padding: '14px 16px',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
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
        // Wider sidebar — 460 px total (100 px rail + 360 px panel) —
        // so inputs, table editors, and the SmartTextarea have room
        // without the tab rail compressing everything on the right.
        width: 460,
        minWidth: 460,
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

      {/* Body: vertical tab rail on the left + panel content on the right */}
      <div style={{ flex: 1, display: 'flex', marginTop: 16, minHeight: 0 }}>
        {/* Vertical tab rail */}
        <nav
          aria-label="Sidebar sections"
          style={{
            width: 100,
            minWidth: 100,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #1e1e2e',
            paddingTop: 4,
          }}
        >
          {(['layout', 'insert', 'edit', 'style', 'authors', 'refs', 'export'] as SidebarTab[]).map((t) => (
            <button
              key={t}
              data-postr-tab
              type="button"
              onClick={() => setTab(t)}
              style={tabStyle(tab === t)}
            >
              {t}
            </button>
          ))}
        </nav>

        {/* Panel content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 24px', minWidth: 0 }}>
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
            sortMode={props.sortMode}
            onChangeSortMode={props.onChangeSortMode}
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

      <div style={labelStyle}>Auto Layout</div>
      <button onClick={props.onAutoLayout} style={{ ...buttonStyle(false), fontSize: 14 }}>
        ⬡ Auto-Arrange
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        Tidy existing blocks into an even grid — useful after dragging things
        around mid-session.
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
  sortMode: SortMode;
  onChangeSortMode: (m: SortMode) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [manual, setManual] = useState({ authors: '', year: '', title: '', journal: '' });

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

  const sel: CSSProperties = { ...inputBase, appearance: 'auto', padding: '10px 14px' };
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ ...miniLabel, width: 48 }}>Sort</label>
          <select
            value={props.sortMode}
            onChange={(e) => props.onChangeSortMode(e.target.value as SortMode)}
            style={{ ...sel, flex: 1 }}
          >
            {Object.entries(SORT_MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
        <TableEditor block={sb} onUpdateBlock={props.onUpdateBlock} />
      ) : sb && isTextLike && styleLevel ? (
        <TextBlockEditor
          block={sb}
          styleLevel={styleLevel}
          palette={props.palette}
          onUpdateBlock={props.onUpdateBlock}
          onUpdateStyle={updateStyle}
        />
      ) : sb && sb.type === 'image' ? (
        // Image blocks: show the readability analyzer inline instead of
        // shunting users off to a dedicated "figure" tab.
        <ReadabilityPanel selectedBlock={sb} />
      ) : (
        <div style={{ fontSize: 14, color: '#555', padding: '16px 0', lineHeight: 1.5 }}>
          Click a block on the canvas to edit it here, or switch to the{' '}
          <span style={{ color: '#c8b6ff' }}>Insert</span> tab to add a new one.
        </div>
      )}
    </>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Editing: table · {data.rows} × {data.cols}
      </div>

      {/* Mini cell preview — shows the table structure with light borders */}
      <div style={{ background: '#1a1a26', borderRadius: 6, padding: 8, border: '1px solid #2a2a3a' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(data.cols, 8)}, 1fr)`,
            gridTemplateRows: `repeat(${Math.min(data.rows, 8)}, 1fr)`,
            gap: 1,
            background: '#2a2a3a',
            border: '1px solid #2a2a3a',
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: 120,
          }}
        >
          {Array.from({ length: Math.min(data.rows, 8) * Math.min(data.cols, 8) }).map((_, i) => {
            const r = Math.floor(i / Math.min(data.cols, 8));
            const c = i % Math.min(data.cols, 8);
            const cellIdx = r * data.cols + c;
            const hasContent = !!(data.cells[cellIdx]?.trim());
            return (
              <div
                key={i}
                style={{
                  background: r === 0 ? '#1e1e2e' : '#111118',
                  padding: 2,
                  fontSize: 13,
                  color: hasContent ? '#6b7280' : 'transparent',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  minHeight: 12,
                }}
              >
                {hasContent ? '···' : '\u00A0'}
              </div>
            );
          })}
        </div>
        {(data.rows > 8 || data.cols > 8) && (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
            Showing first 8×8 of {data.rows}×{data.cols}
          </div>
        )}
      </div>

      {/* Simplified row/column controls: +/- buttons with count */}
      <div>
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
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2e8', minWidth: 36, textAlign: 'center' }}>
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

      <div>
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
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2e8', minWidth: 36, textAlign: 'center' }}>
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

      {/* Border style presets */}
      <div>
        <div style={labelStyle}>Border Style</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(TABLE_BORDER_PRESETS).map(([k, v]) => {
            const active = data.borderPreset === k;
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
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        <strong style={{ color: '#9ca3af' }}>💡 Tips:</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          <li>✏️ Click any cell on the canvas to type directly.</li>
          <li>🖱️ Click a row/column header strip to select the whole row or column.</li>
          <li>📋 Paste from Word, Excel, or Google Sheets into any cell — the grid auto-grows.</li>
          <li>↔️ Drag column borders to resize.</li>
          <li>🗑️ Select a row/column and press Delete to remove it.</li>
          <li>⌨️ Tab / Shift+Tab to jump between cells.</li>
        </ul>
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
