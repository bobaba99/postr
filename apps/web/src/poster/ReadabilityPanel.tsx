import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
  type UIEvent,
  type KeyboardEvent,
} from 'react';
import type { Block } from '@postr/shared';
import { PX } from './constants';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  detectLanguage,
  type ReadabilityResult,
  type FigureParams,
} from './readability';
import { resolveStorageUrl } from '@/data/posterImages';
import { postJson } from '@/lib/apiClient';

interface Props {
  selectedBlock: Block | null;
  /**
   * Default figure dimensions when no image block is selected.
   * Driven by a draggable/resizable gray "figure size" overlay
   * on the canvas that's only active while the Check tab is
   * open — lets users see and tweak the size the analyzer is
   * computing against instead of staring at a hardcoded 10×7.
   */
  defaultFigureWidthIn?: number;
  defaultFigureHeightIn?: number;
}

interface ScanRegion {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  role: 'title' | 'axis-title' | 'axis-tick' | 'legend' | 'data' | 'other';
  /** Effective height in printed points, given the block size. */
  effectivePt: number;
  /** pass/warn/fail, calibrated to academic poster guidelines. */
  status: 'pass' | 'warn' | 'fail';
  /** Minimum acceptable pt for this role. */
  minPt: number;
}

interface ScanResult {
  imagePixelWidth: number;
  imagePixelHeight: number;
  regions: ScanRegion[];
}

// ──────────────────────────────────────────────────────────────────────
// Style tokens
// ──────────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontSize: 14,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
};

const btnStyle: CSSProperties = {
  cursor: 'pointer',
  background: '#313244',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  fontFamily: 'monospace',
};

const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: '#89b4fa',
  color: '#1e1e2e',
  borderColor: '#89b4fa',
  fontWeight: 700,
  fontFamily: 'system-ui, sans-serif',
};

// ──────────────────────────────────────────────────────────────────────
// Full-fix generator (unchanged)
// ──────────────────────────────────────────────────────────────────────

function generateFullFix(
  code: string,
  params: FigureParams,
  suggested: number | null,
): string {
  // No base_size worth recommending (every element is explicitly
  // overridden), so there is nothing to rewrite. Returning the code
  // unchanged is the honest answer; the panel shows per-element advice
  // instead of a "full fix" that would fix nothing.
  if (suggested === null) return code;

  let fixed = code;

  if (params.language === 'r') {
    if (/base_size\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(/base_size\s*=\s*[\d.]+/g, `base_size = ${suggested}`);
    } else if (/theme_\w+\s*\(/.test(fixed)) {
      fixed = fixed.replace(/(theme_\w+\s*\()/, `$1base_size = ${suggested}, `);
    } else {
      fixed = fixed.trimEnd() + ` +\n  theme_minimal(base_size = ${suggested})`;
    }
    if (!/ggsave/.test(fixed)) {
      fixed = fixed.trimEnd() + `\n\nggsave("poster_figure.png", width = 10, height = 7, dpi = 300)`;
    }
  } else {
    if (/rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(
        /(rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*)[\d.]+/,
        `$1${suggested}`,
      );
    } else if (/font_scale\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(
        /font_scale\s*=\s*[\d.]+/,
        `font_scale=${(suggested / 10).toFixed(1)}`,
      );
    } else {
      fixed = `import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = ${suggested}\n\n` + fixed;
    }
    if (!/savefig/.test(fixed)) {
      fixed = fixed.trimEnd() + `\n\nplt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")`;
    }
  }

  return fixed;
}

// ──────────────────────────────────────────────────────────────────────
// Line-numbered code editor
// ──────────────────────────────────────────────────────────────────────
//
// A minimal IDE-ish textarea with a gutter of line numbers on the left.
// We deliberately stay off of third-party editors (CodeMirror, Monaco,
// Prism) — they'd add hundreds of KB of bundle for a feature used in
// one sidebar tab. This approach:
//   1. Renders line numbers as a column that mirrors the textarea's
//      line-height exactly, so rows line up pixel-perfectly.
//   2. Syncs scroll position from the textarea into the gutter so
//      long pasted scripts don't desync as the user scrolls.
//   3. Handles Tab to insert two spaces instead of focus-escaping,
//      so users can indent pasted-and-edited code without losing
//      focus to the next tab stop.
//
// The approach was cross-checked against what Replit, CodeSandbox,
// and Vitest's playground all do internally for their tiny code-
// preview components — it's the standard minimalist pattern.

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

function CodeEditor({ value, onChange, placeholder }: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  // At least 8 lines of gutter even when the textarea is empty, so
  // the editor has a consistent visual height on first mount.
  const lineCount = Math.max(8, value.split('\n').length);
  const lines = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount],
  );

  const onScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + '  ' + value.slice(end);
      onChange(next);
      // Restore caret after the inserted spaces on the next tick so
      // React's re-render doesn't collapse the selection.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  // Both the gutter and textarea share these typography values — if
  // they drift, line numbers stop lining up with rows.
  const FONT = '13px / 20px ui-monospace, "SF Mono", Menlo, Monaco, monospace';
  const BG = '#1e1e2e';
  const FG = '#cdd6f4';

  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid #45475a',
        borderRadius: 6,
        background: BG,
        overflow: 'hidden',
        minHeight: 180,
        maxHeight: 320,
      }}
    >
      <div
        ref={gutterRef}
        aria-hidden
        style={{
          flex: '0 0 auto',
          padding: '10px 8px 10px 10px',
          background: '#181825',
          color: '#585b70',
          font: FONT,
          textAlign: 'right',
          userSelect: 'none',
          borderRight: '1px solid #313244',
          overflow: 'hidden',
          minWidth: 34,
        }}
      >
        {lines.map((n) => (
          <div key={n} style={{ lineHeight: '20px' }}>
            {n}
          </div>
        ))}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        wrap="off"
        style={{
          flex: 1,
          padding: 10,
          background: BG,
          color: FG,
          border: 'none',
          outline: 'none',
          font: FONT,
          resize: 'none',
          overflow: 'auto',
          whiteSpace: 'pre',
          tabSize: 2,
          minHeight: 180,
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Copy button with persistent feedback
// ──────────────────────────────────────────────────────────────────────

interface CopyButtonProps {
  text: string;
  label?: string;
  onCopied?: () => void;
  style?: CSSProperties;
}

function CopyButton({ text, label = 'Copy', onCopied, style }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        onCopied?.();
      }}
      style={{
        ...btnStyle,
        minWidth: 88,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: copied ? '#0f3f2a' : btnStyle.background,
        color: copied ? '#a6e3a1' : btnStyle.color,
        borderColor: copied ? '#2d6a4f' : '#45475a',
        transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
        ...style,
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Read-only code view (used in modal + snippet block)
// ──────────────────────────────────────────────────────────────────────

function CodeView({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid #313244',
        borderRadius: 6,
        background: '#181825',
        overflow: 'auto',
        maxHeight: 420,
      }}
    >
      <div
        aria-hidden
        style={{
          flex: '0 0 auto',
          padding: '10px 8px 10px 10px',
          color: '#585b70',
          font: '13px / 20px ui-monospace, "SF Mono", Menlo, monospace',
          textAlign: 'right',
          userSelect: 'none',
          borderRight: '1px solid #313244',
          minWidth: 34,
          background: '#11111b',
        }}
      >
        {lines.map((_, i) => (
          <div key={i} style={{ lineHeight: '20px' }}>
            {i + 1}
          </div>
        ))}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: 10,
          color: '#a6e3a1',
          font: '13px / 20px ui-monospace, "SF Mono", Menlo, monospace',
          whiteSpace: 'pre',
          overflow: 'auto',
        }}
      >
        {text}
      </pre>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Full-code modal
// ──────────────────────────────────────────────────────────────────────

interface FullCodeModalProps {
  open: boolean;
  code: string;
  onClose: () => void;
  onCopied: () => void;
}

function FullCodeModal({ open, code, onClose, onCopied }: FullCodeModalProps) {
  // Close on Escape to match other app modals (ConfirmModal, InputModal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #45475a',
          borderRadius: 10,
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid #313244',
          }}
        >
          <div style={{ ...labelStyle, letterSpacing: 1 }}>Full edited code</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...btnStyle,
              padding: '4px 10px',
              fontFamily: 'system-ui, sans-serif',
            }}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          <CodeView text={code} />
        </div>
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #313244',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <CopyButton text={code} label="Copy full code" onCopied={onCopied} />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main panel
// ──────────────────────────────────────────────────────────────────────

export function ReadabilityPanel({
  selectedBlock,
  defaultFigureWidthIn = 10,
  defaultFigureHeightIn = 7,
}: Props) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<'auto' | 'r' | 'python'>('auto');
  const [fullCodeOpen, setFullCodeOpen] = useState(false);
  // `checked` holds the result captured when the user clicks the
  // Check button. Typing after a check does NOT rerun analysis —
  // results stay pinned to the last explicit check so the panel
  // reads like a run-button, not a live typing-pad.
  const [checked, setChecked] = useState<{
    code: string;
    result: ReadabilityResult;
    params: FigureParams;
    fullFix: string;
  } | null>(null);
  // Global "just copied" banner shared across the panel + modal.
  // Stays for 3s so users can't miss it.
  const [copiedBannerOpen, setCopiedBannerOpen] = useState(false);
  useEffect(() => {
    if (!copiedBannerOpen) return;
    const t = setTimeout(() => setCopiedBannerOpen(false), 3000);
    return () => clearTimeout(t);
  }, [copiedBannerOpen]);

  const isImage = selectedBlock?.type === 'image';
  const blockWidthIn = isImage ? selectedBlock.w / PX : defaultFigureWidthIn;
  const blockHeightIn = isImage ? selectedBlock.h / PX : defaultFigureHeightIn;

  // Image-OCR readability state — separate from the code-based path
  // because the inputs and analysis differ. The same `result` shape
  // backs both views so the rendered table downstream stays one
  // component.
  const [scanState, setScanState] = useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    error?: string;
    result?: ScanResult;
  }>({ phase: 'idle' });

  const detectedLang = useMemo(() => {
    if (lang !== 'auto') return lang;
    return detectLanguage(code);
  }, [code, lang]);

  const runCheck = () => {
    if (!code.trim() || !detectedLang) {
      setChecked(null);
      return;
    }
    // Pass the current figure-preview overlay (or selected image
    // block) dimensions to the parser as the canvas default —
    // that way a user whose code doesn't contain ggsave() /
    // plt.savefig() still gets their analysis scored against the
    // exact dimensions they see highlighted in the description pill.
    const parseOpts = {
      defaultWidthIn: blockWidthIn,
      defaultHeightIn: blockHeightIn,
    };
    const params =
      detectedLang === 'r'
        ? parseRCode(code, parseOpts)
        : parsePythonCode(code, parseOpts);
    const result = computeReadability(params, blockHeightIn, blockWidthIn);
    const fullFix = generateFullFix(code, params, result.suggestedBaseSize);
    setChecked({ code, result, params, fullFix });
  };

  const result = checked?.result ?? null;
  const checkedParams = checked?.params ?? null;
  const fullFixedCode = checked?.fullFix ?? '';
  const needsFix =
    result?.elements.some((e) => e.status !== 'pass') ?? false;
  const allPass =
    result?.elements.every((e) => e.status === 'pass') ?? false;

  const handleCopied = () => setCopiedBannerOpen(true);

  async function runImageScan() {
    if (!isImage || !selectedBlock?.imageSrc) return;
    setScanState({ phase: 'running' });
    try {
      const url = await resolveStorageUrl(selectedBlock.imageSrc);
      if (!url) throw new Error('Could not resolve image URL.');
      const response = await postJson<{
        imagePixelWidth: number;
        imagePixelHeight: number;
        regions: Array<{
          text: string;
          bbox: { x: number; y: number; w: number; h: number };
          role: ScanRegion['role'];
        }>;
      }>(
        '/api/import/extract',
        {
          imageUrl: url,
          pageWidthPt: 1, // unused by measure-text mode
          pageHeightPt: 1,
          mode: 'measure-text',
        },
        { auth: true },
      );
      const result = computeImageReadability(
        response,
        blockWidthIn,
        blockHeightIn,
      );
      setScanState({ phase: 'done', result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed.';
      setScanState({ phase: 'error', error: msg });
    }
  }

  return (
    <div style={panelStyle}>
      {isImage && (
        <ImageScanSection
          state={scanState}
          onRun={runImageScan}
          onClear={() => setScanState({ phase: 'idle' })}
          blockWidthIn={blockWidthIn}
          blockHeightIn={blockHeightIn}
        />
      )}
      <div style={labelStyle}>Code Readability Check</div>
      <p
        style={{
          color: '#c8cad0',
          fontSize: 13,
          lineHeight: 1.7,
          margin: 0,
          background: '#1c1a2e',
          border: '1px solid #4e3fb4',
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        🔎 Paste your R or Python plotting code, then click <b>Check</b> to
        see if figure text will be readable at poster print size.{' '}
        {isImage ? (
          <>
            Using selected image block{' '}
            <span
              // The animated pill — index.css ships the keyframes +
              // base styling. We re-key it on the current dimensions
              // so the browser restarts the animation whenever the
              // user drags/resizes the figure overlay or picks a
              // different image, drawing the eye to the fresh value.
              key={`${blockWidthIn.toFixed(1)}-${blockHeightIn.toFixed(1)}`}
              className="postr-dimension-pill"
            >
              {blockWidthIn.toFixed(1)}&quot; × {blockHeightIn.toFixed(1)}&quot;
            </span>
            .
          </>
        ) : (
          <>
            Sizing against the gray <b>figure preview</b> on the canvas{' '}
            <span
              key={`${blockWidthIn.toFixed(1)}-${blockHeightIn.toFixed(1)}`}
              className="postr-dimension-pill"
            >
              {blockWidthIn.toFixed(1)}&quot; × {blockHeightIn.toFixed(1)}&quot;
            </span>
            {' '}— drag or resize it to match your real figure, or click an
            existing image block to use its exact dimensions.
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['auto', 'r', 'python'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            style={{
              ...btnStyle,
              background: lang === l ? '#45475a' : '#313244',
              fontFamily: 'system-ui',
              textTransform: 'capitalize',
            }}
          >
            {l === 'auto' ? 'Auto' : l === 'r' ? 'R' : 'Python'}
          </button>
        ))}
      </div>

      <CodeEditor
        value={code}
        onChange={setCode}
        placeholder="# Paste your ggplot / matplotlib code here..."
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {detectedLang ? (
          <div style={{ fontSize: 13, color: '#89b4fa' }}>
            Detected: {detectedLang === 'r' ? 'R / ggplot2' : 'Python / matplotlib'}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Auto-detect waiting for code…
          </div>
        )}
        <button
          type="button"
          onClick={runCheck}
          disabled={!code.trim()}
          style={{
            ...primaryBtnStyle,
            opacity: code.trim() ? 1 : 0.4,
            cursor: code.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          ▶ Check
        </button>
      </div>

      {copiedBannerOpen && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#0f3f2a',
            border: '1px solid #2d6a4f',
            color: '#a6e3a1',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          ✓ Copied to clipboard — paste it into your editor, re-run, and
          re-upload the image.
        </div>
      )}

      {result && (
        <>
          {result.warnings.map((w, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                color: '#f9e2af',
                display: 'flex',
                gap: 4,
              }}
            >
              <span>&#9888;</span> {w}
            </div>
          ))}

          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Scale factor: {result.scale.toFixed(2)}x
            {!isImage && ' (default block size)'}
          </div>

          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #45475a', color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', padding: '4px 0' }}>Element</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="The size set in your code">Source</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="What it measures once the figure is scaled onto the poster">Print</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="The smallest size that stays readable at poster viewing distance">Min</th>
                <th style={{ textAlign: 'center', padding: '4px 0', width: 20 }} aria-label="Verdict"></th>
              </tr>
            </thead>
            <tbody>
              {result.elements.map((el) => (
                <tr key={el.name} style={{ borderBottom: '1px solid #313244' }}>
                  <td style={{ padding: '4px 0', color: '#cdd6f4' }}>{el.name}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '4px 4px',
                      color: '#bac2de',
                    }}
                  >
                    {el.sourcePt}pt
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '4px 4px',
                      color:
                        el.status === 'pass'
                          ? '#a6e3a1'
                          : el.status === 'warn'
                            ? '#f9e2af'
                            : '#f38ba8',
                      fontWeight: 600,
                    }}
                  >
                    {el.effectivePt}pt
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      padding: '4px 4px',
                      color: '#6b7280',
                    }}
                  >
                    {el.minPt}pt
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px 0' }}>
                    {el.status === 'pass' ? '✓' : el.status === 'warn' ? '⚠' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* The three flags were previously unexplained, and yellow in
              particular reads as "fine" when it means the opposite. It is
              a narrow band — within 15% BELOW the minimum — so it is
              worth stating the rule numerically rather than as "close to
              the limit". */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '8px 10px',
              background: '#181825',
              border: '1px solid #313244',
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <div style={{ color: '#9ca3af', fontWeight: 600, letterSpacing: 0.3 }}>
              What the flags mean
            </div>
            <div>
              <span style={{ color: '#a6e3a1', fontWeight: 700 }}>✓</span>{' '}
              <span style={{ color: '#bac2de' }}>
                <strong style={{ color: '#cdd6f4' }}>At or above the minimum.</strong> Readable from
                the distance people stand at.
              </span>
            </div>
            <div>
              <span style={{ color: '#f9e2af', fontWeight: 700 }}>⚠</span>{' '}
              <span style={{ color: '#bac2de' }}>
                <strong style={{ color: '#cdd6f4' }}>Up to 15% below the minimum.</strong> Legible
                close up, hard to read from the back of the room — and one small change to the
                figure size drops it into red. Worth fixing, not safe to ignore.
              </span>
            </div>
            <div>
              <span style={{ color: '#f38ba8', fontWeight: 700 }}>✗</span>{' '}
              <span style={{ color: '#bac2de' }}>
                <strong style={{ color: '#cdd6f4' }}>More than 15% below.</strong> Will not be read
                at the poster.
              </span>
            </div>
            <div style={{ color: '#7f849c', marginTop: 2 }}>
              <strong style={{ color: '#9ca3af' }}>Source</strong> is the size in your code.{' '}
              <strong style={{ color: '#9ca3af' }}>Print</strong> is what it measures on the poster
              after the figure is scaled to fit the block — that is the number that matters, and the
              one compared against <strong style={{ color: '#9ca3af' }}>Min</strong>.
            </div>
          </div>

          {needsFix && (
            <div
              style={{
                background: '#313244',
                borderRadius: 6,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* PRIMARY: raise only the elements that fail.
                  base_size scales every text element at once, including
                  the ones already passing — and the block on the poster
                  is a fixed size, so text the figure did not need grows
                  into panel space the data did. Targeted sizes cost more
                  characters to paste and less of the plot. */}
              {result.fontFixes.length > 0 && result.fontSnippet !== null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 600 }}>
                      Raise these text elements
                    </div>
                    <CopyButton text={result.fontSnippet} label="Copy fix" onCopied={handleCopied} />
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#cdd6f4' }}>
                    {result.fontFixes.map((f) => (
                      <li key={f.name} style={{ marginBottom: 2 }}>
                        {f.name}: <strong>{f.currentPt}pt</strong> →{' '}
                        <strong style={{ color: '#a6e3a1' }}>{f.neededPt}pt</strong>
                        {f.wasOverridden && (
                          <span style={{ color: '#6b7280' }}> (you set this)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <CodeView text={result.fontSnippet} />
                  <div style={{ fontSize: 12, color: '#7f849c', lineHeight: 1.5 }}>
                    {checkedParams?.language === 'r'
                      ? 'Paste after your existing theme() — ggplot applies theme calls in order and the last one wins, so this overrides only the sizes named.'
                      : 'Set this before you create the figure. rcParams applies to every Axes; ax.set_xlabel(fontsize=…) would only reach the one Axes you call it on.'}
                  </div>
                </div>
              )}

              {/* SECONDARY: the one-liner. Still offered, because some
                  people would rather change one number — it just costs
                  more of the panel. Absent when every element is
                  explicitly overridden, since base_size governs nothing
                  then (FR7). */}
              {result.suggestedBaseSize !== null && result.copySnippet !== null && (
                <details style={{ borderTop: '1px solid #45475a', paddingTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#9ca3af' }}>
                    Or change one number: base_size = {result.suggestedBaseSize}
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#7f849c', lineHeight: 1.5 }}>
                      Simpler to paste, but it scales every text element — including
                      the ones already large enough — so it takes more room from the
                      plot than the targeted fix above.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <CodeView text={result.copySnippet} />
                      <CopyButton text={result.copySnippet} label="Copy" onCopied={handleCopied} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFullCodeOpen(true)}
                      style={{ ...btnStyle, alignSelf: 'flex-start', fontFamily: 'system-ui, sans-serif' }}
                    >
                      Open full edited code →
                    </button>
                  </div>
                </details>
              )}
            </div>
          )}

          {allPass && (
            <div
              style={{
                background: '#1a3a2a',
                borderRadius: 6,
                padding: 10,
                fontSize: 13,
                color: '#a6e3a1',
              }}
            >
              All elements pass readability thresholds at this poster size.
            </div>
          )}
        </>
      )}

      <FullCodeModal
        open={fullCodeOpen}
        code={fullFixedCode}
        onClose={() => setFullCodeOpen(false)}
        onCopied={handleCopied}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Image-OCR readability — for figures imported from PDF/JPG where the
// user doesn't have the original plotting code to paste.
// ──────────────────────────────────────────────────────────────────────

const MIN_PT_BY_ROLE: Record<ScanRegion['role'], number> = {
  title: 24,
  'axis-title': 24,
  'axis-tick': 18,
  legend: 18,
  data: 18,
  other: 18,
};

function computeImageReadability(
  raw: {
    imagePixelWidth: number;
    imagePixelHeight: number;
    regions: Array<{
      text: string;
      bbox: { x: number; y: number; w: number; h: number };
      role: ScanRegion['role'];
    }>;
  },
  blockWidthIn: number,
  blockHeightIn: number,
): ScanResult {
  const W = raw.imagePixelWidth || 1;
  const H = raw.imagePixelHeight || 1;
  // Pick the axis whose proportional scale is smaller — that's the
  // print-axis the figure stretches to fit. Conservative.
  const widthScale = blockWidthIn / W;
  const heightScale = blockHeightIn / H;
  const printScale = Math.min(widthScale, heightScale);

  const regions: ScanRegion[] = raw.regions.map((r) => {
    const heightIn = r.bbox.h * printScale;
    const effectivePt = heightIn * 72;
    const minPt = MIN_PT_BY_ROLE[r.role] ?? 18;
    let status: ScanRegion['status'];
    if (effectivePt >= minPt) status = 'pass';
    else if (effectivePt >= minPt * 0.75) status = 'warn';
    else status = 'fail';
    return { ...r, effectivePt, status, minPt };
  });

  return {
    imagePixelWidth: W,
    imagePixelHeight: H,
    regions,
  };
}

function ImageScanSection(props: {
  state: {
    phase: 'idle' | 'running' | 'done' | 'error';
    error?: string;
    result?: ScanResult;
  };
  onRun: () => void;
  onClear: () => void;
  blockWidthIn: number;
  blockHeightIn: number;
}) {
  const { state, onRun, onClear } = props;

  const result = state.result;
  const passCount = result?.regions.filter((r) => r.status === 'pass').length ?? 0;
  const failCount = result?.regions.filter((r) => r.status === 'fail').length ?? 0;
  const warnCount = result?.regions.filter((r) => r.status === 'warn').length ?? 0;

  return (
    <div
      style={{
        background: '#1c1a2e',
        border: '1px solid #4e3fb4',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div style={{ ...labelStyle, marginBottom: 6 }}>📷 Scan Image Text</div>
      <p style={{ fontSize: 13, color: '#c8cad0', lineHeight: 1.5, margin: '0 0 10px' }}>
        Use Claude Vision to measure every text region in this image and
        compute its effective print size at the block's current
        dimensions. Useful for plots and tables you imported from a PDF
        or JPG and don't have the source code for.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onRun}
          disabled={state.phase === 'running'}
          style={{
            ...btnStyle,
            background: '#7c6aed',
            color: '#fff',
            cursor: state.phase === 'running' ? 'wait' : 'pointer',
          }}
        >
          {state.phase === 'running' ? 'Scanning…' : '🔎 Scan image'}
        </button>
        {result && (
          <button onClick={onClear} style={btnStyle}>
            Clear
          </button>
        )}
        {result && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {passCount} pass · {warnCount} warn · {failCount} fail ·{' '}
            {result.regions.length} total
          </span>
        )}
      </div>
      {state.phase === 'error' && state.error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5' }}>
          {state.error}
        </div>
      )}
      {result && result.regions.length > 0 && (
        <div
          style={{
            marginTop: 12,
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1a1a26' }}>
              <tr>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Role</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Text</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Effective pt</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Min</th>
              </tr>
            </thead>
            <tbody>
              {result.regions.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #2a2a3a' }}>
                  <td style={{ ...tdStyle, color: statusColor(r.status) }}>
                    {r.status === 'pass' ? '✓' : r.status === 'warn' ? '!' : '✗'}
                  </td>
                  <td style={tdStyle}>{r.role}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.text}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {r.effectivePt.toFixed(1)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>
                    {r.minPt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '6px 8px',
  textAlign: 'center',
  fontSize: 11,
  color: '#9ca3af',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: CSSProperties = {
  padding: '5px 8px',
  textAlign: 'center',
  color: '#c8cad0',
};

function statusColor(s: ScanRegion['status']): string {
  if (s === 'pass') return '#a6e3a1';
  if (s === 'warn') return '#f9e2af';
  return '#f38ba8';
}
