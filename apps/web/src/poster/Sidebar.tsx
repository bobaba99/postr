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

export type SidebarTab = 'layout' | 'authors' | 'refs' | 'style' | 'edit' | 'insert' | 'figure';

export interface StylePreset {
  name: string;
  fontFamily: string;
  paletteName: string;
  styles: Styles;
  headingStyle: HeadingStyle;
}

interface SidebarProps {
  // poster meta
  posterTitle: string;
  onChangePosterTitle: (title: string) => void;
  posterSizeKey: PosterSizeKey;
  onChangePosterSize: (key: PosterSizeKey) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;

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

  // presets
  savedPresets: StylePreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: StylePreset) => void;

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
  fontSize: 12,
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

export function Sidebar(props: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('layout');
  const [presetName, setPresetName] = useState('');

  // Auto-switch to the EDIT tab whenever a block becomes selected on
  // the canvas. If the user deselects (click empty canvas), we DON'T
  // auto-switch back — they can stay on whichever tab they were on.
  useEffect(() => {
    if (props.selectedBlock) setTab('edit');
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
    fontSize: 11,
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
      <a href="/" style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', cursor: 'pointer' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg,#7c6aed,#06d6a0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 3v18" />
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>Postr</div>
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
          {(['layout', 'insert', 'edit', 'style', 'authors', 'refs', 'figure'] as SidebarTab[]).map((t) => (
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
            onChangePosterSize={props.onChangePosterSize}
            showGrid={props.showGrid}
            onToggleGrid={props.onToggleGrid}
            onApplyTemplate={props.onApplyTemplate}
            onAutoLayout={props.onAutoLayout}
            onPrint={props.onPrint}
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
            onSavePreset={(n) => props.onSavePreset(n)}
            onLoadPreset={props.onLoadPreset}
            presetName={presetName}
            setPresetName={setPresetName}
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

        {tab === 'figure' && (
          <ReadabilityPanel selectedBlock={props.selectedBlock} />
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
  onChangePosterSize: (k: PosterSizeKey) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;
  onApplyTemplate: (k: LayoutKey) => void;
  onAutoLayout: () => void;
  onPrint: () => void;
}) {
  const titleLen = props.posterTitle.length;
  const titleTip =
    !props.posterTitle.trim()
      ? 'Name your poster for the dashboard. Try: presenter, event, date (e.g. "Maya — APA 2026").'
      : titleLen < 10
        ? 'Tip: Add the conference name or date for quick identification (e.g. "Kenji — SfN Nov 2026").'
        : titleLen > 80
          ? 'Consider shortening — this name is for the dashboard, not the poster itself.'
          : null;

  return (
    <>
      <div style={labelStyle}>Poster Name</div>
      <input
        value={props.posterTitle}
        onChange={(e) => props.onChangePosterTitle(e.target.value)}
        placeholder="e.g. Maya — APA 2026"
        style={inputBase}
      />
      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, marginBottom: titleTip ? 0 : 8, lineHeight: 1.4 }}>
        Dashboard label — separate from the poster&apos;s main title on the canvas.
      </div>
      {titleTip && (
        <div style={{ fontSize: 10, color: '#89b4fa', lineHeight: 1.4, marginTop: 4, marginBottom: 8 }}>
          {titleTip}
        </div>
      )}

      <div style={labelStyle}>Poster Size</div>
      <select
        value={props.posterSizeKey}
        onChange={(e) => props.onChangePosterSize(e.target.value as PosterSizeKey)}
        style={selectStyle}
      >
        {Object.entries(POSTER_SIZES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>

      <div style={labelStyle}>Grid</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: '#888', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={props.showGrid}
          onChange={(e) => props.onToggleGrid(e.target.checked)}
          style={{ accentColor: '#7c6aed' }}
        />
        Show grid
      </label>

      <div style={labelStyle}>Auto Layout</div>
      <button onClick={props.onAutoLayout} style={{ ...buttonStyle(false), fontSize: 14 }}>
        ⬡ Auto-Arrange
      </button>

      <div style={labelStyle}>Templates</div>
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
              <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{t.description}</span>
            </button>
          );
        })}
      </div>

      <div style={labelStyle}>Print</div>
      <button onClick={props.onPrint} style={buttonStyle(true)}>
        ⎙ Save PDF
      </button>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Preview</div>
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
                style={{ all: 'unset', cursor: 'pointer', color: i > 0 ? '#666' : '#2a2a3a', fontSize: 12 }}
              >
                ▲
              </button>
              <button
                onClick={() => swap(i, i + 1)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  color: i < props.authors.length - 1 ? '#666' : '#2a2a3a',
                  fontSize: 12,
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
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{idx + 1}</span>
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
    fontSize: 12,
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
  presetName: string;
  setPresetName: (n: string) => void;
}) {
  return (
    <>
      <div style={labelStyle}>Palette</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PALETTES.map((p) => {
          const active = props.paletteName === p.name;
          return (
            <button
              type="button"
              key={p.name}
              onClick={() => {
                const { name, ...palette } = p;
                props.onChangePalette(palette, name);
              }}
              style={{
                all: 'unset',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                background: active ? '#7c6aed18' : '#1a1a26',
                border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', gap: 3 }}>
                {[p.bg, p.primary, p.accent, p.accent2].map((c, j) => (
                  <div
                    key={j}
                    style={{ width: 16, height: 16, borderRadius: 3, background: c, border: '1px solid #2a2a3a' }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#c8b6ff' : '#e2e2e8' }}>{p.name}</span>
            </button>
          );
        })}
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

      <div style={labelStyle}>Presets</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={props.presetName}
          onChange={(e) => props.setPresetName(e.target.value)}
          placeholder="Preset name"
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
          style={{ ...buttonStyle(true), width: 'auto', padding: '12px 18px', fontSize: 14 }}
        >
          Save
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
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {levels.map((t) => (
        <div key={t.k}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{t.l}</div>
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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
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

  const iconBtn: CSSProperties = {
    all: 'unset',
    cursor: 'pointer',
    width: 28,
    height: 28,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    background: '#1a1a26',
    border: '1px solid #2a2a3a',
    color: '#c8cad0',
    flexShrink: 0,
  };
  const dangerIconBtn: CSSProperties = {
    ...iconBtn,
    color: '#f87171',
    borderColor: '#3a1f20',
  };
  const disabledBtn: CSSProperties = {
    opacity: 0.35,
    cursor: 'not-allowed',
  };

  const indexLabel: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#9ca3af',
    minWidth: 48,
    flexShrink: 0,
  };

  const rowControlRow = (rowIndex: number) => (
    <div
      key={`row-${rowIndex}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}
    >
      <span style={indexLabel}>Row {rowIndex + 1}</span>
      <button
        title="Insert row above"
        onClick={() => commit(insertRow(data, rowIndex, 'above'))}
        style={iconBtn}
      >
        ↑+
      </button>
      <button
        title="Insert row below"
        onClick={() => commit(insertRow(data, rowIndex, 'below'))}
        style={iconBtn}
      >
        ↓+
      </button>
      <button
        title="Delete this row"
        onClick={() => commit(deleteRowAt(data, rowIndex))}
        disabled={data.rows <= 1}
        style={data.rows <= 1 ? { ...dangerIconBtn, ...disabledBtn } : dangerIconBtn}
      >
        ×
      </button>
    </div>
  );

  const colControlRow = (colIndex: number) => (
    <div
      key={`col-${colIndex}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}
    >
      <span style={indexLabel}>Col {colIndex + 1}</span>
      <button
        title="Insert column to the left"
        onClick={() => commit(insertCol(data, colIndex, 'left'))}
        style={iconBtn}
      >
        ←+
      </button>
      <button
        title="Insert column to the right"
        onClick={() => commit(insertCol(data, colIndex, 'right'))}
        style={iconBtn}
      >
        →+
      </button>
      <button
        title="Delete this column"
        onClick={() => commit(deleteColAt(data, colIndex))}
        disabled={data.cols <= 1}
        style={data.cols <= 1 ? { ...dangerIconBtn, ...disabledBtn } : dangerIconBtn}
      >
        ×
      </button>
    </div>
  );

  const presetButton = (k: string, name: string) => {
    const active = data.borderPreset === k;
    return (
      <button
        key={k}
        onClick={() => commit(setBorderPreset(data, k))}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '12px 16px',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          background: active ? '#7c6aed22' : '#1a1a26',
          border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
          color: active ? '#c8b6ff' : '#c8cad0',
        }}
      >
        {name}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Editing: table · {data.rows} × {data.cols}
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#9ca3af',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Rows
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Array.from({ length: data.rows }).map((_, i) => rowControlRow(i))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#9ca3af',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Columns
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Array.from({ length: data.cols }).map((_, i) => colControlRow(i))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#9ca3af',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Border style
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(TABLE_BORDER_PRESETS).map(([k, v]) => presetButton(k, v.name))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
        Tip: paste a table from Word or Excel straight into a cell — rows and
        columns are re-created automatically.
      </p>
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
    fontSize: 11,
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
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>pt</span>
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
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
          <span style={{ fontSize: 12, color: '#6b7280' }}>{desc}</span>
        </button>
      ))}

      <div style={{ marginTop: 12, padding: '14px 16px', background: '#0f0f17', borderRadius: 8, border: '1px solid #1e1e2e' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Slash symbols
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
          Inside a text block type <code style={{ color: '#c8b6ff' }}>/alpha</code>, <code style={{ color: '#c8b6ff' }}>/beta</code>, <code style={{ color: '#c8b6ff' }}>/leq</code>, <code style={{ color: '#c8b6ff' }}>/pm</code>, or stats shortcuts like <code style={{ color: '#c8b6ff' }}>/p</code>, <code style={{ color: '#c8b6ff' }}>/SD</code>, <code style={{ color: '#c8b6ff' }}>/df</code>.
        </div>
      </div>
    </div>
  );
}
