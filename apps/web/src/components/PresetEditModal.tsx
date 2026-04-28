/**
 * PresetEditModal — manage saved style presets without opening the editor.
 *
 * Presets are editor snapshots of (font + palette + type styles +
 * heading style). The editor's Style tab is still the fastest way to
 * tweak visuals live against a poster, but this modal exists so you
 * can quickly fix a typo, swap a palette, bump a font size, or change
 * heading border treatment directly from Profile — no round-trip
 * through the editor required.
 *
 *   List view  → rename / edit / delete a preset
 *   Edit view  → change name, font, palette, per-level type styles,
 *                and heading style
 *
 * Persists through the same localStorage key the editor uses
 * ('postr.style-presets'), so changes are picked up next time you
 * open a poster and visit the Style tab.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StylePreset } from '@/poster/Sidebar';
import type {
  FontWeight,
  HeadingStyle,
  Palette,
  Styles,
  StyleLevel,
  TypeStyle,
} from '@postr/shared';
import {
  FONTS,
  FONT_WEIGHTS,
  PALETTES,
  ptToUnits,
  unitsToPt,
  type NamedPalette,
} from '@/poster/constants';
import { loadCustomPalettes } from '@/poster/customPalettes';

const STORAGE_KEY = 'postr.style-presets';

function loadPresets(): StylePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StylePreset[]) : [];
  } catch {
    return [];
  }
}

function savePresets(next: StylePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — silently drop.
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChange?: (count: number) => void;
}

type View = { kind: 'list' } | { kind: 'edit'; idx: number };

const STYLE_LEVELS: { key: StyleLevel; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'heading', label: 'Headings' },
  { key: 'body', label: 'Body' },
  { key: 'authors', label: 'Authors' },
];

const BORDER_OPTIONS: { value: HeadingStyle['border']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bottom', label: 'Underline' },
  { value: 'left', label: 'Left bar' },
  { value: 'box', label: 'Boxed' },
  { value: 'thick', label: 'Thick underline' },
];

export function PresetEditModal({ open, onClose, onChange }: Props) {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [customPalettes, setCustomPalettes] = useState<NamedPalette[]>([]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [draft, setDraft] = useState<StylePreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPresets(loadPresets());
    setCustomPalettes(loadCustomPalettes());
    setView({ kind: 'list' });
    setDraft(null);
    setError(null);
  }, [open]);

  // Merged palette catalog — built-in + user's custom palettes. Both
  // lists feed the Palette dropdown in the edit panel so a preset
  // that references a custom palette can still be re-edited here.
  const allPalettes = useMemo<NamedPalette[]>(
    () => [...PALETTES, ...customPalettes],
    [customPalettes],
  );

  // Reset the edit panel scroll on each entry so long forms start at
  // the top instead of wherever the previous preset was scrolled to.
  useEffect(() => {
    if (view.kind === 'edit' && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [view]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view.kind === 'edit') {
          cancelEdit();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, onClose]);

  if (!open) return null;

  function commit(next: StylePreset[]) {
    setPresets(next);
    savePresets(next);
    onChange?.(next.length);
  }

  function startEdit(idx: number) {
    const target = presets[idx];
    if (!target) return;
    // Deep clone so draft edits don't mutate the live preset until saved.
    setDraft(JSON.parse(JSON.stringify(target)) as StylePreset);
    setView({ kind: 'edit', idx });
    setError(null);
  }

  function cancelEdit() {
    setDraft(null);
    setView({ kind: 'list' });
    setError(null);
  }

  function saveEdit() {
    if (view.kind !== 'edit' || !draft) return;
    const trimmed = draft.name.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    const clash = presets.some(
      (p, i) =>
        i !== view.idx && p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      setError('Another preset already has that name.');
      return;
    }
    // Sync the embedded palette colors with the selected paletteName,
    // so presets keep working after PALETTES catalog updates or when
    // the referenced custom palette is later deleted.
    const matched = allPalettes.find((p) => p.name === draft.paletteName);
    const palette: Palette | undefined = matched
      ? (() => {
          const { name: _n, ...rest } = matched;
          return rest;
        })()
      : draft.palette;
    const next = presets.map((p, i) =>
      i === view.idx ? { ...draft, name: trimmed, palette } : p,
    );
    commit(next);
    setDraft(null);
    setView({ kind: 'list' });
    setError(null);
  }

  function deleteAt(idx: number) {
    const next = presets.filter((_, i) => i !== idx);
    commit(next);
    if (view.kind === 'edit' && view.idx === idx) {
      setDraft(null);
      setView({ kind: 'list' });
    }
  }

  function updateDraft(patch: Partial<StylePreset>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateStyle(level: StyleLevel, patch: Partial<TypeStyle>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        styles: {
          ...prev.styles,
          [level]: { ...prev.styles[level], ...patch },
        } as Styles,
      };
    });
  }

  function updateHeading(patch: Partial<HeadingStyle>) {
    setDraft((prev) =>
      prev ? { ...prev, headingStyle: { ...prev.headingStyle, ...patch } } : prev,
    );
  }

  return (
    <div
      data-postr-modal-backdrop
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        data-postr-modal-content
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 8px' }}>
          <h3
            style={{
              margin: '0 0 6px',
              fontSize: 18,
              fontWeight: 700,
              color: '#e2e2e8',
            }}
          >
            {view.kind === 'list'
              ? '🎨 Manage style presets'
              : `✏️ Editing "${draft?.name ?? ''}"`}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>
            {view.kind === 'list'
              ? 'Presets snapshot the font, palette, type styles, and heading look you saved from the editor. Edit them here or delete what you no longer need.'
              : 'Changes apply the next time you load this preset in the editor.'}
          </p>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 28px',
          }}
        >
          {view.kind === 'list' ? (
            presets.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  background: '#0a0a12',
                  border: '1px dashed #2a2a3a',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#6b7280',
                  lineHeight: 1.55,
                }}
              >
                No saved presets yet. In the editor, adjust a poster's style,
                then click{' '}
                <strong style={{ color: '#c8cad0' }}>Save as style preset</strong>{' '}
                in the Style tab.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {presets.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 14px',
                      background: '#0a0a12',
                      border: '1px solid #1f1f2e',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#c8cad0',
                        }}
                      >
                        {p.name}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {p.fontFamily} · {p.paletteName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => startEdit(i)}
                        title="Edit preset"
                        style={secondaryBtnStyle}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAt(i)}
                        title="Delete preset"
                        style={dangerBtnStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : draft ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name */}
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(e) => {
                    updateDraft({ name: e.target.value });
                    setError(null);
                  }}
                  maxLength={80}
                  style={inputStyle}
                />
              </Field>

              {/* Font family */}
              <Field label="Font family">
                <select
                  value={draft.fontFamily}
                  onChange={(e) => updateDraft({ fontFamily: e.target.value })}
                  style={inputStyle}
                >
                  {Object.keys(FONTS).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Palette */}
              <Field label="Palette">
                <select
                  value={draft.paletteName}
                  onChange={(e) => updateDraft({ paletteName: e.target.value })}
                  style={inputStyle}
                >
                  <optgroup label="Curated">
                    {PALETTES.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                  {customPalettes.length > 0 && (
                    <optgroup label="Your palettes">
                      {customPalettes.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {(() => {
                  const match =
                    allPalettes.find((p) => p.name === draft.paletteName) ??
                    (draft.palette
                      ? ({ name: draft.paletteName, ...draft.palette } as NamedPalette)
                      : undefined);
                  if (!match) return null;
                  const swatches = [
                    match.bg,
                    match.primary,
                    match.accent,
                    match.accent2,
                    match.muted,
                  ];
                  return (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {swatches.map((c, i) => (
                        <div
                          key={`${c}-${i}`}
                          title={c}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 4,
                            background: c,
                            border: '1px solid #2a2a3a',
                          }}
                        />
                      ))}
                    </div>
                  );
                })()}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: '#6b7280',
                    lineHeight: 1.5,
                  }}
                >
                  To create a new custom palette, open a poster in the editor —
                  the Style tab has a full palette designer (manual / random /
                  from text / from image).
                </div>
              </Field>

              {/* Type styles per level */}
              <div>
                <div style={sectionLabelStyle}>Type styles</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {STYLE_LEVELS.map(({ key, label }) => {
                    const s = draft.styles[key];
                    const currentPt = Math.round(unitsToPt(s.size));
                    return (
                      <div
                        key={key}
                        style={{
                          padding: '10px 12px',
                          background: '#0a0a12',
                          border: '1px solid #1f1f2e',
                          borderRadius: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#c8cad0',
                            }}
                          >
                            {label}
                          </span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {currentPt}pt
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: 8,
                            alignItems: 'end',
                          }}
                        >
                          <MiniField label="Size (pt)">
                            <input
                              type="number"
                              min={8}
                              max={300}
                              step={1}
                              value={currentPt}
                              onChange={(e) => {
                                const pt = Number(e.target.value);
                                if (!Number.isFinite(pt)) return;
                                updateStyle(key, {
                                  size: ptToUnits(Math.max(8, Math.min(300, pt))),
                                });
                              }}
                              style={inputStyle}
                            />
                          </MiniField>
                          <MiniField label="Weight">
                            <select
                              value={s.weight}
                              onChange={(e) =>
                                updateStyle(key, {
                                  weight: Number(e.target.value) as FontWeight,
                                })
                              }
                              style={inputStyle}
                            >
                              {FONT_WEIGHTS.map((w) => (
                                <option key={w} value={w}>
                                  {w}
                                </option>
                              ))}
                            </select>
                          </MiniField>
                          <MiniField label="Italic">
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                height: 34,
                                paddingLeft: 2,
                                fontSize: 13,
                                color: '#c8cad0',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={s.italic}
                                onChange={(e) =>
                                  updateStyle(key, { italic: e.target.checked })
                                }
                              />
                              <span>Slanted</span>
                            </label>
                          </MiniField>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Heading style */}
              <div>
                <div style={sectionLabelStyle}>Heading decoration</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  <MiniField label="Border">
                    <select
                      value={draft.headingStyle.border}
                      onChange={(e) =>
                        updateHeading({
                          border: e.target.value as HeadingStyle['border'],
                        })
                      }
                      style={inputStyle}
                    >
                      {BORDER_OPTIONS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </MiniField>
                  <MiniField label="Alignment">
                    <select
                      value={draft.headingStyle.align}
                      onChange={(e) =>
                        updateHeading({
                          align: e.target.value as HeadingStyle['align'],
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                    </select>
                  </MiniField>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    fontSize: 13,
                    color: '#c8cad0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draft.headingStyle.fill}
                    onChange={(e) => updateHeading({ fill: e.target.checked })}
                  />
                  Filled background
                </label>
              </div>
            </div>
          ) : null}

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: 6,
                color: '#f87171',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '16px 28px 24px',
            borderTop: '1px solid #1f1f2e',
          }}
        >
          {view.kind === 'edit' ? (
            <>
              <button type="button" onClick={cancelEdit} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button type="button" onClick={saveEdit} style={primaryBtnStyle}>
                Save changes
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={sectionLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#6b7280',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  color: '#e2e2e8',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#6b7280',
  marginBottom: 6,
};

const primaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
};

const secondaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const dangerBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 500,
  color: '#f87171',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};
