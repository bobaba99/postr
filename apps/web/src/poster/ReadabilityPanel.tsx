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
  describePlotCode,
  SUPPORTED_SYSTEMS,
  type PlotCode,
  type PlotSystem,
  type ReadabilityResult,
  type FigureParams,
} from './readability';
import { resolveStorageUrl } from '@/data/posterImages';
import { postJson } from '@/lib/apiClient';
import { layoutTokens, type ReadabilityLayout } from './readabilityLayout';
import { ReadabilitySizingNote, keptResultNote } from './ReadabilitySizingNote';
import { generateFullFix, generateTargetedFullFix } from './readabilityFullFix';
import { CodeView, CopyButton } from './ReadabilityCodeView';
import { FullCodeModal } from './FullCodeModal';
import { btnStyle, labelStyle, panelStyle, primaryBtnStyle } from './readabilityStyles';
import { useScriptDraft, type CheckedInputs, type ScriptDraftSlot } from './figureScriptDraft';

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
  /**
   * Where the script, its language and the last Check are kept, so they
   * outlive this panel (the sidebar unmounts it on every tab change) and a
   * reload: the editor passes the poster's slot, the public page its tab's
   * (figureScriptDraft.ts). Omitted, they last only while it is mounted.
   * Mount the panel keyed by the slot, so the rest of its state (an image
   * scan, the copied banner) starts again with it: the sidebar keys its
   * panels by the poster id.
   */
  draftSlot?: ScriptDraftSlot | null;
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
// What the line beside Check says
// ──────────────────────────────────────────────────────────────────────
//
// The line beside ▶ Check is where the user is looking when they press it:
// at 1280 × 720 the editor's results start about 26 px from the bottom of
// the window (the confirmer of item 15), so an answer placed below would
// go unseen. Before fix 15, code the check could not place left Check
// doing nothing at all, and wiped any result on screen.

const SYSTEM_NAME: Record<PlotSystem, string> = {
  ggplot2: 'ggplot2',
  matplotlib: 'matplotlib',
  base: 'base graphics',
  lattice: 'lattice',
  plotly: 'plotly',
  plotnine: 'plotnine',
  altair: 'Altair',
};

/** "R / ggplot2", or "R (checked as ggplot2)" when no call named the system. */
function plotLabel(plot: PlotCode): string {
  const language = plot.language === 'r' ? 'R' : 'Python';
  const system = SYSTEM_NAME[plot.system!];
  return plot.assumed ? `${language} (checked as ${system})` : `${language} / ${system}`;
}

const CANNOT_TELL = 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).';

/** The answer to an unsupported system names it and what the check reads. */
function unsupportedAnswer(system: PlotSystem): string {
  const name = system === 'base' ? 'base R graphics' : SYSTEM_NAME[system];
  return `Not supported yet: ${name}. The check reads R (ggplot2) and Python (matplotlib).`;
}

/**
 * Said when the page hides a result because the print size changed: a
 * table no longer on screen must not go without a word (round 2 of fix
 * 15's review; the page hides it by design, fix 13).
 */
const RESIZED = 'The print size changed: click Check again for a result at this size.';

interface CheckAnswer {
  /** 'checked' is announced only; the table below is what a sighted user reads. */
  kind: 'cannot-tell' | 'unsupported' | 'checked';
  text: string;
  /** One per press, so the same words said twice are put back, and heard again. */
  press: number;
}

// ──────────────────────────────────────────────────────────────────────
// Main panel
// ──────────────────────────────────────────────────────────────────────

interface CheckResult {
  code: string;
  result: ReadabilityResult;
  params: FigureParams;
  fullFix: string;
  widthIn: number;
  heightIn: number;
}

/**
 * One Check: the script parsed at the size it was checked at, scored, and
 * the user's own script with the sizes it needs. Pure, so the table comes
 * back the same when the panel mounts again or the page reloads.
 */
function runReadabilityCheck(inputs: CheckedInputs, defaultSizeLabel: string | undefined): CheckResult {
  // The figure-preview overlay (or selected image block) dimensions go to
  // the parser as the canvas default — that way a user whose code doesn't
  // contain ggsave() / plt.savefig() still gets their analysis scored
  // against the exact dimensions they see highlighted in the description
  // pill.
  const parseOpts = {
    defaultWidthIn: inputs.widthIn,
    defaultHeightIn: inputs.heightIn,
    defaultSizeLabel,
  };
  const params =
    inputs.lang === 'r'
      ? parseRCode(inputs.code, parseOpts)
      : parsePythonCode(inputs.code, parseOpts);
  const result = computeReadability(params, inputs.heightIn, inputs.widthIn);
  // The user gets their OWN script back with the targeted sizes applied.
  // Handing over a theme() fragment asks them to work out where it goes,
  // and on a script that already has a theme() with ggsave() at the
  // bottom, that is a real chance to paste it somewhere it does nothing.
  const fullFix = result.fontSnippet
    ? generateTargetedFullFix(inputs.code, params, result.fontSnippet)
    : generateFullFix(inputs.code, params, result.suggestedBaseSize);
  return {
    code: inputs.code,
    result,
    params,
    fullFix,
    widthIn: inputs.widthIn,
    heightIn: inputs.heightIn,
  };
}

export function ReadabilityPanel({
  selectedBlock,
  defaultFigureWidthIn = 10,
  defaultFigureHeightIn = 7,
  layout = 'panel',
  draftSlot = null,
}: Props) {
  const t = layoutTokens(layout);
  // The script, its language and the last Check live in the draft, not
  // in this panel's state: the sidebar unmounts the panel on every tab
  // change, and the editor's poster can be reloaded (plan item 7).
  const [draft, updateDraft] = useScriptDraft(draftSlot);
  const { code, lang } = draft;
  const setCode = (next: string) => updateDraft({ code: next });
  const setLang = (next: 'auto' | 'r' | 'python') => updateDraft({ lang: next });
  const [fullCodeOpen, setFullCodeOpen] = useState(false);
  // `checked` is the result of the last click on Check, computed from the
  // inputs the draft keeps. Typing after a check does NOT rerun analysis —
  // results stay pinned to the last explicit check so the panel
  // reads like a run-button, not a live typing-pad.
  const kept = draft.checked;
  const checked = useMemo<CheckResult | null>(() => {
    if (!kept) return null;
    // Read again as its Check read it (Auto, or the language picked by
    // hand): a kept check that now reads as a system the check does not
    // read, or that Auto no longer places in the language it was checked
    // in, shows no table, as a Check on it would give none (fix 15). With
    // this version of the reading a Check stored only what passes; this is
    // for a check kept by an earlier one.
    const reading = describePlotCode(kept.code, kept.picked ? kept.lang : undefined);
    if (reading.language !== kept.lang || !reading.system || !SUPPORTED_SYSTEMS.includes(reading.system)) {
      return null;
    }
    try {
      return runReadabilityCheck(kept, t.defaultSizeLabel);
    } catch (err) {
      // A kept script the parser cannot take must not take the panel
      // down on every visit; it shows without a table.
      console.error('[readability] check of a kept script failed:', err);
      return null;
    }
    // Keyed on the inputs' values, not the draft object: every keystroke
    // writes a new draft, and typing must not run the check again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept?.code, kept?.lang, kept?.picked, kept?.widthIn, kept?.heightIn, t.defaultSizeLabel]);
  // The answer to the last press of Check (fix 15). It is for that press,
  // so it stays with this mount: a tab change or a reload is not a press.
  const [answer, setAnswer] = useState<CheckAnswer | null>(null);
  const presses = useRef(0);
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
  // The figure that sizes the check: the selected image, else the preview.
  const imageId = isImage ? selectedBlock.id : null;

  // Image-OCR readability state — separate from the code-based path
  // because the inputs and analysis differ. The same `result` shape
  // backs both views so the rendered table downstream stays one
  // component.
  const [scanState, setScanState] = useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    error?: string;
    result?: ScanResult;
  }>({ phase: 'idle' });

  const plot = useMemo(
    () => describePlotCode(code, lang === 'auto' ? undefined : lang),
    [code, lang],
  );

  // An answer is for the press that gave it: editing the code or picking
  // another language drops it for good. Hidden by comparison instead, it
  // came back, put into the live region and read out again, when the edit
  // was undone (round 2 of fix 15's review).
  const changeCode = (next: string) => {
    setCode(next);
    setAnswer(null);
  };
  const changeLang = (next: 'auto' | 'r' | 'python') => {
    if (next !== lang) setAnswer(null);
    setLang(next);
  };

  const runCheck = () => {
    if (!code.trim()) return;
    presses.current += 1;
    const at = { press: presses.current };
    // Neither branch touches the kept check: a result already on screen
    // stays, marked out of date (the owner's answer, 2026-10-06), instead
    // of vanishing without a word as it did; the draft keeps it, so a
    // reload or a tab change brings it back too (fix 7).
    if (!plot.language || !plot.system) {
      setAnswer({ ...at, kind: 'cannot-tell', text: CANNOT_TELL });
      return;
    }
    // Including after a hand pick: a ggplot2 table and edited code for a
    // base R plot would be wrong (the reproducer: the edit ran and saved a
    // blank figure), so the system is named instead.
    if (!SUPPORTED_SYSTEMS.includes(plot.system)) {
      setAnswer({ ...at, kind: 'unsupported', text: unsupportedAnswer(plot.system) });
      return;
    }
    // The check's inputs go into the draft; the table is computed from
    // them (runReadabilityCheck), here for the announcement and below for
    // the table, so it comes back the same after a remount or a reload.
    const inputs: CheckedInputs = {
      code,
      lang: plot.language,
      picked: lang !== 'auto',
      widthIn: blockWidthIn,
      heightIn: blockHeightIn,
      imageId,
    };
    updateDraft({ checked: inputs });
    let result: ReadabilityResult;
    try {
      ({ result } = runReadabilityCheck(inputs, t.defaultSizeLabel));
    } catch {
      // The table's own computation logs it and shows none (a kept script
      // the parser cannot take); there is nothing to announce.
      return;
    }
    const below = result.elements.filter((e) => e.status !== 'pass').length;
    setAnswer({
      ...at,
      kind: 'checked',
      text: `Checked as ${plotLabel({ ...plot, assumed: false })}: ${
        below === 0
          ? 'every text element meets its minimum'
          : `${below} of ${result.elements.length} text elements are below the minimum`
      }.`,
    });
  };

  // A kept table was scored at the size it was checked at, while the
  // sizing note above names the size the panel sizes against now. On the
  // page a preset click or a new number changes the size the pill
  // asserts; a table computed at the old size must not stay next to it.
  // The editor keeps a result through a drag of the preview or a resize of
  // the image (a continuous gesture the user is watching) and says which
  // size it is for; a result checked against another figure (an image
  // block while the preview or another image now sizes the check, as after
  // a deselect or a reload, or the preview while an image is selected) is
  // not shown, and the note says where it is (review round 2, R2-01).
  const otherFigure = layout === 'panel' && kept !== null && kept.imageId !== imageId;
  const resized =
    layout === 'page' &&
    checked !== null &&
    (checked.widthIn !== blockWidthIn || checked.heightIn !== blockHeightIn);
  const stale = otherFigure || resized;
  const resultNote = keptResultNote(layout, checked === null ? null : kept, otherFigure, blockWidthIn, blockHeightIn);
  const result = stale ? null : checked?.result ?? null;
  // The result was computed for other code, or the code now reads as
  // another language (and so, maybe, another system): still shown, marked.
  const outOfDate = kept !== null && (kept.code !== code || kept.lang !== plot.language);
  // A table's announcement goes with the table when it is hidden (the
  // page at a new size; the editor for another figure), for good: back at
  // the old size or figure the table returns, but its announcement is not
  // made again without a press (round 2). React's pattern for state that
  // follows a prop: set during render, guarded.
  if (stale && answer?.kind === 'checked') setAnswer(null);
  // With no answer about the code on screen, a result the page hid at a new
  // print size is said to be hidden, beside Check and to a screen reader.
  // (In the editor the line about a kept result says it, resultNote.)
  const shownAnswer: { kind: CheckAnswer['kind'] | 'resized'; text: string; key: string } | null = answer
    ? { kind: answer.kind, text: answer.text, key: `press-${answer.press}` }
    : resized
      ? { kind: 'resized', text: RESIZED, key: 'resized' }
      : null;
  const answerOnScreen = shownAnswer !== null && shownAnswer.kind !== 'checked';
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
        see how large its titles, labels and legend will print on the
        poster.{' '}
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
            onClick={() => changeLang(l)}
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
        onChange={changeCode}
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
        <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13 }}>
          {/* The answer to the last press of Check, or that a new print
              size hid its result. The region is always mounted so a screen
              reader hears what is added to it; each press adds a new node
              (keyed by the press), so pressing again on code that still
              cannot be checked is heard again, and the screen changes. A
              table's answer is for screen readers only: a sighted user
              reads the table. */}
          <div role="status" aria-live="polite" aria-atomic="true">
            {shownAnswer && (
              <span
                key={shownAnswer.key}
                className={shownAnswer.kind === 'checked' ? 'sr-only' : 'postr-rise-in'}
                style={
                  shownAnswer.kind === 'checked'
                    ? undefined
                    : { display: 'block', color: '#f9e2af', lineHeight: 1.4 }
                }
              >
                {shownAnswer.text}
              </span>
            )}
          </div>
          {!answerOnScreen && (
            <div style={{ color: plot.language ? '#89b4fa' : t.mutedColor }}>
              {plot.language
                ? `Detected: ${plotLabel(plot)}`
                : code.trim()
                  ? 'Can’t tell R from Python. Pick one above.'
                  : 'Auto-detect waiting for code…'}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={!code.trim()}
          style={{
            ...primaryBtnStyle,
            opacity: code.trim() ? 1 : 0.4,
            cursor: code.trim() ? 'pointer' : 'not-allowed',
            // The answer beside it can run to three lines on a phone; the
            // button keeps its one line instead of being squeezed into two.
            whiteSpace: 'nowrap',
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

      {resultNote && (
        <div role="status" style={{ fontSize: 13, color: '#f9e2af', lineHeight: 1.5 }}>
          {resultNote}
        </div>
      )}

      {result && (
        <div key={checked?.code} className="postr-rise-in" style={panelStyle}>
          {outOfDate && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                color: '#f9e2af',
                background: '#2a2516',
                border: '1px solid #6b5a1e',
                borderRadius: 6,
                padding: '6px 10px',
              }}
            >
              Out of date: this result is from your last check, before the code or the language changed.
            </div>
          )}
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
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="The size the check read from your code">Source</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="What it measures once the figure is scaled onto the poster">Print</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }} title="Postr’s minimum for this element on a poster">Min</th>
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
                <strong style={{ color: '#cdd6f4' }}>At or above the minimum.</strong> Nothing to
                change.
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
                <strong style={{ color: '#cdd6f4' }}>More than 15% below.</strong> Raise it before
                you print.
              </span>
            </div>
            <div style={{ color: '#7f849c', marginTop: 2 }}>
              <strong style={{ color: '#9ca3af' }}>Source</strong> is the size the check read from
              your code. <strong style={{ color: '#9ca3af' }}>Print</strong> is what it measures on
              the poster after the figure is scaled to fit the block, and it is the number compared
              against <strong style={{ color: '#9ca3af' }}>Min</strong>.{' '}
              {/* What the parsers read (readability.ts parseRCode /
                  parsePythonCode). A size set any other way is scored at
                  the inherited size, which can show a 6 pt label as a pass:
                  R `theme(text = element_text(size = 6))`, Python
                  `plt.xlabel(..., fontsize=6)`. */}
              {checkedParams?.language === 'python'
                ? 'It reads font.size in plt.rcParams, seaborn’s context and font_scale, and the sizes given to set_xlabel(), set_ylabel(), set_title() and tick_params(). Check sizes set any other way yourself.'
                : 'It reads base_size and the sizes theme() sets for the elements in this table. Check sizes set any other way, such as on text or title, yourself.'}
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
                    {/* "edited", not "corrected": in R a theme() of the
                        user's own placed after theme_*() still wins over the
                        inserted one (measured: axis.text 7 -> 7 pt), so the
                        copy cannot promise the result is corrected. */}
                    <CopyButton
                      text={fullFixedCode}
                      label="Copy edited code"
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
                    Your script with the sizes above added. Copy it whole and run it.{' '}
                    {/* R: applyFontFixes inserts after the LAST theme_*()
                        call, so a later theme() of the user's own still wins
                        for the sizes it sets. Python: the helper raises each
                        listed class at the save (fix 13); "never makes text
                        smaller" was dropped because f03 in fix 13's record
                        prints text below what the script alone draws. */}
                    {checkedParams?.language === 'r'
                      ? 'The new theme() goes right after your theme_*() call, or at the end of the plot when there is none, and sets only the sizes listed. ggplot applies theme calls in order and the last one wins, so if a theme() of your own comes later and sets one of these sizes, change the number there.'
                      : 'A small function raises these elements to at least the sizes listed when the figure is saved, so settings earlier in your script cannot undo it.'}
                  </div>
                </div>
              )}

              {/* SECONDARY: the one-liner. Still offered — some people
                  would rather change one number — it just costs more of
                  the panel. Absent when every element is explicitly
                  overridden, since base_size governs nothing then (FR7). */}
              {result.suggestedBaseSize !== null && result.copySnippet !== null && (
                <details style={{ borderTop: '1px solid #45475a', paddingTop: 10 }}>
                  {/* Python's snippet sets rcParams['font.size'], so the
                      summary names that, not ggplot's base_size. The
                      number is computed from the elements that follow it
                      only, so it can be LOWER than the script's own value
                      (base_size 20 with axis.text set to 7 suggests 18):
                      the note says what it moves, not that it grows. */}
                  <summary style={{ cursor: 'pointer', fontSize: t.tableFontSize, color: '#9ca3af' }}>
                    Or change one number:{' '}
                    {checkedParams?.language === 'python' ? 'font.size' : 'base_size'} ={' '}
                    {result.suggestedBaseSize}
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#7f849c', lineHeight: 1.5 }}>
                      Simpler to paste. It moves every text size that follows{' '}
                      {checkedParams?.language === 'python' ? 'font.size' : 'base_size'}, including
                      the ones already large enough, and leaves the sizes your code sets
                      directly as they are.
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
              Every element in the table meets its minimum at this poster size.
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
        Sends this image to Claude Vision to find the text in it, then
        estimates each text's printed size from its height at the block's
        current dimensions. Useful for plots and tables you imported from
        a PDF or JPG and don't have the source code for.
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
