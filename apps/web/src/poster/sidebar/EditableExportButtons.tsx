/**
 * EditableExportButtons — the "keep editing elsewhere" exports:
 * PowerPoint (.pptx) and LaTeX (.zip).
 *
 * Both writers are pure `PosterDoc → bytes` modules loaded via
 * dynamic import, so fflate/pptxgenjs and the writer code stay out
 * of the editor bundle for users who never export.
 *
 * PowerPoint's 56-inch ceiling is surfaced HERE, before export —
 * silent scaling is how someone prints a 36-inch poster for a
 * 72-inch board. Beyond 112 in the PPTX button is disabled and the
 * copy steers to LaTeX/PDF, which have no size limit.
 *
 * Reads from `usePosterStore` directly (same pattern as
 * PostrExportButton) so the host tab needs no new plumbing beyond
 * the citation style used to render the references block.
 */
import { useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import type { CitationStyleKey } from '@/poster/citations';
import { PPTX_MAX_DIMENSION_IN } from '@/export/units';

type ExportKind = 'latex' | 'pptx';

interface ExportState {
  busy: ExportKind | null;
  done: ExportKind | null;
  /** Product-toned notes from the writer (fit approximations etc.). */
  notes: string[];
  failed: boolean;
}

const IDLE: ExportState = { busy: null, done: null, notes: [], failed: false };

function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([buf as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const exportButtonStyle = (
  disabled: boolean,
  done: boolean,
  accent: string,
  border: string,
): React.CSSProperties => ({
  padding: '14px 20px',
  background: '#1a1a26',
  color: done ? '#a6e3a1' : accent,
  border: `1px solid ${done ? '#3a5a3a' : border}`,
  borderRadius: 8,
  cursor: disabled ? 'wait' : 'pointer',
  fontSize: 15,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
  opacity: disabled ? 0.65 : 1,
});

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 6,
  lineHeight: 1.5,
};

export function EditableExportButtons({
  citationStyle,
}: {
  citationStyle: CitationStyleKey;
}) {
  const doc = usePosterStore((s) => s.doc);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const [state, setState] = useState<ExportState>(IDLE);

  // The 56-inch ceiling, surfaced BEFORE export (plan §2 req. 1).
  const overCeiling =
    !!doc &&
    (doc.widthIn > PPTX_MAX_DIMENSION_IN || doc.heightIn > PPTX_MAX_DIMENSION_IN);
  const beyondHalf =
    !!doc &&
    (doc.widthIn > PPTX_MAX_DIMENSION_IN * 2 || doc.heightIn > PPTX_MAX_DIMENSION_IN * 2);

  async function run(kind: ExportKind, job: () => Promise<string[]>) {
    if (!doc || state.busy) return;
    setState({ ...IDLE, busy: kind });
    try {
      const notes = await job();
      setState({ busy: null, done: kind, notes, failed: false });
      setTimeout(() => setState((s) => ({ ...s, done: null })), 2500);
    } catch {
      // House rule: user-facing errors stay generic; details go
      // through the Send Feedback path (console capture).
      setState({ busy: null, done: null, notes: [], failed: true });
    }
  }

  const handlePptx = () =>
    run('pptx', async () => {
      const [{ exportPosterPptx }, { safeFileBaseName }] = await Promise.all([
        import('@/export/pptx/writer'),
        import('@/export/posterContent'),
      ]);
      const { bytes, note, warnings } = await exportPosterPptx(doc!, { citationStyle });
      downloadBytes(
        bytes,
        `${safeFileBaseName(posterTitle)}.pptx`,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
      return note ? [note, ...warnings] : warnings;
    });

  const handleLatex = () =>
    run('latex', async () => {
      const [{ exportPosterLatex }, { safeFileBaseName }] = await Promise.all([
        import('@/export/latex/exportLatex'),
        import('@/export/posterContent'),
      ]);
      const { bytes, warnings } = await exportPosterLatex(doc!, { citationStyle });
      downloadBytes(bytes, `${safeFileBaseName(posterTitle)}-latex.zip`, 'application/zip');
      return warnings;
    });

  return (
    <>
      <button
        onClick={handlePptx}
        disabled={!doc || state.busy !== null || beyondHalf}
        data-postr-export-pptx
        style={exportButtonStyle(
          !doc || state.busy !== null || beyondHalf,
          state.done === 'pptx',
          '#f0a35e',
          '#c46a1f',
        )}
      >
        {state.done === 'pptx'
          ? '✓ Saved'
          : state.busy === 'pptx'
            ? 'Building slides…'
            : '▤ PowerPoint (.pptx)'}
      </button>
      {doc && beyondHalf && (
        <div style={{ ...hintStyle, color: '#fca5a5' }}>
          This poster is {doc.widthIn}×{doc.heightIn} in — too large for
          PowerPoint even at half size (its limit is {PPTX_MAX_DIMENSION_IN} in
          per side). Export LaTeX or PDF instead; neither has a size limit.
        </div>
      )}
      {doc && overCeiling && !beyondHalf && (
        <div style={{ ...hintStyle, color: '#d4b106' }}>
          Your poster is {doc.widthIn}×{doc.heightIn} in. PowerPoint&apos;s
          limit is {PPTX_MAX_DIMENSION_IN} in per side, so this file will be
          exactly half size ({doc.widthIn / 2}×{doc.heightIn / 2} in) —{' '}
          <strong style={{ color: '#e3c520' }}>print at 200%</strong>. The note
          is also written inside the file. For a full-size editable export, use
          LaTeX below.
        </div>
      )}
      {!beyondHalf && (
        <div style={hintStyle}>
          One editable slide — every block stays a real PowerPoint text box,
          image, or table. Also opens in Keynote, Google Slides, and
          LibreOffice.
        </div>
      )}

      <div style={{ height: 10 }} />

      <button
        onClick={handleLatex}
        disabled={!doc || state.busy !== null}
        data-postr-export-latex
        style={exportButtonStyle(
          !doc || state.busy !== null,
          state.done === 'latex',
          '#8ec5ff',
          '#3178c6',
        )}
      >
        {state.done === 'latex'
          ? '✓ Saved'
          : state.busy === 'latex'
            ? 'Writing LaTeX…'
            : '⌨ LaTeX source (.zip)'}
      </button>
      <div style={hintStyle}>
        A compilable <code>poster.tex</code> with your figures and a{' '}
        <code>references.bib</code> — every block keeps its exact position,
        ready to keep editing in Overleaf or any TeX setup. Full size at any
        poster dimension.
      </div>

      {state.notes.length > 0 && (
        <ul
          style={{
            fontSize: 12,
            color: '#d4b106',
            marginTop: 6,
            lineHeight: 1.5,
            paddingLeft: 16,
          }}
        >
          {state.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {state.failed && (
        <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>
          Something went wrong. Try again, or use Send Feedback so we can look
          into it.
        </div>
      )}
    </>
  );
}
