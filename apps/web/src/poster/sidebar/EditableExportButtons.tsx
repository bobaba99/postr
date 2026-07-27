/**
 * EditableExportButtons — the "keep editing elsewhere" exports:
 * LaTeX (.zip) now, PowerPoint (.pptx) alongside it.
 *
 * Both writers are pure `PosterDoc → bytes` modules loaded via
 * dynamic import, so fflate/pptxgenjs and the writer code stay out
 * of the editor bundle for users who never export.
 *
 * Reads from `usePosterStore` directly (same pattern as
 * PostrExportButton) so the host tab needs no new plumbing beyond
 * the citation style used to render the references block.
 */
import { useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import type { CitationStyleKey } from '@/poster/citations';

type ExportKind = 'latex';

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

export function EditableExportButtons({
  citationStyle,
}: {
  citationStyle: CitationStyleKey;
}) {
  const doc = usePosterStore((s) => s.doc);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const [state, setState] = useState<ExportState>(IDLE);

  async function handleLatex() {
    if (!doc || state.busy) return;
    setState({ ...IDLE, busy: 'latex' });
    try {
      const [{ exportPosterLatex }, { safeFileBaseName }] = await Promise.all([
        import('@/export/latex/exportLatex'),
        import('@/export/posterContent'),
      ]);
      const { bytes, warnings } = await exportPosterLatex(doc, { citationStyle });
      downloadBytes(bytes, `${safeFileBaseName(posterTitle)}-latex.zip`, 'application/zip');
      setState({ busy: null, done: 'latex', notes: warnings, failed: false });
      setTimeout(() => setState((s) => ({ ...s, done: null })), 2500);
    } catch {
      // House rule: user-facing errors stay generic; details go
      // through the Send Feedback path (console capture).
      setState({ busy: null, done: null, notes: [], failed: true });
    }
  }

  return (
    <>
      <button
        onClick={handleLatex}
        disabled={!doc || state.busy !== null}
        data-postr-export-latex
        style={{
          padding: '14px 20px',
          background: '#1a1a26',
          color: state.done === 'latex' ? '#a6e3a1' : '#8ec5ff',
          border: `1px solid ${state.done === 'latex' ? '#3a5a3a' : '#3178c6'}`,
          borderRadius: 8,
          cursor: !doc || state.busy ? 'wait' : 'pointer',
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'center',
          width: '100%',
        }}
      >
        {state.done === 'latex'
          ? '✓ Saved'
          : state.busy === 'latex'
            ? 'Writing LaTeX…'
            : '⌨ LaTeX source (.zip)'}
      </button>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        A compilable <code>poster.tex</code> with your figures and a{' '}
        <code>references.bib</code> — every block keeps its exact position, ready
        to keep editing in Overleaf or any TeX setup. Full size at any poster
        dimension.
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
