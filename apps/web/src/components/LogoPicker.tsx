/**
 * LogoPicker — modal dialog for choosing an institution logo.
 *
 * Three tabs:
 *
 *   1. Presets — searchable catalog of ~80 North American
 *      universities (from `logoPresets.ts`). Clicking a preset
 *      fetches a 256 × 256 favicon from Google s2 and sets the
 *      logo block's `imageSrc` to its base64 data URL. Users are
 *      reminded that the preview is low-res; they can replace
 *      it with a print-quality upload before exporting.
 *
 *   2. My Logos — personal library backed by `public.user_logos`
 *      + the `user-logos` Supabase Storage bucket. Persists
 *      across posters and devices so users only upload each
 *      institution's logo once. Up to 25 logos per user
 *      (enforced by a BEFORE INSERT trigger).
 *
 *   3. Upload — one-shot file upload. The user picks a file,
 *      gives it a name, and the modal saves it to My Logos (so
 *      it's reusable) AND sets the current block's imageSrc.
 *      If they're signed in anonymously, the upload still works
 *      — anonymous accounts get their own RLS-scoped slice of
 *      the bucket just like permanent accounts.
 *
 * The modal is portal-free (renders in-place via fixed
 * positioning) to match the rest of the app's modal pattern
 * (ConfirmModal, InputModal, PublishGalleryModal) and to keep
 * z-index stacking straightforward.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import {
  LOGO_PRESETS,
  REGION_LABELS,
  logoPresetUrl,
  resolvePresetLogo,
  searchLogoPresets,
  type LogoPreset,
} from '@/poster/logoPresets';
import {
  deleteUserLogo,
  listUserLogos,
  uploadUserLogo,
  type UserLogo,
} from '@/data/userLogos';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (imageSrc: string) => void;
}

type Tab = 'presets' | 'my' | 'upload';

export function LogoPicker({ open, onClose, onPick }: Props) {
  const [tab, setTab] = useState<Tab>('presets');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<LogoPreset['region'] | 'all'>('all');
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [myLogos, setMyLogos] = useState<UserLogo[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset transient state every time the modal opens so stale
    // errors / in-flight flags don't carry across sessions.
    setError(null);
    setLoadingPresetId(null);
    setUploading(false);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'my') return;
    setMyLoading(true);
    listUserLogos()
      .then((logos) => setMyLogos(logos))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load logos.'),
      )
      .finally(() => setMyLoading(false));
  }, [open, tab]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredPresets =
    region === 'all'
      ? searchLogoPresets(query)
      : searchLogoPresets(query).filter((p) => p.region === region);

  const handlePresetClick = async (preset: LogoPreset) => {
    setError(null);
    setLoadingPresetId(preset.id);
    // Resolve the Wikipedia crest / seal first (accurate), and
    // fall back to the Google favicon if Wikipedia has no
    // image for this page. The resolver is CORS-friendly so
    // the <img> tag will still load the URL as plain image
    // data at render time without needing a proxy.
    try {
      const url = await resolvePresetLogo(preset);
      onPick(url);
      onClose();
    } catch (err) {
      // Belt-and-braces: resolvePresetLogo swallows errors and
      // returns a fallback URL, so this catch should only fire
      // if that fallback itself throws (shouldn't happen).
      setError(err instanceof Error ? err.message : 'Failed to load logo.');
    } finally {
      setLoadingPresetId(null);
    }
  };

  const handleMyLogoClick = (logo: UserLogo) => {
    onPick(logo.signedUrl);
    onClose();
  };

  /**
   * Auto-apply the picked file. Called as soon as the user
   * selects a file from the OS dialog — no extra "Upload +
   * insert" button click required.
   *
   * The previous UX hid the apply action behind a button the
   * user frequently missed: they'd pick a file, see the checkmark
   * on the dropzone, close the modal, and assume nothing
   * happened. Canva / Figma / Google Docs all apply on pick —
   * Postr now matches that expectation.
   *
   * Flow:
   *   1. Validate MIME + size locally (quick feedback).
   *   2. Read as base64 data URL so the poster block stays
   *      self-contained (no reliance on signed URLs that expire).
   *   3. onPick(dataUrl) → block imageSrc is set.
   *   4. onClose() → picker closes immediately.
   *   5. In the background, persist to `user_logos` so the logo
   *      becomes reusable from the My Logos tab on future
   *      posters. Background failure is logged but does NOT
   *      block the user — the logo is already on the canvas.
   */
  const handleFilePicked = async (file: File) => {
    setError(null);

    // Client-side validation before reading. If we hit this
    // branch the user sees an inline red banner instead of a
    // silent no-op.
    if (!file.type.startsWith('image/')) {
      setError(`"${file.name}" isn't an image. Upload PNG, JPEG, SVG, or WebP.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — logos must be under 10 MB.`,
      );
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () =>
          reject(new Error('Could not read the picked file.'));
        r.readAsDataURL(file);
      });

      onPick(dataUrl);
      onClose();

      // Background save to the personal logo library. Uses the
      // file's display name (minus extension) as the default —
      // users no longer get a "Logo name" textbox in the UI.
      const defaultName = file.name.replace(/\.[^.]+$/, '');
      try {
        await uploadUserLogo(file, defaultName);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[LogoPicker] background save failed:', err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (logo: UserLogo) => {
    if (!window.confirm(`Delete "${logo.name}" from your logo library?`)) return;
    try {
      await deleteUserLogo(logo);
      setMyLogos((prev) => prev.filter((l) => l.id !== logo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  if (!open) return null;

  // IMPORTANT: render the modal via a portal to `document.body`.
  // The poster-canvas ancestor (`#poster-canvas`) has
  // `transform: scale(zoom)` applied, and any CSS transform
  // creates a new containing block for `position: fixed`
  // descendants. Without this portal, the modal would render
  // INSIDE the scaled canvas — positioned at viewport coords but
  // resolved against the transformed ancestor, which squashes the
  // dialog into a narrow column roughly at the canvas origin.
  // (User reported the bug with a screenshot on 2026-04-11: the
  // "Pick a logo" title was wrapping one character per line.)
  // Mounting at document.body sidesteps the transform entirely.
  return ReactDOM.createPortal(
    <div
      data-postr-modal-backdrop
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logo-picker-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        data-postr-modal-content
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          width: 'min(780px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          color: '#e2e2e8',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #2a2a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h2
              id="logo-picker-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 700 }}
            >
              Pick a logo
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8a8a95' }}>
              Search a preset university, reuse one from your library, or
              upload a new file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 4,
              color: '#8a8a95',
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Tab rail */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: '0 22px',
            borderBottom: '1px solid #2a2a3a',
          }}
        >
          {(
            [
              ['presets', 'Presets'],
              ['my', 'My Logos'],
              ['upload', 'Upload'],
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: 600,
                color: tab === t ? '#fff' : '#8a8a95',
                borderBottom: `2px solid ${tab === t ? '#7c6aed' : 'transparent'}`,
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content — scrollable */}
        <div style={{ padding: 22, overflow: 'auto', flex: 1 }}>
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                background: 'rgba(220, 38, 38, 0.12)',
                border: '1px solid rgba(220, 38, 38, 0.4)',
                borderRadius: 8,
                color: '#fecaca',
                fontSize: 13,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {tab === 'presets' && (
            <PresetsTab
              query={query}
              setQuery={setQuery}
              region={region}
              setRegion={setRegion}
              filtered={filteredPresets}
              loadingPresetId={loadingPresetId}
              onPick={handlePresetClick}
            />
          )}

          {tab === 'my' && (
            <MyLogosTab
              logos={myLogos}
              loading={myLoading}
              onPick={handleMyLogoClick}
              onDelete={handleDelete}
              onGoToUpload={() => setTab('upload')}
            />
          )}

          {tab === 'upload' && (
            <UploadTab
              uploading={uploading}
              onFilePicked={handleFilePicked}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Presets tab ──────────────────────────────────────────────────

function PresetsTab(props: {
  query: string;
  setQuery: (q: string) => void;
  region: LogoPreset['region'] | 'all';
  setRegion: (r: LogoPreset['region'] | 'all') => void;
  filtered: readonly LogoPreset[];
  loadingPresetId: string | null;
  onPick: (p: LogoPreset) => void;
}) {
  const regions: Array<{ key: LogoPreset['region'] | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'us-ne', label: REGION_LABELS['us-ne'] },
    { key: 'us-s', label: REGION_LABELS['us-s'] },
    { key: 'us-mw', label: REGION_LABELS['us-mw'] },
    { key: 'us-w', label: REGION_LABELS['us-w'] },
    { key: 'canada', label: REGION_LABELS.canada },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input
        type="search"
        value={props.query}
        onChange={(e) => props.setQuery(e.target.value)}
        placeholder="Search 80+ North American universities…"
        style={searchInputStyle}
        autoFocus
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {regions.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => props.setRegion(r.key)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              background: props.region === r.key ? '#7c6aed' : '#1e1e2e',
              color: props.region === r.key ? '#fff' : '#8a8a95',
              border: `1px solid ${props.region === r.key ? '#9d87ff' : '#2a2a3a'}`,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#fecaca',
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 6,
          padding: '8px 10px',
          lineHeight: 1.5,
        }}
      >
        <b>Heads up:</b> preset previews pull 256 × 256 favicons from
        Google's public service. Some schools return a letter mark
        instead of their crest, and none are print quality. For your
        final export, switch to the <b>Upload</b> tab and use your
        institution's official logo.
      </div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {props.filtered.length} / {LOGO_PRESETS.length} presets
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {props.filtered.map((p) => {
          const isLoading = props.loadingPresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => props.onPick(p)}
              disabled={isLoading}
              style={{
                all: 'unset',
                cursor: isLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                borderRadius: 8,
                background: '#111118',
                border: '1px solid #2a2a3a',
                transition:
                  'background 150ms ease, border-color 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#7c6aed';
                e.currentTarget.style.background = '#1e1e2e';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2a2a3a';
                e.currentTarget.style.background = '#111118';
              }}
            >
              <img
                src={logoPresetUrl(p.domain)}
                alt={`${p.name} logo`}
                width={36}
                height={36}
                style={{
                  flex: '0 0 36px',
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: '#fff',
                  objectFit: 'contain',
                  padding: 2,
                  boxSizing: 'border-box',
                }}
                onError={(e) => {
                  (e.currentTarget.style.opacity = '0.3');
                }}
              />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e2e8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {isLoading ? 'Loading…' : p.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.location}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── My Logos tab ─────────────────────────────────────────────────

function MyLogosTab(props: {
  logos: UserLogo[];
  loading: boolean;
  onPick: (logo: UserLogo) => void;
  onDelete: (logo: UserLogo) => void;
  onGoToUpload: () => void;
}) {
  if (props.loading) {
    return (
      <div style={{ fontSize: 13, color: '#8a8a95', padding: 24, textAlign: 'center' }}>
        Loading your logos…
      </div>
    );
  }
  if (props.logos.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#8a8a95',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden>
          🖼
        </div>
        <p style={{ margin: '0 0 16px' }}>
          Your logo library is empty. Upload a logo once and it'll be
          available here across every poster on your account.
        </p>
        <button
          type="button"
          onClick={props.onGoToUpload}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '10px 20px',
            background: '#7c6aed',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          + Upload a logo
        </button>
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 10,
      }}
    >
      {props.logos.map((logo) => (
        <div
          key={logo.id}
          style={{
            position: 'relative',
            padding: 10,
            borderRadius: 8,
            background: '#111118',
            border: '1px solid #2a2a3a',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <img
            src={logo.signedUrl}
            alt={logo.name}
            width={40}
            height={40}
            style={{
              flex: '0 0 40px',
              width: 40,
              height: 40,
              borderRadius: 4,
              background: '#fff',
              objectFit: 'contain',
              padding: 2,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => props.onPick(logo)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#e2e2e8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {logo.name}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Click to insert
            </div>
          </button>
          <button
            type="button"
            onClick={() => props.onDelete(logo)}
            title="Delete logo"
            aria-label={`Delete ${logo.name}`}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 4,
              color: '#6b7280',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Upload tab ───────────────────────────────────────────────────
//
// One-click upload. Picking a file triggers `onFilePicked`
// immediately — no extra confirmation button to click afterwards
// (users were frequently missing the old "Upload + insert" button
// and assuming nothing had happened). Matches Canva / Figma /
// Google Docs behaviour where "pick a file" and "apply" are the
// same gesture.

function UploadTab(props: {
  uploading: boolean;
  onFilePicked: (file: File) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#8a8a95', lineHeight: 1.55 }}>
        Upload a PNG, JPEG, SVG, or WebP file. It'll be saved to your
        logo library so you can reuse it on future posters — up to 25
        logos per account, 10 MB each.
      </p>
      <label
        htmlFor="logo-picker-file"
        style={{
          cursor: props.uploading ? 'wait' : 'pointer',
          padding: '32px 16px',
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 600,
          color: props.uploading ? '#8a8a95' : '#c8b6ff',
          background: props.uploading ? '#111118' : '#1a1630',
          border: `2px dashed ${props.uploading ? '#2a2a3a' : '#7c6aed'}`,
          borderRadius: 10,
          transition: 'border-color 150ms ease, color 150ms ease, background 150ms ease',
        }}
      >
        {props.uploading ? (
          <>Uploading…</>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 6 }} aria-hidden>
              📁
            </div>
            <div>Click to pick an image file</div>
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 400, color: '#8a8a95' }}>
              It'll be inserted straight into the logo block.
            </div>
          </>
        )}
      </label>
      <input
        id="logo-picker-file"
        type="file"
        accept="image/*"
        disabled={props.uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Reset the input value so picking the SAME file twice
          // in a row still fires onChange (the browser swallows
          // duplicate selections otherwise).
          e.target.value = '';
          if (f) props.onFilePicked(f);
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const searchInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  fontSize: 13,
  background: '#111118',
  color: '#e2e2e8',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
};
