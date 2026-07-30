/**
 * CopyDesignModal — Style tab → "Copy a design" (Phase 1: colours +
 * fonts; docs/plans/2026-07-27-design-style-extraction.md §4).
 *
 * Drop a poster you admire → extraction → a live before/after of the
 * USER'S OWN poster with toggles for which parts to take. Their
 * content never comes across — the extraction schema cannot express
 * it. Apply is a single undoable store mutation, so the escape hatch
 * is ⌘Z and no confirmation dialog is needed.
 *
 * Confidence is surfaced, not hidden: below 0.5 the modal leads with
 * "we weren't sure" and pre-selects only colours. When the style call
 * fails entirely, the client-side colours still work — the modal
 * offers colours-only rather than nothing (plan §5).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useModalTransition } from '@/hooks/useModalTransition';
import { BusyIndicator, busyProps } from './BusyIndicator';
import { usePosterStore } from '@/stores/posterStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { getCapturedLog } from '@/lib/consoleCapture';
import { auditPaletteCB } from '@/poster/colorblind';
import { ensureFontLoaded } from '@/poster/fontLoader';
import {
  StyleImportError,
  extractStyleFromFile,
  type StyleImportResult,
  type StyleImportStage,
} from '@/import/styleImport';
import { StyleMiniPreview } from './StyleMiniPreview';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = 'pick' | 'extracting' | 'preview';

/** Pre-select fonts only when the extraction is confident (plan §4). */
const LOW_CONFIDENCE = 0.5;

const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/*';

const STAGE_LABELS: Record<StyleImportStage, string> = {
  reading: 'Reading the file',
  colours: 'Reading the colours',
  matching: 'Matching the design',
};

export function CopyDesignModal({ open, onClose }: Props) {
  const doc = usePosterStore((s) => s.doc);
  const posterId = usePosterStore((s) => s.posterId);
  const applyExtractedStyle = usePosterStore((s) => s.applyExtractedStyle);
  const openFeedback = useFeedbackStore((s) => s.open);

  const [phase, setPhase] = useState<Phase>('pick');
  const [stage, setStage] = useState<StyleImportStage>('reading');
  const [result, setResult] = useState<StyleImportResult | null>(null);
  const [takeColours, setTakeColours] = useState(true);
  const [takeFonts, setTakeFonts] = useState(true);
  // User-actionable message (unreadable file, rate limit) — rendered
  // verbatim in the pick phase, deliberately NOT an error dialog.
  const [notice, setNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<File | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase('pick');
      setResult(null);
      setNotice(null);
      setTakeColours(true);
      setTakeFonts(true);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Warm the candidate font so the "after" preview shows it for real.
  const extractedFont = result?.extracted?.fontFamily ?? null;
  useEffect(() => {
    if (extractedFont) ensureFontLoaded(extractedFont);
  }, [extractedFont]);

  const { mounted, state } = useModalTransition(open);
  if (!mounted || !doc || !posterId) return null;

  async function handleFile(file: File) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setNotice(null);
    sourceFileRef.current = file;
    setPhase('extracting');
    setStage('reading');
    try {
      const r = await extractStyleFromFile(file, posterId!, setStage);
      setResult(r);
      // Toggle defaults (plan §4): colours always on; fonts only when
      // extraction succeeded, matched a curated family, and was
      // confident. Low confidence pre-selects colours only.
      const confidentFont =
        !r.coloursOnly &&
        r.extracted !== null &&
        r.extracted.fontFamily !== null &&
        r.extracted.confidence >= LOW_CONFIDENCE;
      setTakeColours(true);
      setTakeFonts(confidentFont);
      setPhase('preview');
    } catch (err) {
      if (err instanceof StyleImportError) {
        setNotice(err.userMessage);
      } else {
        // Unexpected — generic message, details go with Send Feedback.
        setNotice('Something went wrong.');
        // eslint-disable-next-line no-console
        console.error('[copy-design] failure', err);
      }
      setPhase('pick');
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleSendFeedback(err: unknown) {
    const errMsg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
    const file = sourceFileRef.current ?? undefined;
    openFeedback('bug', {
      title: 'Copy a design failed',
      body: `Something went wrong while copying a design.\n\nSource file: ${
        file ? `${file.name} (${file.size} bytes)` : '(none)'
      }\n\nError: ${errMsg}`,
      attachment: file ?? null,
      log: getCapturedLog(),
    });
  }

  function handleApply() {
    if (!result) return;
    const fontFamily =
      takeFonts && result.extracted?.fontFamily
        ? result.extracted.fontFamily
        : undefined;
    applyExtractedStyle({
      ...(takeColours ? { palette: result.palette } : {}),
      ...(fontFamily ? { fontFamily } : {}),
    });
    onClose();
  }

  const lowConfidence =
    result?.extracted != null && result.extracted.confidence < LOW_CONFIDENCE;
  const cb = result && takeColours ? auditPaletteCB(result.palette) : null;
  const canApply =
    phase === 'preview' &&
    result !== null &&
    (takeColours || (takeFonts && !!result.extracted?.fontFamily));

  const candidatePalette =
    result && takeColours ? result.palette : doc.palette;
  const candidateFont =
    result && takeFonts && result.extracted?.fontFamily
      ? result.extracted.fontFamily
      : doc.fontFamily;

  return (
    <div
      data-postr-modal-backdrop
      data-state={state}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={overlayStyle}
    >
      <div
        data-postr-modal-content
        data-state={state}
        style={modalStyle}
        role="dialog"
        aria-label="Copy a design"
      >
        <Header onClose={onClose} />

        {notice && (
          <div role="status" style={noticeStyle}>
            {notice}
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

        {phase === 'extracting' && (
          <div style={{ padding: '32px 8px' }} {...busyProps(true)}>
            {/* The stage label changes as extraction progresses, and
                BusyIndicator's live region announces each change — a
                screen-reader user hears the same progression a sighted
                user watches. */}
            <BusyIndicator
              label={`${STAGE_LABELS[stage]}…`}
              hint="Reading a PDF or a large image can take a few seconds."
            />
          </div>
        )}

        {phase === 'preview' && result && (
          <>
            {result.coloursOnly && (
              <div role="alert" style={coloursOnlyStyle}>
                <div style={{ fontWeight: 600, color: '#fde68a', marginBottom: 4 }}>
                  Something went wrong reading the full design.
                </div>
                <div style={{ color: '#9ca3af', marginBottom: 8 }}>
                  You can still apply the colours we found on the page.
                </div>
                <button
                  type="button"
                  onClick={() => handleSendFeedback(result.visionError)}
                  style={feedbackBtnStyle}
                >
                  Send feedback
                </button>
              </div>
            )}

            {!result.coloursOnly && lowConfidence && (
              <div role="status" style={lowConfidenceStyle}>
                We weren&apos;t sure about this one — starting with colours
                only. Toggle fonts on if the match looks right.
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <StyleMiniPreview
                doc={doc}
                palette={doc.palette}
                fontFamily={doc.fontFamily}
                label="Now"
              />
              <StyleMiniPreview
                doc={doc}
                palette={candidatePalette}
                fontFamily={candidateFont}
                label="With copied style"
              />
            </div>

            <div style={{ display: 'flex', gap: 18, marginBottom: 6 }}>
              <Toggle
                label="Colours"
                checked={takeColours}
                onChange={setTakeColours}
              />
              <Toggle
                label={
                  result.extracted?.fontFamily
                    ? `Font — ${result.extracted.fontFamily}`
                    : 'Font'
                }
                checked={takeFonts && !!result.extracted?.fontFamily}
                onChange={setTakeFonts}
                disabled={!result.extracted?.fontFamily}
              />
            </div>

            {cb && !cb.safe && (
              <div role="status" style={cbWarningStyle}>
                ◐ Heads up: under {cb.worstPair.type}, “{cb.worstPair.a}” and
                “{cb.worstPair.b}” in the copied palette may look alike. You
                can still apply it.
              </div>
            )}
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

        {(phase === 'pick' || phase === 'preview') && (
          <div style={footerStyle}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>
              Cancel
            </button>
            {phase === 'preview' && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!canApply}
                style={applyBtnStyle(canApply)}
              >
                Apply — undo with ⌘Z
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#e2e2e8' }}>
          Copy a design
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Upload a poster you admire — we lift its colours and type and
          apply them to <em>your</em> poster. Copies the look, not the
          content.
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'transparent',
          border: '1px solid #2a2a3a',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          flexShrink: 0,
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
        padding: '36px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragActive ? 'rgba(124, 106, 237, 0.06)' : 'transparent',
        transition:
          'background var(--dur-press) var(--ease-out), border-color var(--dur-press) var(--ease-out)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
      <div style={{ fontSize: 14, color: '#e2e2e8', marginBottom: 4 }}>
        Drop a poster here or click to browse
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        PDF · PNG / JPG — a photo of the whole poster works
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: disabled ? '#555' : '#e2e2e8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#7c6aed', width: 15, height: 15 }}
      />
      {label}
    </label>
  );
}

// ── styles ──────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
};

const modalStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#111118',
  border: '1px solid #2a2a3a',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
};

const noticeStyle: CSSProperties = {
  padding: '10px 12px',
  marginBottom: 12,
  fontSize: 13,
  color: '#fbbf24',
  background: 'rgba(251, 191, 36, 0.06)',
  border: '1px solid rgba(251, 191, 36, 0.25)',
  borderRadius: 6,
  lineHeight: 1.5,
};

const coloursOnlyStyle: CSSProperties = {
  padding: '12px 14px',
  marginBottom: 12,
  fontSize: 13,
  background: 'rgba(245, 158, 11, 0.06)',
  border: '1px solid rgba(245, 158, 11, 0.3)',
  borderRadius: 8,
};

const lowConfidenceStyle: CSSProperties = {
  padding: '10px 12px',
  marginBottom: 12,
  fontSize: 12,
  color: '#c8b6ff',
  background: 'rgba(124, 106, 237, 0.08)',
  border: '1px solid rgba(124, 106, 237, 0.3)',
  borderRadius: 6,
  lineHeight: 1.5,
};

const cbWarningStyle: CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  fontSize: 12,
  color: '#e2a550',
  background: 'rgba(226, 165, 80, 0.06)',
  border: '1px solid rgba(226, 165, 80, 0.25)',
  borderRadius: 6,
  lineHeight: 1.5,
};

const feedbackBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
};

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 20,
  paddingTop: 16,
  borderTop: '1px solid #2a2a3a',
};

const cancelBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const applyBtnStyle = (enabled: boolean): CSSProperties => ({
  cursor: enabled ? 'pointer' : 'not-allowed',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: enabled ? '#7c6aed' : '#2a2a3a',
  border: 'none',
  borderRadius: 6,
  opacity: enabled ? 1 : 0.5,
});
