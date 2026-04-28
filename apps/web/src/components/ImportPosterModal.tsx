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
import { useFeedbackStore } from '@/stores/feedbackStore';
import { getCapturedLog } from '@/lib/consoleCapture';

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
  // Generic flag: true when the import flow failed for any reason.
  // We deliberately do NOT show the underlying error message to the
  // user — Anthropic stack traces, Supabase storage errors, and
  // off-by-one rasterization errors are all noise from a researcher's
  // perspective and tend to scare more than help. Instead the user
  // sees "Something went wrong" with a "Send feedback" button that
  // packages the captured console log + the source file into a
  // ready-to-submit bug report.
  const [importFailed, setImportFailed] = useState(false);
  // The "user-actionable" error variants are still shown verbatim
  // (sign-in expired, unsupported file type) — those direct the user
  // to a fix instead of a bug report.
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const openFeedback = useFeedbackStore((s) => s.open);
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
  // Holds the most recent import error so the Send Feedback button
  // can include it. Not state because nothing else re-renders on it.
  const pendingErrorRef = useRef<unknown>(null);

  // Reset state when (re-)opened
  useEffect(() => {
    if (open) {
      setPhase('pick');
      setPreview(null);
      setError(null);
      setImportFailed(false);
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

  function reportImportFailure(err: unknown, file?: File | null) {
    // eslint-disable-next-line no-console
    console.error('[import] failure', err);
    setImportFailed(true);
    // Stash error + file on the source ref so the Send Feedback
    // handler can pick them up. The user sees a generic message;
    // the diagnostic data is only included if they click Send.
    pendingErrorRef.current = err;
    if (file) sourceFileRef.current = file;
  }

  function handleSendFeedback() {
    const err = pendingErrorRef.current;
    const errMsg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
    const errStack = err instanceof Error && err.stack ? err.stack : '';
    const log = getCapturedLog();
    const file = sourceFileRef.current ?? undefined;
    const fileLine = file
      ? `Source file: ${file.name} (${file.size} bytes, ${file.type || 'unknown type'})`
      : 'Source file: (none)';
    openFeedback('bug', {
      title: file ? `Import failed: ${file.name}` : 'Import failed',
      body: `Something went wrong while importing this poster.\n\n${fileLine}\n\nError: ${errMsg}${errStack ? `\n\nStack:\n${errStack}` : ''}`,
      attachment: file ?? null,
      log,
    });
  }

  async function handleFile(file: File) {
    setError(null);
    setImportFailed(false);
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
      // PdfImportError is intentionally a "user-actionable" class
      // (e.g., "Multi-page PDFs aren't supported yet") — surface its
      // message verbatim because it tells the user how to recover.
      // Everything else (vision call failed, storage upload failed,
      // pdfjs internal error) is a bug — show the generic
      // "Something went wrong" with a Send Feedback button.
      if (err instanceof PdfImportError) {
        setError(err.message);
      } else {
        reportImportFailure(err, file);
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
      // Tell the editor to auto-arrange the layout immediately
      // after first mount, so the user lands on a tidied poster
      // instead of the LLM's literal pt-coord output (which often
      // has overlaps + uneven column heights). Cleared by the
      // editor once the auto-arrange runs.
      try {
        sessionStorage.setItem(
          'postr.autoArrangeOnLoad',
          posterId,
        );
      } catch {
        // sessionStorage unavailable — safe to skip; the user can
        // still hit Auto-Arrange manually from the Layout tab.
      }
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
      data-postr-modal-backdrop
      onClick={phase === 'committing' ? undefined : onClose}
      style={overlayStyle}
    >
      <div data-postr-modal-content onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <Header onClose={onClose} disabled={phase === 'committing'} mode={mode} />

        {importFailed && (
          <div role="alert" style={failureStyle}>
            <div style={{ fontWeight: 600, color: '#fde68a', marginBottom: 4 }}>
              Something went wrong.
            </div>
            <div style={{ color: '#9ca3af', marginBottom: 10 }}>
              We couldn&apos;t finish importing this file. The error details
              and the file you uploaded are ready to share with our team —
              click below to review and send.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSendFeedback}
                style={{
                  cursor: 'pointer',
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#7c6aed',
                  border: 'none',
                  borderRadius: 6,
                }}
              >
                Send feedback
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportFailed(false);
                  pendingErrorRef.current = null;
                }}
                style={{
                  cursor: 'pointer',
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#c8cad0',
                  background: '#1a1a26',
                  border: '1px solid #2a2a3a',
                  borderRadius: 6,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
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

        {phase === 'preview' && preview && <PreviewPanel preview={preview} />}

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
            ? 'Drop a PDF, image, or .postr file. We extract the text and headings into editable blocks at their original positions.'
            : 'Replace the current poster with content from a PDF, image, or .postr file.'}
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
      <div
        style={{
          fontSize: 11,
          color: '#fbbf24',
          marginTop: 12,
          padding: '8px 12px',
          background: 'rgba(251, 191, 36, 0.06)',
          border: '1px solid rgba(251, 191, 36, 0.25)',
          borderRadius: 6,
          textAlign: 'left',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: '#fde68a' }}>Text-only import.</strong>{' '}
        We capture titles, headings, authors, body text, captions, and references at their original positions on the page. Figures, charts, tables, and logos must be re-added manually using the Insert tab. Image-based imports take ~30–90s.
      </div>
    </div>
  );
}

const STAGE_LABELS: Record<ImportProgress['stage'], string> = {
  reading: 'Reading file',
  clustering: 'Detecting text blocks',
  // Generic label that fits both pipelines: PDF text-layer extracts
  // embedded raster figures; image OCR does not (text-only mode)
  // but llm-call sub-stages still parent into here so the bar
  // doesn't flicker. "Processing page" reads naturally for both.
  'uploading-figures': 'Processing page',
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

// Pool of reassuring "still working…" phrases shown on rotation
// during long-running LLM calls. Process-honest about what's
// actually happening — text-only extraction — so the user doesn't
// feel misled when the result has no figures. The progress bar
// can't move during the LLM call (Anthropic doesn't stream token
// counts in tool-use mode), so the typewriter line carries the
// motion. Inspired by Claude Code's idle-spinner.
const LLM_WORKING_PHRASES = [
  'Reading the page layout…',
  'Locating the title and authors…',
  'Detecting section headings…',
  'Mapping the reading order…',
  'Capturing body text…',
  'Cross-checking column boundaries…',
  'Inspecting captions and footnotes…',
  'Aligning text to its original position…',
  'Tidying up the block structure…',
  'Almost there — finalising blocks…',
];

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

  // Rotating reassurance line — visible the entire time the
  // extracting phase is active, not just during slow stages. The
  // ProgressView itself is only mounted while phase==='extracting'
  // (see <ProgressView/> render gate above), so we run from first
  // paint to last with no warm-up window. `elapsedSec` counts up
  // from 0 to drive the "This is taking a while — hang tight"
  // hint past the 30 s mark. Pre-seed `typedText` with the first
  // phrase's first character so the line never starts blank.
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typedText, setTypedText] = useState(
    () => LLM_WORKING_PHRASES[0]!.slice(0, 1),
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const tickTimer = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(tickTimer);
  }, []);
  // Typewriter: type the current phrase character-by-character,
  // hold for ~1.2 s after the last char lands, then advance to the
  // next phrase. 64 ms-per-char is the slower-side CLI typewriter
  // cadence — a 50-char phrase finishes in ~3.2 s, leisurely enough
  // that the eye reads each word without rushing. First char paints
  // synchronously (no empty frame) so the line never blanks out
  // when phrases swap.
  useEffect(() => {
    const target = LLM_WORKING_PHRASES[phraseIdx]!;
    const CHAR_MS = 64;
    const HOLD_MS = 1200;
    setTypedText(target.slice(0, 1));
    let charIdx = 1;
    const typingTimer = setInterval(() => {
      charIdx += 1;
      setTypedText(target.slice(0, charIdx));
      if (charIdx >= target.length) clearInterval(typingTimer);
    }, CHAR_MS);
    const advanceTimer = setTimeout(
      () => setPhraseIdx((i) => (i + 1) % LLM_WORKING_PHRASES.length),
      target.length * CHAR_MS + HOLD_MS,
    );
    return () => {
      clearInterval(typingTimer);
      clearTimeout(advanceTimer);
    };
  }, [phraseIdx]);

  const showLongHint = elapsedSec >= 30;

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
      {/* Rotating reassurance line — visible the whole time the
          extracting phase is active. Typewriter-style reveal with
          a blinking caret keeps the eye engaged from t=0 through
          the long LLM calls. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          marginTop: 14,
          minHeight: 36,
          fontSize: 13,
          color: '#9ca3af',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          lineHeight: 1.4,
          // `tabular-nums` keeps the elapsed counter from shifting
          // width on each tick.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <div style={{ color: '#c8b6ff', fontWeight: 500 }}>
          <span>{typedText}</span>
          <span
            aria-hidden
            className="postr-caret"
            style={{
              display: 'inline-block',
              width: 7,
              marginLeft: 1,
              color: '#c8b6ff',
              fontWeight: 400,
            }}
          >
            ▍
          </span>
        </div>
        {showLongHint && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
            This is taking a little longer than usual ({elapsedSec}s) —
            hang tight, your work won&apos;t be lost.
          </div>
        )}
      </div>
      <style>{`
        @keyframes postrPulse {
          0%, 100% { transform: translateX(-100%); }
          50%      { transform: translateX(150%); }
        }
        @keyframes postrCaretBlink {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .postr-caret {
          animation: postrCaretBlink 900ms steps(1, end) infinite;
        }
      `}</style>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: PreviewState }) {
  const textBlocks = preview.doc.blocks.filter((b) =>
    ['title', 'authors', 'heading', 'text'].includes(b.type),
  ).length;
  const imageBlocks = preview.doc.blocks.filter(
    (b) => b.type === 'image' || b.type === 'logo',
  ).length;
  const headingBlocks = preview.doc.blocks.filter((b) => b.type === 'heading').length;

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
          {textBlocks} text block{textBlocks === 1 ? '' : 's'}
          {headingBlocks > 0 ? ` (incl. ${headingBlocks} heading${headingBlocks === 1 ? '' : 's'})` : ''}
          {imageBlocks > 0 ? ` · ${imageBlocks} image${imageBlocks === 1 ? '' : 's'}` : ''}{' '}
          · {preview.doc.widthIn}″ × {preview.doc.heightIn}″
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

const failureStyle: React.CSSProperties = {
  padding: '12px 14px',
  marginBottom: 12,
  fontSize: 13,
  background: 'rgba(245, 158, 11, 0.06)',
  border: '1px solid rgba(245, 158, 11, 0.3)',
  borderRadius: 8,
};
