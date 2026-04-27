/**
 * ImportPosterModal — drop a PDF or `.postr` file → preview → Confirm.
 *
 * Two operating modes:
 *  - **new**: dashboard flow. Mints a fresh poster row via `createPoster()`,
 *             loads the imported doc into it, navigates to /p/{id}.
 *  - **replace**: sidebar flow. Replaces the active poster's doc.
 *             Requires an enclosing `ImportConfirmReplaceModal` to be
 *             shown by the caller before opening this modal.
 *
 * Tier 0 only accepts `.pdf` (text-layer) and `.postr`. Image inputs
 * surface a "coming next release" toast routed at Tier 1.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportProgress, PosterDoc } from '@postr/shared';
import { supabase } from '@/lib/supabase';
import { createPoster, deletePoster, upsertPoster } from '@/data/posters';
import { usePosterStore } from '@/stores/posterStore';
import {
  PdfImportError,
  extractFromPdf,
} from '@/import/pdfImport';
import { extractFromImage } from '@/import/imageImport';
import { importPostr } from '@/import/postrFile';

export type ImportPosterMode = 'new' | 'replace';

interface Props {
  open: boolean;
  mode: ImportPosterMode;
  /** When `mode === 'replace'`, the active poster id to overwrite. */
  targetPosterId?: string;
  onClose: () => void;
}

type Phase = 'pick' | 'extracting' | 'preview' | 'committing';

interface PreviewState {
  doc: PosterDoc;
  title: string;
  warnings: string[];
  thumbnailUrl: string | null;
}

const ACCEPT =
  '.pdf,.postr,.png,.jpg,.jpeg,application/pdf,application/zip,image/*';

export function ImportPosterModal({ open, mode, targetPosterId, onClose }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pick');
  const [progress, setProgress] = useState<ImportProgress>({ stage: 'reading' });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Held outside React state so the commit closure sees the latest id
  // even between re-renders. MUST be declared before any conditional
  // early-return to keep React hook order stable.
  const pendingPosterIdRef = useRef<string | null>(null);
  // Tracks the most-recently-minted poster row that hasn't been
  // committed yet. If the user dismisses the modal (Esc, click-out,
  // close button) while an extraction in progress fails, we sweep
  // this ref on unmount.
  const cleanupPosterIdRef = useRef<string | null>(null);
  // Cached source File so the "Try LLM extraction" button can re-run
  // image OCR on the same input without making the user re-drop.
  const sourceFileRef = useRef<File | null>(null);

  // Reset state when (re-)opened
  useEffect(() => {
    if (open) {
      setPhase('pick');
      setPreview(null);
      setError(null);
      setProgress({ stage: 'reading' });
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'committing') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, phase, onClose]);

  if (!open) return null;

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    sourceFileRef.current = file;

    const lower = file.name.toLowerCase();
    setPhase('extracting');

    // Declared OUTSIDE the try so the catch can roll back the mint.
    let mintedPosterId: string | null = null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError('Sign-in expired. Please refresh and try again.');
        setPhase('pick');
        return;
      }

      // The figure-upload step needs a posterId so storage paths line
      // up. In `new` mode we pre-mint the poster row up front; in
      // `replace` mode we reuse the active poster id.
      let posterId = targetPosterId ?? null;
      if (!posterId) {
        const row = await createPoster();
        posterId = row.id;
        mintedPosterId = row.id;
      }

      let doc: PosterDoc;
      let title: string;
      let warnings: string[] = [];

      if (lower.endsWith('.postr')) {
        setProgress({ stage: 'reading' });
        const result = await importPostr(file, posterId, userId);
        doc = result.doc;
        title = result.title ?? 'Imported poster';
        if (!result.hashMatch) {
          warnings.push(
            'Bundle hash check failed — the file may have been edited outside Postr.',
          );
        }
        setProgress({ stage: 'ready' });
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        const synth = await extractFromPdf(file, posterId, userId, (p) =>
          setProgress(p),
        );
        doc = synth.doc;
        title = synth.title;
        warnings = synth.warnings;
      } else if (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        file.type.startsWith('image/')
      ) {
        // Tier 1 image OCR path — vision LLM extracts text + figures.
        const synth = await extractFromImage(file, posterId, userId, (p) =>
          setProgress(p),
        );
        doc = synth.doc;
        title = synth.title;
        warnings = synth.warnings;
      } else {
        setError('Unsupported file type. Drop a .pdf, image, or .postr file.');
        setPhase('pick');
        return;
      }

      const thumbnailUrl = await renderThumbnail(file).catch(() => null);

      setPreview({ doc, title, warnings, thumbnailUrl });
      setPhase('preview');

      // Stash posterId on a ref via closure for the commit step.
      pendingPosterIdRef.current = posterId;
      // Successful extraction — clear the cleanup latch so the row
      // survives if the user actually confirms.
      cleanupPosterIdRef.current = null;
    } catch (err) {
      if (err instanceof PdfImportError) {
        setError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Import failed.';
        setError(msg);
      }
      // Clean up the orphan row we minted at the top of this fn.
      // Best-effort: a failed delete leaves the row but we logged it.
      if (mintedPosterId) {
        cleanupPosterIdRef.current = mintedPosterId;
        deletePoster(mintedPosterId).catch((cleanupErr) => {
          // eslint-disable-next-line no-console
          console.warn(
            'Import failed and cleanup also failed:',
            cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
          );
        });
      }
      setPhase('pick');
    }
  }

  async function handleTryLlm() {
    const file = sourceFileRef.current;
    if (!file) return;
    setError(null);
    setPhase('extracting');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError('Sign-in expired. Please refresh and try again.');
        setPhase('preview');
        return;
      }
      let posterId = pendingPosterIdRef.current ?? targetPosterId ?? null;
      if (!posterId) {
        const row = await createPoster();
        posterId = row.id;
      }
      const synth = await extractFromImage(file, posterId, userId, (p) =>
        setProgress(p),
      );
      const thumbnailUrl =
        preview?.thumbnailUrl ?? (await renderThumbnail(file).catch(() => null));
      setPreview({
        doc: synth.doc,
        title: synth.title,
        warnings: synth.warnings,
        thumbnailUrl,
      });
      pendingPosterIdRef.current = posterId;
      setPhase('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'LLM extraction failed.';
      setError(msg);
      setPhase('preview');
    }
  }

  async function handleConfirm() {
    if (!preview || !pendingPosterIdRef.current) return;
    const posterId = pendingPosterIdRef.current;
    setPhase('committing');
    try {
      await upsertPoster(posterId, {
        title: preview.title,
        widthIn: preview.doc.widthIn,
        heightIn: preview.doc.heightIn,
        data: preview.doc,
      });
      usePosterStore.getState().setPoster(posterId, preview.doc, preview.title);
      onClose();
      // Navigate after closing so the modal isn't hanging on the next route.
      if (mode === 'new') {
        navigate(`/p/${posterId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setError(msg);
      setPhase('preview');
    }
  }

  return (
    <div
      onClick={phase === 'committing' ? undefined : onClose}
      style={overlayStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <Header onClose={onClose} disabled={phase === 'committing'} mode={mode} />

        {error && (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        )}

        {phase === 'pick' && (
          <DropZone
            dragActive={dragActive}
            setDragActive={setDragActive}
            onFile={handleFile}
            onPick={() => fileRef.current?.click()}
          />
        )}

        {phase === 'extracting' && <ProgressView progress={progress} />}

        {phase === 'preview' && preview && (
          <PreviewPanel
            preview={preview}
            onTryLlm={handleTryLlm}
            llmAvailable={!!sourceFileRef.current}
          />
        )}

        {phase === 'committing' && <Committing />}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // reset so picking the same file twice still fires
            e.target.value = '';
          }}
        />

        {(phase === 'preview' || phase === 'pick') && (
          <Footer
            canConfirm={phase === 'preview' && !!preview}
            onCancel={onClose}
            onConfirm={handleConfirm}
            confirmLabel={
              mode === 'new' ? 'Create poster from import' : 'Replace current poster'
            }
            danger={mode === 'replace'}
          />
        )}
      </div>
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────

function Header({
  onClose,
  disabled,
  mode,
}: {
  onClose: () => void;
  disabled: boolean;
  mode: ImportPosterMode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#e2e2e8' }}>
          Import poster
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          {mode === 'new'
            ? 'Drop a PDF or .postr file. We extract text + figures into editable blocks.'
            : 'Replace the current poster with content from a PDF or .postr file.'}
        </p>
      </div>
      <button
        onClick={onClose}
        disabled={disabled}
        aria-label="Close"
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'transparent',
          border: '1px solid #2a2a3a',
          color: '#9ca3af',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function DropZone({
  dragActive,
  setDragActive,
  onFile,
  onPick,
}: {
  dragActive: boolean;
  setDragActive: (b: boolean) => void;
  onFile: (file: File) => void;
  onPick: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={onPick}
      style={{
        border: `2px dashed ${dragActive ? '#7c6aed' : '#2a2a3a'}`,
        borderRadius: 10,
        padding: '40px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragActive ? 'rgba(124, 106, 237, 0.06)' : 'transparent',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
      <div style={{ fontSize: 14, color: '#e2e2e8', marginBottom: 4 }}>
        Drop file here or click to browse
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        PDF · PNG / JPG · .postr bundle
      </div>
      <div style={{ fontSize: 11, color: '#555', marginTop: 12 }}>
        Image inputs are processed through Claude Vision (~5–15s).
      </div>
    </div>
  );
}

const STAGE_LABELS: Record<ImportProgress['stage'], string> = {
  reading: 'Reading file',
  clustering: 'Detecting text blocks',
  'uploading-figures': 'Extracting figures',
  'llm-call': 'Calling vision model',
  'building-preview': 'Building preview',
  ready: 'Ready',
  error: 'Error',
};

const STAGE_ORDER: ImportProgress['stage'][] = [
  'reading',
  'clustering',
  'uploading-figures',
  'building-preview',
  'ready',
];

/** Sub-stages that don't have their own todo-row but conceptually
 *  belong to one. The LLM verifier fires `llm-call` during the
 *  upload-figures step; without this mapping `currentIdx = -1` and
 *  every prior step would briefly revert to gray. */
const STAGE_PARENT: Partial<Record<ImportProgress['stage'], ImportProgress['stage']>> = {
  'llm-call': 'uploading-figures',
};

function ProgressView({ progress }: { progress: ImportProgress }) {
  // Map sub-stages to their parent so the rendered todo doesn't
  // regress when the importer transitions through an unlisted
  // sub-stage.
  const effectiveStage = STAGE_PARENT[progress.stage] ?? progress.stage;
  const liveIdx = STAGE_ORDER.indexOf(effectiveStage);

  // Once a stage has been reached we keep it (and all earlier
  // stages) visually completed — done items stay green + struck-
  // through even if a later transition lands on an unknown stage.
  const maxStageIdxRef = useRef(-1);
  if (liveIdx > maxStageIdxRef.current) {
    maxStageIdxRef.current = liveIdx;
  }
  const currentIdx = maxStageIdxRef.current;

  const ratio =
    progress.ratio !== undefined
      ? Math.max(0, Math.min(1, progress.ratio))
      : null;

  return (
    <div style={{ padding: '20px 8px' }}>
      <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', fontSize: 13 }}>
        {STAGE_ORDER.filter((s) => s !== 'ready').map((s, idx) => {
          const isCurrent = idx === currentIdx;
          const isDone = currentIdx > idx;
          const color = isCurrent ? '#c8b6ff' : isDone ? '#a6e3a1' : '#555';
          const icon = isDone ? '✓' : isCurrent ? '●' : '○';
          return (
            <li
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 0',
                color,
              }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>
              <span
                style={{
                  textDecoration: isDone ? 'line-through' : undefined,
                  textDecorationColor: isDone ? '#a6e3a1' : undefined,
                }}
              >
                {STAGE_LABELS[s]}
              </span>
              {isCurrent && progress.detail && (
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  · {progress.detail}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div
        style={{
          height: 4,
          background: '#1a1a26',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: ratio !== null ? `${ratio * 100}%` : '40%',
            background: '#7c6aed',
            transition: 'width 200ms',
            animation: ratio === null ? 'postrPulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
      </div>
      <style>{`
        @keyframes postrPulse {
          0%, 100% { transform: translateX(-100%); }
          50%      { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
}

function PreviewPanel({
  preview,
  onTryLlm,
  llmAvailable,
}: {
  preview: PreviewState;
  onTryLlm: () => void;
  llmAvailable: boolean;
}) {
  const textBlocks = preview.doc.blocks.filter((b) =>
    ['title', 'authors', 'heading', 'text'].includes(b.type),
  ).length;
  const imageBlocks = preview.doc.blocks.filter((b) => b.type === 'image' || b.type === 'logo').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
      <div
        style={{
          background: '#0a0a12',
          border: '1px solid #2a2a3a',
          borderRadius: 8,
          aspectRatio: `${preview.doc.widthIn}/${preview.doc.heightIn}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: 11,
        }}
      >
        {preview.thumbnailUrl ? (
          <img
            src={preview.thumbnailUrl}
            alt="Source preview"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          'preview'
        )}
      </div>
      <div>
        <div style={{ fontSize: 14, color: '#e2e2e8', marginBottom: 4, fontWeight: 500 }}>
          {preview.title}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
          {textBlocks} text blocks · {imageBlocks} images ·{' '}
          {preview.doc.widthIn}″ × {preview.doc.heightIn}″
        </div>
        {preview.warnings.length > 0 && (
          <ul
            style={{
              margin: 0,
              padding: '10px 12px 10px 28px',
              fontSize: 12,
              color: '#fbbf24',
              background: 'rgba(251, 191, 36, 0.06)',
              border: '1px solid rgba(251, 191, 36, 0.2)',
              borderRadius: 6,
              lineHeight: 1.5,
            }}
          >
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <button
          onClick={onTryLlm}
          disabled={!llmAvailable}
          title={
            llmAvailable
              ? 'Re-run extraction via Claude Vision for higher accuracy'
              : 'Only available for PDF / image inputs'
          }
          style={{
            marginTop: 12,
            padding: '6px 10px',
            fontSize: 12,
            color: llmAvailable ? '#c8b6ff' : '#555',
            background: '#1a1a26',
            border: `1px ${llmAvailable ? 'solid' : 'dashed'} ${llmAvailable ? '#7c6aed' : '#2a2a3a'}`,
            borderRadius: 6,
            cursor: llmAvailable ? 'pointer' : 'not-allowed',
          }}
        >
          ✨ Try LLM extraction
        </button>
      </div>
    </div>
  );
}

function Committing() {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>Saving poster…</div>
      <div style={{ fontSize: 12 }}>This usually takes a second or two.</div>
    </div>
  );
}

function Footer({
  canConfirm,
  onCancel,
  onConfirm,
  confirmLabel,
  danger,
}: {
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  danger: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid #2a2a3a',
      }}
    >
      <button
        onClick={onCancel}
        style={{
          cursor: 'pointer',
          padding: '8px 16px',
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
        onClick={onConfirm}
        disabled={!canConfirm}
        style={{
          cursor: canConfirm ? 'pointer' : 'not-allowed',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background: canConfirm ? (danger ? '#dc2626' : '#7c6aed') : '#2a2a3a',
          border: 'none',
          borderRadius: 6,
          opacity: canConfirm ? 1 : 0.5,
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

async function renderThumbnail(file: File): Promise<string | null> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    // Lazy-import to keep the modal bundle small if the user only ever
    // imports .postr bundles.
    const pdfjs = await import('pdfjs-dist');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  }
  return null;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 540,
  background: '#111118',
  border: '1px solid #2a2a3a',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  marginBottom: 12,
  fontSize: 13,
  color: '#fca5a5',
  background: 'rgba(220, 38, 38, 0.08)',
  border: '1px solid rgba(220, 38, 38, 0.4)',
  borderRadius: 6,
};
