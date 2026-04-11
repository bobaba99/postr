/**
 * PublishGalleryModal — metadata form + image capture for the public
 * gallery publish flow.
 *
 * Opens *after* the PublishConsentModal has been accepted. Handles:
 *   - auto-capture of #poster-canvas via html-to-image (editor path)
 *   - manual screenshot upload (fallback if capture fails, and the
 *     default flow when publishing from the dashboard where the
 *     poster isn't rendered)
 *   - the metadata form (title, field, conference, year, notes)
 *   - creating the gallery entry via data/gallery.ts
 *
 * On success it calls onSuccess with the new entry id so the caller
 * can navigate to /gallery/:id.
 */
import { useEffect, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import {
  createGalleryEntry,
  FIELD_OPTIONS,
  type GalleryField,
} from '@/data/gallery';

interface Props {
  open: boolean;
  posterId?: string | null;
  defaultTitle?: string;
  /** Called with the new gallery entry id on success. */
  onSuccess: (entryId: string) => void;
  onCancel: () => void;
}

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'capturing' }
  | { kind: 'ready'; blob: Blob; previewUrl: string; ext: 'png' }
  | { kind: 'uploaded'; blob: Blob; previewUrl: string; ext: 'png' | 'jpg' | 'jpeg' | 'webp' }
  | { kind: 'error'; message: string };

const CURRENT_YEAR = new Date().getFullYear();

export function PublishGalleryModal({
  open,
  posterId,
  defaultTitle,
  onSuccess,
  onCancel,
}: Props) {
  const [capture, setCapture] = useState<CaptureState>({ kind: 'idle' });
  const [title, setTitle] = useState('');
  const [field, setField] = useState<GalleryField>('neuroscience');
  const [conference, setConference] = useState('');
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset everything when the modal opens. Try an auto-capture if
  // the editor's poster-canvas element exists; otherwise the user has
  // to upload a screenshot themselves.
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? '');
    setField('neuroscience');
    setConference('');
    setYear(String(CURRENT_YEAR));
    setNotes('');
    setSubmitError(null);
    setSubmitting(false);

    const canvas = document.getElementById('poster-canvas');
    if (!canvas) {
      setCapture({ kind: 'idle' });
      return;
    }

    setCapture({ kind: 'capturing' });
    captureCanvas(canvas as HTMLElement)
      .then((blob) => {
        const previewUrl = URL.createObjectURL(blob);
        setCapture({ kind: 'ready', blob, previewUrl, ext: 'png' });
      })
      .catch((err) => {
        setCapture({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Capture failed',
        });
      });
  }, [open, defaultTitle]);

  // Revoke blob URLs when the modal closes so we don't leak memory.
  useEffect(() => {
    if (open) return;
    setCapture((prev) => {
      if (prev.kind === 'ready' || prev.kind === 'uploaded') {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { kind: 'idle' };
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, submitting]);

  if (!open) return null;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = inferExtFromFile(file);
    if (!ext) {
      setCapture({
        kind: 'error',
        message: 'Please upload a PNG, JPG, or WebP image.',
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setCapture({
        kind: 'error',
        message: 'Image is too large (max 15 MB).',
      });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setCapture({ kind: 'uploaded', blob: file, previewUrl, ext });
  }

  async function handleSubmit() {
    if (capture.kind !== 'ready' && capture.kind !== 'uploaded') {
      setSubmitError('Please capture or upload an image first.');
      return;
    }
    const parsedYear = parseInt(year, 10);
    if (year && (Number.isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100)) {
      setSubmitError('Year must be between 1900 and 2100.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const entry = await createGalleryEntry({
        source: posterId ? 'postr_poster' : 'upload',
        poster_id: posterId ?? null,
        image_file: capture.blob,
        image_ext: capture.ext,
        title,
        field,
        conference: conference.trim() || null,
        year: year ? parsedYear : null,
        notes: notes.trim() || null,
      });
      onSuccess(entry.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    (capture.kind === 'ready' || capture.kind === 'uploaded') &&
    title.trim().length > 0;

  return (
    <div
      onClick={submitting ? undefined : onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#e2e2e8' }}>
          Publish to the gallery
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>
          Add the details that help other researchers find your poster, then hit
          publish.
        </p>

        {/* Preview / capture area */}
        <PreviewArea
          capture={capture}
          onRetry={() => {
            const canvas = document.getElementById('poster-canvas');
            if (!canvas) {
              setCapture({
                kind: 'error',
                message: 'No poster to capture. Upload a screenshot instead.',
              });
              return;
            }
            setCapture({ kind: 'capturing' });
            captureCanvas(canvas as HTMLElement)
              .then((blob) => {
                const previewUrl = URL.createObjectURL(blob);
                setCapture({ kind: 'ready', blob, previewUrl, ext: 'png' });
              })
              .catch((err) => {
                setCapture({
                  kind: 'error',
                  message: err instanceof Error ? err.message : 'Capture failed',
                });
              });
          }}
          onPickFile={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        {/* Metadata form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Neural correlates of decision-making in rodents"
              maxLength={200}
              disabled={submitting}
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Field">
              <select
                value={field}
                onChange={(e) => setField(e.target.value as GalleryField)}
                disabled={submitting}
                style={inputStyle}
              >
                {FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                type="number"
                min={1900}
                max={2100}
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Conference (optional)">
            <input
              value={conference}
              onChange={(e) => setConference(e.target.value)}
              placeholder="e.g. Society for Neuroscience 2026"
              maxLength={200}
              disabled={submitting}
              style={inputStyle}
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, takeaways, what worked. Plain text, 2000 characters max."
              maxLength={2000}
              rows={4}
              disabled={submitting}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        {submitError && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: '10px 12px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: 6,
              color: '#f87171',
              fontSize: 13,
            }}
          >
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              cursor: submitting ? 'not-allowed' : 'pointer',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 500,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: '#7c6aed',
              border: 'none',
              borderRadius: 6,
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            {submitting ? 'Publishing…' : 'Publish to gallery'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview area ─────────────────────────────────────────────────────

function PreviewArea({
  capture,
  onRetry,
  onPickFile,
}: {
  capture: CaptureState;
  onRetry: () => void;
  onPickFile: () => void;
}) {
  const hasImage = capture.kind === 'ready' || capture.kind === 'uploaded';

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px dashed ${hasImage ? '#2a2a3a' : '#2a2a3a'}`,
        background: '#0a0a12',
        padding: 16,
        minHeight: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {capture.kind === 'idle' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af' }}>
            Upload an image of the poster you want to publish.
            <br />
            PNG, JPG, or WebP, max 15&nbsp;MB.
          </p>
          <button type="button" onClick={onPickFile} style={secondaryButtonStyle}>
            Choose file
          </button>
        </div>
      )}
      {capture.kind === 'capturing' && (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          Capturing poster…
        </div>
      )}
      {capture.kind === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#f87171' }}>
            {capture.message}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" onClick={onRetry} style={secondaryButtonStyle}>
              Retry auto-capture
            </button>
            <button type="button" onClick={onPickFile} style={secondaryButtonStyle}>
              Upload image instead
            </button>
          </div>
        </div>
      )}
      {hasImage && (
        <div style={{ width: '100%' }}>
          <img
            src={capture.previewUrl}
            alt="Preview"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 280,
              objectFit: 'contain',
              borderRadius: 4,
              background: '#000',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
              fontSize: 12,
              color: '#6b7280',
            }}
          >
            <span>
              {capture.kind === 'ready' ? 'Auto-captured from editor' : 'Uploaded image'}
            </span>
            <button type="button" onClick={onPickFile} style={linkButtonStyle}>
              Replace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#c8cad0',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  color: '#e2e2e8',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
};

const secondaryButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const linkButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  color: '#7c6aed',
  fontSize: 12,
  textDecoration: 'underline',
  padding: 0,
};

// ── Capture helper ───────────────────────────────────────────────────

async function captureCanvas(el: HTMLElement): Promise<Blob> {
  // Temporarily neutralize the CSS zoom transform so html-to-image
  // captures the poster at its true dimensions. Save and restore.
  const prevTransform = el.style.transform;
  const prevTransformOrigin = el.style.transformOrigin;
  el.style.transform = 'scale(1)';
  el.style.transformOrigin = 'top left';

  try {
    const blob = await toBlob(el, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: '#ffffff',
    });
    if (!blob) throw new Error('Capture returned no data.');
    return blob;
  } finally {
    el.style.transform = prevTransform;
    el.style.transformOrigin = prevTransformOrigin;
  }
}

function inferExtFromFile(file: File): 'png' | 'jpg' | 'jpeg' | 'webp' | null {
  const type = file.type.toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return null;
}
