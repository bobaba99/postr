/**
 * PresetEditModal — rename and delete saved style presets.
 *
 * Presets are editor snapshots (font + palette + styles + heading).
 * Full style edits happen inside the editor — you load a preset,
 * tweak, and re-save with the same name to overwrite. This modal
 * handles the two actions that don't need the editor canvas:
 *
 *   - Rename a preset (double-click to edit; Enter to commit)
 *   - Delete individual presets (vs the bulk "clear all" elsewhere)
 *
 * Persists through the same localStorage key the editor uses
 * ('postr.style-presets'), so changes show up in the Style tab's
 * preset dropdown on the user's next visit to the editor.
 */
import { useEffect, useRef, useState } from 'react';
import type { StylePreset } from '@/poster/Sidebar';

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
    // Quota / private mode — silently drop; presets only live in-session.
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChange?: (count: number) => void;
}

export function PresetEditModal({ open, onClose, onChange }: Props) {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPresets(loadPresets());
    setEditingIdx(null);
    setDraftName('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (editingIdx !== null) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editingIdx]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingIdx === null) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, editingIdx]);

  if (!open) return null;

  function commit(next: StylePreset[]) {
    setPresets(next);
    savePresets(next);
    onChange?.(next.length);
  }

  function startRename(idx: number) {
    setEditingIdx(idx);
    setDraftName(presets[idx]?.name ?? '');
    setError(null);
  }

  function confirmRename() {
    if (editingIdx === null) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    const clash = presets.some(
      (p, i) => i !== editingIdx && p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      setError('Another preset already has that name.');
      return;
    }
    const next = presets.map((p, i) =>
      i === editingIdx ? { ...p, name: trimmed } : p,
    );
    commit(next);
    setEditingIdx(null);
    setDraftName('');
    setError(null);
  }

  function cancelRename() {
    setEditingIdx(null);
    setDraftName('');
    setError(null);
  }

  function deleteAt(idx: number) {
    const next = presets.filter((_, i) => i !== idx);
    commit(next);
    if (editingIdx === idx) {
      setEditingIdx(null);
      setDraftName('');
    }
  }

  return (
    <div
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h3
          style={{
            margin: '0 0 6px',
            fontSize: 18,
            fontWeight: 700,
            color: '#e2e2e8',
          }}
        >
          🎨 Manage style presets
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>
          Presets are snapshots of the font, palette, and heading style you
          saved from the editor's Style tab. Rename or delete them here. To
          change what a preset contains, load it in the editor and re-save
          with the same name.
        </p>

        {presets.length === 0 ? (
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
            then click <strong style={{ color: '#c8cad0' }}>Save as preset</strong>{' '}
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
            {presets.map((p, i) => {
              const isEditing = editingIdx === i;
              return (
                <li
                  key={`${p.name}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: '#0a0a12',
                    border: '1px solid #1f1f2e',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={draftName}
                        onChange={(e) => {
                          setDraftName(e.target.value);
                          setError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            confirmRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        maxLength={80}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: 14,
                          color: '#e2e2e8',
                          background: '#1a1a26',
                          border: '1px solid #7c6aed',
                          borderRadius: 4,
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(i)}
                        title="Click to rename"
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#c8cad0',
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '2px 0',
                        }}
                      >
                        {p.name}
                      </button>
                    )}
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
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={confirmRename}
                          style={{
                            cursor: 'pointer',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#fff',
                            background: '#7c6aed',
                            border: 'none',
                            borderRadius: 4,
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          style={{
                            cursor: 'pointer',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 500,
                            color: '#c8cad0',
                            background: '#1a1a26',
                            border: '1px solid #2a2a3a',
                            borderRadius: 4,
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startRename(i)}
                          title="Rename"
                          style={{
                            cursor: 'pointer',
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 500,
                            color: '#c8cad0',
                            background: '#1a1a26',
                            border: '1px solid #2a2a3a',
                            borderRadius: 4,
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAt(i)}
                          title="Delete preset"
                          style={{
                            cursor: 'pointer',
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 500,
                            color: '#f87171',
                            background: '#1a1a26',
                            border: '1px solid #2a2a3a',
                            borderRadius: 4,
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              cursor: 'pointer',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 500,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
