/**
 * PaletteDesigner — modal for creating/editing custom academic palettes.
 *
 * Four ways to build a palette:
 *   • Manual     — pick each of the 7 roles via native color picker / hex
 *   • Random     — generate from color theory strategies (complementary,
 *                  triadic, analogous, etc.) with a shuffle button
 *   • From text  — paste hex codes, a Coolors.co URL, JSON, or anything
 *                  containing hex tokens; they get mapped to roles by
 *                  luminance
 *   • From image — upload a file, the canvas quantizer extracts the
 *                  dominant colors
 *
 * Output is a NamedPalette (palette shape + user-supplied name), which
 * the caller persists through `customPalettes.ts` and can embed in a
 * style preset for later round-tripping.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Palette } from '@postr/shared';
import type { NamedPalette } from '@/poster/constants';
import {
  STRATEGY_LABELS,
  type ColorStrategy,
  contrastForeground,
  extractPaletteFromImage,
  generateRandomPalette,
  hexListToPalette,
  normalizeHex,
  parsePaletteText,
} from '@/poster/paletteTools';

interface Props {
  open: boolean;
  initialPalette?: Palette;
  initialName?: string;
  onSave: (named: NamedPalette) => void;
  onCancel: () => void;
}

type Tab = 'manual' | 'random' | 'text' | 'image';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'manual', label: 'Manual', icon: '🎨' },
  { key: 'random', label: 'Random', icon: '🎲' },
  { key: 'text', label: 'From text', icon: '📝' },
  { key: 'image', label: 'From image', icon: '🖼️' },
];

const ROLE_LABELS: { key: keyof Palette; label: string; help: string }[] = [
  { key: 'bg', label: 'Background', help: 'Poster canvas color' },
  { key: 'primary', label: 'Primary text', help: 'Body + title color' },
  { key: 'accent', label: 'Accent', help: 'Main accent / links' },
  { key: 'accent2', label: 'Accent 2', help: 'Secondary accent' },
  { key: 'muted', label: 'Muted', help: 'Borders, captions' },
  { key: 'headerBg', label: 'Header BG', help: 'Heading fill color' },
  { key: 'headerFg', label: 'Header text', help: 'Heading text color' },
];

const DEFAULT_PALETTE: Palette = {
  bg: '#FAFDF7',
  primary: '#1B3A2D',
  accent: '#2D6A4F',
  accent2: '#52B788',
  muted: '#5A6E5F',
  headerBg: '#2D6A4F',
  headerFg: '#FFFFFF',
};

export function PaletteDesigner({
  open,
  initialPalette,
  initialName,
  onSave,
  onCancel,
}: Props) {
  const [tab, setTab] = useState<Tab>('manual');
  const [name, setName] = useState('');
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [strategy, setStrategy] = useState<ColorStrategy>('complementary');
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setTab('manual');
    setName(initialName ?? '');
    setPalette(initialPalette ?? DEFAULT_PALETTE);
    setStrategy('complementary');
    setTextInput('');
    setTextError(null);
    setImageError(null);
    setImageLoading(false);
    setNameError(null);
  }, [open, initialPalette, initialName]);

  // Escape to cancel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const previewStyle = useMemo<React.CSSProperties>(
    () => ({
      background: palette.bg,
      color: palette.primary,
      borderColor: palette.muted,
    }),
    [palette],
  );

  if (!open) return null;

  function updateRole(key: keyof Palette, hex: string) {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setPalette((prev) => {
      const next = { ...prev, [key]: normalized };
      // When the user edits headerBg, auto-flip headerFg if contrast is bad —
      // unless they're explicitly editing headerFg right now.
      if (key === 'headerBg') {
        next.headerFg = contrastForeground(normalized);
      }
      return next;
    });
  }

  function randomize() {
    setPalette(generateRandomPalette(strategy));
  }

  function applyText() {
    setTextError(null);
    const hexes = parsePaletteText(textInput);
    if (hexes.length === 0) {
      setTextError(
        'No hex codes detected. Paste something like #264653, #2A9D8F, #E9C46A… or a Coolors.co URL.',
      );
      return;
    }
    setPalette(hexListToPalette(hexes));
    setTab('manual');
  }

  async function handleImageFile(file: File) {
    setImageError(null);
    setImageLoading(true);
    try {
      const extracted = await extractPaletteFromImage(file);
      setPalette(extracted);
      setTab('manual');
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Could not read that image.',
      );
    } finally {
      setImageLoading(false);
    }
  }

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Please name your palette.');
      return;
    }
    setNameError(null);
    onSave({ name: trimmed, ...palette });
  }

  return (
    <div
      onClick={onCancel}
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
          maxWidth: 720,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 26px 12px' }}>
          <h3
            style={{
              margin: '0 0 6px',
              fontSize: 18,
              fontWeight: 700,
              color: '#e2e2e8',
            }}
          >
            🎨 {initialName ? `Edit "${initialName}"` : 'Create custom palette'}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>
            Build a 7-role palette by hand, generate one from color theory,
            paste hex codes from Coolors / Adobe, or extract dominant colors
            from any image.
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '0 26px',
            borderBottom: '1px solid #1f1f2e',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: tab === t.key ? '#c8b6ff' : '#9ca3af',
                borderBottom: `2px solid ${tab === t.key ? '#7c6aed' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              <span style={{ marginRight: 6 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 26px',
          }}
        >
          {tab === 'manual' && (
            <ManualPanel palette={palette} onUpdate={updateRole} />
          )}

          {tab === 'random' && (
            <RandomPanel
              palette={palette}
              strategy={strategy}
              onStrategyChange={setStrategy}
              onShuffle={randomize}
            />
          )}

          {tab === 'text' && (
            <TextPanel
              value={textInput}
              onChange={setTextInput}
              onApply={applyText}
              error={textError}
            />
          )}

          {tab === 'image' && (
            <ImagePanel
              loading={imageLoading}
              error={imageError}
              onFile={handleImageFile}
              fileInputRef={fileInputRef}
            />
          )}

          {/* Live preview — always visible regardless of tab */}
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 10,
              border: '1px solid',
              ...previewStyle,
            }}
          >
            <div
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: 4,
                background: palette.headerBg,
                color: palette.headerFg,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              Introduction
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: palette.primary,
                marginBottom: 4,
              }}
            >
              Sample poster heading
            </div>
            <div
              style={{
                fontSize: 12,
                color: palette.muted,
                lineHeight: 1.5,
              }}
            >
              Body text looks like this — muted text like this — with{' '}
              <span style={{ color: palette.accent, fontWeight: 600 }}>accent</span>{' '}
              and{' '}
              <span style={{ color: palette.accent2, fontWeight: 600 }}>
                accent 2
              </span>{' '}
              highlights.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 26px 22px',
            borderTop: '1px solid #1f1f2e',
          }}
        >
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            placeholder="Palette name (e.g. Lab Green)"
            maxLength={60}
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 14,
              color: '#e2e2e8',
              background: '#1a1a26',
              border: `1px solid ${nameError ? '#f87171' : '#2a2a3a'}`,
              borderRadius: 6,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button type="button" onClick={onCancel} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={commit} style={primaryBtnStyle}>
            Save palette
          </button>
        </div>
        {nameError && (
          <div
            role="alert"
            style={{
              padding: '0 26px 16px',
              fontSize: 12,
              color: '#f87171',
            }}
          >
            {nameError}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-panels ─────────────────────────────────────────────────────

function ManualPanel({
  palette,
  onUpdate,
}: {
  palette: Palette;
  onUpdate: (key: keyof Palette, hex: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}
    >
      {ROLE_LABELS.map(({ key, label, help }) => (
        <div
          key={key}
          style={{
            padding: '10px 12px',
            background: '#0a0a12',
            border: '1px solid #1f1f2e',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad0' }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
            {help}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="color"
              value={palette[key]}
              onChange={(e) => onUpdate(key, e.target.value)}
              style={{
                width: 34,
                height: 34,
                padding: 0,
                border: '1px solid #2a2a3a',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <input
              type="text"
              value={palette[key]}
              onChange={(e) => onUpdate(key, e.target.value)}
              maxLength={7}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                color: '#e2e2e8',
                background: '#1a1a26',
                border: '1px solid #2a2a3a',
                borderRadius: 4,
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RandomPanel({
  palette,
  strategy,
  onStrategyChange,
  onShuffle,
}: {
  palette: Palette;
  strategy: ColorStrategy;
  onStrategyChange: (s: ColorStrategy) => void;
  onShuffle: () => void;
}) {
  return (
    <div>
      <div style={sectionLabel}>Color theory strategy</div>
      <select
        value={strategy}
        onChange={(e) => onStrategyChange(e.target.value as ColorStrategy)}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 13,
          color: '#e2e2e8',
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 6,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      >
        {(Object.keys(STRATEGY_LABELS) as ColorStrategy[]).map((s) => (
          <option key={s} value={s}>
            {STRATEGY_LABELS[s]}
          </option>
        ))}
      </select>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: '#6b7280',
          lineHeight: 1.5,
        }}
      >
        {strategyHelp(strategy)}
      </div>

      <button type="button" onClick={onShuffle} style={shuffleBtnStyle}>
        🎲 Shuffle palette
      </button>

      {/* Visible swatch strip so the user can eyeball the current roll */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 6,
        }}
      >
        {ROLE_LABELS.map(({ key }) => (
          <div
            key={key}
            title={`${key}: ${palette[key]}`}
            style={{
              flex: 1,
              height: 42,
              background: palette[key],
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        Keep rolling until it feels right — then tweak individual roles in
        the Manual tab before saving.
      </div>
    </div>
  );
}

function strategyHelp(strategy: ColorStrategy): string {
  switch (strategy) {
    case 'monochromatic':
      return 'Single hue, varied saturation and lightness. Calm and focused.';
    case 'analogous':
      return 'Adjacent hues on the wheel (±30°). Natural and harmonious.';
    case 'complementary':
      return 'Opposite hues (180°). High contrast, grabs attention.';
    case 'triadic':
      return 'Three evenly spaced hues (120°). Balanced and vibrant.';
    case 'split-complementary':
      return 'Base + two adjacent to its complement. Less harsh than pure complementary.';
  }
}

function TextPanel({
  value,
  onChange,
  onApply,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  error: string | null;
}) {
  return (
    <div>
      <div style={sectionLabel}>Paste hex codes or a palette URL</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'e.g.\n#264653, #2A9D8F, #E9C46A, #F4A261, #E76F51\n\nor https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51'}
        rows={6}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: '#e2e2e8',
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 6,
          outline: 'none',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#6b7280',
          lineHeight: 1.55,
        }}
      >
        Works with Coolors.co URLs, Adobe swatch exports, JSON arrays, or
        any text containing hex codes. Colors are assigned to roles by
        luminance — lightest becomes background, darkest becomes primary.
      </div>
      <button type="button" onClick={onApply} style={primaryBtnStyle}>
        Apply
      </button>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
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
  );
}

function ImagePanel({
  loading,
  error,
  onFile,
  fileInputRef,
}: {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <div style={sectionLabel}>Upload an image to extract its palette</div>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '40px 24px',
          border: '1px dashed #2a2a3a',
          borderRadius: 8,
          background: '#0a0a12',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 28 }}>🖼️</div>
        <div style={{ fontSize: 13, color: '#c8cad0', fontWeight: 500 }}>
          {loading
            ? 'Analyzing image…'
            : 'Click to upload or drag an image here'}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          PNG, JPG, or WebP — a photo, a screenshot, anything
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = ''; // allow re-uploading the same file
          }}
          style={{ display: 'none' }}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: '#6b7280',
          lineHeight: 1.55,
        }}
      >
        The image never leaves your browser — pixels are sampled on-device
        and the file is discarded after extraction.
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
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
  );
}

// ── Shared styles ──────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#6b7280',
  marginBottom: 8,
};

const primaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
  marginTop: 12,
};

const secondaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const shuffleBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: 'linear-gradient(135deg, #7c6aed 0%, #a855f7 100%)',
  border: 'none',
  borderRadius: 8,
  marginTop: 14,
  width: '100%',
};
