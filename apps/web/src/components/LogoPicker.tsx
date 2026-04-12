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

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset transient state every time the modal opens so stale
    // errors / in-flight flags don't carry across sessions.
    setError(null);
    setLoadingPresetId(null);
    setUploadFile(null);
    setUploadName('');
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

  const handlePresetClick = (preset: LogoPreset) => {
    setError(null);
    // Store the URL directly instead of fetching and base64-
    // encoding the favicon. The original implementation called
    // `fetch(logoPresetUrl(domain))` so the poster would be
    // self-contained with a data URL, but Google's s2 favicons
    // endpoint does NOT send `Access-Control-Allow-Origin`
    // headers, so the fetch blows up with a CORS error — while
    // the <img> tag still renders the same URL fine (image
    // loads aren't subject to CORS for plain display).
    //
    // Tradeoff: the poster now has a remote URL in `imageSrc`
    // and the logo re-fetches at every render. If the user
    // exports via html-to-image, the logo may be skipped (image
    // can't be CORS-cloned into a canvas) — that's why the
    // Presets tab text prompts users to upload their own
    // high-res file from the Upload tab before print. For
    // browser-print PDF export the external URL works fine.
    onPick(logoPresetUrl(preset.domain));
    onClose();
  };

  const handleMyLogoClick = (logo: UserLogo) => {
    onPick(logo.signedUrl);
    onClose();
  };

  const handleUploadConfirm = async () => {
    if (!uploadFile) {
      setError('Pick a file first.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const logo = await uploadUserLogo(uploadFile, uploadName);
      // Convert to data URL so the block's imageSrc doesn't depend
      // on the signed URL expiring — we still save the row for
      // future re-use from My Logos.
      const res = await fetch(logo.signedUrl);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Read failed.'));
        r.readAsDataURL(blob);
      });
      onPick(dataUrl);
      onClose();
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
              file={uploadFile}
              setFile={setUploadFile}
              name={uploadName}
              setName={setUploadName}
              uploading={uploading}
              onConfirm={handleUploadConfirm}
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
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {props.filtered.length} / {LOGO_PRESETS.length} presets. Previews use
        Google favicons (256 × 256) — upload your own high-res file via the
        Upload tab before exporting for print.
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

function UploadTab(props: {
  file: File | null;
  setFile: (f: File | null) => void;
  name: string;
  setName: (n: string) => void;
  uploading: boolean;
  onConfirm: () => void;
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
          cursor: 'pointer',
          padding: '22px 16px',
          textAlign: 'center',
          fontSize: 13,
          color: props.file ? '#e2e2e8' : '#8a8a95',
          background: '#111118',
          border: `2px dashed ${props.file ? '#7c6aed' : '#2a2a3a'}`,
          borderRadius: 8,
          transition: 'border-color 150ms ease, color 150ms ease',
        }}
      >
        {props.file
          ? `✓ ${props.file.name} (${(props.file.size / 1024).toFixed(0)} KB)`
          : 'Click to pick an image file…'}
      </label>
      <input
        id="logo-picker-file"
        type="file"
        accept="image/*"
        onChange={(e) => props.setFile(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
      <div>
        <label
          htmlFor="logo-picker-name"
          style={{ fontSize: 12, color: '#8a8a95', fontWeight: 600 }}
        >
          Logo name
        </label>
        <input
          id="logo-picker-name"
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          placeholder="e.g. Smith Lab at Harvard"
          style={{ ...searchInputStyle, marginTop: 6 }}
        />
      </div>
      <button
        type="button"
        onClick={props.onConfirm}
        disabled={!props.file || props.uploading}
        style={{
          all: 'unset',
          cursor: props.file && !props.uploading ? 'pointer' : 'not-allowed',
          padding: '12px 18px',
          background: props.file && !props.uploading ? '#7c6aed' : '#2a2a3a',
          color: props.file && !props.uploading ? '#fff' : '#6b7280',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          textAlign: 'center',
          alignSelf: 'flex-start',
          opacity: props.file && !props.uploading ? 1 : 0.6,
        }}
      >
        {props.uploading ? 'Uploading…' : 'Upload + insert'}
      </button>
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
