import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useId,
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
import { layoutTokens, type ReadabilityLayout } from './readabilityLayout';
import { ReadabilitySizingNote } from './ReadabilitySizingNote';
import { generateFullFix, generateTargetedFullFix } from './readabilityFullFix';
import { CodeView, CopyButton } from './ReadabilityCodeView';
import { FullCodeModal } from './FullCodeModal';
import { btnStyle, labelStyle, panelStyle, primaryBtnStyle } from './readabilityStyles';

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
  /**
   * 'panel' (default) — the editor's Figure › Check tab. 'page' — the
   * public /tools/figure-readability page: bigger type, 44px targets,
   * no Tab interception, page copy, and the image-OCR scan path is
   * never mounted (see readabilityLayout.ts).
   */
  layout?: ReadabilityLayout;
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
  layout: ReadabilityLayout;
}

function CodeEditor({ value, onChange, placeholder, layout }: CodeEditorProps) {
  const t = layoutTokens(layout);
  const id = useId();
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
    if (e.key === 'Tab' && t.tabIndents) {
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
  const FONT = t.editorFont;
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
          ...FONT,
          textAlign: 'right',
          userSelect: 'none',
          borderRight: '1px solid #313244',
          overflow: 'hidden',
          minWidth: 34,
        }}
      >
        {lines.map((n) => (
          <div key={n} style={{ lineHeight: t.editorLineHeight }}>
            {n}
          </div>
        ))}
      </div>
      <textarea
        ref={taRef}
        id={id}
        // The placeholder is not a name (it vanishes once code is
        // pasted); the ring is drawn by `.postr-code-editor:focus-
        // visible` in index.css, inside the frame, instead of the UA
        // outline this textarea used to reset.
        aria-label="Your R or Python plotting code"
        className="postr-code-editor"
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
          ...FONT,
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
// Main panel
// ──────────────────────────────────────────────────────────────────────

export function ReadabilityPanel({
  selectedBlock,
  defaultFigureWidthIn = 10,
  defaultFigureHeightIn = 7,
  layout = 'panel',
}: Props) {
  const t = layoutTokens(layout);
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
    widthIn: number;
    heightIn: number;
  } | null>(null);
  // Global "just copied" banner shared across the panel + modal.
  // Stays for 3s so users can't miss it.
  const [copiedBannerOpen, setCopiedBannerOpen] = useState(false);
  useEffect(() => {
    if (!copiedBannerOpen) return;
    const t = setTimeout(() => setCopiedBannerOpen(false), 3000);
    return () => clearTimeout(t);
  }, [copiedBannerOpen]);

  // Hard gate, not just `selectedBlock={null}`: the page must never
  // mount the image-OCR scan path, whatever a caller passes.
  const isImage = layout === 'panel' && selectedBlock?.type === 'image';
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
      defaultSizeLabel: t.defaultSizeLabel,
    };
    const params =
      detectedLang === 'r'
        ? parseRCode(code, parseOpts)
        : parsePythonCode(code, parseOpts);
    const result = computeReadability(params, blockHeightIn, blockWidthIn);
    // The user gets their OWN script back with the targeted sizes applied.
    // Handing over a theme() fragment asks them to work out where it goes,
    // and on a script that already has a theme() with ggsave() at the
    // bottom, that is a real chance to paste it somewhere it does nothing.
    const fullFix = result.fontSnippet
      ? generateTargetedFullFix(code, params, result.fontSnippet)
      : generateFullFix(code, params, result.suggestedBaseSize);
    setChecked({
      code,
      result,
      params,
      fullFix,
      widthIn: blockWidthIn,
      heightIn: blockHeightIn,
    });
  };

  // On the page a preset click or a new number changes the size the
  // pill asserts; a table computed at the old size must not stay next
  // to it. (The editor keeps results through an overlay drag — a
  // continuous gesture the user is watching.)
  const stale =
    layout === 'page' &&
    checked !== null &&
    (checked.widthIn !== blockWidthIn || checked.heightIn !== blockHeightIn);
  const result = stale ? null : checked?.result ?? null;
  const checkedParams = stale ? null : checked?.params ?? null;
  const fullFixedCode = stale ? '' : checked?.fullFix ?? '';
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
        <ReadabilitySizingNote
          layout={layout}
          isImage={isImage}
          widthIn={blockWidthIn}
          heightIn={blockHeightIn}
        />
      </p>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['auto', 'r', 'python'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            style={{
              ...btnStyle,
              background: lang === l ? '#45475a' : '#313244',
              fontFamily: 'system-ui',
              textTransform: 'capitalize',
              minHeight: t.buttonMinHeight,
              fontSize: t.buttonFontSize,
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
        layout={layout}
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
          <div style={{ fontSize: 13, color: t.mutedColor }}>
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
            minHeight: t.buttonMinHeight,
            fontSize: t.buttonFontSize,
          }}
        >
          ▶ Check
        </button>
      </div>

      {copiedBannerOpen && (
        <div
          role="status"
          aria-live="polite"
          className="postr-rise-in"
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
          ✓ Copied to clipboard — {t.copiedBannerTail}
        </div>
      )}

      {result && (
        <div key={checked?.code} className="postr-rise-in" style={panelStyle}>
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

          <div style={{ fontSize: 13, color: t.mutedColor }}>
            Scale factor: {result.scale.toFixed(2)}x
            {!isImage && t.scaleSuffix}
          </div>

          <table style={{ width: '100%', fontSize: t.tableFontSize, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
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
                      color: t.mutedColor,
                    }}
                  >
                    {el.minPt}pt
                  </td>
                  {/* Coloured to match the legend below. It used to be
                      grey while only the Print number carried the colour,
                      which made the legend's "yellow means..." wrong at a
                      glance. */}
                  <td
                    style={{
                      textAlign: 'center',
                      padding: '4px 0',
                      color: statusColor(el.status),
                      fontWeight: 700,
                    }}
                  >
                    {statusGlyph(el.status)}
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: t.tableFontSize, color: '#cdd6f4', fontWeight: 600 }}>
                      Raise these text elements
                    </div>
                    {/* Copies the whole corrected script, not the theme()
                        fragment — splicing a fragment into the right place
                        is work the tool can do, and getting it wrong gives
                        code that runs and silently changes nothing. */}
                    <CopyButton
                      text={fullFixedCode}
                      label="Copy corrected code"
                      onCopied={handleCopied}
                      style={{ minHeight: t.buttonMinHeight, fontSize: t.buttonFontSize }}
                    />
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: t.tableFontSize,
                      color: '#cdd6f4',
                    }}
                  >
                    {result.fontFixes.map((f) => (
                      <li key={f.name} style={{ marginBottom: 2 }}>
                        {f.name}: <strong>{f.currentPt}pt</strong> →{' '}
                        <strong style={{ color: '#a6e3a1' }}>{f.neededPt}pt</strong>
                        {f.wasOverridden && <span style={{ color: '#6b7280' }}> (you set this)</span>}
                      </li>
                    ))}
                  </ul>
                  <CodeView text={fullFixedCode} layout={layout} />
                  <button
                    type="button"
                    onClick={() => setFullCodeOpen(true)}
                    style={{
                      ...btnStyle,
                      alignSelf: 'flex-start',
                      fontFamily: 'system-ui, sans-serif',
                      minHeight: t.buttonMinHeight,
                      fontSize: t.buttonFontSize,
                    }}
                  >
                    Open full edited code →
                  </button>
                  <div style={{ fontSize: 12, color: '#7f849c', lineHeight: 1.5 }}>
                    Your script with the sizes above applied — copy it whole and run it.{' '}
                    {checkedParams?.language === 'r'
                      ? 'The new theme() sits after your existing one; ggplot applies theme calls in order and the last wins, so it overrides only the sizes named.'
                      : 'The rcParams block sits above the figure, because matplotlib reads it when the figure is created.'}
                  </div>
                </div>
              )}

              {/* SECONDARY: the one-liner. Still offered — some people
                  would rather change one number — it just costs more of
                  the panel. Absent when every element is explicitly
                  overridden, since base_size governs nothing then (FR7). */}
              {result.suggestedBaseSize !== null && result.copySnippet !== null && (
                <details style={{ borderTop: '1px solid #45475a', paddingTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: t.tableFontSize, color: '#9ca3af' }}>
                    Or change one number: base_size = {result.suggestedBaseSize}
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#7f849c', lineHeight: 1.5 }}>
                      Simpler to paste, but it scales every text element — including the
                      ones already large enough — so it takes more room from the plot
                      than the targeted fix above.
                    </div>
                    <CodeView text={result.copySnippet} layout={layout} />
                    <CopyButton
                      text={result.copySnippet}
                      label="Copy snippet"
                      onCopied={handleCopied}
                      style={{ minHeight: t.buttonMinHeight, fontSize: t.buttonFontSize }}
                    />
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
        </div>
      )}

      <FullCodeModal
        open={fullCodeOpen}
        code={fullFixedCode}
        onClose={() => setFullCodeOpen(false)}
        onCopied={handleCopied}
        layout={layout}
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
                    {statusGlyph(r.status)}
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

/**
 * One glyph vocabulary for both tables. They used to disagree — the code
 * table rendered warn as '⚠' and the scan table as '!' — so the legend
 * could only ever be right about one of them.
 */
function statusGlyph(s: 'pass' | 'warn' | 'fail'): string {
  if (s === 'pass') return '✓';
  if (s === 'warn') return '⚠';
  return '✗';
}
