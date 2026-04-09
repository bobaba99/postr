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
import { useRef, useState, type CSSProperties } from 'react';
import type {
  Author,
  Block,
  HeadingStyle,
  Institution,
  Palette,
  Reference,
  Styles,
} from '@postr/shared';
import { nanoid } from 'nanoid';
import {
  FONTS,
  FONT_WEIGHTS,
  HIGHLIGHT_PRESETS,
  PALETTES,
  POSTER_SIZES,
  type PosterSizeKey,
} from './constants';
import { CITATION_STYLES, SORT_MODE_LABELS, type CitationStyleKey, type SortMode } from './citations';
import { LAYOUT_TEMPLATES, type LayoutKey } from './templates';
import { parseBibtex, parseRis } from './parsers';
import { AuthorLine } from './blocks';

export type SidebarTab = 'layout' | 'authors' | 'refs' | 'style' | 'edit';

export interface StylePreset {
  name: string;
  fontFamily: string;
  paletteName: string;
  styles: Styles;
  headingStyle: HeadingStyle;
}

interface SidebarProps {
  // poster meta
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
}

// Shared inline styles for the dark sidebar UI chrome.
const inputBase: CSSProperties = {
  all: 'unset',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 4,
  padding: '4px 6px',
  color: '#ddd',
  fontSize: 10,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '1.2px',
  color: '#555',
  marginBottom: 4,
  marginTop: 14,
};

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 7px',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 5,
  color: '#ddd',
  fontSize: 11,
  outline: 'none',
};

const buttonStyle = (active: boolean): CSSProperties => ({
  padding: '7px 10px',
  background: active ? '#7c6aed' : '#1a1a26',
  color: '#fff',
  border: active ? 'none' : '1px solid #2a2a3a',
  borderRadius: 5,
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
});

export function Sidebar(props: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('layout');
  const [presetName, setPresetName] = useState('');

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    textAlign: 'center',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    color: active ? '#fff' : '#555',
    borderBottom: active ? '2px solid #7c6aed' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
  });

  return (
    <div
      data-postr-sidebar
      style={{
        width: 280,
        minWidth: 280,
        background: '#111118',
        color: '#c8cad0',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        fontSize: 11,
        borderRight: '1px solid #1e1e2e',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: 'linear-gradient(135deg,#7c6aed,#06d6a0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 3v18" />
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>Postr</div>
      </div>

      <div style={{ display: 'flex', margin: '8px 12px 0', borderBottom: '1px solid #1e1e2e' }}>
        {(['layout', 'authors', 'refs', 'style', 'edit'] as SidebarTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
        {tab === 'layout' && (
          <LayoutTab
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
            onAddBlock={props.onAddBlock}
          />
        )}
      </div>
    </div>
  );
}

// =========================================================================
// Layout tab
// =========================================================================

function LayoutTab(props: {
  posterSizeKey: PosterSizeKey;
  onChangePosterSize: (k: PosterSizeKey) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;
  onApplyTemplate: (k: LayoutKey) => void;
  onAutoLayout: () => void;
  onPrint: () => void;
}) {
  return (
    <>
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#888', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={props.showGrid}
          onChange={(e) => props.onToggleGrid(e.target.checked)}
          style={{ accentColor: '#7c6aed' }}
        />
        Show grid
      </label>

      <div style={labelStyle}>Auto Layout</div>
      <button onClick={props.onAutoLayout} style={{ ...buttonStyle(false), fontSize: 9 }}>
        ⬡ Auto-Arrange
      </button>

      <div style={labelStyle}>Templates</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(Object.keys(LAYOUT_TEMPLATES) as LayoutKey[]).map((k) => {
          const t = LAYOUT_TEMPLATES[k];
          return (
            <button
              key={k}
              onClick={() => props.onApplyTemplate(k)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '7px 9px',
                background: '#1a1a26',
                border: '1px solid #2a2a3a',
                borderRadius: 5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: '#ddd' }}>{t.name}</span>
              <span style={{ fontSize: 8, color: '#555' }}>{t.description}</span>
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

      <div style={{ ...labelStyle, marginTop: 14 }}>② Authors</div>
      <AuthorManager authors={props.authors} onChange={props.onChangeAuthors} institutions={props.institutions} />

      {props.authors.filter((a) => a.name).length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 8px',
            background: '#14141e',
            border: '1px solid #222',
            borderRadius: 5,
          }}
        >
          <div style={{ fontSize: 8, fontWeight: 700, color: '#555', marginBottom: 3 }}>PREVIEW</div>
          <AuthorLine
            authors={props.authors}
            institutions={props.institutions}
            palette={props.palette}
            fontFamily={props.fontFamily}
            styles={props.styles}
          />
        </div>
      )}

      <div style={{ ...labelStyle, marginTop: 14 }}>Logos</div>
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
        <div key={inst.id} style={{ background: '#14141e', border: '1px solid #222', borderRadius: 5, padding: '6px 8px' }}>
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
                fontSize: 9,
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
              style={{ ...inputBase, fontSize: 11, fontWeight: 600, color: '#eee' }}
            />
            <button
              onClick={() => remove(inst.id)}
              style={{ all: 'unset', cursor: 'pointer', color: '#c55', fontSize: 12, fontWeight: 700 }}
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
          padding: '5px 0',
          fontSize: 10,
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
        <div key={a.id} style={{ background: '#14141e', border: '1px solid #222', borderRadius: 5, padding: '6px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <button
                onClick={() => swap(i - 1, i)}
                style={{ all: 'unset', cursor: 'pointer', color: i > 0 ? '#666' : '#2a2a3a', fontSize: 8 }}
              >
                ▲
              </button>
              <button
                onClick={() => swap(i, i + 1)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  color: i < props.authors.length - 1 ? '#666' : '#2a2a3a',
                  fontSize: 8,
                }}
              >
                ▼
              </button>
            </div>
            <input
              value={a.name}
              onChange={(e) => update(a.id, { name: e.target.value })}
              placeholder="Author name"
              style={{ ...inputBase, flex: 1, fontSize: 11 }}
            />
            <button
              onClick={() => remove(a.id)}
              style={{ all: 'unset', cursor: 'pointer', color: '#c55', fontSize: 12, fontWeight: 700 }}
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
                      fontSize: 9,
                      background: checked ? '#7c6aed22' : '#1a1a26',
                      border: `1px solid ${checked ? '#7c6aed66' : '#2a2a3a'}`,
                      color: checked ? '#b8a8ff' : '#666',
                    }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 800 }}>{idx + 1}</span>
                    <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inst.name || '?'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingLeft: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#666', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={a.isCorresponding}
                onChange={(e) => update(a.id, { isCorresponding: e.target.checked })}
                style={{ width: 10, height: 10, accentColor: '#7c6aed' }}
              />
              Corr.
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#666', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={a.equalContrib}
                onChange={(e) => update(a.id, { equalContrib: e.target.checked })}
                style={{ width: 10, height: 10, accentColor: '#7c6aed' }}
              />
              Equal
            </label>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '5px 0',
          fontSize: 10,
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

  const sel: CSSProperties = { ...inputBase, appearance: 'auto', padding: '4px 6px' };

  return (
    <>
      <div style={labelStyle}>References</div>
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '6px 10px',
          background: '#7c6aed',
          color: '#fff',
          border: 'none',
          borderRadius: 5,
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        Import .bib / .ris / .enw
      </button>
      <input ref={fileRef} type="file" accept=".bib,.bibtex,.ris,.enw" onChange={handleImport} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
        <label style={{ fontSize: 8, color: '#666', whiteSpace: 'nowrap' }}>Style</label>
        <select
          value={props.citationStyle}
          onChange={(e) => props.onChangeCitationStyle(e.target.value as CitationStyleKey)}
          style={sel}
        >
          {(Object.keys(CITATION_STYLES) as CitationStyleKey[]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
        <label style={{ fontSize: 8, color: '#666', whiteSpace: 'nowrap' }}>Sort</label>
        <select
          value={props.sortMode}
          onChange={(e) => props.onChangeSortMode(e.target.value as SortMode)}
          style={sel}
        >
          {Object.entries(SORT_MODE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {props.references.map((r, i) => (
          <div
            key={r.id ?? i}
            style={{
              display: 'flex',
              gap: 3,
              alignItems: 'flex-start',
              padding: '4px 6px',
              background: '#14141e',
              border: '1px solid #222',
              borderRadius: 4,
            }}
          >
            <span style={{ fontSize: 9, color: '#aaa', flex: 1, lineHeight: 1.4 }}>
              {CITATION_STYLES[props.citationStyle](r, i)}
            </span>
            <button
              onClick={() => props.onChangeReferences(props.references.filter((_, j) => j !== i))}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: '#c55' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{ ...labelStyle, marginTop: 14 }}>Manual Entry</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          value={manual.authors}
          onChange={(e) => setManual({ ...manual, authors: e.target.value })}
          placeholder="Authors (Last, F., comma-separated)"
          style={inputBase}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={manual.year}
            onChange={(e) => setManual({ ...manual, year: e.target.value })}
            placeholder="Year"
            style={{ ...inputBase, width: '30%' }}
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
          onClick={addManual}
          style={{
            padding: '5px',
            background: '#1a1a26',
            color: '#7c6aed',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 9,
            fontWeight: 600,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {PALETTES.map((p) => (
          <div
            key={p.name}
            onClick={() => {
              const { name, ...palette } = p;
              props.onChangePalette(palette, name);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 6px',
              borderRadius: 4,
              cursor: 'pointer',
              background: props.paletteName === p.name ? '#7c6aed18' : 'transparent',
              border: props.paletteName === p.name ? '1px solid #7c6aed44' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', gap: 1.5 }}>
              {[p.bg, p.primary, p.accent, p.accent2].map((c, j) => (
                <div
                  key={j}
                  style={{ width: 11, height: 11, borderRadius: 2, background: c, border: '1px solid #2a2a3a' }}
                />
              ))}
            </div>
            <span style={{ fontSize: 9, color: '#aaa' }}>{p.name}</span>
          </div>
        ))}
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
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={props.presetName}
          onChange={(e) => props.setPresetName(e.target.value)}
          placeholder="Name"
          style={{ ...selectStyle, flex: 1, padding: '4px 6px', fontSize: 10 }}
        />
        <button
          onClick={() => {
            if (props.presetName.trim()) {
              props.onSavePreset(props.presetName.trim());
              props.setPresetName('');
            }
          }}
          style={{ ...buttonStyle(true), width: 'auto', padding: '4px 10px', fontSize: 9 }}
        >
          Save
        </button>
      </div>
      {props.savedPresets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
          {props.savedPresets.map((p, i) => (
            <button
              key={i}
              onClick={() => props.onLoadPreset(p)}
              style={{ ...buttonStyle(false), fontSize: 9, textAlign: 'left', padding: '4px 8px' }}
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

  const inp: CSSProperties = { ...inputBase, width: 40, textAlign: 'center', padding: '3px 6px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {levels.map((t) => (
        <div key={t.k}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t.l}</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
            <input
              type="number"
              value={props.styles[t.k].size}
              onChange={(e) => update(t.k, 'size', +e.target.value)}
              min={5}
              max={60}
              style={inp}
            />
            <select
              value={props.styles[t.k].weight}
              onChange={(e) => update(t.k, 'weight', +e.target.value)}
              style={{ ...inp, width: 50, appearance: 'auto' }}
            >
              {FONT_WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <button
              onClick={() => update(t.k, 'italic', !props.styles[t.k].italic)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 5px',
                borderRadius: 3,
                fontSize: 10,
                fontStyle: 'italic',
                background: props.styles[t.k].italic ? '#7c6aed33' : '#1a1a26',
                border: `1px solid ${props.styles[t.k].italic ? '#7c6aed' : '#2a2a3a'}`,
                color: props.styles[t.k].italic ? '#b8a8ff' : '#666',
              }}
            >
              I
            </button>
            <span style={{ fontSize: 8, color: '#555' }}>LH</span>
            <input
              type="number"
              value={props.styles[t.k].lineHeight}
              onChange={(e) => update(t.k, 'lineHeight', +e.target.value)}
              min={1}
              max={3}
              step={0.05}
              style={{ ...inp, width: 36 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function HeadingEditor(props: { headingStyle: HeadingStyle; onChange: (hs: HeadingStyle) => void }) {
  const update = (patch: Partial<HeadingStyle>) => props.onChange({ ...props.headingStyle, ...patch });
  const borderBtn = (v: HeadingStyle['border'], label: string) => (
    <button
      key={v}
      onClick={() => update({ border: v })}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '3px 7px',
        borderRadius: 3,
        fontSize: 9,
        background: props.headingStyle.border === v ? '#7c6aed22' : '#1a1a26',
        border: `1px solid ${props.headingStyle.border === v ? '#7c6aed66' : '#2a2a3a'}`,
        color: props.headingStyle.border === v ? '#b8a8ff' : '#888',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {borderBtn('none', 'None')}
        {borderBtn('bottom', 'Bottom')}
        {borderBtn('left', 'Left')}
        {borderBtn('box', 'Box')}
        {borderBtn('thick', 'Thick')}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#888', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={props.headingStyle.fill}
            onChange={(e) => update({ fill: e.target.checked })}
            style={{ accentColor: '#7c6aed' }}
          />
          Fill
        </label>
        {(['left', 'center'] as const).map((a) => (
          <button
            key={a}
            onClick={() => update({ align: a })}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 9,
              background: props.headingStyle.align === a ? '#7c6aed22' : '#1a1a26',
              border: `1px solid ${props.headingStyle.align === a ? '#7c6aed66' : '#2a2a3a'}`,
              color: props.headingStyle.align === a ? '#b8a8ff' : '#888',
              textTransform: 'capitalize',
            }}
          >
            {a}
          </button>
        ))}
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
  onAddBlock: (t: Block['type']) => void;
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
      <div style={labelStyle}>Selected Block</div>
      {sb && isTextLike && styleLevel ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>
            Editing: {sb.type}
          </div>
          <textarea
            value={sb.content}
            onChange={(e) => props.onUpdateBlock(sb.id, { content: e.target.value })}
            style={{
              all: 'unset',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 5,
              padding: '6px 8px',
              color: '#ddd',
              fontSize: 10,
              minHeight: 60,
              maxHeight: 120,
              overflow: 'auto',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 8, color: '#666' }}>Size</label>
            <input
              type="number"
              value={styleLevel.size}
              onChange={(e) => updateStyle('size', +e.target.value)}
              min={5}
              max={60}
              style={{ ...inputBase, width: 38, textAlign: 'center' }}
            />
            <label style={{ fontSize: 8, color: '#666' }}>Wt</label>
            <select
              value={styleLevel.weight}
              onChange={(e) => updateStyle('weight', +e.target.value)}
              style={{ ...inputBase, width: 50, appearance: 'auto' }}
            >
              {FONT_WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <button
              onClick={() => updateStyle('italic', !styleLevel.italic)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontStyle: 'italic',
                background: styleLevel.italic ? '#7c6aed33' : '#1a1a26',
                border: `1px solid ${styleLevel.italic ? '#7c6aed' : '#2a2a3a'}`,
                color: styleLevel.italic ? '#b8a8ff' : '#666',
              }}
            >
              I
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label style={{ fontSize: 8, color: '#666', whiteSpace: 'nowrap' }}>Line spacing</label>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.05}
              value={styleLevel.lineHeight}
              onChange={(e) => updateStyle('lineHeight', +e.target.value)}
              style={{ flex: 1, accentColor: '#7c6aed' }}
            />
            <span style={{ fontSize: 9, color: '#888', minWidth: 24 }}>{styleLevel.lineHeight.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label style={{ fontSize: 8, color: '#666' }}>Color</label>
            <input
              type="color"
              value={styleLevel.color || props.palette.primary}
              onChange={(e) => updateStyle('color', e.target.value)}
              style={{ width: 22, height: 22, border: '1px solid #333', borderRadius: 3, cursor: 'pointer', padding: 0 }}
            />
            <button
              onClick={() => updateStyle('color', null)}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 8, color: '#666' }}
            >
              Reset
            </button>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <label style={{ fontSize: 8, color: '#666' }}>Highlight</label>
            {HIGHLIGHT_PRESETS.map((h, i) => (
              <div
                key={i}
                onClick={() => updateStyle('highlight', h)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: h ?? '#1a1a26',
                  border: `1.5px solid ${styleLevel.highlight === h ? '#7c6aed' : '#333'}`,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#555', padding: '8px 0' }}>Click a block on the poster to edit it here.</div>
      )}

      <div style={labelStyle}>Add Block</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {(
          [
            ['heading', 'Heading'],
            ['text', 'Text'],
            ['image', 'Image'],
            ['table', 'Table'],
            ['references', 'References'],
            ['logo', 'Logo'],
          ] as Array<[Block['type'], string]>
        ).map(([t, l]) => (
          <button key={t} onClick={() => props.onAddBlock(t)} style={buttonStyle(false)}>
            + {l}
          </button>
        ))}
      </div>

      <div style={{ ...labelStyle, marginTop: 14 }}>Symbols (type / in text)</div>
      <div style={{ fontSize: 9, color: '#666', lineHeight: 1.5 }}>
        /alpha → α · /beta → β · /eta2 → η² · /chi2 → χ² · /leq → ≤ · /geq → ≥ · /pm → ± · /arrow → →
        <br />
        Stats: /p → 𝑝 · /F → 𝐹 · /t → 𝑡 · /d → 𝑑 · /SD · /SE · /CI · /df → 𝑑𝑓
      </div>
    </>
  );
}
